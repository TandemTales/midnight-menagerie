from pathlib import Path
from collections import Counter
import json

root = Path('D:/UILOOP/r53-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
judges = [json.loads(Path(f'docs/ui-pass/judges-r53/judge{i}-final.json').read_text(encoding='utf-8-sig')) for i in (1, 2)]
codes = {manifest['baseline'], *manifest['builders'].values()}
screens = {'rest', 'event', 'gameover', 'shop', 'combat-floaters'}
dimensions = {'ornament', 'palette', 'typography', 'material', 'background', 'composition', 'readability', 'coherence'}
if judges[0]['winner'] != judges[1]['winner']:
    judges.append(json.loads(Path('docs/ui-pass/judges-r53/judge3-final.json').read_text(encoding='utf-8-sig')))
for d in judges:
    assert d['inspected']['references'] == 4 and d['inspected']['captures'] == 40 and d['inspected']['references_first']
    assert set(d['candidates']) == codes and set(d['ranking']) == screens
    assert d['winner'] in codes
    for c in d['candidates'].values():
        assert set(c['screens']) == screens and 0 <= c['system_overall'] <= 10
        for s in c['screens'].values():
            assert set(s['dimensions']) == dimensions and all(0 <= v <= 10 for v in s['dimensions'].values())
            assert 0 <= s['overall'] <= 10 and isinstance(s['fits_between_samples'], bool)
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
data = dict(round=53, status='selected; parent validation pending', winner=winner,
    votes=[d['winner'] for d in judges], selection=selection,
    system_scores_descriptive_only={f'judge{d["judge"]}': {k:v['system_overall'] for k,v in d['candidates'].items()} for d in judges},
    base=manifest['base'], comparison_captures='CAPTURES-r53.json',
    all_fit_thresholds_met=fit, applied_to_main=False, main_committed_or_pushed=False,
    evidence_root=str(root))
Path('docs/ui-pass/RESULTS-r53.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
print(winner, 'votes', votes, 'all-fit', fit)
