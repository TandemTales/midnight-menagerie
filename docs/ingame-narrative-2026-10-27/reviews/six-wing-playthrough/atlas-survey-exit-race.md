# Atlas survey paint after exit

The parent captured the actual page-error stack while choosing Greenhouse after Kitchens: `TypeError: Cannot read properties of null (reading 'querySelector')` in `AtlasScene._paintSurvey`, at the surveyed-wing label lookup. This establishes an Atlas scene-exit race, separate from the earlier suspected Dough combat split.

`_paintSurvey()` awaits plan traces and section ink between drawing each wing. It already checks `_surveyToken` immediately after every await. `exit()` invalidated `_inkToken` but omitted `_surveyToken`, then cleared `_hots`, `_survey`, and other scene-owned references. A pending survey therefore resumed with a still-valid token and called `this._hots.querySelector()` after `_hots` had become null.

The narrow fix adds `_surveyToken` invalidation at the start of `AtlasScene.exit()`. Existing checks now abandon all pending survey work before it touches discarded scene references. Earlier Atlas copy corrections remain intact.

Validation: `node --check game/src/scenes/atlas.js` passed. A Node test imported the actual `AtlasScene`, supplied minimal canvas/DOM stand-ins, and deferred `fetch()` for the first real `_paintSurvey()` trace request. Calling the actual `exit()` before resolving that request completed cleanly. A second case restored the old token after exit to simulate the missing invalidation and reproduced the recorded null/`querySelector` exception. This verifies the failure cause and cancellation, not browser rendering. No browser was opened; the parent continues the live six-wing expedition.
