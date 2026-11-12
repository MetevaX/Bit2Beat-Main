/**
 * Bit2Beat ui · one search for the NASA Earth Information Center, above the Image, Video and
 * Data tabs.
 *   Keyword search (default): results appear as you type, from the catalogue's titles and
 *   descriptions (plus everyday words: swamp → wetland …). Works without any AI.
 *   AI mode (Gemini): the question in your own words goes to api/search.js, where the key stays on
 *   the server; Gemini picks the data sets and the place. It only answers Earth-data searches.
 * Choosing a result plays it in the tab that is open: Image draws its newest map, Video makes a
 * time-lapse, Data plays one note per map.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, el, announce, storage } = B.dom;
  const X = B.eicSearch;
  const STEPS = { data: [24, 60, 120], video: [24, 48, 96] };
  const DEFAULT_STEPS = { data: 60, video: 24 };
  const DENSITY = { day: 'daily', month: 'monthly', year: 'yearly' };
  // more ideas for the suggestions while typing (the first six are also the "Try:" buttons)
  const MORE_IDEAS = ['Carbon dioxide over the Amazon', 'Methane from rice fields', 'Fossil fuel emissions in cities', 'Fire emissions in Australia', 'Population in India', 'Land carbon flux', 'Wetland methane in Siberia', 'Greenhouse gases over the whole world'];
  const HELLO = 'Results and suggestions appear as you type. Turn on Gemini to ask in your own words.';

  function init(app) {
    const S = app.state;
    const box = $('eicSearch');
    let ai = !!storage.get('b2b-ai-search', false);
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
      const steps = STEPS[m];
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

    // ---------------------------------------------------------------- AI mode
    function syncAi() {
      $('aiMode').setAttribute('aria-pressed', String(ai));
      box.classList.toggle('is-ai', ai);
      $('searchInput').placeholder = ai ? 'Ask in your own words, e.g. methane from wetlands in the Amazon' : 'Type a subject, e.g. carbon dioxide, methane, fire';
      $('searchBtn').textContent = ai ? 'Ask Gemini' : 'Search';
    }
    $('aiMode').onclick = () => {
      ai = !ai;
      storage.set('b2b-ai-search', ai);
      syncAi();
      say(ai ? 'Gemini is on: write what you want to hear and press Ask Gemini. It only finds Earth data.' : 'Gemini is off: keyword search, results appear as you type.');
      $('searchInput').focus();
    };

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
      if (note != null) say(note);
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
      show(found, found.length ? `${found.length} data set${found.length > 1 ? 's' : ''} match “${q}”.${ai ? '' : ' Choose one to listen.'}` : quiet ? '' : `Nothing matches “${q}”. Try another word, or turn on Gemini.`);
      return found;
    }

    /** AI mode: Gemini picks the data sets and the place. */
    async function askGemini(q) {
      const my = ++token;
      const list = await catalogue();
      if (!list || my !== token) return;
      const quick = await keywords(q, true);
      say(quick.length ? `${quick.length} keyword match${quick.length > 1 ? 'es' : ''}. Gemini is thinking…` : 'Gemini is thinking…');
      $('searchBtn').disabled = true;
      box.classList.add('is-thinking');
      try {
        const res = await B.eicView.get('api/search', { method: 'POST', timeout: 65000, body: { q, mode: mode() || 'data', collections: X.compact(list) } });
        if (my !== token) return;
        const ans = X.answer(res, list);
        if (ans.offTopic) return say('AI search only looks for Earth data (air, land, water, climate, people on Earth). Try “carbon dioxide over the Amazon”.');
        if (ans.place) setPlace(ans.place);
        if (ans.picks.length) {
          const who = res.model && res.model !== X.MODEL ? `Gemini (${res.model.replace('gemini-', '').replace('-flash', ' Flash')}, as 3.8 Flash was busy)` : 'Gemini';
          show(ans.picks, `${who} picked ${ans.picks.length} data set${ans.picks.length > 1 ? 's' : ''}${ans.place !== 'world' ? ` for ${ans.place.name}` : ''}. Choose one to listen.`);
          announce(`${ans.picks.length} results. First: ${info(ans.picks[0].id)?.title}.`);
        } else say(quick.length ? 'Gemini found nothing better; these are the keyword matches.' : `Nothing in the catalogue matches “${q}”. Try other words, like carbon, methane, fire or population.`);
      } catch (e) {
        if (my !== token) return;
        const why = /404|405|not set up|Failed to fetch|network/i.test(e.message) ? 'AI search is not available here (it works on bit2beat.vercel.app)' : /429|Too many/.test(e.message) ? 'too many AI searches: wait a minute' : e.message;
        say(quick.length ? `Showing keyword matches (${why}).` : `No keyword matches, and ${why}. Try other words.`);
      } finally {
        if (my === token) {
          $('searchBtn').disabled = false;
          box.classList.remove('is-thinking');
        }
      }
    }

    // ---------------------------------------------------------------- ideas, clear, typing
    function syncIdeas() {
      const empty = !$('searchInput').value.trim() && !results.length;
      const list = B.eicView.catalogue();
      const ideas = X.SUGGESTIONS.filter((t) => !list.length || X.rank(list, t, 1).length);
      $('searchSuggest').hidden = !empty;
      $('searchSuggest').replaceChildren(
        ...(empty
          ? [
              el('span', { class: 'suggest-label', text: 'Try:' }),
              ...ideas.map((t) =>
                el('button', { type: 'button', class: 'chip', onclick: () => run(t) }, t),
              ),
              el('button', { type: 'button', class: 'chip chip-quiet', onclick: () => run('') }, 'All data sets'),
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
      const ideas = [...X.SUGGESTIONS, ...MORE_IDEAS].filter((t) => X.fold(t).includes(f) && X.fold(t) !== f).map((t) => ({ kind: 'idea', text: t }));
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
      return ai ? askGemini(q) : keywords(q);
    }
    function listAll() {
      return catalogue().then((list) => list && show(list.map((c) => ({ id: c.id })), `${list.length} data sets, A to Z. Type to narrow them.`));
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
      // keyword mode: results as you type; AI mode waits for Ask Gemini. Both show suggestions.
      typing = setTimeout(() => {
        showHints(q);
        if (!ai && q.length >= 2) keywords(q, true);
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

    // changing the area or the number of maps replays the data set that is playing
    const replay = () => {
      const id = current();
      if (id) choose(id);
    };
    $('searchPlace').onchange = replay;
    $('searchSteps').onchange = replay;
    root.addEventListener('b2b:source', syncMode);
    root.addEventListener('b2b:mode', syncMode);
    root.addEventListener('b2b:catalogue', syncIdeas);
    // open the catalogue in the background once the page is idle (search is then instant)
    setTimeout(() => mode() && B.eicView.fill().catch(() => {}), 1500);
    syncAi();
    syncMode();
    syncIdeas();
    B.search = Object.assign(B.search || {}, { run, choose, clear, results: () => results, ai: () => ai });
  }

  B.search = { init };
})(typeof self !== 'undefined' ? self : this);
