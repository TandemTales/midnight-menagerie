"""Topiary Hare: two flexible foliage ears, rigid face, crouching body and paw tuck."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-04/topiary-hare-v1-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/topiary-hare-original.png';W=H=512;R=384
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
scale=395/(box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=464-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale
pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[SY,SX],order=1,mode='constant') for k in range(4)],axis=-1)
ear_boundary=697+(SY-400)*.08
ears=[registered*((SY<565)&(SX<ear_boundary))[:,:,None],registered*((SY<565)&(SX>=ear_boundary))[:,:,None]]
head=registered*((SY>=540)&(SY<750))[:,:,None];body=registered*(SY>=730)[:,:,None]
ear_pivots=[(679,557),(748,557)];neck=(710,740);bottom=464
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def over(b,f):return f+b*(1-f[:,:,3,None])
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0
def affine(a,pivot,angle=0,dx=0,dy=0):
 cx,cy=pivot[0]*scale+tx,pivot[1]*scale+ty;r=math.radians(angle);co,si=math.cos(r),math.sin(r);x=X-cx-dx;y=Y-cy-dy
 return np.stack([ndi.map_coordinates(a[:,:,k],[-si*x+co*y+cy,co*x+si*y+cx],order=1,mode='constant') for k in range(4)],axis=-1)
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 stretch=1.;headangle=dx=dy=air=0.;earangles=[0.,0.];dim=1.
 if state=='idle':
  earangles=[1.2*math.sin(2*math.pi*t),1.8*math.sin(4*math.pi*t)];headangle=.30*math.sin(2*math.pi*t)
 elif state=='attack':
  stretch=key(t,[(0,1),(.20,.83),(.40,1.04),(.63,1),(.76,.89),(1,1)])
  dx=key(t,[(0,0),(.20,-3),(.44,34),(.64,28),(.80,8),(1,0)])
  dy=key(t,[(0,0),(.20,0),(.44,-38),(.64,-18),(.76,0),(1,0)])
  air=pulse(t,.22,.76);headangle=key(t,[(0,0),(.20,3),(.44,-5),(.70,4),(1,0)])
  earangles=[key(t,[(0,0),(.20,-12),(.48,-6),(.76,7),(1,0)]),key(t,[(0,0),(.22,-9),(.50,-4),(.78,5),(1,0)])]
 elif state=='hurt':
  q=key(t,[(0,0),(.14,1),(.38,.48),(.76,.03),(1,0)]);stretch=1-.08*q;dx=-12*q;headangle=-9*q;earangles=[-10*q,7*q]
 elif state=='defeat':
  q=smooth(t);stretch=1-.24*q;headangle=20*q;earangles=[58*smooth((t-.10)/.90),65*smooth((t-.18)/.82)];dim=1-.08*q
 else:raise ValueError(state)
 sample_y=bottom+(Y-bottom)/stretch
 localY=(sample_y-ty)/scale;localX=(X-tx)/scale
 forepaw=np.exp(-((localX-720)/65)**2)*np.clip((localY-900)/300,0,1)**1.4
 sample_x=X+18*scale*air*forepaw;sample_y+=20*scale*air*forepaw
 torso=np.stack([ndi.map_coordinates(body[:,:,k],[sample_y,sample_x],order=1,mode='constant') for k in range(4)],axis=-1)
 upper=np.zeros_like(registered)
 for j in [1,0]:upper=over(upper,affine(ears[j],ear_pivots[j],earangles[j]))
 upper=over(upper,head)
 neck_y=neck[1]*scale+ty;down=(bottom-neck_y)*(1-stretch)
 result=over(torso,affine(upper,neck,headangle,dy=down));result=affine(result,neck,dx=dx,dy=dy);result[:,:,:3]*=dim
 return rgba(result).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
rgba(registered).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT/'source-registered.png')
layers=Image.new('RGBA',(W*4,H))
for j,layer in enumerate([body,head]+ears):layers.paste(rgba(layer),(j*W,0))
layers.save(OUT/'rig-layers.png')
base=frame('idle',0,60).getchannel('A').getbbox();unit=round((base[3]-base[1])*R/W,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'topiary-hare','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Two separately articulated source foliage ears; intact head rotates at the neck; body compresses above planted feet and front-paw mesh tucks during a hop. Unlettered, unarmed source reflected to face left. No newly invented hidden body parts.','actions':{'idle':'Small independent ear twitches; the clipped shrub body stays almost still.','attack':'Plant feet and crouch, spring into a small leftward hop with tucked paw and lagging ears, land softly and recover.','hurt':'Quick rightward recoil, head flinch, asymmetric ear response and recovery.','defeat':'Head bows and both long foliage ears wilt forward while the body settles into a low inactive garden ornament.'},'orientation':{'required':'screen-left','method':'Whole unlettered shrub is reflected so nose/eyes face left. Hop goes left, hurt recoils right, recovery and bowed endpoint retain the left profile. No held prop or text is reversed.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'topiaryHare',frame,unit,'topiary-hare-ear-neck-crouch-paw-rig')
print('Topiary Hare '+('full clips staged' if '--pack' in sys.argv else 'key poses staged'),flush=True)
