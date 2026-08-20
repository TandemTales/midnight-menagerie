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
