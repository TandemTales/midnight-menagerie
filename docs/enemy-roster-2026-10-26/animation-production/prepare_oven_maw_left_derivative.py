"""Preserved legacy alternate; no registry or renderer edit."""
from pathlib import Path
import json,hashlib,copy,datetime,shutil,math
import numpy as np
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent;ROOT=P.parents[2];D=P/'orientation-audit/legacy-derivatives/oven-maw';D.mkdir(parents=True,exist_ok=True)
original_dir=ROOT/'game/assets/sprites/enemy-clips/oven-maw';old=json.loads((original_dir/'index.json').read_text());new=copy.deepcopy(old)
assert 'oven-maw' not in json.loads((P/'orientation-audit/orientation-audit.json').read_text())['renderer_evidence']['mirrored_ids']
targets=[];checks={};source_hashes=[]
for state,m in old['clips'].items():
 src=original_dir/m['file'];a=Image.open(src).convert('RGBA');out=Image.new('RGBA',a.size);frames=[]
 for i in range(m['frames']):
  x=i%m['cols']*m['fw'];y=i//m['cols']*m['fh'];f=a.crop((x,y,x+m['fw'],y+m['fh'])).transpose(Image.Transpose.FLIP_LEFT_RIGHT);out.paste(f,(x,y));frames.append(f)
 name=Path(m['source']).stem.rsplit('_',1)[0]+'_left_'+state+'.png'
 out.save(D/name);out.save(D/m['file'],lossless=True,method=4)
 c=new['clips'][state];c.update(source=name,sourceFrames=m['frames'],grid=[m['cols'],m['rows']],scale=1,anchor=[m['fw']-m['anchor'][0],m['anchor'][1]],sha1=hashlib.sha1((D/name).read_bytes()).hexdigest()[:16],orientation='screen-left derivative; do not add a runtime flip',derivativeOf=src.relative_to(ROOT).as_posix())
 decoded=np.asarray(Image.open(D/m['file']).convert('RGBA'));expected=np.asarray(out);v=(expected[:,:,3]>0)|(decoded[:,:,3]>0)
 assert np.array_equal(decoded[v],expected[v])
 checks[state]={'decoded_and_framewise_reflection_exact':True,'fps_preserved':c['fps']==m['fps'],'frame_count_preserved':c['frames']==m['frames'],'loop_hold_ping_fade_preserved':all(c.get(k)==m.get(k) for k in ['loop','hold','ping','fade']),'pivot_mirrored_about_own_feet':c['anchor']==[m['fw']-m['anchor'][0],m['anchor'][1]],'source_note':'PNG contains the exact reflected packed runtime cells; original higher-resolution source remains untouched.'}
 source_hashes.append({'path':src.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(src.read_bytes()).hexdigest()})
 contact=Image.new('RGB',(6*220,250),(27,28,38));draw=ImageDraw.Draw(contact)
 for j,i in enumerate(np.linspace(0,len(frames)-1,6).round().astype(int)):
  g=frames[i].copy();g.thumbnail((212,214),Image.Resampling.LANCZOS);contact.paste(g,(220*j+(220-g.width)//2,220-g.height),g);draw.text((220*j+5,230),f'{state} {i+1}/{len(frames)}',fill='white')
 contact.save(D/f'{state}-left-contact.jpg')
 targets.extend([(D/name,ROOT/'animations/sprites/enemies/animations'/name),(D/m['file'],ROOT/'game/assets/sprites/enemy-clips-left/oven-maw'/m['file'])])
new['scale']=1;new['orientationIntegration']='Alternate directory only. Existing enemyClips loader resolves enemy-clips/<id>/index.json; a separately authorized mapping to enemy-clips-left/oven-maw/index.json is needed. No renderer flip for oven-maw.'
(D/'index.json').write_text(json.dumps(new,indent=2),encoding='utf-8');targets.append((D/'index.json',ROOT/'game/assets/sprites/enemy-clips-left/oven-maw/index.json'))
for src,dst in targets:assert not dst.exists(),dst
receipt={'enemy':'oven-maw','status':'legacy_derivative_saved_integration_pending','created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'orientation':'screen-left','existing_fps_preserved':True,'files':[],'original_inputs':source_hashes,'checks':checks,'complete':False,'limits':'Frame reflection and metadata verified; chronological contacts require review. No game integration or full-speed test.'}
for src,dst in targets:
 dst.parent.mkdir(parents=True,exist_ok=True)
 with src.open('rb') as r,dst.open('xb') as w:shutil.copyfileobj(r,w)
 receipt['files'].append({'path':dst.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'bytes':dst.stat().st_size})
 (D/'saved-assets.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
receipt['complete']=True;(D/'saved-assets.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('Oven Maw left-facing alternate: 4 clips and index saved; original files/rates preserved; integration pending.',flush=True)
