from pathlib import Path
from collections import Counter
import json

root = Path('D:/UILOOP/r56-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
judges = [json.loads(Path(f'docs/ui-pass/judges-r56/judge{i}-final.json').read_text(encoding='utf-8-sig')) for i in (1, 2)]
codes = {manifest['baseline'], *manifest['builders'].values()}
screens = {'rest', 'event', 'gameover', 'shop', 'combat-floaters'}
dimensions = {'ornament', 'palette', 'typography', 'material', 'background', 'composition', 'readability', 'coherence'}
if judges[0]['winner'] != judges[1]['winner']:
    judges.append(json.loads(Path('docs/ui-pass/judges-r56/judge3-final.json').read_text(encoding='utf-8-sig')))
for d in judges:
    assert d['inspected']['references'] == 4 and d['inspected']['captures'] == 40 and d['inspected']['references_first']
    assert d['inspected']['capture_order'] == [s + suffix for s in ['rest', 'event', 'gameover', 'shop', 'combat-floaters'] for suffix in ['', '-1280']]
    assert set(d['candidates']) == codes and set(d['ranking']) == screens
    assert d['winner'] in codes
    assert isinstance(d.get('method'), str) and d['method'].strip()
    assert 5 <= len(d['winner_fixes']) <= 10
    assert isinstance(d['grafts'], list)
    for g in d['grafts']:
        assert g['from'] in codes and g['screen'] in screens and g['idea']
    expected_order=json.loads(Path(f"docs/ui-pass/judges-r56/judge{d['judge']}-input.json").read_text())['order']
    assert d['inspected']['order']==expected_order
    for c in d['candidates'].values():
        assert set(c['screens']) == screens and 0 <= c['system_overall'] <= 10
        for s in c['screens'].values():
            assert set(s['dimensions']) == dimensions and all(0 <= v <= 10 for v in s['dimensions'].values())
            assert 0 <= s['overall'] <= 10 and isinstance(s['fits_between_samples'], bool)
            assert s['worst_problem'] and set(s['size_notes']) == {'1600x900','1280x800'}
            assert all(isinstance(v,str) and v.strip() for v in s['size_notes'].values())
            assert not s['fits_between_samples'] or s['dimensions']['coherence'] >= 9, 'Reference-fit requires coherence >= 9 per rubric'
    for rank in d['ranking'].values():
        assert len(rank) == 4 and set(rank) == codes
assert judges[0]['inspected']['order'] == judges[1]['inspected']['order'][::-1]
winner, votes = Counter(d['winner'] for d in judges).most_common(1)[0]
selection = 'independent blind image-only votes'
if votes < 2:
    assert len(judges) == 3
    winner = judges[-1]['winner']
    selection = 'third independent blind tie-break decision after three distinct choices'
fit = all(s['overall'] >= 9 and s['fits_between_samples'] for d in judges for s in d['candidates'][winner]['screens'].values())
data = dict(round=56, status='selected; parent validation pending', winner=winner,
    votes=[d['winner'] for d in judges], selection=selection,
    system_scores_descriptive_only={f'judge{d["judge"]}': {k:v['system_overall'] for k,v in d['candidates'].items()} for d in judges},
    base=manifest['base'], comparison_captures='CAPTURES-r56.json',
    all_fit_thresholds_met=fit, applied_to_main=False, main_committed_or_pushed=False,
    evidence_root=str(root))
Path('docs/ui-pass/RESULTS-r56.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
print(winner, 'votes', votes, 'all-fit', fit)
