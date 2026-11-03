from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path('D:/UILOOP/r49-20261029')
folder = root / 'validated-RUBY'
rows = json.loads((folder / 'capture-results.json').read_text())
assert len(rows) == 10 and all(r['exit'] == 0 for r in rows)
for row in rows:
    name = row['screen']
    path = folder / (name + '.png')
    expected = (1280, 800) if name.endswith('-1280') else (1600, 900)
    with Image.open(path) as im:
        assert im.size == expected, (name, im.size)
    state = json.loads((folder / (name + '.state.json')).read_text())
    assert not state['errors'] and not state['void'] and not state['perf']['software'], (name, state)
    row.update(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), perf=state['perf'], dimensions=expected)
    if row['provenance'].startswith('unchanged'):
        assert path.read_bytes() == (root / 'judging/RUBY' / path.name).read_bytes()
data = {'round': 49, 'source_commit': '177c3aafb1540418bfb2aa10779eeee175bf5dfc',
        'original_blind_images_preserved': True, 'root_inspected_repaired_pairs': True, 'captures': rows}
(root / 'validated-captures.json').write_text(json.dumps(data, indent=2))
Path('docs/ui-pass/VALIDATED-CAPTURES-r49.json').write_text(json.dumps(data, indent=2))
print(json.dumps({'validated': len(rows), 'fps': {r['screen']: r['perf']['fps'] for r in rows}}))
