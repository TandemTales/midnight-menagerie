# Round 8 — how to decide the merge

`refine` rounds are decided by the judges' winner. Round 6 is why this file
exists: POLISH came back with the whole field inside 0.67, three judges naming
three different winners, one of them the baseline, and **the ranking tiebreak
returned a candidate whose mean was below the screens it started from.** Merging
it would have regressed the game. What worked was reading the SCREENS and the
BRIEFED FIXES.

So: the judges pick the winner, and this file is the check that the winner is
actually an improvement. Every number here is measured on TALLOW at BASE
`27f7028` and is in `C:/UILOOP/r8/judging/r8/background/TALLOW/_bgmetrics.json`
(the six captures) and `C:/UILOOP/r8/sweep-TALLOW/_bgmetrics.json` (all
seventeen rooms, byte-identical on a re-shoot, so a before/after on it is real).

## First, the two things that disqualify

1. **Perf.** `python tools/on_port.py <port> tools/gpuprof.py --scene combat
   --w 1600 --h 900`, three runs. Over 15.5 ms is a fail however good it looks.
   TALLOW is 13.95.
2. **The other fourteen rooms.** Sweep all seventeen on the winner's branch and
   diff against `sweep-TALLOW`. The round photographs three; a candidate that
   lifts those and drops the rest is not a winner. Watch `void%`, `tooth` and
   `inkDp` per room.

## Then, per briefed fix, what to look at

| fix | the test | TALLOW now |
|---|---|---|
| 1. drawn subject on the wall modes | `inkShare` / `inkDp` on an isolated room, and LOOK at FOLIAGE (hedge, greenhouse) and INDUSTRIAL (kitchens, lampworks, attic) at 1:1 | ink% 0.355-0.644, inkDp 0.011-0.346 |
| 2. more rooms carry ornament | how many of the seventeen have any | 3 papers on panelling, a trace on stone |
| 3. the 15 untouched prop silhouettes | 2x crops of the highest-count props: shrub 61, cabinet 58, column 51, headstone 44 | a prop CAN be A/B'd: phase pinned, 0 differing px |
| 4. the CSS room is uniform | `spread` on `room-warm.webp` / `room-moon.webp` | 0.217 / 0.199 vs room.webp's 0.449 |
| 5. two regions sharing a mode are one room recoloured | `python tools/lookmetrics.py --tag r8 --tier high` | 0.63 mean cross-correlation (round 2) |
| 6. the top of the frame is ZERO, not dark | `void%` / `voidT%` / `skyLvl` | hedge 31.6 / 71.5 / 0.6; mainMenu 1.5 / 0.05 / 16.5 |
| 7. statue, Greenhouse planting, chair | 2x crops | better than they were, not right |
| 8. the region palettes | **not theirs to change.** Read `notes_for_merger` for whether they say so | Ballroom plum at exposure 3.55, Greenhouse acid green |

## Things that are NOT the winner's doing

- **Prop arrangement.** One RNG stream per region, so anything that consumes a
  different number of draws reshuffles the layout. Judge the props, not which
  corner one landed in.
- **Creature pose.** Animated; a different frame in every candidate.
- **The HUD, cards, plates and type.** Identical in all candidates.

## Grafts to look for regardless of who wins

- **BISTRE added six one-knob overrides to `tools/shot-scripts/backdrop-room.js`**
  (`skyglow`, `masslit`, `haze`, `bounce`, `wallgain`, `floorgain`). Purely
  additive, phase pinning intact, and a capture with no fragment params is
  unchanged — so it is safe to keep from a losing branch, and `wallgain` /
  `floorgain` are the two structural plane gains, which is the value structure
  of the picture.

## Queued behind this merge, already diagnosed — do NOT re-derive

See `docs/notes/2026-09-17-a-third-of-the-hedge-maze-is-pure-black.md`.

1. **A painted sky for the open-sky shell and the glass ceilings.** Specified
   numerically: ramp rgb (3,11,26) to (13,24,44), `CLOUD_AMP` 0.034, stars
   `FRAC` 0.0008 / `GAIN` 7.0 / `POW` 3.2. Our sky is 4x-20x too dark and its
   stars up to 11x too HOT. Bound: any variation term above ~0.34 drives the sky
   back to pure black at the low end of its own modulation.
2. **The CSS room's two lit passes never reach black.** `lit()`'s `amb` is a
   hard floor and the black-floor pass only lowered the unlit one. Set the
   amount by eye with a board in front of it, not by the number.
