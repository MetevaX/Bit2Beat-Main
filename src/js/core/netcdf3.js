/**
 * Bit2Beat core · classic NetCDF reader (CDF-1, CDF-2 "64-bit offset" and CDF-5 "64-bit data").
 *
 * The header lists dimensions, attributes and variables; the numbers follow as plain big-endian
 * arrays, so any part of any variable can be read straight from its place in the file without
 * loading the rest. (NetCDF-4 files are HDF5 inside: core/hdf5.js reads those.)
 *
 *   const nc = await netcdf3.open(reader);   // { dims, attrs, vars: [{ name, dims, shape, attrs, slab() }] }
 *   const a = await v.slab([0, 0, 0], [1, 180, 360], [1, 2, 2]);   // start, count, stride → Float64Array
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).netcdf3 = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // type → [bytes, DataView getter]
  const TYPES = {
    1: [1, 'getInt8'], 2: [1, 'getUint8'], 3: [2, 'getInt16'], 4: [4, 'getInt32'], 5: [4, 'getFloat32'], 6: [8, 'getFloat64'],
    7: [1, 'getUint8'], 8: [2, 'getUint16'], 9: [4, 'getUint32'], 10: [8, 'getBigInt64'], 11: [8, 'getBigUint64'],
  };
  const pad4 = (n) => (n + 3) & ~3;

  function parseHeader(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8[0] !== 0x43 || u8[1] !== 0x44 || u8[2] !== 0x46) throw new Error('This is not a NetCDF file.');
    const version = u8[3];
    if (![1, 2, 5].includes(version)) throw new Error('This NetCDF file uses a format version Bit2Beat does not know.');
    let p = 4;
    const need = (n) => {
      if (p + n > u8.length) throw new RangeError('more');
    };
    const u32 = () => (need(4), (p += 4), dv.getUint32(p - 4));
    const size = () => (version === 5 ? (need(8), (p += 8), Number(dv.getBigUint64(p - 8))) : u32()); // counts and lengths
    const offset = () => (version === 1 ? u32() : (need(8), (p += 8), Number(dv.getBigUint64(p - 8))));
    const name = () => {
      const n = size();
      need(pad4(n));
      const s = new TextDecoder().decode(u8.subarray(p, p + n));
      p += pad4(n);
      return s;
    };
    const list = (tag, item) => {
      const t = u32();
      const n = size();
      if (t === 0 && n === 0) return [];
      if (t !== tag) throw new Error('This NetCDF file is damaged (its header does not make sense).');
      return Array.from({ length: n }, item);
    };
    const attr = () => {
      const key = name();
      const type = u32();
      const n = size();
      const [bytes, getter] = TYPES[type] || [];
      if (!bytes) throw new Error('This NetCDF file is damaged (unknown attribute type).');
      need(pad4(n * bytes));
      let value;
      if (type === 2) value = new TextDecoder().decode(u8.subarray(p, p + n)).replace(/\0+$/, '');
      else {
        value = Array.from({ length: n }, (_, i) => Number(dv[getter](p + i * bytes)));
        if (n === 1) value = value[0];
      }
      p += pad4(n * bytes);
      return [key, value];
    };
    const numrecs = size();
    const dims = list(10, () => ({ name: name(), size: size() }));
    const attrs = Object.fromEntries(list(12, attr));
    const vars = list(11, () => {
      const v = { name: name() };
      v.dimids = Array.from({ length: size() }, () => size());
      v.attrs = Object.fromEntries(list(12, attr));
      v.type = u32();
      v.vsize = size();
      v.begin = offset();
      return v;
    });
    return { version, numrecs, dims, attrs, vars };
  }

  async function open(reader) {
    let h;
    for (let n = 1 << 16; ; n *= 4) {
      try {
        h = parseHeader(await reader.read(0, Math.min(n, reader.size)));
        break;
      } catch (e) {
        if (!(e instanceof RangeError) || n >= reader.size || n > 1 << 28) throw e instanceof RangeError ? new Error('This NetCDF file ends inside its header (it may be incomplete).') : e;
      }
    }
    const recDim = h.dims.findIndex((d) => d.size === 0);
    const recVars = h.vars.filter((v) => v.dimids[0] === recDim && recDim >= 0);
    // one record = every record variable's slice, each padded to 4 bytes (a lone record variable is not padded)
    const sliceBytes = (v) => v.dimids.slice(1).reduce((n, d) => n * h.dims[d].size, 1) * TYPES[v.type][0];
    const recSize = recVars.length === 1 ? sliceBytes(recVars[0]) : recVars.reduce((n, v) => n + pad4(sliceBytes(v)), 0);
    let numrecs = h.numrecs;
    if (numrecs === 0xffffffff && recVars.length) numrecs = Math.floor((reader.size - Math.min(...recVars.map((v) => v.begin))) / recSize); // "streaming" files
    const vars = h.vars
      .filter((v) => TYPES[v.type])
      .map((v) => {
        const record = v.dimids[0] === recDim && recDim >= 0;
        const shape = v.dimids.map((d, k) => (record && k === 0 ? numrecs : h.dims[d].size));
        const [bytes, getter] = TYPES[v.type];
        const inner = shape.slice(record ? 1 : 0);
        const at = (idx) => {
          // byte position of element idx (array of indices)
          let flat = 0;
          for (let k = record ? 1 : 0; k < shape.length; k++) flat = flat * shape[k] + idx[k];
          return v.begin + (record ? idx[0] * recSize : 0) + flat * bytes;
        };
        /** Values at start + k·stride (count per dimension), row-major, as Float64Array. */
        async function slab(start, count, stride = shape.map(() => 1), { signal, progress } = {}) {
          const rank = shape.length;
          const total = count.reduce((a, b) => a * b, 1);
          const out = new Float64Array(total);
          if (!rank) {
            out[0] = Number(new DataView((await reader.read(v.begin, bytes)).slice().buffer)[getter](0));
            return out;
          }
          if (record && rank === 1) {
            // a record variable with one value per record: the values are spread through the file
            for (let i = 0; i < count[0]; i++) {
              const u8 = await reader.read(at([start[0] + i * stride[0]]), bytes);
              out[i] = Number(new DataView(u8.buffer, u8.byteOffset, bytes)[getter](0));
            }
            return out;
          }
          const last = rank - 1;
          const run = ((count[last] - 1) * stride[last] + 1) * bytes; // one contiguous run along the last dimension
          const idx = start.slice();
          const rows = total / count[last];
          let n = 0;
          for (let r = 0; r < rows; r++) {
            if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
            let rem = r;
            for (let k = last - 1; k >= 0; k--) {
              idx[k] = start[k] + (rem % count[k]) * stride[k];
              rem = Math.floor(rem / count[k]);
            }
            idx[last] = start[last];
            const u8 = await reader.read(at(idx), run);
            const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            for (let i = 0; i < count[last]; i++) out[n++] = Number(dv[getter](i * stride[last] * bytes));
            if (progress && (r & 15) === 0) progress(r + 1, rows);
          }
          return out;
        }
        return { name: v.name, path: v.name, dims: v.dimids.map((d) => h.dims[d].name), shape, attrs: v.attrs, text: v.type === 2, inner, slab };
      });
    return { format: `NetCDF classic (CDF-${h.version})`, dims: h.dims.map((d, k) => ({ name: d.name, size: k === recDim ? numrecs : d.size })), attrs: h.attrs, vars };
  }

  return { open, parseHeader };
});
