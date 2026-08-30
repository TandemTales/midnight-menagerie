"""A teammate's deck is open information, and you can actually reach it. OWNER: frontend.

    python tests/coop/matedeck.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

`docs/STS2-REFERENCE.md` §8.4: "You can inspect any teammate's full deck and
relics at any time, for the whole run." The §8.12 scorecard carried that as
**"Behind, buildable now"** from the day it was researched — buildable because
it never needed the wire. Our veil exists because a HAND is private; a deck LIST
is not, and `run.deckViewsOf(kid)` has been able to answer for any Kid the whole
time. Nothing called it for anyone but the local seat.

WHAT THIS ASSERTS, and why it is not just "a modal opened":

A modal full of ten cards proves nothing on its own, because YOUR deck is ten
cards too. So this compares the two decks first, confirms they differ, and then
checks the modal contains a card that exists ONLY in the teammate's deck and
NONE that exist only in yours. Marmalade opens with Scratch and Curl Up; Bones
opens with Bite and Sit Pretty. If the panel ever quietly opened the local
deck — which is exactly what a `deckViews()` typo would do — the count and the
title would both still look right and only this check would fail.

It also asserts the panel is CLICKABLE, which is not a formality. The rail was
pure display until 2026-08-30 and sat at `z-index: 6` under `.cb-field`'s 20 —
a full-width invisible box over the whole play area. The first version of this
feature was unreachable by a real pointer while passing every other check;
Playwright named it, `.cb-field intercepts pointer events`.

Exit code 0 only when every assertion passes and the page logs no error.
"""
import asyncio
import sys

URL = ("http://localhost:8777/game/index.html"
       "#scene=combat&kids=2&seed=20260826&companion=marmalade&companion2=bones")

TRUTH = """() => {
  const r = window.MM.ctx.run;
  const nm = (l) => (l || []).map(c => c.def?.name || c.name).sort();
  const keeps = (k) => (k?.keepsakes || []).map(x => x?.name).filter(Boolean);
  return { mate: nm(r.deckViewsOf(r.kidAt(1))), mine: nm(r.deckViews()),
           who: r.kidNameOf?.(r.kidAt(1)) || '',
           mateKeeps: keeps(r.kidAt(1)), myKeeps: keeps(r.kidAt(0)) };
}"""

fails = []
passes = []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""),
          flush=True)


async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            viewport={"width": 1600, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(9000)

        n_panels = await page.evaluate(
            "() => document.querySelectorAll('.cb-mate.is-openable').length")
        check(n_panels == 1, "the teammate's panel offers itself as openable", str(n_panels))

        truth = await page.evaluate(TRUTH)
        check(bool(truth["who"]), "the teammate has a name", truth["who"])
        check(truth["mate"] != truth["mine"],
              "the two Kids really do hold different decks — otherwise nothing "
              "below can tell which one opened",
              f'{truth["mate"][:3]} vs {truth["mine"][:3]}')

        label = await page.evaluate(
            "() => document.querySelector('.cb-mate.is-openable')?.getAttribute('aria-label')")
        check(truth["who"] in (label or ""),
              "and the affordance names them rather than saying 'your friend'", label)

        # A real pointer, not a dispatched event: the bug this feature shipped
        # with was that something else was on top of it.
        await page.click(".cb-mate.is-openable", timeout=8000)
        await page.wait_for_timeout(1500)

        title = await page.evaluate(
            "() => document.querySelector('.mm-modal__title, .mm-modal h2')?.textContent?.trim()")
        check(truth["who"] in (title or ""), "their deck opens, under their name", title)

        shown = await page.evaluate("() => document.querySelectorAll('.mm-deck__grid > *').length")
        check(shown == len(truth["mate"]),
              "with every one of their Tricks in it",
              f'{shown} of {len(truth["mate"])}')

        grid = await page.evaluate("() => document.querySelector('.mm-deck__grid')?.innerText || ''")
        mate_only = [c for c in truth["mate"] if c not in truth["mine"]]
        mine_only = [c for c in truth["mine"] if c not in truth["mate"]]
        check(bool(mate_only) and all(c in grid for c in set(mate_only)),
              "and it is THEIR deck — every Trick only they own is on screen",
              ", ".join(sorted(set(mate_only))[:4]))
        check(not any(c in grid for c in set(mine_only)),
              "and not one Trick that only YOU own",
              ", ".join(sorted(set(mine_only))[:4]))

        # §8.4 is "deck and relics", and half of it would be a green scorecard
        # row for a feature nobody finished. Keepsakes ride the subtitle.
        sub = await page.evaluate(
            "() => document.querySelector('.mm-modal__subtitle, .mm-modal__sub')"
            "?.textContent?.trim() || ''")
        want = truth["mateKeeps"]
        check(bool(sub), "the panel says something about their Keepsakes too", sub)
        if want:
            check(all(k in sub for k in want),
                  "and it names every Keepsake they are carrying",
                  f'{want} -> {sub!r}')
        else:
            check("No Keepsakes" in sub,
                  "and says so plainly when they are carrying none", sub)

        # How strong the check above is depends on the two Kids differing. Say
        # which it was rather than letting a weak pass look like a strong one.
        mine_only_k = [k for k in truth["myKeeps"] if k not in truth["mateKeeps"]]
        if mine_only_k:
            check(not any(k in sub for k in mine_only_k),
                  "and not one Keepsake that is only YOURS",
                  f'{mine_only_k} -> {sub!r}')
        else:
            print(f"  note  both Kids carry the same Keepsakes ({truth['myKeeps']}), "
                  f"so this run cannot distinguish theirs from yours — the deck "
                  f"checks above are what carry the identity here", flush=True)

        await browser.close()

    if errors:
        print("\n--- CONSOLE ---", flush=True)
        for e in errors[:10]:
            print(" ", e, flush=True)

    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed, "
          f"{len(errors)} console errors", flush=True)
    return 1 if (fails or errors) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
