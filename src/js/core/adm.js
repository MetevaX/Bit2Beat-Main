/**
 * Bit2Beat core · ADM BWF writer (object-based immersive master).
 *
 * Produces a Broadcast-WAV with Audio Definition Model metadata
 * (ITU-R BS.2076-2) in an `axml` chunk plus the `chna` track map
 * (ITU-R BS.2088). Each Bit2Beat channel becomes one mono *Objects* track
 * with time-stamped cartesian positions — the interchange format used by
 * Dolby Atmos production tools (48 kHz, 24-bit PCM, cartesian objects).
 *
 * Bit2Beat is not affiliated with Dolby Laboratories. This file is an ADM
 * master for import into Atmos-capable tools; it is not a Dolby-encoded
 * (E-AC-3 JOC / TrueHD / AC-4) consumer stream.
 */
(function (root, factory) {
  const deps = typeof module === 'object' && module.exports ? { wav: require('./wav.js') } : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).adm = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { wav } = deps;

  const MAX_OBJECTS = 118; // Dolby Atmos master limit for objects (128 tracks minus a 7.1.2 bed)
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');
  const esc = (s) =>
    String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
  const num = (v) => (Math.round(v * 100000) / 100000).toString();

  /** ADM time "hh:mm:ss.zzzzz". */
  function admTime(t) {
    const total = Math.max(0, Math.round(t * 100000));
    const h = Math.floor(total / 360000000);
    const m = Math.floor((total % 360000000) / 6000000);
    const s = Math.floor((total % 6000000) / 100000);
    const f = total % 100000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(5, '0')}`;
  }

  /** IDs for object `i` (0-based). */
  function ids(i) {
    const n = hex(0x1001 + i, 4);
    return {
      object: `AO_${n}`,
      pack: `AP_0003${n}`,
      channel: `AC_0003${n}`,
      stream: `AS_0003${n}`,
      track: `AT_0003${n}_01`,
      uid: `ATU_${hex(i + 1, 8)}`,
      block: (k) => `AB_0003${n}_${hex(k + 1, 8)}`,
    };
  }

  /**
   * Merge consecutive blocks with identical positions and guarantee a
   * contiguous timeline from 0 to `duration`.
   */
  function normaliseBlocks(blocks, duration) {
    const sorted = [...blocks].sort((a, b) => a.time - b.time);
    if (!sorted.length || sorted[0].time > 0) sorted.unshift({ time: 0, x: 0, y: 1, z: 0, gain: 1, ...(sorted[0] || {}), time: 0 });
    const merged = [];
    for (const b of sorted) {
      const last = merged[merged.length - 1];
      if (last && last.x === b.x && last.y === b.y && last.z === b.z && (last.gain ?? 1) === (b.gain ?? 1)) continue;
      if (last && b.time <= last.time) {
        Object.assign(last, b, { time: last.time });
        continue;
      }
      merged.push({ ...b });
    }
    return merged.map((b, k) => ({ ...b, end: k + 1 < merged.length ? merged[k + 1].time : duration }));
  }

  /**
   * Build the ADM XML document.
   * @param {object} o
   * @param {string} o.title
   * @param {number} o.duration  seconds
   * @param {number} [o.sampleRate=48000]
   * @param {number} [o.bitDepth=24]
   * @param {{name:string, blocks:{time:number,x:number,y:number,z:number,gain?:number}[]}[]} o.objects
   */
  function buildAxml({ title, duration, sampleRate = 48000, bitDepth = 24, objects }) {
    if (!objects.length) throw new Error('An ADM file needs at least one object.');
    if (objects.length > MAX_OBJECTS) throw new Error(`ADM export supports up to ${MAX_OBJECTS} objects.`);
    const end = admTime(duration);
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push(
      '<ebuCoreMain xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="urn:ebu:metadata-schema:ebuCore_2016" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" schema="EBU_CORE_20161006.xsd" xml:lang="en">'
    );
    out.push(' <coreMetadata>', '  <format>', '   <audioFormatExtended version="ITU-R_BS.2076-2">');
    out.push(
      `    <audioProgramme audioProgrammeID="APR_1001" audioProgrammeName="${esc(title)}" audioProgrammeLanguage="en" start="00:00:00.00000" end="${end}">`
    );
    out.push('     <audioContentIDRef>ACO_1001</audioContentIDRef>', '    </audioProgramme>');
    out.push(`    <audioContent audioContentID="ACO_1001" audioContentName="${esc(title)}">`);
    objects.forEach((_, i) => out.push(`     <audioObjectIDRef>${ids(i).object}</audioObjectIDRef>`));
    out.push('    </audioContent>');

    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioObject audioObjectID="${id.object}" audioObjectName="${esc(o.name)}" start="00:00:00.00000" duration="${end}">`,
        `     <audioPackFormatIDRef>${id.pack}</audioPackFormatIDRef>`,
        `     <audioTrackUIDRef>${id.uid}</audioTrackUIDRef>`,
        '    </audioObject>'
      );
    });
    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioPackFormat audioPackFormatID="${id.pack}" audioPackFormatName="${esc(o.name)}" typeLabel="0003" typeDefinition="Objects">`,
        `     <audioChannelFormatIDRef>${id.channel}</audioChannelFormatIDRef>`,
        '    </audioPackFormat>'
      );
    });
    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioChannelFormat audioChannelFormatID="${id.channel}" audioChannelFormatName="${esc(o.name)}" typeLabel="0003" typeDefinition="Objects">`
      );
      normaliseBlocks(o.blocks, duration).forEach((b, k) => {
        out.push(
          `     <audioBlockFormat audioBlockFormatID="${id.block(k)}" rtime="${admTime(b.time)}" duration="${admTime(b.end - b.time)}">`,
          '      <cartesian>1</cartesian>',
          `      <position coordinate="X">${num(b.x)}</position>`,
          `      <position coordinate="Y">${num(b.y)}</position>`,
          `      <position coordinate="Z">${num(b.z)}</position>`,
          '      <width>0</width>',
          '      <depth>0</depth>',
          '      <height>0</height>',
          `      <gain>${num(b.gain ?? 1)}</gain>`,
          k ? '      <jumpPosition interpolationLength="0.025">1</jumpPosition>' : '      <jumpPosition>1</jumpPosition>',
          '     </audioBlockFormat>'
        );
      });
      out.push('    </audioChannelFormat>');
    });
    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioStreamFormat audioStreamFormatID="${id.stream}" audioStreamFormatName="PCM_${esc(o.name)}" formatLabel="0001" formatDefinition="PCM">`,
        `     <audioChannelFormatIDRef>${id.channel}</audioChannelFormatIDRef>`,
        `     <audioTrackFormatIDRef>${id.track}</audioTrackFormatIDRef>`,
        '    </audioStreamFormat>'
      );
    });
    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioTrackFormat audioTrackFormatID="${id.track}" audioTrackFormatName="PCM_${esc(o.name)}" formatLabel="0001" formatDefinition="PCM">`,
        `     <audioStreamFormatIDRef>${id.stream}</audioStreamFormatIDRef>`,
        '    </audioTrackFormat>'
      );
    });
    objects.forEach((o, i) => {
      const id = ids(i);
      out.push(
        `    <audioTrackUID UID="${id.uid}" sampleRate="${sampleRate}" bitDepth="${bitDepth}">`,
        `     <audioTrackFormatIDRef>${id.track}</audioTrackFormatIDRef>`,
        `     <audioPackFormatIDRef>${id.pack}</audioPackFormatIDRef>`,
        '    </audioTrackUID>'
      );
    });
    out.push('   </audioFormatExtended>', '  </format>', ' </coreMetadata>', '</ebuCoreMain>', '');
    return out.join('\n');
  }

  /** `chna` chunk payload: track index → UID / track format / pack format. */
  function buildChna(count) {
    const bytes = new Uint8Array(4 + count * 40);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, count, true);
    view.setUint16(2, count, true);
    for (let i = 0; i < count; i++) {
      const id = ids(i);
      const o = 4 + i * 40;
      view.setUint16(o, i + 1, true);
      bytes.set(wav.ascii(id.uid.padEnd(12, '\0')), o + 2);
      bytes.set(wav.ascii(id.track.padEnd(14, '\0')), o + 14);
      bytes.set(wav.ascii(id.pack.padEnd(11, '\0')), o + 28);
      // byte o+39 is padding
    }
    return bytes;
  }

  /**
   * Encode a complete ADM BWF file.
   * @param {object} o
   * @param {Float32Array[]} o.tracks  one mono track per object
   * @param {number} [o.sampleRate=48000]
   * @param {string} o.title
   * @param {{name:string, blocks:object[]}[]} o.objects
   */
  function encodeAdmBwf({ tracks, sampleRate = 48000, title, objects }) {
    if (tracks.length !== objects.length) throw new Error('Each ADM object needs exactly one audio track.');
    const duration = tracks[0].length / sampleRate;
    const xml = buildAxml({ title, duration, sampleRate, bitDepth: 24, objects });
    return wav.encodeWav({
      channels: tracks,
      sampleRate,
      bitDepth: 24,
      chunks: [
        { id: 'chna', data: buildChna(objects.length) },
        { id: 'axml', data: wav.utf8(xml), afterData: true },
      ],
    });
  }

  return { MAX_OBJECTS, admTime, ids, buildAxml, buildChna, encodeAdmBwf, normaliseBlocks };
});
