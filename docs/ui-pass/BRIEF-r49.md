# Round 49 — painted objects, readable cards, and clear ownership

Read BRIEF-r0.md, BRIEF-r48.md and RUBRIC.md. This brief overrides their
ownership lists. Keep the user's enlarged type, slower motion, realistic
scrolling blueprint and grounded actors. No game rules or data changes.

Round48 selected HELIODOR by two blind votes to one and passed its browser
battery. All three reviewers still found flat cloth, a shallow parchment
board, clipped shop card rules and ambiguous ownership of floating labels.
An extra border or gradient is not sufficient for this round.

## Five deliverables

1. **Rest:** replace the rigid vector Blanket Fort with a properly painted
   cloth object: sagging seams, irregular quilting, compressed cushions,
   weighted drapes and soft lantern/contact shadows. Keep the four distinct
   option objects, with enough padding for every line to clear its frame.
2. **Event:** paint a convincing wooden lectern/support for the page, with
   thickness, perspective and a connected candle or brass lamp. Keep the
   narrative and choices as live, readable text. Retain the soft moonlight.
3. **Shop:** every line of all five Trick cards must be readable at1280,
   including Boomerang Bone. Increase real card/rules capacity and use an
   explicit scrollable layout if needed; do not shrink fonts or hide cards.
   Improve lower counters and description slips using the prior IOLITE
   treatment as an idea, and wrap product names between complete words.
4. **Gameover and all four boards:** preserve all eight stats, every Trick,
   all descriptions and controls. Show an unmistakable, styled continuation
   cue when content scrolls, and a clear end state. Provide room for complete
   plaques and captions above the footer. IOLITE's compact engraved plaques
   are a useful graft, with the existing readable names and costs retained.
5. **Combat words:** keep the serif tags, all current information, size and
   lifetime. Give each actor its own clearly attributable group beside its
   head. Keep labels off faces, other actors, nameplates and health bars.
   Grouping by a global center column fails this requirement. Check a boss
   and a crowded ordinary encounter; do not change combat rules or actor
   placement to make the labels fit.

## Assets and independence

Study all four UI reference PNGs. Use the imagegen skill for new painted
bitmap fort and lectern/support assets, with its built-in tool by default.
Read C:/Users/Josh/.codex/skills/.system/imagegen/SKILL.md. No CLI/API fallback
without the user's explicit authorization. If built-in generation fails,
report it and continue independent layout work; do not silently substitute a
different model or service. This does not require pausing unrelated work.

Generate art without baked-in interface text, portraits, controls or logos.
Preserve transparency for cutouts. Inspect every result, optimize outputs,
and keep new assets under8MB total per candidate. Save selected source art,
reproducible preparation scripts, final assets and the actual prompts/mode
in your worktree. Never reference an asset only from the generator cache.
Use versioned names; do not overwrite shared art. Each builder develops an
independent interpretation and must not read sibling49 builds.

## Ownership

Own rest/event/gameover/shop scene files, their new assets/prep scripts,
and floaters in fx/combatfx.js plus their combat.css rules. Combat.js may
change only to supply actor identity/bounds to presentation floaters.
Shared kit/tokens may only be appended to. Fix shop card capacity through
owned scene layout/hooks; do not redesign the shared card face or reduce its
typography. Keep existing identifiers, ARIA, tests' selectors and all copy.

Do not touch map/atlas/blueprints, engine/data/state, renderer, rooms,
enemy.js, sprites, portraits, hang.js, the hand or run rail. Hung paintings
still carry no added names. Do not solve crowding by deleting, dimming or
shrinking information.

## Checks and captures

Use your own worktree/server. Browser work is strictly serialized through
the parent's GPU queue. Code, asset generation and static checks can proceed
independently. Commit coherent steps; run endings_guard against the supplied
baseline only in your worktree. Never normalize main's mixed-ending files.

The parent supplies a capture helper and Chrome wrapper. Five screens at
1600x900 and1280x800, seed7, Bones/Maya; rest/event/gameover use pics=1.
Combat uses the verified script which waits for the real animation queue and
pauses when six real labels are visible. Never judge vanished labels or a
room whose warm-up failed. Inspect all images and metadata.

Also check scrolling to the bottom, focus/hit-testing every option, mouse,
keyboard and gamepad paths, full card-rules visibility, all eight stats and
all Tricks. A computed font size alone does not prove text is readable.
Retake only affected images after fixes. Report what remains unverified.

The parent runs the full selected-build battery: chrome, steam-deck, gamepad,
events, gameover-keeps, seams/proof, combat-scene/seam; static scene-css,
css-tokens and seam audit. The audit was repaired in round48; four existing
floorplan.js run.get/set reports are a local Map false positive. Compare
against baseline and do not weaken the checker to hide them.

The user requires stopping all work at3% usage remaining. Check periodically,
checkpoint exact commits/capture gaps and stop your own processes by exact
PID at that threshold. Never redeem a usage reset.
