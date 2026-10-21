# Round 44 — the Greenhouse, the Graveyard, the Pumpkin Grounds, the Nursery: no void bands, drawn subjects

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`,
`BRIEF-r35.md`, `BRIEF-r37.md`, `BRIEF-r39.md`, `BRIEF-r41.md`,
`REPAIR-r41.md` and `BRIEF-r43.md` in full. Read `VERDICTS-r34.md` (the
Greenhouse), `VERDICTS-r35.md` (the Graveyard), `VERDICTS-r37.md` (the
Nursery and the Pumpkin Grounds) and `VERDICTS-r43.md`. This file wins
wherever they disagree. **Your rubric is `RUBRIC.md` as amended by
`RUBRIC-r44.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s.
**A good link can be an empty program:** read `gl.getProgramInfoLog` for every
program you change.

## THE RULE THIS ROUND IS BUILT ON

Three times this week a pass removed, muted, dimmed or SMOOTHED something a
judge named, and a paired blind test found it worse -- the last one smoothed
the Hedge's torn crowns and lost 0 of 4 to "a decaying maze, streaks and all"
(`SURVEY-2026-10-20b.md`, `REPAIR-r41.md`, `README.md` row 43). **A drawn
object beats an empty, dimmed, muted or smoothed surface.** In your four
wings: never fewer objects, never a quieter surface. Replace a weak thing
with something at least as rich, as many and as lit; keep a room's character
(its wear, its oddness) and draw it better.

## WHY THESE FOUR

Survey 8 (`SURVEY-2026-10-20b.md`): after round 43, these are the rooms both
judges still put at 5 with a named, fixable defect -- two of them a black
void band across the floor.

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Pumpkin Grounds** | 5, +1 | 5, +1 | "a black void band runs across the middle between the wall and the lit flagstones, exactly where fighters stand"; "the pumpkins float, and the mansion behind the wall is a pasted backdrop with soft edges -- draw the ground continuous from wall to front (grass, path, flagstones) with the pumpkins on it and contact shadows" |
| **Greenhouse** | 5, +1.2 | 5, +1 | "the two columns framing the room are saturated flat-green cylinders with no patina -- verdigris iron columns with rivets, rust and highlights"; "a black void band of floor runs between the upper planter terrace and the front railing -- light the lower floor (tiles with moss, a puddle catching the moon)" |
| **Graveyard** | 5, +1.2 | 5, +1 | "the lawn is a featureless green-brown plane over half the frame, with sparse headstones that sit on it without shadow"; "break up the lawn with paths, roots, dead leaves and long grass at the edges, and draw the chapel's stones and tracery in ink" |
| **Nursery** | 5.5, +0.8 | 5, +1.5 | "the rocking horse at the right is a pale flat cutout with plank legs -- painted dapples, mane and lit edges"; "the alphabet blocks on the rug are untextured cubes floating above it"; and both SYSTEM sections: the red diamond rug shared with the Study and the Kitchens |

## THE FIX LIST

### 1. NO VOID BAND -- both judges, two wings

- **The Pumpkin Grounds:** the ground continuous from the wall to the front
  -- grass, the path, the flagstones -- lit where the fighters stand
  (lanterns, jack-o'-lantern glow, moonlight on the flags); the pumpkins ON
  it with contact shadows, more of them, not fewer; the mansion behind the
  wall drawn with a crisp inked silhouette, not a soft pasted backdrop.
- **The Greenhouse:** the lower floor between the planter terrace and the
  front railing LIT and dressed -- tiles with moss, a puddle catching the
  moon, pots and a watering can -- never a black band.

### 2. EACH WING'S SUBJECT, DRAWN

- **The Greenhouse's columns:** verdigris cast iron with rivets, rust,
  capitals and highlights, matching the roof's ironwork -- not flat green
  tubes.
- **The Graveyard's lawn and chapel:** the lawn broken up -- a worn path,
  roots, leaf litter, long grass at the edges and round the stones, mist low
  on it -- with MORE headstones clustered, each with a contact shadow; the
  chapel's stones and tracery inked.
- **The Nursery's toys:** the rocking horse a painted toy -- dapples, a mane,
  a saddle, lit edges, rockers -- not a pale cutout; the blocks lettered,
  worn and sitting ON the rug with shadows.

### 3. THE NURSERY'S OWN RUG -- both judges' SYSTEM

The Nursery gets a floor covering of its own, as rich as the diamond rug it
replaces (a nursery rug -- an alphabet border, animals, a hooked pattern --
your call), via the `MM_RUGK` floor define. Do NOT change the Study's or the
Kitchens' this round.

### 4. INK, NOT GRAIN; DARK, NOT MILKY

Soft or hazy is worse than stepped; a dark washed pale or milky is a defect.
Keep each room's darks.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark is
too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/` prep
scripts, extended. A shared rule that lifts other wings too is welcome ONLY
with the seventeen-room sweep, SEEDED (the list in
`docs/ui-pass/survey-2026-10-20b.sh`), proving none got worse.

**Not yours:** the other thirteen wings (unchanged) -- above all round 43's
four and the three the round-41 repair fixed; the Study's and Kitchens' rugs;
the Sleeping Quarters' rocking horse (its own); round 28's painted house and
contact-shadow rule; the pen and floor camera from round 21; `ui/*`,
`core/renderer.js` (keep its render-scale governor: Josh's standing rule), the
boards, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Disk:** C: filled up on 10-21 (`uiloop-fills-the-c-drive`). Your worktree
  is on D:; put any extra checkout (BASE for perf) under D:/UILOOP too.
- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6` (pk-1 / pumpkin-grounds, gh-1 / greenhouse, gy-1 /
  graveyard, nursery-1 / nursery) against BASE, interleaved, three pairs;
  check `size.drawW`. 15.5 ms hard; the Pumpkin fight is the round's (15.21 at
  round 37's graft -- the closest to the line of the four): leave it no worse
  than BASE. Measure only when `tasklist` shows no UnrealEditor.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/link-queue`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/pumpkin-grounds`, `tests/greenhouse`,
  `tests/graveyard`, `tests/nursery`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py pumpkin    --port PORT --tier medium --seeds courtyard,patch,pond          --out JUDGING/CODE/sheet-pumpkin.png
cd "WT" && timeout 1500 python tools/variant_sheet.py greenhouse --port PORT --tier medium --seeds conservatory,palm,overgrown   --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && timeout 1500 python tools/variant_sheet.py graveyard  --port PORT --tier medium --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && timeout 1500 python tools/variant_sheet.py nursery    --port PORT --tier medium --seeds nursery,wardrobe             --out JUDGING/CODE/sheet-nursery.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-pumpkin --port PORT --scene combat --region pumpkin-grounds --encounter pk-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-pumpkin-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
