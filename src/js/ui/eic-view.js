/**
 * Bit2Beat ui · NASA Earth Information Center in every tab that takes data.
 *   Data  – the EIC data API (earth.gov): a data set, a place and how many maps; one note per map.
 *   Image – a picture from the EIC content database (NASA SVS gallery, core/svs.js).
 *   Video – a video from the EIC content database, read two samples a second.
 * The challenge's own data sets are presets in the Image and Video menus and are left out of search.
 * Data sets are found with the search above the tabs (ui/search.js); this file holds the live
 * catalogue (core/eic.js) and loads what was chosen. “Use another catalogue” points it at any
 * STAC + raster API (for example NASA VEDA).
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, toast, storage } = B.dom;
  const E = B.eic;

  /** fetch → JSON with a timeout; `init.body` objects are sent as JSON. */
  async function get(url, init = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeout || 30000);
    try {
      const res = await fetch(url, {
        method: init.method || 'GET',
        signal: ctl.signal,
        headers: init.body ? { 'content-type': 'application/json' } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `the server answered ${res.status}`);
      return j;
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? 'the request timed out' : e?.message || 'network error');
    } finally {
      clearTimeout(timer);
    }
  }

  /** 'world' | 'lat,lon' | 'lat,lon,Name' → a place for core/eic.js */
  function placeOf(v) {
    if (!v || v === E.WORLD) return E.WORLD;
    const [lat, lon, ...rest] = String(v).split(',');
    const la = +lat;
    const lo = +lon;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return E.WORLD;
    const known = B.snapshots.PLACES.find((p) => p[1] === la && p[2] === lo)?.[0];
    return { lat: la, lon: lo, name: known || rest.join(',').trim() || `${la}°, ${lo}°` };
  }

  function init(app) {
    const S = app.state;
    let api = { ...E.ENDPOINTS, ...(storage.get('b2b-eic-api', null) || {}) };
    let list = [];
    let listing = null;
    const opts = (extra = {}) => ({ get, stac: api.stac, raster: api.raster, name: api.name || 'STAC catalogue', site: api.site || api.stac, ...extra });

    $('eicStac').value = api.stac;
    $('eicRaster').value = api.raster;
    const title = () => ($('eicTitle').textContent = api.stac !== E.ENDPOINTS.stac ? api.name : !usesGallery() ? 'NASA Earth Information Center data' : S.mode === 'video' ? 'NASA videos (Earth Information Center gallery)' : 'NASA pictures (Earth Information Center gallery and satellites)');
    root.addEventListener('b2b:mode', () => title());

    /** The catalogue (loaded once; again after changing catalogue). */
    function fill() {
      if (listing) return listing;
      listing = E.listCollections(get, api.stac)
        .then((cols) => {
          list = cols;
          root.dispatchEvent(new CustomEvent('b2b:catalogue', { detail: { count: cols.length } }));
          return cols;
        })
        .catch((err) => {
          listing = null;
          throw new Error(`the catalogue is not reachable (${err.message})`);
        });
      return listing;
    }
    const defaultId = () => list.find((c) => /micasa.*month/i.test(c.id))?.id || list[0]?.id;

    /** Run one load with progress in the status pill. */
    async function busy(label, fn) {
      $('searchBtn').disabled = true;
      app.busy(true, label);
      try {
        return await fn();
      } catch (err) {
        toast(`Could not load that data set: ${err.message}`, 6500);
        return null;
      } finally {
        $('searchBtn').disabled = false;
        app.busy(false);
      }
    }
    const infoFor = async (pick) => {
      try {
        await fill();
      } catch (e) {
        toast(`Earth Information Center: ${e.message}`, 6000);
        return null;
      }
      const info = list.find((c) => c.id === pick.id) || list.find((c) => c.id === defaultId());
      if (info) pick.id = info.id;
      return info;
    };

    // ---------------------------------------------------------------- EIC content database (SVS)
    const SV = B.svs;
    let gallery = [];
    let galleryAll = []; // with the presets: their scientific files (e.g. the 3912 GeoTIFF) are searchable by file type
    let galleryLoading = null;
    const GKEY = 'b2b-eic-gallery2'; // 2: entries list their file types (search filter)
    /** Image and Video search the content database, unless another catalogue was chosen. */
    const usesGallery = (mode = S.mode) => (mode === 'image' || mode === 'video') && api.stac === E.ENDPOINTS.stac;
    function fillGallery() {
      if (gallery.length) return Promise.resolve(gallery);
      if (galleryLoading) return galleryLoading;
      const saved = storage.get(GKEY, null);
      const use = (items) => {
        gallery = SV.catalogue(items);
        galleryAll = SV.catalogue(items, { presets: true });
        root.dispatchEvent(new CustomEvent('b2b:catalogue', { detail: { count: gallery.length } }));
        return gallery;
      };
      if (saved?.items?.length && Date.now() - saved.at < 7 * 864e5) return Promise.resolve(use(saved.items));
      galleryLoading = get('api/eic-gallery?v=3', { timeout: 60000 })
        .then((j) => {
          storage.set(GKEY, { at: Date.now(), items: j.items });
          return use(j.items);
        })
        .catch((err) => {
          galleryLoading = null;
          if (saved?.items?.length) return use(saved.items); // an older copy is better than nothing
          throw new Error(`the Earth Information Center gallery is not reachable (${err.message})`);
        });
      return galleryLoading;
    }

    const originOf = (it) => ({ source: `NASA Earth Information Center gallery · ${it.title} (NASA SVS ${it.id}${it.credit ? ', ' + it.credit : ''})`, url: it.page, fetched: new Date().toISOString(), live: true, note: it.about || '' });

    /** A picture from the content database (saved small in the browser, so presets work offline after once). */
    async function svsStill(it) {
      if (it.offline) {
        // a challenge preset: the copy bundled with the app (works offline, opens at once)
        const canvas = await B.illustrations.loadToCanvas(B.assets?.[`svs${it.id}Image`] || SV.localStill(it.id), 1440, 15000);
        return { canvas, meta: { name: `NASA EIC · ${it.title}`, noBackground: false, origin: { ...originOf(it), fetched: '', live: false, note: `${it.about} A copy bundled with Bit2Beat, so it works offline; the link opens NASA's original page.` } } };
      }
      const key = `b2b-svs-img-${it.id}`;
      let canvas;
      try {
        canvas = await B.illustrations.loadToCanvas(SV.media(it.still), 1200, 45000);
        try {
          const k = Math.min(1, 900 / Math.max(canvas.width, canvas.height));
          const c = document.createElement('canvas');
          [c.width, c.height] = [Math.round(canvas.width * k), Math.round(canvas.height * k)];
          c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
          storage.set(key, c.toDataURL('image/jpeg', 0.82));
        } catch {}
      } catch (e) {
        const copy = storage.get(key, null);
        if (!copy) throw new Error(`NASA's picture could not be loaded (${e.message}). It needs the internet the first time.`);
        canvas = await B.illustrations.loadToCanvas(copy, 1200, 15000);
      }
      return { canvas, meta: { name: `NASA EIC · ${it.title}`, noBackground: false, origin: originOf(it) } };
    }

    /** A video from the content database, read two samples a second (the result is kept in the browser). */
    async function svsVideo(it, { signal } = {}) {
      const clip = it.offline && B.svsClips?.[it.id];
      if (clip) {
        // a challenge preset: a short bundled clip and its analysis (works offline, opens at once)
        const s = JSON.parse(JSON.stringify(clip));
        return { ...s, name: `NASA EIC · ${it.title}`, videoUrl: B.assets?.[`svs${it.id}Video`] || SV.localVideo(it.id), origin: { ...originOf(it), fetched: '', live: false, note: `${it.about ? it.about + ' ' : ''}The first ${Math.round(s.duration)} seconds of NASA's video, bundled with Bit2Beat so it works offline: ${s.labels.length} samples, two per second, of the brightness, colour and motion of the picture.` } };
      }
      const key = `b2b-svs-vid-${it.id}`;
      const url = SV.media(it.video);
      let s = storage.get(key, null);
      if (!s) {
        s = await B.sources.fromVideo(url, { name: it.title, signal, wait: 60000, onProgress: (n, total) => app.busy(true, `Reading NASA's video… ${n}/${total}`) });
        storage.set(key, s);
      }
      return { ...s, name: `NASA EIC · ${it.title}`, videoUrl: url, origin: { ...originOf(it), note: `${it.about ? it.about + ' ' : ''}${s.labels.length} samples, two per second: brightness, colour and motion of the picture.` } };
    }

    /**
     * A challenge preset in the Data tab: what it measures, played as numbers on a chart. A video
     * gives its brightness, colour and motion over time; a picture its bands from left to right.
     */
    async function presetData(id) {
      const it = SV.item(id);
      if (!it) return null;
      let s;
      let how;
      if (it.video && B.svsClips?.[it.id]) {
        s = await svsVideo(it);
        how = `${s.labels.length} samples over the first ${Math.round(s.duration)} seconds of NASA's video, two per second: brightness, colour and motion.`;
      } else {
        const res = await svsStill(it);
        s = B.sources.fromCanvas(res.canvas, res.meta, { analysis: 'light', scan: 'line', steps: 48 });
        how = `NASA's picture cut into ${s.labels.length} bands from left to right: brightness, detail and where the bright parts are.`;
      }
      const { canvas, pixels, videoUrl, bounds, key, ...rest } = s;
      return { ...rest, kind: 'data', view: 'chart', name: it.title, origin: { ...s.origin, note: `${it.about ? it.about + ' ' : ''}Played as data: ${how}` } };
    }

    /** Presets (Image and Video menus): `id` = 'svs:5313'. */
    const presetStill = (id) => svsStill(SV.item(id));
    const presetVideo = (id) =>
      busy('Reading NASA’s video…', () => svsVideo(SV.item(id))).then((s) => {
        if (s) toast(`${s.labels.length} samples of ${SV.item(id).title}. Press play: the video follows the music.`, 5000);
        return s;
      });

    /** Data tab. `pick` = { id, place ('world', 'lat,lon' or 'lat,lon,Name'), steps }. */
    async function load(pick) {
      const info = await infoFor(pick);
      if (!info) return null;
      const s = await busy('Asking the Earth Information Center…', () =>
        E.load({ info, place: placeOf(pick.place), steps: pick.steps || 60 }, opts({ progress: (d, n) => app.busy(true, `Reading maps ${d} of ${n}…`) })),
      );
      if (!s) return null;
      S.eic = { ...pick };
      S.choice.data = 'eic';
      app.setSource(s);
      app.fillSourceSelect();
      toast(`Loaded ${s.labels.length} time steps of ${info.title}.`);
      return s;
    }

    /** Image tab: the newest map, read through its own colours. */
    /** A NASA satellite image (GIBS) of the whole world, on black where the layer has no data. */
    async function gibsImage(l) {
      const key = `b2b-gibs-${l.key}`;
      const when = B.gibs.timeOf(l);
      let canvas;
      let saved = false;
      try {
        const img = await B.illustrations.loadToCanvas(B.gibs.url(l), 1440, 45000);
        canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = [img.width, img.height];
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#000';
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0);
        try {
          storage.set(key, canvas.toDataURL('image/jpeg', 0.85));
        } catch {}
      } catch (e) {
        const copy = storage.get(key, null);
        if (!copy) throw new Error(`NASA's satellite image could not be loaded (${e.message}).`);
        canvas = await B.illustrations.loadToCanvas(copy, 1440, 15000);
        saved = true;
      }
      return { canvas, meta: { name: `NASA satellite · ${l.title}`, origin: { source: `NASA GIBS · ${l.by} · ${l.title}${when ? ' · ' + when : ''}`, url: 'https://worldview.earthdata.nasa.gov/', fetched: saved ? '' : new Date().toISOString(), live: !saved, cached: saved, note: `${l.about} The whole world, west on the left; black where the layer has no data (silent).` } } };
    }

    /** An EIC data set's newest map as a GeoTIFF of real values: a scientific map (layers, zoom, surround). */
    async function eicGeoTiff(info, place) {
      const m = await E.latestMap({ info, place: placeOf(place) }, opts());
      const bytes = async (url, signal) => {
        const r = await fetch(url, { signal: signal || (AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined) });
        if (!r.ok) throw new Error(`the raster API answered ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      };
      return app.sci.fromBytes(await bytes(m.values), {
        name: `${info.title} · ${m.region.name} · ${m.date}`,
        label: m.title,
        units: m.unit,
        nodata: m.nodata,
        fetchBox: (bbox, signal) => bytes(m.valuesFor(bbox), signal),
        origin: { source: `${api.name || 'STAC catalogue'} · ${info.provider || 'NASA'} · GeoTIFF of ${m.date}`, url: api.site || api.stac, fetched: new Date().toISOString(), live: true, note: `The newest map of ${info.id} as a GeoTIFF file of real values (not colours), from the Earth Information Center's raster API. Zoom in to read that part again in detail.` },
      });
    }

    async function loadImage(pick) {
      if (!pick.id && usesGallery('image')) return app.choose('image', 'svs:3912'), null;
      // a scientific file: an EIC data set as GeoTIFF, or a GeoTIFF / NetCDF / HDF5 file in NASA's gallery
      const file = String(pick.id).match(/^(tif|nc|h5):(.+)$/);
      if (file) {
        const [, type, ref] = file;
        let res;
        if (/^svs-/.test(ref)) {
          await fillGallery().catch(() => gallery);
          const entry = galleryAll.find((c) => c.id === `svs:${ref.slice(4)}`);
          const path = entry?.svs.f?.[type];
          if (!path) return toast('That file is no longer in the gallery.'), null;
          const it = SV.item(entry.svs);
          res = await app.sci.openUrl(SV.media(path), { name: `NASA EIC · ${it.title}`, fileName: path.split('/').pop(), origin: { ...originOf(it), note: `${it.about ? it.about + ' ' : ''}File: ${path.split('/').pop()}.` } }).catch((e) => (e?.name === 'AbortError' ? null : (toast(`NASA's file could not be opened: ${e.message}`, 7000), null)));
        } else {
          const info = await infoFor({ id: ref });
          if (!info) return null;
          res = await busy('Getting the GeoTIFF…', () => eicGeoTiff(info, pick.place));
        }
        if (!res) return null;
        S.eicImage = { ...pick };
        B.eicView.image = res;
        S.choice.image = 'eic';
        app.fillSourceSelect();
        app.useImage(res);
        return res;
      }
      if (String(pick.id).startsWith('gibs:')) {
        const l = B.gibs.find(pick.id);
        if (!l) return null;
        const res = await busy('Getting NASA’s satellite image…', () => gibsImage(l));
        if (!res) return null;
        S.eicImage = { id: pick.id };
        B.eicView.image = res;
        S.choice.image = 'eic';
        app.fillSourceSelect();
        app.useImage(res);
        return res;
      }
      if (String(pick.id).startsWith('svs:')) {
        const entry = (await fillGallery().catch(() => gallery)).find((c) => c.id === pick.id);
        const it = SV.item(entry?.svs || pick.id);
        if (!it) return toast('That picture is no longer in the gallery.'), null;
        const res = await busy('Loading NASA’s picture…', () => svsStill(it));
        if (!res) return null;
        S.eicImage = { id: pick.id };
        B.eicView.image = res;
        S.choice.image = 'eic';
        app.fillSourceSelect();
        app.useImage(res);
        return res;
      }
      const info = await infoFor(pick);
      if (!info) return null;
      const res = await busy('Drawing the latest map…', async () => {
        const m = await E.latestMap({ info, place: placeOf(pick.place) }, opts());
        const canvas = await B.illustrations.loadToCanvas(m.url, 1200, 30000);
        return {
          canvas,
          meta: {
            name: `${info.title} · ${m.region.name} · ${m.date}`,
            key: m.key,
            noBackground: true,
            origin: { source: `${api.name || 'STAC catalogue'} · ${info.provider || 'NASA'} · map of ${m.date}`, url: api.site || api.stac, fetched: new Date().toISOString(), live: true, note: `The newest map of ${info.id}, drawn by the raster API in the data set's colours from ${m.range.join(' to ')} ${m.unit} (the spread of the data in this area). “Colour key” reads the values back out of the picture.` },
          },
        };
      });
      if (!res) return null;
      S.eicImage = { ...pick };
      B.eicView.image = res;
      S.choice.image = 'eic';
      app.fillSourceSelect();
      app.useImage(res);
      toast(`Map of ${res.meta.name.split(' · ').pop()} loaded. Each band of the picture is a note.`);
      return res;
    }

    /** Video tab: a time-lapse of the latest maps. */
    async function loadVideo(pick) {
      if (!pick.id && usesGallery('video')) return app.choose('video', 'svs:3912'), null;
      if (String(pick.id).startsWith('svs:')) {
        const entry = (await fillGallery().catch(() => gallery)).find((c) => c.id === pick.id);
        const it = SV.item(entry?.svs || pick.id);
        if (!it?.video) return toast('This one is a picture: open it in the Image tab.'), null;
        const s = await busy('Reading NASA’s video…', () => svsVideo(it));
        if (!s) return null;
        S.eicVideo = { id: pick.id };
        B.eicView.video = s;
        S.choice.video = 'eic';
        app.setSource(s);
        app.fillSourceSelect();
        toast(`${s.labels.length} samples, two per second. Press Play: the video follows the music.`, 5000);
        return s;
      }
      const info = await infoFor(pick);
      if (!info) return null;
      const s = await busy('Making the time-lapse…', () =>
        E.timelapse({ info, place: placeOf(pick.place), steps: pick.steps || 24 }, opts({ progress: (d, n) => app.busy(true, `Reading maps ${d} of ${n}…`) })),
      );
      if (!s) return null;
      S.eicVideo = { ...pick };
      B.eicView.video = s;
      S.choice.video = 'eic';
      app.setSource(s);
      app.fillSourceSelect();
      toast(`Time-lapse ready: ${s.labels.length} maps, one note each. Press Play: the maps follow the music.`, 5000);
      return s;
    }

    // search, one catalogue per tab (presets left out):
    //   Image – the gallery's pictures and NASA satellite images (GIBS); Video – the gallery's videos;
    //   Data – the EIC data API.
    // File type (search filter): any, picture, video, tif (GeoTIFF), nc (NetCDF), h5 (HDF5).
    // GeoTIFF also lists every EIC data set: its newest map comes as a GeoTIFF of real values.
    const gibsList = B.gibs.catalogue();
    const FILE_NAME = { tif: 'GeoTIFF', nc: 'NetCDF', h5: 'HDF5' };
    const asFile = (c, type) => ({ ...c, id: `${type}:${c.svs ? 'svs-' + c.svs.id : c.id}`, kind: `${FILE_NAME[type]} file (.${type})`, exts: [type], file: type });
    function catalogueFor(mode = S.mode, type = 'any') {
      if (FILE_NAME[type]) {
        const own = galleryAll.filter((c) => c.svs.f?.[type]).map((c) => asFile(c, type));
        return type === 'tif' && api.stac === E.ENDPOINTS.stac ? [...own, ...list.map((c) => asFile({ ...c, exts: ['tif'] }, 'tif'))] : own;
      }
      if (!usesGallery(mode)) return list;
      if (mode === 'video') return gallery.filter((c) => c.kind === 'video');
      return [...gallery.filter((c) => c.kind === 'picture'), ...gibsList];
    }
    /** How many of each file type there are (for the filter menu). */
    const typeCounts = () => Object.fromEntries(Object.keys(FILE_NAME).map((t) => [t, catalogueFor('image', t).length]));
    function fillFor(type = 'any') {
      const mode = S.mode;
      if (FILE_NAME[type]) return Promise.allSettled([fillGallery(), fill()]).then(() => catalogueFor(mode, type));
      if (!usesGallery(mode)) return fill();
      // satellite images need no gallery: the Image tab can search even when NASA's gallery is slow
      return fillGallery().then(
        () => catalogueFor(mode),
        (e) => {
          if (mode === 'image') return catalogueFor(mode);
          throw e;
        },
      );
    }
    Object.assign(B.eicView, { load, loadImage, loadVideo, presetData, fill: fillFor, catalogue: (type) => catalogueFor(S.mode, type), typeCounts, FILE_NAME, api: () => api, usesGallery, presetStill, presetVideo });
    $('eicUse').onclick = () => {
      const stac = $('eicStac').value.trim();
      const raster = $('eicRaster').value.trim();
      if (!/^https:\/\//.test(stac) || !/^https:\/\//.test(raster)) return toast('Both addresses must start with https://');
      const own = stac === E.ENDPOINTS.stac;
      api = own ? { ...E.ENDPOINTS } : { stac, raster, name: new URL(stac).hostname, site: stac };
      storage.set('b2b-eic-api', own ? null : api);
      title();
      listing = null;
      list = [];
      fill()
        .then((cols) => toast(`${cols.length} data sets in ${api.name}. Search them above.`))
        .catch((e) => toast(e.message, 6000));
    };
    $('eicReset').onclick = () => {
      $('eicStac').value = E.ENDPOINTS.stac;
      $('eicRaster').value = E.ENDPOINTS.raster;
      $('eicUse').click();
    };
    title();
  }

  B.eicView = { init, get, placeOf };
})(typeof self !== 'undefined' ? self : this);
