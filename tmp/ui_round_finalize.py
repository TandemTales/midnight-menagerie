"""Finalize one reviewed/applied round from its explicit parent-review record.

Usage: python tmp/ui_round_finalize.py ROUND
Does not apply changes, choose a winner, invent review findings or launch tests.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

n = int(sys.argv[1])
root = Path(f'D:/UILOOP/r{n}-20261029')
result_path = Path(f'docs/ui-pass/RESULTS-r{n}.json')
result = json.loads(result_path.read_text())
assert not result['applied_to_main'], 'Already finalized; do not duplicate records'
manifest = json.loads((root / 'manifest.json').read_text())
integration = json.loads((root / 'integration.json').read_text())
battery = json.loads((root / 'winner-battery/results.json').read_text())
captures = json.loads((root / 'validated-captures.json').read_text())
review = json.loads((root / 'parent-review.json').read_text())
assert review['accepted'] and review['winner'] == result['winner']
assert review['selected_commit'] == integration['winner_commit'] == captures['source_commit']
assert len(battery) == 7 and all(r['exit'] == 0 for r in battery)
assert len(captures['captures']) == 10 and all(r['exit'] == 0 for r in captures['captures'])
assert integration['main_index_preserved']
index = Path(subprocess.check_output(['git', 'rev-parse', '--git-path', 'index'], text=True).strip())
assert hashlib.sha256(index.read_bytes()).hexdigest() == integration['main_index_sha256'] == manifest['main_index_sha256']
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == manifest['main_head']
for row in integration['files']:
    assert hashlib.sha256(Path(row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
for row in captures['captures']:
    assert hashlib.sha256((root / f"validated-{result['winner']}" / (row['screen'] + '.png')).read_bytes()).hexdigest() == row['sha256']
assert review['owned_servers_stopped'], 'Stop and verify owned servers before finalizing'
fit = result['all_fit_thresholds_met']
if not fit:
    assert Path(f'docs/ui-pass/BRIEF-r{n+1}.md').exists()
    assert Path(f'docs/ui-pass/RUBRIC-r{n+1}.md').exists()
result.update({k:v for k,v in review.items() if k not in ['accepted','winner','owned_servers_stopped','completion_text']})
result.update(status='complete; selected build validated and applied as working changes',
              applied_to_main=True, main_committed_or_pushed=False,
              applied_files_byte_verified=len(integration['files']), main_index_preserved=True,
              main_index_sha256=integration['main_index_sha256'], browser_gates=battery,
              validated_captures=f'VALIDATED-CAPTURES-r{n}.json')
if not fit:
    result['next_brief'] = f'BRIEF-r{n+1}.md'
code = result['winner']
continuation = ('All paired screens meet the required9+reference-fit threshold.' if fit else
                f'Continue the full loop at Round{n+1}; stop at10% remaining.')
current = f'''**Current, 2026-10-29:** Round{n} {code} is complete and applied as working
changes. All seven parent browser gates pass; all{len(integration['files'])} applied files
match the tested build and main's index is preserved. No main commit/push.
See [results](RESULTS-r{n}.json), [validated images](VALIDATED-CAPTURES-r{n}.json)
and [checkpoint](ROUND-r{n}-2026-10-29.md). {continuation}
'''
readme_path = Path('docs/ui-pass/README.md')
readme = readme_path.read_text(encoding='utf-8')
start = readme.index('**Current,')
end = readme.index('\n\n', start)
previous = re.sub(r'^\*\*Current,.*?\*\*\s*', '', readme[start:end], count=1)
previous = re.sub(r'Continue the full loop at Round\d+; stop at(?:3|10)% remaining\.', '', previous).rstrip()
readme = readme[:start] + current.rstrip() + '\n\n' + previous + readme[end:]
handoff_path = Path('HANDOFF-PROMPT.md')
handoff = handoff_path.read_text(encoding='utf-8')
start = handoff.index('**Latest checkpoint,')
end = handoff.index('You are picking up', start)
handoff = handoff[:start] + f'''**Latest checkpoint, 2026-10-29:** Round{n} {code} is applied as working
changes. All seven parent gates pass; all{len(integration['files'])} files byte-verified,
main index preserved, no main commit/push. Selected commit{integration['winner_commit']}
lives in its isolated worktree. {continuation}
Read `docs/ui-pass/ROUND-r{n}-2026-10-29.md` and `RESULTS-r{n}.json`.
Historical pushed/merged statements below do not describe these working changes.

''' + handoff[end:]
checkpoint_path = Path(f'docs/ui-pass/ROUND-r{n}-2026-10-29.md')
checkpoint = f'# Round{n} complete — {code} applied\n\n' + review['completion_text'] + '\n\n' + continuation + '\n\n## Historical progress (superseded above)\n\n' + checkpoint_path.read_text(encoding='utf-8')
result_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
readme_path.write_text(readme, encoding='utf-8')
handoff_path.write_text(handoff, encoding='utf-8')
checkpoint_path.write_text(checkpoint, encoding='utf-8')
print(f'Round{n} finalized; {len(integration["files"])} files reverified, index preserved; all-fit={fit}')
