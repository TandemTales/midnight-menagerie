"""Articulated shears prototype; source halves rotate around their flower rivet."""
from pathlib import Path
import math,json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'batch-03'/'garden-shears-v2';OUT.mkdir(parents=True,exist_ok=True)
SRC=P.parent/'art-production/garden-shears-original.png';W=H=512;R=384;C=9
original=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)/255;original[original[:,:,3]<=2/255]=0
ys,xs=np.where(original[:,:,3]>.05);box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
scale=342/max(box[2]-box[0],box[3]-box[1]);tx=256-(box[0]+box[2])/2*scale;ty=446-box[3]*scale
Y,X=np.mgrid[:H,:W].astype(np.float32);sx=(X-tx)/scale;sy=(Y-ty)/scale
pm=np.dstack([original[:,:,:3]*original[:,:,3,None],original[:,:,3]])
registered=np.stack([ndi.map_coordinates(pm[:,:,k],[sy,sx],order=1,mode='constant') for k in range(4)],axis=-1)
def polygon(points):
 m=Image.new('L',(W,H));ImageDraw.Draw(m).polygon([(x*scale+tx,y*scale+ty) for x,y in points],fill=255);return np.asarray(m)>0
# Front plate contains the flower pivot, upper-left blade and lower-right handle.
frontmask=polygon([(0,0),(755,0),(755,421),(776,430),(800,452),(814,483),(828,530),(1254,530),(1254,1254),(760,1254),(760,568),(705,531),(686,505),(681,473),(668,450),(620,422),(0,422)])
front=registered*frontmask[:,:,None];back=registered*(~frontmask)[:,:,None]
PIVOT=(755,476)
def rgba(a):
 alpha=np.clip(a[:,:,3],0,1);rgb=a[:,:,:3]/np.maximum(alpha[:,:,None],1e-8);return Image.fromarray(np.uint8(np.rint(np.dstack([np.clip(rgb,0,1),alpha])*255)),'RGBA')
def over(b,f):return f+b*(1-f[:,:,3,None])
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def key(t,p):
 for (a,v),(b,w) in zip(p,p[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return p[-1][1]
def affine(a,angle,dx=0,dy=0):
 cx,cy=PIVOT[0]*scale+tx,PIVOT[1]*scale+ty;r=math.radians(angle);co,si=math.cos(r),math.sin(r)
 x=X-cx-dx;y=Y-cy-dy;xx=co*x+si*y+cx;yy=-si*x+co*y+cy
 return np.stack([ndi.map_coordinates(a[:,:,k],[yy,xx],order=1,mode='constant') for k in range(4)],axis=-1)
def ribbon(a,t,amount):
 influence=np.clip((sy-900)/220,0,1);xx=X-amount*scale*influence*np.sin(3*influence+2*math.pi*t)
 return np.stack([ndi.map_coordinates(a[:,:,k],[Y,xx],order=1,mode='constant') for k in range(4)],axis=-1)
def frame(state,i,n):
 t=i/(n if state=='idle' else n-1)
 if state in ('attack','hurt') and i==n-1:t=0
 close=roll=dx=dy=wave=0.
 if state=='idle':
  close=.7*math.sin(2*math.pi*t);dy=1.5*math.sin(2*math.pi*t);wave=4*math.sin(2*math.pi*t)
 elif state=='attack':
  close=key(t,[(0,0),(.20,-5),(.43,44),(.58,44),(.80,10),(1,0)])
  wave=20*math.sin(2*math.pi*t)*math.sin(math.pi*t)**2
 elif state=='hurt':
  close=key(t,[(0,0),(.15,10),(.38,-4),(.73,1),(1,0)])
  roll=key(t,[(0,0),(.15,-5),(.42,2),(1,0)]);wave=15*math.sin(5*math.pi*t)*math.sin(math.pi*t)**2
 elif state=='defeat':
  close=44*smooth(t/.6);roll=80*smooth((t-.20)/.8);dy=135*smooth((t-.1)/.9)
  wave=8*math.sin(3*math.pi*t)*(1-t)
 else:raise ValueError(state)
 a=affine(front,close);b=affine(ribbon(back,t,wave),-close)
 return rgba(affine(over(b,a),roll,dx,dy))
rgba(registered).save(OUT/'source-registered.png')
layers=Image.new('RGBA',(W*2,H));layers.paste(rgba(front),(0,0));layers.paste(rgba(back),(W,0));layers.save(OUT/'rig-layers.png')
for state,n in [('idle',60),('attack',48),('hurt',24),('defeat',45)]:
 contact=Image.new('RGB',(6*384,414),(30,30,38));d=ImageDraw.Draw(contact)
 for j,k in enumerate(np.linspace(0,n-1,6).round().astype(int)):
  g=frame(state,k,n).resize((384,384),Image.Resampling.LANCZOS);contact.paste(g,(384*j,0),g);d.text((384*j+8,391),f'{state} {k+1}/{n}',fill='white')
 contact.save(OUT/f'{state}-prototype.jpg')
(OUT/'prototype-status.json').write_text(json.dumps({'enemy':'garden-shears','status':'prototype_not_delivered','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Separate authentic front and back halves, common flower rivet, local ribbon-tip deformation. Hidden joint geometry is not invented.','quality_gate':'Inspect open/closed joint and silhouette before generating full clips. Not coverage.'},indent=2),encoding='utf-8')
print('Garden Shears key poses staged, not delivered.',flush=True)
from pack_authored_rig import pack
unit=round((box[3]-box[1])*scale*R/W,2)
pack(OUT,'gardenShears',frame,unit,'shears-articulated-blades-handles-and-ribbon')
manifest={'enemy':'garden-shears','source':str(SRC.relative_to(ROOT)),'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'method':'Authentic front blade/handle/rivet plate and back blade/handle/ribbon rotate independently around the painted flower rivet. Ribbon tips deform locally; no hidden joint geometry is invented. Source alpha noise <=2/255 removed in derivative only.','actions':{'idle':'Suspended bob, small mechanical jaw play and localized ribbon flutter.','attack':'Handles spread in anticipation; blades perform one upward snip away from the visitor, ribbon follows, then the shears recover.','hurt':'Sharp jaw recoil and body deflection, short ribbon flutter, recover.','defeat':'Blades fold closed; the shears roll and sink gently onto their side, then remain still.'},'quality_gate':'Key poses inspected for coherent joints and identity. Full frame checks and full-speed intended-size review pending.'}
(OUT/'production-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
