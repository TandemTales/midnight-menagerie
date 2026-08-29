"""Party balance: does the enemy Courage curve hold at 2, 3 and 4 players?

    python tests/coop/balance.py [--n 20] [--region foyer] [--tier standard] [--seed 5000]

Plays real fights at every party size with the competent bot driving EVERY seat
independently, each seat ending its own turn. Besides answering the balance
question it is the only end-to-end exercise of simultaneous turns, per-seat
piles, per-seat Companion trackers and enemy seat-marking that exists.

Reading it: if the curve (1p 100% / 2p 220% / 3p 400% / 4p 570%) is right, win%
and Courage left should stay roughly FLAT across party sizes. A rising line means
co-op is too easy; a falling one means the curve is too steep and bringing
friends is a punishment.

Not a pass/fail gate — it reports numbers for a designer to read. Exit code 1
only if the page crashed.
"""
import asyncio, sys, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=20)
ap.add_argument("--region", default="foyer")
ap.add_argument("--tier", default="standard")
ap.add_argument("--seed", type=int, default=5000)
ap.add_argument("--timeout", type=float, default=900)
a = ap.parse_args()

URL = (f"http://localhost:8777/tests/coop/balance.html"
       f"?n={a.n}&region={a.region}&tier={a.tier}&seed={a.seed}")


async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await page.goto(URL, wait_until="load", timeout=45000)
        try:
            await page.wait_for_function("window.__BALANCE__ !== undefined",
                                         timeout=int(a.timeout * 1000))
        except Exception:
            print(f"!! did not finish within {a.timeout:.0f}s")
        text = await page.evaluate("document.body.innerText")
        res = await page.evaluate("window.__BALANCE__ || null")
        await browser.close()

    print(text)
    if errors:
        print("\n--- console errors ---")
        for e in errors[:5]:
            print("  " + e[:160])
    return 1 if (not res or res.get("error")) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
