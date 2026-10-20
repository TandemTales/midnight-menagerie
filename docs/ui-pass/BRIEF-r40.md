# Round 40 — the boards: a type floor at 1280, the hand's spread, the paintings, the map's regions

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r33.md` and `BRIEF-r36.md` (the controls
rounds), `BRIEF-r38.md` (the map) and `BRIEF-r32.md` (the fights). This file
wins wherever they disagree. **Your rubric is `RUBRIC.md` as amended by
`RUBRIC-r40.md`.**

## WHY

Survey 6 (`SURVEY-2026-10-19.md`, items 4 and 5): both judges, and a paired
test that found gameover the one screen worse than survey 5.

- **A 12 px floor at 1280.** "Text falls to about 9-11 px at 1280 on every
  dense board (shop, both fights' cards, gameover, the map's room pills, the
  run strip's chips), so a 12 px floor at 1280 across those screens is worth
  one round on its own" (J2); "at 1280 the secondary text runs at 9-11 px on
  the event, shop, map, gameover and combat-crowd screens, and one shared
  type floor would fix all five" (J1).
- **combat-crowd:** "the fanned duplicate stacks in the hand (Sit Pretty x3,
  Bite x3) spread the hand from x=260 to x=1060 and lift it to y=560, so it
  covers the whole floor in front of the fighters, and the card rules text
  drops to about 9 px" (J2); "the Butler's three effect medallions are bolted
  onto the right end of his HP bar ... a detached strip; at 1280 the card
  bodies in the stacked hand drop to ~9-10 px" (J1).
- **The paintings (reward, event, rest, gameover).** "The hung paintings on
  reward, event, rest and gameover all wear their nameplates over the bottom
  of the canvas rather than under the frame, a one-rule fix for four boards"
  (J2); on reward "at 1280 the two hung paintings are squeezed into the 15 px
  gutter between the board frame and the card trays, and their three-line
  nameplates cover the lower quarter of each canvas" (J2) -- "give the
  paintings their own wall: hang them higher, beside the gothic windows above
  the card stage" (J1). gameover is the one pair a paired test found WORSE
  than survey 5: its paintings now hang "hooked short and the Dowager's label
  floats beside her frame" (the 10-16 painting fit, `ui/hang.js fitHung`).
- **map:** both read the regions as "dashed CAD marquees with corner handle
  dots, like a selection box in an editor" -- a RECTANGLE with a dashed line
  and corner marks is a selection marquee whatever its fill.
- **hud-late:** "KEEPSAKES 10 and GEAR 8 each show only three sepia chips
  about 22 px across at 1280, grey on grey with no rim colour, so the ten
  Keepsakes cannot be told apart and seven of them are hidden" (J2); "the bare
  numbers 137, 2 and +1 on the left have no labels" (J1).
- **shop:** the Keepsake and Snack rows "read as a progress bar on a web
  list" (J1); "the six cards touch edge to edge under the curtain" and their
  rules run 9-10 px at 1280 (J2).

## THE FIX LIST

### 1. NO RUNNING TEXT UNDER 12 PX AT 1280 — both judges

On all six screens at 1280x800, every line a player is meant to read --
cards' rules text in the hand, the shop and gameover included, list lines,
plaque italics, the run strip's figures and the map's room pills -- is at
least 12 px. Fit by reflowing, using the space and cutting words, NOT by
shrinking something else. Prove it with a small-text probe (your scratch dir)
on every screen at 1280: the list empty, or each survivor named and
justified (an ornamental numeral is not running text). The card's FACE design
is not yours; its rules text SIZE at a given card size is.

### 2. THE HAND STAYS ON ITS SHELF — both judges

At nine cards with duplicates stacked (round 36), the fan stays narrow and low
-- below the fighters' feet and bars, clear of the floor in front of them --
with every title readable and the rules at 12 px+ on the raised card. The
copies behind a stack read as several cards without widening the fan. The
Butler's effect medallions seated by him (above his head or by his
nameplate), not bolted onto his bar's end. Play by mouse, keys and pad still
works for every copy in a stack.

### 3. THE PAINTINGS: PLATE UNDER THE FRAME, A WALL OF THEIR OWN — both

Every hung painting's nameplate on its own brass plate BELOW the frame,
never over the canvas; one or two lines, sized to read. Each painting has
its own wall: on reward at 1280 hang them above the card row beside the
windows (or drop them), never in the gutter against the trays; on gameover
undo the regression -- the pictures on visible cords from the cornice with the
plate under the frame, the Dowager whole and not shrunk to a sliver. Keep
`ui/hang.js fitHung`'s rule that nothing covers a nameplate, and check event
and rest too (they share the hang): no plate over a canvas, no sconce over a
plate.

### 4. THE MAP'S REGIONS AS DRAWN SHAPES — both

No rectangle. Each region its own irregular hand-drawn boundary following the
rooms it marks (a wobbled pen line, a pencil wash, hatching or stipple
inside), labelled on the paper -- never a box with a dashed line and corner
marks.

### 5. THE RUN STRIP AND THE SHOP

- **hud-late:** the Keepsakes and Gear legible as distinct objects at 1280 --
  more than three each visible (or a clear "+7" / "+5" count), each at 28 px+
  with a rim or tint that tells them apart; the bare figures labelled.
- **shop:** the Keepsake and Snack rows as objects on a shelf -- a nameplate
  under each bell or jar, the price on a hung tag -- not full-width gold
  bars; the cards with air between them (or five Tricks, FORGETTING moved
  onto the centre plaque); rules text 12 px+.

## WHO OWNS WHAT THIS ROUND

**Yours:** `scenes/shop.*`, `scenes/gameover.*`, `scenes/reward.*`,
`scenes/event.*` and `scenes/rest.*` (their paintings' placement only),
`scenes/map.*` / `ui/mapnode.js`, `ui/hand.*` (the fan), `ui/hud.*` (the run
strip), `ui/hang.js` and the `.kit-hang` sections of `kit.css`, `ui/card.*`
for the rules text's SIZE only, `ui/enemy.js` for the effect medallions'
placement only, `kit.css` / `tokens.css` by APPENDING.

**Not yours:** `fx/*` (the rooms), `core/renderer.js` (keep its render-scale
governor: Josh's standing rule), the card's face design, the fighters' art
and placement (round 32's floor line), the paintings' art, gameplay,
`game/src/data`, `state`, `combat`. Do not edit tests to make them pass.

## TESTING, TRAPS, DELIVERABLES

- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: `tests/chrome`, `tests/steam-deck`, `tests/gamepad`,
  `tests/hand-cards`, `tests/card-face`, `tests/cards-feel`, `tests/map`,
  `tests/backpack`, `tests/gameover-keeps`, `tests/combat-scene/seam.py`,
  `tests/scene-css`, `tests/css-tokens`, `tests/seams`.
- The painting boards hang at random: every capture of reward and gameover
  passes `--hash pics=1`, and CHECK the hang with every painting of each pool
  in each slot at both sizes (round 36's `shots/hangprobe.js` idea), not only
  the one `pics=1` shows.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works. Stop ONLY the processes you started, BY PID.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. **Say in
  your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 600 python tools/shot.py CODE-shop         --port PORT --scene shop     --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-combat-crowd --port PORT --scene combat   --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
cd "WT" && timeout 600 python tools/shot.py CODE-gameover     --port PORT --scene gameover --seed 7 --companion bones --kid maya --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-hud-late     --port PORT --scene map      --seed 7 --companion bones --kid maya --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-map          --port PORT --scene map      --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-reward       --port PORT --scene reward   --seed 7 --companion bones --kid maya --wait 3 --hash pics=1
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size).
Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
