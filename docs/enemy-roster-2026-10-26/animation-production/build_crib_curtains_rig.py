"""Object-specific Crib Curtains mesh rig; no Hall Mirror animation is reused."""
from pathlib import Path
import math,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-02'/'crib-curtains-v3-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'docs/enemy-roster-2026-10-26/art-production/crib-curtains-original.png'
W=H=512;R=384;C=9
original=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255
mask=original[:,:,3]>.05;yy,xx=np.where(mask);box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
scale=420/max(box[2]-box[0],box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=464-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);sx=(X-tx)/scale;sy=(Y-ty)/scale
pm=np.dstack([original[:,:,:3]*original[:,:,3,None],original[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[sy,sx],order=1,mode='constant') for k in range(4)],axis=-1)
cloth=sy>195
left=registered*(cloth&(sx<625))[:,:,None];right=registered*(cloth&(sx>=625))[:,:,None];mount=registered*(~cloth)[:,:,None]
root_mask=(sy<184)&(registered[:,:,3]>.5)
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=np.divide(a[:,:,:3],np.maximum(alpha[:,:,None],1e-8));return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def over(back,front):return front+back*(1-front[:,:,3,None])
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0

def panel(layer,side,opening,sway,lift,stretch,ripple,fade,aim):
 top=195*scale+ty;sample_y=top+(Y-top)/stretch
 local=(sample_y-ty)/scale
 amount=np.clip((local-195)/905,0,1)
 # Continuous cloth deformation: ring attachment is fixed; tiebacks lift locally.
 sample_y+=lift*scale*np.exp(-((local-700)/140)**2)
 displacement=side*scale*(opening*amount**.8+sway*amount**1.5+ripple*np.sin(amount*math.pi*2)*amount)
 sample_x=X-displacement-aim*scale*amount**.8
 warped=np.stack([ndi.map_coordinates(layer[:,:,k],[sample_y,sample_x],order=1,mode='constant') for k in range(4)],axis=-1)
 return warped*fade

def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 opening=sway=lift=ripple=0.;stretch=1.;fadeL=fadeR=1.;aim=-8.
 if state=='idle':
  sway=7*math.sin(2*math.pi*t);ripple=3*math.sin(4*math.pi*t);lift=1.8*(1-math.cos(2*math.pi*t))
 elif state=='attack':
  opening=key(t,[(0,0),(.18,-25),(.47,32),(.68,32),(1,0)])
  aim=key(t,[(0,-8),(.18,16),(.43,-48),(.68,-48),(1,-8)])
  lift=key(t,[(0,0),(.18,4),(.43,22),(.70,12),(1,0)])
  ripple=8*math.sin(4*math.pi*t)*pulse(t,.12,.90)
 elif state=='hurt':
  recoil=key(t,[(0,0),(.14,1),(.38,.6),(.80,.04),(1,0)])
  opening=-36*recoil;sway=9*math.sin(7*math.pi*t)*pulse(t,.05,.75);stretch=1-.035*recoil;lift=-11*recoil;ripple=10*recoil
  aim=-8+30*recoil
 elif state=='defeat':
  bow=smooth(t/.65);opening=-52*bow;stretch=1+.055*bow;lift=-12*bow
  aim=-8-24*bow
  ripple=6*math.sin(2*math.pi*t)*pulse(t,0,.8)
  fadeL=1-smooth((t-.28)/.72);fadeR=1-smooth((t-.36)/.64)
 else:raise ValueError(state)
 a=panel(left,-1,opening,sway,lift,stretch,ripple,fadeL,aim)
 b=panel(right,1,opening,-sway*.8,lift*.88,stretch,-ripple*.7,fadeR,aim)
 return rgba(over(over(mount,a),b))

specs={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True)}
unit=round((box[3]-box[1])*scale*R/W,2);anchor=[192,348]
index={'clips':{},'scale':R/W,'unit':unit,'reviewStatus':'technical validation and visual review pending'}
rgba(registered).save(OUT/'source-registered.png');rgba(mount).save(OUT/'defeated-mount.png');Image.fromarray(np.uint8(root_mask)*255).save(OUT/'root-mask.png')
for state,(n,loop,hold) in specs.items():
 frames=[frame(state,i,n) for i in range(n)];rows=math.ceil(n/C)
 source=Image.new('RGBA',(C*W,rows*H));atlas=Image.new('RGBA',(C*R,rows*R));small=[]
 for i,f in enumerate(frames):
  source.paste(f,(i%C*W,i//C*H));g=f.resize((R,R),Image.Resampling.LANCZOS);small.append(g);atlas.paste(g,(i%C*R,i//C*R))
 src=f'SS_cribCurtains_{state}.png';source.save(OUT/src);atlas.save(OUT/f'{state}.webp',lossless=True,method=4)
 duration=[round((i+1)*1000/30)-round(i*1000/30) for i in range(n)]
 small[0].save(OUT/f'{state}-preview.webp',save_all=True,append_images=small[1:],duration=duration,loop=0 if loop else 1,lossless=True,method=4)
 index['clips'][state]={'file':f'{state}.webp','frames':n,'cols':C,'rows':rows,'fw':R,'fh':R,'anchor':anchor,'source':src,'sourceFrames':n,'grid':[C,rows],'scale':R/W,'unit':unit,'fps':30,'loop':loop,'hold':hold,'duration':n/30,'sha1':hashlib.sha1((OUT/src).read_bytes()).hexdigest()[:16],'matte':'CLEAN','authoring':'curtain-panels-mesh-rig'}
 contact=Image.new('RGB',(8*192,218),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,8).round().astype(int)):
  g=frames[k].resize((192,192),Image.Resampling.LANCZOS);contact.paste(g,(192*j,0),g);d.text((192*j+6,197),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-contact.jpg');print(state,n,'frames staged',flush=True)
(OUT/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
manifest={'enemy':'crib-curtains','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Two independently deformed authentic cloth panels, fixed rod/rings, local tieback lift and traveling hem deformation. Premultiplied alpha interpolation. No generic whole-image transform.','actions':{'idle':'Small phase-offset hem sway; attachments fixed.','attack':'Panels gather inward in anticipation, tiebacks lift, panels part broadly and recover.','hurt':'Inward flinch, briefly compressed folds and an asymmetric hem flutter, then recover.','defeat':'Both panels bow and sag, then independently dissolve from the empty curtain rod; hold the remaining rod/rings.'},'quality_gate':'Pending per-frame technical and visual sequence review; no browser attempt.'}
manifest['orientation']={'required':'screen-left','method':'Resting cloth is biased left; both panels gather right, then sweep left with an asymmetric opening. Hurt recoils right, defeat folds left. Fixed rod and source moon stitching are not mirrored.','attack_shared_hem_bias_source_pixels':-48,'status':'left_staged_contact_review_pending'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print('Crib Curtains staged',flush=True)
