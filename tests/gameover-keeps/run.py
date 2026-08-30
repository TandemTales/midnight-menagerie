"""The Keepsake shelf on Expedition Over tells the truth.  OWNER: frontend.

    python tests/gameover-keeps/run.py [--wait 25] [--verbose]

WHY THIS EXISTS.  `scenes/gameover.js` carried a seven-entry FALLBACK_KEEPSAKES
table whose own comment said it was "used only when data/relics.js has not
shipped yet".  relics.js shipped a long time ago.  Two things went wrong and
neither had a test:

  1. `_summarise` collapsed an EMPTY Keepsake list to null - the same value it
     used for "there is no run at all" - so `_hydrateKeepsakes` could not tell
     the two apart and sampled the fallback table for both.  A player who
     reached the Butler carrying nothing was shown three to six Keepsakes they
     had never held, on the one screen whose entire job is to be the true
     account of the run.
  2. Five of the seven ids in that table (half-a-torch, collar-tag,
     bent-house-key, mothbitten-ribbon, jar-of-nothing) do not exist in the
     game, and the two that do were printed with invented rules text: Chewed
     Tennis Ball was described as giving a Nerve when it adds 8 damage to your
     first Attack, and Spare Batteries as recharging Gear when they draw a card.

So this suite asks the screen two different questions, and the CONTROL for each
is the other one: a run that kept things must print exactly those things, and a
run that kept nothing must print nothing and say so.  Every name and rule the
mock prints is compared character-for-character against `data/relics.js`, which
is the check that catches an invented Keepsake however plausible it reads.

Prints `RESULT: n passed, m failed`.  Exit 0 only when m == 0.
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

# What is actually on the shelf, plus the ledger's two derived readouts.
SHELF = r"""
() => {
  const host = document.querySelector('.go-keeps');
  const chips = [...document.querySelectorAll('.go-keep')].map(e => ({
    name: e.querySelector('b') ? e.querySelector('b').textContent : '',
    desc: e.querySelector('em') ? e.querySelector('em').textContent : '',
    rarity: e.dataset.rarity,
  }));
  const none = document.querySelector('.go-keeps__none');
  const total = document.querySelector('[data-keep-total]');
  const count = document.querySelector('[data-relic-count]');
  const noun  = document.querySelector('[data-relic-noun]');
  return {
    chips,
    none: none ? none.textContent.trim() : null,
    noneVisible: none ? none.getBoundingClientRect().height > 0 : false,
    role: host ? host.getAttribute('role') : null,
    total: total ? total.textContent : null,
    count: count ? count.textContent : null,
    noun: noun ? noun.textContent : null,
  };
}
"""

# The authored table, read from the same module URL the scene imports.
TABLE = r"""
async () => {
  const m = await import('/game/src/data/relics.js');
  return {
    byName: Object.fromEntries(m.RELICS.map(r => [r.name, { id: r.id, desc: r.desc, rarity: r.rarity }])),
    ids: m.RELICS.map(r => r.id),
  };
}
"""

# A REAL Run, built the way tests/run/index.html builds one, then dropped into
# ctx and the scene re-entered.  `keepsakes` is spliced rather than stubbed so
# the object under the scene is the real class with its real `relics` getter.
REAL_RUN = r"""
async ([keepIds, result]) => {
  const { Run } = await import('/game/src/state/run.js');
  const { makeRelic } = await import('/game/src/data/relics.js');
  const ctx = window.MM.ctx;
  const run = new Run({ companion: 'bones', kid: 'mateo', seed: 4242 });
  run.keepsakes.length = 0;
  for (const id of keepIds) {
    const inst = makeRelic(id);
    if (inst) run.keepsakes.push(inst);
  }
  ctx.run = run;
  await ctx.scenes.go('gameover', { result });
  return {
    kept: run.relics.map(r => ({ name: r.name, desc: r.desc })),
    isArray: Array.isArray(run.relics),
  };
}
"""


async def ready(page, wait=20000):
    await page.wait_for_function(
        f"!!({SCENE}) && {SCENE}.summary"
        " && !!document.querySelector('.go-keeps')", timeout=wait)
    # `_hydrateKeepsakes` is awaited behind two dynamic imports; wait for the
    # shelf to have committed either chips or its empty sentence.
    await page.wait_for_function(
        "() => { const h = document.querySelector('.go-keeps');"
        "        return h && h.childElementCount > 0; }", timeout=wait)


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

        # ══ 1. the standalone deep link — no run, so the shelf is a mock ════
        await page.goto(BASE + "#scene=gameover&result=defeat&seed=1234&companion=bones",
                        wait_until="load", timeout=60000)
        await ready(page, int(a.wait * 1000))
        await page.wait_for_timeout(300)

        table = await page.evaluate(TABLE)
        mock = await page.evaluate(SHELF)

        check(len(mock["chips"]) > 0, "deep link: the shelf is filled",
              f"{len(mock['chips'])} Keepsake(s)")

        unknown = [c["name"] for c in mock["chips"] if c["name"] not in table["byName"]]
        check(not unknown,
              "every Keepsake on the mocked shelf exists in data/relics.js",
              ", ".join(unknown) or f"{len(mock['chips'])} checked against "
                                    f"{len(table['ids'])} authored")

        wrong = [f"{c['name']}: {c['desc'][:40]!r} != "
                 f"{table['byName'][c['name']]['desc'][:40]!r}"
                 for c in mock["chips"]
                 if c["name"] in table["byName"]
                 and c["desc"] != table["byName"][c["name"]]["desc"]]
        check(not wrong,
              "every rule printed on the mocked shelf is the authored rule",
              "; ".join(wrong) or "all descriptions match relics.js exactly")

        rarities = [table["byName"][c["name"]]["rarity"]
                    for c in mock["chips"] if c["name"] in table["byName"]]
        check("starter" in rarities,
              "the mocked shelf includes a starter, as a real expedition would",
              f"rarities {rarities}")

        check(mock["none"] is None, "a filled shelf shows no empty-state line")
        check(mock["count"] == str(len(mock["chips"])),
              "the ledger's Keepsake count matches the shelf",
              f"ledger {mock['count']!r} vs {len(mock['chips'])} chips")

        # ══ 2. a real run that KEPT things — the control for §3 ═════════════
        kept_ids = ["chewed-tennis-ball", "spare-batteries"]
        real = await page.evaluate(REAL_RUN, [kept_ids, "defeat"])
        await ready(page)
        await page.wait_for_timeout(300)
        held = await page.evaluate(SHELF)

        want = [k["name"] for k in real["kept"]]
        got = [c["name"] for c in held["chips"]]
        check(got == want,
              "CONTROL: a run that kept things prints exactly those things",
              f"shelf {got} vs run.relics {want}")
        check(held["none"] is None,
              "CONTROL: a run with Keepsakes shows no empty-state line")
        check(held["count"] == str(len(want)),
              "CONTROL: the ledger counts what the run kept", f"{held['count']!r}")

        # ══ 3. a real run that kept NOTHING ════════════════════════════════
        empty = await page.evaluate(REAL_RUN, [[], "defeat"])
        await ready(page)
        await page.wait_for_timeout(300)
        bare = await page.evaluate(SHELF)

        check(empty["isArray"] and not empty["kept"],
              "the run really is holding zero Keepsakes", f"{empty['kept']}")
        check(not bare["chips"],
              "a run that kept nothing invents nothing",
              f"shelf printed {[c['name'] for c in bare['chips']]}")
        check(bool(bare["none"]) and bare["noneVisible"],
              "the empty shelf says so, in a visible sentence", repr(bare["none"]))
        check(bare["count"] == "0",
              "the ledger prints 0 Keepsakes left on the floor", f"{bare['count']!r}")
        check(bare["total"] == "none kept",
              "the section heading says none kept", f"{bare['total']!r}")
        check(bare["role"] is None,
              "the empty shelf is not announced as a list with no items",
              f"role={bare['role']!r}")

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
    ap.add_argument("--h", type=int, default=1000)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
