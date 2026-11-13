/**
 * Bit2Beat core · HDF5 reader, part 1: the structure of the file.
 *
 * HDF5 (and NetCDF-4, which is HDF5 inside) is a small file system in a file: groups hold
 * data sets, each described by an "object header" made of messages (shape, number type,
 * where the numbers are, how they are packed, attributes). This part finds the superblock,
 * walks the groups (old symbol tables and new link messages, compact or in a fractal heap) and
 * reads attributes (inline or dense, fixed or variable-length strings). Part 2
 * (core/hdf5-data.js) reads the numbers. Everything is read lazily through a reader
 * (core/bytes.js), so a multi-gigabyte file costs a few kilobytes to open.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).hdf5 = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIG = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
  const UNDEF = -1;
  const dec = new TextDecoder();
  const pad8 = (n) => (n + 7) & ~7;
  const tag = (u8, o = 0) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const damaged = (what) => new Error(`This HDF5 file is damaged or uses a layout Bit2Beat does not know (${what}).`);

  /** A cursor over bytes; O and L are the file's address and length sizes. */
  function cursor(u8, O = 8, L = 8, pos = 0) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const c = {
      u8,
      dv,
      pos,
      left: () => u8.length - c.pos,
      skip: (n) => ((c.pos += n), c),
      u(n) {
        if (c.pos + n > u8.length) throw new RangeError('short');
        let v;
        if (n === 1) v = dv.getUint8(c.pos);
        else if (n === 2) v = dv.getUint16(c.pos, true);
        else if (n === 4) v = dv.getUint32(c.pos, true);
        else if (n === 8) {
          const b = dv.getBigUint64(c.pos, true);
          v = b >= 0xffffffffffff0000n ? UNDEF : Number(b);
        } else {
          v = 0;
          for (let k = n - 1; k >= 0; k--) v = v * 256 + dv.getUint8(c.pos + k);
        }
        c.pos += n;
        return v;
      },
      off() {
        const v = c.u(O);
        return O === 4 && v === 0xffffffff ? UNDEF : v;
      },
      len: () => c.u(L),
      bytes(n) {
        if (c.pos + n > u8.length) throw new RangeError('short');
        c.pos += n;
        return u8.subarray(c.pos - n, c.pos);
      },
      str: (n) => dec.decode(c.bytes(n)).replace(/\0[\s\S]*$/, ''),
    };
    return c;
  }

  // ---------------------------------------------------------------- messages
  function dataspace(c) {
    const ver = c.u(1);
    const rank = c.u(1);
    const flags = c.u(1);
    if (ver === 1) c.skip(5);
    else if (c.u(1) === 2) return { dims: null }; // null dataspace
    return { dims: Array.from({ length: rank }, () => c.len()), max: flags & 1 ? Array.from({ length: rank }, () => c.len()) : null };
  }

  function datatype(c) {
    const b0 = c.u(1);
    const bits = c.u(1);
    c.skip(2);
    const t = { cls: b0 & 15, size: c.u(4) };
    if (t.cls === 0) {
      t.le = !(bits & 1);
      t.signed = !!(bits & 8);
      c.skip(4);
    } else if (t.cls === 1) {
      t.le = !(bits & 1);
      c.skip(12);
    } else if (t.cls === 9) {
      t.string = (bits & 15) === 1;
      t.base = datatype(c);
    }
    t.numeric = (t.cls === 0 && [1, 2, 4, 8].includes(t.size)) || (t.cls === 1 && [4, 8].includes(t.size));
    return t;
  }

  /** DataView getter name for a numeric type. */
  const getter = (t) => (t.cls === 1 ? (t.size === 4 ? 'getFloat32' : 'getFloat64') : `get${t.size === 8 ? 'Big' : ''}${t.signed ? 'Int' : 'Uint'}${t.size * 8}`);

  function linkMessage(c) {
    if (c.u(1) !== 1) return null;
    const flags = c.u(1);
    const type = flags & 8 ? c.u(1) : 0;
    if (flags & 4) c.skip(8);
    if (flags & 16) c.skip(1);
    const name = c.str(c.u(1 << (flags & 3)));
    if (type === 0) return { name, addr: c.off() };
    c.skip(c.u(2)); // soft and external links are not followed
    return { name, addr: UNDEF };
  }

  // ---------------------------------------------------------------- the file
  async function open(reader) {
    let s0 = -1;
    for (let o = 0; o + 8 <= reader.size && o <= 1 << 22; o = o ? o * 2 : 512) {
      const b = await reader.read(o, 8);
      if (SIG.every((v, i) => b[i] === v)) {
        s0 = o;
        break;
      }
    }
    if (s0 < 0) throw new Error('This is not an HDF5 file.');
    const sb = await reader.read(s0, Math.min(128, reader.size - s0));
    const ver = sb[8];
    let O;
    let L;
    let rootAddr;
    let base;
    if (ver <= 1) {
      O = sb[13];
      L = sb[14];
      const c = cursor(sb, O, L, ver === 1 ? 28 : 24);
      base = c.off();
      c.skip(3 * O); // free space, end of file, driver
      c.off(); // root link name
      rootAddr = c.off();
    } else if (ver <= 3) {
      O = sb[9];
      L = sb[10];
      const c = cursor(sb, O, L, 12);
      base = c.off();
      c.skip(2 * O);
      rootAddr = c.off();
    } else throw new Error('This HDF5 file uses a newer format version than Bit2Beat knows.');
    if (base === UNDEF) base = s0;
    const at = async (addr, n) => cursor(await reader.read(base + addr, Math.max(0, Math.min(n, reader.size - base - addr))), O, L);
    const f = { reader, O, L, base, at, version: ver };

    /** Every message of an object header: [{ type, flags, data }]. */
    f.header = async (addr) => {
      const head = (await at(addr, 64)).u8;
      const msgs = [];
      const blocks = [];
      const v2 = tag(head) === 'OHDR';
      let tracked = false;
      let count = Infinity;
      if (v2) {
        const flags = head[5];
        tracked = !!(flags & 4);
        let p = 6 + (flags & 0x20 ? 16 : 0) + (flags & 0x10 ? 4 : 0);
        const c = cursor(head, O, L, p);
        const size = c.u(1 << (flags & 3));
        blocks.push([addr + c.pos, size]);
      } else {
        if (head[0] !== 1) throw damaged('object header');
        const c = cursor(head, O, L, 2);
        count = c.u(2);
        c.skip(4);
        blocks.push([addr + 16, c.u(4)]);
      }
      for (let b = 0; b < blocks.length && b < 4096; b++) {
        const c = await at(blocks[b][0], blocks[b][1]);
        const prefix = v2 ? 4 + (tracked ? 2 : 0) : 8;
        while (c.left() >= prefix && msgs.length < count) {
          const type = v2 ? c.u(1) : c.u(2);
          const size = c.u(2);
          const flags = c.u(1);
          c.skip(v2 ? (tracked ? 2 : 0) : 3);
          if (size > c.left()) break;
          const data = c.bytes(size);
          if (type === 0x10) {
            const k = cursor(data, O, L);
            const o = k.off();
            const n = k.len();
            blocks.push(v2 ? [o + 4, n - 8] : [o, n]); // v2 blocks start with "OCHK" and end with a checksum
          } else if (type) msgs.push({ type, flags, data });
        }
      }
      return msgs;
    };

    /** The data areas of every direct block of a fractal heap (dense links and attributes live there). */
    f.heapBlocks = async (addr) => {
      const c = await at(addr, 256);
      if (tag(c.u8) !== 'FRHP') throw damaged('fractal heap');
      c.skip(5);
      c.skip(2);
      const filterLen = c.u(2);
      const flags = c.u(1);
      c.skip(4 + L + O + L + O + 4 * L + 4 * L);
      const width = c.u(2);
      const startSize = c.len();
      const maxDirect = c.len();
      const heapBits = c.u(2);
      c.skip(2);
      const rootAddr = c.off();
      const curRows = c.u(2);
      if (filterLen) return []; // compressed heaps are not supported
      const offBytes = Math.ceil(heapBits / 8);
      const head = 5 + O + offBytes + (flags & 2 ? 4 : 0);
      const maxDirectRows = Math.round(Math.log2(maxDirect) - Math.log2(startSize)) + 2;
      const out = [];
      const rowSize = (r) => (r < 2 ? startSize : startSize * 2 ** (r - 1));
      const direct = async (a, size) => {
        const u8 = (await at(a, size)).u8;
        if (tag(u8) === 'FHDB') out.push(u8.subarray(head));
      };
      const indirect = async (a, rows, depth = 0) => {
        if (depth > 8) return;
        const k = await at(a, 5 + O + offBytes + rows * width * O + 8);
        if (tag(k.u8) !== 'FHIB') return;
        k.skip(5 + O + offBytes);
        const dRows = Math.min(rows, maxDirectRows);
        for (let r = 0; r < dRows; r++)
          for (let w = 0; w < width; w++) {
            const child = k.off();
            if (child !== UNDEF) await direct(child, rowSize(r));
          }
        for (let r = dRows; r < rows; r++)
          for (let w = 0; w < width; w++) {
            const child = k.off();
            if (child !== UNDEF) await indirect(child, Math.round(Math.log2(rowSize(r)) - Math.log2(startSize * width)) + 1, depth + 1);
          }
      };
      if (rootAddr === UNDEF) return out;
      if (curRows === 0) await direct(rootAddr, startSize);
      else await indirect(rootAddr, curRows);
      return out;
    };

    /** The links of a group: [{ name, addr }]. */
    f.links = async (msgs) => {
      const out = [];
      const stab = msgs.find((m) => m.type === 0x11);
      if (stab) {
        const k = cursor(stab.data, O, L);
        const btree = k.off();
        const heapAddr = k.off();
        const h = await at(heapAddr, 8 + 2 * L + O);
        if (tag(h.u8) !== 'HEAP') throw damaged('group heap');
        h.skip(8);
        const heapSize = h.len();
        h.len();
        const names = (await at(h.off(), heapSize)).u8;
        const nameAt = (o) => {
          let e = o;
          while (e < names.length && names[e]) e++;
          return dec.decode(names.subarray(o, e));
        };
        const node = async (addr, depth = 0) => {
          if (addr === UNDEF || depth > 16) return;
          const n = await at(addr, 8 + 2 * O);
          const sig = tag(n.u8);
          if (sig === 'TREE') {
            n.skip(5);
            const level = n.u(1);
            const used = n.u(2);
            const body = await at(addr + 8 + 2 * O, used * (L + O) + L);
            for (let i = 0; i < used; i++) {
              body.skip(L);
              const child = body.off();
              await (level > 0 ? node(child, depth + 1) : node(child, depth + 1));
            }
          } else if (sig === 'SNOD') {
            const count = cursor(n.u8, O, L, 6).u(2);
            const e = await at(addr + 8, count * (2 * O + 24));
            for (let i = 0; i < count; i++) {
              const nameOff = e.off();
              const obj = e.off();
              const cache = e.u(4);
              e.skip(20);
              if (cache !== 2) out.push({ name: nameAt(nameOff), addr: obj });
            }
          }
        };
        await node(btree);
      }
      for (const m of msgs) {
        if (m.type === 0x06) {
          const l = linkMessage(cursor(m.data, O, L));
          if (l && l.addr !== UNDEF) out.push(l);
        } else if (m.type === 0x02) {
          const k = cursor(m.data, O, L);
          k.skip(1);
          const flags = k.u(1);
          if (flags & 1) k.skip(8);
          const heap = k.off();
          if (heap === UNDEF) continue;
          for (const blk of await f.heapBlocks(heap)) {
            const c = cursor(blk, O, L);
            try {
              while (c.left() > 4 && blk[c.pos] === 1) {
                const l = linkMessage(c);
                if (l && l.addr !== UNDEF) out.push(l);
              }
            } catch (e) {
              if (!(e instanceof RangeError)) throw e;
            }
          }
        }
      }
      return out;
    };

    // ---------------------------------------------------------------- attributes
    const heaps = new Map();
    /** One object of a global heap (variable-length data lives there). */
    async function globalHeap(addr, index) {
      if (!heaps.has(addr)) {
        const h = await at(addr, 16 + L);
        if (tag(h.u8) !== 'GCOL') throw damaged('global heap');
        h.skip(8);
        heaps.set(addr, (await at(addr, h.len())).u8);
        if (heaps.size > 64) heaps.delete(heaps.keys().next().value);
      }
      const c = cursor(heaps.get(addr), O, L, 8 + L);
      while (c.left() >= 8 + L) {
        const idx = c.u(2);
        c.skip(6);
        const size = c.len();
        if (idx === 0) break;
        if (idx === index) return c.bytes(size);
        c.skip(pad8(size));
      }
      return new Uint8Array(0);
    }

    /** One attribute message → [name, value, bytes used]. Values: number, string or array of them. */
    async function attribute(c) {
      const start = c.pos;
      const ver = c.u(1);
      if (ver < 1 || ver > 3) return null;
      const aflags = c.u(1);
      const nameSize = c.u(2);
      const dtSize = c.u(2);
      const dsSize = c.u(2);
      if (ver === 3) c.skip(1);
      const pad = ver === 1 ? pad8 : (n) => n;
      const name = c.str(nameSize);
      c.pos = c.pos - nameSize + pad(nameSize);
      const dtAt = c.pos;
      const shared = ver > 1 && aflags & 3;
      let t = null;
      let dims = null;
      if (!shared) {
        t = datatype(cursor(c.u8.subarray(dtAt, dtAt + dtSize), O, L));
        dims = dsSize ? dataspace(cursor(c.u8.subarray(dtAt + pad(dtSize), dtAt + pad(dtSize) + dsSize), O, L)).dims : [];
      }
      c.pos = dtAt + pad(dtSize) + pad(dsSize);
      if (!t || !dims) return [name, undefined, c.pos - start]; // shared types are not followed
      const n = dims.reduce((a, b) => a * b, 1);
      const data = cursor(c.bytes(n * t.size), O, L);
      let value;
      if (t.numeric) {
        const g = getter(t);
        value = Array.from({ length: Math.min(n, 4096) }, (_, i) => Number(data.dv[g](i * t.size, t.le)));
      } else if (t.cls === 3) value = Array.from({ length: Math.min(n, 256) }, () => data.str(t.size));
      else if (t.cls === 9) {
        value = [];
        for (let i = 0; i < Math.min(n, 256); i++) {
          const len = data.u(4);
          const heap = data.off();
          const idx = data.u(4);
          if (heap === UNDEF || !len) {
            value.push(t.string ? '' : []);
            continue;
          }
          const obj = await globalHeap(heap, idx);
          if (t.string) value.push(dec.decode(obj.subarray(0, len)).replace(/\0[\s\S]*$/, ''));
          else if (t.base.cls === 7) {
            const k = cursor(obj, O, L);
            value.push(Array.from({ length: len }, () => k.off())); // object references (dimension scales)
          } else value.push(undefined);
        }
      }
      if (Array.isArray(value) && value.length === 1) value = value[0];
      return [name, value, c.pos - start];
    }

    /** All attributes of an object as { name: value }. */
    f.attributes = async (msgs) => {
      const out = {};
      for (const m of msgs) {
        try {
          if (m.type === 0x0c && !(m.flags & 2)) {
            const a = await attribute(cursor(m.data, O, L));
            if (a) out[a[0]] = a[1];
          } else if (m.type === 0x15) {
            const k = cursor(m.data, O, L);
            k.skip(1);
            if (k.u(1) & 1) k.skip(2);
            const heap = k.off();
            if (heap === UNDEF) continue;
            for (const blk of await f.heapBlocks(heap)) {
              const c = cursor(blk, O, L);
              while (c.left() > 8 && blk[c.pos] >= 1 && blk[c.pos] <= 3) {
                const a = await attribute(c);
                if (!a) break;
                out[a[0]] = a[1];
              }
            }
          }
        } catch (e) {
          if (!(e instanceof RangeError)) throw e; // a cut-off attribute is skipped, the rest still reads
        }
      }
      return out;
    };

    /** Every data set in the file: [{ path, name, addr, dims, type, msgs }] (groups are walked, at most 4000 objects). */
    f.datasets = async () => {
      const out = [];
      const seen = new Set();
      const queue = [{ path: '', addr: rootAddr, depth: 0 }];
      while (queue.length && seen.size < 4000) {
        const it = queue.shift();
        if (seen.has(it.addr)) continue;
        seen.add(it.addr);
        let msgs;
        try {
          msgs = await f.header(it.addr);
        } catch (e) {
          if (!it.path) throw e;
          continue;
        }
        const space = msgs.find((m) => m.type === 1);
        const type = msgs.find((m) => m.type === 3);
        const layout = msgs.find((m) => m.type === 8);
        if (space && type && layout) {
          if (type.flags & 2) continue; // a shared (named) number type
          const dims = dataspace(cursor(space.data, O, L)).dims;
          if (dims) out.push({ path: it.path, name: it.path.split('/').pop(), addr: it.addr, dims, type: datatype(cursor(type.data, O, L)), msgs });
        } else if (it.depth < 8) {
          for (const l of await f.links(msgs)) queue.push({ path: `${it.path}/${l.name}`, addr: l.addr, depth: it.depth + 1 });
        }
      }
      return out;
    };
    f.rootAttributes = async () => f.attributes(await f.header(rootAddr));
    return f;
  }

  return { open, cursor, dataspace, datatype, getter, UNDEF, damaged };
});
