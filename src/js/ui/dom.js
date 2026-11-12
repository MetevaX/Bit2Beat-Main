/* Bit2Beat ui · small DOM helpers shared by every view. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

  const escapeHTML = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Create an element: el('button', { class: 'btn', onclick }, 'Text'). */
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) n.append(c);
    return n;
  }

  let toastTimer = null;
  /** A short message; `action` = { label, run } adds a button (for example Undo). */
  function toast(msg, ms = 3200, action = null) {
    const t = $('toast');
    t.replaceChildren(document.createTextNode(msg));
    if (action) {
      const b = el('button', { type: 'button', class: 'toast-action' }, action.label);
      b.onclick = () => {
        t.hidden = true;
        action.run();
      };
      t.append(' ', b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), action ? Math.max(ms, 7000) : ms);
  }
  /**
   * Polite screen-reader announcement. Two live regions take turns (a repeated message is still
   * read), and while a dialog is open the message goes into that dialog: everything outside a
   * modal dialog is inert, so a live region there would stay silent.
   */
  let turn = 0;
  function announce(msg) {
    if (!msg) return;
    const dlg = document.querySelector('dialog[open]');
    let n;
    if (dlg) {
      n = dlg.querySelector('.sr-live') || dlg.appendChild(el('div', { class: 'sr-only sr-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
    } else {
      turn = 1 - turn;
      n = $(turn ? 'srLive' : 'srLive2') || $('srLive');
      const other = $(turn ? 'srLive2' : 'srLive');
      if (other) other.textContent = '';
    }
    n.textContent = '';
    setTimeout(() => (n.textContent = msg), 60);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const slug = (s) =>
    'bit2beat-' +
    (String(s)
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'piece');

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };

  /** Toggle aria-pressed inside a segmented group and return the chosen button. */
  function pressOne(group, btn) {
    $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    return btn;
  }

  /** Canvas sized to its CSS box at device pixel ratio; returns a 2D context in CSS pixels. */
  function fitCanvas(c, cssHeight) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(200, Math.round(c.clientWidth || c.parentElement?.clientWidth || c.width));
    const h = Math.round(cssHeight ?? (c.clientHeight || c.height));
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h };
  }

  /** Read a CSS custom property from :root. */
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------------------------------------------------------------- errors and connection
  // Nothing should fail silently: an unexpected error becomes a short, plain message (at most one
  // every few seconds) and the details go to the console for us. Going offline or online is said too.
  if (typeof window !== 'undefined' && window.addEventListener) {
    let lastError = 0;
    const friendly = (err) => {
      const msg = String(err?.message || err || '');
      if (!msg || /ResizeObserver|Script error|AbortError|The play\(\) request was interrupted/i.test(msg)) return;
      console.error('[Bit2Beat]', err);
      if (Date.now() - lastError < 6000 || !$('toast')) return;
      lastError = Date.now();
      toast(/fetch|network|timed out|reach/i.test(msg) ? 'A data service did not answer. Check your connection, or press Reload.' : 'Something went wrong there. Try again, or press Reload; your settings are kept.', 6000);
    };
    window.addEventListener('error', (e) => friendly(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => friendly(e.reason));
    window.addEventListener('offline', () => toast('You are offline. Saved data, the offline samples and the bundled NASA pictures still work.', 6000));
    window.addEventListener('online', () => toast('Back online. Press Reload for the newest data.', 4000));
  }

  (root.Bit2Beat = root.Bit2Beat || {}).dom = { $, $$, el, escapeHTML, toast, announce, download, slug, storage, pressOne, fitCanvas, cssVar };
})(typeof self !== 'undefined' ? self : this);
