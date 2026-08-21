# Combat scene — round 3

**2026-08-20 · combat-scene agent**
Owns `src/scenes/combat.js`, `src/scenes/combat.css`, `src/ui/enemy.js`,
`src/ui/intent.js`, `src/fx/combatfx.js`.

Everything below is measured on this machine (Intel UHD, ANGLE/D3D11), one
Playwright run at a time, at 1600x900 unless a second size is quoted.

---

## 1. The render seam: `card:move` had no case, so Bones did nothing

`combat/piles.js:188` emits `EV.CARD_MOVE` for every relocation that is not a
draw / discard / exhaust: **Fetch, Dig Up, Bury, the Bury return, Stash,
Scurry, "put it on top of your draw pile", and the forced discard inside
Slobber.** The `_animate` switch rendered `draw`, `discard`, `exhaust` and
`card:add` and had **no `case 'card:move'`**. Grepping for `card:move` outside
`combat/events.js` returned that one emit and nothing else.

So the fetched card existed in `piles.hand`, was counted by `canPlay`, was
paid for by the deck, and had no element on screen. It was then discarded
unplayed at end of turn. Bones's entire identity resolved in the rules and was
invisible.

Three motions, because three different things happen:

| direction | motion |
|---|---|
| into the hand | flies up out of the zone it actually came from and lands in the fan, then flashes `is-recovered` for 850 ms |
| out of the hand | tumbles to the zone it is actually going to (draw pile, discard pile), or burns if it is being exhausted |
| pile to pile | nothing is on screen; only the counters move |

`_pileAnchor(zone)` resolves `draw` / `discard` to the Hand's own pile points
and everything else — **stash, limbo, buried** — to a point under the fan, so a
Buried Trick comes up out of the floor rather than lying about which corner it
came from.

Two seams borrowed rather than duplicated, both documented at the call site:
`Hand#_makeSlot` reads `piles.draw` synchronously, and `Hand#discard` reads
`piles.discard` synchronously inside its own `.map()` before its first await —
so the anchor is retargeted for exactly one call and put straight back.

### `_reconcileHand()` — the belt to those braces

At the end of every beat (`_syncAll`, which runs when the event queue drains)
the fan's uid set is compared against `piles.hand` and only rebuilt when they
genuinely disagree. That covers a route nobody has written a case for yet, a
resumed fight, and **retained cards** — `turn:end` clears the whole fan with
`hand.discardAll()` while the engine keeps retained cards, and nothing was
putting them back.

### Measured

| | before | after |
|---|---|---|
| DOM hand vs `piles.hand` after Fetch | 3 vs 4 | **5 vs 5** |
| fetched Trick on screen after the chooser closes | never | **0 ms** (budget 250) |
| `.mm-card` count vs `state.piles.hand.length` | 3 vs 4 | **5 vs 5** |
| the fetched Trick is playable | n/a | 5/5 in hand playable |

## 2. The seam test — `tests/combat-scene/seam.py`

CONTRACTS rule 9. The scene's own harness passed the whole time because it
rendered from a fixture instead of from the engine, so the new test drives the
**real game** at `localhost:8777/game/index.html#scene=combat&companion=bones`
with the real `CombatEngine`, the real Bones deck and the real `CombatScene`,
puts `bones/go-get-it` in hand and a legal target in the discard pile through
`piles.move()`, plays it through `hand.playCard()` (the same entry point a
click and the keyboard use), resolves the chooser by clicking a card, and
asserts

```
document.querySelectorAll('.mm-card').length === engine.state.piles.hand.length
```

plus latency, playability, the deny's paint order, the chooser's sub-line, a
full turn cycle, the player's counter gauge, and zero console errors.

```
RESULT: 14 passed, 0 failed
```

Two things it has to know about `ui/hand.js` and says so in a comment: there is
one permanent hidden `.mm-card.mm-hand__probe` for measurement, and the raster
rehearsal paints throwaway `.mm-hand__warm` waves for ~1.3 s after entry. The
test waits the rehearsal out and excludes the probe; everything else counts.

## 3. Your own counters were never rendered (B2)

`state.counters` has always shipped
`{id:'loose-bones', name:'Loose Bones', value, min:0, max:6, ownerId:'player',
desc:'Whole at 0, Scattered at 4 or more.'}` and `_syncEnemyExtras` walked only
`en.counters`. `Sit Pretty` and `Put Yourself Back Together` both key off it.

`LOOSE BONES 0/6 · WHOLE` now sits at the opposite bottom corner of the
portrait from the Guard shield, in the same `.cb-count` widget as the enemies'
`DUST 0/4`. Read from the live `engine.counters` Map, not from `engine.state` —
that snapshot serialises the whole fight and this runs once per damage event.
`counter` events for player-owned counters now also float a `+n Loose Bones`
word, which only enemies used to get.

**The Whole / Scattered word is parsed out of the counter's own `desc`**, not
from a table in the renderer, so it cannot drift away from the card text when
Bones is rebalanced. See the ask to combat-engine below for the clean fix.

`defineCounter` defaults `max` to 99, which means "no ceiling" and not a gauge;
anything with `max > 24` prints as a bare number and is skipped at zero.

## 4. House Rules: `[571, -120, 135, 155]` (B3)

`.cb-enemy__rule` lived inside `.cb-enemy__above`, which anchors to
`bottom: calc(100% - 6px)` of the creature and grows **upward**. On a 430 px
boss stage that put The Butler's rule 120 px above the top of the viewport —
the single most consequential sentence in the fight, entirely off screen. The
Door Greeter's landed behind the HUD instead.

There is no clamp that makes an upward-growing stack safe at every stage
height, so the text is **docked**: `.cb-rules` is a rail at
`left: clamp(16px,2vw,34px); top: 78px` (under the HUD and under the room
caption), carrying `HOUSE RULE / name / text / which creature is keeping it`,
tab-stopped with a tooltip. `EnemyView#setRule` keeps only a `RULE` tab on that
creature's plate and the rule object for its tooltip.

| | box | fully on screen |
|---|---|---|
| Butler 1600x900 | `[31, 75, 322, 102]` | **yes** |
| Butler 1920x1080 | `[33, 75, 322, 105]` | **yes** |
| Governess 1600x900 | `[31, 75, 322, 102]` | **yes** |

(before: `[571, -120, 135, 155]`)

## 5. The deny painted under the modal that provoked it (B4)

`.cb-deny` was z 360, `.cb-chooser` is z 520. On a mandatory pick, Escape
correctly refused and correctly said *"You have to pick one. Use the arrow
keys, then Enter."* — 160 stacking layers beneath the panel. On screen Escape
visibly did nothing, and that is what made a previous reviewer file the chooser
as a soft-lock.

* `.cb-deny` is now **z 620**, above the chooser, and while a chooser is open it
  takes `.is-over-chooser`: it drops to `bottom: 9%` so it sits under the panel
  instead of across the cards it is talking about, on solid ink.
* `elementFromPoint` at the deny's own centre now returns
  `DIV.cb-deny.is-over-chooser.is-on` (was `DIV.cb-chooser__pool`). The test
  restores pointer events for the hit and puts them straight back, because
  `elementFromPoint` skips `pointer-events:none` and paint order is the property
  under test.
* **Nothing told a mouse user the card is the button.** The panel showed a
  prompt, a sub-line and a card and no control of any kind. The sub-line now
  reads `Pick a Trick. Click one, or use the arrow keys and Enter.` — and
  `Click one here or on the board, …` for an enemy pick, `Pick 2. Click them,
  then Confirm.` for a multi-pick. A disabled Confirm was the other option
  offered; it would never enable, because a single pick auto-commits.

## 6. The damage preview ignored Guard (B6)

`preview()` was already returning everything needed — `damage`, `hpLoss`,
`blocked`, `blockBefore` per target — and `_paintPreview` threw all but
`damage` away. No engine change was needed.

Measured on a 5-Guard enemy with Bite: engine says
`damage 6 · blocked 5 · hpLoss 1 · blockBefore 5`; the overlay now reads

```
-6   1 through 5 Guard
```

and `-6 · 5 Guard stops it` when nothing gets through. (Before: `-6`, with an
actual Courage loss of 1.)

## 7. Resume resurrected the dead (B9)

After reload → Continue the engine ships its dead, and there is no `death`
event left to animate them away. `_buildEnemies` built a rig for every entry in
`state.enemies`, so a `{hp:0, alive:false}` corpse held a full-size board slot.

`_buildEnemies` skips anything already dead, and `_syncAll` removes a view whose
snapshot is dead and which is not currently playing its death (`v.dying`), so
the death dissolve is untouched.

Reproduced by killing an enemy for real and then re-entering the scene with the
same engine instance, which is exactly what Continue does:

```
engine  [{e0 hp 0 alive false}, {e1 hp 33 alive true}]
before  2 .cb-enemy in the DOM, one of them a 0/20 body
after   1 .cb-enemy, 1 view
```

## 8. The boss read as the sidekick

The Governess (175 Courage) staged at 258x420 while her own 50-Courage Favorite
Doll staged at 436x366; The Butler (165) at 262x484 while a summoned 12-Courage
Dust Bunny rendered 511x430. Two causes, both in the stylesheet:

1. the arena size rules were written as
   `.cb-root[data-arena="boss"] .cb-enemy__stage` — **they applied to every rig
   on the board**, so the boss's escorts and summons inherited the boss cap;
2. the width clamp let a wide bbox run to the full `24vw` / `40vw` ceiling
   independently of the height, so a sprawling 12-Courage rig could take twice a
   tall boss's area while being half its height.

Now: `EnemyView` writes `data-role` alongside `data-tier` (the Favorite Doll is
`tier:'boss'`, `role:'bossPart'` — tier alone cannot separate them), the arena
rules are scoped to the creature the arena is *for*, and width is additionally
capped against the creature's own height (`--e-wide`).

| | before | after |
|---|---|---|
| Governess (boss) | 258x420 | 258x420 |
| Favorite Doll (bossPart, 50 hp) | **436x366** | **218x230** |
| Butler (boss) | 262x420 stage | 262x420 stage |
| the same rig re-tagged `tier:normal, scale .8` | 511x430 | **105x168** |

Area ratio boss : bossPart went from 0.61 : 1 to **2.16 : 1**.

## 9. Damage numerals landed on the intent chip

A numeral spawned at the stage centre and rose 88–100 px, which on a short rig
carried it off the top of the creature and onto that creature's own intent
chips — every hit briefly replaced the enemy's intent number with the damage
number, in the same place.

* `_numeralSpot()` measures the target's own stage and caps the rise so the
  numeral tops out 34 px **below** the top of the rig, where the intent stack
  begins; `CombatFX#number` takes a `rise` option for it.
* A 46 px lateral offset that flips side past 62% of the board width.
* Contrast: stroke 2 → 3.5 px (4.5 px on big hits) plus two drop shadows, so a
  numeral survives a dark rig under particles.

**Frames with a numeral overlapping an enemy's intent stack: 34 of 134 → 0 of
142.**

## 10. The `?` leaked onto printed constants

`Go Get It!` read *"printed cost **1?** or less"* and `Toss and Chase` read
*"Deal **8?** damage"*. `_cardNumbers` stamped `?` on every number of a card
that contained an unresolved choice.

Nothing in `cardSnap.display` is ever an estimate: it is the card's own `nums`
with Strength / Weak / Vulnerable applied, and the auto-picker never touches
it. The marker is gone from card text entirely. The uncertainty is real but it
belongs to the **outcome**, and that is where it already lives — the target
overlay prints `-6?` and *"depends on your pick"*.

Now reads: `printed cost 1 or less`, `Deal 6 damage`.

## 11. `Pack Wrong` lied, `Door Greeter` said nothing

`data/enemies/foyer.js:200` is `intent: DEBUFF, block: 5` plus
`addsCards:[{id:'clutter', pile:'discard'}]`. The chip printed `5` — its
**Guard** — under a debuff icon, and the label read *"Pack Wrong. 5 Guard."*
The deck pollution, which is the entire threat, was never stated anywhere on
screen. `Door Greeter` showed a chip reading just `DEBUFF`.

Neither `addsCards` nor `rule` is on the Intent payload, but both are on the
EnemyDef's move and the scene already passes `def` into `IntentView`. So the
value-chip row gained two roles, in the same grammar as damage and Guard:

```
Pack Wrong     [🛡 5][ CLUTTER to discard ]
Door Greeter   [ House Rule ]
```

The word chip also now appears when the only number on a **non-defense** intent
is its Guard, so a bare `5` can never sit alone under a debuff frame.

Tooltip and aria-label gained the matching lines
(*"Puts Clutter into your discard pile."*, *"Announces a House Rule you then
have to play around."*). No count is printed, because several moves scale how
many they add on the first use or with Haunt and a confident wrong number is
worse than none — see the ask to the enemies agent.

## 12. The player never animated, and the shake was invisible

STS2-REFERENCE §4: *"Characters animate their attacks: StS2 explicitly fixed
the StS1 complaint that the player figure just twitched."* The enemies had
windup, strike, flinch, clank and a death; the Kid was a static framed
portrait.

Three beats, matching `EnemyView#windup` / `#strike`: `_playerWindup()` is armed
in `_onPlay` for Attack cards and runs during the Hand's own 200 ms hold, so
`_playerStrike()` lands contact on the frame the effect resolves and resolves
after 85 ms, exactly like an enemy's. The portrait coils back and low, snaps
26 px forward and up into the board with a light flare, and drifts back over
360 ms. `reduceMotion` skips both. Observed live:
`cb-player → cb-player is-windup → cb-player is-striking → cb-player`.

**Shake was being called and was being scaled** — instrumented, one
`_addShake(0.887)` per damage event with `shakeAmt` 1 and `reduceMotion` false.
It was just small and short: `13 * k` with `k = hpLoss/12 + 0.18`, and a camera
kick of 0.05–0.185 world units of which the renderer uses half — under a pixel,
so the room never moved with the board, and a 120 ms screenshot strip could
easily land entirely inside the decay.

| 6-Courage hit | before | after |
|---|---|---|
| `k` | 0.68 | **0.887** |
| DOM board peak | 8.8 px | **14.2 px** (instrumented `_shake.mag` 14.19) |
| camera kick | 0.11 world | **0.28 world** |
| decay to <1 px | ~250 ms | ~300 ms |

`_addShake` also now returns early under `reduceMotion`, which it did not
before.

## 13. Smaller

* **The room caption** was `color-mix(text-hi 60%)` faded to `opacity: .3` — an
  effective 18% alpha over black, and it is the only thing that names which of
  thirteen rooms you are in. Now `--flame-200` settling at `.68` with a double
  shadow. `PARLOR` is legible in a still.
* **Enemy name plates** were `--text-mid` on a radial that had already fallen to
  nothing at the name's own line (the gradient is centred at 60% and the name
  sits at the top). Now `--text-hi` on a flat 86%-ink wash that fades out under
  the Courage bar. `--text-hi` does not move in any colourblind palette, so the
  deuteranopia case is fixed by the same change.

## Did not break

* **The INCOMING panel** — untouched. Verified live:
  `Incoming 26 → 26 · 26 more Guard to stop it all`, `data-state="through"`.
* **The death dissolve** — untouched. `_animDeath` still runs its full
  stagger → lights out → come apart; the resume fix only removes rigs that are
  *already* dead and explicitly skips any view with `v.dying` set.
* **Zero console errors** — asserted by the new seam test and observed across
  every probe run in this round (play, chooser, Escape-deny, death, resume,
  three turn cycles, two boss fights).

---

## Asks for other owners

**combat-engine — companion counters do not exist until the first companion
card resolves.** `data/companions/_util.js#installTrackers` is only reached
through `U.ensure(c, SLUG)` at the top of a card effect, and its own header
says *"combat-engine should call this at combat start."* Nothing does. So
`loose-bones` is undefined for the whole of turn 1 and the gauge cannot be
shown until Bones plays something — which is precisely the turn the player most
needs to know they are Whole. One call in `startCombat()` fixes it for all five
Companions.

**combat-engine — counters should carry their own state words.** The renderer
parses `Whole at 0, Scattered at 4 or more.` out of `counter.desc` with a
regex, because the thresholds exist nowhere else. Shipping
`states: [{at:0,label:'Whole'},{from:4,label:'Scattered'}]` on the counter would
delete that parse and let a gauge with an unusual sentence still get a label.

**enemies — `addsCards` and `rule` never reach the renderer.**
`combat/intents.js#buildIntent` carries `damage / hits / block / applies` and
nothing else, so the scene reads them off `def.moves[moveId]`. That works but it
cannot see the *dynamic* count: the Lost Luggage's first `Pack Wrong` adds two
Clutter and every later one adds one, and the chip has to stay countless
because of it. Carrying `addsCards:[{id,pile,count}]` and `rule:{id,name}` on
the Intent (ideally from the same function that computes `damageFn`) would let
the chip read `+2 CLUTTER` honestly and let the Door Greeter's chip name the
rule it is actually about to announce rather than `House Rule`.

**card-feel — two small openings.**
1. `Hand#draw` always deals from `piles.draw`. Combat borrows that anchor for
   one call so a fetched Trick can fly out of the discard pile; a
   `draw(cards, { from: {x, y} })` option would remove the swap. Same for
   `discard(uids, { to })`, which combat needs to send a card to the draw pile.
2. `.mm-hand__probe` is a permanent, always-present `.mm-card` in the DOM. Any
   test or tool that counts cards on screen has to know about it. A
   `data-probe="1"` attribute, or a class that is not `mm-card`, would make
   `document.querySelectorAll('.mm-card')` mean what it looks like it means.

## Kept green

`tests/combat/run.py` 590 passed / 0 failed ·
`tests/seams/check.py` 1598 checked / **0 problems** ·
`tests/seams/proof.py` 52 passed / 0 failed ·
`tests/run/run.py` 50 runs / 0 errors ·
`tests/combat-scene/seam.py` **14 passed / 0 failed** (new)

## Screenshots

`r3-normal.png` (room caption, Loose Bones gauge, Clutter chip, numeral clear of
the intent) · `r3-foyer-boss-1600x900.png`, `r3-foyer-boss-1920x1080.png` (the
docked House Rule at both sizes) · `r3-nursery-boss-1600x900.png` (the boss
finally out-massing her own doll) · `r3-guardpreview.png` (`-6 · 1 through 5
Guard`) · `r3-playerswing_f0..f7.png` (wind-up, contact, follow-through) ·
`r3-foyer-8.png` (Door Greeter's House Rule chip).
