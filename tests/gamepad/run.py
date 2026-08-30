"""The controller, which is what Steam Deck Verified actually asks for.

    python tests/gamepad/run.py [--wait 25] [--verbose]

WHY THIS EXISTS
---------------
A Steam Deck has no keyboard. Valve's Deck Verified bar starts at "the game is
fully playable with the controller", and the honest way to find out whether that
is true is to press the buttons.

There is no gamepad plugged into this machine, so the suite replaces
`navigator.getGamepads` with a synthetic pad and lets the REAL polling loop in
`input/gamepad.js` read it: the same deadzone, the same edge detection, the same
auto-repeat, off the same clock. Nothing about the game's side is stubbed - the
focus that moves is real DOM focus, the card that gets selected is selected by
`ui/hand.js`, and the turn that ends is ended by `scenes/combat.js`.

Every behavioural check has its CONTROL: the same button with the pad absent, or
the same direction with the value inside the deadzone.

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

BASE = "http://localhost:8777/game/index.html"
SCENE = "(window.MM && window.MM.ctx.scenes.current)"

# ── a synthetic pad the real poller reads ──────────────────────────────────
INSTALL = r"""
(id) => {
  const pad = {
    id, index: 0, connected: true, mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    timestamp: 0,
  };
  window.__pad = pad;
  window.__padLog = [];
  if (!window.__padOrig) window.__padOrig = navigator.getGamepads.bind(navigator);
  navigator.getGamepads = () => [pad, null, null, null];
  if (!window.__padWired) {
    window.__padWired = true;
    window.MM.bus.on('pad:action', (p) => window.__padLog.push([p.action, !!p.repeat]));
  }
  // The poller only learns the id when it next sees the pad; force a re-read.
  window.MM.ctx.gamepad.padId = null;
  return true;
}
"""

UNINSTALL = r"""
() => { if (window.__padOrig) navigator.getGamepads = window.__padOrig;
        window.__pad = null; return true; }
"""

BTN = r"""
([index, down]) => { const b = window.__pad.buttons[index];
                     b.pressed = !!down; b.value = down ? 1 : 0; return true; }
"""

AXIS = r"""
([n, v]) => { window.__pad.axes[n] = v; return true; }
"""


async def frames(page, n=4):
    """Let the real rAF-driven poller run n frames."""
    await page.evaluate(
        "(n) => new Promise(res => { let i = 0;"
        " const go = () => (++i >= n ? res(true) : requestAnimationFrame(go));"
        " requestAnimationFrame(go); })", n)


async def tap(page, index, hold_frames=3):
    await page.evaluate(BTN, [index, True])
    await frames(page, hold_frames)
    await page.evaluate(BTN, [index, False])
    await frames(page, 2)


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

    def skip(label, why): notes.append(("SKIP", label, why))

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

        await page.goto(BASE, wait_until="load", timeout=60000)
        await page.wait_for_function("!!window.MM && !!window.MM.ctx.gamepad", timeout=int(a.wait * 1000))
        # The title fades in, and its buttons pass through opacity 0 on the way.
        # Waiting for `> 0` once catches a flicker and the count is back to zero
        # 300 ms later, so wait for it to be true TWICE, 400 ms apart. Measured:
        # a single wait returned at ~1.2 s and the next read said 0.
        await page.wait_for_function(
            "() => window.MM.ctx.navigator.candidates().length > 0", timeout=20000)
        await page.wait_for_timeout(400)
        await page.wait_for_function(
            "() => window.MM.ctx.navigator.candidates().length > 0", timeout=20000)

        # ══ CONTROL: no pad, no movement ════════════════════════════════════
        await page.evaluate("() => document.activeElement && document.activeElement.blur()")
        before = await page.evaluate("() => document.activeElement.tagName")
        await frames(page, 8)
        after = await page.evaluate("() => document.activeElement.tagName")
        check(before == after == "BODY",
              "CONTROL: with no pad attached, focus does not move on its own",
              f"{before} -> {after}")
        check(await page.evaluate("() => window.MM.ctx.gamepad.active") is False,
              "CONTROL: the pad layer reports itself inactive")

        # ══ a pad appears ═══════════════════════════════════════════════════
        await page.evaluate(INSTALL, "Xbox 360 Controller (XInput STANDARD GAMEPAD)")
        await page.evaluate(BTN, [13, True])          # d-pad down
        await frames(page, 4)
        await page.evaluate(BTN, [13, False])
        await frames(page, 2)
        st = await page.evaluate("""() => ({
          active: window.MM.ctx.gamepad.active,
          family: window.MM.ctx.gamepad.family,
          focused: document.activeElement.tagName + '.' + (document.activeElement.className || ''),
          log: window.__padLog,
        })""")
        check(st["active"] is True, "pressing a button wakes the pad layer")
        check(st["family"] == "xbox", "and the glyph family comes off the pad id", st["family"])
        check(any(e[0] == "down" for e in st["log"]),
              "the d-pad emits a semantic action, not a button index", json.dumps(st["log"][:4]))
        check(st["focused"].startswith("BUTTON"),
              "and focus lands on something focusable", st["focused"])

        # ══ deadzone and hysteresis on the stick ════════════════════════════
        await page.evaluate("() => { window.__padLog.length = 0; }")
        await page.evaluate(AXIS, [1, 0.30])          # inside the deadzone
        await frames(page, 6)
        quiet = await page.evaluate("() => window.__padLog.length")
        check(quiet == 0, "CONTROL: a stick resting inside the deadzone emits nothing",
              f"{quiet} action(s)")

        await page.evaluate(AXIS, [1, 0.90])
        await frames(page, 3)
        moved = await page.evaluate("() => window.__padLog.filter(e => e[0] === 'down').length")
        check(moved >= 1, "pushing it past the deadzone emits one edge", f"{moved}")

        # Falling back to 0.40 - below the press threshold, above the release one -
        # must NOT re-trigger. This is the chatter case.
        await page.evaluate("() => { window.__padLog.length = 0; }")
        await page.evaluate(AXIS, [1, 0.40])
        await frames(page, 6)
        chatter = await page.evaluate("() => window.__padLog.filter(e => !e[1]).length")
        check(chatter == 0, "and easing off without releasing does not re-fire",
              f"{chatter} fresh edge(s)")
        await page.evaluate(AXIS, [1, 0.0])
        await frames(page, 2)

        # ══ auto-repeat is a repeat, not a stampede ═════════════════════════
        await page.evaluate("() => { window.__padLog.length = 0; }")
        await page.evaluate(BTN, [13, True])
        await page.wait_for_timeout(900)
        await page.evaluate(BTN, [13, False])
        await frames(page, 2)
        rep = await page.evaluate("""() => ({
          total: window.__padLog.length,
          repeats: window.__padLog.filter(e => e[1]).length,
        })""")
        # 900ms with a 420ms delay and a 110ms rate is roughly 1 + 4 repeats.
        # The assertion is a BAND: too few means the repeat never armed, too many
        # means it is firing per frame, and per frame is 54 in that window.
        check(2 <= rep["total"] <= 12,
              "holding a direction repeats at a readable rate, not per frame",
              json.dumps(rep))
        check(rep["repeats"] >= 1, "and the repeats are flagged as repeats")

        # ══ confirm activates the focused control ═══════════════════════════
        clicked = await page.evaluate("""() => {
          const el = document.activeElement;
          window.__clicks = 0;
          el.addEventListener('click', () => { window.__clicks++; }, { once: true });
          return el.textContent.trim().slice(0, 30);
        }""")
        await tap(page, 0)                            # A
        n = await page.evaluate("() => window.__clicks")
        check(n == 1, f"confirm clicks the focused control ({clicked!r})", f"{n} click(s)")

        # ══ glyphs per family ═══════════════════════════════════════════════
        g = await page.evaluate("""async () => {
          const G = await import('/game/src/input/gamepad.js');
          return {
            fams: ['xbox','playstation','nintendo','deck'].map(f => [f, G.glyphFor(f,'confirm'), G.glyphFor(f,'cancel')]),
            detect: [
              G.familyOf('Sony DualSense Wireless Controller'),
              G.familyOf('Steam Deck Controller'),
              G.familyOf('Nintendo Switch Pro Controller'),
              G.familyOf('some unknown pad'),
            ],
            dir: G.glyphFor('xbox','up'),
          };
        }""")
        check(g["detect"] == ["playstation", "deck", "nintendo", "xbox"],
              "the pad id picks the right glyph family", json.dumps(g["detect"]))
        ps = [f for f in g["fams"] if f[0] == "playstation"][0]
        check(ps[1] == "✕" and ps[2] == "◯",
              "a PlayStation player is told to press a PlayStation button",
              json.dumps(ps))

        # ══ Settings: a slider has to be adjustable, not just focusable ═════
        await page.evaluate("() => window.MM.ctx.scenes.current.root.querySelector('.ti-item') && null")
        opened = await page.evaluate("""async () => {
          const { openSettings } = await import('/game/src/ui/settings.js');
          openSettings(window.MM.ctx);
          return true;
        }""")
        await page.wait_for_selector(".mm-modal input[type=range]", timeout=8000)
        await page.wait_for_timeout(350)
        pre = await page.evaluate("""() => {
          const r = document.querySelector('.mm-modal input[type=range]');
          r.focus();
          return { v: Number(r.value), scoped: window.MM.ctx.navigator.root.classList.contains('mm-modal') };
        }""")
        check(pre["scoped"] is True,
              "a modal captures navigation, so the scene behind it cannot be driven")
        await tap(page, 15)                           # d-pad right
        await tap(page, 15)
        post = await page.evaluate("""() => ({
          v: Number(document.querySelector('.mm-modal input[type=range]').value),
          stillFocused: document.activeElement.type === 'range',
          saved: window.MM.Save.settings,
        })""")
        check(post["v"] > pre["v"] and post["stillFocused"] is True,
              "right on a slider changes the value instead of moving focus",
              f"{pre['v']} -> {post['v']}")
        check(post["saved"] is not None, "and the change reaches Save.settings")
        await page.evaluate("() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
        await page.wait_for_timeout(400)

        # ══ combat: the pad drives the hand the keyboard already drives ═════
        await page.evaluate(UNINSTALL)
        # `?combat` is not read by anything. It is here because navigating to the
        # same URL with only the HASH changed is a same-document navigation:
        # `main.js` never re-runs, the title scene stays up, and the wait below
        # times out on a combat screen that was never asked for.
        await page.goto(BASE + "?combat#scene=combat&seed=7&companion=bones",
                        wait_until="load", timeout=60000)
        await page.wait_for_function(
            f"!!({SCENE}) && {SCENE}.engine"
            " && document.querySelectorAll('.mm-hand__cards .mm-card').length > 0", timeout=25000)
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=20000)
        await page.wait_for_function(
            f"{SCENE} && !{SCENE}._draining && {SCENE}._q.length === 0", timeout=20000)
        await page.wait_for_function(f"{SCENE} && {SCENE}.hand && !{SCENE}.hand.warming", timeout=20000)
        await page.wait_for_timeout(500)
        await page.evaluate(INSTALL, "Steam Deck Controller")

        sel0 = await page.evaluate(f"() => {SCENE}.hand.selIdx")
        await tap(page, 15)                           # right
        await page.wait_for_timeout(200)
        sel1 = await page.evaluate(f"() => {SCENE}.hand.selIdx")
        check(sel1 != sel0 and sel1 >= 0,
              "in a Scuffle, right moves the selection along the hand",
              f"selIdx {sel0} -> {sel1}")

        await tap(page, 14)                           # left
        await page.wait_for_timeout(200)
        sel2 = await page.evaluate(f"() => {SCENE}.hand.selIdx")
        check(sel2 != sel1, "and left moves it back", f"selIdx {sel1} -> {sel2}")

        # X ends the turn — the same 'e' the keyboard sends.
        turn0 = await page.evaluate(f"() => {SCENE}.engine.turn")
        await tap(page, 2)                            # X
        try:
            await page.wait_for_function(
                f"!({SCENE}) || !{SCENE}.engine || {SCENE}.engine.over"
                f" || {SCENE}.me.ended || {SCENE}.engine.turn > {turn0}", timeout=25000)
            ended = True
        except Exception:                             # noqa: BLE001
            ended = False
        check(ended, "and X ends the turn", f"from turn {turn0}")

        # ══ the overlay stops the pad too ═══════════════════════════════════
        await page.evaluate("""async () => {
          const P = await import('/game/src/platform/index.js');
          window.__fake = P.installFakeHost({ steam: true });
          P.Platform.init({ bus: window.MM.bus });
          window.__fake.setOverlay(true);
        }""")
        await page.wait_for_timeout(150)
        await page.evaluate("() => { window.__padLog.length = 0; }")
        await page.evaluate(BTN, [15, True])
        await page.wait_for_timeout(400)
        await page.evaluate(BTN, [15, False])
        frozen = await page.evaluate("() => window.__padLog.length")
        check(frozen == 0,
              "no pad input is read while the Steam overlay is up",
              f"{frozen} action(s) leaked through")
        await page.evaluate("() => { window.__fake.setOverlay(false); }")
        await page.wait_for_timeout(200)
        await page.evaluate("() => { window.__padLog.length = 0; }")
        await tap(page, 15)
        thawed = await page.evaluate("() => window.__padLog.length")
        check(thawed >= 1, "and it comes back when the overlay closes", f"{thawed}")

        await page.evaluate("() => { window.__fake.uninstall(); }")
        await page.evaluate(UNINSTALL)

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
    ap.add_argument("--w", type=int, default=1280)
    ap.add_argument("--h", type=int, default=800)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
