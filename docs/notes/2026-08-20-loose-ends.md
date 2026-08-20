# Loose ends — seven diagnosed hand-offs, plus the "Floor/Wing/Expedition" coherence bug

2026-08-20. Eight files, seven original owners, nobody else in them at the time.
Every item here was diagnosed by an agent working in a *neighbouring* file and
reported rather than fixed. Nothing below is new analysis; what is new is that
each one now has a verification attached to it.

Files touched: `fx/atmosphere.js`, `ui/hand.js`, `ui/card.js`, `combat/intents.js`,
`scenes/gameover.js`, `ui/hud.js`, `ui/deckview.js`, `scenes/map.js`.

Green at the end: combat 590/0 · seams check 1571 sites / **0 problems** ·
seams proof 52/0 · cards · enemies 37/0 · run 50/0 · chrome 27/0 · 60–61 fps.

---

## 1. `atmosphere.setMood(name, { seed, variant })` — a room, not a space

Seventeen authored spaces carry 340 authored rooms. `scenes/combat.js#moodForRoom`
maps six different Foyer rooms onto `passages`, and because `_seed` was hashed
from `pal.regionKey` alone, all six rendered **pixel-identically**.

`setMood` now takes an optional `seed` (the room name, a node id — anything
stable and per-room) and an optional `variant` on the same axis. Both are folded
into `_seed`, and `_vary(pal, h)` spends a *separate* deterministic stream on the
one thing a reseed alone cannot change: the arrangement.

| what varies | how much | why that much |
|---|---|---|
| `props.layout` | a sibling from `LAYOUT_FAMILY` | a corridor stays a corridor — it just is not the same corridor twice |
| prop count | ±25% | one room sparse, the next crowded |
| room w/d | ±9%, h ±6% | the camera rig is authored against these; 30% would stop being framed |
| key/fill/lamps | mirrored L↔R half the time, moved up to 14% of the room, ±10% intensity | the single most visible change of the lot |
| shafts | ±1, fall moved along the room | |

Never touched: colour, grade, particle mix, camera. The region has to stay
recognisably itself.

`pal.lights` is the one field `resolve()` aliases straight to the authored
`REGIONS` array rather than copying — `_vary` clones it before touching it.
Everything else (`room`, `props`, `key`, `fill`, `shafts`) is already a fresh
`Object.assign` per call.

**Omit both options and nothing changes.** An unseeded `setMood()` is
byte-for-byte what it was, which is what keeps every other caller
(`showcase.js`, title, select, clubhouse, map, gameover) exactly as authored.

*Verified* — `passages`, driven live in the running page, three signatures:

```
base  aisle     n=18 w=7.50 d=20.00 h=3.40 key=-1.90,1.80 L0=-1.20,-4.20   (authored, unchanged)
A     nook      n=14 w=6.98 d=19.78 h=3.22 key=+1.63,1.88 L0=+1.92,-4.09   seed 'East Landing'
B     colonnade n=21 w=7.22 d=18.62 h=3.54 key=-1.92,1.97 L0=-1.60,-5.75   seed 'The Long Gallery'
A2    nook      n=14 w=6.98 d=19.78 h=3.22 key=+1.63,1.88 L0=+1.92,-4.09   seed 'East Landing' again
```

`shots/le-atmo-base|A|B.png` are three visibly different corridors: slabs down
both walls warm-from-the-left; one heavy mass on the left with the lamp mirrored
to the right; two receding colonnade files. A2 == A exactly, so a room is the
same room every time you walk back into it.

**STILL NEEDS ONE LINE FROM combat-scene** (`scenes/combat.js:148`, not mine):

```js
ctx.atmosphere?.setMood?.(this.mood || this.region || 'foyer', { seed: this.roomName });
```

`this.roomName` is already read two lines earlier in `_readRoom()`. Until that
lands the hook is live but nothing in the game passes it.

## 2. Hand — tap-to-play, and the threshold as a band

**A click is a play.** `_pointerUp` treats pointerdown+pointerup in the same
place (≤ `TUNE.tapTime` 0.42 s, ≤ `TUNE.tapSlop` 12 px) as a commit for a
non-targeted card, down the same path a drop above the line uses — including the
shake when it is unaffordable. A `pointercancel` is the browser taking the
gesture away and is never a tap. Targeted cards are deliberately excluded: the
Hand cannot know which enemy was meant.

Combat's workaround (`card:pickup`/`card:cancel` → `Hand.playCard()`) is now
redundant **for non-targeted cards** — no `card:cancel` is emitted on a tap any
more, so it cannot double-fire. Its aimed-card half (tap an attack when exactly
one enemy is alive) still does something the Hand deliberately does not, so
combat-scene should keep that branch and drop the rest.

**The threshold is a band, and it is anchored to the fan.** It was a 2px hairline
at `h * 0.54` — host-anchored, so it drifted relative to the hand, and invisible
enough that dropping a card mid-field read as the game ignoring you. Now:

- `_syncThreshold(F)` puts the line `TUNE.thresholdLift` (0.66) card-heights
  above the top edge of the resting fan and gives it a band `thresholdBand`
  (0.40) card-heights deep **above** it. The band's bottom edge IS the line
  `_pointerUp` measures, so what the player sees is what is tested.
- It arms on `pointerdown` (as `.is-on`, as before) — armed amber only when the
  card is actually affordable, grey "Not enough Nerve" when it is not. That
  distinction was already right and is untouched.
- Called from `_measure()` and `_layout()`, and it only writes to the DOM when
  the number actually moved (`_layout` runs on every hover).

At 1600×900 with five cards the line lands at y=491 — within 5px of where the
old hairline was — but it now moves with the fan instead of with the window.

The band's CSS is an idempotent injected `<style>` (`ensureBandCss`) because
`ui/hand.css` is another owner's file. **HAND-OFF: lift `BAND_CSS` into
`ui/hand.css` verbatim and delete `ensureBandCss()`.** Tokens only; every rule
carries `.is-band` so the authored hairline styling is untouched.

The label hangs below the line at its **left** end. Centred (and inside the
band) it sat straight on top of the enemy name plates and health bars.

*Verified* in the running page, real input:

| gesture | result |
|---|---|
| click on the hand (real Playwright click) | `pickup` → `play marmalade/curl-up`; Nerve 3→2, hand 5→4, discard 0→1, +5 Guard on the kid |
| drag a self-target card up past the line | `play` |
| drag it down to the END TURN button | `cancel`, no play |
| drag an attack onto an enemy | `play marmalade/scratch t=e0` |

`shots/le-tap2.png`, `le-band3.png`.

## 3. `buildIntent` drops `icon`

`combat/intents.js` copied `id/stacks/to/name/kind` out of the status definition
and left `icon` behind, so Roused (`bell-small`) reached the renderer with no
icon and fell back to a `?` — which on an *intent* reads as "unknown intent" and
is worse than no pip. It now carries `icon` too. An unregistered status has no
real icon (`getStatus` invents `'unknown'` for a `_missing` def), so the field is
left off in that case and the renderer picks its own fallback exactly as before.

*Verified* — Foyer-9 (Coatrack Crawler + Calling Bell), live engine:

```
enemy.intent.statuses = [{"id":"roused","stacks":1,"to":"allies","name":"Roused","kind":"buff","icon":"bell-small"}]
```

and the rendered pip's path data `=== iconPath('status.bell-small')`, not
`iconPath('status.unknown')`. `shots/le-intent4.png`. Combat 590/0 still.

`ui/intent.js#statusIconId` can drop its second lookup whenever combat-scene
wants to; it is now belt and braces rather than the only thing holding the pip up.

## 4. Game Over — `wing`, and "1 Keepsakes"

- The kicker read `s.floor`, which is `depth` now, so a run that never left the
  Foyer announced "Expedition 14". It reads the new `wing` param.
- The local 5-line `plural` helper is gone; the file imports `util/plural.js`.
- The Keepsake line prints its count from `_hydrateKeepsakes()` long after the
  string is built, so the noun is now a `[data-relic-noun]` span patched with
  `word(n, TERMS.relic)` at the same moment as the count.

*Verified* with a one-Keepsake run driven through `MM.goto('gameover')`:
kicker `Wing 2 · the Forgotten Foyer`, `1 Keepsake`, `1 wing drawn onto the
blueprint`, `1 clue for the board`. With four: `4 … Keepsakes`.

## 5. `{n} Tricks` — fixed once, in `_renderRules`

46 authored strings across five content files say "Draw {n} Tricks" because
they are usually right. `ui/card.js` substitutes the number *after* the noun was
written, so the substitution site is the only place that can know the count.
`_renderRules()` now collects the text nodes it creates (with the `<b>` that
precedes each) and runs `fixNumberedNouns()` over the finished line.

Only TEXT nodes are rewritten, so the live `mm-card__num` elements keep their
identity and their green/red preview classes. Each node keeps its authored
(plural) form, so `setPreviewNumbers` moving a count across 1 in **either**
direction restores the right noun — the repair re-runs there too. `_spokenText()`
(the aria label) goes through the same helper.

*Verified* — reward screen, `shots/le-reward.png`: Catnap reads "Draw **1**
Trick at the start of your next turn", Sneak Attack "…draw **1** Trick."

## 6. HUD — Clues and Luck are visible everywhere now

The run awards both (`addClues`, `flags.luck` + pity). Only the four room
screens showed them, through `addChip()`; on the map and inside a Scuffle they
were currencies the player could not see.

The HUD carries them natively, in the vitals group beside Lost Things: a
magnifier for Clues, a star for Luck (Luck is exactly "how likely a Rare turns
up"). Luck hides itself at 0 — an always-on "+0" is noise. `run.flags` is a real
getter that aggregates Keepsakes + Gear + pity; the mock has no such getter, so
that is an explicit `r.flags ? r.flags.luck : r.luck` branch rather than
`r.flags?.luck` (**CONTRACTS rule 8** — never `?.` an API that must exist).

**`addChip()` de-duplicates.** `scenes/reward.js#_buildHudExtras` still adds its
own Clue and Luck chips, and two of each would be worse than none. A chip whose
`data-kw` is `clue`/`luck` is no longer appended: `addChip` hands back the HUD's
own persistent text node, so the caller keeps updating "its" chip in place, in
the one position the player learns. meta-run can delete `_buildHudExtras`
whenever it likes and nothing changes on screen.

*Verified* — reward screen: `.mm-hud__group--extra` has **0** children and the
strip reads `The Foyer · Wing 1 · 42/68 · 246 · 4 Clues · Luck +3 · …` with the
real run's numbers. Map screen: both chips present. `shots/le-reward.png`,
`le-map.png`.

`plural()` applied at the deck button's aria-label, and at `deckview.js:223`,
where `of ${total} Tricks` could print "of 1 Tricks" for a one-card pile with a
filter that excluded it.

## 7. map.js — the redundant write

`_choose()` wrote `run.visitedIds = [...m.visited]` before calling `chooseNode`.
`visitedIds` is the **cleared** set now and `run._markEntered()` actively spliced
that optimistic entry back out again. Deleted; the comment says why so it does
not come back.

Nothing depends on it: the local `m.visited` still keeps the screen honest for a
standalone map, the model is rebuilt from `run.visitedIds` on re-entry
(`map.js:146`), and `_markCleared` is the only thing that should ever add to it.
The one behaviour that changes is a `run` object that has no `chooseNode` — that
fallback path no longer leaves a phantom cleared node behind, which is the fix,
not a regression. Run suite 50/0.

## 8. (from the coordinator) One number, three words

`hud.js` said **"Floor 1"** on the map screen while the map header said
**"Wing 1 of 17"**; `gameover.js` said **"Floor 1"** in the ledger and
**"Expedition 1"** in the kicker. Wing is the right word — it is what the design
doc and the map call a region, and "floor" is wrong on its own terms because
several wings share a storey.

Each label now names the quantity it actually holds:

| where | before | after | quantity |
|---|---|---|---|
| `hud.js` where-chip | `Floor 1` | `Wing 1` | `run.wing` |
| `hud.js` tooltip | "on floor 1 of the expedition" | "Wing 1 of 17 … you are 3 rooms deep" | both, named |
| `gameover.js` kicker | `Expedition 1` | `Wing 3 · the Sleeping Quarters` | `run.wing` |
| `gameover.js` ledger | `Floor 14` | `14 rooms deep` + `· Wing 3` | `run.depth` |

Falling out of this: `tests/chrome/run.py` measures HUD contrast from real
pixels, and the shorter "Wing 1" gives the sub-label less ink than "Floor 1" did
— it dropped to 4.38:1 against the 4.5 minimum. `.mm-hud__where .mm-hud__s` is
now `--text-mid` (next step up the same ramp, still clearly secondary), which is
in the injected block for the same reason the Gear CSS is. 27/0.

---

## Two things worth someone else's attention

- **`scenes/clubhouse.js:425` says "Deepest floor".** It reads
  `Save.stats.bestFloor`, which is `run.depth` — so the number is right and the
  word is the one we just removed from the other two screens. Frontend owns it;
  it wants to read "Deepest" / "rooms deep".
- **`card:play` has two emitters on one bus name.** `ui/hand.js:1131` emits
  `{cardUid, cardId, targetId}` and `scenes/combat.js:783` emits
  `{type, cardId}` for the audio layer. Every listener gets both, with different
  shapes. It is not a bug today (audio only reads `type`) but it made every play
  in this session's traces look like a double-play, and the next person to add a
  `card:play` listener will trip on it.

## Gotcha for the next person injecting CSS from JS

`GEAR_CSS`/`BAND_CSS` are template literals. A backtick inside a CSS comment in
one of those blocks terminates the string, and the browser reports it a long way
from the cause — `hud.js` and (because it imports hud.js) `map.js` both failed
to parse with "Invalid left-hand side expression in postfix operation" until the
backticks came out of one comment. Both blocks now say so in situ.
