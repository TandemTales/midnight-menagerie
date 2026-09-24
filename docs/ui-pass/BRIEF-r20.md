# Round 20 — the rail and the hand: the two things on every fight

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r20.md`.**

## WHY THESE TWO

Round 19 (the boards and the controls) gained +1.37 and made the run HUD hold
ONE row at 1280x800 — the Steam Deck — on every screen it was judged on. But
every screen it was judged on showed the strip EMPTY ("No Keepsakes"). Round
19's graft builder then found the case no judge had seen: **with nine or more
Keepsakes plus Gear, the strip wraps to two rows at 1280 again** — Haunt, the
seed, Tricks and the settings gear drop onto a second line over the room. That
is where a real player is by the middle of an expedition. A new capture,
`hud-late`, shows it (`tools/shot-scripts/hud-late.js`: ten Keepsakes and a
full backpack, deterministic).

And all three round-19 judges, like round 6's before them, said the strip
still reads as **"a toolbar of pills"**: a row of small arrow-tipped chips with
tiny type, a bare counter that says nothing. It is on every fight and every
board — the single most-seen object in the game.

The hand is the other one. Past six cards the fan overlaps so tightly the next
card covers each title ribbon (the survey, both judges), and round 19 could
not touch it: the fan lives in the fight's code, which was not on its list.

## THE FIX LIST

### 1. THE RAIL HOLDS ONE ROW AT 1280 AT ANY LOAD — a Steam Deck bug

With `hud-late`'s load (ten Keepsakes, eight Gear, three Snack slots), the
strip must hold ONE row at 1280x800 and stay legible — nothing under ~11 px,
every chip still hoverable, the boss board's crown finial and Guard shield
still clear under it. Fold what is folded honestly: a group that collapses
(e.g. "10 Keepsakes" as one plate that opens its tray on hover or focus) must
say what it holds; round 19 found a bare "x3" that counted EMPTY SNACK SLOTS
and every judge read it as meaningless. Check it at 1600x900 too, where the
strip has room and should spread.

### 2. THE RAIL IS ONE CARVED OBJECT, NOT A ROW OF PILLS — every judge since round 6

Round 6's brief put it best and it was never done: **"Make the strip one carved
nameplate rail — a thing with ends, a surface and a shadow — that the readouts
are set INTO, rather than a line of separate plates."** Round 19 built one
house's hardware for the boards' controls (painted objects in gilt medallions,
brass levers and plates — see `ui/objects.js`, `tools/prep_ui_hardware.py` and
`kit.css`'s round-19 sections). The rail should be made of THAT hardware: the
same brass, the same enamel, the same medallions, so the strip and the boards
are one house.

### 3. THE HAND PAST SIX CARDS — both survey judges

"With nine cards, the hand overlaps so tightly that each card's title ribbon
is half-covered by the next card, and the rules text shrinks to about 8 px at
1280." Fan wider into the space between the Draw and Discard piles; push the
overlap into the ART window, not the name; keep the rules text at ~11 px or
more at 1280. The hovered or focused card must still rise clear of its
neighbours. `combat-crowd` is nine cards.

### 4. THE BOSS BOARD UNDER THE RAIL

The boss's crown finial and Guard shield must have room under the rail at both
sizes (round 6 named this collision and it must not come back when the rail
grows).

### 5. SMALLER

- **The map at 1280**: round 19's judges found the room discs crowd and
  overlap in the middle columns, so the thin route lines disappear under the
  rims. Scale the discs to the column pitch at 1280.
- **Combat's floaters** (damage and condition numbers) overlap each other when
  several land at once — one judge saw it on a round-19 candidate.

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/hud.css` / `ui/hud.js`; `kit.css`'s HUD sections (append new
ones); `tokens.css` by appending; `ui/hand.css` / `ui/hand.js`; the hand's and
the HUD's layout in `scenes/combat.css`; `ui/card.css` / `ui/card.js` only for
the card's own fit inside the fan; `ui/mapnode.js` for the disc size; the
existing prep tools, extended (never a second script with the same job).

**Not yours, and several of these landed THIS WEEK — read them, do not undo
them:**
- `scenes/combat.css` / `combat.js`'s **stand-in room**: the boards' painted
  room shown behind a fight while the WebGL stage warms, links a variant or
  recovers a lost context (`aaafca5`). A fight must still never show its board
  over a flat plane.
- `ui/enemy.js`: the enemies' FACING (`DRAWN_FACING_RIGHT`) and the hero and
  Companion no longer FLOATING (`ed234bd`).
- `fx/*`, `core/renderer.js`, the sprites (48 frames per clip since
  `bbd0bbe`), gameplay, the region palettes, the coach, the veil and the toast.

**Lay out through your own classes**: a scene sheet that sets `position`,
`display` or `left` on a shared `.kit-*` selector turns `tests/scene-css` red.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`, the MAIN checkout. Run them from your worktree as
  `python tools/on_port.py PORT <test>` with your own dev server up —
  `on_port.py` rewrites the port, it does not start a server. At least
  `tests/steam-deck` (read its rows; the Map boss row is a known pre-existing
  race), `tests/css-tokens`, `tests/scene-css`, `tests/chrome`,
  `tests/combat-scene/seam.py`, `tests/hand-cards`, `tests/platform`,
  `tests/gamepad`.
- Stop ONLY the processes you started, BY PID. Never kill by name or pattern.
- Commit as you go: a session restart has killed builders mid-task twice this
  week, and a commit is what survives.
- `shot.py` sometimes marks the bright Map void (its parchment trips the
  white-flash check); look at the frame.
- `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && python tools/shot.py CODE-hud-late     --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
cd "WT" && python tools/shot.py CODE-map          --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-shop         --port PORT --scene shop --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-combat       --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss  --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
