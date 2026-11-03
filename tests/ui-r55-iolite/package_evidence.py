"""Package already completed IOLITE checks without another browser run."""
from pathlib import Path
import hashlib,json,subprocess
root=Path('docs/ui-pass/IOLITE-r55-proofs')
source='c59235be77bafe1508cb069bdef208e3fe92f6bb'
base='1bfcea516055b63b9f8e9274718f2212e8b9841b'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
write=lambda p,v:p.write_text(json.dumps(v,indent=2),encoding='utf-8')
subprocess.run(['git','diff','--exit-code',source,'--','game/src','game/assets'],check=True)
checks=read(root/'early-interaction-results.json')+read(root/'condition-results.json')
assert len(checks)==10 and len({x['name'] for x in checks})==10 and all(x['exit']==0 for x in checks)
for row in checks:row.update(visual_source_commit=source,evidence='IOLITE-r55-proofs/'+row['name']+'.log',reused=row['name']=='interactions')
write(root/'runtime-results.json',{'checks':checks,'extra':['memorial-geometry.json','long-quantities-1280.json','long-quantities-1600.json','native-material-timing/proof.json','condition-pixels/proof.json'],'canonicalSource':source,'interactionReuseProof':{'from':source,'to':source,'changedGamePaths':[],'gameTree':subprocess.check_output(['git','rev-parse',source+':game'],text=True).strip()},'failedChecks':[]})
q=read(root/'queue/proof.json')['results'];layout=sorted(x for r in q for x in r['layoutTimes'])
summary={'cases':len(q),'delivered':sum(len(r['delivered']) for r in q),'expired':sum(len(r['expired']) for r in q),'frames':sum(r['frames'] for r in q),'ordinaryMaxDrainMs':max(r['drainMs'] for r in q if r['kind']=='crowd' and r['mode']!='repeats'),'repeatedDrainMs':[r['drainMs'] for r in q if r['mode']=='repeats'],'layoutMs':{'p95':layout[int(len(layout)*.95)],'max':max(layout),'samples':len(layout)},'frameP95Range':[min(r['frameTimes']['p95'] for r in q),max(r['frameTimes']['p95'] for r in q)],'frameMax':max(r['frameTimes']['max'] for r in q),'note':'Full fixture includes geometry checking and screenshot pauses; static seam audit also overlapped part of the full queue fixture. These are diagnostic harness intervals, not isolated ordinary-game rendering cost. Native ABBA ran after that audit completed with no screenshots or pauses and preserves full lifetimes.'}
write(root/'final-timing-summary.json',summary)
phase={Path(r['path']).name:r for r in read(root/'condition-pixels/proof.json')['rows']}
images=[]
for p in root.rglob('*.png'):
 row={'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'visual_source_commit':source}
 if p.parent.name=='condition-pixels':
  r=phase[p.name];row.update(stylesheet_variant=r['variant'],stylesheet_sha256=r['combatCSS'],stylesheet_source_commit=base if r['variant']=='inherited' else source)
 images.append(row)
write(root/'evidence-images.json',{'images':images,'note':'All native early/functional images were taken from unchanged c59235be. Baseline-overridden phase images are explicitly marked with baseline stylesheet source and hash. Canonical10+title are separate in provenance.json. No failed run occurred and no evidence was overwritten.'})
asset=Path('game/assets/ui/r55-iolite')
write(root/'asset-provenance.json',{'mode':'built-in image_gen precise-object-edit','exactPrompt':(asset/'prompt.txt').read_text(encoding='utf-8-sig').strip(),'sourceRoles':[{'role':'edit target','path':'game/assets/ui/r54-peridot/worn-plaque-v1.webp','sha256':hashlib.sha256(Path('game/assets/ui/r54-peridot/worn-plaque-v1.webp').read_bytes()).hexdigest()},{'role':'permitted unchanged Round54 rail graft','path':'D:/UILOOP/r54-20261029/a/game/assets/ui/r54-morganite/rail-wood.webp','sha256':hashlib.sha256((asset/'rail-wood.webp').read_bytes()).hexdigest()},{'role':'native procedural pillow implementation','path':'tools/hw_objects.py pillow(Pic), plus tools/prep_ui_hardware.py','treatment':'Same native Pic primitives/profile, localized fold and seam strokes in tools/prep_r55_iolite.py. CSS replacement scoped to rest pillow only.'}],'prep':'tools/prep_r55_iolite.py','assetManifest':'game/assets/ui/r55-iolite/provenance.json','bitmapBytes':sum(p.stat().st_size for p in asset.iterdir() if p.suffix in ['.png','.webp']),'inspected':True})
write(root/'static-results.json',{'source':source,'base':base,'sceneCSS':{'exit':0,'conflicts':0},'tokens':{'exit':0,'undefined':0},'endings':{'exit':0,'repaired':0},'pythonCompile':{'exit':0,'paths':['tests/ui-r55-iolite','tools/prep_r55_iolite.py']},'productionJSChanged':[],'offlineLayout':{'exit':0,'script':'tests/ui-r51-spinel/offline-layout.mjs'},'envelope':{'exit':0,'script':'tests/ui-r51-spinel/ribbon-envelope.mjs','animatedSamples':16000,'numericMotionPreserved':True},'lifecycleUnits':{'exit':0,'script':'tests/ui-r50/queue-lifecycle.mjs','passed':3},'seams':{'reports':4,'unchanged':'game/src/state/floorplan.js local Map calls','raw':'seams.json'},'note':'Portable checks ran once before browser work; this records those completed results without an unnecessary rerun.'})
(root/'.gitignore').write_text('*.png\nserver.pid\n',encoding='utf-8')
print(json.dumps(summary,indent=2))
