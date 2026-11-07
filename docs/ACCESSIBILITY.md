# Accessibility

Bit2Beat exists to make Earth data available to people who cannot see a chart, so accessibility is part of every feature rather than an add-on.

## Listening without seeing

- **Everything is reachable by keyboard.** Tabs move with arrow keys; `Space` plays; `←`/`→` step through the data and play each step; `Shift` jumps a bar; `Home`/`End` go to the ends.
- **Captions** state exactly what is sounding: “Yearly anomaly 1.28 °C → C5”.
- **Screen-reader updates** (optional) announce the caption every few seconds while playing; every action (play, source change, export) is announced through a polite live region.
- **What the data says** gives the trend, extremes and sudden jumps in plain sentences and can be read aloud (`D`).
- **Readings table** (`T`) lists every value, note, frequency and time as a real HTML table.
- **Canvas descriptions.** The chart, map and picture have text alternatives that name the source and the number of steps and point to the table and summary.
- **Reference tone** and **ticks on sudden jumps** turn visual features (a baseline, an outlier) into sound.
- **Videos** are described by their data (forest height, CO₂) rather than only by brightness, and every sample can be stepped through with the keyboard while the picture shows the matching frame.

## Seeing more clearly

- Dark theme and a higher-contrast mode (stronger borders and text).
- Text size from 100 % to 160 %.
- Larger buttons (bigger targets for touch and motor impairments).
- Reduce motion stops animations and transitions (and skips redrawing the map on every note); the system setting is respected by default.
- Colours: navy on cream (contrast well above WCAG AA); the amber used for text is darkened to `#8A5A12` for AA contrast on cream.
- Channel colours are never the only cue: each channel is also named in the legend, captions and table.

## Hearing more clearly

- **Mono audio** for listeners with hearing in one ear.
- Binaural output adds height cues on ordinary headphones.
- Pentatonic default scale avoids harsh intervals; Chromatic gives the finest pitch resolution.

## Testing checklist

- Tab through the whole page: every control has a visible focus ring and a label.
- Use the studio with a screen reader (NVDA, VoiceOver, TalkBack): source name, step, note and value are announced.
- Zoom to 200 %: no content is cut off; the layout becomes one column below 1100 px.
- Turn on high contrast, dark theme and larger buttons together.
