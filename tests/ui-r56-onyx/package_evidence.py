"""Bind completed evidence without editing game art, frozen PNGs or measured sources."""
from pathlib import Path
import hashlib,json,subprocess
root=Path('docs/ui-pass/ONYX-r56-proofs')
base='035efe6f43bfe09f4eb267e0cc931b009179b283'
initial='9cb13654ffced0788242b93f9a25abd8b0365b1a'
repaired='9d9aba354f7e3478b44da4f5b9c71dcf96ffed1f'
source='7269f14a63ac58f8e3556ec208c24048c5839d70'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
write=lambda p,v:p.write_bytes(json.dumps(v,indent=2,ensure_ascii=False).encode('utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],text=True,encoding='utf-8').strip()
subprocess.run(['git','diff','--exit-code',source,'--','game/src','game/assets'],check=True)
assert git('rev-parse',source+':game')==git('rev-parse',repaired+':game')
final=read(root/'native-material-timing-final/proof.json')
assert final['harnessSHA256']==sha(Path('tests/ui-r56-onyx/native_timing.py'))
assert final['measuredCheckSHA256']==sha(root/'native-material-timing-final/measured-check.js')
assert final['importedFixtureSHA256']==sha(Path('tests/ui-r51-spinel/probe-queue.py'))
assert all(r['computedBefore']==r['computedAfter'] and r['computedBefore']['ownerVisibilityControlled'] and r['pausedMs']==0 for r in final['rows'])
checks=read(root/'early-interaction-results.json')+read(root/'condition-results.json')
assert len(checks)==10 and len({c['name'] for c in checks})==10 and all(c['exit']==0 for c in checks)
repair=read(root/'repaired-surfaces/proof.json');assert len(repair['rows'])==6 and not repair['errors']
changes=git('diff',initial,repaired,'--','game/src','game/assets')
write(root/'runtime-results.json',{'checks':checks,'gameSource':repaired,'canonicalSource':source,'gameTree':git('rev-parse',source+':game'),'binding':'Game tree is byte-identical from repaired source through final capture. Later commits changed only native timing harness, not visual/runtime game sources.','interactionReuse':{'source':initial,'target':repaired,'basis':'Only three paint rules were removed. Targeted native before/after check proved exact text, DOM boxes, Range ink, font, computed text color, padding and border width equality at both sizes. All original input assertions remain unchanged.','proof':'repaired-surfaces/proof.json','exactGameDiff':changes,'unchangedSourceHashes':{f:sha(Path(f)) for f in ['game/src/scenes/rest.css','game/src/scenes/combat.css','game/src/ui/kit.css','game/src/scenes/rest.js','game/src/scenes/shop.js','game/src/scenes/gameover.js','game/src/scenes/event.js']}},'extra':['memorial-geometry.json','long-quantities-1280.json','long-quantities-1600.json','native-material-timing-final/proof.json'],'functionalFailures':[],'testHarnessFailure':'failed-repair-harness/failure.json','supersededNative':'native-material-timing/protocol-status.json'})
q=read(root/'queue/proof.json')['results'];layout=sorted(x for r in q for x in r['layoutTimes'])
summary={'cases':len(q),'delivered':sum(len(r['delivered']) for r in q),'expired':sum(len(r['expired']) for r in q),'frames':sum(r['frames'] for r in q),'ordinaryMaxDrainMs':max(r['drainMs'] for r in q if r['kind']=='crowd' and r['mode']!='repeats'),'repeatedDrainMs':[r['drainMs'] for r in q if r['mode']=='repeats'],'layoutMs':{'p95':layout[int(len(layout)*.95)],'max':max(layout),'samples':len(layout)},'frameP95Range':[min(r['frameTimes']['p95'] for r in q),max(r['frameTimes']['p95'] for r in q)],'frameMax':max(r['frameTimes']['max'] for r in q),'nativeSelectedCase':final['selectedFullRunCase'],'nativeFinal':read(root/'native-material-timing-final/summary.json'),'note':'Full fixture includes screenshot pauses, style queries and geometry assertions. It is separate from final ABBA, which has zero capture pauses or computed-style queries in its measured CHECK but retains geometry assertions. Neither establishes ordinary-game cost or a universal speedup.'}
assert summary['cases']==16 and summary['delivered']==summary['expired']==96
write(root/'final-timing-summary.json',summary)
# Actual commit timeline for noncanonical screenshots; fixed source overrides for known initial/repair groups.
timeline=[]
for line in git('log','--format=%H|%ct',base+'..'+source).splitlines():
 h,t=line.split('|');timeline.append((int(t),h))
timeline.sort()
phase={Path(r['path']).name:r for r in read(root/'condition-pixels/proof.json')['rows']}
images=[]
for f in root.rglob('*.png'):
 stamp=f.stat().st_mtime
 captured=max((item for item in timeline if item[0]<=stamp),default=(0,base))[1]
 variant='native'
 if '-initial-' in f.name:captured=initial
 if f.parent.name=='condition-pixels':captured=initial;variant=phase[f.name]['variant']
 if f.parent.name=='repaired-surfaces':captured=repaired
 row={'path':str(f.resolve()),'sha256':sha(f),'visual_source_commit':captured,'fileModifiedEpoch':stamp,'variant':variant}
 if f.parent.name=='condition-pixels':row.update(stylesheet_source_commit=base if variant=='inherited' else initial,stylesheet_sha256=phase[f.name]['combatCSS'])
 images.append(row)
write(root/'evidence-images.json',{'images':images,'note':'Initial eight boards and baseline/current condition comparisons are source9cb. Repaired six views are source9d9. Other functional screenshot head bindings use their retained creation timestamps and commit timeline; every game tree after repair is identical. Canonical10+title use their separate final provenance.json. No initial or overridden screenshot is labeled canonical.'})
asset=Path('game/assets/ui/r56-onyx');assetmeta=read(asset/'provenance.json')
write(root/'asset-provenance.json',{'mode':'built-in image_gen precise-object-edit','prompts':{n:(asset/n).read_text(encoding='utf-8') for n in ['rest-prompt.txt','plaque-prompt.txt']},'manifest':assetmeta,'prep':'tools/prep_r56_onyx.py','inspectedTargetsBeforeGeneration':True,'nativeExportsInspected':True,'nativeGamePixelsInspectedAtBothSizes':True,'firstExportRepair':'Alpha1 fringe gave oversized initial crop bounds. Before first source commit/native preview, deterministic alpha8 support plus2px crop fixed framing; originals and raw/threshold/repaired bounds remain in manifest. No generated pixels repainted.'})
write(root/'static-results.json',{'source':source,'base':base,'sceneCSS':{'exit':0,'conflicts':0,'log':'scene-css.log'},'tokens':{'exit':0,'undefined':0,'log':'tokens.log'},'endings':{'exit':0,'repaired':0,'log':'endings.log','note':'Run before final packaging; no ending normalizer touched measured files.'},'pythonCompile':{'exit':0,'paths':['tests/ui-r56-onyx','tools/prep_r56_onyx.py']},'productionJSChanged':[],'portableChecks':{'source':initial,'laterGameChanges':'Three paint override removals only; no layout or algorithm changes.','offlineLayoutExit':0,'envelopeExit':0,'animatedSamples':16000,'numericMotionPreserved':True,'lifecycleUnitExit':0,'lifecycleUnits':3},'seams':{'reports':4,'unchanged':'game/src/state/floorplan.js local Map calls','raw':'seams.json'},'productionChangedPaths':git('diff','--name-only',base,source,'--','game/src').splitlines()})
# Verify unchanged supplied final capture helpers and exact selected fixture.
write(root/'capture-helper-hashes.json',{'helpers':[{'path':str(p),'sha256':sha(p)} for p in [Path('D:/UILOOP/r56-20261029/capture.py'),Path('D:/UILOOP/r56-20261029/chrome.py'),Path('D:/UILOOP/r56-20261029/combat-capture.js')]],'usedUnchanged':True})
canonical=read(root/'provenance.json');assert len(canonical['canonical'])==10 and len(canonical['images'])==11
for row in canonical['images']:assert sha(Path(row['path']))==row['sha256'] and row['visual_source_commit']==source
print(json.dumps(summary,indent=2));print('Packaged',len(images),'noncanonical image bindings; final11 immutable')
