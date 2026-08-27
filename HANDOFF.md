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
tests/combat/run.py        677 assertions      tests/seams/check.py     1806 sites, 0 problems
tests/cards/run.py         445 cards, 0 err    tests/seams/proof.py     52 passed
tests/enemies/run.py       37 enemies, 0 err   tests/scene-css/check.py 0 conflicts
tests/enemies/audit.py     ~2400 turns, 0 err  tests/run/run.py         50 runs, 0 errors
tests/coop/run.py          591 assertions   tests/coop/hotseat.py    the seat really moves
tests/coop/rooms.py        every room hands over  tests/coop/playthrough.py  a two-Kid expedition
tests/hook-names/check.py  0 unknown hooks
tests/turn-events/check.py 0 unguarded      tests/dup-keys/check.py    0 duplicate keys
tests/css-tokens/check.py  0 undefined tokens
tests/map/run.py           23 passed        tests/chrome/run.py        27 checks
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

**An invented CSS token is silent.** `var(--text-low)` when the token is
`--text-lo`: the declaration is dropped, the element keeps what it inherited,
and nothing appears in the console. The two-Kid Safe Room shipped with SIXTEEN
of them and rendered as unstyled text — caught only by looking at the screen.
`tests/css-tokens/check.py` gates it, and knows about the properties JS hands to
elements at runtime so `setProperty('--i', …)` is not a false positive.

**Listeners that fire too often, or never.** `turn:start` / `turn:end` are emitted for the
player AND for every enemy, so every Companion tracker in this build ran ~3x a round:
Marmalade's Untouched was decided by whichever enemy swung LAST and her whole archetype did
nothing in any multi-enemy fight, Bones' Buried countdown ticked 3x, Pipkin's Patch grew 3x.
Separately, a hook registered under a name nothing dispatches is completely silent — four
cards were written that way, one of them (`bones/tail-a-mile-a-minute`, a Rare) already
shipping with an empty handler on a hook that does not exist. `tests/turn-events/check.py`
and `tests/hook-names/check.py` gate both. See CONTRACTS traps 9-12.

**A duplicate key in an object literal silently wins.** `butler.js` declared `onTurnEnd`
TWICE; the second replaced the first with no error, no warning, and a green suite. The
half that expires his Discomposed status was dead for the whole build, and `discomposed`
never decays — so the first time a player earned the window he stayed Discomposed
forever, permanently taking 25% more and permanently unable to announce another House
Rule. `tests/dup-keys/check.py` gates it.

**A def method with no caller is not a mechanic.** Three of them shipped: the
Governess's `redirect()` (Stitched Together, her whole phase one), her `advancePatch()`
(the phase-two Patch cycle), and the Bedframe Beast's `modifyIncoming()` (its Covered
state). All three read as finished, tested content. `governess.doll()` additionally
looked up an actor `id` that is really a `defId`, so she could not see her own Doll.
This is the seams class again, arriving from the OTHER side — `tests/seams/check.py`
checks that call sites are real, and nothing checks that a def's own surface is called.
When you write a def method, grep for its caller.

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

## 9. MULTIPLAYER — playable end to end for two Kids

**Two Kids** (`MAX_PARTY`), by the designer's decision on 2026-08-26. The Steam
wrapper is still deferred, so everything here is transport-independent.

**Two people can play the whole game on one machine.** "Go in together" on the
Companion/Kid select, pick your Kid, "Lock in & pass it over", your friend picks
theirs — and from there the screen keeps changing hands: combat turns, the
reward, Mr. Moth's, the Safe Room and Curiosities all pass over with an opaque
veil between them. Shared route, per-Kid everything.

Detail: `docs/notes/2026-08-26-multiplayer-engine.md` (the engine),
`2026-08-26-multiplayer-bosses.md` (the content), `2026-08-27-pass-and-play.md`
(two Kids at one screen). Contract summary: CONTRACTS.md § "Co-op: two Kids".

### Built and tested

`engine.players[]` and `run.kids[]` are the sources of truth. **Solo is a party
of one**, so there is no separate single-player path below construction — the
solo suite is unchanged at 651 assertions and the 50-run determinism sim is
unchanged through the entire refactor.

- **shared**: the route, the rooms, the enemies, the Haunt level, the seed
- **per Kid**: deck, Courage, Nerve, Guard, statuses, Keepsakes, Backpack,
  Snacks, Companion trackers and counters, card rewards, shop prices
- **simultaneous turns** — each seat ends its own; the enemy phase waits
- **fallen** at 0 Courage: keeps its seat, drops its hand, takes no turn, and
  comes back at 1 Courage if the team wins. All fallen = run over.
- **Racket**, the co-op taunt (fourteenth universal status)
- **thrown Snacks**: `useSnack(snack, targetId, { to: seat })`
- **Safe Room**: Mend (heal your friend 30% of their maximum instead of your own
  rest) and Clone (copy one of their Tricks — a copy; they keep theirs)
- **25 authored multiplayer-only Tricks**, 3 Uncommon + 2 Rare for each built
  Companion, OUTSIDE the 80 and never drafted solo
- the combat screen shows the other Kid: Courage, Guard, statuses, whether they
  are ready, and which enemy is winding up at them
- **per-seat turn counters.** `engine.stats` / `engine.playedThisTurn` are the
  TEAM mirror (an elite threshold worded "16 damage per player, all team damage
  contributes" wants it); a Kid's own cards, Keepsakes and House Rules read
  `e.seatStats(seat)` / `e.seatPlayed(seat)`
- **all three bosses' multiplayer rules**, from their region chapters: the
  Butler's per-Kid House Rules, thresholds and Flustered cap (§28), the
  Governess's per-Kid Stitched Together, repair windows and Doll Courage
  (§35), the Bedframe Beast's marked Kid across BOO and all three Bed
  Positions (§46)
- **per-player thresholds and per-Kid allowances** across the built Big Scares
  and ordinary enemies — Grand Coatcheck, Unwelcome Guest, Toy Chest, Blanket
  Blob, Blanket Creeper, Slipper Skitter, Thing Beneath
- **a shelf each at Mr. Moth's** — their Companion's pool, Keepsakes they do
  not own, their own prices and removal price, forked per seat so two Kids on
  one Companion do not race for the same card
- **choices know whose they are.** `ask({ seat })` reaches the picker only for
  `engine.localSeat`; anyone else's resolves from the request's `prefer` rule
  and is logged with its seat, so a replay can tell the two Kids apart
- **`Incoming` is one Kid's** — what is aimed at them plus anything splashing
  off a move aimed at their friend, against their own Guard
- **pass-and-play.** `run.setLocalSeat(n)` moves the seat and every per-Kid
  thing with it; `ui/handoff.js` covers the board with an OPAQUE veil between
  Kids, because a hand of Tricks is the one private thing in this game.
  Combat ends one seat at a time and the enemy phase waits, as it always did;
  the reward, Mr. Moth's, the Safe Room and Curiosities each hand over and the
  last Kid out closes the room. A round, and a room, always starts with seat 0

**The technique worth reusing.** In a party with the dev guard armed,
`engine.player` / `.piles` / `.relics` THROW and name the fix rather than quietly
resolving to seat 0. Running a real two-player fight produced the port list one
throw at a time — engine, then trackers, then the run layer, then the scene, then
the HUD, then a Keepsake. A shipped build still degrades to seat 0 rather than
throwing at a player mid-run.

### Balance: measured, not quoted

Enemy Courage at 2p is **220%**, and it took three measurements because the
sources disagree. Our own design doc says 160% (measures far too easy: duo wins
92% vs solo 80%). StS2 actually uses 250% (measures as the mode its own players
call overtuned: duo wins 60% vs 80%). 220% is the parity point:

| | 1p | 2p |
|---|---|---|
| Scuffle win% (n=30) | 73 | **77** |
| Elite win% (n=20) | 55 | **55** |
| falls per fight | 0.27 | 0.57 |

Re-measured unchanged after the boss and per-player work on 2026-08-26.

**Solo boss Courage is now a live question.** Wiring the Governess's Stitched
Together moved her from 95% player wins at every Courage scale — the flat line
of a boss with no defence — to 54.2% and 10.1 turns, inside the 45–65% / 8–12
band for the first time, at the Courage she already had. The Butler moved the
other way on length: a true A/B at x1.0 reads 75% → 66.7% and 12.4 → 13.5 turns
(median 13 → 15). "He is not dangerous, he is long" is still true and the lever
is his Courage pool. That is a designer's call, so nothing was re-tuned.

Enemy DAMAGE never scales. The extra threat is targeting — AoE moves and
per-move seat preferences, wired from each region chapter. That half was missing
from the first pass and it broke the game at both ends: Scuffles got easier with
more Kids while Elites became unwinnable. `python tests/coop/balance.py`
re-measures; re-run it after any change to enemy damage, starting decks or the
co-op pool.

### NOT built

**Two people can play the whole game on one machine.** Pass-and-play is built:
combat turns, the reward, Mr. Moth's, the Safe Room and Curiosities all hand the
screen over with an opaque veil between them, and `run.setLocalSeat(n)` moves
every per-Kid thing at once. `tests/coop/playthrough.py` walks an expedition the
way two people would.

1. **Networking**, per the deferred wrapper — and it is now the ONLY item, with
   a smaller job than it had. Everything is playable; the wire moves a seat to
   another machine rather than filling a hole.

   | Seam | Today | With a wire |
   |---|---|---|
   | `ui/handoff.js` `shouldHandOff()` | true in a party, so the screen is passed | false — each client owns its seat |
   | the two-Kid **select** | player two picks on the same screen | they pick on theirs |
   | **card + Keepsake reward** | rolled per Kid; each takes theirs in turn | each screen shows its own |
   | **Mr. Moth's** | a shelf per Kid, taken in turn | each shelf on its own screen |
   | **Curiosities** | one room, each Kid answers it in turn | answered at the same time |
   | the **choice broker** | a request for another seat resolves from its `prefer` rule | it reaches that player's picker |

   `shouldHandOff()` is the single switch: a session that owns one seat answers
   false and every handoff above stops happening. The choice broker's fallback
   is not a placeholder — one player rummaging in the other Kid's hand would be
   worse than a stable rule — so it stays as the offline path.
2. **The other 11 Companions' co-op pools** — they are unbuilt Companions, so
   there is nothing to write co-op Tricks for yet.
3. **Two players reaching for the same Keepsake.** StS2 resolves that with
   rock-paper-scissors. Every Kid gets their own offer and nobody can reach for
   somebody else's, so there is nothing to resolve until the wire exists.

Everything else that was on this list is built — see
`docs/notes/2026-08-26-multiplayer-bosses.md`, which is also the record of the
five shipped mechanics that no code path ever called.


### Lockstep foundation

The deterministic RNG, `choiceLog` and `setChoiceScript` replay are a genuinely
good base — the run layer already uses them to reconstruct an interrupted fight
and verify it against a board digest, and that digest now covers every seat.
Seats shuffle in seat order off the one shared RNG, so the same seed deals the
same opening hands to the same Kids.

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
