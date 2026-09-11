# The Crypt was its boss

2026-09-10. The handoff named the Crypt the one wing that cannot be begun in,
diagnosed it as "the roster — every early Crypt fight is a resurrection fight,
so its difficulty is in BODIES TO KILL", and noted that `summonFix` moved it
0 -> 1 of 14 without moving its first-fight cost. All three readings came from
one column, and the column was not what its label said.

---

## The column

`run.py --startsweep` printed `1st fight % pool`; `tests/run/index.html` printed
`first fight, % of pool`. The code under both:

    for (const f of r.ledger) {
      if (f.region === region && f.max) { pct += 100 * f.cost / f.max; pctN++; }
    }

That is **every fight in the starting wing, boss included**, averaged. Never the
first fight. `schema.js` documents `REGION_FIGHT_WEIGHT` as "the Courage a wing's
first fight takes as a share of the pool" and was built from it, as was the
difficulty note's "the Greenhouse and the Crypt killed a starting deck at an
ORDINARY ~19% a fight".

The sweep prints the split now — `all fights`, `a room`, `its boss` and
`died at its boss` — with the old column kept and relabelled for what it is.

## What the Crypt costs, split

Same 14 seeds the sweep uses (the seed formula is untouched), working tree,
with the Graveyard — the Crypt's structural twin — as the control:

                          Crypt                       Graveyard
    rooms (scuffles)      2.0% of pool   n=73  0 lost 4.5%   n=65  1 lost
      early / std / adv   0.9 / 1.8 / 3.8%            0.0 / 9.3 / 5.4%
    Big Scares            27.2%          n=3   0 lost 4.1%   n=1   0 lost
    THE BOSS              91.3%          n=14  12 lost 43.9%  n=13  2 lost
    boss pool at wing 1   277                         127
    arrived at the boss   95% of pool (min 60%)       94%
    where runs died       12 of 12 at the boss        2 at the boss, 1 at gy-7

73 near-free rooms and a 91% boss average to "an ordinary 16.7%". Every Crypt
death is the Bone Curator, met at 95% Courage, and when the Kid fell he still
had between 18 and 152 of his 277 standing. The early roster the handoff
suspected — Loose Tibia, Skull Roller, Bone Heap, Ribcage Guard — costs a
starting deck under 1% a fight.

Committed HEAD reproduces the handoff exactly (1 of 14 cleared, 17.5%), so the
instrument is sound; only its label was wrong. The working tree reads 2 of 14
and 16.7% with the 2026-09-09 starting decks.

## Why the transform could not reach it

`REGION_FIGHT_WEIGHT.crypt` is 1.41, so a Crypt fight at wing one takes
`courageFix = 1 / 1.41 = 0.709`. The Bone Curator is authored at 390:
390 x 0.709 = **277**, exactly the pool measured. The ratio applies to the rooms
and the boss alike, and the wing's price sits almost entirely in the boss. A
single multiplier that brought him near the Graveyard's 44% would have to
roughly halve again, and would take the rooms from 2% toward nothing.

`summonFix` did not move "first-fight cost" because that number was mostly the
Curator's, and summons are not what he is made of.

A wing's cost has a SHAPE — rooms against boss — and the route transform prices
only its mean.

## What would fix it (not built)

Price the boss by a weight measured separately from the rooms:

- `REGION_ROOM_WEIGHT` from non-boss fights and `REGION_BOSS_WEIGHT` from the
  boss fight, each measured route-neutral at wing one with the reference deck
  and normalised to the Foyer's rooms and to the Butler respectively.
- `Run#_buildCombat` already has `tier` in scope where `courageFix` is set, so
  `tier === 'boss'` chooses which weight applies.
- **Censoring.** A boss that kills the Kid reads at most 100% however
  over-priced he is. From a loss, estimate the cost to kill him as
  `cost x pool / (pool - left)`.
- **Measuring without touching the tree.** `data/schema.js` imports nothing, so
  a scratch page can carry an import map pointing `/game/src/data/schema.js` at
  a copy whose weights are all 1.0 — route-neutral at wing one by construction.
- Hold: run gate at its documented error, determinism 5/5, and a start sweep
  where no wing loses nearly every run at its own boss.

## What is NOT claimed

- The costs are the bot's, as every number in this file's predecessors is. The
  ORDER is trustworthy; the absolute numbers are not a human's.
- Nothing here says the Bone Curator is overtuned where he is authored. At his
  own slot he meets a deck he was written for. The defect is the price he is
  given when he is met first.
