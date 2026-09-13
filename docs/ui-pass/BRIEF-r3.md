# Midnight Menagerie UI pass — round 3 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then `BRIEF-r1.md`'s
**What round 0 decided**: the kit it describes is still the language, extended by
rounds 1 and 2. Nothing else in those two files is an instruction for this round.
Then this file, which wins wherever they disagree.

## Where the game is

| screen | who built it | judged in round 2 (mean overall, 0–10) |
|---|---|---|
| Shop, Reward, Curiosity, Map, Safe Room, Game Over | CHALK, round 2 POLISH | 6.8 / 7.0 / 7.0 / 6.2 / 6.8 / 6.5 |
| Combat, a Scuffle and a boss | FROST, round 2 COMBAT | 7.3 |
| Lobby | GROVE, round 2 EXPAND-2 | 6.8 |
| Clubhouse, Atlas | IVORY, round 2 EXPAND-2 | 7.0 / 7.0 |
| The opening's story, Settings, the pile viewer, the confirm dialog, the coach, the handoff veil, toasts | not converted: web chrome | — |
| Title, Companion Select, Kid Select, the opening's Kid picker | ARE Josh's paintings | — |

Round 3 builds three tracks: POLISH, COMBAT, and DIALOGS, which is new. The
Lobby, the Clubhouse and the Atlas wait for round 4.

## What the kit gained in round 2

Read `game/src/ui/kit.css`'s header and its sections.

- **CHALK changed the shared primitives.** `.kit-panel` stands on felt inside an
  inner double gold rule with brass corner fleurons (`--rule: none` takes the
  rule away). `.kit-cards` faces have a felt-damask rules panel, Cinzel lavender
  names, and keywords lettered gold over a gilt underline. The HUD is an engraved
  rail of gilt nameplate chips and filigree sockets. Small labels are floored at
  11.5–12px. `ui/backdrop.js` is the one painting-slot module (`paintBackdrop`;
  `ui/kitboard.js` re-exports it). `tools/prep_ui_polish.py` renders the pieces.
- **FROST appended "READINGS IN METAL":** `.kit-tube` (a Courage gauge),
  `.kit-socket` (a condition), `.kit-coin` (a count), `.kit-cards--nerve` (a cost
  struck on enamel). `tools/prep_combat_kit.py` renders the pieces.
- **IVORY appended "CONTROLS AND THE KIDS' PLACES":** `.kit-tabs`, `.kit-ladder`,
  `.kit-ledger`, `.kit-paper`, `.kit-pin`, `.kit-tape`, `.kit-bulbs`,
  `.kit-ground--planks` and `.kit-panel--damask`, which the Clubhouse and the
  Atlas use. It also added `.kit-field`, `.kit-select`, `.kit-select-wrap` and
  `.kit-hatch`, which nothing uses since IVORY's lobby lost.
  `tools/prep_treehouse_art.py` renders the pieces.
- **`tools/shot.py --script @tools/shot-scripts/<file>.js`** runs a page setup
  from a file before the shot.

## Branches you may read for their ideas

Read them with `git show <branch>:<path>`.

- `ui/r2-polish-a` (AMBER):
  - map entrance names on plates with leader lines;
  - Game Over's Worked Hardest on a gilt plinth, with a full-width stat strip;
  - coin price plaques beside round enamel BUY buttons;
  - bracketed Curiosity plaques;
  - numbered medallions on the Safe Room's rows.
- `ui/r2-polish-b` (BRAID): the lit curtain behind the Shop counter; the
  moonbeams across the Curiosity and the fort; painted materials
  (`tools/prep_ui_paint.py`).
- `6cfaef5`, round 2's starting point:
  - the Reward's moon medallion between +Buttons and +Luck, with CHOOSE ONE TRICK
    on its own row;
  - Mr. Moth and the Forgetting service in the Shop's centre counter;
  - the Map's key as separate cartouches;
  - dashed, hatched zone outlines.
- `ui/r2-combat-a` (DUSK): parchment ribbons with star glyphs for HOUSE RULE; the
  Butler's name in wide-spaced engraved caps, set low enough that his feet show.
- `ui/r2-combat-b` (EMBER): the E key inside END TURN's plate; a floor candle by
  DISCARD; a gold coin face for Nerve.
- `ui/r2-expand2-a` (GROVE): every Modal, Settings and the pile viewer as kit
  panels (`ui/modal.css`, `ui/settings.css`, `ui/deckview.css`). They were built,
  but no judge ever saw them.
- `ui/r2-expand2-b` (HAZE): lanterns, a hanging lamp, pinned parchment notes.
- Older: `ui/r0-a`, `ui/r0-b`, `ui/r1-refine-a`, `ui/r1-refine-c`,
  `ui/r1-expand-b`, `ui/r1-expand-c`.

## Who owns what this round

Three tracks build at once from the same commit, and all three winners are merged.

- **POLISH owns the shared pieces:**
  - every component in `kit.css` above the two appended round-2 sections;
  - `tokens.css`, `hud.css`/`hud.js`, the tooltip, the room shell (`reward.js`),
    `ui/backdrop.js` and `ui/kitboard.js`;
  - the six boards' scene files.
- **COMBAT owns:**
  - `scenes/combat.css` and `scenes/combat.js`;
  - `ui/card.css`, `ui/card.js`, `ui/hand.css`, `ui/hand.js` and `ui/intent.js`;
  - the presentation in `ui/enemy.js`;
  - kit.css's "READINGS IN METAL" section.

  It does not own the HUD bar or `.kit-cards`, which are POLISH's: a look for the
  hand only is a `.cb-handhost` rule in `combat.css`.
- **DIALOGS owns:**
  - `ui/modal.css`, `ui/settings.css` and `ui/deckview.css`, with the markup in
    `ui/modal.js`, `ui/settings.js` and `ui/deckview.js`;
  - `scenes/tutorial.css` and the story beats' markup in `scenes/tutorial.js`
    (not the Kid picker, which is Josh's painting);
  - `.kit-field`, `.kit-select` and `.kit-select-wrap` in IVORY's section.

  The rest of IVORY's section belongs to the Clubhouse and the Atlas: use it, but
  don't edit it.
- **COMBAT and DIALOGS never edit a POLISH component.** New components go in a
  section APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`. New
  tokens are appended to the end of the `--kit-*` block. Change a look with a
  modifier class, never by editing the original.
- **Nobody edits** the Lobby, Clubhouse or Atlas files, `ui/coach.*`,
  `ui/handoff.*` or the achievement toast this round.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." In round 2 every judge on every track named the same ceiling: the
grounds are renders, and every candidate scored near 6 on background, winner or
not. Josh is painting the backgrounds (`docs/art/background-prompts.md`), and
none have arrived yet, so keep every painting slot working. What you CAN move:
- flat dark fills that still read as CSS;
- text that crowds or clips at 1280x800;
- ornament that competes with the reading.

## POLISH — the six boards

Every item is a round-2 judge's words about these screens, or a graft they asked
for.

Shop:
1. **Keepsakes and Snacks rows** get air: at 1280x800 no title, description or
   price touches another. Each price and its BUY become one counter plaque: an
   engraved coin-medallion price beside a round purple enamel BUY button with a
   gold rim (AMBER's). Size it like a shop plaque, not a HUD pill.
2. **The price row under the Tricks** uses the same plaque language, larger than
   today's coin chips and BUY circles.
3. **The Forgetting service** stops being a narrow slab with text floating in it.
   Either frame it as a proper card, or move Mr. Moth's portrait, quote and stats
   and the service into the centre counter, so the shelf holds five real cards
   (`6cfaef5`'s arrangement). Mr. Moth's nameplate is a cartouche, not a flat pill
   jammed on the rail.
4. **Behind the counter**, the dim wash becomes a lit, painted curtain or shelving
   (BRAID's curtain). Keep the painting slot.

Reward:
5. **The shelf** under the three cards: a carved or gilded ledge with a lit top
   edge and a cast shadow in place of the hatched strip, with a pool of candlelight
   under the cards.
6. **The crest:** the star medallion is never half-buried behind CHOOSE ONE TRICK.
   +Buttons and +Luck flank a moon medallion on the frame's top rail, with the
   ribbon on its own row beneath (`6cfaef5`'s).
7. **The rules panels and the glossary tile** lift from near-black to aubergine
   enamel with grain; at 1280 the tile never touches a card.

Curiosity:
8. **The drop cap:** a large illuminated initial dropped two to three lines into
   the first paragraph. The text wraps it cleanly, and later paragraphs start
   flush.
9. **The choice rows:** every row is the same bracketed painted plaque (AMBER's),
   its fill grained or warm-lit. The chosen row differs by light, never by
   material.
10. **At 1280**, leave air under the moon medallion and around the divider, so the
    paragraphs and choices stop crowding the double rule.

Map:
11. **Entrance names:** each on its own plate, joined to its room by a short
    leader line (AMBER's). At both sizes each plate is clear of every node and
    inside the sheet; nothing pokes above the sheet's top edge.
12. **The footer:** the key, each omen and the home button are separate framed
    cartouches that never stack at 1280, and THE WHOLE HOUSE is a full plaque.
13. **The zones** are dashed, hatched surveyor's outlines (`6cfaef5`'s).

Safe Room:
14. **The layout:** close the empty band between the SAFE ROOM ribbon and the two
    columns. At 1280, REST clears its medallion and every row's last line clears
    its rule.
15. **The option plaques:**
    - grain and a candle or moonbeam falloff on every fill;
    - BRAID's stronger moonbeam across the fort;
    - values on filled ribbon or cartouche plates like the Shop's;
    - numbered medallions on each row's top border (AMBER's).

Game Over:
16. **Worked Hardest:** a card large enough to read (Reward scale), standing on a
    gilt plinth (AMBER's) as the board's second focus.
17. **Air:**
    - the title plaque comes off the top edge;
    - What You Lost's minimap and "1 / 17 WINGS DRAWN" stay inside their frame at
      1280;
    - The Pet You Did Not Reach is not cramped;
    - the stats are one framed strip.
18. **Keepsakes:** at 1280 the last entry has room above the frame's rule.

Everywhere:
19. **STANDALONE PREVIEW** sits on a small ribbon plaque instead of an
    inscription ghosting into the scrollwork.
20. **Flat fills:** any row, plaque or panel interior that is still a flat dark
    gradient takes a painted material and the room's light.

## COMBAT — the fight, and the fight when it is full

Three boards are judged: the Scuffle (`foyer-14`), the boss (`foyer-boss`), and
the boss with nine Tricks in hand and conditions stacked on both sides
(`tools/shot-scripts/combat-crowd.js`). Both round-2 judges named items 1–8 for
this screen; items 9–10 are defects that have stood since round 2.

1. **Courage gauges**, on every enemy and on Bones: deep crimson (theirs) or amber
   (yours) enamel in gold-rimmed, end-capped brass housings. Nothing glossy or
   candy-pink (use DUSK's darker bar tone).
2. **The boss:**
   - THE BUTLER in wide-spaced engraved serif caps, with no faux bevel (DUSK's
     lettering), on the gold cartouche;
   - a mark a Scuffle's plate never has, such as a star ribbon or a crest over the
     plate;
   - the plate set low enough that his feet show (DUSK's).
3. **HOUSE RULE and BUFF tags** become parchment or gold ribbons with star glyphs
   (DUSK's).
4. **END TURN:** the E key sits inside the plate (EMBER's). At 1280 the hourglass
   medallion clears the frame's corner scrollwork.
5. **The piles:** DRAW wears the same gold-rimmed enamel plate and filigree as
   NERVE and DISCARD, so the three read as a set. DISCARD stands on a small
   filigree base instead of floating.
6. **The Kid's column:** room between the portrait's nameplate, the Courage tube
   and the Nerve medallion, and a larger coin face inside the Nerve filigree
   (EMBER's).
7. **Card rules panels** in the hand: faint damask or paper with a lit inner edge.
   The `.kit-cards` faces POLISH owns already do this on the boards; make the hand
   read the same and never double a rule. A two-line name such as Put Yourself
   Back Together sits cleanly on one plate.
8. **The stage:** candle warmth or cobwebs by the lower corners (EMBER's floor
   candle by DISCARD), and a candlelit vignette inside the frame's inner rule, so
   the room sits behind glass instead of looking cropped.
9. **The full hand:** on the crowded board, nine or ten Tricks never cover the
   Kid's panel, its Courage tube, its conditions, the piles or END TURN. The fan
   compresses, overlaps its own cards or rises instead, and every cost and name
   still reads at 1280x800.
10. **Co-op:** the `.cb-mates` column and the `.cb-rules` rail stop overlapping at
    top left. Open a co-op fight on your own port (`tests/coop/` shows how) and
    look; no judge will see it.

Tests drive this screen hard: `tests/combat-scene`, `card-face`, `cards-feel`,
`piles-reachable`, `gamepad`, `settings-play`, `playthrough3`, `coop`,
`kid-clips`, `enemy-stills`, `sprites`, `steam-deck`, `chrome`. Grep `tests/`
before changing a selector. Run the tests you touched through `tools/on_port.py`
(below), and keep 60 fps with the full hand.

## DIALOGS — what opens over the game

Three screens are still web chrome: flat dark rounded panels, default sliders and
toggles, browser selects and a plain search box.

- **The opening's story** (`#scene=tutorial&kid=maya`): the first night, told in
  beats over the lit room. A Kid's portrait sits beside a prose panel, with GO ON,
  a row of beat dots, and SKIP — I KNOW THE HOUSE in the corner.
  - The room behind is the atmosphere layer by design, so there is no opaque
    ground (read `tutorial.css`'s header).
  - Make the beat a thing from this house: a page, a letter or a framed plaque.
    The portrait goes in a kit frame, GO ON becomes a kit button, the dots become
    medallions, and SKIP becomes a quiet kit button.
  - The Kid picker before it is Josh's painting: leave it alone.
- **Settings** (the HUD's gear): sections of sliders and toggles over a dimmed
  screen.
  - Make it a kit panel with a nameplate title and engraved section ribbons.
  - Sliders and toggles are brass and enamel, but still behave as real
    `<input>`s, keyboard and gamepad included.
  - DONE and RESTORE DEFAULTS are kit buttons.
- **The pile viewer** (a pile's button in a fight): filters, a search field and a
  grid of cards.
  - Make it a kit panel with a nameplate.
  - The search goes on `.kit-field`, the filters on `.kit-select`, and CLEAR and
    CLOSE are kit buttons.
  - The sorting note is a quiet engraved caption, and the cards are the kit's
    cards.
- **The frame they share** is `ui/modal.css`, so every Modal speaks one dialog
  language, the confirm dialog included. The scrim should read as the room going
  dim, not as a grey sheet.

GROVE built kit dialogs in round 2 that no judge saw (`ui/r2-expand2-a`); read
them before you start. Tests that drive these screens: `tests/settings-play`,
`piles-reachable`, `gamepad`, `chrome` and `steam-deck`, plus whatever
`grep -rlE "mm-modal|deckview|settings|tut-" tests/` finds.

## Testing your branch

Every test under `tests/` hard-codes `:8777`, which is the MAIN checkout's server.
A test run from `WT` as its docstring says drives `dev`, not your branch, and
passes whatever you changed. With your own server up, run it through the wrapper,
which swaps the port in memory and changes nothing on disk:
```
cd "WT" && python tools/on_port.py PORT tests/combat-scene/seam.py
```
A test run any other way has tested nothing of yours.

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

Before you finish, photograph at least two screens OUTSIDE your track on your
port and look at them. Stop your dev server when you are done.
