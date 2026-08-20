## 2026-08-20 — performance: frame budget on real hardware

Target GPU for every number here: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60)
Direct3D11 vs_5_0 ps_5_0, D3D11)` — real hardware, integrated. Not SwiftShader.
`tools/shot.py` prints the renderer string on every run and flags software
rasterisation, so this can always be checked.

### 0. How this was measured, and one trap

`EXT_disjoint_timer_query_webgl2` is available on this stack and is the only
truthful timer for it. **`gl.finish()` is not a fence under ANGLE** — the commands
sit in Chrome's GPU process, and timing `performance.now()` around `finish()`
reported **0.217 ms for a frame the timer queries measured at 24.1 ms**. Any
profiling built on `finish()` here is measuring nothing.

The converse trap: timer queries are only trustworthy with the clock stopped. In a
live page they pick up the compositor's work for neighbouring frames (canvas
upscale blit, DOM layers) and reported 18.8 ms for a frame that measured 4.4 ms
under a controlled probe. So: **timer queries for the per-pass bisection, rAF
interval for anything closed-loop.** The tier calibration uses rAF for that reason.

New tools: `tools/gpuprof.py` (per-pass GPU cost bisection) and
`tools/lookmetrics.py` (17-region capture + the round-2 look metrics, so a perf
change can be proved not to have flattened the lighting).

### 1. Where the frame actually went

Combat, 1600x900, whole frame 24.14 ms => 41 fps ceiling, 34-35 fps observed.
Only 14 draw calls and 132 triangles, so this is 100% fragment cost.

| item | ms | note |
|---|---|---|
| **near frame quads** | **4.21** | 4 full-viewport quads, see section 2 |
| grade pass | 4.50 | |
| bloom pass | 2.64 | |
| RenderPass + OutputPass blits | 2.23 | |
| far wall | 2.15 | |
| floor | 1.78 | |
| ceiling | 1.57 | |
| side walls | 1.13 | |
| props | 0.59 | |
| shafts / flames / contact shadows / particles | ~0.0 | each below noise |

**The post chain is bandwidth-bound, not ALU-bound.** Zeroing `uHalation`,
`uDirt`, `uGrain` and `uAberration` one at a time each moved the grade pass by
less than the measurement noise (-0.75 to +0.22 ms, i.e. nothing). The cost is
reading and writing a 1600x900 RGBA16F target. That single fact set the whole
strategy: **remove full-resolution passes and remove pixels, do not micro-optimise
shader arithmetic.**

### 2. The near frame was drawing the whole screen four times, for nothing

`backdrop.js` built four `PlaneGeometry(7.4, 4.2)` quads at z = 7.2, about 2.2 m
from the eye, with `depthTest: false` and `frustumCulled = false`. Each one
rasterised the entire viewport and ran `FRAME_FRAG`, which opens with an `mmFbm3`
before it can reach its `discard`.

A frozen-clock screenshot bisection (toggle one quad, re-render, diff) showed:

| quad | mode | visible pixels |
|---|---|---|
| 0 | left drape | **none — 0.00%** |
| 1 | right drape | **none — 0.00%** |
| 2 | top lintel | 37.99%, rows 0-462 |
| 3 | clutter band | **none — 0.00%** |

Three of the four were provably invisible in the frustum and were still costing a
full-screen noise shader each.

Each mode only ever marks a narrow band of its own quad, and those bands are
analytically bounded (`mmFbm3 <= 0.9625`, `mmRidge <= 0.9375`). The geometry is now
cropped to that band with the uv attribute remapped so the shader still sees its
original 0..1 range — `FRAME_FRAG` is untouched, and the crop only removes
fragments whose mask was provably zero. Frustum culling is now on, so in most
camera rigs the three invisible quads are not submitted at all.

Verified identical: frames contribution before 26.85 mean / 37.61% / bbox
(0,0,1599,467), after 27.39 mean / 37.98% / bbox (0,0,1599,465) — the residual is
flame flicker between runs. **4.21 ms -> 0.69 ms.**

### 3. Four tiny buffer uploads were stalling the pipeline for 8.5 ms a frame

This one only shows up with the clock running, so a clock-stopped per-pass profile
misses it entirely. Stubbing `Backdrop.syncFlames()` took the median live frame
from **25.0 ms to 16.5 ms**.

`syncFlames` sets `needsUpdate = true` on four `InstancedBufferAttribute`s every
frame. `MAX_FLAMES` is 10, so that is 90 floats of actual data. three defaults
BufferAttributes to `StaticDrawUsage`; ANGLE backs GL_STATIC_DRAW with a D3D11
DEFAULT-usage buffer, and `bufferSubData` on one of those is an
`UpdateSubresource` that must wait for every queued draw still reading it. Four
of them per frame is four full pipeline syncs.

Two fixes, both in `backdrop.js`:

* `setUsage(THREE.DynamicDrawUsage)` on the flame attributes (and on the actor
  shadow attributes, which have the same per-frame update pattern) so the driver
  renames the buffer instead of syncing.
* Dirty-check each array. Only `aParam.y` (the flicker) changes on a normal frame
  — position, colour and seed are fixed per region and were being re-uploaded
  60 times a second for nothing.

**This was the single largest win in the pass** and it is invisible to any
GPU-pass-level profile. Worth remembering for the next one.

### 4. OutputPass folded into the grade

`renderer.toneMapping` is only applied by three when a material renders straight to
the canvas (`_currentRenderTarget === null`), which is why OutputPass exists at
all: ACES filmic + sRGB encode and nothing else, at full resolution.

The grade shader now does both itself under `#define MM_TONEMAP` — the same three
maths in the same order — and OutputPass is gone. That deletes a whole
full-resolution read+write from a chain that is bandwidth-bound. The warm-up's
phase B still works: with bloom and grade disabled, RenderPass becomes the last
enabled pass and goes straight to the canvas, where three applies its own tone map,
so the early picture is still correctly exposed.

### 5. The composer never had a pixel ratio (latent bug on any HiDPI display)

`EffectComposer` captures `renderer.getPixelRatio()` **at construction** and
`setSize()` never updates it. `Stage` built the composer before the first
`resize()`, so the composer's ratio was pinned at 1 forever while
`renderer.setPixelRatio(dpr)` went to 2 on a retina display: the scene rendered
into a 1x target and was blitted to a 2x framebuffer. Blurry, and silent. `resize()`
now drives `composer.setPixelRatio()` explicitly alongside the renderer's.

Related: the old `resize()` honoured `devicePixelRatio` up to 2, i.e. **4x the
fragments** on a HiDPI laptop, for a soft procedural backdrop sitting behind DOM
text that gains nothing from it. `dprCap` is now a tier property.

### 6. Quality tiers

`renderer.js` exports `QUALITY_TIERS` and `detectTier()`.

| | renderScale | dprCap | bloomScale | halTaps | dirt | particles |
|---|---|---|---|---|---|---|
| high | 1.00 | 2.00 | 0.50 | 8 | on | 1500 |
| medium | 0.80 | 1.50 | 0.50 | 6 | on | 1100 |
| low | 0.62 | 1.00 | 0.25 | 4 | off | 650 |

`renderScale` scales the WebGL drawing buffer only; the UI is DOM and stays
pixel-crisp at every tier. Measured response at 1600x900 (combat, whole frame):
scale 1.00 -> 22.9 ms, 0.75 -> 9.66 ms, 0.50 -> 4.42 ms. Superlinear, because the
intermediate RGBA16F targets stop fitting in cache.

**Selection**: renderer string + requested pixel count picks a starting tier
before anything is compiled (SwiftShader/llvmpipe -> low; discrete NVIDIA/AMD/Apple
-> high; Intel/Mali/Adreno/PowerVR -> medium; > 2.6 Mpx drops one tier). Then,
*after* warm-up so the frames being measured are the frames the player gets,
`_calibrate()` measures the median rAF interval and trims a continuous
`_scaleAdjust` (0.55..1.0) until the frame fits 17.2 ms, keeping a reduction only
if it actually paid. Only `_scaleAdjust` moves there — changing tier would
recompile the grade in the first visible second, which is the exact long task the
warm-up exists to avoid.

**Manual override**: `stage.setTier('high'|'medium'|'low'|'auto')`, persisted to
`Save.settings.quality`. Verified across a reload. NOTE: `quality` is not in the
`DEFAULT.settings` block in `core/save.js` — it round-trips correctly because
`save()` serialises the whole object and `deepMerge` copies unknown keys back, but
it should be added there so an options screen has something to bind to.

Particle budget is a draw-range change, never a buffer rebuild, so switching tier
cannot relink a shader. BURST particles were moved to the FRONT of the buffer so
trimming the tail can only ever trim ambient drift, and the ambient type mix is now
interleaved with a golden-ratio sequence rather than laid down in contiguous
blocks — with blocks, a 73% budget kept 1100 dust motes and dropped every wisp and
ember, which are the whole point of the mix.

### 7. Results

fps, one run at a time, nothing else running:

| scene | 1600x900 before | after | 1920x1080 before | after |
|---|---|---|---|---|
| title | 29 | **61** | 14 | **61** |
| combat | 35 | **61** | 17 | **61** |
| clubhouse | 35 | **61** | 16 | **61** |
| map | 47 | **61** | 21 | **61** |

The other six scenes (select, reward, event, shop, rest, gameover) are also 61 at
1600x900, no JS errors.

Per-pass, combat at 1600x900 (timer queries, clock stopped; after = medium tier,
1280x720 buffer):

| item | before | after |
|---|---|---|
| **whole frame** | **24.14** | **14.01** |
| scene render | 14.71 | 7.07 |
| pass plumbing (RenderPass + OutputPass blits) | 2.23 | 0.03 |
| near frame quads | 4.21 | 0.69 |
| far wall | 2.15 | 1.56 |
| floor | 1.78 | 1.37 |
| ceiling | 1.57 | 1.41 |
| side walls | 1.13 | 0.86 |
| props | 0.59 | 0.63 |

At 1920x1080 the whole frame went **46.46 ms -> 17.47 ms** and the scene render
**29.12 ms -> 10.56 ms**. (Isolated bloom/grade figures are not additive — disabling
a pass also removes an intermediate buffer read+write — so the whole-frame number
is the one to trust.)

### 8. The look held

17-region showcase at 1600x900 via `tools/lookmetrics.py`, same methodology as the
round-2 pass (Rec.709 luma on 8-bit sRGB; chroma = mean max-min; cross-correlation
= Pearson on a brightness- and contrast-normalised 128x72 luma downsample).

| | round 2 | now (auto = medium) | now (low) | target |
|---|---|---|---|---|
| mid-tones 64-160 | 22.7% | **24.9%** | 24.7% | >= 20% |
| median luma | 33.7 | **38.6** | 38.5 | >= 28 |
| mean chroma | 52.4 | **54.3** | 53.9 | >= 42 |
| region cross-correlation | 0.296 | **0.30** | 0.30 | < 0.35 |
| mean luma | 53.8 | 57.3 | 57.3 | |
| p95 luma | 182.0 | 183.6 | 183.1 | |
| highlights > L192 | 4.2% | 4.4% | 4.4% | |
| shadows < L32 | 48.2% | 43.5% | 43.2% | |

Every target met, at the low tier as well as the auto one — the metrics are
statistical over pixels, and nothing here turned a light off. Contact sheets:
`shots/lm_med_*.png`, `shots/lm_low_*.png`.

### 9. Long tasks

| scene | longest | WebGL warm-up | longest with `#dom-layer` hidden |
|---|---|---|---|
| title | **3435 ms** | 6318 ms | **123 ms** (warm-up 215 ms) |
| combat | 437 ms | 199 ms | 265 ms |
| clubhouse | 73 ms | 205 ms | 74 ms |
| map | 325 ms | 209 ms | 264 ms |

WebGL warm-up is **194-215 ms** on every scene (round 2 measured 2599-2949 ms under
SwiftShader), and the longest WebGL-attributable long task is ~123 ms. Under the
500 ms target everywhere.

Title's 3435 ms is **entirely DOM** and is what stretches its warm-up to 6.3 s — the
warm-up yields with `setTimeout(0)` between compiles, and each yield has to wait
for the DOM task in front of it. See section 10.

### 10. Not mine to fix — needed from other owners

**a) `scenes/title.js` + `title.css`: the 3.4 s stall.** Cause isolated by
disabling one thing at a time:

| variant | longest long task |
|---|---|
| baseline | 3257 ms |
| `filter:none` on `.ms-win-bloom ellipse` + `.ms-doorglow` | **429 ms** |
| all `.scene--title` animations off | **72 ms** |
| `.ti-house` hidden | **77 ms** |
| `.ti-fog`, `.ti-clouds` hidden | 3267 ms (no change) |

`title.css:107-111` — `.ms-win-bloom ellipse { filter: blur(13px); animation:
ti-flicker 4.1s }` and `.ms-doorglow { filter: blur(15px); animation: ti-flicker
3.1s }`. `ti-flicker` only animates `opacity`, which would normally be
compositor-only — but these are SVG child elements, which cannot be promoted to
their own layer, so the browser re-runs a 13-15 px blur over a large SVG surface on
the main thread every frame, once per lit window. Fix: move the glow into a sibling
HTML element that carries the blur statically and animate its opacity there
(`will-change: opacity`), or bake the glow as a static radial-gradient so the
opacity animation is compositor-only. Keep the animation on `.ms-win-lit path`,
which has no filter and is cheap.

**b) `scenes/title.js:171` — `ctx.atmosphere?.setMood?.('foyer')`.** There is a
fully authored `title` region in `fx/atmosphere.js:580` (exterior night, moon and
halo, roofline with window spill, candle pools) and nothing uses it.

**c) `title.css:13` `.ti-sky` — I did NOT make it transparent, deliberately.**
Its third background layer is an opaque `linear-gradient(180deg, var(--ink-900) ...)`
covering the viewport, so the WebGL layer behind it is 100% hidden. I rendered the
proposed fix (transparent sky + `setMood('title')`, `shots/ti_fix.png`) and it looks
**worse** than the current screen: the WebGL exterior's gold horizon fights the
purple-night SVG art, and you get a second, duplicate moon. The SVG title art is
good and is clearly the intended design. So the right fix for the title is the other
option — don't run the 3D stage — see (d).

**d) Nine of the ten scenes render a 3D frame nobody sees.** Measured by
screenshotting each scene with and without `#gl` displayed and diffing:

| scene | canvas pixels actually visible |
|---|---|
| combat | 75.68% |
| title | 3.43% |
| gameover | 1.06% |
| shop | 0.82% |
| select | 0.57% |
| rest | 0.07% |
| clubhouse | 0.06% |
| event | 0.01% |
| map | **0.00%** |
| reward | **0.00%** |

(The sub-1% figures are animation noise between two page loads, not real canvas.)
`Stage.setPaused(true/false)` is now available for this: it skips the composer but
still emits one frame every 150 ms, because skipping the draw entirely can leave the
compositor with no damage to present and a page that never presents can have its rAF
starved — observed once as a 2.5 s stall on `reward`, which would freeze the clock
that drives the DOM animations too. Verified with the keepalive: pause and resume on
map / reward / clubhouse hold a 16.6-17.0 ms median with no dropped frames.

Each occluded scene needs `ctx.stage.setPaused(true)` on enter and
`setPaused(false)` on exit. Not urgent for the frame budget — everything is at 61
already — but it is most of the GPU work in the build being thrown away, and it is
what buys headroom on hardware weaker than this.

**e) `core/save.js`** — add `quality: 'auto'` to the `DEFAULT.settings` block, per
section 6.

### Screenshots

`shots/fin_*_900.png` / `shots/fin_*_1080.png` (final fps sweep),
`shots/lm_med_*.png` and `shots/lm_low_*.png` (17-region look metrics, medium and
low tiers), `shots/ti_fix.png` (the rejected transparent-sky title),
`shots/frz_a.png` / `frz_b.png` (frozen-clock near-frame bisection).


---
