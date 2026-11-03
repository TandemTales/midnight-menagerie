import json,csv,hashlib,importlib.util,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
def info(p):
 im=Image.open(p); im.load(); a=im.convert('RGBA').getchannel('A'); h=a.histogram(); solid=a.point(lambda x:255 if x>=64 else 0)
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'visible_bbox_alpha64':solid.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def write(m):
 m['counts']={s:sum(e['status']==s for e in m['entries']) for s in ['existing','new','pending','blocked']};m['counts']['total']=len(m['entries'])
 tmp=out/'coverage-manifest.json.tmp';tmp.write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8');tmp.replace(out/'coverage-manifest.json')
 with (out/'coverage-manifest.csv').open('w',newline='',encoding='utf-8-sig') as f:
  fields=['level','region','slot','tier','name','production_id','status','source_path','output_path','blocker']; w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(m['entries'])
def finalize(id,rawid,review):
 m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'));e=next(e for e in m['entries'] if e['production_id']==id)
 assert e['level']<=5 and e['status']=='pending','Only root owned pending levels 1-5'
 src=root/e['source_path'];dst=root/e['output_path'];rawpath=out/(rawid+'-original.png')
 assert not src.exists() and not dst.exists(),'Refuse overwrite'
 r=info(rawpath);bb=r['visible_bbox_alpha64'];w,h=r['size']; assert r['transparent_pixels']>0 and bb and 0<bb[0]<bb[2]<w and 0<bb[1]<bb[3]<h, str(r)
 side={'regular':256,'elite':512,'boss':1024}[e['tier']];raw=Image.open(rawpath).convert('RGBA');raw.thumbnail((side,side),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(side,side));canvas.alpha_composite(raw,((side-raw.width)//2,(side-raw.height)//2));canvas.save(src)
 spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')))
 d=info(dst);assert d['format']=='WEBP' and d['mode']=='RGBA' and d['transparent_pixels']>0
 e.update(status='new',validation={'technical':d,'source':info(src),'original':r,'original_path':str(rawpath.relative_to(root)),'visual':review,'conversion':'Tier-size source, isolated build_enemy_still; no registry integration','runtime_metadata':meta},blocker=None);write(m);print(id,d['size'],m['counts'])
def contact(level):
 m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8')); es=[e for e in m['entries'] if e['level']==level];ready=[e for e in es if e['status'] in ['existing','new']]; cols=4; rows=(len(ready)+3)//4; im=Image.new('RGB',(1200,rows*340),(36,37,48));d=ImageDraw.Draw(im)
 for i,e in enumerate(ready):
  x=i%4*300;y=i//4*340;a=Image.open(root/e['output_path']).convert('RGBA');a.thumbnail((270,280));im.paste(a,(x+(300-a.width)//2,y+45+(280-a.height)//2),a);d.text((x+12,y+10),e['name'],fill='white');d.text((x+12,y+26),e['status'].upper()+' / '+e['slot'],fill=(185,185,200))
 im.save(out/f'region-{level:02d}-contact.jpg',quality=94);(out/f'region-{level:02d}-results.json').write_text(json.dumps({'level':level,'entries':es},indent=2,ensure_ascii=False),encoding='utf-8');print('region',level,'covered',len(ready),'of',len(es))
if __name__=='__main__':
 if sys.argv[1]=='finalize':finalize(*sys.argv[2:5])
 elif sys.argv[1]=='contact':contact(int(sys.argv[2]))
