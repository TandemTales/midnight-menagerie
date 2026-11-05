# Round 59 — the floors come back, and nobody stands in the furniture

Start from dev at BASE. Read BRIEF-r0.md, `docs/ui-pass/SURVEY-2026-11-05.md`,
`docs/notes/2026-10-28-combat-grounding.md` and RUBRIC.md, then inspect all four reference
paintings. This brief supersedes overlapping earlier priorities.

## Why

The house lost its paired test against itself of two weeks ago, 27-6 and 28-5. Most of the loss
is the rooms. A rule added on 10-28 to stop a Companion standing through a chair walks every floor
piece back until its foot is above 42.5% of the screen, across the whole width. Look at these
pairs before you read on, survey 10 first and now second:

- `D:/UILOOP/survey10/NOW/rooms/SURVEY-room-graveyard-yard.png` and the same name in
  `D:/UILOOP/survey11/NOW/rooms/`: the headstones are all behind the fence.
- the same for `nursery-nursery`, `pumpkin-courtyard`, `foyer-parlor`, `study-library`,
  `greenhouse-conservatory`, `crypt-catacomb`, `passages-passage`, `sleeping-dormitory`.
- `D:/UILOOP/survey10/NOW/combat-boss-1280.png` and survey 11's: the same loss with a fight on.

Both judges: objects staged on the near and middle floor, and a camera that keeps walls and
ceiling in frame, beat bare floor and carpet. Round 31, 34, 39, 45 and 47's near floors are still
in the code, walked to the back wall by one pass.

## What must not come back

The 10-28 bug was real: **nobody stands through furniture.** `python tests/grounding/run.py` must
stay green, including a boss, four enemies in a corridor, and water rooms, at 1280x800, 1920x1080
and 1024x768. Fighters stand on floor and never over water. Four Kids must fit: `fight-party` is
in your captures. Do not weaken that test; extend it if your rule needs it.

## Highest-value changes, in order

1. **The clearance rule (`Backdrop.onStage` and the pass at the end of placement,
   `game/src/fx/backdrop.js`).** A piece is only in the way if it is where somebody stands.
   Measure what that is rather than reserving the screen: fighters' soles fall in a known band
   (`_stageFl`, the Kid's boots, the creature row; see `CHECK` in `tests/grounding/run.py`), and
   the hand covers the bottom of the frame in a fight. So at least these are out of everybody's way:
   - low pieces whose whole height projects BELOW the lowest sole line (blocks, balls, a pail,
     a low grave, a basket on the rug): in front of everyone's feet, never behind anyone's legs;
   - pieces behind the fight that stand on lit floor, not dissolved into the back wall's fog;
   - tall pieces at the frame's outer edges, if a window's width cannot bring a fighter to them.
     Resizing must stay safe, as it is now: either hold a margin or re-place on resize.

2. **The camera (`stageRig`, `game/src/fx/atmosphere.js`).** The pitch loop asks for floor under
   `nx = ±0.96` at an aspect of at least 2, at a 44vh sole line. Narrow rooms answer by tipping
   down until ceilings and far walls leave the frame. Keep a party on the floor by a lesser means:
   the width people really stand across, the real aspect, a wider floor (`floorOver`), or a wider
   room. Crypt, Passages, Sleeping, Attic and Hedge should get their vaults and walls back.

3. **Light where the furniture came back to.** The floor falls to black between the back wall and
   the near floor (Foyer, Nursery, Study, Heart). A piece standing there on black has no feet. Give
   the middle of the floor a pool or a carried firelight; a dark room's darks stay deep and saturated.

4. **The Graveyard's near ground.** Scored last by both independent judges. Bring its stones back,
   and find what the translucent grey shape on the lawn is (lower middle of survey 11's capture):
   a thing no player can name is a defect. Solid stones, not a smear.

5. **The Hedge and the Pumpkin courtyard's ground, if you have room.** Soft hedge cells and warped
   flagstones under a good sky. Pumpkins forward across the flags, as survey 10 had them.

Prioritize the rule and the camera: they reach all seventeen rooms. **A drawn object beats an empty,
dimmed or muted surface. Do not solve a collision by deleting the object.**

## Art, scope and proof requirements

Rooms are code-drawn; keep it that way. No baked text, no whole-scene generation. Keep the
render-scale governor and the non-negotiables from BRIEF-r55: larger text, global two-thirds
animation speed. A prop forward of the fight costs what it cost in round 47, so fights stay under
the 15.5 ms budget (`tools/gpuprof.py --settle 14`, on your port, one reading is noise).

**Who owns what this round.** Yours: `game/src/fx/backdrop.js`, `game/src/fx/atmosphere.js` (room
kinds, props, `stageRig`), and tests you extend under `tests/grounding/`. Not yours: boards, CSS,
fighters' positions and sizes (`combat.js`, `combat.css`, `ui/enemy.js`), engine, data, state,
netcode, renderer. If a room needs a fighter moved, the room is what changes.

Prove it with `tests/grounding/run.py`, `tests/combat-scene/` as it stands, `tests/chrome/run.py`
and `tests/steam-deck/run.py`, all through `python tools/on_port.py PORT` so they hit your server
and not :8777. After any change to `fx/`, read `getProgramInfoLog`: a good link can be an empty
program.

Take canonical captures only with
`python D:/UILOOP/r59/capture.py <your worktree> <your port> <your code>`, which writes the PNGs
the judges see (ten empty rooms; four fights at both sizes). Then LOOK at every one yourself: an
empty room that wins and a fight that loses is a loss. Commit as you go. Stop only processes you
started, by PID.
