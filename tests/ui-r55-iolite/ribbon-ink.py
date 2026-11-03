"""Check animated condition text against the packer's reserved envelope."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
errors = []
rows = []
check = r'''async kind => {
  const s=MM.ctx.scenes.current, f=s.fx, id=s.engine.livingEnemies()[0].id;
  await s._settle(); await document.fonts.ready; f.clear();
  const bounds=s._wordBounds(id), a=bounds.actor;
  f.word(a.x,a.y,kind==='blocked'?'BLOCKED':'+2 Vulnerable',kind,bounds);
  const failures=[],started=performance.now();let frames=0,visible=0,maxOutside=0,font=0,styles=null;
  while(performance.now()-started<6000){
    for(const n of f.nums){
      if(!n.live||n.actorId!==id||+n.el.style.opacity<=0)continue;
      visible++;const cs=getComputedStyle(n.el);font=parseFloat(cs.fontSize);styles={font:cs.fontSize,color:cs.color,filter:cs.filter,shadow:cs.textShadow,stroke:cs.webkitTextStrokeWidth,willChange:cs.willChange,transform:cs.transform,backing:cs.borderImageSource};
      const range=document.createRange();range.selectNodeContents(n.el);
      const box=n.wordBox;
      const expected={left:box.left+f.left,right:box.right+f.left,top:box.top+f.top,bottom:box.bottom+f.top};
      for(const r of range.getClientRects()){
        const outside=Math.max(0,expected.left-r.left,r.right-expected.right,expected.top-r.top,r.bottom-expected.bottom);
        maxOutside=Math.max(maxOutside,outside);
        if(outside>1)failures.push({outside,text:n.el.textContent,kind,range:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},expected,t:n.t,duration:n.dur});
      }
    }
    frames++;
    if(!f.nums.some(n=>n.live)&&!f.wordQueue?.length)break;
    await new Promise(requestAnimationFrame);
  }
  return {kind,frames,visible,font,styles,maxOutside,failures,drained:!f.nums.some(n=>n.live)&&!f.wordQueue?.length};
}'''
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', args=['--force-color-profile=srgb'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.route('**/favicon.ico', lambda r: r.fulfill(status=204, body=''))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://localhost:{args.port}/game/index.html#scene=title&seed=42&companion=bones&kid=maya')
    page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done"', timeout=150000)
    for width, height in [(1280, 800), (1600, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('MM.goto("combat",{seed:42,encounter:"foyer-boss",companion:"bones",kid:"maya"})')
        page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine && s._opening===false && !MM.ctx.stage.roomPending() && s.$coldRoom.hidden && s.hero._kidSrc}', timeout=150000)
        for kind in ['status', 'buff', 'debuff', 'counter', 'blocked']:
            row = page.evaluate(check, kind)
            row['width'] = width
            rows.append(row)
            (out / 'proof.json').write_text(json.dumps({'rows': rows, 'errors': errors}, indent=2))
            print(width, kind, 'visible', row['visible'], 'outside', row['maxOutside'], 'failures', len(row['failures']), flush=True)
    browser.close()
assert not errors and len(rows) == 10
assert all(r['visible'] > 10 and r['drained'] and not r['failures'] for r in rows), 'Animated ribbon text exceeds its reserved envelope'

assert all(r["styles"]["filter"]=="none" and r["styles"]["willChange"]=="auto" and "enamel-plaque.webp" in r["styles"]["backing"] for r in rows)
