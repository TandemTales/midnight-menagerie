from pathlib import Path
from PIL import Image,ImageOps,ImageEnhance,ImageFilter
out=Path('game/assets/ui/r54-peridot');out.mkdir(parents=True,exist_ok=True)
# Existing hand-painted material, remapped at glyph scale. No generated or baked text.
cloth=Image.open('game/assets/ui/r50-garnet/quiet-velvet-v1.webp').convert('RGB')
gray=ImageOps.autocontrast(ImageOps.grayscale(cloth),cutoff=2)
paint=ImageOps.colorize(gray,'#55366e','#efd9ed').resize((256,230),Image.Resampling.LANCZOS)
paint=ImageEnhance.Contrast(paint).enhance(1.24)
paint.save(out/'lavender-paint-v1.webp',quality=95)
# Reuse real carved walnut. A mirrored grain tile guarantees identical joining pixels.
wood=Image.open('game/assets/ui/r50-garnet/walnut-lip-v1.webp').convert('RGBA')
piece=wood.crop((530,0,714,90));tile=Image.new('RGBA',(368,90));tile.paste(piece,(0,0));tile.paste(ImageOps.mirror(piece),(184,0));tile.save(out/'wood-rail-v1.webp',quality=95)
# Preserve silhouette alpha and small gold curls; modulate brass with cloth-derived wear.
plate=Image.open('game/assets/ui/r53-fluorite/velvet-cartouche-v1.webp').convert('RGBA')
tex=gray.resize(plate.size,Image.Resampling.LANCZOS)
for y in range(plate.height):
 for x in range(plate.width):
  r,g,b,a=plate.getpixel((x,y));v=tex.getpixel((x,y))/255
  if a and r>g*1.1 and g>b*1.08:
   k=.80+.42*v+.12*(1-y/plate.height)*(1-x/plate.width)
   plate.putpixel((x,y),(min(255,int(r*k)),min(255,int(g*k)),min(255,int(b*k)),a))
  elif a and max(r,g,b)<95:
   k=.76+.25*v
   plate.putpixel((x,y),(int(r*k),int(g*k),int(b*k),a))
plate.save(out/'worn-plaque-v1.webp',quality=95)
print(sum(p.stat().st_size for p in out.iterdir()),'asset bytes')
