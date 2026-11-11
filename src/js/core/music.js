/**
 * Bit2Beat core · music theory helpers.
 *
 * A normalised value v ∈ [0, 1] becomes a note in three steps:
 *   1. list every note of the chosen key + scale between the base note and base + range;
 *   2. pick index round(v · (n − 1)) in that list;
 *   3. convert the MIDI number to Hz with equal temperament (A4 = 440 Hz).
 * Using the index (not "nearest semitone") keeps the mapping monotonic and gives every
 * scale degree an equal share of the value range, so equal steps in the data sound like
 * equal steps in the melody.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).music = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Semitone offsets from the tonic. `flats` = spell accidentals as flats in the score. */
  const SCALES = Object.freeze({
    pent: { name: 'Pentatonic', steps: [0, 2, 4, 7, 9], flats: false },
    pentmin: { name: 'Pent. minor', steps: [0, 3, 5, 7, 10], flats: true },
    major: { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], flats: false },
    minor: { name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10], flats: true },
    dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], flats: true },
    harmonic: { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], flats: true },
    blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10], flats: true },
    hijaz: { name: 'Hijaz (maqam)', steps: [0, 1, 4, 5, 7, 8, 10], flats: true },
    chromatic: { name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], flats: false },
  });

  const KEYS = Object.freeze(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']);
  const NOTE_NAMES = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
  const FLAT_NAMES = Object.freeze(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']);

  /** Lowest note of the mapping when the key is C (C3). */
  const BASE_MIDI = 48;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /** Equal-tempered frequency of a MIDI note (A4 = MIDI 69 = 440 Hz). */
  const freq = (m) => 440 * 2 ** ((m - 69) / 12);

  /** Scientific pitch name: 60 → "C4". */
  function noteName(m, flats = false) {
    const pc = ((m % 12) + 12) % 12;
    return (flats ? FLAT_NAMES : NOTE_NAMES)[pc] + (Math.floor(m / 12) - 1);
  }

  /** "C4", "G#5", "Bb3", "F♯2" → MIDI number (null when it cannot be read). */
  function noteToMidi(name) {
    const m = String(name ?? '').trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)$/);
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
    return (parseInt(m[3], 10) + 1) * 12 + base + acc;
  }

  /** All MIDI notes of `scale` in `key` from the base note up to base + range semitones. */
  function scaleNotes(scale = 'pent', range = 24, key = 0) {
    const steps = (SCALES[scale] || SCALES.pent).steps;
    const lo = BASE_MIDI + (((key % 12) + 12) % 12);
    const out = [];
    for (let m = lo; m <= lo + range; m++) if (steps.includes((m - lo) % 12)) out.push(m);
    return out;
  }

  const noteCache = new Map();
  /** Map a normalised value to a note (see file header). `null` stays `null` (a rest). */
  function midi(v, scale = 'pent', range = 24, key = 0) {
    if (v == null || !Number.isFinite(v)) return null;
    const id = scale + '|' + range + '|' + key;
    let notes = noteCache.get(id);
    if (!notes) noteCache.set(id, (notes = scaleNotes(scale, range, key)));
    return notes[Math.round(clamp(v) * (notes.length - 1))];
  }

  /**
   * Min/max normalisation. Non-finite values become `null` (silence).
   * Pass `lo`/`hi` to normalise against a shared range (e.g. several channels in °C).
   * A constant series maps to 0.5.
   */
  function normalize(values, lo, hi) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) min = max = 0;
    if (Number.isFinite(lo)) min = lo;
    if (Number.isFinite(hi)) max = hi;
    const span = max - min;
    return {
      min,
      max,
      norm: values.map((v) => (Number.isFinite(v) ? (span > 0 ? clamp((v - min) / span) : 0.5) : null)),
    };
  }

  /** "m:ss" for a duration in seconds. */
  function seconds(n) {
    const s = Math.max(0, Math.round(Number(n) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** 3-band EQ presets in dB (low shelf 110 Hz, peak 1 kHz, high shelf 4.2 kHz). */
  const EQ_PRESETS = Object.freeze({
    flat: { low: 0, mid: 0, high: 0 },
    warm: { low: 3.5, mid: 0.5, high: -2.5 },
    bright: { low: -1.5, mid: 1.5, high: 4.5 },
    bass: { low: 6, mid: -1, high: 1 },
  });

  /**
   * Sound moods: one click sets scale, key, tempo, instrument, range, room and tone. Every mood
   * stays pentatonic, so any data sounds consonant: sad is minor pentatonic, happy and excited major.
   */
  const MOODS = Object.freeze({
    sad: { name: 'Sad', scale: 'pentmin', key: 9, range: 24, tempo: 66, instrument: 'strings', room: 0.45, eq: 'warm', hint: 'minor pentatonic in A, slow strings in a big warm room' },
    happy: { name: 'Happy', scale: 'pent', key: 0, range: 24, tempo: 112, instrument: 'marimba', room: 0.2, eq: 'bright', hint: 'major pentatonic in C, marimba at a walking pace' },
    excited: { name: 'Excited', scale: 'pent', key: 7, range: 36, tempo: 160, instrument: 'electric', room: 0.12, eq: 'bright', hint: 'major pentatonic in G over three octaves, fast electric piano' },
  });

  /** The mood these settings are in, or '' once anything was changed by hand. */
  function moodOf(s) {
    const hit = Object.entries(MOODS).find(([, m]) => ['scale', 'key', 'range', 'tempo', 'instrument'].every((k) => m[k] === s[k]));
    return hit ? hit[0] : '';
  }

  return { SCALES, KEYS, NOTE_NAMES, BASE_MIDI, EQ_PRESETS, MOODS, moodOf, clamp, freq, noteName, noteToMidi, scaleNotes, midi, normalize, seconds };
});
