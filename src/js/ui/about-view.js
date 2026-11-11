/**
 * Bit2Beat ui · the About page comes alive.
 * Every time the page opens, the team lands one by one. Each of us is a note of the pentatonic
 * scale (C D E G A, like in the promo): tap a card's note to hear it. At the end, “Launch the
 * Jukebox” plays a rising run, opens the Studio and starts the music.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$, el } = B.dom;
  const NOTES = [72, 74, 76, 79, 81]; // C5 D5 E5 G5 A5: the major pentatonic scale
  const NAMES = ['C', 'D', 'E', 'G', 'A'];
  const calm = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function init(app) {
    const about = $('about');
    const members = $$('#about .member');
    const pan = (i) => (members.length > 1 ? -0.8 + (1.6 * i) / (members.length - 1) : 0);

    function sing(card, i) {
      app.player.auditionNote(NOTES[i % NOTES.length], 'marimba', 0.9, { x: pan(i), y: 1, z: 0.3 }).catch(() => {});
      card.classList.remove('is-singing');
      void card.offsetWidth; // restart the ring
      card.classList.add('is-singing');
      setTimeout(() => card.classList.remove('is-singing'), 900);
    }

    members.forEach((card, i) => {
      const name = card.querySelector('h3')?.firstChild?.textContent.trim() || 'this member';
      const btn = el(
        'button',
        { type: 'button', class: 'member-note', 'aria-label': `Play ${name}'s note, ${NAMES[i % 5]}`, title: `${name} is the note ${NAMES[i % 5]}` },
        el('span', { class: 'note-eq', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
        NAMES[i % 5],
      );
      btn.onclick = () => sing(card, i);
      card.append(btn);
      // the photo sits in a frame: the frame rings and bounces when the note plays, so the photo's own
      // entrance animation is never restarted (that made it vanish for a moment)
      const img = card.querySelector('img');
      if (img) {
        const frame = el('span', { class: 'member-photo' });
        img.replaceWith(frame);
        frame.append(img);
        frame.addEventListener('click', () => sing(card, i));
      }
    });

    /** Each part lands when it scrolls into view (cards that arrive together come one after another);
     *  opening the page again replays it. */
    const parts = [...$$('#about .team-title'), ...members, $('launchBtn').closest('.launch')];
    let io = null;
    function enter() {
      parts.forEach((p) => p.classList.remove('is-in', 'is-waiting'));
      if (calm() || !root.IntersectionObserver) return parts.forEach((p) => p.classList.add('is-in'));
      io?.disconnect();
      io = new IntersectionObserver(
        (seen) => {
          seen
            .filter((s) => s.isIntersecting)
            .forEach((s, k) => {
              s.target.style.setProperty('--d', k * 0.13 + 's');
              s.target.classList.replace('is-waiting', 'is-in');
              io.unobserve(s.target);
            });
        },
        { threshold: 0.15 },
      );
      parts.forEach((p) => {
        p.classList.add('is-waiting'); // hidden until it lands
        io.observe(p);
      });
    }
    root.addEventListener('b2b:page', (e) => e.detail.page === 'about' && enter());
    if (!about.hidden) enter();

    $('launchBtn').onclick = () => {
      const btn = $('launchBtn');
      if (btn.classList.contains('is-launching')) return;
      [60, 64, 67, 72, 76, 79, 84].forEach((m, k) =>
        setTimeout(() => app.player.auditionNote(m, 'marimba', 0.5, { x: -0.6 + k * 0.2, y: 1, z: 0.3 }).catch(() => {}), calm() ? 0 : k * 70),
      );
      btn.classList.add('is-launching');
      setTimeout(
        () => {
          btn.classList.remove('is-launching');
          app.showPage('studio');
          if (app.src && !app.player.playing) app.play();
        },
        calm() ? 0 : 650,
      );
    };
  }

  B.aboutView = { init, NOTES };
})(typeof self !== 'undefined' ? self : this);
