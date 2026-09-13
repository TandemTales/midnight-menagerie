# Midnight Menagerie UI pass — round 4 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**: the kit it describes is still the
language, extended by rounds 1 to 3. Nothing else in those two files is an
instruction for this round. Then read this file, which wins wherever they
disagree.

## Where the game is

| screen | who built it | judged in its last round (mean overall, 0–10) |
|---|---|---|
| Shop, Reward, Curiosity, Map, Safe Room, Game Over | ONYX, round 3 POLISH | 6.3 / 6.7 / 6.7 / 6.0 / 7.0 / 6.7 |
| Combat: a Scuffle, a boss, a boss with a full hand | TOPAZ, round 3 COMBAT | 7.0 |
| The opening's story, Settings, the pile viewer | UMBER, round 3 DIALOGS | 6.8 / 5.7 / 7.2 |
| Lobby | GROVE, round 2 | 6.8 |
| Clubhouse, Atlas | IVORY, round 2 | 7.0 / 7.0 |
| The confirm dialog, the coach, the handoff veil, toasts | UMBER's frame reaches every Modal; the rest is web chrome | — |
| Title, Companion Select, Kid Select, the opening's Kid picker | ARE Josh's paintings | — |

Four tracks build this round: POLISH, COMBAT, DIALOGS and KIDS' PLACES.

## What the kit gained in round 3

Read `game/src/ui/kit.css`'s sections.

- **ONYX (POLISH) changed the shared primitives.**
  - The new "PAINTED SURFACES" section: `.kit-mat` with its `--enamel`,
    `--suede`, `--flock`, `--walnut` and `--curtain` materials, plus
    `.kit-ledge`, `.kit-plaque`, `.kit-price`, `.kit-num`, `.kit-flag` and
    `.kit-stats--framed`.
  - `.kit-panel` stands on lit suede.
  - `.kit-btn` and `.kit-plate` use `plate-lit.webp`.
  - The `.kit-cards` rules panel is lit aubergine enamel.
  - The room ground is BRAID's painted room.
  - `tools/prep_ui_surfaces.py` and `tools/prep_ui_paint.py` render all of it.
- **TOPAZ (COMBAT) rebuilt its own pieces.**
  - `.kit-tube` is enamel under the `gauge.webp` brass housing, and a cost is
    struck on `coin-face.webp`.
  - `Hand#setBounds` fits a fan into a measured band.
- **UMBER (DIALOGS) put the kit on every Modal.** It did this through
  `ui/modal.js`: a `.kit-panel--damask` dialog, a compact titleblock and a
  medallion close. It exports `kitButton()` and `DIALOG_GLYPH`, and
  `frame: false` opts a modal out.

## Branches you may read for their ideas

Read them with `git show <branch>:<path>`.

- `ui/r3-polish-a` (MINT) and `ui/r3-polish-c` (PEARL): the Shop with Mr. Moth at
  the shelf's left end and Forgetting as a sixth card, a three-line drop cap, map
  names on small cartouches beside their rooms, gold coin prices, a star-capped
  shelf rail, a gold-rimmed stat rail on Game Over.
- `662d874`, round 3's starting point: the Reward's plates and CHOOSE ONE TRICK as
  one row, and soft painted washes for the map's zones.
- `ui/r3-combat-a` (QUILL): the boss plate's fleur finial rising toward his feet;
  DISCARD on a wrought-iron bracket with its candle standing on it.
- `ui/r3-combat-b` (SLATE): the boss plate as a winged gold ribbon cartouche with a
  crest; round enamel condition medallions; painted moon-crest card backs for the
  piles; a heavier Nerve coin.
- `ui/r3-dialogs-c` (YARROW): the three-column Settings that fits every section at
  1280x800; CLOSE with a round X medallion that matches DONE's check; a larger
  portrait frame with an arched nameplate.
- `ui/r3-dialogs-b` (WILLOW): gold corner brackets and a dripping candle on a
  dialog; a ribbon bookmark; dotted leaders from each label to its control.
- `ui/r2-expand2-a` (GROVE): the clubhouse's aubergine damask room, torn-paper
  clippings; `ui/r2-expand2-b` (HAZE): lanterns, the hanging lamp over the cork
  board, pinned parchment notes; `ui/r2-expand2-c` (IVORY's lobby): keyboard focus
  that survives a wire repaint.

## Who owns what this round

Four tracks build at once from the same commit, and all four winners are merged.

- **POLISH owns the shared pieces:**
  - every `kit.css` component above "READINGS IN METAL", PAINTED SURFACES
    included;
  - `tokens.css`, `hud.css`/`hud.js`, the tooltip, the room shell (`reward.js`),
    `ui/backdrop.js` and `ui/kitboard.js`;
  - the six boards' scene files.
- **COMBAT owns:**
  - `scenes/combat.css` and `scenes/combat.js`;
  - `ui/card.css`, `ui/card.js`, `ui/hand.css`, `ui/hand.js` and `ui/intent.js`;
  - the presentation in `ui/enemy.js`;
  - kit.css's "READINGS IN METAL" section.
- **DIALOGS owns:**
  - `ui/modal.css`, `ui/settings.css` and `ui/deckview.css`, with the markup in
    `ui/modal.js`, `ui/settings.js` and `ui/deckview.js`;
  - `scenes/tutorial.css` and the story beats in `scenes/tutorial.js`;
  - `.kit-field`, `.kit-select` and `.kit-select-wrap` in IVORY's section.
- **KIDS' PLACES owns:**
  - `scenes/lobby.*`, `scenes/clubhouse.*` and `scenes/atlas.*`;
  - every other component in kit.css's "CONTROLS AND THE KIDS' PLACES" section.
- **Only POLISH edits a POLISH component.** New components go in a section
  APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`. New tokens are
  appended to the end of the `--kit-*` block. Change a look with a modifier class,
  never by editing the original.
- **Lay out through your own classes.** A scene sheet that sets `position`,
  `display`, `left` and the like on a selector naming a shared `.kit-*` class
  turns `tests/scene-css` red, even when the rule is scoped. Put the layout on
  your scene's own class.
- **Nobody edits** `ui/coach.*`, `ui/handoff.*` or the achievement toast.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." Every judge in every round has held the grounds near 5 or 6, winner or
not, because they are renders. Josh is painting the backgrounds
(`docs/art/background-prompts.md`), so keep every painting slot working. What
you can move: empty flanks and voids, flat fills, controls that read as web UI,
and anything that clips at 1280x800.

## POLISH — the six boards

Every item is a round-3 judge's words about ONYX's screens, or a graft they asked
for.

Shop:
1. **Mr. Moth and Forgetting move onto the shelf.** Mr. Moth's portrait medallion
   and name cartouche stand at the left end of the curtain tray. Forgetting is a
   framed sixth card on the table (MINT's and PEARL's), so the shelf holds every
   purchase and the centre counter keeps only the quote and the tallies.
2. **The cards grow** into the curtain tray until its flanks stop being empty. At
   both sizes the TRICKS ribbon stays clear of the location line.
3. **Every price** is a coin glyph with a large numeral beside a round purple enamel
   BUY medallion (MINT's, PEARL's), on the shelf and in the lists alike.

Reward:
4. **The choice sits centred** under the banner: the glossary tablet no longer
   pushes the three cards off centre, and the stage's right third is not an empty
   wall.
5. **+18 BUTTONS, CHOOSE ONE TRICK and +3 LUCK** become one row of plates on the
   frame's top rule (`662d874`'s), and the space saved goes to bigger cards.
6. **The card bodies** have no empty lower half: the rules panel fits its text, or
   the text grows into it. The rarity plates stand on a star-capped shelf rail with
   inset panels (PEARL's).

Curiosity:
7. **The opening** is a true three-line illuminated drop cap with the paragraph
   wrapping round it (PEARL's). The words after the initial are spaced engraved
   small caps (MINT's), in the body's size: never a bigger lead sentence beside
   smaller body text.

Map:
8. **Entrance names** on small cartouches set right beside their rooms (PEARL's),
   or on leaders that never cross a route.
9. **The zones** are soft painted washes (`662d874`'s), not dashed hatched boxes
   that read as selection rectangles, with every label kept off the nodes.
10. **The plan is inked:** glyphs and routes gain weight and a little wobble, and
    the paper takes the room's candlelight and edge falloff, so nothing reads as a
    diagram tool.

Safe Room:
11. **The fort's frame** lines up with the option column's top and bottom, with no
    dead band above or below it.
12. **The options:** titles a size larger on wider plaques (PEARL's), values on
    filled plates instead of flat pills, and at 1280 STANDALONE PREVIEW clears PACK
    UP AND GO ON.

Game Over:
13. **The ledger** no longer crams the title, Courage, reached, seed, 21 tricks and
    the keepsakes into one tall column. Share them across the board, so the centre
    under the Worked Hardest card holds something.
14. **The Worked Hardest pedestal** stands on a floor or shelf, and its caption sits
    on something, not in the void.
15. **The left column's** three small boxes of tight bullets get air, or become one
    panel.
16. **The stat rail** is a gold-rimmed plate with medallions (MINT's), not a plain
    strip.

## COMBAT — the fight, and the fight when it is full

The same three boards as round 3. Round 3's merge already gave the hand POLISH's
enamel rules panels: look at the hand as it is now, beside the Shop's cards.

1. **The boss:** THE BUTLER's plate is a winged gold ribbon cartouche with pointed
   star-tipped terminals and a small crest (SLATE's), and a fleur finial rises
   toward his feet (QUILL's). He reads grander than any Scuffle creature at a glance.
2. **Conditions** are round enamel medallions (SLATE's), on the boss and on your
   side alike, never small square tiles. On a creature they sit beside its Courage
   gauge rather than under it (QUILL's), keeping the space above a full hand clear.
3. **Nerve** is a larger engraved coin with heavier scrollwork and a high-contrast
   numeral (SLATE's) that reads at 1280x800.
4. **DRAW and DISCARD** are painted moon-crest card backs in gilded sockets
   (SLATE's). DISCARD stands on a wrought-iron wall bracket with its candle on it
   (QUILL's), not floating.
5. **The hand's rules panels** carry texture and an inner rule. On the crowded board
   no type line is clipped: "SKILL · SEL" is a failure.
6. **Everything else TOPAZ fixed stays fixed:** a full hand never covers the Kid's
   panel, the piles or END TURN.

Tests drive this screen hard: `tests/combat-scene`, `card-face`, `cards-feel`,
`piles-reachable`, `gamepad`, `settings-play`, `playthrough3`, `coop`,
`kid-clips`, `enemy-stills`, `sprites`, `steam-deck`, `chrome`. Grep `tests/`
before changing a selector, and keep 60 fps with the full hand.

## DIALOGS — what opens over the game

UMBER's frame won: the lavender engraved title cartouche with its scroll crest,
the moon medallion on the rails, and the rosette round GO ON. Keep that language
and fix what all three judges named.

1. **Settings fits.** At 1280x800 and 1600x900 every section is on the board with
   nothing clipped, Seed and Danger included, and the footer sits inside the frame.
   Use YARROW's three columns, each section its own filigree-cornered panel, inside
   UMBER's frame. Labels and descriptions stay clear of the panel rules. Drop the
   ON/OFF cartouche that repeats each toggle's state.
2. **The opening's drop cap** is an engraved lavender initial that belongs to its
   word, not a boxed square with a gap before "rbit". The portrait's frame is larger,
   with an arched gold-rimmed nameplate (YARROW's), and the lit room stays visible
   between the portrait and the page.
3. **CLOSE and DONE** sit inside the frame, clear of the dimmed HUD beneath. Each has
   a round medallion: an X for CLOSE, a check for DONE (YARROW's).
4. **A disabled CLEAR** still reads as a control, only quieter.
5. **The card tray** gets damask or candlelight instead of a flat near-black
   rectangle. A low-contrast tufted band in the frame border is allowed (WILLOW's).
6. **Props on the dialogs:** gold corner brackets, a lit dripping candle on the
   lower-right corner, and dotted leaders from each Settings label to its control
   (WILLOW's). All of it stays in the aubergine palette, never sepia parchment or
   orange.

Tests that drive these screens: `tests/settings-play`, `piles-reachable`,
`gamepad`, `coop/matedeck`, `chrome` and `steam-deck`, plus whatever
`grep -rlE "mm-modal|deckview|settings|tut-" tests/` finds.

## KIDS' PLACES — the Lobby, the Clubhouse, the Atlas

Every item is a round-2 judge's words. The lobby was GROVE's, the clubhouse and
atlas IVORY's. This track merges screen by screen.

Lobby:
1. **The raw seed number goes.** "DRAWS THE HOUSE 432154269" becomes a small
   engraved footnote or glyph, or is removed, so the password plate is the panel's
   one focal point.
2. **The empty upper wall** gets paint: damask, sconce light pools, a cobweb. HAZE's
   lanterns may flank the password panel, with the explanation on a pinned
   parchment slip.
3. **At 1280,** CLIMB UP's italic line clears ENTER, the stray gilt fragment right
   of the moon medallion goes, and the skull and books clear the frame corner.
4. **Keyboard focus survives a wire repaint** in the joined room (IVORY's
   `_paintRoom`, `ui/r2-expand2-c`). Check it with `tests/coop/lobby.py`.

Clubhouse:
5. **The wall** is aubergine damask over dark wainscot, with purple scrollwork side
   borders (GROVE's room), not brown planks: warm light pooled on it, and corner
   candles and cobwebs.
6. **The string lights** glow candle-amber and lavender: no saturated primaries.
7. **The cork board:**
   - a real gilt or carved frame with corner mounts;
   - HAZE's hanging lamp throwing a warm pool on the top photographs;
   - the dead lower-left cork filled;
   - torn red-paper clippings for "too many pets. same house." (GROVE's).
8. **PLAN THE EXPEDITION** at 1280: one size with more tracking, and a subtitle clear
   of the arrow medallion. The right column below HAUNT LEVEL is dressed, not a dead
   gap.

Atlas:
9. **The parchment** is candlelit, with edge darkening, foxing, a fold shadow and a
   slight curl.
10. **The side panel's nameplate** is a gold-rimmed cartouche, not a glossy black
    lozenge. The title gets room, the italic subtitle sits beneath it, and
    Marmalade's portrait stays the focus.
11. **The floor band and header:** dressing beside the panel (skull on books,
    candle), "1 OF 17 WINGS SURVEYED" aligned with BACK and clear of the candle,
    and warm candlelight on the wall behind.

## Testing your branch

Every test under `tests/` hard-codes `:8777`, which is the MAIN checkout's server.
A test run from `WT` as its docstring says drives `dev`, not your branch, and
passes whatever you changed. With your own server up, run it through the wrapper,
which swaps the port in memory and changes nothing on disk:
```
cd "WT" && python tools/on_port.py PORT tests/combat-scene/seam.py
```
A test run any other way has tested nothing of yours. `python tests/scene-css/check.py`
and `python tests/css-tokens/check.py` are static: run them before you finish.

## Deliverables

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

POLISH: `shop`, `reward`, `event`, `map`, `rest`, `gameover`
```
cd "WT" && python tools/shot.py CODE-<screen> --port PORT --scene <screen> --seed 7 --companion bones --kid maya --wait 3
```
COMBAT: `combat`, `combat-boss`, `combat-crowd`
```
cd "WT" && python tools/shot.py CODE-combat       --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss  --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
```
DIALOGS: `opening`, `settings`, `piles`
```
cd "WT" && python tools/shot.py CODE-opening  --port PORT --scene tutorial --seed 7 --kid maya --wait 4
cd "WT" && python tools/shot.py CODE-settings --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && python tools/shot.py CODE-piles    --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
```
KIDS' PLACES: `lobby`, `clubhouse`, `atlas`
```
cd "WT" && python tools/shot.py CODE-<screen> --port PORT --scene <screen> --seed 7 --companion bones --kid maya --wait 3
```

Before you finish, photograph at least two screens OUTSIDE your track on your
port and look at them. Stop your dev server when you are done.
