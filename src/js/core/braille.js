/**
 * Bit2Beat core · the score as braille music, for blind musicians (pure, no DOM).
 *
 * Written in braille music code (Music Braille Code; the same cells are used across English
 * braille): each data reading is one eighth note, eight to a 4/4 bar, one part per channel.
 *   notes     C D E F G A B  = cells d e f g h i j (dots 145, 15, 124, 1245, 125, 24, 245);
 *             eighth notes as they are, quarter + dot 6, half + dot 3, whole + dots 3 and 6
 *   rests     eighth ⠭ (1346), quarter ⠧ (1236), half ⠥ (136), whole ⠍ (134)
 *   octaves   marks ⠈ ⠘ ⠸ ⠐ ⠨ ⠰ ⠠ for octaves 1–7 (4 = middle C), written on the first note of a
 *             part and of every braille line, and after a leap: always for a sixth or more, for a
 *             fourth or fifth only when the octave changes
 *   accidentals sharp ⠩ (146), flat ⠣ (126), natural ⠡ (16); they last to the end of the bar
 *   bars      a space between bars; ⠣⠅ double bar at the end; time signature ⠼⠙⠲ (4/4)
 * Headings are uncontracted (grade 1) English braille. The file is BRF (Braille Ready Format:
 * North American Braille ASCII, 40 cells × 25 lines a page) for embossers and braille displays;
 * the same text is also given in Unicode braille.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).braille = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // North American Braille ASCII: the character for each cell (index = dots as bits: dot n → 1 << n-1)
  const ASCII = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";
  const cell = (...dots) => dots.reduce((b, d) => b | (1 << (d - 1)), 0);
  const WIDTH = 40;
  const LINES = 25;

  // ---------------------------------------------------------------- music
  const LETTER = { C: [1, 4, 5], D: [1, 5], E: [1, 2, 4], F: [1, 2, 4, 5], G: [1, 2, 5], A: [2, 4], B: [2, 4, 5] };
  const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const VALUE = { 8: [], 4: [6], 2: [3], 1: [3, 6] };
  const REST = { 8: cell(1, 3, 4, 6), 4: cell(1, 2, 3, 6), 2: cell(1, 3, 6), 1: cell(1, 3, 4) };
  const OCTAVE = { 1: [cell(4)], 2: [cell(4, 5)], 3: [cell(4, 5, 6)], 4: [cell(5)], 5: [cell(4, 6)], 6: [cell(5, 6)], 7: [cell(6)], 0: [cell(4), cell(4)], 8: [cell(6), cell(6)] };
  const ACC = { 1: cell(1, 4, 6), '-1': cell(1, 2, 6), 0: cell(1, 6) };
  const SHARP = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const FLAT = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
  const TIME_4_4 = [cell(3, 4, 5, 6), cell(1, 4, 5), cell(2, 5, 6)];
  const DOUBLE_BAR = [cell(1, 2, 6), cell(1, 3)];

  /** Letter, accidental, octave and diatonic number of a MIDI note. */
  function spell(m, flats) {
    const pc = ((m % 12) + 12) % 12;
    const [letter, acc] = (flats ? FLAT : SHARP)[pc];
    const octave = Math.floor(m / 12) - 1;
    return { letter, acc, octave, diatonic: octave * 7 + STEP[letter] };
  }

  /** Does this note need an octave mark after `prev` (null = first note of a part or line)? */
  function needsOctave(prev, cur) {
    if (!prev) return true;
    const interval = Math.abs(cur.diatonic - prev.diatonic) + 1; // 1 = unison, 2 = second …
    if (interval >= 6) return true;
    if (interval >= 4) return cur.octave !== prev.octave;
    return false;
  }

  /**
   * One part as bars of cells: midis = one per eighth (null = rest).
   * Returns [[cells of bar 1], [cells of bar 2], …], each bar with its notes' spellings for octave marks
   * (the marks at the start of lines are added when the lines are laid out).
   */
  function bars(midis, { flats = false } = {}) {
    const out = [];
    for (let b = 0; b * 8 < Math.max(1, midis.length); b++) {
      const slice = midis.slice(b * 8, b * 8 + 8);
      while (slice.length < 8) slice.push(null); // the last bar is filled with rests
      const items = []; // { rest, cells (without octave), note }
      const accs = new Map(); // letter+octave → accidental in force in this bar
      // rests on the beat are joined: two eighths → a quarter, a whole silent bar → a whole rest
      if (slice.every((m) => m == null)) items.push({ cells: [REST[1]] });
      else
        for (let i = 0; i < 8; i++) {
          const m = slice[i];
          if (m == null) {
            if (i % 2 === 0 && slice[i + 1] == null) {
              items.push({ cells: [REST[4]] });
              i++;
            } else items.push({ cells: [REST[8]] });
            continue;
          }
          const n = spell(m, flats);
          const id = n.letter + n.octave;
          const cells = [];
          const current = accs.has(id) ? accs.get(id) : 0;
          if (n.acc !== current) {
            cells.push(ACC[n.acc]);
            accs.set(id, n.acc);
          }
          cells.push(cell(...LETTER[n.letter], ...VALUE[8]));
          items.push({ cells, note: n });
        }
      out.push(items);
    }
    return out;
  }

  // ---------------------------------------------------------------- text (uncontracted, grade 1)
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  const LETTER_DOTS = [[1], [1, 2], [1, 4], [1, 4, 5], [1, 5], [1, 2, 4], [1, 2, 4, 5], [1, 2, 5], [2, 4], [2, 4, 5], [1, 3], [1, 2, 3], [1, 3, 4], [1, 3, 4, 5], [1, 3, 5], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 5], [2, 3, 4], [2, 3, 4, 5], [1, 3, 6], [1, 2, 3, 6], [2, 4, 5, 6], [1, 3, 4, 6], [1, 3, 4, 5, 6], [1, 3, 5, 6]];
  const PUNCT = { '.': [cell(2, 5, 6)], ',': [cell(2)], ':': [cell(2, 5)], ';': [cell(2, 3)], '-': [cell(3, 6)], '?': [cell(2, 3, 6)], '!': [cell(2, 3, 5)], '/': [cell(5), cell(3, 4)], '%': [cell(4, 6), cell(3, 5, 6)], '(': [cell(5), cell(1, 2, 6)], ')': [cell(5), cell(3, 4, 5)], "'": [cell(3)], '’': [cell(3)] };
  /** Words → cells, with capital, number and letter signs. Unknown symbols are left out. */
  function text(str) {
    const out = [];
    let inNumber = false;
    const chars = [...String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[₂]/g, '2').replace(/[·•–—]/g, '-')];
    // a word of two or more capitals (NASA, GIBS) takes the capital word sign once
    const caps = new Set();
    chars.join('').replace(/[A-Za-z]+/g, (w, at) => {
      if (w.length > 1 && w === w.toUpperCase()) for (let i = 0; i < w.length; i++) caps.add(at + i);
      return w;
    });
    for (const [i, ch] of chars.entries()) {
      const lower = ch.toLowerCase();
      const k = LETTERS.indexOf(lower);
      if (/[0-9]/.test(ch)) {
        if (!inNumber) out.push(cell(3, 4, 5, 6));
        inNumber = true;
        out.push(cell(...LETTER_DOTS[(+ch + 9) % 10]));
        continue;
      }
      if (ch === '.' && inNumber) {
        out.push(cell(2, 5, 6)); // decimal point keeps the number going
        continue;
      }
      if (k >= 0) {
        if (inNumber && k < 10 && ch === lower) out.push(cell(5, 6)); // a-j right after a number: letter sign
        if (caps.has(i)) {
          if (!caps.has(i - 1)) out.push(cell(6), cell(6));
        } else if (ch !== lower) out.push(cell(6));
        out.push(cell(...LETTER_DOTS[k]));
      } else if (ch === ' ') out.push(0);
      else if (PUNCT[ch]) out.push(...PUNCT[ch]);
      inNumber = false;
    }
    return out;
  }

  // ---------------------------------------------------------------- layout
  /** Lines of words (arrays of cells) wrapped at 40 cells. */
  function wrap(cells) {
    const lines = [];
    let line = [];
    let word = [];
    const flush = () => {
      if (line.length && line.length + 1 + word.length > WIDTH) (lines.push(line), (line = []));
      if (word.length) line = line.length ? [...line, 0, ...word] : word.slice(0, WIDTH);
      word = [];
    };
    cells.forEach((c) => (c === 0 ? flush() : word.push(c)));
    flush();
    if (line.length) lines.push(line);
    return lines;
  }

  /** Music lines for one part: bars kept whole, octave mark on the first note of every line. */
  function musicLines(partBars) {
    const lines = [];
    let line = [];
    let prev = null; // the last note written (for octave marks)
    const render = (items, startOfLine) => {
      const out = [];
      let p = startOfLine ? null : prev;
      for (const it of items) {
        if (it.note) {
          const marks = needsOctave(p, it.note) ? OCTAVE[Math.max(0, Math.min(8, it.note.octave))] : [];
          // an accidental comes before the octave mark
          const acc = it.cells.length > 1 ? [it.cells[0]] : [];
          out.push(...acc, ...marks, it.cells[it.cells.length - 1]);
          p = it.note;
        } else out.push(...it.cells);
      }
      return { out, last: p };
    };
    partBars.forEach((items, b) => {
      let r = render(items, !line.length);
      const lastBar = b === partBars.length - 1;
      const tail = lastBar ? DOUBLE_BAR : [];
      if (line.length && line.length + 1 + r.out.length + tail.length > WIDTH) {
        lines.push(line);
        line = [];
        r = render(items, true); // a new line starts with an octave mark again
      }
      line = line.length ? [...line, 0, ...r.out, ...tail] : [...r.out, ...tail];
      prev = r.last;
    });
    if (line.length) lines.push(line);
    return lines;
  }

  const toUnicode = (line) => line.map((c) => String.fromCharCode(0x2800 + c)).join('');
  const toAscii = (line) => line.map((c) => ASCII[c]).join('');

  /**
   * The whole score.
   * @param {object} o
   * @param {string} o.title
   * @param {string} [o.subtitle]
   * @param {number} [o.tempo]
   * @param {{name:string, midis:(number|null)[]}[]} o.voices  one per channel, one MIDI note (or null) per eighth
   * @param {boolean} [o.flats]
   * @returns {{ brf: string, unicode: string, lines: number, pages: number }}
   */
  function score({ title = 'Bit2Beat', subtitle = '', tempo = 96, voices = [], flats = false }) {
    const lines = [];
    const add = (cells) => lines.push(...wrap(cells));
    add(text(title));
    if (subtitle) add(text(subtitle));
    add(text(`Tempo ${Math.round(tempo)} quarter notes a minute. Each reading is one eighth note, 8 to a bar.`));
    lines.push([]);
    voices.forEach((v, k) => {
      add(text(voices.length > 1 ? `Part ${k + 1}: ${v.name}` : v.name));
      const music = musicLines(bars(v.midis, { flats }));
      music[0] = [...TIME_4_4, 0, ...music[0]];
      if (music[0].length > WIDTH) music.splice(0, 1, TIME_4_4, music[0].slice(TIME_4_4.length + 1));
      lines.push(...music);
      lines.push([]);
    });
    // BRF pages of 25 lines, separated by a form feed
    const pages = [];
    for (let i = 0; i < lines.length; i += LINES) pages.push(lines.slice(i, i + LINES));
    return {
      brf: pages.map((p) => p.map(toAscii).join('\r\n')).join('\r\n\f') + '\r\n',
      unicode: lines.map(toUnicode).join('\n') + '\n',
      lines: lines.length,
      pages: pages.length,
    };
  }

  return { ASCII, cell, spell, needsOctave, bars, text, wrap, musicLines, score, toUnicode, toAscii, WIDTH };
});
