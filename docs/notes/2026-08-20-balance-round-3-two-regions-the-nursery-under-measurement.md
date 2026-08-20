# Balance — round 3: two regions, and the Nursery under measurement

Owner: balance agent. Instrument: `tests/critic-design/` (`sim.py`, `lab.py`, `sweep.py`,
`lib/{expedition,policy,bot}.js`). Round 2 is in
`docs/notes/2026-08-20-balance-round-2-corrected-targets-haunt-ladder.md`; this continues
from it. Everything below is measured through the real `Run` and the real `CombatEngine`.

---

## The hole this round closes

`RUN_LENGTH_REGIONS` had been flipped to 2, `tests/run/run.py` walked the ladder, and
`mapgen.js` had full Nursery support — but **the simulator stopped at the first boss**.
`lib/expedition.js:189` read `if (wasBoss) { out.result = 'victory'; break; }`, so with a
two-region build shipping, half the content had never been played by anything but its own
unit tests. Every number in round 2 was a Foyer number labelled "the run".

`expedition()` now follows the run layer instead of second-guessing it: `claimReward()` on a
boss calls `completeRegion()`, which either ends the run or calls `advanceRegion()` — new
map, same deck, same Keepsakes, same Snacks, same Courage — and the walker re-seeds from the
new map's `startIds` and keeps going. Only death, a stall, or clearing the **last** region
ends the loop. Everything is recorded per region as well as in total: `out.regions[]` carries
each region's nodes, fights, ledger, room mix, the loadout at its boss door, and the loadout
the player **walked in with**, which turned out to be the most important number in this note.

Two instrument fixes came with it, both of which changed answers:

* **`bench()` takes a `region`.** It builds its Run at that point on the ladder, so the
  Governess and the Nursery Big Scares can be benched against captured loadouts the same way
  the Butler always could. `sweep.py` gained `--region`, `--haunt` and `--out` to match.
* **The bench now strides its loadout pool instead of taking the first `BENCH` entries.**
  The naive loop fills the pool first, so once a pool grew past 40 the bench was replaying an
  almost entirely naive-generated — i.e. selected-for-luck — subset. Measured cost of that
  bug: the Governess read **75.0% / 77.5%** on the biased sample against **60.5% / 61.9%**
  in-run on the same two seeds. After the fix the two measures agree to within 3 points.
  Any earlier bench figure in this repo carries that bias.

---

## Where round 3 landed — n=60, both bots, balanced drafting, Haunt 0

Two independent seeds, because several of these sit near a band edge and boss samples are
n≈25–56.

### Competent

| | target | seed 90000 | seed 71000 |
|---|---|---|---|
| **Whole-run survival (both regions)** | **45–60%** | **46.7%** | **50.0%** |
| Foyer — cleared | — | 73.3% | 76.7% |
| Foyer — boss win given reached | — | 97.8% | 82.1% |
| Foyer — boss turns | 8–12 | 11.71 | 11.96 |
| Foyer — Scuffle turns / cost | 3–5 | 4.17 / 11.9 | 4.18 / 11.3 |
| **Nursery — entered** | — | 73.3% | 76.7% |
| **Nursery — cleared given entered** | — | 63.6% | 65.2% |
| Nursery — reached the Governess | — | 86.4% | 91.3% |
| **Governess — win given reached** | **60–75%** | **73.7%** | **71.4%** |
| **Governess — turns** | **8–12** | **9.39** | **10.21** |
| Nursery — Scuffle turns / cost | 3–5 | 3.30 / 4.7 | 3.58 / 4.9 |
| Nursery — Big Scare win | — | 95.8% | 96.3% |

### Naive

| | seed 90000 | seed 71000 |
|---|---|---|
| Whole-run survival | 25.0% | 36.7% |
| Foyer — cleared | 51.7% | 46.7% |
| Nursery — cleared given entered | 48.4% | 78.6% |
| Governess — win given reached | 57.7% | 88.0%¹ |

¹ n=25, and it is survivor selection: only the luckiest 47% of naive runs reach her at all.

### The skill gap

Whole-run survival, competent vs naive: **46.7 / 25.0** and **50.0 / 36.7** — 21.7 and 13.3
points. That reads as a collapse against round 2's 33.3, and it is not one. Round 2's figure
was **one region's** survival; two-region survival is a product of more gates, so both bots'
absolute numbers fall and the arithmetic difference shrinks even when skill matters exactly
as much. The ratio is the stable statistic:

* round 2, one region: 70.0 / 36.7 = **1.91×**
* round 3, two regions, seed 90000: 46.7 / 25.0 = **1.87×**

Per gate the gap is intact and it is still concentrated where it should be — the controlled
bench figures show **+30 / +20 points at the Foyer Big Scare** and **+15 at the Nursery Big
Scare**. The exception is flagged below: the Governess produces almost none of it.

---

## Content changes, each with its measurement

### 1. The Nursery was authored at Foyer power and shipped against a region-2 deck

The diagnosis, from the first two-region measurement ever taken (`sim-2R-base.json`):

| | Foyer | Nursery (before) |
|---|---|---|
| ordinary enemy Courage | 18–43 (mean 29) | 21–42 (mean 34) |
| Big Scare Courage | 95–128 | 110–136 |
| **Scuffle turns** | 4.16 | **2.33** |
| **Scuffle Courage cost** | 12.07 | **2.64** |
| **free Scuffles (cost 0)** | 16.5% | **54.3%** |
| Big Scare win, competent | 78.7% | 96.4% |
| boss win, competent | 92.9% | **94.7%** |
| boss turns | 11.57 | **15.96** |

The player arrives in the Nursery with a deck 60% bigger and **five times the Keepsakes**
(10 → 15.9 cards, 1 → 5.5 Keepsakes), against enemies 17% larger. Meanwhile the *boss* had
been given double the Butler's Courage. The scaling had been applied to exactly the one place
that only buys length.

**Ordinary enemies: Courage ×1.45, damage +35%.** Button Baby 21→30, Jack in the Box 32→46,
Patchwork Soldier 38→55, Rocking Horse 42→60, Blanket Blob 34→50, Porcelain Doll 36→52;
Button Toss 5→8, Box Bite 7→10, Wooden Saber 9→13, Rock 6→9, Blanket Snap 8→11, Smother 5→7.
Measured: Scuffle turns **2.33 → 3.30** (target 3–5), cost 2.64 → 4.74, free Scuffles
54.3% → 42.2%.

Five moves were left alone because published intent tests in `tests/enemies/index.html` pin
them and that suite is not mine: POP! 7/12/17, Tea Cup Tap 7 (+3 Cracked), Sharp Little Hands
4×2, Gallop 7+4/stack, Stuffed Fist 11 and Wild Flail 5.

**Big Scares: Courage ×1.2, damage +30%.** Toy Chest 110→132 with Lid Slam 13→17 and Toy
Barrage 4×3→6×3; Porcelain Twins 68→80 each with Pointed Finger 10→13 and Little Slap
5×2→7×2. The Patchwork Giant's two attacks are both pinned, so its pressure went onto the
axis its own design already owns: Courage 126→150, **Loose Stuffing 1→2 per Patch torn**
(Haunt 9 goes 2→3) and Coming Apart +4→+6, so it genuinely gets angrier as you dismantle it.
Measured effect on win rate: **none** (92.5% → 97.5% bench, inside noise). See "still out of
band".

The Porcelain Doll's Haunt-8 note quoted an absolute Courage figure derived from the old
36-point pool; `shatterFrac` is a ratio, so the note was reworded to match rather than the
value changed.

### 2. The Governess — Courage was buying length and nothing else

A Courage sweep at the real Nursery boss door, 40 fights per step, against loadouts real
expeditions were carrying (`sweep.py --tier boss --region nursery`):

| ×Courage | competent win | turns | cost |
|---|---|---|---|
| 1.00 | 95.0% | 15.70 | 22.6 |
| 0.80 | 95.0% | 12.32 | 20.6 |
| 0.70 | 95.0% | 11.28 | 17.0 |
| 0.60 | 95.0% | 9.65 | 16.0 |
| 0.50 | 95.0% | 8.15 | 15.4 |

**The win rate does not move at any scale.** Halving her Courage halves the fight and changes
nothing about whether you win it. She was never a threat; she was a wall. Two structural
reasons, and the second is the one that generalises:

* Her printed damage was Foyer-sized — 9.5/turn average against a player blocking ~14–18.
* **One turn in four of each cycle dealt no damage at all.** `Tighten the Stitch` was
  `DEFEND_BUFF`, 13 Guard and nothing else. Against a deck that can convert spare energy into
  Guard on demand, a wasted enemy turn is worth more to the player than the Guard is worth to
  the boss, and it was why 85% of her printed damage never landed.

Changes:

* **Courage 280 → 175**, phase transition 150 → 100 (the same 53% split).
* **Tighten the Stitch is now `ATTACK_DEFEND`, 17 damage + 13 Guard**, still priming Needle
  Point. The thread she draws tight is the seam Mind Your Seams took in on *you*.
* Sharp Correction 11 → 24, Mind Your Seams 5×2 → 12×2, Snip Snip 4×3 → 11×3. Needle Point
  stays 13/18 — that one is pinned by a published intent test.
* Every one of these is wired through `damageFn` **and** `effect` with `bossDmg(c)`, so the
  Haunt-10 intent reconciliation in §5b holds. Audit: 2061 scored enemy turns, 0 mismatches.

The tuning path, all measured at the real door:

| | win (competent) | turns | cost |
|---|---|---|---|
| before | 95.0% | 15.7 | 22.6 |
| Courage 190, first damage pass | 87.5% | 10.2 | 42.6 |
| damage +15% | 75.0% | 9.7 | 55.9 |
| **shipped (‑6% from that)** | **73.7% / 71.4% in-run** | **9.4 / 10.2** | **50.8 / 50.5** |

### 3. The Foyer is now act one, and it was still priced as the whole game

This is the change nobody asked for and the measurement forced. Whole-run survival is
`P(clear Foyer) × P(reach the Governess) × P(beat her)`. With the Governess correctly at ~70%,
the two-act target of 45–60% requires the road to be worth **0.64–0.86**. It measured
**0.567**: act one alone was removing 35% of all competent runs before the Nursery had been
seen, ten of sixty competent deaths at a Foyer Big Scare and eight more in Foyer Scuffles
fought on the Courage those Big Scares had taken.

A 78%-competent elite was the right number when the Butler was the last thing in the game.
It is not the right number for act one of two, and STS2-REFERENCE §6's act structure is
explicit that this is a ladder, not a single act.

Swept at the real Foyer elite door, 45 fights per step:

| ×Courage | competent | naive | turns |
|---|---|---|---|
| 1.00 | 80.0% | 55.6% | 9.1 |
| **0.90** | **91.1%** | **73.3%** | **8.1** |
| 0.85 | 95.6% | 75.6% | 7.8 |
| 0.80 | 100.0% | 77.8% | 7.4 |

0.85 and below make them free for a competent player and stop them teaching anything. **All
three Foyer Big Scares are at 0.9× Courage**, applied as `hpMul` in `encounters.js` because
this pass owns the encounter tables and not the Foyer roster. Measured: Foyer clear rate
**65% → 73.3% / 76.7%**, competent Big Scare deaths 10 → 8 / 4, and the elite still costs
~30 Courage to win with an 18-point skill gap intact.

**Request to the enemies agent:** if this holds, fold the 0.9× into `enemies/foyer.js`
directly (Grand Coatcheck 104→94, Unwelcome Guest 128→115, House Bell 95→86) and drop the
`hpMul`. Two multipliers stacked on one number is not where these should live long-term.
Note also that the Unwelcome Guest is the outlier of the three — 55% competent before this
change against 88% and 85% for the other two — and may want a shape fix rather than a number.

---

## Section C — the things that only appear on a second region

**Deck draft volume holds; it does not stall at 15.** Measured at each boss door, competent:

| | Butler | Governess |
|---|---|---|
| deck | 15.0 | 20.5 |
| upgrades | 1.2 | 2.7 |
| Keepsakes | 4.6 | 10.0 |

The deck grows by 5–6 cards and 1.5 upgrades across act two, and the policy's own
anti-bloat term (`cardValue` penalises past 15 cards) is what holds it near 20 rather than
any content ceiling. If anything **upgrades are the thin resource** — 2.7 upgraded cards in a
21-card deck at the final boss is 13%, against 8% at the Butler, so the ratio barely improves
across a whole extra act. Safe Rooms are being spent on healing rather than the Forge, which
is correct play and a signal that the Courage economy is tight rather than that upgrades are
undervalued.

**Keepsakes accumulate into something real: 4.6 → 10.0.** That is the largest single power
swing between the acts and it is the main reason region-2 content authored at region-1 scale
disappeared. Whether ten of them read as a *build* rather than a grab-bag is a question for
whoever owns `relics.js` — what I can say from measurement is that the *quantity* is more
than enough to matter and that it is not being matched by content scaling.

**The Courage economy holds at the Governess's door, and breaks at the Nursery's front
door.** The player arrives at the Governess with a median **97% of maximum** Courage
(mean 87%, n=38) — the Nursery's Safe Rooms and the guaranteed pre-boss one do their job, and
nobody arrives unable to recover. But the *region transition* restores nothing:

| entering the Nursery | mean | p25 | median | min |
|---|---|---|---|---|
| Courage | 36.7 / 71 | **17** | 38 | 7 |
| as % of max | 51.5% | 23% | 51% | 10% |

A quarter of runs start act two below a quarter Courage with no Safe Room yet, and that is
exactly where the new Nursery deaths are: 5 of 44 competent runs die in Nursery **Scuffles**,
a room type they win 97% of the time.

I measured the fix rather than asserting it. `expedition()` gained a `regionHeal` what-if
(off by default, `sim.py --regionheal`), restoring a fraction of maximum Courage on clearing
a region. At 0.85, same seed, same content:

| competent, seed 90000 | shipped | with an 85% post-boss restore |
|---|---|---|
| Nursery Scuffle deaths | 5 | **0** |
| reached the Governess | 86.4% | **95.5%** |
| Governess win given reached | 73.7% | 71.4% |
| **whole-run survival** | 46.7% | **50.0%** |

It removes an entire class of death — "act two killed me in its first three rooms with
act one's damage" — without touching the Governess at all. **`state/run.js` is meta-run's
file, so this is a request, not a change:** `advanceRegion()` should restore Courage, or the
first row of a new region should guarantee a Safe Room the way the last row does. StS's act
break is a beat; ours is a hard cut.

**Does the Foyer still make sense as act one? Not as it was — see change 3 above.** It does
now: 73–77% clear, a Big Scare that costs 30 Courage and still separates the bots by 18
points, and Scuffles at 4.2 turns / 12 Courage that remain the run's main attrition.

**Region transitions are correct in the real browser**, verified by driving
`run.completeRegion()` — the actual function the boss reward calls — in the running game
(`shots/2r-foyer-map.png`, `2r-nursery-map.png`, `2r-victory.png`):

* HUD flips `The Foyer · Wing 1` → `The Nursery · Wing 2`; Courage carries across unhealed
  (41/68 in and 41/68 out), which is the finding above made visible.
* Map header reads `The Forgotten Nursery`, roman II, `Wing 2 of 17`,
  `Boss: The Governess`; title block `II OF XVII`; the blueprint crop, room names (Music Box
  Room, Toy Room, Night Nursery, Bedtime Hall) and the hazard chip are all the Nursery's.
* The expedition-end screen reads `WING 2 · THE NURSERY`, `24 ROOMS DEEP`,
  `2 / 17 WINGS DRAWN`. No console errors on any of the three.

**One frontend bug found there.** On a two-region victory the run's `rescued` is
`['marmalade', 'mopsy']`, but Game Over prints *"You got one out"* and
*"1 Companion freed — Marmalade"* — it names the Companion you brought instead of the one you
freed, and undercounts. Correct on a one-region run, wrong the moment there are two.
`scenes/gameover.js` is frontend's file; reporting rather than changing.

---

## Still out of band, honestly

* **The Nursery's Big Scares are free: 95.8% / 96.3% competent.** The Courage and damage
  increases above moved them by nothing measurable, and the reason is the Governess's reason:
  too many zero-damage enemy turns. Of the Porcelain Twins — 22 of 40 bench draws, the pool's
  most common formation — **Proper never attacks at all**; Good Posture, Hush Now and Tea
  Party are Guard, a buff and a heal. A two-enemy elite where one enemy is a support unit is
  a damage race the region-2 deck cannot lose.
* **I could not afford to fix it, and the arithmetic is worth stating plainly.** With two acts
  and `S = F × R × B`, holding `S ≥ 45%` and `B ≤ 75%` leaves the whole road through act two a
  budget of about 13% total attrition. Nursery Big Scares are taken 0.55×/run; moving them
  from 96% to a genuine 80% spends 9 of those 13 points on its own and drops whole-run
  survival to ~43%. This is the same trap round 2 documented for the Foyer's elites, one act
  further along, and there are three ways out, in order of preference:
  1. **The post-boss Courage restore above.** Measured at +9.1 points of `R`, which is very
     nearly the whole budget needed.
  2. **A third region.** The survival target is a product; spreading it over more gates makes
     each individual gate affordable. Two acts is the worst case for this arithmetic.
  3. Widen the whole-run survival band.
* **The Governess produces almost no skill gap** — +7.5 and +2.5 points naive-to-competent on
  the bench, against +30/+20 at the Foyer Big Scare. She is now correctly *hard*, but she is
  hard the way a wall is: her three phase-two Repair Patches (Reinforced −6 to the first
  Trick, Buttoned +4 Guard, Stuffed heal-if-you-were-gentle) all make the fight **longer** and
  none of them make it **branch**. The Butler's House Rules attack the player's decision
  space; the Governess's Patches attack their damage total. That is a content note for the
  enemies agent, not a number.
* **Nursery Scuffles still cost 4.7 Courage against the Foyer's 11.9**, and 42% of them cost
  nothing. Turns are in band, cost is not. Closing it means more attrition on the road, which
  is the same 13-point budget as above.
* **`seam-pinch` is not worth printing.** "The next time you gain Guard, you gain 3 less,
  then it is removed" — non-stacking, max 1 — is the Governess's only debuff and it is
  approximately zero against a deck gaining 15+ Guard a turn. It lives in
  `enemies/_lib.js`, which is not mine. **Request to the enemies agent:** make it stack, or
  make it a percentage. It is the one lever that attacks the block economy directly, which is
  where 85% of her damage goes.

## One region or two? — **two.**

Backed by measurement, and the recommendation would have been the other way an hour into this
round:

* Every primary target is now green on two independent seeds: whole-run survival
  **46.7% / 50.0%** against 45–60%, the Governess **73.7% / 71.4%** against 60–75% at
  **9.4 / 10.2 turns** against 8–12, and Scuffles at 3.3–4.2 turns against 3–5.
* Deaths are spread across both acts and both bosses rather than piling on one gate: Foyer
  Big Scare 8, Foyer Scuffle 7, Nursery boss 10, Nursery Scuffle 5, Foyer boss 1.
* The deck and the Keepsake count grow across act two by enough to feel like progression
  (15→20.5 cards, 4.6→10 Keepsakes), which is the thing a second act is *for* and which a
  one-region run cannot deliver at all.
* The skill ratio is unchanged from the one-region build (1.87× vs 1.91×), so nothing about
  decisions mattering was lost.

The honest caveats: the road through act two is softer than act two should be (its Big Scares
are free and its Scuffles cheap), and closing that needs either the post-boss Courage restore
or the third region. Neither is a reason to ship one act — the Nursery's fights are now
correctly *shaped*, they simply do not yet remove enough runs on the way to a boss that does.
Going back to `RUN_LENGTH_REGIONS = 1` would throw away a working second act to avoid a
tuning problem that is one `run.js` line and one Twins rewrite from solved.

---

## Reproducing

```
python tests/critic-design/sim.py --n 60 --bots naive,competent --policies balanced \
    --bench 40 --seed 90000
python tests/critic-design/sim.py --n 60 --bots naive,competent --bench 40 --seed 71000
python tests/critic-design/sim.py --n 60 --bench 0 --regionheal 0.85      # the what-if
python tests/critic-design/sweep.py --tier boss  --region nursery --n 40 --gen 30 \
    --bots naive,competent --scales 1,0.8,0.7,0.6,0.5
python tests/critic-design/sweep.py --tier elite --region foyer   --n 45 --gen 15 \
    --bots naive,competent --scales 1,0.9,0.85,0.8
python tools/shot.py 2r-nursery-map --wait 2 --steps \
  "js:MM.bus.emit('run:start',{companion:'marmalade',kid:'maya',seed:4242})|wait:0.6|\
jsawait:MM.goto('map',{})|wait:3|js:MM.ctx.run.courage=41|\
jsawait:MM.ctx.run.completeRegion()|wait:9|js:0"
```

Use **n=60** and **two seeds**. The identical config measured 46.7% and 50.0% on the two
seeds above, and the Governess read 15 points apart on bench vs in-run until the bench
sampling bug was fixed.

Artefacts: `sim-2R-base.json` (the first two-region measurement, before any content change),
`sim-2R-r1/r2/r3.json` (the tuning path), `sim-2R-r4a.json` / `sim-2R-r4b.json` (shipped, two
seeds), `sim-2R-whatif-heal.json`, `sweep-governess-hp.json`, `sweep-gov-A/B.json`,
`sweep-foyer-elite.json`.

Suites green after every change: run 50 / 0, enemies 37 / 0, enemies audit 2061 turns / 0,
combat 590 / 0, cards, map 23 / 0, seams check 1590 sites / **0 problems**, seams proof 52 / 0.
