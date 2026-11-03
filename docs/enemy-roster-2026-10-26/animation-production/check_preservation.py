import json,hashlib
from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production')
b=json.loads((p/'preexisting-assets-sha256.json').read_text(encoding='utf-8'))
changes_file=p/'authorized-timing-changes.json'
authorized={x['path']:x for x in json.loads(changes_file.read_text())['files']} if changes_file.exists() else {}
archive_manifest=Path('docs/rollbacks/2026-10-27-new-enemy-art/restoration-manifest.json')
archive_data=json.loads(archive_manifest.read_text()) if archive_manifest.exists() else {}
archived={x['path']:x for x in archive_data.get('files',[])} if archive_data.get('status')=='completed_verified' else {}
archive_root=(archive_manifest.parent/'assets').resolve()
changed=[];missing=[];accepted=[];accepted_archived=[]
print('Checking preservation baseline',len(b),flush=True)
for path,expected in b.items():
 f=Path(path)
 if not f.exists():
  rule=archived.get(path);target=Path(rule['archive_path']) if rule else None
  valid=bool(rule and target.resolve().is_relative_to(archive_root) and target.is_file() and rule['sha256']==expected and hashlib.sha256(target.read_bytes()).hexdigest()==expected)
  (accepted_archived if valid else missing).append(path)
 elif hashlib.file_digest(f.open('rb'),'sha256').hexdigest()!=expected:
  rule=authorized.get(path);valid=False
  if rule and path.startswith('game/assets/sprites/enemy-clips/') and path.endswith('/index.json'):
   backup=Path(rule['backup'])
   if backup.exists() and hashlib.sha256(backup.read_bytes()).hexdigest()==expected==rule['before_sha256'] and hashlib.sha256(f.read_bytes()).hexdigest()==rule['after_sha256']:
    old=json.loads(backup.read_text());new=json.loads(f.read_text());expected_meta=json.loads(backup.read_text())
    for clip in expected_meta['clips'].values():clip['fps']=30
    valid=new==expected_meta
  (accepted if valid else changed).append(path)
v={'checked':len(b),'unchanged':len(b)-len(changed)-len(missing)-len(accepted)-len(accepted_archived),'authorized_timing_changes':accepted,'authorized_archived_files':accepted_archived,'changed':changed,'missing':missing,'passed':not changed and not missing,'note':'Immutable baseline retained. Exact fps-only legacy index changes accepted. The 310 assistant-generated still files present at animation baseline creation may be absent only when the completed user-authorized rollback manifest and exact archived hash match. Original images remain unchanged.'}
(p/'preservation-validation.json').write_text(json.dumps(v,indent=2),encoding='utf-8')
print(json.dumps(v),flush=True)
