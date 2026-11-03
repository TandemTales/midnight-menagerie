# Actual expedition blocker — Dough Blob display

The root agent's UI-driven expedition (seed 21972029, Maya/Marmalade, Kitchens & Cellars) encountered an obsolete Dough Blob target displaying `NaN / 34` after Divide. Read-only engine inspection showed the original actor was already removed and two valid Doughlings remained at 11 Courage each. Root completed the encounter through ordinary card play by targeting the Doughlings; no health grant, save rewrite or encounter bypass was used.

## Cause and actual fix

`CombatScene` consumed summon and death but did not consume the engine's `entity:remove` event. Divide uses removal, not death. The old view therefore remained on the board and in the hand's target list.

Separately, `_animDamage` read the already-resolved engine state and passed `{}` to `EnemyView.setState` when the hit's target had since departed. The empty health value became the visible `NaN`.

The fix is confined to `game/src/scenes/combat.js`:

- Consume `entity:remove`, mark the old view unavailable, dispose it, remove its map entry and reflow the row.
- Paint a departed target's last hit using the real damage event's `hpAfter` and `blockAfter` instead of an empty snapshot, until its removal is animated.
- Reconcile views absent from engine state when settling, covering missed removal events and restored state.

No enemy health, damage, card effect, threshold, timing rule or reward changed. Existing sprite edits in `ui/enemy.js` were left intact.

## Verification

`node tests/dough-split/run.mjs` passes. It uses the real Marmalade card definitions and real combat engine, in this sequence: Predator's Patience upgraded; end turn; Fluff Up upgraded and Everywhere at Once; end turn; Scratch. It asserts two 11-Courage Doughlings and the genuine removal event, then feeds the actual renderer methods that event stream. Animation leaves are inert in the Node test; combat rules are not mocked.

The negative control restores the original empty-snapshot expression in an isolated copy of the actual damage renderer. The same event then fails the finite-health assertion, demonstrating that the regression test detects the reported defect. It never mutates live source.

Additional checks passed: animated-events gate (7 checks), duplicate-key gate (179 files, zero duplicates), and diff whitespace check with the file's existing CRLF convention.

`tests/dough-split/dom.js` exports `runDoughSplitDOM()` for the root agent's existing browser. It creates an independent hidden DOM host and uses real EnemyViews, engine, card definitions, and scene consumers. It does not access the user's run or save. Browser execution/result is to be recorded by root; this reviewer did not launch another browser.

A separate `querySelector`-on-null error was subsequently captured with its stack during Atlas → Greenhouse, in `AtlasScene._paintSurvey`. The independent reviewer traced it to the survey token not being invalidated on Atlas exit and fixed that separately. See `six-wing-playthrough/atlas-survey-exit-race.md`. It was not caused by Dough Blob; the two renderer issues above remain independently confirmed. The postcampaign fixture suite also exercises the real Atlas pending-paint/exit seam.
