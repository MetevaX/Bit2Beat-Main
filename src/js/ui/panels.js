/**
 * Bit2Beat ui · text panels and sound controls:
 * source header, "now playing", data summary, legend, and the Sound / Listening aids /
 * Space & tone settings.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$, el, announce, pressOne, toast } = B.dom;
  const { music, stats } = B;

  // ------------------------------------------------------------------ header
  function renderHeader(app) {
    const s = app.src;
    if (!s) return;
    $('sourceName').textContent = s.name;
    $('trackName').textContent = s.name;
    $('dropZone').dataset.view = s.view;
    const o = s.origin || {};
    const parsed = /^\d{4}-\d\d-\d\dT[\d:.]+Z?$/.test(o.fetched || '') ? new Date(o.fetched) : null;
    const when = parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : o.fetched || '';
    const parts = [o.source, when && (o.live ? 'retrieved ' : 'saved ') + when, o.note].filter(Boolean);
    $('sourceOrigin').textContent = parts.join(' · ');
    $('sourceCredit').hidden = !/^https?:\/\//.test(o.url || '');
    if (!$('sourceCredit').hidden) $('sourceCredit').href = o.url;
    const pill = $('livePill');
    if (s.kind === 'earth' || (s.kind === 'image' && /GIBS/.test(o.source || ''))) {
      pill.hidden = false;
      pill.dataset.state = o.live ? 'live' : 'saved';
      pill.textContent = o.live ? 'Live data' : o.cached ? 'Last live copy' : 'Saved copy';
    } else pill.hidden = true;
    $('sourceCanvas').setAttribute('aria-label', `${s.name}. ${s.view === 'chart' ? 'Line chart' : s.view === 'image' ? 'Picture' : 'Map'} with ${app.plan.count} steps. Use the Readings table or the summary for exact values.`);
  }

  // ------------------------------------------------------------------ step text
  const unitText = (v, unit) => stats.fmtNum(v, unit);

  function stepSummary(app, i) {
    const p = app.plan;
    const parts = [p.labels[i] ?? `Step ${i + 1}`];
    if (p.details[i]) parts.push(p.details[i]);
    else
      p.channels.forEach((c) => {
        if (c.raw[i] == null) return;
        parts.push(`${c.name} ${unitText(c.raw[i], c.unit)}`);
      });
    return parts.join(' · ');
  }

  function renderNow(app, i) {
    const p = app.plan;
    if (!p || !p.count) return;
    const notes = (p.steps[i] || []).filter((n) => n.active);
    const lead = notes[0];
    $('nowStep').textContent = `${p.labels[i] ?? 'Step ' + (i + 1)} · step ${i + 1} of ${p.count}`;
    $('trackStep').textContent = `${i + 1} / ${p.count}`;
    if (lead) {
      $('nowNote').textContent = music.noteName(lead.midi, B.music.SCALES[p.settings.scale]?.flats);
      $('nowHz').textContent = music.freq(lead.midi).toFixed(1) + ' Hz';
    } else {
      $('nowNote').textContent = 'Rest';
      $('nowHz').textContent = '';
    }
    $('nowDetail').textContent = p.details[i] || '';
    const sounding = notes.map((n) => `${p.channels[n.ch].name} ${unitText(n.raw, p.channels[n.ch].unit)} → ${music.noteName(n.midi)}${n.cue ? ' (sudden jump)' : ''}`);
    $('caption').textContent = sounding.length ? sounding.join('; ') + '.' : 'No reading here, so this step is silent.';
  }

  // ------------------------------------------------------------------ insights
  function earthSummary(app) {
    const s = app.src;
    const p = app.plan;
    const out = [];
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
    const span = s.dates?.length ? `${fmt(Math.min(...s.dates))} to ${fmt(Math.max(...s.dates))}` : '';
    if (s.feed === 'quakes') {
      const mags = s.sizes || [];
      const iMax = mags.indexOf(Math.max(...mags));
      out.push(`${mags.length} earthquakes from ${span}, played west to east.`);
      if (iMax >= 0) out.push(`Largest: ${s.details[iMax]}.`);
      const region = (d) => {
        const place = d.split(' · ')[1] || '';
        return (place.split(', ').pop() || place).replace(/ region$/, '');
      };
      const counts = new Map();
      s.details.forEach((d) => counts.set(region(d), (counts.get(region(d)) || 0) + 1));
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
      out.push(`Most active: ${top.map(([r, n]) => `${r} (${n})`).join(', ')}.`);
      out.push('Further north plays higher, bigger quakes play louder, deeper ones sit lower in 3D sound.');
    } else {
      out.push(`${s.labels.length} natural events from ${span}, played west to east.`);
      out.push(s.channels.map((c) => `${c.name}: ${c.values.filter((v) => v != null).length}`).join(' · ') + '.');
      s.channels.forEach((c) => {
        const sizes = (c.loudBy || []).map((v) => (Number.isFinite(v) ? v : -Infinity));
        const i = sizes.indexOf(Math.max(...sizes));
        if (c.sizeUnit && i >= 0 && sizes[i] > -Infinity) out.push(`Largest ${c.name.toLowerCase()}: ${s.details[i]}.`);
      });
      out.push('Each kind of event has its own instrument. Further north plays higher; bigger events play louder.');
    }
    if (p.settings.spacing === 'time') out.push('Map distance is on: gaps in the sound follow the real gaps between events on the map.');
    return out;
  }

  function renderInsights(app) {
    const p = app.plan;
    const box = $('insights');
    box.replaceChildren();
    if (!p || !p.count) return;
    let lines = [];
    if (app.src.kind === 'earth') lines = earthSummary(app);
    else {
      const chans = p.channels.filter((c) => c.active);
      (chans.length ? chans : p.channels.slice(0, 1)).slice(0, 3).forEach((c) => {
        const d = stats.describe({ name: c.name, values: c.raw, labels: p.labels, unit: c.unit, perLabel: app.src.perLabel && !p.buckets ? app.src.perLabel : null, perName: app.src.perName });
        lines.push(...d.sentences);
      });
      if (p.buckets) lines.push(`Played as ${p.count} averaged steps (each step is the mean of about ${Math.round(app.src.channels[0].values.length / p.count)} readings).`);
    }
    box.append(el('ul', {}, lines.map((t) => el('li', { text: t }))));
  }

  /** Read “What the data says” aloud; pressing again (or D) pauses, and again resumes from that word.
   *  Stop is in the reading bar (or Esc). */
  function speak(app) {
    if (B.speech.owner() === 'insights') return B.speech.paused() ? B.speech.resume() : B.speech.pause();
    const text = [...$('insights').querySelectorAll('li')].map((li) => li.textContent).join(' ');
    if (!text) return;
    B.speech.speak(text, { label: `Reading: ${app.src?.name || 'what the data says'}`, owner: 'insights' });
  }

  function renderLegend(app) {
    const box = $('legend');
    box.replaceChildren(
      ...app.plan.channels.map((c, j) =>
        el('span', { class: 'legend-item' + (c.active ? '' : ' is-off') }, el('i', { style: `background:${B.draw.chColor(app.plan, j)}` }), `${c.name}${c.unit ? ' (' + c.unit + ')' : ''}${c.invert ? ' · inverted' : ''}${c.log ? ' · log scale' : ''}`),
      ),
    );
  }

  // ------------------------------------------------------------------ controls
  function init(app) {
    const S = app.state.settings;
    const A = app.state.audio;
    Object.entries(B.audio.instruments).forEach(([k, v]) => $('instrument').append(new Option(v.name, k)));
    Object.entries(music.SCALES).forEach(([k, v]) => $('scale').append(new Option(v.name, k)));
    music.KEYS.forEach((k, i) => $('key').append(new Option(k, String(i))));
    const showMood = () => {
      const mood = music.moodOf(S);
      $$('#moods button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === mood)));
    };
    const sync = () => {
      $('instrument').value = S.instrument;
      $('scale').value = S.scale;
      $('key').value = String(S.key);
      $('range').value = String(S.range);
      $('tempo').value = S.tempo;
      $('tempoOut').textContent = S.tempo + ' BPM';
      showMood();
      $('sharedScale').checked = S.sharedScale;
      $('cues').checked = S.cues;
      $('drone').value = S.drone;
      $('path').value = S.path;
      $('output').value = A.output;
      $('room').value = Math.round(A.room * 100);
      $('roomOut').textContent = Math.round(A.room * 100) + '%';
      ['low', 'mid', 'high'].forEach((b) => {
        const id = 'eq' + b[0].toUpperCase() + b.slice(1);
        $(id).value = A.eq[b];
        $(id + 'Out').textContent = (A.eq[b] > 0 ? '+' : '') + A.eq[b] + ' dB';
      });
    };
    app.syncControls = sync;
    sync();
    const set = (k, v, rebuild = true) => {
      S[k] = v;
      showMood();
      app.persist();
      if (rebuild) app.rebuild();
    };
    $('instrument').onchange = (e) => set('instrument', e.target.value);
    $('scale').onchange = (e) => set('scale', e.target.value);
    $('key').onchange = (e) => set('key', +e.target.value);
    $('range').onchange = (e) => set('range', +e.target.value);
    $('tempo').oninput = (e) => ($('tempoOut').textContent = e.target.value + ' BPM');
    $('tempo').onchange = (e) => set('tempo', +e.target.value);
    $('sharedScale').onchange = (e) => set('sharedScale', e.target.checked);
    $('cues').onchange = (e) => set('cues', e.target.checked);
    $('drone').onchange = (e) => set('drone', e.target.value);
    $('path').onchange = (e) => set('path', e.target.value);
    $('autoTuneBtn').onclick = () => {
      const p = app.plan;
      if (!p) return;
      const norms = p.channels.filter((c) => c.active).map((c) => c.loudNorm);
      const t = stats.autoTune(norms.length ? norms : [p.channels[0].loudNorm]);
      Object.assign(S, { scale: t.scale, tempo: t.tempo, instrument: t.instrument });
      app.state.mix.forEach((m) => (m.instrument = 'inherit'));
      if (app.src.kind === 'earth') app.src.channels.forEach((c, j) => c.instrument && (app.state.mix[j].instrument = c.instrument));
      sync();
      $('autoTuneNote').hidden = false;
      $('autoTuneNote').textContent = t.reason;
      app.persist();
      app.rebuild();
      announce(t.reason);
    };
    // moods: one click sets the whole sound (always pentatonic); any change by hand leaves the mood
    $$('#moods button').forEach((b) => {
      b.onclick = () => {
        const m = music.MOODS[b.dataset.mood];
        Object.assign(S, { scale: m.scale, key: m.key, range: m.range, tempo: m.tempo, instrument: m.instrument });
        app.state.mix.forEach((x) => (x.instrument = 'inherit'));
        A.room = m.room;
        A.eq = { ...music.EQ_PRESETS[m.eq] };
        pressOne($('eqPresets'), $('eqPresets').querySelector(`[data-eq="${m.eq}"]`));
        sync();
        const note = `${m.name}: ${m.hint}.`;
        $('autoTuneNote').hidden = false;
        $('autoTuneNote').textContent = note;
        app.player.refreshRouting();
        app.player.applyMix();
        app.persist();
        app.rebuild();
        announce(note);
      };
    });
    // space & tone
    $('output').onchange = (e) => {
      A.output = e.target.value;
      app.persist();
      app.player.refreshRouting();
      const hw = app.player.context?.destination.maxChannelCount || 2;
      const need = B.spatial.OUTPUTS[A.output]?.channels || 2;
      if (need > 2 && hw < need) toast(`Your device has ${hw} output channels, so ${A.output} is simulated over headphones.`, 4500);
    };
    $('room').oninput = (e) => {
      A.room = +e.target.value / 100;
      $('roomOut').textContent = e.target.value + '%';
      app.player.refreshRouting();
      app.persist();
    };
    const eqInput = (band) => (e) => {
      A.eq[band] = +e.target.value;
      $('eq' + band[0].toUpperCase() + band.slice(1) + 'Out').textContent = (A.eq[band] > 0 ? '+' : '') + A.eq[band] + ' dB';
      $$('#eqPresets button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      app.player.applyMix();
      app.persist();
    };
    $('eqLow').oninput = eqInput('low');
    $('eqMid').oninput = eqInput('mid');
    $('eqHigh').oninput = eqInput('high');
    $$('#eqPresets button').forEach((b) => {
      b.onclick = () => {
        pressOne($('eqPresets'), b);
        A.eq = { ...music.EQ_PRESETS[b.dataset.eq] };
        sync();
        app.player.applyMix();
        app.persist();
      };
    });
    $('speakBtn').onclick = () => speak(app);
    window.addEventListener('b2b:speech', (e) => {
      const on = e.detail.active && e.detail.owner === 'insights';
      $('speakBtn').textContent = !on ? 'Read aloud' : e.detail.paused ? 'Resume reading' : 'Pause reading';
      $('speakBtn').setAttribute('aria-pressed', String(on));
    });
  }

  B.panels = { init, renderHeader, renderNow, renderInsights, renderLegend, stepSummary, speak };
})(typeof self !== 'undefined' ? self : this);
