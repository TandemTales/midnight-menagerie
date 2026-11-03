"""Prepare evidence-backed parent acceptance after the selected seven gates."""
from pathlib import Path
import json
import subprocess

root=Path('D:/UILOOP/r55-20261029'); wt=root/'b'
head='5a4c985298d63b392712544a0c113cde08bfabaf'
visual='c59235be77bafe1508cb069bdef208e3fe92f6bb'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def git(*a): return subprocess.check_output(['git','-C',str(wt),*a],text=True).strip()
assert git('rev-parse','HEAD')==head and not git('diff','--name-only') and not git('diff','--cached','--name-only')
assert not git('diff','--name-only',visual,head,'--','game/src','game/assets')
result=read(Path('docs/ui-pass/RESULTS-r55.json'))
assert result['winner']=='IOLITE' and result['votes']==['IOLITE','ALMANDINE','IOLITE'] and not result['all_fit_thresholds_met']
gates=read(root/'winner-battery/results.json'); assert len(gates)==7 and all(r['exit']==0 for r in gates)
static=read(root/'parent-static/acceptance.json'); assert static['known_seam_reports_only'] and static['source_unchanged']
assert all(r['exit']==0 for r in static['results'] if r['check']!='seams')
shutdown=read(root/'winner-battery/server-shutdown.json'); assert shutdown['pidAbsent'] and shutdown['portClear']
audits=read(Path('docs/ui-pass/PROOF-AUDIT-r55.json'))['candidates']
assert len(audits)==3 and all(r['raw_functional_invariants_pass'] and r['server_shutdown']['portClear'] for r in audits)
proof=next(r for r in audits if r['code']=='IOLITE')
assert proof['head']==head and proof['visual_sources']==[visual] and proof['labels']==96 and proof['frames']==2535
scope=next(r for r in read(Path('docs/ui-pass/SCOPE-AUDIT-r55.json'))['candidates'] if r['code']=='IOLITE')
assert scope['commit']==head and scope['changed_files']==75 and scope['game_javascript_unchanged']
assert len(read(Path('docs/ui-pass/ASSERTION-AUDIT-r55.json'))['rows'])==3
completion=f'''IOLITE selected by two of three independent blind image-only reviews:
IOLITE, ALMANDINE, IOLITE. Descriptive IOLITE scores8.2/8.0/8.24 versus
baseline7.9/8.1/8.17; none of the five paired screens reached9+reference-fit.
Selected evidence commit{head}, actual visual source{visual}.
The selected75files are applied as working changes with exact byte verification;
main HEAD/index preserved, no main commit/push. All seven parent browser gates
pass, along with read-only CSS/token/syntax/endings/whitespace checks; only the
four known floorplan local-Map audit reports remain. All ten validated images
retain the original frozen hashes. Builder servers15364/9551,28692/9552,2820/9553
and parent{shutdown['pid']}/9554 were verified/stopped; GPU is free.

Six scoped CSS files change painted plaques, live title faces, quiet rails,
local rest lighting/native pillow folds, red cloth and shop-only card rims.
No production JavaScript or algorithms changed. Four new bitmap files, including
the generated original, total2,005,063bytes. Exact built-in imagegen prompt,
source roles, original and exported hashes remain under r55-iolite.

Parent independently checked16cases/96full lives/2535frames,10ink cases,
resize/owner teardown, all board interactions/content and109actual card
definitions each×12 at both sizes. Complete initial memorial geometry passes.
Early interactions reuse the exact same game source. No runtime test failed.
Native ABBA retains24full lives, matching semantic styles before/after and
eight native URL/HTTP/decode/local-hash checks with zero capture pauses.
Baseline p95[28.4,30.3]ms versus current[25.3,24.6]ms is bounded evidence of
no added penalty in that sample, not a general speedup. Full-fixture timings
include screenshots/geometry and a static seam-audit overlap; do not interpret
them as isolated ordinary-game cost. All three candidate raw proofs and scope
audits are retained. ZIRCON's later evidence-only commit was verified against
its frozen game and images; three extra owned preparation helpers were inspected.

Round56 targets material visible at native size: painted small objects,
dimensional plaque lips, irregular live letter planes, local shop metalwork,
memorial enamel and physical cloth/paper boundaries. Preserve all user scope,
larger fonts, animation rate, map work, actor placement and complete content.
'''
review={
 'accepted':True,'winner':'IOLITE','selected_commit':head,'comparison_source':visual,
 'owned_servers_stopped':True,'completion_text':completion,
 'selected_post_review_repair_required':False,
 'scope_review':'Six presentation CSS files; no production JavaScript changes. Four bitmap assets including generated original; all other changes are owned tests, evidence and preparation.',
 'derivative_asset_bytes':scope['raster_asset_bytes'],
 'static_checks':{'scene_css_conflicts':0,'undefined_css_tokens':0,'seam_sites':9110,'unchanged_local_Map_false_positives':4,'syntax':'pass','endings':'read-only54text-path numstat matches ignore-cr-at-eol','whitespace':'pass'},
 'combat_proofs':{'labels':96,'frames':2535,'ink_cases':10,'actual_long_quantity_rows':109,'copies_each':12,'full_initial_memorial_geometry':'pass'},
 'runtime_provenance':proof['runtime_checks'],
 'controlled_rendering_validation':proof['native_abba'],
 'evidence_limitations':['Full fixture includes geometry checks/screenshots and a static seam-audit overlap; not isolated game cost.','Native ABBA is four bounded trials on the worse of two crowded all-long sizes, not a general performance claim.','Early interactions reuse the exact same visual source; frozen images remain unchanged.'],
 'parent_server_shutdown':'winner-battery/server-shutdown.json',
 'scope_audit':'SCOPE-AUDIT-r55.json','assertion_audit':'ASSERTION-AUDIT-r55.json','independent_raw_proof_audit':'PROOF-AUDIT-r55.json'
}
(root/'parent-review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
print('Round55 IOLITE acceptance prepared; all required gates/proofs/source/shutdown invariants pass')
