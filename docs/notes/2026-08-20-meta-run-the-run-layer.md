## 2026-08-20 — meta-run (the run layer)

Shipped `src/state/run.js`, `src/scenes/{reward,shop,rest,event}.js` + their CSS,
`src/data/{relics,events,backpack}.js`, `tests/run/**`. `ctx.run` is real now —
every screen that was mocking it can stop.

**`python tests/run/run.py` → `RESULT: 50 runs, 0 errors` (5.2 s).**

### How the run layer installs itself

`main.js` imports all ten scenes at boot, and `scenes/reward.js` imports
`state/run.js`, so `installRunLayer()` runs once before anything can be clicked.
It listens for:

| event | what it does |
|---|---|
| `run:start` (select) | `new Run({companion, kid, seed, hauntLevel, backpack})`, sets `ctx.run`, autosaves |
| `run:continue` (title) | `Run.resume(Save.loadRun())`, sets `ctx.run`, **does not navigate** — title uses the snapshot's `scene` field |
| `map:choose` (map) | `run.enterNode(node.id)` |

`map.js` also calls `run.chooseNode(node)` directly right after emitting
`map:choose`; `chooseNode` returns immediately if that node is already current,
so the two paths can never double-advance.

It emits `run:enterNode`, `run:combatStart`, `run:combatEnd`, `run:reward`,
`run:end`, plus `run:deck`, `run:courage`, `run:lostThings`, `run:keepsake`,
`run:clue`, `run:rescue`, `run:forge`, `run:region`, `run:ready`.

### `Run` — the API

```js
new Run({ companion, kid, seed, hauntLevel, backpack })
Run.resume(saved)                         // from Save.loadRun()
Run.mock({ seed, companion, kid, node })  // a real run walked a few rooms, ephemeral
run.snapshot()  run.save()                // window.MM.state() reads snapshot()
// deck (entries are { uid, id, upgraded }; defs via cardById)
deck  deckViews()  addCard(defOrId)  removeCard(uid)  upgradeCard(uid)
transformCard(uid)  upgradeableCards()  removableCards()
// resources, in TERMS vocabulary
courage  maxCourage  lostThings  keepsakes  snacks  cluesFound
heal(n) hurt(n) addMaxCourage(n) addLostThings(n) spendLostThings(n)
addKeepsake(id) addSnack(s) addClues(n)
// map
region  regionIndex  map  currentNode  legalNodes()  legalNextIds()
enterNode(id)  chooseNode(node)  leaveNode()  effectiveType(node)  sceneFor(node)
// rooms
claimReward() takeRewardCard(id) skipRewardCards()
rest() restHealAmount() forgeKeepsake(id) forgePreview(id) forgeCost()
shopStock() buyCard() buyKeepsake() buySnack() buyRemoval(uid)
currentEvent() optionOpen(o) chooseEventOption(id) applyEffects(fx) eventCombat(kind)
rescueCompanion(slug) completeRegion() advanceRegion() end(victory, killedBy, {navigate})
// progression
hauntLevel  rescued  flags        // flags = aggregated Keepsake + Gear run effects
rng  fork(tag)
```

Legacy aliases the other agents' code already reads are live getters, not copies:
`hp`, `maxHp`, `gold`, `relics`, `potions`, `regionId`, `floor`, plus the plain
fields `currentNodeId`, `visitedIds`, `pathIds`, `combat`. Gameover's documented
field list is satisfied by `snapshot()` verbatim, including `companionsFreed`,
`killedBy` and `stats.{scuffles,bigScares,curiosities,safeRooms,cardsPlayed,turns,clues}`.

### Determinism

`this.rng = new RNG(seed)` is never consumed for content. Every subsystem takes
`run.fork(tag)`, and `RNG.fork` hashes the *constructor* seed, not the stream
position — so `fork('map:foyer')`, `fork('reward:foyer-3-2')`,
`fork('shop:foyer-4-1')`, `fork('combat:<nodeId>')`, `fork('event:<node>:<option>')`
are independent. Adding a shop roll cannot move the map. Verified: 5/5 seeds
replay byte-identically (a digest over result, deck, Keepsakes, path, stats).

**One qualification worth writing down.** A seed reproduces a run *given the same
meta state*. `generateRegionMap` is handed `rescued` on purpose — the design doc's
premise is that the house rearranges itself differently for different Kids and
Companions — so a run that frees Marmalade changes what the *next* run with the
same seed looks like. That is a feature, but it means any determinism test must
reset `Save.data` first. The harness does; it cost me an hour of confusion.

### Autosave / resume

`save()` runs after every state change (~80 per expedition, 4023 across the 50-run
sim). `Run.resume(saved)` restores deck uids, Keepsake counters and forge state,
the map with its `visited` flags and resolved Unsurveyed rooms, the walked path,
seen Curiosities, encounter history, removal price, pity counter and pending
reward/event/shop. Round-trip digest is identical, 3/3.

Mid-**map** resume is exact. Mid-**combat** deliberately is not: an unfinished
fight puts you back on the blueprint rather than replaying for free.
`snapshot().scene` tells `title.js` where Continue should land.

### The four scenes

Deep links all work standalone — `#scene=reward` (`&kind=bigScare`), `#scene=shop`,
`#scene=rest`, `#scene=event` (`&event=the-collar`). With no expedition running they
build `Run.mock()`: a **real** Run on a fixed seed, walked a few rooms, with
`ephemeral = true` so it cannot overwrite a genuine save. Nothing on these screens
is a fake number.

`scenes/reward.js` also exports the **shared room chrome** (`RoomScene`, `esc`,
`chip`) that shop/rest/event extend — ground, vignette, header, live HUD, footer,
the CardView picker overlay, settings handling and the teardown registry. I put it
there rather than in a new file so I stayed inside my ownership row, and because
reward.js is already imported at boot.

- **reward** — 3 real `CardView`s on a shallow arc, take one or skip. The spoils
  (Lost Things, the Big Scare Keepsake with its full text, Clues) are on screen
  *before* you choose. Skipping is a stated play: `+12 Lost Things, Luck +2`, and
  the live Luck chip shows the pity counter so "none of these three" is legible as
  correct rather than as a forfeit. Keys: `1-3` / arrows to move, `Enter` take,
  `S` skip.
- **shop** — Mr. Moth (procedural SVG, lamp and all) behind his counter. Five
  Tricks, three Keepsakes, three Snacks, and the removal service, all seeded per
  node. Owning a card already is a *note*, not a lock. Unaffordable is unmistakable:
  desaturated item, struck-through price in the threat ramp, and the button reads
  `N short` instead of `Buy`. Removal starts at 65 and rises 25 each use unless
  you have Mr. Moth's Ledger.
- **rest** — a Blanket Fort you build (§24). Four doors, one choice: **Rest**
  (30% + Gear/Keepsake bonuses, shown as an exact `42 → 62`), **Sharpen a Trick**
  (the picker renders the real card and swaps it to its `+` face on hover/focus —
  before and after on the card itself), **Forge a Keepsake** (StS2's Forge: +1 tier
  for 8 maximum Courage, with before/after prose per Keepsake), and **Sit with your
  Companion** (free, +1 Clue, and a line of authored dialogue per Companion).
- **event** — prose first: a per-mood vignette, the authored text set as a page,
  then the options as full-width doors that name their **risk** and **gain** up
  front. Gated options stay visible and say exactly which Gear would have opened
  them, which is what makes the Backpack loadout screen mean something. Outcomes
  render with effect chips and can chain into a card picker or a fight.

All four: full keyboard path, visible focus, `reduceMotion` / `largeText` honoured
and re-read on `settings:changed`, `exit()` removes every listener and destroys
every CardView. Measured **61 fps** at 1600x900 on reward, shop and rest while the machine was
quiet. Later readings of 21-35 are machine-wide, not mine: in the same sweep
`#scene=title` read 29 and `#scene=map` read 21 while my shop read 35, so the
shared backdrop or a concurrent agent is the load. Re-measure in isolation
before believing any low number here.

### Forge, and why it works for every Keepsake

Rather than authoring a bespoke tier-2 for 30-plus relics, a forged Keepsake fires
its **opening hook twice** (`onCombatStart` / `onTurnStart`). Welcome Mat gives 8
Guard, Porcupine Slipper 6 Bristle, the Night-Before Bag draws 4. `forgePreview(id)`
says so in plain language and flags the Keepsakes with no opener as a poor purchase
instead of silently taking your Courage.

### Keepsakes — `data/relics.js`, 33 of them

- starter: Pocket Flashlight, Spare Batteries, Friendship Bracelet
- common: Welcome Mat, House Slippers, Brass Service Bell, Chewed Tennis Ball,
  Jar of Fireflies, Butterfly Net, Sticky Hand, Lucky Button, Chalk Stub,
  Thermos of Cocoa
- uncommon: Wind-Up Mouse, Moth-Eaten Monocle, Nightlight, Porcupine Slipper,
  Coatcheck Ticket, Spare Key, Knotted Handkerchief, Tin of Sardines
- rare: Ninth Life Charm, Night-Before Bag, Stopped Pocket Watch, Mothballed Quilt,
  Hollow Birdcage, Black Cat's Shadow, The Collar
- boss: The Butler's White Glove, The Governess's Hand Bell, Bedframe Splinter,
  Lamplighter's Wick
- shop: Mr. Moth's Ledger, Pocketful of Buttons, Night Vendor's Lantern
- event: Bowl With Your Name On It, Photograph of a Cat, Wall Scratchings

Five of the Foyer's authored run-passive concepts (§32) are in as written: Brass
Service Bell, House Slippers, Spare Key, Coatcheck Ticket, Welcome Mat.

Three implementation notes for anyone writing more:

1. **Value reducers must be pure.** `modifyDamageDealt` / `modifyDamageTaken` /
   `modifyCardCost` also run on the *display* path (intent numbers, live card text,
   hand playability), so a "first time each combat" flag consumed inside one is a
   bug you will see as a number that changes when you hover. Per-combat memory
   lives in `engine.field` (which `clone()` deep-copies, so previews are sandboxed)
   and is only ever *written* from a real mutation hook — `onIncomingHit`,
   `onAttackDealt`, `onCardPlayed`, `onCombatStart`.
2. **`h.amount = n` does nothing in `onIncomingHit`.** The payload is spread per
   provider; use `h.setAmount(n)` / `h.prevent()` / `h.setHp(n)`.
3. **A turn-start `gainEnergy` is silently overwritten.** The pipeline refills
   Nerve to `energyMax` at step 6, after every `onTurnStart` hook. Keepsakes that
   grant Nerve raise `player.energyMax` instead (`lendNerve` / `returnNerve` in
   relics.js), which also makes the orb honestly read 4/4.

Declarative run-layer effects live on `RelicDef.run` and are aggregated by
`relicRunFlags()` into one plain object (`run.flags`), so no scene ever knows a
Keepsake by name: `lostThingsMul, luck, restBonus, shopDiscount, revealUnknown,
unlockEvents, flatRemoval, shopRare, noRestHeal, clueOnClear, enemyHpMul,
maxHpOnMilestone`.

### Curiosities — `data/events.js`, 16 of them

The four the design doc names — **Scratching Behind the Wall**, **The Collar**,
**The Feeding Room**, **The Photograph** — plus **The House Register**, **The Bell
Pull**, **The Umbrella Gallery**, **The Cat Flap**, **The Dumbwaiter**, **The Lost
and Found**, **The Painted Dog**, **Mr. Moth's Cousin**, **The Open Window**, **The
Coat With Something In It**, **The Cat on the Stair**, **The Mended Thing**, **The
Night's Arithmetic**. Every one has 2-4 options with authored, weighted outcomes;
ten of them turn up Clues for the missing-pet investigation, and The Dumbwaiter's
Familiar Toy branch is the one where you find out your pet is upstairs.

Effects vocabulary (applied only by `run.applyEffects`): `hp, heal, maxHp,
lostThings, snacks, clues, relic, card, curse, removeCard, upgradeCard, combat`.
Options may carry `requires` (a Backpack item id or tag), `gateText` and
`cost.lostThings`.

### Backpack — `data/backpack.js`, 18 items

Dog Whistle, Pet Treats, Camera, Familiar Toy, Collar and Tag, Big Flashlight,
Walkie Talkie, Pocket Mirror, Multitool, Coil of Rope, Box of Chalk, Glow Sticks,
Compass, Investigation Notebook, Good Blanket, Thermos, Spare Batteries, First Aid
Tin. Sizes are 1/2/3 slots against `SLOTS_BASE = 5` (`SLOTS_MAX = 8`), per §19.
Each item can carry `tags` (what Curiosity gates ask for), `hooks` (relic-shaped
combat behaviour, handed to the engine by `backpackHooks()`) and `run` flags.
`KID_LOADOUTS` gives all eight Kids an authored starting loadout that fits in 5.

### Simulation — `tests/run/**`

50 seeded expeditions driven straight through `Run`, no scenes, no DOM. A bot
scores each playable card with the engine's own `preview()` and plays the best.

```
run length  6-7 x5  8-9 x12  10-11 x7  12-13 x26   mean 10.6, min 6, max 13
end state   defeat/foyer x44   victory x6
final       deck 11/14.1/18   purse 12/185.8/420   keepsakes 1/3.2/7
determinism 5/5   resume 3/3   localStorage 3/3   autosaves 4023
RESULT: 50 runs, 0 errors
```

Plus an explicit boss block that walks a run to the Butler and asserts the whole
tail: boss node reached, reward `kind === 'boss'`, a boss Keepsake dropped,
`result === 'victory'`, the region Companion freed, the rescue written to
`Save.data.companionsRescued`, and `Save.loadRun()` null afterwards.

For speed the bulk runs use an in-memory stand-in for `Save.saveRun` (a snapshot
carries the whole region map; 4000 multi-kilobyte localStorage writes dominates the
runtime otherwise). Three runs at the end go through the real `Save`/localStorage
path to prove that seam.

**Balance observation, not a defect:** 44/50 expeditions end in defeat in the
Foyer with a competent-but-not-clever bot. That is either the Foyer being tuned
hard or the bot being mediocre; whoever owns tuning may want a human read.

### Scope

`RUN_LENGTH_REGIONS = 1` in `run.js` — an expedition ends at the region boss, as
briefed. The ladder itself is real: `completeRegion()` frees the region Companion
and then either `advanceRegion()` (rebuilds the map, resets encounter history,
emits `run:region`) or ends the run. Raising that constant is the only change the
17-region campaign needs from this file; `_contentRegion(tier)` already falls back
to a region with authored formations when the current one has none, so the ladder
does not crash on the fourteen regions without enemy content yet.

### Tokens

No new tokens needed. Used `--good-300/-500` and `--warn-300` (thank you — they had
landed by the time I needed them), the `--arcane-*` / `--brass-*` ramps from
`ui/portrait.css`, and the standard ink/flame/spectre/threat/courage/guard/rarity
ramps. **Zero hex literals in my four CSS files.**

### Asks

- **combat-scene** — `ctx.run.combat` is set before I navigate, exactly as you
  asked, and `ctx.run.{companion,region,seed,rng,gold}` are all live. Two small
  things: (1) I pass Backpack Gear to the engine as extra relic-shaped providers
  marked `gear: true`, so the Keepsake bar currently shows Maya's Camera next to
  her Pocket Flashlight — worth a different chip treatment. (2) Please keep your
  `scenes.go('reward')` / `scenes.go('gameover')` on victory/defeat: `run.js`
  deliberately does **not** navigate out of combat, because `combat:end` fires a
  second before your death animation finishes. The reward is already prepared by
  the time you arrive.
- **frontend** — gameover's field list is satisfied by `snapshot()` as written, and
  `Save.clearRun()` has already run by the time you get there, so your
  `_activate()` clear is harmless but redundant. Title's Continue works: the
  snapshot carries `scene`.
- **map** — `run.legalNextIds()`, `run.currentNodeId`, `run.visitedIds`,
  `run.pathIds` and `run.chooseNode(node)` are all live. `run.flags.revealUnknown`
  (Chalk Stub / Pocket Mirror) sets `node.revealed` to the real type on Unsurveyed
  nodes if you want to draw it; `run.effectiveType(node)` is the resolver.
- **lead** — `tests/run/**` is mine and does not touch `tools/`. `data/relics.js`,
  `data/events.js`, `data/backpack.js` and `state/run.js` are all created as listed
  in the ownership table.

### Screenshots

`shots/rw.png` (scuffle reward), `f-rw.png` (Big Scare reward with the Keepsake
plate), `sh4.png` (Mr. Moth's), `rs2.png` (the fort), `f-rs.png` (the Sharpen
picker showing Scratch to Scratch+ on the real card), `ev2.png` / `ev2b.png`
(Scratching Behind the Wall, before and after choosing), `f-flow.png` /
`f-flow2.png` (`run:start` to map to a real fight booted from the run's deck).

---
