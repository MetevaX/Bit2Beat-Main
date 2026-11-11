/**
 * Bit2Beat core · sonification plan.
 *
 * Turns a source (channels of numbers) plus the user's settings into a complete, deterministic
 * list of notes: pitch, loudness, start time and 3D position for every step and channel.
 * Live playback, offline export, the score, the readings table and the CSV all read the same
 * plan, so what you see is exactly what you hear and what you download.
 */
(function (root, factory) {
  const deps =
    typeof module === 'object' && module.exports
      ? { music: require('./music.js'), stats: require('./stats.js'), spatial: require('./spatial.js'), geo: require('./geo.js') }
      : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).plan = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { music, stats, spatial, geo } = deps;
  const { clamp } = music;

  const DEFAULTS = {
    scale: 'pent',
    key: 0,
    range: 24,
    tempo: 96,
    instrument: 'soft',
    spacing: 'even', // 'even' | 'time' (events only: keeps the real gaps in `source.times`)
    length: 0, // 0 = every point, otherwise resample to this many steps
    sharedScale: true, // channels with the same unit share one pitch range
    path: 'auto',
    height: 0.8,
    width: 1,
    drone: 'off', // 'off' | 'baseline' | 'mean'
    cues: true, // short tick on sudden jumps
  };

  /** Eighth-note step length in seconds at `tempo` quarter-notes per minute. */
  const stepSeconds = (tempo) => 60 / clamp(Number(tempo) || 96, 30, 300) / 2;

  /** Resample every series of a data/image source to `target` steps (bucket means). */
  function resampleSource(src, target) {
    const n = src.labels?.length || src.channels[0]?.values.length || 0;
    if (!target || n <= target || src.kind === 'earth') return { src, buckets: null };
    let buckets = null;
    const channels = src.channels.map((c) => {
      const r = stats.resample(c.values, target);
      buckets = r.buckets;
      return { ...c, values: r.values };
    });
    const lab = (i) => src.labels?.[i] ?? String(i + 1);
    const labels = buckets.map(([s, e]) => (s === e ? lab(s) : `${lab(s)} – ${lab(e)}`));
    return { src: { ...src, channels, labels }, buckets };
  }

  function unitKey(c) {
    return (c.unit || '').trim().toLowerCase();
  }

  /**
   * Build the plan.
   * @param {object} source  generic source (see feeds.js)
   * @param {object[]} mix   per-channel state: { gain, mute, solo, instrument('inherit'|key), invert? }
   * @param {object} opts    settings (see DEFAULTS)
   */
  function build(source, mix = [], opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const { src, buckets } = resampleSource(source, o.length);
    const count = Math.max(0, ...src.channels.map((c) => c.values.length));
    const step = stepSeconds(o.tempo);

    // --- timing ---
    let times = Array.from({ length: count }, (_, i) => i * step);
    if (o.spacing === 'time' && Array.isArray(src.times) && src.times.length === count && count > 1) {
      const t0 = src.times[0];
      const t1 = src.times[count - 1];
      const span = (count - 1) * step;
      if (t1 > t0) times = src.times.map((t) => ((t - t0) / (t1 - t0)) * span);
    }
    const noteLen = Math.min(0.9, step * 1.6);
    const duration = count ? times[count - 1] + noteLen + 0.6 : 0;

    // --- normalisation (log, shared range per unit, invert) ---
    const prepared = src.channels.map((c) => ({
      ...c,
      work: c.log ? c.values.map((v) => (Number.isFinite(v) && v > 0 ? Math.log10(v) : null)) : c.values,
    }));
    const groups = new Map();
    if (o.sharedScale)
      prepared.forEach((c) => {
        const k = unitKey(c);
        if (!k || c.log) return;
        const g = groups.get(k) || { min: Infinity, max: -Infinity, n: 0 };
        for (const v of c.work)
          if (Number.isFinite(v)) {
            g.min = Math.min(g.min, v);
            g.max = Math.max(g.max, v);
          }
        g.n++;
        groups.set(k, g);
      });
    const anySolo = mix.some((m) => m?.solo);
    const channels = prepared.map((c, j) => {
      const m = mix[j] || {};
      const g = groups.get(unitKey(c));
      const shared = g && g.n > 1 && Number.isFinite(g.min);
      let lo = shared ? g.min : undefined;
      let hi = shared ? g.max : undefined;
      // minSpan: a small real change (e.g. 2 L* in a video) moves the pitch a little, instead of
      // being stretched over every octave as if it were a big swing.
      if (!shared && c.minSpan > 0 && !c.log) {
        const vals = c.work.filter(Number.isFinite);
        if (vals.length) {
          const mn = Math.min(...vals);
          const mx = Math.max(...vals);
          if (mx - mn < c.minSpan) {
            lo = (mn + mx) / 2 - c.minSpan / 2;
            hi = lo + c.minSpan;
          }
        }
      }
      const nz = music.normalize(c.work, lo, hi);
      const invert = m.invert ?? !!c.invert;
      const norm = nz.norm.map((v) => (v == null ? null : invert ? 1 - v : v));
      // The app seeds mix[j].instrument from the channel's suggested instrument when a source loads.
      const instrument = m.instrument && m.instrument !== 'inherit' ? m.instrument : o.instrument;
      // Optional second measure for loudness and dot size (e.g. earthquake magnitude while pitch = latitude).
      let size = nz.norm;
      if (Array.isArray(c.loudBy)) {
        const lw = c.loudBy.map((v) => (Number.isFinite(v) ? (c.loudLog ? (v > 0 ? Math.log10(v) : null) : v) : null));
        const ln = music.normalize(lw).norm;
        size = ln.map((v, i) => (v == null ? (nz.norm[i] == null ? null : 0.5) : v));
      }
      const active = !(m.mute ?? !!c.mute) && (!anySolo || !!m.solo);
      return {
        name: c.name,
        unit: c.unit || '',
        hint: c.hint || '',
        raw: c.values,
        norm,
        loudNorm: nz.norm,
        size,
        min: c.log ? 10 ** nz.min : nz.min,
        max: c.log ? 10 ** nz.max : nz.max,
        shared: !!shared,
        log: !!c.log,
        invert,
        loudness: !!c.loudness,
        instrument,
        gain: clamp(m.gain ?? 0.7, 0, 1),
        active,
        midi: norm.map((v) => music.midi(v, o.scale, o.range, o.key)),
        anomalies: new Set(src.kind === 'earth' ? [] : stats.anomalies(c.values).map((a) => a.index)),
        color: c.color || null,
      };
    });

    // --- positions ---
    const resolvedPath = o.path === 'auto' ? ({ radar: 'orbit', down: 'fall' }[o.imagePath] || 'sweep') : o.path;
    function position(i, j, v) {
      const p = src.points?.[i];
      if (p && Number.isFinite(p.lat)) {
        const z = src.positionZ ? src.positionZ[i] : clamp((v ?? 0.5) * o.height);
        const r = geo.roomPosition(p.lat, p.lon, z);
        return { x: +(r.x * o.width).toFixed(4), y: +r.y.toFixed(4), z: +r.z.toFixed(4) };
      }
      return spatial.objectPosition({ path: resolvedPath, progress: count > 1 ? i / (count - 1) : 0, index: j, count: channels.length, value: v, height: o.height, width: o.width });
    }

    const steps = [];
    for (let i = 0; i < count; i++) {
      const notes = [];
      channels.forEach((c, j) => {
        const v = c.norm[i];
        if (v == null) return;
        const loud = c.loudness ? 0.45 + 0.55 * (c.size[i] ?? 0.5) : 1;
        notes.push({ ch: j, midi: c.midi[i], value: v, raw: c.raw[i], gain: c.gain * loud, active: c.active, pos: position(i, j, v), cue: o.cues && c.anomalies.has(i) });
      });
      steps.push(notes);
    }

    // --- reference drone ---
    let drone = null;
    const lead = channels.find((c) => c.active) || channels[0];
    if (lead && o.drone !== 'off') {
      let value = null;
      let label = '';
      if (o.drone === 'baseline' && Number.isFinite(src.baseline?.value)) {
        value = src.baseline.value;
        label = src.baseline.label || 'baseline';
      } else {
        value = stats.mean(lead.raw);
        label = 'average';
      }
      if (Number.isFinite(value) && lead.max > lead.min) {
        let v = clamp((value - lead.min) / (lead.max - lead.min));
        if (lead.invert) v = 1 - v;
        drone = { value, label, midi: music.midi(v, o.scale, o.range, o.key), channel: lead.name };
      }
    }

    return {
      settings: o,
      source: src,
      buckets,
      count,
      step,
      noteLen,
      times,
      duration,
      labels: src.labels || [],
      details: src.details || [],
      channels,
      steps,
      drone,
    };
  }

  /** Index of the step that is sounding at playback time `t` (seconds). */
  function stepAt(plan, t) {
    const ts = plan.times;
    let lo = 0;
    let hi = ts.length - 1;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  return { DEFAULTS, build, stepAt, stepSeconds };
});
