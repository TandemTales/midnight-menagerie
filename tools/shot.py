"""Screenshot / drive the running game with Playwright.

This is how every critic agent SEES the real game. Never trust a builder's summary.

    python tools/shot.py <name> [--scene combat] [--seed 42] [--companion marmalade]
                                [--wait 2.5] [--w 1600] [--h 900] [--script "..."]
                                [--steps "click:#end-turn|wait:0.8|hover:.card"]
                                [--full] [--strip N]

Writes shots/<name>.png (and shots/<name>.console.txt on JS errors, always a
shots/<name>.state.json with window.MM.state()).  Exit code 1 if the page threw.

--script  runs arbitrary JS in the page BEFORE the screenshot (after --wait).
--steps   pipe-separated actions: click:SEL | hover:SEL | key:KEY | wait:SEC |
          drag:SELA>SELB | js:EXPR | jsawait:EXPR | shot:NAME
          js:      fire-and-forget — a returned promise is deliberately NOT awaited, so
                   animation kicked off here is still running for the following frames.
          jsawait: blocks until the returned promise settles. Using js: where you meant
                   jsawait: is harmless; using jsawait: (or plain --script) to start an
                   animation makes every later strip frame land on the END state, which
                   reads as "the animation is instant". This has already fooled one review.
--strip N captures N frames 120ms apart into shots/<name>_f0..fN.png so motion
          can actually be judged (card play arcs, hit reactions, transitions).
"""
import asyncio, sys, os, json, argparse, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:8777/game/index.html"


async def run(a):
    from playwright.async_api import async_playwright
    errors, logs = [], []
    frag = []
    for k in ("scene", "seed", "companion", "kid", "encounter", "region", "node"):
        v = getattr(a, k, None)
        if v:
            frag.append(f"{k}={v}")
    if a.hash:
        frag.append(a.hash)
    url = BASE + ("#" + "&".join(frag) if frag else "")

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            viewport={"width": a.w, "height": a.h},
            device_scale_factor=a.dpr, reduced_motion="no-preference",
        )).new_page()

        page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(url, wait_until="load", timeout=45000)
        await page.wait_for_timeout(int(a.wait * 1000))

        async def snap(name, full=False):
            path = os.path.join(SHOTS, f"{name}.png")
            await page.screenshot(path=path, full_page=full, animations="allow")
            print("shot:", os.path.relpath(path, ROOT))
            return path

        if a.script:
            try:
                # NOTE: --script DOES await a returned promise. See the --steps js: note above.
                await page.evaluate(a.script)
                await page.wait_for_timeout(600)
            except Exception as e:
                errors.append("SCRIPT " + str(e))

        for step in [s for s in (a.steps or "").split("|") if s.strip()]:
            op, _, arg = step.partition(":")
            op = op.strip()
            try:
                if op == "click":
                    await page.click(arg, timeout=6000)
                elif op == "hover":
                    await page.hover(arg, timeout=6000)
                elif op == "key":
                    await page.keyboard.press(arg)
                elif op == "wait":
                    await page.wait_for_timeout(int(float(arg) * 1000))
                elif op == "js":
                    # Wrap so a returned promise is NOT awaited. page.evaluate awaits any
                    # thenable, which would block until the animation finished and make every
                    # subsequent strip frame land on the end state. Use "jsawait:" if you
                    # genuinely want to wait.
                    await page.evaluate(f"(()=>{{ ({arg}); return 1; }})()")
                elif op == "jsawait":
                    await page.evaluate(arg)
                elif op == "shot":
                    await snap(arg)
                elif op == "drag":
                    sa, _, sb = arg.partition(">")
                    ea = await page.wait_for_selector(sa, timeout=6000)
                    eb = await page.wait_for_selector(sb, timeout=6000)
                    ba, bb = await ea.bounding_box(), await eb.bounding_box()
                    await page.mouse.move(ba["x"] + ba["width"] / 2, ba["y"] + ba["height"] / 2)
                    await page.mouse.down()
                    for i in range(1, 13):
                        t = i / 12
                        await page.mouse.move(
                            ba["x"] + ba["width"] / 2 + (bb["x"] + bb["width"] / 2 - ba["x"] - ba["width"] / 2) * t,
                            ba["y"] + ba["height"] / 2 + (bb["y"] + bb["height"] / 2 - ba["y"] - ba["height"] / 2) * t)
                        await page.wait_for_timeout(16)
                    await page.mouse.up()
                else:
                    errors.append("unknown step " + op)
                await page.wait_for_timeout(180)
            except Exception as e:
                errors.append(f"STEP {step}: {e}")

        if a.strip:
            for i in range(a.strip):
                await snap(f"{a.name}_f{i}")
                await page.wait_for_timeout(int(a.interval * 1000))
        else:
            await snap(a.name, a.full)

        try:
            state = await page.evaluate("window.MM ? JSON.stringify(window.MM.state()) : 'no MM'")
        except Exception as e:
            state = "state error: " + str(e)
        try:
            perf = await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
              await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
              return {fps:n, mem:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null)}})()""")
        except Exception:
            perf = {}
        try:
            gl = await page.evaluate("""(()=>{const c=document.createElement('canvas');
              const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'none';
              const d=g.getExtension('WEBGL_debug_renderer_info');
              return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()""")
        except Exception:
            gl = "?"
        perf["gl"] = gl
        perf["software"] = "SwiftShader" in str(gl)

        open(os.path.join(SHOTS, f"{a.name}.state.json"), "w", encoding="utf-8").write(
            json.dumps({"url": url, "state": state, "perf": perf,
                        "errors": errors[:40], "logs": logs[-60:]}, indent=1))
        await browser.close()

    if errors:
        open(os.path.join(SHOTS, f"{a.name}.console.txt"), "w", encoding="utf-8").write("\n".join(logs))
        print("JS ERRORS:", file=sys.stderr)
        for e in errors[:20]:
            print("  " + e[:400], file=sys.stderr)
    soft = " [SOFTWARE RASTERISER - fps not representative]" if perf.get("software") else ""
    print("fps:", perf.get("fps"), soft, "| gl:", str(perf.get("gl"))[:70])
    print("state:", str(state)[:280])
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--scene"); ap.add_argument("--seed"); ap.add_argument("--companion")
    ap.add_argument("--kid"); ap.add_argument("--encounter"); ap.add_argument("--region")
    ap.add_argument("--node"); ap.add_argument("--hash")
    ap.add_argument("--wait", type=float, default=2.2)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--dpr", type=float, default=1.0)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--script"); ap.add_argument("--steps")
    ap.add_argument("--strip", type=int, default=0)
    ap.add_argument("--interval", type=float, default=0.12)
    sys.exit(asyncio.run(run(ap.parse_args())))
