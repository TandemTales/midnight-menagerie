"""Bind final canonical pixels to the exact unchanged visual source commit."""
import hashlib,json,subprocess,sys
from pathlib import Path
from PIL import Image
source=subprocess.check_output(['git','rev-parse',sys.argv[1]],text=True).strip()
subprocess.run(['git','diff','--exit-code',source,'--','game/src','game/assets'],check=True,stdout=subprocess.DEVNULL)
out=Path('D:/UILOOP/r55-20261029/judging/IOLITE');proof=Path('docs/ui-pass/IOLITE-r55-proofs')
rows=json.loads((out/'capture-results.json').read_text())
assert len(rows)==10 and all(r['exit']==0 for r in rows)
for r in rows:
 p=out/(r['screen']+'.png');r.update(visual_source_commit=source,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
(out/'capture-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
images=[]
for p in [*out.glob('*.png'),Path('shots/IOLITE-title.png')]:
 if not p.exists():continue
 item={'visual_source_commit':source,'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':list(Image.open(p).size)}
 meta=p.with_suffix('.state.json')
 if meta.exists():
  item['metadata']=json.loads(meta.read_text(encoding='utf-8'))
  assert not item['metadata'].get('errors'),item['metadata']
 images.append(item)
(proof/'provenance.json').write_text(json.dumps({'visual_source_commit':source,'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'canonical':rows,'images':images},indent=2),encoding='utf-8')
print('Bound',len(rows),'canonical images and',len(images),'total proof images to',source)
