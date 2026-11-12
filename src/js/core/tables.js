/**
 * Bit2Beat core · smart upload: what kind of file is this, and tables from any spreadsheet.
 *
 * kindOf(name, type) → 'data' | 'image' | 'video' | 'audio' | 'unknown' from the extension
 * (and the MIME type when the extension says nothing).
 * Data files of every common kind become CSV text, so the one CSV reader (core/csv.js) handles
 * them all: CSV / TSV / TXT / DAT, JSON (array of numbers, array of rows or objects, object of
 * columns), GeoJSON (one row per feature), Excel .xlsx / .xlsm and OpenDocument .ods (the first
 * sheet; unzipped with an injected `inflate`, so the browser's DecompressionStream does the work
 * and the tests run in Node).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).tables = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EXT = {
    data: ['csv', 'tsv', 'tab', 'txt', 'dat', 'prn', 'json', 'geojson', 'xlsx', 'xlsm', 'ods'],
    image: ['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'webp', 'gif', 'bmp', 'avif', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif'],
    video: ['mp4', 'm4v', 'webm', 'mov', 'qt', 'ogv', 'ogg', 'mkv', '3gp', '3g2', 'mpeg', 'mpg', 'avi', 'wmv', 'flv', 'ts', 'm2ts'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus', 'oga', 'wma', 'aiff', 'aif'],
  };
  /** Old or closed formats with a clear way out. */
  const SAVE_AS = { xls: 'Excel 97–2003 (.xls)', numbers: 'Apple Numbers', pdf: 'PDF', doc: 'Word', docx: 'Word', pptx: 'PowerPoint' };

  const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

  function kindOf(name, type = '') {
    const ext = extOf(name);
    for (const [kind, list] of Object.entries(EXT)) if (list.includes(ext)) return kind;
    if (/^image\//.test(type)) return 'image';
    if (/^video\//.test(type)) return 'video';
    if (/^audio\//.test(type)) return 'audio';
    if (/csv|tab-separated|json|spreadsheet|text\/plain/.test(type)) return 'data';
    return 'unknown';
  }

  /** A short, helpful message for a file Bit2Beat cannot open. */
  function refusal(name, type = '') {
    const ext = extOf(name);
    const kind = kindOf(name, type);
    if (kind === 'audio') return 'That is a sound file. Bit2Beat makes sound from data: open a data file (CSV, Excel, JSON), a picture or a video.';
    if (SAVE_AS[ext]) return `${SAVE_AS[ext]} files cannot be read here. Save it as CSV or Excel (.xlsx) and open that.`;
    return `Bit2Beat cannot open “.${ext || '?'}” files. Open data (CSV, TSV, TXT, JSON, GeoJSON, Excel .xlsx, OpenDocument .ods), a picture (PNG, JPG, WebP, GIF, BMP, AVIF, SVG…) or a video (MP4, WebM, MOV, MKV…).`;
  }

  // ---------------------------------------------------------------- CSV out
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\n');

  // ---------------------------------------------------------------- JSON and GeoJSON
  /** Rows (first row = header) from parsed JSON; throws a plain message if there is no table in it. */
  function jsonRows(j) {
    if (j && j.type === 'FeatureCollection' && Array.isArray(j.features)) {
      const rows = j.features.map((f) => {
        const p = { ...(f.properties || {}) };
        const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : null;
        if (c) Object.assign(p, { longitude: c[0], latitude: c[1] });
        return p;
      });
      return objectRows(rows);
    }
    // look one level down for the first array (e.g. { data: [...] } or { results: [...] })
    if (j && !Array.isArray(j) && typeof j === 'object') {
      const vals = Object.values(j);
      if (vals.length && vals.every((v) => Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null))) {
        // an object of columns: { year: [...], temp: [...] }
        const keys = Object.keys(j);
        const n = Math.max(...vals.map((v) => v.length));
        return [keys, ...Array.from({ length: n }, (_, i) => keys.map((k) => j[k][i] ?? ''))];
      }
      const inner = vals.find((v) => Array.isArray(v) && v.length) || vals.find((v) => v && typeof v === 'object' && !Array.isArray(v));
      if (inner) return jsonRows(inner);
    }
    if (!Array.isArray(j) || !j.length) throw new Error('This JSON file has no table of numbers in it.');
    if (j.every((v) => typeof v === 'number' || v === null)) return [['value'], ...j.map((v) => [v])];
    if (j.every((r) => Array.isArray(r))) return j.every((r) => r.every((v) => typeof v === 'number' || v === null)) ? [j[0].map((_, i) => `column ${i + 1}`), ...j] : j;
    if (j.every((r) => r && typeof r === 'object')) return objectRows(j);
    throw new Error('This JSON file has no table of numbers in it.');
  }
  function objectRows(list) {
    const keys = [];
    list.forEach((o) => Object.keys(o).forEach((k) => typeof o[k] !== 'object' || o[k] === null ? !keys.includes(k) && keys.push(k) : null));
    if (!keys.length) throw new Error('This file has no columns of numbers in it.');
    return [keys, ...list.map((o) => keys.map((k) => o[k] ?? ''))];
  }

  // ---------------------------------------------------------------- zip (xlsx, ods)
  /** Files of a zip: { name → Uint8Array }. `inflate(bytes)` → Promise<Uint8Array> (raw deflate). */
  async function unzip(bytes, inflate, wanted = () => true) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--)
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) throw new Error('This file is damaged (not a valid spreadsheet).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extra = dv.getUint16(p + 30, true);
      const comment = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extra + comment;
      if (!wanted(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) out[name] = data;
      else if (method === 8) out[name] = await inflate(data);
      else throw new Error('This spreadsheet uses a compression Bit2Beat cannot read. Save it as CSV.');
    }
    return out;
  }

  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
  const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  /** Rows of the first sheet of an .xlsx / .xlsm workbook. */
  async function xlsxRows(bytes, inflate) {
    const files = await unzip(bytes, inflate, (n) => /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(n));
    const dec = new TextDecoder();
    const text = (n) => (files[n] ? dec.decode(files[n]) : '');
    const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    // the first sheet in workbook order
    const first = (text('xl/workbook.xml').match(/<sheet [^>]*r:id="([^"]+)"/) || [])[1];
    const target = first && (text('xl/_rels/workbook.xml.rels').match(new RegExp(`Id="${first}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${first}"`)) || []).slice(1).find(Boolean);
    const sheet = text(target ? 'xl/' + target.replace(/^\/?xl\//, '') : '') || text(Object.keys(files).filter((n) => /worksheets\/sheet\d+\.xml$/.test(n)).sort()[0] || '');
    if (!sheet) throw new Error('This workbook has no sheet with data.');
    const rows = [];
    for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
        const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const body = c[2] || '';
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (t === 's') val = shared[+v] ?? '';
        else if (t === 'inlineStr') val = unescape([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) val = t === 'str' || t === 'e' ? unescape(v) : v;
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows.push(Array.from(row, (v) => v ?? ''));
    }
    return trim(rows);
  }

  /** Rows of the first table of an OpenDocument spreadsheet (.ods). */
  async function odsRows(bytes, inflate) {
    const files = await unzip(bytes, inflate, (n) => n === 'content.xml');
    if (!files['content.xml']) throw new Error('This file is damaged (no content.xml).');
    const xml = new TextDecoder().decode(files['content.xml']);
    const table = (xml.match(/<table:table\b[\s\S]*?<\/table:table>/) || [])[0] || '';
    const rows = [];
    for (const r of table.matchAll(/<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g)) {
      const row = [];
      for (const c of r[2].matchAll(/<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)) {
        const rep = Math.min(50, +((c[1].match(/number-columns-repeated="(\d+)"/) || [])[1] || 1));
        const num = (c[1].match(/office:value="([^"]+)"/) || [])[1];
        const txt = unescape([...(c[2] || '').matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')).join(' '));
        for (let k = 0; k < rep; k++) row.push(num ?? txt);
      }
      const times = Math.min(10000, +((r[1].match(/number-rows-repeated="(\d+)"/) || [])[1] || 1));
      for (let k = 0; k < times && rows.length < 100000; k++) rows.push(row);
    }
    return trim(rows);
  }

  /** Drop empty rows and the empty columns at the right. */
  function trim(rows) {
    const full = rows.filter((r) => r.some((v) => String(v).trim() !== ''));
    if (!full.length) throw new Error('This sheet is empty.');
    const width = Math.max(...full.map((r) => r.map((v) => String(v).trim() !== '').lastIndexOf(true) + 1));
    return full.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  }

  /**
   * Any data file → CSV text for core/csv.js.
   * `read` = { text(): Promise<string>, bytes(): Promise<Uint8Array> }, `inflate` as in unzip().
   */
  async function toCsvText(name, read, inflate) {
    const ext = extOf(name);
    if (ext === 'json' || ext === 'geojson') {
      let j;
      try {
        j = JSON.parse(await read.text());
      } catch {
        throw new Error('This JSON file could not be read (it is not valid JSON).');
      }
      return toCsv(jsonRows(j));
    }
    if (ext === 'xlsx' || ext === 'xlsm') return toCsv(await xlsxRows(await read.bytes(), inflate));
    if (ext === 'ods') return toCsv(await odsRows(await read.bytes(), inflate));
    return read.text();
  }

  return { EXT, extOf, kindOf, refusal, toCsv, jsonRows, unzip, xlsxRows, odsRows, toCsvText };
});
