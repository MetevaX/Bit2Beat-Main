/**
 * Bit2Beat ui · the video picture, kept in step with the music.
 *
 * The studio's Play button drives everything: while the music plays, the (muted) video plays at
 * the speed that keeps the frame on screen equal to the frame being heard, and it is nudged back
 * whenever it drifts by more than a third of a second. When paused or scrubbing, the video shows
 * exactly the sampled frame of the current step. Clicking the picture plays or pauses.
 * A time-lapse source (`frames`: one picture per step, e.g. NASA Earth Information Center maps)
 * shows the picture of the step being heard instead of a video.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $ } = B.dom;

  function init(app) {
    const el = $('videoPreview');
    const box = $('videoBox');
    const pic = $('framePreview');
    let src = null;
    let frames = null;
    let shown = -1;
    let lastSeek = 0;
    pic.addEventListener('click', () => app.play());

    el.muted = true;
    el.addEventListener('click', () => app.play());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') app.play();
    });

    /** Show (or hide) the video for a new source. */
    function show(next) {
      frames = next?.frames?.length ? next.frames : null;
      src = next?.videoUrl || frames ? next : null;
      el.pause();
      box.hidden = !src;
      $('dropZone').classList.toggle('is-timeline', !!src);
      el.hidden = !!frames;
      pic.hidden = !frames;
      shown = -1;
      const chip = box.querySelector('.video-chip');
      if (chip) chip.textContent = frames ? 'NASA maps · follow the music' : 'Muted · follows the music';
      if (frames) {
        // load every picture now, so playback never waits for the network
        frames.forEach((u) => (new Image().src = u));
        el.removeAttribute('src');
        el.load();
        showFrame(0);
      } else if (src) {
        if (el.getAttribute('src') !== src.videoUrl) el.src = src.videoUrl;
      } else {
        el.removeAttribute('src');
        el.load();
      }
    }

    /** Seconds of video for step i. */
    const timeAt = (i) => {
      if (!src) return 0;
      if (Array.isArray(src.times) && src.times[i] != null) return src.times[i];
      const d = src.duration || el.duration || 0;
      const n = src.labels?.length || 1;
      return (d * (i + 0.5)) / n;
    };

    function showFrame(i) {
      const k = Math.max(0, Math.min(frames.length - 1, i));
      if (k === shown) return;
      shown = k;
      pic.src = frames[k];
      pic.alt = `Map ${k + 1} of ${frames.length}: ${src.labels?.[k] || ''}`;
    }

    /** Follow the music at step i. */
    function sync(i, playing) {
      if (frames) return showFrame(i);
      if (!src || !app.plan) return;
      const target = timeAt(i);
      if (!playing) {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
        return;
      }
      const n = app.plan.count;
      const d = src.duration || el.duration || 0;
      // video seconds per music second
      const rate = d && n ? d / n / app.plan.step : 1;
      const r = Math.max(0.25, Math.min(4, rate));
      if (Math.abs(el.playbackRate - r) > 0.01) el.playbackRate = r;
      const now = performance.now();
      if (Math.abs(el.currentTime - target) > 0.35 && now - lastSeek > 250) {
        el.currentTime = target;
        lastSeek = now;
      }
      if (el.paused) el.play().catch(() => {});
    }

    function pause() {
      el.pause();
    }

    /** Tempo that makes the music run in real time with the video (one step per sample). */
    function realTimeTempo(next) {
      const n = next?.labels?.length;
      const d = next?.duration;
      if (!n || !d) return null;
      const step = d / n; // seconds per sample
      return Math.round(Math.max(50, Math.min(200, 60 / (2 * step))));
    }

    return { show, sync, pause, realTimeTempo };
  }

  B.videoView = { init };
})(typeof self !== 'undefined' ? self : this);
