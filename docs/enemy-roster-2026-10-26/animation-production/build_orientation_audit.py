"""Read-only runtime-orientation contacts for all retained enemy animations."""
from pathlib import Path
import re,json,hashlib,datetime,math
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'orientation-audit';OUT.mkdir(exist_ok=True)
code=(ROOT/'game/src/ui/enemy.js').read_text(encoding='utf-8')
decl=re.search(r'const DRAWN_FACING_RIGHT = new Set\(\[(.*?)\]\)',code,re.S).group(1)
flipped=re.findall(r"'([^']+)'",decl)
matrix=json.loads((P/'enemy-action-matrix.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',15);small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',12)
entries=[];pages=[]
for j,e in enumerate(x for x in matrix['entries'] if x['existing']):
 eid=e['production_id'];d=ROOT/'game/assets/sprites/enemy-clips'/eid;meta=json.loads((d/'index.json').read_text());flip=eid in flipped
 poses=[('idle',0),('attack',.18),('attack',.48),('attack',.72),('hurt',.25),('defeat',.5),('defeat',1),('cast',.5) if 'cast' in meta['clips'] else ('idle',.5)]
 if j%5==0:pages.append(Image.new('RGB',(1280,5*238),(25,28,38)))
 page=pages[-1];draw=ImageDraw.Draw(page);top=j%5*238
 draw.text((8,top+5),eid+(' / ALREADY MIRRORED BY RENDERER' if flip else ' / AS AUTHORED'),font=font,fill=(245,220,175))
 for col,(state,fraction) in enumerate(poses):
  c=meta['clips'][state];i=round(fraction*(c['frames']-1));a=Image.open(d/c['file']).convert('RGBA');x=i%c['cols']*c['fw'];y=i//c['cols']*c['fh'];g=a.crop((x,y,x+c['fw'],y+c['fh']))
  if flip:g=g.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
  g.thumbnail((156,180),Image.Resampling.LANCZOS);page.paste(g,(col*160+(160-g.width)//2,top+30+180-g.height),g)
  draw.text((col*160+5,top+214),state+' '+str(i+1)+'/'+str(c['frames']),font=small,fill='white')
 entries.append({'enemy':eid,'actions':list(meta['clips']),'runtime_mirrored':flip,'source_index_sha256':hashlib.sha256((d/'index.json').read_bytes()).hexdigest(),'contact_page':f'legacy-runtime-{j//5+1}.jpg','orientation_status':'manual_all_action_sequence_review_pending','originals_preserved':True})
for i,page in enumerate(pages):page.save(OUT/f'legacy-runtime-{i+1}.jpg',quality=94)
result={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requirement':'All enemies face screen-left toward the kid/companion, including gaze, attack/cast gestures, effects and recovery. Frontal/symmetric alone is insufficient.','renderer_evidence':{'path':'game/src/ui/enemy.js','sha256':hashlib.sha256((ROOT/'game/src/ui/enemy.js').read_bytes()).hexdigest(),'mirrored_ids':flipped,'transform':'_mountStill applies scale(-1 1) to $still for DRAWN_FACING_RIGHT IDs; _tickClip uses positive 200/unit scale inside that parent.','note':'Legacy comment permits facing the viewer; latest instruction is stricter. No renderer edit or runtime test performed.'},'legacy_enemies':entries,'new_saved_status':'All 12 saved actions require orientation audit/correction; prior technical checks do not prove leftward staging.','blocked_dependency':'Spectral Scullion unchanged; no base-art retry.'}
(OUT/'orientation-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'legacy_enemies':len(entries),'legacy_actions':sum(len(e['actions']) for e in entries),'already_runtime_mirrored':[e['enemy'] for e in entries if e['runtime_mirrored']],'contact_pages':len(pages)}),flush=True)
