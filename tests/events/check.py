"""Curiosities: the button must be able to do what the button says.

    python tests/events/check.py [--verbose]

`data/events.js`'s own header sets the bar and cites where it came from:

    A Curiosity is not a slot machine. Every option is a decision the player can
    reason about before taking it: the risk is *named* in the option's `risk`
    line, the reward is named in `reward`, and the only thing hidden is which of
    the authored outcomes you land on. […] Slay the Spire's `?` rooms always
    tell you the shape of the bet: HP, gold, a relic, a card, a curse, a fight.
    So do these.

Nothing checked that. The line is prose written beside the outcomes rather than
derived from them, so it can say anything, and by 2026-08-31 it said several
things that were not true:

  * THE COLLAR's "Leave it exactly where it is" advertised `RISK You walk away
    empty-handed` and had exactly ONE outcome, which hands over a Keepsake and
    6 Courage. The advertised risk could not happen.
  * EIGHT options read `RISK Nothing` and handed over a guaranteed Keepsake —
    a free relic for pressing a button, which is not a bet of any shape.

And a Keepsake is not one reward among several here. `tests/run/run.py`
measured Curiosity rooms handing over **0.97 Keepsakes per visit** across 273
of them, more than Treasure (1.00 per visit but a quarter as common) and more
than every boss in the run put together. All seventeen Curiosities could pay
one, so the room WAS a treasure chest with reading attached, and the back two
thirds of the difficulty ladder is downstream of that.

This suite is the gate that stops both from coming back. It reads the real
module and asks three things of every option:

  1. every noun the `reward` line names is DELIVERABLE — some outcome grants it;
  2. every noun the `risk` line names is REACHABLE — some outcome inflicts it,
     and `Nothing` means no outcome costs anything;
  3. an option that risks nothing may not hand over a Keepsake in every outcome.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import asyncio
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HARNESS = "http://localhost:8777/tests/combat/index.html"

# The player's own nouns, from the file header, mapped to the effect keys that
# actually deliver them. A noun the vocabulary does not name is a finding in
# itself — the line has invented a currency.
DUMP = r"""
async () => {
  const ev = await import('/game/src/data/events.js');
  const R = await import('/game/src/data/relics.js');
  const rows = [];
  for (const e of ev.CURIOSITIES) {
    for (const o of e.options || []) {
      const outs = o.outcomes && o.outcomes.length
        ? o.outcomes.map(x => ({ w: x.w ?? 1, fx: x.effects || {} }))
        : [{ w: 1, fx: o.effects || {} }];
      rows.push({
        event: e.id, option: o.id, label: o.label,
        risk: o.risk ?? null, reward: o.reward ?? null,
        cost: o.cost || null,
        requires: o.requires || null,
        outcomes: outs,
        keys: [...new Set(outs.flatMap(x => Object.keys(x.fx)))],
        // The share of this option's weight that hands over a Keepsake.
        relicShare: (() => {
          const tw = outs.reduce((a, b) => a + b.w, 0) || 1;
          return outs.reduce((a, b) => a + (b.fx.relic ? b.w : 0), 0) / tw;
        })(),
      });
    }
  }
  return { rows, events: ev.CURIOSITIES.length,
           relicIds: R.ALL_RELICS ? R.ALL_RELICS.length : null };
}
"""

# noun in the risk/reward line  ->  effect keys that satisfy it, and whether the
# effect has to be a LOSS (risk side) or a GAIN (reward side).
NOUNS = [
    ("maximum courage", ("maxHp",)),
    ("a keepsake",      ("relic",)),
    ("keepsake",        ("relic",)),
    ("lost things",     ("lostThings",)),
    ("a trick",         ("card", "removeCard", "upgradeCard")),
    ("trick",           ("card", "removeCard", "upgradeCard")),
    ("a snack",         ("snacks",)),
    ("snack",           ("snacks",)),
    ("clue",            ("clues",)),
    ("curse",           ("curse",)),
    ("big scare",       ("combat",)),
    ("a fight",         ("combat",)),
    ("courage",         ("hp", "heal", "maxHp")),
]


def nouns_in(line):
    """Which vocabulary nouns a risk/reward line names, longest match first."""
    s = (line or "").lower()
    found, taken = [], []
    for noun, keys in NOUNS:
        i = s.find(noun)
        if i < 0:
            continue
        if any(a <= i < b for a, b in taken):
            continue
        taken.append((i, i + len(noun)))
        found.append((noun, keys))
    return found


def gains(fx, keys):
    for k in keys:
        v = fx.get(k)
        if v is None:
            continue
        if k in ("hp", "maxHp", "lostThings", "clues"):
            if isinstance(v, (int, float)) and v > 0:
                return True
        else:
            return True
    return False


def costs(fx, keys):
    for k in keys:
        v = fx.get(k)
        if v is None:
            continue
        if k in ("hp", "maxHp", "lostThings", "clues", "heal"):
            if isinstance(v, (int, float)) and v < 0:
                return True
        elif k in ("curse", "combat", "removeCard"):
            return True
    return False


def any_cost(fx):
    if fx.get("curse") or fx.get("combat") or fx.get("removeCard"):
        return True
    for k in ("hp", "maxHp", "lostThings", "clues"):
        v = fx.get(k)
        if isinstance(v, (int, float)) and v < 0:
            return True
    return False


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
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await page.goto(HARNESS, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(800)
        data = await page.evaluate(DUMP)
        await browser.close()

    rows = data["rows"]
    check(data["events"] >= 17, "every Curiosity loads", f"{data['events']} events")
    check(len(rows) >= 54, "every option loads", f"{len(rows)} options")

    # ══ 1. a reward line names only things some outcome can deliver ═════════
    bad = []
    for r in rows:
        if not r["reward"]:
            continue
        for noun, keys in nouns_in(r["reward"]):
            if not any(gains(o["fx"], keys) for o in r["outcomes"]):
                bad.append(f"{r['event']}/{r['option']} promises \"{noun}\" "
                           f"({r['reward']!r}) and no outcome grants it; keys {r['keys']}")
    check(not bad, "every REWARD a button names is deliverable by some outcome",
          "; ".join(bad[:4]) or f"{len(rows)} options")

    # ══ 2. a risk line names only things some outcome can inflict ══════════
    bad = []
    for r in rows:
        risk = (r["risk"] or "").strip().lower()
        if not risk:
            continue
        if risk.startswith("nothing"):
            # "Nothing you can see" and "Nothing but the time" are the file's own
            # authored hedges for a hidden cost; a bare "Nothing" is a promise.
            if risk == "nothing" and any(any_cost(o["fx"]) for o in r["outcomes"]):
                bad.append(f"{r['event']}/{r['option']} says RISK Nothing and an "
                           f"outcome costs something: {r['keys']}")
            continue
        # A stated Lost Things cost is paid by `cost`, not by an outcome.
        if r["cost"] and "lost things" in risk:
            continue
        named = nouns_in(r["risk"])
        if not named:
            bad.append(f"{r['event']}/{r['option']} risk {r['risk']!r} names no "
                       f"vocabulary noun")
            continue
        if not any(any(costs(o["fx"], keys) for o in r["outcomes"])
                   for _, keys in named):
            bad.append(f"{r['event']}/{r['option']} advertises RISK {r['risk']!r} "
                       f"and no outcome can deliver it; keys {r['keys']}")
    check(not bad, "every RISK a button names is reachable by some outcome",
          "; ".join(bad[:4]) or f"{len(rows)} options")

    # ══ 3. a free button may not hand over the run's best resource ═════════
    free = [r for r in rows
            if (r["risk"] or "").strip().lower() == "nothing"
            and not r["cost"] and r["relicShare"] >= 1.0]
    check(not free,
          "no option risks Nothing and hands over a guaranteed Keepsake",
          "; ".join(f"{r['event']}/{r['option']}" for r in free[:6])
          or f"{len([r for r in rows if (r['risk'] or '').lower() == 'nothing'])} "
             f"free options, none of them a certain Keepsake")

    # ══ 4. the shape of the economy, stated rather than assumed ════════════
    withrelic = [r for r in rows if r["relicShare"] > 0]
    certain = [r for r in rows if r["relicShare"] >= 1.0]
    events_with = len({r["event"] for r in withrelic})
    check(events_with <= 12,
          "a Keepsake is one shape of bet among several, not the shape every "
          "Curiosity has",
          f"{events_with} of {data['events']} events can pay a Keepsake, "
          f"{len(withrelic)} of {len(rows)} options, {len(certain)} of them certain")

    # ══ 5. and the vocabulary is closed ════════════════════════════════════
    KNOWN = {"hp", "heal", "maxHp", "lostThings", "snacks", "clues", "relic",
             "card", "curse", "combat", "removeCard", "upgradeCard", "rescue"}
    stray = sorted({k for r in rows for k in r["keys"]} - KNOWN)
    check(not stray, "every effect key is one `state/run.js` applies",
          ", ".join(stray) or f"{len(KNOWN)} known keys")

    check(not errors, "zero console errors", "; ".join(errors[:3]))

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
