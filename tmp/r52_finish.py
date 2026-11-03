from pathlib import Path
import json
import subprocess

root=Path('D:/UILOOP/r52-20261029')
integration=json.loads((root/'integration.json').read_text())
battery=json.loads((root/'winner-battery/results.json').read_text())
assert len(battery)==7 and all(r['exit']==0 for r in battery)
p=Path('docs/ui-pass/RESULTS-r52.json');d=json.loads(p.read_text())
d.update(status='complete; unanimously selected build validated and applied as working changes',
    selected_commit=integration['winner_commit'],
    comparison_source=subprocess.check_output(['git','-C',str(root/'c'),'rev-parse','e58a947f']).decode().strip(),
    validated_captures='VALIDATED-CAPTURES-r52.json', applied_to_main=True,
    applied_files_byte_verified=len(integration['files']),main_index_preserved=True,
    browser_gates=battery, selected_post_review_repair_required=False,
    static_checks=dict(scene_css_conflicts=0,undefined_css_tokens=0,seam_sites=9110,
        unchanged_local_Map_false_positives=4,syntax='pass',endings='pass'),
    combat_proofs=dict(cases=16,full_lifetimes=96,frames=5477,ink_cases=10,max_ink_overflow_px=0,
        ordinary_crowded_max_seconds=5.158,repeats_seconds=[9.3565,4.8227],layout_p95_ms=1.8,layout_max_ms=4.0,
        frame_p95_range_ms=[13.6,38.1],frame_max_ms=97.5,idle_and_owner_teardown='pass'),
    next_brief='BRIEF-r53.md')
p.write_text(json.dumps(d,indent=2),encoding='utf-8')
p=Path('docs/ui-pass/README.md');s=p.read_text(encoding='utf-8');start=s.index('**Current,');end=s.index('Round50 is complete',start)
s=s[:start]+'''**Current, 2026-10-29:** Round52 TOURMALINE is complete and applied as working
changes. Both fresh blind reviewers chose it (8.2/8.2). All seven parent browser
gates pass; all46 applied files match the tested build and main's index is preserved.
No main commit/push. See [results](RESULTS-r52.json), [validated images](VALIDATED-CAPTURES-r52.json)
and the [Round53 brief](BRIEF-r53.md). Continue the full loop; stop at3% remaining.

Round51 SPINEL is complete and applied. Both reviewers chose it (8.25/8.0).
Its animated-text repair and seven browser gates passed; all52 files were byte-
verified with main index preserved. Original comparison images remain immutable.
See [results](RESULTS-r51.json) and [validated captures](VALIDATED-CAPTURES-r51.json).

'''+s[end:];p.write_text(s,encoding='utf-8')
p=Path('HANDOFF-PROMPT.md');s=p.read_text(encoding='utf-8');start=s.index('**Latest checkpoint,');end=s.index('You are picking up',start)
s=s[:start]+'''**Latest checkpoint, 2026-10-29:** Round52 TOURMALINE is applied as working
changes. Both fresh blind judges selected it; all seven parent browser gates pass.
All46 files byte-verified, main index preserved, no main commit/push. Selected
commit489d9ef007e6bbb91528212c257a25bf1a9f6e4a lives in its isolated worktree.
Continue Round53's full three-build/two-blind-review loop; stop at3% remaining.
Read `docs/ui-pass/ROUND-r53-2026-10-29.md`, `RESULTS-r52.json` and `BRIEF-r53.md`.
Historical pushed/merged statements below do not describe these current working changes.

'''+s[end:];p.write_text(s,encoding='utf-8')
p=Path('docs/ui-pass/ROUND-r52-2026-10-29.md');s=p.read_text(encoding='utf-8')
p.write_text('''# Round52 complete — TOURMALINE applied

This completion record supersedes the progress notes below. Both fresh blind
judges chose TOURMALINE at8.2; all-fit9 remains false. Final selected source/evidence
489d9ef007e6bbb91528212c257a25bf1a9f6e4a applied as working changes, all46 files
byte-verified and main index preserved. No main commit/push. All seven parent
browser gates and CSS/token/syntax/endings checks pass. Seam audit9110 sites has
only4 known floorplan Map reports. No post-review repair was needed; all ten
validated images retain exact original comparison hashes. Selected parent server
40828/9523 stopped after identity verification. All builder servers also stopped.

Continue at ROUND-r53-2026-10-29.md and BRIEF-r53.md. Next priorities: visibly
painted heading faces, genuinely crisp condition rendering, proportionate modular
rails, fitted badges and worn deck rows. Actual inherited interaction title check
forces solid fill/no filter; next brief permits replacing only that style-specific
assertion with meaningful text/size/visibility checks while preserving all functional
and geometry assertions. No speculative rasterization cause has been claimed.

## Historical Round52 progress (superseded above)

'''+s,encoding='utf-8')
print('Round52 finalized;46 files and main index verified; next Round53')
