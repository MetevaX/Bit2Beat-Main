/**
 * Bit2Beat core · HDF5 reader, part 2: the numbers.
 *
 * A data set's numbers are stored in one of three ways: inside the header (compact), as one
 * block (contiguous), or cut into chunks that can each be packed (chunked). Chunks are found
 * through an index (version-1 B-tree; or, in files written with newer library settings, a
 * single chunk, an implicit grid or a fixed array). Packing filters are undone in reverse:
 * Deflate, Shuffle and the Fletcher-32 checksum. Only the chunks that hold the wanted values
 * are read, so one map out of a huge data cube costs one small read.
 *
 *   const ds = await hdf5data.dataset(file, entry);     // entry from file.datasets()
 *   const a = await ds.slab(start, count, stride);      // Float64Array, row-major
 */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const mod = factory(node ? require('./hdf5.js') : root.Bit2Beat.hdf5, node ? require('./bytes.js') : root.Bit2Beat.bytes);
  if (node) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).hdf5data = mod;
})(typeof self !== 'undefined' ? self : this, function (H, bytes) {
  'use strict';
  const { cursor, UNDEF, damaged } = H;
  const FILTERS = { 4: 'SZIP', 5: 'N-bit', 6: 'Scale-offset', 307: 'BZIP2', 32000: 'LZF', 32001: 'Blosc', 32004: 'LZ4', 32015: 'Zstandard', 32013: 'ZFP' };
  const cancelled = () => new DOMException('Cancelled.', 'AbortError');

  function layout(c, O) {
    const ver = c.u(1);
    if (ver < 3) {
      const rank = c.u(1);
      const cls = c.u(1);
      c.skip(5);
      const addr = cls ? c.off() : UNDEF;
      const dims = Array.from({ length: rank }, () => c.u(4));
      if (cls === 2) return { cls, btree: addr, chunk: dims.slice(0, -1), index: 'btree1' };
      if (cls === 1) return { cls, addr };
      return { cls, data: c.bytes(c.u(4)) };
    }
    const cls = c.u(1);
    if (cls === 0) return { cls, data: c.bytes(c.u(2)) };
    if (cls === 1) return { cls, addr: c.off(), size: c.len() };
    if (cls !== 2) throw new Error('This data set is "virtual" (stitched from other files), which Bit2Beat cannot read.');
    if (ver === 3) {
      const rank = c.u(1);
      const btree = c.off();
      return { cls, btree, chunk: Array.from({ length: rank }, () => c.u(4)).slice(0, -1), index: 'btree1' };
    }
    const flags = c.u(1);
    const rank = c.u(1);
    const enc = c.u(1);
    const chunk = Array.from({ length: rank }, () => c.u(enc)).slice(0, -1);
    const kind = c.u(1);
    const out = { cls, chunk, index: { 1: 'single', 2: 'implicit', 3: 'fixed', 4: 'extensible', 5: 'btree2' }[kind] };
    if (kind === 1 && flags & 2) {
      out.filteredSize = c.len();
      out.mask = c.u(4);
    } else if (kind === 3) c.skip(1);
    else if (kind === 4) c.skip(5);
    else if (kind === 5) c.skip(6);
    out.addr = c.off();
    return out;
  }

  function filters(c) {
    const ver = c.u(1);
    const n = c.u(1);
    if (ver === 1) c.skip(6);
    return Array.from({ length: n }, () => {
      const id = c.u(2);
      const nameLen = ver === 1 || id >= 256 ? c.u(2) : 0;
      c.skip(2);
      const nv = c.u(2);
      c.skip(ver === 1 ? (nameLen + 7) & ~7 : nameLen);
      const cd = Array.from({ length: nv }, () => c.u(4));
      if (ver === 1 && nv % 2) c.skip(4);
      return { id, cd };
    });
  }

  /** Prepare a data set for reading. */
  async function dataset(f, entry) {
    const { O, L } = f;
    const t = entry.type;
    if (!t.numeric) throw new Error('This data set does not hold plain numbers.');
    const shape = entry.dims;
    const rank = shape.length;
    const size = t.size;
    const get = H.getter(t);
    const big = size === 8 && t.cls === 0;
    const lay = layout(cursor(entry.msgs.find((m) => m.type === 8).data, O, L), O);
    lay.max = H.dataspace(cursor(entry.msgs.find((m) => m.type === 1).data, O, L)).max;
    const fmsg = entry.msgs.find((m) => m.type === 0x0b);
    const pipeline = fmsg ? filters(cursor(fmsg.data, O, L)) : [];
    for (const p of pipeline) if (![1, 2, 3].includes(p.id)) throw new Error(`This file's numbers are packed with ${FILTERS[p.id] || 'filter ' + p.id}, which Bit2Beat cannot unpack. Repack the file with Deflate, for example: nccopy -d 4 in.nc out.nc (or h5repack -f GZIP=4 in.h5 out.h5).`);
    // the value of cells that were never written
    let fill = 0;
    const fm = entry.msgs.find((m) => m.type === 5);
    const old = entry.msgs.find((m) => m.type === 4);
    try {
      if (fm) {
        const c = cursor(fm.data, O, L);
        const ver = c.u(1);
        let has;
        if (ver === 3) has = c.u(1) & 0x20;
        else {
          c.skip(2);
          has = c.u(1) || ver === 1;
        }
        if (has && c.left() >= 4 + size && c.u(4) === size) fill = Number(c.dv[get](c.pos, t.le));
      } else if (old && cursor(old.data, O, L).u(4) === size) fill = Number(new DataView(old.data.buffer, old.data.byteOffset + 4, size)[get](0, t.le));
    } catch {
      fill = 0;
    }
    const num = (dv, o) => (big ? Number(dv[get](o, t.le)) : dv[get](o, t.le));

    // ---------------------------------------------------------------- chunk index
    let index = null; // Map "i,j,k" (chunk coordinates) → { addr, size, mask }
    const grid = lay.chunk ? shape.map((n, d) => Math.ceil(n / lay.chunk[d])) : null;
    const chunkBytes = lay.chunk ? lay.chunk.reduce((a, b) => a * b, 1) * size : 0;
    async function buildIndex(signal) {
      index = new Map();
      const linear = (k) => {
        const c = [];
        for (let d = rank - 1; d >= 0; d--) {
          c[d] = k % grid[d];
          k = Math.floor(k / grid[d]);
        }
        return c.join(',');
      };
      const count = grid.reduce((a, b) => a * b, 1);
      if (lay.addr === UNDEF || lay.btree === UNDEF) return;
      if (lay.index === 'btree1') {
        const keySize = 8 + 8 * (rank + 1);
        const walk = async (addr, depth) => {
          if (addr === UNDEF || depth > 12) return;
          if (signal?.aborted) throw cancelled();
          const h = await f.at(addr, 8 + 2 * O);
          if (String.fromCharCode(...h.u8.subarray(0, 4)) !== 'TREE') throw damaged('chunk index');
          h.skip(5);
          const level = h.u(1);
          const used = h.u(2);
          const c = await f.at(addr + 8 + 2 * O, used * (keySize + O) + keySize);
          for (let i = 0; i < used; i++) {
            const csize = c.u(4);
            const mask = c.u(4);
            const key = Array.from({ length: rank + 1 }, () => c.u(8)).slice(0, rank);
            const child = c.off();
            if (level > 0) await walk(child, depth + 1);
            else index.set(key.map((v, d) => Math.floor(v / lay.chunk[d])).join(','), { addr: child, size: csize, mask });
            if (index.size > 4e6) throw new Error('This data set is cut into more than four million chunks, too many to index in the browser.');
          }
        };
        await walk(lay.btree, 0);
      } else if (lay.index === 'single') index.set(linear(0), { addr: lay.addr, size: lay.filteredSize || chunkBytes, mask: lay.mask || 0 });
      else if (lay.index === 'implicit') for (let k = 0; k < count; k++) index.set(linear(k), { addr: lay.addr + k * chunkBytes, size: chunkBytes, mask: 0 });
      else if (lay.index === 'fixed') {
        const h = await f.at(lay.addr, 16 + L + O);
        if (String.fromCharCode(...h.u8.subarray(0, 4)) !== 'FAHD') throw damaged('fixed array');
        h.skip(5);
        const filtered = h.u(1) === 1;
        const esize = h.u(1);
        const pageBits = h.u(1);
        const n = h.len();
        const dblock = h.off();
        if (dblock === UNDEF) return;
        const perPage = 2 ** pageBits;
        const paged = n > perPage;
        const pages = paged ? Math.ceil(n / perPage) : 0;
        const c = await f.at(dblock, 6 + O + Math.ceil(pages / 8) + 4 + n * esize + pages * 4 + 4);
        c.skip(6 + O + Math.ceil(pages / 8) + (paged ? 4 : 0)); // a paged block's header has its own checksum
        for (let k = 0; k < n; k++) {
          if (paged && k && k % perPage === 0) c.skip(4); // each page ends with a checksum
          const addr = c.off();
          const csize = filtered ? c.u(esize - O - 4) : chunkBytes;
          const mask = filtered ? c.u(4) : 0;
          if (addr !== UNDEF) index.set(linear(k), { addr, size: csize, mask });
        }
      } else if (lay.index === 'extensible') {
        // extensible array (one unlimited dimension, newer file format): elements sit in the index
        // block, then in data blocks that double in size, reached through super blocks
        const h = await f.at(lay.addr, 12 + 6 * L + O + 4);
        if (String.fromCharCode(...h.u8.subarray(0, 4)) !== 'EAHD') throw damaged('extensible array');
        h.skip(6);
        const esize = h.u(1);
        const maxBits = h.u(1);
        const ibElmts = h.u(1);
        const dMin = h.u(1);
        const sMinPtrs = h.u(1);
        const pageBits = h.u(1);
        h.skip(4 * L);
        const maxIdx = h.len();
        h.len();
        const iblock = h.off();
        if (iblock === UNDEF || !maxIdx) return;
        const offBytes = (maxBits + 7) >> 3;
        const pageN = 2 ** pageBits;
        const nsblks = 1 + (maxBits - Math.log2(dMin));
        const info = [];
        for (let u = 0, si = 0, sd = 0; u < nsblks; u++) {
          const nd = 2 ** Math.floor(u / 2);
          const ne = 2 ** Math.floor((u + 1) / 2) * dMin;
          info.push({ nd, ne, si, sd });
          si += nd * ne;
          sd += nd;
        }
        const ibSblks = 2 * Math.log2(sMinPtrs);
        const ibDblks = 2 * (sMinPtrs - 1);
        const ib = await f.at(iblock, 6 + O + ibElmts * esize + ibDblks * O + (nsblks - ibSblks) * O + 4);
        if (String.fromCharCode(...ib.u8.subarray(0, 4)) !== 'EAIB') throw damaged('extensible array index');
        ib.skip(6 + O);
        const elems = Array.from({ length: ibElmts }, () => ib.bytes(esize));
        const dAddr = Array.from({ length: ibDblks }, () => ib.off());
        const sAddr = Array.from({ length: nsblks - ibSblks }, () => ib.off());
        const sblocks = new Map();
        const element = async (idx) => {
          if (idx < ibElmts) return elems[idx];
          const j = idx - ibElmts;
          const u = Math.floor(Math.log2(Math.floor(j / dMin) + 1));
          const sb = info[u];
          const k = Math.floor((j - sb.si) / sb.ne);
          const within = (j - sb.si) % sb.ne;
          let dblock;
          if (u < ibSblks) dblock = dAddr[sb.sd + k];
          else {
            const sa = sAddr[u - ibSblks];
            if (sa === UNDEF) return null;
            if (!sblocks.has(sa)) {
              const paged = sb.ne > pageN;
              const bitmap = paged ? Math.ceil((sb.nd * (sb.ne / pageN)) / 8) : 0;
              const c = await f.at(sa, 6 + O + offBytes + bitmap + sb.nd * O + 4);
              c.skip(6 + O + offBytes + bitmap);
              sblocks.set(sa, Array.from({ length: sb.nd }, () => c.off()));
            }
            dblock = sblocks.get(sa)[k];
          }
          if (dblock == null || dblock === UNDEF) return null;
          const head = 6 + O + offBytes;
          const at = sb.ne > pageN ? head + 4 + Math.floor(within / pageN) * (pageN * esize + 4) + (within % pageN) * esize : head + within * esize;
          return (await f.at(dblock + at, esize)).u8;
        };
        // the unlimited dimension counts first (it is moved in front when it is not)
        const unlim = Math.max(0, (lay.max || []).findIndex((v) => v === UNDEF));
        const order = [unlim, ...shape.map((_, d) => d).filter((d) => d !== unlim)];
        const sgrid = order.map((d) => grid[d]);
        sgrid[0] = Math.ceil(maxIdx / sgrid.slice(1).reduce((a, b) => a * b, 1));
        for (let idx = 0; idx < maxIdx; idx++) {
          if (signal?.aborted) throw cancelled();
          const e = await element(idx);
          if (!e) continue;
          const c = cursor(e, O, L);
          const addr = c.off();
          if (addr === UNDEF) continue;
          const csize = esize > O ? c.u(esize - O - 4) : chunkBytes;
          const mask = esize > O ? c.u(4) : 0;
          const coord = new Array(rank);
          let k = idx;
          for (let q = rank - 1; q >= 0; q--) {
            coord[order[q]] = k % sgrid[q];
            k = Math.floor(k / sgrid[q]);
          }
          index.set(coord.join(','), { addr, size: csize, mask });
        }
      } else throw new Error('This file was written with a newer HDF5 chunk index that Bit2Beat cannot read yet. Rewrite it with: h5repack --low=0 --high=1 in.h5 out.h5 (or nccopy -k nc4 in.nc out.nc).');
    }

    function unshuffle(u8) {
      const n = Math.floor(u8.length / size);
      const out = new Uint8Array(u8.length);
      for (let j = 0; j < size; j++) for (let i = 0; i < n; i++) out[i * size + j] = u8[j * n + i];
      return out;
    }
    const cache = new Map(); // decoded chunks, most recent last
    async function chunkData(key) {
      if (cache.has(key)) return cache.get(key);
      const e = index.get(key);
      let dv = null;
      if (e) {
        let u8 = await f.reader.read(f.base + e.addr, e.size);
        for (let k = pipeline.length - 1; k >= 0; k--) {
          if (e.mask & (1 << k)) continue;
          const id = pipeline[k].id;
          if (id === 1) u8 = await bytes.inflate(u8);
          else if (id === 2) u8 = unshuffle(u8);
          else if (id === 3) u8 = u8.subarray(0, u8.length - 4);
        }
        if (u8.length < chunkBytes) throw damaged('a chunk is too short');
        dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      }
      cache.set(key, dv);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      return dv;
    }

    /** Values at start + k·stride (count per dimension), row-major, as Float64Array. */
    async function slab(start, count, stride = shape.map(() => 1), { signal, progress } = {}) {
      const total = count.reduce((a, b) => a * b, 1);
      const out = new Float64Array(total).fill(fill);
      if (!total) return out;
      if (lay.cls !== 2) {
        // compact or contiguous: one run of bytes along the last dimension at a time
        const inline = lay.cls === 0 ? new DataView(lay.data.buffer, lay.data.byteOffset, lay.data.byteLength) : null;
        if (!inline && lay.addr === UNDEF) return out;
        if (!rank) {
          out[0] = num(inline || (await f.at(lay.addr, size)).dv, 0);
          return out;
        }
        const last = rank - 1;
        const run = ((count[last] - 1) * stride[last] + 1) * size;
        const rows = total / count[last];
        let n = 0;
        for (let r = 0; r < rows; r++) {
          if (signal?.aborted) throw cancelled();
          let rem = r;
          let flat = 0;
          let mul = 1;
          const idx = [];
          for (let k = last - 1; k >= 0; k--) {
            idx[k] = start[k] + (rem % count[k]) * stride[k];
            rem = Math.floor(rem / count[k]);
          }
          idx[last] = start[last];
          for (let k = last; k >= 0; k--) {
            flat += idx[k] * mul;
            mul *= shape[k];
          }
          const dv = inline || (await f.at(lay.addr + flat * size, run)).dv;
          const o = inline ? flat * size : 0;
          for (let i = 0; i < count[last]; i++) out[n++] = num(dv, o + i * stride[last] * size);
          if (progress && (r & 15) === 0) progress(r + 1, rows);
        }
        return out;
      }
      if (!index) await buildIndex(signal);
      if (!rank) {
        const dv = await chunkData('');
        if (dv) out[0] = num(dv, 0);
        return out;
      }
      // per dimension: chunk coordinate → [[output position, position inside the chunk], …]
      const per = shape.map((_, d) => {
        const m = new Map();
        for (let k = 0; k < count[d]; k++) {
          const i = start[d] + k * stride[d];
          const cc = Math.floor(i / lay.chunk[d]);
          if (!m.has(cc)) m.set(cc, []);
          m.get(cc).push([k, i - cc * lay.chunk[d]]);
        }
        return [...m];
      });
      const outMul = [];
      const inMul = [];
      for (let d = rank - 1, a = 1, b = 1; d >= 0; d--) {
        outMul[d] = a;
        inMul[d] = b;
        a *= count[d];
        b *= lay.chunk[d];
      }
      const combos = per.reduce((a, p) => a * p.length, 1);
      const at = new Array(rank).fill(0);
      for (let n = 0; n < combos; n++) {
        if (signal?.aborted) throw cancelled();
        const lists = at.map((k, d) => per[d][k][1]);
        const dv = await chunkData(at.map((k, d) => per[d][k][0]).join(','));
        if (dv) {
          // every selected point inside this chunk
          const pos = new Array(rank).fill(0);
          for (;;) {
            let o = 0;
            let i = 0;
            for (let d = 0; d < rank; d++) {
              o += lists[d][pos[d]][0] * outMul[d];
              i += lists[d][pos[d]][1] * inMul[d];
            }
            out[o] = num(dv, i * size);
            let d = rank - 1;
            while (d >= 0 && ++pos[d] === lists[d].length) pos[d--] = 0;
            if (d < 0) break;
          }
        }
        progress?.(n + 1, combos);
        let d = rank - 1;
        while (d >= 0 && ++at[d] === per[d].length) at[d--] = 0;
      }
      return out;
    }

    return { shape, slab, fill, chunk: lay.chunk || null, filters: pipeline.map((p) => p.id), layout: lay.cls === 2 ? `chunked (${lay.index})` : lay.cls === 1 ? 'contiguous' : 'compact' };
  }

  return { dataset, layout, filters };
});
