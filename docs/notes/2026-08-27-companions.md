# Completing the Companion roster

Started 2026-08-27. One file for the whole programme; a section per Companion as
each lands.

`schema.js` lists **16** Companions and only the ones `data/cards.js` imports can
be played. At the start of this round that was five — Marmalade, Bones, Pipkin,
Taffy, Wink. Ten more are fully designed under `docs/design/companions/`, and
**Crinkle, the Paper Crow has no design at all** (no chapter, and none in the
source `.docx` — his entire spec is one line about card duplication and folding).
He cannot be built until somebody designs him.

Art is not on the critical path: all 16 portraits and thumbnails are already
prepped, the Menagerie board has 16 painted frames, and `COMPANION_SPECIES` in
`select.js` already covers the whole roster.

---

## 0. First, the bug that made the unbuilt ones dangerous

Before any Companion work: a Rescue could free a Companion that had no card pool.
Measured on the real code, **178 of 200 seeds** had the Foyer boss free an unbuilt
Companion, because the authored table points Wing 1 at Marmalade — a starter who
is already home — so `rescueTargetFor()` took its substitution path on nearly
every run. The freed slug was written to the lifetime save at `end()`,
`availableCompanions()` then made it pickable, and `startingDeckFor()` answered
`[]`: **a run that began with an empty deck, no throw, no console output.**

Fixed in `state/run.js`:

- `missingCompanions()` filters on `companionDef(s)` — the card registry itself,
  so the gate opens by itself as each Companion is built. 0 of 200 now.
- `_makeKid()` asserts at the join: fatal under `detectStrict()`, `console.error`
  in a shipped build, because an old save can still name one and CONTRACTS says
  degrade rather than throw at a player mid-run.

`tests/backpack` used Hush and Mopsy as examples and had to move to Wink, plus two
new checks that assert the gate directly.

---

## 1. Boggle, the Monster Under the Bed  ✅

`sleeping-quarters`. 4 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op.
Built first because the Sleeping Quarters actually ship, so he is who a Rescue
most often frees — and because his systems map onto machinery Wink already proved.

### One new engine primitive

Search needed the ability to **replace an enemy's current action with a supplied
move**. `intents.js` had swap, postpone and delete, but nothing that substitutes,
and Search belongs to no enemy's `def.moves` — every enemy in the game can be made
to do it.

`overrideIntent(engine, enemy, move)` + `clearIntentOverride`. `rebuildPlan`
applies the override after deriving, so a rebuild cannot quietly undo it, and
`consumePlan` clears it once the substituted action has been taken. The original
action is spent, exactly as `deleteIntent` spends it. Anchored intents refuse,
like every other queue edit.

The design requires the intent display to change **the moment Boggle hides**,
not when the enemy acts, and it does.

### Two things that were easy to get silently wrong

**Awareness is one state.** `unaware` and `suspicious` are both `stacks:false` and
mutually exclusive, and every transition goes through `setAware`/`hide`/`suspect`
rather than `U.apply`. A card that applied `suspicious` without clearing `unaware`
would leave an enemy in both and `isAware()` would answer false forever.

**Ambush resolves before the state changes.** The spec is explicit that the target
stays Unaware until the whole Trick has finished, including every hit and every
Scare clause. So an Attack never flips the target itself — it queues the change and
the `eff()` wrapper settles it after awaiting the effect. Flipping inside the
effect made the second hit of a multi-hit Ambush miss its own bonus.

### `U.addRes`'s min/max are ignored for counter-backed resources

Lurk reached 6 against a cap of 5. When a resource has an engine counter track,
`addRes` hands the whole delta to `addCounter` and its own `min`/`max` are never
consulted — the counter's declared max is the only ceiling. The cap is clamped at
the call site now, and `_util.js` says so on `addRes` for the next Companion.

### The bug only the screen could show

The HUD read **"LURK 0 / 7"** to a player whose real cap is 5, because the track
was declared at the raised Underbed Kingdom ceiling. It is declared at 5 now and
the Power *redefines* the counter to 7, carrying the banked value across as
`start` so playing it does not reset the Lurk you spent turns earning. Every
suite was green while that was on screen.

### Balance

The cards suite's damage bands flagged 13 cards. None were silenced: multi-hit
Tricks declare `nums.hits`, conditional bonuses were renamed to `m0` so the band
check sees the real ceiling (which is also the better idiom — Ambush reads as a
bonus rather than a replacement), Underbed Uppercut was genuinely under-costed and
went 11→12 base, and the four that scale off Lurk or the room carry a
`balance.scalesWith` note. 559 cards, 0 errors, **0 warnings**.

### Verification

`tests/boggle/run.py` — **28 checks**, all asserting an EFFECT rather than the
absence of an exception, because CONTRACTS trap 12 is explicit that four dead
cards passed exactly that check. It drives a real engine with real enemies and no
mock of any Boggle mechanic: the enemy really became Unaware, the Search really
replaced the Attack and cost 0 Courage, the Scare really spent the Fright, the
below-threshold Scare really left it alone, Wait For It really makes an Attack
unplayable.

One gate needed widening: `tests/turn-events/check.py` accepted only a guard
against `'player'`, and Boggle's Suspicious timer is an enemy-turn listener on
purpose. The gate's own stated rule is that a listener must *say which side it
means*; it now matches either literal.

Full pass: cards 559/0/0 · combat 677 · run 50 · coop 591 · backpack 79 ·
enemies 37 · audit 2061 · all six gates · 61 fps on the real GPU, no console
errors, Boggle on screen with his portrait, his Lurk track and his keywords.

---

## 2. Mopsy, the Rag Doll Bunny  ✅

`nursery`. 6 basics + Scrap + 20 commons + 35 uncommons + 25 rares + 5 co-op.
The other Companion whose region actually ships, and much deeper engine work
than Boggle: she needed a new damage-pipeline step, a fifth pile made visible,
and card-instance modification.

### One new pipeline step: `onCourageLoss`

Cushion is defined as "when an Attack would cost her Courage **after Guard is
applied**, halve it". `onIncomingHit` fires *before* Guard is consulted, and
`onLethal` only fires on a killing blow — so no point in `damage.js` could see
the number Cushion is defined against, let alone change it. A reducer would not
have worked either: Cushion has to be able to *decline*, because it costs
Stuffing and it is once per enemy turn.

`onCourageLoss` is a void hook with a mutable payload, dispatched where `hpLoss`
is computed and **before** `onLethal`, so halving a killing blow can save you.

### The Torn pile was already in the engine and nothing drew it

`stash` has always been a real pile with a real cap, snapshotted into
`engine.state` — no scene had ever rendered it. `scenes/combat.js` grew a Torn
button beside Draw and Discard, hidden while the pile is empty rather than gated
on the Companion, so anything that ever stashes a Trick gets a visible pile
instead of cards silently leaving the game.

### The bug that ate every Patch

The `card:play` listener guarded its seat with `ev.seat !== seat`. The tracker's
third argument is the **actor**; `ev.seat` is a **number**. The comparison was
never equal, so the listener returned on its first line every single time and
**every Patch was inert** — the card played, the events came out, the suite was
green, and nothing happened. Boggle had the identical bug in the listener that
sets `attackedThisTurn`, which silently made "playable only if you have played
no Attack this turn" always true. Both now compare `ev.actorId` to `seat.id`,
the way `U.onPlayerTurn` already did, and both have a test that asserts the
restriction rather than the card.

Related, same family: `card:play` carries a **snapshot** in `ev.card`, not the
runtime card, so Patches stored on `card.meta` were invisible to it. Look the
card up by `ev.cardUid`. CONTRACTS trap 11, twice in one listener.

### Two more the screen caught

- Cushion and the Patch cost rule were two separate inherent statuses, so Mopsy
  opened combat with a mystery chip in her status row explaining nothing. The
  cost hook now rides on the Cushion status, which is one thing the player can
  actually be told about.
- `unaware`, `suspicious`, `lurk` and `stuffing` had **no icons** and were all
  drawing the fallback lozenge. Four glyphs added (`unaware` deliberately reuses
  `hidden` — same idea, and a second glyph would only make the row harder to
  read).

### One stated design deviation

The doc gives Quick Patch (Common) the identical line to Beginner's Patch
(Basic), which makes the Common a strictly redundant copy of a Basic — and the
cards suite catches it as "2 cards share one effect shape". Quick Patch reaches
the discard pile as well as the hand: the smallest change that earns it its slot
in the 80. Flagged per CONTRACTS rule 8.

### Verification

`tests/mopsy/run.py` — **27 checks**, all asserting effects: Cushion halves 13 to
7 and spends exactly one Stuffing, the *second* hit in one enemy turn is not
Cushioned, a Hollow Mopsy cannot Cushion at all, and 16 into 6 Guard becomes 5
(proving the after-Guard ordering). Patches attach with the right Stitches, fire
on play, spend a Stitch, survive being Torn, and the cost Patch really changes
the cost. A Torn Trick is in the Torn pile and **not** in exhaust — Tear is not
Vanish.

The suites' auto-resolver takes the lowest index, so the tests empty the hand and
leave exactly one candidate rather than scripting chooser indices that would move
the moment the deck changed.

Full pass: cards 651/0/0 · combat 677 · run 50 · coop 591 · backpack 79 ·
enemies 37 · audit 2061 · chrome 27 · six gates · 61 fps, no console errors.

---

## 3. Wisp, the Baby Will-o'-Wisp  ✅

`lampworks`. 4 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op. Glow,
Bright/Blazing, Linger X, the Gloaming, Afterglow, Converge, Hasten/Delay, Flare.

### A batch is ONE batch

Every countdown ticks simultaneously and everything reaching 0 resolves together
as a single batch with **at most one Convergence, however many are involved**.
Ticking in a loop and resolving each Trick on its own would fire Converge once
per card and quietly turn every archetype into the Convergence one. The suite
asserts exactly this: two Afterglows in one batch produce one Convergence, and
one alone produces none.

An Afterglow is also **not a Trick being played** — it never goes through
`playCard`, so nothing that rewards playing Tricks sees it. Asserted.

### The bug that was also in Wink, shipped

`Linger` moved the card to `limbo` from inside the effect and it kept ending up
in the discard pile. The engine parks a resolving Trick in LIMBO and, the moment
the effect returns, checks whether it is still there and pushes it to discard —
so moving it to limbo from inside the effect is a no-op the engine then undoes.

**Wink's Sets have done this since they shipped.** A Set is specified as "placed
face up outside your deck in one of 3 slots"; the card was going to the discard
pile, where it could be reshuffled, redrawn and played again while the original
Set was still armed. Both now finish the move on `card:resolved`, which is
emitted after the engine's placement, and `tests/wink/run.py` exists to keep it
that way.

### Four cards that were one card

The doc gives Wait... Wait..., Boo! Eventually, Two Rooms Over and Long Fuse the
same line at four rarities, and the cards suite is right that a pool should not
be four copies of a Basic. Each keeps its printed numbers and countdown and
gains one thing pointing where its own flavour already pointed: the Basics drop
their Glow (a Basic should teach the mechanic, not run the engine), Two Rooms
Over lands on the strongest enemy because it is happening somewhere else, and
Long Fuse pays Guard as well after three turns of waiting. Same for Nightlight
Practice against Put It Somewhere Safe. Stated per CONTRACTS rule 8.

### Verification

`tests/wisp/run.py` — **25 checks**: the Trick really leaves circulation, the
countdown really ticks, Hasten to 0 resolves immediately, Delay pushes it back,
Flare spends Glow only when there is Glow to spend, Bright and Blazing gate what
they say they gate. `tests/wink/run.py` — 5 checks on Set placement.

cards 740/0/0 · combat 677 · run 50 · coop 591 · boggle 30 · mopsy 27 · six
gates · 61 fps, no console errors.

---

## 4. Count Crumbula, the Vampire Chinchilla  ✅

`ballroom`. 4 basics + Leftover + 20 commons + 35 uncommons + 25 rares + 5 co-op.
Appetite (Hungry / Sated), Bite Marks, Feed X, Queasy, Indulge, Leftovers.

The point of him is that **feeding is not automatically good**: Appetite pays at
both ends, so healing out of Hungry switches off half the deck.

### Three rules the code has to hold

- **Feed resolves one Bite Mark at a time**, because cards ask whether he became
  Sated *partway through* a large Feed.
- **One Queasy per Feed effect**, however far past maximum it runs. Counting per
  mark would make a single overfull Feed 3 cost three turns of Nerve. Asserted.
- **Indulge is not damage**: through Guard, counts as Courage lost, never below
  1, and an Indulge he cannot pay simply does not happen. All three asserted.

### A new engine capability: `StatusDef.energyDelta`

"Start your next turn with 1 less Nerve" could not be written. Three placements
were all silently wiped: a `turn:start` listener runs before the refill; an
`onTurnStart` status hook *also* runs before it; and `_dealSeatTurn` then **sets**
Nerve to the maximum, erasing anything taken beforehand.

`energyDelta` is the twin of the `drawDelta` the engine already had — measured in
`_openSeatTurn` alongside the draw penalties and applied to the refill itself,
which is the only point where a "start with less Nerve" status can work at all.

### The gauge said STARTS

`scenes/combat.js` derived a counter's band word by **regexing its description**
(`/([A-Z]...) at (\d+)/`), and its own comment said the clean fix was upstream.
The upstream fix already existed — `defineCounter` normalises a `states` array
and ships it in the snapshot — but nothing read it. So Crumbula's description,
"Starts at 2 and drops by 1...", matched, and his gauge read **APPETITE 2/6 |
STARTS**.

`counterState()` reads declared bands now and keeps the regex only as the
fallback for counters that predate them. Crumbula gained the middle band the
design names (Peckish), and Boggle's Lurk gained bands too — its description
ends "Caps at 5", which would have printed CAPS on the gauge at 5 Lurk.

### Verification

`tests/crumbula/run.py` — **25 checks**, all effects: the mark is really eaten,
the Courage really comes back, Appetite really rises, an unmarked enemy really
feeds nothing, the overfull Feed gives exactly one Queasy, Queasy really costs
the Nerve, Hungry and Sated really gate First Course and Velvet Nibble, Indulge
really goes through 20 Guard without touching it.

cards 830/0/0 · combat 677 · run 50 · coop 591 · chrome 27 · combat-scene 22 ·
boggle 30 · mopsy 27 · wisp 25 · wink 5 · six gates · 57 fps, no console errors.

---

## 5. Hush, the Shadow Ferret  ✅

`secret-passages`. 5 basics + 4 Contraband + Dust Bunny + 20 commons + 35
uncommons + 25 rares + 5 co-op. Shadow Pocket, Stash, Scurry, Unseen, Ambush,
Pilfer.

### The Pocket is what `stash` was built for

The engine's `canPlay` already accepted `Pile.STASH` — the zone exists precisely
so a Companion can have a second, playable hand. Mopsy's Torn pile borrows the
same pile for the **opposite** job, which is why hers are flagged unplayable and
his are not, and why the pile button now takes its name from whoever holds it:
**Torn** for Mopsy, **Pocket** for Hush, **Stash** for anyone else.

### Unseen is not armour

It breaks on Courage actually lost — a hit entirely absorbed by Guard leaves him
hidden — and on playing an Attack. **The ordering is the whole Companion**: from
the hand he is Seen *before* the Attack resolves, so no Ambush; from the Pocket
the Attack resolves *first*, Ambush and all, and he is Seen after. Both halves
live in the `eff()` wrapper so no individual card can implement only one, and
the suite asserts the same Attack dealing 10 from the Pocket and 6 from the hand.

### One new engine field: `card._playedFrom`

By the time an effect runs its card is already in LIMBO, so "can only be played
from the Shadow Pocket" and every Ambush clause had no way to ask where it came
from. The engine keeps the pile it pulled the card out of, exposed as
`ctx.playedFrom`.

### The seams gate could not see ES6 shorthand

It reported Hush reading `ev.kind` off the `damage` event as a field the event
"never carries". The event does carry it — as a bare `kind,` — and
`top_level_keys()` only matched `key:` with a colon, so every shorthand property
in every event payload was invisible.

Teaching it shorthand immediately produced 25 **false** positives, because the
key branch never skipped past its VALUE either: `{ defender: enemy, amount: d }`
read `enemy` and `d` as keys as well. The scanner now steps over values, reads
both forms, and was negative-tested — a deliberately bogus field still fires,
and the gate's own "carries:" list now includes `kind`.

### A stale test of my own

`tests/backpack` named `hush` as its example of an unbuilt Companion, and broke
the moment Hush was built — the same way it had named `mopsy` before. It derives
the built and unbuilt sets from the registry now, so it cannot go stale again.

### Verification

`tests/hush/run.py` — **17 checks**: the Pocket takes three and no more, a Trick
in it can be played (unlike Mopsy's Torn), Guard-absorbed damage does not reveal
him, Courage loss does, the Ambush ordering both ways, drawing is not a Scurry
but Stashing is, and Pilfer produces the Contraband matching the enemy's live
intent.

cards 925/0/0 · combat 677 · run 50 · coop 591 · backpack 80 · chrome 27 ·
boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · wink 5 · six gates · 61 fps.

---

## 6. Truffle, the Zombie Hedgehog  ✅

`hedge-maze`. 5 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op. Quills,
Shed, Loose Quills, Gather, Regrow, Bristle, Ragged.

### Bristle is not "when attacked"

It fires only when an Attack **actually costs Courage** after Guard and every
other prevention, so a hit the Guard eats does nothing and a Bristle turn is one
where he lets a manageable hit land on purpose. It runs on the `onCourageLoss`
step added for Mopsy's Cushion — the third Companion to need that point in the
pipeline, which is a good sign it was the right place.

**One Attack ACTION triggers it once**, however many hits it contains. A
`bristle-used` marker on the attacker decaying at `enemyTurnEnd` is what enforces
that; counting per hit would let a four-hit move eat four Bristle. Asserted with
a three-hit attack consuming exactly one.

With no Quill to Shed the Bristle is still consumed and nothing is thrown back —
also asserted, because the spec says so explicitly and the tempting
implementation is to bail out early and keep the stack.

### Two Quill pools

Attached Quills and Loose Quills are separate counters, and Gather refuses to
overfill him — the remainder stays on the floor rather than evaporating. Both
directions asserted.

### One stated balance deviation

The doc gives Tiny Disaster "very heavy damage" at 0 Nerve, which lands at 21 and
outside the cards suite's 3–12 band for a 0-cost Rare — and that band exists
precisely to catch a free finisher. Held at the ceiling instead: still 12 for
nothing while Ragged, and it costs two Quills and the card.

### Verification

`tests/truffle/run.py` — **23 checks**, all effects.

cards 1015/0/0 · combat 677 · run 50 · coop 591 · backpack 80 · six gates ·
58 fps, no console errors.

---

## 7. Drizzle, the Raincloud Ghost  ✅

`bathhouse`. 4 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op. Weather,
Stormbreak, Soaked, Conduct, Forecast.

She is the first Companion whose signature mechanic belongs to the **table**
rather than to a seat, and that was the thing to settle before writing a card.

### Weather is a shared counter, and it had to become possible

Her chapter opens "Weather is a global combat state", and it acts on the shared
enemies — Downpour re-Soaks all of them, Clear dries all of them. Every counter
in this engine is keyed per seat in a party (`_ckey` prefixes the owner id), and
`scenes/combat.js` skips any counter whose `ownerId` is not the local seat. So
the obvious implementation gives two Drizzles **two Weathers**, both soaking and
drying the same board out of different states, and passes every solo test.

`defineCounter` takes `shared: true` now: `_ckey` does not prefix it, the scene
shows it to every seat, the snapshot carries the flag, and — the part that would
have been a silent no-op — `_clone` copies the shared-id set, or the preview
engine re-prefixes every shared id and the cloned counter becomes unreachable.
`counterState(id)` also gained an owner argument; it was looking up the raw id,
which misses every seat-prefixed counter in a party.

The suite asserts the point directly: two Drizzles read one Weather, seat 1 sees
the storm seat 0 raised, there is exactly ONE `weather` key at the table — and
**two** `forecast` keys, because the Forecast row is still one per Kid and the
shared flag must not have leaked.

### "At the start of your next turn" did not work, for anybody

Silver Lining banks Guard for next turn. It never arrived. `turn:start` is
emitted **before** `_openSeatTurn` wipes Guard, so Guard handed out from a
turn-start listener is deleted a few lines later, silently.

**Truffle shipped five cards on that path** — Hard to Finish, Refuse to Stay
Down, Carpet Check, Sweep the Floor, Still Wiggling — banking Guard or Nerve
that was erased before the player ever saw it, with a green suite. Measured on a
scratch probe rather than argued from line numbers: 40 banked Guard arrives as
**0**; the same 40 through a scheduled `playerTurnStart` timer arrives as 40.

Nerve is worse and needed engine surface. `_dealSeatTurn` **sets** Nerve to the
maximum after every start-of-turn effect has run, so even a timer is wiped —
trap 21 pointing the other way. `ctx.bankEnergy(n, seat)` adds to the refill
itself, per seat on `flags` so it survives `clone()`, unlike the engine-wide
`drawDeltaNextTurn` beside it which in a party is consumed by whichever seat is
dealt first.

Both fixes live in `_util` as `guardNextTurn` / `energyNextTurn` so the next
Companion reaches for the working idiom, and `tests/truffle` now asserts both —
Hard to Finish really pays its 4 Guard, Carpet Check's Nerve really survives the
refill at 4 against a maximum of 3.

### Three things the engine does not do that I nearly assumed it did

- **`costMod` on a CardDef is read by nothing.** Gutter Rush and Bolt from the
  Blue were written with it and would have been silently uncosted. The real seam
  is `CardDef.dynamicCost(ctx)`, which computes the printed cost and still lets
  discounts compose on top. Asserted both ways: Gutter Rush is 2 on a still
  evening and 1 once the Weather has advanced.
- **The `damage` event carries `sourceId`/`targetId`, not `attacker`/
  `defender`.** Damp House and the lent-Conduct listener both read the wrong
  fields. The seams gate caught both — this is trap 11 and the gate is why it
  cost ten minutes instead of a round.
- **`U.removeOneDebuff` removes a debuff.** Wash It All Away strips a *buff* off
  enemies, so it would have removed Drizzle's own Weak from the target.

### One stated deviation, and one card the doc under-specified

Drip Drip Drip (Common) is printed with the identical line to the Basic Just a
Sprinkle; it draws a Trick as well, which is where its own name already pointed.

Housewide Thunderclap is printed identically to Splashdown, a Common — and the
doc also calls it "deliberately one of Drizzle's strongest Thunderstorm payoff
Tricks", which it was not: the Thunderstorm bonus Conduct is universal, so at 3
Nerve it was Splashdown with bigger numbers. It Soaks the room first during
Thunderstorm, so the Conduct is guaranteed to reach the whole board. Both stated
per CONTRACTS rule 8.

### The bug only the screen could show, again

`FORECAST 0/5` to a player whose real capacity is 3 — the HUD prints the
*declared* max, and trap 20 says to declare a counter at its highest reachable
value. That is right about not losing gains and wrong about the gauge. Boggle's
Lurk shipped the identical bug ("LURK 0/7" against a cap of 5). The track is
declared at 3 and Cloud Calendar / Forecast Says Me **redefine** it at 4 and 5,
carrying the waiting Forecasts across as `start`. Two checks now assert the
gauge, not just the capacity.

### Verification

`tests/drizzle/run.py` — **70 checks**, all effects: the Stormbreak really does
not dry the board while an enemy turn that *began* in Clear does; Conduct really
does not fire on a dry primary and really reaches the other Soaked enemy for
exactly its marked damage; Thunderstorm's bonus really repeats on the primary
once and not twice; a Forecast really leaves circulation, really waits for the
state to be *entered* rather than occupied, really does not count as a Trick
played, and really lands in the discard afterwards; Strange Weather Vane really
is a one-shot; Storm in a Teacup really prevents the automatic break and not a
forced one; Quiet After really refunds all 3 Nerve rather than 1.

cards 1104/0/0 · combat 677 · coop 591 · run 50 · backpack 80 · enemies 37 ·
audit 2061 · six gates · truffle 27 · boggle 30 · mopsy 28 · wisp 25 ·
crumbula 25 · hush 17 · wink 5 · 60 fps, no console errors.

---

## 8. Pudding, the Graveyard Pug  ✅

`graveyard`. 4 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op. Best
Friend, Loyalty, Plots, Bury, Dig Up, Unearthed, Graveside.

Much less new engine than Drizzle — almost all of him lands on machinery three
other Companions already proved — but two of the things he needs did not exist
and three APIs I reached for were not what I assumed.

### A Plot is a slot, and the stash is now doing four jobs

Bones buries Tricks in `stash` with a countdown on the card; Mopsy tears them
there; Hush plays out of it. Pudding's three Plots are the same pile again with
slot semantics on top — each Plot performs ONE cemetery operation per turn, so
"which Plot" is a real question and the plot has state the card cannot carry.
The cards live in `stash` (the engine owns them, the pile renders, a save keeps
them); a parallel row records which slot holds what and whether it has been
turned over. `stashCap` was already 3, which is exactly three Plots; Family Plot
raises it to 4.

**Trap 17 again:** `Pile.STASH` is playable, because it exists for Hush's second
hand. A Buried Trick explicitly cannot be played, so it is flagged `unplayable`
the way Mopsy's Torn pile had to be. The suite asserts `canPlay` really refuses
one, not merely that the flag is set. The pile button now reads **Plots** for
him — Torn, Pocket, Plots and Stash are four names for one zone.

### Three APIs that were not what I assumed

- **`retargetMove` does not exist.** Take Me Instead redirects an Attack, and I
  wrote it against a method I had invented. The engine's actual answer is the
  `racket` status — `intentTargetFor` prefers a seat wearing it over the move's
  own party preference. Better anyway: rewriting an enemy's pending move would
  fight the intent display, which is shown before the players act and has to
  survive a replay.
- **`onLethal` names the victim `defender` and survives via `setHp(n)`.** I had
  written `h.actor` and `h.survive?.()` — wrong field, invented method, and an
  optional chain on a contract API, on the one Power whose entire job is not
  being silent (CONTRACTS rule 8, three ways at once).
- **`moveCard` acts on the ACTING seat's piles**, so moving a teammate's own
  card looks right and moves nothing. `giveCard` is no help — the card already
  exists. Added `ctx.allyMoveCard(pl, card, pile, opts)`, its twin, which two of
  his co-op Tricks need.

### "Once each turn you may" has no trigger

Cemetery Gates and The Whole Pack are both optional actions with no Trick to
hang off. They are offered at the top of the turn, and only when they could
actually do something — a prompt for nothing every round is worse than the
Power. Same shape as Drizzle's I Am the Weather.

### The probe earned itself again

`tests/pudding` failed one check: "Unearthed really doubles Dug Up Trouble —
unearthed 12 vs plain 9". Two wrong diagnoses (Guard, then a mis-picked card)
before probing it properly, which showed the mechanic was **perfect** — two hits
really fired — and the TEST was wrong: reaching Unearthed costs a whole enemy
turn, and that turn leaves Weak on Pudding, so it was comparing 2 hits of 6
against 1 hit of 9. A control has to be measured in the same conditions as the
thing it controls for. Cost about ten minutes; guessing had already cost more.

### Verification

`tests/pudding/run.py` — **46 checks**: a Buried Trick really cannot be played,
a Plot really refuses a second operation in one turn and really allows one next
turn, Graveside really needs two, Unearthed really doubles and really expires
with the turn, Loyalty really caps and Forever Home really widens the gauge with
the banked Loyalty intact, Collar Snap really takes the Loyalty for its third
hit and really hits twice without it, all three dynamic costs really move, a
Trick naming both "you" and "your Best Friend" really pays once in solo, and
Never Drop the Ball really ends up in a Plot rather than the discard.

cards 1193/0/0 · combat 677 · coop 591 · run 50 · backpack 80 · enemies 37 ·
audit 2061 · chrome 27 · six gates · drizzle 70 · truffle 27 · boggle 30 ·
mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 5 · 61 fps, no console errors.

---

## 9. Mossbit, the Tombstone Turtle  ✅

`kennels`. 5 basics + 20 commons + 35 uncommons + 25 rares + 5 co-op. Epitaph,
Patience, Weathering, Buried Harm.

He survives because he has time, not because he is armoured, and he runs four
overlapping clocks at once. Almost all of it fell out of machinery the engine
already had — with one exception that made the character unwritable.

### The timer knew why it fired and did not say

Patience is paid when an Epitaph runs its countdown out on its own, and NOT when
a Trick Advances it to zero. That difference is the whole character — tempo now
against the currency that buys the big turns later — and it was unaskable.
`_fireTimers` has always taken a `reason` ('tick' for a scheduled tick, the
caller's word for a forced one) and emitted it on `TIMER_FIRE`, but the handler
it invoked never received it. One argument; the entire archetype.

Epitaphs are otherwise **the engine's timers, unmodified**: countdown, per-seat
owner, `adjustTimer` for Advance and Delay, `cancelTimer` for Erase, and a
snapshot the HUD already renders. A private array would have been a second clock
the screen could not see. A Very Long Nap gets its "both ticks count as natural"
for free by passing `'tick'` as the reason — the same word the scheduler uses.

### Three keyword ids were already taken

The chapter's mechanics are called **Weather** and **Bury**. Both ids belong to
Companions built earlier this round — `weather` is Drizzle's global combat state,
`bury` is Pudding's cemetery — and keyword ids are global while Companions are
not, so `[Bury]` on a Mossbit card would have opened Pudding's tooltip. His are
`weathering` and `buried-harm`, and the printed word matches the tooltip it
opens. Advance / Delay / Erase are deliberately not keywords at all: they are
defined inside `[Epitaph]`, which avoids a third collision (with Drizzle's
`advance`) and is one good tooltip instead of three thin ones. Stated per rule 8.

### A test that passed for the wrong reason

The Buried Harm suite manufactured a hit during Mossbit's own turn instead of
letting the enemy phase deliver it. Two checks failed and a third **passed while
proving nothing** — the "bill" it measured was just the enemy attacking again on
the following turn. Rewritten to drive the real path and read the harm off his
own scratch, it also exposed a genuine implementation bug: harm Buried mid-turn
was billed at the end of that same turn, with no grace at all. The spec gives him
a whole turn, so the debt now carries a due-turn stamp.

Two more failures were the same shape as Pudding's: an Epitaph resolves at the
start of the turn AFTER the enemy phase it sat through, so the enemy is holding
fresh Guard and Mossbit is wearing Weak. Both "failures" were the mechanic
working perfectly — 10 printed damage landing as 7 — and the assertions were
reading the board's armour rather than the effect. They read the damage events
now.

### Verification

`tests/mossbit/run.py` — **55 checks**: an Epitaph really ticks, really resolves
on schedule and really pays a Patience; hurrying one along really resolves it and
really pays NOTHING; Erase really removes it without resolving; an aimed Epitaph
whose enemy is gone really clears its slot; five slots really fill and Already
Written really widens the gauge; a Buried enemy turn really costs no Courage at
the time and really bills a turn later THROUGH 200 Guard; clearing it in time
really means no bill; an unplayed Weathering Trick is really kept in hand, really
finishes, and really resets if it leaves; Weatherproofing really seals it for the
turn and really releases it after.

cards 1283/0/0 · combat 677 · coop 591 · run 50 · backpack 80 · enemies 37 ·
audit 2061 · chrome 27 · six gates · pudding 46 · drizzle 70 · truffle 27 ·
boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 5 · 59 fps.

---

## 10. Brambleboo, the Haunted Houseplant  ✅

`greenhouse`. 5 basics + 20 commons + 35 uncommons + 25 rares + 1 Weed + 4
Borrowed Cuttings + 5 co-op. Garden, Cultivars, Harvest, Uproot, Compost, Vines,
Snare, Overgrown. **The last Companion with a design chapter.**

### The first Companion to use `engine.objects` — and the first to render them

`addObject` documents itself as the home for "Plants, Plots, Pumpkins, Graves".
Nothing had ever used it, and — worse — **nothing had ever DRAWN it**. Pipkin's
Patch is stored in his own scratch array and has been invisible to the player
since it shipped: the mechanic works, the board state it produces cannot be seen,
which is the Torn-pile bug wearing a different hat.

Plants are engine objects (they are explicitly not Tricks and never touch a
pile, so a shuffle cannot lose one), and `_renderPlayerCounters` now walks
`engine.objects` alongside the counters. It reuses the existing `.cb-count` chip
rather than inventing a class, so no new CSS could collide with another scene.
The screenshot shows what the change is for: **CREEPING IVY ✿ MATURE · BRIAR 1/2
GROWING · MOONFLOWER 0/2 GROWING · GRAVE MOSS 0/2 GROWING**.

### There was no "the turn has actually started" moment

Grave Moss Guards at the start of his turn and Moonflower is specified as
running "at the start of your turn **after your normal draw**". Neither is
expressible from `turn:start`, which fires at step 1 — before `_openSeatTurn`
wipes Guard and before `_dealSeatTurn` deals the hand. A `playerTurnStart` timer
lands after the wipe but still before the deal, so Moonflower would put a card
on top of the draw pile and then immediately draw it back.

The engine now emits `phase: 'playerReady'` after the deal. It is a new PHASE
value rather than a new event precisely because every existing listener tests
for `'player'` or `'enemy'` specifically and falls straight through it. **This is
the fourth Companion tonight to want a turn-start seam that actually works**, and
the suite caught me reintroducing the exact Guard-wipe bug I had fixed for
Truffle six hours earlier.

### Vines are not poison, and the tests say so

They do nothing at all by existing. Four are consumed at the start of an Attack
to Snare it: a multi-hit loses its last hit, a single hit is reduced and **never**
cancelled. Asserted three ways — five Vines become one and the hit lands for
less than its full size; three Vines Snare nothing and none are spent; and The
Mansion Is My Trellis Snares at three and takes the lot.

### Housekeeping the cards suite caught

Ten errors on the first run, all real: `[Grave Moss]` and `[Vine]` were written
as brackets whose ids did not exist (the registry has `grave-moss` and `vines`),
the Weed and the four Borrowed Cuttings had no `upgrade` entry, and The Mansion
Waters Back's upgrade changed nothing. Two Rares were over their damage bands —
Pruning Frenzy at 30 for 1 Nerve and Very Hungry Houseplant at 48 for 2 — and
both came down rather than being silenced. A console error the suite surfaced
but did not fail on: `snaredThisTurn` was only created at turn start, and an
enemy can swing before this seat has ever opened a turn.

### Verification

`tests/brambleboo/run.py` — **52 checks**: a Plant really takes two turns to
Mature, really never appears in any pile, and a fifth really cannot be planted;
Harvest really pays its effect AND takes the Plant, Uproot really takes it with
no effect at all, and both really give Compost; Vines really do nothing on their
own; four really Snare and really reduce without cancelling; Mature Grave Moss
really Guards and Mature Ivy really Entwines unprompted; an Overgrown turn really
adds a Weed; a Weed really cannot be played and Mulch the Evidence really turns
it back into Compost; both dynamic costs really move; and the Garden really
reaches `engine.state` where the screen can find it.

cards 1378/0/0 · combat 677 · coop 591 · run 50 · backpack 80 · enemies 37 ·
audit 2061 · chrome 27 · six gates · mossbit 55 · pudding 46 · drizzle 70 ·
truffle 27 · boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 5 ·
57 fps, no console errors.

---

## Still to come

**Not designed (1): Crinkle, the Paper Crow.** No chapter anywhere, including the
source `.docx`. Fifteen of sixteen are now playable and he is the only gap.
