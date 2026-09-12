## 2026-09-11 — the card cost pass

A playtester: "Probably too many tricks cost 1." Commit 409d917 gave every starting
deck a cost decision; this pass did the same for the pools. Every Companion's
Tricks were re-priced by hand, deck by deck, against `tests/cost-curve/check.py
--strict`, and every deck now has a Trick that costs 4 and an X Trick.

It was a design pass, not number-doubling. Payoffs, room-wide hits, big Guard
and Powers moved up. Enablers and chain pieces stayed cheap. A few genuinely
small utilities moved down to 0. Each 4-cost card has a named way to be played
through its own deck's discounts, Retain or Nerve gain, and was checked in the
real engine.

### The rules each deck was held to

- **Per-rarity spread** (stricter than the gate, so sixteen decks at quota put
  the pool past it). X counts as 2+.

  | rarity | at most, cost 1 | at least, cost 2+ | gate TARGET |
  |---|---:|---:|---|
  | common | 57% | 25% | 62% / 20% |
  | uncommon | 47% | 42% | 50% / 38% |
  | rare | 28% | 60% | 28% / 60% |

- **Cost 4+ and X:** at least one Trick costing 4 or more (uncommon or rare, and
  at most one at 5+), and at least one X Trick.
- **Damage bands:** attack damage stays inside `tests/cards/index.html` `BAND`,
  now extended to cost 4-6.
- **Distinct shapes:** no two Tricks in a deck share an effect shape.
- **Upgrades:** they stay proportional (+35-50% on the main number). No upgrade
  may raise a cost, and no new cost-reduction upgrades were added.
- **Out of scope:** basics, starting decks, card ids and mechanics.
- **Party Tricks:** left alone where possible, because shared tests pin them.
  Five moved from 1 to 2, and the suites that pin them were checked:
  `drizzle/share-the-umbrella`, `bones/burial-buddy`, `crumbula/table-for-two`,
  `crinkle/paper-screen-for-two` and `taffy/pass-the-piece`.

### Per Companion

| Companion | re-costed | cost 4 (how it gets played) | X |
|---|---:|---|---|
| Boggle | 19 | The Big One: Under the Rug returns it next turn at 0 | Creaky Floorboard: Fright per Nerve |
| Bones | 21 | Every Bone at Once: One More Throw's copy at 0, Call That Back, Perfect Fetch / Dig to the Basement | Take Me Apart: 7 + Shed 1 per Nerve |
| Brambleboo | 10 | Very Hungry Houseplant: 1 less per Plant that left the Garden this turn | Hallway Tripwire: 5 to all + 1 Entwine per Nerve |
| Crinkle | 14 | The Long Fold: through a free Paper Copy; a Crease takes 1 off | Thousand Cuts: 6 per Nerve and per Crease |
| Crumbula | 14 | The Count Arrives: 3 after an Indulge; Tuck It in My Cheek returns it at 0 | The Last Nibble: 6 per Nerve, doubled after Indulge + Feed |
| Drizzle | 14 | Bolt from the Blue: 0 if the turn began Clear and reached Thunderstorm | Soft Hail: 2 hits of 4 + 2 Soaked per Nerve |
| Hush | 15 | Whole Ferret, No Warning: Pocket-only, 3 after Shhh, 0 after Cut the Lights | Rack Run: 5 to all per Nerve |
| Marmalade | 24 | Ambush from Nowhere: 1 less per Ghoststep | Catastrophe (already X) |
| Mopsy | 17 | The Big Flop: 3 while Plump | Loose Thread Whip: 6 to all per Nerve |
| Mossbit | 14 | Geologic Headbutt: free once Weathered (held three turns) | The Last Thing You Hear: a 15-per-Nerve Epitaph |
| Pipkin | 15 | Crater Maker: Springboard's Land discount | Seed Slam: 7 damage + 1 Seed per Nerve |
| Pudding | 13 | Ghost Hound Charge: 3 at Graveside or full Loyalty, 2 with both | Take Me Instead: 9 Guard per Nerve |
| Taffy | 30 | Jawbreaker Drop: 3 at full Stretch (held to 3, now that Stretch really Retains); Let It Sag, Regurgitate, the cost swaps | Sugar Sling: one throw at every enemy per Nerve, double while Runny |
| Truffle | 17 | Rotten Little Cannonball: 2 while Ragged | Quillstorm: Shed 2, 4 damage each, per Nerve |
| Wink | 15 | The Part Where You Panic: 1 less per Set out | Red String Theory: 2 Web per Nerve, 3 against a lone enemy |
| Wisp | 18 | Tiny Sun, Big Feelings: 1 less per Afterglow this turn | Tiny Supernova: 5 to all per Nerve |

Almost every deck sits EXACTLY at its common and uncommon quota. There is no
slack: a Trick added later at cost 1 turns the gate red, and that is the point.

### Result

The same 1442 playable Tricks, before the pass and after it:

| cost | before | after |
|---|---:|---:|
| 0 | 140 (9.7%) | 167 (11.6%) |
| 1 | 827 (57.4%) | 591 (41.0%) |
| 2 | 393 (27.3%) | 566 (39.3%) |
| 3 | 81 (5.6%) | 86 (6.0%) |
| 4 | 0 | 16 (1.1%) |
| X | 1 (0.1%) | 16 (1.1%) |

| rarity | at cost 1, before → after | at cost 2+, before → after | TARGET |
|---|---|---|---|
| common | 80% → 54% | 5% → 27% | at most 62% / at least 20% |
| uncommon | 67% → 44% | 23% → 44% | at most 50% / at least 38% |
| rare | 25% → 23% | 70% → 72% | at most 28% / at least 60% |

Basics are unchanged (72% at cost 1, 22% at 2+): 409d917 had already given
every starting deck its cost decision. `tests/cost-curve/check.py` now asserts
the TARGET by default, per rarity and per Companion, so the sweep holds it.

### Fixed along the way, because the new costs made them matter

- **`ev.card.cost` vs `ev.cost`** (CONTRACTS trap 61): The Mansion Waters Back,
  Quiet After and Shared Library read the printed cost where they meant Nerve
  spent.
- **A discount spent by the Trick that granted it, or by an X Trick** (trap 62):
  the engine passes `pricedWith` on `onCardPlayed`, and `discountHooks` only
  spends a stack on a Trick it priced. This brought Shake It Loose and
  Springboard back to life.
- **Nerve "next turn" wiped by the refill** (trap 24, extended):
  - `U.energyNextTurn` banks on the seat.
  - Tighten the Collar, both of Pipkin's choices, Prize Pumpkin, Wisp's converge
    and The Whole Pattern now bank their Nerve.
  - Prize Pumpkin's upgrade never reached its stacks; now it does.
  - Mossbit's Epitaph Nerve banks only inside the turn-start window
    (`epitaphNerve`).
- **Crinkle's Second Copy:** a Paper price of 0 was treated as unpayable.
- **The harness bot's draft valuation** divided an X card's per-Nerve numbers by
  0.6, so it overvalued every X card by about 1.7x
  (`tests/critic-design/lib/policy.js`).
- **Stale tests:** the seams proof's Haunt checks had been red since 409d917 in a
  file no sweep runs. They, and checks in the Drizzle, Mossbit, Pudding and Wisp
  suites, now read the card's own numbers.
- **Taffy:**
  - A Stretched Trick really Retains now. `stretch()` granted only the one-turn
    kind, so a Trick held into its second turn was discarded before it reached
    3 Stretch: the Long Pull archetype, Jawbreaker Drop's discount included,
    never paid out. The turn-end tracker renews it, and the Taffy suite checks it.
  - A Gummy copy of an X Trick stays X; it used to become a 0-cost card that did
    nothing.
  - The cost swaps (Mix the Costs, Borrowed Price, Mix Everything, Candy Surgery)
    refuse a cost below 0. A Status, a Curse or an X Trick in hand used to make
    the other Trick free.
- **`docs/CARD-AUDIT.md`** was regenerated. The committed copy dated from
  2026-08-20 and covered 445 cards across 5 Companions.

### Settled against Slay the Spire

These came up as questions during the pass. The project settles design
questions against Slay the Spire rather than parking them, so each one is
decided here, with its reasoning also written beside the code.

- **Crinkle's Overfolded "costs nothing"** was false for his 4 and his X. A
  Crease took one Nerve with a floor of 0, so a 4 stayed at 1, and an X could
  not be discounted at all. The keyword is the spec:
  - An Overfolded Trick now costs 0, whatever its printed cost.
  - An Overfolded X Trick plays free the way Slay the Spire plays a free X
    (Havoc into Whirlwind): it counts your Nerve and spends none. The engine
    gained one seam for this, `playsFree`, which it asks only of X Tricks.
  - The Crinkle suite has 5 new checks.
- **Bones' "printed cost {n} or less"** let an X Trick (printed -1) through every
  cheap Fetch. Slay the Spire's cost filters pass X over (All For One returns
  only true 0-cost cards; Madness and Snecko Eye skip X). Go Get It!, Fetch! and
  Best Dog in the House now do the same, and the Bones suite has 2 new checks.
  The seventeen cards that moved out of Fetch's reach at 2 Nerve are the cost
  pass doing its job.
- **Effects that set a cost to 0 leave an X Trick alone** (Exhume, Under the
  Rug, Pocket Tomorrow, Regurgitate). Kept: Slay the Spire's cost-setters only
  touch cards that print a number (Madness, Snecko Eye, Enlightenment).
- **Effects that read a Trick's printed cost count an X as 0** (Pulp, Shredder,
  Seam Ripper, Pocket Dimension Pounce, Can't Reach It). Kept, and this one
  deviates from Slay the Spire on purpose. Its one cost-reader, Recycle, counts
  an X as your current Energy, because Recycle pays out Energy. These pay out
  Guard, damage or Paper, and the card prints no number. Emergency Burial counts
  every Trick as at least 1, X included, by its own design.

### Observations, not questions

- **Cost-reduction upgrades were already everywhere:** 6 to about 28 per deck.
  None were added and none were removed.
- **Watch in play:**
  - Rotten Little Cannonball deals 32 to the room for 2 Nerve once Ragged, and
    Close Enough to Dead widens Ragged.
  - An upgraded Prize Pumpkin really pays +2 Nerve on every ripening turn now.
  - Hop Until It Holds, left at 1, is the best uncommon damage per Nerve in its
    deck.
  - Glow Bank gives 4 Glow for 2.
  - Button Box (rare, 1 Nerve) outclasses Quilted Lining at 2.
  - An Overfolded Long Fold is now a free 4. Getting three Creases onto one
    Trick is Crinkle's whole engine, and every other Trick he owns was already
    free at that point.

### Verification

Every pass/fail entry point was run one at a time on the finished tree: every
`tests/*/check.py`, every `tests/*/run.py`, and eleven other scripts that print a
RESULT. 86 of 91 are green. That includes all sixteen Companion suites, `cards`
(1470 cards, 0 errors, 0 warnings), `combat` 695/0, `coop` 645/0, the seams check
and proof, `card-face`, `hook-names`, and `cost-curve` in its new default mode
(17/0). The per-deck checker reports no problems for any of the sixteen decks.

None of the five reds comes from this pass:

| gate | result | why |
|---|---|---|
| `sprites/check.py` | 5 failures | Taffy's HALO on absorb, attack, celebrate, stretch and trick: the open sprite-matte issue. |
| `steam-deck/run.py` | 5 passed, 1 failed | The Map boss node is measured before the Map fits its panel. The same row fails on origin/dev. |
| `run/run.py` | 50 runs, 2 errors | The same two errors as the census taken before the pass. The Archivist on seed 371416 cannot be finished in 200 turns (now 14/200 left, was 112/200). `_losePatience` fires past turn 30 in 8 of 673 fights (was 6 of 653). Victories 4/40 before and after; the mean run went from 12.0 to 12.1 rooms. |
| `coop/rooms.py`, `coop/playthrough.py` | time out | Both pick the first Kid and press Go, then wait for the second seat's companion tile and never see it. The pass touched no scene or UI code, both scripts' two-seat flow predates this month's select-screen commits, and `coop/selectscreen.py`, `lobby.py` and `hotseat.py` pass. |

### Found and NOT fixed: effects and upgrades that do nothing

Each deck's agent reported these and deliberately did not build on them (no card
below was re-priced). They are pre-existing, and each wants its own round with a
test that asserts the EFFECT (trap 12).

- **Boggle**
  - Crawlspace Shortcut's "costs 1 less" is never read.
  - Party Tricks Hide Behind Me, Perfect Distraction, Count to Three and Monster
    Squad store setup that nothing reads.
  - You Didn't See Anything and Nobody's Here set values that nothing reads.
  - I Was Behind You checks ANY enemy turning Suspicious, but its text says the
    target.
- **Bones**
  - Rattletrap and Tail a Mile a Minute hooks hardcode 5 and 7, so their upgrades
    are dead.
  - The discounts on Under the Couch, Secret Stash and Can't Reach It do nothing.
  - Treat Stash's Dug Up payoff, Favorite Toy's fetch while Slobbered, and Fetch
    the Moon's "costs 0 when Fetched" do nothing.
- **Brambleboo**
  - Upgrades nothing reads: Little Bramble, Moon in the Window, Damp Corner, Easy
    Cutting, Four Corners, Keep the Cutting, Night Watering, The Mansion Waters
    Back and Prune to the Heart.
  - Repot's `repotted` flag never clears.
- **Crinkle**
  - Chapter drift: First Fold's basic row says 1/1/1 while the code is 2/2/2.
  - The Sharpened Corner row describes an effect the code lacks.
- **Crumbula**
  - Cape Closed's next-turn Guard is never applied.
  - Sip Slowly's repeat Feed is hardcoded to 1.
  - Upgrades ignored: Napkin Tuck, Keep the Change, Velvet Appetite, House Rules,
    The Count's Cut and Connoisseur.
  - The cost changes on Endless Pantry, Open Bar (multi-enemy Feed) and Bottomless
    Tummy are never applied.
  - Table for Two's heal is never cleared, so it lasts the whole combat.
  - "2 Bite Mark" is not pluralised.
- **Drizzle**
  - Downpour Darling does nothing: its Guard is wiped, and "first Attack costs 1
    less" has no code.
  - Barometer's upgrade is ignored.
  - Forecast upgrades are hardcoded on Rain Check, Save a Drop, Tomorrow's
    Umbrella, Watch the Glass, Rain Delay, Rainy Day Plan and What Goes Up.
  - Lightning Rod deals a flat 5, but prints 15/21.
  - The chapter prices Damp Spot at 1, but the code says 2.
- **Hush**
  - Flags nothing reads:
    - Stash and Dash never ends the turn, and Clean Getaway never grants its
      Nerve.
    - Borrowed Fang's rider does nothing.
    - The re-hide on One Two Gone, Hit and Hide and Gone Before the Squeak does
      nothing.
    - All According to Hush, Three Places at Once, Sticky Little Legend, Now You
      See Me and Inside Job depend on flags nothing reads.
  - Hallway Phantom always gives 6 Guard.
  - Light Sleeper and Hidey Hole always draw 1.
  - The chapter says Whole Ferret costs 1 less on Ambush, but the card doesn't.
- **Marmalade**
  - Upgrades do nothing on Haunted Housecat, Always Lands on Her Feet, Nine Lives
    and Endless Zoomies, because their hooks count copies.
  - Poltercat may give 10 Haunt against a printed 4 (unconfirmed).
- **Mopsy**
  - Memory Foam, Heart on Her Sleeve, Held Together by Love and Family Quilt do
    nothing.
  - The Hollow half of Stuffing Economy does nothing, and Cushion Fort's refund
    never happens.
  - Loose Ends draws a literal 1.
  - Temporary Fix's Patch never loses Stitches.
  - Beginner's Patch's upgrade to 6 Stitches is capped at 4.
  - Hop Until It Holds, Hopscotch Hem and Thirty-Two Tiny Stitches set their "on
    this Trick" rider after the Patches fire.
  - Grand Refit only picks from hand, although its text says "hand or discard".
- **Mossbit**
  - Namesake Crush prints 12/16 per Patience but deals a fixed 6.
  - Stone Calendar's `p` and Monument to Small Things' `m0` are never read.
  - Swap the Dates+ never draws, and Emergency Burial+ covers one hit rather than
    two.
- **Pipkin**
  - Elastic Legs:
    - its status is never removed after the first Hop Trick;
    - its `turn:start` listener ignores whose turn it is;
    - it gives nothing on the turn it is played.
  - Swallow the Sun's `ignore-heavy-feet` is never removed.
  - Deep Pond Breathing, Frogapult and Big Little Frog Hop with no `hopCost`.
  - Inflate's text still says "Pluck".
- **Pudding**
  - Pug of the Baskervilles, Cemetery Stampede and Headstone Avalanche print "{m0}
    more for each" but deal a hardcoded 6, 5 and 6.
  - Reburial+ never draws, and Careful Excavation+ digs one card, not two.
  - Treat for Later reads the base card's numbers.
  - `drawNextTurn` is read and never set.
- **Taffy**
  - Same Again (it reads a value that is never set), Elastic Memory, House of
    Mirrors, One Big Piece and Family Size do nothing at all.
  - Half-built: Runaway Puddle's Gummy half, Slow Pull's 3-Stretch discount,
    Smoosh Together's copy and Sugar Coat's cost cap. Make It Sticky's "rest of
    combat" Retain lasts one turn.
  - Hooks ignore the upgraded number on Snack Pocket, Multipack, Surface Tension,
    Sweet Spot and Conservation of Taffy. Let It Sag, Stretch Transfer, Blob
    Insurance, Keep the Wrapper and Mix the Costs have text-only upgrades.
  - Hard Candy Haymaker gives its discount but never spends the Globs.
  - Perfect Replica's copy is not a Gummy and never Vanishes.
  - Copycat Cannon's "play immediately" is not implemented.
  - The cost swaps read printed rather than current costs.
  - Mouthfeel draws one fewer than its text says.
- **Truffle**
  - `lostCourageThisEnemyTurn` and `bristledThisEnemyTurn` are never set, so
    Wrong End First, Still Good, No Big Deal and Keep Coming never trigger.
  - Flags nothing reads:
    - Bend Don't Break and Roll With It never give their Bristle.
    - Hold Still, Almost never gives its next-turn Guard.
    - Built Wrong, Comfortable in Pieces, Double Barbed and Dead Hedgehog Theory
      do nothing at all.
    - Bite Back First never repeats.
    - The party Tricks Lend Them the Spiky Side, Everybody Behind the Hedgehog
      and Shared Pincushion are dead.
  - Borrowed statuses:
    - Refuse to Stay Down applies Marmalade's `not-dead-yet`, which spends
      Lives.
    - Play Dead-ish applies Bones' `play-dead`, which halves damage, so its
      `cap` is never read.
  - Hooks hardcode their numbers: All Spines No Plan, Shed Cycle, Quill Carpet,
    Wretched Little Miracle, Hard to Finish, More Where That Came From, Unpleasant
    Geometry and The Floor Is Mine.
  - Quill Tax never shows its Weak count.
- **Wink**
  - Threadbare Pounce's discount can never apply, because its cost is computed
    with no target.
  - The Guard from Tripline and Observe and Interfere is usually wiped before the
    attack.
  - A Read resolves on any intent update.
  - Dead upgrades: Telltale Twitch, House Pattern, Pattern Library, House Odds,
    Loom Logic, Reflexive Blink, Three Steps Ahead, The House Has Tells, Observe
    and Interfere, Extra Corner, All Eyes Open and I Meant That One.
  - Dead effects:
    - Probability Collapse calls `forceIntentFamily`, which does not exist.
    - Seen It Before reads `lastFamily`, which nothing sets.
    - Eyes Shut only closes Eyes.
    - House Spider's re-Sets never fire.
  - "Once each turn" is unenforced on Skitter, Skitter, Bite and Gotcha!.
  - Triple Prediction's text says you choose, but it picks at random.
- **Wisp**
  - Afterglow and Converge effects run with no card attached, so their numbers
    are hardcoded and their upgrades dead. Some printed text is wrong (Wait...
    Wait... says 11 and deals 7). Affected: Boo! Eventually, Two Rooms Over,
    Little Orbit, Bonk From Later, Put It Somewhere Safe, Long Fuse, Spark Parade,
    Bank Shot, Not Done Yet, This One's Been Cooking, Premature Celebration,
    Orbital Drop, Peekaboo Meteor and Darkest Before Dawn.
  - Power hooks hardcode their numbers: Home in the Dark, Static in the Wallpaper,
    Getting Excited, Brighter Every Minute, Constellation Practice, I Can Wait,
    Can't Wait!, Never Goes Out and Gentle Landing.
  - Flags nothing reads:
    - Hot Potato's Flare spends Glow for nothing.
    - Good Things Come to Tiny Ghosts, Tiny Star Long Shadow and Follow My Light!
      do nothing at all.
    - Count With Me, Make a Constellation and Everybody Say Boo do nothing beyond
      their immediate effect.
  - Double Exposure's copy still gains Glow.
  - Encore! always counts down from 1.
  - Small Orbit's return counts as an Afterglow, which the chapter says it
    shouldn't.
