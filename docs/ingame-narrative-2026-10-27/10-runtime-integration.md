# Runtime integration — actual six-wing audit, fresh review 90/100

## Authority and status

The user's follow-up explicitly requests implementation in the game and continued critique/revision until a fresh review reaches 90 or the user stops the work. Code changes are therefore authorized. Existing source/art and other contributors' changes are preserved; there is no deployment, art replacement or gameplay rebalancing. The earlier writing-only prohibition and missing-support statements in 01–09 describe the previous delivery boundary, not the current implementation.

Current independent actual-play editorial review: **90/100**, with every category at least 80% and no mandatory editorial finding remaining at the closing narrative review. This round progressed 86 → 88 → 90 after actual revisions. The earlier runtime review progressed 84 → 82 → 91 on different evidence; that history remains below. Scores are AI editorial diagnoses, not quality certification or human playtests. The older manuscript's 88 is also retained. The exact runtime text is collected in section 11; executable sources remain authoritative.

The [actual six-wing playthrough report](reviews/six-wing-playthrough/README.md) records the successful route, earlier failed/interrupted attempts, live tutorial and skip paths, all eight homecomings, reload persistence, continuation findings and focused regression coverage. It does not claim natural playthroughs of all seventeen catalog wings.

## Executable script sources

- `game/src/data/narrative-regions.js`: all seventeen real region/boss packages. Arrival, first encounter, aftermath, repeat encounter/aftermath, three observations per wing, optional battle voice. The manuscripts 04/05 carry exact runtime editions after their original proposal sections.
- `game/src/data/narrative-aftercare.js`: seventeen playable first aftermaths, each with three specific actions and finished selected outcomes (51 branches). Short mode retains the choice; only the selected act is shown and recorded.
- `game/src/data/narrative-relationships.js`: eight pet traces and closer looks, species-specific reunions/departures; sixteen Companion sets; eight two-Kid pairs; eight solo Kid check-in arcs; service introductions and the gate ending.
- `game/src/scenes/tutorial.js`, `game/src/ui/coach.js`, `game/src/ui/scuffle-help.js`: eight opening variants, action-aware real first battle, return/skip behavior, help.
- `game/src/data/events.js`: seventeen existing Curiosities, 79 outcomes revised. Option IDs, weights, gates, costs and effects are unchanged. Misleading risk/reward previews were corrected.
- `game/src/state/narrative.js`, `game/src/scenes/narrative.js`, `game/src/ui/story.js`, `game/src/ui/investigation.js`: actual routing, display, observation actions, persistent named records, resumable ending and peaceful visits.

These files contain finished player text, not placeholders. The runtime edition deliberately compresses the older manuscript; older proposed portrait animation, bespoke cutscene choreography, and every long-form variant are not claimed implemented. Captions provide physical action without requiring new art or animation.

## Shared unit contract

Every runtime unit has a stable authored ID or a deterministic ID described below. Region units supply exact lines and a factual short recap. Speakers are explicit objects or narrator captions; Kid speakers are filtered by current cast. Scene direction is embedded in readable captions. No audio/color-only clue or timed answer is required.

| Unit family | Location and real trigger | Reads / changes | Choice, replay and fallback |
|---|---|---|---|
| NR-region-arrival | First map entry in that wing during a run | run-key arrival marker; persistent seen | Full/short; repeat visits initially show short; no tactical state change |
| NR-region-before / before-repeat | Real Boss node before combat scene | actual node type; narrative boss resolution | First/repeat wording; each read/short completion returns to the real combat |
| NR-region-before-investigated | Same boss boundary, after optional comparison | named investigation `compared` | Guardian acknowledges evidence actually gathered; ordinary encounter if missed |
| AFTER-region / NR-region-after-repeat | Real boss reward, before drafting | `pendingReward.kind`; boss marker; selected action | First aftermath requires an actual choice even in Short mode; repeats retain the promise. Ordinary reward and actual Companion rescue remain Run-owned |
| NR-region-clue-N | Discoveries in current wing; observations open as rooms are visited | observed base, closer detail, selected branch actions | Optional, no currency or RNG; later historical record; fresh contradictory pre-resolution detail suppressed after a local promise |
| investigation IDs inside clues | Optional physical checks within three observations | chosen idea, performed tests, comparison | No required guess, right-answer reward, penalty or timer; can revise idea; evidence-specific encounter response |
| NR-region-bark | Boss battle voice button after enemy phase | real engine phase events | Optional persistent-readable text; no auto-dismissal, tactical promise or combat effect |
| PET-kid-trace | Current searching Kid, pre-sanctuary, unknown pet | named observation only | Never a generic numeric Clue converted to identification; closer look optional |
| PET-kid-route / route-open | Before first named reunion, including peaceful visit | route seen; sanctuary/ending context | Eight concrete disappearance payoffs, with separate open-route versions; never close a route again after sanctuary |
| PET-kid-found / return | Heart ward; or peaceful sanctuary visit | unknown→found only after displayed scene/recap and durable save | Exact eight first and eight return variants; no escort HP or loss timer |
| PET-kid-home | Voluntary exit; after gate change | found→home and existing `petsRescued` | Never cleared by defeat; pet approach/retreat choices shown as behavior |
| COMP-slug-0 | Actual newly rescued Companion | seen A | Uses actual freed slug, not nominal region captive; no duplicate rescue award |
| COMP-slug-1 | Sit and talk in safe room with present Companion | seen B | Optional; captioned animal behavior, no invented universal speech |
| COMP-slug-2 | Sanctuary visit, available Companion | seen C, missing B presented first | Availability includes starter Marmalade; no false freed-count change |
| PAIR-kid-kid-0/1 | Both Kids present in safe room | prior A seen before B | Optional, once per stage, no absent-player lines |
| KID-kid-rest-0/1 | Safe room with selected Kid | A seen; a guardian resolved before B | Unknown-pet search or explicitly earlier-night run; not offered as current missing-pet grief after a reunion |
| SERVICE-MOTH / SERVICE-REST | First actual shop/rest entry | seen unit | One concise introduction, no replacement of actual shop/rest action |
| SEARCH-RECAP | First actual map after a skipped/opening route | once seen | Reliable search purpose and pet/Companion distinction |
| HEART-WARD / HEART-SAFE | Heart boss route, or essential finale fallback for network sessions | required reveal seen; found states | Care/refusal/transformation continuity/Keeper identity; short version retains facts; pets outside fight |
| END-GATE | First real Heart victory ending | sanctuary and selected action, only after outcome/recap and durable save | Hold gate, place water, or leave room; one animal stays, one leaves and returns; gate opens from either side |
| END-ONWARD / END-MEMORY | Real run-end route | pending ending cleared; ending marker | Present sanctuary versus earlier search explicitly distinguished |
| END-ALL-HOME | Last peaceful homecoming | all eight current/prospective departures, seen | Adds a new board photograph; no gameplay unlock invented |

Normal scenes have Next/Continue and Short version/Read full scene; they make no claim that a player chose an interpretation. Dialogue is self-paced and skippable to its essential recap. Narrative prose never starts or wins combat. Optional discoveries can be closed freely. All IDs are independent of display names.

## Actual state and persistence

Save format is version 3. Version 2 gains `narrative` without losing existing data; future-version refusal remains. `narrative` stores `seen`, `clues`, `investigations`, `choices`, `pets`, `bosses`, bounded run markers, `sanctuary`, and a persistent `pendingEnding`. Selected choices retain ID, label, recap and memory context. `Run.storyMemory` is fixed at run creation and survives snapshot/resume; opening the gate midway through an ending cannot turn that same ending into a memory. Observation records retain their actual cast; absent children do not acquire dialogue when an old record is reread.

`petsRescued` now has real writers. The Clubhouse uses unknown/found/home; its false transformation countdown and pre-granted photograph clues are removed. Game Over reads actual state rather than randomly deciding a pet came home. Numeric Clues remain existing game progression and are not named evidence.

Narrative transactions serialize, flush the real storage backend, inspect dirty/failure state, and roll back only narrative-owned fields on failure. Continue stays on the scene with a retry message when a save fails. A completed gate with remaining departures recovers on next title/Clubhouse/results entry. A null-default merge bug exposed by this exact reload test was fixed in `Save`.

Network simulation is not held for one client's reading speed. Network runs use a nonblocking search/earlier-night context and local optional observation UI; the essential ward explanation is reliably supplied before the finale if unseen. Network players do not receive the same blocking preboss/aftermath scene sequence as solo/hotseat. A synchronized party dialogue-choice system remains unimplemented and is not needed for these optional local observations. Real multiplayer transport was not tested in this round.

## Review and verification history

1. Independent runtime adversary found fourteen concrete save, state, input, replay and old-surface issues. Findings and source rechecks are preserved in `reviews/runtime-adversary-round1.md`.
2. Independent fresh reviewer read all seventeen packages, the architecture, tutorial, events, relationships and implementation seams without earlier scores. Score 84 is preserved in `reviews/fresh-runtime-round1.md`. Pronoun/prop inconsistencies and false option previews were repaired during that review. The remaining depth/voice/pacing findings motivate another actual revision.
3. Tutorial browser suite passed ten groups against actual CombatEngine events, keyboard and Navigator forwarding, Help isolation and expedition handoff. See `reviews/tutorial/implementation-review.md`.
4. Runtime suite passed 22 state/Save/Run checks, short-scene UI, journal decline-and-return examination, modal controller root/Escape isolation, Clubhouse status, real run-end dispatch, reload after the gate, all eight peaceful homecomings and final homecoming milestone, with zero uncaught page errors. See `tests/narrative/run.py` and `reviews/runtime-tests/result.json`.
5. Duplicate-key and bus-name checks passed (177 files, no duplicate keys or dead subscriptions). Owned tracked-file whitespace check passed after line ending normalization. Unrelated pre-existing map changes still have whitespace warnings; they were not rewritten.

6. A second fresh runtime review scored 82 and required more participation and disappearance payoffs. The response implemented 17 three-choice aftermaths, eight route explanations with open variants, a three-choice gate, branch-specific saved records, and clearer tutorial resource steps. The Mended Thing event now ties its existing risk to opening a rattling drawer rather than penalizing an answer about identity. Effects and weights remain unchanged.
7. Investigation UI regression passed all three cases: optional/revisable guesses, either test order, saved actual tests, comparison, appropriate boss response, historical records and focus. All 17 actual boss reward routes passed choice/Short-mode/selected-outcome/persistence checks, with reward unchanged. These are controlled fixtures, not 17 naturally played campaigns.
8. Tutorial regression passed 13 groups against the actual engine and Navigator forwarding, including categorized Help and keyboard isolation. Large-text and standard screenshots were inspected. This does not establish a child's comprehension or physical controller compatibility.
9. Fresh whole-game review scored 91: character 14/15, humor 18/20, tutorial 14/15, mystery 14/15, agency 12/15, pacing 9/10, canon 5/5, accessibility 5/5. The reviewer independently verified early-pet-trace and Cat Flap preview fixes. Subsequent minor staging repairs make the spoon genuinely trapped and the goodbye wave voluntary; the kitchen question now reveals a mouse chef instead of repeating the same spoon experiment.
10. The latest ending suite passed after the choice and disappearance additions: all 22 state checks, actual run-end dispatch, selected gate outcome, reload after opening the gate, all eight peaceful home routes and final milestone; zero page errors. The earlier navigation timeout was a test wait timeout, then rerun successfully with a DOM-ready wait. Syntax checks passed; bus-name audit now covers 179 files with zero dead subscriptions.

Remaining craft limits: most regional choices intentionally converge on one regional promise, and a multi-Kid finale can still be long even with Short mode. One complete six-wing campaign was subsequently played through actual UI controls, followed by all eight homecomings. No physical controller hardware test, screen-reader test, real multiplayer transport test or child/family comprehension session is claimed. No new art, animation, publication or balance change was made. The sanctuary and collection mechanisms are explicit authored implementation choices, not newly discovered historical canon.

## October 28 actual-play repairs

The completed route exercised all six guardians, optional observations, named pet evidence, solo Kid and Companion conversations, the Keeper safety boundary, the three-step gate outcome and Orbit's voluntary departure. Peaceful visits then exercised every remaining reunion and the all-home milestone. Reload retained all eight home states and the sanctuary. The final Companion reward exposed a real routing omission: `pendingEnding` now retains that run's newly freed Companion slugs and routes unseen introductions before the gate. A legacy fallback reads only the matching live run; acknowledgement is durable and does not re-award the rescue.

Repeated paid fort visits now select among three authored captions for each of sixteen Companions without consuming gameplay randomness. Free conversations and peaceful visits appear before accumulated archives. Attic, Greenhouse and Kennels choices have distinct selected behavior and recaps. Clue details leave more inference to the player. Post-sanctuary selection explicitly revisits an earlier search; it never says a home pet disappeared again. Result screens count mapped/explored wings and actual naps rather than mislabeling the route-position index or every fort visit. Companion rescue totals exclude the starter and no longer resemble an unattainable sixteen-rescue completion meter.

Actual combat uncovered stale Dough Blob views after splitting and protected Ward animals in keyboard targets. Both presentation paths now follow the engine's real entity/target rules. Ward animals show protection rather than enemy health/attack controls; departed-animal rule text is cleared. A decorative boss map pool no longer steals a legal room's click. Atlas delayed rendering now respects scene exit. These repair input/presentation behavior; they do not change combat balance or grant progress.

Closing verification passed all six serial isolated browser suites with zero uncaught page errors: nine grouped playthrough-repair checks; 27 narrative state assertions and 13 UI groups; three investigations plus archive; 23 aftermath cases; 16 tutorial/fort behavior groups; five summary cases. The current final-Companion tests include reload before and after acknowledgement. Actual large-text settings and rendered control bounds were checked; loaded opening, Help, Ward and corrected summary images were inspected. These tests are additional to the real campaign and do not turn seventeen fixture routes into seventeen played campaigns. The [playthrough report](reviews/six-wing-playthrough/README.md) lists exact coverage, fixture corrections and evidence limits.
