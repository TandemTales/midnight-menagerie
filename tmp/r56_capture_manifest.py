"""Validate frozen canonical images without changing any candidate."""
from pathlib import Path
import hashlib
import json
import subprocess
from urllib.parse import parse_qs, urlparse
from PIL import Image

root = Path('D:/UILOOP/r56-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
prior = json.loads(Path('D:/UILOOP/r55-20261029/validated-captures.json').read_text())
prior_hashes = {r['screen']: r['sha256'] for r in prior['captures']}
prior_rows = {r['screen']: r for r in prior['captures']}
prior_results = json.loads(Path(f"docs/ui-pass/RESULTS-r{prior['round']}.json").read_text())
slots = {'base': manifest['baseline'], **manifest['builders']}
screens = {s + suffix for s in ['rest', 'event', 'gameover', 'shop', 'combat-floaters']
           for suffix in ['', '-1280']}
records = []
for slot, code in slots.items():
    wt = Path(manifest['baseline_worktree']) if slot == 'base' and 'baseline_worktree' in manifest else root / slot
    folder = root / 'judging' / code
    rows = json.loads((folder / 'capture-results.json').read_text())
    assert len(rows) == 10 and {r['screen'] for r in rows} == screens, code
    assert all(r['exit'] == 0 for r in rows), code
    commit = subprocess.check_output(['git', '-C', str(wt), 'rev-parse', 'HEAD']).decode().strip()
    dirty = subprocess.check_output(['git', '-C', str(wt), 'diff', '--name-only', '--', 'game/src', 'game/assets'])
    staged = subprocess.check_output(['git', '-C', str(wt), 'diff', '--cached', '--name-only', '--', 'game/src', 'game/assets'])
    untracked = subprocess.check_output(['git', '-C', str(wt), 'ls-files', '--others', '--exclude-standard', '--', 'game/src', 'game/assets'])
    assert not dirty and not staged and not untracked, (code, 'Uncommitted game changes')
    for row in rows:
        name = row['screen']
        image = folder / (name + '.png')
        expected = (1280, 800) if name.endswith('-1280') else (1600, 900)
        with Image.open(image) as im:
            assert im.size == expected, (code, name, im.size)
        state = json.loads((folder / (name + '.state.json')).read_text())
        rendered = json.loads(state['state']) if isinstance(state['state'], str) else state['state']
        expected_scene = 'combat' if name.startswith('combat-floaters') else name.removesuffix('-1280')
        assert rendered['scene'] == expected_scene, (code, name, rendered)
        params = parse_qs(urlparse(state['url']).fragment)
        assert params.get('seed') == ['7'] and params.get('kid') == ['maya'] and params.get('companion') == ['bones'], (code, name, 'Wrong fixture')
        if expected_scene in {'rest', 'event', 'gameover'}:
            assert params.get('pics') == ['1'], (code, name, 'Missing canonical picture fixture')
        assert not state['errors'] and not state['void'] and not state['perf']['software'], (code, name)
        assert state['perf']['gl'], (code, name, 'No renderer metadata')
        digest = hashlib.sha256(image.read_bytes()).hexdigest()
        if slot == 'base':
            assert digest == prior_hashes[name], (code, name, 'Baseline provenance mismatch')
            visual_commit = (prior_rows[name].get('visual_source_commit')
                             or prior_results.get('comparison_source') or prior['source_commit'])
        else:
            visual_commit = row['visual_source_commit']
            assert len(visual_commit) == 40 and digest == row['sha256'], (code, name, 'Capture provenance mismatch')
        visual_diff = subprocess.check_output(['git', '-C', str(wt), 'diff', '--name-only',
                                              visual_commit, commit, '--', 'game/src', 'game/assets'])
        assert not visual_diff, (code, name, 'Game changed since recorded capture source')
        records.append({'code': code, 'screen': name, 'dimensions': expected, 'sha256': digest,
                        'commit': commit, 'visual_source_commit': visual_commit, 'perf': state['perf']})
data = {'round': 56, 'base': manifest['base'], 'validated_images': len(records),
        'baseline_provenance': 'Exact validated Round55 images; all ten hashes match', 'captures': records}
(root / 'final-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/CAPTURES-r56.json').write_text(json.dumps(data, indent=2))
print('Validated', len(records), 'images; all exits/errors/void/renderer/dimensions/provenance checks pass')
