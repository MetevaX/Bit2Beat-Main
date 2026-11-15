/**
 * Bit2Beat ui · everything about one piece in one ZIP: the score (whole-piece PNG, ABC, braille),
 * the notes (CSV), the readings (Excel), and the settings with a link that opens this exact view.
 * Record and Export add the video and the sound to it.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { slug } = B.dom;
  const enc = new TextEncoder();

  /** ZIP ("stored": no compression, so a large video costs no time) built from parts, as a Blob. */
  function zipBlob(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const le = (n, v) => {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (v >>> (8 * i)) & 255;
      return b;
    };
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = B.xlsx.crc32(data);
      const common = [le(2, 20), le(2, 0x0800), le(2, 0), le(2, time), le(2, date), le(4, crc), le(4, data.length), le(4, data.length), le(2, name.length), le(2, 0)];
      const head = [le(4, 0x04034b50), ...common];
      parts.push(...head, name, data);
      central.push(le(4, 0x02014b50), le(2, 20), ...common, le(2, 0), le(2, 0), le(2, 0), le(4, 0), le(4, offset), name);
      offset += head.reduce((n, b) => n + b.length, 0) + name.length + data.length;
    }
    const size = central.reduce((n, b) => n + b.length, 0);
    const end = [le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, files.length), le(2, files.length), le(4, size), le(4, offset), le(2, 0)];
    return new Blob([...parts, ...central, ...end], { type: 'application/zip' });
  }

  const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

  /** What the settings were, as people (and the app, from the link) read them. */
  function settingsText(app) {
    const p = app.plan;
    const s = p.settings;
    const m = B.music;
    const opt = (id) => document.querySelector(`#${id} option:checked`)?.textContent || '';
    const on = p.channels.filter((c) => c.active).map((c) => c.name);
    const lines = [
      'Bit2Beat · ' + app.src.name,
      '',
      `Source: ${app.src.origin?.source || ''}${app.src.origin?.url ? ' · ' + app.src.origin.url : ''}`,
      `Steps: ${p.count} (${p.labels[0] ?? ''} – ${p.labels[p.count - 1] ?? ''}), ${m.seconds(p.duration)} long`,
      `Tempo: ${s.tempo} BPM, one step = one eighth note`,
      `Key and scale: ${m.KEYS?.[s.key] || ''} ${m.SCALES[s.scale]?.name || s.scale}`,
      `Instrument: ${opt('instrument') || s.instrument}`,
      `Channels on: ${on.join(', ')}`,
      `Sound: ${opt('output') || app.state.audio.output}, room ${Math.round((app.state.audio.room ?? 0) * 100)}%`,
      '',
      'Open this exact view again:',
      location.href,
      '',
      `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC with Bit2Beat (bit2beat.vercel.app) · NASA Space Apps 2026`,
    ];
    return lines.join('\r\n');
  }

  /**
   * The files that describe the piece. `extra`: [{name, blob|data}] to add first (the video, the sound).
   * @returns {Promise<Blob>} the ZIP
   */
  async function build(app, extra = []) {
    const p = app.plan;
    const base = slug(app.src.name);
    const files = [];
    for (const f of extra) files.push({ name: f.name, data: f.data || (await bytesOf(f.blob)) });
    try {
      for (const pic of await B.scoreView.scorePictures(p)) files.push({ name: 'score/' + pic.name, data: await bytesOf(pic.blob) });
    } catch {
      /* the ABC and braille scores below still describe every note */
    }
    files.push({ name: `score/${base}.abc`, data: enc.encode(B.scoreView.fullAbc(p)) });
    files.push({ name: `score/${base}-braille-music.brf`, data: enc.encode(B.scoreView.brailleOf(p).brf) });
    files.push({ name: `data/${base}-notes.csv`, data: enc.encode('﻿' + B.dialogs.planCsv(p)) });
    files.push({ name: `data/${base}-readings.xlsx`, data: B.dialogs.planXlsx(p) });
    files.push({ name: 'settings.txt', data: enc.encode(settingsText(app)) });
    return zipBlob(files);
  }

  B.bundle = { zipBlob, build, settingsText };
})(typeof self !== 'undefined' ? self : this);
