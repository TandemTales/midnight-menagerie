import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge')
        page = await browser.new_page(viewport={'width': 1600, 'height': 1100})
        # The dev-only contact sheet has no favicon; omit that unrelated request.
        await page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        await page.goto('http://localhost:8777/tests/faces/index.html')
        await page.locator('#pols img').last.wait_for()
        result = await page.evaluate('''async () => {
          const m = await import('/game/src/ui/petart.js');
          const { KIDS } = await import('/game/src/data/schema.js');
          const assert = (v, message) => { if (!v) throw Error(message); };
          m.clearFaceCache();
          assert(m.faceCacheSize() === 0, 'cache reset');
          assert(await m.warmFaces({ sync: true }) === 8, 'all eight decoded');
          assert(m.faceCacheSize() === 8, 'all eight cached');
          assert(await m.warmFaces() === 0, 'warm cache reused');
          assert(m.petPhoto('unknown') === null, 'unknown photo');
          assert(m.petKey(null) === null, 'unknown key');
          for (const k of KIDS) {
            assert(m.petKey(k.slug) === k.pet.toLowerCase(), 'kid alias');
            assert(m.petPhoto(k.name) === m.petPhoto(k.pet), 'full name alias');
            const img = m.petImg(k.slug);
            await img.decode();
            assert(img.naturalWidth >= 1000, 'high resolution asset');
            assert(img.naturalWidth * 3 === img.naturalHeight * 4, '4:3 aspect');
            assert(img.alt.includes(k.pet), 'accessible name');
            assert(img.width === 496 && img.height === 372, 'stable layout');
          }
          await Promise.all([...document.images].map(img => img.decode()));
          return { pets: m.PET_KEYS, decoded: 8, cacheSize: m.faceCacheSize() };
        }''')
        await page.screenshot(path=str(OUT / 'after.png'), full_page=True)
        await page.locator('#pols').screenshot(path=str(OUT / 'polaroids.png'))
        result['contactSheetErrors'] = errors.copy()
        assert not errors, errors
        await page.goto('http://localhost:8777/game/index.html#scene=clubhouse')
        await page.locator('.polaroid').last.wait_for(timeout=60000)
        await page.evaluate('''async () => {
          await Promise.all([...document.querySelectorAll('.polaroid__photo img')].map(img => img.decode()));
        }''')
        await page.wait_for_timeout(2000)
        result['boardPets'] = await page.locator('.polaroid__photo img').count()
        result['gameErrors'] = errors.copy()
        await page.screenshot(path=str(OUT / 'clubhouse.png'))
        (OUT / 'verification.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
        assert result['boardPets'] == 8
        assert not errors, errors
        await browser.close()

asyncio.run(main())
