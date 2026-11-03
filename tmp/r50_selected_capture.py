from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
from PIL import Image

root = Path('D:/UILOOP/r50-20261029')
wt = root / 'b'
out = root / 'validated-GARNET'
out.mkdir(exist_ok=True)
results = []
for scene in ['rest', 'event', 'gameover', 'shop']:
    for suffix in ['', '-1280']:
        name = scene + suffix
        for ext in ['png', 'state.json', 'log']:
            shutil.copy2(root / 'judging/GARNET' / (name + '.' + ext), out / (name + '.' + ext))
        results.append({'screen': name, 'exit': 0, 'provenance': 'unchanged original GARNET image'})
for w, h in [(1600, 900), (1280, 800)]:
    name = 'combat-floaters' + ('-1280' if w == 1280 else '')
    args = [sys.executable, str(root / 'chrome.py'), 'tools/shot.py', 'GARNET-validated-' + name,
            '--port', '9502', '--scene', 'combat', '--seed', '7', '--companion', 'bones', '--kid', 'maya',
            '--w', str(w), '--h', str(h), '--wait', '8', '--warm-timeout', '150', '--encounter', 'foyer-boss',
            '--script', '@' + str(root / 'combat-capture.js'), '--steps', 'wait:0']
    with (out / (name + '.log')).open('w', encoding='utf-8') as log:
        run = subprocess.run(args, cwd=wt, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                             stdout=log, stderr=subprocess.STDOUT, timeout=600)
    for ext in ['png', 'state.json']:
        shutil.copy2(wt / 'shots' / ('GARNET-validated-' + name + '.' + ext), out / (name + '.' + ext))
    results.append({'screen': name, 'exit': run.returncode, 'provenance': 'selected lifecycle repair retake'})
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
        assert path.read_bytes() == (root / 'judging/GARNET' / path.name).read_bytes()
commit = subprocess.check_output(['git', '-C', str(wt), 'rev-parse', 'HEAD']).decode().strip()
data = {'round': 50, 'source_commit': commit, 'original_blind_images_preserved': True, 'captures': results}
(root / 'validated-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/VALIDATED-CAPTURES-r50.json').write_text(json.dumps(data, indent=2))
print('Validated10 selected-build images', commit, flush=True)
