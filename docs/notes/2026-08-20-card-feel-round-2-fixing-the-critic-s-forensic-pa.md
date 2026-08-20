## 2026-08-20 — card-feel, round 2 (fixing the critic's forensic pass)

Owner: card-feel. Files touched: `src/ui/card.js`, `card.css`, `hand.js`, `hand.css`,
`cardart.js`, `tests/cards-feel/index.html`. Nothing else.

### The big one: the hand now fits, at every size and resolution

The card was a fixed 224x312 box. It is now responsive **and** the hand drives a per-hand
scale on top of that.

* `card.css` declares `--mm-card-w: min(var(--card-w, 224px), max(150px, min(13.5vw, 27vh)))`
  on `.mm-hand, .mm-card`. It never exceeds the shared `--card-w`, so `combat.css`'s
  `clamp(140px, 10.5vw, 174px)` still wins inside combat.
* **REQUESTED TOKEN CHANGE (ui-chrome):** make it the token itself —
  `--card-w: clamp(150px, min(13.5vw, 27vh), 224px);`. The local clamp becomes a no-op the
  day that lands. I did not touch `tokens.css`.
* `Hand#_fit(n)` returns a scale bounded by two rules: a card is never taller than 30% of the
  viewport, and the fan at its widest allowed overlap still fits inside the viewport minus a
  gutter each side (`max(150px, 10% of width)`) so the energy orb and both piles are never
  covered. `Hand#_measure()` reads the real CSS card size from a hidden `.mm-hand__probe`
  rather than assuming 224; the existing ResizeObserver re-runs it.
* The fan reserves the outer card's **rotated** extent, horizontally
  (`cw*cos(t)/2 + ch*sin(t)`) and vertically (`cw*sin(t)/2`), plus the 24px unaffordable drop.
  Budgeting only half a card width is what let the old fan run to x = -9 and hang 32px below
  the viewport. `max(card.bottom) == h - 20` for every n now, by construction.
* The fit is **quantised to 1/8ths** (0.625 / 0.75 / 0.875 / 1.0). The compositor rasters a
  card at its transform scale, so a continuous fit meant nearly every hand size produced a
  raster scale it had never seen before.

Measured, `MMTEST.fitCheck()` on the showcase, n = 1..12, four resolutions: **zero clipping**
(`max(card.bottom) <= innerHeight - 8` everywhere), card height 20.9%-29.3% of viewport,
hand width <= 80% of viewport, left edge >= 150px at every n. Overlap at n=10 / n=12:
34.1% / 32.8% (1280x720), 44.7% / 31.1% (1366x768), 42.8% / 43.3% (1600x900),
42.0% / 44.1% (1920x1080) — the 45% ceiling holds everywhere.

### Card anatomy reworked (this is what made the smaller card readable)

Art 0-126u, name plate 126-160u **below** the art, type line 160-182u, rules 186u to 15u from
the bottom, badges at 1u. The 90%-black banner used to cover 20% of the illustration and the
rules box stopped 30u short of the bottom — 18% of the card was dead space. Also: rules rows
now stretch to the box width (real card text was overflowing both edges and being clipped),
the cost gem moved from -6u,-6u to 3u,3u (it was landing on the neighbour's art), and the
rarity crest is inset into the top rail with a real bevel instead of a flat mound stuck on top.

### Performance

`draw 5 into a hand of 12` was 43 fps cold. Three separate causes:

1. `cardArt()` painted five fresh canvases (~6ms each) plus PNG encodes inside one frame.
   New `warmArt(defs, w, h, {upgraded})` in `cardart.js` pre-renders a whole deck off the
   critical path, ~11ms of work per frame, and pre-decodes each bitmap. Art is now rastered at
   a **fixed** size (`ART_W * CARD_SS` x `ART_H * CARD_SS`, exported from `card.js`) so the
   cache key is viewport-independent.
2. The rarity crest stacked **four** `drop-shadow()` filters to fake a 1px outline — roughly
   32ms of raster per newly created card. Replaced with a dark parent + inset bevelled child.
3. The real killer: five card elements attached to the DOM in one frame = five new composited
   layers rastered in that frame. `Hand#_makeSlot` now staggers the DOM insertion two frames
   per card (they are already staggered visually by `drawStagger`).

`tests/critic-cardfeel/fps.py`, 1600x900, SwiftShader, three consecutive runs:
idle@7 **61**, idle@12 **61**, **draw5-into-12 61 / 61 / 62 cold**, draw5-into-12 again 61,
draw5-into-7 61, discard@12 61, exhaust@12 57-60, hover-sweep 88-91.
(Was: draw5-into-12 43 cold / 56 warm, discard@12 57, exhaust@12 55.)

**Scenes should call both on entry**, ideally behind the transition:

```js
import { warmArt } from '../ui/cardart.js';
import { ART_W, ART_H, CARD_SS } from '../ui/card.js';
await warmArt(deck, ART_W * CARD_SS, ART_H * CARD_SS, { upgraded: 'both' });
hand.warmRaster(deck, 6);          // optional rehearsal, invisible, below the fold
```

### The other ten

1. **Arrowhead.** The tangent was taken from `t -> t+0.01` clamped to 1, so at the last sample
   it was `t -> t`: direction (0,0) and a zero-area head. Taken backwards now (`t-d -> t`),
   always defined. Solid 36px triangle, tip stopped on the reticle ring instead of piercing
   the sprite, and the ribbon widens monotonically toward the target instead of pinching to
   nothing (it read as a comet pointing the wrong way).
2. **Exhaust embers.** The mask was applied to the card root with the embers inside it. A new
   `.mm-card__body` wrapper holds everything; the ember layer is its **sibling**, so embers
   survive the burn. The mask box is stretched 30u above the card so the crest and the cost
   gem burn too. 615ms -> 380ms, card visually gone by ~220ms. Embers are promoted only for
   the life of the animation (a permanent `will-change` there cost ~8 fps on every draw).
3. **Unaffordable / Curse contrast.** Root cause was structural: `.mm-card__face` was a CHILD
   of `.mm-card__frame`, and the unplayable treatment filtered the frame — so the filter hit
   the rules text too. The face is now a **sibling** of the frame. Art/frame/crest/pips/gem
   desaturate (`saturate(.35) brightness(.6)`); text is never filtered and the 42% ink-900
   `::after` sheet is gone. Measured from PNG pixels (brightest 0.5% vs 20th percentile of the
   rules crop): playable **15.25:1**, unaffordable **15.71:1**, Curse **15.79:1**, Status
   **15.64:1**. Rendered text colour on an unaffordable card is `rgb(244,239,228)`
   (`--text-hi`), confirmed by `pass4.py`.
4. **The arrow no longer lies.** `is-snapped` (amber + reticle) requires `slot.playable`;
   otherwise it stays `is-invalid` grey with no reticle. The threshold line gets a third state,
   `is-blocked` — grey, labelled "Not enough Nerve" — instead of arming in amber and refusing.
5. **`aria-label`** is built from resolved, preview-adjusted numbers and plain-language
   keywords: "Scratch, 1 Nerve, Attack, basic, Deal 6 damage." (was "Deal d damage.").
6. **Focus.** Cards carry `tabindex="-1"`, the hand is a single `tabindex="0"` roving-focus
   host, and Tab is trapped inside the hand while a card is selected or an aim is open
   (it cycles targets while aiming, walks the hand otherwise). A played card hands focus back
   to the hand rather than dropping it on `<body>`.
7. **Art identifies the card.** The subject layer was the companion portrait, re-cropped — all
   five Marmalade cards were the same ghost-cat face. It is now a silhouette chosen by
   `def.id` (`subjectFor()`): claw / curled sleeping cat / pouncing cat / bone / pumpkin /
   candy / eye / ghost / web / nine lives / thorn / flask / ward / paw and more, with a
   type-keyed fallback pool. The companion still owns the palette, the scene and the accents.
   `art.py`'s closest pair is now 14.66 mean abs px diff on a 16x16 downsample; the five
   Marmalade cards sit at 17.7-18.9.
8. **Crest** bevelled and inset (see anatomy above).
9. **Cost gem** moved inside the card box.
10. **The hero frame.** The played card was picking up `is-unplayable` — paying for it dropped
    energy to 0 and `_refreshPlayable` repainted it a frame before it reached the play
    position. `_animatePlay` now forces `playable: true` and adds `is-hero` (kills every
    dimming filter, boosts saturation/contrast, hard rim of light), scale overshoots 11% past
    the play size and settles on `easeOutBack`, and `CardView#impact()` fires a fast-attack
    white pop with a bloom ring at contact.

Also fixed in passing: **Escape during a drag** cancelled the aim but left `drag.snap` set, so
the card was still played on release.

### Not fixed / notes for others

* The absolute visible sliver at n=10 is 108px at 1600x900 (130px at 1920x1080), not the 120px
  the critic asked for at every resolution. The binding constraint is the rotated outer card's
  reach: honouring 120px at 1600x900 would push the leftmost card edge to x=101, on top of the
  energy orb. I kept the ratio (<=45% overlap) and the gutter, and let the absolute number fall
  where it must. Say the word if the orb should move instead.
* `select.js` and `gameover.js` size their CardViews from the `--card-w` token. Cards are now
  slightly narrower than 224 at small viewports, so their slot maths is a few px off. Harmless,
  but worth a look by frontend / meta-run.
* `preloadArt()` is now a deprecated no-op (portraits are no longer the subject layer). It is
  still exported so nothing breaks. `onArtReady()` still works.
* Dropped the local `var(--good-300, #74e08a)` fallbacks now that the tokens exist. Thanks.

### Screenshots

`shots/r2/` — `arrow_playable.png`, `arrow_unaffordable.png`, `thresh_unaffordable.png`,
`ex_0000..0400.png` (exhaust phases), `play_0000..0520.png` (hero frame),
`c_playable.png` / `c_unaffordable.png` / `c_curse.png` / `c_status.png` (contrast crops).
`shots/mine_12.png` (hand of 12 fitting), `shots/mine_unplayable.png`,
`shots/mine_card_zoom.png`.

---
