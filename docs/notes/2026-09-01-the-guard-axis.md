# The Guard axis, and three defects that look identical in `turns`

2026-09-01. Nine of 535 fights run past turn 30, where `_losePatience` starts
escalating to guarantee termination. Yesterday I blamed route depth and was
wrong. The Guard axis says what they actually are — and they are not one defect
but **three**, which the `turns` column cannot tell apart.

## The axis nothing was printing

`fight()` in `tests/critic-design/lib/expedition.js` has summed `dmgDealt`,
`dmgBlockedByEnemies` and `enemyGuard` since it was written, and `bench()` has
returned all three. **Nothing ever printed them.** So the mechanism
`combat/engine.js` ~2918 names as the cause of an unfinishable fight has never
been measured:

> An enemy's Guard is wiped at the start of its own turn and re-granted every
> turn, so what the player must beat is its Guard PER TURN, not its Courage … a
> deck that deals less than that can never move its Courage bar at all, however
> long the fight runs.

Both harnesses report it now. `ladder.py` adds **wall** (Guard raised per turn),
**swing** (damage put out per turn, landed plus absorbed) and **absorbed**.
`run.py` adds **wall**, **land** (damage that actually reached Courage per turn)
and **summoned**.

## Every boss, against a constant wing-one deck

    #   region              wall  swing  absorbed      #   region            wall  swing  absorbed
    1   foyer                6.0   16.2    20%        10   ballroom           4.8   10.9    10%
    2   nursery              4.0   14.9     4%        11   crypt              4.2   12.7     7%
    3   sleeping-quarters    2.8   16.5     8%        12   hedge-maze         4.1   12.3     6%
    4   kitchens-cellars     5.9   10.5     6%        13   secret-passages    2.9    8.6    18%
    5   greenhouse           2.7   11.8     7%        14   bathhouse          9.6    7.7    20%
    6   graveyard            3.7    9.8    22%        15   kennels            3.9   15.5     7%
    7   study-library        6.5    7.1    18%        16   pumpkin-grounds    3.4   12.1     6%
    8   attic-observatory    3.1   10.7    15%        17   heart             15.7   11.2    12%
    9   lampworks            2.5   16.0     9%

Three bosses raise a wall at or above the deck's entire output — **study-library
0.92× the swing, bathhouse 1.25×, heart 1.40×** — where the other fourteen sit
between 0.16 and 0.56. The Heart is the ending of the game and it is the
highest wall in it.

## The nine real over-30 fights, and they are three different things

    turns  wing  region             left  wall  land  summoned
      87     3   graveyard           64%   3.2   2.2      72     GUARD STALL
      54     3   attic-observatory   66%   3.1   2.5       0     GUARD STALL
      37     3   study-library       33%   6.0   6.6       0     GUARD STALL
      56     2   greenhouse          68%   2.1   7.5     314     TREADMILL
      55     2   greenhouse          69%   2.4   5.5     201     TREADMILL
      52     3   greenhouse           0%   2.6  13.2     346     TREADMILL (won)
      44     2   greenhouse          33%   2.7   9.9     210     TREADMILL
      69     4   graveyard           27%   3.1   5.8     142     GRIND
      55     2   lampworks           21%   1.4   9.5     122     GRIND

**A Guard stall** is `wall` at or above `land` with nothing summoned: the board
re-raises faster than the deck gets through. The attic-observatory row is the
purest in the game — 3.1 against 2.5, **summoned 0**, two thirds of its Courage
still standing after 54 turns.

**A treadmill** is the opposite reading and it looks the same in `turns`. The
greenhouse boss lands *7.5 a turn for 56 turns* — 420 damage into a 464 board —
and still faces 68% of it, because the Head Gardener keeps planting. That one is
**working as designed**: `plant()` caps concurrent bodies at three Beds and
`sow` becomes `water-the-beds` when they are full, so the fight is a garden you
keep clearing. It is long because the player is killing plants instead of the
gardener.

**A grind** is just a long fight the deck is winning slowly.

They need three different fixes, and **a Courage pool cut reaches only the
grinds.** That is the second reason yesterday's route-scaling plan was wrong.

## One repair: the Watcher printed a rule it did not enforce

`bosses/watcher.js` announces Grounded to the player:

> It takes 25% more damage and **cannot gain Guard until it climbs back.** This
> is your window.

`damageTakenMul` enforced the first half. **Nothing enforced the second** — all
three `c.block(c.self, …)` sites were unconditional — so the window the rule
promises did nothing to the wall, which is this fight's whole defence. Same
shape as the Keeper's Belonging: a boss with a rule it cannot apply.

Gated now in `blockFn` **as well as** in the effect at both sites that declare
Guard on their intent. Gating only the effect would leave Skitter Above
promising 13 Guard on the rail and granting none, which is an intent that lies.
`buildIntent` prefers `blockFn` over the static `block`, so the rail follows.
Timing is safe: Grounded is set during the Watcher's own turn and cleared at its
next `onTurnEnd`, so it is already true when `refreshIntents` draws at
player-turn start.

`tests/attic-observatory/check.py` gates it with the control pair the suite's
own header demands — the same ten turns of the same board, once Grounded and
once not. 48 checks → 53. Proved it can see: with the fix removed both
assertions go red at `maxBlock 13` and `maxIntentBlock 13`.

## What the repair did NOT do, stated plainly

**It did not clear the stall.** The run harness is unchanged: 535 fights,
longest 87, past-24 13, past-30 9, and the attic-observatory fight is still 54
turns at wall 3.1 / land 2.5 / left 66%.

Grounded is set by the Watcher's *own* Great Descent, so the window opens about
one turn in five and only suppresses Guard if that turn happened to be a Guard
move. Meanwhile `wall 3.1 > land 2.5` does not mean the bar never moves — it
moves at 2.5 a turn, which is 142 turns for a 356 pool. So the Watcher is a
Guard **tax** on top of a pool too large for a wing-three deck, not a hard wall.

The repair is worth keeping because an unenforced printed rule is a defect on
its own terms. It is not the fix for the stall, and calling it one would be the
same mistake as yesterday's.

## What would reach the stalls

The axis is now measured, so the question is answerable rather than guessable:
a boss whose wall approaches a plausible deck's swing needs either a cap on what
it can raise per turn, or a reliable answer in the player's deck (pierce, Guard
removal), or a smaller pool so the tax is survivable. Which one is a design
call, and it should be taken against this table rather than against a feeling.

## The StS2 lookup, run 2026-09-01

The section above ends by calling the fix "a design call". That was wrong in the
same way yesterday's route-depth claim was wrong: it was a lookup I had not run,
wearing a design question's clothes. `docs/STS2-REFERENCE.md` has no entry for
"guard" — but it does have four for **Block**, which is what StS2 calls it, and
grepping our own word instead of theirs is why this sat unanswered for sessions.

### What StS2 actually does about enemy Block

**It does not cap it.** No source I could find — the wiki, Spire Codex, sts2wiki
— documents a per-turn ceiling on enemy Block. Candidate fix 1 has no precedent.

**It does flatten its growth.** `STS2-REFERENCE.md:232` already recorded this and
nobody connected it: co-op enemy Block was *changed from* x2.2/x2.4/x2.6 to a
**flat x2**, "deliberately decoupled from the HP curve", while Plating, Artifact,
Slippery and Skittish all kept rising curves. Block is the one defensive buff
they refused to let scale with difficulty.

**The real answer is damage that never touches Block at all.** Two channels,
confirmed independently by two sources: **Poison** (HP loss at the start of the
creature's turn, ignores Block) and **Doom** (Necrobinder; at the end of enemy
turns, Doom >= HP kills outright, bypasses all defence). There is no general
"remove enemy Block" card — so the "Guard removal" half of my guess is not the
StS2 shape either. The shape is *a channel that does not route through the wall*.

**Unresolved, and it matters.** One search summary claimed enemy Block is
subtracted from the *combined total* of a multi-hit attack rather than per hit;
Spire Codex says "multi-hit attacks apply the full pipeline per hit", and StS1 is
per-hit. Two against one, but I did not confirm on a primary source. If StS2 did
pool it, that alone would be a large part of their answer, because it makes many
small hits beat a wall. **Our engine's behaviour here is measurable in our own
harness and was not measured.** Do that before copying anything.

### What we have

Our Guard-ignoring mechanism is `pierce`, an option to `U.hit` — not `ignoreBlock`,
which is why it does not grep like the engine's own term.

**Four piercing cards, on two of sixteen companions:**

    marmalade/through-the-wall        UNCOMMON  1 Nerve,  9 dmg, unconditional
    marmalade/<ghost multi-hit>       consumes Ghost
    hush/whole-ferret-no-warning      RARE      3 Nerve, 33 dmg, Shadow Pocket + Ambush
    hush/<pilfer/defend-read>         only if the target intends to Defend

Both design-specified ones are implemented and match spec, so this is **not** a
Watcher-style unenforced rule. `through-the-wall` is in no core set, so it must be
drafted. Against that, Guard-granting is everywhere in the region data — nursery
4/turn, graveyard 7, ballroom 5, and lampworks carries a "+2 additional Guard"
amplifier on every gain.

**And there is an orphaned poison.** `combat/statuses.js:157` defines `dread` with
exact StS-poison parity — `loseHp(..., ignoreBlock: true)`, stacks, ticks at the
owner's turn start, decrements 1. **Nothing applies it**: no card, companion,
relic, enemy, boss or event. It is not in `keywords.js`, so it has no tooltip and
is not among the 362 the teaching gate counts, and it appears nowhere in
`docs/design/`. An icon was drawn for it (`ui/icons.js:96`). The other seven
`dread` hits in the codebase are an unrelated atmosphere shader.

### What this does NOT establish

The bench defaults to `companion = 'marmalade'` (`expedition.js:159`, `:409`) —
**one of the only two companions that has pierce.** So the stalling runs had a
piercing card in their pool and stalled anyway, and I cannot claim from this that
the stalls are caused by pierce being unavailable. Either the drafter passed it,
or one uncommon at 9 damage does not move a 6.0 wall. Both are checkable and
neither is checked. `deckEnd` is already captured per run; read it for the three
GUARD STALL rows before building anything.

### The narrowed question

Not "cap, answer, or pool" any more. StS2's answer is the middle one, we have a
thin version of it on 12.5% of the roster, and a correct unreachable poison in
the engine. What is genuinely open is *distribution*: whether the answer to Guard
should stay a companion identity (Marmalade and Hush are "the ones who get
through walls") or become a floor every companion can reach, e.g. by giving
`dread` a source. That is a real design call, and unlike the last one it is a
call about the roster rather than a fact about StS2.

## Measured, and it takes back this note's headline

The lookup section above says the stalls' cause was unmeasured and that `deckEnd`
should be read before building. Reading it was not possible: the ledger kept deck
LENGTH per fight and never contents. Three instruments later, the answer is in,
and the first casualty is this note's own central claim.

### The sweep was five companions of sixteen

`tests/run/index.html` held `COMPANIONS = ['marmalade','bones','pipkin','taffy',
'wink']` — the four `STARTER_SLUGS` plus `wink` — while sixteen are playable. It
is `companionSlugs()` now, so a companion joins the gate by existing. All sixteen
run clean: same single failure, determinism/resume/localStorage all still pass.

### Nobody can answer a Guard wall

`pierce` counts cards in the deck whose TEXT ignores Guard — detected by text,
not an id list, so a new piercing card registers itself.

**11 of 491 fights (2%) held one.** `marmalade` 11/41 (27%) is the only nonzero
row in the roster. `hush` holds two of the game's four piercing cards and drew
neither across 17 fights, because both are RARE while Marmalade's
`through-the-wall` is UNCOMMON. And `rescueCompanion()` adds clues and Courage
but **no cards**, so a run's answer to Guard is fixed at companion select and
cannot change afterwards.

### The purest "Guard stall" in the game was not a Guard stall

`swing` (damage put out per turn, landed plus absorbed), `abs` (the share the
board ate) and `cpt` (Tricks played per turn) separate readings that `wall > land`
collapses into one:

    57t attic-observatory  bones   wall 4.1  land 0.3  swing 0.3  abs 0%   cpt 0.2
    38t study-library      taffy   wall 4.1  land 0.4  swing 0.4  abs 0%   cpt 1.0
    37t study-library      pudding wall 7.0  land 8.8  swing 12.2 abs 28%  cpt 1.5

**Absorbed zero.** The board took nothing from the top two because there was
nothing to take. The section above called the attic-observatory row "the purest
in the game" and read `wall 3.1 > land 2.5` as a board out-raising a deck; with
`abs` printed it is a deck putting out 0.3 a turn into a wall that never touched
it. No boss change reaches that fight. The genuinely wall-shaped row is the
third, and that deck got through to 6% left.

Healthy fights run `cpt` 1.5-2.6, which makes the top two **two different bugs**:

- **bones/attic-observatory, cpt 0.2** — a turn loop that almost never plays a
  card. About 11 Tricks in 57 turns.
- **taffy/study-library, cpt 1.0** — plays a Trick every turn and deals 0.4.
  It acts; the acting does nothing.

`bones` lands 15.3 a turn in kitchens-cellars and 0.3 against the Watcher, so
neither is "the bot cannot play that companion".

**Cause not established, and I am not naming one this time.** The obvious
suspect was the Watcher's `web-the-hand` inflating card costs, but `web()` takes
`cap = 4`, so concurrent webs are bounded and it cannot price out a deck on its
own. That is where the next session should start, with `trace` on the failing
seed rather than another inference.

### What the three mechanisms actually are

The taxonomy above — GUARD STALL, TREADMILL, GRIND — was built from `turns`,
`wall`, `land` and `summoned`. With `abs` and `cpt` added it is missing two, and
they are the two that produced the longest fights in the game:

    stuck loop    cpt near 0                     the deck never acts
    inert deck    cpt normal, swing near 0       the deck acts and cannot hurt

Neither is reached by a pool cut, a route change, a wall cap, or pierce.

## The longest fight in the game is the bot, not the board

`nerve`, `hand` and `legal` sample what the bot was handed before it acts.
Nothing was denied:

    57t attic-observatory bones  nerve 3  hand 5  legal 4.3  cpt 0.2  LOST
    38t study-library     taffy  nerve 3  hand 5  legal 5.0  cpt 1.0  LOST
    30t kitchens-cellars  bones  nerve 3  hand 5  legal 4.2  cpt 2.4  won

Same companion, same Nerve, same hand, same count of legal cards — and twelve
times the play rate in the fight it won. The bot held four playable cards and
passed, for fifty-seven turns.

### The confounded test, kept because the confound is the lesson

Swapping `naiveTurn` in everywhere dropped past-30 from 8 to 1 and raised `cpt`
to 3.1-4.1. **That proves nothing.** Naive dies in the FOYER in 43 of 50 runs
and never reaches attic-observatory or study-library at all, so those fights
disappeared because it never got there. End-state distribution is the tell, and
I nearly published the first number without looking at it.

### The controlled test

Play *only* the attic-observatory boss naively and leave everything upstream to
the competent bot, so the same deck arrives at the same board and exactly one
variable moves. Seed 379133, bones:

    competent   57 turns   95% of the board alive   cpt 0.2   LOST, run ends
    naive       under 30 turns (off the top-10)               run continues to
                                                              hedge-maze, wing 4

The naive bot resolves in half the turns what the beam spent 57 failing at, and
the run survives two more wings. **The longest fight in the game is a property
of `competentTurn`, not of the Watcher.**

It is not one boss, either: with attic-observatory naive, the new longest is
hedge-maze at 63 turns — `bones`, `cpt 0.6`, `legal 4.4`. Same signature. The
bot does this wherever it reads a board as unwinnable.

### What that means for the gate

`tests/run/run.py` exits 1 on "over30 is a hard failure", and over-30 is
substantially measuring the harness. `bot.js` already carries a naive floor for
exactly this — *"the beam occasionally talks itself into a long grind"* — but
takes it only when `heur.score > baseline.score`, scored by the same function
whose bias it exists to correct, and `staticScore` pays **+0.9 per unspent
Nerve and +0.7 per held card**. Nerve does not carry across turns, so at the
stop decision that credit is for a resource about to evaporate. That is the
first place to look, and it is still a hypothesis: I have not shown the beam
picks an empty sequence *because* of those two terms.

Caveat on the controlled test: once the first different card is played the RNG
diverges, so it is one sample rather than a repeated trial. The effect is large
enough to act on and small enough to re-check.

## Root cause, and my hypothesis was wrong

I named `staticScore`'s `+0.9 * energy` and `+0.7 * hand.length` as the first
place to look. **That was wrong.** `staticScore` only shapes the beam; the stop
decision is `projectedValue`, which contains neither term. Third confident cause
named in this file, third one that did not survive being checked.

The actual cause is in `residual()`:

    let v = 34 * Math.max(0, before.living - pool.living);

**It pays only for kills.** Damage that does not drop a body is worth nothing.
And the projection's only other route for damage is

    turnsLeft = Math.min(28, (pool.hp + pool.block * 0.6) / (dps * standing))

which is **capped at 28** — so against any boss whose pool exceeds about
`28 * dps` the cap is saturated and chipping it moves no term either. Both
channels are dead at once, and only for big-pool bosses. That is why every one
of the ten longest fights is a boss.

So the bot was not malfunctioning. It correctly computed that attacking a boss
was worth zero, held its hand, and maximised its own Courage instead.

### The fix, and what it costs

One term, `+0.15` per point of damage — a kill is 34, so a 350-Courage boss
prices at roughly 0.1 a point, and 0.15 is the smallest value measured to clear
the degeneracy:

    fights reached     491 -> 559     runs go deeper
    past 24             14 -> 13
    past 30              8 -> 5
    board >40% alive     5 -> 1       the stall-shaped ones
    victories            3 -> 4
    foyer defeats       32 -> 28

It plays better AND survives better, which is the opposite of the naive swap and
the reason this one is not confounded. Determinism, resume, localStorage and
mid-fight resume all still pass; `anchor.py` still agrees 5/5.

**The gate still exits 1** — five fights past turn 30, longest 57. Exactly one
ends with the board over 40% alive, and I checked which: the GREENHOUSE at 50%
with `summoned 212`. That is the Head Gardener treadmill this note already
established as working as designed.

**So after the fix there is no Guard-stall-shaped fight left in the sample at
all.** What remains past turn 30 is one grind, two fights the deck WON, and two
treadmills. The Guard axis that this entire note is named after turns out not to
be a live defect in the run gate — which is worth saying plainly, having spent
three sections and two wrong causes getting here.

**Every balance number in this repo predating this commit was measured by a bot
that could not see damage.** The ladder tables, the party sweeps, the Butler
Courage curve — all upstream of it. That does not invalidate the *method* in any
of them, but the absolute numbers should be re-measured before anything is tuned
against them.

## The boss wall table, re-measured

"Every boss, against a constant wing-one deck" above concluded that three bosses
raise a wall at or above the deck's entire output — study-library 0.92x,
bathhouse 1.25x, heart 1.40x. **That table was measured with the bot that valued
damage at zero.** Same config, same seed, fixed bot:

                        wall/swing         swing
      heart             1.40 -> 0.78     11.2 -> 16.5
      bathhouse         1.26 -> 0.68      7.7 -> 12.7
      study-library     0.91 -> 0.72      7.1 -> 11.1
      mean                                12.0 -> 15.8

**Nothing in the game is above 1.0 now**; the highest is the Heart at 0.78. The
wall did not move — the deck started swinging. `wall` is a property of the boss
and was measured correctly all along; `swing` was measuring the bot.

The ladder's shape moved in BOTH directions, which is the argument for
re-measuring the rest rather than assuming the fix only helps: pumpkin-grounds
17% -> 58% win and secret-passages 17% -> 42%, against sleeping-quarters
75% -> 58% and study-library 8% -> 0%.

## The blast radius scales with pool size, which is the diagnosis confirming itself

Three tiers re-measured at the same config and seed. The degeneracy needs
`turnsLeft = (pool.hp + block*0.6) / dps` to SATURATE at its 28 cap, so the
effect should scale with the Courage pool and vanish on small ones. It does:

    tier        mean pool   win            turns
    standard    small       99% -> 99%     6.6 -> 6.4    (-0.2)
    elite       205         79% -> 83%    14.8 -> 14.2   (-0.6)
    boss        large       26% -> 30%    25.7 -> 23.9   (-1.8)

That gradient was predicted by the mechanism before it was measured, and none
of the three runs was fitted to it. It is the strongest evidence in this file
that the cause is the right one — stronger than the fix working, which a wrong
cause can also produce.

**So the caveat is bounded, not global.** "Every balance number was measured by
a bot that could not see damage" is true but misleading: the standard ladder is
untouched, elite moves a few points, and only boss measurements move enough to
change a verdict. Re-measure boss and elite baselines before tuning against
them; the ordinary-content tables stand.

### One outlier survives the fix

`hedge-maze` elite: **19% win at 108% of the Courage pool** in cost, up from 12%
at 110%. It is the only tier row in the game that costs more than the pool it
is fighting, and the bot fix barely touched it. That is a content finding, not
a harness one, and it is the first thing in this investigation that has survived
every re-measurement.

## Co-op re-measured, and the raw comparison lies twice

Both party bosses re-run at the recorded config (n=16, sizes 1 and 4,
marmalade+bones, seed 90000). Neither headline number means what it looks like.

### The Butler: the mover is a deleted curve, not the bot

    size   win%            cost            effective 4p pool multiple
    1      62.5 -> 68.8    47.4 -> 44.2
    4     100.0 -> 100.0   16.2 -> 49.5    3.20 -> 5.70

`528/165 = 3.20` is exactly the last value of `partyHp: [1, 2.2, 2.8, 3.2]`,
the curve `butler.js` records as **cut** because it had been "fitted to a broken
instrument" — `lib/bot.js` turtling, the same defect class fixed today, found on
2026-08-28. The baseline artifact predates the removal. So the 3.20 -> 5.70 jump
and most of the cost change are that deletion, not the damage term.

What survives: **`fallen 0.00` at four Kids across 16 fights.** Nobody has ever
gone down. Solo drops someone in 31%. Four Kids now pay a real cost (49.5 vs
solo's 44.2) and still win every time, at `spread 0.60` — the damage is being
distributed, never concentrated into a kill.

### The Governess: content drift, then a small real regression of mine

Solo win 62.5% (August) -> 12.5% (now). Isolated on CURRENT content, same seeds,
only the damage term moving:

    coefficient      0.0     0.15
    solo win        25.0%   12.5%
    solo fallen      0.75    0.88
    solo cost        63.2    67.6
    solo turns        7.5    10.1
    4p win          93.8%   93.8%

So the collapse is **two causes**: 62.5 -> 25.0 is content drift since August and
nothing to do with the bot; 25.0 -> 12.5 is mine. At n=16 that is 4 wins against
2 — well inside noise on the win rate alone — but all four metrics move the same
way, which is more than the win rate is saying by itself. Four Kids are
untouched either way.

**Keeping 0.15.** Against one boss losing perhaps two solo fights of sixteen:
run.py past-30 8->5 and board-over-40% 5->1, boss ladder swing +32% and win
26->30%, elite win 79->83%, standard unchanged, Butler solo 62.5->68.8. The
Governess is recorded here as the one place it measured worse.

**And the Governess at 25% solo on the old bot is a finding in its own right** -
nobody measured her after whatever content moved between 2026-08-29 and now.
That is a difficulty regression the co-op question was hiding.

## The Governess was never the problem: the room in front of her was

Chasing the "difficulty regression" ended somewhere else entirely.

She costs **63% of the player's pool**; the Butler costs 61%. She is not
overpriced. The player was arriving at her door on **62% Courage — the lowest
arrival in the game**, against 88-100% everywhere else.

### What the discriminator said

Comparing the solo fight internals, old bot on both sides, told me immediately
it was not her:

    aimed at the player   148.2 -> 98.8     she attacks LESS
    damage blocked         96.8 -> 29.8
    Guard raised          152.3 -> 38.5     the player defends far less
    damage taken           51.4 -> 69.1

Her damage per turn is unchanged (13.3 -> 13.2 aimed/turn). And the Butler bench
run on the same day shows the player's Guard per turn UNCHANGED (7.1 -> 7.6), so
Guard generation is healthy globally. The collapse was nursery-only.

### The cause, and it was in the design chapter all along

Every one of the nine Nursery enemies ships above its authored Courage:

    Button Baby 21/30 · Jack in the Box 32/46 · Patchwork Soldier 38/55
    Rocking Horse 42/60 · Blanket Blob 34/50 · Porcelain Doll 36/52
    Toy Chest 110/132 · Patchwork Giant 126/150 · Porcelain Twins 68/80

Uniform ~1.44x on normals, ~1.19x on Big Scares. Three checks made it a bug and
not a divergence, all run before a number was touched: regions 1 and 3 match
their chapters **byte for byte**; nothing in the source justified it; and the
Patchwork Giant's own code scales its 90/60/30 Patch tears by `maxHp / 126` —
the chapter value, hardcoded — so at 150 the authored tears silently became
107/71/36 and no test noticed, because the only test that could have was
calibrated against the drift.

### Verified

    standard ladder   nursery 39% -> 21% of pool, rank 1 -> 5 of 17, pool 117 -> 79
    elite ladder      82% -> 68%, win 69% -> 75%
    boss door         arrives at 62% -> 83%, margin 9pp -> 19pp (was worst in game)
    Governess         solo 12.5% -> 25.0%, 4p 93.8% -> 100% at fallen 0.00

**No other region moved by more than 2pp at either tier.** Gates green: nursery
71/0, enemies 275/0, coop balance DONE, run.py unchanged at 558 fights with
every determinism and resume check passing.

### The part worth keeping

**The ladder had been reporting this since August.** Nursery 39% of pool against
a 15% median, rank 1 of 17, in the August artifact as well as today's. It was
read as a boss problem every time it came up. The instrument was right and the
question asked of it was wrong — "which boss is overtuned" instead of "which
room is this number pointing at".

And it was never a regression at all. The August 62.5% bench figure was the
outlier, not today's number.

`tests/design-courage/check.py` gates the class now: 120 enemies against their
chapters, 3 declared divergences, 0 failures, red on reintroducing the bug.
