# Build notes

Append-only. One dated section per agent.

---

## 2026-08-19 — combat-engine

Shipped `game/src/combat/**`, `game/src/data/keywords.js`, `game/src/data/statuses.js`,
`tests/combat/**`. Headless, deterministic, no DOM, no THREE, no `Math.random(`,
no `setTimeout`. Test suite: **261 assertions, 0 failures** at
`http://localhost:8777/tests/combat/index.html` (run it with `python tests/combat/run.py`).

### Files

| File | What it is |
|---|---|
| `combat/engine.js`   | `CombatEngine` — the public API, turn order, all mutation |
| `combat/actor.js`    | `Actor` / `Player` / `Enemy` |
| `combat/damage.js`   | the single ordered damage pipeline (`computeDamage` is pure) |
| `combat/piles.js`    | `Card` runtime instance + the six zones |
| `combat/statuses.js` | the 13 universal statuses + `registerStatus()` |
| `combat/preview.js`  | `preview()` by replaying on an engine clone |
| `combat/intents.js`  | intent building, families, live recalculation |
| `combat/events.js`   | `EV` constants + payload documentation |
| `combat/hooks.js`    | hook dispatch + provider ordering |
| `combat/dummy.js`    | `makeDummyCombat(rng)` — bootable fight with zero content deps |
| `data/keywords.js`   | tooltip registry; merges the companion keyword file |
| `data/statuses.js`   | thin re-export of `combat/statuses.js` |

### Public API (exactly CONTRACTS.md)

```js
new CombatEngine({ player, enemies, rng, relics, hooks, bus })
engine.state                          // plain, structuredClone-able, cached until a mutation
await engine.startCombat()            // Promise<void>
engine.canPlay(uid, targetId)         // { ok, reason }   reason is player-facing prose
await engine.playCard(uid, targetId)  // Promise<Event[]>
await engine.endTurn()                // Promise<Event[]>
engine.preview(uid, targetId, opts?)  // { damage, block, statuses, killsTarget, ... }
engine.on(type, fn)                   // returns an unsubscribe fn; '*' = every event
```

`player` config: `{ name, maxHp, hp, energyMax, drawPerTurn, handCap, companion, kid, deck }`
where `deck` is `CardDef[]` or `[{def, upgraded}]`.
`enemies` is `EnemyDef[]` or `[{def, hp?, id?}]`. **An `EnemyDef.hp` is the inclusive
roll range `[min,max]`, never a value** — only the wrapper form may pin an exact hp.

Useful extras beyond the contract: `engine.cardSnap(card, targetId)`,
`engine.cardDamageFor(uid, targetId)`, `engine.costOf(card)`, `engine.log` (last 400
events), and `previewIncoming(engine)` from `preview.js` for the incoming-damage readout.

### Event list

Every event is `{ type, seq, turn, ...payload }`. `seq` is monotonic for the whole
combat — use it to order an animation queue and to skip events already played.
Full payload docs are the header comment of `combat/events.js`.

```
combat:start  combat:end
turn:start    turn:end     phase
draw  discard  exhaust  shuffle  hand:full
card:add  card:move  card:play  card:resolved  card:cost  card:meta  card:invalid
energy
damage  block  block:lose  block:break  heal  hp:max
status  status:trigger
death  intent
counter  timer  timer:fire
summon  entity:remove
object:add  object:update  object:remove
relic:trigger  log
```

Renderer-relevant details:

- **`damage`** carries `base, amount, blocked, hpLoss, hpBefore, hpAfter,
  blockBefore, blockAfter, hits, hitIndex, lethal, kind, cause, cardUid`.
  `amount` is post-modifier **before** Guard; `hpLoss` is what the Courage bar loses.
  Scale screen shake off `hpLoss`, not `amount`. `hitIndex`/`hits` lets you space a
  multi-hit into separate impacts.
- **`block:break`** fires only when Guard went from >0 to exactly 0 from a hit —
  that is the shatter cue. Plain `block:lose` with `reason:'turnStart'` is the
  quiet start-of-turn wipe and must NOT shatter.
- **`intent`** carries `{ enemyId, intent, previous, reason }`. It is emitted only
  when the *rendered* intent actually changed, so you can animate a number flip on
  every one. `intent.damage` is per hit, post-everything; `intent.hits` drives the
  xN display; `intent.totalDamage` is the product; `intent.family` is one of
  `attack | defense | scheme | special` (Wink's Intent Families);
  `intent.tooltip` is a finished plain-language sentence.
- **`draw` / `discard` / `exhaust`** each carry the full `card` snapshot plus live
  pile counts, so pile-count chips can update from the event alone.
- **`shuffle`** carries `order: [cardUid]` — the exact new draw-pile order.
- **`counter`** is the animation hook for Companion resource tracks
  (Lives / Glow / Height / Loose Bones / Globs / Loyalty / Compost / Web).
- **`card:resolved`** has `destination: 'discard' | 'exhaust' | 'power' | <pile>` —
  the three need visibly different motion signatures.
- Powers do **not** go to the exhaust pile. They park in `limbo` with
  `meta.zone === 'power'` so effects counting Vanished Tricks stay honest.

### Turn order (authoritative)

**startCombat** → `combat:start` → `onCombatStart` hooks → shuffle deck (Innate
lifted to top) → enemies roll Courage, `onSpawn`, pick first move → begin turn 1.

**Start of your turn** → `turn:start` → **Guard wiped** (`player.keepBlock` survives
one wipe) → **statuses tick** (`onTurnStart` hooks, then `'turnStart'` decay; Dread
ticks here) → **countdown timers** → **draw** → **energy refill** → **intents refresh**.

**endTurn** → `turn:end` → **hand resolution** (Ethereal → Vanish, Retain → stays,
rest → discard) → **player end-of-turn statuses** (`onTurnEnd` hooks, then `'turnEnd'`
decay) → playerTurnEnd timers → **enemy actions in slot order** (per enemy:
`turn:start`, its Guard wiped, its start-of-turn statuses, its move, `turn:end`) →
**enemy end-of-turn statuses** → every living enemy picks its next move → start of
your turn.

Nothing here is time-based. The engine finishes synchronously; you animate the
returned `Event[]` at whatever pace you like.

### Damage pipeline — the order, and it is fixed

```
1  base
2  attacker Strength      + stacks        (additive, attack-kind only)
3  attacker Weak          x 0.75 floored
4  defender Vulnerable    x 1.50 floored
5  hooks   modifyDamageDealt (attacker side) then modifyDamageTaken (defender side)
           relics, powers, statuses, board objects. Faint clamps to 1 here.
6  clamp to >= 0, floored
7  Guard absorption (skipped by `pierce` / `ignoreBlock`)
8  Courage loss
9  onDamaged, then onAttacked (attacks only), then onDealtDamage
10 death check
```

Steps 2-4 are hard-coded in `damage.js` rather than being status hooks, precisely so
their relative order can never drift. Guard maths mirrors it: `+Dexterity`, then
`x0.75 floored` for Frail, then `modifyBlockGain` hooks.

`computeDamage()` is pure and is what the intent number and the card preview use, so
the number on screen is provably the number you get.

### Status ids — the 13 universal ones

| id | name | kind | decay | effect |
|---|---|---|---|---|
| `strength`   | Strength   | buff   | never   | +n damage per attack hit |
| `dexterity`  | Dexterity  | buff   | never   | +n Guard from Tricks |
| `focus`      | Focus      | buff   | never   | +n to `focusable` Companion resource gains |
| `regen`      | Regen      | buff   | turnEnd | heal n at end of your turn, then lose 1 |
| `bristle`    | Bristle    | buff   | never   | Thorns: n damage back to the attacker |
| `faint`      | Faint      | buff   | turnEnd | Intangible: all damage taken clamps to 1 |
| `charm`      | Charm      | buff   | never   | Artifact: eats the next n debuffs |
| `weak`       | Weak       | debuff | turnEnd | deal 25% less attack damage |
| `vulnerable` | Vulnerable | debuff | turnEnd | take 50% more attack damage |
| `frail`      | Frail      | debuff | turnEnd | gain 25% less Guard |
| `dread`      | Dread      | debuff | never   | Poison: lose n Courage at turn start, then lose 1 |
| `confusion`  | Confusion  | debuff | never   | drawn Tricks cost a random 0-3 |
| `entangle`   | Entangle   | debuff | turnEnd | cannot play Attacks |

`decay: 'turnEnd'` means the stack drops at the end of **its owner's** turn — a
Vulnerable you put on an enemy survives that enemy's whole turn, exactly like StS.

Companion conditions are NOT here. Register them with `registerStatus(def)` /
`registerStatuses(list)` from `combat/statuses.js` (or `data/statuses.js`). Same
shape, same hook names, no engine change needed. The companion-cards agent's
`data/companions/keywords.js` is merged by `await loadCompanionKeywords()` in
`data/keywords.js` — tested and working.

`engine.statusList(actor)` and `state.player.statuses` give
`{ id, stacks, name, kind, icon, desc, decay, showStacks }` — `desc` already has
`{n}` substituted, so the status-row tooltip needs no second lookup.

### `ctx` — what a card `effect(ctx)` receives

Exactly the schema.js set, all of it emitting events and respecting modifiers:

```
ctx.e  ctx.self  ctx.target  ctx.card  ctx.x
damage(target, amount, opts)      opts: { hits, pierce, ignoreBlock, kind }
damageAll(amount, opts)
loseHp(target, amount)            ignores Guard and all modifiers
block(actor, amount)              Dexterity/Frail applied for you
heal(actor, amount)
applyStatus(actor, id, stacks)    negative stacks strip
draw(n)
discard(n, opts)                  opts: { cards:[Card] } | { all:true } | random n
exhaust(card)                     defaults to the card being played
addCard(def, pile, opts)          opts: { count, upgraded, position, cost, meta, exhaust }
gainEnergy(n) / loseEnergy(n)
count(statusId, actor) / has(statusId, actor)
forEachEnemy(fn) / randomEnemy() / livingEnemies()
```

Extensions (also stable, use them freely):
`removeStatus, moveCard, setCost, modifyCost, meta, retainCard, exhaustSelf,
counter, addCounter, spendCounter, canSpend, defineCounter, schedule, adjustTimer,
addObject, updateObject, removeObject, objectsOfKind, summon, addPower, addHook,
hand, drawPile, discardPile, exhaustPile, limbo, stash, enemies, allies,
cardsPlayedThisTurn(), cardsPlayedThisCombat(), exhaustedThisCombat(),
damageTakenLastEnemyTurn(), untouched(), n(key), upgraded, rng, say(text, tone)`.

**Card effects must be synchronous.** An `async` effect still resolves, but only its
synchronous part can be previewed and `preview().partial` is set to `true`.

Enemy moves get a parallel `EnemyCtx`: `damage, damageMulti, block, applyStatus,
buff, debuff, heal, addCard, summon, count, has, history, lastMove, timesUsed,
usedInARow, rng, turn, target, say`.

### Companion mechanic categories the engine supports (all covered by tests)

- **Resource tracks** — `engine.defineCounter({ id, name, min, max, start, focusable,
  resetEachTurn, onChange })`, then `addCounter / spendCounter / setCounter / canSpend`.
  Clamps at min/max, emits `counter`, and Focus boosts `focusable` gains. This is
  Nine Lives, Glow, Height, Loose Bones, Globs, Loyalty, Compost, Plump, Web, Open Eyes.
- **Delayed / countdown triggers** — `engine.schedule({ turns, when, run, label, repeat })`
  and `engine.at(turnNumber, run)` for "at the start of your 3rd turn". `when` is
  `playerTurnStart | playerTurnEnd | enemyTurnEnd`. `adjustTimer(id, +/-n)` is Wisp's
  Hasten/Delay. **Timers that reach 0 on the same tick fire as one batch** and each
  `run` receives `batchSize` — that is Wisp's Convergence.
- **Cards creating cards, into any pile, at any position** — `ctx.addCard(def, pile,
  { position: 'top' | 'bottom' | 'random' | index })`.
- **Per-card metadata surviving shuffles** — `card.meta` (plain data), set via
  `ctx.meta(key, value)`. Survives every zone move and reshuffle. Taffy's Stretch,
  Enchantments, Bones' Slobbered.
- **Cost mutation** — `ctx.setCost/modifyCost(card, v, 'turn' | 'combat')`, plus
  `CardDef.dynamicCost(ctx)`. Turn-scoped changes expire at the start of your next turn.
- **Positional pile effects** — top/bottom of draw, `piles.shuffleDraw()`, and a
  capacity-limited **Stash** (Hush's Shadow Pocket, `piles.stashCap`, default 3) that
  is never auto-discarded and can be played from directly.
- **Summons in enemy-like slots** — `engine.summon(def, { side:'enemy'|'ally', slot })`.
  Ally summons live in `state.allies`; an ally with `flags.taunt` pulls enemy targeting.
- **Board objects** — `engine.addObject({ kind, slot, data, hooks })` for Pipkin's
  Patch, Brambleboo's Garden, Pudding's Plots. They can carry hooks like a relic.
- **Sub-zones** — park cards in `limbo` with `meta.zone = 'gloaming' | 'buried' | 'set'`
  so each Companion gets its own delayed-card zone without a new pile.

### Preview — please use it

`engine.preview(uid, targetId)` clones the whole engine (same RNG internal state, same
statuses, same piles, same hooks), plays the card on the clone and reports what
happened. It cannot drift from resolution because it *is* the resolution code path.
Verified side-effect free: no RNG advance, no state change, no events leak to listeners.

```js
{ ok, reason, partial, cost, energyAfter, energyDelta,
  damage,                       // total to the chosen target, or to all if AoE
  targets: [{ id, name, damage, hits, blocked, hpLoss,
              hpBefore, hpAfter, blockBefore, blockAfter, kills }],
  block, selfHpLoss, heal,
  statuses: [{ actorId, id, name, kind, stacks, remove }],
  counters: [{ id, name, delta, after }],
  draw, discard, exhaust, cardsAdded, summons,
  killsTarget, killsAny, killsAll, playerDies, endsCombat,
  events }                      // the simulated event stream — ghost animations
```

Pass `{ assumeAffordable: true }` as the third argument to preview a card the player
cannot currently pay for (for the card face). `previewIncoming(engine)` returns
`{ total, parts, block, unblocked, lethal }` for the incoming-damage readout.

### Card text rendering

`engine.cardSnap()` puts a `display` map on every card snapshot:
`display.d = { value, base, dir: 'up' | 'down' | 'same' }` where `value` is the
**live** number after Strength/Weak/Vulnerable (for `{d}`) or Dexterity/Frail (for
`{b}`). Tint `up` green and `down` red — that is StS2's live-recoloured card text.

`renderCardText(text, display, nums)` from `data/keywords.js` tokenises rules text
into `[{t:'text',v}] | [{t:'num',key,value,base,dir}] | [{t:'kw',id,name,color,known}]`.
`{d} {b} {n} {m0}...` are numbers, `[Keyword]` becomes a hoverable chip.
`plainCardText(...)` gives the flat string for deck view, search and aria labels.

### Keyword registry (`data/keywords.js`)

`getKeyword(id) -> { id, name, desc, color, category, companion?, status?, icon? }`.
Categories: `core, resource, buff, debuff, card, zone, intent, companion`.
**Every `color` is a `var(--token)` reference from `ui/tokens.css` — there are no hex
literals and there must never be.** Tokens used: `--text-hi, --pluck-300,
--spectre-300, --threat-300, --threat-200, --flame-200, --rarity-curse, --rarity-rare`.
No new tokens were needed.

`registerKeywords(list)` merges more in; `await loadCompanionKeywords()` pulls in
`data/companions/keywords.js` (both its keywords and its statuses) without creating a
hard import dependency.

### Booting combat before content exists

```js
import { makeDummyCombat } from '../combat/dummy.js';
const engine = makeDummyCombat(new RNG(seed));
engine.on('*', ev => queue.push(ev));
await engine.startCombat();
```

Ten-card starter (5 Scratch / 4 Curl Up / 1 Boo!) plus Flurry, Rattle the Room,
Second Wind and Brace for multi-hit / AoE / draw+Vanish / Power coverage, and two
enemies (Dust Bunny with a fixed 3-move cycle, Coatrack Crawler with an rng branch).

### What I need from other agents

- **ui-chrome** — the status row and keyword chips should read
  `state.*.statuses[].desc` and `getKeyword(id)` rather than hardcoding text. Icon
  glyph ids are the status ids (`strength`, `weak`, `dread`, ...) plus whatever
  companion statuses register.
- **combat-scene** — react to events, never poll. `intent` is emitted only on real
  change, so animate every one. Use `hpLoss` (not `amount`) for shake, and treat
  `block:break` as the shatter cue.
- **companion-cards** — keep effects synchronous, put signature conditions through
  `registerStatus`, resource tracks through `defineCounter`, delayed effects through
  `schedule`. Anything the engine cannot express, tell me rather than working around it.
- **enemies** — `EnemyDef.nextMove(ctx)` must be deterministic given
  `(ctx.rng, ctx.turn, ctx.history, board state)`. Add the optional display hints
  `applies: [{id, stacks, to}]` and `tell` to every move so the intent tooltip is
  complete, and `damageFn(ctx)` for growth enemies so the intent number stays honest.
- **foundation** — `game/src/data/statuses.js` is not in the CONTRACTS ownership
  table; I was assigned it and have created it. Please add it to the combat-engine row.

### Deviations from the design doc

The doc uses "Nerve" for energy in several Companion chapters while `schema.js TERMS`
says **Pluck**. I followed `schema.js`, which CONTRACTS makes the shared vocabulary —
someone should reconcile the prose. "Vanish" is the in-fiction word for Exhaust; both
ids are registered as keywords pointing at the same idea.

---

## 2026-08-19 — enemies agent

Shipped the full enemy rosters for three regions: **Foyer, Nursery, Sleeping Quarters**.
37 EnemyDefs, 137 moves, 54 authored Scuffle/Big Scare/boss formations, 0 validation errors.
Full per-enemy breakdown with numbers and patterns: **`docs/ENEMY-AUDIT.md`**.

Files owned and written: `game/src/data/enemies/**`, `game/src/data/bosses/**`,
`game/src/data/encounters.js`, `tests/enemies/**`.

### For the combat-engine agent — EnemyCtx surface I depend on

Documented in full at the top of `game/src/data/enemies/_lib.js`. The essentials:

- `c.self` actor needs `{hp, maxHp, block, alive, mem, counters, flags, damageTakenThisTurn}`.
  **`damageTakenThisTurn` resets at the START of each player turn and must still be readable
  during the enemy turn that follows** — a dozen enemies key their whole design off
  "was I hit last turn?".
- `c.history` — string[] of move ids this enemy has already resolved, oldest first.
- `c.cardsPlayedThisTurn` — `[{id, type}]`. Needed by The Unwelcome Guest, The Night Terror,
  The Butler's House Rules and the Bedframe Beast's Bed Positions.
- `c.field` — a per-combat shared scratch object (Darkness, Bed Positions).
- Helpers: `damage, loseHp, block, heal, applyStatus(a,id,n,data), removeStatus, count, has,
  addCard, summon(id,{hpMul|hp}), despawn, setCounter, counter, intentOf(actor), rng`.
- Optional hooks I call if present: `announceRule(rule)`, `clearRules()`,
  `removeWorstStatus(actor,{protectSignature})`.

**Enemy lifecycle hooks the engine should fire** (all optional per def, all already
exercised by `tests/enemies/index.html`, which is a working reference implementation):
`onSpawn, onDeath, onTurnStart, onPlayerTurnStart, onPlayerTurnEnd, onDamaged, onPlayerCard,
onAllyDeath, onBoardEvent(ev), onRuleBroken`.
`onBoardEvent` carries `{type:'block'|'heal'|'status', actor, source, amount, id, kind}` —
the Rocking Horse's Excitement and the Porcelain Twins' Joined both ride on it.

**`nextMove(c)` is pure.** Call it as often as you like to re-render.

**Dynamic intents.** Moves may carry `damageFn(c)`, `hitsFn(c)`, `blockFn(c)`, `intentFn(c)`
and `alternatives(c)`. When present the engine MUST prefer them over the static values and
re-render on board-state change. This is where the region designs actually live — Umbrella
Jab reading 12→7 as you strip a Brace, POP! reading 17→12 as you Jam it, Too Familiar
climbing 9→12→15 as you commit cards. `alternatives(c)` returns an array of intent
descriptors for The Night Terror's two-possibility display, collapsing to one once resolved.

**Statuses.** `ENEMY_STATUSES` (exported from `data/enemies/index.js`) is 12 drop-in
StatusDefs conforming to schema.js — `roused, frightened, discomposed, button-brass,
button-pillow, button-spring, covered, scurry, hidden, darkness, seam-pinch, smothered`.
Register with `registerStatuses(ENEMY_STATUSES)`. Two need engine support beyond hooks:
`hidden` (`untargetableBy: ['attack']`) and `covered` (damage redirect to the actor named in
its status data). `STATUS_TRICK_DEFS` carries the two enemy-generated cards, **Clutter** and
**Drowsy**, as CardDefs.

Three enemies expose a damage-pipeline method the engine should call if defined:
`governess.redirect(c, incoming)` (Stitched Together), `governess.modifyIncoming`,
`bedframeBeast.modifyIncoming(c, amount, takenThisTurn)` (Covered), and
`theWardrobe.isTargetable(c)` / `damageTakenMul(c)`.

Requests: a **`DEFEND_DEBUFF` intent** in schema.js (three moves gain Guard *and* debuff and
currently declare `DEBUFF` plus a `block` value), and a `c.self.indirectDamageThisTurn`
counter (the Bedframe Beast's Dragged Out counterplay keys off indirect damage only).

### For the combat-scene agent — silhouette / palette / shape keys to support

Every EnemyDef carries `silhouette` (rig key), `palette` (2–3 hex), `shape`
`{body:'tall-thin'|'squat'|'sprawling'|'floating', limbs:n, eyes:n}` and `scale`.
**24 distinct silhouette keys**, grouped by the rig they want:

*Foyer* — `dustball` (squat, 0 limbs, 2 eyes, 0.8) · `coatrack` (tall-thin, 6, 2, 1.15) ·
`suitcase` (squat, 2, 1, 0.95) · `service-bell` (squat, 2, 2, 0.7) · `rug-serpent`
(sprawling, 0, 2, 1.3) · `door` (tall-thin, 2, 1, 1.25) · `coat-rack-mass` (sprawling, 8, 3,
1.6) · `faceless-guest` (tall-thin, 2, **0 eyes**, 1.35) · `great-bell` (floating, 0, 2, 1.7)
· `butler` (tall-thin, 2, 2, 1.5).

*Nursery* — `button-doll` (squat, 4, 2, 0.75) · `jackbox` (squat, 1, 2, 0.95) ·
`toy-soldier` (tall-thin, 4, 2, 1.0) · `rocking-horse` (sprawling, 4, 2, 1.25) ·
`blanket-pile` (squat, 1, 3, 1.1) · `porcelain-doll` (tall-thin, 4, 2, 1.0) · `toy-chest`
(squat, 6, 4, 1.55) · `patchwork-giant` (sprawling, 4, 2, 1.8) · `porcelain-twin`
(tall-thin, 4, 2, 1.15 — two palettes, warm for Prim and cool for Proper) · `governess`
(tall-thin, 2, 2, 1.55) · `favorite-doll` (squat, 4, 2, 0.85).

*Sleeping Quarters* — `pillow` (floating, 0, 2, 0.8) · `slippers` (squat, 2, **4 eyes**, 0.7)
· `wardrobe-arm` (tall-thin, 2, 2, 1.2) · `blanket-crawl` (sprawling, 0, **5 eyes**, 1.2) ·
`snuffer` (squat, 2, 2, 0.8) · `under-bed-claws` (sprawling, 4, 2, 1.3) · `shadow-shape`
(tall-thin, 4, **0 eyes**, 1.5) · `blanket-hydra` (sprawling, 0, 6, 1.75) + `hydra-head`
(floating, 0, 2, 0.7 — three palettes) · `wardrobe` (tall-thin, 0, 2, 1.85) +
`wardrobe-door` (tall-thin, 0, 0, 0.9 — two instances) · `bedframe` (sprawling, 8, 6, 2.0).

Palettes are warm woods and brass in the Foyer, soft pinks and creams in the Nursery, cold
blue-greys in the Sleeping Quarters — read them off the defs rather than hardcoding.

**Visual states the renderer needs beyond the base rig:**
- **Counters under the HP bar** (I write these via `setCounter`): Dust, Momentum,
  Resonance, Flustered, Wound Up, Excitement, Layers, Scare, Contents, Patches, Loose
  Stuffing, Heads, Repair Patch. These are the telegraph — they must be legible at a glance.
- **Named state badges above the intent**: the Grand Coatcheck's active Garment (and a
  Snagged treatment), the Porcelain Doll / Twins' Pristine-Cracked-Shattered, the Wardrobe
  Guest's Hidden/Exposed, the Bedframe Beast's Standing/Covered/Underneath, the Governess's
  active Repair Patch, the Butler's Discomposed.
- **A House Rule card** rendered beside the Butler's and Door Greeter's intent — the doc
  describes "a large handwritten looking rule". Rules carry `{name, text}` ready to draw.
- **Two-possibility intents** for The Night Terror: `alternatives(c)` returns both options
  with a `label` naming the trigger ("If you open with an Attack"). Both must be on screen
  simultaneously, then collapse to the chosen one the moment the first card is played.
- **Three abstract Bed Positions** (left/center/right) in the Bedframe Beast's phase two,
  with the current one marked *Rattling*. Not targetable actors — set dressing that must
  visibly move when the player's 3rd and 6th Tricks land.

---

## 2026-08-19 — card-feel agent: CardView, Hand, procedural card art

Owned and delivered: `src/ui/card.js`, `src/ui/card.css`, `src/ui/hand.js`,
`src/ui/hand.css`, `src/ui/cardart.js`, `tests/cards-feel/**`.
Nothing outside those paths was touched.

Showcase / iteration harness: `http://localhost:8777/tests/cards-feel/index.html`
Motion strips: `python tests/cards-feel/run.py [scene...]` -> `shots/cf-*.png`
(`--list` for scene names: idle gallery hover drag threshold play draw discard
exhaust unplayable upgrade keyboard perf reduce).

### CardView — `src/ui/card.js`

```js
import { CardView, CARD_SS } from './ui/card.js';

const v = new CardView(def, {
  uid, upgraded, cost,        // cost overrides def.cost (dynamic costs)
  playable, largeText, reduceMotion, clock,
});
parent.appendChild(v.el);
```

| member | contract |
|---|---|
| `v.el` | the root `.mm-card`. Positioned only by `setTransform`. `pointer-events:none` — do not re-enable, the Hand hit-tests itself. |
| `v.setState(patch)` | merge of `{upgraded, cost, playable, selected, hover, dragging, ghost, disabled, largeText}`. Re-renders only what changed. |
| `v.setPreviewNumbers({d:12, wasD:9})` | live recolour: green when the value went up, red when it went down. Any placeholder key works (`d`,`b`,`n`,`m0`…), each with an optional `wasX`. `null` restores printed values. **STS2-REFERENCE §2.** |
| `v.setTransform({x,y,rot,scale,z})` | `(x,y)` is the card's **bottom-centre** in the parent's px space; `scale` 1 = 224x312 on screen; `rot` in degrees. |
| `v.transform` | read-only current values. |
| `v.flash(strength,dur)` / `v.shake(mag,dur)` | promise-returning; shake composes on top of `setTransform`. |
| `v.dissolve(dur)` | burns bottom-to-top into rising embers (exhaust). |
| `v.materialize(dur)` | fade + swell in (draw). |
| `v.glow(color, amt)` / `v.pulse(color, dur)` | persistent ring / one-shot ring pulse. `glow(null)` off. |
| `v.destroy()` | removes the element and its art subscription. |
| `CardView.registerKeywords({ghoststep:'Ghoststep', ...})` | display names for `[Keyword]` chips. **combat-engine: please call this from `data/keywords.js` at boot.** |

Text placeholders rendered from `def.text`: `{d} {b} {n} {m0}…` becomes
`<b class="mm-card__num" data-key="…">`, `[Keyword]` becomes
`<span class="mm-card__kw" data-kw="kebab-id">`, `*text*` becomes `<em>`,
`\n` becomes a new line. Keyword chips carry `data-kw`, so **ui-chrome's Tooltip
can delegate off `.mm-card__kw[data-kw]`** without any change here.

Anatomy (STS2-REFERENCE §3): cost gem top-left, name banner, art in the top 55%,
type line, rules text with bold numbers and keyword chips.
Rarity lives in the **frame material** — basic matte pewter / common brushed steel
+ rivets / uncommon cyan inlay + set gem + edge glow / rare gold filigree + corner
flourishes + slow shimmer. Type has a **silhouette cue as well as colour**
(colourblind-safe): attack = sharp frame + blade crest + flank fins,
skill = heavily rounded frame + dome crest, power = crown crest + diamond side pips,
plus a distinct type glyph. Upgraded shows a green `+` and green numbers.

Crispness: the card is *built* at `CARD_SS` (1.4x) and only ever transform-scaled
**down**, so it never upscales past its raster — crisp from 1.0x through 1.35x —
and because sizes only change via transform, text can never reflow mid-animation.

### Hand — `src/ui/hand.js`

```js
import { Hand, TUNE } from './ui/hand.js';

const hand = new Hand(ctx /* {bus, clock, Save} */, {
  root: someAbsolutelyPositionedContainer,   // hand fills it (inset:0)
  onPlay:    ({uid, cardUid, card, targetId, view}) => {},   // return false to refuse
  onPreview: ({card, uid, targetId}) => ({ d: 12, wasD: 9 }),  // or null
  getTargets: () => [{ id: 'enemy0', el: enemyEl }],
});
```

| call | does |
|---|---|
| `hand.setCards(cards)` | replace the hand; existing uids keep their view and re-fan. |
| `hand.draw(cards)` | riffle in from the draw pile, 55 ms stagger, alternating flick. |
| `hand.discardAll()` / `hand.discard(uids)` | tumble to the discard pile. Promise. |
| `hand.exhaust(uid)` | rise + ember dissolve. Promise. |
| `hand.setPlayable(fn)` | `fn(card, energy) -> bool`. Default: `cost <= energy`, `-2` never. |
| `hand.setEnergy(n)` | re-evaluates playability and re-fans. |
| `hand.lock()` / `hand.unlock()` | kill input (also cancels aim + hover). |
| `hand.setPiles({draw:{x,y}, discard:{x,y}})` | **combat-scene must call this** with real pile positions in the hand's coordinate space. |
| `hand.playCard(uid, targetId)` | programmatic play (used by the keyboard path). |
| `hand.cards()` / `hand.viewOf(uid)` / `hand.count` | read-only accessors. |
| `hand.destroy()` | removes every listener, observer, view. |

`cards` may be raw CardDefs or runtime objects `{uid, def, upgraded, cost}`.

**Keyboard (full parity with the mouse):** `1`–`9` select a card (same number
again = confirm), `←`/`→` move the selection (or cycle targets while aiming),
`↑`/`Enter`/`Space` confirm — a targeted card enters aim mode first — `Tab`
(`Shift+Tab`) cycles targets, `↓`/`Esc` cancels.

**Bus events** (all payloads carry `uid`, most also `cardId`):
`card:hover`, `card:unhover`, `card:pickup`, `card:drop`,
`card:target {uid, targetId}` — *extra, not in the original brief: fired whenever
the arrow snaps to (or leaves) a target, so combat-scene can highlight the enemy*,
`card:play {cardUid, cardId, targetId}`, `card:cancel`.
The Hand never decides rules; `onPlay` is called synchronously at commit so the
engine resolves on the same beat the card lands at the play position.

### Tuned timings (all in `Hand.TUNE`, seconds)

| what | value | note |
|---|---|---|
| hover in | **105 ms** easeOutCubic | measured: 95% of the lift at **65 ms**, settled by ~100 ms. STS2 §1 asks for <120 ms. |
| hover out | **90 ms** | |
| hover lift / scale / neighbour nudge | 46 px / 1.19x / 30 px with 1 -> 0.42 -> 0.16 falloff | |
| re-fan | **300 ms** easeOutCubic (+10 ms/card stagger when asked) | retargetable mid-flight, so it never snaps |
| draw | 340 ms, 55 ms stagger, easeOutBack, ±18° flick | |
| discard | 400 ms, 35 ms stagger, tumble 220–520° | |
| exhaust | 620 ms rise 96 px + ember dissolve | |
| play | fly **260 ms** -> hold **170 ms** (flash) -> arc to discard **440 ms** | three beats: strike, hold, throw |
| drag follow | 75 ms retargeted per pointermove -> natural lag; tilt ±14° toward motion | |
| arc fan | <=3.1°/card, capped ±15°; step `min(184 px, spread/(n-1))`; dip `min(62, 6+5.4n)` | anchored so the *lowest* card sits on the bottom pad — the fan rises as it widens instead of falling off screen |

Handles 1–12 cards. **61 fps with 12 cards mid-drag** (measured, `run.py perf`).

### Notable implementation decisions

- **Hit-testing is manual.** Cards are `pointer-events:none`; one `.mm-hand__hit`
  band takes the pointer and the Hand tests against the *base* fan geometry
  (plus the hovered card's current body). A card lifting out from under the
  cursor therefore cannot oscillate. Don't re-enable pointer events on cards.
- **Targeted drag**: below the threshold the card follows the cursor with lag and
  tilt; above it the card parks above the hand and the **curved arrow** takes over
  aiming, snapping to a target with a reticle + pulse tick. Non-targeted cards
  keep following the cursor and commit by crossing the threshold line.
- **All motion runs through `clock`** — one `clock.onFrame` tween solver for the
  fan, `clock.ramp`/`clock.wait` for one-shots. No `setTimeout` anywhere.
- `Save.settings.reduceMotion` collapses every duration to ~0 and skips arcs and
  embers; `largeText` bumps rules text. Both re-read on the `settings:changed` bus
  event, so ui-chrome's settings panel just needs to emit it.

### Procedural card art — `src/ui/cardart.js`

`cardArt(def, w, h, {upgraded, dpr})` returns a cached data URL, **deterministic
from `def.id`** (FNV-1a -> mulberry32). Nine layers: sky, moon, scene silhouette
(mansion / graves / vines / drapes / lanterns / web / books / hedge / drips / rain /
thorns / bed / nursery / passage), floor mist, subject, family accents, type
overlay (attack = claw rakes, skill = ward arcs, power = rays + runes,
curse = thorns, status = grime), particles, grade.

The **subject** is the real portrait from `game/assets/portraits/<companion>.png`,
blob-masked, colour-graded into the family palette, with seeded zoom/pan/mirror so
two cards from the same companion never look like the same picture. Call
`preloadArt()` once at boot (idempotent) and the art regenerates automatically;
until it resolves, cards render a fully procedural family motif (cat / bone /
pumpkin / candy drip / eye / flame / fang / claw / quill / swirl / stitch / cloud /
pawbone / feather / tomb / sprig / sick / thorn / moon). `onArtReady(fn)` exists but
CardView already subscribes for you.

### What I need from other agents

1. **ui-chrome — two new tokens.** Card numbers need a "this went up" green.
   tokens.css has red (`--threat-300`) but no green. Please add to `tokens.css`:
   `--good-300: #74e08a;` and `--good-500: #2f8f4d;`.
   `card.css` currently uses `var(--good-300, #74e08a)` so it will pick them up
   with zero further changes, and the local fallback then becomes dead.
2. **ui-chrome — keyword tooltips.** Delegate off `.mm-card__kw[data-kw]`
   (the id is the kebab-cased keyword). No hook needed on my side.
3. **combat-engine — keyword display names.** Call
   `CardView.registerKeywords(map)` from `data/keywords.js` at boot.
4. **combat-scene — the wiring:**
   `hand.setPiles(...)` with real pile positions; `getTargets()` returning
   `{id, el}` for each living enemy; `onPreview` returning
   `{d, wasD, b, wasB}` from `engine.preview(cardUid, targetId)`; listen for
   `card:target` to highlight the enemy and for `card:play` to run combat FX
   during the 170 ms hold beat.
5. Illustration pigments (moss, bone, candy, stone, rot...) live in a `PIGMENT`
   table in `cardart.js`, not in tokens.css. They are illustration paint, not UI
   colour — flagging the deviation from the "all colour from tokens" rule
   deliberately. Every UI colour in `card.css`/`hand.css` comes from tokens.

---

## 2026-08-19 — audio

Owner: audio agent. Files: `game/src/audio/**`, `game/assets/audio/**`,
plus `tests/audio/**` and `docs/AUDIO-MAP.md`.

`src/audio/audio.js` keeps the class name `Audio` and the `new Audio(ctx)`
signature main.js already uses. Nothing else in the repo needs to change.

```
await audio.unlock()                      idempotent; also auto-fires on the
                                          first pointerdown/keydown/touchstart
audio.play(id, {vol, rate, pan, delay})
audio.music(cue, {fade})                  2.5 s equal-power crossfade
audio.stopMusic({fade})
audio.tension(0..1)                       darkens the bed
audio.telegraph(0..1)                     short tension spike (big incoming hit)
audio.duck(amount, ms)                    amount 1 == -6 dB
audio.setVolume('master'|'music'|'sfx', v)  also persists to Save.settings
audio.stinger(id)                         musical accent + auto-duck
audio.level()                             { peak, rms } for meters
audio.ids / audio.cues / audio.aliases / audio.nowPlaying()
```

### SFX — 46 cues, all synthesised (there are no sfx files)

Ids are `family:name`. `family/name` and the short aliases in `sfx.js` also
resolve, so `audio.play('ui/confirm')` and `audio.play('crit')` both work.

**card (12)** — `card:hover` `card:pickUp` `card:drop` `card:play-attack`
`card:play-skill` `card:play-power` `card:draw` `card:shuffle` `card:discard`
`card:exhaust` `card:retain` `card:upgrade`

**combat (12)** — `combat:hit-light` `combat:hit-heavy` `combat:crit`
`combat:block-gain` `combat:block-break` `combat:heal`
`combat:status-apply-buff` `combat:status-apply-debuff` `combat:enemy-death`
`combat:player-hurt` `combat:turn-start` `combat:turn-end`

**ui (8)** — `ui:click` `ui:hover` `ui:back` `ui:confirm` `ui:deny`
`ui:open-panel` `ui:close-panel` `ui:tooltip`

**world (8)** — `world:door-open` `world:candle-light` `world:blueprint-unfold`
`world:rescue-chime` `world:treasure` `world:coin` `world:boss-roar`
`world:heartbeat`

**sting (6)**, for `audio.stinger()` — `sting:reward` `sting:rescue`
`sting:elite` `sting:boss` `sting:victory` `sting:defeat`

Every sfx cue is under 1.2 s (stingers up to 3 s), starts and ends at exactly
zero amplitude, varies by ±3% pitch and ±1.5 dB per play, is voice-limited to
12 concurrent (oldest-quietest stolen) and passes through a shared plate reverb
send, a compressor and a limiter that cannot emit a sample above 0.94.

### Music — 10 cues over the 10 licensed tracks

`title` track006 · `map` track003 · `combat` track004 · `combatAlt` track009 ·
`boss` track001 · `safe` track007 · `shop` track002 · `rescue` track005 ·
`victory` track008 · `defeat` track010

`audio.music('combat')` alternates combat/combatAlt so back-to-back Scuffles
never repeat. Cue assignment, per-cue trim and loop points were all measured by
`game/src/audio/analyze.py` — see `docs/AUDIO-MAP.md`.

### What other agents get for free

`audio.js` listens on the bus and needs no calls from anyone:
`card:hover` `card:pick` `card:drop` `card:play` (reads `payload.type`)
`card:upgrade` `card:retain` `draw` `discard` `exhaust` `shuffle`
`damage` (reads `amount`, `crit`, and whether the target is the player; also
feeds tension from `hp`/`maxHp` when present) `block` (`amount` / `broken`)
`heal` `status` (`kind`) `death` `turn:start` `turn:end` `intent`
`combat:start` `combat:win` `ui:click` `ui:hover` `ui:back` `ui:confirm`
`ui:deny` `ui:open` `ui:close` `tooltip:show` `map:choose` `map:hover` `gold`
`treasure` `relic` `rescue` `candle` `blueprint` `boss:intro`
`scene:entered` (picks the music bed) `settings:changed` (re-reads volumes).

Every handler is guarded: an event with a payload shape it does not recognise
is a no-op, never a throw.

### Requests for other owners

* `scenes/title.js` calls `audio.play('ui/hover')` and `'ui/confirm')`. Those
  now resolve, so nothing is broken — but the canonical ids are `ui:hover` and
  `ui:confirm`.
* `tools/devserver.py` does not answer HTTP Range requests. Media playback and
  looping work anyway (loop points are at 0 s for 9 of 10 cues, and the one
  that is not — `map`, 9.6 s — has long since fully buffered by the time it
  loops), but seeking into an unbuffered part of a track silently fails. Worth
  adding Range support at some point.

### Verify

```
python tests/audio/run.py          # 46 cues, 0 errors; writes shots/audio-*.png
python game/src/audio/analyze.py   # re-measures the soundtrack, rewrites AUDIO-MAP.md
```
Interactive soundboard: <http://localhost:8777/tests/audio/index.html>

---

## 2026-08-19 — companion-cards

Shipped the full card content layer: **445 CardDefs, 0 validation errors.**

### Files created (all within companion-cards ownership)
- `game/src/data/companions/_util.js` — the helper layer every card effect is written against.
- `game/src/data/companions/keywords.js` — 54 companion keywords + 25 statuses. **The engine must merge these**; `data/keywords.js` is combat-engine's.
- `game/src/data/companions/{marmalade,bones,pipkin,taffy,wink}.js` — 20 Commons / 35 Uncommons / 25 Rares each, plus Basics, exactly per the design docs.
- `game/src/data/cards.js` — registry: `allCards`, `cardById`, `poolFor`, `startingDeckFor`, `registerCompanion`, plus `companions`, `sharedPool`, `rollRewards`, `registryErrors`.
- `game/src/data/neutral.js` — 6 Status Tricks, 7 Curses, 8 shared colourless Tricks.
- `tests/cards/index.html` + `tests/cards/run.py` — schema validation, mechanical-distinctness check, balance bands, cost curve, damage-per-Pluck histogram, and a live smoke test that plays every card (base **and** upgraded) against a mock engine. `--audit` regenerates `docs/CARD-AUDIT.md`.

### Pool counts

| companion | deck | basic | common | uncommon | rare | special | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| marmalade | 10 | 3 | 20 | 35 | 25 | 0 | 83 |
| bones | 10 | 5 | 20 | 35 | 25 | 1 | 86 |
| pipkin | 10 | 6 | 20 | 35 | 25 | 0 | 86 |
| taffy | 10 | 4 | 20 | 35 | 25 | 0 | 84 |
| wink | 10 | 5 | 20 | 35 | 25 | 0 | 85 |

MULTIPLAYER-ONLY pools were skipped deliberately (single-player build).

### Decisions that deviate from, or resolve gaps in, the design docs
- **"Nerve" vs "Pluck".** Every companion doc says Nerve; `schema.js` `TERMS.energy` says Pluck and CONTRACTS says to use TERMS in all UI. Card text uses **Pluck**. Flagging for the lead — one of the two sources should change.
- **Vanish = Exhaust.** The docs' word is Vanish; `CardDef.exhaust` is the field. Cards set `exhaust: true` and print `[Vanish]`.
- **Haunt dissipation** was "gradually" in the doc. Concrete rule: the enemy loses Courage equal to its Haunt when it takes a damaging action, then loses **half its Haunt, rounded up**. 6 Haunt across three attacks = 10 damage. Permanent Haunting changes the decay to 1.
- **Starting Courage** was unspecified: Marmalade 68, Wink 66, Pipkin 72, Bones 74, Taffy 76. All start at 3 Pluck.
- Bones's Buried zone uses `Pile.STASH`; Taffy's Belly also uses STASH (distinguished by a card flag); Wink's Sets use `Pile.LIMBO`.

### Integration with combat-engine

The engine landed while this was being written, so the whole pool was re-pointed at the real
`ctxFor` surface and re-verified against it. `tests/cards/index.html` no longer uses a mock: it
builds a **real `CombatEngine`** per card via `makeDummySetup`, plays every card base and upgraded,
and then runs a three-turn full cycle per companion. **445 cards, 0 errors.**

What that migration changed on my side:
- Companion resources are engine **counters**, not statuses. Each companion's tracker calls
  `defineCounter` for its track: `lives` 0–9 start 9, `loose-bones` 0–6, `height` 0–3, `plump` 0–5,
  `globs` 0–6, `open-eyes` 0–8 start 3. `ctx.canSpend` therefore answers Life and Bone costs.
- `companions/keywords.js` now self-registers `COMPANION_STATUSES` through `data/statuses.js`.
  `data/keywords.js` already dynamic-imports it for `COMPANION_KEYWORDS`, so **combat-engine has
  nothing to wire up.**
- Scheduling goes through `ctx.schedule({turns, when, run})`; Taffy's Runny tick is a repeating
  `enemyTurnEnd` timer.
- Per-card state (Slobbered, Dug Up, Stretch, Gummy, Chewed, Buried counters, Favorite) uses
  `card.meta`, with numeric counters under a `#` prefix.
- Zones: Bones's Buried and Taffy's Belly both live in `Pile.STASH`, told apart by a card flag;
  Wink's Sets live in `Pile.LIMBO`.

**One bug worth knowing about:** `engine.state` is a full serialising snapshot getter. Reading
`engine.state.turn` in a helper that runs on every card effect caused a stack overflow inside
`statusList`/`costOf` under load. Nothing in `data/companions/**` touches `engine.state` any more —
worth a warning in the engine docstring for the other content agents.

### Still needed from combat-engine

Small, and all called as `c.foo?.(…)` through `_util.js`, so nothing breaks before they exist:

| Need | Used by |
|---|---|
| `ctx.chooseCard({pile, filter, count, prompt})` and `ctx.choose({options, count})` | ~70 cards that say "choose". Without them `_util.js` auto-picks deterministically, which is correct but not playable. **Biggest gap.** |
| `ctx.discard(n, {choose:true})` | "draw then discard one" cards currently fall through to random discard |
| `ctx.setVanish(card, bool)`, `ctx.returnToHand(card)`, `ctx.cancelIntent(enemy)`, `ctx.shuffleDraw()`, `ctx.modifyDraw(n)` | Overstretch, Boomerang Bone, Steal a Turn, Who Buried That?, Phase Out |
| Status hooks `onAttack`, `onAttackDealt`, `onIncomingHit`, `onLethal`, `onDebuffIncoming` | Haunt, Empowered, Play Dead, Not Dead Yet, Nope. — listed in `keywords.js` `ENGINE_HOOKS_REQUIRED` |
| An `enemyTurnEnd` decay bucket | Ghoststep expiry |
| The intent queue for Wink: `intentQueue`, `previewIntent`, `previewDepth`, `intentFamily`, `isAnchored`, `swapIntents`, `postponeIntent`, `deleteIntent`, `forkFuture`, `forceIntentFamily`, and an `intent` event carrying `{enemy, family, changed}` | Wink's Preview / Read / reorder pool. Wink keeps its own shadow bookkeeping meanwhile, so his cards resolve without crashing but do not yet move real Intents. Needs a joint pass with the enemies agent. |

`installTrackers(engine, slug)` from `_util.js` should be called at combat start. Card effects
self-install it defensively, so it only matters for a turn where the player plays nothing.

---

## 2026-08-19 — atmosphere

Backdrop, candlelight, particles, post-processing and transitions. Everything is
procedural — there is no environment art in the project — driven by a region
palette table, so all 17 regions come out of one system.

Measured **61 fps at 1600x900** (`tools/shot.py`, dpr 1) in every region.

### Files

| File | What it is |
|---|---|
| `fx/atmosphere.js`          | `Atmosphere` — the public API + the 17-region palette table (`REGIONS`, `REGION_ALIAS`) |
| `fx/backdrop.js`            | `Backdrop` — wall / side walls / floor / ceiling / props / shafts / near frame |
| `fx/lights.js`              | `LightRig`, `AtmoLight`, `Flicker` — candlelight + spectral counter-light |
| `fx/particles.js`           | `ParticleField` — one GPU draw call, 8 types, zero CPU work per frame |
| `fx/transition.js`          | the 5 authored transitions |
| `fx/showcase.js`            | `mountShowcase(ctx)` — judging harness, not part of the shipped flow |
| `fx/shaders/common.js`      | shared GLSL: hashes, value noise, fbm, ridged fbm, SDFs, split-tone |
| `fx/shaders/backdrop.js`    | wall (5 architecture modes) / floor / props / shafts / frame GLSL |
| `fx/shaders/particles.js`   | particle vertex + fragment GLSL |
| `fx/shaders/grade.js`       | `GradeShaderDef` — the final colour grade |
| `core/renderer.js`          | `Stage` (co-owned with the lead) |
| `scenes/atmostest.js`       | test bench scene — **needs registering in main.js** |

### Public API

```js
// ---- ctx.atmosphere -------------------------------------------------------
atmosphere.setMood(region, { instant })   // swap region look; ~0.7 s cross-fade
atmosphere.impact(pos, opts)              // pos: THREE.Vector3 (world) OR {x,y} in CSS px
                                          // opts: { strength 0..2, color, shake, burst }
                                          // -> particle burst + a real light flare at the
                                          //    point + screen ripple + shake + micro-flash
atmosphere.dread(v, dur)                  // 0..1 desaturate + cool + crush the edges
atmosphere.pulse(color, amount, dur)      // soft coloured wash (gated by settings.flashes)
atmosphere.light(spec)                    // -> AtmoLight; spec:
                                          //   { kind:'warm'|'cold', pos, color,
                                          //     intensity, radius, flicker }
atmosphere.setIntensity(0..1)             // dim the backdrop under UI-heavy screens
atmosphere.rig                            // LightRig (rig.lights, rig.keyDir, rig.keyColor)
atmosphere.mood                           // current region key
atmosphere.backdrop / .particles          // escape hatches if you really need them

// ---- ctx.stage (existing API kept, plus additions) ------------------------
stage.shake(mag = 0.12, decay = 9)        // respects Save.settings.screenShake
stage.flash(color, amount, dur)           // respects Save.settings.flashes
stage.pulse(color, amount, dur)           // gentler than flash
stage.ripple(cx, cy, strength)            // screen-UV shockwave ring (0..1, y up)
stage.setParallax(x, y, z)                // additive camera offset (atmosphere drives it)
stage.setCameraBase(v) / stage.setQuality(q)
stage.scene / .camera / .lookAt / .grade / .bloom / .renderer

// ---- ctx.transition -------------------------------------------------------
await transition.cover(kind, opts)        // resolves when the screen is fully hidden
await transition.reveal()                 // reuses the kind it covered with
await transition.wipe(kind, async fn)     // cover -> fn() -> reveal
```

`AtmoLight`: `.setPos(x,y,z)`, `.base` (intensity before flicker), `.live` (after
flicker), `.color`, `.enabled`, `.dispose()`.

Scenes may add their own meshes to `stage.scene` and they will be lit for free —
every `AtmoLight` also drives a real `THREE.PointLight`, plus there is an ambient
and a hemisphere light keyed to the region.

### Transitions

| kind | in | out | use |
|---|---|---|---|
| `veil` | 300 ms | 320 ms | default; inky curtains close from both edges with a lit ragged seam |
| `doorway` | 340 ms + 90 ms slam | 360 ms | entering/leaving the mansion; shakes the camera on close |
| `blueprint` | 300 ms | 340 ms | map to room; the frame folds into drafting linework |
| `candle-out` | 340 + 140 ms | 380 ms | death; the world closes to a guttering point, then smoke |
| `dawn` | 360 ms | 400 ms | victory; warm light floods from above |

`Save.settings.reduceMotion` collapses every kind to a 110 ms cross-fade. The layer
is `display:none` when idle, so it can never eat a click.

### Region palettes (`REGIONS` in fx/atmosphere.js)

`arch` = wall architecture mode: 0 panel, 1 glass, 2 stone, 3 foliage, 4 industrial.
`floor` = 0 planks, 1 checker tile, 2 flagstone.

| key | region | arch | floor | key light | counter light | particles |
|---|---|---|---|---|---|---|
| `foyer` | Forgotten Foyer | panel | planks | `#ffb64a` sconces | `#2f8fa8` doorway | dust, wisp, ember |
| `nursery` | Forgotten Nursery | panel | planks | `#ffb87a` nightlight | `#9fd8ee` moon | dust, ash, wisp |
| `sleeping` | Sleeping Quarters | panel | planks | `#ffb24a` candle | `#7fa8f0` moon | dust, wisp, ash |
| `kitchens` | Kitchens & Cellars | industrial | flagstone | `#ff7a28` oven | `#7fc9a0` | ember, dust, plaster |
| `greenhouse` | Impossible Greenhouse | glass | flagstone | `#ffbb52` lantern | `#7fe8c0` glass moon | spore, dust, wisp |
| `graveyard` | Mansion Graveyard | stone | flagstone | `#ffb24a` candle | `#a8c8e8` moon | ash, dust, wisp |
| `study` | Grand Study & Library | panel | planks | `#ffbb52` desk lamp | `#5fa8c8` | dust, ember, wisp |
| `attic` | Moonlit Attic & Observatory | industrial | planks | `#ffb24a` candle | `#a8b8ff` starlight | dust, wisp, ash |
| `lampworks` | The Lampworks | industrial | flagstone | `#ff8a28` forge | `#4fc8ff` gas flame | ember, wisp, dust |
| `ballroom` | Ballroom & Velvet Suites | panel | checker | `#ffc95a` chandeliers | `#a86fd8` | dust, ember, wisp |
| `crypt` | Crypt & Ossuary | stone | flagstone | `#ffab3c` single candle | `#4fe0d0` | dust, wisp, ash |
| `hedge` | Withered Hedge Maze | foliage | flagstone | `#ffab3c` lantern | `#9fb8d8` moon | spore, ash, dust |
| `passages` | Secret Passages | stone | planks | `#ffb04a` lantern | `#7f5fd8` | dust, plaster, wisp |
| `bathhouse` | Bathhouse & Rain Wing | glass | checker | `#ffb85a` | `#5fd0e8` | **rain**, dust, wisp |
| `kennels` | Kennels & Animal Ward | panel | flagstone | `#ffb04a` hay lamp | `#5fa8c0` | dust, ash, ember |
| `pumpkin` | Moon Courtyard & Pumpkin Grounds | foliage | flagstone | `#ff8a28` pumpkins | `#a8c8e8` moon | dust, spore, ember |
| `heart` | Heart of the House | panel | checker | `#ffe0a0` warm flood | `#8fd9ec` | dust, wisp, ember |

`REGION_ALIAS` also accepts the design-doc names (`sleeping-quarters`, `hedge-maze`,
`secret-passages`, `pumpkin-grounds`, `library`, `observatory`, `conservatory`,
`cellars`, `ossuary`). An unknown name falls back to `foyer` rather than throwing.

Per-region knobs: `arch, floorPattern, ceil, sides, coolFill, grime, openGlow,
wallFog, gloss, rim, frameAmount, gain, bloom, bloomThreshold, warmTone, halation,
exposure, vignette, grain, fogDensity, shafts{}, props{}, particles{}, lights[]`.
Adding a region means adding one entry — nothing else changes.

Prop silhouette shapes (`props.shapes`): 0 armchair, 1 candelabra, 2 tall plant,
3 headstone, 4 chandelier (hangs), 5 cabinet, 6 column, 7 drape (hangs), 8 crates,
9 shrub.

### Grade

Fixed the shadow-tint bug. The old grade added a flat cool term to shadows, so pure
black rendered as **rgb(0, 6, 50)** navy — still visible in `shots/boot.png` and
`shots/atmos_baseline.png`. Every tint now goes through `mmSplitTone`, whose shadow
weight is multiplied by `smoothstep(0.0, 0.055, lum)`, so a black pixel stays black.
Corners now measure **rgb(0,0,0) to (3,3,3)** (`shots/a15_crypt.png`).

Also added: 8-tap golden-angle **halation** on highlights, modulated by a procedural
**lens-dirt** field; **film grain** stepped at 24 fps so it reads as film rather than
digital noise; an aspect-aware **edge vignette**; the **dread** term (desaturate +
cool + edge crush); an **impact ripple**; and the **pulse** wash. Bloom defaults to
`strength 0.72 / threshold 0.78` — flames and spectral glow cross it, ordinary
surfaces do not, and UI can never bloom because it is DOM on a separate layer.

### Performance notes

- One draw call for all ambient particles (1500 ambient + 256 reserved for impact
  bursts). Motion is entirely in the vertex shader; the CPU writes one uniform.
- Props and light shafts are instanced (`InstancedBufferGeometry`), one draw each.
- The wall relief normal uses 3 height samples (forward differences), not 5, and the
  height field uses a single noise octave because it runs 3x per pixel.
- No per-frame allocation: every vector/colour is preallocated and reused.
- `Save.settings.reduceMotion` kills camera parallax, quarters flicker depth and prop
  sway and shrinks particles; `.flashes` gates `flash`/`pulse`; `.screenShake` scales
  `shake`.

### Gotcha worth knowing

`THREE.UniformsUtils.clone()` only does `array.slice()` on uniform arrays, so cloned
materials **share the Vector4/Color objects inside them**. This silently broke the
back wall's lighting for a while. `fx/backdrop.js` exports the pattern as
`freshLightSlots()` — use it if you clone a material that has array uniforms.

### Asks

- **Register `scenes/atmostest.js` in `src/main.js`** — see the header of that file.
  Reachable at `#scene=atmostest` (`&region=crypt` to start elsewhere).
- No `tokens.css` changes were needed. Region colour lives in the `REGIONS` table;
  neutrals and light colours are read once from tokens at init.

---

## 2026-08-20 — combat-engine (round 2)

Closes the gaps the content agents found. **445 assertions, 0 failures**
(`python tests/combat/run.py`). Everything below is additive — nothing shipped in
the 2026-08-19 section changed shape, except the terminology fix.

### Terminology

`TERMS.energy` is **Nerve** (was Pluck), `TERMS.gold` is **Lost Things**,
`TERMS.shop` is **Mr. Moth's**. Fixed everywhere in `src/combat/**`,
`data/keywords.js` and the test suite. Keyword ids changed:
`pluck` → **`nerve`**, `trinkets` → **`lost-things`**. Player-facing refusal text
now reads "Not enough Nerve (needs 2)."

### 1. Player choice — `ctx.chooseCard` / `ctx.choose` / `ctx.chooseEnemy`

New module `combat/choice.js`. Choice is a first-class engine concept: the engine
RAISES a request and AWAITS a resolution.

```js
// renderer, once:
engine.setChoiceResolver(async (req) => {          // req.pool, req.count, req.prompt
  return await picker.open(req);                    // -> array of indices into req.pool
});

// card content:
const [card] = await c.chooseCard({ pile: 'discard', count: 1, filter, optional, prompt });
const [i]    = await c.choose({ options: ['Gain Guard', 'Deal damage'], count: 1 });
const [en]   = await c.chooseEnemy({ count: 1 });
await c.discard(2, { choose: true });               // returns the discarded cards
```

`chooseCard` and `chooseEnemy` resolve to **objects**; `choose` resolves to
**indices**. `_util.js`'s `pickCards` / `chooseOne` already speak this shape.

Events:

```
choice          { requestId, kind:'card'|'option'|'enemy', prompt, count, optional,
                  pool:[{index,label,cardUid?,card?,id?,hp?}], cardUid, cardId, pile }
choice:resolved { requestId, kind, picked:[index], chosen:[…], cardUid }
```

`pool[i].card` is a full `cardSnap`, so the picker UI needs no engine access.
`engine.awaitingChoice` is true while a human is being asked.

**Determinism.** A seed alone no longer reproduces a fight a human played — a seed
plus the choice log does. Every resolution is appended to `engine.choiceLog` as
`{ seq, kind, cardId, picked }`; `engine.setChoiceScript(log)` replays it exactly
(tested). With no resolver and no script the **auto-resolver** runs: lowest
indices first, deterministic, seed-independent. That is what tests, the balance
simulator and previews get, so headless runs stay reproducible from the seed alone.

**Preview of a card with an unmade choice.** The rule, and the UI must say it out loud:

| call | behaviour |
|---|---|
| `engine.preview(uid, tid)` | synchronous, contract-shaped. Everything that resolved **before** the first choice. Sets `partial:true`, `pendingChoices>=1`, `uncertain:true`. |
| `await engine.previewAsync(uid, tid)` | the **whole** effect, resolving choices with the auto-picker. `partial:false`, `uncertain:true`. |

`uncertain:true` means *one possible outcome, not a promise*. Render the number
with a trailing `?`. Showing a hard number for an outcome the player has not
chosen yet is worse than showing none. Use `previewAsync` for hover; `preview()`
stays synchronous because CONTRACTS says so.

### 2. Other ctx helpers now real

```
setVanish(card, on)     mark a card to Vanish next time it is played
returnToHand(card)      pull a card back to hand (respects the hand cap)
shuffleDraw()           shuffle the draw pile in place
modifyDraw(n)           change how many you draw at the start of your NEXT turn
cardsIn(pile)           by zone name or the aliases drawPile/discardPile/exhaustPile/vanished
cancelIntent(enemy)     cancel what an enemy is about to do; the next plan entry steps up
discard(n, {choose:true, filter, optional, prompt})    async, returns the discarded cards
```

`moveCard(card, pile, { top:true })` / `{ bottom:true }` now work alongside
`{ position }`, which is what `_util.js` writes.

### 3. New status hooks + the `enemyTurnEnd` decay bucket

All five requested hooks fire, and every hook payload now also carries
`h.remove()`, `h.consume(n)`, `h.actor`, `h.block(a,n)`, `h.damage(t,n)` — so the
shipped `ENEMY_STATUSES` (`ctx.remove()`, `ctx.block(ctx.actor,4)`) work unmodified.

| hook | when | payload |
|---|---|---|
| `onAttack` | an **enemy** finished a damaging move — **once per move**, not per hit | attacker, defender, hpLoss |
| `onAttackDealt` | the **player** finished resolving an Attack card | card, target |
| `onIncomingHit` | per individual hit, **before** Guard is consulted | `h.prevent()`, `h.setAmount(n)` |
| `onLethal` | a hit is about to take the defender to 0 Courage | `h.prevent()` (survive at 1), `h.setHp(n)` |
| `onDebuffIncoming` | a debuff is about to land | `h.prevent()`, `h.setStacks(n)` |

`onIncomingHit` is the Ghoststep / Play Dead shape — the hit **does not happen**
rather than doing 0. A prevented hit still emits `damage` with `prevented:true`,
`amount:0`, so the renderer can play a dodge instead of an impact.

`onLethal` fires **before** Guard has been spent and before hp changes, so
preventing it is clean. `onDebuffIncoming` runs before Charm, so Nope.-style
effects get first refusal and Charm is not wasted.

**Decay buckets** are now `'turnStart' | 'turnEnd' | 'enemyTurnEnd' | 'never' | 'combat'`.
`enemyTurnEnd` ticks after every enemy has acted and after their own end-of-turn
statuses — that is where Ghoststep expires, used or not. A StatusDef may also set
`decayAll: true` to lose every stack at once instead of one.

Two more declarative StatusDef fields the engine honours without hooks:
`untargetableBy: ['attack']` (Hidden — `canPlay` refuses, area damage still lands)
and `drawDelta: -1` per stack (Smothered — floored at 3 cards, and measured
**before** the start-of-turn decay so a turnStart-decaying status still bites).

### 4. `engine.state` re-entrancy — fixed

Reading `engine.state` from inside a card helper used to recurse
(`state → cardSnap → canPlay → costOf → dynamicCost → state`). Now:

- the snapshot getter is guarded; a re-entrant read returns the last good snapshot
  (or a cheap minimal one) instead of rebuilding,
- `costOf` is guarded against a `dynamicCost` that reads state,
- **cheap direct accessors** are available and are what card code should use:
  `engine.turn`, `engine.phase`, `engine.over`, `engine.energy`, `engine.energyMax`,
  `engine.handSize`, `engine.cardsPlayedThisTurn`, `engine.field`, `engine.stats`.

Rule of thumb for content: **never read `engine.state` from inside an effect.**
It exists for the renderer. Use the accessors or the live objects.

### 5. EnemyCtx — the full documented surface

Everything at the top of `data/enemies/_lib.js` is implemented:

```
read   self{id,uid,name,hp,maxHp,block,alive,mem,counters,damageTakenThisTurn}
       player  rng  history  turn  field  lastMove  mem  cardsPlayedThisTurn
       planPosition  forecast
board  enemies()  allies()  friends()  livingEnemies()  intentOf(a)
       intentFamily(a,pos)  timesUsed(id)  usedInARow(id,n)
act    damage(t,n,{hits}) | damage(n)      damageMulti(n,hits)
       block(n) | block(actor,n)           heal / loseHp (same overload)
       applyStatus(a,id,n)  removeStatus(a,id)  buff(id,n)  debuff(id,n)
       count(id,a)  has(id,a)
       counter(key)  setCounter(key,v)  addCounter(key,n,max,min)
       addCard(cardId|def, pile)          summon(enemyId|def, {hpMul,hp})
       despawn(actor)                     announceRule(rule)  clearRules(sourceId)
       say(text,tone)
```

`addCard` and `summon` take **ids**, resolved through registries:
`engine.registerCards(defs)` / `engine.registerEnemies(defs)`. Enemies in the
encounter self-register. `await loadContentRegistries(engine)` from
`data/keywords.js` registers companion keywords + statuses, `ENEMY_STATUSES`, and
`STATUS_TRICK_DEFS` (so `addCard('clutter')` resolves). Ids match on the full id
or the last path segment.

`c.field` is per-combat shared scratch, mirrored into `state.field`.
`c.mem` is per-enemy-instance scratch. `c.counters` are the displayed per-enemy
counters — they reach the renderer as `state.enemies[i].counters` and emit
`counter` events with `ownerId` set to the enemy.

**`damageTakenThisTurn` now resets at the START of the player turn only**, for
every actor, and is therefore still readable during the enemy turn that follows.
The previous value is kept as `damageTakenLastTurn`. This was the "was I hit last
turn?" bug.

### 6. EnemyDef lifecycle hooks

Ten, all firing, all receiving a full EnemyCtx:

```
onCombatStart  onSpawn  onPlayerTurnStart  onTurnStart(its own)  onTurnEnd(its own)
onPlayerTurnEnd  onDamaged  onDealtDamage  onAllyDeath  onDeath
```

Plus `onPlayerCard` (alias `onCardPlayed`, `c.card = {id,type,uid}`),
`onBoardEvent` (broadcast with `engine.boardEvent(name, data)`, ctx gets
`c.event` / `c.data`) and `onRuleBroken`.

`onAllyDeath` fires on every surviving enemy and ally, never on the corpse.

**House Rules** (Door Greeter → The Butler) are engine-level:
`c.announceRule(rule)` / `c.clearRules(sourceId)`; `engine.rules`, mirrored to
`state.rules` for the renderer; evaluated at `when:'cardPlayed'` after every card
and at `when:'turnEnd'`. `RuleCtx` is
`{ cardsPlayedThisTurn, card, prevCard, playerBlock, damageDealtThisTurn, turn, e }`.
`once:true` limits it to one Reprimand per player turn. A rule **never forbids**
an action — the card always resolves and then the consequence lands. Rules are
cleared automatically when their source dies. New events: `rule`, `rule:broken`.

### 7. Dynamic intents win — high priority, done

`buildIntent` now prefers `damageFn(c)`, `hitsFn(c)`, `blockFn(c)`, `intentFn(c)`,
`appliesFn(c)` and `tellFn(c)` over the static `damage`/`hits`/`block`/`intent`/
`applies`/`tell`, and re-runs them on every refresh. A growth enemy's intent
number changes the moment its counter does, and it still goes through the full
damage pipeline afterwards (tested: `2 + dust*3` → 8, then Vulnerable → 12).

`intent.baseDamage` carries the pre-pipeline number if you want to show both.

### 8. The intent queue (Wink + enemies, one concept)

Every enemy has a **plan**: position 0 is what resolves next, 1..3 are what it
intends after that (`MAX_PLAN = 4`).

```js
engine.intentQueue(enemy)          // the REVEALED slice, position 0 first
engine.previewIntent(enemy, n)     // reveal n more; returns how many were new
engine.previewDepth(enemy)         // 0..3
engine.previewedFamilies(enemy)    // ['Defense','Scheme'] for revealed positions 1+
engine.intentFamilyOf(enemy, pos)  // 'Attack'|'Defense'|'Scheme'|'Special'
engine.isAnchored(enemy, pos)
engine.swapIntents(enemy, a, b)    // false if either end is Anchored
engine.postponeIntent(enemy)       // current action goes to the back
engine.deleteIntent(enemy)         // current action is gone; the next steps up
engine.cancelIntent(enemy)         // alias of deleteIntent, named for cards
```

All of these are on `ctx` too, with the names `wink.js` already calls.

Queue entry shape:
`{ position, moveId, name, type, family, familyLabel, damage, hits, block, anchored, revealed, tooltip }`.
`intentQueue` returns **only revealed positions** — draw `MAX_PLAN - queue.length`
hidden slots if you want them. It is also on `state.enemies[i].queue`, alongside
`state.enemies[i].previewDepth`.

New event `intent:queue { enemyId, action:'preview'|'swap'|'postpone'|'delete', depth, queue }`,
and the ordinary `intent` event now carries `queue` as well.

**Why this is deterministic.** Move selection for plan position *k* uses
`rng.fork('intent:<enemyId>:<absoluteIndex>')`, never the main RNG stream. So:
looking ahead costs nothing, a previewed action is genuinely the action you get,
and **whether or not the player previews, the fight plays out identically**
(there is a test that plays the same seed with and without Preview and compares
full move histories). Unlocked future positions are re-derived on every refresh,
so a reactive enemy that changes its mind re-renders its revealed icon — which is
what the design doc asks for. Positions the player has edited are locked until
consumed. `move.anchored: true` marks a boss mechanic Wink may not move.

### Test coverage added

Determinism under choice scripts; auto-resolver determinism; choice event payload;
`discard({choose:true})`; sync-vs-async preview of a choice card; the five new
hooks; `enemyTurnEnd` decay; state re-entrancy; the whole EnemyCtx surface;
`damageTakenThisTurn` persistence; `damageFn/hitsFn/intentFn` preference and live
re-render; the full intent queue including Anchored refusal and preview-neutrality;
the ten lifecycle hooks; House Rules; `ENEMY_STATUSES` registration; Hidden
targeting; Smothered draw floor. **445 assertions, 0 failures.**

### Still missing / needs another agent

- **`covered` (Blanket Blob)** ships with no hooks — "the first N damage hits its
  Blanket Blob instead" needs a redirect target the status cannot know. Either the
  Blanket Blob's own `onDamaged` should move the damage, or tell me and I will add
  a generic `redirectDamageTo` field. Registered and displaying in the meantime.
- **`button-spring`** is resolved by the attacking enemy's own move via
  `splitAttack()`, as the enemies agent designed. Nothing needed from me.
- **combat-scene**: you must call `engine.setChoiceResolver(...)` or ~70 Tricks
  will silently auto-pick. Handle `choice` / `choice:resolved` / `intent:queue` /
  `rule` / `rule:broken`, and use `previewAsync` for hover so choice cards preview.
- **companion-cards**: `_util.js`'s `trackerCtx` fallback can now be deleted —
  `engine.ctxFor(null, null, 0)` gives the full ctx including the choice helpers.
  Also please read `engine.turn` rather than `engine.state.turn` inside effects.

---

## 2026-08-20 — companion-cards, round 2 (critic response)

**445 cards, 0 errors, 0 warnings**, verified against the real `CombatEngine`.

### The gap: rarity ladders

The critic was right, and my distinctness check was the reason I missed it — it keyed on
`rarity|type|cost|target|text`, so "the same card one rarity up" passed by construction.

Rewrote it as an **effect-shape** check (`shapeOf` in `tests/cards/index.html`): strip every
number, placeholder, keyword bracket and punctuation mark, then group within a companion.
Rarity and cost are deliberately excluded from the key — "same card, different price" is exactly
what it now hunts. It found **the same nine groups the critic did**, which is a decent sign the
check is honest, and it will keep finding them.

All nine re-authored so the card changes in kind, not in size:

| was | now |
|---|---|
| `marmalade/fluff-up` — bigger Curl Up | Guard, plus 1 [Ghoststep] **if you have none** — the common that teaches the mechanic |
| `marmalade/haunting-hiss` — bigger Boo! | 3 Haunt, or **7 if the target is already Haunted** — a follow-up, not an opener |
| `marmalade/moonlit-claw` — 3rd cost-discount big hit | 16 damage, **you cannot gain Guard this turn** (new `no-guard` status, `modifyBlockGain → 0`) |
| `marmalade/final-pounce` — Spectral Scratch at rare | 18 damage; while Untouched **refunds 1 Pluck and returns to hand**, once a turn |
| `marmalade/across-the-veil` — Moonlit Claw at rare | **Spend all Ghoststep**, 11 piercing damage per stack — defence converted to offence |
| `marmalade/spectral-stampede` — Ricochet Cat at rare | 5 damage per **Life spent this combat** (cap 8) — the Nine Lives archetype's finisher |
| `bones/sit-stay` — bigger Sit Pretty | 7 Guard and **[Retain]** — held defence |
| `bones/shake-it-loose` — byte-identical to Shake, Boy! | Shed 1, **next Trick costs 1 less** — a tempo enabler |
| `bones/fetch` — byte-identical to Go Get It! | **Shed 1, then** Fetch — the Rattle/Fetch bridge |
| `bones/smell-something` — Sniff Around +2 | Look at top 5 and **Bury one** — a tutor into the Buried zone |
| `pipkin/big-breath` — Puff Up +1 Guard | 1 Plump, **draw 1** |
| `pipkin/inflate` — Puff Up at uncommon | 2 Plump; **at maximum Plump gain 1 Pluck — and Heavy Feet with it** |
| `taffy/pinch-a-piece` — Pinch Off +2 Guard | Split 1, **3 Guard per Glob you have** (keeps them, unlike Little Recombine) |
| `taffy/pull-it-long` — byte-identical to Long Pull | Stretch, **then draw 1** — answers Stretch's hand congestion |
| `wink/web-patch` — Silk Screen at common | Guard plus **1 Web to every enemy** |
| `wink/tighten-the-silk` — Loose Thread at common | **3 Web, then Preview 1** — Web plus information, not Web conditional on it |

Marmalade's three 2-Pluck attacks now occupy separate structural roles rather than three prices:
Moonlit Claw is flat damage with a real drawback, Ambush from Nowhere is the cost-discount card
(doc-faithful), Across the Veil converts Ghoststep into piercing damage.

### Numbers

`leave-a-life-behind` 24 → **15** Guard (up 20). `claws-in-the-dark` 6 → **9** base.
`the-last-thing-they-see` 12 → **15**, and the execute now checks Courage **after** the hit
(threshold 15/20) so it scales with your damage buffs instead of being a dead 25 HP window.
`taffy/elastic-orbit` 13 → **15**. `wink/gotcha` 9 → **8**. `wink/spiders-paradox` 13 → **15**.
`neutral/big-swing` 14 → **16**.

Rather than silence the last false positive, cards may now declare `balance: { scalesWith: '…' }`;
the validator then skips the damage **floor** for them and still enforces the ceiling. Only
`claws-in-the-dark` uses it, and it says why.

### Engine round 2

Removed the `trackerCtx` fallback branch — `engine.ctxFor(null, null, 0)` is the whole thing now.
Confirmed nothing under `data/companions/**` reads `engine.state`. `ctx.chooseCard`, `choose`,
`chooseEnemy` and `discard(n,{choose:true})` matched the shapes `_util.js` was already written
against, so the ~70 "choose" cards now prompt the player instead of auto-picking, with no card
edits. The Wink intent-queue names matched too, and `intentFamilyOf` returns the capitalised
labels `wink.js` compares against — his Preview/Read/reorder pool is live rather than shadowed.

New statuses this round: `no-guard`, `next-trick-discount`, `next-attack-discount` (28 total).

---

## 2026-08-20 — enemies agent, round 2

Fixed a `hits²` bug in `hitPlayer` that made all 16 multi-hit enemy attacks deal up to 5.7×
their telegraphed damage, then closed every remaining intent/damage mismatch. Full writeup
with measurements: **`docs/ENEMY-AUDIT.md` → "Round 2 changes"**.

Verification:

    python tests/enemies/run.py      # 37 enemies, 0 errors
    python tests/enemies/audit.py 12 # 2368 scored enemy turns, 0 mismatches (real engine)

### Answering the open item: `covered` (Blanket Blob)

Now implemented and verified against the real engine — **`redirectDamageTo` is not needed**,
please don't add it on my account.

Worth flagging how it had to be done, because the obvious approach does not work: the enemy
ctx wrapper is `applyStatus: (a, id, n) => e.applyStatus(a, id, n, {sourceId})`, so a 4th
data argument from content is **dropped**. Cover therefore could not carry `{by, amount}` in
status data, and a `modifyDamageTaken` hook gets `{attacker, defender, self}` with no engine
handle, so it cannot reach across to the Blob either. Until this round Cover was silently
inert in the shipping game — my mock implemented the redirect itself, so the suite could
never have caught it.

It now works in two halves: the `covered` hook absorbs damage on the covered ally and books
the total on that actor, and Blanket Blob pays the tab against its own Courage on its next
hook (`settleCover`), re-arming the per-turn allowance on its own turn (`rearmCover`). Net
behaviour matches the doc. The only visible difference is that the Blob's share lands at the
turn boundary rather than instantly.

Proof: `tests/enemies/cover-probe.html` drives the real `CombatEngine` and asserts the
8/4 split, that the allowance is spent for the rest of the player turn, that it re-arms next
turn, and that the Blob's death clears Cover. **General lesson for other content agents: a
mock that implements a mechanic itself cannot prove that mechanic exists.**

### One thing I do need from the engine

**A point where a buff can be armed after the enemy phase and before intents refresh.**

Enemies act in board order, and intents for the next phase are chosen at step 7 of
`endTurn()`. Anything that changes an attacker's damage *during* the enemy phase therefore
lands on allies whose intent number is already on screen:

- a support enemy in a middle slot Rouses an ally that has not swung yet → the player takes
  more than the intent promised;
- Darkness expiring at the Snuffer's turn start strips +2 from an ally that swings later →
  the player takes less than promised.

I fixed the ones I could by **ordering support enemies last** (board order is turn order),
and that is now a standing rule for this content. But a summoner is always slot 0 and its
summons always sit behind it, so the House Bell and The Butler could not be fixed that way.
Both currently grant Guard where the design doc says Roused — a deliberate, documented
deviation purely for intent honesty.

The clean primitive would be either:
- an `onEnemyPhaseEnd` enemy hook firing after the action loop and before `chooseMove`, or
- an enemy-side `decay`/arming bucket at `enemyTurnEnd` (the engine already runs
  `_decayBucket(..., 'enemyTurnEnd')` for the player and allies, but not for enemies), or
- a `armAfterIntentRefresh: true` flag on `applyStatus` so a status is inert until the next
  intent refresh.

Any of the three lets me restore Roused on both enemies. Ping me and I will.

### Two engine behaviours worth knowing about (not bugs, but they bit me)

1. **`announceRule` replaces only by id.** Rules from the same source accumulate until
   `clearRules()`. The Butler was silently enforcing all four House Rules at once from
   turn four of phase one. He now clears before announcing. Anything else authoring rules
   should do the same.
2. **`endTurn()` finishes by calling `_beginPlayerTurn()`, which zeroes player Guard.**
   Any harness that measures damage as `blockBefore - blockAfter` across `endTurn` will
   count the player's entire unspent Guard as damage taken. Measure from the `damage`
   event stream as `blocked + hpLoss` instead — `tests/enemies/engine-audit.html` documents
   this at the top and is a working reference.

### Renderer: two additions since round 1

- **Status pips on intents now have data behind them.** 17 moves declare `applies` /
  `appliesFn` (`[{id, stacks, to}]`, `to` ∈ `player | self | ally | allies`). `appliesFn`
  is used wherever the status or its size is conditional — which Button gets sewn, how big
  Darkness is, which branch The Night Terror resolves to — so the pip must be re-read on
  every intent refresh, exactly like `damageFn`.
- **Board order is turn order, and it is load-bearing.** Support enemies are authored into
  the last slot on purpose (`foyer-14`, `sq-14`). Please keep left-to-right rendering
  aligned with `slot` from `buildEncounter`; reordering them visually would desync the
  telegraph from what actually happens.

### Balance note for whoever owns tuning

Early-Scuffle HP cost barely responds to enemy damage numbers, because the greedy sim AI
blocks exactly the telegraphed value. Measured Guard absorption: Foyer Scuffle 1 **95%**,
Scuffle 2 **91%**, versus 46-57% for multi-enemy formations. A solo early enemy is
structurally free against that AI whatever its damage is. Encounter composition, not enemy
damage, is the lever. Full table in `docs/ENEMY-AUDIT.md`.

---

## 2026-08-20 - combat-scene

Shipped `src/scenes/combat.js` + `combat.css`, `src/ui/enemy.js`, `src/ui/intent.js`,
`src/fx/combatfx.js`. Nothing outside those five files was touched.

Playable standalone: `http://localhost:8777/game/index.html#scene=combat&seed=42`.
Debug params: `&encounter=foyer-9`, `&enemies=4` (stress board), `&tier=advanced`,
`&haunt=3`, `&companion=marmalade`, `&region=nursery`.

**Measured: 61 fps** at 1600x900 with 4 enemies, 10 cards in hand and particles live
(`shots/cb-stress2`, `cb-fps4`). **Zero console errors** in every capture listed below.

### Layout (STS2-REFERENCE section 1)

Keepsake bar top-left (a real "No Keepsakes" empty state, not a placeholder) /
Courage + Lost Things + turn counter top-right / enemies upper-centre with the intent
stack above and Courage bar, Guard shield, counters and statuses below / player plate
lower-left (companion portrait plate, Courage bar, Guard shield, status row, incoming
readout) / **Nerve** orb bottom-left with the draw pile beside it / End Turn bottom-right
with the discard pile. Both piles open a viewer; the draw pile is **sorted by name** so
looking is information rather than an oracle.

End Turn has three states: disabled (not your turn), `is-waiting` (you still have plays),
and `is-ready` - a lit gold button with a slow pulse the instant nothing in hand is
playable.

### The intent view - `ui/intent.js`

Two redundant channels so the read never depends on colour:
**frame shape per family** (attack = downward shard, defense = shield, scheme = hexagon,
special = circle) and **glyph per type** - all 16 including the new `DEFEND_DEBUFF`
(shield + falling chevron, the exact mirror of `DEFEND_BUFF`).

- Attack intents print the exact post-modifier per-hit damage and `xN` for multi-hits.
- **A Guard number can never be mistaken for damage**: it wears a shield clip-path and the
  Guard palette, damage does not.
- Every `intent` event animates a number flip - up flips red and overshoots, down flips
  cyan and undershoots. This is what makes "your damage changed the future" legible.
- `is-heavy` (ATTACK_BIG, or >=34% of current Courage) thickens the frame, enlarges the
  glyph and adds a breathing halo; `is-lethal` adds a drop-shadow pulse.
- Status pips under the frame show what the move will apply without needing the tooltip.
- Hover gives the move name, plain-language lines, the `tell` in italics, and the note
  "This number is exact - every modifier is already counted."

`intentFamily()` in `combat/intents.js` still maps `DEFEND_DEBUFF` to `special`;
IntentView overrides it locally to `defense`. **One line to delete once the engine agrees.**

### Enemy rigs - `ui/enemy.js`

Procedural SVG built from `silhouette` / `shape` / `palette` / `scale`. Four trunk
archetypes (`squat`, `tall-thin`, `sprawling`, `floating`) generated as seeded
Catmull-Rom blobs - deterministic from the enemy id, so the same Dust Bunny is lumpy the
same way every run. **All 24 silhouette keys have a hand-authored prop layer** plus a
sensible default; eye layouts for 0-6 eyes; limbs distributed front and back.

After mount each rig **fits its own viewBox to `getBBox()`** and publishes the resulting
aspect as `--e-aspect`, so a 0.7-scale service bell and a 2.0-scale bedframe both stand on
the floor with the intent right above their heads. Sprawling rigs are width-capped so one
rug serpent cannot eat the room.

Animation is about 7 transform writes per enemy per frame, no per-frame allocation:
breathing, sway, a periodic twitch with an eye dart, real blinks (a sine over the blink's
life, so it shuts and opens), limb ripple, and pupil tracking that looks at the player
during a wind-up. `windup(type)` poses per intent family and **resolves before damage
lands**; `strike()` is the contact lunge; `flinch(hpLoss)` throws and squashes; `clank()`
is the duller Guard-absorbed reaction; `die()` is a stagger, then lights out, then a
dissolve.

Beyond the base rig, as the enemies agent asked:

- `setCounters()` - Dust / Momentum / Resonance / Wound Up and the rest as gold chips
  under the Courage bar, with a bump animation on change and a tooltip. Read from
  `actor.counters`.
- `setBadges()` - named state badges above the intent (Coatcheck Garment + Snagged,
  Pristine/Cracked/Shattered, Hidden/Exposed, Bed Position, Discomposed, Darkness).
- `setRule()` - a handwritten House Rule card on ruled paper, driven by the engine's
  `rule` / `rule:broken` events.
- `setAlternatives()` - the Night Terror's two-possibility intent: both futures rendered
  side by side with their trigger labels, collapsing to one when `alternatives(c)` does.
- `setQueue()` - the `intent:queue` slice past position 0, unrevealed slots dashed with `?`.

### Tactical clarity

- Hover or drag calls `engine.preview(uid, targetId)` and paints the outcome **on the
  target**: predicted damage, hit count, `LETHAL`, and the statuses that will land.
- The card's own numbers recolour live via `CardView.setPreviewNumbers`.
- **Uncertainty is honest.** `preview()` returning `uncertain` (a card with an unmade
  choice) prints `6?` instead of `6`, dashes the target overlay, suppresses the LETHAL
  claim and adds "depends on your pick". `previewAsync()` refines it a frame later, still
  flagged uncertain.
- **Incoming damage readout** on the player: `previewIncoming()` totalled across every
  living enemy intent, shown as `23 -> 23` with either "N more Guard to stop it all",
  "Fully blocked", or `LETHAL`. It updates as Guard changes - including the *predicted*
  Guard while a Curl Up is hovered - and paints a hatched band on the Courage bar showing
  exactly how much of it this turn eats.
- Every status pill, counter chip, queue slot, keepsake, pile and orb is hoverable and
  keyboard-focusable with a plain-language tooltip.

### The chooser (engine Round 2)

`engine.setChoiceResolver()` is installed, so the ~70 "choose a Trick" cards get a real
picker: full CardViews for `kind:'card'`, labelled buttons for `option`, and for `enemy`
both a button list **and** clicking the creature itself (its floor pool lights spectral).
Multi-pick shows a Confirm, optional choices show Skip. Keyboard: arrows move, Enter
picks, 1-9 jump, Esc skips when optional. `exit()` resolves any pending request with `[]`
so the engine can never be left awaiting a dead scene.

### FX - `fx/combatfx.js`

One pooled canvas (struct-of-arrays, 1100 particles, zero per-frame allocation, and it
**skips the clear entirely when idle** - that alone took the scene from 17 fps to 61) plus
a pooled DOM layer for numbers so they stay crisp over shake and particles.

Damage numbers rise, drift and fade, scaled logarithmically by magnitude with a 2px ink
stroke. Hit flash and flinch are driven by a CSS *animation* so nothing lingers. Courage
bars drain with a ~300 ms hold then a slow trail so the loss reads. Guard gain shimmers;
Guard break shatters into spinning shards with a `GUARD BROKEN` plate. `stage.shake()`
**and** a DOM shake on `.cb`, both scaled to `hpLoss` (never to `amount`).
`clock.hitstop(0.16, 0.075)` on `hpLoss >= 12` only. Deaths get a stagger, lights-out eyes,
a spectral pulse, 44 motes in the creature's own palette and a beat before the board
re-centres. `atmosphere.impact()`, `dread()` on the enemy phase, and `audio.play()`
throughout, all guarded with `?.`.

### Wiring

`engine.on('*')` pushes into one queue drained by a single async consumer, so a five-hit
attack reads as five impacts and an enemy's wind-up always completes before its damage
lands. The scene never decides rules - `onPlay` only asks `canPlay()` and then calls
`playCard()` on the Hand's hold beat (200 ms in), which is why the effect lands while the
card is presented. `engine.state` is used only at settle and at build; every per-event
refresh reads `engine.actor()` / `engine.piles` / `engine.energy` / `engine.phase`.

### Accessibility

Full keyboard path: 1-9 select, arrows move and cycle targets, Enter aims and confirms,
Esc cancels, **E** ends the turn, **Q**/**W** open the draw/discard piles, Tab cycles
targets while aiming. `reduceMotion` collapses every duration through one `_d()` helper
and skips particles; `screenShake`, `flashes`, `showDamageNumbers` and `largeText` are all
respected and re-read on `settings:changed`.

### Tokens I need (I did not edit `tokens.css`)

1. **`--good-300` / `--good-500`** - already requested by card-feel; I need the same green
   for "this preview is better than printed" and for the safe state of the incoming
   readout. I am currently reusing `--spectre-200`, which reads as cold rather than good.
2. **`--warn-300`** - an amber distinct from `--flame-300`, for the "uncertain outcome"
   dashes and the `?` suffix. `--flame-200` currently doubles up with the Nerve palette.

Everything else came from existing tokens. The only literal colours anywhere in my files
are the enemy `palette` arrays, which are **content** authored by the enemies agent and
read off the defs, never hardcoded.

### What I need from other agents

- **combat-engine** - three things:
  1. `intentFamily()` should map `DEFEND_DEBUFF` to `defense` (I override it locally).
  2. For **`covered`** (Blanket Blob): please add a generic `redirectDamageTo` field on the
     status rather than making the Blob's `onDamaged` do it. The renderer wants to draw the
     redirect arc from the covered actor to the protector, and it can only do that if the
     protector is *data* on the status rather than logic inside one enemy.
  3. `engine.enemyCtx(enemy, move)` is declared with two parameters but `intents.js`
     `deriveMoveId` calls it with three. It works, but the signature should say so.
- **ui-chrome** - `ctx.tooltip.show()` is still a stub. I probe it once on first hover and
  fall back to my own `.cb-tip` renderer; the moment you ship a real one that appends to
  `ctx.tipLayer`, my probe detects it and defers automatically. No change needed on my side.
- **card-feel** - nothing blocking. I override `--card-w` / `--card-h` on `.cb-root` to
  `clamp(140px, 10.5vw, 174px)` so a 10-card fan does not reach the enemies at 900px tall;
  say the word if you would rather own that number.
- **meta-run** - `ctx.run` does not exist yet. I boot from real Foyer content
  (`startingDeckFor(companion)` + `rollEncounter`) and fall back to `makeDummyCombat`.
  When `run.js` lands, set `ctx.run.combat` to a built `CombatEngine` and I use it directly;
  otherwise `ctx.run.companion / region / seed / rng / gold` are all read if present. On
  victory I `scenes.go('reward')` and on defeat `scenes.go('gameover')`, but only when
  `ctx.run` exists.

### Not built, and why

The Bedframe Beast's three **Bed Positions** are set dressing that must move when the
player's 3rd and 6th Tricks land. There is no engine surface for them yet - they are not
actors, objects or counters. Either the Beast should register them via
`engine.addObject({kind:'bed-position'})`, in which case `object:add` / `object:update`
already give me everything I need, or the enemies agent should mirror them into
`engine.field` and I will render off that. I did not want to invent a third channel.

### Screenshots

`shots/cb-final.png` (4-enemy board), `cb-final-aim.png` (aim plus damage preview),
`cb-stress2.png` (4 enemies, 10 cards, 61 fps), `cb-choice2.png` (the chooser),
`cb-turn_f0..f13.png` (a full enemy turn), `cb-death_a/b/c.png` (a death),
`cb-hover2.png` (hover plus predicted Guard), `cb-kb-aim/played/pile.png` (keyboard path),
`cb-exit.png` (scene teardown and re-entry).


---

## 2026-08-20 — combat-engine (round 3)

Three fixes. **478 assertions, 0 failures** (`python tests/combat/run.py`).

### 1. `onEnemyPhaseEnd` — the hook support enemies needed

**The hook name is `onEnemyPhaseEnd`.** It exists in two places, both firing at the
same moment:

- a **status / relic / power / object hook**: `hooks: { onEnemyPhaseEnd(h) {…} }`
- an **EnemyDef lifecycle hook**: `onEnemyPhaseEnd(c)` with a full EnemyCtx

It runs after every enemy has acted and after the decay buckets, and **before any
intent is redrawn**. That is the window a support enemy needs: buffing an ally from
inside a move cannot keep the intent honest, because the ally's intent was drawn
before the buff landed. Ordering support enemies last only works until you have a
summoner, which is always slot 0.

```js
// Calling Bell / House Bell / the Butler can now do this honestly:
onEnemyPhaseEnd: (c) => { for (const a of c.allies()) c.applyStatus(a, 'roused', 1); }
```

Tested end to end: a slot-0 Bell arms a slot-1 Brute, the displayed intent goes
6 → 8 immediately, and the hit next turn lands for exactly 8. **Roused can go back
on the House Bell and the Butler.**

The end-of-turn sequence is now, in full:

```
5   enemy actions, slot order    (per enemy: turn:start, Guard wipe,
                                  start-of-turn statuses, move, onTurnEnd, turn:end)
6a  per-enemy 'turnEnd' status decay
6b  the 'enemyTurnEnd' decay bucket — player, allies, AND enemies
6c  ENEMY PHASE END  ← onEnemyPhaseEnd hooks, then EnemyDef.onEnemyPhaseEnd
                       phase == 'enemyPhaseEnd', emits `phase`
6d  'enemyTurnEnd' countdown timers
7   every living enemy picks its next move → intent   (buffs from 6c already in force)
8   start of your turn
```

Arming happens **after** the decay buckets on purpose — otherwise a buff armed with
`decay:'enemyTurnEnd'` would be applied and expire in the same pass.

Related fix in the same area: the **`enemyTurnEnd` decay bucket now runs on enemies
too**, not just the player and allies. It previously skipped them, so an
enemy-held `enemyTurnEnd` status was permanent.

### 2. `announceRule` now replaces by SOURCE, not just by id

This silently broke the game's first boss: the Butler was enforcing all four House
Rules at once from turn four of phase one.

**New default: announcing a rule clears every other rule owned by the same source
first.** One actor standing up a new rule almost always means "instead of", not "as
well as". Rules owned by *other* sources are never touched, and a source's rules
are still cleared automatically when it dies.

A boss that genuinely escalates opts in explicitly:

```js
c.announceRule({ ...rule, stack: true });   // keep this source's earlier rules too
```

`clearRules(sourceId)` and `clearRule(id)` are unchanged. Content does **not** need
to call `clearRules` before announcing any more.

### 3. `applyStatus` no longer drops its 4th argument

The enemy ctx wrapper was calling `e.applyStatus(actor, id, n, { sourceId })` and
discarding whatever the caller passed, so Blanket Blob's
`applyStatus(ally, 'covered', 1, { by, amount })` arrived with no `by` and no
`amount` — the status was inert. Anything else parameterising a status through the
enemy ctx was broken the same way.

Fixed on **both** ctx surfaces:

```js
c.applyStatus(actor, id, n, opts)   // enemy ctx — opts merged over { sourceId }
c.buff(id, n, opts)                 // ditto
c.debuff(id, n, opts)               // ditto
ctx.applyStatus(actor, id, n, opts) // player card ctx
```

Where those options go:

- engine keys (`reason`, `sourceId`, `ignoreCharm`, `silentBlock`) are consumed as before;
- **everything else is content data.** It is stored on the actor as
  `actor.statusMeta[id]`, readable with `engine.statusMeta(actor, id)` or
  `ctx.statusMeta(actor, id)`;
- it rides on the `status` event as **`meta`**, so the renderer sees it without asking;
- it reaches `StatusDef.hooks.onApply` as **`h.opts`** (and `h.meta`);
- it appears in `state.*.statuses[i].meta` for tooltips.

Applying the same status again merges the new options over the old. `removeStatus`
clears them. Actor references are stored by `.id`, and functions are dropped, so
`engine.state` stays structuredClone-able.

### Intent-honesty verification — use the audit method

The enemies agent's `tests/enemies/audit.py` is the reference method, and the
combat suite now contains the same check. Score an attack intent's honesty from the
**`damage` events**, as `blocked + hpLoss` per source:

```js
engine.on('damage', ev => {
  if (ev.targetId !== playerId || !ev.sourceId) return;
  dealt.set(ev.sourceId, (dealt.get(ev.sourceId) || 0) + ev.blocked + ev.hpLoss);
});
// compare against intent.damage * intent.hits, captured BEFORE endTurn()
```

Do **not** sample HP/Guard deltas across `endTurn()` — the player's entire unspent
Guard gets counted as damage taken and every honest enemy looks like a liar. The
suite runs this over 12 seeds with a deliberately Guard-padded player; the enemies
agent reports 2451 turns, 0 mismatches with the same method.

## 2026-08-20 — frontend agent, round 2 (title / select / clubhouse / gameover)

Picked up the pre-run screens from the previous frontend pass. `shots/title01.png` in the
repo was stale — the logo bug it shows was already partly fixed. Everything below is
against the live build.

### 1. Title

- **Wordmark now fills the cartouche.** In `ui/portrait.css` the two lines went from
  `.062` to `.0715` and `.100` to `.1105` of `--logo-w`, the negative leading tightened, and
  the outer bloom became a two-stop drop-shadow so it reads like the source plate's glow.
  The cartouche itself grew in `ui/portrait.js` (`ry 152 to 166`, inner rings to match) so
  MENAGERIE has air on all four sides instead of colliding with the brass ring.
  Measured against `UI/selectCompanion.png`: MIDNIGHT/MENAGERIE width ratio 0.73 vs the
  plate's 0.71, cap-height ratio 1.62 vs 1.62.
- **The menu has a ground.** New `.ti-plinth` wraps tagline + menu in a framed slate
  plaque (near-opaque ink gradient, brass hairline + diamond top and bottom, `--shadow-4`).
  The nav is `width: fit-content` and centred in it, so the panel is not half-empty.
  `.ti-scrim` widened and softened underneath so the house sits back rather than vanishing.
  **I deliberately did not use `backdrop-filter` here** — blurring a permanently animating
  backdrop (motes + flickering windows) is a full-rect repaint every frame. An opaque
  gradient looks the same and holds 61 fps.
- **Tagline** moved into the plinth, up to `clamp(15px,1.18vw,20px)`, parchment-tinted with
  the second line in flame, hard shadow behind. It is no longer over the building at all.
- The menu chevron glyph now points at its label (it pointed away).

### 2. `scenes/gameover.js` + `gameover.css` — built (was an 8-line stub)

Deep links: `#scene=gameover&result=defeat` and `&result=victory`, plus optional
`companion`, `kid`, `region`, `seed`, `floor`.

Layout is one grid, two arguments:

- **left, the beat** — candle, Companion plate, headline, three stanzas (*what you found* /
  *what you lost* (or *what it cost*) / *the pet you did not reach*), and a blueprint band.
  On defeat the flame is snuffed 1.35s in: the flame ducks and dies, the halo goes out, a
  smoke wisp draws itself at the wick and keeps drifting, and the vignette closes in. The
  vignette close is a **cross-fade of two painted layers**, not a transition on
  `background` — the latter repainted the viewport for 1.4s and cost about 13 fps.
- **right, the ledger** — who went in, eight stat tiles, a Courage bar, the final Tricks as
  typed chips, *worked hardest* rendered as a **real `CardView`**, the Keepsakes, and the
  seed with a copy button.
- The blueprint band crops the master plan through `mapgen.blueprintPlan(region, 3)` so it
  and the map screen are always looking at the same piece of paper. Victory lights the
  wing in flame; defeat circles it in red pencil.

Data: everything funnels through one `_summarise()` object, so a real `ctx.run` and the
standalone mock render through identical code. Fields read (all optional):
`result | won`, `seed`, `companion`, `kid`, `region | regionId`, `floor`, `hp`, `maxHp`,
`gold | lostThings`, `hauntLevel`, `killedBy`, `deck`, `relics`, `companionsFreed`,
`petRescued`, `wingsMapped`, and `stats.{scuffles,bigScares,curiosities,safeRooms,
cardsPlayed,damageDealt,turns,clues}`. Without a run every number is derived
deterministically from the seed, and the deck is built from the **real** `startingDeckFor`
+ `poolFor` data, so the mock is never a placeholder.

`_activate()` clears the run (`Save.clearRun()`, `ctx.run = null`) before leaving, so a
dead run can never be resumed off the title's Continue item.

### 3. Select

- **Starting deck is now real cards.** The old code looked for `mod.startingDeck`, which
  does not exist — it silently fell through to the codex summary every time. It now calls
  `startingDeckFor(slug)`, loads `ui/card.css`, and renders **`new CardView(def, {uid})`**
  per distinct Trick with a brass xN badge. Sizing is CSS-first (`.deckslot` is
  `height:100%; aspect-ratio: var(--card-aspect)`) and JS only does
  `view.setTransform({x: w/2, y: h, scale: w/224})`, re-run on resize. Companions whose
  module has not shipped keep the codex summary. All views are destroyed on re-pick and on
  `exit()`.
- **Dossier re-laid out.** The deck is now a full-width band across the bottom of the
  dossier with the CTAs beside it, strengths/weaknesses moved into the wide body column,
  and the side column gained a **vitals block** — starting Courage / Nerve per turn /
  starting Tricks, read off the companion module's `startingHp` and `startingEnergy`.
  That was a straight gap against StS character select, which always shows those numbers.
- **The wall now says what to do.** It arrived with no instruction at all; there is a
  "Choose a Companion" prompt above it, and the grid is height-clamped
  (`min(830px, 54vw, 71vh)`) so it no longer runs under the footer at 900px.
- **Kid step**: "Together" now shows the chosen Companion's plate next to the pairing line
  instead of a paragraph floating in empty space.

### 4. Clubhouse

- The Menagerie roster was clipping its fourth row. The grid is now centred and width-capped
  so **all sixteen plates are on screen at once** — a roster you have to scroll stops
  reading as a wall.
- The Backpack shelf was cutting off four pieces of Gear; the shelf list is now two columns
  and all of them fit.
- Panel scrollbars are styled (brass thumb) so anything that does still scroll says so.

### Measured

61 fps on every screen at 1600x900 (`shots/*.state.json`), about 11 MB heap. **Zero console
errors** on title, select (grid / hero / kid), clubhouse (all four panels), gameover
(both flavours) and the full flow. Teardown: after eight scene transitions the document is
back to 317 nodes, 1 `.scene`, 0 `.mm-card`, 0 `.pf`, and 6 (not 48) stylesheet links.

Note for anyone reading old numbers: fps dips to 9-24 when two Playwright runs overlap on
this machine. Re-measure in isolation before believing a low number.

### Accessibility

Roving arrow-key focus on the title menu, the companion wall, the kid strip, the haunt
pips and the gameover actions; visible focus rings everywhere (`shots/a11y_title_focus.png`).
`Escape` steps back one level on select and returns to the Clubhouse from gameover.
`reduceMotion` skips every entrance and snuffs the candle instantly; `largeText` verified on
gameover and select (`shots/a11y_go_rm.png`, `a11y_sel_rm.png`).

### Terminology

Swept again. `Curiosities` was rendering as "Curiositys" (`TERMS.event + 's'`) — fixed with
the real plural. No energy/HP/block/card/relic/gold/shop words anywhere in my four scenes.

### Tokens I need (I did not edit `tokens.css`)

Nothing blocking — everything derives from existing tokens or the `--arcane-*` / `--brass-*`
ramps in `ui/portrait.css`. Two would be nice to have, both currently done with
`color-mix()` at the point of use:

- `--paper-wash` — the multiply wash used over blueprint parchment on dark screens.
- `--good-300 / --good-500` — card-feel already asked for these; my gameover chips would
  use them for "this went up" too.

### Breaks outside my ownership

1. **`combat/engine.js` line 71 imports `previewCardAsync` from `./preview.js`, which does
   not export it.** This is a *static* import, so while it is broken the whole app fails to
   boot on every screen — `window.MM` never exists. It was broken around 02:35-02:45 and
   working again by 03:05; the combat-engine agent is mid-edit. Worth a smoke test before
   anyone signs off. (combat-engine)
2. **`state/run.js` does not exist**, so `ctx.run` is always `null`. Select emits
   `run:start` with `{companion, kid, seed, haunt, backpack}` and hands those straight to
   `scenes.go('map', payload)`; map and gameover both mock cleanly without it. Gameover
   will read a real run the moment one exists — the field list is above. (meta-run)
3. `data/relics.js` does not exist. I originally probed for it with a dynamic import, which
   put a 404 in the console; I removed the probe. Gameover reads Keepsakes from
   `ctx.run.relics` only, and otherwise shows an authored fallback set. (meta-run)

### Flow

title -> New Expedition -> select companion -> dossier -> Take X in -> kid ->
Begin Expedition -> `ctx.scenes.go('map', payload)` -> the map scene loads. Verified end to
end by driving real clicks: `shots/flow1_select.png`, `flow2_hero.png`, `flow3_kid.png`,
`flow4_map.png`.

### Screenshots

`shots/t2.png` (title), `go-defeat.png`, `go-victory.png`, `sel2.png` (the wall),
`sel4.png` (Bones dossier, real cards), `sel-kid.png` (kid step), `club2.png` (board),
`club-menagerie.png`, `club-pets.png`, `club-backpack.png`,
`flow1_select.png` through `flow4_map.png`, `a11y_title_focus.png`, `a11y_go_rm.png`,
`a11y_sel_rm.png`, `cycle2.png` (post-teardown).

---

## 2026-08-20 — card-feel, round 2 (fixing the critic's forensic pass)

Owner: card-feel. Files touched: `src/ui/card.js`, `card.css`, `hand.js`, `hand.css`,
`cardart.js`, `tests/cards-feel/index.html`. Nothing else.

### The big one: the hand now fits, at every size and resolution

The card was a fixed 224x312 box. It is now responsive **and** the hand drives a per-hand
scale on top of that.

* `card.css` declares `--mm-card-w: min(var(--card-w, 224px), max(150px, min(13.5vw, 27vh)))`
  on `.mm-hand, .mm-card`. It never exceeds the shared `--card-w`, so `combat.css`'s
  `clamp(140px, 10.5vw, 174px)` still wins inside combat.
* **REQUESTED TOKEN CHANGE (ui-chrome):** make it the token itself —
  `--card-w: clamp(150px, min(13.5vw, 27vh), 224px);`. The local clamp becomes a no-op the
  day that lands. I did not touch `tokens.css`.
* `Hand#_fit(n)` returns a scale bounded by two rules: a card is never taller than 30% of the
  viewport, and the fan at its widest allowed overlap still fits inside the viewport minus a
  gutter each side (`max(150px, 10% of width)`) so the energy orb and both piles are never
  covered. `Hand#_measure()` reads the real CSS card size from a hidden `.mm-hand__probe`
  rather than assuming 224; the existing ResizeObserver re-runs it.
* The fan reserves the outer card's **rotated** extent, horizontally
  (`cw*cos(t)/2 + ch*sin(t)`) and vertically (`cw*sin(t)/2`), plus the 24px unaffordable drop.
  Budgeting only half a card width is what let the old fan run to x = -9 and hang 32px below
  the viewport. `max(card.bottom) == h - 20` for every n now, by construction.
* The fit is **quantised to 1/8ths** (0.625 / 0.75 / 0.875 / 1.0). The compositor rasters a
  card at its transform scale, so a continuous fit meant nearly every hand size produced a
  raster scale it had never seen before.

Measured, `MMTEST.fitCheck()` on the showcase, n = 1..12, four resolutions: **zero clipping**
(`max(card.bottom) <= innerHeight - 8` everywhere), card height 20.9%-29.3% of viewport,
hand width <= 80% of viewport, left edge >= 150px at every n. Overlap at n=10 / n=12:
34.1% / 32.8% (1280x720), 44.7% / 31.1% (1366x768), 42.8% / 43.3% (1600x900),
42.0% / 44.1% (1920x1080) — the 45% ceiling holds everywhere.

### Card anatomy reworked (this is what made the smaller card readable)

Art 0-126u, name plate 126-160u **below** the art, type line 160-182u, rules 186u to 15u from
the bottom, badges at 1u. The 90%-black banner used to cover 20% of the illustration and the
rules box stopped 30u short of the bottom — 18% of the card was dead space. Also: rules rows
now stretch to the box width (real card text was overflowing both edges and being clipped),
the cost gem moved from -6u,-6u to 3u,3u (it was landing on the neighbour's art), and the
rarity crest is inset into the top rail with a real bevel instead of a flat mound stuck on top.

### Performance

`draw 5 into a hand of 12` was 43 fps cold. Three separate causes:

1. `cardArt()` painted five fresh canvases (~6ms each) plus PNG encodes inside one frame.
   New `warmArt(defs, w, h, {upgraded})` in `cardart.js` pre-renders a whole deck off the
   critical path, ~11ms of work per frame, and pre-decodes each bitmap. Art is now rastered at
   a **fixed** size (`ART_W * CARD_SS` x `ART_H * CARD_SS`, exported from `card.js`) so the
   cache key is viewport-independent.
2. The rarity crest stacked **four** `drop-shadow()` filters to fake a 1px outline — roughly
   32ms of raster per newly created card. Replaced with a dark parent + inset bevelled child.
3. The real killer: five card elements attached to the DOM in one frame = five new composited
   layers rastered in that frame. `Hand#_makeSlot` now staggers the DOM insertion two frames
   per card (they are already staggered visually by `drawStagger`).

`tests/critic-cardfeel/fps.py`, 1600x900, SwiftShader, three consecutive runs:
idle@7 **61**, idle@12 **61**, **draw5-into-12 61 / 61 / 62 cold**, draw5-into-12 again 61,
draw5-into-7 61, discard@12 61, exhaust@12 57-60, hover-sweep 88-91.
(Was: draw5-into-12 43 cold / 56 warm, discard@12 57, exhaust@12 55.)

**Scenes should call both on entry**, ideally behind the transition:

```js
import { warmArt } from '../ui/cardart.js';
import { ART_W, ART_H, CARD_SS } from '../ui/card.js';
await warmArt(deck, ART_W * CARD_SS, ART_H * CARD_SS, { upgraded: 'both' });
hand.warmRaster(deck, 6);          // optional rehearsal, invisible, below the fold
```

### The other ten

1. **Arrowhead.** The tangent was taken from `t -> t+0.01` clamped to 1, so at the last sample
   it was `t -> t`: direction (0,0) and a zero-area head. Taken backwards now (`t-d -> t`),
   always defined. Solid 36px triangle, tip stopped on the reticle ring instead of piercing
   the sprite, and the ribbon widens monotonically toward the target instead of pinching to
   nothing (it read as a comet pointing the wrong way).
2. **Exhaust embers.** The mask was applied to the card root with the embers inside it. A new
   `.mm-card__body` wrapper holds everything; the ember layer is its **sibling**, so embers
   survive the burn. The mask box is stretched 30u above the card so the crest and the cost
   gem burn too. 615ms -> 380ms, card visually gone by ~220ms. Embers are promoted only for
   the life of the animation (a permanent `will-change` there cost ~8 fps on every draw).
3. **Unaffordable / Curse contrast.** Root cause was structural: `.mm-card__face` was a CHILD
   of `.mm-card__frame`, and the unplayable treatment filtered the frame — so the filter hit
   the rules text too. The face is now a **sibling** of the frame. Art/frame/crest/pips/gem
   desaturate (`saturate(.35) brightness(.6)`); text is never filtered and the 42% ink-900
   `::after` sheet is gone. Measured from PNG pixels (brightest 0.5% vs 20th percentile of the
   rules crop): playable **15.25:1**, unaffordable **15.71:1**, Curse **15.79:1**, Status
   **15.64:1**. Rendered text colour on an unaffordable card is `rgb(244,239,228)`
   (`--text-hi`), confirmed by `pass4.py`.
4. **The arrow no longer lies.** `is-snapped` (amber + reticle) requires `slot.playable`;
   otherwise it stays `is-invalid` grey with no reticle. The threshold line gets a third state,
   `is-blocked` — grey, labelled "Not enough Nerve" — instead of arming in amber and refusing.
5. **`aria-label`** is built from resolved, preview-adjusted numbers and plain-language
   keywords: "Scratch, 1 Nerve, Attack, basic, Deal 6 damage." (was "Deal d damage.").
6. **Focus.** Cards carry `tabindex="-1"`, the hand is a single `tabindex="0"` roving-focus
   host, and Tab is trapped inside the hand while a card is selected or an aim is open
   (it cycles targets while aiming, walks the hand otherwise). A played card hands focus back
   to the hand rather than dropping it on `<body>`.
7. **Art identifies the card.** The subject layer was the companion portrait, re-cropped — all
   five Marmalade cards were the same ghost-cat face. It is now a silhouette chosen by
   `def.id` (`subjectFor()`): claw / curled sleeping cat / pouncing cat / bone / pumpkin /
   candy / eye / ghost / web / nine lives / thorn / flask / ward / paw and more, with a
   type-keyed fallback pool. The companion still owns the palette, the scene and the accents.
   `art.py`'s closest pair is now 14.66 mean abs px diff on a 16x16 downsample; the five
   Marmalade cards sit at 17.7-18.9.
8. **Crest** bevelled and inset (see anatomy above).
9. **Cost gem** moved inside the card box.
10. **The hero frame.** The played card was picking up `is-unplayable` — paying for it dropped
    energy to 0 and `_refreshPlayable` repainted it a frame before it reached the play
    position. `_animatePlay` now forces `playable: true` and adds `is-hero` (kills every
    dimming filter, boosts saturation/contrast, hard rim of light), scale overshoots 11% past
    the play size and settles on `easeOutBack`, and `CardView#impact()` fires a fast-attack
    white pop with a bloom ring at contact.

Also fixed in passing: **Escape during a drag** cancelled the aim but left `drag.snap` set, so
the card was still played on release.

### Not fixed / notes for others

* The absolute visible sliver at n=10 is 108px at 1600x900 (130px at 1920x1080), not the 120px
  the critic asked for at every resolution. The binding constraint is the rotated outer card's
  reach: honouring 120px at 1600x900 would push the leftmost card edge to x=101, on top of the
  energy orb. I kept the ratio (<=45% overlap) and the gutter, and let the absolute number fall
  where it must. Say the word if the orb should move instead.
* `select.js` and `gameover.js` size their CardViews from the `--card-w` token. Cards are now
  slightly narrower than 224 at small viewports, so their slot maths is a few px off. Harmless,
  but worth a look by frontend / meta-run.
* `preloadArt()` is now a deprecated no-op (portraits are no longer the subject layer). It is
  still exported so nothing breaks. `onArtReady()` still works.
* Dropped the local `var(--good-300, #74e08a)` fallbacks now that the tokens exist. Thanks.

### Screenshots

`shots/r2/` — `arrow_playable.png`, `arrow_unaffordable.png`, `thresh_unaffordable.png`,
`ex_0000..0400.png` (exhaust phases), `play_0000..0520.png` (hero frame),
`c_playable.png` / `c_unaffordable.png` / `c_curse.png` / `c_status.png` (contrast crops).
`shots/mine_12.png` (hand of 12 fitting), `shots/mine_unplayable.png`,
`shots/mine_card_zoom.png`.

---

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

## 2026-08-20 — atmosphere (round 2): lighting, room identity, warm-up

Round 1 shipped a good authoring surface with nothing lit by it. Every number below
was measured from the actual PNGs with a script written for this pass
(luma = Rec.709 on 8-bit sRGB; saturation = mean chroma, max-min; structural
cross-correlation = Pearson on a brightness- and contrast-normalised 128x72 luma
downsample). Reference target is `game/assets/portraits/pipkin.png`.

### 1. Nothing was lit by a light — three separate causes, all fixed

1. **Every region's lamps were deep in the room** (z between -4 and -17), so the
   camera only ever saw the *shadow* side of anything in the foreground. The
   showcase stand-in, the near props and the enemies were all backlit silhouettes
   no matter how bright the wall behind them was. Every region now authors a
   **`key`** and a **`fill`** in FRONT of the action plane (positive z, between the
   camera and the actors). `LightRig.slots` went 4 -> 5 so the key can never be
   evicted, and slot selection now sorts on *authored* intensity rather than live
   intensity so flicker cannot make lamps swap slots and pop.
2. **`AtmoLight` under-drove its real `THREE.PointLight`** — a flat `intensity * 6`
   regardless of radius. The backdrop shaders use `I / (1 + k^2(1 + 1.55k))` with
   `k = d/r`; equating the two at `d = r/2` gives `I_three = 0.17 * I * r^2`. A
   wide-radius lamp was 3-5x too dim, which is why any `MeshStandardMaterial` an
   agent adds to the scene rendered black in a visibly bright room.
3. **The prop shader lit four quad corners with a near-black albedo.** Props are
   now shaded **per pixel** from an SDF-derived normal (the coverage-field gradient
   turns the flat quad into a rounded slab that faces outward at the silhouette and
   toward the camera in the middle), with a real material colour per region
   (`propAlb` / `propHi`), a specular term, and interpolated world position so a
   crown is genuinely farther from a low lamp than a base is.

Also new: **visible flames.** Every practical light now draws an additive billboard
(`FLAME_VERT/FRAG`, `Backdrop.syncFlames`), driven by the same flicker that drives
the illumination. This is the only thing in frame that is *supposed* to clip to
white, and it is what gives bloom something honest to work on. `key`/`fill` set
`glow: 0` — they are cinematic lights, not objects.

And **contact shadows**: an instanced multiply-blended ellipse under every standing
prop, plus `atmosphere.setActors([{x, z, r, strength}])` for actors a scene owns.

### 2. Shafts now land

Each shaft computes its own floor intersection, is extended to reach it
(`len = originY / cos(angle) * 1.06`), brightens into the contact instead of fading
out, and publishes an elliptical **pool** that the floor shader paints
(`uPool` / `uPoolAxis` / `uPoolCol`, 4 slots). Round 1 faded the beam out at its own
bottom edge, so every shaft in all seventeen regions stopped in mid-air.
All 17 regions author shafts now; five had none. **`foyer` — the first atmosphere
any player ever sees — declared no lights, no shafts and no particles at all.**

### 3. Seventeen rooms, not one room recoloured

The palette gained three structural blocks:

* `room: { w, d, h, side, ceilPattern, wallPad }` — the shell geometry is rebuilt
  per region. The Secret Passages is 7.5 m wide with a 3.4 m ceiling; the Ballroom
  is 34 x 26 x 10.5; the Graveyard, Hedge Maze and Pumpkin Grounds have no ceiling
  and no side walls at all and use a new **exterior** wall mode (night sky
  gradient, stars, a moon with a real halo, a distant roofline with lit windows
  that spill onto the masonry).
* `cam: { y, z, look, fov }` — eye height, distance and lens per region, applied by
  `stage.setCameraRig()`. Combat framing is pushed in and the horizon raised:
  StS2 is "epic rather than intimate", and the old frame was ~70% bare floor.
* `props.layout` — one of `wings | colonnade | rows | aisle | clutter | nook |
  terrace | hang | perimeter`. Props are also now clamped to the visible half-width
  at their depth, so a prop in a 34 m room is actually in the shot.

Ceiling treatments went from 4 to 9 (planks / checker / flagstone / coffered /
vaulted ribs / glazed panes / exposed rafters / plaster rose / industrial truss).
The silhouette library went from 10 shapes to 20 — cot, rocking horse, four-poster,
range, longcase clock, statue, sarcophagus, clawfoot bath, gas lamp, birdcage — and
every region draws from its own set.

### 4. The 6 s first frame

`grep -rn "compileAsync"` returned nothing in round 1; the first `composer.render()`
linked RenderPass + UnrealBloomPass (5 mips) + grade + OutputPass in one task.
`Stage.warmup()` now compiles **one object per task** (`compileAsync(obj, cam, scene)`
with a yield between each), shows the room un-posted as soon as the scene materials
are ready, then warms bloom and the grade off-screen at 1/8 scale and switches each
on. Two shader-side changes cut the link cost directly: the wall relief and the prop
coverage field are each evaluated **once** instead of three times, using `dFdx/dFdy`
for the gradient. That alone took total warm-up from 21.7 s to 6.3 s under
SwiftShader (`window.__MM_WARMUP_MS`).

### 5. New API and seams (for other agents)

```js
atmosphere.setActors([{ x, z, r, strength }])  // ground shadows for your actors
atmosphere.keyLight()             // { dirX, dirY, color, fill, strength }
atmosphere.screenToFloor(px, py)  // CSS pixels -> world point on the floor plane
stage.setCameraRig({ y, z, look, fov }, seconds)
stage.warmup()                    // idempotent; resolves with ms taken
```

Atmosphere also publishes the live key light on `document.documentElement` as
`--atmo-key-x`, `--atmo-key-y`, `--atmo-key`, `--atmo-fill`, `--atmo-key-strength`,
`--atmo-ground` (throttled to ~6 Hz). **combat-scene**: these are there so
`ui/enemy.js` can give its SVG sprites a directional gradient along
`(--atmo-key-x, --atmo-key-y)` in `--atmo-key`, an ambient-occluded base in
`--atmo-fill`, and a ground ellipse at `--atmo-ground` opacity. Lost Luggage is
currently the same brown at its crown as at its base while standing in an amber-lit
room; the room now has a defined key direction to shade it with. Alternatively call
`atmosphere.setActors()` with each enemy's floor position and get the contact shadow
in WebGL for free.

### 6. Hand-off: the title screen

`scenes/title.js` / `title.css` are the frontend agent's. `.ti-sky` is an **opaque**
full-viewport gradient, so nothing the atmosphere layer renders is ever visible on
the title screen — the measured before/after there is unchanged (mean luma 25.7,
mean chroma 15.3, 85.5% of pixels below L32, 4.8% mid-tones). A `title` region is
now authored in `REGIONS` (exterior night: sky gradient, stars, a moon with a real
inverse-exponential halo rather than a flat disc, a roofline with lit windows that
spill onto surrounding masonry, and two candle pools at the front of frame). To use
it: make `.ti-sky` / `.ti-clouds` / `.ti-moon` transparent or drop them, and call
`ctx.atmosphere.setMood('title')` instead of `'foyer'` in `TitleScene.enter()`.

If the SVG mansion stays, the specific defects measured were: mansion, trees, fence
and hedges are single flat fills with no value ramp and no rim; the moon is a flat
grey disc with three flat darker circles and no halo; lit windows are flat amber
rects that do not spill onto the masonry; fence pickets 40px from a lit candle
measure the same as pickets 400px away (the candles need a real radial falloff);
and the cobwebs read as a 15%-white UI overlay rather than as part of the world.

### 7. Measured before / after

Region set = all 17, captured through `fx/showcase.js` at 1600x900.

| | before | after | reference (pipkin) |
|---|---|---|---|
| mean luma (17-region avg) | 17.4 | **53.8** | 52.9 |
| median luma | 6.1 | **33.7** | 32.2 |
| p95 luma | 75.6 | **182.0** | 164.0 |
| mean chroma | 20.2 | **52.4** | 54.6 |
| shadows L<32 | 82.4% | **48.2%** | 49.7% |
| mid-tones 64-160 | 7.1% | **22.7%** | 24.1% |
| highlights L>192 | 0.1% | **4.2%** | 3.6% |

Combat (`shots/ca-combat.png` -> `shots/zz-combat.png`, full frame incl. DOM UI):
mean luma 27.3 -> **49.6**, median 8.2 -> **29.5**, mean chroma 26.1 -> **46.1**,
shadows 73.5% -> **53.5%**, mid-tones 12.3% -> **19.0%**, highlights 0.9% -> **2.8%**.

Props (the two side bands where props live, `(100,360)-(560,700)` and
`(1080,360)-(1540,700)`): p95 luma **116.9 -> 199.9** (target >=140), pixels above
L192 **1.7% -> 6.3%** (target >=3%), mean chroma 25.0 -> 67.4.

Structural cross-correlation across the 17 regions, brightness and contrast
normalised out: **0.627 -> 0.296** (target < 0.35). Strictest variant (also
high-passed to remove global gradients): 0.290 -> 0.049. Worst surviving pairs are
pumpkin/graveyard and lampworks/bathhouse at ~0.70 — both are legitimately similar
room *types*, and both are well below the round-1 average.

Longest `PerformanceObserver` long task, cold load, SwiftShader software WebGL:
title **6360 ms -> 2941 ms**, combat **5952 ms -> 2599 ms**, map **5447 ms -> 2949 ms**.

### 8. Known gaps, honestly

* The **<250 ms long-task target is not met** and is not reachable under
  SwiftShader: what remains is a single `gl.linkProgram` for one material, and
  software GL takes seconds over it. The structural fix is in (per-object compile,
  one task each, no single task owning the whole chain, and the two heaviest
  shaders cut to a third of their code size), and the screen is no longer blank or
  frozen while it happens. This needs a re-measure on hardware GL.
* Frame rate under SwiftShader at 1600x900 dropped from ~61 to ~30 fps: 5 lights
  instead of 4 across wall/sides/floor/ceiling/props, per-pixel prop lighting, the
  pool loop, flame billboards and contact shadows. This is a software-rasteriser
  number, not a GPU one, but somebody should confirm 60 fps on real hardware before
  sign-off. `stage.setQuality(0)` halves DPR if it is needed.
* Combat's *composite* mid-tone figure (19.0%) sits under the 22-25% target because
  roughly 40% of that frame is dark DOM chrome; the WebGL layer on its own is 22.7%.
* Props still read slightly waxy in the brighter rooms (nursery, sleeping, kennels).

### Screenshots

`shots/zz-regions.png` (17-region contact sheet, after) vs
`shots/zz-regions-before.png` (same regions, round 1).
`shots/zz-combat.png`, `shots/zz-title.png`.
Per-region frames: `shots/M_<region>.png` (after), `shots/B_<region>.png` (before).


---

## 2026-08-20 — ui-chrome

Owned and delivered: `src/ui/tooltip.js` (+ `tooltip.css`), `hud.js`/`hud.css`,
`modal.js`/`modal.css`, `settings.js`/`settings.css`, `deckview.js`/`deckview.css`,
`icons.js`, `base.css`, `tokens.css`, and `tests/chrome/**`. Nothing outside those
paths was touched.

Harness: `http://localhost:8777/tests/chrome/index.html`
Checks: `python tests/chrome/run.py` -> **RESULT: 27 checks, 0 errors**, 61 fps,
zero console errors. Shots: `chrome-overview / -tip / -nested / -settings /
-deckview / -drawpile / -icons / -icons-grey / -largetext / -colorblind / -hud`.
In the real game: `shots/ch-tip2.png` (Haunt explained beside a hovered Boo!).

### `tooltip.js` — the keyword system

One delegated `pointerover`/`pointerout`/`focusin` handler on `document`. **There is
no `pointermove` listener anywhere**: those two events bubble and fire only on
boundary crossings, so the cost is zero while the pointer is moving. Geometry is read
exactly twice per tooltip (anchor, then panel) inside one rAF and written as a single
`transform`.

Anchors are declarative — add an attribute, get a tooltip:

| attribute | shows |
|---|---|
| `data-kw="ghoststep"` | a keyword or status from the merged registries |
| `data-tip="free text"` (+ `data-tip-title`) | literal text |
| `data-tip-status="weak"` + `data-tip-stacks` + `data-tip-owner` | the live condition: what it does **at this stack count**, and what it will be after this turn |
| `data-tip-intent="attackBig"` (+ `data-tip-damage`, `data-tip-hits`) | the intent, in plain language |
| `data-tip-card="marmalade/pounce"` (+ `data-tip-upgraded`) | a real `CardView` preview |
| `data-tip-enemy="dust-bunny"` | name, Courage, lore, and the move list filtered to what you have seen |
| `data-tip-keepsake="brass-button"` | name, rarity, effect, live counter, flavour |
| `data-tip-node="bigScare"` | what that map room is |
| `data-tip-placement="top/bottom/left/right/auto"` | a preference, not a promise |
| `data-tip-avoid=".mm-map__node"` | **extra rects the panel must not cover** |
| `data-tip-delay="0"` | override the 110 ms intent delay |

Programmatic API:

```js
ctx.tooltip.show(anchorEl, descriptorOrString, { placement, avoid })
ctx.tooltip.hide()
ctx.tooltip.attach(el, descriptorOrFn)          // bind without attributes
ctx.tooltip.provide('card',     id => CardDef)  // lookups it must not import
ctx.tooltip.provide('enemy',    id => ({ def, name, hp, maxHp, seen }))
ctx.tooltip.provide('keepsake', id => RelicDef)
ctx.tooltip.provide('status',   (id, el) => ({ stacks, owner }))
ctx.tooltip.keyword('ghoststep')  -> descriptor
ctx.tooltip.allIds()              -> every id it can resolve (121 today)
ctx.tooltip.setEnabled(false) / ctx.tooltip.destroy()
```

Descriptor: `{ kind, id, title, subtitle, color, icon, body, lines[], rows[], moves[],
stacks, footer, node }`. `kind` is one of `keyword | keywords | status | intent | card |
enemy | keepsake | node | text | custom`.

**Registries.** It calls `loadCompanionKeywords()` and `loadContentRegistries()` itself
at construction, so all three sources are merged whether or not combat has booted —
**121 ids, every one of them resolving with a title and a non-empty body** (asserted).

One thing worth knowing: `data/keywords.js` registers `COMPANION_KEYWORDS` and then
`COMPANION_STATUSES` under the same ids, so the status' terse `{n}` sentence *replaces*
the hand-written keyword prose for Ghoststep, Haunt, Web, Loose Bones and about a dozen
others. Rather than ask combat-engine to reorder, the tooltip keeps a read-only copy of
the prose and prefers it for the **keyword** variant; the **status** variant still uses
the live-stack sentence. Both readings are therefore available and neither is lost.

**Nested keywords.** Every keyword named inside a description becomes a chip (longest
match first, plurals handled, a keyword never links to itself, nothing under 3
characters). Hovering a chip opens a second-level panel — and that panel is anchored to
the **parent panel**, not to the chip, so it lands beside the first instead of on top of
it. Depth is capped at two.

**Placement.** Four candidate sides, scored: +1000 if it fits the viewport entirely,
minus the area of everything it would occlude (capped below the fits/doesn't-fit gap, so
a fitting side always wins, but occlusion decides *between* fitting sides), plus a bias
for the caller's preference. The anchor is always in the avoid set, so **the panel can
never cover the thing it describes** — that is asserted over all 202 anchors in the
harness, along with zero viewport overflow. `data-tip-avoid` extends the set: the map
can pass its own node selector and the panel will stop hiding a node's successors.

**Cards in hand.** `.mm-card` is `pointer-events:none` (the Hand hit-tests itself), so a
keyword chip on a card can never receive a `pointerover` — binding to `.mm-card__kw`
alone would have been dead code in combat. Slay the Spire does not ask you to hover
individual words anyway: it shows **every keyword on the hovered card at once, beside
it**. The tooltip listens for the Hand's `card:hover` / `card:unhover` / `card:pickup` /
`card:play` and does exactly that, placed to the right of the card so it covers neither
the card nor the enemies. `.mm-card__kw[data-kw]` delegation still works everywhere the
card *is* interactive (deck view, reward, shop).

**Timing.** 110 ms intent delay cold, 0 ms warm (within 420 ms of the last one), ~130 ms
fade in, and it disappears the instant you leave. Scrolling dismisses — **unless the
anchor still holds focus**, in which case the panel follows it, because a keyboard user
reaches an off-screen anchor by focusing it and the browser scrolls to it.

**Keyboard/AT.** Focus opens, Escape closes, `ArrowDown` opens the second level. Because
`#tooltip-layer` is `aria-hidden="true"` in `index.html`, the panel text is also mirrored
into an `aria-live="polite"` region inside `#dom-layer`, and the anchor gets
`aria-describedby`. See the asks below.

### `hud.js` — the persistent run HUD

```js
const hud = new HUD(ctx, { mount: this.root, compact: false });
hud.refresh(); hud.openDeck(); hud.openSettings(); hud.destroy();
```

Region + floor / Courage bar with a stroked number and a low-Courage pulse / Lost Things /
three Snack slots (filled ones are buttons and emit `hud:useSnack`) / the Keepsake bar
with per-chip counters / Haunt Level / seed / a deck button / a settings button. Every
chip is focusable and hoverable through the tooltip; the Keepsake chips carry their own
`data-tip`.

It reads `ctx.run` entirely through `?.` and falls back to a stand-in that is **labelled
`preview` on screen** so a mocked HUD can never be mistaken for a real one. It refreshes
on `run:start|enterNode|combatEnd|reward|update|heal|damage|gold|relic|potion|deck`,
`hud:refresh`, `settings:changed` and `scene:enter` — never per frame. Emits
`hud:useSnack` and `hud:where`.

### `deckview.js` — one viewer for every pile

```js
await openPile({ mode: 'draw', cards, ctx, host: ctx.dom });   // deck|draw|discard|exhaust|reward
const v = new DeckView({ mode: 'deck', cards, ctx });          // or inline, v.el
```

Real `CardView`s in a grid, count, text search, filters (type / cost incl. X and 4+ /
rarity / upgraded) and sort (name / cost / type / rarity). The controls stay put and the
grid scrolls. Keyboard: arrows walk the real column count, Home/End/PageUp/PageDown,
Enter picks in reward mode. **The draw pile is force-sorted inside the view**, not just
by the caller, so looking is information and never an oracle — asserted in the harness.
Cards are placed with one read pass and one write pass per layout.

### `modal.js`

`new Modal({title, subtitle, size:'sm'|'md'|'wide'|'full', dismissible, host})`,
`m.body`, `m.footer`, `await m.open()`, `m.close(result)`, plus `confirmModal({...})`.
Escape closes, the backdrop closes, focus moves in and returns to the opener, Tab is
trapped, siblings get real `inert`, and the page cannot scroll behind it. All six
behaviours are asserted.

### `settings.js` — and they all actually do something

Driven by one `SETTINGS_SPEC` table. Every flag lands by one of three routes:

1. **an attribute on `<html>`** — `data-colorblind`, `data-reduce-motion` (`1` forces on,
   `0` explicitly opts out of the OS preference), `data-large-text`, and `--anim-scale`
   (durations scale *inversely* with speed). tokens.css does the rest, so the switch
   reaches every stylesheet in the game with no component changes.
2. **a direct write** — `clock.scale = speed * (fastMode ? 1.6 : 1)`.
3. **`settings:changed`** — which audio, the hand and the combat scene already consume.

Plus the current seed, an entry field for the next run's seed (`Save.data.nextSeed`,
also emitted as `settings:seed`), restore-defaults, and a two-step "reset all progress".

`applySettings(ctx)` is called from the **`Tooltip` constructor**, because `main.js` is
not mine and `main.js` always constructs a Tooltip. That is the only reason the
accessibility flags are live on the title screen. If foundation would rather call
`applySettings(ctx)` explicitly in `main.js` after `Save.load()`, delete the two lines in
`tooltip.js` — it is idempotent either way.

### `icons.js`

118 ids in seven namespaces: `intent.*` (all 16 in `schema.js`), `status.*` (the 13
universal, the companion set, the enemy set), `res.*`, `node.*`, `type.*`, `rarity.*`,
`ui.*`. `icon(id, {size, title})` -> a `<span class="mm-icon">` sized in `em`;
`iconSvg(id)`, `iconPath(id)`, `hasIcon(id)`, `intentIcon(type)`, `statusIcon(def)`.

Everything is a filled 24x24 path with `fill-rule: evenodd` — no stroke-only geometry,
because a hairline vanishes at 16px and its silhouette is a lie. Eight ids are
**declared aliases** in `ICON_ALIASES` (Guard *is* the shield, Nerve *is* the energy orb,
a seed *is* a die...); the test collapses ids with identical path data before checking, so
an alias is never mistaken for a collision while two genuinely different drawings that
read the same still fail. **110 distinct drawings, all unique, and no pair within 40 of
2304 px of each other's 48x48 alpha bitmap.**

Specifically avoiding the two faults a previous review found on the map: `node.boss` is a
**crown**, `node.rescue` is an **open cage** — nothing alike — and `node.safe` is a **lit
candle on a saucer**, not a hazard triangle. The defend family carries its modifier as a
whole arrow standing clear of a narrowed shield rather than a notch in the outline,
because confusing `defendBuff` with `defendDebuff` is a real tactical error. Rarity is
square / circle / diamond / star, not four coloured dots.

### tokens.css — what I added

| token | value | why |
|---|---|---|
| `--paper-wash` | `ink-900 34%` | requested by frontend — the multiply wash over blueprint parchment |
| `--paper-wash-strong` | `ink-900 58%` | the heavier variant the same screens wanted |
| `--surface-1/2/3` | ink + a little flame | the three chrome panel grounds |
| `--surface-line`, `--surface-line-hi` | | chrome borders, resting and lit |
| `--scrim`, `--scrim-soft` | | modal backdrops |
| `--chip-bg` | | the ground under every HUD/deck chip |
| `--focus-ring` | `var(--flame-300)` | one name for the focus colour |
| `--type-scale` | `1` / `1.22` under `[data-large-text="1"]` | the whole `--fs-*` ramp now multiplies through this |
| `--anim-scale` | `1` | every `--t-*` is `calc(base * var(--anim-scale))`, so `Save.settings.speed` reaches all CSS motion |
| `--hud-h`, `--tip-max-w` (`34ch`), `--tip-gap` | | chrome geometry, in `ch` so largeText widens rather than clips |

Changed: **`--card-w` -> `clamp(150px, min(13.5vw, 27vh), 224px)`** as card-feel formally
requested (`card.css`'s local clamp is now a no-op), and **`--text-lo` `#8b839a` ->
`#9a92a8`** — measured from rendered pixels the old value landed at **4.08:1** on the HUD
chip ground, under WCAG AA. The new one clears 4.5:1 on every chrome surface and is still
clearly below `--text-mid`. `--good-300/500` and `--warn-300/500` were already present.

**Colour audit.** Every colour in `game/src/**/*.css` already traces to a token — the
scene-local ramps (`--arcane-*`, `--brass-*`, `--wood-*`, `--cork-*`, `--kid-*`) are all
`color-mix()` over tokens, which is exactly right. Two literals remain and are not mine:
`scenes/map.css` uses `#fff` in 8 places (**map**), and `ui/card.css` still carries the
now-dead fallback `var(--good-300, #74e08a)` (**card-feel**). `cardart.js`'s `PIGMENT`
table is illustration paint and correctly out of scope.

### Colourblind palettes

Switched by `data-colorblind` on `<html>`. Only hue assignments change — every component
keeps its token names, so one attribute repaints the whole game.

- **Protanopia / deuteranopia** (red-green): the safe axis is **blue <-> orange**.
  Attack `#ef8b32` vs Skill `#56a4ff`; the threat ramp becomes a deep orange-brown so
  buff (`--good-300` -> a *light* blue `#9ad6ff`) and debuff (`--threat-300` -> a *dark*
  orange `#e08a2e`) separate by luminance as well as hue. Courage and Nerve lift out of
  the red hole protans fall into.
- **Tritanopia** (blue-yellow): the safe axis is **red <-> teal**, and gold moves off
  yellow entirely — Nerve becomes coral, rare becomes warm pink.
- **The rarity ladder** in every mode is four separated luminance steps on the safe axis,
  with curse and status pushed darker so they never collide with basic or uncommon.

Colour is never the only channel regardless: card frames differ by material and crest,
intents by frame shape, icons by silhouette, statuses by glyph, and the settings toggles
spell out "On"/"Off" in words. The harness asserts all three critical pairs stay distinct
under every palette.

### What I need from other agents

1. **foundation — `game/index.html`.** `#tooltip-layer` carries `aria-hidden="true"`.
   Tooltips are frequently the only place a rule is written down, so that hides real
   content from screen readers. Please **remove `aria-hidden` from `#tooltip-layer`**
   (keep it on `#fx-layer`). Until then I mirror every panel into an `aria-live` region
   inside `#dom-layer`, which works but announces twice as much as it should.
2. **foundation — optional.** If you would rather own it, call `applySettings(ctx)` in
   `main.js` right after `Save.load()`; I will drop the call from `tooltip.js`.
3. **map — one line.** Your node tooltips can now stop covering the nodes: put
   `data-tip-node="<NodeType>"` and `data-tip-avoid="<your node selector>"` on each node
   and delete your own tooltip renderer. The placement scorer will keep the panel off
   both the node and its successors.
4. **combat-scene.** `ctx.tooltip.show()` is real now and appends to `ctx.tipLayer`, so
   your probe should defer automatically. Two things would make it better: call
   `ctx.tooltip.provide('enemy', ...)` and `provide('card', ...)` at scene enter, and put
   `data-tip-status` / `data-tip-stacks` / `data-tip-owner` on your status pills so they
   get the "...and here is what it does at 3 stacks, and what it will be next turn" copy
   for free.
5. **combat-engine.** Consider registering `COMPANION_STATUSES` *before*
   `COMPANION_KEYWORDS` in `data/keywords.js`, so the hand-written keyword prose wins for
   ids that are both. I work around it read-only today (see above).
6. **frontend — heads-up, not a request.** `--card-w` is responsive as of now.
   `select.js` and `gameover.js` size CardView slots from it directly, so their slot maths
   will be a few px out at small viewports. I did not touch either file.

### Not mine, but worth someone looking

Every scene measures **17-35 fps** through `tools/shot.py` on this machine, including the
title screen, which has almost nothing on it. I A/B'd combat with my `tooltip.js` stashed
back to the 6-line stub: **18 fps with the stub, 28 fps with mine**, so this is not the
chrome. `tests/chrome/index.html`, which has no WebGL, runs at **61**. That points at the
shared renderer/atmosphere layer rather than at any one scene.

## 2026-08-20 — map agent, round 2 (finishing the blueprint pass)

Picking up a round-2 map pass that a rate limit cut short. Everything below was
re-measured against the live build; nothing is taken on trust from the previous pass.

### Verified as already fixed (measured, not assumed)

- **Clicking works.** `setPointerCapture` is inside the drag branch. A click on a legal
  mark takes `visited` 0 to 1, `walked` edges 0 to 1, and the walked route inks.
- **Branching.** 64 nodes, 5 legal at the door on seed 42 / foyer; 115 route edges.
- **Dimming exists.** At the door `{legal 5, far 59, cold 0}`; after one step
  `{legal 2, far 46, cold 15}`; after two `{legal 2, far 36, cold 24}`.
- **Zoom.** Fit is now **0.7584x**, and the marks counter-scale (`--mn-k` 1.14), so a mark's
  effective scale on screen is **0.864x** — above the 0.85 bar. Wheel is ~1.22x per notch.

**On the "is-far too subtle at the door" question:** measured, non-legal ink sits at 48%
of the pencil colour with the paper clearing at 50%, while the five legal marks carry a
double amber pencil ring, a breathing warm clearing and a two-stop glow. Amber is the only
warm thing on a blue-and-parchment sheet. `shots/map2_start.png` — the five read at a
glance out of sixty-four. Left as it is; the plan stays legible enough to route two rows
ahead, which is the other half of section 5.

### What I changed

1. **Safe Room glyph.** No longer a hazard triangle (predecessor fixed that), but its lamp
   was a solid disc, and at 20px that disc plus the two chairback posts collapsed into
   *a dark mass with points on top* — the boss silhouette. Only the boss may be a solid
   mass. The lamp is now an outlined lantern with a wick spark and six rays; the fort stays
   an open, airy mark. `shots/m2_sil2_zoom.png` — nine glyphs at 52/30/20px in greyscale,
   all nine distinct by outline alone.
2. **Boss / Rescue / Curiosity / Unsurveyed / Scuffle** — verified distinct on the same
   sheet. The boss is the only filled mass, sits in a 156px box against 86px, wears a BOSS
   tag, and is never dimmed below 88% ink. `shots/m2_crop_boss.png`.
3. **Hover card placement.** Was: left, else right — and "right" is where a room's onward
   edges go, so every row-one node (all of which are hard against the west edge) got a card
   over its own fan. Now: **left, then above, then below, then right**. Measured per side: a
   mid-wing node places `left` and covers 8 marks, all of them on rows already behind you;
   the boss places `left` over rows 8-10; a row-one node places `above` and covers 4. It
   never covers the node it describes.
4. **Hover card staleness.** Hovering a node you have just walked into now reads
   *"you are standing here"*, not *"you may go here"* (`_refreshTip` on every state sync).
5. **Keyboard ring.** The focused mark wears amber draughtsman's crop marks at the corners
   of its box, in addition to the ring — a different *shape*, not a shade.
   `shots/m2_kbd2_zoom.png`. Arms lengthened from 20% to 25% of the box for legibility at
   fit zoom.
6. **Header counters** reconciled: `Wing 1 of 17 - at the door - Boss: The Butler`, becoming
   `Wing 1 of 17 - row 2 of 13 - Boss: The Butler` once you are underway — the same
   two-level address the hover card uses ("Row 2 of 13 in this wing").
7. **`@media (prefers-reduced-motion: reduce)`** present and parsed (5 rules, confirmed via
   `document.styleSheets`), and extended to cover the new entrance. The in-game
   `reduceMotion` path still lands on `map-screen is-still is-drawn` with every
   `animation-name: none`.
8. **Room-name labels** were being crossed by their own pencil ring and by the next lane's
   ink: moved below the box, 19px to 16.5px, and the hovered / keyboard / current mark now
   wins the stack. Lane band widened from 0.600 to 0.640 of the sheet for a little more air.
9. **Per-frame cost.** The two 1280px lamp layers are blend-mode composited; their transform
   is now quantised and skipped when nothing visible changed, instead of a fresh template
   string and two style writes every frame.

### The entrance — this one was not what it looked like

The review said the ink-draw-on was "effectively instant": 29,085 changed pixels on the
first frame delta then 0-217 for the remaining eleven. That was true, and the cause was not
the animation's timing.

Measured on a cold deep-link entry: **one 2,564ms frame gap** immediately after the map
screen is built, then 372ms, then smooth. Entering from another scene (so the engine is
already warm) it is **667ms of build followed by a 389ms stall and a 303ms stall**. The old
entrance was 115 simultaneous `stroke-dashoffset` animations plus 64 node stamps on a
2030x1010 SVG — every frame of that forces a full re-raster of the ink layer, and the
compositor simply stopped producing frames. An 800ms animation that spends ~690ms frozen is
not an animation.

Also worth recording for anyone else measuring animation here: `page.evaluate` **awaits a
returned promise**, so `--steps "js:scene._drawOn()"` blocks until the whole entrance is
over and every strip frame lands on the end state. Use `js:(()=>{ ...; return 1 })()`. And a
freshly `will-change`-promoted layer's clip is missing from the *first* capture after
promotion.

What replaced it:

- **One composited sweep.** `clip-path: inset()` on `.map-ink` and `.map-nodes` together
  (so an edge and the room it runs into are inked by the same pass of the pen), with a
  travelling wet-pencil edge — three animations total, not 179. 0.10s delay + 0.70s =
  **800ms**, `--ease-soft`. `--ease-out` (`cubic-bezier(.16,1,.3,1)`) was tried first and is
  ~70% done by 200ms, which is the same lie in a new costume.
- **Armed state.** The sheet is painted and the marks are laid out but held at 2% ink before
  the sweep. Clipping them away instead skipped their raster and moved the stall into the
  middle of the animation (244ms gap, measured); rastering them at 2% moved it before.
- **The sweep waits for the screen.** `scenes.go` awaits `enter()` and lifts the veil
  *after* it, so a sweep started in `enter()` spends its first third behind a black screen.
  `_whenVisible()` waits for `scenes.busy` to clear and then for three consecutive frames
  under 40ms, capped at 2.5s of wall clock.

Result, sampled on rAF during a cold entry: clip-path 100% to 85% to 61% to 3% to -3% across
**822ms**, worst frame gap **149ms** (was: one gap of 491ms inside the animation, and 2,564ms
on the cold path). Deterministic capture at 0 / 200 / 400 / 600 / 800ms:
`shots/map2_sweep_strip.png` — blank sheet, first lane, three-quarters with the wet edge
visible, boss arriving, complete.

### Node composition — varied, confirmed

`generateRegionMap` picks a weighted **character** for the wing (plain / market / haunted /
hoard / quiet / strange / derelict) that leans the recipe, on top of a jittered base share.
All seven characters appeared across the 24 audited maps. Counts across those 24
(min / max / mean):

| type | min | max | mean |
|---|---|---|---|
| Scuffle | 17 | 32 | 26.2 |
| Curiosity | 8 | 13 | 11.0 |
| Big Scare | 4 | 10 | 6.8 |
| Unsurveyed | 3 | 10 | 6.2 |
| Safe Room | 4 | 8 | 5.4 |
| Treasure | 2 | 6 | 4.0 |
| Lost Things | 1 | 3 | 2.5 |
| Rescue | 1 | 1 | 1.0 |
| Boss | 1 | 1 | 1.0 |

Rescue is deliberately exactly one per region — there is one Companion per wing — and it is
zero once that Companion is already rescued (`opts.rescued`). Node totals 54-72.

### Edge crossings — 24 maps, zero

6 regions (foyer, greenhouse, lampworks, crypt, hedge-maze, heart) x 4 seeds (42, 7, 1337,
2026), re-run **after** the lane-band widening. Two tests per map: proper segment
intersection on centre-to-centre lines, and the same on the actual wobbled polylines the
scene draws (`inkLine`, trimmed at the real node radii, 9-12 segments each). Pairs sharing
an endpoint excluded.

**straight crossings 0 - drawn crossings 0 - 2,584 edges over 24 maps.** Mean out-degree
1.73-1.82. The staircase-plus-skip-passage construction still holds at the higher branching
factor, and the per-row depth jitter plus sub-half-lane lane jitter keeps it true on the
paper and not only in the graph.

### fps — do not trust a single number today

Four other agents were building while I measured, and the readings are not usable. Same
scene, same seed, three consecutive runs at 1920x1080: **8, 30, 35**. At 1600x900: 44-61.
An A/B that hid the lamp layers, then the grain, then the shade, then the whole map scene
produced 36 / 39 / 40 / 29 / **2** — hiding the entire map made it "slower", so the signal
is external contention, not the map. GL is `ANGLE (Intel UHD Graphics, D3D11)`. Best
observed on the map: **61 fps at 1100x620, 49 at 1600x900**. Needs re-measuring in isolation.

### Known, not fixed

- The region banner overlaps the top-left corner of the plan, so a row-one room's name can
  fall behind it. The banner is `pointer-events: none`, so it never eats a click, and the
  mark's ring stays visible below it — but on tall banners (three-line region names) it is
  close. Wants either a shorter banner or a top margin in the lane band.
- The boss's room name can run past the sheet's right border rule at fit zoom
  ("RECEIVING CHAMBER"). It sits over paper, so it stays readable.
- Two files of mine (`map.css`, `mapgen.js`) briefly went CRLF via a scripted edit and were
  committed that way by another agent's `commit -a`; I have converted them back to LF, so
  the next commit will show a whole-file diff on both. Content-wise the only real changes
  are the ones listed above.

### Screenshots

`shots/map2_start.png` (the sheet at the door), `map2_tip_left.png`, `map2_tip_row0.png`
(hover card above a row-one room, its onward fan clear), `map2_walked.png` (two rooms in —
inked route, you-are-here ring, tick stamps, 24 cold marks), `map2_sweep_strip.png`
(the entrance at 0/200/400/600/800ms), `m2_sil2_zoom.png` (nine glyphs, greyscale,
52/30/20px), `m2_kbd2_zoom.png` (keyboard crop marks), `m2_crop_boss.png`,
`m2_r_heart.png`, `m2_r_lampworks.png`, `m2_r_greenhouse.png`.

---

## 2026-08-20 — performance: frame budget on real hardware

Target GPU for every number here: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60)
Direct3D11 vs_5_0 ps_5_0, D3D11)` — real hardware, integrated. Not SwiftShader.
`tools/shot.py` prints the renderer string on every run and flags software
rasterisation, so this can always be checked.

### 0. How this was measured, and one trap

`EXT_disjoint_timer_query_webgl2` is available on this stack and is the only
truthful timer for it. **`gl.finish()` is not a fence under ANGLE** — the commands
sit in Chrome's GPU process, and timing `performance.now()` around `finish()`
reported **0.217 ms for a frame the timer queries measured at 24.1 ms**. Any
profiling built on `finish()` here is measuring nothing.

The converse trap: timer queries are only trustworthy with the clock stopped. In a
live page they pick up the compositor's work for neighbouring frames (canvas
upscale blit, DOM layers) and reported 18.8 ms for a frame that measured 4.4 ms
under a controlled probe. So: **timer queries for the per-pass bisection, rAF
interval for anything closed-loop.** The tier calibration uses rAF for that reason.

New tools: `tools/gpuprof.py` (per-pass GPU cost bisection) and
`tools/lookmetrics.py` (17-region capture + the round-2 look metrics, so a perf
change can be proved not to have flattened the lighting).

### 1. Where the frame actually went

Combat, 1600x900, whole frame 24.14 ms => 41 fps ceiling, 34-35 fps observed.
Only 14 draw calls and 132 triangles, so this is 100% fragment cost.

| item | ms | note |
|---|---|---|
| **near frame quads** | **4.21** | 4 full-viewport quads, see section 2 |
| grade pass | 4.50 | |
| bloom pass | 2.64 | |
| RenderPass + OutputPass blits | 2.23 | |
| far wall | 2.15 | |
| floor | 1.78 | |
| ceiling | 1.57 | |
| side walls | 1.13 | |
| props | 0.59 | |
| shafts / flames / contact shadows / particles | ~0.0 | each below noise |

**The post chain is bandwidth-bound, not ALU-bound.** Zeroing `uHalation`,
`uDirt`, `uGrain` and `uAberration` one at a time each moved the grade pass by
less than the measurement noise (-0.75 to +0.22 ms, i.e. nothing). The cost is
reading and writing a 1600x900 RGBA16F target. That single fact set the whole
strategy: **remove full-resolution passes and remove pixels, do not micro-optimise
shader arithmetic.**

### 2. The near frame was drawing the whole screen four times, for nothing

`backdrop.js` built four `PlaneGeometry(7.4, 4.2)` quads at z = 7.2, about 2.2 m
from the eye, with `depthTest: false` and `frustumCulled = false`. Each one
rasterised the entire viewport and ran `FRAME_FRAG`, which opens with an `mmFbm3`
before it can reach its `discard`.

A frozen-clock screenshot bisection (toggle one quad, re-render, diff) showed:

| quad | mode | visible pixels |
|---|---|---|
| 0 | left drape | **none — 0.00%** |
| 1 | right drape | **none — 0.00%** |
| 2 | top lintel | 37.99%, rows 0-462 |
| 3 | clutter band | **none — 0.00%** |

Three of the four were provably invisible in the frustum and were still costing a
full-screen noise shader each.

Each mode only ever marks a narrow band of its own quad, and those bands are
analytically bounded (`mmFbm3 <= 0.9625`, `mmRidge <= 0.9375`). The geometry is now
cropped to that band with the uv attribute remapped so the shader still sees its
original 0..1 range — `FRAME_FRAG` is untouched, and the crop only removes
fragments whose mask was provably zero. Frustum culling is now on, so in most
camera rigs the three invisible quads are not submitted at all.

Verified identical: frames contribution before 26.85 mean / 37.61% / bbox
(0,0,1599,467), after 27.39 mean / 37.98% / bbox (0,0,1599,465) — the residual is
flame flicker between runs. **4.21 ms -> 0.69 ms.**

### 3. Four tiny buffer uploads were stalling the pipeline for 8.5 ms a frame

This one only shows up with the clock running, so a clock-stopped per-pass profile
misses it entirely. Stubbing `Backdrop.syncFlames()` took the median live frame
from **25.0 ms to 16.5 ms**.

`syncFlames` sets `needsUpdate = true` on four `InstancedBufferAttribute`s every
frame. `MAX_FLAMES` is 10, so that is 90 floats of actual data. three defaults
BufferAttributes to `StaticDrawUsage`; ANGLE backs GL_STATIC_DRAW with a D3D11
DEFAULT-usage buffer, and `bufferSubData` on one of those is an
`UpdateSubresource` that must wait for every queued draw still reading it. Four
of them per frame is four full pipeline syncs.

Two fixes, both in `backdrop.js`:

* `setUsage(THREE.DynamicDrawUsage)` on the flame attributes (and on the actor
  shadow attributes, which have the same per-frame update pattern) so the driver
  renames the buffer instead of syncing.
* Dirty-check each array. Only `aParam.y` (the flicker) changes on a normal frame
  — position, colour and seed are fixed per region and were being re-uploaded
  60 times a second for nothing.

**This was the single largest win in the pass** and it is invisible to any
GPU-pass-level profile. Worth remembering for the next one.

### 4. OutputPass folded into the grade

`renderer.toneMapping` is only applied by three when a material renders straight to
the canvas (`_currentRenderTarget === null`), which is why OutputPass exists at
all: ACES filmic + sRGB encode and nothing else, at full resolution.

The grade shader now does both itself under `#define MM_TONEMAP` — the same three
maths in the same order — and OutputPass is gone. That deletes a whole
full-resolution read+write from a chain that is bandwidth-bound. The warm-up's
phase B still works: with bloom and grade disabled, RenderPass becomes the last
enabled pass and goes straight to the canvas, where three applies its own tone map,
so the early picture is still correctly exposed.

### 5. The composer never had a pixel ratio (latent bug on any HiDPI display)

`EffectComposer` captures `renderer.getPixelRatio()` **at construction** and
`setSize()` never updates it. `Stage` built the composer before the first
`resize()`, so the composer's ratio was pinned at 1 forever while
`renderer.setPixelRatio(dpr)` went to 2 on a retina display: the scene rendered
into a 1x target and was blitted to a 2x framebuffer. Blurry, and silent. `resize()`
now drives `composer.setPixelRatio()` explicitly alongside the renderer's.

Related: the old `resize()` honoured `devicePixelRatio` up to 2, i.e. **4x the
fragments** on a HiDPI laptop, for a soft procedural backdrop sitting behind DOM
text that gains nothing from it. `dprCap` is now a tier property.

### 6. Quality tiers

`renderer.js` exports `QUALITY_TIERS` and `detectTier()`.

| | renderScale | dprCap | bloomScale | halTaps | dirt | particles |
|---|---|---|---|---|---|---|
| high | 1.00 | 2.00 | 0.50 | 8 | on | 1500 |
| medium | 0.80 | 1.50 | 0.50 | 6 | on | 1100 |
| low | 0.62 | 1.00 | 0.25 | 4 | off | 650 |

`renderScale` scales the WebGL drawing buffer only; the UI is DOM and stays
pixel-crisp at every tier. Measured response at 1600x900 (combat, whole frame):
scale 1.00 -> 22.9 ms, 0.75 -> 9.66 ms, 0.50 -> 4.42 ms. Superlinear, because the
intermediate RGBA16F targets stop fitting in cache.

**Selection**: renderer string + requested pixel count picks a starting tier
before anything is compiled (SwiftShader/llvmpipe -> low; discrete NVIDIA/AMD/Apple
-> high; Intel/Mali/Adreno/PowerVR -> medium; > 2.6 Mpx drops one tier). Then,
*after* warm-up so the frames being measured are the frames the player gets,
`_calibrate()` measures the median rAF interval and trims a continuous
`_scaleAdjust` (0.55..1.0) until the frame fits 17.2 ms, keeping a reduction only
if it actually paid. Only `_scaleAdjust` moves there — changing tier would
recompile the grade in the first visible second, which is the exact long task the
warm-up exists to avoid.

**Manual override**: `stage.setTier('high'|'medium'|'low'|'auto')`, persisted to
`Save.settings.quality`. Verified across a reload. NOTE: `quality` is not in the
`DEFAULT.settings` block in `core/save.js` — it round-trips correctly because
`save()` serialises the whole object and `deepMerge` copies unknown keys back, but
it should be added there so an options screen has something to bind to.

Particle budget is a draw-range change, never a buffer rebuild, so switching tier
cannot relink a shader. BURST particles were moved to the FRONT of the buffer so
trimming the tail can only ever trim ambient drift, and the ambient type mix is now
interleaved with a golden-ratio sequence rather than laid down in contiguous
blocks — with blocks, a 73% budget kept 1100 dust motes and dropped every wisp and
ember, which are the whole point of the mix.

### 7. Results

fps, one run at a time, nothing else running:

| scene | 1600x900 before | after | 1920x1080 before | after |
|---|---|---|---|---|
| title | 29 | **61** | 14 | **61** |
| combat | 35 | **61** | 17 | **61** |
| clubhouse | 35 | **61** | 16 | **61** |
| map | 47 | **61** | 21 | **61** |

The other six scenes (select, reward, event, shop, rest, gameover) are also 61 at
1600x900, no JS errors.

Per-pass, combat at 1600x900 (timer queries, clock stopped; after = medium tier,
1280x720 buffer):

| item | before | after |
|---|---|---|
| **whole frame** | **24.14** | **14.01** |
| scene render | 14.71 | 7.07 |
| pass plumbing (RenderPass + OutputPass blits) | 2.23 | 0.03 |
| near frame quads | 4.21 | 0.69 |
| far wall | 2.15 | 1.56 |
| floor | 1.78 | 1.37 |
| ceiling | 1.57 | 1.41 |
| side walls | 1.13 | 0.86 |
| props | 0.59 | 0.63 |

At 1920x1080 the whole frame went **46.46 ms -> 17.47 ms** and the scene render
**29.12 ms -> 10.56 ms**. (Isolated bloom/grade figures are not additive — disabling
a pass also removes an intermediate buffer read+write — so the whole-frame number
is the one to trust.)

### 8. The look held

17-region showcase at 1600x900 via `tools/lookmetrics.py`, same methodology as the
round-2 pass (Rec.709 luma on 8-bit sRGB; chroma = mean max-min; cross-correlation
= Pearson on a brightness- and contrast-normalised 128x72 luma downsample).

| | round 2 | now (auto = medium) | now (low) | target |
|---|---|---|---|---|
| mid-tones 64-160 | 22.7% | **24.9%** | 24.7% | >= 20% |
| median luma | 33.7 | **38.6** | 38.5 | >= 28 |
| mean chroma | 52.4 | **54.3** | 53.9 | >= 42 |
| region cross-correlation | 0.296 | **0.30** | 0.30 | < 0.35 |
| mean luma | 53.8 | 57.3 | 57.3 | |
| p95 luma | 182.0 | 183.6 | 183.1 | |
| highlights > L192 | 4.2% | 4.4% | 4.4% | |
| shadows < L32 | 48.2% | 43.5% | 43.2% | |

Every target met, at the low tier as well as the auto one — the metrics are
statistical over pixels, and nothing here turned a light off. Contact sheets:
`shots/lm_med_*.png`, `shots/lm_low_*.png`.

### 9. Long tasks

| scene | longest | WebGL warm-up | longest with `#dom-layer` hidden |
|---|---|---|---|
| title | **3435 ms** | 6318 ms | **123 ms** (warm-up 215 ms) |
| combat | 437 ms | 199 ms | 265 ms |
| clubhouse | 73 ms | 205 ms | 74 ms |
| map | 325 ms | 209 ms | 264 ms |

WebGL warm-up is **194-215 ms** on every scene (round 2 measured 2599-2949 ms under
SwiftShader), and the longest WebGL-attributable long task is ~123 ms. Under the
500 ms target everywhere.

Title's 3435 ms is **entirely DOM** and is what stretches its warm-up to 6.3 s — the
warm-up yields with `setTimeout(0)` between compiles, and each yield has to wait
for the DOM task in front of it. See section 10.

### 10. Not mine to fix — needed from other owners

**a) `scenes/title.js` + `title.css`: the 3.4 s stall.** Cause isolated by
disabling one thing at a time:

| variant | longest long task |
|---|---|
| baseline | 3257 ms |
| `filter:none` on `.ms-win-bloom ellipse` + `.ms-doorglow` | **429 ms** |
| all `.scene--title` animations off | **72 ms** |
| `.ti-house` hidden | **77 ms** |
| `.ti-fog`, `.ti-clouds` hidden | 3267 ms (no change) |

`title.css:107-111` — `.ms-win-bloom ellipse { filter: blur(13px); animation:
ti-flicker 4.1s }` and `.ms-doorglow { filter: blur(15px); animation: ti-flicker
3.1s }`. `ti-flicker` only animates `opacity`, which would normally be
compositor-only — but these are SVG child elements, which cannot be promoted to
their own layer, so the browser re-runs a 13-15 px blur over a large SVG surface on
the main thread every frame, once per lit window. Fix: move the glow into a sibling
HTML element that carries the blur statically and animate its opacity there
(`will-change: opacity`), or bake the glow as a static radial-gradient so the
opacity animation is compositor-only. Keep the animation on `.ms-win-lit path`,
which has no filter and is cheap.

**b) `scenes/title.js:171` — `ctx.atmosphere?.setMood?.('foyer')`.** There is a
fully authored `title` region in `fx/atmosphere.js:580` (exterior night, moon and
halo, roofline with window spill, candle pools) and nothing uses it.

**c) `title.css:13` `.ti-sky` — I did NOT make it transparent, deliberately.**
Its third background layer is an opaque `linear-gradient(180deg, var(--ink-900) ...)`
covering the viewport, so the WebGL layer behind it is 100% hidden. I rendered the
proposed fix (transparent sky + `setMood('title')`, `shots/ti_fix.png`) and it looks
**worse** than the current screen: the WebGL exterior's gold horizon fights the
purple-night SVG art, and you get a second, duplicate moon. The SVG title art is
good and is clearly the intended design. So the right fix for the title is the other
option — don't run the 3D stage — see (d).

**d) Nine of the ten scenes render a 3D frame nobody sees.** Measured by
screenshotting each scene with and without `#gl` displayed and diffing:

| scene | canvas pixels actually visible |
|---|---|
| combat | 75.68% |
| title | 3.43% |
| gameover | 1.06% |
| shop | 0.82% |
| select | 0.57% |
| rest | 0.07% |
| clubhouse | 0.06% |
| event | 0.01% |
| map | **0.00%** |
| reward | **0.00%** |

(The sub-1% figures are animation noise between two page loads, not real canvas.)
`Stage.setPaused(true/false)` is now available for this: it skips the composer but
still emits one frame every 150 ms, because skipping the draw entirely can leave the
compositor with no damage to present and a page that never presents can have its rAF
starved — observed once as a 2.5 s stall on `reward`, which would freeze the clock
that drives the DOM animations too. Verified with the keepalive: pause and resume on
map / reward / clubhouse hold a 16.6-17.0 ms median with no dropped frames.

Each occluded scene needs `ctx.stage.setPaused(true)` on enter and
`setPaused(false)` on exit. Not urgent for the frame budget — everything is at 61
already — but it is most of the GPU work in the build being thrown away, and it is
what buys headroom on hardware weaker than this.

**e) `core/save.js`** — add `quality: 'auto'` to the `DEFAULT.settings` block, per
section 6.

### Screenshots

`shots/fin_*_900.png` / `shots/fin_*_1080.png` (final fps sweep),
`shots/lm_med_*.png` and `shots/lm_low_*.png` (17-region look metrics, medium and
low tiers), `shots/ti_fix.png` (the rejected transparent-sky title),
`shots/frz_a.png` / `frz_b.png` (frozen-clock near-frame bisection).


---

## 2026-08-20 — seam audit (silent no-ops at module joins)

Every module passed its own harness while doing nothing at the join. Three were
reported; the static checker and a new runtime guard found nine more of the same
class. CONTRACTS rules 8 and 9 exist because of these.

### The three reported bugs

**1. Haunt dealt no damage, ever.** `keywords.js` called `ctx.loseHp?.(ctx.actor, n)`
on a hook payload that had no `loseHp`; the optional chain swallowed it and the
following `ctx.consume?.()` succeeded, so Haunt visibly decayed and never bit. It
also read `ctx.slowDissipation`, which no dispatch has ever carried.
Fixed on **both** sides: `Hooks._payload()` now provides `loseHp`, `heal`,
`applyStatus`, `removeStatus`, `count`, `has` and `player` (statuses legitimately
need them, and the list is now documented as a contract at the top of `hooks.js`),
and Haunt calls them directly. Permanent Haunting is read off the player's status.

There was a **third** independent cause. Nothing in the companion module graph
imported `data/companions/keywords.js`, so `COMPANION_STATUSES` were registered only
by `loadContentRegistries()`. Any consumer that did not call it — the balance sim,
any headless harness — got the placeholder StatusDef for `haunt`, which has no
`hooks`, so Haunt did nothing there even with the payload fixed. `data/cards.js` now
imports the module eagerly.

**2. "Ignores Guard" did not.** `marmalade.js:313` and `:678` passed
`{ pierceBlock: true }`; `damage.js` reads `o.pierce || o.ignoreBlock`. Both now pass
`pierce`.

**3. Fourteen scene audio call sites were spelled `domain/name`.** All 14 corrected
to `domain:name`, and six of them (`ui:begin`, `ui:denied`, `ui:tick`, `ui:snuff`,
`card:pick`, `map:step`) named cues that did not exist at all — they are now real
entries in `audio/sfx.js ALIASES`, pointing at the nearest cue, with a note to give
them bespoke cues later. `resolveId()` keeps normalising `/` to `:` so the separator
can never cost a sound again. `Audio.applySettings()` also now exists —
`scenes/title.js` had always called `ctx.audio?.applySettings?.()` into thin air.

### The checker — `tests/seams/check.py`

Static scan of `game/src/**/*.js`. It reads its surfaces **out of the source** —
`ctxFor()`, `enemyCtx()`, `Hooks._payload()`, the `CUES`/`ALIASES` tables, the status
and keyword registries — so it cannot drift from the code it checks. Eight checks:
`OPTIONAL-CALL`, `UNKNOWN-OPTION`, `UNKNOWN-SFX`, `SFX-SEPARATOR`, `UNKNOWN-ID`,
`UNKNOWN-METHOD`, `UNKNOWN-EVENT-FIELD`, `INERT-STATUS`. First run:
**1519 call sites checked, 103 problems**. Now **1556 checked, 7 problems**, and all
7 are in files this audit does not own (see *Requests* below).

Everything else it found, and what happened to it:

* 72 `?.` calls on contract APIs, de-optionalised (65 in `data/**`, 7 unowned).
* `{redirected:true}` (governess, nursery) and `{pure:true, fromHead:id}`
  (sleeping-quarters hydra) — option keys nothing reads. Now `cause:` and
  `skipModifiers:`. The hydra head's death damage was being run through Strength /
  Weak / Vulnerable when the author asked for raw damage; it is now raw.
* `empowered` and `predators-patience` read `ctx.isAttack`; the payload carries
  `kind`. Empowered added **zero** damage. Fixed.
* `ghoststep` read `ctx.fromAttack` (nonexistent) from `modifyDamageTaken`. Moved to
  `onIncomingHit`, which is the shape `damage.js` step 6b documents for it — and
  which matters: `modifyDamageTaken` also runs inside `computeDamage()` for intent
  previews, so the "fixed" reducer would have eaten a stack on every re-render.
* `play-dead` was written `(amt, ctx)`; `onIncomingHit` is a void hook with a mutable
  payload, so `ctx` was undefined and it threw on its first line. Rewritten.
* `not-dead-yet` called `count` / `spend` / `survive`, none of which exist. Now uses
  `setHp()` and the `_util` resource helpers.
* `nope` called `consume()` and returned false; `onDebuffIncoming` vetoes with
  `prevent()`. It never refused a debuff. Fixed.
* `tripwire-tail`, `zoomies-discount`, `land-discount`, `elastic-legs`,
  `ignore-heavy-feet` were applied but never registered. All registered. The four
  "your next Trick costs less" statuses (including the two that *were* registered,
  `next-trick-discount` / `next-attack-discount`) had no hook and no reader — they
  were tooltips attached to nothing. They now have a `modifyCardCost` hook.
  NOTE for combat-engine: `costOf()` returns early for any card with a
  `dynamicCost`, so these discounts cannot reach such a card. Left as-is.
* Marmalade's Poltercat read `ev.target` / `ev.targetIsPlayer` off the `status`
  event, which carries `actorId` / `delta`. Wink's Read resolution, Set triggers and
  two Powers read `ev.enemy` / `ev.family` / `ev.changed` off `intent` and `death`,
  which carry `enemyId` / `intent.family` / `previous` / `actorId`. None of it ever
  fired. All rewritten against the real payloads.
* Tripwire Tail was a raw `engine.on('damage')` listener that also leaked; it is now
  an `onAttacked` hook on the status.

### The runtime guard — `game/src/combat/strict.js`

In dev, `ctxFor()`, `enemyCtx()` and every hook payload are wrapped in a Proxy that
**throws** on a member the surface does not define. Armed by `?debug`, `#debug`,
hostname `localhost` / `127.0.0.1`, or `new CombatEngine({strictCtx:true})`; forced
off with `?strictCtx=0`.

Cost: the flag is resolved **once** in the constructor and `guardFactory()` returns
either the wrapper or the identity function, so a shipped build has no branch and no
allocation per property read — one Proxy per ctx construction while armed, next to an
object literal that was already being allocated at that exact spot.

Two escape hatches, both explicit and both documented in `strict.js`:
`CTX_SOFT_KEYS` (language internals like `then`, plus sanctioned
`if (c.removeDebuff)` feature detection, plus `enemyCtx({...extra})` fields) and
`HOOK_SOFT_FIELDS` (a field *some* dispatch carries returns undefined — that
variadicity is deliberate; a field *no* dispatch has ever carried throws, which is
exactly what `isAttack` and `fromAttack` were).

It paid for itself immediately: the cards suite went red on `wink/forked-future`
(`c.forkFuture?.()`) and `wink/no-such-thing-as-random` (`c.controlEnemyChoice?.()`)
— two rare cards calling engine features that were never built, invisible to the
static checker because those names are on no known surface. Both now exist in
`combat/intents.js`. **Design note for the Wink owner:** *No Such Thing as Random*
promises "you choose instead", and there is no player prompt inside the synchronous
planning path, so what it does instead is remove the roll — the enemy's plan is
revealed to maximum depth and locked, so it stops being re-derived. *Forked Future*
asks its choice at cast time through the existing choice broker rather than after the
current Intent resolves. Both are deviations; both beat a card that does nothing.

### Proof

`tests/seams/proof.py` → **52 passed, 0 failed**. Real `CombatEngine`, real Marmalade
card defs, real Foyer enemy defs, guard armed, nothing mocked (rule 9). It asserts
that enemy Courage actually drops from Haunt, that Through the Wall's 9 lands in full
through 5 Guard, that Ghoststep is not consumed by ten intent re-renders, and so on.
`tests/seams/simprobe.html` replicates the balance sim's deck and greedy AI to answer
"does the sim ever touch these mechanics" — before the registry fix: 174 Boo! plays,
348 Haunt applied, **0 ticks**; after: **261 ticks, 424 Courage**.

Existing suites stay green: combat 478/0, cards 445 / 0 errors, enemies 37 / 0.
The real game was driven through several turns of card plays and enemy turns with the
guard armed, no console errors (`shots/seamfinal.png`).

### Balance re-measure (`tests/critic-design/sim.py 60`, unedited, no retuning)

| encounter | win% | losses | turns (mean) | damage taken |
|---|---|---|---|---|
| foyer-1 | 100 -> 100 | 0 -> 0 | 3.02 -> 3.00 | 0.62 -> 0.62 |
| foyer-2 | 100 -> 100 | 0 -> 0 | 5.07 -> 4.83 | 2.55 -> 2.45 |
| foyer-14 | 100 -> 100 | 0 -> 0 | 9.52 -> 9.28 | 35.90 -> 36.18 |
| foyer elite (Grand Coatcheck) | **71.7 -> 75.0** | 17 -> 15 | 12.35 -> 12.12 | 56.77 -> 55.37 |
| foyer BOSS (The Butler) | 0 -> 0 | 60 -> 60 | 14.78 -> 14.90 | 71.98 -> 71.48 |

Smaller than it looks, and the reason is measurable rather than mysterious: the sim
plays the **unmodified 10-card starting deck** (5 Scratch, 4 Curl Up, 1 Boo!) with a
greedy AI. Ignores-Guard lives on an uncommon and a rare the sim can never draw — the
probe counted **0** piercing hits in 300 fights — so fixing it is literally
unmeasurable there. Haunt contributes about 1.4 Courage per fight from the single
Boo! that the greedy AI deprioritises. The Butler's 250 Courage against that deck is
a tuning question, not a seam bug, and retuning is not this agent's call.

### Requests for other owners (files this audit does not own)

* `src/main.js:77` — `ctx.run.snapshot?.()`.
* `src/scenes/combat.js:204,205,207` — `engine.registerCards?.()`,
  `engine.registerEnemies?.()`; `:565` — `run.save?.()`.
* `src/state/run.js:496,497` — `engine.registerCards?.()`,
  `engine.registerEnemies?.()`.

All six are `?.` on documented contract APIs (rule 8). `tests/seams/check.py` will
keep reporting them until they are direct calls.
