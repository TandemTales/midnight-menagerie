# Round 9 — the room, second pass: a LINE round every form, and the light on the FLOOR

Read `BRIEF-r0.md` and `BRIEF-r1.md` first. This supersedes `BRIEF-r8.md`, which
you should also read: its fix list is largely spent, but its TRAPS and its
INSTRUMENT sections are still current and its item 6 is the corrected version.

**There will be no background art.** Josh, 2026-09-17: *"no more background art.
i wanted to start the loop to perfect backgrounds and see how good they could
possibly be with just procedural generation only. there will be no background
art. make it as good as it can be without it."* The room is the deliverable. The
four samples in `UI/` are the reference and the only question is how close
procedure gets.

## Where round 8 got to, and it got a long way

Round 8's winner gave every region a **subject** drawn into the wall's RELIEF
rather than its colour — a stair in the Foyer, ossuary niches in the Crypt, a
bookcase in the Study, a fence in the Graveyard, seventeen in all. It scored
5.83 against the baseline's 4.25, beat the baseline on all six screens, and cost
nothing (frame 13.14–13.52 ms, backdrop 8.81–8.83). Then the sky was fixed for
the four regions with no ceiling.

Across all seventeen rooms, ink depth went 0.077 → 0.098 and tooth 0.277 → 0.288.

**And `fits_between_samples` came back FALSE for every candidate on every screen,
with the best room at 7 of 10.** So there is a long way still to go, and this
round's target is not a repeat of last round's.

## THE TWO ROOMS. Know which one your screen shows.

Unchanged from round 8 and still the first thing to get straight:

- **`room-*`, `combat`, `combat-boss`** are the **WebGL room** —
  `game/src/fx/backdrop.js`, `fx/shaders/backdrop.js`, `fx/atmosphere.js`.
- **`rest`** and every board and dialog are the **CSS room** —
  `game/assets/ui/kit/room*.webp`, built by `tools/prep_ui_paint.py`, styled in
  `game/src/ui/kit.css`.

They share nothing. A change to one does not touch the other.

## THE FIX LIST

Items 1–4 are what BOTH judges asked for, in the order they asked. Do them
first, and do not stop at the Foyer: every one of them applies to all seventeen
regions.

1. **AN INK CONTOUR ROUND EVERY FORM.** Judge 1 called it "the single cheapest
   thing that would move these from render to painting", and it is the one item
   both judges raised on every screen. The samples outline *everything* — every
   stone, every moulding, every prop, the junction where a floor meets a wall.
   We ink the *hollows* of relief steps (`mmDrawn`) and nothing else, so a form
   that stands in front of another form has no line between them. Prop
   silhouettes, arch mouldings, the stair, railings, headstones, the wall/floor
   junction.

2. **THE STAIRCASE IS A WIREFRAME ON WALLPAPER.** Both judges, first item, on
   `room-foyer` and `combat-boss`. The twin flights and the landing balustrade
   are single-weight hairlines: no painted mass, no shadow under the nosings, no
   cast shadow on the wall behind. Treads, strings, newels and handrail need
   real thickness — a lit top edge with a dark line under it, which is how
   `selectKid.png` draws its balustrade and its frame mouldings. Round 8's own
   notes say relief alone draws a wireframe and that `occ` only half fixed it.

3. **ONE PITCH IS A STAMPED TILE.** Both judges, on the Crypt's loculi and the
   Graveyard's palings. A run of identical bays at an even pitch reads as
   wallpaper however well each bay is drawn. Break it: a name plaque, a broken
   grille, a cracked arch head, a wreath, an empty niche with its slab leaning
   against it; a gate, a leaning section, a missing spike, ivy over two bays.
   `mainMenu.png` does exactly this with its railings.

4. **THE ROOM COMPETES WITH THE BOARD ON `combat`.** Both judges. The
   balustrade and stair diagonals run straight across the enemy row, so
   hairlines cross behind DOOR GREETER, DUST BUNNY and CALLING BELL. Drop the
   stair two stops in value behind the nameplate band, or move the flights
   outward. A room that wins `room-foyer` and loses `combat` has not won.

5. **EVERY SAMPLE LIGHTS THE FLOOR. EVERY ROOM HERE LIGHTS THE WALL.** Measured
   with `tools/valuemetrics.py` (added last round; it measures where the light
   IS, which `bgmetrics.py` does not). Five horizontal bands, top of frame to
   bottom, and the median and lit-area columns beside them:

   | | median L | lit area | focus | band0 | band1 | band2 | band3 | band4 |
   |---|---|---|---|---|---|---|---|---|
   | `mainMenu.png` | 21.1 | 24.7 | 0.223 | 14.9 | 28.7 | 29.8 | 29.6 | **39.6** |
   | `selectKid.png` | 11.5 | 12.5 | 0.282 | 25.5 | 22.1 | 20.3 | 20.4 | 18.6 |
   | `room-foyer` | 9.2 | 12.3 | 0.411 | 7.2 | 13.7 | **39.8** | 19.9 | 21.0 |
   | `room-crypt` | 7.2 | 10.8 | 0.324 | 8.2 | 19.9 | 17.9 | 14.5 | 9.6 |
   | `room-graveyard` | 6.4 | 11.5 | 0.404 | 7.0 | 22.9 | 26.2 | 10.8 | 18.8 |

   Four separate things in that table, and they are not the same fix:
   - **the bright band is in the wrong place.** The Foyer's brightest band is
     its WALL (39.8) with its floor at 21.0; `mainMenu`'s brightest is its
     FLOOR (39.6). A floor is nearer, flatter and catches more light than a
     wall — ours is lit as if the wall were the subject.
   - **our rooms are two to three times darker in the median** (6.4–9.2 against
     11.5–21.1). Dark is right; this is past it.
   - **our lit area is half his** (10.8–12.3 against `mainMenu`'s 24.7) and
     **our light is MORE concentrated, not less** (focus 0.32–0.41 against
     0.22–0.28). So the problem is not a missing focal point — it is that a few
     small pools carry everything and nothing else is lit at all.
   - **the top of the frame is half as bright as his** (band0 7.0–8.2 against
     14.9–25.5), and that is after round 8's sky fix.

6. **THE SIDE WALLS ARE STILL EMPTY, and round 8's winner says so itself:** "the
   Foyer's SIDE walls carry the PANEL mode and nothing else — bare wainscot,
   chair rail and a hung portrait. `subjectH` gates the staircase on `uFar` (a
   room has one staircase), and I did not write a side-wall subject. That is
   where the rubric's 'nothing on it for two metres' still applies to my build."
   Judge 2 asks for the same thing and names where to get it: SOOT's
   double-moulded panel courses, its dado of small raised panels and its
   bracketed cornice, run down the sides in perspective. `ui/r8-background-a`
   is still there.

7. **THE PROPS ARE PALE GREY SLABS.** Both judges, on the Foyer's chest,
   armchair and wardrobe: blank faces, no contour, no contents, "a soft blob on
   top". Two findings from round 8 that a prop pass must start from, both paid
   for:
   - **You cannot light a prop that is at its ceiling.** A near prop's output is
     mostly the additive rim and ambient terms plus a luminance knee, and it
     already sits at `propCeil` — so drawn marks on props must be DARK. A
     highlight put in as a highlight executes in the right shape and changes
     nothing on screen.
   - **A prop is GREY BY CONSTRUCTION.** It takes the key and the fill at the
     same `CINE_PROP = 0.26`, and in most palettes those are equal-and-opposite
     hues (the Foyer's warm `#e2b271` key against its cold `#79afce` fill).
     Lighting a near form 50/50 from two opposite colours cannot be fixed by a
     chroma cap, which changes saturation and not hue. `lights.js` has `kind` on
     the light object but does not publish it in the packed payload; a prop
     should take the fill at about a third of the key. Inferring fill-ness from
     colour breaks the four cold-keyed regions, so it needs the `kind` flag.
   - At ~30 px the recognisable CUE beats the parts — a fuller headstone read as
     "a block with a hat" and was reverted. The Foyer's cabinet and clock
     occupy ~180 px, not 30, so parts DO read there.

8. **THE MOTES.** An even scatter of bright points over the whole frame, dimmed
   by a third last round and still there. **Not one of the four samples contains
   a single one.** Measured, they are also the brightest thing in several
   frames. Consider removing them outright.

9. **Smaller, named, and each on a specific capture:**
   - `room-graveyard`: an empty black band the full width of the frame between
     the railing and the front row of graves; and the roof behind the main block
     is a pale soft triangle with no ridge, no tile courses and no edge against
     the sky.
   - `room-crypt`: the far wall is the darkest band of its frame and none of its
     new ashlar or loculi reads; the vault over the upper third is an
     undifferentiated grey field wanting transverse ribs.
   - `room-foyer`: the arched window above the landing has tracery but no glass
     and no light. Glaze it and put cold moonlight through it onto the landing.
     The floor is a large empty plank field through the middle third.
   - `rest`: carry the fan damask down from the picture rail to the dado for the
     full width at reduced contrast, instead of stopping in a band at the top.
   - FOLIAGE is still the weakest of the six wall modes; round 8's winner says
     the Hedge Maze is "the one room of seventeen I would not defend". Its
     recorded failure mode: even discs on a lattice read as chain mail, and a
     hollow all the way round every clump reads as a dry stone wall. What worked
     was an anisotropic asymmetric clump with the hollow BELOW a leaf mass, and
     a hard scalloped silhouette against the sky. **Check anything you add to a
     foliage mass against masonry first.**

10. **Not yours to decide: the region palettes.** All three of round 8's
    builders independently flagged the same three — the Ballroom's plum and
    magenta at exposure 3.55, the Greenhouse's acid green, the Secret Passages'
    hot magenta — as far outside the samples' saturation. **Josh has not ruled.**
    Say so in `notes_for_merger` and leave them. The SKY is already exempt: it
    takes a canonical night rather than the region's masonry colour, because a
    night sky is the same night everywhere.

## THE INSTRUMENTS, and what each of them lies about

`python tools/bgmetrics.py --samples --patches --octaves` prints the targets.
`python tools/valuemetrics.py --samples` prints the value targets. Both take
image paths. **Every one of these caveats was paid for.**

- **`inkDepth` is a MEDIAN over the top 3% of gradients.** Adding forty
  mid-strength drawn lines to a bare wall can move it DOWN, because the median
  leaves a handful of very strong troughs and lands on the joinery's whole
  distribution. Read `inkShare` and `tooth` beside it.
- **On a very dark wall the ink axis is blind.** `_edge_profile` takes the 97th
  percentile of gradient INSIDE the crop, so in the Crypt the "strong edges" it
  samples are the sconce and the shaft in both captures and the masonry never
  enters the sample. A number that does not move is not proof nothing changed.
- **`tooth` is measured on FLAT TILES ONLY**, so a room that replaces bare wall
  with dense relief has fewer flat tiles to measure and can read lower while
  looking better. And the reverse: a large *correctly smooth* area (a sky) pulls
  whole-frame tooth down toward the sample's own figure.
- **A PURE-BLACK PIXEL CARRIES NOTHING** — no tooth, no line, no ink — and it
  divides the other axes away. `void%` / `voidT%` / `skyLvl` are the columns.
  Samples: void 1.5–9.1%, upper third 0.05–7.35%, sky level 8.5–29.8.
- **CHECK WHICH POPULATION YOU MEASURED.** Twice in one day a confident
  measurement came from the wrong pixels: a "34% cloud variation" in
  `mainMenu.png` that was the tower spires inside the patch, and a CSS-room
  defect that vanished once `kit.css` showed those two assets are masked to the
  candle pools. Crop deliberately, and say what is in the crop.
- **A sweep of all seventeen rooms is worth running and not worth obeying.** Its
  job is to name the room to go and LOOK at.
- **The standing rule of this whole pass: measure to FIND the defect, LOOK to
  set the amount.** Every amount shipped in rounds 7 and 8 that was set by the
  metric alone was wrong.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

**Through `on_port.py`, always** — `gpuprof.py` hard-codes `localhost:8777`,
which is the main checkout's server, so run directly from your worktree it
profiles `dev` and not your branch.

Current, measured with nothing else on the GPU: **13.14 / 13.35 / 13.52 ms**,
`ALL_BACKDROP` 8.81–8.83. **Your build must stay at or under 15.5 ms and you
must report three runs.**

**Take the reading in a quiet window.** Three builders share this machine and a
capture sweep running beside the profiler moved the same build from 13.5 to
16.8 ms. `ALL_BACKDROP` is the more comparable number; `T_full` moves with
whatever else is on the GPU. If something you want is expensive, put it behind
the quality tier the way `MM_TOOTH` is.

## THE TRAPS

- **A BACKTICK IN A GLSL COMMENT TAKES THE WHOLE GAME DOWN**, with a page error
  naming a GLSL local, a black frame, `state: no MM` and a 0-byte
  `.console.txt`. This codebase quotes identifiers in backticks everywhere else,
  so it is very easy to do. **Run `python tests/shader-literals/check.py` after
  every shader edit** — not at the end. It also catches `${...}` splices the
  file does not import, and an unterminated `/* */`, which is the one fault in
  this family that does NOT break the page: the module parses, the page renders,
  the room draws with the last program that linked, and the capture looks
  plausible.
- **`max()` on an ACCUMULATED SDF** subtracts from everything already in it.
  Shape the primitive, then `min()` it in.
- **A drawn line's width is in PIXELS.** Use screen-space derivatives of the
  height field, and note that joint width must be PER AXIS: `max()` of the two
  makes every bed joint on a side wall hit its clamp and draws long black bars
  down the wall, which the far wall hides completely.
- **The ink HIERARCHY matters as much as the width.** `mmDrawn` saturates at
  0.26 of height per pixel, so a fine repeating joint authored at 0.34 gets
  exactly the same full ink as a doorway edge. Repeating joints belong at
  0.10–0.21, big forms at 0.5–0.9. Setting them equal is what made one capture
  read as scaffolding.
- **Line endings.** The edit tools normalise a MIXED file on write. Run
  `python tools/endings_guard.py --base <base>` before committing, in your
  worktree and never in the main checkout.
- **Anything run from a worktree drives `dev`.** All 102 test scripts hard-code
  `:8777`, and so does `gpuprof.py`. Use `python tools/on_port.py <port>
  <script> [args]` for every one of them.
- **Pin the phase for a reproducible capture.** `showcase.steady()` stops the
  clock wherever it happens to be; `ctx.clock.t = 120` before and after the
  scale goes to zero gives two byte-identical captures, props and particles
  included, so a single small prop CAN be A/B'd.

## WHAT IS NOT YOURS THIS ROUND

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialog controls, gameplay, and the region palettes (item 10).

## DELIVERABLES

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- `tools/gpuprof.py` three times **via `on_port.py` on your own port**, in a
  quiet window, the three numbers in `notes_for_merger`;
- `python tests/shader-literals/check.py` green;
- ink depth AND the five value bands, before and after, on at least the three
  isolated rooms, in `notes_for_merger`;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

```
cd "WT" && python tools/shot.py CODE-combat        --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss   --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-rest          --port PORT --scene rest    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-room-foyer     --port PORT --hash "region=foyer&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-crypt     --port PORT --hash "region=crypt&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-graveyard --port PORT --hash "region=graveyard&tier=high&actor=0" --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
```

`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, sweep all seventeen rooms with the backdrop-room script and
look at every one, and photograph two screens outside this round's six — a board
and a dialog — and look at those too. Stop your dev server when you are done.
