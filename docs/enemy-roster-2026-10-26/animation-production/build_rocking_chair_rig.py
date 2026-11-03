"""Rocking Chair: runner contact, cushion give, leftward scoot and a tipped finish."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-07/rocking-chair-v3-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/rocking-chair-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
labels,n=ndi.label(a[:,:,3]>0);cnt=np.bincount(labels.ravel());keep=cnt>25;keep[0]=False;a[~keep[labels]]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1);scale=270/(box[3]-box[1]);tx=282-(box[0]+box[2])/2*scale;ty=443-box[3]*scale
Y,X=np.mgrid[:W,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale;pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
def smooth(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return float(v+(w-v)*smooth((t-a)/(b-a)))
 return p[-1][1]
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 angle=dx=squish=0.
 if state=='idle':angle=2.7*math.sin(2*math.pi*t);squish=1.2*(1-math.cos(2*math.pi*t))
 elif state=='attack':
  angle=key(t,[(0,0),(.23,7),(.43,-6),(.65,2),(1,0)]);dx=key(t,[(0,0),(.23,3),(.48,-36),(.66,-27),(1,0)]);squish=key(t,[(0,0),(.23,0),(.50,13),(.72,3),(1,0)])
 elif state=='hurt':
  q=key(t,[(0,0),(.14,1),(.43,-.2),(.72,.08),(1,0)]);angle=8*q;dx=12*q;squish=12*abs(q)
 elif state=='defeat':angle=-69*float(smooth(t));dx=15*float(smooth(t));squish=5*float(smooth(t))
 else:raise ValueError(state)
 # Cushion compresses within its upholstered region; timber remains rigid.
 cushion=np.exp(-(((SX-652)/330)**6+((SY-650)/92)**6))
 registered=np.stack([ndi.map_coordinates(pm[:,:,k],[SY-squish*cushion,SX],order=1,mode='constant') for k in range(4)],axis=-1)
 cx,cy=282,434;r=math.radians(angle)
 # Compute floor contact before rasterization so a rotated corner cannot clip before translation.
 ry,rx=np.where(registered[:,:,3]>.05);lowest=(math.sin(r)*(rx-cx)+math.cos(r)*(ry-cy)+cy).max();shift=443-lowest
 x=X-cx-dx;y=Y-cy-shift
 warped=np.stack([ndi.map_coordinates(registered[:,:,k],[-math.sin(r)*x+math.cos(r)*y+cy,math.cos(r)*x+math.sin(r)*y+cx],order=1,mode='constant') for k in range(4)],axis=-1)
 return rgba(warped)
registered=frame('idle',0,60);registered.save(OUT/'source-registered.png');unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'rocking-chair','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Rigid source timber rocks about its runners with explicit floor contact; local upholstery mesh gives separately on impact. Distinct authored runner lift, leftward scoot, recoil and tipped defeat. No generic creature wobble or invented joints.','actions':{'idle':'Small alternating runner rock with slight cushion give.','attack':'Lean back and lift the leading runner, scoot left, absorb the landing in the cushion, and rock back to ready.','hurt':'Sharp rightward jolt, cushion compression and damped counter-rock.','defeat':'Chair tips onto its left side and stays on the floor with inert upholstery.'},'orientation':{'required':'screen-left','method':'Source seat front and long leading runner project left. Anticipation rocks back right, attack scoots left, hurt recoils right, and the final tip falls left. No mirror or text/handedness change.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'rockingChair',frame,unit,'rocking-chair-runner-and-cushion-rig')
print('Rocking Chair staged',flush=True)
