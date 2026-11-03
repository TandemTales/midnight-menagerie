# Round51 — named condition groups and a complete painted memorial

Prepared from both independent Round50 reviews. Start after validated GARNET
integration. Read BRIEF-r0.md, BRIEF-r50.md and RUBRIC.md. This brief overrides
their deliverables/ownership. Inspect all four UI sample paintings first.

Both judges chose GARNET (7.8/8.1); neither awarded reference-fit9. Preserve
its painted velvet shop, continuous shelf, natural three-column cards, enlarged
type, complete rules and working named continuation. Do not spend the round
restyling already successful shop geometry. Two defects are now mandatory
priorities: condition ownership and the memorial's incomplete card/stage.

## Deliverables

1. **Combat ownership:** give each active actor's condition group one readable
   owner cartouche or portrait/name heading, tightly associated with that
   actor. Friendly wording must reflect the actual kid/companion party, using
   existing human-readable names; enemy names must match their actors. Avoid
   one repeated name on every ribbon or a detached global column. Keep the
   existing condition text, type, magnitude, full pop/fade/lifetime, local
   packing and FIFO overflow. No actor movement or engine delays. Include
   headings in packing and every-frame collision/viewport/locality tests;
   protect silhouettes, intent/guard crests, name/health bars, player resource
   panel, hand and controls. Normal boss must retain six simultaneous labels.
   Keep ordinary crowded drainage close to the current4.8s maximum; report
   measured onset/drain and avoid turning the added identity into a long
   backlog. Keep search bounded (current p95~1.9ms, max8.6ms).
2. **Memorial:** replace the black field of thin gold lines behind the central
   card with a convincingly painted cabinet/alcove: rear depth, structural
   ledge and contact shadows. Show the complete natural card outline and its
   rules in a deliberate detail region at both sizes, preserving effective
   text size. Reallocate space and trim empty padding instead of reducing
   type. Give portraits and the extinguished candle clearer emphasis. Separate
   Maya/Bones subtitle widths and lines; organize progress count, wing and
   room as distinct readable parts. Preserve every existing statistic, Trick,
   Keepsake, description and action. Long content may scroll with explicit
   boundaries, but the canonical featured card should be fully readable.
3. **Scrolling furniture:** turn flat boundary strips into painted structural
   rails/inset cartouches belonging to each board, with specific region names
   and reserved cue space. Use PERIDOT's double-rule treatment as an idea,
   preserving GARNET's functional placement. Avoid stray partial row names
   touching the Final Tricks footer. Keep live Tricks/Keepsakes switching,
   all end states, keyboard isolation and focus/gamepad scrolling.
4. **Event and rest material:** show a believable page/easel lower lip and
   support with shared candle light/contact shadow. It should read as support
   in the initial view, not a room-wide overlay. Integrate rest cost badges
   with their frames using patina/soft gold highlights. Improve the fort's
   rear-wall/floor continuity if useful without repositioning its inhabitants.
5. **Typography and utility controls:** soften harsh white/gold outlined
   headings into readable engraved lavender lettering matching the samples,
   without shrinking any existing text. Give combat's How to play the same
   gold-rimmed cartouche/enamel treatment as the other utility controls. Keep
   shop card feet/price tags grounded with consistent small contact shadows.

## Scope and assets

Own rest/event/gameover/shop scene presentation and new assets/prep scripts.
Own fx/combatfx.js condition-group presentation, its combat.css rules, and
combat.js only for identity/bounds/caption data and How to play presentation.
The board-scroll helper is in scope. Shared kit/tokens may only be appended
to; scope changes to owned scenes/new classes. Preserve identifiers/ARIA and
all actions. No engine/data/state, actor placement, renderer, room, sprite,
portrait asset, map/atlas/blueprint, hand, run rail or hung-painting changes.
Keep the user's enlarged text and global two-thirds animation rate.

Use the imagegen skill/built-in tool for the new painted memorial support and
any genuinely needed material. Inspect outputs. No CLI/API fallback without
user authorization. No baked text, characters or controls. Preserve source,
exact prompts/mode, versioned optimized assets and reproducible prep; new
assets including source total under8MB. Each builder develops independently;
prior Round50 grafts are allowed, but never inspect sibling51 builds.

Expose each visible owner heading with `data-fx-owner="actorId"` so geometry
checks can identify it. Include heading rectangles in the existing animated
probe, require one heading per currently visible owner group, and test actual
names, including a real longer name. Keep new captions readable at stable
visible scale (at least17px apparent at1280). They must not remain visible
without their group or leak after an owner leaves.

## Verification and workflow

Root serializes all browser/GPU work. Code/art/static work may proceed while
waiting. No browser launch before explicit grant. Use installed Chrome and
PYTHONIOENCODING=utf-8. Root supplies capture.py/chrome.py/combat-capture.js.
Capture the same five screens at1600x900 and1280x800 (seed7 Bones/Maya;
rest/event/gameover pics=1), plus own-title inspection from BRIEF-r0. Inspect
all ten final pixels/metadata and retake affected scenes after real fixes.

All candidates change combat this round: run the complete fourteen-case
animated queue proof at both sizes, including all four crowded enemies and
repeated labels, extended to measure headings. Preserve84-label conservation,
FIFO/full lifetime, six-at-once boss and idle-resize recovery. Include the
Round50 owner-teardown unit/browser regressions: obsolete pending visuals
are cancelled when their owner leaves; live owners still receive their full
labels. Do not weaken assertions or omit visible bounds to obtain a pass.
Report real layout/frame timing, queue onset/drain and remaining limitations.

Verify all five shop rules with text rectangles/banner occlusion, all actions
and focus targets, mouse/keyboard/actual gamepad polling, normal16/long109
memorial Tricks plus8stats and long live Keepsakes. Prove relocated cue keys
actually execute; test end-to-top and active-tab binding. Use fresh document
navigation or verified MM.goto; hash-only navigation can leave the old scene.
The selected build gets the parent's full seven-gate browser battery and
scene-css/css-tokens/seam checks. Four floorplan local-Map audit false positives
are known and unchanged. Use endings_guard against the supplied baseline only
inside your worktree; commit scoped source/proofs/notes. Never touch main's
files or index. Two fresh blind reviews, third only if they disagree.

Continue the loop until every screen is reference-fit9 or usage reaches3%
remaining. At cutoff save exact gaps and stop owned processes; never redeem
a reset. Preserve original comparison images through any selected repairs.
