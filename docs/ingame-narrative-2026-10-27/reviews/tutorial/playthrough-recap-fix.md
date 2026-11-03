# Observed playthrough repair — duplicate search recap

28 October 2026. Root's actual six-wing UI playthrough observed the full opening followed immediately by SEARCH-RECAP repeating the search premise. This agent inspected the source and prepared the repair without launching a competing browser.

## Source diagnosis and smallest fix

`narrativeRoute` shows SEARCH-RECAP on the first map arrival when both the run's search marker and the profile's `narrative.seen['SEARCH-RECAP']` are unset. `TutorialScene._begin` previously recorded only `seenTutorials.opening`, a flag deliberately shared with `_skip`. Therefore neither route could distinguish a player who had received the full opening orientation from one who skipped it.

`markOpeningSeen(completed = false)` now accepts a completion argument. `_begin` calls it with `true`; `_skip` keeps the default. Full completion marks the existing SEARCH-RECAP knowledge milestone and saves it along with the opening flag before run:start and the first map route. Skip still marks only the opening flag. No new state key, cutscene, route, art or gameplay change is introduced. Foyer arrival remains independent and is not suppressed. Earlier root edits to flashlight/eight-shoes opening copy and pet/Companion wording are preserved.

If a player had previously skipped, then explicitly completes the opening, the newly changed recap milestone still triggers Save.save even though opening is already in seenTutorials. Persistence retains the distinction on reload. Existing best-effort Save behavior is unchanged; a refused write can produce redundant orientation after reload but cannot erase required facts, reunions or rescue progress. The marker represents delivered orientation, not a claim that the exact recap scene played.

## Targeted validation prepared

`tests/tutorial-narrative/run.py` now exercises actual Skip, verifies the real narrative router still returns SEARCH-RECAP, flushes/reloads, and verifies skip does not gain the full-completion milestone. Its existing completion-branch handoff now asserts the first narrative route excludes SEARCH-RECAP, flushes/reloads, and checks the real router with a fresh real Run still knows the orientation. These checks add no gameplay mocks. They test the completion branch; the root's actual playthrough supplies full opening traversal evidence.

Static checks completed: `node --check game/src/scenes/tutorial.js` and Python compilation of the updated browser suite pass. **The new browser assertions have not yet run.** Root owns the only active Edge session for the six-wing playthrough; this agent intentionally did not launch another. Runtime acceptance remains pending that coordinated test window.
