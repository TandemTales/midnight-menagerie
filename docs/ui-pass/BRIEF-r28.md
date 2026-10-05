# Round 28 — the props and the darks: the Passages, the Pumpkin Grounds, the Graveyard, the Kitchens, the Kennels

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`
to `BRIEF-r25.md` in full: they built every wing this round finishes. This
file wins wherever they disagree. **Your rubric is `RUBRIC.md` as amended by
`RUBRIC-r28.md`.**

## WHY THESE FIVE

A third survey (`SURVEY-2026-10-04.md`) photographed every screen and all
seventeen rooms, empty, at the Steam Deck's tier and size, after rounds 22-26
rebuilt every wing. Two blind judges, viewing in opposite orders, put the
rooms at 2-6 and the screens at 5-7, and named ONE shared room defect:

> "furniture and dressing are untextured, flat-shaded primitives with no
> contact shadows (desks, tubs, kennels, sarcophagi, workbenches, piano,
> rocking horses, headstones), and in at least eight wings a light pool or
> haze lifts the dark to milky grey or tan, while passages lacks a back to
> the room entirely" — judge 2's SYSTEM; judge 1's is the same, worded as
> "kill the grain, pull the props forward to the stage, ink and texture the
> hero prop".

These five wings carry the most of it and the largest headroom on both lists:

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Secret Passages** | 2, +3 | 3, +3 | "a black void with two glowing door slits, two lamp posts and a few crates"; "the lit floor ends in a hard trapezoid edge at y 380 with a starfield void behind it" |
| **Pumpkin Grounds** | 4 | 5, +2 | "the mansion beyond the wall is a blocky box model whose windows and carvings are stair-stepped pixel glyphs"; "nowhere near mainMenu.png's turrets, slate roofs and ivy" |
| **Graveyard** | 4 | 5, +1.5 | "the same box-mansion as pumpkin"; "the grass is a flat milky grey-green field"; "the headstones are small flat-shaded boxes" |
| **Kitchens** | 3 | 4, +2 | "monochrome red murk, the prep tables are black wire outlines, and a flat grey band runs across the top as the ceiling" |
| **Kennels** | 4 | 4, +2 | "the doghouses are flat-coloured boxes, the pet beds are flat tins, and the ceiling is a milky grey band"; "the floor flags are a lifted grey-beige" |

## THE FIX LIST

### 1. THE PASSAGES GET A FAR END — both judges, the largest headroom in the house

The corridor stops in a lit trapezoid of floor with black (and stars) behind
it. Build the passage's END: a far wall or doorway in dark panelling with a
ceiling line, wall sconces in pools of light, the panelled side walls closing
in toward it, so the corridor has depth and a back. Then the judges' props:
cobwebs, a hidden swing-door ajar, a candle niche. The glowing door slits are
"unlit cardboard flats": draw them as doors in their frames, with the light
coming THROUGH them. No starfield indoors. Each of its rooms (the passage, the
library passage, the closet) reads as that.

### 2. ONE MANSION, AT `UI/mainMenu.png`'S LEVEL — both judges, two wings

The Pumpkin Grounds and the Graveyard share a "blocky box model" house with
stamped window rectangles. Replace it, ONCE, for both, with the sample's
house: pitched slate roofs, turrets with conical caps, dormers, finials,
chimneys, ivy, and lit arched windows among dark ones — a silhouette inked
crisp against the night sky with round 21's pen, never stepped and never soft.
It is the most-seen building in the game (it is also the title's), so it is
the round's showpiece. The Graveyard's grass goes from milky grey-green to a
true dark with tufts and leaf litter; its headstones get carving, moss and
contact shadows.

### 3. EVERY HERO PROP HAS A FINISH AND A SHADOW — the shared defect

In your five wings, every named prop is a drawn object with its material,
its own shading and a CONTACT SHADOW on the floor: the Kitchens' range
(black-leaded, glowing fireboxes), copper pans and scrubbed-wood prep tables
with crockery; the Kennels' doghouses (weathered planks, straw, a lit
interior) and pet beds (stuffed cushions, not tins); the Graveyard's
headstones; the Passages' crates and lamp posts; the Pumpkin Grounds'
pumpkins and carts. A flat-shaded primitive or a line-drawn wireframe is the
defect this item removes.

If you build the contact shadow and the prop finish as a SHARED rule (one
function every wing's props go through), it would lift the other twelve wings
too — the judges' tubs, sarcophagi, workbenches, piano, rocking horses and
desks. That is welcome, BUT ONLY with proof: sweep all seventeen rooms before
and after (`tools/room_batch.py --regions all --tier medium`) and LOOK at every
other wing; a shared change that makes any of them worse is a regression, not
a bonus. Say which you chose.

### 4. THE DARKS GO BACK DOWN — both judges, eight wings

"A light pool or haze lifts the dark to milky grey or tan." In your five
wings: the Kitchens' single red wash gets a second, COLD light (a window or a
cellar door) so its objects have more than one value, and its grey ceiling
band becomes dark beams; the Kennels' milky ceiling becomes beams and its
lifted floor flags go back to a deep warm dark with straw; the Graveyard's
lawn goes dark. Keep the light where the fighters stand; take the haze off
everything else. Round 21's rubric holds: soft or hazy is worse than stepped.
Say in your notes if you change a palette COLOUR, and why.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js` (the
five wings' rooms, kinds and props, and the shared mansion); the palette's
COLOURS only where a dark is too pale (say so); `fx/shaders/grade.js` only if
a fix truly needs it; `tools/` prep scripts if you make art, extended rather
than duplicated.

**Not yours:** the other twelve wings (prove you left them alone, or made them
better, with the seventeen-room sweep — compare content, not hashes; rounds
22-25 gave most wings their own programs, but the shared subjects and props
are the trap, and the Heart and the title screen both draw houses); the pen
and floor camera from round 21; `ui/enemy.js`, the stand-in room,
`core/renderer.js` (keep its render-scale governor: Josh's standing rule), the
run rail, the hand, the cards (round 27 and its graft, just merged), the
sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier: a fight in
  each of your five wings against BASE, interleaved, three runs, `--wait 40`,
  15.5 ms hard. The Foyer (16.3 ms) and Greenhouse (15.9 ms) fights are
  ALREADY over budget and are not yours; do not make another wing join them.
  A shared prop rule is paid in every wing's frame: measure two wings that are
  not yours too if you write one.
- **BASE's server goes on YOUR port + 100** (9121 -> 9221 and so on), never on
  a port in 9121-9123.
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step); the sheets
  below pass `--tier medium`.
- **Wrap every capture in `timeout 180`**, and hold the GPU slot for a batch
  (`tools/gpu_slot.py`) rather than letting each shot queue for it: in round
  27 the slot queue alone outlasted 180 s and killed every capture.
- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/dup-keys/check.py`, `tests/shader-literals/check.py`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and every
  region gate for your five wings (`tests/secret-passages`,
  `tests/pumpkin-grounds`, `tests/graveyard`, `tests/kitchens`,
  `tests/kennels`) and `tests/heart`. If steam-deck or gamepad time out while
  three builders share the GPU, A/B it against BASE before calling it
  environmental, as round 27's builders did.
- Stop ONLY the processes you started, BY PID. Commit as you go (round 27's
  builders all hit the session limit mid-build; their commits are what
  resumed them). `python tools/endings_guard.py --base BASE` must print
  ENDINGS OK. An unwritten uniform is `(0,0,0,1)`, not zero. **Say in your
  notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 180 python tools/variant_sheet.py passages  --port PORT --tier medium --seeds passage,library,closet --out JUDGING/CODE/sheet-passages.png
cd "WT" && timeout 180 python tools/variant_sheet.py pumpkin   --port PORT --tier medium --seeds courtyard,patch,pond  --out JUDGING/CODE/sheet-pumpkin.png
cd "WT" && timeout 180 python tools/variant_sheet.py graveyard --port PORT --tier medium --seeds yard,plots,gate       --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && timeout 180 python tools/variant_sheet.py kitchens  --port PORT --tier medium --seeds kitchen,scullery      --out JUDGING/CODE/sheet-kitchens.png
cd "WT" && timeout 180 python tools/variant_sheet.py kennels   --port PORT --tier medium --seeds kennels,wash          --out JUDGING/CODE/sheet-kennels.png
cd "WT" && timeout 180 python tools/shot.py CODE-fight-passages --port PORT --scene combat --region secret-passages --encounter sp-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-passages-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
