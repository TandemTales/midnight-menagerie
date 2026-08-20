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
