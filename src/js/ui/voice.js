/**
 * Bit2Beat ui · voice control, for people who cannot (or would rather not) use a screen or mouse.
 *
 * The first time the site opens, a small box asks: "Do you want to turn on voice control?" with
 * five seconds to answer (Enter = yes, Escape = no; it is read by screen readers and, where the
 * browser allows, spoken aloud). V turns voice control on and off at any time.
 *
 * Listening: the microphone is heard by ui/voice-ear.js, and each phrase goes (as a short WAV) to
 * Gemini through our server (api/voice.js), which writes it out — any language or accent — and
 * may only answer with one of Bit2Beat's own commands (core/voice-commands.js: play, pause, next,
 * search for …, go to video, violin, help, stop voice control …). This works in every browser.
 * Where the server cannot be reached (offline, or the file opened from disk), the browser's own
 * speech recognition is used instead when it has one. Every action is confirmed out loud.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, toast, announce, storage } = B.dom;
  const V = B.voiceCommands;
  const KEY = 'b2b-voice';
  const Rec = root.SpeechRecognition || root.webkitSpeechRecognition;

  function init(app) {
    let rec = null;
    let on = false;
    let speaking = false;
    let last = '';
    const remember = (patch) => storage.set(KEY, { ...storage.get(KEY, {}), ...patch });

    // ---------------------------------------------------------------- speaking back
    function say(text, { quiet = false } = {}) {
      last = text;
      $('voiceHeard').textContent = text;
      if (!('speechSynthesis' in root) || quiet) {
        announce(text);
        return setTimeout(listen, 300);
      }
      speaking = true;
      ear?.pause(true); // do not hear ourselves
      try {
        rec?.abort();
      } catch {}
      root.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.lang = 'en-US';
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        speaking = false;
        listen();
      };
      u.onend = u.onerror = end;
      // some systems (Linux without speech voices) never say "ended": listen again anyway
      setTimeout(end, 1500 + text.length * 75);
      root.speechSynthesis.speak(u);
    }

    // ---------------------------------------------------------------- listening
    let ear = null; // the microphone + Gemini (ui/voice-ear.js)
    let busy = false; // a phrase is being understood
    const online = () => navigator.onLine && /^https?:$/.test(location.protocol);
    function listen() {
      if (!on || speaking || busy) return;
      if (ear) return ear.pause(false);
      if (!rec) return;
      try {
        rec.start();
      } catch {
        /* already listening */
      }
    }
    const status = (t) => ($('voiceHeard').textContent = t);
    function level(v) {
      $('voiceBar').style.setProperty('--level', v.toFixed(2));
    }

    /** The browser's own speech recognition (Chrome, Edge, Safari), used when Gemini cannot be reached. */
    function startNative() {
      if (!Rec) return false;
      if (!rec) {
        rec = new Rec();
        rec.lang = navigator.language || 'en-US';
        rec.continuous = false;
        rec.interimResults = false;
        rec.maxAlternatives = 3;
        rec.onresult = (e) => {
          const r = e.results[e.results.length - 1];
          const alts = Array.from(r, (a) => a.transcript.trim()).filter(Boolean);
          if (alts.length) handle(alts, r[0].confidence);
        };
        rec.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            stop(false);
            toast('The microphone is blocked for this site. Allow it in the browser’s address bar to use voice control.', 7000);
          } else if (e.error === 'network') status('This browser’s speech service cannot be reached. Voice control needs the internet.');
        };
        rec.onend = () => setTimeout(listen, 250); // keep listening until it is turned off
      }
      listen();
      return true;
    }

    /** One phrase from the ear: Gemini writes it out and picks the command. */
    let lastSent = 0;
    async function phrase(b64, seconds) {
      if (!on || busy || Date.now() - lastSent < 900) return;
      busy = true;
      lastSent = Date.now();
      ear?.pause(true);
      status(`Heard ${seconds.toFixed(1)} s · understanding…`);
      try {
        const r = await fetch('api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: b64 }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(j.error || `The voice service answered ${r.status}.`), { status: r.status });
        busy = false;
        if (j.id && j.id !== 'none') return run({ id: j.id, arg: j.arg }, j.heard || '', j.reply);
        const local = j.heard && V.parse(j.heard);
        if (local) return run(local, j.heard);
        if (!j.heard) {
          status('Listening… say “help” for the commands.'); // only noise or music
          return listen();
        }
        return say(j.reply || `Sorry, I did not understand “${j.heard}”. Say help for the commands.`);
      } catch (e) {
        busy = false;
        if ([404, 405, 503].includes(e.status) || e instanceof TypeError) {
          // no voice server here (opened from disk, or offline): the browser's own recogniser, if any
          ear?.stop();
          ear = null;
          if (startNative()) return say('Using this browser’s own speech recognition.');
          stop(false);
          return toast('Voice control needs the internet (it works on bit2beat.vercel.app).', 6000);
        }
        if (e.status === 429) return say('Too many voice commands in a minute. Please wait a little.');
        say('Sorry, the voice service did not answer. Please try again.');
      }
    }

    async function start() {
      on = true;
      remember({ asked: true, on: true });
      $('voiceBtn').setAttribute('aria-pressed', 'true');
      $('voiceBar').hidden = false;
      document.body.classList.add('voice-on');
      if (online() && B.voiceEar) {
        try {
          ear = B.voiceEar.create({ onPhrase: phrase, onLevel: level });
          await ear.start();
          ear.pause(true); // until the welcome has been said
          say('Voice control is on. Say help to hear what you can say.');
          return true;
        } catch (e) {
          ear?.stop();
          ear = null;
          if (/denied|not allowed|permission/i.test(e.message + e.name)) {
            stop(false);
            toast('The microphone is blocked for this site. Allow it (the microphone icon in the address bar), then press V.', 7000);
            return false;
          }
        }
      }
      if (startNative()) {
        say('Voice control is on. Say help to hear what you can say.');
        return true;
      }
      stop(false);
      toast('Voice control needs a microphone and the internet (it works on bit2beat.vercel.app).', 6000);
      return false;
    }

    function stop(spoken = true) {
      on = false;
      busy = false;
      remember({ asked: true, on: false });
      ear?.stop();
      ear = null;
      try {
        rec?.abort();
      } catch {}
      $('voiceBtn').setAttribute('aria-pressed', 'false');
      $('voiceBar').hidden = true;
      document.body.classList.remove('voice-on');
      if (spoken) say('Voice control is off. Press V to turn it on again.');
    }

    // ---------------------------------------------------------------- understanding
    async function handle(alts, confidence) {
      const heard = alts[0];
      $('voiceHeard').textContent = `Heard: “${heard}”`;
      for (const a of alts) {
        const cmd = V.parse(a);
        if (cmd) return run(cmd, a);
      }
      // a longer phrase the page does not know: ask Gemini (through our server) which command it means
      if (heard.split(/\s+/).length < 2 || confidence < 0.35 || !navigator.onLine) return say(`Sorry, I did not understand “${heard}”. Say help for the commands.`);
      try {
        $('voiceHeard').textContent = `Heard: “${heard}” · thinking…`;
        const r = await fetch('api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: heard }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.id) throw new Error(j.error || 'no answer');
        if (j.id === 'none') return say(j.reply || `Sorry, I can’t do that. Say help for the commands.`);
        return run({ id: j.id, arg: j.arg }, heard, j.reply);
      } catch {
        say(`Sorry, I did not understand “${heard}”. Say help for the commands.`);
      }
    }

    const click = (id) => $(id)?.click();
    const setValue = (id, value, event = 'change') => {
      const el = $(id);
      el.value = value;
      el.dispatchEvent(new Event(event, { bubbles: true }));
    };

    // ---------------------------------------------------------------- explain, search results
    const SOUND = { soft: 'piano', electric: 'electric piano', guitar: 'guitar', marimba: 'marimba', flute: 'flute', strings: 'violin' };
    const first = (t) => (String(t || '').match(/^[^.!?]*[.!?]?/) || [''])[0].trim();
    /** A short spoken explanation of what is loaded and what each sound means. */
    function explain() {
      const s = app.src;
      const p = app.plan;
      if (!s || !p?.count) return 'Nothing is loaded yet. Say search for, and a topic, or go to the image tab.';
      const out = [`This is ${s.name.replace(/^NASA (EIC|satellite) · /, '')}.`];
      const note = first(s.origin?.note);
      if (note) out.push(note);
      out.push(`It plays ${p.count} steps${p.labels[0] && p.count > 1 ? `, from ${p.labels[0]} to ${p.labels[p.count - 1]}` : ''}.`);
      const chans = p.channels.filter((c) => c.active);
      const heard = (chans.length ? chans : p.channels.slice(0, 1)).slice(0, 3);
      const what = first(heard[0].hint).replace(/[.]$/, '');
      const on = (c) => `${c.name}${SOUND[c.instrument] ? ` on the ${SOUND[c.instrument]}` : ''}`;
      const names = heard.map(on);
      out.push(`You hear ${names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]}.${what && s.kind !== 'earth' ? ` ${heard[0].name}: ${what}.` : what ? ` ${what}.` : ''}${s.kind === 'earth' ? '' : ' Higher values play higher notes.'}`);
      const insight = $('insights')?.querySelector('li')?.textContent;
      if (insight) out.push(insight);
      out.push('Say describe for more, or play to listen.');
      return out.join(' ').replace(/\s+/g, ' ');
    }

    const S = () => B.search;
    const WHAT = { image: 'pictures', video: 'videos', data: 'data sets' };
    /** Read the top search results aloud, numbered. */
    function readResults(q) {
      const list = (S().results?.() || []).map((r) => S().info(r.id)).filter(Boolean).slice(0, 6);
      if (!list.length) return say($('searchStatus').textContent || `Nothing found for ${q}.`);
      say(`${list.length} ${(WHAT[S().mode()] || 'results').replace(/s$/, list.length === 1 ? '' : 's')} for ${q}. ` + list.map((c, k) => `${k + 1}: ${c.title}.`).join(' ') + ' Say result 1 to play the first one, or play and a name.');
    }
    /** Make sure a tab with search is open (Image, Video or Data); Earth events switches to Data. */
    function searchTab() {
      app.showPage?.('studio', { focus: false });
      if (S()?.mode?.()) return '';
      document.querySelector('[data-mode="data"]')?.click();
      return ' in the Data tab';
    }
    /** Load one search result and start playing it. */
    function playResult(id) {
      const c = S().info(id);
      const before = app.src;
      say(`Loading ${c?.title || 'it'}.`, { quiet: true });
      return S()
        .choose(id)
        .then(() => {
          if (app.src === before || !app.plan?.count) return say(`Sorry, ${c?.title || 'that'} could not load.`);
          if (!app.player.playing) app.play();
          say(`Playing ${c?.title || 'it'}.`, { quiet: true });
        })
        .catch(() => say(`Sorry, ${c?.title || 'that'} could not load.`));
    }

    /** Do one command and say what was done. */
    function run({ id, arg }, heard, reply) {
      const st = app.state;
      const p = app.player;
      const plan = app.plan;
      const label = (i) => (plan?.labels[i] ? `, ${plan.labels[i]}` : '');
      switch (id) {
        case 'play':
          // "play hurricanes": a search result by name, or the first result of a search for it
          if (arg && S()?.mode?.()) {
            const shown = (S().results() || []).map((r) => S().info(r.id)).filter(Boolean);
            const hit = B.eicSearch.rank(shown, arg, 1)[0];
            if (hit) return playResult(hit.id);
            return S()
              .run(arg)
              .then(() => {
                const top = S().results()[0];
                return top ? playResult(top.id) : say($('searchStatus').textContent || `Nothing found for ${arg}.`);
              });
          }
          if (!p.playing) app.play();
          return say(reply || 'Playing.', { quiet: true });
        case 'pause':
          if (p.playing) app.play();
          return say(reply || 'Paused.');
        case 'restart':
          app.seek(0);
          if (!p.playing) app.play();
          return say('From the beginning.', { quiet: true });
        case 'next':
        case 'previous': {
          if (p.playing) p.pause();
          const i = Math.max(0, Math.min((plan?.count || 1) - 1, st.position + (id === 'next' ? 1 : -1)));
          app.seek(i, { audition: true });
          return setTimeout(() => say(`Step ${i + 1} of ${plan?.count || 1}${label(i)}.`), 450);
        }
        case 'where':
          return say(plan ? B.panels.stepSummary(app, st.position) : 'Nothing is loaded yet.');
        case 'explain':
          if (p.playing) app.play();
          return say(explain());
        case 'result': {
          const list = S()?.results?.() || [];
          if (!list.length) return say('There are no search results yet. Say search for, and a topic, for example: search for sea ice.');
          const r = list[+arg - 1];
          if (!r) return say(`There ${list.length === 1 ? 'is only 1 result' : `are only ${list.length} results`}.`);
          return playResult(r.id);
        }
        case 'describe':
          if (p.playing) app.play();
          return B.panels.speak(app);
        case 'faster':
        case 'slower': {
          const t = Math.max(50, Math.min(200, st.settings.tempo + (id === 'faster' ? 16 : -16)));
          setValue('tempo', t);
          return say(`${t} beats per minute.`);
        }
        case 'louder':
        case 'quieter': {
          const v = Math.max(0, Math.min(100, Math.round(st.audio.volume * 100) + (id === 'louder' ? 15 : -15)));
          setValue('volume', v, 'input');
          return say(`Volume ${v} percent.`);
        }
        case 'mute':
        case 'unmute':
          if (st.audio.muted !== (id === 'mute')) click('muteBtn');
          return say(id === 'mute' ? 'Muted.' : 'Sound on.');
        case 'tab':
          app.showPage?.('studio', { focus: false });
          document.querySelector(`[data-mode="${arg}"]`)?.click();
          return say(`${{ image: 'Image', video: 'Video', earth: 'Earth events', data: 'Data' }[arg]} tab.`);
        case 'search': {
          const where = searchTab();
          if (where) say(`Searching for ${arg}${where}.`, { quiet: true });
          return S()
            .run(arg)
            .then(() => readResults(arg))
            .catch(() => say(`Sorry, the search did not work. ${$('searchStatus').textContent || ''}`));
        }
        case 'instrument':
          setValue('instrument', V.INSTRUMENTS[arg]);
          return say(`${arg[0].toUpperCase() + arg.slice(1)}.`);
        case 'mood':
          document.querySelector(`[data-mood="${arg}"]`)?.click();
          return say(arg === 'normal' ? 'Default sound.' : `${arg[0].toUpperCase() + arg.slice(1)} mood.`);
        case 'tuning':
          click('autoTuneBtn');
          return say($('autoTuneNote').textContent || 'Smart Tuning done.');
        case 'output':
          if (['5.1', '7.1', '7.1.4'].includes(V.OUTPUTS[arg]) && !app.src?.science) return say('Surround sound is for scientific maps. Open a NetCDF, HDF5 or GeoTIFF file first, or Sunlight on Earth in the Image tab.');
          setValue('output', V.OUTPUTS[arg]);
          return say(`${{ stereo: 'Stereo', binaural: 'Headphone 3D', '5.1': '5.1 surround', '7.1': '7.1 surround', '7.1.4': '7.1.4 with height' }[V.OUTPUTS[arg]]}.`);
        case 'drums':
          if ($('drums').checked !== (arg === 'on')) click('drums');
          return say(arg === 'on' ? 'Drums on.' : 'Drums off.');
        case 'readings':
          click('tableBtn');
          return say('The readings table is open. Press Escape to close it.');
        case 'export':
          click('exportBtn');
          return say('The export window is open. Choose a format, then Save audio.');
        case 'upload':
          click('uploadBtn');
          return say('Opening the file chooser. If nothing opens, press the Upload button at the top.');
        case 'howto':
          app.showPage?.('howto');
          return say('How to use Bit2Beat. Each part is explained briefly. Say go to image, or another tab, to come back.');
        case 'story':
          app.showPage?.('story');
          return say('Bitty’s story.');
        case 'theme': {
          const box = document.querySelector('[data-pref="dark"]');
          if (box && box.checked !== (arg === 'dark')) box.click();
          return say(arg === 'dark' ? 'Dark theme.' : 'Light theme.');
        }
        case 'help':
          return say(V.helpText());
        case 'repeat':
          return say(last || 'Nothing to repeat yet.');
        case 'stop':
          return stop();
      }
      return say(`Sorry, I did not understand “${heard}”.`);
    }

    // ---------------------------------------------------------------- the first-open question
    function ask() {
      const box = $('voiceAsk');
      const before = document.activeElement;
      let n = 5;
      let timer = 0;
      const close = (yes) => {
        clearInterval(timer);
        box.hidden = true;
        document.removeEventListener('keydown', keys, true);
        remember({ asked: true });
        root.dispatchEvent(new CustomEvent('b2b:voice-asked', { detail: { yes } }));
        if (yes) start();
        else {
          announce('Voice control stays off. Press V to turn it on at any time.');
          try {
            if (before && document.contains(before)) before.focus({ preventScroll: true });
          } catch {}
        }
      };
      const keys = (e) => {
        if (box.hidden) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(false);
        } else if (e.key === 'Tab' || e.key === 'Shift') clearInterval(timer); // reading the box: no hurry
      };
      $('voiceYes').onclick = () => close(true);
      $('voiceNo').onclick = () => close(false);
      box.onpointerenter = () => clearInterval(timer);
      box.hidden = false;
      $('voiceCount').textContent = n;
      $('voiceYes').focus({ preventScroll: true });
      document.addEventListener('keydown', keys, true);
      timer = setInterval(() => {
        n--;
        $('voiceCount').textContent = n;
        if (n <= 0) close(false);
      }, 1000);
      // read aloud too, where the browser allows speech before a click
      try {
        if ('speechSynthesis' in root) root.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance('Do you want to turn on voice control? Press Enter for yes.'), { rate: 1.1 }));
      } catch {}
    }

    $('voiceBtn').onclick = () => (on ? stop() : start());
    $('voiceOff').onclick = () => stop();
    $('voiceHelp').onclick = () => say(V.helpText());
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('dialog[open]')) {
        const tag = e.target.tagName;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.target.isContentEditable) return;
        e.preventDefault();
        on ? stop() : start();
      }
    });

    const saved = storage.get(KEY, {});
    if (!navigator.mediaDevices?.getUserMedia && !Rec) $('voiceBtn').title = 'Voice control needs a microphone.';
    else if (!saved.asked) setTimeout(ask, 600);
    else if (saved.on) {
      // it was on last time: offer it again with one key, without opening the microphone by itself
      setTimeout(() => toast('Voice control was on last time.', 7000, { label: 'Turn it on', run: start }), 900);
    }

    return { start, stop, run, get on() {
      return on;
    } };
  }

  B.voice = { init };
})(typeof self !== 'undefined' ? self : this);
