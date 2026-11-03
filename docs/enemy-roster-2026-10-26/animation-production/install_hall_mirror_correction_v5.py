from pathlib import Path
import json,hashlib,shutil,os,datetime
P=Path(__file__).resolve().parent;ROOT=P.parents[2];D=P/'representative-v5'
validation=json.loads((D/'validation.json').read_text());assert validation['passed'],validation['errors']
receipt=json.loads((P/'published-clips.json').read_text());assert receipt['complete'] and receipt['enemy']=='hall-mirror'
backup=P/'revisions'/'hall-mirror-installed-v3';assert not backup.exists();backup.mkdir(parents=True)
for entry in receipt['files']:
 target=ROOT/entry['path'];assert hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==entry['sha256'],f'Conflict: {target}'
 shutil.copyfile(target,backup/target.name)
shutil.copyfile(P/'published-clips.json',backup/'receipt.json')
index=json.loads((D/'index.json').read_text());index['reviewStatus']='technical checks passed; full-speed intended-size visual review pending; browser URL policy denial respected'
(D/'index.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
new={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'enemy':'hall-mirror','states':list(index['clips']),'method':'positive-alpha-character-layers-and-occluding-eyelids','validation':'representative-v5/validation.json','quality_gate':'technical_pass_visual_review_pending','supersedes':'revisions/hall-mirror-installed-v3/receipt.json','files':[],'complete':False}
for entry in receipt['files']:
 target=ROOT/entry['path'];source=D/target.name;assert source.exists()
 temporary=target.with_name(target.name+'.hall-correction');assert not temporary.exists()
 with source.open('rb') as r,temporary.open('xb') as w:shutil.copyfileobj(r,w)
 os.replace(temporary,target)
 new['files'].append({'path':entry['path'],'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest(),'bytes':target.stat().st_size})
 (P/'published-clips.json').write_text(json.dumps(new,indent=2),encoding='utf-8')
new['complete']=True;(P/'published-clips.json').write_text(json.dumps(new,indent=2),encoding='utf-8')
registry={'hall-mirror':{'receipt':'published-clips.json','status':'produced_review_pending','staging':'representative-v5','validation':'representative-v5/validation.json'}}
(P/'animation-deliveries.json').write_text(json.dumps(registry,indent=2),encoding='utf-8')
# Regenerate the existing preview against corrected source sheets, preserving history.
f=P/'build_hall_mirror_preview.py';s=f.read_text(encoding='utf-8-sig').replace('representative-v3','representative-v5')
s=s.replace('Saved character-specific source-art rig.', 'Corrected character-specific source-art rig; full-speed intended-size visual review pending.')
s=s.replace('Browser playback has not been verified in this environment;', 'Browser opening was denied by URL policy and was not retried;')
s=s.replace('Eyelids and local glass effects are composited.', 'Opaque pupils are covered by moving eyelids; explicit character mattes replace signed background subtraction.')
f.write_text(s,encoding='utf-8')
print('Corrected only the 9 authorized Hall Mirror assets; old bytes and receipt retained.')
