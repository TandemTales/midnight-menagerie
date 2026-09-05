"""Every built Companion clip is reachable from the game.  OWNER: sprites.

    python tests/sprites/clips.py [--wait 40] [--w 1600] [--h 900]

`tests/sprites/check.py` proves the twelve clips were BUILT correctly.  Nothing
proved they were ever PLAYED.  They were not: seven of the twelve had a call
site and five -- `affection`, `caution`, `spark`, `spectral`, `zoomies` -- had
zero occurrences anywhere in `game/src`, so 13-19 MB of source sheets rendered
into atlases that the game never asked for.  Grep is what found it, months after
the pipeline was declared done, because a clip that is never requested throws
nothing, logs nothing, and looks exactly like a clip that is simply not playing
right now.

This drives the REAL game at http://localhost:8777/game/index.html with the real
CombatEngine and the real CombatScene, and asserts that each trigger actually
reaches the Companion's body.

HOW TO PROVE EACH ONE CAN FAIL (CONTRACTS 54).  Every check below is paired with
an edit to `game/src/scenes/combat.js` that turns it red:

  spark      delete the `ev.id === 'lives'` branch in `case 'counter'`.  The
             Lives track then moves in silence, which is what it did before.
  spectral   delete the `if (ev.prevented)` branch in `_animDamage`.  Red, and
             the dodge goes back to a red threat slash plus a floating "0" --
             the presentation a MISS was getting.
  caution    delete the `lethal && !this._cautioned` branch in
             `_renderIncoming`.  Deleting only the `_cautioned` LATCH instead
             turns the once-per-turn check red while leaving the first one
             green, which is the pair that matters: the latch is the whole
             reason the clip does not fire on mouse movement.
  zoomies    change `>= 2` to `>= 99` at the `else if (card)` play site.  The
             third Trick then plays `trick` like the first two.
  harness    delete `_installClipHarness()`; `__MM_CLIPS` goes undefined and
             `affection` can only be reached by sitting down in the Safe Room.
  fort       delete `_mountCompanion(wrap)` from `scenes/rest.js`; the fort goes
             back to the generic two-ear blob and `affection` has no home again.
  opening    drop `{ opening: 'idle' }` from the Safe Room's ClipPlayer.  Red,
             and the Kid walks into a blanket fort to find their Companion
             playing the ENTER COMBAT clip.
  kid        delete `_tickKid`'s swap, or blank the `kid:` passed to PlayerView
             in scenes/combat.js; the board goes back to one drawn rig for all
             eight Kids.
  alias      remove any Kid from `STILL_ALIAS` in ui/sprite.js.  Their slugs are
             first names (`priya`) and the art arrived under full ones (and one
             typo, `pryaSHah`), so without the table a Kid silently keeps the
             drawn rig -- exactly the failure this file exists to catch.
  palset     hard-code `pr-palset` back to a constant x.  Red on the widest
             Kid: a fixed offset tuned for one width puts the Companion inside
             Samir, who is 203 px of content against Priya's 120.

WARM THE ATLASES BEFORE ASSERTING.  `ClipPlayer.play()` on a clip whose webp has
not landed sets `_pending` and starts it later ("late rather than blank",
ui/sprite.js), so `sprite.name` still reads the PREVIOUS clip.  Only `idle`,
`attack`, `hurt` and `ready` are warm at mount; asserting without the preload
below fails eight of the twelve and blames the renderer for the network.

Prints `RESULT: n passed, m failed`.  Exit 0 only when m == 0.
"""
import argparse
import asyncio
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:8777/game/index.html"
# Parenthesised: it gets interpolated behind `!`.
SCENE = "(window.MM && window.MM.ctx.scenes.current)"

# Marmalade is the only Companion with animation built, so she is the only one
# who can answer this.  The other fifteen resolve to a one-frame still clip and
# are covered by `check.py`.
URL = BASE + "#scene=combat&seed=7&companion=marmalade"

WARM = """async () => {
  const p = window.MM.ctx.scenes.current.hero.sprite;
  await Promise.all(Object.keys(p.clips).map(n => p._atlas(n)));
  return Object.keys(p.clips).filter(n => p.isReady(n)).length;
}"""

# Each clip starts the moment it is asked for, once its atlas is in hand.
STARTS = """async () => {
  const bad = [];
  for (const n of __MM_CLIPS.list()) {
    __MM_CLIPS.play(n);
    await new Promise(r => setTimeout(r, 60));
    const cur = window.MM.ctx.scenes.current.hero.sprite.name;
    if (cur !== n) bad.push(n + '->' + cur);
  }
  __MM_CLIPS.play('idle');
  return bad;
}"""

# A Life moving in either direction is one Life Spark clip -- the brief builds it
# that way so the VFX, not the body, says which direction it went.
SPARK = """async () => {
  const s = window.MM.ctx.scenes.current;
  s.engine._emit('counter', { ownerId: s.me.id, id: 'lives', name: 'Lives',
                              before: 9, after: 8, delta: -1 });
  await new Promise(r => setTimeout(r, 260));
  return s.hero.sprite.name;
}"""

# Ghoststep calls `ctx.prevent()`, and damage.js still emits DAMAGE for it with
# `prevented: true` and every number at 0.
SPECTRAL = """async () => {
  const s = window.MM.ctx.scenes.current;
  s.hero.playClip('idle');
  s.engine._emit('damage', {
    sourceId: (s.engine.state.enemies[0] || {}).id || null,
    targetId: s.me.id, kind: 'attack', amount: 0, blocked: 0, hpLoss: 0,
    hpBefore: s.me.hp, hpAfter: s.me.hp, prevented: true });
  await new Promise(r => setTimeout(r, 420));
  return s.hero.sprite.name;
}"""

# Seed 7 opens on "Gains 5 Guard", so there is nothing incoming and
# `_renderIncoming` returns before it computes `lethal`.  Give the live enemy a
# real attacking intent -- previewIncoming reads `intent.damage * intent.hits`.
CAUTION = """async () => {
  const s = window.MM.ctx.scenes.current;
  s.hero.playClip('idle');
  const en = s.engine.enemies.find(e => e.alive && e.intent);
  const keep = en ? { d: en.intent.damage, h: en.intent.hits } : null;
  if (en) { en.intent.damage = 40; en.intent.hits = 1; }
  const hp = s.me.hp, blk = s.me.block;
  s._cautioned = false; s.me.hp = 10; s.me.block = 0;
  s._renderIncoming(0);
  await new Promise(r => setTimeout(r, 160));
  const first = s.hero.sprite.name;
  // Second call, same turn, same lethal board: the latch must swallow it.
  s.hero.playClip('idle'); s._renderIncoming(0);
  await new Promise(r => setTimeout(r, 160));
  const second = s.hero.sprite.name;
  s.me.hp = hp; s.me.block = blk;
  if (en && keep) { en.intent.damage = keep.d; en.intent.hits = keep.h; }
  s._renderIncoming(0);
  return { first, second };
}"""

# Real plays through `hand.playCard`, the same entry a click and the keyboard
# use, so this exercises _onPlay -> engine.playCard -> _animate.
# Every Kid slug has to resolve to something drawable.  Imported into the page
# rather than driven through eight navigations: the alias table is the thing
# under test, and it is one module away.
KIDS = """async () => {
  const m = await import('/game/src/ui/sprite.js');
  const out = [];
  for (const k of ['maya','mateo','amina','eli','priya','jordan','lena','samir']) {
    const p = new m.ClipPlayer(k, { opening: 'idle', warm: ['idle'] });
    await p.ready;
    out.push(k + ':' + (p.clips && p.clips.idle ? 'ok' : 'MISSING'));
  }
  return out;
}"""

# Samir is the widest Kid built (203 px of content against Priya's 120), so he
# is the one a fixed Companion offset fails on.
KIDRIG = """() => {
  const S = window.MM.ctx.scenes.current;
  const t = document.querySelector('.pr-palset').getAttribute('transform');
  const n = t.match(/-?[\d.]+/g).map(Number);
  const kb = document.querySelector('.pr-kid').getBBox();
  return {
    shown: (document.querySelector('.pr-kid') || {}).style.display === '',
    rigHidden: [...document.querySelectorAll('.pr-body, .pr-head, .pr-legf')]
                 .every(g => g.style.display === 'none'),
    palX: n[0], palY: n[1],
    kidHalf: Math.round(kb.width / 2),
    kid: S.hero.kid,
  };
}"""

ZOOMIES = """async () => {
  const s = window.MM.ctx.scenes.current, E = s.engine, p = s.hero.sprite;
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      if (!s._resolving && !s._draining && s._q.length === 0) return true;
      await new Promise(r => requestAnimationFrame(r));
    }
    return false;
  };
  const typeOf = (uid) => (E.card(uid) || {}).type;
  const log = [];
  E.current.energy = 99;
  await settle();
  for (let round = 0; round < 6; round++) {
    const hand = E.piles.hand.map(c => c.uid);   // card objects, not uids
    if (!hand.length) break;
    const before = E.seatStats(s.me).cardsPlayedThisTurn;
    // Once two are down insist on a Trick: the zoomies branch lives on the
    // non-attack path, the same place the keyword it mirrors lives.
    const want = before >= 2 ? hand.find(u => typeOf(u) !== 'attack') : hand[0];
    if (!want) break;
    const type = typeOf(want);
    E.current.energy = 99;
    s.hand.playCard(want);
    await settle();
    await new Promise(r => setTimeout(r, 120));
    log.push({ before, type, clip: p.name });
    if (before >= 2 && type !== 'attack') break;
  }
  return log;
}"""

# The Safe Room mounts a Companion too.  `.rs-pet` is the same flat stand-in
# PAL_ART is in combat, and it gets the same swap.
FORT = """() => {
  const s = window.MM.ctx.scenes.current;
  const sp = document.querySelector('.rs-petsprite');
  return {
    shown: !!sp && sp.style.display === '',
    glyphHidden: [...document.querySelectorAll('.rs-pet, .rs-petear')]
                   .every(g => g.style.display === 'none'),
    clip: s && s.pet ? s.pet.name : null,
  };
}"""


async def main(a):
    from playwright.async_api import async_playwright
    passed = failed = 0
    notes, errors = [], []

    def check(cond, label, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            notes.append(("PASS", label, detail))
        else:
            failed += 1
            notes.append(("FAIL", label, detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            # Reduced motion freezes every clip on frame 0 by design, which would
            # make all twelve look identical and none of them wrong.
            viewport={"width": a.w, "height": a.h}, reduced_motion="no-preference",
        )).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console",
                lambda m: errors.append("[error] " + m.text) if m.type == "error" else None)

        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_function(f"!!({SCENE}) && {SCENE}.engine", timeout=int(a.wait * 1000))
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=30000)
        await page.wait_for_function(
            f"{SCENE} && !{SCENE}._draining && {SCENE}._q.length === 0", timeout=30000)
        await page.wait_for_function("window.__MM_CLIPS && __MM_CLIPS.list().length > 0",
                                     timeout=30000)
        await page.wait_for_timeout(400)

        check(not errors, "the Scuffle screen loads with no JS errors",
              "; ".join(errors[:3]) or "clean")

        names = sorted(await page.evaluate("() => __MM_CLIPS.list()"))
        check(len(names) == 12, "all 12 clips reach the player",
              f"{len(names)}: {','.join(names)}")

        warm = await page.evaluate(WARM)
        check(warm == len(names), "every atlas decodes", f"{warm}/{len(names)}")

        bad = await page.evaluate(STARTS)
        check(not bad, "every clip starts when it is played",
              ", ".join(bad) or f"{len(names)}/{len(names)}")

        spark = await page.evaluate(SPARK)
        check(spark == "spark", "a Life moving plays `spark`", f"played '{spark}'")

        spectral = await page.evaluate(SPECTRAL)
        check(spectral == "spectral", "a prevented hit plays `spectral`",
              f"played '{spectral}'")

        caut = await page.evaluate(CAUTION)
        check(caut["first"] == "caution", "a lethal telegraph plays `caution`",
              f"played '{caut['first']}'")
        check(caut["second"] != "caution", "`caution` is latched to once a turn",
              f"second call played '{caut['second']}'")

        log = await page.evaluate(ZOOMIES)
        hit = [r for r in log if r["before"] >= 2 and r["type"] != "attack"]
        check(bool(hit) and hit[0]["clip"] == "zoomies",
              "the third Trick of a turn plays `zoomies`",
              (hit[0]["clip"] if hit else "no 3rd non-attack card was reachable")
              + "  " + json.dumps(log))

        check(not errors, "no JS errors after driving every trigger",
              "; ".join(errors[:3]) or "clean")

        # ── the Safe Room, where `affection` lives ──────────────────────────
        # `page.goto` to a URL that differs only in its hash is a same-document
        # navigation: main.js never re-runs and the scene never changes, so this
        # sat waiting 20s for a fort that was still a Scuffle screen.
        await page.goto(BASE + "#scene=rest&seed=7&companion=marmalade",
                        wait_until="load", timeout=60000)
        await page.reload(wait_until="load", timeout=60000)
        await page.wait_for_function(
            f"!!({SCENE}) && window.MM.ctx.scenes.currentName === 'rest'",
            timeout=int(a.wait * 1000))
        await page.wait_for_function("!!document.querySelector('.rs-petsprite')", timeout=20000)
        await page.wait_for_function(
            "document.querySelector('.rs-petsprite').style.display === ''", timeout=20000)
        fort = await page.evaluate(FORT)
        check(fort["shown"] and fort["glyphHidden"],
              "the fort swaps its blob for the Companion",
              f"shown={fort['shown']} glyphHidden={fort['glyphHidden']}")
        check(fort["clip"] == "idle", "the Safe Room opens on `idle`, not `ready`",
              f"opened on '{fort['clip']}'")

        sit = await page.query_selector('[data-opt="sit"]')
        check(sit is not None, "the Safe Room offers Sit", "" if sit else "no [data-opt=sit]")
        if sit:
            await sit.click()
            await page.wait_for_timeout(500)
            clip = await page.evaluate(f"() => {SCENE} && {SCENE}.pet && {SCENE}.pet.name")
            check(clip == "affection", "sitting with them plays `affection`",
                  f"played '{clip}'")

        check(not errors, "no JS errors in the Safe Room",
              "; ".join(errors[:3]) or "clean")

        # ── the Kids' own art on the board ─────────────────────────────────
        kids = await page.evaluate(KIDS)
        missing = [k for k in kids if k.endswith("MISSING")]
        check(not missing, "every Kid slug resolves to a still",
              ", ".join(missing) or f"{len(kids)}/8")

        await page.goto(BASE + "#scene=combat&seed=7&companion=marmalade&kid=samir",
                        wait_until="load", timeout=60000)
        await page.reload(wait_until="load", timeout=60000)
        await page.wait_for_function(f"!!({SCENE}) && {SCENE}.engine", timeout=int(a.wait * 1000))
        await page.wait_for_function(f"{SCENE} && {SCENE}._opening === false", timeout=30000)
        await page.wait_for_function(
            "document.querySelector('.pr-kid') && "
            "document.querySelector('.pr-kid').style.display === ''", timeout=20000)
        rig = await page.evaluate(KIDRIG)
        check(rig["shown"] and rig["rigHidden"],
              "the Kid's own art replaces the drawn rig",
              f"kid={rig['kid']} shown={rig['shown']} rigHidden={rig['rigHidden']}")
        check(rig["palX"] < -rig["kidHalf"],
              "the Companion stands clear of the widest Kid",
              f"palset x={rig['palX']} vs half-width {rig['kidHalf']}")
        check(rig["palY"] == -30, "the Companion stands on the floor line",
              f"palset y={rig['palY']} (want -SPRITE_RIG_DY = -30)")

        check(not errors, "no JS errors with a Kid on the board",
              "; ".join(errors[:3]) or "clean")
        await browser.close()

    print("every built Companion clip is reachable from the game\n")
    for st, lab, det in notes:
        print(f"  {st}  {lab:44s} {det}")
    print(f"\nRESULT: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=40)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    sys.exit(asyncio.run(main(ap.parse_args())))
