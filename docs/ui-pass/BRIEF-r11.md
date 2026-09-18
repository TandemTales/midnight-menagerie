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
- **Bisect with the layer toggles** — `motes=0`, `shafts=0`, `props=0`,
  `frames=0`, `actor=0` — before theorising about a cause.
- **Measure to FIND the defect, LOOK to set the amount**, and check the capture
  a finding was written about.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

Through `on_port.py` always, in a quiet window, three runs. **15.5 ms.** The
build you started from measured 13.5–14.2 ms.

Variation is mostly free — a different camera or a different subject costs what
the old one cost. If a subject pool grows the shader's branch count, say so:
`shapeField` already has 22 branches and round 8 lost a pass to program size.

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
