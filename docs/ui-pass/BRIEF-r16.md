# Round 16 — finish the objects, and fix the three things that are drawn wrong

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for
the standing priorities (readable objects, accurately built, colour is not a
target), `BRIEF-r10.md` for the instrument traps, and `BRIEF-r11.md` for the
machinery, the performance budget and the traps. **Your rubric is
`RUBRIC-r11.md` as amended by `RUBRIC-r16.md`**: the unit is a contact sheet
of three rooms of one wing, and a sheet must still win both questions —
different rooms, same wing. This file wins where they disagree.

## WHERE ROUND 15 LEFT IT

MASSICOT won round 15 (`4a47bca`), 2 of 2 judges, 6.60 against 4.60, four of
five screens. **It won on a finding, and you should know it before you touch
anything**: three of the four things making this game's edges and upper halves
black were MASKS AND DEFAULTS, not the room's own darkness.

- the near-frame **lintel** was a soft gradient mask over 40% of the picture,
  and is now a drawn beam;
- every **plaster ceiling** was lit by four uniforms nobody ever writes
  (`uPool[]` is not written for a ceiling, and an unwritten `Vector4` is
  `(0,0,0,1)`), so the light you see on a ceiling today is new and real;
- the **vignette** reached zero before the frame's mid-edge and is floored at
  0.30 of its own curve.

It also swept the placeholder boxes and gave the house `sPanel()`, `sFrame()`
and `sPortrait()`. **That machinery exists and is the tool for half of this
round's list** — three of the items below are "the same construction, in a
place the sweep did not reach".

**THE RULE THAT HOLDS FROM ROUND 15 AND IS NOT NEGOTIABLE:** the darks are
where this house keeps its colour. Judge 1 measured last round's winner —
darkest decile 0.9-2.4, saturation 0.65 against the field's 0.52-0.56 — and
cleared it because the floor had been raised by a vignette, not by an ambient.
**Light the OBJECT, never the room.** A candidate whose darkest corners have
gone pale, milky or grey scores below a dark one, and `RUBRIC-r16.md` tells
the judges to check it.

## THE FIX LIST, from both round-15 judges, in order

### 1. THE GRAVEYARD MANSION — both judges, and the graft is on a branch

> "One arched window repeated five times in two even rows on a single plane —
> same head, same width, same spacing, both storeys — so a lit elevation still
> reads as a pasted pattern rather than a building." · "Almost every window on
> the main block is lit to the same warm value in two even rows."

**REALGAR built exactly this on `ui/r15-rooms-a`** and won the Graveyard sheet
with it; both judges named it as the graft. Read it (`git log
60dd632..ui/r15-rooms-a`, `git show ui/r15-rooms-a:<path>`) and bring its
vocabulary in: an oculus in the gable, a lunette dormer, tall glazing-barred
sashes on the main floor over short square attic lights, varied bay widths, a
corner tower reading against the moon, and **two or three windows left DARK
among the lit**. The house must also scale and move with the vantage.

### 2. THE OBJECTS ARE FRAMED BUT NOT FINISHED — both judges

> "The pictures are finally framed and grounded, but the sitter inside each one
> is a featureless pale oval — a fog where a face, a hairline and a collar
> should be, so five canvases in a row read as smoke in gilt frames."

A head at 60-90 px carries a shoulder line wider than the head, a collar value
below the face, a hairline and one dark eye socket; `mainMenu.png` proves it at
that size. The same fault, named by one judge each:

- **the glass roof** in the vinery and palmhouse: "a field of pale rectangles
  with no glazing bars, purlins or ridge — the brightest surface in the upper
  half and the only undrawn one";
- **the ballroom's new plaster ceiling**: colour and texture but no rose, rib
  or beam, and the chandelier hangs out of an empty field;
- **the chapel's flank wall**: a flat plane with three lancets pasted on — it
  wants buttresses with set-offs, a plinth course and an eaves line;
- **the conifer belt** on the yard's horizon: identical flat triangles at one
  size the whole width, wanting varied heights, a broken skyline and a trunk
  under two or three of them;
- **the palmhouse's three foreground rosettes** still shade as one lobed
  cut-out, and they are the nearest object to camera on that sheet.

### 3. THREE THINGS ARE DRAWN WRONG, and they are not taste

- **The suite panel is inset inside a black margin** on three or four sides
  while the ballroom and mirrorhall panels fill theirs — "two rooms and a
  photograph of one". This has been on the list since round 14 and the builder
  who owned it last round finished level with the baseline, so **it is still
  exactly as it was**. Find why that vantage renders short of its tile, fix it
  at the cause, and sweep every kind in every wing for the same fault. Judge 1
  names AZURITE's framing (`ui/r15-rooms-b`) as the graft: the room runs to
  both panel edges with the near pier cropped.
- **The parlor's floorboards do not shorten with distance** — "a single
  repeated width all the way to the back wall, so the carpet runner sits on a
  floor that reads as a printed sheet". A texture in world coordinates whose
  unit does not shrink under perspective is a projection error.
- **The mirror hall floor is a DISPUTE, and settling it is the work.** Judge 1:
  the parquet "runs in concentric arcs across the whole foreground... the floor
  bends and the room reads as a dome". Round 15's winner checked and disagreed:
  the parquet is laid in world coordinates (`vec2 hp = vec2(w.x - w.y, w.x +
  w.y) * 0.70710678 / HW`), straight by construction and constant in metres,
  and what curves is the room's own back wall, drawn on an arc, plus the pool
  ellipses over the floor. **One of them is wrong.** Draw a temporary test
  pattern on that floor — a straight grid in the same space — photograph it,
  and say in your notes which it is before you change a line. If the parquet is
  straight, then the defect the judge can see is the ARC of the back wall
  reading as a bent floor, and that is what to fix.

### 4. THE REGRESSION ROUND 15 INTRODUCED — judge 1, on combat

> "The wall behind the Dust Bunny is now the brightest patch in the top half
> and the enemy's grey fur loses its silhouette against it at 1280."

The creatures must read against the room. Pull that bay about half a stop, or
darken the panel directly behind the creature row — and check every enemy row
at BOTH sizes, not only the one in the capture.

### 5. THE PLACEHOLDER CLASS THE SWEEP DID NOT REACH

Round 15's own notes name it: `subjChimney`'s tall flanking panels, either side
of the parlor's chimneypiece, are still plain sunk rectangles, and the
overmantel tablet is an empty ground with a faint oval. `sPanel()` and
`sPortrait()` are sitting right there. **Sweep again** for the same
construction anywhere else — a rounded box with a faint edge and nothing
inside it is always a placeholder, in a subject as much as in a mode.

### 6. SMALLER, one judge each

- the foyer gallery's upper storey: the second-tier doors and the balustrade
  above the arcade are still one dark band across the full width;
- the vinery's right third: the cordons thin and the fruit stops past the
  mid-line while the left half is fully planted — carry the same spur pitch
  and fruit count to the right-hand return (REALGAR's four-tier vinery
  distributes evenly and is the named graft);
- the mirrorhall's far-left cornice lifts away from the pilaster caps faster
  than the arcade does over the last two bays: tie its rake to the same
  vanishing point as the impost line;
- combat's left third behind the Kid: pilaster, dado and floor wash into one
  warm grey — put a hall chair or a case clock there and light its edge,
  rather than lightening the wall.

## WHO OWNS WHAT THIS ROUND

**Yours:** the WebGL room — `fx/atmosphere.js`, `fx/backdrop.js`,
`fx/shaders/backdrop.js`, and `fx/shaders/grade.js` ONLY if a fix truly needs
it (round 15 changed one line there, deliberately and flagged).

**NOT yours:** the Bathhouse and the Lampworks, which were rebuilt by a graft
two rounds ago — leave their `ROOM_KINDS`, subjects, floor patterns and
shaders alone, and prove it by photographing `sheet-bathhouse` and
`sheet-lampworks` and comparing them with the merged captures, content not
hashes. Also not yours: the enemy and Companion sprites, the HUD, the card
kit, the plates, the type, the dialog controls, the web chrome, gameplay, and
the region palettes.

**What must not vary**, as `BRIEF-r11.md`: the palette and the arch mode hold
across a wing's rooms, a wing's material vocabulary holds, and every kind must
be a room that wing really has.

## PERFORMANCE — both frames, against BASE

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900 --wait 40
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900 --wait 40 --hash "encounter=gh-14&region=greenhouse"
```

**15.5 ms is hard on both.** Always `--wait 40`, interleaved with BASE, three
runs each, reported as deltas: the default 5 s wait sits inside the ~35 s
warm-up and measures ANGLE linking your variants rather than the frame. Report
your link times too — a variant that takes 15 s to link stalls the first room
that needs it.

## THE TRAPS

All of `BRIEF-r11.md`'s, plus:

- **Stop only the processes you started, by the PID you recorded.** Never kill
  by name or command-line pattern: the other builders run the same tools.
- **Tests hard-code `:8777`, the MAIN checkout.** Run every test from your
  worktree as `python tools/on_port.py PORT <test>`, and start your own dev
  server first — `on_port.py` rewrites the port, it does not start a server.
- **An unwritten uniform is not zero, it is `(0,0,0,1)`.** That is what made
  every plaster ceiling glow last round. If you read a uniform, write it.
- **Say in your notes what you did NOT do.** Round 15's winner did, and it is
  why this brief could be written in an evening instead of a day.

## DELIVERABLES

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing       --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite    --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
```

`combat` also at `--w 1280 --h 800` as `combat-1280.png`; check its `perf.band`
(29-36 with a room behind it). Plus: the endings guard printing `ENDINGS OK`;
`tests/shader-literals/check.py` green; `glStd` for every panel; a
seventeen-wing sweep looked at; the bathhouse and lampworks comparison above;
**your verdict on the mirror hall floor with the capture that settles it**; and
`notes_for_merger` with both perf deltas, your link times, every number you
added, and what you did not do.
