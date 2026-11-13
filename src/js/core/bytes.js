/**
 * Bit2Beat core · reading big files a little at a time.
 *
 * Scientific files can be gigabytes, so nothing here ever loads a whole file. A *reader* is
 * { size, read(offset, length) → Promise<Uint8Array> }: small reads are served from cached
 * 256 KB pages (file headers are read in thousands of tiny pieces), large reads go straight to
 * the file. fileReader() wraps a browser File / Blob; bufferReader() wraps bytes (tests).
 * Also: zlib inflate (the browser's DecompressionStream), TIFF LZW and PackBits.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).bytes = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAGE = 1 << 18;

  function cached(size, fetch, maxPages = 48) {
    const pages = new Map(); // page index → Promise<Uint8Array>
    const page = (k) => {
      let p = pages.get(k);
      if (p) {
        pages.delete(k); // most recently used goes last
      } else {
        p = fetch(k * PAGE, Math.min(PAGE, size - k * PAGE));
        if (pages.size >= maxPages) pages.delete(pages.keys().next().value);
      }
      pages.set(k, p);
      return p;
    };
    async function read(offset, length) {
      if (offset < 0 || length < 0 || offset + length > size) throw new RangeError('The file ends too early (it may be damaged or incomplete).');
      if (length > PAGE) return fetch(offset, length);
      const k0 = Math.floor(offset / PAGE);
      const k1 = Math.floor((offset + Math.max(0, length - 1)) / PAGE);
      const a = await page(k0);
      if (k0 === k1) return a.subarray(offset - k0 * PAGE, offset - k0 * PAGE + length);
      const b = await page(k1);
      const out = new Uint8Array(length);
      const first = (k0 + 1) * PAGE - offset;
      out.set(a.subarray(offset - k0 * PAGE));
      out.set(b.subarray(0, length - first), first);
      return out;
    }
    return { size, read };
  }

  /** Reader over a File or Blob (only the parts asked for are read from disk). */
  const fileReader = (file) => Object.assign(cached(file.size, async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer())), { name: file.name || '' });
  /** Reader over bytes already in memory. */
  const bufferReader = (u8, name = '') => Object.assign(cached(u8.length, async (o, n) => u8.subarray(o, o + n)), { name });

  /** zlib / deflate decompression. `format`: 'deflate' (zlib wrapper) or 'deflate-raw'. */
  async function inflate(bytes, format = 'deflate') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack compressed data. Use a current version of Chrome, Edge, Firefox or Safari.');
    try {
      return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
    } catch {
      throw new Error('A compressed part of this file could not be unpacked (the file may be damaged).');
    }
  }

  /** TIFF LZW (MSB first, 9–12 bit codes, "early change"). */
  function lzw(src, expected) {
    const out = new Uint8Array(expected);
    const prefix = new Uint16Array(4096);
    const suffix = new Uint8Array(4096);
    const stack = new Uint8Array(4097);
    let n = 0;
    let bits = 9;
    let next = 258;
    let old = -1;
    let acc = 0;
    let have = 0;
    let p = 0;
    let first = 0;
    while (n < expected) {
      while (have < bits && p < src.length) {
        acc = ((acc << 8) | src[p++]) >>> 0;
        have += 8;
      }
      if (have < bits) break;
      const code = (acc >>> (have - bits)) & ((1 << bits) - 1);
      have -= bits;
      acc &= (1 << have) - 1;
      if (code === 257) break;
      if (code === 256) {
        bits = 9;
        next = 258;
        old = -1;
        continue;
      }
      let cur = code;
      let sp = 0;
      if (old < 0) {
        out[n++] = first = code;
        old = code;
        continue;
      }
      if (code >= next) {
        stack[sp++] = first;
        cur = old;
      }
      while (cur >= 258) {
        stack[sp++] = suffix[cur];
        cur = prefix[cur];
      }
      first = cur;
      stack[sp++] = cur;
      while (sp && n < expected) out[n++] = stack[--sp];
      if (next < 4096) {
        prefix[next] = old;
        suffix[next] = first;
        next++;
        if (next === 511 || next === 1023 || next === 2047) bits++;
      }
      old = code;
    }
    return out;
  }

  /** Apple PackBits run-length decoding. */
  function packbits(src, expected) {
    const out = new Uint8Array(expected);
    let n = 0;
    let p = 0;
    while (p < src.length && n < expected) {
      const c = src[p++] << 24 >> 24;
      if (c >= 0) for (let k = 0; k <= c && n < expected; k++) out[n++] = src[p++];
      else if (c !== -128) {
        const v = src[p++];
        for (let k = 0; k <= -c && n < expected; k++) out[n++] = v;
      }
    }
    return out;
  }

  return { PAGE, fileReader, bufferReader, inflate, lzw, packbits };
});
