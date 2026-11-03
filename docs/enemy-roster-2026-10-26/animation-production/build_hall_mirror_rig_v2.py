"""Hall Mirror source-art rig. Deterministic layered compositing, not AI video.
The authentic frame and alpha remain bit-identical in every pose. Signed reflection
layers are articulated over an empty-glass plate sampled from the source's own glass.
Writes staging only; publish is a separate validated, no-overwrite operation.
"""
from pathlib import Path
import json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from scipy import ndimage as ndi
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent/'representative-v2';OUT.mkdir(exist_ok=True)
SRC=ROOT/'docs/enemy-roster-2026-10-26/art-production/hall-mirror-original.png'
W,H=512,768;S=.6;TX=-126.8;TY=13.2
P=lambda x,y:(x*S+TX,y*S+TY)
source=Image.open(SRC).convert('RGBA')
image=source.transform((W,H),Image.Transform.AFFINE,(1/S,0,-TX/S,0,1/S,-TY/S),Image.Resampling.BICUBIC)
original=np.asarray(image).astype(np.float32);rgb=original[:,:,:3];alpha=original[:,:,3]
Y,X=np.mgrid[:H,:W].astype(np.float32)
def polygon(coords,blur=0):
 m=Image.new('L',(W,H));ImageDraw.Draw(m).polygon([P(*xy) for xy in coords],fill=255)
 if blur:m=m.filter(ImageFilter.GaussianBlur(blur*S))
 return np.array(m,dtype=np.float32)/255
# All animated pixels remain safely inside the glass, clear of the authentic bevel.
glass=polygon([(541,260),(554,217),(582,193),(619,181),(655,187),(699,216),(722,254),(738,346),(747,510),(754,710),(760,891),(745,919),(733,940),(704,961),(674,970),(625,966),(590,950),(563,925),(548,900)],2)
ghost=polygon([(551,561),(567,516),(590,478),(628,442),(678,420),(713,411),(735,418),(746,445),(748,490),(741,533),(725,579),(703,607),(677,622),(669,641),(681,652),(690,633),(698,619),(709,618),(716,632),(722,627),(733,639),(728,651),(739,651),(740,666),(723,684),(715,702),(698,734),(670,753),(630,766),(590,770),(562,759),(552,718)],14)*glass
# Sample genuinely empty upper glass; retain palette, small stars and painted texture.
sx=635+(X-TX-S*635)*.62/S
sy=250+((Y-TY)/S-410)*.30
plate=np.stack([ndi.map_coordinates(np.asarray(source)[:,:,c].astype(np.float32),[sy,sx],order=1,mode='nearest') for c in range(3)],axis=-1)
base=rgb*(1-ghost[:,:,None])+plate*ghost[:,:,None]
residual=rgb-base
hand_mask=polygon([(660,621),(691,608),(720,612),(743,641),(741,673),(719,700),(693,710),(674,692)],7)
head_mask=1/(1+np.exp(np.clip((Y-P(0,611)[1])/4,-50,50)))
head_mask*=1-hand_mask
body_mask=np.maximum(0,1-head_mask-hand_mask)
head=residual*head_mask[:,:,None];hand=residual*hand_mask[:,:,None];body=residual*body_mask[:,:,None]

def affine(layer,center,dx=0,dy=0,angle=0,sx=1,sy=1):
 cx,cy=P(*center);r=math.radians(angle);co,si=math.cos(r),math.sin(r)
 # Forward transform; inverse sampling prevents holes and needs no redraw.
 a=np.array([[co*sx,-si*sy],[si*sx,co*sy]],dtype=np.float32);inv=np.linalg.inv(a)
 ox=X-cx-dx*S;oy=Y-cy-dy*S
 xx=inv[0,0]*ox+inv[0,1]*oy+cx;yy=inv[1,0]*ox+inv[1,1]*oy+cy
 return np.stack([ndi.map_coordinates(layer[:,:,c],[yy,xx],order=1,mode='constant',cval=0) for c in range(3)],axis=-1)

def eyelid_patch():
 # Hand-authored closed eyelids follow the source face's tilted eye line.
 art=Image.fromarray(np.uint8(np.clip(rgb,0,255)));mask=Image.new('L',(W,H));d=ImageDraw.Draw(art);md=ImageDraw.Draw(mask)
 for cx,cy,rx,ry in [(619,530,29,37),(685,571,23,31)]:
  angle=math.radians(28);pts=[]
  for t in np.linspace(0,2*math.pi,64):
   u=rx*math.cos(t);v=ry*math.sin(t);pts.append(P(cx+u*math.cos(angle)-v*math.sin(angle),cy+u*math.sin(angle)+v*math.cos(angle)))
  # Match the soft lavender cheek, preserving the painted eyebrow outside the patch.
  d.polygon(pts,fill=(173,151,204));md.polygon(pts,fill=255)
  curve=[]
  for u in np.linspace(-rx*.82,rx*.82,40):
   v=5+7*(1-(u/(rx*.82))**2)
   curve.append(P(cx+u*math.cos(angle)-v*math.sin(angle),cy+u*math.sin(angle)+v*math.cos(angle)))
  d.line(curve,fill=(73,43,105),width=2,joint='curve')
 m=np.asarray(mask.filter(ImageFilter.GaussianBlur(2)),dtype=np.float32)/255
 return (np.asarray(art,dtype=np.float32)-rgb)*m[:,:,None]
blink_delta=eyelid_patch()
def smooth(t):return t*t*(3-2*t)
def key(t,points):
 for (a,v),(b,w) in zip(points,points[1:]):
  if t<=b:return v+(w-v)*smooth(max(0,(t-a)/(b-a)))
 return points[-1][1]
def pulse(t,start,end):
 return math.sin(math.pi*(t-start)/(end-start))**2 if start<t<end else 0

def render(state,i,n):
 t=i/(n if state=='idle' else n-1)
 dx=dy=ha=wa=hdx=hdy=wdx=wdy=0.;headscale=bodyheight=1.;opacity=1.;blink=0.;ripple=0.;spark=0.
 if state=='idle':
  breath=math.sin(2*math.pi*t);dy=-1.4*breath;bodyheight=1+.006*breath
  ha=.6*breath;wa=1.7*math.sin(2*math.pi*t);blink=pulse(t,.40,.52)
  spark=.35*(.5+.5*math.sin(2*math.pi*t))
 elif state=='attack':
  # Anticipate by withdrawing, raise the palm, two clear wrist waves, recover.
  dx=key(t,[(0,0),(.18,-9),(.35,3),(.72,3),(1,0)])
  dy=key(t,[(0,0),(.18,7),(.37,-4),(.72,-4),(1,0)])
  ha=key(t,[(0,0),(.18,-5),(.38,5),(.72,3),(1,0)])
  lift=key(t,[(0,0),(.18,-.2),(.34,1),(.72,1),(1,0)])
  wdy=-17*lift;wdx=-4*lift
  wa=-9*lift+(18*math.sin((t-.34)/.38*4*math.pi)*pulse(t,.28,.80) if .28<t<.80 else 0)
  ripple=pulse(t,.36,.73);spark=.5*ripple
 elif state=='hurt':
  recoil=key(t,[(0,0),(.17,1),(.36,.75),(.75,.1),(1,0)])
  dx=-13*recoil;dy=8*recoil;ha=-7*recoil;wa=-25*recoil;wdx=-8*recoil;wdy=10*recoil
  blink=key(t,[(0,0),(.12,1),(.38,1),(.63,0),(1,0)]);ripple=.5*pulse(t,.03,.49)
 elif state=='defeat':
  # A last shy goodbye, bowed face, then reflection slips down into empty glass.
  sink=smooth(max(0,min(1,(t-.20)/.80)))
  dy=115*sink;dx=-7*sink;ha=14*sink;hdy=15*sink;headscale=1-.10*sink;bodyheight=1-.12*sink
  wa=12*math.sin(t/.40*2*math.pi)*pulse(t,0,.44)-27*sink;wdy=22*sink
  blink=key(t,[(0,0),(.20,.2),(.42,1),(1,1)])
  opacity=1-smooth(max(0,min(1,(t-.28)/.72)));spark=.6*pulse(t,.45,1)
 else:raise ValueError(state)
 a=affine(body,(620,718),dx,dy,sy=bodyheight)
 a+=affine(head+blink_delta*blink,(643,546),dx+hdx,dy+hdy,ha,sx=headscale,sy=headscale)
 a+=affine(hand,(682,691),dx+wdx,dy+wdy,wa)
 result=base+a*opacity*glass[:,:,None]
 # Small reflection-contact rings and drifting glints: effects only inside glass.
 if ripple:
  px,py=P(696,658);rr=np.sqrt(((X-px)/1.0)**2+((Y-py)/.72)**2)
  ring=np.exp(-((rr-(12+26*ripple))/1.8)**2)*ripple*.28*glass
  result=result*(1-ring[:,:,None])+np.array([218,197,255])*ring[:,:,None]
 if spark:
  progress=t if state=='defeat' else (t%1)
  gx,gy=P(575+110*progress,840-470*progress)
  glow=np.exp(-(((X-gx)/3.0)**2+((Y-gy)/3.0)**2))*.7*spark*glass
  result=result*(1-glow[:,:,None])+np.array([227,221,255])*glow[:,:,None]
 # Preserve the authentic frame and alpha exactly, including all exterior pixels.
 result=np.where(glass[:,:,None]>0,result,rgb)
 rgba=np.dstack([np.clip(result,0,255),alpha]).astype(np.uint8)
 return Image.fromarray(rgba,'RGBA')

SPECS={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True)}
# Layers/contact references document the approximation honestly and reproducibly.
Image.fromarray(np.uint8(np.dstack([np.clip(base,0,255),alpha])),'RGBA').save(OUT/'empty-glass-plate.png')
image.save(OUT/'source-registered.png')
Image.fromarray(np.uint8(glass*255),'L').save(OUT/'interior-mask.png')
manifest={'enemy':'hall-mirror','method':'Source-art 2D layered rig; static authentic gold frame, articulated reflection head/body/palm, hand-authored eyelid closure, local reflection effects. Not newly painted temporal frames or AI video.','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'source_frame_size':[W,H],'runtime_frame_size':[256,384],'anchor':[128,372],'unit':360,'clips':{}}
allframes={}
for state,(n,loop,hold) in SPECS.items():
 frames=[render(state,i,n) for i in range(n)];allframes[state]=frames
 cols=9;rows=math.ceil(n/cols)
 sheet=Image.new('RGBA',(cols*W,rows*H));atlas=Image.new('RGBA',(cols*256,rows*384))
 for i,frame in enumerate(frames):
  sheet.paste(frame,(i%cols*W,i//cols*H))
  atlas.paste(frame.resize((256,384),Image.Resampling.LANCZOS),(i%cols*256,i//cols*384))
 sheet.save(OUT/f'SS_hallMirror_{state}.png');atlas.save(OUT/f'{state}.webp',lossless=True,method=4)
 small=[f.resize((256,384),Image.Resampling.LANCZOS) for f in frames]
 durations=[round((i+1)*1000/30)-round(i*1000/30) for i in range(n)]
 small[0].save(OUT/f'{state}-preview.webp',save_all=True,append_images=small[1:],duration=durations,loop=0 if loop else 1,lossless=True,method=4,minimize_size=False)
 meta={'file':f'{state}.webp','frames':n,'cols':cols,'rows':rows,'fw':256,'fh':384,'anchor':[128,372],'source':f'SS_hallMirror_{state}.png','sourceFrames':n,'grid':[cols,rows],'scale':.5,'unit':360,'loop':loop,'fps':30,'hold':hold,'sha1':hashlib.sha1((OUT/f'SS_hallMirror_{state}.png').read_bytes()).hexdigest()[:16],'duration':n/30,'authoring':'source-art-layered-rig','matte':'CLEAN'}
 manifest['clips'][state]=meta
 print(state,n,'frames written',flush=True)
 # Chronological poses include first, anticipation, gesture, recovery/finish.
 chosen=np.linspace(0,n-1,8).round().astype(int)
 contact=Image.new('RGB',(8*192,312),(30,30,38));d=ImageDraw.Draw(contact)
 for j,i in enumerate(chosen):
  f=frames[i].resize((192,288),Image.Resampling.LANCZOS);contact.paste(f,(j*192,0),f);d.text((j*192+6,292),f'{state} {i+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-contact.jpg')
(OUT/'index.json').write_text(json.dumps({'clips':manifest['clips'],'scale':.5,'unit':360},indent=2),encoding='utf-8')
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Staged representative complete',flush=True)
