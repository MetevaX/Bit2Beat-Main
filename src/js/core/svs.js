/**
 * Bit2Beat core · the NASA Earth Information Center content database (pure, no DOM).
 *
 * The Space Apps "Earth Information Jukebox" challenge points to the Earth Information Center
 * (EIC) Content Database: the visuals NASA's Scientific Visualization Studio (SVS) made for the EIC
 * at NASA Headquarters (https://svs.gsfc.nasa.gov/gallery/earth-information-center/). Its pictures
 * and videos are the data Bit2Beat plays.
 *
 * The SVS API (https://svs.gsfc.nasa.gov/api/<id>) does not let other websites read it, so the page
 * reaches it through its own address: /svs/… is passed on to svs.gsfc.nasa.gov by Vercel
 * (vercel.json) and by the development server (scripts/serve.js). api/eic-gallery.js walks the
 * gallery once a day and sends the short list that search uses.
 *
 * PRESETS are the data sets the challenge lists; they sit in the Image and Video menus and are
 * left out of search results, so nothing appears twice.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).svs = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SITE = 'https://svs.gsfc.nasa.gov';
  const GALLERY = 40467; // "Earth Information Center (EIC)"
  const PROXY = 'svs/'; // same-site path that leads to SITE
  const page = (id) => `${SITE}/${id}/`;
  const media = (path) => `${PROXY}vis/${path}`; // a picture or video, through the site's own address

  /**
   * The challenge's data sets (Space Apps 2026 · The Earth Information Jukebox · Resources).
   * Each one is bundled with the app (works offline and opens at once): a picture
   * (assets/nasa/svs-<id>.jpg) and, for the videos, a short clip of its first 45 seconds
   * (assets/nasa/svs-<id>.mp4, 640 pixels wide) whose analysis is in data/svs-clips.js.
   * still / video: the originals under svs.gsfc.nasa.gov/vis/ (linked as the source).
   * GEDI and DYAMOND CO₂ (bundled long ago) are kept for Bitty's story only.
   */
  const PRESETS = [
    { id: 4950, key: 'gedi', name: 'GEDI forest height', bundled: true, story: true },
    { id: 5196, key: 'co2', name: 'Global carbon dioxide (DYAMOND)', bundled: true, story: true },
    { id: 3912, name: 'Sea surface currents and temperature', still: 'a000000/a003900/a003912/flat_global_ecco2_2028x1024.25000.jpg', video: 'a000000/a003900/a003912/ecco2_sst_flow.m4v', credit: 'Greg Shirah', about: 'Ocean surface currents from the ECCO2 model, coloured by sea surface temperature.' },
    { id: 5425, name: 'Perpetual Ocean 2: western boundary currents', still: 'a000000/a005400/a005425/perpetual_ocean2_CLOSE_093_4k_clean_noDate.00000_print.jpg', video: 'a000000/a005400/a005425/perpetual_ocean2_CLOSE_093_clean_noDate_1080p30.mp4', credit: 'Greg Shirah', about: 'Strong ocean currents along the western edges of the oceans, such as the Gulf Stream and the Kuroshio, from a NASA ocean model.' },
    { id: 5669, name: 'GEOS aerosols (smoke, dust, sea salt)', still: 'a000000/a005600/a005669/Aerosols_2025-08-19T20_00_00_1920x1080.png', about: 'Smoke, dust, sea salt and other particles in the air from the GEOS model, each type in its own colour.' },
    { id: 5533, name: 'Air quality model runs', still: 'a000000/a005500/a005533/AirQuality_WithLabels_1920x1080_0000.png', video: 'a000000/a005500/a005533/EIC_AirQuality_Preview_3840x1080.mp4', credit: 'Helen-Nicole Kostis, Joseph V. Ardizzone; science: Lesley Ott', about: 'Air pollution forecasts from NASA’s GEOS model.' },
    { id: 5313, name: 'Night lights 2012–2023', still: 'a000000/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC.02599_print.jpg', credit: 'Kel Elkins', about: 'City lights at night seen by the VIIRS instrument (Black Marble), and how they changed between 2012 and 2023.' },
    { id: 5011, name: 'Lightning seen from the ISS 2017–2023', still: 'a000000/a005000/a005011/iss_lightning_preview.jpg', video: 'a000000/a005000/a005011/iss_lightning_sphere_07312023.mp4', credit: 'Michala Garrison', about: 'Lightning flashes detected by the Lightning Imaging Sensor on the International Space Station.' },
    { id: 4960, name: 'An atmospheric river in 3D', still: 'a000000/a004900/a004960/atmos_rivers_narrated_4k.00090_print.jpg', video: 'a000000/a004900/a004960/atmos_river_HD.mp4', credit: 'Greg Shirah; produced by Jefferson Beck', about: 'A long band of water vapour carried across the Pacific in a NASA Earth system model.' },
  ];
  const PRESET_IDS = new Set(PRESETS.map((p) => p.id));
  /** The copies bundled with the app (they work offline). */
  const localStill = (id) => `assets/nasa/svs-${id}.jpg`;
  const localVideo = (id) => `assets/nasa/svs-${id}.mp4`;

  /** SVS visualization id from a media address (…/a005300/a005313/… → 5313). */
  const visId = (url) => {
    const m = String(url || '').match(/\/a\d{6}\/a\d{6}\/a0*(\d+)\//);
    return m ? +m[1] : null;
  };
  const rel = (u) => String(u || '').replace(/^https?:\/\/svs\.gsfc\.nasa\.gov\/vis\//, '');
  const strip = (s) =>
    String(s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\|\|[\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

  /** The media files of a visualization page (API JSON). */
  const mediaOf = (j) => (j.media_groups || []).flatMap((g) => (g.items || []).map((i) => i.instance).filter(Boolean)).filter((m) => /\/vis\//.test(m.url || ''));

  /** The picture to show: a print-size still (about 1024–2048 wide), never a thumbnail. */
  function pickStill(list, main = null) {
    const imgs = list.filter((m) => m.media_type === 'Image' && /\.(jpe?g|png)$/i.test(m.url) && !/_thm|searchweb|_web\.png|cbar|colorbar_only|SIGGRAPH|logo/i.test(m.url) && m.width >= 640);
    imgs.sort((a, b) => /_print\.jpg$/.test(b.url) - /_print\.jpg$/.test(a.url) || Math.abs(a.width - 1500) - Math.abs(b.width - 1500));
    return imgs[0] || (main && /\.(jpe?g|png)$/i.test(main.url) ? main : null);
  }
  /** The video to read: the smallest plain one a browser plays (no H.265 or ProRes), at least 640 wide. */
  function pickVideo(list) {
    const vids = list.filter((m) => m.media_type === 'Movie' && /\.(mp4|webm|m4v)$/i.test(m.url) && !/h265|hevc|prores/i.test(m.url));
    const area = (m) => (m.width || 1920) * (m.height || 1080);
    vids.sort((a, b) => ((a.width || 9999) < 640) - ((b.width || 9999) < 640) || area(a) - area(b) || /\.mp4$/.test(b.url) - /\.mp4$/.test(a.url));
    return vids[0] || null;
  }

  /** File types, as search filters them: pictures, videos and scientific data files. */
  const SCIENCE_EXT = { tif: 'tif', tiff: 'tif', nc: 'nc', nc4: 'nc', cdf: 'nc', h5: 'h5', he5: 'h5', hdf5: 'h5', hdf: 'h5' };
  const extOf = (url) => (String(url || '').match(/\.([a-z0-9]+)(?:$|\?)/i) || [])[1]?.toLowerCase() || '';
  /** A colour bar or legend on its own (not a map that shows one, like "..._w_colorbar_..."): nothing to listen to. */
  const KEY_ONLY = /(?<!w_|with_)colou?r_?bar|legend|cbar/i;
  /** The scientific data files of a page: { tif: path, nc: path, h5: path } (the first of each that is not just a colour bar). */
  function scienceFiles(list) {
    const out = {};
    for (const m of list) {
      const k = SCIENCE_EXT[extOf(m.url)];
      if (k && !out[k] && !KEY_ONLY.test(String(m.url).split('/').pop())) out[k] = rel(m.url);
    }
    return out;
  }

  /** One short entry for search. */
  function compact(j, gallery = '') {
    const list = mediaOf(j);
    const s = pickStill(list, j.main_image);
    const v = pickVideo(list);
    const f = scienceFiles(list);
    return {
      id: j.id,
      t: String(j.title || '').slice(0, 160),
      y: String(j.release_date || '').slice(0, 4),
      d: strip(j.description).slice(0, 260),
      k: (j.keywords || []).map((k) => k.name || k).filter((k) => !/hyperwall|presentation|science on a sphere|eic \(|earth information center/i.test(k)).slice(0, 6),
      g: gallery,
      s: s ? rel(s.url) : '',
      v: v ? rel(v.url) : '',
      c: Object.values(j.main_credits || {}).flat().map((p) => p.name).slice(0, 3).join(', '),
      x: [...new Set(list.map((m) => extOf(m.url)).filter(Boolean))].sort(),
      ...(Object.keys(f).length ? { f } : {}),
    };
  }

  /**
   * Walk the EIC gallery (and its sub-galleries) and describe every visualization in it.
   * getJson(id) → the SVS API JSON for page `id`. Returns entries sorted by id.
   */
  async function crawl(getJson, { concurrency = 6, maxGalleries = 40 } = {}) {
    const galleries = new Set();
    const found = new Map(); // id → gallery path
    async function gallery(id, path, depth) {
      if (galleries.has(id) || depth > 4 || galleries.size >= maxGalleries) return;
      galleries.add(id);
      const j = await getJson(id).catch(() => null);
      for (const g of j?.media_groups || [])
        for (const it of g.items || []) {
          const inst = it.instance || {};
          const where = [...path, g.title || ''].filter(Boolean).join(' › ');
          if (it.type === 'gallery_page' && inst.id) await gallery(inst.id, [...path, inst.title], depth + 1);
          else if (it.type === 'details_page' && inst.id) found.has(inst.id) || found.set(inst.id, where);
          else {
            const v = visId(inst.url);
            if (v && !found.has(v)) found.set(v, where);
          }
        }
    }
    await gallery(GALLERY, [], 0);
    const queue = [...found.entries()];
    const out = [];
    while (queue.length)
      await Promise.all(
        queue.splice(0, concurrency).map(async ([id, where]) => {
          const j = await getJson(id).catch(() => null);
          if (j && j.title) out.push(compact(j, where));
        }),
      );
    return out.sort((a, b) => a.id - b.id);
  }

  /** The file types search can filter by, for one gallery entry: 'jpg', 'png', 'mp4', 'webm', 'tif', 'nc', 'h5'. */
  function typesOf(e) {
    const t = new Set(Object.keys(e.f || {}));
    if (e.s) t.add(extOf(e.s) === 'png' ? 'png' : 'jpg');
    if (e.v) t.add(extOf(e.v) === 'webm' ? 'webm' : 'mp4');
    for (const x of e.x || []) if (['jpg', 'jpeg', 'png', 'mp4', 'm4v', 'webm'].includes(x)) t.add({ jpeg: 'jpg', m4v: 'mp4' }[x] || x);
    return [...t];
  }

  /** Gallery entries → search catalogue entries (presets left out, unless `presets`: their
   *  scientific files are not in the menus, so the file-type search lists them). */
  function catalogue(entries, { presets = false } = {}) {
    return (entries || [])
      .filter((e) => e && e.id && (e.s || e.f) && (presets || !PRESET_IDS.has(+e.id)))
      .map((e) => ({
        id: `svs:${e.id}`,
        title: e.t,
        from: e.y || '',
        to: e.y || '',
        years: e.y || '',
        text: [e.d, e.k?.join(', '), e.g].filter(Boolean).join(' · '),
        about: e.d,
        kind: e.v ? 'video' : 'picture',
        exts: typesOf(e),
        svs: e,
      }));
  }

  /** A preset or a search entry as { id, title, still, video, page, credit, about }. */
  function item(idOrEntry) {
    const e = typeof idOrEntry === 'object' ? idOrEntry : null;
    const id = e ? +e.id : +String(idOrEntry).replace(/^svs:/, '');
    const p = PRESETS.find((x) => x.id === id);
    if (p) return { id, title: p.name, still: p.still || '', video: p.video || '', page: page(id), credit: p.credit || '', about: p.about || '', preset: true, bundled: !!p.bundled, offline: !p.bundled, key: p.key };
    if (!e) return null;
    return { id, title: e.t, still: e.s, video: e.v, page: page(id), credit: e.c || '', about: e.d || '', preset: false };
  }

  return { SITE, GALLERY, PROXY, PRESETS, PRESET_IDS, SCIENCE_EXT, extOf, scienceFiles, typesOf, localStill, localVideo, page, media, visId, pickStill, pickVideo, compact, crawl, catalogue, item };
});
