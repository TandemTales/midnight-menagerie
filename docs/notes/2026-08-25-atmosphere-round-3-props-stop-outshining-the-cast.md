# 2026-08-25 — atmosphere (round 3): the props stop outshining the cast

Two reviewers independently called room quality **bimodal** — the Butler's crypt and
the Inner Entry Hall excellent, the Music Room / Umbrella Gallery / Nursery "flat
untextured magenta/lilac cuboids that are the brightest objects in frame". Both were
right, and both halves of the split have the same single cause.

Room names map onto authored spaces in `scenes/combat.js`: the **Music Room** plays in
`ballroom`, the **Umbrella Gallery** in `passages`, the **Inner Entry Hall** in `foyer`,
the Butler's chamber in `crypt`. So the reviewer's four rooms are four of the seventeen,
and the fix had to be to the class, not to the three instances.

Every number below was measured from real PNGs by `tools/lookmetrics.py`, which this
round grew the ability to tell a prop pixel from a creature pixel.

---

## 1. The diagnosis: why the crypt looked right and the nursery did not

It was never the palette. Three compounding causes, in order of size:

**a. The key light was lighting the set.** Round 2 added a cinematic `key` and `fill`
in FRONT of the action plane (positive z, between the camera and the actors) precisely
so an actor would stop being a backlit silhouette. Nothing then stopped those two lights
from also hitting the props. In a **deep room laid out on the perimeter** — the Crypt,
14 m wide and 25 m back — no prop is within reach of a 8 m key and the props look
correct. In a **shallow room with a clutter layout** — the Nursery, 12.5 m deep — props
land 3 m from a 7.5 m-radius key and take it at nearly full strength. That is the entire
difference between the two halves of the split.

**b. Props carried a brightness lift no other object in the scene got.** The prop
fragment shader ran `albedo * (ambient + accent*0.13 + diff * 1.45)` and then multiplied
by `uGain = gain * propGain` = 1.85 x 1.42 = 2.63. Effective diffuse multiplier: **3.81x**.
A `MeshStandardMaterial` with the *same albedo under the same lamp* gets 1.0x — and loses
another factor of PI to `BRDF_Lambert`. Measured in the showcase, the mid-brown stand-in's
mean luma was **6.0** in `heart` and **10.3** in `bathhouse` while the props around it ran
88-138. The actor was the darkest object in a room full of lit furniture.

**c. One low-amplitude fbm is not a material.** The body of a prop was
`albedo *= 0.84 + 0.34*mmFbm3(vUv*7.0)` and nothing else — no grain, no joints, no
speckle, no occlusion at the base or inside the silhouette. In the dark regions the
albedo hid that; in the pale ones (`nursery` propHi `#a8737a`, `ballroom` `#a8697a`) it
read as untextured plastic. Which is what "debug geometry" means.

## 2. What changed

### The prop shader (`fx/shaders/backdrop.js`)

* **A key light lights the SUBJECT, not the set.** `AtmoLight` gained a `cine` flag,
  `LightRig` publishes `rig.cine[slot]`, and `Backdrop.syncLights` scales cinematic
  lights to `CINE_PROP = 0.26` **for the prop material only**. Walls, floor, ceiling and
  every mesh still get them in full.
* **The diffuse multiplier is gone.** `diff * 1.45` -> `diff`. Brightness now lives in
  `uGain` alone, where it can be calibrated in one place (`propGain` 1.42 -> 1.55, but on
  a term that is 1.45x smaller, so the net diffuse lift went 3.81x -> 1.48x).
* **A real material.** Four weighted terms, all authored in METRES from a new `vSize`
  varying so a 0.6 m stool and a 3 m wardrobe carry the same physical texel density:
  directional grain, low-frequency blotch, periodic joints at *n* per metre, and a
  per-cell speckle. Plus base-contact occlusion and an inside-the-silhouette darkening.
  Seven presets — `wood / paint / stone / tile / cloth / metal / foliage` — and every
  region names one. Two uniforms (`uMatMix`, `uMatFreq`) and one `uAO`; no branch, no
  second program, no measurable frame cost.
* **A hard luminance ceiling.** New `uPropKnee` / `uPropMax`: above the knee, prop
  luminance compresses asymptotically and can *never* reach the max, with hue preserved
  (the whole colour is scaled by the luminance ratio, so it desaturates like film rather
  than shifting to white). The target is authored **post-exposure** as `propCeil` and
  divided through by the region's own `uExposure` in `applyPalette` — `heart` runs
  exposure 1.11 and `attic` 2.80, so a single pre-grade clamp would either kill the dark
  rooms or do nothing in the bright ones. This is the structural guarantee: a prop
  cannot become the brightest thing in frame however bright the room gets.

### Actors stopped rendering black (`fx/lights.js`)

`MESH_K` — the THREE.PointLight intensity per unit of AtmoLight intensity per m^2 of
radius — went **0.17 -> 0.95**, derived rather than dialled:

```
  0.26   equate I/(1+k^2(1+1.55k)) with I/d^2 at d = 0.8r
x PI     undo three's 1/PI BRDF_Lambert, which the backdrop shaders do not apply
x 1.15   the share of the surfaces' uGain a lit object in this scene carries
= 0.94
```

Ambient and hemisphere lose the same 1/PI and were scaled to match (0.85 -> 2.10,
0.55 -> 1.30). These affect **meshes only** — the backdrop shaders carry their own
`uAmbient` — so this is a straight win for anything any agent adds to the scene.

### Nothing floats, nothing is cut (`fx/backdrop.js`)

The audit found 31 defects across the 17 regions before, at **both** resolutions. Causes
and fixes:

| defect | count | cause | fix |
|---|---|---|---|
| `floating` | 20 | `terrace` lifted plants by `f * room.h * 0.20` with nothing underneath | each tier now stands on a real masonry planting bed, and the lift is capped at 1.25 m |
| `mid-air-drape` | 9 | a curtain met the ceiling plane exactly but hung over open floor | rail shapes go to the nearest **wall** (side wall if it is far enough out, otherwise the back wall), and the drape SDF grew a **rod, two finials and two brackets** |
| `edge-cut` | 3 | the clamp used the prop's **centre** against a frame width computed from `camZ - z` | clamp uses the prop's **own extent**, against a frame width from real **view-space depth** under the pitched camera, evaluated at both the prop's head and its foot |
| `anchor-off-frame` | 1 | a chandelier 3.7 m from a ballroom camera had its ceiling rose above the top of the frame | hanging props are walked back until their fixing is inside the frame; the chandelier SDF grew a ceiling rose |

Also: the aspect ratio in the layout clamp was hard-coded `16/9`; it now takes the live
`camera.aspect`, floored at 16:9 so a *wider* window can never push a prop outward (the
layout is computed once at `setMood()` and a resize never re-runs it). Hanging props are
swapped for a floor shape in the three open-air regions — a drape against the stars is a
rectangle floating in the sky. Contact shadows sit at the prop's **own base** rather than
at y=0.015, and are keyed off `hang` rather than the old `p.y < 1.2` proxy. Drapes are
sized to the wall (58-86% of the ceiling) instead of to the region's generic prop height,
which in the Nursery meant a 1.3 m panel in a 4.8 m room.

### Seventeen rooms, not fourteen (structural cross-correlation)

Taming the props cost structural variety: xcorr went 0.32 -> 0.37 in the first pass,
because once the props stop clipping, the shared vignette-plus-wall-band profile
dominates every frame. Two fixes, both honest art direction:

* **Vignette varies per region** (0.88-1.46) instead of every room sharing ~1.26.
* **Seven cameras were separated.** `kitchens`/`kennels` measured 0.79 — two low wide
  boxes shot on the same lens from the same eye height. The Kennels is now a room you
  look *down* into (eye 2.55, look 1.05); the Ballroom went wide and high; the Nursery
  low and close; Sleeping long and level; the Pumpkin Grounds close and wide against the
  Graveyard's distance; the Bathhouse close and steamy; the Heart a long 33-degree dolly
  into the dome.

Result: **0.31 mean, 0.66 max** — better than the before build on both.

## 3. `impact()` — hit size and photosensitivity are now separate

The combat scene had to hand-gate three separate bloom leaks because `strength` did two
jobs. New signature:

```js
atmosphere.impact(pos, {
  strength = 1,   // HOW BIG THE HIT IS, 0..2. Sparks, ring radius, shake magnitude.
                  // Never gated: a 26-damage hit must read as one at every setting.
  light,          // HOW MUCH IT LIGHTS THE ROOM, 0..1. The point-light flare, the
                  // screen flash and spark brightness — every photosensitive channel
                  // and nothing else. Defaults to min(strength, 1), so every existing
                  // caller is byte-identical. Pass 0 for "big hit, do not flash".
  color,          // hex or css string
  shake = true,   // still respects Save.settings.screenShake inside stage.shake
  burst = true,   // emit sparks at all (shape, not brightness)
})
```

`pos` is unchanged: a `THREE.Vector3` in world space, or `{x, y}` in CSS pixels.

**The accessibility gate now lives in one place.** `Atmosphere._lightGate()` multiplies
`light` by `Save.settings.flashes` (0..1) and caps it at 0.2 when `reduceMotion` is on —
which is what that toggle's own hint ("overrides the settings above") already promised.
Everything downstream reads the gated number:

* the flare point light is `2.2 * light` and is skipped entirely below 0.001 (round 2 had
  it at `2.2 * strength`, completely ungated — that was the +22% whole-frame luminance a
  6-damage Bite produced with Flashes at 0%);
* the spark burst keeps its `strength`-driven count and spread but scales brightness
  `0.16 + 0.84 * light`, and is dropped below 0.18;
* `stage.flash` only fires at `light >= 0.35`.

**For combat-scene:** the `_bloomGain()` workaround, the `Math.max(0.001, strength)`
floor and the `burst: bloom > 0.2` guard can all go. The call becomes

```js
ctx.atmosphere.impact(c, {
  strength: 0.12 + 1.38 * dmgK * dmgK,   // damage, unmodified — shake and sparks
  light:    0.12 + 1.38 * dmgK * dmgK,   // or a smaller number for a quiet big hit
  color, shake: false,
});
```

and the settings are honoured without the scene knowing they exist. I own
`fx/atmosphere.js` only — the combat-scene edit is for its owner or the integrator.

**Measured**, whole-frame mean luminance, a `strength: 1.6` impact in the showcase Foyer,
each case with its own baseline taken immediately before the hit
(`shots/imp-{a,b,c,d}-{base,hit}.png`):

| | mean luma | lift | pixels above L192 |
|---|---|---|---|
| Flashes 100%, reduced motion off | 55.40 -> 64.94 | **+17.2%** | 3.07% -> 6.78% |
| Flashes 0% | 56.10 -> 56.74 | **+1.1%** | 2.95% -> 2.88% |
| Reduced motion ON | 57.03 -> 57.57 | **+1.0%** | 2.90% -> 2.91% |
| caller passed `light: 0`, settings untouched | 56.19 -> 56.08 | **-0.2%** | 2.72% -> 2.70% |

Round 4 of combat-scene measured +22% with **no response at all** to either setting. The
~1% residual at zero is `stage.ripple`, a screen-space distortion ring that displaces
pixels rather than adding light; it is gated by `reduceMotion` on its own.

## 4. The measurement (`tools/lookmetrics.py`)

Round 2 measured "props" as two fixed rectangles, which are mostly wall. This round the
tool captures each region **four times** and differences them:

```
A  everything                   propMask = |A-B| > 6, minus creaMask
B  props hidden                 creaMask = |A-C| > 6
C  creature hidden              light    = |A-D| > 45   (excluded from both)
D  flames and shafts hidden
```

Four things had to be fixed before the numbers meant anything, and each one was silently
producing a wrong answer first:

1. **The title screen pauses the stage.** A paused stage draws one frame per 150 ms of
   *clock* time; with the clock frozen for a measurement that is zero frames, forever, and
   every isolated layer screenshot came back byte-identical to the one before it. The
   showcase now unpauses on mount — it owns the canvas.
2. **The camera never stops moving.** Idle parallax, flame flicker and particle drift run
   continuously, so two screenshots 160 ms apart differ *everywhere*: the first attempt
   measured a 500,000-pixel "creature" that was really the whole frame having moved.
   `clock.scale = 0` freezes dt and t while the render loop keeps drawing.
3. **Freezing catches the flicker at a random phase.** Two captures of the same build
   measured the actor's peak 14 apart on that alone. `MM.showcase.steady()` drops every
   lamp's flicker and settles it on its authored intensity.
4. **A flame is neither a prop nor a creature.** Props are alpha-blended with
   `depthWrite: false` and the flame and shaft billboards draw additively after them, so
   a candle at a lamp post's lantern writes a near-white pixel that the difference
   attributes to the *prop*. Round 2 deliberately made the flame the one thing in frame
   that clips; it is excluded from both sides.

Plus a 2-pixel erosion of both masks. Props are alpha-blended and the frame renders at
0.8 scale and upsamples, so every silhouette has a border of part-prop, part-wall pixels
— and in a room with a bright wall those borders *were* the measured "peak of the prop
layer". Applied identically to both masks, so it cannot favour either.

Two peaks are reported: the **99.5th percentile** (comparable to round 2) and the **mean
of the brightest 400 pixels**, which does not depend on how many pixels a mask happens to
hold — the prop mask runs 3-40x the creature mask, and a percentile quietly favours the
bigger population. A region passes only if the creature wins on **both**.

---

## 5. Measured, before -> after

Showcase, all 17 regions, medium tier, real GPU (`ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11)`). The "before" is
HEAD reverted and re-captured through the identical harness, so this is like-for-like,
not round 2's numbers quoted from a different methodology.

### Prop peak vs creature peak, 1600x900

| region | prop p99.5 | creature p99.5 | headroom | prop top-400 | creature top-400 | headroom |
|---|---|---|---|---|---|---|
| foyer | 236 -> **181** | 105 -> **221** | -131 -> **+40** | 242 -> **186** | 102 -> **220** | -139 -> **+34** |
| nursery | 248 -> **193** | 137 -> **218** | -111 -> **+25** | 250 -> **200** | 129 -> **221** | -120 -> **+21** |
| greenhouse | 252 -> **185** | 222 -> **244** | -30 -> **+59** | 254 -> **195** | 202 -> **242** | -52 -> **+47** |
| crypt | 251 -> **171** | 179 -> **250** | -72 -> **+79** | 252 -> **175** | 197 -> **252** | -56 -> **+77** |
| ballroom | 253 -> **128** | 50 -> **172** | -203 -> **+43** | 255 -> **145** | 49 -> **170** | -206 -> **+25** |
| lampworks | 254 -> **155** | 56 -> **181** | -198 -> **+25** | 255 -> **161** | 55 -> **180** | -199 -> **+18** |
| bathhouse | 253 -> **140** | 22 -> **159** | -231 -> **+20** | 254 -> **142** | 22 -> **158** | -232 -> **+15** |
| pumpkin | 239 -> **173** | 66 -> **221** | -172 -> **+48** | 241 -> **176** | 65 -> **220** | -176 -> **+44** |
| heart | 240 -> **174** | 17 -> **195** | -223 -> **+21** | 246 -> **180** | 17 -> **193** | -229 -> **+13** |
| graveyard | 250 -> **162** | 55 -> **217** | -194 -> **+55** | 250 -> **161** | 54 -> **216** | -197 -> **+55** |
| study | 244 -> **183** | 114 -> **241** | -130 -> **+58** | 245 -> **191** | 109 -> **240** | -136 -> **+49** |
| attic | 237 -> **151** | 54 -> **209** | -183 -> **+58** | 243 -> **163** | 53 -> **206** | -189 -> **+43** |
| kitchens | 245 -> **168** | 60 -> **196** | -185 -> **+28** | 248 -> **172** | 60 -> **196** | -189 -> **+24** |
| sleeping | 253 -> **164** | 214 -> **207** | -38 -> **+43** | 255 -> **177** | 223 -> **205** | -32 -> **+28** |
| hedge | 246 -> **185** | 135 -> **223** | -111 -> **+38** | 249 -> **188** | 116 -> **221** | -133 -> **+33** |
| passages | 252 -> **180** | 219 -> **197** | -32 -> **+17** | 253 -> **185** | 213 -> **197** | -40 -> **+13** |
| kennels | 254 -> **129** | 51 -> **172** | -203 -> **+43** | 255 -> **156** | 58 -> **172** | -197 -> **+16** |

**Prop outshines creature: 17/17 -> 0/17.** Smallest surviving margin +13 (heart /
passages on top-400); largest +77 (crypt).

### Round-2 metrics, held

| | before (HEAD, this harness) | after | target |
|---|---|---|---|
| mean luma | 61.61 | 55.42 | — |
| median luma | 42.76 | **39.21** | >= 28 |
| p95 luma | 189.91 | 165.35 | — |
| mean chroma | 57.19 | **55.52** | >= 42 |
| shadows L<32 | 39.93% | 43.26% | — |
| mid-tones 64-160 | 27.01% | **27.02%** | >= 20% |
| highlights L>192 | 5.06% | 3.01% | — |
| xcorr mean | 0.32 | **0.31** | < 0.35 |
| xcorr max | 0.74 | **0.66** | — |

The frame is 10% darker on the mean and that is the point: `p95` 190 -> 165 and highlights
5.06% -> 3.01% is the props coming out of clipping, while **mid-tones are unchanged** at
27% and the median stays 11 above its floor. Nothing was traded away to buy the headroom.

### The same run at 1920x1080

Every region re-captured at 1920x1080. **0/17 prop-wins, 0 placement defects**, and the
aggregates track the 1600x900 figures within a point: mean 55.3, median 39.1, p95 165.5,
chroma 55.46, mid-tones 26.66%, highlights 3.01%, xcorr mean **0.31** / max **0.65**.
Smallest margin +12.3 (heart, top-400), largest +76.7 (crypt).

| region | prop top-400 | creature top-400 | headroom |
|---|---|---|---|
| foyer | 186 | 222 | +36 |
| nursery | 199 | 229 | +30 |
| greenhouse | 196 | 245 | +49 |
| crypt | 176 | 253 | +77 |
| ballroom | 152 | 172 | +20 |
| lampworks | 163 | 180 | +17 |
| bathhouse | 142 | 159 | +17 |
| pumpkin | 181 | 221 | +40 |
| heart | 180 | 192 | +12 |
| graveyard | 161 | 217 | +55 |
| study | 194 | 242 | +48 |
| attic | 165 | 213 | +48 |
| kitchens | 173 | 198 | +26 |
| sleeping | 177 | 212 | +35 |
| hedge | 190 | 222 | +32 |
| passages | 185 | 207 | +22 |
| kennels | 156 | 175 | +19 |

### Prop placement audit, both resolutions

| | 1600x900 | 1920x1080 |
|---|---|---|
| before | **31 defects / 448 props** — 20 floating, 9 mid-air drapes, 3 edge-cut, 1 anchor off-frame | **31 / 448**, the same set |
| after | **0 / 470** | **0 / 470** |

The defect set is identical at both resolutions in the before build, which is worth
recording: the brief expected a resolution-dependent failure and the audit says the
placement bugs were resolution-*independent* — the geometry was wrong, not the framing.
What *was* resolution-dependent was the clamp that was supposed to prevent them (a
hard-coded 16:9 and a `camZ - z` depth), so the same bug would have widened on any
non-16:9 window. Both are fixed.

`MM.showcase.audit()` returns this live, per region, at whatever the current viewport is:
`{ w, h, region, props, room, bad: [{ shape, hang, x, y, z, w, h, rect, flags }] }`.

### Performance and gates

* **61 fps** in combat at 1600x900 and **61 fps** at 1920x1080, on `ANGLE (Intel,
  Intel(R) UHD Graphics (0x00009A60) Direct3D11)` — the real GPU, `tools/shot.py`
  reports `software: false`. Measured one Playwright run at a time (trap 7).
  Round 3 adds no draw calls and no new material: four extra scalar uniforms, one extra
  varying, and roughly a dozen ALU instructions in the prop fragment shader. Shots:
  `shots/r3-combat-1600.png`, `shots/r3-combat-1080.png`.
* `tests/seams/check.py` — 1604 call sites, **0 problems**.
* `tests/scene-css/check.py` — 10 sheets, 871 classes, **0 conflicts**.

### Screenshots

`shots/zz-r3-regions-after.png` vs `shots/zz-r3-regions-before.png` (17-region contact
sheets). Per region: `shots/lm_r3after_<region>.png` (1600x900),
`shots/lm_r3after1080_<region>.png` (1920x1080), and the matching `lm_r3bef16_*` /
`lm_r3bef1080_*`. Layer isolations are `__np` (no props), `__nc` (no creature),
`__nf` (no flames or shafts).

---

## 6. Known gaps, honestly

* **The showcase stand-in is a proxy, not an enemy.** It is a `MeshStandardMaterial`
  capsule, and in the shipped combat scene enemies are DOM SVG sprites composited *over*
  the canvas at full brightness — so the real headroom is larger than the table says.
  The proxy is still the right instrument: it is the only thing in the frame that is
  lit by the same rig the props are, so it measures the ratio the reviewer complained
  about. If `ui/enemy.js` ever moves to WebGL these numbers become the literal answer.
* `MESH_K` 0.17 -> 0.95 makes every mesh any agent has already added to the scene about
  five times brighter. Nothing in the tree adds one today except the showcase, but it is
  a behaviour change and it should be looked at if a scene starts using real geometry.
* Seven region cameras moved to break structural correlation. Combat positions its
  enemies in DOM space, so framing of the cast is unaffected, but the **Kennels now
  looks downward** (eye 2.55 m, look 1.05 m) and that is a visibly different composition
  from round 2. It is deliberate: an animal ward is a room you look down into, and it
  took `kitchens`/`kennels` from 0.79 correlation to well under the pack.
* `propCeil` is authored per region and is the one number that will need re-tuning if
  anybody changes a region's `exposure` or `bloom`. `bloom` runs *after* the shader, so
  the ceiling is a guarantee about the material and not about the final pixel; it holds
  the peak roughly 15-20 luma below where it would otherwise land in high-bloom rooms.
* `tools/lookmetrics.py` is owned by foundation. I extended it (layer isolation, the
  audit, the two peak statistics, the freeze/steady harness) because the brief asked for
  it; `tools/shot.py` was not touched.
