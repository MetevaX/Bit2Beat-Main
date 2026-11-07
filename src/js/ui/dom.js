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
  function toast(msg, ms = 3200) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }
  /** Polite screen-reader announcement. */
  function announce(msg) {
    const n = $('srLive');
    n.textContent = '';
    setTimeout(() => (n.textContent = msg), 30);
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

  (root.Bit2Beat = root.Bit2Beat || {}).dom = { $, $$, el, escapeHTML, toast, announce, download, slug, storage, pressOne, fitCanvas, cssVar };
})(typeof self !== 'undefined' ? self : this);
