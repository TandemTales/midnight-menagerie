## 2026-08-20 — balance: the simulator now plays a run, and the Foyer is tuned to it

Every balance number before this is void. Not because the old simulator was
buggy, but because of what it was pointing at: it played the **unmodified
10-card starting deck** (5 Scratch, 4 Curl Up, 1 Boo!) against every encounter
including the region boss. That is not a build any player brings to a boss. It
made Ignores-Guard unmeasurable (0 piercing hits in 300 fights, because it lives
on an uncommon and a rare), Haunt worth ~1.4 Courage a fight, and the Butler's
250 Courage a verdict on the tutorial.

### The new instrument — `tests/critic-design/`

`sim.py` / `sim.html` were rewritten. They now walk a whole region through the
real `Run`: `enterNode`, `run.combat`, `takeRewardCard`, `claimReward`, `rest`,
`upgradeCard`, `shopStock`/`buy*`, `chooseEventOption`, `leaveNode`. The deck
grows and upgrades, Keepsakes arrive at the rate the run layer grants them,
Snacks are bought and eaten, Courage carries between rooms. Nothing is
re-implemented; the run layer is driven, not modelled.

* `lib/expedition.js` — one expedition, node by node, plus `bench()`, which
  replays a fight against a loadout a real expedition was **actually carrying**
  when it arrived at that door. That is how the boss and the elites get a sample
  size larger than "the number of runs that survived to meet them".
* `lib/policy.js` — drafting, pathing, resting, shopping, Curiosity choices.
  Five drafting policies. The archetype policies read `coreCards` straight off
  `companion.archetypes`, so they are the design's own statement of intent, not
  a hardcoded list.
* `lib/bot.js` — two players (below).
* `lab.py` — one encounter in detail: damage in, damage out, Guard gained, rules
  broken, turn-by-turn trace.
* `sweep.py` — "what Courage pool would put this fight in the target band?"

**Two bots, and the gap between them is a measurement.**

*Naive* is the old greedy bot: reads intents, blocks the telegraphed number,
swings the biggest attack, never uses a Snack, never sequences.

*Competent* is a beam search over the whole player turn whose terminal states
are scored by **simulating the enemy turn**. It rides `combat/preview.js`:
`previewCard()` clones the engine, plays the card on the clone and hands the
clone back, so the clone *is* the successor state and a search is chained
previews. It knows no card's rules text — it discovers what a card does by
playing it and looking. Consequently it values Haunt and Ghoststep because it
watches them pay off, and it sequences (strip the Brace, then hit).

Three things had to be fixed in the bot before any content number could be
trusted, and they are worth recording because each one looked like a content
problem first:

1. **A fixed damage-versus-Guard exchange rate is wrong.** "6 damage beats 5
   Guard" is true in a three-turn Scuffle and false in a thirteen-turn boss
   fight. With it, the *competent* bot lost to the naive one against the Butler.
   Terminal states are now scored by projecting the rest of the fight:
   `turnsLeft = enemy Courage / damage this plan dealt`, `lossPerTurn = threat -
   Guard sustained`, `value = Courage now - turnsLeft x lossPerTurn`.
2. **The future Guard estimate must not be moved by this turn's Guard.**
   `turnsLeft` multiplies it, so letting one Curl Up raise the projection valued
   it at three or four Courage a point and the bot turtled itself to death. What
   this turn's Guard is worth is the damage it stops this turn, which is already
   inside the simulated result.
3. **Replaying a plan aborted on the first illegal step.** Frenzied Zoomies
   returns itself to hand, which can make one mid-plan step unplayable — and the
   abort threw away everything after it, which was reliably the Curl Up the plan
   had put last. The bot looked like it had decided not to block. It had decided
   to block and then dropped the card.

The competent bot also scores the naive heuristic as one more candidate each
turn, so it is never worse than naive by construction.

### Before / after

Same instrument, same seeds, 30 expeditions per bot, Haunt 0, balanced drafting.
"Bench" replays 30 fights against captured pre-fight loadouts.

| | target | naive before | naive after | competent before | competent after |
|---|---|---|---|---|---|
| Whole-region survival | 60–75% (competent) | 26.7% | 33.3% | 36.7% | **46.7%** |
| Region boss — bench win | 45–65% | 20.0% | 46.7% | 46.7% | **60.0%** |
| Region boss — turns | 8–12 | 15.1 | 12.2 | 16.2 | **12.6** |
| Region boss — in-run win | — | 47.1% | 58.8% | 42.3% | 70.0% |
| Big Scare — bench win | 60–75% (competent) | 73.3% | 46.7% | 76.7% | 83.3% |
| Big Scare — in-run win | 60–75% | 66.7% | 60.0% | 89.3% | **69.2%** |
| Normal Scuffle — turns | 3–5 | 4.46 | 4.98 | 3.80 | **4.03** |
| Normal Scuffle — Courage | 8–12 | 10.28 | 11.94 | 8.54 | **12.04** (med 11) |
| First 3 Scuffles costing **zero** | — | 30.2% | 17.6% | 29.1% | **16.3%** |

Per-elite, measured individually against captured loadouts (n=36, competent /
naive): Grand Coatcheck **77.8 / 44.4**, The Unwelcome Guest **72.2 / 50.0**,
The House Bell **75.0 / 50.0**. Before: 96.7 / 70, 100 / 80, 33.3 / 16.7 — the
three Big Scares were a 67-point spread pretending to be one difficulty tier.

The naive-to-competent gap is real and large: 13.4 points of region survival,
36.6 points on the elite bench, 13.3 on the boss bench, a whole turn off every
Scuffle, and 11 fewer Courage per elite. Decisions matter.

### What changed, and the measurement that justified each change

**The Butler — Courage 250 → 178, phase two 140 → 100.** Measured against real
pre-boss loadouts (~16 Tricks, 1 upgrade, 5 Keepsakes, arriving at a median 46
of 68 Courage) he took 20+ turns to kill and paid for 11. He is not dangerous;
he is *long* — 4 Courage a turn. Sweeping the pool (48 fights per step) put the
fight in the 8–12 turn band at 0.65–0.7x.

**Two of the Butler's four House Rules were unreachable.** Measured over 24 boss
fights with real decks: `keep-the-hall-clear` (18+ Guard at end of turn) broke
**0 times** and `no-roughhousing` (20+ damage in a turn) broke **0 times**. With
3 Pluck and a 5-Guard starter card, 18 Guard needs four of them; 20 damage sits
one point above three Scratches, which is the whole turn. So half his signature
mechanic was dead content, Flustered averaged 1.4 breaks a fight and Discomposed
0.46. Now 12 Guard and 15 damage: **3.0 breaks and 1.14 Discomposed per fight**
for a competent player.

**`RuleCtx.damageDealtThisTurn` is never incremented — for anyone.** It is
declared in the `CombatEngine` constructor and zeroed in `_beginPlayerTurn`, and
`damage.js` does not touch `engine.stats` at all. `no-roughhousing` therefore
could not fire at *any* threshold; lowering 20 to 15 turned 0 breaks per fight
into 0 breaks per fight. The Butler now counts what is done to him through his
own `onDamaged`, into `engine.field` (which previews deep-clone, so hovering a
card cannot bank Roughhousing). **This is a bug in `combat/damage.js` and it
belongs to the combat-engine owner** — the workaround should be deleted once the
stat is real, and any other content reading that field is silently broken today.

**The Roughhousing reprimand applied per hit.** "His next damaging attack deals
5 more" was +10 on Dust Them Off (5x2) and **+15 on Remove the Intruder (7x3)** —
a telegraphed 21 arriving as 36. Invisible until the rule that arms it could
fire; the moment it could, the boss started one-shotting people. Now spread
across the hits, rounded up, uniformly, so `damageFn x hitsFn` stays exactly
what the player is about to take.

**Discomposed's window was worth nothing.** `decay: 'turnEnd'` expired it at the
end of the very enemy turn it was applied on, so the +25% covered no player turn
at all. Every decay bucket fires inside the enemy phase, so none of them can
express "lasts one player turn" — it is now `decay: 'never'` and the Butler
clears it himself on the turn after the one he wastes collecting himself.
Collect Himself also drops 12 Guard → 6: handing him 12 Guard on the turn the
tell literally says "this is your window" made the window worth nothing twice.

**The Grand Coatcheck — 96 → 115, one Check per cycle instead of two, Umbrella
Sweep 11 → 13, Everything at Once 15 → 17.** 96.7% for a competent player and
22.9 Courage, which is less than two Scuffles. The numbers were not the problem:
two of its five turns dealt zero, so it averaged 7.6 a turn against a player who
raises 10–15 Guard. 122 Courage overshot hard (43%, with the naive bot within
ten points — the fight had stopped rewarding play), so it sits at 115.

**The Unwelcome Guest — 91 → 142, Too Familiar 9 → 13 (cap 15 → 20), Wrong Face
6x2 → 9x2, a sixth move in the cycle.** The softest thing in the region by a
distance: 100% competent, 12.6 Courage, a fifth of what the House Bell cost for
the same reward. 72% of everything it threw was absorbed, so per-hit numbers
alone could not reach the player; the extra Courage is what turns them into a
bill. (An interim version applied 2 Weak on Come In, Then. Reverted: `weak` is a
core status the enemy suite's registry does not carry, and the fight did not
need a new mechanic.)

**The House Bell — Deep Vibration no longer charges Resonance; Ring for Service
summons at 60% Courage.** 33.3% competent and 57 Courage — harder than the boss.
"Every ring adds 1" is the rule the fight is sold on, but Deep Vibration is not
a ring and added 1 anyway, so Resonance climbed on all four actions and MIDNIGHT
TOLL landed every fourth turn regardless. Killing a summon gives -1, so denying
the Toll meant killing an add *every turn* on top of racing 105 Courage: the
advertised lever could not be pulled. Now only the two Ring moves charge it and
one kill really does buy a turn. Result 33.3% → **75.0%**.

**Encounter composition, not damage numbers.** 29–30% of the first three
Scuffles of a region cost the player **zero** Courage — not because the early
enemies are weak (a Dust Bunny's Tumble projects up to 19) but because one
enemy's whole turn fits inside one turn of Guard. Raising a lone enemy's damage
to beat a turn of Guard would make it lethal whenever the player draws no Guard
card, so the fix is composition: `foyer-7` (Lost Luggage + Dust Bunny, the
cheapest pair in the roster) is promoted to the early pool, and `rollEncounter`
now picks **weighted**, with two-body formations at 2 and solos at 1. Solos stay
because each one is the first time the player meets that enemy. Result: zero-cost
opening fights 30.2% → **17.6%** (naive), 29.1% → **16.3%** (competent).
Promoting the 53-Courage pair as well overshot the 8–12 band (mean scuffle cost
15.6), so only the one moved.

### The two mechanics the seam fix could not measure

**Haunt now pulls its weight — but it is on-rate, not an engine.** Pre-fix it
dealt literally zero. Now, a Haunt-drafted deck does **887 Courage of Haunt
damage per 20 expeditions** (44 a run), and 35.5 of the ~178 needed to kill the
Butler — a fifth of a boss fight. But whole-region survival by drafting policy
is 40 / 45 / 40 / 40 / 40 % (balanced / greedy-damage / defensive /
archetype-haunt / archetype-ghoststep, n=20 each): Haunt is indistinguishable
from balanced and slightly behind simply drafting damage. The reason is
structural — Haunt returns 2N over an enemy's next four attacking turns, and the
median Scuffle is four turns long, so most of a Haunt investment never
resolves. It reads as a boss/elite archetype that is being asked to also carry
Scuffles. No change made: it is inside the band, and one archetype being
"fine rather than exciting" is not worth a keyword rewrite on this evidence.

**Ignores Guard is correctly costed, on a thin sample.** 16–18 piercing hits per
30 expeditions, because Through the Wall is an uncommon and Across the Veil a
rare and the balanced policy rarely drafts them. Where they land they are worth
it: 9 piercing for 1 Pluck against Foyer enemies that hold 8–14 Guard (Coatrack's
Brace is 10, the Butler's Restore Order 14) is a 50% premium over Scratch plus a
full bypass, for one rarity step. Arguably a shade under-costed. Not changed —
retuning a card on ~16 observations would be guessing.

### Still out of range — and the one number that explains it

**Whole-region survival is 46.7% for a competent player against a 60–75%
target.** Every individual fight is now in or near band; the region is not. The
Courage ledger says why, per expedition:

```
spend   scuffles -51.8   elites -32.4   boss -24.8   curiosities -3.1
gain    Courage pool 68   rests +15.0 (0.7 rests taken)   in-combat +34.9   events +9.3
```

113 Courage of damage against 127 of Courage. That is break-even with no margin,
and the margin is missing from exactly one line: **0.7 Safe Room rests per
expedition.** A path visits 1.1 Safe Rooms in a 12-room region. Slay the Spire
gives you two to three campfires an act *and* guarantees a rest immediately
before the boss; here the pre-boss placement is an 80% chance two rows early, so
the player arrives at the Butler on a median 51 of 68 Courage with a p25 of 40.

This is measurable rather than arguable. Re-running the boss sweep with one
extra rest's worth of Courage at the door (+22, arriving at ~61 instead of ~46)
moved the boss from 15% to **45.8%** at identical content, and every step of the
sweep gained 8–15 points. **Recommendation for the map owner:** guarantee a Safe
Room on the last walkable row, and/or raise the SAFE quota so a path reliably
crosses two. That single change should carry region survival from ~47% into the
60–75% band without touching a single enemy number — and it is the right fix,
because the alternative is making the Foyer's encounters weaker than the targets
say they should be.

Two smaller ones, both out of this agent's files:

* `state/run.js buildCombat()` registers `allCards()` but **not**
  `STATUS_TRICK_DEFS` from `data/enemies/_lib.js`, so in a real run every enemy
  doing `addCard('clutter')` logs "unknown card" and adds nothing — Lost
  Luggage's and the Grand Coatcheck's deck interference is currently free.
  `scenes/combat.js` does register them, so the standalone combat deep-link
  behaves differently from a run. The sim registers them (`?clutter=0` measures
  the shipped behaviour instead).
* The boss bench sits at 60% and the in-run figure at 70%, against a 45–65%
  target. The in-run number is selection-biased upward (only runs healthy enough
  to path to the boss fight it). Left alone deliberately: pushing the Butler back
  up costs whole-region survival, which is the metric that is actually short.

Artefacts: `tests/critic-design/sim-AFTER.json` (shipped content),
`sim-POLICIES.json`, `lab-result.json`, `sweep-result.json`. The before column
is reproduced by reverting the four content changes above (butler.js, foyer.js,
encounters.js, and `discomposed.decay` in enemies/_lib.js) and re-running the
same command — `python tests/critic-design/sim.py --n 30 --bots naive,competent
--policies balanced --bench 30` — at seed 90000.
Suites green after all changes: cards 445 / 0 errors, enemies 37 / 0, combat
542 / 0, seams check 1568 sites / 0 problems, seams proof 52 / 0.
`tests/enemies/index.html` needed six authored-pattern assertions updated to the
new cycles and numbers (Coatcheck cycle and Evening Coat figures, Guest cycle and
the Too Familiar ladder) — flagged here because that file is the enemies agent's,
not this one's.

---
