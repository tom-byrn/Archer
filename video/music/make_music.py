#!/usr/bin/env python3
"""Temp music bed for the Archer launch video (100.8 s, D major, 100 BPM).

Pure numpy/scipy synthesis - no samples, no downloads. Band-limited wavetable
pads, additive and FM plucks, noise-based drums, a synthetic convolution
reverb and a ping-pong delay, then a gentle master chain (glue compression,
loudness normalisation to TARGET_LUFS, look-ahead peak limiting, end fade).

Writes next to this file:
  music.wav        48 kHz / 24-bit PCM stereo, exactly N_BARS bars + TAIL_SEC
  spectrogram.png  spectrogram with bars, sections and impacts marked, plus a
                   level strip (sample peak and RMS in dBFS)

Usage - edit the CONFIG block, then:
  python3 make_music.py            (--no-plot skips the PNG)
Deterministic: every random source is derived from SEED.
"""
from __future__ import annotations

import argparse
import itertools
import os
import struct
import sys
import time
import zlib

import numpy as np
from scipy import signal
from scipy.io import wavfile

# =============================================================================
# CONFIG - everything a re-edit is likely to touch lives here.
# Bars are 1-indexed: bar n starts at (n - 1) * BAR seconds. In code, beats are
# 0-based fractions within a bar (beat 0.0 = downbeat, 2.0 = beat 3).
# =============================================================================
SR = 48_000                  # sample rate (Hz)
BPM = 100.0                  # at 100 BPM: 1 beat = 0.6 s, 1 bar = 2.4 s
BEATS_PER_BAR = 4
N_BARS = 41                  # arrangement length (41 bars at 100 BPM = 98.4 s)
TAIL_SEC = 2.4               # ring-out after the last bar (one bar), ending in digital silence
SEED = 20260923              # master seed for all noise, phases and humanising

# ---- Harmony: one chord per bar, cycling from bar 1 ----------------------------
KEY = "D major"              # label only (plot title); the notes come from CHORDS
CHORDS = {                   # pitch classes, ROOT FIRST (the root feeds bass + root layer)
    "Dmaj9": "D F# A C# E",
    "Bm9":   "B D F# A C#",
    "Gmaj9": "G B D F# A",
    "Asus4": "A D E",
    "A":     "A C# E",
}
CHORD_CYCLE = [              # one entry per bar: [(chord, beats), ...] summing to BEATS_PER_BAR
    [("Dmaj9", 4)],
    [("Bm9", 4)],
    [("Gmaj9", 4)],
    [("Asus4", 2), ("A", 2)],
]

# ---- Section map ---------------------------------------------------------------
# (name, first bar, last bar, params); sections must tile bars 1..N_BARS in order.
# A value is a number (held), a tuple (a, b) ramped across the section (cutoffs
# ramp in log-frequency) or a list with one value per bar of the section.
# Omitted keys use SECTION_DEFAULTS.
#   pad, shimmer, root   gains: the pad, its octave-up "air" layer, and a soft
#                        sustained chord-root layer that keeps the harmony
#                        readable while the bass line is out
#   pad_lp               pad lowpass cutoff (Hz)
#   arp, arp_lp, arp_div 16th pluck arpeggio: gain, filter-envelope peak (Hz),
#                        notes per bar (16, 8, 4, 2, 1 or 0 - thins out the outro)
#   motif                sparse high pluck on beats 1 and 3 (gain)
#   kick, hats, ghost_hats, clap, bass   drum / bass-line gains (0 = out)
#   chord                hold this chord for the whole section (overrides the cycle)
SECTION_DEFAULTS = dict(pad=1.0, pad_lp=1500.0, shimmer=0.0, root=0.0, motif=0.0,
                        arp=0.0, arp_lp=2000.0, arp_div=16, kick=0.0, hats=0.0,
                        ghost_hats=0.0, clap=0.0, bass=0.0, chord=None)
SECTIONS = [
    ("intro",      1,  3, dict(pad=(0.75, 0.9), pad_lp=(260, 1500), root=0.8, motif=1.0)),
    ("groove A",   4,  9, dict(pad=0.85, pad_lp=(1500, 2000), root=0.7,
                               arp=0.8, arp_lp=(2000, 2400), kick=1.0, hats=0.8)),
    ("groove B",  10, 21, dict(pad=0.85, pad_lp=(2000, 2600), arp=0.9, arp_lp=(2600, 3200),
                               kick=1.0, hats=1.0, clap=1.0, bass=1.0)),
    ("groove B+", 22, 25, dict(pad=0.85, pad_lp=(2800, 3500), shimmer=0.15,
                               arp=0.95, arp_lp=(3400, 4000),
                               kick=1.0, hats=1.0, clap=1.0, bass=1.0)),
    ("breakdown", 26, 29, dict(pad=0.8, pad_lp=(1600, 2300), root=0.5,
                               arp=0.75, arp_lp=(2100, 2700), hats=0.55)),
    ("build",     30, 30, dict(pad=0.85, pad_lp=(2300, 3800), root=0.5,
                               arp=0.85, arp_lp=(2700, 4200), hats=0.65)),
    ("groove C",  31, 38, dict(pad=0.9, pad_lp=(3600, 4200), shimmer=0.35,
                               arp=1.0, arp_lp=(4200, 4800), kick=1.0, hats=1.05,
                               ghost_hats=1.0, clap=1.0, bass=1.1)),
    ("outro",     39, 41, dict(chord="Dmaj9", pad=(0.95, 0.75), pad_lp=(3500, 800), root=0.7,
                               arp=(0.9, 0.35), arp_lp=(3500, 1800), arp_div=[16, 8, 0],
                               motif=[0, 0, 0.9])),
]
IMPACT_BARS = [4, 39]        # beat 1: sub drop 60->35 Hz + soft noise burst + big reverb
RISER_BARS = [3, 30]         # whole bar: noise sweep + reversed swell into the next downbeat
ROLL_BARS = [30]             # snare roll: 8ths (first half) -> 16ths (second half), crescendo
FILL_BARS = [34, 38]         # short tom/snare fill on the last beat (replaces that clap)
CRASH_BARS = [10, 31]        # soft noise crash on beat 1 (section entries)

# ---- Parts ---------------------------------------------------------------------
PAD_RANGE = (50, 76)         # MIDI D3..E5 for the voice-led pad voices
PAD_VOICES = 5
PAD_FIRST_VOICING = [50, 57, 61, 64, 66]   # D3 A3 C#4 E4 F#4 (ignored if it doesn't fit)
ROOT_RANGE = (31, 42)        # G1..F#2: register of the chord roots (bass line, root layer)
ARP_RANGE = (67, 88)         # G4..E6: chord tones in this range form the arp's note pool
ARP_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3]   # pool index per 16th
ARP_ACCENTS = [1.0, 0.62, 0.8, 0.66]      # velocity of the four 16ths in each beat
BASS_PATTERNS = [            # per bar of the chord cycle: eighths, semitones above the root (None = rest)
    [0, 0, 0, 0, 0, 0, 0, 12],
    [0, 0, 0, 12, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 12, 0],
    [0, 0, 0, 12, 0, 0, 0, 12],
]
MOTIF_PITCHES = {            # per section: target MIDI per hit, snapped to the nearest chord tone
    "intro": [76, 81, 78, 85, 83, 78],     # E5 A5 | F#5 C#6 | B5 F#5
    "outro": [78, 74],                      # F#5 D5 on the final bar
}
SWING_BEATS = 0.04           # groove swing: off-beat 8ths land this many beats late (16th
                             # off-beats half as much); applies to every rhythmic part. 0 = straight

# ---- Mix (dB faders), sends and master ---------------------------------------------
MIX_DB = dict(pad=-24.0, shimmer=-28.0, root=-24.0, arp=-19.0, motif=-16.0, bass=-16.5,
              kick=-10.0, hats=-13.0, clap=-10.0, roll=-12.0, fill=-10.0, crash=-22.0,
              impact_sub=-6.5, impact_noise=-12.0, riser=-14.0, swell=-12.0)
HALL_SEND = dict(pad=0.28, arp=0.25, motif=0.5, clap=0.3, roll=0.35, fill=0.3, hats=0.08,
                 kick=0.03, crash=0.35, impact_noise=1.2, riser=0.3)
ROOM_SEND = dict(clap=0.55, roll=0.45, fill=0.45, hats=0.15, kick=0.05)
DELAY_SEND = dict(arp=0.32, motif=0.5)     # ping-pong, dotted 8th
HALL_RT60 = 2.6              # s
ROOM_RT60 = 0.65             # s
HALL_RETURN_DB = 1.5
ROOM_RETURN_DB = 2.0
DELAY_FEEDBACK = 0.38
SIDECHAIN_DB = 3.0           # pad + bass duck under each kick
TARGET_LUFS = -16.0          # integrated loudness (ITU-R BS.1770-4) of the whole track
CEILING_DBFS = -1.2          # limiter ceiling (sample peak); spec asks for <= -1.0
OUT_WAV = "music.wav"
OUT_PNG = "spectrogram.png"
REPORT_GROUPS = [            # summary rows of the printed report: (label, [section names])
    ("intro", ["intro"]), ("A", ["groove A"]), ("B", ["groove B", "groove B+"]),
    ("breakdown", ["breakdown"]), ("C", ["groove C"]), ("outro+tail", ["outro"]),
]

# =============================================================================
# Timing, randomness, small helpers
# =============================================================================
BEAT = 60.0 / BPM
BAR = BEAT * BEATS_PER_BAR
STEPS_PER_BAR = 4 * BEATS_PER_BAR          # 16ths per bar
SONG_SEC = N_BARS * BAR
TOTAL_SEC = SONG_SEC + TAIL_SEC
N = int(round(TOTAL_SEC * SR))
HERE = os.path.dirname(os.path.abspath(__file__))
TWO_PI = 2.0 * np.pi

PITCH_CLASS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
               "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def t_at(bar, beat=0.0):
    """Seconds at 1-indexed `bar` plus `beat` beats (0-based, fractional allowed)."""
    return ((bar - 1) * BEATS_PER_BAR + beat) * BEAT


def groove_t(bar, beat):
    """Like t_at, but on the swung grid: within each beat, position 0.5 moves to 0.5 + SWING_BEATS
    (piecewise-linear warp, so 16th off-beats move half as far and downbeats never move)."""
    whole = np.floor(beat + 1e-9)
    p = beat - whole
    p = p * (0.5 + SWING_BEATS) / 0.5 if p < 0.5 else 0.5 + SWING_BEATS + (p - 0.5) * (0.5 - SWING_BEATS) / 0.5
    return t_at(bar, whole + p)


def smp(t):
    return int(round(t * SR))


def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def note_name(m):
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def undb(d):
    return 10.0 ** (d / 20.0)


def rng_for(*key):
    """A stable random stream per purpose, so editing one part never reshuffles another."""
    return np.random.default_rng([SEED] + [zlib.crc32(repr(k).encode()) for k in key])


def pan_gains(pan):
    """Constant-power pan law; pan in [-1 (left), +1 (right)]."""
    a = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * np.pi / 4.0
    return np.cos(a), np.sin(a)


def add(bus, x, t, gain=1.0, pan=0.0):
    """Mix mono (panned) or stereo (2, n) `x` into the (2, N) `bus` from time t (s)."""
    if x.ndim == 1:
        gl, gr = pan_gains(pan)
        x = np.stack([x * gl, x * gr])
    n0 = smp(t)
    skip = max(0, -n0)
    n0 = max(0, n0)
    n = min(x.shape[1] - skip, bus.shape[1] - n0)
    if n > 0:
        bus[:, n0:n0 + n] += gain * x[:, skip:skip + n]


def taper(x, fade_in=0.0, fade_out=0.0):
    """In-place raised-cosine fades (seconds) so every event starts and ends at exactly 0."""
    n = x.shape[-1]
    ni, no = min(n, int(fade_in * SR)), min(n, int(fade_out * SR))
    if ni > 0:
        x[..., :ni] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(ni) / ni)
    if no > 0:
        x[..., n - no:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(no) + 1) / no)
    return x


def peak_norm(x):
    return x / max(np.max(np.abs(x)), 1e-12)


def butter_sos(order, cutoff, btype):
    return signal.butter(order, cutoff, btype=btype, fs=SR, output="sos")


def filt(x, sos):
    return signal.sosfilt(sos, x, axis=-1)


# =============================================================================
# Sections, automation and harmony
# =============================================================================
def check_config():
    bars = [b for _, a, z, _ in SECTIONS for b in range(a, z + 1)]
    if bars != list(range(1, N_BARS + 1)):
        sys.exit("CONFIG: SECTIONS must cover bars 1..N_BARS exactly once, in order")
    for name, a, z, p in SECTIONS:
        unknown = set(p) - set(SECTION_DEFAULTS)
        if unknown:
            sys.exit(f"CONFIG: section {name!r} has unknown keys {sorted(unknown)}")
        for k, v in p.items():
            if isinstance(v, list) and len(v) != z - a + 1:
                sys.exit(f"CONFIG: section {name!r}: {k} needs one value per bar ({z - a + 1})")
        if p.get("chord") and p["chord"] not in CHORDS:
            sys.exit(f"CONFIG: section {name!r}: unknown chord {p['chord']!r}")
    for segs in CHORD_CYCLE:
        if abs(sum(b for _, b in segs) - BEATS_PER_BAR) > 1e-9:
            sys.exit(f"CONFIG: chord bar {segs} does not add up to {BEATS_PER_BAR} beats")
        for name, _ in segs:
            if name not in CHORDS:
                sys.exit(f"CONFIG: unknown chord {name!r} in CHORD_CYCLE")
    for b in IMPACT_BARS + RISER_BARS + ROLL_BARS + FILL_BARS + CRASH_BARS:
        if not 1 <= b <= N_BARS:
            sys.exit(f"CONFIG: event bar {b} is outside 1..{N_BARS}")


def section_of(bar):
    bar = min(max(int(bar), 1), N_BARS)
    for sec in SECTIONS:
        if sec[1] <= bar <= sec[2]:
            return sec
    raise ValueError(bar)


def _ramp(v, frac, log):
    return v[0] * (v[1] / v[0]) ** frac if log else v[0] + (v[1] - v[0]) * frac


def value_at(key, t):
    """Value of section parameter `key` at time t (s), for per-note decisions."""
    bar = min(max(int(np.floor(t / BAR + 1e-9)) + 1, 1), N_BARS)
    _, a, z, p = section_of(bar)
    v = p.get(key, SECTION_DEFAULTS[key])
    if isinstance(v, list):
        return v[bar - a]
    if isinstance(v, tuple):
        frac = float(np.clip((t - t_at(a)) / (t_at(z + 1) - t_at(a)), 0.0, 1.0))
        return _ramp(v, frac, key.endswith("_lp"))
    return v


CTRL = 64                                   # control-rate hop (samples) for automation
N_CTRL = N // CTRL + 2
T_CTRL = np.arange(N_CTRL) * CTRL / SR


def automation(key, smooth=0.3):
    """Control-rate curve of a section parameter, smoothed over `smooth` seconds
    (filter cutoffs are ramped and smoothed in log-frequency)."""
    log = key.endswith("_lp")
    out = np.empty(N_CTRL)
    for i, (_, a, z, p) in enumerate(SECTIONS):
        t0, t1 = t_at(a), t_at(z + 1)
        lo = -np.inf if i == 0 else t0
        hi = np.inf if i == len(SECTIONS) - 1 else t1
        m = (T_CTRL >= lo) & (T_CTRL < hi)
        tt = T_CTRL[m]
        v = p.get(key, SECTION_DEFAULTS[key])
        if isinstance(v, tuple):
            out[m] = _ramp(v, np.clip((tt - t0) / (t1 - t0), 0.0, 1.0), log)
        elif isinstance(v, list):
            out[m] = np.asarray(v, float)[np.clip(((tt - t0) // BAR).astype(int), 0, len(v) - 1)]
        else:
            out[m] = float(v)
    if smooth > 0:
        w = max(1, int(round(smooth * SR / CTRL))) | 1
        y = np.log(out) if log else out
        y = np.convolve(np.pad(y, w // 2, mode="edge"), np.ones(w) / w, mode="valid")
        out = np.exp(y) if log else y
    return out


def to_audio_rate(curve):
    return np.interp(np.arange(N), np.arange(N_CTRL) * CTRL, curve)


def chord_pcs(name):
    return [PITCH_CLASS[s] for s in CHORDS[name].split()]


def build_timeline():
    """[(t0, t1, chord)] for the whole song; identical neighbours merge so held chords sustain."""
    ev = []
    for bar in range(1, N_BARS + 1):
        pinned = section_of(bar)[3].get("chord")
        segs = [(pinned, BEATS_PER_BAR)] if pinned else CHORD_CYCLE[(bar - 1) % len(CHORD_CYCLE)]
        beat = 0.0
        for name, beats in segs:
            t0, t1 = t_at(bar, beat), t_at(bar, beat + beats)
            if ev and ev[-1][2] == name:
                ev[-1][1] = t1
            else:
                ev.append([t0, t1, name])
            beat += beats
    return [tuple(e) for e in ev]


def chord_at(t):
    for _, t1, name in TIMELINE:
        if t < t1 - 1e-6:
            return name
    return TIMELINE[-1][2]


def root_midi(name):
    """The chord root placed inside ROOT_RANGE."""
    lo = ROOT_RANGE[0]
    return lo + (chord_pcs(name)[0] - lo) % 12


def voicing_cost(prev, v):
    """Voice-leading cost: total movement plus penalties for muddy or harsh spacing."""
    c = float(sum(abs(a - b) for a, b in zip(prev, v)))
    for a, b in zip(v, v[1:]):
        iv = b - a
        if iv == 1:
            c += 4.0 if a >= 60 else 8.0            # semitone clusters
        if iv == 2 and a < 57:
            c += 2.0                                # whole-step clusters low down
        if iv <= 4 and a < 53:
            c += 2.0                                # close intervals below F3 get muddy
    c += 6.0 * sum(1 for a, b in itertools.combinations(v, 2) if b - a == 13)   # minor 9ths
    c += max(0, (v[-1] - v[0]) - 17)                # keep the spread compact
    c += 0.35 * abs(float(np.mean(v)) - ((PAD_RANGE[0] + PAD_RANGE[1]) / 2.0 - 2.0))
    return c


def pad_voicings():
    """Voice-lead every chord of the timeline: [(t0, t1, chord, (midi, ...))]."""
    out, prev = [], None
    for t0, t1, name in TIMELINE:
        pcs = set(chord_pcs(name))
        need = min(len(pcs), PAD_VOICES)
        pool = [m for m in range(PAD_RANGE[0], PAD_RANGE[1] + 1) if m % 12 in pcs]
        cands = [c for c in itertools.combinations(pool, PAD_VOICES)
                 if len({m % 12 for m in c}) >= need]
        if prev is None:
            first = tuple(sorted(PAD_FIRST_VOICING or ()))
            if first in cands:
                v = first
            else:
                mid = (PAD_RANGE[0] + PAD_RANGE[1]) / 2.0 - 2.0
                ref = tuple(np.linspace(mid - 7, mid + 7, PAD_VOICES))
                v = min(cands, key=lambda c: (voicing_cost(ref, c), c))
        else:
            v = min(cands, key=lambda c: (voicing_cost(prev, c), c))
        out.append((t0, t1, name, v))
        prev = v
    return out


def tied_notes(layer):
    """[(t0, t1, [midi, ...])] -> [(midi, t_on, t_off)], sustaining common tones across changes."""
    active, notes = {}, []
    for t0, _, ms in layer:
        cur = set(ms)
        for m in [m for m in active if m not in cur]:
            notes.append((m, active.pop(m), t0))
        for m in sorted(cur):
            active.setdefault(m, t0)
    notes += [(m, t_on, SONG_SEC) for m, t_on in active.items()]
    return sorted(notes, key=lambda n: (n[1], n[0]))


# =============================================================================
# Oscillators, envelopes, filters
# =============================================================================
TABLE = 4096
_saw_tables = {}


def saw_table(n_harm):
    """One cycle of a band-limited saw (harmonics 1..n_harm, 1/k, Lanczos-tapered) + guard point."""
    tab = _saw_tables.get(n_harm)
    if tab is None:
        k = np.arange(1, n_harm + 1)
        spec = np.zeros(TABLE // 2 + 1, complex)
        spec[1:n_harm + 1] = -1j * np.sinc(k / (n_harm + 1)) / k * (TABLE / 2)
        tab = np.fft.irfft(spec, TABLE)
        tab = np.append(tab, tab[0])
        _saw_tables[n_harm] = tab
    return tab


def table_read(tab, phase):
    """Linear-interpolated wavetable read; `phase` in cycles (phase accumulator)."""
    idx = (phase % 1.0) * TABLE
    i0 = np.minimum(idx.astype(np.int64), TABLE - 1)
    fr = idx - i0
    return tab[i0] + fr * (tab[i0 + 1] - tab[i0])


def env_ar(n_hold, attack, release, tau_div=5.0):
    """Raised-cosine attack, sustain, exponential release landing exactly on 0.
    Length n_hold + release samples; a note-off during the attack releases from there."""
    na, nr = int(attack * SR), max(2, int(release * SR))
    env = np.ones(n_hold + nr)
    if na > 0:
        m = min(na, n_hold)
        env[:m] = 0.5 - 0.5 * np.cos(np.pi * np.arange(m) / na)
    level = env[n_hold - 1] if n_hold > 0 else 0.0
    rel = level * np.exp(-np.arange(nr) / SR / (release / tau_div))
    nt = max(1, int(0.3 * nr))
    rel[-nt:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(nt) + 1) / nt)
    env[n_hold:] = rel
    return env


def rbj_lowpass(fc, q):
    w0 = TWO_PI * np.asarray(fc, float) / SR
    cw, alpha = np.cos(w0), np.sin(w0) / (2.0 * q)
    a0 = 1.0 + alpha
    b0 = (1.0 - cw) / 2.0 / a0
    return np.stack([b0, 2.0 * b0, b0, np.ones_like(b0), -2.0 * cw / a0, (1.0 - alpha) / a0], -1)


def rbj_bandpass(fc, q):
    w0 = TWO_PI * np.asarray(fc, float) / SR
    cw, alpha = np.cos(w0), np.sin(w0) / (2.0 * q)
    a0 = 1.0 + alpha
    z = np.zeros_like(w0)
    return np.stack([alpha / a0, z, -alpha / a0, np.ones_like(w0), -2.0 * cw / a0,
                     (1.0 - alpha) / a0], -1)


def tv_filter(x, sos_blocks, block):
    """Block-wise time-varying biquad cascade; filter state carries across blocks.
    sos_blocks: (n_blocks, n_sections, 6); x: (..., n)."""
    y = np.empty_like(x)
    zi = np.zeros((sos_blocks.shape[1],) + x.shape[:-1] + (2,))
    n = x.shape[-1]
    for b in range(sos_blocks.shape[0]):
        s0 = b * block
        if s0 >= n:
            break
        s = slice(s0, min(s0 + block, n))
        y[..., s], zi = signal.sosfilt(sos_blocks[b], x[..., s], axis=-1, zi=zi)
    return y


def tv_lowpass4(x, fc_ctrl, block=256):
    """24 dB/oct Butterworth lowpass whose cutoff follows a control-rate curve."""
    n = x.shape[-1]
    nb = -(-n // block)
    fc = np.interp(np.arange(nb) * block + block / 2.0, np.arange(len(fc_ctrl)) * CTRL, fc_ctrl)
    fc = np.clip(fc, 20.0, 0.45 * SR)
    sos = np.stack([rbj_lowpass(fc, 0.5412), rbj_lowpass(fc, 1.3066)], axis=1)
    return tv_filter(x, sos, block)


# =============================================================================
# Instruments
# =============================================================================
PAD_UNISON = [(-11.0, -0.8), (-4.0, -0.3), (4.0, 0.3), (11.0, 0.8)]   # (cents, pan)
SHIMMER_UNISON = [(-7.0, -0.9), (7.0, 0.9)]


def render_pad(notes, unison, attack, release, first_attack, last_release, tag, fmax=15000.0):
    """Detuned band-limited saw voices per note (slow random pitch drift), panned across the field."""
    bus = np.zeros((2, N))
    ug = 1.0 / np.sqrt(len(unison))
    for i, (m, t_on, t_off) in enumerate(notes):
        rng = rng_for(tag, i, m)
        f0 = hz(m)
        n0 = smp(t_on)
        att = first_attack if t_on < 1e-6 else attack
        rel = last_release if t_off > SONG_SEC - 1e-6 else release
        env = env_ar(smp(t_off) - n0, att, rel)[: N - n0] * ug
        n = env.size
        t = np.arange(n) / SR
        tab = saw_table(max(1, int(fmax / (f0 * 1.02))))
        left, right = np.zeros(n), np.zeros(n)
        for cents, pan in unison:
            drift = rng.uniform(0.8, 2.0) * np.sin(TWO_PI * rng.uniform(0.05, 0.17) * t
                                                   + rng.uniform(0, TWO_PI))
            phase = rng.uniform() + np.cumsum(f0 * 2.0 ** ((cents + drift) / 1200.0)) / SR
            x = table_read(tab, phase)
            gl, gr = pan_gains(pan)
            left += gl * x
            right += gr * x
        bus[0, n0:n0 + n] += env * left
        bus[1, n0:n0 + n] += env * right
    return bus


def render_root(notes, attack=0.5, release=1.0, first_attack=2.5, last_release=2.7):
    """Soft sustained chord root: sine with a little 2nd/3rd harmonic (mono)."""
    bus = np.zeros(N)
    for m, t_on, t_off in notes:
        n0 = smp(t_on)
        att = first_attack if t_on < 1e-6 else attack
        rel = last_release if t_off > SONG_SEC - 1e-6 else release
        env = env_ar(smp(t_off) - n0, att, rel)[: N - n0]
        ph = TWO_PI * hz(m) * np.arange(env.size) / SR
        bus[n0:n0 + env.size] += env * (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph))
    return bus


_pluck_cache = {}


def pluck(midi, fc_peak, tau_a, tau_f=0.07, q=1.0, attack=0.0015, fmax=16000.0):
    """Additive saw pluck through a simulated resonant 2-pole lowpass whose cutoff
    falls from fc_peak to 1.5 x f0 (time constant tau_f); amplitude decays with tau_a.
    Only harmonics below fmax are summed, so it is band-limited by construction."""
    qfc = int(round(np.log(fc_peak) / np.log(1.03)))           # 3 % cutoff steps, cached
    key = (midi, qfc, round(tau_a, 3), round(tau_f, 3), q)
    if key in _pluck_cache:
        return _pluck_cache[key]
    fc_peak = 1.03 ** qfc
    f0 = hz(midi)
    n = int(min(2.0, 4.6 * tau_a + 0.04) * SR)
    t = np.arange(n) / SR
    k = np.arange(1, max(1, int(fmax // f0)) + 1)[:, None]
    hop = 32
    tc = np.arange(n // hop + 2) * hop / SR
    floor = 1.5 * f0
    fc = floor + max(fc_peak - floor, 0.0) * np.exp(-tc / tau_f)
    r = k * f0 / fc[None, :]
    amp = 1.0 / (k * np.sqrt((1.0 - r * r) ** 2 + (r / q) ** 2))
    pos = np.arange(n) / hop
    i0 = pos.astype(np.int64)
    fr = pos - i0
    amp_s = amp[:, i0] * (1.0 - fr) + amp[:, i0 + 1] * fr
    x = np.einsum("kn,kn->n", amp_s, np.sin(TWO_PI * f0 * k * t))
    x = taper(x * np.exp(-t / tau_a), attack, 0.02)
    _pluck_cache[key] = x
    return x


def fm_pluck(midi, dur=2.6, tau=0.75, attack=0.005):
    """Soft bell/e-piano pluck: 1:1 FM with a decaying index plus a faint 4th-partial 'tine'."""
    f0 = hz(midi)
    t = np.arange(int(dur * SR)) / SR
    ph = TWO_PI * f0 * t
    index = 0.35 + 1.5 * np.exp(-t / 0.16)
    x = np.sin(ph + index * np.sin(ph)) + 0.12 * np.sin(4 * ph) * np.exp(-t / 0.05)
    return taper(x * np.exp(-t / tau), attack, 0.3)


_bass_cache = {}


def bass_note(midi, dur, drive=1.6):
    """Sine + band-limited triangle, gentle tanh saturation (lowpassed on the bus)."""
    key = (midi, round(dur, 4), drive)
    if key not in _bass_cache:
        f0 = hz(midi)
        t = np.arange(int((dur + 0.03) * SR)) / SR
        ph = TWO_PI * f0 * t
        tri = sum((-1) ** ((k - 1) // 2) * np.sin(k * ph) / k ** 2 for k in (1, 3, 5, 7, 9))
        x = (0.8 * np.sin(ph) + 0.45 * (8 / np.pi ** 2) * tri) * (0.78 + 0.22 * np.exp(-t / 0.1))
        x = taper(x, 0.005, 0.03)
        _bass_cache[key] = np.tanh(drive * x) / np.tanh(drive)
    return _bass_cache[key]


def make_kick():
    """Sine with a 120 -> 45 Hz pitch envelope, light saturation and a tiny filtered click."""
    rng = rng_for("kick")
    t = np.arange(int(0.5 * SR)) / SR
    f = 45.0 + 75.0 * np.exp(-t / 0.045)
    ph = TWO_PI * np.cumsum(f) / SR
    ph -= ph[0]
    body = np.sin(ph) * (1.0 - np.exp(-t / 0.0006)) * np.exp(-t / 0.17)
    body = np.tanh(1.4 * body) / np.tanh(1.4)
    click = filt(rng.standard_normal(t.size), butter_sos(2, [2000, 7000], "bandpass"))
    click *= (1.0 - np.exp(-t / 0.0002)) * np.exp(-t / 0.0012)
    x = body + 0.06 * peak_norm(click)
    return peak_norm(taper(x, 0.0, 0.06))


def make_hat(variant, decay=0.022):
    """Closed hat: high-passed noise centred around 8 kHz (no 16 kHz+ hiss), very short."""
    rng = rng_for("hat", variant, decay)
    t = np.arange(int(0.16 * SR)) / SR
    w = rng.standard_normal(t.size)
    x = filt(w, butter_sos(4, 5500, "highpass")) + 0.6 * filt(w, butter_sos(2, [7000, 10000], "bandpass"))
    x = filt(x, butter_sos(4, 12000, "lowpass"))
    x *= (1.0 - np.exp(-t / 0.0003)) * np.exp(-t / decay)
    return peak_norm(taper(x, 0.0, 0.01))


def make_clap():
    """Four band-passed noise bursts ~10 ms apart + short tail, stereo, with a little snare body."""
    rng = rng_for("clap")
    t = np.arange(int(0.6 * SR)) / SR
    out = np.zeros((2, t.size))
    for ch in range(2):
        w = rng.standard_normal(t.size)
        noise = filt(w, butter_sos(2, [900, 3000], "bandpass")) + 0.12 * filt(w, butter_sos(2, 5000, "highpass"))
        offs = np.array([0.0, 0.0095, 0.019, 0.0295]) + np.r_[0.0, rng.uniform(-0.0008, 0.0008, 3)]
        env = np.zeros(t.size)
        for g, o in zip((0.55, 0.7, 0.8, 1.0), offs):
            tt = np.maximum(t - o, 0.0)
            env += g * (t >= o) * (1.0 - np.exp(-tt / 0.0004)) * np.exp(-tt / 0.0045)
        tt = np.maximum(t - offs[-1], 0.0)
        env += 0.75 * (t >= offs[-1]) * (1.0 - np.exp(-tt / 0.002)) * np.exp(-tt / 0.11)
        out[ch] = noise * env
    out = peak_norm(out)
    out += 0.2 * np.sin(TWO_PI * 185.0 * t) * np.exp(-t / 0.045) * (1.0 - np.exp(-t / 0.001))
    return peak_norm(taper(out, 0.0, 0.1))


def make_snare(tag, center=1500.0, tail=0.07, tom_hz=None, tom_amt=0.0):
    """Roll / fill hit: band-passed noise + short body; optional pitched tom body."""
    rng = rng_for("snare", tag)
    t = np.arange(int(0.5 * SR)) / SR
    w = rng.standard_normal((2, t.size))
    x = filt(w, butter_sos(2, [center / 1.9, center * 1.9], "bandpass")) + 0.2 * filt(w, butter_sos(2, 6000, "highpass"))
    x = peak_norm(x * (1.0 - np.exp(-t / 0.0004)) * np.exp(-t / tail))
    body = 0.25 * np.sin(TWO_PI * 190.0 * t) * np.exp(-t / 0.05) * (1.0 - np.exp(-t / 0.0008))
    if tom_hz:
        f = tom_hz * (1.0 + 0.45 * np.exp(-t / 0.03))
        ph = TWO_PI * np.cumsum(f) / SR
        ph -= ph[0]
        body = body + tom_amt * np.sin(ph) * np.exp(-t / 0.2) * (1.0 - np.exp(-t / 0.0008))
    return peak_norm(taper(x + body, 0.0, 0.05))


def make_crash():
    """Soft, dark-ish noise crash (no metallic partials, so it never gets harsh)."""
    rng = rng_for("crash")
    t = np.arange(int(2.6 * SR)) / SR
    x = filt(rng.standard_normal((2, t.size)), butter_sos(4, 3500, "highpass"))
    x = filt(x, butter_sos(2, 11000, "lowpass")) * np.exp(-t / 0.65)
    return peak_norm(taper(x, 0.003, 0.3))


def make_impact():
    """Sub drop (60 -> 35 Hz over 1.5 s, with a short pitched thump at the onset) and a
    soft stereo noise burst (the burst is what feeds the big reverb tail)."""
    t = np.arange(int(2.0 * SR)) / SR
    f = 35.0 * (60.0 / 35.0) ** np.clip(1.0 - t / 1.5, 0.0, 1.0) + 30.0 * np.exp(-t / 0.02)
    ph = TWO_PI * np.cumsum(f) / SR
    ph -= ph[0]
    sub = np.tanh(1.3 * np.sin(ph) * np.exp(-t / 0.7)) / np.tanh(1.3)
    sub = taper(sub, 0.004, 0.4)
    rng = rng_for("impact")
    tn = np.arange(int(1.8 * SR)) / SR
    w = rng.standard_normal((2, tn.size))
    burst = filt(w, butter_sos(2, 2800, "lowpass")) + 0.8 * filt(w, butter_sos(2, [120, 700], "bandpass"))
    burst *= np.exp(-tn / 0.11) + 0.25 * np.exp(-tn / 0.6)
    return peak_norm(sub), peak_norm(taper(burst, 0.002, 0.3))


def make_riser(dur, tag):
    """Stereo noise through a band-pass sweeping 300 Hz -> 7 kHz, swelling into the downbeat."""
    rng = rng_for("riser", tag)
    n = int(dur * SR)
    x = np.arange(n) / n
    w = rng.standard_normal((2, n))
    block = 256
    nb = -(-n // block)
    xc = np.clip((np.arange(nb) * block + block / 2) / n, 0.0, 1.0)
    fc = 300.0 * (7000.0 / 300.0) ** (xc ** 1.4)
    y = tv_filter(w, rbj_bandpass(fc, 1.3)[:, None, :], block)
    y += 0.25 * filt(w, butter_sos(2, 8000, "highpass")) * x ** 3
    y *= x ** 1.6
    return peak_norm(taper(y, 0.0, 0.015))


def make_reverse_swell(voicing, dur, hall_ir, tag):
    """Chord stab -> hall reverb -> reversed, so it swells into the downbeat it precedes."""
    rng = rng_for("swell", tag)
    n = int(1.0 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in list(voicing) + [v + 12 for v in voicing[-3:]]:
        tab = saw_table(max(1, int(12000 / hz(m))))
        for cents in (-6.0, 6.0):
            x += table_read(tab, rng.uniform() + hz(m) * 2.0 ** (cents / 1200.0) * t)
    x = taper(filt(x, butter_sos(2, 2500, "lowpass")) * np.exp(-t / 0.3), 0.01, 0.1)
    length = int(dur * SR)
    wet = np.stack([signal.fftconvolve(x, hall_ir[c])[:length] for c in range(2)])
    wet[:, : min(n, length)] += 0.15 * x[: min(n, length)]
    y = np.ascontiguousarray(wet[:, ::-1])
    return peak_norm(taper(y, 0.4 * dur, 0.004))


# =============================================================================
# Effects: reverb, delay, sidechain
# =============================================================================
def make_ir(rt60, length, predelay, tag, n_early=10, early_ms=(4.0, 70.0), lp_hz=9000.0, hp_hz=120.0):
    """Synthetic stereo IR: decorrelated noise per channel, frequency-dependent exponential
    decay (highs die faster), a few early reflections, pre-delay; unit energy per channel."""
    rng = rng_for("ir", tag)
    n = int(length * SR)
    t = np.arange(n) / SR
    lf = np.log(np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 1.0))
    lc = np.log(np.array([125.0, 500.0, 2000.0, 5000.0, 10000.0]))
    rt_scale = np.array([1.15, 1.0, 0.82, 0.6, 0.42])
    weights = []                             # hat functions in log-f: a partition of unity
    for i in range(len(lc)):
        w = np.zeros(lf.size)
        if i == 0:
            w[lf <= lc[0]] = 1.0
        else:
            m = (lf > lc[i - 1]) & (lf <= lc[i])
            w[m] = (lf[m] - lc[i - 1]) / (lc[i] - lc[i - 1])
        if i == len(lc) - 1:
            w[lf > lc[-1]] = 1.0
        else:
            m = (lf > lc[i]) & (lf < lc[i + 1])
            w[m] = (lc[i + 1] - lf[m]) / (lc[i + 1] - lc[i])
        weights.append(w)
    ir = np.zeros((2, n))
    for ch in range(2):
        spec = np.fft.rfft(rng.standard_normal(n))
        for w, s in zip(weights, rt_scale):
            ir[ch] += np.fft.irfft(spec * w, n) * np.exp(-6.9078 * t / (rt60 * s))
        ir[ch] *= 1.0 - np.exp(-t / 0.012)                 # diffuse build-up
    tail_rms = np.sqrt(np.mean(ir[:, : int(0.05 * SR)] ** 2))
    for ch in range(2):
        for te in np.sort(rng.uniform(*early_ms, n_early)) / 1000.0:
            ir[ch, int(te * SR)] += tail_rms * 6.0 * np.exp(-te / 0.04) * rng.choice([-1.0, 1.0]) * rng.uniform(0.5, 1.0)
    ir = filt(filt(ir, butter_sos(2, hp_hz, "highpass")), butter_sos(2, lp_hz, "lowpass"))
    ir = np.concatenate([np.zeros((2, int(predelay * SR))), ir], axis=1)
    # Unit average power gain over 200 Hz - 5 kHz (not unit total energy: after the lowpass,
    # that would boost the band that matters by the bandwidth thrown away), so a send of
    # s gives a return about s times the send level for typical program material.
    spec = np.abs(np.fft.rfft(ir, axis=1)) ** 2
    f = np.fft.rfftfreq(ir.shape[1], 1.0 / SR)
    band = (f >= 200.0) & (f <= 5000.0)
    return ir / np.sqrt(spec[:, band].mean(axis=1, keepdims=True))


def convolve_stereo(x, ir):
    return np.stack([signal.oaconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])


def pingpong(mono, delay_s, feedback, repeats=8, lp_hz=3500.0, hp_hz=300.0):
    """Ping-pong echoes (L, R, L, ...), each repeat darker and thinner than the last."""
    d = smp(delay_s)
    sos = np.vstack([butter_sos(1, lp_hz, "lowpass"), butter_sos(1, hp_hz, "highpass")])
    out = np.zeros((2, mono.size))
    tap = mono
    for r in range(1, repeats + 1):
        tap = filt(tap, sos) * (feedback if r > 1 else 1.0)
        if r * d >= mono.size:
            break
        out[(r - 1) % 2, r * d:] += tap[: mono.size - r * d]
    return out


def duck_curve(kick_times, depth_db, attack=0.008, hold=0.04, release=0.3):
    """Gain curve dipping by depth_db under each kick (smooth attack / hold / release)."""
    g = np.ones(N)
    depth = 1.0 - undb(-depth_db)
    na, nh, nr = smp(attack), smp(hold), smp(release)
    shape = np.concatenate([0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na), np.ones(nh),
                            0.5 + 0.5 * np.cos(np.pi * np.arange(nr) / nr)])
    seg = 1.0 - depth * shape
    for tk in kick_times:
        n0 = smp(tk)
        n = min(seg.size, N - n0)
        g[n0:n0 + n] = np.minimum(g[n0:n0 + n], seg[:n])
    return g


# =============================================================================
# Loudness, dynamics, output
# =============================================================================
def k_weight(x):
    """ITU-R BS.1770 K-weighting (pre-filter + RLB high-pass)."""
    if SR == 48000:
        b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
        b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    else:                                   # same analog prototypes, re-derived for this rate
        g, q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
        a = 10 ** (g / 40)
        w0 = TWO_PI * fc / SR
        al, cw = np.sin(w0) / (2 * q), np.cos(w0)
        b1 = [a * ((a + 1) + (a - 1) * cw + 2 * np.sqrt(a) * al), -2 * a * ((a - 1) + (a + 1) * cw),
              a * ((a + 1) + (a - 1) * cw - 2 * np.sqrt(a) * al)]
        a1 = [(a + 1) - (a - 1) * cw + 2 * np.sqrt(a) * al, 2 * ((a - 1) - (a + 1) * cw),
              (a + 1) - (a - 1) * cw - 2 * np.sqrt(a) * al]
        q, fc = 0.5003270373238773, 38.13547087602444
        w0 = TWO_PI * fc / SR
        al, cw = np.sin(w0) / (2 * q), np.cos(w0)
        b2, a2 = [1.0, -2.0, 1.0], [1 + al, -2 * cw, 1 - al]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs_integrated(x):
    """Gated integrated loudness (BS.1770-4: 400 ms blocks, 75 % overlap, -70 / -10 LU gates)."""
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if y.shape[1] < blk:
        return -np.inf
    p = np.cumsum(np.concatenate([np.zeros(1), (y ** 2).sum(0)]))
    starts = np.arange(0, y.shape[1] - blk + 1, hop)
    z = (p[starts + blk] - p[starts]) / blk
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    z = z[lk > -70.0]
    if z.size == 0:
        return -np.inf
    rel = -0.691 + 10 * np.log10(z.mean()) - 10.0
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def loudness_ungated(x):
    """K-weighted mean-square loudness of a whole excerpt (for per-section / per-stem tables)."""
    z = (k_weight(x) ** 2).mean(axis=-1).sum()
    return float(-0.691 + 10 * np.log10(z + 1e-20))


def rms_dbfs(x):
    return float(10 * np.log10(np.mean(x ** 2) + 1e-20))


def glue_compress(x, thresh_db=-19.0, ratio=1.5, attack=0.025, release=0.3, knee_db=6.0, hop=48):
    """Gentle stereo-linked RMS bus compressor (soft knee). Returns (y, gain-reduction dB per sample)."""
    n = x.shape[1]
    nb = -(-n // hop)
    ms = np.pad((x ** 2).mean(0), (0, nb * hop - n)).reshape(nb, hop).mean(1)
    ca, cr = np.exp(-hop / (attack * SR)), np.exp(-hop / (release * SR))
    det = np.empty(nb)
    e = ms[0]
    for i, v in enumerate(ms):
        c = ca if v > e else cr
        e = c * e + (1.0 - c) * v
        det[i] = e
    over = 10 * np.log10(det + 1e-20) - thresh_db
    slope = 1.0 / ratio - 1.0
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, slope * over, slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    gr_s = np.interp(np.arange(n), np.arange(nb) * hop + hop / 2.0, gr)
    return x * undb(gr_s), gr_s


def limit(x, ceiling_db, lookahead=0.004, release=0.08, hop=16):
    """Look-ahead peak limiter (stereo-linked). The gain is computed per hop-sized block and
    linearly interpolated; the look-ahead minimum + moving average guarantee that no sample
    exceeds the ceiling, attack ramps over the look-ahead, release is a one-pole recovery."""
    c = undb(ceiling_db)
    n = x.shape[1]
    nb = -(-n // hop)
    pk = np.pad(np.abs(x).max(0), (0, nb * hop - n)).reshape(nb, hop).max(1)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    la = max(1, int(round(lookahead * SR / hop)))
    padded = np.pad(req, (1, la + 1), constant_values=1.0)
    win = np.lib.stride_tricks.sliding_window_view(padded, la + 3).min(1)[:nb]   # min over [k-1, k+la+1]
    csum = np.cumsum(np.concatenate([np.full(la, win[0]), win]))
    g = (csum[la:] - np.concatenate([[0.0], csum[:-la - 1]])[: nb]) / (la + 1)    # mean over [k-la, k]
    a = 1.0 - np.exp(-hop / (release * SR))
    out = np.empty(nb)
    y = 1.0
    for i, v in enumerate(g):
        y = v if v < y else y + (v - y) * a
        out[i] = y
    gain = np.interp(np.arange(n), np.arange(nb) * hop + hop / 2.0, out)
    return x * gain, 20 * np.log10(np.maximum(gain, 1e-12))


def write_wav24(path, x):
    """Write (2, n) float in [-1, 1) as 24-bit little-endian PCM WAV."""
    q = np.clip(np.round(x.T * 8388607.0), -8388608, 8388607).astype("<i4")
    frames = q.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    ch, bits = x.shape[0], 24
    fmt = struct.pack("<HHIIHH", 1, ch, SR, SR * ch * bits // 8, ch * bits // 8, bits)
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 4 + (8 + len(fmt)) + (8 + len(frames))) + b"WAVE")
        f.write(b"fmt " + struct.pack("<I", len(fmt)) + fmt)
        f.write(b"data" + struct.pack("<I", len(frames)) + frames)
        if len(frames) % 2:
            f.write(b"\0")


# =============================================================================
# Arrangement -> stems
# =============================================================================
def reflect(i, n):
    if n <= 1:
        return 0
    period = 2 * (n - 1)
    i %= period
    return i if i < n else period - i


def render_stems():
    stems = {}
    log = lambda msg: print(f"  [{time.time() - T0:5.1f}s] {msg}", flush=True)   # noqa: E731

    voicings = pad_voicings()
    main_notes = tied_notes([(a, b, v) for a, b, _, v in voicings])
    shim_notes = tied_notes([(a, b, [m + 12 for m in v[-3:]]) for a, b, _, v in voicings])
    root_notes = tied_notes([(a, b, [root_midi(c)]) for a, b, c, _ in voicings])
    print("  pad voicings (one chord cycle):")
    seen = set()
    for _, _, c, v in voicings:
        if c not in seen:
            seen.add(c)
            print(f"    {c:6s} root {note_name(root_midi(c)):4s} pad " + " ".join(note_name(m) for m in v))

    hall_ir = make_ir(HALL_RT60, HALL_RT60 + 0.6, 0.022, "hall", lp_hz=10000.0)
    room_ir = make_ir(ROOM_RT60, ROOM_RT60 + 0.35, 0.006, "room", n_early=14, early_ms=(2.0, 30.0),
                      lp_hz=7000.0, hp_hz=200.0)

    # ---- kick times first: the sidechain needs them ---------------------------------
    kick_times = [t_at(bar, beat) for bar in range(1, N_BARS + 1) if value_at("kick", t_at(bar)) > 0
                  for beat in range(0, BEATS_PER_BAR, 2)]
    duck = duck_curve(kick_times, SIDECHAIN_DB)

    # ---- pad: main voices + octave-up air through one moving lowpass, plus root layer
    pad = render_pad(main_notes, PAD_UNISON, 0.6, 1.2, 2.5, 2.7, "pad")
    shim = render_pad(shim_notes, SHIMMER_UNISON, 0.8, 1.4, 2.5, 2.7, "shimmer")
    log(f"pad voices rendered ({len(main_notes)} + {len(shim_notes)} notes)")
    bus = (pad * to_audio_rate(automation("pad", 0.4)) * undb(MIX_DB["pad"])
           + shim * to_audio_rate(automation("shimmer", 0.8)) * undb(MIX_DB["shimmer"]))
    del pad, shim
    cutoff = automation("pad_lp", 0.5) * (1.0 + 0.06 * np.sin(TWO_PI * 0.11 * T_CTRL))   # slow drift
    bus = tv_lowpass4(filt(bus, butter_sos(2, 90, "highpass")), cutoff)
    root = filt(render_root(root_notes), butter_sos(2, 380, "lowpass"))
    root *= to_audio_rate(automation("root", 0.8)) * undb(MIX_DB["root"])
    stems["pad"] = (bus + root[None, :]) * duck
    del bus, root
    log("pad filtered + root layer")

    # ---- arp (16th plucks over the chord tones) ---------------------------------------
    rng = rng_for("arp-human")
    arp = np.zeros((2, N))
    n_arp = 0
    for bar in range(1, N_BARS + 1):
        div = int(value_at("arp_div", t_at(bar)))
        if div <= 0:
            continue
        every = max(1, STEPS_PER_BAR // div)
        for step in range(0, STEPS_PER_BAR, every):
            t = groove_t(bar, step / 4.0)
            g = value_at("arp", t)
            if g <= 0:
                continue
            pcs = set(chord_pcs(chord_at(t)))
            pool = [m for m in range(ARP_RANGE[0], ARP_RANGE[1] + 1) if m % 12 in pcs]
            m = pool[reflect(ARP_PATTERN[step % len(ARP_PATTERN)], len(pool))]
            vel = ARP_ACCENTS[step % 4] * rng.uniform(0.94, 1.04)
            tau_a = 0.17 * (16.0 / div) ** 0.45            # thinner outro notes ring longer
            add(arp, pluck(m, value_at("arp_lp", t), tau_a), t, g * vel,
                pan=-0.18 if step % 2 == 0 else 0.18)
            n_arp += 1
    stems["arp"] = arp * undb(MIX_DB["arp"])
    log(f"arp: {n_arp} notes ({len(_pluck_cache)} distinct renders)")

    # ---- motif (sparse high FM pluck, beats 1 and 3) ----------------------------------
    motif = np.zeros((2, N))
    count = {}
    for bar in range(1, N_BARS + 1):
        g = value_at("motif", t_at(bar))
        if g <= 0:
            continue
        sec = section_of(bar)[0]
        targets = MOTIF_PITCHES.get(sec) or next(iter(MOTIF_PITCHES.values()))
        for j, beat in enumerate((0.0, 2.0)):
            i = count.get(sec, 0)
            count[sec] = i + 1
            target = targets[i % len(targets)]
            t = t_at(bar, beat)
            pcs = set(chord_pcs(chord_at(t)))
            m = min((abs(c - target), -c, c) for c in range(target - 6, target + 7) if c % 12 in pcs)[2]
            add(motif, fm_pluck(m), t, g * (0.9, 0.72)[j], pan=(-0.08, 0.12)[j])
    stems["motif"] = motif * undb(MIX_DB["motif"])

    # ---- bass line (8ths on the chord root, occasional octave jumps) ------------------
    bass = np.zeros((2, N))
    for bar in range(1, N_BARS + 1):
        g = value_at("bass", t_at(bar))
        if g <= 0:
            continue
        pattern = BASS_PATTERNS[(bar - 1) % len(BASS_PATTERNS)]
        for slot, off in enumerate(pattern):
            if off is None:
                continue
            t = groove_t(bar, slot * BEATS_PER_BAR / len(pattern))
            vel = 1.0 if slot % 2 == 0 else 0.82
            add(bass, bass_note(root_midi(chord_at(t)) + off, 0.82 * BAR / len(pattern)), t, g * vel)
    bass = filt(filt(bass, butter_sos(2, 700, "lowpass")), butter_sos(2, 32, "highpass"))
    stems["bass"] = bass * duck * undb(MIX_DB["bass"])
    log("arp, motif, bass")

    # ---- drums ------------------------------------------------------------------------
    rng = rng_for("drum-human")
    kick_x, clap_x, crash_x = make_kick(), make_clap(), make_crash()
    hats_x = [make_hat(v) for v in range(4)]
    ghosts_x = [make_hat(v, decay=0.012) for v in range(4, 7)]
    for k in ("kick", "hats", "clap", "roll", "fill", "crash"):
        stems[k] = np.zeros((2, N))
    last_beat = BEATS_PER_BAR - 1
    for bar in range(1, N_BARS + 1):
        t0 = t_at(bar)
        g = value_at("kick", t0)
        if g > 0:
            for beat in range(0, BEATS_PER_BAR, 2):
                add(stems["kick"], kick_x, t_at(bar, beat), g * (1.0 if beat == 0 else 0.9))
        g = value_at("hats", t0)
        gg = value_at("ghost_hats", t0)
        if g > 0:
            for beat in range(BEATS_PER_BAR):
                if bar in FILL_BARS and beat == last_beat:
                    continue
                for pos, vel in ((0.0, 0.55), (0.5, 0.85)):
                    add(stems["hats"], hats_x[rng.integers(len(hats_x))],
                        groove_t(bar, beat + pos) + rng.normal(0.0, 0.0012), g * vel * rng.uniform(0.9, 1.08), pan=0.22)
                if gg > 0:
                    for pos in (0.25, 0.75):
                        add(stems["hats"], ghosts_x[rng.integers(len(ghosts_x))],
                            groove_t(bar, beat + pos) + rng.normal(0.0, 0.001),
                            g * gg * 0.3 * rng.uniform(0.8, 1.1), pan=0.32)
        g = value_at("clap", t0)
        if g > 0:
            for beat in range(1, BEATS_PER_BAR, 2):
                if bar in FILL_BARS and beat == last_beat:
                    continue
                add(stems["clap"], clap_x, t_at(bar, beat), g * rng.uniform(0.94, 1.0))
    half = BEATS_PER_BAR / 2.0
    for bar in ROLL_BARS:                              # 8ths, then 16ths, crescendo
        beats = list(np.arange(0.0, half, 0.5)) + list(np.arange(half, BEATS_PER_BAR, 0.25))
        for i, b in enumerate(beats):
            x = i / (len(beats) - 1)
            hit = make_snare(("roll", bar, i), center=900.0 * (2400.0 / 900.0) ** x, tail=0.05 + 0.03 * x)
            add(stems["roll"], hit, groove_t(bar, b), 0.22 + 0.78 * x ** 1.6)
    for bar in FILL_BARS:                              # last beat: 16ths down the toms
        for i, (tom, vel) in enumerate(zip((210.0, 176.0, 148.0, 124.0), (0.7, 0.78, 0.88, 1.0))):
            hit = make_snare(("fill", bar, i), center=1400.0, tail=0.07, tom_hz=tom, tom_amt=0.9)
            add(stems["fill"], hit, groove_t(bar, last_beat + i / 4.0), vel)
    for bar in CRASH_BARS:
        add(stems["crash"], crash_x, t_at(bar))
    for k in ("kick", "hats", "clap", "roll", "fill", "crash"):
        stems[k] *= undb(MIX_DB[k])
    log(f"drums ({len(kick_times)} kicks)")

    # ---- impacts, risers, reversed swells ------------------------------------------------
    sub_x, burst_x = make_impact()
    for k in ("impact_sub", "impact_noise", "riser", "swell"):
        stems[k] = np.zeros((2, N))
    for bar in IMPACT_BARS:
        add(stems["impact_sub"], sub_x, t_at(bar))
        add(stems["impact_noise"], burst_x, t_at(bar))
    for bar in RISER_BARS:
        t0, t1 = t_at(bar), t_at(bar + 1)
        add(stems["riser"], make_riser(t1 - t0, bar), t0)
        target = next((v for a, b, _, v in voicings if a - 1e-6 <= t1 < b - 1e-6), voicings[-1][3])
        sw = make_reverse_swell(target, t1 - t0, hall_ir, bar)
        add(stems["swell"], sw, t1 - sw.shape[1] / SR)
    for k in ("impact_sub", "impact_noise", "riser", "swell"):
        stems[k] *= undb(MIX_DB[k])
    log("impacts, risers, swells")

    # ---- sends / returns --------------------------------------------------------------
    hall_in = sum(stems[k] * s for k, s in HALL_SEND.items())
    hall_in = filt(hall_in, butter_sos(2, 180, "highpass"))
    stems["hall"] = convolve_stereo(hall_in, hall_ir) * undb(HALL_RETURN_DB)
    room_in = sum(stems[k] * s for k, s in ROOM_SEND.items())
    stems["room"] = convolve_stereo(filt(room_in, butter_sos(2, 250, "highpass")), room_ir) * undb(ROOM_RETURN_DB)
    delay_in = sum(stems[k].mean(0) * s for k, s in DELAY_SEND.items())
    stems["delay"] = pingpong(delay_in, 0.75 * BEAT, DELAY_FEEDBACK)
    log("reverbs + delay")
    return stems, voicings


# =============================================================================
# Master
# =============================================================================
def master(mix):
    x = filt(mix, butter_sos(2, 22, "highpass"))                       # DC / sub-rumble
    x *= undb(TARGET_LUFS - 2.0 - lufs_integrated(x))                  # known level into the comp
    x, comp_gr = glue_compress(x)
    gain_db = TARGET_LUFS - lufs_integrated(x)
    for _ in range(4):                                                 # loudness <-> limiter
        y, lim_gr = limit(x * undb(gain_db), CEILING_DBFS)
        err = TARGET_LUFS - lufs_integrated(y)
        if abs(err) < 0.05:
            break
        gain_db += err
    # fades: 5 ms in; out over the end of the tail, reaching exact digital silence
    y = taper(y, 0.005, 0.0)
    f0, f1 = smp(SONG_SEC + 1.0), smp(TOTAL_SEC - 0.05)
    y[:, f0:f1] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(f1 - f0) / (f1 - f0))
    y[:, f1:] = 0.0
    c = undb(CEILING_DBFS)
    if np.max(np.abs(y)) > c:                                          # belt and braces
        y *= c / np.max(np.abs(y))
    return y, comp_gr, lim_gr


# =============================================================================
# Report + plot
# =============================================================================
def section_spans():
    spans = []
    for name, a, z, _ in SECTIONS:
        t0, t1 = t_at(a), t_at(z + 1)
        if z == N_BARS:
            t1 = TOTAL_SEC
        spans.append((name, a, z, t0, t1))
    return spans


def report(y, stems, comp_gr, lim_gr, wav_path):
    rate, data = wavfile.read(wav_path)
    scale = 2.0 ** 31 if data.dtype == np.int32 else 1.0
    w = (data.astype(np.float64) / scale).T
    dur = w.shape[1] / rate
    peak = np.max(np.abs(w))
    tp = np.max(np.abs(signal.resample_poly(w, 4, 1, axis=-1)))
    print("\n=== output ===")
    print(f"  file            {wav_path}  ({rate} Hz, {data.dtype} container, {w.shape[0]} ch)")
    print(f"  duration        {dur:.6f} s  ({w.shape[1]} samples; target {TOTAL_SEC:.3f} s)")
    print(f"  sample peak     {20 * np.log10(peak):.2f} dBFS   (true peak ~{20 * np.log10(tp):.2f} dBTP)")
    print(f"  loudness        {lufs_integrated(w):.2f} LUFS integrated")
    print(f"  DC offset       L {w[0].mean():+.2e}  R {w[1].mean():+.2e}")
    print(f"  full-scale hits {int(np.sum(np.abs(w) >= 0.9999))}   last 50 ms max |x| = {np.max(np.abs(w[:, -smp(0.05):])):.1e}")
    print(f"  L/R correlation {np.corrcoef(w[0], w[1])[0, 1]:.2f}")
    print(f"  compressor GR   max {-comp_gr.min():.1f} dB;  limiter GR max {-lim_gr.min():.1f} dB, "
          f">0.5 dB on {100 * np.mean(lim_gr < -0.5):.2f} % of samples")
    rows = []
    for name, a, z, t0, t1 in section_spans():
        seg = w[:, smp(t0):smp(t1)]
        rows.append((name, f"{a}-{z}", t0, t1, rms_dbfs(seg), loudness_ungated(seg),
                     20 * np.log10(np.max(np.abs(seg)) + 1e-12), -comp_gr[smp(t0):smp(t1)].mean()))
    print("\n  section      bars    time (s)        RMS dBFS  LUFS(ungated)  peak dBFS  comp GR")
    for name, bars, t0, t1, r, l, p, g in rows:
        print(f"  {name:11s} {bars:>6s}  {t0:6.1f}-{t1:6.1f}   {r:7.2f}   {l:8.2f}     {p:7.2f}   {g:5.2f}")
    print("\n  summary groups (from section names): RMS dBFS")
    spans = {name: (t0, t1, a, z) for name, a, z, t0, t1 in section_spans()}
    for label, members in REPORT_GROUPS:
        got = [spans[m] for m in members if m in spans]
        if got:
            t0, t1 = min(g[0] for g in got), max(g[1] for g in got)
            a, z = min(g[2] for g in got), max(g[3] for g in got)
            print(f"    {label:11s} bars {a:>2d}-{z:<2d} {rms_dbfs(w[:, smp(t0):smp(t1)]):7.2f}")
    # per-stem balance, relative to the full (pre-master) mix, per section
    mix = sum(stems.values())
    keys = list(stems)
    print("\n  stem balance: K-weighted loudness relative to the full pre-master mix (LU)")
    print("  " + " " * 12 + "".join(f"{k[:7]:>8s}" for k in keys))
    for name, a, z, t0, t1 in section_spans():
        s = slice(smp(t0), smp(t1))
        ref = loudness_ungated(mix[:, s])
        vals = []
        for k in keys:
            l = loudness_ungated(stems[k][:, s])
            vals.append("       ." if l - ref < -60 else f"{l - ref:8.1f}")
        print(f"  {name:11s} " + "".join(vals))
    return rows


def plot(y, rows, lufs, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap

    ink, ink2, muted = "#0b0b0b", "#52514e", "#898781"
    grid, axis_c, surface = "#e1e0d9", "#c3c2b7", "#fcfcfb"
    blue, orange = "#2a78d6", "#eb6834"
    cmap = LinearSegmentedColormap.from_list(
        "seq_blue", [surface, "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"])
    plt.rcParams.update({"font.size": 9, "axes.edgecolor": axis_c, "axes.labelcolor": ink2,
                         "xtick.color": muted, "ytick.color": muted, "axes.linewidth": 0.8})

    mono = y.mean(0)
    nfft, hop = 4096, 1200
    f, tt, S = signal.spectrogram(mono, fs=SR, window="hann", nperseg=nfft, noverlap=nfft - hop,
                                  scaling="spectrum", mode="psd")
    fl = np.geomspace(30.0, 16000.0, 360)
    edges = np.sqrt(fl[:-1] * fl[1:])
    edges = np.concatenate([[fl[0] ** 2 / edges[0]], edges, [fl[-1] ** 2 / edges[-1]]])
    W = np.zeros((fl.size, f.size))
    for i in range(fl.size):
        m = (f >= edges[i]) & (f < edges[i + 1])
        if m.any():
            W[i, m] = 1.0 / m.sum()
        else:                                           # log bin narrower than an FFT bin
            j = int(np.clip(np.searchsorted(f, fl[i]), 1, f.size - 1))
            a = (fl[i] - f[j - 1]) / (f[j] - f[j - 1])
            W[i, j - 1], W[i, j] = 1.0 - a, a
    pdb = 10 * np.log10(W @ S + 1e-20)
    vmax = np.percentile(pdb, 99.8)
    vmin = vmax - 75.0

    fig = plt.figure(figsize=(16, 9), dpi=150, facecolor=surface)
    gs = fig.add_gridspec(3, 2, height_ratios=[0.5, 3.0, 1.3], width_ratios=[1, 0.011],
                          hspace=0.06, wspace=0.012, left=0.055, right=0.955, top=0.9, bottom=0.07)
    ax_sec = fig.add_subplot(gs[0, 0])              # not sharex: each axis keeps its own ticks
    ax_sp = fig.add_subplot(gs[1, 0])
    ax_lv = fig.add_subplot(gs[2, 0])
    cax = fig.add_subplot(gs[1, 1])
    for ax in (ax_sec, ax_sp, ax_lv):
        ax.set_facecolor(surface)
    fig.text(0.055, 0.955, f"Archer launch bed - {KEY}, {BPM:g} BPM, {N_BARS} bars + {TAIL_SEC:g} s tail", color=ink,
             fontsize=13, ha="left", va="bottom")
    fig.text(0.055, 0.93, f"{TOTAL_SEC:.1f} s  ·  {lufs:.1f} LUFS integrated  ·  sample peak "
             f"{20 * np.log10(np.max(np.abs(y))):.1f} dBFS  ·  bar numbers on top, sections below",
             color=ink2, fontsize=9.5, ha="left", va="bottom")

    # section band with per-section RMS
    for i, (name, bars, t0, t1, r, *_rest) in enumerate(rows):
        ax_sec.axvspan(t0, t1, ymin=0.0, ymax=1.0, color=("#f0efec" if i % 2 == 0 else "#e6e5df"), lw=0)
        mid = (t0 + t1) / 2
        wide = t1 - t0 >= 3 * BAR - 1e-6              # narrow sections get just their name
        ax_sec.text(mid, 0.64 if wide else 0.5, name, ha="center", va="center", color=ink, fontsize=8.5)
        if wide:
            ax_sec.text(mid, 0.24, f"RMS {r:.1f} dBFS", ha="center", va="center", color=ink2, fontsize=7.5)
    ax_sec.set_ylim(0, 1)
    ax_sec.set_yticks([])
    ax_sec.tick_params(axis="x", which="both", bottom=False, labelbottom=False, top=True,
                       labeltop=True, labelsize=7, length=3, color=axis_c)
    ax_sec.set_xticks([t_at(b) for b in range(1, N_BARS + 1)])
    ax_sec.set_xticklabels([str(b) for b in range(1, N_BARS + 1)])
    for s in ax_sec.spines.values():
        s.set_visible(False)

    # spectrogram
    extent = [tt[0] - hop / 2 / SR, tt[-1] + hop / 2 / SR, np.log10(fl[0]), np.log10(fl[-1])]
    im = ax_sp.imshow(pdb, origin="lower", aspect="auto", extent=extent, cmap=cmap, vmin=vmin, vmax=vmax,
                      interpolation="bilinear")
    yt = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
    ax_sp.set_yticks(np.log10(yt))
    ax_sp.set_yticklabels(["50", "100", "200", "500", "1k", "2k", "5k", "10k"])
    ax_sp.set_ylabel("Hz")
    ax_sp.tick_params(axis="x", labelbottom=False, length=0)
    for b in range(1, N_BARS + 2):
        ax_sp.axvline(t_at(b), color=grid, lw=0.5, alpha=0.8, zorder=2)
    cb = fig.colorbar(im, cax=cax)
    cb.set_label("dB re loudest", color=ink2)
    cb.outline.set_visible(False)
    cb.ax.tick_params(labelsize=7, color=axis_c)

    # level strip: sample peak and 400 ms RMS, both dBFS on one axis
    hop_s = int(0.05 * SR)
    nb = y.shape[1] // hop_s
    frames = np.abs(y[:, : nb * hop_s]).max(0).reshape(nb, hop_s).max(1)
    tc = (np.arange(nb) + 0.5) * hop_s / SR
    ms = (y ** 2).mean(0)
    cs = np.cumsum(np.concatenate([[0.0], ms]))
    win = int(0.4 * SR)
    centers = (np.arange(nb) * hop_s + hop_s // 2).clip(win // 2, y.shape[1] - win // 2)
    rms = (cs[centers + win // 2] - cs[centers - win // 2]) / win
    peak_db, rms_db = 20 * np.log10(frames + 1e-9), 10 * np.log10(rms + 1e-12)
    ax_lv.fill_between(tc, rms_db, peak_db, where=peak_db > rms_db, color=orange, alpha=0.1, lw=0)
    ax_lv.plot(tc, peak_db, color=orange, lw=0.8, label="sample peak (50 ms)")
    ax_lv.plot(tc, rms_db, color=blue, lw=2, solid_capstyle="round", label="RMS (400 ms)")
    ax_lv.axhline(-1.0, color=muted, lw=0.8)
    ax_lv.text(TOTAL_SEC - 0.4, -2.2, "-1 dBFS", color=muted, fontsize=7.5, ha="right", va="top")
    for rb in RISER_BARS:
        ax_lv.axvspan(t_at(rb), t_at(rb + 1), color=grid, alpha=0.9, lw=0, zorder=0)
        ax_lv.text(t_at(rb, BEATS_PER_BAR / 2), -57, "riser", color=ink2, fontsize=7.5, ha="center")
    ax_lv.set_ylim(-60, 3)
    ax_lv.set_yticks([-60, -48, -36, -24, -12, 0])
    ax_lv.set_ylabel("dBFS")
    ax_lv.set_xlabel("time (s)")
    ax_lv.set_xlim(0, TOTAL_SEC)
    ax_lv.set_xticks(np.arange(0, TOTAL_SEC + 0.1, 10))
    ax_lv.grid(axis="y", color=grid, lw=0.6)
    ax_lv.legend(loc="lower left", bbox_to_anchor=(0.14, 0.0), frameon=False, fontsize=8, ncol=2,
                 labelcolor=ink2)
    for ax in (ax_sp, ax_lv):
        for name, a, z, t0, t1 in section_spans():
            ax.axvline(t0, color=ink2, lw=0.9, alpha=0.7, zorder=3)
        for b in IMPACT_BARS:
            ax.axvline(t_at(b), color=ink, lw=1.4, zorder=4)
    for b in IMPACT_BARS:
        ax_sp.text(t_at(b) + 0.4, np.log10(12500), f"impact {t_at(b):.1f} s", color=ink, fontsize=8.5,
                   ha="left", va="center", bbox=dict(boxstyle="round,pad=0.2", fc=surface, ec="none", alpha=0.85))
    ax_sp.axvline(SONG_SEC, color=ink2, lw=0.9, alpha=0.7, zorder=3)
    ax_sp.text(SONG_SEC + 0.3, np.log10(12500), "tail", color=ink2, fontsize=8, ha="left", va="center")
    for ax in (ax_sp, ax_lv):
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    for ax in (ax_sec, ax_sp, ax_lv):
        ax.set_xlim(0, TOTAL_SEC)
    fig.savefig(path, facecolor=surface)
    plt.close(fig)


# =============================================================================
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-plot", action="store_true", help="skip spectrogram.png")
    args = ap.parse_args()
    check_config()
    print(f"Rendering {TOTAL_SEC:.1f} s ({N_BARS} bars @ {BPM:g} BPM + {TAIL_SEC:g} s tail), {SR} Hz")
    stems, _ = render_stems()
    mix = sum(stems.values())
    y, comp_gr, lim_gr = master(mix)
    if not np.all(np.isfinite(y)):
        sys.exit("non-finite samples in the output")
    wav_path = os.path.join(HERE, OUT_WAV)
    write_wav24(wav_path, y)
    print(f"  [{time.time() - T0:5.1f}s] wrote {wav_path}")
    rows = report(y, stems, comp_gr, lim_gr, wav_path)
    if not args.no_plot:
        png = os.path.join(HERE, OUT_PNG)
        plot(y, rows, lufs_integrated(y), png)
        print(f"  [{time.time() - T0:5.1f}s] wrote {png}")


T0 = time.time()
TIMELINE = build_timeline()

if __name__ == "__main__":
    main()
