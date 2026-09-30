# Round 23 — four more wings that are not yet their name

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`
and `BRIEF-r22.md` in full: this round is round 22 again, for four more wings. This file wins wherever they
disagree. **Your rubric is `RUBRIC.md` as amended by `RUBRIC-r23.md`.**

## WHY THESE FOUR

The 2026-09-30 survey (`SURVEY-2026-09-30.md`) named seven wings that lack
the thing their name promises. Round 22 built four of them — the Hedge Maze,
the Kitchens, the Secret Passages, the Pumpkin Grounds — and gained +2.64 on
them (CASSEL, `a11924b`, with VANDYKE's maze grafted in). These are the next
four, both judges' scores and headroom:

| wing | judge 1 | judge 2 | what both said |
|---|---|---|---|
| **Bathhouse & Rain Wing** | 3, +2.5 | 3, +2 | "there is no bath"; "a grey hanging rectangle floats in front of the moonlit glazing"; "a mottled blue grid" of a back wall |
| **Lampworks** | 3, +2.5 | 3, +2 | "one standing lantern is the only lamp in the Lampworks"; "the machinery at right is a stack of grey boxes" on "a flat blue marbled plane" |
| **Moonlit Attic & Observatory** | 3, +2 | 3, +2 | "the rafters are diagonal lines scrawled over a blue cloud texture"; "the observatory has no telescope" |
| **Kennels & Animal Ward** | 3, +2 | 3, +2 | "grey speckled lumps scattered through the mid-ground read as TV static, not straw or beds"; the right half of the back wall is milky |

**Read how round 22 did it before you start** (`git log --stat 489d6c9..HEAD
-- game/src/fx`): each wing got its OWN wall program (`MM_ROOMS` 8-11 in
`ROOMS_PROGRAM` / `precompileRooms`), so the other thirteen wings stayed
byte-identical; the signature objects are props under the `MM_WINGS`
define (27 pumpkin, 28 clipped yew, 29 kitchen table, 30 topiary, 31 clean
statue); layouts `maze` and `patch`. **Programs 8-11 and props 27-31 are
TAKEN.** Add yours after them (programs 12+, props 32+), and never reuse an
id for something else.

## THE FIX LIST

### 1. EACH WING IS ITS NAME — both judges, all four wings

- **The Bathhouse has its baths.** A sunken tiled plunge pool with water
  that reflects (the pond in round 22's Pumpkin Grounds has a kerb and a
  moon glitter to learn from), or a row of clawfoot tubs; steam; rain
  streaking the glazing. The grey sheet floating mid-air becomes a drawn
  curtain with folds, or goes. Its steam room, pool room and pipe room each
  read as that.
- **The Lampworks is full of lamps.** A dozen lanterns hanging at different
  heights, lamp-makers' benches with glass and brass parts, a glassblower's
  furnace or a reflector gallery; the "machinery" is machinery, not boxes.
  The wax room (candles dipping on racks) and the reflector gallery each
  read as that.
- **The Attic is under a roof, and it is an observatory.** Real roof
  trusses and rafters receding in depth, a dormer or skylight open on the
  moon, and a brass telescope on its tripod as the room's focal object; an
  orrery if it helps. Its archive room reads as a library under the eaves.
- **The Kennels keep animals.** Drawn wooden kennels with name plaques and
  straw, dog beds, water bowls, a grooming table; the wash room its tubs
  and brushes. No speckled lumps.

### 2. A WALL IS BUILT, NOT A TEXTURE — both judges

The worst material in all four wings is a mottled cloud/noise texture with
outline drawing laid on it in place of a built surface. Every wall, roof and
glazing bay this round is BUILT: tiles, brick, planks, trusses, glazing bars,
joints, with
relief and light, drawn with round 21's pen where it is a line. **And the
darks stay dark**: a pale, milky or grey dark is a defect.

### 3. OBJECTS ARE DRAWN, NOT NOISE

"Noise blobs standing in for the wing's signature object" was both judges'
system defect. A bath, a lamp, a telescope, a kennel must have a SILHOUETTE a
viewer names at a glance, with its own shading and a contact shadow on the
floor. Speckle is not texture.

### 4. THE DARKS

The survey called the Kennels' right-hand back wall "a milky grey-blue", and
the Lampworks', Bathhouse's and Attic's walls "blue cloud texture" /
"mottled blue grid". A built wall in these wings is dark, lit in pools.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, their kinds and props; the palette's COLOURS only
where a wall is too pale a dark, and say so in your notes), and
`fx/shaders/grade.js` only if a fix truly needs it. `tools/` prep scripts if
you make art, extended rather than duplicated.

**Not yours:** the other thirteen wings (prove you left them alone: sweep
all seventeen before and after, and compare content, not hashes; shared code
paths are the trap — round 17 found the Bathhouse sharing plant crowns with
the Greenhouse); the pen and the floor camera from round 21, and round 22's four wings,
programs 8-11 and props 27-31 (use them, do not rewrite them); `ui/enemy.js`, the stand-in room, `core/renderer.js`, the run
rail, the hand, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier: a fight in
  each of your four wings against BASE, interleaved, three runs, `--wait 40`,
  15.5 ms hard. The Greenhouse and Foyer frames are the reference and are at
  the budget already; a new wing's fight must not be the next one over.
- **BASE's server goes on YOUR port + 100** (9041 -> 9141 and so on),
  never on a port in 9041-9043. In round 22 one builder's BASE sat on
  another builder's port for an hour, and Windows let both bind.
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step); the sheets
  below pass `--tier medium`.
- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/shader-literals/check.py`, `tests/combat-scene/seam.py`,
  `tests/chrome`, `tests/steam-deck` (the Map boss row is a known race), and
  every region gate for your four wings (`tests/bathhouse`,
  `tests/lampworks`, `tests/attic-observatory`, `tests/kennels`).
- Stop ONLY the processes you started, BY PID. Commit as you go (round 21
  lost a day to a usage limit mid-round; the commits are what resumed it).
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. An
  unwritten uniform is `(0,0,0,1)`, not zero. **Say in your notes what you
  did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && python tools/variant_sheet.py bathhouse --port PORT --tier medium --seeds bathhouse,steam,pool      --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && python tools/variant_sheet.py lampworks --port PORT --tier medium --seeds lampworks,wax,reflector  --out JUDGING/CODE/sheet-lampworks.png
cd "WT" && python tools/variant_sheet.py attic     --port PORT --tier medium --seeds attic,archive            --out JUDGING/CODE/sheet-attic.png
cd "WT" && python tools/variant_sheet.py kennels   --port PORT --tier medium --seeds kennels,wash             --out JUDGING/CODE/sheet-kennels.png
cd "WT" && python tools/shot.py CODE-fight-bathhouse --port PORT --scene combat --region bathhouse --encounter bh-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-lampworks --port PORT --scene combat --region lampworks --encounter lw-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The two fights also at `--w 1280 --h 800` as `<screen>-1280.png`. Copy the
fights' PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fights and LOOK at every frame.
