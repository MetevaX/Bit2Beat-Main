/**
 * Bit2Beat · built-in data sets for the Data tab.
 * Real NASA series come from snapshots.js; the "shapes" are exact mathematical curves used to
 * learn how a rising line, a peak or a cycle sounds before listening to real data.
 */
(function (root, factory) {
  const deps =
    typeof module === 'object' && module.exports
      ? { snapshots: require('./snapshots.js'), feeds: require('../core/feeds.js'), csv: require('../core/csv.js') }
      : root.Bit2Beat;
  const mod = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Bit2Beat = root.Bit2Beat || {}).presets = mod;
})(typeof self !== 'undefined' ? self : this, function (deps) {
  'use strict';
  const { snapshots, feeds } = deps;
  const S = snapshots.SNAPSHOTS;
  const origin = (s) => ({ source: s.source, url: s.url, fetched: s.fetched, live: false, note: s.note || '' });

  const shape = (name, fn, n = 48) => ({
    name,
    kind: 'data',
    view: 'chart',
    origin: { source: 'Mathematical curve (exact)', url: '', fetched: '', live: false },
    labels: Array.from({ length: n }, (_, i) => `step ${i + 1}`),
    channels: [{ name, unit: '', values: Array.from({ length: n }, (_, i) => +fn(i / (n - 1)).toFixed(4)), instrument: 'soft' }],
  });

  const DATA = {
    climateCsv: () => {
      const text = 'Year,Temperature anomaly (°C),5-year smoothed (°C)\n' + S.gistemp.rows.map((r) => r.join(',')).join('\n');
      const parsed = deps.csv.parseCSV(text);
      return { name: 'NASA global temperature · CSV sample', kind: 'data', view: 'chart',
        origin: { ...origin(S.gistemp), note: 'NASA global temperature CSV sample: yearly anomaly and a five-year smoothed series.' },
        labels: parsed.labels, channels: parsed.cols.map((c, i) => ({ ...c, instrument: i ? 'strings' : 'soft' })) };
    },
    gistemp: () => ({
      name: 'Global temperature, 1880–2025',
      kind: 'data',
      view: 'chart',
      origin: origin(S.gistemp),
      labels: S.gistemp.rows.map((r) => String(r[0])),
      perLabel: 10,
      perName: 'decade',
      baseline: { value: 0, label: '1951–1980 average' },
      channels: [
        { name: 'Yearly anomaly', unit: '°C', values: S.gistemp.rows.map((r) => r[1]), instrument: 'soft' },
        { name: '5-year smoothed', unit: '°C', values: S.gistemp.rows.map((r) => r[2]), instrument: 'strings', mute: true },
      ],
    }),
    arcticAnnual: () => ({
      name: 'Arctic yearly temperature, 1981–2024',
      kind: 'data',
      view: 'chart',
      origin: origin(S.svalbardAnnual),
      labels: S.svalbardAnnual.rows.map((r) => String(r[0])),
      perLabel: 10,
      perName: 'decade',
      channels: [{ name: 'Yearly mean', unit: '°C', values: S.svalbardAnnual.rows.map((r) => r[1]), instrument: 'soft' }],
    }),
    arcticDaily: () =>
      feeds.dailySource({ title: 'Arctic daily weather, 2025', series: S.svalbardDaily.series, start: S.svalbardDaily.start, origin: origin(S.svalbardDaily) }),
    rising: () => shape('Rising line', (x) => x),
    peak: () => shape('Single peak', (x) => Math.exp(-(((x - 0.5) / 0.14) ** 2))),
    wave: () => shape('Two cycles', (x) => 0.5 + 0.5 * Math.sin(x * Math.PI * 4 - Math.PI / 2)),
    surge: () => shape('Slow, then fast', (x) => x ** 3),
  };

  const DATA_MENU = [
    ['NASA data', [['climateCsv', 'NASA global temperature · CSV sample'], ['gistemp', 'Global temperature 1880–2025 (GISTEMP)'], ['arcticAnnual', 'Arctic (Svalbard) yearly temperature 1981–2024 (POWER)'], ['arcticDaily', 'Arctic (Svalbard) daily weather 2025 (POWER)']]],
    ['Practice shapes', [['rising', 'Rising line'], ['peak', 'Single peak'], ['wave', 'Two cycles'], ['surge', 'Slow, then fast']]],
  ];

  return { DATA, DATA_MENU };
});
