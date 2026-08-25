# Frontend round 6 — Companion Select is the painting

**Designer's instruction, verbatim:**

> "for the companion selection screen, use the one included in the UI folder. keep the
> unrescued companions hidden and highlight the ones you can select when the mouse hovers
> over them."

Three requirements. All three are now true, and the third one is where the work went.

---

## What was wrong

`scenes/select.js` built its own 4×4 grid out of the sixteen sliced portraits in
`game/assets/portraits/`. Its file header even said *"the 4x4 Menagerie grid from
UI/selectCompanion.png, alive"* — it was **recreating** the sheet. Every part of the sheet
that was not a portrait had been re-implemented somewhere else: the wordmark as
`logoLockup()` SVG, the cartouche plaque as a `<div>`, the candles and cobwebs as
procedural SVG ornaments, the gold nameplates as CSS `.tile__plate` gradients. Sixteen
painted frames became sixteen CSS boxes with `border-radius: var(--radius-md)`.

And the twelve unrescued Companions were not hidden. Each printed

> **Not yet rescued** / *Somewhere in the Ballroom*

over a silhouette behind a padlock glyph. That tells the player exactly how many are
missing and where each one is — which is the information the screen is supposed to be
withholding.

## What it is now

The screen **is** `UI/selectCompanion.png`. Not a reference for one, not a source to slice:
the painting, on screen, at 900px on a 1080p display.

### Two images, one painting

`tools/prep_board.py` (new, one-off, output committed — CONTRACTS non-negotiable #1) writes:

| file | what it is |
|---|---|
| `game/assets/ui/menagerie-board.png` | the sheet, verbatim |
| `game/assets/ui/menagerie-empty.png` | the same painting with all sixteen frames emptied to a dark recess |

The scene draws **empty** as its base layer and lays a sprite of **board**, cut to one
measured frame rect, over each cell whose Companion is available.

That ordering is the whole trick, and it was chosen over the obvious one (draw the real
board, cover the hidden cells) for three reasons:

1. **Hidden costs no DOM.** An un-freed Companion has no element, no `aria-label`, no
   pixels. There is nothing on the page to inspect. Hidden means hidden, not `opacity: 0`.
2. **No seams.** Both layers are the same painting at the same rendered size, so a sprite
   drops back into its own hole in the wall with nothing to line up.
3. **The hover can lift.** The sprite is always present at full opacity over an emptied
   frame, so `transform: scale()` on hover has no cross-fade to hide and no hole to leave
   behind.

### The geometry is measured, not assumed

`tools/slice_portraits.py` documents `TOP 188, LEFT 18, cell 306×251, x = LEFT + c*306.5`.
Drawn over the sheet, that grid is visibly wrong at the bottom — it clips *"the Eyeball
Spider"* off Wink's nameplate. **The frames in this sheet are not on a regular pitch.**
Measured off the gold rails:

```
columns  x  16..310   321..622   632..931   941..1235      widths 295 302 300 295
rows     y 187..443   452..696   705..939   948..1201      heights 257 245 235 254
```

Row 0 is 257px tall and row 2 is 235px — a 22px difference, about a tenth of a frame. Any
uniform grid drawn over this sheet is off by half a nameplate somewhere.

The tool finds the rails by scanning for warm bright pixels and requiring **all four
columns** to agree at the same y, because the cartouche's underside and the two candle
flames each live in a single column and were otherwise read as the top of row 0. The gold
*nameplates* also span all four columns, so the eight horizontal rails are looked for in
windows around each expected edge rather than across the whole sheet; a window that does
not contain exactly one rail is a hard error, not a shrug.

The table is printed as JS and pasted into `ui/portrait.js:BOARD_CELLS` as fractions. Each
rect carries **4px of the black gutter on every side** — still narrower than the 9-11px
gutters, so no two cells overlap, and the margin is black in *both* images, which is what
lets a hovered frame scale past its own edge without showing a cut.

`boardCellVars(slug)` does the background-position arithmetic in JS so the stylesheet has
one rule for all sixteen. CSS positions a background by aligning p% of the image with p% of
the box, so the offset is `(box − image) · p`; solving `(w−1)·B·p = −x·B` gives
`p = x / (1 − w)`.

### What an empty frame looks like

An emptied cell is **not** a black rectangle — the brief was specific that it should belong
to the same painting. Each recess is painted per cell with a seeded RNG:

- a near-black plum base warming towards the bottom, where candlelight in the room would
  reach the back of the rebate;
- a backing board a hair proud of the rebate, its top edge catching one thread of light;
- fine dust grain plus low-frequency blotching;
- a weak wash from one upper corner, so it has a light direction;
- an inner shadow, hardest along the top lip, where the frame sits proud of the recess;
- a few sagging cobweb threads in one corner. The sheet has real cobwebs in its own
  corners; carrying a much fainter one into each empty frame is most of what stops it
  reading as a hole cut in the page.

Two details cost a round each and are worth writing down:

- **The mask has to be rounded.** Every frame in this sheet has a 45° chamfer at each
  inner corner. A square mask ate it, and an emptied frame had visibly blunter corners than
  a filled one sitting right next to it. `radius=9` on the rebate mask keeps them identical.
- **The inward scan has to be clamped.** It walks in from the outer edge until the gold rail
  is behind it — but Boggle's cell has a red curtain painted right against the top of its
  frame, and an unclamped scan walked 16px into it, leaving a stripe of the hidden portrait
  on display. Clamped to 6px on three sides and 13 on the bottom (the bottom lip is a
  *double* rail with a 7px shadow between the two, and a short gap does not mean the
  picture has started).

### The hover

> "it should feel like a candle being brought closer to one frame on a dark wall."

Four things happen at once, and none of them is a border appearing:

1. **The wall is unlit at rest.** Every available portrait sits at `brightness(.88)
   saturate(.92)`. This is what makes the hover read as *light* rather than as UI.
2. **The lit frame leans out.** `scale(1.07) translateY(-1.6%)`, `brightness(1.34)
   saturate(1.2)`, a real drop shadow beneath it and a warm rim on the painted gold rail.
3. **One candle, for the whole wall.** A single `.sel__candlelight` element, `mix-blend-mode:
   screen`, that *moves to* whichever frame is lit. It is one element rather than a glow
   baked into each sprite because the point is the **spill**: the frames either side catch
   some of it, and the empty ones catch it too. It is moved with a transform, never with
   `left`/`top` — `select.js` divides the target position by the glow's own width so
   travelling from frame to frame is a composited transform and costs no layout.
4. **Everything else falls back** to `brightness(.66) saturate(.62)`.

Plus a slow 3.6s opacity flicker on the light (off under `mm-reduce-motion`), and
`ui:hover` — the same sfx the Title screen uses — each time the candle actually moves.

**Hover and keyboard focus are one state.** `_light(slug)` is called from `pointerover`,
`focusin`, `pointerleave`, `focusout` and `_pickCompanion`, and it is the only thing that
writes `.is-lit`. They cannot drift apart, and a keyboard user gets the identical candle
(plus a 2px `--flame-300` focus ring, which the pointer path does not get).

Moving onto the wall *between* the frames — or onto an empty one — takes the candle away
again. Leaving it burning on the last frame you touched reads as a stuck highlight.

## Smaller decisions

- **Arrow keys are linear, not `cols: 4`.** Only the pickable Companions exist as elements,
  so on a fresh save they sit at (0,0), (1,0), (1,1), (1,2). Stepping by four rows would
  land on empty frames that have no element. Left/Right and Up/Down both walk the roster in
  reading order.
- **The wordmark is handed over, not duplicated.** The painting carries MIDNIGHT MENAGERIE
  in its own cartouche, so the header lockup is hidden for the Companion and dossier steps
  and only fades in for the Kid step, where the painting has slid off screen entirely. Two
  wordmarks stacked was the clearest single tell that this screen was a reconstruction.
- **The header shrank.** `--head-h` went from `clamp(80px, 10.2vh, 112px)` to
  `clamp(54px, 6.8vh, 78px)` — with no lockup in it, it only holds Back and the step rail —
  and the board is allowed to rise a third of that into it, since its middle is empty. That
  is ~50px of extra height for a square painting on a 16:9 screen.
- **The floor candles flank the painting, not the viewport.** Pinned to the screen edges they
  read as two unrelated props in a void; brought in to the board's shoulders they light the
  wall the Menagerie hangs on and answer the two candles painted into the sheet. Moved with
  a transform (`--cand-in`) so walking to the dossier does not reflow the scene.
- **`select:ready` waits for the plate to decode.** The painting *is* the screen; firing
  ready while it was still a blank square would let a reviewer screenshot an empty wall.
  Raced against a 2.5s timeout, cannot reject.
- **`.companion-tile` kept its class name** even though nothing about it survived, because
  `tests/backpack/run.py` clicks `.companion-tile:not(.is-locked)`. There are no locked
  tiles any more, so that selector still resolves — to a real, pickable Companion.

## Not regressed

The Kid step's MISSING poster, the generated kid and pet photographs (`ui/petart.js`), the
dossier (identity, signature mechanics, strengths/weaknesses, vitals, starting deck as real
`CardView`s), the Haunt Level selector, the typeable seed field and the Backpack readout are
all untouched and verified on screen. `TERMS` still supplies the terminology.

## Verified

| | |
|---|---|
| `tests/seams/check.py` | 1603 call sites, **0 problems** |
| `tests/scene-css/check.py` | 10 sheets, 870 classes, **0 conflicts** |
| `tests/run/run.py` | 50 runs, **0 errors** |
| `tests/backpack/run.py` | 77 checks, **0 failures** |
| fps | **60-61** at 1600×900, 1920×1080 and with all sixteen sprites live |
| console | **zero errors** across every run above |

Screens read and compared against `UI/selectCompanion.png`: fresh save (4 available, 12
empty), a hover, nine rescued (13 available, 3 empty), `?all=1` (all sixteen — pixel-identical
to the sheet apart from the lit frame), 1920×1080, 1280×720, `reduceMotion`, keyboard focus,
the dossier, the Kid step, and Begin Expedition through to a live run on the map.

## Loose ends for whoever is next

- `sfx.js` still maps `'ui:denied': 'ui:deny'` with the comment *"clicking a locked Companion
  tile"*. There are no locked tiles any more and nothing in `scenes/` plays it. Audio agent's
  file, so left alone.
- `game/assets/portraits/*` is still needed — the dossier hero art, the "Together" panel, the
  Title screen and the Clubhouse all read from it. Only Select stopped using the thumbnails.
- The two board PNGs are 2.5 MB and 1.7 MB. In line with the 17 MB already in
  `assets/portraits/`, and kept as PNG rather than JPEG because the recesses are near-black
  gradients that JPEG bands badly.
