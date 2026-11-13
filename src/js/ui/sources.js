/**
 * Bit2Beat ui · where sources come from (presets, files, live feeds, images).
 * Live data is tried first; if the network fails we use the last live copy saved in this
 * browser, then the real snapshot bundled with the app. The UI always says which one it is.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { storage } = B.dom;

  // natural events and earthquakes play together (earthquakes are one more channel); the
  // offline sample of both always works. (Each feed alone, 'eonet' and 'quakes', is still used by the story.)
  const EARTH_MENU = [
    ['events', 'Natural events and earthquakes (NASA EONET + USGS)'],
    ['sample:events', 'Natural events and earthquakes · offline sample'],
  ];
  // the Space Apps challenge's data sets (core/svs.js): GEDI and CO₂ are bundled, the others load from NASA
  const VIDEO_MENU = [['gedi', 'NASA EIC · GEDI forest height'], ['co2', 'NASA EIC · Global carbon dioxide'], ...B.svs.PRESETS.filter((p) => !p.bundled && p.video).map((p) => [`svs:${p.id}`, `NASA EIC · ${p.name}`])];
  function earthSample(id) {
    const source = B.feeds.offline[id.slice(7)]();
    source.name += ' · sample';
    source.origin.note = (source.origin.note || '') + ' Bundled historical sample; choose a live source for current events.';
    return source;
  }
  function videoPreset(id) {
    const item = B.nasaMedia[id];
    if (!item) throw new Error('Unknown video preset.');
    const source = JSON.parse(JSON.stringify(item.source));
    source.videoUrl = B.assets?.[id + 'Video'] || `assets/nasa/${id}.mp4`;
    source.key = B.nasaKeys?.[id] || null;
    return source;
  }
  const IMAGE_MENU = [
    ['NASA EIC · works offline', [['nasa:gedi', 'GEDI forest height'], ['nasa:co2', 'Global carbon dioxide']]],
    ['NASA EIC · Space Apps challenge data', B.svs.PRESETS.filter((p) => !p.bundled && p.still).map((p) => [`svs:${p.id}`, p.name])],
    ['Live NASA satellite view', [['sat:world', 'Whole Earth today (VIIRS NOAA-20)'], ['sat:lights', 'Earth at night, city lights (VIIRS Black Marble)'], ['sat:amazon', 'Amazon rainforest (MODIS)'], ['sat:himalaya', 'Himalaya and Tibetan Plateau (MODIS)'], ['sat:greenland', 'Greenland ice sheet (MODIS)'], ['sat:sahara', 'Western Sahara desert (MODIS)']]],
    ['Works offline', [['sci:sunlight', 'Sunlight on Earth, 21 June (worked out from astronomy)'], ['map:world', 'World relief map'], ['gen:storm', 'Storm spiral (generated illustration)'], ['gen:aurora', 'Aurora (generated illustration)']]],
  ];

  // ------------------------------------------------------------------ earth
  const cacheKey = (feed, arg) => `b2b-feed4-${feed}-${arg ?? ''}`; // v4: never keeps a copy with one kind of event missing

  /** Instant offline source (cached live copy if any, else bundled snapshot). */
  function earthOffline(feed, arg) {
    const cached = storage.get(cacheKey(feed, arg), null);
    if (cached && cached.channels) return { ...cached, origin: { ...cached.origin, live: false, cached: true } };
    return B.feeds.offline[feed]();
  }
  /** Live source; saves a copy for offline use. */
  async function earthLive(feed, arg) {
    // the combined sweep fills a part that did not answer with that feed's own saved copy
    const saved = feed === 'events' ? { eonet: () => earthOffline('eonet', arg), quakes: () => earthOffline('quakes', B.feeds.quakeFeedFor(arg)) } : undefined;
    const src = await B.feeds.live[feed](arg, saved);
    if (!src.partial) storage.set(cacheKey(feed, arg), src);
    return src;
  }

  // ------------------------------------------------------------------ data
  function fromCsv(text, fileName) {
    const parsed = B.csv.parseCSV(text);
    return {
      src: {
        name: fileName.replace(/\.[a-z0-9]+$/i, ''),
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
    const path = ['radar', 'down'].includes(scan) ? scan : 'line';
    const key = analysis === 'key' ? meta.key || null : null;
    const res = B.image.scan(px, canvas.width, canvas.height, { steps, path, analysis: key ? 'key' : analysis === 'key' ? 'light' : analysis, key, background: !meta.noBackground });
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
      key,
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
    if (id.startsWith('nasa:')) {
      const key = id.slice(5);
      const item = B.nasaMedia[key];
      if (!item) throw new Error('Unknown NASA image preset.');
      const canvas = await I.loadToCanvas(B.assets?.[key + 'Image'] || `assets/nasa/${key}.jpg`, 1200);
      const k = B.nasaKeys?.[key] || null;
      return {
        canvas,
        meta: {
          name: item.source.name + ' · still image',
          key: k,
          origin: { ...item.source.origin, note: k ? `NASA SVS visualization from the EIC gallery. “Colour key” reads ${/^[A-Z][a-z]/.test(k.name) ? k.name.toLowerCase() : k.name} (${k.unit}) back out of the picture through its own colour bar.` : 'NASA SVS visualization from the EIC gallery.' },
        },
      };
    }
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

  /** Raw-deflate decompression for spreadsheets (.xlsx, .ods), done by the browser. */
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open spreadsheets: save the sheet as CSV.');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }

  async function fromImageFile(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error('Please choose an image smaller than 25 MB.');
    const url = URL.createObjectURL(file);
    const ext = B.tables.extOf(file.name);
    try {
      const canvas = await B.illustrations.loadToCanvas(url, 1200).catch(() => {
        throw new Error(`Your browser cannot open this ${ext ? '.' + ext + ' ' : ''}picture. Save it as JPG or PNG and open that.`);
      });
      return { canvas, meta: { name: file.name.replace(/\.[a-z0-9]+$/i, ''), origin: { source: 'Your picture · ' + file.name, url: '', fetched: '', live: false } } };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Decode a bounded number of small frames locally, keeping only two pixel buffers. */
  async function fromVideoFile(file, { signal, onProgress = () => {} } = {}) {
    if (file.size > 200 * 1024 * 1024) throw new Error('Please choose a video smaller than 200 MB.');
    const url = URL.createObjectURL(file);
    try {
      const s = await fromVideo(url, { name: file.name, signal, onProgress, wait: 15000 });
      s.origin = { source: 'Your video · ' + file.name, url: '', fetched: '', live: false, note: s.origin.note + ' Reopen the file after a refresh.' };
      return s;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Analyse a video at an address (a file of yours, or a NASA video through /svs/). */
  async function fromVideo(url, { name = 'video', signal, onProgress = () => {}, wait = 15000 } = {}) {
    const file = { name };
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const aborted = () => new DOMException('Video analysis cancelled.', 'AbortError');
    function waitFor(event, action) {
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener(event, done);
          video.removeEventListener('error', fail);
          signal?.removeEventListener('abort', cancel);
        };
        const done = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error(`Your browser cannot play this video${B.tables.extOf(file.name) ? ' (.' + B.tables.extOf(file.name) + ')' : ''}. Convert it to MP4 or WebM and open that.`)); };
        const cancel = () => { cleanup(); reject(aborted()); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Video decoding timed out. Try a shorter clip.')); }, wait);
        video.addEventListener(event, done, { once: true });
        video.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) return cancel();
        try { action(); } catch (e) { cleanup(); reject(e); }
      });
    }
    try {
      await waitFor('loadeddata', () => { video.src = url; video.load(); });
      const times = B.video.sampleTimes(video.duration);
      if (!video.videoWidth || !video.videoHeight) throw new Error('This file has no readable video frames.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 160 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const grab = async (t) => {
        if (signal?.aborted) throw aborted();
        await waitFor('seeked', () => {
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      // one background for the whole video, taken from the middle frame
      const bg = B.image.background(await grab(video.duration / 2), canvas.width, canvas.height);
      const channels = B.video.channels().map((c) => ({ ...c, values: [] }));
      // two moments per sample, averaged (anti-aliasing, see video.windowTimes)
      const windows = B.video.windowTimes(video.duration, times.length, 2);
      for (let i = 0; i < windows.length; i++) {
        const rows = [];
        for (const t of windows[i]) {
          const before = await grab(B.video.motionTime(t));
          rows.push(B.video.measure(await grab(t), canvas.width, canvas.height, before, bg));
        }
        B.video.average(rows).forEach((v, j) => channels[j].values.push(v));
        onProgress(i + 1, windows.length);
      }
      return {
        name: file.name.replace(/\.[a-z0-9]+$/i, ''), kind: 'video', view: 'chart',
        labels: times.map((t) => `${t.toFixed(1)} s`), times, duration: video.duration, channels,
        origin: { source: name, url: '', fetched: '', live: false,
          note: `${times.length} frames over ${video.duration.toFixed(1)} s (two per second): brightness, colour and motion of the picture, background left out. Original sound is ignored.` },
      };
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  function fillSourceSelect(state, uploads, src, sel) {
    sel.replaceChildren();
    const add = (parent, [v, t]) => parent.append(new Option(t, v));
    if (state.mode === 'data') {
      B.presets.DATA_MENU.forEach(([label, items]) => {
        const og = document.createElement('optgroup');
        og.label = label;
        items.forEach((it) => add(og, it));
        sel.append(og);
      });
      if (uploads.data) add(sel, ['upload', 'Your file: ' + uploads.data.name]);
      if (state.choice.data === 'custom') add(sel, ['custom', src?.name || 'Saved session data']);
      if (state.choice.data === 'power') add(sel, ['power', src?.name || 'NASA POWER data']);
      if (state.choice.data === 'eic') add(sel, ['eic', src?.name || 'NASA Earth Information Center data']);
    } else if (state.mode === 'video') {
      B.sources.VIDEO_MENU.forEach((it) => add(sel, it));
      if (uploads.video) add(sel, ['upload', 'Your video: ' + uploads.video.name]);
      if (state.choice.video === 'custom') add(sel, ['custom', src?.name || 'Saved video analysis']);
      if (state.choice.video === 'eic') add(sel, ['eic', B.eicView?.video?.name || 'NASA Earth Information Center time-lapse']);
    } else if (state.mode === 'earth') {
      B.sources.EARTH_MENU.forEach((it) => add(sel, it));
      // a story chapter can play one feed alone: show it while it plays
      if (!B.sources.EARTH_MENU.some((it) => it[0] === state.choice.earth)) add(sel, [state.choice.earth, src?.kind === 'earth' ? src.name : 'Earth events']);
    }
    else {
      B.sources.IMAGE_MENU.forEach(([label, items]) => {
        const og = document.createElement('optgroup');
        og.label = label;
        items.forEach((it) => add(og, it));
        sel.append(og);
      });
      if (uploads.image) add(sel, ['upload', (uploads.image.meta.science ? 'Your map: ' : 'Your picture: ') + uploads.image.meta.name]);
      if (state.choice.image === 'eic') add(sel, ['eic', B.eicView?.image?.meta.name || 'NASA Earth Information Center map']);
    }
    sel.value = state.choice[state.mode];
  }

  B.sources = { inflate, fillSourceSelect, EARTH_MENU, IMAGE_MENU, VIDEO_MENU, earthSample, videoPreset, earthOffline, earthLive, fromCsv, fromCanvas, imageCanvas, fromImageFile, fromVideoFile, fromVideo };
})(typeof self !== 'undefined' ? self : this);
