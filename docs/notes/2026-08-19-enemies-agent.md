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
