"""Persistent-session playthrough driver (playthrough 5 / p6 shots).

ONE browser held open across a whole expedition, so state carries across scenes
the way it does for a real player. Command server + thin client.

    python tests/playthrough5/play.py serve [--w 1600] [--h 900] [--port 8899]
    python tests/playthrough5/play.py do '{"op":"shot","name":"p6-title"}'
    python tests/playthrough5/play.py do @batch.json        # a JSON list of ops

Ops
    goto      {url|hash}            navigate (cold boot when url given)
    reload    {}
    shot      {name, full?}         -> shots/<name>.png
    strip     {name, n, interval}   -> shots/<name>_f0..png  (motion, judge frame by frame)
    click     {sel} | {text}        real mouse down/up at element centre
    hover     {sel|text}
    key       {key}
    type      {text}
    wait      {sec}
    drag      {from, to}            weighted 14-step mouse drag
    dom       {root?}               interactive-element dump (tag, class, text, box)
    text      {root?}               visible innerText
    eval      {js}                  page.evaluate (awaits promises)
    fire      {js}                  fire-and-forget (promise NOT awaited)
    state     {}                    window.MM.state()
    errors    {}                    drain page-side error log (with scene attribution)
    fps       {}                    rAF frame count over 1s
    resize    {w,h}
    quit      {}

Errors are captured page-side by an init script that wraps console.error /
window.onerror / unhandledrejection and stamps each with the CURRENT SCENE, so a
console error can always be attributed to the screen it fired on.
"""
import asyncio, sys, os, json, argparse, socket, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:8777/game/index.html"

INIT = r"""
window.__mmErr = [];
(function(){
  const scene = () => { try { return window.MM ? window.MM.state().scene : '(preboot)'; } catch(e){ return '(?)'; } };
  const push = (kind, msg, stack) => window.__mmErr.push({kind, msg:String(msg).slice(0,600),
      stack:String(stack||'').split('\n').slice(0,4).join(' | '), scene:scene(), t:Math.round(performance.now())});
  const ce = console.error, cw = console.warn;
  console.error = function(){ push('console.error', [...arguments].join(' ')); return ce.apply(console, arguments); };
  console.warn  = function(){ push('console.warn',  [...arguments].join(' ')); return cw.apply(console, arguments); };
  window.addEventListener('error', e => push('window.error', e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => push('rejection', (e.reason && e.reason.message) || e.reason,
      e.reason && e.reason.stack));
})();
"""

DOMDUMP = r"""
(root) => {
  const sel = root || 'body';
  const host = document.querySelector(sel) || document.body;
  const out = [];
  const nodes = host.querySelectorAll('button, [role=button], a, input, select, [tabindex], .card, .mm-card, [data-act], [data-choice], [data-opt], [data-node], [data-uid], [data-id], li, .opt, .option, .choice');
  const seen = new Set();
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
    const key = Math.round(r.x)+','+Math.round(r.y)+','+Math.round(r.width);
    const txt = (n.innerText || n.value || n.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,110);
    if (seen.has(key+txt)) continue; seen.add(key+txt);
    out.push({tag:n.tagName.toLowerCase(), cls:(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className||'').toString().slice(0,90),
      id:n.id||'', txt, box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
      dis: n.disabled === true || n.getAttribute('aria-disabled') === 'true' || cs.pointerEvents === 'none',
      tab: n.getAttribute('tabindex')});
  }
  return out;
}
"""


async def serve(a):
    from playwright.async_api import async_playwright
    state = {"quit": False}
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctxb = await browser.new_context(viewport={"width": a.w, "height": a.h},
                                         device_scale_factor=1.0, reduced_motion="no-preference")
        await ctxb.add_init_script(INIT)
        page = await ctxb.new_page()
        pw_errors = []
        page.on("pageerror", lambda e: pw_errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: pw_errors.append("[console.error] " + m.text) if m.type == "error" else None)

        async def find(op):
            if op.get("sel"):
                return await page.wait_for_selector(op["sel"], timeout=op.get("timeout", 6000), state="visible")
            t = op["text"]
            el = await page.evaluate_handle(
                """(t) => { const all=[...document.querySelectorAll('button,a,[role=button],div,span,li,h1,h2,h3,p')];
                   const hit = all.filter(n=>{const s=(n.innerText||'').replace(/\\s+/g,' ').trim();
                     if(!s || s.length>200) return false;
                     if(!(s.toLowerCase().includes(t.toLowerCase()))) return false;
                     const r=n.getBoundingClientRect(); return r.width>3&&r.height>3;});
                   hit.sort((x,y)=>(x.innerText.length-y.innerText.length));
                   return hit[0]||null; }""", t)
            e = el.as_element()
            if not e:
                raise RuntimeError("no element with text " + repr(t))
            return e

        async def handle(op):
            o = op.get("op")
            if o == "goto":
                url = op.get("url") or (BASE + ("#" + op["hash"] if op.get("hash") else ""))
                await page.goto(url, wait_until="load", timeout=45000)
                await page.wait_for_timeout(int(op.get("wait", 2.0) * 1000))
                return {"url": url}
            if o == "reload":
                await page.reload(wait_until="load"); await page.wait_for_timeout(1500); return {}
            if o == "shot":
                pth = os.path.join(SHOTS, op["name"] + ".png")
                await page.screenshot(path=pth, full_page=op.get("full", False), animations="allow")
                return {"shot": "shots/" + op["name"] + ".png"}
            if o == "strip":
                n = int(op.get("n", 8)); iv = float(op.get("interval", 0.09)); names = []
                for i in range(n):
                    pth = os.path.join(SHOTS, f"{op['name']}_f{i}.png")
                    await page.screenshot(path=pth, animations="allow"); names.append(f"{op['name']}_f{i}.png")
                    await page.wait_for_timeout(int(iv * 1000))
                return {"frames": names}
            if o in ("click", "hover"):
                e = await find(op)
                b = await e.bounding_box()
                if not b:
                    raise RuntimeError("no box")
                x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] * (op.get("fy", 0.5))
                await page.mouse.move(x, y)
                await page.wait_for_timeout(op.get("hoverms", 90))
                if o == "click":
                    await page.mouse.down(); await page.wait_for_timeout(40); await page.mouse.up()
                await page.wait_for_timeout(int(op.get("after", 0.35) * 1000))
                return {"at": [round(x), round(y)]}
            if o == "clickxy":
                await page.mouse.move(op["x"], op["y"]); await page.wait_for_timeout(80)
                await page.mouse.down(); await page.wait_for_timeout(40); await page.mouse.up()
                await page.wait_for_timeout(int(op.get("after", 0.35) * 1000))
                return {}
            if o == "mmove":
                await page.mouse.move(op["x"], op["y"])
                await page.wait_for_timeout(int(op.get("after", 0.05) * 1000)); return {}
            if o == "mdown":
                await page.mouse.down(); await page.wait_for_timeout(int(op.get("after", 0.05) * 1000)); return {}
            if o == "mup":
                await page.mouse.up(); await page.wait_for_timeout(int(op.get("after", 0.1) * 1000)); return {}
            if o == "box":
                e = await find(op)
                b = await e.bounding_box()
                return {"box": [round(b["x"]), round(b["y"]), round(b["width"]), round(b["height"])],
                        "c": [round(b["x"] + b["width"] / 2), round(b["y"] + b["height"] / 2)]}
            if o == "key":
                await page.keyboard.press(op["key"])
                await page.wait_for_timeout(int(op.get("after", 0.25) * 1000)); return {}
            if o == "type":
                await page.keyboard.type(op["text"]); return {}
            if o == "wait":
                await page.wait_for_timeout(int(float(op["sec"]) * 1000)); return {}
            if o == "drag":
                ea = await find({"sel": op["from"]} if op["from"].startswith(("#", ".", "[")) else {"text": op["from"]})
                ba = await ea.bounding_box()
                if op.get("to", "").startswith(("#", ".", "[")):
                    eb = await page.wait_for_selector(op["to"], timeout=6000); bb = await eb.bounding_box()
                    tx, ty = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
                else:
                    tx, ty = op["tx"], op["ty"]
                sx, sy = ba["x"] + ba["width"] / 2, ba["y"] + ba["height"] / 2
                await page.mouse.move(sx, sy); await page.wait_for_timeout(120); await page.mouse.down()
                for i in range(1, 15):
                    t = i / 14
                    await page.mouse.move(sx + (tx - sx) * t, sy + (ty - sy) * t); await page.wait_for_timeout(16)
                await page.wait_for_timeout(120); await page.mouse.up()
                await page.wait_for_timeout(int(op.get("after", 0.5) * 1000)); return {"from": [round(sx), round(sy)], "to": [round(tx), round(ty)]}
            if o == "dom":
                return {"dom": await page.evaluate(DOMDUMP, op.get("root"))}
            if o == "text":
                return {"text": await page.evaluate("(s)=>{const n=document.querySelector(s||'#dom-layer')||document.body; return n.innerText;}", op.get("root"))}
            if o == "eval":
                return {"v": await page.evaluate(op["js"])}
            if o == "fire":
                return {"v": await page.evaluate(f"(()=>{{ ({op['js']}); return 1; }})()")}
            if o == "state":
                return {"state": await page.evaluate("window.MM?JSON.stringify(window.MM.state()):'no MM'")}
            if o == "errors":
                errs = await page.evaluate("(()=>{const e=window.__mmErr||[];window.__mmErr=[];return e;})()")
                out = {"page": errs, "pw": pw_errors[:]}
                pw_errors.clear()
                return out
            if o == "fps":
                return {"perf": await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
                  await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
                  return {fps:n, mem:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null),
                          w:innerWidth,h:innerHeight}})()""")}
            if o == "resize":
                await page.set_viewport_size({"width": op["w"], "height": op["h"]}); await page.wait_for_timeout(400); return {}
            if o == "quit":
                state["quit"] = True; return {"bye": 1}
            raise RuntimeError("unknown op " + str(o))

        async def on_conn(reader, writer):
            data = await reader.read(1 << 22)
            try:
                ops = json.loads(data.decode("utf-8"))
            except Exception as e:
                writer.write(json.dumps({"err": "bad json " + str(e)}).encode()); await writer.drain(); writer.close(); return
            if isinstance(ops, dict):
                ops = [ops]
            res = []
            for op in ops:
                t0 = time.time()
                try:
                    r = await handle(op)
                    r["_ms"] = int((time.time() - t0) * 1000)
                    res.append(r)
                except Exception as e:
                    res.append({"ERR": f"{op.get('op')}: {e}"[:400]})
                    break
            writer.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            await writer.drain(); writer.close()

        srv = await asyncio.start_server(on_conn, "127.0.0.1", a.port)
        print("PLAY SERVER READY on", a.port, flush=True)
        while not state["quit"]:
            await asyncio.sleep(0.2)
        srv.close()
        await browser.close()
        print("bye", flush=True)


def do(a):
    payload = a.payload
    if payload.startswith("@"):
        payload = open(payload[1:], encoding="utf-8").read()
    s = socket.create_connection(("127.0.0.1", a.port), timeout=300)
    s.sendall(payload.encode("utf-8")); s.shutdown(socket.SHUT_WR)
    buf = b""
    while True:
        c = s.recv(65536)
        if not c:
            break
        buf += c
    sys.stdout.buffer.write(buf + b"\n")
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sv = sub.add_parser("serve"); sv.add_argument("--w", type=int, default=1600)
    sv.add_argument("--h", type=int, default=900); sv.add_argument("--port", type=int, default=8899)
    dd = sub.add_parser("do"); dd.add_argument("payload"); dd.add_argument("--port", type=int, default=8899)
    args = ap.parse_args()
    if args.cmd == "serve":
        sys.exit(asyncio.run(serve(args)))
    do(args)
