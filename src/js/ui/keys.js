/**
 * Bit2Beat ui · keyboard shortcuts (Space, ←/→, Shift+←/→, Home/End, L, D, G, T, ?).
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $ } = B.dom;

  function init(app) {
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target.tagName;
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.isContentEditable;
      if (typing && !(tag === 'INPUT' && e.target.type === 'range' && e.code === 'Space')) return;
      if (!$('about').hidden || !$('howto').hidden) return;
      const k = e.key;
      if (e.code === 'Space' && tag !== 'BUTTON') {
        e.preventDefault();
        app.play();
      } else if ((k === 'ArrowRight' || k === 'ArrowLeft') && !e.target.closest('[role="tablist"]') && tag !== 'INPUT') {
        e.preventDefault();
        if (app.player.playing) app.player.pause();
        app.seek(app.state.position + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 8 : 1), { audition: true });
      } else if ((k === 'Home' || k === 'End') && !e.target.closest('[role="tablist"]') && tag !== 'INPUT') {
        e.preventDefault();
        app.seek(k === 'Home' ? 0 : app.plan.count - 1, { audition: true });
      } else if (k === 'l' || k === 'L') $('loopBtn').click();
      else if (k === 'd' || k === 'D') B.panels.speak(app);
      else if (k === 'g' || k === 'G') B.tour.hub();
      else if (k === 't' || k === 'T') B.dialogs.openTable(app);
      else if ((k === 'b' || k === 'B') && app.plan) $('scoreBrailleBtn').click();
      else if (k === '?') $('helpDialog').showModal();
    });
  }

  B.keys = { init };
})(typeof self !== 'undefined' ? self : this);
