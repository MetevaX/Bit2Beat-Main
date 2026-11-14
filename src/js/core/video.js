/**
 * Bit2Beat core · video analysis (pure functions over RGBA frames; no decoding here).
 *
 * A video is sampled at evenly spaced moments (two per second, 24–160 samples). For each sample
 * three things are measured over the picture's *content* – the empty, flat-coloured background
 * around a globe or a title card is left out (see image.background):
 *
 *   Brightness – mean CIE L* of the content (0 = black, 100 = white).
 *   Colour     – mean chroma C*ab of the content. NASA visualisations encode their data in colour
 *                (forest height in greens, CO₂ in a colour ramp), so more data colour = higher note.
 *   Motion     – mean |ΔL*| between the sample and the frame 1/12 s before it: how fast the picture
 *                is moving or changing at that moment (rotation, flows, scene cuts).
 *
 * With a colour key (the visualisation's own colour bar, see image.makeKey) the first two
 * channels read the data back out of the picture instead: the mean data value shown on screen
 * (e.g. forest height in metres, CO₂ in ppm) and how much of the picture shows data.
 *
 * Each sample is the real frame at that time; nothing is interpolated.
 */
(function (root, factory) {
  const mod = factory(typeof module === 'object' && module.exports ? require('./image.js') : root.Bit2Beat.image);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).video = mod;
})(typeof self !== 'undefined' ? self : this, function (image) {
  'use strict';

  /** Seconds between a sample and the frame used to measure motion. */
  const MOTION_GAP = 1 / 12;

  /** How many samples to take: two per second, at least 24 and at most 160. */
  function stepsFor(duration) {
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video must have a finite, positive duration.');
    return Math.max(24, Math.min(160, Math.round(duration * 2)));
  }

  /** Sample moments: the middle of each of `steps` equal slices (never past the last frame). */
  function sampleTimes(duration, steps = stepsFor(duration)) {
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video must have a finite, positive duration.');
    if (!Number.isInteger(steps) || steps < 2 || steps > 240) throw new Error('Choose between 2 and 240 video samples.');
    return Array.from({ length: steps }, (_, i) => (duration * (i + 0.5)) / steps);
  }

  /**
   * Anti-aliasing: a sample stands for its whole slice of the video, so it is the average of
   * `k` moments spread evenly over the slice (not one frame). Without this, a picture that pulses
   * faster than two times a second (the CO₂ day–night cycle) would be heard as a false, slower
   * rhythm. Returns, for each sample, the moments to measure.
   */
  function windowTimes(duration, steps = stepsFor(duration), k = 4) {
    const slice = duration / steps;
    return Array.from({ length: steps }, (_, i) => Array.from({ length: k }, (_, j) => slice * (i + (j + 0.5) / k)));
  }
  /** Average several measurements of one sample, channel by channel, ignoring missing values. */
  function average(rows) {
    return rows[0].map((_, j) => {
      const v = rows.map((r) => r[j]).filter((x) => x != null && Number.isFinite(x));
      return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
    });
  }

  /** Moment of the motion reference frame for a sample (clamped to the start). */
  const motionTime = (t) => Math.max(0, t - MOTION_GAP);

  /**
   * Measure one sample. `before` is the frame MOTION_GAP seconds earlier (same size) or null.
   * `key` is a prepared colour key (image.makeKey) or null.
   * Returns three numbers (see channels()); null where the frame has (almost) no content.
   */
  function measure(px, w, h, before = null, bg = undefined, key = null) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || px.length !== w * h * 4 || (before && before.length !== px.length))
      throw new Error('Invalid video frame dimensions.');
    const back = bg === undefined ? image.background(px, w, h) : bg;
    let n = 0;
    let sumL = 0;
    let sumC = 0;
    let hit = 0;
    let sumV = 0;
    let moved = 0;
    let mn = 0;
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i += 4) {
        if (key && image.ignored(key, x, y, w, h)) continue;
        const content = !image.isBackground(px, i, back);
        if (before && (content || !image.isBackground(before, i, back))) {
          moved += Math.abs(image.lightness(px[i], px[i + 1], px[i + 2]) - image.lightness(before[i], before[i + 1], before[i + 2]));
          mn++;
        }
        if (!content) continue;
        n++;
        if (key) {
          const v = key.valueOf(px[i], px[i + 1], px[i + 2]);
          if (!Number.isNaN(v)) {
            hit++;
            sumV += v;
          }
        } else {
          const [L, a, b] = image.lab(px[i], px[i + 1], px[i + 2]);
          sumL += L;
          sumC += Math.hypot(a, b);
        }
      }
    const enough = n >= Math.max(3, w * h * 0.01);
    const r2 = (v) => +v.toFixed(2);
    const motion = before && mn ? r2(moved / mn) : null;
    if (key) return [enough && hit >= Math.max(2, n * 0.002) ? r2(sumV / hit) : null, enough ? +((hit / n) * 100).toFixed(1) : null, motion];
    return [enough ? r2(sumL / n) : null, enough ? r2(sumC / n) : null, motion];
  }

  /**
   * Channels for a measured video (with or without a colour key). `minSpan` keeps small, real
   * changes small in pitch: a range narrower than this never stretches over every octave.
   */
  function channels(key = null) {
    const motion = { name: 'Motion', unit: 'ΔL*', minSpan: 3, instrument: 'marimba', hint: 'How fast the picture changes at that moment (mean lightness change over 1/12 s).' };
    if (key)
      return [
        { name: key.name, unit: key.unit, minSpan: (key.max - key.min) / 4, instrument: 'soft', hint: `Mean ${/^[A-Z][a-z]/.test(key.name) ? key.name.toLowerCase() : key.name} shown on screen, read from the visualisation's colour bar (${key.min}–${key.max} ${key.unit}).` },
        { name: key.coverName, unit: '%', minSpan: 10, instrument: 'strings', mute: true, hint: 'Share of the picture that shows data colours. Muted at first; press M to hear it.' },
        motion,
      ];
    return [
      { name: 'Brightness', unit: 'L*', minSpan: 20, instrument: 'soft', hint: 'Mean lightness of the picture, background left out (CIE L*).' },
      { name: 'Colour', unit: 'C*', minSpan: 20, instrument: 'strings', hint: 'How colourful the picture is (mean CIELAB chroma). Visualisations draw their data in colour.' },
      motion,
    ];
  }

  return { MOTION_GAP, stepsFor, sampleTimes, windowTimes, average, motionTime, measure, channels };
});
