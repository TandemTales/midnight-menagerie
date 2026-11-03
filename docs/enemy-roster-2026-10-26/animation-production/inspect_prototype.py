from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
p=Path('docs/enemy-roster-2026-10-26/animation-production')
im=Image.open(p/'hall-mirror-idle-v1.png').convert('RGBA'); a=np.array(im)
lab,n=ndi.label(a[:,:,3]>96)
parts=[]
for i,s in enumerate(ndi.find_objects(lab),1):
 if s and np.count_nonzero(lab[s]==i)>1000:
  parts.append([s[1].start,s[0].start,s[1].stop,s[0].stop])
parts.sort(key=lambda b:(int((b[1]+b[3])/2/256),b[0]))
print('components',len(parts)); print('boxes',parts)
(p/'prototype-components.json').write_text(json.dumps(parts),encoding='utf-8')
checkpoint={'status':'prototype_saved_not_approved','enemy':'hall-mirror','action':'idle','source':'hall-mirror-idle-v1.png','image_size':list(im.size),'visible_poses':40,'observed_grid':[10,4],'requested_grid':[9,4],'alpha_min':int(a[:,:,3].min()),'alpha_max':int(a[:,:,3].max()),'transparent_pixels':int((a[:,:,3]==0).sum()),'partial_alpha_pixels':int(((a[:,:,3]>0)&(a[:,:,3]<255)).sum()),'sha256':hashlib.sha256((p/'hall-mirror-idle-v1.png').read_bytes()).hexdigest(),'capabilities':'Built-in image generation returned raster sheet; Python/Pillow/SciPy available for legitimate packing and validation. No dedicated temporal animation generation tool found. Windows referenced_image_paths failed before generation; conversation-image references worked. Returned image had data URL, no savedPath; saved through bounded base64 transfer with no regeneration.','remaining_validation':['temporal coherence','pivot','loop seam','grid recovery','identity consistency'],'completed_new_final_clips':0,'completed_new_enemies':0,'existing_enemies':29,'existing_clips':118,'usable_enemies_awaiting_animation':157,'blocked_missing_still':['spectral-scullion'],'prior_save_outcome':'Large apply_patch transfer returned aborted by user; target absent on resume; bounded writes succeeded.'}
(p/'CHECKPOINT.json').write_text(json.dumps(checkpoint,indent=2),encoding='utf-8')
