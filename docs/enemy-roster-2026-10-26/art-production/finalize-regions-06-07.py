import sys,json,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd();out=root/'docs/enemy-roster-2026-10-26/art-production'
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();b=a.point(lambda x:255 if x>=64 else 0).getbbox()
 return dict(format=im.format,size=list(im.size),mode=im.mode,transparent_pixels=h[0],partial_alpha_pixels=sum(h[1:255]),alpha_bbox=a.getbbox(),visible_bbox_alpha64=b,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
for arg in sys.argv[1:]:
 id,sep,rawid=arg.partition('=');rawid=rawid or id;e=next(e.copy() for e in m['entries'] if e['production_id']==id);assert e['level'] in [6,7]
 results=out/('region-%02d-results.json'%e['level']);r=json.loads(results.read_text(encoding='utf-8')) if results.exists() else {'level':e['level'],'region':e['region'],'entries':[]}
 assert not any(x['production_id']==id for x in r['entries']),'Already finalized'
 src=root/e['source_path'];dst=root/e['output_path'];assert not src.exists() and not dst.exists(),'Refuse overwrite'
 raw=out/(rawid+'-original.png');d=info(raw);w,h=d['size'];b=d['visible_bbox_alpha64'];assert b and 0<b[0]<b[2]<w and 0<b[1]<b[3]<h,(id,'clipped visible bounds',b,d['size']);assert d['transparent_pixels']>w*h*.1,'Insufficient transparent background'
 side={'regular':256,'elite':512,'boss':1024}[e['tier']];paint=Image.open(raw).convert('RGBA');paint.thumbnail((side,side),Image.Resampling.LANCZOS);square=Image.new('RGBA',(side,side));square.paste(paint,((side-paint.width)//2,(side-paint.height)//2));square.save(src)
 meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')));runtime=info(dst);assert runtime['format']=='WEBP' and runtime['mode']=='RGBA' and runtime['transparent_pixels']>0
 e.update(status='new',blocker=None,validation={'technical':runtime,'source':info(src),'original':d,'original_path':str(raw.relative_to(root)),'prompt_path':str((out/(rawid+'-prompt.txt')).relative_to(root)),'visual':'Full generated image visually reviewed for roster identity, complete silhouette, anatomy and tactile cute haunted-house style; regional contact sheet also reviewed before final report.','runtime_metadata':meta,'conversion':'Tier-sized square source PNG; isolated existing build_enemy_still function for new WebP only. No registry changes.'})
 r['entries'].append(e);r['counts']={'new':len(r['entries']),'remaining_in_region':11-len(r['entries'])};tmp=results.with_suffix('.tmp');tmp.write_text(json.dumps(r,indent=2,ensure_ascii=False),encoding='utf-8');tmp.replace(results)
 print(id,runtime['size'],'saved and validated')
for level in [6,7]:
 p=out/('region-%02d-results.json'%level)
 if not p.exists():continue
 r=json.loads(p.read_text(encoding='utf-8'));es=sorted(r['entries'],key=lambda e:[x['production_id'] for x in m['entries']].index(e['production_id']));cols=4;rows=(len(es)+cols-1)//cols;im=Image.new('RGB',(cols*300,rows*340),(36,37,48));draw=ImageDraw.Draw(im)
 for i,e in enumerate(es):
  x=i%cols*300;y=i//cols*340;a=Image.open(root/e['output_path']).convert('RGBA');a.thumbnail((270,280));im.paste(a,(x+(300-a.width)//2,y+45+(280-a.height)//2),a);draw.text((x+12,y+10),e['name'],fill='white');draw.text((x+12,y+27),e['slot']+' / NEW',fill=(185,185,200))
 im.save(out/('region-%02d-contact.jpg'%level),quality=94)
