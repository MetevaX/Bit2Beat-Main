/**
 * Bit2Beat core · Earth data feeds.
 *
 * Each feed has a live fetcher (public, key-free, CORS-enabled APIs) and an offline fallback that
 * uses the real snapshot bundled in src/js/data/snapshots.js. Both paths go through the same
 * `build*` function, so the sound is identical whichever path supplied the numbers.
 *
 * Output is a generic "source":
 *   { name, kind, view, origin:{source,url,fetched,live}, labels[], details[], channels[],
 *     times[] (ms, optional), points[] ({lat,lon}, optional), categories[] (optional) }
 */
(function (root, factory) {
  const deps =
    typeof module === 'object' && module.exports
      ? { geo: require('./geo.js'), snapshots: require('../data/snapshots.js') }
      : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).feeds = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { geo, snapshots } = deps;
  const { SNAPSHOTS } = snapshots;

  async function fetchJson(url, timeoutMs = 10000) {
    if (typeof fetch !== 'function') throw new Error('No network access in this environment.');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      return await res.json();
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? 'The request timed out.' : e?.message || 'Network error.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const utc = (s) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
  const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const fmtLon = (lon) => `${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : lon > 0 ? 'E' : ''}`;
  const fmtLat = (lat) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : lat > 0 ? 'N' : ''}`;
  /** West → east, and north → south where two events share a longitude. */
  const westToEast = (a, b) => a.lon - b.lon || b.lat - a.lat;

  // ---- Earthquakes (USGS) ---------------------------------------------------------------
  const USGS_FEEDS = {
    '4.5_week': 'Magnitude 4.5+, past 7 days',
    '2.5_day': 'Magnitude 2.5+, past 24 hours',
    significant_month: 'Significant, past 30 days',
    '4.5_month': 'Magnitude 4.5+, past 30 days',
  };

  /**
   * rows: [timeISO, lat, lon, depthKm, magnitude, place].
   * Earth events play as one sweep across the map from west to east (like reading the map left
   * to right). Latitude sets the pitch (north = higher), size sets loudness and dot size, depth
   * sets height in 3D sound. `times` holds longitudes, so "map spacing" keeps real distances.
   */
  function buildQuakes(rows, origin, title) {
    const list = rows
      .filter((r) => Number.isFinite(r[4]) && Number.isFinite(r[1]) && Number.isFinite(r[2]))
      .map((r) => ({ t: utc(r[0]), lat: r[1], lon: r[2], depth: r[3], mag: r[4], place: r[5] || 'Unknown place' }))
      .sort(westToEast);
    return {
      name: title,
      kind: 'earth',
      feed: 'quakes',
      view: 'world',
      origin,
      labels: list.map((e) => `${fmtLon(e.lon)} · ${fmtLat(e.lat)}`),
      details: list.map((e) => `M${e.mag.toFixed(1)} · ${e.place} · ${e.depth} km deep · ${fmtDate(e.t)}`),
      times: list.map((e) => e.lon),
      dates: list.map((e) => e.t),
      sizes: list.map((e) => e.mag),
      points: list.map((e) => ({ lat: e.lat, lon: e.lon, depth: e.depth })),
      categories: list.map(() => 'quake'),
      channels: [
        {
          name: 'Earthquakes',
          unit: '° lat',
          values: list.map((e) => e.lat),
          loudBy: list.map((e) => e.mag), // bigger earthquakes are louder
          loudness: true,
          instrument: 'marimba',
          hint: 'Played west to east across the map. Further north = higher note; bigger earthquakes are louder; deeper ones sit lower in 3D sound.',
        },
      ],
      positionZ: list.map((e) => Math.max(0, Math.min(1, 1 - e.depth / 700))),
      perLabel: null,
    };
  }

  async function liveQuakes(feed = '4.5_week') {
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`;
    const j = await fetchJson(url);
    const rows = (j.features || []).map((f) => [
      new Date(f.properties.time).toISOString().slice(0, 16),
      +f.geometry.coordinates[1].toFixed(3),
      +f.geometry.coordinates[0].toFixed(3),
      Math.round(f.geometry.coordinates[2]),
      f.properties.mag,
      f.properties.place,
    ]);
    if (!rows.length) throw new Error('USGS returned no earthquakes for this period.');
    return buildQuakes(rows, { source: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/', fetched: new Date().toISOString(), live: true }, `Earthquakes · ${USGS_FEEDS[feed] || feed}`);
  }
  function offlineQuakes() {
    const s = SNAPSHOTS.quakes;
    return buildQuakes(s.rows, { source: s.source, url: s.url, fetched: s.fetched, live: false }, s.title);
  }

  // ---- Natural events (NASA EONET) --------------------------------------------------------
  const EONET_CATEGORIES = {
    wildfires: { name: 'Wildfires', instrument: 'guitar', land: true, unit: 'ha', log: true },
    severeStorms: { name: 'Storms', instrument: 'strings', land: false, unit: 'kt' },
    floods: { name: 'Floods', instrument: 'marimba', land: true, unit: '' },
    seaLakeIce: { name: 'Sea & lake ice', instrument: 'flute', land: false, unit: 'NM²', log: true },
    volcanoes: { name: 'Volcanoes', instrument: 'organ', land: true, unit: '' },
    earthquakes: { name: 'Earthquakes', instrument: 'bass', land: false, unit: '' },
    landslides: { name: 'Landslides', instrument: 'marimba', land: true, unit: '' },
    drought: { name: 'Drought', instrument: 'warm', land: true, unit: '' },
    dustHaze: { name: 'Dust & haze', instrument: 'warm', land: false, unit: '' },
    snow: { name: 'Snow', instrument: 'flute', land: true, unit: '' },
    tempExtremes: { name: 'Temperature extremes', instrument: 'electric', land: true, unit: '' },
    waterColor: { name: 'Water colour', instrument: 'flute', land: false, unit: '' },
    manmade: { name: 'Man-made', instrument: 'soft', land: true, unit: '' },
  };
  /** Convert EONET magnitudes to one unit per category (acres → hectares). */
  function eonetMagnitude(value, unit) {
    if (!Number.isFinite(value)) return null;
    if (/acre/i.test(unit || '')) return value * 0.40468564224;
    return value;
  }

  /** rows: [id, title, category, timeISO, lat, lon, magnitude, unit] */
  function buildEonet(rows, origin, title) {
    let swapped = 0;
    const clean = rows
      .map((r) => {
        const cat = EONET_CATEGORIES[r[2]] ? r[2] : 'manmade';
        const fixed = geo.fixLatLon(r[4], r[5], EONET_CATEGORIES[cat].land);
        if (fixed.swapped) swapped++;
        return { id: r[0], title: r[1], cat, t: utc(r[3]), lat: fixed.lat, lon: fixed.lon, mag: eonetMagnitude(r[6], r[7]) };
      })
      .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.lat) && Number.isFinite(e.lon))
      .sort(westToEast);
    const cats = [...new Set(clean.map((e) => e.cat))].sort((a, b) => clean.filter((e) => e.cat === b).length - clean.filter((e) => e.cat === a).length);
    return {
      name: title,
      kind: 'earth',
      feed: 'eonet',
      view: 'world',
      origin: { ...origin, note: swapped ? `${swapped} event position${swapped > 1 ? 's were' : ' was'} published as [lat, lon] and corrected.` : '' },
      labels: clean.map((e) => `${fmtLon(e.lon)} · ${fmtLat(e.lat)}`),
      details: clean.map((e) => `${e.title}${e.mag != null ? ' · ' + Math.round(e.mag).toLocaleString('en') + ' ' + EONET_CATEGORIES[e.cat].unit : ''} · ${fmtDate(e.t)}`),
      times: clean.map((e) => e.lon),
      dates: clean.map((e) => e.t),
      points: clean.map((e) => ({ lat: e.lat, lon: e.lon })),
      categories: clean.map((e) => e.cat),
      channels: cats.map((c) => {
        const meta = EONET_CATEGORIES[c];
        return {
          name: meta.name,
          unit: '° lat',
          instrument: meta.instrument,
          // Pitch follows latitude (north = higher); the event's size, when published, sets loudness.
          values: clean.map((e) => (e.cat === c ? e.lat : null)),
          loudBy: clean.map((e) => (e.cat === c ? e.mag : null)),
          loudLog: !!meta.log,
          loudness: true,
          sizeUnit: meta.unit,
          hint: `Played west to east. Further north = higher note${meta.unit ? `; bigger ${meta.name.toLowerCase()} are louder` : ''}.`,
        };
      }),
    };
  }

  async function liveEonet(days = 30) {
    const j = await fetchJson(`https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=${days}`);
    const flat = (a, o = []) => (typeof a[0] === 'number' ? (o.push(a), o) : (a.forEach((x) => flat(x, o)), o));
    let rows = (j.events || [])
      .map((x) => {
        const g = x.geometry?.[x.geometry.length - 1];
        if (!g) return null;
        const pts = flat(g.coordinates);
        const lons = pts.map((p) => p[0]);
        const lats = pts.map((p) => p[1]);
        return [x.id, x.title, x.categories?.[0]?.id || 'manmade', g.date, (Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2, g.magnitudeValue ?? null, g.magnitudeUnit ?? null];
      })
      .filter(Boolean);
    if (!rows.length) throw new Error('EONET returned no events for this period.');
    // Keep the list listenable: all non-wildfire events plus the 60 largest wildfires.
    const fires = rows.filter((r) => r[2] === 'wildfires').sort((a, b) => (eonetMagnitude(b[6], b[7]) || 0) - (eonetMagnitude(a[6], a[7]) || 0));
    rows = [...rows.filter((r) => r[2] !== 'wildfires'), ...fires.slice(0, 60)];
    return buildEonet(rows, { source: 'NASA EONET v3', url: 'https://eonet.gsfc.nasa.gov/', fetched: new Date().toISOString(), live: true }, `Natural events · past ${days} days`);
  }
  function offlineEonet() {
    const s = SNAPSHOTS.eonet;
    return buildEonet(s.rows, { source: s.source, url: s.url, fetched: s.fetched, live: false }, s.title);
  }

  // ---- NASA POWER daily point data ---------------------------------------------------------
  const POWER_PARAMS = {
    T2M: 'Mean temperature (°C)',
    T2M_MAX: 'Max temperature (°C)',
    T2M_MIN: 'Min temperature (°C)',
    ALLSKY_SFC_SW_DWN: 'Sunlight (MJ/m²/day)',
    PRECTOTCORR: 'Rain (mm/day)',
  };
  function dayLabels(startISO, n) {
    const t0 = Date.parse(startISO + 'T00:00:00Z');
    return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
  }
  async function livePower(lat, lon, year, place) {
    const params = Object.keys(POWER_PARAMS).join(',');
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lon}&latitude=${lat}&start=${year}0101&end=${year}1231&format=JSON`;
    const j = await fetchJson(url, 20000);
    const P = j?.properties?.parameter;
    if (!P?.T2M) throw new Error('NASA POWER returned no data for that place and year.');
    const days = Object.keys(P.T2M);
    const series = {};
    for (const [k, name] of Object.entries(POWER_PARAMS)) if (P[k]) series[name] = days.map((d) => (P[k][d] <= -999 ? null : P[k][d]));
    const start = `${days[0].slice(0, 4)}-${days[0].slice(4, 6)}-${days[0].slice(6, 8)}`;
    return dailySource({ title: `${place} daily weather, ${year}`, series, start, origin: { source: 'NASA POWER', url: 'https://power.larc.nasa.gov/', fetched: new Date().toISOString(), live: true } });
  }

  /** Daily series → source. Temperatures share one pitch scale (same unit). */
  function dailySource({ title, series, start, origin }) {
    const names = Object.keys(series);
    const n = series[names[0]].length;
    const instruments = ['soft', 'strings', 'flute', 'marimba', 'electric'];
    return {
      name: title,
      kind: 'data',
      view: 'chart',
      origin,
      labels: dayLabels(start, n),
      perLabel: 30.44,
      perName: 'month',
      channels: names.map((name, i) => ({
        name: name.replace(/\s*\(.*\)$/, ''),
        unit: (name.match(/\(([^)]+)\)$/) || [])[1] || '',
        values: series[name],
        instrument: instruments[i % instruments.length],
        mute: i > 0, // start with one voice; the others are one click away
      })),
    };
  }

  // ---- Natural events and earthquakes together ---------------------------------------------
  /** USGS feed that covers about the same days as an EONET period. */
  const quakeFeedFor = (days) => (days <= 7 ? '4.5_week' : '4.5_month');

  /**
   * One sweep with every NASA EONET natural event and every USGS earthquake: earthquakes become
   * one more channel (bass; bigger = louder, deeper = lower in 3D sound). Either part may be
   * missing (for example when one service is down), then the other plays alone.
   */
  function combineEvents(ev, qk, title, origin) {
    const items = [];
    if (ev) ev.labels.forEach((_, i) => items.push({ s: ev, i, ...ev.points[i] }));
    if (qk) qk.labels.forEach((_, i) => items.push({ s: qk, i, ...qk.points[i] }));
    items.sort(westToEast);
    const pick = (s, key) => items.map((it) => (it.s === s ? s[key]?.[it.i] ?? null : null));
    const taken = new Set((ev?.channels || []).map((c) => c.name));
    const channels = [
      ...(ev?.channels || []).map((c) => ({ ...c, values: items.map((it) => (it.s === ev ? c.values[it.i] : null)), loudBy: items.map((it) => (it.s === ev ? c.loudBy?.[it.i] ?? null : null)) })),
      ...(qk?.channels || []).map((c) => ({
        ...c,
        name: taken.has(c.name) ? `${c.name} (USGS)` : c.name,
        instrument: 'bass',
        sizeUnit: 'magnitude',
        values: items.map((it) => (it.s === qk ? c.values[it.i] : null)),
        loudBy: items.map((it) => (it.s === qk ? c.loudBy[it.i] : null)),
      })),
    ];
    const note = [ev?.origin?.note, ev && qk ? '' : `${ev ? 'USGS earthquakes' : 'NASA EONET events'} were not reachable, so only ${ev ? 'natural events' : 'earthquakes'} play.`].filter(Boolean).join(' ');
    return {
      name: title,
      kind: 'earth',
      feed: 'events',
      view: 'world',
      origin: { ...origin, note },
      labels: items.map((it) => it.s.labels[it.i]),
      details: items.map((it) => it.s.details[it.i]),
      times: items.map((it) => it.lon),
      dates: items.map((it) => it.s.dates[it.i]),
      points: items.map((it) => ({ lat: it.lat, lon: it.lon, ...(it.depth != null ? { depth: it.depth } : {}) })),
      categories: items.map((it) => it.s.categories[it.i]),
      sizes: pick(qk, 'sizes'),
      // earthquakes sit lower the deeper they are; other events at mid height
      positionZ: items.map((it) => (it.s === qk ? qk.positionZ[it.i] : 0.5)),
      channels,
    };
  }

  async function liveEvents(days = 30) {
    const [ev, qk] = await Promise.allSettled([liveEonet(days), liveQuakes(quakeFeedFor(days))]);
    if (ev.status === 'rejected' && qk.status === 'rejected') throw new Error(ev.reason?.message || 'Neither NASA EONET nor USGS answered.');
    const e = ev.status === 'fulfilled' ? ev.value : null;
    const q = qk.status === 'fulfilled' ? qk.value : null;
    return combineEvents(e, q, `Natural events and earthquakes · past ${days} days`, { source: [e && 'NASA EONET v3', q && 'USGS Earthquake Hazards Program'].filter(Boolean).join(' + '), url: e ? 'https://eonet.gsfc.nasa.gov/' : 'https://earthquake.usgs.gov/', fetched: new Date().toISOString(), live: true });
  }
  function offlineEvents() {
    const e = offlineEonet();
    const q = offlineQuakes();
    return combineEvents(e, q, 'Natural events and earthquakes', { source: `${e.origin.source} + ${q.origin.source}`, url: e.origin.url, fetched: e.origin.fetched, live: false });
  }

  return {
    USGS_FEEDS,
    EONET_CATEGORIES,
    POWER_PARAMS,
    fetchJson,
    buildQuakes,
    buildEonet,
    dailySource,
    eonetMagnitude,
    combineEvents,
    quakeFeedFor,
    live: { quakes: liveQuakes, eonet: liveEonet, events: liveEvents, power: livePower },
    offline: { quakes: offlineQuakes, eonet: offlineEonet, events: offlineEvents },
  };
});
