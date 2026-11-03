"""Replace only receipt-backed NEW art after retaining every superseded byte."""
from pathlib import Path
import json,hashlib,shutil,os,datetime,sys
P=Path(__file__).resolve().parent;ROOT=P.parents[2];registry=json.loads((P/'animation-deliveries.json').read_text());baseline=json.loads((P/'preexisting-assets-sha256.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for relative in sys.argv[1:]:
 d=P/relative;prod=json.loads((d/'production-manifest.json').read_text());eid=prod['enemy'];v=json.loads((d/'validation.json').read_text());assert v.get('technical_passed',v.get('passed')),v['errors']
 review=json.loads((d/'orientation-review.json').read_text());assert review['status']=='left_in_inspected_keyposes'
 previous=json.loads((P/registry[eid]['receipt']).read_text());assert previous['complete'] and previous['enemy']==eid
 backup=P/'revisions'/(eid+'-before-'+d.name);assert not backup.exists(),backup
 for e in previous['files']:
  target=ROOT/e['path'];assert e['path'] not in baseline and str(target.relative_to(ROOT)) not in baseline,'Never alter a preservation-baseline asset'
  assert digest(target)==e['sha256'],'Conflict: '+str(target)
  assert (d/target.name).exists(),target.name
 backup.mkdir(parents=True)
 for e in previous['files']:shutil.copy2(ROOT/e['path'],backup/Path(e['path']).name)
 (backup/'receipt.json').write_text(json.dumps(previous,indent=2),encoding='utf-8')
 index=json.loads((d/'index.json').read_text());index.update(orientation='screen-left',reviewStatus='Technical checks and decoded orientation key-pose review passed; full-speed visual approval pending.')
 for m in index['clips'].values():m['orientation']='screen-left'
 (d/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
 receipt={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'enemy':eid,'states':list(index['clips']),'method':prod['method'],'validation':relative+'/validation.json','orientation_review':relative+'/orientation-review.json','quality_gate':'technical_pass_visual_review_pending','supersedes':(backup/'receipt.json').relative_to(P).as_posix(),'files':[],'complete':False}
 for e in previous['files']:
  target=ROOT/e['path'];source=d/target.name;tmp=target.with_name(target.name+'.left-correction');assert not tmp.exists()
  with source.open('rb') as r,tmp.open('xb') as w:shutil.copyfileobj(r,w)
  os.replace(tmp,target);receipt['files'].append({'path':e['path'],'sha256':digest(target),'bytes':target.stat().st_size})
  (d/'installed-assets.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
 receipt['complete']=True;(d/'installed-assets.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
 registry[eid]={'receipt':relative+'/installed-assets.json','status':'produced_review_pending','staging':relative,'validation':relative+'/validation.json'}
 (P/'animation-deliveries.json').write_text(json.dumps(registry,indent=2),encoding='utf-8')
 if eid=='hall-mirror':(P/'published-clips.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
 print(eid,'corrected; 9 superseded new assets archived; legacy baseline untouched.',flush=True)
