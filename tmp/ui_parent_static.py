"""Read-only parent checks for a selected captured game tree.

Usage: python tmp/ui_parent_static.py WORKTREE BASE OUTPUT
Unlike endings_guard.py, the ending check never repairs files after capture.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

repo=Path.cwd()
wt=Path(sys.argv[1]).resolve()
base=sys.argv[2]
out=Path(sys.argv[3]).resolve()
out.mkdir(parents=True,exist_ok=True)
env={**os.environ,'PYTHONIOENCODING':'utf-8'}
def git(*args):
    return subprocess.check_output(['git','-C',str(wt),*args],text=True)
assert not git('diff','--name-only').strip()
assert not git('diff','--cached','--name-only').strip()
checks=[('scene-css',[sys.executable,'tests/scene-css/check.py']),
        ('css-tokens',[sys.executable,'tests/css-tokens/check.py']),
        ('seams',[sys.executable,str(repo/'tmp/r48_audit.py'),str(wt),str(out/'seams.json')]),
        ('combatfx-syntax',['node','--check','game/src/fx/combatfx.js']),
        ('board-scroll-syntax',['node','--check','game/src/scenes/r49-board-scroll.js']),
        ('whitespace',['git','-c','core.whitespace=cr-at-eol','diff',base,'--check'])]
for rel in git('diff','--name-only',base).splitlines():
    if rel.startswith('game/src/') and rel.endswith('.js') and rel not in ['game/src/fx/combatfx.js','game/src/scenes/r49-board-scroll.js']:
        checks.append(('syntax-'+rel.replace('/','-'),['node','--check',rel]))
rows=[]
for name,args in checks:
    with (out/(name+'.log')).open('w',encoding='utf-8') as log:
        run=subprocess.run(args,cwd=wt,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
    rows.append({'check':name,'exit':run.returncode})
    print(name,run.returncode,flush=True)
paths=[p for p in git('diff','--name-only',base).splitlines() if p.endswith(('.js','.css','.html','.py','.json','.md','.txt','.svg'))]
plain=git('diff','--numstat',base,'--',*paths).splitlines() if paths else []
icr=git('diff','--numstat','--ignore-cr-at-eol',base,'--',*paths).splitlines() if paths else []
endings_ok=sorted(plain)==sorted(icr)
(out/'endings.log').write_text(f'Read-only ending diff check: {len(paths)} text paths; numstat equals ignore-cr-at-eol: {endings_ok}; no files repaired.\n',encoding='utf-8')
rows.append({'check':'endings-read-only','exit':0 if endings_ok else 1})
seams=json.loads((out/'seams.json').read_text())
known=(seams['sites']==9110 and len(seams['problems'])==4 and
       {r['line'] for r in seams['problems']}=={692,695,698,704} and
       all(r['file']=='game/src/state/floorplan.js' and r['kind']=='UNKNOWN-METHOD' for r in seams['problems']))
(out/'results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
(out/'acceptance.json').write_text(json.dumps({'known_seam_reports_only':known,'source_unchanged':not git('diff','--name-only').strip(),'results':rows},indent=2),encoding='utf-8')
assert known,seams
assert all(r['exit']==0 for r in rows if r['check']!='seams'),rows
assert not git('diff','--name-only').strip() and not git('diff','--cached','--name-only').strip()
print('Parent static checks pass; exactly4 known seam reports; source unchanged',flush=True)
