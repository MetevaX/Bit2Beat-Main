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

test('Bitty’s notes: 20 offline notes over every topic, sentence-safe excerpts', () => {
  const { NOTES, QUERIES } = require('../src/js/data/nasa-notes.js');
  assert.ok(NOTES.length >= 20);
  for (const t of Object.keys(QUERIES)) assert.ok(NOTES.some((n) => n.topic === t), `offline note for ${t}`);
  assert.equal(new Set(NOTES.map((n) => n.id)).size, NOTES.length);
  global.self = global.self || {};
  self.Bit2Beat = { dom: {} };
  require('../src/js/ui/bitty-card.js');
  const { excerpt } = self.Bit2Beat.bittyCard;
  const long = 'On Oct. 26, 2015, a magnitude 7.5 earthquake struck the Hindu Kush region of Afghanistan near the border. ' + 'The epicentre was deep below the surface and shaking was felt across several countries in the region. '.repeat(3);
  const e = excerpt(long);
  assert.ok(e.length <= 300 && /\.$/.test(e), 'ends at a full stop');
  assert.ok(e.startsWith('On Oct. 26, 2015, a magnitude 7.5'), 'does not cut at "Oct." or "7.5"');
});

test('video: two samples per second, content only, motion, colour keys and minimum pitch span', () => {
  const video = require('../src/js/core/video.js');
  assert.deepEqual(video.sampleTimes(4, 4), [0.5, 1.5, 2.5, 3.5]);
  assert.equal(video.stepsFor(51.5), 103);
  assert.equal(video.stepsFor(5), 24, 'at least 24 samples');
  assert.equal(video.stepsFor(1000), 160, 'at most 160 samples');
  assert.throws(() => video.sampleTimes(Infinity));
  assert.throws(() => video.sampleTimes(0));
  assert.throws(() => video.sampleTimes(1, 241));
  assert.ok(Math.abs(video.motionTime(1) - (1 - 1 / 12)) < 1e-9);
  // 20 × 20 frames: black background with a coloured square in the middle
  const W = 20;
  const frame = (rgb, inner = true) => {
    const px = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const on = inner && x >= 6 && x < 14 && y >= 6 && y < 14;
        px[i] = on ? rgb[0] : 0;
        px[i + 1] = on ? rgb[1] : 0;
        px[i + 2] = on ? rgb[2] : 0;
        px[i + 3] = 255;
      }
    return px;
  };
  const white = frame([255, 255, 255]);
  const [L, C, M] = video.measure(white, W, W, white);
  assert.ok(Math.abs(L - 100) < 0.01, 'brightness ignores the black background');
  assert.ok(C < 1, 'white has no colour');
  assert.equal(M, 0, 'no motion between identical frames');
  assert.ok(video.measure(white, W, W, frame([0, 0, 0], false))[2] > 0, 'a change is motion');
  assert.deepEqual(video.measure(frame([0, 0, 0], false), W, W, null).slice(0, 2), [null, null], 'an empty frame is silent');
  assert.equal(video.measure(white, W, W, null)[2], null, 'no motion without a previous frame');
  assert.throws(() => video.measure(white, 1, 1));
  // colour key: green = 0, red = 100
  const key = image.makeKey({ ramp: [[0, 160, 0, 0], [160, 160, 0, 50], [200, 0, 0, 100]], tol: 25 });
  const [v, cover] = video.measure(frame([200, 0, 0]), W, W, null, undefined, key);
  assert.equal(v, 100);
  assert.equal(cover, 100);
  assert.equal(video.measure(frame([0, 160, 0]), W, W, null, undefined, key)[0], 0);
  assert.equal(video.measure(frame([255, 255, 255]), W, W, null, undefined, key)[1], 0, 'white is not on the colour bar');
  // minSpan: a 1-unit wobble stays near one note instead of filling every octave
  const wobble = { name: 'v', kind: 'video', view: 'chart', labels: ['a', 'b'], channels: [{ name: 'Brightness', unit: 'L*', values: [30, 31], minSpan: 20 }] };
  const p1 = plan.build(wobble, [{ gain: 0.7 }], { scale: 'chromatic' });
  assert.ok(Math.abs(p1.channels[0].midi[1] - p1.channels[0].midi[0]) <= 2);
  wobble.channels[0].minSpan = 0;
  const p2 = plan.build(wobble, [{ gain: 0.7 }], { scale: 'chromatic' });
  assert.equal(p2.channels[0].midi[1] - p2.channels[0].midi[0], 24);
});

test('image: background is left out and colour keys read data from a picture', () => {
  const W = 40;
  const H = 20;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = y >= 4 && y < 16 && x >= 4 && x < 36;
      px[i] = inside && x >= 20 ? 200 : 0;
      px[i + 1] = inside && x < 20 ? 160 : 0;
      px[i + 3] = 255;
    }
  assert.deepEqual(image.background(px, W, H), [0, 0, 0]);
  const light = image.scan(px, W, H, { steps: 10 });
  assert.equal(light.channels[0].values[0], null, 'a band of pure background is silent');
  assert.ok(light.channels[0].values[2] > 50, 'content bands are measured');
  const keyed = image.scan(px, W, H, { steps: 10, analysis: 'key', key: { name: 'Height', unit: 'm', ramp: [[0, 160, 0, 0], [200, 0, 0, 50]] } });
  assert.equal(keyed.channels[0].values[2], 0);
  assert.equal(keyed.channels[0].values[7], 50);
  assert.equal(keyed.channels[1].values[7], 100);
});

test('NASA presets: offline video assets, measured channels, CSV and event plans', () => {
  const media = require('../src/js/data/nasa-media.js');
  const vm = require('node:vm');
  const B = { dom: { storage: { get: () => null } }, feeds, presets, nasaMedia: media, nasaKeys: require('../src/js/data/nasa-keys.js') };
  const context = { self: { Bit2Beat: B }, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/ui/sources.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/ui/url-state.js'), 'utf8'), context);
  assert.equal(B.urlState.read('?mode=video&src=co2').mode, 'video');
  assert.equal(B.urlState.DEFAULT_CHOICE.video, 'gedi');
  for (const [id] of B.sources.VIDEO_MENU) {
    const source = B.sources.videoPreset(id);
    assert.equal(source.labels.length, require('../src/js/core/video.js').stepsFor(source.duration), 'two samples per second');
    assert.equal(source.times.length, source.labels.length);
    assert.equal(source.channels.length, 3);
    assert.ok(source.key && source.key.ramp.length > 20, 'presets are read through their colour bar');
    assert.ok(fs.statSync(path.join(root, source.videoUrl)).size > 1000);
    assert.ok(fs.statSync(path.join(root, `assets/nasa/${id}.jpg`)).size > 1000);
    for (const c of source.channels) {
      assert.equal(c.values.length, source.labels.length);
      assert.ok(c.values.filter(Number.isFinite).length > c.values.length * 0.8, `${c.name} mostly measured`);
      assert.ok(new Set(c.values).size > 1);
      const v = c.values.filter(Number.isFinite);
      if (c.unit !== '%' && c.unit !== 'ΔL*') assert.ok(Math.min(...v) >= source.key.min - 1 && Math.max(...v) <= source.key.max + 1, `${c.name} within the colour bar`);
    }
    assert.equal(plan.build(source, [], {}).count, source.labels.length);
    source.channels[0].values[0] = -999;
    assert.notEqual(B.sources.videoPreset(id).channels[0].values[0], -999, 'presets are isolated from edits');
  }
  for (const id of ['sample:eonet', 'sample:quakes']) {
    const source = B.sources.earthSample(id);
    assert.equal(source.origin.live, false);
    assert.ok(plan.build(source, [], {}).count > 0);
  }
  for (const [id, factory] of Object.entries(presets.DATA)) assert.ok(plan.build(factory(), [], {}).count > 0, id);
  const parsed = csv.parseCSV(fs.readFileSync(path.join(root, 'assets/nasa/global-temperature.csv'), 'utf8'));
  assert.deepEqual(presets.DATA.climateCsv().channels.map(c => c.values), parsed.cols.map(c => c.values));
  const built = fs.readFileSync(path.join(root, 'dist/Bit2Beat-Studio.html'), 'utf8');
  assert.match(built, /gediVideo.*data:video\/mp4;base64,/);
  assert.match(built, /co2Video.*data:video\/mp4;base64,/);
});

test('story: every chapter plays a real source and its facts come from the numbers heard', () => {
  const story = require('../src/js/core/story.js');
  const nasaMedia = require('../src/js/data/nasa-media.js');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sources = {
    data: (id) => presets.DATA[id](),
    earth: (id) => feeds.offline[id](),
    video: (id) => nasaMedia[id].source,
  };
  const global = presets.DATA.gistemp();
  assert.equal(story.CHAPTERS.length, 8);
  assert.equal(new Set(story.CHAPTERS.map((c) => c.id)).size, 8, 'unique chapter ids');
  for (const ch of story.CHAPTERS) {
    assert.ok(ch.title && ch.text && ch.listen && ch.kicker, `${ch.id} has words`);
    assert.ok(['happy', 'excited', 'curious', 'joy'].includes(ch.mood));
    assert.ok(html.includes(`data-mode="${ch.scene.mode}"`), `${ch.id}: tab ${ch.scene.mode} exists`);
    const src = sources[ch.scene.mode](ch.scene.src);
    assert.ok(src && src.channels.length, `${ch.id}: source ${ch.scene.src} loads`);
    for (const n of ch.scene.unmute || []) assert.ok(src.channels.some((c) => c.name.startsWith(n)), `${ch.id}: channel ${n} exists`);
    const facts = story.factsFor(ch.id, src, { global });
    assert.ok(facts.length >= 2, `${ch.id}: facts from the data`);
    for (const f of facts) assert.ok(!/NaN|undefined|Infinity/.test(f), `${ch.id}: clean fact “${f}”`);
    assert.equal(story.chapterFor(ch.scene.mode, ch.scene.src), ch);
    assert.ok(!/egypt|cairo|nile/i.test(ch.text + ch.listen + facts.join(' ')), 'no Egypt content');
  }
  // the numbers match the data, not hand-typed text
  const warm = story.factsFor('warming', global).join(' ');
  const rows = SNAPSHOTS.gistemp.rows;
  const top = rows.reduce((a, r) => (r[1] > a[1] ? r : a));
  assert.match(warm, new RegExp(`Warmest year in the record: ${top[0]}, \\+${top[1].toFixed(2)} °C`));
  const arctic = story.factsFor('arctic', presets.DATA.arcticAnnual(), { global }).join(' ');
  const ratio = +/about ([\d.]+) times faster/.exec(arctic)[1];
  assert.ok(ratio > 2 && ratio < 6, `Svalbard warms faster than the globe (${ratio}×)`);
  const dark = SNAPSHOTS.svalbardDaily.series['Sunlight (MJ/m²/day)'].filter((v) => v === 0).length;
  assert.match(story.factsFor('polar', presets.DATA.arcticDaily()).join(' '), new RegExp(`^${dark} days`));
  // live data with gaps or missing channels never breaks a chapter
  assert.deepEqual(story.factsFor('warming', null), []);
  assert.deepEqual(story.factsFor('nope', global), []);
  assert.ok(story.factsFor('quakes', { name: 'x', labels: ['a'], channels: [{ name: 'Earthquakes', values: [null] }] }).length >= 1);
  assert.deepEqual(story.progress({ listen: true, warming: true }), { n: 2, total: 8, done: false });
  assert.equal(story.progress(Object.fromEntries(story.CHAPTERS.map((c) => [c.id, true]))).done, true);
  assert.equal(story.day('2025-03-05'), '5 March');
});

test('tour: spotlight geometry keeps the bubble on screen; every step points at a real control', () => {
  const { placeBubble, dimRects } = require('../src/js/core/spotlight.js');
  const vp = { w: 1280, h: 800, top: 60, bottom: 700 };
  const size = { w: 380, h: 220 };
  const on = (p) => p.x >= 12 && p.x + size.w <= vp.w - 12 && p.y >= 12 && p.y + size.h <= vp.h - 12;
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  assert.equal(placeBubble(null, size, vp).placement, 'center');
  assert.equal(placeBubble(rect(100, 80, 200, 40), size, vp).placement, 'bottom');
  assert.equal(placeBubble(rect(100, 640, 200, 40), size, vp).placement, 'top');
  assert.equal(placeBubble(rect(40, 100, 300, 560), size, vp).placement, 'right');
  for (const r of [rect(0, 0, 1280, 800), rect(1200, 750, 60, 40), rect(-50, 300, 100, 100)]) assert.ok(on(placeBubble(r, size, vp)), 'stays on screen');
  const phone = placeBubble(rect(10, 700, 100, 50), { w: 366, h: 240 }, { w: 390, h: 844 });
  assert.equal(phone.placement, 'dock-top');
  const d = dimRects({ x: 100, y: 50, w: 200, h: 100 }, { w: 800, h: 600 });
  assert.deepEqual(d.t, [0, 0, 800, 50]);
  assert.deepEqual(d.l, [0, 50, 100, 100]);
  assert.deepEqual(d.r, [300, 50, 500, 100]);
  assert.deepEqual(d.b, [0, 150, 800, 450]);

  // every guide step points at something that exists in the page, and every button goes somewhere
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const { TOURS, TIPS } = require('../src/js/data/guide.js');
  for (const [tid, tour] of Object.entries(TOURS)) {
    assert.ok(tour.title && tour.steps.length, `${tid} has steps`);
    for (const st of tour.steps) {
      assert.ok(st.title && st.text && ['happy', 'excited', 'curious', 'joy'].includes(st.mood), `${tid}/${st.id} has words and a mood`);
      if (st.ensure) assert.ok(html.includes(`data-mode="${st.ensure}"`), `${tid}/${st.id}: tab ${st.ensure}`);
      if (st.interactive) assert.ok(st.action && st.done, `${tid}/${st.id}: waits for an action`);
      for (const b of st.buttons || []) assert.ok(['next', 'close', 'hub', 'story', 'help'].includes(b.go) || TOURS[b.go.replace(/^tour:/, '')], `${tid}/${st.id}: ${b.go}`);
      if (!st.target) continue;
      for (const [, id] of st.target.matchAll(/#([\w-]+)/g)) assert.ok(html.includes(`id="${id}"`), `${tid}/${st.id}: #${id} exists`);
      for (const [, cls] of st.target.matchAll(/(?:^|[\s>])\.([\w-]+)/g)) assert.ok(new RegExp(`class="[^"]*\\b${cls}\\b`).test(html), `${tid}/${st.id}: .${cls} exists`);
      for (const [, t] of st.target.matchAll(/aria-labelledby="(\w+)"/g)) assert.ok(html.includes(`aria-labelledby="${t}"`), `${tid}/${st.id}: section ${t}`);
    }
  }
  for (const m of ['data', 'earth', 'image', 'video']) assert.ok(TOURS[m] && TIPS[m], `Bitty explains the ${m} tab`);
  assert.ok(!/BitPet/.test(html + JSON.stringify(TOURS)), 'Bitty is called Bitty everywhere');

  // reading aloud is cut into sentences, so Pause / Resume work everywhere
  self.Bit2Beat = { dom: {} };
  require('../src/js/ui/speech.js');
  const { sentences } = self.Bit2Beat.speech;
  assert.deepEqual(sentences('Svalbard warmed about 3.7 times faster. It is “far north”. Done!'), ['Svalbard warmed about 3.7 times faster.', 'It is “far north”.', 'Done!']);
  assert.ok(sentences('word, '.repeat(80)).every((p) => p.length <= 220), 'long sentences are split');

  const art = require('../src/js/ui/bitty-art.js');
  for (const m of art.MOODS) assert.match(art.dog(m), /^<svg[^>]+mood-/);
  assert.match(art.dog('unknown'), /mood-happy/);
  assert.match(art.badge(false), /not yet earned/);
});
