from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
import numpy as np
p=Path('docs/enemy-roster-2026-10-26/animation-production')
im=Image.open(p/'hall-mirror-idle-v1.png').convert('RGBA')
boxes=json.loads((p/'prototype-components.json').read_text());boxes.sort(key=lambda b:(int((b[1]+b[3])/2/256),b[0]))
frames=[]
for x0,y0,x1,y1 in boxes:
 cell=im.crop((max(0,x0-2),max(0,y0-2),min(im.width,x1+2),min(im.height,y1+2)))
 f=Image.new('RGBA',(160,272));f.paste(cell,(round(80-(x1-x0)/2)-2,264-(y1-y0)-2));frames.append(f)
atlas=Image.new('RGBA',(9*160,5*272))
for i,f in enumerate(frames):atlas.paste(f,(i%9*160,i//9*272))
atlas.save(p/'hall-mirror-idle-diagnostic-atlas.png')
frames[0].save(p/'hall-mirror-idle-diagnostic.webp',save_all=True,append_images=frames[1:],duration=[33,33,34]*13+[33],loop=0,lossless=True)
masks=[np.array(f)[:,:,3]>96 for f in frames]
iou=lambda a,b:float((a&b).sum()/max(1,(a|b).sum()))
seam=iou(masks[0],masks[-1]);ious=[iou(a,b) for a,b in zip(masks,masks[1:])]
arr=np.array([np.array(f).astype(float) for f in frames]);rgb=arr[:,:,:,:3];alpha=arr[:,:,:,3]/255
# Gold mirror body should be fixed. Measure pixels golden in first frame, with high alpha.
gold=(rgb[0,:,:,0]>rgb[0,:,:,2]*1.4)&(alpha[0]>.8)
diffs=[float(np.abs(rgb[i][gold]-rgb[i-1][gold]).mean()) for i in range(1,len(frames))]
v={'frames':40,'fps':30,'duration_seconds':40/30,'loop':True,'hold':False,'grid':[9,5],'frame_size':[160,272],'anchor':[80,264],'unique_pixel_frames':len({hashlib.sha256(f.tobytes()).hexdigest() for f in frames}),'source_body_height_range':[min(b[3]-b[1] for b in boxes),max(b[3]-b[1] for b in boxes)],'silhouette_adjacent_IoU_min':min(ious),'silhouette_adjacent_IoU_mean':sum(ious)/len(ious),'silhouette_loop_seam_IoU':seam,'fixed_gold_region_rgb_MAE_mean':sum(diffs)/len(diffs),'fixed_gold_region_rgb_MAE_max':max(diffs),'note':'Diagnostic only. Components sorted row-major; translation aligns silhouette bottom-center. No invented in-betweens, duplication, deformation, background removal or final-art promotion.'}
(p/'prototype-validation.json').write_text(json.dumps(v,indent=2),encoding='utf-8');print(json.dumps(v,indent=2))
contact=Image.new('RGB',(8*160,2*294),(30,30,38));d=ImageDraw.Draw(contact)
for j,i in enumerate([0,1,2,3,9,10,18,19,20,21,22,23,28,29,38,39]):
 x=j%8*160;y=j//8*294;contact.paste(frames[i],(x,y),frames[i]);d.text((x+4,y+274),str(i+1),fill='white')
contact.save(p/'hall-mirror-idle-contact.jpg')
