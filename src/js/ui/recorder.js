/**
 * Bit2Beat ui · Record: captures what you see and hear while it plays, then saves one ZIP with
 * the video of the take (picture, cursor, melody and sound), the sound alone, the whole score
 * (PNG pages, ABC, braille), the notes, the readings and the settings with a link back.
 * Recording uses the browser's own codecs in real time (MediaRecorder). For the whole piece
 * without playing it, Export → Download video is faster and exact.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, toast } = B.dom;
  const { music } = B;

  const pick = (list) => list.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  const extOf = (type, audio) => (type.includes('mp4') ? (audio ? 'm4a' : 'mp4') : type.includes('ogg') ? 'ogg' : 'webm');

  function init(app) {
    const player = app.player;
    let take = null; // { vrec, arec, chunks, comp, raf, timer, t0 }

    async function start() {
      await player.init();
      const audio = player.recordStream;
      if (!window.MediaRecorder || !audio) throw new Error('Recording is not supported in this browser. Use Export instead.');
      const comp = B.composer.create(app, { width: 1280, height: 720, live: true });
      const canvasStream = comp.canvas.captureStream?.(30);
      const vtype = pick(['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']);
      const atype = pick(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']);
      const t = { chunks: { v: [], a: [] }, comp, t0: Date.now(), from: app.state.position };
      if (canvasStream) {
        const both = new MediaStream([...canvasStream.getVideoTracks(), ...audio.getAudioTracks()]);
        t.vrec = new MediaRecorder(both, { ...(vtype && { mimeType: vtype }), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 192_000 });
        t.vrec.ondataavailable = (e) => e.data.size && t.chunks.v.push(e.data);
      }
      t.arec = new MediaRecorder(audio, { ...(atype && { mimeType: atype }), audioBitsPerSecond: 192_000 });
      t.arec.ondataavailable = (e) => e.data.size && t.chunks.a.push(e.data);
      const paint = () => {
        comp.draw(app.state.position);
        t.raf = requestAnimationFrame(paint);
      };
      paint();
      t.vrec?.start(1000);
      t.arec.start(1000);
      take = t;
      $('recBtn').setAttribute('aria-pressed', 'true');
      $('recLabel').textContent = 'Stop 0:00';
      t.timer = setInterval(() => ($('recLabel').textContent = 'Stop ' + music.seconds((Date.now() - t.t0) / 1000)), 500);
      if (!player.playing) await app.play();
    }

    const stopped = (rec) => (rec && rec.state !== 'inactive' ? new Promise((r) => ((rec.onstop = r), rec.stop())) : Promise.resolve());

    async function stop() {
      const t = take;
      if (!t) return;
      take = null;
      clearInterval(t.timer);
      $('recBtn').setAttribute('aria-pressed', 'false');
      $('recLabel').textContent = 'Saving…';
      $('recBtn').disabled = true;
      try {
        await Promise.all([stopped(t.vrec), stopped(t.arec)]);
        cancelAnimationFrame(t.raf);
        t.comp.dispose();
        const base = B.dom.slug(app.src?.name || 'take');
        const extra = [];
        if (t.chunks.v.length) {
          const type = t.vrec.mimeType || 'video/webm';
          extra.push({ name: `${base}-take.${extOf(type)}`, blob: new Blob(t.chunks.v, { type }) });
        }
        if (t.chunks.a.length) {
          const type = t.arec.mimeType || 'audio/webm';
          extra.push({ name: `${base}-take-sound.${extOf(type, true)}`, blob: new Blob(t.chunks.a, { type }) });
        }
        if (!extra.length) throw new Error('Nothing was recorded.');
        const zip = await B.bundle.build(app, extra);
        B.dom.download(zip, `${base}-recording.zip`);
        toast(`Recording saved (${music.seconds((Date.now() - t.t0) / 1000)}): a ZIP with the video, the sound, the score, braille, notes and settings.`, 6000);
      } catch (e) {
        toast(e.message || 'The recording could not be saved.');
      } finally {
        $('recBtn').disabled = false;
        $('recLabel').textContent = 'Record';
      }
    }

    $('recBtn').onclick = async () => {
      if (take) return stop();
      try {
        await start();
      } catch (e) {
        toast(e.message);
        stop();
      }
    };
    return { stop: () => take && stop(), get recording() {
      return !!take;
    } };
  }

  B.recorder = { init };
})(typeof self !== 'undefined' ? self : this);
