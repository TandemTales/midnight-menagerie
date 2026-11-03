"""Read original sheets and active legacy clip metadata; no image or runtime writes."""
from pathlib import Path
import json,hashlib,sys,collections,datetime
import numpy as np
from PIL import Image
P=Path(__file__).resolve().parent;ROOT=P.parents[2];D=P/'legacy-30fps-2026-10-27';D.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'tools'));import prep_sprites as pipeline
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((P/'preexisting-assets-sha256.json').read_text());live=json.loads((ROOT/'game/assets/sprites/index.json').read_text())['enemyClips'];registry=json.loads((P/'animation-deliveries.json').read_text());rows=[];files=[];protected={}
assert not (D/'before.json').exists(),'Existing audit must not be replaced.'
for eid in sorted(live):
 index=ROOT/'game/assets/sprites/enemy-clips'/eid/'index.json';rel=index.relative_to(ROOT).as_posix();assert eid not in registry and rel in baseline
 assert digest(index)==baseline[rel],f'Unreviewed preexisting modification: {rel}'
 backup=D/'before'/eid/'index.json';backup.parent.mkdir(parents=True,exist_ok=True)
 with backup.open('xb') as out:out.write(index.read_bytes())
 files.append({'path':rel,'before_sha256':digest(index),'backup':backup.relative_to(ROOT).as_posix()});meta=json.loads(index.read_text());assert sorted(meta['clips'])==sorted(live[eid])
 for state,c in meta['clips'].items():
  source=ROOT/'animations/sprites/enemies/animations'/c['source'];atlas=index.parent/c['file'];im=Image.open(source).convert('RGBA');alpha=np.asarray(im.getchannel('A'));cols,rows_n=c['grid'];cw,ch=im.width//cols,im.height//rows_n;occupied=[]
  for j in range(cols*rows_n):
   cell=alpha[(j//cols)*ch:(j//cols+1)*ch,(j%cols)*cw:(j%cols+1)*cw]/255.
   if (pipeline.clean_alpha(cell)>0).mean()>.004:occupied.append(j)
  at=Image.open(atlas).convert('RGBA');active=[]
  for j in range(c['cols']*c['rows']):
   x=j%c['cols']*c['fw'];y=j//c['cols']*c['fh']
   if at.getchannel('A').crop((x,y,x+c['fw'],y+c['fh'])).getbbox():active.append(j)
  assert len(occupied)==c['sourceFrames'];assert active==list(range(c['frames']))
  for f in [source,atlas]:protected[f.relative_to(ROOT).as_posix()]=digest(f)
  rows.append({'enemy':eid,'state':state,'index_path':rel,'source_path':source.relative_to(ROOT).as_posix(),'runtime_path':atlas.relative_to(ROOT).as_posix(),'source_size':list(im.size),'source_grid':c['grid'],'source_grid_capacity':cols*rows_n,'source_occupied_frames':len(occupied),'source_occupied_indices':occupied,'runtime_grid_capacity':c['cols']*c['rows'],'runtime_occupied_frames':len(active),'frames':c['frames'],'fps_before':c['fps'],'fps_after':30,'duration_before':(2 if c.get('ping') else 1)*c['frames']/c['fps'],'duration_after':(2 if c.get('ping') else 1)*c['frames']/30,'loop':c['loop'],'hold':c.get('hold',False),'ping':c.get('ping',False),'defeatCut':c.get('defeatCut')})
 print(eid,len(meta['clips']),'source and runtime occupancy verified',flush=True)
for entry in registry.values():
 receipt=json.loads((P/entry['receipt']).read_text())
 for f in receipt['files']:assert digest(ROOT/f['path'])==f['sha256'];protected[f['path']]=f['sha256']
for f in ['game/assets/sprites/index.json','game/src/ui/sprite.js','game/src/ui/enemy.js','game/src/core/clock.js','tools/prep_sprites.py']:
 protected[f]=digest(ROOT/f)
result={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'enemies':len(live),'clips':len(rows),'states':dict(collections.Counter(r['state'] for r in rows)),'source_occupied_counts':dict(collections.Counter(r['source_occupied_frames'] for r in rows)),'runtime_frame_counts':dict(collections.Counter(r['frames'] for r in rows)),'index_files':files,'clips_audit':rows,'protected_files':protected,'new_production_status':'paused; not resumed'}
(D/'before.json').write_text(json.dumps(result,indent=2));print('AUDIT',result['enemies'],result['clips'],result['source_occupied_counts'],flush=True)
