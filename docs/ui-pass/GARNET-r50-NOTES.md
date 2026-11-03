# GARNET — Round 50 candidate

Baseline: `8dc9904a91448c8c41638f865aeade7fd0599ea2`. Branch: `codex/r50-b`.
Implementation checkpoint: `68aba0ef`. Final production source: `7c5e57cd`. Canonical captures all use that exact source.

## Interpretation
Carved travelling-theatre shop, plum velvet framing a three-column, two-row Trick display. Existing card faces and enlarged type are preserved; only the shop-owned height/rules capacity is adjusted. The merchant retains his painted mirror and gets a supporting walnut lip. Upper shelf and lower ledge continue across the cabinet. Rest action interiors and memorial side panels use quiet painted velvet. The event page shows a continuous carved lectern lip and grounded foot.

Each reading viewport receives its own adjacent named continuation rail; it occupies layout space outside content and footer controls. End states return to top. Memorial Tricks and Keepsakes have separate rails that hide with their inactive viewport. Existing identifiers and Enter/Space propagation safeguards remain.

Combat presentation and queue implementation are unchanged from repaired baseline; no ownership label is added. No gameplay, map, actor placement, fonts, animation-rate, hand or run-rail changes.

## Art provenance
Built-in image_gen in generation mode. Exact prompt in `GARNET-r50-ART.txt`. Source retained in `game/assets/ui/r50-garnet/velvet-source-v1.png`; source, full curtain, quiet centre and walnut lip inspected. Deterministic preparation: `python tools/prep_r50_garnet.py`. Total new assets including source: 3,018,215 bytes, below 8 MB.

## Verification status
- Static scene-css: 14 sheets, 1,590 classes, zero conflicts.
- Static css-tokens: zero undefined tokens.
- JavaScript syntax: shop, gameover and scroll helper pass.
- `git -c core.whitespace=cr-at-eol diff --check`: pass; original CRLF endings retained.
- `tools/endings_guard.py --base 8dc9904a91448c8c41638f865aeade7fd0599ea2`: ENDINGS OK before checkpoint.
- Shop text rectangles: all five cards, both sizes; zero clipping or name-banner overlap. Effective rule type remains baseline 16.973 px at1280 and17.052 px at1600; no type reduction.
- Pointer/focus: all12 shop purchase targets,4 rest choices,3 event options,3 memorial footer controls hit and enabled controls focus at both sizes.
- Keyboard arrows and synthetic controller through the actual poller move focus in all four scenes at both sizes. Continuation Enter/Space preserve the current scene.
- Memorial normal16 and long109 Trick rows: all hit/reachable at both sizes; all8 stats clear at bottom; heading/card and cue/cue overlap zero. Both inner and outer Enter/Space cases execute, and end-to-top passes.
- Live Keepsakes page: all5 items reachable, Enter/Space/end-to-top pass at both sizes, inactive Tricks rail hidden.
- Own-server title reference captured and inspected. All ten canonical images captured from frozen source and individually inspected at both dimensions. Every capture exit0, runtime errors empty, void false, hardware GL. SHA256 and full metadata retained in GARNET-r50-proofs/canonical.json. No retakes were needed after the freeze.
- Proof JSON files saved under GARNET-r50-proofs. The first discarded interactions attempt only changed hash and did not mount later scenes; final probe forces a document navigation and asserts nonempty targets. Controller probes use the footer's actual horizontal axis.
- Both combat captures visibly retain six complete real status labels: player Weak/Dexterity/Regen and Butler Strength/Vulnerable/Bristle; clear of actors and UI. No combat production files changed, so the full14-case animated queue suite was not rerun for this candidate, per parent instruction.

## Process
Hidden development server used port9502, exact PID652. Logs: `shots/garnet-server.stdout.log`, `shots/garnet-server.stderr.log`. Exclusive browser slot granted by parent; all browser work completed and slot explicitly released. All Playwright contexts closed and canonical helper exited. Server stopped by exact verified PID after captures.

Canonical PNGs and metadata: `D:/UILOOP/r50-20261029/judging/GARNET/` (same images also in worktree shots). Supporting interaction/end-state PNGs: `shots/ui-r50-garnet/`. The canonical images include lower content behind clearly named scrolling boundaries; complete contents are evidenced by functional probes, not claimed visible at once.

## Remaining limits
Parent runs the selected candidate's full seven browser gates and seam audit. No candidate-specific full14-case combat queue rerun because combat presentation and ownership code are unchanged. Existing shader compiler warning about f_wfHallTable appears on room captures; no page/runtime errors. No claims of perfection or independent judging results. Last account usage check:66% remaining; no reset redeemed.
