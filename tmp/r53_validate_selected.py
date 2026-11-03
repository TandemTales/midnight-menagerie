"""Preserve final selected images when tested game source is unchanged."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
from PIL import Image

root = Path('D:/UILOOP/r53-20261029')
slot, code = sys.argv[1:3]
setup = json.loads((root / 'manifest.json').read_text())
wt = Path(setup['baseline_worktree']) if slot == 'base' else root / slot
assert code == (setup['baseline'] if slot == 'base' else setup['builders'][slot])
def git(*args):
    return subprocess.check_output(['git', '-C', str(wt), *args]).decode().strip()
head = git('rev-parse', 'HEAD')
assert not git('diff', '--name-only') and not git('diff', '--cached', '--name-only')
battery = json.loads((root / 'winner-battery/results.json').read_text())
assert len(battery) == 7 and all(r['exit'] == 0 for r in battery)
manifest = json.loads((root / 'final-captures.json').read_text())
rows = [r for r in manifest['captures'] if r['code'] == code]
assert len(rows) == 10
assert all(not git('diff', '--name-only', r['commit'], head, '--', 'game/src', 'game/assets') for r in rows), 'Game changed: affected scenes need retakes'
out = root / ('validated-' + code)
out.mkdir(exist_ok=False)
results = []
for row in rows:
    name = row['screen']
    source = root / 'judging' / code
    for ext in ['png', 'state.json', 'log']:
        shutil.copy2(source / (name + '.' + ext), out / (name + '.' + ext))
    path = out / (name + '.png')
    dimensions = (1280, 800) if name.endswith('-1280') else (1600, 900)
    with Image.open(path) as im:
        assert im.size == dimensions
    state = json.loads((out / (name + '.state.json')).read_text())
    assert not state['errors'] and not state['void'] and not state['perf']['software'] and state['perf']['gl']
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == row['sha256']
    results.append({'screen': name, 'exit': 0, 'provenance': 'Unchanged frozen comparison source; exact original image',
                    'sha256': digest, 'dimensions': dimensions, 'perf': state['perf'],
                    'visual_source_commit': row['visual_source_commit'], 'comparison_evidence_commit': row['commit']})
(out / 'capture-results.json').write_text(json.dumps(results, indent=2))
data = {'round': 53, 'winner': code, 'source_commit': head, 'original_blind_images_preserved': True, 'captures': results}
(root / 'validated-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/VALIDATED-CAPTURES-r53.json').write_text(json.dumps(data, indent=2))
print('Validated ten selected images with unchanged game source', code, head)
