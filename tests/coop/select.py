"""The co-op entry point, driven as a player drives it.

    python tests/coop/select.py

Clicks "Go in together", picks a Companion and a Kid, locks them in, picks a
second pair, and starts the expedition — then asserts the Run that comes out is
a real two-Kid party with two separate decks and two separate Backpacks.

This exists because everything else about co-op is asserted against objects.
The entry point is the one part a player actually operates, and a screen can be
completely broken while every unit test stays green: the two-Kid Safe Room
rendered its new options with sixteen invented CSS tokens and looked like
unstyled text, and the deep-linked combat built a ONE-SEAT engine for a two-Kid
run and looked perfectly fine. Both were only visible by driving the real thing.

Exit code 1 on any failure or console error.
"""
import asyncio, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/game/index.html#scene=select"
fails = []


def check(cond, label, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)


async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1600, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)

        await page.click(".sel-pair")
        await page.wait_for_timeout(200)
        check(await page.eval_on_selector(".sel-pair__box", "e => e.checked"),
              "the Go in together toggle turns on")

        async def pick(companion, kid):
            await page.click(f'.companion-tile[data-slug="{companion}"]')
            await page.wait_for_timeout(600)
            await page.click('[data-act="tokid"]')
            await page.wait_for_timeout(900)
            await page.click(f'.kid-tile[data-slug="{kid}"]')
            await page.wait_for_timeout(900)

        await pick("marmalade", "maya")
        label1 = await page.eval_on_selector(".btn--go", "e => e.textContent.trim()")
        check("Lock in" in label1, "the button asks for the SECOND Kid, not the expedition", label1)

        await page.click(".btn--go")
        await page.wait_for_timeout(1200)
        first = await page.eval_on_selector(".sel-pair", "e => e.dataset.first")
        check(bool(first and "Maya" in first), "the first Kid is locked in and named", first)
        started = await page.evaluate("() => !!window.MM?.ctx?.run")
        check(not started, "and the expedition has NOT started yet")

        await pick("bones", "eli")
        label2 = await page.eval_on_selector(".btn--go", "e => e.textContent.trim()")
        check("Begin" in label2, "now the button starts the expedition", label2)

        await page.click(".btn--go")
        await page.wait_for_timeout(4000)

        info = await page.evaluate("""() => {
          const r = window.MM?.ctx?.run;
          if (!r) return null;
          return {
            scene: window.MM.ctx.scenes.currentName,
            partySize: r.partySize,
            kids: r.kids.map(k => k.kid + '/' + k.companion),
            decks: r.kids.map(k => k.deck.length),
            packs: r.kids.map(k => k.backpack.length),
            shared: !!r.map,
            sameDeck: r.kids[0] && r.kids[1]
              ? r.kids[0].deck.some(c => r.kids[1].deck.includes(c)) : false,
          };
        }""")
        check(info is not None, "an expedition started")
        if info:
            check(info["scene"] == "map", "it walked to the map", info["scene"])
            check(info["partySize"] == 2, "with two Kids", str(info["partySize"]))
            check(info["kids"] == ["maya/marmalade", "eli/bones"],
                  "the two Kids are the ones chosen", ", ".join(info["kids"]))
            check(all(n == 10 for n in info["decks"]),
                  "each Kid has their own ten-card deck", str(info["decks"]))
            check(not info["sameDeck"], "and the two decks share no card instance")
            check(all(n > 0 for n in info["packs"]),
                  "each Kid brought their own Backpack", str(info["packs"]))
            check(info["shared"], "and they share one route")

        await browser.close()

    if errors:
        print("\n--- console errors ---")
        for e in errors[:6]:
            print("  " + e[:160])

    bad = len(fails) + len(errors)
    print(f"\nRESULT: {len(fails)} failures, {len(errors)} console errors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
