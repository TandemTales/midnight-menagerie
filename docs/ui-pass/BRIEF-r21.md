# Round 21 — the fight's room, as the Steam Deck draws it

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), then `BRIEF-r16.md`'s **performance** rules,
which hold unchanged. This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r21.md`.**

## WHY THIS ROUND

The survey (`SURVEY-2026-09-23.md`) named four shared defects. Rounds 19 and
20 fixed three of them: the board wall, the web-form controls and the HUD at
1280. The fourth is the fight's room, and it has two parts:

- **Stair-stepping.** Both survey judges saw visible pixel steps on the
  staircase, rails and columns behind the fight, "an upscaled low-res
  sprite". The survey said to find the cause before anyone draws. Here is
  what we found (2026-09-24, GPU idle, `foyer-boss`):
  - **This machine and the Steam Deck both run the MEDIUM tier.**
    `detectTier` gives `medium` to Intel parts and to any Radeon that is not
    "RX" or "Pro", and the Deck reports "AMD Custom GPU". Medium draws the room
    at `renderScale 0.8` (dpr 0.8) and scales it up.
  - **Forcing HIGH (scale 1.0) does NOT remove the steps.** It makes them
    finer, but the staircase's diagonal strings and rails still stair-step
    at full resolution. The room shader draws those edges as hard steps.
    `fx/shaders/backdrop.js` calls `fwidth` twice in the whole shader.
  - So there are two causes. The one that is yours is the drawing. **Every
    thin line and hard edge the room shader draws must be antialiased: a
    smoothstep over its own screen-space width (`fwidth`/derivatives), so it
    holds at 0.8 upscaled.** Changing the tier table, `detectTier` or the
    calibration is not the fix and is not yours: the Deck will run medium.
  - **Rounds 8 to 18 judged the room sheets at `--tier high`**
    (`variant_sheet.py`'s default), which is not what a player sees. This
    round judges every capture at the Deck's tier.
- **Nobody stands on the floor.** Both survey judges: the Kid and the
  Companion "float with no floor under them", on no ground plane shared with
  the creature they are fighting. The creatures do it too: the Potling and
  the Grave Moth hang mid-air in their rooms, with the floor far below. (The
  float MOTION on the Kid and the Companion was removed on 2026-09-24,
  `ed234bd`. This is about PLACEMENT and GROUND, not bobbing.)

## THE FIX LIST

### 1. THE ROOM'S LINES HOLD AT THE DECK'S TIER — both survey judges

At medium (0.8, upscaled), at 1280x800, no drawn edge in the room may show
steps: stair strings, balusters, rails, column flutes, mouldings, window
bars, frames, the moon's rim. Antialias them in the shader, sized to their
own screen-space width. **Measure it**: crop the staircase (and one feature
per wing) from a Deck-tier capture before and after, look at it at 2x
nearest-neighbour, and do the same at HIGH to prove nothing got blurrier
there. Do not blur the room to hide steps. A soft room is a worse defect than
a stepped one, and the judges are told so.

### 2. EVERYONE STANDS ON THE FLOOR — both survey judges

The Kid, the Companion and every creature stand on one ground plane that the
room's floor actually is. Each gets a contact shadow where its feet (or its
base, or its lowest point for a flier) meet that floor. A flier gets a shadow
on the floor under it, so the eye knows where it is. Scale them against one
another and the room: the survey saw a Kid "a third the height of the Butler
in his mirror". Use the room's own light for the shadows (the key light, the
shafts), not a flat grey ellipse. This is layout plus shading: placement in
the fight's stage layout, and shadow and ground in the room.

**Read what is already there first.** The Kid, the Companion and the
creatures are DOM/SVG drawn OVER the WebGL room. They already stand on a
shared FLOOR LINE of their own, anchored at the feet, with a contact shadow
drawn on it (`ui/enemy.js`: the comments at the top on `SPRITE_RIG_DY` and
`KID_RIG_H`, and around the contact shadow near lines 2385 and 2862). The
defect is that this floor line is not the ROOM's floor: the room's floor
recedes behind the hand far below them, so the shadow lies on a wall. There
are two ways to close that gap, and both are yours: bring the room's floor up
to the line (each region's camera rig is its `cam` in `fx/atmosphere.js`,
which you may change; the floor itself is drawn by `fx/backdrop.js`), or
bring the line down to the floor. A region's `cam` is yours; its palette
COLOURS are not. Whichever you choose, it must hold at
both sizes and in all five judged fights.

### 3. EVERY WING, NOT THE FOYER

The judged screens are four wings. A fix that only fits the Foyer's
staircase is a failure on three screens of five. Also photograph the other
thirteen wings at the Deck tier (a sweep, as round 18) and look at them.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`,
and `fx/shaders/grade.js` only if a fix truly needs it. For item 2, the
PLACEMENT of the Kid, the Companion and the creatures on the fight's stage:
the layout rules in `scenes/combat.css` that place them, and in
`ui/enemy.js` only the code that positions a combatant or draws its shadow.

**Not yours, and several of these landed THIS WEEK. Read them, do not undo
them:**
- `ui/enemy.js`'s FACING (`DRAWN_FACING_RIGHT`) and the removed float motion
  (`ed234bd`). Nobody bobs.
- `scenes/combat.css`/`combat.js`'s stand-in room (`aaafca5`).
- `core/renderer.js`: the tier table, `detectTier` and `_calibrate`.
- The run rail and the hand (round 20 and its graft, `dc30164`), the cards,
  the sprites (48 frames per clip), gameplay and the region palettes.
- `fx/combatfx.js` (the floaters were fixed in round 20's graft).

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** exactly as `BRIEF-r16.md`: both frames against BASE,
  interleaved, three runs each, always `--wait 40`, 15.5 ms hard on both.
  Antialiasing costs derivatives. Report the ms at BOTH tiers.
- **Pin the tier in every capture.** Otherwise the stage calibrates from
  measured frame times, and three builders sharing one GPU will each trim
  their own render scale differently. The `DECK` step below pins medium at
  scale 0.8. Put it in every capture you judge yourself by.
- Tests hard-code `:8777`: run them from your worktree as
  `python tools/on_port.py PORT <test>` with your own server up (`on_port.py`
  does not start one). At least `tests/shader-literals/check.py`,
  `tests/combat-scene/seam.py`, `tests/steam-deck` (the Map boss row is a
  known pre-existing race), `tests/chrome`, `tests/scene-css`.
- Stop ONLY the processes you started, BY PID. Commit as you go. An
  unwritten uniform is `(0,0,0,1)`, not zero. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT
  do.**
- The run rail on a Greenhouse or Graveyard fight still reads "The Foyer ·
  Wing 1". That is the harness's mock run, not a defect.

The Deck step (pass it as `--steps "$DECK|wait:3"`):

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
```

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && python tools/shot.py CODE-combat           --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-combat-boss      --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-greenhouse --port PORT --scene combat --region greenhouse --encounter gh-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-graveyard  --port PORT --scene combat --region graveyard  --encounter gy-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-ballroom   --port PORT --scene combat --region ballroom   --encounter br-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check each capture's `perf.band` (a board with no room behind it means the
warm-up timed out; see the stand-in room) and look at every frame.
