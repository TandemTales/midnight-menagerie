# Codex continuation inspection — 2026-10-26

Scope: inspect the inherited game and prepare to resume. No game code, assets,
balance, dependencies, or Git history changed during this inspection.

## Actual stopping point

- Checkout: `dev`, HEAD `a388656c` (2026-10-23), which adds the Survey 10
  capture script and judge prompt.
- UI rounds through 46 and its graft are merged. Graft `e09ec808` keeps the
  improved atlas, event, rest, gameover and piles, but restores survey 9's run
  strip because the 18-coin version lost on legibility. Do not reapply it.
- The latest instruction in `HANDOFF-PROMPT.md` is **Survey 10, paired against
  Survey 9**, before briefing the next visual round.
- Photography appears to have happened after the handoff: `shots/SURVEY-*.png`
  contains all 49 expected images, dated October 23: sixteen screen views at
  two sizes and seventeen rooms. All 32 corresponding screen state JSON files
  have empty `errors`. This is evidence of capture, not a completed blind review
  or verified capture-to-commit provenance.
- The named `D:/UILOOP/survey9/NOW`, `D:/UILOOP/survey10`, and release directories
  are unavailable here (checked outside the sandbox too). `C:/UILOOP` retains
  surveys through 8. No Survey 10 verdict/report was found in the repository.
- `progress.json` is dated August 27 and is obsolete. Both handoffs contain
  accumulated historical sections; their early headlines and old open-bug lists
  must not override the October entries or current code.

## Architecture and constraints

- Browser game: `game/index.html`, vendored Three.js, plain ES modules, no build
  step. Bootstrap: `game/src/main.js`.
- `game/src/combat/` owns headless rules; `scenes/` and `ui/` present them.
  `state/run.js` owns the expedition; `net/actions.js` is the shared mutation
  entry point for solo/co-op. Seeded RNG and cross-module contracts matter.
- Seventeen implemented regional enemy rosters; ordinary expeditions have six
  wings (`EXPEDITION_WINGS`). Companion content lives in `data/companions/`.
- `fx/atmosphere.js`, shader code and `core/renderer.js` build the procedural
  rooms. UI and room rendering are distinct systems.
- Keep the render-scale governor. Preserve the 60 fps goal and evaluate the
  Steam Deck at 1280x800. Handoff reports little performance margin in several
  rooms and slow Greenhouse/Hedge shader links; these were not rebenchmarked.
- Read `CONTRACTS.md` before edits and the relevant `docs/design/` chapter.
  UI constants come from tokens; engine APIs must not silently no-op; verify
  effects against real implementations. Respect file ownership when delegating.
- Recorded owner preferences: favor the player's chance to win when uncertain;
  room color need not match sample hues; no invented painting names; HUD
  legibility outranks showing every object. One visual round at a time.

## Checks performed today

| Check | Result |
|---|---|
| Gate discovery | 106 gates, no unlisted entry points reported |
| Combat engine | 695 passed, 0 failed |
| Co-op combat | 645 passed, 0 failed |
| CSS tokens | 0 undefined tokens |
| Hook names | 202 declared, 0 unknown |
| Scene CSS | 13 sheets, 1539 classes, 0 conflicts |
| Title and boss-combat preview | Both rendered at 1280x800 and were visually inspected |

Python, Node, Pillow, Playwright and Electron dependencies are present. The
Playwright-managed Chromium executable expected by the installed Python package
is missing (`chromium_headless_shell-1234`). The unchanged combat/co-op runners
were executed via a temporary in-memory wrapper selecting installed Chrome
(`BrowserType.launch(channel='chrome')`). The normal commands still need their
browser installation repaired or an explicit supported local-browser option.

The fresh browser sessions logged a 404 for `/favicon.ico`, identified from the
console's resource URL. There were no observed JavaScript page exceptions in
the combat preview. `shot.py` counts the favicon console error as failure, so
the title screenshot run exited 1 despite rendering correctly; do not describe
that capture as an entirely clean smoke test.

The static `tests/seams/check.py` produced no result during several minutes and
was interrupted. The three shorter static checks above ran separately. The full
106-gate battery was **not** run. The inherited seven sprite HALO failures remain
historical known failures, not newly verified results.

Inspection images: `shots/codex-inspection-title.png` and
`shots/codex-inspection-combat.png`. These are smoke observations, not performance
measurements or blind style verdicts. The dev server was started on port 8777.

## Working tree to preserve

At entry: one tracked modification, `tests/critic-design/result.json`, and 171
untracked status entries, chiefly card-art source sheets, enemy animation source
folders, two DOCX files, painting sources and survey support files. None was
staged, deleted or replaced. Source assets are not automatically integrated:
the release packager includes tracked `game/` files only.

## Resume sequence

1. Preserve the October 23 survey captures and their state files before any
   rerun overwrites the canonical `shots/SURVEY-*` names. Inspect all captures
   for completeness, matching seeds, paintings, warm-up and render tier.
2. Recover Survey 9's baseline or reproduce it in an isolated checkout of its
   documented capture commit, `a546138e`, using the canonical survey recipe.
   Do not compare survey 10 against survey 8 and label that survey 9.
3. Repair the local capture/test environment and replace unavailable D: output
   paths with a suitable accessible location. Keep builder checkouts outside
   OneDrive under a short path when development resumes.
4. Complete independent blind image reviews and the paired Survey 9/10 review,
   following `docs/ui-pass/SURVEY10-judge-prompt.md` and the established rubric.
   Fresh evidence should select the next round; do not blindly restart the old
   TODO list. Prior likely targets include Kennels straw, Heart props and
   Ballroom haze, subject to the survey.
5. Fix confirmed high-priority bugs before the next visual round. Run affected
   gates, then the required integration battery; preserve known-failure evidence
   rather than weakening checks.

Steam packaging is implemented (`tools/package_release.py`, `docs/RELEASE.md`)
but `shell/steam_appid.txt` is empty. The release checklist still assigns App/
depot IDs, legal credits, achievement registration, store setup and actual Deck
verification to the owner. Steam Cloud, overlay integration and executable
branding are documented gaps. No package or upload was attempted today.
