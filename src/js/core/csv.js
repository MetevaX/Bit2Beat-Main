/**
 * Bit2Beat core · CSV parsing.
 *
 * Supports quoted fields, escaped quotes ("") and comma / semicolon / tab
 * separators. Numeric columns (≥ 2 valid readings and ≥ 50 % valid rows)
 * become channels; missing or invalid readings become `null` (silence). A date / year / name
 * column becomes the step labels, and a unit in brackets ("Temp (°C)") becomes the channel unit.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).csv = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ maxRows: 2000, maxColumns: 100, maxChannels: 6, maxBytes: 2 * 1024 * 1024 });
  const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;

  /** Count separator occurrences outside quotes in a single line. */
  function countOutsideQuotes(line, sep) {
    let n = 0;
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) n++;
    }
    return n;
  }

  function detectSeparator(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    let best = ',';
    let bestCount = -1;
    for (const sep of [',', ';', '\t']) {
      const n = countOutsideQuotes(firstLine, sep);
      if (n > bestCount) {
        best = sep;
        bestCount = n;
      }
    }
    return best;
  }

  /** Split CSV text into trimmed rows of cells (blank rows removed). */
  function tokenize(text, sep) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const endRow = () => {
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        row.push(cell.trim());
        cell = '';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        endRow();
      } else cell += ch;
    }
    if (quoted) throw new Error('A quoted cell is not closed. Please check your CSV.');
    endRow();
    return rows;
  }

  /** Parse a numeric cell; returns `null` for blanks, text, NaN, ±Infinity. */
  function toNumber(s, sep) {
    if (typeof s !== 'string') return null;
    let t = s.trim();
    if (sep === ';' && DECIMAL_COMMA.test(t)) t = t.replace(',', '.');
    if (!DECIMAL.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Parse CSV text.
   * @returns {{cols:{name:string,values:(number|null)[]}[], missing:number, count:number, skipped:number, separator:string}}
   */
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const separator = detectSeparator(text);
    const rows = tokenize(text, separator);
    if (rows.length < 2) throw new Error('Add at least two rows of numbers to the CSV.');

    const hasHeader = rows[0].some((s) => s !== '' && toNumber(s, separator) == null);
    const headers = hasHeader ? rows.shift() : rows[0].map((_, i) => 'Column ' + (i + 1));
    if (rows.length < 2) throw new Error('The CSV needs at least two data rows.');
    if (rows.length > LIMITS.maxRows)
      throw new Error(`Bit2Beat supports up to ${LIMITS.maxRows.toLocaleString('en')} data rows. Please use a smaller CSV.`);
    if (headers.length >= LIMITS.maxColumns) throw new Error(`Please use a CSV with fewer than ${LIMITS.maxColumns} columns.`);

    // A label column (dates, years, station names) is used for captions instead of being sonified.
    const LABEL_HEADER = /^(year|yr|date|time|day|month|week|timestamp|datetime|period|station|name|place|city|location)$/i;
    let labelIndex = headers.findIndex((h) => LABEL_HEADER.test(String(h).trim()));
    if (labelIndex < 0) {
      // A first column of increasing whole numbers between 1000 and 3000 is almost certainly a year.
      const first = rows.map((r) => toNumber(r[0] ?? '', separator));
      const years = first.every((v, i) => v != null && Number.isInteger(v) && v >= 1000 && v <= 3000 && (i === 0 || v > first[i - 1]));
      if (years) labelIndex = 0;
      else if (rows.every((r) => toNumber(r[0] ?? '', separator) == null && (r[0] ?? '') !== '')) labelIndex = 0;
    }
    const labels = labelIndex >= 0 ? rows.map((r, i) => String(r[labelIndex] ?? '').trim() || `row ${i + 1}`) : rows.map((_, i) => `row ${i + 1}`);

    const numeric = [];
    headers.forEach((h, i) => {
      if (i === labelIndex) return;
      const values = rows.map((r) => toNumber(r[i] ?? '', separator));
      const valid = values.filter((v) => v != null).length;
      if (valid >= Math.max(2, rows.length * 0.5)) {
        const name = String(h || 'Column ' + (i + 1)).trim();
        const unit = (name.match(/[([]\s*([^)\]]{1,16})\s*[)\]]\s*$/) || [])[1] || '';
        numeric.push({ name: unit ? name.replace(/\s*[([][^)\]]*[)\]]\s*$/, '') : name, unit, values });
      }
    });
    if (!numeric.length) throw new Error('No numeric columns found. Use numbers without unit text in the cells.');

    const cols = numeric.slice(0, LIMITS.maxChannels);
    const missing = cols.reduce((n, c) => n + c.values.filter((v) => v == null).length, 0);
    return {
      cols,
      labels,
      labelName: labelIndex >= 0 ? headers[labelIndex] : '',
      missing,
      count: rows.length,
      skipped: numeric.length - cols.length,
      separator,
    };
  }

  return { LIMITS, parseCSV, detectSeparator, toNumber };
});
