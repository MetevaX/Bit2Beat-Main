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
      byDate.get(date)[names[i]] = { href, bands: f.assets?.[info.asset]?.['raster:bands']?.[0] || null };
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
      const nameOf = l ? l : info.title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s*v\d[\w.]*$/i, '').trim();
      channels.push({ name: `${nameOf}, average`, unit, values: series[l].mean, instrument: instruments[i % 4], mute: i > 0, hint: `Average of the map ${where === 'whole world' ? 'over the whole world' : 'in a 2° box around ' + where}.` });
    });
    layerIds.forEach((l, i) => {
      const nameOf = l || 'Highest';
      channels.push({ name: `${l ? nameOf + ', highest' : 'Highest value'}`, unit, values: series[l].max, instrument: 'marimba', mute: true, hint: 'Highest value in the same area.' });
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

  return { ENDPOINTS, WORLD, BOX, MAX_REQUESTS, prettyUnit, assetKey, playable, describe, listCollections, area, layerNames, label, timeSteps, statistics, pool, load };
});
