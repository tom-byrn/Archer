"""Mix the soundtrack: the music bed plus soft UI clicks where the cursor clicks.

    PYTHONPATH=<pylib> python3 music/mix.py [music.wav] [events.json] [out.wav]

events.json comes from compose/render.cjs (one entry per click it rendered).
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DURATION = 100.8
FADE = 0.4  # safety fade; the music already ends in silence


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float32) / 2147483648.0
    else:
        x = x.astype(np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    if sr != SR:
        raise SystemExit(f"expected {SR} Hz, got {sr}")
    return x


def click():
    """A soft trackpad-style tick: a damped 2.6 kHz partial over a short noise transient."""
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    tone = np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012) * 0.5
    noise = rng.standard_normal(n) * np.exp(-t / 0.0025)
    # Gentle high-pass on the noise (first difference) so it reads as a tap, not a thud.
    noise = np.concatenate([[0.0], np.diff(noise)]) * 0.35
    x = tone * 0.6 + body + noise
    x *= 10 ** (-24 / 20) / np.max(np.abs(x))
    return np.stack([x, x], axis=1).astype(np.float32)


def main():
    music_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "music" / "music.wav"
    events_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "out" / "events.json"
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "out" / "soundtrack.wav"

    total = int(round(DURATION * SR))
    mix = np.zeros((total, 2), dtype=np.float32)
    music = load(music_path)[:total]
    mix[: len(music)] += music

    events = json.loads(events_path.read_text()) if events_path.exists() else []
    tick = click()
    placed = 0
    for e in events:
        if e.get("type") != "click":
            continue
        i = int(round(e["t"] * SR))
        if 0 <= i < total:
            j = min(total, i + len(tick))
            mix[i:j] += tick[: j - i]
            placed += 1

    n = int(FADE * SR)
    mix[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)[:, None] ** 2

    peak = float(np.max(np.abs(mix)))
    if peak > 0.891:  # keep ≤ −1 dBFS
        mix *= 0.891 / peak
    wavfile.write(out_path, SR, mix.astype(np.float32))
    rms = float(np.sqrt(np.mean(mix**2)))
    print(f"{out_path}: {placed} clicks, peak {20*np.log10(max(1e-9, np.max(np.abs(mix)))):.1f} dBFS, rms {20*np.log10(max(1e-9, rms)):.1f} dBFS")


if __name__ == "__main__":
    main()
