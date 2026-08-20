## 2026-08-20 - combat-scene

Shipped `src/scenes/combat.js` + `combat.css`, `src/ui/enemy.js`, `src/ui/intent.js`,
`src/fx/combatfx.js`. Nothing outside those five files was touched.

Playable standalone: `http://localhost:8777/game/index.html#scene=combat&seed=42`.
Debug params: `&encounter=foyer-9`, `&enemies=4` (stress board), `&tier=advanced`,
`&haunt=3`, `&companion=marmalade`, `&region=nursery`.

**Measured: 61 fps** at 1600x900 with 4 enemies, 10 cards in hand and particles live
(`shots/cb-stress2`, `cb-fps4`). **Zero console errors** in every capture listed below.

### Layout (STS2-REFERENCE section 1)

Keepsake bar top-left (a real "No Keepsakes" empty state, not a placeholder) /
Courage + Lost Things + turn counter top-right / enemies upper-centre with the intent
stack above and Courage bar, Guard shield, counters and statuses below / player plate
lower-left (companion portrait plate, Courage bar, Guard shield, status row, incoming
readout) / **Nerve** orb bottom-left with the draw pile beside it / End Turn bottom-right
with the discard pile. Both piles open a viewer; the draw pile is **sorted by name** so
looking is information rather than an oracle.

End Turn has three states: disabled (not your turn), `is-waiting` (you still have plays),
and `is-ready` - a lit gold button with a slow pulse the instant nothing in hand is
playable.

### The intent view - `ui/intent.js`

Two redundant channels so the read never depends on colour:
**frame shape per family** (attack = downward shard, defense = shield, scheme = hexagon,
special = circle) and **glyph per type** - all 16 including the new `DEFEND_DEBUFF`
(shield + falling chevron, the exact mirror of `DEFEND_BUFF`).

- Attack intents print the exact post-modifier per-hit damage and `xN` for multi-hits.
- **A Guard number can never be mistaken for damage**: it wears a shield clip-path and the
  Guard palette, damage does not.
- Every `intent` event animates a number flip - up flips red and overshoots, down flips
  cyan and undershoots. This is what makes "your damage changed the future" legible.
- `is-heavy` (ATTACK_BIG, or >=34% of current Courage) thickens the frame, enlarges the
  glyph and adds a breathing halo; `is-lethal` adds a drop-shadow pulse.
- Status pips under the frame show what the move will apply without needing the tooltip.
- Hover gives the move name, plain-language lines, the `tell` in italics, and the note
  "This number is exact - every modifier is already counted."

`intentFamily()` in `combat/intents.js` still maps `DEFEND_DEBUFF` to `special`;
IntentView overrides it locally to `defense`. **One line to delete once the engine agrees.**

### Enemy rigs - `ui/enemy.js`

Procedural SVG built from `silhouette` / `shape` / `palette` / `scale`. Four trunk
archetypes (`squat`, `tall-thin`, `sprawling`, `floating`) generated as seeded
Catmull-Rom blobs - deterministic from the enemy id, so the same Dust Bunny is lumpy the
same way every run. **All 24 silhouette keys have a hand-authored prop layer** plus a
sensible default; eye layouts for 0-6 eyes; limbs distributed front and back.

After mount each rig **fits its own viewBox to `getBBox()`** and publishes the resulting
aspect as `--e-aspect`, so a 0.7-scale service bell and a 2.0-scale bedframe both stand on
the floor with the intent right above their heads. Sprawling rigs are width-capped so one
rug serpent cannot eat the room.

Animation is about 7 transform writes per enemy per frame, no per-frame allocation:
breathing, sway, a periodic twitch with an eye dart, real blinks (a sine over the blink's
life, so it shuts and opens), limb ripple, and pupil tracking that looks at the player
during a wind-up. `windup(type)` poses per intent family and **resolves before damage
lands**; `strike()` is the contact lunge; `flinch(hpLoss)` throws and squashes; `clank()`
is the duller Guard-absorbed reaction; `die()` is a stagger, then lights out, then a
dissolve.

Beyond the base rig, as the enemies agent asked:

- `setCounters()` - Dust / Momentum / Resonance / Wound Up and the rest as gold chips
  under the Courage bar, with a bump animation on change and a tooltip. Read from
  `actor.counters`.
- `setBadges()` - named state badges above the intent (Coatcheck Garment + Snagged,
  Pristine/Cracked/Shattered, Hidden/Exposed, Bed Position, Discomposed, Darkness).
- `setRule()` - a handwritten House Rule card on ruled paper, driven by the engine's
  `rule` / `rule:broken` events.
- `setAlternatives()` - the Night Terror's two-possibility intent: both futures rendered
  side by side with their trigger labels, collapsing to one when `alternatives(c)` does.
- `setQueue()` - the `intent:queue` slice past position 0, unrevealed slots dashed with `?`.

### Tactical clarity

- Hover or drag calls `engine.preview(uid, targetId)` and paints the outcome **on the
  target**: predicted damage, hit count, `LETHAL`, and the statuses that will land.
- The card's own numbers recolour live via `CardView.setPreviewNumbers`.
- **Uncertainty is honest.** `preview()` returning `uncertain` (a card with an unmade
  choice) prints `6?` instead of `6`, dashes the target overlay, suppresses the LETHAL
  claim and adds "depends on your pick". `previewAsync()` refines it a frame later, still
  flagged uncertain.
- **Incoming damage readout** on the player: `previewIncoming()` totalled across every
  living enemy intent, shown as `23 -> 23` with either "N more Guard to stop it all",
  "Fully blocked", or `LETHAL`. It updates as Guard changes - including the *predicted*
  Guard while a Curl Up is hovered - and paints a hatched band on the Courage bar showing
  exactly how much of it this turn eats.
- Every status pill, counter chip, queue slot, keepsake, pile and orb is hoverable and
  keyboard-focusable with a plain-language tooltip.

### The chooser (engine Round 2)

`engine.setChoiceResolver()` is installed, so the ~70 "choose a Trick" cards get a real
picker: full CardViews for `kind:'card'`, labelled buttons for `option`, and for `enemy`
both a button list **and** clicking the creature itself (its floor pool lights spectral).
Multi-pick shows a Confirm, optional choices show Skip. Keyboard: arrows move, Enter
picks, 1-9 jump, Esc skips when optional. `exit()` resolves any pending request with `[]`
so the engine can never be left awaiting a dead scene.

### FX - `fx/combatfx.js`

One pooled canvas (struct-of-arrays, 1100 particles, zero per-frame allocation, and it
**skips the clear entirely when idle** - that alone took the scene from 17 fps to 61) plus
a pooled DOM layer for numbers so they stay crisp over shake and particles.

Damage numbers rise, drift and fade, scaled logarithmically by magnitude with a 2px ink
stroke. Hit flash and flinch are driven by a CSS *animation* so nothing lingers. Courage
bars drain with a ~300 ms hold then a slow trail so the loss reads. Guard gain shimmers;
Guard break shatters into spinning shards with a `GUARD BROKEN` plate. `stage.shake()`
**and** a DOM shake on `.cb`, both scaled to `hpLoss` (never to `amount`).
`clock.hitstop(0.16, 0.075)` on `hpLoss >= 12` only. Deaths get a stagger, lights-out eyes,
a spectral pulse, 44 motes in the creature's own palette and a beat before the board
re-centres. `atmosphere.impact()`, `dread()` on the enemy phase, and `audio.play()`
throughout, all guarded with `?.`.

### Wiring

`engine.on('*')` pushes into one queue drained by a single async consumer, so a five-hit
attack reads as five impacts and an enemy's wind-up always completes before its damage
lands. The scene never decides rules - `onPlay` only asks `canPlay()` and then calls
`playCard()` on the Hand's hold beat (200 ms in), which is why the effect lands while the
card is presented. `engine.state` is used only at settle and at build; every per-event
refresh reads `engine.actor()` / `engine.piles` / `engine.energy` / `engine.phase`.

### Accessibility

Full keyboard path: 1-9 select, arrows move and cycle targets, Enter aims and confirms,
Esc cancels, **E** ends the turn, **Q**/**W** open the draw/discard piles, Tab cycles
targets while aiming. `reduceMotion` collapses every duration through one `_d()` helper
and skips particles; `screenShake`, `flashes`, `showDamageNumbers` and `largeText` are all
respected and re-read on `settings:changed`.

### Tokens I need (I did not edit `tokens.css`)

1. **`--good-300` / `--good-500`** - already requested by card-feel; I need the same green
   for "this preview is better than printed" and for the safe state of the incoming
   readout. I am currently reusing `--spectre-200`, which reads as cold rather than good.
2. **`--warn-300`** - an amber distinct from `--flame-300`, for the "uncertain outcome"
   dashes and the `?` suffix. `--flame-200` currently doubles up with the Nerve palette.

Everything else came from existing tokens. The only literal colours anywhere in my files
are the enemy `palette` arrays, which are **content** authored by the enemies agent and
read off the defs, never hardcoded.

### What I need from other agents

- **combat-engine** - three things:
  1. `intentFamily()` should map `DEFEND_DEBUFF` to `defense` (I override it locally).
  2. For **`covered`** (Blanket Blob): please add a generic `redirectDamageTo` field on the
     status rather than making the Blob's `onDamaged` do it. The renderer wants to draw the
     redirect arc from the covered actor to the protector, and it can only do that if the
     protector is *data* on the status rather than logic inside one enemy.
  3. `engine.enemyCtx(enemy, move)` is declared with two parameters but `intents.js`
     `deriveMoveId` calls it with three. It works, but the signature should say so.
- **ui-chrome** - `ctx.tooltip.show()` is still a stub. I probe it once on first hover and
  fall back to my own `.cb-tip` renderer; the moment you ship a real one that appends to
  `ctx.tipLayer`, my probe detects it and defers automatically. No change needed on my side.
- **card-feel** - nothing blocking. I override `--card-w` / `--card-h` on `.cb-root` to
  `clamp(140px, 10.5vw, 174px)` so a 10-card fan does not reach the enemies at 900px tall;
  say the word if you would rather own that number.
- **meta-run** - `ctx.run` does not exist yet. I boot from real Foyer content
  (`startingDeckFor(companion)` + `rollEncounter`) and fall back to `makeDummyCombat`.
  When `run.js` lands, set `ctx.run.combat` to a built `CombatEngine` and I use it directly;
  otherwise `ctx.run.companion / region / seed / rng / gold` are all read if present. On
  victory I `scenes.go('reward')` and on defeat `scenes.go('gameover')`, but only when
  `ctx.run` exists.

### Not built, and why

The Bedframe Beast's three **Bed Positions** are set dressing that must move when the
player's 3rd and 6th Tricks land. There is no engine surface for them yet - they are not
actors, objects or counters. Either the Beast should register them via
`engine.addObject({kind:'bed-position'})`, in which case `object:add` / `object:update`
already give me everything I need, or the enemies agent should mirror them into
`engine.field` and I will render off that. I did not want to invent a third channel.

### Screenshots

`shots/cb-final.png` (4-enemy board), `cb-final-aim.png` (aim plus damage preview),
`cb-stress2.png` (4 enemies, 10 cards, 61 fps), `cb-choice2.png` (the chooser),
`cb-turn_f0..f13.png` (a full enemy turn), `cb-death_a/b/c.png` (a death),
`cb-hover2.png` (hover plus predicted Guard), `cb-kb-aim/played/pile.png` (keyboard path),
`cb-exit.png` (scene teardown and re-entry).


---
