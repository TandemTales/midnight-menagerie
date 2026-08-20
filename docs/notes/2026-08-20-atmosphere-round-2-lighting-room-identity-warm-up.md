## 2026-08-20 — atmosphere (round 2): lighting, room identity, warm-up

Round 1 shipped a good authoring surface with nothing lit by it. Every number below
was measured from the actual PNGs with a script written for this pass
(luma = Rec.709 on 8-bit sRGB; saturation = mean chroma, max-min; structural
cross-correlation = Pearson on a brightness- and contrast-normalised 128x72 luma
downsample). Reference target is `game/assets/portraits/pipkin.png`.

### 1. Nothing was lit by a light — three separate causes, all fixed

1. **Every region's lamps were deep in the room** (z between -4 and -17), so the
   camera only ever saw the *shadow* side of anything in the foreground. The
   showcase stand-in, the near props and the enemies were all backlit silhouettes
   no matter how bright the wall behind them was. Every region now authors a
   **`key`** and a **`fill`** in FRONT of the action plane (positive z, between the
   camera and the actors). `LightRig.slots` went 4 -> 5 so the key can never be
   evicted, and slot selection now sorts on *authored* intensity rather than live
   intensity so flicker cannot make lamps swap slots and pop.
2. **`AtmoLight` under-drove its real `THREE.PointLight`** — a flat `intensity * 6`
   regardless of radius. The backdrop shaders use `I / (1 + k^2(1 + 1.55k))` with
   `k = d/r`; equating the two at `d = r/2` gives `I_three = 0.17 * I * r^2`. A
   wide-radius lamp was 3-5x too dim, which is why any `MeshStandardMaterial` an
   agent adds to the scene rendered black in a visibly bright room.
3. **The prop shader lit four quad corners with a near-black albedo.** Props are
   now shaded **per pixel** from an SDF-derived normal (the coverage-field gradient
   turns the flat quad into a rounded slab that faces outward at the silhouette and
   toward the camera in the middle), with a real material colour per region
   (`propAlb` / `propHi`), a specular term, and interpolated world position so a
   crown is genuinely farther from a low lamp than a base is.

Also new: **visible flames.** Every practical light now draws an additive billboard
(`FLAME_VERT/FRAG`, `Backdrop.syncFlames`), driven by the same flicker that drives
the illumination. This is the only thing in frame that is *supposed* to clip to
white, and it is what gives bloom something honest to work on. `key`/`fill` set
`glow: 0` — they are cinematic lights, not objects.

And **contact shadows**: an instanced multiply-blended ellipse under every standing
prop, plus `atmosphere.setActors([{x, z, r, strength}])` for actors a scene owns.

### 2. Shafts now land

Each shaft computes its own floor intersection, is extended to reach it
(`len = originY / cos(angle) * 1.06`), brightens into the contact instead of fading
out, and publishes an elliptical **pool** that the floor shader paints
(`uPool` / `uPoolAxis` / `uPoolCol`, 4 slots). Round 1 faded the beam out at its own
bottom edge, so every shaft in all seventeen regions stopped in mid-air.
All 17 regions author shafts now; five had none. **`foyer` — the first atmosphere
any player ever sees — declared no lights, no shafts and no particles at all.**

### 3. Seventeen rooms, not one room recoloured

The palette gained three structural blocks:

* `room: { w, d, h, side, ceilPattern, wallPad }` — the shell geometry is rebuilt
  per region. The Secret Passages is 7.5 m wide with a 3.4 m ceiling; the Ballroom
  is 34 x 26 x 10.5; the Graveyard, Hedge Maze and Pumpkin Grounds have no ceiling
  and no side walls at all and use a new **exterior** wall mode (night sky
  gradient, stars, a moon with a real halo, a distant roofline with lit windows
  that spill onto the masonry).
* `cam: { y, z, look, fov }` — eye height, distance and lens per region, applied by
  `stage.setCameraRig()`. Combat framing is pushed in and the horizon raised:
  StS2 is "epic rather than intimate", and the old frame was ~70% bare floor.
* `props.layout` — one of `wings | colonnade | rows | aisle | clutter | nook |
  terrace | hang | perimeter`. Props are also now clamped to the visible half-width
  at their depth, so a prop in a 34 m room is actually in the shot.

Ceiling treatments went from 4 to 9 (planks / checker / flagstone / coffered /
vaulted ribs / glazed panes / exposed rafters / plaster rose / industrial truss).
The silhouette library went from 10 shapes to 20 — cot, rocking horse, four-poster,
range, longcase clock, statue, sarcophagus, clawfoot bath, gas lamp, birdcage — and
every region draws from its own set.

### 4. The 6 s first frame

`grep -rn "compileAsync"` returned nothing in round 1; the first `composer.render()`
linked RenderPass + UnrealBloomPass (5 mips) + grade + OutputPass in one task.
`Stage.warmup()` now compiles **one object per task** (`compileAsync(obj, cam, scene)`
with a yield between each), shows the room un-posted as soon as the scene materials
are ready, then warms bloom and the grade off-screen at 1/8 scale and switches each
on. Two shader-side changes cut the link cost directly: the wall relief and the prop
coverage field are each evaluated **once** instead of three times, using `dFdx/dFdy`
for the gradient. That alone took total warm-up from 21.7 s to 6.3 s under
SwiftShader (`window.__MM_WARMUP_MS`).

### 5. New API and seams (for other agents)

```js
atmosphere.setActors([{ x, z, r, strength }])  // ground shadows for your actors
atmosphere.keyLight()             // { dirX, dirY, color, fill, strength }
atmosphere.screenToFloor(px, py)  // CSS pixels -> world point on the floor plane
stage.setCameraRig({ y, z, look, fov }, seconds)
stage.warmup()                    // idempotent; resolves with ms taken
```

Atmosphere also publishes the live key light on `document.documentElement` as
`--atmo-key-x`, `--atmo-key-y`, `--atmo-key`, `--atmo-fill`, `--atmo-key-strength`,
`--atmo-ground` (throttled to ~6 Hz). **combat-scene**: these are there so
`ui/enemy.js` can give its SVG sprites a directional gradient along
`(--atmo-key-x, --atmo-key-y)` in `--atmo-key`, an ambient-occluded base in
`--atmo-fill`, and a ground ellipse at `--atmo-ground` opacity. Lost Luggage is
currently the same brown at its crown as at its base while standing in an amber-lit
room; the room now has a defined key direction to shade it with. Alternatively call
`atmosphere.setActors()` with each enemy's floor position and get the contact shadow
in WebGL for free.

### 6. Hand-off: the title screen

`scenes/title.js` / `title.css` are the frontend agent's. `.ti-sky` is an **opaque**
full-viewport gradient, so nothing the atmosphere layer renders is ever visible on
the title screen — the measured before/after there is unchanged (mean luma 25.7,
mean chroma 15.3, 85.5% of pixels below L32, 4.8% mid-tones). A `title` region is
now authored in `REGIONS` (exterior night: sky gradient, stars, a moon with a real
inverse-exponential halo rather than a flat disc, a roofline with lit windows that
spill onto surrounding masonry, and two candle pools at the front of frame). To use
it: make `.ti-sky` / `.ti-clouds` / `.ti-moon` transparent or drop them, and call
`ctx.atmosphere.setMood('title')` instead of `'foyer'` in `TitleScene.enter()`.

If the SVG mansion stays, the specific defects measured were: mansion, trees, fence
and hedges are single flat fills with no value ramp and no rim; the moon is a flat
grey disc with three flat darker circles and no halo; lit windows are flat amber
rects that do not spill onto the masonry; fence pickets 40px from a lit candle
measure the same as pickets 400px away (the candles need a real radial falloff);
and the cobwebs read as a 15%-white UI overlay rather than as part of the world.

### 7. Measured before / after

Region set = all 17, captured through `fx/showcase.js` at 1600x900.

| | before | after | reference (pipkin) |
|---|---|---|---|
| mean luma (17-region avg) | 17.4 | **53.8** | 52.9 |
| median luma | 6.1 | **33.7** | 32.2 |
| p95 luma | 75.6 | **182.0** | 164.0 |
| mean chroma | 20.2 | **52.4** | 54.6 |
| shadows L<32 | 82.4% | **48.2%** | 49.7% |
| mid-tones 64-160 | 7.1% | **22.7%** | 24.1% |
| highlights L>192 | 0.1% | **4.2%** | 3.6% |

Combat (`shots/ca-combat.png` -> `shots/zz-combat.png`, full frame incl. DOM UI):
mean luma 27.3 -> **49.6**, median 8.2 -> **29.5**, mean chroma 26.1 -> **46.1**,
shadows 73.5% -> **53.5%**, mid-tones 12.3% -> **19.0%**, highlights 0.9% -> **2.8%**.

Props (the two side bands where props live, `(100,360)-(560,700)` and
`(1080,360)-(1540,700)`): p95 luma **116.9 -> 199.9** (target >=140), pixels above
L192 **1.7% -> 6.3%** (target >=3%), mean chroma 25.0 -> 67.4.

Structural cross-correlation across the 17 regions, brightness and contrast
normalised out: **0.627 -> 0.296** (target < 0.35). Strictest variant (also
high-passed to remove global gradients): 0.290 -> 0.049. Worst surviving pairs are
pumpkin/graveyard and lampworks/bathhouse at ~0.70 — both are legitimately similar
room *types*, and both are well below the round-1 average.

Longest `PerformanceObserver` long task, cold load, SwiftShader software WebGL:
title **6360 ms -> 2941 ms**, combat **5952 ms -> 2599 ms**, map **5447 ms -> 2949 ms**.

### 8. Known gaps, honestly

* The **<250 ms long-task target is not met** and is not reachable under
  SwiftShader: what remains is a single `gl.linkProgram` for one material, and
  software GL takes seconds over it. The structural fix is in (per-object compile,
  one task each, no single task owning the whole chain, and the two heaviest
  shaders cut to a third of their code size), and the screen is no longer blank or
  frozen while it happens. This needs a re-measure on hardware GL.
* Frame rate under SwiftShader at 1600x900 dropped from ~61 to ~30 fps: 5 lights
  instead of 4 across wall/sides/floor/ceiling/props, per-pixel prop lighting, the
  pool loop, flame billboards and contact shadows. This is a software-rasteriser
  number, not a GPU one, but somebody should confirm 60 fps on real hardware before
  sign-off. `stage.setQuality(0)` halves DPR if it is needed.
* Combat's *composite* mid-tone figure (19.0%) sits under the 22-25% target because
  roughly 40% of that frame is dark DOM chrome; the WebGL layer on its own is 22.7%.
* Props still read slightly waxy in the brighter rooms (nursery, sleeping, kennels).

### Screenshots

`shots/zz-regions.png` (17-region contact sheet, after) vs
`shots/zz-regions-before.png` (same regions, round 1).
`shots/zz-combat.png`, `shots/zz-title.png`.
Per-region frames: `shots/M_<region>.png` (after), `shots/B_<region>.png` (before).


---
