from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
a=root/'game/assets/ui/r51-spinel'
im=Image.open(a/'alcove-source-v1.png').convert('RGB')
im.save(a/'alcove-v1.webp',quality=89,method=6)
im.crop((24,1180,1000,1300)).save(a/'shelf-v1.webp',quality=89,method=6)
print(sum(p.stat().st_size for p in a.iterdir()),'asset bytes')
