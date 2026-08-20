"""Slice the 4x4 companion sheet into clean art crops (no frame, no nameplate)."""
from PIL import Image
import os, json

SHEET = "UI/selectCompanion.png"
OUT = "game/assets/portraits"
os.makedirs(OUT, exist_ok=True)

NAMES = [
    ["marmalade", "wisp", "crumbula", "boggle"],
    ["bones", "pipkin", "taffy", "truffle"],
    ["hush", "mopsy", "drizzle", "pudding"],
    ["wink", "crinkle", "mossbit", "brambleboo"],
]

im = Image.open(SHEET).convert("RGBA")

TOP, LEFT = 188, 18
CELL_W, CELL_H = 306, 251
INSET_X, INSET_TOP, PLATE_H = 15, 15, 64   # trim gold frame + bottom nameplate

meta = {}
for r, row in enumerate(NAMES):
    for c, name in enumerate(row):
        x = int(LEFT + c * 306.5)
        y = int(TOP + r * CELL_H)
        box = (x + INSET_X, y + INSET_TOP, x + CELL_W - INSET_X, y + CELL_H - PLATE_H)
        cell = im.crop(box)
        cell = cell.resize((cell.width * 3, cell.height * 3), Image.LANCZOS)
        cell.save(f"{OUT}/{name}.png")
        meta[name] = {"row": r, "col": c, "w": cell.width, "h": cell.height}

json.dump(meta, open(f"{OUT}/index.json", "w"), indent=1)
print("sliced", len(meta), "portraits at", cell.size)
