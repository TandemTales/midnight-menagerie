# A third of the Haunt ladder is above the ceiling

2026-09-01. **129 of the 366 authored Haunt behaviours — 35% — are gated at
levels 6 to 10. `MAX_HAUNT` is 5.** They cannot fire, and each carries a
player-facing sentence nobody can ever read.

Found while closing the standing open item "Haunt scaling is exercised at one
tier": `tests/boss-haunt/check.py` proves every BOSS really hits harder at higher
Haunt, and nothing did the same for ordinary enemies or Big Scares.

## Half of that item closes positively: Haunt does reach ordinary enemies

`tests/critic-design/ladder.py` grew a `--benchhaunt` flag. It has to be a
SEPARATE knob from `--haunt`, because `--haunt` also raises the difficulty of
the expeditions that generate the constant player — tying them together
un-constants the player and the comparison measures nothing.

Ordinary Scuffle pool, loadouts generated at Haunt 0, content measured at Haunt 5:

    region              H0    H5      region              H0    H5
    foyer                7%   14%     ballroom            12%   21%
    nursery             38%   43%     crypt               15%   18%
    sleeping-quarters   17%   56%     hedge-maze          31%   36%
    kitchens-cellars    27%   30%     secret-passages     33%   45%
    greenhouse          13%   22%     bathhouse            9%   14%
    graveyard           12%   20%     kennels              8%   10%
    study-library       11%   15%     pumpkin-grounds      7%   10%
    attic-observatory   13%   24%     heart               30%   35%
    lampworks           12%   10%

**Every region's enemy Courage rose (about +15%) and the cost rose in sixteen of
seventeen** — lampworks is the one that fell, at n=8, which is noise. The Courage
ramp added on 2026-08-20 works, and it works on ordinary bodies, which nothing
had checked.

## The other half does not close

The behavioural half of the ladder is a different story. Counting every
`level >= N` inside a `hauntScaling(level)` block across `data/enemies/` and
`data/bosses/` — and there are no other `level` parameters in those files:

    gate        hooks    reachable at MAX_HAUNT = 5?
    >= 1         166     yes
    >= 2           8     yes
    >= 3          19     yes
    >= 4          20     yes
    >= 5          24     yes
    >= 6          18     NO
    >= 7          18     NO
    >= 8          17     NO
    >= 9          60     NO
    >= 10         16     NO
                 ---
    total        366     129 unreachable

**Sixty hooks sit at Haunt 9 alone**, spread across sixteen of the seventeen
regions — every wing's Big Scares have two to five of them. `core/save.js`
clamps hard: `advanceHaunt` returns `Math.min(MAX_HAUNT, …)`, and `MAX_HAUNT`
is 5, matching the six rungs `data/haunts.js` names for the player.

These are not stubs. They are finished, documented content with the sentence
already written:

    Haunt 6: it can hold 3 Webs at once instead of 2.
    Haunt 9: the dance opens on Beat 2.

## The file's own count is eleven days stale, and that is the mechanism

`data/enemies/_lib.js` line 318 records an audit:

> counting them across the whole roster there are 35 hooks at `level >= 1`, 13
> at `>= 9`, 4 at `>= 10` — and three in total anywhere between 2 and 8. Levels
> 2 to 8 did essentially nothing.

That was 2026-08-20, when three regions shipped. It is now 166, 60, 16, and
**124** between 2 and 8. Fourteen more regions arrived, each author followed the
established shape — a hook at 1, a hook at 9 — and nobody re-counted against a
ceiling of 5.

So the fix that comment describes is also half-stale. It added a continuous
Courage ramp because "levels 2 to 8 did essentially nothing"; levels 2 to 8 now
carry 124 behavioural hooks, of which the 53 at 6, 7 and 8 are unreachable.

## What is NOT established

Whether the unreachable hooks would MATTER if reached. The obvious test is to
isolate them — Haunt 8 against Haunt 9, since the Courage ramp is continuous
across that step so any jump is the sixty `>= 9` hooks. Run on the elite tier at
six fights per region it showed no systematic movement: lampworks +33 points,
attic-observatory −10, ballroom +8, heart +11, and graveyard, bathhouse and
kennels at exactly zero change.

**That measurement is underpowered and I am not claiming from it.** The elite
tier has enormous per-fight variance — win rates in the same run range from 0%
to 100% — and n=6 cannot resolve it. All that is established is the static fact:
the hooks cannot fire. Whether they are worth reaching needs a properly powered
run, which is `ladder.py --tier elite --benchhaunt 8` against `9` at n≥24.

## The fork

* **Raise `MAX_HAUNT`.** 129 authored behaviours become reachable for nothing,
  and the difficulty tail — 5 rungs against Slay the Spire's 20 — is the thing
  most obviously short of the comparison. It needs `data/haunts.js` to name the
  new rungs, because the table is what the player is shown.
* **Or re-tier the hooks down into 1–5**, which keeps the ladder short and
  admits that 6–10 was aspirational.

Doing neither leaves a third of the ladder written and unreachable, which is the
same shape as the advanced encounter pool found this morning and the fifteen dead
seams before it.

Results: `ladder-haunt5.json`, `ladder-elite-h8.json`, `ladder-elite-h9.json`.
