# NASA EIC sample assets

The two video/image pairs are drawn from NASA's [Earth Information Center gallery](https://svs.gsfc.nasa.gov/gallery/earth-information-center/):

- **GEDI forest height** — [NASA SVS 4950](https://svs.gsfc.nasa.gov/4950/), visualization by Kel Elkins. Global forest-height visualization using GEDI observations from April 2019–April 2020, per the selected download's description. Height is exaggerated in the visualization.
- **DYAMOND global carbon dioxide** — [NASA SVS 5196](https://svs.gsfc.nasa.gov/5196/), visualization by AJ Christensen; scientific consulting by Lesley Ott. GEOS model visualization for January–March 2020.

`sources.json` records the original download URLs. Images are original NASA print-resolution stills. Videos are full-length, silent 640×360 H.264 previews at 24 fps, transcoded from those downloads to make offline use practical. No synthetic frames or readings were substituted.

The music reads each visualisation **through its own colour bar** (`src/js/data/nasa-keys.js`): forest height (0–50 m) and land in view for GEDI; CO₂ (380–460 ppm, transparent below ~420 ppm) and the area above ~420 ppm for DYAMOND. These are the values the visualisation *shows* (GEDI height is exaggerated in 3D; CO₂ comes from the GEOS model), not new measurements. A third channel, motion, follows camera movement and change.

Run `node scripts/prepare-nasa-media.js` (requires ffmpeg and ffprobe) to regenerate `src/js/data/nasa-media.js` from the bundled previews, then `npm run build`. It decodes every frame at 160×90, uses the same pure code as uploaded videos (`src/js/core/video.js`, `src/js/core/image.js`), takes two samples per second and averages every frame inside each half second.

`global-temperature.csv` is an export of the existing bundled [NASA GISS GISTEMP](https://data.giss.nasa.gov/gistemp/) snapshot, preserving its year, anomaly, and five-year-smoothed columns. The Data tab's CSV preset uses the regular CSV parser. GISTEMP, POWER, NASA EONET and USGS event samples are credited to their actual providers; they are not presented as downloads from EIC.

## The Space Apps challenge's data sets (3.5)

`svs-<id>.jpg` is a picture of each data set and `svs-<id>.mp4` the first 45 seconds of its video
(640 pixels wide, H.264, no sound), from NASA's Scientific Visualization Studio, made for the Earth
Information Center: [3912](https://svs.gsfc.nasa.gov/3912/), [5425](https://svs.gsfc.nasa.gov/5425/),
[5669](https://svs.gsfc.nasa.gov/5669/) (picture), [5533](https://svs.gsfc.nasa.gov/5533/),
[5313](https://svs.gsfc.nasa.gov/5313/) (picture), [5011](https://svs.gsfc.nasa.gov/5011/) and
[4960](https://svs.gsfc.nasa.gov/4960/). The analysis of each clip (two samples a second of
brightness, colour and motion, made by the app's own code) is in `src/js/data/svs-clips.js`.
