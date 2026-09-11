"""The card face: upgrade green, and a conditional keyword that is armed NOW.

    python tests/card-face/run.py [--wait 25] [--verbose]

Needs the dev server on :8777 (python tools/devserver.py 8777).

Two playtest findings, both about a card not telling the player something it
was already in a position to tell them:

  1. "For the upgrading, some numbers show as green even when they aren't
     changing from the base."  `.mm-card.is-upgraded .mm-card__num` was a
     BLANKET rule, so Fluff Up+ printed its unchanged 1 in the same green as
     the 6 that became a 9. Green now means this number moved.

  2. "Cards with zoomies should stand out somehow when the zoomie is active."
     [Zoomies] is "the third or later Trick you have played this turn" — the
     card in hand is a different card depending on a count the player was being
     asked to hold in their head, and the face looked identical either way.

Part 1 is a unit proof against the real CardView. Part 2 is a SEAM proof
(CONTRACTS rule 9) against the real game at #scene=combat: the real scene, the
real engine, the real hand, driven through `hand.playCard`. The defect class
here is a predicate that is correct in one module and never reaches the DOM,
which is exactly what a module-level harness cannot see.

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
FAN = ".mm-hand .mm-card:not(.mm-hand__probe)"

passes, fails = [], []


def check(ok, what, detail=""):
    (passes if ok else fails).append(what + (" - " + detail if detail else ""))


# -- Part 1 ----------------------------------------------------------------
# Build the upgraded face of four real Tricks and read which numbers carry
# `is-changed`. Each case is chosen so the answer is not "all" or "none":
# Fluff Up and Watchful Eyes each move ONE of their two numbers, Slip Away
# moves both, and Ghoststep+ moves only its cost and so must green nothing.
UPGRADE_PROBE = """
async () => {
  const [{ CardView }, CARDS] = await Promise.all([
    import('/game/src/ui/card.js'),
    import('/game/src/data/cards.js'),
  ]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(host);
  const out = {};
  const ids = ['marmalade/fluff-up', 'marmalade/watchful-eyes',
               'marmalade/slip-away', 'marmalade/ghoststep'];
  for (const id of ids) {
    const def = CARDS.cardById(id);
    const v = new CardView(def, { uid: 'probe-' + id, upgraded: true });
    host.appendChild(v.el);
    const green = [], plain = [];
    const nums = [...v.el.querySelectorAll('.mm-card__num')];
    for (const b of nums) {
      (b.classList.contains('is-changed') ? green : plain).push(b.dataset.key);
    }
    // The colour a player actually sees, not just the class we hope drives it.
    const lit = nums.filter(b => b.classList.contains('is-changed'))
                    .map(b => getComputedStyle(b).color);
    const dark = nums.filter(b => !b.classList.contains('is-changed'))
                     .map(b => getComputedStyle(b).color);
    out[id] = { green: green.sort(), plain: plain.sort(), lit: lit, dark: dark };
  }
  host.remove();
  return out;
}
"""

# -- Part 2 ----------------------------------------------------------------
# Put a real [Zoomies] Trick in the real hand and hold it there while two other
# Tricks are played, so the chip is observed lighting up on a card that never
# left the fan.
SEAT_ZOOM = """
() => {
  const sc = window.MM.ctx.scenes.current;
  const st = sc.engine.seatStats(sc.me);
  const el = document.querySelector('.mm-card__kw[data-kw="zoomies"]');
  return {
    played: st ? st.cardsPlayedThisTurn : null,
    anyChip: !!el,
    live: !!(el && el.classList.contains('is-live')),
    rim: !!document.querySelector('.mm-card.is-kw-live'),
  };
}
"""

ADD_ZOOM = """
async () => {
  const sc = window.MM.ctx.scenes.current;
  const CARDS = await import('/game/src/data/cards.js');
  const def = CARDS.cardById('marmalade/quick-pounce');
  sc.engine.addCard(def, 'hand', { to: sc.me });
  return !!def;
}
"""

# Play any held Trick that is NOT the zoomies card under observation, so the
# observed card stays in the fan across the whole count.
PLAY_OTHER = """
() => {
  const sc = window.MM.ctx.scenes.current;
  const held = sc.engine.state.piles.hand;
  const c = held.find(x => x.id !== 'marmalade/quick-pounce'
                        && sc.engine.canPlay(x.uid, sc._defaultTargetFor(x.uid)).ok);
  if (!c) return null;
  sc.hand.playCard(c.uid);
  return c.id;
}
"""


async def main():
    from playwright.async_api import async_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=25)
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1500, "height": 900})
        logs, errors = [], []
        page.on("console", lambda m: (logs.append("[" + m.type + "] " + m.text),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE + "#scene=combat&seed=7&companion=marmalade",
                        wait_until="load", timeout=60000)
        await page.wait_for_function(
            "!!(" + SCENE + ") && " + SCENE + ".engine"
            " && document.querySelectorAll('" + FAN + "').length > 0",
            timeout=int(a.wait * 1000))
        await page.wait_for_function(SCENE + " && " + SCENE + "._opening === false",
                                     timeout=20000)
        await page.wait_for_function(
            SCENE + " && !" + SCENE + "._draining && " + SCENE + "._q.length === 0",
            timeout=20000)
        await page.wait_for_function(
            SCENE + " && " + SCENE + ".hand && !" + SCENE + ".hand.warming",
            timeout=20000)
        await page.wait_for_timeout(500)

        # -- 1. upgrade green marks only what moved ------------------------
        up = await page.evaluate(UPGRADE_PROBE)
        cases = [
            ("marmalade/fluff-up", ["b"], ["n"]),
            ("marmalade/watchful-eyes", ["n"], ["m0"]),
            ("marmalade/slip-away", ["b", "m0"], []),
            ("marmalade/ghoststep", [], ["n"]),
        ]
        for cid, want_green, want_plain in cases:
            got = up.get(cid) or {}
            check(got.get("green") == want_green and got.get("plain") == want_plain,
                  cid.split("/")[1] + "+ greens only the numbers the Sharpen moved",
                  "green=%s plain=%s" % (got.get("green"), got.get("plain")))
        # An unchanged number must not merely lack the class - it must not be
        # the same colour on screen as one that moved.
        fu = up.get("marmalade/fluff-up") or {}
        check(bool(fu.get("lit")) and bool(fu.get("dark"))
              and fu["lit"][0] != fu["dark"][0],
              "and the two really are different colours on screen",
              "changed %s vs unchanged %s" % (fu.get("lit"), fu.get("dark")))
        gs = up.get("marmalade/ghoststep") or {}
        check(gs.get("lit") == [],
              "a Sharpen that only buys a cost cut greens NOTHING",
              str(gs.get("green")))

        # -- 2. the zoomies chip, on the real hand -------------------------
        await page.evaluate(ADD_ZOOM)
        await page.wait_for_timeout(700)
        before = await page.evaluate(SEAT_ZOOM)
        check(before["anyChip"], "a [Zoomies] Trick is on screen to be judged",
              "played=%s" % before["played"])
        check(not before["live"] and not before["rim"],
              "CONTROL: and it is DARK on the first Trick of the turn",
              "played=%s live=%s rim=%s" % (before["played"], before["live"], before["rim"]))

        played = []
        for i in range(2):
            pid = await page.evaluate(PLAY_OTHER)
            played.append(pid)
            # Wait for the play to RESOLVE, not for a fixed 900 ms. On a loaded
            # machine the second play was still on the scene's queue when the
            # count was read: the 2026-09-10 census reported
            # cardsPlayedThisTurn=1 beside "two other Tricks were actually
            # played", and the same gate run alone passed 14 of 14 twice. A
            # timeout is not a pass - the checks below read what really happened.
            try:
                await page.wait_for_function(
                    SCENE + " && " + SCENE + ".engine.seatStats(" + SCENE + ".me)"
                    ".cardsPlayedThisTurn >= " + str(i + 1)
                    + " && !" + SCENE + "._draining && " + SCENE + "._q.length === 0",
                    timeout=15000)
            except Exception:
                pass
        try:
            await page.wait_for_function(
                "!!document.querySelector('.mm-card.is-kw-live')", timeout=3000)
        except Exception:
            pass
        check(all(played), "two other Tricks were actually played", str(played))

        after = await page.evaluate(SEAT_ZOOM)
        check(after["played"] >= 2, "the seat's count reached the Zoomies threshold",
              "cardsPlayedThisTurn=%s" % after["played"])
        check(after["live"], "and the chip on the card still in hand lit up",
              "live=%s" % after["live"])
        check(after["rim"], "and the card itself carries the rim",
              "rim=%s" % after["rim"])
        check(before["live"] != after["live"],
              "so the highlight tracks the condition, not the keyword",
              "%s -> %s" % (before["live"], after["live"]))

        if errors:
            check(False, "console stayed clean", "; ".join(errors[:3]))
        else:
            check(True, "console stayed clean")

        if a.verbose:
            for line in logs:
                print(" ", line)
        await browser.close()

    for line in passes:
        print("  PASS  " + line, flush=True)
    for line in fails:
        print("  FAIL  " + line, flush=True)
    print("\nRESULT: %d passed, %d failed" % (len(passes), len(fails)), flush=True)
    return 1 if fails else 0


sys.exit(asyncio.run(main()))
