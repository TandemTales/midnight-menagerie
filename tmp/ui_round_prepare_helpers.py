"""Carry the latest verified helper safeguards into a new round without overwriting."""
import re
import sys
from pathlib import Path

number = int(sys.argv[1])
codes = sys.argv[2:]
assert number > 53 and len(codes) == 4 and len(set(codes)) == 4
assert all(re.fullmatch('[A-Z]+', c) for c in codes)
previous = number - 1
root = Path('tmp')
names = ['capture_manifest', 'prepare_judges', 'record_selection', 'validate_selected', 'integrate']
outputs = {}
for name in names:
    source = root / f'r{previous}_{name}.py'
    dest = root / f'r{number}_{name}.py'
    assert source.is_file() and not dest.exists(), (source, dest)
    s = source.read_text()
    s = s.replace(f'r{previous}', f'r{number}').replace(f'Round{previous}', f'Round{number}')
    s = s.replace(f"'round': {previous}", f"'round': {number}").replace(f'round={previous}', f'round={number}')
    if name == 'capture_manifest':
        s = s.replace(f'r{previous - 1}-20261029', f'r{previous}-20261029')
        s = s.replace(f'Round{previous - 1}', f'Round{previous}')
    if name == 'prepare_judges':
        s, count = re.subn(r'^codes = .*$', 'codes = ' + repr(codes), s, flags=re.MULTILINE)
        assert count == 1
    compile(s, str(dest), 'exec')
    outputs[dest] = s
for dest, source in outputs.items():
    dest.write_text(source)
print(f'Prepared Round{number} helpers from Round{previous}; prior files untouched')
