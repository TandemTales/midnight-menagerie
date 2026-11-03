"""Validate and hash the frozen image sets before blind review."""
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image

root = Path('D:/UILOOP/r49-20261029')
slots = {'CITRINE': 'base', 'LAPIS': 'a', 'RUBY': 'b', 'OPAL': 'c'}
screens = ['rest', 'event', 'gameover', 'shop', 'combat-floaters']
manifest = {'round': 49, 'candidates': {}}
failures = []
for code, slot in slots.items():
    folder = root / 'judging' / code
    captures = json.loads((folder / 'capture-results.json').read_text(encoding='utf-8'))
    expected = {scene + suffix for scene in screens for suffix in ['', '-1280']}
    if code != 'CITRINE' and ({row['screen'] for row in captures} != expected or len(captures) != 10):
        failures.append(f'{code}: incomplete capture list')
    # Baseline's original batch log has six entries; its four later retakes
    # were validated and hashed separately. Verify that exact final manifest.
    inherited = None
    if code == 'CITRINE':
        prior = json.loads(Path('D:/UILOOP/r48-20261029/final-captures.json').read_text(encoding='utf-8'))['HELIODOR']
        inherited = {row['file']: row['sha256'] for row in prior['images']}
        if set(inherited) != {name + '.png' for name in expected}:
            failures.append('CITRINE: incomplete validated baseline manifest')
    if any(row['exit'] != 0 for row in captures):
        failures.append(f'{code}: capture runner failure')
    commit = subprocess.check_output(['git', '-C', str(root / slot), 'rev-parse', 'HEAD'], text=True).strip()
    rows = []
    for scene in screens:
        for suffix, size in [('', (1600, 900)), ('-1280', (1280, 800))]:
            name = scene + suffix
            png = folder / (name + '.png')
            if inherited is not None and hashlib.sha256(png.read_bytes()).hexdigest() != inherited.get(png.name):
                failures.append(f'{code}/{name}: differs from validated baseline image')
            statefile = folder / (name + '.state.json')
            state = json.loads(statefile.read_text(encoding='utf-8'))
            with Image.open(png) as im:
                if im.size != size:
                    failures.append(f'{code}/{name}: wrong image size {im.size}')
            if state.get('void') or state.get('errors'):
                failures.append(f'{code}/{name}: void or page errors')
            perf = state.get('perf', {})
            if perf.get('software'):
                failures.append(f'{code}/{name}: software renderer')
            rows.append({'screen': name, 'size': size, 'image': str(png),
                         'sha256': hashlib.sha256(png.read_bytes()).hexdigest(),
                         'state_sha256': hashlib.sha256(statefile.read_bytes()).hexdigest(),
                         'fps': perf.get('fps'), 'warm_ms': perf.get('warmMs'),
                         'void': state.get('void'), 'errors': state.get('errors')})
    manifest['candidates'][code] = {'commit': commit, 'captures': rows,
        'provenance': 'byte-identical validated Round48 final manifest; later retakes absent from original batch log' if inherited else 'complete ten-image batch plus documented targeted retakes'}
manifest['failures'] = failures
(root / 'final-captures.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'images': sum(len(v['captures']) for v in manifest['candidates'].values()), 'failures': failures}))
if failures:
    raise SystemExit(1)
