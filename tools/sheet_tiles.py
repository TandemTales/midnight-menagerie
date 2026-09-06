"""Cut a contact sheet into its tiles.

A gutter line is UNIFORM along its whole length; artwork is not. That is the
discriminator, and it has to be -- keying on the gutter's COLOUR merges every
tile on `marmalade_cards81onB`, whose gutters are thin and whose art is
near-black, into one blob.

Row bands first, then columns WITHIN each band, because these sheets are not a
uniform grid: mopsy_cards1-20a runs 5 tiles on its first two rows and 6 on the
next two.
"""
import numpy as np, os, glob
from PIL import Image
Image.MAX_IMAGE_PIXELS=None

def _runs(mask, minlen):
    out=[]; s=None
    for i,v in enumerate(mask):
        if v and s is None: s=i
        if not v and s is not None:
            if i-s>=minlen: out.append((s,i))
            s=None
    if s is not None and len(mask)-s>=minlen: out.append((s,len(mask)))
    return out

def _uniform(std):
    """Lines flat enough to be gutter, scaled to the sheet's own contrast."""
    return std <= max(2.5, 0.06*float(np.median(std)))

def tiles(path, min_side=90):
    a=np.array(Image.open(path).convert('RGB')).astype(np.float64)
    lum=a.mean(axis=2)
    out=[]
    for (y0,y1) in _runs(~_uniform(lum.std(axis=1)), min_side):
        band=lum[y0:y1]
        for (x0,x1) in _runs(~_uniform(band.std(axis=0)), min_side):
            out.append((x0,y0,x1,y1))
    return out

if __name__=='__main__':
    for f in sorted(glob.glob('art/*cards*.png')):
        t=tiles(f)
        rows={}
        for x0,y0,x1,y1 in t: rows.setdefault(y0,0); rows[y0]+=1
        ws=sorted({x1-x0 for x0,y0,x1,y1 in t}); hs=sorted({y1-y0 for x0,y0,x1,y1 in t})
        print('%-32s %2d tiles  rows=%-16s w=%s h=%s' % (
            os.path.basename(f), len(t), str([rows[k] for k in sorted(rows)]),
            ws if len(ws)<4 else '%d..%d'%(ws[0],ws[-1]),
            hs if len(hs)<4 else '%d..%d'%(hs[0],hs[-1])))
