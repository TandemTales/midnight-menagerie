from pathlib import Path
import json

root = Path('D:/UILOOP/r51-20261029')
integration = json.loads((root / 'integration.json').read_text())
battery = json.loads((root / 'winner-battery/results.json').read_text())
assert len(battery) == 7 and all(x['exit'] == 0 for x in battery)
p = Path('docs/ui-pass/RESULTS-r51.json')
d = json.loads(p.read_text())
d.update(status='complete; selected build repaired, validated and applied as working changes',
         selected_repair_commit=integration['winner_commit'], validated_captures='VALIDATED-CAPTURES-r51.json',
         applied_to_main=True, applied_files_byte_verified=len(integration['files']),
         main_index_preserved=integration['main_index_preserved'], browser_gates=battery,
         static_checks=dict(scene_css_conflicts=0, undefined_css_tokens=0, seam_sites=9110,
                            unchanged_local_Map_false_positives=4, syntax='pass', endings='pass'),
         next_brief='BRIEF-r52.md')
d['required_repair'].update(status='complete', selected_maximum_outside_pixels=0,
    selected_type_size_cases_pass=10, full_animation_cases=16, full_label_lifetimes=96,
    animated_frames_checked=4167, ordinary_crowded_drain_seconds=5.1661,
    layout_p95_ms=1.6, layout_max_ms=2.6, idle_recovery_seconds=.138,
    pending_and_visible_owner_teardown='pass', fonts_and_lifetimes_preserved=True)
p.write_text(json.dumps(d, indent=2), encoding='utf-8')
p = Path('docs/ui-pass/README.md')
s = p.read_text(encoding='utf-8')
start = s.index('**Current,')
end = s.index('Round50 is complete', start)
s = s[:start] + '''**Current, 2026-10-29:** Round51 SPINEL is complete and applied as working
changes. Both blind reviewers chose it (8.25/8.0). The selected animated-text
repair and all seven browser gates pass; applied files match the tested build,
with main's index preserved and no main commit/push. Original comparison images
are immutable; the two repaired combat views were separately retaken.
See [results](RESULTS-r51.json), [validated captures](VALIDATED-CAPTURES-r51.json)
and the [Round52 brief](BRIEF-r52.md). Continue the full loop; stop at3% remaining.

''' + s[end:]
p.write_text(s, encoding='utf-8')
p = Path('HANDOFF-PROMPT.md')
s = p.read_text(encoding='utf-8')
start = s.index('**Latest checkpoint,')
end = s.index('You are picking up', start)
s = s[:start] + '''**Latest checkpoint, 2026-10-29:** Round51 SPINEL is applied as working
changes. Both blind judges selected it; the animated text-envelope repair and
all seven browser gates pass. Main source/index are preserved with no main
commit or push. Selected commit01d122f3 lives in its isolated worktree.
Continue Round52's full three-build/two-blind-review loop, stopping at3% remaining.
Read `docs/ui-pass/ROUND-r52-2026-10-29.md`, `RESULTS-r51.json` and `BRIEF-r52.md`.
The historical pushed/merged statements below do not describe these latest
uncommitted working changes.

''' + s[end:]
p.write_text(s, encoding='utf-8')
p = Path('docs/ui-pass/ROUND-r51-2026-10-29.md')
s = p.read_text(encoding='utf-8')
p.write_text('''# Round51 complete — validated SPINEL applied

This completion record supersedes the historical progress notes below.
Both fresh blind judges chose SPINEL (8.25/8.0); reference-fit9 remains unmet.
Selected repair commit01d122f3fd08e1ce3b3513b485a31de38cfe9521 applied as working
changes, all files byte-verified and main index preserved. No main commit/push.
All seven parent browser gates pass. CSS/syntax/endings pass; seam audit9110
sites has only the four unchanged local-Map false positives.

The real DOM+text Range ribbon envelope is now measured with asymmetric center
offset and full maximum scale. Only empty padding shrank; fonts/lifetimes remain.
Parent independently verified96 complete lifetimes across16 cases/4167 frames,
zero failures/queue residue, six simultaneous boss labels and all10 focused
ink cases at0px overflow. Ordinary crowd max5.1661s; repeat9.3474/4.8429s;
layout p95/max1.6/2.6ms; idle138ms; pending/visible owner teardown pass.
Earlier failed and6.202s diagnostic proofs are retained. Original blind images
remain immutable; eight board images retained exact hashes and two combat images
were separately retaken/inspected in validated-SPINEL. See RESULTS-r51.json and
VALIDATED-CAPTURES-r51.json. Continue at ROUND-r52-2026-10-29.md.

## Historical progress (superseded above)

''' + s, encoding='utf-8')
print('Recorded completed Round51 and Round52 handoff')
