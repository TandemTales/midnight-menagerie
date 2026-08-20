# Enemies agent — build notes

Owner: enemies. Files owned: `game/src/data/enemies/**`, `game/src/data/bosses/**`,
`game/src/data/encounters.js`, `tests/enemies/**`.

Per-enemy numbers, move tables and encounter tables live in `docs/ENEMY-AUDIT.md`.
This file is the running log of decisions and handoffs.

---

## 2026-08-20 — round 3: the Haunt ladder, and the free opening Scuffle

### What was wrong

Haunt levels 2–8 were nearly featureless. The design docs specify a per-level ladder and I
had implemented all of it, but almost every entry was a **number**: Umbrella Jab 12→14,
Reprimand 6→8, Momentum 7→8 per stack, one more Clutter, one more Roused. Those read as
behavioural in a changelog and play as a stat bump. Three of the level 3–6 entries were
also scoped to the advanced encounter pool only, so in a normal run they rarely fired at
all.

### The ladder now

Every level from 2 to 10 changes how at least one enemy behaves. Asserted by a new test
(§5f) that diffs `hauntScaling(n)` against `hauntScaling(n-1)` and ignores `hpMul`
entirely — Courage is the laziest ascension axis and the balance pass already ramps it
continuously, so it does not count as character.

| Haunt | Behavioural change | Source |
|---|---|---|
| 2 | **Door Greeter** alternates ONE AT A TIME with NO RUNNING — which rule is standing stops being predictable from the enemy alone | Foyer §30 |
| 2 | **Patchwork Soldier** may Patch Up on consecutive turns; the guaranteed one-turn window after a repair is gone | Nursery §38 |
| 3 | **Dust Bunny / Button Baby / Slipper Skitter** opening-state upgrades stop being advanced-pool-only and apply in every encounter | docs, un-gated |
| 3 | **Blanket Creeper** folds a Layer back on after two turns without taking damage — progress rots if you look away | SQ §48 |
| 4 | **Thing Beneath** may hold UNDER THE BED back one turn at full Scare. You still know how big; no longer exactly when | SQ §48 |
| 4 | **Blanket Blob** moves Cover off a nearly-dead ally onto a healthy one | Nursery §38 |
| 5 | **Wardrobe Guest** takes an ally into the wardrobe with it — your targeting window closes on the enemy you wanted | SQ §48 |
| 5 | **Red Carpet Runner** starts with 1 Momentum, so its first Run the Hall lands a cycle earlier than you have learned | Foyer §30 |
| 6 | **Porcelain Doll** cracks itself rather than sitting Pristine. Leaving it alone stops being a way to keep it harmless | Nursery §38 |
| 7 | **Nightlight Snuffer** puts out one of your own positive effects when it Snuffs | SQ §48 |
| 7 | **Patchwork Soldier** Dismantles an ally at ≤6 Courage to restuff itself — leaving something nearly dead is now a mistake | Nursery §38 |
| 8 | **The Butler** gains a fifth House Rule, GUESTS DO NOT DAWDLE | Foyer §30 |

**Haunt 1 is deliberately still Courage-only.** All three region docs define it identically
as the calibration step, and it is the one level whose intended statement really is "the
same fight, slightly tougher". The test exempts it explicitly rather than silently.

Two of these deserve their reasoning recorded:

- **The Butler's fifth rule** is the first that punishes doing too *little* (ending a turn
  on fewer than two Tricks). The other four all punish excess — too many Tricks, too much
  Guard, too much damage, the same type twice — so slowing down was always a safe answer to
  all of them at once. Standing beside NO RUNNING in phase two it closes the safe band to
  exactly two or three Tricks a turn. Its Reprimand is Clutter: a fifth flavour of
  consequence, it ties the boss to the Foyer's own deck-interference thread, and unlike a
  heal it makes the fight harder without making it longer.
- **Thing Beneath's delay** is uncertainty with a ceiling. It only triggers at maximum
  Scare and never twice running, so the player always knows the size of the hit and only
  loses the exact turn. That is the Sleeping Quarters' stated thesis — "uncertainty should
  create decisions, not coin flips" — rather than a random spike.

### A bug I shipped and caught in the same round

Thing Beneath's delay was first written as `c.rng.chance(0.5)` inside `nextMove`. That is
wrong twice over: `nextMove` is re-called on every intent refresh, so the telegraph would
have flickered between "Not Yet" and UNDER THE BED while the player watched, and each call
would have advanced the run RNG. The coin is now flipped once, in the effect that banks the
final Scare, and `nextMove` only reads the result.

**The suite could not have caught it**, which is the more important half. Every section
built enemies at Haunt 0, so no behavioural Haunt branch had ever executed in a test. New
§5e runs all 37 enemies at Haunt 0–10 in both the normal and advanced pools — 814
combinations — asserting no crash, no illegal move id, and `nextMove` purity and
determinism under Haunt flags. That is the section that now guards this class of bug.

### The free opening Scuffle

A quarter of opening fights cost nothing. The cause is structural rather than numeric, and
worth stating plainly because it will come back: **against a fresh deck a solo enemy is
almost perfectly blockable.** Measured Guard absorption is 95% for one Dust Bunny and 91%
for one Coatrack Crawler, against 46–57% once two enemies act on different cycles. Raising
one enemy's damage does not close it — the bot simply blocks the bigger number.

Authored `foyer-4b` **"Dust Bunny + Half-Packed Luggage"**, 43 Courage exactly: Dust Bunny
at full 20 plus Lost Luggage at 0.75× (23). It sits between `foyer-3` (40, the only pair the
early pool had) and `foyer-7` (50, which measured 14.65 and overshoots once Clutter went
live). The case still runs its whole Pack Wrong / Baggage Bash / Snap Shut cycle and still
pollutes the deck, but dies early enough to land roughly one Clutter instead of three. The
two cycles are deliberately coprime — the Bunny alternates on 2, the case runs on 4 — so
they never stack their big turns, which is what keeps it threatening without spiking.

Measured, n=60, haunt 0:

| | free openings | first-3 Scuffle cost |
|---|---|---|
| naive, before | 26.3% | 10.05 |
| naive, after | **15.5%** | 11.09 |
| competent, before | 25.0% | 11.23 |
| competent, after | **16.5%** | 13.14 |

Free openings roughly halved. Note the two metrics pull against each other: the pool now
holds free solo teaching fights *and* costly pairs, so squeezing the free rate below ~15%
means making the doc's solo introductions cost Courage, which is a design decision about
whether the region's first lesson should hurt. Competent's mean is 1.1 over the 8–12 band
as a result. Flagging rather than tuning further — global tuning is the balance agent's.

### The Butler's Roughhousing rule and his own summon — checked, keeping it

`damageDealtThisTurn` counts damage to **any** enemy, so clearing his summoned Dust Bunny
can trip GUESTS DO NOT ROUGHHOUSE by accident. Keeping it. The rule text the player reads
says "dealing 15 or more damage this turn", the summon is his own staff, and objecting to
you manhandling it is exactly in character. More usefully it is *exploitable*: a player who
wants Flustered can farm it off the Dust Bunny on purpose, which is the fight's whole
thesis that breaking rules is a strategic option. Narrowing it to damage-to-the-Butler
would contradict the on-screen text and quietly delete that line of play.

### One more intent-truth bug, from a change made under me

Now that the engine genuinely maintains `damageDealtThisTurn`, No Roughhousing can fire for
the first time — and it fired at `turnEnd`, i.e. after the player committed and after the
Butler's intent number was fixed, but before he swung. He hit for 15 from an intent
promising 10. The Reprimand now banks into `retaliationPending` and promotes at his own turn
end, so the boost is always visible on the intent that carries it. Same shape as the round-2
Roused fixes: **nothing may change an attacker's damage between the intent being read and
the attack resolving.**

### Still open with the engine

Unchanged from round 2, and the reason two Roused branches are still Guard instead:
**a point where a buff can be armed after the enemy phase and before intents refresh** —
an `onEnemyPhaseEnd` enemy hook, an enemy-side `enemyTurnEnd` decay bucket, or an
`armAfterIntentRefresh` flag on `applyStatus`. Any one of them lets the House Bell and The
Butler hand out Roused as the design doc writes it.

### Verification

    python tests/enemies/run.py      # 37 enemies, 0 errors  (adds §5e, §5f)
    python tests/enemies/audit.py 12 # 2379 scored enemy turns, 0 mismatches
    python tests/combat/run.py       # 590 passed, 0 failed
    python tests/seams/check.py      # 1586 call sites, 0 problems

### Measured ramp — `sim.py --n 60 --bots naive,competent`

| Haunt | naive survival | naive boss win | competent survival | competent boss win | competent boss turns | free openings |
|---|---|---|---|---|---|---|
| 0 | 46.7% | 80.0% | 65.0% | 92.9% | 11.6 | 15.5% / 16.5% |
| 3 | 21.7% | 59.1% | 41.7% | 73.5% | 13.4 | 9.5% / 14.7% |
| 5 | 25.0% | 75.0% | 48.3% | 74.4% | 13.8 | 13.8% / 14.1% |
| 8 | 8.3% | 26.3% | 30.0% | 52.9% | 15.2 | 8.3% / 8.8% |
| 10 | 18.3% | 50.0% | 30.0% | 64.3% | 15.5 | 8.1% / 8.7% |

Read this with three caveats, all of which matter more than the numbers:

1. **The simulator covers one region.** `RUN_LENGTH_REGIONS = 1`, so every expedition above
   is the Foyer. Only the Foyer third of the ladder — Door Greeter H2, Dust Bunny H3,
   Calling Bell H4, Coatrack Crawler and Red Carpet Runner H5, Lost Luggage H6, Red Carpet
   Runner H7, Door Greeter and The Butler H8 — is in these figures at all. The Nursery and
   Sleeping Quarters upgrades, which are two thirds of the work, are covered only by
   §5e/§5f/§5g in my own suite. Nobody should read this table as validating them.
2. **Level-to-level moves under ~10 points are noise at n=60.** Boss samples are n=22–42.
   The H3→H5 uptick and the H8→H10 uptick are both inside that band; the trend across the
   whole ladder is what the data supports, not the individual steps.
3. **Haunt 0 was re-measured on final code; 3/5/8/10 predate the Butler retaliation-timing
   fix.** That fix delays his No Roughhousing rider by one attack and is magnitude-neutral
   over a fight, so the effect on those four rows is small, but they are not strictly
   like-for-like with row 0.
4. **Bosses got both harder and longer.** Competent boss win falls 92.9% → 64.3%; boss
   turns rise 12.6 → 15.5. The lengthening is the continuous `hpMul` ramp, which is the
   balance agent's lever — every behavioural upgrade I added is Courage-neutral by
   construction and contributes only to the first number. If boss length needs to come
   down, the Courage ramp is the thing to flatten, and the ladder now has enough character
   to carry difficulty without it.
