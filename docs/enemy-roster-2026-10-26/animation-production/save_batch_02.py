from pathlib import Path
import json,hashlib,shutil,datetime
P=Path(__file__).resolve().parent;ROOT=P.parents[2];registry=json.loads((P/'animation-deliveries.json').read_text())
for relative in ['batch-02/crib-curtains-v2','batch-02/foyer-chandelier']:
 D=P/relative;v=json.loads((D/'validation.json').read_text());assert v['technical_passed'],v['errors']
 production=json.loads((D/'production-manifest.json').read_text());eid=production['enemy'];assert eid not in registry,eid
 index=json.loads((D/'index.json').read_text());index['reviewStatus']='technical checks passed; full-speed intended-size visual review pending; no browser attempt'
 (D/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
 targets=[]
 for state,m in index['clips'].items():
  targets.extend([(D/m['source'],ROOT/'animations/sprites/enemies/animations'/m['source']),(D/m['file'],ROOT/'game/assets/sprites/enemy-clips'/eid/m['file'])])
 targets.append((D/'index.json',ROOT/'game/assets/sprites/enemy-clips'/eid/'index.json'))
 for src,dst in targets:assert src.exists() and not dst.exists(),str(dst)
 receipt={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'enemy':eid,'states':list(index['clips']),'method':production['method'],'validation':relative+'/validation.json','quality_gate':'technical_pass_visual_review_pending','files':[],'complete':False}
 receipt_path=D/'saved-assets.json'
 for src,dst in targets:
  dst.parent.mkdir(parents=True,exist_ok=True)
  with src.open('rb') as r,dst.open('xb') as w:shutil.copyfileobj(r,w)
  digest=hashlib.file_digest(dst.open('rb'),'sha256').hexdigest();assert digest==hashlib.file_digest(src.open('rb'),'sha256').hexdigest()
  receipt['files'].append({'path':dst.relative_to(ROOT).as_posix(),'sha256':digest,'bytes':dst.stat().st_size});receipt_path.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
 receipt['complete']=True;receipt_path.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
 registry[eid]={'receipt':relative+'/saved-assets.json','status':'produced_review_pending','staging':relative,'validation':relative+'/validation.json'}
 (P/'animation-deliveries.json').write_text(json.dumps(registry,indent=2),encoding='utf-8')
 print(eid, len(targets),'new assets saved, visual review pending',flush=True)
