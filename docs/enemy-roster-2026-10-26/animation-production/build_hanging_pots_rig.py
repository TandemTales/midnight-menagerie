"""Three independently hinged copper pots; authentic rack and foreground hooks."""
from pathlib import Path
import math,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-03'/'hanging-pots-v4-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/hanging-pots-original.png';W=H=512;R=384;C=9
original=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255
# The supplied painting has alpha=1/255 noise across its otherwise empty lower canvas.
# Remove only <=2/255 alpha in this derivative, so empty-canvas noise cannot clip.
original[original[:,:,3]<=2/255]=0
ys,xs=np.where(original[:,:,3]>.05);box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
scale=396/max(box[2]-box[0],box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=464-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);sx=(X-tx)/scale;sy=(Y-ty)/scale
pm=np.dstack([original[:,:,:3]*original[:,:,3,None],original[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[sy,sx],order=1,mode='constant') for k in range(4)],axis=-1)
# Boundary follows the transparent gap between the large and middle bowls.
seam=np.interp(sy,[0,600,700,750,800,1000,1254],[570,570,599,612,619,610,610])
left=(sx<seam)&(sy>399);middle=(sx>=seam)&(sx<966)&(sy>427);right=(sx>=966)&(sy>443)
# Gold hook noses are foreground occluders. The bowl handle passes behind each.
hookL=(sx>=367)&(sx<=399)&(sy<432);hookM=(sx>=692)&(sx<=722)&(sy<452);hookR=(sx>=1041)&(sx<=1068)&(sy<468)
left&=~hookL;middle&=~hookM;right&=~hookR
masks=[left,middle,right];used=left|middle|right;mount=registered*(~used)[:,:,None]
pieces=[registered*m[:,:,None] for m in masks];pivots=[(370,412),(700,440),(1047,453)]
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def over(back,front):return front+back*(1-front[:,:,3,None])
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def pose(a,pivot,angle,drop=0,fade=1):
 cx,cy=pivot[0]*scale+tx,pivot[1]*scale+ty;r=math.radians(angle);co,si=math.cos(r),math.sin(r)
 x=X-cx;y=Y-cy-drop*scale;xx=co*x+si*y+cx;yy=-si*x+co*y+cy
 return np.stack([ndi.map_coordinates(a[:,:,k],[yy,xx],order=1,mode='constant') for k in range(4)],axis=-1)*fade
def parameters(state,t,j):
 angle=drop=0.;fade=1.
 if state=='idle':
  phase=[0,.65,1.25][j];angle=[.75,1.1,1.35][j]*(math.sin(2*math.pi*t+phase)-math.sin(phase))
 elif state=='attack':
  # Lead pot tilts first; the two followers answer as a short kitchen rhythm.
  curves=[[(0,0),(.18,3.1),(.37,-3.4),(.54,1.5),(.74,-.7),(1,0)],[(0,0),(.22,1.5),(.40,-4.2),(.58,2.3),(.78,-.8),(1,0)],[(0,0),(.32,1.8),(.53,-5.6),(.70,3.8),(.88,-1.2),(1,0)]]
  angle=key(t,curves[j])
 elif state=='hurt':
  peak=[3.6,4.6,5.5][j];angle=key(t,[(0,0),(.13,peak),(.34,-peak*.55),(.58,peak*.23),(.85,-peak*.04),(1,0)])
 elif state=='defeat':
  # Handles slip off one after another; pots sink and dissolve, leaving the rack.
  q=max(0,min(1,(t-j*.10)/(1-j*.10)));angle=[-4,5,-7][j]*math.sin(math.pi*q)*(1-q)
  drop=80*smooth(q);fade=1-smooth((q-.22)/.78)
 else:raise ValueError(state)
 return angle,drop,fade
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 result=np.zeros_like(registered)
 # Fixed source hook caps occlude the joints; bowls remain independently articulated.
 for j in [2,1,0]:result=over(result,pose(pieces[j],pivots[j],*parameters(state,t,j)))
 return rgba(over(result,mount)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
specs={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True)}
unit=round((box[3]-box[1])*scale*R/W,2);anchor=[192,348];index={'clips':{},'scale':R/W,'unit':unit,'reviewStatus':'technical validation and visual review pending'}
rgba(registered).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT/'source-registered.png');rgba(mount).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT/'defeated-mount.png');Image.fromarray(np.uint8((sy<370)&(registered[:,:,3]>.5))*255).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT/'root-mask.png')
layers=Image.new('RGBA',(W*4,H))
for j,layer in enumerate([mount]+pieces):layers.paste(rgba(layer),(j*W,0))
layers.save(OUT/'rig-layers.png')
for state,(n,loop,hold) in specs.items():
 frames=[frame(state,i,n) for i in range(n)];rows=math.ceil(n/C);source=Image.new('RGBA',(C*W,rows*H));atlas=Image.new('RGBA',(C*R,rows*R));small=[]
 for i,f in enumerate(frames):
  source.paste(f,(i%C*W,i//C*H));g=f.resize((R,R),Image.Resampling.LANCZOS);small.append(g);atlas.paste(g,(i%C*R,i//C*R))
 src=f'SS_hangingPots_{state}.png';source.save(OUT/src);atlas.save(OUT/f'{state}.webp',lossless=True,method=4)
 durations=[round((i+1)*1000/30)-round(i*1000/30) for i in range(n)]
 small[0].save(OUT/f'{state}-preview.webp',save_all=True,append_images=small[1:],duration=durations,loop=0 if loop else 1,lossless=True,method=4)
 index['clips'][state]={'file':f'{state}.webp','frames':n,'cols':C,'rows':rows,'fw':R,'fh':R,'anchor':anchor,'source':src,'sourceFrames':n,'grid':[C,rows],'scale':R/W,'unit':unit,'fps':30,'loop':loop,'hold':hold,'duration':n/30,'sha1':hashlib.sha1((OUT/src).read_bytes()).hexdigest()[:16],'matte':'CLEAN','authoring':'three-copper-pots-hinged-rig'}
 contact=Image.new('RGB',(8*256,282),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,8).round().astype(int)):
  g=frames[k].resize((256,256),Image.Resampling.LANCZOS);contact.paste(g,(256*j,0),g);d.text((256*j+6,261),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-contact.jpg');print(state,n,'frames staged',flush=True)
(OUT/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
manifest={'enemy':'hanging-pots','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Three separate source-painted pots rotating about individual handle joints beneath authentic fixed rack/hook occluders. Premultiplied alpha sampling. No whole-rack motion.','actions':{'idle':'Three small phase-offset suspended sways.','attack':'Lead pot anticipates with a tilt; three staggered short swings answer as a kitchen rhythm, settling through a tiny final clink.','hurt':'Immediate alternating recoil, two diminishing rebounds, return to rest.','defeat':'Handles slip in sequence; each pot sinks and dissolves, leaving the stationary empty rack and hooks.'},'quality_gate':'Technical and chronological review pending; full-speed review unverified.'}
manifest['orientation']={'required':'screen-left','method':'Reflect the complete unlettered rack and pots so bowl openings face left; staggered anticipations move right and strike swings move left after reflection. No anatomy or handed tool is mirrored. Pivot stays at the cell center.','horizontal_reflection':True,'status':'left_staged_contact_review_pending'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Hanging Pots staged',flush=True)
