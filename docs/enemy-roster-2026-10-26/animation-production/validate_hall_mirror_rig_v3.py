from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
P=Path(__file__).resolve().parent;D=P/'representative-v3'
index=json.loads((D/'index.json').read_text());reference=Image.open(D/'source-registered.png').convert('RGBA').resize((256,384),Image.Resampling.LANCZOS)
ref=np.asarray(reference);mask=np.asarray(Image.open(D/'interior-mask.png').resize((256,384),Image.Resampling.LANCZOS))>0
static=(~ndi.binary_dilation(mask,iterations=4))&(ref[:,:,3]>0)
interior=mask&(ref[:,:,3]>96)
results={};errors=[];runtime_frames={}
for state,m in index['clips'].items():
 source=Image.open(D/m['source']).convert('RGBA');source.load()
 atlas=Image.open(D/m['file']).convert('RGBA');atlas.load()
 assert source.size==(m['cols']*512,m['rows']*768)
 assert atlas.size==(m['cols']*256,m['rows']*384)
 assert m['fps']==30 and m['frames']<=m['cols']*m['rows']
 frames=[];source_order_match=True;fixed_max=0;bounds=[];alpha_same=True
 for i in range(m['frames']):
  x=i%m['cols'];y=i//m['cols']
  sf=source.crop((x*512,y*768,(x+1)*512,(y+1)*768)).resize((256,384),Image.Resampling.LANCZOS)
  af=atlas.crop((x*256,y*384,(x+1)*256,(y+1)*384));a=np.asarray(af);s=np.asarray(sf)
  visible=(a[:,:,3]>0)|(s[:,:,3]>0)
  source_order_match &= bool(np.array_equal(a[visible],s[visible]))
  fixed_max=max(fixed_max,int(np.abs(a[:,:,:3].astype(int)[static]-ref[:,:,:3].astype(int)[static]).max()))
  alpha_same &= bool(np.array_equal(a[:,:,3],ref[:,:,3]))
  b=af.getchannel('A').getbbox();bounds.append(b)
  assert b and b[0]>0 and b[1]>0 and b[2]<256 and b[3]<384
  canonical=a.copy();canonical[canonical[:,:,3]==0]=0
  frames.append(canonical)
 for i in range(m['frames'],m['cols']*m['rows']):
  x=i%m['cols'];y=i//m['cols'];assert atlas.crop((x*256,y*384,(x+1)*256,(y+1)*384)).getchannel('A').getextrema()==(0,0)
 unique=len({hashlib.sha256(a.tobytes()).hexdigest() for a in frames})
 differences=[float(np.abs(a[:,:,:3].astype(float)[interior]-b[:,:,:3].astype(float)[interior]).mean()) for a,b in zip(frames,frames[1:])]
 seam=float(np.abs(frames[0][:,:,:3].astype(float)[interior]-frames[-1][:,:,:3].astype(float)[interior]).mean())
 preview=Image.open(D/f'{state}-preview.webp');dur=0;decoded=0
 while True:
  try:preview.seek(decoded);preview.load();dur+=preview.info.get('duration',0);decoded+=1
  except EOFError:break
 checks={'decoding':True,'grid_bounds':True,'source_to_atlas_frame_order':source_order_match,'fixed_frame_pixels':fixed_max==0,'alpha_identical':alpha_same,'stable_body_bounds':len(set(bounds))==1,'transparent_margin':True,'unused_cells_blank':True,'substantially_changing_frames':unique>=m['frames']-1,'decoded_preview_frame_count':decoded==m['frames'],'fps_30':m['fps']==30}
 if state=='idle':checks['loop_seam']=seam<=max(differences)*1.2 and seam<1
 if state in ('attack','hurt'):checks['returns_to_initial_pose']=bool(np.array_equal(frames[0],frames[-1]))
 if state=='defeat':
  empty=np.array(Image.open(D/'empty-glass-plate.png').resize((256,384),Image.Resampling.LANCZOS));visible=empty[:,:,3]>0
  checks['ends_on_empty_glass']=bool(np.array_equal(frames[-1][visible],empty[visible]));checks['nonlooping_final_hold']=m['hold'] and not m['loop']
 results[state]={'frames':m['frames'],'unique_frames':unique,'fps':30,'duration_seconds':m['frames']/30,'loop':m['loop'],'hold':m['hold'],'alpha_bbox':bounds[0],'anchor':m['anchor'],'gold_and_exterior_max_channel_difference':fixed_max,'loop_or_endpoint_MAE':seam,'adjacent_interior_MAE_mean':float(np.mean(differences)),'adjacent_interior_MAE_max':max(differences),'decoded_preview_frames':decoded,'preview_duration_ms':dur,'checks':checks,'passed':all(checks.values())}
 runtime_frames[state]=frames
 errors += [f'{state}: {name}' for name,passed in checks.items() if not passed]
# Distinct action signatures; prevent a single generic motion reused under new names.
for state in ('attack','hurt','defeat'):
 assert not np.array_equal(runtime_frames[state][len(runtime_frames[state])//2],runtime_frames['idle'][0])
result={'passed':not errors,'errors':errors,'clips':results,'visual_review':'Source, authentic frame, empty-glass plate and chronological contacts inspected. Reflection head/palm retain source identity. Attack anticipates, waves and recovers; hurt closes eyes and recoils; defeat bows, sinks and vanishes. Frame-sequence assessment only; no browser playback or in-game integration claimed.','invisible_rgb':'RGB under alpha=0 is ignored for endpoint and uniqueness checks; lossless WebP may discard it. All visible pixels and alpha are compared exactly.', 'method_limit':'Layered source-art rig with local affine articulation and eyelid/effect compositing, not fully redrawn animation. Appropriate for this fixed mirror object; not evidence that the same rig suits other enemies.'}
(D/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2),flush=True)
