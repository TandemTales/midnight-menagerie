# combat-scene, round 4 — the delivering side of a hit

OWNER: combat-scene. Files touched: `src/scenes/combat.js`, `src/scenes/combat.css`,
`src/ui/enemy.js`, `src/ui/intent.js`, `src/fx/combatfx.js`, `tests/combat-scene/seam.py`.

The round-3 review scored this screen 7 ties / 5 losses against Slay the Spire 2 and named
**juice** as a whole-dimension loss. The receiving side of a hit was praised — flinch, panel
shake, shards, GUARD BROKEN, HP drain lag, the death dissolve, the room cooling on THEIR TURN —
and every one of those is untouched. What did not exist was the **delivering** side.

---

## 1. Nothing animated when it attacked — the dimension-6 loss

### What was actually wrong

The reviewer measured **0 px of movement over 14 frames** of an enemy attack, with the frames
byte-identical. `EnemyView` did have `windup()` / `strike()` / `settle()`, they were called, and
they still produced nothing you could see. Two independent causes, both structural:

1. **The pose lived in RIG SPACE.** `dx = lean * -26` was applied to the SVG `<g class="rg-root">`
   inside a viewBox that `preserveAspectRatio="xMidYMax meet"`-fits into a ~170 px stage. A
   full-commitment lunge of 26 user units was worth roughly **twelve on-screen pixels**. It also
   meant `.cb-enemy`'s own rect never moved at all, which is what the reviewer's probe measured.
2. **The pose was chased by a spring.** `a.lean = cur + (target - cur) * min(1, 13 * dt)` over an
   85 ms contact beat covers 1 − 0.783⁵ ≈ 70 % of the distance and is then immediately retargeted.
   The pose never once arrived at the value the code asked for. **A spring cannot promise it
   arrives, and a contact frame is exactly a promise that it arrived.**

Baseline, sampled per rAF across a full enemy turn (`.cb-enemy` rect, screen shake removed by
differencing against the creature's own plate): **dx 0.0 px, dy 7.6 px** — and the 7.6 was the
`defend` hunker, not an attack. The player was worse: no body existed, only a framed portrait in
the corner captioned KID, measuring **0.0 px** on the path the reviewer took.

### What it does now

**Enemy attacks** are three beats driven by explicit `clock.ramp` calls in **screen pixels**,
published as `--e-lx / --e-ly / --e-lr` on the creature's own element:

| beat | duration | what it is |
|---|---|---|
| wind-up | 120 ms | coils back, then **held** until the move resolves |
| contact | 90 ms | reaches the strike pose on the frame `damage` fires; `strike()` resolves there |
| follow-through | 250 ms | past the contact pose and drifting home, deliberately **not** awaited |

`.cb-enemy` carries the translate so its rect genuinely moves; `.cb-enemy__plate` carries the
exact inverse, so the body commits while the Courage bar and the name stay nailed down. The
rotation is on `.cb-enemy__rig` and **not** on `.cb-enemy__stage`, because the hit reactions
(`cb-hitshake`, `cb-clank`) are keyframed on the stage and a CSS animation beats an inline
transform — putting the attack tilt there would have it silently vanish for 220 ms after any hit.

**Per silhouette family**, as asked (`MOTIF` / `MOTIFS` in `ui/enemy.js`): a bell **swings**
(almost all rotation, barely any travel), a suitcase **lunges**, a carpet **ripples** (flat, fast,
rolls rather than tips), a jack-in-the-box **springs**, a tall formal thing **stoops**, a
patchwork giant **slams**, a dust bunny **pounces** (leaves the floor). Anything unnamed falls
back to its body archetype. A `mass` factor from the creature's own `scale` scales travel down for
heavy things and up for light ones, so weight reads with no text involved.

**The player now has a body.** `PlayerView` in `ui/enemy.js` builds a procedural Kid — coat, boots,
dark bob, a satchel, and a lit torch — standing on the creatures' own floor line, facing them,
with the companion floating at her shoulder in that companion's accent colours. Same pose
contract as `EnemyView`, so both halves of an exchange are written once. `fx.swing()` (new
`K_ARC` particle in `combatfx.js`) draws the weapon **trail**: a crescent that leads with its head
and dissolves from the tail, because STS2-REFERENCE §4's "a strike swings a weapon" is about the
swing having a path, not about a burst appearing at the end of one. The portrait panel stays where
it was — it carries Guard, the resource counters and the INCOMING readout, none of which should
ride on a moving body — and player FX now land on the body rather than on the picture frame.

### Measured, before → after

Per-rAF sampling, 1600×900, four enemy turns plus one player attack, ANGLE/Intel UHD:

| what | before | after |
|---|---|---|
| attacker `.cb-enemy` rect, shake removed | **0.0 px** (dx 0.0, dy 7.6 = defend only) | **90.2 px** (dx 77.9, dy 45.4) |
| attacker sprite `.rg-root` | 29.8 px (mostly idle sway) | **132.0 px** (dx 113.4, dy 67.6) |
| the creature's own plate, shake removed | — | **0.0 px** (holds still, by construction) |
| the player's body | **no body; portrait 0.0 px** | **88.9 px** (dx 87.5, dy 16.2) |
| fps at 1920×1080 and 1600×900 | 61 | **61** |

`reduceMotion` measured with the setting on and `reduced-motion: reduce`: attacker pose
**0.0 px**, player body **0.0 px**, board shake **0.0 px**. It zeroes the pose rather than merely
shortening it — a 50 px snap is worse for a motion-sensitive player than no move at all.

Strips: `shots/cs4-eatk2-strip.png` (ten frames, 55 ms apart, screen shake off, tight crop — the
Coatrack Crawler visibly draws back and swings while its name plate does not move),
`shots/cs4-play-strip.png` (the player's side).

---

## 2. The Bury chooser could not be cancelled

Three separate faults, all in the scene, none in the engine:

* **CONFIRM required `req.count`.** The engine has never wanted that.
  `combat/choice.js#sanitise` accepts **any subset** of the pool and only substitutes a single
  index when a *non-optional* request comes back completely empty. "Bury up to 2" with one card
  selected was a legal resolution the entire time and the screen refused it.
* **The card and the UI disagreed.** `bones/backyard-cache` prints "Bury **up to** 2 other Tricks";
  the chooser said "Pick 2". The request carries `meta.cardUid` / `meta.cardId`, so the scene now
  reads the printed text and honours it (`_isUpTo`). This is a rendering decision — whatever count
  comes back, the engine is still what applies it.
* **Escape did nothing on a mandatory chooser** while working on the Fetch picker, so two panels
  in one scene behaved differently and one read as frozen.

Now: `min` is 0 for optional/"up to" requests and 1 otherwise; CONFIRM goes live the moment the
selection is legal and labels itself (`Confirm 1`, `Confirm none`); the sub-line says
"Pick up to 2"; **every** chooser shows a cancel control (labelled Skip when skipping is free,
Cancel otherwise); and **Escape always dismisses**. Cancelling a mandatory pick with something
selected keeps the selection — Cancel is an exit, not a destructor. Cancelling with nothing
selected says "Cancelled — the House picks for you" out loud, because that is what `sanitise` is
about to do.

Proved across the seam in `tests/combat-scene/seam.py` (now 22 checks, was 14): the chooser closes
on Escape, `_choice` is released, **the Fetch still completes and renders** after a cancel, the
sub-line says "up to 2", CONFIRM is enabled at 1 of 2, and the engine buries **exactly one** card
(`buried 0 → 1`). Screenshot: `shots/cs4-chooser.png`.

**Ask for companion-cards** — the data half, so the two agree at the source rather than by
inference: `bones/backyard-cache` (and every other "up to N" card that routes through
`U.pickCards`) should pass `optional: true`. `data/companions/_util.js#pickCards` already accepts
it and drops it on the floor unless the caller sets it. The scene's text reading is a safety net,
not the fix, and it becomes a no-op once the flag lands. Same family, worth a sweep:
`bones/dig-like-crazy`, `bones/keep-it-somewhere-safe` and anything else whose text says "up to".

---

## 3. The intent badge read as the wrong number

Lost Luggage's Pack Wrong drew `[🛡5][CLUTTER to discard]` as one strip. At 1:1 a 10 px shield
glyph reads as a bullet, so the badge scanned as "5 Clutter" — wrong twice, because the 5 is Guard
and the real Clutter count is 1.

* `intent.addsCards` is now read from the **engine** (`[{id, name, pile, count}]`, resolved by
  `combat/intents.js#groupCards`) rather than off the EnemyDef, and the **count is printed**. It is
  the numeral in the chip, with the card name as the label beside it — the same grammar as
  `[7 ×3]`. `intent.rule` is read as the resolved `{id, name, text}`, so the tooltip names the rule
  instead of saying "a House Rule" (and the chip key stops stringifying an object).
* **The Guard pill and the deck pill are on different lines.** Guard and damage are what a move
  does to the board and stay on the badge's own line; cards and House Rules are what it does to
  your deck and sit on a second line under it (`.cb-intent__extras`), different height, different
  colour. They cannot be read as one number because they are no longer on one line.
* A debuff-framed intent whose only number is its Guard now also gets a `Guard` word chip, so the
  number is never orphaned under the wrong frame.
* `IntentView#ariaLabel()` is exported and reused by the enemy's own label.

At 1:1 the badge now reads `[🛡5] [GUARD]` / `1 CLUTTER TO DISCARD` — `shots/cs4-intent-1to1.png`.

---

## 4. Smaller, all measured

**The played card covered the target.** Measured at the exact contact frame (hooked on
`fx.number`, so it is the frame and not a sampled approximation): the card occupied
`[690, 253, 909, 558]` against a target at `[582, 273, 850, 488]` — **58.2 % of the creature**, so
flinch, shards and GUARD BROKEN all played behind cardboard. Two changes: `PLAY_RESOLVE` moved the
effect from 200 ms (before the card has even *arrived* — `ui/hand.js` `TUNE.playTo` is 260 ms) to
440 ms, the end of the presentation hold; and the cards drop to `filter: opacity(.22)` for the
length of one impact, armed *before* the attacker commits so it is already down on the contact
frame. A **filter**, not the opacity property, because the Hand writes that inline during the
discard arc and inline wins the cascade. Effective occlusion at contact: **58.2 % → 13.1 %**.

**Ask for card-feel** — the complete fix is one number I do not own: `ui/hand.js` `TUNE.playY` is
`0.62` of the board height, which is what puts a 226×314 presented card straight across the
creature band (card y 253–558 vs creatures y 273–488 at 900 px tall). Around `0.84` would clear it
outright and the veil could then be dialled back or dropped. STS2-REFERENCE §1 does want the
effect to resolve *while* the card is presented, so the card being there is correct — it just
should not be on top of the creature.

**Stale tooltip during animation.** The panel read `COURAGE 30/30` while the bar under it read
`24/30`, and `175/175` against `169/175`: it is built once on show and the fight moved on
underneath it. `ui/tooltip.js#refresh(el)` is the documented hook — it re-runs the descriptor for
one anchor and does nothing when that anchor is not the open one — and is now called from
`_syncActor` and from the `intent` event. Verified: damaging the Butler for 24 with the pointer
held still moved the panel `165 / 165 → 141 / 165`, matching the bar exactly.

**`INCOMING 12 → 12`.** With 0 Guard the panel printed an arrow, a second copy of the same number,
and no Guard term to explain what the arrow had done. The arrow and the result now appear exactly
when a Guard term does. The panel itself — the thing the reviewer called "more useful than
anything in StS" — is otherwise untouched.

**The enemy tooltip covered the boss it described.** `ui/tooltip.js` already places the panel fully
outside its *anchor*, but the anchor is the flex box and a 1.5-scale boss rig draws far outside it
(`overflow: visible` + `meet` fit). `data-tip-avoid = '.cb-enemy__stage, .cb-enemy__plate'` is the
documented hook: every side is scored by how much of the listed elements it would occlude.
Measured on The Butler: **overlap 0 px², 0.0 % of the creature** (`shots/cs4-butler-tip.png`). It
also stops covering the creature's neighbours on the way past.

**The literal string `undefined`.** `counter` events floated `` `${ev.delta} ${ev.name || ev.id}` ``
— which is not a guard when *both* sides can be missing. A change with no readable label is a
number the player cannot act on, so it gets no floating word at all now; the counter chip under
the creature still updates. Same class of bug fixed on `intent:queue`'s `ev.action.toUpperCase()`.

**No `aria-label` on the enemy container.** `.cb-enemy` is `role="button"`, focusable, and
everything readable inside it is either `aria-hidden` (the rig) or a bare numeral, so a screen
reader announced "button" and nothing else on the four most important objects on screen. It now
carries a live sentence: `"The Butler. Boss. 141 of 165 Courage. Next: Formal Welcome. 12 Guard."`

**Every enemy was the same blob.** Seven of the named creatures shipped as a rounded blob with two
white eyes, and the cause was mechanical, not artistic: **props in the `back` layer that do not
extend past the trunk outline are invisible**, because the trunk is drawn on top of them. The
Governess's bun (24 px), cape and collar (52 px) were all inside her own silhouette, in the layer
behind the very shape hiding them. A third layer (`props.over`, drawn above the face) was added so
a hat brim, a veil or a held prop can be in front of a creature's own eyes, and rewritten:

* **The Governess** — her flavour text was the brief and round 3 met none of it. Now a
  floor-length high-collared dress, a severe bun and fringe on a real head in *hair* colour, brass
  buttons, cream cuffs, **eight silver needle fingers**, and the **measuring tape** looping her
  throat and draping down one side like a snake, over the face layer. (`--e3` on her palette is
  cream, the same value as her face, which is why anything painted with it merged into her head.)
* **The Butler** — a tailcoat with two tails, hair parted and dark, wing collar, black tie,
  starched shirt front, and a **silver tray held out on a visible arm**.
* **The Unwelcome Guest** — a fedora over a void where the face is, an overcoat with lapels and
  buttons, gloved hands, and a shadow that falls the wrong way.
* **The House Bell** — a headstock beam with brackets, a rope, inscription bands, a flared lip, a
  clapper. Rebuilt symmetrically by construction; hand-paired `c` commands came out lopsided.
* **The Grand Coatcheck** — a rail, five hangers, and a mountain of overlapping coats with hanging
  sleeves and a ragged hem. Its vertical unit is now `max(b.h, b.w * 0.86)`: `sprawling` is 100×46
  and a mountain measured in units of 46 came out a pancake.
* **The Coatrack Crawler** — a turned post with knops, a four-hook bar, a hanging coat, and the
  umbrella it has never put down.
* **The Dust Bunny** — a genuinely ragged spiked outline, eleven tufts, two long trailing wisps,
  three stubby feet, shed motes.
* **The Calling Bell** — a hexagonal desk plate and two ringing arcs well clear of the dome.

`props.grad = 'dark'` was added because the EnemyDef palettes disagree about which slot is the
dark one: the trunk gradient runs `--e2 → --e1 → --e3` top to bottom and The Butler's `--e3` is
cream, so his tailcoat faded to white trousers at the hem. Garment silhouettes opt out.

**A real bug found on the way:** `PROPS['toy-chest']` drew the chest's lid with `class="rg-lid"`,
which is the **eyelid** class — `_eyes()` emits one per eye and `update()` scales every `.rg-lid`
it finds to blink them, so the Toy Chest's lid folded flat every time it blinked. Renamed
`rg-chestlid`.

---

## Protected, and verified still working

INCOMING (`12 −1 Guard → 11`, `LETHAL`, `Fully blocked`) · the death dissolve · the per-card
preview to the digit (`−6 / 1 through 5 Guard`) · per-enemy counters with counterplay tooltips ·
the flinch / panel shake / shard / GUARD BROKEN / HP-drain-lag receiving side · the boss entrance ·
the docked House Rules rail.

**Zero console errors** across 5 encounters × 6 turns of scripted play (`foyer-14`, `foyer-boss`,
`nursery-boss`, `foyer-scare-bell`, `sq-1`), plus every screenshot and every measurement run in
this round.

## Gates

| gate | result |
|---|---|
| `tests/combat/run.py` | 649 passed, 0 failed |
| `tests/combat-scene/seam.py` | **22** passed, 0 failed (was 14; 8 new, 1 rewritten) |
| `tests/seams/check.py` | 1608 call sites, **0 problems** |
| `tests/seams/proof.py` | 52 passed, 0 failed |
| `tests/scene-css/check.py` | 822 classes, **0 conflicts** |
| fps, 1920×1080 / 1600×900 / 1366×768 | 61 / 61 / 61 |

New CSS classes are all combat-only and verified unique across scene sheets: `.cb-hero*`, `.pr-*`,
`.cb-intent__extras`, and the new `.rg-*` materials.

## Notes for whoever is next

* **CONTRACTS trap 1 bit twice in this round.** A backtick inside an HTML comment inside a
  template literal — once in `combat.js` (`` `PlayerView` ``) and once in `enemy.js`
  (`` `pr-swing` ``). Both blanked the whole app with a parse error reported hundreds of lines
  away. Grep your diff for backticks in template literals before you debug anything else.
* Writing JS regexes through a Python heredoc turned `\\b` into a literal **backspace character**,
  which the terminal renders by deleting the preceding character — so the file *looked* right in
  `sed` output and `/\bup to\b/` had silently become `/<BS>up to<BS>/` and matched nothing. Worth a
  `grep -P '[\x00-\x08\x0b\x0c]'` over any file edited by script.
* A per-frame sampler that calls `getComputedStyle` drops the page to ~26–39 fps and stretches
  every timing you are trying to measure. For a single-frame question, hook the function that
  fires on that frame (here `fx.number`) instead of sampling.
* Screen shake translates the whole `.cb` element, so it contaminates any absolute rect
  measurement of an attacker. Difference the creature's box against its own plate: the plate
  carries the inverse pose, so the difference is the pose and nothing else.
