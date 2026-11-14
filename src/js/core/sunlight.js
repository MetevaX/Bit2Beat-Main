/**
 * Bit2Beat core · sunlight on the whole planet, worked out from astronomy (works offline).
 *
 * Sunlight arriving at the top of the atmosphere depends only on where the Sun is in the sky:
 *   Q = S0 · (r0 / r)² · cos(zenith angle)     (0 at night)
 * with the solar constant S0 = 1361 W/m² (Kopp & Lean 2011, measured by NASA's SORCE satellite),
 * the Earth–Sun distance factor (r0/r)² and the solar declination from Spencer's (1971) Fourier
 * series, and the equation of time used by NOAA's solar calculator. The daily average uses the
 * classic formula Q̄ = S0/π · (r0/r)² · (h0·sinφ·sinδ + cosφ·cosδ·sin h0).
 *
 * Two "maps over time" on a 5° grid, given as arrays like a NetCDF file (core/science.js):
 *   sunlight — every hour of the June solstice, 21 June 2026 (UTC);
 *   daily    — the daily average on the 15th of every month of 2026.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).sunlight = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const S0 = 1361; // W/m²
  const RAD = Math.PI / 180;
  const YEAR = 2026;
  const DAY = '2026-06-21';
  const STEP = 5;
  const LAT = Array.from({ length: 180 / STEP }, (_, j) => 90 - STEP / 2 - j * STEP); // north first
  const LON = Array.from({ length: 360 / STEP }, (_, i) => -180 + STEP / 2 + i * STEP);

  const dayOfYear = (ms) => Math.floor((ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)) / 864e5) + 1;

  /** Where the Sun is at time `ms`: declination (rad), distance factor, equation of time (min). */
  function sun(ms) {
    const d = new Date(ms);
    const leap = d.getUTCFullYear() % 4 === 0 ? 366 : 365;
    const g = ((2 * Math.PI) / leap) * (dayOfYear(ms) - 1 + (d.getUTCHours() + d.getUTCMinutes() / 60 - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const dist = 1.00011 + 0.034221 * Math.cos(g) + 0.00128 * Math.sin(g) + 0.000719 * Math.cos(2 * g) + 0.000077 * Math.sin(2 * g);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    return { decl, dist, eqt };
  }

  /** Sunlight (W/m²) at the top of the atmosphere at one place and moment. */
  function instant(lat, lon, ms) {
    const { decl, dist, eqt } = sun(ms);
    const d = new Date(ms);
    const solarMin = d.getUTCHours() * 60 + d.getUTCMinutes() + eqt + 4 * lon;
    const ha = (solarMin / 4 - 180) * RAD;
    const cz = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha);
    return Math.max(0, S0 * dist * cz);
  }

  /** Average sunlight (W/m²) over one whole day at a latitude. */
  function daily(lat, ms) {
    const { decl, dist } = sun(ms + 12 * 3600e3 - (ms % 864e5));
    const phi = lat * RAD;
    const x = -Math.tan(phi) * Math.tan(decl);
    const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x); // polar night · midnight sun
    return Math.max(0, (S0 / Math.PI) * dist * (h0 * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(h0)));
  }

  /** Where the Sun is straight overhead at `ms` (the subsolar point), in degrees. */
  function overhead(ms) {
    const { decl, eqt } = sun(ms);
    const d = new Date(ms);
    let lon = -((d.getUTCHours() * 60 + d.getUTCMinutes() + eqt) / 4 - 180);
    lon = ((lon + 540) % 360) - 180;
    return { lat: decl / RAD, lon };
  }

  const HOURS = Array.from({ length: 24 }, (_, h) => Date.UTC(2026, 5, 21, h));
  const MONTHS = Array.from({ length: 12 }, (_, m) => Date.UTC(YEAR, m, 15));

  /** One map: Float32Array (north first, west first). */
  function grid(kind, k) {
    const out = new Float32Array(LAT.length * LON.length);
    LAT.forEach((la, j) => {
      const row = kind === 'daily' ? daily(la, MONTHS[k]) : null;
      LON.forEach((lo, i) => (out[j * LON.length + i] = kind === 'daily' ? row : instant(la, lo, HOURS[k])));
    });
    return { data: out, width: LON.length, height: LAT.length, lat: LAT.slice(), lon: LON.slice(), bbox: [-180, -90, 180, 90], time: kind === 'daily' ? MONTHS[k] : HOURS[k] };
  }

  /** An in-memory array that reads like a file variable (start, count, stride). */
  function array(name, shape, dims, attrs, valueAt) {
    return {
      name,
      path: name,
      shape,
      dims,
      attrs,
      async slab(start, count, stride = shape.map(() => 1)) {
        const total = count.reduce((a, b) => a * b, 1);
        const out = new Float64Array(total);
        const idx = new Array(shape.length);
        for (let n = 0; n < total; n++) {
          let rem = n;
          for (let k = shape.length - 1; k >= 0; k--) {
            idx[k] = start[k] + (rem % count[k]) * stride[k];
            rem = Math.floor(rem / count[k]);
          }
          out[n] = valueAt(idx);
        }
        return out;
      },
    };
  }

  /** The arrays of the built-in "file", for science.fromArrays(). */
  function arrays() {
    const cache = new Map();
    const map = (kind, k) => {
      const key = kind + k;
      if (!cache.has(key)) cache.set(key, grid(kind, k).data);
      return cache.get(key);
    };
    const W = LON.length;
    return [
      array('lat', [LAT.length], ['lat'], { units: 'degrees_north' }, ([j]) => LAT[j]),
      array('lon', [W], ['lon'], { units: 'degrees_east' }, ([i]) => LON[i]),
      array('time', [24], ['time'], { units: 'hours since 2026-06-21 00:00:00' }, ([h]) => h),
      array('month', [12], ['month'], { units: 'days since 2026-01-01', axis: 'T' }, ([m]) => (MONTHS[m] - Date.UTC(YEAR, 0, 1)) / 864e5),
      array('sunlight', [24, LAT.length, W], ['time', 'lat', 'lon'], { long_name: 'Sunlight', units: 'W m-2' }, ([h, j, i]) => map('instant', h)[j * W + i]),
      array('daily', [12, LAT.length, W], ['month', 'lat', 'lon'], { long_name: 'Daily sunlight', units: 'W m-2' }, ([m, j, i]) => map('daily', m)[j * W + i]),
    ];
  }
  const ATTRS = { title: 'Sunlight on Earth, worked out from astronomy', source: 'Solar constant 1361 W/m² (NASA SORCE); Sun position after Spencer (1971) and NOAA' };

  const ORIGIN = { source: 'Worked out in your browser from astronomy: solar constant 1361 W/m² (NASA SORCE), Sun position after Spencer (1971) and NOAA', url: '', fetched: '', live: false };

  /** The studio source for one hour of the solstice, swept across the map (for previews and tests). */
  function source(sciSource, { t = 12, path = 'line', steps = 48 } = {}) {
    const built = sciSource.sweep(grid('instant', t), { path, steps, label: 'Sunlight', units: 'W m⁻²' });
    return { name: `Sunlight on Earth · 21 June 2026, ${String(t).padStart(2, '0')}:00 UTC`, kind: 'image', view: 'image', origin: ORIGIN, ...built };
  }

  return { S0, DAY, ORIGIN, source, LAT, LON, HOURS, MONTHS, sun, instant, daily, overhead, grid, arrays, ATTRS };
});
