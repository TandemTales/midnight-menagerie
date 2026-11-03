"""Bedsheet-specific cloth deformation and a leftward, harmless breath puff."""
from pathlib import Path
import json,math,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from pack_authored_rig import pack
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-04/bedsheet-apparition-v2-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/bedsheet-apparition-original.png';W=H=512;R=384
source=Image.open(SRC).convert('RGBA').transpose(Image.Transpose.FLIP_LEFT_RIGHT)
a=np.asarray(source).astype(np.float32)/255
labels,n=ndi.label(a[:,:,3]>.05);counts=np.bincount(labels.ravel());counts[0]=0;clean=ndi.binary_dilation(labels==counts.argmax(),iterations=4);a*=clean[:,:,None];a[a[:,:,3]<=2/255]=0
yy,xx=np.where(a[:,:,3]>.05);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
scale=350/(box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=458-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);SX=(X-tx)/scale;SY=(Y-ty)/scale
pm=np.dstack([a[:,:,:3]*a[:,:,3,None],a[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[SY,SX],order=1,mode='constant') for k in range(4)],axis=-1)
top=box[1]*scale+ty;bottom=458;center=256
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0.
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 bob=inflate=flutter=puff=0.;lean=-12.;vertical=1.;wide=1.;recoil=0.
 if state=='idle':
  bob=-2.4*math.sin(2*math.pi*t);flutter=3.0*math.sin(2*math.pi*t);inflate=.012*math.sin(2*math.pi*t)
 elif state=='attack':
  inflate=key(t,[(0,0),(.24,.14),(.43,.03),(.65,.02),(1,0)])
  lean=key(t,[(0,-12),(.24,-2),(.44,-33),(.63,-27),(1,-12)])
  bob=key(t,[(0,0),(.24,-7),(.43,-2),(.70,3),(1,0)])
  flutter=11*math.sin(6*math.pi*t)*pulse(t,.22,.85);puff=pulse(t,.36,.72)
 elif state=='hurt':
  recoil=key(t,[(0,0),(.15,1),(.40,.50),(.78,.04),(1,0)]);lean=-12+22*recoil;vertical=1-.08*recoil;wide=1-.06*recoil;bob=3*recoil;flutter=6*math.sin(5*math.pi*t)*pulse(t,.05,.86)
 elif state=='defeat':
  collapse=smooth((t-.08)/.92);vertical=1-.90*collapse;wide=1+.12*collapse;lean=-12-10*math.sin(math.pi*t);flutter=7*math.sin(4*math.pi*t)*(1-collapse);bob=0
 else:raise ValueError(state)
 # Vertical squash is about the hem; upper cloth travels down while the floor contact stays.
 sample_y=bottom+(Y-bob-bottom)/vertical
 height=np.clip((sample_y-top)/(bottom-top),0,1)
 headweight=np.exp(-((height-.22)/.29)**2)
 breadth=wide+inflate*np.exp(-((height-.40)/.36)**2)
 wind=lean*headweight+flutter*height**1.7*np.sin(height*7+2*math.pi*t)
 sample_x=center+(X-center-wind)/breadth
 # Turn the face-bearing cloth toward the left by moving/compressing its actual
 # holes within the surrounding fabric. This is a localized surface warp, not a
 # symmetry claim or a painted replacement face.
 face_x=610*scale+tx;face_y=290*scale+ty
 face_weight=np.exp(-((sample_y-face_y)/(180*scale))**4)*np.clip(1-((sample_x-face_x)/(230*scale))**2,0,1)**2
 yawed_x=face_x+(sample_x-face_x+65*scale)/.84
 sample_x=sample_x*(1-face_weight)+yawed_x*face_weight
 # Local hem lift makes folds flutter independently of the head and global bob.
 sample_y+=flutter*.55*height**2*np.sin((sample_x-center)/27+2*math.pi*t)
 result=np.stack([ndi.map_coordinates(registered[:,:,k],[sample_y,sample_x],order=1,mode='constant') for k in range(4)],axis=-1)
 if puff:
  mouthx=(1254-650)*scale+tx+lean-18;mouthy=347*scale+ty+bob
  progress=max(0,min(1,(t-.36)/.36));cx=mouthx-20-65*progress;cy=mouthy-4*math.sin(math.pi*progress)
  fog=np.zeros((H,W),dtype=np.float32)
  for ox,oy,s in [(-10,0,8),(0,-5,10),(10,1,7)]:fog=np.maximum(fog,np.exp(-(((X-cx-ox)/(s*(.65+progress)))**2+((Y-cy-oy)/(s*(.65+progress)))**2)))
  opacity=fog*.32*puff;front=np.dstack([opacity*.88,opacity*.90,opacity,opacity]);result=front+result*(1-opacity[:,:,None])
 return rgba(result)
rgba(registered).save(OUT/'source-registered.png')
unit=round((frame('idle',0,60).getchannel('A').getbbox()[3]-frame('idle',0,60).getchannel('A').getbbox()[1])*R/W,2)
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*320,346),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((320,320),Image.Resampling.LANCZOS);contact.paste(g,(320*j,0),g);d.text((320*j+6,325),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
manifest={'enemy':'bedsheet-apparition','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Source-painted cloth mesh with separate head lean, body inflation, hem ripple and hem-anchored collapse. A small translucent breath puff travels left. Original holes and cloth folds are retained. Disconnected alpha speckles removed in derivative only.','actions':{'idle':'Small buoyant bob with independent hem motion; head leans left.','attack':'Inflate and rise in anticipation, lean left for a tiny boo, release a leftward breath puff, flutter and recover.','hurt':'Recoil right, briefly compress the cloth, shake the hem and recover.','defeat':'Invisible form collapses; the sheet sinks from its head to a flat folded cloth at the original hem, then stays down.'},'orientation':{'required':'screen-left','method':'Unlettered source cloth is reflected, its head leans left, and the boo gesture and breath move left; recoil goes right and recovery returns left.','status':'prototype_review_pending'},'quality_gate':'Prototype; no delivered actions yet.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
manifest['orientation']['method']='Reflect unlettered source cloth, then locally turn/compress the original face holes toward the left within the fabric. Head lean, boo gesture and breath all point left; recoil goes right and recovery restores the same left-facing cloth.'
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if '--pack' in sys.argv:pack(OUT,'bedsheetApparition',frame,unit,'bedsheet-head-body-hem-cloth-mesh')
print('Bedsheet Apparition '+('full clips staged' if '--pack' in sys.argv else 'key poses staged'),flush=True)
