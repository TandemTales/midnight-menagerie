# Round 14 — every wing has its rooms, and you stand somewhere different in each

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for
the standing priorities (readable objects, accurately built, colour not a
target), `BRIEF-r10.md` for the instrument traps, and `BRIEF-r11.md` for what
Josh asked for and the machinery. **Your rubric is `RUBRIC-r11.md`** — the
unit is still a contact sheet of three rooms of one wing, and a candidate
must win BOTH questions: different rooms, same wing. This file wins where
they disagree.

## WHERE ROUND 11 LEFT IT

CAMBER won round 11 (`155133e`): +2.17, and **`fits_between_samples` TRUE
from both judges on the Foyer and the Ballroom sheets** — the first sheets in
the pass to earn it. What it built, and what you build on:

- **`ROOM_KINDS`** in `fx/atmosphere.js` lists the rooms each wing really
  contains. `_vary()` picks one per room — by its NAME where the name says
  what it is (a Parlor is the hall with a fire, the Vinery is the vines),
  otherwise by the room seed. `kinds[0]` is the wing as it always was. A kind
  is DATA: subject, doorway, exterior house and moon, layout, lamps, shell
  proportions, floor and ceiling, furnished depth, `props.near`, swaps from
  the wing's own prop pack.
- **Ten new subjects**, each compiled only into its own wing's variant
  program (`MM_ROOMS` 1-5, linked after warm-up) — the pattern to follow, not
  to undo: program 0 carries nothing new.
- **The empty rooms are fixed** (`perimeter` is gone from the deep rooms'
  families; the piano is placed in every layout).
- Real room names, 20 per wing, are in `state/mapgen.js` `ROOMS`.

## THE FIX LIST, from both round 11 judges, in order

### 1. WHERE YOU STAND. Both judges' first fix, on every sheet.

"All three panels still shoot from the same centred tripod with the same
runner carpet up the middle, so the parlor fireplace, the arcaded gallery and
the stair landing differ by wall feature only, never by vantage."

Give a kind its own VANTAGE, the way it has its own subject: the gallery seen
from one end of the arcade with the arches receding; the landing from lower,
the stair rising to one side; the mirror hall from a corner. **MADDER built
exactly this on `ui/r11-vary-c`** — authored vantages per region, a
proscenium frame, foreground balusters — and won the Graveyard with it, and
both judges named it as the graft CAMBER lacks. Read it (`git log
c50fe96..ui/r11-vary-c`, `git show ui/r11-vary-c:<path>`) and bring the
vantage into the kind, rather than beside it. Its own trap, from BRIEF-r11:
the prop layout clamps to the visible half-width, and a corridor will not
take the swing a ballroom takes.

### 2. THE GRAVEYARD: a gate with a gate in it

- **The gate panel has no gate** — both judges. MADDER's wrought-iron arch
  with crescent scrolls and spear finials over two ball-topped piers, framing
  the panel as a foreground layer: "the strongest single vantage change on any
  sheet".
- **The plots**: stand the camera AMONG the graves — MADDER's near cluster of
  headstones and chest tombs — but carved, not "chunky and uniform, like
  bevelled crates".
- **The yard's chapel** is "a flat pale cut-out pasted beside the house":
  coursed stone, a darker roof plane, a shadowed side, a lit window, the same
  moonlight as the mansion.
- The mansion sits at one size on one horizon in all three: scale it and move
  it with the vantage.

### 3. THE BALLROOM: the piano and the mirrors

- The piano stands centre-front in all three rooms: on the STAGE in the suite,
  out of the mirror hall, out of the colonnade.
- The mirror hall must read as MIRRORS — silvered glass that catches the
  chandeliers — not dark arches. LIMEWASH's tall round-headed openings and
  herringbone parquet (`ui/r11-vary-a`) were named as the graft; a second
  floor material inside the wing is welcome.
- The colonnade panel's foreground columns crop the left and right thirds:
  pull them back a bay so the musicians' gallery is the feature.

### 4. THE GREENHOUSE: vines, and a centre for the conservatory

- The vinery's wall "reads as mould or ivy wallpaper": trunks trained on
  horizontal wires, leaf clusters lit green with midribs, hanging bunches —
  LIMEWASH's trellis reads better, and running vines along the rafters changes
  the planting, not only the wall.
- The conservatory is unchanged from before round 11: give it its own centre
  of interest (a fountain, a stove-pipe heater, a central bed).
- **The Greenhouse fight is the tight frame (~14.6 ms of 15.5).** Measure it.

### 5. THE SIX WINGS THAT ARE STILL ONE ROOM

CAMBER's own sweep: **Lampworks, Hedge Maze, Secret Passages, Bathhouse,
Pumpkin Grounds and the Heart** have no `ROOM_KINDS`, so every room of theirs
is one room rearranged. Give each two or three kinds from what its names say
it is (they are in `ROOMS`: the Bathhouse has a Steam Room, an Indoor Pool, a
Pipe Gallery, a Pump Room; the Lampworks a Wax Room, a Reflector Gallery, a
Boiler Walk, a Service Catwalk). Two of them are judged this round —
`sheet-lampworks` and `sheet-bathhouse` — and the other four are in your
seventeen-wing sweep.

### 6. SMALLER, BOTH JUDGES

- **combat**: the landing's balustrade runs through the enemy row behind the
  nameplates — quiet that band where the plates sit.
- the Foyer gallery's dark armoured figures are unreadable silhouettes: light
  them or make them the busts the gallery already has.

## WHAT MUST NOT VARY

As BRIEF-r11: the palette and the arch mode hold across a wing's rooms; a
wing's material vocabulary holds. Every kind must be a room that wing has.

## PERFORMANCE — both frames, against BASE

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900 --hash "encounter=gh-14&region=greenhouse"
```

BASE (`155133e` and after) measures about **13.9 ms** default and **14.6 ms**
in the Greenhouse fight. **15.5 is hard on both.** A vantage costs nothing; a
new subject costs a branch in its own wing's variant only if you follow
CAMBER's `MM_ROOMS` pattern. Report both deltas against BASE, three runs
each, interleaved.

## THE GPU IS SHARED

Every capture and profile takes the machine's one GPU slot. **Hold it for one
capture or one batch at a time, never for a whole session** — round 11's
builders held it 35-90 minutes each, and everything else waited.

## DELIVERABLES

As BRIEF-r11's, plus the two new sheets:

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing        --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite     --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery  --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate               --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/variant_sheet.py lampworks  --port PORT --seeds "Wax Room,Reflector Gallery,Boiler Walk" --out JUDGING/CODE/sheet-lampworks.png
cd "WT" && python tools/variant_sheet.py bathhouse  --port PORT --seeds "Steam Room,Indoor Pool,Pipe Gallery"    --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
```

`combat` also at `--w 1280 --h 800` as `combat-1280.png`; check its
`perf.band` (29-36). ENDINGS OK, shader-literals green, a seventeen-wing
sweep looked at, and `notes_for_merger` with both perf deltas and every
kind you added.
