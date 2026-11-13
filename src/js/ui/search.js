/**
 * Bit2Beat ui · one search for the NASA Earth Information Center, above the Image, Video and
 * Data tabs.
 *   Keyword search: results appear as you type, from the catalogue's titles, descriptions and
 *   keywords, with word stems, one-letter typing mistakes and everyday words (swamp → wetland …)
 *   (core/eic-search.js rank). No AI, works offline for what is already loaded.
 * Image and Video search the EIC content database (NASA's SVS gallery made for the Earth
 * Information Center; the challenge's own data sets are presets in the menus and never appear
 * here); Data searches the EIC data API (earth.gov), where every map is real numbers.
 * Choosing a result plays it in the tab that is open.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, el, announce, storage } = B.dom;
  const X = B.eicSearch;
  const STEPS = { data: [24, 60, 120], video: [24, 48, 96] };
  const DEFAULT_STEPS = { data: 60, video: 24 };
  const DENSITY = { day: 'daily', month: 'monthly', year: 'yearly' };
  const HELLO = 'Results and suggestions appear as you type.';
  const WHAT = { image: ['picture', 'pictures'], video: ['video', 'videos'], data: ['data set', 'data sets'] };
  const what = (m, n) => (WHAT[m] || WHAT.data)[n === 1 ? 0 : 1];
  const PLACEHOLDER = { image: 'Type a subject, e.g. sea temperature, rain, wildfires', video: 'Type a subject, e.g. hurricanes, ocean currents, sea ice', data: 'Type a subject, e.g. carbon dioxide, methane, fire' };

  function init(app) {
    const S = app.state;
    const box = $('eicSearch');
    let results = []; // [{ id, why }]
    let token = 0;
    let typing = 0;

    // ---------------------------------------------------------------- area and number of maps
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
      $('searchInput').placeholder = PLACEHOLDER[m];
      // the content database (Image, Video) has whole pictures and videos: no area or number of maps
      const gal = B.eicView.usesGallery?.(m);
      $('searchPlace').closest('label').hidden = !!gal;
      const steps = gal ? null : STEPS[m];
      $('searchStepsField').hidden = !steps;
      if (steps) {
        const keep = +$('searchSteps').value;
        $('searchSteps').replaceChildren(...steps.map((n) => new Option(`Latest ${n} maps`, String(n))));
        $('searchSteps').value = String(steps.includes(keep) ? keep : DEFAULT_STEPS[m]);
      }
      const pick = { data: S.eic, image: S.eicImage, video: S.eicVideo }[m];
      if (pick?.place && [...$('searchPlace').options].some((o) => o.value === pick.place)) $('searchPlace').value = pick.place;
      mark();
    }

    // ---------------------------------------------------------------- results
    const info = (id) => B.eicView.catalogue().find((c) => c.id === id);
    const current = () => (S.choice[S.mode] === 'eic' ? { data: S.eic, image: S.eicImage, video: S.eicVideo }[S.mode]?.id : null);
    const say = (t) => ($('searchStatus').textContent = t);
    function mark() {
      $('searchResults')
        .querySelectorAll('[data-id]')
        .forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === cur())));
    }
    const cur = current;

    function show(list, note) {
      results = list.filter((r) => info(r.id));
      $('searchResults').replaceChildren(
        ...results.map((r, k) => {
          const c = info(r.id);
          const years = c.svs || c.gibs ? `${c.years || 'NASA SVS'} · ${c.kind}` : `${c.from.slice(0, 4)}–${c.to.slice(0, 4)}${c.density ? ' · ' + (DENSITY[c.density] || c.density) : ''}`;
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
      if (note != null) say(note);
      $('resultsBar').hidden = !results.length;
      $('resultsCount').textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
      syncIdeas();
      mark();
    }

    /** Play one data set in the open tab. */
    function choose(id) {
      const m = mode();
      if (!m) return Promise.resolve();
      const pick = { id, place: $('searchPlace').value };
      if (STEPS[m]) pick.steps = +$('searchSteps').value;
      if (m === 'image') B.eicView.image = null;
      if (m === 'video') B.eicView.video = null;
      const run = m === 'image' ? B.eicView.loadImage : m === 'video' ? B.eicView.loadVideo : B.eicView.load;
      return run(pick).then(mark);
    }

    async function catalogue() {
      try {
        return await B.eicView.fill();
      } catch (e) {
        say(`Search needs the internet: ${e.message}. The pictures and videos in the menu above work offline.`);
        return null;
      }
    }

    /** Keyword search (instant, no AI). */
    async function keywords(q, quiet = false) {
      const list = await catalogue();
      if (!list) return [];
      const found = X.rank(list, q, 6);
      const near = X.detectPlace(q, B.snapshots.PLACES);
      if (near) setPlace(near);
      const m = mode();
      const ideas = (X.IDEAS[m] || []).filter((t) => X.rank(list, t, 1).length).slice(0, 3);
      show(found, found.length ? `${found.length} ${what(m, found.length)} match${found.length === 1 ? 'es' : ''} “${q}”. Choose one to listen.` : quiet ? '' : `No ${what(m, 2)} match “${q}”.${ideas.length ? ` Try ${ideas.map((t) => `“${t.toLowerCase()}”`).join(', ')}.` : ' Try another word.'}`);
      return found;
    }

    // ---------------------------------------------------------------- ideas, clear, typing
    function syncIdeas() {
      const empty = !$('searchInput').value.trim() && !results.length;
      const list = B.eicView.catalogue();
      const m = mode();
      const ideas = (X.IDEAS[m] || X.SUGGESTIONS).filter((t) => !list.length || X.rank(list, t, 1).length).slice(0, 7);
      $('searchSuggest').hidden = !empty;
      $('searchSuggest').replaceChildren(
        ...(empty
          ? [
              el('span', { class: 'suggest-label', text: 'Try:' }),
              ...ideas.map((t) =>
                el('button', { type: 'button', class: 'chip', onclick: () => run(t) }, t),
              ),
              el('button', { type: 'button', class: 'chip chip-quiet', onclick: () => run('') }, `All ${what(m, 2)}`),
            ]
          : []),
      );
      $('searchClear').hidden = !$('searchInput').value && !results.length;
    }

    // ---------------------------------------------------------------- suggestions while typing
    // up to 6: ideas that contain the words, then data sets whose title matches (a data set plays at once)
    let hints = [];
    let hintAt = -1;
    function closeHints() {
      hints = [];
      hintAt = -1;
      $('searchHints').hidden = true;
      $('searchHints').replaceChildren();
      $('searchInput').setAttribute('aria-expanded', 'false');
      $('searchInput').removeAttribute('aria-activedescendant');
    }
    function showHints(q) {
      const list = B.eicView.catalogue();
      const f = X.fold(q);
      // ideas of this tab that start with (or contain) what is typed and find something here
      const ideas = (X.IDEAS[mode()] || [])
        .filter((t) => X.fold(t) !== f && (X.fold(t).startsWith(f) || X.fold(t).includes(' ' + f) || X.fold(t).includes(f)) && X.rank(list, t, 1).length)
        .sort((p, q) => X.fold(q).startsWith(f) - X.fold(p).startsWith(f))
        .map((t) => ({ kind: 'idea', text: t }));
      const sets = (list.length ? X.rank(list, q, 5) : []).map((r) => ({ kind: 'set', id: r.id, text: info(r.id).title }));
      hints = [...ideas.slice(0, 3), ...sets].slice(0, 6);
      hintAt = -1;
      if (!hints.length || q.length < 2) return closeHints();
      $('searchHints').replaceChildren(
        ...hints.map((h, k) => {
          const li = el('li', { id: `searchHint${k}`, role: 'option', class: 'hint hint-' + h.kind, 'aria-selected': 'false' }, el('span', { text: h.text }), el('small', { text: h.kind === 'set' ? 'Play' : 'Search' }));
          li.addEventListener('pointerdown', (e) => {
            e.preventDefault(); // keep focus in the box
            pickHint(k);
          });
          return li;
        }),
      );
      $('searchHints').hidden = false;
      $('searchInput').setAttribute('aria-expanded', 'true');
    }
    function moveHint(by) {
      if (!hints.length) return;
      hintAt = (hintAt + by + hints.length) % hints.length;
      [...$('searchHints').children].forEach((li, k) => li.setAttribute('aria-selected', String(k === hintAt)));
      $('searchInput').setAttribute('aria-activedescendant', `searchHint${hintAt}`);
      $('searchHints').children[hintAt]?.scrollIntoView({ block: 'nearest' });
    }
    function pickHint(k) {
      const h = hints[k];
      closeHints();
      if (!h) return;
      if (h.kind === 'set') {
        $('searchInput').value = h.text;
        show([{ id: h.id }], `Playing ${h.text}.`);
        return choose(h.id);
      }
      return run(h.text);
    }

    function run(q) {
      closeHints();
      $('searchInput').value = q;
      $('searchClear').hidden = !q;
      if (!q) return listAll();
      return keywords(q);
    }
    function listAll() {
      return catalogue().then((list) => list && show([...list].sort((p, q) => p.title.localeCompare(q.title)).map((c) => ({ id: c.id })), `${list.length} ${what(mode(), list.length)}, A to Z. Type to narrow them.`));
    }
    function clear() {
      ++token;
      closeHints();
      $('searchInput').value = '';
      $('searchBtn').disabled = false;
      box.classList.remove('is-thinking');
      show([], HELLO);
      $('searchInput').focus();
    }

    $('searchForm').onsubmit = (e) => {
      e.preventDefault();
      run(X.clean($('searchInput').value));
    };
    $('searchInput').addEventListener('input', () => {
      const q = X.clean($('searchInput').value);
      $('searchClear').hidden = !q;
      clearTimeout(typing);
      if (!q) return closeHints(), show([], HELLO);
      // results and suggestions as you type
      typing = setTimeout(() => {
        showHints(q);
        if (q.length >= 2) keywords(q, true);
      }, 180);
    });
    $('searchInput').addEventListener('keydown', (e) => {
      const open = !$('searchHints').hidden;
      if (e.key === 'ArrowDown' && open) moveHint(1);
      else if (e.key === 'ArrowUp' && open) moveHint(-1);
      else if (e.key === 'Enter' && open && hintAt >= 0) pickHint(hintAt);
      else if (e.key === 'Escape' && open) closeHints();
      else if (e.key === 'Escape' && ($('searchInput').value || results.length)) clear();
      else return;
      e.preventDefault();
    });
    $('searchInput').addEventListener('blur', () => setTimeout(closeHints, 120));
    $('searchClear').onclick = clear;
    // Clear results: remove the result cards (and the words that found them); what is playing keeps playing
    $('clearResults').onclick = () => {
      clear();
      announce('Search results cleared.');
    };

    // changing the area or the number of maps replays the data set that is playing
    const replay = () => {
      const id = current();
      if (id) choose(id);
    };
    $('searchPlace').onchange = replay;
    $('searchSteps').onchange = replay;
    root.addEventListener('b2b:source', syncMode);
    root.addEventListener('b2b:mode', () => {
      syncMode();
      // Image and Video search NASA's gallery, Data the data API: search again in the new one
      if (!mode()) return;
      const m = mode();
      B.eicView
        .fill()
        .then(() => {
          if (mode() !== m) return; // another tab was chosen meanwhile
          const q = X.clean($('searchInput').value); // read now: voice may have typed meanwhile
          return q ? keywords(q, true) : results.length ? show([], HELLO) : syncIdeas();
        })
        .catch(() => {});
    });
    root.addEventListener('b2b:catalogue', syncIdeas);
    // open the catalogue in the background once the page is idle (search is then instant)
    setTimeout(() => mode() && B.eicView.fill().catch(() => {}), 1500);
    syncMode();
    syncIdeas();
    B.search = Object.assign(B.search || {}, { run, choose, clear, results: () => results, info, mode });
  }

  B.search = { init };
})(typeof self !== 'undefined' ? self : this);
