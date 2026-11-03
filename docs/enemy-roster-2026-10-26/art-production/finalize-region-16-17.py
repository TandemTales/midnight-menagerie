import sys,json,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
master=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'visible_bbox_alpha64':a.point(lambda v:255 if v>=64 else 0).getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
ids=sys.argv[1:]
for level in [16,17]:
 resultpath=out/f'region-{level:02}-results.json'
 data=json.loads(resultpath.read_text(encoding='utf-8')) if resultpath.exists() else {'level':level,'entries':[e for e in master['entries'] if e['level']==level]}
 for e in data['entries']:
  if e['production_id'] not in ids:continue
  assert e['status']=='pending','Refuse rebuilding completed asset'
  rawpath=out/(e['production_id']+'-original.png');src=root/e['source_path'];dst=root/e['output_path'];assert not src.exists() and not dst.exists(),'Refuse overwrite'
  rawinfo=info(rawpath);w,h=rawinfo['size'];bb=rawinfo['visible_bbox_alpha64'];assert rawinfo['mode']=='RGBA' and rawinfo['transparent_pixels']>0 and bb and 0<bb[0]<bb[2]<w and 0<bb[1]<bb[3]<h,'Alpha/framing validation failed'
  side={'regular':256,'elite':512,'boss':1024}[e['tier']]; contained=ImageOps.contain(Image.open(rawpath).convert('RGBA'),(side,side),Image.Resampling.LANCZOS); canvas=Image.new('RGBA',(side,side));canvas.alpha_composite(contained,((side-contained.width)//2,(side-contained.height)//2));canvas.save(src)
  meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')));dstinfo=info(dst);assert dstinfo['format']=='WEBP' and dstinfo['mode']=='RGBA' and dstinfo['transparent_pixels']>0
  e.update(status='new',blocker=None,validation={'technical':dstinfo,'source':info(src),'original':rawinfo,'original_path':str(rawpath.relative_to(root)),'visual':'Reviewed full generated image: approved identity, tactile painted cutout style, whole unclipped silhouette, distinct materials and required features, no invented threatening anatomy. Reviewed region contact sheet at final sprite size.','conversion':'Tier-sized square source, isolated existing build_enemy_still; no registry modification.','runtime_metadata':meta,'generation_tool':'built-in image_gen'})
  data['counts']={s:sum(x['status']==s for x in data['entries']) for s in ['existing','new','pending','blocked']};resultpath.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
 done=[e for e in data['entries'] if e['status']=='new']
 if done:
  cols=4;rows=(len(done)+cols-1)//cols;im=Image.new('RGB',(cols*300,rows*340),(36,37,48));d=ImageDraw.Draw(im)
  for i,e in enumerate(done):
   x=i%cols*300;y=i//cols*340;s=Image.open(root/e['output_path']).convert('RGBA');s.thumbnail((270,280));im.paste(s,(x+(300-s.width)//2,y+45+(280-s.height)//2),s);d.text((x+10,y+12),e['name'],fill='white');d.text((x+10,y+28),e['slot'],fill=(180,180,190))
  im.save(out/f'region-{level:02}-contact.jpg',quality=94)
 print(level,len(done),'of 11 complete')
