import asyncio,hashlib,json
from pathlib import Path
from PIL import Image
P=Path(__file__).resolve().parent
ROOT=P.parents[2]
async def browser_check():
 from playwright.async_api import async_playwright
 async with async_playwright() as pw:
  browser=await pw.chromium.launch()
  page=await browser.new_page(viewport={'width':1200,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto((P/'animation-gallery.html').as_uri())
  await page.wait_for_function("document.querySelector('#frame').textContent.includes('/ 40')")
  result=await page.evaluate('''async()=>{const seen=[];let prev='',start=performance.now();return await new Promise(resolve=>{function sample(t){const s=document.querySelector('#frame').textContent;if(s!==prev){seen.push([t-start,s]);prev=s}if(t-start>=1000)resolve({transitions:seen.length-1,elapsed_ms:t-start,samples:seen});else requestAnimationFrame(sample)}requestAnimationFrame(sample)})}''')
  await page.click('#play');before=await page.locator('#frame').inner_text()
  await page.wait_for_timeout(120);paused=await page.locator('#frame').inner_text()
  await page.click('#step');stepped=await page.locator('#frame').inner_text()
  result.update(pause_works=before==paused,step_works=stepped!=paused,row_count=await page.locator('tbody tr').count(),errors=errors)
  await page.screenshot(path=str(P/'gallery-preview.png'))
  await browser.close()
  return result
try: result=asyncio.run(browser_check())
except Exception as e: result={'error':str(e),'status':'not_verified'}
(P/'preview-browser-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('Preview:',json.dumps(result)[:350])
b=json.loads((P/'preexisting-assets-sha256.json').read_text(encoding='utf-8'))
changed=[];missing=[]
for path,expected in b.items():
 f=ROOT/path
 if not f.exists():missing.append(path)
 elif hashlib.file_digest(f.open('rb'),'sha256').hexdigest()!=expected:changed.append(path)
v={'checked':len(b),'changed':changed,'missing':missing,'passed':not changed and not missing}
(P/'preservation-validation.json').write_text(json.dumps(v,indent=2),encoding='utf-8')
print('Preservation:',v)
