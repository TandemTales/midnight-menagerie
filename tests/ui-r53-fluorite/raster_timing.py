# HISTORICAL INVALID CAUSAL BENCHMARK: cascade overrides lost. Use raster_controls_final.py.
"""Same-browser ABC/CBA raster comparison; inherited ink/lifecycle assertions retained."""
import ast,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('docs/ui-pass/FLUORITE-r53-proofs/raster-timing');out.mkdir(parents=True,exist_ok=True)
tree=ast.parse(Path('tests/ui-r51-spinel/probe-queue.py').read_text(encoding='utf-8'))
check=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CHECK' for t in n.targets))
check=check.replace('frameTimes:{max:Math.max(...sorted),','frameTimes:{samples:frameTimes,max:Math.max(...sorted),')
selector='.cb-num:is([data-kind="status"],[data-kind="buff"],[data-kind="debuff"],[data-kind="counter"],[data-kind="blocked"])'
styles={
 'baseline':selector+'{filter:drop-shadow(0 2px 1px var(--ink-900));will-change:transform,opacity;-webkit-text-stroke:.8px var(--ink-900);text-shadow:0 -1px 0 color-mix(in srgb,currentColor 45%,var(--kit-parchment)),1px 1px 0 var(--ink-900);border-image-source:url("/game/assets/ui/kit/cartouche-dark.webp");}',
 'current':selector+'{will-change:auto;}',
 'fixed':selector+'{will-change:transform,opacity;}',
}
rows=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--use-gl=angle','--use-angle=default','--force-color-profile=srgb'])
 c=b.new_context(viewport={'width':1280,'height':800});c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=title&seed=42&companion=bones&kid=maya');page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done"',timeout=150000)
 page.evaluate('()=>{const s=document.createElement("style");s.id="r53-raster-comparison";document.head.append(s)}')
 for i,variant in enumerate(['baseline','current','fixed','fixed','current','baseline']):
  page.evaluate('p=>MM.goto("combat",p)',{'seed':42,'companion':'bones','kid':'maya','region':'passages','room':'Narrow Corridor','tier':'standard','enemies':4})
  page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000)
  page.evaluate('css=>document.getElementById("r53-raster-comparison").textContent=css',styles[variant]);page.wait_for_timeout(1200)
  page.evaluate('(source)=>{window.r49Result=null;window.r49Capture=false;window.r49CaptureTarget=3;window.r49Run=eval(source)}','('+check+')')
  page.evaluate('()=>{window.r49Run("1").then(r=>window.r49Result=r)}')
  page.wait_for_function('window.r49Capture || window.r49Result',timeout=20000)
  styles_record=page.locator('.cb-num[data-actor-id]:not([data-actor-id=""])').first.evaluate('e=>{const s=getComputedStyle(e);return {font:s.fontSize,filter:s.filter,shadow:s.textShadow,willChange:s.willChange,stroke:s.webkitTextStrokeWidth,backing:s.borderImageSource}}')
  page.screenshot(path=str(out/f'{i}-{variant}.png'));page.wait_for_function('window.r49Result',timeout=20000)
  row=page.evaluate('window.r49Result');row.update(variant=variant,trial=i,width=1280,computed=styles_record);rows.append(row)
  (out/'proof.json').write_text(json.dumps({'order':['baseline','current','fixed','fixed','current','baseline'],'scene':'Narrow Corridor','seed':42,'mode':'1','source':'27b3b5d6','results':rows,'errors':errors},indent=2),encoding='utf-8')
  assert row['all'] and not row['failures'] and len(row['delivered'])==6 and len(row['expired'])==6 and row['queued']==0,row
  assert all(e['elapsed']>=e['duration'] for e in row['expired'])
  print(variant,i,'p95',row['frameTimes']['p95'],'max',row['frameTimes']['max'],'drain',row['drainMs'],flush=True)
 b.close()
assert not errors
