"""Critic runner for CARD FEEL. Drives http://localhost:8777/tests/cards-feel/index.html
with Playwright, captures motion strips + rAF-sampled timings, dumps JSON metrics.

    python tests/critic-cardfeel/run.py            # everything
    python tests/critic-cardfeel/run.py hover arc  # named sections only

Output: shots/cf/*.png and shots/cf/metrics.json
"""
import asyncio, sys, os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "shots", "cf")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"

W, H = 1600, 900
EB = "[...document.querySelectorAll('#bar button')].filter(b=>b.textContent.startsWith('energy'))"
EPLUS = EB + "[0].click()"
EMINUS = EB + "[1].click()"
M = {}          # metrics
ERRORS, LOGS = [], []


# ── rAF sampler injected into the page ──────────────────────────────────────
SAMPLER = """
window.__cf = {
  // sample a card's box every frame for `ms`, return [{t,x,y,w,h,rot}]
  sample: (sel, ms) => new Promise(res => {
    const el = document.querySelector(sel); const out = []; const t0 = performance.now();
    const f = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el).transform;
      out.push({ t: +(performance.now()-t0).toFixed(1), x:+r.x.toFixed(2), y:+r.y.toFixed(2),
                 w:+r.width.toFixed(2), h:+r.height.toFixed(2), tf: cs });
      if (performance.now()-t0 < ms) requestAnimationFrame(f); else res(out);
    };
    requestAnimationFrame(f);
  }),
  // geometry of every card in the hand
  geom: () => [...document.querySelectorAll('.mm-hand__cards .mm-card')].map((el,i) => {
    const r = el.getBoundingClientRect();
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { i, x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1),
             cx:+(r.x+r.width/2).toFixed(1), cy:+(r.y+r.height/2).toFixed(1),
             bottom:+r.bottom.toFixed(1), top:+r.top.toFixed(1),
             rot:+(Math.atan2(m.b,m.a)*180/Math.PI).toFixed(2),
             scale:+Math.hypot(m.a,m.b).toFixed(3),
             cls: el.className, op:+getComputedStyle(el).opacity };
  }),
  fps: () => new Promise(r => { let n=0; const t0=performance.now();
    const f=()=>{n++; performance.now()-t0<1000?requestAnimationFrame(f):r(n)}; requestAnimationFrame(f); }),
  arrow: () => {
    const s = document.querySelector('.mm-hand__arrow');
    if (!s) return null;
    const g = (k) => { const p = s.querySelector(k); return p ? p.getAttribute('d') : null; };
    return { visible: getComputedStyle(s).opacity, display: getComputedStyle(s).display,
             cls: s.className.baseVal || s.getAttribute('class'),
             body: g('.mm-arrow__body'), head: g('.mm-arrow__head'),
             reticle: (()=>{const r=s.querySelector('.mm-arrow__reticle');
               return r? {op:getComputedStyle(r).opacity, tf:getComputedStyle(r).transform}:null})() };
  },
};
"""


async def main(sections):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required"])
        ctx = await br.new_context(viewport={"width": W, "height": H},
                                   device_scale_factor=1.0, reduced_motion="no-preference")
        page = await ctx.new_page()
        page.on("console", lambda m: (LOGS.append(f"[{m.type}] {m.text}"),
                                      ERRORS.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: ERRORS.append("PAGEERROR " + str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)
        await page.evaluate(SAMPLER)

        async def snap(n):
            await page.screenshot(path=os.path.join(OUT, n + ".png"), animations="allow")
            return n

        async def strip(name, n=8, iv=0.09):
            for i in range(n):
                await snap(f"{name}_f{i}")
                await page.wait_for_timeout(int(iv * 1000))

        async def size(n):
            await page.click(f"#size-{n}")
            await page.wait_for_timeout(700)

        async def box(i=3):
            return await page.evaluate(
                f"(()=>{{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[{i}];"
                f"const r=e.getBoundingClientRect();return{{x:r.x+r.width/2,y:r.y+r.height/2,"
                f"w:r.width,h:r.height,top:r.top,bottom:r.bottom}}}})()")

        run = lambda s: (not sections) or s in sections

        # ── 0. baseline / clipping ──────────────────────────────────────────
        if run("base"):
            await size(7)
            g = await page.evaluate("__cf.geom()")
            M["viewport"] = {"w": W, "h": H}
            M["base_geom_7"] = g
            M["clip"] = {"max_bottom": max(c["bottom"] for c in g),
                         "min_top": min(c["top"] for c in g),
                         "card_w": g[0]["w"], "card_h": g[0]["h"],
                         "offscreen_bottom_px": max(0, max(c["bottom"] for c in g) - H),
                         "hand_width": max(c["x"] + c["w"] for c in g) - min(c["x"] for c in g)}
            await snap("base_7")
            M["fps_idle"] = await page.evaluate("__cf.fps()")

        # ── 1. hover in / out, rAF-measured ─────────────────────────────────
        if run("hover"):
            await size(7)
            b = await box(3)
            await page.mouse.move(10, 10)
            await page.wait_for_timeout(400)
            task = asyncio.ensure_future(page.evaluate(
                "__cf.sample('.mm-hand__cards .mm-card:nth-child(4)', 700)"))
            await page.wait_for_timeout(60)
            await page.mouse.move(b["x"], b["y"], steps=1)
            hin = await task
            M["hover_in_samples"] = hin
            await page.wait_for_timeout(300)
            task = asyncio.ensure_future(page.evaluate(
                "__cf.sample('.mm-hand__cards .mm-card:nth-child(4)', 700)"))
            await page.wait_for_timeout(60)
            await page.mouse.move(10, 10, steps=1)
            M["hover_out_samples"] = await task
            # visual strips at 40ms so a <120ms move is actually resolvable
            await page.mouse.move(10, 10); await page.wait_for_timeout(400)
            await page.mouse.move(b["x"], b["y"], steps=1)
            await strip("hoverin", 6, 0.04)
            await page.wait_for_timeout(500)
            await snap("hover_settled")
            M["hover_geom"] = await page.evaluate("__cf.geom()")
            await page.mouse.move(10, 10, steps=1)
            await strip("hoverout", 6, 0.04)
            await page.wait_for_timeout(400)

            # oscillation: park the pointer exactly on the seam between 2 cards
            g = await page.evaluate("__cf.geom()")
            seam = (g[3]["x"] + g[3]["w"] + g[4]["x"]) / 2
            await page.mouse.move(seam, g[3]["cy"])
            await page.wait_for_timeout(300)
            osc = await page.evaluate(
                "(async()=>{const o=[];const t0=performance.now();"
                "const f=()=>{const h=document.querySelector('.mm-card.is-hover');"
                "o.push({t:+(performance.now()-t0).toFixed(0),u:h?h.dataset.uid:null});"
                "if(performance.now()-t0<900)requestAnimationFrame(f);};"
                "requestAnimationFrame(f);await new Promise(r=>setTimeout(r,1000));return o})()")
            flips = sum(1 for a, b2 in zip(osc, osc[1:]) if a["u"] != b2["u"])
            M["seam_hover_flips"] = flips
            M["seam_hover_trace"] = osc[::10]
            await snap("seam_hover")
            await page.mouse.move(10, 10); await page.wait_for_timeout(400)

        # ── 2. arc fan at 1/3/5/8/12 ────────────────────────────────────────
        if run("arc"):
            for n in (1, 3, 5, 8, 12):
                await size(n)
                await page.wait_for_timeout(500)
                g = await page.evaluate("__cf.geom()")
                cy = [c["cy"] for c in g]
                mid = cy[len(cy) // 2]
                M[f"arc_{n}"] = {
                    "cy": cy, "rot": [c["rot"] for c in g],
                    "outer_minus_centre_y": round(max(cy[0], cy[-1]) - mid, 1),
                    "dip_px": round(max(cy) - min(cy), 1),
                    "overlap_px": round((g[0]["w"] - (g[1]["x"] - g[0]["x"])), 1) if n > 1 else None,
                    "max_bottom": max(c["bottom"] for c in g),
                    "offscreen": max(0, max(c["bottom"] for c in g) - H),
                }
                await snap(f"arc_{n}")
            # re-fan easing: 5 -> 12, strip
            await size(5)
            await page.click("#size-12")
            await strip("refan_5to12", 7, 0.05)
            await page.wait_for_timeout(600)
            # interruptibility: retarget mid-flight
            await page.click("#size-3")
            await page.wait_for_timeout(120)
            await page.click("#size-10")
            await strip("refan_interrupt", 7, 0.06)
            await page.wait_for_timeout(600)

        # ── 3. drag a targeted card at an enemy ─────────────────────────────
        if run("drag"):
            await size(7)
            await page.wait_for_timeout(500)
            # find a card whose def targets an enemy
            idx = await page.evaluate(
                "(()=>{const c=MMTEST.hand.cards();for(let i=0;i<c.length;i++)"
                "if(c[i].def.target==='enemy')return i;return 0})()")
            M["drag_card_index"] = idx
            b = await box(idx)
            foe = await page.evaluate(
                "(()=>{const r=document.querySelector('.foe[data-id=\"grumble\"] .foe__body')"
                ".getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            await page.mouse.move(b["x"], b["y"])
            await page.wait_for_timeout(200)
            await page.mouse.down()
            await page.wait_for_timeout(80)
            await snap("drag_f0_pickup")
            steps = 6
            for i in range(1, steps + 1):
                t = i / steps
                await page.mouse.move(b["x"] + (foe["x"] - b["x"]) * t,
                                      b["y"] + (foe["y"] - b["y"]) * t, steps=3)
                await page.wait_for_timeout(70)
                await snap(f"drag_f{i}")
                if i == steps:
                    M["arrow_at_target"] = await page.evaluate("__cf.arrow()")
                elif i == 3:
                    M["arrow_midway"] = await page.evaluate("__cf.arrow()")
            # off-target for comparison
            await page.mouse.move(W - 120, 300, steps=6)
            await page.wait_for_timeout(150)
            M["arrow_offtarget"] = await page.evaluate("__cf.arrow()")
            await snap("drag_offtarget")
            await page.mouse.move(foe["x"], foe["y"], steps=6)
            await page.wait_for_timeout(150)
            await snap("drag_resnap")
            await page.mouse.up()
            await strip("play_after_drag", 8, 0.09)
            await page.wait_for_timeout(900)

        # ── 4. play / draw / discard / exhaust signatures ───────────────────
        if run("motion"):
            await size(7); await page.wait_for_timeout(600)
            await page.evaluate(EPLUS)
            await page.wait_for_timeout(200)
            await page.click("#btn-play-random")
            await strip("play", 10, 0.07)
            await page.wait_for_timeout(900)

            await page.click("#btn-discard-all")
            await strip("discard", 8, 0.07)
            await page.wait_for_timeout(900)

            await page.click("#btn-draw-5")
            await strip("draw", 8, 0.07)
            await page.wait_for_timeout(900)

            await page.click("#btn-exhaust")
            await strip("exhaust", 9, 0.08)
            await page.wait_for_timeout(1000)

            # sampled traces so the three can be compared numerically
            await size(6); await page.wait_for_timeout(600)
            M["trace_discard"] = await page.evaluate(
                "(async()=>{const s=__cf.sample('.mm-hand__cards .mm-card:nth-child(2)',900);"
                "document.querySelector('#btn-discard-all').click();return await s})()")
            await page.wait_for_timeout(900)
            await size(6); await page.wait_for_timeout(600)
            M["trace_exhaust"] = await page.evaluate(
                "(async()=>{const s=__cf.sample('.mm-hand__cards .mm-card:nth-child(4)',1200);"
                "document.querySelector('#btn-exhaust').click();return await s})()")
            await page.wait_for_timeout(900)
            M["fps_after_motion"] = await page.evaluate("__cf.fps()")

        # ── 5. unplayable state ─────────────────────────────────────────────
        if run("unplayable"):
            await size(7); await page.wait_for_timeout(600)
            await snap("playable_on")
            M["geom_playable"] = await page.evaluate("__cf.geom()")
            await page.click("#btn-toggle-playable")
            await page.wait_for_timeout(600)
            await snap("playable_off")
            M["geom_unplayable"] = await page.evaluate("__cf.geom()")
            M["unplayable_css"] = await page.evaluate(
                "(()=>{const e=document.querySelector('.mm-hand__cards .mm-card');"
                "const s=getComputedStyle(e);return{filter:s.filter,opacity:s.opacity,"
                "cls:e.className}})()")
            await page.click("#btn-toggle-playable")
            await page.wait_for_timeout(500)
            # energy-driven unplayability (mixed hand)
            for _ in range(3):
                await page.evaluate(EMINUS)
                await page.wait_for_timeout(150)
            await page.wait_for_timeout(600)
            await snap("energy0_mixed")
            M["geom_energy0"] = await page.evaluate("__cf.geom()")
            for _ in range(3):
                await page.evaluate(EPLUS)
                await page.wait_for_timeout(120)

        # ── 6. numbers: upgraded / boosted / reduced ────────────────────────
        if run("numbers"):
            await size(7); await page.wait_for_timeout(500)
            await snap("nums_base")
            M["nums_base"] = await page.evaluate(
                "[...document.querySelectorAll('.mm-card__num')].map(n=>({t:n.textContent,"
                "cls:n.className,col:getComputedStyle(n).color}))")
            await page.click("#btn-upgrade-all")
            await page.wait_for_timeout(800)
            await snap("nums_upgraded")
            M["nums_upgraded"] = await page.evaluate(
                "[...document.querySelectorAll('.mm-card__num')].map(n=>({t:n.textContent,"
                "cls:n.className,col:getComputedStyle(n).color}))")
            # boosted / reduced: aim at Grumbleboot (x1.5) then Chandelier (x0.6)
            idx = await page.evaluate(
                "(()=>{const c=MMTEST.hand.cards();for(let i=0;i<c.length;i++)"
                "if(c[i].def.target==='enemy')return i;return 0})()")
            b = await box(idx)
            for foe_id, tag in (("grumble", "boost"), ("chandy", "reduce")):
                f = await page.evaluate(
                    f"(()=>{{const r=document.querySelector('.foe[data-id=\"{foe_id}\"] .foe__body')"
                    ".getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
                await page.mouse.move(b["x"], b["y"]); await page.wait_for_timeout(150)
                await page.mouse.down(); await page.wait_for_timeout(80)
                await page.mouse.move(f["x"], f["y"], steps=10); await page.wait_for_timeout(450)
                await snap(f"nums_{tag}")
                M[f"nums_{tag}"] = await page.evaluate(
                    "[...document.querySelectorAll('.mm-card.is-drag .mm-card__num,"
                    ".mm-card.is-held .mm-card__num,.mm-card[style*=\"z-index\"] .mm-card__num')]"
                    ".map(n=>({t:n.textContent,cls:n.className,col:getComputedStyle(n).color}))")
                await page.keyboard.press("Escape")
                await page.mouse.up()
                await page.wait_for_timeout(600)
            # zoom crop of one card at hover scale for text-blur judgement
            await page.mouse.move(10, 10); await page.wait_for_timeout(400)
            b = await box(3)
            await page.mouse.move(b["x"], b["y"]); await page.wait_for_timeout(500)
            bb = await box(3)
            await page.screenshot(path=os.path.join(OUT, "hovercard_zoom.png"),
                                  clip={"x": max(0, bb["x"] - bb["w"] / 2 - 10),
                                        "y": max(0, bb["top"] - 10),
                                        "width": bb["w"] + 20,
                                        "height": min(bb["h"] + 20, H - bb["top"] + 10)})
            await page.mouse.move(10, 10); await page.wait_for_timeout(300)

        # ── 7. keyboard-only path ───────────────────────────────────────────
        if run("kbd"):
            await size(6); await page.wait_for_timeout(600)
            await page.mouse.move(10, 10)
            await page.keyboard.press("1")
            await page.wait_for_timeout(350)
            await snap("kbd_1_selected")
            M["kbd_after_1"] = await page.evaluate(
                "({sel:MMTEST.hand.selIdx, aim:!!MMTEST.hand.aim,"
                " focus:document.activeElement.className||document.activeElement.tagName,"
                " arrow:__cf.arrow()})")
            await page.keyboard.press("ArrowRight")
            await page.wait_for_timeout(300)
            await snap("kbd_arrowright")
            M["kbd_after_right"] = await page.evaluate("({sel:MMTEST.hand.selIdx})")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(350)
            await snap("kbd_enter")
            M["kbd_after_enter"] = await page.evaluate(
                "({sel:MMTEST.hand.selIdx, aim:MMTEST.hand.aim?MMTEST.hand.aim.targetId||true:false,"
                " arrow:__cf.arrow(), n:MMTEST.hand.count})")
            await page.keyboard.press("Tab")
            await page.wait_for_timeout(300)
            await snap("kbd_tab_target")
            M["kbd_after_tab"] = await page.evaluate(
                "({aim:MMTEST.hand.aim?MMTEST.hand.aim.targetId||true:false,"
                " focus:document.activeElement.className||document.activeElement.tagName})")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(600)
            await snap("kbd_played")
            M["kbd_after_play"] = await page.evaluate("({n:MMTEST.hand.count})")
            await page.keyboard.press("2"); await page.wait_for_timeout(250)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(300)
            await snap("kbd_escape")
            M["kbd_after_esc"] = await page.evaluate(
                "({sel:MMTEST.hand.selIdx, aim:!!MMTEST.hand.aim})")
            # focus visibility: native Tab from the page body
            await page.evaluate("document.body.focus()")
            M["focusable_cards"] = await page.evaluate(
                "[...document.querySelectorAll('.mm-hand__cards .mm-card')]"
                ".map(e=>({ti:e.getAttribute('tabindex'),role:e.getAttribute('role'),"
                "al:e.getAttribute('aria-label')}))")

        # ── 8. small viewport ───────────────────────────────────────────────
        if run("small"):
            await page.set_viewport_size({"width": 1280, "height": 720})
            await page.wait_for_timeout(700)
            await size(10); await page.wait_for_timeout(700)
            await snap("small_1280x720_10")
            g = await page.evaluate("__cf.geom()")
            M["small_1280"] = {"card_h": g[0]["h"], "max_bottom": max(c["bottom"] for c in g),
                               "offscreen": max(0, max(c["bottom"] for c in g) - 720),
                               "vh_frac": round(g[0]["h"] / 720, 3)}
            await page.set_viewport_size({"width": 1600, "height": 900})
            await page.wait_for_timeout(600)

        M["errors"] = ERRORS[:40]
        M["logs"] = LOGS[-40:]
        json.dump(M, open(os.path.join(OUT, "metrics.json"), "w"), indent=1)
        await br.close()
    print("errors:", len(ERRORS))
    for e in ERRORS[:10]:
        print("  ", e[:300])
    print("wrote", os.path.join(OUT, "metrics.json"))


if __name__ == "__main__":
    asyncio.run(main(set(sys.argv[1:])))
