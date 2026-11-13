/**
 * Bit2Beat ui · dialogs: export, readings table, full score, sessions, accessibility, help.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$, el, download, slug, storage, toast } = B.dom;
  const { music, stats } = B;

  // ------------------------------------------------------------------ CSV of the plan
  const cell = (v) => {
    const s = String(v ?? '');
    return '"' + (/^[=+@-]/.test(s) && !Number.isFinite(Number(s)) ? "'" : '') + s.replace(/"/g, '""') + '"';
  };
  function planCsv(plan) {
    const rows = [['Step', 'Label', 'Channel', 'Value', 'Unit', 'Note', 'Frequency (Hz)', 'Start (s)', 'X', 'Y', 'Z', 'Playing', 'Sudden jump']];
    for (let i = 0; i < plan.count; i++)
      plan.channels.forEach((c, j) => {
        const n = plan.steps[i].find((x) => x.ch === j);
        rows.push([i + 1, plan.labels[i] ?? '', c.name, c.raw[i] ?? '', c.unit, n ? music.noteName(n.midi) : 'rest', n ? music.freq(n.midi).toFixed(2) : '', plan.times[i].toFixed(3), n?.pos.x ?? '', n?.pos.y ?? '', n?.pos.z ?? '', c.active ? 'yes' : 'no', n?.cue ? 'yes' : '']);
      });
    return rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  /** The readings as an Excel workbook: one row per step, then every note per channel. */
  function planXlsx(plan) {
    const readings = [['Step', 'Label', ...plan.channels.map((c) => c.name + (c.unit ? ` (${c.unit})` : '')), 'Notes', 'Start (s)', 'Detail']];
    for (let i = 0; i < plan.count; i++) {
      const notes = plan.steps[i].filter((n) => n.active).map((n) => music.noteName(n.midi) + (n.cue ? '*' : ''));
      readings.push([i + 1, String(plan.labels[i] ?? ''), ...plan.channels.map((c) => (Number.isFinite(c.raw[i]) ? c.raw[i] : '')), notes.join(' ') || 'rest', +plan.times[i].toFixed(3), plan.details?.[i] || '']);
    }
    const notes = planCsv(plan)
      .split('\r\n')
      .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"').replace(/^'(?=[=+@-])/, '')))
      .map((r, k) => (k ? r.map((v, c) => ([0, 3, 6, 7, 8, 9, 10].includes(c) && v !== '' && Number.isFinite(+v) ? +v : v)) : r));
    const about = [['Bit2Beat readings'], ['Source', plan.source.name], ['From', plan.source.origin?.source || ''], ['Link', plan.source.origin?.url || ''], ['Tempo', `${plan.settings.tempo} BPM, one step = one eighth note`], ['Made', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC']];
    return B.xlsx.workbook([
      { name: 'Readings', rows: readings },
      { name: 'Notes per channel', rows: notes },
      { name: 'About', rows: about },
    ]);
  }

  // ------------------------------------------------------------------ readings table
  function openTable(app) {
    const p = app.plan;
    if (!p) return;
    $('tableHead').replaceChildren(el('tr', {}, el('th', { scope: 'col', text: '#' }), el('th', { scope: 'col', text: 'Label' }), ...p.channels.map((c) => el('th', { scope: 'col', text: c.name + (c.unit ? ` (${c.unit})` : '') })), el('th', { scope: 'col', text: 'Notes' })));
    const limit = Math.min(p.count, 600);
    const rows = [];
    for (let i = 0; i < limit; i++) {
      const notes = p.steps[i].filter((n) => n.active).map((n) => music.noteName(n.midi) + (n.cue ? '*' : ''));
      const tr = el('tr', { tabindex: '0', 'data-step': i }, el('td', { text: String(i + 1) }), el('td', { text: p.labels[i] ?? '' }), ...p.channels.map((c) => el('td', { text: c.raw[i] == null ? '—' : stats.fmtNum(c.raw[i]) })), el('td', { text: notes.join(' ') || 'rest' }));
      tr.onclick = () => app.seek(i, { audition: true });
      tr.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), app.seek(i, { audition: true }));
      rows.push(tr);
    }
    $('tableBody').replaceChildren(...rows);
    $('tableNote').textContent = `${p.count} steps${p.count > limit ? ` (first ${limit} shown; the CSV export has all)` : ''}. Values are ${p.buckets ? 'averages per step' : 'as measured'}; * marks a sudden jump.`;
    $('tableDialog').showModal();
    $('tableBody').children[Math.min(app.state.position, limit - 1)]?.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------------ sessions
  function sessions() {
    return storage.get('b2b-sessions', []);
  }
  function listSessions(app) {
    const list = sessions();
    const ul = $('sessionList');
    ul.replaceChildren();
    if (!list.length) ul.append(el('li', { class: 'empty', text: 'No saved sessions yet.' }));
    list.forEach((s, k) => {
      const load = el('button', { type: 'button', class: 'btn' }, 'Open');
      load.onclick = () => restore(app, s);
      const del = el('button', { type: 'button', class: 'btn btn-quiet', 'aria-label': `Delete ${s.name}` }, 'Delete');
      del.onclick = () => {
        const all = sessions();
        all.splice(k, 1);
        storage.set('b2b-sessions', all);
        listSessions(app);
      };
      ul.append(el('li', {}, el('div', {}, el('b', { text: s.name }), el('small', { text: `${s.sourceName} · ${new Date(s.time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` })), el('span', { class: 'btn-row' }, load, del)));
    });
  }
  function restore(app, s) {
    const st = app.state;
    Object.assign(st.settings, s.settings);
    Object.assign(st.audio, s.audio);
    Object.assign(st.image, s.image);
    Object.assign(st.earth, s.earth);
    app.syncControls();
    $('sessionsDialog').close();
    const after = () => {
      if (Array.isArray(s.mix) && s.mix.length === app.state.mix.length) {
        app.state.mix = s.mix.map((m) => ({ ...m }));
        app.rebuild();
      }
    };
    if (s.custom) {
      const mode = s.custom.kind === 'video' ? 'video' : 'data';
      app.state.choice[mode] = 'custom';
      document.querySelector(`[data-mode="${mode}"]`).click();
      setTimeout(() => {
        app.setSource(s.custom);
        app.fillSourceSelect();
        after();
      }, 0);
    } else {
      app.state.choice[s.mode] = s.choice;
      const tab = document.querySelector(`[data-mode="${s.mode}"]`);
      if (app.state.mode === s.mode) {
        $('sourceSelect').value = s.choice;
        $('sourceSelect').dispatchEvent(new Event('change'));
      } else tab.click();
      setTimeout(after, 400);
    }
    toast(`Opened “${s.name}”.`);
  }

  // ------------------------------------------------------------------ init
  function init(app) {
    $$('dialog').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
      $$('[data-close]', d).forEach((b) => (b.onclick = () => d.close()));
    });

    // export
    Object.entries(B.exporter.FORMATS).forEach(([k, v]) => $('exportFormat').append(new Option(v.label, k)));
    const describe = () => {
      const f = B.exporter.FORMATS[$('exportFormat').value];
      $('exportHint').textContent = f.detail + ($('exportFormat').value === 'adm' ? '. For Dolby Atmos tools such as the Dolby Atmos Renderer, Pro Tools, Logic Pro, Nuendo or DaVinci Resolve. Bit2Beat is not affiliated with Dolby.' : '.');
      $('exportSummary').textContent = `${app.src.name} · ${app.plan.count} steps · ${music.seconds(app.plan.duration)} · ${app.plan.channels.filter((c) => c.active).length} channel(s) on`;
    };
    $('exportFormat').onchange = describe;
    $('exportBtn').onclick = () => {
      // surround and Atmos (ADM) masters are for scientific maps only
      const sci = !!app.src?.science;
      [...$('exportFormat').options].forEach((o) => {
        if (!['5.1', '7.1', '7.1.4', 'adm'].includes(o.value)) return;
        o.dataset.name ||= o.textContent;
        o.disabled = !sci;
        o.textContent = sci ? o.dataset.name : `${o.dataset.name} (scientific maps only)`;
      });
      $('exportFormat').value = B.exporter.FORMATS[app.state.audio.output] && !$('exportFormat').querySelector(`option[value="${app.state.audio.output}"]`)?.disabled ? app.state.audio.output : 'stereo';
      $('exportStatus').textContent = '';
      describe();
      $('exportDialog').showModal();
    };
    $('exportAudio').onclick = async () => {
      const fmt = $('exportFormat').value;
      const btn = $('exportAudio');
      btn.disabled = true;
      app.setExporting(true);
      $('exportStatus').textContent = 'Rendering…';
      await new Promise((r) => setTimeout(r, 30));
      try {
        const res = await B.exporter.render(app.plan, fmt, { ...app.state.audio, mono: app.state.prefs.mono });
        const name = `${slug(app.src.name)}-${fmt === 'adm' ? 'adm-bwf' : fmt.replace(/\./g, '')}.wav`;
        download(new Blob([res.bytes], { type: 'audio/wav' }), name);
        $('exportStatus').textContent = `Saved ${name} (${music.seconds(res.seconds)}${res.objects ? `, ${res.objects} objects` : ''}).`;
      } catch (e) {
        $('exportStatus').textContent = e.message;
      } finally {
        btn.disabled = false;
        app.setExporting(false);
      }
    };
    $('exportCsv').onclick = () => {
      download(new Blob(['﻿' + planCsv(app.plan)], { type: 'text/csv;charset=utf-8' }), slug(app.src.name) + '-notes.csv');
      $('exportStatus').textContent = 'Notes saved as CSV (every step, value, note, frequency and 3D position).';
    };
    $('exportAbc').onclick = () => {
      B.scoreView.downloadAbc(app.plan);
      $('exportStatus').textContent = 'Score saved as ABC notation (opens in MuseScore with an ABC import plugin, or abcjs.net).';
    };

    // table
    $('tableBtn').onclick = () => openTable(app);
    $('tableXlsx').onclick = () => {
      download(new Blob([planXlsx(app.plan)], { type: B.xlsx.MIME }), slug(app.src.name) + '-readings.xlsx');
      toast('Readings saved as an Excel workbook (Readings, Notes per channel, About).');
    };
    $('tableCsv').onclick = () => download(new Blob(['\ufeff' + planCsv(app.plan)], { type: 'text/csv;charset=utf-8' }), slug(app.src.name) + '-notes.csv');

    // score
    $('fullScoreBtn').onclick = () => B.scoreView.open(app.plan, app.state.position);
    $('scorePngBtn').onclick = () => B.scoreView.downloadPng(app.plan, app.state.position);
    const braille = () => {
      const b = B.scoreView.downloadBraille(app.plan);
      const msg = `Braille music saved: ${b.pages} page${b.pages > 1 ? 's' : ''} of BRF, one eighth note per reading, for an embosser or a braille display.`;
      B.dom.announce(msg);
      return msg;
    };
    $('scoreBrailleBtn').onclick = () => B.dom.toast(braille(), 5000);
    $('exportBraille').onclick = () => ($('exportStatus').textContent = braille());
    $('scoreVoices').onchange = () => B.scoreView.paper(app.plan, app.state.position, false);
    $('scorePrev').onclick = () => B.scoreView.turn(app.plan, app.state.position, -1);
    $('scoreNext').onclick = () => B.scoreView.turn(app.plan, app.state.position, 1);

    // sessions
    $('sessionsBtn').onclick = () => {
      $('sessionName').value = app.src?.name || 'My session';
      listSessions(app);
      $('sessionsDialog').showModal();
    };
    $('saveForm').onsubmit = (e) => {
      e.preventDefault();
      const st = app.state;
      const custom = ['data', 'video'].includes(st.mode) && ['custom', 'upload', 'power'].includes(st.choice[st.mode]) ? { ...app.src, videoUrl: undefined } : null;
      const entry = { name: $('sessionName').value.trim() || 'Session', time: Date.now(), mode: st.mode, choice: st.choice[st.mode], sourceName: app.src.name, settings: { ...st.settings }, audio: JSON.parse(JSON.stringify(st.audio)), image: { ...st.image }, earth: { ...st.earth }, mix: st.mix.map((m) => ({ ...m })), custom };
      if (st.mode === 'image' && st.choice.image === 'upload') entry.choice = 'map:world';
      const all = [entry, ...sessions()].slice(0, 20);
      if (!storage.set('b2b-sessions', all)) return toast('Could not save: browser storage is full or blocked.');
      listSessions(app);
      toast('Session saved in this browser.');
    };

    // accessibility
    const prefs = app.state.prefs;
    $$('[data-pref]').forEach((c) => {
      c.checked = !!prefs[c.dataset.pref];
      c.onchange = () => {
        prefs[c.dataset.pref] = c.checked;
        app.applyPrefs();
      };
    });
    $('textSize').value = prefs.textSize;
    $('textSizeOut').textContent = prefs.textSize + '%';
    $('textSize').oninput = (e) => {
      prefs.textSize = +e.target.value;
      $('textSizeOut').textContent = prefs.textSize + '%';
      app.applyPrefs();
    };
    $('accessReset').onclick = () => {
      Object.assign(prefs, { dark: false, contrast: false, textSize: 100, reduceMotion: false, bigTargets: false, mono: false, captions: true, announce: true, pet: true });
      $$('[data-pref]').forEach((c) => (c.checked = !!prefs[c.dataset.pref]));
      $('textSize').value = 100;
      $('textSizeOut').textContent = '100%';
      app.applyPrefs();
    };
    $('accessBtn').onclick = () => $('accessDialog').showModal();
    $('bittyHide').onclick = () => {
      prefs.pet = false;
      $$('[data-pref="pet"]').forEach((c) => (c.checked = false));
      app.applyPrefs();
      toast('Bitty’s card is hidden. Turn it back on in Accessibility; Guide (G) still works.');
    };
    $('helpBtn').onclick = () => $('helpDialog').showModal();
  }

  B.dialogs = { init, openTable, planCsv, planXlsx };
})(typeof self !== 'undefined' ? self : this);
