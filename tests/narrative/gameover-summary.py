"""Ending metrics regression. Run only after the live browser is released.
Restores a captured completed Run into a NEW isolated browser; variants are
explicit fixtures, not another playthrough. Never writes the capture/profile.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
CAPTURES = ROOT / 'docs/ingame-narrative-2026-10-27/reviews/six-wing-playthrough'
OUT = ROOT / 'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'


def ready(page, scene):
    page.wait_for_function('(name)=>window.MM && !MM.ctx.scenes.busy && MM.ctx.scenes.currentName===name',arg=scene,timeout=60000)


def naps(page):
    return page.locator('.go-stat').filter(has_text='Naps taken').locator('.kit-stats__value').inner_text()


def main():
    source = CAPTURES / 'main-completed-run-snapshot.json'
    if not source.exists():
        source = CAPTURES / 'completed-run-snapshot.json'
    saved = json.loads(source.read_text(encoding='utf-8'))
    assert saved['result']=='victory' and saved['regionIndex']==5 and not saved['storyMemory']
    assert saved['stats']['safeRooms']==0 and saved['stats']['depth']==90
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':800})
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.goto('http://localhost:8777/game/index.html#scene=title',wait_until='load')
        ready(page,'title')
        page.evaluate("""async snapshot=>{
          const {Run}=await import('./src/state/run.js');
          MM.Save.reset();MM.Save.settings.reduceMotion=true;
          // Known ending milestone fixture accompanying the captured Run.
          MM.Save.data.petsRescued=['maya'];MM.Save.data.narrative.pets.maya='home';
          MM.Save.data.narrative.sanctuary=true;
          MM.Save.data.blueprint.revealed=[...snapshot.route];
          MM.ctx.run=Run.resume(snapshot);
          MM.ctx.scenes.go('gameover',{result:'victory',narrativeBypass:true},{instant:true});
        }""",saved)
        ready(page,'gameover')
        assert naps(page)=='0'
        assert page.locator('.go-reach__n').inner_text()=='6'
        assert page.locator('.go-reach__unit').inner_text().lower()=='wings explored'
        assert 'rooms deep' not in page.locator('.go-reach').inner_text().lower()
        assert 'Orbit is home with Maya.' in page.locator('.go-pet__text').inner_text()
        assert 'has not changed' not in page.locator('.go-pet__text').inner_text()
        page.screenshot(path=str(OUT/'gameover-completed-summary-fixed.png'))
        print('PASS captured six-wing victory: zero naps, six wings, first-search home copy')
        page.evaluate("""()=>{
          MM.ctx.run.storyMemory=true;
          MM.ctx.scenes.go('gameover',{result:'victory',narrativeBypass:true},{instant:true});
        }""")
        ready(page,'gameover')
        assert 'earlier-night expedition has not changed that' in page.locator('.go-pet__text').inner_text()
        print('PASS explicit memory fixture uses replay home wording')
        page.evaluate("MM.ctx.run=null;MM.ctx.scenes.go('clubhouse',{narrativeBypass:true},{instant:true})")
        ready(page,'clubhouse')
        assert page.locator('.chalk__dl dt').filter(has_text='Deepest room').count()==0
        label=page.locator('.chalk__dl dt').filter(has_text='Wings mapped')
        assert label.locator('xpath=following-sibling::dd[1]').inner_text()=='6'
        page.screenshot(path=str(OUT/'clubhouse-expedition-log-fixed.png'))
        print('PASS clubhouse uses actual six-wing revealed set, not depth score')
        page.evaluate("MM.ctx.scenes.go('clubhouse',{panel:'pets',narrativeBypass:true},{instant:true})")
        ready(page,'clubhouse')
        assert 'Open Discoveries to visit the House with another child.' in page.locator('.cl-panel--pets').inner_text()
        assert page.locator('.petcard').filter(has_text='Pepper').locator('.stagebar').inner_text()=='Still searching'
        print('PASS post-sanctuary visit direction without claiming other pets are found')
        page.evaluate("""async()=>{
          const {Run}=await import('./src/state/run.js');
          const r=new Run({seed:197,kid:'maya'});MM.ctx.run=r;
          r.rest();
          MM.ctx.scenes.go('gameover',{result:'defeat',narrativeBypass:true},{instant:true});
        }""")
        ready(page,'gameover')
        assert naps(page)=='1'
        assert not errors,errors
        print('PASS real Run.rest operation increments displayed Naps taken; zero page errors')
        browser.close()


if __name__=='__main__':
    main()
