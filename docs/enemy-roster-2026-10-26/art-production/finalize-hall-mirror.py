import json,csv,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
src=root/'animations/sprites/enemies/hallMirror.png'; dst=root/'game/assets/sprites/enemies/hall-mirror.webp'
assert not src.exists() and not dst.exists(), 'Refuse overwrite'
raw=Image.open(out/'hall-mirror-original.png').convert('RGBA')
raw.resize((256,256),Image.Resampling.LANCZOS).save(src)
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py'); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')))
def info(p):
 im=Image.open(p); im.load(); a=im.convert('RGBA').getchannel('A'); h=a.histogram()
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
for e in m['entries']:
 if e['production_id']=='hall-mirror':
  e.update(status='new',validation={'technical':info(dst),'source':info(src),'original':info(out/'hall-mirror-original.png'),'visual':'Reviewed: ornate narrow wood/brass mirror, single friendly offset reflection, readable whole silhouette, no visible clipping or anatomy defects, genuine transparency. Runtime conversion uses existing build_enemy_still function without registry changes.'},blocker=None)
m['counts']={'existing':31,'new':1,'pending':155,'blocked':0,'total':187}
m['checkpoint']='Parent requested completed-turn checkpoint before remaining regional production.'
assert len(m['entries'])==187 and len({e['production_id'] for e in m['entries']})==187
for level in range(1,18):
 es=[e for e in m['entries'] if e['level']==level]
 assert len(es)==11 and [sum(e['tier']==t for e in es) for t in ['regular','elite','boss']]==[7,3,1]
(out/'coverage-manifest.json').write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8')
with (out/'coverage-manifest.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['level','region','slot','tier','name','production_id','status','source_path','output_path','blocker']; w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(m['entries'])
before=json.loads((out/'preserved-files-sha256.json').read_text(encoding='utf-8'))
changed=[p for p,h in before.items() if not (root/p).exists() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
assert not changed,changed
(out/'validation-checkpoint.json').write_text(json.dumps({'coverage':m['counts'],'unique_ids':187,'regions_validated':17,'animated_identities_preserved':29,'prior_files_sha256_verified':len(before),'changed_prior_files':changed,'new_runtime_metadata':meta},indent=2),encoding='utf-8')
preview=Image.new('RGB',(900,400),(36,37,48)); d=ImageDraw.Draw(preview)
for i,(p,title) in enumerate([(root/'game/assets/sprites/enemies/door-greeter.webp','EXISTING: Door Greeter'),(dst,'NEW: Hall Mirror'),(root/'game/assets/sprites/enemies/unwelcome-guest.webp','EXISTING: Unwelcome Guest')]):
 im=Image.open(p).convert('RGBA'); im.thumbnail((270,330)); preview.paste(im,(i*300+(300-im.width)//2,45+(330-im.height)//2),im); d.text((i*300+14,15),title,fill='white')
preview.save(out/'foyer-checkpoint-contact.jpg',quality=94)
print(json.dumps({'counts':m['counts'],'runtime':info(dst),'source':info(src),'unchanged':len(before)}))
