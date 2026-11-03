"""Restored opening regression plus retained general Help and fort regressions.
Run: python tests/tutorial-narrative/run.py. No gameplay or save mocks.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
def assert_controls_fit(page, selector, container=None):
    assert page.evaluate("""({selector,container}) => {
      const host=container?document.querySelector(container):null;
      const d=host?host.getBoundingClientRect():{left:0,top:0,right:innerWidth,bottom:innerHeight};
      const buttons=[...document.querySelectorAll(selector)].filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden');
      return buttons.length>0 && buttons.every(b=>{
        const r=b.getBoundingClientRect();
        return r.left>=Math.max(0,d.left)-1 && r.right<=Math.min(innerWidth,d.right)+1
          && r.top>=Math.max(0,d.top)-1 && r.bottom<=Math.min(innerHeight,d.bottom)+1;
      });
    }""",{'selector':selector,'container':container})


def set_large_text(page, enabled):
    page.evaluate("""async enabled => {
      const {applySettings}=await import('./src/ui/settings.js');
      MM.Save.settings.largeText=enabled; applySettings(MM.ctx);
    }""",enabled)
    assert page.locator('html').get_attribute('data-large-text')==('1' if enabled else '0')
    if enabled:
        assert page.evaluate('parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--type-scale"))')>1


def settle_portrait(page):
    page.wait_for_function('''()=>{
      const img=document.querySelector('.tut-fig__img');
      return img && img.complete && img.naturalWidth>0;
    }''',timeout=30000)
    page.evaluate('''async()=>{
      await document.querySelector('.tut-fig__img').decode();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }''')
    assert page.locator('.tut-fig__img').is_visible()

def main():
    # The replacement tutorial is archived in docs/rollbacks/2026-10-28-new-tutorial.
    # Run the restored story/coach expectations while retaining unrelated coverage.
    import runpy
    runpy.run_path(str(ROOT/'tests/tutorial-restore/run.py'), run_name='__main__')
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width':1280,'height':800})
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://localhost:8777/game/index.html#scene=combat&encounter=foyer-1&seed=42',wait_until='load')
        page.wait_for_function('window.MM && MM.ctx.scenes.currentName === "combat" && !MM.ctx.scenes.busy',timeout=60000)
        page.wait_for_function('MM.ctx.scenes.current.engine.phase === "player" && !MM.ctx.scenes.current.hand.locked',timeout=60000)
        page.evaluate("import('./src/ui/scuffle-help.js').then(m=>{m.openScuffleHelp(MM.ctx)})")
        page.wait_for_selector('.mm-modal')
        turn=page.evaluate('MM.ctx.scenes.current.engine.turn')
        page.keyboard.press('e')
        assert page.evaluate('MM.ctx.scenes.current.engine.turn')==turn
        assert_controls_fit(page,'.mm-modal__foot button','.mm-modal__dialog')
        page.evaluate('MM.ctx.navigator.handle({action:"cancel"})')
        assert page.locator('.mm-modal').count()==0
        assert page.locator('.mm-settings-modal').count()==0
        print('PASS optional general Help remains available; End Turn and controller Cancel stay isolated')
        # The fort journal remains useful after finite conversations are exhausted.
        page.evaluate("""async () => {
          const {Run}=await import('./src/state/run.js');
          const {NodeType}=await import('./src/data/schema.js');
          const run=new Run({kid:'maya',companion:'marmalade',seed:196});
          MM.ctx.run=run;run.currentNodeId=run.map.nodes.find(n=>n.type===NodeType.SAFE).id;
          MM.Save.data.narrative.pets.maya='unknown';
          delete MM.Save.data.narrative.seen['KID-maya-rest-0'];
          delete MM.Save.data.narrative.seen['KID-maya-rest-1'];
          delete MM.Save.data.narrative.seen['COMP-marmalade-1'];
          MM.ctx.scenes.go('rest',{narrativeBypass:true}, {instant:true});
        }""")
        page.wait_for_function('MM.ctx.scenes.currentName==="rest" && !MM.ctx.scenes.busy')
        assert page.locator('.rs-door[data-opt="rest"]').get_attribute('aria-label').startswith('Rest. Courage ')
        assert ' to ' in page.locator('.rs-door[data-opt="rest"]').get_attribute('aria-label')
        assert '&rarr;' not in page.locator('.rs-door[data-opt="rest"]').get_attribute('aria-label')
        page.get_by_role('button',name='Discoveries',exact=True).click()
        page.wait_for_selector('dialog[open]')
        assert page.get_by_role('button',name='A quiet moment with Maya',exact=True).count()==1
        assert page.get_by_role('button',name='Sit with Marmalade',exact=True).count()==1
        assert page.evaluate("""() => {
          const talks=document.querySelector('.story-conversations');
          const records=[...document.querySelectorAll('dialog[open] > details')];
          return talks && records.every(r=>Boolean(talks.compareDocumentPosition(r)&Node.DOCUMENT_POSITION_FOLLOWING));
        }""")
        page.get_by_role('button',name='Close discoveries',exact=True).click()
        page.evaluate("""() => {
          Object.assign(MM.Save.data.narrative.seen, {
            'KID-maya-rest-0':true,'KID-maya-rest-1':true,'COMP-marmalade-1':true
          });
        }""")
        page.get_by_role('button',name='Discoveries',exact=True).click()
        page.wait_for_selector('dialog[open]')
        assert page.get_by_role('button',name='A quiet moment with Maya',exact=True).count()==0
        assert page.get_by_role('button',name='Sit with Marmalade',exact=True).count()==0
        assert page.get_by_role('button',name='Sit and talk',exact=True).count()==0
        page.get_by_role('button',name='Close discoveries',exact=True).click()
        print('PASS truthful fort journal label before/after exhausted talks; Rest accessibility reads to')
        captions=page.evaluate("""async () => {
          const {Run}=await import('./src/state/run.js');
          const {COMPANIONS}=await import('./src/data/schema.js');
          const {COMPANION_STORIES}=await import('./src/data/narrative-relationships.js');
          const {restCaption,REPEAT_COMPANION_TALK}=await import('./src/scenes/rest.js');
          for(const c of COMPANIONS){
            const r=new Run({companion:c.slug,kid:'maya',seed:197});
            const twin=Run.resume(r.snapshot()),seen={[`COMP-${c.slug}-1`]:true};
            if(restCaption(r,{})!==COMPANION_STORIES[c.slug][1][0])throw Error('first caption changed: '+c.slug);
            if(REPEAT_COMPANION_TALK[c.slug].length!==3)throw Error('missing repeat bank: '+c.slug);
            const line=restCaption(r,seen);
            if(!REPEAT_COMPANION_TALK[c.slug].includes(line))throw Error('wrong identity: '+c.slug);
            if(restCaption(twin,seen)!==line || r.rng.next()!==twin.rng.next())throw Error('resume or RNG changed: '+c.slug);
          }
          const control=Run.resume(MM.ctx.run.snapshot());control.ephemeral=true;
          control.addClues(1);
          return {expected:restCaption(MM.ctx.run,MM.Save.data.narrative.seen),expectedClues:control.cluesFound};
        }""")
        page.locator('.rs-door[data-opt="sit"]').click()
        page.wait_for_function('(line)=>document.querySelector(".rs-line").textContent===line',arg=captions['expected'])
        assert page.evaluate('MM.ctx.run.cluesFound')==captions['expectedClues']
        assert page.evaluate('MM.ctx.scenes.current.used')
        assert page.locator('.rs-door:enabled').count()==0
        print('PASS all16 first/repeat identity and resume; paid Sit retains one action and real base Clue award with existing bonuses')
        assert not errors, errors
        print('PASS retained general Help and fort checks: zero uncaught page errors')
        browser.close()

if __name__=='__main__': main()

