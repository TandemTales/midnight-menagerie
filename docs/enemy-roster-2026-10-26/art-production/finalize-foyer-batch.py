import json,csv,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
items=[('portrait-greeter','portrait-greeter-v2','Complete horizontal oval gold frame, friendly rosy-cheeked painted host. All anatomy contained in canvas; warm tactile finish. First render retained but not used because frame touched side boundaries.'),('grand-mirror','grand-mirror','Three connected floor-mirror panes with three friendly reflections in distinct poses; entire feet and carved finials visible. Broad three-panel outline distinct from narrow Hall Mirror.'),('foyer-chandelier','foyer-chandelier','Broad antique brass candle crown with six candles, exactly three oversized crystals and complete chain cap. No face; full silhouette visible and separate readable crystal drops.')]
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py'); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
def info(p):
 im=Image.open(p); im.load(); a=im.convert('RGBA').getchannel('A'); h=a.histogram(); solid=a.point(lambda x:255 if x>=64 else 0)
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'visible_bbox_alpha64':solid.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def write_manifest():
 m['counts']={s:sum(e['status']==s for e in m['entries']) for s in ['existing','new','pending','blocked']};m['counts']['total']=len(m['entries'])
 m['checkpoint']='Foyer production batch complete; 11/11 foyer identities have validated stills.'
 tmp=out/'coverage-manifest.json.tmp';tmp.write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8');tmp.replace(out/'coverage-manifest.json')
 with (out/'coverage-manifest.csv').open('w',newline='',encoding='utf-8-sig') as f:
  fields=['level','region','slot','tier','name','production_id','status','source_path','output_path','blocker'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(m['entries'])
for id,rawid,review in items:
 e=next(e for e in m['entries'] if e['production_id']==id)
 assert e['status']=='pending',f'{id}: refusing to redo non-pending entry'
 src=root/e['source_path'];dst=root/e['output_path'];rawpath=out/(rawid+'-original.png')
 assert not src.exists() and not dst.exists(),f'{id}: refuse overwrite'
 raw=Image.open(rawpath).convert('RGBA'); rawinfo=info(rawpath);bb=rawinfo['visible_bbox_alpha64'];w,h=raw.size
 assert rawinfo['transparent_pixels']>0 and bb and 0<bb[0]<bb[2]<w and 0<bb[1]<bb[3]<h, f'{id}: invalid alpha or clipped visible content'
 side={'regular':256,'elite':512,'boss':1024}[e['tier']]
 raw.resize((side,side),Image.Resampling.LANCZOS).save(src)
 meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')))
 details=info(dst);assert details['format']=='WEBP' and details['mode']=='RGBA' and details['transparent_pixels']>0
 e.update(status='new',validation={'technical':details,'source':info(src),'original':rawinfo,'original_path':str(rawpath.relative_to(root)),'visual':review,'conversion':'Lanczos source canvas to tier convention; existing build_enemy_still for isolated new WebP only; no registry update.','runtime_metadata':meta},blocker=None)
 write_manifest()
before=json.loads((out/'preserved-files-sha256.json').read_text(encoding='utf-8'));before.update(json.loads((out/'foyer-batch-preserved-sha256.json').read_text(encoding='utf-8')))
changed=[p for p,h in before.items() if not (root/p).exists() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h];assert not changed,changed
assert len(m['entries'])==187 and len({e['production_id'] for e in m['entries']})==187
regions=[]
for level in range(1,18):
 es=[e for e in m['entries'] if e['level']==level]
 assert len(es)==11 and [sum(e['tier']==t for e in es) for t in ['regular','elite','boss']]==[7,3,1]
 regions.append({'level':level,'region':es[0]['region'],'existing':sum(e['status']=='existing' for e in es),'new':sum(e['status']=='new' for e in es),'pending':sum(e['status']=='pending' for e in es)})
assert all(e['status'] in ['existing','new'] for e in m['entries'] if e['level']==1)
validation={'coverage':m['counts'],'region_coverage':regions,'unique_ids':187,'animated_identities_preserved':29,'preexisting_files_sha256_verified':len(before),'changed_prior_files':changed,'batch_new_files':[{'id':id,'source':next(e['source_path'] for e in m['entries'] if e['production_id']==id),'output':next(e['output_path'] for e in m['entries'] if e['production_id']==id)} for id,_,_ in items]}
(out/'foyer-batch-validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
for name,es in [('foyer-batch-new-contact.jpg',[e for e in m['entries'] if e['production_id'] in [x[0] for x in items]]),('foyer-complete-contact.jpg',[e for e in m['entries'] if e['level']==1])]:
 cols=3 if len(es)==3 else 4;rows=(len(es)+cols-1)//cols;preview=Image.new('RGB',(cols*300,rows*340),(36,37,48));d=ImageDraw.Draw(preview)
 for i,e in enumerate(es):
  x=(i%cols)*300;y=(i//cols)*340;im=Image.open(root/e['output_path']).convert('RGBA');im.thumbnail((270,280));preview.paste(im,(x+(300-im.width)//2,y+45+(280-im.height)//2),im);d.text((x+12,y+10),e['name'],fill='white');d.text((x+12,y+26),e['status'].upper()+' / '+e['slot'],fill=(185,185,200))
 preview.save(out/name,quality=94)
print(json.dumps({'counts':m['counts'],'foyer':regions[0],'preserved':len(before),'new_dimensions':{e['production_id']:e['validation']['technical']['size'] for e in m['entries'] if e['production_id'] in [x[0] for x in items]}}))
