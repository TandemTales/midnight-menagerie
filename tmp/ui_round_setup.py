"""Snapshot validated working files; create only the three independent checkouts.

Usage: python tmp/ui_round_setup.py ROUND BASELINE_CODE CODE_A CODE_B CODE_C
The previous selected checkout supplies read-only baseline provenance. No fourth
duplicate checkout is needed because its ten validated images are immutable.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys

number = int(sys.argv[1])
baseline_code, *codes = sys.argv[2:]
assert len(codes) == 3 and len(set([baseline_code, *codes])) == 4
repo = Path.cwd()
prior = Path(f'D:/UILOOP/r{number-1}-20261029')
root = Path(f'D:/UILOOP/r{number}-20261029')
results = json.loads((repo / f'docs/ui-pass/RESULTS-r{number-1}.json').read_text(encoding='utf-8'))
assert results['applied_to_main'] and not results['all_fit_thresholds_met']
integration = json.loads((prior / 'integration.json').read_text())
previous = json.loads((prior / 'manifest.json').read_text())
winner = results['winner']
previous_slot = 'base' if winner == previous['baseline'] else next(slot for slot, code in previous['builders'].items() if code == winner)
baseline_worktree = Path(previous.get('baseline_worktree', prior / 'base')) if previous_slot == 'base' else prior / previous_slot

def git(where, *args, env=None):
    return subprocess.check_output(['git', '-C', str(where), *args], env=env).decode().strip()

assert git(baseline_worktree, 'rev-parse', 'HEAD') == integration['winner_commit']
assert not git(baseline_worktree, 'diff', '--name-only')
assert not git(baseline_worktree, 'diff', '--cached', '--name-only')
assert not git(baseline_worktree, 'ls-files', '--others', '--exclude-standard', '--', 'game/src', 'game/assets', 'UI')
assert integration['main_index_preserved']
for row in integration['files']:
    assert hashlib.sha256((repo / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
validated = json.loads((prior / 'validated-captures.json').read_text())
assert validated['source_commit'] == integration['winner_commit']
assert len(validated['captures']) == 10 and all(r['exit'] == 0 for r in validated['captures'])
for row in validated['captures']:
    assert hashlib.sha256((prior / f'validated-{winner}' / (row['screen']+'.png')).read_bytes()).hexdigest() == row['sha256']
assert (repo / f'docs/ui-pass/BRIEF-r{number}.md').exists()
assert (repo / f'docs/ui-pass/RUBRIC-r{number}.md').exists()
if root.exists():
    assert os.environ.get('UI_ROUND_RESUME_INDEX_ONLY') == '1'
    assert {p.name for p in root.iterdir()} == {'baseline.index'}, 'Resume only the inspected index-only setup'
else:
    root.mkdir(exist_ok=False)
index = Path(git(repo, 'rev-parse', '--git-path', 'index'))
if not index.is_absolute():
    index = repo / index
index_hash = hashlib.sha256(index.read_bytes()).hexdigest()
env = {**os.environ, 'GIT_INDEX_FILE': str(root / 'baseline.index')}
git(repo, 'read-tree', 'HEAD', env=env)
git(repo, 'add', '-u', env=env)
applied = set()
for older in range(48, number):
    p = Path(f'D:/UILOOP/r{older}-20261029/integration.json')
    if p.exists():
        old_record = json.loads(p.read_text())
        if 'files' in old_record:
            applied.update(row['path'] for row in old_record['files'])
        else:
            applied.update(old_record['byte_matches'])
git(repo, 'add', '--', *sorted(p for p in applied if (repo / p).exists()), env=env)
git(repo, 'add', '--', 'game/src', 'game/assets', 'tests/seams/check-regression.py', env=env)
docs = []
for r in range(48, number+1):
    for stem in ['BRIEF', 'RUBRIC', 'RESULTS', 'CAPTURES', 'VALIDATED-CAPTURES',
                 'SCOPE-AUDIT', 'ASSERTION-AUDIT', 'PROOF-AUDIT', 'TIMING-ERRATUM']:
        extension = 'md' if stem in ['BRIEF', 'RUBRIC', 'TIMING-ERRATUM'] else 'json'
        p = Path(f'docs/ui-pass/{stem}-r{r}.{extension}')
        if p.exists():
            docs.append(str(p))
    docs += [str(p) for p in Path('docs/ui-pass').glob(f'ROUND-r{r}-*.md')]
    p = Path(f'docs/ui-pass/judges-r{r}')
    if p.exists():
        docs.append(str(p))
git(repo, 'add', '--', *docs, env=env)
tree = git(repo, 'write-tree', env=env)
base = git(repo, 'commit-tree', tree, '-p', integration['winner_commit'], '-m', f'Round{number} baseline after validated {winner} integration', env=env)
assert not git(repo, 'diff', '--name-only', integration['winner_commit'], base, '--', 'game/src', 'game/assets', 'UI'), 'Production changed since validated images; capture a fresh baseline before continuing'
git(repo, 'update-ref', f'refs/heads/codex/r{number}-current-baseline', base)
assert hashlib.sha256(index.read_bytes()).hexdigest() == index_hash
manifest = dict(repo=str(repo), base=base, parent=integration['winner_commit'],
    main_head=git(repo, 'rev-parse', 'HEAD'), baseline=baseline_code,
    baseline_worktree=str(baseline_worktree), builders=dict(zip('abc', codes)),
    ports={slot:9000+number*10+i for i,slot in enumerate(['baseline','a','b','c'])},
    main_index_sha256=index_hash)
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2))
for name in ['chrome.py', 'combat-capture.js']:
    shutil.copy2(prior / name, root / name)
(root / 'capture.py').write_text((prior / 'capture.py').read_text().replace(str(prior).replace('\\','/'), str(root).replace('\\','/')))
shutil.copytree(prior / f'validated-{winner}', root / 'judging' / baseline_code)
(root / 'baseline-provenance.txt').write_text(f'{baseline_code} is the exact validated {winner} image set. Hashes verified; source remains in read-only prior selected checkout {baseline_worktree}.\n')
for slot in 'abc':
    subprocess.run(['git','-C',str(repo),'worktree','add','--quiet','-b',f'codex/r{number}-{slot}',str(root/slot),base],
                   env={**os.environ,'GIT_LFS_SKIP_SMUDGE':'1'}, check=True, stdout=subprocess.DEVNULL)
    print('ready', slot, base, flush=True)
print(json.dumps(manifest), flush=True)
