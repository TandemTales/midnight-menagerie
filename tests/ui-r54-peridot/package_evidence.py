from pathlib import Path
import json,hashlib,subprocess,sys
root=Path('docs/ui-pass/PERIDOT-r54-proofs')
source='3a49caa56e8a326d63436605e98a0ef1f207b9eb'
initial='503c853a8e62717e967577a0ea2ea00b3e8ed11c'
repaired='dd246d80028fb4fed39497cf63edb9cb2d68e215'
conditions=json.loads((root/'condition-results.json').read_text(encoding='utf-8'))
board_names={'memorial','memorial-long','keepsakes','event-boundary','shop-rules'}
boards=[r for r in json.loads((root/'initial-expanded-padding/condition-results.json').read_text(encoding='utf-8')) if r['name'] in board_names]+json.loads((root/'interactions-results.json').read_text(encoding='utf-8'))
for r in conditions:r.update(visual_source_commit=repaired,evidence='PERIDOT-r54-proofs/'+r['name']+'.log')
for r in boards:r.update(visual_source_commit=initial,reused=True,evidence='PERIDOT-r54-proofs/'+r['name']+'.log')
assert len(conditions+boards)==10 and all(r['exit']==0 for r in conditions+boards)
changed=subprocess.check_output(['git','diff','--name-only',initial,source,'--','game/src','game/assets'],text=True).splitlines()
assert changed==['game/src/scenes/combat.css'],changed
(root/'runtime-results.json').write_text(json.dumps({'checks':boards+conditions,'extra':['memorial-geometry.json','long-quantities-1280.json','long-quantities-1600.json','native-material-timing/proof.json','condition-pixels/proof.json'],'boardReuseProof':{'from':initial,'to':source,'changedGamePaths':changed},'canonicalSource':source},indent=2),encoding='utf-8')
q=json.loads((root/'queue/proof.json').read_text(encoding='utf-8'))['results']
layout=sorted(x for r in q for x in r['layoutTimes'])
summary={'cases':len(q),'delivered':sum(len(r['delivered']) for r in q),'expired':sum(len(r['expired']) for r in q),'frames':sum(r['frames'] for r in q),'ordinaryMaxDrainMs':max(r['drainMs'] for r in q if r['kind']=='crowd' and r['mode']!='repeats'),'repeatedDrainMs':[r['drainMs'] for r in q if r['mode']=='repeats'],'layoutMs':{'p95':layout[int(len(layout)*.95)],'max':max(layout),'samples':len(layout)},'frameP95Range':[min(r['frameTimes']['p95'] for r in q),max(r['frameTimes']['p95'] for r in q)],'frameMax':max(r['frameTimes']['max'] for r in q),'note':'Full fixture includes screenshot pauses; frame intervals are diagnostic harness values, not isolated ordinary game cost. Native ABBA comparison has no screenshots or pauses.'}
(root/'final-timing-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps(summary,indent=2))
assets={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('game/assets/ui/r54-peridot').iterdir()}
(root/'asset-provenance.json').write_text(json.dumps({'mode':'deterministic derivatives of existing painted assets','prep':'tools/prep_r54_peridot.py','sources':['game/assets/ui/r50-garnet/quiet-velvet-v1.webp','game/assets/ui/r50-garnet/walnut-lip-v1.webp','game/assets/ui/r53-fluorite/velvet-cartouche-v1.webp'],'bytes':sum(p.stat().st_size for p in Path('game/assets/ui/r54-peridot').iterdir()),'outputs':assets,'inspected':True},indent=2),encoding='utf-8')
# Record selected evidence image hashes independently from canonical provenance.
images=[]
for p in root.rglob('*.png'):
 rel=p.relative_to(root);parts=set(rel.parts)
 if 'initial-expanded-padding' in parts or 'aborted-unchanged-rerun' in parts: origin=initial
 elif 'condition-pixels' in parts: origin=source
 elif parts.intersection({'queue','ink','lifecycle'}):origin=repaired
 elif p.name.startswith('memorial-geometry'):origin='fa332a64430d0b750cb9dfa5afd2baf236ef59cb'
 else:origin=initial
 images.append({'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'visual_source_commit':origin})
(root/'evidence-images.json').write_text(json.dumps({'images':images,'note':'Condition pixels with inherited CSS are explicitly routed-baseline variants; their individual proof records combatCSS hashes. Other images use their stated source. No screenshot is relabeled as a later documentation commit.'},indent=2),encoding='utf-8')
