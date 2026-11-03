from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'game/assets/ui/r49-ruby'
for name in ('fort','lectern'):
    image=Image.open(root/f'{name}-source-v1.png').convert('RGBA')
    assert image.getchannel('A').getextrema()[0]==0, 'Transparency required'
    image.thumbnail((1280,1100), Image.Resampling.LANCZOS)
    image.save(root/f'{name}-v1.webp',quality=90,method=6,exact=True)
    print(name,image.size,'alpha',image.getchannel('A').getextrema())
print('total bytes',sum(p.stat().st_size for p in root.iterdir()))

# Keep the connected desk and its carved foot as two scalable painted pieces.
image=Image.open(root/'lectern-source-v1.png').convert('RGBA')
w,h=image.size
for name,box in [('lectern-desk',(0,0,w,round(h*.56))),('lectern-foot',(round(w*.18),round(h*.52),round(w*.82),h))]:
    part=image.crop(box); part.thumbnail((1280,900),Image.Resampling.LANCZOS)
    part.save(root/f'{name}-v1.webp',quality=90,method=6,exact=True)
