# Combat scene — round 2

**2026-08-20 · combat-scene agent**
Owns `src/scenes/combat.js`, `src/scenes/combat.css`, `src/ui/enemy.js`,
`src/ui/intent.js`, `src/fx/combatfx.js`.

Everything below is a response to a fresh playtester's pass over the whole build.
Numbers are measured on this machine (Intel UHD, ANGLE/D3D11, 1600x900), one run
at a time.

---

## 1. Intents had no usable tooltip — and the reason was not the renderer

`IntentView.tooltipHTML()` existed and combat already called it on `pointerenter`.
It was broken twice over:

* **`tooltip.show(el, string)` renders a string as literal text.** The intent
  tooltip was built as HTML, so the panel put the characters
  `<div class="cb-tip__title">Pack Wrong</div> <div class="cb-tip__body">Gains
  <b>5</b> Guard.` on screen. Screenshot from before the fix:
  `shots/r2_tip_a.png`.
* **It dismissed itself on the first pixel of movement.** `ui/tooltip.js` owns a
  document-level `pointerover` handler that hides the panel over any element it
  does not recognise as an anchor. Moving from the intent box onto a glyph path
  inside it hit that branch. So: "hover an intent, get a wall of markup for one
  frame, then nothing."

Fixed by going through the tooltip's real seam — `tooltip.attach(el, fn)` with a
**descriptor object**, not `show()` with a string. `attach` registers the element
so `_anchorFor` walks up to it exactly like `[data-tip]`, and the keyboard path
(`focusin`) comes free. `IntentView.tooltipHTML()` is gone; `IntentView.describe()`
replaces it and returns
`{kind, icon, title, subtitle, lines[], rows[], footer}`.

**Descriptor lines must be plain text.** `tooltip._linkKeywords` escapes each line
before it links keywords in it, so `<b>` prints as `<b>`. Emphasis now lives in
`rows`, which the tooltip renders as a real definition list.

### Why the number changed

`intent.baseDamage` is what the move's `damageFn` returned this turn;
`def.moves[id].damage` is what the move statically declares. When they disagree,
something the player did changed the future. The tooltip now says so:

```
UMBRELLA JAB                    ATTACK
Attacks for 7 damage.
Applies 2 Weak to you.
  NORMALLY    12
  RIGHT NOW    7
The umbrella tip trembles, waiting for an opening.
```

That is the Coatrack Crawler's Brace lesson, stated out loud for the first time.
`shots/r2_v_why.png`. A second row appears when `baseDamage !== damage`
(Strength / Weak / Vulnerable), and `×N = total` for multi-hits.

## 2. One intent grammar, all sixteen types

Round 1 had three presentations on one screen — a shield badge plus a separate
`🛡5` pill; a hexagon plus a permanently-visible dim word plus a chip that sliced
the move name to four characters and printed **"ROUS"**; and a named pill above a
shield. Two of those were bugs:

* `.cb-intent__word { opacity: 1 }` was unconditional, because the intended
  `.cb-intent.has-word` rule had been corrupted into a broken selector by a
  duplicated CSS block (`.cb-intent.has-word /* comment */ .cb-intent.is-blocknum
  .cb-intent__num {`). The word was pinned on for every intent forever.
* `shortName(n) { return String(n).slice(0, 4) }` — that is where "ROUS" came from.

Every intent now renders exactly this and nothing else:

```
   FRAME + GLYPH      family shape (4) x type glyph (16); colour is redundant
   [ 7 x3 ][ (shield) 5 ]   VALUE CHIPS — one row, same chip, same order
   [icon 2][icon 1]         STATUS PIPS — icon + stacks, never a name
```

`ATTACK_DEFEND` shows both its chips instead of hiding the Guard number. A name is
never truncated anywhere; the pip's full text lives in its tooltip.

## 3. Status icons

Two separate faults, both "the icon set exists and nothing used it":

* the player row drew from a private 14-path table inside `scenes/combat.js` that
  had **no `haunt` entry**, so Haunt fell through to a single letter;
* the enemy row emitted `<i class="cb-status__g" data-g="haunt"></i>` — an empty
  element that no stylesheet has ever drawn. Hence "a bare 2 in a 19x22 box".

Both now call one resolver, `statusIconId(s)` in `ui/intent.js`, re-exported as
`statusGlyph(s)` from `ui/enemy.js`. It reads `ui/icons.js`.

One subtlety worth keeping: `engine.state` status snapshots carry `icon`, but the
status objects on an `Intent` do **not** — `combat/intents.js#buildIntent` copies
only `id/stacks/to/name/kind`. So the resolver consults `getStatus(id)` when the
`icon` field is absent. Without that, Roused (icon `bell-small`) rendered as a
question mark, which on an intent reads as "unknown intent". The last-resort
fallback is a buff/debuff arrow, never a `?`.

**Zero stacks:** the engine already skips statuses at 0. `FLUSTERED 0` on the boss
was a *counter*, not a status. A counter with a `max` is a gauge and `DUST 0/4` is
information; a bare counter at zero is not, and is now skipped.

## 4. Entering a Scuffle: 1.78 s -> 1.01 s (target was 1.5 s)

Measured click-on-node to first card in the DOM, from a warm page:

| | before | after |
|---|---|---|
| first Scuffle of a run | 1781 ms | **1012 / 1048 / 1069 ms** (3 runs) |
| every later Scuffle | 1072 ms | **624 / 619 / 590 ms** |

Three causes, in order of size.

**(a) The whole opening played behind the transition veil.** `core/scenes.js#go`
awaits `enter()` and only *then* calls `transition.reveal()`. `enter()` awaited
`startCombat()` and `_settle()`, so the opening banner, the opening statuses, the
shuffle and the first turn were all animated to a covered screen. That is the
"six seconds of near-black". `enter()` now returns as soon as the board is built
and kicks `this._boot = this._begin()`; the veil lifts on a built, lit, populated
board and the fight opens in front of the player.

**(b) `warmArt()` and `Hand.warmRaster()` were never called by any scene.** Both
were written by card-feel for exactly this moment. Not calling them cost **716 ms
of synchronous canvas painting inside the frame that starts the first draw**
(profiled: `draw` event 716 ms, of which ~430 ms was `Hand.draw`). Combat now
calls both from `_warmDeck()` during `enter()`, chunked off the critical path.
First `draw` is now ~150 ms of work plus its intended 325 ms stagger.

**(c) Opening beats had full ceremony.** Profiled before: `combat:start` 415 ms,
two `status` words 235 ms, `shuffle` 166 ms, turn banner 233 ms — ~1 s of
set-up presented as play. `_o(sec)` collapses those to a third while
`this._opening` is true and is exactly `_d(sec)` afterwards. `_opening` clears on
the first player `turn:start` (and immediately for a resumed fight).

Not mine, but measured and worth someone's attention: a **cold** deep link into
combat is 8.5 s to scene and ~11.9 s to first card, essentially all boot (module
graph + first composer render). And `run.buildCombat` for the **boss** node takes
~2.0 s the first time — the `data/bosses/*` import graph, paid once.

## 5. Thirteen rooms instead of one

`combat.js:87` called `atmosphere.setMood(region)` and nothing else, so the Formal
Dining Room, the Music Room, East Landing, the Grand Coatcheck and The Butler all
played in one warm gallery.

The atmosphere layer owns seventeen fully authored spaces (geometry, camera,
palette, props, shafts, particles) and exposes `setMood(name)`. A room now picks
the authored space it most honestly is, matched on `node.roomName`
(`state/mapgen.js` authors all 340). `moodForRoom(roomName, region, arena)` is
exported from `scenes/combat.js` so it can be asserted without booting a scene.

The Foyer's twenty rooms resolve to **seven distinct spaces plus a boss arena**:

| room | plays in | | room | plays in |
|---|---|---|---|---|
| Front Vestibule | foyer | | Grand Staircase | foyer |
| Entry Hall | foyer | | East / West Landing | passages |
| Coat Room | passages | | Visitor Cloakroom | passages |
| Receiving Room | ballroom | | Marble Gallery | crypt |
| Parlor | study | | House Register Alcove | study |
| Drawing Room | ballroom | | Bell Pull Gallery | lampworks |
| Portrait Hall | study | | East Reception Hall | ballroom |
| Music Room | ballroom | | Butler's Passage | passages |
| Formal Dining Room | kitchens | | Umbrella Gallery | passages |
| | | | **Receiving Chamber (boss)** | **crypt** |

`BOSS_MOOD` gives every region's boss a space no ordinary room of that region
fights in. The Butler's Receiving Chamber goes **cold** — every other Foyer room
is warm candlelight; the one room where the house decides whether you belong is
stone and spectral light. `shots/r2_soak_0.png` (Parlor / study),
`shots/r2_soak_1.png` (Formal Dining Room / kitchens),
`shots/r2_boss_arena.png` (Receiving Chamber / crypt).

The room's name is stated top-left on entry and then fades back to 30%.

### The arena, and the boss entrance

`.cb-root[data-arena="normal|elite|boss"]` drives the framing. A Big Scare is
staged and lit; a boss owns the frame:

* the field opens up and the stage cap goes from `226px * scale` to
  `430px * scale`, so The Butler renders at ~420 px instead of ~340 px — the caps
  are set so the stage **plus the name plate** still clear the top edge of the
  hand, which round 1 did not do at any tier;
* a held vignette closes the edges in;
* `EnemyView#enterArena()` — three beats: a held silhouette sunk below its own
  floor line, a slow rise with the lights coming up, then a plant, a blink and one
  lean at the player. ~1.8 s. `reduceMotion` collapses it to nothing.
* it runs **after** `_untilRevealed()`, because an entrance nobody sees is not an
  entrance (see 4a — the first version of this played entirely behind the veil).

Strip: `shots/r2_bossentrance_strip.png`. Timings for the boss node:
scene 2.6 s, veil up 3.59 s, entrance 3.63 -> 4.84 s, first card 5.83 s.

**The Butler was "a grey blob with two eyes"** because his only props were a 48 px
collar and a coin-sized bow tie, both filled in his own coat colour. A butler is
read from three things — a white shirt front, a wing collar, a black tie — so all
three are now full size and in contrasting fills (`--e3`, the palette's light
slot), with coat tails on the back layer and two buttons.

## 6. Keyboard

`ui/hand.js` already implemented the entire card interaction (1-9 select, arrows,
Enter/ArrowUp to play, Tab to cycle targets while aiming, Escape to cancel) on its
own window listener. Combat was not missing an implementation — **it never handed
the Hand focus**, so Tab from a blurred start never left `BODY`.

* Tab with focus on `BODY` now enters the hand. Verified: `BODY` -> Tab ->
  `mm-card is-selected is-hover` -> `3` -> `Enter` plays the card.
* The scene does **not** grab focus on entry — auto-lifting a card for a mouse
  player who never touched the keyboard is worse than the problem it solves.
* Escape on a **mandatory** blocking choice used to be swallowed in silence, which
  reads as a frozen game. It now says why and names the keys that do work.
* Tab inside a blocking choice walks the choice and never escapes it.
* The intent is a real tab stop (`tabindex=0`), and so are the counters, badges
  and queue slots; all of them have tooltips.

## 7. Console error on death

`Cannot read properties of null (reading 'over')`. `_settle()` can end the fight;
`_animEnd` navigates to `gameover`; that runs `exit()`, which nulls `this.engine`.
Both `_onPlay` and `_endTurn` then read `this.engine.over` on the line after the
await. Guarded, plus `_drain()` and `_animate()` now bail if the engine is gone
(CONTRACTS §7). Verified: a scripted defeat inside a real run reports **no page
errors and no console errors**.

## 8. A click is a play

A non-targeted card could only be played by dragging above roughly y=450; a click
did nothing. The Hand commits a drag on crossing its threshold and treats a tap as
a cancelled drag.

The threshold **is** rendered (measured mid-drag: `.mm-hand__threshold.is-on`,
opacity 0.55, top 486 px, z-index 760) — it is just thin, and only exists while
the pointer is down. Combat is not hiding it.

Rather than touch card-feel's pointer code, combat recognises a tap from the
Hand's own `card:pickup` / `card:cancel` pair (same uid, <420 ms, <12 px) and
calls the public `Hand.playCard(uid, targetId)`. A tap on a self-targeted Trick
plays it; a tap on an aimed Trick with exactly one living enemy plays it at that
enemy (Slay the Spire does the same); otherwise it says what to do instead.
Verified: hand 5 -> 4 on a single click, no deny.

## 9. Player HP was displayed twice

The portrait plate's Courage bar is gone — `ui/hud.js` owns the one on this
screen. The plate's panel chrome went with it (an empty bordered box under the
portrait reads as a broken input field), and so did the per-frame ghost-bar
lag it was driving.

**The incoming-damage panel is untouched.** It was called better than Slay the
Spire and it is still `INCOMING 7 −5 Guard → 2 / 2 more Guard to stop it all`,
still updating live as Guard changes, still keyboard-reachable with its own
tooltip. The only thing it lost is the hatched overlay that used to sit on the
duplicate bar.

## 10. Snacks now resolve in the engine

The ~50-line Snack effect table is deleted. `_useSnack` is now:
`run.canUseSnack(index)` -> `run.useSnack(index, targetId)` -> engine, with a
direct `engine.useSnack` fallback for a deep-linked Scuffle with no run. The
`snack:used` event is animated as its own beat before heal/Guard/Nerve arrive.
Verified end to end: `['snack:used', 'heal', 'block']`, hp +5, block 4.

## 11. Mid-combat resume renders the hand

`_buildHand` filled the hand purely from `draw` events, which a resumed engine has
already emitted and will never emit again — engine hand 5, cards on screen 1. It
now seeds from `engine.piles.hand` when `engine.started` is true, and `_begin()`
skips `startCombat()` and the arena entrance for a resumed fight. Verified:
resumed engine, `started: true`, engine hand 5, **on screen 5**,
`Hand.cards().length` 5. The run layer's `_auditResumedCombat` fallback should
now stop firing.

## 12. Determinism

`_makeEngine`'s standalone path drew straight from `ctx.run.rng`, which advances
the run's own stream by however many rolls the fight needs — so a seed stopped
reproducing a run the moment anyone deep-linked a combat. It now forks:
`ctx.run.fork('combat:deeplink:<node|encounter|seed>')`.

---

## Asks for other owners

**atmosphere** — everything above works with `setMood`, but the honest limitation
is that two rooms mapped to the same key are pixel-identical, because
`setMood(name)` reseeds the prop layout from the region key
(`_seed` is hashed from `pal.regionKey`, then `backdrop.build(pal, () => this._rand())`).
Six of the Foyer's twenty rooms are `passages`, and they are the same passage.
The smallest thing that would fix it:

```js
atmosphere.setMood(name, { seed: 'foyer-3-2', variant: 0.4 })
```

`seed` replaces the region-key hash so the prop layout differs per room while the
palette, camera and geometry stay the region's; `variant` (0..1) would be a gentle
nudge on prop count / light warmth. Neither needs new authored data.

**card-feel** — two things:
1. `Hand._pointerUp` treats a tap as a cancelled drag. Combat now works around it
   through `playCard()`, but the natural home for click-to-play is there.
2. The commit threshold is drawn at `h * 0.54` of the hand root, which in combat
   is the whole viewport — a dashed line across the middle of the board, visible
   only while the pointer is down. It reads as scenery. Consider arming it on
   `pointerdown` with a filled band rather than a hairline, and/or anchoring it
   relative to the fan rather than the host.

**ui-chrome** — `tooltip.show(anchor, string)` silently escapes markup and
`_anchorFor` hides the panel over any unregistered descendant. Both are correct
behaviours in isolation and together they made a documented API
(`ctx.tooltip.show(anchorEl, html)`, per the header comment in `tooltip.js`)
produce visible markup that then vanished. A one-line note in that header saying
"pass a descriptor, not HTML; use `attach()` for a hover target with children"
would have saved this round a bug.

**engine** — `combat/intents.js#buildIntent` copies `id/stacks/to/name/kind` onto
an intent's statuses but drops `icon`. The renderer works around it with
`getStatus(id)`; adding `icon` would remove a lookup from a hot path.

## Kept green

`tests/combat/run.py` 590 passed / 0 failed · `tests/seams/check.py` 1570 checked
/ **0 problems** · `tests/seams/proof.py` 52 passed / 0 failed.

## Screenshots

`r2_base_combat.png` / `r2_base_boss.png` (before) · `r2_soak_0.png`,
`r2_soak_1.png` (rooms) · `r2_boss_arena.png`, `r2_bossentrance_strip.png` (boss) ·
`r2_elite.png` (Big Scare) · `r2_v_why.png` (intent tooltip with the Brace
breakdown) · `r2_v_statuses.png` (status icons) · `r2_death_f0..3.png`,
`r2_death_end.png` (defeat).
