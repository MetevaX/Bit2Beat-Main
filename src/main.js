/**
 * @file main.js
 * @description Main application entry point for Bit2Beat.
 * Bootstraps the UI, imports sonification modules, and binds audio triggers.
 */

import { parameterMapping } from './pms.js';
import { spatialScan } from './spatial-scan.js';
import { playEarcon } from './earcons.js';
import { initUI, updateStatus } from './ui/ui.js';

/**
 * Bootstraps the Bit2Beat application upon DOMContentLoaded.
 */
function initApp() {
  let currentMode = 'pms';
  let isPlaying = false;

  initUI({
    onModeChange: (mode) => {
      currentMode = mode;
      updateStatus(`Mode switched to: ${mode}`);
    },
    onPlay: async () => {
      // Browsers require user gesture before starting Web Audio / Tone.js AudioContext
      if (window.Tone && Tone.context.state !== 'running') {
        await Tone.start();
      }
      isPlaying = true;
      updateStatus(`Playing sonification (${currentMode})...`);

      if (currentMode === 'pms') {
        // TODO: Pass parsed CSV data to parameterMapping
        parameterMapping([], 'value');
      } else if (currentMode === 'spatial-scan') {
        // TODO: Pass canvas/image to spatialScan
        const canvas = document.getElementById('visualizer-canvas');
        spatialScan(canvas);
      }
    },
    onStop: () => {
      isPlaying = false;
      if (window.Tone?.Transport) {
        Tone.Transport.stop();
      }
      updateStatus('Playback stopped.');
    },
    onEarconTrigger: async () => {
      if (window.Tone && Tone.context.state !== 'running') {
        await Tone.start();
      }
      playEarcon('alert');
      updateStatus('Triggered alert earcon.');
    },
    onCsvLoaded: (file) => {
      updateStatus(`Loaded CSV file: ${file.name}`);
      // TODO: Parse CSV data using PapaParse or native CSV parser
    },
    onImageLoaded: (file) => {
      updateStatus(`Loaded image file: ${file.name}`);
      // TODO: Render image to visualizer-canvas for spatial scanning
    }
  });

  updateStatus('Ready. Select an input mode and load a file.');
}

window.addEventListener('DOMContentLoaded', initApp);
