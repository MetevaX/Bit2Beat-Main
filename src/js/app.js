/**
 * Bit2Beat · application entry point.
 * Holds the state, loads sources, rebuilds the plan and connects the views. Panels live in
 * src/js/ui/*.js and receive this `app` object; pure logic lives in src/js/core/*.js.
 */
(function () {
  'use strict';
  const B = window.Bit2Beat || {};
  const need = ['music', 'stats', 'csv', 'wav', 'spatial', 'adm', 'geo', 'image', 'video', 'score', 'feeds', 'plan', 'presets', 'audio', 'player', 'exporter', 'dom', 'draw', 'scoreView', 'bittyCard', 'sources', 'mixer', 'panels', 'dialogs', 'canvasInput', 'recorder', 'urlState', 'nasaMedia', 'nasaKeys', 'videoView', 'keys', 'pages', 'story', 'storyView', 'tour', 'bittyArt', 'spotlight', 'aboutView'];
  const missing = need.filter((k) => !B[k]);
  if (missing.length) {
    document.body.insertAdjacentHTML('afterbegin', `<p role="alert" style="padding:16px;background:#fbe9d0;color:#14213d">Bit2Beat could not load: ${missing.join(', ')}. Open the single-file build in dist/ or serve the folder.</p>`);
    return;
  }
  const { $, $$, toast, announce, storage, pressOne } = B.dom;
  const { music, stats } = B;

  // ------------------------------------------------------------------ state
  const saved = storage.get('b2b-settings', {});
  if (saved.v !== 3 && saved.settings) delete saved.settings.spacing; // events now sweep west → east
  const fromUrl = B.urlState.read();
  const state = {
    mode: 'data',
    choice: { ...B.urlState.DEFAULT_CHOICE },
    settings: { ...B.plan.DEFAULTS, ...(saved.settings || {}) },
    audio: { volume: 0.7, muted: false, eq: { low: 0, mid: 0, high: 0 }, output: 'stereo', room: 0.22, loop: false, ...(saved.audio || {}) },
    image: { analysis: 'light', scan: 'line', steps: 48, date: '' },
    earth: { quakeFeed: '4.5_week', eonetDays: 30 },
    prefs: { dark: false, contrast: false, textSize: 100, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, bigTargets: false, mono: false, captions: true, announce: false, pet: true, ...storage.get('b2b-prefs', {}) },
    mix: [],
    mixDefault: '',
    position: 0,
    pointer: null,
    power: null,
  };
  // The address bar wins over saved settings, so a refreshed or shared link opens the same view.
  Object.assign(state.settings, fromUrl.settings);
  Object.assign(state.audio, fromUrl.audio);
  Object.assign(state.image, fromUrl.image);
  Object.assign(state.earth, fromUrl.earth);
  if (fromUrl.mode) state.mode = fromUrl.mode;
  if (fromUrl.choice) {
    const valid = {
      data: [...B.presets.DATA_MENU.flatMap(([, items]) => items.map((it) => it[0])), 'power'],
      earth: B.sources.EARTH_MENU.map((it) => it[0]),
      video: B.sources.VIDEO_MENU.map((it) => it[0]),
      image: B.sources.IMAGE_MENU.flatMap(([, items]) => items.map((it) => it[0])),
    };
    if (valid[state.mode].includes(fromUrl.choice)) state.choice[state.mode] = fromUrl.choice;
  }
  if (fromUrl.power) state.power = fromUrl.power;
  let pending = { mix: fromUrl.mix, position: fromUrl.position };
  let src = null;
  let plan = null;
  let uploads = { data: null, image: null, video: null };
  let loadToken = 0;
  let videoImport = null;
  let tempoBeforeVideo = 0;

  const syncUrl = () => B.urlState.write(app);
  const persist = () => {
    storage.set('b2b-settings', { v: 3, settings: state.settings, audio: state.audio });
    syncUrl();
  };

  // ------------------------------------------------------------------ app object shared with panels
  const app = {
    state,
    get src() {
      return src;
    },
    get plan() {
      return plan;
    },
    rebuild,
    refresh,
    seek,
    persist,
    setSource,
    play: togglePlay,
    drawAll: () => drawAll(),
    fillSourceSelect: () => fillSourceSelect(),
    get hitInfo() {
      return hitInfo;
    },
  };

  const player = B.player.createPlayer({
    getPlan: () => plan,
    getSettings: () => ({ ...state.audio, mono: state.prefs.mono }),
    onStep: (i) => {
      state.position = i;
      onPosition(true);
    },
    onState: (playing, reason) => {
      setPlayingUI(playing);
      window.dispatchEvent(new CustomEvent('b2b:play', { detail: { playing, reason } }));
      if (!playing && reason === 'finished') {
        state.position = 0;
        $('caption').textContent = 'Finished. Press Play to listen again.';
        announce('Finished playing.');
        onPosition(false);
      }
    },
  });
  app.player = player;

  // ------------------------------------------------------------------ plan
  function planOptions() {
    return {
      ...state.settings,
      imagePath: state.image.scan,
      spacing: state.mode === 'earth' ? state.settings.spacing : 'even',
      length: state.mode === 'data' ? state.settings.length : 0,
      sharedScale: src?.shared ?? state.settings.sharedScale,
    };
  }

  /** Rebuild the plan after any change to the source, mix or settings. */
  function rebuild({ keepPosition = true } = {}) {
    if (!src) return;
    const wasPlaying = player.playing;
    plan = B.plan.build(src, state.mix, planOptions());
    if (!keepPosition || state.position >= plan.count) state.position = 0;
    B.scoreView.invalidate();
    refresh();
    syncUrl();
    if (wasPlaying) player.play(state.position).catch((e) => toast(e.message));
  }

  function refresh() {
    if (!plan) return;
    B.panels.renderHeader(app);
    B.panels.renderInsights(app);
    B.panels.renderLegend(app);
    B.mixer.render(app);
    $('seek').max = Math.max(0, plan.count - 1);
    $('duration').textContent = music.seconds(plan.duration);
    $('durationNote').textContent = `${plan.count} steps · ${music.seconds(plan.duration)} at ${state.settings.tempo} BPM (one step = one eighth note)`;
    const d = plan.drone;
    $('droneNote').textContent = state.settings.drone === 'off' ? '' : d ? `Reference tone ${music.noteName(d.midi)} = ${stats.fmtNum(d.value, plan.channels.find((c) => c.name === d.channel)?.unit)} (${d.label}).` : 'This data has no baseline; choose “Average”.';
    $('melodyNote').textContent = plan.channels.some((c) => c.invert) ? 'Lower notes = bigger values for inverted channels.' : 'Higher notes = higher values.';
    onPosition(false);
  }

  // ------------------------------------------------------------------ position & drawing
  let lastAnnounce = 0;
  let frame = 0;
  /** Update every view for the current step. During playback the work is batched into one
   *  animation frame, so bursts of close events never queue up redraws (no lag). */
  function onPosition(fromPlayback) {
    if (!plan) return;
    if (fromPlayback) {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), updatePosition(true)));
      return;
    }
    cancelAnimationFrame(frame);
    frame = 0;
    updatePosition(false);
  }
  function updatePosition(fromPlayback) {
    if (!plan) return;
    syncUrl();
    const i = Math.min(state.position, Math.max(0, plan.count - 1));
    $('seek').value = i;
    $('elapsed').textContent = music.seconds(plan.times[i] || 0);
    B.panels.renderNow(app, i);
    videoView.sync(i, player.playing);
    if (!(fromPlayback && state.prefs.reduceMotion)) drawAll();
    B.scoreView.preview(plan, i);
    if ($('scoreDialog').open) B.scoreView.paper(plan, i, true);
    if (fromPlayback && state.prefs.announce && Date.now() - lastAnnounce > 4000) {
      lastAnnounce = Date.now();
      announce($('caption').textContent);
    }
  }

  let hitInfo = null;
  function drawAll() {
    hitInfo = B.draw.source($('sourceCanvas'), src, plan, state.position, { scan: state.image.scan, pointer: state.pointer }, () => drawAll());
    B.draw.pitchRoll($('pitchCanvas'), plan, state.position);
    B.draw.stage($('stageCanvas'), plan, state.position);
  }

  function seek(i, { audition = false } = {}) {
    if (!plan || !plan.count) return;
    state.position = Math.max(0, Math.min(plan.count - 1, i | 0));
    if (player.playing) player.seek(state.position);
    else player.position = state.position;
    onPosition(false);
    if (audition && !player.playing) player.auditionStep(state.position).catch(() => {});
  }

  // ------------------------------------------------------------------ transport
  function setPlayingUI(on) {
    $('playIcon').setAttribute('href', on ? '#i-pause' : '#i-play');
    $('playBtn').setAttribute('aria-label', on ? 'Pause' : 'Play');
    $('playBtn').classList.toggle('is-playing', on);
    spectrumLoop(); // keeps running while playing, then lets the bars fall back
    if (!on) recorder.stop();
    if (plan) videoView.sync(Math.min(state.position, plan.count - 1), on);
  }
  async function togglePlay() {
    if (player.playing) return player.pause();
    if (exporting) return toast('Please wait for the export to finish.');
    try {
      await player.play(state.position);
      announce('Playing ' + (src?.name || ''));
    } catch (e) {
      toast(e.message);
    }
  }
  let raf = 0;
  function spectrumLoop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      B.draw.spectrum($('spectrumCanvas'), player.analyser, player.playing && !state.prefs.reduceMotion);
      if (player.playing || B.draw.spectrumBusy()) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  let exporting = false;
  app.setExporting = (v) => {
    exporting = v;
    if (v) player.pause();
  };

  // ------------------------------------------------------------------ sources
  function initMix() {
    state.mix = src.channels.map((c, j) => ({ gain: j === 0 ? 0.8 : 0.6, mute: !!c.mute, solo: false, instrument: c.instrument || 'inherit' }));
    if (src.channels.length > 1 && state.mix.every((m) => m.mute)) state.mix[0].mute = false;
    state.mixDefault = state.mix.map((m) => `${Math.round(m.gain * 100)}.${m.mute ? 1 : 0}.${m.solo ? 1 : 0}.${m.instrument || 'inherit'}`).join('_');
  }

  /** Which of Bitty’s note topics fits a source. */
  function topicFor(s) {
    if (s.kind === 'earth') return s.feed === 'quakes' ? 'quakes' : 'events';
    if (s.kind === 'video') return 'image';
    if (s.kind === 'image') return /Greenland/.test(s.name) ? 'arctic' : 'image';
    return /Arctic|Svalbard/.test(s.name) ? 'arctic' : 'climate';
  }

  /** Install a new source; resets the mix and position. */
  function setSource(next, { keepMix = false, keepPosition = false } = {}) {
    player.pause();
    const src0 = src;
    src = next;
    videoView.show(next);
    // a new video plays in real time unless the link asked for a tempo
    const rt = next.kind === 'video' && !(pending && fromUrl.settings.tempo) ? videoView.realTimeTempo(next) : null;
    if (rt && rt !== state.settings.tempo && next !== src0) {
      if (src0?.kind !== 'video') tempoBeforeVideo = state.settings.tempo;
      state.settings.tempo = rt;
      app.syncControls?.();
    } else if (next.kind !== 'video' && src0?.kind === 'video' && tempoBeforeVideo) {
      state.settings.tempo = tempoBeforeVideo; // leaving a video: back to the tempo used before
      tempoBeforeVideo = 0;
      app.syncControls?.();
    }
    if (!keepMix || state.mix.length !== src.channels.length) initMix();
    if (!keepPosition) state.position = 0;
    // first load after a refresh: restore the mix and position from the address bar
    if (pending) {
      if (Array.isArray(pending.mix) && pending.mix.length === state.mix.length) state.mix = pending.mix;
      if (pending.position > 0) state.position = pending.position;
      pending = null;
    }
    state.pointer = null;
    $('autoTuneNote').hidden = true;
    bitty.setTopic(topicFor(next));
    rebuild({ keepPosition: true });
    window.dispatchEvent(new CustomEvent('b2b:source', { detail: { mode: state.mode, id: state.choice[state.mode] } }));
  }

  /** Load one source of one tab (used by the story and the tour). */
  app.choose = (mode, id) => {
    state.choice[mode] = id;
    if (state.mode !== mode) return setMode(mode);
    fillSourceSelect();
    syncEarthOptions();
    syncImageOptions();
    loadChoice();
  };

  function fillSourceSelect() {
    B.sources.fillSourceSelect(state, uploads, src, $('sourceSelect'));
  }

  async function loadChoice() {
    videoImport?.abort();
    const token = ++loadToken;
    const id = state.choice[state.mode];
    try {
      if (state.mode === 'data') {
        if (id === 'upload' && uploads.data) return setSource(uploads.data);
        if (B.presets.DATA[id]) return setSource(B.presets.DATA[id]());
        if (id === 'power' && state.power) return loadPower(state.power);
        state.choice.data = 'gistemp';
        fillSourceSelect();
        return setSource(B.presets.DATA.gistemp());
      }
      if (state.mode === 'video') {
        if (id === 'custom') return;
        if (id === 'upload' && uploads.video) return setSource(uploads.video);
        return setSource(B.sources.videoPreset(id));
      }
      if (state.mode === 'earth') {
        if (id.startsWith('sample:')) return setSource(B.sources.earthSample(id));
        const arg = id === 'quakes' ? state.earth.quakeFeed : id === 'eonet' ? state.earth.eonetDays : undefined;
        setSource(B.sources.earthOffline(id, arg));
        return fetchLatest(true);
      }
      // image
      let res;
      if (id === 'upload' && uploads.image) res = uploads.image;
      else {
        setBusy(true, 'Loading picture…');
        res = await B.sources.imageCanvas(id, state.image.date);
        if (token !== loadToken) return;
        if (res.warning) toast(res.warning, 5000);
      }
      // pictures with a colour bar are read through it, unless the link chose another analysis
      if (res.meta?.key && !(pending && fromUrl.image.analysis) && imageBase?.meta !== res.meta) state.image.analysis = 'key';
      imageBase = res;
      syncImageOptions();
      analyseImage();
    } catch (e) {
      if (token !== loadToken) return;
      toast(e.message, 5000);
      if (state.mode === 'image' && id.startsWith('sat:')) {
        state.choice.image = 'map:world';
        toast('Showing the offline world map instead.', 4000);
        fillSourceSelect();
        syncImageOptions();
        loadChoice();
      }
    } finally {
      if (token === loadToken) setBusy(false);
    }
  }

  let imageBase = null;
  function analyseImage() {
    if (!imageBase) return;
    try {
      const next = B.sources.fromCanvas(imageBase.canvas, imageBase.meta, state.image);
      setSource(next, { keepMix: src?.kind === 'image' && src.channels.length === next.channels.length && src.channels.every((c, j) => c.name === next.channels[j].name) });
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  /** Try the live feed for the current Earth source (quietly when `auto`). */
  async function fetchLatest(auto = false) {
    if (state.mode !== 'earth' || state.choice.earth.startsWith('sample:')) return;
    const id = state.choice.earth;
    const arg = id === 'quakes' ? state.earth.quakeFeed : id === 'eonet' ? state.earth.eonetDays : undefined;
    const token = loadToken;
    setBusy(true, 'Getting the latest data…');
    try {
      const live = await B.sources.earthLive(id, arg);
      if (token !== loadToken || state.mode !== 'earth' || state.choice.earth !== id) return;
      if (auto && player.playing) return; // do not interrupt a listener
      setSource(live, { keepMix: true, keepPosition: auto });
      if (!auto) toast('Updated with live data.');
    } catch (e) {
      if (!auto) toast(`Live data unavailable (${e.message}) — using saved data.`, 5000);
    } finally {
      if (token === loadToken) setBusy(false);
    }
  }

  function setBusy(on, label = '') {
    $('livePill').hidden = false;
    if (on) {
      $('livePill').textContent = label;
      $('livePill').dataset.state = 'busy';
    } else B.panels.renderHeader(app);
  }

  function setMode(mode) {
    videoImport?.abort();
    videoView.show(null);
    state.mode = mode;
    $$('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    ['data', 'earth', 'image', 'video'].forEach((m) => ($('opts-' + m).hidden = m !== mode));
    $('uploadBtn').hidden = mode === 'earth';
    $('uploadLabel').textContent = mode === 'video' ? 'Open video' : mode === 'image' ? 'Open picture' : 'Open CSV';
    $('fileInput').accept = mode === 'video' ? 'video/*,.mp4,.webm,.mov,.m4v' : mode === 'image' ? 'image/png,image/jpeg,image/webp' : '.csv,.tsv,.txt,text/csv';
    fillSourceSelect();
    syncEarthOptions();
    syncImageOptions();
    loadChoice();
  }

  function syncEarthOptions() {
    const id = state.choice.earth;
    $('fetchBtn').hidden = id.startsWith('sample:');
    $('quakeFeedField').hidden = id !== 'quakes';
    $('eonetDaysField').hidden = id !== 'eonet';
  }
  function syncImageOptions() {
    $('satDateField').hidden = !state.choice.image.startsWith('sat:') || state.choice.image === 'sat:lights';
    const hasKey = !!imageBase?.meta?.key;
    $('keyBtn').hidden = !hasKey;
    if (!hasKey && state.image.analysis === 'key') state.image.analysis = 'light';
    pressOne($('analysisGroup'), $('analysisGroup').querySelector(`[data-analysis="${state.image.analysis}"]`));
  }

  // ------------------------------------------------------------------ files
  async function openFile(file) {
    if (!file) return;
    ++loadToken;
    videoImport?.abort();
    const controller = new AbortController();
    videoImport = controller;
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || /csv|tab-separated|text\/plain/.test(file.type);
    const isImage = /^image\/(png|jpe?g|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    try {
      if (/^video\//.test(file.type) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) {
        player.pause();
        setBusy(true, 'Analysing video…');
        const next = await B.sources.fromVideoFile(file, {
          signal: controller.signal,
          onProgress: (n, total) => setBusy(true, `Analysing video… ${n}/${total}`),
        });
        if (controller.signal.aborted) return;
        if (uploads.video?.videoUrl) URL.revokeObjectURL(uploads.video.videoUrl);
        next.videoUrl = URL.createObjectURL(file);
        uploads.video = next;
        state.choice.video = 'upload';
        setMode('video');
        toast(`Video ready: ${next.labels.length} frames, two per second. Press Play: the picture follows the music.`, 5000);
      } else if (isCsv) {
        if (file.size > B.csv.LIMITS.maxBytes) throw new Error('Please choose a CSV smaller than 2 MB.');
        const { src: s, parsed } = B.sources.fromCsv(await file.text(), file.name);
        uploads.data = s;
        state.choice.data = 'upload';
        if (state.mode !== 'data') setMode('data');
        else {
          fillSourceSelect();
          setSource(s);
        }
        toast(`Loaded ${parsed.count} rows, ${parsed.cols.length} channel${parsed.cols.length > 1 ? 's' : ''}.` + (parsed.skipped ? ` ${parsed.skipped} more numeric column(s) skipped (limit 6).` : '') + (parsed.missing ? ' Missing values stay silent.' : ''), 5000);
      } else if (isImage) {
        uploads.image = await B.sources.fromImageFile(file);
        state.choice.image = 'upload';
        if (state.mode !== 'image') setMode('image');
        else {
          fillSourceSelect();
          syncImageOptions();
          imageBase = uploads.image;
          analyseImage();
        }
      } else throw new Error('Choose a CSV, PNG/JPG/WebP picture, or a browser-supported video (MP4 or WebM).');
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 5000);
    } finally {
      if (videoImport === controller) { videoImport = null; setBusy(false); }
      $('fileInput').value = '';
    }
  }

  // ------------------------------------------------------------------ prefs
  function applyPrefs() {
    const p = state.prefs;
    const html = document.documentElement;
    html.dataset.theme = p.dark ? 'dark' : 'light';
    html.classList.toggle('contrast', !!p.contrast);
    html.classList.toggle('reduce-motion', !!p.reduceMotion);
    html.classList.toggle('big-targets', !!p.bigTargets);
    html.style.fontSize = (16 * (p.textSize || 100)) / 100 + 'px';
    $('caption').hidden = !p.captions;
    storage.set('b2b-prefs', p);
    bitty.apply();
    player.refreshRouting();
    B.scoreView.invalidate();
    if (plan) onPosition(false);
  }
  app.applyPrefs = applyPrefs;

  // ------------------------------------------------------------------ wiring
  const bitty = B.bittyCard.create(() => state.prefs);
  const videoView = B.videoView.init(app);

  $$('[data-mode]').forEach((b) => {
    b.onclick = () => state.mode !== b.dataset.mode && setMode(b.dataset.mode);
    b.onkeydown = (e) => {
      const tabs = $$('[data-mode]');
      const i = tabs.indexOf(b);
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (k || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + k + tabs.length) % tabs.length;
        tabs[n].focus();
        setMode(tabs[n].dataset.mode);
      }
    };
  });
  $('sourceSelect').onchange = (e) => {
    state.choice[state.mode] = e.target.value;
    syncEarthOptions();
    syncImageOptions();
    loadChoice();
  };
  $('uploadBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => openFile(e.target.files[0]);
  const dz = $('dropZone');
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    $('dropHint').hidden = false;
  });
  dz.addEventListener('dragleave', () => ($('dropHint').hidden = true));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    $('dropHint').hidden = true;
    openFile(e.dataTransfer.files[0]);
  });

  // data options
  $('lengthSelect').value = String(state.settings.length || 0);
  $('lengthSelect').onchange = (e) => {
    state.settings.length = +e.target.value;
    persist();
    rebuild({ keepPosition: false });
  };
  // NASA POWER form: daily data for one of 18 places around the world, any year since 1981
  B.snapshots.PLACES.forEach(([n, lat, lon]) => $('powerPlace').append(new Option(n, `${lat},${lon}`)));
  for (let y = new Date().getUTCFullYear() - 1; y >= 1981; y--) $('powerYear').append(new Option(String(y), String(y)));
  if (state.power) {
    $('powerPlace').value = `${state.power.lat},${state.power.lon}`;
    $('powerYear').value = String(state.power.year);
  }
  async function loadPower({ lat, lon, year }) {
    const place = B.snapshots.PLACES.find((p) => p[1] === lat && p[2] === lon)?.[0] || `${lat}°, ${lon}°`;
    $('powerBtn').disabled = true;
    setBusy(true, 'Asking NASA POWER…');
    try {
      const s = await B.feeds.live.power(lat, lon, year, place);
      state.power = { lat, lon, year };
      state.choice.data = 'power';
      setSource(s);
      fillSourceSelect();
      toast(`Loaded ${s.labels.length} days from NASA POWER.`);
    } catch (err) {
      toast(`NASA POWER is not reachable (${err.message}). The saved Arctic data still works offline.`, 6000);
      if (!src) {
        state.choice.data = 'arcticDaily';
        fillSourceSelect();
        setSource(B.presets.DATA.arcticDaily());
      }
    } finally {
      $('powerBtn').disabled = false;
      setBusy(false);
    }
  }
  $('powerForm').onsubmit = (e) => {
    e.preventDefault();
    const [lat, lon] = $('powerPlace').value.split(',').map(Number);
    loadPower({ lat, lon, year: +$('powerYear').value });
  };

  // earth options
  Object.entries(B.feeds.USGS_FEEDS).forEach(([v, t]) => $('quakeFeed').append(new Option(t, v)));
  if (!B.feeds.USGS_FEEDS[state.earth.quakeFeed]) state.earth.quakeFeed = '4.5_week';
  $('quakeFeed').value = state.earth.quakeFeed;
  $('eonetDays').value = String(state.earth.eonetDays);
  $('quakeFeed').onchange = (e) => {
    state.earth.quakeFeed = e.target.value;
    fetchLatest(false);
  };
  $('eonetDays').onchange = (e) => {
    state.earth.eonetDays = +e.target.value;
    fetchLatest(false);
  };
  $$('#spacingGroup button').forEach((b) => {
    pressOne($('spacingGroup'), $('spacingGroup').querySelector(`[data-spacing="${state.settings.spacing}"]`) || b);
    b.onclick = () => {
      pressOne($('spacingGroup'), b);
      state.settings.spacing = b.dataset.spacing;
      persist();
      rebuild();
    };
  });
  $('fetchBtn').onclick = () => fetchLatest(false);

  // image options (restore pressed buttons from the address bar)
  pressOne($('analysisGroup'), $('analysisGroup').querySelector(`[data-analysis="${state.image.analysis}"]`));
  pressOne($('scanGroup'), $('scanGroup').querySelector(`[data-scan="${state.image.scan}"]`));
  $('stepsRange').value = state.image.steps;
  $('stepsOut').textContent = state.image.steps;
  $$('#analysisGroup button').forEach((b) => {
    b.onclick = () => {
      pressOne($('analysisGroup'), b);
      state.image.analysis = b.dataset.analysis;
      syncImageOptions();
      analyseImage();
    };
  });
  $$('#scanGroup button').forEach((b) => {
    b.onclick = () => {
      pressOne($('scanGroup'), b);
      state.image.scan = b.dataset.scan;
      state.pointer = null;
      if (b.dataset.scan === 'pointer') toast('Move the pointer over the picture to hear it. Play still scans left to right.', 4000);
      analyseImage();
    };
  });
  $('stepsRange').oninput = (e) => ($('stepsOut').textContent = e.target.value);
  $('stepsRange').onchange = (e) => {
    state.image.steps = +e.target.value;
    analyseImage();
  };
  const today = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  state.image.defaultDate = today;
  if (!state.image.date || state.image.date > today) state.image.date = today;
  $('satDate').value = state.image.date;
  $('satDate').max = today;
  $('satDate').min = '2012-01-20';
  $('satDate').onchange = (e) => {
    if (!e.target.value) return;
    state.image.date = e.target.value;
    loadChoice();
  };

  // transport
  $('playBtn').onclick = togglePlay;
  $('restartBtn').onclick = () => seek(0);
  $('loopBtn').setAttribute('aria-pressed', String(state.audio.loop));
  $('loopBtn').onclick = () => {
    state.audio.loop = !state.audio.loop;
    $('loopBtn').setAttribute('aria-pressed', String(state.audio.loop));
    persist();
  };
  $('seek').oninput = (e) => seek(+e.target.value);
  $('volume').value = Math.round(state.audio.volume * 100);
  $('volume').oninput = (e) => {
    state.audio.volume = +e.target.value / 100;
    player.applyMix();
    persist();
  };
  const syncMute = () => {
    $('muteBtn').setAttribute('aria-pressed', String(state.audio.muted));
    $('volIcon').setAttribute('href', state.audio.muted ? '#i-mute' : '#i-volume');
  };
  syncMute();
  $('muteBtn').onclick = () => {
    state.audio.muted = !state.audio.muted;
    syncMute();
    player.applyMix();
  };

  // pages (Studio, Story, About)
  const showPage = (app.showPage = B.pages.init(app, () => drawAll()));

  B.keys.init(app);
  document.addEventListener('visibilitychange', () => document.hidden && player.playing && player.pause());
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      B.scoreView.invalidate();
      if (plan) onPosition(false);
    }, 120);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => plan && onPosition(false));

  // panels
  B.canvasInput.init(app);
  const recorder = B.recorder.init(app);
  B.panels.init(app);
  B.mixer.init(app);
  B.dialogs.init(app);

  // start
  if (state.prefs.dark == null) state.prefs.dark = matchMedia('(prefers-color-scheme: dark)').matches;
  applyPrefs();
  setMode(state.mode);
  B.storyView.init(app);
  B.aboutView.init(app);
  if (fromUrl.page && fromUrl.page !== 'studio') showPage(fromUrl.page, { focus: false });
  B.tour.init(app, fromUrl);
  B.draw.spectrum($('spectrumCanvas'), null, false);
  window.Bit2Beat.app = app; // handy for debugging and tests
})();
