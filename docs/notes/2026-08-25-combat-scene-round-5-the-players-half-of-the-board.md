# Combat scene, round 5 — the player's half of the board

> "Every screen except the one you play on is finished: the player's half of the
> combat scene is still placeholder."

Owner: combat-scene. Files touched: `src/scenes/combat.js`, `src/scenes/combat.css`,
`src/ui/enemy.js`, `src/fx/combatfx.js`. Nothing outside those.

Green at the end: `tests/combat/run.py` 649/0 · `tests/combat-scene/seam.py` 22/0 ·
`tests/seams/check.py` 1604 call sites, 0 problems · `tests/seams/proof.py` 52/0 ·
`tests/scene-css/check.py` 871 classes, 0 conflicts · 0 console errors across ten scenes.

---

## 1. Your Companion was a generic cat sixteen times

`shots/p6-74-pal-compare.png` is the whole review in one image: Bones the Skeleton
Puppy, Marmalade the Ghost Cat and Taffy the Candy Slime, side by side, drawn as the
identical cat head — pointed ears, whiskers, curled tail — with only the fill changed.
`enemy.js` had keyed enemy behaviour and enemy props off `MOTIF` / `BODY_MOTIF` /
`PROPS` since round 2. The player's own Companion had a three-colour palette and
nothing else.

**`PAL_ART`** (`ui/enemy.js`, beside `PALS`): sixteen hand-authored silhouettes, one per
Companion, drawn in a shared body space (origin at the creature's centre, +x toward the
creatures, everything inside x ∈ [-38, 40], y ∈ [-40, 30]) so the drop-in translate at
the Kid's shoulder is the same for all of them. Read against
`game/assets/portraits/<slug>.png`, which is what each Companion actually looks like:

| | | | |
|---|---|---|---|
| **marmalade** ghost cat: pointed ears + whiskers, but the body ends in a **scalloped spectral drape**, not legs | **wisp** teardrop of flame, no ears, no limbs, sad mouth | **crumbula** saucer ears, red-lined cape, fangs, one enormous fluffy tail | **boggle** ragged navy fur-tuft, two lamp-yellow eyes, three claws, no face |
| **bones** floppy ears, a **MUZZLE**, hinged jaw with teeth, eye sockets, a bone for a tail | **pipkin** carved gourd head, stem and vine, splayed frog feet | **taffy** glossy dome under a poured glaze that drips over the edge, in its own puddle | **truffle** fan of quills, stitched patch, small pointed snout |
| **hush** long low ferret pointed at the creatures, ribbon of smoke for a tail, eyes the only light | **mopsy** two long stitched ears, one button eye, one X of thread, a bow | **mossbit** headstone shell, moss along the shoulder, head out to the right | **pudding** flat wrinkled pug face, folded ears, tongue out, corkscrew tail, translucent |
| **wink** one enormous eye, eight legs | **drizzle** bumpy cloud still raining | **brambleboo** carved gourd growing out of a cracked pot | **crinkle** folded paper crow: every edge straight, every plane a flat facet |

Materials are classes only (`pp-body` / `pp-light` / `pp-dark` / `pp-line` / `pp-thin` /
`pp-eye` / `pp-glint` / `pp-glow` / `pp-hot` / `pp-sclera` / `pp-pink` / `pp-smoke`), so a
new Companion is a shape plus three accents and no colour decision. CONTRACTS §2 holds:
the three accents come from `PALS`, everything else from tokens.

**`PALS` was re-keyed too.** Marmalade was painted pumpkin-orange when she is a
translucent blue-white *ghost* cat; Crinkle was gold when he is a black paper crow;
Boggle was mint green when he is navy fur with yellow eyes; Pudding, Mopsy, Truffle,
Crumbula and Hush were all off. Board and portrait now agree about the same creature.

Two things learned drawing these at 60 px:
- A single flat ellipse behind a spectral Companion reads as a grey **disc** — the same
  "debug bounding box" note the reviewer made about the Kid. `PP_GLOW` is three rings
  at .13/.07/.035 opacity, which is a soft halo with no filter and no gradient id to
  keep unique per instance.
- Bones's first draft had three rib arcs under the skull. At this size they read as
  **spider legs**. They are two short arcs across the chest now, and the tail is one
  clean bone shape rather than two loose knobs.

Comparison shot: `shots/p7-pal-compare.png` (Bones / Marmalade / Taffy, on field, same
crop). All sixteen: run `pal_sheet` style capture against `.pr-palset`.

## 2. The Kid was a flat two-tone doll standing in a light-blue ellipse

Round 4's rig was one fill for the coat, one for the face, both legs welded into a
single static group, and a `2px` `guard-300` ellipse spanning the whole figure on the
Guard beat — which is exactly the "1px light-blue ellipse that reads as a debug bounding
box" in the review.

- **Lit, not filled.** Three named gradients (`pr-c*`, `pr-f*`, `pr-h*` stop classes, so
  the tokens stay the only colour decision) plus a warm `pr-rim` down her torch side and
  a cold spectral edge on the other. Scarf, jaw shadow, brow, nose, ear, blush, hair
  highlight and strands, pack buckle, torch band, two hands.
- **A strike silhouette that reads without the motion.** The reviewer's bar was 44px of
  displacement. The pose translate was already 44px; the *shape* never changed. The legs
  are now two independent groups that stride (`±21°/∓26°` about the hips), the off arm
  counterweights (`∓46°` about the shoulder), and the coat's back panel and the scarf
  tail trail the body. `shots/p7-kid-strike.png` is idle / wind-up / contact at
  `clock.scale = 1/5`, measured at `--p-lx` −16 → +36 px.
- **A contact shadow instead of a ring.** `pr-cast` is an SVG group *outside* `pr-root`,
  drawn in rig units at the foot line, so it is always exactly under the boots at every
  viewport size — the first attempt was a DOM div at `bottom: 2px` of `.cb-hero` and
  landed ~90px below her feet, because the rig `meet`-fits inside its box. A soft
  radial shadow plus the warm pool the torch throws. It stretches on the lean and
  tightens as she plants. Guard is now a cold hard flash along `pr-rim` plus a brace of
  the shadow, not a box around her.

## 3. The Kid's name was printed under a painting of a dog

`.cb-player__name` took `engine.player.name`; the picture above it is the Companion's
portrait. It reads **BONES** / *the Skeleton Puppy* now (name + title from
`data/schema.js` `COMPANIONS`). The Kid's name is on the section's accessible name
("You — Jordan Brooks and Bones"), and she is on the board with her own body, which is
where a player looks for her.

## 4. Courage was 850px from Guard

Measured round 4: player HP was an 80px pill at `x=168` in the top bar; Guard was a
shield badge at `x≈255, y≈700` on the portrait. STS2-REFERENCE §1 stacks block shield,
HP bar and status row together, on the player, because that is the comparison you make
every single turn.

`.cb-player__plate` is now, top to bottom: identity → `.cb-player__vitals` (Guard shield
inline-left of the Courage bar) → status row → INCOMING. The bar has the same lagging
ghost drain the creatures use (`_drainCourage`, ticked from the scene frame loop), so a
hit reads identically on both sides of an exchange. `ui/hud.js` keeps its top-bar pill
as the run-level echo; it was not touched.

## 5. Enemy counters were behind the player's own hand

Reproduced exactly. `foyer-scare-bell`, `Resonance 0/4`, `document.elementFromPoint` at
the chip's centre:

| | round 4 | round 5 |
|---|---|---|
| 1280×720 | `[633, 458]` → **DIV.mm-card** | `[515, 423]` → `SPAN.cb-count` |
| 1600×900 | `[804, 604]` → **DIV.mm-card** | `[681, 568]` → `SPAN.cb-count` |
| 1920×1080 | `[974, 749]` → **DIV.mm-hand__hit** | `[846, 712]` → `SPAN.cb-count` |

Same run also checks `Dust 0/4` and the player's `Loose Bones 0/6`: **0 hidden chips**
at all three resolutions, after two real turns of play.

Two halves:
1. `.cb-enemy__counters` moved to the **top** of `.cb-enemy__plate`, above the name and
   the Courage bar. Those chips are the mechanic each fight is built to teach.
2. `EnemyView#setPlateLimit(y)` + `CombatScene#_fitPlates()`. The scene measures where
   card-feel's fan actually is (the lowest of the visible `.mm-card` tops and
   `.mm-hand__hit`, which occludes for the pointer even though it is invisible) and
   lifts any plate that still reaches into it, via `--e-plift` in the plate's existing
   pose-cancelling transform. Capped at 92px. Runs on layout changes only — enemy
   spawn/death, resize, hand re-lay-out, turn start — never per frame, and coalesced
   into two passes (360ms and 1000ms) because the fan is still easing at 360.

   Measured rather than modelled on purpose: round 4's `--e-h: min(..., 100vh - 500px)`
   budget *was* a model, and it forgot the 104px `.cb-enemies` reserves above every
   creature for the intent stack. At 1600×900 the plate ended 26px **below** the arena
   floor.

### The bug underneath it: an entrance animation was eating two live transforms

`@keyframes cb-plate-in` ended on `transform: none` and ran with
`animation-fill-mode: both`, so the last keyframe stayed applied forever. From the
moment a creature finished entering:

- `.cb-enemy__plate`'s pose cancellation (`--e-lx` / `--e-ly`) was overwritten with
  `none`. The plate had been written to hold still while the body lunges; it rode the
  lunge instead, and my new `--e-plift` did nothing at all (computed `--e-plift: -80px`,
  computed `transform: matrix(1,0,0,1,0,0)`).
- `.cb-enemy__above`'s `translateX(-50%)` was overwritten too, so the intent stack sat
  half its own width off centre for the whole fight.

Fixed by animating the individual `translate` property, which **composes** with
`transform` instead of replacing it. Worth remembering: a `to { transform: none }` in a
`fill-mode: both` entrance is a silent permanent override of anything else on that
element, and it produces no error and no console output.

## 6. Flashes=0% and Reduced motion did not damp the impact bloom

Round 4 measured a 6-damage Bite lifting whole-room mean luminance 78 → 110 (+42%),
**unchanged** with Flashes at 0% (77.8 → 110.3) and **unchanged** with Reduced motion ON
(78.6 → 110.3) — despite that setting's hint reading "Overrides the settings above".

Three separate leaks:

1. **`atmosphere.impact()` gates its `stage.flash` and `stage.ripple` on the settings,
   but its point-light flare (`base = 2.2 × strength`, straight into the bloom pass) and
   its 3D spark burst are ungated.** `strength` is the only lever this scene has on
   someone else's flare, so it carries the job. Spy on the real call, real 6-damage
   Bite, real code path:

   | | strength passed |
   |---|---|
   | round 4, any setting | `0.473` (`min(1.5, 0.2 + hpLoss/22)`) |
   | round 5, default | `0.2442` |
   | round 5, Flashes = 0% | `0.001` |
   | round 5, Reduced motion ON | `0.001` |

   The atmosphere's own spark burst measured as the larger half of the remaining wash,
   so `burst` is dropped below a fifth of the slider; `fx.burst` on the 2D layer is
   alpha-scaled rather than removed and carries the hit on its own.

2. **The Flashes slider is a 0..1 range, not a boolean.** `ui/settings.js` declares it
   `type:'range', min:0, max:1, step:0.1`. `CombatFX` read it as `!== 0`, so 10% and
   100% were the same picture and only exactly-zero did anything. It is now a gain:
   `glow = 0.22 + 0.78 × flashes` multiplies every additive particle's alpha, and
   `setFlashes()` keeps it live when the slider moves mid-fight.

3. **`EnemyView`'s hit flash and `PlayerView`'s had no gate at all.** Both take a
   `flashes` gain now, pushed from `settings:changed` alongside `reduceMotion`.

**And it is scaled to damage.** `0.12 + 1.38 × (hpLoss/20)²` — 6 damage is `0.244`,
20+ damage saturates at `1.5`. Round 4's `0.2 + hpLoss/22` is nearly flat over the range
a Foyer fight actually deals, which is why a 6 and a 26 bloomed the same.

### Measured, after

Whole-frame mean luminance, 1600×900, `foyer-1`, real 6-damage Bite. Method notes,
because getting a trustworthy number here took four attempts:

- the world is slowed 6× (`clock.scale`) so a 140ms flash cannot fall between two
  captures;
- a **control window** of the same length and time-scale is captured first with no hit,
  because this room's own candlelight breathes by several counts — sampling a bare strip
  of wall for 32s gives 9.2 → 28.3 → 12.4 → 18.3, a ±100% swing with nothing happening;
- the cursor is parked off every tooltip anchor, because hovering a creature opens a
  large pale parchment panel worth ~25 counts on its own, and it fooled two runs.

| | control max | impact peak | lift |
|---|---|---|---|
| round-4 atmosphere arguments replayed, Flashes = 0% | 66.3 | 80.9 | **+14.6 (+22.0%)** |
| round 5, default | 66.5 | 80.6 | +14.1 (+21.1%) |
| round 5, **Flashes = 0%** | 69.2 | 74.6 | **+5.4 (+7.8%)** |
| round 5, **Reduced motion ON** | 68.9 | 70.3 | **+1.4 (+2.0%)** |

The +7.8% floor at Flashes=0% is **not the hit**. A no-damage card (`Shake, Boy!`)
played into the same room measures +4.9 (+7.5%): that residual is card-feel's card in
flight passing in front of the room, and it is identical with the hit removed. With
Reduced motion the card arc is instant too, and the whole thing is +2.0% — inside the
room's own flicker.

## 7. The Door Greeter announced a rule without saying what it does

Its intent tooltip read "Announces the House Rule NO RUNNING." and stopped. The Butler's
reads in full because his has already been announced, and `announceRule()` teaches the
engine the text on the way past; before the first announcement `resolveRule('no-running')`
can only humanise the id, so `intent.rule.text` is empty and `ui/intent.js` — which
already prints the text when it has one — has nothing to print.

`engine.registerRules()` exists for exactly this and nobody was calling it. The scene
calls it now. Tooltip today:

> **Mind Your Manners** — Scheme. Announces the House Rule NO RUNNING. Playing a fourth
> Trick this turn breaks the rule. Reprimand: 6 damage. *It clears a throat it does not
> have. A rule appears in the air beside it.*

**`houseRuleCatalogue()` is in the wrong file and says so in its own comment.** The text
lives in `data/enemies/foyer.js` inside `mind-your-manners`'s `effect()`, where nothing
can read it until it fires. See the hand-off below. The reprimand number is read off the
live Haunt flag rather than hard-coded, so Haunt 3's 8 does not display as 6.

---

## Hand-offs (not my files)

**enemies — one line, and `houseRuleCatalogue()` in `scenes/combat.js` deletes itself.**
Give `doorGreeter.moves['mind-your-manners']` a `ruleFn(c)` that returns the whole
`{id, name, text}` object instead of the bare `rule: 'no-running'` id, using the same
`alt` / `dmg` logic its `effect()` already has. `combat/intents.js:233` already prefers
`ruleFn` over `rule` and `engine.resolveRule` already accepts an object. That is the
whole fix, and it also makes Haunt 2's alternation show the *right* rule in the intent
instead of always NO RUNNING. Alternatively export a `HOUSE_RULES` catalogue from
`data/enemies/index.js` and I will register that instead of my interim table.

**card-feel — the held aim card still clips the enemy HP bars, much less than it did.**
1600×900, `foyer-7`, keyboard path (focus hand → `ArrowRight` ×2 → `Enter`), which is
what `shots/p6-75-76-kbd.png` captured:

- raised card `[794, 508, 939, 709]`
- Lost Luggage: name `[660,498,772,513]` **0% covered**, bar `[609,516,823,531]` **14%**
- Dust Bunny: name `[969,498,1065,513]` **0% covered**, bar `[912,516,1122,531]` **13%**
- `elementFromPoint` at both name centres and both bar centres returns the plate, not
  the card.

The nameplate occlusion the review saw is gone — that was mostly the plate hanging too
low, which §5 fixed. What is left is the card's top edge clipping the outer ~14% of each
bar's width. Screenshot: `shots/probe/kbd-aim.png`. The mouse aim path is already clean
(0% on plate, name and bar). If the held-aim Y can come down ~40px, or the card can be
held below `arenaBottom`, it is fully clear. I did not want to lift the plates further
on aim — plates that jump when you pick up a card are worse than a clipped bar corner.

**atmosphere — room props are bimodal and the bright ones are the flat ones.**
`shots/mm-nursery.png` (1920×1080). The Nursery's cots and stands are flat untextured
pink/magenta cuboids with no material and no shading, and they are the **brightest
objects in frame** — brighter than the creatures standing in front of them. Two curtain
panels hang unanchored in the ceiling void at the top of the frame, one clipped by the
viewport edge, attached to nothing. Same family of problem in the Music Room and the
Umbrella Gallery. The Butler's crypt and the Inner Entry Hall are excellent and are the
bar. Nothing in this is mine — `.cb-arena` draws no props; these are backdrop meshes in
`fx/atmosphere.js`.

**atmosphere — `impact()` needs a light gate of its own.** I can only reach the flare
through `strength`, which conflates "how hard was this hit" with "how bright is the
player willing to let the screen get". A `light: false` (or a `bloom` multiplier) on the
options would let the scene keep a full-strength ripple and burst while the flare and
the halation stay dark, which is what the Flashes slider actually means.

**lead / integrator — note:** the working-tree edits to `ui/enemy.js` and
`scenes/combat.css` from the first half of this round were swept into commit `c26a02b`
("Backpack works end to end") while I was mid-session. Nothing was lost, but that commit
contains work that is not its own.

---

## Things worth not re-learning

1. **`animation-fill-mode: both` with `to { transform: none }` permanently overrides any
   other transform on that element.** Cost a round of "the CSS variable is set correctly
   and the computed transform is identity". See §5.
2. **A DOM shadow at `bottom: 0` of the hero box is not at the hero's feet.** The rig
   `meet`-fits inside its box, so the feet can be 90px above the box bottom. Anything
   that must sit at a rig landmark belongs *in rig coordinates*, inside the SVG.
3. **A hovered creature opens a large pale tooltip panel.** Any luminance or layout
   measurement that leaves the cursor where it clicked is measuring the tooltip. Park it
   at a dead corner first.
4. **This room's ambient luminance swings ±100% on its own** over ~30s. Any brightness
   claim needs a paired control window of the same length and the same `clock.scale`,
   taken in the same session.
5. **The dev server occasionally serves a half-written module** while a script is
   rewriting a source file, which surfaces as `Unexpected token ':'` or
   `Unexpected token 'const'` and a dead `window.MM`. Re-run before debugging; a real
   parse error reproduces every time. Confirm with
   `await import('/game/src/<mod>.js')` in the page — it names the failing module.
