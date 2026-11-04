"""Whose Trick is it? Every Trick and Power, played by a seat that is not the first.

    python tests/seat-sweep/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

The host is seat 0, and "whoever is acting" falls back to seat 0, so a Trick that lost
track of its seat gave its draws and discards to the host. Every machine agreed, so no
out-of-sync check could see it, and a suite that only plays seat 0 passes. 58 Tricks and
3 Powers did this until 2026-11-04.

This plays each Trick from seat 1 at a table of four and reads the host's piles, Nerve,
Guard, Courage and statuses. Powers fire later, so each also runs a full round against
the same round without it. Only a Trick that says it reaches a friend may touch the host:
those are listed below, and an entry that stops touching the host fails as stale.

Everything also has to finish. A Trick that asks forever fails here, and so does one
the engine's runaway net has to stop, against the Porcelain Twins: they copy every debuff
across, which is what froze House Guest's "until none are left".
"""
import json
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Each of these says so on its face: "a friend", "every Kid", "another Kid".
REACHES_A_FRIEND = {
    "boggle/everybody-under-the-bed", "mopsy/stuffing-between-us", "mopsy/bunny-pile",
    "wisp/pass-the-nightlight", "crumbula/table-for-two", "hush/pass-the-sock",
    "hush/coat-check", "hush/whisper-from-the-vent", "hush/everybody-act-natural",
    "hush/the-great-menagerie-heist", "truffle/lend-them-the-spiky-side",
    "truffle/group-huddle", "truffle/sweep-their-side-too",
}
POWER_REACHES_A_FRIEND = {"crumbula/everybody-gets-a-cape", "drizzle/thunder-buddies"}

SWEEP = """async () => {
  const { RNG } = await import('/game/src/core/rng.js');
  const { CombatEngine } = await import('/game/src/combat/engine.js');
  const { makeDummyParty, makeDummySetup } = await import('/game/src/combat/dummy.js');
  const CARDS = await import('/game/src/data/cards.js');
  const { buildEncounter } = await import('/game/src/data/encounters.js');
  const { getEnemy } = await import('/game/src/data/enemies/index.js');
  const real = console.error;
  let said = [];
  console.error = (...a) => said.push(a.map(x => x && x.stack ? x.message : String(x)).join(' ').slice(0, 200));
  const look = (p) => ({ hand: p.piles.hand.length, draw: p.piles.draw.length, discard: p.piles.discard.length, exhaust: p.piles.exhaust.length, energy: p.energy, block: p.block, hp: p.hp, st: [...p.statuses.entries()].map(([k, v]) => k + v).sort().join() });
  const diff = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]).map(k => k + ':' + a[k] + '>' + b[k]).join(' ');
  const table = async (slug, enemies) => {
    const e = makeDummyParty(new RNG(1899), 4, { companion: slug, decks: [0, 1, 2, 3].map(() => CARDS.startingDeckFor(slug)), maxHp: 74, strictCtx: false });
    await e.startCombat();
    return e;
  };
  const play = async (e, def, seat) => {
    const p = e.players[seat];
    e.addCard(def, 'hand', { to: p });
    p.energy = 9;
    return e.playCard(p.piles.hand[p.piles.hand.length - 1].uid, e.livingEnemies()[0]?.id);
  };
  const within = (promise, ms) => Promise.race([promise.then(() => true, () => true), new Promise(r => setTimeout(() => r(false), ms))]);
  const all = CARDS.allCards().filter(d => d.id && d.effect && d.companion);
  const out = { tricks: 0, powers: 0, touched: {}, powerTouched: {}, stuck: [], asksForever: [], threw: {}, runaway: [] };

  for (const def of all) {
    if (def.coop) continue;
    const e = await table(def.companion);
    let asks = 0;
    const ask = e.choices.ask.bind(e.choices);
    e.choices.ask = (o) => { if (++asks > 30) { out.asksForever.push(def.id); return Promise.resolve([]); } return ask(o); };
    said = [];
    const before = look(e.players[0]);
    if (!await within(play(e, def, 1), 1500)) { out.stuck.push(def.id); continue; }
    out.tricks++;
    const moved = diff(before, look(e.players[0]));
    if (moved) out.touched[def.id] = moved;
    if (said.length) out.threw[def.id] = said[0];
  }

  for (const def of all.filter(d => String(d.type).toLowerCase() === 'power')) {
    const round = async (withIt) => {
      const e = await table(def.companion);
      if (withIt) await play(e, def, 1);
      const mid = look(e.players[0]);
      for (const pl of e.players) await e.endTurn(pl);
      return diffable(mid, look(e.players[0]));
    };
    const diffable = (mid, next) => ({ mid: mid, next: next });
    const a = await round(false), b = await round(true);
    out.powers++;
    // Only the host's own piles and Nerve: the enemy's aim moves with any change at all.
    const keys = ['hand', 'draw', 'discard', 'exhaust', 'energy', 'st'];
    const moved = ['mid', 'next'].flatMap(w => keys.filter(k => a[w][k] !== b[w][k]).map(k => w + '.' + k + ':' + a[w][k] + '>' + b[w][k])).join(' ');
    if (moved) out.powerTouched[def.id] = moved;
  }

  /* Against the Twins, whose Joined copies every debuff back. */
  for (const def of all) {
    const rng = new RNG(1899);
    const e = new CombatEngine(makeDummySetup(rng, { companion: def.companion, deck: CARDS.startingDeckFor(def.companion), maxHp: 74, enemies: buildEncounter('nursery-scare-twins', rng).map(m => ({ ...m, def: getEnemy(m.enemyId) })) }));
    await e.startCombat();
    for (const f of e.livingEnemies()) for (const id of ['bite-mark', 'weak', 'vulnerable']) e.applyStatus(f, id, 3, { noJoin: true });
    said = [];
    e.addCard(def, 'hand', {});
    e.player.energy = 9;
    await within(e.playCard(e.player.piles.hand[e.player.piles.hand.length - 1].uid, e.livingEnemies()[0]?.id), 1500);
    if (said.some(x => x.includes('was stopped'))) out.runaway.push(def.id);
  }

  console.error = real;
  return out;
}"""

fails = []


def check(cond, label):
    (print("  PASS  " + label) if cond else (print("  FAIL  " + label), fails.append(label)))


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    # Any page of the site will do: the sweep imports what it needs, and this one has no renderer.
    page.goto("http://localhost:8777/tests/crumbula/index.html", wait_until="load", timeout=120000)
    page.wait_for_function("window.__DONE === true", timeout=300000)
    o = page.evaluate(SWEEP)
    browser.close()

touched, ptouched = set(o["touched"]), set(o["powerTouched"])
print(f"  {o['tricks']} Tricks played from seat 1, {o['powers']} Powers run for a round")
check(not touched - REACHES_A_FRIEND, "no Trick touches the host unless it says so: "
      + json.dumps({k: o["touched"][k] for k in sorted(touched - REACHES_A_FRIEND)}))
check(not REACHES_A_FRIEND - touched, "every Trick listed as reaching a friend still does: "
      + ", ".join(sorted(REACHES_A_FRIEND - touched)))
check(not ptouched - POWER_REACHES_A_FRIEND, "no Power touches the host's next turn unless it says so: "
      + json.dumps({k: o["powerTouched"][k] for k in sorted(ptouched - POWER_REACHES_A_FRIEND)}))
check(not POWER_REACHES_A_FRIEND - ptouched, "every Power listed as reaching a friend still does: "
      + ", ".join(sorted(POWER_REACHES_A_FRIEND - ptouched)))
check(not o["stuck"], "every Trick finishes: " + ", ".join(o["stuck"][:12]))
check(not o["asksForever"], "and none asks forever: " + ", ".join(o["asksForever"][:12]))
check(not o["threw"], "and none throws from another seat: " + json.dumps(dict(list(o["threw"].items())[:6])))
check(not o["runaway"], "and none has to be stopped against the Porcelain Twins: " + ", ".join(o["runaway"][:12]))
check(not errors, "no page error: " + "; ".join(errors[:3]))
print(f"\nRESULT: {o['tricks'] + o['powers']} played, {len(fails)} failed")
sys.exit(1 if fails else 0)
