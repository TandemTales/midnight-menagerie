"""Hall Mirror source-art rig. Deterministic layered compositing, not AI video.
The authentic frame and alpha remain bit-identical in every pose. Explicit premultiplied character
layers are articulated over an empty-glass plate sampled from the source's own glass.
Writes staging only; publish is a separate validated, no-overwrite operation.
"""
from pathlib import Path
import json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from scipy import ndimage as ndi
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent/'representative-v5';OUT.mkdir(exist_ok=True)
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
# A broad glass strip removes the entire reflection, including its soft glow.
# The first prototype's silhouette-shaped feather retained a ghost outline.
sy_coord=(Y-TY)/S
rise=np.clip((sy_coord-365)/50,0,1);fall=np.clip((835-sy_coord)/55,0,1)
ghost=(rise*rise*(3-2*rise))*(fall*fall*(3-2*fall))*glass

# Sample genuinely empty upper glass; retain palette, small stars and painted texture.
sx=635+(X-TX-S*635)*.62/S
sy=250+((Y-TY)/S-410)*.30
plate=np.stack([ndi.map_coordinates(np.asarray(source)[:,:,c].astype(np.float32),[sy,sx],order=1,mode='nearest') for c in range(3)],axis=-1)
base=rgb*(1-ghost[:,:,None])+plate*ghost[:,:,None]
# Explicit character silhouettes replace signed background subtraction. No moving
# negative residual or sampled glass texture is allowed above the head.
head_alpha=polygon([(548,564),(566,521),(591,481),(627,448),(670,427),(709,414),(730,420),(740,443),(745,478),(740,518),(724,564),(707,595),(689,606),(668,612),(648,615),(631,622),(619,632),(610,641),(593,648),(571,639),(552,617)],3)*glass
hand_alpha=polygon([(675,652),(669,643),(675,637),(684,642),(689,649),(692,631),(697,616),(704,616),(709,624),(706,643),(714,624),(721,625),(721,634),(715,650),(727,641),(735,644),(735,652),(725,666),(718,678),(710,688),(698,692),(685,686),(679,678)],2)*glass
body_alpha=polygon([(551,575),(574,600),(599,620),(615,641),(630,685),(642,701),(663,693),(682,678),(711,683),(714,703),(697,731),(671,749),(635,761),(595,767),(561,759),(548,713),(545,654)],5)*glass
# Overlapping neck/wrist portions are kept behind the moving head and hand.
def layer(color,matte):return np.dstack([color*matte[:,:,None],matte]).astype(np.float32)
# The torso is translucent source paint. Reject dark inter-arm glass rather
# than carrying it as an opaque patch when the wrist/head move.
brightness=(rgb[:,:,0]+rgb[:,:,1])*.5
body_strength=np.clip((brightness-58)/80,0,1);body_strength=body_strength*body_strength*(3-2*body_strength)
body_alpha*=body_strength
body=layer(rgb,body_alpha);hand=layer(rgb,hand_alpha)

def affine(layer,center,dx=0,dy=0,angle=0,sx=1,sy=1):
 cx,cy=P(*center);r=math.radians(angle);co,si=math.cos(r),math.sin(r)
 # Forward transform; inverse sampling prevents holes and needs no redraw.
 a=np.array([[co*sx,-si*sy],[si*sx,co*sy]],dtype=np.float32);inv=np.linalg.inv(a)
 ox=X-cx-dx*S;oy=Y-cy-dy*S
 xx=inv[0,0]*ox+inv[0,1]*oy+cx;yy=inv[1,0]*ox+inv[1,1]*oy+cy
 return np.stack([ndi.map_coordinates(layer[:,:,c],[yy,xx],order=1,mode='constant',cval=0) for c in range(layer.shape[2])],axis=-1)

# Build skin patches by harmonic interpolation from surrounding painted skin.
# Iris pixels remain fully visible until physically covered by the lid boundary.
EYES=[]
for cx,cy,rx,ry in [(617,531,40,49),(685,572,33,42)]:
 ex,ey=P(cx,cy);ang=math.radians(28);co,si=math.cos(ang),math.sin(ang)
 u=((X-ex)*co+(Y-ey)*si)/S;v=(-(X-ex)*si+(Y-ey)*co)/S
 ellipse=(u/rx)**2+(v/ry)**2
 mouth_guard=(((X-TX)/S>615)&((X-TX)/S<665)&((Y-TY)/S>574)&((Y-TY)/S<604))
 inner=(ellipse<1)&~mouth_guard
 # Work only in a small crop, avoiding a full-canvas iterative fill.
 ys,xs=np.where(inner);y0,y1=max(0,ys.min()-2),min(H,ys.max()+3);x0,x1=max(0,xs.min()-2),min(W,xs.max()+3)
 field=rgb[y0:y1,x0:x1].copy();hole=inner[y0:y1,x0:x1]
 border=ndi.binary_dilation(hole)&~hole
 field[hole]=field[border].mean(axis=0)
 for iteration in range(350):
  mean=(np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))*.25
  field[hole]=mean[hole]
 skin=rgb.copy();skin[y0:y1,x0:x1]=field
 EYES.append((u,v,rx,ry,ellipse,skin,mouth_guard))
def head_layer(closure):
 art=rgb.copy()
 if closure>0:
  for u,v,rx,ry,ellipse,skin,mouth_guard in EYES:
   curve=6+5*(1-np.minimum(1,(u/rx)**2))
   upper=-ry*(1-closure)+curve*closure
   lower=ry*(1-closure)+curve*closure
   # 1.2 source-pixel antialiasing only; no uniform pupil crossfade.
   cover=np.maximum(np.clip((upper-v)/1.2+.5,0,1),np.clip((v-lower)/1.2+.5,0,1))
   edge=np.clip((1-ellipse)/.08,0,1)*(~mouth_guard);cover*=edge
   art=art*(1-cover[:,:,None])+skin*cover[:,:,None]
   line=np.exp(-((v-upper)/1.1)**2)*edge*min(1,closure*4)*np.clip((rx*.78-np.abs(u))/2,0,1)
   art=art*(1-line[:,:,None])+np.array([74,44,105])*line[:,:,None]
 return layer(art,head_alpha)
# Enlarged closure sequence documents the occluding boundary for visual review.
eye_contact=Image.new('RGB',(5*210,270),(30,30,38));ed=ImageDraw.Draw(eye_contact)
for j,closed in enumerate([0,.25,.5,.75,1]):
 l=head_layer(closed);a=l[:,:,3];c=base*(1-a[:,:,None])+l[:,:,:3]
 c=np.dstack([np.uint8(np.clip(c,0,255)),np.uint8(alpha)])
 x0,y0=P(540,405);x1,y1=P(750,650)
 f=Image.fromarray(c,'RGBA').crop((round(x0),round(y0),round(x1),round(y1))).resize((210,245),Image.Resampling.LANCZOS)
 eye_contact.paste(f,(j*210,0),f);ed.text((j*210+8,250),'Closure '+str(closed),fill='white')
eye_contact.save(OUT/'eyelid-occlusion-contact.jpg')

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
  spark=.35*(.5-.5*math.cos(2*math.pi*t))
 elif state=='attack':
  # Anticipate by withdrawing, raise the palm, two clear wrist waves, recover.
  dx=key(t,[(0,0),(.18,-9),(.35,3),(.72,3),(1,0)])
  dy=key(t,[(0,0),(.18,7),(.37,-4),(.72,-4),(1,0)])
  ha=key(t,[(0,0),(.18,-5),(.38,5),(.72,3),(1,0)])
  lift=key(t,[(0,0),(.18,-.2),(.34,1),(.72,1),(1,0)])
  wdy=-25*lift;wdx=-4*lift;hdx=-4*lift
  wa=-9*lift+(24*math.sin((t-.34)/.38*4*math.pi)*pulse(t,.28,.80) if .28<t<.80 else 0)
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
 posed=[affine(body,(620,718),dx,dy,sy=bodyheight),
        affine(head_layer(blink),(643,546),dx+hdx,dy+hdy,ha,sx=headscale,sy=headscale),
        affine(hand,(682,691),dx+wdx,dy+wdy,wa)]
 result=base.copy()
 for part in posed:
  amount=opacity*glass;pa=np.clip(part[:,:,3]*amount,0,1)
  result=result*(1-pa[:,:,None])+part[:,:,:3]*amount[:,:,None]

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
manifest={'enemy':'hall-mirror','method':'Source-art 2D layered rig; static authentic gold frame, explicit alpha-composited reflection head/body/palm, physically occluding eyelids, local reflection effects. No signed background residuals. Not newly painted temporal frames or AI video.','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'source_frame_size':[W,H],'runtime_frame_size':[256,384],'anchor':[128,372],'unit':360,'clips':{}}
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
