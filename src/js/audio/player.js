/**
 * Bit2Beat audio · live player.
 *
 * Look-ahead scheduler: notes are queued on the audio clock 120 ms ahead (sample-accurate, no
 * timer drift) and the UI is told which step is audible as each one starts.
 * Graph: renderer → master gain → 3-band EQ → limiter → speakers (+ analyser, + recorder tap).
 */
(function (root, factory) {
  const mod = factory(root.Bit2Beat || {});
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).player = mod;
})(typeof self !== 'undefined' ? self : this, function (ns) {
  'use strict';
  const LOOKAHEAD = 0.12;

  /**
   * @param {object} o
   * @param {() => object} o.getPlan
   * @param {() => {volume:number, muted:boolean, eq:{low,mid,high}, output:string, room:number, mono:boolean, loop:boolean}} o.getSettings
   * @param {(i:number)=>void} [o.onStep]
   * @param {(playing:boolean, reason?:string)=>void} [o.onState]
   */
  function createPlayer({ getPlan, getSettings, onStep = () => {}, onState = () => {} }) {
    const { audio: engine, spatial } = ns;
    let ctx = null;
    let master = null;
    let eq = null;
    let limiter = null;
    let analyser = null;
    let recordTap = null;
    let renderer = null;
    let rendererKey = '';
    let sched = null;
    let timer = null;
    let position = 0;
    const nodes = new Set();

    function routing() {
      const s = getSettings();
      if (s.mono) return { kind: 'stereo', mono: true };
      const o = spatial.OUTPUTS[s.output] || spatial.OUTPUTS.stereo;
      if (o.layout) {
        const hw = ctx?.destination.maxChannelCount || 2;
        return { kind: hw >= o.channels ? 'layout' : 'virtual', layout: o.layout, room: s.room };
      }
      return { kind: o.id, room: s.room };
    }

    function ensureRenderer() {
      const cfg = routing();
      const key = JSON.stringify([cfg.kind, cfg.layout?.id, !!cfg.mono]);
      if (renderer && key === rendererKey) {
        renderer.setRoom(getSettings().room);
        return renderer;
      }
      stopNodes();
      renderer?.dispose();
      eq.output.disconnect();
      limiter.disconnect();
      const dest = ctx.destination;
      if (cfg.kind === 'layout') {
        dest.channelCount = cfg.layout.speakers.length;
        dest.channelCountMode = 'explicit';
        dest.channelInterpretation = 'discrete';
        eq.output.connect(dest);
        eq.output.connect(analyser);
        if (recordTap) eq.output.connect(recordTap);
      } else {
        try {
          dest.channelCount = 2;
          dest.channelInterpretation = 'speakers';
        } catch {}
        eq.output.connect(limiter);
        limiter.connect(dest);
        limiter.connect(analyser);
        if (recordTap) limiter.connect(recordTap);
      }
      renderer = engine.createRenderer(ctx, master, cfg);
      rendererKey = key;
      return renderer;
    }

    async function init() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('This browser cannot play Web Audio.');
        ctx = new AC({ latencyHint: 'interactive' });
        master = ctx.createGain();
        eq = engine.createEqChain(ctx, {});
        master.connect(eq.input);
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        if (ctx.createMediaStreamDestination) recordTap = ctx.createMediaStreamDestination();
        applyMix();
      }
      if (ctx.state !== 'running') await ctx.resume();
      ensureRenderer();
      return ctx;
    }

    function applyMix() {
      if (!ctx) return;
      const s = getSettings();
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(s.muted ? 0 : s.volume, t, 0.02);
      eq.low.gain.setTargetAtTime(s.eq.low || 0, t, 0.015);
      eq.mid.gain.setTargetAtTime(s.eq.mid || 0, t, 0.015);
      eq.high.gain.setTargetAtTime(s.eq.high || 0, t, 0.015);
    }

    function stopNodes() {
      for (const n of nodes)
        try {
          n.stop();
        } catch {}
      nodes.clear();
    }

    function startDrone(plan, from, until) {
      if (!plan.drone) return;
      const bus = renderer.bus('drone');
      bus.setPosition({ x: 0, y: 1, z: 0 }, from);
      engine.drone(ctx, bus.input, plan.drone.midi, from, until, 1, nodes);
    }

    function pump() {
      if (!sched) return;
      const plan = sched.plan;
      const now = ctx.currentTime;
      const last = plan.count - 1;
      while (sched.next <= last && plan.times[sched.next] + sched.offset < now + LOOKAHEAD) {
        const t = Math.max(now + 0.005, plan.times[sched.next] + sched.offset);
        try {
          engine.scheduleStep(ctx, renderer, plan, sched.next, t, nodes);
        } catch (e) {
          console.warn('Bit2Beat: could not schedule step', sched.next, e);
        }
        sched.queue.push({ i: sched.next, t });
        sched.next++;
        if (sched.next > last && getSettings().loop) {
          const gap = plan.step * 2;
          sched.offset = sched.offset + plan.times[last] + gap - plan.times[0];
          sched.next = 0;
          startDrone(plan, sched.offset + plan.times[0], sched.offset + plan.times[last] + plan.noteLen);
        }
      }
      let due = null;
      while (sched.queue.length && sched.queue[0].t <= now + 0.01) due = sched.queue.shift();
      if (due) {
        position = due.i;
        onStep(due.i);
      }
      const endAt = plan.times[last] + sched.offset + plan.noteLen;
      if (sched.next > last && !sched.queue.length && now >= endAt) {
        sched = null;
        position = 0;
        onState(false, 'finished');
        return;
      }
      timer = setTimeout(pump, 25);
    }

    async function play(from = position) {
      const plan = getPlan();
      if (!plan.count) throw new Error('There is nothing to play yet.');
      await init();
      pause(true);
      const start = from >= plan.count ? 0 : Math.max(0, from);
      const t0 = ctx.currentTime + 0.06;
      sched = { plan, next: start, offset: t0 - plan.times[start], queue: [] };
      startDrone(plan, t0, sched.offset + plan.times[plan.count - 1] + plan.noteLen);
      onState(true);
      pump();
    }

    function pause(silent = false) {
      clearTimeout(timer);
      const was = !!sched;
      sched = null;
      stopNodes();
      if (was && !silent) onState(false, 'paused');
    }

    function seek(i) {
      const playing = !!sched;
      position = Math.max(0, i | 0);
      if (playing) play(position);
    }

    /** Play one step immediately (keyboard scrubbing, table rows, clicks on the chart). */
    async function auditionStep(i, onlyChannel = null) {
      const plan = getPlan();
      if (!plan.steps[i]) return;
      await init();
      const t = ctx.currentTime + 0.02;
      const one = onlyChannel == null ? plan : { ...plan, steps: plan.steps.map((s) => s.filter((n) => n.ch === onlyChannel).map((n) => ({ ...n, active: true }))) };
      engine.scheduleStep(ctx, renderer, one, i, t, nodes);
    }

    /** Play a single MIDI note (piano keys, instrument preview). */
    async function auditionNote(midi, instrument, duration = 0.5, pos = { x: 0, y: 1, z: 0.3 }) {
      await init();
      const bus = renderer.bus('audition');
      bus.setPosition(pos, ctx.currentTime);
      engine.voice(ctx, bus.input, midi, ctx.currentTime + 0.02, duration, 0.8, instrument, nodes, { value: 0.5 });
    }

    /** Pointer mode: sound a set of values right now. */
    async function auditionNotes(list) {
      await init();
      const t = ctx.currentTime + 0.01;
      list.forEach((n, k) => {
        const bus = renderer.bus('probe' + k);
        bus.setPosition(n.pos, t);
        engine.voice(ctx, bus.input, n.midi, t, 0.28, n.gain, n.instrument, nodes, { value: n.value });
      });
    }

    return {
      init,
      play,
      pause,
      seek,
      applyMix,
      refreshRouting: () => ctx && ensureRenderer(),
      auditionStep,
      auditionNote,
      auditionNotes,
      get playing() {
        return !!sched;
      },
      get position() {
        return position;
      },
      set position(i) {
        position = Math.max(0, i | 0);
      },
      get analyser() {
        return analyser;
      },
      get recordStream() {
        return recordTap?.stream || null;
      },
      get context() {
        return ctx;
      },
      routingKind: () => (ctx ? routing().kind : null),
    };
  }

  return { createPlayer };
});
