"""Rain Chain: hierarchical copper cups, linked motion and an upward bead relay."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-06/rain-chain-v3-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/region-14/rain-chain-original.png';W=512
a=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;a[a[:,:,3]<=2/255]=0
labels,n=ndi.label(a[:,:,3]>0);counts=np.bincount(labels.ravel());keep=counts>30;keep[0]=False;a[~keep[labels]]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1);scale=390/(box[3]-box[1]);tx=220-628*scale;ty=453-box[3]*scale
Y,X=np.mgrid[:W,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale;sy=np.arange(a.shape[0])[:,None]
pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]]);bands=[sy<225,(sy>=210)&(sy<550),(sy>=535)&(sy<925),sy>=900];layers=[pm*b[:,:,None] for b in bands]
def smooth(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def rot(y,angle):
 r=math.radians(angle);c,s=math.cos(r),math.sin(r);x=628
 return np.array([[c,-s,x-c*x+s*y],[s,c,y-s*x-c*y],[0,0,1]])
def warp(a,m):
 inv=np.linalg.inv(m);x=inv[0,0]*SX+inv[0,1]*SY+inv[0,2];y=inv[1,0]*SX+inv[1,1]*SY+inv[1,2]
 return np.stack([ndi.map_coordinates(a[:,:,k],[y,x],order=1,mode='constant') for k in range(4)],axis=-1)
def point(m,x,y):
 q=m@np.array([x,y,1]);return q[0]*scale+tx,q[1]*scale+ty
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt','cast') and i==n-1:t=0
 angles=[-12.,-3.,-3.];dim=1.
 if state=='idle':
  for j in range(3):angles[j]+=1.0*(math.sin(2*math.pi*t-j*.7)-math.sin(-j*.7))
 elif state=='attack':
  angles[2]+=7*pulse(t,0,.27)-27*pulse(t,.20,.68);angles[1]-=6*pulse(t,.30,.77);angles[0]-=3*pulse(t,.42,.90)
 elif state=='cast':
  for j in range(3):angles[j]-=11*pulse(t,.12+(2-j)*.15,.53+(2-j)*.15)
 elif state=='hurt':
  for j in range(3):angles[j]+=7*pulse(t,j*.035,.52+j*.08)-2*pulse(t,.45,.95)
 elif state=='defeat':
  q=float(smooth(t));angles=[-12-13*q,-3-8*q,-3-8*q];dim=1-.16*q
 else:raise ValueError(state)
 matrices=[];m=np.eye(3)
 for y,angle in zip([220,540,915],angles):m=m@rot(y,angle);matrices.append(m.copy())
 result=warp(layers[0],np.eye(3))
 for layer,m in zip(layers[1:],matrices):
  f=warp(layer,m);result=f+result*(1-f[:,:,3,None])
 result[:,:,:3]*=np.where(SY<180,1,dim)[:,:,None]
 # A single stylized water bead follows a cup-to-cup path; it is not a swarm or flowing stream.
 if state in ('attack','cast') and .20<t<.86:
  q=(t-.20)/.66
  points=[point(matrices[2],610,946),point(matrices[1],600,615),point(matrices[0],590,308)]
  if state=='attack':
   start=points[0];end=(start[0]-75,start[1]-83);bx=start[0]+(end[0]-start[0])*q;by=start[1]+(end[1]-start[1])*q-16*math.sin(math.pi*q)
  else:
   z=q*2;index=min(1,int(z));mix=float(smooth(z-index));bx=points[index][0]*(1-mix)+points[index+1][0]*mix;by=points[index][1]*(1-mix)+points[index+1][1]*mix;bx-=12*math.sin(math.pi*(z-index))
  opacity=math.sin(math.pi*q)**.55;rr=(X-bx)**2+(Y-by)**2;alpha=(.75*np.exp(-rr/36)+.17*np.exp(-rr/100))*opacity
  bead=np.dstack([alpha*.58,alpha*.83,alpha,alpha]);result=bead+result*(1-alpha[:,:,None])
 return rgba(result)
registered=frame('idle',0,60);registered.save(OUT/'source-registered.png');root=(SY<175)&(np.asarray(registered)[:,:,3]>240);Image.fromarray(np.uint8(root)*255).save(OUT/'root-mask.png');unit=round((registered.getchannel('A').getbbox()[3]-registered.getchannel('A').getbbox()[1])*.75,2)
specs={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True),'cast':(60,False,False)}
for state,(n,_,_) in specs.items():
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'rain-chain','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Three original copper cups and links rotate hierarchically beneath the original stationary hook. Overlapping connector regions preserve attachment. One soft painted-style water bead is an added action effect; no swarm or stream.','actions':{'idle':'Small lagged cup sway under a fixed hook.','attack':'Bottom cup gathers then tips left, tossing one bead up and left; higher cups absorb the response and return.','hurt':'A brief rightward chain recoil travels through three joints, then settles left.','defeat':'Three cups slacken into an increasingly left-tipped, dim inactive chain; top hook remains.','cast':'A slower upward relay passes one bead through bottom, middle and upper cup, with three timed cup tips.'},'orientation':{'required':'screen-left','method':'Each opening is tilted upper-left even at rest; leftward tips and upward-left bead paths direct actions toward the kid. No reflection, text or prop reversal.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'rainChain',frame,unit,'rain-chain-hierarchical-cup-relay-rig',specs)
print('Rain Chain staged',flush=True)
