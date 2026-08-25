"""Backpack seam test — the Kid's Gear, end to end, against real implementations.

    python tests/backpack/run.py [--wait 120] [--verbose] [--no-ui]

Two phases, one browser, because measuring two Playwright runs at once on this
machine is unreliable (CONTRACTS.md trap 7).

  PHASE A  tests/backpack/index.html — a headless module harness. Starts real
           expeditions through `state/run.js` with real loadouts and asserts
           `run.flags.gear` is populated, `run.carrying` is not empty, a gated
           Curiosity option unlocks with the item and stays shut without it, and
           gear hooks (Flashlight, Camera, Glow Sticks, Thermos, Blanket, First
           Aid Tin) change what a real `CombatEngine` actually does. Nothing is
           mocked — CONTRACTS.md rule 9.

  PHASE B  the real game at /game/index.html. Drives the Clubhouse Backpack
           editor with real clicks, walks to Companion Select, begins an
           expedition, and reads `window.MM.ctx.run.backpack` — proving the
           editor is wired to the run and not to nothing. `--no-ui` skips it.

Prints `RESULT: n checks, m failures`. Exit code 0 only when m == 0.

Owned by the meta-run agent; does not touch tools/.
"""
import asyncio
import sys
import argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HARNESS = "http://localhost:8777/tests/backpack/index.html"
GAME = "http://localhost:8777/game/index.html"


async def phase_a(page, a):
    await page.goto(HARNESS, wait_until="load", timeout=60000)
    try:
        await page.wait_for_function("window.__BACKPACK_RESULT__ !== undefined",
                                     timeout=int(a.wait * 1000))
    except Exception:
        print("!! harness did not finish within %.0fs" % a.wait)
        return None
    res = await page.evaluate("window.__BACKPACK_RESULT__")
    if a.verbose:
        print(await page.evaluate("document.body.innerText"))
    return res


async def phase_b(page, a, checks, fails):
    """Clubhouse editor -> Select -> a live run, with real clicks."""

    def check(cond, msg, detail=""):
        (checks if cond else fails).append(msg)
        print(("  PASS  " if cond else "  FAIL  ") + msg + (" — " + detail if detail else ""))

    await page.goto(GAME + "#scene=clubhouse&panel=backpack", wait_until="load", timeout=60000)
    await page.wait_for_function("window.MM && window.MM.state && window.MM.state().scene === 'clubhouse'",
                                 timeout=30000)
    await page.wait_for_timeout(1200)

    # Whose pack are we editing? Use whatever kid the Clubhouse landed on.
    kid = await page.evaluate("document.querySelector('.packwho__b[aria-checked=\"true\"]')?.dataset.kid || 'maya'")

    # Empty the bag, then pack exactly one known item, entirely through the UI.
    # Each click re-renders the list, so the buttons must be re-queried.
    await page.evaluate("""() => {
      for (let i = 0; i < 12; i++) {
        const b = document.querySelector('.packbag__list [data-remove]');
        if (!b) break;
        b.click();
      }
    }""")
    await page.wait_for_timeout(200)
    added = await page.evaluate("""() => {
      const b = document.querySelector('.packshelf__list [data-add="thermos"]:not([disabled])');
      if (!b) return null;
      b.click();
      return b.dataset.add;
    }""")
    check(added == "thermos", "Clubhouse: the shelf offers Gear by id and it can be packed",
          f"clicked data-add={added!r}")

    stored = await page.evaluate(f"() => (window.MM.Save.data.backpacks || {{}})[{kid!r}]")
    check(stored == ["thermos"], "Clubhouse: Save.data.backpacks[kid] holds item ids",
          repr(stored))

    slots = await page.evaluate("document.querySelector('.packbag__slots')?.textContent || ''")
    check("2 / 5" in slots, "Clubhouse: slot count comes from the real item table", slots.strip())

    # Now start a run as that kid and see whether the edit survived the journey.
    # `goto` with only the hash changed would not reload, so navigate in-page.
    await page.evaluate("window.MM.goto('select', {})")
    await page.wait_for_function("window.MM.state().scene === 'select'", timeout=30000)
    await page.wait_for_timeout(1600)

    shown = await page.evaluate(f"""async () => {{
      const root = document.body;
      // pick a starter Companion, then the kid whose pack we just edited
      root.querySelector('.companion-tile:not(.is-locked)')?.click();
      await new Promise(r => setTimeout(r, 700));
      root.querySelector('[data-act="tokid"]')?.click();
      await new Promise(r => setTimeout(r, 700));
      root.querySelector('.kid-tile[data-slug="{kid}"]')?.click();
      await new Promise(r => setTimeout(r, 700));
      return {{
        slots: document.querySelector('.kid__slots')?.textContent || '',
        items: [...document.querySelectorAll('.packitem__name')].map(n => n.textContent),
      }};
    }}""")
    check(shown["items"] == ["Thermos"],
          "Select: the Kid dossier shows the Clubhouse pack, not a hard-coded one",
          f"{shown['items']} / {shown['slots'].strip()}")
    check("Clubhouse" in shown["slots"],
          "Select: says the pack was edited at the Clubhouse", shown["slots"].strip())

    begun = await page.evaluate("""async () => {
      document.querySelector('.btn--go')?.click();
      await new Promise(r => setTimeout(r, 1600));
      const run = window.MM.ctx.run;
      return run ? { backpack: run.backpack, kid: run.kid,
                     carrying: [...(run.carrying || [])],
                     gear: run.flags.gear } : null;
    }""")
    if not begun:
        check(False, "Select: Begin Expedition produced a run", "no ctx.run")
        return
    check(begun["backpack"] == ["thermos"],
          "the live run started with exactly the pack the editor saved",
          repr(begun["backpack"]))
    check("warm" in begun["carrying"] and "thermos" in begun["carrying"],
          "and run.carrying holds its tags", repr(begun["carrying"]))

    gear_row = await page.evaluate("""() => {
      const el = document.querySelector('.mm-hud__gear');
      if (!el) return null;
      return { hidden: el.hidden,
               chips: [...el.querySelectorAll('.mm-hud__gearchip')].map(c => c.getAttribute('aria-label')) };
    }""")
    if gear_row is None:
        print("  note   no HUD on this screen; Gear row checked in the shot pass instead")
    else:
        check(gear_row["hidden"] is False and gear_row["chips"],
              "the HUD Gear row is visible and lists the Gear", repr(gear_row))


async def main(a):
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
        ctx = await browser.new_context(viewport={"width": 1600, "height": 900})
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append("CONSOLE " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        print("--- phase A: module harness ---")
        res = await phase_a(page, a)

        b_checks, b_fails = [], []
        if not a.no_ui:
            print("--- phase B: Clubhouse -> Select -> live run ---")
            try:
                await phase_b(page, a, b_checks, b_fails)
            except Exception as exc:
                b_fails.append("phase B threw: %s" % exc)
                print("  FAIL  phase B threw: %s" % exc)

        await browser.close()

    if not res:
        print("RESULT: 0 checks, 1 failures (harness never reported)")
        return 1

    for e in res["errors"]:
        print("  FAIL  " + e)

    if errors:
        print("--- console errors ---")
        for e in errors[:30]:
            print(e)

    passed = res["passed"] + len(b_checks)
    failed = res["failed"] + len(b_fails)
    # A console error is a failure: this whole system died silently once already.
    failed += len(errors)
    print("RESULT: %d checks, %d failures" % (passed + failed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=120)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--no-ui", action="store_true", help="skip the real-game phase")
    sys.exit(asyncio.run(main(ap.parse_args())))
