# Actual six-wing UI playthrough — October 28, 2026

Status: **complete for this actual six-wing playthrough and repair pass**. The run, ending, seven peaceful follow-up visits, all eight home states after reload, six regression suites and closing review are complete. Fresh independent AI editorial review: **90/100**. This is separate from the earlier isolated ending/boss fixtures and does not claim natural playthroughs of all seventeen catalog wings.

Fresh isolated Edge browser profile, 1600×1000, default game settings. Started from title → New Expedition → selected Maya → read the entire opening → played the practice Scuffle → Open map. Normal expedition seed: **19201143** (display `000B-FJP3`), Maya/Marmalade, Haunt 0, six wings. The user's own browser save is untouched.

Actions use real DOM controls and keyboard input. The session recorder reads current UI, current hand/telegraphs and run state; it does not mutate game state. Repetitive combat inputs can use a transparent tactic based on displayed damage, Guard and Haunt; no hidden future draws, engine victory calls, resource grants or scene jumps. Route, story, clue and reward choices are reviewed by the agent. This is an agent-operated playthrough, not a human/child test or a balance study.

`session.jsonl` retains visible text and state snapshots; `actions.jsonl` retains recorded combat inputs. Screenshots capture important seams. The interactive recorder lives in `tests/narrative/play_session.py`.

The checkpoints below preserve what was known at each attempt. Earlier phrases such as “pending” and “not complete” describe those checkpoints; the completed third attempt and closing verification at the end give the current status.

## Initial findings and changes

1. Title said “Sixteen lost pets became something else” and “bring the rest home.” This confused Companions with the eight missing pets and asserted an unearned biography. Replaced with the eight-pet premise and strange friends/clues/open way home.
2. Maya's snack line was immediately followed by another packing-snacks joke. Changed the ensemble beat to a rolling flashlight stopped by eight shoes.
3. Journal empty-state instructions remained after examining an observation in the same open dialog. Replaced the transient-empty wording with the accurate persistent explanation: observations stay between expeditions.
4. Full opening followed immediately by SEARCH-RECAP. Completion-only suppression is implemented; skip and interrupted openings retain the recap. Focused regression verification is pending the end of the live browser session.
5. Generic Companion rescue text claimed the chair had already moved before the choice, then repeated a departure that could conflict with the Companion-specific scene. Rewritten to keep the obstruction before the choice and leave the exit available afterward.
6. Safe-room copy promised overnight/two-hour waits and conflated the paid fort action with free conversation. Rewritten to a quiet stop, a nap, and an explicit fort-action cost.
7. Foyer brush clue counted three portraits plus an empty third frame. Corrected to two portraits and an empty frame.
8. Atlas static wing dossiers could claim a known Companion was currently held there. Non-offer labels now identify known Companions; actual offered captive assignments are unchanged.
9. Fresh review found an upgrade subtitle implying an undisclosed downside, and Atlas “Rooms: 20” conflicting with the 15-room route. Copy now explains sharpening and identifies the 20-entry catalog as room types. See `editorial-ui-copy-fixes.md`.

## Route checkpoint

Attempt 1, seed 19201143: Foyer completed naturally: 13 rooms, Butler defeated, waiting-hatch aftermath selected. Bones freed through the room choice. Water/home-bell investigation compared; Orbit trace and three Foyer observations recorded. Lampworks selected as wing two. A normal reload and Continue preserved route, inventory, Courage, observations and aftermath. The corrected title is visible. Lampworks shadow investigation tested both observations and allowed the initial theory to be revised. The Chandelier Big Scare was won. **The expedition then lost at room 12 to the Great Lantern's charged 87-damage attack. This was not a six-wing completion. No save backup or health restoration was used.** Defeat and Clubhouse preserved discoveries and Bones; Orbit remained searchable.

Attempt 2, random seed **21972029** (`000D-2XQ5`), same isolated save: Maya/Marmalade again. Used the actual Clubhouse backpack UI to bring Investigation Notebook, Thermos, First Aid Tin and Pet Treats. After the first room, used ordinary Settings controls for 2× animation speed, Fast mode and Reduced motion; no combat rules changed. Foyer completed, including the short Butler repeat and the remembered towel callback. Boss reward freed Taffy; this exposed and led to correction of the Atlas unassigned-Companion display. Attic completed (14 rooms, Watcher defeated naturally after 11 turns). The window investigation was tested in reverse order and compared; the boss acknowledged it. Selected “Give the Watcher room to act.” Wink's exit followed the actual reward. Now in wing 3, Kitchens, after the first four rooms. No ending or six-wing completion is claimed yet.

The first Kitchen fight exposed a real renderer defect: Dough Blob was removed by the combat engine when it split, but its old view remained with NaN Courage and could still receive targeting input. Two Doughlings were present and valid. The operator finished that same fight through real targeting controls, aiming past the stale parent; no reload or state change was used to win it. A minimal renderer fix and regression are being prepared. `dough-blob-nan-blocker.png` and the corresponding session entry preserve evidence.

Live follow-through so far: safe-room reload preserved the unused action; fixed Forge wording is visible; fixed picker showed Fluff Up selected and returned Fluff Up+. An early suspected wrong-card upgrade was a hover-preview misread: the shop's deck picker confirmed Rattle, Perch and Predator were correctly upgraded. No mapping/geometry bug is claimed. A suspected stale Untouched tooltip could instead have come from Spectral Scratch on the reward screen; lifecycle hooks already clear it, so no speculative change was made.

## Follow-through prompt

### Test-driver interruption and restart

Attempt 2 subsequently completed Kitchens and Greenhouse through ordinary combat and choices. Confectioner fell in 8 turns; the Conservatory in 14. Brambleboo was freed through a Rescue room. The corrected named Companion scene, second-fort short introduction, title counter including five saved rescues, and an Atlas exit without a new exception were observed. Kennels arrival and the Home confirmed clue were read.

At Kennels room one, a protected Ward animal appeared in the keyboard targeting list. The engine correctly refused the attack. While stopping the Python driver to inspect this mismatch, a Ctrl+C closed Playwright's connection and destroyed its temporary browser profile. This was an operator/tool interruption, not a game defeat or game save failure. Attempt 2 did **not** reach the ending. The older backup belongs to the already-lost first attempt and was not restored.

Attempt 3 uses a persistent isolated test profile outside the repository. Selected the same seed `000D-2XQ5` through the normal seed input and packed the same four Gear items through the Clubhouse. The first two attempts already exercised the full tutorial; this run used its skip and verified the required search recap. Fast mode, 2× speed and Reduced motion were selected through Settings. No rewards, health, progress, victories or scene transitions were injected. Read-only storage exports now accompany checkpoints for recovery. Further progress remains to be recorded below.

When the first pass appears finished: **Continue. Review the recorded route and screenshots, verify each fix in the actual UI, check the ending and save after reload, and look for regressions at the seams. Do not equate reaching the final room with completing the audit.**

Do not mark this report complete until all six wings, reunion, ending and the follow-through checks have actually happened.

## Completed third attempt and continuation check

Attempt 3 completed the Foyer → Attic and Observatory → Kitchens and Cellars → Greenhouse → Kennels → Heart, seed **21972029 / 000D-2XQ5**, Maya and Marmalade, Haunt 0. Every encounter used actual keyboard/card/End Turn controls; no health, deck, reward, victory, pet or scene state was injected. The full opening and practice battle were played in attempt 1; this attempt exercised the ordinary tutorial skip and required search recap. Normal title/Continue reloads preserved the expedition. The persistent profile is separate from the user's save.

Boss fights ended on turns 7, 11, 7, 7, 12 and 12 respectively. The final result was `victory`, 71/91 Courage, 30 Tricks, 537 Tricks played and 198 turns. `completed-run-snapshot.json` is a read-only export taken **after** victory, not an input used to achieve it. The recorded completed run had no browser `pageerror` events.

All three observations in each selected wing were read. Foyer, Attic and Lampworks investigations were exercised in the earlier real attempts; their omission in the third attempt did not block the essential plot. The live route exercised distinct guardian choices, both solo Maya check-ins, the first free Marmalade moment and two different paid repeat captions. The Greenhouse lamp and Kennels return-offer branches were read in full and short form; their saved recaps described the selected action.

Orbit's passage paid off the scratches/collar evidence. The reunion changed Maya's pet state to `found` before combat. The separate safety scene kept pets outside the Keeper fight. After victory, the gate choice showed an animal stay, another leave and return from outside, and Orbit choose to leave with Maya. The completed ending left `petsRescued=['maya']`, `sanctuary=true`, and no pending ending. Ordinary reload retained those facts and all six freed Companions.

**Continuation prompt acted on:** reaching the victory screen did not finish this audit. The closing check found a skipped final-reward Companion introduction, misleading summary counters/first-home wording, and buried peaceful-visit controls. Repairs are implemented, with final isolated verification recorded below. The original 90-room statistic is a route-position calculation, not a measured count of rooms visited; it must not be reported as the latter.

## Post-victory continuation completed

Through ordinary Clubhouse Discoveries controls, peaceful visits with Mateo, Amina, Eli, Priya, Jordan, Lena and Samir each showed the matching open-route evidence, reunion and voluntary homecoming. The last visit displayed the eight-picture milestone. A second ordinary reload retained all eight HOME states. All seven available Companions' sanctuary interactions were read; free actions were now visible before the archive. These were actual UI visits in the completed campaign's isolated persistent profile, not fixtures. `a3-all-eight-home-after-reload.png` and the corresponding session entry preserve the result.

Continuing after that check found character selection still describing a current search for a pet already home. The repaired screen now says **An earlier night**, **Earlier search**, and **Revisit the search. Pets already home stay home.** The Kid and paired-Companion text uses the same chronology. `a3-selection-earlier-night-kids.png` records this actual post-sanctuary UI. No new expedition was begun. First-search wording is preserved and tested separately. Freed counts now report actual rescues alongside the starter, without a confusing sixteen-rescue denominator. The actual browser ended with no uncaught `pageerror` events and was closed gracefully; the completed profile remains separate from the user's save.

The final reward had actually freed Wisp, but the original ending route skipped its first named introduction. The repair carries new Companion slugs into the durable pending ending and plays unseen introductions before the gate; it respects acknowledgement, reload, legacy fallback and repeat routes. The original playthrough is the discovery of this bug. Its repair is verified by source and isolated tests, not claimed to have happened retroactively in that first ending.

Other implemented findings: split Dough Blob views no longer retain invalid health/targets; keyboard targeting excludes protected Ward animals; Ward display and departing-animal rules match the engine; decorative map pools do not intercept legal room clicks; delayed Atlas work stops after scene exit. New result labels distinguish wings explored from route-position depth, and naps from fort visits. Paid repeat fort captions vary by creature and room history; free conversations have a clear no-cost label. Middle guardian choices differ, repetitive explanatory tails were cut, and generic event reward wording accommodates the existing duplicate-Keepsake fallback. No combat stats, rewards, RNG rules or pet-loss mechanics were rebalanced.

## Fresh closing review

The independent AI reviewer scored the actual revised work **86 → 88 → 90**, then retained **90/100** after inspecting recorded ending/reunion/reload evidence. All eight categories meet 80%. Its [complete critique, revisions, retracted finding and evidence limits](fresh-editorial-round.md) remain available. This is an editorial diagnostic, not a human playtest or proof that children will understand or laugh at every beat. Broader-route investigation variety remains an optional craft improvement.

## Closing regression verification

The actual-play browser was closed before isolated repair tests began. Those fixtures use separate browser contexts and never load the campaign profile. All six final browser runs passed with **zero uncaught page errors**.

The [consolidated validation record](../serial-browser-validation.md) preserves exact coverage, visual checks and fixture corrections.

| Test | Verified result |
|---|---|
| `tests/narrative/playthrough-fixes.py` | 9 grouped checks: active/lifetime rescue counts after reload; 15 rescued plus starter equals 16 available; all 16 named scene headings; solo Kitchens challenge; map interception negative control and real click; Dough split DOM; Ward keyboard legality and latch departure cleanup; delayed Atlas exit |
| `tests/narrative/run.py` | 27 state/save assertions and 13 UI groups, including actual final-reward dispatch, reload before and after Wisp's acknowledgement, gate recovery, all eight peaceful routes, final milestone and actions before the archive |
| `tests/narrative/investigations.py` | All three investigations plus historical archive: optional/revisable interpretation, either test order, close/reopen, focus, recorded tests and earned boss response |
| `tests/narrative/aftermaths.py` | 23 cases: one selected branch in all 17 catalog wings, plus the other branches in revised Attic/Greenhouse/Kennels; full/short selected text, exact saved recap and unchanged reward |
| `tests/tutorial-narrative/run.py` | 16 behavior groups plus error gate: engine-driven lessons/input/help/skip/handoff, actual large-text settings and control bounds, repeated fort behavior, free versus paid actions, resume and unchanged gameplay randomness |
| `tests/narrative/gameover-summary.py` | 5 groups: captured completed-run summary; memory wording; six mapped wings; guidance for remaining pets; actual `Run.rest` increments Naps taken |

The isolated title and summary assertions were normalized for CSS uppercase. The Rest fixture was corrected to bypass an intentional first-visit service scene and to include the game's existing Clue bonus. Opening screenshots now wait for image decode; the initially blank portrait was a premature fixture capture, not a missing asset. These test corrections are not presented as game repairs. Default sandbox browser launch was blocked; the approved local test invocation ran normally. No completed-campaign save was loaded into these tests except the read-only final snapshot as explicit summary-fixture input in a separate profile.

Node checks for final Companion routing, Ward target legality, and Dough split behavior passed. The selection-copy check passed 408 cases across initial, partial-home and all-home contexts. Syntax passed for 22 changed modules, and the scoped whitespace check passed. The exact runtime script was regenerated from executable data (32,624 words). New Ward, loaded large-text opening/Help, replay selection and corrected summary screenshots were visually inspected. These checks cover the recorded desktop viewport states; they do not certify physical controllers, screen readers, every viewport or real multiplayer transport.

**Second continuation check:** after the apparent finish, rechecked the repaired ending route, selected-action recaps, all-home persistence, replay selection, metrics and evidence labels. No further mandatory narrative or tested-path defect remained. The fresh reviewer retained 90 without awarding points simply for completing the campaign. Optional broader-route investigation variety and child/family comprehension testing remain candidly unverified; no human playtesting is invented.
