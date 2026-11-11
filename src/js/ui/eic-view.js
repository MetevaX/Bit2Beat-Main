/**
 * Bit2Beat ui · NASA Earth Information Center (earth.gov) in every tab that takes data.
 *   Data  – a data set, a place and how many maps: one note per map (the average around the place).
 *   Image – the newest map of a data set as a picture, read back through its own colour bar.
 *   Video – a time-lapse of the latest maps: one picture and one note per map.
 * All three share one live catalogue (core/eic.js). “Use another catalogue” points them at any
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
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(url, {
        method: init.method || 'GET',
        signal: ctl.signal,
        headers: init.body ? { 'content-type': 'application/json' } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      return await res.json();
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? 'the request timed out' : e?.message || 'network error');
    } finally {
      clearTimeout(timer);
    }
  }

  function init(app) {
    const S = app.state;
    let api = { ...E.ENDPOINTS, ...(storage.get('b2b-eic-api', null) || {}) };
    let list = [];
    let listing = null;
    const SELECTS = ['eicDataset', 'eicImgDataset', 'eicVidDataset'];
    const placeOf = (v) => {
      if (v === E.WORLD) return E.WORLD;
      const [lat, lon] = v.split(',').map(Number);
      return { lat, lon, name: B.snapshots.PLACES.find((p) => p[1] === lat && p[2] === lon)?.[0] || `${lat}°, ${lon}°` };
    };
    const opts = (extra = {}) => ({ get, stac: api.stac, raster: api.raster, name: api.name || 'STAC catalogue', site: api.site || api.stac, ...extra });

    ['eicPlace', 'eicImgPlace', 'eicVidPlace'].forEach((id) => {
      $(id).append(new Option('Whole world', E.WORLD));
      B.snapshots.PLACES.forEach(([n, lat, lon]) => $(id).append(new Option(n, `${lat},${lon}`)));
    });
    $('eicStac').value = api.stac;
    $('eicRaster').value = api.raster;

    function showInfo() {
      const info = list.find((c) => c.id === $('eicDataset').value);
      $('eicInfo').textContent = info ? `${info.from.slice(0, 4)}–${info.to.slice(0, 4)}${info.density ? ', ' + ({ day: 'daily', month: 'monthly', year: 'yearly' }[info.density] || info.density) + ' maps' : ''}. ${info.text.slice(0, 220)}${info.text.length > 220 ? '…' : ''}` : '';
    }

    /** Fill the three data-set menus from the catalogue (once; again after changing catalogue). */
    function fill() {
      if (listing) return listing;
      SELECTS.forEach((id) => $(id).replaceChildren(new Option('Loading data sets…', '')));
      ['eicBtn', 'eicImgBtn', 'eicVidBtn'].forEach((id) => ($(id).disabled = true));
      listing = E.listCollections(get, api.stac)
        .then((cols) => {
          list = cols;
          const first = cols.find((c) => /micasa.*month/i.test(c.id))?.id || cols[0]?.id;
          SELECTS.forEach((id, k) => {
            $(id).replaceChildren(...(cols.length ? cols.map((c) => new Option(c.title, c.id)) : [new Option('No data sets found', '')]));
            const keep = [S.eic?.id, S.eicImage?.id, S.eicVideo?.id][k];
            $(id).value = keep && cols.some((c) => c.id === keep) ? keep : first || '';
          });
          ['eicBtn', 'eicImgBtn', 'eicVidBtn'].forEach((id) => ($(id).disabled = !cols.length));
          showInfo();
        })
        .catch((err) => {
          listing = null;
          SELECTS.forEach((id) => $(id).replaceChildren(new Option('Needs internet: press the button to retry', '')));
          ['eicBtn', 'eicImgBtn', 'eicVidBtn'].forEach((id) => ($(id).disabled = false));
          $('eicInfo').textContent = `The catalogue is not reachable (${err.message}).`;
        });
      return listing;
    }

    /** Run one load with the button disabled and progress in the status pill. */
    async function busy(btn, label, fn) {
      $(btn).disabled = true;
      app.busy(true, label);
      try {
        return await fn();
      } catch (err) {
        toast(`Could not load that data set: ${err.message}`, 6500);
        return null;
      } finally {
        $(btn).disabled = false;
        app.busy(false);
      }
    }
    const infoFor = async (id) => {
      await fill();
      return list.find((c) => c.id === id);
    };

    /** Data tab. `pick` = { id, place ('world' or 'lat,lon'), steps }. */
    async function load(pick) {
      const info = await infoFor(pick.id);
      if (!info) return;
      const s = await busy('eicBtn', 'Asking the Earth Information Center…', () =>
        E.load({ info, place: placeOf(pick.place), steps: pick.steps }, opts({ progress: (d, n) => app.busy(true, `Reading maps ${d} of ${n}…`) })),
      );
      if (!s) return;
      S.eic = pick;
      S.choice.data = 'eic';
      app.setSource(s);
      app.fillSourceSelect();
      toast(`Loaded ${s.labels.length} time steps of ${info.title}.`);
    }

    /** Image tab: the newest map, read through its own colours. */
    async function loadImage(pick) {
      const info = await infoFor(pick.id);
      if (!info) return;
      const res = await busy('eicImgBtn', 'Drawing the latest map…', async () => {
        const m = await E.latestMap({ info, place: placeOf(pick.place) }, opts());
        const canvas = await B.illustrations.loadToCanvas(m.url, 1200, 30000);
        return {
          canvas,
          meta: {
            name: `${info.title} · ${m.region.name} · ${m.date}`,
            key: m.key,
            origin: { source: `${api.name || 'STAC catalogue'} · ${info.provider || 'NASA'} · map of ${m.date}`, url: api.site || api.stac, fetched: new Date().toISOString(), live: true, note: `The newest map of ${info.id}, drawn by the raster API in the data set's own colours (${(info.rescale || []).join('–')} ${m.unit}). “Colour key” reads the values back out of the picture.` },
          },
        };
      });
      if (!res) return;
      S.eicImage = pick;
      B.eicView.image = res;
      S.choice.image = 'eic';
      app.fillSourceSelect();
      app.useImage(res);
      toast(`Map of ${res.meta.name.split(' · ').pop()} loaded. Each band of the picture is a note.`);
    }

    /** Video tab: a time-lapse of the latest maps. */
    async function loadVideo(pick) {
      const info = await infoFor(pick.id);
      if (!info) return;
      const s = await busy('eicVidBtn', 'Making the time-lapse…', () =>
        E.timelapse({ info, place: placeOf(pick.place), steps: pick.steps }, opts({ progress: (d, n) => app.busy(true, `Reading maps ${d} of ${n}…`) })),
      );
      if (!s) return;
      S.eicVideo = pick;
      B.eicView.video = s;
      S.choice.video = 'eic';
      app.setSource(s);
      app.fillSourceSelect();
      toast(`Time-lapse ready: ${s.labels.length} maps, one note each. Press Play: the maps follow the music.`, 5000);
    }

    Object.assign(B.eicView, { load, loadImage, loadVideo });
    $('eicDataset').onchange = showInfo;
    SELECTS.forEach((id) => $(id).addEventListener('focus', fill));
    $('eicForm').onsubmit = (e) => {
      e.preventDefault();
      if (!list.length) return fill();
      load({ id: $('eicDataset').value, place: $('eicPlace').value, steps: +$('eicSteps').value });
    };
    $('eicImgForm').onsubmit = (e) => {
      e.preventDefault();
      if (!list.length) return fill();
      loadImage({ id: $('eicImgDataset').value, place: $('eicImgPlace').value });
    };
    $('eicVidForm').onsubmit = (e) => {
      e.preventDefault();
      if (!list.length) return fill();
      loadVideo({ id: $('eicVidDataset').value, place: $('eicVidPlace').value, steps: +$('eicVidSteps').value });
    };
    $('eicUse').onclick = () => {
      const stac = $('eicStac').value.trim();
      const raster = $('eicRaster').value.trim();
      if (!/^https:\/\//.test(stac) || !/^https:\/\//.test(raster)) return toast('Both addresses must start with https://');
      const own = stac === E.ENDPOINTS.stac;
      api = own ? { ...E.ENDPOINTS } : { stac, raster, name: new URL(stac).hostname, site: stac };
      storage.set('b2b-eic-api', own ? null : api);
      $('eicTitle').textContent = own ? 'NASA Earth Information Center' : `Catalogue: ${api.name}`;
      listing = null;
      list = [];
      fill();
    };
    $('eicReset').onclick = () => {
      $('eicStac').value = E.ENDPOINTS.stac;
      $('eicRaster').value = E.ENDPOINTS.raster;
      $('eicUse').click();
    };
    if (api.stac !== E.ENDPOINTS.stac) $('eicTitle').textContent = `Catalogue: ${api.name}`;
    // fill the menus once a tab that uses them is open (not before: it needs the network)
    const want = () => ['data', 'image', 'video'].includes(S.mode) && fill();
    want();
    root.addEventListener('b2b:source', want);
  }

  B.eicView = { init, get };
})(typeof self !== 'undefined' ? self : this);
