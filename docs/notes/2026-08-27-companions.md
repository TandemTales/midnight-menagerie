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

## Still to come

**Designed, not built (8):** Wisp, Crumbula, Truffle, Hush, Drizzle, Pudding,
Mossbit, Brambleboo.

**Not designed (1): Crinkle.** Blocked on a designer pass — he has no chapter.
