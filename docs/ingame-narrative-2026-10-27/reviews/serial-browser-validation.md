# Serial browser regression results — 2026-10-28

All six requested suites passed in the specified order, each with zero uncaught page errors on its final successful run. Each used a fresh temporary browser/profile. The recorded campaign profile was already closed and was not opened or written by these tests. This is automated regression evidence, separate from the parent's actual six-wing expedition and peaceful visits; no human playtesting or new editorial score is claimed.

| Suite | Observed passing coverage | Durable result |
|---|---|---|
| `tests/narrative/playthrough-fixes.py` | 9 grouped checks, including all 16 Companion headings, title active/lifetime union and 15 rescues + starter, solo Kitchens, real map hit regression, 5 Dough DOM checks, real Ward keyboard targeting/release, Atlas delayed fetch after exit | `runtime-tests/playthrough-fixes.json` |
| `tests/narrative/run.py` | 27 state/route assertions and 13 UI groups; final-reward Wisp introduction across two reload boundaries, failed-run pet persistence, failed-write rollback, gate recovery, all 8 peaceful home routes, all-home milestone, visits before 19 clue + 7 choice records | `runtime-tests/result.json` |
| `tests/narrative/investigations.py` | 3 regional investigation flows plus archive-only evidence restriction: 4 recorded groups | `runtime-tests/investigations-result.json` |
| `tests/narrative/aftermaths.py` | 23 cases: all 17 regional routes, plus every remaining branch in revised Attic/Greenhouse/Kennels. Each checks choices in short mode, no premature commit, exact selected full paragraphs/short recap, exact committed selection, unchanged pending reward | `runtime-tests/aftermaths-result.json` |
| `tests/tutorial-narrative/run.py` | 16 behavior groups plus zero-error gate; active large-text/CSS scale and control bounds included | Groups listed below; images under `tests/tutorial-narrative/` |
| `tests/narrative/gameover-summary.py` | 5 groups: captured victory = 0 naps/6 wings/first-search home wording; explicit memory wording; 6 mapped wings; truthful peaceful-visit direction; real Rest increments naps | Images under `runtime-tests/` |

The map negative control reproduced the actual reported overlap: the boss's decorative pool intercepted `kitchens-cellars-12-1` (Inner Servants' Dining Room, row 13). Removing the regression allowed the physical mouse click to reach that legal room. This was a constructed seeded fixture, not a skipped room in the recorded expedition.

The Ward fixture used the actual `kn-1` encounter and dealt hand. Its physical keyboard target cycle was `e0` (Walking Cage), `s1` (Cage Latch), `e0`, excluding the Ward dog. Two real Scratch plays opened the latch. The animal retained its health until departure, its view and obsolete instructions left the board, and the Cage's open-door rule remained. The Ward display showed Protected animal, no health bar/numerals or combat intent, with its name, status information and Fright rule retained. Regular enemy health and intent stayed visible.

## Tutorial groups observed passing

1. All eight kid scripts present; superseded countdown/biography absent.
2. Focused native Enter advances one opening page.
3. Skipped opening leaves search recap eligible after reload.
4. Controller confirms coach without playing a card underneath.
5. Direct Haunt/piles/resources topics, three-category index, keyboard/controller selection, related Previous/Next.
6. Help rereads; E does not end the battle turn; Escape closes only Help.
7. Controller Cancel closes Help without dismissing coaching.
8. Split Nerve/defense lessons, actual hand observation, generic pre-name Companion label.
9. Actual earlier card play prevents a stale play wait.
10. Actual turn end advances the lesson.
11. Controller Cancel dismisses only coaching.
12. Scene change cleans up Help/coach; Lena's clue remains early-safe.
13. Real run-start handoff preserves the selected child and marks opening.
14. Completed opening suppresses duplicate recap across reload.
15. Fort journal remains accurately labeled after conversations are exhausted; Rest accessibility reads “to”.
16. All 16 first/repeat Companion captions preserve identity and resume/RNG behavior; paid Sit consumes one action and matches the real Run Clue award, including existing bonuses.

## Visual inspection

- `runtime-tests/ward-protected-keyboard.png`: inspected the protected animal display; regular Cage and latch retain their combat displays. `ward-freed-no-stale-rule.png` also inspected by the parent against the actual narrow claim.
- `tests/tutorial-narrative/help-resources-1280-large.png`: active large text, readable explanation, all four footer controls fit. Verified by this reviewer and parent.
- `tests/tutorial-narrative/opening-1280-large.png`: Mateo portrait loaded, large text and Go on/Skip fit. Both reviewers inspected the regenerated image. The 1920 large capture also passes active-setting and viewport-bound assertions.
- `runtime-tests/gameover-completed-summary-fixed.png`: visible 6 wings explored, 0 naps, Orbit home wording. Uses a read-only captured Run restored into an isolated context.
- `runtime-tests/wisp-final-reward-full.png` and `wisp-final-reward-short.png`: supplementary `closing-captures.py` used the real final reward path in a constructed isolated fixture, waited for the normal achievement toast to finish, then captured both views. Wisp is named, text/buttons fit, zero page errors. The reload/acknowledgement assertions are in the main narrative suite, not inferred from these pictures.

## Failures and fixture corrections, preserved honestly

- Default-sandbox Playwright driver startup stalled before browser/test evidence; a diagnostic confirmed startup was blocked. Those attempts were interrupted. Approved narrowly scoped execution with browser-subprocess/localhost access ran normally. No result was counted from the blocked attempts.
- Title starter caption, Ward species name, and summary wings label assertions initially ignored CSS uppercase transformation. Assertions now normalize display case or read unchanged DOM text. Game wording was already correct.
- The Ward rule check initially ran before its combat event queue painted the rule. It now waits for the actual rendered Fright rule. No engine or presentation behavior was changed to satisfy the fixture.
- The focused Rest setup was intercepted by the genuine first-visit service narrative. That direct fixture now sets `narrativeBypass:true` so it can test Rest itself; regular narrative routing is tested separately.
- The Sit test assumed an award of exactly one Clue and failed with the existing bonus. Its reference now runs the real `Run.addClues(1)` on an ephemeral resumed control Run and compares the UI action's result. No reward change was made.
- The first opening screenshot caught an undecoded portrait. The fixture now waits for a completed nonzero image, `decode()`, and two animation frames. The regenerated portrait is visible; no art replacement or runtime art fix occurred.
- The narrative result JSON originally listed only its older nine UI groups even though four newer assertions passed. Its report list and future writer were corrected to include all thirteen; the JSON explicitly notes this metadata correction. No rerun is claimed for that bookkeeping edit.

No new game-code change was needed during this serial verification pass. All browsers used here are closed. No required check from the six-suite request remains unexecuted. Separate limitations remain: these are browser/Node regression fixtures, not multi-device network or controller-hardware playtests, and they do not retroactively make the recorded campaign's originally missed Wisp introduction an observed event.
