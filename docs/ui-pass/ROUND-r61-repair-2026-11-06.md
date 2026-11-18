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
