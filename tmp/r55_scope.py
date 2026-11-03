"""Parent read-only scope audit after canonical images are frozen."""
import json
import subprocess
from pathlib import Path

root=Path('D:/UILOOP/r55-20261029')
manifest=json.loads((root/'manifest.json').read_text())
frozen=json.loads((root/'final-captures.json').read_text())
allowed_css={'game/src/ui/kit.css',*[f'game/src/scenes/{s}.css' for s in ['combat','rest','event','gameover','shop']]}
rows=[]
for slot,code in manifest['builders'].items():
    wt=root/slot
    def git(*args):
        return subprocess.check_output(['git','-C',str(wt),*args],text=True).strip()
    head=git('rev-parse','HEAD')
    capture_commits={r['commit'] for r in frozen['captures'] if r['code']==code}
    assert len(capture_commits)==1
    for capture_commit in capture_commits:
        assert not git('diff','--name-only',capture_commit,head,'--','game/src','game/assets'), (code,'Game changed after image freeze')
    paths=git('diff','--name-only',manifest['base'],head).splitlines()
    allowed=('game/src/',f'game/assets/ui/r55-{code.lower()}/',f'docs/ui-pass/{code}-r55-',
             f'tools/prep_r55_{code.lower()}.py',f'tests/ui-r55-{code.lower()}/','tests/ui-r50/','tests/ui-r51-spinel/')
    extra_helpers=['tools/implement_r55_zircon.py','tools/prepare_r55_zircon_tests.py','tools/refine_r55_zircon.py'] if code=='ZIRCON' else []
    allowed=(*allowed,*extra_helpers)
    assert all(p.startswith(allowed) for p in paths),(code,paths)
    sources=[p for p in paths if p.startswith('game/src/')]
    assert set(sources)<=allowed_css,(code,sources)
    assets=[p for p in paths if p.startswith('game/assets/') and Path(p).suffix.lower() in {'.webp','.png','.jpg','.jpeg'}]
    assert sum((wt/p).stat().st_size for p in assets) < 8*1024*1024, (code,'New bitmap budget')
    rows.append({'code':code,'commit':head,'changed_files':len(paths),'game_source_changes':sources,
                 'raster_assets':assets,'raster_asset_bytes':sum((wt/p).stat().st_size for p in assets),
                 'game_javascript_unchanged':True,'reviewed_additional_helpers':extra_helpers,'scope_pass':True})
Path('docs/ui-pass/SCOPE-AUDIT-r55.json').write_text(json.dumps({'base':manifest['base'],'candidates':rows},indent=2),encoding='utf-8')
print(json.dumps(rows,indent=2))
