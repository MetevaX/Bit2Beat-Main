/**
 * Bit2Beat core · image analysis (pure functions over an RGBA pixel buffer).
 *
 * Two analyses, each producing three channels per scan step:
 *   light — Brightness (mean CIE L*, 0–100, perceptually even), Contrast (standard deviation of L*)
 *           and Bright-feature height (L*-weighted vertical centre, % of image height from the bottom).
 *   color — mean Red, Green and Blue (0–255, sRGB).
 *
 * Empty background is ignored: when the picture's border is one flat colour (the black space
 * around a globe, a white page around a chart), pixels of that colour are left out, and a band
 * that is (almost) all background is silent instead of playing the background as data.
 *
 * Three scan paths: 'line' (vertical bands from left to right), 'down' (horizontal bands from
 * top to bottom) and 'radar' (sectors around the centre, starting at 12 o'clock and turning clockwise). Every pixel of a band is used
 * (sub-sampled only above ~4000 pixels per band), not a single column.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).image = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // sRGB → linear lookup table and CIE L* from relative luminance.
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  function lightness(r, g, b) {
    const y = 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
  }

  /** CIELAB (D65) of an sRGB pixel: [L*, a*, b*]. */
  function lab(r, g, b) {
    const R = LIN[r];
    const G = LIN[g];
    const B = LIN[b];
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  /** Chroma C*ab: how colourful a pixel is (0 = grey). Data visualisations encode values in colour. */
  function chroma(r, g, b) {
    const [, a, bb] = lab(r, g, b);
    return Math.hypot(a, bb);
  }

  /**
   * Background colour, if the border of the picture is one flat colour: the median border
   * colour when at least 70 % of border pixels lie within 28 RGB units of it; otherwise null.
   */
  function background(px, w, h) {
    const pts = [];
    const step = Math.max(1, Math.round((w + h) / 400));
    for (let x = 0; x < w; x += step) pts.push((0 * w + x) * 4, ((h - 1) * w + x) * 4);
    for (let y = 0; y < h; y += step) pts.push((y * w + 0) * 4, (y * w + w - 1) * 4);
    if (pts.length < 8) return null;
    const med = (k) => {
      const v = pts.map((i) => px[i + k]).sort((a, b) => a - b);
      return v[v.length >> 1];
    };
    const bg = [med(0), med(1), med(2)];
    const near = pts.filter((i) => isBackground(px, i, bg)).length;
    return near / pts.length >= 0.7 ? bg : null;
  }
  const isBackground = (px, i, bg) => !!bg && (px[i] - bg[0]) ** 2 + (px[i + 1] - bg[1]) ** 2 + (px[i + 2] - bg[2]) ** 2 < 28 * 28;

  /**
   * Colour key: read the data back out of a visualisation through its own colour bar.
   * `ramp` lists colour-bar samples [r, g, b, value]. A pixel is matched to the nearest ramp
   * colour in CIELAB, with lightness down-weighted (wL) because shading and transparency change
   * lightness more than hue; pixels further than `tol` (ΔE) or greyer than `minChroma` are not data.
   * With match 'hue', only the hue angle is compared (for semi-transparent colour ramps).
   * A 32³ lookup table keeps it fast.
   */
  function makeKey({ ramp, wL = 0.5, tol = 18, minChroma = 6, ignore = null, match = 'lab', tolHue = 8 }) {
    const labs = ramp.map(([r, g, b]) => lab(r, g, b));
    const hues = labs.map(([, a, b]) => (Math.atan2(b, a) * 180) / Math.PI);
    const values = ramp.map((e) => e[3]);
    const lut = new Float32Array(32768).fill(NaN);
    const done = new Uint8Array(32768);
    function valueOf(r, g, b) {
      const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (done[q]) return lut[q];
      done[q] = 1;
      const [L, A, B] = lab((r & 248) | 4, (g & 248) | 4, (b & 248) | 4);
      if (Math.hypot(A, B) < minChroma) return NaN;
      if (match === 'hue') {
        // Semi-transparent colour over a dark globe keeps its hue but loses lightness and
        // chroma, so only the hue angle is compared.
        const hue = (Math.atan2(B, A) * 180) / Math.PI;
        let bestH = Infinity;
        let vh = NaN;
        for (let k = 0; k < hues.length; k++) {
          const d = Math.abs(((hue - hues[k] + 540) % 360) - 180);
          if (d < bestH) {
            bestH = d;
            vh = values[k];
          }
        }
        lut[q] = bestH <= tolHue ? vh : NaN;
        return lut[q];
      }
      let best = Infinity;
      let v = NaN;
      for (let k = 0; k < labs.length; k++) {
        const d = (wL * (L - labs[k][0])) ** 2 + (A - labs[k][1]) ** 2 + (B - labs[k][2]) ** 2;
        if (d < best) {
          best = d;
          v = values[k];
        }
      }
      lut[q] = Math.sqrt(best) <= tol ? v : NaN;
      return lut[q];
    }
    return { valueOf, ignore, min: Math.min(...values), max: Math.max(...values) };
  }
  /** True when pixel (x, y) lies in the key's ignored box (e.g. the colour bar drawn on the frame). */
  const ignored = (key, x, y, w, h) => !!key?.ignore && x >= key.ignore[0] * w && x < key.ignore[2] * w && y >= key.ignore[1] * h && y < key.ignore[3] * h;

  /**
   * Keyed statistics of the pixels a visitor reaches: mean data value of the matched pixels and
   * their share (%) of the content. Returns null when there is no content.
   */
  function keyStats(px, w, h, visit, key, bg = null) {
    let n = 0;
    let hit = 0;
    let sum = 0;
    visit((x, y, i) => {
      if (isBackground(px, i, bg) || ignored(key, x, y, w, h)) return;
      n++;
      const v = key.valueOf(px[i], px[i + 1], px[i + 2]);
      if (Number.isNaN(v)) return;
      hit++;
      sum += v;
    });
    if (n < 3) return null;
    return { value: hit >= Math.max(2, n * 0.002) ? sum / hit : null, cover: (hit / n) * 100 };
  }

  /** Visit up to `budget` pixels of a band; `fn(x, y, i)` where i is the RGBA offset. */
  function eachInRect(w, x0, x1, y0, y1, budget, fn) {
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    const stride = Math.max(1, Math.round(Math.sqrt(area / budget)));
    for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) fn(x, y, (y * w + x) * 4);
  }

  /** Statistics of the content pixels a visitor reaches; null when (almost) all of them are background. */
  function bandStats(px, w, h, visit, bg = null) {
    let total = 0;
    let n = 0;
    let sumL = 0;
    let sumL2 = 0;
    let sumW = 0;
    let sumWy = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    visit((x, y, i) => {
      total++;
      if (isBackground(px, i, bg)) return;
      const L = lightness(px[i], px[i + 1], px[i + 2]);
      n++;
      sumL += L;
      sumL2 += L * L;
      const wgt = L * L; // emphasise bright features
      sumW += wgt;
      sumWy += wgt * (1 - y / Math.max(1, h - 1));
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
    });
    if (!n || n < Math.max(3, total * 0.03)) return null;
    const m = sumL / n;
    return {
      brightness: m,
      contrast: Math.sqrt(Math.max(0, sumL2 / n - m * m)),
      height: sumW > 0 ? (sumWy / sumW) * 100 : 50,
      red: r / n,
      green: g / n,
      blue: b / n,
    };
  }

  /** Visitor for step `i` of `n` on the chosen scan path. */
  function bandVisitor(path, w, h, i, n) {
    if (path === 'radar') {
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      // the sweep reaches the corners, so a wide or tall picture is covered completely
      const R = Math.hypot(w, h) / 2;
      const a0 = (i / n) * 2 * Math.PI;
      const a1 = ((i + 1) / n) * 2 * Math.PI;
      return (fn) => {
        const rays = Math.max(6, Math.min(64, Math.ceil(((a1 - a0) * R) / 2)));
        const samples = Math.max(24, Math.min(600, Math.round(R)));
        for (let k = 0; k < rays; k++) {
          const a = a0 + ((k + 0.5) / rays) * (a1 - a0);
          const dx = Math.sin(a);
          const dy = -Math.cos(a);
          for (let s = 0; s < samples; s++) {
            const rr = ((s + 0.5) / samples) * R;
            const x = Math.round(cx + dx * rr);
            const y = Math.round(cy + dy * rr);
            if (x >= 0 && y >= 0 && x < w && y < h) fn(x, y, (y * w + x) * 4);
          }
        }
      };
    }
    if (path === 'down') {
      const y0 = Math.floor((i / n) * h);
      const y1 = Math.max(y0 + 1, Math.floor(((i + 1) / n) * h));
      return (fn) => eachInRect(w, 0, w, y0, y1, 4000, fn);
    }
    const x0 = Math.floor((i / n) * w);
    const x1 = Math.max(x0 + 1, Math.floor(((i + 1) / n) * w));
    return (fn) => eachInRect(w, x0, x1, 0, h, 4000, fn);
  }

  /** Where step `i` of `n` is, in words. */
  function bandLabel(path, i, n) {
    const pct = Math.round(((i + 0.5) / n) * 100);
    return path === 'radar' ? `${Math.round(((i + 0.5) / n) * 360)}°` : path === 'down' ? `${pct}% down` : `${pct}% across`;
  }

  const CHANNELS = {
    light: [
      { key: 'brightness', name: 'Brightness', unit: 'L*', hint: 'Average lightness of the band (CIE L*, 0 = black, 100 = white)' },
      { key: 'contrast', name: 'Detail', unit: 'L* sd', hint: 'How much lightness varies inside the band (texture, edges)' },
      { key: 'height', name: 'Bright-area height', unit: '%', hint: 'Where the bright parts sit, from bottom (0 %) to top (100 %)' },
    ],
    color: [
      { key: 'red', name: 'Red', unit: '0–255', hint: 'Mean red value of the band' },
      { key: 'green', name: 'Green', unit: '0–255', hint: 'Mean green value of the band' },
      { key: 'blue', name: 'Blue', unit: '0–255', hint: 'Mean blue value of the band' },
    ],
  };

  /** Scan an image. Returns { channels: [{name, unit, hint, values}], labels }. */
  function scan(px, w, h, { steps = 48, path = 'line', analysis = 'light', key = null, background: useBg = true } = {}) {
    if (analysis === 'key' && key) return scanKey(px, w, h, { steps, path, key, useBg });
    const defs = CHANNELS[analysis] || CHANNELS.light;
    const cols = defs.map((d) => ({ name: d.name, unit: d.unit, hint: d.hint, values: [] }));
    const bg = useBg ? background(px, w, h) : null;
    for (let i = 0; i < steps; i++) {
      const s = bandStats(px, w, h, bandVisitor(path, w, h, i, steps), bg);
      defs.forEach((d, k) => cols[k].values.push(s ? +s[d.key].toFixed(2) : null));
    }
    const labels = Array.from({ length: steps }, (_, i) =>
      bandLabel(path, i, steps),
    );
    return { channels: cols, labels, background: bg };
  }

  /** Scan with a colour key: the visualisation's own data value per band, and how much of the band shows data. */
  function scanKey(px, w, h, { steps, path, key, useBg = true }) {
    const k = makeKey(key);
    // a data map has no empty background: an even map is data, not a blank page
    const bg = useBg && !key.noBackground ? background(px, w, h) : null;
    const lo = key.min ?? k.min;
    const hi = key.max ?? k.max;
    // minSpan: a few ppm of difference should not sound like the whole colour bar
    const value = { name: key.name, unit: key.unit, minSpan: (hi - lo) / 4, hint: `Read from the picture's colour bar (${lo}–${hi} ${key.unit}).`, values: [] };
    const cover = { name: key.coverName || 'Data shown', unit: '%', minSpan: 10, hint: 'Share of the band that shows data colours.', values: [] };
    for (let i = 0; i < steps; i++) {
      const s = keyStats(px, w, h, bandVisitor(path, w, h, i, steps), k, bg);
      value.values.push(s && s.value != null ? +s.value.toFixed(2) : null);
      cover.values.push(s ? +s.cover.toFixed(1) : null);
    }
    const labels = Array.from({ length: steps }, (_, i) =>
      bandLabel(path, i, steps),
    );
    return { channels: [value, cover], labels, background: bg };
  }

  /** Values under a point (used by the hover pointer): a 2 % square neighbourhood. */
  function probe(px, w, h, nx, ny, analysis = 'light', key = null) {
    const r = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const cx = Math.round(nx * (w - 1));
    const cy = Math.round(ny * (h - 1));
    if (analysis === 'key' && key) {
      // every object has a valueOf: only a prepared key has its own (a raw colour-bar definition is prepared once)
      const k = Object.prototype.hasOwnProperty.call(key, 'valueOf') ? key : (key._prepared ||= makeKey(key));
      const ks = keyStats(px, w, h, (fn) => eachInRect(w, Math.max(0, cx - r), Math.min(w, cx + r + 1), Math.max(0, cy - r), Math.min(h, cy + r + 1), 900, fn), k, key.noBackground ? null : background(px, w, h));
      return ks ? [ks.value, ks.cover] : null;
    }
    const s = bandStats(
      px,
      w,
      h,
      (fn) => eachInRect(w, Math.max(0, cx - r), Math.min(w, cx + r + 1), Math.max(0, cy - r), Math.min(h, cy + r + 1), 900, fn),
      background(px, w, h),
    );
    if (!s) return null;
    const defs = CHANNELS[analysis === 'color' ? 'color' : 'light'];
    // Height at a point is just the point's own height.
    return defs.map((d) => (d.key === 'height' ? (1 - ny) * 100 : s[d.key]));
  }

  return { lightness, lab, chroma, background, isBackground, makeKey, keyStats, ignored, scan, probe, bandLabel, CHANNELS };
});
