"""Retake only repaired scenes, retaining the untouched blind comparison set."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys

root = Path('D:/UILOOP/r49-20261029')
wt = root / 'b'
out = root / 'validated-RUBY'
out.mkdir(exist_ok=True)
for scene in ['rest', 'event', 'shop']:
    for p in (root / 'judging/RUBY').glob(scene + '*'):
        shutil.copy2(p, out / p.name)
results = [{'screen': s + suffix, 'exit': 0, 'provenance': 'unchanged original RUBY capture'}
           for s in ['rest', 'event', 'shop'] for suffix in ['', '-1280']]
for scene in ['gameover', 'combat-floaters']:
    for w, h in [(1600, 900), (1280, 800)]:
        name = scene + ('-1280' if w == 1280 else '')
        args = [sys.executable, str(root / 'chrome.py'), 'tools/shot.py', 'RUBY-validated-' + name,
                '--port', '9492', '--scene', 'combat' if scene == 'combat-floaters' else scene,
                '--seed', '7', '--companion', 'bones', '--kid', 'maya', '--w', str(w), '--h', str(h),
                '--wait', '8' if scene == 'combat-floaters' else '3', '--warm-timeout', '150']
        if scene == 'gameover':
            args += ['--hash', 'pics=1']
        else:
            args += ['--encounter', 'foyer-boss', '--script', '@' + str(root / 'combat-capture.js'), '--steps', 'wait:0']
        with (out / (name + '.log')).open('w', encoding='utf-8') as log:
            run = subprocess.run(args, cwd=wt, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                                 stdout=log, stderr=subprocess.STDOUT, timeout=600)
        for ext in ['png', 'state.json', 'console.txt']:
            source = wt / 'shots' / ('RUBY-validated-' + name + '.' + ext)
            if source.exists():
                shutil.copy2(source, out / (name + '.' + ext))
        results.append({'screen': name, 'exit': run.returncode, 'provenance': 'selected-build repair retake'})
        (out / 'capture-results.json').write_text(json.dumps(results, indent=2))
        print(name, run.returncode, flush=True)
        assert run.returncode == 0
