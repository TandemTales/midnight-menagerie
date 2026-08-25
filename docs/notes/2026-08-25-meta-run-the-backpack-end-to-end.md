# The Backpack, end to end

*meta-run, 2026-08-25.*

The Kid's Backpack — one of the game's three pillars alongside the Companion deck and the
run map — did nothing at all. Not "did less than intended": nothing. `run.flags.gear` was
all zeros, `run.carrying` was `{}`, the HUD's Gear row rendered `hidden`, no gear hook ever
fired, and **every gear-gated Curiosity option was locked while you were carrying the item
it named**.

Three modules, all green in their own harnesses, none of them agreeing at the join. This is
CONTRACTS.md rule 9 in its purest form.

---

## 1. What was actually wrong

Three separate hard-coded item tables, and three different ideas of what "a Backpack" is:

| Module | Its table | What it emitted / stored |
|---|---|---|
| `scenes/select.js` | `KID_CODEX[kid].pack = [[name, slots], …]` | `[{name:'Multitool', slots:2}, …]` |
| `scenes/clubhouse.js` | `GEAR = [[name, slots, desc], …]` | display names into `Save.data.backpacks[kid]` |
| `data/backpack.js` | `BACKPACK_ITEMS` | keys everything by id: `'multitool'` |

`data/backpack.js` is the only one of the three that resolves Gear into tags, hooks and run
flags. It was handed objects. `itemById({name:'Multitool'})` is `undefined`, so:

- `backpackTags()` returned an empty Set → `run.carrying` empty → **`optionOpen()` false for
  every gated option**, including the ones naming an item in the pack.
- `backpackRunFlags()` summed nothing → `run.flags.gear` all zeros → no Blanket +8 at Safe
  Rooms, no First Aid Tin heal, no map peek, no clue bonus.
- `backpackHooks()` returned `[]` → the engine got no gear providers → Thermos and Glow
  Sticks were inert for the whole build.

And separately: `select.js` never read `Save.data.backpacks[kid]` at all, so the Clubhouse
Backpack editor — a whole screen — had **zero** effect on any expedition.

None of this threw. A wrong shape here produces empty collections and zeroed numbers, which
is exactly why it survived a build.

## 2. The seam shape, decided and written down

**A Backpack is `string[]` of item ids from `BACKPACK_ITEMS`, at every join.**

```
Save.data.backpacks[kidSlug]   string[]   the Clubhouse editor writes it
bus 'run:start' .backpack      string[]   select.js emits it
new Run({ backpack })          string[]   run.js stores it verbatim
run.backpack                   string[]   hud.js / event.js read it
run.snapshot().backpack        string[]   round-trips through Save
```

Names, slot counts, descriptions and icons are **never** carried across a seam; they are
looked up from the id. If you have display data at a seam you are on the wrong side of the
contract. This is written at the top of `data/backpack.js`, where anyone about to add a
loadout will read it.

`data/backpack.js` is now the only item table. The tables in `select.js` and `clubhouse.js`
are deleted; both screens render from `BACKPACK_ITEMS`.

## 3. The boot-time assertion (CONTRACTS rule 8)

Two guards, because there are two different failure modes.

**`assertLoadout(list, where)`** throws a `TypeError` naming the caller unless `list` is an
array of known ids. Called from:

- `bus 'run:start'` (so the stack names the emitter, not `new Run` three frames later),
- the `Run` constructor,
- `select.js _begin()`,
- `clubhouse.js _savePack()`.

The message lists the offending entries and every legal id. A regression to the old object
shape is now a loud red error on the first expedition rather than a silently dead pillar.

**A module-load table check** in `data/backpack.js` runs once, before any screen exists, and
throws if an item id is duplicated, a size is outside 1–3, a `KID_LOADOUTS` entry names an
item that no longer exists, or an authored loadout no longer fits a new Kid's five slots.
That last one is the drift that used to surface three screens later as "the Gear row is
empty".

**`migrateLoadout(list, where)`** is the one lenient door, used only by `Run.resume`: a save
written by the broken build holds `{name,slots}` objects or display names. Those are
converted to ids with a loud `console.warn` rather than throwing — refusing to load
somebody's expedition is a worse outcome than a warning. An unresolvable entry is dropped
with a `console.error` naming it.

An **empty** array is now honoured rather than replaced by the default: the Clubhouse lets
you unpack the whole bag and §19 makes that a real loadout decision.

## 4. Reconciling the loadouts

`select.js` and `data/backpack.js` disagreed about what every Kid carries. The design doc
authors the *items* (§18–20) but not the per-Kid packs, so neither table was canonical. I
kept the `select.js` versions, because those are the ones the player actually read on the
Kid dossier and the ones each Kid's perk is written around — Maya's "Checked the Batteries"
wants a Flashlight and Spare Batteries to check; Jordan improvises with a Thermos.

Two overflowed five slots once **real** sizes were applied (the old tables' slot counts were
made up), and were trimmed:

- **Lena** Flashlight + Camera + Pocket Mirror + Chalk = 6 → Chalk dropped, 5.
- **Lucy** Pet Treats + Familiar Toy + Blanket + Flashlight = 6 → Flashlight → First Aid Tin, 5.

Amina and Priya had a spare slot and gained Glow Sticks / Chalk respectively. All eight now
sit at exactly 5/5, asserted at module load.

## 5. Every hook, proved behaviourally

Each one measured as an A/B inside a **real** `CombatEngine` built by the **real**
`run.buildCombat()` — same seed, same companion, same node, the pack the only difference.
`tests/backpack/index.html` §5.

| Item | Proof | Measured |
|---|---|---|
| Big Flashlight | +3 Guard, opening turn | 0 Guard → 3 Guard |
| Camera | Weak 1 on every enemy at combat start | `[0]` → `[1]` |
| Glow Sticks | one extra card on turn 1 | 5 cards → 6 cards |
| Thermos | +4 Courage at the first clean turn end | +0 → +4, and `field.gear.thermos` set |
| Good Blanket | Safe Rooms restore +8 | `restHealAmount()` 20 → 28 |
| First Aid Tin | +15 Courage entering a Curiosity | 28 → 43 on `enterNode` |
| every item with `run:` flags | reaches `run.flags.gear` | 13/13, each checked individually |
| every item's tags | reaches `run.carrying` | 52 tags, none missing |
| every hook-bearing item | arrives at the engine as `gear/<id>` | 4/4 |

### Big Flashlight was dead even after the seam was fixed

The A/B caught a second, independent bug: `onCombatStart` granted 3 Guard, and
`_beginPlayerTurn` **wipes Guard at step 2**, after `onCombatStart` has already run. The
Guard was gone before the player saw a card. Moved to `onTurnStart` at turn 1, which runs at
step 3 — the safe side of the wipe. This is exactly the class of bug rule 9 exists for: the
hook fired, the effect vanished, and reading the code would not have told me.

**→ `data/relics.js` has the same bug and I do not own that file.** `welcome-mat`
("Gain 4 Guard at the start of every Scuffle") grants its Guard in `onCombatStart` and it is
wiped by the same step-2 rule before turn 1. Worth checking every Keepsake that grants Guard
or any other turn-scoped resource from `onCombatStart`.

## 6. The Clubhouse editor now decides the expedition

`select.js` gained `loadoutFor(kid)`: the Clubhouse's saved pack if there is one (migrated
if it is old), the Kid's authored loadout if there is not, and an honest `[]` for a
deliberately emptied bag. `_showKid` renders from it and `_begin` emits it — **the same
call**, so what the dossier prints is exactly what the kid walks in with. When the pack came
from the editor the slot line says so: `2 / 5 slots · packed at the Clubhouse`.

The Clubhouse editor stores ids and reads its shelf, names, descriptions and slot pips from
`BACKPACK_ITEMS`.

Proved with real clicks in `tests/backpack/run.py` phase B: empty the bag in the Clubhouse,
add the Thermos, walk to Select, press Begin, read `window.MM.ctx.run.backpack` → `['thermos']`.

## 7. Gated Curiosity options

`run.optionOpen()` and `satisfyingItem()` were already correct — they were being fed the
wrong shape. With ids they work, and all 11 gated options across the 10 gated Curiosities
open with their item and stay shut without it (asserted individually).

`event.js _gateLine()` had a smaller problem of its own: a `requires` may be a **tag**
(`'canine'`, `'pry'`), and it only tried `itemById`, which returns nothing for a tag — so a
tag-gated option printed "You would need something with a blade." with no hint what that
is. It now uses the new `itemsSatisfying(requirement)`, which answers for ids and tags
alike, so a locked door always teaches you what to pack next time.

Screenshot: `shots/p7-bp-gate-unlocked.png` — The Bell Pull, Maya, "Cut the rope down."
enabled and tagged `GEAR · Multitool`. Compare `shots/p6-61b-gate.png`.

## 8. Surfacing it in the HUD

`ui/hud.js` was already written to read `run.backpack` as ids, so the Gear row lit up the
moment the seam was fixed — round, cool chips against the square, warm Keepsake chips, with
its own `GEAR` label and divider.

One thing it did not do was *inform*: every item drew the same generic knapsack, so four
chips told you that you were carrying four things and nothing about which four. A HUD you
have to hover to read is not surfacing anything. `GEAR_GLYPHS` now holds one 24×24 stroked
drawing per item, keyed by the `icon` name authored in `data/backpack.js`, in the same
stroke language as the Keepsake sigils. An unknown icon still falls back to the knapsack, so
a new item can never render an empty circle. Hand-off noted in the file: fold these into
`ui/icons.js` when it grows a Backpack set.

## 9. Balance — did working gear move survival?

Two measurements, because they answer different questions.

**A/B, gear isolated** (`tests/backpack/balance.py`, n=60, competent bot, seeds
90000+7i, marmalade, haunt 0). The same expeditions twice through the same
`tests/critic-design/lib/expedition.js` the balance simulator uses; arm A carries nothing —
what a real expedition actually carried while the seam was broken — arm B carries Maya's
authored pack. Everything else identical.

| | win | reached boss | rooms (mean) | regions cleared |
|---|---|---|---|---|
| A · no gear | 53.3% | 91.7% | 21.18 | 1.28 |
| B · real pack | 56.7% | 96.7% | 21.75 | 1.33 |
| **delta** | **+3.3pp** | **+5.0pp** | **+0.57** | +0.05 |

So: yes, and by about the amount it should. Maya's pack is deliberately utility-heavy —
only the Flashlight has a combat hook at all (+3 Guard on turn one) — and a Kid built around
combat Gear would move it further. Gear is not meant to out-scale Keepsakes.

**The simulator itself**, exactly as briefed
(`python tests/critic-design/sim.py --n 60 --bots competent`): whole-run survival **58.3%**,
reached the Foyer boss 96.7%, boss win given reached 81%, deaths 25 (12 nursery boss, 11
foyer boss, 1 elite, 1 scuffle). The stored baseline in
`tests/critic-design/sim-result.json` reads 50% survival / 75% reached boss, but that file
is from 2026-08-20 and predates several agents' combat changes, so it is not a gear-only
comparison — which is why the A/B above exists. Result written to
`tests/backpack/sim-after.json` so the existing baseline is not clobbered.

Note for whoever tunes next: the simulator builds `new Run({companion, seed, haunt})` with
no kid, so it has always modelled **Maya's default loadout**, not the empty pack a real
expedition actually had. It was over-modelling gear by roughly the delta above. It is now
modelling the truth.

## 10. Also fixed, while in these files

### Mr. Moth's third Snack was half-unbuyable at 1600×900

Confirmed: `.rm-body` is a scroll box that ended at y 820 with `.rm-foot` starting there, and
the shelf overran it by ~40px, so the last row's BUY button sat under the footer —
`document.elementFromPoint` at its centre returned `.rm-foot`. Visible, unclickable, and the
page itself does not scroll (`docH == innerHeight == 900`), so nothing about it looked wrong.

Fixed in `shop.css` in two halves, because either alone leaves a bad case: the body now keeps
a footer's worth of scroll clearance beneath its last row, and a `@media (max-height: 960px)`
block gives the counters back the ~40px (a little less padding, a slightly narrower Mr. Moth,
tighter gaps). Nothing changes above 960px.

Verified across 8 shop seeds at 1600×900: `scrollHeight - clientHeight == 0` on all of them
and **every** one of the 12 BUY buttons hit-tests to itself. `shots/p7-bp-shop-fixed.png`
(before: `shots/p7-bp-shop-before.png`).

### Wing 1's Rescue freed a Companion who was already home

`mapgen.js REGIONS` points four wings at **starter** Companions — foyer→marmalade,
crypt→bones, kitchens-cellars→taffy, pumpkin-grounds→pipkin. The starters are at the
clubhouse from the first expedition and were never in the house, so following that table
literally spends the run's emotional peak on nothing. A reviewer freed Marmalade while
playing Pipkin and got "FREE · 1 OF 16" for a Companion already on the roster.

`mapgen.js` is the map agent's, so the fix is on the run side, at the moment the run knows
who is actually missing:

- `Run.missingCompanions()` — everyone except the Companion beside you, anyone this save has
  already freed, and the four starters.
- `Run.rescueTargetFor(nodeId, authored)` — the authored Companion when they are still
  missing; otherwise a deterministic pick (seed-derived `fork`, so a seed still reproduces
  the run) from whoever is, preferring one whose own wing this is.

Used by both the Rescue room (`_prepareEvent`) and the boss-kill auto-rescue
(`completeRegion`), which had the same problem. Measured live: playing Pipkin in the Foyer,
authored `marmalade` → freed `wisp`, with 12 Companions genuinely missing.

`STARTER_SLUGS` is duplicated in `run.js` rather than imported from `ui/portrait.js`, because
`run.js` must stay headless (`tests/run/index.html` imports it with no DOM) and portrait.js
is a UI kit. `tests/backpack/index.html` asserts the two lists are identical so they cannot
drift in silence.

**`tests/run/index.html` changed.** It asserted `run.rescued.includes('marmalade')` after
the boss — it had frozen the bug into the suite. It now checks the property that matters:
somebody was freed, they are not the Companion you are playing, and they are not a starter.
Still 50/0.

## 11. Reported, not fixed (not my files)

1. **`data/relics.js` — Welcome Mat's opening Guard never lands.** Same `_beginPlayerTurn`
   step-2 wipe that killed the Big Flashlight. Any Keepsake granting Guard from
   `onCombatStart` should move to `onTurnStart` + `turn === 1`.
2. **`state/mapgen.js:184` and the `REGIONS` table** — four wings authored to a starter
   Companion. The run layer now substitutes, but the table is still misleading to read, and
   a wing whose Companion is a starter has no authored rescue of its own.
3. **`scenes/gameover.js` — the closing line is identical for every Kid**:
   *"&lt;Kid&gt; does not say anything on the walk back. She is working out what to bring next
   time."* Second time you see it, it reads as a template. It also hardcodes **"She"** — it
   is printed for Mateo, Eli, Jordan and Samir. Two fixes needed: per-Kid closing lines (the
   Kid docs have voice for all eight) and a pronoun that comes from the Kid record.
4. **`ui/icons.js`** — the 18 Gear glyphs live in `ui/hud.js` for now (see §8); they belong in
   the icon set.

## 12. Files touched

- `game/src/data/backpack.js` — the seam contract, `itemByName` / `assertLoadout` /
  `migrateLoadout` / `itemsSatisfying`, reconciled `KID_LOADOUTS`, module-load table check,
  Big Flashlight hook moved to turn 1.
- `game/src/state/run.js` — `assertLoadout` at the constructor and at `run:start`,
  `migrateLoadout` on resume, empty packs honoured, `STARTER_SLUGS`,
  `missingCompanions()`, `rescueTargetFor()`.
- `game/src/scenes/select.js` — its item table deleted; `loadoutFor(kid)` reads
  `Save.data.backpacks`; dossier renders real items, sizes and descriptions; `_begin` emits ids.
- `game/src/scenes/clubhouse.js` — its item table deleted; the editor reads `BACKPACK_ITEMS`
  and stores ids.
- `game/src/scenes/event.js` — `_gateLine` names items for tag gates too.
- `game/src/ui/hud.js` — per-item Gear glyphs.
- `game/src/scenes/shop.css` — the occluded BUY button.
- `tests/backpack/**` — new: `index.html` (69 checks), `run.py` (2 phases, 77 checks),
  `balance.html` + `balance.py` (the gear A/B).
- `tests/run/index.html` — the boss-rescue assertion.

## 13. Suites

```
tests/backpack/run.py        77 checks, 0 failures   (69 module + 8 real-game UI)
tests/run/run.py             50 runs,   0 errors
tests/seams/check.py         1604 call sites, 0 problems
tests/scene-css/check.py     10 sheets, 871 classes, 0 conflicts
tests/chrome/run.py          27 checks, 0 errors, 61 fps
```

Screenshots: `shots/p7-bp-gate-unlocked.png`, `p7-bp-clubhouse.png`, `p7-bp-select-kid.png`,
`p7-bp-shop-fixed.png`, `p7-bp-shop-before.png`.
