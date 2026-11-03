from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
from PIL import Image

root = Path('D:/UILOOP/r51-20261029')
wt = root / 'b'

battery = json.loads((root / 'winner-battery/results.json').read_text(encoding='utf-8'))
assert len(battery) == 7 and all(r['exit'] == 0 for r in battery)
def git(*args):
    return subprocess.check_output(['git', '-C', str(wt), *args]).decode().strip()
assert not git('diff', '--name-only') and not git('diff', '--cached', '--name-only')
comparison = '4a8ec4c28a38a55b3f90b4973d8c5a0b829b09b9'
changed_game = set(git('diff', '--name-only', comparison, 'HEAD', '--', 'game/src', 'game/assets').splitlines())
assert changed_game <= {'game/src/fx/combatfx.js', 'game/src/scenes/combat.css'}, changed_game

out = root / 'validated-SPINEL'
out.mkdir(exist_ok=True)
results = []
for scene in ['rest', 'event', 'gameover', 'shop']:
    for suffix in ['', '-1280']:
        name = scene + suffix
        for ext in ['png', 'state.json', 'log']:
            shutil.copy2(root / 'judging/SPINEL' / (name + '.' + ext), out / (name + '.' + ext))
        results.append({'screen': name, 'exit': 0, 'provenance': 'unchanged original SPINEL image'})
for w, h in [(1600, 900), (1280, 800)]:
    name = 'combat-floaters' + ('-1280' if w == 1280 else '')
    args = [sys.executable, str(root / 'chrome.py'), 'tools/shot.py', 'SPINEL-validated-' + name,
            '--port', '9512', '--scene', 'combat', '--seed', '7', '--companion', 'bones', '--kid', 'maya',
            '--w', str(w), '--h', str(h), '--wait', '8', '--warm-timeout', '150', '--encounter', 'foyer-boss',
            '--script', '@' + str(root / 'combat-capture.js'), '--steps', 'wait:0']
    with (out / (name + '.log')).open('w', encoding='utf-8') as log:
        run = subprocess.run(args, cwd=wt, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                             stdout=log, stderr=subprocess.STDOUT, timeout=600)
    for ext in ['png', 'state.json']:
        shutil.copy2(wt / 'shots' / ('SPINEL-validated-' + name + '.' + ext), out / (name + '.' + ext))
    results.append({'screen': name, 'exit': run.returncode, 'provenance': 'selected text-envelope repair retake'})
    (out / 'capture-results.json').write_text(json.dumps(results, indent=2))
    print(name, run.returncode, flush=True)
    assert run.returncode == 0
for row in results:
    name = row['screen']
    path = out / (name + '.png')
    dimensions = (1280, 800) if name.endswith('-1280') else (1600, 900)
    with Image.open(path) as im:
        assert im.size == dimensions
    state = json.loads((out / (name + '.state.json')).read_text())
    assert not state['errors'] and not state['void'] and not state['perf']['software']
    row.update(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), dimensions=dimensions, perf=state['perf'])
    if row['provenance'].startswith('unchanged'):
        assert path.read_bytes() == (root / 'judging/SPINEL' / path.name).read_bytes()
commit = subprocess.check_output(['git', '-C', str(wt), 'rev-parse', 'HEAD']).decode().strip()
data = {'round': 51, 'source_commit': commit, 'original_blind_images_preserved': True, 'captures': results}
(root / 'validated-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/VALIDATED-CAPTURES-r51.json').write_text(json.dumps(data, indent=2))
print('Validated10 selected-build images', commit, flush=True)
