# The route is walked, not dealt

2026-09-06, the same day as the atlas. An expedition's six wings used to be
dealt up front by `expeditionRoute(seed)` and `advanceRegion()` read the next
one off the list. The party chooses each crossing now, off the adjacency graph
`docs/design/01-mansion-structure.md` supplies.

---

## 1. The graph is transcribed, not invented

`REGION_EDGES` in `state/mapgen.js` — 37 edges, each one the doc names, each
carrying the doc's own reason. The chapter opens by insisting on this: *"The
regions should not merely touch because the map needs them to. Their major
permanent relationships should have architectural reasons."* So the Foyer
reaches the Sleeping Quarters *"through the Grand Staircase"*, the Kitchens
reach the Crypt *"through old foundation passages"*, and the atlas prints the
reason beside the door when you are choosing.

**Symmetric, and the doc is not.** It lists the Foyer's connections without the
Nursery and the Nursery's with the Foyer; the Study reaches the Sleeping
Quarters and the Sleeping Quarters' list does not reach back. Those are
omissions in a prose list, not one-way doors — a staircase is a staircase from
both ends — so edges are declared once and read both ways. The run gate asserts
that, plus that every edge carries a reason, that no wing is a dead end, and
that the whole house is one connected building; a transcription is exactly the
thing that rots by one line without anything failing.

## 2. Three layers, because the doc has three

    1  PERMANENT ARCHITECTURAL CIRCULATION   REGION_EDGES
       "the ordinary connections printed on the clean blueprint"
    2  CURRENT HOUSE STATE                   Run#openExitsFor
       "at the start of an expedition, the game selects a current circulation
        state for each region" — a seeded ~70% of each wing's doors, fixed for
        the night, so tonight's house is a thing and not a series of dice rolls
    3  MANIFESTED CONNECTIONS                the shift in Run#wingOffer
       "supernatural links that are not part of the dependable architectural
        blueprint … doors that simply appear where no door should exist"

Layer three is not only a fallback for a dead end. `SHIFT_CHANCE = 0.55` gives
roughly **1.4 impossible doors a night**, weighted by graph distance squared,
and it is a measurement rather than a taste — see §4.

The last crossing is not a choice: the Heart is the ending, and the doc says it
"should have very few ordinary architectural entrances" and is instead reached
because "many strange dead ends, sealed stairs, impossible doors, and
unexplained shafts throughout the mansion are fragments of routes toward the
Heart." So the final fork offers the Heart alone, usually as a manifested door.

## 3. What changed in the run

`route` is the wings **walked**, and it grows. `wings` is how long tonight is.
The two used to be one fact and were not: reading `route.length` for "how many
wings tonight" printed *Wing 1 of 1, Wing 2 of 2* all the way to the Heart, and
`isLastRegion` off `route.length - 1` would have ended the run in victory on the
Foyer's boss.

`ACT.WING_CHOOSE` is the verb — the atlas never touches the run directly. It is
`MAP_VOTE`'s shape exactly (STS2-REFERENCE §8.5): everybody votes, decisive on
the last vote owed, a weighted roulette off a keyed fork settles a split, the
host has no authority, a party of one resolves on its own first vote and takes
no number at all. This is the only irreversible decision in an expedition —
you cannot walk back through a wing — so it is worth the same care as a room.

**Save migration.** A save from the dealt era carries all six wings up front;
`resume` reads `wings` from that list's length, then trims `route` to the walked
prefix. Keeping the tail would put four unvisited wings on the atlas's trail and
make `wingOffer` treat them as visited, quietly shrinking every remaining fork.
A save made standing at a fork carries the fork, votes and all — unlike the
room-level ballot, which `_voteBook` deliberately drops, because a wing fork is
the end of a whole act and throwing it away costs the player the only
irreversible choice in the run.

## 4. The distribution, measured

4000 routes, a player picking uniformly among what the house opens:

    min 12%   median 24.7%   max 53%
    doors offered: 71% architectural, 29% manifested
    every wing appears at every slot from 2 to 5
    every wing can be offered as wing 2

Architecture alone was not enough. The Foyer's own neighbourhood is dense and
the Moon Courtyard is three doors out through a bottleneck, so with layer three
as a pure fallback it appeared in **1.3%** of expeditions and the Kennels in
6.8% — content nobody would ever see, which is CONTRACTS trap 42's class and
what the 2026-08-30 sweep spent a day on. `SHIFT_CHANCE` was tuned against that
floor, not to taste. The gate asserts **7%** under every wing, over 4000 routes,
which is strictly stronger than the old "at least one of fifty" check: a wing
falling quietly to 2% would fail here and pass that.

## 5. THE FLOOR THAT WAS WRONG, AND THE COLUMN THAT SHOWED IT

The obvious worry: a chosen route walks a wing-one deck into content authored
for the far end of the ladder. The old dealt route banded the middle fifteen so
the Bathhouse could never be wing two, and restoring that band as a floor was
the first thing built here.

`tests/critic-design/ladder.py --wing N` was added to price it — it pins the
bench's route position instead of letting it default to the region's ladder
slot, which is the artefact `lib/expedition.js` warns about in as many words.
One wing-one loadout, 16 fights per region per slot, full Courage, competent
bot. **Win%:**

    region              wing 2   wing 3   wing 4   wing 5
    hedge-maze            100%      81%      81%      75%
    secret-passages        44%      44%      31%      25%
    bathhouse              88%      63%      63%      56%
    kennels               100%      94%      81%      63%
    pumpkin-grounds        25%      25%      13%      13%
    heart                  94%      75%      63%      56%
    (everything above hedge-maze: 100% at every slot)

**Every region is gentler EARLY, not harder.** `runDepthDamageScale` climbs
1.2 → 1.8 across those slots and swamps the authored difference. A depth floor
would have pushed the five hardest wings to precisely the slots where they cost
the most — it would have made the game harder while claiming to protect the
player. It was built, measured, and deleted.

Two intermediate versions were measured and thrown away as well, and both are
worth knowing about: a floor alone starved the far end again (Kennels 2.9%,
Sleeping Quarters 84%), and a strict band — floor *and* ceiling, the old rule
with choice inside it — was worse still (Moon Courtyard 0.3%) **and** pushed the
manifested share to 59%, which makes the architecture a minority of the offers
and the graph decoration.

Full table: `tests/critic-design/ladder-by-wing.json`.

## 6. The A/B

Fifty seeded expeditions, dealt route (HEAD, in a git worktree on its own
server) against chosen route, same seeds, same bot, same policy:

                        dealt      chosen
    victories             4/50        4/50
    defeat in the Foyer     19          19
    deck at the end       20.1        19.5
    purse                204.1       203.9
    Keepsakes             10.6        10.0

Nothing moved. That is what `runDepthDamageScale` reading run depth rather than
the region's ladder slot was built for, and this is the first change that
actually tested it.

## Gates

    tests/run/index.html          50 runs, 1 error (pre-existing `_losePatience`)
                                  + 4000-route reachability sweep, 7% floor
                                  + blueprint graph: 37 edges, two-way, reasoned
    tests/coop/run.py             645 passed
    tests/combat-scene/seam.py    22 passed
    tests/cards/run.py            1470 cards, 0 errors
    tests/backpack/index.html     72 checks, 0 failures
    tests/scene-css/check.py      13 sheets, 0 conflicts
    tests/css-tokens/check.py     0 undefined tokens
    tests/bus-names/check.py      0 dead subscriptions
    tests/sprites/{check,clips}   22 clips / 24 stills / 28 passed

## Left open

- **`tests/critic-design/ladder.py` with no `--wing` still prices every region
  at its ladder slot**, which for anything at slot six or later is
  `runDepthDamageScale`'s endpoint of ×2.0. The table has always been "authored
  content AND the depth term" and its "x10.75 ladder" headline is partly the
  depth term. Not changed here — it is the historical series — but `--wing`
  exists now and is the honest way to ask about content.
- The party never revisits a wing, so a 17-wing house is walked 6 at a time.
  That is by design (`expedition-is-a-route`), and the atlas is what makes the
  other eleven legible.
