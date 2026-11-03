"""Foyer Chandelier: fixed ceiling rose, suspended crown, three hinged crystals,
five visible flame layers. Each action has a distinct physical motion curve."""
from pathlib import Path
import math,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-02'/'foyer-chandelier-v2-left';OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'docs/enemy-roster-2026-10-26/art-production/foyer-chandelier-original.png'
W=H=512;R=384;C=9
original=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255
ys,xs=np.where(original[:,:,3]>.05);box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
scale=420/max(box[2]-box[0],box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=464-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);sx=(X-tx)/scale;sy=(Y-ty)/scale
pm=np.dstack([original[:,:,:3]*original[:,:,3,None],original[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[sy,sx],order=1,mode='constant') for k in range(4)],axis=-1)
def point(x,y):return x*scale+tx,y*scale+ty
def polygon(points):
 m=Image.new('L',(W,H));ImageDraw.Draw(m).polygon([point(*q) for q in points],fill=255);return np.asarray(m)>0
cap_mask=sy<205;used=cap_mask.copy();mount=registered*cap_mask[:,:,None]
crystals=[]
for pts,pivot in [([(414,807),(448,807),(460,840),(510,870),(510,1060),(330,1060),(330,870),(398,840)],(430,808)), ([(627,858),(651,858),(660,885),(754,920),(754,1210),(515,1210),(515,920),(614,885)],(639,859)), ([(843,870),(866,870),(878,899),(947,930),(947,1130),(755,1130),(755,930),(831,899)],(855,871))]:
 mask=polygon(pts)&~used;used|=mask;crystals.append((registered*mask[:,:,None],pivot))
flames=[]
# Wax tops slope slightly; masks end at those surfaces, leaving the candles intact.
for cx,left,right,top,bottom,slope in [(270,175,350,400,554,-.08),(445,350,535,300,477,-.12),(920,830,1000,410,560,-.10),(1058,975,1145,520,666,-.08),(811,755,865,520,645,-.06)]:
 mask=(sx>=left)&(sx<right)&(sy>=top)&(sy<bottom+slope*(sx-cx))&~used
 used|=mask;flames.append((registered*mask[:,:,None],(cx,bottom-3)))
body=registered*(~used)[:,:,None]
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def over(back,front):return front+back*(1-front[:,:,3,None])
def affine(a,pivot,angle=0,stretch_x=1,stretch_y=1):
 cx,cy=point(*pivot);r=math.radians(angle);co,si=math.cos(r),math.sin(r)
 x=X-cx;y=Y-cy;xx=(co*x+si*y)/stretch_x+cx;yy=(-si*x+co*y)/stretch_y+cy
 return np.stack([ndi.map_coordinates(a[:,:,k],[yy,xx],order=1,mode='constant') for k in range(4)],axis=-1)
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def pulse(t,a,b):return math.sin(math.pi*(t-a)/(b-a))**2 if a<t<b else 0
ROOT_PIVOT=(620,205)
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 angle=0.;beta=[0.,0.,0.];light=[1.]*5;flicker=0.;dim=1.
 if state=='idle':
  angle=.65*math.sin(2*math.pi*t)
  beta=[1.8*(math.sin(2*math.pi*t+p)-math.sin(p)) for p in [0,.45,.9]]
  flicker=math.sin(4*math.pi*t)
 elif state=='attack':
  angle=key(t,[(0,0),(.18,-2.7),(.43,6),(.67,-3.5),(1,0)])
  beta=[(8+j*1.4)*math.sin(4*math.pi*t+j*.45)*pulse(t,.16,.98) for j in range(3)]
  light=[1+.16*pulse(t,.02,.31)]*5;flicker=.7*math.sin(6*math.pi*t)*pulse(t,0,1)
 elif state=='hurt':
  angle=key(t,[(0,0),(.12,-3.8),(.33,1.7),(.76,-.15),(1,0)])
  beta=[(9-j)*math.sin(5*math.pi*t+j*.35)*pulse(t,0,.9) for j in range(3)]
  light=[1-.55*pulse(t,.05,.35)]*5;flicker=-pulse(t,.05,.35)
 elif state=='defeat':
  angle=key(t,[(0,0),(.25,1.8),(.66,-.6),(1,0)])
  beta=[(5+j)*math.sin(4*math.pi*t)*math.exp(-3*t)*(1-t) for j in range(3)]
  light=[1-smooth((t-(.12+.08*j))/.35) for j in range(5)];dim=1-.20*smooth((t-.3)/.7)
 else:raise ValueError(state)
 angle+=1.8
 result=mount.copy();main=affine(body,ROOT_PIVOT,angle);main[:,:,:3]*=.8+.2*dim;result=over(result,main)
 for j,(piece,pivot) in enumerate(crystals):
  local=affine(piece,pivot,beta[j]);local[:,:,:3]*=dim;result=over(result,affine(local,ROOT_PIVOT,angle))
 for j,(piece,pivot) in enumerate(flames):
  local=affine(piece,pivot,angle=-14,stretch_x=1+.035*flicker,stretch_y=1+.06*flicker)
  # Existing painted flames only: fade/dim them without inventing new candle shapes.
  local*=min(1,light[j]);local[:,:,:3]*=max(1,light[j]);result=over(result,affine(local,ROOT_PIVOT,angle))
 return rgba(result)
specs={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True)}
unit=round((box[3]-box[1])*scale*R/W,2);anchor=[192,348];index={'clips':{},'scale':R/W,'unit':unit,'reviewStatus':'technical validation and visual review pending'}
rgba(registered).save(OUT/'source-registered.png');Image.fromarray(np.uint8((sy<190)&(registered[:,:,3]>.5))*255).save(OUT/'root-mask.png')
for state,(n,loop,hold) in specs.items():
 frames=[frame(state,i,n) for i in range(n)];rows=math.ceil(n/C);source=Image.new('RGBA',(C*W,rows*H));atlas=Image.new('RGBA',(C*R,rows*R));small=[]
 for i,f in enumerate(frames):
  source.paste(f,(i%C*W,i//C*H));g=f.resize((R,R),Image.Resampling.LANCZOS);small.append(g);atlas.paste(g,(i%C*R,i//C*R))
 src=f'SS_foyerChandelier_{state}.png';source.save(OUT/src);atlas.save(OUT/f'{state}.webp',lossless=True,method=4)
 durations=[round((i+1)*1000/30)-round(i*1000/30) for i in range(n)]
 small[0].save(OUT/f'{state}-preview.webp',save_all=True,append_images=small[1:],duration=durations,loop=0 if loop else 1,lossless=True,method=4)
 index['clips'][state]={'file':f'{state}.webp','frames':n,'cols':C,'rows':rows,'fw':R,'fh':R,'anchor':anchor,'source':src,'sourceFrames':n,'grid':[C,rows],'scale':R/W,'unit':unit,'fps':30,'loop':loop,'hold':hold,'duration':n/30,'sha1':hashlib.sha1((OUT/src).read_bytes()).hexdigest()[:16],'matte':'CLEAN','authoring':'chandelier-crown-crystal-flame-rig'}
 contact=Image.new('RGB',(8*192,218),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,8).round().astype(int)):
  g=frames[k].resize((192,192),Image.Resampling.LANCZOS);contact.paste(g,(192*j,0),g);d.text((192*j+6,197),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-contact.jpg');print(state,n,'frames staged',flush=True)
(OUT/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
manifest={'enemy':'foyer-chandelier','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Fixed ceiling rose; crown and chain pendulum; three separately hinged source crystals; five visible source flame regions. Premultiplied-alpha source-art rig.','actions':{'idle':'Small suspended swing, phase-lagged crystals and flame flicker.','attack':'Anticipatory draw-back, brighter candles, broad announcing swing with three distinct crystal responses, then recovery.','hurt':'Short crown jerk, reactive crystal shudder and a brief flame dip, then recovery.','defeat':'Candles go out sequentially; crystal light dims and the assembly settles into a still unlit ornament.'},'quality_gate':'Pending per-frame technical and visual sequence review; no browser attempt.'}
manifest['orientation']={'required':'screen-left','method':'Crown rests with a leftward hanging bias, all source flames lean left; attack anticipates right then swings left, hurt recoils right, and defeat settles into the left-biased inactive pose. No mirroring of fixture or crystals.','flame_local_angle_degrees':-14,'rest_crown_angle_degrees':1.8,'attack_crown_angle_degrees':7.8,'status':'left_staged_contact_review_pending'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print('Foyer Chandelier staged',flush=True)
