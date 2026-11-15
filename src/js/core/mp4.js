/**
 * Bit2Beat core · a small MP4 writer for the video export.
 *
 * WebCodecs gives us encoded H.264 frames and AAC (or Opus) packets; this puts them in an ordinary
 * .mp4 that plays everywhere (Windows, macOS, phones, YouTube, WhatsApp). Not fragmented: the
 * index (moov) goes first, so the file starts playing at once ("fast start"). Every sample is its own
 * chunk, written in time order, so picture and sound stay interleaved.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).mp4 = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const cat = (parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  const u8 = (v) => Uint8Array.of(v & 255);
  const u16 = (v) => Uint8Array.of((v >>> 8) & 255, v & 255);
  const u32 = (v) => Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const zeros = (n) => new Uint8Array(n);
  const box = (type, ...parts) => {
    const body = cat(parts.flat(Infinity));
    return cat([u32(body.length + 8), ascii(type), body]);
  };
  const full = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >>> 16), u16(flags & 0xffff), ...parts);
  const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32);

  /** MPEG-4 descriptor: tag + length (4-byte form) + body. */
  const desc = (tag, ...parts) => {
    const body = cat(parts.flat(Infinity));
    const n = body.length;
    return cat([u8(tag), Uint8Array.of(0x80 | ((n >>> 21) & 127), 0x80 | ((n >>> 14) & 127), 0x80 | ((n >>> 7) & 127), n & 127), body]);
  };

  function sampleEntry(t) {
    if (t.kind === 'video') {
      return box(
        'avc1',
        zeros(6), u16(1), zeros(16), u16(t.width), u16(t.height), u32(0x480000), u32(0x480000), zeros(4), u16(1),
        zeros(32), u16(0x18), u16(0xffff),
        box('avcC', t.description),
      );
    }
    const audio = [zeros(6), u16(1), zeros(8), u16(t.channels), u16(16), zeros(4), u32(t.sampleRate * 65536 >>> 0)];
    if (t.codec === 'opus') {
      // dOps: version, channels, pre-skip, input rate, gain, mapping family 0
      return box('Opus', ...audio, box('dOps', u8(0), u8(t.channels), u16(t.preSkip ?? 312), u32(t.sampleRate), u16(0), u8(0)));
    }
    const asc = t.description || ascFor(t.sampleRate, t.channels);
    const es = desc(3, u16(t.id), u8(0), desc(4, u8(0x40), u8(0x15), zeros(3), u32(t.bitrate || 192000), u32(t.bitrate || 192000), desc(5, asc)), desc(6, u8(2)));
    return box('mp4a', ...audio, full('esds', 0, 0, es));
  }

  /** AAC-LC AudioSpecificConfig, for encoders that do not hand one over. */
  function ascFor(rate, channels) {
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
    const i = Math.max(0, rates.indexOf(rate));
    return Uint8Array.of((2 << 3) | (i >> 1), ((i & 1) << 7) | (channels << 3));
  }

  /** Run-length list of sample durations. */
  function stts(durs) {
    const runs = [];
    for (const d of durs) {
      const last = runs[runs.length - 1];
      if (last && last[1] === d) last[0]++;
      else runs.push([1, d]);
    }
    return full('stts', 0, 0, u32(runs.length), runs.flatMap(([n, d]) => [u32(n), u32(d)]));
  }

  /**
   * @param {{video?:{width,height,timescale?,description:Uint8Array}, audio?:{codec:'aac'|'opus', sampleRate, channels, description?, bitrate?, preSkip?}}} spec
   */
  function createMuxer(spec) {
    const tracks = [];
    if (spec.video) tracks.push({ kind: 'video', ...spec.video, timescale: spec.video.timescale || 90000, samples: [] });
    if (spec.audio) tracks.push({ kind: 'audio', ...spec.audio, timescale: spec.audio.sampleRate, samples: [] });
    tracks.forEach((t, k) => (t.id = k + 1));
    const byKind = (k) => tracks.find((t) => t.kind === k);

    /** time and duration in microseconds (as WebCodecs gives them) */
    function add(kind, data, timestampUs, durationUs, key = true) {
      const t = byKind(kind);
      if (!t) throw new Error(`No ${kind} track.`);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      t.samples.push({ data: bytes, ts: Math.round((timestampUs * t.timescale) / 1e6), dur: Math.max(1, Math.round((durationUs * t.timescale) / 1e6)), key });
    }

    function finish() {
      for (const t of tracks) {
        t.samples.sort((a, b) => a.ts - b.ts);
        // durations from the start times, so the track has no gaps; the last keeps its own
        for (let i = 0; i < t.samples.length - 1; i++) t.samples[i].dur = Math.max(1, t.samples[i + 1].ts - t.samples[i].ts);
        t.duration = t.samples.reduce((n, s) => n + s.dur, 0);
        if (t.kind === 'video' && !t.description) throw new Error('The video encoder gave no decoder configuration.');
      }
      // interleave by time
      const order = [];
      for (const t of tracks) t.samples.forEach((s) => order.push({ t, s, at: s.ts / t.timescale }));
      order.sort((a, b) => a.at - b.at || a.t.id - b.t.id);

      const movieMs = Math.round(Math.max(...tracks.map((t) => (t.duration / t.timescale) * 1000), 0));
      const build = (offsets) => {
        const traks = tracks.map((t) => {
          const isV = t.kind === 'video';
          const durMs = Math.round((t.duration / t.timescale) * 1000);
          const stbl = box(
            'stbl',
            full('stsd', 0, 0, u32(1), sampleEntry(t)),
            stts(t.samples.map((s) => s.dur)),
            isV ? full('stss', 0, 0, u32(t.samples.filter((s) => s.key).length), t.samples.flatMap((s, i) => (s.key ? [u32(i + 1)] : []))) : [],
            full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
            full('stsz', 0, 0, u32(0), u32(t.samples.length), t.samples.map((s) => u32(s.data.length))),
            full('stco', 0, 0, u32(t.samples.length), t.samples.map((s) => u32(offsets.get(s) || 0))),
          );
          return box(
            'trak',
            full('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(durMs), zeros(8), u16(0), u16(isV ? 0 : 1), u16(isV ? 0 : 0x100), u16(0), MATRIX, u32(isV ? t.width * 65536 : 0), u32(isV ? t.height * 65536 : 0)),
            box(
              'mdia',
              full('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(t.duration), u16(0x55c4), u16(0)),
              full('hdlr', 0, 0, u32(0), ascii(isV ? 'vide' : 'soun'), zeros(12), ascii(isV ? 'Bit2Beat video\0' : 'Bit2Beat sound\0')),
              box('minf', isV ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, zeros(4)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl),
            ),
          );
        });
        const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieMs), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1));
        return box('moov', mvhd, ...traks);
      };
      const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
      // the moov size does not depend on the offset values, so build it once to measure
      const moovSize = build(new Map()).length;
      const dataSize = order.reduce((n, o) => n + o.s.data.length, 0);
      const offsets = new Map();
      let at = ftyp.length + moovSize + 8;
      for (const o of order) {
        offsets.set(o.s, at);
        at += o.s.data.length;
      }
      const parts = [ftyp, build(offsets), cat([u32(dataSize + 8), ascii('mdat')]), ...order.map((o) => o.s.data)];
      return { parts, size: at, duration: movieMs / 1000 };
    }

    return { add, finish, tracks };
  }

  /** Walk the top-level (and nested container) boxes of an mp4: [{type, size, start, children?}]. Used by tests. */
  function boxes(bytes, start = 0, end = bytes.length) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf']);
    for (let o = start; o + 8 <= end; ) {
      const size = dv.getUint32(o);
      const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
      if (size < 8) break;
      const b = { type, size, start: o };
      if (containers.has(type)) b.children = boxes(bytes, o + 8, o + size);
      out.push(b);
      o += size;
    }
    return out;
  }

  return { createMuxer, boxes, ascFor };
});
