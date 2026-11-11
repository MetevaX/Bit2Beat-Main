# Add your own data

Bit2Beat plays any list of numbers over time. There are four ways to bring new data in, from no code at all to a few lines.

## 1. Any data set of the NASA Earth Information Center (no code)

The [Earth Information Center](https://earth.gov/) shares its data sets through an open API (no key, no sign-in). In the **Data** tab, under *NASA Earth Information Center*:

1. open the data-set menu: it lists every data set of the live catalogue that changes over time (about 30 today, more as the centre adds them);
2. choose **Whole world** or one of 18 places (the average inside a 2° box around it);
3. choose how many maps: the latest 24, 60 or 120;
4. press **Load**. Each note is one map. The first channel is the average, the second (muted) the highest value. Data sets with several layers per date (for example GEOS CO₂, CH₄ and CO) get one channel per layer.

When the centre publishes a new data set, it appears in the menu by itself.

## 2. Another catalogue (no code)

Open **Use another catalogue** and paste two addresses:

| Catalogue | STAC API | Raster API |
| --- | --- | --- |
| Earth Information Center (default) | `https://earth.gov/eic/api/stac` | `https://earth.gov/eic/api/raster` |
| NASA VEDA | `https://openveda.cloud/api/stac` | `https://openveda.cloud/api/raster` |
| U.S. Greenhouse Gas Center | `https://earth.gov/ghgcenter/api/stac` | `https://earth.gov/ghgcenter/api/raster` |

Any [STAC API](https://stacspec.org/) whose maps are cloud-optimised GeoTIFFs and that has a [titiler](https://developmentseed.org/titiler/) raster API with `/cog/statistics` works. The choice is remembered in your browser; **Back to earth.gov** resets it.

## 3. A CSV file (no code)

**Open CSV** (or drop the file on the chart). A year, date or name column becomes the labels, up to six number columns become channels, and a unit in brackets (`CO2 (ppm)`) is detected.

## 4. In code

`src/js/core/eic.js` works in the browser and in Node. Give it a `get(url, { method, body })` that returns JSON:

```js
const eic = require('./src/js/core/eic.js');
const get = async (url, init = {}) =>
  (await fetch(url, { method: init.method || 'GET', headers: init.body ? { 'content-type': 'application/json' } : {}, body: init.body && JSON.stringify(init.body) })).json();

const sets = await eic.listCollections(get);                 // [{ id, title, asset, density, from, to, … }]
const info = sets.find((s) => s.id === 'micasa-carbonflux-monthgrid-v1');
const source = await eic.load({ info, place: { name: 'Manaus', lat: -3.12, lon: -60.02 }, steps: 24 }, { get });
// source = { name, kind: 'data', labels: ['2023-01', …], channels: [{ name, unit, values }], origin }
```

In the app, `Bit2Beat.app.setSource(source)` plays it. To add a new kind of source with an offline snapshot, see [Development](DEVELOPMENT.md#adding-a-data-source).
