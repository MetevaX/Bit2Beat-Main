/**
 * Bit2Beat ui · the three pages: Studio, Story and About the team.
 * Only one page is visible at a time; the player bar stays on Studio and Story (so you can follow
 * a chapter while you read) and hides on About, which also pauses the sound.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$ } = B.dom;
  const PAGES = ['studio', 'story', 'about'];

  /** Returns showPage(page). `redraw` repaints the studio canvases after it becomes visible. */
  function init(app, redraw) {
    let current = 'studio';
    function showPage(page, { focus = true } = {}) {
      if (!PAGES.includes(page)) page = 'studio';
      const from = current;
      current = page;
      PAGES.forEach((p) => ($(p).hidden = p !== page));
      document.querySelector('.transport').hidden = page === 'about';
      document.documentElement.dataset.page = page;
      $$('.topnav-link').forEach((b) => (b.dataset.page === page ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
      if (page === 'about') app.player.pause();
      if (focus) $(page).focus({ preventScroll: true });
      if (from !== page) window.scrollTo(0, 0);
      if (page === 'studio') requestAnimationFrame(redraw);
      if (page === 'story') B.storyView?.show();
      root.dispatchEvent(new CustomEvent('b2b:page', { detail: { page, from } }));
      B.urlState.write(app, page);
    }
    $$('[data-page]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
    app.page = () => current;
    return showPage;
  }

  B.pages = { init, PAGES };
})(typeof self !== 'undefined' ? self : this);
