/**
 * Bit2Beat ui · the “NASA Earth Information Center” form on the Data tab.
 * Pick a data set from earth.gov's live catalogue, a place and how many time steps; Bit2Beat reads
 * the maps through the EIC data API (core/eic.js) and plays them like any other data.
 * “Another catalogue” points the same form at any STAC + raster API (for example NASA VEDA).
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
    const sel = $('eicDataset');

    $('eicPlace').append(new Option('Whole world', E.WORLD));
    B.snapshots.PLACES.forEach(([n, lat, lon]) => $('eicPlace').append(new Option(n, `${lat},${lon}`)));
    $('eicStac').value = api.stac;
    $('eicRaster').value = api.raster;

    function showInfo() {
      const info = list.find((c) => c.id === sel.value);
      $('eicInfo').textContent = info ? `${info.from.slice(0, 4)}–${info.to.slice(0, 4)}${info.density ? ', ' + info.density + 'ly maps' : ''}. ${info.text.slice(0, 220)}${info.text.length > 220 ? '…' : ''}`.replace('dayly', 'daily') : '';
    }

    /** Fill the data-set menu from the catalogue (once; again after changing catalogue). */
    function fill() {
      if (listing) return listing;
      sel.replaceChildren(new Option('Loading data sets…', ''));
      $('eicBtn').disabled = true;
      listing = E.listCollections(get, api.stac)
        .then((cols) => {
          list = cols;
          sel.replaceChildren(...cols.map((c) => new Option(c.title, c.id)));
          const keep = S.eic?.id && cols.some((c) => c.id === S.eic.id) ? S.eic.id : cols.find((c) => /micasa.*month/i.test(c.id))?.id || cols[0]?.id;
          if (keep) sel.value = keep;
          $('eicBtn').disabled = !cols.length;
          showInfo();
          if (!cols.length) sel.replaceChildren(new Option('No data sets found', ''));
        })
        .catch((err) => {
          listing = null;
          sel.replaceChildren(new Option('Needs internet: tap Load to retry', ''));
          $('eicBtn').disabled = false;
          $('eicInfo').textContent = `The catalogue is not reachable (${err.message}).`;
        });
      return listing;
    }

    /** Read and play a data set. `pick` = { id, place, steps } (place: 'world' or 'lat,lon'). */
    async function load(pick) {
      await fill();
      const info = list.find((c) => c.id === pick.id);
      if (!info) return;
      const [lat, lon] = pick.place === E.WORLD ? [] : pick.place.split(',').map(Number);
      const place = pick.place === E.WORLD ? E.WORLD : { lat, lon, name: B.snapshots.PLACES.find((p) => p[1] === lat && p[2] === lon)?.[0] || `${lat}°, ${lon}°` };
      $('eicBtn').disabled = true;
      app.busy(true, 'Asking the Earth Information Center…');
      try {
        const s = await E.load(
          { info, place, steps: pick.steps },
          { get, stac: api.stac, raster: api.raster, name: api.name || 'STAC catalogue', site: api.site || api.stac, progress: (d, n) => app.busy(true, `Reading maps ${d} of ${n}…`) },
        );
        S.eic = pick;
        S.choice.data = 'eic';
        app.setSource(s);
        app.fillSourceSelect();
        toast(`Loaded ${s.labels.length} time steps of ${info.title}.`);
      } catch (err) {
        toast(`Could not load that data set: ${err.message}`, 6500);
      } finally {
        $('eicBtn').disabled = false;
        app.busy(false);
      }
    }

    B.eicView.load = load;
    sel.onchange = showInfo;
    sel.addEventListener('focus', fill);
    $('eicForm').onsubmit = (e) => {
      e.preventDefault();
      if (!list.length) return fill();
      load({ id: sel.value, place: $('eicPlace').value, steps: +$('eicSteps').value });
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
    // fill the menu when the Data tab is first shown (not before: it needs the network)
    if (S.mode === 'data') fill();
    root.addEventListener('b2b:source', () => S.mode === 'data' && fill());
  }

  B.eicView = { init, get };
})(typeof self !== 'undefined' ? self : this);
