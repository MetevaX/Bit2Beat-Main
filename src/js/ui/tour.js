/**
 * Bit2Beat ui · Bitty the guide.
 * A spotlight walks through the real controls, one at a time (the words live in data/guide.js).
 * Some steps wait for you to try the control (press Play, open Earth events) and Bitty cheers
 * when you do; “Do it for me” presses it for you. Bitty only reads the page and presses the same
 * buttons you would.
 * - Guide button / G key / Help: “How can I help?” menu (whole studio, one tab, story, keys).
 * - First visit: a friendly hello (one click to skip). ?tour starts the studio tour, ?notour hides it.
 * - First time a tab is opened: a tip on Bitty’s card with “Show me”.
 * Esc closes it; it steps aside while a dialog is open.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, storage, toast, el } = B.dom;
  const { placeBubble, dimRects, clamp } = B.spotlight;
  const { TOURS, TIPS } = B.guide;
  const KEY = 'b2b-tour';

  let app = null;
  let ui = null;
  let tourId = 'studio';
  let steps = TOURS.studio.steps;
  let idx = 0;
  let done = false;
  let lastKey = '';
  let raf = 0;
  let poll = 0;
  let returnFocus = null;

  const reduced = () => !!app?.state.prefs.reduceMotion;
  const remember = (patch) => storage.set(KEY, { ...storage.get(KEY, {}), ...patch });

  function build() {
    const r = document.createElement('div');
    r.className = 'bt-root';
    r.hidden = true;
    r.innerHTML = `<div class="bt-dim" data-d="t"></div><div class="bt-dim" data-d="b"></div><div class="bt-dim" data-d="l"></div><div class="bt-dim" data-d="r"></div><div class="bt-ring"></div>
<div class="bt-bubble" role="dialog" aria-modal="false" aria-labelledby="btTitle" aria-describedby="btText" tabindex="-1">
 <div class="bt-head"><div class="bt-dog"></div><span class="bt-count"></span><button type="button" class="bt-x" aria-label="Close Bitty’s guide">×</button></div>
 <div class="bt-badge-wrap" hidden></div>
 <h2 class="bt-title" id="btTitle"></h2>
 <p class="bt-text" id="btText"></p>
 <p class="bt-done" role="status" hidden></p>
 <div class="bt-menu" hidden></div>
 <p class="bt-note" hidden></p>
 <div class="bt-progress" aria-hidden="true"></div>
 <div class="bt-foot"><button type="button" class="bt-skip link-btn"></button><span class="bt-spacer"></span><button type="button" class="btn bt-show" hidden></button><button type="button" class="btn bt-back">Back</button><button type="button" class="btn btn-primary bt-next">Next</button></div>
</div>`;
    document.body.append(r);
    const q = (s) => r.querySelector(s);
    ui = {
      root: r,
      bubble: q('.bt-bubble'),
      ring: q('.bt-ring'),
      dims: Object.fromEntries([...r.querySelectorAll('.bt-dim')].map((d) => [d.dataset.d, d])),
      dog: q('.bt-dog'),
      count: q('.bt-count'),
      badge: q('.bt-badge-wrap'),
      title: q('.bt-title'),
      text: q('.bt-text'),
      done: q('.bt-done'),
      menu: q('.bt-menu'),
      note: q('.bt-note'),
      progress: q('.bt-progress'),
      foot: q('.bt-foot'),
      skip: q('.bt-skip'),
      show: q('.bt-show'),
      back: q('.bt-back'),
      next: q('.bt-next'),
    };
    q('.bt-x').onclick = () => exit();
    ui.back.onclick = () => go(idx - 1);
    ui.next.onclick = () => (idx < steps.length - 1 ? go(idx + 1) : act('close', true));
    ui.skip.onclick = () => (idx === steps.length - 1 && tourId !== 'studio' ? act('hub') : exit());
    ui.show.onclick = () => perform(steps[idx].action);
    r.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        exit();
      }
    });
  }

  // ------------------------------------------------------------------ actions
  /** What a button does. */
  function act(goTo, completed = false) {
    if (goTo === 'next') return go(idx + 1);
    if (goTo === 'hub') return open('hub');
    if (goTo.startsWith('tour:')) return open(goTo.slice(5));
    const finished = completed || tourId === 'studio' && steps[idx]?.id === 'end';
    exit({ completed: finished, quiet: true });
    if (goTo === 'story') app.showPage('story');
    if (goTo === 'help') $('helpDialog').showModal();
  }
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
    ui.done.textContent = '✓ ' + steps[idx].done;
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
  /** Start a tour (or the hello / hub card) from its first step. */
  function open(id) {
    if (!TOURS[id]) id = 'studio';
    tourId = id;
    steps = TOURS[id].steps;
    if (TIPS[id]) remember({ tabs: { ...(storage.get(KEY, {}).tabs || {}), [id]: true } });
    hideTip();
    go(0);
  }

  function go(i) {
    if (!ui) build();
    idx = clamp(i, 0, steps.length - 1);
    const s = steps[idx];
    if (ui.root.hidden) returnFocus = document.activeElement;
    if (app.page() !== 'studio') app.showPage('studio', { focus: false });
    B.speech?.stop();
    done = false;
    lastKey = '';
    ensure(s.ensure);
    const real = steps.filter((x) => !x.hero);
    const n = real.indexOf(s);
    const last = idx === steps.length - 1;
    ui.bubble.classList.toggle('bt-hero', !!s.hero);
    ui.bubble.classList.toggle('bt-has-menu', !!s.menu);
    ui.count.textContent = s.hero ? '' : `${TOURS[tourId].title} · ${n + 1} of ${real.length}`;
    ui.title.textContent = s.title;
    ui.text.textContent = s.text;
    ui.done.hidden = true;
    ui.note.hidden = !s.note;
    ui.note.textContent = s.note || '';
    ui.badge.hidden = !s.badge;
    ui.badge.innerHTML = s.badge ? B.bittyArt.badge(true) : '';
    ui.progress.replaceChildren(...real.map((x, k) => el('i', { class: k <= n ? 'on' : '' })));
    ui.progress.hidden = !!s.hero || real.length < 2;
    // hero cards bring their own buttons; tour steps use Back / Next
    ui.menu.hidden = !s.buttons;
    ui.foot.hidden = !!s.buttons;
    if (s.buttons) {
      ui.menu.replaceChildren(
        ...s.buttons.map((b) =>
          el('button', { type: 'button', class: b.kind === 'link' ? 'link-btn' : 'btn' + (b.kind === 'primary' ? ' btn-primary' : ''), onclick: () => act(b.go) }, b.label),
        ),
      );
    } else {
      ui.skip.textContent = last && tourId !== 'studio' ? 'More from Bitty' : 'Skip';
      ui.show.hidden = !s.action;
      ui.show.textContent = s.action ? s.action.show : '';
      ui.back.hidden = n <= 0;
      ui.next.textContent = last ? 'Done' : 'Next';
      ui.next.classList.remove('bt-attn');
    }
    ui.ring.classList.toggle('bt-live', !!s.interactive);
    ui.root.classList.toggle('bt-still', reduced());
    ui.root.hidden = false;
    document.documentElement.classList.add('bt-touring');
    setDog(s.mood);
    remember({ seen: true });
    reveal();
    layout(true);
    (s.buttons ? ui.menu.querySelector('button') : ui.bubble).focus({ preventScroll: true });
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
    const s = steps[idx];
    const t = s.target && document.querySelector(s.target);
    if (!t || t.closest('.transport, .topbar')) return;
    const r = t.getBoundingClientRect();
    const u = band();
    let delta = 0;
    if (r.height > u.bottom - u.top) delta = r.top - u.top;
    else if (r.top < u.top || r.bottom > u.bottom) delta = r.top - (u.top + (u.bottom - u.top - r.height) / 2);
    if (Math.abs(delta) > 2) scrollBy({ top: delta, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function layout(force) {
    if (!ui || ui.root.hidden) return;
    const s = steps[idx];
    const vp = { w: innerWidth, h: innerHeight, ...band() };
    const t = s.target && document.querySelector(s.target);
    let rect = null;
    if (t) {
      const r = t.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rect = r;
    }
    const size = { w: ui.bubble.offsetWidth, h: ui.bubble.offsetHeight };
    const key = [rect ? [rect.left, rect.top, rect.width, rect.height].map(Math.round).join() : '-', vp.w, vp.h, size.w, size.h].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    const pad = 6;
    const fixed = t && t.closest('.transport, .topbar');
    // keep the hole inside the visible band so a tall panel does not hide under the fixed bars
    const hole = rect ? { x: rect.left - pad, y: Math.max(rect.top - pad, fixed ? -1e4 : vp.top - 4), w: rect.width + pad * 2, h: 0 } : null;
    if (hole) hole.h = Math.min(rect.bottom + pad, fixed ? 1e4 : vp.bottom + 4) - hole.y;
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
      const a = steps[idx].action;
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
    remember({ seen: true, completed: st.completed || completed });
    if (!completed && !quiet && !st.completed) toast('Press Guide (or G) whenever you want Bitty back.', 4000);
    try {
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    } catch {
      /* element gone */
    }
    showTip(app.state.mode);
  }

  // ------------------------------------------------------------------ tips on Bitty's card
  let tipFor = null;
  function hideTip() {
    $('bittyTip').hidden = true;
    tipFor = null;
  }
  /** The first time a tab is opened, Bitty offers to explain it. */
  function showTip(mode) {
    const seen = storage.get(KEY, {}).tabs || {};
    if (!TIPS[mode] || seen[mode] || (ui && !ui.root.hidden) || app.page() !== 'studio') return hideTip();
    tipFor = mode;
    $('bittyTipText').textContent = TIPS[mode];
    $('bittyTip').hidden = false;
  }

  /** `fromUrl.tour`: true = ?tour (studio tour), false = ?notour. */
  function init(a, fromUrl = {}) {
    app = a;
    $('guideFace').innerHTML = B.bittyArt.dog('happy');
    $('guideBtn').onclick = () => open('hub');
    $('helpTour').onclick = () => {
      $('helpDialog').close();
      open('hub');
    };
    $('helpStory').onclick = () => {
      $('helpDialog').close();
      app.showPage('story');
    };
    $('bittyTour').onclick = () => open('hub');
    $('bittyTipBtn').onclick = () => tipFor && open(tipFor);
    $('bittyTipNo').onclick = () => {
      remember({ tabs: { ...(storage.get(KEY, {}).tabs || {}), [tipFor]: true } });
      hideTip();
    };
    root.addEventListener('keydown', (e) => e.key === 'Escape' && ui && !ui.root.hidden && !document.querySelector('dialog[open]') && exit());
    root.addEventListener('b2b:page', (e) => {
      if (e.detail.page !== 'studio' && ui && !ui.root.hidden) exit({ quiet: true });
      if (e.detail.page === 'studio') showTip(app.state.mode);
      else hideTip();
    });
    root.addEventListener('b2b:source', (e) => tipFor !== e.detail.mode && showTip(e.detail.mode));
    const firstVisit = !storage.get(KEY, {}).seen && !root.location?.search;
    if (fromUrl.tour === true) setTimeout(() => open('studio'), 500);
    else if (fromUrl.tour !== false && firstVisit) setTimeout(() => !document.querySelector('dialog[open]') && app.page() === 'studio' && open('hello'), 900);
    else setTimeout(() => showTip(app.state.mode), 600);
  }

  B.tour = { init, open, start: () => open('studio'), hub: () => open('hub'), exit, isOpen: () => !!ui && !ui.root.hidden };
})(typeof self !== 'undefined' ? self : this);
