'use strict';
/* Bit2Beat · unit and integrity tests (node --test). Pure modules are tested without a browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const music = require('../src/js/core/music.js');
const stats = require('../src/js/core/stats.js');
const csv = require('../src/js/core/csv.js');
const wav = require('../src/js/core/wav.js');
const spatial = require('../src/js/core/spatial.js');
const adm = require('../src/js/core/adm.js');
const geo = require('../src/js/core/geo.js');
const image = require('../src/js/core/image.js');
const score = require('../src/js/core/score.js');
const feeds = require('../src/js/core/feeds.js');
const plan = require('../src/js/core/plan.js');
const presets = require('../src/js/data/presets.js');
const { SNAPSHOTS } = require('../src/js/data/snapshots.js');

test('music: equal temperament, names, and a monotonic scale mapping that uses every degree', () => {
  assert.equal(music.freq(69), 440);
  assert.ok(Math.abs(music.freq(60) - 261.6256) < 1e-3);
  assert.equal(music.noteName(60), 'C4');
  assert.equal(music.noteName(61, true), 'D♭4');
  assert.equal(music.noteToMidi('A4'), 69);
  assert.equal(music.noteToMidi('Bb3'), 58);
  assert.equal(music.noteToMidi('nonsense'), null);

  for (const scale of Object.keys(music.SCALES)) {
    const notes = music.scaleNotes(scale, 24, 0);
    assert.equal(notes[0], 48);
    assert.equal(notes[notes.length - 1], 72);
    let prev = -Infinity;
    const used = new Set();
    for (let i = 0; i <= 400; i++) {
      const m = music.midi(i / 400, scale, 24, 0);
      assert.ok(m >= prev, `${scale} mapping must never go down`);
      assert.ok(music.SCALES[scale].steps.includes((m - 48) % 12), `${m} must be in ${scale}`);
      prev = m;
      used.add(m);
    }
    assert.equal(used.size, notes.length, `${scale}: every scale note is reachable`);
  }
  // Key transposes the whole range.
  assert.equal(music.midi(0, 'major', 24, 2), 50);
  assert.equal(music.midi(null), null);

  const n = music.normalize([10, null, 20, NaN, 30]);
  assert.deepEqual(n.norm, [0, null, 0.5, null, 1]);
  assert.deepEqual(music.normalize([5, 5]).norm, [0.5, 0.5]);
  assert.deepEqual(music.normalize([15, 20], 10, 30).norm, [0.25, 0.5]);
  assert.equal(music.seconds(125), '2:05');
});

test('stats: trend, robust jumps (no false alarms on smooth or trending data), resampling, summary', () => {
  const t = stats.linearTrend([1, 3, 5, 7, 9]);
  assert.ok(Math.abs(t.slope - 2) < 1e-12);
  assert.ok(Math.abs(t.r2 - 1) < 1e-12);

  const ramp = Array.from({ length: 60 }, (_, i) => 317 + i * 1.6 + (i % 2 ? 0.5 : 0));
  assert.deepEqual(stats.anomalies(ramp), []);
  const sine = Array.from({ length: 48 }, (_, i) => Math.sin((i / 47) * Math.PI * 4));
  assert.deepEqual(stats.anomalies(sine), []);
  const spike = Array.from({ length: 60 }, (_, i) => 14 + i * 0.02 + (i === 30 ? 1.5 : 0));
  const found = stats.anomalies(spike);
  assert.equal(found.length, 1, 'only the spike itself is flagged, not its neighbours');
  assert.equal(found[0].index, 30);
  assert.equal(found[0].direction, 'high');

  const r = stats.resample([1, 2, 3, 4, 5, 6], 3);
  assert.deepEqual(r.values, [1.5, 3.5, 5.5]);
  assert.deepEqual(r.buckets, [[0, 1], [2, 3], [4, 5]]);

  const g = SNAPSHOTS.gistemp.rows;
  const d = stats.describe({ name: 'Anomaly', values: g.map((x) => x[1]), labels: g.map((x) => String(x[0])), unit: '°C', perLabel: 10, perName: 'decade' });
  assert.match(d.sentences[0], /rises/);
  assert.match(d.sentences[1], /1\.28°C at 2024/);

  const tune = stats.autoTune([Array.from({ length: 40 }, (_, i) => i / 39)]);
  assert.equal(tune.scale, 'major', 'a rising series gets a major scale');
  assert.ok(tune.tempo >= 72 && tune.tempo <= 150);
});

test('csv: separators, quotes, decimal commas, label column, units in headers', () => {
  const eu = csv.parseCSV('﻿"Station, ID";Temp;Rain\r\nA;12,5;100\r\nB;;150\r\nC;15,0;200\r\n');
  assert.equal(eu.separator, ';');
  assert.deepEqual(eu.labels, ['A', 'B', 'C']);
  assert.deepEqual(eu.cols[0].values, [12.5, null, 15]);
  assert.equal(eu.missing, 1);

  const yr = csv.parseCSV('Year,Temp (°C),Rain [mm]\n2000,20.1,3\n2001,20.5,\n2002,21,4\n');
  assert.deepEqual(yr.labels, ['2000', '2001', '2002']);
  assert.equal(yr.cols.length, 2, 'the year column is a label, not a sound');
  assert.equal(yr.cols[0].name, 'Temp');
  assert.equal(yr.cols[0].unit, '°C');
  assert.equal(yr.cols[1].unit, 'mm');

  const wide = csv.parseCSV('a,b,c,d,e,f,g,h\n1,2,3,4,5,6,7,8\n2,3,4,5,6,7,8,9\n');
  assert.equal(wide.cols.length, 6);
  assert.equal(wide.skipped, 2);
  assert.throws(() => csv.parseCSV('a\nx\ny'), /numeric/);
});

test('image: lightness is CIE L*, line and radar scans, pointer probe', () => {
  assert.ok(Math.abs(image.lightness(255, 255, 255) - 100) < 0.01);
  assert.equal(image.lightness(0, 0, 0), 0);
  assert.ok(Math.abs(image.lightness(119, 119, 119) - 50) < 0.5, 'sRGB 119 grey is L* ≈ 50');

  // Left half black, right half white.
  const w = 80;
  const h = 40;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x < w / 2 ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  const res = image.scan(px, w, h, { steps: 4, analysis: 'light' });
  assert.deepEqual(res.channels[0].values.map(Math.round), [0, 0, 100, 100]);
  const radar = image.scan(px, w, h, { steps: 4, path: 'radar', analysis: 'light' });
  assert.deepEqual(radar.channels[0].values.map(Math.round), [100, 100, 0, 0], 'radar starts at 12 o’clock and turns clockwise');
  const col = image.scan(px, w, h, { steps: 2, analysis: 'color' });
  assert.deepEqual(col.channels.map((c) => c.values.map(Math.round)), [[0, 255], [0, 255], [0, 255]]);
  assert.equal(Math.round(image.probe(px, w, h, 0.9, 0.5)[0]), 100);

});

test('score: bar-aware accidentals, flats for minor keys, rests and clef choice', () => {
  const bar = new Map();
  assert.equal(score.pitch(61, false, bar), '^C');
  assert.equal(score.pitch(61, false, bar), 'C', 'accidental carries through the bar');
  assert.equal(score.pitch(60, false, bar), '=C', 'natural sign when the letter returns');
  assert.equal(score.pitch(63, true, new Map()), '_E');
  assert.equal(score.pitch(72, false, new Map()), 'c');
  assert.equal(score.pitch(48, false, new Map()), 'C,');
  assert.equal(score.clefFor([40, 43, 45]), 'bass');
  assert.equal(score.clefFor([60, 64, 67]), 'treble');
  const abc = score.tune({ title: 'T', tempo: 100, voices: [{ name: 'A', midis: [60, null, 62] }] });
  assert.match(abc, /Q:1\/4=100/);
  assert.match(abc, /Cz D z5 \|/);
});

test('geo: projection, land mask and swapped-coordinate repair', () => {
  assert.deepEqual(geo.project(0, 0, 360, 180), { x: 180, y: 90 });
  assert.ok(geo.isLand(51.51, -0.13), 'London is land');
  assert.ok(!geo.isLand(0, -150), 'central Pacific is sea');
  const fixed = geo.fixLatLon(-71.36, -41.12, true); // flood in Argentina published as [lon, lat]
  assert.ok(fixed.swapped);
  assert.equal(fixed.lat, -41.12);
  assert.ok(!geo.fixLatLon(51.51, -0.13, true).swapped);
  assert.ok(Math.abs(geo.distanceKm(51.5074, -0.1278, 48.8566, 2.3522) - 344) < 5, 'London–Paris ≈ 344 km');
});

test('feeds: events sweep west to east, latitude = pitch, size = loudness, corrected positions', () => {
  const q = feeds.offline.quakes();
  assert.equal(q.labels.length, SNAPSHOTS.quakes.rows.length);
  for (let i = 1; i < q.points.length; i++) assert.ok(q.points[i].lon >= q.points[i - 1].lon, 'west → east');
  assert.deepEqual(q.times, q.points.map((p) => p.lon), 'map spacing uses longitude');
  assert.deepEqual(q.channels[0].values, q.points.map((p) => p.lat), 'pitch follows latitude');
  assert.ok(q.channels[0].loudness && q.channels[0].loudBy.length === q.points.length && !q.channels[0].invert);

  const e = feeds.offline.eonet();
  for (let i = 1; i < e.points.length; i++) assert.ok(e.points[i].lon >= e.points[i - 1].lon, 'west → east');
  assert.ok(e.channels.some((c) => c.name === 'Wildfires' && c.loudLog));
  assert.match(e.origin.note, /corrected/);
  e.points.forEach((p, i) => {
    if (['floods', 'wildfires'].includes(e.categories[i])) assert.ok(geo.isLandNear(p.lat, p.lon), `${e.details[i]} should be on land`);
  });
  // Acres are converted to hectares.
  assert.ok(Math.abs(feeds.eonetMagnitude(100, 'acres') - 40.4686) < 1e-3);
  assert.ok(!feeds.offline.egypt && !feeds.live.egypt, 'no country-specific feeds');
});

test('plan: shared scales, loudness measure, map spacing, resampling and drone', () => {
  const daily = presets.DATA.arcticDaily();
  const mix = daily.channels.map(() => ({ gain: 0.7, mute: false, solo: false, instrument: 'inherit' }));
  const p = plan.build(daily, mix, { sharedScale: true });
  const [mean, max, min] = p.channels;
  assert.equal(mean.min, max.min, 'all °C channels share one range');
  assert.equal(mean.max, min.max);
  const iso = plan.build(daily, mix, { sharedScale: false });
  assert.notEqual(iso.channels[0].max, iso.channels[1].max);

  const short = plan.build(daily, mix, { length: 30 });
  assert.equal(short.count, 30);
  assert.match(short.labels[0], /2025-01-01 – 2025-01-1\d/);

  const q = feeds.offline.quakes();
  const qp = plan.build(q, [{ gain: 0.7, instrument: 'bass' }], { spacing: 'time' });
  const lats = q.channels[0].values;
  const north = lats.indexOf(Math.max(...lats));
  const south = lats.indexOf(Math.min(...lats));
  assert.ok(qp.channels[0].midi[north] > qp.channels[0].midi[south], 'further north plays higher');
  const mags = q.sizes;
  const big = mags.indexOf(Math.max(...mags));
  const small = mags.indexOf(Math.min(...mags));
  assert.ok(qp.steps[big][0].gain > qp.steps[small][0].gain, 'bigger quakes play louder');
  assert.equal(qp.times[0], 0);
  assert.ok(Math.abs(qp.times[qp.count - 1] - (qp.count - 1) * qp.step) < 1e-9, 'map spacing keeps the total length');
  for (let i = 1; i < qp.count; i++) assert.ok(qp.times[i] >= qp.times[i - 1]);

  const g = presets.DATA.gistemp();
  const gp = plan.build(g, [{ gain: 0.8 }, { gain: 0.6, mute: true }], { drone: 'baseline' });
  assert.equal(gp.drone.value, 0);
  assert.ok(gp.channels[1].active === false);
  assert.equal(plan.stepAt(gp, gp.times[10] + 0.01), 10);
  assert.ok(gp.duration > gp.times[gp.count - 1]);
});

test('wav, spatial and adm: file formats', () => {
  const st = wav.encodeWav({ channels: [new Float32Array([0, 0.5, -0.5, 1, -1]), new Float32Array(5)], sampleRate: 48000, bitDepth: 16 });
  const i16 = wav.inspectWav(st);
  assert.equal(i16.channels, 2);
  assert.equal(i16.frames, 5);
  const mask = spatial.channelMask(spatial.LAYOUTS['7.1.4']);
  assert.equal(mask, 0x2d63f);
  const i24 = wav.inspectWav(wav.encodeWav({ channels: Array.from({ length: 12 }, () => new Float32Array(8)), sampleRate: 48000, bitDepth: 24, channelMask: mask }));
  assert.equal(i24.formatTag, wav.WAVE_FORMAT_EXTENSIBLE);
  assert.equal(i24.channelMask, mask);
  for (const k of ['5.1', '7.1', '7.1.4']) {
    const gains = spatial.pannerGains({ x: -0.6, y: 0.7, z: 0.85 }, spatial.LAYOUTS[k]);
    assert.equal(gains[3], 0, 'no object audio in the LFE');
    assert.ok(Math.abs(Math.hypot(...gains) - 1) < 1e-9, 'constant power');
  }
  const buf = adm.encodeAdmBwf({ tracks: [new Float32Array(480)], sampleRate: 48000, title: 'T', objects: [{ name: 'A', blocks: [{ time: 0, x: -1, y: 0.8, z: 0.2 }] }] });
  const info = wav.inspectWav(buf);
  assert.ok(info.chunks.chna && info.chunks.axml);
  const xml = Buffer.from(buf, info.chunks.axml.offset, info.chunks.axml.size).toString('utf8');
  assert.match(xml, /ITU-R_BS\.2076-2/);
  assert.match(xml, /<cartesian>1<\/cartesian>/);
});

test('page integrity: unique ids, every $(id) exists, every script exists, no leftover AI/3D code', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(fs.existsSync(path.join(root, s)), `missing ${s}`);
  const js = scripts.filter((s) => s.startsWith('src/'));
  for (const rel of js) {
    const code = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const m of code.matchAll(/(?<!\$)\$\('([A-Za-z][\w-]*)'\)/g)) assert.ok(ids.includes(m[1]), `#${m[1]} used in ${rel} is missing from index.html`);
    assert.ok(!/generativelanguage|gemini|api[_-]?key/i.test(code), `${rel} must not call a cloud AI or hold an API key`);
    assert.ok(code.split('\n').length < 700, `${rel} should stay a focused module`);
  }
});

test('build: single-file distribution inlines every script, style and image', () => {
  const out = path.join(root, 'dist', 'Bit2Beat-Studio.html');
  if (!fs.existsSync(out)) return; // run `npm run build` first
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(!/<script src=/.test(html));
  assert.ok(!/<link rel="stylesheet"/.test(html));
  assert.ok(!/src="assets\//.test(html));
  assert.match(html, /worldMap/);
});

test('BitPet notes: 20 offline notes over every topic, sentence-safe excerpts', () => {
  const { NOTES, QUERIES } = require('../src/js/data/nasa-notes.js');
  assert.ok(NOTES.length >= 20);
  for (const t of Object.keys(QUERIES)) assert.ok(NOTES.some((n) => n.topic === t), `offline note for ${t}`);
  assert.equal(new Set(NOTES.map((n) => n.id)).size, NOTES.length);
  global.self = global.self || {};
  self.Bit2Beat = { dom: {} };
  require('../src/js/ui/bitpet.js');
  const { excerpt } = self.Bit2Beat.bitpet;
  const long = 'On Oct. 26, 2015, a magnitude 7.5 earthquake struck the Hindu Kush region of Afghanistan near the border. ' + 'The epicentre was deep below the surface and shaking was felt across several countries in the region. '.repeat(3);
  const e = excerpt(long);
  assert.ok(e.length <= 300 && /\.$/.test(e), 'ends at a full stop');
  assert.ok(e.startsWith('On Oct. 26, 2015, a magnitude 7.5'), 'does not cut at "Oct." or "7.5"');
});
