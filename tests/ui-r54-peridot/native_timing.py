"""ABBA native CSS comparison: supplied FLUORITE baseline/current PERIDOT.

Select the larger-p95 of the two retained crowd/all-long cases.
Only combat.css varies; route its native stylesheet URL and replace its link
in the same cascade position so the
baseline has no residual current pseudo-element/material declarations. All
boards, JS, assets, scene parameters, launch flags, animation and ink checks
are held constant. Four bounded trials balance inherited/current/current/inherited.
"""
import ast,hashlib,json,statistics,subprocess,sys
from urllib.parse import urlparse,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='7fc1b303cd84aeaac93c3b16a3620a40becae372'
OUT=Path('docs/ui-pass/PERIDOT-r54-proofs/native-material-timing')
ORIGIN='http://localhost:'+sys.argv[1] if '--plan-only' not in sys.argv else 'http://localhost:9542'
STYLESHEET=ORIGIN+'/game/src/scenes/combat.css'
ASSETS=[{'url':ORIGIN+'/'+name,'sha256':hashlib.sha256(Path(name).read_bytes()).hexdigest()} for name in ['game/assets/ui/r53-fluorite/velvet-cartouche-v1.webp','game/assets/ui/r54-peridot/worn-plaque-v1.webp']]
queue=json.loads(Path('docs/ui-pass/PERIDOT-r54-proofs/queue/proof.json').read_text(encoding='utf-8'))
worst=max((r for r in queue['results'] if r['kind']=='crowd' and r['mode']=='all-long'),key=lambda r:r['frameTimes']['p95'])
width=worst['width'];height={1280:800,1600:900}[width];kind=worst['kind'];mode=worst['mode']
params={'seed':42,'companion':'crumbula' if mode=='all-long' else 'bones','kid':'maya'}
params.update({'encounter':'foyer-boss'} if kind=='boss' else {'region':'passages','room':'Narrow Corridor','tier':'standard','enemies':4})
old=subprocess.check_output(['git','show',BASE+':game/src/scenes/combat.css']).decode('utf-8')
current=Path('game/src/scenes/combat.css').read_text(encoding='utf-8')
source=ast.parse(Path('tests/ui-r51-spinel/probe-queue.py').read_text(encoding='utf-8'))
CHECK=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CHECK' for t in n.targets))
CHECK=CHECK.replace('return {mode,frames,peak,all,layoutTimes,frameTimes:', 'return {rawFrameTimes:frameTimes,mode,frames,peak,all,layoutTimes,frameTimes:')
ORDER=['inherited','current','current','inherited']
FLAGS=['--use-gl=angle','--use-angle=default','--force-color-profile=srgb']
META={'selection':'Maximum per-case frame p95 among two actual long-party crowded all-long cases in retained complete16-case queue proof','selectedFullRunCase':{'width':width,'kind':kind,'mode':mode,'frameTimes':worst['frameTimes']},'params':params,'viewport':{'width':width,'height':height},'flags':FLAGS,'baseline':BASE,'currentSource':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'cssSHA256':{'inherited':hashlib.sha256(old.encode()).hexdigest(),'current':hashlib.sha256(current.encode()).hexdigest()},'order':ORDER,'stylesheetRouting':'Native stylesheet URL retains /game/src/scenes/ base; original link disabled and routed replacement loaded in same cascade position','expectedAssets':ASSETS,'samplePolicy':'Original every-frame DOM+Range/protected/UI/locality/lifecycle/FIFO proof; raw frame/layout times retained; no animation shortening. Screenshot target disabled (1e9): no screenshots or artificial pauses. Actual effective font/color/filter/will-change/stroke/shadow/backing verified for all five kinds after CSS load, before measured animation plus1200ms settle, and reverified only after full drainage. These are geometry-harness frame intervals, not isolated game-only frame timings.'}
if '--plan-only' in sys.argv:
 print(json.dumps(META,indent=2));sys.exit(0)
SNAPSHOT=r"""()=>{
 const link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(e=>e.id!=='peridot-material-timing'&&new URL(e.href).pathname==='/game/src/scenes/combat.css'),style=document.getElementById('peridot-material-timing');
 const host=MM.ctx.scenes.current.fx.$nums,temp=document.createElement('div');temp.className='cb-num';temp.dataset.actorId='proof-owner';temp.style.display='none';host.append(temp);
 const rows=['status','buff','debuff','counter','blocked'].map(kind=>{temp.dataset.kind=kind;const s=getComputedStyle(temp),p=getComputedStyle(temp,'::before');return {kind,color:s.color,font:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,borderImage:s.borderImageSource,borderWidth:s.borderImageWidth,filter:s.filter,textShadow:s.textShadow,stroke:s.webkitTextStrokeWidth,willChange:s.willChange,backingContent:p.content,backingFilter:p.filter,backingImage:p.borderImageSource,animation:s.animation,globalAnimationScale:s.getPropertyValue('--anim-scale')};});temp.remove();return {linkDisabled:link.disabled,styleBeforeLink:style.nextElementSibling===link,replacementHref:style.href,originalHref:link.href,conditions:rows};
}"""
def verify_styles(snapshot,variant):
 assert snapshot['linkDisabled'] and snapshot['styleBeforeLink'],snapshot
 assert snapshot['replacementHref']==STYLESHEET+'?r54material='+variant,snapshot
 for row in snapshot['conditions']:
  assert float(row['font'].removesuffix('px'))>={'status':16,'buff':17,'debuff':17,'counter':16,'blocked':20}[row['kind']],row
  assert row['filter']=='none' and row['stroke']=='1px' and row['willChange']=='auto',row
  assert row['textShadow']=='rgb(7, 6, 13) 1px 1px 0px',row
  assert row['backingContent']=='none' and row['backingFilter']=='none',row
  assert row['borderImage']=='url("'+ASSETS[0 if variant=='inherited' else 1]['url']+'")',row
  assert row['padding']=='1px 9px',row
  assert row['borderWidth']==('9px 16px' if variant=='inherited' else '6px 8px'),row
OUT.mkdir(parents=True,exist_ok=True);rows=[];errors=[];semantic_colors={};native_fonts={}
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=FLAGS);c=b.new_context(viewport=META['viewport']);c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def stylesheet_route(route):
  variant=parse_qs(urlparse(route.request.url).query)['r54material'][0];assert variant in ORDER
  body=old if variant=='inherited' else current
  route.fulfill(status=200,content_type='text/css',body=body)
 c.route('**/game/src/scenes/combat.css?r54material=*',stylesheet_route)
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html?r54materialtiming=1#scene=title&seed=42&companion=bones&kid=maya');page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"',timeout=150000)
 for i,variant in enumerate(ORDER):
  page.evaluate('p=>MM.goto("combat",p)',params)
  page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000)
  page.evaluate("""async variant=>{
   const original=[...document.querySelectorAll('link[rel="stylesheet"]')].find(e=>e.id!=='peridot-material-timing'&&new URL(e.href).pathname==='/game/src/scenes/combat.css');if(!original)throw Error('Missing combat CSS link');
   document.getElementById('peridot-material-timing')?.remove();
   const replacement=document.createElement('link');replacement.rel='stylesheet';replacement.id='peridot-material-timing';original.before(replacement);original.disabled=true;
   const url=new URL(original.href);url.search='?r54material='+variant;
   await new Promise((resolve,reject)=>{replacement.onload=resolve;replacement.onerror=()=>reject(Error('Replacement CSS failed to load'));replacement.href=url.href;});
  }""",variant)
  styles=page.evaluate(SNAPSHOT)
  (OUT/f'preflight-{i}.json').write_text(json.dumps({'variant':variant,'before':styles},indent=2),encoding='utf-8')
  verify_styles(styles,variant)
  colors={r['kind']:r['color'] for r in styles['conditions']}
  if not semantic_colors: semantic_colors.update(colors)
  assert colors==semantic_colors,colors
  fonts={r['kind']:r['font'] for r in styles['conditions']}
  if not native_fonts: native_fonts.update(fonts)
  assert fonts==native_fonts,fonts
  assets=page.evaluate("""async expected=>Promise.all(expected.map(async({url,sha256})=>{
   const response=await fetch(url,{cache:'reload'}),bytes=await response.arrayBuffer();
   const digest=await crypto.subtle.digest('SHA-256',bytes),actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   const image=new Image();image.src=url;await image.decode();
   return {url,responseURL:response.url,status:response.status,type:response.headers.get('content-type'),bytes:bytes.byteLength,expectedSHA256:sha256,actualSHA256:actual,width:image.naturalWidth,height:image.naturalHeight};
  }))""",ASSETS)
  (OUT/f'assets-{i}.json').write_text(json.dumps({'variant':variant,'resources':assets},indent=2),encoding='utf-8')
  assert all(a['status']==200 and a['url']==a['responseURL'] and a['type'].startswith('image/') and a['bytes']>0 and a['width']>0 and a['height']>0 and a['actualSHA256']==a['expectedSHA256'] for a in assets),assets
  page.wait_for_timeout(1200);page.evaluate('window.r49CaptureTarget=1000000000')
  row=page.evaluate(CHECK,mode);row.update(order=i,variant=variant,width=width,kind=kind,computedBefore=styles,verifiedAssets=assets);rows.append(row)
  (OUT/'proof.json').write_text(json.dumps({**META,'rows':rows,'errors':errors},indent=2),encoding='utf-8');print(i,variant,row['frameTimes'],'frames',row['frames'],'drain',row['drainMs'],flush=True)
  assert row['pausedMs']==0,'Timing trials must never enter screenshot pause'
  assert not row['failures'] and len(row['delivered'])==6 and len(row['expired'])==6 and row['queued']==0,row
  assert all(e['elapsed']>=e['duration'] for e in row['expired'])
  assert len(row['starts'])==6 and len({e['serial'] for e in row['starts']})==6
  for owner in {e['owner'] for e in row['starts']}:
   serials=[e['serial'] for e in row['starts'] if e['owner']==owner];assert serials==sorted(serials),'FIFO is required within each owner; independent owners may drain out of global order'
  after=page.evaluate(SNAPSHOT);row['computedAfter']=after
  (OUT/'proof.json').write_text(json.dumps({**META,'rows':rows,'errors':errors},indent=2),encoding='utf-8')
  verify_styles(after,variant);assert after==styles,'Effective styling changed during timing trial'
 b.close()
assert not errors and len(rows)==4
summary={v:{'p95Median':statistics.median(r['frameTimes']['p95'] for r in rows if r['variant']==v),'p95Trials':[r['frameTimes']['p95'] for r in rows if r['variant']==v],'max':max(r['frameTimes']['max'] for r in rows if r['variant']==v),'drainMedian':statistics.median(r['drainMs'] for r in rows if r['variant']==v),'samples':sum(len(r['rawFrameTimes']) for r in rows if r['variant']==v)} for v in ['inherited','current']}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(summary)
