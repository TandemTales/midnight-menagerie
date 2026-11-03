# SPINEL Round 51

Completed independent build on `codex/r51-b` in `D:/UILOOP/r51-20261029/b`. Baseline: `c483cbb33fe2b458d0e0cd5e43443dfb6a198e29`. Original judged source freeze: `501ebb999a1015d2c3435169baae75ec0d36c4f9`. All required local functional proofs and ten canonical captures pass. Root owns the selected-build integration battery and blind review; these notes do not claim those later results.

## Presentation and scope

The complete natural featured card stands inside a painted walnut mourning alcove with a recessed wall, physical shelf and contact shadow. Portraits and the snuffed candle sit together at upper left, with separate wrapping portrait captions. Progress count, region and wing have separate layout areas. All narrative, 16 canonical / 109 long unique Tricks, 8 statistics and actions remain accessible. The established GARNET shop geometry and effective rules font sizes are preserved.

Named painted continuation rails reserve their own controls. The event leaf now keeps its illuminated initial completely within the reading viewport; its full-width rail meets the reading cutoff with a measured 0 px gap. Its painted support remains visible at both initial sizes. Rest cost cartouches have patina. Combat help uses the shared painted cartouche. Main board titles retain their size but disable the harsh SVG outline and use lavender fill; computed styles confirm the intended cascade on all four boards at both sizes.

Production changes are limited to combat presentation/naming bounds, event/rest/gameover/shop presentation and appended scoped kit CSS. No engine, game data/state, renderer, maps, actor placement or index changes. No sibling Round 51 source was used.

## Owner grouping

Each active group has one stable 17 px cartouche with `data-fx-owner=actorId`. Actual party metadata names Maya Chen with Bones or Count Crumbula; enemies use their displayed names. Both cartouche and text Range bounds participate in packing. Only blank ribbon padding was trimmed: condition text, magnitude, font, pop/fade, full lifetime and FIFO remain unchanged. No actor movement or engine delays were introduced.

The local candidate set adds neighborhood edge positions, forward-prunes incompatible domains and caps search at 384 nodes. Existing ribbons and captions reposition atomically. Disconnected actors cancel already-visible ribbons and captions; pending removed-owner cleanup remains intact.

## Art provenance

Built-in image_gen generation only. Exact prompt and mode: `SPINEL-r51-ART.txt`. All four supplied UI reference paintings were inspected before generation. The generated source is `game/assets/ui/r51-spinel/alcove-source-v1.png`; `tools/prep_r51_spinel.py` prepares versioned `alcove-v1.webp` and `shelf-v1.webp`. Source and both prepared assets were visually inspected. Total source plus outputs: 2,700,218 bytes, below 8 MB. No baked UI text, actors, portraits or controls.

## Passing evidence

All JSON evidence is under `SPINEL-r51-proofs/`; executable probes are under `tests/ui-r51-spinel/`.

- `animated-queue.json`: original 14 Bones cases preserve all 84 labels, plus two additional actual Maya Chen & Count Crumbula all-owner cases. All 96 delivered and expired; full lifetime and repeated-owner FIFO pass. Normal boss cases show six simultaneous ribbons at both sizes. Every sampled frame checks one caption per active owner, actual name, 17 px size, text/cartouche union, actor/UI/label clearance, viewport, locality and cleanup. Zero failures.
- `timings.json`: layout p95 1.4 ms, maximum 2.5 ms. Ordinary crowded maximum drain 5.1664 s, about 0.37 s above the approximately 4.8 s baseline target. Repeated same-enemy stress drains 9.348 s at 1280 and 4.856 s at 1600, with no loss or shortened lifetime. Per-case onset and drainage are recorded. Worst case frame interval p95 is 46.5 ms, maximum 96.6 ms; this is not a universal 60 fps result.
- `idle-resize.json`: queued label recovers after idle 320-to-1280 resize in 0.143 s, with its named 17 px caption, then fully expires and removes the caption.
- `owner-lifecycle.json` and `lifecycle-unit.json`: pending removed owner leaves zero queued/orphan frames; a surviving owner gets its full duration. Additional already-visible owner removal starts with a live ribbon and caption and clears both plus the pending queue within the measured 100 ms observation.
- `interactions.json`: all 12 shop purchase targets, 4 rest choices, 3 event options and 3 memorial actions are hit-testable; enabled targets focus. Keyboard and the actual gamepad poller move focus. Every visible continuation's Enter/Space changes its intended scroller; end-to-top returns 0 and shortcuts remain scene-local. Title cascade passes at both sizes.
- `memorial.json` / `memorial-long.json`: all 16 / 109 unique Trick entries are reachable, all 8 stats are clear at the bottom; card/progress and cue/cue overlaps are zero. Canonical natural card outline is complete at both sizes; rules lines are nonempty, unclipped and at least 16.9 px effective size.
- `keepsakes.json`: actual live run with 24 Keepsakes verifies the active tab cue, hidden inactive rail, all items reachable, Enter/Space scrolling and end-to-top.
- `shop-rules.json`: five actual shop card rules rectangles at both sizes are clear of clipping and name banners; established font sizes retained.
- `event-boundary.json`: fresh initial event pixels at both sizes show the whole decorative initial, full-width rail and exactly 0 px reading-to-rail gap. All three options hit/focus; Enter/Space scroll and end-to-top pass. The broader interactions suite was rerun after moving the rail; the final width adjustment has this focused proof.

The first crowded diagnostic failed to drain two owners and exposed transient caption/ribbon overlaps; `failed-crowd-diagnostic.json` is retained. A later all-delivered run still exposed two heading-locality failures; `failed-heading-locality.json` is retained. Bounded candidate expansion, atomic publication and per-cell locality repaired these failures. Assertions were tightened, not weakened. The fixed-width memorial slot also exposed stale card scaling during live resize; restoring a responsive slot repaired the outline. Final evidence supersedes these diagnostics.

## Final captures and static checks

All ten images are in `D:/UILOOP/r51-20261029/judging/SPINEL`: rest, event, gameover, shop and combat-floaters at 1600x900 and 1280x800. Every image was visually inspected, along with `shots/SPINEL-own-title.png`. `canonical.json` records each SHA-256, dimensions, metadata and source commit. All ten capture exits are 0; URLs use seed 7, Bones and Maya, with pics=1 for Rest/Event/Gameover. Combat uses the supplied real six-status script and pauses only for the canonical photograph after six visible labels are reached. Animated proofs run separately without this capture pause.

Two completed Rest captures are retained from `46ff398e5b63a0afab149a3c269900a684e5adaa`, explicitly approved by root: subsequent production edits affect only event presentation. Both event sizes and the remaining six images use final freeze `501ebb999a1015d2c3435169baae75ec0d36c4f9`. The interrupted capture's exact 12-process tree was stopped and verified absent before fresh event testing. No unrelated browser was stopped.

Canonical metadata reports hardware Intel UHD ANGLE, no page errors and no blank frame. The existing shader warning about potentially uninitialized `f_wfHallTable` remains recorded. Final static checks: 14 scene sheets / 1592 classes / zero conflicts; zero undefined CSS tokens; JS syntax passes; original Round 50 lifecycle unit passes; endings guard against the supplied baseline passes; diff whitespace check passes.

## Process and limitations

Browser/GPU access was serialized by root and explicitly released after all canonical and own-title browser runs exited. No browser work remains. Server PID 39808 served port 9512; exact shutdown is recorded below. No usage reset was redeemed. The title and existing card typography remain intentionally unchanged outside the scoped board title treatment. Hardware frame intervals and the repeated-owner 1280 drain are reported above rather than hidden by a shortened lifetime or font reduction.

Owned server identity was verified as Python `tools/devserver.py 9512`; PID 39808 was stopped and confirmed absent. Source freeze remains 501ebb999a1015d2c3435169baae75ec0d36c4f9; the final evidence commit changes documentation only.

## Selected correctness repair: measured ribbon ink

After both blind judges selected SPINEL, the parent's focused probe exposed animated buff/debuff/blocked text extending beyond the reserved DOM envelope by up to approximately 1.73 px. The failed evidence is preserved in `SPINEL-r51-proofs/failed-ribbon-ink.json`. This is a selected correctness repair on top of `4a8ec4c28a38a55b3f90b4973d8c5a0b829b09b9`, not a redesign. All ten original judging PNG SHA-256 hashes still match `canonical.json`; none was overwritten. Parent will run the selected integration gates and separately retake the two affected combat images.

`combatfx.js` now removes the recycled slot's transform while measuring the union of the real DOM box and text Range. It reserves that union at the largest animation scale, including existing scale/translation rounding. Because text can overhang asymmetrically around the DOM center, placement retains a constant offset computed at maximum scale; every smaller animated envelope remains nested. The normal independent `translate: -50% -50%` and centered transform origin are preserved. The only CSS change reduces empty owned-ribbon vertical padding from 2 px to 1 px. No font, magnitude, pop/fade, lifetime, FIFO, numeric damage movement, actor placement, board source or gameplay changes.

The first corrected full16 run already passed all 96 labels, but ordinary crowded maximum drainage increased to 6.202 s. That honest larger-envelope diagnostic remains in `ink-queue-before-padding.json`. Reducing only empty padding restored the final maximum to 5.1661 s versus the prior selected 5.1664 s.

Final portable regression evidence, all under `SPINEL-r51-proofs/`:

- `ink-focused.json`: unchanged parent five-kind probe at both sizes, all ten cases with maximum outside distance **0 px**, full pop/fade sampled and fully drained. Its original 1 px tolerance and assertions are unchanged. `ink-font-comparison.json` confirms all ten computed font sizes match the original failing run exactly. Executable: `tests/ui-r51-spinel/ribbon-ink.py --port 9512 --out shots/ui-r51-spinel/ink-final`.
- `ink-animated-queue.json`: original 14 Bones cases / 84 labels plus both longer actual-party cases; all 96 delivered and expired, no queue residue, six simultaneous normal boss ribbons at both sizes. Every visible animation sample now includes real ribbon text ink in envelope, actor/UI, other-label, caption, viewport and locality assertions, including the late fade. Full lifetime/FIFO and one actual-name caption per active owner remain required. Executable: `tests/ui-r51-spinel/probe-queue.py`, with `R49_URL=http://localhost:9512`, `R49_OUT=shots/ui-r51-spinel/ink-queue-final` and no `R49_QUICK`.
- `ink-timings.json`: final layout p95 / maximum **1.6 / 2.6 ms**, versus prior 1.4 / 2.5 ms. Ordinary crowded maximum **5.1661 s**; repeated-owner drainage **9.3474 s at 1280**, **4.8429 s at 1600**. Worst frame interval p95 / maximum **48.4 / 96 ms**, versus prior 46.5 / 96.6 ms. Exact onset, drainage and timing for every case are retained; no universal 60 fps claim.
- `ink-idle-resize.json`: idle queued label recovers after 320-to-1280 resize in **0.138 s**, named 17 px caption appears, full expiry and caption cleanup pass.
- `ink-owner-lifecycle.json`: removed pending owner has zero orphan frames / pending entries; removed already-visible owner changes from one live ribbon and one caption to zero ribbons/captions/queue; surviving player retains full lifetime. No browser override was used.
- `ink-envelope-unit.json`: portable real CombatFX measurement/animation fixture checks **16,000 animation samples** across symmetric and asymmetric text rectangles, four magnitude scales, DOM-center offsets and production transform rounding. Numeric damage control preserves rising motion and never enters owned-word measurement. Executable: `node tests/ui-r51-spinel/ribbon-envelope.mjs`.
- `ink-lifecycle-unit.json`: original pending-owner lifecycle assertions still pass; fixture supplies the newly required minimal DOM/Range measurement surface. Executable: `node tests/ui-r50/queue-lifecycle.mjs`.

Both final boss proof snapshots were visually inspected without modifying canonical comparison files. JS syntax, scene CSS (zero conflicts), CSS tokens (zero undefined), and endings guard against the original baseline pass. Whitespace check uses Git's `cr-at-eol` option to recognize the repository-required native CRLF endings in combat.css rather than treating CR characters as trailing spaces. No text trailing whitespace is introduced.

The selected repair used the root-owned server **PID 40704**, command `tools/devserver.py 9512`. It remains running and was not stopped or replaced. All probe browsers exited normally; GPU/browser access was explicitly released to root after the final lifecycle probe. No further browser work remains for this subagent.
