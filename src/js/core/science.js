/**
 * Bit2Beat core · scientific Earth-data files, one way in.
 *
 * GeoTIFF / Cloud-Optimized GeoTIFF (core/tiff.js), classic NetCDF (core/netcdf3.js) and
 * HDF5 / NetCDF-4 (core/hdf5.js + hdf5-data.js) are opened lazily and described the same way:
 *
 *   const f = await science.open(reader);
 *   f.format, f.title, f.variables = [{ id, name, label, units, shape, dims, kind, lat, lon, time, ... }]
 *   await f.map(id, { t, width, height })      → { data (Float32Array, NaN = no data), width, height, bbox, ... }
 *   await f.series(id, { x, y, maxSteps })     → { values, labels, times } (one spot over time)
 *
 * CF conventions are read where present: latitude / longitude / time coordinates (by name,
 * units or standard_name), dates from "days since …" units, _FillValue / missing_value /
 * valid_range, scale_factor and add_offset. Without them the last two dimensions are taken
 * as rows and columns (north at the top) and the first, if any, as time.
 */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const dep = node
    ? { tiff: require('./tiff.js'), netcdf3: require('./netcdf3.js'), hdf5: require('./hdf5.js'), hdf5data: require('./hdf5-data.js') }
    : root.Bit2Beat;
  const mod = factory(dep);
  if (node) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).science = mod;
})(typeof self !== 'undefined' ? self : this, function (dep) {
  'use strict';
  const { tiff, netcdf3, hdf5 } = dep;
  const hdf5data = dep.hdf5data || dep.hdf5Data;

  const MAX_BYTES = 5 * 1024 ** 3;
  const EXT = { geotiff: ['tif', 'tiff', 'geotiff', 'gtiff', 'cog'], netcdf: ['nc', 'nc3', 'nc4', 'cdf', 'netcdf'], hdf5: ['h5', 'hdf5', 'he5', 'h5nc', 'hdf'] };
  const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const isScienceName = (name) => Object.values(EXT).some((l) => l.includes(extOf(name)));

  /** The kind of file from its first bytes (the extension is only a hint). */
  function sniff(head) {
    const b = head;
    if ((b[0] === 0x49 && b[1] === 0x49 && (b[2] === 42 || b[2] === 43)) || (b[0] === 0x4d && b[1] === 0x4d && (b[3] === 42 || b[3] === 43))) return 'geotiff';
    if (b[0] === 0x43 && b[1] === 0x44 && b[2] === 0x46 && [1, 2, 5].includes(b[3])) return 'netcdf3';
    if (b[0] === 0x89 && b[1] === 0x48 && b[2] === 0x44 && b[3] === 0x46) return 'hdf5';
    if (b[0] === 0x0e && b[1] === 0x03 && b[2] === 0x13 && b[3] === 0x01) return 'hdf4';
    return null;
  }

  // ---------------------------------------------------------------- time
  const UNITS_MS = { second: 1e3, minute: 6e4, hour: 3.6e6, day: 864e5, week: 6048e5 };
  /** "days since 1850-01-01 00:00:00" → function(value) → ms since 1970, or null. */
  function timeParser(units, calendar = '') {
    const m = String(units || '').match(/^\s*(\w+?)s?\s+since\s+(-?\d{1,4})-(\d{1,2})(?:-(\d{1,2}))?(?:[ T](\d{1,2}):?(\d{2})?:?(\d{2}(?:\.\d+)?)?)?\s*(Z|UTC|[+-]\d{1,2}:?\d{0,2})?/i);
    if (!m) return null;
    const unit = m[1].toLowerCase().replace(/s$/, '');
    const t0 = Date.UTC(+m[2], +m[3] - 1, +(m[4] || 1), +(m[5] || 0), +(m[6] || 0), +(m[7] || 0));
    if (unit === 'month' || unit === 'year') {
      const y0 = +m[2];
      const mo0 = +m[3] - 1;
      return (v) => (unit === 'year' ? Date.UTC(y0 + Math.floor(v), mo0, 1) : Date.UTC(y0, mo0 + Math.floor(v), 1));
    }
    const k = UNITS_MS[unit];
    if (!k) return null;
    // 360-day and no-leap calendars are close enough for labels (a few days at most per century)
    const scale = /360/.test(calendar) ? 365.2425 / 360 : 1;
    return (v) => t0 + v * k * scale;
  }
  /** Date labels as short as the spacing allows: 2024, 2024-03 or 2024-03-15 (or with the hour). */
  function dateLabels(ms) {
    if (!ms.length) return [];
    const step = ms.length > 1 ? Math.abs(ms[ms.length - 1] - ms[0]) / (ms.length - 1) : 864e5 * 30;
    const cut = [4, 7, 10, 16];
    let k = step >= 300 * 864e5 ? 0 : step >= 27 * 864e5 ? 1 : step >= 864e5 * 0.9 ? 2 : 3;
    const fmt = (n) => ms.map((t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, n).replace('T', ' ') : '?'));
    // finer if the short form would repeat (for example 30-day steps that land twice in one month)
    while (k < 3 && new Set(fmt(cut[k])).size < ms.length) k++;
    return fmt(cut[k]);
  }

  // ---------------------------------------------------------------- CF helpers
  const num = (v) => (Array.isArray(v) ? Number(v[0]) : Number(v));
  const isLat = (name, a = {}) => /^(lat|latitude|y|nav_lat|lats|rlat)$/i.test(name) || /degrees?_?n(orth)?/i.test(a.units || '') || /latitude/i.test(a.standard_name || '');
  const isLon = (name, a = {}) => /^(lon|long|longitude|x|nav_lon|lons|rlon)$/i.test(name) || /degrees?_?e(ast)?/i.test(a.units || '') || /longitude/i.test(a.standard_name || '');
  const isTime = (name, a = {}) => /^(time|t|date|times|valid_time)$/i.test(name) || /\bsince\b/i.test(a.units || '') || /time/i.test(a.standard_name || a.axis === 'T' ? 'time' : '');

  /** A function that turns stored numbers into real values (NaN for missing). */
  function unpacker(a = {}) {
    const fills = [a._FillValue, a.missing_value, a.FillValue, a._fillvalue].flat().filter((v) => v != null && v !== '').map(Number).filter((v) => !Number.isNaN(v));
    const scale = a.scale_factor != null ? num(a.scale_factor) : 1;
    const offset = a.add_offset != null ? num(a.add_offset) : 0;
    let lo = -Infinity;
    let hi = Infinity;
    if (Array.isArray(a.valid_range) && a.valid_range.length === 2) [lo, hi] = a.valid_range.map(Number);
    if (a.valid_min != null) lo = num(a.valid_min);
    if (a.valid_max != null) hi = num(a.valid_max);
    return (v) => {
      if (!Number.isFinite(v) || v < lo || v > hi) return NaN;
      for (const f of fills) if (v === f || Math.abs(v - f) <= Math.abs(f) * 1e-6) return NaN;
      if (Math.abs(v) >= 9.9e36) return NaN; // common "no data" sentinels (1e37, 9.96921e36)
      return v * scale + offset;
    };
  }
  /** Friendlier unit names: degC → °C, degrees_north → °N … */
  function prettyUnits(u) {
    const t = String(u || '').trim();
    if (/^(deg(ree)?s?_?C|celsius|°C)$/i.test(t)) return '°C';
    if (/^(deg(ree)?s?_?F|fahrenheit)$/i.test(t)) return '°F';
    if (/^(K|kelvin|deg(ree)?s?_?K)$/i.test(t)) return 'K';
    if (/^(1|percent|%)$/i.test(t)) return t === '1' ? '' : '%';
    if (/^deg(ree)?s?$/i.test(t)) return '°';
    const sup = (d) => [...d].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
    return t
      .replace(/\*\*\s*(-?)(\d+)|\^(-?)(\d+)|([a-zA-Z])(-)(\d+)/g, (m, a, b, c, d, e, f, g) => (e ? e + '⁻' + sup(g) : (a || c ? '⁻' : '') + sup(b || d)))
      .slice(0, 24);
  }
  const textOf = (v) => (Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v));

  /** Sample n evenly spaced indices of a dimension of size `size` (start, stride, count). */
  function sampling(size, n) {
    if (size <= n) return { start: 0, stride: 1, count: size };
    const stride = Math.ceil(size / n);
    return { start: Math.floor((size - 1 - stride * (Math.ceil(size / stride) - 1)) / 2), stride, count: Math.ceil(size / stride) };
  }

  // ---------------------------------------------------------------- generic arrays (NetCDF / HDF5)
  /**
   * arrays: [{ name, path, shape, dims (names or null), attrs, slab(start, count, stride, opts) }]
   * globalAttrs: file attributes.
   */
  async function describeArrays(format, arrays, globalAttrs, opts = {}) {
    const byName = new Map(arrays.map((a) => [a.name, a]));
    const coordVals = new Map();
    const coord = async (a) => {
      if (!coordVals.has(a)) coordVals.set(a, a.slab([0], [a.shape[0]], [1], opts));
      return coordVals.get(a);
    };
    // dimension names of HDF5 data sets come from their coordinate arrays when there is no DIMENSION_LIST
    const findCoord = (name, test, size) => {
      const direct = name && byName.get(name);
      if (direct && direct.shape.length === 1 && direct.shape[0] === size) return direct;
      return arrays.find((a) => a.shape.length === 1 && a.shape[0] === size && test(a.name, a.attrs));
    };
    const isCoordName = (a) => a.shape.length === 1 && (isLat(a.name, a.attrs) || isLon(a.name, a.attrs) || isTime(a.name, a.attrs) || a.dimsSelf);
    const variables = [];
    for (const a of arrays) {
      if (a.text || a.shape.length < 1 || a.shape.some((n) => !n)) continue;
      if (a.shape.length === 1 && (isCoordName(a) || a.shape[0] < 2)) continue;
      if (/^(lat|lon|time)_?(bnds|bounds)$|_bnds$|^crs$|^spatial_ref$/i.test(a.name)) continue;
      const rank = a.shape.length;
      const dims = a.dims || [];
      // which axis is which
      let yAx = -1;
      let xAx = -1;
      let tAx = -1;
      dims.forEach((d, k) => {
        const c = byName.get(d);
        if (isLat(d, c?.attrs)) yAx = k;
        else if (isLon(d, c?.attrs)) xAx = k;
        else if (isTime(d, c?.attrs)) tAx = k;
      });
      if (rank >= 2) {
        if (yAx < 0 || xAx < 0) [yAx, xAx] = [rank - 2, rank - 1];
        if (tAx < 0 && rank >= 3) tAx = [...Array(rank).keys()].find((k) => k !== yAx && k !== xAx);
      } else if (tAx < 0) tAx = 0;
      const latC = yAx >= 0 ? findCoord(dims[yAx], isLat, a.shape[yAx]) : null;
      const lonC = xAx >= 0 ? findCoord(dims[xAx], isLon, a.shape[xAx]) : null;
      const timeC = tAx >= 0 ? findCoord(dims[tAx], isTime, a.shape[tAx]) : null;
      const other = [...Array(rank).keys()].filter((k) => k !== yAx && k !== xAx && k !== tAx);
      variables.push({
        id: a.path || a.name,
        name: a.name,
        label: textOf(a.attrs.long_name || a.attrs.standard_name || a.attrs.title || a.attrs.description || a.name),
        units: prettyUnits(textOf(a.attrs.units || a.attrs.Units || a.attrs.unit || '')),
        shape: a.shape,
        dims: a.shape.map((n, k) => dims[k] || (k === yAx ? 'y' : k === xAx ? 'x' : k === tAx ? 'time' : `dim${k}`)),
        axes: { y: yAx, x: xAx, t: tAx, other },
        kind: rank >= 2 ? (tAx >= 0 && a.shape[tAx] > 1 ? 'maps over time' : 'map') : 'series',
        steps: tAx >= 0 ? a.shape[tAx] : 1,
        array: a,
        latC,
        lonC,
        timeC,
        unpack: unpacker(a.attrs),
      });
    }
    // the most interesting first: maps over time, then maps, then the biggest
    variables.sort((p, q) => (q.kind === 'maps over time') - (p.kind === 'maps over time') || (q.kind === 'map') - (p.kind === 'map') || q.shape.reduce((a, b) => a * b, 1) - p.shape.reduce((a, b) => a * b, 1));
    if (!variables.length) throw new Error('This file has no maps or series of numbers in it.');

    async function axisValues(v) {
      const out = {};
      if (v.latC) out.lat = await coord(v.latC);
      if (v.lonC) out.lon = await coord(v.lonC);
      if (v.timeC) {
        const raw = await coord(v.timeC);
        const parse = timeParser(textOf(v.timeC.attrs.units), textOf(v.timeC.attrs.calendar));
        out.times = parse ? Array.from(raw, parse) : null;
        out.timeRaw = raw;
      }
      return out;
    }

    /** Details for the "what is inside" list: area, dates, size. */
    async function info(v) {
      const ax = await axisValues(v);
      const r = { ...v };
      delete r.array;
      delete r.unpack;
      if (ax.lat?.length && ax.lon?.length) {
        const la = Array.from(ax.lat).filter(Number.isFinite);
        const lo = Array.from(ax.lon, (l) => (l > 180 ? l - 360 : l)).filter(Number.isFinite);
        const dLa = la.length > 1 ? Math.abs(la[1] - la[0]) / 2 : 0;
        const dLo = lo.length > 1 ? Math.abs(lo[1] - lo[0]) / 2 : 0;
        r.bbox = [Math.min(...lo) - dLo, Math.min(...la) - dLa, Math.max(...lo) + dLo, Math.max(...la) + dLa].map((x) => +x.toFixed(4));
        r.northUp = la.length < 2 || la[0] > la[la.length - 1];
      } else r.bbox = null;
      if (ax.times) {
        r.times = ax.times;
        const all = dateLabels(ax.times);
        r.dates = [all[0], all[all.length - 1]];
      }
      return r;
    }

    /** One map (2D slice at time index t), sampled to at most width × height. */
    /**
     * Display order of an axis: for each row (north first) or column (west first) of the map as
     * shown, the index in the file. Latitudes stored south first are flipped; longitudes stored
     * 0…360 are reordered to −180…180.
     */
    const orders = new Map();
    async function displayOrder(v) {
      if (orders.has(v)) return orders.get(v);
      const ax = await axisValues(v);
      const H = v.shape[v.axes.y];
      const W = v.shape[v.axes.x];
      const flip = ax.lat && ax.lat.length > 1 && ax.lat[0] < ax.lat[ax.lat.length - 1];
      const rows = Array.from({ length: H }, (_, r) => (flip ? H - 1 - r : r));
      let cols = Array.from({ length: W }, (_, c) => c);
      const norm = (l) => (l > 180 ? l - 360 : l);
      if (ax.lon && Array.from(ax.lon).some((l) => l > 180)) cols.sort((p, q) => norm(ax.lon[p]) - norm(ax.lon[q]));
      const o = { rows, cols, ax, norm };
      orders.set(v, o);
      return o;
    }

    /** File indices (in any order) → runs of evenly spaced indices that one slab can read. */
    function runs(list) {
      const sorted = [...new Set(list)].sort((p, q) => p - q);
      const out = [];
      for (let k = 0; k < sorted.length; ) {
        let n = 1;
        const step = k + 1 < sorted.length ? sorted[k + 1] - sorted[k] : 1;
        while (k + n < sorted.length && sorted[k + n] - sorted[k + n - 1] === step) n++;
        out.push({ start: sorted[k], stride: step, count: n });
        k += n;
      }
      return out;
    }

    /**
     * One map (2D slice at time index t), at most width × height values, read straight from the
     * file. window = [u0, v0, u1, v1]: the part of the whole map to read (0…1 from the top-left of
     * the map as shown), for zooming in: only that part is read, at full detail when it fits.
     */
    async function map(id, { t = 0, layer = 0, width = 360, height = 180, window = [0, 0, 1, 1], signal, progress } = {}) {
      const v = variables.find((x) => x.id === id);
      if (!v || v.shape.length < 2) throw new Error('That variable is not a map.');
      const { y, x, t: ta, other } = v.axes;
      const { rows, cols, ax, norm } = await displayOrder(v);
      const H = rows.length;
      const W = cols.length;
      const [u0, v0, u1, v1] = window.map((f) => Math.max(0, Math.min(1, f)));
      const r0 = Math.min(H - 1, Math.floor(v0 * H));
      const r1 = Math.max(r0 + 1, Math.min(H, Math.ceil(v1 * H)));
      const c0 = Math.min(W - 1, Math.floor(u0 * W));
      const c1 = Math.max(c0 + 1, Math.min(W, Math.ceil(u1 * W)));
      const sy = sampling(r1 - r0, height);
      const sx = sampling(c1 - c0, width);
      const yList = Array.from({ length: sy.count }, (_, j) => rows[r0 + sy.start + j * sy.stride]);
      const xList = Array.from({ length: sx.count }, (_, i) => cols[c0 + sx.start + i * sx.stride]);
      const h = yList.length;
      const w = xList.length;
      const data = new Float32Array(w * h).fill(NaN);
      const base = v.shape.map(() => 0);
      if (ta >= 0) base[ta] = Math.min(Math.max(0, t), v.shape[ta] - 1);
      other.forEach((k) => (base[k] = Math.min(layer, v.shape[k] - 1)));
      // where each file row / column goes in the picture
      const yAt = new Map();
      yList.forEach((f, j) => yAt.set(f, [...(yAt.get(f) || []), j]));
      const xAt = new Map();
      xList.forEach((f, i) => xAt.set(f, [...(xAt.get(f) || []), i]));
      const yRuns = runs(yList);
      const xRuns = runs(xList);
      let done = 0;
      const total = yRuns.length * xRuns.length;
      for (const ry of yRuns)
        for (const rx of xRuns) {
          const start = base.slice();
          const count = v.shape.map(() => 1);
          const stride = v.shape.map(() => 1);
          [start[y], count[y], stride[y]] = [ry.start, ry.count, ry.stride];
          [start[x], count[x], stride[x]] = [rx.start, rx.count, rx.stride];
          const part = (d, n) => progress?.(done * n + d, total * n);
          const raw = await v.array.slab(start, count, stride, { signal, progress: part });
          done++;
          for (let a = 0; a < ry.count; a++)
            for (let b = 0; b < rx.count; b++) {
              const val = v.unpack(raw[y < x ? a * rx.count + b : b * ry.count + a]);
              for (const j of yAt.get(ry.start + a * ry.stride)) for (const i of xAt.get(rx.start + b * rx.stride)) data[j * w + i] = val;
            }
        }
      const lat = ax.lat ? yList.map((f) => ax.lat[f]) : null;
      const lon = ax.lon ? xList.map((f) => norm(ax.lon[f])) : null;
      const dLa = lat && lat.length > 1 ? Math.abs(lat[1] - lat[0]) / 2 : ax.lat && ax.lat.length > 1 ? Math.abs(ax.lat[1] - ax.lat[0]) / 2 : 0;
      const dLo = lon && lon.length > 1 ? Math.abs(lon[1] - lon[0]) / 2 : ax.lon && ax.lon.length > 1 ? Math.abs(ax.lon[1] - ax.lon[0]) / 2 : 0;
      return {
        data,
        width: w,
        height: h,
        lat,
        lon,
        bbox: lat && lon ? [lon[0] - dLo, lat[h - 1] - dLa, lon[w - 1] + dLo, lat[0] + dLa] : null,
        time: ax.times ? ax.times[base[ta]] : null,
        from: [W, H],
        window: [c0 / W, r0 / H, c1 / W, r1 / H],
        simplified: sx.stride > 1 || sy.stride > 1,
      };
    }

    /** One spot (column x, row y of the map grid, in the file's own indices) over time. */
    async function series(id, { x, y, lon, lat, fx = 0.5, fy = 0.5, maxSteps = 600, layer = 0, signal, progress } = {}) {
      const v = variables.find((q) => q.id === id);
      if (!v) throw new Error('Unknown variable.');
      const { y: ya, x: xa, t: ta, other } = v.axes;
      const ax0 = await axisValues(v);
      // the spot: file indices, or the nearest coordinate, or a fraction of the map as shown (west→east, north→south)
      const nearest = (arr, want, wrap) => {
        let best = 0;
        let d = Infinity;
        for (let i = 0; i < arr.length; i++) {
          let e = Math.abs(arr[i] - want);
          if (wrap) e = Math.min(e % 360, 360 - (e % 360));
          if (e < d) [d, best] = [e, i];
        }
        return best;
      };
      if (x == null && xa >= 0) {
        const n = v.shape[xa];
        const ln = ax0.lon && Array.from(ax0.lon, (l) => (l > 180 ? l - 360 : l));
        if (lon == null && ln) lon = Math.min(...ln) + fx * (Math.max(...ln) - Math.min(...ln));
        x = lon != null && ax0.lon ? nearest(ax0.lon, ((((lon + 180) % 360) + 360) % 360) - 180, true) : Math.round(fx * (n - 1));
      }
      if (y == null && ya >= 0) {
        const n = v.shape[ya];
        if (lat == null && ax0.lat) lat = Math.max(...ax0.lat) - fy * (Math.max(...ax0.lat) - Math.min(...ax0.lat));
        y = lat != null && ax0.lat ? nearest(ax0.lat, lat) : Math.round(fy * (n - 1));
      }
      x = x || 0;
      y = y || 0;
      const steps = ta >= 0 ? v.shape[ta] : 1;
      const st = sampling(steps, maxSteps);
      const start = v.shape.map(() => 0);
      const count = v.shape.map(() => 1);
      const stride = v.shape.map(() => 1);
      if (ya >= 0) start[ya] = Math.min(y, v.shape[ya] - 1);
      if (xa >= 0) start[xa] = Math.min(x, v.shape[xa] - 1);
      if (ta >= 0) Object.assign(start, { [ta]: st.start }) && (count[ta] = st.count) && (stride[ta] = st.stride);
      other.forEach((k) => (start[k] = Math.min(layer, v.shape[k] - 1)));
      const raw = await v.array.slab(start, count, stride, { signal, progress });
      const ax = ax0;
      const idx = Array.from({ length: st.count }, (_, k) => st.start + k * st.stride);
      const times = ax.times ? idx.map((i) => ax.times[i]) : null;
      return { values: Array.from(raw, v.unpack), times, labels: times ? dateLabels(times) : idx.map((i) => `step ${i + 1}`), simplified: st.stride > 1, total: steps, lon: ax.lon ? (ax.lon[x] > 180 ? ax.lon[x] - 360 : ax.lon[x]) : null, lat: ax.lat ? ax.lat[y] : null };
    }

    return {
      format,
      title: textOf(globalAttrs.title || globalAttrs.Title || globalAttrs.long_name || globalAttrs.summary || ''),
      source: textOf(globalAttrs.source || globalAttrs.institution || globalAttrs.project || ''),
      variables: variables.map(({ array, unpack, latC, lonC, timeC, ...rest }) => rest),
      info: (id) => info(variables.find((v) => v.id === id)),
      map,
      series,
    };
  }

  // ---------------------------------------------------------------- formats
  async function openGeoTiff(reader) {
    const t = await tiff.open(reader);
    const m = t.main;
    const bands = m.alpha >= 0 ? m.spp - 1 : m.spp; // the alpha mask is not a band of data
    const v = {
      id: 'band1',
      name: m.label || 'Band 1',
      label: m.label || (bands > 1 ? `${bands} bands` : 'Values'),
      units: prettyUnits(m.unit),
      shape: [m.height, m.width],
      dims: ['y', 'x'],
      kind: 'map',
      steps: 1,
      bands,
    };
    const vars = Array.from({ length: bands }, (_, b) => ({ ...v, id: `band${b + 1}`, name: bands > 1 ? `Band ${b + 1}` : v.name, label: bands > 1 ? `Band ${b + 1}${m.label ? ' · ' + m.label : ''}` : v.label, band: b }));
    // a band per time step: offer them together as maps over time too
    if (bands > 1) vars.unshift({ ...v, id: 'bands', name: 'All bands', label: `All ${bands} bands as steps`, kind: 'maps over time', steps: bands, shape: [bands, m.height, m.width], dims: ['band', 'y', 'x'] });
    const grid = async (band, o) => {
      // snapped to whole pixels, so the zoomed part lines up with the full map exactly
      const [a, b, c, d] = (o.window || [0, 0, 1, 1]).map((f) => Math.max(0, Math.min(1, f)));
      const [W, H] = [m.width, m.height];
      const win = [Math.floor(a * W) / W, Math.floor(b * H) / H, Math.max(Math.floor(a * W) + 1, Math.ceil(c * W)) / W, Math.max(Math.floor(b * H) + 1, Math.ceil(d * H)) / H];
      const g = await tiff.readGrid(reader, t, { ...o, band, window: win });
      const full = m.bbox;
      // the part of the map that was read, in degrees
      const bb = full && [full[0] + win[0] * (full[2] - full[0]), full[3] - win[3] * (full[3] - full[1]), full[0] + win[2] * (full[2] - full[0]), full[3] - win[1] * (full[3] - full[1])];
      const lon = bb ? Array.from({ length: g.width }, (_, i) => bb[0] + ((i + 0.5) * (bb[2] - bb[0])) / g.width) : null;
      const lat = bb ? Array.from({ length: g.height }, (_, j) => bb[3] - ((j + 0.5) * (bb[3] - bb[1])) / g.height) : null;
      return { ...g, lat, lon, bbox: bb, time: null, window: win, note: m.note };
    };
    return {
      format: t.bigTiff ? 'BigTIFF (GeoTIFF)' : t.images.length > 1 ? 'Cloud-Optimized GeoTIFF' : 'GeoTIFF',
      title: m.label || '',
      source: '',
      note: m.note,
      // an ordinary photo saved as TIFF (8-bit colour, no map position): show it as a picture
      photo: !m.bbox && !/projected/.test(m.note) && m.bits === 8 && m.fmt === 1 && bands >= 3,
      variables: vars,
      info: async (id) => ({ ...vars.find((x) => x.id === id), bbox: m.bbox, northUp: true, overviews: t.images.length - 1, compression: m.comp }),
      map: (id, o = {}) => grid(id === 'bands' ? o.t || 0 : vars.find((x) => x.id === id)?.band || 0, o),
      /** x, y are full-resolution pixel indices; one value per band. */
      async series(id, { x, y, lon, lat, fx = 0.5, fy = 0.5, signal } = {}) {
        const bb = m.bbox;
        if (bb && lon != null) fx = (lon - bb[0]) / (bb[2] - bb[0]);
        if (bb && lat != null) fy = (bb[3] - lat) / (bb[3] - bb[1]);
        if (x == null) x = Math.floor(Math.max(0, Math.min(0.9999, fx)) * m.width);
        if (y == null) y = Math.floor(Math.max(0, Math.min(0.9999, fy)) * m.height);
        const out = [];
        for (let b = 0; b < bands; b++) {
          if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
          out.push(await tiff.pixel(reader, t, x, y, b));
        }
        return { values: out, times: null, labels: out.map((_, b) => `band ${b + 1}`), simplified: false, total: bands, lon: bb ? bb[0] + ((x + 0.5) * (bb[2] - bb[0])) / m.width : null, lat: bb ? bb[3] - ((y + 0.5) * (bb[3] - bb[1])) / m.height : null };
      },
    };
  }

  async function openNetcdf3(reader, opts) {
    const nc = await netcdf3.open(reader);
    return describeArrays(nc.format, nc.vars.map((v) => ({ ...v, dimsSelf: v.dims.length === 1 && v.dims[0] === v.name })), nc.attrs, opts);
  }

  async function openHdf5(reader, opts) {
    const f = await hdf5.open(reader);
    const list = await f.datasets();
    const byAddr = new Map(list.map((d) => [d.addr, d]));
    const arrays = [];
    for (const d of list) {
      if (!d.type.numeric) continue;
      const attrs = await f.attributes(d.msgs);
      let ds = null;
      const lazy = async () => (ds ||= await hdf5data.dataset(f, d));
      // dimension names from NetCDF-4 dimension scales (DIMENSION_LIST → the scale data sets)
      let dims = null;
      if (Array.isArray(attrs.DIMENSION_LIST)) dims = attrs.DIMENSION_LIST.map((refs) => byAddr.get(Array.isArray(refs) ? refs[0] : refs)?.name || null);
      const isScale = attrs.CLASS === 'DIMENSION_SCALE';
      if (isScale && /This is a netCDF dimension but not a netCDF variable/.test(textOf(attrs.NAME))) continue;
      arrays.push({
        name: d.name,
        path: d.path,
        shape: d.dims,
        dims,
        attrs,
        dimsSelf: isScale,
        slab: async (...a) => (await lazy()).slab(...a),
        prepare: lazy,
      });
    }
    if (!arrays.length) throw new Error('This HDF5 file has no data sets of numbers in it.');
    const rootAttrs = await f.rootAttributes();
    const isNc = rootAttrs._NCProperties != null || arrays.some((a) => a.dims);
    const out = await describeArrays(isNc ? 'NetCDF-4 (HDF5)' : 'HDF5', arrays, rootAttrs, opts);
    // check that the first variable can really be read (unsupported packing is reported now, not later)
    const first = arrays.find((a) => a.path === out.variables[0].id);
    await first?.prepare();
    return out;
  }

  /** Open any supported file. reader from core/bytes.js. */
  async function open(reader, opts = {}) {
    if (reader.size > MAX_BYTES) throw new Error(`This file is ${(reader.size / 1024 ** 3).toFixed(1)} GB. Bit2Beat opens scientific files up to 5 GB: cut out the area or the years you need first (for example with cdo, nco or gdal_translate).`);
    if (reader.size < 8) throw new Error('This file is empty or too short to be a data file.');
    const kind = sniff(await reader.read(0, 8));
    if (kind === 'geotiff') return openGeoTiff(reader, opts);
    if (kind === 'netcdf3') return openNetcdf3(reader, opts);
    if (kind === 'hdf5') return openHdf5(reader, opts);
    // HDF5 may sit after a "user block" of 512, 1024, 2048… bytes
    if (!kind) for (let o = 512; o < Math.min(reader.size, 1 << 22); o *= 2) if (sniff(await reader.read(o, 8)) === 'hdf5') return openHdf5(reader, opts);
    if (kind === 'hdf4') throw new Error('This is an HDF4 file (older NASA format). Convert it to HDF5 first, for example with the free h4toh5 tool, then open that.');
    throw new Error('This file is not a GeoTIFF, NetCDF or HDF5 file Bit2Beat can read (it may be damaged, or have the wrong extension).');
  }

  return { fromArrays: describeArrays, MAX_BYTES, EXT, prettyUnits, isScienceName, sniff, open, timeParser, dateLabels, unpacker, sampling };
});
