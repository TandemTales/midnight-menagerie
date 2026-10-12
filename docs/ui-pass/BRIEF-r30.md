# Round 30 — the run strip late in a run, and the parchment: the map and the atlas

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r30.md`.**

## WHY THESE THREE

Survey 3 (`SURVEY-2026-10-04.md`) sent its rooms and its card to rounds 27-29.
Two of its five shared defects are left, both on the screens a player reads
between fights:

- **"THE RUN STRIP LATE IN A RUN"** (+2 both judges): "at 1280 the ten
  Keepsakes collapse to two overlapping coins and the eight Gear show no icon
  at all -- '10 KEEPSAKES ◆ 8 GEAR ▼' is just words crushed between SNACKS
  and Haunt"; "every label is about 11px small caps run together with dot
  separators".
- **"PALE PARCHMENT"** (both): "the blueprint parchment covers about 80% of
  the screen in pale tan, and its 50-odd room nodes are tan discs with dark
  glyphs on tan paper, so the house's aubergine darks are gone and no node
  stands out except the boss crown"; the atlas "draws all seventeen wings at
  the same blue-grey line weight, so the one surveyed wing and the sixteen
  unknown ones look identical".

| screen | J1 | J2 |
|---|---|---|
| hud-late | 5 | 6, +2 |
| map | 5 | 6, +1 (J1 +2) |
| atlas | 5 | 7, +0.5 (J1 +2) |

## THE FIX LIST

### 1. A KEEPSAKE AND GEAR TRAY YOU CAN SEE -- both judges

With `hud-late`'s load (ten Keepsakes, eight Gear, three Snack slots), every
Keepsake and every Gear item must show as an ICON at BOTH sizes, 1280
included, each in its own round gold-rimmed socket like the SNACKS sockets,
so they read as objects on a belt -- in the strip, or in a slim second brass
rail beneath it, or a fanned row of medallions, as long as nothing overlaps
and nothing is reduced to a word. Too many to fit: show what fits and a
"+N" medallion that opens the rest. Make fewer, bigger cartouches: cut the
strip's text items to icon + number where the icon already says it (labels on
hover/focus), raise the strip's type a size, drop the dot separators. The ▼
toggles become small brass knobs that read as controls. "NO KEEPSAKES" sits
on a cartouche, not in a plain box. Every existing control, id and tooltip
keeps working.

### 2. THE MAP: DARK PARCHMENT AND THREE NODE STATES -- both judges

The blueprint parchment goes to a darker, aged sepia with a burnt vignette
toward its edges, so the screen keeps the house's darks. The room nodes get
THREE STATES the eye separates at a glance: **reachable** (lit gold rim,
enamel, the focal point), **visited** (inked over, quieter), **distant**
(faded pencil). Reachable paths are gold and thicker; the rest faint ink.
The red and blue watercolour washes become crisp tide-marked ink with a key
(or go). Room-name labels stop colliding with path lines (a backing
cartouche, or set clear). The KEY's labels readable at 1280.

### 3. THE ATLAS: INK THE SURVEYED WING, FOG THE REST -- both judges

The surveyed wing(s) in strong sepia ink with a gold wash; the unsurveyed in
faint pencil or fog, so the plan says what "1 of 17" means at a glance. The
same darkened, burnt parchment as the map. At 1280 the plan's walls stay
crisp ink (thicken, or draw at the Deck's pixel density), not grey hatching.
The white caption strip under the plan becomes an aged pasted label or a
brass plate; the still life bottom-right sits on a ledge, not empty dark.

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/hud.css` / `ui/hud.js` (the run strip); `scenes/map.css` /
`scenes/map.js` / `ui/mapnode.js`; `scenes/atlas.css` / `scenes/atlas.js`;
`kit.css` by APPENDING new sections; `tokens.css` by appending; the existing
prep tools, extended (never a second script with the same job).

**Not yours:** `fx/*` (the WebGL rooms, rounds 21-29), `core/renderer.js`
(keep its render-scale governor: Josh's standing rule), the cards and the hand
(round 27), `ui/hang.js` (the walls' pictures), `ui/enemy.js`, the sprites,
gameplay and `game/src/data`, `state`, `combat`. **Lay out through your own
classes**: a scene sheet that sets `position`, `display` or `left` on a
shared `.kit-*` selector turns `tests/scene-css` red. The strip shows on every
in-run screen: check it on a fight and the shop too, not only the map.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`, the MAIN checkout. Run them from your worktree as
  `python tools/on_port.py PORT <test>` with your own dev server up. At least
  `tests/steam-deck` (the strip must hold ONE row at 1280), `tests/css-tokens`,
  `tests/scene-css`, `tests/chrome`, `tests/map`, `tests/gamepad`,
  `tests/platform`.
- **Do the deliverables EARLY, then refine.** Rounds 28 and 29 were stopped by
  usage limits; the builders with captures, tests and the endings guard done
  were the ones the round could judge. Commit as you go.
- `shot.py` sometimes marks the bright Map void (its parchment trips the
  white-flash check); LOOK at the frame. Wrap every capture in `timeout 180`.
- Stop ONLY the processes you started, BY PID.
- `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && timeout 180 python tools/shot.py CODE-hud-late --port PORT --scene map   --seed 7 --companion bones --kid maya --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
cd "WT" && timeout 180 python tools/shot.py CODE-map      --port PORT --scene map   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 180 python tools/shot.py CODE-atlas    --port PORT --scene atlas --seed 7 --companion bones --kid maya --wait 3
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
