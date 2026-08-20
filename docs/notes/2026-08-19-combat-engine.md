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
