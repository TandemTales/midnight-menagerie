# Midnight Menagerie UI pass — round 5 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**: the kit it describes is still the
language, extended by rounds 1 to 4. Nothing else in those two files is an
instruction for this round. Then read this file, which wins wherever they
disagree.

## Where the game is

| screen | who built it | judged in round 4 (mean overall, 0–10) |
|---|---|---|
| Shop, Reward, Curiosity, Map, Safe Room, Game Over | ACORN, round 4 POLISH | 7.0 / 7.3 / 7.3 / 7.2 / 7.2 / 6.0 |
| Combat: a Scuffle, a boss, a boss with a full hand | FLINT, round 4 COMBAT | 7.0 / 8.0 / 7.0 |
| The opening's story, Settings, the pile viewer | KESTREL, round 4 DIALOGS | 7.0 / 7.0 / 7.0 |
| Lobby | NUTMEG, round 4 KIDS' PLACES | 7.2 |
| Clubhouse | OCHRE, round 4 KIDS' PLACES | 7.2 |
| Atlas | MARL, round 4 KIDS' PLACES | 7.2 |
| The coach, the handoff veil, toasts | web chrome | — |
| Title, Companion Select, Kid Select, the opening's Kid picker | ARE Josh's paintings | — |

Four tracks build this round, as in round 4: POLISH, COMBAT, DIALOGS and KIDS' PLACES.

## What the kit gained in round 4

Read `game/src/ui/kit.css`'s sections, in file order.

- **ACORN (POLISH):**
  - `.kit-price` rebuilt: a coin in a studded setting over the plate, and an enamel
    BUY medallion.
  - Two new sections: `.kit-shelf-rail`, a star-capped carved rail
    (`tools/prep_ui_rail.py`), and `.kit-stats--plate`.
  - The map glyphs are overdrawn in `ui/mapnode.js`.
- **FLINT (COMBAT):**
  - "A CONDITION, ROUND" (`.kit-roundel`).
  - The boss regalia: a winged plate, a crest, a mirror alcove and a moon beam
    (`tools/prep_combat_regalia.py`).
  - Painted card-back piles on an iron bracket, and a keycap on END TURN.
- **KESTREL (DIALOGS):**
  - "OBJECTS IN THE HOUSE": `.kit-bracket`, `.kit-liner`, `.kit-bookmark`,
    `.kit-plate--arch` and `.kit-leader` (`tools/prep_ui_house.py`).
  - Every framed Modal gets a dressing layer and a velvet liner.
- **KIDS' PLACES:**
  - OCHRE's section: `.kit-carved`, `.kit-lamp`, `.kit-clipping` and
    `.kit-bulbs--candle`.
  - NUTMEG's Lobby pieces: `.kit-ground--treehouse`, `.kit-lantern`, `.kit-charm`
    and `.kit-sill`.

## Branches you may read for their ideas

Read them with `git show <branch>:<path>`.

- **POLISH:**
  - `ui/r4-polish-b` (BASALT): Mr. Moth in a large arched portrait frame with a
    moon crest, a paw medallion and a "keeper of lost things" cartouche at the head
    of the shelf; the Shop's tallies as ring medallions under a MR. MOTH rule; the
    fort's nameplate cartouche.
  - `ui/r4-polish-c` (CEDAR): Game Over's triptych, with the Worked Hardest card
    centred on a pedestal between a HOW FAR plaque and a quote plate; a stat
    ribbon with an engraved icon per stat; wall sconces over wainscot on the
    Reward; brass bosses capping the shelf rail; the large gilded drop cap; the
    map's watercolour-stain zones.
  - `c7d31db`, round 4's starting point: skull, books and candle still lifes at the
    Shop shelf's ends, and a wider landscape fort diorama.
- **COMBAT:**
  - `ui/r4-combat-c` (GARNET): DRAW and DISCARD as gold-framed card-back decks with
    a crescent and a count coin, DISCARD on its bracket; a glass hourglass with
    visible sand in END TURN; the larger milled Nerve coin; a crescent medallion
    crest for the boss plate.
  - `ui/r4-combat-a` (EBONY): a Nerve medallion with scroll wings and a clean ring,
    legible at 1280.
- **DIALOGS:**
  - `ui/r4-dialogs-a` (INDIGO): gilt value cartouches beside the sliders, an
    embossed damask tray, a larger portrait on the opening.
  - `ui/r4-dialogs-b` (JASPER): a star marking the chosen palette, a gold check in
    an ON toggle's knob, a warning glyph on RESET, a paw medallion on the footer
    rule, a star capping the portrait's nameplate, a fleuron divider over the
    story.
- **KIDS' PLACES:**
  - `ui/r4-kids-a` (MARL): the prop shelf (skull, lantern, candle) above PLAN THE
    EXPEDITION; purple enamel corner studs on the board's frame; the House's
    photograph pinned at the board's lower left; a rotated red-pinned note on the
    lobby.
  - `ui/r4-kids-b` (NUTMEG): the PETS VANISH newspaper clipping; the treehouse
    timber, shelf and hanging stars.
  - `ui/r4-kids-c` (OCHRE): the map mounted on a dark purple mat; props on the floor
    below the atlas panel; string lights across the treehouse top.
  - `c7d31db`: the DRAWS THE HOUSE seed in its own small gold plaque.

## Who owns what this round

Four tracks build at once from the same commit, and all four winners are merged.

- **POLISH owns:**
  - every `kit.css` component above "READINGS IN METAL", and its own appended
    "shelf rail" and "stat plate" sections;
  - `tokens.css`, `hud.css`/`hud.js`, the tooltip, the room shell (`reward.js`),
    `ui/backdrop.js`, `ui/kitboard.js` and `ui/mapnode.js`;
  - the six boards' scene files.
- **COMBAT owns:**
  - `scenes/combat.css` and `scenes/combat.js`;
  - `ui/card.css`, `ui/card.js`, `ui/hand.css`, `ui/hand.js` and `ui/intent.js`;
  - the presentation in `ui/enemy.js`;
  - kit.css's "READINGS IN METAL" and "A CONDITION, ROUND" sections.
- **DIALOGS owns:**
  - `ui/modal.css`, `ui/settings.css` and `ui/deckview.css`, with their `.js`
    markup;
  - `scenes/tutorial.css` and the story beats in `scenes/tutorial.js`;
  - `.kit-field`, `.kit-select` and `.kit-select-wrap`, and the "OBJECTS IN THE
    HOUSE" section.
- **KIDS' PLACES owns:**
  - `scenes/lobby.*`, `scenes/clubhouse.*` and `scenes/atlas.*`;
  - the rest of "CONTROLS AND THE KIDS' PLACES", and both round-4 KIDS' PLACES
    sections.
- **Changes to another track's component:** new components go in a section
  APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`. New tokens are
  appended to the end of the `--kit-*` block. Change another track's component with
  a modifier class, never by editing it.
- **Lay out through your own classes.** A scene sheet that sets `position`,
  `display`, `left` and the like on a selector naming a shared `.kit-*` class turns
  `tests/scene-css` red, even when the rule is scoped.
- **Never reuse a name.** Before you add a class or an asset, grep `game/src` and
  `game/assets` for it. Round 4 had three builders paint three different
  `lamp.webp` and define `.kit-bulbs--candle` three ways.
- **Nobody edits** `ui/coach.*`, `ui/handoff.*` or the achievement toast.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." Every judge holds the rendered grounds at 3 to 7, because they are
renders. Josh is painting the backgrounds (`docs/art/background-prompts.md`), so
keep every painting slot working. What you can move: focal points, flat fills,
controls that read as web UI, and anything that crowds or clips at 1280x800.

## POLISH — the six boards

Every item is a round-4 judge's words about ACORN's screens, or a graft they asked
for.

Shop:
1. **Mr. Moth is the Shop's focal point.** A large arched portrait frame with a moon
   crest, a paw medallion and a "keeper of lost things" cartouche stands at the head
   of the shelf (BASALT's), not a small round medallion.
2. **The centre counter** has ornament: the tallies become ring medallions under a
   MR. MOTH attribution rule (BASALT's), and the quote no longer sits on empty
   ground.
3. **The shelf's ends** carry a still life of skull, books and candle
   (`c7d31db`'s), and brass bosses cap the rail (CEDAR's).

Reward:
4. **The room behind the cards:** wall sconces with candles either side, over
   wainscot panelling (CEDAR's), and a candlelit rim on the centre card, so the
   hall is lit rather than a dark wash.
5. **+18 BUTTONS, +3 LUCK and the UNCOMMON/COMMON plates** become ribbons and
   cartouches, not thin pill outlines.

Curiosity:
6. **The choice rows** are carved plates or register pages, not flat purple bars
   with thin rules.
7. **The opening** is a large gilded illuminated initial (CEDAR's). Its small-caps
   lead-in is a few words, not a whole shouting line, and the text is ragged-right
   with no hyphenated justification.

Map:
8. **The zones** are watercolour stains that register (CEDAR's): not pale, and not
   flat rectangles with rounded corners.
9. **The room-name tags** are cartouches, not small dark pills that read as
   tooltips.

Safe Room:
10. **The diorama** is a wider landscape frame, so the fort is not small in the
    bottom third under an empty wall (`c7d31db`'s). A nameplate cartouche names the
    scene: THE BLANKET FORT, with "Maya and Bones, until morning" as its epithet
    (BASALT's). At 1280 every description keeps to one or two lines.

Game Over:
11. **The centre column is a triptych:** the Worked Hardest card centred on its
    pedestal, flanked by a framed HOW FAR plaque with a large numeral and a framed
    quote plate (CEDAR's). It needs one focal point, not a pile-up.
12. **The stat ribbon** carries a small engraved icon beside each stat (CEDAR's).

The HUD (every board and every fight):
13. **The top strip** is cartouches, not web pills. The combat judges named it: a
    flat red Courage capsule, three empty outline circles and loose italic "No
    Keepsakes yet". Empty Keepsake sockets become filigree sockets, and the
    Courage readout sits on a plate.

## COMBAT — the fight, and the fight when it is full

Both judges' words about FLINT's boards. FLINT's boss board scored 8: keep the
mirror, the plate and the light.

1. **DRAW and DISCARD** are decks on the table: gold-framed card backs with a
   crescent and a count coin, DISCARD standing on its bracket beside the candle
   (GARNET's). Not tiny round badges.
2. **END TURN's medallion** holds a glass hourglass with visible sand (GARNET's).
3. **Nerve** is a larger milled coin with a big high-contrast numeral in a clean
   ring (GARNET's coin, EBONY's clean scroll wings), legible at 1280, with its plate
   clear of the bottom frame rule.
4. **The Kid's conditions** stand on a plate or rod, not floating on the bare wall
   under the Courage gauge.
5. **The boss's mirror** reads as a painted mirror, not a see-through wash round a
   pasted figure. The Guard shield no longer collides with the mirror's crest. The
   Butler's flame clears the frame's upper-left rail. The plate's crest is a
   crescent medallion (GARNET's).
6. **The crowded fan:** no card's type line or title plate is cut by the next card,
   and the rules text reads at 1280x800. Rearrange the overlap however you must:
   rise, tighten, tilt or lift the hovered one. The fan still never covers the
   Kid's panel, the piles or END TURN.

The HUD strip is POLISH's this round. Tests drive this screen hard:
`tests/combat-scene`, `card-face`, `cards-feel`, `piles-reachable`, `gamepad`,
`settings-play`, `playthrough3`, `coop`, `kid-clips`, `enemy-stills`, `sprites`,
`steam-deck` and `chrome`. Grep `tests/` before changing a selector, and keep
60 fps with the full hand.

## DIALOGS — what opens over the game

Both judges' words about KESTREL's dialogs. Keep the frame, the guards, the
candle and the three Settings columns that fit.

1. **Settings reads as a painted ledger, not a tidy form.**
   - Each section panel differs in its heading and dressing, not six identical
     thin-ruled boxes.
   - The descriptions run the panel's width, with no dead right half.
2. **Settings states are explicit.**
   - Gilt value cartouches sit beside the sliders (INDIGO's).
   - ON and OFF are lettered beside each toggle, and a gold check sits in an ON
     knob (JASPER's). Round 4's brief asked for the ON/OFF labels to go; the judges
     want state that does not rest on the knob's position alone.
   - A star marks the chosen palette (JASPER's).
   - A warning glyph goes on RESET, and a paw medallion sits on the footer rule
     (JASPER's).
3. **The pile viewer's filters** are kit plates and nameplates with brass chevrons,
   not web select pills with small triangles.
4. **The pile viewer's tray** stages its cards: embossed damask relief (INDIGO's),
   and cards large enough that the row has weight, instead of five small cards
   floating with half-empty text boxes.
5. **The opening:**
   - The bookmark ribbon is a painted silk ribbon that belongs to the page, or it
     goes.
   - The portrait card is larger (INDIGO's), and a star caps its nameplate
     (JASPER's).
   - A fleuron divider sits over the story (JASPER's).
   - The lit room stays visible, and the bottom third is dressed rather than an
     empty blur.

## KIDS' PLACES — the Lobby, the Clubhouse, the Atlas

Round 4's three judges' words about the winning screens. This track merges screen
by screen.

Lobby (NUTMEG's):
1. **The seed** sits in its own small gold plaque (`c7d31db`'s), legible at 1280,
   not a tiny low-contrast italic line.
2. **The treehouse is painted timber:** beams and the shelf plank get grain and
   candle falloff, not flat evenly lit brown strips, with plank walls, a window and
   bark behind the framed panels.
3. **Warm and lavender string lights** run along the beams (OCHRE's).

Clubhouse (OCHRE's):
4. **The HEADQUARTERS title** outweighs the board again.
5. **The right column below HAUNT LEVEL** is dressed: the prop shelf with skull,
   lantern and candle above PLAN THE EXPEDITION (MARL's), standing on the lobby's
   plank shelf (NUTMEG's). No lone tiny sconce floating in a void.
6. **The board's lower half comes alive as a collage:**
   - the PETS VANISH clipping (NUTMEG's), never covering a "Not found yet" card;
   - the House's photograph pinned at the lower left, and purple enamel studs at the
     frame's corners (MARL's).
7. **The wall behind the board is seen:** a warm plank wall tinted toward aubergine,
   as a texture behind the purple scrollwork (`c7d31db`'s idea), sharing the lobby's
   timber so the two kids' places match.

Atlas (MARL's):
8. **The footer caption** "THE MANSION — RECOVERED FLOOR PLAN" stays legible: the
   ageing and the fold line keep out of it.
9. **The skull and candle** stand on the floor below the side panel, not on its
   corners (OCHRE's), and the plan sits on a dark purple mat inside its frame
   (OCHRE's).
10. **The wall round the map and panel** takes candlelight, not an unlit near-black
    ground.

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
