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
