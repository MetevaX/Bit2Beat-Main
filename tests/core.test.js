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
  assert.equal(tune.scale, 'pent', 'a rising series gets the major pentatonic scale');
  assert.equal(stats.autoTune([Array.from({ length: 40 }, (_, i) => 1 - i / 39)]).scale, 'pentmin', 'a falling one, minor pentatonic');
  for (const [id, m] of Object.entries(music.MOODS)) {
    assert.ok(['pent', 'pentmin'].includes(m.scale), `${id} stays pentatonic`);
    assert.equal(music.moodOf(m), id, `${id} is recognised from its settings`);
  }
  assert.equal(music.moodOf({ ...music.MOODS.sad, tempo: 67 }), '', 'a hand-made change leaves the mood');
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
  const qp = plan.build(q, [{ gain: 0.7, instrument: 'electric' }], { spacing: 'time' });
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
    // AI search runs on the server (api/search.js); page code never calls it directly or holds a key
    assert.ok(!/generativelanguage|api[_-]?key\s*[:=]|AIza[\w-]{20}|AQ\.[\w-]{20}/i.test(code), `${rel} must not call a cloud AI directly or hold an API key`);
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

  // Pause and Resume carry on from the word that was being spoken, not from the beginning
  const spoken = [];
  self.speechSynthesis = { speak: (u) => spoken.push(u), cancel: () => {} };
  self.SpeechSynthesisUtterance = function (text) { this.text = text; };
  self.dispatchEvent = () => true;
  self.Bit2Beat = { dom: { $: () => null, announce: () => {} } };
  delete require.cache[require.resolve('../src/js/ui/speech.js')];
  require('../src/js/ui/speech.js');
  const sp = self.Bit2Beat.speech;
  let ended = '';
  sp.speak('One two three four. Five six.', { owner: 'test', onend: (r) => (ended = r) });
  assert.equal(spoken.at(-1).text, 'One two three four.');
  spoken.at(-1).onboundary({ name: 'word', charIndex: 8 }); // now saying “three”
  sp.pause();
  assert.ok(sp.paused());
  sp.resume();
  assert.equal(spoken.at(-1).text, 'three four.', 'resume starts at the paused word');
  spoken.at(-1).onboundary({ name: 'word', charIndex: 6 }); // “four”, counted inside the shorter text
  sp.pause();
  sp.resume();
  assert.equal(spoken.at(-1).text, 'four.', 'a second pause in the same sentence also keeps its place');
  spoken.at(-1).onend();
  assert.equal(spoken.at(-1).text, 'Five six.', 'then the next sentence');
  sp.pause(); // no word heard yet: start of that sentence
  sp.resume();
  assert.equal(spoken.at(-1).text, 'Five six.');
  spoken.at(-1).onend();
  assert.equal(ended, 'done');
  assert.equal(sp.wordStart('hello world', 8), 6);
  delete self.speechSynthesis;
  delete self.SpeechSynthesisUtterance;
  delete self.dispatchEvent;

  // top to bottom: horizontal bands, labelled by how far down they are, and sound that comes down
  const imgm = require('../src/js/core/image.js');
  const px = new Uint8ClampedArray(10 * 20 * 4).map((_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 40 / 4) * 12));
  const down = imgm.scan(px, 10, 20, { steps: 4, path: 'down', analysis: 'light', background: false });
  assert.deepEqual(down.labels, ['13% down', '38% down', '63% down', '88% down']);
  assert.ok(down.channels[0].values.every((v, i, a) => i === 0 || v > a[i - 1]), 'a picture that gets lighter downwards plays rising notes');
  const spatialm = require('../src/js/core/spatial.js');
  assert.ok(spatialm.objectPosition({ path: 'fall', progress: 0 }).z > spatialm.objectPosition({ path: 'fall', progress: 1 }).z, 'the sound comes down');
  const art = require('../src/js/ui/bitty-art.js');
  for (const m of art.MOODS) assert.match(art.dog(m), /^<svg[^>]+mood-/);
  assert.match(art.dog('unknown'), /mood-happy/);
  assert.match(art.badge(false), /not yet earned/);
});

test('NASA Earth Information Center API: catalogue, layers, area averages and a playable source', async () => {
  const eic = require('../src/js/core/eic.js');
  // a small fake catalogue that answers like earth.gov/eic/api (STAC + raster statistics)
  const col = (id, extra = {}) => ({ id, title: id.toUpperCase(), extent: { temporal: { interval: [['2020-01-01T00:00:00Z', '2020-12-01T00:00:00Z']] } }, renders: { dashboard: { assets: ['flux'] } }, 'dashboard:time_density': 'month', providers: [{ name: 'NASA' }], ...extra });
  const months = Array.from({ length: 12 }, (_, i) => `2020-${String(12 - i).padStart(2, '0')}-01T00:00:00Z`);
  const items = months.flatMap((d) => ['XCO2', 'XCH4'].map((g) => ({ id: `geos_${g}_x1440_daily_${d.slice(0, 7).replace('-', '')}01`, properties: { datetime: d }, assets: { flux: { href: `s3://bucket/${g}/${d}.tif`, roles: ['data'], 'raster:bands': [{ unit: 'ppm', nodata: -9999 }] } } })));
  const calls = [];
  const get = async (url, init = {}) => {
    calls.push([init.method || 'GET', url.replace(/\?.*$/, '')]);
    if (url.includes('/collections?')) return url.includes('offset') ? { collections: [col('aa-flux')], links: [] } : { collections: [col('geos'), col('plume-v1'), col('single', { extent: { temporal: { interval: [['2020-01-01', '2020-01-01']] } } })], links: [{ rel: 'next', href: 'https://x/stac/collections?offset=3' }] };
    if (url.endsWith('/search')) return { features: items.slice(0, init.body.limit) };
    if (url.includes('/cog/statistics')) {
      assert.match(url, /nodata=-9999/, 'nodata from raster:bands is passed on');
      const month = +decodeURIComponent(url).match(/2020-(\d\d)/)[1];
      const base = url.includes('XCH4') ? 1900 : 410;
      const b1 = { mean: base + month, max: base + month + 5, count: 400 };
      return init.body ? { properties: { statistics: { b1 } } } : { b1 };
    }
    throw new Error('unexpected ' + url);
  };
  const list = await eic.listCollections(get, 'https://x/stac/');
  assert.deepEqual(list.map((c) => c.id), ['aa-flux', 'geos'], 'pages are followed; plumes and single maps are left out; sorted by title');
  assert.equal(list[1].asset, 'flux', 'the layer the dashboard shows');
  assert.deepEqual(eic.layerNames(['geos_XCO_x1_20250531', 'geos_XCO2_x1_20250531', 'geos_XCH4_x1_20250531']), ['XCO', 'XCO2', 'XCH4']);
  assert.deepEqual(eic.layerNames(['a_20250101', 'a_20250201']), ['', ''], 'one layer: no names');
  assert.deepEqual(eic.layerNames(['set_2024-12_CO2', 'set_2024-12_CH4']), ['CO2', 'CH4'], 'dates with dashes too');
  assert.deepEqual(eic.area({ lat: 89.5, lon: 10 }).geometry.coordinates[0][2], [11, 90], 'the box stays on the globe');
  assert.equal(eic.area(eic.WORLD), null);
  assert.equal(eic.prettyUnit('g C m-2 day-1'), 'g C m⁻² day⁻¹');
  assert.equal(eic.prettyUnit('ppm'), 'ppm');
  let progress = 0;
  const s = await eic.load({ info: list[1], place: { name: 'London', lat: 51.5, lon: -0.1 }, steps: 6 }, { get, stac: 'https://x/stac', raster: 'https://x/raster', progress: (d) => (progress = d) });
  assert.deepEqual(s.labels, ['2020-07', '2020-08', '2020-09', '2020-10', '2020-11', '2020-12'], 'the latest 6 months, oldest first');
  assert.deepEqual(s.channels.map((c) => c.name), ['XCO2, average', 'XCH4, average', 'XCO2, highest', 'XCH4, highest'], 'one channel per layer');
  assert.deepEqual(s.channels[0].values, [417, 418, 419, 420, 421, 422]);
  assert.equal(s.channels[0].unit, 'ppm');
  assert.ok(s.channels[1].mute && s.channels[2].mute, 'one voice at first');
  assert.equal(progress, 12, '6 dates × 2 layers');
  assert.ok(calls.some(([m, u]) => m === 'POST' && u.endsWith('/raster/cog/statistics')), 'a place is averaged inside its box');
  const w = await eic.load({ info: list[1], place: eic.WORLD, steps: 2 }, { get, stac: 'https://x/stac', raster: 'https://x/raster' });
  assert.match(w.name, /whole world/);
  assert.equal(w.channels[0].values.length, 2);
  // pictures and time-lapses for the Image and Video tabs
  const geosInfo = { ...list[1], asset: 'xco2', rescale: [400, 430], colormap: 'magma' };
  assert.equal(eic.pickLayer(['XCO', 'XCO2', 'XCH4'], geosInfo), 'XCO2', 'the layer the dashboard draws');
  assert.deepEqual(eic.region(eic.WORLD).bbox, [-180, -90, 180, 90]);
  const reg = eic.region({ name: 'Manaus', lat: -3, lon: -60 });
  assert.deepEqual([reg.bbox, reg.width, reg.height], [[-76, -13, -44, 7], 768, 480], 'a 32° × 20° window');
  const url = eic.mapUrl('https://x/raster/', { href: 's3://b/m.tif', bands: { nodata: -9999 } }, geosInfo, reg);
  assert.match(url, /^https:\/\/x\/raster\/cog\/bbox\/-76,-13,-44,7\/768x480\.png\?url=s3%3A%2F%2Fb%2Fm\.tif&rescale=400,430&colormap_name=magma&nodata=-9999$/);
  const cmap = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i, [i, 255 - i, 128, 255]]));
  const key = eic.colorKey(cmap, geosInfo, 'ppm', 'XCO2');
  assert.equal(key.ramp[0][3], 400);
  assert.equal(key.ramp.at(-1)[3], 430);
  const img = require('../src/js/core/image.js');
  assert.ok(Math.abs(img.makeKey(key).valueOf(128, 127, 128) - 415) < 1.5, 'the middle colour reads back as the middle value');
  const tl = await eic.timelapse({ info: list[1], place: eic.WORLD, steps: 4 }, { get, stac: 'https://x/stac', raster: 'https://x/raster' });
  assert.equal(tl.kind, 'video');
  assert.equal(tl.frames.length, 4);
  assert.deepEqual(tl.times, [0.25, 0.75, 1.25, 1.75], 'half a second per map');
  assert.equal(tl.duration, 2);
  assert.match(tl.frames[0], /\/cog\/bbox\/-180,-90,180,90\/720x360\.png/);
  assert.deepEqual(tl.channels[0].values, [419, 420, 421, 422], 'the average of the area in the picture');
  const m = await eic.latestMap({ info: list[1], place: { name: 'London', lat: 51.5, lon: -0.1 } }, { get: async (u, i) => (u.includes('/colorMaps/') ? cmap : get(u, i)), stac: 'https://x/stac', raster: 'https://x/raster' });
  assert.equal(m.date, '2020-12');
  assert.ok(m.key && m.key.ramp.length > 30 && /bbox\/-16\.1,41\.5,15\.9,61\.5\//.test(m.url), 'newest map, a window around the place, and its colour key');
  assert.deepEqual(eic.rangeOf([{ mean: 1900, min: 1895, max: 2096, p2: 1897, p98: 1933 }]), [1897, 1933], 'pictures use the spread of the data in the area');
  assert.deepEqual(eic.rangeOf([{ mean: 0.01, min: 0, max: 6.9, p2: 0, p98: 0 }]), [0, 6.9], 'falls back to min–max when most of the map is one value');
  assert.equal(eic.rangeOf([{ mean: 0, min: 0, max: 0, p2: 0, p98: 0 }]), null, 'one value everywhere: nothing to show');
  const zero = async (url, init) => (url.includes('/cog/statistics') ? { properties: { statistics: { b1: { count: 9, mean: 0, min: 0, max: 0 } } } } : get(url, init));
  await assert.rejects(eic.timelapse({ info: list[1], place: { name: 'Mauna Loa', lat: 19.5, lon: -155.6 }, steps: 3 }, { get: zero, stac: 'https://x/stac', raster: 'https://x/raster' }), /every value of this data set around Mauna Loa is 0/);
  const empty = async (url, init) => (url.includes('/cog/statistics') ? { properties: { statistics: { b1: { count: 0, mean: NaN } } } } : get(url, init));
  await assert.rejects(eic.load({ info: list[1], place: { name: 'Nowhere', lat: 0, lon: 0 }, steps: 3 }, { get: empty, stac: 'https://x/stac', raster: 'https://x/raster' }), /No data for Nowhere/);
});


test('menus: search matches every word (accents ignored) and the list opens below unless the room is above', () => {
  global.self = global.self || {};
  self.Bit2Beat = self.Bit2Beat || {};
  require('../src/js/ui/combo.js');
  const { matches, place, SEARCH_FROM } = self.Bit2Beat.combo;
  assert.ok(matches('São Paulo, Brazil', 'sao pau'));
  assert.ok(matches('MiCASA Net Primary Production (monthly)', 'net monthly'));
  assert.ok(!matches('Methane emissions', 'carbon'));
  assert.ok(SEARCH_FROM > 5 && SEARCH_FROM < 12, 'short menus have no search box');
  const at = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom, left: 10, width: 200 }) });
  const view = { w: 1280, h: 800 };
  assert.equal(place(at(100, 136), 300, view).up, false, 'plenty of room below: opens below');
  assert.equal(place(at(700, 736), 300, view).up, true, 'near the bottom: opens above');
  assert.equal(place(at(700, 736), 40, view).up, false, 'a short list still fits below');
  assert.ok(place(at(100, 136), 300, view).maxHeight <= 380, 'never taller than the window allows');
});

test('Earth Information Center search: keywords, places, Gemini request and answer checks', () => {
  const X = require('../src/js/core/eic-search.js');
  const { PLACES } = require('../src/js/data/snapshots.js');
  const list = [
    { id: 'lpjeosim-wetlandch4-monthgrid-v2', title: 'Wetland Methane Emissions, LPJ-EOSIM Model', text: 'Methane emissions from natural wetlands.', from: '1990-01-01', to: '2024-12-01' },
    { id: 'micasa-carbonflux-monthgrid-v1', title: 'MiCASA Land Carbon Flux', text: 'Net primary production and fire emissions.', from: '2001-01-01', to: '2024-12-01' },
    { id: 'sedac-popdensity-yeargrid5yr-v4.11', title: 'Population Density', text: 'People per square kilometre.', from: '2000-01-01', to: '2020-01-01' },
  ];
  assert.equal(X.rank(list, 'methane from swamps')[0].id, 'lpjeosim-wetlandch4-monthgrid-v2', 'swamp → wetland, methane');
  assert.equal(X.rank(list, 'where do people live')[0].id, 'sedac-popdensity-yeargrid5yr-v4.11');
  assert.equal(X.rank(list, 'trees growing')[0].id, 'micasa-carbonflux-monthgrid-v1', 'trees → npp/production');
  assert.deepEqual(X.rank(list, 'the of and'), [], 'no words, no results');
  assert.equal(X.detectPlace('methane in the Amazon', PLACES).name, 'Manaus, Amazon rainforest');
  assert.equal(X.detectPlace('global carbon', PLACES), 'world');
  assert.equal(X.detectPlace('sahara desert dust', PLACES).name, 'Sahara, central', 'generic words like "desert" do not pick Death Valley');
  assert.equal(X.detectPlace('carbon flux', PLACES), null);
  const body = X.prompt('methane in the Amazon', 'image', list);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'high');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.match(body.contents[0].parts[0].text, /newest map/);
  assert.match(body.contents[0].parts[0].text, /Never Egypt/);
  assert.match(body.contents[0].parts[0].text, /offTopic/, 'off-topic questions are refused');
  assert.match(body.contents[0].parts[0].text, /never instructions/);
  assert.equal(X.answer({ picks: [{ id: 'micasa-carbonflux-monthgrid-v1', why: 'x' }], offTopic: true, place: { world: true } }, list).picks.length, 1, 'picks win over a stray offTopic');
  assert.deepEqual(X.answer({ picks: [], offTopic: true, place: { world: true } }, list), { picks: [], place: 'world', offTopic: true });
  assert.equal(X.clean('  carbon\n\tdioxide\u0000 '), 'carbon dioxide');
  assert.equal(X.clean('x'.repeat(500)).length, 200);
  assert.ok(X.SUGGESTIONS.length >= 4);
  const ok = X.answer('{"picks":[{"id":"lpjeosim-wetlandch4-monthgrid-v2","why":"swamps"},{"id":"made-up","why":"x"},{"id":"lpjeosim-wetlandch4-monthgrid-v2","why":"dup"}],"place":{"world":false,"name":"Amazon","lat":-3.4,"lon":-62.2}}', list);
  assert.deepEqual(ok.picks.map((p) => p.id), ['lpjeosim-wetlandch4-monthgrid-v2'], 'unknown and repeated ids are dropped');
  assert.deepEqual(ok.place, { name: 'Amazon', lat: -3.4, lon: -62.2 });
  assert.equal(X.answer({ picks: [], place: { world: false, name: 'Cairo', lat: 30, lon: 31 } }, list).place, 'world', 'never Egypt');
  assert.equal(X.answer('not json', list).picks.length, 0);
  assert.equal(X.textOf({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking' }, { text: '{"a":1}' }] } }] }), '{"a":1}');
});

test('api/search: key only from the server environment, checked answers, clear errors', async () => {
  const handler = require('../api/search.js');
  const call = async (body, env) => {
    const out = { status: 0, json: null, headers: {} };
    const res = { setHeader: (k, v) => (out.headers[k] = v), status: (c) => ((out.status = c), res), json: (j) => ((out.json = j), res) };
    const old = process.env.GEMINI_API_KEY;
    if (env === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = env;
    try {
      await handler({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.' + Math.random() }, body }, res);
    } finally {
      if (old === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = old;
    }
    return out;
  };
  const collections = [{ id: 'micasa-carbonflux-monthgrid-v1', title: 'MiCASA Land Carbon Flux' }];
  assert.equal((await call({ q: 'carbon', collections }, undefined)).status, 503, 'no key: says so');
  {
    const out = { status: 0, json: null };
    const res = { setHeader() {}, status: (c) => ((out.status = c), res), json: (j) => ((out.json = j), res) };
    process.env.GEMINI_API_KEY = 'k';
    await handler({ method: 'POST', headers: { origin: 'https://someone-else.example', host: 'bit2beat.vercel.app' }, body: { q: 'carbon', collections } }, res);
    delete process.env.GEMINI_API_KEY;
    assert.equal(out.status, 403, 'other websites cannot use the AI search');
  }
  const realFetch = global.fetch;
  let sent = null;
  global.fetch = async (url, init) => {
    sent = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"picks":[{"id":"micasa-carbonflux-monthgrid-v1","why":"carbon"}],"place":{"world":true}}' }] } }] }) };
  };
  try {
    const r = await call({ q: 'carbon over the world', mode: 'video', collections }, 'test-key');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.picks, [{ id: 'micasa-carbonflux-monthgrid-v1', why: 'carbon' }]);
    assert.equal(r.json.place, 'world');
    assert.match(sent.url, /models\/gemini-3\.8-flash:generateContent$/);
    assert.equal(sent.init.headers['x-goog-api-key'], 'test-key', 'the key goes in a header, never the URL');
    assert.equal((await call({ q: '', collections }, 'test-key')).status, 400);
    // busy model: retried, then an older Flash model answers
    const tried = [];
    global.fetch = async (url) => {
      tried.push(url.match(/models\/([^:]+)/)[1]);
      if (url.includes('gemini-3.8-flash')) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"picks":[],"place":{"world":true}}' }] } }] }) };
    };
    const busy = await call({ q: 'carbon', collections }, 'test-key');
    assert.equal(busy.status, 200);
    assert.deepEqual(tried, ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash']);
    assert.equal(busy.json.model, 'gemini-3.6-flash');
    // a real error (bad key) is not retried
    tried.length = 0;
    global.fetch = async (url) => (tried.push(url), { ok: false, status: 403, json: async () => ({ error: { message: 'bad key' } }) });
    const bad = await call({ q: 'carbon', collections }, 'test-key');
    assert.equal(bad.status, 502);
    assert.equal(tried.length, 1);
    assert.match(bad.json.error, /403: bad key/);
  } finally {
    global.fetch = realFetch;
  }
});

test('readings as Excel: a real .xlsx (zip with workbook, sheets, styles)', () => {
  const X = require('../src/js/core/xlsx.js');
  assert.equal(X.crc32(new TextEncoder().encode('hello')).toString(16), '3610a686');
  assert.deepEqual([X.col(0), X.col(25), X.col(26), X.col(701)], ['A', 'Z', 'AA', 'ZZ']);
  const bytes = X.workbook([{ name: 'Readings', rows: [['Step', 'Value'], [1, 0.5], [2, 'a < b & c']] }, { name: 'Readings', rows: [['x']] }]);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'zip signature');
  const text = new TextDecoder().decode(bytes);
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(text.includes(part), part);
  assert.ok(text.includes('<v>0.5</v>'), 'numbers stay numbers');
  assert.ok(text.includes('a &lt; b &amp; c'), 'text is escaped');
  assert.ok(text.includes('name="Readings 2"'), 'sheet names stay unique');
});

test('Earth events: natural events and earthquakes in one west-to-east sweep', () => {
  const s = feeds.offline.events();
  const e = feeds.offline.eonet();
  const q = feeds.offline.quakes();
  assert.equal(s.labels.length, e.labels.length + q.labels.length, 'every event and every earthquake');
  assert.equal(s.feed, 'events');
  const quake = s.channels.find((c) => /Earthquakes/.test(c.name));
  assert.ok(quake && quake.instrument === 'electric', 'earthquakes are one more channel (electric piano)');
  assert.equal(quake.values.filter((v) => v != null).length, q.labels.length);
  for (let i = 1; i < s.times.length; i++) assert.ok(s.times[i] >= s.times[i - 1], 'west to east');
  s.labels.forEach((_, i) => assert.equal(s.channels.filter((c) => c.values[i] != null).length, 1, 'one channel per event'));
  assert.equal(feeds.quakeFeedFor(7), '4.5_week');
  assert.equal(feeds.quakeFeedFor(30), '4.5_month');
  const only = feeds.combineEvents(e, null, 't', { source: 'x' });
  assert.match(only.origin.note, /USGS earthquakes were not reachable/);
});

test('sound set: six instruments (violin, no organ/bass/synth), drums are opt-in, motion plays', () => {
  const engine = require('../src/js/audio/engine.js');
  assert.deepEqual(Object.values(engine.instruments).map((i) => i.name), ['Piano', 'Electric piano', 'Guitar', 'Marimba', 'Flute', 'Violin']);
  assert.ok(engine.instruments.strings.vibrato, 'the violin has vibrato');
  assert.equal(typeof engine.drumStep, 'function');
  assert.equal(plan.DEFAULTS.drums, false, 'drums are off until switched on');
  const v = require('../src/js/core/video.js');
  assert.ok(!v.channels().find((c) => c.name === 'Motion').mute, 'motion is heard by default');
  const media = require('../src/js/data/nasa-media.js');
  for (const k of ['gedi', 'co2']) {
    assert.ok(!media[k].source.channels.find((c) => c.name === 'Motion').mute);
    assert.match(media[k].source.origin.url, /^https:\/\/earth\.gov\//, 'View original source opens the Earth Information Center');
  }
  for (const c of Object.values(feeds.EONET_CATEGORIES)) assert.ok(engine.instruments[c.instrument], `${c.name} uses an instrument that exists`);
});

test('image: Follow pointer reads the colour key under the pointer (raw key definitions too)', () => {
  const key = { name: 'Height', unit: 'm', ramp: [[255, 0, 0, 0], [0, 0, 255, 10]] };
  const w = 20;
  const h = 10;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    px.set(x < 10 ? [0, 0, 0, 255] : [0, 0, 255, 255], i * 4); // left: black background, right: data (10 m)
  }
  const right = image.probe(px, w, h, 0.85, 0.5, 'key', key);
  assert.ok(right && Math.abs(right[0] - 10) < 0.5, 'the value under the pointer');
  const left = image.probe(px, w, h, 0.1, 0.5, 'key', key);
  assert.ok(!left || !Number.isFinite(left[0]), 'no value where the picture shows no data');
});

