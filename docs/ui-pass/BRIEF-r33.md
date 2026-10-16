# Round 33 — the controls and the small text

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r33.md`.**

## WHY

Survey 4 (`SURVEY-2026-10-12.md`, items 5 and 6) found the boards a point and
a half under the samples, and both judges named the same two things on the
same four screens: text a player on a Steam Deck cannot read, and controls
that read as a web form in a gilt frame.

- **settings:** "under every setting, the italic help text ... is about 9-10px
  lavender-grey italic at 1280. It is the least legible text in the game"
  (both); "SAVE AND QUIT is a plain black stadium with no rim or icon" (J1);
  "re-draw the sliders as engraved brass rails with a knob; they read as
  styled range inputs" (J2).
- **piles:** "the five TYPE / COST / RARITY / UPGRADED / SORT filters are
  identical '< All types >' stadium spinners in a row: a web form's filter bar
  given a gold border" (J1); "collapse the five steppers into one engraved
  filter strip" (J2).
- **shop:** "the twelve BUY controls ... are identical small dark stadiums
  with a disc, and at 1280 their 'BUY' lettering is about 9px ... they crowd
  the coin price beside them" (J1); "give the BUY medallions a
  price-and-button lock-up (coin inside the button) so each row has one
  control, not two" (J2).
- **hud-late:** "with ten Keepsakes and eight Gear, the run strip ... shrinks
  every icon to about 20px at 1280 ... HAUNT and the seed lose their labels"
  (J1); "bright, saturated sticker art (a lime tennis ball, a green rubber
  glove, an orange box) that cannot be told apart at 1280 and clash with the
  antique gold" (J2).

## THE FIX LIST

### 1. NO RUNNING TEXT UNDER 11 PX AT 1280 — both judges

On all four screens at 1280x800, every line a player is meant to read (help
text, descriptions, labels, button lettering, prices) is at least 11 px, and
at a contrast that reads: the settings help text is the worst case (9-10 px
lavender-grey italic). Fit by cutting words, reflowing and using the space,
NOT by shrinking something else under 11. Prove it: a probe that lists every
visible text node under 11 px on each screen at 1280 (`tests/steam-deck`
already reports `minFont`; extend nothing in tests/, write the probe in your
scratch dir) -- deliver that list empty, or with each survivor named and
justified (an ornamental numeral is not running text).

### 2. ONE BUTTON — both judges

SAVE AND QUIT, RESET…, the reward's TAKE NONE and the shop's BUY become the
house's own button: the enamel disc plus cartouche that DONE and LEAVE THE
ROOM already use (find it in `kit.css`), at a size the Deck can hit. On the
shop, price and BUY become ONE control per row -- the coin and the price
inside the button, or a brass price tag that IS the button -- never two
neighbouring controls. Sold out / too poor still read at a glance.

### 3. HOUSE CONTROLS, NOT FORM INPUTS — both judges

- **settings sliders:** an engraved brass rail with a knob; the value engraved
  on or beside the rail (or drop the separate % tag if the rail says it).
- **piles filters:** fold the five spinners into ONE engraved filter rail of
  medallions -- type glyph, cost coin, rarity gem, upgrade star, sort quill --
  each cycling on click, each showing its current value in words a player can
  read (11 px+), and the freed height given to the cards.
- Every control stays reachable and operable by keyboard and gamepad
  (`tests/gamepad`, `tests/piles-reachable`, `tests/settings-play`), and keeps
  its accessible name.

### 4. THE LATE RUN STRIP — both judges

With ten Keepsakes and eight Gear (`tools/shot-scripts/hud-late.js`): no icon
under 30 px at 1280, with a gap between icons. Past about six in a group,
collapse the group into a labelled pouch medallion with its count
("Keepsakes 10") that fans its icons out on hover/focus. HAUNT and the seed
keep their labels at every width. Bring the icons into the house palette with
a TREATMENT on the strip (a dark engraved ring, a muted duotone or tint toward
gold/bone/aubergine) -- NOT by editing or regenerating the art files.

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/settings.js` / `settings.css`; `ui/deckview.js` /
`deckview.css` (the piles dialog); `scenes/shop.js` / `shop.css`;
`scenes/reward.css` and `reward.js` for TAKE NONE only; `ui/hud.js` /
`hud.css` (the run strip); `kit.css` and `tokens.css` by APPENDING sections;
`ui/tooltip.*` only to use it.

**Not yours:** `fx/*`, `core/renderer.js` (keep its render-scale governor:
Josh's standing rule), the card's face (`ui/card.*`, round 27), the fights
(`ui/enemy.js`, `ui/hand.*`, `scenes/combat.*`, round 32), the map's
parchment and the atlas (round 30), `ui/hang.js`, the art files under
`game/assets`, gameplay, `game/src/data`, `state`, `combat`. Do not edit
tests to make them pass.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`; run them as `python tools/on_port.py PORT <test>`
  with your own server up: at least `tests/chrome`, `tests/steam-deck`,
  `tests/gamepad`, `tests/piles-reachable`, `tests/settings-play`,
  `tests/backpack`, `tests/scene-css`, `tests/css-tokens`, `tests/seams`.
- **This machine, 2026-10-14:** after a heavy capture day the GPU driver can
  get into a state where a page cannot navigate away from a WebGL screen
  (page.goto times out or is "interrupted by another navigation") on EVERY
  build. If steam-deck or gamepad fail that way, re-run a SCRATCH copy that
  opens a fresh page per screen or swaps `--use-angle=default` for
  `--use-angle=d3d9` (gamepad's two hold-to-repeat timing checks fail on d3d9
  -- expected), and run the same copy on BASE.
- Wrap every capture in `timeout 180`. Stop ONLY the processes you started, BY
  PID. `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Do the deliverables EARLY, then refine.** Commit as you go.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && timeout 180 python tools/shot.py CODE-settings --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && timeout 180 python tools/shot.py CODE-piles    --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
cd "WT" && timeout 180 python tools/shot.py CODE-shop     --port PORT --scene shop --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 180 python tools/shot.py CODE-hud-late --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size). If
your piles rail changes the draw-pile dialog's selectors the command still
opens it from `#draw-pile`; keep that id. Also LOOK at (not judged) the reward
board at 1280 for TAKE NONE: `--scene reward --hash pics=1`.

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
