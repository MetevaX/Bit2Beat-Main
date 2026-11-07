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
| `stats.js` | Trend (least squares), sudden jumps (leave-one-out local line + modified z-score), resampling, plain-language summaries, *Suggest* |
| `plan.js` | Builds the plan: scaling (shared per unit, log, invert), pitch, loudness (`loudBy`), timing (even or source `times`), 3D positions, drone |
| `feeds.js` | USGS and NASA EONET (events sorted west → east), NASA POWER daily data; live fetch + offline builders share one code path |
| `geo.js` | Equirectangular projection, 1° land mask, swapped-coordinate repair, distances |
| `image.js` | sRGB → CIE L\*, band statistics, line and radar scans, pointer probe |
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
| `bitpet.js` | BitPet and its NASA notes |
| `recorder.js` | Live recording with `MediaRecorder` |
| `url-state.js` | Reads and writes the address bar (see below) |
| `illustrations.js` | NASA GIBS satellite views, offline pictures |

### `src/js/data/`

| File | Contents |
| --- | --- |
| `snapshots.js` | Real offline copies: GISTEMP, NASA POWER Svalbard (yearly + daily), USGS quakes, NASA EONET events, and the 18 NASA POWER places |
| `presets.js` | The Data tab menu (NASA series + practice shapes) |
| `nasa-notes.js` | BitPet’s offline notes from the NASA Image and Video Library |
| `landmask.js` | 1° land mask used to repair event coordinates |

### `src/js/app.js`

Holds the state, loads sources, rebuilds the plan after any change and connects the views. Panels receive an `app` object (`state`, `src`, `plan`, `rebuild`, `seek`, `setSource`, …).

## State in the address bar

`url-state.js` writes the state into the query string (throttled, `history.replaceState`, no history spam) and `app.js` reads it on start. Only values that differ from the defaults are written.

| Parameter | Meaning | Example |
| --- | --- | --- |
| `mode` | `data`, `earth`, `image` | `mode=earth` |
| `src` | source id in the current tab | `src=eonet`, `src=sat:amazon` |
| `page` | `about` when the team page is open | `page=about` |
| `t` | play position (step) | `t=40` |
| `inst`, `scale`, `key`, `range`, `bpm` | sound settings | `scale=major&bpm=120` |
| `pts` | averaging (Data) | `pts=60` |
| `gap` | `even` or `time` (map distance, Earth events) | `gap=time` |
| `ref`, `tick`, `shared`, `move` | listening aids and movement | `ref=baseline` |
| `out`, `room` | output and room | `out=binaural` |
| `quakes`, `days` | USGS feed, EONET period | `quakes=2.5_day` |
| `look`, `scan`, `steps`, `date` | image options | `scan=radar&steps=64` |
| `place` | NASA POWER `lat,lon,year` | `place=78.22,15.65,2024` |
| `mix` | per channel `gain.mute.solo.instrument`, joined by `_` | `mix=80.0.0.soft_60.1.0.strings` |

Unknown or invalid values are ignored, so old links still open.

## Performance

- The world map, its veil, grid and all event dots are drawn once into an offscreen canvas; each frame only copies it and adds the sweep, played dots and the current ring.
- The melody roll is cached the same way; only the playhead moves.
- During playback, view updates are batched into one animation frame, so bursts of close events never queue up redraws.
- Theme colours are read from CSS once per theme.

## Build

`scripts/build.js` reads `index.html`, inlines every stylesheet and script, embeds the world map and team photos as data URIs and writes `dist/Bit2Beat-Studio.html` (~1.2 MB). It works from `file://`.
