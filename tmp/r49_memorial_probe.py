import json
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--long-deck', action='store_true')
parser.add_argument('--port', type=int, default=9492)
parser.add_argument('--out')
args = parser.parse_args()
long_deck = args.long_deck
out = Path(args.out or ('D:/UILOOP/r49-20261029/repair-gameover' + ('-long' if long_deck else '')))
out.mkdir(parents=True, exist_ok=True)
rows, errors = [], []
BOXES = '''() => {
 const root=document.querySelector('.go-root'), wrap=document.querySelector('.go-wrap');
 const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
 const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 const cues=[...document.querySelectorAll('.r49-scrollcue')].filter(e=>!e.hidden).map(e=>{const r=box(e);return {text:e.textContent,box:r,hit:e.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))}});
 const heading=box(document.querySelector('.go-reach')),card=box(document.querySelector('.go-mvp__slot .mm-card'));
 return {heading,card,headingOverlap:overlap(heading,card),cues,cueOverlap:cues.length>1?overlap(cues[0].box,cues[1].box):0,
 stats:document.querySelectorAll('.go-stat').length,tricks:document.querySelectorAll('.go-trick').length,scrollMax:wrap.scrollHeight-wrap.clientHeight,
 deckScrollMax:document.querySelector('.go-block--deck').scrollHeight-document.querySelector('.go-block--deck').clientHeight};
}'''
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', args=['--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width':1600,'height':900})
    context.route('**/favicon.ico', lambda r:r.fulfill(status=204,body=''))
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://localhost:{args.port}/game/index.html#scene=gameover&seed=7&companion=bones&kid=maya&pics=1')
    page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done" && document.querySelector(".go-wrap")',timeout=150000)
    page.evaluate('document.fonts.ready')
    expected_tricks = 16
    if long_deck:
        expected_tricks = page.evaluate('''async () => {
          const {Run}=await import('/game/src/state/run.js');
          const {cardsOf,sharedCards,neutralCards}=await import('/game/src/data/cards.js');
          const run=new Run({companion:'bones',kid:'maya',seed:4242});
          const defs=[...new Map([...cardsOf('bones'),...sharedCards(),...neutralCards()].map(c=>[c.id,c])).values()];
          run.deck.length=0;
          for(const def of defs)run.addCard(def,{quiet:true});
          MM.ctx.run=run;
          await MM.ctx.scenes.go('gameover',{result:'defeat'});
          return defs.length;
        }''')
        page.wait_for_function('(n)=>document.querySelectorAll(".go-trick").length===n',arg=expected_tricks,timeout=30000)
    for w,h in [(1600,900),(1280,800)]:
        page.set_viewport_size({'width':w,'height':h})
        page.evaluate('()=>{for(const e of document.querySelectorAll(".go-wrap,.go-block--deck"))e.scrollTop=0}')
        page.wait_for_timeout(1800)
        row={'size':[w,h],'initial':page.evaluate(BOXES)}
        page.screenshot(path=str(out/f'initial-{w}.png'))
        row['keys']=[]
        for selector in ['.r49-scrollcue--inset','.go-foot > .r49-scrollcue']:
            cue=page.locator(selector)
            if not cue.count() or not cue.is_visible():continue
            cue.scroll_into_view_if_needed()
            for key in ['Enter','Space']:
                cue.focus()
                before=page.evaluate('()=>[document.querySelector(".go-wrap").scrollTop,document.querySelector(".go-block--deck").scrollTop]')
                page.keyboard.press(key);page.wait_for_timeout(250)
                after=page.evaluate('()=>[document.querySelector(".go-wrap").scrollTop,document.querySelector(".go-block--deck").scrollTop]')
                row['keys'].append({'selector':selector,'key':key,'before':before,'after':after,'sameScene':page.locator('.go-wrap').count()==1})
        row['trickHits']=[]
        for el in page.locator('.go-trick').all():
            el.scroll_into_view_if_needed()
            page.wait_for_timeout(35)
            row['trickHits'].append(el.evaluate('e=>{const r=e.getBoundingClientRect();return {text:e.textContent,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}'))
        page.evaluate('()=>{const e=document.querySelector(".go-wrap");e.scrollTop=e.scrollHeight}')
        page.wait_for_timeout(300)
        row['bottom']=page.evaluate('()=>{const f=document.querySelector(".go-foot").getBoundingClientRect();return [...document.querySelectorAll(".go-stat")].map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,top:r.top,bottom:r.bottom,clear:r.top>=0&&r.bottom<=f.top}})}')
        page.screenshot(path=str(out/f'bottom-{w}.png'))
        rows.append(row)
        print(w,'heading overlap',row['initial']['headingOverlap'],'cue overlap',row['initial']['cueOverlap'],'tricks',sum(x['hit'] for x in row['trickHits']),'stats',sum(x['clear'] for x in row['bottom']),flush=True)
    browser.close()
(out/'proof.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2),encoding='utf-8')
assert not errors,errors
assert all(r['initial']['headingOverlap']==0 and r['initial']['cueOverlap']==0 for r in rows)
assert all(all(c['hit'] for c in r['initial']['cues']) for r in rows)
assert all(all(x['hit'] for x in r['trickHits']) and len(r['trickHits'])==expected_tricks for r in rows)
assert all(all(x['clear'] for x in r['bottom']) and len(r['bottom'])==8 for r in rows)
assert all(all(k['sameScene'] and k['before']!=k['after'] for k in r['keys']) for r in rows)
