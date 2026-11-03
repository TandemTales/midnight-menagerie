"""Validate frozen canonical images without changing any candidate."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

root = Path('D:/UILOOP/r50-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
prior = json.loads(Path('D:/UILOOP/r49-20261029/validated-captures.json').read_text())
prior_hashes = {r['screen']: r['sha256'] for r in prior['captures']}
slots = {'base': manifest['baseline'], **manifest['builders']}
screens = {s + suffix for s in ['rest', 'event', 'gameover', 'shop', 'combat-floaters']
           for suffix in ['', '-1280']}
records = []
for slot, code in slots.items():
    folder = root / 'judging' / code
    rows = json.loads((folder / 'capture-results.json').read_text())
    assert len(rows) == 10 and {r['screen'] for r in rows} == screens, code
    assert all(r['exit'] == 0 for r in rows), code
    commit = subprocess.check_output(['git', '-C', str(root / slot), 'rev-parse', 'HEAD']).decode().strip()
    dirty = subprocess.check_output(['git', '-C', str(root / slot), 'diff', '--name-only', '--', 'game/src', 'game/assets'])
    staged = subprocess.check_output(['git', '-C', str(root / slot), 'diff', '--cached', '--name-only', '--', 'game/src', 'game/assets'])
    untracked = subprocess.check_output(['git', '-C', str(root / slot), 'ls-files', '--others', '--exclude-standard', '--', 'game/src', 'game/assets'])
    assert not dirty and not staged and not untracked, (code, 'Uncommitted game changes')
    for row in rows:
        name = row['screen']
        image = folder / (name + '.png')
        expected = (1280, 800) if name.endswith('-1280') else (1600, 900)
        with Image.open(image) as im:
            assert im.size == expected, (code, name, im.size)
        state = json.loads((folder / (name + '.state.json')).read_text())
        assert not state['errors'] and not state['void'] and not state['perf']['software'], (code, name)
        assert state['perf']['gl'], (code, name, 'No renderer metadata')
        digest = hashlib.sha256(image.read_bytes()).hexdigest()
        if slot == 'base':
            assert digest == prior_hashes[name], (code, name, 'Baseline provenance mismatch')
        records.append({'code': code, 'screen': name, 'dimensions': expected, 'sha256': digest,
                        'commit': commit, 'perf': state['perf']})
data = {'round': 50, 'base': manifest['base'], 'validated_images': len(records),
        'baseline_provenance': 'Exact validated Round49 images; all ten hashes match', 'captures': records}
(root / 'final-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/CAPTURES-r50.json').write_text(json.dumps(data, indent=2))
print('Validated', len(records), 'images; all exits/errors/void/renderer/dimensions/provenance checks pass')
