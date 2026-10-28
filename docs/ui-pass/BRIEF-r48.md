# Round 48 — the boards: rest, event, gameover, shop, and the fight's floating words

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r33.md` and `BRIEF-r36.md` (the controls
rounds), `BRIEF-r40.md` (the 12 px floor at 1280), `BRIEF-r42.md`,
`REPAIR-r40.md`, `REPAIR-r40b.md`, `REPAIR-r41.md` and `BRIEF-r46.md` (what
the boards' paired tests found). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r48.md`.**

## THE RULE THIS ROUND IS BUILT ON

Five times in two weeks a pass removed, shrank, muted, dimmed, smoothed or
tidied something a judge named, and a paired blind test found it worse
(README rows 40r-46). **A drawn object beats an empty, dimmed or shrunken
one.** Where a judge says "cut", "drop" or "collapse", REPLACE the weak thing
with something drawn and readable. Never solve crowding by deleting what the
player reads: the four stats of gameover's eight a judge would keep are not
yours to choose, and rest's button keeps its subline. **And its limit (round
46): in a dense strip, legibility beats count** -- round 46's 18-coin run
strip lost to two coins and a "+8". Where you add, every item must still read.

**Josh's rule:** the hung paintings carry NO names (2026-10-21). Their hang is
`ui/hang.js`, not yours.

## WHY

Survey 10 (`SURVEY-2026-10-23.md`): its paired test found rounds 45-46 better
on every board they touched. Its two independent judges' SYSTEM sections
share two board defects -- **a flat purple felt panel with a list or object
floating in it** (shop's lower panels, rest's option bars, gameover's tricks
table) and **light drawn as flat vector shapes** (the event's and rest's beam
wedges) -- and these five screens carry them.

| screen | what both said |
|---|---|
| **rest** | the Blanket Fort "flat vector art: uniform purple tartan shapes with no folds, the floor a flat beige wedge, and the window ray a translucent quad" / "a plaid tent drawn as clean shapes with dashed stitching lines, flat pillows, a polygon moonbeam" -- "draped blankets with sagging folds over chair backs, quilting texture, cushions with weight, an ink outline, lantern light falling off into real darkness"; the four option rows "identical purple bars" -- "a distinct prop-medallion scene" each; at 1280 "PACK UP AND GO ON / you have not used the fort yet" "squeezes into two cramped lines" |
| **event** | "the moonbeams from the two side windows are flat, translucent grey wedges with ruler-straight edges ... ending in pale grey parallelograms on the floor" / "flat translucent polygons ... flat pale-blue four-pane trapezoids" -- "soft-edged dusty shafts with motes, and a floor patch that breaks over the boards"; "The last four entries..." "pale grey on tan, the weakest text on the screen"; the parchment "one large rectangle" -- "the lectern the text describes, a brass lamp glow at its top edge, a ribbon bookmark" |
| **gameover** | the Final Tricks list "a two-column table of small-caps names with coin bullets and hairline rules, a spreadsheet inside a gilt box" / "an undecorated two-column text table" -- "small card thumbnails or engraved cartouches with cost gems" / "a fanned hand of small cards ... the full list behind a tab"; at 1280 the eight-stat strip "jams its labels together" -- "two rows of four, or icon-plus-number medallions"; the centre "a large black box" -- "a lectern or pedestal and a candle glow" |
| **shop** | the lower panels "flat purple felt boxes; the bell jars and candy jars float on thin gold plinth bars with no shelf, no cast shadow and no candlelight" -- "a painted wooden counter or shelf running across each lower panel, with a contact shadow and a warm pool from the corner candles"; at 1280 the descriptions "about 9-10 px" -- "a parchment slip or hanging tag under each item, one step larger"; the curtains "evenly spaced purple stripes" -- "real folds" |
| **combat-floaters** | "+2 Vulnerable" drawn "across the Butler's face", "+2 Weak / +2 Dexterity / +3 Regen" stacked "over Maya's hair and face ... plain bold coloured type, without the plate, outline or engraved caps the rest of the game uses" -- "the game's display serif with a dark ink outline and a small ribbon or tag behind it, staggered beside the target's head, never over the face" |

## THE FIX LIST

1. **rest:** the Blanket Fort redrawn as painted cloth -- folds and sag over
   chair backs, quilt texture, weighted cushions, an ink outline, the
   lantern's light falling into real dark; the moonbeam a soft dusty shaft
   that keeps the darks, its floor patch broken over the boards. The four
   option rows each their own drawn object or ground (not four identical
   bars). At 1280 the "Pack up and go on" plate wide enough for its two lines
   to read uncramped.
2. **event:** the beams as soft-edged shafts with motes, the floor patches
   lying on the boards (warm wood, cold light) -- never pale quads on the
   darks; the parchment on its lectern with a lamp glow and a ribbon; "The
   last four entries..." in the paragraph's own ink.
3. **gameover:** the Final Tricks as cards -- small card faces or engraved
   cartouches with cost gems, every Trick still listed and readable at 1280
   (a fan of the top few with the rest beneath is fine; hiding Tricks behind
   a tab is not); the eight stats as two rows of engraved medallions at 1280,
   all eight kept; the centre card on a pedestal or lectern in a candle glow.
4. **shop:** a painted counter or shelf under the jars in each lower panel,
   with contact shadows and a candle pool; each description on a slip or tag
   at 12 px+ at 1280; the curtains folded.
5. **The fight's floating words** (`fx/combatfx.js`'s floaters and their
   styles): the display serif with an ink outline on a small ribbon or tag,
   staggered beside the target's head, never across a face. They still say
   exactly what happened, still fade on their clock, and still stack.

## WHO OWNS WHAT THIS ROUND

**Yours:** `scenes/rest.*`, `scenes/event.*`, `scenes/gameover.*`,
`scenes/shop.*`, the floaters in `fx/combatfx.js` and their rules in
`scenes/combat.css`; `kit.css` and `tokens.css` by APPENDING; the existing
prep tools, extended.

**Not yours:** **the map and the atlas** (`scenes/map.*`, `scenes/atlas.*`,
`state/mapgen.js`, `state/floorplan.js`, `ui/blueprint.js`: another session
is rebuilding the map as a floor plan right now), **`ui/enemy.js`, the enemy
plates, `ui/petart.js`, `ui/portrait.js` and the sprites** (also in someone
else's hands), `ui/hang.js` and the paintings, `fx/*` other than the floaters
(the rooms), `core/renderer.js` (keep its render-scale governor: Josh's
standing rule), the cards' face design, the run strip, the hand, gameplay and
data. **Lay out through your own classes** (a scene sheet that sets
`position`, `display` or `left` on a shared `.kit-*` selector turns
`tests/scene-css` red).

## TESTING, TRAPS, DELIVERABLES

- **Disk:** everything on D:/UILOOP.
- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: `tests/chrome`, `tests/steam-deck`, `tests/gamepad`,
  `tests/events`, `tests/gameover-keeps`, `tests/scene-css`,
  `tests/css-tokens`, `tests/seams`, `tests/combat-scene/seam.py`, and any
  shop / rest gate that exists (name in your notes any that does not).
- A small-text probe at 1280 on all five (round 40's
  `D:/UILOOP/r40/spinel/smalltext.py`): every line a player reads at 12 px+.
- Every control you redraw still works by mouse, keys and pad -- every rest
  option and event choice still chooses, every shop item still buys.
- The painting boards hang at random: rest, event and gameover captures pass
  `--hash pics=1`.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works. Stop ONLY the processes you started, BY PID.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. **Say in
  your notes what you did NOT do.** LOOK at every capture.

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
KID="--seed 7 --companion bones --kid maya"
cd "WT" && timeout 600 python tools/shot.py CODE-rest     --port PORT --scene rest     $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-event    --port PORT --scene event    $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-gameover --port PORT --scene gameover $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-shop     --port PORT --scene shop     $KID --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-combat-floaters --port PORT --scene combat --encounter foyer-boss $KID --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:0.6"
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size). The
floaters shot is taken 0.6 s after the conditions land, so the words are on
screen: LOOK that they are, and retake if they have faded. Copy each PNG to
`JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
