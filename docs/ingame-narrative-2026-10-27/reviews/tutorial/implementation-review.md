# Opening and tutorial implementation review

28 October 2026. Author/testing agent: tutorial. This record is implementation validation, not an independent score, physical controller test, children’s playtest, or whole-game acceptance.

## Files and scope

- `game/src/scenes/tutorial.js`: eight selected-Kid openings; eight-pet opening; caring/agency-compatible premise; nonfatal retreat; retry text; fresh-expedition instruction; correct focused-button Enter behavior; invalid Kid cannot silently become chosen.
- `game/src/ui/coach.js`: five cards; real event predicates; completed-action memory; stale asynchronous wait cancellation; Help button; keyboard/controller arbitration.
- `game/src/ui/scuffle-help.js`: eleven self-paced pages using the real Modal; focus isolation; scene-leave cleanup; no combat/save mutations.
- `game/src/input/navigation.js`: additionally authorized narrow change to `_forwardKey`: events now bubble from the active scene DOM rather than directly targeting window. A controller marker lets the coach distinguish Confirm from a deliberate physical Up used to play. Existing summary-selector/native-dialog changes by root are preserved.
- `tests/tutorial-narrative/run.py`: real Edge, real game DOM, real engine, real Navigator and real Run handoff. No mocked gameplay APIs.

## Substantive findings and revisions

1. **High — simultaneous input actions.** The original coach and hand both consumed Enter. A focused opening button also advanced through the scene-level listener and its native click. Coach now captures its own advance; story buttons retain one native action. Test observes page index and unchanged hand/Nerve, then performs real engine play.
2. **High — action waits could teach already-completed actions or fire stale delayed advances.** Coaching now tracks eligible events from mount, skips an already-satisfied wait, and uses an epoch for delayed continuations. TUT-003 also accepts a deliberate player end turn so no desired/affordable card is a valid path onward.
3. **High — Help opening race, discovered by browser test.** E immediately after opening Help previously reached combat before next-frame focus transfer. Help now claims outside-dialog keys immediately. Test failed before repair and passes after it.
4. **High — controller forwarding bypassed capture priority, discovered by browser test.** A direct window-targeted synthetic Escape could open Settings before coach capture. Navigator now sends the action through the DOM path. Tests call actual `Navigator.handle` for Confirm and Cancel; neither plays an unintended Trick nor opens Settings beneath coaching.
5. **Medium — incorrect story assumptions.** Removed seven-pet count, fifty-year biography, animal-corruption deadline, and implied enemy erasure. Distinct Kid leads now use the source-reviewed manuscript, and previews use the same trace as the subsequent page.
6. **Medium — Priya rock continuity, independent root review.** Opening now says “I packed a warm stone. I hope it’s the right one.” It no longer carries the familiar crooked stone already evidenced inside the House. The next joke uses Pixel’s name and preserves the adaptive-plan payoff in the reunion.
7. **Medium — progression lesson overload.** Long fixed lecture reduced to intent → read/resources → real play → real turn end → recap. Haunt, Lives, piles, input details and repetition moved to Help. This is a compact implementation adaptation; expanded manuscript success-caption and contextual SYS prompts are not claimed implemented here.

## Validation result

`python -u tests/tutorial-narrative/run.py`: PASS, ten grouped assertions, against local server at port 8777 with installed Edge. The sandbox stalls starting Playwright; approved escalation ran the browser. Bundled Chromium is absent, so no install was performed. The documented server was offline and the repository devserver was started locally, hidden.

Observed passing seams:

- All eight exact Kid keys; old false biography/count removed.
- Focused native Enter advances opening once.
- Real Navigator Confirm advances coaching without playing a Trick.
- Real Help modal rereads, captures E, and closes only itself on physical Escape.
- Real engine card play satisfies coaching early; real player end turn advances the appropriate lesson.
- Real Navigator Cancel dismisses coaching only.
- Scene changes close Help and destroy coaching; no modal-open class remains.
- Correct selected Kid survives actual run:start and the new narrative arrival route to the map; opening completion is saved.
- No uncaught page errors.

`node --check` passes for all four changed JS modules. Test-file corrections used actual `Card.uid` rather than mistaking card objects for IDs, and explicitly selected a story page when carrying prologue session state. These were harness issues, not fabricated game failures.

Visual inspection: `tests/tutorial-narrative/coach-resource-1280.png`, `coach-1280.png`, `opening-1280-large.png`, and `opening-1920-large.png`. At 1280×800 the resource card leaves the hand, enemy intent, End Turn, Nerve and Courage visible; the buttons wrap to two rows without clipping. Large-text Mateo opening fits at both 1280×800 and 1920×1080. This does not establish layout safety for every device/locale.

## Remaining limits

Physical controller hardware, screen-reader output, child comprehension, touch accuracy, every seed and every help-page layout have not been playtested. The controller navigation code path is automated-tested. The current source’s Foyer encounter still has its existing combat rules, art and HUD; those were not rebalanced or replaced. Global skipped-opening recap and persistent Help entry belong to root integration, which the handoff test exercised but this agent did not author. Expanded manuscript SYS scenes remain proposals unless separately wired by root.
