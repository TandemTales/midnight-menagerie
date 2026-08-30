"""The two Settings > Play toggles, proved against the real game.

    python tests/settings-play/run.py [--wait 25] [--verbose]

WHY THIS EXISTS.  `ui/settings.js`'s header has always claimed that every
control in the panel "actually takes effect", and named `autoEndTurn` and
`confirmSingleTarget` among the flags "read from `Save.settings` at the point of
use".  The 2026-08-30 sweep found that sentence was false about both of them:
`rg -n -w autoEndTurn` returned four lines and every one was a DECLARATION - the
default in `core/save.js`, the spec entry, the second defaults table, and the
claim itself.  Nothing read either flag.  A player could flip them, watch the
switch move, save the setting to disk, and have the game behave identically
forever.

They are implemented now, in `scenes/combat.js`, and this is the suite that says
so.  Each half runs its CONTROL first - the same board, the same gesture, the
setting OFF - because "the turn ended" and "a dialog appeared" are both things
that could happen for reasons other than the toggle.  A test that only ever runs
the ON case cannot tell an implemented setting from a coincidence, which is
exactly the shape of the bug it would be guarding.

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
FAN = ".mm-hand__cards .mm-card"

# ── the setting arrives the way the panel sends it ─────────────────────────
# `ui/settings.js:122` is `ctx.bus.emit('settings:changed', { key, value })`
# after writing Save.settings, so this is the real delivery path and not a poke
# at `sc.autoEndTurn`.  If the scene ever stops subscribing, this test fails.
SET = r"""
([key, value]) => {
  const ctx = window.MM.ctx;
  ctx.Save.settings[key] = value;
  ctx.bus.emit('settings:changed', { key, value });
  const sc = ctx.scenes.current;
  return { scene: sc[key], saved: ctx.Save.settings[key], armed: !!sc._autoEndT };
}
"""

# Leave exactly one enemy standing, through the damage pipeline rather than by
# writing `alive = false` - the scene has to see the death events or the board
# on screen and the board in the engine stop agreeing.
LEAVE_ONE = r"""
() => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  const living = E.livingEnemies();
  for (const en of living.slice(1)) E.loseHp(en, en.hp, 'settingstest');
  return { left: E.livingEnemies().length, over: E.over };
}
"""

# Put an aimed Trick in hand with the Nerve to pay for it.  `target === 'enemy'`
# is the only card class the confirm covers, because it is the only one a tap
# can aim for you.
ARM_AIMED = r"""
() => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  sc.me.energy = sc.me.energyMax;
  const inHand = sc.mePiles.hand.filter(c => c.target === 'enemy');
  const want = 2 - inHand.length;
  if (want > 0) {
    const spare = E.piles.all().filter(
      c => c.target === 'enemy' && sc.mePiles.pileOf(c) !== 'hand');
    for (const c of spare.slice(0, want)) sc.mePiles.move(c, 'hand', { reason: 'settingstest' });
  }
  const aimed = sc.mePiles.hand.filter(
    c => c.target === 'enemy' && E.canPlay(c.uid, sc._defaultTargetFor(c.uid)).ok);
  return { uids: aimed.map(c => c.uid), names: aimed.map(c => c.name),
           energy: sc.me.energy, enemies: E.livingEnemies().length };
}
"""

# Where on a fanned card can a click actually LAND?
#
# Two problems, and the first one cost this suite a false FAIL.  The cards
# OVERLAP, so the geometric centre of one is often underneath its neighbour;
# Playwright's actionability check rejects that point, and `force:true` would
# only dispatch it at the covering card instead.  And the fan is still MOVING
# for a beat after anything enters or leaves it, so a rect read 500 ms after a
# card was dealt is a rect the card has since slid out of - the click then lands
# on empty felt and the test reports "the tap did not play it", which is a
# statement about the harness and not about the game.
#
# So: wait for the card's own rect to stop changing, then scan it for a pixel
# that hit-tests back to this card.
POINT_ON = r"""
(uid) => new Promise(res => {
  const sel = '.mm-hand__cards .mm-card[data-uid="' + uid + '"]';
  let last = null, stable = 0, tries = 0;
  const tick = () => {
    if (++tries > 300) return res(null);
    const el = document.querySelector(sel);
    if (!el) return requestAnimationFrame(tick);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return requestAnimationFrame(tick);
    const key = [r.left, r.top, r.width, r.height].map(n => Math.round(n)).join(',');
    stable = key === last ? stable + 1 : 0;
    last = key;
    if (stable < 8) return requestAnimationFrame(tick);
    for (let fy = 0.12; fy < 0.92; fy += 0.08) {
      for (let fx = 0.12; fx < 0.92; fx += 0.08) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) {
          return res({ x: Math.round(x), y: Math.round(y) });
        }
      }
    }
    res(null);
  };
  tick();
})
"""

# Nothing in hand is playable - the exact condition the End Turn button already
# computes for its `is-ready` class, reached the way a real turn reaches it
# (out of Nerve), with any free Trick discarded so "nothing" is literal.
DEAD_HAND = r"""
() => {
  const sc = window.MM.ctx.scenes.current, E = sc.engine;
  sc.me.energy = 0;
  for (const c of [...sc.mePiles.hand]) {
    if (E.canPlay(c.uid, sc._defaultTargetFor(c.uid)).ok) {
      sc.mePiles.move(c, 'discard', { reason: 'settingstest' });
    }
  }
  sc._syncEndTurn();
  return {
    any: sc.mePiles.hand.some(c => E.canPlay(c.uid, sc._defaultTargetFor(c.uid)).ok),
    turn: E.turn, phase: E.phase, armed: !!sc._autoEndT,
    ready: sc.$endTurn.classList.contains('is-ready'),
  };
}
"""


async def settle(page, wait=20000):
    await page.wait_for_function(
        f"{SCENE} && {SCENE}.engine && !{SCENE}._resolving"
        f" && !{SCENE}._draining && {SCENE}._q.length === 0", timeout=wait)


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

    def skip(label, why):
        notes.append(("SKIP", label, why))

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            viewport={"width": a.w, "height": a.h}, reduced_motion="no-preference",
        )).new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE + "#scene=combat&seed=7&companion=bones",
                        wait_until="load", timeout=60000)
        await page.wait_for_function(
            f"!!({SCENE}) && {SCENE}.engine"
            f" && document.querySelectorAll('{FAN}').length > 0", timeout=int(a.wait * 1000))
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=20000)
        await settle(page)
        await page.wait_for_function(f"{SCENE} && {SCENE}.hand && !{SCENE}.hand.warming",
                                     timeout=20000)
        await page.wait_for_timeout(400)

        # ── 0. both settings start off, and the scene has read them ─────────
        boot = await page.evaluate(
            f"() => ({{ a: {SCENE}.autoEndTurn, c: {SCENE}.confirmSingleTarget }})")
        check(boot["a"] is False and boot["c"] is False,
              "the scene reads both Play flags at boot",
              f"autoEndTurn {boot['a']!r} · confirmSingleTarget {boot['c']!r}")

        # ══ CONFIRM SINGLE TARGET ══════════════════════════════════════════
        one = await page.evaluate(LEAVE_ONE)
        await settle(page)
        await page.wait_for_timeout(400)
        if one["over"] or one["left"] != 1:
            skip("confirm single target", f"could not leave one enemy ({one})")
        else:
            armed = await page.evaluate(ARM_AIMED)
            await page.wait_for_timeout(500)
            if len(armed["uids"]) < 2:
                skip("confirm single target",
                     f"needed 2 playable aimed Tricks, got {armed['names']}")
            else:
                # ── CONTROL: setting OFF, the tap plays straight through ────
                uid = armed["uids"][0]
                pt = await page.evaluate(POINT_ON, uid)
                if not pt:
                    skip("confirm single target", f"no clickable pixel on card {uid}")
                else:
                    await page.mouse.move(pt["x"], pt["y"])
                    await page.mouse.down()
                    await page.mouse.up()
                    # The dialog, if the setting were on, is raised inside
                    # `_tapPlay` before anything is committed — so it is up
                    # within a frame or two.
                    await page.wait_for_timeout(350)
                    modals = await page.evaluate(
                        "() => document.querySelectorAll('.mm-modal').length")
                    check(modals == 0,
                          "CONTROL off: a tap on the last enemy raises no dialog",
                          f"{modals} modal(s)")
                    # The card leaves the engine's hand only when the play
                    # resolves, and the scene deliberately holds that until the
                    # card has finished flying (combat.js PLAY_RESOLVE, ~460 ms)
                    # so the impact is not painted behind the card. Wait for the
                    # outcome; a fixed 400 ms read "still in hand" and was a
                    # statement about the animation, not about the setting.
                    try:
                        await page.wait_for_function(
                            f"(uid) => !{SCENE} || !{SCENE}.engine"
                            f" || !{SCENE}.mePiles.hand.some(c => c.uid === uid)",
                            arg=uid, timeout=8000)
                        played = True
                    except Exception:                           # noqa: BLE001
                        played = False
                    check(played, "CONTROL off: the tap played the Trick",
                          "gone from hand" if played else "still in hand after 8 s")

                    await settle(page)
                    await page.wait_for_timeout(300)

                    # ── ON: the same gesture asks first ─────────────────────
                    st = await page.evaluate(SET, ["confirmSingleTarget", True])
                    check(st["scene"] is True,
                          "confirmSingleTarget reaches the scene over settings:changed",
                          f"scene {st['scene']!r} · saved {st['saved']!r}")

                    again = await page.evaluate(ARM_AIMED)
                    await page.wait_for_timeout(500)
                    over = await page.evaluate(f"() => !{SCENE}.engine || {SCENE}.engine.over")
                    if over or not again["uids"] or again["enemies"] != 1:
                        skip("confirm single target: ON",
                             f"board moved on: {again} over={over}")
                    else:
                        uid2 = again["uids"][0]
                        nerve0 = await page.evaluate(f"() => {SCENE}.me.energy")
                        pt2 = await page.evaluate(POINT_ON, uid2)
                        if not pt2:
                            skip("confirm single target: ON", f"no clickable pixel on {uid2}")
                        else:
                            await page.mouse.move(pt2["x"], pt2["y"])
                            await page.mouse.down()
                            await page.mouse.up()
                            try:
                                await page.wait_for_selector(".mm-modal", timeout=6000)
                                shown = True
                            except Exception:                       # noqa: BLE001
                                shown = False
                            check(shown,
                                  "ON: the same tap asks before it plays")
                            if shown:
                                txt = await page.evaluate(
                                    "() => document.querySelector('.mm-modal').innerText")
                                check("only one left" in txt.lower(),
                                      "the dialog names why it is asking", repr(txt[:90]))

                                # CANCEL is not a play
                                await page.evaluate("""() => {
                                  const b = [...document.querySelectorAll('.mm-modal .mm-btn')]
                                    .find(e => /put it back/i.test(e.textContent));
                                  if (b) b.click();
                                }""")
                                await page.wait_for_timeout(500)
                                cancelled = await page.evaluate(f"""(uid) => ({{
                                  modal: document.querySelectorAll('.mm-modal').length,
                                  inHand: {SCENE}.mePiles.hand.some(c => c.uid === uid),
                                  energy: {SCENE}.me.energy,
                                }})""", uid2)
                                check(cancelled["modal"] == 0, "cancel closes the dialog")
                                check(cancelled["inHand"] is True,
                                      "cancel leaves the Trick in hand")
                                check(cancelled["energy"] == nerve0,
                                      "cancel spends no Nerve",
                                      f"{nerve0} -> {cancelled['energy']}")

                                # CONFIRM is
                                pt3 = await page.evaluate(POINT_ON, uid2)
                                if not pt3:
                                    skip("confirm plays the Trick", "card unreachable after cancel")
                                else:
                                    await page.mouse.move(pt3["x"], pt3["y"])
                                    await page.mouse.down()
                                    await page.mouse.up()
                                    await page.wait_for_selector(".mm-modal", timeout=6000)
                                    await page.evaluate("""() => {
                                      const b = [...document.querySelectorAll('.mm-modal .mm-btn')]
                                        .find(e => /play it/i.test(e.textContent));
                                      if (b) b.click();
                                    }""")
                                    try:
                                        await page.wait_for_function(
                                            f"(uid) => !{SCENE} || !{SCENE}.engine"
                                            f" || !{SCENE}.mePiles.hand.some(c => c.uid === uid)",
                                            arg=uid2, timeout=8000)
                                        went = True
                                    except Exception:           # noqa: BLE001
                                        went = False
                                    check(went, "confirm plays the Trick it asked about",
                                          "gone from hand" if went else "still in hand after 8 s")

                    await page.evaluate(SET, ["confirmSingleTarget", False])

        # ══ AUTO END TURN ══════════════════════════════════════════════════
        alive = await page.evaluate(
            f"() => !!{SCENE} && !!{SCENE}.engine && !{SCENE}.engine.over")
        if not alive:
            skip("auto end turn", "the Scuffle ended during the confirm checks")
        else:
            await settle(page)
            await page.wait_for_function(
                f"{SCENE}.engine.phase === 'player' && !{SCENE}.me.ended", timeout=30000)

            # ── CONTROL: setting OFF, a dead hand does NOT end the turn ─────
            dead = await page.evaluate(DEAD_HAND)
            check(dead["any"] is False,
                  "CONTROL off: nothing in hand is playable",
                  f"hand dead, End Turn is-ready={dead['ready']}")
            check(dead["armed"] is False,
                  "CONTROL off: no auto-end timer is armed")
            turn0, phase0 = dead["turn"], dead["phase"]
            await page.wait_for_timeout(1800)
            still = await page.evaluate(
                f"() => ({{ turn: {SCENE}.engine.turn, phase: {SCENE}.engine.phase,"
                f"          ended: !!{SCENE}.me.ended }})")
            check(still["turn"] == turn0 and still["phase"] == phase0
                  and still["ended"] is False,
                  "CONTROL off: the turn is still yours 1.8 s later",
                  f"turn {turn0}->{still['turn']} · phase {phase0}->{still['phase']}")

            # ── the party guard, before the toggle can fire ─────────────────
            # `canPlay` refuses every card once the seat has ended ("You have
            # already ended your turn"), so a seat waiting on the rest of the
            # party reads as "nothing playable" for the whole wait.  Without
            # this guard the toggle would call `_endTurn` on a loop.
            guard = await page.evaluate(f"""() => {{
              const sc = {SCENE};
              // Report a missing implementation instead of throwing: a suite
              // that explodes says less than one that names what is absent.
              if (typeof sc._autoEndReady !== 'function') return {{ missing: true }};
              sc.autoEndTurn = true;
              const wasEnded = sc.me.ended;
              sc.me.ended = true;
              const readyWhenEnded = sc._autoEndReady();
              sc.me.ended = wasEnded;
              const readyOtherwise = sc._autoEndReady();
              sc.autoEndTurn = false;
              return {{ readyWhenEnded, readyOtherwise }};
            }}""")
            check(guard.get("readyWhenEnded") is False
                  and guard.get("readyOtherwise") is True,
                  "a seat that has already ended does not auto-end again",
                  "the scene has no _autoEndReady at all" if guard.get("missing")
                  else f"ended {guard['readyWhenEnded']!r}"
                       f" · not-ended {guard['readyOtherwise']!r}")

            # ── ON: the identical board ends itself ────────────────────────
            st = await page.evaluate(SET, ["autoEndTurn", True])
            check(st["scene"] is True,
                  "autoEndTurn reaches the scene over settings:changed",
                  f"scene {st['scene']!r} · saved {st['saved']!r}")
            check(st["armed"] is True,
                  "switching it on arms the timer against the hand already dead")
            try:
                await page.wait_for_function(
                    f"!({SCENE}) || !{SCENE}.engine || {SCENE}.engine.over"
                    f" || {SCENE}.me.ended || {SCENE}.engine.turn > {turn0}"
                    f" || {SCENE}.engine.phase !== '{phase0}'", timeout=15000)
                moved = True
            except Exception:                                       # noqa: BLE001
                moved = False
            after = await page.evaluate(
                f"() => {{ const sc = {SCENE};"
                f" if (!sc || !sc.engine) return {{ gone: true }};"
                f" return {{ turn: sc.engine.turn, phase: sc.engine.phase,"
                f"           over: sc.engine.over, ended: !!sc.me.ended }}; }}")
            check(moved, "ON: the same dead hand ends the turn by itself",
                  f"turn {turn0} -> {after}")

            # and it settles instead of looping: one auto-end, not a machine gun
            await page.wait_for_timeout(2500)
            settled = await page.evaluate(
                f"() => {{ const sc = {SCENE};"
                f" if (!sc || !sc.engine) return {{ gone: true }};"
                f" return {{ turn: sc.engine.turn, phase: sc.engine.phase,"
                f"           over: sc.engine.over }}; }}")
            if settled.get("gone") or settled.get("over"):
                skip("auto end turn settles instead of looping", "the Scuffle ended")
            else:
                check(settled["turn"] <= turn0 + 3,
                      "auto end turn settles instead of looping",
                      f"turn {turn0} -> {settled['turn']} over 2.5 s")

        # ── the console stayed quiet throughout ────────────────────────────
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
