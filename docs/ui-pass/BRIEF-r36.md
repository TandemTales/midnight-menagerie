# Round 36 — the last web-shaped controls, and the crowded hand

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit) and `BRIEF-r33.md` (the controls round this one
finishes) and `BRIEF-r32.md` (the fights: the hand's fan and the floor line).
This file wins wherever they disagree. **Your rubric is `RUBRIC.md` as
amended by `RUBRIC-r36.md`.**

## WHY

Survey 5 (`SURVEY-2026-10-16.md`, items 5 and 6): every board now scores 6-7.5
and both blind judges named the same few things that still read as a web
page in a gilt frame, and the same crowded hand.

- **settings:** "the 'Current expedition' khaki slab with a dash and the pale
  cream 'random' field read as disabled web text inputs" (J1); "the two read
  as default text inputs" (J2). Both: the DANGER panel's red wax seal sits
  over the panel's corner rule, "a sticker on the frame". J1: SAVE AND QUIT
  is still "a ghosted outline pill with a padlock, the most web-like control
  left". J2: the palette swatches "look like OS radio buttons"; at 1280 the
  six panels "pack with almost no gutters".
- **lobby:** the password "whispering-hideout" is "set in a heavy sans-like
  bold in a black pill" (J1), "the one piece of web type on a screen
  otherwise in the samples' serif" (J2). Both: the "DRAWS THE HOUSE" ribbon's
  star glyphs touch its first and last letters; the bottom fifth under the
  shelf is a dead dark band of planks.
- **shop:** "the twelve identical brass 'BUY' pills ... read as an
  e-commerce button grid" (J2); the Keepsakes and Snacks panels are "a plain
  list ... a styled web table under a painted Tricks row" (J1). Both: the
  velvet curtain behind the Tricks is "a soft vertical purple gradient, the
  one place on the board that is still a CSS fill". J2: at 1280 the header's
  three tiers (title plate, MR. MOTH'S ribbon, cloakroom line) are crushed
  together.
- **piles:** the search box is "a pale torn-parchment strip with a
  placeholder 'Search...' that reads as a web input, the brightest object on
  the dialog" (J1); "frame it in brass like the filter rail beside it" (J2).
  Both: at 1600 the tray's bottom edge clips the five cards' lower borders.
  J2: two closes compete (the round x and the CLOSE plate).
- **combat-crowd:** "the nine-card hand overlaps so tightly that titles
  compress ('PUT YOURSELF BACK TOGETHER' is squeezed to ~8 px) and the three
  Bites stack into one illegible column at 1280" (J1); "the hand's fan rises
  to the Butler's HP bar, crowding the board's middle" (J2).

## THE FIX LIST

### 1. NO WEB INPUTS — both judges

The settings' two seed fields, the lobby's password and the piles' search
become objects of the house: an engraved brass-framed plate or a dark inset
enamel well with a gold rule (the lobby's password WELL is the model; its
TYPE is the defect), the value in the samples' serif (or a hand-lettered
chalk/ink face on a slate for the password), no glowing focus pill. The
placeholder in the house's voice and type. They stay real, focusable,
typeable inputs with their accessible names (`tests/settings-play`,
`tests/piles-reachable`, `tests/gamepad`).

### 2. THE SHOP AS A STALL, NOT A STORE — both judges

No grid of identical BUY pills: the price is a tag (round 33's brass key tag
is the start; a hanging paper tag or a coin-plate), the whole card or row is
the control, and BUY shows on hover, focus and selection -- one lit press
point, not twelve. Keepsakes and Snacks are objects, each on its own small
plate or under its glass bell / in its jar (the panels already say "under the
glass" and "in the jar"), not ruled list rows. The curtain behind the Tricks
row has folds lit by Mr. Moth's lamp and a pelmet. At 1280 the header's three
tiers each get air (merge the cloakroom line into the title's subtitle or the
TRICKS rail). Poor / sold / blocked stay readable at a glance.

### 3. THE CROWDED HAND — both judges

At nine cards (`tools/shot-scripts/combat-crowd.js`) every card keeps a
readable title plate at 1280: shrink the OVERLAP, never the type; stack
identical cards (the three Bites) into one fanned stack with a count, or
overlap duplicates more; a lower arc, so the fan does not climb into the play
space above the hand's top line; a fixed gutter from the Companion panel and
the Nerve dial. A hovered or focused card raises clear with its rules a size
up. Play, drag, keyboard and gamepad still work (`tests/hand-cards`,
`tests/gamepad`, `tests/combat-scene/seam.py`).

### 4. EACH SCREEN'S SMALLER ITEMS

- **settings:** the wax seal seated on the RESET plate or beside it, inside
  the panel; SAVE AND QUIT a filled plate like DONE even when locked (keep
  its padlock and dimmed gold); the palette swatches in small gold bezels;
  gutters between the six panels at 1280.
- **lobby:** pad the ribbon so its stars clear the letters; dress the bottom
  fifth (the rope ladder coil, a lantern, a hatch) so the scene ends in an
  object.
- **piles:** the tray tall enough for the cards' full frames at 1600 (or the
  cards a notch smaller); ONE close control; the active filter lit.

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/settings.js` / `settings.css`; `scenes/lobby.js` /
`lobby.css`; `scenes/shop.js` / `shop.css`; `ui/deckview.js` / `deckview.css`
(the piles dialog); `ui/hand.js` / `hand.css` (the fan only: overlap, arc,
stacking, raise); `kit.css` and `tokens.css` by APPENDING sections;
`ui/tooltip.*` only to use it.

**Not yours:** `fx/*`, `core/renderer.js` (keep its render-scale governor:
Josh's standing rule), the card's FACE (`ui/card.*`, round 27 -- a card's
size and position in the fan are yours, its face is not), `ui/enemy.js`, the
fighters' placement and floor line (round 32), the map and atlas, the run
strip (round 33), `ui/hang.js`, the art files under `game/assets`, gameplay,
`game/src/data`, `state`, `combat`. Do not edit tests to make them pass.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`; run them as `python tools/on_port.py PORT <test>`
  with your own server up, started FROM your worktree: at least
  `tests/chrome`, `tests/steam-deck`, `tests/gamepad`, `tests/piles-reachable`,
  `tests/settings-play`, `tests/hand-cards`, `tests/card-face`,
  `tests/combat-scene/seam.py`, `tests/backpack`, `tests/scene-css`,
  `tests/css-tokens`, `tests/seams`.
- Three builders share one GPU: wrap captures in `timeout 600`.
- **No running text under 11 px at 1280** (round 33's rule) on your five
  screens; prove it with a small-text probe in your scratch dir.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Commit after every step that works**
  (builders have lost work to usage limits). **Say in your notes what you did
  NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 600 python tools/shot.py CODE-settings     --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-lobby        --port PORT --scene lobby --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-shop         --port PORT --scene shop --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-piles        --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size).
Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
