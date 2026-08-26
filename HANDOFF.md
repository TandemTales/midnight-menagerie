# Midnight Menagerie — handoff

Written 2026-08-26. Everything a fresh conversation needs to pick this up.
Read this, then `CONTRACTS.md`, then `docs/STS2-REFERENCE.md`. Nothing else is required reading.

---

## 1. What this is

A cute-spooky deckbuilding roguelike. Kids whose pets have gone missing enter a haunted mansion
that transforms animals; you pick a Kid and a Companion (your deck) and go in. Built to a
**Slay the Spire 2** quality bar, in Three.js + plain ES modules, **no build step**.

Design source of truth: `Midnight Menagerie Design.docx` (1.6M chars), carved into 45 readable
files under `docs/design/`. Read only what you need — the full doc will not fit in context.

**~63,000 lines** across `game/src/`. Currently on branch **`dev`**, pushed to
`github.com/TandemTales/midnight-menagerie`. `main` is untouched and stale.

---

## 2. Run it

The dev server does **not** survive a session restart. Start it:

```bash
python tools/devserver.py 8777
```

- Game: http://localhost:8777/game/index.html
- Live progress page: http://localhost:8777/progress.html
- Deep links: `#scene=combat&seed=42`, `#scene=map&seed=42&region=foyer`, `#scene=select`,
  `#scene=clubhouse`, `#scene=gameover&result=victory`
- Debug handle in the page: `window.MM` → `{ ctx, bus, clock, Save, goto(scene, params), state() }`

**Dropping a hash does not reload an SPA.** Navigating from `index.html#scene=select` to
`index.html` leaves you on select. Use `preview_start` again or a cache-busting query.

---

## 3. Tooling — this is how the project stays honest

| Tool | What it does |
|---|---|
| `python tools/shot.py <name> [--scene s] [--wait n] [--steps ...] [--strip N]` | Screenshots and drives the real game. Prints fps **and the GL renderer**, flags software rasterisation. Writes `shots/<name>.state.json` with console errors. **Read its docstring.** |
| `python tools/progress.py event/wave/piece ...` | Updates the live progress page |
| `python tools/prep_assets.py` | Copies soundtrack + blueprint art into `game/assets/`, emits `audio/manifest.json` |
| `python tools/prep_kid_art.py` | Kid portraits/thumbnails + 13 Companion portraits |
| `python tools/prep_menu_art.py` | Keys the title wordmark's black to alpha, sizes the mansion plate |
| `python tools/blueprint_trace.py` | Traces blueprint sections to vectors (`sectionNN.plan.json`) |
| `python game/src/ui/make_thumbs.py` | Companion portrait thumbnail variants |

All prep scripts are **one-off and commit their output** — there is no runtime build step.

### Test suites — all must stay green

```
tests/combat/run.py        649 assertions      tests/seams/check.py     1607 sites, 0 problems
tests/cards/run.py         445 cards, 0 err    tests/seams/proof.py     52 passed
tests/enemies/run.py       37 enemies, 0 err   tests/scene-css/check.py 0 conflicts
tests/enemies/audit.py     ~2400 turns, 0 err  tests/run/run.py         50 runs, 0 errors
tests/map/run.py           23 passed           tests/chrome/run.py      27 checks
tests/backpack/run.py      77 checks           tests/audio/run.py       46 cues, 0 errors
tests/combat-scene/seam.py 22 passed           tests/critic-design/sim.py  balance simulator
```

`tests/seams/check.py` and `tests/scene-css/check.py` are **gates against whole bug classes** —
never let them regress. See §6.

---

## 4. How the work has been run

Fan out **builder agents** on independently-judgeable pieces with strict file ownership (the
table in `CONTRACTS.md`), then a **separate critic with fresh context** that judges the *running
game* — never the builder's summary — against `docs/STS2-REFERENCE.md` using the blind A/B in
`docs/CRITIC-BRIEF.md`. When a critic fails a piece it names **one** biggest gap and the builder
goes back in. Between waves, one fresh agent plays the whole game end to end.

Five full playthroughs have been done (`tests/playthrough*/`). The last scored **7 ties, 5 losses**
against StS2, down from 7 losses / 3 ties / 2 wins.

**Run 4–5 agents at a time, not 8.** Eight Opus agents hit the session limit repeatedly and three
lost their transcripts. Resume interrupted agents with `SendMessage` rather than restarting cold.

---

## 5. What is built

Playable end to end: title → Companion select → Kid select → blueprint map → combat → reward /
shop / Safe Room / Curiosity / Rescue → boss → second wing → expedition end → Clubhouse, with
autosave and mid-combat resume.

- **Combat engine** (`src/combat/`) — headless, deterministic, 649 assertions. Player choice with
  a replay log, first-class intent queue, House Rules, `onEnemyPhaseEnd`, preview by cloning the
  engine so it cannot drift from resolution.
- **Content** — 445 cards across 5 Companions (Marmalade, Bones, Pipkin, Taffy, Wink); 37 enemies
  across Foyer / Nursery / Sleeping Quarters with 3 multi-phase bosses; 38 Keepsakes; 16
  Curiosities; 18 Backpack items; a 10-level Haunt ladder with real behavioural upgrades.
- **Art** — all authored art is wired: the main menu (`UI/mainMenu.png` + keyed `UI/title.png`),
  Companion select (`UI/selectCompanion.png` itself, unrescued frames hidden, candle hover), all
  17 map wings traced from their own `art/sectionNN.png`, 8 painted Kid portraits + thumbnails,
  13 upgraded Companion portraits. Pet photographs are *generated* (`ui/petart.js`) — there is no
  authored pet art, and that code is deliberate, not a placeholder.
- **Balance** (measured, not guessed): whole-run survival 50–58%, Foyer boss ~82%, Governess ~74%
  when reached, naive-vs-competent gap ~33 points.

`UI/selectKid.png` is prepped to `game/assets/ui/select-kid.jpg` and **wired to nothing** — the
designer has not asked for it yet.

---

## 6. Bug classes that have already cost rounds

`CONTRACTS.md` has the full list under "Traps this codebase has already fallen into". The two
that produced automated gates:

**Silent no-ops at module seams.** Every module passed its own tests while doing nothing at the
join. Marmalade's Haunt dealt **zero damage for the entire build** because a keyword called
`ctx.loseHp?.()` and the hook payload never provided `loseHp` — the `?.` swallowed it. "Ignores
Guard" passed `{pierceBlock}` where the pipeline read `pierce`. `tests/seams/check.py` now scans
1607 call sites; `game/src/combat/strict.js` throws on undefined ctx members in dev.
**CONTRACTS rule 8: no `?.` on contract APIs.**

**CSS class collisions between scenes.** `.rs-door` meant an absolutely-positioned door panel in
`event.css` and the Safe Room's buttons in `rest.css`; stylesheets are global and never unload,
so visiting one Curiosity **permanently deleted every Safe Room** — all healing and all card
upgrading — with zero console output. It survived three playthroughs and made the balance
simulator disagree with the real game. `tests/scene-css/check.py` gates it.

**Measurement traps that produced wrong conclusions.** An averaged fps hides an entry stall. A
mock that implements the mechanic it tests proves nothing. `gl.finish()` is not a fence under
ANGLE. `page.evaluate` awaits returned promises, which makes every motion-strip frame land on the
end state. A `fetch()` 404 is a console error even when handled.

---

## 7. Corrections made to my own early mistakes — do not re-break these

I invented several things during scaffolding that contradicted the design doc:

| Was | Is | Note |
|---|---|---|
| "Pluck" (energy) | **Nerve** | doc uses Nerve 1538×, Pluck 0× |
| "Trinkets" (currency) | **Lost Things** | |
| Kid 8 "Lucy" / pet "Biscuit" | **Samir Haddad** / **Bean** | doc names Samir 628× |
| `petKind` for 5 of 8 pets | corrected + `petBreed` added | Orbit was listed a parrot; he's a cat |

**Pronouns are authoritative in `schema.js KIDS[].pronouns` and set by the designer**, not derived
from the doc: maya she · **mateo they** · amina she · **eli he** · priya she · **jordan he** ·
lena she · samir he. A pass over the doc's possessives read Mateo as he/him and was wrong. Never
infer a pronoun from a name; never re-derive from the doc. Copy must read the field.

---

## 8. In flight right now

**One agent running** (id `ab4d724936e4c1431`) on the **map entry stall**. It owns
`scenes/map.js`, `map.css`, `ui/mapnode.js`, `core/clock.js` — those three are the uncommitted
files in the working tree. Resume it with `SendMessage` or let it finish.

The defect, measured by sampling every rAF from page load on `#scene=map&seed=42&region=foyer`:

```
t+ 6005ms   1872ms blocked
t+ 7924ms   1938ms blocked
t+10012ms    905ms blocked      ≈ 4.7s of blocked main thread on map entry
```

**Steady state is 61 fps** — which is why every averaged measurement passed. An earlier report
blamed the audio layer; **that is wrong and I disproved it**: audio running 61, AudioContext
suspended 61, all decks paused 61, on map, combat and the victory screen alike.

---

## 9. The next major piece: MULTIPLAYER

The designer has said this ships on **Steam** and needs multiplayer **at parity with Slay the
Spire 2**. Currently there is **none** — no networking, no second player, nothing. I scoped it out
early ("single-player build") and should have flagged it; the original brief did say "solo and
cooperative".

### What StS2 co-op actually is (researched 2026-08-26 — this is the spec to hit)

- **Up to 4 players, online only, Steam friend invites.** No public matchmaking, no local co-op,
  no mid-game join or drop. Host controls save/load.
- **Simultaneous turns.** All players act in the same planning window; cards queue and resolve in
  order. Debuffs resolve first, benefiting teammates who act after. Semi-transparent cursors show
  teammate intent. Any teammate's full deck and relics are inspectable at any time.
- **Shared:** map and route, enemies and their buffs/debuffs.
- **Per-player:** deck, gold, energy, HP, relics, card rewards, shop inventory.
- **Potions:** drink-on-self, or **thrown to a teammate**.
- **Enemy HP scales non-linearly:** 1p 100% · 2p ~220% · 3p ~360% · 4p ~520%. Bosses get co-op
  specific adjustments. Enemies threaten all players at all times.
- **Death:** at 0 HP a player falls and cannot act for the rest of the fight; revives at 1 HP if
  the team wins. All dead = run over. Act transitions restore some HP.
- **Route disagreement:** vote, weighted random on ties.
- **Map drawing/ping** for suggesting routes.
- **Co-op-only cards** per character: team Block, team buffs, **Aggro/Taunt** (force enemy
  targeting for a turn), cross-player synergy, mid-combat revival.
- **Camp/rest additions:** *Mend* (heal a teammate 30%, sacrificing your own camp action) and
  *Clone* (copy a card from a teammate's deck).

### What this game's own design doc already specifies

214 multiplayer mentions. Every Companion chapter has a **"MULTIPLAYER ONLY TRICKS"** section
(3 Uncommon + 2 Rare each — ~5 cards × 16 Companions) which I explicitly told the content agent to
skip. Every region chapter has per-enemy **multiplayer scaling** notes, also skipped.
`docs/design/03-content-architecture.md` specifies a multiplayer **content-ownership model** —
players may own different expansions, so Companion validation and reward substitution for
non-owners are already designed.

### The one decision that blocks the rest

**The game is a browser ES-module app with no build step. Steam needs a desktop wrapper and
Steamworks.** That choice (Electron vs Tauri vs NW.js; Steamworks P2P/`ISteamNetworkingMessages`
vs a relay) shapes the transport layer and should be made deliberately with the designer — do not
pick it silently.

**Work that does NOT depend on it and can start immediately:**
1. Generalise the engine's actor model from one player to N (`src/combat/`). The deterministic
   RNG, `choiceLog` and `setChoiceScript` replay are a genuinely good foundation for lockstep.
2. Author the ~5 co-op cards per built Companion from the doc's own MULTIPLAYER ONLY pools.
3. Per-enemy party scaling from each region chapter, plus the HP curve above.
4. Simultaneous-turn resolution order, taunt/aggro targeting, fallen-player state, teammate
   potion throwing, Mend and Clone at the Safe Room.
5. Extend `tests/critic-design/sim.py` to simulate 2–4 player parties.

---

## 10. Where things are

```
game/src/{core,combat,data,scenes,ui,fx,audio,state}/   the game
docs/design/            45 carved design files
docs/notes/             46 per-agent notes (one file per agent — never a shared file, see below)
docs/STS2-REFERENCE.md  the yardstick every critic judges against
docs/CRITIC-BRIEF.md    how a critic works, and the required output format
docs/CARD-AUDIT.md · docs/ENEMY-AUDIT.md · docs/AUDIO-MAP.md
CONTRACTS.md            file ownership, non-negotiables, the traps list
shots/                  every screenshot + .state.json (gitignored)
```

**Notes are one file per agent** under `docs/notes/`, indexed by a row in `docs/NOTES.md`. A
single shared append-only file was tried and two agents lost their sections to concurrent writes.

**Do not `git add -A` while agents are editing.** Four agents had in-flight work swallowed by
unrelated commits — one had an entire `music.js` rewrite land inside a commit titled "Pronouns per
the designer", which then made a later revert restore the wrong version. Commit explicit paths.
