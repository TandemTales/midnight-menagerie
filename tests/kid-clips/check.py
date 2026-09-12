"""The Kid on the board swings, flinches and falls.  OWNER: frontend.

    python tests/kid-clips/check.py [--kid maya] [--companion bones]

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
The eight Kids had one clip each for months -- a still, dressed as a one-frame
`idle` -- and the code that plays a body clip drives the COMPANION's player.
When the Kid sheets landed (idle, attack, hurt, defeat), everything about them
was correct except that nothing ever asked them to play: `PlayerView.playClip`
and the rig's `windup`/`flinch` all go to `this.sprite`. A Kid animating only
her idle looks exactly like a Kid whose clips were never built, and no gate
could tell the two apart -- `tests/sprite-triggers` reads the mechanic TABLE,
and idle/attack/hurt/defeat are universal, so they are exempt there by design.

So this drives the real scene and asks the Kid's own `ClipPlayer` what it is
playing after each beat:

  swing    `windup()` plays her `attack`, whatever body clip the Companion took
  recoil   an unblocked `flinch()` plays her `hurt`, and a BLOCKED one does not
  fall     `playClip('defeat')` reaches her, and her defeat HOLDS its last pose

It also proves she is animating at all (four clips, not the one-frame still) and
that she is built at her own figure height -- `KID_RIG_H` is 230 and a Companion
builds at 128, so a Kid built to the Companion's target would ship at half the
resolution of the still she replaced. Compared against the manifest rather than
a typed 256, so re-tuning the pipeline cannot leave this gate asserting a number
nobody uses any more.

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

KID_STATE = """
() => {
  const h = window.MM.ctx.scenes.current?.hero;
  const k = h && h.kidSprite;
  if (!k) return { has: false };
  const clips = Object.keys(k.clips || {});
  return {
    has: true, clips, name: k.name, unit: k.unit,
    frames: (k.clips?.idle || {}).frames || 0,
    hold: !!(k.clips?.defeat || {}).hold,
    companionClip: h.sprite ? h.sprite.name : null,
  };
}
"""


async def main(a):
    from playwright.async_api import async_playwright
    passes, fails, errors = [], [], []

    def check(ok, what, detail=""):
        (passes if ok else fails).append(what + (" - " + detail if detail else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1400, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(f"{BASE}#scene=combat&seed=7&companion={a.companion}&kid={a.kid}",
                        wait_until="load", timeout=45000)
        await page.wait_for_function(f"{SCENE} && {SCENE}.hero", timeout=30000)
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=30000)
        # Her atlases are fetched on mount; `ready` resolves once they are decoded.
        await page.evaluate("() => window.MM.ctx.scenes.current.hero.kidSprite?.ready")
        await page.wait_for_timeout(400)

        manifest = await page.evaluate(
            "async () => (await (await fetch('/game/assets/sprites/index.json')).json())")
        st = await page.evaluate(KID_STATE)

        check(st.get("has"), f"{a.kid} has her own ClipPlayer on the board")
        if not st.get("has"):
            print("  the hero view has no kidSprite - nothing else can be asked", flush=True)
            await browser.close()
            return 1

        want = {"idle", "attack", "hurt", "defeat"}
        check(want <= set(st["clips"]), "she is animating, not standing in her still",
              "clips: " + ", ".join(sorted(st["clips"])))
        check(st["frames"] > 1, "her idle is a real clip", f"{st['frames']} frames")

        companion_unit = manifest.get("targetContentH") or 128
        check(st["unit"] > companion_unit,
              "she is built at her own figure height, not the Companion's",
              f"unit {st['unit']} against the Companion default {companion_unit}")
        check(a.kid in (manifest.get("kids") or []), "and the manifest names her a Kid",
              ", ".join(manifest.get("kids") or []))

        # ── the swing ───────────────────────────────────────────────────────
        await page.evaluate("() => window.MM.ctx.scenes.current.hero.kidSprite.play('idle')")
        await page.evaluate("async () => { await window.MM.ctx.scenes.current.hero.windup(); }")
        st = await page.evaluate(KID_STATE)
        check(st["name"] == "attack", "windup swings the Kid, not only the Companion",
              f"kid on {st['name']}, Companion on {st['companionClip']}")

        # ── the recoil, and the control ─────────────────────────────────────
        await page.evaluate("() => window.MM.ctx.scenes.current.hero.kidSprite.play('idle')")
        await page.evaluate("() => window.MM.ctx.scenes.current.hero.flinch(9, true)")
        st = await page.evaluate(KID_STATE)
        check(st["name"] == "idle", "CONTROL: a BLOCKED hit is a clank and does not recoil her",
              f"kid on {st['name']}")

        await page.evaluate("() => window.MM.ctx.scenes.current.hero.flinch(9, false)")
        st = await page.evaluate(KID_STATE)
        check(st["name"] == "hurt", "an unblocked hit plays her hit reaction", f"kid on {st['name']}")

        # ── the fall ────────────────────────────────────────────────────────
        # `defeat` is not warmed on mount -- idle, attack and hurt are, because
        # those are the beats a fight reaches soonest -- so a cold atlas makes
        # her fall LATE rather than blank (`ClipPlayer.play` keeps drawing and
        # switches when it lands). The banner runs 1.1s, so late has to mean
        # milliseconds: wait for the switch, and fail if it never comes.
        await page.evaluate("() => window.MM.ctx.scenes.current.hero.playClip('defeat')")
        fell = True
        try:
            await page.wait_for_function(
                "() => window.MM.ctx.scenes.current.hero.kidSprite.name === 'defeat'",
                timeout=1100)
        except Exception:
            fell = False
        st = await page.evaluate(KID_STATE)
        check(fell, "the Companion's defeat takes the Kid down with it, inside the banner",
              f"kid on {st['name']}")
        check(st["hold"], "and her defeat holds its last pose instead of standing back up")

        await browser.close()

    for line in passes:
        print("  PASS  " + line, flush=True)
    for line in fails:
        print("  FAIL  " + line, flush=True)
    bad = [e for e in errors if "PAGEERROR" in e or "Failed to load" in e]
    for line in bad[:8]:
        print("  CONSOLE  " + line, flush=True)
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed, {len(bad)} console errors", flush=True)
    return 1 if (fails or bad) else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kid", default="maya")
    ap.add_argument("--companion", default="bones")
    sys.exit(asyncio.run(main(ap.parse_args())))
