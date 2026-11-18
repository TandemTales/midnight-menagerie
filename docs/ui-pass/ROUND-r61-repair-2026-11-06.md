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

## Repair 12: the clubhouse's two clippings

`55fcb6d4` (merged):
- Clue cards i and ii moved below the map card, so "1 / 17 WINGS" reads whole.
- At 1280 the newspaper cutting is widened to 132 px and the slogan strips moved right, so "PETS VANISH" and its sub-line read whole. Fonts were not reduced.

The paired check was against survey 15: **2-0**, by 2 from each judge.

Left:
- The gaps are tight: the sub-line ends at the paper's edge at 1280, and at 1600 the empty cards are 3-5 px apart.
- The five "?" notes are plain tan squares.

Key: `PAIRED-r61-repair12-key.json`.

## Repair 13: four more rooms lit to the foot of the frame

The `nearFloor.foot` recipe of repairs 6 and 10, applied as data in `game/src/fx/atmosphere.js`. Corners are the mean luma of a 160x100 patch, bottom left / bottom right:

| Room | Commit | Corners before | Corners after |
|---|---|---|---|
| Nursery | `6676dd4b` | 9/5 | 58/37 |
| Ballroom | `0fad45be` | 21/1 | 46/26 |
| Study | `618f1b03` | 21/5 | 68/53 |
| Kitchens (lamp widened) | `23569dd1` | 15/9 | 37/18 |

Saturation stays between 0.67 and 0.91, so the floor is not milky. Grounding passed (captures `cb16bb46`), steam-deck 6/0, and the graveyard is unchanged.

The paired check was against survey 15: **8-0.** Nursery, ballroom and study went 2 and 2, kitchens 1 and 1.

Now 13 of the 17 rooms carry the foot lamp. Next, for the rooms: contact shadows under freestanding props, something standing on the near floor band, ceilings fully in frame, and edge objects that read as fragments.

Key: `PAIRED-r61-repair13-key.json`.

## Repair 14: one fixed home for Discoveries and How to play (FRAME3)

Survey 15's first ask. One builder made three designs; the full story is in `HELP-FRAME-2026-11-08.md`.

- FRAME1 used rotated spine labels on the right rail: lost 3-15-2.
- FRAME2 used a horizontal fitting on the bottom-right frame: lost 6-12-2.
- FRAME3 uses two 44 px enamel medallions fixed on the left gold rail, the same spot on every screen, hidden under every dialog: **won 13-7** (`91da720e`).

Every board where the plaques had sat on a candle or peeked from under a dialog went to FRAME3. The two votes it lost by 2 were its focused label, a flat outlined box.

## Repair 15: the focused medallion stays enamel

Focus now lights the medallion's gold rim, and the label is a full cartouche hung beside it. On the clubhouse and atlas it covers its medallion, because their buttons start right beside the rail. Paired on the focused map and fight: **4-0, all by 2** (`e5b32a7e`).

Keys: `PAIRED-r61-repair14-frame{1,2,3}-key.json`, `PAIRED-r61-repair15-key.json`.

## Repair 16: four more wings lit to the frame's foot (after survey 16)

Survey 16 (`SURVEY-2026-11-10.md`) beat survey 15 27-0-39, and both of its judges asked first for the lit near floor in every wing. Five wings still had no `nearFloor.foot`. Repair 16 applies the recipe of repairs 6, 10 and 13 as data in `game/src/fx/atmosphere.js` (`b5469ad9`, merged `c5425b02`): `footBand: false` plus a foot lamp coloured by the light each wing already has.

Corners are the mean luma of a 160x100 patch, bottom left / bottom right:

| Room | Lamp | Corners before | Corners after |
|---|---|---|---|
| Hedge | path lanterns `#d9a66e`, k 2.0 | 36/29 | 80/71 |
| Passages | sconces `#e8a868`, k 2.2 | 27/22 | 57/48 |
| Pumpkin grounds | lanterns `#e8a060`, k 2.0 | 38/13 | 57/30 |
| Graveyard | low warm `#c8945e`, k 1.5 | 0.4/22 | 1.3/35 |

- **Graveyard.** A cool moon tint (`#9cb2d8`, k 2.6) was tried first and greyed the turf, so it was replaced by a low warm lamp. The bottom-left stays black because it is the tomb's own base and shadow.
- **Greenhouse: left out.** Its foreground is planting beds and a stone ledge, not floor. The lamp moved no pixel, so it was reverted rather than kept as a no-op. Lifting those corners (11/18) needs light on the planting, not on the floor.

The paired check was against survey 16's rooms, from the same capture harness: **7-1.**
- Graveyard went 1 and 1, hedge 2 and 1, pumpkin 2 and 1.
- Passages split. One judge preferred the evenly lit boards; the other found them "a flatter salmon-beige wash, slightly milky" beside the runner. If a later survey repeats that, lower its k toward 1.6.

Tests: grounding PASS, steam-deck PASS, pumpkin-grounds 70/70. The other thirteen rooms are unchanged apart from animation-frame noise.

Now 16 of the 17 rooms carry the foot lamp, all but the greenhouse.

Key: `PAIRED-r61-repair16-key.json`.

## Repair 17: the greenhouse's near beds, lit by a lantern

Repair 16 left the greenhouse out. Its foreground, seen from the conservatory's gallery, is brick planting beds under an iron rail, not floor. Two floor attempts failed:
- **The wing's 7 m foot lamp** moved no pixel. From the gallery the near flags are farther away than that.
- **A 16 m lamp on the conservatory view** lifted the bottom-left corner only from 10.6 to 14.0, and lit the whole lower floor, washing the fountain's pool.

Both were reverted. (A first attempt also landed in the palm house's `nearFloor` by mistake. A probe of `uNearFootR` on the live page caught it: the value read 0.)

What merged (`464940bb`, merged `a4d2f87c`):
- The conservatory view's `lampsView` brings the far right cold lamp (`i: 1`) forward as a warm low lantern among the near-right beds (`x -5.2, z 0.04, y 1.1, #e0b266, k 1.6, r 5`).
- The bottom-right corner went from 17.5 to 30.2, and saturation held at 0.49.
- The fountain stays the room's centre. The palm house and vinery are unchanged.

The paired check was against survey 16: **2-0**, each judge by 1, naming the near-right planter and ferns read as warm, drawn objects. Grounding PASS, steam-deck 6/6.

The bottom-left corner (9.6) is the rail's underside beside the existing lantern and stays dark. All seventeen rooms now carry light on their near ground.

Key: `PAIRED-r61-repair17-key.json`.

## Repair 18: the cutting's headline painted again (after survey 17)

Survey 17 (`SURVEY-2026-11-12.md`) beat survey 16, 8-2-56. Its one loss was the clubhouse: the newspaper cutting showed a bare band where "PETS VANISH" belongs.

No game code had changed. Survey 16's own build loses the headline today too, so the browser changed under it. In Chrome 157.0.8103.78 the headline sits at `z-index: auto` inside the cutting's rotated, drop-shadowed paper, and it was not painted. It was visible, styled, set in a loaded face, and the hit test found it on top. Toggling weight, shadow, display and wrapping live changed nothing; giving it its own layer did.

The fix (`5cec5e21`, merged `50aa13d4`) is `z-index: 1` on `.kit-newscutting__head`, inside the cutting's own stacking context, so nothing outside it moves.

The paired check was against survey 17's clubhouse: **2-0.** Help-frame 38/38.

Both judges noted that at 1280 the headline's H sits tight against the paper's torn right edge, though it is not cut. That was true before this repair too. Tightening the letters would edge toward smaller reading type, so it is left.

**For anyone capturing:** a pinned paper prop that loses its text after a browser update is this bug. Give the text its own layer.

Key: `PAIRED-r61-repair18-key.json`.

## Repair 19: objects on the four newly lit near floors

Survey 17's judges asked first for "real objects with feet and shadows" on the near floors that repairs 16-17 had lit: the hedge, the passages, the pumpkin grounds and the heart. They had "gained light and nothing else".

One builder gave each wing's survey kind a `nearPlus` from that wing's own prop set (`36083380`, merged `c16eaa4f`). The kinds are the hedge's `topiary`, the passages' `timber`, the courtyard's `coping` and the heart's `hearth`. Every piece stands at the sides of the floor, clear of the walk or runner:

| Room | Added |
|---|---|
| Hedge | a spiral topiary (left), an urn on its pedestal (right) |
| Passages | book piles with candle stubs, either side of the runner |
| Pumpkin grounds | a straw bale under a lit jack-o'-lantern (left); a big carved pumpkin and a small grey one (right) |
| Heart | a stone bench (left), an armchair (right) |

- **Flags.** Every piece is `keep` and `still`, so the build's random stream and the rest of the room are unchanged. Every piece is also `hand`, so it is left out of a fight, where the cards cover the near floor. The heart's two stand mid-floor, so they show outside fights only. No lighting changed.
- **Tried and reverted:**
  - in the passages, dust-sheeted furniture and a steamer trunk: their shapes are not in that wing's prop program, so only shadows drew; and crate stacks, which read as dark slabs;
  - in the pumpkin grounds, a basket and crates, which would have forced a new prop shader variant;
  - in the hedge, a ball tree that read as a dark slab, and a lower foot lamp, which made no visible difference.

The paired check was against survey 17's rooms: **8-0.**
- Passages, pumpkin and heart went 2 and 2; the hedge 1 and 1.
- Both judges called the hedge's spiral topiary faceted, "closer to a dark-green blob than a clipped yew". A better-drawn topiary is the next step there.

Tests: grounding PASS, steam-deck 6/6, pumpkin-grounds 70/70, heart 44/0, hedge-maze 42/0, link-queue 104 variants, 0 failures.

Key: `PAIRED-r61-repair19-key.json`.

## Repair 20: the passages' book piles lit by their own candle (after survey 18)

Both of survey 18's judges asked first for near-floor objects that are modelled and lit, not silhouettes. The passages' book piles were their first example: "dark, nearly flat slabs".

- **Why they were dark.** At the lens's foot no lamp of the passage reaches them. The room's five light slots (key, fill and three lanterns) are full, so a sixth lamp would drop one of the others.
- **The fix.** The stub burning on the taller pile already draws its own flame. Its light now falls on the books round it (`952228b8`, merged `e09acbde`): an emitted pool in `wfBookPile` (shaders/backdrop.js), as the hall lamp lays its pool on its book. The calf and cloth now read in their colours (red, green, blue, tan), and the open book on the boards shows.
- **First try, too weak:** strength 1.1 with a 0.26 m reach only paled the candle's wax. The merged pool is strength 2.6 with a 0.45 m reach.
- **Scope.** The change is the shape's own paint, so the passages' `backcase` room, whose near floor uses the same piles, gets it too. No other room changed: the pixel diff against survey 18's rooms moved only the passages.

The paired check was against survey 18's passages room: **2-0**, both judges "clearly". Both said the piles now "read as real books", where before they were "near-black silhouettes".

Tests: link-queue 104 variants, 0 failures; secret-passages 74/0; grounding PASS; steam-deck 6/6.

Key: `PAIRED-r61-repair20-key.json`. Evidence: `D:/UILOOP/R20B/`, `D:/UILOOP/pairs61y/`.

## Repair 21: the heart's armchair becomes the gallery's stone urn (after survey 18)

Survey 18's judge 2 found the heart's armchair "dark and drab". It was the house's plain generic chair (shape 0), a near-black mass on the near-right boards. The painted button-back armchair belongs to another wing's prop program and would have forced a new shader variant.

**The fix.** That near-right piece is now the stone urn on its pedestal (81) that the heart's own gallery stands on its near floor (`03e5e850`, merged `66bb78ce`). It is carved and lit, and it balances the bench on the left. It keeps `keep`, `still` and `hand`, so it is left out of fights.

**Placement took three tries:**

| Try | Placement | Result |
|---|---|---|
| 1 | the armchair's spot | the urn hid the far candelabrum's stem |
| 2 | ahead 5.4, across 2.9 | cut by the right frame edge |
| 3, merged | ahead 5.0, across 1.45, hM 1.25 | clear of both |

A piece's screen position follows across ÷ ahead, so the ratio is the thing to set.

The paired check was against survey 18's heart: **2-0**, both "slightly". Both judges said the urn "reads at once" as a modelled object, where the armchair was "a murky near-black mass" that also hid the candelabrum's foot.

Tests: heart 44/0, link-queue 104/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair21-key.json`. Evidence: `D:/UILOOP/R21C/`, `D:/UILOOP/pairs61z/`.

## Repair 22: the hedge's spiral topiary drawn round and in leaf (after survey 18)

Both of survey 18's judges, and both of repair 19's, found the near lawn's spiral topiary "faceted", "a dark-green blob, not a clipped yew". It had three causes, each fixed in the topiary's own shader code (`61ca5836`, merged `89a37fef`):

1. **The groove.** It was `abs(sin)`, which bottoms out in a V. At a near piece's size that V is a hard crease. It is now sin², round at the bottom.
2. **No rounding of its own.** Unlike the tiered stand's pom-poms, the spiral had none, so its relief was the coverage slab's alone, ridged up the medial axis of every notch. That ridging is the flat planes and hard creases the judges saw. It is now a solid of revolution: round across the cone, darker toward its turned-away sides, and each turn swells between its grooves with its upper face catching light.
3. **Leaf scale.** Its leaf was the maze walls' 0.66 m clumps: two or three on a clipped form, reading as facets. A topiary's leaf is now drawn at half that scale.

Fixes 1 and 2 alone barely moved it. Fix 3 is what made it read as leaf. Only arithmetic was added, no noise taps, so the hedge program's link cost is unchanged.

**The paired check** was against survey 18's hedge: **2-0**, both "slightly". Both said the near spiral now reads as "lit, leaf-textured clipped foliage", where the old one was a "smooth waxy green drape".

**One cost, from both judges.** The finer leaf also reaches the back-right ball topiary, which in the old build "separates from the hedge slightly better". If a survey repeats this, give the ball a lighter tone or keep the walls' leaf scale on the ball kind only.

Tests: hedge-maze 42/0, link-queue 104/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair22-key.json`. Evidence: `D:/UILOOP/R22C/`, `D:/UILOOP/pairs61za/`.

## Repair 23: the kennels' hay bales barrel, with straw at the shoulders (after survey 19)

Both of survey 19's judges named the kennels' hay bales "boxy". Their paint was already rich: pressed flakes, stalk strokes, hairy twine, and the stubble on the cut ends. What read as boxy was the OUTLINE, a true rounded box with a ruled edge.

**The fix** is in `ydBaleF` (`7e116423`, merged `c559d7b3`).
- The rounded box now barrels: about 3 cm along and 2.4 cm up, swelling between the twines with the ends bulging. Its shoulder radius is 8 cm, up from 6.5.
- Tufts a few centimetres long stand out of the shoulders.
- The first try (2 cm and 1.6 cm) was too subtle.
- The faces' brightness is unchanged: 46.1 vs 46.5 front and 85.4 vs 85.6 top, measured before judging.
- The bales are the kennels' alone, so no other room moved.

The paired check was against survey 19's kennels: **2-0**, both "slightly". Judge 1 said the new bales are "rounded and puffed at the ends ... read as real hay", where the old were "hard-edged boxes that look like strapped crates".

Open: the stalk strokes on the front still repeat into a woven zigzag at room distance, and the top faces are plain.

Tests: kennels 69/0, link-queue 104/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair23-key.json`. Evidence: `D:/UILOOP/R23B/`, `D:/UILOOP/pairs61zb/`.

## Repair 24: the kennels' near floor lit out to both corners (after survey 19)

Survey 19's judge 2 asked for floors that do not "fade to ... black at the foot of the frame"; judge 1 named the kennels' near floor.

- **The cause.** The kennels' foot lamp had `sides: 0.6`, where every other wing's is 2 to 3, so it lit the middle third only. The frame's lower-left measured 15 of 255, the darkest foot of any room measured.
- **The fix** (`8a6f2f22`, merged `2433488c`): the lamp is now k 4.4, reach 6.0, sides 2.2.
- **The result, measured:**
  - lower corners 31 and 53, from 15 and 33;
  - near flags 29, from 19;
  - the bales' own shadow left deep.
- **First try.** Sides 1.8 at the old strength moved the corners only to 23 and 43.

**The paired check** was against repair 23's kennels, which is dev's state with the barrelled bales, not survey 19's: **2-0**, both "slightly". Both said the near floor "stays a lit, grained warm plank floor out to the frame's corners", and judge 1 measured it and found it not milky.

Tests: kennels 69/0, grounding PASS, steam-deck 6/6. No shader changed.

Key: `PAIRED-r61-repair24-key.json`. Evidence: `D:/UILOOP/R24B/`, `D:/UILOOP/pairs61zc/`.

## Repair 25: the attic's foot lamp out to the corners

This is repair 24's fix for the attic (`e8b9aeaa`, merged `09813eb7`). The attic's foot lamp had `sides: 1.0` and lit the middle third only; it is now 2.2.

- **Measured:** the near-left boards 34, from 24; the lower-right 16, from 10.
- **What stays dark** there is the trunks' and the rolled rug's own shadows.
- **The lampworks and the crypt,** at sides 1.2 and 1.5, were tried in the same capture and did not move a pixel, so their feet are not lit by this lamp. Lampworks is in backdrop.js's `FOOT_WINGS`, a separate foot mechanism. Both were reverted.

The paired check was against repair 24's attic: **2-0**, both "slightly". Both said the near floorboards "stay lit out to the bottom corners", and each measured the corners brighter.

Tests: attic-observatory 53/0, grounding PASS, steam-deck 6/6.

**Frame-foot table** (mean luma of the bottom 80 px in four quarters, at repair 24):
- the darkest corners left are the greenhouse (its front railing, meant), the bathhouse right (4-7, its tub and wall; its lamp is already sides 4.0), the graveyard left (7, moonlit outdoors), the kitchens right (12) and the pumpkin grounds (13-14);
- the lampworks (15) and crypt (17) need their own foot mechanism read first.

Key: `PAIRED-r61-repair25-key.json`.

## Repair 26: LOST, not merged -- the bales' straw lifted

I read the bale fronts' dark blotches as a camouflage mat and lifted them. The stalk noise floor went from 0.55 to 0.68, the off-stroke darkening from 0.76 to 0.88, and the pressed-layer streaks from 0.22 to 0.34. The fronts measured 46 -> 54.

The paired check against dev's kennels came back **0-2**. Both judges preferred the old:
- the old bales "carry visible straw-weave texture and a deeper, candlelit tan that reads as baled hay";
- the lifted ones "read more like stuffed cushions" and are "closer to felt or cardboard".

**Lesson:** the dark blotching IS the straw at room distance. Leave the bales' value range alone. The branch `ui/r61-repair26` (`644fdbf9`) stays unmerged as the record.

Key: `PAIRED-r61-repair26-key.json`.

## Repair 27: the finer topiary leaf for the spiral and cone only

This answers repair 22's one cost, which both survey 19 judges also named: the back ball topiary had been "a touch leafier" before. Repair 22 had drawn every topiary's leaf at half the walls' scale. The ball and the tiered stand round themselves (`gTopTq`) and read as leaf at the walls' scale, so the half scale is now the spiral's and the cone's only (`b1a1a2e8`, merged `c24c8d90`). The ball and the stand are back to survey 18's look; the near spiral is unchanged.

The paired check was against dev's hedge: **2-0**, both "slightly". Both said the back topiaries now "read as clipped leaves ... with moonlit rim edges" and "stand clear of the hedge wall", where repair 22's were "smooth, glossy ... rubbery lumps" that "sink into the hedge".

Tests: hedge-maze 42/0, link-queue 104/0.

Key: `PAIRED-r61-repair27-key.json`.

## Repair 28: repair 23's barrelled bales reverted (after survey 20)

Survey 20 lost the kennels 0-2 to survey 19: the barrelled bales read as "swollen, lumpy ... pillows or felt". Repair 28 reverts the barrel, keeps repair 24's floor lamp, and beats survey 19's kennels **2-0**. Repair 23 is now undone, and only repair 24's lit floor remains in the kennels. See `SURVEY-2026-11-15b.md`.

Key: `PAIRED-r61-repair28-key.json`.

## Repair 29: the lampworks, crypt and pumpkin grounds lit to the frame's corners (2026-11-17)

Survey 20's judges asked first for "near-floor corners lit in every wing". Three of the four rooms left on repair 25's frame-foot table are done (`494f1f32`, merged `d2d9ecbd`); only `atmosphere.js`'s numbers changed.

Mean luma of the bottom 80 px at 1280x800, four quarters left to right:

| Room | Before | After | Change |
|---|---|---|---|
| lampworks | 15 / 34 / 31 / 61 | 24 / 40 / 33 / 73 | foot `sides` 1.2 -> 3.0; `pool2` moved to the near left, k 1.30 -> 2.50 |
| crypt | 15 / 27 / 58 / 71 | 28 / 34 / 63 / 79 | foot `sides` 1.5 -> 2.5; `pool2` nearer, wider, k 1.8 -> 3.2 |
| pumpkin grounds | 14 / 22 / 24 / 12 | 21 / 29 / 32 / 21 | foot k 2.0 -> 3.2, `sides` 2.5 -> 4.0 |

- **Repair 25's note was wrong:** the foot lamp DOES light the lampworks and the crypt. `FOOT_WINGS` in backdrop.js is the props' contact-shadow profiles, not a second floor lamp. The lamp lights both edges alike and one side was already bright, so a moderate `sides` plus the wing's second pool (`nearFloor.pool2`) lights the dark side without overheating the other.
- **The kitchens were left alone.** Their dark right quarter is the near crate and its own shadow; the floor beside it is already lit.
- **Wing-level values:** the wings' other room kinds inherit them. Only the survey kinds were captured.
- **A capture trap:** the FIRST room of a `room_batch` can come out with its camera misplaced. Never put a judged room first.
- **`tests/grounding/run.py` does not take the GPU slot** and times out beside another capture. Run it with the slot free.

The paired check was against the untouched build: **6-0**, all "slightly". Both judges: the near flagstones "stay lit and readable as stone", "not milky". They ask next for firm contact shadows under near props ("the pumpkins' black blob shadows"), and edge-cut fragments made whole (the pumpkin at the courtyard's far left, the candle stand at the crypt's right edge, the lampworks' benches).

Tests: lampworks 45/0, crypt 41/0, pumpkin-grounds 70/0, link-queue 104/0, steam-deck 6/6, grounding PASS.

Key: `PAIRED-r61-repair29-key.json`. Evidence: `C:/UILOOP/s21/R29ev/` (D: was not attached on 11-17, so this session's worktrees and evidence are on `C:/UILOOP/s21/`).

## Repair 30: a globe and books on the study's near floor, a velvet chair in the ballroom (2026-11-17)

The standing open item "something standing on the empty near floor (study, ballroom)" (`c10902f8`, merged `ad9ea642`). Two `nearPlus` lists in `atmosphere.js`'s `ROOM_KINDS`; every piece is a shape the wing's own program already draws, flagged `keep`, `still`, `hand`, so no shader changed and fights leave them out.

| Room | Piece | Placement |
|---|---|---|
| study (`libraryroom`) | the library globe on its stand (54) | ahead 3.4, across 1.65, hM 0.85 |
| study | a book pile with one lying open (88) | ahead 3.05, across 0.85, hM 0.40 |
| ballroom (`music`) | a gilt chair in violet velvet (72, seed 8) | ahead 4.5, across 1.6, staggered behind the gold chair |

Tried and reverted: the globe at hM 1.25 (hid the desk's pedestal), a gold chair at the ballroom's near left (covered the pink chair's legs), and the violet chair level with the gold one (a cloned pair).

The paired check was against the untouched build: **4-0** (study 2 and 2, "clearly"; ballroom 1 and 1). Both judges: the globe is "a new, readable, detailed thing"; the ballroom's chair is "a repeat of a chair already in the room" and "slightly crowds" it. Both ask next for contact shadows under the new pieces' feet (they "float slightly"), and both name the study's open book: "a thin dark flat shape ... reads as a smear rather than a book".

Tests: grounding PASS (24 rows), steam-deck 6/6, link-queue 104/0, study-library 50/0, ballroom 46/0.

Key: `PAIRED-r61-repair30-key.json`. Evidence: `C:/UILOOP/s21/R30-evidence/`.

## Repair 33: the study's open books drawn as books, and feet that stand (2026-11-17)

Both of repair 30's judges named the study's open book ("a thin dark flat shape ... a smear rather than a book") and asked for contact shadows under the new pieces, which "float slightly" (`c8e94c15`, merged `3f7d62a3`).

- **The open book** (`wfBooks`, shape 88, in shaders/backdrop.js) was drawn edge-on, two bowed leaves 3 cm high. It now lies as seen from above: the spread turned a little off square, cloth boards round pale pages, a gutter, lines of text and a small plate, laid before the pile. Every 88 pile in the study wing gets it (three in the survey room). The passages' piles are `wfBookPile`, untouched: their open book is still edge-on.
- **The feet** (`footNear()` in backdrop.js, called where `footOf` returns nothing). The study's globe (54) and book piles (88) and the ballroom's gilt chair (72) use the shadow program's FOOT profile: a pool the size of the object's own footprint and a small dark pool under each foot, in place of the house's wide pool. The feet pools are laid AFTER the shadow loop, nearest piece first: the ballroom has 13 chairs, shadows are laid far to near, and the 64-slot cap had starved the near chairs.
- Arithmetic only: link-queue is still 104 variants.

The paired check was against dev: **4-0** (study 2 and 2, "clearly"; ballroom 1 and 1). The books "show pale readable page spreads"; the chairs' shadows are "shaped pools under the feet that leave the gold tiles lit", where the old were "broad hard-edged dark wedges". Both judges ask next for painted, candle-lit modelling on near props ("flat cut-outs", "flat stickers": the ballroom's chair backs and candle stands), floors' darks holding colour in the far third, and right-edge pieces made whole (the ballroom's clustered chairs, the study's lower-right pile).

Tests: grounding PASS, steam-deck 6/6, link-queue 104/0, study-library 50/0, ballroom 46/0. **Run steam-deck and grounding under `python tools/gpu_slot.py -- ...` when anything else is capturing:** bare, steam-deck gave 10 false timeouts.

Key: `PAIRED-r61-repair33-key.json`. Evidence: `C:/UILOOP/s21/ev33/`.

## Repair 32: edge-cut props made whole; the pumpkins' leaves green, their shadows footprints (2026-11-17)

Repair 29's judges asked for "edge-cut fragments ... brought fully in" and named "the pumpkins' black blob shadows" (`4672ed95`, merged `1826b2a0`).

- **Pumpkin grounds.** The big lantern cut by the left edge stands whole (across -3.05 -> -2.25, hM 1.10 -> 1.00) with its `pool2`; the near-left bale and the right bale and lanterns came in; the sliver at the right edge is set down whole further off.
- **The "black blobs" were not shadows.** They were the pumpkins' leaves and stems, lit by nothing. They now take the moon term the body already had, and read as green leaves. Every pumpkin and bale on the flags also gets a footprint pool through the FOOT profile (`footOf`, pumpkin now in `FOOT_WINGS`).
- **Crypt.** The candle stand cut by the right edge moved a stride back and in (authored x -3.0, z 2.0 -> x -3.3, z 0.9), in the catacomb and the ossuary. The chapel's copy is untouched.
- **Lampworks.** The near benches finish inside the frame: right bench scale 1.00 -> 0.88 and edge 0.70 -> 0.63, left bench across 2.7 -> 1.9, far right bench edge 0.80 -> 0.78.

The paired check was against dev at repair 29: **6-0** (pumpkin 2 and 2, lampworks 2 and 2, crypt 1 and 1). Both judges: each piece now "reads as a complete thing standing on the floor rather than a fragment sliced by the edge". They ask next for painted, ink-lined surface detail on near props (bales, crates, benches: "flat-textured boxes"), something standing on the crypt's wide empty floor and the lampworks' centre aisle, and colour held in the side walls' darks.

Tests: link-queue 104/0, pumpkin-grounds 70/0, crypt 41/0, lampworks 45/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair32-key.json`. Evidence: `C:/UILOOP/s21/R32ev/`.

## Repair 31: the help medallions set in gilt filigree cartouches (2026-11-18)

Survey 16's first open ask: "the help medallions drawn as filigree cartouches, so the bare medallions read as controls" (`2e41d93b`, merged `137f4e3d`). Only `game/src/ui/story.css` changed (+50 lines): four small inline SVG data URIs in the kit's gold, no image files, no JS.

- Each 44 px medallion sits in a gilt setting on the frame's rule: a second outer rule, four studs, a fleur finial above the upper medallion and below the lower, and a leafed lozenge knot joining the pair. Combat's single medallion wears both finials. The enamel face gains a fine inner gold rule.
- The plate has a second inner rule and hangs from a small gilt pin. On the clubhouse and atlas the plate covers its medallion as before, so the pin is left off there.
- Home, size, hit area, order, aria-labels and repair 15's focus behaviour are unchanged. No collision on map, combat-boss, rest, clubhouse or atlas at either size; the tightest spot is combat at 1280, where the lower finial clears the Loose Bones plate by about 15 px.
- Tried and dropped: an 18 px finial (mush at 1:1) and bright gold highlights (the resting medallion looked permanently focused).

The paired check was against dev: **12-0**, all "slightly" (map, rest, clubhouse, atlas, and the two focused views, each at both sizes). Both judges: the medallions are now "drawn fittings", "how the samples seat their round enamel buttons". They ask next for the plate to grow from the mount (a bracket, a cartouche end or ribbon tail, not "one stud"), the rim's dark brown band lifted toward antique gold at 1280, the mount a touch clear of the left screen edge at 1280, and the same mount on the other loose round controls (the TITLE back button, the settings cog) and the map's toolbar and KEY strip.

Tests: help-frame PASS (38 checks), chrome 27/0, gamepad 24/0, steam-deck 6/6, scene-css 0 conflicts, css-tokens 0 undefined, readability no floor moved. `tools/on_port.py` cannot repoint readability (it takes its URL from the steam-deck module); a wrapper is in the evidence folder.

Key: `PAIRED-r61-repair31-key.json`. Evidence: `C:/UILOOP/s21/R31ev/`.

## Repair 34: repair 33's open book and feet carried to the passages and the heart (2026-11-18)

(`9661cdd6` and `68029280`, merged `7cb0bc86`.)

- **The passages' open book** (`wfBookPile`, shape 66 seed > 60) was still the edge-on sliver. It is drawn with repair 33's arithmetic at 1.1x; the two piles and the candle moved 0.07 left so the book lies clear, and repair 20's candle light has a floor of 0.40 on the pages. Measured: the book's region 41 -> 84.
- **A pool under each pile** (`footNear`), where one black blob had spanned both: the floor between the right-hand piles 3 -> 34. The `backcase` kind (`passages:library`) gets both changes and was looked at.
- **The heart's bench** (main room only, the `hand` piece): a shade under the seat and a small dark pool under each paw. The gallery and memory room keep the house's pool: their camera is yawed and a square pool ran out past the bench's foot.

The paired check was against dev at repair 33: **3-1.** The passages 2 and 2, "clearly": the book "lies open and readable as a drawn book with its own contact shadow". The heart split 1-1 on two objects both judges read the same way: the bench's new shadow "seats both legs", but the urn's new footprint pool "spills left" of its plinth, where the house's pool left the foot crisp. **The urn's pool was dropped after judging** (`68029280`); the merged heart is the old urn and the new bench. That combination has not been captured: survey 21 is its check.

Both judges ask next for painted detail on the book piles ("flat colour slabs with no spines, page edges"; their candle stubs "unlit white pegs" with no flame), side tables and candle clusters cut by the frame edges in the passages and heart, and side walls that hold colour.

Tests (before the urn was dropped): grounding PASS, steam-deck 6/6, link-queue 104/0, secret-passages 74/0, heart 44/0.

Key: `PAIRED-r61-repair34-key.json`. Evidence: `C:/UILOOP/s21/ev34/`.

## Repair 35: a charnel stack on the crypt's near flags; the lampworks' rack LOST (2026-11-18)

Repair 32's judges: "the crypt's wide empty floor and the lampworks' centre aisle are bare" (`11d34339` and `a9ffe209`, merged `5f0ee9db`).

- **Crypt, kept (2-0, both "slightly").** A charnel stack (shape 59, hM 1.1, ahead 4.2, across 0.55) on the `catacombs` kind's `nearPlus`, flagged `keep`, `still`, `hand`, with its plinth's footprint in `footOf` (`crypt` is now in `FOOT_WINGS`; everything else in the wing returns null). Judges: "a readable object that has a base and a contact shadow", but "its black triangular face reads as a flat cutout" of "stamped, identical skulls".
- **Lampworks, LOST 0-2, left out.** A candle-dipping rack (43) beside the aisle: "a see-through lattice laid over the room's focal point", its rods "tangle with the benches and kiln mouth behind it". The rule both judges drew: a mid-floor piece helps when it is "a solid, grounded mass in an otherwise empty stretch of floor" and hurts when it is "a thin lattice in front of detail that was already reading well". A comment at the `lampshop` kind records it.
- Also tried and dropped by the builder: a statue in the crypt (a murky near-black figure) and a gas standard in the lampworks (no lamp reaches it: a black pole).
- **In these two rooms `across` positive lands screen-LEFT** (the rooms draw mirrored).

Next, from both judges: the skull stack modelled (side planes, candle-lit skulls, varied shapes), and darks that hold colour in the side aisles.

Tests (with both pieces in): link-queue 104/0, crypt 41/0, lampworks 45/0, grounding PASS, steam-deck 6/6. The merged state, crypt piece only, was not re-run; the battery is its check.

Key: `PAIRED-r61-repair35-key.json`. Evidence: `C:/UILOOP/s21/ev35/`.

## Repair 37: the book piles painted as books, and the candle lit (2026-11-18)

Repair 34's judges, first on both lists: "the book stacks are still flat colour slabs with no spines, page edges or candle flame, and the candle stubs on top are unlit white pegs" (`f5a1577a`, merged `e6e672c3`). Only shaders/backdrop.js changed; arithmetic only, link-queue still 104.

- **Why they were slabs:** the old page test came out about 1 everywhere, so every book was painted as its cloth alone.
- **Why the candle was a peg:** the flame was always drawn, but ABOVE the wax and outside the shape's silhouette, where pixels are discarded; repair 20's light pool then multiplied the stub to white. **The same clipped-flame bug is still in every other `wfCandle` user** (the passage table's stub in `wfServTable`, the torchere, the hall table's chamberstick): their flames never draw. Open.
- **One shared painter, `wfBookFace`,** in both `wfBookPile` (passages) and `wfBooks` (study, at 0.75 scale). About six books in ten show a spine (leather with a sheen line, raised bands, and by seed gilt bands with a lettering-piece and lozenges, plain bands with a lettering-piece, or cloth lettered between two gilt rules); the rest show a fore-edge (boards overhanging an inset, ruled page block, stained red or gilt). Two in three lie turned; each lays a dark line on the one beneath.
- **The passages' candle:** flame and wick inside the silhouette, an ivory stub on a brass saucer with a drip, standing on the top book. The study's piles get no candle.
- Dropped along the way: pale page blocks (washed the piles lighter), all-black lettering-pieces ("cassettes").

The paired check was against dev at repair 34: **4-0, all four "clearly"** (the passages 2 and 2, the study 2 and 2). The old piles "read as placeholder geometry"; the new are "drawn as books". Both judges ask next for the lit candles to throw a warm pool on the books and boards ("the flame currently lights nothing"), the same paint on the passages' crates and side tables ("near-silhouettes", and cut by the frame edges), and the study's far piles lifted so their spines survive.

Tests: link-queue 104/0, secret-passages 74/0, study-library 50/0, grounding PASS (24 views), steam-deck 6/6; 192 programs linked with live uniforms.

Key: `PAIRED-r61-repair37-key.json`. Evidence: `C:/UILOOP/s21/ev37/`.

## Repair 38: every candle lit, and its light on what it stands on (2026-11-18)

Repair 37 left open that "the same clipped-flame bug is still in every other `wfCandle` user", and its judges asked for the candles to light something. Repair 38 (`bdf359bf`, merged `df8b2c3a`) closes the first and half of the second. Only shaders/backdrop.js changed; arithmetic only, link-queue still 104.

- **The flames.** A new `wfCandleLit(c, h)` returns flame and wick as a silhouette, and each caller adds it to its own: the torchere (shape 65: foyer, ballroom), the passage table's stub (`wfServTable`), the hall table's chamberstick (`wfHallTable`: the gallery's pier tables). The torchere's head was lowered 0.085 on a shorter stem, because its candles reached the top of the quad and left no room for a flame. `wfCandles` (shape 58) already drew its flames.
- **The light on the support.** Each support's own colour times a warm tint with exponential falloff, wax and flame masked out: the passage table's edge (luma 16 to 35), the pier table top (34 to 58), the torchere's pan (44 to 54), the top book of each pile (56 to 79, 90 to 111). On the piles a tight pool (1.5 at reach 0.15) sits over repair 20's broad one; 0.9 was invisible at survey distance and 2.0 paled the blue top book.
- **Not done: a pool on the boards.** A prop paints only inside its own silhouette, so it cannot light the floor; that needs the room's `nearFloor` pools in atmosphere.js. Both judges ask for it next ("the flame is a bright tip with almost no glow or cast light").

The paired check was against dev at survey 21: **8-0** (ballroom 2 and 2, foyer parlor 2 and 2, foyer gallery 1 and 1, passages 1 and 1). The old candelabra were "bare unlit sticks that read as empty forks". Next, from both: the flames throwing a pool on the floor and a spill on neighbouring chairs and tables; near objects modelled with painted light and shade; the dark thirds (gallery mid-floor and left corner, parlor left wall, passages ceiling and recesses) holding colour.

Tests: link-queue 104/0, grounding PASS, steam-deck 6/6, secret-passages 74/0, foyer 66/0, ballroom 46/0.

Key: `PAIRED-r61-repair38-key.json`. Evidence: `C:/UILOOP/s21/ev38/`.

## Repair 39: darks that hold a hue (heart, ballroom); the study and the crypt left out (2026-11-18)

Survey 19, 20 and 21's judges asked for "darks that hold colour instead of falling to black along the room sides and far floor". Repair 39 (`df3b2999` + `17317273`, merged) found what sets those darks and added one knob.

- **What crushes them:** not the ambient (a doubled, saturated ambient moved every region by 0.1 of 100), not the vignette (x0.62 at the mid-edge), not fog. It is the grade's contrast power curve (1.61-1.69), which takes barely-lit walls and their hue to black.
- **The knob:** a uniform `uShadowHue` in `shaders/grade.js`, set per wing by `shadowHue`, `shadowAmt`, `shadowGain` in atmosphere.js. Before the contrast curve, a pixel under 0.10 linear luminance is mixed toward the wing's deep hue at its own luminance: multiplied, never added, so black stays black and nothing above 0.10 moves. It defaults to zero. No new variant (link-queue 104). It applies to every room kind of a wing that sets it, and to all darks on the WebGL canvas.
- **The paired check**, four rooms against dev: heart (oxblood-plum `#5c1230`, 0.7) **2-0**; ballroom (violet `#4a1670`, 0.7, gain 0.85) **2-0**; all "slightly". The study (oxblood `#6a1420`) and the crypt (indigo `#2a2466`) each **split 1-1**: one judge liked the hue, the other found the study's "red wash over the darks turns the [rug's navy] border maroon" and the crypt's "cool blue-grey cast ... lifts and greys the dark" over warm stone. Both were taken out before the merge (a comment marks each).
- **The lesson:** a shadow hue wins in the room's OWN colour family where no other local colour lives in the darks, and loses where it crosses a local colour (navy on red) or runs against the room's warmth.
- Value moved under +3.3 of 100 everywhere; untouched wings (attic, kitchens) were pixel-identical or within 1/255.

Both judges ask next for the far floor band under the far wall carried "by drawn detail and local light rather than by a tint" (it "still collapses to a featureless black strip", losing the feet of the heart's statues and the ballroom's column bases), and local candle light on the side walls at the frame edges.

Tests (all four hues in): link-queue 104/0, study-library 50/0, heart 44/0, crypt 41/0, ballroom 46/0, steam-deck 6/6, grounding PASS, shader-literals 0. The merged state (two hues) was not re-run; the battery is its check.

Key: `PAIRED-r61-repair39-key.json`. Evidence: `C:/UILOOP/s21/ev39/`.

## Repair 40: the ballroom chairs and the crates painted, not smooth models (2026-11-18)

Survey 21's judges: the near props "still read as smooth 3D models rather than brushwork (the lampworks crates, the ballroom chairs, the pumpkins)". Repair 40 (`827b4511`, merged) repaints three of them. Only shaders/backdrop.js changed; no silhouette, size, variant or noise tap (link-queue 104).

- **Why the detail was not reaching the screen:** the chair's and the lampworks crate's painters already drew much of it, but the prop luminance ceiling compressed their lit surfaces to one value. The form now goes on the lit colour AFTER the ceiling, through the existing `gWgShade` hook. The passages' crates were simply unlit (luma 4-7 beside a floor at 90).
- **The chair** (`wfArmchair`, shape 72; the foyer's hall chair, 63, shares it): frame as a moulding with a lit and a shaded edge, upholstery set in under the frame's shadow, a seat top and front with a welt, a reeded rail, a highlight down each leg, scroll arms. In the ballroom program a higher saturation cap so the gilt reads gold, not "pale, chalky stone-grey". Dropped: hard per-tuft facets (corrugated stripes; now a 16% swell), a dark seat front on the hall chair (a black slab).
- **The passages' crate** (shape 8; also at the kitchens' walls): each board its own value with a lit upper edge, battens and brace with lit and shaded edges and a ruled shadow, nails, grain; a share of the room's warm rim light (`albedo * rim * 0.14`) and a raised saturation cap. Luma 4 to 14 and 7 to 22; the floor unchanged.
- **The lampworks' crates:** the same board, gap and batten drawing on the lit colour, the label and packed lamps excluded. Seams are continuous where they were dashes that "cut through the lettering".
- **The pumpkins were not touched.**

The paired check, five rooms against dev: **10-0** (ballroom 2 and 2, lampworks 2 and 1, passages 1 and 2, foyer 1 and 1, kitchens 1 and 1). Next, from both: far and corner props (kitchen crates, the passage crates behind the tables) given a rim of candlelight so they read without zoom; ink contours and painted highlights on near props; plank ends, nail heads and carved rails "in place of noise grain".

Tests: link-queue 104/0, ballroom 46/0, lampworks 45/0, secret-passages 74/0, pumpkin-grounds 70/0, grounding PASS, steam-deck 6/6. Built before repair 39 merged; the two touch different files.

Key: `PAIRED-r61-repair40-key.json`. Evidence: `C:/UILOOP/s21/ev40/`.

## Repair 41: the lit candles throw a pool on the floor (2026-11-18)

Repair 38's judges, first on both lists: "the flames ... throw light, a pool on the floor"; "the stands still float slightly". Repair 41 (`42d0f748`, merged `1143dfdc`) does it for the passages' two near book piles, the ballroom's two near candelabra and the foyer parlour's two nearest torcheres.

- **How:** a room's own near pools (`foot`, `pool`, `pool2`) are a fixed set and cannot follow a prop. The floor's four SHAFT-pool slots can, the way the kennels' doghouse glow does. A room names which candle props throw a pool (`pal.candlePools` in atmosphere.js; a room kind may carry its own); `_candlePools()` / `_poolCols()` in backdrop.js put each at the placed prop's position; a slot flagged `uPoolAxis.w = 2` is laid as floor albedo x flame colour with a tight falloff (10 lines in the floor's shaft-pool loop of shaders/backdrop.js; the stock formula's constant haze term is not used). `candleFoot()` gives the torchere's tripod a contact shadow. No new uniform, variant or noise tap (link-queue 104).
- **Slots are shared with the room's shafts.** The ballroom has six shaft pools for four slots: giving candles three or four dimmed the far checker (20.1 to 15.4), so only the two near candelabra get one. The foyer loses one of three faint moon pools (at most 2 luma on the far boards). In a fight a candle hidden under the hand or struck from under a fighter hands its slot back.
- Pool luma: passages 44 to 63 and 42 to 56; ballroom 41 to 57 and 47 to 61; foyer 24 to 39; darks (p5) and the far floor unchanged; the attic 0 pixels.
- Not done: candles warming the wall panel behind them (nothing follows a prop onto a wall). The ballroom's other kinds and the passages' library inherit the config and were captured after only.

The paired check, three rooms against dev: **6-0** (foyer 2 and 2, ballroom 1 and 1, passages 1 and 1). "A warm pool round the foot plus a dark contact shadow plants the object." **What both held against it:** the ballroom's pool "spills wide enough to lift the near-left black tiles toward brown" and "the rose petals lying in that pool bleach from red to pale pink"; the passages' boards "flatten toward a plain tan". Next: the pools tight and not bleaching what lies in them; the same grounding for the foyer's far chairs and the ballroom's right-hand chairs.

Tests: link-queue 104/0, secret-passages 74/0, ballroom 46/0, foyer 66/0, grounding PASS, steam-deck 6/6. Built before repair 40 merged (shaders/backdrop.js auto-merged); the battery is the merged state's check.

Key: `PAIRED-r61-repair41-key.json`. Evidence: `C:/UILOOP/s21/ev41/`.

## Repair 36: the plate grown from its mount, the other round controls mounted (2026-11-18)

Repair 31's judges asked for the help plate grown from its mount, the rim lifted to antique gold at 1280, the mount clear of the left edge, and the same mount on the other bare round controls. Repair 36 (`2e6f4670`, merged) does all four in CSS (kit.css, hud.css, story.css; one class added in clubhouse.js and atlas.js).

- **Mounts:** new tokens `--kit-mount-ring` and `--kit-mount-crested` (inline SVG reusing repair 31's gradient, studs and knots) and `.kit-medallion--mounted`. The clubhouse's Title and the atlas's Back button wear the outer gold rule, four studs and a small leafed crest above and below; the settings cog wears ring and studs only (7.5% overhang: 9.1% ran over the rail's rules). The atlas's "The whole house" button has the class but is hidden in the survey view and was never seen rendered. Gameover's Title (one of a row of three) and the lobby's painted medallion are unchanged.
- **The plate:** the pin is gone; a gilt collar on the ring's right side sends a leaf along the plate's top and bottom edges (`--st-yoke`).
- **Rims:** a masked gold glaze at 58% over the bronze rim; ochre at rest, lit on focus as before.
- **1280:** the rail at `left: 6px` (was 4) up to 1400px wide.
- Dropped: a lozenge boss on the yoke (overlapped the "H"), a crestless ring on the back buttons (a faint second rule), a full fleur finial on Title (would cross the string-light wire at 1280).

The paired check, seven screens at both sizes against dev: **14-0**, all "slightly". "The worse version leaves the cog's ring off-centre inside the strip's end cap, so two arcs collide, and its back button rim is too dark to read as gold." Next, from both: the strip's other buttons (fire, deck) and the left "n" button given the cog's rim, since "the cog now outranks its neighbours"; the cog ring "crowds the 16/0 beside it"; rims and bracket modelled with a bevel highlight, not "flat single-tone gold"; the back button's enamel "nearly black rather than purple"; bolder finials for the Deck; the How to play plate covering "THE WAY IN" on the map (in both versions).

Tests: help-frame PASS (38), chrome 27/0, gamepad 24/0, steam-deck 6/6, scene-css 0, css-tokens 0, readability no floor moved. Not captured: the Discoveries plate's yoke, and `hud-late` with a full keepsake row.

Key: `PAIRED-r61-repair36-key.json`. Evidence: `C:/UILOOP/s21/ev36/`.

## Repair 42: the pumpkins ribbed, the crypt's skull stack a heap of skulls (2026-11-18)

Survey 21 named the pumpkins among the "smooth 3D models"; repair 35's judges asked for the skull stack "modelled (side planes, candle-lit skulls, varied shapes)". Repair 42 (`ac9ed202`, merged) repaints both. Only shaders/backdrop.js; arithmetic only (link-queue 104); no silhouette grew.

- **Pumpkins** (shape 27, pumpkin grounds only): each lobe a shaded flank, a turn and a crisp lit crown on the key side, its own value by seed; grooves a deeper, redder orange; a lit and a shaded side of the body; a dark line at the ground; a twisted stem with a pale cut end. Values through `gWgShade`, hues in the paint. They were not at the luminance ceiling (luma about 35): the shading was soft, not compressed. Faces, glow, leaves untouched. Dropped: a flank of 0.64 (near-black far side; now 0.72), a full-strength groove through the nose ("a scar").
- **Skull stack** (shape 59, `wfCharnel`, crypt only): the outline follows the skulls, cut INTO the old triangle; a second rank of shaded skulls in the gaps and a warm dark behind; each skull varied in size, tip and turn, one in five jawless, end skulls turned outward, with a lit side, a crescent of warm shade, brow, teeth and cheek line (`crSkullV` / `crSkullLit`; `crSkullP` unchanged for its other users); warm ivory bone; the plinth with a lit top edge. Dropped: a straight terminator ("a two-tone ball"), a steep brow ("sunglasses"), centred skulls (flat-clipped crowns).
- The headstones were left: their painter is shared with the graveyard and already has thickness, lettering and weathering. The graveyard is pixel-identical.

The paired check against dev: **4-0** (crypt 2 and 2, pumpkin 1 and 2). The old stack was "flat identical skull icons on a solid black triangle that reads as a cut-out sign". Next, from both: pumpkin ribs as rounded lobes narrowing to stem and base, not "even pale/dark vertical stripes", and their stair-stepped edges cleaned; the crypt's FAR wall skull piles brought up to match; the hay bales "a camouflage blotch rather than straw" and vine leaves "flat green smears"; firmer contact shadows under the pumpkins.

Tests: link-queue 104/0, pumpkin-grounds 70/0, crypt 41/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair42-key.json`. Evidence: `C:/UILOOP/s21/ev42/`.

## Repair 44: the foyer's furniture on its own footprint shadows; the tightened pools lost (2026-11-18)

Repair 41's judges held two things against its candle pools (black tiles lifting to brown, petals bleaching to pink) and asked for the far furniture's feet grounded. Repair 44 (`beb57ee1` + `2243fd73`, merged) tried both.

- **The pools, tightened: LOST 0-4.** The builder found the cause of the bleach (the grade's ACES shoulder mixes channels when a near-maximum crimson is driven 7x) and made the pool tighter, weighted by the floor's own value, and capped per room so nothing over the ceiling takes light. It measured as asked (petals H 9.9/S 0.76 back to H 3.7/S 0.83; black tiles 4.2 back to 2.9). **Both blind judges preferred repair 41's pool** in the ballroom and the passages: "the same room a shade dimmer". Reverted before the merge; a comment at the candle branch says so. **The lesson: a judge who names a flaw in a winner is not asking for less of the winner.** The complaint was real in a crop and the cure cost the light that won. If this is tried again, keep the pool's brightness on pale tiles and boards and treat only the petals (their own albedo term).
- **Feet on the floor: WON 2-0, both "clearly".** A kind flag (`feet: true`, the foyer's parlour only) gives footprint shadows through `footNear`: a thin shade under the rail and a small dark pool at each foot, for the hall chairs (63), vitrines (64), pier table (66) and the clock's plinth (62). "The near green chairs' feet carry dark contact shadows joined to the legs", where dev's was "a detached blob below the feet so both chairs float". The stair hall and gallery are left: their cameras are turned and a square-laid pool would run out from under the furniture.
- **Skipped:** the ballroom's far-right chairs. They stand on black floor with unlit legs, so a contact shadow cannot show; the real fix is a third candle pool from the candelabrum among them, which costs a shaft slot.

The merged state (feet with repair 41's pools) was captured (`ev44/final-*.png`): the passages are pixel-identical to dev, the ballroom within 1 level on 193 pixels, the foyer keeps the feet. It was not paired on its own; survey 22 is its check.

Next, from both judges: foot shadows "shaped by the object and the light direction rather than flat black ellipses"; the candle pools "shaped by the objects, with a cast shadow thrown away from the flame"; the ballroom's left pool "ending in a straight vertical edge".

Tests (merged form): link-queue 104/0, foyer 66/0, ballroom 46/0, secret-passages 74/0, grounding PASS.

Key: `PAIRED-r61-repair44-key.json`. Evidence: `C:/UILOOP/s21/ev44/`.

## Repair 45: the hay bales as bound straw, lobed vine leaves, the crypt's far skull piles (2026-11-18)

Repair 42's judges: "the hay bales are a camouflage blotch rather than straw, and the vine leaves are flat green smears"; "the far wall piles brought up to match". Repair 45 (`988fca28`, merged). Only shaders/backdrop.js; arithmetic only (link-queue 104; the bale uses two FEWER noise taps); no silhouette changed.

- **The bale at last** (shape 86 in `gkDraw`, pumpkin grounds only; the kennels' bales are a separate painter, `ydBalesPaint`, and did not move). It had lost twice as noise-straw (repair 26) and as a rounded "pillow" (repair 23). This time the two thresholded noises and the pillow shading are GONE and three ruled faces are drawn: a long face of six pressed layers, each its own straw-gold swelling to a lit upper edge with a thin dark line between and short cut-stalk strokes; a lit top; a shaded, stippled end; two pale twines with a shadow and a pinch; a dark line at the ground. First try (five wide olive bands) "read as a plank crate"; narrower wobbling bands and a warmer gold fixed most of it.
- **Vine leaves** (`pkLeaf`): sinuses cut into the old outline, a bowed midrib with a lit and a shaded half, side veins, the pumpkin's shadow where the leaf lies under it. About 12 px tall: what survives is the two-tone split and the notched outline. A deep sinus (0.20) made propellers; now 0.08.
- **The far skull piles** are the same `wfCharnel` as the near stack; at 5 px per skull the detail term is 0 and repair 42's modelling fell to one flat value. Each skull now keeps a lit and a shaded side and its socket at that size (luma 16 to 21, 17 to 24). The ossuary kind shares it (captured after only).

The paired check against dev: **4-0** (pumpkin 2 and 2, crypt 1 and 1). Both judges were asked to name every object that differed: the bales decide the courtyard ("lit-topped blocks with stacked straw layers and twine", where dev's were "camouflage-mottled slabs with no top face"); the leaves one judge better, one no preference. **Both still say the bales "lean toward plank crates"** and want "loose straw ends and a ragged edge rather than straight bands"; the lit tops "a little pale"; eye sockets on the far skulls; darks that keep colour on the bales' shaded sides.

Tests: link-queue 104/0, pumpkin-grounds 70/0, crypt 41/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair45-key.json`. Evidence: `C:/UILOOP/s21/ev45/`.

## Repair 43: one family of mounted buttons on the HUD rail, rims modelled, plum enamel (2026-11-18)

Repair 36's judges: "the cog now outranks its neighbours and the strip looks uneven"; the rims "flat single-tone gold shapes"; the back button's enamel "nearly black rather than purple". Repair 43 is four commits, each cut-able alone (`fc7f43e5` rail, `47b452ad` modelling, `88abfdd1` enamel, `d7ceef52` crest; merged). CSS only: hud.css, kit.css, story.css.

- **The rail:** the wing ("n"), Courage heart, Haunt and deck medallions, and the purse's coin, magnifier and star on the tight rail, wear the cog's ring and studs, all one size (1.19 chip heights; 1.24 touched the channel's rules). **The cog's enamel FACE is drawn at 90.3%** so its ring fits inside the rules and matches its neighbours; its button box, glyph and hit area are unchanged. Beyond the brief: on the tight rail (1280) the purse and Haunt glyphs sat against the LEFT EDGE of their medallions (a flex box with no centring); they are centred now. Both judges read the old state as "a layout bug".
- **Modelling:** in the mount tokens (`--kit-mount-ring`, `--kit-mount-crested`, `--st-ring`, `--st-finial`, `--st-knot`, `--st-yoke`), a heavier bronze band with a light arc upper-left and a dark arc lower-right, studs with a specular dot, leaves with a lit half and a vein. Flat tones in arcs, no gradients; holds at 1280.
- **Why the back buttons were near-black:** `.kit-btn--quiet` filters the WHOLE button `saturate(.55) brightness(.86)`, greying the medallion and its mount too. The mounted medallion now takes the inverse filter, plus a plum glaze. Gameover's Title and "Go straight back in" medallions are greyed by the same filter and were left.
- **Crest:** longer leaves and a taller lozenge in the same box; clears the clubhouse's string-light wire.
- Dropped: a 4px margin on the cog (cost the Gear belt a socket on hud-late at 1280), glyph centring on every chip icon (shrank the grid-box glyphs).
- Skipped: the gameover stat strip (already plaques from repair 11), the map's pencil tray.

The paired check, eight screens at both sizes against dev: **16-0**; the six screens showing the rail "clearly", atlas and clubhouse "slightly". **What both held against it:** at 1280 the rims sit "tight around the purse figures" (137, 246, 2, 4) and on hud-late "hard against the Courage bar's end cap", no overlap; "the gear loses its outer ring and leaves a faint ghost arc on its right". Next: the ghost arc removed; a pixel or two of air between rims and counts at 1280 without shrinking type; the same rim on the map bar's zoom -/+ and the arrow knobs; the How to play plate clear of "THE WAY IN"; the header plates that butt the title cartouche at 1280 on clubhouse and atlas (in both versions).

Tests: scene-css 0, css-tokens 0, chrome 27/0, gamepad 24/0, steam-deck 6/6, readability every floor unchanged. **help-frame failed for the builder three times, identically on the untouched build** ("Unable to capture screenshot" at the first hand capture): machine state under three builders; re-run on the merged build with the GPU quiet.

Key: `PAIRED-r61-repair43-key.json`. Evidence: `C:/UILOOP/s21/ev43/`.

## Repair 47: the candle stands, the heart's statues and urn, the gallery's bust modelled (2026-11-18)

Surveys 21 and 22: prop surfaces "still read as rendered rather than painted ... not just on the repaired props"; candle stands "flat stickers"; the gallery bust "a flat, evenly toned cutout". Repair 47 is three commits, one per object (`fa198750` torchere, `a6e0196a` heart, `a60b1f87` bust; merged). Only shaders/backdrop.js; arithmetic only (link-queue 104); no silhouette moved.

- **Torchere** (shape 65; foyer parlour, ballroom): a helper `wfGilt` gives every tube a highlight down the key side and the brass's own shade on the far side; knops as balls with a spark and a dark line beneath; arms lit along the upper edge; pans with a lit rim; feet lit along their backs. **The saturation cap was the measured problem** (the stem sat exactly at the 0.42/0.62 cap's limit); shape 65 now gets 0.54/0.76 in the wing-4 program, as the gilt chair does.
- **The heart's veiled figures** (`stDrawG`): folds as facets through a new `stFacet` (a dark line in the trough, a lit ridge on the wall facing the key), only where a fold is 6 px or more; the trough ink came DOWN 0.85 to 0.50, since with the facet line it read as a black cord. **Plinth and urn** (shape 81): cornice lit above and shaded below, a sunk panel with a shadow and lit inner edges, the vase turned with a core shadow and a reflected far edge. The hedge shares statue and urn and is pixel-identical (the new paint is gated inside `MM_SH85`).
- **The gallery's bust** (shape 26): it was a slab because it stood at luma 26-44 and its carving was relief read through coarse derivatives. Now head, brow, nose and jaw planes, mantle folds as planes, a lit cap and an inset panel on the term, on the lit colour (chest 44 to 84). A uniform lift turned the far niche busts pale white; they keep their value and take two tones, scaled by pixel size.

The paired check, four rooms against dev: **8-0** (heart 2 and 2, gallery 2 and 1, parlour 1 and 1, ballroom 1 and 1). Both judges were asked to rule on every object: the urn and plinth decide the heart, the bust the gallery, the stands the other two; no object was better in dev's version, with three small pulls against: **the bust's shoulders "carry bold diagonal light bands that read as stripes rather than modelling"**; the statues' fold lines "slightly hard and stair-stepped"; the stands' thinner stems "show a short dark break just above the tripod" and lose a little weight low down. Next: those three; "the same lit-edge treatment carried to the chairs, cabinets and tables, which are now flatter than the objects beside them"; chased ornament on brass, chips and veining on stone, warm candle bounce.

Tests: link-queue 104/0, foyer 66/0, ballroom 46/0, heart 44/0, grounding PASS, steam-deck 6/6.

Key: `PAIRED-r61-repair47-key.json`. Evidence: `C:/UILOOP/s21/ev47/`.
