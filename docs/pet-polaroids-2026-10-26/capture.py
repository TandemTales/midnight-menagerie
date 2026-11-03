import asyncio
import base64
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    out = Path(__file__).parent / 'originals'
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge')
        page = await browser.new_page(viewport={'width': 1600, 'height': 1100})
        await page.goto('http://localhost:8777/tests/faces/index.html')
        await page.locator('#pets img').last.wait_for()
        photos = await page.evaluate("async () => {const m = await import('/game/src/ui/petart.js'); return Object.fromEntries(m.PET_KEYS.map(k => [k, m.petPhoto(k)]));}")
        for key, data in photos.items():
            (out / (key + '.png')).write_bytes(base64.b64decode(data.split(',')[1]))
        await page.screenshot(path=str(out.parent / 'before.png'), full_page=True)
        await browser.close()
    print(f'Exported {len(photos)} original pet photos')

asyncio.run(main())
