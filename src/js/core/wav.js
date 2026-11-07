/**
 * Bit2Beat core · RIFF/WAVE writer.
 *
 * Writes 16- or 24-bit PCM with optional WAVE_FORMAT_EXTENSIBLE channel
 * masks (for 5.1 / 7.1 / 7.1.4 speaker files) and optional extra chunks
 * (e.g. `chna` / `axml` for ADM BWF).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).wav = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WAVE_FORMAT_PCM = 0x0001;
  const WAVE_FORMAT_EXTENSIBLE = 0xfffe;
  /** KSDATAFORMAT_SUBTYPE_PCM GUID tail (after the 2-byte format code). */
  const PCM_GUID_TAIL = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];

  const writeAscii = (view, offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i) & 0xff);
  };

  /** Bytes for an ASCII string (non-ASCII replaced by "?"). */
  function ascii(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[i] = c < 128 ? c : 63;
    }
    return out;
  }

  /** UTF-8 bytes for a string (used for XML chunks). */
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }

  /**
   * Encode planar float samples to a WAV file.
   * @param {object} o
   * @param {Float32Array[]} o.channels      planar audio, one array per channel
   * @param {number}         o.sampleRate
   * @param {16|24}          [o.bitDepth=16]
   * @param {number}         [o.channelMask] speaker mask; forces WAVE_FORMAT_EXTENSIBLE
   * @param {{id:string,data:Uint8Array,afterData?:boolean}[]} [o.chunks] extra chunks
   * @returns {ArrayBuffer}
   */
  function encodeWav({ channels, sampleRate, bitDepth = 16, channelMask, chunks = [] }) {
    if (!channels || !channels.length) throw new Error('No audio channels to encode.');
    if (bitDepth !== 16 && bitDepth !== 24) throw new Error('Only 16- and 24-bit PCM are supported.');
    const n = channels.length;
    const length = channels[0].length;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = n * bytesPerSample;
    const dataBytes = length * blockAlign;
    const extensible = channelMask != null;
    const fmtBytes = extensible ? 40 : 16;
    const pad = (k) => k + (k % 2);
    const before = chunks.filter((c) => !c.afterData);
    const after = chunks.filter((c) => c.afterData);
    const chunkBytes = (list) => list.reduce((sum, c) => sum + 8 + pad(c.data.length), 0);
    const total = 12 + 8 + fmtBytes + chunkBytes(before) + 8 + pad(dataBytes) + chunkBytes(after);
    if (total > 0xffffffff) throw new Error('This audio is too long for a WAV file. Shorten it or use a faster tempo.');

    const buffer = new ArrayBuffer(total);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let o = 0;
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, total - 8, true);
    writeAscii(view, 8, 'WAVE');
    o = 12;

    writeAscii(view, o, 'fmt ');
    view.setUint32(o + 4, fmtBytes, true);
    view.setUint16(o + 8, extensible ? WAVE_FORMAT_EXTENSIBLE : WAVE_FORMAT_PCM, true);
    view.setUint16(o + 10, n, true);
    view.setUint32(o + 12, sampleRate, true);
    view.setUint32(o + 16, sampleRate * blockAlign, true);
    view.setUint16(o + 20, blockAlign, true);
    view.setUint16(o + 22, bitDepth, true);
    if (extensible) {
      view.setUint16(o + 24, 22, true); // cbSize
      view.setUint16(o + 26, bitDepth, true); // valid bits
      view.setUint32(o + 28, channelMask >>> 0, true);
      view.setUint16(o + 32, WAVE_FORMAT_PCM, true);
      PCM_GUID_TAIL.forEach((b, i) => view.setUint8(o + 34 + i, b));
    }
    o += 8 + fmtBytes;

    const writeChunk = (c) => {
      if (!/^[\x20-\x7e]{4}$/.test(c.id)) throw new Error('Invalid chunk id: ' + c.id);
      writeAscii(view, o, c.id);
      view.setUint32(o + 4, c.data.length, true);
      bytes.set(c.data, o + 8);
      o += 8 + pad(c.data.length);
    };
    before.forEach(writeChunk);

    writeAscii(view, o, 'data');
    view.setUint32(o + 4, dataBytes, true);
    o += 8;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < n; c++) {
        let s = channels[c][i];
        s = s > 1 ? 1 : s < -1 ? -1 : s || 0;
        if (bitDepth === 16) {
          view.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true);
          o += 2;
        } else {
          const v = Math.round(s < 0 ? s * 8388608 : s * 8388607);
          view.setUint8(o, v & 0xff);
          view.setUint8(o + 1, (v >> 8) & 0xff);
          view.setUint8(o + 2, (v >> 16) & 0xff);
          o += 3;
        }
      }
    }
    o += dataBytes % 2;
    after.forEach(writeChunk);
    return buffer;
  }

  /** Read basic header facts back from a WAV (used by tests and QA tooling). */
  function inspectWav(buffer) {
    const view = new DataView(buffer);
    const id = (off) => String.fromCharCode(...new Uint8Array(buffer, off, 4));
    if (id(0) !== 'RIFF' || id(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
    const chunks = {};
    let o = 12;
    while (o + 8 <= buffer.byteLength) {
      const cid = id(o);
      const size = view.getUint32(o + 4, true);
      chunks[cid] = { offset: o + 8, size };
      o += 8 + size + (size % 2);
    }
    const f = chunks['fmt '].offset;
    return {
      formatTag: view.getUint16(f, true),
      channels: view.getUint16(f + 2, true),
      sampleRate: view.getUint32(f + 4, true),
      bitDepth: view.getUint16(f + 14, true),
      channelMask: view.getUint16(f, true) === WAVE_FORMAT_EXTENSIBLE ? view.getUint32(f + 20, true) : null,
      frames: chunks.data ? chunks.data.size / (view.getUint16(f + 12, true) || 1) : 0,
      chunks,
    };
  }

  return { encodeWav, inspectWav, ascii, utf8, WAVE_FORMAT_PCM, WAVE_FORMAT_EXTENSIBLE };
});
