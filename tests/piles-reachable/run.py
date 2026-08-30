"""Every pile the engine keeps for you can be opened from the Scuffle screen.

    python tests/piles-reachable/run.py [--wait 25] [--verbose]

WHY THIS EXISTS
---------------
`ui/deckview.js` opens with "One component serves every 'show me the cards'
moment: your deck, the draw pile, the discard pile, the Vanished pile, and
card-reward inspection", and carries a MODES entry for each. The 2026-08-30
sweep found that the Vanished one was never requested by anything: the three
`openPile` call sites in the game pass `deck`, `deck` and `draw|discard|torn`,
and the combat screen had no Vanished button or hotkey. The panel existed, the
title existed, the sentence explaining what a Vanished card is existed, and a
player had no way to reach any of it. Cards left the game and the only place
that could account for them was unreachable.

So this suite does not check that the button exists. It checks the CLASS: it
asks the engine which piles it keeps for the local seat and requires each one to
be openable from the screen, or to appear in the exemption list below with a
reason. A new pile added to the engine turns this red until somebody decides
which of the two it is.

Then it opens each one and reads the cards back, because a panel that opens is
not the same as a panel that shows your Vanished pile.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:8777/game/index.html"
SCENE = "(window.MM && window.MM.ctx.scenes.current)"
FAN = ".mm-hand__cards .mm-card"

# Piles the engine keeps that are deliberately NOT openable, each with the
# reason it is not. Anything else the engine grows must get a control.
EXEMPT = {
    "hand": "on screen as the fan itself — a viewer for it would show you what "
            "you are already looking at",
    "limbo": "an internal staging pile a card passes through mid-resolution; it "
             "is empty by the time the player could look",
}

# Which button opens which pile.
CONTROLS = {
    "draw": "#draw-pile",
    "discard": "#discard-pile",
    "exhaust": "#vanished-pile",
    "stash": "#torn-pile",
}

# Move two known cards into a pile so there is something to find, and report
# what went where. Goes through `piles.move`, the same seam the engine uses.
STOCK = r"""
(pile) => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  const src = [...sc.mePiles.draw, ...sc.mePiles.discard, ...sc.mePiles.hand];
  const take = src.slice(0, 2);
  for (const c of take) sc.mePiles.move(c, pile, { reason: 'pilestest' });
  return { names: take.map(c => c.name), uids: take.map(c => c.uid) };
}
"""

PILES = r"""
() => {
  const sc = window.MM.ctx.scenes.current;
  const st = sc.engine.state;
  const mine = (st.players && st.players[sc.seatIndex] && st.players[sc.seatIndex].piles) || st.piles;
  const out = {};
  for (const k of Object.keys(mine)) out[k] = mine[k].length;
  return out;
}
"""

PANEL = r"""
() => {
  const deck = document.querySelector('.mm-deck');
  if (!deck) return null;
  return {
    mode: deck.dataset.mode,
    title: (document.querySelector('.mm-modal__title') || {}).textContent || '',
    note: (deck.querySelector('.mm-deck__note') || {}).textContent || '',
    names: [...deck.querySelectorAll('.mm-deck__cell')]
      .map(c => (c.getAttribute('aria-label') || '').split(',')[0]),
    uids: [...deck.querySelectorAll('.mm-deck__cell')].map(c => c.dataset.uid),
  };
}
"""


async def close_panel(page):
    await page.keyboard.press("Escape")
    await page.wait_for_function("() => !document.querySelector('.mm-deck')", timeout=8000)


async def main(a):
    from playwright.async_api import async_playwright
    passed, failed, notes = 0, 0, []
    errors = []

    def check(cond, label, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            notes.append(("PASS", label, detail))
        else:
            failed += 1
            notes.append(("FAIL", label, detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            viewport={"width": a.w, "height": a.h}, reduced_motion="reduce",
        )).new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE + "#scene=combat&seed=7&companion=bones",
                        wait_until="load", timeout=60000)
        await page.wait_for_function(
            f"!!({SCENE}) && {SCENE}.engine"
            f" && document.querySelectorAll('{FAN}').length > 0", timeout=int(a.wait * 1000))
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=20000)
        await page.wait_for_function(
            f"{SCENE} && !{SCENE}._draining && {SCENE}._q.length === 0", timeout=20000)
        await page.wait_for_function(f"{SCENE} && {SCENE}.hand && !{SCENE}.hand.warming",
                                     timeout=20000)
        await page.wait_for_timeout(400)

        # ── the gate: every pile is accounted for ──────────────────────────
        piles = await page.evaluate(PILES)
        unaccounted = [k for k in piles if k not in CONTROLS and k not in EXEMPT]
        check(not unaccounted,
              "every pile the engine keeps has a control or a written reason",
              f"unaccounted: {unaccounted}" if unaccounted
              else f"{sorted(piles)} — {len(CONTROLS)} openable, {len(EXEMPT)} exempt")
        missing = [k for k in CONTROLS if k not in piles]
        check(not missing,
              "every control names a pile the engine actually keeps",
              f"stale: {missing}" if missing else "no stale controls")

        # ── CONTROL: an empty Vanished pile shows no button at all ─────────
        # `?.` throughout: on a build where a control does not exist at all the
        # suite has to report that, not throw a Playwright stack trace at the
        # reader. A crash says less than a named absence.
        empty = await page.evaluate(
            "() => ({ n: window.MM.ctx.scenes.current.mePiles.exhaust.length,"
            "         hidden: document.querySelector('#vanished-pile')?.hidden ?? null })")
        check(empty["n"] == 0 and empty["hidden"] is True,
              "CONTROL: nothing Vanished yet, so there is no Vanished button",
              f"{empty['n']} card(s), hidden={empty['hidden']}"
              + (" — no #vanished-pile in the DOM at all" if empty["hidden"] is None else ""))

        # ── open each pile and read the cards back ─────────────────────────
        for pile, sel in CONTROLS.items():
            stocked = await page.evaluate(STOCK, pile)
            await page.wait_for_timeout(350)
            shown = await page.evaluate(
                f"() => ({{ hidden: document.querySelector('{sel}')?.hidden ?? null,"
                f"          n: document.querySelector('{sel}')?.querySelector('b')?.textContent ?? null }})")
            check(shown["hidden"] is False,
                  f"{pile}: the control is visible once the pile has cards",
                  f"{sel} does not exist" if shown["hidden"] is None
                  else f"{sel} hidden={shown['hidden']} count={shown['n']}")
            if shown["hidden"] is not False:
                continue

            await page.click(sel, timeout=8000)
            try:
                await page.wait_for_selector(".mm-deck .mm-deck__cell", timeout=10000)
            except Exception:                                   # noqa: BLE001
                check(False, f"{pile}: clicking the control opens a pile viewer",
                      "no panel appeared")
                continue
            await page.wait_for_timeout(250)
            panel = await page.evaluate(PANEL)
            check(panel is not None, f"{pile}: clicking the control opens a pile viewer")
            if panel:
                for uid in stocked["uids"]:
                    check(uid in panel["uids"],
                          f"{pile}: the card moved there is in the panel",
                          f"{stocked['names']} vs {panel['names'][:6]}")
                    break        # one is enough; the miss is what matters
                check(bool(panel["title"]), f"{pile}: the panel is titled",
                      f"mode={panel['mode']!r} title={panel['title']!r}")
            await close_panel(page)
            await page.wait_for_timeout(200)

        # ── and the Vanished panel is the VANISHED panel, not a deck list ──
        await page.evaluate(STOCK, "exhaust")
        await page.wait_for_timeout(300)
        try:
            await page.click("#vanished-pile", timeout=8000)
            await page.wait_for_selector(".mm-deck", timeout=10000)
            await page.wait_for_timeout(250)
            v = await page.evaluate(PANEL)
        except Exception:                                       # noqa: BLE001
            v = None
        check(v and v["mode"] == "exhaust",
              "the Vanished button asks DeckView for its exhaust mode",
              f"mode={v and v['mode']!r}")
        check(v and v["title"] == "Vanished",
              "and the panel is titled Vanished", f"title={v and v['title']!r}")
        check(v and "Scuffle" in (v["note"] or ""),
              "and carries the note that explains what Vanished means",
              repr((v or {}).get("note", ""))[:90])
        await close_panel(page)

        # ── the hotkey reaches it too ──────────────────────────────────────
        await page.keyboard.press("t")
        try:
            await page.wait_for_selector(".mm-deck", timeout=6000)
            k = await page.evaluate(PANEL)
        except Exception:                                       # noqa: BLE001
            k = None
        check(k and k["mode"] == "exhaust", "T opens it from the keyboard",
              f"mode={k and k['mode']!r}")
        if k:
            await close_panel(page)

        check(not errors, "zero console errors", "; ".join(errors[:4]))
        await browser.close()

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=25)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
