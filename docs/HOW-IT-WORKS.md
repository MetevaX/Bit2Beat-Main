# How Bit2Beat works

This note explains every step from a number to a sound, so judges and contributors can check it.

## 1. Sources

All sources become the same shape: a list of **steps** (with labels such as years, dates or places) and up to six **channels** of numbers. Missing numbers stay `null` and are played as silence; they are never invented.

| Source | Where the numbers come from | Offline copy |
| --- | --- | --- |
| Global temperature | NASA GISTEMP v4 annual land–ocean index, °C relative to 1951–1980 | 1880–2025, downloaded 6 Nov 2026 |
| Arctic (Svalbard, 78.2° N) yearly / daily | NASA POWER point API (2 m temperature, max, min, all-sky sunlight) | 1981–2024 yearly, 2025 daily, downloaded 7 Nov 2026 |
| NASA POWER, 18 places | Live request for the place (one per climate zone, worldwide) and year you choose | – |
| Earthquakes | USGS real-time GeoJSON feeds | M4.5+, 30 Oct – 6 Nov 2026 |
| Natural events | NASA EONET v3 (all events of the period; wildfires limited to the 60 largest) | 22 Sep – 5 Nov 2026 |
| Satellite views | NASA GIBS WMS (MODIS Terra, VIIRS NOAA-20, VIIRS Black Marble): whole Earth, Earth at night, Amazon, Himalaya, Greenland, Sahara | last view saved in the browser |

Every successful live request is also saved in the browser and used next time the network is missing.

**Coordinate repair.** Some EONET flood polygons arrive as `[lat, lon]` instead of GeoJSON’s `[lon, lat]`. For events that only happen on land, Bit2Beat swaps the pair when the published point is impossible (|lat| > 90°) or at sea / on polar ice while the swapped point is on land (1° land mask built from the bundled map, 3 × 3-cell neighbourhood so coasts count). The source line says how many positions were corrected.

**Units.** EONET wildfire areas reported in acres are converted to hectares (1 acre = 0.40468564224 ha) so all fires share one scale.

## 2. Pictures

Pixels are converted from sRGB to linear light and then to **CIE L\*** (0 = black, 100 = white), which is close to how bright people perceive a colour. For each band of the picture (a vertical strip, or a sector around the centre for the radar scan) Bit2Beat uses up to ~4000 pixels, not a single column:

- **Brightness** – mean L\*.
- **Detail** – standard deviation of L\* inside the band (texture, edges, cloud structure).
- **Bright-area height** – the L\*²-weighted vertical centre of the band, from the bottom (0 %) to the top (100 %).
- **Colour** mode gives mean R, G, B instead; the three share one 0–255 scale.

## 3. Scaling and pitch

1. Optional averaging to 240/120/60/30 steps (bucket means; labels become ranges).
2. Optional log10 for sizes that span orders of magnitude.
3. Min–max scaling to 0–1. With **Same pitch scale for same units** on, channels with the same unit use the overall min and max of the group.
4. Optional inversion (bigger → lower), one click per channel.
5. Note = `scaleNotes[round(v × (n − 1))]`, where `scaleNotes` lists every note of the key and scale between the base note (C3 + key) and base + range. Frequency `f = 440 · 2^((m − 69)/12)`.

Because the index is rounded on an evenly divided list, the mapping never goes down when the data goes up, and every scale degree covers the same share of the range.

## 4. Time, loudness and space

- One step = one eighth note: `60 / tempo / 2` seconds.
- **Earth events** are sorted west → east (north first at equal longitude) and played as one sweep across the map, with a vertical playhead moving over it. Pitch = latitude (north higher); loudness and dot size = event size (magnitude; log10 of areas).
- **Map distance** (events): step *i* starts at `(lonᵢ − lon₀)/(lon_last − lon₀) × (n − 1) × step`, so the piece has the same length but keeps the real gaps and clusters along the sweep.
- **Loudness** (events): gain × (0.45 + 0.55 s), where s is the scaled size.
- **Timbre**: higher values add a little more upper harmonics and a gentle high shelf, so peaks also sound brighter.
- **Position**: x = progress left → right (or an orbit, or fixed places); y separates channels front/back; z = value × height. Events use x = longitude/180, y = latitude/90, and earthquake depth for height (`1 − depth/700 km`).

## 5. Listening aids

- **Trend**: least-squares line; called a rise/fall only when R² ≥ 0.25 and the fitted change is ≥ 15 % of the range (“slightly” for R² ≥ 0.1 and ≥ 10 %). Reported per decade or month when the labels are years or days.
- **Sudden jumps**: for each point, a straight line is fitted to its neighbours (window ≈ n/12, 5–31 points, shifted inwards at the edges, the point itself left out). Residuals are scored with the modified z-score `0.6745 (r − median)/MAD`; |z| ≥ 3.5 is a jump. The fit is repeated without the flagged points so one spike does not make its neighbours look odd, and a jump must be at least about 5 % of the range. Smooth curves, seasonal cycles and steady trends produce no flags (tested).
- **Reference tone**: a soft fundamental + octave at the note of the baseline value (GISTEMP: 0 °C = the 1951–1980 average) or of the lead channel’s mean.
- **Suggest**: smooth data → slower tempo and strings; jumpy data → faster and marimba; clearly rising → major, falling → minor.

## 6. Playback and export

`plan.js` computes every note once (pitch, gain, start time, 3D position, jump flag). The live player schedules notes on the audio clock 120 ms ahead (no timer drift) and the visuals follow the note that is audible. The exporter renders the same plan in an `OfflineAudioContext` at 48 kHz and normalises the whole file to −1 dBFS peak. Surround WAVs use WAVE_FORMAT_EXTENSIBLE masks 0x60F (5.1), 0x63F (7.1) and 0x2D63F (7.1.4); the LFE never receives object audio. The ADM BWF file holds one mono track per channel plus `chna` and `axml` chunks describing each object’s cartesian path (ITU-R BS.2076-2 / BS.2088).

The score is generated from the same notes: 4/4, eighth notes, eight steps per bar, accidentals that last until the bar line (with natural signs when needed), flats for minor-type scales and flat keys, and treble or bass clef from the median pitch.
