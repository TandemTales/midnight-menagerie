"""Packing only: animation design stays in each enemy's separate rig."""
import math,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
def pack(out,source_key,frame,unit,authoring,specs=None):
 specs=specs or {'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True)}
 W=512;R=384;C=9;index={'clips':{},'scale':R/W,'unit':unit,'reviewStatus':'technical validation and visual review pending'}
 for state,(n,loop,hold) in specs.items():
  frames=[frame(state,i,n) for i in range(n)];rows=math.ceil(n/C);source=Image.new('RGBA',(C*W,rows*W));atlas=Image.new('RGBA',(C*R,rows*R));small=[]
  for i,f in enumerate(frames):
   source.paste(f,(i%C*W,i//C*W));g=f.resize((R,R),Image.Resampling.LANCZOS);small.append(g);atlas.paste(g,(i%C*R,i//C*R))
  src=f'SS_{source_key}_{state}.png';source.save(out/src);atlas.save(out/f'{state}.webp',lossless=True,method=4)
  durations=[round((i+1)*1000/30)-round(i*1000/30) for i in range(n)]
  small[0].save(out/f'{state}-preview.webp',save_all=True,append_images=small[1:],duration=durations,loop=0 if loop else 1,lossless=True,method=4)
  index['clips'][state]={'file':f'{state}.webp','frames':n,'cols':C,'rows':rows,'fw':R,'fh':R,'anchor':[192,348],'source':src,'sourceFrames':n,'grid':[C,rows],'scale':R/W,'unit':unit,'fps':30,'loop':loop,'hold':hold,'duration':n/30,'sha1':hashlib.sha1((out/src).read_bytes()).hexdigest()[:16],'matte':'CLEAN','authoring':authoring}
  contact=Image.new('RGB',(8*256,282),(30,30,38));d=ImageDraw.Draw(contact)
  for j,k in enumerate(np.linspace(0,n-1,8).round().astype(int)):
   g=frames[k].resize((256,256),Image.Resampling.LANCZOS);contact.paste(g,(256*j,0),g);d.text((256*j+6,261),f'{state} {k+1}/{n}',fill='white')
  contact.save(out/f'{state}-contact.jpg');print(state,n,'frames staged',flush=True)
 (out/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
 return index
