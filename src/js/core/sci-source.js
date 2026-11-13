/**
 * Bit2Beat core · scientific maps into sound sources (pure, no DOM).
 *
 * A "grid" is what core/science.js returns from map(): { data (Float32Array, NaN = no data),
 * width, height, lat[] (north first) | null, lon[] (west first) | null, time }.
 *
 *   paint(grid)                  → { rgba, lo, hi, diverging, stops } colours for the picture
 *   sweep(grid, opts)            → { labels, channels, points } across the map (west → east, …)
 *   timelapse(frames, opts)      → the same, one step per date
 *   point(series, opts)          → one spot over time
 *   valueAt(grid, u, v)          → { value, lat, lon } under a pointer (u, v in 0…1)
 *
 * Averages are area-weighted (cos latitude) when latitudes are known, so the wide strips near
 * the poles do not count more than the tropics. Missing values stay silent.
 */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const mod = factory(node ? require('./image.js') : root.Bit2Beat.image);
  if (node) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).sciSource = mod;
})(typeof self !== 'undefined' ? self : this, function (image) {
  'use strict';

  // perceptually even, colour-blind safe ramps
  const SEQ = ['#30123b', '#3e378f', '#4562c2', '#3f8ee6', '#25b6c9', '#2fd29b', '#7ee35b', '#c5e33a', '#f4c43a', '#fb8f2b', '#e1501a', '#a51d0a'];
  const DIV = ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const SEQ_RGB = SEQ.map(hex);
  const DIV_RGB = DIV.map(hex);
  const NO_DATA = [128, 128, 128, 60];

  const finite = (data) => {
    const out = [];
    for (const v of data) if (Number.isFinite(v)) out.push(v);
    return out;
  };
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const p = (sorted.length - 1) * q;
    const i = Math.floor(p);
    return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (p - i);
  }

  /** Colour range: 1st–99th percentile, symmetric around zero for data with both signs. */
  function colourRange(data) {
    const s = finite(data).sort((a, b) => a - b);
    if (!s.length) return { lo: 0, hi: 1, diverging: false };
    let lo = quantile(s, 0.01);
    let hi = quantile(s, 0.99);
    if (hi <= lo) [lo, hi] = [s[0], s[s.length - 1]];
    if (hi <= lo) hi = lo + 1;
    const diverging = lo < 0 && hi > 0 && Math.min(-lo, hi) / Math.max(-lo, hi) > 0.25;
    if (diverging) {
      const m = Math.max(-lo, hi);
      [lo, hi] = [-m, m];
    }
    return { lo, hi, diverging };
  }

  function rampColour(ramp, t) {
    const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(x));
    const f = x - i;
    return [0, 1, 2].map((k) => Math.round(ramp[i][k] + (ramp[i + 1][k] - ramp[i][k]) * f));
  }

  /** RGBA pixels for a grid; no data is transparent. */
  function paint(grid, range = colourRange(grid.data)) {
    const { lo, hi, diverging } = range;
    const ramp = diverging ? DIV_RGB : SEQ_RGB;
    const lut = Array.from({ length: 256 }, (_, i) => rampColour(ramp, i / 255));
    const rgba = new Uint8ClampedArray(grid.width * grid.height * 4);
    for (let i = 0; i < grid.data.length; i++) {
      const v = grid.data[i];
      if (!Number.isFinite(v)) {
        rgba.set(NO_DATA, i * 4); // no data: a light grey veil
        continue;
      }
      const c = lut[Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo)) * 255)))];
      rgba.set(c, i * 4);
      rgba[i * 4 + 3] = 255;
    }
    return { rgba, lo, hi, diverging, stops: diverging ? DIV : SEQ };
  }

  const fmtLat = (la) => `${Math.abs(la).toFixed(Math.abs(la) < 10 ? 1 : 0)}° ${la >= 0 ? 'N' : 'S'}`;
  const fmtLon = (lo) => `${Math.abs(lo).toFixed(Math.abs(lo) < 10 ? 1 : 0)}° ${lo >= 0 ? 'E' : 'W'}`;
  const place = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? `${fmtLat(lat)}, ${fmtLon(lon)}` : '');

  /** Latitude and longitude of cell (x, y), or null when the file has no map position. */
  function cellPlace(grid, x, y) {
    if (grid.lat && grid.lon) return { lat: grid.lat[y], lon: grid.lon[x] };
    if (grid.bbox) {
      const [w, s, e, n] = grid.bbox;
      return { lat: n - ((y + 0.5) * (n - s)) / grid.height, lon: w + ((x + 0.5) * (e - w)) / grid.width };
    }
    return null;
  }
  const weightOf = (grid) => {
    const w = new Float32Array(grid.height).fill(1);
    for (let y = 0; y < grid.height; y++) {
      const p = cellPlace(grid, 0, y);
      if (p && Number.isFinite(p.lat)) w[y] = Math.max(0.02, Math.cos((p.lat * Math.PI) / 180));
    }
    return w;
  };

  /** Statistics over the cells a visitor walks: area-weighted mean, highest (and where), cover. */
  function bandStats(grid, visit, weights) {
    let sum = 0;
    let wsum = 0;
    let n = 0;
    let hit = 0;
    let best = -Infinity;
    let bx = -1;
    let by = -1;
    visit((x, y) => {
      n++;
      const v = grid.data[y * grid.width + x];
      if (!Number.isFinite(v)) return;
      hit++;
      sum += v * weights[y];
      wsum += weights[y];
      if (v > best) [best, bx, by] = [v, x, y];
    });
    return { mean: hit ? sum / wsum : null, max: hit ? best : null, cover: n ? (hit / n) * 100 : 0, at: hit ? cellPlace(grid, bx, by) : null, x: bx, y: by };
  }

  function channelsFor(rows, { label, units }, extra = {}) {
    label = /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label; // "Average air temperature"
    return [
      { name: `Average ${label}`.slice(0, 60), unit: units, hint: `Area-weighted average of ${label} in this part of the map`, values: rows.map((r) => r.mean), instrument: 'soft' },
      { name: `Highest ${label}`.slice(0, 60), unit: units, hint: `The highest ${label} in this part of the map; it plays from where it is`, values: rows.map((r) => r.max), instrument: 'strings' },
      { name: 'Area with data', unit: '%', hint: 'How much of this part of the map has a value. Muted at first; press M to hear it.', values: rows.map((r) => r.cover), instrument: 'flute', mute: true, ...extra },
    ];
  }

  /** Where each step is heard from: the place of its highest value, or the middle of its band. */
  function pointsFor(rows, fallback) {
    return rows.map((r, i) => (r.at && Number.isFinite(r.at.lat) ? { lat: r.at.lat, lon: r.at.lon } : fallback(i)));
  }

  /**
   * The map in steps. path: 'line' (west → east), 'down' (north → south) or 'radar'.
   * Returns { labels, channels, points, details }.
   */
  function sweep(grid, { path = 'line', steps = 48, label = 'value', units = '' } = {}) {
    const n = Math.max(2, Math.min(steps, path === 'down' ? grid.height : path === 'radar' ? 360 : grid.width));
    const weights = weightOf(grid);
    const rows = Array.from({ length: n }, (_, i) => bandStats(grid, image.bandVisitor(path === 'pointer' ? 'line' : path, grid.width, grid.height, i, n), weights));
    const mid = (i) => {
      const f = (i + 0.5) / n;
      const p = cellPlace(grid, path === 'down' ? grid.width >> 1 : Math.floor(f * grid.width), path === 'down' ? Math.floor(f * grid.height) : grid.height >> 1);
      return p || { lat: path === 'down' ? 90 - f * 180 : 0, lon: path === 'down' ? 0 : -180 + f * 360 };
    };
    const bb = grid.bbox;
    const labels = Array.from({ length: n }, (_, i) => {
      const f = (i + 0.5) / n; // the middle of the band
      if (path === 'radar' || path === 'pointer' || !bb) return image.bandLabel(path === 'pointer' ? 'line' : path, i, n);
      return path === 'down' ? fmtLat(bb[3] - f * (bb[3] - bb[1])) : fmtLon(bb[0] + f * (bb[2] - bb[0]));
    });
    const details = rows.map((r) => (r.at ? `highest at ${place(r.at.lat, r.at.lon)}` : r.cover ? '' : 'no data here'));
    return { labels, channels: channelsFor(rows, { label, units }), points: pointsFor(rows, mid), details };
  }

  /** One step per map in time: frames = [{ grid, label }]. */
  function timelapse(frames, { label = 'value', units = '' } = {}) {
    const rows = frames.map((f) => bandStats(f.grid, (fn) => {
      for (let y = 0; y < f.grid.height; y++) for (let x = 0; x < f.grid.width; x++) fn(x, y);
    }, weightOf(f.grid)));
    return {
      labels: frames.map((f) => f.label),
      channels: channelsFor(rows, { label, units }, { hint: 'How much of the map has a value at this date. Muted at first; press M to hear it.' }),
      points: pointsFor(rows, () => ({ lat: 0, lon: 0 })),
      details: rows.map((r) => (r.at ? `highest at ${place(r.at.lat, r.at.lon)}` : 'no data at this date')),
    };
  }

  /** One spot over time: series from science.series(). */
  function point(series, { label = 'value', units = '' } = {}) {
    const where = place(series.lat, series.lon);
    return {
      labels: series.labels,
      channels: [{ name: `${label}${where ? ' at ' + where : ''}`.slice(0, 70), unit: units, hint: `${label} at one place, step by step through time`, values: series.values.map((v) => (Number.isFinite(v) ? v : null)), instrument: 'soft' }],
      points: Number.isFinite(series.lat) ? series.values.map(() => ({ lat: series.lat, lon: series.lon })) : null,
      details: [],
    };
  }

  /** The value under a pointer at (u, v) of the shown map (0…1 from the top-left). */
  function valueAt(grid, u, v) {
    const x = Math.max(0, Math.min(grid.width - 1, Math.floor(u * grid.width)));
    const y = Math.max(0, Math.min(grid.height - 1, Math.floor(v * grid.height)));
    const p = cellPlace(grid, x, y);
    return { value: grid.data[y * grid.width + x], lat: p?.lat ?? null, lon: p?.lon ?? null, x, y };
  }

  return { SEQ, DIV, colourRange, paint, sweep, timelapse, point, valueAt, place, fmtLat, fmtLon, cellPlace };
});
