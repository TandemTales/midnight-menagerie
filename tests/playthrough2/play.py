"""Persistent-session Playwright driver for a full Midnight Menagerie expedition.

ONE browser, held open across every scene, driven by a command queue file so an
agent can make real decisions between steps (most integration bugs only show up
when state carries across scenes).

Run once in the background:

    python tests/playthrough2/play.py --w 1600 --h 900

It creates a session dir (default tests/playthrough2/_session/) with:
    cmds.jsonl   append one JSON command per line
    out/<n>.json result for command n (0-based line index)
    driver.log   driver-side chatter

Commands (JSON objects, one per line):
    {"op":"goto","url":"..."}            navigate (full load)
    {"op":"reload"}                      reload the page (tests quit/resume)
    {"op":"click","sel":"..."}           real mouse click on a selector
    {"op":"clickxy","x":1,"y":2}
    {"op":"hover","sel":"..."}
    {"op":"key","key":"Enter"}
    {"op":"type","text":"..."}
    {"op":"wait","s":0.5}
    {"op":"shot","name":"p2-foo"}        -> shots/p2-foo.png
    {"op":"strip","name":"p2-foo","n":8,"interval":0.09}
    {"op":"js","expr":"..."}             fire-and-forget: promise NOT awaited
    {"op":"jsawait","expr":"..."}        awaits a returned promise
    {"op":"text"}                        visible innerText of body
    {"op":"dom","sel":"body","depth":3}  compact element outline
    {"op":"state"}                       window.MM.state()
    {"op":"fps"}                         1s rAF count
    {"op":"errors"}                      console errors seen so far (and clears)
    {"op":"logs","n":40}
    {"op":"resize","w":1920,"h":1080}
    {"op":"drag","from":"selA","to":"selB"}   weighted 12-step drag
    {"op":"dragxy","x1":..,"y1":..,"x2":..,"y2":..}
    {"op":"box","sel":"..."}             bounding boxes of all matches
    {"op":"quit"}

The `js` / `jsawait` distinction matters exactly as it does in tools/shot.py:
using jsawait to *start* an animation makes every later strip frame land on the
end state, which reads as "the animation is instant".
"""
import asyncio, json, os, sys, time, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
BASE = "http://localhost:8777/game/index.html"
os.makedirs(SHOTS, exist_ok=True)

DOM_JS = """(args) => {
  const [sel, depth] = args;
  const root = document.querySelector(sel) || document.body;
  const out = [];
  const walk = (el, d, pad) => {
    if (d > depth) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    let id = el.tagName.toLowerCase();
    if (el.id) id += '#' + el.id;
    if (el.className && typeof el.className === 'string')
      id += '.' + el.className.trim().split(/\\s+/).slice(0,4).join('.');
    const kids = [...el.children];
    let txt = '';
    if (!kids.length) txt = (el.innerText || el.textContent || '').trim().slice(0,120).replace(/\\s+/g,' ');
    const r = el.getBoundingClientRect();
    out.push(pad + id + (txt ? '  "' + txt + '"' : '') +
      '  [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']');
    kids.forEach(k => walk(k, d + 1, pad + '  '));
  };
  walk(root, 0, '');
  return out.join('\\n');
}"""


async def main(a):
    from playwright.async_api import async_playwright
    sess = a.session
    os.makedirs(os.path.join(sess, "out"), exist_ok=True)
    cmds = os.path.join(sess, "cmds.jsonl")
    open(cmds, "w").close()
    log = open(os.path.join(sess, "driver.log"), "w", encoding="utf-8", buffering=1)

    errors, logs = [], []

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = await browser.new_context(
            viewport={"width": a.w, "height": a.h},
            device_scale_factor=1.0, reduced_motion="no-preference")
        page = await ctx.new_page()

        def on_console(m):
            logs.append(f"[{m.type}] {m.text}")
            if m.type == "error":
                errors.append(f"{m.text}")
        page.on("console", on_console)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("requestfailed", lambda r: errors.append(f"REQFAIL {r.url} {r.failure}"))

        await page.goto(BASE, wait_until="load", timeout=45000)
        await page.wait_for_timeout(1500)
        log.write("booted\n")

        async def snap(name, full=False):
            path = os.path.join(SHOTS, f"{name}.png")
            await page.screenshot(path=path, full_page=full, animations="allow")
            return os.path.relpath(path, ROOT)

        async def do(c):
            op = c.get("op")
            if op == "goto":
                await page.goto(c["url"], wait_until="load", timeout=45000)
                await page.wait_for_timeout(int(c.get("s", 1.5) * 1000)); return "ok"
            if op == "reload":
                await page.reload(wait_until="load", timeout=45000)
                await page.wait_for_timeout(int(c.get("s", 2.0) * 1000)); return "ok"
            if op == "click":
                await page.click(c["sel"], timeout=c.get("timeout", 8000)); return "ok"
            if op == "clickxy":
                await page.mouse.click(c["x"], c["y"]); return "ok"
            if op == "hover":
                await page.hover(c["sel"], timeout=8000); return "ok"
            if op == "hoverxy":
                await page.mouse.move(c["x"], c["y"]); return "ok"
            if op == "key":
                await page.keyboard.press(c["key"]); return "ok"
            if op == "type":
                await page.keyboard.type(c["text"]); return "ok"
            if op == "wait":
                await page.wait_for_timeout(int(c["s"] * 1000)); return "ok"
            if op == "shot":
                return await snap(c["name"], c.get("full", False))
            if op == "strip":
                n, iv, names = c.get("n", 8), c.get("interval", 0.09), []
                for i in range(n):
                    names.append(await snap(f"{c['name']}_f{i}"))
                    await page.wait_for_timeout(int(iv * 1000))
                return names
            if op == "js":
                return await page.evaluate(f"(()=>{{ ({c['expr']}); return 'fired'; }})()")
            if op == "jsawait":
                return await page.evaluate(c["expr"])
            if op == "text":
                return await page.evaluate(
                    "(()=>{const b=document.body;return (b.innerText||'').trim()})()")
            if op == "dom":
                return await page.evaluate(DOM_JS, [c.get("sel", "body"), c.get("depth", 4)])
            if op == "state":
                return await page.evaluate(
                    "window.MM ? JSON.stringify(window.MM.state()) : 'no MM'")
            if op == "fps":
                return await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
                  await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
                  return {fps:n, mem:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null),
                          nodes:document.getElementsByTagName('*').length}})()""")
            if op == "errors":
                e = list(errors); errors.clear(); return e
            if op == "logs":
                return logs[-c.get("n", 40):]
            if op == "resize":
                await page.set_viewport_size({"width": c["w"], "height": c["h"]})
                await page.wait_for_timeout(600); return "ok"
            if op == "box":
                return await page.evaluate(
                    """(sel)=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();
                       return {t:(e.innerText||'').trim().slice(0,60),x:Math.round(r.x),y:Math.round(r.y),
                               w:Math.round(r.width),h:Math.round(r.height),
                               cls:(typeof e.className==='string'?e.className:'')}})""", c["sel"])
            if op == "drag":
                ea = await page.wait_for_selector(c["from"], timeout=8000)
                eb = await page.wait_for_selector(c["to"], timeout=8000)
                ba, bb = await ea.bounding_box(), await eb.bounding_box()
                return await dragxy(ba["x"] + ba["width"] / 2, ba["y"] + ba["height"] / 2,
                                    bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2,
                                    c.get("steps", 14))
            if op == "dragxy":
                return await dragxy(c["x1"], c["y1"], c["x2"], c["y2"], c.get("steps", 14))
            if op == "dragshot":
                # start a drag, hold, shoot mid-gesture, then finish
                await page.mouse.move(c["x1"], c["y1"])
                await page.mouse.down()
                for i in range(1, 8):
                    t = i / 7
                    await page.mouse.move(c["x1"] + (c["x2"] - c["x1"]) * t,
                                          c["y1"] + (c["y2"] - c["y1"]) * t)
                    await page.wait_for_timeout(20)
                mid = await snap(c["name"])
                await page.wait_for_timeout(150)
                mid2 = await snap(c["name"] + "_held")
                if c.get("release", True):
                    await page.mouse.up()
                return [mid, mid2]
            if op == "quit":
                return "bye"
            return "unknown op " + str(op)

        async def dragxy(x1, y1, x2, y2, steps):
            await page.mouse.move(x1, y1)
            await page.wait_for_timeout(60)
            await page.mouse.down()
            for i in range(1, steps + 1):
                t = i / steps
                await page.mouse.move(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
                await page.wait_for_timeout(16)
            await page.wait_for_timeout(60)
            await page.mouse.up()
            return "ok"

        done = 0
        idle = 0
        while True:
            try:
                lines = open(cmds, encoding="utf-8").read().splitlines()
            except FileNotFoundError:
                lines = []
            if done >= len(lines):
                idle += 1
                if idle > 6000:  # ~30 min with nothing to do
                    break
                await page.wait_for_timeout(300)
                continue
            idle = 0
            line = lines[done].strip()
            outp = os.path.join(sess, "out", f"{done}.json")
            res, err = None, None
            if line:
                try:
                    c = json.loads(line)
                except Exception as e:
                    c, err = {}, f"badjson {e}"
                if err is None:
                    t0 = time.time()
                    try:
                        res = await do(c)
                    except Exception as e:
                        err = f"{type(e).__name__}: {e}"
                    log.write(f"{done} {line[:160]} -> {str(res)[:120]} err={err} "
                              f"({time.time()-t0:.2f}s)\n")
            payload = {"i": done, "cmd": line, "result": res, "error": err,
                       "console_errors": list(errors)}
            tmp = outp + ".tmp"
            open(tmp, "w", encoding="utf-8").write(json.dumps(payload, indent=1, default=str))
            os.replace(tmp, outp)
            done += 1
            if line and json.loads(line).get("op") == "quit":
                break

        await browser.close()
    log.write("closed\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--session", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "_session"))
    asyncio.run(main(ap.parse_args()))
