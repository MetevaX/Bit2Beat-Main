/**
 * Bit2Beat ui · reading aloud with pause, resume, stop (and skip, in the story).
 * One place for every spoken text: “What the data says”, Bitty’s story chapters.
 * Text is spoken sentence by sentence, so Pause and Resume work the same in every browser and
 * long texts are never cut off. Resume carries on from the word where it was paused: the
 * browser's word boundaries tell us where it is (or, for voices without them, the time spoken).
 * A bar under the top bar shows what is being read with Pause / Resume, Stop and, when
 * something follows (the chapter’s music), Skip. Esc stops reading.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, announce } = B.dom;
  const supported = 'speechSynthesis' in root && typeof root.SpeechSynthesisUtterance === 'function';

  let job = null; // { parts, i, at, paused, label, onend, skip } · at = character to start the sentence from
  let token = 0;
  const CHARS_PER_SECOND = 14; // speaking speed at rate 1, for voices that report no word boundaries
  const now = () => (root.performance ? performance.now() : Date.now());

  /** Start of the word around character `p` of `s`. */
  function wordStart(s, p) {
    p = Math.max(0, Math.min(p, s.length));
    while (p > 0 && !/\s/.test(s[p - 1])) p--;
    return p;
  }

  /** Where to carry on in the current sentence after a pause (a character index, at a word start). */
  function resumePoint() {
    const part = job.parts[job.i];
    if (job.bounds) return wordStart(part, job.heard); // the word that was being spoken
    const guess = job.from + Math.floor(((now() - job.t0) / 1000) * CHARS_PER_SECOND);
    return wordStart(part, wordStart(part, guess) - 1); // an estimate: go back one more word to be safe
  }

  /** Split into sentences (keeps “3.7” and “°C.” intact) and short enough chunks. */
  function sentences(text) {
    const out = [];
    String(text)
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?…])\s+(?=[“"(A-Z0-9])/)
      .forEach((s) => {
        while (s.length > 220) {
          const cut = s.lastIndexOf(', ', 200) > 60 ? s.lastIndexOf(', ', 200) + 1 : 200;
          out.push(s.slice(0, cut).trim());
          s = s.slice(cut).trim();
        }
        if (s.trim()) out.push(s.trim());
      });
    return out;
  }

  function render() {
    const bar = $('speechBar');
    if (!bar) return;
    bar.hidden = !job;
    document.documentElement.classList.toggle('is-speaking', !!job);
    if (!job) return;
    $('speechLabel').textContent = job.label;
    const n = Math.min(job.i + 1, job.parts.length);
    $('speechState').textContent = job.paused ? ` · paused (${n} of ${job.parts.length})` : ` · ${n} of ${job.parts.length}`;
    $('speechPause').textContent = job.paused ? 'Resume' : 'Pause';
    $('speechPause').setAttribute('aria-pressed', String(job.paused));
    $('speechSkip').hidden = !job.skip;
    if (job.skip) $('speechSkip').textContent = job.skip;
    root.dispatchEvent(new CustomEvent('b2b:speech', { detail: { active: !!job, paused: !!job?.paused, owner: job?.owner } }));
  }

  function sayCurrent() {
    const my = ++token;
    const from = job.at || 0;
    const u = new root.SpeechSynthesisUtterance(job.parts[job.i].slice(from));
    Object.assign(job, { from, heard: from, bounds: false, t0: now() });
    u.rate = 1;
    u.onstart = () => my === token && job && (job.t0 = now());
    u.onboundary = (e) => {
      if (my !== token || !job || (e.name && e.name !== 'word')) return;
      job.bounds = true;
      job.heard = from + e.charIndex;
    };
    u.onend = () => {
      if (my !== token || !job || job.paused) return;
      job.i += 1;
      job.at = 0;
      if (job.i >= job.parts.length) return finish('done');
      render();
      sayCurrent();
    };
    u.onerror = (e) => {
      if (my !== token || !job || job.paused) return;
      if (e.error !== 'interrupted' && e.error !== 'canceled') finish('done');
    };
    root.speechSynthesis.speak(u);
  }

  function finish(reason) {
    const j = job;
    job = null;
    token++;
    if (supported) root.speechSynthesis.cancel();
    render();
    if (!j) return;
    root.dispatchEvent(new CustomEvent('b2b:speech', { detail: { active: false, owner: j.owner } }));
    j.onend?.(reason);
  }

  /**
   * Read `text` aloud. opts: { label, owner, skip (button text), onend(reason) } with
   * reason 'done' | 'skip' | 'stop'. Without speech support, onend('done') runs at once.
   */
  function speak(text, opts = {}) {
    if (job) finish('stop');
    const parts = sentences(text);
    if (!supported || !parts.length) {
      if (!supported) announce(text);
      opts.onend?.('done');
      return false;
    }
    root.speechSynthesis.cancel();
    job = { parts, i: 0, at: 0, paused: false, label: opts.label || 'Bitty is reading', owner: opts.owner || '', skip: opts.skip || '', onend: opts.onend };
    render();
    sayCurrent();
    return true;
  }

  /** Pause where we are: remember the word, then stop the voice (cancel works in every browser). */
  function pause() {
    if (!job || job.paused) return;
    job.at = resumePoint();
    if (!job.parts[job.i].slice(job.at).trim()) {
      job.i += 1; // the sentence had just ended
      job.at = 0;
    }
    job.paused = true;
    token++;
    root.speechSynthesis.cancel();
    render();
  }
  function resume() {
    if (!job || !job.paused) return;
    if (job.i >= job.parts.length) return finish('done');
    job.paused = false;
    render();
    sayCurrent();
  }
  const stop = () => job && finish('stop');
  const skip = () => job && finish('skip');

  if (typeof document !== 'undefined' && $('speechBar')) {
    $('speechFace').innerHTML = B.bittyArt.dog('happy');
    $('speechPause').onclick = () => (job?.paused ? resume() : pause());
    $('speechStop').onclick = stop;
    $('speechSkip').onclick = skip;
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && job && !document.querySelector('dialog[open]') && !B.tour?.isOpen()) stop();
    });
    root.addEventListener('pagehide', stop);
  }

  B.speech = { supported, speak, pause, resume, stop, skip, sentences, wordStart, active: () => !!job, owner: () => job?.owner || '', paused: () => !!job?.paused };
})(typeof self !== 'undefined' ? self : this);
