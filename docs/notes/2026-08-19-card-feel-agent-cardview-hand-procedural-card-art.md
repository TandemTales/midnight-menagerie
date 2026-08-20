## 2026-08-19 — card-feel agent: CardView, Hand, procedural card art

Owned and delivered: `src/ui/card.js`, `src/ui/card.css`, `src/ui/hand.js`,
`src/ui/hand.css`, `src/ui/cardart.js`, `tests/cards-feel/**`.
Nothing outside those paths was touched.

Showcase / iteration harness: `http://localhost:8777/tests/cards-feel/index.html`
Motion strips: `python tests/cards-feel/run.py [scene...]` -> `shots/cf-*.png`
(`--list` for scene names: idle gallery hover drag threshold play draw discard
exhaust unplayable upgrade keyboard perf reduce).

### CardView — `src/ui/card.js`

```js
import { CardView, CARD_SS } from './ui/card.js';

const v = new CardView(def, {
  uid, upgraded, cost,        // cost overrides def.cost (dynamic costs)
  playable, largeText, reduceMotion, clock,
});
parent.appendChild(v.el);
```

| member | contract |
|---|---|
| `v.el` | the root `.mm-card`. Positioned only by `setTransform`. `pointer-events:none` — do not re-enable, the Hand hit-tests itself. |
| `v.setState(patch)` | merge of `{upgraded, cost, playable, selected, hover, dragging, ghost, disabled, largeText}`. Re-renders only what changed. |
| `v.setPreviewNumbers({d:12, wasD:9})` | live recolour: green when the value went up, red when it went down. Any placeholder key works (`d`,`b`,`n`,`m0`…), each with an optional `wasX`. `null` restores printed values. **STS2-REFERENCE §2.** |
| `v.setTransform({x,y,rot,scale,z})` | `(x,y)` is the card's **bottom-centre** in the parent's px space; `scale` 1 = 224x312 on screen; `rot` in degrees. |
| `v.transform` | read-only current values. |
| `v.flash(strength,dur)` / `v.shake(mag,dur)` | promise-returning; shake composes on top of `setTransform`. |
| `v.dissolve(dur)` | burns bottom-to-top into rising embers (exhaust). |
| `v.materialize(dur)` | fade + swell in (draw). |
| `v.glow(color, amt)` / `v.pulse(color, dur)` | persistent ring / one-shot ring pulse. `glow(null)` off. |
| `v.destroy()` | removes the element and its art subscription. |
| `CardView.registerKeywords({ghoststep:'Ghoststep', ...})` | display names for `[Keyword]` chips. **combat-engine: please call this from `data/keywords.js` at boot.** |

Text placeholders rendered from `def.text`: `{d} {b} {n} {m0}…` becomes
`<b class="mm-card__num" data-key="…">`, `[Keyword]` becomes
`<span class="mm-card__kw" data-kw="kebab-id">`, `*text*` becomes `<em>`,
`\n` becomes a new line. Keyword chips carry `data-kw`, so **ui-chrome's Tooltip
can delegate off `.mm-card__kw[data-kw]`** without any change here.

Anatomy (STS2-REFERENCE §3): cost gem top-left, name banner, art in the top 55%,
type line, rules text with bold numbers and keyword chips.
Rarity lives in the **frame material** — basic matte pewter / common brushed steel
+ rivets / uncommon cyan inlay + set gem + edge glow / rare gold filigree + corner
flourishes + slow shimmer. Type has a **silhouette cue as well as colour**
(colourblind-safe): attack = sharp frame + blade crest + flank fins,
skill = heavily rounded frame + dome crest, power = crown crest + diamond side pips,
plus a distinct type glyph. Upgraded shows a green `+` and green numbers.

Crispness: the card is *built* at `CARD_SS` (1.4x) and only ever transform-scaled
**down**, so it never upscales past its raster — crisp from 1.0x through 1.35x —
and because sizes only change via transform, text can never reflow mid-animation.

### Hand — `src/ui/hand.js`

```js
import { Hand, TUNE } from './ui/hand.js';

const hand = new Hand(ctx /* {bus, clock, Save} */, {
  root: someAbsolutelyPositionedContainer,   // hand fills it (inset:0)
  onPlay:    ({uid, cardUid, card, targetId, view}) => {},   // return false to refuse
  onPreview: ({card, uid, targetId}) => ({ d: 12, wasD: 9 }),  // or null
  getTargets: () => [{ id: 'enemy0', el: enemyEl }],
});
```

| call | does |
|---|---|
| `hand.setCards(cards)` | replace the hand; existing uids keep their view and re-fan. |
| `hand.draw(cards)` | riffle in from the draw pile, 55 ms stagger, alternating flick. |
| `hand.discardAll()` / `hand.discard(uids)` | tumble to the discard pile. Promise. |
| `hand.exhaust(uid)` | rise + ember dissolve. Promise. |
| `hand.setPlayable(fn)` | `fn(card, energy) -> bool`. Default: `cost <= energy`, `-2` never. |
| `hand.setEnergy(n)` | re-evaluates playability and re-fans. |
| `hand.lock()` / `hand.unlock()` | kill input (also cancels aim + hover). |
| `hand.setPiles({draw:{x,y}, discard:{x,y}})` | **combat-scene must call this** with real pile positions in the hand's coordinate space. |
| `hand.playCard(uid, targetId)` | programmatic play (used by the keyboard path). |
| `hand.cards()` / `hand.viewOf(uid)` / `hand.count` | read-only accessors. |
| `hand.destroy()` | removes every listener, observer, view. |

`cards` may be raw CardDefs or runtime objects `{uid, def, upgraded, cost}`.

**Keyboard (full parity with the mouse):** `1`–`9` select a card (same number
again = confirm), `←`/`→` move the selection (or cycle targets while aiming),
`↑`/`Enter`/`Space` confirm — a targeted card enters aim mode first — `Tab`
(`Shift+Tab`) cycles targets, `↓`/`Esc` cancels.

**Bus events** (all payloads carry `uid`, most also `cardId`):
`card:hover`, `card:unhover`, `card:pickup`, `card:drop`,
`card:target {uid, targetId}` — *extra, not in the original brief: fired whenever
the arrow snaps to (or leaves) a target, so combat-scene can highlight the enemy*,
`card:play {cardUid, cardId, targetId}`, `card:cancel`.
The Hand never decides rules; `onPlay` is called synchronously at commit so the
engine resolves on the same beat the card lands at the play position.

### Tuned timings (all in `Hand.TUNE`, seconds)

| what | value | note |
|---|---|---|
| hover in | **105 ms** easeOutCubic | measured: 95% of the lift at **65 ms**, settled by ~100 ms. STS2 §1 asks for <120 ms. |
| hover out | **90 ms** | |
| hover lift / scale / neighbour nudge | 46 px / 1.19x / 30 px with 1 -> 0.42 -> 0.16 falloff | |
| re-fan | **300 ms** easeOutCubic (+10 ms/card stagger when asked) | retargetable mid-flight, so it never snaps |
| draw | 340 ms, 55 ms stagger, easeOutBack, ±18° flick | |
| discard | 400 ms, 35 ms stagger, tumble 220–520° | |
| exhaust | 620 ms rise 96 px + ember dissolve | |
| play | fly **260 ms** -> hold **170 ms** (flash) -> arc to discard **440 ms** | three beats: strike, hold, throw |
| drag follow | 75 ms retargeted per pointermove -> natural lag; tilt ±14° toward motion | |
| arc fan | <=3.1°/card, capped ±15°; step `min(184 px, spread/(n-1))`; dip `min(62, 6+5.4n)` | anchored so the *lowest* card sits on the bottom pad — the fan rises as it widens instead of falling off screen |

Handles 1–12 cards. **61 fps with 12 cards mid-drag** (measured, `run.py perf`).

### Notable implementation decisions

- **Hit-testing is manual.** Cards are `pointer-events:none`; one `.mm-hand__hit`
  band takes the pointer and the Hand tests against the *base* fan geometry
  (plus the hovered card's current body). A card lifting out from under the
  cursor therefore cannot oscillate. Don't re-enable pointer events on cards.
- **Targeted drag**: below the threshold the card follows the cursor with lag and
  tilt; above it the card parks above the hand and the **curved arrow** takes over
  aiming, snapping to a target with a reticle + pulse tick. Non-targeted cards
  keep following the cursor and commit by crossing the threshold line.
- **All motion runs through `clock`** — one `clock.onFrame` tween solver for the
  fan, `clock.ramp`/`clock.wait` for one-shots. No `setTimeout` anywhere.
- `Save.settings.reduceMotion` collapses every duration to ~0 and skips arcs and
  embers; `largeText` bumps rules text. Both re-read on the `settings:changed` bus
  event, so ui-chrome's settings panel just needs to emit it.

### Procedural card art — `src/ui/cardart.js`

`cardArt(def, w, h, {upgraded, dpr})` returns a cached data URL, **deterministic
from `def.id`** (FNV-1a -> mulberry32). Nine layers: sky, moon, scene silhouette
(mansion / graves / vines / drapes / lanterns / web / books / hedge / drips / rain /
thorns / bed / nursery / passage), floor mist, subject, family accents, type
overlay (attack = claw rakes, skill = ward arcs, power = rays + runes,
curse = thorns, status = grime), particles, grade.

The **subject** is the real portrait from `game/assets/portraits/<companion>.png`,
blob-masked, colour-graded into the family palette, with seeded zoom/pan/mirror so
two cards from the same companion never look like the same picture. Call
`preloadArt()` once at boot (idempotent) and the art regenerates automatically;
until it resolves, cards render a fully procedural family motif (cat / bone /
pumpkin / candy drip / eye / flame / fang / claw / quill / swirl / stitch / cloud /
pawbone / feather / tomb / sprig / sick / thorn / moon). `onArtReady(fn)` exists but
CardView already subscribes for you.

### What I need from other agents

1. **ui-chrome — two new tokens.** Card numbers need a "this went up" green.
   tokens.css has red (`--threat-300`) but no green. Please add to `tokens.css`:
   `--good-300: #74e08a;` and `--good-500: #2f8f4d;`.
   `card.css` currently uses `var(--good-300, #74e08a)` so it will pick them up
   with zero further changes, and the local fallback then becomes dead.
2. **ui-chrome — keyword tooltips.** Delegate off `.mm-card__kw[data-kw]`
   (the id is the kebab-cased keyword). No hook needed on my side.
3. **combat-engine — keyword display names.** Call
   `CardView.registerKeywords(map)` from `data/keywords.js` at boot.
4. **combat-scene — the wiring:**
   `hand.setPiles(...)` with real pile positions; `getTargets()` returning
   `{id, el}` for each living enemy; `onPreview` returning
   `{d, wasD, b, wasB}` from `engine.preview(cardUid, targetId)`; listen for
   `card:target` to highlight the enemy and for `card:play` to run combat FX
   during the 170 ms hold beat.
5. Illustration pigments (moss, bone, candy, stone, rot...) live in a `PIGMENT`
   table in `cardart.js`, not in tokens.css. They are illustration paint, not UI
   colour — flagging the deviation from the "all colour from tokens" rule
   deliberately. Every UI colour in `card.css`/`hand.css` comes from tokens.

---
