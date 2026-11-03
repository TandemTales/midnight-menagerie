"""Initial full memorial text, portrait lines and all inventory quantities."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('docs/ui-pass/PERIDOT-r54-proofs');out.mkdir(parents=True,exist_ok=True)
JS=r"""()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
 const ink=e=>{const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}))};
 const contained=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
 const wrap=box(document.querySelector('.go-wrap')),rail=box(document.querySelector('.go-board > .r50-scrollrail'));
 const content=['.go-mvp__slot .mm-card','.go-mvp__h','.go-said'].map(sel=>{const e=document.querySelector(sel),r=box(e),lines=ink(e);return {sel,text:e.textContent,box:r,lines,visible:contained(r,wrap)&&r.bottom<=rail.top&&lines.every(q=>contained(q,wrap)&&q.bottom<=rail.top)}});
 const portraits=[...document.querySelectorAll('.go-portrait__plate')].map(e=>({text:e.textContent,box:box(e),lines:ink(e),contained:ink(e).every(r=>contained(r,box(e)))}));
 const tricks=[...document.querySelectorAll('.go-trick')].map(e=>{const n=e.querySelector('.go-trick__name'),q=e.querySelector('.go-trick__n');return {text:e.textContent,title:n.textContent,quantityText:q?.textContent,name:box(n),quantity:q?box(q):null,clear:ink(n).every(r=>(!q||r.right<=box(q).left-1)&&contained(r,box(e)))}});
 const reach=box(document.querySelector('.go-reach')),stage=box(document.querySelector('.go-stage')),shrine=box(document.querySelector('.go-shrine'));
 const typography=[...document.querySelectorAll('.go-reach > :not(i)')].map(e=>{const s=getComputedStyle(e);return {class:e.className,font:s.fontSize,reading:s.getPropertyValue('--reading-size'),floor:s.getPropertyValue('--reading-floor')}});
 return {wrap,rail,content,portraits,tricks,reach,stage,shrine,typography,baseClear:shrine.bottom<=rail.top-10,progressLeft:reach.right<shrine.left&&reach.top>=stage.bottom-1};
}"""
rows=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome');c=b.new_context();c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=gameover&seed=7&companion=bones&kid=maya&pics=1');page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done"',timeout=150000)
 for w,h in [(1280,800),(1600,900)]:
  page.set_viewport_size({'width':w,'height':h});page.evaluate('document.fonts.ready');page.wait_for_timeout(1600);page.locator('.go-wrap').evaluate('e=>e.scrollTop=0');row=page.evaluate(JS);row['size']=[w,h];rows.append(row);page.screenshot(path=str(out/f'memorial-geometry-{w}.png'));print(w,[(x['sel'],x['visible'],x['box']['bottom']) for x in row['content']],flush=True)
 expected=page.evaluate(r"""async()=>{const {Run}=await import('/game/src/state/run.js');const {cardsOf,sharedCards,neutralCards}=await import('/game/src/data/cards.js');const run=new Run({companion:'bones',kid:'maya',seed:4242});const defs=[...new Map([...cardsOf('bones'),...sharedCards(),...neutralCards()].map(c=>[c.id,c])).values()];run.deck.length=0;for(const d of defs){for(let i=0;i<12;i++)run.addCard(d,{quiet:true});}MM.ctx.run=run;await MM.ctx.scenes.go('gameover',{result:'defeat'});return defs.length;}""")
 page.wait_for_function('(n)=>document.querySelectorAll(".go-trick").length===n',arg=expected,timeout=30000)
 for w,h in [(1280,800),(1600,900)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(900);row=page.evaluate(JS);assert expected==109 and len(row['tricks'])==expected and all(x['quantity'] and x['clear'] and x['quantityText'].strip()=='×12' for x in row['tricks']),row['tricks'];(out/f'long-quantities-{w}.json').write_text(json.dumps({'expected':expected,'copiesEach':12,'longest':max(row['tricks'],key=lambda x:len(x['title'])),'tricks':row['tricks']},indent=2));print(w,'long quantities',expected,flush=True)
 b.close()
(out/'memorial-geometry.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2),encoding='utf-8')
assert not errors,errors
assert all(r['progressLeft'] and r['baseClear'] and all(x['visible'] for x in r['content']) and all(x['contained'] for x in r['portraits']) and all(x['clear'] for x in r['tricks']) for r in rows),'Full memorial or quantity bounds failed'
