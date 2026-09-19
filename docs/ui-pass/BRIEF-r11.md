# Round 11 — a wing with several rooms in it

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for the
standing priorities (readable objects, accurately built, colour not a target),
and `BRIEF-r10.md` for the current fix list and the instrument traps. **Your
rubric is `RUBRIC-r11.md` and it changes what you are judged on**: most of your
screens are contact sheets of three rooms in one wing.

## WHAT JOSH ASKED FOR

2026-09-18:

> *"i want variation between backgrounds within sections of the mansion as well,
> multiple different foyer, ballroom, greenhouse, etc. rooms so that different
> encounters within the same section wont feel stale."*

A wing contains many encounters. Every one of them draws the same region,
re-seeded by the room's name. He is telling you they feel like one room.

## WHAT CHANGED UNDER YOU

This brief was first written against `3a32fc0`. Your BASE is later, and two
things in it are yours to keep and one is yours to fix.

**The two round-10 grafts are in (`1045f52`)** — the only screens in eleven
rounds a blind judge has marked `fits_between_samples`. Do not lose them:

- **The Greenhouse** (SORREL2's): pots with a rolled rim, a mouth and soil, in
  clay or lead; three leaf species with rolled sections and curling outer
  leaves; coursed-brick planting beds with a stone coping (prop shape **24** —
  OAKGALL's fittings own 22 and 23, and "is a fitting" is one flag now, never
  a shape-number comparison); a ridge-and-furrow GLAZED roof (`ceilPattern 9`).
- **The Foyer** (BISTRE2's): `props.near`, an authored near-field furniture
  list — two glazed vitrines, a console with its pier glass, the buttoned
  hall chair, torchères — plus the hall runner (`uRunner`) and a moulded
  handrail with a reveal under it. One light, one fitting: the warm lamp
  always gets OAKGALL's lantern standard.

**And the graft adds a staleness of its own, which is yours:** `props.near` is
dealt after the layout and NEVER re-randomised, so every Foyer now has the
same vitrines in the same two corners. Vary it — mirror it, swap members from
a pool of things a hall has, re-place it — without emptying the lower frame
it exists to fill. And where `_vary()` puts the warm lamp at centre (`gallery`,
and combat's own `foyer` room) its lantern now stands ON the runner at the
foot of the stair; decide whether that is where a hall's lamp would stand.

**The performance pass (`ui/r11-perf`)** is being merged before you start,
because the grafts left the default combat frame at the 15.5 ms line (15.48 ms
mean, +0.54 on the commit before) and the Greenhouse fight over it (17.2 ms).
The numbers you start from are in "THE PERFORMANCE BUDGET" below.

## THE MACHINERY ALREADY EXISTS. DO NOT REBUILD IT.

`scenes/combat.js` already calls `setMood(region, { seed: this.roomName })`, and
`_vary()` in `fx/atmosphere.js` re-rolls, per room:

| already varies | by how much |
|---|---|
| `props.layout` | one of a 3-entry `LAYOUT_FAMILY` |
| `props.count` / `height` | ±25% / ±8% |
| `room.w` / `.d` / `.h` / `.side` | ±9% / ±9% / ±6% / ±0.02 |
| every lamp | mirrored left/right, moved ±6–14% of the room, intensity ±10% |
| shafts | count ±1, `z` ±12%, `spread` ±16%, `angle` ±20% |

That is not a small amount, and it works: three Foyers seeded `parlor`,
`gallery` and `landing` differ in **51–55% of their pixels**.

### AND THE MACHINERY ALREADY BREAKS IN ONE PLACE: it can EMPTY a room

Look at the baseline sheets before anything else. **Four of the twelve panels
are nearly empty** — Greenhouse `palmhouse` and `vinery`, Ballroom
`mirrorhall`, Foyer `landing` — and all four are the same defect. `_vary()`
draws a sibling layout from `LAYOUT_FAMILY`, and all four drew
**`perimeter`**, whose own comment is "everything lines the back wall and the
two side walls. Empty middle." In a room ten metres deep that is a study
lined with cases. The Greenhouse and the Ballroom are both authored 26 m
deep, so it puts 55% of the props on a back wall more than thirty metres
from the lens, in the dark, and clamps the rest to the frame edges — so a
room authored with 44 plants shows a column, a shrub and a lamp. The
Ballroom loses its piano as well, because the room's one-of-a-kind
(`props.solo`) is only PLACED by `colonnade`; any other layout deals it like
a chair, and `perimeter` deals it to the far wall.

The Foyer, the Study and the Crypt are AUTHORED `perimeter`, and four more
regions (Greenhouse, Lampworks, Ballroom, Heart) have it as a sibling — seven
of seventeen can draw it. The Foyer's `props.near` (see "what changed under
you") exists because of it: "the lower 40% of the frame is unlit floor
carrying one small bench" was this layout's empty middle.

What each seeded panel drew (reproduced from `_vary()`'s own hash):

| wing | authored | room | layout | count |
|---|---|---|---|---|
| foyer | perimeter, 26 | parlor / gallery / **landing** | wings / wings / **perimeter** | 24 / 31 / 22 |
| greenhouse | terrace, 44 | conservatory / **palmhouse** / **vinery** | terrace / **perimeter** / **perimeter** | 50 / 50 / 33 |
| ballroom | colonnade, 34 | ballroom / **mirrorhall** / suite | colonnade / **perimeter** / colonnade | 35 / 42 / 42 |
| graveyard | rows, 34 | yard / plots / gate | colonnade / rows / colonnade | 29 / 36 / 41 |

This is exactly what the rubric punishes — "has variety been bought by making
the rooms vaguer?" — and it is already in the baseline. **Whatever your angle,
no wing may contain an empty room when you finish**: a layout family must hold
the same KIND of space at a legible depth, and a room's solo piece must be in
the room in every layout. Check it on the sheets for all seventeen regions,
not on these four.

**And they still read as one room, which is the whole finding.** What `_vary()`
never touches is `pal.cam`, `subject`, `floorPattern` and the prop shape SET —
so every Foyer shows **the same staircase, on the same wall, under the same
arched window, from the same camera**. The eye goes to the stair first and the
stair never changes. Furniture moving in front of a fixed feature is a
rearrangement, not a different room.

## THE FIX LIST, in order of how much the eye gets per unit of risk

### 1. THE CAMERA. Cheapest, and the biggest single gain.

`_vary()` does not touch `pal.cam`. One vantage re-composes everything already
in the room for free — no new geometry, no new art, no perf.

Vary `y`, `z`, `look` and a few degrees of yaw per room. **Mind the two things
that will bite:** the camera rig is authored against each region's proportions
(`_vary()`'s own comment says a room that grows 30% stops being framed), and the
prop layout clamps to the visible half-width, so a camera that swings must not
leave the furniture outside the lens. Move it enough to re-frame, not enough to
break the room — and check every region, because a corridor and a ballroom do
not tolerate the same swing.

### 2. WHERE THE SUBJECT SITS.

`subjectH` gates the stair on `uFar` — a room has one staircase, so it is drawn
on the back wall, centred, every time. Let it sit off-centre, and let some
regions carry their subject on a SIDE wall. A hall entered beside its stair is a
different hall.

### 3. A SUBJECT POOL PER WING. This is the real "multiple different Foyers".

Today `subject` is one value per region. Make it a small set the room seed picks
from, so a Foyer leads with a staircase, or a fireplace and overmantel, or an
arcade of doors — all of them things that hall would have. Seventeen regions
already name one subject each in `SUBJECT`; this is authored data plus a picker,
and it reuses the relief system round 9 built rather than adding machinery.

**Every subject in a pool must belong to that wing.** A Foyer that draws ossuary
niches is not variety, it is a bug, and the rubric says a candidate that buys
variety by breaking a region's identity should score below the baseline.

### 4. FLOOR PATTERN AND PROP SET.

`floorPattern` is fixed per region; give it a family the way `LAYOUT_FAMILY`
works for layouts. And let the room seed swap one or two entries of
`props.shapes` from a per-region pool, so one Foyer has a longcase clock where
another has a vitrine. Keep the wing's signature props in every room.

### 5. WHAT MUST NOT VARY

The **palette** and the **arch mode**. Those are what make a wing recognisable
as itself, and colour is settled (`BRIEF-r9.md`). A region's material vocabulary
— its stone, its timber, its glass — holds across all its rooms.

## HOW TO SEE WHAT YOU ARE DOING

```
python tools/variant_sheet.py foyer --port PORT --seeds parlor,gallery,landing
```

Captures one region as three rooms, checks each actually drew, tiles them into
one labelled sheet and prints the pairwise pixel difference. **The sheet is the
unit of judgment this round**, so work in sheets from the start: a change that
looks good in one room and identical in the next three has not done the job.

The pixel percentage it prints is a floor, not a target. 51–55% is what the
CURRENT build scores while still reading as one room, so a higher number proves
nothing on its own — the judges are asked whether the panels read as different
rooms, and that has no metric.

**A sheet is ONE browser launch now** (`tools/room_batch.py`, measured
equivalent to fresh captures to 0.001%), about 90 s for three rooms. The
seventeen-region sweep is one launch too, and that is how you should take it:

```
python tools/room_batch.py --port PORT --regions all --seed parlor --sheet JUDGING/CODE/sweep-parlor.png
```

Run it with two or three different `--seed` values — one seed across
seventeen regions shows you each wing once; the question is each wing's
SPREAD.

**Captures queue.** `tools/gpu_slot.py` lets one WebGL page run at a time on
this machine, across all three builders: one capture holds ~2.4 GB on a
laptop with ~4.7 GB free, and three at once is what degraded the GPU in
rounds 8-10. A capture that prints `gpu_slot: waiting for the GPU` is queued
behind another builder, not hung — do not kill it. It also means every
`gpuprof.py` run you take is in a quiet window by construction.

## THE INSTRUMENTS, and what each lies about

All of `BRIEF-r10.md`'s section applies. The two that matter most here:

- **`perf.glStd`** — the `#gl` canvas's own standard deviation. ~0 means the
  backdrop never drew: the UI is a DOM layer over it, so such a frame still
  looks busy and passes every other check. Round 9's judges opened with a
  blocking fix for a bug that did not exist because of exactly this.
  `variant_sheet.py` refuses to tile a void panel.
- **A void capture is not a regression.** `shot.py` exits 2 on `gl: none` or a
  frame flatter than std 8. This machine's GPU degrades across a few hundred
  browser launches in a session and **recovers when left to idle**.
- **`glStd` cannot see a missing room behind a BOARD.** Playwright's element
  screenshot is a clip of the page, so on `combat` and `rest` it measures the
  board. The first QUILL combat baseline was the board over a flat plum plane
  — the stage never finished its ~35 s warm-up before the snap — and read
  glStd 41. Since `fc881cf` a warm-up timeout is void (exit 2), and
  `perf.band` in the state file is the board's upper-middle luminance: **29-36
  with a room, 23.6 without. Check `band` on your `combat` and `rest`
  captures.**
- **Bisect with the layer toggles** — `motes=0`, `shafts=0`, `props=0`,
  `frames=0`, `actor=0` — before theorising about a cause.
- **Measure to FIND the defect, LOOK to set the amount**, and check the capture
  a finding was written about.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

Through `on_port.py` always, in a quiet window, three runs. **15.5 ms is hard.**

**READ THIS BEFORE YOU ADD ANYTHING.** The build you start from measures
**14.4–14.8 ms**, backdrop 9.26–9.33, props 1.35–1.41 — four runs with nothing
else on the GPU. That is **under a millisecond of headroom**, where round 10
started with 1.3 ms. Round 10 spent about +0.9 ms (props +0.3, backdrop +0.2,
the rest elsewhere) on chandeliers, sconces, lanterns and a carved statue, and
it was worth it — but it means this round cannot spend the same way.

Two consequences, and they shape the round:

- **Camera and placement variation is FREE.** A different vantage, a
  subject moved along a wall, a floor pattern chosen from a family: each costs
  exactly what the thing it replaced cost. Fixes 1, 2 and most of 4 are free,
  which is another reason they come first.
- **A SUBJECT POOL IS NOT FREE.** Every new subject is another branch in
  `subjectH`, and `shapeField` already carries 22. Round 8 lost a whole pass to
  program size and round 9 measured shot-to-shot going 28 s → 37 s on link time
  alone. If you add branches, **find the cost first**: a pool selected by a
  uniform costs one branch taken per pixel, not N. Report the delta against
  BASE measured in the same window, not the absolute, and say what you paid for
  it with.

A candidate over 15.5 ms does not win however good it looks — and if you believe
the budget is wrong, say so in `notes_for_merger` rather than quietly breaking
it.

## THE TRAPS

All of `BRIEF-r8.md`'s and `BRIEF-r10.md`'s. The ones most likely to bite here:

- **A BACKTICK IN A GLSL COMMENT TAKES THE GAME DOWN.** Run
  `python tests/shader-literals/check.py` after every shader edit.
- **`max()` on an ACCUMULATED SDF** subtracts from everything already in it.
- **Recess occlusion darkens NEGATIVE relief only** — subtract a shape's own
  mid-height or its relief draws nothing.
- **The camera rig is authored per region.** This is the round's own trap: the
  room proportions, the prop clamp and the shaft geometry all assume it.
- **Line endings**: `python tools/endings_guard.py --base <base>`, in your
  worktree, never in the main checkout.

## WHAT IS NOT YOURS

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialog controls, gameplay, and the region palettes.

## DELIVERABLES

- the endings guard printing `ENDINGS OK`; commits on your branch;
- `tools/gpuprof.py` three times via `on_port.py`, quiet window;
- `tests/shader-literals/check.py` green;
- **`glStd` for every panel** in `notes_for_merger`;
- **a sheet for all seventeen regions**, not just the four judged, with a
  sentence on any wing whose rooms still read as one room;
- the canonical captures in `JUDGING/CODE/`, under exactly these names:

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing      --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite   --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate             --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-rest   --port PORT --scene rest --seed 7 --companion bones --kid maya --wait 3
```

`shot.py` writes into `WT/shots/`; copy `combat` and `rest` to
`JUDGING/CODE/<name>.png` with the `CODE-` prefix removed, and also take each of
those two at `--w 1280 --h 800` as `<name>-1280.png`. The four sheets are
written straight to `JUDGING/CODE/`.

Before you finish, sweep all seventeen regions as sheets and **look at every
one**. Stop your dev server when you are done.
