"""Imaginary Friend: crayon face bearing, waving arm and appearing/erasing doodles."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-06/imaginary-friend-v1-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/imaginary-friend-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
labels,n=ndi.label(a[:,:,3]>0);counts=np.bincount(labels.ravel());keep=counts>45;keep[0]=False;a[~keep[labels]]=0
yy,xx=np.where(a[:,:,3]>.08);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1);scale=350/(box[3]-box[1]);tx=250-(box[0]+box[2])/2*scale;ty=453-box[3]*scale
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
 if state in ('attack','hurt','cast') and i==n-1:t=0
 arm=head=bob=dx=0.;stroke=0.;erase=0.;bright=1.
 if state=='idle':
  arm=1.3*math.sin(2*math.pi*t);head=.6*(math.cos(2*math.pi*t)-1);bright=1+.025*math.sin(2*math.pi*t)
 elif state=='attack':
  arm=key(t,[(0,0),(.22,-9),(.45,17),(.68,-4),(1,0)]);head=key(t,[(0,0),(.22,-2),(.45,3),(1,0)]);stroke=key(t,[(0,0),(.24,0),(.55,1),(.73,1),(1,0)])
 elif state=='cast':
  arm=key(t,[(0,0),(.16,-7),(.40,13),(.66,-3),(.83,7),(1,0)]);head=2*math.sin(math.pi*t);stroke=key(t,[(0,0),(.18,0),(.67,1),(.80,1),(1,0)])
 elif state=='hurt':
  q=key(t,[(0,0),(.13,1),(.40,.3),(.70,-.08),(1,0)]);arm=-16*q;head=-6*q;dx=-10*q;bob=5*q
 elif state=='defeat':
  erase=float(smooth(t));arm=-15*erase;head=-5*erase;bob=7*erase
 else:raise ValueError(state)
 qx=SX-dx/scale;qy=SY-bob/scale
 # Rounded head bends a little at the neck while the legs stay planted.
 hw=(1-smooth((qy-660)/170));hr=math.radians(head);hx=qx-600;hy=qy-775
 qx+=(math.cos(hr)*hx+math.sin(hr)*hy+600-qx)*hw
 qy+=(-math.sin(hr)*hx+math.cos(hr)*hy+775-qy)*hw
 # Soft crayon arm bends continuously; no hard layer seam through its translucent outline.
 aw=smooth((qx-725)/190)*(1-smooth((qy-810)/90));ar=math.radians(arm);ax=qx-750;ay=qy-820
 qx+=(math.cos(ar)*ax+math.sin(ar)*ay+750-qx)*aw
 qy+=(-math.sin(ar)*ax+math.cos(ar)*ay+820-qy)*aw
 # Original facial marks turn toward source-right; final reflection makes gaze screen-left.
 face=np.exp(-(((qx-605)/240)**6+((qy-550)/215)**6))
 qx+=((605+(qx-605-42)/.88)-qx)*face
 result=np.stack([ndi.map_coordinates(pm[:,:,k],[qy,qx],order=1,mode='constant') for k in range(4)],axis=-1);result[:,:,:3]*=bright
 if state=='defeat':
  cutoff=1255-erase*1450;mask=smooth((cutoff-qy)/70);result*=mask[:,:,None]
 im=rgba(result).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 if state in ('attack','cast') and stroke>0:
  # One short cyan crayon arc for attack; one rounded house-outline doodle for cast.
  effect=Image.new('RGBA',(W,W));draw=ImageDraw.Draw(effect)
  if state=='attack':points=[(122-52*u,252-25*math.sin(math.pi*u)) for u in np.linspace(0,stroke,45)]
  else:
   control=np.array([(110,223),(95,211),(78,225),(80,243),(106,243),(110,223)],float);z=stroke*(len(control)-1);points=[tuple(x) for x in control[:int(z)+1]]
   if int(z)<len(control)-1:points.append(tuple(control[int(z)]*(1-z%1)+control[int(z)+1]*(z%1)))
  if len(points)>1:
   opacity=1 if t<.78 else float(smooth((1-t)/.22));draw.line(points,fill=(137,237,232,int(220*opacity)),width=3,joint='curve');halo=effect.filter(ImageFilter.GaussianBlur(2));im=Image.alpha_composite(im,halo);im=Image.alpha_composite(im,effect)
 return im
registered=frame('idle',0,60);registered.save(OUT/'source-registered.png');unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
specs={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True),'cast':(60,False,False)}
for state,(n,_,_) in specs.items():
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'imaginary-friend','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Continuous source-art crayon arm/head deformation; original face marks yaw within the head before reflection. Small drawn cyan doodle effects and spatial erasure are authored additions. No hidden anatomy or replacement face drawn.','actions':{'idle':'Soft line shimmer and a small hand wave with planted feet.','attack':'Hand withdraws, sweeps left through a short crayon arc, then erases the arc and returns.','hurt':'Head and hand flinch right and recover.','defeat':'The crayon figure erases progressively from the feet upward, ending fully transparent.','cast':'A slower hand gesture draws one rounded house outline to the left, pauses and erases it.'},'orientation':{'required':'screen-left','method':'Reflected oversized hand gestures left. Original face-bearing marks yaw toward left within the head; recoil goes right and ready stance returns left. No text or held handed prop.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'imaginaryFriend',frame,unit,'imaginary-friend-crayon-wave-and-erase-rig',specs)
print('Imaginary Friend staged',flush=True)
