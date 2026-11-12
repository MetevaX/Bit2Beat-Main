/**
 * Bit2Beat audio · synthesis and spatial rendering (works with AudioContext and OfflineAudioContext).
 *
 * - voice():   one additive-synthesis note (sine partials + envelope); brighter for higher values.
 * - cue():     a short, quiet high tick used to mark sudden jumps in the data.
 * - createRenderer(): routes each channel ("object") to stereo, HRTF binaural, discrete speaker
 *   layouts (5.1 / 7.1 / 7.1.4), speakers virtualised over headphones, or one track per object
 *   with recorded positions for ADM BWF.
 */
((root, factory) => {
  const api = factory(root.Bit2Beat || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Bit2Beat = Object.assign(root.Bit2Beat || {}, { audio: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, (ns) => {
  'use strict';

  const instruments = {
    soft: {
      name: 'Piano',
      family: 'Keys',
      hint: 'A clear attack with a gentle decay',
      partials: [1, 0.35, 0.16, 0.07],
      attack: 0.006,
      tail: 0.75,
    },
    electric: {
      name: 'Electric piano',
      family: 'Keys',
      hint: 'Rounded notes with a metallic edge',
      partials: [1, 0.08, 0.3, 0.02, 0.1],
      attack: 0.008,
      tail: 0.9,
    },
    guitar: {
      name: 'Guitar',
      family: 'Strings',
      hint: 'A short, bright plucked tone',
      partials: [1, 0.55, 0.27, 0.14, 0.07, 0.03],
      attack: 0.004,
      tail: 0.55,
    },
    marimba: {
      name: 'Marimba',
      family: 'Percussion',
      hint: 'Soft wooden strikes with a quick release',
      partials: [1, 0.05, 0.03, 0.3, 0.015],
      attack: 0.003,
      tail: 0.35,
    },
    flute: {
      name: 'Flute',
      family: 'Wind',
      hint: 'A light tone with a soft start',
      partials: [1, 0.08, 0.025],
      attack: 0.085,
      tail: 0.2,
      sustain: true,
    },
    // key kept as 'strings' so saved links and sessions still work; it sounds and is named as a violin
    strings: {
      name: 'Violin',
      family: 'Strings',
      hint: 'A bowed tone that swells in, with a gentle vibrato',
      partials: [1, 0.62, 0.42, 0.3, 0.22, 0.15, 0.1, 0.06],
      attack: 0.09,
      tail: 0.35,
      sustain: true,
      vibrato: { rate: 5.6, depth: 9, delay: 0.12 },
    },
  };

  const reverbCache = new WeakMap();

  /** Deterministic stereo room impulse (same seed every time → reproducible exports). */
  function impulseResponse(ctx) {
    if (reverbCache.has(ctx)) return reverbCache.get(ctx);
    const length = Math.floor(ctx.sampleRate * 1.8),
      ir = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 1234567;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        d[i] = rand() * Math.exp(-t * 3.4) * (t < 0.015 ? t / 0.015 : 1) * 0.5;
      }
    }
    reverbCache.set(ctx, ir);
    return ir;
  }

  /** Create a 3-band biquad EQ chain (Low 110 Hz, Mid 1 kHz, High 4.2 kHz). */
  function createEqChain(ctx, eqState = {}) {
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 110;
    low.gain.value = eqState.eqLow || 0;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.9;
    mid.gain.value = eqState.eqMid || 0;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 4200;
    high.gain.value = eqState.eqHigh || 0;
    low.connect(mid);
    mid.connect(high);
    return { input: low, output: high, low, mid, high };
  }

  /**
   * Create an object renderer.
   * cfg.kind: 'stereo' | 'binaural' | 'layout' (discrete speakers) | 'virtual' (speakers
   * virtualised over headphones) | 'adm' (one mono track per object + recorded metadata).
   */
  function createRenderer(ctx, out, cfg) {
    const spatial = ns.spatial || (typeof window !== 'undefined' && window.Bit2Beat?.spatial);
    const nodes = [];
    const keep = (n) => (nodes.push(n), n);
    const buses = new Map();
    const blocks = {};
    const glide = (param, value, t) => param.setTargetAtTime(value, Math.max(t, 0), 0.012);
    const monoGain = () => {
      const g = keep(ctx.createGain());
      g.channelCount = 1;
      g.channelCountMode = 'explicit';
      return g;
    };
    const setPannerPosition = (panner, p, t) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
      try {
        if (panner.positionX) {
          if (t == null) {
            panner.positionX.value = p.x;
            panner.positionY.value = p.y;
            panner.positionZ.value = p.z;
          } else {
            glide(panner.positionX, p.x, t);
            glide(panner.positionY, p.y, t);
            glide(panner.positionZ, p.z, t);
          }
        } else panner.setPosition(p.x, p.y, p.z);
      } catch {}
    };
    const hrtf = (p) => {
      const panner = keep(ctx.createPanner());
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.6;
      panner.rolloffFactor = 1;
      setPannerPosition(panner, p, null);
      return panner;
    };

    let wet = null,
      convolver = null;
    if (['stereo', 'binaural', 'virtual'].includes(cfg.kind) && !cfg.mono) {
      convolver = keep(ctx.createConvolver());
      convolver.buffer = impulseResponse(ctx);
      wet = keep(ctx.createGain());
      wet.gain.value = (cfg.room ?? 0) * 0.55;
      convolver.connect(wet);
      wet.connect(out);
    }

    let merger = null,
      speakerBuses = null;
    if (cfg.kind === 'layout' || cfg.kind === 'adm') {
      const n = cfg.kind === 'adm' ? cfg.keys.length : cfg.layout.speakers.length;
      merger = keep(ctx.createChannelMerger(n));
      merger.connect(out);
    }
    if (cfg.kind === 'virtual') {
      speakerBuses = cfg.layout.speakers.map((s) => {
        if (s.lfe) return null;
        const g = monoGain();
        const panner = hrtf(spatial.polarToWebAudio(s.polar));
        g.connect(panner);
        panner.connect(out);
        if (convolver) {
          const send = keep(ctx.createGain());
          send.gain.value = 0.6;
          g.connect(send);
          send.connect(convolver);
        }
        return g;
      });
    }

    function makeBus(key) {
      const input = monoGain();
      const front = { x: 0, y: 1, z: 0.2 };
      let setPosition = () => {};
      if (cfg.kind === 'stereo') {
        if (ctx.createStereoPanner) {
          const pan = keep(ctx.createStereoPanner());
          input.connect(pan);
          pan.connect(out);
          setPosition = (pos, t) => glide(pan.pan, cfg.mono ? 0 : spatial.stereoPan(pos), t);
        } else input.connect(out);
      } else if (cfg.kind === 'binaural') {
        const panner = hrtf(spatial.toWebAudio(front));
        input.connect(panner);
        panner.connect(out);
        setPosition = (pos, t) => setPannerPosition(panner, spatial.toWebAudio(pos), t);
      } else if (cfg.kind === 'layout' || cfg.kind === 'virtual') {
        const gains = cfg.layout.speakers.map((s, k) => {
          const g = monoGain();
          g.gain.value = spatial.pannerGains(front, cfg.layout)[k];
          input.connect(g);
          if (cfg.kind === 'layout') g.connect(merger, 0, k);
          else if (speakerBuses[k]) g.connect(speakerBuses[k]);
          return g;
        });
        setPosition = (pos, t) => spatial.pannerGains(pos, cfg.layout).forEach((v, k) => glide(gains[k].gain, v, t));
      } else if (cfg.kind === 'adm') {
        const index = cfg.keys.indexOf(key);
        if (index >= 0) input.connect(merger, 0, index);
        blocks[key] = [];
        setPosition = (pos, t) => blocks[key].push({ time: t, x: pos.x, y: pos.y, z: pos.z });
      }
      if (convolver && cfg.kind !== 'virtual') {
        const send = keep(ctx.createGain());
        send.gain.value = 0.6;
        input.connect(send);
        send.connect(convolver);
      }
      return { input, setPosition };
    }

    return {
      cfg,
      blocks,
      bus(key) {
        if (!buses.has(key)) buses.set(key, makeBus(key));
        return buses.get(key);
      },
      setRoom(v) {
        if (wet) wet.gain.setTargetAtTime(v * 0.55, ctx.currentTime, 0.05);
      },
      dispose() {
        nodes.forEach((n) => {
          try {
            n.disconnect();
          } catch {}
        });
        buses.clear();
      },
    };
  }

  /** One synthesized note (additive partials + envelope) into `out`. Supports optional sharpness boost. */
  function voice(ctx, out, m, time, duration, gain, kind = 'soft', activeNodes = null, options = null) {
    if (!Number.isFinite(m) || !Number.isFinite(time) || !Number.isFinite(duration)) return;
    const safeTime = Math.max(time, ctx.currentTime);
    const music = ns.music || (typeof window !== 'undefined' && window.Bit2Beat?.music);
    const freqFn = music ? music.freq : (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    const baseFreq = freqFn(m);
    if (!Number.isFinite(baseFreq) || baseFreq < 15 || baseFreq > 22000) return;
    const model = instruments[kind] || instruments.soft;
    const sharpness = options?.sharpness || (options?.value != null ? (1 + Math.pow(options.value, 1.3) * 1.8) : 1);
    let targetOut = out;
    let sharpFilter = null;
    if (sharpness > 1.05 && ctx.createBiquadFilter) {
      try {
        sharpFilter = ctx.createBiquadFilter();
        sharpFilter.type = 'highshelf';
        sharpFilter.frequency.value = 2200;
        sharpFilter.gain.value = Math.min(14, (sharpness - 1) * 7);
        sharpFilter.connect(out);
        targetOut = sharpFilter;
      } catch {}
    }
    const env = ctx.createGain();
    const attack = Math.min(model.attack, duration * 0.4),
      total = duration + model.tail;
    const amplitude = Math.max(0, gain) * 0.19;
    env.gain.setValueAtTime(0.0001, safeTime);
    env.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), safeTime + attack);
    if (model.sustain) {
      env.gain.setValueAtTime(Math.max(0.0001, amplitude * 0.8), safeTime + duration);
      env.gain.exponentialRampToValueAtTime(0.0001, safeTime + total);
    } else env.gain.exponentialRampToValueAtTime(0.0001, safeTime + total);
    env.connect(targetOut);
    const sum = model.partials.reduce((a, b) => a + b, 0);
    let remaining = 0;
    model.partials.forEach((level, index) => {
      const frequency = baseFreq * (index + 1);
      if (frequency > ctx.sampleRate * 0.45) return;
      const osc = ctx.createOscillator(),
        part = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      if (kind === 'electric' && index === 2) osc.detune.value = 7;
      if (model.vibrato && ctx.createOscillator) {
        // a slow pitch wobble after the bow settles (cents), the same on every partial
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = model.vibrato.rate;
        depth.gain.setValueAtTime(0, safeTime);
        depth.gain.linearRampToValueAtTime(model.vibrato.depth, safeTime + model.vibrato.delay + 0.15);
        lfo.connect(depth);
        depth.connect(osc.detune);
        lfo.start(safeTime);
        lfo.stop(safeTime + total + 0.02);
        lfo.onended = () => {
          try {
            lfo.disconnect();
            depth.disconnect();
          } catch {}
        };
      }
      const harmonicWeight = index > 0 ? Math.pow(sharpness, 0.7) : 1;
      part.gain.value = (level * harmonicWeight) / sum;
      osc.connect(part);
      part.connect(env);
      osc.start(safeTime);
      osc.stop(safeTime + total + 0.02);
      remaining++;
      if (activeNodes) activeNodes.add(osc);
      osc.onended = () => {
        try {
          if (activeNodes) activeNodes.delete(osc);
          osc.disconnect();
          part.disconnect();
          if (--remaining === 0) {
            env.disconnect();
            if (sharpFilter) {
              try { sharpFilter.disconnect(); } catch {}
            }
          }
        } catch {}
      };
    });
  }

  /** Short percussive tick (2.6 kHz, 35 ms) used as an anomaly cue. */
  function cue(ctx, out, time, gain = 0.5, activeNodes = null) {
    const t = Math.max(time, ctx.currentTime);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 2600;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.06 * Math.max(0, gain), t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + 0.05);
    if (activeNodes) activeNodes.add(osc);
    osc.onended = () => {
      if (activeNodes) activeNodes.delete(osc);
      try {
        osc.disconnect();
        env.disconnect();
      } catch {}
    };
  }

  /**
   * Reference drone: a soft sustained tone (fundamental + octave) from `start` to `end`.
   * Lets listeners hear whether the data is above or below a baseline.
   */
  function drone(ctx, out, m, start, end, gain = 0.5, activeNodes = null) {
    const music = ns.music || (typeof window !== 'undefined' && window.Bit2Beat?.music);
    const f = music ? music.freq(m) : 440 * 2 ** ((m - 69) / 12);
    const t0 = Math.max(start, ctx.currentTime);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.035 * gain, t0 + 0.4);
    env.gain.setValueAtTime(0.035 * gain, Math.max(t0 + 0.41, end - 0.4));
    env.gain.linearRampToValueAtTime(0.0001, end);
    env.connect(out);
    [1, 2].forEach((mult, k) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f * mult;
      g.gain.value = k ? 0.3 : 1;
      o.connect(g);
      g.connect(env);
      o.start(t0);
      o.stop(end + 0.05);
      if (activeNodes) activeNodes.add(o);
      o.onended = () => {
        if (activeNodes) activeNodes.delete(o);
        try {
          o.disconnect();
          g.disconnect();
        } catch {}
      };
    });
  }

  /** One second of white noise per context (fixed seed, so exports are identical every time). */
  const noiseCache = new WeakMap();
  function noise(ctx) {
    if (noiseCache.has(ctx)) return noiseCache.get(ctx);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 987654321;
    for (let i = 0; i < d.length; i++) d[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    noiseCache.set(ctx, buf);
    return buf;
  }
  function hit(ctx, out, t, len, level, build, activeNodes) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    env.connect(out);
    const src = build(env);
    src.start(t);
    src.stop(t + len + 0.02);
    if (activeNodes) activeNodes.add(src);
    src.onended = () => {
      if (activeNodes) activeNodes.delete(src);
      try {
        src.disconnect();
        env.disconnect();
      } catch {}
    };
  }
  /**
   * Drums (Beta): a simple rock beat on the steps, eight steps (eighth notes) to a bar.
   * Kick on beats 1 and 3, snare on 2 and 4, hi-hat on every eighth. `energy` (0–1, the lead
   * channel's value at this step) makes the kick and hi-hat louder when the data is high.
   */
  function drumStep(ctx, out, i, t, energy = 0.5, activeNodes = null) {
    const pos = i % 8;
    const e = 0.45 + 0.55 * Math.max(0, Math.min(1, energy));
    if (pos === 0 || pos === 4)
      hit(ctx, out, t, 0.32, 0.55 * e, (env) => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        o.connect(env);
        return o;
      }, activeNodes);
    if (pos === 2 || pos === 6)
      hit(ctx, out, t, 0.18, 0.22, (env) => {
        const n = ctx.createBufferSource();
        n.buffer = noise(ctx);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800;
        f.Q.value = 0.7;
        n.connect(f);
        f.connect(env);
        return n;
      }, activeNodes);
    hit(ctx, out, t, pos % 2 ? 0.035 : 0.05, (pos % 2 ? 0.035 : 0.06) * e, (env) => {
      const n = ctx.createBufferSource();
      n.buffer = noise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      n.connect(f);
      f.connect(env);
      return n;
    }, activeNodes);
  }

  /**
   * Schedule every active note of plan step `i` at context time `t` through `renderer`.
   * Shared by live playback and offline export so both sound identical.
   */
  function scheduleStep(ctx, renderer, plan, i, t, activeNodes = null) {
    const notes = plan.steps[i];
    if (!notes) return;
    for (const n of notes) {
      if (!n.active || n.midi == null || n.gain <= 0) continue;
      const ch = plan.channels[n.ch];
      const bus = renderer.bus(n.ch);
      bus.setPosition(n.pos, t);
      voice(ctx, bus.input, n.midi, t, plan.noteLen, n.gain, ch.instrument, activeNodes, { value: n.value });
      if (n.cue) cue(ctx, bus.input, t + 0.004, n.gain, activeNodes);
    }
    if (plan.settings?.drums) {
      const lead = notes.find((n) => n.active && n.midi != null);
      const bus = renderer.bus('drums');
      bus.setPosition({ x: 0, y: 1, z: 0.2 }, t);
      drumStep(ctx, bus.input, i, t, lead ? lead.value : 0.3, activeNodes);
    }
  }

  function peakLimit(chans, ceiling) {
    let peak = 0;
    for (const c of chans) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > peak) peak = Math.abs(c[i]);
    if (peak > ceiling) {
      const g = ceiling / peak;
      for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
    }
    return peak;
  }

  return {
    instruments,
    drumStep,
    impulseResponse,
    createEqChain,
    createRenderer,
    voice,
    cue,
    drone,
    peakLimit,
    scheduleStep,
  };
});
