"""Sequential exclusive-GPU checks; inherited assertions are unchanged."""
import json,os,subprocess,sys,time
from pathlib import Path
out=Path('docs/ui-pass/TOURMALINE-r52-proofs');out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env.update(PYTHONIOENCODING='utf-8',R49_URL='http://localhost:9523',R49_OUT=str(out/'queue'))
checks=[
 ('queue',['tests/ui-r52-tourmaline/inherited.py','probe-queue.py']),
 ('ink',['tests/ui-r51-spinel/ribbon-ink.py','--port','9523','--out',str(out/'ink')]),
 ('idle',['tests/ui-r52-tourmaline/inherited.py','probe-idle-resize.py']),
 ('lifecycle',['tests/ui-r51-spinel/queue-lifecycle.py','--port','9523','--out',str(out/'lifecycle')]),
 ('memorial',['tests/ui-r51-spinel/memorial.py','--port','9523','--out',str(out/'memorial')]),
 ('memorial-long',['tests/ui-r51-spinel/memorial.py','--long-deck','--port','9523','--out',str(out/'memorial-long')]),
 ('keepsakes',['tests/ui-r52-tourmaline/inherited.py','keepsakes.py','9523']),
 ('interactions',['tests/ui-r52-tourmaline/inherited.py','interactions.py','9523']),
 ('event-boundary',['tests/ui-r52-tourmaline/inherited.py','event-boundary.py','9523']),
 ('shop-rules',['tests/ui-r49/shop-rules.py','9523',str(out/'shop-rules.json')]),
]
results=[]
for name,args in checks:
 start=time.monotonic()
 with (out/(name+'.log')).open('w',encoding='utf-8') as log:
  try:r=subprocess.run([sys.executable,*args],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600);rc=r.returncode
  except subprocess.TimeoutExpired:rc=124
 results.append({'name':name,'exit':rc,'seconds':round(time.monotonic()-start,3)});(out/'runtime-results.json').write_text(json.dumps(results,indent=2));print(results[-1],flush=True)
 if rc:print((out/(name+'.log')).read_text(encoding='utf-8')[-4000:],flush=True)
sys.exit(int(any(r['exit'] for r in results)))
