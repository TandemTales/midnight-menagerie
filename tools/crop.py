"""Crop a rectangle out of a capture, optionally magnified, for looking at one
object at the size it renders.  This round's only honest instrument is the eye,
and the eye needs the pixels at 1:1 and at 2x.

    python tools/crop.py shots/base-room-ballroom.png out.png 380 300 320 220 --zoom 2
"""
import sys, argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('x', type=int); ap.add_argument('y', type=int)
ap.add_argument('w', type=int); ap.add_argument('h', type=int)
ap.add_argument('--zoom', type=float, default=1.0)
a = ap.parse_args()
im = Image.open(a.src).convert('RGB')
box = (max(a.x, 0), max(a.y, 0), min(a.x + a.w, im.width), min(a.y + a.h, im.height))
c = im.crop(box)
if a.zoom != 1.0:
    c = c.resize((int(c.width * a.zoom), int(c.height * a.zoom)), Image.NEAREST)
c.save(a.dst)
print(a.dst, c.size)
