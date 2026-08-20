"""Copy + optimize source art into game/assets."""
from PIL import Image
import os, shutil, json

os.makedirs("game/assets/blueprint", exist_ok=True)
os.makedirs("game/assets/hero", exist_ok=True)
os.makedirs("game/assets/audio", exist_ok=True)

# Blueprint master + 17 region sections
for src, dst in [("art/blueprint.png", "game/assets/blueprint/mansion.png")]:
    Image.open(src).convert("RGBA").save(dst, optimize=True)
for i in range(1, 18):
    s = f"art/section{i:02d}.png"
    if os.path.exists(s):
        Image.open(s).convert("RGBA").save(f"game/assets/blueprint/section{i:02d}.png", optimize=True)

# Hero portraits (full-res, downscaled to 768)
for n in ["bones", "pipkin", "taffy"]:
    s = f"art/portrait_{n}.png"
    if os.path.exists(s):
        im = Image.open(s).convert("RGB")
        im.thumbnail((768, 768), Image.LANCZOS)
        im.save(f"game/assets/hero/{n}.jpg", quality=88, optimize=True)

# Audio
for f in sorted(os.listdir("audio")):
    if f.lower().endswith(".mp3"):
        n = f.replace("MM soundtrack ", "track").replace(" ", "_")
        shutil.copy(f"audio/{f}", f"game/assets/audio/{n}")

print("blueprint:", len(os.listdir("game/assets/blueprint")))
print("hero:", os.listdir("game/assets/hero"))
print("audio:", sorted(os.listdir("game/assets/audio")))
