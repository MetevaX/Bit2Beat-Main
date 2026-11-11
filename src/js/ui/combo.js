/**
 * Bit2Beat ui · menus that open in the same place every time, with search.
 * Every <select> gets a button and a list drawn by us: the list opens just below its button
 * (above only when there is clearly more room there), fits the window and scrolls inside.
 * Menus with six or more choices start with a search box. The <select> stays in the page,
 * hidden, as the single source of truth: the rest of the app reads and writes it as before,
 * and choosing in the list fires its usual `input` and `change` events.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const doc = root.document;
  const SEARCH_FROM = 6; // menus with this many choices or more get a search box
  const GAP = 4;
  const MARGIN = 8;
  let uid = 0;
  let open = null; // the menu that is open now (only one at a time)

  const fold = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  /** Which of the select's items match the search text (every word must appear). */
  function matches(text, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const t = fold(text);
    return words.every((w) => t.includes(w));
  }

  /** Where to draw the list: below unless the room below is small and there is more above. */
  function place(btn, wantHeight, view = { w: root.innerWidth, h: root.innerHeight }) {
    const r = btn.getBoundingClientRect();
    const below = view.h - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = below < Math.min(wantHeight, 200) && above > below;
    const room = Math.max(120, up ? above : below);
    return { up, left: r.left, width: r.width, maxHeight: Math.min(room, 380) };
  }

  function enhance(sel) {
    if (sel.dataset.combo || sel.multiple || sel.size > 1) return;
    sel.dataset.combo = '1';
    const id = `combo${++uid}`;
    const name = () => sel.getAttribute('aria-label') || sel.closest('label')?.firstChild?.textContent.trim() || 'Choose';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'combo-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `${id}-list`);
    const label = doc.createElement('span');
    label.className = 'combo-value';
    btn.append(label);
    sel.before(btn);
    sel.classList.add('combo-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const pop = doc.createElement('div');
    pop.className = 'combo-pop';
    pop.id = `${id}-pop`;
    pop.hidden = true;
    const search = doc.createElement('input');
    search.type = 'search';
    search.className = 'combo-search';
    search.placeholder = 'Search…';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-controls', `${id}-list`);
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-autocomplete', 'list');
    const list = doc.createElement('ul');
    list.className = 'combo-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    const none = doc.createElement('p');
    none.className = 'combo-none';
    none.textContent = 'Nothing matches';
    none.hidden = true;
    pop.append(search, list, none);

    let items = []; // { li, opt, group }
    let active = -1;

    function sync() {
      const o = sel.options[sel.selectedIndex];
      label.textContent = o ? o.text : '';
      btn.title = o ? o.text : '';
      btn.setAttribute('aria-label', `${name()}: ${o ? o.text : 'nothing chosen'}`);
      btn.disabled = sel.disabled;
      items.forEach((it) => it.li.setAttribute('aria-selected', String(it.opt === o)));
    }

    function build() {
      list.replaceChildren();
      items = [];
      let n = 0;
      const add = (opt, group) => {
        const li = doc.createElement('li');
        li.id = `${id}-o${n++}`;
        li.className = 'combo-opt';
        li.setAttribute('role', 'option');
        li.textContent = opt.text;
        if (opt.disabled) li.setAttribute('aria-disabled', 'true');
        list.append(li);
        items.push({ li, opt, group });
      };
      [...sel.children].forEach((c) => {
        if (c.tagName === 'OPTGROUP') {
          const h = doc.createElement('li');
          h.className = 'combo-group';
          h.setAttribute('role', 'presentation');
          h.textContent = c.label;
          list.append(h);
          [...c.children].forEach((o) => add(o, h));
        } else if (c.tagName === 'OPTION') add(c, null);
      });
      const typing = doc.activeElement === search;
      search.hidden = sel.options.length < SEARCH_FROM;
      sync();
      if (open?.sel !== sel) return;
      filter();
      if (typing && search.hidden) list.focus({ preventScroll: true }); // refilled with a short list
    }

    const shown = () => items.filter((it) => !it.li.hidden && it.li.getAttribute('aria-disabled') !== 'true');

    function setActive(i, scroll = true) {
      items.forEach((it) => it.li.classList.remove('is-active'));
      active = i;
      const it = items[i];
      const owner = search.hidden ? list : search;
      if (!it) return owner.removeAttribute('aria-activedescendant');
      it.li.classList.add('is-active');
      owner.setAttribute('aria-activedescendant', it.li.id);
      if (scroll) it.li.scrollIntoView({ block: 'nearest' });
    }

    function filter() {
      const q = search.hidden ? '' : search.value;
      const groups = new Set();
      items.forEach((it) => {
        it.li.hidden = !!q && !matches(`${it.opt.text} ${it.group?.textContent || ''}`, q);
        if (!it.li.hidden && it.group) groups.add(it.group);
      });
      list.querySelectorAll('.combo-group').forEach((h) => (h.hidden = !groups.has(h)));
      const vis = shown();
      none.hidden = vis.length > 0;
      if (!vis.includes(items[active])) setActive(items.indexOf(vis[0]));
    }

    function position() {
      if (pop.hidden) return;
      const r = btn.getBoundingClientRect();
      if (r.bottom < 0 || r.top > root.innerHeight) return close(false);
      Object.assign(pop.style, { top: '0px', left: '0px', maxHeight: 'none', minWidth: `${r.width}px` });
      const p = place(btn, pop.scrollHeight);
      pop.style.maxHeight = `${p.maxHeight}px`;
      pop.classList.toggle('is-up', p.up);
      // where 0,0 really is: inside an open dialog "fixed" can be counted from the dialog, not the window
      const probe = doc.createElement('i');
      probe.style.cssText = 'position:fixed;inset:0 auto auto 0;margin:0;padding:0;border:0;width:0;height:0';
      pop.after(probe);
      const o = probe.getBoundingClientRect();
      probe.remove();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const left = Math.max(MARGIN, Math.min(p.left, root.innerWidth - MARGIN - w));
      const top = p.up ? r.top - GAP - h : r.bottom + GAP;
      pop.style.left = `${left - o.left}px`;
      pop.style.top = `${top - o.top}px`;
    }

    /** While open, stay glued to the button: scrolling, a dialog's entrance, or the page moving under it. */
    function follow(last = btn.getBoundingClientRect()) {
      root.requestAnimationFrame(() => {
        if (pop.hidden) return;
        const r = btn.getBoundingClientRect();
        if (r.top !== last.top || r.left !== last.left || r.width !== last.width) position();
        follow(r);
      });
    }

    function show(typed = '') {
      if (btn.disabled) return;
      if (open && open.sel !== sel) open.close(false);
      sel.dispatchEvent(new FocusEvent('focus')); // menus that fill on demand (Earth Information Center) start loading
      (sel.closest('dialog[open]') || doc.body).append(pop);
      build();
      search.value = typed;
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('is-open');
      filter();
      const cur = items.findIndex((it) => it.opt === sel.options[sel.selectedIndex]);
      if (!typed && cur >= 0) setActive(cur);
      position();
      follow();
      (search.hidden ? list : search).focus({ preventScroll: true });
      if (!typed && cur >= 0) items[cur].li.scrollIntoView({ block: 'center' });
      open = { sel, close };
    }

    function close(refocus = true) {
      if (pop.hidden) return;
      pop.hidden = true;
      pop.remove();
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('is-open');
      if (open?.sel === sel) open = null;
      if (refocus) btn.focus({ preventScroll: true });
    }

    function choose(it) {
      if (!it || it.opt.disabled) return;
      const changed = sel.options[sel.selectedIndex] !== it.opt;
      close();
      if (!changed) return;
      sel.selectedIndex = it.opt.index;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function step(by) {
      const vis = shown();
      if (!vis.length) return;
      const at = vis.indexOf(items[active]);
      const next = by === Infinity ? vis.length - 1 : by === -Infinity ? 0 : Math.max(0, Math.min(vis.length - 1, (at < 0 ? -1 : at) + by));
      setActive(items.indexOf(vis[next]));
    }

    function keys(e) {
      const k = e.key;
      const page = Math.max(1, Math.floor(list.clientHeight / 34));
      const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
      if (k in moves) step(moves[k]);
      else if ((k === 'Home' || k === 'End') && (search.hidden || !search.value)) step(k === 'End' ? Infinity : -Infinity);
      else if (k === 'Enter') choose(items[active]);
      else if (k === 'Escape') close();
      else if (k === 'Tab') return close(false);
      else if (search.hidden && k.length === 1 && !e.ctrlKey && !e.metaKey) {
        // short menus: jump to the next choice starting with the typed letter
        const vis = shown();
        const from = vis.indexOf(items[active]);
        const hit = [...vis.slice(from + 1), ...vis.slice(0, from + 1)].find((it) => fold(it.opt.text).startsWith(fold(k)));
        if (hit) setActive(items.indexOf(hit));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }

    btn.addEventListener('click', () => (pop.hidden ? show() : close()));
    btn.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || k === 'F4') show();
      else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) show(sel.options.length >= SEARCH_FROM ? k : '');
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    search.addEventListener('input', filter);
    search.addEventListener('keydown', keys);
    list.addEventListener('keydown', keys);
    list.addEventListener('pointerdown', (e) => e.target.closest('.combo-opt') && e.preventDefault());
    list.addEventListener('click', (e) => choose(items.find((it) => it.li === e.target.closest('.combo-opt'))));
    list.addEventListener('pointermove', (e) => {
      const i = items.findIndex((it) => it.li === e.target.closest('.combo-opt'));
      if (i >= 0 && i !== active) setActive(i, false);
    });
    // focus left the menu (Tab, or a click elsewhere): close; checked a moment later because a refill can move focus inside it
    pop.addEventListener('focusout', () =>
      setTimeout(() => {
        const a = doc.activeElement;
        if (!pop.contains(a) && a !== btn) close(false);
      }),
    );

    // keep the button right when the app refills the menu or sets its value from code
    new MutationObserver(build).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected'] });
    const proto = root.HTMLSelectElement.prototype;
    ['value', 'selectedIndex'].forEach((p) => {
      const d = Object.getOwnPropertyDescriptor(proto, p);
      Object.defineProperty(sel, p, {
        configurable: true,
        get() {
          return d.get.call(this);
        },
        set(v) {
          d.set.call(this, v);
          sync();
        },
      });
    });
    sel.addEventListener('change', sync);
    // a click on the field's label opens the menu, as it did for the native one
    sel.closest('label')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget || (!btn.contains(e.target) && !pop.contains(e.target) && !e.target.closest('button,input,select,a'))) {
        e.preventDefault();
        btn.focus();
      }
    });
    Object.assign(btn, { comboShow: show, comboClose: close, comboPosition: position });
    build();
  }

  function enhanceAll(scope = doc) {
    scope.querySelectorAll('select:not([data-combo])').forEach(enhance);
  }

  function init() {
    enhanceAll();
    // menus made later (the mixer's instrument menus) get the same treatment
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) (n.tagName === 'SELECT' ? enhance(n) : n.querySelector?.('select') && enhanceAll(n));
    }).observe(doc.body, { childList: true, subtree: true });
    doc.addEventListener('pointerdown', (e) => {
      if (open && !e.target.closest('.combo-pop') && !e.target.closest('.combo-btn.is-open')) open.close(false);
    });
    root.addEventListener('resize', () => open && doc.querySelector('.combo-btn.is-open')?.comboPosition());
    doc.addEventListener('close', () => open?.close(false), true); // a dialog closed under an open menu
  }

  B.combo = { init, enhance, enhanceAll, place, matches, SEARCH_FROM };
  if (doc && root.HTMLSelectElement) init();
})(typeof self !== 'undefined' ? self : this);
