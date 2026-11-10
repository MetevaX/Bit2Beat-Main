/**
 * Bit2Beat ui · Bitty's guided tour of the studio.
 * A spotlight walks through the real controls, one at a time. Some steps wait for you to try the
 * control (press Play, switch to Earth events) and Bitty cheers when you do; “Do it for me” presses
 * it for you. The tour only reads the page and presses the same buttons you would.
 * First visit: a friendly hello (one click to skip). ?tour in the address replays it, ?notour
 * hides it. Esc closes it; it steps aside while a dialog is open.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, storage, toast } = B.dom;
  const { placeBubble, dimRects, clamp } = B.spotlight;
  const KEY = 'b2b-tour';

  const section = (titleId) => `section[aria-labelledby="${titleId}"]`;
  /** target: CSS selector (null = centred card). interactive: the highlighted control can be used.
   *  action: what trying it means, so Bitty can notice. ensure: the tab to show first. */
  const STEPS = [
    {
      id: 'hello',
      mood: 'excited',
      hero: true,
      title: 'Woof! I’m Bitty.',
      text: 'I’m a space pup with very good ears. Satellites send me Earth’s numbers, but numbers are silent, so Bit2Beat turns them into music. Want a quick look around the studio? It takes about a minute.',
      primary: 'Show me around',
      secondary: 'Read my story instead',
    },
    { id: 'tabs', mood: 'curious', target: '.modes', title: 'Four ways to listen', text: 'Data plays NASA climate series and your own CSV files. Earth events plays earthquakes and natural events across the map. Image turns pictures and satellite views into sound. Video follows NASA animations frame by frame.', ensure: 'data' },
    { id: 'source', mood: 'happy', target: '.source-pick', title: 'Pick a source', text: 'Each tab has its own menu. Everything in it is real data with a source line, and it works offline too. “Open CSV” brings your own numbers.', ensure: 'data' },
    { id: 'chart', mood: 'curious', target: '#sourceCard', title: 'This is what you hear', text: 'Left to right is time. Higher on the chart means a higher note. Hover to read a value; click anywhere to hear that one step.', ensure: 'data' },
    {
      id: 'play',
      mood: 'excited',
      target: '#playBtn',
      interactive: true,
      title: 'Press play, co-pilot',
      text: 'Press the big Play button (or the Space bar). Headphones make it even better.',
      action: { type: 'play', show: 'Play it for me' },
      done: 'Hear that? A whole century of temperature in under a minute.',
      ensure: 'data',
    },
    { id: 'now', mood: 'happy', target: '.card.now', title: 'Now playing', text: 'The navy card says which step is playing, its note, and the real value behind it. The bars dance with the sound.' },
    { id: 'melody', mood: 'curious', target: '.duo', title: 'See it, read it', text: 'Melody shows every note, with the amber line as the playhead. “What the data says” explains the trend in plain words and can read it aloud (D).' },
    { id: 'sound', mood: 'happy', target: section('soundTitle'), title: 'Make it yours', text: 'Change the instrument, scale and tempo, or press Suggest and I’ll pick them from the shape of the data.' },
    { id: 'channels', mood: 'curious', target: section('mixTitle'), title: 'One voice per series', text: 'Every series is its own voice. M mutes it, S plays it alone and ⇅ flips its pitch.' },
    {
      id: 'earth',
      mood: 'excited',
      target: '#tab-earth',
      interactive: true,
      title: 'Earth is busy',
      text: 'Now open Earth events. Earthquakes play as one sweep from west to east: further north sounds higher, stronger sounds louder.',
      action: { type: 'mode', value: 'earth', show: 'Take me there' },
      done: 'See the map? Each dot is a real earthquake, played from west to east.',
    },
    { id: 'export', mood: 'happy', target: '#exportBtn', title: 'Take it home', text: 'Export makes WAV files (stereo, binaural or surround), the notes as CSV and the score. The address bar remembers everything, so a refresh or a shared link opens this exact view.' },
    {
      id: 'end',
      mood: 'joy',
      hero: true,
      badge: true,
      title: 'You’re ready!',
      text: 'That’s the studio. Want to hear what Earth has been telling me? My story plays eight real data sets, one chapter at a time, and you earn the Earth Listener badge at the end.',
      primary: 'Read my story',
      secondary: 'Keep exploring',
    },
  ];

  let app = null;
  let ui = null;
  let idx = 0;
  let done = false;
  let lastKey = '';
  let raf = 0;
  let poll = 0;
  let returnFocus = null;

  const reduced = () => !!app?.state.prefs.reduceMotion;

  function build() {
    const root_ = document.createElement('div');
    root_.className = 'bt-root';
    root_.hidden = true;
    root_.innerHTML = `<div class="bt-dim" data-d="t"></div><div class="bt-dim" data-d="b"></div><div class="bt-dim" data-d="l"></div><div class="bt-dim" data-d="r"></div><div class="bt-ring"></div>
<div class="bt-bubble" role="dialog" aria-modal="false" aria-labelledby="btTitle" aria-describedby="btText" tabindex="-1">
 <div class="bt-head"><div class="bt-dog"></div><span class="bt-count"></span><button type="button" class="bt-x" aria-label="Close the tour">×</button></div>
 <div class="bt-badge-wrap" hidden></div>
 <h2 class="bt-title" id="btTitle"></h2>
 <p class="bt-text" id="btText"></p>
 <p class="bt-done" role="status" hidden></p>
 <div class="bt-progress" aria-hidden="true">${STEPS.map(() => '<i></i>').join('')}</div>
 <div class="bt-foot"><button type="button" class="bt-skip link-btn"></button><span class="bt-spacer"></span><button type="button" class="btn bt-show" hidden></button><button type="button" class="btn bt-back">Back</button><button type="button" class="btn btn-primary bt-next">Next</button></div>
</div>`;
    document.body.append(root_);
    const q = (s) => root_.querySelector(s);
    ui = {
      root: root_,
      bubble: q('.bt-bubble'),
      ring: q('.bt-ring'),
      dims: Object.fromEntries([...root_.querySelectorAll('.bt-dim')].map((d) => [d.dataset.d, d])),
      dog: q('.bt-dog'),
      count: q('.bt-count'),
      badge: q('.bt-badge-wrap'),
      title: q('.bt-title'),
      text: q('.bt-text'),
      done: q('.bt-done'),
      progress: q('.bt-progress'),
      skip: q('.bt-skip'),
      show: q('.bt-show'),
      back: q('.bt-back'),
      next: q('.bt-next'),
    };
    q('.bt-x').onclick = () => exit();
    ui.back.onclick = () => go(idx - 1);
    ui.next.onclick = () => {
      const s = STEPS[idx];
      if (s.id === 'hello' || idx < STEPS.length - 1) return go(idx + 1);
      exit({ completed: true });
      app.showPage('story');
    };
    ui.skip.onclick = () => {
      const s = STEPS[idx];
      if (s.id === 'hello') {
        exit({ quiet: true });
        app.showPage('story');
      } else exit({ completed: s.id === 'end' });
    };
    ui.show.onclick = () => perform(STEPS[idx].action);
    root_.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        exit();
      }
    });
  }

  // ------------------------------------------------------------------ actions
  function ensure(mode) {
    if (mode && app.state.mode !== mode) $('tab-' + mode).click();
  }
  function perform(a) {
    if (!a) return;
    if (a.type === 'play' && !app.player.playing) app.play();
    if (a.type === 'mode') $('tab-' + a.value).click();
  }
  function met(a) {
    if (a.type === 'play') return app.player.playing;
    if (a.type === 'mode') return app.state.mode === a.value;
    return false;
  }
  function markDone() {
    done = true;
    ui.done.textContent = '✓ ' + STEPS[idx].done;
    ui.done.hidden = false;
    ui.show.hidden = true;
    ui.next.classList.add('bt-attn');
    setDog('joy');
  }
  function setDog(mood) {
    ui.dog.innerHTML = B.bittyArt.dog(mood);
    ui.dog.classList.remove('bt-hop');
    if (!reduced()) {
      void ui.dog.offsetWidth;
      ui.dog.classList.add('bt-hop');
    }
  }

  // ------------------------------------------------------------------ steps
  function go(i) {
    if (!ui) build();
    idx = clamp(i, 0, STEPS.length - 1);
    const s = STEPS[idx];
    if (ui.root.hidden) returnFocus = document.activeElement;
    if (app.page() !== 'studio') app.showPage('studio', { focus: false });
    done = false;
    lastKey = '';
    ensure(s.ensure);
    ui.bubble.classList.toggle('bt-hero', !!s.hero);
    ui.count.textContent = s.hero ? '' : `${idx} of ${STEPS.length - 2}`;
    ui.title.textContent = s.title;
    ui.text.textContent = s.text;
    ui.done.hidden = true;
    ui.badge.hidden = !s.badge;
    ui.badge.innerHTML = s.badge ? B.bittyArt.badge(true) : '';
    [...ui.progress.children].forEach((c, n) => c.classList.toggle('on', n <= idx));
    ui.progress.hidden = !!s.hero;
    ui.skip.textContent = s.secondary || 'Skip the tour';
    ui.show.hidden = !s.action;
    ui.show.textContent = s.action ? s.action.show : '';
    ui.back.hidden = idx <= 1 || s.hero;
    ui.next.textContent = s.primary || (idx === STEPS.length - 2 ? 'Finish' : 'Next');
    ui.next.classList.remove('bt-attn');
    ui.ring.classList.toggle('bt-live', !!s.interactive);
    ui.root.classList.toggle('bt-still', reduced());
    ui.root.hidden = false;
    document.documentElement.classList.add('bt-touring');
    setDog(s.mood);
    storage.set(KEY, { ...storage.get(KEY, {}), seen: true });
    reveal();
    layout(true);
    ui.bubble.focus({ preventScroll: true });
    if (s.action && met(s.action) && s.action.type !== 'play') markDone();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /** Free band between the top bar and the player bar. */
  function band() {
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + 8;
    const t = document.querySelector('.transport');
    const bottom = (t && !t.hidden ? t.getBoundingClientRect().top : innerHeight) - 8;
    return { top: Math.max(8, top), bottom: Math.min(innerHeight, bottom) };
  }

  /** Scroll the highlighted control into the free band (fixed bars stay as they are). */
  function reveal() {
    const s = STEPS[idx];
    const el = s.target && document.querySelector(s.target);
    if (!el || el.closest('.transport, .topbar')) return;
    const r = el.getBoundingClientRect();
    const u = band();
    let delta = 0;
    if (r.height > u.bottom - u.top) delta = r.top - u.top;
    else if (r.top < u.top || r.bottom > u.bottom) delta = r.top - (u.top + (u.bottom - u.top - r.height) / 2);
    if (Math.abs(delta) > 2) scrollBy({ top: delta, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function layout(force) {
    if (!ui || ui.root.hidden) return;
    const s = STEPS[idx];
    const vp = { w: innerWidth, h: innerHeight, ...band() };
    const el = s.target && document.querySelector(s.target);
    let rect = null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rect = r;
    }
    const size = { w: ui.bubble.offsetWidth, h: ui.bubble.offsetHeight };
    const key = [rect ? [rect.left, rect.top, rect.width, rect.height].map(Math.round).join() : '-', vp.w, vp.h, size.w, size.h].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    const pad = 6;
    // keep the hole inside the visible band so a tall panel does not hide under the fixed bars
    const hole = rect ? { x: rect.left - pad, y: Math.max(rect.top - pad, el.closest('.transport, .topbar') ? -1e4 : vp.top - 4), w: rect.width + pad * 2, h: 0 } : null;
    if (hole) hole.h = Math.min(rect.bottom + pad, el.closest('.transport, .topbar') ? 1e4 : vp.bottom + 4) - hole.y;
    const d = dimRects(hole, { w: vp.w, h: vp.h });
    for (const k of ['t', 'b', 'l', 'r']) {
      const [x, y, w, h] = d[k];
      Object.assign(ui.dims[k].style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
    }
    ui.ring.hidden = !hole;
    if (hole) Object.assign(ui.ring.style, { left: hole.x + 'px', top: hole.y + 'px', width: hole.w + 'px', height: hole.h + 'px' });
    const box = hole && { left: hole.x, top: hole.y, right: hole.x + hole.w, bottom: hole.y + hole.h, width: hole.w, height: hole.h };
    const p = placeBubble(box, size, vp);
    ui.bubble.dataset.placement = p.placement;
    ui.bubble.style.left = p.x + 'px';
    ui.bubble.style.top = p.y + 'px';
    if (box) {
      ui.bubble.style.setProperty('--caret-x', clamp(box.left + box.width / 2 - p.x, 26, size.w - 26) + 'px');
      ui.bubble.style.setProperty('--caret-y', clamp(box.top + box.height / 2 - p.y, 26, size.h - 26) + 'px');
    }
  }

  function tick(now) {
    raf = 0;
    if (!ui || ui.root.hidden) return;
    const dialogOpen = !!document.querySelector('dialog[open]');
    ui.root.classList.toggle('bt-away', dialogOpen);
    if (!dialogOpen) {
      layout(false);
      const a = STEPS[idx].action;
      if (a && !done && now - poll > 120) {
        poll = now;
        if (met(a)) markDone();
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function exit({ completed = false, quiet = false } = {}) {
    if (!ui || ui.root.hidden) return;
    ui.root.hidden = true;
    document.documentElement.classList.remove('bt-touring');
    cancelAnimationFrame(raf);
    raf = 0;
    const st = storage.get(KEY, {});
    storage.set(KEY, { ...st, seen: true, completed: st.completed || completed });
    if (!completed && !quiet && !st.completed) toast('You can start the tour again from Help or from BitPet.', 4000);
    try {
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    } catch {
      /* element gone */
    }
  }

  /** `fromUrl.tour`: true = ?tour (replay), false = ?notour. */
  function init(a, fromUrl = {}) {
    app = a;
    $('helpTour').onclick = () => {
      $('helpDialog').close();
      start();
    };
    $('helpStory').onclick = () => {
      $('helpDialog').close();
      app.showPage('story');
    };
    $('petTour').onclick = () => start();
    root.addEventListener('keydown', (e) => e.key === 'Escape' && ui && !ui.root.hidden && !document.querySelector('dialog[open]') && exit());
    root.addEventListener('b2b:page', (e) => e.detail.page !== 'studio' && ui && !ui.root.hidden && exit({ completed: STEPS[idx].id === 'end' }));
    const firstVisit = !storage.get(KEY, {}).seen && !root.location?.search;
    if (fromUrl.tour === true) setTimeout(() => go(1), 500);
    else if (fromUrl.tour !== false && firstVisit) setTimeout(() => !document.querySelector('dialog[open]') && app.page() === 'studio' && go(0), 900);
  }

  /** Start from the first real step (the hello card is only for first visits). */
  function start() {
    go(1);
  }

  B.tour = { init, start, go, exit, isOpen: () => !!ui && !ui.root.hidden, STEPS };
})(typeof self !== 'undefined' ? self : this);
