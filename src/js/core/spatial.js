/**
 * Bit2Beat core · object-based spatial audio model.
 *
 * Every sonified channel is treated as an audio *object* with a position in
 * the same normalised room used by Dolby Atmos / ADM cartesian metadata:
 *
 *   x  -1 (left)  …  +1 (right)
 *   y  -1 (back)  …  +1 (front)
 *   z   0 (ear)   …  +1 (ceiling)
 *
 * The same positions drive the live binaural renderer, the speaker-layout
 * panner (5.1 / 7.1 / 7.1.4 WAV) and the ADM BWF export metadata.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).spatial = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deg = Math.PI / 180;

  /**
   * Speaker layouts. `cart` = room position used by the panner, `polar` =
   * nominal azimuth/elevation (degrees, +azimuth = left as in ITU-R BS.2051)
   * used for headphone virtualisation. Channel order follows the WAVE
   * channel-mask bit order so files play correctly in DAWs and players.
   */
  const SPK = {
    L: { label: 'L', cart: [-1, 1, 0], polar: [30, 0], bit: 0x1 },
    R: { label: 'R', cart: [1, 1, 0], polar: [-30, 0], bit: 0x2 },
    C: { label: 'C', cart: [0, 1, 0], polar: [0, 0], bit: 0x4 },
    LFE: { label: 'LFE', lfe: true, cart: [0, 1, -1], polar: [0, -30], bit: 0x8 },
    Lrs: { label: 'Lrs', cart: [-1, -1, 0], polar: [150, 0], bit: 0x10 },
    Rrs: { label: 'Rrs', cart: [1, -1, 0], polar: [-150, 0], bit: 0x20 },
    Ls: { label: 'Ls', cart: [-1, -0.35, 0], polar: [110, 0], bit: 0x200 },
    Rs: { label: 'Rs', cart: [1, -0.35, 0], polar: [-110, 0], bit: 0x400 },
    Lss: { label: 'Lss', cart: [-1, 0, 0], polar: [90, 0], bit: 0x200 },
    Rss: { label: 'Rss', cart: [1, 0, 0], polar: [-90, 0], bit: 0x400 },
    Ltf: { label: 'Ltf', cart: [-1, 0.5, 1], polar: [45, 45], bit: 0x1000 },
    Rtf: { label: 'Rtf', cart: [1, 0.5, 1], polar: [-45, 45], bit: 0x4000 },
    Ltr: { label: 'Ltr', cart: [-1, -0.5, 1], polar: [135, 45], bit: 0x8000 },
    Rtr: { label: 'Rtr', cart: [1, -0.5, 1], polar: [-135, 45], bit: 0x20000 },
  };

  const LAYOUTS = Object.freeze({
    '5.1': { id: '5.1', name: '5.1 surround', speakers: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'].map((k) => SPK[k]) },
    '7.1': {
      id: '7.1',
      name: '7.1 surround',
      speakers: ['L', 'R', 'C', 'LFE', 'Lrs', 'Rrs', 'Lss', 'Rss'].map((k) => SPK[k]),
    },
    '7.1.4': {
      id: '7.1.4',
      name: '7.1.4 immersive (Atmos home layout)',
      speakers: ['L', 'R', 'C', 'LFE', 'Lrs', 'Rrs', 'Lss', 'Rss', 'Ltf', 'Rtf', 'Ltr', 'Rtr'].map((k) => SPK[k]),
    },
  });

  /** WAVE_FORMAT_EXTENSIBLE dwChannelMask for a layout. */
  const channelMask = (layout) => layout.speakers.reduce((m, s) => m | s.bit, 0) >>> 0;

  /**
   * Distance-based amplitude panning over the layout's full-range speakers.
   * Constant power (Σg² = 1). The LFE channel never receives object audio,
   * matching Atmos object behaviour.
   */
  function pannerGains(pos, layout, { rolloff = 3.2, blur = 0.18 } = {}) {
    const [x, y, z] = [clamp(pos.x, -1, 1), clamp(pos.y, -1, 1), clamp(pos.z, 0, 1)];
    const raw = layout.speakers.map((s) => {
      if (s.lfe) return 0;
      const d = Math.hypot(x - s.cart[0], y - s.cart[1], (z - s.cart[2]) * 1.25, blur);
      return 1 / d ** rolloff;
    });
    // Layouts without height speakers fold elevated objects into the ear-level ring.
    const power = Math.hypot(...raw) || 1;
    return raw.map((g) => g / power);
  }

  /**
   * Position of a sonified reading.
   * @param {object} o
   * @param {'sweep'|'orbit'|'fixed'|'fall'} o.path  motion path ('fall': from above the listener down to ear level)
   * @param {number} o.progress  0..1 playback position
   * @param {number} o.index     channel index
   * @param {number} o.count     number of channels
   * @param {?number} o.value    normalised reading 0..1 (null = silent)
   * @param {number} [o.height=0.8] how strongly value drives elevation (0..1)
   * @param {number} [o.width=1] stage width (0..1)
   */
  function objectPosition({ path = 'sweep', progress = 0, index = 0, count = 1, value = 0.5, height = 0.8, width = 1 }) {
    const p = clamp(progress, 0, 1);
    const spread = count > 1 ? index / (count - 1) : 0.5;
    const z = clamp((value == null ? 0 : value) * height, 0, 1);
    let x;
    let y;
    if (path === 'orbit') {
      const a = (p + index / Math.max(1, count)) * 2 * Math.PI;
      x = Math.sin(a) * width;
      y = Math.cos(a);
    } else if (path === 'fall') {
      // top to bottom: every channel keeps its place across the front, and the sound comes down
      x = (spread * 2 - 1) * 0.6 * width;
      y = 0.7;
      return { x: round(x), y: round(y), z: round(1 - p) };
    } else if (path === 'fixed') {
      const a = (spread * 2 - 1) * 60 * deg * width;
      x = Math.sin(a);
      y = Math.cos(a);
    } else {
      x = (p * 2 - 1) * width;
      y = 0.85 - spread * 1.1;
    }
    return { x: round(x), y: round(y), z: round(z) };
  }

  /**
   * Convert room coordinates to Web Audio listener space (listener at the
   * origin facing −Z with +Y up). Objects are placed on a sphere of `radius`
   * metres so HRTF cues stay strong regardless of the cube position.
   */
  function toWebAudio(pos, radius = 1.6) {
    let vx = pos.x;
    let vy = pos.z;
    let vz = -pos.y;
    let len = Math.hypot(vx, vy, vz);
    if (len < 0.15) {
      vx = 0;
      vy = pos.z;
      vz = -0.4;
      len = Math.hypot(vy, vz);
    }
    return { x: (vx / len) * radius, y: (vy / len) * radius, z: (vz / len) * radius };
  }

  /** Polar (az, el in degrees; +az = left) → Web Audio coordinates. */
  function polarToWebAudio([az, el], radius = 1.6) {
    const a = az * deg;
    const e = el * deg;
    return { x: -Math.sin(a) * Math.cos(e) * radius, y: Math.sin(e) * radius, z: -Math.cos(a) * Math.cos(e) * radius };
  }

  /** Stereo pan (−1..1) for a room position, used by the plain stereo renderer. */
  const stereoPan = (pos) => clamp(pos.x * 0.85, -1, 1);

  const round = (v) => Math.round(v * 10000) / 10000;

  /** Output formats offered in the UI. */
  const OUTPUTS = Object.freeze({
    stereo: { id: 'stereo', name: 'Stereo', channels: 2 },
    binaural: { id: 'binaural', name: 'Binaural 3D (headphones)', channels: 2 },
    '5.1': { id: '5.1', name: '5.1 surround', channels: 6, layout: LAYOUTS['5.1'] },
    '7.1': { id: '7.1', name: '7.1 surround', channels: 8, layout: LAYOUTS['7.1'] },
    '7.1.4': { id: '7.1.4', name: '7.1.4 immersive', channels: 12, layout: LAYOUTS['7.1.4'] },
  });

  const NAMES = { L: 'Left', R: 'Right', C: 'Centre', LFE: 'Subwoofer (LFE)', Ls: 'Left surround', Rs: 'Right surround', Lss: 'Left side', Rss: 'Right side', Lrs: 'Left rear', Rrs: 'Right rear', Ltf: 'Top front left', Rtf: 'Top front right', Ltr: 'Top rear left', Rtr: 'Top rear right' };
  /**
   * The places to test for an output: its speakers (with friendly names), or for stereo the two
   * sides and for headphone 3D five directions around the head.
   */
  function testPoints(output) {
    const o = OUTPUTS[output] || OUTPUTS.stereo;
    if (o.layout) return o.layout.speakers.map((sp) => ({ label: sp.label, name: NAMES[sp.label] || sp.label, lfe: !!sp.lfe, pos: { x: sp.cart[0], y: sp.cart[1], z: Math.max(0, sp.cart[2]) } }));
    if (o.id === 'binaural')
      return [
        ['Front', 0, 1, 0.1],
        ['Left', -1, 0, 0.1],
        ['Right', 1, 0, 0.1],
        ['Behind', 0, -1, 0.1],
        ['Above', 0, 0.2, 1],
      ].map(([name, x, y, z]) => ({ label: name, name, lfe: false, pos: { x, y, z } }));
    return [
      { label: 'L', name: 'Left', lfe: false, pos: { x: -1, y: 1, z: 0 } },
      { label: 'R', name: 'Right', lfe: false, pos: { x: 1, y: 1, z: 0 } },
    ];
  }

  return {
    testPoints,
    LAYOUTS,
    OUTPUTS,
    SPEAKERS: SPK,
    channelMask,
    pannerGains,
    objectPosition,
    toWebAudio,
    polarToWebAudio,
    stereoPan,
  };
});
