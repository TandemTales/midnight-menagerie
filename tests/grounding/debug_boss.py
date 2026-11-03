from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader']);page=b.new_page(viewport={'width':1024,'height':768});page.goto('http://localhost:8777/game/index.html#scene=combat&seed=42&region=study-library&tier=boss&room=Library&companion=bones');page.wait_for_function('window.MM && MM.ctx.scenes.current._opening===false',timeout=60000);page.wait_for_timeout(2500)
 page.evaluate("async()=>{const {setSetting}=await import('/game/src/ui/settings.js');setSetting(MM.ctx,'reduceMotion',true)}")
 for w,h in [(1280,800),(1920,1080),(1024,768)]:
  page.set_viewport_size({'width':w,'height':h})
  for ms in [100,1200,1500]:
   page.wait_for_timeout(ms)
   print(w,ms,page.evaluate("()=>({floor:MM.ctx.scenes.current._stageFl,hand:MM.ctx.scenes.current.hand.restTop(5),rise:[...MM.ctx.scenes.current.views.values()].map(v=>v._rise)})"),flush=True)
 print(page.evaluate("""()=>{const s=MM.ctx.scenes.current,v=[...s.views.values()][0];const out=[];for(let i=0;i<3;i++){s._fitPlates();out.push({rise:v._rise,host:s.$handHost.getBoundingClientRect().top,rest:s.hand.restTop(5),plate:v.$plate.getBoundingClientRect().bottom,fn:s._fitPlates.toString().slice(0,600)});}v.el.style.setProperty('--e-rise','0px');out.push({unraised:v.$plate.getBoundingClientRect().bottom,rise:v._rise,style:v.el.style.cssText});return out}"""));b.close()
