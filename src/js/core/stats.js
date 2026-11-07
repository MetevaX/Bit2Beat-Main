/**
 * Bit2Beat core · statistics used for listening aids.
 *
 * - linearTrend: ordinary least squares on (index or x, value) with R².
 * - anomalies:   robust modified z-score (Iglewicz & Hoaglin, 1993) of each point against a
 *                centred rolling median, so seasonal curves and long trends are not flagged
 *                as "anomalies"; only sudden departures from the local level are.
 * - resample:    bucket means, so 365 days can be heard as 60 steps without losing level.
 * - describe:    a plain-language summary that a screen reader can speak.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).stats = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const finite = (arr) => arr.filter((v) => Number.isFinite(v));
  const mean = (arr) => {
    const f = finite(arr);
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
  };
  function quantile(arr, q) {
    const f = finite(arr).sort((a, b) => a - b);
    if (!f.length) return NaN;
    const pos = (f.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return f[lo] + (f[hi] - f[lo]) * (pos - lo);
  }
  const median = (arr) => quantile(arr, 0.5);
  function std(arr) {
    const f = finite(arr);
    if (f.length < 2) return 0;
    const m = mean(f);
    return Math.sqrt(f.reduce((a, v) => a + (v - m) ** 2, 0) / (f.length - 1));
  }

  /** Least-squares line. `xs` defaults to 0..n-1. Returns slope per x unit, intercept, R², n. */
  function linearTrend(values, xs) {
    const pts = [];
    values.forEach((v, i) => {
      const x = xs ? xs[i] : i;
      if (Number.isFinite(v) && Number.isFinite(x)) pts.push([x, v]);
    });
    const n = pts.length;
    if (n < 3) return { slope: 0, intercept: n ? pts[0][1] : 0, r2: 0, n };
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [x, y] of pts) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
      syy += (y - my) ** 2;
    }
    const slope = sxx ? sxy / sxx : 0;
    const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    return { slope, intercept: my - slope * mx, r2, n };
  }

  /** Centred rolling median (window is forced odd, edges use a shrinking window). */
  function rollingMedian(values, window) {
    const w = Math.max(3, window | 1);
    const h = (w - 1) / 2;
    return values.map((_, i) => median(values.slice(Math.max(0, i - h), i + h + 1)));
  }

  /**
   * Expected value at each index from a straight line fitted to its neighbours (the point itself
   * is left out, windows are shifted inwards at the edges so trends do not bias the ends).
   */
  function localExpectation(values, w) {
    const n = values.length;
    const half = (w - 1) >> 1;
    return values.map((_, i) => {
      let a = Math.max(0, i - half);
      let b = Math.min(n - 1, a + w - 1);
      a = Math.max(0, b - w + 1);
      // Widen the window past missing / masked points until it holds w − 1 usable neighbours.
      const usable = (x, y) => {
        let c = 0;
        for (let j = x; j <= y; j++) if (j !== i && Number.isFinite(values[j])) c++;
        return c;
      };
      while (usable(a, b) < w - 1 && (a > 0 || b < n - 1)) {
        if (a > 0) a--;
        if (b < n - 1) b++;
      }
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      let k = 0;
      for (let j = a; j <= b; j++) {
        if (j === i || !Number.isFinite(values[j])) continue;
        sx += j;
        sy += values[j];
        sxx += j * j;
        sxy += j * values[j];
        k++;
      }
      if (k < 3) return null;
      const den = k * sxx - sx * sx;
      const slope = den ? (k * sxy - sx * sy) / den : 0;
      return (sy - slope * sx) / k + slope * i;
    });
  }

  /**
   * Readings that jump away from their neighbourhood: residual from a leave-one-out local line,
   * scored with the modified z-score 0.6745·(r − median)/MAD (Iglewicz & Hoaglin, 1993).
   * Returns [{ index, value, z, direction: 'high'|'low' }] for |z| ≥ threshold (3.5).
   */
  function anomalies(values, { threshold = 3.5, window } = {}) {
    const f = finite(values);
    if (f.length < 8) return [];
    const w = Math.max(5, (window || Math.min(31, Math.round(values.length / 12))) | 1);
    const floor = (Math.max(...f) - Math.min(...f)) * 0.01; // a "jump" must be at least ~5 % of the range
    let flagged = new Set();
    let result = [];
    // Refit without the points already flagged, so one spike does not make its neighbours look odd.
    for (let pass = 0; pass < 3; pass++) {
      const masked = values.map((v, i) => (flagged.has(i) ? null : v));
      const expect = localExpectation(masked, w);
      const resid = values.map((v, i) => (Number.isFinite(v) && Number.isFinite(expect[i]) ? v - expect[i] : null));
      const base = resid.filter((r, i) => r != null && !flagged.has(i));
      const med = median(base);
      const dev = base.map((r) => Math.abs(r - med));
      const mad = median(dev);
      const scale = Math.max(mad > 0 ? mad : mean(dev) * 1.2533, floor);
      if (!(scale > 0)) return [];
      result = [];
      resid.forEach((r, index) => {
        if (r == null) return;
        const z = (0.6745 * (r - med)) / scale;
        if (Math.abs(z) >= threshold) result.push({ index, value: values[index], z: +z.toFixed(2), direction: z > 0 ? 'high' : 'low' });
      });
      const next = new Set(result.map((a) => a.index));
      if ([...next].every((i) => flagged.has(i)) && next.size === flagged.size) break;
      flagged = next;
    }
    return result;
  }

  /**
   * Bucket means. Returns { values, buckets: [[start, end], …] } where end is inclusive.
   * When target ≥ n the input is returned unchanged.
   */
  function resample(values, target) {
    const n = values.length;
    if (!target || target >= n) return { values: [...values], buckets: values.map((_, i) => [i, i]) };
    const out = [];
    const buckets = [];
    for (let b = 0; b < target; b++) {
      const s = Math.floor((b * n) / target);
      const e = Math.max(s, Math.floor(((b + 1) * n) / target) - 1);
      const m = mean(values.slice(s, e + 1));
      out.push(Number.isFinite(m) ? +m.toFixed(6) : null);
      buckets.push([s, e]);
    }
    return { values: out, buckets };
  }

  const fmtNum = (v, unit = '') => {
    if (!Number.isFinite(v)) return 'missing';
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return Number(v.toFixed(d)).toLocaleString('en') + (unit ? (unit.startsWith('°') || unit === '%' ? '' : ' ') + unit : '');
  };

  /**
   * Plain-language description of one series.
   * @param {object} o
   * @param {string} o.name
   * @param {number[]} o.values
   * @param {string[]} [o.labels]  label per point (dates, years…)
   * @param {string}   [o.unit]
   * @param {number}   [o.perLabel] how many points make one "label step" (e.g. 10 for a decade)
   * @param {string}   [o.perName]  name of that step ("decade")
   */
  function describe({ name, values, labels = [], unit = '', perLabel, perName }) {
    const f = finite(values);
    if (f.length < 2) return { sentences: [`${name}: not enough numeric readings.`], trend: null, anomalies: [] };
    const lab = (i) => labels[i] ?? `reading ${i + 1}`;
    let iMax = -1;
    let iMin = -1;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      if (iMax < 0 || v > values[iMax]) iMax = i;
      if (iMin < 0 || v < values[iMin]) iMin = i;
    });
    const t = linearTrend(values);
    const first = values.findIndex((v) => Number.isFinite(v));
    let last = values.length - 1;
    while (last > 0 && !Number.isFinite(values[last])) last--;
    const fitted = (i) => t.intercept + t.slope * i;
    const change = fitted(last) - fitted(first);
    const spread = Math.max(...f) - Math.min(...f);
    const sentences = [];
    let trendWord = 'no clear trend';
    if (t.r2 >= 0.25 && Math.abs(change) >= spread * 0.15) trendWord = change > 0 ? 'rises' : 'falls';
    else if (t.r2 >= 0.1 && Math.abs(change) >= spread * 0.1) trendWord = change > 0 ? 'rises slightly' : 'falls slightly';
    if (trendWord === 'no clear trend') sentences.push(`${name} shows no clear overall trend from ${lab(first)} to ${lab(last)}.`);
    else {
      let rate = '';
      if (perLabel && perName) rate = ` (about ${fmtNum(t.slope * perLabel, unit)} per ${perName})`;
      sentences.push(`${name} ${trendWord} by about ${fmtNum(Math.abs(change), unit)} from ${lab(first)} to ${lab(last)}${rate}.`);
    }
    sentences.push(`Highest ${fmtNum(values[iMax], unit)} at ${lab(iMax)}; lowest ${fmtNum(values[iMin], unit)} at ${lab(iMin)}.`);
    const an = anomalies(values);
    if (an.length) {
      const top = [...an].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
      sentences.push(
        `${an.length} sudden ${an.length === 1 ? 'jump' : 'jumps'} compared with nearby readings, for example ` +
          top.map((a) => `${lab(a.index)} (${fmtNum(a.value, unit)}, unusually ${a.direction})`).join(', ') + '.',
      );
    }
    const missing = values.length - f.length;
    if (missing) sentences.push(`${missing} missing ${missing === 1 ? 'reading is' : 'readings are'} played as silence.`);
    return { sentences, trend: { ...t, change, direction: trendWord }, anomalies: an, max: iMax, min: iMin };
  }

  /**
   * Suggest musical settings from the shape of the data (all channels normalised 0..1).
   * Smooth slow data → slower tempo, legato instrument; jumpy data → faster, percussive.
   */
  function autoTune(normChannels) {
    const all = normChannels.flat().filter((v) => v != null);
    if (all.length < 2) return { scale: 'pent', tempo: 96, instrument: 'soft', reason: 'Default settings.' };
    let jump = 0;
    let pairs = 0;
    for (const ch of normChannels)
      for (let i = 1; i < ch.length; i++)
        if (ch[i] != null && ch[i - 1] != null) {
          jump += Math.abs(ch[i] - ch[i - 1]);
          pairs++;
        }
    const roughness = pairs ? jump / pairs : 0.1;
    const m = mean(all);
    const trend = linearTrend(normChannels[0] || []);
    const n = Math.max(...normChannels.map((c) => c.length));
    const tempo = Math.round(Math.max(72, Math.min(150, 84 + roughness * 220 + (n > 120 ? 20 : 0))));
    const instrument = roughness > 0.2 ? 'marimba' : roughness < 0.06 ? 'strings' : 'soft';
    const scale = trend.slope * n > 0.35 ? 'major' : trend.slope * n < -0.35 ? 'minor' : m < 0.4 ? 'dorian' : 'pent';
    const reason =
      `${roughness > 0.2 ? 'Jumpy' : roughness < 0.06 ? 'Smooth' : 'Moderately varied'} data, ` +
      `${scale === 'major' ? 'rising overall' : scale === 'minor' ? 'falling overall' : 'without a strong overall direction'}: ` +
      `${(scale === 'pent' ? 'pentatonic' : scale)} scale, ${tempo} BPM, ${instrument === 'soft' ? 'piano' : instrument}.`;
    return { scale, tempo, instrument, reason, roughness };
  }

  return { mean, median, quantile, std, linearTrend, rollingMedian, localExpectation, anomalies, resample, describe, autoTune, fmtNum };
});
