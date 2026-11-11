# Changelog

## 2.7.2 — 11 November 2026
- **Menus open in the same place every time.** Every menu now opens just below its button (above only when there is clearly more room there), fits the window and scrolls inside, instead of the browser's own list that could jump up or down. It also works inside dialogs and follows its button when the page scrolls.
- **Search in menus.** Menus with six or more choices (sources, instruments, scales, keys, places, Earth Information Center data sets) start with a search box: type any words, in any order, accents ignored. Arrow keys, `Home`/`End`, `Enter` and `Esc` work as before; short menus jump to a choice by its first letter.
- **New tab icon:** an amber square with four sound bars, sharp at every size (SVG, plus 32 px PNG and a 180 px home-screen icon).

## 2.7.1 — 11 November 2026
- **Earth Information Center pictures and time-lapses fixed.** Maps were drawn with each data set's dashboard range, which can miss the values of a place entirely (GEOS methane near Singapore is 1,895–2,096 ppb; the dashboard range stops at 1,900), so the picture came out one flat colour and the colour key heard nothing. Maps are now coloured over the real spread of the data in the area shown (2nd to 98th percentile, from the raster API), the colour key uses the same range, and an even map is read as data instead of being skipped as empty background.
- If a data set has the same value everywhere in the area (for example wetland methane around Mauna Loa, which is 0), Bit2Beat now says so and suggests another place or the whole world, instead of playing a flat line.
- **New scan: Top to bottom.** In the Image tab a line now moves down the picture row by row; *Movement: Top to bottom* (automatic for this scan) brings the sound down from above to ear level.

## 2.7.0 — 11 November 2026
- **NASA Earth Information Center in the Image and Video tabs too.** *Image*: load the newest map of any data set (whole world or a 32° × 20° window around a place), drawn by the EIC raster API in the data set's own colours, then read it back value by value through its colour bar (*Colour key*), or by light or colour. *Video*: make a time-lapse of the latest 24, 48 or 96 maps; each map is one picture and one note, the average (and highest value) of exactly the area on screen, and the maps follow the music.
- EIC channels are named after the map layer (for example *Net Primary Production (NPP)*); data sets with several layers per date use the layer their dashboard draws.

## 2.6.0 — 11 November 2026
- **NASA Earth Information Center data API.** The Data tab can play any time-series data set of earth.gov's open catalogue (CO₂ and methane fluxes, GEOS column CO₂, ODIAC and Vulcan emissions, MiCASA carbon flux, population density and more): choose the data set, the whole world or one of 18 places, and the latest 24, 60 or 120 maps. Each note is one map: its average over the place (a 2° box) with the highest value as a second channel; data sets with several layers per date get a channel per layer. New data sets appear by themselves.
- **Any other catalogue.** *Use another catalogue* reads any STAC API with a raster statistics API, such as NASA VEDA or the U.S. Greenhouse Gas Center. New guide: [Add your own data](docs/ADD-DATA.md).
- **About page:** tapping a team member's note no longer makes the photo vanish for a moment; the photo now bounces with a ring around it.

## 2.5.0 — 11 November 2026
- **Sound moods: Sad, Happy, Excited.** One click in the *Sound* card sets the whole sound: Sad is minor pentatonic in A with slow strings in a big warm room; Happy is major pentatonic in C on marimba; Excited is major pentatonic in G over three octaves on a fast electric piano. Changing a setting by hand leaves the mood.
- **Always pentatonic.** *Suggest* no longer switches to major, minor or Dorian: rising data gets the major pentatonic scale, falling or low data the new *minor pentatonic* (A C D E G), so no data set plays wrong notes.
- **Reading aloud resumes where it paused.** Resume carries on from the word that was being read (from the browser's word boundaries, or the time spoken for voices without them) instead of restarting the sentence. *Read aloud* now pauses and resumes (*Pause reading* / *Resume reading*); Stop is in the reading bar and `Esc`.
- **About page comes alive.** The team lands card by card as it scrolls into view; each of us is a note of the pentatonic scale (C D E G A): tap the note or the photo to hear it. A new **Launch the Jukebox** button plays a rising run, opens the Studio and starts the music.

## 2.4.0 — 10 November 2026
- **Bitty is the guide.** A *Guide* button in the top bar (or `G`) opens *How can I help?*: the whole-studio tour or a short tour of one tab (Data, Earth events, Image, Video), the story, or the shortcuts. Each tab tour points at the real controls (Points to play, NASA POWER, CSV; reading the map, Map distance, Get latest; Light / Colour / Colour key and scans; the video that follows the music).
- **Tips on Bitty’s card.** The first time a tab is opened, Bitty offers *Show me* (or *No thanks*).
- **Reading aloud can be paused and stopped.** One reader for *What the data says* and the story: sentence by sentence, with a bar at the top showing what is read, **Pause / Resume**, **Stop** and, in the story, **Skip to the music**. *Read aloud* becomes *Stop reading* while it speaks; `D` and `Esc` stop it. Long texts are no longer cut off by the browser.
- **One name: Bitty.** “BitPet” is now Bitty everywhere: the card, settings, credits, code (`ui/bitty-card.js`) and docs.
- Everything Bitty says when guiding lives in `src/js/data/guide.js`; a test checks every step points at a real control.

## 2.3.0 — 10 November 2026
- **Story page: “Bitty listens to Earth”.** A new *Story* tab next to Studio. Bitty, the space pup from the first prototype, tells eight short chapters, each playing one real data set in the studio’s own player: a rising line to learn how to listen, GISTEMP 1880–2025 with the 1951–1980 reference tone, the Svalbard yearly record, polar night and midnight sun in 2025, the earthquake sweep, NASA EONET events, GEDI forest height and the DYAMOND CO₂ model.
- **Facts worked out from the data you hear** instead of typed text: warmest year and the ten warmest years, Svalbard’s warming per decade compared with the globe over the same years (about 3.7× faster), days without sunlight, the strongest and deepest quakes, event counts, peak forest height and CO₂. With live feeds the facts follow the live numbers.
- **Play the whole story** moves to the next chapter when one ends; **Bitty reads each chapter aloud** (optional, speech synthesis) before the music; each chapter shows the shape of its data with a playhead, *Listen for* hints and *Open in the studio*. Chapters heard are remembered in the browser; hearing all eight earns the *Earth Listener* badge.
- **Guided tour of the studio.** A spotlight walks through tabs, source menu, chart, Play, Now playing, melody and summary, sound, channels, Earth events and Export. Steps that ask you to try something wait for you and cheer (“Do it for me” presses it). Shown once on a first visit (one click to skip), again from Help, BitPet or `?tour`; `?notour` hides it. Keyboard (Esc), screen readers, reduced motion, dark theme and phones are supported.
- Bitty’s artwork (four moods, headphones, wagging tail) is shared by Bitty’s card, the story and the tour.
- The address bar keeps the Story page (`page=story`), so a refresh returns to the chapter that was playing.
- About page credits the NASA Earth Information Center instead of Open-Meteo, which is no longer used.

## 2.2.0 — 7 November 2026
- **Video tab and NASA Earth Information Center presets** (GEDI forest height, DYAMOND global CO₂), as videos and as stills.
- **Colour keys.** The NASA presets are read through their own colour bars: forest height (m) and land in view; CO₂ (ppm) and the area above ~420 ppm. Image tab: new *Colour key* analysis.
- **Video algorithm.** Two samples per second, each averaged over its half second (no false rhythms from pulsing pictures); empty background left out; *Motion* measured over 1/12 s instead of between distant samples; missing frames are silent instead of a fake zero.
- **Minimum pitch span** for video and colour-key channels, so a tiny change no longer sounds like a huge swing.
- **The video follows the music.** One Play button; the muted video keeps in step (playback rate and drift correction), shows the exact frame when paused or stepping; tempo is set for real time and restored when you leave the video.
- **Pictures:** flat background (the black around a globe) is silent instead of being played as data.
- Design: video on top, a compact timeline of the music below; Earth events default back to live data.
- `npm start` now uses a small Node server with Range support (video seeking); keyboard shortcuts moved to `ui/keys.js`.

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
