# Architecture

Bit2Beat is a static web app: plain HTML, CSS and JavaScript with no framework and no build step for development. A small Node script inlines everything into one offline HTML file for distribution.

## Principles

1. **One plan, many views.** Every number that is shown or played comes from one *plan* (`src/js/core/plan.js`). Live playback, offline export, the score, the readings table and the notes CSV all read the same plan, so what you see is exactly what you hear and what you download.
2. **Pure core, thin UI.** Logic that turns numbers into notes lives in `src/js/core/` with no DOM access, so it runs and is tested in Node. Page code lives in `src/js/ui/`, one file per part of the page.
3. **Real data only.** Every data source has a source line (`origin`) and a real offline snapshot. Nothing typed by hand is presented as a measurement.
4. **Small files.** No module is longer than ~700 lines (a test enforces it).

## Data flow

```text
 live feed / snapshot / CSV / picture
              │
              ▼
        source  { name, kind, view, origin, labels[], channels[{name, unit, values[], loudBy?}],
                  points[]?, times[]?, categories[]?, details[]? }
              │   + mix (per-channel gain, mute, solo, instrument, invert)
              │   + settings (scale, key, range, tempo, spacing, length, drone, cues, path…)
              ▼
        plan.build()  →  { count, times[], channels[{midi[], norm[], size[], …}], steps[[notes]], drone }
              │
   ┌──────────┼──────────────┬────────────────┬──────────────┐
   ▼          ▼              ▼                ▼              ▼
 player    exporter     score (ABC)     readings table    canvases
 (live)    (WAV/ADM)    + PNG           + notes CSV       (chart, map, roll, stage)
```

## Modules

### `src/js/core/` – pure logic (Node-testable)

| File | Responsibility |
| --- | --- |
| `music.js` | Scales, keys, `midi(v, scale, range, key)`, normalisation, note names, EQ presets |
| `stats.js` | Trend (least squares), sudden jumps (leave-one-out local line + modified z-score), resampling, plain-language summaries, *Smart Tuning* |
| `plan.js` | Builds the plan: scaling (shared per unit, log, invert), pitch, loudness (`loudBy`), timing (even or source `times`), 3D positions, drone |
| `feeds.js` | USGS and NASA EONET (events sorted west → east), both together (`combineEvents`: earthquakes as one more channel), NASA POWER daily data; live fetch + offline builders share one code path |
| `eic.js` | NASA Earth Information Center (or any STAC + titiler) API: playable data sets, latest maps per date and layer, area statistics, the source; `get` is injected so it is tested offline |
| `eic-search.js` | Catalogue search: offline keyword ranking (everyday words → catalogue words), place detection, the Gemini request (`prompt`) and the check of its answer (`answer`: only real ids, never Egypt); shared by the page, `api/search.js` and the tests |
| `xlsx.js` | A small Excel writer (stored zip + SpreadsheetML) for the readings |
| `geo.js` | Equirectangular projection, 1° land mask, swapped-coordinate repair, distances |
| `image.js` | sRGB → CIE L\* and CIELAB, background detection, colour keys (read data through a colour bar), band statistics, line and radar scans, pointer probe |
| `story.js` | Bitty’s eight chapters (scene, narration, *Listen for*) and the facts worked out from the source being heard |
| `spotlight.js` | Tour geometry: where the speech bubble fits beside a control, the dimmed rectangles around it |
| `video.js` | Video sampling (two per second, anti-aliased windows), per-frame brightness/colour/motion or colour-key values, channel definitions with minimum pitch span |
| `csv.js` | CSV/TSV parser with label-column and unit detection |
| `score.js` | ABC notation with bar-aware accidentals, flats for flat keys, clef choice |
| `spatial.js` | Speaker layouts, constant-power panning, channel masks |
| `wav.js`, `adm.js` | WAV (incl. WAVE_FORMAT_EXTENSIBLE) and ADM BWF writers |

### `src/js/audio/`

| File | Responsibility |
| --- | --- |
| `engine.js` | Instruments (additive synthesis), voices, cue ticks, drone, renderers for each output |
| `player.js` | Live playback: look-ahead scheduler on the audio clock (120 ms ahead), routing, analyser for the live bars |
| `exporter.js` | Offline rendering with `OfflineAudioContext` at 48 kHz, peak normalisation to −1 dBFS |

### `src/js/ui/`

| File | Responsibility |
| --- | --- |
| `dom.js` | Helpers (`$`, toasts, announcements, storage, canvas sizing) |
| `draw.js` | Canvas drawing: chart, world map (cached base layer + sweep), picture, melody roll (cached), 3D stage, live bars |
| `sources.js` | Menus and loaders: presets, CSV, pictures, satellite views, live/offline/cached feeds |
| `panels.js` | Header, now playing, summary, legend, sound controls, space & tone |
| `mixer.js` | Channel rows |
| `dialogs.js` | Export, readings table, score, sessions, accessibility, help |
| `canvas-input.js` | Hover read-outs, click to hear, *Follow pointer* |
| `score-view.js` | Score preview, full score, PNG |
| `bitty-card.js` | Bitty’s card: NASA notes that follow what is playing |
| `speech.js` | Reading aloud sentence by sentence with Pause / Resume, Skip and Stop (one reader for the summary and the story) |
| `recorder.js` | Live recording with `MediaRecorder` |
| `url-state.js` | Reads and writes the address bar (see below) |
| `video-view.js` | Keeps the muted video in step with the music (playback rate, drift correction, exact frame when paused) |
| `keys.js` | Keyboard shortcuts |
| `search.js` | The Earth Information Center search above Image, Video and Data: keyword results at once, then Gemini via `/api/search`; a result plays in the open tab |
| `options.js` | Options under the picture per tab (points, NASA POWER, period, scan, steps); Follow pointer hides the player; Open sits next to Steps in Image |
| `combo.js` | Every menu: a button and a list that opens below it (above only when there is more room), with search for menus of six or more choices; the hidden `<select>` stays the source of truth |
| `pages.js` | Studio, Story and About pages (one visible at a time) |
| `story-view.js` | The Story page: chapters, sparklines, Listen / Play the whole story, narration, progress and badge |
| `tour.js` | Bitty the guide: hello, *How can I help?* menu, spotlight tours, tab tips (words in `data/guide.js`) |
| `bitty-art.js` | Bitty’s SVG artwork (four moods) and the Earth Listener badge |
| `illustrations.js` | NASA GIBS satellite views, offline pictures |

### `src/js/data/`

| File | Contents |
| --- | --- |
| `snapshots.js` | Real offline copies: GISTEMP, NASA POWER Svalbard (yearly + daily), USGS quakes, NASA EONET events, and the 18 NASA POWER places |
| `presets.js` | The Data tab menu (NASA series + practice shapes) |
| `guide.js` | Everything Bitty says when guiding: the studio tour and one tour per tab, tips |
| `nasa-notes.js` | Bitty’s offline notes from the NASA Image and Video Library |
| `landmask.js` | 1° land mask used to repair event coordinates |
| `nasa-keys.js` | Colour-bar ramps of the NASA EIC visualisations (GEDI 0–50 m, DYAMOND CO₂ 380–460 ppm) |
| `nasa-media.js` | Pre-computed measurements of the bundled EIC videos (generated by `scripts/prepare-nasa-media.js`) |

### `src/js/app.js`

Holds the state, loads sources, rebuilds the plan after any change and connects the views. Panels receive an `app` object (`state`, `src`, `plan`, `rebuild`, `seek`, `setSource`, `choose(mode, id)`, `showPage`, …). It fires `b2b:play`, `b2b:source` and `b2b:page` window events, which the story and the tour listen to; neither changes how the studio works, they press the same controls you would.

## State in the address bar

`url-state.js` writes the state into the query string (throttled, `history.replaceState`, no history spam) and `app.js` reads it on start. Only values that differ from the defaults are written.

| Parameter | Meaning | Example |
| --- | --- | --- |
| `mode` | `data`, `earth`, `image`, `video` | `mode=video` |
| `src` | source id in the current tab | `src=eonet`, `src=sat:amazon` |
| `page` | `story` or `about` when that page is open | `page=story` |
| `tour` / `notour` | start the studio tour / never say hello automatically (read once, not written) | `?tour` |
| `t` | play position (step) | `t=40` |
| `inst`, `scale`, `key`, `range`, `bpm` | sound settings | `scale=major&bpm=120` |
| `pts` | averaging (Data) | `pts=60` |
| `gap` | `even` or `time` (map distance, Earth events) | `gap=time` |
| `ref`, `tick`, `shared`, `move` | listening aids and movement | `ref=baseline` |
| `out`, `room` | output and room | `out=binaural` |
| `quakes`, `days` | USGS feed, EONET period | `quakes=2.5_day` |
| `look`, `scan`, `steps`, `date` | image options (`look` = `light`, `color` or `key`) | `look=key&scan=radar` |
| `place` | NASA POWER `lat,lon,year` | `place=78.22,15.65,2024` |
| `mix` | per channel `gain.mute.solo.instrument`, joined by `_` | `mix=80.0.0.soft_60.1.0.strings` |

Unknown or invalid values are ignored, so old links still open.

## Performance

- The world map, its veil, grid and all event dots are drawn once into an offscreen canvas; each frame only copies it and adds the sweep, played dots and the current ring.
- The melody roll is cached the same way; only the playhead moves.
- During playback, view updates are batched into one animation frame, so bursts of close events never queue up redraws.
- Theme colours are read from CSS once per theme.

## Build

`scripts/build.js` reads `index.html`, inlines every stylesheet and script, embeds the world map, team photos and the NASA EIC videos and stills as data URIs and writes `dist/Bit2Beat-Studio.html` (~2.8 MB). It works from `file://`.

`scripts/prepare-nasa-media.js` (needs ffmpeg) decodes every frame of the bundled EIC videos and regenerates `src/js/data/nasa-media.js` with the same pure code (`core/video.js`, `core/image.js`) the browser uses for uploads.

`scripts/serve.js` is the development server behind `npm start`; it supports HTTP Range requests so videos can be seeked.

## Server: `api/search.js`

The only server code: a Vercel serverless function (`POST /api/search`). It receives the question, the tab and the catalogue the page already loaded, asks Gemini 3.8 Flash (`thinkingLevel: high`, JSON answer with a schema) and returns only ids that exist in the catalogue plus the place. The key comes from the `GEMINI_API_KEY` environment variable; a small per-instance limit (12 searches a minute per address) guards against abuse.
