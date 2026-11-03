from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
records=[]
for base in ['animations/sprites/enemies','game/assets/sprites/enemies','game/assets/sprites/enemy-clips']:
    for p in sorted((ROOT/base).rglob('*')):
        if p.suffix.lower() not in ['.png','.webp']: continue
        with Image.open(p) as im:
            alpha=im.convert('RGBA').getchannel('A'); hist=alpha.histogram()
            records.append(dict(path=p.relative_to(ROOT).as_posix(),size=list(im.size),mode=im.mode,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),transparent_pixels=hist[0],opaque_pixels=hist[255],partial_alpha_pixels=sum(hist[1:255])))
(OUT/'active-image-evidence.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
stills=sorted((ROOT/'animations/sprites/enemies').glob('*.png'))
for page in range((len(stills)+17)//18):
    subset=stills[page*18:page*18+18]; contact=Image.new('RGB',(1200,6*210),(36,37,46)); d=ImageDraw.Draw(contact)
    for i,p in enumerate(subset):
        x=(i%3)*400;y=(i//3)*210
        im=Image.open(p).convert('RGBA'); im.thumbnail((385,178))
        contact.paste(im,(x+(400-im.width)//2,y+25+(178-im.height)//2),im)
        d.text((x+10,y+5),p.name,fill='white')
    contact.save(OUT/f'active-stills-{page+1}.jpg')
clips=sorted((ROOT/'game/assets/sprites/enemy-clips').glob('*/index.json'))
for page in range((len(clips)+9)//10):
    subset=clips[page*10:page*10+10]; contact=Image.new('RGB',(1200,len(subset)*190),(36,37,46)); d=ImageDraw.Draw(contact)
    for i,p in enumerate(subset):
        meta=json.loads(p.read_text()); d.text((10,i*190+4),p.parent.name,fill='white')
        for j,(action,frac) in enumerate([('idle',0),('idle',.5),('attack',.5),('defeat',.8)]):
            c=meta['clips'][action]; im=Image.open(p.parent/c['file']); frame=int((c['frames']-1)*frac); col=frame%c['cols']; row=frame//c['cols']
            crop=im.crop((col*c['fw'],row*c['fh'],(col+1)*c['fw'],(row+1)*c['fh'])).convert('RGBA'); crop.thumbnail((285,160)); contact.paste(crop,(j*300+(300-crop.width)//2,i*190+25+(160-crop.height)//2),crop)
    contact.save(OUT/f'active-sheets-samples-{page+1}.jpg')
print(json.dumps({'images':len(records),'stills':len(stills),'animated_identities':len(clips)}))
