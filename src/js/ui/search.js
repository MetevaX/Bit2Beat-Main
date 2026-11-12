/**
 * Bit2Beat ui · one search for the NASA Earth Information Center, above the Image, Video and
 * Data tabs. Type what you want to hear in plain words. Matching data sets appear at once from a
 * keyword search; then Gemini (through api/search.js, where the key stays on the server) ranks
 * them and finds the place you named. Choosing a result plays it in the tab that is open:
 * Image draws its newest map, Video makes a time-lapse, Data plays one note per map.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, el, announce } = B.dom;
  const X = B.eicSearch;
  const STEPS = { data: [24, 60, 120], video: [24, 48, 96] };
  const DEFAULT_STEPS = { data: 60, video: 24 };
  const DENSITY = { day: 'daily', month: 'monthly', year: 'yearly' };

  function init(app) {
    const S = app.state;
    const box = $('eicSearch');
    let results = []; // [{ id, why }]
    let token = 0;

    // areas: the whole world, the app's places, and any place Gemini found
    $('searchPlace').append(new Option('Whole world', 'world'));
    B.snapshots.PLACES.forEach(([n, lat, lon]) => $('searchPlace').append(new Option(n, `${lat},${lon}`)));
    const setPlace = (place) => {
      if (!place) return;
      if (place === 'world') return void ($('searchPlace').value = 'world');
      const v = `${place.lat},${place.lon}`;
      const known = [...$('searchPlace').options].find((o) => o.value === v || o.value.startsWith(v + ','));
      if (known) return void ($('searchPlace').value = known.value);
      $('searchPlace').querySelector('[data-found]')?.remove();
      const o = new Option(`${place.name} (found)`, `${v},${place.name}`);
      o.dataset.found = '1';
      $('searchPlace').append(o);
      $('searchPlace').value = o.value;
    };

    const mode = () => (['data', 'image', 'video'].includes(S.mode) ? S.mode : null);
    function syncMode() {
      const m = mode();
      box.hidden = !m;
      if (!m) return;
      const steps = STEPS[m];
      $('searchStepsField').hidden = !steps;
      if (steps) {
        const keep = +$('searchSteps').value;
        $('searchSteps').replaceChildren(...steps.map((n) => new Option(`Latest ${n} maps`, String(n))));
        $('searchSteps').value = String(steps.includes(keep) ? keep : DEFAULT_STEPS[m]);
      }
      const pick = { data: S.eic, image: S.eicImage, video: S.eicVideo }[m];
      if (pick?.place) $('searchPlace').value = [...$('searchPlace').options].some((o) => o.value === pick.place) ? pick.place : $('searchPlace').value;
      $('searchBtn').textContent = 'Search';
      mark();
    }

    const info = (id) => B.eicView.catalogue().find((c) => c.id === id);
    const current = () => (S.choice[S.mode] === 'eic' ? { data: S.eic, image: S.eicImage, video: S.eicVideo }[S.mode]?.id : null);
    function mark() {
      const cur = current();
      $('searchResults')
        .querySelectorAll('[data-id]')
        .forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === cur)));
    }

    function show(list, note) {
      results = list;
      const ul = $('searchResults');
      ul.replaceChildren(
        ...list.map((r, k) => {
          const c = info(r.id);
          if (!c) return '';
          const years = `${c.from.slice(0, 4)}–${c.to.slice(0, 4)}${c.density ? ' · ' + (DENSITY[c.density] || c.density) : ''}`;
          const b = el(
            'button',
            { type: 'button', class: 'result', 'data-id': c.id, title: c.text.slice(0, 300) },
            el('b', { text: c.title }),
            el('small', { text: r.why ? `${years} · ${r.why}` : `${years} · ${c.text.slice(0, 110)}${c.text.length > 110 ? '…' : ''}` }),
            el('span', { class: 'result-go', 'aria-hidden': 'true', text: k === 0 ? 'Listen ▶' : '▶' }),
          );
          b.onclick = () => choose(c.id);
          return el('li', {}, b);
        }),
      );
      $('searchStatus').textContent = note;
      mark();
    }

    /** Play one data set in the open tab. */
    function choose(id) {
      const m = mode();
      if (!m) return;
      const pick = { id, place: $('searchPlace').value };
      if (STEPS[m]) pick.steps = +$('searchSteps').value;
      if (m === 'image') {
        B.eicView.image = null;
        return B.eicView.loadImage(pick).then(mark);
      }
      if (m === 'video') {
        B.eicView.video = null;
        return B.eicView.loadVideo(pick).then(mark);
      }
      return B.eicView.load(pick).then(mark);
    }

    async function search(q) {
      const my = ++token;
      $('searchStatus').textContent = 'Opening the catalogue…';
      let list;
      try {
        list = await B.eicView.fill();
      } catch (e) {
        $('searchStatus').textContent = `Search needs the internet: ${e.message}.`;
        return;
      }
      if (my !== token) return;
      // 1. instant keyword results
      const quick = X.rank(list, q, 6);
      const near = X.detectPlace(q, B.snapshots.PLACES);
      if (near) setPlace(near);
      show(quick, quick.length ? `${quick.length} match${quick.length > 1 ? 'es' : ''} by keyword. Asking Gemini for the best ones…` : 'Asking Gemini…');
      // 2. Gemini picks the data sets and the place (server-side; the key never reaches the page)
      const own = B.eicView.api().stac === B.eic.ENDPOINTS.stac;
      try {
        $('searchBtn').disabled = true;
        box.classList.add('is-thinking');
        const res = await B.eicView.get('api/search', {
          method: 'POST',
          timeout: 65000,
          body: { q, mode: mode() || 'data', collections: X.compact(list) },
        });
        if (my !== token) return;
        const ans = X.answer(res, list);
        if (ans.place) setPlace(ans.place);
        if (ans.picks.length) {
          const who = res.model && res.model !== X.MODEL ? `Gemini (${res.model.replace('gemini-', '').replace('-flash', ' Flash')}, as 3.8 Flash was busy)` : 'Gemini';
          show(ans.picks, `${who} picked ${ans.picks.length} data set${ans.picks.length > 1 ? 's' : ''}${ans.place !== 'world' ? ` for ${ans.place.name}` : ''}. Choose one to listen.`);
          announce(`${ans.picks.length} results. First: ${info(ans.picks[0].id)?.title}.`);
        } else if (quick.length) $('searchStatus').textContent = `Gemini found nothing better; these are the keyword matches.`;
        else show([], `Nothing in the ${own ? 'Earth Information Center' : 'catalogue'} matches “${q}”. Try other words, like carbon, methane, fire or population.`);
      } catch (e) {
        if (my !== token) return;
        const why = /404|405|not set up/.test(e.message) ? 'AI search is not available here' : e.message;
        $('searchStatus').textContent = quick.length ? `${quick.length} keyword match${quick.length > 1 ? 'es' : ''} (${why}).` : `No keyword matches, and ${why}. Try other words.`;
        if (quick.length) announce(`${quick.length} results. First: ${info(quick[0].id)?.title}.`);
      } finally {
        if (my === token) {
          $('searchBtn').disabled = false;
          box.classList.remove('is-thinking');
        }
      }
    }

    $('searchForm').onsubmit = (e) => {
      e.preventDefault();
      const q = $('searchInput').value.trim();
      if (!q) {
        // empty search: show the whole catalogue, A to Z
        B.eicView
          .fill()
          .then((list) => show(list.slice(0, 40).map((c) => ({ id: c.id })), `${list.length} data sets${list.length > 40 ? ' (first 40, A to Z): type words to narrow them' : ''}.`))
          .catch((err) => ($('searchStatus').textContent = `Search needs the internet: ${err.message}.`));
        return;
      }
      search(q);
    };
    // changing the area or the number of maps replays the data set that is playing
    const replay = () => {
      const id = current();
      if (id) choose(id);
    };
    $('searchPlace').onchange = replay;
    $('searchSteps').onchange = replay;
    root.addEventListener('b2b:source', syncMode);
    root.addEventListener('b2b:mode', syncMode);
    // open the catalogue in the background once the page is idle (search is then instant)
    setTimeout(() => mode() && B.eicView.fill().catch(() => {}), 1500);
    syncMode();
    B.search = Object.assign(B.search || {}, { run: search, choose, results: () => results });
  }

  B.search = { init };
})(typeof self !== 'undefined' ? self : this);
