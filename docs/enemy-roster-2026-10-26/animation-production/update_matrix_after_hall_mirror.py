from pathlib import Path
import json,shutil
p=Path('docs/enemy-roster-2026-10-26/animation-production')
for name in ['enemy-action-matrix.json','enemy-action-matrix.csv','animation-gallery.html','CHECKPOINT.json','build_matrix.py']:
 backup=p/(Path(name).stem+'-before-hall-mirror'+Path(name).suffix)
 assert not backup.exists(),backup
 shutil.copyfile(p/name,backup)
f=p/'build_matrix.py';s=f.read_text(encoding='utf-8-sig')
s=s.replace("assert bool(old)==bool(e['existing_animation']),eid", "preserved=bool(e['existing_animation'])\n if preserved: assert old,eid\n if old and not preserved:\n  receipt=json.loads((OUT/'published-clips.json').read_text(encoding='utf-8'))\n  assert receipt['complete'] and receipt['enemy']==eid,eid")
s=s.replace("person.update(existing=bool(old),base_status=", "person.update(existing=preserved,completed=bool(old) and not preserved,base_status=")
s=s.replace("'status':'preserved','source_path'", "'status':'preserved' if preserved else 'completed','source_path'")
s=s.replace("'validation':'preexisting atlas dimensions and bounds pass; immutable asset, no playback change'", "'validation':'preexisting atlas dimensions and bounds pass; immutable asset, no playback change' if preserved else 'representative-v3/validation.json: all frame-sequence, identity and packing checks passed; browser playback unverified'")
s=s.replace("inventory.append({'enemy_id':eid", "if preserved: inventory.append({'enemy_id':eid")
s=s.replace("'new_final_enemies':0,'new_final_actions':0", "'new_final_enemies':sum(p['completed'] for p in people),'new_final_actions':sum(r['status']=='completed' for r in rows)")
s=s.replace("not p['existing'] and p['base_status']!='blocked' for p in people", "not p['existing'] and not p['completed'] and p['base_status']!='blocked' for p in people")
s=s.replace("state='preserved' if p['existing'] else ('blocked'", "state='preserved' if p['existing'] else ('completed' if p['completed'] else 'blocked'")
# Correct the state expression explicitly rather than relying on nested replacement shape.
line=[x for x in s.splitlines() if x.strip().startswith("state='preserved'")][0]
s=s.replace(line," state='preserved' if p['existing'] else ('completed' if p['completed'] else ('blocked' if p['base_status']=='blocked' else 'pending'))")
s=s.replace('Prototype only — no new final clips approved. Existing 29 animated enemies / 118 clips preserved.', 'Hall Mirror: four new clips complete. Existing 29 animated enemies / 118 clips preserved. Remaining production is pending.')
s=s.replace('<h2>Hall Mirror: saved idle diagnostic</h2>', '<p><a href="hall-mirror-preview.html">Open completed Hall Mirror: idle, attack, hurt and defeat at 30 fps</a></p><h2>Earlier generated idle diagnostic — superseded</h2>')
f.write_text(s,encoding='utf-8')
