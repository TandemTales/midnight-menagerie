# Help-frame repair evidence (2026-11-08)

Status (2026-11-10): **FRAME3 accepted and merged** (`91da720e`, paired 13-7), and its focus state repaired by repair 15 (`e5b32a7e`, paired 4-0). FRAME1 and FRAME2 were rejected. Verdicts are at the end of this file.

## Before-change baseline

Base: dev `50f803650219a7b4cdd766566bdc7f8798da1655`, isolated at `D:/UILOOP/r61-help-frame/wt`, server 8777. The user's 28 existing modified capture files in the main workspace were recorded by SHA256; all still matched after the fresh baseline captures.

`python tools/gates.py`: **119 gates in 4807 seconds, 22 red**. The older handoff's four-red result did not reproduce. Raw output: `D:/UILOOP/r61-help-frame/baseline-gates.log` and individual logs in `baseline-gates/`.

The three standing reds reproduced: five enemy-clip timing failures, four floor-plan seam false positives, and seven sprite halo clips. Base-effects passed 170/0. The other nineteen failures are preserved; many were navigation/wait timeouts, but net also had four delivery/order/unsubscribe failures, Chrome had a large-text HUD clipping failure, and Steam Deck had a controller-focus failure. These were observed before any implementation edit and are not silently treated as known-green.

The initial default browser was downloaded Chromium 151. Tests explicitly selecting Chrome or Edge retained their choice. Fresh captures and subsequent checks use the previous UI loop's installed-Chrome adapter (Chrome 156); explicit Edge remains respected. Its only request stub is a 204 for localhost favicon. No game URL is intercepted and no existing assertion was relaxed.

An installed-Chrome baseline recheck of cards-feel passed (exit 0, 322.1 seconds). The recheck runner was then intentionally stopped to release the single GPU slot for the required redesign. The next Chrome test was interrupted; the remaining baseline rechecks have no result. Evidence: `baseline-chrome-rechecks/results.json`, logs, and `STOPPED.md`.

## FRAME1: vertical labels, rejected

One builder made a shared right-frame rail with full-size labels rotated like book spines, permanent button coordinates, modal hiding, and a separate Guardian voice action. The initial full help test passed 30 scene/size checks. Manual review then found a missing Guardian mutual-clearance assertion; the revised targeted test passed 10 checks at both sizes, including modal focus and disabled/enabled Guardian lifecycle. Mounting or removing Guardian voice left the shelf, piles, End Turn and hand bounds unchanged. One intermediate 30-second native-dialog timeout is preserved; the screenshot showed the dialog open, and the new help test's default timeout was raised to 60 seconds.

The repaired queue probe passed **18/18**, every condition delivered at 1280x800 and 1600x900. Static checks passed: line endings, whitespace, zero scene CSS conflicts and zero undefined tokens. Evidence: `D:/UILOOP/r61-help-frame/repair-queue/`, `repair-queue.log`, `build/shots/help-frame-shelf2/`, and `BUILDER-REPORT.md`.

Fresh dev and candidate captures used identical recipes, seeds, sizes, browser adapter and timing. Each set completed 20/20 without retries. The clubhouse at 1280 triggered the tool's bright-paper warning in both versions; both were visually inspected, fully rendered, with valid hardware WebGL and no page errors. Images/states/logs: `D:/UILOOP/r61-help-frame/DEV/` and `FRAME1/`. Source hashes: `candidate-source.json`.

Ten screens were paired with one random coin per screen and shared coins for their two sizes. Two fresh judges read the rubric and all four references, then reviewed opposite screen/letter orders with no source, history or key access. Pair folder: `D:/UILOOP/pairs61p/`.

**Result: candidate 3, dev 15, same 2. Rejected.** Both judges preferred horizontal reading labels; judge 2 preferred dev on all eight non-modal screens. Some of judge 1's comparisons concerned inconsistent caption/blueprint rasterization visible in both variants; no consistent connection to the help change was established. The full tally is retained, and the horizontal-label rejection does not depend on those incidental differences.

Key: [FRAME1 key](PAIRED-r61-repair14-frame1-key.json). Raw verdicts: [judge 1](PAIRED-r61-repair14-frame1-judge1.md), [judge 2](PAIRED-r61-repair14-frame1-judge2.md).

## FRAME2: upright footer fitting, rejected after validation

The same builder replaced rotated labels with a horizontal fitting on the bottom-right gold frame. How to play keeps the same coordinates across scenes; Discoveries extends the fitting to the left where available. Combat paints only the occupied slot. Nearby footer content makes room locally: the right combat shelf, map travel controls and small desk candle, clubhouse expedition action, rest exit, and atlas dossier spacing. Reading type and room geometry are not reduced.

Direct comparisons with frozen dev measured normal five-card and distinct nine/twelve-card hands at both sizes. Fit, actual transform scale, and effective name/rules font sizes matched exactly in all six comparisons. Fit values were 1 / 0.875 / 0.75 at 1280, and 1 / 1 / 0.875 at 1600. The comparison is opt-in through `MM_HELP_BASELINE_URL`; the normal gate needs only its current server on 8777.

The default single-server help gate passed **30/30**, no page errors, in **660.25 seconds**, below the battery's 900-second limit. It also checked six crowded-hand configurations. Evidence: `frame2-attempt3.log` and `build/shots/help-frame2-attempt3/`. Attempt 2 preserved the successful direct baseline comparison and a collision false positive from a map node outside its clipped viewport; the helper now intersects obstacle bounds with clipping ancestors. Its failed proof is retained.

The fresh resize/modal diagnostic completed 48 snapshots on baseline and candidate, all scrollers zero and root/map/HUD bounds stable. The original scene-prefix replay also stayed stable immediately before and after its clean screenshot; the earlier shifted raster did not reproduce. No game scrolling change was made.

A genuine high-Haunt map exposed a real three-condition overlap between The Whole House and Discoveries. Conditional wrapping for three or more plates fixes it and preserves the ordinary two-condition layout. Focused three/four-condition checks passed at both sizes, with native/custom focus roundtrips and no page errors (168.48 seconds, `frame2-crowded4.log`). The default gate now has 32 checks; the final full run belongs to the final battery.

The stronger geometry checks also caught the test sampling the existing 14px map entry animation before it finished, and sampling the armed state before the animation began. Saved settling traces show the exact 14px movement with zero scrolling. The test now requires the existing drawn flag, finite-animation completion, and repeated stable geometry. Failed attempts and before/after values are retained.

The final queue probe passed **18/18**, with every condition delivered at both sizes and exit 0 (`frame2-queue.log`, `build/shots/help-frame2-queue/proof.json`). The second blind paired review later rejected FRAME2 (full result below).

## Capture readiness correction for the next comparison

`tools/shot.py` remains unchanged. Its existing renderer warm/steady-frame waits and fixed three-second map wait usually leave ample time, but they do not explicitly prove the map has left its armed/drawing states. The confirmed timing races above occurred after warm-page scene changes, not in a reproduced fresh-shot failure; they do not establish the cause of FRAME1's intermittent lettering differences.

The parent capture harness now applies an identical explicit guard to new DEV2 and FRAME2 captures of map, hud-late and settings. It waits for map entry completion, loaded fonts, completed finite animations and stable root/HUD/bar rectangles, rejects nonzero shell scrolling, and saves a readiness record in each state JSON. For Settings it runs before the modal opens. Other scene recipes, seeds, viewports and existing waits are unchanged. Animation-strip tools are unchanged.

The original FRAME1 harness is preserved at `D:/UILOOP/r61-help-frame/capture-frame1.py`. New attempts keep unique source-image names and individual logs; timeout cleanup terminates only the spawned capture process tree before another attempt. Survey 16 will use the same readiness guard; survey 15's original images remain the comparison baseline, so any incidental lettering/entry-state difference must not be credited to a source-layout change without supporting evidence.

## Reproduction

The checked-in `survey-2026-11-08.py` preserves survey 15's sixteen screen recipes and seventeen room recipes. Its `survey-chrome-2026-11-08.py` adapter is the prior UI loop's installed-Chrome wrapper. Pass a worktree, its server port, and an output directory; use `--screens` for the repair subset and `--rooms` for the full survey. It runs one browser job at a time and refuses page errors, missing GPU contexts, warm-up timeouts and low-variance void frames. Bright-paper warnings still require visual inspection.

No authored art, animation, document, binary capture, or raw build output belongs in the commit. D: worktrees and evidence are retained; do not delete them without Josh's approval.

Evidence publishing uses hard links for unique, immutable source captures on the same volume, with a copy fallback across filesystems. This avoids duplicate image writes on the slow D: evidence drive and preserves exact bytes. Room captures also use a unique run prefix, normalized only in the published filename. Existing evidence is never overwritten. The rendering recipes and pixels are unchanged.

D: later held screenshot writes open for several minutes (disk queue 12). The owned capture tree was stopped, with all partial attempts retained. Worktrees stayed on D:, while completed DEV2 images were SHA256-verified into `C:/Users/Josh/AppData/Local/Temp/mm-help-frame-20261108/DEV2/` and the remaining fresh captures continued there. The harness passes absolute image names to the unchanged capture tools, placing source artifacts beside their published images. No browser, scene, timing or pixel recipe changed.

The first two C: clubhouse attempts saved their PNG but failed in `shot.py`'s diagnostic `os.path.relpath` call because source and output were on different drives. Neither was accepted. The wrapper now prints an absolute path only for that cross-drive case; attempt 3 completed normally with state/error validation. Raw logs and rejected PNGs are retained. This changes filename reporting only.

Visual inspection of guarded DEV2 `hud-late.png` still shows partial blueprint annotation lettering despite a valid readiness record. The guard establishes DOM entry/scroll/geometry stability; it does not establish that every rasterized glyph is complete. The same map code is used by both repair variants. Do not attribute an incidental lettering difference to the help layout, or claim the readiness guard repaired it.

Fresh DEV2 and FRAME2 capture sets completed **20/20 each**. All 40 randomized pair PNGs were verified byte-for-byte against their assigned sources. Both 1280 clubhouse bright-paper warnings (8.02% and 8.03%) were visually inspected at full size: fully drawn boards/portraits/paper, no flash or blank frame, no page errors. The final ten source-file hashes still match `frame2-source-manifest.json`; endings guard passed eight modified text files with zero repairs and whitespace passed. Two fresh judges reviewed the C: `pairs61q` folder in opposite screen and letter orders. Raw per-image manifests and manual-warning review are beside that folder.

## FRAME2 verdict: rejected

The second candidate lost **6 new / 12 dev / 2 same**. Both judges preferred dev on rest and both fights: the new footer displaced the primary exit/End Turn grouping and pressed help against the ornamental corner. Clubhouse and both atlas views split. Piles won twice and Settings tied twice. Map/hud judgments also named inconsistent blueprint lettering; keep the raw votes, but do not attribute that raster difference to the source layout. The rejected ten-file implementation is retained byte-for-byte at `D:/UILOOP/r61-help-frame/rejected-frame2/`. No commit or merge. Keys and both raw verdicts are the adjacent `PAIRED-r61-repair14-frame2-*` files. The same builder will revise again.

During static judging, frozen dev was rechecked with installed Chrome: net functional assertions passed 227/0, but one unexpected resource404 kept exit1. This is not a green suite; its URL still needs identifying. Log: C:/Users/Josh/AppData/Local/Temp/mm-help-frame-20261108/baseline-net-confirm.log. Browser closed.

Static inspection also confirmed that the pile CSS and case-slot/moon/cartouche assets are byte-identical in frozen dev and FRAME2, despite missing material decoration in DEV2 piles-1280. The two pile preferences cannot yet be causally attributed to the help change. A diagnostic wrapper has been prepared to retain an ordinary still and a later network/font-settled still while recording pending requests; it has not run while the builder owns the GPU. No capture-readiness claim is made from it yet.

FRAME3 explores direct frame medallions with full-size upright hover/focus labels, restoring the primary-action footer and atlas spacing. The first right-rail attempt failed revealed-label clearance on rest/atlas, so the same builder is checking a left-rail home. These remain diagnostics, not an accepted design.

The parent browser adapter now covers the same localhost favicon204 stub for both `Browser.new_context` and `Browser.new_page`; the latter creates its context internally and bypassed the prior stub. No game URL is intercepted and no assertion is muted. The net recheck is pending GPU release.


## FRAME3 validation and fresh-capture method

FRAME3 uses direct44px enamel medallions at x=4 on the left gold frame, with Discoveries at50%-48px and Help at50%+4px. Upright20px/22px labels appear immediately on hover or actual keyboard/controller focus, expanding over the medallion in the existing dark cartouche art. Both native and custom dialogs hide the whole fitting, including focused labels. Original combat/End Turn, Rest, clubhouse, map and atlas spacing is restored; Guardian voice is a separate contextual shelf action. Existing availability is preserved on map, atlas, clubhouse, rest and combat.

The final default help gate passed38/38 in309.29s with0 page errors. It covers14 scene visits at both sizes, clubhouse tabs, labels and hit areas, whole dialogs, focus return without scrolling, keyboard/controller activation, four-condition maps and the real Guardian lifecycle. Supplemental synthetic2/4-Kid and12-card checks passed6/6 in133.02s. Every5/9/12-card frozen-dev comparison measured exactly0 delta in fit, scale and effective name/rules type. Queue passed18/18, every condition delivered at both sizes. Static/syntax/endings checks passed. Only blank EOF cleanup followed the default gate; final source hashes are retained in frame3-diagnostics/frame3-source-manifest.json. These party checks prove local layout, not real-wire or Steam behavior.

The installed-Chrome frozen-dev net recheck now passed227/0,0 unexpected console errors, exit0, with the favicon-only adapter covering both context creation APIs. Log: C:/Users/Josh/AppData/Local/Temp/mm-help-frame-20261108/baseline-net-favicon-recheck.log. The initial raw baseline failure is retained above.

A frozen-dev pile diagnostic retained an ordinary screenshot and a second network/font/image-settled screenshot. The first had a pending skull.webp image; it finished before the second1.21 seconds later, which visibly includes the skull/books decoration. This proves one late asset, not the cause of all prior missing material or SVG-lettering differences. The source CSS/assets remain unchanged.

All new FRAME3/dev still captures opt into the same network-idle, font-ready, DOM-image-decode and two-paint-frame guard. The original seeds, scene waits, viewports and map guard remain. The adapter prints a still-ready record; the capture harness requires it. Functional tests and animation-strip timing do not opt in. Survey16 will use this same method against unchanged historical survey15 images; incidental loading/raster differences must not be credited as source changes. Diagnostic images/request records are in the C: evidence root under asset-probe/.

FRAME3 blind review retains ten logical votes per judge. Map and combat-boss include supplementary focused Help views at both sizes, sharing their parent screen's random A/B coin and vote; they do not add votes. The default full survey remains the original sixteen neutral screens plus seventeen rooms.

## FRAME3 verdict: accepted (2026-11-10)

Fresh sets were taken from the frozen dev worktree (`DEV5`, 24/24) and FRAME3 (`FRAME5`, 24/24) with the still-ready guard. Seventeen FRAME5 attempts came back void ("the stage never finished warming within 150s"), scattered over both sizes while other GPU work ran on the machine. Four views failed all three attempts and passed on a plain retake (`FRAME5R`); the others passed on their own second or third attempt. They were machine state, not the candidate. The ten source hashes matched the manifest before pairing and after the merge.

Two fresh judges, opposite orders, ten votes each, in `C:/Users/Josh/AppData/Local/Temp/mm-help-frame-20261108/pairs61s/`. **FRAME3 13, dev 7** (by margin 14 to 10).

- FRAME3 won atlas, atlas-house, hud-late, piles and settings from both judges: nothing on a candle, and nothing peeking from under a dialog.
- Dev won map and combat-boss from both, decided by the **focused** views: the focused label drew as a flat box with a square yellow outline over the map's "THE WAY IN" lettering and across the fight frame's left rule.
- Rest, clubhouse and combat-crowd split; one judge liked the plaques' old spots beside the next action, the other the fixed rail.

Merged `--no-ff` as `91da720e`. Key and verdicts: `PAIRED-r61-repair14-frame3-*`.

## Repair 15: the focused medallion stays enamel (accepted)

`bb7932fd`, merged as `e5b32a7e`. Only `game/src/ui/story.css` changes:

- Focus lights the medallion's own gold rim, with a candle halo; the square yellow outline is gone.
- The label is the dark cartouche with its full end caps, hung **beside** the medallion, so the "?" and book stay in view.
- On the clubhouse and atlas the label still covers its medallion. There, the boards' and the house's own buttons start right beside the rail (x=108 at 1280 in the Backpack panel), and the help gate's collision check failed three times until the label kept FRAME3's narrow footprint on those two scenes.

Help gate 38/38 and party/crowded 6/6. Paired on the focused map and fight against dev: **4-0, every vote by 2.** Key and verdicts: `PAIRED-r61-repair15-*`.

What the judges still want: a stronger focus cue, since the ring is close to the resting state; a label that does not lie over the map's "THE WAY IN" at 1280; and a plate as ornamented as the samples' nameplates.
