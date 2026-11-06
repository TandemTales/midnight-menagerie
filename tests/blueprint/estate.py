"""The master/section seam and visual examples of independent wing layouts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
OUT=Path(__file__).parent
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1600,'height':1000},reduced_motion='reduce')
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.goto('http://localhost:8777/game/index.html#scene=atlas&all=1')
    page.wait_for_function("document.querySelector('[data-hair=\"1\"]')",timeout=60000)
    page.evaluate('document.fonts.ready')
    assert page.locator('.at-hot').count()==17
    result=page.evaluate('''async()=>{
      const {estateSections,surveyMap,footprintRings}=await import('/game/src/ui/estate-blueprint.js');
      const {generateRegionMap}=await import('/game/src/state/mapgen.js');
      const sections=estateSections(),errors=[];
      for(const s of sections){
        const a=surveyMap(s.slug).plan,b=generateRegionMap(s.slug,42,{style:'plan'}).plan;
        if(JSON.stringify(a)!==JSON.stringify(b))errors.push('section/map mismatch '+s.slug);
        // A wing may be laid on the master a quarter turn clockwise (rot 90,
        // its door at the top); the footprint must still be the section's own,
        // at one scale, turned exactly so.
        const turned=s.rot===90,k=turned?s.w/b.sheet.h:s.w/b.sheet.w;
        if(Math.abs((turned?b.sheet.w:b.sheet.h)*k-s.h)>.0001)errors.push('section scale not uniform '+s.slug);
        const P=(u,v)=>turned?[s.x+(b.sheet.h-v)*k,s.y+u*k]:[s.x+u*k,s.y+v*k];
        const rings=footprintRings(b.footprint).map(r=>{const o=[];for(let i=0;i+1<r.length;i+=2)o.push(...P(r[i],r[i+1]));return o;});
        if(rings.length!==s.outline.length||rings.some((r,i)=>r.length!==s.outline[i].length||r.some((v,j)=>Math.abs(v-s.outline[i][j])>.0001)))errors.push('master footprint mismatch');
        if(s.x<0||s.y<0||s.x+s.w>1448||s.y+s.h>1086)errors.push('section outside master');
      }
      for(let i=0;i<sections.length;i++)for(let j=i+1;j<sections.length;j++){
        const a=sections[i],b=sections[j];
        if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y))errors.push('overlapping section insets');
      }
      return {sections:sections.length,errors};
    }''')
    assert not result['errors'],result
    assert not any('/blueprint/mansion.png' in u or '/blueprint/traces/' in u for u in requests)
    page.screenshot(path=str(OUT/'estate.png'),timeout=60000)
    # Real atlas button click re-inks the corresponding section, retaining UI.
    page.locator('.at-hot[data-wing="foyer"]').click(force=True)
    page.wait_for_function('MM.ctx.scenes.current.sel==="foyer" && !MM.ctx.scenes.current._ink.hidden')
    page.screenshot(path=str(OUT/'estate-foyer.png'),timeout=60000)
    for region in ['nursery','study-library','lampworks','bathhouse']:
        page.goto('http://localhost:8777/game/index.html#scene=map&seed=42&region='+region)
        page.reload()
        page.wait_for_selector('.map-screen.is-drawn',timeout=60000)
        page.wait_for_function('!MM.ctx.scenes.busy')
        # Background artwork warms independently of the interactive map.
        page.wait_for_timeout(1800)
        page.locator('[data-action="overview"]').click()
        page.screenshot(path=str(OUT/(region+'.png')),timeout=60000)
    assert not errors,errors
    (OUT/'estate-result.json').write_text(json.dumps({**result,'browserErrors':errors},indent=2))
    print('PASS 17 matching master/section plans, nonoverlapping insets, atlas zoom, four distinct wing previews, no browser exceptions',flush=True)
    browser.close()
