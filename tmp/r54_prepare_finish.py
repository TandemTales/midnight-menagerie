"""Prepare the evidence-backed parent acceptance record before integration."""
import json
import subprocess
from pathlib import Path

root=Path('D:/UILOOP/r54-20261029')
wt=root/'b'
proof=wt/'docs/ui-pass/PERIDOT-r54-proofs'
head='a5a53eb4d74e966e5acee8a1c8e8bce5858aeca4'
visual='3a49caa56e8a326d63436605e98a0ef1f207b9eb'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def git(*args):return subprocess.check_output(['git','-C',str(wt),*args],text=True).strip()
assert git('rev-parse','HEAD')==head
assert not git('diff','--name-only',visual,head,'--','game/src','game/assets')
assert not git('diff','--name-only','dd246d80028fb4fed39497cf63edb9cb2d68e215',head,'--','game/src','game/assets')
assert git('diff','--name-only','503c853a8e62717e967577a0ea2ea00b3e8ed11c',head,'--','game/src','game/assets').splitlines()==['game/src/scenes/combat.css']
result=read(Path('docs/ui-pass/RESULTS-r54.json'))
assert result['winner']=='PERIDOT' and result['votes']==['PERIDOT','PERIDOT'] and not result['all_fit_thresholds_met']
gates=read(root/'winner-battery/results.json')
assert len(gates)==7 and all(r['exit']==0 for r in gates)
static=read(root/'parent-static/acceptance.json')
assert static['known_seam_reports_only'] and static['source_unchanged']
shutdown=read(root/'winner-battery/server-shutdown.json')
assert shutdown['pidAbsent'] and shutdown['portClear']
own_shutdown=read(proof/'server-shutdown.json')
assert own_shutdown['pidAbsent'] and own_shutdown['portClear']
runtime=read(proof/'runtime-results.json')
assert len(runtime['checks'])==10 and all(r['exit']==0 for r in runtime['checks'])
for width in [1280,1600]:
    q=read(proof/f'long-quantities-{width}.json')
    assert q['expected']==109 and q['copiesEach']==12 and len(q['tricks'])==109
    assert all(r['clear'] and r['quantityText'].strip()=='×12' for r in q['tricks'])
    assert q['longest']['title']=='Every Bone Knows the Way Home'
geometry=read(proof/'memorial-geometry.json')
assert not geometry['errors'] and len(geometry['rows'])==2
assert all(r['progressLeft'] and r['baseClear'] and all(x['visible'] for x in r['content']) and all(x['contained'] for x in r['portraits']) and all(x['clear'] for x in r['tricks']) for r in geometry['rows'])
timing=read(proof/'final-timing-summary.json')
assert timing['cases']==16 and timing['delivered']==timing['expired']==96 and timing['frames']==3696
controls=read(proof/'native-material-timing/proof.json')
assert len(controls['rows'])==4 and not controls['errors']
assert all(r['computedBefore']==r['computedAfter'] and r['pausedMs']==0 and not r['failures'] for r in controls['rows'])
phase=read(proof/'condition-pixels/proof.json')
strength=[{'variant':r['variant'],'width':r['width'],**{k:x[k] for k in ['color','opacity','phase']}}
          for r in phase['rows'] for x in r['labels'] if 'Strength' in x['text']]
assert len(strength)==4 and all(r['color']=='rgb(168, 236, 247)' for r in strength)
scope=next(r for r in read(Path('docs/ui-pass/SCOPE-AUDIT-r54.json'))['candidates'] if r['code']=='PERIDOT')
assert scope['changed_files']==86 and scope['game_javascript_unchanged']
completion='''Both fresh blind judges selected PERIDOT (8.4/8.5 versus baseline7.9/8.0).
No paired screen reached9+fit. Final selected commit
a5a53eb4d74e966e5acee8a1c8e8bce5858aeca4 is applied as working changes,86files
byte-verified, main index preserved, no main commit/push. All seven parent browser
gates pass. Read-only parent CSS/token/syntax/ending/whitespace checks pass; only
four known floorplan local-Map reports remain. The ten validated images preserve
their exact frozen comparison hashes and actual visual-source3a49caa5 provenance.
All builder servers and parent38920/9544 were verified/stopped; GPU is free.

Selected game changes: six scoped presentation CSS files and three painted
derivatives totaling52,354bytes. No game JavaScript change. Warm carved reading
rails, physical paper/list boundaries, varied live title paint and fitted plaques
preserve the complete memorial/shop hierarchy and all user constraints.

Expanded3px13px label padding initially caused real queue/resize failures. It was
restored to proven1px9px with an internal6px8px rim before judging. The repaired
full16/96/3696-frame queue,10ink cases, resize/removal and actual109×12 quantities
pass. Unchanged board evidence is reused with exact regional source proof.
Complete failed evidence, an interrupted unintended-source retry and a stale
font preflight are preserved in named directories; none was presented as a pass.

Native4-trial ABBA validates24full lifetimes/444frames, effective styles before/
after,8native asset URL/decode/hash checks and zero screenshot pauses. Baseline
p95 77.3/40.2ms versus current40.1/41.8ms demonstrates no repeatable penalty in
this bounded sample, not a general speedup. Full-fixture timings include checking
and screenshots. Strength has the same cyan; its dim frozen appearance comes
from fade phase. Preserve animation and improve backing contrast instead.

Continue Round55: materially deeper painted plaques within existing bounds,
irregular live letter planes, real rail joints/local rim wear, paper thickness,
rest panel/icon finish and scoped shop card-rim wear. Imagegen skill read and
announced; use built-in generation/editing for new painted raster families,
with saved prompts/paths/alpha and no CLI fallback authorization assumed.
Main HEAD99bdba9f42ec90ffe720b620b1082367b75c7fd1 and index SHA256
6f75cb9060c5ed58cb981e6b487beb233e9a17128a9974379c659d651d389129 remain unchanged.
'''
review=dict(accepted=True,winner='PERIDOT',selected_commit=head,comparison_source=visual,
    owned_servers_stopped=True,completion_text=completion,
    selected_post_review_repair_required=False,
    scope_review='Six scoped presentation CSS files and three painted derivatives; game JavaScript unchanged. Other changes are tests, evidence and notes.',
    derivative_asset_bytes=scope['raster_asset_bytes'],
    static_checks=dict(scene_css_conflicts=0,undefined_css_tokens=0,seam_sites=9110,
        unchanged_local_Map_false_positives=4,syntax='pass',endings='read-only numstat/ignore-cr-at-eol match; own pre-capture guard passed',whitespace='pass'),
    combat_proofs={**timing,'ink_cases':10,'max_ink_overflow_px':0,'idle_and_owner_teardown':'pass',
        'actual_long_quantity_rows':109,'copies_each':12},
    runtime_provenance=runtime,
    controlled_rendering_validation=dict(raw='PERIDOT-r54-proofs/native-material-timing/proof.json',
        selection=controls['selectedFullRunCase'],
        trials=[dict(variant=r['variant'],frame_p95_ms=r['frameTimes']['p95'],frame_max_ms=r['frameTimes']['max'],
                     drain_ms=r['drainMs'],paused_ms=r['pausedMs'],full_lifetimes=len(r['expired'])) for r in controls['rows']],
        effective_styles_verified_before_and_after=True,screenshots_or_extra_browser_work_during_measurement=False,
        conclusion='No repeatable current penalty in this bounded geometry-harness comparison; not a universal performance or speedup claim.'),
    strength_phase_evidence=strength,
    evidence_limitations=[
        'Original expanded-padding queue/idle failures preserved in initial-expanded-padding; repaired before canonical capture with full affected rerun.',
        'Failed UTF-8 edit preflight launched an unintended unchanged-source retry; verified owned job tree stopped, partial evidence retained in aborted-unchanged-rerun, explicit pipeline exit checks added.',
        'Obsolete ink asset basename and native font minimum were corrected without removing functional assertions; failed-native-font-preflight contains no measured trials.',
        'Unchanged board proof reuses503c853a; selected game differs from it only in combat.css, independently verified.'
    ],parent_server_shutdown='winner-battery/server-shutdown.json',
    scope_audit='SCOPE-AUDIT-r54.json',assertion_audit='ASSERTION-AUDIT-r54.json')
(root/'parent-review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
print('Parent acceptance prepared; all source, runtime, quantity, timing and shutdown checks pass')
