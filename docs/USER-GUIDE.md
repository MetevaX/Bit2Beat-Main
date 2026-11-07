# User guide

Bit2Beat turns Earth data into music you can hear, read as a score and export. This guide walks through every part of the studio.

- [Opening Bit2Beat](#opening-bit2beat)
- [The studio at a glance](#the-studio-at-a-glance)
- [Data tab](#data-tab)
- [Earth events tab](#earth-events-tab)
- [Image tab](#image-tab)
- [Shaping the sound](#shaping-the-sound)
- [Reading what you hear](#reading-what-you-hear)
- [Saving, sharing and exporting](#saving-sharing-and-exporting)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

## Opening Bit2Beat

| Way | How | Needs internet? |
| --- | --- | --- |
| Single file | Double-click `dist/Bit2Beat-Studio.html` | No (live feeds and satellite views do) |
| From the source | `npm start`, then open <http://localhost:8765> | No |
| Online | GitHub Pages or any static host serving the repository root | Yes |

Bit2Beat runs fully in the browser. Nothing is uploaded: CSV files and pictures you open stay on your computer.

## The studio at a glance

![Studio](screenshots/studio.png)

| Area | What it does |
| --- | --- |
| **Tabs** (Data · Earth events · Image) | Choose what kind of thing to listen to. The menu beside them picks the source. |
| **Source card** | The chart, map or picture you are hearing, its source line (where the numbers come from and when), and options for that tab. Hover to read a value; click to hear that step. |
| **Now playing** (navy panel) | The current step, its note and frequency, the reading behind it and live sound bars. |
| **Sound** | Instrument, scale, key, range and tempo. **Suggest** picks them from the shape of the data. |
| **Channels** | One row per data series: volume, instrument, **M**ute, **S**olo and **⇅** (flip pitch direction). |
| **Listening aids** | Shared pitch scale, ticks on sudden jumps, reference tone. |
| **Space & tone** | Output (stereo, binaural, 5.1, 7.1, 7.1.4), movement, room and equaliser. |
| **Melody** | Every note over time; the amber line is the playhead. |
| **What the data says** | Trend, highs and lows, sudden jumps, in plain sentences. **Read aloud** speaks them. |
| **Score** | Live sheet music of the lead channel; **Full score** shows every channel; **PNG** downloads it. |
| **BitPet** | Short notes from the NASA Image and Video Library that follow what you are playing. |
| **Player bar** | Restart, Play/Pause, Repeat, position, volume, **Record**, **Readings** table and **Export**. |

## Data tab

Pick a series from the menu:

- **Global temperature 1880–2025 (GISTEMP)** – NASA’s yearly land–ocean temperature anomaly. Higher = warmer. Turn on the *5-year smoothed* channel to hear the trend under the yearly wiggles.
- **Arctic (Svalbard) yearly temperature 1981–2024** – NASA POWER; the Arctic warms faster than the global average.
- **Arctic (Svalbard) daily weather 2025** – mean, max and min temperature and sunlight. Unmute *Sunlight* to hear the polar night as a run of the lowest note and the midnight sun as a long high plateau.
- **Practice shapes** – a rising line, a peak, two cycles and a curve that speeds up: learn what shapes sound like before real data.

Options:

- **Points to play** – long series can be averaged to 240, 120, 60 or 30 steps (each step is the mean of its bucket; labels become ranges).
- **NASA POWER daily data** – pick one of 18 places around the world and a year since 1981, then **Load** (online).
- **Open CSV** (or drop a file on the chart) – comma, semicolon or tab separated; up to six numeric columns; a year/date/name column becomes the labels; a unit in brackets (`Temp (°C)`) is detected.

## Earth events tab

![Earthquakes](screenshots/earthquakes.png)

- **Earthquakes (USGS)** – past day, week or month; magnitude 2.5+, 4.5+ or significant.
- **Natural events (NASA EONET)** – wildfires, storms, floods, sea and lake ice and more from the past 7, 30 or 60 days. Each kind of event has its own channel and instrument.

Events are played **from west to east**, as one sweep across the map, like reading it left to right:

| What you hear | Comes from |
| --- | --- |
| Pitch | Latitude: further north = higher note |
| Loudness and dot size | Size: earthquake magnitude, fire area, storm wind, ice area |
| Height in 3D sound | Earthquake depth (deep quakes sit lower) |
| Left–right in 3D sound | Longitude |

**Even steps** gives one event per eighth note. **Map distance** keeps the real gaps between events along the sweep, so clusters (the Pacific Ring of Fire) sound like clusters and empty oceans sound like pauses.

**Get latest** fetches the live feed. The pill next to the title says whether you hear *Live data*, a *Saved copy* from your last visit or the *Bundled snapshot*.

## Image tab

- **Live NASA satellite views** (NASA GIBS): whole Earth today, Earth at night, Amazon, Himalaya, Greenland ice sheet, western Sahara. Choose the **Date** for daily views.
- **Works offline**: a world relief map and two generated illustrations (clearly labelled as not satellite data).
- **Open picture** – any PNG, JPG or WebP.

Options:

- **Light** – three voices: brightness (CIE L\*), detail (how much brightness varies) and the height of bright areas. **Colour** – red, green and blue.
- **Left to right**, **Around the centre** (like a radar sweep) or **Follow pointer** (hear what is under your mouse or finger).
- **Steps** – how many bands the picture is cut into (16–160).

## Shaping the sound

- **Scale**: Pentatonic (default, never sounds wrong), Major, Natural minor, Dorian, Harmonic minor, Blues, Hijaz (maqam) and Chromatic (every semitone, most precise).
- **Range**: 1, 2 or 3 octaves from C3 (plus the key).
- **Tempo**: 50–200 BPM; one data step is one eighth note.
- **Instruments**: Piano, Electric piano, Guitar, Marimba, Flute, Organ, Strings, Bass, Synth. Each channel can have its own.
- **Same pitch scale for same units** keeps max, mean and min temperature at their real distance apart.
- **Tick on sudden jumps** adds a quiet click on readings that jump away from their neighbours.
- **Reference tone** plays a soft drone at the data’s baseline (GISTEMP’s 1951–1980 average) or its mean, so you hear above vs. below.
- **Output**: stereo, binaural (headphones, with height cues), 5.1, 7.1 or 7.1.4. If your device has fewer speakers, surround is simulated over headphones.

## Reading what you hear

- **Readings** (or `T`) opens a table of every step: label, value, note, frequency and start time.
- **What the data says** summarises the trend (least squares, only called a rise when it is clear), extremes and sudden jumps.
- **Captions** under the current note say exactly which value became which note.

## Saving, sharing and exporting

- **The address bar remembers everything.** Tab, source, sound settings, channel mix, image options and play position are kept in the link. Refresh and you are back where you were; send the link and others open the same view. (An uploaded file cannot travel in a link.)
- **Sessions** saves named setups in this browser.
- **Record** captures what you hear live (browser codec).
- **Export** renders exact files from the same notes: stereo WAV, binaural WAV, 5.1 / 7.1 / 7.1.4 WAV, an ADM BWF object master, the notes as CSV, and the score as ABC or PNG. Audio is normalised to −1 dBFS.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` `→` | Step back / forward and hear that step (`Shift` = one bar) |
| `Home` `End` | First / last step |
| `L` | Repeat on / off |
| `D` | Read the data summary aloud |
| `T` | Readings table |
| `?` | Help |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No sound | Press Play once (browsers only start audio after a click); check the volume and that a channel is not muted. |
| “Live data unavailable” | You are offline or the feed is down; Bit2Beat keeps playing the saved copy. |
| Satellite view is black or missing | That date has no imagery yet; pick an earlier date or an offline picture. |
| Surround export sounds like stereo | Your device has two outputs; the file itself still has all channels. Open it in a DAW or surround player. |
| Page looks unchanged after an update | Hard-refresh (`Ctrl`/`Cmd` + `Shift` + `R`). |
