"""Motion-strip harness for the card-feel showcase.

    python tests/cards-feel/run.py                 # every scene
    python tests/cards-feel/run.py hover play      # just these
    python tests/cards-feel/run.py --list

Writes shots/cf-<scene>_f0..fN.png — sequences of frames captured while the
interaction is running, so the MOTION can be judged, not just the pose.
Also prints numeric probes (hover completion time, fps under 12-card drag)
because "under 120ms" is a number, not a vibe.
"""
import asyncio, sys, os, json, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"

W, H = 1500, 860
HAND_CLIP = {"x": 0, "y": 300, "width": W, "height": 560}
FULL_CLIP = None


class Cap:
    def __init__(self, page, name):
        self.page, self.name, self.i = page, name, 0

    async def frame(self, clip=HAND_CLIP, tag=None):
        p = os.path.join(SHOTS, f"cf-{self.name}_f{self.i}.png" if tag is None
                         else f"cf-{self.name}-{tag}.png")
        await self.page.screenshot(path=p, clip=clip, animations="allow")
        self.i += 1
        return p

    async def strip(self, n, gap_ms=90, clip=HAND_CLIP):
        for _ in range(n):
            await self.frame(clip)
            if gap_ms:
                await self.page.wait_for_timeout(gap_ms)


async def card_pos(page, i):
    return await page.evaluate(
        "(i)=>{const s=window.MMTEST.hand.slots[i];return s?{x:s.cur.x,y:s.cur.y}:null}", i)


async def foe_pos(page, fid):
    return await page.evaluate(
        """(id)=>{const e=document.querySelector(`.foe[data-id="${id}"] .foe__body`);
                  const b=e.getBoundingClientRect();
                  return {x:b.left+b.width/2, y:b.top+b.height/2}}""", fid)


async def slow(page, s=1.0):
    """Slow the game clock so a motion strip samples the arc, not the aftermath.
    Screenshots cost ~120ms each, so at 1x a 400ms arc is 3 frames."""
    await page.evaluate("(s)=>window.MMTEST.clock.scale=s", s)


async def size(page, n):
    await page.evaluate("(n)=>window.MMTEST.setSize(n)", n)
    await page.wait_for_timeout(650)


# ── scenes ──────────────────────────────────────────────────────────────────
async def scene_idle(page):
    c = Cap(page, "idle")
    for n in (1, 3, 5, 7, 10, 12):
        await size(page, n)
        await c.frame(HAND_CLIP, tag=f"n{n}")
    await size(page, 7)


async def scene_gallery(page):
    """Every type and rarity side by side, static, for anatomy inspection."""
    await size(page, 12)
    await page.wait_for_timeout(700)
    c = Cap(page, "gallery")
    await c.frame(FULL_CLIP, tag="all")
    # a close crop on the middle three cards
    await c.frame({"x": 430, "y": 380, "width": 640, "height": 470}, tag="closeup")


async def scene_hover(page):
    """The single most-felt interaction. Frames every 40ms so <120ms is provable."""
    await size(page, 7)
    p = await card_pos(page, 4)
    away = {"x": W / 2, "y": 200}
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(400)

    # numeric probe first: sample the card's y every frame while hovering
    probe = await page.evaluate(
        """async ([x,y]) => {
            const h = window.MMTEST.hand, s = h.slots[4];
            const y0 = s.cur.y;
            const out = [];
            const t0 = performance.now();
            const el = document.querySelector('.mm-hand__hit');
            el.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));
            await new Promise(r=>{
              const f=()=>{ out.push([+(performance.now()-t0).toFixed(1), +s.cur.y.toFixed(1), +s.cur.scale.toFixed(3)]);
                            performance.now()-t0<260?requestAnimationFrame(f):r(); };
              requestAnimationFrame(f);
            });
            const yEnd = s.to.y;
            const pct = out.map(o=>[o[0], +(((y0-o[1])/(y0-yEnd))*100).toFixed(1)]);
            const done = pct.find(o=>o[1]>=95);
            return { y0, yEnd, t95: done?done[0]:null, curve: pct.filter((_,i)=>i%2===0).slice(0,10) };
        }""", [p["x"], p["y"] - 120])
    print("  hover probe:", json.dumps(probe))

    # visual strip: out -> in
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(400)
    c = Cap(page, "hover-in")
    await c.frame(HAND_CLIP)
    await page.mouse.move(p["x"], p["y"] - 120)
    await c.strip(6, gap_ms=40)

    c2 = Cap(page, "hover-out")
    await c2.frame(HAND_CLIP)
    await page.mouse.move(away["x"], away["y"])
    await c2.strip(5, gap_ms=40)

    # hover a neighbour to show the nudge
    p2 = await card_pos(page, 1)
    await page.mouse.move(p2["x"], p2["y"] - 120)
    await page.wait_for_timeout(300)
    c3 = Cap(page, "hover-edge")
    await c3.frame(HAND_CLIP)
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(300)


async def scene_drag(page):
    """Targeted card: park + curved arrow + snap onto an enemy."""
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    p = await card_pos(page, 0)          # Scratch — targets an enemy
    f = await foe_pos(page, "grumble")
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.wait_for_timeout(180)
    await page.mouse.down()
    c = Cap(page, "drag")
    steps = 14
    for i in range(1, steps + 1):
        t = i / steps
        await page.mouse.move(p["x"] + (f["x"] - p["x"]) * t, (p["y"] - 120) + (f["y"] - p["y"] + 120) * t)
        await page.wait_for_timeout(45)
        if i % 2 == 0:
            await c.frame(FULL_CLIP)
    # linger on the target so the reticle is unmistakable
    await page.wait_for_timeout(220)
    await c.frame(FULL_CLIP, tag="snapped")
    # slide off the enemy -> invalid state
    await page.mouse.move(f["x"] - 420, f["y"] + 60)
    await page.wait_for_timeout(220)
    await c.frame(FULL_CLIP, tag="unsnapped")
    await page.mouse.move(f["x"], f["y"])
    await page.wait_for_timeout(200)
    await page.mouse.up()
    c2 = Cap(page, "drag-release")
    await c2.strip(9, gap_ms=90, clip=FULL_CLIP)


async def scene_threshold(page):
    """Non-targeted card: the commit threshold line."""
    await size(page, 7)
    p = await card_pos(page, 1)          # Curl Up — self target
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.wait_for_timeout(150)
    await page.mouse.down()
    c = Cap(page, "threshold")
    await page.mouse.move(p["x"] + 20, p["y"] - 200)
    await page.wait_for_timeout(120); await c.frame(FULL_CLIP)
    await page.mouse.move(p["x"] + 40, p["y"] - 330)
    await page.wait_for_timeout(120); await c.frame(FULL_CLIP)
    await page.mouse.move(p["x"] + 60, p["y"] - 480)
    await page.wait_for_timeout(160); await c.frame(FULL_CLIP)
    await page.mouse.up()
    await c.strip(6, gap_ms=90, clip=FULL_CLIP)


async def scene_play(page):
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(5)")
    await page.wait_for_timeout(300)
    c = Cap(page, "play")
    await c.frame(FULL_CLIP)
    await slow(page, 0.32)
    await page.evaluate("""()=>{const k=window.MMTEST.hand.cards()[3];
                              window.MMTEST.hand.playCard(k.uid, 'grumble');}""")
    await c.strip(12, gap_ms=0, clip=FULL_CLIP)
    await slow(page, 1.0)


async def scene_draw(page):
    await size(page, 3)
    await page.wait_for_timeout(500)
    c = Cap(page, "draw")
    await c.frame(HAND_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-draw-5")
    await c.strip(10, gap_ms=0)
    await slow(page, 1.0)


async def scene_discard(page):
    await size(page, 8)
    await page.wait_for_timeout(500)
    c = Cap(page, "discard")
    await c.frame(FULL_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-discard-all")
    await c.strip(10, gap_ms=0, clip=FULL_CLIP)
    await slow(page, 1.0)


async def scene_exhaust(page):
    await size(page, 6)
    await page.wait_for_timeout(500)
    c = Cap(page, "exhaust")
    await c.frame(HAND_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-exhaust")
    await c.strip(10, gap_ms=0)
    await slow(page, 1.0)


async def scene_unplayable(page):
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(1)")
    await page.wait_for_timeout(700)
    c = Cap(page, "unplayable")
    await c.frame(HAND_CLIP, tag="e1")
    await page.evaluate("()=>window.MMTEST.setEnergy(0)")
    await page.wait_for_timeout(600)
    await c.frame(HAND_CLIP, tag="e0")
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(600)


async def scene_upgrade(page):
    """Upgrade + the live preview recolour (the §2 requirement)."""
    await size(page, 6)
    await page.wait_for_timeout(500)
    c = Cap(page, "upgrade")
    await c.frame(HAND_CLIP, tag="before")
    await page.click("#btn-upgrade-all")
    await page.wait_for_timeout(500)
    await c.frame(HAND_CLIP, tag="after")
    # preview recolour: hold a card over the vulnerable foe, then the resistant one
    p = await card_pos(page, 0)
    for fid, tag in (("grumble", "boosted"), ("chandy", "reduced")):
        f = await foe_pos(page, fid)
        await page.mouse.move(p["x"], p["y"] - 120)
        await page.mouse.down()
        await page.mouse.move(f["x"], f["y"], steps=8)
        await page.wait_for_timeout(320)
        await c.frame({"x": 330, "y": 240, "width": 840, "height": 560}, tag=tag)
        await page.mouse.move(p["x"], p["y"] - 120, steps=6)
        await page.mouse.up()
        await page.wait_for_timeout(350)


async def scene_keyboard(page):
    await size(page, 7)
    await page.wait_for_timeout(500)
    c = Cap(page, "keyboard")
    await page.keyboard.press("3")
    await page.wait_for_timeout(200); await c.frame(HAND_CLIP, tag="select3")
    await page.keyboard.press("ArrowRight")
    await page.wait_for_timeout(200); await c.frame(HAND_CLIP, tag="right")
    await page.keyboard.press("1")
    await page.wait_for_timeout(200)
    await page.keyboard.press("Enter")          # Scratch needs a target -> aim mode
    await page.wait_for_timeout(300); await c.frame(FULL_CLIP, tag="aim")
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(300); await c.frame(FULL_CLIP, tag="tab")
    await page.keyboard.press("Enter")
    await c.strip(7, gap_ms=90, clip=FULL_CLIP)


async def scene_perf(page):
    """60fps with 12 cards while dragging is a hard requirement."""
    await size(page, 12)
    await page.evaluate("()=>window.MMTEST.setEnergy(9)")
    await page.wait_for_timeout(600)
    p = await card_pos(page, 0)
    f = await foe_pos(page, "grumble")
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.mouse.down()
    task = asyncio.ensure_future(page.evaluate("()=>window.MMTEST.fps()"))
    for i in range(40):
        t = (i % 20) / 20
        await page.mouse.move(p["x"] + (f["x"] - p["x"]) * t, (p["y"] - 120) + (f["y"] - p["y"] + 120) * t)
        await page.wait_for_timeout(22)
    fps = await task
    await page.mouse.up()
    print(f"  fps during 12-card drag: {fps}")
    c = Cap(page, "perf")
    await size(page, 12)
    await c.frame(HAND_CLIP, tag="n12")


async def scene_pointer(page):
    """B5 regression: the hand must not hit-test over anything but the fan.

    A Hand is mounted into a full-bleed host so it can fly cards to the pile
    markers in the corners. That host defaults to `pointer-events:auto`, and
    for one round it sat over the whole board at z-index 200 — every enemy,
    every intent, every status tooltip was unreachable by the mouse. This
    asserts the fix AND the thing the fix must not break: hover on the seam
    between two cards must never oscillate.
    """
    await size(page, 7)
    await page.mouse.move(5, 5)
    await page.wait_for_timeout(400)
    facts = await page.evaluate("""()=>{
      const q = s => document.querySelector(s);
      const pe = e => getComputedStyle(e).pointerEvents;
      const hit = q('.mm-hand__hit'), hr = hit.getBoundingClientRect();
      const chain = (x,y) => { let e = document.elementFromPoint(x,y), o = [];
        while (e && o.length < 4) { o.push(e.tagName.toLowerCase()
          + '.' + (e.getAttribute('class')||'').split(' ')[0]); e = e.parentElement; }
        return o.join(' < '); };
      const foes = [...document.querySelectorAll('.foe__body')].map(e => {
        const b = e.getBoundingClientRect();
        return { reached: chain(b.x + b.width/2, b.y + b.height/2) }; });
      const cards = [...document.querySelectorAll('.mm-hand__cards .mm-card')].map(e => {
        const b = e.getBoundingClientRect();
        return { pe: pe(e), hitByOwnCentre:
          !!(document.elementFromPoint(b.x + b.width/2, b.y + b.height/2) || {}).closest?.('.mm-card') }; });
      return {
        hostPE: pe(q('.mm-hand').parentElement),
        hostHasClass: q('.mm-hand').parentElement.classList.contains('mm-hand-host'),
        handPE: pe(q('.mm-hand')),
        cardPE: cards[0] && cards[0].pe,
        hitPE: pe(hit),
        hitBox: { x: Math.round(hr.x), y: Math.round(hr.y),
                  w: Math.round(hr.width), h: Math.round(hr.height) },
        viewport: { w: innerWidth, h: innerHeight },
        foesReachable: foes.filter(f => f.reached.startsWith('div.foe')).length,
        foesTotal: foes.length,
        cardsHittable: cards.filter(c => c.hitByOwnCentre).length,
        cardsTotal: cards.length,
      };
    }""")
    print("  pointer:", json.dumps(facts))
    ok = []
    ok.append(("host inert", facts["hostPE"] == "none" and facts["hostHasClass"]))
    ok.append(("every foe reachable", facts["foesReachable"] == facts["foesTotal"]))
    ok.append(("every card its own hit target",
               facts["cardsHittable"] == facts["cardsTotal"] and facts["cardPE"] == "auto"))
    ok.append(("hit box is the fan, not the viewport",
               facts["hitBox"]["w"] < facts["viewport"]["w"]
               and facts["hitBox"]["y"] > facts["viewport"]["h"] * 0.45))

    # Playwright's ORDINARY actionability, on a card and on an enemy. The whole
    # point of B5: the reviewer had to drive the game with raw mouse.move/down/up.
    for sel in (".mm-hand__cards .mm-card >> nth=3", ".foe[data-id='grumble'] .foe__body"):
        try:
            await page.hover(sel, timeout=4000)
            ok.append((f"playwright hover {sel.split(' ')[0]}", True))
        except Exception as e:
            print("   hover failed:", str(e)[:200])
            ok.append((f"playwright hover {sel.split(' ')[0]}", False))
    try:
        await page.click(".mm-hand__cards .mm-card >> nth=6", timeout=4000)
        ok.append(("playwright click a card", True))
    except Exception as e:
        print("   click failed:", str(e)[:200])
        ok.append(("playwright click a card", False))
    await page.wait_for_timeout(900)

    # …and hover must still not oscillate on the seam between two cards.
    await size(page, 7)
    await page.mouse.move(5, 5)
    await page.wait_for_timeout(400)
    g = await page.evaluate(
        "[...document.querySelectorAll('.mm-hand__cards .mm-card')].map(e=>{"
        "const b=e.getBoundingClientRect();return{x:b.x,w:b.width,cy:b.y+b.height/2}})")
    seam = (g[3]["x"] + g[3]["w"] + g[4]["x"]) / 2
    await page.mouse.move(seam, g[3]["cy"])
    await page.wait_for_timeout(300)
    osc = await page.evaluate(
        "(async()=>{const o=[];const t0=performance.now();"
        "const f=()=>{const h=document.querySelector('.mm-card.is-hover');"
        "o.push(h?h.dataset.uid:null);"
        "if(performance.now()-t0<900)requestAnimationFrame(f);};"
        "requestAnimationFrame(f);await new Promise(r=>setTimeout(r,1000));return o})()")
    flips = sum(1 for a, b in zip(osc, osc[1:]) if a != b)
    print(f"  seam hover flips over 900ms: {flips}")
    ok.append(("zero seam-hover flips", flips == 0))
    Cap(page, "pointer")
    for name, good in ok:
        print(f"   {'PASS' if good else 'FAIL'}  {name}")
    assert all(g for _, g in ok), "pointer model regression: " + \
        ", ".join(n for n, g in ok if not g)
    await page.mouse.move(5, 5)


async def scene_art(page):
    """B7 regression: the companion slug must not decide the picture.

    Card ids are `<companion>/<card>`, and `subjectFor` used to match its rule
    table against the WHOLE id — so `bones/*` hit /bone/, `taffy/*` hit /taffy/
    and every card in those pools drew the same illustration. This walks the
    REAL registry, every companion, and asserts three things:
      1. no companion's pool is dominated by one subject;
      2. the subject the companion SLUG alone resolves to does not account for
         most of that companion's cards (the exact shape of the bug);
      3. the generated bitmaps are perceptually distinct — closest pair, on a
         16x16 downscale, must be a real distance from 0.
    """
    res = await page.evaluate("""(async()=>{
      const m = await import('/game/src/data/cards.js');
      const a = await import('/game/src/ui/cardart.js');
      const by = {};
      for (const d of m.allCards()) {
        const id = String(d.id);
        const comp = id.includes('/') ? id.split('/')[0] : (d.companion || 'neutral');
        (by[comp] = by[comp] || []).push({ id, name: d.name, sub: a.subjectFor(d) });
      }
      const out = {};
      for (const comp of Object.keys(by)) {
        const rows = by[comp];
        const count = {};
        for (const r of rows) count[r.sub] = (count[r.sub] || 0) + 1;
        // What the bare slug resolves to == what EVERY card in this pool used
        // to draw, whenever the slug itself matched a rule. Two different
        // `type`s agreeing means it was a rule hit, not a type-pool fallback.
        const s1 = a.subjectFor({ id: comp, name: '', type: 'attack' });
        const s2 = a.subjectFor({ id: comp, name: '', type: 'power' });
        const slugSub = s1 === s2 ? s1 : null;
        out[comp] = {
          n: rows.length, distinct: Object.keys(count).length,
          top: Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 5),
          slugSub, slugSubShare: slugSub ? +((count[slugSub] || 0) / rows.length).toFixed(3) : 0,
        };
      }
      return out;
    })()""")
    # perceptual distinctness, per companion, on the real bitmaps
    sim = await page.evaluate("""(async()=>{
      const m = await import('/game/src/data/cards.js');
      const a = await import('/game/src/ui/cardart.js');
      const by = {};
      for (const d of m.allCards()) {
        const id = String(d.id);
        const comp = id.includes('/') ? id.split('/')[0] : (d.companion || 'neutral');
        (by[comp] = by[comp] || []).push(d);
      }
      const out = {};
      for (const comp of Object.keys(by)) {
        // 30 per pool, evenly spread — the reviewer asked specifically for the
        // WORST-CASE closest pair inside ONE companion's pool, which is the
        // case a reward triple or a single hand can actually put side by side.
        const step = Math.max(1, Math.ceil(by[comp].length / 30));
        const pick = by[comp].filter((_, i) => i % step === 0).slice(0, 30);
        const grids = [];
        for (const d of pick) {
          const url = a.cardArt(d, 224, 126, {});
          const img = new Image(); img.src = url; await img.decode();
          const c = document.createElement('canvas'); c.width = 16; c.height = 16;
          c.getContext('2d').drawImage(img, 0, 0, 16, 16);
          grids.push([...c.getContext('2d').getImageData(0, 0, 16, 16).data]);
        }
        let worst = Infinity, pair = null;
        for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) {
          let s = 0; for (let k = 0; k < grids[i].length; k++) s += Math.abs(grids[i][k] - grids[j][k]);
          s /= grids[i].length;
          if (s < worst) { worst = s; pair = [pick[i].id, pick[j].id,
                                             a.subjectFor(pick[i]), a.subjectFor(pick[j])]; }
        }
        // and the same figure restricted to pairs that SHARE a silhouette,
        // which is the only way two cards can look like the same picture
        let sameWorst = Infinity, samePair = null;
        for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) {
          if (a.subjectFor(pick[i]) !== a.subjectFor(pick[j])) continue;
          let s = 0; for (let k = 0; k < grids[i].length; k++) s += Math.abs(grids[i][k] - grids[j][k]);
          s /= grids[i].length;
          if (s < sameWorst) { sameWorst = s; samePair = [pick[i].id, pick[j].id, a.subjectFor(pick[i])]; }
        }
        out[comp] = { sampled: pick.length, closest: +worst.toFixed(2), pair,
                      closestSameSubject: sameWorst === Infinity ? null : +sameWorst.toFixed(2),
                      samePair };
      }
      return out;
    })()""")
    bad = []
    for comp in sorted(res):
        r, s = res[comp], sim.get(comp, {})
        print(f"  {comp:11s} n={r['n']:3d} distinct={r['distinct']:2d} "
              f"slugSubject={r['slugSub']} share={r['slugSubShare']:.0%} "
              f"closestArt={s.get('closest')} {s.get('pair')}")
        print(f"              closest SAME-silhouette pair: {s.get('closestSameSubject')} "
              f"{s.get('samePair')}")
        print(f"              top: {r['top']}")
        if r["n"] >= 20:
            if r["slugSubShare"] > 0.45:
                bad.append(f"{comp}: {r['slugSubShare']:.0%} of the pool draws the SLUG subject "
                           f"'{r['slugSub']}' — the companion is picking the picture")
            if r["distinct"] < 6:
                bad.append(f"{comp}: only {r['distinct']} distinct subjects for {r['n']} cards")
        if s.get("closest") is not None and s["closest"] < 3.0:
            bad.append(f"{comp}: two cards draw the same picture ({s['pair']}, d={s['closest']})")
    for b in bad:
        print("   FAIL", b)
    assert not bad, "; ".join(bad)


async def scene_add(page):
    """`Hand.add()` — a card moved into hand from the discard pile.

    Public API another scene wires `card:move` to. It must not read as a draw,
    so this proves the two are different MOTIONS, not just different calls:
    a draw comes off the bottom-left pile on a monotonic rise; an add is lobbed
    off the bottom-right pile and its y is non-monotonic (it goes UP over the
    fan and comes back down).
    """
    await size(page, 5)
    await page.wait_for_timeout(500)

    async def trace(expr, ms=900):
        return await page.evaluate("""async ([expr, ms]) => {
            const h = window.MMTEST.hand;
            const before = new Set(h.slots.map(s => s.card.uid));
            (0, eval)(expr);
            const s = h.slots.find(x => !before.has(x.card.uid));
            if (!s) return null;
            const out = []; const t0 = performance.now();
            await new Promise(r => { const f = () => {
                out.push([+(performance.now()-t0).toFixed(0), +s.cur.x.toFixed(1), +s.cur.y.toFixed(1)]);
                performance.now()-t0 < ms ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); });
            return out;
        }""", [expr, ms])

    drawn = await trace("window.MMTEST.hand.draw([{def: window.MMTEST.CARDS[2]}])")
    await page.wait_for_timeout(900)
    await size(page, 5)
    await page.wait_for_timeout(500)
    c = Cap(page, "add")
    await c.frame(FULL_CLIP, tag="before")
    added = await trace("window.MMTEST.hand.add({def: window.MMTEST.CARDS[3]})")
    await c.strip(8, gap_ms=60, clip=FULL_CLIP)

    def rise(tr):
        """How far the path goes ABOVE its own endpoint: 0 for a slide."""
        end = tr[-1][2]
        return round(max(0.0, end - min(p[2] for p in tr)), 1)

    def origin(tr):
        return round(tr[0][1], 1)

    print(f"  draw : origin x={origin(drawn)} overshoot-above-rest={rise(drawn)}px")
    print(f"  add  : origin x={origin(added)} overshoot-above-rest={rise(added)}px")
    assert added is not None, "Hand.add() created no slot"
    assert origin(added) > origin(drawn) + 200, \
        "add must come off the DISCARD pile, draw off the DRAW pile"
    assert rise(added) > rise(drawn) + 60, \
        "add must be LOBBED (a real arc), draw must not be"
    n = await page.evaluate("window.MMTEST.hand.count")
    print(f"  hand count after add: {n}")


async def scene_figures(page):
    """Numerals must be LINING, at real hand scale, not zoomed in.

    Both card faces default to old-style figures: `1` draws as a small serif I
    and `0` as a lowercase o, which in a game built on reading numbers turns
    "Shed 1 Bone" into "Shed I Bone" and a 1-cost gem into a gem reading I.
    """
    await size(page, 7)
    await page.wait_for_timeout(600)
    c = Cap(page, "figures")
    await c.frame(HAND_CLIP, tag="hand")
    css = await page.evaluate("""()=>{
      const n = document.querySelector('.mm-card__num');
      const g = document.querySelector('.mm-card__cost');
      const r = document.querySelector('.mm-card__rules');
      const v = e => getComputedStyle(e).fontVariantNumeric;
      return { num: v(n), cost: v(g), rules: v(r) };
    }""")
    print("  font-variant-numeric:", json.dumps(css))
    for k, val in css.items():
        assert "lining-nums" in val, f"{k} is not lining ({val})"
    # Prove the feature is doing something, by INK and on the REAL elements —
    # not on a synthetic probe with a hand-written font stack. (A probe that
    # said `font-family:'Cinzel',serif` measured a font the card never uses and
    # reported the fix as a no-op.) Screenshot the card, force the feature off,
    # shoot again: identical bytes would mean the declaration buys nothing.
    #
    # Where the defect actually lived: `--font-body` (Grenze) draws the rules
    # text and its figures are OLD-STYLE — `0` is a lowercase o, `1` is a short
    # stem — so "exactly 0 Loose Bones" printed "exactly o Loose Bones". That is
    # the assertion. `--font-num` (Cinzel) was already lining, so the gem is
    # reported but not asserted; if a future token change swaps that face for an
    # old-style one, the `lining-nums` on the gem is already there to catch it.
    rules_sel = ".mm-hand__cards .mm-card >> nth=0 >> .mm-card__rules"
    cost_sel = ".mm-hand__cards .mm-card >> nth=0 >> .mm-card__cost"
    body_probe = """(fv)=>{
      let e = document.getElementById('mm-fig-body');
      if (!e) { e = document.createElement('span'); e.id = 'mm-fig-body';
        document.body.appendChild(e); }
      e.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;'
        + 'color:#fff;font-family:var(--font-body);font-weight:400;font-size:64px;'
        + 'line-height:1.2;white-space:pre;font-variant-numeric:' + fv;
      e.textContent = '0123456789 exactly 0 Loose Bones, shed 1';
    }"""
    await page.evaluate(body_probe, "lining-nums tabular-nums")
    await page.wait_for_timeout(250)
    lining = {
        "rules text": await page.locator(rules_sel).screenshot(),
        "cost gem": await page.locator(cost_sel).screenshot(),
        "--font-body figures": await page.locator("#mm-fig-body").screenshot(
            path=os.path.join(SHOTS, "cf-figures-body-lining.png")),
    }
    await page.locator(".mm-hand__cards .mm-card >> nth=0").screenshot(
        path=os.path.join(SHOTS, "cf-figures-lining.png"))
    await page.evaluate(body_probe, "normal")
    await page.add_style_tag(content=(
        ".mm-card, .mm-card__num, .mm-card__cost, .mm-card__rules"
        " { font-variant-numeric: normal !important; }"))
    await page.wait_for_timeout(250)
    oldstyle = {
        "rules text": await page.locator(rules_sel).screenshot(),
        "cost gem": await page.locator(cost_sel).screenshot(),
        "--font-body figures": await page.locator("#mm-fig-body").screenshot(
            path=os.path.join(SHOTS, "cf-figures-body-oldstyle.png")),
    }
    await page.locator(".mm-hand__cards .mm-card >> nth=0").screenshot(
        path=os.path.join(SHOTS, "cf-figures-oldstyle.png"))
    await page.evaluate("()=>{[...document.querySelectorAll('style')].pop()?.remove();"
                        "document.getElementById('mm-fig-body')?.remove();}")
    await page.wait_for_timeout(200)
    for k in lining:
        print(f"  {k}: lining-nums changes the rendered ink: {lining[k] != oldstyle[k]}")
    print("  proof pair: shots/cf-figures-lining.png vs shots/cf-figures-oldstyle.png")

    # ── the assertion, on the OUTCOME rather than on the side effect ─────────
    # Round 3 asserted "turning `lining-nums` off changes the pixels", which
    # proved the declaration was load-bearing at the time. It is the wrong
    # thing to assert: the vendored Grenze subset now DEFAULTS to lining, so
    # the declaration is (correctly) a belt-and-braces no-op and the old
    # assertion fails while the game is right. What has to be true is the
    # thing the player sees — `0` must be a figure-height zero, not a
    # lowercase o, and `1` must be taller than an x-height glyph. Measure the
    # ink directly, so this holds for whatever face the token names next.
    # Measured off a real DOM RASTER, not off a canvas: `ctx.font` with the
    # same family silently renders a different set of default figures than the
    # DOM does (it reported `0` at x-height while the DOM drew it at figure
    # height), so a canvas probe here would fail a face that is actually fine.
    from PIL import Image
    await page.evaluate("""()=>{
      let e = document.getElementById('mm-fig-ink');
      if (!e) { e = document.createElement('div'); e.id = 'mm-fig-ink'; document.body.appendChild(e); }
      e.style.cssText = 'position:fixed;left:0;top:120px;z-index:99999;background:#000;'
        + 'color:#fff;font-family:var(--font-body);font-weight:400;font-size:64px;'
        + 'line-height:1.3;white-space:pre;padding:6px 10px;letter-spacing:.35em;';
      e.textContent = '0 1 x o H';
    }""")
    await page.wait_for_timeout(300)
    ink_png = os.path.join(SHOTS, "cf-figures-ink.png")
    await page.locator("#mm-fig-ink").screenshot(path=ink_png)
    await page.evaluate("()=>document.getElementById('mm-fig-ink')?.remove()")
    im = Image.open(ink_png).convert("L")
    w, h = im.size
    px = im.load()
    colink = [any(px[x, y] > 128 for y in range(h)) for x in range(w)]
    groups, s = [], None
    for x, v in enumerate(colink):
        if v and s is None: s = x
        if not v and s is not None: groups.append((s, x)); s = None
    if s is not None: groups.append((s, w))
    def ink_h(a, b):
        top = bot = None
        for y in range(h):
            if any(px[x, y] > 128 for x in range(a, b)):
                if top is None: top = y
                bot = y
        return 0 if top is None else bot - top + 1
    hs = [ink_h(a, b) for a, b in groups]
    assert len(hs) == 5, f"expected 5 glyphs in {ink_png}, found {len(hs)}"
    zero, one, xh, oh, cap = hs
    print(f"  ink heights at 64px (DOM raster): 0={zero} 1={one} x={xh} o={oh} H={cap}")
    assert cap > 0, "nothing rendered — the rules face did not load"
    assert zero >= cap * 0.9, (
        f"`0` renders {zero}px tall against a cap H at {cap}px — that is an OLD-STYLE "
        f"figure and 'exactly 0' will print as 'exactly o' (o is {oh}px)")
    assert one >= cap * 0.9, (
        f"`1` renders {one}px tall against a cap H at {cap}px — 'Shed 1 Bone' will print "
        f"with a stubby figure one (x is {xh}px)")


# ── round 4 regressions ─────────────────────────────────────────────────────
# One shared probe: the geometry of the fan, measured off the DOM only (so the
# same expression works against the real game), with rules-text occlusion
# computed on the TRUE rotated quads rather than on bounding boxes.
GEOM_JS = r"""
(() => {
  const els = [...document.querySelectorAll('.mm-hand__cards .mm-card')];
  if (!els.length) return null;
  const hb = els[0].closest('.mm-hand').getBoundingClientRect();
  const parse = (e) => {
    const t = e.style.transform;
    return { x: +/translate3d\(([-\d.]+)px/.exec(t)[1] + hb.left,
             y: +/translate3d\([-\d.]+px,\s*([-\d.]+)px/.exec(t)[1] + hb.top,
             rot: +/rotate\(([-\d.]+)deg\)/.exec(t)[1],
             scale: +/scale\(([-\d.]+)\)/.exec(t)[1] };
  };
  const s0 = parse(els[0]);
  const cw = els[0].offsetWidth * s0.scale, ch = els[0].offsetHeight * s0.scale;
  const rows = els.map((e) => {
    const s = parse(e), r = e.getBoundingClientRect();
    const rad = s.rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
    const q = (lx, ly) => [s.x + lx * co + ly * si, s.y - ly * co + lx * si];
    // The rules box is 12u..212u of the 224u grid and 15u..126u above the
    // card's bottom edge — see the anatomy note at the top of card.css.
    return { rot: s.rot, anchorX: s.x, l: r.left, r: r.right, bottom: r.bottom,
             cy: r.y + r.height / 2,
             quad: [q(-cw / 2, 0), q(cw / 2, 0), q(cw / 2, ch), q(-cw / 2, ch)],
             text: [q(-cw * 0.4464, ch * 0.0481), q(cw * 0.4464, ch * 0.0481),
                    q(cw * 0.4464, ch * 0.4038), q(-cw * 0.4464, ch * 0.4038)] };
  });
  const sat = (A, B) => {                       // 0 == no intersection
    let best = Infinity;
    for (const P of [A, B]) for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1;
      const pr = (Q) => { let lo = Infinity, hi = -Infinity;
        for (const p of Q) { const v = (p[0] * nx + p[1] * ny) / L; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return [lo, hi]; };
      const [a0, a1] = pr(A), [b0, b1] = pr(B);
      const ov = Math.min(a1, b1) - Math.max(a0, b0);
      if (ov <= 0) return 0;
      best = Math.min(best, ov);
    }
    return best;
  };
  let occ = 0, worst = 0;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const d = sat(rows[i].text, rows[j].quad);   // j is drawn over i
      if (d > 0.5) { occ++; worst = Math.max(worst, d); }
    }
  const left = Math.min(...rows.map(r => r.l)), right = Math.max(...rows.map(r => r.r));
  return {
    n: rows.length, vw: innerWidth, vh: innerHeight,
    cardW: +cw.toFixed(1), cardH: +ch.toFixed(1),
    step: rows.length > 1 ? +(rows[1].anchorX - rows[0].anchorX).toFixed(1) : 0,
    bodyOverlap: rows.length > 1 ? +(cw - (rows[1].anchorX - rows[0].anchorX)).toFixed(1) : 0,
    rots: rows.map(r => +r.rot.toFixed(2)),
    arcDropPx: +(Math.max(...rows.map(r => r.cy)) - Math.min(...rows.map(r => r.cy))).toFixed(1),
    handSpan: +(right - left).toFixed(1), empty: +(innerWidth - (right - left)).toFixed(1),
    textOcclusions: occ, worstTextOverlapPx: +worst.toFixed(1),
    maxBottom: +Math.max(...rows.map(r => r.bottom)).toFixed(1),
  };
})()
"""


async def scene_spread(page):
    """B-round-4 #2: the hand spreads, and no card covers another's rules text.

    Round 3 spaced every hand at a flat 0.82 card widths, so five cards on a
    1920 screen overlapped 44px, clipped a slice of every neighbour's rules
    text and left 1136px of empty table. STS2-REFERENCE §1: "with few cards
    the arc flattens". The contract asserted here:
      * for n <= 6, ZERO cards occlude a neighbour's rules text — measured on
        the rotated quads, at 1600x900 and 1920x1080, normal AND Large Text;
      * the arc really does flatten with few cards, and MONOTONICALLY: the fan
        half-angle must not fall as a card is added, or drawing a card would
        collapse the fan and drawing another would spring it open;
      * nothing is clipped at the bottom at any size (the round-2 contract).
    n = 7 and n = 12 are deliberately NOT in the clearance set: at those sizes
    StS overlaps too, and the safe band cannot hold them separated.
    """
    bad, rows = [], []
    SIZES = (1, 2, 3, 4, 5, 6, 7, 8, 12)
    for vw, vh in ((1600, 900), (1920, 1080)):
        await page.set_viewport_size({"width": vw, "height": vh})
        await page.wait_for_timeout(500)
        for big in (False, True):
            if big != await page.evaluate("()=>!!MMTEST.hand.largeText"):
                await page.click("#btn-large-text")
                await page.wait_for_timeout(400)
            arc = []
            for n in SIZES:
                await size(page, n)
                g = await page.evaluate(GEOM_JS)
                g["large"] = big
                rows.append(g)
                arc.append((n, max(abs(r) for r in g["rots"])))
                tag = f"{vw}x{vh} n={n}{' large' if big else ''}"
                print(f"  {tag:22s} cardW={g['cardW']:5.0f} step={g['step']:6.1f} "
                      f"overlap={g['bodyOverlap']:6.1f} span={g['handSpan']:6.0f} "
                      f"empty={g['empty']:5.0f} textOccl={g['textOcclusions']} "
                      f"worst={g['worstTextOverlapPx']:5.1f} maxRot={arc[-1][1]:5.2f}")
                if n <= 6 and g["textOcclusions"]:
                    bad.append(f"{tag}: {g['textOcclusions']} cards cover a neighbour's rules "
                               f"text (worst {g['worstTextOverlapPx']}px)")
                if g["maxBottom"] > vh - 8:
                    bad.append(f"{tag}: clipped, maxBottom {g['maxBottom']} > {vh - 8}")
            print(f"    arc half-angle by hand size: "
                  + "  ".join(f"{n}:{a:.2f}" for n, a in arc))
            if arc[2][1] >= arc[-1][1]:
                bad.append(f"{vw}: the arc does not flatten with few cards — "
                           f"n=3 {arc[2][1]:.2f} deg vs n=12 {arc[-1][1]:.2f} deg")
            for (na, a), (nb, b) in zip(arc, arc[1:]):
                if b < a - 0.01:
                    bad.append(f"{vw}: the fan COLLAPSES from n={na} ({a:.2f} deg) to "
                               f"n={nb} ({b:.2f} deg) — adding a card must never flatten it")
    if await page.evaluate("()=>!!MMTEST.hand.largeText"):
        await page.click("#btn-large-text")
    await page.set_viewport_size({"width": W, "height": H})
    await page.wait_for_timeout(400)
    c = Cap(page, "spread")
    for n in (3, 5, 7):
        await size(page, n)
        await c.frame(HAND_CLIP, tag=f"n{n}")
    for b in bad:
        print("   FAIL", b)
    assert not bad, "; ".join(bad)


async def scene_hoverfeel(page):
    """B-round-4 #1: mousemove -> settled, and how far the card actually moves.

    The reviewer measured 168ms from the mouse moving (67ms of it before the
    first pixel), a 116px rise and 1.108x. StS2's bar is <120ms, 40-60px,
    1.15-1.25x. This measures the same three things the same way — the
    pointermove is timestamped by a capture-phase listener in the page, the
    box is sampled every frame — and asserts the bar.
    """
    probe = r"""
    (async ([sel, ms]) => {
      const el = document.querySelector(sel);
      const box = () => { const r = el.getBoundingClientRect();
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { top:+r.top.toFixed(2), cy:+(r.y+r.height/2).toFixed(2),
                 sc:+Math.hypot(m.a,m.b).toFixed(4) }; };
      const base = box(), t0 = performance.now();
      let pm = null, worst = 0, prev = t0;
      const cap = () => { if (pm === null) pm = performance.now() - t0; };
      window.addEventListener('pointermove', cap, true);
      const s = [];
      await new Promise(res => { const f = () => { const now = performance.now();
        if (s.length) worst = Math.max(worst, now - prev); prev = now;
        s.push([+(now - t0).toFixed(2), box()]);
        if (now - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      window.removeEventListener('pointermove', cap, true);
      return { base, pm, s, worst: +worst.toFixed(1) };
    })"""
    bad = []
    for n in (5, 7, 12):
        await size(page, n)
        await page.mouse.move(20, 20)
        await page.wait_for_timeout(400)
        i = n // 2
        b = await page.evaluate(
            "(i)=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[i];"
            "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height*0.62}}", i)
        task = asyncio.ensure_future(page.evaluate(
            probe, [f".mm-hand__cards .mm-card:nth-child({i+1})", 600]))
        await page.wait_for_timeout(140)
        await page.mouse.move(b["x"], b["y"], steps=1)
        r = await task
        base, sm, pm, end = r["base"], r["s"], r["pm"], r["s"][-1][1]
        first = settled = None
        for t, s in sm:
            if pm is None or t < pm:
                continue
            if first is None and abs(s["top"] - base["top"]) > 0.5:
                first = t
            if abs(s["top"] - end["top"]) < 0.5 and abs(s["sc"] - end["sc"]) < 0.002:
                if settled is None: settled = t
            else:
                settled = None
        fp = None if first is None else round(first - pm, 1)
        st = None if settled is None else round(settled - pm, 1)
        lift = round(base["top"] - end["top"], 1)
        sc = round(end["sc"] / base["sc"], 4)
        print(f"  n={n:2d}  event->firstPixel {fp}ms  event->settled {st}ms  "
              f"lift(top) {lift}px  lift(centre) {round(base['cy']-end['cy'],1)}px  "
              f"scale {sc}x  worstFrame {r['worst']}ms")
        if fp is None or fp > 8:
            bad.append(f"n={n}: {fp}ms before the first pixel moves — the lift must start "
                       f"in the same task as the pointer event")
        if st is None or st > 90:
            bad.append(f"n={n}: {st}ms from the event to settled (budget 90, so that a "
                       f"~60ms input+present pipeline still lands under STS2's 120)")
        if not (34 <= lift <= 66):
            bad.append(f"n={n}: the card rises {lift}px — StS2 is 40-60")
        if not (1.15 <= sc <= 1.25):
            bad.append(f"n={n}: hover scale {sc}x — StS2 is 1.15-1.25")
        await page.mouse.move(20, 20)
        await page.wait_for_timeout(300)
    await size(page, 7)
    for b in bad:
        print("   FAIL", b)
    assert not bad, "; ".join(bad)


AIM_JS = r"""
() => {
  const els = [...document.querySelectorAll('.mm-hand__cards .mm-card')];
  const rows = els.map((e) => {
    const r = e.getBoundingClientRect();
    return { z: +getComputedStyle(e).zIndex, op: +getComputedStyle(e).opacity,
             cls: e.className, x: r.x, y: r.y, w: r.width, h: r.height,
             rot: +(/rotate\(([-\d.]+)deg\)/.exec(e.style.transform) || [0, 0])[1] };
  });
  const aim = rows.find(r => /is-aiming/.test(r.cls));
  if (!aim) return { aiming: false, rows };
  const fan = rows.filter(r => r !== aim);
  const over = fan.filter(r => {
    const ox = Math.min(aim.x + aim.w, r.x + r.w) - Math.max(aim.x, r.x);
    const oy = Math.min(aim.y + aim.h, r.y + r.h) - Math.max(aim.y, r.y);
    return ox > 2 && oy > 2;
  });
  return { aiming: true, z: aim.z, maxFanZ: Math.max(...fan.map(r => r.z)),
           cardsDrawnOverIt: over.filter(r => r.z >= aim.z).length,
           opacity: aim.op, rot: aim.rot, overTarget: /is-over-target/.test(aim.cls),
           liftedAboveFan: +(Math.min(...fan.map(r => r.y)) - aim.y).toFixed(1) };
}
"""


async def scene_aim(page):
    """B-round-4 #3: the card you are aiming stays ON TOP, both input paths.

    Mid-drag the card follows the cursor, which reviewers liked. The moment
    the cursor entered the enemy it dropped back into its fan slot at z 20+i
    and two neighbours were drawn over it — it read as "I dropped it". On the
    keyboard path the cause was `_layout` having no idea the aim existed, so
    every relayout re-fanned the held card mid-decision.
    Asserted for both paths: zero cards drawn over it, rotation zeroed, and
    the card lifted clear of the top of the fan.
    """
    bad = []
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(400)

    # ── mouse ───────────────────────────────────────────────────────────────
    p = await card_pos(page, 0)              # Scratch — targets an enemy
    f = await foe_pos(page, "grumble")
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.wait_for_timeout(150)
    await page.mouse.down()
    await page.mouse.move(p["x"] + 40, p["y"] - 260, steps=6)
    await page.wait_for_timeout(120)
    await page.mouse.move(f["x"], f["y"], steps=10)
    await page.wait_for_timeout(420)
    m = await page.evaluate(AIM_JS)
    c = Cap(page, "aim")
    await c.frame(FULL_CLIP, tag="mouse")
    await page.mouse.move(20, 20)
    await page.mouse.up()
    await page.wait_for_timeout(600)
    print("  mouse:   ", json.dumps({k: v for k, v in m.items() if k != "rows"}))
    if not m.get("aiming"):
        bad.append("mouse: the card never entered aim mode on the enemy")
    else:
        if m["cardsDrawnOverIt"]:
            bad.append(f"mouse: {m['cardsDrawnOverIt']} fan cards are drawn over the aiming card")
        if m["z"] <= m["maxFanZ"]:
            bad.append(f"mouse: aiming z {m['z']} is not above the fan ({m['maxFanZ']})")
        if abs(m["rot"]) > 0.5:
            bad.append(f"mouse: the aiming card is still tilted {m['rot']} deg")
        if m["liftedAboveFan"] <= 0:
            bad.append("mouse: the aiming card is not lifted above the top of the fan")
        if not m["overTarget"] and m["opacity"] < 0.99:
            bad.append(f"mouse: the aiming card is faded to {m['opacity']} while nowhere "
                       f"near the target — that is what read as 'dropped'")

    # ── keyboard ────────────────────────────────────────────────────────────
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(400)
    await page.keyboard.press("1")
    await page.wait_for_timeout(250)
    await page.keyboard.press("Enter")           # -> aim mode
    await page.wait_for_timeout(420)
    k = await page.evaluate(AIM_JS)
    await c.frame(FULL_CLIP, tag="kbd")
    print("  keyboard:", json.dumps({kk: v for kk, v in k.items() if kk != "rows"}))
    if not k.get("aiming"):
        bad.append("keyboard: Enter on a targeted card did not enter aim mode")
    else:
        if k["cardsDrawnOverIt"]:
            bad.append(f"keyboard: {k['cardsDrawnOverIt']} fan cards are drawn over the aiming card")
        if abs(k["rot"]) > 0.5:
            bad.append(f"keyboard: the aiming card is still tilted {k['rot']} deg")
        if k["liftedAboveFan"] <= 0:
            bad.append("keyboard: the aiming card is not lifted above the top of the fan")
    # the case that actually broke: a relayout in the middle of the aim
    await page.keyboard.press("Tab")             # cycle target -> relayout
    await page.wait_for_timeout(320)
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")   # forces _refreshPlayable -> _layout
    await page.wait_for_timeout(320)
    k2 = await page.evaluate(AIM_JS)
    await c.frame(FULL_CLIP, tag="kbd-relayout")
    print("  after relayout:", json.dumps({kk: v for kk, v in k2.items() if kk != "rows"}))
    if not k2.get("aiming"):
        bad.append("keyboard: the aim was lost across a relayout")
    elif k2["cardsDrawnOverIt"] or k2["liftedAboveFan"] <= 0:
        bad.append("keyboard: a relayout mid-aim dropped the held card back into the fan "
                   f"(drawnOver={k2['cardsDrawnOverIt']} lift={k2['liftedAboveFan']})")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(300)
    for b in bad:
        print("   FAIL", b)
    assert not bad, "; ".join(bad)


async def scene_aria(page):
    """`aria-disabled` must say what the card looks like.

    An unaffordable card carries `is-unaffordable is-unplayable`, is
    desaturated, sits 24px lower and shakes when you try to play it — and used
    to announce `aria-disabled="false"`, because the flag it read (`disabled`)
    is never set by the Hand. Nothing important may be visual-only (§2).
    """
    await size(page, 7)
    bad = []
    for energy, want in ((3, None), (0, True)):
        await page.evaluate("(e)=>window.MMTEST.setEnergy(e)", energy)
        await page.wait_for_timeout(500)
        rows = await page.evaluate(
            "()=>[...document.querySelectorAll('.mm-hand__cards .mm-card')].map(e=>({"
            "id:e.dataset.cardId, un:e.classList.contains('is-unplayable'),"
            "ad:e.getAttribute('aria-disabled'), al:e.getAttribute('aria-label')}))")
        n_un = sum(1 for r in rows if r["un"])
        print(f"  energy {energy}: {n_un}/{len(rows)} unplayable")
        for r in rows:
            expect = "true" if r["un"] else "false"
            if r["ad"] != expect:
                bad.append(f"energy {energy}: {r['id']} is-unplayable={r['un']} but "
                           f"aria-disabled={r['ad']}")
            if r["un"] and "cannot be played" not in (r["al"] or ""):
                bad.append(f"energy {energy}: {r['id']} is unplayable but its label does not say so")
        if want and not n_un:
            bad.append("energy 0 made nothing unplayable — the probe proves nothing")
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(300)
    for b in bad:
        print("   FAIL", b)
    assert not bad, "; ".join(bad)


async def scene_reduce(page):
    await page.evaluate("""()=>{
        localStorage.setItem('mm.save.v1', JSON.stringify({settings:{reduceMotion:true}}));
    }""")
    await page.reload(wait_until="load")
    await page.wait_for_timeout(1200)
    c = Cap(page, "reduce")
    await c.frame(HAND_CLIP, tag="idle")
    await page.evaluate("()=>localStorage.removeItem('mm.save.v1')")


SCENES = {
    "idle": scene_idle, "gallery": scene_gallery, "hover": scene_hover,
    "drag": scene_drag, "threshold": scene_threshold, "play": scene_play,
    "draw": scene_draw, "discard": scene_discard, "exhaust": scene_exhaust,
    "unplayable": scene_unplayable, "upgrade": scene_upgrade,
    "keyboard": scene_keyboard, "perf": scene_perf,
    "pointer": scene_pointer, "art": scene_art, "add": scene_add,
    "figures": scene_figures,
    "spread": scene_spread, "hoverfeel": scene_hoverfeel,
    "aim": scene_aim, "aria": scene_aria,
    "reduce": scene_reduce,      # last: it reloads the page with reduceMotion
}


async def main(names):
    from playwright.async_api import async_playwright
    errors, logs = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        ])
        ctx = await browser.new_context(viewport={"width": W, "height": H},
                                        device_scale_factor=1, reduced_motion="no-preference")
        page = await ctx.new_page()
        page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2200)          # fonts + portraits + art

        for n in names:
            print(f"[{n}]")
            try:
                await SCENES[n](page)
            except Exception as e:
                errors.append(f"SCENE {n}: {e}")
                print("  FAILED:", e)

        await browser.close()

    if errors:
        print("\nJS/RUN ERRORS:")
        for e in errors[:25]:
            print("  " + str(e)[:400])
        open(os.path.join(SHOTS, "cf.console.txt"), "w", encoding="utf-8").write("\n".join(logs))
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        print(" ".join(SCENES)); sys.exit(0)
    sys.exit(asyncio.run(main(a.scenes or list(SCENES))))
