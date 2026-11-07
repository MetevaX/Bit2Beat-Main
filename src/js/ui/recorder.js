/**
 * Bit2Beat ui · live recording of what you hear (MediaRecorder, the browser's own codec).
 * For exact, uncompressed files use Export instead.
 */
(function (root) {
  'use strict';
  const B = root.Bit2Beat;
  const { $, toast } = B.dom;
  const { music } = B;

  function init(app) {
    const player = app.player;
      let recorder = null;
    let recChunks = [];
    let recTimer = 0;
    async function toggleRecording() {
      if (recorder) return stopRecording();
      try {
        await player.init();
        const stream = player.recordStream;
        if (!window.MediaRecorder || !stream) throw new Error('Recording is not supported here. Use Export for a WAV file.');
        recChunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
        const r = recorder;
        recorder.onstop = () => {
          const type = r.mimeType || 'audio/webm';
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          B.dom.download(new Blob(recChunks, { type }), `${B.dom.slug(app.src?.name || 'take')}-take.${ext}`);
          toast('Recording saved.');
        };
        recorder.start();
        const t0 = Date.now();
        $('recBtn').setAttribute('aria-pressed', 'true');
        recTimer = setInterval(() => ($('recLabel').textContent = 'Stop ' + music.seconds((Date.now() - t0) / 1000)), 500);
        $('recLabel').textContent = 'Stop 0:00';
        if (!player.playing) await app.play();
      } catch (e) {
        toast(e.message);
        stopRecording();
      }
    }
    function stopRecording() {
      clearInterval(recTimer);
      if (recorder && recorder.state === 'recording') recorder.stop();
      recorder = null;
      $('recBtn').setAttribute('aria-pressed', 'false');
      $('recLabel').textContent = 'Record';
    }

    $('recBtn').onclick = toggleRecording;
    return { stop: () => recorder && stopRecording() };
  }

  B.recorder = { init };
})(typeof self !== 'undefined' ? self : this);
