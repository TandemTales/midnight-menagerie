"""Blind pairs, one coin per SCREEN (both sizes share a letter).

    python make_pairs.py OUT KEY NEW_DIR OLD_DIR screen[,screen...]

A screen is a base name; its -1280 twin, if present in both dirs, gets the same letter.
"""
import sys, json, random, shutil
from pathlib import Path
out, key, new, old = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
screens = sys.argv[5].split(',')
out.mkdir(parents=True, exist_ok=True)
rng = random.SystemRandom()
k = {}
for s in screens:
    new_is_A = rng.random() < 0.5
    k[s] = {'new_is_A': new_is_A}
    for name in (s, s + '-1280'):
        a, b = new / (name + '.png'), old / (name + '.png')
        if not (a.exists() and b.exists()):
            continue
        A, B = (a, b) if new_is_A else (b, a)
        shutil.copy2(A, out / f'{name}-A.png')
        shutil.copy2(B, out / f'{name}-B.png')
key.write_text(json.dumps(k, indent=1))
print(len(k), 'screens,', len(list(out.glob('*.png'))), 'images')
