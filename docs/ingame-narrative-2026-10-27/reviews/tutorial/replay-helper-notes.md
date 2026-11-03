# Bounded real-control replay helpers

28 October 2026. Added only `tests/narrative/replay_helpers.py`; no game files changed and no browser launched.

Load into the existing Python REPL after play_session.py:

```python
exec(Path('tests/narrative/replay_helpers.py').read_text(encoding='utf-8'), globals())
reward_offers()
reward_choose(['Rattle the Chandelier', 'Perch Up High'])
journal_read_new()
review_current_board()  # only after the operator has reviewed the visible board
routine_replay(maxrooms=3, preferred=['Rattle the Chandelier'])
```

Reward choice uses only the current DOM's offered names. The ordered preference list is explicit operator policy; when none is offered, it uses Take none. Selection and confirmation use actual keyboard/button controls. `leave_room()` uses the actual exit and returns the actual next scene, including narrative, rather than waiting forever for a map. It does not make unfinished room decisions for the operator.

The journal helper clicks only top-level observation buttons and closer details. It logs exact exposed text, leaves hypotheses, investigative experiments/comparisons, physical choices, and conversations untouched, and never claims an automated extraction is a human reading. Existing observations can be expanded without choosing their actions. Limits: 30 new observations by default, hard cap 50; at most 50 recorded clue closer sections.

Routine continuation is deliberately conservative: one visible legal Scuffle path may be entered; route branches and all other room types stop. It uses the existing real-keyboard `fight` tactic unchanged, bounded to 8 turns per fight by default and capped at 12. Before its readiness/input steps, a guard compares only the current visible card rules, enemy telegraphs, and status labels against explicitly reviewed text. Numbers are normalized, mechanic words are preserved. An unreviewed signature, boss, dialog, narrative, event, shop, rest, result or other scene stops. Review acknowledgements exist only in Python memory. No game state, save data, engine methods, scene navigation or future draws are modified/read to manufacture progress. Scene/arena inspection is read-only.

Python compilation, side-effect-free import, and pure numeric-signature checks passed. No live execution of these new helpers has occurred; parent owns the live browser and should inspect the first reward and journal operation before reusing them. Loops are finite and synchronous, with ordinary Playwright timeouts.

## Pending UI copy source audit

Current source contains the shared Discoveries journal label, Rest/Mend accessible arrow-to-word substitution, all four procedural event Sharpen strings, and full-opening-only SEARCH-RECAP suppression. Prior neutral picker footer was verified in attempt2 by parent. The newer journal/aria and procedural wording require verification in the current browser after reload; source inspection is not a rendered UI assertion. Added tutorial runtime assertions still await the browser test window. Raw attempt2/Greenhouse logs remain unchanged.
