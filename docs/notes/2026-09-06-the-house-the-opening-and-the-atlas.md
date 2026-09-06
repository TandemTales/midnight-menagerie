# The house: the opening, and the atlas

2026-09-06. Two screens that were missing and one number that could never move.

---

## 1. The opening — `scenes/tutorial.js`

A new game now starts with the story rather than the planning screen: the Kid,
then the house, then a walked-through fight, then the expedition.

**Nothing in the prose is invented.** `docs/design/00-core-overview.md` §2 and §3
already tell the first night, nearly beat for beat — each kid lost a pet under
ordinary circumstances, they compare stories and conclude the mansion is their
best lead, they bring torches and snacks and whatever fits in a backpack, they
expect broken floors and squatters, *"they do not expect the mansion to be
alive. Soon after entering, the doors close… The group encounters one of the
starting Menagerie Companions. Perhaps Marmalade is the first."* Each Kid's own
loss comes from `KID_CODEX` in `scenes/select.js`, so Maya's opening is about a
cat that walked out of a shut house and Samir's is about a guinea pig.

**Kid-first, and Marmalade is not a choice.** `STARTER_SLUGS` is `['marmalade']`
and nothing else, so on a fresh save the Companion board has exactly one
pickable frame. Asking a player to choose from a wall of one is a screen
pretending to be a decision. The tutorial is the fiction for the rule the game
already enforces: she turns up, she stands in front of you, and that is why she
is with you afterwards. The design's own telling has nobody selecting a
Companion on the first night.

**The skip condition.** `shouldPlayOpening()` — `freedCompanions().size > 0`,
NOT `availableCompanions()`, which counts Marmalade and is therefore non-empty
on every save that has ever existed. Second clause added beyond the brief:
`seenTutorials` includes `'opening'`. Having played it is a stronger signal than
having rescued somebody, and without it a player who dies in the Foyer three
times is walked through the same story three times. Recorded on a skip too —
declining is an answer. (`seenTutorials` had been dead in the save schema since
it was written; this is its first writer.)

`scenes/select.js` is untouched. The fork is at the two doors into it:
`title.js`'s New Game and `clubhouse.js`'s Plan the Expedition.

### The fight is the real fight — `ui/coach.js`

It deep-links the ordinary `CombatScene` at `foyer-1` (one Dust Bunny) with a
coach overlay on top. No scripted hand, no forced targets, no tutorial rules.

The alternative was a tutorial mode inside the engine with a fixed opening hand
and gated legality. It teaches in a tighter order and costs a second set of
combat rules beside a 3,858-line scene and a 2,000-line engine, free to drift
from the real ones without anything failing. **A fight the engine cannot tell
from any other fight cannot teach the player something the real game will later
contradict.**

What the overlay is allowed to do: point at things already on the board, read
engine events to know the player has done a thing, and get out of the way. Every
waiting step waits for the CLASS of action ("a Trick was played"), never a
particular card, so nothing sensible can get you stuck. `pointer-events: none`
except its own two buttons, so the fight stays completely playable underneath.

**Measured, with the project's own instrument.** `tests/critic-design/lib/bot.js`
`naiveTurn` — "a first-time player who understands the UI" — wins the opening
fight in **3 turns without losing a point of Courage** (68/68). That is the right
shape for a first fight. A defeat branch exists anyway and returns to the beat
where Marmalade steps in front of you, because a first fight that ends the game
before the player has a deck is a wall, not a lesson.

### Three things that cost a round

- **CONTRACTS trap 1, for the third time.** An HTML comment inside a template
  literal in `map.js` containing `` `tuck()` `` — one backtick ends the template
  and the whole app dies with a syntax error reported hundreds of lines away.
- **`.cb-handhost` and `.mm-hand` are both `inset: 0`**, spanning the entire
  board. A spotlight on either is a ring round the screen. The hand is its
  CARDS — but bare `.mm-card` also matches `ui/hand.js`'s hidden measuring
  probe, parked far off-screen, which produced a spotlight **101,059 pixels
  wide**. Scoped to `.mm-hand__cards .mm-card`.
- **CONTRACTS trap 9** bit the End Turn step: `turn:end` fires for every enemy
  too, so the step was also satisfied by the Dust Bunny finishing its turn.
  Filtered on `ev.side === 'player'`.

---

## 2. The atlas — `scenes/atlas.js`

The recovered master drawing of the whole estate. Hover highlights a wing;
selecting it pushes the sheet in and re-inks that wing over the exact rectangle
it was cut from; the dossier says who is held there.

**Why the wing gets sharper when you zoom in.** `mansion.png` is 1448x1086 and a
wing is a fifth of it, so pushing in is a 4-6x blow-up of about forty thousand
pixels — a smear. Each section file is a 1:1 crop of the master at the rectangle
`sections.json` records, and `blueprint_trace.py` has already reduced it to the
marks it is made of, so the zoom lays that wing's own vectors back down at
whatever size the screen is showing. The house goes soft; the wing goes hard.
The ruled detail box is not decoration hiding a seam: sections overlap their
neighbours, so a redraw has to say where it stops.

**What the drawing knows and what the kids know.**
`docs/design/03-content-architecture.md` §9 splits these and so does the screen —
*"Architectural blueprint as the permanent base / Player investigation
annotations as a separate overlay."* Every wing's plan and name is on the master
from night one. Who is HELD there, and what keeps it, appears only on a wing you
have surveyed. That is the same rule `scenes/select.js` enforces from the other
side by drawing no tile at all for an unfreed Companion, expressly so the board
cannot say how many are missing or where each one is. An atlas printing "Hush —
the Secret Passages" on night one hands all of that back.

**Sized in JS, not CSS.** `aspect-ratio` is dropped the moment both axes are
constrained — which is exactly what happens to a grid item that is `width:100%`
and `max-height:100%` — and a stretched estate puts every one of the seventeen
hotspots, each a percentage of the drawing, over the wrong architecture.

**Geometry comes from `sections.json`; everything else from `regionMeta`.** The
file carries a name, boss and companion too, but `tools/blueprint_locate.py`
read those off `state/mapgen.js` in the first place. Reading them back would
make the asset a second source of truth for content the game owns. The rectangle
is the one thing the tool measured, so the rectangle is the one thing taken.

### One pen, two screens — `ui/plan.js`

The trace format, the LRU, the pen solver and the three drawing passes, lifted
out of `map.js` now that something else inks them too. `map.js` keeps how its
SHEET frames a wing, which is composition, not drawing.

Verified behaviour-preserving by pixel diff. The Impossible Greenhouse — the
densest linework in the game and therefore the loudest possible case — differs
by **0.03% of pixels at max channel delta 2**, under the **0.31–1.80%** noise
floor measured between two captures of *identical* code (the lamp animation's
phase). Foyer and Bathhouse are 2.1% and 3.8% at delta 3, dominated by that same
animated gradient across the whole frame.

---

## 3. The blueprint fills in, and never did before

`Save.data.blueprint.revealed` has existed since the save schema was first
written, initialised to `['foyer']`, and **no code path in the build ever added
a second entry.** Two screens read it — the Clubhouse fragment's "N / 17 wings"
and the run-end sheet's "N / 17 wings drawn" — and both said **ONE**, on every
save that has ever existed, forever.

Nothing failed. A number simply could not move, which is exactly the shape of
the `keywords.js` loader rot in `tests/teaching/check.py`'s history and of
CONTRACTS trap 54: the field described itself as progress and was believed.

The atlas is what made it load-bearing — it gates a wing's annotations on having
surveyed the wing, so with nothing writing here the whole house stays blank
however far a player gets.

`Run#markWingMapped` writes it **on entering** a wing (you draw a wing as you
survey it; one you walked into and died in is still one you have seen), `resume`
catches up the whole walked prefix so saves written before it exist are not
blank, and `gameover.js` splits the two readings it had conflated:

    wingsThisRun   how far tonight got      -> "What you found"
    wingsMapped    the lifetime blueprint   -> the band, against all 17

It also read `run.wingsMapped`, a field **no version of `state/run.js` has ever
written**, silently falling through to the count that never moved.

---

## Gates

    tests/sprites/check.py        22 clips, 24 stills, 0 failures
    tests/sprites/clips.py        28 passed
    tests/combat-scene/seam.py    22 passed
    tests/cards/run.py            1470 cards, 0 errors, 0 warnings
    tests/scene-css/check.py      13 scene sheets, 953 classes, 0 conflicts
    tests/css-tokens/check.py     0 undefined tokens
    tests/bus-names/check.py      0 dead subscriptions
    tests/run/index.html          50 runs, 1 error (pre-existing `_losePatience`)
    tests/backpack/index.html     72 checks, 0 failures

Checked at 1920x1080, 1600x900 and 1280x800 (Steam Deck), and with
`reduceMotion` on.

## Left open

- **Choosing where to go next is still not built, and the design has an answer.**
  `docs/design/01-mansion-structure.md` carries a full region adjacency graph
  with architectural reasons ("Foyer connects naturally to: Ballroom, Study,
  Sleeping Quarters, Kitchens, Secret Passages…") and says plainly that *"many
  exits lead into other mansion regions, though not all are usable every
  expedition"* and *"a different selection of exits should be active each
  expedition."* Today `Run.route` is six wings picked up front by
  `expeditionRoute()`. The atlas ships as an ATLAS by decision, not by omission
  — but if the route becomes player-chosen, this screen is where it happens, and
  `runDepthDamageScale` was already built to survive that change.
- `scenes/atmostest.js` is still not registered in `main.js`, so the atmosphere
  bench its own header documents cannot be reached. Unrelated, noticed in
  passing.
