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
