"""Run the behavioural seam proofs in a real browser.

    python tests/seams/proof.py [--wait 20] [--verbose]

Exit code 0 only when the page reports `RESULT: n passed, 0 failed`.
"""
import asyncio, sys, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/seams/proof.html"


async def main(a):
    from playwright.async_api import async_playwright
    logs, errors = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1280, "height": 900})).new_page()
        page.on("console", lambda m: (logs.append(m.text),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        try:
            await page.wait_for_function("window.__SEAM_PROOF__ !== undefined",
                                         timeout=int(a.wait * 1000))
        except Exception:
            print("!! proofs did not finish within %.1fs" % a.wait)
        res = await page.evaluate("window.__SEAM_PROOF__ || null")
        text = await page.evaluate("document.body.innerText")
        await browser.close()

    if a.verbose:
        print(text)
    else:
        for line in logs:
            if line.startswith("FAIL"):
                print(line)
    if errors:
        print("\n--- console errors ---")
        for e in errors[:30]:
            print(" ", e)
    if not res:
        print("RESULT: no result")
        return 1
    print("RESULT: %d passed, %d failed" % (res["passed"], res["failed"]))
    if res.get("crashed"):
        print(res["crashed"])
    return 0 if res["failed"] == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=25)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
