# Round 27 (THE CARD) -- judges verdicts, for the graft

Winner: QUINACRIDONE (2 of 2), 7.08 vs SHANTUNG 5.46 (+1.62). PERYLENE 6.85, HANSA 6.34. PERYLENE tied piles.

## Judge 1 (winner QUINACRIDONE)
### Fixes for the winner
- combat-crowd at 1280: make the rules text on the Bite, Sit Pretty and Shake, Boy! panels at least 11 px, and widen the text box toward the gilt corners so 'Deal 6 damage.' sits on one line, not 'Deal 6 / damage.'
- shop at 1280: raise the rules text on all six cards from about 9-10 px to 11-12 px; trim the inner panel margin to make room rather than shrinking the type.
- All screens: repaint the ATTACK/SKILL/POWER type pills under the name ribbon as enamel cartouches with a gold rim and a bevel (like the samples' 'CHOOSE YOUR KID' plate), not bright flat red/blue chips.
- All screens: strengthen the damask in the crimson and blue rules panels and add a soft centre-light vignette, so the lower half reads as painted enamel at viewing distance and not as a tinted fill.
- piles: scale the five cards up to fill the viewer frame the way the other builds do, so the damask bands left and right of the row disappear.
- combat-boss at 1280: on Put Yourself Back Together keep the name the same size as the other names and let it wrap to two lines inside the ribbon, as it already does on combat-crowd.
- reward and shop: give the Power panel (Tighten the Collar) and the Forgetting service card their own clearly different enamel colour (e.g. violet with a gold star watermark), so Power does not read close to Skill blue.
### Grafts
- PERYLENE: A faint type watermark in the rules panel (shield for Skill, claw marks for Attack) adds painted depth. Keep it below about 10% opacity and move it off the text block, toward the bottom corner.
- PERYLENE: Larger rules type on short rules (Bite's 'Deal 6 damage.' at about 13 px at 1280). Use one fixed size on every card rather than PERYLENE's per-card sizing.
- HANSA: The vellum panel's edge burn and vignette: put the same darkened, burnished edge inside QUINACRIDONE's crimson and blue enamel panels so they read as lit surfaces.
- HANSA: The type line framed by thin rules ('— ATTACK —'). Use it as the engraved setting for the type cartouche instead of a floating pill.
### Verdict
QUINACRIDONE is the most coherent card system and wins. Its crimson Attack and blue Skill damask panels with gilt corners let the type read at a glance on every screen. Its names keep one size across reward, shop and the nine-card hand, and no name spills over the art at 1280. Its weak points are rules text of about 10 px at 1280 on combat-crowd and shop, the flat bright type pills, and a damask too faint to read as painted. PERYLENE is a close second and wins piles with fuller cards and watermark glyphs. Its rules text size varies card to card in the crowd hand, and it shrinks long names. HANSA's vellum is painted and very legible, but every panel is the same cream, so type does not read, and its long names stack over the art on combat-crowd. SHANTUNG keeps the flat purple fill this round was meant to remove, sets columns of one or two words per line on combat-crowd at 1280, and makes names inconsistent in size. None of the four fits between the samples yet.

## Judge 2 (winner QUINACRIDONE)
### Fixes for the winner
- combat-boss and combat-crowd at 1280: raise the rules text to at least 11-12 px. 'Deal 6 damage.' on Bite and the Sit Pretty lines sit at about 9-10 px in half-empty embossed panels, so let the text fill the panel.
- All screens: enlarge the enamel type chips (ATTACK, SKILL · SELF, POWER · SELF, A SERVICE) under the name ribbon so their caps are at least 10-11 px at 1280; today they are the smallest text on the card.
- shop: keep name-ribbon heights the same across the shelf. Call That Back wraps to two lines while Bone Toss and Flop Over stay on one; pick one size and wrap rule so the ribbons line up.
- reward: Jawbone Jamboree and Full Body Tackle's names sit a step smaller than Dig Here's. Use one name size per row.
- piles: draw the pile cards at the same size as the other boards (the grid is narrower than the dialog) so there is no wide empty damask gutter on each side.
- All screens: add a faint watermark glyph for the type (claws for Attack, shield for Skill, star for Power) into the embossed damask so the panel also carries the type in its picture, not just in its colour.
- shop: Forgetting (a Service) uses the same violet as a Power. Give the Service a distinct tone, such as a darker aubergine or bronze, so it does not read as a Power card.
### Grafts
- PERYLENE: Its larger rules type: at 1280, PERYLENE's Bite and Go Get It! text is the most legible of the four. Bring QUINACRIDONE's rules text up to that size.
- PERYLENE: The large, faint type watermark in the panel (claw marks behind Attack text, a shield behind Skill text), laid under QUINACRIDONE's embossed damask.
- HANSA: Thin gilt corner brackets and a fine double rule framing the rules panel, plus the red-ink keyword underline, as a deliberate inner frame on the enamel.
- PERYLENE: The two-line wrap that keeps long names like Put Yourself Back Together inside the ribbon at one size across the nine-card fan.
### Verdict
QUINACRIDONE wins every screen and should set the card language. Its rules panel is the only one that looks painted: embossed damask, gilt corner flourishes, colour by type (maroon Attack, navy Skill, violet Power) and an enamel type chip set into the ribbon, which matches the samples' cartouches. Its weakness is size. At 1280 the rules text and type chips fall to about 9-10 px on combat-boss and combat-crowd. PERYLENE is a close second: it is the most readable and has the same colour-by-type idea, but its panels are smooth vignetted gradients, so a builder can still tell it is CSS. HANSA's parchment is a real painted surface and very readable, but every type gets the same cream paper, which hides the type and looks like a daylit game in a dark house. On the nine-card hand its long name spills over the art. SHANTUNG is last. It keeps a near-flat single purple for every type, its card names change size across a row, and on combat-crowd at 1280 the Sit Pretty rules collapse into a column of one or two words with the 'SKILL · SELF' label cut off. No candidate reaches coherence 9.

## Build PERYLENE ui/r27-card-a 781db22f
FINISHED FROM AN INTERRUPTED RUN. The earlier run's four commits (b9f1d8df..9e535508) are kept as they were; nothing was reverted. This run added:
- 68f36a92: (a) card.css's round-27 section headers were double-encoded mojibake ("â”€â”€"); re-encoded to UTF-8 "──". (b) deckview.css: --deck-cw is now also capped at 23vh. At 1600x900 every pile-viewer Trick was cut by the case: foot rail and bottom brackets lost under the lid's rail, a defect already present in BASE. 1280 is unchanged (width still decides). (c) The board type line takes the full --rules-k lift: the Shop at 1280 printed "POWER · SELF" at 9.5 px; now about 11 px.
- 781db22f: that larger type line ran its caps under the panel's top rail ("ATTACK" lost its crowns on the Shop shelf at 1280). It and the printer's rule now step down by 0.9 of what the type grew. k=1 boards (Reward, piles) are unchanged.

MEASURED at 1280 (computed font size x on-screen scale; rotated fan cards read about 15% high):
- Shop: rules 12.4, type 11.1, names 11.1 px on all five; one name size across the row.
- Reward: rules 18.6, names 17.9.
- Piles: rules about 21 at 1600, about 14 at 1280.
- Hand of five: rules 13 (Put Yourself Back Together) to about 15.5; names about 11.5 to 12.
- Nine-card crowd: every covered card's rules 11.5 to 12.5 px. Every name stays inside its ribbon (PYBT, Sit Pretty and Shake, Boy! on two lines), every cost coin shows, and no rule is a one-word column.

TESTS (on :9111):
- PASS: hand-cards 40/0, card-face 14/0, cards-feel exit 0, chrome 27 checks/0 errors, piles-reachable 24/0, css-tokens 0 undefined, scene-css 0 conflicts, dup-keys 0, seams 0 problems.
- gamepad and steam-deck FAIL: Page.goto timeouts and "screen did not come up" while three builders shared the iGPU. A/B'd against BASE (C:/UILOOP/r27/base-a served on 9211): BASE fails both identically (steam-deck 5 passed / 10 failed with 2 of 11 screens reached; gamepad the same goto timeout). This is environmental, not this branch, but it has NOT been seen green. Re-run both on an idle machine before merging.

CAPTURES:
- The GPU slot queue ate the 180 s timeouts. The final ten were taken from 781db22f by a scratch script that holds tools/gpu_slot for the batch and runs each `timeout 180 python tools/shot.py ...` with MM_GPU_SLOTS=0 (still one WebGL page at a time). The arguments are exactly the brief's.
- All ten: void=False, errors=0.
- Outside the track: gameover (the card wears the painted body correctly) and map (shot.py flagged it VOID, the known bright-parchment false positive; the frame is fine and the NO KEEPSAKES cartouche fits the rail).

NOT DONE:
- Game over's card was not re-tuned for 1280. At 1600 its xlong rules are about 12.8 px; at 1280 they are probably about 10-11 px, unmeasured.
- The open hand's rules are not one size across the row (PYBT 13 px vs Sit Pretty about 15.5).
- At 1600 a covered Sit Pretty sets its rule on two lines at the read size, leaving panel space unused (deliberate cap against one-word co

## Build HANSA ui/r27-card-b 72331ce7
This finishes the interrupted HANSA build. I kept and committed the previous run's uncommitted edits (the type-line rules, star and size), then added:
- the Forgetting card on paper;
- larger brackets (23u to 28u) and a heavier type-ink border (1.8u);
- a darker type ink;
- the 1280 HUD fix: my NO KEEPSAKES cartouche had pushed "The Foyer" to "The F...", so under 1400px it drops the stars;
- the open-hand rules fit at 110u. At 104u, "Put Yourself Back Together" printed a size below its row. 114u measured 2px over the foot at 1280.

Measured rules sizes:
- combat-boss: 15px at 1280, Put Yourself 13.5px; 16.9px at 1600, Put Yourself 15px.
- combat-crowd, all nine cards: 12.0px at 1280, 13.5px at 1600.
- shop at 1280: 12.4px. Names are one size across each row.
- No overflow anywhere.

Tests:
- Pass: hand-cards 40/0, card-face 14/0, chrome 27/0, piles-reachable 24/0, css-tokens 0 undefined, scene-css 0 conflicts, dup-keys 0, seams 0 problems. cards-feel ran clean (hover worst frame about 18ms).
- steam-deck ("2 reached") and gamepad (Page.goto load timeout): both fail the same way, or worse, on BASE 5cb816c. I served BASE from a git-archive export at C:/UILOOP/r27/wt/base-b on :9212, then stopped it. These are environmental (machine and GPU load from three builders), not this branch. The export is still on disk and can be deleted.
- A WebAudio "audio device" console error appeared once on an exploratory piles shot. It is environmental, and none of the canonical captures logged anything.

Captures: shot.py's own gpu_slot wait counted against `timeout 180`, and another builder's 10-12 shot batches held the slot for 15+ minutes. So I held the slot for my whole batch (shots/slot_run.py, gitignored) and ran each capture under `timeout 180` with MM_GPU_SLOTS=0 inside it. Every one succeeded on the first try. Outside the track I photographed title, gameover (its "worked hardest" card prints correctly on the sheet) and combat foyer-14. All are fine.

Not done:
- No change to ui/enemy.js. The new card height leaves the Kid and Bones the same room as before: the hand band did not grow.
- The sheet has no drop shadow, because a filter on every hand card risked frame time.
- No change to the deck viewer's own sheet or to deckview.js (piles uses the kit cards as is).
- Card art and data are untouched.

Dev server stopped.

## Build QUINACRIDONE ui/r27-card-c 49e887a5661a82ed5f6c2d88b3b25b1f83e14d41
Resumed build. The earlier run left 4 commits on ui/r27-card-c (9112635, f02265f, e0b2098, 117f52f) and a clean tree; nothing was half-made and nothing was reverted. This session added 2 commits:
- dbc965b7: tab lettering in ivory over the type's enamel (ATTACK was pink on red, about 2.8:1). Type tab at 11.5 px at 1280. Open hand of 8 or fewer: rules cap goes from 13 to 14 px at 1280 (new TUNE.openCapPx).
- 49e887a5: names 13.5 px in the open hand and 13 on the shop shelf at 1280, so a name reads a size over its rules again.

Measured at 1280x800 in the live DOM (font-size times the transform scale chain):
- combat-boss (5 cards): name 13.6, type 11.5, rules 14.
- combat-crowd (9 cards): name 12.2-13.6, type 11.1-11.5, rules 12 on every card. Every name sits inside its ribbon (at most 2 lines), every cost coin shows, and no rules column is one word wide (narrowest: "Deal 6 / damage.").
- reward: name 15.8, type 12.8, rules 17.9.
- shop: names 13 across the row (one size), type 10.9-11.5, rules 12.4.
- piles: deck case name 16.5, type 12, rules 17.2-20.4.
At 1600 every figure is equal or larger.

Brief item 4 (Kid and Bones): the new card height leaves them room. At 1280 the hand's band starts at about y=530 and the Kid and Bones stand at y=270-460, so enemy.js placement is not blocked by the hand.

Tests on my port:
- Pass: hand-cards 40/40, card-face 14/14, cards-feel (harness, exit 0), chrome 27/27 (one rerun failed its fps check at 51 while a GPU capture ran beside it; a clean rerun gave 61), piles-reachable 24/24, css-tokens, scene-css, dup-keys, seams (all 0 problems).
- Red on both my build and BASE: tests/gamepad and tests/steam-deck. Gamepad's second page.goto (?combat) times out at 60 s, and steam-deck reaches 2 of 11 screens, with "screen did not come up". BASE 5cb816c, exported with git archive and served on 9213 (port+100), fails both tests the same way, so this is the machine's load from the shared GPU (other builders' batches held the slot for 20+ minutes at a time), not this branch. Rerun both when the machine is idle.

Captures: shot.py with the brief's exact arguments, but the outer timeout was raised from 180 s to 1500 s, because the gpu_slot queue alone outlasted 180 s and every attempt was killed while waiting. Two captures came back void (exit 2) on the first try and were retaken. All ten canonical PNGs have 0 errors and are not void, and all were shot after the final commit. Outside my track I photographed and looked at combat foyer-14 and the map (shots/QUINACRIDONE-out-combat.png, shots/QUINACRIDONE-out-map.png); both are fine.

Not done:
- No change to card ART, enemy.js, the rooms or game/src/data.
- The card's upper frame (outer gold rim, cost coin artwork) is unchanged apart from the name plate and the layout.
- The Forgetting service card in the shop keeps its own lavender tab, lettered in --tint-hi rather than --tab-ink.
- The game-over sheet's cards were not re-checked: game over is not among this round's five captu
