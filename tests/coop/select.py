"""The co-op entry point, driven as a player drives it.

    python tests/coop/select.py [--party 4]

Picks the party size, then picks a Companion and a Kid and locks them in once
per Kid, and starts the expedition — then asserts the Run that comes out is a
real N-Kid party with N separate decks and N separate Backpacks.

This exists because everything else about co-op is asserted against objects.
The entry point is the one part a player actually operates, and a screen can be
completely broken while every unit test stays green: the two-Kid Safe Room
rendered its new options with sixteen invented CSS tokens and looked like
unstyled text, and the deep-linked combat built a ONE-SEAT engine for a two-Kid
run and looked perfectly fine. Both were only visible by driving the real thing.

It runs at FOUR by default as of 2026-08-28. The screen was hard-wired to
exactly two Kids until then — `state.party.length === 0` was what put it in
"waiting for the other Kid" — which is why `MAX_PARTY` was deliberately held at
2: raising the constant alone would have let a run start that this screen could
not set up. Driving all four here is what proves that is no longer true.

Exit code 1 on any failure or console error.
"""
import asyncio, sys, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ap = argparse.ArgumentParser()
ap.add_argument("--party", type=int, default=4, help="how many Kids to take in")
a = ap.parse_args()

URL = "http://localhost:8777/game/index.html#scene=select"
fails = []

# Kids, in seat order. Companions are DISCOVERED from the screen rather than
# named: only rescued Companions are selectable, so a fresh save offers the
# starters alone and a hard-coded list of four silently times out on the third.
KID_ORDER = ["maya", "eli", "priya", "samir"]


def check(cond, label, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)


async def main():
    want = max(1, min(4, a.party))
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1600, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)

        # The count control is generated from the engine's MAX_PARTY, so its
        # length is itself an assertion that the screen and the engine agree.
        sizes = await page.eval_on_selector_all(
            ".sel-pair__size", "els => els.map(e => Number(e.dataset.n))")
        check(sizes == [1, 2, 3, 4],
              "the screen offers every party size the engine allows", str(sizes))

        await page.click(f'.sel-pair__size[data-n="{want}"]')
        await page.wait_for_timeout(200)
        check(await page.eval_on_selector(f'.sel-pair__size[data-n="{want}"]',
                                          "e => e.classList.contains('is-on')"),
              f"choosing a party of {want} takes")

        async def pick(companion, kid):
            await page.click(f'.companion-tile[data-slug="{companion}"]')
            await page.wait_for_timeout(600)
            await page.click('[data-act="tokid"]')
            await page.wait_for_timeout(900)
            await page.click(f'.kid-tile[data-slug="{kid}"]')
            await page.wait_for_timeout(900)

        # Whatever this save actually offers, in the order the board shows it.
        avail = await page.eval_on_selector_all(
            ".companion-tile:not(.is-locked):not([disabled])",
            "els => els.map(e => e.dataset.slug).filter(Boolean)")
        check(len(avail) >= 1, "the board offers at least one Companion", str(avail))
        roster = [(avail[i % len(avail)], KID_ORDER[i]) for i in range(want)]
        print(f"  ..    party: {', '.join(k + '/' + c for c, k in roster)}")

        for i, (companion, kid) in enumerate(roster):
            last = (i == len(roster) - 1)
            await pick(companion, kid)
            label = await page.eval_on_selector(".btn--go", "e => e.textContent.trim()")
            if last:
                check("Begin" in label,
                      f"after Kid {i + 1} of {want} the button starts the expedition", label)
            else:
                check("Lock in" in label,
                      f"after Kid {i + 1} of {want} the button asks for the next one", label)

            await page.click(".btn--go")
            await page.wait_for_timeout(1200 if not last else 4000)

            if not last:
                started = await page.evaluate("() => !!window.MM?.ctx?.run")
                check(not started, f"and the expedition has NOT started after Kid {i + 1}")
                shown = await page.eval_on_selector(".sel-pair", "e => e.dataset.first")
                check(bool(shown), f"the screen names who is already in after Kid {i + 1}", shown)

        info = await page.evaluate("""() => {
          const r = window.MM?.ctx?.run;
          if (!r) return null;
          const ids = new Set();
          let shareCard = false;
          for (const k of r.kids) for (const c of k.deck) {
            if (ids.has(c)) shareCard = true;
            ids.add(c);
          }
          return {
            scene: window.MM.ctx.scenes.currentName,
            partySize: r.partySize,
            kids: r.kids.map(k => k.kid + '/' + k.companion),
            decks: r.kids.map(k => k.deck.length),
            packs: r.kids.map(k => k.backpack.length),
            shared: !!r.map,
            shareCard,
          };
        }""")
        check(info is not None, "an expedition started")
        if info:
            check(info["scene"] == "map", "it walked to the map", info["scene"])
            check(info["partySize"] == want, f"with {want} Kids", str(info["partySize"]))
            expected = [f"{k}/{c}" for c, k in roster]
            check(info["kids"] == expected,
                  "the Kids are the ones chosen, in seat order", ", ".join(info["kids"]))
            check(all(n == 10 for n in info["decks"]),
                  "each Kid has their own ten-card deck", str(info["decks"]))
            check(not info["shareCard"],
                  "and NO card instance is in two decks at once")
            check(all(n > 0 for n in info["packs"]),
                  "each Kid brought their own Backpack", str(info["packs"]))
            check(info["shared"], "and they all share one route")

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
