"""Scene-to-engine seam proofs for the Scuffle screen.  OWNER: combat-scene.

    python tests/combat-scene/seam.py [--wait 25] [--verbose] [--w 1600] [--h 900]

CONTRACTS.md rule 9: "Test across the seam, not just inside your module.  If
your module calls another module's API, your tests must exercise it against the
REAL implementation at least once."

This drives the REAL game at http://localhost:8777/game/index.html with the real
CombatEngine, the real Bones deck and the real CombatScene, and asserts the
things a module-level harness structurally cannot see.

Why it exists: `game/src/scenes/combat.js` rendered `draw` / `discard` /
`exhaust` / `card:add` and had no `case 'card:move'`, so every card the engine
moved INTO the hand — Fetch, Dig Up, the Bury return, Stash, Scurry — existed in
the rules and not on screen.  Observed live: after resolving the Fetch chooser
`engine.state.piles.hand` was `[c26,c27,c24,c35]` while the DOM hand was
`[c26,c27,c24]`; the card stayed missing and was discarded unplayed at end of
turn.  Every scene-side unit test passed the whole time, because they all
rendered from a fixture instead of from the engine.

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

# Parenthesised: it gets interpolated behind `!`, and `!window.MM && …` is not
# `!(window.MM && …)`.
SCENE = "(window.MM && window.MM.ctx.scenes.current)"

# `ui/hand.js` keeps ONE permanent hidden `.mm-card.mm-hand__probe` for
# measurement, and paints throwaway `.mm-hand__warm` waves during the scene's
# raster rehearsal.  Neither is a card in your hand.  `.mm-hand__cards` is the
# fan itself, so that is what "the cards on screen" means here; the raw
# `.mm-card` count is asserted too, minus the probe, once the rehearsal is over.
FAN = ".mm-hand__cards .mm-card"

# Put `bones/go-get-it` in hand and a legal Fetch target in the discard pile.
# Both moves go through `piles.move()`, which is the very seam under test.
SETUP = r"""
() => {
  const sc = window.MM.ctx.scenes.current;
  const E = sc.engine;
  const all = E.piles.all();
  const g = all.find(c => c.id === 'bones/go-get-it');
  if (!g) return { ok: false, why: 'bones/go-get-it is not in this deck' };
  const t = all.find(c => c !== g && c.baseCost >= 0 && c.baseCost <= 1);
  if (!t) return { ok: false, why: 'no printed-cost-1-or-less Trick to fetch' };
  if (E.piles.pileOf(t) !== 'discard') E.piles.move(t, 'discard', { reason: 'seamtest' });
  if (E.piles.pileOf(g) !== 'hand') E.piles.move(g, 'hand', { reason: 'seamtest' });
  return { ok: true, uid: g.uid, target: t.uid, hand: E.piles.hand.length };
}
"""

# Arm the observer, then play the card.  `hand.playCard` is the same entry point
# a click and the keyboard both use, so this exercises
# _onPlay -> engine.playCard -> choice resolver -> _animate, not a shortcut.
PLAY = r"""
(uid) => {
  const FAN = '.mm-hand__cards .mm-card';
  const sc = window.MM.ctx.scenes.current;
  window.__seam = null;
  let closedAt = 0;
  const t0 = performance.now();
  const poll = () => {
    const E = sc.engine;
    if (!E) { window.__seam = { ms: -1, why: 'scene left' }; return; }
    const ch = document.querySelector('.cb-chooser');
    const open = ch && !ch.hidden;
    if (!closedAt && !open && performance.now() - t0 > 60) closedAt = performance.now();
    const dom = [...document.querySelectorAll(FAN)].map(e => e.dataset.uid);
    const eng = E.piles.hand.map(c => c.uid);
    const same = dom.length === eng.length && eng.every(u => dom.includes(u));
    const snap = {
      dom, eng,
      // the literal assertion, minus the Hand's own measurement probe
      allCards: document.querySelectorAll('.mm-card:not(.mm-hand__probe)').length,
      stateHand: E.state.piles.hand.length,
    };
    if (closedAt && same) { window.__seam = { ms: performance.now() - closedAt, ...snap }; return; }
    if (performance.now() - t0 > 6000) { window.__seam = { ms: -1, why: 'timeout', ...snap }; return; }
    requestAnimationFrame(poll);
  };
  sc.hand.playCard(uid);
  requestAnimationFrame(poll);
  return true;
}
"""

# ── "up to N" must MEAN up to N ─────────────────────────────────────────────
# `bones/backyard-cache` prints "Bury up to 2 other Tricks", the chooser said
# "Pick 2", CONFIRM was `disabled:true` with one card selected and Escape did
# nothing — a card whose own text promises a range, refused by the screen that
# is supposed to render it (shots/p5-48-chooser-one.png).
#
# This is a seam claim in both directions: the SCREEN must accept 0..N, and the
# ENGINE must accept what the screen hands back. `combat/choice.js#sanitise`
# takes any subset, so one pick was always a legal resolution.
UPTO = r"""
() => {
  const sc = window.MM.ctx.scenes.current;
  const E = sc.engine;
  const def = E.resolveCardDef('bones/backyard-cache');
  if (!def) return { ok: false, why: 'bones/backyard-cache is not registered' };
  // it needs at least two OTHER Tricks in hand to offer a real range
  while (E.piles.hand.length < 4) {
    const spare = E.piles.draw[0] || E.piles.discard[0];
    if (!spare) break;
    E.piles.move(spare, 'hand', { reason: 'seamtest' });
  }
  const c = E.addCard(def, 'hand', { reason: 'seamtest' });
  if (!c) return { ok: false, why: 'addCard returned nothing' };
  E.player.energy = Math.max(E.player.energy, 2);
  sc.hand.playCard(c.uid);
  return { ok: true, uid: c.uid, text: def.text, hand: E.piles.hand.length };
}
"""

# Is the deny message actually the thing PAINTED at its own centre?
#
# `elementFromPoint` skips `pointer-events:none` elements and the deny is one,
# so the hit test is run with pointer events momentarily restored and then put
# straight back.  Paint order is what decides that hit, which is exactly the
# property under test: at z 360 under a z 520 modal the reviewer's probe
# returned `DIV.cb-chooser__pool`.
DENY_HIT = r"""
() => {
  const d = document.querySelector('.cb-deny');
  const ch = document.querySelector('.cb-chooser');
  if (!d) return { ok: false, why: 'no .cb-deny' };
  const r = d.getBoundingClientRect();
  if (!r.width) return { ok: false, why: 'deny has no box' };
  const cs = getComputedStyle(d);
  const prev = d.style.pointerEvents;
  d.style.pointerEvents = 'auto';
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  d.style.pointerEvents = prev;
  return {
    ok: !!el && (el === d || d.contains(el)),
    hit: el ? (el.tagName + '.' + String(el.className).split(' ').join('.')) : null,
    text: d.textContent,
    z: +cs.zIndex, chooserZ: +getComputedStyle(ch).zIndex,
    opacity: +cs.opacity,
    chooserOpen: !ch.hidden,
  };
}
"""


async def main(a):
    from playwright.async_api import async_playwright
    passed, failed, notes = 0, 0, []
    errors, logs = [], []

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
            viewport={"width": a.w, "height": a.h}, reduced_motion="no-preference",
        )).new_page()
        page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE + "#scene=combat&seed=7&companion=bones",
                        wait_until="load", timeout=60000)
        await page.wait_for_function(
            f"!!({SCENE}) && {SCENE}.engine"
            f" && document.querySelectorAll('{FAN}').length > 0",
            timeout=int(a.wait * 1000))
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=20000)
        # `_opening` clears on the first `turn:start`, which is BEFORE the opening
        # draw has finished animating — wait for the event queue to go idle too.
        await page.wait_for_function(
            f"{SCENE} && !{SCENE}._draining && {SCENE}._q.length === 0", timeout=20000)
        # The raster rehearsal paints throwaway cards; wait it out before
        # counting. On the FLAG, not on the host element: there is a 60 ms gap
        # between waves where `.mm-hand__warm` does not exist, so its absence
        # meant "the coast is clear" two runs in three and the next wave's six
        # cards got counted with the real five.
        await page.wait_for_function(
            f"{SCENE} && {SCENE}.hand && !{SCENE}.hand.warming", timeout=20000)
        await page.wait_for_timeout(500)

        # ── 1. the fan and the engine agree before we touch anything ────────
        base = await page.evaluate(
            f"() => ({{ dom: document.querySelectorAll('{FAN}').length,"
            f" all: document.querySelectorAll('.mm-card:not(.mm-hand__probe)').length,"
            f" eng: {SCENE}.engine.state.piles.hand.length }})")
        check(base["dom"] == base["eng"] == base["all"],
              "opening hand: DOM cards == piles.hand",
              f"fan {base['dom']} / all {base['all']} / engine {base['eng']}")

        # ── 2. Fetch: bones/go-get-it against the real engine ───────────────
        setup = await page.evaluate(SETUP)
        if not setup.get("ok"):
            check(False, "setup: go-get-it playable with a Fetch target", setup.get("why", ""))
        else:
            await page.wait_for_timeout(600)
            after = await page.evaluate(
                f"() => ({{ dom: document.querySelectorAll('{FAN}').length,"
                f" eng: {SCENE}.engine.state.piles.hand.length }})")
            check(after["dom"] == after["eng"],
                  "card:move into hand (setup) renders",
                  f"dom {after['dom']} / engine {after['eng']}")

            await page.evaluate(PLAY, setup["uid"])
            await page.wait_for_selector(".cb-chooser:not([hidden]) .cb-choice", timeout=10000)

            # ── 3. the deny paints ABOVE the modal that provoked it ─────────
            # Provoked directly, because as of round 4 Escape CLOSES the panel
            # (see below) and a deny raised on the way out would be measured
            # against a chooser that is already gone.
            await page.evaluate(f"() => {SCENE}._deny('seam: stacking probe')")
            await page.wait_for_timeout(140)
            deny = await page.evaluate(DENY_HIT)
            check(deny.get("chooserOpen") is True,
                  "the chooser is still open while the deny is measured")
            check(deny.get("z", 0) > deny.get("chooserZ", 0),
                  "deny stacks above the chooser",
                  f"deny z {deny.get('z')} vs chooser z {deny.get('chooserZ')}")
            check(deny.get("ok") is True,
                  "deny message is the element painted at its own centre",
                  f"hit {deny.get('hit')} · \"{(deny.get('text') or '')[:64]}\"")

            # a mouse player must be told the card is the control
            sub = await page.evaluate(
                "() => document.querySelector('.cb-chooser__sub').textContent")
            check("lick" in sub, "chooser sub-line names the mouse action", repr(sub))

            # ── 3b. EVERY CHOOSER CANCELS ───────────────────────────────────
            # Round 3: Escape dismissed the Fetch picker and did nothing at all
            # on the Bury picker, so two panels in the same scene behaved
            # differently and the reviewer filed the second as a soft-lock
            # (shots/p5-46-SOFTLOCK.png). Escape now closes every chooser, and
            # the engine is never left blocked: `combat/choice.js#sanitise`
            # substitutes the first entry when a mandatory request resolves
            # empty, so a cancel costs the choice and not the run. That is a
            # SEAM claim, so it is proved against the real engine here — the
            # fetched Trick still has to arrive on screen below.
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(160)
            closed = await page.evaluate(
                "() => document.querySelector('.cb-chooser').hidden === true")
            check(closed, "Escape dismisses a mandatory chooser")
            check(await page.evaluate(f"() => !{SCENE}._choice"),
                  "the cancelled choice is released, not left pending")

            await page.wait_for_function("window.__seam !== null", timeout=12000)
            seam = await page.evaluate("window.__seam")

            check(seam.get("ms", -1) >= 0,
                  "the fetched Trick reaches the DOM at all",
                  f"engine hand {seam.get('eng')} · DOM hand {seam.get('dom')}")
            check(seam.get("allCards") == seam.get("stateHand"),
                  "querySelectorAll('.mm-card').length == engine.state.piles.hand.length",
                  f"{seam.get('allCards')} vs {seam.get('stateHand')}")
            ms = seam.get("ms", -1)
            check(0 <= ms <= 250,
                  "fetched Trick on screen within 250 ms of the chooser closing",
                  f"{ms:.0f} ms" if ms >= 0 else "never")
            check(ms >= 0,
                  "a CANCELLED mandatory choice still resolves the engine",
                  "the Fetch completed and rendered after Escape")

            # ── 4. and it is actually playable, not decoration ──────────────
            held = await page.evaluate(f"""() => {{
              const E = {SCENE}.engine;
              const en = E.livingEnemies()[0];
              return E.piles.hand.map(c => ({{
                uid: c.uid, id: c.id,
                inDom: !!document.querySelector(
                  '.mm-hand__cards .mm-card[data-uid="' + c.uid + '"]'),
                ok: E.canPlay(c.uid, en ? en.id : null).ok,
              }}));
            }}""")
            missing = [c for c in held if not c["inDom"]]
            check(not missing, "every Trick the engine holds has a card on screen",
                  ", ".join(c["id"] for c in missing) or "all present")
            check(any(c["ok"] for c in held),
                  "the hand on screen is playable",
                  f"{sum(1 for c in held if c['ok'])}/{len(held)} playable")

        # ── 4b. "up to N" accepts fewer than N ──────────────────────────────
        try:
            await page.wait_for_function(
                f"{SCENE} && !{SCENE}._resolving && {SCENE}.engine && !{SCENE}._draining",
                timeout=20000)
            up = await page.evaluate(UPTO)
        except Exception as e:                                   # noqa: BLE001
            up = {"ok": False, "why": f"{type(e).__name__}"}
        if not up.get("ok"):
            notes.append(("SKIP", '"up to N" chooser accepts fewer than N', up.get("why", "")))
        else:
            try:
                await page.wait_for_selector(".cb-chooser:not([hidden]) .cb-choice", timeout=10000)
                bar = await page.evaluate("""() => ({
                  sub: document.querySelector('.cb-chooser__sub').textContent,
                  okHidden: document.querySelector('.cb-chooser__ok').hidden,
                  okDisabled: document.querySelector('.cb-chooser__ok').disabled,
                  cancel: document.querySelector('.cb-chooser__skip').textContent,
                  cancelHidden: document.querySelector('.cb-chooser__skip').hidden,
                  n: document.querySelectorAll('.cb-chooser .cb-choice').length,
                })""")
                check("up to" in bar["sub"].lower(),
                      'the chooser says what the card says ("up to N")', repr(bar["sub"]))
                check(bar["cancelHidden"] is False,
                      "every chooser shows a cancel control", repr(bar["cancel"]))
                # pick ONE of the two and assert CONFIRM goes live
                await page.click(".cb-chooser:not([hidden]) .cb-choice", timeout=5000)
                await page.wait_for_timeout(120)
                one = await page.evaluate("""() => ({
                  picked: document.querySelectorAll('.cb-chooser .cb-choice.is-picked').length,
                  okDisabled: document.querySelector('.cb-chooser__ok').disabled,
                  label: document.querySelector('.cb-chooser__ok').textContent,
                })""")
                check(one["picked"] == 1, "one Trick selected", str(one["picked"]))
                check(one["okDisabled"] is False,
                      'CONFIRM is enabled with 1 of 2 picked on an "up to 2" chooser',
                      f"label {one['label']!r}")
                buried_before = await page.evaluate(
                    f"() => {SCENE}.engine.piles.all().filter("
                    "  c => c.meta && (c.meta['#buried'] | 0) > 0).length")
                await page.click(".cb-chooser__ok", timeout=5000)
                await page.wait_for_function(
                    "() => document.querySelector('.cb-chooser').hidden === true", timeout=8000)
                await page.wait_for_timeout(700)
                after_b = await page.evaluate(
                    f"() => {SCENE}.engine.piles.all().filter("
                    "  c => c.meta && (c.meta['#buried'] | 0) > 0).length")
                check(after_b - buried_before == 1,
                      "the engine applied exactly the one Trick that was picked",
                      f"buried {buried_before} -> {after_b}")
            except Exception as e:                               # noqa: BLE001
                check(False, '"up to N" chooser accepts fewer than N',
                      f"{type(e).__name__}: {e}")

        # ── 5. survives a full turn cycle ───────────────────────────────────
        try:
            await page.wait_for_function(
                f"{SCENE} && !{SCENE}._resolving && {SCENE}.engine", timeout=20000)
            start_turn = await page.evaluate(f"() => {SCENE}.engine.turn")
            await page.evaluate(f"() => {{ {SCENE}._endTurn(); }}")
            await page.wait_for_function(
                f"!({SCENE}) || !{SCENE}.engine || {SCENE}.engine.over"
                f" || (!{SCENE}._resolving && {SCENE}.engine.phase === 'player'"
                f"     && {SCENE}.engine.turn > {start_turn})",
                timeout=60000)
            await page.wait_for_timeout(900)
            turn = await page.evaluate(
                f"() => {{ const sc = {SCENE}; if (!sc || !sc.engine) return null;"
                f" return {{ dom: document.querySelectorAll('{FAN}').length,"
                "            eng: sc.engine.state.piles.hand.length, over: sc.engine.over }; }")
            if turn is None or turn["over"]:
                notes.append(("SKIP", "after a full turn cycle: DOM cards == piles.hand",
                              "the Scuffle ended during the cycle"))
            else:
                check(turn["dom"] == turn["eng"],
                      "after a full turn cycle: DOM cards == piles.hand",
                      f"dom {turn['dom']} / engine {turn['eng']}")
        except Exception as e:                                   # noqa: BLE001
            check(False, "after a full turn cycle: DOM cards == piles.hand",
                  f"turn never came back: {type(e).__name__}")

        # ── 6. the player's own counters are on screen ──────────────────────
        gauge = await page.evaluate(f"""() => {{
          const sc = {SCENE}; if (!sc || !sc.engine) return null;
          const E = sc.engine;
          const mine = [...E.counters.values()].filter(c => c.ownerId === E.player.id);
          const els = [...document.querySelectorAll('.cb-player__counters .cb-count')];
          return {{
            defined: mine.map(c => c.id),
            shown: els.map(e => e.textContent),
            visible: els.filter(e => e.getBoundingClientRect().width > 0).length,
          }};
        }}""")
        if gauge and gauge["defined"]:
            check(gauge["visible"] >= 1,
                  "player-owned counters are rendered",
                  f"engine has {gauge['defined']} · on screen {gauge['shown']}")
        else:
            notes.append(("SKIP", "player-owned counters are rendered",
                          "engine defined none this fight"))

        # ── 7. no console errors across the whole run ───────────────────────
        check(not errors, "zero console errors", "; ".join(errors[:4]))

        await browser.close()

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  — {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=25)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
