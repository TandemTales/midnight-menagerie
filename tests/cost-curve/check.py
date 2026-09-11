"""The Nerve cost curve: what it is, and what it is supposed to be.

    python tests/cost-curve/check.py            # assert what already holds
    python tests/cost-curve/check.py --strict   # assert the whole TARGET too

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
    A playtester: "Probably too many tricks cost 1."  Measured across all 1442
    playable Tricks they were right, and the shape of it was worse than the
    sentence:

        cost 0    140    9.7%
        cost 1    843   58.5%
        cost 2    377   26.1%
        cost 3     81    5.6%
        cost X      1    0.1%
        cost 4+     0    0.0%

    and in the bands the first hours of a run actually deal you:

        basic     93.2% cost 1        common   79.9% cost 1

    ELEVEN OF THE SIXTEEN starting decks contained no cost decision at all -
    every card in them cost exactly 1 - and not one of the sixteen contained a
    card costing more than 1. Slay the Spire puts the first cost decision in
    the opening hand of every character (Bash at 2, Eruption at 2, Vigilance at
    2); this game had none, for anybody, ever.

    With 3 Nerve and a 5-card draw, "every card costs 1" means every turn is
    "play three of your five" and the Nerve pip is not a resource, it is a
    counter. That is the complaint.

WHAT IS ASSERTED BY DEFAULT
    The rules that hold today and must not regress:
      1. every starting deck offers a cost decision - at least two distinct
         costs, and at least one card above the deck's cheapest;
      2. every cost is a legal one (0..6, or X);
      3. no companion's whole pool is a single cost.

WHAT --strict ADDS
    The TARGET below, which is the definition of done for the rework. It does
    NOT hold yet and it is not supposed to yet: the owner's call is that the
    range has to reach 4, X, and 5-6 where a card earns it, and that is a
    design pass over ~1400 cards, not a script. Run --strict to see exactly how
    far each band still is. Do not wire --strict into the green sweep until it
    is green.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import asyncio
import sys
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/game/index.html"

# Legal costs. -1 is X, -2 is unplayable (a Curse). Anything else is a typo.
LEGAL = {0, 1, 2, 3, 4, 5, 6, -1}

# The TARGET, as a share of each rarity band. Sourced from Slay the Spire's own
# spread and from docs/CARD-AUDIT.md's yardstick ("a 1-Pluck common Attack
# lands 6-9 ... a 2-Pluck uncommon Attack lands 14-18 ... Powers cost 1-3").
# `max1` is the most a band may put on cost 1; `minHigh` is the least it must
# put at cost 2 or above.
TARGET = {
    "basic":    {"max1": 0.80, "minHigh": 0.10},
    "common":   {"max1": 0.62, "minHigh": 0.20},
    "uncommon": {"max1": 0.50, "minHigh": 0.38},
    "rare":     {"max1": 0.28, "minHigh": 0.60},
}
# And the pool as a whole has to actually REACH the top of the range.
TARGET_MIN_AT_4_PLUS = 12      # cards costing 4 or more
TARGET_MIN_X = 8               # X-cost cards

DUMP = """
async () => {
  const C = await import('/game/src/data/cards.js');
  const all = C.ALL_CARDS || C.CARDS || (C.allCards ? C.allCards() : []);
  const cards = [];
  for (const c of all) {
    if (['status', 'curse'].includes(c.type)) continue;
    if (['curse', 'special'].includes(c.rarity)) continue;
    cards.push({ id: c.id, cost: c.cost, type: c.type, rarity: c.rarity,
                 companion: c.companion || 'neutral' });
  }
  const decks = {};
  for (const def of C.companions()) {
    decks[def.slug] = ((def.startingDeck || [])
      .map(id => C.cardById(id))
      .filter(Boolean)
      .map(d => ({ id: d.id, cost: d.cost })));
  }
  return { cards, decks };
}
"""

passes, fails = [], []


def check(ok, what, detail=""):
    (passes if ok else fails).append(what + (" - " + detail if detail else ""))


def label(c):
    return "X" if c == -1 else str(c)


def report(cards):
    tot = len(cards)
    by = defaultdict(int)
    for c in cards:
        by[c["cost"]] += 1
    print("  %d playable Tricks (no curses, statuses or specials)" % tot)
    for k in sorted(by, key=lambda v: (v < 0, v)):
        share = 100.0 * by[k] / tot
        print("     cost %2s: %4d  %5.1f%%  %s" % (label(k), by[k], share, "#" * int(share / 1.5)))

    print("\n  per rarity:")
    rar = defaultdict(lambda: defaultdict(int))
    for c in cards:
        rar[c["rarity"]][c["cost"]] += 1
    for r in ["basic", "common", "uncommon", "rare"]:
        d = rar[r]
        s = sum(d.values()) or 1
        row = "  ".join("%s:%d (%.0f%%)" % (label(k), v, 100.0 * v / s)
                        for k, v in sorted(d.items(), key=lambda kv: (kv[0] < 0, kv[0])))
        want = TARGET.get(r, {})
        one = 100.0 * d.get(1, 0) / s
        high = 100.0 * sum(v for k, v in d.items() if k >= 2 or k == -1) / s
        flag = ""
        if want:
            flag = "   [target: <=%.0f%% at 1 (now %.0f), >=%.0f%% at 2+ (now %.0f)]" % (
                want["max1"] * 100, one, want["minHigh"] * 100, high)
        print("     %-9s n=%4d   %s%s" % (r, s, row, flag))
    return rar


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true",
                    help="also assert the TARGET curve (fails today, by design)")
    a = ap.parse_args()

    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_function("window.MM", timeout=30000)
        data = await page.evaluate(DUMP)
        await browser.close()
    if errs:
        print("PAGE ERRORS:", errs[:3])

    cards, decks = data["cards"], data["decks"]
    rar = report(cards)

    # ── 1. every cost is a legal one ───────────────────────────────────────
    bad = sorted({c["cost"] for c in cards} - LEGAL)
    check(not bad, "every printed cost is a legal one (0-6 or X)",
          "found %s" % bad if bad else "")

    # ── 2. every starting deck offers a cost decision ──────────────────────
    # The Bash rule. A deck whose every card costs the same has no turn-one
    # decision in it, and eleven of sixteen were exactly that.
    flat, no_high = [], []
    for slug, deck in sorted(decks.items()):
        costs = sorted({c["cost"] for c in deck})
        if len(costs) < 2:
            flat.append("%s (all %s)" % (slug, label(costs[0]) if costs else "?"))
        elif max(costs) <= min(costs):
            no_high.append(slug)
    check(not flat, "every starting deck contains more than one cost",
          "; ".join(flat))

    # …and specifically, something ABOVE the commons, not just a 0-cost below.
    no_two = [s for s, d in sorted(decks.items()) if not any(c["cost"] >= 2 for c in d)]
    check(not no_two,
          "every starting deck contains a card costing 2 or more - the Bash slot",
          "%d of %d without one: %s" % (len(no_two), len(decks), ", ".join(no_two[:6])))

    # ── 3. no companion's whole pool is one cost ───────────────────────────
    pool = defaultdict(set)
    for c in cards:
        pool[c["companion"]].add(c["cost"])
    thin = sorted(s for s, cs in pool.items() if len(cs) < 3)
    check(not thin, "every companion's pool spans at least three costs",
          ", ".join(thin))

    # ── 4. the TARGET, only under --strict ─────────────────────────────────
    if a.strict:
        for r, want in TARGET.items():
            d = rar[r]
            s = sum(d.values()) or 1
            one = d.get(1, 0) / s
            high = sum(v for k, v in d.items() if k >= 2 or k == -1) / s
            check(one <= want["max1"],
                  "%s puts at most %.0f%% of its cards on cost 1" % (r, want["max1"] * 100),
                  "%.1f%%" % (one * 100))
            check(high >= want["minHigh"],
                  "%s puts at least %.0f%% at cost 2 or above" % (r, want["minHigh"] * 100),
                  "%.1f%%" % (high * 100))
        n4 = sum(1 for c in cards if c["cost"] >= 4)
        nx = sum(1 for c in cards if c["cost"] == -1)
        check(n4 >= TARGET_MIN_AT_4_PLUS,
              "the pool reaches the top of the range - at least %d cards cost 4+" % TARGET_MIN_AT_4_PLUS,
              "%d" % n4)
        check(nx >= TARGET_MIN_X,
              "and X is a real cost, not a curiosity - at least %d X cards" % TARGET_MIN_X,
              "%d" % nx)

    print()
    for line in passes:
        print("  PASS  " + line, flush=True)
    for line in fails:
        print("  FAIL  " + line, flush=True)
    print("\nRESULT: %d passed, %d failed" % (len(passes), len(fails)), flush=True)
    return 1 if fails else 0


sys.exit(asyncio.run(main()))
