from pathlib import Path
from PIL import Image,ImageOps,ImageEnhance
root=Path('.'); out=root/'game/assets/ui/r53-fluorite';out.mkdir(parents=True,exist_ok=True)
# Deterministic crops of existing painted materials, no generated text.
cloth=Image.open(root/'game/assets/ui/r50-garnet/quiet-velvet-v1.webp').convert('RGB')
gray=ImageOps.autocontrast(ImageOps.grayscale(cloth),cutoff=2)
paint=ImageOps.colorize(gray,'#775595','#e8d2ee').resize((320,288),Image.Resampling.LANCZOS)
paint.save(out/'lavender-paint-v1.webp',quality=94)
shelf=Image.open(root/'game/assets/ui/r51-spinel/shelf-v1.webp').convert('RGBA')
for name,box in [('rail-left-v1',(0,0,132,120)),('rail-right-v1',(844,0,976,120)),('rail-center-v1',(392,0,584,120)),('rail-grain-v1',(210,0,390,45))]:
 piece=shelf.crop(box)
 if name=='rail-grain-v1':
  tile=Image.new('RGBA',(piece.width*2,piece.height));tile.paste(piece,(0,0));tile.paste(ImageOps.mirror(piece),(piece.width,0));piece=tile
 elif name=='rail-center-v1':
  piece=piece.crop((0,40,piece.width,120))
  for y in range(piece.height):
   for x in range(piece.width):
    r,g,b,a=piece.getpixel((x,y));edge=min(1,x/25,(piece.width-1-x)/25);ink=min(1,max(0,(max(r,g,b)-15)/35));piece.putpixel((x,y),(r,g,b,int(a*edge*ink)))
 else:
  for y in range(piece.height):
   for x in range(piece.width):
    r,g,b,a=piece.getpixel((x,y));edge=min(1,(piece.width-1-x)/26) if name=='rail-left-v1' else min(1,x/26);piece.putpixel((x,y),(r,g,b,int(a*edge)))
 piece.save(out/(name+'.webp'),quality=94)
# Repaint only the dark interior of the existing brass silhouette, retaining its alpha.
plate=Image.open(root/'game/assets/ui/kit/cartouche-dark.webp').convert('RGBA')
tex=ImageOps.colorize(gray,'#17101f','#43304d').resize(plate.size,Image.Resampling.LANCZOS)
for y in range(plate.height):
 for x in range(plate.width):
  r,g,b,a=plate.getpixel((x,y))
  if a and max(r,g,b)<71 and b>=r*.8:
   nr,ng,nb=tex.getpixel((x,y));plate.putpixel((x,y),(nr,ng,nb,a))
  elif a and r>g and g>b:
   # Patina only the brass backing, with a small upper-left candle reflection.
   light=.73+.15*(1-x/plate.width)*(1-y/plate.height)
   plate.putpixel((x,y),(int(r*light),int(g*light),int(b*light),a))
plate.save(out/'velvet-cartouche-v1.webp',quality=94)
print('Material bytes',sum(p.stat().st_size for p in out.iterdir()))
