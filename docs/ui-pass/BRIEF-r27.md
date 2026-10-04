# Round 27 — the card

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit) and `BRIEF-r20.md` (the last round that worked on
the hand). This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r27.md`.**

## WHY THE CARD

The 2026-10-04 survey (`SURVEY-2026-10-04.md`), both judges, independently:
"the card body (the flat purple panel under every card's art) is the largest
flat, CSS-looking surface on combat-boss, combat-crowd, piles, reward, shop and
gameover, and its rule text is the smallest text at 1280." One object, six
screens. And at nine cards the fan still buries names: "PUT YOURSELF BACK
TOGETHER breaks onto three lines over the art, SIT PRETTY and SHAKE, BOY! wrap,
and the three Bites show only a sliver of text" (both judges, +2).

## THE FIX LIST

### 1. A PAINTED CARD BODY — both judges, six screens

The lower half of every Trick — the rules panel under the art — becomes a
painted surface, not a flat fill: a printed-paper, vellum or enamel ground
with an inner bevel, a soft inner vignette, a faint damask or watermark, and
gold corner brackets like the samples' info frames (`UI/selectKid.png`,
`UI/selectCompanion.png`). It must still carry the card's TYPE colour
(Attack, Skill, Power) as the samples carry a frame's colour, and the rules
text must read on it at least as well as today. Painted assets go through the
existing prep tools (`tools/prep_ui_kit.py` or its kin), never a second
script with the same job.

### 2. THE RULES TEXT A SIZE UP at 1280

Every card's rules text at least 11-12 px at 1280x800 in every place a card
is shown at its normal size (hand of five, reward, shop, pile viewer, game
over). Names keep one size across a row of cards (the shop's "Tighten the
Collar" and "Call That Back" currently shrink below "Skull Boop").

### 3. THE NINE-CARD FAN — both judges

At nine cards at 1280: every NAME stays inside its ribbon (wrap inside the
ribbon, never spill over the art), every cost coin visible, rules text never
squeezed to a one-word column; fan on a true arc with a lifted hover card.
Round 20's graft made names 12.5 px here; the judges still see spills on the
longest names. `combat-crowd` is nine cards.

### 4. SMALLER

- The Kid and Bones at the room's left edge read as thumbnails against the
  boss (both judges): if the hand's band allows, no change is required of you
  here — it is placement in `ui/enemy.js`, which is NOT yours this round. Say
  in your notes whether the new card height leaves them room.
- The run strip's "NO KEEPSAKES" is a plain box; a cartouche (both judges).

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/card.css`, `ui/card.js`, `ui/cardart.js` (frame only, never the
art), `ui/hand.css`, `ui/hand.js`; the card's and hand's layout in
`scenes/combat.css`; card sizing in the reward, shop, pile viewer
(`ui/deckview.*`) and game over sheets, ONLY where a card's own fit needs it;
`kit.css` and `tokens.css` by appending; the existing prep tools, extended.
The "NO KEEPSAKES" plate in `ui/hud.css`.

**Not yours:** card ART; `fx/*`, `core/renderer.js`; `ui/enemy.js`; gameplay
and card DATA (`game/src/data/**` — four other builders are editing card data
right now); the rooms; the boards' walls (round 26).

## TESTING, TRAPS, DELIVERABLES

- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/hand-cards`, `tests/card-face`, `tests/cards-feel` (find its
  entry), `tests/steam-deck`, `tests/chrome`, `tests/css-tokens`,
  `tests/scene-css`, `tests/piles-reachable`, `tests/gamepad`,
  `tests/dup-keys/check.py`, `tests/seams/check.py`.
- **BASE's server goes on YOUR port + 100**, never on another builder's port.
- Wrap every capture in `timeout 180`; the GPU is shared with the user's own
  apps — if a page crashes, wait a few idle minutes and retry before
  believing it.
- Stop ONLY the processes you started, BY PID. Commit as you go.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && timeout 180 python tools/shot.py CODE-combat-boss  --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && timeout 180 python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
cd "WT" && timeout 180 python tools/shot.py CODE-reward       --port PORT --scene reward --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 180 python tools/shot.py CODE-shop         --port PORT --scene shop   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 180 python tools/shot.py CODE-piles        --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
