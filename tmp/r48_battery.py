"""Serial browser gates for a selected isolated round build."""
import json
import os
import subprocess
import sys
from pathlib import Path

worktree = Path(sys.argv[1]).resolve()
port = sys.argv[2]
out = Path(sys.argv[3]).resolve()
out.mkdir(parents=True, exist_ok=True)
wrapper = worktree.parent / 'chrome.py'
gates = ['chrome/run.py', 'steam-deck/run.py', 'gamepad/run.py',
         'events/check.py', 'gameover-keeps/run.py', 'seams/proof.py',
         'combat-scene/seam.py']
if len(sys.argv) > 4:
    gates = sys.argv[4:]
results_path = out / 'results.json'
results = json.loads(results_path.read_text(encoding='utf-8')) if results_path.exists() else []
for gate in gates:
    args = [sys.executable, str(wrapper), 'tools/on_port.py', port, 'tests/' + gate]
    with (out / (gate.replace('/', '-') + '.log')).open('w', encoding='utf-8') as log:
        try:
            result = subprocess.run(args, cwd=worktree, stdout=log, stderr=subprocess.STDOUT,
                                    env={**os.environ, 'PYTHONIOENCODING': 'utf-8',
                                         'PLAYWRIGHT_CHANNEL': 'chrome'}, timeout=600)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 124
    results = [row for row in results if row['gate'] != gate]
    results.append({'gate': gate, 'exit': code})
    results_path.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(gate, code, flush=True)
