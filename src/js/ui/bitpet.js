/**
 * Bit2Beat ui · BitPet, a small companion with short notes from the NASA Image and Video Library.
 * Notes follow what is playing (climate, the Arctic, earthquakes, natural events, pictures): 20 saved
 * notes work offline, and fresh ones are fetched from images-api.nasa.gov for the current topic.
 * A new note appears every 20 seconds unless the pointer or keyboard focus is on the card.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, storage } = B.dom;
  const DOG = '<svg viewBox="0 0 160 145" class="dog" aria-hidden="true"><g class="pet-tail"><path d="M112 105 Q149 109 139 80" fill="none" stroke="#b87c38" stroke-width="15" stroke-linecap="round"/><path d="M139 80 Q138 74 135 71" fill="none" stroke="#f0dfbd" stroke-width="15" stroke-linecap="round"/></g><path d="M48 101 Q45 75 78 76 Q111 77 115 108 L113 127 H47Z" fill="#d5a866" stroke="#17243b" stroke-width="2.5"/><path d="M71 91 Q92 85 96 121 H67Z" fill="#f5e8cf"/><path d="M50 111 V133 H67 V114 M96 114 V133 H114 V111" fill="#d5a866" stroke="#17243b" stroke-width="2.5" stroke-linejoin="round"/><g class="pet-head"><path class="pet-ear left" d="M46 43 Q18 27 24 65 Q28 84 44 68Z" fill="#9b6837" stroke="#17243b" stroke-width="2.5"/><path class="pet-ear right" d="M107 43 Q134 30 127 66 Q123 82 109 68Z" fill="#9b6837" stroke="#17243b" stroke-width="2.5"/><path d="M40 49 Q41 22 77 24 Q112 23 114 52 L114 72 Q110 96 77 97 Q42 96 39 73Z" fill="#dab376" stroke="#17243b" stroke-width="2.5"/><path d="M66 25 Q76 23 85 25 L90 73 H63Z" fill="#f5e8cf"/><ellipse cx="77" cy="77" rx="26" ry="17" fill="#f5e8cf"/><g class="pet-eyes" fill="#17243b"><ellipse cx="56" cy="59" rx="4" ry="5"/><ellipse cx="98" cy="59" rx="4" ry="5"/></g><path d="M70 70 Q77 66 84 70 Q84 78 77 79 Q70 77 70 70Z" fill="#17243b"/><path d="M77 79 V85 M77 85 Q69 90 65 84 M77 85 Q85 90 89 84" fill="none" stroke="#17243b" stroke-width="2.5" stroke-linecap="round"/></g><path d="M51 95 Q78 107 105 95" fill="none" stroke="#14213d" stroke-width="9"/><rect x="71" y="98" width="14" height="17" rx="3" fill="#e8a33d" stroke="#17243b" stroke-width="2"/><path d="M75 103h5m-5 4h5" stroke="#17243b" stroke-width="2"/></svg>';
  const ROTATE_MS = 20000;
  const ABBR = /(?:\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Mr|Dr|St|Mt|No|vs|approx|U\.S|a\.m|p\.m|[A-Z]))$/;

  /** Clean NASA description text and cut it at a real sentence end (not "Oct." or "7.5"). */
  function excerpt(raw, max = 300) {
    let t = String(raw || '').replace(/<[^>]*>/g, ' ');
    if (typeof document !== 'undefined') {
      const box = document.createElement('textarea');
      box.innerHTML = t;
      t = box.value;
    }
    t = t.replace(/^[A-Za-z0-9_-]+\s*\([^)]*\)\s*-{2,}\s*/, '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    let best = -1;
    const re = /[.!?](?=\s+["“(]?[A-Z])/g;
    let m;
    while ((m = re.exec(t)) && m.index < max) {
      const before = t.slice(0, m.index);
      if (!ABBR.test(before) && !/\d$/.test(before)) best = m.index + 1;
    }
    if (best >= 60) return t.slice(0, best);
    return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  const TOPIC_NAMES = { climate: 'climate', quakes: 'earthquakes', events: 'natural events', arctic: 'the Arctic', image: 'Earth from space' };

  function createPet(getPrefs) {
    const { NOTES, QUERIES } = B.nasaNotes;
    let pool = NOTES.map((n) => ({ ...n }));
    let topic = 'climate';
    let index = 0;
    let timer = 0;
    let paused = false;
    const fetched = new Set();
    $('petFace').innerHTML = DOG;

    const ordered = () => [...pool.filter((n) => n.topic === topic), ...pool.filter((n) => n.topic !== topic)];
    let list = ordered();

    function show(announce = false) {
      const f = list[index];
      if (!f) return;
      $('petFact').textContent = f.text;
      $('petSource').href = 'https://images.nasa.gov/details/' + encodeURIComponent(f.id);
      $('petSource').textContent = (f.title.length > 44 ? f.title.slice(0, 42) + '…' : f.title) + (f.date ? ` (${f.date.slice(0, 4)})` : '');
      $('petSource').title = f.title;
      $('petPage').textContent = `${index + 1}/${list.length}`;
      $('petTitle').textContent = `BitPet · ${TOPIC_NAMES[f.topic] || 'NASA note'}`;
      if (announce) B.dom.announce(f.text);
    }

    function hop() {
      if (getPrefs().reduceMotion) return;
      const d = $('petFace');
      d.classList.remove('hop');
      void d.offsetWidth;
      d.classList.add('hop');
    }

    function step(delta, announce = false) {
      index = (index + delta + list.length) % list.length;
      show(announce);
    }

    function schedule() {
      clearInterval(timer);
      timer = setInterval(() => {
        if (paused || document.hidden || $('bitPet').hidden) return;
        step(1);
      }, ROTATE_MS);
    }

    /** Fetch fresh notes for a topic (cached for a day) and merge them in. */
    async function refresh(t) {
      const queries = QUERIES[t] || [];
      const q = queries.find((x) => !fetched.has(x));
      if (!q || typeof fetch !== 'function') return;
      fetched.add(q);
      const key = 'b2b-nasa-' + q;
      let items = null;
      const cached = storage.get(key, null);
      if (cached && Date.now() - cached.time < 86400000) items = cached.items;
      else {
        try {
          const ctl = new AbortController();
          const timeout = setTimeout(() => ctl.abort(), 9000);
          const r = await fetch('https://images-api.nasa.gov/search?media_type=image&q=' + encodeURIComponent(q), { signal: ctl.signal, credentials: 'omit' });
          clearTimeout(timeout);
          if (!r.ok) throw new Error('unavailable');
          const body = await r.json();
          items = (body.collection?.items || [])
            .map((i) => i.data?.[0])
            .filter((d) => d && typeof d.description === 'string' && d.description.length > 80)
            .slice(0, 12)
            .map((d) => ({ topic: t, id: d.nasa_id, title: String(d.title || d.nasa_id).slice(0, 120), date: String(d.date_created || '').slice(0, 10), text: excerpt(d.description) }))
            .filter((n) => n.text.length > 60);
          storage.set(key, { time: Date.now(), items });
        } catch {
          fetched.delete(q);
          return;
        }
      }
      const seenId = new Set(pool.map((n) => n.id));
      const seenText = new Set(pool.map((n) => n.text));
      const fresh = items.filter((n) => !seenId.has(n.id) && !seenText.has(n.text));
      if (!fresh.length) return;
      const current = list[index];
      pool = [...pool, ...fresh].slice(-80);
      list = ordered();
      index = Math.max(0, list.indexOf(current));
      show();
    }

    /** Follow what is playing: 'climate' | 'quakes' | 'events' | 'arctic' | 'image'. */
    function setTopic(t) {
      if (!t || t === topic) return;
      topic = t;
      list = ordered();
      index = 0;
      show();
      hop();
      if (getPrefs().pet !== false) refresh(t);
    }

    function apply() {
      const on = getPrefs().pet !== false;
      $('bitPet').hidden = !on;
      if (on) refresh(topic);
    }

    $('petNext').onclick = () => {
      step(1, true);
      hop();
      schedule();
    };
    $('petPrev').onclick = () => {
      step(-1, true);
      hop();
      schedule();
    };
    $('petFace').onclick = () => {
      hop();
      step(1, true);
      schedule();
    };
    const card = $('bitPet');
    card.addEventListener('pointerenter', () => (paused = true));
    card.addEventListener('pointerleave', () => (paused = false));
    card.addEventListener('focusin', () => (paused = true));
    card.addEventListener('focusout', () => (paused = false));
    show();
    schedule();
    return { apply, hop, show, setTopic };
  }

  B.bitpet = { createPet, excerpt };
})(typeof self !== 'undefined' ? self : this);
