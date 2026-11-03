import argparse,json,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
ap=argparse.ArgumentParser();ap.add_argument('id');ap.add_argument('--raw-id');ap.add_argument('--review',required=True);args=ap.parse_args()
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'));entry=next(e for e in m['entries'] if e['production_id']==args.id);assert entry['level'] in [12,13]
path=out/f"region-{entry['level']:02d}-results.json"
r=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'level':entry['level'],'entries':[e for e in m['entries'] if e['level']==entry['level']]}
e=next(e for e in r['entries'] if e['production_id']==args.id);assert e['status']=='pending','Do not redo accepted sprite'
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();bb=a.point(lambda x:255 if x>=64 else 0).getbbox()
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'visible_bbox_alpha64':bb,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
rawpath=out/((args.raw_id or args.id)+'-original.png');raw=Image.open(rawpath).convert('RGBA');ri=info(rawpath);bb=ri['visible_bbox_alpha64'];w,h=raw.size
assert ri['transparent_pixels']>0 and bb and bb[0]>0 and bb[1]>0 and bb[2]<w and bb[3]<h, 'Visible content touches border or missing alpha'
# Non-square generator output is contained without stretching.
src=root/e['source_path'];dst=root/e['output_path'];assert not src.exists() and not dst.exists(),'Refuse existing final paths'
side={'regular':256,'elite':512,'boss':1024}[e['tier']];raw.thumbnail((side,side),Image.Resampling.LANCZOS); canvas=Image.new('RGBA',(side,side),(0,0,0,0)); canvas.alpha_composite(raw,((side-raw.width)//2,(side-raw.height)//2)); canvas.save(src)
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')))
di=info(dst);assert di['format']=='WEBP' and di['mode']=='RGBA' and di['transparent_pixels']>0
e.update(status='new',blocker=None,validation={'technical':di,'source':info(src),'original':ri,'original_path':str(rawpath.relative_to(root)),'visual':args.review,'runtime_metadata':meta,'conversion':'Tier-size square PNG source, isolated existing build_enemy_still conversion; no game registry updates.'})
r['counts']={s:sum(e['status']==s for e in r['entries']) for s in ['existing','new','pending','blocked']};r['counts']['total']=len(r['entries'])
tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(r,indent=2,ensure_ascii=False),encoding='utf-8');tmp.replace(path)
es=[e for e in r['entries'] if e['status'] in ['new','existing']];cols=4;rows=(len(es)+cols-1)//cols;canvas=Image.new('RGB',(cols*300,max(1,rows)*340),(36,37,48));d=ImageDraw.Draw(canvas)
for i,e in enumerate(es):
 x=(i%cols)*300;y=(i//cols)*340;im=Image.open(root/e['output_path']).convert('RGBA');im.thumbnail((270,280));canvas.paste(im,(x+(300-im.width)//2,y+45+(280-im.height)//2),im);d.text((x+10,y+10),e['name'],fill='white');d.text((x+10,y+26),e['slot']+' / '+e['status'],fill=(190,190,200))
canvas.save(out/f"region-{entry['level']:02d}-contact.jpg",quality=94)
print(json.dumps({'id':args.id,'dimensions':di['size'],'region_counts':r['counts']}))
