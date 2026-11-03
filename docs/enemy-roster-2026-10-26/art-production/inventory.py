import json,re,hashlib,csv
from pathlib import Path
from PIL import Image,ImageDraw
root=Path.cwd()
out=root/'docs/enemy-roster-2026-10-26/art-production'
r=json.loads((out.parent/'enemy-roster-google-export.json').read_text(encoding='utf-8'))
def slug(s): return re.sub(r'[^a-z0-9]+','-',re.sub(r'^The ','',s).lower()).strip('-')
def info(p):
 im=Image.open(p); im.load(); a=im.convert('RGBA').getchannel('A'); h=a.histogram()
 return {'format':im.format,'size':list(im.size),'mode':im.mode,'transparent_pixels':h[0],'partial_alpha_pixels':sum(h[1:255]),'alpha_bbox':a.getbbox(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
stills={p.stem:p for p in (root/'game/assets/sprites/enemies').glob('*.webp')}
source_alias={'wardrobe':'the-wardrobe','prim':'porcelain-twin-prim','proper':'porcelain-twin-proper','sporepuff':'spore-puff'}
sources={source_alias.get(p.stem,re.sub(r'(?<=[a-z0-9])(?=[A-Z])','-',p.stem).lower()):p for p in (root/'animations/sprites/enemies').glob('*.png')}
assert not (out/'preserved-files-sha256.json').exists(), 'Initial inventory already saved; do not overwrite production progress'
entries=[]
for e in r['entries']:
 id=e.get('asset_id',slug(e['name'])); p=stills.get(id); src=sources.get(id)
 row={**e,'production_id':id,'status':'existing' if p else 'pending','output_path':str(p.relative_to(root)) if p else 'game\\assets\\sprites\\enemies\\'+id+'.webp','source_path':str(src.relative_to(root)) if src else 'animations\\sprites\\enemies\\'+id.split('-')[0]+''.join(x.title() for x in id.split('-')[1:])+'.png','validation':info(p) if p else None,'blocker':None}
 entries.append(row)
(out/'coverage-manifest.json').write_text(json.dumps({'total':187,'entries':entries},indent=2,ensure_ascii=False),encoding='utf-8')
assets=[p for folder in ['animations/sprites/enemies','game/assets/sprites/enemies','game/assets/sprites/enemy-clips'] for p in (root/folder).rglob('*') if p.is_file()]
(out/'preserved-files-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in assets},indent=2),encoding='utf-8')
(out/'current-still-inspection.json').write_text(json.dumps({id:{'path':str(p.relative_to(root)),**info(p)} for id,p in stills.items()},indent=2),encoding='utf-8')
matched={e['production_id'] for e in entries if e['status']=='existing'}
(out/'unmatched-existing-art.json').write_text(json.dumps([{'id':id,'path':str(p.relative_to(root)),'reason':'No matching approved roster identity; preserve unchanged. Similar object names do not establish design equivalence.'} for id,p in stills.items() if id not in matched],indent=2),encoding='utf-8')
print(json.dumps({'roster':len(entries),'existing':len(matched),'pending':187-len(matched),'animated':sum(e['existing_animation'] for e in entries),'preserved_files':len(assets),'unmatched_existing':sorted(set(stills)-matched)}))
