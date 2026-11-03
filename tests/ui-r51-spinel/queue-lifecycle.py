"""Real presentation teardown while a status label is waiting for space."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--fx-override', help='Optional local module used only in this test browser')
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', args=['--force-color-profile=srgb'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.route('**/favicon.ico', lambda r: r.fulfill(status=204, body=''))
    if args.fx_override:
        replacement = Path(args.fx_override).read_text(encoding='utf-8')
        page.route('**/game/src/fx/combatfx.js*', lambda r: r.fulfill(status=200, content_type='application/javascript', body=replacement))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://localhost:{args.port}/game/index.html#scene=title&seed=42&companion=bones&kid=maya')
    page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done"', timeout=150000)
    page.evaluate('MM.goto("combat",{seed:42,region:"passages",room:"Narrow Corridor",tier:"standard",enemies:4,companion:"bones",kid:"maya"})')
    page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine && s._opening===false && !MM.ctx.stage.roomPending() && s.$coldRoom.hidden && s.hero._kidSrc}', timeout=150000)
    page.set_viewport_size({'width': 320, 'height': 800})
    page.wait_for_timeout(500)
    owner = page.evaluate('''async()=>{
      const s=MM.ctx.scenes.current;await s._settle();s.fx.clear();
      const enemy=s.engine.livingEnemies()[3];window.r50RemovedOwner=enemy.id;
      s.engine.applyStatus(enemy,'vulnerable',2);return enemy.id;
    }''')
    page.wait_for_function('MM.ctx.scenes.current.fx.wordQueue?.some(e=>e.o.actorId===r50RemovedOwner)', timeout=10000)
    before = page.evaluate('()=>{const s=MM.ctx.scenes.current;return {queued:s.fx.wordQueue.length,live:s.fx.nums.filter(n=>n.live).length,ownerPresent:s.views.has(r50RemovedOwner)}}')
    page.evaluate('''()=>{
      const s=MM.ctx.scenes.current, f=s.fx, update=f._updateNumbers;
      window.r50Trace={orphanFrames:0,frames:0};
      f._updateNumbers=function(dt){
        const result=update.call(this,dt);r50Trace.frames++;
        if(this.nums.some(n=>n.live&&n.el.textContent==='+2 Vulnerable'))r50Trace.orphanFrames++;
        return result;
      };
      s._removeEnemyView(r50RemovedOwner);
    }''')
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.wait_for_timeout(2500)
    assert page.locator('[data-fx-owner]').count()==0,'Removed owner left a cartouche'
    after = page.evaluate('()=>{const s=MM.ctx.scenes.current;return {...r50Trace,queued:s.fx.wordQueue.length,ownerPresent:s.views.has(r50RemovedOwner),visibleOwners:[...s.views.keys()]}}')
    page.evaluate('()=>{const s=MM.ctx.scenes.current;s.engine.applyStatus(s.engine.player,"dexterity",2)}')
    page.wait_for_function('MM.ctx.scenes.current.fx.nums.some(n=>n.live&&n.actorId==="player"&&n.el.textContent==="+2 Dexterity"&&+n.el.style.opacity>.3)', timeout=10000)
    survivor = page.evaluate('()=>{const n=MM.ctx.scenes.current.fx.nums.find(n=>n.live&&n.el.textContent==="+2 Dexterity");return {owner:n.actorId,text:n.el.textContent,duration:n.dur}}')
    page.screenshot(path=str(out / 'survivor.png'))
    drained = True
    try:
        page.wait_for_function('!MM.ctx.scenes.current.fx.nums.some(n=>n.live)&&!MM.ctx.scenes.current.fx.wordQueue.length', timeout=10000)
    except PlaywrightTimeout:
        drained = False
    assert page.locator('[data-fx-owner]').count()==0,'Drained group left a cartouche'
    live_owner=page.evaluate('''()=>{const s=MM.ctx.scenes.current;const e=s.engine.livingEnemies().find(e=>s.views.has(e.id));window.spinelLiveOwner=e.id;s.engine.applyStatus(e,'strength',3);return e.id;}''')
    page.wait_for_function('()=>{const f=MM.ctx.scenes.current.fx;return f.nums.some(n=>n.live&&n.actorId===spinelLiveOwner&&+n.el.style.opacity>.3)&&[...document.querySelectorAll("[data-fx-owner]")].some(e=>e.dataset.fxOwner===spinelLiveOwner&&getComputedStyle(e).visibility==="visible")}',timeout=10000)
    live_before=page.evaluate('()=>({labels:MM.ctx.scenes.current.fx.nums.filter(n=>n.live&&n.actorId===spinelLiveOwner).length,captions:[...document.querySelectorAll("[data-fx-owner]")].filter(e=>e.dataset.fxOwner===spinelLiveOwner).length})')
    page.evaluate('MM.ctx.scenes.current._removeEnemyView(spinelLiveOwner)')
    page.wait_for_timeout(100)
    live_after=page.evaluate('()=>({labels:MM.ctx.scenes.current.fx.nums.filter(n=>n.live&&n.actorId===spinelLiveOwner).length,captions:[...document.querySelectorAll("[data-fx-owner]")].filter(e=>e.dataset.fxOwner===spinelLiveOwner).length,queued:MM.ctx.scenes.current.fx.wordQueue.filter(e=>e.o.actorId===spinelLiveOwner).length})')
    assert live_before['labels']>=1 and live_before['captions']==1 and live_after=={'labels':0,'captions':0,'queued':0},(live_before,live_after)
    browser.close()
result = {'removedOwner': owner, 'alreadyVisibleOwner':{'id':live_owner,'before':live_before,'after':live_after}, 'before': before, 'after': after, 'survivor': survivor, 'drained': drained, 'errors': errors,
          'fxOverride': str(Path(args.fx_override).resolve()) if args.fx_override else None}
(out / 'proof.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result), flush=True)
assert before['queued'] == 1 and before['live'] == 0 and before['ownerPresent']
assert not after['ownerPresent'] and after['queued'] == 0 and after['orphanFrames'] == 0 and after['frames'] > 20
assert survivor['owner'] == 'player' and survivor['duration'] >= 1 and drained and not errors
