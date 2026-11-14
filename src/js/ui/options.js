/**
 * Bit2Beat ui · the options under the picture, per tab:
 *   Data   – points to play, NASA POWER daily data for a place and year;
 *   Earth  – period, rhythm of the sweep, Get latest;
 *   Image  – what to measure, how to scan, steps, satellite date.
 * Also: Follow pointer hides the player bar (the pointer is the player).
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, $$, toast, pressOne } = B.dom;

  /** h: { analyseImage, fetchLatest, syncImageOptions, loadChoice } from app.js */
  function init(app, h) {
    const state = app.state;

    // ---------------------------------------------------------------- data
    $('lengthSelect').value = String(state.settings.length || 0);
    $('lengthSelect').onchange = (e) => {
      state.settings.length = +e.target.value;
      app.persist();
      app.rebuild({ keepPosition: false });
    };
    // NASA POWER: daily data for one of 18 places around the world, any year since 1981
    B.snapshots.PLACES.forEach(([n, lat, lon]) => $('powerPlace').append(new Option(n, `${lat},${lon}`)));
    for (let y = new Date().getUTCFullYear() - 1; y >= 1981; y--) $('powerYear').append(new Option(String(y), String(y)));
    if (state.power) {
      $('powerPlace').value = `${state.power.lat},${state.power.lon}`;
      $('powerYear').value = String(state.power.year);
    }
    async function loadPower({ lat, lon, year }) {
      const place = B.snapshots.PLACES.find((p) => p[1] === lat && p[2] === lon)?.[0] || `${lat}°, ${lon}°`;
      $('powerBtn').disabled = true;
      app.busy(true, 'Asking NASA POWER…');
      try {
        const s = await B.feeds.live.power(lat, lon, year, place);
        state.power = { lat, lon, year };
        state.choice.data = 'power';
        app.setSource(s);
        app.fillSourceSelect();
        toast(`Loaded ${s.labels.length} days from NASA POWER.`);
      } catch (err) {
        toast(`NASA POWER is not reachable (${err.message}). The saved Arctic data still works offline.`, 6000);
        if (!app.src) {
          state.choice.data = 'arcticDaily';
          app.fillSourceSelect();
          app.setSource(B.presets.DATA.arcticDaily());
        }
      } finally {
        $('powerBtn').disabled = false;
        app.busy(false);
      }
    }
    $('powerForm').onsubmit = (e) => {
      e.preventDefault();
      const [lat, lon] = $('powerPlace').value.split(',').map(Number);
      loadPower({ lat, lon, year: +$('powerYear').value });
    };

    // ---------------------------------------------------------------- earth
    Object.entries(B.feeds.USGS_FEEDS).forEach(([v, t]) => $('quakeFeed').append(new Option(t, v)));
    if (!B.feeds.USGS_FEEDS[state.earth.quakeFeed]) state.earth.quakeFeed = '4.5_week';
    $('quakeFeed').value = state.earth.quakeFeed;
    $('eonetDays').value = String(state.earth.eonetDays);
    $('quakeFeed').onchange = (e) => {
      state.earth.quakeFeed = e.target.value;
      h.fetchLatest(false);
    };
    $('eonetDays').onchange = (e) => {
      state.earth.eonetDays = +e.target.value;
      h.fetchLatest(false);
    };
    $$('#spacingGroup button').forEach((b) => {
      pressOne($('spacingGroup'), $('spacingGroup').querySelector(`[data-spacing="${state.settings.spacing}"]`) || b);
      b.onclick = () => {
        pressOne($('spacingGroup'), b);
        state.settings.spacing = b.dataset.spacing;
        app.persist();
        app.rebuild();
      };
    });
    $('fetchBtn').onclick = () => h.fetchLatest(false);

    // ---------------------------------------------------------------- image
    pressOne($('analysisGroup'), $('analysisGroup').querySelector(`[data-analysis="${state.image.analysis}"]`));
    pressOne($('scanGroup'), $('scanGroup').querySelector(`[data-scan="${state.image.scan}"]`));
    $('stepsRange').value = state.image.steps;
    $('stepsOut').textContent = state.image.steps;
    $$('#analysisGroup button').forEach((b) => {
      b.onclick = () => {
        pressOne($('analysisGroup'), b);
        state.image.analysis = b.dataset.analysis;
        h.syncImageOptions();
        h.analyseImage();
      };
    });
    $$('#scanGroup button').forEach((b) => {
      b.onclick = () => {
        pressOne($('scanGroup'), b);
        state.image.scan = b.dataset.scan;
        state.pointer = null;
        if (b.dataset.scan === 'pointer') {
          toast('Move the pointer over the picture (or press Tab to reach it and use the arrow keys) to hear it; Bit2Beat says what is under it. The player comes back when you choose another scan.', 6000);
          B.dom.announce('Follow pointer. Press Tab to reach the picture, then use the arrow keys: you hear the data and Bit2Beat says what it is and where you are.');
        }
        syncPointer();
        h.analyseImage();
      };
    });
    $('stepsRange').oninput = (e) => ($('stepsOut').textContent = e.target.value);
    $('stepsRange').onchange = (e) => {
      state.image.steps = +e.target.value;
      h.analyseImage();
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
      h.loadChoice();
    };

    // ---------------------------------------------------------------- per tab
    /** Follow pointer: the pointer plays the picture, so the player bar steps aside. */
    function syncPointer() {
      const on = state.mode === 'image' && state.image.scan === 'pointer' && app.page?.() !== 'about';
      document.body.classList.toggle('pointer-mode', on);
      $('pointerRow').hidden = !on;
      if (on && app.player.playing) app.player.pause();
    }
    root.addEventListener('b2b:mode', syncPointer);
    syncPointer();

    return { loadPower, syncPointer };
  }

  B.options = { init };
})(typeof self !== 'undefined' ? self : this);
