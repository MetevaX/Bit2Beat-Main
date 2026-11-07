/**
 * Bit2Beat core · image analysis (pure functions over an RGBA pixel buffer).
 *
 * Two analyses, each producing three channels per scan step:
 *   light — Brightness (mean CIE L*, 0–100, perceptually even), Contrast (standard deviation of L*)
 *           and Bright-feature height (L*-weighted vertical centre, % of image height from the bottom).
 *   color — mean Red, Green and Blue (0–255, sRGB).
 *
 * Two scan paths: 'line' (vertical bands from left to right) and 'radar' (sectors around the
 * centre, starting at 12 o'clock and turning clockwise). Every pixel of a band is used
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

  /** Visit up to `budget` pixels of a band; `fn(x, y, i)` where i is the RGBA offset. */
  function eachInRect(w, x0, x1, y0, y1, budget, fn) {
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    const stride = Math.max(1, Math.round(Math.sqrt(area / budget)));
    for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) fn(x, y, (y * w + x) * 4);
  }

  function bandStats(px, w, h, visit) {
    let n = 0;
    let sumL = 0;
    let sumL2 = 0;
    let sumW = 0;
    let sumWy = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    visit((x, y, i) => {
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
    if (!n) return null;
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
      const R = Math.min(w, h) / 2;
      const a0 = (i / n) * 2 * Math.PI;
      const a1 = ((i + 1) / n) * 2 * Math.PI;
      return (fn) => {
        const rays = 6;
        const samples = Math.max(24, Math.round(R));
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
    const x0 = Math.floor((i / n) * w);
    const x1 = Math.max(x0 + 1, Math.floor(((i + 1) / n) * w));
    return (fn) => eachInRect(w, x0, x1, 0, h, 4000, fn);
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
  function scan(px, w, h, { steps = 48, path = 'line', analysis = 'light' } = {}) {
    const defs = CHANNELS[analysis] || CHANNELS.light;
    const cols = defs.map((d) => ({ name: d.name, unit: d.unit, hint: d.hint, values: [] }));
    for (let i = 0; i < steps; i++) {
      const s = bandStats(px, w, h, bandVisitor(path, w, h, i, steps));
      defs.forEach((d, k) => cols[k].values.push(s ? +s[d.key].toFixed(2) : null));
    }
    const labels = Array.from({ length: steps }, (_, i) =>
      path === 'radar' ? `${Math.round(((i + 0.5) / steps) * 360)}°` : `${Math.round(((i + 0.5) / steps) * 100)}% across`,
    );
    return { channels: cols, labels };
  }

  /** Values under a point (used by the hover pointer): a 2 % square neighbourhood. */
  function probe(px, w, h, nx, ny, analysis = 'light') {
    const r = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const cx = Math.round(nx * (w - 1));
    const cy = Math.round(ny * (h - 1));
    const s = bandStats(px, w, h, (fn) =>
      eachInRect(w, Math.max(0, cx - r), Math.min(w, cx + r + 1), Math.max(0, cy - r), Math.min(h, cy + r + 1), 900, fn),
    );
    if (!s) return null;
    const defs = CHANNELS[analysis === 'color' ? 'color' : 'light'];
    // Height at a point is just the point's own height.
    return defs.map((d) => (d.key === 'height' ? (1 - ny) * 100 : s[d.key]));
  }

  return { lightness, scan, probe, CHANNELS };
});
