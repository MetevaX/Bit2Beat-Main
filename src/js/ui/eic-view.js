/**
 * Bit2Beat ui · NASA Earth Information Center (earth.gov) in every tab that takes data.
 *   Data  – a data set, a place and how many maps: one note per map (the average around the place).
 *   Image – the newest map of a data set as a picture, read back through its own colour bar.
 *   Video – a time-lapse of the latest maps: one picture and one note per map.
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
    const title = () => ($('eicTitle').textContent = api.stac === E.ENDPOINTS.stac ? 'NASA Earth Information Center' : api.name);

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
    async function loadImage(pick) {
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

    Object.assign(B.eicView, { load, loadImage, loadVideo, fill, catalogue: () => list, api: () => api });
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
