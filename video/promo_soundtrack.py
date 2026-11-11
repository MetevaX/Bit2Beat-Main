"""
Bit2Beat promo · the music (30 s, 120 BPM, A minor: Am – F – C – G).

An energetic electronic track on the promo's beat grid, built only from synthesis:
drums (kick with sidechain pump, clap, hats, snare fill, crash, risers, sub drop), a sub bass,
a warm pad, and a pluck lead that plays NASA's temperature melody (the same notes as the app).
The promo's own notes (logo letters, counters, team portraits) come from
build/promo-events.json, written while the promo renders.

  0–3 s    intro: pad, data plucks, riser            3–6 s   logo: crash, half-time groove
  6–16 s   the app: full groove + data melody        16–19 s numbers: break, sub drop, riser
  19–26 s  the team: groove again, portrait bells    26–30 s end card: crash, final chord

Usage:  python video/promo_soundtrack.py [promo-events.json] [out.wav]
Writes 48 kHz / 24-bit stereo; render.sh masters it to -14 LUFS, -1 dBTP.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import film_soundtrack as fs  # noqa: E402  (instruments, hall, compressor, 24-bit writer)

SR = fs.SR
BEAT = 0.5
DUR = 30.0
rng = np.random.default_rng(120)
N = int((DUR + 0.5) * SR)
T = lambda n: np.arange(n) / SR  # noqa: E731


def band(x, lo=None, hi=None, order=2):
    if lo and hi:
        sos = butter(order, [lo / (SR / 2), hi / (SR / 2)], "bandpass", output="sos")
    elif lo:
        sos = butter(order, lo / (SR / 2), "highpass", output="sos")
    else:
        sos = butter(order, hi / (SR / 2), "lowpass", output="sos")
    return sosfilt(sos, x)


# ---------------------------------------------------------------- drums
def kick():
    t = T(int(0.5 * SR))
    f = 46 + 115 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24)
    click = band(rng.normal(0, 1, len(t)), hi=5000) * np.exp(-t / 0.002) * 0.35
    return 0.95 * np.tanh(1.4 * (body + click))


def clap():
    t = T(int(0.35 * SR))
    noise = band(rng.normal(0, 1, len(t)), 900, 3200)
    env = sum(np.where(t >= d, np.exp(-(t - d) / 0.006), 0) for d in (0, 0.011, 0.022)) + 0.55 * np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.11), 0)
    return 0.55 * noise * env


def hat(open_=False):
    t = T(int((0.35 if open_ else 0.08) * SR))
    return 0.22 * band(rng.normal(0, 1, len(t)), lo=7500) * np.exp(-t / (0.12 if open_ else 0.022))


def snare():
    t = T(int(0.25 * SR))
    return 0.4 * (band(rng.normal(0, 1, len(t)), 1500, 7000) * np.exp(-t / 0.07) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05))


def crash():
    t = T(int(2.4 * SR))
    return 0.3 * band(rng.normal(0, 1, len(t)), lo=4200) * np.exp(-t / 0.9)


def subdrop(length=1.2):
    t = T(int(length * SR))
    f = 30 + 45 * np.exp(-t / 0.35)
    return 0.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)


def riser(length):
    t = T(int(length * SR))
    ramp = (t / length) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (3 * t / length)) / SR) * 0.15
    noise = band(rng.normal(0, 1, len(t)), lo=1200) * 0.35
    return ramp * (noise + sweep)


# ---------------------------------------------------------------- tonal
def bass(midi, length):
    t = T(int(length * SR))
    f = fs.hz(midi)
    y = sum((1 / k) * np.exp(-k / 3.5) * np.sin(2 * np.pi * k * f * t) for k in range(1, 12) if k * f < 4000)
    y = y + 0.6 * np.sin(2 * np.pi * f * t)  # sub
    return 0.32 * y * fs.env_adsr(len(t), 0.004, min(0.05, length / 3))


def pluck(midi, length=0.32):
    t = T(int(length * SR))
    f = fs.hz(midi)
    y = sum((1 / k) * np.exp(-(5 + 2.4 * k) * t) * np.sin(2 * np.pi * k * f * t + rng.uniform(0, 6.28)) for k in range(1, 11) if k * f < 16000)
    return 0.26 * y * fs.env_adsr(len(t), 0.002, 0.06)


CHORDS = {  # bass root, pad notes
    "Am": (45, [57, 60, 64, 69]),
    "F": (41, [53, 57, 60, 65]),
    "C": (48, [55, 60, 64, 67]),
    "G": (43, [55, 59, 62, 67]),
}
PROG = ["Am", "F", "C", "G"]


def chord_at(t):
    return PROG[int(t // 2.0) % 4]


# ---------------------------------------------------------------- arrangement
def compose(events):
    drums_l, drums_r = np.zeros(N), np.zeros(N)
    music_l, music_r = np.zeros(N), np.zeros(N)
    fx_l, fx_r = np.zeros(N), np.zeros(N)
    kicks = []

    def put(bufs, t, y, gain=1.0, pan=0.0):
        i = int(t * SR)
        if i >= N:
            return
        y = y[: N - i] * gain
        p = (pan + 1) * np.pi / 4
        bufs[0][i : i + len(y)] += np.cos(p) * y
        bufs[1][i : i + len(y)] += np.sin(p) * y

    D, M, F = (drums_l, drums_r), (music_l, music_r), (fx_l, fx_r)
    K, C, Hc, Ho, S = kick(), clap(), hat(), hat(True), snare()

    def groove(t0, t1, full=True, half=False):
        b = t0
        while b < t1 - 1e-6:
            n = int(round((b - 6.0) / BEAT))
            if half:
                if int(round(b / BEAT)) % 2 == 0:
                    put(D, b, K, 0.9)
                    kicks.append(b)
            else:
                put(D, b, K, 1.0)
                kicks.append(b)
                if n % 2 == 1:
                    put(D, b, C, 0.9, 0.05)
            for s in range(4):  # 16th hats, accent the off-beat 8th
                ht = b + s * BEAT / 4
                if ht < t1:
                    put(D, ht, Ho if (s == 2 and full) else Hc, (0.9 if s == 2 else 0.45) * (1 if full else 0.6), 0.25 if s % 2 else -0.2)
            b += BEAT

    def bassline(t0, t1, eighths=True):
        step = BEAT / 2 if eighths else BEAT * 2
        t = t0
        while t < t1 - 1e-6:
            root = CHORDS[chord_at(t)][0]
            octave = 12 if (eighths and int(round(t / step)) % 2 == 1) else 0
            put(M, t, bass(root + octave, step * 0.9), 0.85)
            t += step

    def pads(t0, t1, gain=0.6):
        t = t0
        while t < t1 - 1e-6:
            length = min(2.0, t1 - t) + 0.4
            l, r = fs.pad([fs.hz(m) for m in CHORDS[chord_at(t)][1]], length)
            i = int(t * SR)
            n = min(len(l), N - i)
            music_l[i : i + n] += gain * 6 * l[:n]
            music_r[i : i + n] += gain * 6 * r[:n]
            t += 2.0

    melody = [m + 12 for m in fs_data()["gistemp"]["midi"]]

    def data_lead(t0, t1, gain=0.5):
        t, j = t0, 0
        while t < t1 - 1e-6:
            put(M, t, pluck(melody[j % len(melody)]), gain * (1.0 if j % 4 == 0 else 0.75), -0.35 + 0.7 * ((j % 8) / 7))
            t += BEAT / 2
            j += 1

    def arps(t0, t1, gain=0.32):
        t, j = t0, 0
        while t < t1 - 1e-6:
            notes = CHORDS[chord_at(t)][1]
            put(M, t, pluck(notes[j % 4] + 12, 0.22), gain, 0.4 if j % 2 else -0.4)
            t += BEAT / 4
            j += 1

    # 0–3 intro
    pads(0.0, 3.0, 0.5)
    data_lead(0.0, 3.0, 0.28)
    put(F, 1.4, riser(1.6), 0.8)
    # 3–6 logo
    put(D, 3.0, crash(), 0.8, 0.1)
    groove(3.0, 6.0, full=False, half=True)
    bassline(3.0, 6.0, eighths=False)
    pads(3.0, 6.0, 0.55)
    # 6–16 the app
    put(D, 6.0, crash(), 0.6, -0.1)
    groove(6.0, 15.0)
    bassline(6.0, 16.0)
    pads(6.0, 16.0, 0.5)
    data_lead(6.0, 16.0, 0.5)
    for k in range(8):  # snare fill into the break
        put(D, 15.0 + k * BEAT / 4, S, 0.35 + 0.08 * k)
    groove(15.0, 16.0, full=True)
    put(F, 15.0, riser(1.0), 0.9)
    # 16–19 numbers: break
    put(D, 16.0, subdrop(1.4), 1.0)
    pads(16.0, 19.0, 0.65)
    put(F, 18.0, riser(1.0), 1.0)
    # 19–26 the team
    put(D, 19.0, crash(), 0.8, 0.1)
    groove(19.0, 25.5)
    bassline(19.0, 25.5)
    pads(19.0, 26.0, 0.5)
    arps(19.0, 25.5, 0.26)
    for k in range(4):
        put(D, 25.5 + k * BEAT / 4, S, 0.4 + 0.1 * k)
    put(F, 25.0, riser(1.0), 0.9)
    # 26–30 end card: a long C chord over the crash
    put(D, 26.0, crash(), 0.9)
    put(D, 26.0, subdrop(1.8), 0.9)
    l, r = fs.pad([fs.hz(m) for m in (48, 55, 60, 62, 64, 67)], 4.2)
    i = int(26.0 * SR)
    music_l[i : i + len(l)] += 4.5 * l
    music_r[i : i + len(r)] += 4.5 * r
    put(M, 26.0, bass(36, 3.5), 0.5)

    # the promo's own notes (logo letters, counters, portraits)
    for ev in events:
        g = 10 ** (ev["db"] / 20)
        voice = fs.VOICES.get(ev["voice"], fs.bell)
        put(F, ev["t"], voice(fs.hz(ev["midi"]), min(1, g * 2)), g * 1.8, ev.get("pan", 0))

    # sidechain: pad and bass duck under every kick (the "pump")
    duck = np.ones(N)
    tau = int(0.32 * SR)
    shape = 1 - 0.6 * np.exp(-np.arange(tau) / (0.1 * SR))
    for tk in kicks:
        i = int(tk * SR)
        n = min(tau, N - i)
        duck[i : i + n] = np.minimum(duck[i : i + n], shape[:n])
    music_l *= duck
    music_r *= duck

    # glue: hall on music and fx, a little on the drums; then the master
    irl, irr = fs.hall(2.0, 0.018)
    hp = butter(2, 220 / (SR / 2), "highpass", output="sos")
    send_l = sosfilt(hp, music_l + fx_l + 0.15 * drums_l)
    send_r = sosfilt(hp, music_r + fx_r + 0.15 * drums_r)
    wet_l = fftconvolve(send_l, irl)[:N]
    wet_r = fftconvolve(send_r, irr)[:N]
    L = drums_l + music_l + fx_l + 0.22 * wet_l
    R = drums_r + music_r + fx_r + 0.22 * wet_r
    dc = butter(1, 25 / (SR / 2), "highpass", output="sos")
    L, R = sosfilt(dc, L), sosfilt(dc, R)
    L, R = fs.compress(L, R, threshold_db=-16, ratio=3.0, attack=0.008, release=0.18)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
    L, R = 0.89 * L / peak, 0.89 * R / peak
    fade = int(0.6 * SR)
    end = int(DUR * SR)
    L[end - fade : end] *= np.linspace(1, 0, fade)
    R[end - fade : end] *= np.linspace(1, 0, fade)
    L, R = resample_poly(L[:end], 1, 2), resample_poly(R[:end], 1, 2)
    return np.stack([L, R], axis=1)


def fs_data():
    return json.loads((ROOT / "film-data.json").read_text())


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "promo-events.json"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "build" / "promo-raw.wav"
    events = json.loads(src.read_text())["events"] if src.exists() else []
    audio = compose(events)
    out.parent.mkdir(parents=True, exist_ok=True)
    fs.write24(out, audio)
    print(f"Promo music: {out} · {DUR:.0f} s · {len(events)} hits · 48 kHz / 24-bit stereo")
