/**
 * Bit2Beat ui · scientific Earth-data files (GeoTIFF / COG, NetCDF, HDF5) in the Image tab.
 *
 * The file stays on this device and is read lazily, a few pieces at a time, so files up to 5 GB
 * open quickly. The "What's inside" panel lists the layers (with units, dates and area) and
 * offers three ways to listen:
 *   Whole map         — the map as a sweep (west → east, north → south or radar), like a picture,
 *                       but from the real values;
 *   One spot over time — click a place (or type its latitude and longitude) to hear it change;
 *   Time-lapse         — one step per date: the map changes as the music plays.
 * Under the pointer a read-out gives the value, the place and the date.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$, toast, announce, pressOne } = B.dom;
  const { science, sciSource, stats } = B;

  const MAP_W = 720; // the map is read at most this wide (it is shown on a card, not printed)
  const MAP_H = 360;
  const LAPSE_FRAMES = 120;

  function init(app) {
    let job = null; // the AbortController of the read in progress

    /** Run a read with progress in the header and a Cancel button in a toast. */
    async function reading(label, fn) {
      job?.abort();
      const ctl = new AbortController();
      job = ctl;
      let last = 0;
      const progress = (done, total) => {
        const now = Date.now();
        if (now - last < 120) return;
        last = now;
        app.busy(true, `${label} ${Math.round((done / Math.max(1, total)) * 100)}%`);
      };
      app.busy(true, label);
      const slow = setTimeout(() => toast(`${label} Large files take a moment.`, 60000, { label: 'Cancel', run: () => ctl.abort() }), 1200);
      try {
        return await fn(ctl.signal, progress);
      } finally {
        clearTimeout(slow);
        if (job === ctl) {
          job = null;
          app.busy(false);
          $('toast').hidden = true;
        }
      }
    }
    const cancelled = (e) => e?.name === 'AbortError';

    /** A picture (canvas) of a grid, at a whole-number scale so small grids stay crisp. */
    function canvasOf(grid, range) {
      const c = document.createElement('canvas');
      c.width = grid.width;
      c.height = grid.height;
      const p = sciSource.paint(grid, range);
      c.getContext('2d').putImageData(new ImageData(p.rgba, grid.width, grid.height), 0, 0);
      const k = Math.max(1, Math.min(8, Math.floor(1200 / Math.max(grid.width, grid.height))));
      if (k === 1) return { canvas: c, paint: p };
      const big = document.createElement('canvas');
      big.width = grid.width * k;
      big.height = grid.height * k;
      const g = big.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(c, 0, 0, big.width, big.height);
      return { canvas: big, paint: p };
    }

    // ---------------------------------------------------------------- open
    /** True when the file is a scientific data file (by its first bytes, whatever its name). */
    async function detect(file) {
      if (science.isScienceName(file.name)) return true;
      if (B.tables.kindOf(file.name, file.type) !== 'unknown') return false;
      try {
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        return !!science.sniff(head);
      } catch {
        return false;
      }
    }

    /** Open a file: returns an image resource for app.useImage (with meta.science). */
    async function open(file) {
      const name = file.name.replace(/\.[a-z0-9]+$/i, '');
      return reading('Opening the file…', async (signal, progress) => {
        const f = await science.open(B.bytes.fileReader(file), { signal, progress });
        if (f.photo) return photo(f, file, signal);
        const sci = { file: f, fileName: file.name, size: file.size, mode: 'sweep', varId: f.variables[0].id, t: 0, layer: 0, spot: null, info: null };
        const res = { canvas: null, meta: { name, origin: { source: `Your file · ${file.name} (${f.format})`, url: '', fetched: '', live: false, note: f.note || '' }, science: sci, noBackground: true } };
        await loadVariable(res, sci.varId, signal, progress);
        return res;
      });
    }

    /** A GeoTIFF already in memory (the Earth Information Center's real values): an image resource. */
    async function fromBytes(u8, { name, origin, label, units }) {
      const f = await science.open(B.bytes.bufferReader(u8));
      f.variables.forEach((v) => {
        if (label) v.label = label;
        if (units) v.units = science.prettyUnits(units);
      });
      const sci = { file: f, fileName: '', size: u8.length, mode: 'sweep', varId: f.variables[0].id, t: 0, layer: 0, spot: null, info: null };
      const res = { canvas: null, meta: { name, origin, science: sci, noBackground: true } };
      await loadVariable(res, sci.varId, undefined, () => {});
      return res;
    }

    /** Built-in maps that need no file (sunlight on Earth, worked out from astronomy). */
    const builtIns = {};
    async function builtIn(id) {
      const had = builtIns[id];
      if (had) {
        // opened again (menu, story): start from the whole map at 12:00 UTC, as the story describes
        Object.assign(had.meta.science, { mode: 'sweep', t: 12, spot: null, spotUV: null, series: null });
        await loadVariable(had, 'sunlight', undefined, () => {});
        return had;
      }
      const L = B.sunlight;
      const f = await science.fromArrays('Built in, works offline', L.arrays(), L.ATTRS);
      const sci = { file: f, fileName: '', size: 0, mode: 'sweep', varId: 'sunlight', t: 12, layer: 0, spot: null, info: null };
      const res = { canvas: null, meta: { name: 'Sunlight on Earth', origin: L.ORIGIN, science: sci, noBackground: true } };
      await loadVariable(res, 'sunlight', undefined, () => {});
      return (builtIns[id] = res);
    }

    /** An ordinary colour photo saved as TIFF: show it as a picture. */
    async function photo(f, file, signal) {
      const v = f.variables.find((x) => x.id === 'band1');
      const [w, h] = [v.shape[1], v.shape[0]];
      const k = Math.min(1, 1200 / Math.max(w, h));
      const size = { width: Math.round(w * k), height: Math.round(h * k), signal };
      const bands = [];
      for (const id of ['band1', 'band2', 'band3']) bands.push((await f.map(id, size)).data);
      const g = await f.map('band1', size);
      const c = document.createElement('canvas');
      [c.width, c.height] = [g.width, g.height];
      const img = new ImageData(g.width, g.height);
      for (let i = 0; i < g.width * g.height; i++) {
        img.data.set([bands[0][i], bands[1][i], bands[2][i], 255], i * 4);
      }
      c.getContext('2d').putImageData(img, 0, 0);
      return { canvas: c, meta: { name: file.name.replace(/\.[a-z0-9]+$/i, ''), origin: { source: 'Your picture · ' + file.name, url: '', fetched: '', live: false } } };
    }

    async function loadVariable(res, id, signal, progress) {
      const sci = res.meta.science;
      sci.varId = id;
      sci.info = await sci.file.info(id);
      sci.t = Math.min(sci.t, Math.max(0, sci.info.steps - 1));
      if (sci.info.steps < 2 && sci.mode !== 'sweep') sci.mode = 'sweep';
      await loadMap(res, signal, progress);
      if (sci.mode === 'timelapse') await loadLapse(res, signal, progress);
      if (sci.mode === 'point') await loadPoint(res, signal, progress);
    }

    async function loadMap(res, signal, progress) {
      const sci = res.meta.science;
      const grid = await sci.file.map(sci.varId, { t: sci.t, layer: sci.layer, width: MAP_W, height: MAP_H, signal, progress });
      sci.grid = grid;
      sci.range = sciSource.colourRange(grid.data);
      const { canvas, paint } = canvasOf(grid, sci.range);
      res.canvas = canvas;
      sci.paint = paint;
      if (!Array.from(grid.data).some(Number.isFinite)) toast('This map has no values at this date or level (all missing).', 5000);
    }

    async function loadLapse(res, signal, progress) {
      const sci = res.meta.science;
      const n = sci.info.steps;
      const pick = science.sampling(n, LAPSE_FRAMES);
      const frames = [];
      for (let k = 0; k < pick.count; k++) {
        const t = pick.start + k * pick.stride;
        const grid = await sci.file.map(sci.varId, { t, layer: sci.layer, width: 240, height: 120, signal });
        frames.push({ grid, t, label: labelAt(sci, t) });
        progress(k + 1, pick.count);
      }
      // one colour range for every frame, so colours can be compared through time
      const all = new Float32Array(frames.reduce((a, f) => a + f.grid.data.length, 0));
      let o = 0;
      frames.forEach((f) => (all.set(f.grid.data, o), (o += f.grid.data.length)));
      sci.lapse = { frames, range: sciSource.colourRange(all), simplified: pick.stride > 1, total: n, shown: -1 };
    }

    async function loadPoint(res, signal, progress) {
      const sci = res.meta.science;
      if (!sci.spot) sci.spot = { fx: 0.5, fy: 0.5 };
      sci.series = await sci.file.series(sci.varId, { ...sci.spot, layer: sci.layer, signal, progress });
      const bb = sci.info.bbox;
      const { lat, lon } = sci.series;
      if (bb && Number.isFinite(lat)) sci.spotUV = { u: (lon - bb[0]) / (bb[2] - bb[0]), v: (bb[3] - lat) / (bb[3] - bb[1]) };
      else if (!sci.spotUV) sci.spotUV = { u: sci.spot.fx ?? 0.5, v: sci.spot.fy ?? 0.5 };
    }

    const labelAt = (sci, t) => {
      if (sci.info.times) {
        if (sci.labelsFor !== sci.info) [sci.labels, sci.labelsFor] = [science.dateLabels(sci.info.times), sci.info];
        return sci.labels[t];
      }
      return sci.file.format.includes('TIFF') ? `band ${t + 1}` : `step ${t + 1}`;
    };

    // ---------------------------------------------------------------- source
    /** The sound source for the current choice (synchronous: everything was read already). */
    function source(res, image) {
      const sci = res.meta.science;
      const v = sci.info;
      const label = (v.label || v.name).replace(/_/g, ' ');
      let built;
      let canvas = res.canvas;
      if (sci.mode === 'point' && sci.series) built = sciSource.point(sci.series, { label, units: v.units });
      else if (sci.mode === 'timelapse' && sci.lapse) {
        built = sciSource.timelapse(sci.lapse.frames, { label, units: v.units });
        canvas = document.createElement('canvas');
        [canvas.width, canvas.height] = [sci.lapse.frames[0].grid.width * 4, sci.lapse.frames[0].grid.height * 4];
        sci.lapse.shown = -1;
      } else built = sciSource.sweep(sci.grid, { path: image.scan, steps: image.steps, label, units: v.units });
      const src = {
        name: `${res.meta.name} · ${label}`,
        kind: 'image',
        view: 'image',
        canvas,
        pixels: null,
        origin: res.meta.origin,
        labels: built.labels,
        details: built.details,
        points: built.points,
        channels: built.channels,
        bounds: null,
        science: { mode: sci.mode, res, frameAt: (i) => frameAt(sci, canvas, i) },
      };
      showPanel(res);
      return src;
    }

    /** Time-lapse: paint the map of step i into the shown canvas (only when it changes). */
    function frameAt(sci, canvas, i) {
      const L = sci.lapse;
      if (!L || L.shown === i || !L.frames[i]) return;
      L.shown = i;
      const f = L.frames[i];
      const small = canvasOf(f.grid, L.range).canvas;
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(small, 0, 0, canvas.width, canvas.height);
    }

    /** The grid shown at step i (time-lapse frames change with the music). */
    const gridAt = (src, i) => {
      const sci = src.science.res.meta.science;
      return src.science.mode === 'timelapse' && sci.lapse ? sci.lapse.frames[Math.min(i, sci.lapse.frames.length - 1)].grid : sci.grid;
    };

    /** Read-out under the pointer: value, place and date. */
    function readout(src, u, v, step) {
      const sci = src.science.res.meta.science;
      const grid = gridAt(src, step);
      const r = sciSource.valueAt(grid, u, v);
      const when = src.science.mode === 'timelapse' ? sci.lapse.frames[Math.min(step, sci.lapse.frames.length - 1)].label : sci.info.times ? labelAt(sci, sci.t) : '';
      const val = Number.isFinite(r.value) ? stats.fmtNum(r.value, sci.info.units) : 'no data';
      const where = Number.isFinite(r.lat) ? sciSource.place(r.lat, r.lon) : `column ${r.x + 1}, row ${r.y + 1}`;
      const text = [val, where, when].filter(Boolean).join(' · ');
      $('sciReadout').textContent = text;
      return { text, value: r.value, lat: r.lat, lon: r.lon };
    }

    // ---------------------------------------------------------------- panel
    let current = null;
    function showPanel(res) {
      current = res;
      const sci = res.meta.science;
      const f = sci.file;
      const v = sci.info;
      $('sciPanel').hidden = false;
      $('analysisGroup').hidden = true;
      const gb = !sci.size ? 'no file needed' : sci.size / 1024 ** 3 >= 0.1 ? `${(sci.size / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(sci.size / 1024 ** 2))} MB`;
      const area = v.bbox ? `${sciSource.place(v.bbox[3], v.bbox[0])} to ${sciSource.place(v.bbox[1], v.bbox[2])}` : 'no map position';
      $('sciSummary').textContent = `${f.format} · ${gb} · ${f.variables.length} layer${f.variables.length > 1 ? 's' : ''}${f.title ? ' · ' + f.title : ''}`;
      const sel = $('sciVar');
      sel.replaceChildren(...f.variables.map((x) => new Option(`${(x.label || x.name).replace(/_/g, ' ')}${x.units ? ' (' + x.units + ')' : ''} · ${x.shape.join(' × ')}`, x.id)));
      sel.value = sci.varId;
      const steps = v.steps || 1;
      $$('#sciMode button').forEach((b) => (b.disabled = b.dataset.sci !== 'sweep' && steps < 2));
      pressOne($('sciMode'), $('sciMode').querySelector(`[data-sci="${sci.mode}"]`));
      $('scanGroup').hidden = sci.mode !== 'sweep';
      $('stepsRange').closest('label').hidden = sci.mode !== 'sweep';
      $('sciTimeField').hidden = steps < 2 || sci.mode !== 'sweep';
      $('sciTime').max = steps - 1;
      $('sciTime').value = sci.t;
      $('sciTimeOut').textContent = labelAt(sci, sci.t);
      const levels = v.axes?.other?.length ? v.shape[v.axes.other[0]] : 1;
      $('sciLayerField').hidden = levels < 2;
      $('sciLayer').max = levels - 1;
      $('sciLayer').value = sci.layer;
      $('sciLayerOut').textContent = `${sci.layer + 1} of ${levels}`;
      $('sciSpot').hidden = sci.mode !== 'point';
      if (sci.series && Number.isFinite(sci.series.lat)) {
        $('sciLat').value = sci.series.lat.toFixed(2);
        $('sciLon').value = sci.series.lon.toFixed(2);
      }
      const P = sci.mode === 'timelapse' && sci.lapse ? sci.lapse.range : sci.range;
      const p = sciSource.paint({ data: new Float32Array(0), width: 0, height: 0 }, P);
      $('sciRamp').style.background = `linear-gradient(90deg, ${p.stops.join(', ')})`;
      $('sciLo').textContent = stats.fmtNum(P.lo, v.units);
      $('sciHi').textContent = stats.fmtNum(P.hi, v.units);
      const notes = [`Area: ${area}.`];
      if (v.dates) notes.push(`Dates: ${v.dates[0]} to ${v.dates[1]} (${steps} steps).`);
      const g = sci.grid;
      if (g?.simplified && sci.mode === 'sweep') notes.push(`Simplified to ${g.width} × ${g.height} points from ${g.from[0]} × ${g.from[1]} so it stays quick (each point is a real value from the file, not an average).`);
      if (sci.mode === 'timelapse' && sci.lapse?.simplified) notes.push(`Time-lapse uses ${sci.lapse.frames.length} of ${sci.lapse.total} dates, evenly spread.`);
      if (sci.mode === 'point' && sci.series?.simplified) notes.push(`Plays ${sci.series.values.length} of ${sci.series.total} dates, evenly spread.`);
      if (sci.mode === 'point') notes.push('Click the map (or type a latitude and longitude) to choose the spot.');
      if (res.meta.origin.note) notes.push(res.meta.origin.note);
      $('sciNote').textContent = notes.join(' ');
    }

    /** Back to an ordinary picture: hide the panel. */
    function sync(res) {
      if (res?.meta?.science) return;
      current = null;
      $('sciPanel').hidden = true;
      $('analysisGroup').hidden = false;
      $('scanGroup').hidden = false;
      $('stepsRange').closest('label').hidden = false;
    }

    async function change(fn, label = 'Reading the file…') {
      const res = current;
      if (!res) return;
      try {
        await reading(label, (signal, progress) => fn(res, signal, progress));
        if (app.state.image.scan === 'pointer' && res.meta.science.mode !== 'sweep') {
          app.state.image.scan = 'line';
          pressOne($('scanGroup'), $('scanGroup').querySelector('[data-scan="line"]'));
          document.body.classList.remove('pointer-mode');
        }
        app.useImage(res);
      } catch (e) {
        if (!cancelled(e)) toast(e.message, 6000);
        showPanel(res);
      }
    }

    $('sciVar').onchange = (e) => change((res, s, p) => loadVariable(res, e.target.value, s, p));
    $$('#sciMode button').forEach((b) => {
      b.onclick = () =>
        change(async (res, s, p) => {
          const sci = res.meta.science;
          sci.mode = b.dataset.sci;
          if (sci.mode === 'timelapse' && !sci.lapse?.frames.length) await loadLapse(res, s, p);
          if (sci.mode === 'point') await loadPoint(res, s, p);
          announce({ sweep: 'Whole map: the map plays as a sweep.', point: 'One spot over time. Click the map or type a latitude and longitude.', timelapse: 'Time-lapse: one step per date.' }[sci.mode]);
        }, b.dataset.sci === 'timelapse' ? 'Reading every date…' : 'Reading the file…');
    });
    $('sciTime').oninput = (e) => current && ($('sciTimeOut').textContent = labelAt(current.meta.science, +e.target.value));
    $('sciTime').onchange = (e) => change(async (res, s, p) => ((res.meta.science.t = +e.target.value), loadMap(res, s, p)));
    $('sciLayer').oninput = (e) => ($('sciLayerOut').textContent = `${+e.target.value + 1} of ${+e.target.max + 1}`);
    $('sciLayer').onchange = (e) =>
      change(async (res, s, p) => {
        const sci = res.meta.science;
        sci.layer = +e.target.value;
        sci.lapse = null;
        await loadMap(res, s, p);
        if (sci.mode === 'timelapse') await loadLapse(res, s, p);
        if (sci.mode === 'point') await loadPoint(res, s, p);
      });

    /** Choose the spot for "One spot over time" (u, v: 0…1 across the shown map). */
    function pickSpot(u, v) {
      const sci = current?.meta.science;
      if (!sci) return;
      const r = sciSource.valueAt(sci.grid, u, v);
      sci.spot = Number.isFinite(r.lat) ? { lat: r.lat, lon: r.lon } : { fx: u, fy: v };
      sci.spotUV = { u, v };
      change((res, s, p) => loadPoint(res, s, p)).then(() => announce(`Now playing ${app.src?.channels?.[0]?.name || 'this spot'} over time.`));
    }
    $('sciGo').onclick = () => {
      const sci = current?.meta.science;
      const lat = +$('sciLat').value;
      const lon = +$('sciLon').value;
      if (!sci || !Number.isFinite(lat) || !Number.isFinite(lon) || $('sciLat').value === '' || $('sciLon').value === '') return toast('Type a latitude (−90 to 90) and a longitude (−180 to 180).');
      sci.spot = { lat, lon };
      const bb = sci.info.bbox;
      sci.spotUV = bb ? { u: (lon - bb[0]) / (bb[2] - bb[0]), v: (bb[3] - lat) / (bb[3] - bb[1]) } : null;
      change((res, s, p) => loadPoint(res, s, p));
    };

    return { detect, open, builtIn, fromBytes, source, sync, readout, pickSpot, gridAt, cancel: () => job?.abort() };
  }

  B.scienceView = { init };
})(typeof self !== 'undefined' ? self : this);
