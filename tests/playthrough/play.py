"""Persistent Playwright driver for a full Midnight Menagerie playthrough.

Holds ONE browser session across the whole expedition so state carries between
scenes (which is where the integration bugs live).

Run it in the background:

    python tests/playthrough/play.py

It then polls  tests/playthrough/cmds.txt  for new lines and appends the result of
each to  tests/playthrough/log.txt .  Append commands with plain shell redirection.

Commands (one per line):
    shot:NAME              screenshot -> shots/NAME.png
    click:SEL              css/text selector click
    clicktext:TEXT         click the first visible element whose text == TEXT
    hover:SEL
    key:KEY
    wait:SECONDS
    drag:SELA>SELB
    js:EXPR                evaluate, do NOT await a returned promise
    jsawait:EXPR           evaluate and await
    text                   dump visible innerText of body (trimmed)
    ui                     dump clickable elements (tag/class/text/box)
    state                  dump window.MM.state()
    errors                 dump+clear collected console errors/pageerrors
    console                dump last 40 console lines
    fps                    measure fps over 1s
    reload                 reload the page (keeps storage -> tests autosave)
    goto:URL
    strip:NAME,N,MS        N screenshots MS apart -> shots/NAME_f0..
    quit
"""
import json, os, sys, time, traceback

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, "tests", "playthrough")
SHOTS = os.path.join(ROOT, "shots")
CMDS = os.path.join(HERE, "cmds.txt")
LOG = os.path.join(HERE, "log.txt")
BASE = "http://localhost:8777/game/index.html"
os.makedirs(SHOTS, exist_ok=True)
os.makedirs(HERE, exist_ok=True)

UI_JS = """() => {
  const out = [];
  const sel = 'button,a,[role=button],[tabindex],.card,.mm-card,[data-node],[class*=node],[class*=btn],[class*=choice],[class*=option],[class*=card]';
  document.querySelectorAll(sel).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return;
    out.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 70),
      txt: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      dis: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
    });
  });
  return out.slice(0, 120);
}"""


def main():
    from playwright.sync_api import sync_playwright
    errors, logs = [], []
    scene = ["?"]

    def note(msg):
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")

    open(LOG, "w", encoding="utf-8").write("=== driver up ===\n")
    if not os.path.exists(CMDS):
        open(CMDS, "w", encoding="utf-8").write("")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--font-render-hinting=none",
            "--disable-lcd-text", "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = browser.new_context(viewport={"width": 1600, "height": 900},
                                  device_scale_factor=1.0, reduced_motion="no-preference")
        page = ctx.new_page()

        def on_console(m):
            line = f"[{m.type}] {m.text}"
            logs.append(line)
            if m.type == "error":
                errors.append(f"(scene={scene[0]}) {line}")

        page.on("console", on_console)
        page.on("pageerror", lambda e: errors.append(f"(scene={scene[0]}) PAGEERROR {e}"))

        page.goto(BASE, wait_until="load", timeout=45000)
        page.wait_for_timeout(2500)
        note("loaded " + BASE)

        done = 0
        idle = 0
        while True:
            try:
                lines = open(CMDS, encoding="utf-8").read().splitlines()
            except FileNotFoundError:
                lines = []
            if len(lines) <= done:
                idle += 1
                time.sleep(0.35)
                if idle > 3600:
                    break
                continue
            idle = 0
            for raw in lines[done:]:
                done += 1
                cmd = raw.strip()
                if not cmd or cmd.startswith("#"):
                    continue
                op, _, arg = cmd.partition(":")
                op = op.strip()
                note(f"\n>>> {cmd}")
                try:
                    # keep scene tag fresh for console attribution
                    try:
                        s = page.evaluate("window.MM && window.MM.state ? (window.MM.state().scene||'?') : '?'")
                        if s:
                            scene[0] = str(s)[:40]
                    except Exception:
                        pass

                    if op == "shot":
                        path = os.path.join(SHOTS, arg + ".png")
                        page.screenshot(path=path, animations="allow")
                        note("ok shot " + arg)
                    elif op == "strip":
                        name, n, ms = arg.split(",")
                        for i in range(int(n)):
                            page.screenshot(path=os.path.join(SHOTS, f"{name}_f{i}.png"), animations="allow")
                            page.wait_for_timeout(int(ms))
                        note(f"ok strip {name} x{n}")
                    elif op == "click":
                        page.click(arg, timeout=8000)
                        page.wait_for_timeout(250)
                        note("ok click")
                    elif op == "clicktext":
                        page.get_by_text(arg, exact=False).first.click(timeout=8000)
                        page.wait_for_timeout(250)
                        note("ok clicktext")
                    elif op == "hover":
                        page.hover(arg, timeout=8000)
                        note("ok hover")
                    elif op == "key":
                        page.keyboard.press(arg)
                        page.wait_for_timeout(200)
                        note("ok key")
                    elif op == "wait":
                        page.wait_for_timeout(int(float(arg) * 1000))
                        note("ok wait")
                    elif op == "drag":
                        sa, _, sb = arg.partition(">")
                        ea = page.wait_for_selector(sa, timeout=8000)
                        eb = page.wait_for_selector(sb, timeout=8000)
                        ba, bb = ea.bounding_box(), eb.bounding_box()
                        page.mouse.move(ba["x"] + ba["width"] / 2, ba["y"] + ba["height"] / 2)
                        page.mouse.down()
                        for i in range(1, 15):
                            t = i / 14
                            page.mouse.move(
                                ba["x"] + ba["width"] / 2 + (bb["x"] + bb["width"] / 2 - ba["x"] - ba["width"] / 2) * t,
                                ba["y"] + ba["height"] / 2 + (bb["y"] + bb["height"] / 2 - ba["y"] - ba["height"] / 2) * t)
                            page.wait_for_timeout(16)
                        page.mouse.up()
                        page.wait_for_timeout(300)
                        note("ok drag")
                    elif op == "dragxy":
                        # dragxy:x1,y1>x2,y2
                        sa, _, sb = arg.partition(">")
                        x1, y1 = [float(v) for v in sa.split(",")]
                        x2, y2 = [float(v) for v in sb.split(",")]
                        page.mouse.move(x1, y1)
                        page.mouse.down()
                        for i in range(1, 15):
                            t = i / 14
                            page.mouse.move(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
                            page.wait_for_timeout(16)
                        page.mouse.up()
                        page.wait_for_timeout(300)
                        note("ok dragxy")
                    elif op == "clickxy":
                        x, y = [float(v) for v in arg.split(",")]
                        page.mouse.click(x, y)
                        page.wait_for_timeout(250)
                        note("ok clickxy")
                    elif op == "hoverxy":
                        x, y = [float(v) for v in arg.split(",")]
                        page.mouse.move(x, y)
                        page.wait_for_timeout(200)
                        note("ok hoverxy")
                    elif op == "js":
                        page.evaluate(f"(()=>{{ ({arg}); return 1; }})()")
                        note("ok js")
                    elif op == "jsawait":
                        r = page.evaluate(arg)
                        note("ok jsawait -> " + json.dumps(r, default=str)[:4000])
                    elif op == "text":
                        t = page.evaluate("document.body.innerText")
                        note(t.strip()[:6000])
                    elif op == "ui":
                        r = page.evaluate(UI_JS)
                        note(json.dumps(r, indent=0)[:9000])
                    elif op == "state":
                        r = page.evaluate("window.MM && window.MM.state ? JSON.stringify(window.MM.state()) : 'no MM'")
                        note(str(r)[:6000])
                    elif op == "errors":
                        note("ERRORS(%d):\n" % len(errors) + "\n".join(errors[:60]))
                        errors.clear()
                    elif op == "console":
                        note("\n".join(logs[-40:]))
                    elif op == "fps":
                        r = page.evaluate("""(async()=>{let n=0;const t0=performance.now();
                          await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
                          return n})()""")
                        note("fps " + str(r))
                    elif op == "reload":
                        page.reload(wait_until="load", timeout=45000)
                        page.wait_for_timeout(2500)
                        note("ok reload")
                    elif op == "goto":
                        page.goto(arg, wait_until="load", timeout=45000)
                        page.wait_for_timeout(2500)
                        note("ok goto")
                    elif op == "quit":
                        note("bye")
                        browser.close()
                        return
                    else:
                        note("!! unknown op " + op)
                except Exception as e:
                    note("!! " + type(e).__name__ + ": " + str(e)[:600])
            note("--- batch done ---")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write("FATAL\n" + traceback.format_exc())
        raise
