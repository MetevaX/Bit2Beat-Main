/**
 * Bit2Beat ui · the Story page: “Bitty listens to Earth”.
 * Each chapter loads a real source into the studio (same player, same plan, same exports), so
 * what the story plays is exactly what the studio plays. Facts are worked out from the numbers
 * being heard (core/story.js). “Play the whole story” moves on by itself when a chapter ends, and
 * Bitty can read each chapter aloud first. Chapters heard are remembered in this browser.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, el, storage, fitCanvas, cssVar, announce, toast } = B.dom;
  const { CHAPTERS, FINALE } = B.story;
  const KEY = 'b2b-story';
  const INKS = ['--text', '--amber', '#4f7cab', '#a3402a', '#488477', '#8a5a12'];

  function init(app) {
    const st = app.state;
    const saved = storage.get(KEY, {});
    const heard = saved.heard || {};
    let auto = false; // playing the whole story
    let active = null; // chapter the studio is showing
    let pendingPlay = null; // chapter waiting for narration to end
    let raf = 0;
    let firstShow = true;
    const rows = {};
    const previews = {};
    const save = () => storage.set(KEY, { heard, narrate: $('storyNarrate').checked });

    // ---------------------------------------------------------------- sources
    /** The source a chapter plays: the studio's own if it is showing it, else an offline copy. */
    function sourceFor(ch) {
      if (isActive(ch) && app.src) return app.src;
      if (previews[ch.id]) return previews[ch.id];
      const { mode, src } = ch.scene;
      try {
        if (mode === 'data') previews[ch.id] = B.presets.DATA[src]();
        else if (mode === 'earth') previews[ch.id] = B.sources.earthOffline(src, src === 'quakes' ? st.earth.quakeFeed : st.earth.eonetDays);
        else if (mode === 'video') previews[ch.id] = B.nasaMedia[src].source;
      } catch {
        previews[ch.id] = null;
      }
      return previews[ch.id];
    }
    const isActive = (ch) => st.mode === ch.scene.mode && st.choice[ch.scene.mode] === ch.scene.src;
    const global = () => sourceFor(CHAPTERS.find((c) => c.id === 'warming'));

    // ---------------------------------------------------------------- page
    $('storyDog').innerHTML = B.bittyArt.dog('excited', 'bitty-hero');
    $('storyNarrate').checked = !!saved.narrate;
    $('storyNarrate').onchange = save;
    if (!('speechSynthesis' in root)) $('storyNarrate').closest('label').hidden = true;

    CHAPTERS.forEach((ch, i) => {
      const facts = el('ul', { class: 'chapter-facts' });
      const spark = el('canvas', { class: 'chapter-spark', height: '72', role: 'img', 'aria-label': `Shape of the data in “${ch.title}”` });
      const status = el('span', { class: 'chapter-status', role: 'status' });
      const listen = el('button', { type: 'button', class: 'btn btn-primary chapter-play', onclick: () => toggle(ch) }, el('span', { class: 'chapter-play-icon', 'aria-hidden': 'true' }), el('span', { class: 'chapter-play-label', text: 'Listen' }));
      const open = el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => openInStudio(ch) }, 'Open in the studio');
      const origin = el('p', { class: 'chapter-origin' });
      const thumb = ch.scene.mode === 'video' ? el('img', { class: 'chapter-thumb', alt: '', src: B.assets?.[ch.scene.src + 'Image'] || `assets/nasa/${ch.scene.src}.jpg`, loading: 'lazy' }) : null;
      const li = el(
        'li',
        { class: 'chapter', id: 'ch-' + ch.id, 'data-state': 'idle', 'aria-labelledby': `ch-${ch.id}-title` },
        el('span', { class: 'chapter-node', 'aria-hidden': 'true' }),
        el(
          'article',
          { class: 'chapter-card' },
          el('header', {}, el('p', { class: 'chapter-kicker', text: ch.kicker }), el('h2', { id: `ch-${ch.id}-title`, text: ch.title }), el('span', { class: 'chapter-heard', text: 'Heard' })),
          el(
            'div',
            { class: 'chapter-body' },
            el('div', { class: 'chapter-say' }, el('div', { class: 'chapter-dog' }), el('p', { class: 'chapter-bubble', text: ch.text })),
            el(
              'div',
              { class: 'chapter-side' },
              thumb,
              spark,
              el('p', { class: 'chapter-listen' }, el('b', { text: 'Listen for: ' }), ch.listen),
              el('h3', { text: 'From the data' }),
              facts,
              origin,
            ),
          ),
          el('div', { class: 'chapter-actions' }, listen, open, status),
        ),
      );
      li.querySelector('.chapter-dog').innerHTML = B.bittyArt.dog(ch.mood);
      $('storyChapters').append(li);
      rows[ch.id] = { li, facts, spark, status, listen, origin, i };
    });

    $('finaleText').textContent = FINALE.text;
    $('finaleStudio').onclick = () => app.showPage('studio');
    $('finaleCsv').onclick = () => {
      app.showPage('studio');
      if (st.mode !== 'data') $('tab-data').click();
      $('uploadBtn').click();
    };
    $('finaleTour').onclick = () => B.tour.start();
    $('finaleDog').innerHTML = B.bittyArt.dog('joy');

    // ---------------------------------------------------------------- drawing
    function renderFacts(ch) {
      const r = rows[ch.id];
      const src = sourceFor(ch);
      const list = B.story.factsFor(ch.id, src, { global: global() });
      r.facts.replaceChildren(...list.map((f) => el('li', { text: f })));
      const o = src?.origin;
      r.origin.textContent = o ? `${o.source}${o.fetched ? ' · ' + String(o.fetched).slice(0, 10) : ''}${o.live ? ' · live' : o.cached ? ' · saved copy' : ''}` : '';
    }

    function drawSpark(ch) {
      const r = rows[ch.id];
      const src = sourceFor(ch);
      if (!src || !r.spark.clientWidth) return;
      const { g, w, h } = fitCanvas(r.spark, 72);
      g.clearRect(0, 0, w, h);
      const col = (k) => (k.startsWith('--') ? cssVar(k) : k);
      const unmute = ch.scene.unmute || [];
      const earth = src.kind === 'earth';
      const chans = src.channels.filter((c) => earth || !c.mute || unmute.some((n) => c.name.startsWith(n))).slice(0, earth ? 6 : 2);
      const pad = 6;
      g.strokeStyle = col('--grid');
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, h / 2 + 0.5);
      g.lineTo(w, h / 2 + 0.5);
      g.stroke();
      chans.forEach((c, k) => {
        const v = c.values;
        const f = v.filter(Number.isFinite);
        const lo = earth ? -90 : Math.min(...f);
        const hi = earth ? 90 : Math.max(...f);
        const y = (x) => h - pad - ((x - lo) / (hi - lo || 1)) * (h - pad * 2);
        const x = (i) => (v.length < 2 ? w / 2 : (i / (v.length - 1)) * (w - 4) + 2);
        g.fillStyle = g.strokeStyle = col(INKS[k % INKS.length]);
        if (earth) {
          v.forEach((val, i) => Number.isFinite(val) && g.fillRect(x(i) - 1.5, y(val) - 1.5, 3, 3));
        } else {
          g.lineWidth = k ? 1.5 : 2;
          g.beginPath();
          let pen = false;
          v.forEach((val, i) => {
            if (!Number.isFinite(val)) return (pen = false);
            pen ? g.lineTo(x(i), y(val)) : g.moveTo(x(i), y(val));
            pen = true;
          });
          g.stroke();
        }
      });
      // playhead for the chapter that is in the studio
      if (isActive(ch) && app.plan?.count > 1 && (st.position > 0 || app.player.playing)) {
        const px = (Math.min(st.position, app.plan.count - 1) / (app.plan.count - 1)) * (w - 4) + 2;
        g.fillStyle = col('--surface');
        g.globalAlpha = 0.55;
        g.fillRect(px, 0, w - px, h);
        g.globalAlpha = 1;
        g.fillStyle = col('--amber');
        g.fillRect(px - 1, 0, 2, h);
      }
    }

    function syncRows() {
      const playing = app.player.playing;
      active = CHAPTERS.find(isActive) || null;
      CHAPTERS.forEach((ch) => {
        const r = rows[ch.id];
        const on = active === ch;
        const state = pendingPlay === ch ? 'loading' : on && playing ? 'playing' : on ? 'ready' : 'idle';
        r.li.dataset.state = state;
        r.li.classList.toggle('is-heard', !!heard[ch.id]);
        r.li.classList.toggle('is-current', on);
        r.listen.querySelector('.chapter-play-label').textContent = state === 'playing' ? 'Pause' : state === 'loading' ? 'Bitty is reading…' : heard[ch.id] && !on ? 'Listen again' : 'Listen';
        r.listen.setAttribute('aria-label', `${state === 'playing' ? 'Pause' : 'Listen to'} “${ch.title}”`);
        r.status.textContent = on && app.plan ? `${app.plan.count} steps · ${B.music.seconds(app.plan.duration)}` : '';
      });
      const p = B.story.progress(heard);
      $('storyProgress').replaceChildren(
        el('span', { class: 'story-dots', 'aria-hidden': 'true' }, ...CHAPTERS.map((c) => el('i', { class: (heard[c.id] ? 'on' : '') + (active === c ? ' now' : '') }))),
        el('span', { text: p.done ? 'All chapters heard. You earned the badge!' : `${p.n} of ${p.total} chapters heard` }),
      );
      $('storyPlayAll').textContent = auto ? 'Stop the story' : p.n && !p.done ? 'Continue the story' : 'Play the whole story';
      $('storyPlayAll').setAttribute('aria-pressed', String(auto));
      $('finaleBadge').innerHTML = B.bittyArt.badge(p.done) + `<p>${p.done ? 'Earth Listener: you heard every chapter.' : `Hear all ${p.total} chapters to earn this badge (${p.n}/${p.total}).`}</p>`;
    }

    function loop() {
      raf = 0;
      if (app.page?.() !== 'story') return;
      if (active) {
        drawSpark(active);
        if (app.plan && st.position >= app.plan.count * 0.8 && !heard[active.id]) markHeard(active);
      }
      if (app.player.playing) raf = requestAnimationFrame(loop);
    }

    function markHeard(ch) {
      if (heard[ch.id]) return;
      heard[ch.id] = true;
      save();
      syncRows();
      if (B.story.progress(heard).done) {
        toast('You heard every chapter. Bitty gives you the Earth Listener badge!', 5000);
        announce('All chapters heard. You earned the Earth Listener badge.');
      }
    }

    // ---------------------------------------------------------------- playing
    function speak(text, then) {
      if (!$('storyNarrate').checked || !('speechSynthesis' in root)) return then();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      let done = false;
      const go = () => !done && ((done = true), then());
      u.onend = go;
      u.onerror = go;
      speechSynthesis.speak(u);
    }
    const stopSpeech = () => 'speechSynthesis' in root && speechSynthesis.cancel();

    /** Put the chapter's scene in the studio: tab, source, settings and audible channels. */
    function load(ch) {
      const { mode, src, settings, unmute } = ch.scene;
      if (settings) Object.assign(st.settings, settings);
      app.syncControls?.();
      app.persist();
      if (!isActive(ch) || !app.src) app.choose(mode, src);
      else app.rebuild({ keepPosition: false });
      if (unmute && app.src) {
        app.src.channels.forEach((c, j) => unmute.some((n) => c.name.startsWith(n)) && st.mix[j] && (st.mix[j].mute = false));
        app.rebuild();
      }
      app.seek(0);
      renderFacts(ch);
    }

    function listen(ch) {
      pendingPlay = ch; // set first: loading pauses the player, which must not stop the story
      app.player.pause();
      load(ch);
      syncRows();
      speak(`${ch.title}. ${ch.text} Listen for this: ${ch.listen}`, () => {
        if (pendingPlay !== ch) return;
        pendingPlay = null;
        app.play();
      });
    }

    function toggle(ch) {
      if (pendingPlay === ch) {
        pendingPlay = null;
        stopSpeech();
        auto = false;
        return syncRows();
      }
      if (isActive(ch) && app.player.playing) {
        auto = false;
        return app.player.pause();
      }
      if (isActive(ch) && app.src && pendingPlay == null && st.position > 0) return app.play(); // resume
      listen(ch);
    }

    function openInStudio(ch) {
      auto = false;
      stopSpeech();
      pendingPlay = null;
      if (!isActive(ch)) load(ch);
      app.showPage('studio');
    }

    function playAll() {
      if (auto) {
        auto = false;
        pendingPlay = null;
        stopSpeech();
        app.player.pause();
        return syncRows();
      }
      auto = true;
      if (st.audio.loop) $('loopBtn').click(); // a repeating chapter would never end
      const next = CHAPTERS.find((c) => !heard[c.id]) || CHAPTERS[0];
      go(next);
    }

    function go(ch) {
      rows[ch.id].li.scrollIntoView({ behavior: st.prefs.reduceMotion ? 'auto' : 'smooth', block: 'center' });
      listen(ch);
    }

    $('storyPlayAll').onclick = playAll;
    $('storyTourBtn').onclick = () => B.tour.start();

    root.addEventListener('b2b:play', (e) => {
      const { playing, reason } = e.detail;
      if (!playing && reason === 'finished' && active) {
        markHeard(active);
        if (auto) {
          const i = CHAPTERS.indexOf(active);
          const next = CHAPTERS[i + 1];
          if (next) setTimeout(() => auto && go(next), 1200);
          else {
            auto = false;
            $('storyFinale').scrollIntoView({ behavior: st.prefs.reduceMotion ? 'auto' : 'smooth', block: 'center' });
            speak(`${FINALE.title}. ${FINALE.text}`, () => {});
          }
        }
      } else if (!playing && reason !== 'finished' && !pendingPlay) auto = false;
      syncRows();
      if (playing && !raf) raf = requestAnimationFrame(loop);
      if (!playing && active) drawSpark(active);
    });
    root.addEventListener('b2b:source', () => {
      syncRows();
      if (active) {
        renderFacts(active);
        if (app.page?.() === 'story') drawSpark(active);
      }
    });
    root.addEventListener('b2b:page', (e) => {
      if (e.detail.page !== 'story') {
        auto = false;
        if (pendingPlay) stopSpeech();
        pendingPlay = null;
      }
    });
    let resizeTimer = 0;
    root.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => app.page?.() === 'story' && CHAPTERS.forEach(drawSpark), 150);
    });

    /** Called whenever the Story page becomes visible. */
    function show() {
      syncRows();
      CHAPTERS.forEach((ch) => {
        renderFacts(ch);
        drawSpark(ch);
      });
      // after a refresh on the Story page, come back to the chapter that was playing
      if (firstShow && active && /[?&]page=story/.test(root.location.search) && /[?&]t=\d/.test(root.location.search)) rows[active.id].li.scrollIntoView({ block: 'center' });
      firstShow = false;
      if (app.player.playing && !raf) raf = requestAnimationFrame(loop);
    }

    B.storyView.show = show;
    syncRows();
  }

  B.storyView = { init, show: () => {} };
})(typeof self !== 'undefined' ? self : this);
