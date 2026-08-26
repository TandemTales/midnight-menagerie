"""Soundtrack analyser for Midnight Menagerie.  OWNER: audio agent.

The audio agent cannot listen to the ten licensed music tracks, so it measures
them instead and assigns music cues from the measurements.

    python game/src/audio/analyze.py            # analyse + write map + manifest
    python game/src/audio/analyze.py --json     # just dump the raw numbers
    python game/src/audio/analyze.py --manifest # ONLY rewrite the runtime manifest
                                                # (no decoding, no numpy needed)

Outputs
    game/assets/audio/manifest.json  the track list music.js discovers at runtime
    game/src/audio/analysis.json     raw per-track measurements (machine readable)
    docs/AUDIO-MAP.md                human readable findings + the cue weighting

`--manifest` exists so a new mp3 can join the rotation the moment it is copied,
without waiting for anyone to re-run the (slow, dependency-heavy) analysis.
tools/prep_assets.py should write the same file when it copies the mp3s; see
docs/notes/2026-08-25-audio-round-2-random-soundtrack.md.

Decode strategy, in order of preference:
    1. soundfile (libsndfile >= 1.1 decodes mp3 natively)  -- no external binary
    2. pydub + ffmpeg (imageio_ffmpeg supplies a bundled ffmpeg if the system
       has none)
    3. raw mp3 frame-header scan -> duration + bitrate only (no spectral data);
       cue assignment then falls back to duration + file size heuristics.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import wave
import subprocess
import tempfile

try:                                     # --manifest must work on a bare python
    import numpy as np
except ImportError:                      # pragma: no cover
    np = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
AUDIO_DIR = os.path.join(ROOT, "game", "assets", "audio")
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysis.json")
OUT_MD = os.path.join(ROOT, "docs", "AUDIO-MAP.md")
OUT_MANIFEST = os.path.join(AUDIO_DIR, "manifest.json")

TARGET_SR = 22050          # everything is analysed at this rate
SILENCE_DB = -50.0         # threshold used to find loop head/tail


# ── decoding ────────────────────────────────────────────────────────────────

def _decode_soundfile(path):
    import soundfile as sf
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        ch = f.channels
        step = max(1, int(round(sr / TARGET_SR)))
        chunks = []
        block = 1 << 18
        while True:
            data = f.read(block, dtype="float32", always_2d=True)
            if len(data) == 0:
                break
            mono = data.mean(axis=1)
            # box-decimate to ~TARGET_SR (cheap anti-alias: mean of `step` taps)
            n = (len(mono) // step) * step
            if n:
                chunks.append(mono[:n].reshape(-1, step).mean(axis=1))
        y = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        return y.astype(np.float32), sr / step, sr, ch, "soundfile"


def _ffmpeg_exe():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _decode_ffmpeg(path):
    exe = _ffmpeg_exe()
    if not exe:
        raise RuntimeError("no ffmpeg")
    tmp = os.path.join(tempfile.gettempdir(), "mm_analyze.wav")
    subprocess.run(
        [exe, "-v", "quiet", "-y", "-i", path, "-ac", "1", "-ar", str(TARGET_SR), tmp],
        check=True,
    )
    with wave.open(tmp, "rb") as w:
        raw = w.readframes(w.getnframes())
        sr = w.getframerate()
    y = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    try:
        os.remove(tmp)
    except OSError:
        pass
    return y, float(sr), sr, 1, "ffmpeg"


_BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATES_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}


def _scan_frames(path):
    """Last-resort: walk mp3 frame headers for duration + mean bitrate."""
    data = open(path, "rb").read()
    i = 0
    n = len(data)
    if data[:3] == b"ID3" and n >= 10:
        b = data[6:10]
        size = ((b[0] & 0x7F) << 21) | ((b[1] & 0x7F) << 14) | \
               ((b[2] & 0x7F) << 7) | (b[3] & 0x7F)          # syncsafe int
        i = 10 + size
    frames, dur, brs = 0, 0.0, []
    while i + 4 <= n:
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue
        ver = (data[i + 1] >> 3) & 3          # 3=MPEG1 2=MPEG2 0=MPEG2.5
        layer = (data[i + 1] >> 1) & 3        # 1 = Layer III
        bri = (data[i + 2] >> 4) & 0xF
        sri = (data[i + 2] >> 2) & 3
        pad = (data[i + 2] >> 1) & 1
        if layer != 1 or sri == 3 or bri in (0, 15) or ver == 1:
            i += 1
            continue
        table = _BITRATES_V1L3 if ver == 3 else _BITRATES_V2L3
        br = table[bri] * 1000
        sr = _RATES[0 if ver == 3 else (2 if ver == 2 else 3)][sri]
        spf = 1152 if ver == 3 else 576
        flen = int((spf // 8) * br / sr) + pad
        if flen < 24:
            i += 1
            continue
        frames += 1
        dur += spf / sr
        brs.append(br)
        i += flen
    return dur, (sum(brs) / len(brs) / 1000.0 if brs else 0.0), frames


def decode(path):
    for fn in (_decode_soundfile, _decode_ffmpeg):
        try:
            return fn(path)
        except Exception as e:  # noqa: BLE001 - fall through to next decoder
            last = e
    print(f"  ! full decode failed ({last}); header scan only", file=sys.stderr)
    return None, 0.0, 0, 0, "headers"


# ── measurement ─────────────────────────────────────────────────────────────

def db(x):
    return 20.0 * math.log10(max(float(x), 1e-9))


def stft_mag(y, sr, n_fft=2048, hop=512):
    if len(y) < n_fft:
        return np.zeros((1, n_fft // 2 + 1)), np.zeros(n_fft // 2 + 1)
    win = np.hanning(n_fft).astype(np.float32)
    nframes = 1 + (len(y) - n_fft) // hop
    # cap analysis at ~4000 frames spread across the whole file (memory + speed)
    stride = max(1, nframes // 4000)
    idx = np.arange(0, nframes, stride)
    frames = np.lib.stride_tricks.as_strided(
        y, shape=(nframes, n_fft), strides=(y.strides[0] * hop, y.strides[0])
    )[idx]
    spec = np.abs(np.fft.rfft(frames * win, axis=1)).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    return spec, freqs


def onset_bpm(y, sr):
    """Spectral-flux onset envelope -> autocorrelation -> BPM guess."""
    n_fft, hop = 1024, 256
    if len(y) < n_fft * 8:
        return 0.0, 0.0
    # analyse a representative 90 s slice from the middle of the track
    want = int(90 * sr)
    if len(y) > want:
        s = (len(y) - want) // 2
        y = y[s:s + want]
    win = np.hanning(n_fft).astype(np.float32)
    nframes = 1 + (len(y) - n_fft) // hop
    frames = np.lib.stride_tricks.as_strided(
        y, shape=(nframes, n_fft), strides=(y.strides[0] * hop, y.strides[0])
    )
    spec = np.abs(np.fft.rfft(frames * win, axis=1)).astype(np.float32)
    logspec = np.log1p(spec * 40.0)
    flux = np.maximum(np.diff(logspec, axis=0), 0).sum(axis=1)
    if flux.std() < 1e-6:
        return 0.0, 0.0
    flux = flux - flux.mean()
    fps = sr / hop
    ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
    ac /= (ac[0] + 1e-9)
    lo = int(fps * 60.0 / 200.0)     # 200 BPM
    hi = min(int(fps * 60.0 / 55.0), len(ac) - 1)   # 55 BPM
    if hi <= lo:
        return 0.0, 0.0
    seg = ac[lo:hi]
    peak = int(np.argmax(seg)) + lo
    bpm = 60.0 * fps / peak
    while bpm < 70:
        bpm *= 2
    while bpm > 175:
        bpm /= 2
    return round(bpm, 1), round(float(seg.max()), 3)


def loop_bounds(y, sr):
    """First / last sample above the silence floor, in seconds."""
    if y is None or len(y) == 0:
        return 0.0, 0.0
    win = max(1, int(sr * 0.02))
    n = (len(y) // win) * win
    env = np.abs(y[:n].reshape(-1, win)).max(axis=1)
    thresh = 10 ** (SILENCE_DB / 20.0)
    live = np.nonzero(env > thresh)[0]
    if len(live) == 0:
        return 0.0, len(y) / sr
    return live[0] * win / sr, min((live[-1] + 1) * win / sr, len(y) / sr)


def measure(path):
    name = os.path.basename(path)
    size = os.path.getsize(path)
    y, sr, src_sr, ch, method = decode(path)
    hdr_dur, hdr_br, _ = _scan_frames(path)

    m = {
        "file": name,
        "bytes": size,
        "decoder": method,
        "sourceRate": src_sr,
        "channels": ch,
        "headerDuration": round(hdr_dur, 2),
        "bitrateKbps": round(hdr_br, 1),
    }
    if y is None or len(y) == 0:
        m.update({"duration": round(hdr_dur, 2), "analysed": False})
        return m

    dur = len(y) / sr
    peak = float(np.abs(y).max())
    rms = float(np.sqrt(np.mean(np.square(y, dtype=np.float64))))

    spec, freqs = stft_mag(y, sr)
    power = spec + 1e-9
    tot = power.sum(axis=1)
    centroid = float(np.mean((power * freqs).sum(axis=1) / tot))
    # 85% spectral rolloff
    csum = np.cumsum(power, axis=1)
    roll_idx = np.argmax(csum >= (0.85 * csum[:, -1:]), axis=1)
    rolloff = float(np.mean(freqs[roll_idx]))
    # band energy split
    def band(lo, hi):
        sel = (freqs >= lo) & (freqs < hi)
        return float(power[:, sel].sum() / power.sum())
    low = band(0, 250)
    mid = band(250, 2000)
    high = band(2000, sr / 2)
    # spectral flatness -> noisy/airy vs tonal
    gm = float(np.exp(np.mean(np.log(power))))
    am = float(np.mean(power))
    flatness = gm / (am + 1e-12)

    # short-term loudness spread: how much the track breathes
    winsz = max(1, int(sr * 0.4))
    n = (len(y) // winsz) * winsz
    body_start, body_end = 0.0, dur
    if n:
        st = np.sqrt(np.mean(np.square(y[:n].reshape(-1, winsz), dtype=np.float64), axis=1))
        st_db = 20 * np.log10(np.maximum(st, 1e-9))
        dynamic = float(np.percentile(st_db, 95) - np.percentile(st_db, 10))
        # "body" = the stretch that is within 6 dB of the track's median level.
        # Anything outside it is an intro fade-in or an outro fade-out, and a
        # loop that returns into a fade-out sounds broken.
        med = float(np.median(st_db))
        solid = np.nonzero(st_db >= med - 6.0)[0]
        if len(solid):
            body_start = float(solid[0]) * winsz / sr
            body_end = float(solid[-1] + 1) * winsz / sr
    else:
        dynamic = 0.0

    bpm, bpm_conf = onset_bpm(y, sr)
    head, tail = loop_bounds(y, sr)

    m.update({
        "analysed": True,
        "duration": round(dur, 2),
        "peakDb": round(db(peak), 2),
        "rmsDb": round(db(rms), 2),
        "crestDb": round(db(peak) - db(rms), 2),
        "centroidHz": round(centroid, 1),
        "rolloff85Hz": round(rolloff, 1),
        "lowRatio": round(low, 4),
        "midRatio": round(mid, 4),
        "highRatio": round(high, 4),
        "flatness": round(flatness, 5),
        "dynamicRangeDb": round(dynamic, 2),
        "bpm": bpm,
        "bpmConfidence": bpm_conf,
        "loopStart": round(head, 3),
        "loopEnd": round(tail, 3),
        "bodyStart": round(body_start, 2),
        "bodyEnd": round(body_end, 2),
        "fadeInSec": round(max(0.0, body_start - head), 2),
        "fadeOutSec": round(max(0.0, tail - body_end), 2),
    })
    return m


# ── cue assignment ──────────────────────────────────────────────────────────

CUES = ["title", "map", "combat", "combatAlt", "boss", "safe", "shop",
        "rescue", "victory", "defeat"]

CUE_NOTES = {
    "title":     "menu bed, first thing anyone hears — mid-bright, calm, loops forever",
    "map":       "blueprint navigation — sparse, curious, low pressure",
    "combat":    "the default Scuffle — driving, mid-bright, needs a pulse",
    "combatAlt": "second Scuffle bed so back-to-back fights do not repeat",
    "boss":      "Big Scare / boss — the darkest, heaviest, longest bed we have",
    "safe":      "Safe Room — warmest and quietest, high crest, breathes",
    "shop":      "Lost Things — playful, bright, a bit jaunty",
    "rescue":    "companion rescue — brightest and most sparkly, short is fine",
    "victory":   "run won — big and bright",
    "defeat":    "run lost — dark and slow, but not ugly",
}


def z(vals):
    a = np.asarray(vals, dtype=np.float64)
    if a.std() < 1e-9:
        return np.zeros_like(a)
    return (a - a.mean()) / a.std()


def assign(tracks):
    """Greedy best-fit: score every (track, cue) pair, then assign cues in a
    fixed priority order taking the best remaining track each time."""
    ok = [t for t in tracks if t.get("analysed")]
    if not ok:
        # header-only fallback: order by duration alone
        order = sorted(tracks, key=lambda t: -t["headerDuration"])
        prio = ["boss", "combat", "combatAlt", "map", "title", "safe",
                "shop", "victory", "defeat", "rescue"]
        return {c: order[i % len(order)]["file"] for i, c in enumerate(prio)}

    bright = z([t["centroidHz"] for t in ok])
    longer = z([t["duration"] for t in ok])
    lowend = z([t["lowRatio"] for t in ok])
    loud = z([t["rmsDb"] for t in ok])
    crest = z([t["crestDb"] for t in ok])
    tempo = z([t["bpm"] or 100 for t in ok])
    air = z([t["highRatio"] for t in ok])
    dyn = z([t["dynamicRangeDb"] for t in ok])

    F = {t["file"]: dict(bright=bright[i], longer=longer[i], lowend=lowend[i],
                         loud=loud[i], crest=crest[i], tempo=tempo[i],
                         air=air[i], dyn=dyn[i])
         for i, t in enumerate(ok)}

    def score(f, cue):
        v = F[f]
        if cue == "boss":
            return 1.5 * v["lowend"] + 1.2 * v["longer"] + 0.8 * v["loud"] - 1.4 * v["bright"]
        if cue == "combat":
            return 1.3 * v["tempo"] + 1.0 * v["loud"] + 0.8 * v["longer"] - 0.3 * abs(v["bright"])
        if cue == "combatAlt":
            return 1.1 * v["tempo"] + 0.9 * v["loud"] + 0.6 * v["longer"] + 0.3 * v["bright"]
        if cue == "title":
            return 1.2 * v["longer"] + 0.9 * v["crest"] + 0.5 * v["bright"] - 0.6 * abs(v["tempo"])
        if cue == "map":
            return 1.0 * v["crest"] + 0.8 * v["longer"] - 0.9 * v["loud"] + 0.4 * v["air"]
        if cue == "safe":
            return 1.4 * v["crest"] - 1.2 * v["loud"] + 0.6 * v["dyn"] - 0.4 * v["tempo"]
        if cue == "shop":
            return 1.2 * v["bright"] + 0.9 * v["tempo"] - 0.5 * v["lowend"]
        if cue == "rescue":
            return 1.6 * v["air"] + 1.1 * v["bright"] - 0.6 * v["longer"]
        if cue == "victory":
            return 1.2 * v["bright"] + 1.0 * v["loud"] - 0.4 * v["longer"]
        if cue == "defeat":
            return 1.3 * v["lowend"] - 1.1 * v["tempo"] - 0.8 * v["bright"] + 0.5 * v["crest"]
        return 0.0

    # cues that must get a *unique* track first, in importance order
    priority = ["boss", "combat", "title", "safe", "map", "shop",
                "combatAlt", "rescue", "victory", "defeat"]
    free = {t["file"] for t in ok}
    out = {}
    for cue in priority:
        pool = free if free else {t["file"] for t in ok}
        best = max(pool, key=lambda f: score(f, cue))
        out[cue] = best
        free.discard(best)
    return out


# ── report ──────────────────────────────────────────────────────────────────

def write_md(tracks, cuemap):
    rows = []
    hdr = ("| file | dur | rms dB | peak dB | crest | centroid Hz | rolloff | "
           "low/mid/high | bpm | dyn dB | body (loop window) | fade in/out |")
    sep = "|---|---|---|---|---|---|---|---|---|---|---|---|"
    for t in tracks:
        if not t.get("analysed"):
            rows.append(f"| `{t['file']}` | {t['headerDuration']:.1f}s | "
                        f"header-only ({t['bitrateKbps']:.0f} kbps) | | | | | | | | | |")
            continue
        rows.append(
            f"| `{t['file']}` | {t['duration']:.1f}s | {t['rmsDb']:.1f} | {t['peakDb']:.1f} | "
            f"{t['crestDb']:.1f} | {t['centroidHz']:.0f} | {t['rolloff85Hz']:.0f} | "
            f"{t['lowRatio']*100:.0f}/{t['midRatio']*100:.0f}/{t['highRatio']*100:.0f}% | "
            f"{t['bpm']:.0f} | {t['dynamicRangeDb']:.1f} | "
            f"{t['bodyStart']:.1f}–{t['bodyEnd']:.1f}s | "
            f"{t['fadeInSec']:.1f}/{t['fadeOutSec']:.1f}s |")

    inv = {}
    for cue, f in cuemap.items():
        inv.setdefault(f, []).append(cue)
    by_file = {t["file"]: t for t in tracks}

    cue_rows = []
    for cue in CUES:
        f = cuemap.get(cue)
        t = by_file.get(f, {})
        why = []
        if t.get("analysed"):
            why.append(f"{t['duration']:.0f}s")
            why.append(f"centroid {t['centroidHz']:.0f}Hz")
            why.append(f"{t['rmsDb']:.1f} dB rms")
            if t.get("bpm"):
                why.append(f"~{t['bpm']:.0f} bpm")
        cue_rows.append(f"| `{cue}` | `{f}` | {', '.join(why)} | {CUE_NOTES[cue]} |")

    md = f"""# Audio map — Midnight Menagerie

Generated by `game/src/audio/analyze.py`. Do not hand-edit: re-run the script.

The audio agent cannot listen to the ten licensed tracks, so every cue assignment
below is derived from measurement. Decode path used: **{tracks[0].get('decoder','?')}**
(analysis rate {TARGET_SR} Hz mono).

## What was measured

* **duration** — decoded length; also cross-checked against an mp3 frame-header scan.
* **rms / peak / crest** — crest (peak − rms) is the proxy for "breathes vs squashed".
  High crest = sparse and dynamic (rest, map). Low crest = dense (combat, boss).
* **spectral centroid / 85% rolloff** — brightness. Bright = menus, shops, rescues.
  Dark = boss, defeat.
* **low/mid/high band split** — 0–250 Hz / 250 Hz–2 kHz / 2 kHz–Nyquist share of
  total energy. A high low-ratio is weight; a high high-ratio is air/sparkle.
* **bpm** — spectral-flux onset envelope, autocorrelated, folded into 70–175.
* **dynamic range** — p95 − p10 of 400 ms short-term loudness.
* **loop bounds** — first/last 20 ms window above {SILENCE_DB:.0f} dBFS, so head/tail
  digital silence never gaps a loop.
* **body window / fades** — the stretch of the track within 6 dB of its own median
  short-term level. Everything outside it is an intro fade-in or an outro fade-out.
  `music.js` loops **inside the body window**, never back into a fade-out, which is
  the difference between a loop you never notice and one that dips every few minutes.

## Measurements

{hdr}
{sep}
{chr(10).join(rows)}

## Cue assignment

| cue | track | evidence | role |
|---|---|---|---|
{chr(10).join(cue_rows)}

### Assignment method

Every metric is z-scored across the ten tracks, then each cue scores each track
with a weighted sum of those z-scores (see `assign()` in `analyze.py`):

* `boss` = 1.5·low + 1.2·long + 0.8·loud − 1.4·bright
* `combat` = 1.3·tempo + 1.0·loud + 0.8·long − 0.3·|bright|
* `title` = 1.2·long + 0.9·crest + 0.5·bright − 0.6·|tempo|
* `safe` = 1.4·crest − 1.2·loud + 0.6·dynamic − 0.4·tempo
* `shop` = 1.2·bright + 0.9·tempo − 0.5·low
* `rescue` = 1.6·air + 1.1·bright − 0.6·long
* `map` = 1.0·crest + 0.8·long − 0.9·loud + 0.4·air
* `victory` = 1.2·bright + 1.0·loud − 0.4·long
* `defeat` = 1.3·low − 1.1·tempo − 0.8·bright + 0.5·crest

Cues are then filled in importance order (`boss, combat, title, safe, map, shop,
combatAlt, rescue, victory, defeat`), each taking the best track not yet used, so
no two cues collide while ten cues and ten tracks are in play.

## How `music.js` uses this

* Tracks stream from `<audio>` elements (`preload="none"`) routed through
  `MediaElementAudioSourceNode`, so nothing is decoded into memory up front and a
  7 MB file never stalls the first frame.
* Each cue carries `vol` (per-cue trim so the beds match in perceived level —
  derived from the measured rms), `loopStart` / `loopEnd` from the table above,
  and a `tension` profile.
* Switching cues does a **2.5 s equal-power crossfade** (`cos/sin` law, so the
  sum stays at unity power through the middle of the fade rather than dipping).
* `audio.tension(0..1)` sweeps a lowpass from 20 kHz down to ~700 Hz and trims
  up to 3 dB, so the bed darkens as Courage drops or a Big Scare telegraphs.
* Ducking is a −6 dB shelf on the music bus with a 60 ms attack and a
  configurable release, fired by boss intros and heavy hits.
"""
    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    open(OUT_MD, "w", encoding="utf-8").write(md)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="print raw json only")
    a = ap.parse_args()

    files = sorted(f for f in os.listdir(AUDIO_DIR) if f.lower().endswith(".mp3"))
    if not files:
        print("no mp3s in " + AUDIO_DIR, file=sys.stderr)
        return 1
    tracks = []
    for f in files:
        p = os.path.join(AUDIO_DIR, f)
        if not a.json:
            print("analysing", f, flush=True)
        tracks.append(measure(p))

    cuemap = assign(tracks)
    payload = {"analysisRate": TARGET_SR, "tracks": tracks, "cues": cuemap}
    open(OUT_JSON, "w", encoding="utf-8").write(json.dumps(payload, indent=1))

    if a.json:
        print(json.dumps(payload, indent=1))
        return 0

    write_md(tracks, cuemap)
    print("\nwrote", os.path.relpath(OUT_JSON, ROOT))
    print("wrote", os.path.relpath(OUT_MD, ROOT))
    print("\ncue map:")
    for c in CUES:
        print(f"  {c:10s} -> {cuemap[c]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
