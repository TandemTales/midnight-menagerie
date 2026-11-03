from pathlib import Path
import json,hashlib,shutil,datetime
P=Path(__file__).resolve().parent;ROOT=P.parents[2];D=P/'representative-v3'
v=json.loads((D/'validation.json').read_text());assert v['passed'],v['errors']
index=json.loads((D/'index.json').read_text());targets=[]
for state,m in index['clips'].items():
 targets += [(D/m['source'],ROOT/'animations/sprites/enemies/animations'/m['source']), (D/m['file'],ROOT/'game/assets/sprites/enemy-clips/hall-mirror'/m['file'])]
targets.append((D/'index.json',ROOT/'game/assets/sprites/enemy-clips/hall-mirror/index.json'))
assert not (P/'published-clips.json').exists(),'Receipt exists; do not republish'
for source,target in targets:
 assert source.exists(),source
 assert not target.exists(),f'Refuse to overwrite {target}'
receipt={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'enemy':'hall-mirror','states':list(index['clips']),'method':'source-art-layered-rig','validation':'representative-v3/validation.json','files':[],'complete':False}
for source,target in targets:
 target.parent.mkdir(parents=True,exist_ok=True)
 with source.open('rb') as r,target.open('xb') as w:shutil.copyfileobj(r,w)
 digest=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
 assert digest==hashlib.file_digest(source.open('rb'),'sha256').hexdigest()
 receipt['files'].append({'path':target.relative_to(ROOT).as_posix(),'sha256':digest,'bytes':target.stat().st_size})
 (P/'published-clips.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
receipt['complete']=True
(P/'published-clips.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('Saved',len(targets),'new validated assets. No existing asset or global registry written.')
