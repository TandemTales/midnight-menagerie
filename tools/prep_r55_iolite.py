"""Prepare IOLITE art: alpha-preserving imagegen export and native code pillow."""
import hashlib,json
from pathlib import Path
from PIL import Image
from prep_ui_hardware import Pic,R,E
out=Path('game/assets/ui/r55-iolite')
src=out/'plaque-generated-original.png'
im=Image.open(src).convert('RGBA')
assert im.getextrema()[3][0]==0 and im.getextrema()[3][1]==255
# Remove generated transparent margin only, preserving every alpha edge.
bounds=im.getchannel('A').getbbox();im=im.crop(bounds)
im.resize((240,64),Image.Resampling.LANCZOS).save(out/'enamel-plaque.webp',quality=96,method=6)
# Native icon family: preserve Pic/pillow profile, adding fitted fold strokes and cloth seams.
p=Pic(seed=155)
soft=('#42334f','#ab98b2','#e1d1dc')
p.part(R(10,30,86,70,16),soft,prof='pillow',bevel=16,gloss=.02,power=10)
for x,y in ((12,38),(84,38),(86,60),(10,60)):
 p.part(E(x,y,5,4),soft,prof='sphere',gloss=.01,shadow=.25)
for points in [[(15,37),(24,41),(31,47)],[(80,36),(71,41),(65,47)],[(15,61),(25,57),(32,53)],[(82,62),(72,57),(65,53)]]:
 p.ink(points,w=1.5,color='#59415e',alpha=.65)
 p.ink([(x,y-1.6) for x,y in points],w=.8,color='#e4cfcf',alpha=.7)
p.ink([(24,50),(40,48),(48,50),(57,49),(72,50)],w=.8,color='#6f5479',alpha=.6)
for x in range(23,76,6):
 p.ink([(x,34),(x+2,34.6)],w=.65,color='#d4bbbd',alpha=.65)
 p.ink([(x,66),(x+2,65.6)],w=.65,color='#79647c',alpha=.6)
p.part(E(48,50,2.8),('#261a32','#735784','#bba2bd'),prof='sphere',gloss=.08,shadow=.3)
Image.fromarray(p.result().astype('uint8'),'RGBA').save(out/'pillow-folds.webp',quality=95,method=6)
files=[{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in out.iterdir() if f.suffix in ['.png','.webp']]
meta={'mode':'built-in image_gen precise-object-edit','promptFile':'prompt.txt','sourceRoles':[{'role':'edit target','path':'game/assets/ui/r54-peridot/worn-plaque-v1.webp','sha256':hashlib.sha256(Path('game/assets/ui/r54-peridot/worn-plaque-v1.webp').read_bytes()).hexdigest()}],'generatedOriginal':str(src),'generatedAlphaBBox':bounds,'preparation':'Run python tools/prep_r55_iolite.py. Crop transparent margin, Lanczos resize to240x64 and WebP quality96 preserving alpha. No creative bitmap reconstruction. Pillow is native Pic procedural icon with localized folds/seams; rail-wood copied unchanged permitted Round54 MORGANITE.','files':files}
(out/'provenance.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
assert sum(f['bytes'] for f in files)<8000000
print(files)
