"""Bounded six-trial isolation; screenshots run separately from measured animation."""
import ast,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('docs/ui-pass/FLUORITE-r53-proofs/raster-isolation');out.mkdir(parents=True,exist_ok=True)
tree=ast.parse(Path('tests/ui-r51-spinel/probe-queue.py').read_text(encoding='utf-8'))
check=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CHECK' for t in n.targets))
check=check.replace('frameTimes:{max:Math.max(...sorted),','frameTimes:{samples:frameTimes,max:Math.max(...sorted),')
sel='.scene--combat .cb-num:is([data-kind="status"],[data-kind="buff"],[data-kind="debuff"],[data-kind="counter"],[data-kind="blocked"])'
styles={'current':'','backing':sel+'{border-image-source:url("/game/assets/ui/kit/cartouche-dark.webp");}','shadow':sel+'{filter:drop-shadow(0 2px 0 var(--ink-900));}'}
params={'seed':42,'companion':'crumbula','kid':'maya','region':'passages','room':'Narrow Corridor','tier':'standard','enemies':4}
freeze='''async()=>{const s=MM.ctx.scenes.current,E=s.engine;await s._settle();s.fx.clear();for(const e of E.livingEnemies())E.applyStatus(e,'vulnerable',2);E.applyStatus(E.player,'dexterity',2);E.applyStatus(E.player,'regen',3);const t=performance.now();while(performance.now()-t<15000){const a=s.fx.nums.filter(n=>n.live&&n.t/n.dur>=.16&&+n.el.style.opacity>.3);if(a.length>=3){MM.ctx.clock.pause();return a.map(n=>({text:n.el.textContent,owner:n.actorId,styles:(()=>{const x=getComputedStyle(n.el);return {filter:x.filter,willChange:x.willChange,backing:x.borderImageSource,font:x.fontSize}})()}))}await new Promise(requestAnimationFrame)}throw new Error('No simultaneous three-label pixel moment')}'''
styles['baseline']=sel+'{filter:drop-shadow(0 2px 1px var(--ink-900));will-change:transform,opacity;-webkit-text-stroke:.8px var(--ink-900);text-shadow:0 -1px 0 color-mix(in srgb,currentColor 45%,var(--kit-parchment)),1px 1px 0 var(--ink-900);border-image-source:url("/game/assets/ui/kit/cartouche-dark.webp");}'
styles['auto']=sel+'{will-change:auto;}'
rows=[];pixels=[];errors=[];order=['current','backing','shadow','shadow','backing','current','baseline','auto','current','current','auto','baseline']
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--use-gl=angle','--use-angle=default','--force-color-profile=srgb']);c=b.new_context(viewport={'width':1280,'height':800});c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=title&seed=42&companion=crumbula&kid=maya');page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"',timeout=150000)
 page.evaluate('()=>{const s=document.createElement("style");s.id="isolation";document.head.append(s)}')
 def mount(variant):
  page.evaluate('p=>{MM.ctx.clock.resume();MM.goto("combat",p)}',params);page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000);page.evaluate('css=>document.getElementById("isolation").textContent=css',styles[variant]);page.wait_for_timeout(1200)
  computed=page.evaluate('''()=>{const e=MM.ctx.scenes.current.fx.nums[0].el,old=e.dataset.kind;e.dataset.kind='buff';const s=getComputedStyle(e);const r={font:s.fontSize,filter:s.filter,willChange:s.willChange,stroke:s.webkitTextStrokeWidth,shadow:s.textShadow,backing:s.borderImageSource};if(old===undefined)delete e.dataset.kind;else e.dataset.kind=old;return r}''')
  assert computed['willChange']==('auto' if variant=='auto' else 'transform, opacity'),(variant,computed)
  assert ('/kit/cartouche-dark.webp' in computed['backing'])==(variant in ['baseline','backing']),(variant,computed)
  assert (computed['filter']=='none')==(variant not in ['baseline','shadow']),(variant,computed)
  assert computed['stroke']==('0.8px' if variant=='baseline' else '1px'),(variant,computed)
  return computed
 for i,variant in enumerate(order):
  computed=mount(variant);page.evaluate('window.r49CaptureTarget=Infinity');row=page.evaluate(check,'all-long');row.update(trial=i,variant=variant,width=1280,computed=computed);rows.append(row)
  assert row['all'] and not row['failures'] and len(row['delivered'])==6 and len(row['expired'])==6 and row['queued']==0,row
  assert all(e['elapsed']>=e['duration'] for e in row['expired'])
  print(variant,i,'p95',row['frameTimes']['p95'],'max',row['frameTimes']['max'],'drain',row['drainMs'],flush=True)
  if False:
   mount(variant);pixels.append({'variant':variant,'labels':page.evaluate(freeze)});page.screenshot(path=str(out/(variant+'.png')));page.evaluate('MM.ctx.clock.resume()')
  (out/'proof.json').write_text(json.dumps({'order':order,'params':params,'measurement':'No screenshots, pauses, or computed-style tool calls during measured animation; native pixels captured in separate fresh scenes.','source':'eae1187e','results':rows,'pixels':pixels,'errors':errors},indent=2),encoding='utf-8')
 for variant in ['baseline','auto','current','backing','shadow']:
  mount(variant);pixels.append({'variant':variant,'labels':page.evaluate(freeze)});page.screenshot(path=str(out/(variant+'.png')));page.evaluate('MM.ctx.clock.resume()')
 (out/'proof.json').write_text(json.dumps({'order':order,'params':params,'measurement':'Twelve bounded trials: requested six isolation then six inherited/auto/fixed controls. No screenshots, pauses, computed-style calls or other tool work during measured animation. All five native variants captured afterward in fresh scenes.','source':'eae1187e','results':rows,'pixels':pixels,'errors':errors},indent=2),encoding='utf-8')
 b.close()
assert not errors
