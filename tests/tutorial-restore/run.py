"""Regression for the restored pre-narrative-rewrite opening.

Uses an isolated browser context, the real game, and keyboard/pointer gameplay.
Run with the local dev server on 8777: python tests/tutorial-restore/run.py
The tutorial-narrative suite is retained as historical coverage of the replacement.
"""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
URL = 'http://localhost:8777/game/index.html'
checks = []


def passed(label):
    checks.append(label)
    print('PASS ' + label, flush=True)


def ready(page, scene):
    page.wait_for_function('(s)=>window.MM && MM.ctx.scenes.currentName===s && !MM.ctx.scenes.busy', arg=scene, timeout=60000)


def go(page, params):
    page.evaluate('(params)=>{MM.ctx.tutorial=null; MM.ctx.scenes.go("tutorial",params,{instant:true})}', params)
    ready(page, 'tutorial')


def screenshot(page, name):
    page.evaluate('document.fonts.ready')
    page.wait_for_function('''()=>[...document.querySelectorAll('.tut-panel:not([hidden]),.tut-fig:not(:empty)')].every(el=>getComputedStyle(el).opacity==='1')''')
    page.screenshot(path=str(OUT / name))


def fit(page, selector):
    assert page.evaluate('''selector => [...document.querySelectorAll(selector)].filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden').every(b=>{
      const r=b.getBoundingClientRect(); return r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;
    })''', selector)


def choose_play(page):
    return page.evaluate('''() => {
      const s=MM.ctx.scenes.current,e=s.engine;
      if(!s.hand || s.hand.locked || e.phase!=='player')return null;
      for(let i=0;i<s.hand.slots.length;i++){
        const c=s.hand.slots[i].card,targets=c.target==='enemy'?e.targetableEnemies(c):[null];
        if(targets.some(t=>e.canPlay(c.uid,t?.id).ok))return {index:i,uid:c.uid};
      } return null;
    }''')


def play_keys(page, card):
    page.keyboard.press('ArrowDown')
    page.keyboard.press(str(card['index']+1))
    page.keyboard.press('ArrowUp')
    if page.evaluate('!!MM.ctx.scenes.current.hand?.aim'):
        page.keyboard.press('ArrowUp')
    page.wait_for_function('uid=>MM.ctx.scenes.currentName!=="combat" || !MM.ctx.scenes.current.engine.current.piles.hand.some(c=>c.uid===uid)',arg=card['uid'],timeout=15000)


def main():
    for name, start, end in [('game/src/scenes/tutorial.js','const PAGES =','const TUT_GLYPH ='), ('game/src/ui/coach.js','export function openingSteps(TERMS)',None)]:
        old=subprocess.check_output(['git','show','99bdba9f:'+name],cwd=ROOT).decode('utf-8')
        now=(ROOT/name).read_text(encoding='utf-8')
        old=old[old.index(start):old.index(end) if end else None]
        now=now[now.index(start):now.index(end) if end else None]
        assert now==old, name
    passed('original story pages/name timing and all eight coach beats exactly match Git predecessor')
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1280,'height':800})
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append({'text':m.text,'location':m.location}) if m.type=='error' else None)
        page.goto(URL+'#scene=tutorial&seed=42',wait_until='load')
        ready(page,'tutorial')
        assert page.locator('.tut-hot').count()==8
        assert page.evaluate('MM.ctx.scenes.current._page().head')=='Somebody’s pet went missing.'
        page.locator('.tut-hot[data-slug="maya"]').click()
        page.locator('.tut-btn--go').click()
        assert page.locator('.tut-panel').get_attribute('data-page')=='loss'
        assert 'looked everywhere twice' in page.locator('.tut-lines').inner_text()
        page.locator('.tut-next').focus();page.keyboard.press('Enter')
        assert page.locator('.tut-panel').get_attribute('data-page')=='others'
        page.locator('.tut-next').click()
        assert page.locator('.tut-panel').get_attribute('data-page')=='rumour'
        assert 'The adults call it folklore. The kids counted.' in page.locator('.tut-lines').inner_text()
        screenshot(page,'rumour-1280.png')
        page.locator('.tut-skip').click();ready(page,'select')
        assert page.evaluate('MM.Save.data.seenTutorials.includes("opening")')
        assert not page.evaluate('!!MM.Save.data.narrative.seen["SEARCH-RECAP"]')
        assert page.evaluate('''async()=>{const {shouldPlayOpening}=await import('./src/scenes/tutorial.js');return !shouldPlayOpening()}''')
        passed('eight-child picker, original rumour page, focused Enter advances once, skip returns to selection and records opening')
        await_flush='async()=>{await MM.Save.flush()}'
        page.evaluate(await_flush);page.reload();ready(page,'tutorial')
        assert page.evaluate('MM.Save.data.seenTutorials.includes("opening")')
        assert not page.evaluate('!!MM.Save.data.narrative.seen["SEARCH-RECAP"]')
        passed('skip persists after reload and leaves narrative search recap eligible')
        for kid in ['maya','mateo','amina','eli','priya','jordan','lena','samir']:
            go(page,{'kid':kid,'seed':42})
            assert 'looked everywhere twice' in page.locator('.tut-lines').inner_text()
            assert page.evaluate('MM.ctx.scenes.current.kid')==kid
        go(page,{'kid':'invalid','step':'hook','seed':42})
        assert page.locator('.tut-panel').get_attribute('data-page')=='kid'
        passed('all eight original loss variants render; invalid deep links return to child picker')
        go(page,{'kid':'maya','seed':42})
        for size in [{'width':1280,'height':800},{'width':1920,'height':1080}]:
            page.set_viewport_size(size)
            page.evaluate('''async()=>{const {applySettings}=await import('./src/ui/settings.js');MM.Save.settings.largeText=true;applySettings(MM.ctx)}''')
            page.wait_for_function('()=>{const i=document.querySelector(".tut-fig__img");return i&&i.complete&&i.naturalWidth>0}')
            fit(page,'.tut-root button')
            screenshot(page,f'loss-{size["width"]}-large.png')
        passed('loaded portrait and opening controls fit at 1280x800 and 1920x1080 with large text')
        page.set_viewport_size({'width':1280,'height':800})
        page.evaluate('''async()=>{const {applySettings}=await import('./src/ui/settings.js');MM.Save.settings.largeText=false;MM.Save.settings.reduceMotion=true;applySettings(MM.ctx)}''')
        for expected in ['others','rumour','in','cat','fight']:
            page.locator('.tut-next').click()
            assert page.locator('.tut-panel').get_attribute('data-page')==expected
        assert page.locator('.tut-next__words').text_content().strip()=='Stay behind her'
        screenshot(page,'fight-story-1280.png')
        page.locator('.tut-next').click();ready(page,'combat')
        page.wait_for_function('MM.ctx.scenes.current.coach?._live',timeout=60000)
        assert page.evaluate('MM.ctx.scenes.current.coach.steps.length')==8
        assert page.locator('.coach__text').inner_text().startswith('That is a Dust Bunny.')
        assert page.locator('.coach__sig .kit-plate__name').text_content().strip()=='Marmalade'
        assert page.locator('.coach__help').count()==0
        fit(page,'.coach button');screenshot(page,'coach-1280.png')
        before=page.evaluate('MM.ctx.scenes.current.engine.current.piles.hand.length')
        page.evaluate('document.activeElement.blur(); MM.ctx.navigator.handle({action:"confirm"})')
        assert page.evaluate('MM.ctx.scenes.current.coach.i')==1
        assert page.evaluate('MM.ctx.scenes.current.engine.current.piles.hand.length')==before
        for i in [2,3,4]:
            page.locator('.coach__next').click()
            assert page.evaluate('MM.ctx.scenes.current.coach.i')==i
        assert page.locator('.coach__text').inner_text()=='Your turn. Play one.'
        card=choose_play(page);assert card
        play_keys(page,card)
        page.wait_for_function('MM.ctx.scenes.current.coach.i===5',timeout=20000)
        page.locator('.coach__next').click()
        assert page.evaluate('MM.ctx.scenes.current.coach.i')==6
        page.locator('#end-turn').click()
        page.wait_for_function('MM.ctx.scenes.current.coach.i===7',timeout=20000)
        assert 'Marmalade will handle the rest.' in page.locator('.coach__text').inner_text()
        page.locator('.coach__next').click()
        assert not page.evaluate('MM.ctx.scenes.current.coach._live')
        passed('original eight-step coach advances through real keyboard card play and End Turn; controller confirm isolates hand')
        for _ in range(80):
            if page.evaluate('MM.ctx.scenes.currentName')!='combat':break
            page.wait_for_function('MM.ctx.scenes.currentName!=="combat" || (MM.ctx.scenes.current.engine.phase==="player" && !MM.ctx.scenes.current.hand.locked)',timeout=30000)
            if page.evaluate('MM.ctx.scenes.currentName')!='combat':break
            card=choose_play(page)
            if card:play_keys(page,card)
            else:page.locator('#end-turn').click()
        ready(page,'tutorial')
        assert page.locator('.tut-panel').get_attribute('data-page')=='after'
        assert 'comes apart into dust' in page.locator('.tut-lines').inner_text()
        page.locator('.tut-next').click()
        assert 'MARMALADE. It is fifty years old.' in page.locator('.tut-lines').inner_text()
        screenshot(page,'name-reveal-1280.png')
        page.locator('.tut-next').click()
        assert page.locator('.tut-next__words').text_content().strip()=='Go and find them'
        page.locator('.tut-next').click()
        page.wait_for_function('MM.ctx.scenes.currentName!=="tutorial" && !MM.ctx.scenes.busy',timeout=60000)
        assert page.evaluate('MM.Save.data.narrative.seen["SEARCH-RECAP"]')
        for _ in range(20):
            if page.evaluate('MM.ctx.scenes.currentName')!='narrative':break
            assert not page.evaluate('MM.ctx.scenes.current.params.units.some(u=>u.id==="SEARCH-RECAP")')
            page.get_by_role('button',name='Continue',exact=True).or_(page.get_by_role('button',name='Next',exact=True)).click()
            page.wait_for_function('!MM.ctx.scenes.busy')
        ready(page,'map')
        assert page.evaluate('MM.ctx.run.kid')=='maya'
        assert page.evaluate('MM.ctx.tutorial===null')
        page.evaluate(await_flush)
        screenshot(page,'expedition-map-1280.png')
        page.reload();ready(page,'tutorial')
        assert page.evaluate('MM.Save.data.narrative.seen["SEARCH-RECAP"]')
        assert page.evaluate('MM.Save.data.seenTutorials.includes("opening")')
        passed('actual UI victory returns to old after/name/hook pages, starts expedition, preserves save and newer narrative handoff')
        # Chromium independently requests the site's absent favicon on reload.
        # Keep that evidence, but do not confuse it with a missing game asset.
        favicon_warnings=[e for e in errors if isinstance(e,dict) and e['location'].get('url')==URL.split('/game/')[0]+'/favicon.ico']
        errors=[e for e in errors if e not in favicon_warnings]
        (OUT/'result.json').write_text(json.dumps({'passed':checks,'errors':errors,'favicon_warnings':favicon_warnings},indent=2)+'\n')
        assert not errors, errors
        passed('zero game-resource/console or uncaught page errors; absent favicon recorded separately')
        browser.close()
    (OUT/'result.json').write_text(json.dumps({'passed':checks,'errors':errors,'favicon_warnings':favicon_warnings},indent=2)+'\n')


if __name__=='__main__':
    main()
