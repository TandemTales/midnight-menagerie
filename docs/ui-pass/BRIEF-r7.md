# Midnight Menagerie UI pass — round 7 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**: the kit it describes is still the
language, extended by rounds 1 to 6. Nothing else in those two files is an
instruction for this round. Then read this file, which wins wherever they
disagree.

## Two tracks this round: DIALOGS and KIDS' PLACES

Round 6 ran POLISH and COMBAT. **Round 7 runs the other two** — the six screens
that have not been touched since round 5, and whose fix lists have been sitting
unspent since then.

**The files POLISH and COMBAT own are nobody's this round.** Do not edit
`hud.css`/`hud.js`, `tokens.css`, `ui/backdrop.js`, `ui/kitboard.js`,
`ui/mapnode.js`, the six boards' scene files, `scenes/combat.*`, `ui/card.*`,
`ui/hand.*`, `ui/intent.js` or `ui/enemy.js`. If a change of yours lands on one
of their screens, photograph it and make sure it still reads.

**Why POLISH is not running.** Round 6's POLISH track converged: the baseline
tied for first (6.83, level with the merged winner, above the ranking tiebreak's
own pick), and three judges named three different winners. There is nothing left
to refine there until the backgrounds are paintings. Your tracks still have
headroom — DIALOGS gained +1.33 in round 5 and KIDS' PLACES +1.00 — which is why
they are the round.

## Where the game is

| screen | who built it | judged in round 5 (mean overall, 0–10) |
|---|---|---|
| The opening's story, Settings, the pile viewer | BIRCH, round 5 DIALOGS | 7.25 / 7.0 / 7.0 |
| Lobby, Atlas | GORSE, round 5 KIDS' PLACES | 6.83 / 6.83 |
| Clubhouse | ELDER, round 5 KIDS' PLACES | 6.83 |
| Shop, Reward, Curiosity, Map, Safe Room, Game Over | ROWAN, round 6 POLISH | — |
| Combat: a Scuffle, a boss, a boss with a full hand | CAMPION, round 6 COMBAT | 7.50 / 7.50 / 7.0 |
| The coach, the handoff veil, toasts | web chrome | — |
| Title, Companion Select, Kid Select, the opening's Kid picker | ARE Josh's paintings | — |

**The HUD strip changed under you in round 6** and it is on every screen you
photograph except the opening. It is now one carved rail with the readouts set
into it, not a row of chips. It is POLISH's and you do not touch it, but your
Settings capture is taken over the Map, so it will be in frame.

## What the kit gained in rounds 5 and 6

Read `game/src/ui/kit.css`'s sections, in file order.

- **BIRCH (round 5 DIALOGS)** — yours to build on:
  - `.kit-field:focus-visible` and `.kit-select:focus-visible` reordered so the
    gilt edge draws before the shadow, with a candle, and
    `.kit-select-wrap:has(> .kit-select:focus-visible)` lighting the plate's
    engraved label.
  - `.kit-select-wrap::after`: a cast-brass gilt chevron in a round enamel button
    at the plate's end, sized from `--field-h`.
  - An appended section, "A LEDGER AND A TRICK CASE", with `.kit-crest`, a round
    enamel medallion whose glyph is a mask url.
- **GORSE and ELDER (round 5 KIDS' PLACES)** — yours:
  - GORSE's "THE KIDS' PLACES, TIMBER" section: `.kit-ground--treeroom` and
    `.kit-ground--clapboard` (+`__warm`/`__moon`), `.kit-sill--grain`,
    `.kit-bulbs--festoon`, `.kit-lantern--standing`, `.kit-newscutting`.
  - ELDER's additions to the same section: `.kit-stud`, `.kit-plank`
    (+`--ends`), `.kit-newsclip`, `.kit-ground--hideout`, `.kit-trunk`,
    `.kit-casement` (+`--moon`), `.kit-corbel`, `.kit-prop--tracing`.
  - **Two builders wrote two timber vocabularies into one section.** Before you
    add a third plank or a third wall, read what is already there and use it.
- **ROWAN (round 6 POLISH), not yours but under you:** `hud.css` is rebuilt as
  one carved rail; `tokens.css` gained `--kit-ink-oxblood`, `--kit-ink-green`,
  `--kit-ink-violet`, `--kit-ink-rule`; `tools/prep_ui_focal.py` builds the Shop's
  Moth portrait and a rosette.
- **CAMPION (round 6 COMBAT), not yours:** the boss mirror's dark glaze, painted
  pile card backs, the Nerve scrollwork and the hourglass, all in
  `tools/prep_combat_table.py`.

## Branches you may read for their ideas

Read them with `git show <branch>:<path>`.

- **DIALOGS:**
  - `ui/r5-dialogs-a` (ALDER): the opening staged on a painted cobblestone floor
    with a small lit brass lantern beside the candle; small gold cartouche tags
    naming each pile filter (TYPE, COST, RARITY) sitting on top of its dropdown;
    a red wax seal on the DANGER panel and a moon medallion under EXPEDITION.
  - `ui/r5-dialogs-c` (CLOVE): the opening's progress track as star glyphs on a
    gold rule with the current page a bright eight-point star; a fast-forward
    medallion end-cap on SKIP; DANGER as a crimson ribbon header with a warning
    glyph and a skull medallion flanking RESET; round medallion search and chevron
    caps on the pile filters.
  - `ui/r5-dialogs-d`? — there is none; `DRIFT` was the baseline. Its one idea the
    judges wanted is a purple bookmark ribbon hanging from the story panel's lower
    edge, which you can build fresh.
- **KIDS' PLACES:**
  - `ui/r5-kids-b` (FINCH): seeing the mansion through a treehouse window. Both
    judges wanted the idea and neither wanted FINCH's execution — it laid mullions
    OVER the gilt-framed house portrait. Paint a separate window beside the frame.
  - `ui/r5-kids-a` (ELDER): the standalone gold-ribbon DRAWS THE HOUSE number
    cartouche, separate from the password field; the pinned, tilted quote card on
    the clubhouse shelf.
  - `ui/r5-kids-c` (GORSE): the captioned house polaroid ("The House, where they
    all went") and the "eight gone this year" subhead on the PETS VANISH clipping;
    the rolled scroll with a red wax seal beside the skull on the atlas floor.
  - `ui/r4-kids-b` (NUTMEG) and `ui/r4-kids-c` (OCHRE) for the earlier timber.

## Who owns what this round

Two tracks build at once from the same commit, and both winners are merged.

- **DIALOGS owns:**
  - `ui/modal.css`, `ui/settings.css` and `ui/deckview.css`, with their `.js`
    markup;
  - `scenes/tutorial.css` and the story beats in `scenes/tutorial.js`;
  - `.kit-field`, `.kit-select` and `.kit-select-wrap`, the "OBJECTS IN THE HOUSE"
    section and the "A LEDGER AND A TRICK CASE" section.
- **KIDS' PLACES owns:**
  - `scenes/lobby.*`, `scenes/clubhouse.*` and `scenes/atlas.*`;
  - the rest of "CONTROLS AND THE KIDS' PLACES", and the whole "THE KIDS' PLACES,
    TIMBER" section.
- **Changes to another track's component:** new components go in a section
  APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`. New tokens are
  appended to the end of the `--kit-*` block. Change another track's component with
  a modifier class, never by editing it.
- **Lay out through your own classes.** A scene sheet that sets `position`,
  `display`, `left` and the like on a selector naming a shared `.kit-*` class turns
  `tests/scene-css` red, even when the rule is scoped.
- **Never reuse a name.** Before you add a class or an asset, grep `game/src` and
  `game/assets` for it. Round 4 had three builders paint three different
  `lamp.webp` and define `.kit-bulbs--candle` three ways, and rounds 5's two KIDS'
  PLACES builders both wrote planks into one section.
- **Nobody edits** `ui/coach.*`, `ui/handoff.*` or the achievement toast.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." **No candidate in six rounds has scored above 8 on any screen, and
every judge gives the same reason: the ground behind the screen is a render, not
a painting.** Your two tracks carry the worst of it — Settings and the pile viewer
score 3 or 4 on the background dimension, the lowest anywhere in the pass, and the
Kids' walls score 5 to 6.

Josh is painting them (`docs/art/background-prompts.md`); `animations/backgrounds/`
does not exist yet. **Do not spend this round trying to paint rooms in CSS.** Keep
every painting slot working and unobstructed, and spend your effort on what a
judge can still move: flat fills that should be objects, controls that read as web
UI, ornament that repeats like a border image, dead corners, and anything that
crowds or clips at 1280x800.

One warning from round 6, which cost that round a screen. POLISH was asked to make
four identical plates into four painted objects; the builder gave each the
material of the thing it is — velvet, walnut, fired enamel — and two judges marked
it DOWN, because the browns and roses left the palette the rest of the kit holds.
**Variety WITHIN the palette.** A real material in the wrong hue is a regression.

## DIALOGS — the opening, Settings, the pile viewer

Every item is a round-5 judge's words about BIRCH's screens, or a graft they asked
for. BIRCH won all three screens from both judges; these are why it stopped at 7.

The opening:
1. **The gold shelf under the portrait and the story panel is a CSS border.** Both
   judges said it: "one identical bead tile edge to edge", "a flat, evenly repeated
   bead strip across the whole width... not a carved, lit wooden ledge". Give it
   ends, a lit top arris, a cast shadow and a break in the repeat.
2. **The lower third below it is an empty dark band.** Stage the scene on a floor:
   ALDER's painted cobblestones with a small lit brass lantern beside the candle.
3. **The progress dots** become CLOVE's star glyphs on a gold rule, the current
   page a bright eight-point star, and SKIP gets a medallion end-cap matching GO
   ON's.

Settings (background 3–4, the worst score in the pass):
4. **Every toggle row shows a slider-switch AND a separate OFF/ON pill.** That
   doubles the control and makes each row read as a web form. One engraved switch
   per row that says its own state.
5. **The DANGER panel is a flat red wash that reads as a web alert box.** Mark it
   the way the kit marks things: CLOVE's crimson ribbon header, a red wax seal, a
   warning glyph and a skull medallion flanking RESET — not a filled rectangle.
6. **A moon medallion under the EXPEDITION panel** (ALDER's), as sparing painted
   prop, so the three columns are not three identical bordered boxes.

The pile viewer:
7. **The five filter pills read as web select boxes** — "a tiny spaced label and a
   value crammed into one short capsule with a round caret stuck on the end". Take
   ALDER's small gold cartouche label tabs sitting ON each dropdown, so the label
   and the value are two pieces, and CLOVE's round medallion search cap and chevron
   medallions.
8. **At 1280 the dialog runs nearly edge to edge.** The close X touches the right
   screen edge and the skull stack overlaps the bottom-left frame corner, so it
   stops being a dialog over the fight and becomes the whole screen. It must sit
   over the board with the board visible around it.
9. **The cards do not fill the tray.** Size them so the case looks stocked
   (ALDER's), not like a grid with air in it.

## KIDS' PLACES — the Lobby, the Clubhouse, the Atlas

This is an EXPAND track: each screen is judged and merged on its own. The Lobby
and the Atlas are GORSE's, the Clubhouse is ELDER's, and the items below are each
judge's words about whichever build owns that screen.

The Lobby (GORSE's):
1. **The plank wall and the trunk are a tiled texture.** All three judges: "a flat,
   evenly lit tiled texture with no painted depth or candle falloff", "a repeated
   CSS texture rather than a painted interior". Break the repeat, pool the candle
   light, and let the trunk be a tree rather than a strip of grain.
2. **See the mansion through a treehouse window.** Two judges asked for FINCH's
   idea and neither wanted its execution: paint a separate window beside the
   framed house portrait, NOT mullions laid over the gilt frame.
3. **The DRAWS THE HOUSE number is jammed against the password plate**, touching
   its gold rim, while the space below NEW PASSWORD is wasted. ELDER's standalone
   gold-ribbon cartouche is the clean separation.
4. **The paper note on the password panel is a flat cream rectangle.**

The Clubhouse (ELDER's):
5. **The lower-left corner is a pile-up, not a collage.** The house photo has no
   caption and the PETS VANISH clipping is squeezed against its right edge and
   runs almost to the board's bottom rail. Take GORSE's captions — "The House,
   where they all went" on the photo and "eight gone this year" as the clipping's
   subhead — and compose the corner.
6. **The right column below HAUNT LEVEL is unstaged**, and the quote is a thin
   cream strip with small type squeezed onto the shelf edge. Take ELDER's own
   pinned, slightly tilted paper card treatment, large enough to read, its pin
   clear of the text.
7. **The pet polaroids are soft and smeared** beside sharp engraved type and gold
   frames.

The Atlas (GORSE's):
8. **The wall behind the map and the side panel is the weakest painted surface on
   any of the three screens** — "a plain brown-purple gradient with a faint
   wainscot line, lit evenly with no candle pooling". It is also a large dim empty
   zone below the side panel. Dress it and pool light in it.
9. **The map's purple mat is an undecorated CSS band.** Either give it filigree
   and dressing, or let the floor-plan paper fill the frame edge to edge.
10. **The caption must not break.** ELDER's split across the centre fold ("THE
    MANSION — RECOVERED FLOOR PLAN" on one page, "Hand-copied" on the other) is the
    failure to avoid; keep it one label, clear of the ageing and the fold.
11. **Keep the rolled scroll with the red wax seal** beside the skull on the floor
    (GORSE's), and consider it for the clubhouse shelf.

## The creatures move

Since round 5 the enemies play real animation (27 of them now). Your pile-viewer
capture is taken over a fight, so a creature will be in frame and **it will be on a
different frame in every capture, including the baseline's.** That is not a
difference any builder made. Do not chase it, do not freeze it, and do not read a
pose difference as a change you made.

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

DIALOGS builders: `python tools/on_port.py PORT tests/teaching/check.py` and
`... tests/settings-play/run.py`, because the opening and Settings are both
gates as well as screens.

## Deliverables

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

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
`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, photograph at least two screens OUTSIDE your track on your
port and look at them — make one of them a POLISH or COMBAT screen (`shop`,
`map`, `gameover`, `combat`), because nobody is building those and a kit change of
yours lands on them unwatched. Stop your dev server when you are done.
