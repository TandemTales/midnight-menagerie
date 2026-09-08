# Difficulty by where you met it

2026-09-07. The party chooses its route, so any wing can be wing one. The
content cannot be: every region is authored at one difficulty. This is the
system that reconciles them, what it took three attempts to get right, and the
one wing it still does not reach.

---

## The problem, measured before anything was built

`--startsweep 14` begins 14 expeditions in each of the sixteen startable wings
with the same starting deck:

    began in            cleared wing 1     first fight, % of pool
    lampworks              7 / 14                12.9%
    foyer                  8 / 14                13.3%
    greenhouse             0 / 14                20.0%
    crypt                  0 / 14                18.7%
    bathhouse              0 / 14                26.2%
    kennels                0 / 14                32.0%
    secret-passages        0 / 14                34.8%
    pumpkin-grounds        0 / 14                64.4%

**Six wings, 84 runs, no survivors.**

## The transform

A fight is worth `whatThisSlotWants / whatThisWingIs`. A wing met where it
belongs is 1.0 and plays exactly as authored; the Pumpkin Grounds at wing one is
0.21; the Foyer at wing six is asked to answer a player with three times the
deck it was written for.

## What a wing IS took three attempts, and the first two are in the source

**Ladder index — wrong shape.** The enemies are nearly flat across the house:
`hp x damage` per body spreads only 0.92 to 1.46, and the **Bathhouse, slot
fourteen, is the LOWEST of them.** Ladder position simply does not predict
difficulty.

**Formation weight — right idea, wrong magnitude.** `pool x damage-per-turn`
over each region's early/standard/advanced tiers is a real measure of what a
fight is, and it spreads 0.97 to 2.49. But it under-predicts the deep wings by
about 1.6x: at that scaling the Pumpkin Grounds still died 14/14 at wing one.

It under-predicts because **deep content is mechanically harder, not
numerically bigger** — Guard per turn, summons that refill the board, statuses
that price out a hand. That is the whole history of this project's balance work
and no static read of hp and damage can see it.

**What it COSTS — measured.** The Courage a wing's first fight takes as a share
of the pool, against a reference starting deck, normalised to the Foyer. Same
bot everywhere, so the comparison holds even though the absolute numbers are the
bot's. Foyer 1.00, Lampworks 0.97, Nursery 1.76, Kennels 2.41, Secret Passages
2.62, Pumpkin Grounds 4.84.

## And the two directions need different levers

Putting the ratio on one number failed twice, and both failures are recorded
because they are the reasons the final shape looks odd.

**On both, square-rooted each.** Symmetrical, and wrong. Lowering enemy damage
removes the pressure this harness's bot needs to act at all: past-30 went
**3 → 13** and a Dough Blob sat at **47/47 for two hundred turns**. That is the
turtling degeneracy `2026-09-01-the-guard-axis.md` is about, and a difficulty
knob must not reach into it.

**On the pool alone.** The ratio runs to 4.84 on the upside, so the Foyer met at
wing six got a **five times Courage pool** — a five times longer fight. past-30
stayed at 13.

So the levers are asymmetric, and each is chosen by a measurement:

    too hard for this slot   cut the POOL. Shortens a grind without touching
                             pressure — and pool is the right lever anyway,
                             because the Greenhouse and the Crypt killed a
                             starting deck at an ORDINARY ~19% a fight. Their
                             bodies simply outlive twelve cards.
    too easy for this slot   raise DAMAGE, capped at 2.5. Adds pressure without
                             lengthening anything. Past 2.5 the front hall
                             one-shots a Kid, and 2.0 is the endpoint every
                             earlier balance number was measured against.

## What it did

    first-fight cost across the sixteen   12.9-64.4%  ->  12.0-22.7%
    wings that cannot be begun in              6      ->  1
    victories over 50 expeditions              3      ->  5
    run gate                                   1 error (the documented one)
    determinism / resume / mid-fight           5/5, 3/3, 3/3

## The one it does not reach, and why

**The Crypt is still 0/14, at an ordinary 17.5% cost.**

Its structure is the Graveyard's twin — 14 rows, 64 nodes, 30.4 fights against
63.8 and 30.7 — and the Graveyard clears 10/14. So it is neither fight cost nor
wing shape. It is the roster, and the encounter table says so in its own
`teaches` lines:

    Loose Tibia     killing it leaves something on the floor
    Skull Roller    it leaves, and comes back, and you cannot hit it in between
    Bone Heap       kill it and it collapses into a Pile; break the Pile and it
                    stays dead
    Ribcage Guard   it takes the first 10 damage aimed at somebody else

Every early Crypt fight is a **resurrection or re-spawn** fight. Its difficulty
is in BODIES TO KILL, not in Courage — and a Courage-pool lever cannot reach a
body count. It is the Head Gardener treadmill wearing a different hat, and the
guard-axis note already established that class as untouchable by pool or route
changes.

**Two honest options, neither taken here because both are design calls:** scale
the number of summoned/returning bodies by route slot the way pool is scaled, or
accept the Crypt as a wing that cannot be walked into first and say so on the
atlas. It is named rather than hidden.

## What is NOT claimed

- **The weights are the bot's.** They are measured with the same bot everywhere,
  so the ORDER is trustworthy; the absolute numbers are not a human's numbers.
  Re-measure with `--startsweep` after content changes.
- **`past-30` is 8, not 3.** The pre-change 3 was measured with every expedition
  starting at the Foyer. These runs begin anywhere, so they meet more content;
  the two numbers are not comparable and the gate's one documented failure is
  unchanged in kind.
- **The back half is still flat.** The Heart measures 0.1% of pool. That is the
  pre-existing "the content does not answer the player" problem, not this
  system's, and it is untouched.
