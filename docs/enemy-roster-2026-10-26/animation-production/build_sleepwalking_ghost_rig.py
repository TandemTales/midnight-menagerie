"""Sleepwalking Ghost: soft striped limbs, planted half-step, nodding cap and snore."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-07/sleepwalking-ghost-v1-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/sleepwalking-ghost-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
labels,n=ndi.label(a[:,:,3]>0);cnt=np.bincount(labels.ravel());keep=cnt>55;keep[0]=False;a[~keep[labels]]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1);scale=350/(box[3]-box[1]);tx=260-(box[0]+box[2])/2*scale;ty=451-box[3]*scale
Y,X=np.mgrid[:W,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale;pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
def smooth(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return float(v+(w-v)*smooth((t-a)/(b-a)))
 return p[-1][1]
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 nod=cap=reach=step=lift=back=root=brace=0.;breath=0.;fade=1.
 if state=='idle':
  breath=.012*math.sin(2*math.pi*t);cap=1.3*(math.cos(2*math.pi*t)-1);nod=.35*math.sin(2*math.pi*t)
 elif state=='attack':
  nod=key(t,[(0,0),(.22,5),(.50,2),(.76,-1),(1,0)]);cap=key(t,[(0,0),(.24,10),(.52,-3),(.78,2),(1,0)])
  step=key(t,[(0,0),(.22,-8),(.47,65),(.67,55),(1,0)]);lift=-36*pulse(t,.15,.63);back=-18*pulse(t,.27,.80)
  root=key(t,[(0,0),(.24,-2),(.52,13),(.72,9),(1,0)]);reach=25*pulse(t,.25,.78);breath=.035*pulse(t,.38,.88)
 elif state=='hurt':
  q=key(t,[(0,0),(.14,1),(.38,.35),(.75,-.07),(1,0)]);nod=-7*q;cap=-9*q;root=-12*q;reach=-32*q;brace=16*q
 elif state=='defeat':
  q=float(smooth(t));nod=9*q;cap=17*q;reach=-24*q;brace=40*q;fade=1-float(smooth((t-.15)/.85))
 else:raise ValueError(state)
 qx=SX-root/scale;qy=SY
 # The two trouser legs move differently below the jacket hem, with a fixed hip region.
 leg=smooth((qy-875)/235);front=smooth((qx-615)/100);rear=1-front
 qx-=leg*(front*step+rear*back);qy-=leg*front*lift
 # Knees soften under the fixed waist; wrist reaches remain attached to their sleeves.
 qy-=brace*smooth((qy-780)/120)*(1-smooth((qy-1050)/110))
 arm=smooth((qx-650)/210)*(1-smooth((qy-730)/100))*smooth((qy-510)/90)
 qx-=reach*arm;qy+=reach*.18*arm
 chest=np.exp(-(((qx-655)/180)**4+((qy-730)/170)**4));qx=655+(qx-655)/(1+breath*chest)
 # Head nod and floppy cap have separate, bounded deformation fields.
 h=1-smooth((qy-495)/85);r=math.radians(nod);x=qx-635;y=qy-540
 qx+=(math.cos(r)*x+math.sin(r)*y+635-qx)*h;qy+=(-math.sin(r)*x+math.cos(r)*y+540-qy)*h
 c=(1-smooth((qx-405)/130))*smooth((qy-90)/140)*(1-smooth((qy-540)/65));r=math.radians(cap);x=qx-438;y=qy-245
 qx+=(math.cos(r)*x+math.sin(r)*y+438-qx)*c;qy+=(-math.sin(r)*x+math.cos(r)*y+245-qy)*c
 # Stretch only the original snore wisp during exhalation; keep its painted connection to the mouth.
 snore=smooth((qx-800)/90)*(1-smooth((qy-475)/35))*smooth((qy-335)/40)
 qx-=breath*900*snore;qy+=breath*150*snore
 result=np.stack([ndi.map_coordinates(pm[:,:,k],[qy,qx],order=1,mode='constant') for k in range(4)],axis=-1);result*=fade
 return rgba(result).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
registered=frame('idle',0,60);registered.save(OUT/'source-registered.png');unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'sleepwalking-ghost','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Continuous source-art mesh with separate trouser-leg displacement, sleeve reach, chest breathing, head nod and cap droop. Original snore wisp stretches locally. No unpainted anatomy or replacement face; unlettered sleeper reflected left.','actions':{'idle':'Gentle chest breath, tiny head nod and lagged cap droop; feet stay still.','attack':'Cap droops, forward foot lifts into one careful leftward half-step, sleeves reach and a snore expands; feet and body recover.','hurt':'Rightward flinch, sleeve withdrawal and knees bracing, followed by recovery.','defeat':'Knees soften and head/cap droop into sleep as the translucent sleeper fades completely.'},'orientation':{'required':'screen-left','method':'Reflected nose, closed-eye profile, reaching hands, toes and connected snore face left. Half-step travels left and hurt recoils right. No letters or handed props reversed.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'sleepwalkingGhost',frame,unit,'sleepwalking-ghost-trouser-cap-snore-rig')
print('Sleepwalking Ghost staged',flush=True)
