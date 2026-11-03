"""Deterministic crop/export only. Never repaint generated bitmap pixels."""
from pathlib import Path
import hashlib,json
from PIL import Image
a=Path('game/assets/ui/r56-onyx')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
meta={'mode':'built-in image_gen precise-object-edit','transparent_background':True,'sources':[],'exports':[]}
for f in ['game/assets/ui/r55-iolite/pillow-folds.webp','game/assets/ui/objects/whetstone.webp','game/assets/ui/objects/forge-candle.webp','game/assets/ui/r55-iolite/enamel-plaque.webp']:
 p=Path(f);meta['sources'].append({'role':'inspected edit target','path':f,'sha256':sha(p)})
im=Image.open(a/'rest-original.png').convert('RGBA');w,h=im.size
# Three independently generated objects; separators verified visually. Preserve all alpha within each cell.
for name,box,target in [('pillow',(0,0,840,h),(88,52)),('whetstone',(840,0,1660,h),(88,61)),('candle',(1660,0,w,h),(52,86))]:
 cell=im.crop(box);raw=cell.getchannel('A').getbbox();edge=cell.getchannel('A').point(lambda v:255 if v>=8 else 0).getbbox();bb=(max(0,edge[0]-2),max(0,edge[1]-2),min(cell.width,edge[2]+2),min(cell.height,edge[3]+2));assert bb
 obj=cell.crop(bb);obj.thumbnail((target[0]*3,target[1]*3),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',(288,288));offset=((288-obj.width)//2,(288-obj.height)//2)
 canvas.alpha_composite(obj,offset);out=a/(name+'.webp');canvas.save(out,quality=97,method=6)
 meta['exports'].append({'name':name,'cell':box,'rawAlphaBBoxInCell':raw,'alpha8BBox':edge,'cropWith2pxEdge':bb,'fitPixels':target,'exportPixels':[288,288],'offset':offset,'resizedObject':obj.size})
im=Image.open(a/'plaque-original.png').convert('RGBA');assert im.getextrema()[3]==(0,255)
raw=im.getchannel('A').getbbox();edge=im.getchannel('A').point(lambda v:255 if v>=8 else 0).getbbox();bb=(edge[0]-2,edge[1]-2,edge[2]+2,edge[3]+2);im.crop(bb).resize((240,64),Image.Resampling.LANCZOS).save(a/'enamel-plaque.webp',quality=97,method=6)
meta['exports'].append({'name':'enamel-plaque','rawAlphaBBox':raw,'alpha8BBox':edge,'cropWith2pxEdge':bb,'exportPixels':[240,64],'nineSlice':'18 34 18 34 fill / 6px 8px for conditions; existing dimensions unchanged'})
meta['preparation']='Crop separated cells and alpha1-7 fringe outside alpha8 support plus2px edge; all retained alpha unmodified; Lanczos fit, transparent padding and WebP quality97. No creative pixel reconstruction.'
meta['files']=[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in a.iterdir() if p.suffix in ['.png','.webp']]
meta['bitmapBytes']=sum(p['bytes'] for p in meta['files']);assert meta['bitmapBytes']<8000000
(a/'provenance.json').write_text(json.dumps(meta,indent=2),encoding='utf-8');print(json.dumps(meta,indent=2))
