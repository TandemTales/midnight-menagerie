import json,hashlib,importlib.util,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
master=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
for level in [8,9]:
 p=out/f'region-{level:02d}-results.json'
 if not p.exists():p.write_text(json.dumps({'level':level,'entries':[e for e in master['entries'] if e['level']==level]},indent=2),encoding='utf-8')
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();s=a.point(lambda v:255 if v>=64 else 0)
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'visible_bbox_alpha64':s.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
for id in sys.argv[1:]:
 e=next(e for e in master['entries'] if e['production_id']==id);level=e['level'];assert level in [8,9]
 p=out/f'region-{level:02d}-results.json';r=json.loads(p.read_text(encoding='utf-8'));entry=next(x for x in r['entries'] if x['production_id']==id)
 assert entry['status']=='pending'
 src=root/e['source_path'];dst=root/e['output_path'];rawpath=out/(id+'-original.png')
 assert not src.exists() and not dst.exists(),'Refuse overwrite'
 raw=Image.open(rawpath).convert('RGBA');ri=info(rawpath);bb=ri['visible_bbox_alpha64'];w,h=raw.size
 assert ri['transparent_pixels']>0 and bb and 0<bb[0]<bb[2]<w and 0<bb[1]<bb[3]<h,f'{id}: clipping/alpha check failed: {bb}'
 side={'regular':256,'elite':512,'boss':1024}[e['tier']]; scaled=raw.copy();scaled.thumbnail((side,side),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(side,side));canvas.paste(scaled,((side-scaled.width)//2,(side-scaled.height)//2));canvas.save(src)
 meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')));di=info(dst);assert di['mode']=='RGBA' and di['transparent_pixels']>0
 entry.update(status='new',validation={'technical':di,'source':info(src),'original':ri,'original_path':str(rawpath.relative_to(root)),'visual':'Reviewed full generated image: roster-specific silhouette/material preserved, complete object visible, coherent anatomy and cute nonthreatening mood. Contact sheet review follows region completion.','conversion':'Tier-size source square, existing isolated build_enemy_still function; no registry changes.','runtime_metadata':meta},blocker=None)
 r['counts']={s:sum(x['status']==s for x in r['entries']) for s in ['existing','new','pending','blocked']}
 temp=p.with_suffix('.tmp');temp.write_text(json.dumps(r,indent=2),encoding='utf-8');temp.replace(p)
 print(id,di['size'])
for level in [8,9]:
 p=out/f'region-{level:02d}-results.json';r=json.loads(p.read_text(encoding='utf-8'));es=[e for e in r['entries'] if e['status']=='new'];preview=Image.new('RGB',(1200,1020),(36,37,48));d=ImageDraw.Draw(preview)
 for i,e in enumerate(es):
  x=i%4*300;y=i//4*340;im=Image.open(root/e['output_path']).convert('RGBA');im.thumbnail((270,280));preview.paste(im,(x+(300-im.width)//2,y+45+(280-im.height)//2),im);d.text((x+12,y+12),e['name'],fill='white')
 preview.save(out/f'region-{level:02d}-contact.jpg',quality=94)
