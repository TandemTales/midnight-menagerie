# Round 32 — the fights: the boss on the floor, the fighters on one stage, the crowded hand

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r32.md`.**

## WHY

Survey 4 (`SURVEY-2026-10-12.md`, item 4) scored both fight screens at 5-6,
and both judges named the same three things on each:

- **combat-boss:** "the Butler stands inside a gilt mirror frame on its own
  black-blue backdrop, cut off from the Foyer floor, so the boss reads as a
  portrait card pasted over a blurry room rather than a figure in it"; "the
  Kid and Bones stand small at the far left edge, their feet higher up the
  floor than the Butler's".
- **combat-crowd:** "at 1280 the nine-card fan ... SIT PRETTY and SHAKE, BOY!
  wrap their names to two lines"; "the three Bites squeezed into the middle so
  each shows only a 75px column of art and a title"; "the status chips under
  the Butler and the Kid are about 16px coins with 7px numbers".

## THE FIX LIST

### 1. THE BOSS STANDS IN THE ROOM — both judges

Drop the boss frame's opaque private backdrop so the room shows through it;
root the Butler's feet on the room's own floor with a contact shadow, lit by
the same warm/cold room light as everyone else. The gilt frame may stay -- as
an ornament BEHIND him, a halo he breaks out of -- but the boss must not stand
in a separate painting. Every boss uses this frame: check at least two others
(`--encounter` of another wing's boss) as well as the Butler.

### 2. ONE STAGE — both judges

The Kid and the Companion stand on the SAME floor line as the enemies, about a
quarter in from the left, a step larger (at 1280 Maya is about 190 px against a
290 px Butler), each with a contact shadow and a pool of light on the floor.
The floor between them and the enemies reads as one staged space (a rug edge,
a light pool), not two islands. Nothing may cover the hand, the HUD, the
intents or the enemies' plates at either size.

### 3. THE CROWDED HAND — both judges

Past seven cards, the fan's overlap eats each card's ART, never its title band
and cost: every name stays on ONE line at 1280, every cost coin shows, and the
focused or hovered card lifts fully clear. The hand stays clear of the Courage
bar, the Nerve dial and the Companion panel. Round 27's card (one name size,
rules 12 px in a crowded fan) stays: change the fan, not the card's face.

### 4. STATUS CHIPS A SIZE UP

The condition chips under the enemies and the Kid: about 24 px at 1280, the
number inside an engraved ring and readable, the name on hover/focus (the
tooltip system exists -- use it).

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/enemy.js` (the boss frame, the fighters' placement, scale, floor
line and shadows, the status chips) -- **this round changes enemy.js, and its
merge note must say what changed**; `ui/hand.js` / `ui/hand.css` (the fan);
`scenes/combat.css` / `scenes/combat.js` (layout); `kit.css` by APPENDING
sections; `tokens.css` by appending.

**Not yours:** `fx/*` (the WebGL rooms, rounds 21-31: the room's own drawing
is not this round's), `core/renderer.js` (keep its render-scale governor:
Josh's standing rule), the card's face (`ui/card.*`, round 27), the boards,
the run strip, `ui/hang.js`, the sprites' art and clips, gameplay,
`game/src/data`, `state`, `combat`. The stand-in room (shown while the stage
warms) must still never show a board over a flat plane.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`; run them as `python tools/on_port.py PORT <test>`
  with your own server up: at least `tests/combat-scene/seam.py`,
  `tests/hand-cards`, `tests/card-face`, `tests/chrome`, `tests/steam-deck`,
  `tests/gamepad`, `tests/combat`, `tests/enemies` (run.py and audit.py),
  `tests/sprites/clips.py`.
- Performance: a fight's frame at the MEDIUM tier must not get slower
  (`tools/gpuprof.py --wait 40 --settle 6`, interleaved against BASE).
- **Do the deliverables EARLY, then refine.** Commit as you go: every recent
  round was cut by usage limits.
- Wrap every capture in `timeout 180`. Stop ONLY the processes you started, BY
  PID. `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 180 python tools/shot.py CODE-combat-boss  --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && timeout 180 python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "$DECK|wait:3"
cd "WT" && timeout 180 python tools/shot.py CODE-combat       --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
