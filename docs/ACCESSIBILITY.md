# Accessibility

Bit2Beat exists to make Earth data available to people who cannot see a chart, so accessibility is part of every feature rather than an add-on.

## Listening without seeing

- **Everything is reachable by keyboard.** Tabs move with arrow keys; `Space` plays; `←`/`→` step through the data and play each step; `Shift` jumps a bar; `Home`/`End` go to the ends. Menus open with `↓`, `Enter` or `Space`; longer ones have a search box (a combobox with a listbox, announced with the current choice).
- **Captions** state exactly what is sounding: “Yearly anomaly 1.28 °C → C5”.
- **Screen-reader updates** (optional) announce the caption every few seconds while playing; every action (play, source change, export) is announced through a polite live region.
- **What the data says** gives the trend, extremes and sudden jumps in plain sentences and can be read aloud (`D`). Reading is sentence by sentence with **Pause / Resume** and **Stop** in a bar at the top of the screen; `Esc` or `D` again stops it.
- **Readings table** (`T`) lists every value, note, frequency and time as a real HTML table.
- **Canvas descriptions.** The chart, map and picture have text alternatives that name the source and the number of steps and point to the table and summary.
- **Reference tone** and **ticks on sudden jumps** turn visual features (a baseline, an outlier) into sound.
- **Bitty’s story** works without seeing: every chapter is a heading with its narration, a *Listen for* hint and facts as text; Bitty can read each chapter aloud (speech synthesis) before the music; *Play the whole story* moves on by itself, so a listener only presses one button. Narration can be paused, resumed, skipped to the music or stopped.
- **Bitty’s guide** (`G`) is a non-modal dialog that takes focus, names each control in words, works with `Tab`/`Enter`, closes with `Esc`, and never blocks the page: *Skip* is always one click. Its menu explains the whole studio or one tab at a time. It says hello once and can be reopened at any time.
- **Videos** are described by their data (forest height, CO₂) rather than only by brightness, and every sample can be stepped through with the keyboard while the picture shows the matching frame.

## Seeing more clearly

- Dark theme and a higher-contrast mode (stronger borders and text).
- Text size from 100 % to 160 %.
- Larger buttons (bigger targets for touch and motor impairments).
- Reduce motion stops animations and transitions (including Bitty’s wagging tail and the tour’s pulsing ring) (and skips redrawing the map on every note); the system setting is respected by default.
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
