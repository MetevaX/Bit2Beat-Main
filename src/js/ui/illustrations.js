/**
 * Bit2Beat ui · images for the Image tab.
 * - Live NASA satellite views from GIBS (Global Imagery Browse Services, CORS-enabled WMS).
 * - Offline: the bundled world relief map and two generated illustrations (clearly labelled as
 *   generated, not satellite data).
 */
(function (root) {
  'use strict';

  const SAT_VIEWS = {
    world: { name: 'Whole Earth', bbox: [-90, -180, 90, 180], layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', label: 'VIIRS NOAA-20, true colour' },
    lights: { name: 'Earth at night (city lights, 2016)', bbox: [-65, -180, 75, 180], layer: 'VIIRS_Black_Marble', time: '2016-01-01', format: 'image/png', label: 'VIIRS Black Marble, night lights' },
    amazon: { name: 'Amazon rainforest', bbox: [-16, -76, 4, -44], layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra, true colour' },
    himalaya: { name: 'Himalaya and Tibetan Plateau', bbox: [24, 74, 38, 102], layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra, true colour' },
    greenland: { name: 'Greenland ice sheet', bbox: [58, -75, 84, -10], layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra, true colour' },
    sahara: { name: 'Western Sahara desert', bbox: [12, -17, 32, 15], layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra, true colour' },
  };


  /** URL of a GIBS WMS 1.3.0 GetMap request (EPSG:4326 axis order is lat, lon). */
  function gibsUrl(view, date, width = 960) {
    const v = SAT_VIEWS[view];
    const [s, w, n, e] = v.bbox;
    const height = Math.round((width * (n - s)) / (e - w));
    const p = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: '1.3.0',
      LAYERS: v.layer,
      CRS: 'EPSG:4326',
      BBOX: `${s},${w},${n},${e}`,
      WIDTH: String(width),
      HEIGHT: String(height),
      FORMAT: v.format || 'image/jpeg',
      TIME: v.time || date,
    });
    return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${p}`;
  }

  /** Load an image (cross-origin readable) into a canvas, longest side ≤ maxDim. */
  function loadToCanvas(src, maxDim = 1200, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => reject(new Error('The image took too long to load.')), timeoutMs);
      img.onload = () => {
        clearTimeout(timer);
        // an SVG without a size has no natural size: draw it at 1200 × 800
        const nw = img.naturalWidth || 1200;
        const nh = img.naturalHeight || 800;
        const k = Math.min(1, maxDim / Math.max(nw, nh));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(nw * k));
        c.height = Math.max(1, Math.round(nh * k));
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, c.width, c.height);
        try {
          g.getImageData(0, 0, 1, 1);
        } catch {
          reject(new Error('The browser does not allow reading this image.'));
          return;
        }
        resolve(c);
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('The image could not be loaded.'));
      };
      img.src = src;
    });
  }

  // ---- generated illustrations (value noise) ----
  function hash(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    return (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) + (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));

  function generate(kind = 'storm') {
    const W = 600;
    const H = 330;
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const sg = small.getContext('2d');
    const im = sg.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let r;
        let g;
        let b;
        if (kind === 'storm') {
          const dx = (x - 340) * 1.07;
          const dy = (y - 167) * 1.12;
          const rad = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const n = noise(x * 0.045, y * 0.045) * 0.5 + noise(x * 0.12, y * 0.12) * 0.28 + noise(x * 0.4, y * 0.4) * 0.22;
          const warp = noise(x * 0.022, y * 0.022) * 1.8;
          const arm = Math.pow(0.5 + 0.5 * Math.sin(a * 3 + Math.log(rad + 12) * 8 + warp), 3);
          const env = Math.exp(-rad / 147) * clamp((rad - 10) / 36);
          let cloud = clamp((arm * 0.87 + n * 0.68 - 0.17) * env * 1.65);
          cloud += Math.exp(-(((rad - 37) / 15) ** 2)) * 0.35;
          cloud = clamp(cloud * (1 - Math.exp((-rad * rad) / 250)));
          const land = noise(x * 0.015, y * 0.016) + Math.sin(y * 0.021) * 0.15;
          const coast = x < 120 + (land - 0.5) * 90;
          const sea = 11 + noise(x * 0.06, y * 0.06) * 9;
          r = (coast ? 28 + land * 13 : sea) + cloud * 195;
          g = (coast ? 56 + land * 19 : 38 + sea * 0.3) + cloud * 196;
          b = (coast ? 57 + land * 19 : 54 + sea * 0.4) + cloud * 187;
        } else {
          const n = noise(x * 0.03, y * 0.025);
          const ridge = Math.sin(x * 0.009 + y * 0.018 + n * 2) * 0.5 + 0.5;
          const aurora = Math.exp(-(((y - (135 + 50 * Math.sin(x * 0.009))) / 40) ** 2)) * (0.5 + 0.5 * Math.sin(x * 0.043 + n * 3));
          r = 12 + ridge * 18 + aurora * 85;
          g = 35 + ridge * 35 + aurora * 135;
          b = 48 + ridge * 32 + aurora * 85;
        }
        const o = (y * W + x) * 4;
        im.data[o] = r;
        im.data[o + 1] = g;
        im.data[o + 2] = b;
        im.data[o + 3] = 255;
      }
    sg.putImageData(im, 0, 0);
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 550;
    c.getContext('2d', { willReadFrequently: true }).drawImage(small, 0, 0, 1000, 550);
    return c;
  }

  (root.Bit2Beat = root.Bit2Beat || {}).illustrations = { SAT_VIEWS, gibsUrl, loadToCanvas, generate };
})(typeof self !== 'undefined' ? self : this);
