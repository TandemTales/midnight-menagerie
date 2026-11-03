from pathlib import Path
import hashlib
import json
import subprocess

root = Path('D:/UILOOP/r53-20261029')
integration = json.loads((root / 'integration.json').read_text())
battery = json.loads((root / 'winner-battery/results.json').read_text())
seams = json.loads((root / 'parent-static/seams.json').read_text())
timing = json.loads((root / 'c/docs/ui-pass/FLUORITE-r53-proofs/final-timing-summary.json').read_text())
controls = json.loads((root / 'c/docs/ui-pass/FLUORITE-r53-proofs/raster-controls-final/proof.json').read_text())
assert len(battery) == 7 and all(r['exit'] == 0 for r in battery)
assert seams['sites'] == 9110 and len(seams['problems']) == 4
assert {r['line'] for r in seams['problems']} == {692, 695, 698, 704}
assert all(r['file'] == 'game/src/state/floorplan.js' and r['kind'] == 'UNKNOWN-METHOD' for r in seams['problems'])
assert len(integration['files']) == 109 and integration['main_index_preserved']
index = Path(subprocess.check_output(['git', 'rev-parse', '--git-path', 'index'], text=True).strip())
assert hashlib.sha256(index.read_bytes()).hexdigest() == integration['main_index_sha256']
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == '99bdba9f42ec90ffe720b620b1082367b75c7fd1'
assert Path('docs/ui-pass/BRIEF-r54.md').is_file()

result_path = Path('docs/ui-pass/RESULTS-r53.json')
result = json.loads(result_path.read_text())
assert not result['applied_to_main'], 'Finalization already ran; do not prepend records twice'
result.update(
    status='complete; unanimously selected build validated and applied as working changes',
    selected_commit=integration['winner_commit'],
    comparison_source='61f1fa10fe208241e32243fc721d5bf98cb2a7b2',
    validated_captures='VALIDATED-CAPTURES-r53.json', applied_to_main=True,
    applied_files_byte_verified=len(integration['files']), main_index_preserved=True,
    main_index_sha256=integration['main_index_sha256'], browser_gates=battery,
    selected_post_review_repair_required=False,
    static_checks=dict(scene_css_conflicts=0, undefined_css_tokens=0, seam_sites=9110,
                       unchanged_local_Map_false_positives=4, syntax='pass', endings='pass', whitespace='pass'),
    scope_review='Six scoped presentation CSS files and six painted derivatives; game JavaScript unchanged. Other applied files are tests, evidence and notes.',
    derivative_asset_bytes=73458,
    combat_proofs={**timing, 'ink_cases': 10, 'max_ink_overflow_px': 0,
                   'idle_and_owner_teardown': 'pass', 'actual_long_quantity_rows': 109, 'copies_each': 12},
    controlled_rendering_validation=dict(
        raw='FLUORITE-r53-proofs/raster-controls-final/proof.json',
        trials=[dict(variant=r['variant'], frame_p95_ms=r['frameTimes']['p95'],
                     frame_max_ms=r['frameTimes']['max'], paused_ms=r['pausedMs'],
                     full_lifetimes=len(r['expired'])) for r in controls['results']],
        effective_styles_verified_before_and_after=True,
        screenshots_or_extra_browser_work_during_measurement=False,
        conclusion='No repeatable current-auto penalty demonstrated in the bounded verified control; not a universal performance claim.'),
    evidence_limitations=[
        'Earlier selected-build causal timing comparisons were invalid because overrides lost to lazy-loaded CSS; the4x attribution is retracted.',
        'A directory-substitution error overwrote the first invalid isolation JSON and five PNGs; its log and other invalid raw runs remain. Final valid controls are preserved separately.'
    ],
    parent_server_shutdown='winner-battery/server-shutdown.json',
    next_brief='BRIEF-r54.md')

readme_path = Path('docs/ui-pass/README.md')
readme = readme_path.read_text(encoding='utf-8')
start = readme.index('**Current,')
end = readme.index('Round51 SPINEL is complete', start)
readme = readme[:start] + '''**Current, 2026-10-29:** Round53 FLUORITE is complete and applied as working
changes. Both fresh blind reviewers chose it (8.6/8.6). All seven parent browser
gates pass; all109 applied files match the tested build and main's index is preserved.
No main commit/push. See [results](RESULTS-r53.json), [validated images](VALIDATED-CAPTURES-r53.json)
and the [Round54 brief](BRIEF-r54.md). Continue the full loop; stop at3% remaining.

Round52 TOURMALINE is complete and applied in the prior baseline. Both reviewers
chose it (8.2/8.2); seven parent gates and46-file byte verification passed.
See [results](RESULTS-r52.json) and [validated images](VALIDATED-CAPTURES-r52.json).

''' + readme[end:]

handoff_path = Path('HANDOFF-PROMPT.md')
handoff = handoff_path.read_text(encoding='utf-8')
start = handoff.index('**Latest checkpoint,')
end = handoff.index('You are picking up', start)
handoff = handoff[:start] + '''**Latest checkpoint, 2026-10-29:** Round53 FLUORITE is applied as working
changes. Both fresh blind judges selected it at8.6; all seven parent browser gates
pass. All109 files byte-verified, main index preserved, no main commit/push.
Selected commit5a5da72d94b0b92956e024dec7a793d8fae74e52 lives in its isolated worktree.
Continue Round54's full three-build/two-blind-review loop; stop at3% remaining.
Read `docs/ui-pass/ROUND-r54-2026-10-29.md`, `RESULTS-r53.json` and `BRIEF-r54.md`.
Earlier raster-cost claims were invalid and retracted; final verified controls
support the selected sharper auto treatment. See the evidence limitations in results.
Historical pushed/merged statements below do not describe these current working changes.

''' + handoff[end:]

checkpoint_path = Path('docs/ui-pass/ROUND-r53-2026-10-29.md')
checkpoint = '''# Round53 complete — FLUORITE applied

This completion record supersedes historical progress below. Both fresh blind
judges chose FLUORITE at8.6; all-fit9 remains false. Final selected source/evidence
5a5da72d94b0b92956e024dec7a793d8fae74e52 applied as working changes, all109 files
byte-verified and main index preserved. No main commit/push. All seven parent
browser gates and CSS/token/syntax/endings/whitespace checks pass. Seam audit9110
sites retains only4 known floorplan local-Map reports. No post-review game repair
was needed; all ten validated images retain exact original comparison hashes and
actual visual-source61f1fa10 provenance. Parent22112/9534 and all builder servers
are stopped. Root has no active browser job.

Selected auto game tree equals original fully tested27b3b5d6. Accepted full proof:
auto-raster-initial,16cases/96lifetimes/2443frames,10inkcases0overflow. Full-fixture
frame tails include screenshot work and are not isolated game performance. Final
verified6 controls use distinct effective styles, pre/post equality and no capture
pause/tool work: baseline20.5/28.4ms p95 versus auto22.7/21.7. No repeatable auto
penalty shown. Earlier4x claims are INVALID and retracted. The overwritten invalid
first-isolation JSON/five PNG limitation is explicit in selected notes/results;
final valid raw evidence remains preserved. A and B also completed corrected
controls; B's invalid unrebased-URL comparison is preserved and marked invalid.

Continue at ROUND-r54-2026-10-29.md and BRIEF-r54.md. Main UI gains: live textured
headings, fitted worn plaques, modular joined rails and crisper conditions. Next
priorities: irregular carved letter faces, dimensional condition supports, rim wear,
physical paper/list recesses and restrained joined rail faces. Preserve successful
memorial/shop layout and all user constraints. Latest usage37% remaining.

## Historical Round53 progress (superseded above)

''' + checkpoint_path.read_text(encoding='utf-8')

next_path = Path('docs/ui-pass/ROUND-r54-2026-10-29.md')
assert not next_path.exists(), 'Round54 checkpoint already exists'
next_checkpoint = '''# Round54 — preparing independent builds

Main is validated Round53 FLUORITE, selected5a5da72d94b0b92956e024dec7a793d8fae74e52.
Both judges chose it at8.6; no paired screen reached9+fit. All seven parent gates
passed,109 files byte-verified, main index preserved, no main commit/push.
All Round53 owned servers stopped; GPU free. Latest usage37% remaining.
Continue the full loop; stop at3% remaining, never redeem resets.

Read BRIEF-r54.md/RUBRIC-r54.md and required prior briefs. Planned neutral codes:
AMETRINE baseline, MORGANITE(a), PERIDOT(b), KUNZITE(c). Root will run
tmp/ui_round_setup.py54 AMETRINE MORGANITE PERIDOT KUNZITE to create only three
isolated checkouts under D:/UILOOP/r54-20261029. Prior selected53/c is read-only
baseline provenance; exact validated ten images can be reused after tree/hash checks.
Snapshot/branches/worktrees are NOT created yet. Use tmp/ui_round_prepare_helpers.py
to carry the latest53 safeguards forward; never overwrite them from stale52 templates.

Three fresh independent builders, one browser/GPU lease at a time (ports9541/2/3).
Code/art/static work may proceed while queued. Prepare all native board previews
and required checks before final clean-source10+title capture. Every comparison
row must retain actual source commit/hash; keep failed evidence in separate dirs.
Use the corrected native-stylesheet/effective-style/asset-load timing protocol;
never infer cost from screenshot-contaminated or ineffective CSS variants.

Then freeze40 images, two fresh image-only judges in opposite order, third only
on split, selected seven parent gates/static review and guarded integration.
Main HEAD99bdba9f42ec90ffe720b620b1082367b75c7fd1; index SHA256
6f75cb9060c5ed58cb981e6b487beb233e9a17128a9974379c659d651d389129.
No goal or automation active. User explicitly authorized the full wider loop.
'''

result_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
readme_path.write_text(readme, encoding='utf-8')
handoff_path.write_text(handoff, encoding='utf-8')
checkpoint_path.write_text(checkpoint, encoding='utf-8')
next_path.write_text(next_checkpoint, encoding='utf-8')
print('Round53 finalized:109 files verified; all7 gates pass; nextRound54')
