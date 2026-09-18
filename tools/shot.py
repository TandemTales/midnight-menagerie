"""Screenshot / drive the running game with Playwright.

This is how every critic agent SEES the real game. Never trust a builder's summary.

    python tools/shot.py <name> [--scene combat] [--seed 42] [--companion marmalade]
                                [--wait 2.5] [--w 1600] [--h 900] [--script "..."]
                                [--port 8777]   (or MM_PORT; a worktree serves itself)
                                [--steps "click:#end-turn|wait:0.8|hover:.card"]
                                [--full] [--strip N]

Writes shots/<name>.png (and shots/<name>.console.txt on JS errors, always a
shots/<name>.state.json with window.MM.state()).  Exit code 1 if the page threw.

**--wait is the settle AFTER the 3D stage has warmed, not after load.** The
stage renders nothing while it is linking shaders (`core/renderer.js` sets
`_warming` before its first await on purpose), and on this GPU that is about ten
seconds from cold — so `--wait 9` used to produce a BLACK VOID with the HUD
floating on it, which is what critics were judging combat and the map from. It
waits for `stage.warmStage === 'done'` first now, and says so if that never
happens. `--no-warm-wait` restores the old behaviour, for capturing the warm-up
itself. A player never sees this: the warm-up finishes while they read the title
menu, and walking into combat from there is lit in four seconds.

--script  runs arbitrary JS in the page BEFORE the screenshot (after --wait).
          `--script @tools/shot-scripts/x.js` reads it from a file, repo-relative.
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
    url = BASE.replace(":8777/", ":%d/" % a.port) + ("#" + "&".join(frag) if frag else "")

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

        # ── wait for the STAGE, and only then for --wait ─────────────────────
        # `--wait` alone is a number of milliseconds racing a cold boot, which is
        # the trap this project has written down three times. The 3D stage
        # renders NOTHING while it is warming — `core/renderer.js` sets
        # `_warming` before its first await deliberately, so frame 1 cannot pay
        # the whole shader-link cost — and on this GPU phase A takes about ten
        # seconds cold. Every deep-linked combat shot at the documented
        # `--wait 9` was therefore a BLACK VOID with the HUD floating on it, and
        # that is what critics have been judging the game from.
        #
        # A real player never sees it: they boot to the title and the warm-up
        # finishes while they read the menu — walking into combat from a settled
        # title is lit in four seconds. So this is a TOOL problem, and the fix is
        # the one the notes keep prescribing: wait for a signal, not a number.
        # `warmStage` goes materials -> post -> done.
        warm = None
        if not a.no_warm_wait:
            try:
                await page.wait_for_function(
                    "() => { const s = window.MM && window.MM.ctx && window.MM.ctx.stage;"
                    "        return !s || s.warmStage === 'done'; }",
                    timeout=int(a.warm_timeout * 1000))
                warm = await page.evaluate(
                    "() => { const s = window.MM && window.MM.ctx && window.MM.ctx.stage;"
                    "        return s ? (s._warmed || 0) : null; }")
            except Exception:
                # Say so rather than shooting a half-warm stage in silence.
                print("warn: the stage never finished warming within "
                      f"{a.warm_timeout}s — this shot may be dark", flush=True)
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

        # -- IS THIS CAPTURE VOID? ------------------------------------------
        # A capture whose page never got a GPU CONTEXT is not evidence of
        # anything -- and it looks exactly like a catastrophic art regression:
        # a blank white frame with the scene label still on it.
        #
        # This cost most of an evening. A seventeen-room sweep came back with
        # every frame dead and VALIDATE_STATUS false on all seventeen, which
        # reads as "the shader is broken". It was not. The same rooms captured
        # singly were byte-identical to the commit before, and a six-capture
        # trial at three commits -- including the one BEFORE the round under
        # suspicion -- failed 4, 5 and 5 of 6. This machine's GPU process
        # degrades across a few hundred Chromium launches in one session and
        # eventually cannot create a context at all; it recovers when left to
        # idle.
        #
        # The signature is unmistakable once you know it: gl comes back "none",
        # and the console errors name three.js's own MeshStandardMaterial as
        # well as ours. If OUR program were over a hardware limit, three's
        # stock material would still link.
        #
        # So say so loudly, and exit 2, so a caller can tell a void capture
        # from a real page error.
        void = (not gl) or str(gl) in ("none", "?", "None")
        open(os.path.join(SHOTS, f"{a.name}.state.json"), "w", encoding="utf-8").write(
            json.dumps({"url": url, "state": state, "perf": perf,
                        "void": bool(void), "errors": errors[:40], "logs": logs[-60:]}, indent=1))
        await browser.close()

    if errors:
        open(os.path.join(SHOTS, f"{a.name}.console.txt"), "w", encoding="utf-8").write("\n".join(logs))
        print("JS ERRORS:", file=sys.stderr)
        for e in errors[:20]:
            print("  " + e[:400], file=sys.stderr)
    soft = " [SOFTWARE RASTERISER - fps not representative]" if perf.get("software") else ""
    print("fps:", perf.get("fps"), soft, "| gl:", str(perf.get("gl"))[:70])
    print("state:", str(state)[:280])
    if void:
        print("VOID CAPTURE: the page never got a GPU context (gl=%s)."
              % perf.get("gl"), file=sys.stderr)
        print("  This PNG is a blank frame and is NOT evidence that the art", file=sys.stderr)
        print("  regressed. Leave the machine to idle, or reboot, and re-take it.", file=sys.stderr)
        print("  Exit 2 means VOID; exit 1 means the page threw.", file=sys.stderr)
        return 2
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--scene"); ap.add_argument("--seed"); ap.add_argument("--companion")
    ap.add_argument("--kid"); ap.add_argument("--encounter"); ap.add_argument("--region")
    ap.add_argument("--node"); ap.add_argument("--hash")
    ap.add_argument("--port", type=int, default=int(os.environ.get("MM_PORT") or 8777),
                    help="dev server port: a build in its own worktree runs its own server")
    ap.add_argument("--wait", type=float, default=2.2,
                    help="settle time AFTER the 3D stage has finished warming")
    ap.add_argument("--warm-timeout", type=float, default=40,
                    help="how long to give the stage's shader warm-up")
    ap.add_argument("--no-warm-wait", action="store_true",
                    help="shoot without waiting for the stage — for capturing "
                         "the warm-up itself, or a page that has no stage")
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--dpr", type=float, default=1.0)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--script"); ap.add_argument("--steps")
    ap.add_argument("--strip", type=int, default=0)
    ap.add_argument("--interval", type=float, default=0.12)
    args = ap.parse_args()
    if args.script and args.script.startswith("@"):
        # A multi-line setup is a file, not a shell-quoting exercise.
        with open(os.path.join(ROOT, args.script[1:]), encoding="utf-8") as f:
            args.script = f.read()
    sys.exit(asyncio.run(run(args)))
