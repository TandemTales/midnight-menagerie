# The advanced pool was one row deep

2026-08-31. A hundred and two authored formations — the largest encounter tier
in the game — were drawn from **1.7% of the time**. Found by asking a question
the design chapter asks first: does the tutorial region teach what it says it
teaches? Every number here was run against this tree.

## The question the design asks

`docs/design/regions/01-foyer.md` §33 is a contract, and an unusually checkable
one:

> By the time they defeat The Butler, the player has been taught, **primarily
> through combat rather than pop up tutorials** …

— then ten lessons, each carried by one of the wing's six ordinary enemies. The
chapter rejects pop-ups outright. That means the encounter ladder **is** the
onboarding, and the only way a lesson can land is if the player meets the body
that carries it. So it can be measured.

    the enemy            the lesson it carries                         runs met
    dust-bunny           some enemies become dangerous when ignored     40/40  100%
    lost-luggage         deck pollution exists                          33/40   83%
    coatrack-crawler     attacks can be weakened before they happen     27/40   68%
    calling-bell         small support enemies are priority targets     16/40   40%
    door-greeter         a rule can alter sequencing                    13/40   33%
    red-carpet-runner    large attacks are telegraphed                   0/40    0%

**A run met 3.2 of the six. No run met more than five. The Red Carpet Runner was
never met once**, in forty unaided expeditions through a wing every single
expedition walks.

## Why, and it is one line

The Runner lives in `foyer-11` and `foyer-12`, both tier `advanced`. And
`state/run.js`'s `tierFor`:

```js
if (node.row < 2) return 'early';
if (node.row < rows - 2) return 'standard';
return 'advanced';
```

`advanced` is asked for only on row `rows - 2` — which is `lastWalk`, the boss's
**door row**. `mapgen.js` deliberately gives that row over to the guaranteed Safe
Room and the real choice beside it; measured over 300 Foyer sheets it is 26%
Safe Room, 13% shop, 13% treasure, 13% Big Scare and **11% Scuffle**. And
`pickNode` scores a deep Safe Room at 400, so the router takes it.

One row, one room in nine, and the bot walks past it.

## The number that is immune to the confound

A wing late in the route is *entered* rarely, so a formation it never rolls
might only be sampling. This is not that number. Of the fights that actually
happened, across all fifty expeditions, which tier band were they drawn from:

    tier       fights   share    formations authored
    early        194    33.9%     69
    standard     248    43.4%     70
    advanced      10     1.7%    102
    elite         28     4.9%     52
    boss          92    16.1%     17

**102 formations authored, ten fights.** Roughly forty per cent of the game's
ordinary combat content, written and gated and reviewed, reachable one time in
sixty. It is not rare content; it is dead content.

And it made a rule dead with it. `REGION_RULES.foyer` carries
`minScuffle: { 'red-carpet-runner': 2 }`, which is §10 of the chapter — "Red
Carpet Runner cannot appear before the player has completed at least two Foyer
Scuffles." The rule is implemented correctly and consulted by `rollEncounter`.
It could never bind, because the tier gate was strictly more restrictive
everywhere. A floor turned into an unreachable ceiling.

## The fix, and what it cost

The chapter's own words for §9 are "these appear **deeper in the region**" — not
"on the last row". So `advanced` becomes the last four walkable rows:

```js
if (node.row < rows - 5) return 'standard';
```

`early` stays exactly two rows, which is also the only two rows `mapgen` can
place nothing but a Scuffle on, so the on-ramp and the forced fights still line
up. At every region size (13–15 rows) this gives `advanced` four rows.

    tier         before          after
    early        194  33.9%      189  34.3%
    standard     248  43.4%      150  27.2%
    advanced      10   1.7%       96  17.4%
    elite         28   4.9%       28   5.1%
    boss          92  16.1%       88  16.0%

**Ten fights to ninety-six.** The Foyer's advanced holes went from 2 of 6 to
**none** — every formation in the wing now rolls.

And it cost nothing measurable:

    foyer defeats           28 -> 28
    foyer cost per fight    24.0% -> 24.5% of pool
    arrival at the Butler   85% -> 84%
    margin                  21pp -> 20pp
    lost at the Butler      15 -> 14
    victories                7 -> 6

That is the whole difficulty effect of making forty per cent of the combat
content reachable: nothing the harness can distinguish from noise. The reason is
in the ledger from earlier today — the back half of the ladder prices at 0.0–0.6%
of pool per fight, so a player who reaches it is not troubled by a harder
formation. The deep content was not being withheld for balance. It was being
withheld by an off-by-three.

## What this did NOT fix

The Foyer still cannot teach its own contract. After the change a run meets
**3.5 of the six**, with the Runner at 15% and the Calling Bell at 40%:

    dust-bunny 98% · lost-luggage 85% · coatrack-crawler 60%
    door-greeter 50% · calling-bell 40% · red-carpet-runner 15%

The arithmetic is against it. A run fights about **4.7 times** in the Foyer and
there are six enemies across fourteen formations, so random rolling cannot cover
six teachers in five rooms — no tier band fixes that. Meeting the contract needs
the first wing's roller to *cover* rather than sample.

## So the roller covers now — 2026-09-01

The design already asks for this and I had misread it as a preference. §10 is
explicit: "The procedural system **should not treat all formations equally**."
And §33 states the teaching as an *outcome* — by the time they defeat The
Butler, the player **has been** taught — not as an intention. Covering is the
implementation of two things the chapter already says.

One soft rule in `rollEncounter`, after every hard rule and before the weighted
pick: among everything still legal, prefer a formation carrying a body this run
has not met **in this region**. It is a `soften`, so the moment there is nobody
left to introduce it vanishes and normal weighting resumes — which is most of a
long region, and all of a region already toured. It cannot deadlock and it
cannot override a hard rule, because every hard rule ran above it.

    the enemy            before   after
    dust-bunny             98%      98%
    lost-luggage           85%      93%
    coatrack-crawler       60%      88%
    calling-bell           40%      65%
    door-greeter           50%      58%
    red-carpet-runner      15%      33%

    a run meets            3.5      4.3   of the six
    runs meeting ALL six     0        8

**Eight runs in forty now meet the whole roster, where none ever had.** And it
is not a difficulty cost — it is slightly cheaper: Foyer cost per fight 24.7% →
23.2% of pool, the ordinary Scuffle 11.9 → 10.7, arrival at the Butler 84% →
86%, defeats 31 → 31. Covering means fewer repeat fights against the same
escalating body, which is the same reason the design wanted it.

The contract is still not fully met — 4.3 of six, and the Runner at 33%, because
a run only fights ~4.7 times and two of those rooms are the forced opening pair.
Closing the rest means either more fights in the first wing or fewer teachers in
it, and both are design calls. `tests/run/run.py` prints the teaching table
every run, so the number is watched either way.
