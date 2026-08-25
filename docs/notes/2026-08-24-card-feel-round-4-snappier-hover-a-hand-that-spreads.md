# Card feel, round 4 — a snappier hover, a hand that spreads, a card that stays held

Owner: card-feel. Files touched: `game/src/ui/card.js`, `card.css`, `hand.js`, `hand.css`,
`cardart.js`, `tests/cards-feel/run.py`.

Round 4 was the first round card feel **lost** to Slay the Spire 2. Three findings, all of
them measurable, all of them measured here before and after. Nothing on the protect list
moved: 0 seam-hover flips, 0 offscreen pixels, 61 fps idle and under motion, rotations at
n ≥ 5 byte-identical, the arrow / reticle / damage chip untouched, the four motion
signatures untouched, the keyboard path untouched.

---

## 1 — Hover: 168 ms → 33 ms event-to-settled, 116 px → 45 px, 1.108× → 1.18×

### Where the time actually went

The reviewer measured **mousemove → settled 168 ms**, of which **67 ms passed before the
first pixel moved**. Round 3's own figure (97 ms) was event-to-settled and hid exactly that
gap. Instrumenting the real combat scene — a capture-phase `pointermove` listener for the
event time, a rAF sampler on the card's box — split it:

| | round 3 (measured here) | round 4 |
|---|---|---|
| pointermove handler cost | 1.3 – 4.1 ms | unchanged |
| event → first pixel | 3.5 – 6.8 ms | **0.2 – 0.6 ms** |
| event → settled | 84 – 88 ms | **32 – 42 ms** |
| worst frame during the hover | 33.4 ms | 17.8 – 18.8 ms |

Three changes, each attacking a different part of the pipeline:

**a. The first frame of the lift now happens inside the event handler.** `_tick` was split
into `_tick` and `_stepSlots(dt)`, and `_setHover` calls `_stepSlots(TUNE.kick)` — one
1/60 s step — synchronously after committing the layout. easeOutCubic puts ~22 % of the
travel on screen in the same task as the pointer event, so there is no "wait for the next
animation frame" at all. It is called once per hover *change*, never per pointermove, so it
cannot make in-flight animations run fast.

**b. `card:hover` is emitted after the motion is committed, not before.** The old order was
state → bus → layout, so every subscriber in the game (tooltip, damage preview, keyword
panel) ran between the pointer moving and the card being told where to go. Now the layout
and its first frame are done before anyone else hears about it.

**c. The hover no longer repaints a 60 px-blur shadow.** `.is-hover` swapped `box-shadow`
on `.mm-card__frame` — a `26u/54u` blur across the whole card, repainted in the frame the
pointer moved, inside the one interaction with a 120 ms budget. The extra shadow moved to a
new always-present `.mm-card__lift` layer inside the frame, and only its **opacity**
changes, which the compositor does without a repaint. (Outer box-shadows are clipped to
outside the border box, so an empty layer at `inset:0` adds nothing to the card face;
`border-radius: inherit` picks up the per-type frame radius for free.) Worst frame during a
hover fell from 33.4 ms to 17.8 ms. The rendered shadow is the same stack of shadows.

`hoverIn` 105 ms → **78 ms**, `hoverOut` 90 ms → 70 ms. With (a) landing a frame of it
immediately, settled lands at 32–42 ms, which leaves ~70 ms of headroom for input and
present latency before StS2's 120 ms bar.

### Why "46 px of lift" measured as 116 px

`hoverLift` was 46 and the card really did rise 46 px — but the card is anchored at its
**bottom centre**, so scaling it 1.19× about that anchor pushes the **top edge** up by the
whole `0.19 × height` as well. 46 + 0.19·312 = 105 px at 1920, plus the arc dip on a
non-central card ≈ the 116 the reviewer read off the screen. The reviewer was measuring the
right thing; the geometry was wrong.

The hover growth is now centred on the card (`F.grow`, applied in `_layout`), so the
measured rise is `hoverLift + height·(scale−1)/2`. With `hoverLift: 26` and
`hoverScale: 1.18`:

| viewport | rise of the top edge | rise of the centre | drop of the bottom | scale |
|---|---|---|---|---|
| 1920×1080, n=5 | 54.1 px | 26.0 px | 2.1 px | 1.180× |
| 1600×900, n=7 | 46.5 px | 22.8 px | 0.9 px | 1.180× |
| 1500×860, n=12 | 37.3 px | 20.1 px | — | 1.180× |

All inside StS2's 40–60 px / 1.15–1.25×. Nothing is clipped: `maxBottom` is still
`h − bottomPad` at every hand size, because the 2 px the bottom edge gives back is inside
the reserve `_fan` already keeps.

**Note on the reviewer's 67 ms.** Instrumented in-page it is now 0.2–0.6 ms — the lift
starts in the same task as the event. Whatever remains in an end-to-end measurement is
Chrome's input dispatch plus one present, and (c) is the only lever this module has on it;
it is pulled.

---

## 2 — The hand spreads, and stops eating its own rules text

Round 3 spaced every hand at a flat `stepRatio` of 0.82 card widths whatever the hand size,
so five cards on a 1920 screen overlapped 44 px, clipped a slice of every neighbour's rules
text, and left 1136 px of empty table. STS2-REFERENCE §1: *"With few cards the arc
flattens; with many, cards overlap and the arc tightens."*

### The step is now derived from the card, not guessed

The clearance step falls straight out of the anatomy already documented at the top of
`card.css`: the rules box spans **12u..212u** of the 224u grid and sits **15u..126u** above
the card's bottom edge, and a card rotates about that bottom edge. So a tilt of θ slides the
far corner of the text box sideways `111u·sinθ` further than it slides the neighbour's edge:

```
clearStep(θ) = cw · (214/224 · cos θ  +  111/224 · |sin θ|)
```

`_fan` takes `clearStep + spreadAir` as its **target** for hands of six or fewer, keeps the
safe-band cap as the hard limit, and — if the target does not fit at the intended bend but
would fit flatter — solves by bisection for the largest angle that does. In practice the
solver never fires at n ≤ 6 on any viewport this game supports; it is the net for a larger
`--card-w` or a narrower window.

**`spreadMax` is 6, not 7, and the reason is the frame after.** At seven cards with the
largest card width the band cannot hold both the clearance and the bend, so the solver would
flatten the fan to ±0.5° — and then an eighth card, which cannot be cleared at any angle,
would snap it straight back to ±10.9°. A fan that collapses when you draw and springs open
when you draw again is worse than either state. At six, the fan half-angle is monotone in
the hand size at every viewport, and that is asserted.

### Measured — `tests/cards-feel/run.py spread`

Rules-text occlusion is computed on the **true rotated quads** (separating-axis), not on
bounding boxes, because a rotated card's bbox is much wider than the card.

**1600 × 900** (showcase card width 189 px)

| n | step | body overlap | hand span | empty | text occlusions | worst |
|---|---|---|---|---|---|---|
| 3 | 201.7 | **−12.9 (a gap)** | 606 | 994 | **0** | 0.0 |
| 5 | 208.2 | **−19.5 (a gap)** | 1078 | 522 | **0** | 0.0 |
| 6 | 204.4 | −15.6 | 1280 | 320 | **0** | 0.0 |
| 7 | 168.1 | 20.6 | 1280 | 320 | 6 | 9.7 |
| 12 | 91.5 | 70.2 | 1276 | 325 | 11 | 61.0 |

**1920 × 1080** (showcase card width 224 px)

| n | step | body overlap | hand span | empty | text occlusions | worst |
|---|---|---|---|---|---|---|
| 3 | 239.6 | **−15.3** | 720 | 1200 | **0** | 0.0 |
| 5 | 247.4 | **−23.2** | 1280 | 640 | **0** | 0.0 |
| 6 | 245.9 | −21.6 | 1536 | 384 | **0** | 0.0 |
| 7 | 202.3 | 22.0 | 1536 | 384 | 6 | 9.0 |
| 12 | 109.5 | 86.7 | 1530 | 390 | 11 | 75.5 |

Large Text produces **identical geometry** — the rules box is the same box at any font size,
so clearing the box clears the text. `p5-102`'s complaint is gone by construction.

**In the real combat scene** (`--card-w` is `clamp(140px, 10.5vw, 174px)` there, so the
cards are smaller and there is more room):

| | before (reviewer) | after |
|---|---|---|
| 1920, 5 cards | 44 px overlap, span 784, empty 1136 | **+18 px gap**, span 994.5, empty 925.5, **0 occlusions** |
| 1600, 5 cards | — | **+17.3 px gap**, span 958.3, empty 641.7, **0 occlusions** |

### The arc flattens

`_flat(n) = min(1, (n−1)/4)` scales both the per-card rotation and the arc dip for very
small hands, reaching full strength at n = 5 — so every rotation the critic has measured at
n ≥ 5 is unchanged, and a hand of three is genuinely flat rather than a tight clump.

Fan half-angle by hand size, identical at 1600 and 1920, normal and Large Text:

```
n:      1     2     3     4     5     6     7     8    12
deg: 0.00  0.39  1.55  3.49  6.20  7.75  9.30 10.85 15.00
```

Monotone, and `spread` fails the build if adding a card ever flattens the fan.
n ≥ 8 is byte-identical to round 3 (`arc_8` and `arc_12` in `shots/cf/metrics.json`
unchanged, `handSpan` 1529.9, `offscreen_bottom_px` 0).

---

## 3 — The card you are aiming stays held

`shots/p5-21-drag-c.png` and `p5-30-kbd-target.png`: the instant the cursor entered the
enemy, the held card sat back down between two of its neighbours at 42 % opacity. Three
separate causes, all fixed:

1. **`_layout` had no idea the aim existed.** It skipped `this.drag.slot`, which covers a
   mouse drag — but the keyboard path has no drag, so *every* relayout during an aim (a
   target cycle, a playability refresh, a settings change, a resize) re-fanned the held card
   into its slot at `z = 20 + i`, behind two neighbours, in the middle of the decision.
   `_layout` now hands `this.aim.slot` to `_reparkAim()` instead.
2. **It was parked inside the fan.** `parkY` put its top edge level with its neighbours'.
   It now floats `aimLift` (0.55) fan-card-heights above the fan's base line — measured
   **101 px clear of the top of the fan** — and `aimZ` is 700, against a maximum fan z of 26.
3. **It was faded even when it was nowhere near the target.** The 42 % fade round 3 added is
   right when the card would cover the enemy you are previewing (STS2 §2), and wrong the
   rest of the time — that is what read as "dropped". `_aimPark` now reports whether the
   dodge actually cleared the target's box, and only then does `.is-over-target` fade it.
   `.is-aiming` on its own gets a **deeper** drop shadow instead, so it reads as held.

Measured in the real combat scene and in the showcase, mouse and keyboard:

| | z | max fan z | fan cards drawn over it | opacity | rotation | lift above fan top |
|---|---|---|---|---|---|---|
| mouse, on enemy | 700 | 26 | **0** | 1.00 | 0.00° | 101.4 px |
| keyboard, Enter | 700 | 26 | **0** | 1.00 | 0.00° | 101.4 px |
| keyboard, after Tab + a forced relayout | 700 | 26 | **0** | 1.00 | 0.00° | 101.4 px |

Shots: `shots/r4-aim-mouse.png`, `shots/r4-aim-kbd.png`, `shots/cf-aim-mouse.png`,
`shots/cf-aim-kbd.png`, `shots/cf-aim-kbd-relayout.png`. The drag lag and tilt before the
snap are untouched.

One robustness fix fell out: `_takeOff` now clears a stale aim pointing at the card that is
leaving the fan, because `_layout` re-parks `this.aim.slot` on every pass and a played card
must not be re-parked on its way to the discard pile.

---

## 4 — `aria-disabled` says what the card looks like

`CardView._applyClasses` wrote `aria-disabled` from `state.disabled`, a flag the Hand never
sets — it tracks `playable`. So a card carrying `is-unaffordable is-unplayable`,
desaturated, dropped 24 px and shaking when you try to play it, announced
`aria-disabled="false"`. It now reads `!playable || disabled`.

`tests/cards-feel/run.py aria` sets energy to 0 and asserts every card: 7/7 `is-unplayable`,
7/7 `aria-disabled="true"`, and every label ending "cannot be played right now". At energy 3
it asserts the converse, so the attribute cannot get stuck on either.

---

## 5 — Silhouettes: the fallback pool was carrying two thirds of the roster

Round 3 fixed the slug-prefix bug and flagged the remainder honestly: `TYPE_POOL.skill` had
four shapes. It was worse than that. Matching the shipped card names against
`SUBJECT_RULES` shows **286 of the 429 companion cards fell straight through to the type
pool** — so 40-odd skills per companion really were sharing `ward / curl / swirl / paw`, and
a reward triple sharing a paw was likely, not unlucky.

Both halves are widened.

**The rules table** went from 24 entries to 74, covering the actual printed vocabulary of the
five companions — dog gear (collar, leash, heel, sit, stay), cat zoomies (zoomie, dash,
frenzy, hide, perch, phase), frog hops (hop, boing, croak, belly, plump, harvest, puddle),
blob squish (chew, stretch, split, sticky, melt, wrapper) and spider probability (blink,
corner, lattice, odds, future, deadline). Every new rule is appended **below** the existing
24, so no subject that already resolved changed; they can only claim cards that used to be a
coin toss. Unmatched companion cards: **286 → 0**.

A concentration that only shows up in a real hand: dog obedience is a big slice of the Bones
vocabulary, and the first pass piled 13 cards onto `collar`, so a five-card hand at seed 7
drew "Sit Pretty" and "Go Get It!" as the same picture. It is split three ways — "play
dead / flop over / roll over" → `curl`, "good boy / good dog / best dog" → `paw`, "go get /
throw / fetch / chase" → `ball`, leaving the actual gear on `collar` (13 → 8). Same hand
now: collar, collar (the two copies of one card), fang, ball, coil — `shots/r4-final.png`.

**The pools** went from four shapes each to nine (attack), fifteen (skill) and nine (power),
using only silhouettes that read for *any* companion. The family-specific shapes (`cat`,
`pumpkin`, `candy`, `drip`) stay out of the fallbacks, so a Bones card can never be a random
pumpkin — those are reachable by name only.

**Eight new silhouettes** in `drawMotif`, chosen because the vocabulary above wants them and
because they are companion-neutral: `ball`, `collar`, `key`, `coil` (a spring), `blob`,
`crack` (an impact starburst), `hourglass`, `dice`. Vocabulary 28 → 36 shapes.

**Per-card variation of the silhouette itself.** Even with the widened table, two cards in
one hand can legitimately land on the same subject (a Bones deck really is mostly bones), so
`drawMotif` now mirrors and tilts the shape by a few degrees off the card's own seed. Same
subject, different outline.

### Worst-case closest pair *within a single companion's pool*

30 cards sampled per pool, mean absolute difference on a 16×16 downscale of the real
bitmaps (0 = identical). The right-hand column is the figure the review asked for — the
closest pair that also **shares a silhouette**, which is the only way two cards can look
like the same picture.

| pool | n | distinct subjects (r3 → r4) | closest pair r3 | closest pair r4 | closest **same-silhouette** pair |
|---|---|---|---|---|---|
| bones | 86 | 12 → **20** | 6.08 | **5.49** | 5.49 (`bury-it` / `dig-like-crazy`, both `bone`) |
| marmalade | 83 | 12 → **17** | 6.96 | **7.52** | 7.52 (`hide-and-seek` / `disappearing-act`, both `swirl`) |
| pipkin | 86 | 16 → **19** | 8.08 | **8.52** | 8.52 (`puddle-jumper` / `elastic-legs`, both `coil`) |
| taffy | 84 | 13 → **18** | 6.63 | **7.61** | 7.61 (`big-chew` / `blob-insurance`, both `blob`) |
| wink | 85 | 13 → **16** | 8.51 | **8.19** | 8.19 (`set-the-table` / `eight-cornered-view`, both `key`) |

(bones and wink move slightly the other way because the sample grew from 20 cards to 30 —
more pairs, so a closer one is found. Both are far above the 3.0 "perceptually identical"
floor the `art` scene enforces.)

The two pairs the review named by name:

| pair | round 3 | round 4 | distance |
|---|---|---|---|
| Reassemble / Emergency Reassembly | both `ward` — the identical shield | `stitch` / `crack` | **15.70** |
| Sit Pretty / Shake, Boy! | both `swirl` | `collar` / `coil` | **18.06** |

The reward triple at seed 42 (`shots/r4-reward.png`) is now a bone, a pouncing dog and a paw
— three subjects, closest pair **12.25**. The critic's own 12-card showcase figure
(`tests/critic-cardfeel/art.py`) improved from 14.66 to **15.60**.

---

## Handover closed

`BAND_CSS` / `ensureBandCss()` — round 2 injected the commit-band styling from `hand.js` as
a `<style>` tag because `hand.css` belonged to another agent. It does not any more, so the
rules are authored in `hand.css` verbatim, after the plain `.mm-hand__threshold` rules they
override, and the injector is gone. The band's appearance and the drag feel are unchanged
(`tests/cards-feel/run.py threshold`).

## A test that was asserting the wrong thing

`scene_figures` asserted "turning `lining-nums` off changes the pixels". That proved the
declaration was load-bearing when round 3 wrote it, and it now **fails while the game is
right**: the vendored Grenze subset defaults to lining figures, so the declaration is a
correct belt-and-braces no-op. The assertion is now on the outcome — the ink height of `0`
and `1` measured off a real DOM raster against the cap height of `H` — which holds whatever
face the token names next. Measured at 64 px: `0` = 38 px, `1` = 37 px, `H` = 39 px,
`x` = 30 px, `o` = 31 px. Both figures are at cap height; neither is an old-style `o`.

(A canvas probe was tried first and is *not* usable here: `ctx.font` with the same family
renders a different set of default figures than the DOM does — it reported `0` at x-height
while the DOM drew it at figure height, i.e. it would have failed a face that is fine.)

## Checks run

- `tests/cards-feel/run.py` — **all 21 scenes, 0 errors.** New this round: `spread`,
  `hoverfeel`, `aim`, `aria`.
- `tests/critic-cardfeel/run.py` — 0 errors. `seam_hover_flips: 0`, `offscreen_bottom_px: 0`,
  `fps_idle: 61`, `arc_8` / `arc_12` rotations unchanged, hover 0.625 → 0.7375 scale (1.18×)
  and 46.5 px of rise.
- `tests/critic-cardfeel/pass2.py`, `pass3.py`, `pass4.py` — 0 errors.
- `tests/critic-cardfeel/fps.py` — idle 7: 61, idle 12: 61, draw 5 into 12: 61, discard 12:
  61, exhaust 12: 60, hover sweep: 91 frames / 1.5 s.
- `tests/critic-cardfeel/art.py` — closest showcase pair 15.60 (was 14.66).
- `tests/seams/check.py` — **1608 call sites checked, 0 problems.**
- `tests/scene-css/check.py` — **10 scene sheets, 822 classes, 0 conflicts.** (It briefly
  reported 1 mid-round — `.petpic` with a different `height` in `scenes/clubhouse.css`,
  `gameover.css` and `select.css`, all frontend's files and all dirty in the tree at the
  time. It cleared before this round finished. The checker only scans `game/src/scenes/`;
  nothing card-feel owns is in its scope either way.)

## Not mine — please route

- Still open from round 3: `data/enemies/_lib.js:234,242` should write `[Vanish]`, not
  `[Exhaust]`, and both strings are missing their final full stop. `card.js` still carries
  `KEYWORD_ALIAS = { exhaust: 'vanish' }` as the stopgap.
- Still open from round 3: `tokens.css` `--font-num` is a duplicate of `--font-body` now, so
  the local override in `card.css` is doing nothing harmful — but the token is misleading and
  every other numeric readout in the game reads it.
