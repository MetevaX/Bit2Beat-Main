# Development

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari).
- Node.js 18 or newer (only for checks, tests and the single-file build).
- ffmpeg (only to regenerate the NASA video presets with `node scripts/prepare-nasa-media.js`).

No packages need to be installed: the project has no runtime or build dependencies.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Serves the folder at <http://localhost:8765> (supports video seeking) |
| `npm run check` | Syntax-checks every module in `src/js` |
| `npm test` | Runs `tests/core.test.js` with Node’s built-in test runner |
| `npm run build` | Writes `dist/Bit2Beat-Studio.html`, one self-contained offline file |

CI (`.github/workflows/ci.yml`) runs check, build and test on every push and pull request.

## Tests

`tests/core.test.js` covers:

- **music** – equal temperament, note names, and a scale mapping that is monotonic and uses every degree evenly.
- **stats** – trend, sudden-jump detection (no false flags on smooth curves, seasons or trends), resampling, summaries.
- **csv** – separators, quotes, decimal commas, label and unit detection.
- **image** – CIE L\*, line and radar scans, pointer probe; background left out; colour keys read values from a picture.
- **video** – two samples per second, content-only measures, motion, colour keys, minimum pitch span.
- **NASA presets** – bundled videos and stills exist, every preset is read through its colour bar and stays inside the bar's range.
- **score** – accidentals within a bar, flats, rests, clef choice.
- **geo** – projection, land mask, swapped-coordinate repair, distances.
- **feeds** – events sorted west → east, latitude → pitch, size → loudness, units, corrected positions.
- **plan** – shared scales, loudness measure, map spacing, resampling, drone.
- **wav, spatial and adm** – WAV, 7.1.4 channel masks, constant-power panning, ADM BWF chunks.
- **page integrity** – unique ids, every `$(id)` used by the scripts exists, every script file exists, no leftover code from removed features.
- **build** – the single file inlines every script, style and image.
- **Bitty’s notes** – every topic has offline notes; excerpts end at real sentence ends.
- **story** – eight chapters, each loads a real source, unmuted channels exist, facts come from the data (warmest year matches GISTEMP, Svalbard warms faster than the globe, polar-night day count), no Egypt content, broken or missing data never throws.
- **guide** – the bubble stays on screen in every placement, dimmed areas surround the highlight, every step of every tour points at an element that exists and every button goes somewhere, each tab has a tour and a tip, the page never says “BitPet”, reading aloud is cut into sentences, Bitty’s moods render.

## Project rules

1. Pure logic goes in `src/js/core/` (no DOM). Page code goes in `src/js/ui/`, one file per part of the page.
2. Every value shown or played must come from the plan, so sound, score, table and exports stay identical.
3. Never present sample or typed numbers as measurements. Real data needs an `origin` and an offline snapshot.
4. Keep files under 700 lines; split instead.
5. Style: 2-space indent, single quotes, no frameworks, no external requests except the public data APIs in [DATA-SOURCES.md](DATA-SOURCES.md).

## Adding a data source

The quickest way needs no code: any STAC catalogue with a raster statistics API plays in the Data tab (*NASA Earth Information Center → Use another catalogue*). See [Add your own data](ADD-DATA.md).

To build a new kind of source:


1. Write a builder in `src/js/core/feeds.js` (or a preset in `src/js/data/presets.js`) that returns a *source*: `{ name, kind, view, origin, labels, channels: [{ name, unit, values, instrument }] }`. Add `points` (lat/lon) for map views and `loudBy` for a separate loudness measure.
2. Add a real offline snapshot to `src/js/data/snapshots.js` with `source`, `url` and `fetched`.
3. Add the menu entry (`DATA_MENU` in `presets.js` or `EARTH_MENU`/`IMAGE_MENU` in `ui/sources.js`).
4. Add a test, then `npm run check && npm test && npm run build`.

## Publishing

- **Vercel (the live site):** pushing to GitHub redeploys. `api/search.js` is a serverless function for AI search; set `GEMINI_API_KEY` under Project → Settings → Environment Variables (never commit the key). `vercel.json` gives it up to 60 s.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root. The studio is `index.html`; the single file is at `dist/Bit2Beat-Studio.html`.
- **Offline:** hand out `dist/Bit2Beat-Studio.html`; it opens by double-click.

## Release checklist

1. Update `CHANGELOG.md` and the version in `package.json`.
2. `npm run check && npm test && npm run build`.
3. Open `dist/Bit2Beat-Studio.html` from disk and play each tab once; test offline (airplane mode).
4. Update screenshots in `docs/screenshots/` if the layout changed.
5. Commit, tag (`git tag v2.3.0`) and push (`publish-to-github.sh` does both).
