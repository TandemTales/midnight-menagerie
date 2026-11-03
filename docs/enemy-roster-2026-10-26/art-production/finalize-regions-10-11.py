import json,hashlib,importlib.util,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
root=Path.cwd();out=root/'docs/enemy-roster-2026-10-26/art-production'
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();solid=a.point(lambda x:255 if x>=64 else 0)
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'visible_bbox_alpha64':solid.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
for level in [10,11]:
 p=out/f'region-{level:02}-results.json'
 if not p.exists():p.write_text(json.dumps({'region':level,'entries':[e for e in m['entries'] if e['level']==level]},indent=2),encoding='utf-8')
if len(sys.argv)>1:
 id=sys.argv[1];rawid=sys.argv[2];review=sys.argv[3]
 level=next(e['level'] for e in m['entries'] if e['production_id']==id);p=out/f'region-{level:02}-results.json';res=json.loads(p.read_text(encoding='utf-8'));e=next(e for e in res['entries'] if e['production_id']==id)
 assert e['status']=='pending','Already finalized'
 src=root/e['source_path'];dst=root/e['output_path'];original=out/(rawid+'-original.png')
 assert not src.exists() and not dst.exists(),'Refuse overwrite'
 raw=Image.open(original).convert('RGBA');di=info(original);bb=di['visible_bbox_alpha64'];w,h=raw.size
 assert di['transparent_pixels']>0 and bb and 0<bb[0]<bb[2]<w and 0<bb[1]<bb[3]<h,'Missing alpha or clipped solid content'
 side={'regular':256,'elite':512,'boss':1024}[e['tier']];scaled=ImageOps.contain(raw,(side,side),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(side,side));canvas.paste(scaled,((side-scaled.width)//2,(side-scaled.height)//2));canvas.save(src)
 spec=importlib.util.spec_from_file_location('prep',root/'tools/prep_sprites.py');prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep);meta=prep.build_enemy_still(str(src),str(dst.with_suffix('')))
 oi=info(dst);assert oi['format']=='WEBP' and oi['mode']=='RGBA' and oi['transparent_pixels']>0
 e.update(status='new',validation={'technical':oi,'source':info(src),'original':di,'original_path':str(original.relative_to(root)),'visual':review,'runtime_metadata':meta,'workflow':'Built-in imagegen; PNG tier-sized using Lanczos; existing isolated build_enemy_still; no registry changes.'},blocker=None)
 res['counts']={s:sum(e['status']==s for e in res['entries']) for s in ['existing','new','pending','blocked']};p.write_text(json.dumps(res,indent=2),encoding='utf-8');print(id,oi['size'])
for level in [10,11]:
 res=json.loads((out/f'region-{level:02}-results.json').read_text(encoding='utf-8'));es=[e for e in res['entries'] if e['status']=='new']
 if not es:continue
 preview=Image.new('RGB',(1200,340*((len(es)+3)//4)),(36,37,48));d=ImageDraw.Draw(preview)
 for i,e in enumerate(es):
  x=(i%4)*300;y=(i//4)*340;im=Image.open(root/e['output_path']).convert('RGBA');im.thumbnail((270,280));preview.paste(im,(x+(300-im.width)//2,y+45+(280-im.height)//2),im);d.text((x+12,y+12),e['name'],fill='white');d.text((x+12,y+28),e['slot'],fill=(190,190,200))
 preview.save(out/f'region-{level:02}-contact.jpg',quality=94)
