# Map agent — round 4: graphite over ink, and the pre-boss row stops being a corridor

2026-08-24. Files touched: `game/src/state/mapgen.js`, `game/src/scenes/map.js`,
`game/src/scenes/map.css`, `game/src/ui/mapnode.js`. All owned by this agent.

---

## 1. The route was invisible, and two rounds had fixed the wrong variable

Round 2 raised the route's stroke weight. Round 3 raised it again and dropped the
printed plan's alpha 0.74 → 0.52, then **measured** that a player could plan three
rooms ahead. A fresh reviewer, playing normally, still said:

> "I could never see which node leads where — the connective strokes are the same
> dashed vocabulary as the architectural line-work. Pathing is the map layer's only
> decision and it is currently invisible."

That sentence is the whole diagnosis and it is worth writing down, because the
mistake is easy and both previous rounds made it. **The route and the building were
the same KIND of mark** — thin dashed blue-grey lines on parchment. Once two marks
share a kind, weight and alpha are the only knobs left, and no setting of them
separates one dashed navy line from three hundred dashed navy lines. It is
camouflage, and camouflage does not care how thick you are. Both rounds moved a
measurement without moving the thing the measurement was standing in for.

The route is somebody's pencil drawn *over* a printed survey. It is now drawn like
one — five differences at once, none of them "stronger":

| | printed plan | pencil route |
|---|---|---|
| **colour** | cold blue, laid *into* the paper at 0.52α; lands at ≈`rgb(134,144,155)` | warm graphite `rgb(66,60,54)` — measured live as `srgb(0.260, 0.236, 0.212)` |
| **texture** | dashed. The dash is the architect's word for *proposed* | one continuous deposit. `stroke-dasharray: none` on every tier |
| **join** | mitred right angles, hard corners | Catmull-Rom curves through a real hand's tremble |
| **passes** | one printed line | two: `.mi-edge` (firm) + `.mi-ghost` (overdraw, ~2px off line) |
| **relief** | none, it is *in* the paper | `.mi-shade`, the same stroke offset 1.2/2.4px at 11–20% — the mark casts a shade |

`ui/mapnode.js` grew `pencilStroke()`, which returns both passes sharing one
low-frequency bow (so they read as one line gone over twice, not two routes) with
independent high-frequency tremble. Four static paths per leg instead of one — no
CSS filters anywhere, because a filter inside the layer the entrance sweep clips
would re-raster the whole ink layer every frame of the sweep, which is the exact
class of bug the `@keyframes mm-wipe` note already warns about.

Contrast against paper, at the sheet's own fit zoom (0.9241× at 1920×1080):

| | before | after |
|---|---|---|
| route colour | `rgb(17,24,41)` navy — *the same family as the plan* | `rgb(66,60,54)` warm graphite |
| route dash | `23px 13px` — the plan's own vocabulary | `none` |
| "ahead" tier | 4px, α.72, 3.70 screen px | 4.6px, α.86, 4.25 screen px |
| "open" tier | 6.4px, α1.0, 5.91 screen px | 7px, α1.0, 6.47 screen px |
| plan ink alpha | 0.52 | 0.52 (**unchanged** — this round did not need to hide the building) |

That last row matters. Round 3 bought its improvement by pushing the architecture
back, and the architecture is the thing the reviewer praised. This round left it
exactly where it was and still separated the two, because it changed the kind of
mark instead of the balance of strengths.

### Two things that went wrong doing it, both caught by looking

**(a) The trim was eating two thirds of every leg.** Rows sit ~135 sheet-px apart
and lanes ~129, so a typical leg is 150–190px. The old code trimmed a flat
`NODE_R + 4` = 48px off one end and 51 off the other, leaving ~60px of drawn line
floating in the middle with a 22px gap at each mark. With a dashed line nobody
noticed. With a continuous pencil the first screenshot turned the sheet into a
**field of unattached arcs** — a worse answer to "which node leads where" than the
one it replaced. The trim is now proportional (`min(r, len × 0.21)`), so a route
touches the rooms it joins.

**(b) The hierarchy inverted.** Giving the route a dark warm mark made it the
darkest thing on the sheet, and sixty rooms went pale behind it at the old dim
levels. Dimming answers *"may I walk here"*; it must never answer *"is there a
room here"*. `is-dim` 40% → 60%, `is-far` 48% → 66%, `is-cold` 24% → 34%. The
route now sits one step below a room it does not reach.

Also fixed while in there: the `#mm-arrow` marker filled with `currentColor`,
which inside a `<marker>` resolves against the marker's own inherited colour — the
blueprint's blue. The one mark on the sheet that had to be flame was quietly navy.

**Verified by looking, not only by measuring**, at the default fit zoom a player
actually sees:

* `shots/map-r4-b.png` — the sheet as it opens, 1920×1080, seed 42, fit zoom.
* `shots/map-r4-noicons.png` — the **same frame with every node glyph, pool, name
  chip and boss tag set to `opacity: 0`.** The route still reads as a route: a
  connected west-to-east network of warm graphite over the blue plan. This is the
  test that the previous rounds would have failed.
* `shots/map-r4-walked.png` — five rooms in. Walked trail heavy graphite, two live
  choices flame with arrowheads, the layer ahead at plan weight, the cut-off
  bottom-left pale but present.
* `shots/map-r4-zoom.png` — 2× zoom, the state the reviewer's `p5-42z.png` was in.

---

## 2. Row 11 was a fake choice — 4/4 Safe Rooms on every seed

Confirmed before touching anything, straight from `MM.state().run.map.nodes`
equivalents in the generator: **15 of 15** (seed, region) combinations came back
`['safe','safe','safe','safe']` (or 3/3). Four branches, four identical rooms. The
last decision of the wing was a corridor drawn four times.

Round 3's guarantee was load-bearing (+9 points of reach-the-boss, 1 guaranteed rest
on the worst path) and it stays. What changes is that it is now *exactly one* room:

* **one lane of the door row is always a Safe Room**, chosen by the seed rather
  than always the middle — which branch the rest is on is itself information;
* the other doors draw **without replacement** from
  `{Treasure, Mr. Moth's, Big Scare, Scuffle, Curiosity, Unsurveyed}`, so three
  doors are never the same door again.

That is Slay the Spire's actual pre-boss shape: you *may* take the campfire, and
taking it costs you whatever the other branch held.

Measured across **85 sheets** (all 17 regions × 5 seeds):

| | before | after |
|---|---|---|
| door rows that are 100% Safe Room | **85 / 85** | **0 / 85** |
| door rows with at least one Safe Room | 85 / 85 | **85 / 85** |
| mean Safe Rooms on the door row | 3.80 | **1.00** |
| door-row type spread | Safe Room only | safe 85 · scuffle 45 · shop 42 · unknown 41 · curiosity 40 · treasure 38 · Big Scare 32 |

Foyer door rows, the five seeds asked for:

```
seed 42     bigScare · safe     · unknown  · curiosity
seed 7      treasure · curiosity· safe     · shop
seed 1337   safe     · unknown  · scuffle  · shop
seed 90210  treasure · safe     · bigScare · curiosity
seed 5      shop     · treasure · scuffle  · safe
```

A Big Scare is allowed here specifically *because* it is the one row where a named
horror is trivially avoidable — every room on it is an alternative to every other.
It is registered in the avoidability set before the quota pass runs, so the global
BFS counts it.

### A real bug this uncovered: "avoidable" was only a global property

Adding door-row Big Scares shifted the RNG stream, and `tests/run/run.py`'s
boss-path bot — which deliberately routes *around* named horrors — died at row 7 of
13 and the suite went to 6 errors. The trace showed why, and it was not luck:

```
0:scuffle won   1:scuffle won   2:curiosity   3:curiosity
4:shop          5:curiosity     6:safe        7:bigScare LOST hp=0/400
```

Round 3's rule — *every Big Scare must be avoidable* — was implemented as a
**global** property: there exists a root-to-boss path meeting none of them. That is
necessary and it is not sufficient. **A player does not route from the door with
the whole sheet in front of them.** They stand in a room and pick an exit, and a
global guarantee says nothing about the room they are standing in. At row 7 every
legal exit was a Big Scare, so a bot that refuses them had to fight one anyway.

`forcesAScare(n)` is the local rule, and it is now checked *before* the global one
and also applied to the door row: **no room's every exit may be a named horror.**

Measured by importing the round-3 generator and this one side by side into the same
page (`git show HEAD:.../mapgen.js` served as a second module), 85 sheets each:

| across 85 sheets | before | after |
|---|---|---|
| **rooms whose every exit is a Big Scare** | **149** (1.75 a sheet) | **0** |
| Big Scares per sheet | 3.75 | 4.13 |
| `tests/run/run.py` | 50 runs / **6 errors** | 50 runs / **0 errors** |
| victories in the 50-run batch | 5 | 7 |

149 is the number that matters. Round 3 shipped a rule called *every Big Scare must
be avoidable*, and on 85 sheets there were 149 rooms from which the player could not
avoid one. Nobody measured the local property because the global one sounded like it
covered it.

The Big Scare count is up 0.2 per sheet because the door-row one is *in addition*
to the quota, and it is the most skippable one on the drawing. Flagging it for the
balance owner rather than tuning the quota down to hide it.

---

## 3. Every other defect, with its measurement

All live-DOM probes at 1920×1080, seed 42, Foyer, before/after in the same harness.

### Boss label clipped — `RECEIVIN…`

Measured: `scrollWidth 341` against `clientWidth 244`, i.e. the shared 244px
`max-width` was ellipsising the one label on the sheet that names the thing you are
walking towards. And the boss sits at x = 0.905 of the sheet, so a 341px chip
centred on it puts half of itself past the right-hand frame rule.

Two halves: the boss chip gets `max-width: 520px`, and `_layoutLabels` now clamps
each chip's box **into the drawn plan window inside `boxOf`** rather than after the
fact, so the collision pass scores the position the chip will really occupy. The
boss ends up at `--mn-dx: -76.7px` with a leader back to its mark.

`clipped: true → false`, full text `Receiving Chamber`, 92px clear of the sheet edge.

### Node labels collide

The reviewer's `p5-42z.png` was at 2× zoom, and the previous round's "0 clashes"
had measured **chip-on-chip only**. Chip-on-chip really was 0. What the reviewer
was looking at was a chip sitting on a neighbouring room's *glyph*, and against the
actual glyph ink (not the 86px art element, 17px a side of which is padding):

First, what the defect actually was — because I measured the wrong thing twice
before getting it right. Chip-on-chip overlap was **0 before and 0 after**. Overlap
against the *drawn glyph ink* was also **0 before and 0 after**. The 19 "overlaps" I
first recorded were against the 86px `.mn-art` box, 17px a side of which is empty
padding: a measure that counts a chip sitting in clear paper beside a mark.

Go back and look at `p5-42z.png`. "Formal Dining Room" and "East Reception Hall" are
**17 screen px apart and touch nothing.** They are not overlapping. They are (a)
stacked with no breathing room, so they read as one pile, and (b) both parked well
clear of their own marks with nothing saying which room either belongs to. Two
faults, neither of them an overlap, and no overlap metric was ever going to catch
either one. So they got their own metrics:

| at 2x zoom, seed 42, unwalked, 1920x1080 | before | after |
|---|---|---|
| chip-on-chip overlap | 0 | 0 |
| chip on another mark's drawn ink | 0 | 0 |
| **chip pairs closer than 9px — "reads as one pile"** | **3** | **0** |
| **chips parked clear of their own mark** | 11 | 15 |
| **...of those, tied back by a leader** | **0 of 11** | **15 of 15** |
| chips shown | 53 | 53 |
| chips dropped | 9 | 9 |
| chip inside a neighbour's 17px mark padding | 19 | 28 |
| boss label clipped | **yes** (341px into 244px) | **no** |

At fit zoom every one of these is 0 except a single displaced chip, which has a
leader.

That last row is up, and it is a deliberate trade: 15 chips are now parked in the
empty paper *beside* a neighbouring mark instead of piled against another name, and
every one of them carries a leader saying which room it names. None touch drawn ink.

Three changes:

* **The ladder was vertical only.** Two rooms one lane apart have nowhere to go up
  or down that is not the other one's mark, so a chip that cannot move sideways has
  to settle for the least-bad pile — which is exactly the stack the reviewer
  photographed. Candidates now include `±(w/2 + 34)` laterally, sorted nearest-first
  so the first slot that clears is also the closest one.
* **Chips are tested against each other with a 7px breathing gap**, not edge to
  edge. This is the one that took crowded pairs 3 -> 0, and it is the direct answer
  to what the reviewer photographed.
* **Overlap and travel are scored separately.** Folding "you have wandered" into the
  same number as "you are on top of something", and then testing that number against
  the drop threshold, deleted chips that had found perfectly clear paper two rungs
  down. (It did: 9 dropped -> 20 while I had them fused. Back to 9 with them split.)
* **A displaced chip gets a leader.** `.mn-lead` is a dotted drafting leader drawn
  inside the node's own SVG, so it shares the mark's coordinate space and its
  counter-scale. 15 of 53 chips carry one at 2x zoom; 1 of 6 at fit zoom.

### Header read "Row — of 13"

An em dash printed where the player expected a number reads as a bug. Before you
step inside there *is* no row number, so it now says the true thing:
`Wing 1 of 17 · At the door · 13 rows deep · Boss: The Butler`. Once underway it
returns to `Row 5 of 13`, same case, same bold numeral, same "N of M".

### The hover card covered the two legal nodes below it

The avoid set was the node's own rect plus the corridors leaving it. Measured over
the five entry rooms of the Foyer:

| | before | after |
|---|---|---|
| cards covering another legal room | **4 of 5** (worst 6,316 px²) | **0 of 5** |
| cards covering an outgoing corridor | **3 of 5** | **0 of 5** |
| sides chosen | below ×5 | right ×3, below ×2 |

Every other legal mark **and its name chip** is now in the avoid set. A card
explaining one choice must not hide the alternatives; a legal mark is as
load-bearing as an outgoing corridor.

### Hazard tooltip contradicted the hazard

"The Floor Sags — entering any room **in this wing** costs 3 Courage", while the
banner over the same sheet says "**Wing** 1 of 17" meaning the whole region. One
word, two scopes. The tooltip was not lying; it was ambiguous, which on a rules
screen is the same thing.

The region keeps "wing" — the banner, `ui/hud.js`, `gameover.js` and `run.js` all
use it that way and they are not my files. A hazard now occupies a **marked area**,
which is also exactly what it looks like on the drawing: a hatched, bounded region
with a keyed roundel. All eight rules rewritten; `Moonlit Wing` is now
`Moonlit Rooms` for the same reason. Nothing outside `scenes/map.js` reads
`HAZARDS[].rule`, checked by grep — `run.js` keys off `payload.hazard` ids only.

### Procedural room naming showed

Measured on Foyer seed 42 before: 62 nodes over a 20-room authored pool, and the
disambiguation ladder printed

```
Formal Dining Room · Formal Dining Room — East · Formal Dining Room — Lower · Formal Dining Room — Far End
Umbrella Gallery   · Umbrella Gallery — East   · Umbrella Gallery — Lower   · Umbrella Gallery — Far End
```

The reviewer's diagnosis was exact: *the authored names are good, the suffixes make
them look generated.* No house has a room called "Parlor — Far End". A house has a
Parlor and a Second Parlor and a Little Parlor and the Old Parlor, and those are
four different real rooms rather than one room wearing an index.

Three changes, in the order they mattered:

1. **Use more of the pool before reusing anything.** The old selector only looked at
   the type's three preferred tags, so Safe Rooms (which prefer `bf`, and most wings
   author exactly one blanket fort) hammered the same room. The score is now
   dominated by how often a name is already on this sheet, so an unused room of the
   "wrong" tag beats a preferred room that is already there; tag affinity and a
   stable per-node jitter only break ties. All 19 non-boss rooms now appear before
   any appears twice, on every sheet measured.
2. **The qualifier is a prefix from a floorplan's own vocabulary**, not an index:
   `West/East` first (it is a survey), then `Second / Little / Old / Back / Front /
   Inner / Far`.
3. **Which word a room gets is a property of the room, not of the count.** This one
   took two goes. Keying the prefix off the use count alone printed
   `Second Entry Hall / Second Umbrella Gallery / Second Visitor Cloakroom / Second
   Receiving Room` across the four doors of the boss's row — the same tell as the
   old ladder, one word further along — because on a late row every room is already
   on the sheet twice. Worse, the *second* positional word had to go entirely: any
   qualifier derived from the ROW is identical for every room on that row, so
   "Upper × 4" happened for the same reason. (It was also just wrong: depth on this
   sheet runs west to east, not up.) Past the compass, the word is hashed off the
   node id.

Guards: a room whose authored name already starts with a qualifier never gets a
second one — no `West East Reception Hall`, no `Lower Lower Attic`.

Foyer door rows now read:

```
seed 42     Far Entry Hall · Second Umbrella Gallery · Little Visitor Cloakroom · Front Receiving Room
seed 7      Far Visitor Cloakroom · Little Bell Pull Gallery · Little Grand Staircase · Back Drawing Room
seed 1337   Far Front Vestibule · Back Portrait Hall · Old Formal Dining Room · Little Coat Room
```

Worst base-name reuse across 85 sheets went **8 -> 4**, and 4 is near the floor:
19 authored non-boss rooms over ~58 nodes is 3.05 uses each, so the old ladder was
not only ugly, it was lopsided as well. Four rooms called *Entry Hall, East Entry
Hall, Little Entry Hall, Far Entry Hall* read as four rooms in a house, which is
the point.

### `#scene=rest` deep-link — **does not reproduce, and is not the map's**

Tried four ways, each a cold load at 1280x800 reading
`MM.ctx.scenes.currentName` after 2.5s:

```
#scene=rest                 scene='rest'  rest DOM present  0 errors
#scene=rest&seed=42         scene='rest'  rest DOM present  0 errors
#scene=rest&region=foyer    scene='rest'  rest DOM present  0 errors
#scene=rest&node=foyer-6-2  scene='rest'  rest DOM present  0 errors
```

All four land on the Safe Room, chrome and all, with the standalone-preview badge —
`shots/map-r4-restdeeplink.png`. It does not fall back to title.

The map's node routing does **not** own it either way. `main.js:70` reads the hash
and calls `ctx.scenes.go(scene, params)` directly; `RestScene.enter` → `_boot` →
`_resolveRun` in **`scenes/reward.js:81`** (meta-run), which fabricates
`Run.mock({...})` when `ctx.run` is absent. If a fallback ever does happen it will
be in that method or in `core/scenes.js`'s enter-throws path
(`scenes.js:63` swallows the error with `console.error`), neither of which is mine.
**For the integrator:** if the reviewer's repro had extra hash keys, the likely
culprit is `_resolveRun` receiving a `node` param it cannot resolve.

---

## Protected, and confirmed still intact

Checked on every screenshot above: the 1:96 survey sheet, compass rose, scale bar,
the five-cell title block with `SURVEY REF MM-42`, hazard zones as hatched regions
with keyed roundels and margin chips, the KEY legend listing only the marks
actually on *this* drawing, the hover cards (name / type / flavour / YIELDS / Row N
of 13 in this wing / you may go here), the left-to-right ink draw-in on entry, and
the walked route inking up as you go. **The plan's own alpha was deliberately left
at 0.52** — this round did not need to push the architecture back any further.

## Verification

* `python tests/map/run.py` → **23 passed, 0 failed**
  (crossings 0 over 24 maps, mean branch 1.81, single-exit 19.9%, 24/24 distinct
  compositions)
* `python tests/run/run.py` → **50 runs, 0 errors**, determinism 5/5, resume 3/3,
  mid-fight 3/3
* `python tests/seams/check.py` → **1598 call sites, 0 problems**
* `python tests/scene-css/check.py` → **10 sheets, 789 classes, 0 conflicts**
* **60 fps at 1920x1080** on the real GPU (ANGLE / Intel UHD), measured per frame
  over rAF rather than trusting the counter. Steady state on the map after the
  entrance: **p50 16.7 ms, p95 18.1 ms, max 19.8 ms** — identical to the round-3
  build's p50 16.7 / p95 18.7, despite the ink layer going from **234 paths to
  458**. The extra strokes are static SVG in a composited layer and cost nothing
  per frame; no CSS filter was added anywhere, deliberately.
* The entrance sweep still animates: instrumented over rAF it runs **759-782 ms
  across 18-19 distinct `clip-path` values**, i.e. real motion on every frame of
  it. A `--strip` frame strip is *not* a valid check here — `page.screenshot` takes
  longer than the nominal 120 ms gap on this machine, so an 800 ms animation lands
  in two frames and reads as instant. That is a measuring artefact rather than the
  bug trap #3 warns about, and it fooled me for one round of screenshots.
* 0 console errors on every run above.
* Generator sweep: 85 sheets, 17 regions × 5 seeds — 0 forced Big Scares, 85/85 door
  rows with exactly one Safe Room.

## Notes for the integrator — two things in other agents' files

**1. `tests/scene-css/check.py` reports 1 conflict, and it is not the map's.**
`.petpic` is declared with conflicting `height` in `clubhouse.css` (100%),
`select.css` (100%) and `gameover.css` (auto) — all **frontend**'s files. It
appeared mid-session: the sheet's class count went 789 -> 822 between two runs of
the gate, and the gate was at **0 conflicts** when this round started. The map
declares no `.petpic`, and no class this round touched is shared with another scene.

**2. A backtick inside a template literal, again**

While verifying, the whole app went down for about twenty minutes with
`PAGEERROR Unexpected identifier 'PlayerView'` and `window.MM` undefined — CONTRACTS
trap #1, word for word. The cause is at **`game/src/scenes/combat.js:465`**: an HTML
comment written *inside* the scene's `innerHTML` template that names PlayerView in
backticks, which ends the template literal. An earlier transient in the same window
reported `Unexpected identifier 'pr'`, so the rest of that diff is worth a look too.
Not my file. Every measurement in this note was taken either before it appeared or
after it cleared, and all four gates were re-run afterwards.

I hit the same trap myself in this round's first draft, with a comment in
`_buildInk` that named currentColor in backticks. It cost one screenshot. The grep
that finds it is `git diff -U0 -- <your files> | grep ``.
