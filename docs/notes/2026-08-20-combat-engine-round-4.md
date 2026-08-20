## 2026-08-20 — combat-engine (round 4)

**542 assertions, 0 failures** (`python tests/combat/run.py`), with the strict seam
Proxy armed. `tests/seams/proof.py` 52/52. `tests/seams/check.py` reports 6
problems, none in `src/combat/**` — see "optional chaining" below.

### 1. Snacks resolve in the engine — `engine.useSnack(snack, targetId)`

Snack rules were living in `scenes/combat.js`, which breaks non-negotiable #5.
They now live here. Public API:

```js
engine.canUseSnack(snack, targetId)  -> { ok, reason }      // reason is player-facing
engine.snackPotency(snack)           -> { heal?, block?, energy?, cleanse?, damageAll?, status? }
await engine.useSnack(snack, targetId = null) -> Event[]
```

`snack` is a `SnackDef` from `state/run.js` SNACKS —
`{ id, name, desc, effect: { heal, block, energy, cleanse, damageAll, status:[id,n], target:'enemy' } }`.

**The engine does not own the inventory.** `useSnack` resolves one Snack def;
taking it off `run.snacks` stays `Run.useSnack(index)`'s job. Consume on your side
the moment `canUseSnack` returns ok — a Snack is spent when eaten, win or lose.
The one exception the engine handles for you: if the player **backs out of the
target picker**, `useSnack` returns `[]` and emits nothing, so nothing was spent.

Resolution order:

```
1  validate (canUseSnack)
2  resolve the target — target:'enemy' with no targetId and >1 living enemy asks
   through the ORDINARY choice broker, so the scene's existing picker handles it
3  modifySnackPotency reducers, per numeric field
4  emit `snack:used` BEFORE anything lands, carrying the final numbers
5  heal → block → energy → cleanse → damageAll → status
6  onSnackUsed hooks
7  death / combat-end check, then intents refresh
```

New event:

```
snack:used { snackId, name, desc, targetId, effect, potency }
```

It fires *before* the effects so the eat, the banner and the reticle animate
first and the numbers land underneath (tested: Courage is still at its old value
when the event arrives).

**scene-side deletion is safe to route now** — `_useSnack`'s effect table,
`_consumeSnack` should stay (inventory), and the target question can be dropped
because the engine asks through the same `_resolveChoice` path. Verified against
the real `SNACKS` table, all seven, via a cross-seam test (rule 9): the suite
imports `state/run.js` and resolves every one of them.

### The hook signature you asked for

```js
// StatusDef / RelicDef hooks:
onSnackUsed(h)
//   h.snack     the SnackDef
//   h.snackId   its id
//   h.target    the chosen Actor, or null
//   h.potency   { heal?, block?, energy?, cleanse?, damageAll?, status? }
//               — the numbers actually applied, post-modifier
//   h.results   { healed?, blocked?, energy?, hit? } — what actually happened
//   plus the standard payload (h.e, h.owner, h.stacks, h.loseHp, h.heal, …)
```

Fires **after** the Snack resolves. A Keepsake that heals when you drink now works:

```js
hooks: { onSnackUsed: (h) => h.e.heal(h.e.player, 3, 'keepsake') }
```

And a second, *before*-resolution reducer for the Sacred-Bark shape:

```js
modifySnackPotency(value, h)   // h.snack, h.field: 'heal'|'block'|'energy'|'damageAll'|'status'
hooks: { modifySnackPotency: (v) => v * 2 }
```

Both are in the strict Proxy's soft-field list, so reading `h.snack` from an
unrelated hook is `undefined` rather than a throw.

### 2. `engine.state` cache invalidation — audited, not patched

The cache was a boolean, and `_buildState()` cleared it **at the end**. Any
mutation that happened *during* a snapshot (a `dynamicCost` that touches a
counter, a hook firing mid-build) was therefore swallowed, and the next read
returned the stale object. That is the real shape of the Turn-chip flake.

The flag is now a **revision counter**:

- `engine._invalidate()` sets dirty and bumps `_rev`;
- `_buildState(rev)` only marks itself clean if `_rev` is unchanged when it finishes;
- `_invalidate()` is called from `_emit` **and** explicitly at every mutation that
  does not go through an event: turn rollover (`turn++`, `phase`, the per-turn
  stat reset, `playedThisTurn`), the turn-scoped card-cost expiry, both phase
  changes, `_endCombat`, and `setCardMeta`.

Two tests: `engine.state.turn` matches `ev.turn` inside every `turn:start`
handler across six turns with the cache warmed each turn (this is exactly what the
HUD does), and a mutation raised during a snapshot produces a *different* object
with the newer value on the next read.

### 3. `costOf()` composition — discounts now reach dynamic-cost cards

`dynamicCost` used to `return` outright, so no `modifyCardCost` hook could touch
a card that had one. **Every cost-discount status was silently dead on those
cards.** The documented order is now:

```
1  CardDef.dynamicCost(ctx)   computes the card's PRINTED cost right now.
                              It replaces baseCost. It is NOT the final answer.
2  a hard override            setCost(card, n, 'turn'|'combat') outranks both the
                              printed and the dynamic cost — "costs 0 this turn" means 0
3  + costCombatDelta + costTurnDelta   (modifyCost), clamped at 0
4  modifyCardCost hooks       ← the discount STATUSES live here
                              (next-trick-discount, next-attack-discount, the
                              whole "costs less" family), clamped at 0 again
```

An X cost (`-1`) returned from `dynamicCost` still reads as X.
`Card.rawCost(printed)` takes the computed printed cost as an argument, so the
override/delta logic is shared by both paths rather than duplicated.

**Content authors:** put board-state cost logic in `dynamicCost` and let
discounts land on top. Do not implement your own discount inside `dynamicCost` —
it will stack with the status the player is also holding.

### 4. Optional chaining on contract APIs

Confirmed for routing: both methods exist on `CombatEngine`, spelled exactly

```js
engine.registerCards(defs)     // CardDef[] or an id-keyed object → registry size
engine.registerEnemies(defs)   // EnemyDef[] or an id-keyed object → registry size
```

so `state/run.js:496-497` and `scenes/combat.js:204-207` can drop the `?.`
outright. Both are covered by a test that asserts they exist, accept an array,
return the registry size, and that ids resolve afterwards (including by the last
path segment).

Inside `src/combat/**` I removed the one remaining offender of the same class:
`card.def.effect?.(ctx)` is now an explicit `typeof` check that logs a loud
`[combat] card <id> has no effect()` error. A Trick with no effect is a content
bug and must not read as "the designer wanted nothing to happen".

The remaining `?.` in my modules are on genuinely optional systems —
`EnemyDef.onSpawn?.()` and friends, where the whole point is that a def may not
define that lifecycle hook. Those are rule-8 legal and `check.py` agrees.

### Intent-honesty / seam verification

Keep using the two reference methods rather than re-deriving them:
`tests/enemies/audit.py` scores intent honesty from `damage` events as
`blocked + hpLoss` (never HP/Guard deltas across `endTurn`, which counts the
player's whole unspent Guard as damage taken), and `tests/seams/proof.py`
exercises the real implementations across module boundaries. Both are green.

---
