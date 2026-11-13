/**
 * Bit2Beat ui · the address bar mirrors what you are listening to.
 * Mode, source, sound settings, mix and play position are kept in the URL query, so a refresh
 * (or a shared link) opens exactly the same view. Only values that differ from the defaults are
 * written, which keeps links short. Uploaded files cannot travel in a URL; those fall back to
 * the default source of their tab.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;

  const MODES = ['data', 'earth', 'image', 'video'];
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
  };
  const oneOf = (v, list) => (list.includes(v) ? v : undefined);

  /** Parse the current query string into a partial state (unknown or invalid values are ignored). */
  function read(search = root.location?.search || '') {
    const q = new URLSearchParams(search);
    const out = { settings: {}, audio: {}, image: {}, earth: {} };
    const has = (k) => q.has(k) && q.get(k) !== '';
    if (has('page')) out.page = oneOf(q.get('page'), ['studio', 'story', 'about']);
    if (q.has('tour')) out.tour = true;
    if (q.has('notour')) out.tour = false;
    if (has('mode')) out.mode = oneOf(q.get('mode'), MODES);
    if (has('src')) out.choice = q.get('src').slice(0, 40);
    if (has('t')) out.position = num(q.get('t'), 0, 1e6) | 0;

    const S = out.settings;
    if (has('inst')) S.instrument = q.get('inst');
    if (has('scale')) S.scale = q.get('scale');
    if (has('key')) S.key = num(q.get('key'), 0, 11);
    if (has('range')) S.range = oneOf(+q.get('range'), [12, 24, 36]);
    if (has('bpm')) S.tempo = num(q.get('bpm'), 50, 200);
    if (has('pts')) S.length = oneOf(+q.get('pts'), [0, 30, 60, 120, 240]);
    if (has('gap')) S.spacing = oneOf(q.get('gap'), ['even', 'time']);
    if (has('ref')) S.drone = oneOf(q.get('ref'), ['off', 'baseline', 'mean']);
    if (has('tick')) S.cues = q.get('tick') === '1';
    if (has('drums')) S.drums = q.get('drums') === '1';
    if (has('shared')) S.sharedScale = q.get('shared') === '1';
    if (has('move')) S.path = oneOf(q.get('move'), ['auto', 'sweep', 'fall', 'orbit', 'fixed']);

    if (has('out')) out.audio.output = oneOf(q.get('out'), ['stereo', 'binaural', '5.1', '7.1', '7.1.4']);
    if (has('room')) out.audio.room = num(q.get('room'), 0, 100) / 100;

    if (has('quakes')) out.earth.quakeFeed = q.get('quakes');
    if (has('days')) out.earth.eonetDays = oneOf(+q.get('days'), [7, 30, 60]);

    if (has('look')) out.image.analysis = oneOf(q.get('look'), ['light', 'color', 'key']);
    if (has('scan')) out.image.scan = oneOf(q.get('scan'), ['line', 'down', 'radar', 'pointer']);
    if (has('steps')) out.image.steps = num(q.get('steps'), 16, 160);
    if (has('date') && /^\d{4}-\d\d-\d\d$/.test(q.get('date'))) out.image.date = q.get('date');

    // Earth Information Center pick: "id~place~maps" (place = world | lat,lon | lat,lon,Name)
    if (has('eic')) {
      const [id, place, steps] = q.get('eic').split('~');
      if (/^[\w.-]{1,120}$/.test(id || '')) out.eic = { id, place: (place || 'world').slice(0, 80), ...(num(steps, 1, 200) ? { steps: num(steps, 1, 200) | 0 } : {}) };
    }
    if (has('place')) {
      const [lat, lon, year] = q.get('place').split(',').map(Number);
      if ([lat, lon, year].every(Number.isFinite)) out.power = { lat, lon, year };
    }
    // mix: one item per channel, "gain.mute.solo.instrument" joined by "_"
    if (has('mix'))
      out.mix = q
        .get('mix')
        .split('_')
        .map((it) => {
          const [g, m, s, ins] = it.split('.');
          return { gain: num(g, 0, 100) / 100 || 0, mute: m === '1', solo: s === '1', instrument: ins || 'inherit' };
        });
    for (const k of ['settings', 'audio', 'image', 'earth']) for (const [kk, v] of Object.entries(out[k])) if (v === undefined) delete out[k][kk];
    return out;
  }

  const DEFAULT_CHOICE = { data: 'gistemp', earth: 'events', image: 'eic', video: 'gedi' };

  /** Build the query string for the current state. */
  function query(app, page = 'studio') {
    const st = app.state;
    const D = B.plan.DEFAULTS;
    const q = new URLSearchParams();
    if (page === 'about' || page === 'story') q.set('page', page);
    q.set('mode', st.mode);
    const choice = st.choice[st.mode];
    if (choice !== 'upload' && choice !== 'custom') q.set('src', choice);
    const S = st.settings;
    const put = (k, v, def) => v !== undefined && v !== def && q.set(k, String(v));
    put('inst', S.instrument, D.instrument);
    put('scale', S.scale, D.scale);
    put('key', S.key, D.key);
    put('range', S.range, D.range);
    put('bpm', S.tempo, D.tempo);
    if (st.mode === 'data') put('pts', S.length, 0);
    if (st.mode === 'earth') put('gap', S.spacing, 'even');
    put('ref', S.drone, D.drone);
    if (S.cues !== D.cues) q.set('tick', S.cues ? '1' : '0');
    if (S.drums) q.set('drums', '1');
    if (S.sharedScale !== D.sharedScale) q.set('shared', S.sharedScale ? '1' : '0');
    put('move', S.path, D.path);
    put('out', st.audio.output, 'stereo');
    put('room', Math.round(st.audio.room * 100), 22);
    if (st.mode === 'earth') {
      if (choice === 'quakes') put('quakes', st.earth.quakeFeed, '4.5_week');
      if (choice === 'eonet' || choice === 'events') put('days', st.earth.eonetDays, 30);
    }
    if (st.mode === 'image') {
      put('look', st.image.analysis, 'light');
      put('scan', st.image.scan, 'line');
      put('steps', st.image.steps, 48);
      if (choice.startsWith('sat:') && st.image.date && st.image.date !== st.image.defaultDate) q.set('date', st.image.date);
    }
    const pick = choice === 'eic' && { data: st.eic, image: st.eicImage, video: st.eicVideo }[st.mode];
    if (pick?.id) q.set('eic', [pick.id, pick.place || 'world', pick.steps || ''].join('~').replace(/~$/, ''));
    if (st.mode === 'data' && choice === 'power' && st.power) q.set('place', `${st.power.lat},${st.power.lon},${st.power.year}`);
    // the mix only when it differs from what the source starts with
    const mix = st.mix.map((m) => `${Math.round(m.gain * 100)}.${m.mute ? 1 : 0}.${m.solo ? 1 : 0}.${m.instrument || 'inherit'}`).join('_');
    if (mix && mix !== st.mixDefault) q.set('mix', mix);
    if (st.position > 0) q.set('t', String(st.position));
    return q.toString();
  }

  let timer = 0;
  let last = 0;
  /** Update the address bar (throttled; never adds history entries). */
  function write(app, page) {
    const go = () => {
      last = Date.now();
      timer = 0;
      const qs = query(app, page ?? app.page?.() ?? 'studio');
      const url = `${location.pathname}${qs ? '?' + qs : ''}`;
      if (url !== location.pathname + location.search) {
        try {
          history.replaceState(null, '', url);
        } catch {
          /* file:// in some browsers */
        }
      }
    };
    clearTimeout(timer);
    const wait = Math.max(0, 400 - (Date.now() - last));
    timer = setTimeout(go, wait);
  }

  B.urlState = { read, write, query, DEFAULT_CHOICE };
})(typeof self !== 'undefined' ? self : this);
