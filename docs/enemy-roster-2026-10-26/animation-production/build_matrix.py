"""Read-only roster audit and resumable animation production matrix; no game writes."""
from pathlib import Path
import csv, hashlib, json, html
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
ROSTER=ROOT/'docs/enemy-roster-2026-10-26/art-production/coverage-manifest.json'
entries=json.loads(ROSTER.read_text(encoding='utf-8'))['entries']
deliveries=json.loads((OUT/'animation-deliveries.json').read_text(encoding='utf-8')) if (OUT/'animation-deliveries.json').exists() else {}
orientation=json.loads((OUT/'orientation-audit/orientation-decisions.json').read_text(encoding='utf-8')) if (OUT/'orientation-audit/orientation-decisions.json').exists() else {}
# Separate cast is proposed only where the approved brief describes a supportive,
# magical or conducting gesture. These are art decisions, not gameplay registrations.
CAST={
 'grand-mirror':'Coordinate the three pane reflections as a separate distracting flourish.',
 'imaginary-friend':'Draw and erase a new rule with the crayon hand.',
 'bedside-vigil':'Coordinate the three caretakers in a shared shushing gesture.',
 'cellar-steward':'Light the ledger while recounting the unseen inventory.',
 'fountain-spirit':'Pour the impossible cup upward.',
 'midnight-fountain':'Reverse the flow and move the moon reflection.',
 'mourning-angel':'Open stone wings to shelter fellow apparitions.',
 'widow-of-the-grounds':'Light remembrance candles and gather gentle rain.',
 'black-ink-manuscript':'Make the hovering ink ribbon correct an intention.',
 'head-librarian':'Direct book silhouettes into order with a raised finger.',
 'spectral-assistant':'Mark the chart with a constellation glint.',
 'moon-lens':'Magnify the harmless reflected detail.',
 'suspended-planetarium':'Open the crescent shutter and project local stars.',
 'lamplighter':'Ignite three lamp halos in sequence.',
 'master-of-revels':'Conduct the other haunts with baton and ribbon.',
 'undertaker':'Align three violet markers into a temporary barrier.',
 'gardener-of-rot':'Raise one palm and refresh the three leaf shapes.',
 'bathhouse-matron':'Coordinate floating towels and a cropped steam puff.',
 'breathing-radiator':'Release the separate comforting warm-air pulse.',
 'rain-collector':'Store and return the measured imaginary shower.',
 'rain-chain':'Return the rain upward to pass a helpful effect backward.',
 'kennelmaster':'Give an open-handed cue coordinating fellow helpers.',
 'portion-balance':'Rebalance the grouped treat tokens as a protective benefit.',
 'moon-dial':'Borrow moon-shadow for nearby haunts.',
 'harvest-sieve':'Sift the three seeds upward to tidy a fellow haunt.',
 'prize-rosette':'Present a glowing award to a fellow haunt.',
 'great-pumpkin-cart':'Re-sort harvest shapes to redistribute a protective effect.',
 'cider-press':'Press and reserve the second impossible serving.',
 'generous-cornucopia':'Offer a renewed helping from the empty horn.',
 'harvest-effigy':'Conduct ceremonial moonlight protection with broad sleeves.',
 'house-pulse':'Give a conspicuous recovery pulse from the blue core.',
 'darning-hoop':'Mend the stitched house with the tethered blunt needle.',
 'keeper-s-hands':'Smooth an invisible wrinkle and present the tidy space.',
 'waiting-hearth':'Gather warmth into the three hovering embers.',
 'keeper':'Open the short quilt awning to shelter its own body.'
}
assert set(CAST)<=set(e['production_id'] for e in entries)
PLAN={'idle':(60,True,False),'attack':(48,False,False),'hurt':(24,False,False),'defeat':(45,False,True),'cast':(60,False,False)}
rows=[]; people=[]; inventory=[]
for e in entries:
 eid=e['production_id']; index=ROOT/'game/assets/sprites/enemy-clips'/eid/'index.json'
 old=json.loads(index.read_text(encoding='utf-8')) if index.exists() else None
 preserved=bool(e['existing_animation'])
 if preserved: assert old,eid
 if old and not preserved:
  receipt=json.loads((OUT/deliveries[eid]['receipt']).read_text(encoding='utf-8'))
  assert receipt['complete'] and receipt['enemy']==eid,eid
 states=list(old['clips']) if old else list(PLAN)[:4]+(['cast'] if eid in CAST else [])
 person={k:e[k] for k in ['production_id','name','level','region','tier','description','animation','source_path']}
 person.update(existing=preserved,saved=bool(old) and not preserved,completed=bool(old) and not preserved and deliveries[eid]['status']=='completed',base_status=e['status'],cast_reason=CAST.get(eid),actions=[])
 for state in states:
  if old:
   meta=old['clips'][state]; source=ROOT/'animations/sprites/enemies/animations'/meta['source']
   atlas=index.parent/meta['file']; size=Image.open(atlas).size
   assert size==(meta['cols']*meta['fw'],meta['rows']*meta['fh'])
   assert meta['frames']<=meta['cols']*meta['rows']
   r={'enemy_id':eid,'name':e['name'],'state':state,'status':'preserved' if preserved else deliveries[eid]['status'],'source_path':source.relative_to(ROOT).as_posix(),'runtime_path':atlas.relative_to(ROOT).as_posix(),'index_path':index.relative_to(ROOT).as_posix(),'frames':meta['frames'],'fps':meta['fps'],'duration_seconds':meta['frames']/meta['fps'],'loop':meta['loop'],'hold':meta.get('hold',False),'ping':meta.get('ping',False),'cols':meta['cols'],'rows':meta['rows'],'frame_width':meta['fw'],'frame_height':meta['fh'],'anchor':meta['anchor'],'unit':meta.get('unit',old.get('unit')),'planned_frames':None,'planned_duration_seconds':None,'validation':'preexisting atlas dimensions and bounds pass; immutable asset, no playback change' if preserved else deliveries[eid]['validation']+': technical checks passed; full-speed intended-size visual review pending','cast_reason':'Preserved authored cast' if state=='cast' else ''}
   if preserved: inventory.append({'enemy_id':eid,'state':state,'source_size':list(Image.open(source).size),'metadata':meta})
  else:
   n,loop,hold=PLAN[state]; stem=Path(e['source_path'].replace('\\','/')).stem
   r={'enemy_id':eid,'name':e['name'],'state':state,'status':'blocked_dependency' if e['status']=='blocked' else 'pending_quality_gate','source_path':f'animations/sprites/enemies/animations/SS_{stem}_{state}.png','runtime_path':f'game/assets/sprites/enemy-clips/{eid}/{state}.webp','index_path':f'game/assets/sprites/enemy-clips/{eid}/index.json','frames':None,'fps':30,'duration_seconds':None,'loop':loop,'hold':hold,'ping':False,'cols':None,'rows':None,'frame_width':None,'frame_height':None,'anchor':None,'unit':None,'planned_frames':n,'planned_duration_seconds':n/30,'validation':'No final clip produced. Frame plan is provisional, not coverage.','cast_reason':CAST.get(eid,'') if state=='cast' else ''}
  r['required_facing']='screen-left toward kid and companion'
  r['orientation_status']=orientation.get(eid,{}).get('actions',{}).get(state,orientation.get(eid,{}).get('status','orientation_review_pending' if old else 'left_staging_required'))
  r['orientation_evidence']=orientation.get(eid,{}).get('evidence','No leftward visual verification recorded; frontal/symmetric shape alone is insufficient.')
  rows.append(r);person['actions'].append(r)
 people.append(person)
from collections import Counter
summary={'identities':len(people),'preserved_enemies':sum(p['existing'] for p in people),'preserved_actions':sum(r['status']=='preserved' for r in rows),'new_final_enemies':sum(p['completed'] for p in people),'new_final_actions':sum(r['status']=='completed' for r in rows),'new_saved_enemies':sum(p['saved'] for p in people),'new_saved_actions':sum(r['status'] in ('completed','produced_review_pending') for r in rows),'visual_review_pending_actions':sum(r['status']=='produced_review_pending' for r in rows),'usable_enemies_pending':sum(not p['existing'] and not p['saved'] and p['base_status']!='blocked' for p in people),'dependency_blocked_enemies':sum(p['base_status']=='blocked' for p in people),'pending_actions':sum(r['status']=='pending_quality_gate' for r in rows),'dependency_blocked_actions':sum(r['status']=='blocked_dependency' for r in rows),'action_totals':dict(Counter(r['state'] for r in rows)),'new_cast_actions':len(CAST)}
data={'summary':summary,'contract':{'actual_enemy_states':['idle','attack','hurt','defeat','cast'],'aliases':{'damaged':'hurt','killed':'defeat'},'no_other_enemy_states_found':True,'cast_intent_families':['buff','defendBuff','defendDebuff','debuff','strongDebuff','summon'],'cast_decision':'35 new separate art actions selected from approved magical/support/conducting briefs; remaining special tells and resolves are covered by attack. Existing clips stay unchanged. These are art-production decisions, not live gameplay mappings.','new_fps':30,'old_fps':'preserved exactly','new_duration':'actual frame count / 30; planned counts remain provisional','frame_order':'row-major','pivot':'fixed shared bottom-center, scale determined from idle, no per-frame rescaling','registry':'game/assets/sprites/index.json must remain unchanged','packer':'Existing tools/prep_sprites.py reduces to 48 frames, changes fps, may ping-pong, rewrites registry and deletes stale outputs. Do not run its batch CLI. Only isolated rendering helpers or a dedicated non-destructive per-enemy exporter can be used.'},'entries':people}
data['contract']['orientation']='Mandatory screen-left gaze, attack/cast direction, effects and recovery stance. Frontal/symmetric does not qualify by itself. Check renderer mirroring before preparing derivatives; preserve legacy originals and do not edit gameplay.'
data['summary']['orientation_status_actions']=dict(Counter(r['orientation_status'] for r in rows))
(OUT/'enemy-action-matrix.json').write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
with (OUT/'enemy-action-matrix.csv').open('w',encoding='utf-8',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
(OUT/'existing-clip-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
# Gallery embeds the matrix to work from file:// without a server or fetch.
body=[]
for p in people:
 state='preserved' if p['existing'] else ('completed' if p['completed'] else ('produced / review pending' if p['saved'] else ('blocked' if p['base_status']=='blocked' else 'pending')))
 img='../../../'+p['source_path'].replace('\\','/')
 actions=', '.join(a['state'] for a in p['actions'])
 body.append(f'<tr data-search="{html.escape((p["name"]+" "+p["region"]).lower())}"><td>{html.escape(p["name"])}</td><td>{html.escape(p["region"])}</td><td>{state}</td><td>{actions}</td><td><a href="{img}">Source still</a></td></tr>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><title>Enemy animation production checkpoint</title><style>body{font:16px system-ui;background:#1e1e26;color:#eee;max-width:1100px;margin:32px auto;padding:20px}a{color:#b2cfff}canvas{background:repeating-conic-gradient(#292935 0% 25%,#353541 0% 50%) 0/24px 24px;border:1px solid #666}button,input{font:inherit;padding:8px;margin:6px}td,th{text-align:left;padding:8px;border-bottom:1px solid #555}table{border-collapse:collapse;width:100%}.warning{background:#493d24;padding:16px}img{max-width:100%}</style><h1>Animation production checkpoint</h1><p class="warning">New source-art clips are saved; full-speed intended-size visual review is pending. Existing 29 animated enemies / 118 clips preserved. Remaining production is pending. Spectral Scullion remains blocked by its prior missing-still moderation outcome.</p><p><a href="hall-mirror-preview.html">Open corrected Hall Mirror: four 30 fps clips; visual review pending</a></p><p><a href="batch-02-preview.html">Open Crib Curtains and Foyer Chandelier previews</a></p><h2>Earlier generated idle diagnostic — superseded</h2><p>40 actual distinct frames · 30 fps · 1.333 seconds · looping. Transparent source recovered into 9 × 5 cells, 160 × 272 px, fixed anchor [80,264]. This packing is diagnostic, not a delivered game asset. The stationary gold texture varies between frames; temporal quality has not passed.</p><canvas id="preview" width="320" height="544"></canvas><p><button id="play">Pause</button><button id="step">Next frame</button><span id="frame"></span></p><p><a href="hall-mirror-idle-v1.png">Original generated PNG</a> · <a href="hall-mirror-idle-diagnostic.webp">Animated WebP diagnostic</a> · <a href="hall-mirror-idle-diagnostic-atlas.png">Diagnostic atlas</a> · <a href="prototype-validation.json">Measured validation</a></p><img src="hall-mirror-idle-contact.jpg" alt="Sixteen sampled poses in chronological order"><h2>Coverage</h2><pre>SUMMARY</pre><p><a href="enemy-action-matrix.json">Complete matrix JSON</a> · <a href="enemy-action-matrix.csv">CSV</a> · <a href="existing-clip-inventory.json">Preserved clip geometry and timing</a> · <a href="preservation-validation.json">Preservation check</a></p><input id="search" placeholder="Filter enemy or region" aria-label="Filter enemies"><table><thead><tr><th>Enemy</th><th>Region</th><th>Status</th><th>Actions</th><th>Reference</th></tr></thead><tbody>ROWS</tbody></table><script>const img=new Image(),c=document.querySelector('canvas'),ctx=c.getContext('2d'),label=document.querySelector('#frame');let playing=true,frame=0,last=0;function draw(){ctx.clearRect(0,0,320,544);ctx.drawImage(img,frame%9*160,Math.floor(frame/9)*272,160,272,0,0,320,544);label.textContent='Frame '+(frame+1)+' / 40';}img.onload=()=>{draw();requestAnimationFrame(tick)};img.src='hall-mirror-idle-diagnostic-atlas.png';function tick(t){if(!last)last=t;if(playing){const count=Math.floor((t-last)*30/1000);if(count){frame=(frame+count)%40;last+=count*1000/30;draw();}}else last=t;requestAnimationFrame(tick)}document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play'};document.querySelector('#step').onclick=()=>{playing=false;document.querySelector('#play').textContent='Play';frame=(frame+1)%40;draw()};document.querySelector('#search').oninput=e=>{for(const r of document.querySelectorAll('tbody tr'))r.hidden=!r.dataset.search.includes(e.target.value.toLowerCase())};</script></html>'''.replace('ROWS',''.join(body)).replace('SUMMARY',html.escape(json.dumps(summary,indent=2)))
(OUT/'animation-gallery.html').write_text(page,encoding='utf-8')
print(json.dumps(summary,indent=2))
