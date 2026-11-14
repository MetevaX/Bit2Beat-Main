/**
 * Bit2Beat audio · offline export.
 * Renders the same plan used for live playback in an OfflineAudioContext at 48 kHz, then encodes
 * WAV (stereo / binaural / 5.1 / 7.1 / 7.1.4) or an ADM BWF object master.
 */
(function (root, factory) {
  const mod = factory(root.Bit2Beat || {});
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).exporter = mod;
})(typeof self !== 'undefined' ? self : this, function (ns) {
  'use strict';

  const RATE = 48000;
  const SAMPLE_BUDGET = 80e6; // frames × channels kept in memory while rendering

  const FORMATS = {
    stereo: { label: 'Stereo WAV', detail: '2 channels · 48 kHz · 16-bit · peak −1 dBFS', bits: 16 },
    binaural: { label: 'Binaural WAV (headphones)', detail: '2 channels with 3D height cues · 48 kHz · 16-bit', bits: 16 },
    '5.1': { label: '5.1 surround WAV', detail: '6 channels (L R C LFE Ls Rs) · 48 kHz · 24-bit', bits: 24 },
    '7.1': { label: '7.1 surround WAV', detail: '8 channels · 48 kHz · 24-bit', bits: 24 },
    '7.1.4': { label: '7.1.4 immersive WAV', detail: '12 channels including 4 height · 48 kHz · 24-bit', bits: 24 },
    adm: { label: 'ADM BWF object master', detail: 'One track per channel with 3D position metadata · 48 kHz · 24-bit', bits: 24 },
  };

  /**
   * @param {object} plan   from plan.build
   * @param {string} format key of FORMATS
   * @param {{volume:number, eq:object, room:number, mono:boolean}} mix
   * @returns {Promise<{bytes:ArrayBuffer, seconds:number, objects?:number}>}
   */
  async function render(plan, format, mix) {
    const { audio: engine, spatial, wav, adm } = ns;
    const spec = FORMATS[format];
    if (!spec) throw new Error('Unknown export format.');
    const active = plan.channels.map((c, j) => j).filter((j) => plan.channels[j].active);
    if (!active.length) throw new Error('Turn on at least one channel before exporting.');
    const total = plan.duration + 0.8;
    if (total > 600) throw new Error('This piece is longer than 10 minutes. Use a faster tempo or fewer points.');
    const keys = format === 'adm' ? [...active, ...(plan.drone ? ['drone'] : []), ...(plan.settings?.drums ? ['drums'] : []), ...(plan.rumble ? ['rumble'] : [])] : null;
    const layout = spatial.OUTPUTS[format]?.layout || null;
    const mono = mix.mono && (format === 'stereo' || format === 'binaural');
    const nch = keys ? keys.length : layout ? layout.speakers.length : mono ? 1 : 2;
    const frames = Math.ceil(total * RATE);
    if (frames * nch > SAMPLE_BUDGET)
      throw new Error(`Too long for the browser to render as ${spec.label}. Keep it under ${Math.floor(SAMPLE_BUDGET / nch / RATE)} seconds.`);
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('This browser cannot render audio files.');
    const ctx = new AC(nch, frames, RATE);
    const out = ctx.createGain();
    out.gain.value = 1; // level is set by peak normalisation below
    const eq = engine.createEqChain(ctx, { eqLow: mix.eq.low, eqMid: mix.eq.mid, eqHigh: mix.eq.high });
    out.connect(eq.input);
    let cfg;
    if (keys || layout) {
      cfg = keys ? { kind: 'adm', keys } : { kind: 'layout', layout };
      ctx.destination.channelInterpretation = 'discrete';
      eq.output.connect(ctx.destination);
    } else {
      cfg = mono ? { kind: 'stereo', mono: true } : { kind: format, room: mix.room };
      eq.output.connect(ctx.destination); // float render: no clipping before normalisation
    }
    const r = engine.createRenderer(ctx, out, cfg);
    for (let i = 0; i < plan.count; i++) engine.scheduleStep(ctx, r, plan, i, 0.05 + plan.times[i]);
    if (plan.drone) {
      const bus = r.bus('drone');
      bus.setPosition({ x: 0, y: 1, z: 0 }, 0);
      engine.drone(ctx, bus.input, plan.drone.midi, 0.05, 0.05 + plan.times[plan.count - 1] + plan.noteLen, 1);
    }
    const buffer = await ctx.startRendering();
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    // Normalise the whole file (all channels together, so the mix balance is kept) to −1 dBFS peak.
    let peak = 0;
    for (const c of chans) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > peak) peak = Math.abs(c[i]);
    if (peak > 1e-6) {
      const g = 0.891 / peak;
      for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
    }
    let bytes;
    if (keys) {
      bytes = adm.encodeAdmBwf({
        tracks: chans,
        sampleRate: RATE,
        title: plan.source.name,
        objects: keys.map((k) => ({ name: k === 'drone' ? 'Reference tone' : k === 'drums' ? 'Drums' : k === 'rumble' ? 'Trend rumble' : plan.channels[k].name, blocks: r.blocks[k] || [] })),
      });
    } else {
      bytes = wav.encodeWav({ channels: chans, sampleRate: RATE, bitDepth: spec.bits, channelMask: layout ? spatial.channelMask(layout) : undefined });
    }
    return { bytes, seconds: total, objects: keys?.length };
  }

  return { FORMATS, RATE, render };
});
