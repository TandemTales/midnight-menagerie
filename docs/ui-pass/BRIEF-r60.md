# Round 60 — the whole decision on one screen, at the larger type

Start from dev at BASE. Read BRIEF-r0.md, BRIEF-r55.md, `docs/ui-pass/SURVEY-2026-11-05.md` and
RUBRIC.md, then inspect all four reference paintings. This brief supersedes overlapping earlier
priorities.

## Why

The house lost its paired test against itself of two weeks ago. After the rooms (round 59), the rest
of the loss is here. Look at each pair, survey 10 first and now second:
`D:/UILOOP/survey10/NOW/<name>.png` and `D:/UILOOP/survey11/NOW/<name>.png`, for `atlas-house-1280`,
`atlas-1280`, `shop-1280`, `gameover-1280`, `settings`, `settings-1280`, `reward`, `event-1280`,
`hud-late-1280`, `map`.

**Josh's larger fonts are his call and they stay. Do not shrink reading text, do not hide any
content, do not drop any card, stat or option.** Nobody has yet fitted the boards around that
type: the chrome stayed the size it was and the content was pushed behind rails. Both paired judges
and both independent judges say the same thing: a player should see the whole decision without
scrolling wherever that can be done.

Note what a hand already proves: at 1280x800 a Trick in the fight's hand is about 165 px wide and
its words are read at a glance. The shop's Tricks are 250 px wide and three of five fit.

## Highest-value changes, in order

1. **The Atlas (`scenes/atlas.*`, `ui/estate-blueprint.js`).** No round has judged it since it became
   `ui/estate-blueprint.js`, and it shows: wing plates cover the footprints, so a house plan reads as
   a flowchart; the legend covers XVII Heart of the House; plates collide; `1 OF 17` is clipped at
   1280 by the title plaque; `Discoveries` and `How to play` are plain web boxes off to the side;
   "ROOM TYPES" collides with its neighbours in the dossier. The drawing must come from the playable
   plans, as it does now, because that is why it changed. Lay it out so **the wings' drawn plans are
   what you see**, at a usable size, on a real plate, with each name small enough to leave its plan
   visible, and the legend clear of every wing. Survey 10's composition is the one both judges chose.

2. **The shop (`scenes/shop.*`).** Five Tricks and every shelf, without a "More wares below" rail at
   1600x900 or 1280x800 if it can be done. Every line of every Trick stays at the reading size it
   has now. Take the room out of the title band, the portrait and the card's art. Keep the painted
   drapes and the bell jars that won. If a rail still has to exist at 1280, the first screen must
   show all five Tricks.

3. **Gameover, reward, event, settings, rest (`scenes/*`, `ui/settings.*`).** The same discipline.
   - **Gameover:** the featured cards, every Final Trick, every stat, with nothing cut off behind
     "More below". An empty "Memorial Record" strip is not worth its height.
   - **Reward:** the rarity plaques are sliced by the action bar at 1280 and hidden at 1600. Lift the
     cards. Keep the gothic windows and the rail.
   - **Event:** at least two whole choices visible at 1280 without scrolling, the lectern and the
     scorched parchment kept. The moonlight wedges are milky; make them painted light or richer.
   - **Settings:** every section reachable and obvious. At 1600 the Tritanopia plate runs 20 px off
     its page and at 1920 a slider's figure runs 9 px off; three columns were whole in survey 10.
   - **Rest:** all four choices visible, keeping the painted blanket fort, which beat everything.

4. **The run strip at 1280 (`hud-late`).** The wing's name cut to `T...` or `TH...` by a full strip
   is a defect, and it hides where you are. Not by adding coins: round 46 proved eighteen coins are
   worse, and legibility beats count.

5. **The map's sheet (`scenes/map.css`, not its drawing).** The floor plan is Josh's and stays, and so
   do the pencils. Both judges call the sheet "milky": deepen it to a saturated cyanotype that holds
   its darks, and let the toolbar cover less of it at 1280 with every control still there.

6. **The last web controls.** `Discoveries` and `How to play` on clubhouse and atlas, the Expedition
   log box, into the family the map's already are.

Prioritize a few strong improvements. **A drawn object beats an empty, dimmed or muted surface. Do
not solve a fit by removing content or by shrinking the words people read.** Chrome and art may give
up the space.

## Art, scope and proof requirements

Painted surfaces are CSS, SVG and code-drawn textures in your own files, or crops and edits of art
the repo holds; keep new committed bitmaps under 8MB, on versioned `game/assets/ui/r60-CODE` paths.
No baked text. Keep the non-negotiables from BRIEF-r55: larger text, global two-thirds animation
speed, no seed in the top HUD, all shop content. No names on hung paintings.

**Who owns what this round.** Yours: `game/src/scenes/{atlas,shop,gameover,reward,event,rest,clubhouse}.*`,
`game/src/scenes/map.css`, `game/src/ui/settings.*`, `game/src/ui/estate-blueprint.js` (layout, not
which plans it draws), the HUD's strip layout, `scenes/r49-board-scroll.js`, and new asset paths. Not
yours: engine, data, state, netcode, renderer, rooms (`fx/`), hand, enemies, fighters' positions, the
floor plan's generation. A button that worked must still work, by keyboard and pad as well.

Prove it with `tests/chrome/run.py`, `tests/steam-deck/run.py`, `tests/gamepad/run.py`,
`tests/blueprint/estate.py`, `tests/scene-css/check.py`, `tests/css-tokens/check.py` and
`tests/readability/run.py`, all through `python tools/on_port.py PORT` so they hit your server and
not :8777. `minFont` in readability must not fall.

Take canonical captures only with
`python D:/UILOOP/r60/capture.py <your worktree> <your port> <your code>`. Then LOOK at all of them
yourself. Commit as you go. Stop only processes you started, by PID.
