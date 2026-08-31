# How long is an expedition?

2026-08-31. Measured with `tests/run/run.py` — 50 seeded expeditions, a
competent bot, real drafting — using the cost-per-fight ledger added the same
day. Every number here was run; none is carried forward.

## The finding this answers

The handoff has carried "the curve flattens" since the ladder passed seven
wings, and by the time all seventeen were built it read as something blunter:
**ten of the seventeen wings killed nobody.** Everything that survived the
Study and Library won the game.

"Regions reached" cannot say why. The cost ledger can:

    region              cost per fight   turns   deck   keepsakes
    foyer                 24.6% of pool    6.7     12       2.2
    nursery                8.4%            6.1     18       6.8
    sleeping-quarters      1.7%            4.6     23      11.8
    kitchens-cellars       2.3%            3.9     26      17.6
    greenhouse             1.7%            5.2     28      24.7
    ...
    crypt                  0.6%            2.6     33      50.6
    heart                  1.7%            2.4     33      55.0

Fights past the second wing cost one to four per cent of the Courage pool and
end in two turns. A boss in the Crypt, the Ballroom, the Hedge Maze or the
Kennels cost **0.0**.

And the last column is the cause. A run ended holding **fifty-five Keepsakes**,
which is every Keepsake in the game. The pool is not generous, it is
*exhausted*. No drop rate fixes that: a run long enough to collect everything
will collect everything, and nothing can be priced against a player holding
every relic that exists.

## What the design already said

`docs/design/01-mansion-structure.md` does not describe a ladder an expedition
climbs end to end. It describes a house that opens differently every night:

> Every time they enter: Hallways change. Rooms move. **Entire wings
> disappear.** Previously locked doors open.

> Many exits lead into other mansion regions, though **not all are usable every
> expedition**… A different selection of exits should be active each expedition.

> What changes is not the identity of the mansion. What changes is **what the
> mansion is willing to let them reach**.

§22 of `00-core-overview.md` is the same premise from the fiction's side — it is
the answer to "why do the kids go back in at all", and a run that walks every
wing every time answers it with "they do not need to".

`RUN_REGIONS` grew 2 → 4 → 17 as regions shipped, and every one of those moves
was about making finished content REACHABLE. Nobody ever decided seventeen; it
is what "all of them" happens to equal.

## The sweep

`EXPEDITION_WINGS` includes the Foyer and the Heart, so 6 means four wings
drawn from the middle fifteen, in ladder order, seeded off the run seed.

| wings | Keepsakes at the Heart | cost per fight there | turns | end-of-run Keepsakes (mean / max) | unaided wins |
|---|---|---|---|---|---|
| 5  | 21.1 | 2.2% | 4.9 | 8.1 / 29 | 4/40 |
| **6** | **27.0** | **4.5%** | **5.0** | **9.1 / 36** | **5/40** |
| 8  | 35.7 | 1.8% | 4.0 | 11.0 / 47 | 4/40 |
| 17 | 55.0 | 1.7% | 2.4 | 15.9 / 55 | 6/40 |

Eight is already most of the way back to the collapse. Five is fine and sees
less of the house. **Six** keeps the most content per expedition while the last
wing still costs something, and it is where the deaths spread widest.

## What it did to the ladder

Where fifty expeditions ENDED, before and after:

    17 wings                        6-wing route
    defeat/foyer            28      defeat/foyer            28
    defeat/nursery          10      victory                  7
    victory                  8      defeat/greenhouse        4
    defeat/graveyard         3      defeat/study-library     2
    defeat/greenhouse        1      defeat/hedge-maze        2
                                    defeat/nursery           2
                                    defeat/graveyard         2
                                    defeat/lampworks         1
                                    defeat/sleeping-quarters 1
                                    defeat/kitchens-cellars  1

**Four wings killed somebody. Now ten do.** Fights in the back half run 4 to 7
turns instead of 1.8 to 2.5. The Greenhouse and the Graveyard cost 19% and 20%
of the pool per fight, with boss fights at 51 and 69 Courage — real fights,
against the same content, unchanged.

Every wing is still reachable: the harness now prints a census of which wings
the fifty routes opened, and asserts that none is left out. Across 50 seeds the
thinnest was the Crypt at 8 expeditions and the thickest the Study and Library
at 22.

## What is still true

The Foyer is still 28 of 43 defeats. That is a separate finding and it is a
FRONT-loading problem, not a back-half one: a first wing that ends two runs in
three is doing more work than a first wing should. It is untouched here on
purpose — this note is about the shape of the ladder, and the Foyer's numbers
have a committed before/after in `tests/critic-design/` that should not be
disturbed by feel.

`EXPEDITION_WINGS` is one constant. If the marathon is ever wanted back, set it
to 17 and every wing is on the route again.
