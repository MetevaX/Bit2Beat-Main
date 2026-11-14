#!/usr/bin/env bash
# Renders the two-minute, 3Blue1Brown-style algorithm film: Manim Community + LaTeX at 60 fps, with a studio-quality
# score (48 kHz / 24-bit stereo, mastered to -16 LUFS, true peak -1.5 dBTP).
#   bash video/render.sh            1920×1080, 60 fps → video/output/Bit2Beat-Algorithm.mp4
#   bash video/render.sh 4k         3840×2160, 60 fps → video/output/Bit2Beat-Algorithm-4k.mp4
#   bash video/render.sh preview     854×480,  60 fps → video/output/Bit2Beat-Algorithm-preview.mp4
#   bash video/render.sh promo       the 30-second promo, 1080p60 (also promo-4k, promo-preview) → video/output/Bit2Beat-Promo*.mp4
# Also written: the lossless score (…-score.wav, 24-bit) and a contact sheet (…-contact.png).
#   bash video/render.sh setup      once: makes video/.venv with Manim (asks for the system packages it needs)
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "setup" ]; then
  echo "→ System packages Manim needs (cairo, pango, LaTeX, FFmpeg, Python headers)"
  sudo apt install -y python3-venv python3-dev pkg-config libcairo2-dev libpango1.0-dev ffmpeg texlive texlive-latex-extra
  echo "→ Python environment video/.venv with Manim Community"
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip wheel
  .venv/bin/python -m pip install manim scipy
  .venv/bin/python -c "import manim; print('Manim', manim.__version__, 'is ready. Now run: bash video/render.sh preview')"
  exit 0
fi

# use video/.venv automatically when it exists (or PYTHON=/path/to/python)
if [ -z "${PYTHON:-}" ] && [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY="${PYTHON:-python3}"; fi

"$PY" -c "import manim, scipy" 2>/dev/null || { echo "Manim is not installed for $PY."; echo "Run once:  bash video/render.sh setup   (or set PYTHON=/path/to/the/python that has Manim)"; exit 1; }
command -v latex >/dev/null && command -v dvisvgm >/dev/null || { echo "LaTeX is needed for the formulas. On Ubuntu/Debian: sudo apt install texlive texlive-latex-extra  (dvisvgm comes with it)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "FFmpeg is needed: sudo apt install ffmpeg"; exit 1; }

# the film (default) or the 30-second promo
case "${1:-}" in
  promo|promo-*) FILE=promo; SCENE=Bit2BeatPromo; MUSIC=promo_soundtrack.py; EVENTS=build/promo-events.json; LUFS=-14; BASE=Bit2Beat-Promo; MODE="${1#promo}"; MODE="${MODE#-}" ;;
  *)             FILE=bit2beat_algorithm; SCENE=Bit2BeatAlgorithm; MUSIC=film_soundtrack.py; EVENTS=build/events.json; LUFS=-16; BASE=Bit2Beat-Algorithm; MODE="${1:-}" ;;
esac
case "$MODE" in
  preview) Q=-ql; RES=480p60;  NAME=$BASE-preview ;;
  4k)      Q=-qk; RES=2160p60; NAME=$BASE-4k ;;
  *)       Q=-qh; RES=1080p60; NAME=$BASE ;;
esac

if [ "$MODE" != preview ] && [ -z "${SKIP_CHECK:-}" ]; then
  # a tiny, fast pass of the whole scene first, so a mistake shows up in about a minute, not after the long render
  echo "→ 0/4 Quick check (the whole scene at 256×144, 10 fps)"
  "$PY" -m manim -r 256,144 --fps 10 --disable_caching --media_dir build/check "$FILE.py" "$SCENE" \
    || { echo; echo "The quick check failed, so the full render was not started. Send the error above."; exit 1; }
fi
echo "→ 1/4 Animation (Manim, 60 fps): $SCENE"
"$PY" -m manim $Q --fps 60 --disable_caching --media_dir build/media "$FILE.py" "$SCENE"
VIDEO="build/media/videos/$FILE/$RES/$SCENE.mp4"

echo "→ 2/4 Sound (96 kHz synthesis → 48 kHz / 24-bit stereo)"
"$PY" "$MUSIC" "$EVENTS" build/score-raw.wav

echo "→ 3/4 Mastering (two-pass EBU R128: $LUFS LUFS, -1.5 dBTP)"
MEASURE=$(ffmpeg -hide_banner -nostats -i build/score-raw.wav -af loudnorm=I=$LUFS:TP=-1.5:LRA=22:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$MEASURE" | "$PY" -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
mkdir -p output
ffmpeg -hide_banner -loglevel error -y -i build/score-raw.wav \
  -af "loudnorm=I=$LUFS:TP=-1.5:LRA=22:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -ar 48000 -c:a pcm_s24le "output/$NAME-score.wav"

echo "→ 4/4 Mux (video copied untouched, AAC 320 kb/s 48 kHz stereo)"
ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -i "output/$NAME-score.wav" -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -ac 2 -movflags +faststart -shortest "output/$NAME.tmp.mp4"
mv "output/$NAME.tmp.mp4" "output/$NAME.mp4"
SHEET_FPS=1/5; [ "$FILE" = promo ] && SHEET_FPS=2/5
ffmpeg -hide_banner -loglevel error -y -i "output/$NAME.mp4" -vf "fps=$SHEET_FPS,scale=480:-1,tile=4x3:padding=4:color=0x0B0B0D" -frames:v 1 "output/$NAME-contact.png"

echo
echo "Done: video/output/$NAME.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "output/$NAME.mp4" | cut -d. -f1) s, $(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "output/$NAME.mp4") fps)"
echo "Lossless score: video/output/$NAME-score.wav   ·   Contact sheet: video/output/$NAME-contact.png"
