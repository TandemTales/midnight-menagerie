"""Masquerade Mask: rigid painted face, articulated trailing ribbons, lateral peek."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-05/masquerade-mask-v2-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/masquerade-mask-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
scale=330/(box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=416-box[3]*scale
Y,X=np.mgrid[:W,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale
pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
def smooth(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return float(v+(w-v)*smooth((t-a)/(b-a)))
 return p[-1][1]
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def sample(x,y):return np.stack([ndi.map_coordinates(pm[:,:,k],[y,x],order=1,mode='constant') for k in range(4)],axis=-1)
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 angle=dx=dy=0.;wave=0.;dim=1.
 if state=='idle':wave=10*math.sin(2*math.pi*t);dy=1.4*(math.cos(2*math.pi*t)-1)
 elif state=='attack':
  angle=key(t,[(0,0),(.22,-8),(.44,10),(.64,7),(1,0)])
  dx=key(t,[(0,0),(.22,-6),(.44,30),(.67,24),(1,0)]);dy=key(t,[(0,0),(.22,2),(.44,-7),(.70,-3),(1,0)])
  wave=key(t,[(0,0),(.23,-28),(.52,60),(.75,-18),(1,0)])
 elif state=='hurt':
  q=key(t,[(0,0),(.16,1),(.42,.25),(.70,-.10),(1,0)]);dx=-17*q;angle=-13*q;wave=-38*q
 elif state=='defeat':
  q=float(smooth(t));angle=29*q;dy=42*q;wave=48*q;dim=1-.90*float(smooth((t-.15)/.55))
 else:raise ValueError(state)
 # Rigid global face tilt, then ribbon-only local bend. Foreground ribbon stays over hidden face.
 cx,cy=710*scale+tx,500*scale+ty;r=math.radians(angle)
 x=X-cx-dx;y=Y-cy-dy
 qx=(math.cos(r)*x+math.sin(r)*y+cx-tx)/scale
 qy=(-math.sin(r)*x+math.cos(r)*y+cy-ty)/scale
 trailing=smooth((qy-610)/380)
 left_tail=(1-smooth((qx-440)/130))*smooth((qy-410)/170)
 right_tail=smooth((qx-930)/100)*smooth((qy-580)/150)
 bend=wave*(trailing*.8*np.sin((qy-560)/150)+left_tail*.65+right_tail*.6)
 result=sample(qx+bend,qy+wave*.30*left_tail)
 # Dim actual lavender eye illumination locally while keeping the source mask and holes intact.
 near=np.exp(-(((qx-742)/72)**4+((qy-441)/47)**4))
 far=np.exp(-(((qx-868)/35)**4+((qy-470)/45)**4))
 result[:,:,:3]*=(1-(1-dim)*np.maximum(near,far))[:,:,None]
 return rgba(result).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
registered=rgba(sample(SX,SY)).transpose(Image.Transpose.FLIP_LEFT_RIGHT);registered.save(OUT/'source-registered.png');unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'masquerade-mask','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Intact source mask tilts as a rigid face; trailing ribbon regions bend with delayed curves. Broad foreground ribbon remains over the unpainted hidden face. Reflected unlettered mask points left. No invented hidden anatomy.','actions':{'idle':'Float gently while the trailing ribbons and tassels sway around a quiet face.','attack':'Withdraw and tilt, then peek sharply left while ribbons follow through and return.','hurt':'Quick rightward recoil and tilted flinch, with asymmetric trailing ribbon response.','defeat':'Eye illumination dies, mask tips downward left, ribbons droop, and the inactive ornament sinks into a final held pose.'},'orientation':{'required':'screen-left','method':'Whole unlettered mask reflected; nose points left, peek travels left after rightward anticipation. Hurt recoils right; final tilt remains leftward. No text or handed prop reversed.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'masqueradeMask',frame,unit,'masquerade-mask-face-and-trailing-ribbon-rig')
print('Masquerade Mask staged',flush=True)
