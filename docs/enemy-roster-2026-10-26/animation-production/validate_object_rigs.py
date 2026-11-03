"""Decode and compare staged object-rig sheets, atlases and timed previews."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent
for relative in sys.argv[1:]:
 D=P/relative;meta=json.loads((D/'index.json').read_text());manifest=json.loads((D/'production-manifest.json').read_text());clips={};errors=[];allframes={}
 root=np.asarray(Image.open(D/'root-mask.png').resize((384,384),Image.Resampling.NEAREST))>0 if (D/'root-mask.png').exists() else None
 if root is not None:root=ndi.binary_erosion(root,iterations=2)
 registered=np.asarray(Image.open(D/'source-registered.png').resize((384,384),Image.Resampling.LANCZOS))
 for state,m in meta['clips'].items():
  sheet=Image.open(D/m['source']).convert('RGBA');sheet.load();atlas=Image.open(D/m['file']).convert('RGBA');atlas.load()
  grid=sheet.size==(m['cols']*512,m['rows']*512) and atlas.size==(m['cols']*384,m['rows']*384)
  frames=[];order=True;bounds=[]
  for i in range(m['frames']):
   x=i%m['cols'];y=i//m['cols'];s=np.asarray(sheet.crop((x*512,y*512,(x+1)*512,(y+1)*512)).resize((384,384),Image.Resampling.LANCZOS))
   im=atlas.crop((x*384,y*384,(x+1)*384,(y+1)*384));a=np.asarray(im).copy();visible=(s[:,:,3]>0)|(a[:,:,3]>0)
   order&=bool(np.array_equal(s[visible],a[visible]));bounds.append(im.getchannel('A').getbbox());a[a[:,:,3]==0]=0;frames.append(a)
  first=frames[0];rootdiff=max(int(np.abs(a.astype(int)[root]-first.astype(int)[root]).max()) for a in frames) if root is not None else None
  unused=True
  for i in range(m['frames'],m['cols']*m['rows']):
   x=i%m['cols'];y=i//m['cols'];unused&=atlas.crop((x*384,y*384,(x+1)*384,(y+1)*384)).getchannel('A').getextrema()==(0,0)
  def pm(a):return np.dstack([a[:,:,:3].astype(float)*(a[:,:,3,None]/255),a[:,:,3]])
  diffs=[float(np.abs(pm(a)-pm(b)).mean()) for a,b in zip(frames,frames[1:])]
  seam=float(np.abs(pm(frames[-1])-pm(frames[0])).mean())
  unique=len({hashlib.sha256(a.tobytes()).hexdigest() for a in frames})
  preview=Image.open(D/f'{state}-preview.webp');count=duration=0
  while True:
   try:preview.seek(count);preview.load();duration+=preview.info.get('duration',0);count+=1
   except EOFError:break
  checks={'decoded':True,'grid_bounds':grid,'row_major_source_order':order,'unused_cells_transparent':unused,'fixed_attachment_pixels':rootdiff==0,'constant_metadata_pivot':m['anchor']==[192,348] and m['unit']==meta['unit'],'no_canvas_edge_clipping':all((b and min(b[:2])>0 and b[2]<384 and b[3]<384) or (b is None and manifest['enemy'] in ('imaginary-friend','sleepwalking-ghost') and state=='defeat' and j==len(bounds)-1) for j,b in enumerate(bounds)),'changing_frames':unique>=m['frames']-1,'all_adjacent_frames_change':all(x>0 for x in diffs),'preview_count':count==m['frames'],'preview_duration':duration==round(m['frames']*1000/30),'fps_30':m['fps']==30}
  if root is None:del checks['fixed_attachment_pixels']
  if state=='idle':checks['loop_boundary']=seam<1.5 and seam<=max(diffs)*1.2
  if state in ('attack','hurt','cast'):checks['returns_exactly_to_first_pose']=bool(np.array_equal(first,frames[-1]))
  if state=='defeat':
   checks['nonlooping_final_hold']=m['hold'] and not m['loop']
   if manifest['enemy'] in ('crib-curtains','hanging-pots'):
    end=np.asarray(Image.open(D/'defeated-mount.png').resize((384,384),Image.Resampling.LANCZOS)).copy();end[end[:,:,3]==0]=0;checks['ends_on_empty_rod']=bool(np.array_equal(end,frames[-1]))
   elif manifest['enemy']=='garden-shears':
    b=bounds[-1];checks['closed_shears_lie_on_side']=(b[2]-b[0])>(b[3]-b[1])*1.35
    yy=np.arange(384)[:,None];centroid=lambda a:float((a[:,:,3]*yy).sum()/a[:,:,3].sum())
    checks['settles_downward']=centroid(frames[-1])>centroid(first)+35
   elif manifest['enemy']=='bedsheet-apparition':
    checks['settles_into_folded_cloth']=(bounds[-1][3]-bounds[-1][1])<(bounds[0][3]-bounds[0][1])*.2
    checks['hem_remains_grounded']=abs(bounds[-1][3]-bounds[0][3])<4
   elif manifest['enemy']=='topiary-hare':
    checks['ears_and_head_wilt_downward']=bounds[-1][1]>bounds[0][1]+35
   elif manifest['enemy']=='masquerade-mask':
    yy=np.arange(384)[:,None];centroid=lambda a:float((a[:,:,3]*yy).sum()/a[:,:,3].sum())
    checks['inactive_mask_sinks']=centroid(frames[-1])>centroid(first)+20
   elif manifest['enemy'] in ('imaginary-friend','sleepwalking-ghost'):
    checks['ends_fully_erased']=not np.any(frames[-1][:,:,3])
   elif manifest['enemy']=='rain-chain':
    checks['cups_settle_into_tipped_chain']=(bounds[-1][3]-bounds[-1][1])<(bounds[0][3]-bounds[0][1])*.90
   elif manifest['enemy']=='rocking-chair':
    checks['distinct_inactive_final_pose']=seam>3
   else:
    checks['substantial_light_extinction']=float(frames[-1][:,:,3].sum())<float(first[:,:,3].sum())*.96
  if manifest['enemy']=='topiary-hare':
   connected=[]
   for a in frames:
    labels,n=ndi.label(a[:,:,3]>32);counts=np.bincount(labels.ravel())[1:];connected.append(float(counts.max()/counts.sum()))
   checks['body_and_joints_remain_connected']=min(connected)>.98
  if manifest['enemy']=='rocking-chair':
   floors=[int(np.where(a[:,:,3]>64)[0].max()) for a in frames]
   checks['continuous_floor_contact']=max(floors)-min(floors)<=2
  clips[state]={'frames':m['frames'],'fps':30,'duration_seconds':m['frames']/30,'unique_visible_frames':unique,'fixed_attachment_max_difference':rootdiff,'loop_or_endpoint_premultiplied_MAE':seam,'max_adjacent_premultiplied_MAE':max(diffs),'preview_frames':count,'preview_duration_ms':duration,'checks':checks,'passed':all(checks.values())}
  errors.extend(state+': '+k for k,v in checks.items() if not v);allframes[state]=frames
 shared_rest={s:bool(np.array_equal(f[0],allframes['idle'][0])) for s,f in allframes.items() if s!='idle'}
 errors.extend(s+': initial_pose_differs_from_idle' for s,v in shared_rest.items() if not v)
 result={'enemy':manifest['enemy'],'technical_passed':not errors,'errors':errors,'clips':clips,'shared_ready_pose':shared_rest,'method':manifest['method'],'visual_gate':'Chronological contacts inspected separately; full-speed intended-size visual review pending. Browser URL-policy denial respected; no browser attempt or alternate surface used.','integration':'No game registry or gameplay test performed.'}
 (D/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(manifest['enemy'], 'PASS' if not errors else 'FAIL',errors,flush=True)
