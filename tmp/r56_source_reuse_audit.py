"""Verify the two reviewed paint-only repairs against actual Git objects."""
from pathlib import Path
import hashlib,json,subprocess

root=Path('D:/UILOOP/r56-20261029')
rows=[]
for slot,code in [('a','TOPAZ'),('b','ONYX')]:
    wt=root/slot
    p=wt/f'docs/ui-pass/{code}-r56-proofs'
    data=json.loads((p/'runtime-results.json').read_text())
    reuse=data['interactionReuse']
    def git(*args):return subprocess.check_output(['git','-C',str(wt),*args])
    final=git('rev-parse','HEAD').decode().strip()
    source=data['canonicalSource']
    assert not git('diff','--name-only',source,final,'--','game/src','game/assets')
    if code=='TOPAZ':
        before,after=reuse['from'],reuse['to']
        patch=git('diff',before,after,'--','game/src','game/assets')
        assert patch==(p/reuse['patch']).read_bytes()
        assert hashlib.sha256(patch).hexdigest()==reuse['patchSHA256']
        assert git('diff','--name-only',before,after,'--','game/src','game/assets').decode().splitlines()==['game/src/scenes/gameover.css']
        for item in reuse['identicalPaths']:
            old=git('show',before+':'+item['path'])
            assert old==git('show',after+':'+item['path'])
            assert hashlib.sha256(old).hexdigest()==item['gitBytesSHA256']
    else:
        before,after=reuse['source'],reuse['target']
        patch=git('diff',before,after,'--','game/src','game/assets')
        assert patch.decode().strip()==reuse['exactGameDiff']
        assert git('rev-parse',after+':game')==git('rev-parse',source+':game')
        assert set(git('diff','--name-only',before,after,'--','game/src','game/assets').decode().splitlines())=={'game/src/scenes/event.css','game/src/scenes/gameover.css','game/src/scenes/shop.css'}
        for name,digest in reuse['unchangedSourceHashes'].items():
            assert git('show',before+':'+name)==git('show',after+':'+name)
            assert hashlib.sha256((wt/name).read_bytes()).hexdigest()==digest
        repaired=json.loads((p/reuse['proof']).read_text())
        assert not repaired['errors'] and len(repaired['rows'])==6
    rows.append({'code':code,'initial':before,'repaired':after,'canonical':source,'final':final,
                 'actual_patch_sha256':hashlib.sha256(patch).hexdigest(),
                 'source_identity_verified':True,
                 'review':'Parent inspected the exact paint-only diff; no dimensions, actions, markup or game logic changed. Subsequent memorial/affected-surface checks are retained separately.'})
Path('docs/ui-pass/SOURCE-REUSE-AUDIT-r56.json').write_text(json.dumps(rows,indent=2))
print('Actual Git source identity and retained repair patches verified for TOPAZ and ONYX')
