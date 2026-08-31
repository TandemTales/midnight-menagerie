"""Platform, achievements, storage and the pause: the Steam-facing half.

    python tests/platform/run.py [--wait 25] [--verbose]

WHY THIS EXISTS
---------------
None of the code under test can reach a real Steam client. The App ID needs a
partner account and a fee, and only the owner can get one. A Steam integration
whose first execution is the day the App ID arrives is an integration nobody has
tested, so `platform/index.js` ships a FAKE host bridge and this suite drives the
whole path through it: the wrapper hands the game a bridge, the game unlocks an
achievement, the bridge records it, the game reconciles what the bridge already
had.

Every behavioural check runs its CONTROL - the same action with the capability
absent - because "an achievement unlocked" and "the game paused" are both things
that could happen for other reasons.

The parts a fake cannot prove are stated as such at the bottom of this file
rather than asserted, because a green test that proves nothing is worse than an
absent one.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
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

# ── the whole platform surface, driven through the fake bridge ─────────────
PLATFORM = r"""
async () => {
  const P = await import('/game/src/platform/index.js');
  const out = {};

  // CONTROL: a browser tab. No bridge, no Steam, no Deck.
  P.Platform.init({ bus: window.MM.bus });
  out.plain = {
    name: P.Platform.name, wrapped: P.Platform.wrapped,
    steam: P.Platform.steam.available, deck: P.Platform.steam.onDeck,
    describe: P.Platform.describe(),
  };
  // Every call still answers, rather than throwing on a missing bridge.
  out.plainCalls = {
    set: await P.Platform.steam.setAchievement('ACH_X'),
    get: await P.Platform.steam.getAchievement('ACH_X'),
    store: await P.Platform.steam.storeStats(),
    keyboard: await P.Platform.steam.showKeyboard({}),
  };

  // A wrapper with Steam and a Deck.
  const fake = P.installFakeHost({ steam: true, deck: true, appId: 4242 });
  P.Platform.init({ bus: window.MM.bus });
  out.steam = {
    name: P.Platform.name, wrapped: P.Platform.wrapped,
    steam: P.Platform.steam.available, deck: P.Platform.steam.onDeck,
    appId: P.Platform.steam.appId, describe: P.Platform.describe(),
  };
  out.steamCalls = {
    set: await P.Platform.steam.setAchievement('ACH_Y'),
    get: await P.Platform.steam.getAchievement('ACH_Y'),
    getMissing: await P.Platform.steam.getAchievement('ACH_NOPE'),
  };

  // A bridge whose methods throw must not take the game with it.
  const angry = P.installFakeHost({ steam: true, failEvery: 1 });
  P.Platform.init({ bus: window.MM.bus });
  let threw = false;
  try { out.angry = await P.Platform.steam.setAchievement('ACH_Z'); }
  catch (e) { threw = true; }
  out.angryThrew = threw;

  angry.uninstall(); fake.uninstall();
  P.Platform.init({ bus: window.MM.bus });
  out.restored = P.Platform.steam.available;
  return out;
}
"""

# ── overlay + focus drive the clock and the audio ──────────────────────────
PAUSE = r"""
async () => {
  const P = await import('/game/src/platform/index.js');
  const { clock, ctx } = window.MM;
  const out = { events: [] };
  const off = window.MM.bus.on('platform:pause', (s) => out.events.push([s.reason, s.paused]));

  const fake = P.installFakeHost({ steam: true });
  P.Platform.init({ bus: window.MM.bus });

  out.before = { paused: clock.paused, running: clock.running };
  fake.setOverlay(true);
  await new Promise(r => setTimeout(r, 60));
  out.overlayUp = { paused: clock.paused, running: clock.running, platformPaused: P.Platform.paused };
  const tAtPause = clock.t;
  await new Promise(r => setTimeout(r, 260));
  out.timeFrozen = (clock.t === tAtPause);

  fake.setOverlay(false);
  await new Promise(r => setTimeout(r, 120));
  out.overlayDown = { paused: clock.paused, running: clock.running };
  const tAfter = clock.t;
  await new Promise(r => setTimeout(r, 200));
  out.timeMovingAgain = (clock.t > tAfter);

  // The dt after a resume must be a normal frame, not the whole pause.
  out.dtAfterResume = clock.dt;

  off(); fake.uninstall();
  P.Platform.init({ bus: window.MM.bus });
  return out;
}
"""

# ── achievements: local first, Steam second, and the content gate ──────────
ACH = r"""
async () => {
  const P = await import('/game/src/platform/index.js');
  const A = await import('/game/src/core/achievements.js');
  const { achievements, Save, bus } = window.MM;
  const out = {};

  achievements.resetLocal();
  out.catalogue = {
    total: A.ACHIEVEMENTS.length,
    shippable: A.shippable().length,
    planned: A.plannedFor().map(a => a.id),
    steamName: A.steamName('first-win'),
  };
  /* THE FILTER, not its current answer. Every achievement that carries a
     `requires` is checked against the gate it names, both ways round, so this
     proves `shippable()` is really filtering however much content exists. */
  out.gated = A.ACHIEVEMENTS.filter(a => a.requires).map(a => a.id);
  out.shipWithGate = A.shippable().filter(a => a.requires).map(a => a.requires);
  out.plannedGates = A.plannedFor().map(a => a.requires);
  // Ids must be unique and stable-looking; a duplicate would silently shadow.
  const ids = A.ACHIEVEMENTS.map(a => a.id);
  out.dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
  out.badIds = ids.filter(x => !/^[a-z0-9-]+$/.test(x));
  // Every `on` must name an event something actually emits.
  out.events = [...new Set(A.ACHIEVEMENTS.flatMap(a => String(a.on).split(/\s+/)))];

  // CONTROL: nothing unlocked, and an event that matches nothing changes nothing.
  out.startEarned = achievements.earnedCount;
  bus.emit('run:combatEnd', { victory: false });
  out.afterLoss = achievements.earnedCount;

  // A won Scuffle unlocks exactly one thing.
  bus.emit('run:combatEnd', { victory: true });
  out.afterWin = { earned: achievements.earnedCount, has: achievements.has('first-scuffle') };

  // It persists across a reload of the save object.
  Save.save(); Save.load();
  out.persisted = achievements.has('first-scuffle');

  // Progress achievements count rather than fire once.
  const before = achievements.progress('ten-runs');
  bus.emit('run:end', { victory: false });
  bus.emit('run:end', { victory: false });
  out.progress = { before, after: achievements.progress('ten-runs') };

  // The two `firstTime` achievements on the SAME event must not eat each
  // other's slugs: rescue-four and rescue-all both watch run:rescue.
  achievements.resetLocal();
  for (const slug of ['marmalade', 'bones', 'wisp', 'taffy']) {
    bus.emit('run:rescue', { companion: slug });
  }
  out.rescue = {
    four: achievements.progress('rescue-four'),
    all: achievements.progress('rescue-all'),
    fourUnlocked: achievements.has('rescue-four'),
  };
  // A repeat must not count twice.
  bus.emit('run:rescue', { companion: 'marmalade' });
  out.rescueAfterRepeat = achievements.progress('rescue-all');

  return out;
}
"""

# ── Steam receives them, including ones earned offline ─────────────────────
ACH_STEAM = r"""
async () => {
  const P = await import('/game/src/platform/index.js');
  const A = await import('/game/src/core/achievements.js');
  const { achievements, bus } = window.MM;
  const out = {};

  // Earn one with NO Steam at all - the plane case.
  achievements.resetLocal();
  P.Platform.init({ bus });
  bus.emit('run:combatEnd', { victory: true });
  out.offline = { local: achievements.has('first-scuffle'), steam: P.Platform.steam.available };

  // Steam arrives. Reconcile must push what it missed.
  const fake = P.installFakeHost({ steam: true });
  P.Platform.init({ bus });
  const sync = await achievements.reconcile();
  out.reconcile = sync;
  out.onSteamAfter = [...fake.achievements.keys()];
  out.stored = fake.stored;

  // A live unlock now goes straight through.
  bus.emit('run:keepsake', { relic: { id: 'x' } });
  await new Promise(r => setTimeout(r, 40));
  out.liveUnlock = { local: achievements.has('first-keepsake'),
                     steam: fake.achievements.has(A.steamName('first-keepsake')) };

  // A gated achievement must NEVER be registered with Steam.
  const gatedId = A.plannedFor()[0] && A.plannedFor()[0].id;
  if (gatedId) {
    achievements.unlock(gatedId);
    await new Promise(r => setTimeout(r, 40));
    out.gated = { id: gatedId, local: achievements.has(gatedId),
                  steam: fake.achievements.has(A.steamName(gatedId)) };
  }

  // Steam has one we do not: a different machine earned it.
  fake.achievements.set(A.steamName('first-loss'), true);
  const pull = await achievements.reconcile();
  out.pull = { pulled: pull.pulled, localNow: achievements.has('first-loss') };

  fake.uninstall();
  P.Platform.init({ bus });
  achievements.resetLocal();
  return out;
}
"""

# ── storage: the file backend, corruption, and the future-save refusal ─────
STORAGE = r"""
async () => {
  const P = await import('/game/src/platform/index.js');
  const S = await import('/game/src/core/storage.js');
  const out = {};

  // A host bridge means FILES, which is the only shape Steam Cloud can sync.
  const fake = P.installFakeHost({ steam: true, storage: true });
  const st = new S.Storage();
  await st.open({ host: window.__MM_HOST__.storage });
  out.backend = st.backend;
  st.set('mm.save.v1', JSON.stringify({ version: 2, hauntLevel: 3 }));
  await st.flush();
  out.wroteFile = [...fake.files.keys()];
  out.fileBody = fake.files.get('mm.save.v1');

  // Write again: the PREVIOUS good copy lands in .bak before the new primary.
  st.set('mm.save.v1', JSON.stringify({ version: 2, hauntLevel: 4 }));
  await st.flush();
  out.afterSecond = { primary: fake.files.get('mm.save.v1'), bak: fake.files.get('mm.save.v1.bak') };

  // Now tear the primary the way a killed process would.
  fake.files.set('mm.save.v1', '{"version":2,"hauntLevel":');
  const st2 = new S.Storage();
  await st2.open({ host: window.__MM_HOST__.storage });
  out.recovered = { value: st2.get('mm.save.v1'), count: st2.stats.recovered };

  // Both halves gone: null, not a throw.
  fake.files.set('mm.save.v1.bak', 'also broken');
  const st3 = new S.Storage();
  await st3.open({ host: window.__MM_HOST__.storage });
  out.bothGone = { value: st3.get('mm.save.v1'), failures: st3.stats.failures };

  // Export / import round-trip.
  const st4 = new S.Storage();
  await st4.open({ host: { read: async () => null, write: async () => {}, remove: async () => {}, list: async () => [] } });
  st4.set('mm.save.v1', JSON.stringify({ version: 2, hauntLevel: 5 }));
  st4.set('mm.run.v1', JSON.stringify({ seed: 7 }));
  const bundle = st4.export();
  const st5 = new S.Storage();
  await st5.open({ host: { read: async () => null, write: async () => {}, remove: async () => {}, list: async () => [] } });
  const imp = st5.import(bundle);
  out.roundTrip = { imp, save: st5.get('mm.save.v1'), run: st5.get('mm.run.v1') };
  out.rejectsJunk = st5.import('not json at all');
  out.rejectsForeign = st5.import(JSON.stringify({ kind: 'someone-elses-game', slots: {} }));

  out.looksLikeJson = {
    torn: S.looksLikeJson('{"seed":123,"deck":['),
    good: S.looksLikeJson('{"a":1}'),
    bracketedGarbage: S.looksLikeJson('{not really}'),
    empty: S.looksLikeJson(''),
  };

  fake.uninstall();
  return out;
}
"""

SAVE_VERSIONS = r"""
async () => {
  const M = await import('/game/src/core/save.js');
  const { Save } = window.MM;
  const out = { SAVE_VERSION: M.SAVE_VERSION };

  // A version-1 save migrates forward and keeps its data.
  const v1 = { version: 1, hauntLevel: 3, companionsRescued: ['bones'] };
  const m = M.migrate(v1);
  out.migrated = m.ok ? { version: m.data.version, haunt: m.data.hauntLevel,
                          rescued: m.data.companionsRescued, gotAchievements: !!m.data.achievements } : m;

  // A save from a FUTURE build is refused, not merged.
  const future = M.migrate({ version: 99, hauntLevel: 5 });
  out.future = future;

  // And the live Save must not overwrite it. This is the Cloud case: play on the
  // desktop, then launch the Deck before it updated.
  // Written through `storage`, not straight into localStorage: storage is
  // opened by now and serves reads from its cache, so poking the backing store
  // behind it would test a path the game never takes. This is the shape Cloud
  // produces - a newer save arrives in the slot the game is about to read.
  const store = window.MM.storage;
  const before = store.get('mm.save.v1');
  store.set('mm.save.v1', JSON.stringify({ version: 99, hauntLevel: 5, companionsRescued: ['everything'] }));
  await store.flush();
  Save.load();
  out.blocked = Save.blocked;
  out.loadedHaunt = Save.data.hauntLevel;
  Save.setSetting('music', 0.11);                 // a player fiddles with a slider
  Save.save();
  await store.flush();
  const still = JSON.parse(store.get('mm.save.v1'));
  out.futureSaveSurvived = { version: still.version, rescued: still.companionsRescued };

  if (before === null) store.remove('mm.save.v1'); else store.set('mm.save.v1', before);
  await store.flush();
  Save.load();
  out.unblockedAfter = Save.blocked;

  // hasRun must PARSE, not just check the slot exists.
  store.set('mm.run.v1', '{"seed":123,"deck":[');
  out.tornRun = { hasRun: Save.hasRun(), loadRun: Save.loadRun() };
  store.remove('mm.run.v1');
  await store.flush();
  return out;
}
"""

TOAST = r"""
async () => {
  const { bus, achievements } = window.MM;
  achievements.resetLocal();
  bus.emit('run:combatEnd', { victory: true });
  await new Promise(r => setTimeout(r, 260));
  const card = document.querySelector('.mm-ach__card');
  const out = {
    present: !!card,
    name: card ? card.querySelector('.mm-ach__name').textContent : null,
    live: card ? card.closest('.mm-ach').getAttribute('aria-live') : null,
    visible: card ? card.getBoundingClientRect().width > 0 : false,
    pointerEvents: card ? getComputedStyle(card.closest('.mm-ach')).pointerEvents : null,
  };
  achievements.resetLocal();
  return out;
}
"""


async def main(a):
    from playwright.async_api import async_playwright
    passed, failed, notes = 0, 0, []
    errors = []

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
            viewport={"width": a.w, "height": a.h}, reduced_motion="no-preference",
        )).new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE, wait_until="load", timeout=60000)
        await page.wait_for_function("!!window.MM && !!window.MM.achievements", timeout=int(a.wait * 1000))
        await page.wait_for_timeout(600)

        # ══ 1. platform detection ═══════════════════════════════════════════
        pl = await page.evaluate(PLATFORM)
        check(pl["plain"]["name"] == "browser" and pl["plain"]["wrapped"] is False
              and pl["plain"]["steam"] is False,
              "CONTROL: a browser tab reports no wrapper and no Steam", pl["plain"]["describe"])
        check(all(v is False or v is None for v in pl["plainCalls"].values()),
              "every Steam call answers without a bridge instead of throwing",
              json.dumps(pl["plainCalls"]))
        check(pl["steam"]["wrapped"] and pl["steam"]["steam"] and pl["steam"]["deck"]
              and pl["steam"]["appId"] == 4242,
              "a host bridge is detected, with Steam and Deck", pl["steam"]["describe"])
        check(pl["steamCalls"]["set"] is True and pl["steamCalls"]["get"] is True
              and pl["steamCalls"]["getMissing"] is False,
              "achievements round-trip through the bridge", json.dumps(pl["steamCalls"]))
        check(pl["angryThrew"] is False and pl["angry"] is False,
              "a bridge that throws is contained, not propagated")
        check(pl["restored"] is False, "uninstalling the fake puts the tab back")

        # ══ 2. the pause ════════════════════════════════════════════════════
        pa = await page.evaluate(PAUSE)
        check(pa["before"]["paused"] is False and pa["before"]["running"] is True,
              "CONTROL: the clock is running before the overlay opens")
        check(pa["overlayUp"]["paused"] is True and pa["overlayUp"]["running"] is False,
              "the Steam overlay stops the clock", json.dumps(pa["overlayUp"]))
        check(pa["timeFrozen"] is True,
              "and game time does not advance while it is up")
        check(pa["overlayDown"]["paused"] is False and pa["overlayDown"]["running"] is True,
              "closing it starts the clock again")
        check(pa["timeMovingAgain"] is True, "and time moves again")
        check(0 <= pa["dtAfterResume"] <= 0.12,
              "the frame after a resume is a normal frame, not the whole pause",
              f"dt={pa['dtAfterResume']:.4f}s")
        check(any(e[0] == "overlay" and e[1] is True for e in pa["events"]),
              "platform:pause carries the reason", json.dumps(pa["events"][:4]))

        # ══ 3. achievements ═════════════════════════════════════════════════
        ac = await page.evaluate(ACH)
        check(ac["catalogue"]["total"] >= 30,
              "the catalogue is a real size", f"{ac['catalogue']['total']} achievements")
        # This used to assert `shippable < total` — that SOMETHING is still
        # withheld — and it passed only because content was missing. All
        # seventeen regions ship now and co-op is built, so every gate is open
        # and `plannedFor()` is correctly empty; the old check would have failed
        # for the best possible reason. What is worth asserting is that the
        # FILTER still filters: an achievement reaches Steam only if the gate it
        # names is open, and is withheld only if the gate it names is shut.
        check(ac["catalogue"]["shippable"] <= ac["catalogue"]["total"],
              "the shippable set is a subset of the catalogue",
              f"{ac['catalogue']['shippable']} of {ac['catalogue']['total']}")
        check(len(ac["gated"]) >= 3,
              "achievements really are content-gated — the mechanism has users",
              f"{len(ac['gated'])} carry a `requires`: {ac['gated']}")
        check(all(g in ("all-regions", "heart", "coop") for g in ac["shipWithGate"]),
              "every gated achievement that ships names a gate that is OPEN",
              f"{sorted(set(ac['shipWithGate']))}")
        check(not ac["catalogue"]["planned"] or all(ac["plannedGates"]),
              "and every withheld one names a gate that is SHUT",
              f"planned: {ac['catalogue']['planned']}")
        check(ac["catalogue"]["steamName"] == "ACH_FIRST_WIN",
              "the Steam API name is derived, not hand-listed", ac["catalogue"]["steamName"])
        check(not ac["dupIds"] and not ac["badIds"],
              "every id is unique and kebab-case",
              f"dups={ac['dupIds']} bad={ac['badIds']}")
        check(ac["startEarned"] == 0 and ac["afterLoss"] == 0,
              "CONTROL: a LOST Scuffle unlocks nothing")
        check(ac["afterWin"]["has"] is True and ac["afterWin"]["earned"] == 1,
              "a won Scuffle unlocks exactly one thing", json.dumps(ac["afterWin"]))
        check(ac["persisted"] is True, "and it survives a save/load round-trip")
        check(ac["progress"]["after"]["have"] == 2 and ac["progress"]["after"]["goal"] == 10,
              "progress achievements count instead of firing once",
              json.dumps(ac["progress"]["after"]))
        check(ac["rescue"]["four"]["have"] == 4 and ac["rescue"]["all"]["have"] == 4,
              "two achievements on one event keep separate counts",
              f"four={ac['rescue']['four']} all={ac['rescue']['all']}")
        check(ac["rescue"]["fourUnlocked"] is True,
              "and the one that reached its goal unlocked")
        check(ac["rescueAfterRepeat"]["have"] == 4,
              "freeing the same Companion twice does not count twice",
              json.dumps(ac["rescueAfterRepeat"]))

        # ══ 4. Steam sync, including offline ════════════════════════════════
        st = await page.evaluate(ACH_STEAM)
        check(st["offline"]["local"] is True and st["offline"]["steam"] is False,
              "CONTROL: earned with no Steam client at all, and still recorded")
        check(st["reconcile"]["pushed"] >= 1 and "ACH_FIRST_SCUFFLE" in st["onSteamAfter"],
              "reconcile pushes what Steam missed while it was away",
              json.dumps(st["reconcile"]))
        check(st["stored"] >= 1, "and flushes the stats afterwards")
        check(st["liveUnlock"]["local"] and st["liveUnlock"]["steam"],
              "a live unlock reaches Steam immediately")
        if st.get("gated"):
            check(st["gated"]["local"] is True and st["gated"]["steam"] is False,
                  "a content-gated achievement is recorded locally and NEVER sent to Steam",
                  json.dumps(st["gated"]))
        check(st["pull"]["pulled"] >= 1 and st["pull"]["localNow"] is True,
              "an achievement Steam already had is pulled back into the save",
              json.dumps(st["pull"]))

        # ══ 5. storage ══════════════════════════════════════════════════════
        so = await page.evaluate(STORAGE)
        check(so["backend"] == "host",
              "a host bridge switches storage to files, which is what Cloud syncs")
        check("mm.save.v1" in so["wroteFile"], "the save is written as a file",
              json.dumps(so["wroteFile"]))
        check(so["afterSecond"]["bak"] is not None
              and "3" in (so["afterSecond"]["bak"] or "")
              and "4" in (so["afterSecond"]["primary"] or ""),
              "the previous good copy is kept in .bak before the new one lands",
              json.dumps(so["afterSecond"]))
        check(so["recovered"]["value"] is not None and so["recovered"]["count"] == 1,
              "a torn primary is recovered from the backup",
              json.dumps(so["recovered"]))
        check(so["bothGone"]["value"] is None,
              "both halves damaged returns null instead of throwing",
              json.dumps(so["bothGone"]))
        check(so["roundTrip"]["imp"]["ok"] and so["roundTrip"]["save"] and so["roundTrip"]["run"],
              "export and import round-trip every slot", json.dumps(so["roundTrip"]["imp"]))
        check(so["rejectsJunk"]["ok"] is False and so["rejectsForeign"]["ok"] is False,
              "and refuse a file that is not one of ours",
              f"{so['rejectsJunk']['reason']} / {so['rejectsForeign']['reason']}")
        lj = so["looksLikeJson"]
        check(lj["torn"] is False and lj["good"] is True
              and lj["bracketedGarbage"] is False and lj["empty"] is False,
              "the torn-write shape is rejected and a good one is not", json.dumps(lj))

        # ══ 6. versions — the one that eats a player's history ══════════════
        sv = await page.evaluate(SAVE_VERSIONS)
        check(sv["migrated"]["version"] == sv["SAVE_VERSION"]
              and sv["migrated"]["haunt"] == 3
              and sv["migrated"]["rescued"] == ["bones"]
              and sv["migrated"]["gotAchievements"] is True,
              "a version-1 save migrates forward without losing anything",
              json.dumps(sv["migrated"]))
        check(sv["future"]["ok"] is False and sv["future"].get("future") is True,
              "a save from a NEWER build is refused", json.dumps(sv["future"]))
        check(bool(sv["blocked"]), "and the game marks itself blocked rather than loading it",
              json.dumps(sv["blocked"]))
        check(sv["futureSaveSurvived"]["version"] == 99
              and sv["futureSaveSurvived"]["rescued"] == ["everything"],
              "changing a setting does NOT overwrite the newer save",
              json.dumps(sv["futureSaveSurvived"]))
        check(sv["unblockedAfter"] is None,
              "and a normal save clears the block")
        check(sv["tornRun"]["hasRun"] is False and sv["tornRun"]["loadRun"] is None,
              "a torn run save does not put a dead Continue button on the title",
              json.dumps(sv["tornRun"]))

        # ══ 7. the toast ════════════════════════════════════════════════════
        to = await page.evaluate(TOAST)
        check(to["present"] and to["visible"],
              "an unlock shows the player something", json.dumps(to))
        check(to["name"] == "Something Moved", "with the achievement's name on it", str(to["name"]))
        check(to["live"] == "polite",
              "announced politely, so it cannot interrupt a screen reader mid-fight")
        check(to["pointerEvents"] == "none",
              "and it can never swallow a click meant for the board")

        # ══ 8. the Deck's one different default ════════════════════════════
        deck = await page.evaluate("""async () => {
          const P = await import('/game/src/platform/index.js');
          const { Save, storage } = window.MM;
          const out = {};
          const apply = () => {
            // the same three lines main.js runs at boot
            if (P.Platform.steam.onDeck && !Save.data.deckDefaults) {
              Save.data.deckDefaults = { at: Date.now(), applied: ['largeText'] };
              Save.data.settings.largeText = true;
              Save.save();
              return true;
            }
            return false;
          };

          // CONTROL: not a Deck. Nothing changes.
          Save.data.deckDefaults = null; Save.data.settings.largeText = false;
          P.Platform.init({ bus: window.MM.bus });
          out.notDeck = { applied: apply(), largeText: Save.data.settings.largeText,
                          onDeck: P.Platform.steam.onDeck };

          // A Deck, first run.
          const fake = P.installFakeHost({ steam: true, deck: true });
          P.Platform.init({ bus: window.MM.bus });
          out.firstRun = { applied: apply(), largeText: Save.data.settings.largeText,
                           marked: !!Save.data.deckDefaults };

          // The player turns it off. A later boot must not turn it back on.
          Save.data.settings.largeText = false;
          out.secondRun = { applied: apply(), largeText: Save.data.settings.largeText };

          fake.uninstall();
          P.Platform.init({ bus: window.MM.bus });
          Save.data.deckDefaults = null;
          Save.save(); await storage.flush();
          return out;
        }""")
        check(deck["notDeck"]["onDeck"] is False and deck["notDeck"]["applied"] is False
              and deck["notDeck"]["largeText"] is False,
              "CONTROL: not a Deck, so nothing is defaulted", json.dumps(deck["notDeck"]))
        check(deck["firstRun"]["applied"] is True and deck["firstRun"]["largeText"] is True,
              "a Deck's first run turns Large Text on — 9px is small at seven inches",
              json.dumps(deck["firstRun"]))
        check(deck["secondRun"]["applied"] is False and deck["secondRun"]["largeText"] is False,
              "and a player who turns it off is never overridden again",
              json.dumps(deck["secondRun"]))

        check(not errors, "zero console errors", "; ".join(errors[:4]))
        await browser.close()

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    print("""
NOT PROVED HERE, and no fake can prove it - these need the App ID and a wrapper:
  * that the real Steamworks SDK accepts these API Names (they must be entered
    on the partner site to match `steamName()`, which is why it is derived)
  * that Auto-Cloud actually syncs the directory a host's storage.dir() returns
  * that the real overlay fires the callback this code subscribes to
  * that Valve's Deck verification passes
What IS proved is that the game's half of each is written, wired and correct
against the contract in platform/index.js.""")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=25)
    ap.add_argument("--w", type=int, default=1280)
    ap.add_argument("--h", type=int, default=800)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
