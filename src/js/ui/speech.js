/**
 * Bit2Beat ui · reading aloud with pause, resume, stop (and skip, in the story).
 * One place for every spoken text: “What the data says”, Bitty’s story chapters.
 * Text is spoken sentence by sentence, so Pause and Resume work the same in every browser
 * (Resume starts again at the sentence that was paused) and long texts are never cut off.
 * A bar under the top bar shows what is being read with Pause / Resume, Stop and, when
 * something follows (the chapter’s music), Skip. Esc stops reading.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, announce } = B.dom;
  const supported = 'speechSynthesis' in root && typeof root.SpeechSynthesisUtterance === 'function';

  let job = null; // { parts, i, paused, label, onend, skip }
  let token = 0;

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
    $('speechState').textContent = job.paused ? ` · paused (${job.i + 1} of ${job.parts.length})` : ` · ${job.i + 1} of ${job.parts.length}`;
    $('speechPause').textContent = job.paused ? 'Resume' : 'Pause';
    $('speechPause').setAttribute('aria-pressed', String(job.paused));
    $('speechSkip').hidden = !job.skip;
    if (job.skip) $('speechSkip').textContent = job.skip;
    root.dispatchEvent(new CustomEvent('b2b:speech', { detail: { active: !!job, paused: !!job?.paused, owner: job?.owner } }));
  }

  function sayCurrent() {
    const my = ++token;
    const u = new SpeechSynthesisUtterance(job.parts[job.i]);
    u.rate = 1;
    u.onend = () => {
      if (my !== token || !job || job.paused) return;
      job.i += 1;
      if (job.i >= job.parts.length) return finish('done');
      render();
      sayCurrent();
    };
    u.onerror = (e) => {
      if (my !== token || !job || job.paused) return;
      if (e.error !== 'interrupted' && e.error !== 'canceled') finish('done');
    };
    speechSynthesis.speak(u);
  }

  function finish(reason) {
    const j = job;
    job = null;
    token++;
    if (supported) speechSynthesis.cancel();
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
    speechSynthesis.cancel();
    job = { parts, i: 0, paused: false, label: opts.label || 'Bitty is reading', owner: opts.owner || '', skip: opts.skip || '', onend: opts.onend };
    render();
    sayCurrent();
    return true;
  }

  function pause() {
    if (!job || job.paused) return;
    job.paused = true;
    token++;
    speechSynthesis.cancel();
    render();
  }
  function resume() {
    if (!job || !job.paused) return;
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

  B.speech = { supported, speak, pause, resume, stop, skip, sentences, active: () => !!job, owner: () => job?.owner || '', paused: () => !!job?.paused };
})(typeof self !== 'undefined' ? self : this);
