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
| `python tools/entryprof.py --goto <scene> [--watch cls]` | Blocked main-thread time on ONE scene entry. Samples every rAF and reports GAPS — an average cannot see a stall. `--goto` boots elsewhere, waits for the app to settle, then walks in, so the cost is attributable instead of buried in ~6 s of boot. |
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
tests/coop/run.py          324 assertions   tests/hook-names/check.py  0 unknown hooks
tests/turn-events/check.py 0 unguarded      tests/map/run.py           23 passed           tests/chrome/run.py      27 checks
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

**Listeners that fire too often, or never.** `turn:start` / `turn:end` are emitted for the
player AND for every enemy, so every Companion tracker in this build ran ~3x a round:
Marmalade's Untouched was decided by whichever enemy swung LAST and her whole archetype did
nothing in any multi-enemy fight, Bones' Buried countdown ticked 3x, Pipkin's Patch grew 3x.
Separately, a hook registered under a name nothing dispatches is completely silent — four
cards were written that way, one of them (`bones/tail-a-mile-a-minute`, a Rare) already
shipping with an empty handler on a hook that does not exist. `tests/turn-events/check.py`
and `tests/hook-names/check.py` gate both. See CONTRACTS traps 9-12.

**A card that "resolves without throwing" is not a card that works.** A smoke test that plays
every card and checks for exceptions passed all four dead cards above. Assert the EFFECT.

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

## 8. Recently closed — the boot stall

**No agents are running. Working tree is clean.**

The map "audio" problem is diagnosed and fixed. It was neither audio nor map-specific: a cold
boot blocked the main thread for ~5.5 s on **shader linking**, and `#scene=gameover` measured the
same 5283 ms. A CDP profile put 4975 ms in three.js `onFirstUse`, of which
**`gl.getProgramInfoLog` was 4194 ms** — on this ANGLE/D3D11 Intel UHD stack that call forces the
driver's deferred link at **400–750 ms per program**.

The warm-up was racing itself. `core/renderer.js` drew the scene straight to the canvas while
`_warming` was true, landing 6 ms after phase A created its first program and forcing every
subsequent program to link synchronously inside `setProgram`. The warm-up was dead code in
practice. Fixed by drawing nothing while warming, and by warming **both** program variants
(canvas-target and composer-target have different cache keys).

**Worst frame 1938 ms → 564 ms; total blocked ~5.5 s → ~2.2 s.** All scenes 61 fps, zero console
errors, look unchanged (0.023% of pixels differ, max channel delta 15/255).

The map itself also got: stylesheet no longer re-fetched on every entry (it was the only scene
that unloaded its `<link>`), grain tile cached instead of re-encoded, 64 `innerHTML` parses → 1,
three serial round trips made concurrent, and the entrance sweep promoted to a compositor op.
Route visible at **1.66 s**.

**What remains, and why 120 ms is not reachable on this hardware:** ~520 ms of the residue is
Chrome's own GPU rasteriser compiling Skia shaders on first paint — no script attribution, does
not scale with viewport, and `--disable-gpu-rasterization` drops it to 250 ms. Removing it needs
the map's paint-op vocabulary rendered once somewhere invisible during boot. Two smaller leads
are open: `data/keywords.js` costs 88–107 ms of module eval on the boot path via
`ui/hud.js` → `ui/tooltip.js` (a dynamic import in tooltip's first `show()` would remove it), and
three ~120–160 ms tasks from `atmosphere.setMood('blueprint')` now surface after the sweep.
Full detail in `docs/notes/2026-08-26-map-round-6-the-entry-stall-is-shader-linking.md`.

**Verified from fresh context afterwards** (`docs/notes/2026-08-26-entry-stall-verification.md`),
with a same-filesystem A/B and an identical-code control: map entry 1078 ms -> 765 ms (-29%) and
worst frame gap 650 ms -> 450 ms (-30%) both hold. There is a cost the round-6 commit does not
record: **~400 ms of blocked main thread now lands ~800 ms AFTER the sweep finishes**, where
pre-fix had exactly zero — four frames of 100-220 ms on a settled map the player is already
reading. Best guess, unproven: warm-up phases B/C now overlap the map entrance because the map
enters 313 ms sooner. Same driver work, later. Worth a look before anyone calls this closed.

## 9. MULTIPLAYER — the engine is done, nothing above it is

The designer's decision on 2026-08-26: **defer the Steam wrapper** and build the
transport-independent work first. That is what is below. The wrapper choice
(Electron vs Tauri vs NW.js; Steamworks P2P vs a relay) is still open and still
shapes the transport layer.

Full detail: `docs/notes/2026-08-26-multiplayer-engine.md`. Contract summary:
CONTRACTS.md § "Co-op: the engine has N players".

### Built and tested (324 co-op assertions, real party engines, no mocks)

`engine.players[]` is the source of truth. **Solo is a party of one**, so there
is no separate single-player path below construction — the solo suite is
unchanged at 651 assertions through the entire refactor.

- per seat: deck, all six piles, Nerve, Courage, Guard, statuses, Keepsakes,
  Companion trackers and counters. Two Marmalades get two independent Lives
  tracks, not one shared one.
- enemy Courage on the StS2 curve: 2p 220%, 3p 360%, 4p 520%, with a per-enemy
  `EnemyDef.partyHp` override for the region chapters.
- enemies MARK a seat and hold that mark across intent refreshes, so the arrow
  read while planning is the one that resolves.
- **Racket**, the co-op taunt — fourteenth universal status.
- **simultaneous turns**: everyone plans in one window, each seat ends its own
  turn, the enemy phase waits for the last living seat.
- **fallen**: at 0 Courage a seat keeps its place, drops its hand, takes no turn;
  back at 1 Courage if the team wins; all fallen = run over.
- thrown Snacks: `useSnack(snack, targetId, { to: seat })`.
- the **25 authored multiplayer-only Tricks** — 3 Uncommon + 2 Rare for each of
  the five built Companions, from their own design chapters, in `def.coopCards`
  OUTSIDE the 80. Every one is played in a real 2-seat fight by the suite.

**How the refactor was kept safe, and worth reusing:** in a party with the dev
guard armed, `engine.player` / `.piles` / `.relics` **throw** and name the fix
instead of quietly resolving to seat 0. Running a real 2-player fight produced
the port list one throw at a time. A shipped build still degrades to seat 0
rather than throwing at a player mid-run.

### NOT built — this is the honest list

1. **No co-op run layer and no co-op UI.** `state/run.js` is single-player and
   there is no way to start a 2-player game from inside the game. The engine is
   ready; nothing above it is. This is the next piece.
2. **No networking**, per the deferred wrapper decision.
3. Per-player gold, card rewards and shop inventory — specified, but they live
   in the run layer, so untouched.
4. **Mend** and **Clone** at the Safe Room.
5. Per-enemy `partyHp` overrides from the region chapters: the engine supports
   them, nobody has authored them.
6. The other 11 Companions' co-op pools (they are unbuilt Companions).
7. **Cards that need a teammate to choose.** Several say "that player chooses a
   Trick from their hand". The choice broker raises ONE request to whoever is
   driving the engine; there is no client routing to put a request in front of a
   different player. Those picks currently resolve deterministically and are
   marked `// TEAMMATE PICK` in the source. The effect is right; who decides is
   not. It is a networking task, not a card task.

### Lockstep foundation

The deterministic RNG, `choiceLog` and `setChoiceScript` replay are a genuinely
good base — the run layer already uses them to reconstruct an interrupted fight
and verify it against a board digest. Seats shuffle in seat order off the one
shared RNG, so the same seed deals the same opening hands to the same Kids.

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
