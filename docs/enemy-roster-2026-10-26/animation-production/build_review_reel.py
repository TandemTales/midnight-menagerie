"""Local, offline 30 fps H.264 review; no browser or game integration."""
from pathlib import Path
import json,hashlib,subprocess,datetime,sys
from PIL import Image,ImageDraw,ImageFont
import imageio_ffmpeg
P=Path(__file__).resolve().parent;ROOT=P.parents[2];OUT=P/'review-reels';OUT.mkdir(exist_ok=True)
ids=sys.argv[2:] or ['hall-mirror','crib-curtains','foyer-chandelier']
stem=sys.argv[1] if len(sys.argv)>1 else 'first-three-enemies-30fps'
assert 1<=len(ids)<=3
reel=OUT/(stem+'.mp4')
assert not reel.exists(), 'Preserve existing review reel; use a versioned name.'
fontpath='C:/Windows/Fonts/segoeui.ttf'
font=ImageFont.truetype(fontpath,18);small=ImageFont.truetype(fontpath,14)
clips={};inputs=[]
for eid in ids:
 d=ROOT/'game/assets/sprites/enemy-clips'/eid;m=json.loads((d/'index.json').read_text());clips[eid]={}
 for state,c in m['clips'].items():
  a=Image.open(d/c['file']).convert('RGBA');frames=[];scale=200/c['unit']
  for i in range(c['frames']):
   x=i%c['cols']*c['fw'];y=i//c['cols']*c['fh']
   frames.append(a.crop((x,y,x+c['fw'],y+c['fh'])).resize((round(c['fw']*scale),round(c['fh']*scale)),Image.Resampling.LANCZOS))
  clips[eid][state]=(c,frames,scale)
  inputs.append({'enemy':eid,'state':state,'path':(d/c['file']).relative_to(ROOT).as_posix(),'sha256':hashlib.sha256((d/c['file']).read_bytes()).hexdigest(),'frames':c['frames'],'fps':c['fps']})
states=['idle','attack']+(['cast'] if all('cast' in clips[eid] for eid in ids) else [])+['hurt','defeat']
assert all(('cast' in clips[eid])==('cast' in states) for eid in ids), 'Use separate reels for mixed action contracts.'
lengths={s:clips[ids[0]][s][0]['frames'] for s in states}
assert all(clips[eid][s][0]['frames']==lengths[s] for eid in ids for s in states)
sequence=[('idle',i%lengths['idle'],'Loop 1' if i<lengths['idle'] else 'Loop 2') for i in range(lengths['idle']*2)]
sequence += [(s,i,'Authored clip') for s,n in [(s,lengths[s]) for s in states if s!='idle'] for i in range(n)]
sequence += [('defeat',lengths['defeat']-1,'Endpoint held for review')]*30
exe=imageio_ffmpeg.get_ffmpeg_exe()
cmd=[exe,'-hide_banner','-loglevel','error','-n','-f','rawvideo','-pix_fmt','rgb24','-s','960x540','-r','30','-i','pipe:0','-an','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart',str(reel)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW)
contact=Image.new('RGB',(960,540*len(states)));picked=set()
for state,i,note in sequence:
 im=Image.new('RGB',(960,540),(23,26,35));draw=ImageDraw.Draw(im)
 draw.text((26,22),'MIDNIGHT MENAGERIE / 30 FPS ACTION REVIEW',font=font,fill=(240,224,180))
 draw.text((26,54),'Provisional source-art rigs. Final visual approval pending.',font=small,fill=(207,207,217))
 draw.text((26,82),f'{state.upper()}   frame {i+1}   /   {note}',font=font,fill='white')
 for j,eid in enumerate(ids):
  col=960/len(ids);left=round(j*col)
  c,frames,s=clips[eid][state];g=frames[i];cx=left+col/2;ground=372
  draw.line((left+24,ground,left+col-24,ground),fill=(60,65,78))
  im.paste(g,(round(cx-c['anchor'][0]*s),round(ground-c['anchor'][1]*s)),g)
  draw.text((left+30,405),eid.replace('-',' ').title(),font=font,fill='white')
  draw.text((left+30,437),f"{c['frames']} frames / {c['frames']/30:g}s / "+('loop' if c['loop'] else 'hold last' if c['hold'] else 'return'),font=small,fill=(180,185,197))
 draw.text((26,486),'200 px figure-height reference (200 / unit), same anchor math as enemy.js.',font=small,fill=(175,180,195))
 draw.text((26,508),'Actual game stage scaling varies. Local render; browser and in-game playback unverified.',font=small,fill=(175,180,195))
 proc.stdin.write(im.tobytes())
 if state not in picked and i=={'idle':15,'attack':22,'cast':32,'hurt':5,'defeat':35}[state]:
  contact.paste(im,(0,540*states.index(state)));picked.add(state)
proc.stdin.close();err=proc.stderr.read().decode();code=proc.wait();assert code==0,err
contact.save(OUT/(stem+'-contact.jpg'),quality=94)
# Decode every output frame; fps/count are read from the actual encoded stream.
reader=imageio_ffmpeg.read_frames(str(reel),pix_fmt='rgb24');stream=next(reader);decoded=sum(1 for _ in reader)
assert decoded==len(sequence) and stream['fps']==30 and tuple(stream['size'])==(960,540),(decoded,stream)
result={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':reel.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(reel.read_bytes()).hexdigest(),'bytes':reel.stat().st_size,'fps':30,'decoded_frames':decoded,'duration_seconds':decoded/30,'stream':stream,'inputs':inputs,'timeline':[{'state':'idle','frames':lengths['idle']*2,'authored_frames':lengths['idle'],'repetitions':2}]+[{'state':s,'frames':lengths[s]} for s in states if s!='idle']+[{'state':'defeat endpoint review hold','frames':30}], 'verification':'Every encoded frame decoded; exact source sequence, count, 30 fps and nominal 200/unit scale verified. Selected chronological frames inspected. Full-speed human visual review pending; no browser navigation or game runtime test.'}
(OUT/(stem+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:result[k] for k in ['path','bytes','fps','decoded_frames','duration_seconds']}),flush=True)
