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
    let galleryLoading = null;
    const GKEY = 'b2b-eic-gallery';
    /** Image and Video search the content database, unless another catalogue was chosen. */
    const usesGallery = (mode = S.mode) => (mode === 'image' || mode === 'video') && api.stac === E.ENDPOINTS.stac;
    function fillGallery() {
      if (gallery.length) return Promise.resolve(gallery);
      if (galleryLoading) return galleryLoading;
      const saved = storage.get(GKEY, null);
      const use = (items) => {
        gallery = SV.catalogue(items);
        root.dispatchEvent(new CustomEvent('b2b:catalogue', { detail: { count: gallery.length } }));
        return gallery;
      };
      if (saved?.items?.length && Date.now() - saved.at < 7 * 864e5) return Promise.resolve(use(saved.items));
      galleryLoading = get('api/eic-gallery', { timeout: 60000 })
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
      const key = `b2b-svs-vid-${it.id}`;
      const url = SV.media(it.video);
      let s = storage.get(key, null);
      if (!s) {
        s = await B.sources.fromVideo(url, { name: it.title, signal, wait: 60000, onProgress: (n, total) => app.busy(true, `Reading NASA's video… ${n}/${total}`) });
        storage.set(key, s);
      }
      return { ...s, name: `NASA EIC · ${it.title}`, videoUrl: url, origin: { ...originOf(it), note: `${it.about ? it.about + ' ' : ''}${s.labels.length} samples, two per second: brightness, colour and motion of the picture.` } };
    }

    /** Presets (Image and Video menus): `id` = 'svs:5313'. */
    const presetStill = (id) => svsStill(SV.item(id));
    const presetVideo = (id) =>
      busy('Reading NASA’s video…', () => svsVideo(SV.item(id))).then((s) => {
        if (s) toast(`${s.labels.length} samples of ${SV.item(id).title}. Press Play: the video follows the music.`, 5000);
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

    async function loadImage(pick) {
      if (!pick.id && usesGallery('image')) return app.choose('image', 'nasa:gedi'), null;
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
      if (!pick.id && usesGallery('video')) return app.choose('video', 'gedi'), null;
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
    const gibsList = B.gibs.catalogue();
    function catalogueFor(mode = S.mode) {
      if (!usesGallery(mode)) return list;
      if (mode === 'video') return gallery.filter((c) => c.kind === 'video');
      return [...gallery.filter((c) => c.kind === 'picture'), ...gibsList];
    }
    function fillFor() {
      const mode = S.mode;
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
    Object.assign(B.eicView, { load, loadImage, loadVideo, fill: fillFor, catalogue: () => catalogueFor(), api: () => api, usesGallery, presetStill, presetVideo });
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
