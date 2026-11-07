# Bit2Beat — Listen to Earth

Standalone Manim Community explainer. The website is not modified by this film.

## Story

1. A waveform introduces Bit2Beat.
2. Real NASA GISTEMP bucket averages become a normalized curve.
3. Actual normalized values select notes in C pentatonic; highlighted keys match the soundtrack.
4. A scan crosses a NASA GEDI image; its measured brightness drives the foreground notes.
5. Video frames yield brightness, detail and frame-change channels. The graph and sound use the bundled GEDI video's measurements. Six representative frames illustrate the 48-sample process.
6. Twelve earthquakes selected across the bundled USGS sample are played from west to east, with the app's pitch and gain values and geographic stereo panning.
7. The common source → measure → map → listen pipeline closes the film.

The original stereo score is synthesized at 48 kHz. Sonification notes use the app's MIDI values; the timbres and reverb are designed for this film. A quiet C-based background pad is decorative, not a data channel. The film explains selected stages, with simplified sample counts for readability. Its scene pacing is editorial rather than the app's selected tempo. Visual measurements do not recover physical forest height or CO₂ concentrations.

## Reproduce

Install the pinned Manim Community dependency in an isolated Python environment. FFmpeg and font support are required. No LaTeX is needed.

```sh
node video/export-data.js
python -m manim -qh --fps 60 --media_dir video/render video/bit2beat_film.py Bit2BeatFilm
python video/make_soundtrack.py
ffmpeg -y -i video/output/soundtrack-float.wav -af loudnorm=I=-16:TP=-1.5:LRA=9 -ar 48000 -c:a pcm_s24le video/output/Bit2Beat-Soundtrack.wav
ffmpeg -y -i video/render/videos/bit2beat_film/1080p60/Bit2BeatFilm.mp4 -i video/output/Bit2Beat-Soundtrack.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -movflags +faststart -shortest video/output/Bit2Beat-Algorithms-1080p60.mp4
```

`timing.json` is written by Manim after rendering and drives sample-accurate sound placement. `algorithm-data.json` is exported from the actual app modules. The small RGBA image-analysis input is a 160×90 version of the bundled GEDI still; the six frame images come from the bundled GEDI preview.

NASA media credits and original download URLs: `../assets/nasa/README.md` and `../assets/nasa/sources.json`. Climate data: NASA GISS GISTEMP. Events: USGS. No NASA endorsement is implied.
