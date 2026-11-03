"""Create independent Round52 checkouts from validated working files."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess

repo = Path.cwd()
prior = Path('D:/UILOOP/r51-20261029')
root = Path('D:/UILOOP/r52-20261029')
integration = json.loads((prior / 'integration.json').read_text())
assert integration['main_index_preserved']
for row in integration['files']:
    assert hashlib.sha256((repo / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
captures = json.loads((prior / 'validated-SPINEL/capture-results.json').read_text())
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
applied = set(row['path'] for row in integration['files'])
for older in [49, 50]:
    earlier = json.loads(Path(f'D:/UILOOP/r{older}-20261029/integration.json').read_text())
    applied.update(row['path'] for row in earlier['files'])
git('add', '--', *sorted(applied), env=env)
git('add', '--', 'game/src', 'game/assets', 'tests/seams/check-regression.py', env=env)
docs = []
for round_ in [48, 49, 50, 51, 52]:
    for stem in ['BRIEF', 'RUBRIC', 'RESULTS', 'CAPTURES', 'VALIDATED-CAPTURES']:
        ext = 'md' if stem in ['BRIEF', 'RUBRIC'] else 'json'
        path = Path(f'docs/ui-pass/{stem}-r{round_}.{ext}')
        if path.exists():
            docs.append(str(path))
    docs += [str(p) for p in Path('docs/ui-pass').glob(f'ROUND-r{round_}-*.md')]
    judges = Path(f'docs/ui-pass/judges-r{round_}')
    if judges.exists():
        docs.append(str(judges))
git('add', '--', *docs, env=env)
tree = git('write-tree', env=env)
parent = integration['winner_commit']
base = git('commit-tree', tree, '-p', parent, '-m', 'Round52 baseline after validated SPINEL integration', env=env)
git('update-ref', 'refs/heads/codex/r52-current-baseline', base)
assert hashlib.sha256(index.read_bytes()).hexdigest() == index_hash
manifest = {'repo': str(repo), 'base': base, 'parent': parent, 'main_head': git('rev-parse', 'HEAD'),
            'baseline': 'ONYX', 'builders': {'a': 'ALEXANDRITE', 'b': 'IOLITE', 'c': 'TOURMALINE'},
            'ports': {'baseline': 9520, 'a': 9521, 'b': 9522, 'c': 9523}, 'main_index_sha256': index_hash}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2))
for name in ['chrome.py', 'combat-capture.js']:
    shutil.copy2(prior / name, root / name)
(root / 'capture.py').write_text((prior / 'capture.py').read_text().replace('r51-20261029', 'r52-20261029'))
shutil.copytree(prior / 'validated-SPINEL', root / 'judging/ONYX')
(root / 'baseline-provenance.txt').write_text('ONYX is the exact validated SPINEL image set: eight unchanged board images and two text-envelope repair combat retakes. Main integration files were byte-verified.\n')
work_env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'}
for slot in ['base', 'a', 'b', 'c']:
    args = ['git', '-C', str(repo), 'worktree', 'add', '--quiet']
    args += ['--detach', str(root / slot), base] if slot == 'base' else ['-b', 'codex/r52-' + slot, str(root / slot), base]
    subprocess.run(args, env=work_env, check=True, stdout=subprocess.DEVNULL)
    print('ready', slot, base, flush=True)
print(json.dumps(manifest), flush=True)
