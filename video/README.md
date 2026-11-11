# Bit2Beat films

## Promo (`promo.py`, 30 seconds)

A beat-cut promo for the judges: 60 fps, LaTeX text on 3Blue1Brown black, every cut on the 120 BPM grid of its own track.

| Time | What you see (and hear) |
| --- | --- |
| 0:00 | NASA's temperature curve draws itself; *What does our planet sound like?* word by word |
| 0:03 | Data bits fly together into **Bit**; a playhead reveals **2Beat**; *Listen to Earth data.* |
| 0:06 | Five real screenshots of the app, one per bar: climate, earthquakes, NASA videos, Bitty's story, the guide |
| 0:16 | 146 years of NASA temperature · 91 earthquakes in one week · **For everyone**: built for people who can't see a chart |
| 0:19 | *Made by Team Bit2Beat*: George, Mina, Steven, Mostafa Ragab and Mostafa Mohammed, one per beat; a playhead plays each of us as a note |
| 0:26 | The logo and *Listen to Earth.* |

The music (`promo_soundtrack.py`) is synthesised on the same grid: kick with sidechain pump, clap, hats, snare fills, risers, sub drops, a bass and pad in A minor (Am – F – C – G), and a pluck lead playing NASA's temperature melody (the app's own notes). Mastered to -14 LUFS, true peak -1.5 dBTP.

```sh
bash video/render.sh promo-preview   # quick draft
bash video/render.sh promo           # 1920×1080, 60 fps → video/output/Bit2Beat-Promo.mp4
bash video/render.sh promo-4k        # 3840×2160, 60 fps
```

The louder, effects-heavy version (spectrum visualiser, flashes, whip pans) is kept in `versions/promo-v2-banger/`.

Assets: `assets/shots/` (2× screenshots of the current app), `assets/team/` (round portraits made from `../assets/team/`).

## How the algorithm works (`bit2beat_algorithm.py`, about 2 minutes)

A 3Blue1Brown-style Manim Community film at **60 fps**: black background, every word typeset in **LaTeX**, cream text, amber for the data and blue for the maths, and a studio-quality score made from the same notes the app plays. Each step of the algorithm is shown as **arrays**, with the real numbers the app computes.

| Time | Part | What you see |
| --- | --- | --- |
| 0:00 | Logo | Bits of data stack into a bar chart, fly into the pixel letters **Bit**; an amber playhead reveals **2Beat**. |
| 0:08 | Outline | The four chapters, each with a live preview on a screen. Before every chapter the outline returns (finished chapters ticked) and the preview zooms to full screen. |
| 0:15 | Chapter 1 · Numbers become an array | GISTEMP's curve becomes the array $\mathbf{x}$ (dots fly into cells); $x_{\min}$ and $x_{\max}$ are circled; $v_i = \frac{x_i - x_{\min}}{x_{\max} - x_{\min}}$, then the same rule with the numbers in; every cell turns into the array $\mathbf{v} \in [0,1]^{30}$. |
| 0:36 | Chapter 2 · Values become notes | $\mathbf{v} \to \mathbf{k} = \operatorname{round}(\mathbf{v}(n-1))$ (worked example), $\mathbf{m} = \texttt{scale}[\mathbf{k}]$ (lookup arrow into the C-pentatonic array), $\mathbf{f} = 440\cdot2^{(\mathbf{m}-69)/12}$, $t_i = i\cdot 30/\mathrm{BPM}$; then a piano roll builds while all 30 notes play. |
| 1:05 | Chapter 3 · Earth events | 91 USGS quakes on the map; six sample rows $(\lambda, \varphi, M)$ in time order are **sorted by longitude**; new columns pitch $v$ and loudness $g = 0.45 + 0.55\,s$; one west-to-east sweep with marimba notes. |
| 1:30 | Chapter 4 · Pictures and video | A region of the NASA GEDI picture becomes an array of pixels; one pixel goes $(R,G,B) \to Y \to L^{*}$; the picture is cut into 24 bands, $\bar L^{*}$ per band (background $= \varnothing$, silent) fills an array while bars and notes appear. |
| 1:52 | Summary | $\mathbf{x} \to \mathbf{v} \to \mathbf{k} \to \mathbf{m} \to \mathbf{f}, \mathbf{t}$ → one plan → sound, score, readings table, WAV & ADM export; the logo returns: *Listen to Earth.* |

All 173 LaTeX strings in the film were compiled with Manim's own templates before release.

### Sound

The animation is rendered silent; while it renders, every note is logged with its exact time, loudness, stereo position and instrument (`build/events.json`). `film_soundtrack.py` then synthesises the score:

- 96 kHz internal synthesis, delivered as **48 kHz / 24-bit stereo** (properly band-limited);
- instruments: piano with inharmonic partials and a felt hammer (data), marimba (earthquakes, as in the app), bells (logo), a soft glass tone (pictures), and a quiet pad bed under each part (decoration, not data);
- equal-power panning that follows the picture: left to right across the chart and the picture, by longitude for earthquakes;
- a stereo convolution hall, gentle bus compression and two-pass EBU R128 mastering to **-16 LUFS, true peak -1.5 dBTP**;
- muxed as AAC 320 kb/s; the lossless 24-bit master is kept as `output/…-score.wav`.

All numbers and notes come from the app's own algorithm: `film-data.json` was exported from `src/js/core/plan.js`, `music.js` and `feeds.js` (GISTEMP with 30 steps on its own scale, C pentatonic over two octaves, tempo 96 BPM, the bundled USGS week and six sample quakes in feed order), and the picture bands and the pixel patch were measured from `assets/nasa/gedi.jpg` the same way the app does (CIE L*, background and colour bar left out). The pads under the logo and the chapters are decoration, not data.

### Render

You need Manim Community (`pip install manim`, in your usual Manim environment; it brings numpy and scipy), FFmpeg and LaTeX:

```sh
bash video/render.sh setup                        # once: system packages + video/.venv with Manim
bash video/render.sh preview                      # quick 480p60 draft
bash video/render.sh                              # final 1920×1080, 60 fps, with the mastered score
bash video/render.sh 4k                           # optional 3840×2160, 60 fps
```

The result is `video/output/Bit2Beat-Algorithm.mp4` (or `-preview.mp4`, `-4k.mp4`), the lossless score `…-score.wav` and a contact sheet `…-contact.png` with one frame every 5 seconds. `render.sh` uses `video/.venv` automatically; set `PYTHON=/path/to/python` to use another environment.

Files: `bit2beat_algorithm.py` (the film), `film_soundtrack.py` (the score), `film-data.json` (numbers from the app), `assets/wordmark-beat.png` (the “2Beat” half of the logo; “Bit” is drawn from its 37 squares), `render.sh`.

## Earlier film: Bit2Beat — Listen to Earth (`bit2beat_film.py`)

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
