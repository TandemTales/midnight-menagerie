# Round 26 — the boards' walls and the dialogs: what the rooms rounds left behind

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit) and `BRIEF-r19.md` in full: this round goes back
to its screens. This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r26.md`.**

## WHY THESE SCREENS

The 2026-09-30 survey (`SURVEY-2026-09-30.md`) put the rooms at 2-5 and the
screens at 6-7.5. Rounds 22-25 rebuilt all seventeen rooms (+2.38 to +3.78
each). What is left on the survey's list is on the screens, and both judges
named every item below independently:

1. **THE BOARDS' WALL PICTURES.** "The three framed pictures on the back wall,
   directly behind the CHOOSE ONE TRICK ribbon ... are grey smeared noise with
   no drawn subject" (reward); "the three framed portraits hung above the
   parchment ... are unreadable mottled blotches" (event); "a half-hidden smeary
   picture of a rabbit toy bleeds out from behind the REST card" (rest);
   "smeared wall pictures behind the centre plinth" (gameover). One shared room
   — the CSS room shell (`RoomScene._shell`; find where its frames and their
   pictures are drawn) — so one fix buys four screens. Round 19's graft hung
   portraits cut from `UI/selectCompanion.png` in some frames; the judges still
   read these as noise at eye level.
2. **THE DIALOGS SIT ON A VOID.** Settings and the pile viewer stand on "a flat
   black void (background 2)". Put the room behind them — the fight's room
   dimmed for the pile viewer, the screen's own room for Settings — not a
   black field.
3. **CONTROLS THAT STILL READ AS WEB.** Both judges: Settings' OFF/ON
   "segmented switches" and its 2x2 colour-palette buttons ("rectangular web
   buttons"); the pile viewer's five filter "HTML dropdowns dressed in gold
   plaques, still carrying a web double-chevron and a select-box inset".
   Round 19 built a brass-lever vocabulary (`ui/objects.js`,
   `tools/prep_ui_hardware.py`, `kit.css`'s round-19 sections): finish the job
   with it — cycling cartouches with painted arrows, levers, swatch plates.
4. **THE SMALL ITALIC.** "Small italic sub-captions of about 9px inside action
   plaques (TAKE NONE, LEAVE IT BE, PACK UP, the gameover Keepsakes) are too
   small at the Deck's resolution in every screen that has them." 11px or more
   at 1280x800.
5. **GAME OVER AT 1280** is "overpacked": a two-column list of 16+ Tricks and
   five Keepsakes at ~9px italic running to the panel's foot. Give it room —
   page it, fold it, or show fewer with the rest on demand.

## WHO OWNS WHAT THIS ROUND

**Yours:** the room shell and the board scenes (reward, event, rest,
gameover); `ui/settings.css`/`settings.js`; `ui/deckview.js` and its sheet
(the pile viewer); `kit.css` by appending; `tokens.css` by appending;
`ui/objects.js` and the existing prep tools, extended (never a second script
with the same job; grep `game/assets` before you name anything).

**Not yours:** `fx/*` and `core/renderer.js` (the WebGL rooms rounds 21-25
rebuilt, the link queue, the stall governor); the run rail and the hand
(round 20); the cards; `ui/enemy.js`; the sprites; gameplay; the coach, the
veil and the toast. **Lay out through your own classes**: a scene sheet that
sets `position`, `display` or `left` on a shared `.kit-*` selector turns
`tests/scene-css` red. The Settings dialog was just fixed to fit above its
footer at 1280 AND 1600 (`489d6c9`): keep it fitting.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`: run them from your worktree as
  `python tools/on_port.py PORT <test>` with your own server up. At least
  `tests/steam-deck` (6/0 now: any red is real), `tests/chrome`,
  `tests/css-tokens`, `tests/scene-css`, `tests/settings-play`,
  `tests/piles-reachable`, `tests/gamepad`, `tests/platform`,
  `tests/dup-keys/check.py`, `tests/seams/check.py`.
- **BASE's server goes on YOUR port + 100**, never on another builder's port.
- Stop ONLY the processes you started, BY PID. Commit as you go.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- `shot.py` sometimes marks bright paper screens void; look at the frame.
- **Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && python tools/shot.py CODE-reward   --port PORT --scene reward   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-event    --port PORT --scene event    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-rest     --port PORT --scene rest     --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-gameover --port PORT --scene gameover --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-settings --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && python tools/shot.py CODE-piles    --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
