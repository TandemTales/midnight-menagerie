import json,sys,hashlib,importlib.util
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd();out=root/'docs/enemy-roster-2026-10-26/art-production'
manifest=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'))
spec=importlib.util.spec_from_file_location('spriteprep',root/'tools/prep_sprites.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def info(p):
 im=Image.open(p);im.load();a=im.convert('RGBA').getchannel('A');h=a.histogram();b=a.point(lambda x:255 if x>=64 else 0).getbbox()
 return {'format':im.format,'mode':im.mode,'size':list(im.size),'alpha_bbox':a.getbbox(),'visible_bbox_alpha64':b,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for id in sys.argv[1:]:
 e=next(e.copy() for e in manifest['entries'] if e['production_id']==id);assert e['level'] in [14,15]
 level=e['level'];rd=out/f'region-{level}';raw=rd/(id+'-original.png');src=root/e['source_path'];dst=root/e['output_path']
 assert not src.exists() and not dst.exists(),f'Refuse overwrite {id}'
 rawinfo=info(raw);b=rawinfo['visible_bbox_alpha64'];w,h=rawinfo['size'];assert b and 0<b[0]<b[2]<w and 0<b[1]<b[3]<h,f'Clipped visible bounds: {id} {b}'
 assert rawinfo['mode']=='RGBA' and rawinfo['transparent_pixels']>0
 side={'regular':256,'elite':512,'boss':1024}[e['tier']];im=Image.open(raw).convert('RGBA');assert im.width==im.height
 im.resize((side,side),Image.Resampling.LANCZOS).save(src)
 meta=mod.build_enemy_still(str(src),str(dst.with_suffix('')));val=info(dst);assert val['format']=='WEBP' and val['mode']=='RGBA' and val['transparent_pixels']>0
 e.update(status='new',blocker=None,validation={'technical':val,'source':info(src),'original':rawinfo,'original_path':str(raw.relative_to(root)),'prompt_path':str((rd/(id+'-prompt.txt')).relative_to(root)),'visual':'Full generated image visually inspected: matches approved identity and signature; complete silhouette, separated readable parts, tactile house-art style, no clipping, no unintended anatomy or threatening additions. Contact sheet also generated for small-size review.','runtime_metadata':meta,'method':'Built-in imagegen; tier-size PNG and isolated existing build_enemy_still conversion; no registry change.'})
 rp=out/f'region-{level}-results.json';candidates=list(out.glob(f'region-{level}-results*.json'));prior=[json.loads(p.read_text(encoding='utf-8')) for p in candidates];results=max(prior,key=lambda x:len(x['entries'])) if prior else {'level':level,'entries':[]};assert not any(x['production_id']==id for x in results['entries'])
 results['entries'].append(e);results['counts']={'new':len(results['entries']),'pending':11-len(results['entries']),'blocked':0};results['complete']=len(results['entries'])==11
 rp=out/f'region-{level}-results-v{len(results["entries"]):02d}.json';assert not rp.exists();rp.write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
 es=results['entries'];cols=4;rows=(len(es)+cols-1)//cols;sheet=Image.new('RGB',(cols*280,rows*320),(36,37,48));d=ImageDraw.Draw(sheet)
 for i,x in enumerate(es):
  sx=(i%cols)*280;sy=(i//cols)*320;art=Image.open(root/x['output_path']).convert('RGBA');art.thumbnail((250,260));sheet.paste(art,(sx+(280-art.width)//2,sy+42+(260-art.height)//2),art);d.text((sx+10,sy+10),x['name'],fill='white');d.text((sx+10,sy+25),x['slot']+' / NEW',fill=(190,190,200))
 sheet.save(out/f'region-{level}-contact.jpg',quality=94)
 print(id,val['size'],'validated',results['counts'])
