/**
 * Bit2Beat ui · the Export dialog. Everything is made with the settings you have now (instrument,
 * tempo, mood, channels, sound output): nothing to choose before downloading.
 *   Download video  – the whole piece as MP4 with the sound (ui/video-export.js)
 *   Download audio  – WAV in your sound output (stereo, binaural; surround and ADM for scientific maps)
 *   Everything      – one ZIP: video, audio, the whole score (PNG, ABC, braille), notes, readings, settings
 * Other formats and single files are under "Other formats and files".
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, download, slug, toast } = B.dom;
  const { music } = B;
  const SURROUND = ['5.1', '7.1', '7.1.4', 'adm'];

  function init(app) {
    const F = B.exporter.FORMATS;
    let busy = null; // AbortController while working

    const allowed = (fmt) => !!F[fmt] && (!SURROUND.includes(fmt) || !!app.src?.science);
    /** The audio format your current settings ask for. */
    function audioFormat() {
      const out = app.state.prefs.mono ? 'stereo' : app.state.audio.output;
      if (allowed(out)) return out;
      return out === 'stereo' ? 'stereo' : 'binaural'; // surround outside scientific maps: keep the 3D sound for headphones
    }
    const fileName = (fmt) => `${slug(app.src.name)}-${fmt === 'adm' ? 'adm-bwf' : fmt.replace(/\./g, '')}.wav`;

    function fill() {
      const p = app.plan;
      const opt = (id) => document.querySelector(`#${id} option:checked`)?.textContent || '';
      $('exportSummary').textContent = `${app.src.name} · ${p.count} steps · ${music.seconds(p.duration)} · ${p.channels.filter((c) => c.active).length} channel(s) on`;
      const fmt = audioFormat();
      const want = app.state.audio.output;
      $('exportUses').textContent = `With your settings now: ${[opt('instrument'), `${p.settings.tempo} BPM`, B.music.SCALES[p.settings.scale]?.name, opt('output') || want].filter(Boolean).join(' · ')}.`;
      $('exportAudioWhat').textContent = F[fmt].label + (fmt !== want && !app.state.prefs.mono ? ` (${want} is for scientific maps)` : '');
      $('exportVideoWhat').textContent = B.videoExport.supported() ? `MP4 · 1080p · ${fmt === 'binaural' ? 'binaural' : 'stereo'} sound` : 'Plays the piece once and records it (this browser has no fast video encoder)';
      // other formats: only the ones this source can make
      const sel = $('exportFormat');
      sel.replaceChildren(...Object.entries(F).filter(([k]) => allowed(k)).map(([k, v]) => new Option(v.label, k)));
      sel.value = fmt;
      describe();
    }
    function describe() {
      const v = $('exportFormat').value;
      $('exportHint').textContent = F[v].detail + (v === 'adm' ? '. For Dolby Atmos tools such as the Dolby Atmos Renderer, Pro Tools, Logic Pro, Nuendo or DaVinci Resolve. Bit2Beat is not affiliated with Dolby.' : '.') + (app.src?.science ? '' : ' Surround and ADM masters are made for scientific maps.');
    }

    const status = (t) => ($('exportStatus').textContent = t);
    function working(on, label = '') {
      ['exportVideo', 'exportAudio', 'exportAll', 'exportAudioAs'].forEach((id) => ($(id).disabled = on));
      $('exportProgress').hidden = !on;
      $('exportBar').value = 0;
      app.setExporting(on);
      if (on) status(label);
    }
    const progress = (f, t) => {
      $('exportBar').value = f;
      status(t);
    };

    async function audioFile(fmt) {
      const res = await B.exporter.render(app.plan, fmt, { ...app.state.audio, mono: app.state.prefs.mono });
      return { name: fileName(fmt), blob: new Blob([res.bytes], { type: 'audio/wav' }), res };
    }

    async function run(label, job) {
      if (busy) return;
      busy = new AbortController();
      working(true, label);
      await new Promise((r) => setTimeout(r, 30));
      try {
        await job(busy.signal);
      } catch (e) {
        status(e.name === 'AbortError' ? 'Stopped.' : e.message || String(e));
      } finally {
        busy = null;
        working(false);
      }
    }

    // ------------------------------------------------------------ the three main buttons
    $('exportVideo').onclick = () => {
      if (!B.videoExport.supported()) {
        // real time: play from the start and record; Record saves the ZIP when the piece ends
        $('exportDialog').close();
        app.seek(0);
        $('recBtn').click();
        return;
      }
      run('Getting ready…', async (signal) => {
        const v = await B.videoExport.render(app, { signal, onProgress: progress });
        download(v.blob, v.name);
        status(`Saved ${v.name} (${music.seconds(v.seconds)}, 1080p, ${v.audio} sound).`);
      });
    };
    $('exportAudio').onclick = () =>
      run('Rendering the sound…', async () => {
        const a = await audioFile(audioFormat());
        download(a.blob, a.name);
        status(`Saved ${a.name} (${music.seconds(a.res.seconds)}${a.res.objects ? `, ${a.res.objects} objects` : ''}).`);
      });
    $('exportAll').onclick = () =>
      run('Getting ready…', async (signal) => {
        const extra = [];
        let note = '';
        if (B.videoExport.supported()) {
          try {
            const v = await B.videoExport.render(app, { signal, onProgress: (f, t) => progress(f * 0.85, t) });
            extra.push({ name: v.name, blob: v.blob });
          } catch (e) {
            if (e.name === 'AbortError') throw e;
            note = ` No video: ${e.message}`;
          }
        } else note = ' No video: this browser records video only in real time (use Record).';
        progress(0.9, 'Rendering the sound…');
        const a = await audioFile(audioFormat());
        extra.push({ name: a.name, blob: a.blob });
        progress(0.95, 'Writing the score, braille, notes and settings…');
        const zip = await B.bundle.build(app, extra);
        download(zip, `${slug(app.src.name)}-bit2beat.zip`);
        status(`Saved ${slug(app.src.name)}-bit2beat.zip: ${extra.map((x) => x.name).join(', ')}, the whole score (PNG, ABC, braille), notes, readings and settings.${note}`);
      });
    $('exportCancel').onclick = () => busy?.abort();

    // ------------------------------------------------------------ other formats and files
    $('exportFormat').onchange = describe;
    $('exportAudioAs').onclick = () =>
      run('Rendering…', async () => {
        const a = await audioFile($('exportFormat').value);
        download(a.blob, a.name);
        status(`Saved ${a.name} (${music.seconds(a.res.seconds)}${a.res.objects ? `, ${a.res.objects} objects` : ''}).`);
      });
    $('exportCsv').onclick = () => {
      download(new Blob(['﻿' + B.dialogs.planCsv(app.plan)], { type: 'text/csv;charset=utf-8' }), slug(app.src.name) + '-notes.csv');
      status('Notes saved as CSV (every step, value, note, frequency and 3D position).');
    };
    $('exportAbc').onclick = () => {
      B.scoreView.downloadAbc(app.plan);
      status('Score saved as ABC notation (opens in MuseScore with an ABC import plugin, or abcjs.net).');
    };
    $('exportPng').onclick = async () => {
      status('Engraving the whole score…');
      await B.scoreView.downloadPng(app.plan);
      status('The whole score saved as a picture.');
    };
    $('exportBraille').onclick = () => status(B.dialogs.braille(app));

    $('exportBtn').onclick = () => {
      if (!app.plan) return;
      if (!busy) status('');
      fill();
      $('exportDialog').showModal();
    };
    $('exportDialog').addEventListener('close', () => busy && toast('The export keeps going; open Export to see how far it is.'));
  }

  B.exportView = { init };
})(typeof self !== 'undefined' ? self : this);
