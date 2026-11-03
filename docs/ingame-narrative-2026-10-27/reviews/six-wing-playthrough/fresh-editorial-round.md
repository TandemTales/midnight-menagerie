# Fresh independent editorial review

**Current closing editorial judgment: 90/100.** F1–F3 are resolved. The recorded actual six-wing route reaches the ending and all eight pets subsequently return through peaceful visits. No new mandatory narrative defect was found in the closing source/evidence review. Final repair fixtures for the last Companion introduction and corrected summary screen remain separately identified below; completion itself did not raise the score. The baseline and successive checks are retained as history, not competing current grades.

2026-10-28. Reviewer: whole_run_editor. Baseline source review; final-run and revision verification pending.

I read current runtime source, not earlier reviews, scores, or a writer defense. I read CONTRACTS.md and respected file ownership. I did not launch a browser. I inspected selected displayed-text entries from this run's session.jsonl, distinguishing repeated recorder snapshots from actual repeat scenes. The main live attempt had reached the Greenhouse when this baseline was written. I have not personally played a six-wing run or tested comprehension with children.

## Baseline diagnostic: 86/100

| Area | Score | Reason |
| --- | ---: | --- |
| Character | 13/15 | Strong personal pet habits and distinct optional Kid exchanges. Runtime repeat-Sit copy loses Companion identity; Kid development is easy to miss. |
| Humor | 18/20 | Physical comedy usually belongs to the place or creature. Towels, wrong-end telescope, and the mouse supervisor work without cruelty. Repeated setup/lesson rhythm makes later jokes more predictable. |
| Tutorial | 14/15 | Short practical sequence, real controls, action-aware coaching, rereadable help, fresh expedition and skip orientation. Cognitive load and visual reading comfort remain unverified by this reviewer. |
| Mystery | 13/15 | Observable physical evidence supports care-versus-confinement and the pet-specific openings. Three optional investigations allow an uncertain guess and actual tests. Most remaining clues are observation-and-explanation rather than a decision about how to investigate. |
| Gameplay agency | 12/15 | The selected aftercare action really changes the displayed action and saved recap. Pets choose their movements. Too many guardian resolutions converge through the same assist/point/wait construction. |
| Pacing/replay | 7/10 | Six-wing selection, preserved reunions, shorter repeats and earlier-night framing are sensible. First-time aftercare rhythm is too uniform; optional conversations sit below accumulated records; later paid rests become generic. |
| Canon/state | 5/5 | No demonstrated mandatory canon/state failure in reviewed paths. Care is real but does not excuse confinement; pets and Companions remain distinct; the ending preserves animal choice. |
| Age/accessibility | 4/5 | Concrete objects, short paragraphs, no reading timer, Short version retains choices. Some administrative vocabulary and a deepening journal demand more navigation and inference from younger readers. No child playtest is claimed. |

This is a diagnostic judgment, not a score obtained from a validated audience study and not approval of unobserved paths.

## Findings

### F1 — P2, mandatory characterization correction: repeat paid Sit erases Companion identity

**Exact seam:** `game/src/scenes/rest.js:64` (GENERIC_TALK), `:830`–`:836` (_doSit); unit `COMP-<slug>-1`.

After the first persistent relationship flag, the paid fort action chooses one of the same three generic captions for every Companion: for example, “You share a quiet moment before continuing.” This is especially costly in a replayable game: the player spends a scarce fort action to spend time with a chosen character, but character-specific behavior disappears permanently after one encounter. A generic quiet sentence is not inherently wrong; using only this shared pool for all later interactions creates the interchangeable-voice problem the acceptance rubric explicitly requires correcting.

**Smallest fix:** keep the first authored meeting and introduce a small Companion-specific repeat bank. Two or three short behavioral captions per Companion are enough; no new dialogue system, reward, biography, or voiced speech is needed. Keep the actual +1 Clue cost/effect clear. Verify a second paid Sit with two different Companions and a free journal conversation followed by paid Sit.

### F2 — P2, delivery: Kid development comes after the entire accumulated journal

**Exact seam:** `game/src/ui/story.js:74` appends all recorded clues; `:93` appends saved action records; `:96`–`:113` only then append rest conversations. Units `KID-<kid>-rest-0/1`, `PAIR-*`, `COMP-*-1`.

The authored scenes distinguish Maya's preparation, Mateo's questions, Lena's collections, Samir's performance, and other personalities. Their placement makes those strengths optional in an unnecessarily obscure way. A player looking for a clue sees the current room, then an expanding archive, then finally the only Kid check-in. The label Discoveries does not signal a conversation. The available recordings demonstrate that these beats can be reached; their absence in a later attempt is not proof of an implementation failure.

**Smallest fix:** place available free conversations before cumulative records when Discoveries is opened from rest. State that reading is free and separate from the paid fort action. An unobtrusive rest-page conversation entry would further improve discovery, but moving the existing controls is sufficient for the narrow delivery issue.

### F3 — P2, six-wing pacing and agency: repeated aftercare construction

**Exact units:** `AFTER-foyer`, `AFTER-attic-observatory`, `AFTER-kitchens-cellars`, `AFTER-greenhouse`, `AFTER-kennels`, `AFTER-heart` in `game/src/data/narrative-aftercare.js`; representative branches at `:113`–`:128` (Greenhouse) and `:183`–`:205` (Attic).

Each is a valid authored choice, not a false claim that a different ending occurs. However, across a full route the player repeatedly assists, points something out, or waits; each path produces almost the same guardian realization. The small gestures are thematically good. Their identical dramatic function makes the next screen increasingly easy to predict and limits why a player would try another option on replay.

**Focused revision:** retain Foyer as the introductory practical-help choice and Heart as its earned thematic return. In two middle wings, let the player select genuinely different information or interaction. Attic can offer checking the moving telescope versus asking for one explicitly possible pleasant forecast. Greenhouse can offer following the seedling's preferred light versus asking/observing why the large lamp fails to interest it, with different evidence in the selected result. Kennels can contrast clearing the immediate route with asking “What if it comes back?” and preparing an available place for a future voluntary visit. Do not invent an undocumented past visitor, force the animal's choice, or introduce a promised game mechanic. Kitchens' existing mouse-chef question is a good model: the choice discovers a specific comic relationship the other option does not reveal. Save only the selected result.

### F4 — P3, mystery variety beyond the current route

**Exact units:** `CASE-foyer-bells`, `CASE-attic-window`, `CASE-lampworks-shadow` are the only testable investigations in narrative-regions.js; other region clue units mostly use Look closer.

The three investigations are fair: they show evidence, accept uncertainty, allow revision, and require the observations before a conclusion. They deserve credit. On a route that omits Lampworks, only two such investigations occur. A future variety pass could add one meaningfully different evidence action to a middle/later wing. This is optional craft work, not an unfair-reveal blocker; do not expand every clue into the same quiz.

## Checks and strengths

- Tutorial skip leaves SEARCH-RECAP eligible. Completing the full opening marks orientation delivered. The first map therefore does not lose the essential pet/Companion distinction merely because the story was skipped.
- Short version uses the current unit/selected-result recap. It does not bypass required aftercare choices. The committed choice stores its ID and its own recap, rather than claiming all actions happened.
- Kid dialogue is filtered to active party. Important region information generally remains in narrator/guardian lines, so a solo Maya run is not dependent on hearing Priya's question.
- Pet reunions use species-specific actions and familiar habits. The pet is not a prize granted by choosing a “correct” moral answer. The Heart explicitly keeps pets outside the Scuffle.
- Ending choices demonstrate a gate usable from outside as well as inside, a resident staying, and another returning. This earns “both ways” through action.
- The House provides genuine food, warmth and care. Its protective wish is the problem's source; nothing reviewed reframes it as an animal eater. Graveyard memorials are explicitly old and optional closer inspection distinguishes them from the missing pets.
- Post-sanctuary expeditions explicitly revisit an earlier night. Persistent reunion state is not casually erased by another run.
- **Rejected finding:** I initially suspected cumulative visited-room count unlocked every later wing's clues immediately. `Run._buildMap` resets `visitedIds` at `game/src/state/run.js:1254`; that suspicion was wrong. The 0/3/6 threshold is per wing and is not a defect.

## Evidence boundary

Reviewed: narrative-regions.js, narrative-aftercare.js, narrative-relationships.js, state/narrative.js, scenes/narrative.js, tutorial opening and transition code, ui/story.js, coach opening steps/action observation, scuffle-help.js, ui/investigation.js, rest conversation seam, selected event code and event data, relevant schema/run state. Session snapshots supported actual display of Foyer/Attic/Kitchens aftercare and Greenhouse arrival. Later ending, all skip variants, all eight characters, all sixteen Companions, remote play, and child reading comfort were not independently exercised in this review. Pending final-run evidence should update that boundary explicitly rather than silently converting source inspection into playtest evidence.

## Revision check 1 — source verified, run still in progress

I independently reread all 48 new `REPEAT_COMPANION_TALK` captions and the `restCaption` caller, and reread the changed journal order. F1 is resolved in source: the repeat pools preserve creature-specific motion, habits, humor, and quietness. F2 is resolved in source: the conversation section now appears before historical clues and choice records. The original first relationship beat remains intact. The new repeat selector derives from wing/room history rather than consuming an extra gameplay random draw. A brief free-conversation cost clarification remains advisable because the journal's “Sit with” wording resembles the paid fort action.

These changes warrant **88/100 provisionally**: Character 14/15 and Pacing/replay 8/10; other category scores unchanged. This is a re-evaluation of inspected changes, not credit for a plan. The middle-wing aftercare revision and final live-run evidence were not yet available at this check.

## Revision check 2 — current source editorial diagnostic: 90/100

I reread the implemented Attic, Greenhouse and Kennels aftercare replacements, their individual recaps, the unchanged repeat resolutions, and the free-conversation clarification. F3 is sufficiently addressed for the actual Foyer → Attic → Kitchens → Greenhouse → Kennels → Heart route:

- `AFTER-attic-observatory-watch` now asks whether something nice could happen. The telescope is secured first; a sparrow-and-seed forecast then provides a concrete pleasant possibility, explicitly not a promised outcome. The question earns different information from pointing at the telescope.
- Greenhouse branches now differ in observation and action: the ordinary window reveals moving air; examining the lamp creates a comic lamp/leaf disagreement; opening both paths lets the seedling demonstrate its own preference. The prose permits the player to infer preference from movement. The same settled destination does not erase the distinct experience of each choice.
- `AFTER-kennels-bed` asks about a future return rather than inventing a past visitor. Making a ready place, clearing the immediate route, and offering reachable water produce different human/animal interactions. The water branch's three wet drops and postponed cleaning express the Keeper's change through behavior. Departure remains into another hall, preserving the later outer-gate resolution.
- The rest journal now explicitly says conversations do not spend Clues or use a fort action. It distinguishes free reading from paid Sit without hiding either interaction.

Current category scores: **Character 14/15; Humor 18/20; Tutorial 14/15; Mystery 13/15; Gameplay agency 13/15; Pacing/replay 9/10; Canon/state 5/5; Age/accessibility 4/5 = 90/100.** The final two points reflect implemented distinct middle-wing interactions and the improved six-wing rhythm. F1–F3 are source-resolved. F4 remains an optional future variety improvement. This does not imply that every alternative six-wing route through the other wings has the same degree of aftercare variety.

No new mandatory copy/state problem was found in these replacements. Full live-run acceptance remains pending: this score assesses the inspected current source and available displayed evidence, not an unobserved completed ending. Visual fit, actual ending commit/return behavior, and human child comprehension retain their previously stated evidence limits.

### Displayed-evidence follow-up

I opened and visually inspected `a3-free-conversations-before-records.png`, `a3-maya-marmalade-free-talk.png`, and `a3-marmalade-repeat-paid-sit.png`. These show the free conversation section and explicit cost clarification before historical records, Maya's windowsill/plant remark, Marmalade's first paw-washing exchange, and a subsequent paid Sit with the new named blanket-kneading caption. Text is not clipped in these captured states. These narrow F1/F2 paths are now supported by displayed evidence as well as source; the screenshots do not substitute for checking every Companion or viewport. The parent reports the actual fort action was spent and its base Clue plus Notebook bonus applied; I have not independently reconstructed that effect from these images alone.

## Additional actual-run follow-up — Greenhouse and narrow event/lore repairs

The parent reported a repeated sneeze at an adjacent event seam, a specific brass-button reward description that disagreed with a duplicate-Keepsake fallback, and explicit moral explanation in recurring Kennels enemy lore. I inspected the current replacements directly:

- `scratching-behind-the-wall` now introduces the panel catching on painted screws, giving an observable reason for the tool option and breaking the consecutive sneeze rhythm. The separate leave-result sneeze remains a later optional result, not the same adjacent introduction.
- Its `feed` / `Fair trade` outcome describes a wrapped Keepsake, while the option still names its 25-Button price and Keepsake/Clue reward. This correctly accommodates the observed alternative item. I checked `Run.applyEffects`: an already-owned named Keepsake takes the `rollKeepsake` path rather than necessarily giving that named item. The prose no longer promises a brass button when that substitution occurs.
- `wardOrderly.lore` now describes a quiet cloth/porcelain attendant following procedure; `comfortBlanket.lore` describes paw-like corners and attempts to tuck everyone in. Both leave the moral inference to their behavior and the surrounding story. I did not treat comments invisible to the player as repeated in-game narration. This check concerns the edited lore strings; it is not a new comprehensive combat-engine audit.

I opened `a3-greenhouse-lamp-choice.png` and read the matching `a3-greenhouse-lamp-choice` and `a3-greenhouse-lamp-recap` session entries. The actual selected result shows only the lamp examination: leaf avoidance, the Conservatory clearing lamp/vines, and the seedling choosing the window. The Short version accurately retains that action and choice; it does not claim the other two options happened. The captured full screen fits the text and both controls without clipping. This gives direct displayed support to one revised middle-wing branch; it does not establish the other two branches were played.

**Current editorial score remains 90/100.** These narrow repairs support the present assessment and remove specific seam problems; they do not warrant automatic extra points. At this follow-up the parent reported the main run was still in the Kennels. The completed ending remains unverified here, and no whole-run or child-playtest claim has been added.

## Closing integration review — completed route evidence

I read the recorded actual Foyer → Attic → Kitchens → Greenhouse → Kennels → Heart run's final seams: Kennels return-offer result and recap; Orbit's passage discovery and reunion; the explicit pets-safe-before-battle scene; Keeper preface and optional voice; the selected Heart wait aftermath; the gate choice; Orbit choosing home; onward; and victory. I also read the subsequent peaceful-visit and all-eight-home/reload state entries. I visually inspected `a3-gate-both-ways.png`, `a3-orbit-chooses-home.png`, `a3-all-eight-home-after-reload.png`, and `a3-peaceful-visits-front.png` in addition to the earlier images.

The final progression is emotionally and causally coherent. The Kennels' animal goes into another hall, leaving the outer gate unresolved. Orbit is found and its reunion committed before the Keeper fight; the pet stays outside combat. The gate scene demonstrates both departure and voluntary return before Orbit leads Maya out. The selected wait/space choices do not claim the animals were carried or ordered through. The recorded ending transitions from found → home, sanctuary true, then pending ending cleared. The later records show all eight pet states home and END-ALL-HOME after the seventh peaceful follow-up. The screenshot after reload corroborates the eight HOME cards. These are observations of the parent-operated recorded campaign, not a claim that this independent reviewer operated or exhaustively watched every fight.

### Repairs discovered by the real ending, rather than retrospectively called a clean pass

- **Final Companion introduction:** the actual original victory skipped Wisp's first named narrative scene. Current `ui/story.js:22` carries the final freed roster in the durable pending ending; `state/narrative.js` prepends deduplicated unseen Companion introductions before the gate/reunion units. I read the repair and `tests/narrative/final-companion.mjs`, which exercises the real final reward/Run.end/listener route, serialization without an active run, failed acknowledgement, idempotence, legacy fallback, remote finale and memory route. This is a source/test-scope review; until the integrator supplies execution results, it is not my assertion that the fixture passed. The earlier actual ending is still documented as the run that exposed this omission.
- **Summary wording:** the recorded victory still contains the pre-repair “90 rooms deep,” “Safe Rooms 0,” and wording suggesting Orbit's home status was unchanged by the first success. Current gameover source presents wings explored, labels the REST-only counter “Naps taken,” and distinguishes first homecoming from an earlier-night expedition. The old screenshot is not evidence for these repaired labels. A replay fixture based on the completed snapshot is the appropriate validation, rather than representing a fabricated second campaign as real play.
- **Peaceful visits:** current Clubhouse/Discoveries source places available visits before the historical archive, and `a3-peaceful-visits-front.png` directly shows this order and the no-Scuffle explanation. This resolves the same delivery issue found for rest conversations.
- **Narrow terminology/state copy:** the current Vanish tooltip uses Scuffle/expedition-deck language; the Heart photograph detail leaves the crooked-bowl observation for the player to interpret; the Reach Heart achievement says “Enter the Heart of the House” and listens for its region entry.
- **Correction to the earlier narrow Kennels check:** the recurring edited strings are the `announceOrderly`/`announceBlanket` House Rules, not merely each enemy's `lore` field. I now inspected those exact rule strings. The moral explanation tails are gone; the Stable, damage threshold, Fright and transferred-damage instructions remain. The earlier recorded combat containing the old moral tails is historical evidence, not evidence that the new source still displays them.

### Remaining scope and optional refinement

There is no new mandatory narrative defect from this closing read. The provisional P3 thought that “N/16 freed” might imply one missing friend when 15 rescues plus one starter complete the roster was explicitly downgraded: it is a literally valid subset count and the starter explanation supplies context. It is an optional completion-meter wording refinement, not evidence of a wrong current save or a reason to alter rescue mechanics.

**Final editorial score stays 90/100:** 14 character, 18 humor, 14 tutorial, 13 mystery, 13 gameplay agency, 9 pacing/replay, 5 canon/state, 4 age/accessibility. The source improvements and recorded ending support the same judgment; merely finishing the campaign earns no extra craft points. F4 remains optional broader-route investigation variety. This review does not certify every possible route, all alternative endings, every viewport, remote gameplay, or reading comprehension for ages 7–10. No human-child playtesting was performed or claimed. The integrator's remaining final repair fixtures and required checks should be reported on their actual results, separately from this editorial score.

## Final fixture evidence update

I read the current machine-readable reports supplied by the integrator:

- `reviews/runtime-tests/result.json`: 27 state checks and 13 UI groups, including real final reward → Wisp introduction before ending, browser reload before acknowledgement without an active Run, Short-version acknowledgement and reload without replay, gate recovery, all-eight peaceful home routes, milestone, and visit controls ahead of a populated archive. `pageErrors` is empty. The report explicitly notes that four completed UI checks were subsequently added to the report list; it does not claim an additional rerun.
- `reviews/runtime-tests/aftermaths-result.json`: 23 checks, covering one selected branch in all 17 regions plus the remaining six branches across revised Attic/Greenhouse/Kennels. The checks include choices surviving Short mode, only the selected full/short outcome, exact saved recap and unchanged reward. `pageErrors` is empty.
- `reviews/runtime-tests/investigations-result.json`: three investigations plus historical archive behavior. The checks cover optional guesses, either test order, persistence, focus, changed ideas and earned guardian response; archived records do not offer physical checks away from their location. `pageErrors` is empty.

The integrator additionally reports nine grouped `playthrough-fixes.py` checks passed, including sixteen rendered headings, a map negative control and real click, Dough DOM behavior, Ward keyboard release and delayed Atlas. I have not independently run those checks. The actual campaign browser was closed with an empty error list according to the integrator. These are specific automated-fixture and recorded-run evidence, not child playtesting.

I also inspected current title/Clubhouse/select count wording: the rescued tally now reads “N freed” with the starter count separate, resolving the optional fraction ambiguity without changing rescue mechanics. I opened `a3-selection-earlier-night-kids.png`; the sanctuary selection screen visibly says “An earlier night,” “Earlier search,” each Kid revisits the pet's search, and the Samir/Marmalade paragraph confirms the gate is open today and home pets remain home. This meaning is no longer deferred until after starting the new expedition.

The final-Companion omission is now supported as repaired by both source and reported browser fixture evidence. **Score remains 90/100; no new mandatory narrative defect found.** Tutorial and corrected victory-summary fixtures were still finishing when this update was written and are not claimed as passed here.

## Fixture closure

The integrator subsequently confirmed the remaining tutorial and summary suites passed, completing all six browser suites serially with zero uncaught page errors. The tutorial result comprises sixteen behavior groups plus its error gate, including actual large-text settings application, visible/control bounds, free versus paid rest interaction, all sixteen Companion first/repeat identities, and resume/RNG preservation. The summary result comprises five groups using an isolated reconstruction of the captured completed Run: six wings explored, zero naps, first Orbit homecoming copy, explicit memory copy, six mapped Clubhouse wings, remaining-pet visit guidance, and a real `Run.rest()` operation producing one displayed nap. I read the relevant test assertions; execution results are attributed to the integrator/runtime reviewer, not to an independent run by me.

I opened `reviews/runtime-tests/gameover-completed-summary-fixed.png`. It visibly shows six wings explored, Naps taken 0, and “Orbit is home with Maya,” with the summary and navigation controls fitting the captured viewport. This is the repaired summary fixture screenshot, distinct from the actual campaign's earlier victory image that exposed the errors. The integrator also visually checked the freshly loaded Mateo large-text tutorial and Help states; I do not claim to have independently opened those final screenshots here.

All previously pending repair-fixture evidence in this review is now accounted for. **Closing assessment: 90/100, no unresolved mandatory narrative correction identified within the reviewed scope.** The score is unchanged by tests passing or the route finishing. One actual six-wing campaign, peaceful homecoming follow-through, source inspection and isolated browser fixtures are not a human-child study or a full playthrough of every possible route through all seventeen wings.
