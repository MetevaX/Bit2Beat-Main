#!/usr/bin/env node
/*
 * Regenerate src/js/data/nasa-media.js from the bundled NASA EIC preview videos.
 * Requires ffmpeg and ffprobe. Uses the same pure measurement code as uploaded videos
 * (src/js/core/video.js), so a preset and the same file opened in the browser sound the same.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const video = require('../src/js/core/video.js');
const image = require('../src/js/core/image.js');
const KEYS = require('../src/js/data/nasa-keys.js');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/nasa/sources.json'), 'utf8'));
const W = 160;
const H = 90;
const descriptions = {
  gedi: {
    name: 'GEDI forest height',
    credit: 'NASA Scientific Visualization Studio · Kel Elkins',
    note: 'Forest-height visualization using GEDI lidar observations from April 2019–April 2020; taller forest is drawn higher and greener.',
  },
  co2: {
    name: 'Global carbon dioxide',
    credit: 'NASA Scientific Visualization Studio · AJ Christensen; science: Lesley Ott',
    note: 'DYAMOND / GEOS model visualization of atmospheric CO₂ during January–March 2020; higher concentrations are drawn in brighter colours.',
  },
};

const out = {};
for (const item of manifest) {
  const input = path.join(root, `assets/nasa/${item.id}.mp4`);
  const probe = (entry) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entry, '-of', 'default=noprint_wrappers=1:nokey=1', input], { encoding: 'utf8' }).trim();
  const duration = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { encoding: 'utf8' });
  const [num, den] = probe('stream=r_frame_rate').split('/').map(Number);
  const fps = num / (den || 1);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-vf', `scale=${W}:${H}`, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'], { maxBuffer: 512 * 1024 * 1024 });
  const stride = W * H * 4;
  const count = Math.floor(raw.length / stride);
  const frameAt = (t) => raw.subarray(Math.min(count - 1, Math.floor(t * fps)) * stride, (Math.min(count - 1, Math.floor(t * fps)) + 1) * stride);

  const times = video.sampleTimes(duration);
  const bg = image.background(frameAt(duration / 2), W, H); // one background for the whole video
  const keyDef = KEYS[item.id];
  const key = keyDef ? image.makeKey(keyDef) : null;
  const channels = video.channels(keyDef).map((c) => ({ ...c, values: [] }));
  // every frame of each slice is measured and averaged (anti-aliasing, see video.windowTimes)
  const perSlice = Math.max(1, Math.round((duration / times.length) * fps));
  for (const moments of video.windowTimes(duration, times.length, perSlice)) {
    const rows = moments.map((t) => video.measure(frameAt(t), W, H, frameAt(video.motionTime(t)), bg, key));
    video.average(rows).forEach((v, j) => channels[j].values.push(v));
  }
  const desc = descriptions[item.id];
  out[item.id] = {
    duration: +duration.toFixed(3),
    source: {
      name: 'NASA EIC · ' + desc.name,
      kind: 'video',
      view: 'chart',
      labels: times.map((t) => `${t.toFixed(1)} s`),
      times,
      duration: +duration.toFixed(3),
      key: item.id,
      channels,
      origin: {
        source: desc.credit,
        url: item.page,
        live: false,
        fetched: '',
        note: `${desc.note} ${times.length} samples, two per second, each the average of every frame in its half second; values are read from the visualisation's own colour bar.`,
      },
    },
  };
  console.log(`${item.id}: ${times.length} samples over ${duration.toFixed(1)} s, background ${bg ? bg.join(',') : 'none'}`);
}
fs.writeFileSync(
  path.join(root, 'src/js/data/nasa-media.js'),
  `/* Derived from the bundled NASA EIC/SVS previews by scripts/prepare-nasa-media.js. Do not edit by hand. */\n(function (root) {\n  const data = ${JSON.stringify(out)};\n  if (typeof module === 'object' && module.exports) module.exports = data;\n  else (root.Bit2Beat = root.Bit2Beat || {}).nasaMedia = data;\n})(typeof self !== 'undefined' ? self : this);\n`,
);
console.log('Wrote src/js/data/nasa-media.js');
