/**
 * Bit2Beat ui · voice control, for people who cannot (or would rather not) use a screen or mouse.
 *
 * The first time the site opens, a small box asks: "Do you want to turn on voice control?" with
 * five seconds to answer (Enter = yes, Escape = no; it is read by screen readers and, where the
 * browser allows, spoken aloud). V turns voice control on and off at any time.
 *
 * Phrases are understood on the page first (core/voice-commands.js: play, pause, next, search for
 * …, go to video, violin, 7.1, help, stop voice control …). A phrase the page does not know goes
 * to Gemini through our server (api/voice.js), which may only answer with one of those same
 * commands. Every action is confirmed out loud.
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
      if (!('speechSynthesis' in root) || quiet) return announce(text);
      speaking = true;
      try {
        rec?.abort(); // do not hear ourselves
      } catch {}
      root.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.lang = 'en-US';
      u.onend = u.onerror = () => {
        speaking = false;
        listen();
      };
      root.speechSynthesis.speak(u);
    }

    // ---------------------------------------------------------------- listening
    function listen() {
      if (!on || speaking || !rec) return;
      try {
        rec.start();
      } catch {
        /* already listening */
      }
    }

    function start() {
      if (!Rec) {
        toast('This browser cannot listen to speech. Voice control works in Chrome, Edge and Safari.', 6000);
        return false;
      }
      if (!rec) {
        rec = new Rec();
        rec.lang = 'en-US';
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
          } else if (e.error === 'network') $('voiceHeard').textContent = 'Voice control needs an internet connection in this browser.';
        };
        rec.onend = () => setTimeout(listen, 250); // keep listening until it is turned off
      }
      on = true;
      remember({ asked: true, on: true });
      $('voiceBtn').setAttribute('aria-pressed', 'true');
      $('voiceBar').hidden = false;
      document.body.classList.add('voice-on');
      say('Voice control is on. Say help to hear what you can say.');
      return true;
    }

    function stop(spoken = true) {
      on = false;
      remember({ asked: true, on: false });
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

    /** Do one command and say what was done. */
    function run({ id, arg }, heard, reply) {
      const st = app.state;
      const p = app.player;
      const plan = app.plan;
      const label = (i) => (plan?.labels[i] ? `, ${plan.labels[i]}` : '');
      switch (id) {
        case 'play':
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
        case 'search':
          app.showPage?.('studio', { focus: false });
          $('searchInput').value = arg;
          $('searchInput').dispatchEvent(new Event('input', { bubbles: true }));
          $('searchForm').requestSubmit();
          return say(`Searching for ${arg}.`);
        case 'instrument':
          setValue('instrument', V.INSTRUMENTS[arg]);
          return say(`${arg[0].toUpperCase() + arg.slice(1)}.`);
        case 'mood':
          document.querySelector(`[data-mood="${arg}"]`)?.click();
          return say(`${arg[0].toUpperCase() + arg.slice(1)} mood.`);
        case 'tuning':
          click('autoTuneBtn');
          return say($('autoTuneNote').textContent || 'Smart Tuning done.');
        case 'output':
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
    if (!Rec) $('voiceBtn').title = 'Voice control works in Chrome, Edge and Safari.';
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
