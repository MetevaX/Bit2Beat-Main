/**
 * Bit2Beat core · GeoTIFF and Cloud-Optimized GeoTIFF reader (classic TIFF and BigTIFF).
 *
 * Reads only what it needs: the tag directories, then just the tiles or strips that hold the
 * sampled pixels. A cloud-optimized file brings its own small copies (overviews); the smallest
 * one that is still big enough is used, so a 5 GB map opens in a moment.
 * Supports 8/16/32-bit integers and 32/64-bit floats, strips and tiles, several bands, no
 * compression, Deflate, LZW and PackBits, the horizontal and floating-point predictors, the
 * no-data value, and the geographic box from the GeoTIFF tags.
 *
 *   const t = await tiff.open(reader);              // { images: [...], main }
 *   const g = await tiff.readGrid(reader, t, { width: 720, height: 360, band: 0 });
 */
(function (root, factory) {
  const mod = factory(typeof module === 'object' && module.exports ? require('./bytes.js') : root.Bit2Beat.bytes);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).tiff = mod;
})(typeof self !== 'undefined' ? self : this, function (bytes) {
  'use strict';

  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
  const WANT = new Set([254, 256, 257, 258, 259, 273, 277, 278, 279, 284, 317, 322, 323, 324, 325, 338, 339, 33550, 33922, 34264, 34735, 42112, 42113]);
  const COMPRESSION = { 6: 'old JPEG', 7: 'JPEG', 34712: 'JPEG 2000', 34887: 'LERC', 34925: 'LZMA', 50000: 'Zstandard', 50001: 'WebP', 50002: 'JPEG XL' };
  const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  function values(dv, type, count, le) {
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count && dv.getUint8(i); i++) s += String.fromCharCode(dv.getUint8(i));
      return s;
    }
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const o = i * SIZE[type];
      out[i] =
        type === 1 || type === 7 ? dv.getUint8(o)
        : type === 6 ? dv.getInt8(o)
        : type === 3 ? dv.getUint16(o, le)
        : type === 8 ? dv.getInt16(o, le)
        : type === 4 ? dv.getUint32(o, le)
        : type === 9 ? dv.getInt32(o, le)
        : type === 11 ? dv.getFloat32(o, le)
        : type === 12 ? dv.getFloat64(o, le)
        : type === 5 ? dv.getUint32(o, le) / dv.getUint32(o + 4, le)
        : type === 10 ? dv.getInt32(o, le) / dv.getInt32(o + 4, le)
        : type === 17 ? Number(dv.getBigInt64(o, le))
        : Number(dv.getBigUint64(o, le));
    }
    return out;
  }

  /** The geographic box [west, south, east, north] in degrees, or null (with a note) when the map is not in latitude/longitude. */
  function georef(t, width, height) {
    const keys = t[34735] || [];
    let model = 0;
    let epsg = 0;
    for (let i = 4; i + 3 < keys.length; i += 4) {
      if (keys[i] === 1024) model = keys[i + 3];
      if (keys[i] === 2048 || keys[i] === 3072) epsg = keys[i + 3];
    }
    let x0;
    let y0;
    let sx;
    let sy;
    if (t[33550] && t[33922]) {
      [sx, sy] = t[33550];
      x0 = t[33922][3] - t[33922][0] * sx;
      y0 = t[33922][4] + t[33922][1] * sy;
    } else if (t[34264]) {
      const m = t[34264];
      [sx, x0, sy, y0] = [m[0], m[3], -m[5], m[7]];
    } else return { bbox: null, note: 'This file has no map position, so left–right and top–bottom stand in for west–east and north–south.' };
    const box = [x0, y0 - height * sy, x0 + width * sx, y0];
    const degrees = model === 2 || (model === 0 && box[0] >= -360.5 && box[2] <= 360.5 && box[1] >= -90.5 && box[3] <= 90.5);
    if (!degrees) return { bbox: null, note: `This map uses a projected grid${epsg ? ' (EPSG:' + epsg + ')' : ''}, not latitude and longitude, so left–right and top–bottom stand in for west–east and north–south.` };
    return { bbox: box.map((v) => +v.toFixed(6)), note: '' };
  }

  /** Read the tag directories. Returns { images, main, bigTiff }. */
  async function open(reader) {
    const head = view(await reader.read(0, Math.min(16, reader.size)));
    const le = head.getUint16(0) === 0x4949;
    if (!le && head.getUint16(0) !== 0x4d4d) throw new Error('This is not a TIFF file.');
    const magic = head.getUint16(2, le);
    const big = magic === 43;
    if (magic !== 42 && !big) throw new Error('This is not a TIFF file.');
    let next = big ? Number(head.getBigUint64(8, le)) : head.getUint32(4, le);
    const images = [];
    for (let guard = 0; next && guard < 64; guard++) {
      const n = big ? Number(view(await reader.read(next, 8)).getBigUint64(0, le)) : view(await reader.read(next, 2)).getUint16(0, le);
      if (n > 4096) throw new Error('This TIFF file is damaged (a tag list is too long).');
      const esz = big ? 20 : 12;
      const dir = view(await reader.read(next + (big ? 8 : 2), n * esz + (big ? 8 : 4)));
      const t = {};
      for (let k = 0; k < n; k++) {
        const o = k * esz;
        const tag = dir.getUint16(o, le);
        const type = dir.getUint16(o + 2, le);
        if (!WANT.has(tag) || !SIZE[type]) continue;
        const count = big ? Number(dir.getBigUint64(o + 4, le)) : dir.getUint32(o + 4, le);
        const len = count * SIZE[type];
        const field = big ? 8 : 4;
        const at = o + (big ? 12 : 8);
        const data = len <= field ? new DataView(dir.buffer, dir.byteOffset + at, len) : view(await reader.read(big ? Number(dir.getBigUint64(at, le)) : dir.getUint32(at, le), len));
        t[tag] = values(data, type, count, le);
      }
      next = big ? Number(dir.getBigUint64(n * esz, le)) : dir.getUint32(n * esz, le);
      const width = t[256]?.[0];
      const height = t[257]?.[0];
      if (!width || !height) continue;
      const tiled = !!t[324];
      const spp = t[277]?.[0] || 1;
      const meta = String(t[42112] || '');
      const item = (name) => (meta.match(new RegExp(`<Item[^>]*name="${name}"[^>]*>([^<]*)<`, 'i')) || [])[1];
      const img = {
        width,
        height,
        le,
        bits: t[258]?.[0] || 1,
        fmt: t[339]?.[0] || 1, // 1 unsigned, 2 signed, 3 float
        spp,
        // an alpha sample (ExtraSamples 1 or 2, as the NASA raster API sends) is a no-data mask, not data
        alpha: [1, 2].includes(t[338]?.[t[338].length - 1]) && spp > 1 ? spp - 1 : -1,
        comp: t[259]?.[0] || 1,
        pred: t[317]?.[0] || 1,
        planar: t[284]?.[0] || 1,
        tw: tiled ? t[322][0] : width,
        th: tiled ? t[323][0] : Math.min(height, t[278]?.[0] || height),
        offsets: t[tiled ? 324 : 273] || [],
        counts: t[tiled ? 325 : 279] || [],
        reduced: !!((t[254]?.[0] || 0) & 1),
        nodata: t[42113] != null && String(t[42113]).trim() !== '' ? Number(String(t[42113]).trim()) : null,
        unit: item('UNITTYPE') || item('units') || '',
        scale: Number(item('SCALE')) || 1,
        offset: Number(item('OFFSET')) || 0,
        label: item('DESCRIPTION') || item('long_name') || '',
        ...georef(t, width, height),
      };
      img.across = Math.ceil(width / img.tw);
      img.down = Math.ceil(height / img.th);
      images.push(img);
    }
    const main = images.find((i) => !i.reduced) || images[0];
    if (!main) throw new Error('This TIFF file has no picture in it.');
    // overviews often leave out the no-data value and scaling: they share the main image's
    for (const i of images) if (i !== main) {
      if (i.nodata == null) i.nodata = main.nodata;
      if (i.scale === 1 && i.offset === 0) Object.assign(i, { scale: main.scale, offset: main.offset });
    }
    if (![8, 16, 32, 64].includes(main.bits) || (main.fmt === 3 && main.bits < 32)) throw new Error(`This TIFF stores ${main.bits}-bit values, which Bit2Beat cannot read. Save it as 8, 16 or 32-bit.`);
    if (COMPRESSION[main.comp] || ![1, 5, 8, 32946, 32773].includes(main.comp)) throw new Error(`This TIFF is packed with ${COMPRESSION[main.comp] || 'compression ' + main.comp}, which Bit2Beat cannot unpack. Save it with Deflate or LZW compression (for example: gdal_translate -co COMPRESS=DEFLATE).`);
    return { images, main, bigTiff: big };
  }

  /** One tile or strip, unpacked: { dv, le, rows } or null when the block was never written (no data). */
  async function block(reader, img, bx, by, band) {
    const sppIn = img.planar === 2 ? 1 : img.spp;
    const index = by * img.across + bx + (img.planar === 2 ? band * img.across * img.down : 0);
    const count = img.counts[index];
    if (!count) return null;
    const bps = img.bits / 8;
    const rows = img.tw === img.width ? Math.min(img.th, img.height - by * img.th) : img.th;
    const rowBytes = img.tw * sppIn * bps;
    const expected = rows * rowBytes;
    let u8 = await reader.read(img.offsets[index], count);
    if (img.comp === 8 || img.comp === 32946) u8 = await bytes.inflate(u8);
    else if (img.comp === 5) u8 = bytes.lzw(u8, expected);
    else if (img.comp === 32773) u8 = bytes.packbits(u8, expected);
    if (u8.length < expected) throw new Error('A part of this TIFF is shorter than it should be (the file may be damaged).');
    let le = img.le;
    if (img.pred === 2) {
      u8 = u8.slice(0, expected);
      const dv = view(u8);
      for (let r = 0; r < rows; r++)
        for (let i = sppIn; i < img.tw * sppIn; i++) {
          const o = r * rowBytes + i * bps;
          if (bps === 1) u8[o] += u8[o - sppIn];
          else if (bps === 2) dv.setUint16(o, dv.getUint16(o, le) + dv.getUint16(o - sppIn * 2, le), le);
          else if (bps === 4) dv.setUint32(o, dv.getUint32(o, le) + dv.getUint32(o - sppIn * 4, le), le);
        }
    } else if (img.pred === 3) {
      // floating-point predictor: bytes are differenced, then stored one significance plane after another
      const out = new Uint8Array(expected);
      const n = img.tw * sppIn;
      for (let r = 0; r < rows; r++) {
        const row = u8.subarray(r * rowBytes, (r + 1) * rowBytes).slice();
        for (let i = sppIn; i < rowBytes; i++) row[i] += row[i - sppIn];
        for (let i = 0; i < n; i++) for (let b = 0; b < bps; b++) out[r * rowBytes + i * bps + (bps - 1 - b)] = row[b * n + i];
      }
      u8 = out;
      le = true;
    }
    return { dv: view(u8), le, rows };
  }

  /** The image to read for a wanted width: the smallest overview that is still big enough. */
  function pick(t, width) {
    return t.images.filter((i) => i.spp === t.main.spp && Math.abs(i.width / i.height - t.main.width / t.main.height) < 0.02 && i.width >= Math.min(width, t.main.width)).sort((a, b) => a.width - b.width)[0] || t.main;
  }

  /** Reads one stored number of this image's sample type. */
  function getter(img) {
    const bps = img.bits / 8;
    return img.fmt === 3 ? (bps === 4 ? (dv, o, le) => dv.getFloat32(o, le) : (dv, o, le) => dv.getFloat64(o, le))
      : img.fmt === 2 ? (bps === 1 ? (dv, o) => dv.getInt8(o) : bps === 2 ? (dv, o, le) => dv.getInt16(o, le) : bps === 4 ? (dv, o, le) => dv.getInt32(o, le) : (dv, o, le) => Number(dv.getBigInt64(o, le)))
      : bps === 1 ? (dv, o) => dv.getUint8(o) : bps === 2 ? (dv, o, le) => dv.getUint16(o, le) : bps === 4 ? (dv, o, le) => dv.getUint32(o, le) : (dv, o, le) => Number(dv.getBigUint64(o, le));
  }

  /** One value at full resolution (column x, row y), NaN for no data. */
  async function pixel(reader, t, x, y, band = 0) {
    const img = t.main;
    x = Math.max(0, Math.min(img.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(img.height - 1, Math.round(y)));
    const bx = Math.floor(x / img.tw);
    const by = Math.floor(y / img.th);
    const blk = await block(reader, img, bx, by, band);
    if (!blk) return NaN;
    const sppIn = img.planar === 2 ? 1 : img.spp;
    const at = ((y - by * img.th) * img.tw + (x - bx * img.tw)) * sppIn;
    if (img.alpha >= 0 && img.planar !== 2 && getter(img)(blk.dv, (at + img.alpha) * (img.bits / 8), blk.le) === 0) return NaN;
    const v = getter(img)(blk.dv, (at + (img.planar === 2 ? 0 : band)) * (img.bits / 8), blk.le);
    return img.nodata != null && (v === img.nodata || (Number.isNaN(img.nodata) && Number.isNaN(v))) ? NaN : v * img.scale + img.offset;
  }

  /**
   * A grid of at most width × height values (nearest pixel), as Float32Array with NaN for no data.
   * opts: { width, height, band, signal, progress(done, total) }
   */
  async function readGrid(reader, t, { width = 720, height = 360, band = 0, signal, progress } = {}) {
    const img = pick(t, width);
    const w = Math.min(width, img.width);
    const h = Math.min(height, img.height);
    const sppIn = img.planar === 2 ? 1 : img.spp;
    const bps = img.bits / 8;
    const b = img.planar === 2 ? 0 : band;
    const get = getter(img);
    const xs = Array.from({ length: w }, (_, i) => Math.floor(((i + 0.5) * img.width) / w));
    const out = new Float32Array(w * h).fill(NaN);
    // rows grouped by the strip / tile row that holds them
    const groups = new Map();
    for (let j = 0; j < h; j++) {
      const sy = Math.floor(((j + 0.5) * img.height) / h);
      const by = Math.floor(sy / img.th);
      if (!groups.has(by)) groups.set(by, []);
      groups.get(by).push([j, sy - by * img.th]);
    }
    const cols = [...new Set(xs.map((x) => Math.floor(x / img.tw)))];
    const total = groups.size * cols.length;
    let done = 0;
    for (const [by, rows] of groups) {
      for (const bx of cols) {
        if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
        const blk = await block(reader, img, bx, by, band);
        progress?.(++done, total);
        if (!blk) continue;
        for (const [j, ry] of rows) {
          if (ry >= blk.rows) continue;
          for (let i = 0; i < w; i++) {
            const x = xs[i] - bx * img.tw;
            if (x < 0 || x >= img.tw) continue;
            const at = (ry * img.tw + x) * sppIn;
            if (img.alpha >= 0 && img.planar !== 2 && get(blk.dv, (at + img.alpha) * bps, blk.le) === 0) continue; // masked: no data
            const v = get(blk.dv, (at + b) * bps, blk.le);
            out[j * w + i] = img.nodata != null && (v === img.nodata || (Number.isNaN(img.nodata) && Number.isNaN(v))) ? NaN : v * img.scale + img.offset;
          }
        }
      }
    }
    return { data: out, width: w, height: h, from: [img.width, img.height], overview: img !== t.main };
  }

  return { open, readGrid, pick, pixel };
});
