from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
assets = root / 'game/assets/ui/r50-garnet'
im = Image.open(assets / 'velvet-source-v1.png').convert('RGB')
im.save(assets / 'velvet-v1.webp', quality=89, method=6)
# The generator's quiet central velvet and carved apron are painted material,
# deliberately prepared as quiet reading panels and continuous supporting lips.
im.crop((470,210,1040,720)).resize((570,510)).save(assets / 'quiet-velvet-v1.webp', quality=88, method=6)
im.crop((0,880,1536,1024)).save(assets / 'walnut-lip-v1.webp', quality=90, method=6)
print(sum(p.stat().st_size for p in assets.iterdir()), 'asset bytes')
