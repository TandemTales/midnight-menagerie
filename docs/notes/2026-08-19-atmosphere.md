## 2026-08-19 — atmosphere

Backdrop, candlelight, particles, post-processing and transitions. Everything is
procedural — there is no environment art in the project — driven by a region
palette table, so all 17 regions come out of one system.

Measured **61 fps at 1600x900** (`tools/shot.py`, dpr 1) in every region.

### Files

| File | What it is |
|---|---|
| `fx/atmosphere.js`          | `Atmosphere` — the public API + the 17-region palette table (`REGIONS`, `REGION_ALIAS`) |
| `fx/backdrop.js`            | `Backdrop` — wall / side walls / floor / ceiling / props / shafts / near frame |
| `fx/lights.js`              | `LightRig`, `AtmoLight`, `Flicker` — candlelight + spectral counter-light |
| `fx/particles.js`           | `ParticleField` — one GPU draw call, 8 types, zero CPU work per frame |
| `fx/transition.js`          | the 5 authored transitions |
| `fx/showcase.js`            | `mountShowcase(ctx)` — judging harness, not part of the shipped flow |
| `fx/shaders/common.js`      | shared GLSL: hashes, value noise, fbm, ridged fbm, SDFs, split-tone |
| `fx/shaders/backdrop.js`    | wall (5 architecture modes) / floor / props / shafts / frame GLSL |
| `fx/shaders/particles.js`   | particle vertex + fragment GLSL |
| `fx/shaders/grade.js`       | `GradeShaderDef` — the final colour grade |
| `core/renderer.js`          | `Stage` (co-owned with the lead) |
| `scenes/atmostest.js`       | test bench scene — **needs registering in main.js** |

### Public API

```js
// ---- ctx.atmosphere -------------------------------------------------------
atmosphere.setMood(region, { instant })   // swap region look; ~0.7 s cross-fade
atmosphere.impact(pos, opts)              // pos: THREE.Vector3 (world) OR {x,y} in CSS px
                                          // opts: { strength 0..2, color, shake, burst }
                                          // -> particle burst + a real light flare at the
                                          //    point + screen ripple + shake + micro-flash
atmosphere.dread(v, dur)                  // 0..1 desaturate + cool + crush the edges
atmosphere.pulse(color, amount, dur)      // soft coloured wash (gated by settings.flashes)
atmosphere.light(spec)                    // -> AtmoLight; spec:
                                          //   { kind:'warm'|'cold', pos, color,
                                          //     intensity, radius, flicker }
atmosphere.setIntensity(0..1)             // dim the backdrop under UI-heavy screens
atmosphere.rig                            // LightRig (rig.lights, rig.keyDir, rig.keyColor)
atmosphere.mood                           // current region key
atmosphere.backdrop / .particles          // escape hatches if you really need them

// ---- ctx.stage (existing API kept, plus additions) ------------------------
stage.shake(mag = 0.12, decay = 9)        // respects Save.settings.screenShake
stage.flash(color, amount, dur)           // respects Save.settings.flashes
stage.pulse(color, amount, dur)           // gentler than flash
stage.ripple(cx, cy, strength)            // screen-UV shockwave ring (0..1, y up)
stage.setParallax(x, y, z)                // additive camera offset (atmosphere drives it)
stage.setCameraBase(v) / stage.setQuality(q)
stage.scene / .camera / .lookAt / .grade / .bloom / .renderer

// ---- ctx.transition -------------------------------------------------------
await transition.cover(kind, opts)        // resolves when the screen is fully hidden
await transition.reveal()                 // reuses the kind it covered with
await transition.wipe(kind, async fn)     // cover -> fn() -> reveal
```

`AtmoLight`: `.setPos(x,y,z)`, `.base` (intensity before flicker), `.live` (after
flicker), `.color`, `.enabled`, `.dispose()`.

Scenes may add their own meshes to `stage.scene` and they will be lit for free —
every `AtmoLight` also drives a real `THREE.PointLight`, plus there is an ambient
and a hemisphere light keyed to the region.

### Transitions

| kind | in | out | use |
|---|---|---|---|
| `veil` | 300 ms | 320 ms | default; inky curtains close from both edges with a lit ragged seam |
| `doorway` | 340 ms + 90 ms slam | 360 ms | entering/leaving the mansion; shakes the camera on close |
| `blueprint` | 300 ms | 340 ms | map to room; the frame folds into drafting linework |
| `candle-out` | 340 + 140 ms | 380 ms | death; the world closes to a guttering point, then smoke |
| `dawn` | 360 ms | 400 ms | victory; warm light floods from above |

`Save.settings.reduceMotion` collapses every kind to a 110 ms cross-fade. The layer
is `display:none` when idle, so it can never eat a click.

### Region palettes (`REGIONS` in fx/atmosphere.js)

`arch` = wall architecture mode: 0 panel, 1 glass, 2 stone, 3 foliage, 4 industrial.
`floor` = 0 planks, 1 checker tile, 2 flagstone.

| key | region | arch | floor | key light | counter light | particles |
|---|---|---|---|---|---|---|
| `foyer` | Forgotten Foyer | panel | planks | `#ffb64a` sconces | `#2f8fa8` doorway | dust, wisp, ember |
| `nursery` | Forgotten Nursery | panel | planks | `#ffb87a` nightlight | `#9fd8ee` moon | dust, ash, wisp |
| `sleeping` | Sleeping Quarters | panel | planks | `#ffb24a` candle | `#7fa8f0` moon | dust, wisp, ash |
| `kitchens` | Kitchens & Cellars | industrial | flagstone | `#ff7a28` oven | `#7fc9a0` | ember, dust, plaster |
| `greenhouse` | Impossible Greenhouse | glass | flagstone | `#ffbb52` lantern | `#7fe8c0` glass moon | spore, dust, wisp |
| `graveyard` | Mansion Graveyard | stone | flagstone | `#ffb24a` candle | `#a8c8e8` moon | ash, dust, wisp |
| `study` | Grand Study & Library | panel | planks | `#ffbb52` desk lamp | `#5fa8c8` | dust, ember, wisp |
| `attic` | Moonlit Attic & Observatory | industrial | planks | `#ffb24a` candle | `#a8b8ff` starlight | dust, wisp, ash |
| `lampworks` | The Lampworks | industrial | flagstone | `#ff8a28` forge | `#4fc8ff` gas flame | ember, wisp, dust |
| `ballroom` | Ballroom & Velvet Suites | panel | checker | `#ffc95a` chandeliers | `#a86fd8` | dust, ember, wisp |
| `crypt` | Crypt & Ossuary | stone | flagstone | `#ffab3c` single candle | `#4fe0d0` | dust, wisp, ash |
| `hedge` | Withered Hedge Maze | foliage | flagstone | `#ffab3c` lantern | `#9fb8d8` moon | spore, ash, dust |
| `passages` | Secret Passages | stone | planks | `#ffb04a` lantern | `#7f5fd8` | dust, plaster, wisp |
| `bathhouse` | Bathhouse & Rain Wing | glass | checker | `#ffb85a` | `#5fd0e8` | **rain**, dust, wisp |
| `kennels` | Kennels & Animal Ward | panel | flagstone | `#ffb04a` hay lamp | `#5fa8c0` | dust, ash, ember |
| `pumpkin` | Moon Courtyard & Pumpkin Grounds | foliage | flagstone | `#ff8a28` pumpkins | `#a8c8e8` moon | dust, spore, ember |
| `heart` | Heart of the House | panel | checker | `#ffe0a0` warm flood | `#8fd9ec` | dust, wisp, ember |

`REGION_ALIAS` also accepts the design-doc names (`sleeping-quarters`, `hedge-maze`,
`secret-passages`, `pumpkin-grounds`, `library`, `observatory`, `conservatory`,
`cellars`, `ossuary`). An unknown name falls back to `foyer` rather than throwing.

Per-region knobs: `arch, floorPattern, ceil, sides, coolFill, grime, openGlow,
wallFog, gloss, rim, frameAmount, gain, bloom, bloomThreshold, warmTone, halation,
exposure, vignette, grain, fogDensity, shafts{}, props{}, particles{}, lights[]`.
Adding a region means adding one entry — nothing else changes.

Prop silhouette shapes (`props.shapes`): 0 armchair, 1 candelabra, 2 tall plant,
3 headstone, 4 chandelier (hangs), 5 cabinet, 6 column, 7 drape (hangs), 8 crates,
9 shrub.

### Grade

Fixed the shadow-tint bug. The old grade added a flat cool term to shadows, so pure
black rendered as **rgb(0, 6, 50)** navy — still visible in `shots/boot.png` and
`shots/atmos_baseline.png`. Every tint now goes through `mmSplitTone`, whose shadow
weight is multiplied by `smoothstep(0.0, 0.055, lum)`, so a black pixel stays black.
Corners now measure **rgb(0,0,0) to (3,3,3)** (`shots/a15_crypt.png`).

Also added: 8-tap golden-angle **halation** on highlights, modulated by a procedural
**lens-dirt** field; **film grain** stepped at 24 fps so it reads as film rather than
digital noise; an aspect-aware **edge vignette**; the **dread** term (desaturate +
cool + edge crush); an **impact ripple**; and the **pulse** wash. Bloom defaults to
`strength 0.72 / threshold 0.78` — flames and spectral glow cross it, ordinary
surfaces do not, and UI can never bloom because it is DOM on a separate layer.

### Performance notes

- One draw call for all ambient particles (1500 ambient + 256 reserved for impact
  bursts). Motion is entirely in the vertex shader; the CPU writes one uniform.
- Props and light shafts are instanced (`InstancedBufferGeometry`), one draw each.
- The wall relief normal uses 3 height samples (forward differences), not 5, and the
  height field uses a single noise octave because it runs 3x per pixel.
- No per-frame allocation: every vector/colour is preallocated and reused.
- `Save.settings.reduceMotion` kills camera parallax, quarters flicker depth and prop
  sway and shrinks particles; `.flashes` gates `flash`/`pulse`; `.screenShake` scales
  `shake`.

### Gotcha worth knowing

`THREE.UniformsUtils.clone()` only does `array.slice()` on uniform arrays, so cloned
materials **share the Vector4/Color objects inside them**. This silently broke the
back wall's lighting for a while. `fx/backdrop.js` exports the pattern as
`freshLightSlots()` — use it if you clone a material that has array uniforms.

### Asks

- **Register `scenes/atmostest.js` in `src/main.js`** — see the header of that file.
  Reachable at `#scene=atmostest` (`&region=crypt` to start elsewhere).
- No `tokens.css` changes were needed. Region colour lives in the `REGIONS` table;
  neutrals and light colours are read once from tokens at init.

---
