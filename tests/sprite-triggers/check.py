"""The body-clip table (game/src/ui/clips.js) against what was built and what is played.

    python tests/sprite-triggers/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS.  A mechanic clip is only as good as the rule that plays it, and
every way that rule can be wrong is silent.  A keyword spelled differently from
the data never matches.  A rule naming a clip that was never built makes
`playClip` return false and the Companion quietly falls back to `trick`.  A clip
that WAS built but no rule names sits in its atlas forever.  None of those
throw, none of them log, and a Companion that simply never does its Hide looks
exactly like one that has no Hide.  So:

  DEAD CLIP     a built mechanic clip no card, counter, status or scene beat plays
  MISSING CLIP  a rule, for a Companion that IS built, naming a clip it has not got
  DEAD KEYWORD  a card rule whose keyword no card of that Companion carries
  DEAD STRIKE   a STRIKE rule no Attack carries, so the lunge is never replaced
  UNKNOWN ID    a counter or status rule whose id is not a quoted literal in that
                Companion's data file
  PLAYBACK      ui/sprite.js not doing what a clip's timing flags say: a one-shot
                that fails to hand back to idle, or a `ping` clip (prep_sprites
                marks one that ends away from its first pose) that plays forward
                only and pops, driven on a synthetic clip in the real ClipPlayer

"Can be played" is computed through the scene's own `cardClip`, rule order and
all, so a clip every card loses to an earlier rule counts as dead.

HOW TO PROVE IT SEES (CONTRACTS 54): rename `['web', 'webbing', STRIKE]` to
`['webs', ...]` in clips.js and DEAD KEYWORD and DEAD CLIP (wink/webbing) go
red; delete Mossbit's counter rule and DEAD CLIP (mossbit/release) goes red;
drop the `c.ping` branch from `ClipPlayer#frame` and the ping trace goes red.

Prints `RESULT: n passed, m failed`.  Exit 0 only when m == 0.
"""
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/sprite-triggers/index.html"


async def collect():
    from playwright.async_api import async_playwright
    errs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_function("window.__TRIGGERS !== undefined", timeout=60000)
        data = await page.evaluate("window.__TRIGGERS")
        await browser.close()
    return data, errs


def main():
    data, errs = asyncio.run(collect())
    passes, fails = [], []

    def check(ok, what, detail=""):
        (passes if ok else fails).append(what + (" - " + detail if detail else ""))

    if not data or data.get("error"):
        print("PAGE ERROR:", (data or {}).get("error") or errs[:2])
        print("RESULT: 0 passed, 1 failed")
        return 1

    universal = set(data["universal"])
    scene = {k: set(v) for k, v in (data.get("sceneDriven") or {}).items()}
    table, built = data["table"], data["built"]
    cards, sources, reached = data["cards"], data["sources"], data.get("reached") or {}

    print("mechanic clips: what plays each one")
    for slug in sorted(set(built) | set(table)):
        rules = table.get(slug, {})
        card_rules = rules.get("cards") or []
        ev_rules = (rules.get("counters") or []) + (rules.get("statuses") or [])
        ev_clips = {r["clip"] for r in ev_rules}
        have = set(built.get(slug, []))
        by_card = reached.get(slug, {})

        words = []
        for clip in sorted(have - universal):
            roads = []
            n = len(by_card.get(clip, []))
            if n:
                strikes = sum(1 for c in by_card[clip] if c.endswith("*"))
                roads.append("%d cards%s" % (n, (" (%d lunge)" % strikes) if strikes else ""))
            if clip in ev_clips:
                roads.append("events")
            if clip in scene.get(slug, set()):
                roads.append("scene")
            words.append("%s[%s]" % (clip, ", ".join(roads) or "NOTHING"))
            check(bool(roads), "%s/%s can be played" % (slug, clip),
                  "DEAD CLIP: no card, counter, status or scene beat reaches it")
        state = "" if slug in built else "  (not built yet)"
        print("  %-11s %s%s" % (slug, "  ".join(words) or "-", state))

        if slug in built:
            for rule in card_rules:
                check(rule[1] in have, "%s: rule '%s' names a built clip" % (slug, rule[0]),
                      "MISSING CLIP: %s has no '%s'" % (slug, rule[1]))
            for r in ev_rules:
                check(r["clip"] in have, "%s: %s rule names a built clip" % (slug, r["id"]),
                      "MISSING CLIP: %s has no '%s'" % (slug, r["clip"]))

        owned = cards.get(slug, [])
        for rule in card_rules:
            kw = rule[0]
            carriers = [c for c in owned if kw in c["keywords"]]
            check(bool(carriers), "%s: some card carries '%s'" % (slug, kw), "DEAD KEYWORD")
            if len(rule) > 2 and rule[2] is True:
                check(any(c["type"] == "attack" for c in carriers),
                      "%s: STRIKE '%s' is carried by an Attack" % (slug, kw), "DEAD STRIKE")

        src = sources.get(slug, "")
        for r in ev_rules:
            check(("'%s'" % r["id"]) in src,
                  "%s: '%s' is an id in data/companions/%s.js" % (slug, r["id"], slug),
                  "UNKNOWN ID")

    # ── PLAYBACK: what the player does with a clip's timing flags ──────────────
    pb = data.get("playback") or {}
    check(pb.get("beat") == [0, 1, 2, 3] + ["idle"] * 8,
          "playback: a one-shot plays its frames once, then hands back to idle",
          "trace %s" % pb.get("beat"))
    check(pb.get("ping") == [0, 1, 2, 3, 3, 2, 1, 0] + ["idle"] * 4,
          "playback: a ping clip plays there and back, then hands back to idle",
          "trace %s" % pb.get("ping"))
    check(pb.get("beatSeconds") == 1 and pb.get("pingSeconds") == 2,
          "playback: duration() counts a ping's frames twice",
          "beat %ss, ping %ss" % (pb.get("beatSeconds"), pb.get("pingSeconds")))

    if errs:
        check(False, "the page loaded without errors", "; ".join(errs[:2]))

    print()
    for line in fails:
        print("  FAIL  " + line)
    print("\nRESULT: %d passed, %d failed" % (len(passes), len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
