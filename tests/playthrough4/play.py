"""Persistent-session driver for a full Midnight Menagerie expedition.

Holds ONE Chromium page open across an entire run so cross-scene state bugs can
surface. Listens on http://127.0.0.1:8899 and executes newline-delimited step
programs sent as the POST body, same grammar as tools/shot.py --steps plus a few
extras.

Start:   python tests/playthrough4/play.py            (run in background)
Drive:   curl -s --data-binary @cmds.txt http://127.0.0.1:8899/cmd

Steps (pipe- or newline-separated):
  goto:URLFRAG        navigate to index.html#FRAG (fresh load, same browser)
  reload              location.reload()
  click:SEL           real mouse click on selector
  clickxy:X,Y         real mouse click at viewport coords
  clicktext:TEXT      click first visible element whose text == TEXT
  hover:SEL           real hover
  key:KEY             keyboard press
  wait:SEC
  js:EXPR             fire-and-forget (promise NOT awaited)
  jsawait:EXPR        awaited
  eval:EXPR           awaited, value returned in the reply under "eval"
  shot:NAME           screenshot -> shots/NAME.png
  strip:NAME,N,MS     N frames MS apart -> shots/NAME_f0..png
  drag:SELA>SELB      weighted 12-step drag
  dragxy:SEL>X,Y      drag selector to viewport coords
  dom                 dump condensed interactive DOM into reply
  text                dump body innerText into reply
  fps                 measure rAF frames in 1s
  state               window.MM.state()
Every reply includes new console output and any errors since the last call.
"""
import asyncio, json, os, sys, traceback

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:8777/game/index.html"
PORT = 8899

LOGS = []
ERRORS = []
SEEN_SCENE = []


DOM_JS = r"""
(() => {
  const out = [];
  const seen = new Set();
  const sel = 'button,[role=button],a,input,select,textarea,[tabindex],.card,.node,.mm-node,[data-node],[data-uid],[data-card],[onclick],[class*=btn],[class*=Btn],[class*=choice],[class*=option]';
  document.querySelectorAll(sel).forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return;
    let path = e.tagName.toLowerCase();
    if (e.id) path += '#' + e.id;
    if (e.className && typeof e.className === 'string')
      path += '.' + e.className.trim().split(/\s+/).slice(0,3).join('.');
    const key = path + '|' + Math.round(r.x) + ',' + Math.round(r.y);
    if (seen.has(key)) return; seen.add(key);
    const attrs = {};
    for (const a of e.attributes) if (/^data-|^aria-|^disabled$/.test(a.name)) attrs[a.name] = a.value;
    out.push({
      s: path,
      xy: [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)],
      wh: [Math.round(r.width), Math.round(r.height)],
      t: (e.innerText || e.value || '').replace(/\s+/g,' ').trim().slice(0,90),
      a: attrs,
    });
  });
  return out;
})()
"""


async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = await browser.new_context(
            viewport={"width": int(os.environ.get("MMW","1600")), "height": int(os.environ.get("MMH","900"))}, device_scale_factor=1.0,
            reduced_motion="no-preference")
        # Tag every console message + uncaught error with the scene it fired in.
        # Done from an init script (not a game file) so attribution survives reloads.
        await ctx.add_init_script("""
          (() => {
            const sc = () => { try { return (window.MM && window.MM.state && window.MM.state().scene) || '?'; }
                               catch(e){ return '?'; } };
            for (const k of ['error','warn','log']) {
              const o = console[k].bind(console);
              console[k] = (...a) => o('<scene:' + sc() + '>', ...a);
            }
            window.addEventListener('error', e =>
              console.error('UNCAUGHT', e.message, e.filename + ':' + e.lineno));
            window.addEventListener('unhandledrejection', e =>
              console.error('UNHANDLED_REJECTION', String(e.reason && e.reason.stack || e.reason)));
          })();
        """)
        page = await ctx.new_page()
        page.on("console", lambda m: (LOGS.append(f"[{m.type}] {m.text}"),
                                      ERRORS.append(f"[{scene_now()}] {m.text}") if m.type == "error" else None))
        page.on("pageerror", lambda e: ERRORS.append(f"[{scene_now()}] PAGEERROR {e}"))
        await page.goto(BASE, wait_until="load", timeout=45000)
        await page.wait_for_timeout(1500)

        async def snap(name, full=False):
            path = os.path.join(SHOTS, f"{name}.png")
            await page.screenshot(path=path, full_page=full, animations="allow")
            return os.path.relpath(path, ROOT)

        async def run_steps(prog):
            res = {"steps": [], "eval": [], "dom": None, "text": None,
                   "fps": None, "state": None, "shots": []}
            steps = [s.strip() for s in prog.replace("\n", "|").split("|") if s.strip()]
            for step in steps:
                op, _, arg = step.partition(":")
                op = op.strip()
                try:
                    if op == "goto":
                        await page.goto(BASE + ("#" + arg if arg else ""), wait_until="load", timeout=45000)
                        await page.wait_for_timeout(1200)
                    elif op == "reload":
                        await page.reload(wait_until="load", timeout=45000)
                        await page.wait_for_timeout(1200)
                    elif op == "click":
                        el = await page.wait_for_selector(arg, timeout=8000, state="visible")
                        await el.scroll_into_view_if_needed()
                        b = await el.bounding_box()
                        await page.mouse.move(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
                        await page.wait_for_timeout(60)
                        await page.mouse.down(); await page.wait_for_timeout(40); await page.mouse.up()
                    elif op == "clickxy":
                        x, y = [float(v) for v in arg.split(",")]
                        await page.mouse.move(x, y); await page.wait_for_timeout(60)
                        await page.mouse.down(); await page.wait_for_timeout(40); await page.mouse.up()
                    elif op == "clicktext":
                        got = await page.evaluate(
                            """(t)=>{const els=[...document.querySelectorAll('*')].filter(e=>{
                                 const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return false;
                                 return (e.innerText||'').trim()===t && e.children.length<3;});
                               if(!els.length) return null; const r=els[0].getBoundingClientRect();
                               return [r.x+r.width/2, r.y+r.height/2];}""", arg)
                        if not got:
                            raise Exception("no element with text " + arg)
                        await page.mouse.move(got[0], got[1]); await page.wait_for_timeout(60)
                        await page.mouse.down(); await page.wait_for_timeout(40); await page.mouse.up()
                    elif op == "hover":
                        el = await page.wait_for_selector(arg, timeout=8000, state="visible")
                        b = await el.bounding_box()
                        await page.mouse.move(b["x"]+b["width"]/2, b["y"]+b["height"]/2, steps=6)
                    elif op == "hoverxy":
                        x, y = [float(v) for v in arg.split(",")]
                        await page.mouse.move(x, y, steps=6)
                    elif op == "key":
                        await page.keyboard.press(arg)
                    elif op == "wait":
                        await page.wait_for_timeout(int(float(arg)*1000))
                    elif op == "js":
                        await page.evaluate(f"(()=>{{ ({arg}); return 1; }})()")
                    elif op == "jsawait":
                        await page.evaluate(arg)
                    elif op == "eval":
                        res["eval"].append(await page.evaluate(arg))
                    elif op == "shot":
                        res["shots"].append(await snap(arg))
                    elif op == "shotfull":
                        res["shots"].append(await snap(arg, True))
                    elif op == "strip":
                        parts = arg.split(",")
                        nm, n, ms = parts[0], int(parts[1]), float(parts[2])
                        for i in range(n):
                            res["shots"].append(await snap(f"{nm}_f{i}"))
                            await page.wait_for_timeout(int(ms))
                    elif op == "drag":
                        sa, _, sb = arg.partition(">")
                        ea = await page.wait_for_selector(sa, timeout=8000)
                        eb = await page.wait_for_selector(sb, timeout=8000)
                        ba, bb = await ea.bounding_box(), await eb.bounding_box()
                        await mouse_drag(page, ba["x"]+ba["width"]/2, ba["y"]+ba["height"]/2,
                                         bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2)
                    elif op == "dragxy":
                        sa, _, rest = arg.partition(">")
                        x, y = [float(v) for v in rest.split(",")]
                        ea = await page.wait_for_selector(sa, timeout=8000)
                        ba = await ea.bounding_box()
                        await mouse_drag(page, ba["x"]+ba["width"]/2, ba["y"]+ba["height"]/2, x, y)
                    elif op == "mdown":
                        el = await page.wait_for_selector(arg, timeout=8000)
                        b = await el.bounding_box()
                        await page.mouse.move(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
                        await page.wait_for_timeout(80)
                        await page.mouse.down()
                    elif op == "mmove":
                        x, y = [float(v) for v in arg.split(",")]
                        await page.mouse.move(x, y, steps=8)
                    elif op == "mup":
                        await page.mouse.up()
                    elif op == "viewport":
                        w, h = [int(v) for v in arg.split(",")]
                        await page.set_viewport_size({"width": w, "height": h})
                        await page.wait_for_timeout(400)
                    elif op == "dom":
                        res["dom"] = await page.evaluate(DOM_JS)
                    elif op == "text":
                        res["text"] = await page.evaluate("document.body.innerText")
                    elif op == "fps":
                        res["fps"] = await page.evaluate(
                            """(async()=>{let n=0;const t0=performance.now();
                               await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
                               return {fps:n, mem:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null),
                                       nodes:document.getElementsByTagName('*').length}})()""")
                    elif op == "state":
                        res["state"] = await page.evaluate(
                            "window.MM ? JSON.stringify(window.MM.state()) : 'no MM'")
                    else:
                        res["steps"].append(f"UNKNOWN {op}")
                        continue
                    res["steps"].append(f"ok {step[:70]}")
                    await page.wait_for_timeout(140)
                except Exception as e:
                    res["steps"].append(f"FAIL {step[:70]} :: {str(e)[:200]}")
            res["console"] = LOGS[-40:]
            res["errors"] = ERRORS[:]
            del LOGS[:]
            return res

        async def handle(reader, writer):
            try:
                head = b""
                while b"\r\n\r\n" not in head:
                    c = await reader.read(4096)
                    if not c: break
                    head += c
                hdr, _, body = head.partition(b"\r\n\r\n")
                clen = 0
                for line in hdr.decode("utf8", "replace").split("\r\n"):
                    if line.lower().startswith("content-length:"):
                        clen = int(line.split(":")[1].strip())
                while len(body) < clen:
                    body += await reader.read(clen - len(body))
                first = hdr.decode("utf8", "replace").split("\r\n")[0]
                if "/quit" in first:
                    out = {"bye": 1}
                else:
                    out = await run_steps(body.decode("utf8", "replace"))
                payload = json.dumps(out, default=str).encode("utf8")
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                             + str(len(payload)).encode() + b"\r\nConnection: close\r\n\r\n" + payload)
                await writer.drain()
                writer.close()
                if "/quit" in first:
                    await browser.close()
                    os._exit(0)
            except Exception:
                traceback.print_exc()
                try:
                    writer.close()
                except Exception:
                    pass

        server = await asyncio.start_server(handle, "127.0.0.1", PORT)
        print(f"driver ready on {PORT}", flush=True)
        async with server:
            await server.serve_forever()


def scene_now():
    return SEEN_SCENE[-1] if SEEN_SCENE else "?"


async def mouse_drag(page, x0, y0, x1, y1, n=14):
    await page.mouse.move(x0, y0)
    await page.wait_for_timeout(60)
    await page.mouse.down()
    for i in range(1, n+1):
        t = i / n
        await page.mouse.move(x0 + (x1-x0)*t, y0 + (y1-y0)*t)
        await page.wait_for_timeout(18)
    await page.wait_for_timeout(120)
    await page.mouse.up()


if __name__ == "__main__":
    asyncio.run(main())
