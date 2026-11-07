# Changelog

## 2.1.0 — 7 November 2026
- **Earth events play left to right.** Earthquakes and natural events are sorted west → east and heard as one sweep across the map, with a playhead line and a longitude grid. Latitude sets the pitch (north = higher); magnitude or size sets loudness and dot size. “Map distance” keeps the real gaps along the sweep.
- **Smoother playback.** The map and the melody roll are drawn once into offscreen layers and only the playhead is redrawn; updates during playback are batched per animation frame; theme colours are cached.
- **Links remember everything.** Mode, source, sound settings, mix, image options and play position live in the address bar, so a refresh or a shared link opens the same view.
- **Worldwide data only.** Egypt-specific sources are removed: Cairo series → NASA POWER Arctic (Svalbard) 1981–2024 yearly and 2025 daily; the place picker offers 18 places around the world; satellite views are whole Earth, Earth at night, Amazon, Himalaya, Greenland and Sahara; Open-Meteo is no longer used.
- **Removed** “Play your own notes”, “Draw a curve” and the image “Line chart” tracer.
- **Documentation**: user guide, data sources, accessibility, architecture and development guides in `docs/`.
- **Design.** The studio uses the full screen width; small-caps section labels with an amber rule; softer card depth; the playing note sits on a navy display with amber live bars; the world map keeps its shape and fills the width.

## 2.0.2 — 6 November 2026
- Tighter studio layout: the page is about a third shorter on a laptop (1612 → 1109 px at 1440×900). Score and BitPet share the bottom row, the current note sits beside the live bars, Listening aids start folded, the chart height adapts to the screen, and long channel lists scroll inside their card.
- Team roles on the About page.

## 2.0.1 — 6 November 2026
- Space & tone panel no longer spills out of its card; selects shrink to fit.
- Sound bars (spectrum) moved under the current note, always visible, focused on 80 Hz–3.2 kHz where the notes are, with smooth fall-off.
- BitPet: 20 saved NASA notes across climate, earthquakes, natural events, Egypt and Earth-from-space; follows what is playing, fetches fresh notes from the NASA Image and Video Library for that topic, and changes note every 20 s (pauses while you hover or focus it).

## 2.0.0 — 6 November 2026

A rebuild for the NASA Space Apps 2026 judging.

### Design
- New, quiet interface in the logo colours (navy, cream, amber), system fonts, no gradients or badges. Dark theme and high contrast kept.
- One page: source on the left, sound and channels on the right, player bar at the bottom. Works on phones.

### Real data instead of sample numbers
- **Earth events** replaces “World Occasions”, whose values were typed by hand: live USGS earthquakes, NASA EONET natural events and current weather in Egypt’s 27 governorates, with a real offline snapshot and a saved last-live copy.
- **Data** now opens with NASA GISTEMP (1880–2025) and NASA POWER Cairo series, and can fetch NASA POWER daily data for any governorate and year.
- **Image** can load today’s NASA GIBS satellite view of Egypt, the Nile Delta, Egypt at night or the whole Earth.

### More accurate algorithms
- Value → note now uses scale-degree indexing (monotonic, every degree used evenly); key selection added; “Arabic maqam” corrected to Hijaz (minor seventh).
- Channels in the same unit share one pitch range; log scale for event sizes; acres converted to hectares.
- Pictures are measured in CIE L\* over whole bands (not single pixel columns); new detail and bright-area-height measures; a chart tracer that separates up to three coloured lines and ignores axes and grid lines.
- Earthquakes: bigger = lower and louder, depth = height, optional real timing.
- Score: correct accidental rules, flats for flat keys, automatic clef; preview, full score, ABC and PNG all match the sound.
- Exports normalised to −1 dBFS; same note plan as live playback.
- EONET positions published as [lat, lon] are detected and corrected.

### New features
- “What the data says” summary (trend, extremes, sudden jumps) with Read aloud.
- Tick on sudden jumps, reference tone (baseline or average), shared-scale switch.
- Averaging long series to 30–240 steps; real-timing for events.
- Hover read-outs and click-to-hear on charts and maps; keyboard scrubbing.
- Draw-a-curve on the chart; pointer sonification of pictures.
- Notes CSV now includes start time and 3D position.

### Removed
- 3D Array Lab and typed-in arrays.
- “AI Regions” (it used a hard-coded, invalid cloud key and invented labels).
- Hand-typed “live” world and Egypt station values, the copyrighted Egypt map image, and 700 KB of embedded fonts.

### Code
- The 5,000-line `app.js` is split into focused modules (`core/`, `audio/`, `ui/`, `data/`); no file is longer than ~600 lines.
- Single-file build is 1.2 MB (was 4.5 MB). New test suite covers the algorithms, formats, page integrity and the build.

## 1.0.0
First prototype (sidebar studio, image/data/event modes, 3D array lab, AI regions, BitPet, Dolby Atmos ADM export).
