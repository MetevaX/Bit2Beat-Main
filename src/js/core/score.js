/**
 * Bit2Beat core · ABC music notation.
 *
 * Every step is an eighth note (L:1/8) at the playback tempo, 4/4 time, eight steps per bar.
 * Accidentals follow standard engraving rules: an accidental lasts until the end of its bar, so
 * a natural sign is written when the same letter returns without it. Flat-key scales are spelled
 * with flats. The clef (treble or bass) is chosen from the median pitch of the voice.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).score = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [letter, accidental(-1|0|1)] for each pitch class, sharp and flat spellings.
  const SHARP = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const FLAT = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];

  /** ABC text for one MIDI note; `bar` remembers accidentals already written in the current bar. */
  function pitch(m, flats, bar) {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    const [letter, acc] = (flats ? FLAT : SHARP)[pc];
    const id = letter + oct;
    const current = bar.has(id) ? bar.get(id) : 0;
    let mark = '';
    if (acc !== current) {
      mark = acc === 1 ? '^' : acc === -1 ? '_' : '=';
      bar.set(id, acc);
    }
    let text = oct >= 5 ? letter.toLowerCase() : letter;
    if (oct > 5) text += "'".repeat(oct - 5);
    if (oct < 4) text += ','.repeat(4 - oct);
    return mark + text;
  }

  const clefFor = (midis) => {
    const f = midis.filter((m) => m != null).sort((a, b) => a - b);
    if (!f.length) return 'treble';
    return f[f.length >> 1] < 57 ? 'bass' : 'treble';
  };

  /** Body (notes and bar lines) for one voice. */
  function body(midis, { flats = false, barsPerLine = 4 } = {}) {
    let out = '';
    let bar = new Map();
    midis.forEach((m, i) => {
      out += m == null ? 'z' : pitch(m, flats, bar);
      const pos = (i % 8) + 1;
      if (pos % 2 === 0 && pos !== 8) out += ' ';
      if (pos === 8) {
        bar = new Map();
        out += ' |';
        if (((i + 1) / 8) % barsPerLine === 0 && i + 1 < midis.length) out += '\n';
        else if (i + 1 < midis.length) out += ' ';
      }
    });
    const rest = midis.length % 8;
    if (rest) out += ` z${8 - rest} |`;
    if (!midis.length) out = 'z8 |';
    return out;
  }

  const safe = (t) => String(t ?? '').replace(/[\r\n"\\%]/g, ' ').slice(0, 70);

  /**
   * Full ABC tune.
   * @param {object} o
   * @param {string} o.title
   * @param {number} o.tempo  quarter-notes per minute
   * @param {{name:string, midis:(number|null)[]}[]} o.voices
   * @param {boolean} [o.flats]
   * @param {string} [o.subtitle]
   */
  function tune({ title = 'Bit2Beat', subtitle = '', tempo = 96, voices = [], flats = false, barsPerLine = 4, showTempo = true }) {
    let abc = `X:1\n${title ? 'T:' + safe(title) + '\n' : ''}${subtitle ? 'C:' + safe(subtitle) + '\n' : ''}M:4/4\nL:1/8\n${showTempo ? 'Q:1/4=' + Math.round(tempo) + '\n' : ''}`;
    if (voices.length > 1) abc += `%%score [${voices.map((_, i) => 'V' + (i + 1)).join(' ')}]\n`;
    voices.forEach((v, i) => (abc += `V:V${i + 1}${v.name ? ` name="${safe(v.name)}"` : ''} clef=${clefFor(v.midis)}\n`));
    abc += 'K:C\n';
    voices.forEach((v, i) => (abc += `[V:V${i + 1}] ${body(v.midis, { flats, barsPerLine })}\n`));
    return abc;
  }

  return { pitch, body, tune, clefFor };
});
