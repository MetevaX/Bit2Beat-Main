# Data sources

Every sound in Bit2Beat comes from public, key-free data. Live requests go straight from the browser to the provider (all endpoints allow cross-origin requests). Each source also ships with a real offline snapshot, so the app works at a venue without internet.

## Sources

| Source | Provider | Endpoint | Used for | Offline snapshot |
| --- | --- | --- | --- | --- |
| GISTEMP v4 | NASA Goddard Institute for Space Studies | <https://data.giss.nasa.gov/gistemp/> | Global temperature anomaly 1880–2025 (yearly + Lowess(5) smoothed) | Full series, saved 6 Nov 2026 |
| POWER | NASA Langley Research Center | `https://power.larc.nasa.gov/api/temporal/{monthly,daily}/point` | Svalbard yearly mean 1981–2024; daily mean/max/min temperature and sunlight for 18 places, any year since 1981 | Svalbard yearly and 2025 daily, saved 7 Nov 2026 |
| EONET v3 | NASA Earth Observatory | `https://eonet.gsfc.nasa.gov/api/v3/events` | Wildfires, storms, floods, sea & lake ice, volcanoes… | 164 events, 22 Sep – 5 Nov 2026 |
| GIBS WMS | NASA Global Imagery Browse Services | `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` | Satellite views (MODIS Terra, VIIRS NOAA-20, VIIRS Black Marble) | Last view saved in the browser |
| Image and Video Library | NASA | `https://images-api.nasa.gov/search` | Bitty’s notes | 20 notes, saved 6–7 Nov 2026 |
| Earth Information Center gallery | NASA Scientific Visualization Studio | [SVS 4950](https://svs.gsfc.nasa.gov/4950/) GEDI forest height (Kel Elkins), [SVS 5196](https://svs.gsfc.nasa.gov/5196/) DYAMOND global CO₂ (AJ Christensen; science Lesley Ott) | Video and Image presets, read through their colour bars | 640×360 silent previews and print stills in `assets/nasa/` |
| Earth Information Center data API | NASA and partner agencies, via earth.gov | STAC `https://earth.gov/eic/api/stac`, statistics `https://earth.gov/eic/api/raster/cog/statistics` | Any time-series data set of the catalogue (CO₂ and methane fluxes, GEOS column CO₂, ODIAC and Vulcan emissions, MiCASA carbon flux, population density…): the latest 24–120 maps, averaged over the whole world or a 2° box around a place | None: online only (the catalogue lists ~30 data sets and grows) |
| Earthquake feeds | U.S. Geological Survey | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson` | Earthquakes (2.5+ day, 4.5+ week, 4.5+ month, significant month) | 91 quakes, 30 Oct – 6 Nov 2026 |

## NASA EIC colour bars

| Visualisation | Colour bar | Range | How it is read |
| --- | --- | --- | --- |
| GEDI forest height | *Height Above Ground*, drawn in the video (bottom left) | 0–50 m | nearest colour in CIELAB, lightness down-weighted; the bar itself is masked out |
| DYAMOND CO₂ | `dyamondCbar_6-27-2024a.png` on SVS 5196 | 380–460 ppm, transparent below ~420 ppm | hue angle only (plumes are semi-transparent over a dark globe); the date stamp is masked out |

The ramps are stored in `src/js/data/nasa-keys.js`. Values are what the visualisation *shows* (exaggerated 3D height, model CO₂), not new measurements.

## Earth Information Center data API

The [Earth Information Center](https://earth.gov/) publishes its data as maps (cloud-optimised GeoTIFFs) through two open APIs. Bit2Beat:

1. lists the data sets of the STAC catalogue (`/collections`, following every *next* page) and keeps those that change over time;
2. asks for the latest N items of the chosen data set (`POST /search`, newest first). Items that share a date are layers of that date (GEOS: CO₂, CH₄, CO) and each layer becomes a channel;
3. for every map asks the raster API for its statistics: `POST /cog/statistics` with a 2° × 2° box around the place, or `GET /cog/statistics?max_size=512` for the whole world. The map's own *no data* value is passed on;
4. plays the **average** (one channel per layer) and the **highest value** (muted at first), one note per map, oldest first. Units come from the map's `raster:bands`.

The **Image** tab asks `GET /cog/bbox/{w},{s},{e},{n}/{width}x{height}.png` with the data set's dashboard colour map and range, and builds its colour key from `GET /colorMaps/{name}` (256 colours spread over that range). The **Video** tab does the same for each of the latest 24–96 maps and plays the average of exactly the area in the picture (`POST /cog/statistics?max_size=512` with that box).

At most 180 statistics requests are made per load (6 at a time). Some data sets only cover the United States (Vulcan, EPA); for those, choose Houston, Death Valley, Kennedy Space Center or the whole world.

## NASA POWER places

One place per climate zone, spread over the globe: Svalbard (Arctic), Reykjavík, McMurdo (Antarctica), Manaus (Amazon), Death Valley, Mauna Loa, Kennedy Space Center, Houston, London, Tokyo, Mumbai, Singapore, Nairobi, Sydney, Lima, Tibetan Plateau, Yakutsk (Siberia) and the central Sahara.

## Satellite views

| View | Area (lat, lon) | Layer |
| --- | --- | --- |
| Whole Earth today | 90° S–90° N, 180° W–180° E | VIIRS NOAA-20 true colour |
| Earth at night | 65° S–75° N, whole globe | VIIRS Black Marble 2016 |
| Amazon rainforest | 16° S–4° N, 76°–44° W | MODIS Terra true colour |
| Himalaya and Tibetan Plateau | 24°–38° N, 74°–102° E | MODIS Terra true colour |
| Greenland ice sheet | 58°–84° N, 75°–10° W | MODIS Terra true colour |
| Western Sahara desert | 12°–32° N, 17° W–15° E | MODIS Terra true colour |

## Live, saved, bundled

When you open an Earth events source, Bit2Beat shows the offline copy immediately and fetches the live feed in the background:

1. **Live data** – fetched now. A copy is saved in the browser.
2. **Saved copy** – the last live copy saved in this browser.
3. **Bundled snapshot** – the real snapshot shipped with the app.

The status pill beside the title always says which one you are hearing, and the source line gives the provider and the time of the data.

## Data quality fixes

- **Swapped coordinates.** Some EONET flood polygons are published as `[lat, lon]` instead of GeoJSON’s `[lon, lat]`. For events that can only happen on land, Bit2Beat swaps the pair when the given point is impossible (|lat| > 90°) or at sea / on polar ice while the swapped point is on land (1° land mask, 3 × 3-cell neighbourhood so coasts count). The source line reports how many positions were corrected.
- **Units.** EONET fire areas reported in acres are converted to hectares (× 0.40468564224), so all fires share one scale.
- **Missing values** (`-999` in NASA POWER, `null` elsewhere) stay missing and are played as silence; nothing is interpolated.
- **Large lists.** Live EONET keeps every non-fire event plus the 60 largest wildfires, so a month stays listenable.

## Updating the offline snapshots

Snapshots live in `src/js/data/snapshots.js`. To refresh one:

1. Fetch the endpoint above (a browser console works; all endpoints allow CORS).
2. Replace the `rows` / `series` and the `fetched` date.
3. Run `npm test` (the tests check order, units, coordinate repair and counts) and `npm run build`.

## Credits and licences

NASA data are not copyrighted in the United States and are free to use with credit. USGS data are public domain. abcjs (music engraving) is MIT-licensed. Bit2Beat’s own code is MIT-licensed (see `LICENSE`).
