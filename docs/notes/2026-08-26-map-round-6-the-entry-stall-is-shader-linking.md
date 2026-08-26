# 2026-08-26 — map round 6: the entry stall is shader linking, and it is not the map's

Brief: "the map feels slow", ~4.7 s of blocked main thread clustered around map entry,
attributed by a `long-animation-frame` observer to `data/companions/keywords.js` and to
`core/clock.js:step`. Targets: no frame over 120 ms from page load to settled, map
interactive within 1.5 s, steady state 61 fps, no look regression.

Everything below is measured on the target machine —
`ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
one Playwright run at a time, every rAF sampled from page start.

---

## 0. Two corrections to the brief, both load-bearing

**The stall is not specific to the map.** The brief says
`#scene=gameover&result=victory` is 61 fps from t+2 s, so the map is the outlier. It is
not: sampling every rAF from page start on the *gameover* deep link gives

```
t+ 6261ms   1950ms
t+ 8227ms    117ms
t+ 8361ms    500ms
t+ 8861ms   1983ms
t+10844ms    183ms
...
8 gaps > 60ms, total 5283ms blocked
```

against the map's 5467 ms. The two are the same stall to within run-to-run noise. "61 fps
from t+2 s" was measured from two seconds into the *scene*, which on a cold load is still
inside the boot stall — the fps average recovers long before the blocking does. Reading
the gap table instead of the average is exactly the point the brief makes, and it applies
to the control as well as to the subject.

**The LoAF attribution was a red herring, and so was timing the modules cold.**
`data/companions/keywords.js` really does cost 88–107 ms of module evaluation, and it
really is the first script in that frame, but it is 5 % of a 1979 ms frame. Timing modules
in isolation could never have found this, because *no JavaScript is running* for most of
the 4.7 s.

## 1. What the work actually is: `gl.getProgramInfoLog` under ANGLE

A CDP CPU profile over the first 15 s of the map deep link:

```
-- SELF time top 5 --
  8770.3 ms  (idle)
  4974.8 ms  onFirstUse            vendor/three.module.js:20241
   736.4 ms  (program)
   122.4 ms  WebGLRenderer.setSize
    40.8 ms  Audio                 src/audio/audio.js:36
```

`onFirstUse` is three.js's deferred program finalisation. Wrapping every WebGL2 entry
point and recording anything over 3 ms:

```
blocking GL calls >3ms, total by call:
   4194.3 ms  getProgramInfoLog
     13.8 ms  getProgramParameter
```

`renderer.debug.checkShaderErrors` defaults to `true`, so `onFirstUse` calls
`gl.getProgramInfoLog(program)` before anything else. On D3D11 through ANGLE that call is
where the driver's deferred link and HLSL translation are forced to complete, and on this
GPU **one program costs 400–750 ms**. Twenty-six programs are created during boot.

Stubbing `getProgramInfoLog` to return `''` does **not** help — the identical 4.9 s
reappears under `getProgramParameter(LINK_STATUS)`. So `checkShaderErrors = false` is not
the fix; the link is genuinely synchronous at that point.

### Why the warm-up does not prevent it

`core/renderer.js` already has a careful `_warmup()` that calls `compileAsync` one mesh
per task specifically so `KHR_parallel_shader_compile` (present on this stack) can link in
the background. Stack traces on every `createProgram` and every blocking query show why it
never gets the chance:

```
t+6333 CREATE #1   ... at prepareMaterial ... at WebGLRenderer.compileAsync
t+6336 link   #1     0.1ms
t+6342 BLOCK  #1   732.7ms getProgramInfoLog
                   at onFirstUse ... at setProgram ... at WebGLRenderer.render
t+7078 CREATE #2   ... at getProgram ... at setProgram ... at WebGLRenderer.render
t+7079 BLOCK  #2   417.0ms getProgramInfoLog
```

Program #1 is created by `compileAsync` and then blocked on **six milliseconds later** by
a `WebGLRenderer.render` — before `compileAsync`'s `isReady()` poll can resolve. Every
program after that is created *inside* `setProgram` during that same live render.

The render comes from `Stage.update()`:

```js
// core/renderer.js:520
if (this._warming) { this.renderer.render(this.scene, this.camera); return; }
```

`_warming` is true for exactly the window in which phase A is compiling. The line is meant
to show the room early instead of a black canvas; what it does is race the warm-up and
force every link synchronously, one per frame, at full driver cost. **The warm-up is dead
code in practice.**

### The verified fix (foundation's file — reported, not shipped)

Two changes to `core/renderer.js`, both measured, then reverted from my tree:

```js
// 1. line 520 — do not draw while phase A is compiling.
if (this._warming) return;

// 2. phase A — warm BOTH program variants. A material rendered to the canvas and
//    the same material rendered into a composer target have different program cache
//    keys (outputColorSpace / toneMapping), so warming only the canvas variant left
//    phase C's `composer.render()` to link the whole scene again in one 2.0-2.9 s task.
const prevRT = this.renderer.getRenderTarget();
for (const rt of [null, this.composer.renderTarget1]) {
  this.renderer.setRenderTarget(rt);
  for (const o of objs) {
    try { await this.renderer.compileAsync(o, this.camera, this.scene); }
    catch (e) { /* keep warming */ }
    await yield_();
  }
}
this.renderer.setRenderTarget(prevRT);
```

Change 1 alone: 5467 → 3500 ms blocked. Both: **5467 → 1016 / 1633 / 2116 ms** over three
samples. Every three.js link stall disappears from the timeline.

I did not ship this. `src/core/**` is foundation's.

---

## 2. What the map itself costs, and what I changed

Isolating the scene from the boot (boot to title, wait for `warmStage === 'done'` plus
2.5 s, then `goto('map')`, sampling every rAF), and marking each phase of `enter()`:

```
goto -> enter()            312 ms   veil cover + old scene exit
_css()                     312 ms   <link> round trip, EVERY entry
_buildModel                  5 ms
loadPlanTrace              258 ms   section01.plan.json, 18 KB
assets.image                61 ms   section01.png, after the trace
_buildDom                   64 ms   innerHTML + HUD + _paintGrain
_paintPaper                 25 ms   parchment + traced plan + furniture
_buildInk                    6 ms
_buildNodes                 57 ms   64 nodes, one innerHTML parse each
bind + fit + sync           12 ms
--- armed ------------- t+1098 ms
_whenVisible               899 ms   veil reveal + FIRST RASTER + 3 smooth frames
--- sweep -------------  t+1996 ms
```

The four things I fixed, in order of size:

**a. The stylesheet was re-fetched on every single map entry (312 ms).** `enter()`
appended the `<link>` and `exit()` removed it. Every other scene in the build goes through
`ensureCss()` in `ui/portrait.js`, which never unloads — the map was the only one doing
this, and the map is re-entered after every room, thirteen times a wing. The sheet is now
requested once at module scope (`main.js` imports this module statically, so it loads
during boot alongside everything else) and `exit()` leaves it alone. Safe by the project's
own invariant: `tests/scene-css/check.py` exists precisely because scene sheets are global
and permanent, and it reports 0 conflicts.

**b. Three round trips ran end to end (312 + 258 + 61).** Stylesheet, then trace, then
section PNG. None of them needs the others and `_buildModel` needs no DOM, so the model is
built first and all three requests go out together. The screen is gated on the slowest,
not the sum.

**c. The grain tile was re-encoded every entry (39 ms).** `_paintGrain` filled a 180×180
`ImageData` from a *fixed* seed and ran `toDataURL('image/png')` — a PNG encode plus a
decode — to produce a bitmap byte-identical to the last one. Built once per page now.

**d. Sixty-four `innerHTML` parses became one.** `createMapNode` built a `<button>` per
node; `mapNodeMarkup()` in `ui/mapnode.js` now returns the same node as a string,
placement included, and `_buildNodes` hands the browser one string. 57 → 23 ms.
`createMapNode` is kept as a one-node wrapper over it.

**e. One frame between the paper and the marks.** The whole screen was built in a single
137 ms task — over the 120 ms budget by itself — and the compositor got all of it to
raster at once. `enter()` now yields one frame after `_paintPaper()`, which is what the
armed state wants anyway ("leaving the parchment PAINTED here is deliberate"). The map's
own longest task is now **70–86 ms**, and the peak raster frame dropped 683 → 517 ms. The
frame is spent behind the transition veil, where a frame is free.

### Result — map scene entry, cold, post-boot, 1600×900, two paired samples each

| | before | after |
|---|---|---|
| route visible (`is-drawing`) | 1998 / 2002 ms | **1655 / 1675 ms** |
| fully drawn | 2868 / 2839 ms | **2490 / 2509 ms** |
| worst frame | 683 / 683 ms | **517 / 517 ms** |
| map.js longest task (LoAF) | 137 ms | **70–86 ms** |

---

## 3. The entrance sweep was running at 40 fps

Measuring only the frames between `is-drawing` and `is-drawn`, on a warm re-entry so the
cold cost is excluded:

```
before   40 frames   median 16.7   p90 33.4   max 50.0   15 frames over 33ms
after    50 frames   median 16.7   p90 33.3   max 33.4    5-6 frames over 33ms
```

`mm-wipe` animates `clip-path` on `.map-ink` (a 2030×1010 SVG) and `.map-nodes` (64 mark
subtrees). Neither had a compositor layer — `will-change: clip-path` was set, and
**`will-change: clip-path` does not promote anything** — so every frame of the wipe
repainted both on the main thread.

Bisecting by injecting CSS before a warm entry, removing **any one** of the three entrance
animations cleared it completely, which is the signature of a frame-budget problem rather
than one bad property. Blend modes were innocent: forcing `mix-blend-mode: normal` on the
wet edge, the lamps and the grain changed nothing (13 over-33 frames, same as baseline).
`transform: translateZ(0)` on the two clipped layers took it to 4.

Shipped scoped to `.is-armed` and `.is-drawing` so the layers are handed back afterwards
instead of pinning a 2030×1010 texture in GPU memory for the whole screen. The residual
5–6 frames are the wet edge, whose `mix-blend-mode: multiply` means it can never composite
on its own.

**Warning for the next person: measure this with a fresh browser per case.** Re-entering
the map in the same page makes every later case look better than the first, because the
trace JSON, the section PNG, the stylesheet, the fonts and the GPU's rasteriser programs
are all warm. My first bisect ran nine cases in one page and every one of them "fixed" the
stall. They fixed nothing; they were just second.

---

## 4. What is left, and why I did not remove it

**~520 ms on the first map entry of a session is Chrome's GPU rasteriser compiling its own
shaders.** It has no script attribution in LoAF, it survives deleting every decorative
layer (`min` variant: 533 ms), it survives hiding the paper canvas (567 ms), the ink
(617 ms), the marks (533 ms) and the chrome (467 ms) — no single element owns it — and
critically **it does not scale with viewport**: at 640×400 it is 700 ms, the same as at
1600×900. Hiding `.map-screen` entirely takes it to 117 ms, so it is the map's content and
not the scene machinery. A cold first transition to `reward`, a far simpler screen, costs
417 ms of the same thing.

The decisive test: relaunching with `--disable-gpu-rasterization` drops it from
650–700 ms to **250 ms**. It is Skia's Ganesh backend compiling a GL program per new paint
op — the same ANGLE/D3D11 pathology as §1, at a smaller scale per program. On this machine
it is a per-session, per-paint-op-set toll, and the only way to remove it from the player's
view is to pay it earlier, not to write different CSS. It lands behind the transition veil,
so what the player sees is a longer curtain, not a frozen map.

**The 120 ms target is not reachable on this hardware while any program compiles on the
main thread**, because one three.js link is 400–750 ms on its own. The achievable goal is
the one `_warmup()` was written for: get every compile off the visible timeline. §1 does
that for three.js. Skia's own compiles would need the same treatment (rendering the map's
paint-op vocabulary once, somewhere invisible, during boot) and that is a whole-app change,
not a map one.

---

## 5. Requests for the integrator (files I do not own)

1. **`src/core/renderer.js`** — the two changes in §1. Verified: 5467 → ~1600 ms blocked
   on a cold load. This is the entire "4.7 seconds around map entry" the brief opens with,
   and it is not map-specific: gameover, reward and combat all pay it.
2. **`src/data/companions/keywords.js`** — 88–107 ms of module evaluation on the boot
   critical path, pulled in through `ui/hud.js` → `ui/tooltip.js`. The map does not need
   the card keyword set until something is hovered; a dynamic import inside
   `tooltip.js`'s first `show()` would take it off boot entirely. Worth doing after §1,
   when it stops being 2 % of the problem and becomes 6 %.
3. **`fx/atmosphere.js` / `setMood('blueprint')`** — with §1 applied, three ~120–160 ms
   tasks appear after the sweep (t+12.1–12.4 s) that were previously hidden inside the
   boot stall. The map already defers `setMood` until after the ink is drawn for exactly
   this reason; the remaining cost is the mood's own shader.
4. **CONTRACTS.md, "Traps"** — proposed #10, next to `gl.finish()`:
   *"A GL program link on this ANGLE/D3D11 stack costs 400–750 ms and blocks the main
   thread at first use, inside `getProgramInfoLog` or `getProgramParameter`. Never create
   a program and draw with it in the same task; `compileAsync` + `KHR_parallel_shader_compile`
   only helps if nothing renders in between. Chrome's own rasteriser pays a smaller version
   of the same toll on the first paint of any new screen — confirm with
   `--disable-gpu-rasterization` before blaming your CSS."*

---

## Verification

- `tests/map/run.py` — 23 passed, 0 failed
- `tests/run/run.py` — 50 runs, 0 errors (determinism 5/5, resume 3/3, mid-fight 3/3)
- `tests/seams/check.py` — 1606 call sites, **0 problems**
- `tests/scene-css/check.py` — 10 sheets, 841 classes, **0 conflicts**
- Zero console errors on every `tools/shot.py` run (no `.console.txt` written, exit 0)
- Steady state **61 fps**, 1600×900 and 1920×1080
- Look unchanged: `shots/mapfix_before.png` vs `shots/mapfix_after2.png` (Foyer,
  1600×900) differ on 0.023 % of pixels with a maximum channel delta of **15/255**, none
  above 32; Greenhouse at 1920×1080 differs on 0.006 %, max 14/255. That is GPU
  antialiasing noise — traced linework, graphite route, hazard zones, title block, hover
  cards and the entrance sweep are all intact (`shots/mapfix_hover.png` shows the hover
  card, prewalk trail, legal rings, leaders and zone keys on a walked map).

## Files changed

`game/src/scenes/map.js`, `game/src/scenes/map.css`, `game/src/ui/mapnode.js`.
`game/src/core/renderer.js` was edited only to measure §1 and has been restored.
