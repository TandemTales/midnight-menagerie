"""Persistent-session driver for Midnight Menagerie playthrough 3.

ONE browser held open across an entire expedition, driven by a file queue so a
shell-per-tool-call agent can still keep state across scenes.

    python tests/playthrough3/play.py            # run in background; polls ./queue

Client side: write tests/playthrough3/queue/<n>.cmd.json  ->  read <n>.done.json
(use ./mm.py which does both and prints the result).

Command file: {"steps": [ ... ]}   each step is a string "op:arg" or "op":
  goto:URLFRAG        navigate to base + frag  (frag may be "" or "#scene=map")
  reload              location.reload()
  click:SEL           real mouse click on selector
  clickxy:X,Y         real mouse click at viewport coords
  hover:SEL
  key:KEY             keyboard press (Playwright key name)
  type:TEXT
  wait:SEC
  waitfor:SEL         wait for selector visible (10s)
  js:EXPR             fire-and-forget: returned promise NOT awaited
  jsawait:EXPR        awaited; result returned in log
  shot:NAME           screenshot -> shots/NAME.png
  strip:NAME,N,MS     N frames MS apart -> shots/NAME_f0..
  fps                 measure 1s rAF count
  text                dump visible body innerText (truncated)
  dom:SEL             outerHTML of first match (truncated)
  vis:SEL             visibility probe: exists/hidden/display/rect for ALL matches
  state               window.MM.state()
  size:WxH            resize viewport
  errclear            clear collected console errors
"""
import asyncio, json, os, sys, time, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(HERE, "queue")
SHOTS = os.path.join(ROOT, "shots")
BASE = "http://localhost:8777/game/index.html"
os.makedirs(QUEUE, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)

VIS_JS = """(sel)=>Array.from(document.querySelectorAll(sel)).map(el=>{
  const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
  return {tag:el.tagName, cls:el.className&&el.className.toString().slice(0,80),
    hidden:el.hidden, disabled:!!el.disabled, display:cs.display, vis:cs.visibility,
    op:cs.opacity, pe:cs.pointerEvents,
    rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
    shown: !el.hidden && cs.display!=='none' && cs.visibility!=='hidden' && +cs.opacity>0.01 && r.width>0 && r.height>0,
    text:(el.innerText||'').slice(0,120)};})"""


async def main():
    from playwright.async_api import async_playwright
    errors, logs = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = await browser.new_context(viewport={"width": 1600, "height": 900},
                                        device_scale_factor=1.0,
                                        reduced_motion="no-preference")
        page = await ctx.new_page()
        scene = {"v": "?"}

        def note(kind, txt):
            entry = f"[{scene['v']}][{kind}] {txt}"
            logs.append(entry)
            if kind in ("error", "pageerror"):
                errors.append(entry)

        page.on("console", lambda m: note(m.type, m.text[:400]))
        page.on("pageerror", lambda e: note("pageerror", str(e)[:400]))
        await page.goto(BASE, wait_until="load", timeout=45000)
        print("READY", flush=True)

        seen = set()
        while True:
            files = sorted(glob.glob(os.path.join(QUEUE, "*.cmd.json")),
                           key=lambda f: os.path.getmtime(f))
            todo = [f for f in files if f not in seen]
            if not todo:
                await asyncio.sleep(0.15)
                continue
            f = todo[0]
            seen.add(f)
            try:
                cmd = json.loads(open(f, encoding="utf-8").read())
            except Exception as e:
                open(f.replace(".cmd.json", ".done.json"), "w").write(json.dumps({"err": str(e)}))
                continue
            out = []
            n0 = len(logs)
            for step in cmd.get("steps", []):
                op, _, arg = str(step).partition(":")
                op = op.strip()
                try:
                    # keep the scene tag fresh so console lines are attributable
                    try:
                        scene["v"] = await page.evaluate(
                            "window.MM&&window.MM.state?(window.MM.state().scene||'?'):'boot'")
                    except Exception:
                        pass
                    if op == "goto":
                        await page.goto(BASE + arg, wait_until="load", timeout=45000)
                    elif op == "reload":
                        await page.reload(wait_until="load", timeout=45000)
                    elif op == "click":
                        await page.click(arg, timeout=8000)
                    elif op == "clickxy":
                        x, y = [float(v) for v in arg.split(",")]
                        await page.mouse.click(x, y)
                    elif op == "hover":
                        await page.hover(arg, timeout=8000)
                    elif op == "key":
                        await page.keyboard.press(arg)
                    elif op == "type":
                        await page.keyboard.type(arg)
                    elif op == "wait":
                        await page.wait_for_timeout(int(float(arg) * 1000))
                    elif op == "waitfor":
                        await page.wait_for_selector(arg, timeout=10000, state="visible")
                    elif op == "js":
                        await page.evaluate(f"(()=>{{ ({arg}); return 1; }})()")
                    elif op == "jsawait":
                        r = await page.evaluate(arg)
                        out.append({"step": step[:80], "r": str(r)[:3000]})
                    elif op == "shot":
                        await page.screenshot(path=os.path.join(SHOTS, arg + ".png"),
                                              animations="allow")
                        out.append({"shot": arg})
                    elif op == "strip":
                        parts = arg.split(",")
                        nm = parts[0]; n = int(parts[1]); ms = int(parts[2]) if len(parts) > 2 else 120
                        for i in range(n):
                            await page.screenshot(path=os.path.join(SHOTS, f"{nm}_f{i}.png"),
                                                  animations="allow")
                            await page.wait_for_timeout(ms)
                        out.append({"strip": nm, "n": n})
                    elif op == "fps":
                        r = await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
                          await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
                          return {fps:n, mem:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null)}})()""")
                        out.append({"fps": r})
                    elif op == "text":
                        r = await page.evaluate("document.body.innerText")
                        out.append({"text": r[:4000]})
                    elif op == "dom":
                        r = await page.evaluate("(s)=>{const e=document.querySelector(s);return e?e.outerHTML:'(none)'}", arg)
                        out.append({"dom": r[:3000]})
                    elif op == "vis":
                        r = await page.evaluate(VIS_JS, arg)
                        out.append({"vis": arg, "els": r})
                    elif op == "state":
                        r = await page.evaluate("window.MM?JSON.stringify(window.MM.state()):'no MM'")
                        out.append({"state": r[:3000]})
                    elif op == "size":
                        w, h = arg.lower().split("x")
                        await ctx.pages[0].set_viewport_size({"width": int(w), "height": int(h)})
                    elif op == "errclear":
                        errors.clear()
                    else:
                        out.append({"err": "unknown op " + op})
                    if op not in ("wait", "strip"):
                        await page.wait_for_timeout(120)
                except Exception as e:
                    out.append({"step": step[:120], "err": str(e)[:400]})
            res = {"out": out, "new_logs": logs[n0:][:80], "errors": errors[-20:],
                   "nerr": len(errors)}
            open(f.replace(".cmd.json", ".done.json"), "w", encoding="utf-8").write(
                json.dumps(res, indent=1))
            print("done", os.path.basename(f), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
