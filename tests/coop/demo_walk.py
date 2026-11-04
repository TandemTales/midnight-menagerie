"""The whole demo, played by a party over a wire as slow as a real one.

    python tests/coop/demo_walk.py [players] [seed-word] [--honest] [--shots DIR]

Needs the dev server on :8777. Every other co-op walk stops somewhere: latency.py after one
fight, rooms.py and rejoin.py at the rooms they came to test. This one starts in the lobby
and does not stop until the demo's ending, so it is the only thing that crosses a wing
boundary, a boss's reward, a story screen and the fork with players on separate machines.

Real tabs, real screens, a 60-180 ms wire. Rooms are answered by clicking what a player can
see. Players take their own time in them, so somebody is always waiting on somebody else,
and they vote for different doors when there is a choice.

The Kids are given a lot of Courage unless --honest, because this walks the road and
balance is tests/run's job. It fails if a machine ever disagrees with another, if nobody
can do anything for STALL seconds, or if any page logs an error.
"""
import asyncio
import json
import os
import random
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
HONEST = "--honest" in sys.argv
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
if SHOTS:
    ARGS = [a for a in ARGS if a != SHOTS]
PLAYERS = int(ARGS[0]) if ARGS else 2
ROOM = ARGS[1] if len(ARGS) > 1 else "owlish-lookout"
URL = "http://localhost:8777/game/index.html#demo=1"
LOW, HIGH = 60, 180
STALL = 150          # seconds with no scene, turn or log change on any machine
LIMIT = (75 + 60 * max(0, PLAYERS - 2)) * 60    # the tabs share one software renderer
fails, passes = [], []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""), flush=True)


SLOW_WIRE = """async ([low, high]) => {
  const { ChannelTransport } = await import('/game/src/net/transport.js');
  const send = ChannelTransport.prototype.send;
  /* What can walk an input past the agreed order: say so as it happens. */
  const { Session } = await import('/game/src/net/session.js');
  for (const name of ['absorb', '_forward', '_markLost', 'dropSeat']) {
    const was = Session.prototype[name];
    Session.prototype[name] = function (...a) {
      if (!(name === '_markLost' && this.lost.has(a[0])))
        console.info('[walk] seat ' + this.seat + ' ' + name + ' ' + (name === 'absorb' ? a[0].length + ' inputs' : a[0]));
      return was.apply(this, a);
    };
  }
  ChannelTransport.prototype.send = function (msg) {
    const q = this._slowQ || (this._slowQ = []);
    q.push({ at: performance.now() + low + Math.random() * (high - low), msg });
    const drain = () => {
      while (q.length && q[0].at <= performance.now()) {
        const m = q.shift();
        if (!this.closed) send.call(this, m.msg);
      }
      this._slowT = q.length ? setTimeout(drain, Math.max(1, q[0].at - performance.now())) : null;
    };
    if (!this._slowT) this._slowT = setTimeout(drain, Math.max(1, q[0].at - performance.now()));
    return true;
  };
}"""

STATE = """() => {
  const c = window.MM.ctx, r = c.run, s = r && r.session, e = r && r.combat;
  const seen = el => { const b = el.getBoundingClientRect(), st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  return {
    scene: c.scenes.currentName, busy: !!c.scenes.busy,
    net: !!(s && s.remote), seat: r ? r.localSeat : null, inSync: s ? s.inSync : null,
    drift: s && s.divergedAt ? JSON.stringify(s.divergedAt) : '',
    pending: s ? s.log.length - s._applied : 0, log: s ? s.log.length : 0,
    region: r ? r.region : null, wing: r ? r.regionIndex : null, wings: r ? r.wings : null,
    route: r && r.route ? r.route.join('>') : '', node: r ? r.currentNodeId : null,
    result: r ? r.result || null : null, demo: r ? !!r.demo : null,
    turn: e ? e.turn : 0, phase: e ? e.phase : null, over: e ? !!e.over : true,
    foes: e ? e.enemies.filter(x => x.alive).length : 0,
    digest: e ? r._combatDigest(e) : null,
    ended: e ? e.players.map(p => !!p.ended) : [],
    partyCourage: r ? r.kids.map(k => k.courage) : [],
    decks: r ? r.kids.map(k => k.deck.length) : [],
    plate: document.querySelector('.net-plate')?.textContent?.trim().slice(0, 160) || '',
    animating: window.__walkAnim ? { ...window.__walkAnim, for: Math.round(performance.now() - window.__walkAnim.at), queued: c.scenes.current?._q?.length ?? null } : null,
    queueTypes: (() => { const h = {}; for (const ev of c.scenes.current?._q || []) h[ev.type] = (h[ev.type] || 0) + 1; return h; })(),
    queueHead: (c.scenes.current?._q || []).filter(ev => ev.type === 'damage').slice(0, 8).map(ev => [ev.sourceId, ev.targetId, ev.amount, ev.hpLoss, ev.blocked]),
    maxQ: window.__walkMaxQ || 0,
    took: window.__walkTook ? Object.fromEntries(Object.entries(window.__walkTook).map(([k, v]) => [k, [v[1], Math.round(v[0] / v[1])]])) : null,
    fps: Math.round(1 / Math.max(.001, c.clock?.dt || 0)),
    screenSeat: c.scenes.current?.seatIndex ?? null,
    chooser: (() => { const ch = document.querySelector('.cb-chooser'); return !!(ch && !ch.hidden); })(),
    figures: e ? document.querySelectorAll('.cb-hero').length : null,
    gone: e ? e.players.filter(p => p.gone).length : 0,
    // A button past the edge of the window with nothing that scrolls to it cannot be pressed.
    stranded: [...document.querySelectorAll('button, .btn, .kit-btn')].filter(b => !b.disabled && seen(b)).filter(b => {
      const r = b.getBoundingClientRect();
      if (r.bottom <= innerHeight + 1 && r.top >= -1 && r.right <= innerWidth + 1 && r.left >= -1) return false;
      for (let p = b.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return false;
      }
      return true;
    }).map(b => (b.textContent || b.className.toString()).trim().replace(/\\s+/g, ' ').slice(0, 40)).slice(0, 6),
    buttons: [...document.querySelectorAll('button, [role=button], [role=option], .btn')]
      .filter(b => !b.disabled && seen(b)).map(b => ((b.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
        || b.getAttribute('aria-label') || b.className.toString().slice(0, 30))).slice(0, 24),
  };
}"""

PLAY = """async () => {
  const r = window.MM.ctx.run, e = r.combat;
  if (!e || e.over || e.phase !== 'player') return 'wait';
  const pl = e.players[r.session.seat];
  if (pl.ended || pl.fallen) return 'wait';
  const foes = e.enemies.filter(x => x.alive);
  for (let i = 0; i < pl.piles.hand.length; i++) {
    const c = pl.piles.hand[i];
    for (const t of [...foes.map(f => f.id), null]) {
      if (e.canPlay(c.uid, t).ok) {
        r.session.input({ t: 'play', seat: pl.seat, pile: 'hand', index: i, target: t });
        await Promise.race([r.session.whenApplied(r.session.log.length), new Promise(g => setTimeout(g, 2500))]);
        return 'play';
      }
    }
  }
  r.session.input({ t: 'end' });
  return 'end';
}"""

ANSWER = """() => {
  const ch = document.querySelector('.cb-chooser');
  if (!ch || ch.hidden) return null;
  const first = ch.querySelector('.cb-choice:not([disabled])');
  if (first) first.click();
  const ok = ch.querySelector('.cb-chooser__ok');
  if (ok && !ok.disabled) { ok.click(); return 'confirmed'; }
  const skip = ch.querySelector('.cb-chooser__skip');
  if (skip && !skip.hidden) { skip.click(); return 'skipped'; }
  return 'picked';
}"""

VOTE = """(pick) => {
  const r = window.MM.ctx.run;
  const ids = r.legalNextIds().sort();
  if (!ids.length) return null;
  const id = ids[pick % ids.length];
  const types = id => r.effectiveType(r.map.nodes.find(n => n.id === id));
  const sheet = window.MM.ctx.scenes.current;
  if (window.MM.ctx.scenes.currentName !== 'map' || !sheet._vote) return null;
  sheet._vote(id);
  return id + ':' + types(id) + ' of ' + ids.length;
}"""

# The fork, the way a player takes it: a door on the plan, then the dossier's own button.
ATLAS = """(pick) => {
  const r = window.MM.ctx.run, scene = window.MM.ctx.scenes.current;
  if (!r.pendingWing || r.pendingWing.votes[r.session.seat] !== undefined) return null;
  const go = document.querySelector('.at-go');
  const b = go && go.getBoundingClientRect();
  if (go && !go.disabled && b.height > 0 && scene.hover && scene.offered.has(scene.hover)) {
    const onScreen = b.bottom <= innerHeight && b.top >= 0;
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    go.click();
    return { pressed: scene.hover, onScreen, reachable: !!hit && (hit === go || go.contains(hit)) };
  }
  const ids = r.pendingWing.options.map(o => o.to).sort();
  const hot = document.querySelector(`.at-hot[data-wing="${ids[pick % ids.length]}"]`);
  if (hot) hot.click();
  return { looked: ids[pick % ids.length], of: ids };
}"""

# Click the first enabled visible thing in the order a player would reach for it. `done` is
# what this tab has already done in this room, so it goes on to the door out.
ROOM_STEP = """(done) => {
  const seen = el => { const b = el.getBoundingClientRect(), st = getComputedStyle(el);
    return !el.disabled && b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const first = sel => [...document.querySelectorAll(sel)].find(seen);
  const picker = document.querySelector('.rm-picker');
  if (picker) {
    const ok = picker.querySelector('[data-ok]');
    if (ok && !ok.disabled) { ok.click(); return ['picker', 'confirmed']; }
    const card = [...picker.querySelectorAll('.rm-picker__grid > *')].find(seen);
    if (card) { (card.querySelector('button, [role=option]') || card).click(); return ['picker', 'picked']; }
    const cancel = picker.querySelector('[data-cancel]');
    if (cancel) { cancel.click(); return ['picker', 'cancelled']; }
    return null;
  }
  const steps = [
    ['fan', '.rw-fan [role=option]'], ['buy', '.sh-buy'], ['door', '.rs-door'],
    ['forge', '.rs-forgerow'], ['option', '.ev-opt'],
  ];
  for (const [key, sel] of steps) {
    if (done.includes(key)) continue;
    const el = first(sel);
    if (el) { el.click(); return [key, (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 44)]; }
  }
  const words = ['continue', 'back to the blueprint', 'pack up', 'leave', 'go on', 'move on', 'onward', 'take ', 'choose a trick',
                 'begin', 'next', 'walk on', 'carry on', 'on we go', 'go through', 'open the door'];
  // A card can be called Leave a Life Behind.
  const all = [...document.querySelectorAll('button, .btn, .rm-go, [role=button], .kit-btn')].filter(seen)
    .filter(b => !b.closest('.rw-fan, .sh-shelf, [role=option]'))
    .filter(b => !(b.textContent || '').trim().toLowerCase().startsWith('take none'));
  const out = all.find(b => words.some(w => (b.textContent || '').trim().toLowerCase().startsWith(w)));
  if (out) { out.click(); return ['out', (out.textContent || '').trim().slice(0, 44)]; }
  return null;
}"""

# Which beat the fight's screen is standing on, so a stall can name it.
WATCH_ANIM = """async () => {
  const { CombatScene } = await import('/game/src/scenes/combat.js');
  const animate = CombatScene.prototype._animate;
  const hist = window.__walkHist = {};
  window.__walkMaxQ = 0;
  CombatScene.prototype._animate = function (ev) {
    window.__walkAnim = { type: ev.type, seat: ev.seatId || null, at: performance.now() };
    hist[ev.type] = (hist[ev.type] || 0) + 1;
    window.__walkMaxQ = Math.max(window.__walkMaxQ, this._q.length);
    const began = performance.now();
    const out = animate.call(this, ev);
    Promise.resolve(out).then(() => {
      const took = performance.now() - began;
      const t = window.__walkTook = window.__walkTook || {};
      (t[ev.type] = t[ev.type] || [0, 0])[0] += took; t[ev.type][1]++;
    });
    return out;
  };
}"""

TOUGH = """() => { for (const k of window.MM.ctx.run.kids) { k.maxCourage = 900; k.courage = 900; } return true; }"""


async def main():
    from playwright.async_api import async_playwright
    errors = []
    tolerated = ("[net] the turn barrier",)
    rng = random.Random(ROOM)

    def watch(page, tag):
        def said(m):
            if m.text.startswith("[walk]"):
                print(f"          {tag} {m.text}", flush=True)
            elif m.type == "error" and not any(x in m.text for x in tolerated):
                errors.append(f"{tag} {m.text}")
                print(f"  ERROR  {tag} {m.text}", flush=True)
        page.on("pageerror", lambda e: errors.append(f"{tag} {e}"))
        page.on("console", said)

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        pages, cdps = [], []
        for i in range(PLAYERS):
            page = await ctx.new_page()
            watch(page, "ABCD"[i])
            await page.goto(URL, wait_until="load", timeout=90000)
            await page.wait_for_function("window.MM && window.MM.ctx && window.MM.ctx.scenes.currentName && !window.MM.ctx.scenes.busy", timeout=90000)
            cdp = await ctx.new_cdp_session(page)
            await cdp.send("Debugger.enable")
            cdps.append(cdp)
            await page.evaluate(SLOW_WIRE, [LOW, HIGH])
            await page.evaluate(WATCH_ANIM)
            await page.evaluate("(room) => window.MM.ctx.scenes.go('lobby', { room }, { instant: true })", ROOM)
            pages.append(page)
        await pages[0].wait_for_timeout(3000)
        # Friends do not all bring the same Companion, and nothing else in here would notice
        # a line of the game that reads the Kid at this screen instead of the party.
        for i, page in enumerate(pages):
            await page.evaluate("""([companion, kid]) => {
              const l = window.MM.ctx.scenes.current._lobby;
              l.setChoice({ ...l.me, companion, kid });
            }""", [["marmalade", "bones", "wisp", "crumbula"][i], ["maya", "mateo", "amina", "eli"][i]])
        await pages[0].wait_for_timeout(1000)
        for page in pages:
            await page.evaluate("() => window.MM.ctx.scenes.current._lobby.setReady(true)")
        await pages[0].wait_for_timeout(2000)
        for page in pages:
            if await page.evaluate("() => window.MM.ctx.scenes.current._lobby.isHost"):
                await page.evaluate("() => window.MM.ctx.scenes.current._lobby.go()")
                break

        loop = asyncio.get_event_loop()
        begin = loop.time()
        last_change = begin
        last_key = None
        last_place, last_moved = None, begin
        last_backlog = 0
        apart = 0
        scenes_seen, routes, rooms = set(), set(), []
        done_in_room = [[] for _ in pages]
        room_key = [None] * PLAYERS
        not_before = [0.0] * PLAYERS
        toughened = False
        fights = turns_compared = plays = 0
        last_turn = None
        drift = None
        votes_cast = {}
        shot_seen = set()
        stranded_for = {}
        figures_checked = False
        finished = False
        # A tab stuck in a loop never answers, and everything above waits on it without a word.
        async def stack_of(cdp):
            frames = []
            got = asyncio.Event()
            def paused(ev):
                frames.extend(f"{f['functionName']} {f['url'].split('/')[-1]}:{f['location']['lineNumber'] + 1}" for f in ev["callFrames"][:16])
                got.set()
            cdp.on("Debugger.paused", paused)
            await cdp.send("Debugger.pause")
            try:
                await asyncio.wait_for(got.wait(), 20)
            except asyncio.TimeoutError:
                frames.append("(not in JavaScript)")
            return " < ".join(frames)

        async def watchdog():
            while True:
                await asyncio.sleep(60)
                for i, pg in enumerate(pages):
                    try:
                        await asyncio.wait_for(pg.evaluate("1"), 180)
                    except asyncio.TimeoutError:
                        check(False, "every tab keeps answering", f"{'ABCD'[i]} stuck in {await stack_of(cdps[i])}")
                        print(f"RESULT: {len(passes)} passed, {len(fails)} failed", flush=True)
                        os._exit(1)
        asyncio.ensure_future(watchdog())

        while loop.time() - begin < LIMIT:
            st = await asyncio.gather(*[pg.evaluate(STATE) for pg in pages])
            key = json.dumps([[x["scene"], x["node"], x["turn"], x["log"], x["region"], x["phase"]] for x in st])
            now = loop.time()
            backlog = [(x["animating"] or {}).get("queued") or 0 for x in st]
            if any(b > 40 for b in backlog) and now - last_backlog > 20:
                last_backlog = now
                print(f"  [{int(now - begin):4d}s] animation backlog {backlog} run turn {[x['turn'] for x in st]} types {st[0]['queueTypes']} head {st[0]['queueHead'][:4]} took {st[0]['took']} fps {[x['fps'] for x in st]}", flush=True)
            if key != last_key or any(b > 0 and (x["animating"] or {}).get("for", 1e9) < 20000 for b, x in zip(backlog, st)):
                last_key, last_change = key, now
                if any(backlog):
                    last_moved = now
            # A repeated vote moves the log and nothing else, so walking on is judged apart.
            place = json.dumps([[x["scene"], x["node"], x["turn"], x["region"]] for x in st])
            if place != last_place:
                last_place, last_moved = place, now
            if now - last_change > STALL or now - last_moved > STALL * 2:
                check(False, "somebody can always do something", f"nothing moved for {int(now - min(last_change, last_moved))}s")
                for i, x in enumerate(st):
                    print("   ", "ABCD"[i], json.dumps({k: x[k] for k in ("scene", "node", "region", "turn", "phase", "ended", "plate", "animating", "queueTypes", "queueHead", "maxQ", "took", "fps", "buttons", "pending", "busy")}), flush=True)
                if SHOTS:
                    for i, pg in enumerate(pages):
                        await pg.screenshot(path=os.path.join(SHOTS, f"stall-{'ABCD'[i]}.png"))
                break

            if not all(x["inSync"] is not False for x in st):
                drift = next(x["drift"] for x in st if x["inSync"] is False) or "out of sync"
                check(False, "the game's own out-of-sync check stayed quiet", drift)
                break

            if all(x["net"] for x in st):
                routes.add(st[0]["route"])
                if not toughened and not HONEST:
                    await asyncio.gather(*[pg.evaluate(TOUGH) for pg in pages])
                    toughened = True
                # Boards compared when everybody is at rest in the same turn.
                if len({x["turn"] for x in st}) == 1 and all(x["phase"] == "player" and x["pending"] == 0 for x in st):
                    if len({json.dumps(x["ended"]) for x in st}) == 1 and st[0]["turn"]:
                        # Two tabs are read a moment apart, and one can be halfway through a
                        # Trick the other has finished. A real split stays split.
                        if len({x["digest"] for x in st}) != 1:
                            apart += 1
                            if apart >= 25:
                                check(False, "the boards agreed", " vs ".join(str(x["digest"])[:140] for x in st))
                                break
                        else:
                            apart = 0
                        t = (st[0]["node"], st[0]["turn"])
                        if t != last_turn:
                            last_turn, turns_compared = t, turns_compared + 1

            if all(x["scene"] == "gameover" or x["result"] for x in st) and all(x["scene"] == "gameover" for x in st):
                finished = True
                break

            acts = []
            for i, (pg, x) in enumerate(zip(pages, st)):
                if x["busy"] or now < not_before[i]:
                    continue
                scene = x["scene"]
                # A HUD slides in from outside the window, so it has to stay out to count.
                out_now = {(i, scene, words) for words in ([] if scene == "map" else x["stranded"])}
                for key in [k for k in stranded_for if k[0] == i and k not in out_now]:
                    del stranded_for[key]
                for key in out_now:
                    stranded_for[key] = stranded_for.get(key, 0) + 1
                    if stranded_for[key] == 40:
                        check(False, "every button can be reached", f"{scene}: {key[2]}")
                if scene not in scenes_seen:
                    scenes_seen.add(scene)
                    print(f"  [{int(now - begin):4d}s] first {scene}", flush=True)
                if SHOTS and (scene, x["seat"]) not in shot_seen:
                    shot_seen.add((scene, x["seat"]))
                    acts.append(pg.screenshot(path=os.path.join(SHOTS, f"{scene}-seat{x['seat']}.png")))
                rk = (scene, x["node"], x["region"])
                if rk != room_key[i]:
                    room_key[i] = rk
                    done_in_room[i] = []
                    if i == 0:
                        rooms.append(scene)
                        print(f"  [{int(now - begin):4d}s] {x['region']} {scene} {x['node'] or ''} | route {x['route']} | courage {x['partyCourage']} | decks {x['decks']}", flush=True)
                if scene == "combat":
                    if x["figures"] and not figures_checked:
                        figures_checked = True
                        check(x["figures"] == PLAYERS, "the whole party stands on the floor", f"{x['figures']} of {PLAYERS}")
                    if x["chooser"]:
                        acts.append(pg.evaluate(ANSWER))
                    elif x["phase"] == "player" and x["pending"] == 0:
                        acts.append(pg.evaluate(PLAY))
                        plays += 1
                elif scene == "map":
                    vk = (x["region"], x["node"], i)
                    if vk not in votes_cast:
                        votes_cast[vk] = await pg.evaluate(VOTE, rng.randrange(4))
                        print(f"          {'ABCD'[i]} votes {votes_cast[vk]}", flush=True)
                        not_before[i] = now + 1
                    elif now - last_change > 20:
                        # The vote may be for a door the room has since taken away.
                        votes_cast.pop(vk)
                elif scene == "atlas":
                    got = await pg.evaluate(ATLAS, rng.randrange(4))
                    if got:
                        print(f"          {'ABCD'[i]} atlas: {got}", flush=True)
                        if "pressed" in got:
                            check(got["onScreen"] and got["reachable"], "the fork's button can be reached", str(got))
                        not_before[i] = now + rng.uniform(.6, 3)
                elif scene in ("gameover", "lobby", "title", "select"):
                    pass
                else:
                    got = await pg.evaluate(ROOM_STEP, done_in_room[i])
                    if got:
                        if got[0] != "picker":
                            done_in_room[i].append(got[0])
                        print(f"          {'ABCD'[i]} {scene}: {got[0]} \"{got[1]}\"", flush=True)
                        # A player reads. Somebody is always waiting on somebody else.
                        not_before[i] = now + rng.uniform(.4, 4 if i else 1.2)
                    elif now - last_change > 45 and SHOTS:
                        print(f"          {'ABCD'[i]} {scene}: nothing to press {x['buttons']} plate={x['plate']!r}", flush=True)
                        not_before[i] = now + 15
            if acts:
                await asyncio.gather(*acts, return_exceptions=True)
            await pages[0].wait_for_timeout(200)

        st = await asyncio.gather(*[pg.evaluate(STATE) for pg in pages])
        check(finished, "the party reached the end of the demo", f"{[x['scene'] for x in st]} in {int(loop.time() - begin)}s")
        check(all(x["demo"] for x in st), "it was the demo on every machine")
        if finished:
            check(all(x["result"] == st[0]["result"] for x in st), "and every machine agrees how it ended", str([x["result"] for x in st]))
            if not HONEST:
                check(st[0]["result"] == "victory", "the ending is the demo's win", str(st[0]["result"]))
            check(len({x["route"] for x in st}) == 1, "and they walked one route", st[0]["route"])
            if st[0]["result"] == "victory":
                check(all(x["route"].count(">") == x["wings"] - 1 for x in st), "of all the demo's wings", st[0]["route"])
            check(len({json.dumps(x["partyCourage"]) for x in st}) == 1, "and came out with the same Courage", str(st[0]["partyCourage"]))
            check(len({json.dumps(x["decks"]) for x in st}) == 1, "and the same decks", str(st[0]["decks"]))
        check(all(x["inSync"] is not False for x in st), "nobody fell out of sync", st[0]["drift"])
        # What each player is told at the end is about their own Kid, and they are not all the same.
        told = await asyncio.gather(*[pg.evaluate("""() => {
          const s = window.MM.ctx.scenes.current?.summary, r = window.MM.ctx.run;
          return { kid: s && s.kid, mine: r ? r.kids[r.session.seat].kid : null };
        }""") for pg in pages])
        if finished:
            check(all(t["kid"] == t["mine"] for t in told), "each player's ending is their own Kid's", str(told))
        print(json.dumps({"rooms": rooms, "fights": rooms.count("combat"), "turns compared": turns_compared, "Tricks": plays, "scenes": sorted(scenes_seen)}))
        if SHOTS:
            for i, pg in enumerate(pages):
                await pg.screenshot(path=os.path.join(SHOTS, f"final-{'ABCD'[i]}.png"))
        await browser.close()

    for e in errors[:12]:
        print("  ERROR ", e[:300])
    check(not errors, "no page logged an error", f"{len(errors)} logged")
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
