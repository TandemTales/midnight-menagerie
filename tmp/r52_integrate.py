"""Apply the validated Round52 winner while preserving main's existing files and index."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

repo = Path.cwd()
root = Path('D:/UILOOP/r52-20261029')
winner = root / sys.argv[1]
code = sys.argv[2]
slug = code.lower()
base = json.loads((root / 'manifest.json').read_text())['base']

def git(where, *args):
    return subprocess.check_output(['git', '-C', str(where), *args])

head = git(winner, 'rev-parse', 'HEAD').decode().strip()
captures = json.loads((root / 'validated-captures.json').read_text())
assert captures['source_commit'] == head and len(captures['captures']) == 10
assert not git(winner, 'diff', '--name-only')
assert not git(winner, 'diff', '--cached', '--name-only')
battery = json.loads((root / 'winner-battery/results.json').read_text())
assert len(battery) == 7 and all(x['exit'] == 0 for x in battery)
paths = git(winner, 'diff', '--name-only', base, head).decode().splitlines()
allowed = ('game/src/', f'game/assets/ui/r52-{slug}/', f'docs/ui-pass/{code}-r52-',
           f'tools/prep_r52_{slug}.py', f'tests/ui-r52-{slug}/', 'tests/ui-r50/', 'tests/ui-r51-spinel/')
assert all(p.startswith(allowed) for p in paths), paths
for p in paths:
    old = subprocess.run(['git', '-C', str(repo), 'rev-parse', '--verify', f'{base}:{p}'], capture_output=True)
    dest = repo / p
    if old.returncode == 0:
        assert dest.is_file(), f'Missing existing source: {p}'
        assert git(repo, 'hash-object', '--path', p, p).strip() == old.stdout.strip(), f'Main changed since snapshot: {p}'
    else:
        assert not dest.exists(), f'New path already exists: {p}'
index = Path(git(repo, 'rev-parse', '--git-path', 'index').decode().strip())
if not index.is_absolute():
    index = repo / index
before = hashlib.sha256(index.read_bytes()).hexdigest()
patch = root / 'selected.patch'
patch.write_bytes(git(winner, 'diff', '--binary', base, head))
if paths:
    subprocess.run(['git', '-C', str(repo), 'apply', '--check', '--whitespace=nowarn', str(patch)], check=True)
    subprocess.run(['git', '-C', str(repo), 'apply', '--whitespace=nowarn', str(patch)], check=True)
assert hashlib.sha256(index.read_bytes()).hexdigest() == before, 'Main index changed'
verified = []
for p in paths:
    assert (repo / p).read_bytes() == (winner / p).read_bytes(), f'Byte mismatch: {p}'
    verified.append({'path': p, 'sha256': hashlib.sha256((repo / p).read_bytes()).hexdigest()})
result = {'base': base, 'winner_commit': head, 'main_index_sha256': before, 'main_index_preserved': True, 'files': verified}
(root / 'integration.json').write_text(json.dumps(result, indent=2))
print(json.dumps({'winner': head, 'files': len(paths), 'index_preserved': True}))
