# Round 43 — the Hedge, the Attic, the Crypt, the Bathhouse: drawn objects, never fewer

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`,
`BRIEF-r35.md`, `BRIEF-r37.md`, `BRIEF-r39.md` and `BRIEF-r41.md` in full.
Read `VERDICTS-r35.md` (the last time the Attic and the Crypt were rebuilt),
`VERDICTS-r39.md` (the Bathhouse), `VERDICTS-r41.md` (the Hedge) and
`REPAIR-r41.md`. This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r43.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s (the
Hedge prop program is ~9-13 s already: do not grow it). **A good link can be
an empty program:** read `gl.getProgramInfoLog` for every program you change.

## THE RULE THIS ROUND IS BUILT ON

Twice this week a round did what survey judges asked -- shrink, mute, remove,
dim -- and a PAIRED blind test then found the screen worse (`SURVEY-2026-10-20b.md`,
`REPAIR-r41.md`). **A drawn object beats an empty, dimmed or muted surface,
even a reused one.** So in your four wings: never fewer objects, never a
muted or emptied surface. Where something is weak, REPLACE it with something
at least as rich, as many and as lit. "Fewer tubs" below means *varied* tubs,
not a barer floor.

## WHY THESE FOUR

Survey 8 (`SURVEY-2026-10-20b.md`): the rooms are 4-6, and these are the
lowest on both judges' sheets apart from the three the repair just fixed.

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Hedge** | 4.5, +2 | 4, +2 | "the hedge walls are flat noise-textured boxes with ruler-straight tops, and the lawn either side of the path is a milky grey"; "give the hedges ragged leafy tops and withered gaps with a drawn edge, and darken the lawn to a rich deep green with leaves and roots on it" |
| **Attic** | 4.5, +1.5 | 5, +1 | "the plaid trunk and strapped box in the left foreground are soft, flat-shaded blocks that melt into the black bottom third"; "blurry blobs cropped by the frame, the rug is the shared diamond rug, and the lower quarter of the frame is black" |
| **Crypt** | 4.5, +1.5 | 5, +1.5 | "the two skeletons mid-floor are cardboard half-dome cutouts, and the ceiling is a flat grey plane with white rib lines"; "redraw the skeleton niches as sunken graves with stone edges and depth, and give the vault ribs real volume" |
| **Bathhouse** | 4.5, +1.5 | 5, +1 | "a dozen identical cloned clawfoot tubs, flat cream, with the window light landing as round spotlight discs"; "vary the tubs (sizes, some draped, one overturned), draw their claw feet crisply, and sharpen the floor tiles" |

## THE FIX LIST

### 1. EACH WING'S SUBJECT, DRAWN

- **The Hedge** (the Withered Hedge Maze): keep round 41's laid flags,
  kerb and root line (a paired test preferred them). The yew walls: a
  leafy, ragged top -- clipped mass breaking into withered gaps, dead
  sprigs, a drawn edge -- not a ruler-straight noise box; the lawn a deep,
  rich green with leaves and roots on it, NOT a milky grey-green plane.
- **The Attic:** the trunk and box drawn as objects -- edges, straps, lock,
  lid seam, a contact shadow -- fully in frame at the fighters' depth (move
  them in, don't crop them); the front floorboards LIT (a lantern or moon
  pool), never a black bottom quarter; its own rug (see 2).
- **The Crypt:** the skeleton niches as sunken graves -- stone kerbs with
  depth, the bones inside lying in shadow -- or carved sarcophagi; the vault's
  ribs in relief with light falling off them, not white lines on a grey plane.
- **The Bathhouse:** the clone row of tubs replaced by VARIED tubs (sizes,
  copper and enamel, one draped with a towel, one overturned), crisp claw feet,
  rims and contact shadows, as many objects as now; the window light as long
  shafts across the tiles, not round spotlight discs; the tile sharpened.

### 2. NO SHARED RUG -- both judges' SYSTEM

"One diamond rug in study, nursery, attic and kitchens" (J2); "the same red
diamond rug is in the attic, kitchens, nursery and study" (J1). The **Attic**
gets a floor covering of its own, as rich as the one it replaces (a faded
Persian runner, a rag rug, a hooked rug with a pattern of its own -- your
call), via the `MM_RUGK` floor define round 41 added. Do NOT change the
Study's, Nursery's or Kitchens' this round.

### 3. THE NEAR FLOOR LIT AND DRESSED

No near floor falls to black or empty mottle (J1: the Attic, the Crypt, the
Hedge; J2 nine rooms). Light from a source the room has, objects standing IN
it above the hand's top edge. Reuse round 31's `nearFloor` rule as rounds
34-41 extended it.

### 4. INK, NOT GRAIN; DARK, NOT MILKY

Soft or hazy is worse than stepped; a dark washed pale or milky is a defect.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark is
too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/` prep
scripts, extended. A shared rule that lifts other wings too is welcome ONLY
with the seventeen-room sweep, SEEDED (the list in
`docs/ui-pass/survey-2026-10-20b.sh`), proving none got worse.

**Not yours:** the other thirteen wings (unchanged) -- above all the three the
repair just fixed (the Kennels, the Passages, the Sleeping Quarters) and round
39's four; the Study's, Nursery's and Kitchens' rugs; round 28's painted house
and contact-shadow rule; the pen and floor camera from round 21; `ui/*`,
`core/renderer.js` (keep its render-scale governor: Josh's standing rule), the
boards, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6` (hm-1 / hedge-maze, ao-1 / attic-observatory, cr-1 /
  crypt, bh-1 / bathhouse) against BASE, interleaved, three pairs; check
  `size.drawW`. 15.5 ms hard; the Crypt's fight is the round's: leave it no
  worse than BASE. Measure only when `tasklist` shows no UnrealEditor.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/link-queue`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/hedge-maze`, `tests/attic-observatory`, `tests/crypt`,
  `tests/bathhouse`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge     --port PORT --tier medium --seeds hedge,fountain,walk        --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py attic     --port PORT --tier medium --seeds attic,library              --out JUDGING/CODE/sheet-attic.png
cd "WT" && timeout 1500 python tools/variant_sheet.py crypt     --port PORT --tier medium --seeds catacomb,family,ossuary    --out JUDGING/CODE/sheet-crypt.png
cd "WT" && timeout 1500 python tools/variant_sheet.py bathhouse --port PORT --tier medium --seeds bathhouse,steam,pool       --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-crypt --port PORT --scene combat --region crypt --encounter cr-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-crypt-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
