/**
 * Bit2Beat ui · one video frame of what you hear: the picture or map with its cursor, the melody,
 * what is playing, and the settings. Used by the video export (frames drawn off-screen, step by step)
 * and by Record (drawn live from the canvases on the page).
 *
 * 1920 × 1080 layout (scaled for other sizes):
 *   title and source · main panel (picture | chart, or the source view) · melody roll · caption · settings
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { slug } = B.dom;

  const INK = '#f6f1e7';
  const MUTED = '#a7a39a';
  const AMBER = '#e8a33d';
  const BG = '#0f1115';
  const PANEL = '#191c22';

  const font = (px, weight = 400) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  function fit(g, s, maxW) {
    s = String(s ?? '');
    if (g.measureText(s).width <= maxW) return s;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function rounded(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function cover(g, img, x, y, w, h) {
    const iw = img.videoWidth || img.naturalWidth || img.width;
    const ih = img.videoHeight || img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const R = B.draw.fitRect(iw, ih, w, h);
    g.drawImage(img, x + R.x, y + R.y, R.w, R.h);
  }

  /** Seconds of video for step i (the same rule as the studio's video view). */
  function videoTime(src, i, duration) {
    if (Array.isArray(src.times) && src.times[i] != null) return src.times[i];
    const n = src.labels?.length || 1;
    return ((src.duration || duration || 0) * (i + 0.5)) / n;
  }

  /**
   * @param {object} app
   * @param {{width?:number, height?:number, live?:boolean}} o
   *   live: copy the canvases and video on the page (Record). Otherwise draw off-screen (Export).
   */
  function create(app, { width = 1920, height = 1080, live = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    const k = width / 1920;
    const src = app.src;
    const plan = app.plan;
    const hasPicture = !!(src.videoUrl || src.frames?.length);
    const M = { x: 64, y: 130, w: 1792, h: 640 };
    const pic = hasPicture ? { x: M.x, y: M.y, w: 1040, h: M.h } : null;
    const view = hasPicture ? { x: M.x + 1064, y: M.y, w: M.w - 1064, h: M.h } : M;
    const roll = { x: 64, y: 794, w: 1792, h: 150 };
    const logo = document.querySelector('.brand img');

    // off-screen copies of the studio's canvases, sized like the panels they fill
    let holder = null;
    let viewCanvas = live ? document.getElementById('sourceCanvas') : null;
    let rollCanvas = live ? document.getElementById('pitchCanvas') : null;
    if (!live) {
      holder = document.createElement('div');
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;';
      viewCanvas = document.createElement('canvas');
      viewCanvas.style.cssText = `display:block;width:${Math.round(view.w * 0.6)}px;height:${Math.round(view.h * 0.6)}px`;
      rollCanvas = document.createElement('canvas');
      rollCanvas.style.cssText = `display:block;width:${Math.round(roll.w * 0.6)}px;height:${Math.round(roll.h * 0.6)}px`;
      holder.append(viewCanvas, rollCanvas);
      document.body.append(holder);
    }

    // the picture of a video source (off-screen: a second, hidden video we can seek frame by frame)
    let video = null;
    let frameImgs = null;
    let lastVideoTime = -1;
    let pictureOk = true;
    const ready = (async () => {
      if (!hasPicture || live) return;
      if (src.frames?.length) {
        frameImgs = src.frames.map((u) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.src = u;
          return im;
        });
        await Promise.all(frameImgs.map((im) => im.decode().catch(() => {})));
        return;
      }
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      if (!/^(blob:|data:)/.test(src.videoUrl) && new URL(src.videoUrl, location.href).origin !== location.origin) video.crossOrigin = 'anonymous';
      video.src = src.videoUrl;
      await new Promise((res) => {
        video.onloadeddata = res;
        video.onerror = () => {
          pictureOk = false;
          res();
        };
        setTimeout(res, 15000);
      });
    })();

    /** Seek the hidden video for (fractional) step p; resolves when the frame is there. */
    async function prepare(p) {
      await ready;
      if (!video || !pictureOk) return;
      const i = Math.floor(p);
      const f = p - i;
      const a = videoTime(src, i, video.duration);
      const b = i + 1 < plan.count ? videoTime(src, i + 1, video.duration) : a;
      const t = Math.min(video.duration || a, a + (b - a) * f);
      if (Math.abs(t - lastVideoTime) < 1 / 40) return;
      lastVideoTime = t;
      await new Promise((res) => {
        const done = () => {
          video.removeEventListener('seeked', done);
          res();
        };
        video.addEventListener('seeked', done);
        video.currentTime = t;
        setTimeout(done, 2000);
      });
    }

    function pictureFor(i) {
      if (live) {
        const pv = document.getElementById('framePreview');
        const vv = document.getElementById('videoPreview');
        if (pv && !pv.hidden) return pv;
        // a video from another site without CORS would make the recording unreadable: leave it out
        const own = (u) => /^(blob:|data:)/.test(u) || (u && new URL(u, location.href).origin === location.origin);
        return vv && !vv.hidden && (own(vv.currentSrc) || vv.crossOrigin) ? vv : null;
      }
      if (frameImgs) return frameImgs[Math.max(0, Math.min(frameImgs.length - 1, i))];
      return pictureOk ? video : null;
    }

    function text(s, x, y, px, color, { weight = 400, align = 'left', maxW = 1792 } = {}) {
      g.font = font(px * k, weight);
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = 'alphabetic';
      g.fillText(fit(g, s, maxW * k), x * k, y * k);
    }

    function panel(r, draw) {
      g.save();
      rounded(g, r.x * k, r.y * k, r.w * k, r.h * k, 16 * k);
      g.fillStyle = PANEL;
      g.fill();
      g.clip();
      draw();
      g.restore();
    }

    /** Draw the frame for step i (p: the same with a fraction, for smooth video pictures). */
    function draw(i) {
      if (!plan || !plan.count) return;
      i = Math.max(0, Math.min(plan.count - 1, i | 0));
      g.fillStyle = BG;
      g.fillRect(0, 0, width, height);
      // title
      const lw = 190;
      if (logo?.complete && logo.naturalWidth) {
        try {
          g.drawImage(logo, (1920 - 64 - lw) * k, 40 * k, lw * k, (lw * 41) / 168 * k);
        } catch {
          /* a logo that cannot be drawn is not worth stopping for */
        }
      }
      text(src.name, 64, 74, 38, INK, { weight: 600, maxW: 1792 - lw - 40 });
      const origin = [src.origin?.source, plan.labels[0] != null && plan.count > 1 ? `${plan.labels[0]} – ${plan.labels[plan.count - 1]}` : ''].filter(Boolean).join(' · ');
      text(origin, 64, 110, 22, MUTED, { maxW: 1792 - lw - 40 });
      // main view
      if (pic)
        panel(pic, () => {
          g.fillStyle = '#000';
          g.fillRect(pic.x * k, pic.y * k, pic.w * k, pic.h * k);
          const im = pictureFor(i);
          try {
            if (im) cover(g, im, pic.x * k, pic.y * k, pic.w * k, pic.h * k);
          } catch {
            pictureOk = false;
          }
        });
      if (!live) B.draw.source(viewCanvas, src, plan, i, { scan: app.state.image.scan, pointer: app.state.pointer }, () => {});
      panel(view, () => cover(g, viewCanvas, view.x * k, view.y * k, view.w * k, view.h * k));
      if (!live) B.draw.pitchRoll(rollCanvas, plan, i);
      panel(roll, () => g.drawImage(rollCanvas, roll.x * k, roll.y * k, roll.w * k, roll.h * k));
      // what is playing
      const notes = (plan.steps[i] || []).filter((n) => n.active).map((n) => B.music.noteName(n.midi));
      text(B.panels.stepSummary(app, i), 64, 994, 28, INK, { weight: 500, maxW: 1792 - 420 });
      text(notes.length ? '♪ ' + notes.join('  ') : 'rest', 1856, 994, 28, AMBER, { weight: 600, align: 'right', maxW: 400 });
      const s = plan.settings;
      const inst = document.querySelector('#instrument option:checked')?.textContent || s.instrument || '';
      text([`${s.tempo} BPM`, inst, B.music.SCALES[s.scale]?.name, `step ${i + 1} of ${plan.count}`, 'bit2beat.vercel.app'].filter(Boolean).join('  ·  '), 64, 1040, 20, MUTED);
      // progress
      g.fillStyle = 'rgba(246,241,231,0.12)';
      g.fillRect(0, height - 6 * k, width, 6 * k);
      g.fillStyle = AMBER;
      g.fillRect(0, height - 6 * k, width * ((i + 1) / plan.count), 6 * k);
    }

    function dispose() {
      holder?.remove();
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
    }

    return { canvas, draw, prepare, ready, dispose, hasPicture, get pictureOk() {
      return pictureOk;
    }, name: slug(src.name) };
  }

  B.composer = { create, videoTime };
})(typeof self !== 'undefined' ? self : this);
