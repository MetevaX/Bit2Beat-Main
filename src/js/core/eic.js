/**
 * Bit2Beat core · NASA Earth Information Center (earth.gov) data API.
 *
 * The Earth Information Center publishes its data sets through two open web APIs (no key needed):
 *   - a STAC catalogue   https://earth.gov/eic/api/stac    which data sets exist, and one item (map) per time step
 *   - a raster API       https://earth.gov/eic/api/raster  statistics of any map inside any area
 * To turn a data set into music we take the latest N maps, ask the raster API for the average (and
 * the maximum) inside a box around a place, and play those numbers in time order: one note per map.
 * Some data sets hold several layers per date (e.g. GEOS: CO₂, CH₄ and CO); each becomes a channel.
 *
 * Any other STAC + titiler catalogue works the same way (e.g. NASA VEDA: https://openveda.cloud/api/stac
 * and https://openveda.cloud/api/raster), so adding data is a matter of pointing at its address.
 * Pure functions + an injected `get(url, init)` that returns parsed JSON, so this runs in Node tests.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).eic = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ENDPOINTS = Object.freeze({ stac: 'https://earth.gov/eic/api/stac', raster: 'https://earth.gov/eic/api/raster', name: 'NASA Earth Information Center', site: 'https://earth.gov/' });
  const MAX_REQUESTS = 180; // statistics calls per load (steps × layers)
  const BOX = 1; // degrees around a place: a 2° × 2° box (about 220 km tall)
  const WORLD = 'world';

  const trim = (u) => String(u || '').replace(/\/+$/, '');

  /** The asset (map layer) a collection plays: the one its dashboard renders, else the first data asset. */
  function assetKey(col) {
    const r = col?.renders?.dashboard?.assets?.[0];
    if (r) return r;
    const ia = col?.item_assets || {};
    return Object.keys(ia).find((k) => (ia[k].roles || []).includes('data')) || Object.keys(ia)[0] || 'cog_default';
  }

  /** A collection is playable when it changes over time and is not a set of single plumes or events. */
  function playable(col) {
    const [from, to] = col?.extent?.temporal?.interval?.[0] || [];
    if (!from || !to || from === to) return false;
    return !/plume|perimeter|inventory|mask/i.test(col.id + ' ' + (col.title || ''));
  }

  /** One menu entry per playable collection, sorted by title. */
  function describe(col) {
    const [from, to] = col.extent.temporal.interval[0];
    return {
      id: col.id,
      title: String(col.title || col.id).replace(/\s+/g, ' ').trim(),
      asset: assetKey(col),
      density: col['dashboard:time_density'] || '',
      from: String(from).slice(0, 10),
      to: String(to).slice(0, 10),
      rescale: col.renders?.dashboard?.rescale?.[0] || null,
      colormap: col.renders?.dashboard?.colormap_name || '',
      provider: (col.providers || []).map((p) => p.name).filter(Boolean).join(', '),
      text: String(col.description || '').replace(/\s+/g, ' ').trim(),
    };
  }

  /** Every playable collection of a STAC API (follows "next" links). */
  async function listCollections(get, stac = ENDPOINTS.stac) {
    const out = [];
    let url = `${trim(stac)}/collections?limit=100`;
    for (let page = 0; url && page < 20; page++) {
      const j = await get(url);
      out.push(...(j.collections || []));
      url = (j.links || []).find((l) => l.rel === 'next')?.href || '';
    }
    return out.filter(playable).map(describe).sort((a, b) => a.title.localeCompare(b.title));
  }

  /** GeoJSON box around [lat, lon] (BOX degrees each way), or null for the whole world. */
  function area(place) {
    if (!place || place === WORLD) return null;
    const { lat, lon } = place;
    const s = Math.max(-90, lat - BOX);
    const n = Math.min(90, lat + BOX);
    const w = lon - BOX;
    const e = lon + BOX;
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
  }

  /** The part of an item id that names its layer: the id without the date and without what all layers share. */
  function layerNames(ids) {
    const keys = ids.map((id) => id.replace(/\d{4}[-_]?\d{2}([-_]?\d{2})?(T?\d{2}:?\d{2}(:?\d{2})?)?/g, '#'));
    if (new Set(keys).size < 2) return keys.map(() => '');
    let pre = 0;
    while (keys.every((k) => k[pre] === keys[0][pre]) && pre < keys[0].length) pre++;
    let suf = 0;
    while (keys.every((k) => k[k.length - 1 - suf] === keys[0][keys[0].length - 1 - suf]) && suf < keys[0].length - pre) suf++;
    while (pre > 0 && /[A-Za-z0-9]/.test(keys[0][pre - 1])) pre--; // whole words only
    return keys.map((k) => k.slice(pre, k.length - suf).replace(/^[_\-. ]+|[_\-. ]+$/g, '') || k);
  }

  /** 'g C m-2 day-1' → 'g C m⁻² day⁻¹' (STAC units are plain text). */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const prettyUnit = (u) => String(u || '').replace(/([A-Za-z])(-?\d+)(?![\w.])/g, (_, a, n) => a + [...n].map((c) => SUP[c]).join(''));

  /** How a date is written for a data set's time step. */
  function label(iso, density) {
    const d = String(iso).slice(0, 10);
    return density === 'year' ? d.slice(0, 4) : density === 'month' ? d.slice(0, 7) : d;
  }

  /**
   * The latest `steps` time steps of a collection, oldest first: [{ date, layers: { name: href } }].
   * Several items on the same date are layers of that date.
   */
  async function timeSteps(get, stac, info, steps) {
    const search = (limit) =>
      get(`${trim(stac)}/search`, { method: 'POST', body: { collections: [info.id], limit, sortby: [{ field: 'properties.datetime', direction: 'desc' }] } });
    const first = await search(12);
    const feats0 = first.features || [];
    if (!feats0.length) throw new Error('This data set has no maps yet.');
    const top = feats0[0].properties.datetime;
    const layers = Math.max(1, feats0.filter((f) => f.properties.datetime === top).length);
    const want = Math.max(2, Math.min(steps, Math.floor(MAX_REQUESTS / layers)));
    // a few extra items: some data sets have more than one item on a date
    const all = want * layers + 24 <= feats0.length ? feats0 : (await search(Math.min(500, want * layers + 24))).features || [];
    // items that share a date are layers of that date; with one item per date there are no layers
    const perDate = {};
    all.forEach((f) => (perDate[f.properties.datetime] = (perDate[f.properties.datetime] || 0) + 1));
    const names = Math.max(0, ...Object.values(perDate)) > 1 ? layerNames(all.map((f) => f.id)) : all.map(() => '');
    const byDate = new Map();
    all.forEach((f, i) => {
      const href = f.assets?.[info.asset]?.href || Object.values(f.assets || {}).find((a) => (a.roles || []).includes('data'))?.href;
      if (!href) return;
      const date = f.properties.datetime || f.properties.start_datetime;
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)[names[i]] = { href, bands: f.assets?.[info.asset]?.['raster:bands']?.[0] || null, title: f.assets?.[info.asset]?.title || '' };
    });
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-want)
      .map(([date, l]) => ({ date, layers: l }));
  }

  /** Mean and max of one map inside the area (whole world: a fast overview of the full map). */
  async function statistics(get, raster, layer, place) {
    const geo = area(place);
    const nodata = layer.bands?.nodata;
    const q = `url=${encodeURIComponent(layer.href)}${nodata != null && nodata !== 'nan' ? `&nodata=${encodeURIComponent(nodata)}` : ''}`;
    const j = geo
      ? await get(`${trim(raster)}/cog/statistics?${q}`, { method: 'POST', body: geo })
      : await get(`${trim(raster)}/cog/statistics?${q}&max_size=512`);
    const s = (geo ? j?.properties?.statistics : j) || {};
    const b = s.b1 || Object.values(s)[0];
    if (!b || !b.count || !Number.isFinite(b.mean)) return { mean: null, max: null };
    return { mean: b.mean, max: b.max };
  }

  /** Run `fn` over `items` with at most `n` at a time; `progress(done, total)` after each. */
  async function pool(items, n, fn, progress = () => {}) {
    const out = new Array(items.length);
    let next = 0;
    let done = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
        progress(++done, items.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
  }

  /**
   * Load a playable source: { info (from listCollections), place: 'world' | { name, lat, lon }, steps }.
   * opts: { stac, raster, get, progress(done, total), name (catalogue name), site }.
   */
  async function load({ info, place, steps = 60 }, opts = {}) {
    const { get, stac = ENDPOINTS.stac, raster = ENDPOINTS.raster, progress, name = ENDPOINTS.name, site = ENDPOINTS.site } = opts;
    const times = await timeSteps(get, stac, info, steps);
    if (times.length < 2) throw new Error('this data set is a single map, so there is nothing to play over time. Pick another one.');
    const layerIds = [...new Set(times.flatMap((t) => Object.keys(t.layers)))].slice(0, 4);
    const jobs = times.flatMap((t, ti) => layerIds.filter((l) => t.layers[l]).map((l) => ({ ti, l, layer: t.layers[l] })));
    const stats = await pool(jobs, 6, (j) => statistics(get, raster, j.layer, place).catch(() => ({ mean: null, max: null })), progress);
    const series = {};
    jobs.forEach((j, k) => {
      series[j.l] = series[j.l] || { mean: new Array(times.length).fill(null), max: new Array(times.length).fill(null) };
      series[j.l].mean[j.ti] = stats[k].mean;
      series[j.l].max[j.ti] = stats[k].max;
    });
    const where = place === WORLD || !place ? 'whole world' : place.name;
    if (!Object.values(series).some((s) => s.mean.some((v) => v != null)))
      throw new Error(`No data for ${where} in this data set. Try another place (some data sets cover only the United States) or the whole world.`);
    const unit = prettyUnit(Object.values(times[0].layers)[0]?.bands?.unit);
    const instruments = ['soft', 'strings', 'flute', 'marimba'];
    const channels = [];
    layerIds.forEach((l, i) => {
      // the map layer's own name when it has one ("Net Primary Production (NPP), MiCASA Model v1" → "Net Primary Production (NPP)")
      const layerTitle = String(Object.values(times[0].layers)[0]?.title || '').split(',')[0].replace(/^.*\bdefault\b.*$/i, '').trim();
      const nameOf = l || layerTitle || info.title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s*v\d[\w.]*$/i, '').trim();
      channels.push({ name: `${nameOf}, average`, unit, values: series[l].mean, instrument: instruments[i % 4], mute: i > 0, hint: `Average of the map ${where === 'whole world' ? 'over the whole world' : 'in a 2° box around ' + where}.` });
    });
    layerIds.forEach((l, i) => {
      const nameOf = l || 'Highest';
      channels.push({ name: `${l ? nameOf + ', highest' : 'Highest value'}`, unit, values: series[l].max, instrument: 'marimba', mute: true, hint: 'The peak: the highest value anywhere in the area on each map (the first channel is the average). Muted at first; press M to hear it.' });
    });
    return {
      name: `${info.title} · ${where}`,
      kind: 'data',
      view: 'chart',
      labels: times.map((t) => label(t.date, info.density)),
      channels,
      origin: {
        source: `${name} · ${info.provider || 'NASA'}`,
        url: site,
        live: true,
        fetched: new Date().toISOString(),
        note: `${times.length} ${{ day: 'daily ', month: 'monthly ', year: 'yearly ' }[info.density] || ''}maps from the ${name} data API (${info.id}), the latest available. Each note is the ${where === 'whole world' ? 'average of the whole map' : 'average inside a 2° box around ' + where}.`,
      },
    };
  }


  // ------------------------------------------------------------------ maps as pictures and time-lapses
  // The raster API also draws any map as a PNG in the data set's own colours (its dashboard
  // colour map and range). Bit2Beat uses that for the Image tab (one map, read back through its
  // colour bar) and the Video tab (a time-lapse of the latest maps, one map per note).

  /** The area a picture shows: the whole world, or a 32° × 20° window around a place. */
  function region(place) {
    if (!place || place === WORLD) return { bbox: [-180, -90, 180, 90], width: 960, height: 480, name: 'whole world' };
    const s = Math.max(-90, place.lat - 10);
    const n = Math.min(90, place.lat + 10);
    return { bbox: [place.lon - 16, s, place.lon + 16, n], width: 768, height: Math.round((768 * (n - s)) / 32), name: place.name };
  }

  /** PNG of one map inside a region, drawn with the data set's colour map and range. */
  function mapUrl(raster, layer, info, reg, size = 1, range = null) {
    const r = range || info.rescale || [layer.bands?.statistics?.minimum ?? 0, layer.bands?.statistics?.maximum ?? 1];
    const nodata = layer.bands?.nodata;
    const q = [
      `url=${encodeURIComponent(layer.href)}`,
      `rescale=${r.join(',')}`,
      `colormap_name=${encodeURIComponent(info.colormap || 'viridis')}`,
      nodata != null && nodata !== 'nan' ? `nodata=${encodeURIComponent(nodata)}` : '',
    ].filter(Boolean).join('&');
    const [w, s, e, n] = reg.bbox.map((v) => +v.toFixed(3));
    return `${trim(raster)}/cog/bbox/${w},${s},${e},${n}/${Math.round(reg.width * size)}x${Math.round(reg.height * size)}.png?${q}`;
  }

  /**
   * The same map as real numbers: a GeoTIFF of the values (32-bit float), not colours. Kept small:
   * no mask band (no data comes back as the data set's own no-data value), and about 480 values
   * across for the whole area; zooming in fetches only the part on screen, in more detail.
   */
  function valuesUrl(raster, layer, bbox, width = 480) {
    const nodata = layer.bands?.nodata;
    const q = [`url=${encodeURIComponent(layer.href)}`, 'return_mask=false', nodata != null && nodata !== 'nan' ? `nodata=${encodeURIComponent(nodata)}` : ''].filter(Boolean).join('&');
    const [w, s, e, n] = bbox.map((v) => +(+v).toFixed(3));
    const height = Math.max(8, Math.round((width * (n - s)) / Math.max(1e-6, e - w)));
    return `${trim(raster)}/cog/bbox/${w},${s},${e},${n}/${width}x${Math.min(height, 960)}.tif?${q}`;
  }

  /**
   * A colour key (see core/image.js) made from the colour map the API draws with:
   * colormap = { 0: [r, g, b, a], …, 255: [r, g, b, a] } spread over the data set's range.
   */
  function colorKey(colormap, info, unit, name, range = null) {
    const [lo, hi] = range || info.rescale || [0, 1];
    const ramp = [];
    for (let i = 0; i < 256; i += 8) {
      const c = colormap[i] || colormap[String(i)];
      if (c) ramp.push([c[0], c[1], c[2], +(lo + ((hi - lo) * i) / 255).toPrecision(4)]);
    }
    const last = colormap[255] || colormap['255'];
    if (last) ramp.push([last[0], last[1], last[2], hi]);
    // noBackground: an even map is data (one value everywhere), never an empty page to skip
    return { name, unit, coverName: 'Area with data', min: lo, max: hi, ramp, wL: 1, tol: 12, minChroma: 0, noBackground: true };
  }

  /** With several layers per date, the one the dashboard draws (its asset name, e.g. xco2 → XCO2). */
  function pickLayer(names, info) {
    return names.find((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '') === String(info.asset).toLowerCase().replace(/[^a-z0-9]/g, '')) || names[0];
  }

  const boxOf = (reg) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[reg.bbox[0], reg.bbox[1]], [reg.bbox[2], reg.bbox[1]], [reg.bbox[2], reg.bbox[3]], [reg.bbox[0], reg.bbox[3]], [reg.bbox[0], reg.bbox[1]]]] } });

  /** Statistics of one map inside a region (with the 2nd and 98th percentiles). */
  async function regionStats(get, raster, layer, reg) {
    const nodata = layer.bands?.nodata;
    const j = await get(`${trim(raster)}/cog/statistics?url=${encodeURIComponent(layer.href)}&max_size=512&p=2&p=98${nodata != null && nodata !== 'nan' ? `&nodata=${encodeURIComponent(nodata)}` : ''}`, { method: 'POST', body: boxOf(reg) });
    const b = j?.properties?.statistics?.b1 || Object.values(j?.properties?.statistics || {})[0];
    if (!b || !b.count || !Number.isFinite(b.mean)) return { mean: null, max: null, min: null, p2: null, p98: null };
    const min = b.min ?? b.mean;
    const max = b.max ?? b.mean;
    return { mean: b.mean, max, min, p2: b.percentile_2 ?? min, p98: b.percentile_98 ?? max };
  }

  /**
   * The colour range for pictures of these statistics: the real spread of the data in the area
   * (2nd to 98th percentile), so the map is never one flat colour because the data set's
   * dashboard range does not fit this place. null when every value is the same.
   */
  function rangeOf(stats) {
    const ok = stats.filter((s) => s && s.mean != null);
    if (!ok.length) return null;
    let lo = Math.min(...ok.map((s) => s.p2));
    let hi = Math.max(...ok.map((s) => s.p98));
    if (!(hi - lo > Math.abs(hi) * 1e-6)) {
      lo = Math.min(...ok.map((s) => s.min));
      hi = Math.max(...ok.map((s) => s.max));
    }
    if (!(hi - lo > Math.abs(hi) * 1e-6)) return null;
    const nice = (v) => +v.toPrecision(4);
    return [nice(lo), nice(hi)];
  }
  const flat = (where, stats, unit) => {
    const v = stats.find((s) => s.mean != null)?.mean ?? 0;
    return new Error(`every value of this data set ${where === 'whole world' ? 'in the whole world' : 'around ' + where} is ${+v.toPrecision(3)}${unit ? ' ' + unit : ''}, so there is nothing to hear there. Try another place or the whole world.`);
  };

  /** The newest map of a data set as a picture: { url, date, layer, unit, key, region, source text }. */
  async function latestMap({ info, place }, opts = {}) {
    const { get, stac = ENDPOINTS.stac, raster = ENDPOINTS.raster } = opts;
    const times = await timeSteps(get, stac, info, 1);
    const t = times[times.length - 1];
    const name = pickLayer(Object.keys(t.layers), info);
    const layer = t.layers[name];
    const reg = region(place);
    const unit = prettyUnit(layer.bands?.unit);
    const title = String(layer.title || '').split(',')[0].replace(/^.*\bdefault\b.*$/i, '').trim() || name || info.title;
    const st = await regionStats(get, raster, layer, reg);
    if (st.mean == null) throw new Error(`this map has no data ${reg.name === 'whole world' ? 'at all' : 'around ' + reg.name}. Try the whole world.`);
    const range = rangeOf([st]);
    if (!range) throw flat(reg.name, [st], unit);
    let key = null;
    try {
      key = colorKey(await get(`${trim(raster)}/colorMaps/${encodeURIComponent(info.colormap || 'viridis')}`), info, unit, title, range);
    } catch {
      key = null;
    }
    return { url: mapUrl(raster, layer, info, reg, 1, range), values: valuesUrl(raster, layer, reg.bbox), valuesFor: (bbox) => valuesUrl(raster, layer, bbox), nodata: layer.bands?.nodata ?? null, date: label(t.date, info.density), layer: name, title, unit, key, range, region: reg };
  }

  /**
   * A time-lapse of the latest maps for the Video tab: one picture and one note per map.
   * Each note is the average (and highest value) of exactly the area the picture shows.
   */
  async function timelapse({ info, place, steps = 24 }, opts = {}) {
    const { get, stac = ENDPOINTS.stac, raster = ENDPOINTS.raster, progress, name = ENDPOINTS.name, site = ENDPOINTS.site } = opts;
    const times = await timeSteps(get, stac, info, steps);
    if (times.length < 2) throw new Error('this data set is a single map, so there is no time-lapse. Pick another one.');
    const reg = region(place);
    const layerName = pickLayer(Object.keys(times[times.length - 1].layers), info);
    const frames = times.map((t) => t.layers[layerName] || Object.values(t.layers)[0]);
    const stats = await pool(frames, 6, (layer) => regionStats(get, raster, layer, reg).catch(() => ({ mean: null, max: null })), progress);
    if (!stats.some((s) => s.mean != null)) throw new Error(`these maps have no data ${reg.name === 'whole world' ? 'at all' : 'around ' + reg.name}. Try the whole world.`);
    const unit = prettyUnit(frames[0].bands?.unit);
    // one colour range for every frame, fitted to the data in this area, so changes show as colour
    const range = rangeOf(stats);
    if (!range) throw flat(reg.name, stats, unit);
    const title = String(frames[0].title || '').split(',')[0].replace(/^.*\bdefault\b.*$/i, '').trim() || layerName || info.title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s*v\d[\w.]*$/i, '').trim();
    const per = 0.5; // seconds of time-lapse per map
    return {
      name: `${info.title} · ${reg.name} · time-lapse`,
      kind: 'video',
      view: 'chart',
      labels: times.map((t) => label(t.date, info.density)),
      times: times.map((_, i) => (i + 0.5) * per),
      duration: times.length * per,
      frames: frames.map((l) => mapUrl(raster, l, info, reg, 0.75, range)),
      range,
      channels: [
        { name: `${title}, average`, unit, values: stats.map((s) => s.mean), instrument: 'soft', hint: `Average of the map over the ${reg.name === 'whole world' ? 'whole world' : 'area shown around ' + reg.name}.` },
        { name: 'Highest value', unit, values: stats.map((s) => s.max), instrument: 'marimba', mute: true, hint: 'The peak: the highest value anywhere in the area shown on each map (the first channel is the average). Muted at first; press M to hear it.' },
      ],
      origin: {
        source: `${name} · ${info.provider || 'NASA'}`,
        url: site,
        live: true,
        fetched: new Date().toISOString(),
        note: `Time-lapse of the latest ${times.length} maps (${info.id}) in the data set's own colours, from ${range[0]} to ${range[1]} ${unit}. Each note is the average of the area in the picture.`,
      },
    };
  }

  return { ENDPOINTS, WORLD, BOX, MAX_REQUESTS, prettyUnit, assetKey, playable, describe, listCollections, area, layerNames, label, timeSteps, statistics, pool, load, region, mapUrl, colorKey, pickLayer, regionStats, rangeOf, latestMap, timelapse };
});
