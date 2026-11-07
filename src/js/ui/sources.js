/**
 * Bit2Beat ui · where sources come from (presets, files, live feeds, images).
 * Live data is tried first; if the network fails we use the last live copy saved in this
 * browser, then the real snapshot bundled with the app. The UI always says which one it is.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { storage } = B.dom;

  const EARTH_MENU = [
    ['quakes', 'Earthquakes (USGS)'],
    ['eonet', 'Natural events (NASA EONET)'],
  ];
  const IMAGE_MENU = [
    ['Live NASA satellite view', [['sat:world', 'Whole Earth today (VIIRS NOAA-20)'], ['sat:lights', 'Earth at night, city lights (VIIRS Black Marble)'], ['sat:amazon', 'Amazon rainforest (MODIS)'], ['sat:himalaya', 'Himalaya and Tibetan Plateau (MODIS)'], ['sat:greenland', 'Greenland ice sheet (MODIS)'], ['sat:sahara', 'Western Sahara desert (MODIS)']]],
    ['Works offline', [['map:world', 'World relief map'], ['gen:storm', 'Storm spiral (generated illustration)'], ['gen:aurora', 'Aurora (generated illustration)']]],
  ];

  // ------------------------------------------------------------------ earth
  const cacheKey = (feed, arg) => `b2b-feed3-${feed}-${arg ?? ''}`; // v3: west → east layout

  /** Instant offline source (cached live copy if any, else bundled snapshot). */
  function earthOffline(feed, arg) {
    const cached = storage.get(cacheKey(feed, arg), null);
    if (cached && cached.channels) return { ...cached, origin: { ...cached.origin, live: false, cached: true } };
    return B.feeds.offline[feed]();
  }
  /** Live source; saves a copy for offline use. */
  async function earthLive(feed, arg) {
    const src = await B.feeds.live[feed](arg);
    storage.set(cacheKey(feed, arg), src);
    return src;
  }

  // ------------------------------------------------------------------ data
  function fromCsv(text, fileName) {
    const parsed = B.csv.parseCSV(text);
    return {
      src: {
        name: fileName.replace(/\.(csv|tsv|txt)$/i, ''),
        kind: 'data',
        view: 'chart',
        origin: { source: 'Your file · ' + fileName, url: '', fetched: '', live: false, note: parsed.labelName ? `Steps are labelled by “${parsed.labelName}”.` : '' },
        labels: parsed.labels,
        channels: parsed.cols.map((c, i) => ({ name: c.name, unit: c.unit, values: c.values, instrument: ['soft', 'strings', 'flute', 'marimba', 'electric', 'guitar'][i % 6] })),
      },
      parsed,
    };
  }

  // ------------------------------------------------------------------ image
  /** Analyse a canvas into a source. */
  function fromCanvas(canvas, meta, { analysis = 'light', scan = 'line', steps = 48 } = {}) {
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const path = scan === 'radar' ? 'radar' : 'line';
    const res = B.image.scan(px, canvas.width, canvas.height, { steps, path, analysis });
    return {
      name: meta.name,
      kind: 'image',
      view: 'image',
      canvas,
      pixels: px,
      origin: meta.origin,
      labels: res.labels,
      bounds: res.bounds || null,
      channels: res.channels.map((c, i) => ({ ...c, instrument: ['soft', 'strings', 'flute'][i % 3] })),
      shared: analysis === 'color',
    };
  }

  const satKey = (view, date) => `b2b-sat-${view}-${date}`;

  /** True when more than 60 % of a picture is black (GIBS returns black where there is no data). */
  function mostlyBlack(canvas) {
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    let black = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 64) {
      n++;
      if (d[i] + d[i + 1] + d[i + 2] < 9) black++;
    }
    return black / n > 0.6;
  }

  async function imageCanvas(id, date) {
    const I = B.illustrations;
    if (id.startsWith('gen:')) {
      const kind = id.slice(4);
      return { canvas: I.generate(kind), meta: { name: kind === 'storm' ? 'Storm spiral' : 'Aurora', origin: { source: 'Generated illustration (not satellite data)', url: '', fetched: '', live: false } } };
    }
    if (id === 'map:world') {
      const canvas = await I.loadToCanvas((B.assets && B.assets.worldMap) || 'assets/img/world-map.jpg', 1200);
      return { canvas, meta: { name: 'World relief map', origin: { source: 'Bundled base map (equirectangular)', url: '', fetched: '', live: false } } };
    }
    if (id.startsWith('sat:')) {
      const view = id.slice(4);
      const v = I.SAT_VIEWS[view];
      const when = v.time || date;
      const meta = { name: v.name, origin: { source: `NASA GIBS · ${v.label} · image date ${when}`, url: 'https://gibs.earthdata.nasa.gov/', fetched: new Date().toISOString(), live: true } };
      try {
        const canvas = await I.loadToCanvas(I.gibsUrl(view, when), 1200);
        if (view !== 'lights' && mostlyBlack(canvas)) throw new Error(`no imagery for ${when} yet — pick an earlier date`);
        try {
          localStorage.setItem(satKey(view, when), canvas.toDataURL('image/jpeg', 0.85));
        } catch {}
        return { canvas, meta };
      } catch (e) {
        // Last saved copy of this view, any date.
        try {
          const keys = Object.keys(localStorage).filter((k) => k.startsWith(`b2b-sat-${view}-`)).sort();
          const k = keys[keys.length - 1];
          if (k) {
            const canvas = await I.loadToCanvas(localStorage.getItem(k), 1200);
            return { canvas, meta: { ...meta, origin: { ...meta.origin, source: `NASA GIBS · ${v.label} · image date ${k.split('-').slice(3).join('-')}`, fetched: '', live: false, cached: true } }, warning: 'No connection: using the last satellite view saved in this browser.' };
          }
        } catch {}
        throw new Error(`Could not reach NASA GIBS (${e.message}). Choose an offline picture or try again online.`);
      }
    }
    throw new Error('Unknown image.');
  }

  async function fromImageFile(file) {
    if (file.size > 15 * 1024 * 1024) throw new Error('Please choose an image smaller than 15 MB.');
    const url = URL.createObjectURL(file);
    try {
      const canvas = await B.illustrations.loadToCanvas(url, 1200);
      return { canvas, meta: { name: file.name.replace(/\.[a-z0-9]+$/i, ''), origin: { source: 'Your picture · ' + file.name, url: '', fetched: '', live: false } } };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  B.sources = { EARTH_MENU, IMAGE_MENU, earthOffline, earthLive, fromCsv, fromCanvas, imageCanvas, fromImageFile };
})(typeof self !== 'undefined' ? self : this);
