/**
 * Bit2Beat ui · the ear of voice control: listens to the microphone and cuts out each phrase.
 *
 * Works in every browser with a microphone (Chrome, Edge, Firefox, Safari, Brave…), unlike the
 * browser's own speech recognition, which is missing or blocked in several of them. The level of
 * the sound is followed all the time; when it rises clearly above the room's own noise a phrase
 * starts (with a short lead-in so the first sound is not cut), and 0.7 s of quiet ends it. The
 * phrase becomes a small 16 kHz mono WAV (about 32 kB a second) that voice control sends to
 * Gemini, which writes out what was said in any language or accent.
 *
 *   const ear = B.voiceEar.create({ onPhrase(base64Wav, seconds), onLevel(0…1) });
 *   await ear.start();  ear.pause(true / false);  ear.hold(true / false);  ear.send();  ear.stop();
 *
 * hold(true) (push to talk: a key is held down): the phrase starts at once and pauses do not end
 * it. send(): the key was let go, so the phrase ends 0.3 s later. hold(false) alone: it ends at the
 * next short pause.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;

  const RATE = 16000; // what is sent
  const LEAD = 0.3; // seconds kept before the voice starts
  const QUIET = 0.7; // seconds of quiet that end a phrase
  const LONGEST = 7; // seconds
  const HELD_LONGEST = 15; // seconds, while a key is held down
  const SHORTEST = 0.25; // seconds of voice; anything shorter is a click or a cough

  /** Mean of each group of samples: from the microphone's rate down to 16 kHz. */
  function downsample(data, from) {
    if (from === RATE) return data;
    const k = from / RATE;
    const out = new Float32Array(Math.floor(data.length / k));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * k);
      const b = Math.min(data.length, Math.floor((i + 1) * k));
      let s = 0;
      for (let j = a; j < b; j++) s += data[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  }

  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function create({ onPhrase, onLevel = () => {} }) {
    let ctx = null;
    let stream = null;
    let node = null;
    let paused = false;
    let holding = false;
    let tail = 0; // seconds left before a sent phrase ends
    let floor = 0.004; // the room's own noise level (RMS)
    let lead = []; // recent blocks, for the lead-in
    let phrase = null; // { blocks, voiced, quiet }

    function finish() {
      const p = phrase;
      phrase = null;
      tail = 0;
      if (!p || p.voiced < SHORTEST) return;
      const n = p.blocks.reduce((a, b) => a + b.length, 0);
      const all = new Float32Array(n);
      let o = 0;
      p.blocks.forEach((b) => (all.set(b, o), (o += b.length)));
      const pcm = downsample(all, ctx.sampleRate);
      // even out the loudness, so quiet speakers are heard as well as loud ones
      let peak = 0;
      for (const v of pcm) peak = Math.max(peak, Math.abs(v));
      if (peak > 0 && peak < 0.5) for (let i = 0; i < pcm.length; i++) pcm[i] *= 0.5 / peak;
      const wav = B.wav.encodeWav({ channels: [pcm], sampleRate: RATE, bitDepth: 16 });
      onPhrase(base64(new Uint8Array(wav.buffer || wav)), pcm.length / RATE);
    }

    function block(data) {
      const dt = data.length / ctx.sampleRate;
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      const threshold = Math.max(0.01, floor * 3.2);
      onLevel(Math.min(1, rms / (threshold * 3)));
      if (paused) {
        phrase = null;
        lead = [];
        return;
      }
      const copy = data.slice();
      if (!phrase) {
        floor = rms < threshold ? floor * 0.97 + rms * 0.03 : floor; // learn the room while nobody speaks
        lead.push(copy);
        while (lead.length * dt > LEAD) lead.shift();
        if (rms > threshold || holding) phrase = { blocks: [...lead], voiced: rms > threshold ? dt : 0, quiet: 0, length: lead.length * dt };
        return;
      }
      phrase.blocks.push(copy);
      phrase.length += dt;
      if (rms > threshold * 0.7) {
        phrase.voiced += dt;
        phrase.quiet = 0;
      } else phrase.quiet += dt;
      if ((tail > 0 && (tail -= dt) <= 0) || (!holding && phrase.quiet >= QUIET) || phrase.length >= (holding ? HELD_LONGEST : LONGEST)) {
        lead = [];
        finish();
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone here (the page must be opened over https).');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC();
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => block(e.inputBuffer.getChannelData(0));
      const mute = ctx.createGain();
      mute.gain.value = 0; // the processor must be connected to run, but nothing is played
      src.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
    }

    function stop() {
      try {
        node && (node.onaudioprocess = null);
        stream?.getTracks().forEach((t) => t.stop());
        ctx?.close();
      } catch {}
      [ctx, stream, node, phrase] = [null, null, null, null];
      onLevel(0);
    }

    return {
      start,
      stop,
      pause: (p) => {
        paused = !!p;
        if (p) [phrase, holding, tail] = [null, false, 0];
      },
      hold: (h) => {
        holding = !!h;
        tail = 0;
        if (h) paused = false;
      },
      send: () => {
        holding = false;
        if (phrase) tail = 0.3;
      },
      get running() {
        return !!ctx;
      },
    };
  }

  B.voiceEar = { create, downsample };
})(typeof self !== 'undefined' ? self : this);
