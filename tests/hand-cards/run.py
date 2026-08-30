"""Run the hand-card assertion suite in a real browser and print the result.

    python tests/hand-cards/run.py [--wait 30] [--verbose]

Proves the nine Status and Curse cards whose printed rules never fired, each
against a control that runs the same fight without the card. The suite also
carries the gate for the whole class: an `unplayable` card may not have a
working `effect`, because nothing can ever call it.

Exit code 0 only when the page reports `RESULT: n passed, 0 failed`.
Owned by the combat-engine agent; does not touch tools/.
"""
import asyncio, sys, argparse, io

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/hand-cards/index.html"


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
            await page.wait_for_function("window.__TEST_RESULT__ !== undefined",
                                         timeout=int(a.wait * 1000))
        except Exception:
            print("!! suite did not finish within %.1fs" % a.wait)

        res = await page.evaluate("window.__TEST_RESULT__ || null")
        text = await page.evaluate("document.body.innerText")
        await browser.close()

    fails = [l for l in logs if l.startswith("FAIL") or l.strip().startswith("FAIL")]
    if a.verbose:
        print(text)
    else:
        for l in logs:
            if l.startswith("FAIL") or l.strip().startswith("FAIL") or l.strip().startswith("ERROR"):
                print(l)

    if errors:
        print("\n--- console errors ---")
        for e in errors[:40]:
            print(e)

    if not res:
        print("RESULT: unknown (suite never reported)")
        return 1
    print("\nRESULT: %d passed, %d failed" % (res["passed"], res["failed"]))
    if res.get("crashed"):
        print(res["crashed"])
    return 0 if res["failed"] == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=30.0)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
