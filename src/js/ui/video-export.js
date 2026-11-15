/**
 * Bit2Beat ui · the video export: the whole piece as an MP4 (1080p, 30 fps) with the sound on it,
 * made with the settings you have now. Nothing has to play: frames are drawn off-screen and encoded
 * with the browser's own encoders (WebCodecs), much faster than real time on most computers.
 * The sound is the same render as Download audio (stereo, or binaural when that is your output).
 * Browsers without WebCodecs fall back to Record, which captures in real time.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;

  const FPS = 30;
  const LEAD = 0.05; // the export starts the first note 50 ms in (audio/exporter.js)

  const supported = () => typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function' && typeof VideoFrame === 'function' && typeof AudioData === 'function';

  async function pickVideo(width, height) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f']) {
      const cfg = { codec, width, height, bitrate: 6_000_000, framerate: FPS, avc: { format: 'avc' } };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
      } catch {
        /* try the next profile */
      }
    }
    return null;
  }
  async function pickAudio(channels) {
    for (const [kind, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: channels, bitrate: 192_000 };
      try {
        if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { kind, cfg };
      } catch {
        /* next */
      }
    }
    return null;
  }

  /** The step heard at time t (seconds), with the fraction of the way to the next one. */
  function stepAt(plan, t) {
    const T = plan.times;
    let lo = 0;
    let hi = plan.count - 1;
    if (t < LEAD + T[0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (LEAD + T[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    const next = lo + 1 < plan.count ? LEAD + T[lo + 1] : LEAD + T[lo] + plan.step;
    return lo + Math.min(0.999, Math.max(0, (t - LEAD - T[lo]) / Math.max(1e-6, next - LEAD - T[lo])));
  }

  /**
   * @param {object} app
   * @param {{onProgress?:(f:number, text:string)=>void, signal?:AbortSignal, width?:number, height?:number}} o
   * @returns {Promise<{blob:Blob, name:string, seconds:number, audio:string}>}
   */
  async function render(app, { onProgress = () => {}, signal, width = 1920, height = 1080 } = {}) {
    if (!supported()) throw new Error('This browser cannot make video files. Use Record instead (it records while the piece plays).');
    const plan = app.plan;
    const vcfg = await pickVideo(width, height);
    if (!vcfg) throw new Error('This browser has no H.264 video encoder. Use Record instead.');
    const output = app.state.prefs.mono ? 'stereo' : app.state.audio.output === 'binaural' ? 'binaural' : 'stereo';

    // 1 · the sound (the same render as Download audio)
    onProgress(0, 'Rendering the sound…');
    const snd = await B.exporter.render(plan, output, { ...app.state.audio, mono: app.state.prefs.mono }, { raw: true });
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const chans = snd.channels;
    const acfg = await pickAudio(chans.length);
    if (!acfg) throw new Error('This browser has no audio encoder for video. Use Record instead.');

    const vChunks = [];
    const aChunks = [];
    let vDesc = null;
    let aDesc = null;
    let failure = null;
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig?.description) vDesc = new Uint8Array(meta.decoderConfig.description);
        const d = new Uint8Array(chunk.byteLength);
        chunk.copyTo(d);
        vChunks.push({ d, ts: chunk.timestamp, dur: chunk.duration || 1e6 / FPS, key: chunk.type === 'key' });
      },
      error: (e) => (failure = e),
    });
    venc.configure(vcfg);
    const aenc = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig?.description) aDesc = new Uint8Array(meta.decoderConfig.description);
        const d = new Uint8Array(chunk.byteLength);
        chunk.copyTo(d);
        aChunks.push({ d, ts: chunk.timestamp, dur: chunk.duration });
      },
      error: (e) => (failure = e),
    });
    aenc.configure(acfg.cfg);

    // 2 · encode the sound in 0.1 s blocks
    const RATE = snd.rate;
    const total = chans[0].length;
    for (let at = 0; at < total; at += 4800) {
      const n = Math.min(4800, total - at);
      const data = new Float32Array(n * chans.length);
      chans.forEach((c, k) => data.set(c.subarray(at, at + n), k * n));
      const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: chans.length, timestamp: Math.round((at / RATE) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();

    // 3 · draw and encode every frame
    const comp = B.composer.create(app, { width, height });
    await comp.ready;
    const seconds = total / RATE;
    const frames = Math.ceil(seconds * FPS);
    const t0 = performance.now();
    try {
      for (let f = 0; f < frames; f++) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
        if (failure) throw failure;
        const p = stepAt(plan, f / FPS);
        if (comp.hasPicture) await comp.prepare(p);
        comp.draw(Math.floor(p));
        const vf = new VideoFrame(comp.canvas, { timestamp: Math.round((f / FPS) * 1e6), duration: Math.round(1e6 / FPS) });
        venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
        vf.close();
        while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
        if (f % 15 === 0) {
          const el = (performance.now() - t0) / 1000;
          const left = f > 30 ? Math.round((el / f) * (frames - f)) : null;
          onProgress(f / frames, `Making the video: ${Math.round((f / frames) * 100)}%${left != null ? ` · about ${B.music.seconds(left)} left` : ''}`);
          await new Promise((r) => setTimeout(r, 0)); // let the page breathe
        }
      }
      await venc.flush();
    } finally {
      venc.state !== 'closed' && venc.close();
      comp.dispose();
      app.drawAll(); // the studio's own view again (some sources keep the frame they last drew)
    }
    if (failure) throw failure;

    // 4 · put it in an MP4
    onProgress(1, 'Saving…');
    const mux = B.mp4.createMuxer({
      video: { width, height, description: vDesc },
      audio: { codec: acfg.kind, sampleRate: RATE, channels: chans.length, description: acfg.kind === 'aac' ? aDesc : null, bitrate: 192000 },
    });
    vChunks.forEach((c) => mux.add('video', c.d, c.ts, c.dur, c.key));
    aChunks.forEach((c) => mux.add('audio', c.d, c.ts, c.dur));
    const out = mux.finish();
    const name = `${B.dom.slug(app.src.name)}-video.mp4`;
    return { blob: new Blob(out.parts, { type: 'video/mp4' }), name, seconds, audio: output, codec: acfg.kind };
  }

  B.videoExport = { render, supported, stepAt, FPS };
})(typeof self !== 'undefined' ? self : this);
