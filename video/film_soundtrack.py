"""
Bit2Beat film · the score.

Reads build/events.json (written by bit2beat_algorithm.py while it renders: every note with its
time, loudness, stereo position and instrument) and synthesises a studio-quality stereo score:

  * 96 kHz internal synthesis, written as 48 kHz / 24-bit PCM (band-limited, no aliasing)
  * instruments: piano (inharmonic partials, two-stage decay, hammer), marimba (tuned bar modes),
    bell (for the logo), glass (soft sine pluck for pictures), warm pad (logo chords only)
  * equal-power stereo panning, gentle stereo width per note
  * stereo convolution hall (pre-delay, frequency-dependent decay), high-pass on the reverb
  * master: DC removal, soft-knee peak control; loudness is set by ffmpeg's two-pass loudnorm
    in render.sh (-16 LUFS, true peak -1 dBTP)

Usage:  python video/film_soundtrack.py [events.json] [out.wav]
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parent
SR = 96000  # synthesis rate
OUT_SR = 48000
rng = np.random.default_rng(2026)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, attack, release, sr=SR):
    e = np.ones(n)
    a = max(1, int(attack * sr))
    r = max(1, int(release * sr))
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e


# ---------------------------------------------------------------- instruments (mono, then panned)
def piano(f, vel, dur=2.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    B = 0.00035  # string inharmonicity
    y = np.zeros(n)
    bright = 0.55 + 0.45 * vel
    for k in range(1, 16):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 18000:
            break
        amp = (bright ** (k - 1)) / k ** 0.9
        fast = 2.5 + 0.9 * k + f / 600  # first, fast decay (the "ping")
        slow = 0.35 + 0.18 * k + f / 2000  # long tail
        e = 0.65 * np.exp(-fast * t) + 0.35 * np.exp(-slow * t)
        detune = 1 + (rng.normal(0, 0.00025))
        y += amp * e * np.sin(2 * np.pi * fk * detune * t + rng.uniform(0, 2 * np.pi))
    # felt hammer: a few ms of soft, low-passed noise
    hn = int(0.012 * SR)
    hammer = rng.normal(0, 1, hn) * np.exp(-np.linspace(0, 7, hn))
    hammer = sosfilt(butter(2, min(0.45, 4 * f / SR * 8), output="sos"), hammer)
    y[:hn] += 0.12 * vel * hammer
    return y * env_adsr(n, 0.002, 0.25) * 0.22


def marimba(f, vel, dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, dec in [(1.0, 1.0, 3.2), (3.93, 0.32 * vel, 11.0), (9.2, 0.09 * vel, 24.0)]:
        if ratio * f < 18000:
            y += amp * np.exp(-dec * t) * np.sin(2 * np.pi * ratio * f * t)
    # mallet thump
    y += 0.25 * vel * np.exp(-60 * t) * np.sin(2 * np.pi * f * 0.5 * t)
    return y * env_adsr(n, 0.0015, 0.15) * 0.17


def bell(f, vel, dur=3.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, dec in [(1.0, 1.0, 0.9), (2.0, 0.45, 1.4), (2.76, 0.32, 2.0), (5.4, 0.16, 3.2), (8.93, 0.07, 4.5)]:
        if ratio * f < 18000:
            y += amp * np.exp(-dec * t) * np.sin(2 * np.pi * ratio * f * t + rng.uniform(0, 6.28))
    return y * env_adsr(n, 0.003, 0.4) * 0.17 * (0.6 + 0.4 * vel)


def glass(f, vel, dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) + 0.06 * np.sin(2 * np.pi * 3 * f * t)
    return y * np.exp(-2.2 * t) * env_adsr(n, 0.008, 0.3) * 0.2


def pad(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)
    for f in freqs:
        for side, cents in [(left, -6), (right, 6), (left, 2), (right, -2)]:
            fd = f * 2 ** (cents / 1200)
            for k in range(1, 9):  # soft saw, partials falling fast = warm
                if k * fd > 12000:
                    break
                side += (0.5 ** (k - 1)) / k * np.sin(2 * np.pi * k * fd * t + rng.uniform(0, 6.28))
    e = env_adsr(n, min(1.2, length / 3), min(2.0, length / 2.5))
    sos = butter(2, 2400 / (SR / 2), output="sos")
    return sosfilt(sos, left * e) * 0.035, sosfilt(sos, right * e) * 0.035


VOICES = {"piano": piano, "marimba": marimba, "bell": bell, "glass": glass}


# ---------------------------------------------------------------- reverb
def hall(seconds=2.4, predelay=0.022):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):  # decorrelated left / right
        noise = rng.normal(0, 1, n)
        bands = [(None, 600, 0.75), (600, 3000, 0.5), (3000, None, 0.28)]  # (low, high, RT-ish seconds)
        ir = np.zeros(n)
        for lo, hi, rt in bands:
            if lo is None:
                sos = butter(2, hi / (SR / 2), "lowpass", output="sos")
            elif hi is None:
                sos = butter(2, lo / (SR / 2), "highpass", output="sos")
            else:
                sos = butter(2, [lo / (SR / 2), hi / (SR / 2)], "bandpass", output="sos")
            ir += sosfilt(sos, noise) * np.exp(-6.9 * t / rt)
        ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


# ---------------------------------------------------------------- render
def render(events, duration):
    n = int((duration + 0.5) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for ev in events:
        start = int(ev["t"] * SR)
        if start >= n:
            continue
        gain = 10 ** (ev["db"] / 20)
        if ev["voice"] == "pad":
            l, r = pad([hz(m) for m in ev["midi"]], ev.get("len", 4.0))
            end = min(n, start + len(l))
            L[start:end] += gain * l[: end - start]
            R[start:end] += gain * r[: end - start]
            continue
        vel = min(1.0, max(0.2, gain * 1.6))
        y = VOICES.get(ev["voice"], piano)(hz(ev["midi"]), vel) * gain
        p = (ev.get("pan", 0) + 1) * np.pi / 4  # equal-power pan
        end = min(n, start + len(y))
        seg = y[: end - start]
        # a touch of width: right channel 0.25 ms later for off-centre notes
        lag = int(abs(ev.get("pan", 0)) * 0.00025 * SR)
        L[start:end] += np.cos(p) * seg
        if lag and end - start > lag:
            R[start + lag : end] += np.sin(p) * seg[: end - start - lag]
        else:
            R[start:end] += np.sin(p) * seg
    # stereo hall, high-passed so the low end stays clean
    irl, irr = hall()
    hp = butter(2, 180 / (SR / 2), "highpass", output="sos")
    send_l, send_r = sosfilt(hp, L), sosfilt(hp, R)
    wet_l = fftconvolve(send_l, irl)[:n] + 0.35 * fftconvolve(send_r, irl)[:n]
    wet_r = fftconvolve(send_r, irr)[:n] + 0.35 * fftconvolve(send_l, irr)[:n]
    L = L + 0.32 * wet_l
    R = R + 0.32 * wet_r
    # master: remove DC / sub rumble, gentle bus compression, soft-knee peak control
    dc = butter(1, 25 / (SR / 2), "highpass", output="sos")
    L, R = sosfilt(dc, L), sosfilt(dc, R)
    L, R = compress(L, R)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-9)
    L, R = L / peak * 0.85, R / peak * 0.85
    knee = 0.7
    for ch in (L, R):
        over = np.abs(ch) > knee
        ch[over] = np.sign(ch[over]) * (knee + (1 - knee) * np.tanh((np.abs(ch[over]) - knee) / (1 - knee)))
    # fade the very end, cut to the film length, 96 → 48 kHz with a proper anti-alias filter
    fade = int(0.4 * SR)
    L[-fade:] *= np.linspace(1, 0, fade)
    R[-fade:] *= np.linspace(1, 0, fade)
    L = resample_poly(L[: int(duration * SR)], 1, 2)
    R = resample_poly(R[: int(duration * SR)], 1, 2)
    return np.stack([L, R], axis=1)


def compress(L, R, threshold_db=-20.0, ratio=2.5, attack=0.012, release=0.25):
    """Stereo-linked RMS compressor: evens out loud and quiet passages without pumping."""
    from scipy.signal import lfilter

    power = 0.5 * (L * L + R * R)
    a_att, a_rel = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    # smooth with the release time, then let peaks through faster with the attack time
    slow = lfilter([1 - a_rel], [1, -a_rel], power)
    fast = lfilter([1 - a_att], [1, -a_att], power)
    level_db = 10 * np.log10(np.maximum(np.maximum(slow, fast), 1e-12))
    ref = 10 * np.log10(np.max(slow) + 1e-12)  # threshold relative to the loudest moment
    over = np.maximum(0, level_db - (ref + threshold_db + 20))
    gain = 10 ** (-over * (1 - 1 / ratio) / 20)
    return L * gain, R * gain


def write24(path, stereo):
    x = np.clip(stereo, -1, 1 - 2 ** -23)
    ints = np.round(x * (2 ** 23 - 1)).astype("<i4")
    raw = ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()  # little-endian 24-bit
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(OUT_SR)
        w.writeframes(raw)


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "events.json"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "build" / "score.wav"
    data = json.loads(src.read_text())
    audio = render(data["events"], data["duration"])
    out.parent.mkdir(parents=True, exist_ok=True)
    write24(out, audio)
    print(f"Score: {out} · {data['duration']:.2f} s · {len(data['events'])} notes · 48 kHz / 24-bit stereo")
