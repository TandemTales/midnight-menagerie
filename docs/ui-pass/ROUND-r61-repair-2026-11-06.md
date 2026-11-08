# Round 61, a repair: the atlas and the shop as drawn objects again

Survey 12 (`SURVEY-2026-11-06.md`) was better than survey 10 overall. But both judges found the atlas, atlas-house and shop worse than survey 10, because they had lost their drawn objects. Rather than run a full round, one builder repaired those three screens in `ui/r61-repair`; it was merged as `361fe127`.

- **Atlas.** Survey 10's plate was the painted `mansion.png`, which `tests/blueprint/estate.py` forbids loading. So the house is now composed from the playable plans:
  - each wing at its own scale and in its own place, five towers turned a quarter;
  - one outer wall round the house wings, with the courts and halls between them hatched;
  - hedged grounds, the vaults below stairs in dashed line, woods on the open lawn, and galleries joining neighbouring wings.

  What round 60 fixed is kept: captions clear of plans, the count whole at 1280, the key in the north-east bay. The fork behaves as before (`tests/held/check.py` 87/0). The plans are still the generator's strips, about 10% smaller than before.
- **Shop.** Bell jars and sweet jars stand on brass plinths, each with its price tag and a dark name plate. All five Tricks, both shelves and Forgetting are in view at both sizes, with no rail, at unchanged type.

**The paired check:** two blind judges, in opposite orders, compared the repair against dev on these three screens: **repair 6, dev 0.** That was atlas and atlas-house by 2 from each judge, and shop by 1.

Tests:
- `tests/blueprint/estate.py` PASS; `estate.py` now accepts a plan turned a quarter, still demands an exact footprint, and checks the scale is uniform.
- `tests/scene-css/check.py`: 0 conflicts.
- `tests/css-tokens/check.py`: 0 undefined tokens.
- `tests/readability/run.py` on the tree before the merge: no font floor fell.

Still open:
- At 1280 the snack row is cramped: "Stubborn Toffee" and "Liquorice" run past their plaques, and the price tags press on the jars.
- The atlas shortens some names ("Quarters", "Passages", "Heart").
- Every wing is still the same tiled rectangle, so a wing silhouette of its own needs the plan generator.
- The parchment is flat and evenly lit.
- The shop's BACK TO THE BLUEPRINT bar is a flat strip.

Judges' answers are in `D:/UILOOP/pairs61r/`; the key is in `PAIRED-r61-repair-key.json`.

## Repair 2: the larger type's collisions, and the map left as it was

A second builder (`ui/r61-repair2`) took survey 12's items 4 and 5. Three of its commits were cherry-picked onto dev:

- **Settings at 1280** (`f86a301f`): every ribbon clears the panel above it by 16 px (it was 3), paid for from the side margins.
- **Lobby** (`0e7fc41c`): the stage stands about 28 px higher, so the trapdoor, chest and rope ladder are whole.
- **Opening at 1600** (`379bcbcb`): the story page is up to 52rem wide, so it ends on the mantel, clear of SKIP and the lantern.

The paired check against survey 12, by two blind judges in opposite orders: **repair 6, survey 12 0.** Settings went 1 and 2, lobby 1 and 1, opening 2 and 2. Tests: scene-css, css-tokens, steam-deck 6/0, map 38/0, blueprint 29/29 and tutorial-restore all pass.

**The map was NOT merged** (`87630b49`, `1f445378`). Framing the whole floor plan, as the judges asked, puts every room name at 5.5 to 7 px on screen. That breaks the large-type rule, and it reverses the 10-28 choice to open at a readable 0.85x. It is a question for Josh, in the questions file, and the branch keeps it.

Key: `PAIRED-r61-repair2-key.json`. Judges' answers: `D:/UILOOP/pairs61b/`.

## Repair 3: the shop's snacks, gameover's seed, the reward's title

Merged from `ui/r61-repair3`:

- **Shop at 1280:** each snack jar is centred on its plinth with its price tag hung beneath it, and every ware's column is at least as wide as the longest word of its name. "Liquorice" and "Stubborn Toffee" now sit inside their plaques.
- **Gameover at 1280:** the seed is laid out like Courage beside it, so COPY and its caption stay inside the panel.
- **Reward:** the title plaque is taller (96-110 px), so ROOM CLEARED hangs below it.

The paired check was against dev captured with the same tool, so neither side shows the preview ribbon: **repair 6, dev 0.** Shop and gameover went 2 and 2, reward 1 and 1. Tests: scene-css 0, css-tokens 0, readability with every font floor equal to the base.

Left open:
- At 1600 the snack tags still press on the next jar.
- A Big Scare reward keeps the old, thinner plaque, because the taller one made that board overflow by 13 px.

Key: `PAIRED-r61-repair3-key.json`.

## Repair 4: the small controls as drawn objects (after survey 13)

Merged from `ui/r61-repair4`:

- **The pencil tray** (`b8168825`): its six brass frames are now three dark enamel cartouches with gilt rims, one per pair (Undo | Clear, X room | Unmark, You are here | Overview). Hand is a cartouche of its own that lights while it is the active tool.
- **Discoveries, How to play and Guardian voice** (`c01532c7`): dark cartouches with a round enamel medallion (book, ?, ghost), set by one rule in `narrative.css` for every scene.
- **The HUD** (`c56dbe28`): Buttons, Clues and Luck now sit on one dark enamel nameplate. The HUD's fit states are identical before and after.

The paired check was against survey 13's captures of dev, which were taken with the same tool: **repair 10, dev 0** across map, hud-late, clubhouse, atlas and combat-boss. Tests: scene-css 0, css-tokens 0, steam-deck 6/6, gamepad 24/24, blueprint pass, map 38/38 (one WebGL flake on the first run).

Left: the location readout and Haunt/Tricks have no plate, because a plate there would change the HUD's fit. The clubhouse's PETS VANISH clipping is cut at 1280. And the samples' double-ruled filigree is richer than these single rims.

Key: `PAIRED-r61-repair4-key.json`.

## Repair 5: the fight's status floaters on a framed board

Merged from `ui/r61-repair5` (`game/src/fx/combatfx.js`, `combat.css`):

- All of a fighter's conditions ("+2 Weak", "+3 Strength") land on one violet enamel board in a gilt rim, one line per condition with engraved rules between them, and the owner's name on a cartouche at the top (`920b2967`, `24004893`).
- The board is kept clear of faces, nameplates, Courage bars and intents. It fades with its last line, and the lines close up as they go.
- Type size and timing are unchanged, and damage numbers are untouched.

The paired check was on combat-crowd only, against dev captured by the same script: **repair 2, dev 0**, by 2 from each judge. The two captures caught the fade at slightly different moments, so this judged the presentation, not the line count.

Tests: combat-scene seam 22/0, combat 695/0, steam-deck 6/0, settings-play 19/0, scene-css 0, css-tokens 0. The r51 queue probe caught a stall in a four-enemy room in the first version, and passes 16/16 now.

**Capture trap:** survey scripts' combat-crowd shot (`--steps ...|wait:3`) fires too late to catch any floaters, so a survey cannot see them. To judge them, re-apply the statuses after the wait, as `D:/UILOOP/r61/judging/REPAIR5/` did.

Left:
- At 1600 a board can touch the Butler's gilt mirror frame.
- The rims are single, not the samples' double-ruled filigree.
- Already broken on dev, and not this change: in foyer-6 the Coatrack Crawler's conditions never show.

Key: `PAIRED-r61-repair5-key.json`.

## Repair 6: six rooms lit to the foot of the frame

Merged from `ui/r61-repair6` (`9d6db13b`, `cbd3d0c7`), in the crypt, kennels, lampworks, bathhouse, kitchens and attic:

- **Near floor:** a "lamp behind the eye" (`nearFloor.foot`, a new floor uniform that is off in every other wing) lights each room's near floor down to the bottom edge. In those six wings the near frame's clutter band is off (`footBand: false`).
- **Edge props:**
  - kennels: the red doghouse moved in and is whole;
  - lampworks: both LAMPS stacks, with their lantern and oil can, are whole;
  - bathhouse: the right-hand copper tub reads as a tub running out of frame.
- **Contact shadows:** firmer in the crypt, attic and kennels.

The paired check was against survey 13's rooms: **repair 12, dev 0.** Lampworks went 3 and 2; bathhouse and kennels 2 and 2; kitchens 2 and 1; crypt and attic 1 and 1.

Tests: grounding PASS (nobody stands through furniture), steam-deck 6/0, and the shader info logs are not empty. The foyer is byte-identical. The greenhouse differs only in its floating motes.

Left:
- The bathhouse's bottom-right corner is still dark tile.
- Near floors are broad, low-detail planes next to `mainMenu.png`'s cobbles.
- The far walls and ceilings want more drawn detail.

Key: `PAIRED-r61-repair6-key.json`.

## Repair 7: the help plaques clear of the corner candle (after survey 14)

Survey 14 lost four votes to one collision: repair 4's wider "How to play" medallion sat over the kit's right corner candle (`.kit-dress__corner--r`).

Merged from `ui/r61-repair7` (`a3f92096`):
- **Rest:** Discoveries and How to play are a row in the footer, bottom left, level with Pack up.
- **Fights:** How to play hangs just left of the corner candle.

No candle was moved or dimmed. The paired check was against survey 14: **repair 6, dev 0.** Rest went 2 and 2; combat-boss and combat-crowd 1 and 1. Tests: scene-css 0, css-tokens 0, combat-scene seam 22/0.

Left:
- The help plaques still read as loose tabs rather than cartouches built into the frame.
- In standalone preview only, the preview flag overlaps rest's status line once the fort is used.

Key: `PAIRED-r61-repair7-key.json`.

## Repair 8: a status bug, gameover's buttons, and a HUD change that lost

From `ui/r61-repair8`, two of three commits were cherry-picked onto dev:

- **The Coatrack Crawler's conditions** (foyer-6, `5e14016a`) never showed. At 1280 no status board fit beside it: the band under the HUD is 56 px, and the gap beside its intent is 178 px against a 231 px board. So every condition sat in the queue all fight. Now, when no board fits, the name goes on two lines and the board may cross the midpoint, clear of a neighbour. A foyer-6 run was added to `tests/ui-r51-spinel/probe-queue.py`, and it passes at both sizes.
- **Gameover** (`2829e674`): the bottom buttons stand 12 px higher, clear of the frame's rule. Paired against survey 14: **2-0.** The judges note that the price was a smaller wing tablet at 1280.

**Not merged:** the HUD pip (`738eaa4b`) lost shop and map, 0-2 and 0-2. Its narrower counter plaque pushes the Luck figure into the scroll end.

**Known red, not new:** `tests/ui-r51-spinel/probe-queue.py` fails crowd-3, all and all-long at 1280 on dev too. The Red Carpet Runner's board misses by a few px beside "How to play", which repair 7 moved. That probe is not in `tools/gates.py`'s list, so the battery does not show it. Fix it next, and add the probe to the battery.

Key: `PAIRED-r61-repair8-key.json`.

## Repair 9: the queue probe's 1280 red

`tests/ui-r51-spinel/probe-queue.py` delivered only 3, 5 and 5 of 6 conditions in its crowd-3, all and all-long modes at 1280. The cause was not a collision. Repair 7 had put the fight's "How to play" into the 69 px band between the HUD and the intents, which is the boards' only room, so the Red Carpet Runner's board had nowhere to land.

Fix (`9c401b2a`, merged): in fights, "How to play" stands over the discard shelf, 12 px above its top and right-aligned with it, placed by a new `_syncHelpSpot` in `combat.js`. It clears every candle, the hand and every plate at 1280, 1366, 1440, 1600 and 1920. `netplate.js` now checks full vertical overlap.

The probe passes 18/18 at both sizes. It prints a `RESULT:` line and is in `tools/gates.py`'s EXTRAS, so the battery runs it now. Also: seam 22/0, steam-deck 6/0, scene-css 0, css-tokens 0.

Left: a condition board can still cover a corner candle's flame (the player's over the left one in combat-crowd, the Runner's over the right one in crowd-3).

## Repair 10: three more rooms lit to the foot of the frame

Merged from `ui/r61-repair10`: repair 6's `nearFloor.foot` and `footBand: false`, applied to the heart, the foyer (parlor) and the sleeping quarters (dormitory), as data only in `game/src/fx/atmosphere.js` (`957d4cff`). The heart's lens stands far back, so its reach is 12 m. Its bottom corners went from 21/31 to 46/61, the foyer's bottom right from 24 to 49, and the dormitory's corners from 8/2 to 37/39.

The paired check was against survey 14: **repair 6, dev 0.** Heart and dormitory went 2 and 2, foyer 1 and 1. Both judges measured that the lift kept the floor saturated, not milky. Grounding passed (captures `589232e5`), steam-deck 6/0, and the graveyard is unchanged.

Left:
- Props standing on the near floor want contact shadows (the heart's candle clusters, the dormitory's teddy).
- The heart's right cluster and the foyer's left chair are cut by the frame.
- The far walls' upper band is soft.
- The foyer's right half keeps a cold blue cast.

Key: `PAIRED-r61-repair10-key.json`.

## Repair 11: gameover's wing strip restored at 1280

Repair 8 lifted gameover's buttons and, at 1280, shrank the route strip under "As far as we got" to a sliver. `ed3cfe1a` (merged) gives the route frame its 66% back (198x57 px, about survey 14's size). The space comes from the padding around the card in the centre column. The buttons still clear the foot rule by 12 px, no text changed size, and 1600 is pixel-identical. The paired check was against survey 15: **2-0.** Key: `PAIRED-r61-repair11-key.json`.
