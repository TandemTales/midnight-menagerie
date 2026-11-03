from pathlib import Path
import json
import os
import subprocess
import shutil

repo = Path.cwd()
root = Path('D:/UILOOP/r49-20261029')
root.mkdir(exist_ok=False)

def git(*args, env=None):
    return subprocess.check_output(['git', '-C', str(repo), *args], env=env).decode().strip()

env = {**os.environ, 'GIT_INDEX_FILE': str(root / 'baseline.index')}
git('read-tree', 'HEAD', env=env)
git('add', '-u', env=env)
git('add', '--', 'game/src', 'game/assets', 'tests/seams/check-regression.py',
    'docs/ui-pass/BRIEF-r49.md', 'docs/ui-pass/RUBRIC-r49.md',
    'docs/ui-pass/ROUND-r48-2026-10-29.md', 'docs/ui-pass/RESULTS-r48.json',
    'docs/ui-pass/CAPTURES-r48.json', 'docs/ui-pass/judges-r48', env=env)
tree = git('write-tree', env=env)
parent = git('rev-parse', '09e1986f')
base = git('commit-tree', tree, '-p', parent, '-m',
           'Round 49 isolated baseline after validated HELIODOR selection', env=env)
git('update-ref', 'refs/heads/codex/r49-current-baseline', base)
manifest = {'repo': str(repo), 'base': base, 'parent': parent,
            'main_head': git('rev-parse', 'HEAD'), 'baseline': 'CITRINE',
            'builders': {'a': 'LAPIS', 'b': 'RUBY', 'c': 'OPAL'},
            'ports': {'baseline': 9490, 'a': 9491, 'b': 9492, 'c': 9493}}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
for name in ['chrome.py', 'combat-capture.js']:
    shutil.copy2(Path('D:/UILOOP/r48-20261029') / name, root / name)
capture = Path('D:/UILOOP/r48-20261029/capture.py').read_text(encoding='utf-8')
(root / 'capture.py').write_text(capture.replace('r48-20261029', 'r49-20261029'), encoding='utf-8')
baseline = root / 'judging' / 'CITRINE'
baseline.mkdir(parents=True)
for p in Path('D:/UILOOP/r48-20261029/judging/HELIODOR').glob('*'):
    if p.is_file():
        shutil.copy2(p, baseline / p.name)
(root / 'baseline-provenance.txt').write_text(
    'CITRINE images are the exact validated HELIODOR source-current captures. '
    'The eight applied game files were verified byte-for-byte against that build. '
    'Only documentation and test repairs differ in this new snapshot.\n', encoding='utf-8')
work_env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'}
for slot in ['base', 'a', 'b', 'c']:
    args = ['git', '-C', str(repo), 'worktree', 'add']
    args += ['--detach', str(root / slot), base] if slot == 'base' else [
        '-b', 'codex/r49-' + slot, str(root / slot), base]
    subprocess.run(args, env=work_env, check=True, stdout=subprocess.DEVNULL)
    print('ready', slot, base, flush=True)
print(json.dumps(manifest), flush=True)
