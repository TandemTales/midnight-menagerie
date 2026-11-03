# Runtime adversarial review — implementation round 1

Reviewer: separate AI agent `/root/runtime_adversary`. This is a source and seam review, not human playtesting and not a whole-game literary score. Read the new runtime modules without reading earlier scores or writer defenses. The implementation changed during review; statuses below distinguish the first finding from source recheck. No game source was edited by this reviewer.

## Findings delivered to implementation owner

1. **High — durable-save success was falsely inferred.** `state/narrative.js::commitStory` initially awaited `Save.flush()` and checked its return. `core/storage.js::flush` catches backend errors, increments `stats.failures`, re-adds the dirty slot, and resolves `undefined`. A failed write therefore advanced the scene and recorded a reunion as successful. **Fix:** check actual storage failure/dirty state across the flush, including an already running flush. **Source recheck:** owner added both checks and a serialized write queue. A real backend-failure test remains appropriate.

2. **High — failed narrative write could roll back unrelated progression.** The original transaction cloned and replaced all of `Save.data` after an asynchronous write. This both invalidated existing references and could erase concurrent progression. **Fix:** serialize narrative writes and restore only narrative-owned state in the same save object. **Source recheck:** narrowed rollback to `narrative` and `petsRescued`, preserving the top-level object and other progression.

3. **High — the first ending could become a remembered ending midway through itself.** `narrativeRoute` used current `sanctuary` as the run's memory classification. The gate scene sets sanctuary before pet departures, so re-entering gameover could dispatch `END-MEMORY` instead of the unfinished reunion. **Fix:** prioritize persistent pending ending for all ending entry routes, and snapshot whether a run began as a memory. **Source recheck:** `gameover` added to pending-ending priority; `run.storyMemory` added to constructor, snapshot and resume.

4. **High — journal keyboard commands reached the underlying scene.** Native `dialog.showModal()` does not stop bubbled global key handlers. Rest's Enter can leave the room; Clubhouse's Escape navigates to title; map Enter/Space can choose the focused room. **Fix:** isolate key dispatch while the journal is open, with cleanup. **Source recheck:** window capture handler now stops propagation and owns Escape. Requires browser verification with actual map, rest and clubhouse scenes.

5. **High — controller could not reach the journal and its details.** `Navigator.root` originally recognizes only `.mm-modal`; the native journal is appended outside the scene root. Even after recognizing `dialog[open]`, `summary` was absent from controller candidates, making closer examination inaccessible. **Fix:** include native dialog roots and summary controls. **Source recheck:** native dialog root added; summary follow-up sent to owner.

6. **High — resume watchdog can repeatedly reset the pre-boss scene.** `Run._ensureCombatOnScreen` retries `scenes.go('combat')` every 60 ms while restoring an interrupted battle. The new interceptor redirects each retry into narration until its final page marks `before:<region>`, recreating the page while the player is reading. **Fix:** recognize an active narrative scene whose continuation is the same combat as a legitimate pending combat screen. Finding sent to owner; regression should cover reloading before the first boss scene finishes.

7. **High — remote players missed essential revelation.** Remote mode bypasses all arrivals, preboss, afterboss and `HEART-WARD`; its first story could be the final gate opening. **Fix:** supply reliable essential care/refusal/transformation/Keeper evidence without blocking network simulation. **Source recheck:** `endingUnits` now prepends the missing Heart evidence. This repairs essential delivery at the finale; remote pre-fight discovery remains a narrower experience than solo and should be disclosed.

8. **Medium — deeper evidence was awarded without examination; first repair made it inaccessible.** Initially base examination saved `detail` immediately, so a player could later read a close observation never made. Owner separated the write, but then closing the journal before opening Look closer left `detail: []`; base id was permanently seen and neither current nor archive view offered the missing close look. **Fix:** track detail-seen separately from authored detail and keep the closer action reachable at a valid location. Both findings sent; needs decline-and-return regression.

9. **Medium — already-found pets had no return scene.** `reunionUnits(kid)` returned nothing for `found`, followed by `HEART-SAFE` claiming animals settle behind the party. **Fix:** an exact found-return variant for each pet. **Source recheck:** eight return lines now exist and a Node probe returns `PET-maya-return` for found Maya.

10. **Medium — sanctuary relationship payoff could precede its setup.** Clubhouse visit directly displayed Companion C without B. **Fix:** offer or include missing B first, then C, with explicit seen records. **Source recheck:** owner added missing B before C and records both.

11. **High — old results copy contradicted new state and agency.** `gameover.js` changed its boolean to persistent data, but still said a found pet was not reached and that a home pet had not been put down since. **Fix:** distinct unknown/found/home copy with safe reunion semantics. **Source recheck:** distinct current states now replace these lines. Home text no longer asserts restraint.

12. **High — Clubhouse retained a fake timer and fake evidence.** `_buildPets` says “The longer they are in there, the less of them comes back,” and renders an invented transformation stage. `BOARD_CLUES` grants a fifty-year family photograph and Feeding Room evidence on a fresh save. The Menagerie says all sixteen must be freed to reach Heart, contrary to the real expedition structure. **Fix:** use actual observation records and unknown/found/home state; remove decay/stage display and false Heart gate. Finding sent to owner; source regression required.

13. **Medium — author-only notes leaked into player-facing recaps.** Regional recap examples included “not a pet-loss timer,” “saved departure,” and “not a missing-pet reunion.” **Fix:** retain these as metadata/comments; write short scene facts for children. Sent directly to regional writer. This is a prose/UX issue, not a request to remove useful factual safety wording from help.

14. **Medium — pending-ending route did not mark active run completion.** A Node probe of `narrativeRoute` with real exported module showed pending ending units but `runBound: false` and `hasEndingMarker: false`. Normal first ending goes through this priority branch, leaving `seen.ending` unset. A later gameover request can replay completion. **Fix:** bind active matching run and mark its ending when the final scene commits. Do not bind an unrelated run when recovering an older pending ending.

## Evidence and limits

- Read actual `Run.enterNode`, `_startCombat`, `_beginCombat`, `_ensureCombatOnScreen`, scene manager, storage flush, input navigation and existing scene key handlers.
- Ran Node imports of the real narrative module and pure state probes. The available Node is v24.19.0 and supports the module import without the removed `--experimental-default-type=module` flag.
- No browser playthrough, controller hardware test, full expedition or simulated human playtest was performed by this reviewer.
- Rechecks above are source-level confirmation of changes visible during the review. They are not a declaration that every issue is now closed; owner must run actual seam/UI tests and record the final status.

## Required regression routes

Fresh save → skip opening → first real region; pre-boss story reload; full versus short Heart evidence; found pet → defeat → retry; gate committed → process reload → remaining departures; all eight peaceful sanctuary visits; new memory expedition after sanctuary; remote first win; disk-write failure during pet departure; journal base look → close → closer look later; journal keyboard Enter/Escape on map/rest/clubhouse; controller navigation to nested details; fresh Clubhouse with zero actual observations.
