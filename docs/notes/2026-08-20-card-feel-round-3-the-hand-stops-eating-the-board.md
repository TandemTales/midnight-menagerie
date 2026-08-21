# Card feel, round 3 — the hand stops eating the board

Owner: card-feel. Files touched: `game/src/ui/card.js`, `card.css`, `hand.js`, `hand.css`,
`cardart.js`, `tests/cards-feel/**`.

Round 2's hand scored level with Slay the Spire 2 and the instruction was not to touch it.
Nothing in the protected list moved: rotations are still −6.2 / −3.1 / 0 / +3.1 / +6.2°, the
arc dip and the outer-cards-lower ordering are byte-identical in `shots/cf/metrics.json`,
hover is 82 ms start-to-settle at 1.19×, the gold arrow, reticle, damage chip and keyboard
target cycling are untouched, and the play-hold-discard arc is unchanged. What changed is
everything the hand was doing to the *rest* of the screen.

---

## B5 — a full-screen layer over the whole board

`.cb-handhost` is `position:absolute; inset:0; z-index:200`, and it declared no
`pointer-events`, so it defaulted to `auto`. An empty div with nothing drawn in it was the
hit target over all 1600×900. The enemy field is z-index 20. **No intent, enemy, or
enemy-status tooltip was reachable by the mouse at all** — STS2-REFERENCE §1 calls intents
"the single most important UI element in the game".

`.mm-hand` being `pointer-events:none` had never helped, because the parent was the hit
target, not the hand. And `.mm-hand__hit` — the hand's own surface — was a second copy of
the same mistake at a smaller scale: `left:0; right:0; bottom:0; top:55%`, `z-index:700`,
a full-width sheet over the bottom 45% of the viewport, on top of the cards *and* the
bottom ~90px of the enemy field.

### The approach

Two jobs had been conflated, and separating them is the whole fix.

1. **Which card is under the cursor** stays exactly where it was: in JS, in `Hand#_hitTest`,
   against the **base** (unlifted) fan geometry. That is the anti-oscillation mechanism —
   a card that lifts under the cursor cannot move itself out from under it — and it is
   untouched. Measured: **0 seam-hover flips** over 900 ms with the pointer parked on the
   seam between cards 3 and 4, same as round 2.
2. **Whether the hand gets the event at all** is now the DOM's job, done honestly:
   - `Hand#mount` stamps `.mm-hand-host` on whatever it is mounted into and
     `hand.css` makes that class `pointer-events:none`. `destroy()` removes it. Zero
     specificity (`:where`) so a scene can override it with any rule at all.
   - **Cards are ordinary hit targets again** (`.mm-hand .mm-card { pointer-events:auto }`).
     `.mm-card * { pointer-events:none }` was already there, so the target is always the
     card root, never a child.
   - `.mm-hand__hit` became a **backstop behind the cards** (z-index 1 against their
     20–900), sized by `Hand#_syncHitBox` to the fan's own bounding box. It catches the
     gaps between rotated cards, the strip below them, and — the case that matters — the
     hole a hovered card leaves behind when it lifts, which is inside the base-fan box by
     construction. At 1600×900 with 7 cards the box is 1244×359 at y 541, against a
     viewport of 1600×900. Nothing the hand owns covers a pixel the fan does not occupy.
   - Cards in transit are taken out of hit testing (`is-flying`): the play arc, the discard
     tumble, the exhaust rise and an arriving `add()` all cross the enemy row at z 600–900
     and must not steal a tooltip on the way past. `_tick` clears the class the frame a
     card lands. A dragged card is inert too — the drag reaches the hand through pointer
     capture, not hit testing.
   - Listeners moved from `.mm-hand__hit` to `.mm-hand`, the common ancestor of the cards
     and the backstop. `pointer-events:none` stops an element being a hit target; it does
     not stop descendants' events bubbling through it. `pointerleave` on `.mm-hand` is
     chain-based rather than geometric, so it fires exactly when the pointer stops being
     inside the hand — which is the only moment hover should clear.

### Proof

- Raw `mouse.move` onto an intent (the reviewer's exact test, `shots/p3-15-hover-intent-real.png`):
  `.mm-tip` is now `display:block`, `opacity:1`, text
  *"Pack Wrong / Scheme / Gains 5 Guard. Puts Clutter into your discard pile…"*.
  New shot: `shots/p4-hover-intent-real.png`. Element chain under the intent is
  `path.cb-intent__gp < g < svg < DIV.cb-intent < DIV.cb-enemy__intent` — no hand in it.
- Playwright's **ordinary** actionability now passes on `.mm-card`, `.cb-enemy` and
  `#end-turn`. `shots/p4-smoke.png` was driven entirely by `page.hover` / `page.click`,
  including tap-to-play and End Turn. No raw `mouse.move/down/up` anywhere.
- New regression scene `tests/cards-feel/run.py pointer` asserts all of it plus the zero
  flips, so this cannot come back quietly.

The showcase harness had **the same bug**: `#stage` is also a full-bleed host, so the foes
in `tests/cards-feel` were unreachable too and nobody had noticed. Fixing it in `mount()`
rather than in `combat.css` fixed both, which is the point.

---

## B7 — one picture for a whole companion

`subjectFor` matched `SUBJECT_RULES` against `(def.id + ' ' + def.name)`, and ids are
`<companion-slug>/<card-slug>`. So the *slug* decided the picture: `bones/*` hit `/bone/`,
`taffy/*` hit `/taffy/`, and the first rule that matched won before the card's own name was
ever consulted. All 86 Bones cards drew one bone; all 84 Taffy cards drew one sweet.
Marmalade, Pipkin and Wink looked fine only because their slugs happen not to match a rule.

Fix is the one line the review asked for — strip the slug before matching (`cardStem`) —
with the reasoning written next to it: the slug is a *family* label, it already picks the
palette in `fam()`, and it must never pick the subject.

Verified across every companion in the registry, not just Bones
(`tests/cards-feel/run.py art`, new):

| pool | n | distinct subjects | share still on the slug subject | closest art pair (16×16 mean abs, 0 = identical) |
|---|---|---|---|---|
| bones | 86 | 12 | 28 % (`bone` — Bone Toss, Fetch!, Dig Here, Rib Rattle… legitimately) | 6.08 |
| taffy | 84 | 13 | 16 % (`candy`) | 6.63 |
| marmalade | 83 | 12 | — | 6.96 |
| pipkin | 86 | 16 | — | 8.08 |
| wink | 85 | 13 | — | 8.51 |
| neutral | 8 | 6 | — | 5.51 |
| status / curse | 6 / 7 | 3 / 2 | — | 4.51 / 8.80 |

The reviewer also named `hush/`, `drizzle/` and `brambleboo/`. Those three are palette
families in `cardart.js` for companions that have **no card files yet** — the shipped
roster is bones / marmalade / pipkin / taffy / wink. The rule change covers them the day
their cards land: `hush/` would have hit `/hush/`, `drizzle/` `/drizzle/`, and
`brambleboo/` would in fact have hit `/boo/` → ghost, not sprig, because the ghost rule
comes first. All three now resolve from the card name.

The `art` scene asserts three things per pool: no pool dominated by the slug subject
(> 45 %), at least 6 distinct subjects for a pool of 20+, and no perceptually identical
pair (closest > 3.0). The critic's own `tests/critic-cardfeel/art.py` still reports 14.66
as its closest pair on the 12-card showcase.

**Known remainder, not a regression:** `TYPE_POOL.skill` has only four fallback shapes for
~40 unmatched skills per companion, so two adjacent skills can land on the same silhouette
with different seeds (Sit Pretty and Shake, Boy! both draw a swirl in `shots/p4-smoke.png`).
Widening the fallback pools is a content job, not a bug fix, and is left for a later round.

---

## B12 — Vanish vs Exhaust on one card face

The badge said EXHAUST; `data/companions/keywords.js:66` defines the word as **Vanish**;
"Good Boy!" read "… Gain 1 Nerve. **Vanish**." directly above a chip reading **EXHAUST**.
Badge and aria label now say Vanish. The CSS modifier stays `--exhaust` — it names the card
*flag*, not the word.

The enemy status Tricks author `[Exhaust]` into their rules text
(`game/src/data/enemies/_lib.js:234,242`), which is not my file, so `card.js` carries a
small `KEYWORD_ALIAS = { exhaust: 'vanish' }` for text placeholders, documented as a
stopgap. Verified across every `exhaust:true` card plus both status Tricks: badge, rules
text and aria label all read Vanish, one word, one meaning.

**REPORTED, needs the enemies owner:** `data/enemies/_lib.js:234,242` should write
`[Vanish]`. While they are there, `'Does nothing. [Exhaust]'` and `'Gain {b} Guard.
[Exhaust]'` are missing the sentence-ending full stop that every companion card has.

---

## Old-style figures

Two separate faults, and the first fix only solved one of them.

**Rules text** uses `--font-body` (Grenze), whose figures are genuinely old-style: `0`
draws as a lowercase **o**, `1` as a short stem. `[Whole] still requires exactly 0.`
printed *"exactly o"*. `font-variant-numeric: lining-nums` on `.mm-card` fixes it, and the
face really does carry the feature — proven by rasterising the same string with the feature
on and off and comparing pixels (`shots/cf-figures-body-lining.png` vs `-oldstyle.png`).

**Numbers and the cost gem** use `--font-num`, which resolves to **Cinzel**. Cinzel's
figures are *already* lining, so `lining-nums` changed nothing there — its **1 is simply
drawn as a Roman I**, a bare stem with slab serifs top and bottom. At hand scale
"Deal 13 damage" printed "Deal I3 damage", "Zoomies 1:" printed "Zoomies I:", and a 1-cost
gem printed a gem reading I. This is exactly why the review said *"or a different face"*.
`.mm-card__num` and `.mm-card__cost` now use `var(--font-body)` at weight 600 (the real
Grenze semibold; 700 would synthesise) with `lining-nums tabular-nums` — tabular so a live
preview swapping 9 → 12 cannot re-flow the line. Numbers in the same face as the sentence
around them is what StS does anyway. Gem size went 23u → 25u to hold the same optical
weight in the lighter face.

Verified **at actual hand scale, not zoomed**: `shots/cf-gallery-numcrop.png` is a 12-card
hand at 1500×860 (the smallest cards the fan ever produces) and every gem and every inline
number is unambiguous. `shots/p4-smoke.png` shows the reviewer's own example, "Shed 1 Bone.
Draw 1 Trick.", reading correctly.

**REPORTED, needs ui-chrome:** `--font-num` has this problem everywhere it is used — the
Nerve orb, Courage counters, intent damage chips, pile counts. Either the token should name
a face whose `1` is unambiguous, or every numeric readout in the game needs the same local
override that `card.css` now carries.

While chasing this I found the showcase harness was loading Cinzel and Grenze from the
**Google Fonts CDN** while the game loads them from `game/assets/fonts` — a CONTRACTS §1
violation, and worse, it meant a typography check in the harness proved nothing about the
game (Cinzel was silently falling back to a system serif). `tests/cards-feel/index.html`
now links `/game/src/ui/fonts.css`, the same faces the game uses.

---

## The dragged card no longer hides what you are aiming at

`shots/p3-34-aim-guarded.png`: the held card sat full-size and fully opaque on top of the
enemy, hiding its sprite, HP bar, Guard badge and damage preview.

The root cause was not the park position, it was **when aim mode starts**. Targets were only
read once the cursor crossed the commit line, so dragging a targeted card *straight at* an
enemy — the obvious gesture — stayed in follow-the-cursor mode all the way onto the sprite.
Snapping onto a target now enters aim mode at any height. Once a target is locked the card:

- shrinks (`parkScaleAimed` 0.86 against the 1.06 idle park),
- fades to 42 % (`.mm-card.is-aiming`),
- and **slides clear of the target's box** if it would still overlap it, picking whichever
  side has room (`Hand#_aimPark`).

The keyboard path gets the same treatment via `_reparkAim`, including on Tab/arrow target
cycling. Measured in the real combat scene: the dragged card's overlap with the aimed
enemy's box is **0 %** of the enemy (`shots/p4-aim-guarded.png`), against a card that
covered it entirely before.

One real bug fell out of this: `CardView#materialize` ended by setting inline
`opacity: 1`, which outranks every stylesheet rule, so the aiming fade silently did nothing
on any card that had arrived by a draw. It now clears the inline value instead of pinning
it — a finished fade-in must leave no override behind.

---

## Roving focus after a play

`document.activeElement` became `DIV.mm-hand`, the hand *container*. That is not a roving
focus model, it is a dead end. Focus now lands on a real card — the one that slides into the
gap the played card left — so Enter → Enter → Enter plays along the hand exactly as it
reads. Only when the keyboard was already in the hand: a mouse drag must not silently lift
a neighbour under the cursor. `_confirm` no longer blanket-clears the selection after
committing; `_animatePlay` owns where the selection goes, which also fixes the case where
`onPlay` refuses the card and the selection used to vanish anyway.

Measured in the real game: after Tab → 1 → Enter → Enter, `activeElement` is `DIV.mm-card`
at every step and stays there once the play resolves.

---

## `Hand.add()` — for the `card:move` wiring

```js
/**
 * @param {object|object[]} cards  { uid?, def, upgraded?, cost? }, a bare CardDef,
 *                                 or an array of either. `uid` is generated if
 *                                 omitted — pass the engine's uid if you want
 *                                 discard()/exhaust()/playCard() to find it.
 * @param {object} [o]
 * @param {'discard'|'draw'} [o.from='discard']
 * @returns {Promise<Hand>}  resolves when the arrival has settled into the fan
 */
async add(cards, o = {})
```

`{ uid, def, upgraded, cost }` is exactly what `combat.js#_handCard(snap)` already returns,
so the call site is `await this.hand.add(this._handCard(ev.card))`.

The arriving card is a real slot from the first frame — `count`, `cards()`, `viewOf()` and
playability are all correct before the animation finishes, and the rest of the fan opens its
gap immediately.

**Motion signature, deliberately not a draw** (STS2-REFERENCE §1: "Draw/discard/exhaust each
have a *different* motion signature"). A draw riffles straight up out of the deck in the
bottom-**left** corner, spinning anticlockwise, 340 ms, easeOutBack snap, ±18° flick. An add
is **lobbed** back over the table from the discard pile in the bottom-**right**: clockwise
spin, 460 ms, a 150 px arc so the path rises above the fan and drops into the gap, no
overshoot, and a cold spectral ring pulse on arrival instead of the draw's warm swell.
Measured (`tests/cards-feel/run.py add`), and asserted:

| | origin x | path rise above its own endpoint |
|---|---|---|
| `draw` | 292 | 0.6 px |
| `add` | 1400 | 149.2 px |

The arc is a new `slot.arc` term in the shared tween, so it stays retargetable — an add
landing while the fan is re-laying out still ends in the right place.

---

## Not mine — please route

- **LETHAL overflows its chip** (`shots/p3-41`). That chip is `.cb-prev__lethal`, written by
  `game/src/ui/enemy.js:782` and styled at `game/src/scenes/combat.css:403` — combat-scene's
  files. The same word is also emitted into the incoming panel
  (`combat.js:1106`, `.cb-inc__lethal`, `combat.css:707`).
- `game/src/data/enemies/_lib.js:234,242` — `[Exhaust]` should be `[Vanish]`, and both
  strings are missing their final full stop.
- `tokens.css` — `--font-num` (Cinzel) draws `1` as a Roman I at UI sizes. See above.

## Handover still open from round 2

`BAND_CSS` / `ensureBandCss()` in `hand.js` is still injecting the commit-band styling that
belongs in `hand.css`. `hand.css` is now this agent's file, so this should be lifted in
verbatim and `ensureBandCss()` deleted — it was left alone this round only because the band
is part of the protected, measured drag feel and this round had no reason to touch it.

## Checks run

- `tests/cards-feel/run.py` — all 18 scenes, 0 errors. New: `pointer`, `art`, `add`,
  `figures`.
- `tests/critic-cardfeel/run.py` — 0 errors, `seam_hover_flips: 0`, rotations and arc
  unchanged, `offscreen_bottom_px: 0`, 61 fps idle and after motion.
- `tests/critic-cardfeel/pass2.py`, `pass3.py`, `pass4.py`, `fps.py`, `art.py` — 0 errors.
  fps: draw-5-into-12 61, discard-12 61, exhaust-12 60.
- `tests/seams/check.py` — **1598 call sites checked, 0 problems.**
