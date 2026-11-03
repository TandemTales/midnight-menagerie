"""Verify complete saved candidate evidence without running browser jobs.

This checks raw invariants, not visual quality or source-reuse justification.
Usage: python tmp/ui_candidate_proof_audit.py ROUND [CODE ...]
Optional codes produce a clearly named partial audit, never the full acceptance file.
"""
from pathlib import Path
import ast
import hashlib
import json
import re
import subprocess
import sys
from urllib.parse import urlparse, unquote

n=int(sys.argv[1]); root=Path(f'D:/UILOOP/r{n}-20261029')
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
manifest=read(root/'manifest.json'); rows=[]
requested=set(sys.argv[2:])
assert requested<=set(manifest['builders'].values())
for slot,code in manifest['builders'].items():
    if requested and code not in requested: continue
    wt=root/slot; p=wt/f'docs/ui-pass/{code}-r{n}-proofs'
    q=read(p/'queue/proof.json'); ink=read(p/'ink/proof.json')
    assert not q['errors'] and len(q['results'])==16
    for r in q['results']:
        assert not r['failures'] and r['queued']==0
        assert len(r['starts'])==len(r['delivered'])==len(r['expired'])==6
        assert len({x['serial'] for x in r['starts']})==6
        assert all(x['elapsed']>=x['duration'] for x in r['expired'])
        assert r['kind']!='boss' or r['peak']==6
    assert not ink['errors'] and len(ink['rows'])==10
    assert all(x['maxOutside']==0 and not x['failures'] and x['drained'] for x in ink['rows'])
    runtime=read(p/'runtime-results.json')
    checks=runtime['checks'] if isinstance(runtime,dict) else runtime
    assert len(checks)==10 and all(r['exit']==0 for r in checks),code
    quantities=[]
    for width in [1280,1600]:
        d=read(p/f'long-quantities-{width}.json')
        assert d['expected']==109 and d['copiesEach']==12 and len(d['tricks'])==109
        assert all(r['clear'] and r['quantityText'].strip()=='×12' for r in d['tricks'])
        assert d['longest']['title']=='Every Bone Knows the Way Home'
        quantities.append({'width':width,'definitions':109,'copies_each':12})
    g=read(p/'memorial-geometry.json')
    assert not g['errors'] and len(g['rows'])==2
    assert all(r['progressLeft'] and r['baseClear'] and all(x['visible'] for x in r['content'])
               and all(x['contained'] for x in r['portraits']) and all(x['clear'] for x in r['tricks']) for r in g['rows'])
    harness=wt/f'tests/ui-r{n}-{code.lower()}/native_timing.py'
    harness_tree=ast.parse(harness.read_text(encoding='utf-8'))
    out_node=next(x.value for x in harness_tree.body if isinstance(x,ast.Assign)
                  and any(isinstance(y,ast.Name) and y.id=='OUT' for y in x.targets))
    assert isinstance(out_node,ast.Call) and isinstance(out_node.func,ast.Name) and out_node.func.id=='Path'
    timing_folder=(wt/ast.literal_eval(out_node.args[0])).resolve()
    assert timing_folder.is_relative_to(p.resolve()) and timing_folder.name.startswith('native-material-timing')
    t=read(timing_folder/'proof.json')
    assert not t['errors'] and len(t['rows'])==4
    assert all(r['computedBefore']==r['computedAfter'] and r['pausedMs']==0 and not r['failures']
               and len(r['expired'])==6 for r in t['rows'])
    if n>=56:
        measured_bytes=(timing_folder/'measured-check.js').read_bytes()
        measured=measured_bytes.decode('utf-8')
        assert hashlib.sha256(measured_bytes).hexdigest()==t['measuredCheckSHA256']
        assert hashlib.sha256(harness.read_bytes()).hexdigest()==t['harnessSHA256']
        fixture=wt/'tests/ui-r51-spinel/probe-queue.py'
        assert hashlib.sha256(fixture.read_bytes()).hexdigest()==t['importedFixtureSHA256']
        fixture_tree=ast.parse(fixture.read_text(encoding='utf-8'))
        original=next(ast.literal_eval(x.value) for x in fixture_tree.body if isinstance(x,ast.Assign)
                      and any(isinstance(y,ast.Name) and y.id=='CHECK' for y in x.targets))
        cache_names=set(re.findall(r'window\.r\d+CaptionFont',measured));assert len(cache_names)==1
        expected=original.replace('return {mode,frames,peak,all,layoutTimes,frameTimes:',
                                  'return {rawFrameTimes:frameTimes,mode,frames,peak,all,layoutTimes,frameTimes:')
        expected=expected.replace("getComputedStyle(el).visibility==='visible'","el.style.visibility==='visible'")
        expected=expected.replace('parseFloat(getComputedStyle(el).fontSize)',next(iter(cache_names)))
        assert measured==expected and 'getComputedStyle' not in measured
        assert all(r['computedBefore']['ownerVisibilityControlled'] and
                   float(str(r['computedBefore']['ownerFont']).removesuffix('px'))>=17 for r in t['rows'])
    retained_fields=['kind','color','font','lineHeight','padding','filter','textShadow','stroke',
                     'willChange','backingContent','backingFilter','backingImage','animation','globalAnimationScale']
    semantic_baseline=[{k:x[k] for k in retained_fields} for x in t['rows'][0]['computedBefore']['conditions']]
    for trial in t['rows']:
        style=trial['computedBefore']
        assert style['linkDisabled'] and style['styleBeforeLink']
        assert [{k:x[k] for k in retained_fields} for x in style['conditions']]==semantic_baseline
        assert len(trial['verifiedAssets'])==2
        for asset in trial['verifiedAssets']:
            local=(wt/unquote(urlparse(asset['url']).path).lstrip('/')).resolve()
            assert local.is_relative_to(wt.resolve())
            assert asset['status']==200 and asset['url']==asset['responseURL']
            assert asset['type'].startswith('image/') and asset['width']>0 and asset['height']>0
            assert asset['bytes']==local.stat().st_size
            assert asset['actualSHA256']==asset['expectedSHA256']==hashlib.sha256(local.read_bytes()).hexdigest()
        expected_asset=trial['verifiedAssets'][0 if trial['variant']=='inherited' else 1]['url']
        assert all(x['borderImage']=='url("'+expected_asset+'")' for x in style['conditions'])
        assert all(e['elapsed']>=e['duration'] for e in trial['expired'])
    shutdown_path=p/'server-shutdown.json'
    if not shutdown_path.exists(): shutdown_path=p/'server-stop.json'
    shutdown=read(shutdown_path)
    port_clear=shutdown.get('portClear',shutdown.get('listenersAfter')==0)
    assert shutdown.get('pidAbsent',shutdown.get('processAbsent',False)) and port_clear
    shutdown={**shutdown,'portClear':port_clear,'evidence_path':str(shutdown_path)}
    captures=read(root/f'judging/{code}/capture-results.json')
    assert len(captures)==10 and all(r['exit']==0 for r in captures)
    for r in captures:
        assert len(r['visual_source_commit'])==40
        assert hashlib.sha256((root/f'judging/{code}'/(r['screen']+'.png')).read_bytes()).hexdigest()==r['sha256']
    head=subprocess.check_output(['git','-C',str(wt),'rev-parse','HEAD'],text=True).strip()
    rows.append({'code':code,'head':head,'raw_functional_invariants_pass':True,
        'visual_sources':sorted({r['visual_source_commit'] for r in captures}),
        'labels':96,'frames':sum(r['frames'] for r in q['results']),'ink_cases':10,
        'runtime_checks':checks,'quantities':quantities,'full_initial_memorial_geometry':'pass',
        'native_abba':{'raw':str(timing_folder/'proof.json'),'selected_case':t['selectedFullRunCase'],
            'trials':[{'variant':r['variant'],'p95_ms':r['frameTimes']['p95'],
                'max_ms':r['frameTimes']['max'],'drain_ms':r['drainMs'],'lives':len(r['expired'])} for r in t['rows']],
            'effective_styles_before_after_equal':True,'retained_semantics_match_baseline':True,
            'native_asset_http_decode_bytes_local_hash_checks':8,'paused_ms':0,
            'query_free_measured_check_verified':n>=56,
            'limitation':'Bounded native-stylesheet geometry harness; no general causal performance claim.'},
        'server_shutdown':shutdown})
out={'round':n,'method':'Independent verification of complete raw functional evidence; source reuse and visual quality require separate review.', 'candidates':rows}
suffix='-partial-'+'-'.join(sorted(requested)) if requested else ''
out['complete']=not requested
Path(f'docs/ui-pass/PROOF-AUDIT-r{n}{suffix}.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('Raw functional proofs verified:',', '.join(r['code'] for r in rows))
