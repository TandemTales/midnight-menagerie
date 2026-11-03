"""Read-only independent verification of the inherited full animation evidence."""
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
d = json.loads((p / 'queue/proof.json').read_text())
assert not d['errors'] and len(d['results']) == 16
count = frames = 0
for r in d['results']:
    assert not r['failures'] and r['queued'] == 0
    assert len(r['starts']) == len(r['delivered']) == len(r['expired']) == 6
    assert len(set(x['serial'] for x in r['starts'])) == 6
    assert all(x['elapsed'] >= x['duration'] for x in r['expired'])
    assert r['kind'] != 'boss' or r['peak'] == 6
    count += len(r['expired'])
    frames += r['frames']
ink = json.loads((p / 'ink/proof.json').read_text())
assert not ink['errors'] and len(ink['rows']) == 10
assert all(x['maxOutside'] == 0 and not x['failures'] and x['drained'] for x in ink['rows'])
print(json.dumps(dict(labels=count, frames=frames, ink_cases=10, all_pass=True)))
