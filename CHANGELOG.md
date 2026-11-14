# Changelog

## 3.8.0 — 14 November 2026
- **Every challenge video is in the Video menu**, bundled and offline: *Night lights 2012–2023* (SVS 5313; NASA only has it as an H.265 video, so the bundled clip is H.264 and plays everywhere), *GEOS aerosols moving, 1 Aug – 14 Sep 2024* (SVS 5572, the moving version of the 5669 picture), *GEDI forest height* (4950) and *DYAMOND global carbon dioxide* (5196). GEDI and CO₂ still tell their two chapters of Bitty's story. The new videos are in the Data tab too.
- **Smoother sound in the story (and everywhere).** Notes are now queued a quarter of a second ahead (was 0.12 s), so loading a chapter, a video seeking or speech starting can no longer make them late, and the audio uses the browser's *playback* buffer size, which stops crackles and drop-outs on slower computers. The playhead allows for the extra delay, so what you see still matches what you hear.
- **Push to talk closes the microphone between commands.** It opens when you hold V (a high tone when it is ready) and closes as soon as the phrase is caught. An open microphone could make the music stutter: Bluetooth headphones switch to their low-quality call mode, and echo cancellation works on everything being played.

## 3.7.0 — 14 November 2026
- **Push to talk.** Voice control no longer listens all the time. Once it is on (`V`), hold `V` while you speak and let go to send it; a quick tap listens for one command (up to 8 seconds). On phones and with a mouse, hold the new **Hold to talk** button in the voice bar (Enter or Space on it: one command). A short high tone means it is listening and a low tone that it stopped, so it works without a screen. Talking over an answer stops the answer. `Shift`+`V` turns voice control off.
- **Always listen** in the voice bar (or saying “always listen”) brings back the old way, listening to every phrase; “push to talk” switches back. The choice is remembered.
- New voice command: *push to talk* / *always listen* (Gemini knows it too).

## 3.6.1 — 14 November 2026
- **NASA's TIFF files open as pictures.** The GeoTIFFs in NASA's visualization gallery are rendered maps (colours, not measured values). Those saved with 16 bits per colour, like GEDI forest height and the Dixie fire, opened as grey bands of numbers; they now show as the picture and play like one. See-through parts show as white, as on NASA's page, and the three colours are read in one pass over the file, so large files open about three times faster.
- **No more colour bars on their own.** File type search skipped past a page's maps to its colour bar file (GEDI forest height opened "GEDI_colorbar_0to50_01.tif"). It now opens the map with the colour bar, and a page that only has a colour bar file is not listed.

## 3.6.0 — 14 November 2026 · 🏆 first place
- **Bit2Beat won first place at the NASA Space Apps Challenge 2026 Assiut local event** (*The Earth Information Jukebox*). The award is on the About page and at the top of this README.
- **Follow pointer says what is under it** (asked for by the judges, for blind listeners). When the pointer rests on the picture, Bit2Beat says which data set it is, the measure and its value, the note, and where you are ("Top left, 20% across, 30% down", or the latitude and longitude on a scientific map). Screen readers hear it; *Say what is under the pointer* also speaks it aloud. Press Tab to reach the picture and move the pointer with the arrow keys (Shift for bigger steps).
- **Default mood.** A *Default* button next to Sad, Happy and Excited brings back the starting sound (major pentatonic in C, piano, 96 BPM). Voice: "default mood".
- **The challenge's data sets in the Data tab too.** The seven NASA data sets play as numbers on a chart: a video's brightness, colour and motion over time, or a picture's bands from left to right.
- **Their scientific files are searchable.** *File type → GeoTIFF* now lists the challenge data sets' own GeoTIFF files (for example the sea surface currents map of SVS 3912), and file types are never greyed out before the lists have loaded.
- **How to use**, a new page in the top bar, explains every part of the app in a few words, with the keys. Voice: "how to use". The Help window links to it.
- **Words and icons instead of glows and dots.** No more glowing, pulsing or blinking effects. The voice bar shows a microphone and "Voice on", Record has a camera icon, the event playing on the Earth map is named next to it ("▶ Wildfire in Mozambique"), the story shows chapter numbers and ✓ for chapters heard, and the result playing says "✓ Playing".
- Help text updated (no more "AI mode").

## 3.5.0 — 13 November 2026 (delivery)
- **The challenge's data sets work offline and open at once.** Each of the seven Space Apps data sets is bundled with the app: a picture, and for the five videos a 45-second clip (640 pixels wide, H.264) with its analysis already done. Before, the videos came from NASA at full size (Perpetual Ocean 2 is a 1.3 GB file, the air-quality video is 3840 × 1080), so they took minutes to read or did not open at all. The Image and Video menus open on *Sea surface currents and temperature*.
- **GEDI forest height and Global carbon dioxide are gone from the menus** (they still play in Bitty's story, chapters 6 and 7).
- **Search by file type.** In the Image tab, *File type* finds pictures or scientific files: **GeoTIFF (.tif)** (every Earth Information Center data set, as a GeoTIFF of real values from the raster API, and the gallery's own .tif files), **NetCDF (.nc)** and **HDF5 (.h5, .he5)**. A scientific file opens with *What's inside* (layers, zoom, one spot over time, time-lapse) and surround sound, read from NASA in parts (HTTP ranges), so large files open quickly. Each result says its file type.
- **Earth events: bigger circle = higher note.** The size of each circle on the map now follows the frequency you hear: within one kind of event, a higher note is a bigger circle.
- **Voice is next to Accessibility** at the top right. Voice commands answer faster: when Gemini's first model is slow, the next one is asked after 3 seconds and the first answer wins, and a model that failed in the last ten minutes is asked last.
- **No more capital letters everywhere:** section labels, menu groups and the step read-out are in normal sentence case.
- **About the team:** new roles (Mostafa Ragab, UI Specialist & Guide; Mina Helal, Data Analyst; Mostafa Mohammed, Algorithms Manager; Steven Joseph, Sound Engineer; George Hany, Resources Manager) and the full list of data sources, with links.
- **Bitty's tour** covers search by tab, file types, the braille score, voice control and accessibility.
- Fixes found by testing every button on a desktop and a phone: on phones the Earth events tab was wider than the screen (a long menu name widened the page, so buttons could not be pressed); suggestions no longer cover the results after pressing Enter; a scientific map's name no longer repeats its layer; the Video tab's note describes what you hear.
- Search status no longer mentions Gemini; documentation, screenshots, the presentation and the promo film updated for 3.4 and 3.5.

## 3.4.0 — 13 November 2026
- **Search without AI, and each tab finds its own kind of thing.** Gemini is gone from the search box: results and suggestions appear as you type, from the words alone. **Image** finds only pictures (EIC gallery pictures plus **26 NASA satellite images of the whole Earth** from GIBS: sea temperature, rain, clouds, smoke and dust, nitrogen and sulfur dioxide, ozone, fires burning now, green vegetation, soil moisture, sea ice, lightning, where people live, mountains…), **Video** finds only videos, **Data** only data sets. The same word now gives different results in each tab, and changing tab searches again in the new one.
- **Better keywords:** typos (*temprature*, *rian*), word forms (*storms*, *forests*), everyday words (*smoke*, *plankton*, *volcanoes*, *burning forests*) and two-word names (*sea ice*, *air quality*) all find the right thing; the title counts more than the description, and every word you type must fit. Each tab has its own *Try:* ideas, placeholder and typing suggestions.
- **Score in braille, for blind musicians.** *Score in braille* (export window and next to the score, key **B**) saves the music as a **BRF** file for a braille embosser or display: braille music code with a title page in grade 1 braille, the tempo, one part per sound you hear (one eighth note per reading), octave marks, rests, sharps and flats, bars of 4/4 and the final double bar, 40 cells × 25 lines a page.
- **Voice control: *explain*** briefly says what you are listening to, where it comes from, which sound plays which measure and the main thing the data shows (*what am I hearing?* works too).
- **Voice control plays search results.** After *search for hurricanes* the results are read out, numbered; say *result 2*, *the first one* or *play* and a name (*play ozone*) to play one. *Play* and a name also searches for it when it is not in the list. From the Earth events tab, voice search opens the Data tab.

## 3.3.0 — 13 November 2026
- **The challenge's own data, as the Earth Information Center source.** Image and Video now search the **EIC Content Database** that the Space Apps “Earth Information Jukebox” resources point to: the pictures and videos NASA's Scientific Visualization Studio made for the Earth Information Center (svs.gsfc.nasa.gov/gallery/earth-information-center, 80+ visualizations in its dashboards, videos and beauty pieces). `api/eic-gallery.js` walks the gallery once a day; the browser keeps a copy for a week. The Data tab keeps the EIC data API (earth.gov), where every map is real numbers.
- **The challenge's data sets are presets** (Image and Video menus, group *Space Apps challenge data*): Sea surface currents and temperature (SVS 3912), Perpetual Ocean 2 (5425), GEOS aerosols (5669, picture), Air quality model runs (5533), Night lights 2012–2023 (5313, picture: its video is H.265 only), Lightning from the ISS (5011), An atmospheric river in 3D (4960), plus the bundled GEDI forest height (4950) and DYAMOND CO₂ (5196). **Presets never appear in search results.**
- NASA's site does not let other websites read its files, so pictures and videos come through the site's own address (`/svs/…`, passed on to svs.gsfc.nasa.gov by Vercel and by `npm start`). A preset's picture and its video analysis are kept in the browser after the first time, so they play offline afterwards (the video itself needs the internet).
- The Image tab now opens on GEDI forest height (bundled, works offline). The area menu is hidden for gallery searches (whole pictures and videos have no area to choose).

## 3.2.2 — 13 November 2026
- **The *What's inside* panel (layers, zoom, colour scale) and 5.1 / 7.1 / 7.1.4 are only for scientific files** (NetCDF, HDF5, GeoTIFF you open, and *Sunlight on Earth*). Earth Information Center maps found by search are pictures again, as before 3.0: drawn in the data set's own colours and read through their colour key (Light, Colour, Colour key), in stereo or headphone 3D.
- The zoom row no longer says “Whole map” twice; it names the area only when you are zoomed in.

## 3.2.1 — 13 November 2026
- **Gemini no longer leaves you waiting.** On 13 November Gemini 3.8 Flash did not answer at all (both search and voice ran out of time on it). Now each model gets a short time (7 s for a voice command, 18 s for a search); if it is busy, slow or missing, the next one is asked: 3.6 Flash, 3.5 Flash, then **every other Flash model your key can use** (looked up from Google's own list, newest first, Lite included). Later attempts think less, so they answer fast; models that do not take the thinking setting are asked again without it. The answer says which model replied (`model`) and, when all were busy, what each one did (`tried`).

## 3.2.0 — 13 November 2026
- **Voice control hears you in every browser.** It no longer depends on the browser's own speech recognition (missing in Firefox, blocked in Brave and in some Linux and desktop-app browsers, and weak with accents). Bit2Beat now listens to the microphone itself, cuts out each phrase when you stop speaking, and sends it as a short sound clip (16 kHz, about 32 kB a second) to Gemini through `api/voice.js`, which writes out what you said — **in English, Arabic or any language, with any accent** — and picks one of Bit2Beat's own commands. Noise and music are ignored. The red dot in the voice bar grows with the sound the microphone hears, and the bar shows what was heard. When the server cannot be reached, the browser's own recognition is used if it has one.
- **5.1, 7.1 and 7.1.4 are for scientific maps only** (NetCDF, HDF5, GeoTIFF files, the Earth Information Center map and *Sunlight on Earth*), where every place sounds where it is around you. Other sources play in stereo or headphone 3D; the surround outputs (and the 5.1/7.1/7.1.4 and ADM exports) are shown as “scientific maps only”, and your surround choice comes back by itself when a map opens again.

## 3.1.0 — 13 November 2026
- **Zoom on scientific maps** (NetCDF, HDF5, GeoTIFF, the Earth Information Center map and *Sunlight on Earth*): **+ / −** buttons and keys, **0** or *Whole map* to go back, the **mouse wheel** zooms around the pointer and **dragging** moves a zoomed map. Zooming reads only the part on screen again from the file, in full detail (across the date line too, and from the right GeoTIFF overview), so a 5 GB file stays quick. The sweep, the read-out, the spot, the time-lapse and the place names follow the zoomed area.
- **Smaller downloads and less memory:**
  - The Earth Information Center map now comes without its extra mask band and about 480 values across (≈ 0.45 MB instead of 2 MB for the whole world); zooming in fetches only that part, in detail, and remembers the last 12 parts.
  - Files from your device are never loaded whole: only the pieces needed for what is on screen are read (about 12 MB of the file at most is kept in memory).
  - Time-lapse frames are kept packed in 16 bits (half the memory).

## 3.0.0 — 13 November 2026
- **Scientific Earth-data files.** Upload (or drop) **NetCDF** (classic, 64-bit offset, CDF-5), **HDF5 / NetCDF-4** and **GeoTIFF / Cloud-Optimized GeoTIFF** files up to **5 GB**; the type is found from the file's first bytes. Files are read in the browser a few pieces at a time with progress and *Cancel*; nothing leaves the device. Readers written for Bit2Beat (no libraries): TIFF/BigTIFF with Deflate, LZW, PackBits, predictors and overviews; HDF5 superblocks 0–3, old and new object headers, compact/contiguous/chunked layouts, B-tree, fixed-array, extensible-array and single-chunk indexes, Deflate, shuffle and Fletcher-32. Clear messages for damaged, too-large or unsupported files (HDF4, GRIB, JPEG/LERC/Zstandard packing) with the command that fixes them.
- **What's inside:** layers with units, size, dates and area. Listen to the **whole map** (west → east, north → south, radar or follow pointer, from the real values), **one spot over time** (click the map or type latitude and longitude) or a **time-lapse**. Missing values are silent; a read-out gives value, place and date under the pointer; a notice says when a map was simplified to stay quick. Readings, Excel and every export work with these sources.
- **Earth Information Center maps as real values:** the Image tab now reads the newest map as numbers (a GeoTIFF from the raster API) instead of colours, so every value is exact. The coloured picture is still used if that fails.
- **Immersive surround:** west left, east right, north in front, south behind; **Wrap the globe around me**; **Trend rumble** (the long-term trend as a deep tone to the subwoofer); outputs **Stereo, Headphone 3D, 5.1, 7.1, 7.1.4** are back, with a top view that lights the speakers that play and a **test button for each speaker**. 7.1, 7.1.4 and ADM BWF exports include the rumble.
- **Voice control** for people who cannot see the screen: asked on the first visit (5 seconds, Enter = yes), `V` any time, a *Voice* button in the top bar. Say *play, pause, next, back, where am I, describe, faster, louder, mute, go to video, search for …, violin, happy mood, 7.1, drums on, readings, export, dark mode, help, repeat, stop voice control*. Unknown phrases go to Gemini through `api/voice.js`, which may only answer with one of these commands; every action is confirmed out loud.
- **Better Gemini search:** understands spelling mistakes, everyday words and other languages (answers in the language of the question), prefers data sets that cover the years you name, gives a one-line answer and up to three *Gemini suggests* searches, and keeps keyword matches under its picks. Server code shared in `api/_gemini.js`.
- **Area with data is muted by default** everywhere (pictures, videos, maps); press M to hear it.
- **Bitty's new chapter 8, “A map that sings”:** sunlight on the whole planet at the June solstice, worked out from astronomy (solar constant 1361 W/m²), with facts computed from it (night side, the North Pole getting more sunlight than the equator on 21 June).

## 2.10.1 — 12 November 2026
- **Upload moved to the top bar**, next to *About the team*, so it is there on every page (from Story or About it opens the studio first). On phones it is an icon at the end of the page links.
- **Smart Tuning is an amber button**, like the other main actions.

## 2.10.0 — 12 November 2026
- **Earth events: natural events no longer disappear.** NASA EONET can take half a minute to answer; Bit2Beat waited only 10 s, so the live sweep fell back to earthquakes only. It now waits up to 45 s, and if EONET still does not answer, its last saved copy fills in (the note says so) — the sweep always has every kind of event. Saved copies that were missing a part are no longer kept.
- **Smart Upload, next to the tabs.** One **Upload** button (and drag-and-drop on the chart) for every file; Bit2Beat looks at the extension and opens the right tab: data (CSV, TSV, TXT, DAT, JSON, GeoJSON, Excel .xlsx/.xlsm, OpenDocument .ods), pictures (PNG, JPG, WebP, GIF, BMP, AVIF, SVG, ICO, and TIFF/HEIC where the browser can) and videos (MP4, WebM, MOV, M4V, OGV, MKV and more). Files it cannot read get a clear way out (for example “save it as .xlsx”). The separate Open buttons per tab are gone.
- **Suggest is now Smart Tuning.**

## 2.9.3 — 12 November 2026
- **Clear results:** a button above the search results removes them all (with the words that found them); what is playing keeps playing.

## 2.9.2 — 12 November 2026
- **Suggestions while you type:** a list under the search box offers search ideas and matching data sets (*Play* starts a data set at once); `↑` `↓` and `Enter` pick one, `Esc` closes it. Works with and without Gemini.
- **Clear** is now a labelled button in the search box whenever there is something to clear (also `Esc`).
- **The AI switch is a Gemini button** with a sparkle: amber when Gemini answers your searches.

## 2.9.1 — 12 November 2026
- **View original source opens the exact visualization**: the GEDI forest-height and DYAMOND CO₂ pictures and videos link to their own pages in NASA's Earth Information Center gallery (hosted by NASA's Scientific Visualization Studio: SVS 4950 and SVS 5196), with the video, the still image and the credits, instead of the earth.gov home page.

## 2.9.0 — 12 November 2026
- **Search: keywords first, AI when you want it.** Results now appear as you type, from the catalogue (no AI needed). **AI mode** (a switch, *Gemini*) sends your question in your own words to Gemini; it is remembered. **×** / `Esc` clears the search, and **Try:** ideas run a search in one click.
- **Boundaries for the AI.** Gemini only searches the Earth Information Center: questions that are not about Earth data get “only Earth data”, the question is treated as data (never as instructions), answers keep only real catalogue ids, Egypt is never a place, questions are cleaned and cut to 200 characters, only this site may call the server (other origins are refused) and each address has a limit per minute.
- **View original source opens the Earth Information Center** (earth.gov) for the NASA pictures and videos.
- **Radar** (was *Around the centre*) now covers the whole picture whatever its shape (the beam reaches the corners). **Click or tap the picture** to jump there.
- **Follow pointer plays only the data**: the data channel only, and only where the picture shows data (“No data here” elsewhere). Fixed: with *Colour key*, the value under the pointer was not read.
- **Fewer, clearer instruments:** Piano, Electric piano, Guitar, Marimba, Flute and **Violin** (with vibrato); Organ, Bass and Synth are gone.
- **Drums (Beta):** a kick, snare and hi-hat beat with the steps, stronger when the data is high; also in exported audio.
- **Video: Motion plays by default.**
- **Output and export: stereo or binaural only** (surround removed from the studio).
- **Earth events menu:** natural events and earthquakes together, or the offline sample.
- **Reload** next to the menu loads the current source again.
- **Clearer help:** what *Light*, *Colour* and *Colour key* measure, and what the *Highest value* channel is, are explained on the buttons and channels.
- **Errors:** an unexpected error or a service that does not answer now gives a short message (and Reload), and going offline or online is announced.
- About: George's bio rewritten in his own voice. Story: the “Open my own CSV” button is gone.

## 2.8.1 — 12 November 2026
- **AI search keeps working when Gemini is busy.** If Gemini 3.8 Flash answers "high demand", the server asks again, then lets Gemini 3.6 Flash (or 3.5 Flash) answer; the search line says which model picked. A real error (such as a wrong key) is shown at once.

## 2.8.0 — 12 November 2026
- **The Earth Information Center comes first.** Tabs are now *Image · Video · Earth events · Data*, and the studio opens on the newest Earth Information Center map (the bundled GEDI picture when offline).
- **One search for the whole catalogue.** A search box above Image, Video and Data replaces the three data-set menus: type what you want to hear in your own words ("methane from wetlands in the Amazon"). Keyword matches appear at once; then **Gemini 3.8 Flash** (thinking level high) picks the best data sets and finds the place, even one that is not in the list. Choose a result to hear it in the open tab: a map (Image), a time-lapse (Video) or one note per map (Data). The Gemini key stays on the server: a small Vercel function (`api/search.js`) reads it from the `GEMINI_API_KEY` setting. Without it, search still works by keyword.
- **Earth events: earthquakes are a channel of the natural events.** *Natural events and earthquakes* plays NASA EONET events and USGS earthquakes in one sweep; earthquakes are the bass (bigger = louder, deeper = lower). The offline sample has both. Each feed alone is still in the menu.
- **Pictures and the map without bands:** the Image and Earth events views now show just the picture at its own shape, like the video.
- **Instruments stay in step.** The Sound card shows what the lead channel plays; choosing an instrument there makes every channel play it (with Undo), and choosing one for the lead channel changes the Sound card.
- **Undo** after a mood, *Suggest* or *Space & tone* reset. **Space & tone** has its own **Reset**.
- **Readings → Excel:** download the readings as an `.xlsx` workbook (Readings, Notes per channel, About), or as CSV.
- **Score shows the channels that are on.** When channels take turns (Earth events), the preview puts them on one staff, so it no longer shows bars of rests; otherwise up to three staves. The full score has the same option.
- **Follow pointer hides the player bar** (the pointer is the player); it comes back with any other scan.
- **Open picture sits next to the Steps slider** in the Image tab.
- **Black dark mode**, and the small amber bars before section titles are gone.
- **Screen reader updates fixed:** they are on by default, read the step and its values (also when stepping with ← →), and are heard inside dialogs too (a live region outside an open dialog is silent).

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
