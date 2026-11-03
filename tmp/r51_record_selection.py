from pathlib import Path
import json

judges = [json.loads(Path(f'docs/ui-pass/judges-r51/judge{i}-final.json').read_text(encoding='utf-8-sig')) for i in (1, 2)]
codes = {'OBSIDIAN', 'MOONSTONE', 'SPINEL', 'ZIRCON'}
screens = {'rest', 'event', 'gameover', 'shop', 'combat-floaters'}
dimensions = {'ornament', 'palette', 'typography', 'material', 'background', 'composition', 'readability', 'coherence'}
for d in judges:
    assert d['inspected']['references'] == 4 and d['inspected']['captures'] == 40 and d['inspected']['references_first']
    assert set(d['candidates']) == codes and set(d['ranking']) == screens
    for c in d['candidates'].values():
        assert set(c['screens']) == screens and 0 <= c['system_overall'] <= 10
        for s in c['screens'].values():
            assert set(s['dimensions']) == dimensions and all(0 <= v <= 10 for v in s['dimensions'].values())
            assert 0 <= s['overall'] <= 10 and isinstance(s['fits_between_samples'], bool)
    for rank in d['ranking'].values():
        assert len(rank) == 4 and set(rank) == codes
assert judges[0]['inspected']['order'] == judges[1]['inspected']['order'][::-1]
assert [d['winner'] for d in judges] == ['SPINEL', 'SPINEL']
fit = all(s['overall'] >= 9 and s['fits_between_samples'] for d in judges for s in d['candidates']['SPINEL']['screens'].values())
data = {
    'round': 51,
    'status': 'selected unanimously; required ribbon text-envelope repair and parent regression validation pending',
    'winner': 'SPINEL', 'votes': ['SPINEL', 'SPINEL'],
    'selection': 'two independent blind image-only reviews; no third judge required',
    'system_scores_descriptive_only': {f'judge{d["judge"]}': {k: v['system_overall'] for k, v in d['candidates'].items()} for d in judges},
    'base': 'c483cbb33fe2b458d0e0cd5e43443dfb6a198e29',
    'comparison_source': '501ebb999a1015d2c3435169baae75ec0d36c4f9',
    'comparison_notes_commit': '4a8ec4c28a38a55b3f90b4973d8c5a0b829b09b9',
    'comparison_captures': 'CAPTURES-r51.json',
    'all_fit_thresholds_met': fit, 'applied_to_main': False, 'main_committed_or_pushed': False,
    'required_repair': {
        'problem': 'During pop/fade, buff/debuff/blocked text Range can exceed the reserved DOM ribbon envelope',
        'maximum_observed_outside_pixels': 1.7307205200195312,
        'assertion_tolerance_pixels': 1,
        'failing_type_size_cases': 6, 'total_type_size_cases': 10,
        'evidence': 'D:/UILOOP/r51-20261029/ink-spinel/proof.json',
        'status': 'selected builder repairing measurement and placement without shrinking text or lifetimes'
    },
    'evidence_root': 'D:/UILOOP/r51-20261029'
}
Path('docs/ui-pass/RESULTS-r51.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
print('Validated both complete blind reviews; SPINEL selected; all-fit threshold:', fit)
