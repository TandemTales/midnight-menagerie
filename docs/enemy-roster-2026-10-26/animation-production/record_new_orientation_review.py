"""Record the explicit decoded-contact review, separately from temporal approval."""
from pathlib import Path
import json,datetime
P=Path(__file__).resolve().parent;D=P/'orientation-audit';decisions=json.loads((D/'orientation-decisions.json').read_text())
items={
 'hall-mirror':('representative-v7-left','Original pupils remain biased left. Attack withdraws right, then palm/head translate left with a left-travelling glint. Hurt recoils right; return uses the same left-looking face. Gold frame and source alpha remain unchanged.'),
 'crib-curtains':('batch-02/crib-curtains-v3-left','Cloth rests with a left bias; rightward gathering precedes a shared leftward sweep of both panels. Hurt recoils right and defeat folds left. Moon stitching is not reflected.'),
 'foyer-chandelier':('batch-02/foyer-chandelier-v3-left','All flame tips lean left; the suspended body rests left of its mounting axis. Anticipation goes right and the main swing goes left; hurt recoils right. The extinguished endpoint retains the left-biased stance. Sub-1% empty-canvas alpha noise removed in derivative only.'),
 'hanging-pots':('batch-03/hanging-pots-v4-left','Whole unlettered fixture is reflected so all bowl openings face left. Each staggered strike moves left after a rightward anticipation. Hook/rack remain stable; original source and pot identity are preserved.'),
 'garden-shears':('batch-03/garden-shears-v3-left','Ready blades point upper-left; closing action points directly left. Both halves remain connected at the original flower rivet. Recovery returns upper-left and defeat lies closed pointing left. Tool is rotated, not mirrored; handle/ribbon handedness is retained.')}
for eid,(relative,note) in items.items():
 d=P/relative;production=json.loads((d/'production-manifest.json').read_text());assert production['orientation']['required']=='screen-left'
 for state in ['idle','attack','hurt','defeat']:assert (d/(state+'-contact.jpg')).exists()
 review={'enemy':eid,'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'left_in_inspected_keyposes','required':'screen-left','evidence':note,'contacts':[s+'-contact.jpg' for s in ['idle','attack','hurt','defeat']],'limits':'Decoded chronological key poses and authored motion curves reviewed. Full-speed intended-size playback and every intervening pose are not independently visually approved; no browser or game runtime test.','text_handedness':'No legible text reversed. Only the unlettered non-handed pots fixture is reflected; other props retain source handedness.'}
 (d/'orientation-review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
 decisions[eid]={'status':review['status'],'evidence':note+' Review: '+relative+'/orientation-review.json','limits':review['limits']}
 v=json.loads((d/'validation.json').read_text());v['orientation_review']=review;v['orientation_full_speed_passed']=False;(d/'validation.json').write_text(json.dumps(v,indent=2),encoding='utf-8')
decisions['oven-maw']={'status':'left_derivative_saved_integration_pending','evidence':'Framewise reflected alternate preserves all original frame counts, rates, loop/hold/ping/fade semantics; source and runtime originals untouched. Attack contact shows flame travels left. Receipt: orientation-audit/legacy-derivatives/oven-maw/saved-assets.json','limits':'Not selected by the live loader. Requires separately authorized asset-path integration; no game or full-speed test.'}
(D/'orientation-decisions.json').write_text(json.dumps(decisions,indent=2),encoding='utf-8')
print('Recorded 5 new left-staged key-pose reviews; temporal approval remains pending. Oven Maw alternate is integration-pending.')
