# Balance — notes

Owner: balance agent. Instrument: `tests/critic-design/` (`sim.py`, `lab.py`,
`sweep.py`, `lib/{expedition,policy,bot}.js`). Everything below is measured
through the real `Run` and the real `CombatEngine`; nothing is modelled.

Round 1's write-up is in `docs/NOTES.md` under 2026-08-20 — the rebuilt
simulator, the two bots, and the first pass at the Foyer. This file continues
from there.

---

## Round 2 — 2026-08-20

### What changed underneath me first

Three things went live between rounds and all three move balance, so everything
was re-baselined before anything was touched:

* **`engine.stats.damageDealtThisTurn` is now genuinely maintained.** It had been
  declared, zeroed each turn, and never written. The Butler's GUESTS DO NOT
  ROUGHHOUSE rule reads it, so the rule could not fire at any threshold. My
  round-1 workaround (counting hits on the Butler himself via `onDamaged` into
  `engine.field`) is **deleted**; `butler.js` is back to the plain
  `(rc.damageDealtThisTurn || 0) >= 15`. Note the semantics widened with it —
  the engine counts damage dealt to *any* enemy, where the workaround counted
  only damage to the Butler. That is correct per the rule text and it makes his
  summoned Dust Bunny a way to trip the rule by accident. Measured break rate is
  unchanged in practice at Haunt 0.
* **Clutter is live.** `state/run.js buildCombat()` now registers
  `STATUS_TRICK_DEFS`, so Lost Luggage's and the Grand Coatcheck's deck
  interference finally adds cards. `wireStatusTricks()` in `lib/expedition.js`
  is inverted accordingly — it is now a no-op that only does something under
  `?clutter=0`, which still answers "what is that interference worth".
* **Snacks are usable and repriced** (45 / 65 / 80). The competent bot eats
  ~22 per 60 expeditions.

Plus the map agent's changes: a guaranteed Safe Room on the last walkable row,
and the Big Scare quota cut 0.11 → 0.065 of the sheet.

### The targets were corrected

The coordinator's original pair was arithmetically impossible: region survival
≈ P(reach the boss) × P(win the boss), so a 60% survival floor needs the boss at
≥71% against a 45–65% boss band. Corrected targets for the Foyer, the *tutorial*
region: **boss 70–85%, region survival 65–78%, competent, Haunt 0.** The 45–65%
boss band moves to later regions and higher Haunt.

### Where round 2 landed — n=60, seed 90000, balanced drafting

| | target | naive | **competent** | gap |
|---|---|---|---|---|
| Whole-region survival | 65–78% | 36.7% | **70.0%** | **+33.3** |
| Region boss — bench win | 70–85% | 67.5% | **82.5%** | +15.0 |
| Region boss — bench turns | 8–12 | 12.7 | **11.6** | |
| Region boss — in-run win | — | 62.9% | 91.3% | |
| Big Scare — bench win | see below | 47.5% | **82.5%** | **+35.0** |
| Normal Scuffle — turns | 3–5 | 4.62 | **3.90** | |
| Normal Scuffle — Courage | 8–12 | 10.84 | **10.63** (med 7) | |
| Reached the boss | — | 58.3% | 76.7% | |

**The naive/competent gap is the headline: 33.3 points of whole-region survival**
(36.7% → 70.0%), 35 points on the Big Scare bench, 15 on the boss bench, and
three-quarters of a turn off every Scuffle. Decisions matter, and they matter
most at the elites, which is the right place for them to.

Deaths per 60 competent expeditions: 9 Big Scare, 5 Scuffle, 4 boss.

### Round 2 content changes, each with its measurement

**`foyer-7` (Lost Luggage + Dust Bunny) demoted back to 'standard'.** Round 1
promoted it to put a second pair in the opening pool. Clutter went live in
between, which made it a materially harder fight than the one I promoted:
opening-Scuffle cost measured **14.65** against an 8–12 target. Reverting took
scuffle cost to 10.29 mean / 7 median and lifted P(reach boss) 68.3% → 75%.
The weighted roll does the composition work on its own now; the pair weight went
2 → 3 to compensate.

**All three Big Scares to 0.9× Courage** — Grand Coatcheck 115 → 104, Unwelcome
Guest 142 → 128, House Bell 105 → 95. This is the change that hit the survival
target, and the reasoning is the corrected arithmetic rather than the fights
themselves feeling wrong. With ~0.83 Big Scares on a path, a 73%-win elite alone
removes 18% of all runs before the boss is seen, which capped survival at 50%.
Sweeping elite Courage (45 fights per step, `sweep.py --tier elite`):

| ×Courage | competent | naive | turns |
|---|---|---|---|
| 1.00 | 77.8% | 40.0% | 8.6 |
| **0.90** | **88.9%** | **60.0%** | 8.1 |
| 0.82 | 95.6% | 64.4% | 7.4 |
| 0.75 | 95.6% | 71.1% | 6.8 |

**The Butler 178 → 165** (phase two 100 → 92). In-run boss win was 66.7%, below
the corrected 70–85% band. 165 puts the bench at 82.5% and 11.6 turns.

**The Haunt ladder now has a continuous axis** (`hauntBase` in
`data/enemies/_lib.js`). It had none: `hpMul` was a flat +8% / +6% applied at
level 1 and never again, so Haunt 20 fielded the same Courage as Haunt 1.
Counting the per-enemy hooks across the whole roster: **35 at `level >= 1`, 13 at
`>= 9`, 4 at `>= 10`, and three in total anywhere between 2 and 8.** Levels 2–8
did essentially nothing, and the measurements agreed — Haunt 0 → 5 moved
survival only 70% → 65% and the boss 82.5% → 76.7%, and Haunt 10 left the boss
at 70%, well above the 45–65% band asked of high Haunt. The ramp is now
+2.2% (ordinary) / +2.0% (Big Scare and boss) Courage per level past the first,
capped at double.

Measured ladder, competent, bench figures:

| Haunt | survival | boss bench | elite bench | boss turns |
|---|---|---|---|---|
| 0 | 70.0% | 82.5% | 82.5% | 11.6 |
| 5 | 60.0% | 86.7%¹ | 60.0% | 14.9 |
| **10** | 27.5% | **53.3%** | 60.0% | 15.4 |

¹ n=30 against H5-captured loadouts, which the H5 rest policy left healthier
(1.4 rests a run against 1.0 at H0). The in-run figure, 80.0%, is the better
read at this sample size.

**Haunt 10 now lands the boss at 53.3% and the elites at 60% — inside the
45–65% band.** Haunt 5 is a gentle step; the curve is much steeper between 5 and
10 than between 0 and 5, because Courage compounds while the player's deck does
not.

### Still out of band, honestly

* **Boss in-run win is 91.3% at Haunt 0** against a bench figure of 82.5%. The
  in-run number is selection-biased upward — only runs healthy enough to path to
  the boss fight it, and the guaranteed pre-boss Safe Room now means most of
  them arrive at a median 67 of 68 Courage. The bench is the controlled measure
  and it is in band; I would not tune against the in-run figure.
* **Big Scares are at 82.5% for a competent player**, above the 60–75% band the
  brief carried over from round 1. This is deliberate and it is forced by the
  arithmetic: at 70–75% they alone remove ~20% of runs pre-boss and survival
  cannot reach 65%. Either the elite band or the survival band has to give for
  the *first* region, exactly as the boss band did. Flagging rather than
  choosing — if 60–75% elites are wanted for the Foyer, survival lands ~55%.
* **Zero-cost opening fights are 25–26%**, improved from 30.2% but not solved.
  The early pool cannot do better without a heavier pair: only three enemies are
  legal in a region's first Scuffle (Dust Bunny, Coatrack Crawler, Lost Luggage),
  and the cheapest pair among them, Two Dust Bunnies at 40, is already in the
  pool and already weighted 3×. The next cheapest is 50 and it pushed opening
  cost to 14.65. A new authored formation at ~43 Courage — a Coatrack Crawler at
  reduced Courage escorting a Bunny — would close it; that is content authoring,
  not tuning, so I have not invented it unilaterally.
* **Boss fights at high Haunt run long** — 15.4 turns at Haunt 10 against the
  8–12 shape target. Courage is the laziest ascension axis and it is currently
  the only continuous one. The interesting half of high Haunt is the per-enemy
  behavioural flags, and there are three of those in total between levels 2 and
  8 across the entire roster. That is a content gap for the enemies agent, and
  it is where Haunt 2–8 should get its character rather than from my ramp.

### Reproducing

```
python tests/critic-design/sim.py --n 60 --bots naive,competent \
    --policies balanced --bench 40 --seed 90000
python tests/critic-design/sim.py --n 40 --bots competent --haunt 10 --bench 30
python tests/critic-design/sweep.py --tier elite --n 45 --gen 15 \
    --bots naive,competent --scales 1,0.9,0.82,0.75
python tests/critic-design/lab.py --tier boss --n 36 --gen 12 --bots naive,competent
```

Use **n=60**, not n=30. The identical config measured 46.7% at n=30 and 40.0% at
n=60; several earlier readings on both sides were noise.

Artefacts: `tests/critic-design/sim-R2-base.json` (before the round-2 retune),
`sim-R2-c.json` (after, Haunt 0), `sim-R2-h5.json`, `sim-R2-h10.json`,
`sweep-result.json`, `lab-result.json`.

Suites green after every change: cards 445 / 0, enemies 37 / 0, combat 590 / 0,
map 23 / 0, run 50 / 0, seams check 1571 sites / 0 problems, seams proof 52 / 0.
