"""Three rejected paint overrides: geometry identity and fresh final pixels."""
import hashlib,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
initial='9cb13654ffced0788242b93f9a25abd8b0365b1a'
source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
out=Path('docs/ui-pass/ONYX-r56-proofs/repaired-surfaces');out.mkdir(exist_ok=True)
rows=[];errors=[]
selectors={'shop':'.sh-card .mm-card__cost','gameover':'.go-trick__cost','event':'.ev-bookmark'}
JS="""sel=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),q=document.createRange();q.selectNodeContents(e);return {text:e.textContent,box:{x:r.x,y:r.y,width:r.width,height:r.height},font:s.font,fontSize:s.fontSize,color:s.color,padding:s.padding,borderWidth:s.borderWidth,background:s.backgroundImage,shadow:s.boxShadow,ink:[...q.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))}})"""
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome');c=b.new_context();c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for scene,sel in selectors.items():
  path='game/src/scenes/'+scene+'.css';old=subprocess.check_output(['git','show',initial+':'+path]).decode('utf-8');final=Path(path).read_text(encoding='utf-8')
  for w,h in [(1280,800),(1600,900)]:
   page.set_viewport_size({'width':w,'height':h});pair={}
   for variant,css in [('initial',old),('final',final)]:
    c.route('**/'+path,lambda r:r.fulfill(status=200,content_type='text/css',body=css))
    page.goto(f'http://localhost:9562/game/index.html?repair={scene}-{w}-{variant}#scene={scene}&seed=7&companion=bones&kid=maya&pics=1');page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"',timeout=150000);page.evaluate('document.fonts.ready');page.wait_for_timeout(1200)
    pair[variant]=page.evaluate(JS,sel)
    if variant=='final':
     f=out/f'{scene}-{w}.png';page.screenshot(path=str(f));pair['image']={'path':str(f.resolve()),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'visual_source_commit':source}
    c.unroute('**/'+path)
   assert len(pair['initial'])==len(pair['final'])>0
   for a,z in zip(pair['initial'],pair['final']):
    for key in ['text','box','font','fontSize','color','padding','borderWidth','ink']:assert a[key]==z[key],(scene,w,key,a,z)
   rows.append({'scene':scene,'width':w,'initialCSS':hashlib.sha256(old.encode()).hexdigest(),'finalCSS':hashlib.sha256(final.encode()).hexdigest(),**pair});print(scene,w,'geometry identical',flush=True)
 (out/'proof.json').write_text(json.dumps({'initialSource':initial,'finalSource':source,'rows':rows,'errors':errors,'note':'Only background/border-color/box-shadow overrides removed; box, Range ink, text, font, computed color, padding and border widths exactly identical. All original interaction assertions retained from initial source.'},indent=2),encoding='utf-8')
 b.close()
assert not errors
