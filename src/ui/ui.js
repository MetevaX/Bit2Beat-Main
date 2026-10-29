/**
 * @file ui.js
 * @description User Interface controller and event listeners for Bit2Beat.
 * Responsible for DOM element caching, mode switching, visual canvas updates,
 * and user action event dispatching.
 */

/**
 * Initializes UI event bindings and binds listeners to user controls.
 *
 * @param {Object} handlers - Callback handlers for UI events.
 * @param {Function} handlers.onPlay - Triggered when Play button is pressed.
 * @param {Function} handlers.onStop - Triggered when Stop button is pressed.
 * @param {Function} handlers.onModeChange - Triggered when the sonification mode changes.
 * @param {Function} handlers.onCsvLoaded - Triggered when a CSV file is selected.
 * @param {Function} handlers.onImageLoaded - Triggered when an image file is selected.
 * @param {Function} handlers.onEarconTrigger - Triggered when the alert earcon test button is pressed.
 * @returns {void}
 */
export function initUI(handlers = {}) {
  const modeSelect = document.getElementById('mode-select');
  const pmsControls = document.getElementById('pms-controls');
  const imageControls = document.getElementById('image-controls');
  const csvInput = document.getElementById('csv-input');
  const imageInput = document.getElementById('image-input');
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  const btnTestEarcon = document.getElementById('btn-test-earcon');
  const statusBar = document.getElementById('status-bar');

  // Mode switching
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      if (mode === 'pms') {
        pmsControls?.classList.remove('hidden');
        imageControls?.classList.add('hidden');
      } else if (mode === 'spatial-scan') {
        pmsControls?.classList.add('hidden');
        imageControls?.classList.remove('hidden');
      } else {
        pmsControls?.classList.add('hidden');
        imageControls?.classList.add('hidden');
      }
      handlers.onModeChange?.(mode);
    });
  }

  // Play / Stop controls
  btnPlay?.addEventListener('click', () => {
    handlers.onPlay?.();
  });

  btnStop?.addEventListener('click', () => {
    handlers.onStop?.();
  });

  btnTestEarcon?.addEventListener('click', () => {
    handlers.onEarconTrigger?.();
  });

  // File loading
  csvInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handlers.onCsvLoaded?.(file);
    }
  });

  imageInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handlers.onImageLoaded?.(file);
    }
  });

  // TODO: Add waveform visualizer canvas loop
  // TODO: Add slider controls for tempo, scale selection, and scan speed
}

/**
 * Updates the application status message.
 *
 * @param {string} message - Status text to display.
 */
export function updateStatus(message) {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.textContent = `Status: ${message}`;
  }
}
