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


---
