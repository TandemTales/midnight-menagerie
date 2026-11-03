"""Servant Bell: anchored plaque, flexible coil, two bell strikes and a late shadow ring."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-05/servant-bell-v1-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/servant-bell-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
scale=410/(box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=464-box[3]*scale
Y,X=np.mgrid[:W,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale
pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
def smooth(t):
 t=np.clip(t,0,1);return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return float(v+(w-v)*smooth((t-a)/(b-a)))
 return p[-1][1]
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def sample(x,y):return np.stack([ndi.map_coordinates(pm[:,:,k],[y,x],order=1,mode='constant') for k in range(4)],axis=-1)
shadow=smooth((SX-738)/90)*smooth((SY-260)/100)*(1-smooth((SY-780)/100))
# Fixed rope at the top and anchored plaque below. Coil taper bends without a cutout seam.
metalweight=smooth((SY-235)/95)*(1-smooth((SY-620)/215))
metalweight*=1-smooth((SX-730)/90)
metalweight*=np.where(SY>775,1-smooth((np.abs(SX-680)-30)/55),1)
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 angle=sa=0.;fade=1.;slack=0.
 if state=='idle':angle=.7*math.sin(2*math.pi*t);sa=1.3*math.sin(2*math.pi*t)
 elif state=='attack':
  angle=key(t,[(0,0),(.18,-4),(.31,10),(.42,-7),(.54,9),(.67,-3),(.78,0),(1,0)])
  sa=key(t,[(0,0),(.38,0),(.63,3),(.79,12),(.91,-4),(1,0)])
 elif state=='hurt':
  angle=key(t,[(0,0),(.14,-10),(.40,3),(.67,-1),(1,0)]);sa=angle*.45
 elif state=='defeat':
  angle=-16*float(smooth(t));sa=10*float(smooth(t));fade=1-float(smooth((t-.18)/.82));slack=22*float(smooth(t))
 else:raise ValueError(state)
 r=math.radians(angle);x=SX-713;y=SY-270
 rx=math.cos(r)*x+math.sin(r)*y+713;ry=-math.sin(r)*x+math.cos(r)*y+270
 sr=math.radians(sa);sx=math.cos(sr)*(SX-743)+math.sin(sr)*(SY-305)+743;sy=-math.sin(sr)*(SX-743)+math.cos(sr)*(SY-305)+305
 qx=SX+(rx-SX)*metalweight+(sx-SX)*shadow
 qy=SY+(ry-SY)*metalweight+(sy-SY)*shadow-slack*metalweight
 result=sample(qx,qy);result*= (1-shadow*(1-fade))[:,:,None]
 return rgba(result)
registered=rgba(sample(SX,SY));registered.save(OUT/'source-registered.png')
root=((SY>900)|(SY<180))&(np.asarray(registered)[:,:,3]>240);Image.fromarray(np.uint8(root)*255).save(OUT/'root-mask.png')
unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'servant-bell','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Continuous source-art deformation about the bell crown, tapered through the spring into a fixed wooden plaque. Original rope and plaque retained. The separate painted shadow has a delayed motion field; no unpainted hidden metal is invented.','actions':{'idle':'Small wire/coil flex and a slower shadow sway.','attack':'Coil tensions right, then the bell swings left twice; the shadow rings a third late echo before all recover.','hurt':'Brief rightward recoil, small counter-swing and damped return.','defeat':'Metal droops on a slack coil while the ghostly shadow fades; fixed plaque and rope remain.'},'orientation':{'required':'screen-left','method':'Authentic bell opening points left; main strikes swing left following rightward anticipation. Recovery and drooped endpoint retain leftward mouth. No reflection or text change.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'servantBell',frame,unit,'servant-bell-coil-and-shadow-rig')
print('Servant Bell staged',flush=True)
