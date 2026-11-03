"""Snapshot validated working files through an alternate index; keep main untouched."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess

repo = Path.cwd()
prior = Path('D:/UILOOP/r49-20261029')
root = Path('D:/UILOOP/r50-20261029')
integration = json.loads((prior / 'integration.json').read_text())
assert integration['main_index_preserved']
for row in integration['files']:
    assert hashlib.sha256((repo / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
captures = json.loads((prior / 'validated-RUBY/capture-results.json').read_text())
assert len(captures) == 10 and all(x['exit'] == 0 for x in captures)
root.mkdir(exist_ok=False)

def git(*args, env=None):
    return subprocess.check_output(['git', '-C', str(repo), *args], env=env).decode().strip()

index = Path(git('rev-parse', '--git-path', 'index'))
if not index.is_absolute():
    index = repo / index
index_hash = hashlib.sha256(index.read_bytes()).hexdigest()
env = {**os.environ, 'GIT_INDEX_FILE': str(root / 'baseline.index')}
git('read-tree', 'HEAD', env=env)
git('add', '-u', env=env)
git('add', '--', *[row['path'] for row in integration['files']], env=env)
git('add', '--', 'game/src', 'game/assets', 'tests/ui-r49', 'tests/seams/check-regression.py',
    'tools/prep_r49_ruby.py', 'tools/owners_r49_ruby.py', 'docs/ui-pass/BRIEF-r50.md',
    'docs/ui-pass/RUBRIC-r50.md', 'docs/ui-pass/RESULTS-r49.json',
    'docs/ui-pass/ROUND-r49-2026-10-29.md', 'docs/ui-pass/CAPTURES-r49.json',
    'docs/ui-pass/judges-r49', env=env)
tree = git('write-tree', env=env)
parent = integration['winner_commit']
base = git('commit-tree', tree, '-p', parent, '-m', 'Round50 baseline after validated RUBY integration', env=env)
git('update-ref', 'refs/heads/codex/r50-current-baseline', base)
assert hashlib.sha256(index.read_bytes()).hexdigest() == index_hash
manifest = {'repo': str(repo), 'base': base, 'parent': parent, 'main_head': git('rev-parse', 'HEAD'),
            'baseline': 'AMBER', 'builders': {'a': 'SAPPHIRE', 'b': 'GARNET', 'c': 'PERIDOT'},
            'ports': {'baseline': 9500, 'a': 9501, 'b': 9502, 'c': 9503}, 'main_index_sha256': index_hash}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2))
for name in ['chrome.py', 'combat-capture.js']:
    shutil.copy2(prior / name, root / name)
(root / 'capture.py').write_text((prior / 'capture.py').read_text().replace('r49-20261029', 'r50-20261029'))
shutil.copytree(prior / 'validated-RUBY', root / 'judging/AMBER')
(root / 'baseline-provenance.txt').write_text('AMBER reuses the exact validated RUBY captures: six unchanged original images and four selected-repair retakes. Integration verifies every selected file byte-for-byte.\n')
work_env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'}
for slot in ['base', 'a', 'b', 'c']:
    args = ['git', '-C', str(repo), 'worktree', 'add']
    args += ['--detach', str(root / slot), base] if slot == 'base' else ['-b', 'codex/r50-' + slot, str(root / slot), base]
    subprocess.run(args, env=work_env, check=True, stdout=subprocess.DEVNULL)
    print('ready', slot, base, flush=True)
print(json.dumps(manifest), flush=True)
