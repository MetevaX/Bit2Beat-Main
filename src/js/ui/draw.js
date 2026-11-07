/**
 * Bit2Beat ui · canvas drawing (source view, melody roll, stage, spectrum).
 * Pure drawing: every function receives what it needs and touches nothing else.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { fitCanvas, cssVar } = B.dom;

  // Colours are read from CSS once per theme (getComputedStyle on every frame was a hot spot).
  let themeKey = '';
  let themeCache = null;
  const theme = () => {
    const html = document.documentElement;
    const key = (html.dataset.theme || '') + '|' + html.className;
    if (key !== themeKey || !themeCache) {
      themeKey = key;
      themeCache = readTheme();
    }
    return themeCache;
  };
  const readTheme = () => ({
    bg: cssVar('--surface') || '#fbf9f4',
    ink: cssVar('--text') || '#14213d',
    muted: cssVar('--muted') || '#5b6478',
    line: cssVar('--line') || '#ddd3c0',
    grid: cssVar('--grid') || '#ece5d6',
    amber: cssVar('--amber') || '#e8a33d',
    sea: cssVar('--sea') || '#dfe7ee',
    land: cssVar('--land') || '#efe4cc',
    river: cssVar('--river') || '#5b84b1',
  });

  const CHANNEL_COLORS = ['#c47f1f', '#3f5f9e', '#3d8473', '#b4553c', '#7a5c99', '#6c7c35'];
  const colorFor = (j) => CHANNEL_COLORS[j % CHANNEL_COLORS.length];
  const chColor = (plan, j) => plan?.channels[j]?.color || colorFor(j);
  const CATEGORY_COLORS = {
    quake: '#b4553c',
    wildfires: '#c47f1f',
    severeStorms: '#3f5f9e',
    floods: '#3d8473',
    seaLakeIce: '#5f8fb3',
    volcanoes: '#8c3a2b',
    station: '#c47f1f',
  };

  function text(g, s, x, y, { size = 12, color, align = 'left', base = 'alphabetic', weight = 400 } = {}) {
    g.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = base;
    g.fillText(s, x, y);
  }

  /** Area of the canvas used for plotting (leaves room for axis labels). */
  const plotBox = (w, h) => ({ x: 52, y: 16, w: w - 68, h: h - 44 });

  // ---------------------------------------------------------------- source view
  function drawChart(g, w, h, plan, pos, t) {
    const P = plotBox(w, h);
    g.fillStyle = t.bg;
    g.fillRect(0, 0, w, h);
    // grid
    g.strokeStyle = t.grid;
    g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = Math.round(P.y + (P.h * k) / 4) + 0.5;
      g.beginPath();
      g.moveTo(P.x, y);
      g.lineTo(P.x + P.w, y);
      g.stroke();
    }
    const n = plan.count;
    if (!n) return P;
    const xAt = (i) => P.x + (n === 1 ? P.w / 2 : (plan.times[i] / Math.max(1e-6, plan.times[n - 1])) * P.w);
    const lead = plan.channels.find((c) => c.active) || plan.channels[0];
    // y-axis labels (only when every line that is on uses the same scale)
    const on = plan.channels.filter((c) => c.active);
    const same = lead && on.every((c) => c.min === lead.min && c.max === lead.max && c.unit === lead.unit && !c.log);
    if (lead && same && lead.max > lead.min) {
      const fmt = (v) => B.stats.fmtNum(v);
      text(g, fmt(lead.max), P.x - 8, P.y + 4, { size: 11, color: t.muted, align: 'right' });
      text(g, fmt((lead.max + lead.min) / 2), P.x - 8, P.y + P.h / 2 + 4, { size: 11, color: t.muted, align: 'right' });
      text(g, fmt(lead.min), P.x - 8, P.y + P.h + 4, { size: 11, color: t.muted, align: 'right' });
      if (lead.unit) text(g, lead.unit, P.x - 8, P.y - 4, { size: 10, color: t.muted, align: 'right', base: 'bottom' });
    } else if (on.length > 1) {
      g.fillStyle = t.bg;
      g.globalAlpha = 0.85;
      g.fillRect(P.x + 2, P.y + 1, 196, 16);
      g.globalAlpha = 1;
      text(g, 'Each line is drawn on its own scale', P.x + 6, P.y + 13, { size: 11, color: t.muted });
    }
    // x-axis labels
    const L = plan.labels;
    if (L.length) {
      const marks = [0, Math.floor((n - 1) / 2), n - 1];
      marks.forEach((i, k) => text(g, String(L[i] ?? '').split(' – ')[0], xAt(i), h - 8, { size: 11, color: t.muted, align: k === 0 ? 'left' : k === 2 ? 'right' : 'center' }));
    }
    // baseline
    if (plan.drone && lead && lead.max > lead.min) {
      const v = (plan.drone.value - lead.min) / (lead.max - lead.min);
      if (v >= 0 && v <= 1) {
        const y = P.y + (1 - v) * P.h;
        g.setLineDash([5, 5]);
        g.strokeStyle = t.muted;
        g.beginPath();
        g.moveTo(P.x, y);
        g.lineTo(P.x + P.w, y);
        g.stroke();
        g.setLineDash([]);
        text(g, plan.drone.label, P.x + P.w, y - 5, { size: 11, color: t.muted, align: 'right' });
      }
    }
    // series (inactive ones faint, drawn first)
    const order = plan.channels.map((c, j) => j).sort((a, b) => plan.channels[a].active - plan.channels[b].active);
    for (const j of order) {
      const c = plan.channels[j];
      g.strokeStyle = chColor(plan, j);
      g.globalAlpha = c.active ? 1 : 0.22;
      g.lineWidth = c.active ? 2 : 1.25;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) {
        const v = c.loudNorm[i];
        if (v == null) {
          pen = false;
          continue;
        }
        const x = xAt(i);
        const y = P.y + (1 - v) * P.h;
        if (!pen) g.moveTo(x, y);
        else g.lineTo(x, y);
        pen = true;
      }
      g.stroke();
      if (c.active)
        c.anomalies.forEach((i) => {
          const v = c.loudNorm[i];
          if (v == null) return;
          g.beginPath();
          g.arc(xAt(i), P.y + (1 - v) * P.h, 4, 0, Math.PI * 2);
          g.lineWidth = 1.5;
          g.stroke();
        });
      g.globalAlpha = 1;
    }
    // playhead
    const x = xAt(Math.min(pos, n - 1));
    g.strokeStyle = t.amber;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, P.y - 6);
    g.lineTo(x, P.y + P.h);
    g.stroke();
    for (const c of plan.channels) {
      const v = c.loudNorm[pos];
      if (v == null || !c.active) continue;
      g.fillStyle = t.amber;
      g.beginPath();
      g.arc(x, P.y + (1 - v) * P.h, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    return P;
  }

  function fitRect(srcW, srcH, w, h) {
    const k = Math.min(w / srcW, h / srcH);
    const dw = srcW * k;
    const dh = srcH * k;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }

  function drawImage(g, w, h, src, plan, pos, t, ui) {
    g.fillStyle = '#0f1a30';
    g.fillRect(0, 0, w, h);
    const R = fitRect(src.canvas.width, src.canvas.height, w, h);
    g.drawImage(src.canvas, R.x, R.y, R.w, R.h);
    const n = plan.count;
    g.save();
    if (ui.scan === 'pointer') {
      if (ui.pointer) {
        const px = R.x + ui.pointer.x * R.w;
        const py = R.y + ui.pointer.y * R.h;
        g.strokeStyle = t.amber;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(px, py, 12, 0, Math.PI * 2);
        g.moveTo(px - 20, py);
        g.lineTo(px - 6, py);
        g.moveTo(px + 6, py);
        g.lineTo(px + 20, py);
        g.moveTo(px, py - 20);
        g.lineTo(px, py - 6);
        g.moveTo(px, py + 6);
        g.lineTo(px, py + 20);
        g.stroke();
      }
    } else if (ui.scan === 'radar' && n) {
      const cx = R.x + R.w / 2;
      const cy = R.y + R.h / 2;
      const rad = Math.min(R.w, R.h) / 2;
      const a0 = (pos / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((pos + 1) / n) * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = 'rgba(232,163,61,0.28)';
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, rad, a0, a1);
      g.closePath();
      g.fill();
      g.strokeStyle = t.amber;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad);
      g.stroke();
    } else if (n) {
      const b = src.bounds;
      const x0 = b ? R.x + b.x0 * R.w : R.x;
      const span = b ? (b.x1 - b.x0) * R.w : R.w;
      const bx = x0 + (pos / n) * span;
      g.fillStyle = 'rgba(232,163,61,0.22)';
      g.fillRect(bx, R.y, span / n, R.h);
      g.fillStyle = t.amber;
      g.fillRect(bx + span / n / 2 - 1, R.y, 2, R.h);
    }
    g.restore();
    return R;
  }

  let worldImg = null;
  function worldImage(onload) {
    if (!worldImg) {
      worldImg = new Image();
      worldImg.onload = onload;
      worldImg.src = (B.assets && B.assets.worldMap) || 'assets/img/world-map.jpg';
    }
    return worldImg;
  }

  // The world view shows 85° N to 80° S (the rest is open polar sea or ice cap), which lets the
  // map fill wide screens instead of leaving empty bands at the sides.
  const WORLD = { north: 85, south: -80 };
  const WORLD_ASPECT = 360 / (WORLD.north - WORLD.south);
  function projectWorld(lat, lon, R) {
    const la = Math.max(WORLD.south, Math.min(WORLD.north, lat));
    return { x: R.x + ((lon + 180) / 360) * R.w, y: R.y + ((WORLD.north - la) / (WORLD.north - WORLD.south)) * R.h };
  }

  /** 0–1 size of event i (loudness measure, e.g. magnitude), for dot radius. */
  function sizeAt(plan, i) {
    for (const c of plan.channels) if (c.size && c.size[i] != null) return c.size[i];
    return 0.5;
  }

  // The map, its veil and every event as a faint dot are drawn once into an offscreen layer;
  // each frame only copies that layer and adds what has already played. This keeps long
  // event lists smooth while playing.
  let worldLayer = { key: null, canvas: null };
  function worldBase(w, h, R, src, plan, t, redraw) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const img = worldImage(redraw);
    const ready = img.complete && img.naturalWidth > 0;
    const key = [w, h, dpr, ready, themeKey];
    const same = worldLayer.key && worldLayer.src === src && worldLayer.plan === plan && worldLayer.key.every((v, k) => v === key[k]);
    if (same) return worldLayer.canvas;
    const c = worldLayer.canvas || document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = t.sea;
    g.fillRect(0, 0, w, h);
    if (ready) {
      const sy = ((90 - WORLD.north) / 180) * img.naturalHeight;
      const sh = ((WORLD.north - WORLD.south) / 180) * img.naturalHeight;
      g.drawImage(img, 0, sy, img.naturalWidth, sh, R.x, R.y, R.w, R.h);
    }
    g.fillStyle = 'rgba(246,241,231,0.34)'; // light veil keeps dots readable on the photo map
    g.fillRect(R.x, R.y, R.w, R.h);
    // longitude grid every 30°, labelled, so the west → east sweep is easy to follow
    g.strokeStyle = 'rgba(20,33,61,0.16)';
    g.lineWidth = 1;
    const every = R.w < 520 ? 90 : R.w < 900 ? 60 : 30;
    for (let lon = -180 + every; lon < 180; lon += every) {
      const x = Math.round(R.x + ((lon + 180) / 360) * R.w) + 0.5;
      g.beginPath();
      g.moveTo(x, R.y);
      g.lineTo(x, R.y + R.h);
      g.stroke();
      text(g, `${Math.abs(lon)}°${lon < 0 ? 'W' : lon > 0 ? 'E' : ''}`, x + 3, R.y + R.h - 5, { size: 10, color: 'rgba(20,33,61,0.6)' });
    }
    (src.points || []).forEach((p, i) => {
      const { x, y } = projectWorld(p.lat, p.lon, R);
      g.globalAlpha = 0.32;
      g.fillStyle = CATEGORY_COLORS[src.categories?.[i]] || t.amber;
      g.beginPath();
      g.arc(x, y, 3 + sizeAt(plan, i) * 7, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;
    worldLayer = { key, src, plan, canvas: c };
    return c;
  }

  function drawWorld(g, w, h, src, plan, pos, t, redraw) {
    const R = fitRect(WORLD_ASPECT, 1, w, h);
    g.drawImage(worldBase(w, h, R, src, plan, t, redraw), 0, 0, w, h);
    const pts = src.points || [];
    const cur = pts[pos];
    // the sweep: everything west of the playhead has been heard
    if (cur) {
      const sx = R.x + ((cur.lon + 180) / 360) * R.w;
      g.fillStyle = 'rgba(232,163,61,0.10)';
      g.fillRect(R.x, R.y, sx - R.x, R.h);
      g.fillStyle = t.amber;
      g.fillRect(sx - 1, R.y, 2, R.h);
    }
    for (let i = 0; i <= Math.min(pos, pts.length - 1); i++) {
      const p = pts[i];
      const { x, y } = projectWorld(p.lat, p.lon, R);
      g.fillStyle = CATEGORY_COLORS[src.categories?.[i]] || t.amber;
      g.beginPath();
      g.arc(x, y, 3 + sizeAt(plan, i) * 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1;
      g.stroke();
    }
    if (cur) {
      const { x, y } = projectWorld(cur.lat, cur.lon, R);
      g.strokeStyle = t.ink;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 13, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = t.amber;
      g.beginPath();
      g.arc(x, y, 17, 0, Math.PI * 2);
      g.stroke();
    }
    return R;
  }

  /** Draw the source canvas; returns the plotting rectangle for hit-testing. */
  function source(canvas, src, plan, pos, ui, redraw) {
    const { g, w, h } = fitCanvas(canvas);
    const t = theme();
    if (!src || !plan) return null;
    if (src.view === 'image') return { kind: 'image', rect: drawImage(g, w, h, src, plan, pos, t, ui) };
    if (src.view === 'world') return { kind: 'world', rect: drawWorld(g, w, h, src, plan, pos, t, redraw) };
    return { kind: 'chart', rect: drawChart(g, w, h, plan, pos, t) };
  }

  // ---------------------------------------------------------------- melody roll
  let rollLayer = { key: null, canvas: null, xAt: null };
  function pitchRoll(canvas, plan, pos) {
    const { g, w, h } = fitCanvas(canvas);
    const t = theme();
    if (!plan || !plan.count) {
      g.fillStyle = t.bg;
      g.fillRect(0, 0, w, h);
      return;
    }
    const P = { x: 40, y: 8, w: w - 48, h: h - 16 };
    const end = plan.times[plan.count - 1] + plan.noteLen;
    const xAt = (s) => P.x + (s / end) * P.w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = [plan, w, h, dpr, themeKey];
    if (!rollLayer.key || !rollLayer.key.every((v, k) => v === key[k])) {
      const c = rollLayer.canvas || document.createElement('canvas');
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const b = c.getContext('2d');
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = t.bg;
      b.fillRect(0, 0, w, h);
      let lo = Infinity;
      let hi = -Infinity;
      for (const ch of plan.channels)
        for (const m of ch.midi)
          if (m != null) {
            if (m < lo) lo = m;
            if (m > hi) hi = m;
          }
      if (Number.isFinite(lo)) {
        lo -= 1;
        hi += 1;
        const yAt = (m) => P.y + (1 - (m - lo) / Math.max(1, hi - lo)) * P.h;
        for (let m = Math.ceil(lo); m <= hi; m++)
          if (m % 12 === 0) {
            const y = Math.round(yAt(m)) + 0.5;
            b.strokeStyle = t.grid;
            b.beginPath();
            b.moveTo(P.x, y);
            b.lineTo(P.x + P.w, y);
            b.stroke();
            text(b, B.music.noteName(m), P.x - 6, y + 4, { size: 10, color: t.muted, align: 'right' });
          }
        const nh = Math.max(2, Math.min(7, P.h / Math.max(1, hi - lo)));
        const nw = Math.max(1.5, (plan.noteLen / end) * P.w * 0.55);
        plan.channels.forEach((ch, j) => {
          b.fillStyle = chColor(plan, j);
          b.globalAlpha = ch.active ? 0.9 : 0.15;
          ch.midi.forEach((m, i) => {
            if (m == null) return;
            b.fillRect(xAt(plan.times[i]), yAt(m) - nh / 2, nw, nh);
          });
        });
        b.globalAlpha = 1;
      }
      rollLayer = { key, canvas: c };
    }
    g.drawImage(rollLayer.canvas, 0, 0, w, h);
    const x = xAt(plan.times[Math.min(pos, plan.count - 1)]);
    g.fillStyle = t.amber;
    g.fillRect(x - 1, P.y, 2, P.h);
  }

  // ---------------------------------------------------------------- spatial stage (top view)
  function stage(canvas, plan, pos) {
    const { g, w, h } = fitCanvas(canvas, 160);
    const t = theme();
    g.fillStyle = t.bg;
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 14;
    g.strokeStyle = t.line;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    text(g, 'front', cx, cy - r - 3, { size: 10, color: t.muted, align: 'center' });
    text(g, 'L', cx - r - 8, cy + 4, { size: 10, color: t.muted, align: 'center' });
    text(g, 'R', cx + r + 8, cy + 4, { size: 10, color: t.muted, align: 'center' });
    g.fillStyle = t.ink;
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
    const notes = plan?.steps[pos] || [];
    notes.forEach((n) => {
      if (!n.active) return;
      const x = cx + n.pos.x * r * 0.92;
      const y = cy - n.pos.y * r * 0.92;
      g.fillStyle = chColor(plan, n.ch);
      g.beginPath();
      g.arc(x, y, 4 + n.pos.z * 7, 0, Math.PI * 2);
      g.fill();
    });
    text(g, 'larger dot = higher up', w - 6, h - 4, { size: 10, color: t.muted, align: 'right' });
  }

  // ---------------------------------------------------------------- spectrum
  // 36 log-spaced bars from 80 Hz to 3.2 kHz (where the notes and their overtones live).
  // Bars rise instantly and fall smoothly; when sound stops they settle back to a flat line.
  const BARS = 36;
  const heights = new Float32Array(BARS);
  let bins = null;
  let busy = false;
  function spectrum(canvas, analyser, live) {
    const { g, w, h } = fitCanvas(canvas, 48);
    const t = theme();
    g.clearRect(0, 0, w, h);
    const target = new Float32Array(BARS);
    if (live && analyser) {
      if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      const nyq = analyser.context.sampleRate / 2;
      for (let k = 0; k < BARS; k++) {
        const f0 = 80 * (3200 / 80) ** (k / BARS);
        const f1 = 80 * (3200 / 80) ** ((k + 1) / BARS);
        const i0 = Math.floor((f0 / nyq) * bins.length);
        const i1 = Math.max(i0 + 1, Math.ceil((f1 / nyq) * bins.length));
        let m = 0;
        for (let i = i0; i < i1 && i < bins.length; i++) m = Math.max(m, bins[i]);
        target[k] = Math.max(0, (m - 40) / 215); // ignore the analyser's noise floor
      }
    }
    busy = false;
    const onDark = !!canvas.closest('.now');
    const ink = onDark ? '#f6f1e7' : t.ink;
    const gap = 3;
    const bw = (w - gap * (BARS - 1)) / BARS;
    for (let k = 0; k < BARS; k++) {
      heights[k] = target[k] > heights[k] ? target[k] : Math.max(target[k], heights[k] - 0.035);
      if (heights[k] > 0.01) busy = true;
      const bh = Math.max(2, heights[k] * (h - 4));
      const x = k * (bw + gap);
      g.fillStyle = heights[k] > 0.6 || (onDark && heights[k] > 0.3) ? t.amber : ink;
      g.globalAlpha = heights[k] > 0.01 ? 0.9 : onDark ? 0.25 : 0.18;
      g.fillRect(x, h - bh, bw, bh);
    }
    g.globalAlpha = 1;
  }
  const spectrumBusy = () => busy;

  B.draw = { source, pitchRoll, stage, spectrum, spectrumBusy, colorFor, chColor, CATEGORY_COLORS, plotBox, fitRect, projectWorld };
})(typeof self !== 'undefined' ? self : this);
