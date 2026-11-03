import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('docs/ui-pass/FLUORITE-r53-proofs/raster-pixels');out.mkdir(parents=True,exist_ok=True)
shot=Path('D:/UILOOP/r53-20261029/combat-capture.js').read_text();rows=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--force-color-profile=srgb']);page=b.new_page(viewport={'width':1280,'height':800});page.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=title&seed=7&companion=bones&kid=maya');page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"',timeout=150000)
 for kind in ['current-auto','current-fixed']:
  page.evaluate('MM.ctx.clock.resume();MM.goto("combat",{seed:7,encounter:"foyer-boss",companion:"bones",kid:"maya"})');page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000)
  if kind=='current-auto':page.add_style_tag(content='.cb-num:is([data-kind="status"],[data-kind="buff"],[data-kind="debuff"],[data-kind="counter"],[data-kind="blocked"]){will-change:auto}')
  if kind=='current-fixed':page.add_style_tag(content='.cb-num:is([data-kind="status"],[data-kind="buff"],[data-kind="debuff"],[data-kind="counter"],[data-kind="blocked"]){will-change:transform,opacity}')
  result=page.evaluate(shot);page.screenshot(path=str(out/(kind+'.png')));rows.append({'kind':kind,'result':result})
 b.close()
(out/'proof.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
