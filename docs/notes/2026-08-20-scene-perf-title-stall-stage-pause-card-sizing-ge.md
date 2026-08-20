## 2026-08-20 — scene-perf (title stall, stage pause, card sizing, Gear chips)

Five fixes handed over from the performance engineer's round-3 notes. Four landed
as diagnosed. **One did not reproduce and the report below says so** — the title
screen's long task is not what it was thought to be on this machine.

Hardware for every number here: `ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60)
Direct3D11)`, hardware GL (not SwiftShader), 1600x900 unless stated, cold Chromium
profile per run via `tools/shot.py`.

### 1. The title "3.4 s stall" is the WebGL warm-up, not the SVG blur

The fix was applied anyway (see section 2 — it is correct, and that class of bug can
no longer come back on this screen), but the attribution in the previous section is
wrong for this hardware, and anyone trusting the 3,435 ms figure will chase the
wrong thing.

Ablation, `PerformanceObserver({type:'longtask', buffered:true})`, with the
intervention injected as a `<style>` **before** the work rather than after it:

| variant | longest long task |
|---|---|
| baseline | 2675 ms |
| `filter: none` on `.ms-win-bloom ellipse` + `.ms-doorglow` | 2701 ms |
| `.ti-house { display: none }` | 2637 ms |
| `#dom-layer { display: none }` — the whole DOM gone | **2616 ms** |

Removing every pixel of DOM changes nothing. The earlier ablation almost certainly
measured too late: `tools/shot.py --script` runs at `load + --wait`, and on this box
the Google-Fonts stylesheet holds `load` until ~5.8 s, so a `--wait 4` script fires
at ~9.9 s — well after the long tasks it was trying to influence. Use `--wait 0.05`
and inject CSS, not element styles, if you repeat this.

`long-animation-frame` entries name the real culprits outright:

    LOAF d=2786  scripts=[["FrameRequestCallback","core/clock.js",2637]]
    LOAF d=2291  scripts=[["TimerHandler:setTimeout","",2276]]

The first is the first `composer.render()` reached through `clock.onFrame`; the
second is `Stage._warmup()`, which yields with `setTimeout(0)` between compiles
(`core/renderer.js:338`). Both are shader link time. Render duration on the second
frame is 5 ms. **Not mine to fix — `core/renderer.js`:** one of the warm-up's chunks
still owns ~2.3-2.7 s in a single task on this GPU, against the 194-215 ms the
previous round measured. Whatever profile produced 200 ms had a warm shader cache; a
cold one does not. The chunking is right; the chunks are too big.

Idle frame cost on the title screen was never the problem either: rAF intervals
before the fix were p50 16.7 / p99 18.7 / max 19.1 ms at dpr 1, and p50 16.7 /
p99 19.4 at dpr 2. There was no jank to remove.

### 2. What did change on the title screen

The glow is out of the SVG regardless, because the pattern is a real hazard even
where it is not currently firing, and it costs nothing to be right:

* `.ms-win-bloom` and `.ms-doorglow` are gone from the mansion markup.
  `mansionSVG()` now returns an **ordered list of sibling `<svg>` layers**:
  base house -> `.ti-glow--door` -> door -> three `.ti-glow--bloom` layers.
* Each `.ti-glow` is an `<svg>` **root**, which is a CSS box and therefore
  promotable: `will-change: opacity` gives it a texture, the blur bakes in once,
  and `ti-flicker` becomes a compositor-side opacity animation.
* Same `viewBox` and `preserveAspectRatio` as `.mansion`, so they register exactly;
  verified at 1600x900, 1366x768 and 1280x720.
* Three bloom layers, not one, at `-0s / -1.4s / -2.7s`, because the per-ellipse
  `animation-delay` that de-synced the halos cannot survive moving the animation up
  to the layer. One layer reads as the house blinking.
* Paint order is preserved. The door halo sits under the door and over the porch
  (its own layer, with the door redrawn above it); the window bloom sits over the
  window bars; the fence and dead trees never overlap a lit window, so nothing that
  used to be on top of the bloom needed to move.
* `.mm-reduce-motion .ti-glow` drops the animation *and* `will-change`, so the
  reduced-motion path does not hold four textures for a still image.

Screenshots: `shots/b_title_a.png` (before) vs `shots/a_title_a.png`,
`shots/ti_1280.png`, `shots/ti_1366.png`, `shots/ti_rm_on.png` (reduced motion).
Pixel diff before vs after with animations frozen: **0.28%**, all of it the flicker
phase of the glow itself.

### 3. Nine scenes were drawing a frame nobody could see. They are paused now

Visible canvas measured per scene by screenshotting with and without `#gl` and
diffing, **with `document.getAnimations()` paused first** so the noise floor is a
true zero rather than the 0.06-3.43% of animation drift the previous pass saw. A
same-state control pair was captured every time; the noise column is that control.

| scene | canvas visible | control noise | paused now |
|---|---|---|---|
| combat | 57.1-59.7% | 12-14% (its own canvas animating) | **no** |
| title | 0.00% | 0.00% | yes |
| select | 0.00% | 0.00% | yes |
| clubhouse | 0.00% | 0.00% | yes |
| map | 0.00% | 0.00% | yes |
| reward | 0.00% | 0.00% | yes |
| event | 0.00% | 0.00% | yes |
| shop | 0.00% | 0.00% | yes |
| rest | 0.00% | 0.00% | yes |
| gameover | 0.00% | 0.00% | yes |

What that was costing, measured on `map` by rendering the composer 20 times with a
`readPixels` fence after each and subtracting the cost of the fence alone:

    COMPOSER full=20.36  readbackOnly=2.00  net=18.36 ms/frame  at 1063x598

**18.4 ms of GPU per frame, for a screen showing a paper blueprint.** More than a
whole 60 Hz frame. Note that `gl.finish()` is not a fence under ANGLE/D3D11 — the
same loop measured 0.14 ms with `finish()` and that number is meaningless. Use
`readPixels`.

Implementation: `game/src/scenes/_stage.js`, `pauseStageFor(ctx)` -> returns the
unpause. One call in each occluded scene's `enter()`, the return value called in
`exit()`. Reward/Event/Shop/Rest share `RoomScene._boot()` and `RoomScene.exit()`,
so those four are one pair of calls. Combat calls `setPaused(false)` explicitly in
`enter()` rather than trusting the previous scene to have cleaned up after itself.

**The pause is deferred until `stage.warmup()` resolves, and that is load-bearing.**
`Stage._calibrate()` runs at the tail of `warmup()` and trims `_scaleAdjust` from
the measured rAF interval. A paused stage hands it a free 16.6 ms, it concludes the
machine has headroom it does not have, and combat inherits an un-trimmed render
scale. The boot scene is `title`, which pauses, so without the defer the calibration
would be wrong on **every** cold start. The helper also disarms a pending pause if
the scene is left first, so a scene cannot pause the stage out from under its
successor.

Verified: 19 transitions in both directions (`title <-> select`, `title <->
clubhouse`, `map <-> combat`, `map <-> reward/event/shop/rest`, `combat ->
gameover -> title -> combat`), always exactly one scene root in `#dom-layer`, pause
state correct at every step, zero console errors. rAF while paused holds
p50 16.6 / p99 18.5 on title, map and reward — the 150 ms keepalive does its job and
nothing freezes.

### 4. Fix 3: the title mood is now `'title'`, and the stage stays hidden

`scenes/title.js` sets `setMood('title')` instead of `'foyer'`. `.ti-sky` is
**deliberately left opaque** — the previous owner already rendered the transparent
version (`shots/ti_fix.png`) and it is worse: two moons, and a gold WebGL horizon
fighting purple SVG night. The SVG art is the design.

Which makes the mood swap invisible today, so the honest thing is to say why it was
still worth doing rather than pretend it shows: `'foyer'` is what `_publishCss()`
publishes this screen's colour custom properties from, it is what the stage would
show if anything ever un-paused it mid-title, and a screen pointing at the wrong
room is how the next person inherits a bug. The pixels come from Fix 2 instead — the
title now pauses the stage, so the exterior-night region is correct **and** free.

### 5. Fix 4: `w / 224` was stale everywhere, not just in two scenes

`--card-w` is `clamp(150px, min(13.5vw, 27vh), 224px)`. A `CardView` draws at
`--mm-card-w * scale`, so `scale: w / 224` under-fills its slot by 23% at 1280x720
and 18% at 1366x768. Measured on `select`'s deck strip, slot vs rendered card:

| viewport | before | after |
|---|---|---|
| 1280x720 | slot 105x147, card **81x113** | slot 105x147, card **105x146** |
| 1366x768 | slot 112x157, card **92x128** | slot 112x157, card **112x156** |

The card merely looked small; what gave it away was `.deckslot__n` — the brass "x2"
pill is positioned against the *slot*, so it floated detached above and left of the
card it was counting (`shots/dk_1280.png` before, `shots/dk2_1280.png` after).

Fixed in `game/src/scenes/_cardfit.js`, `fitCardToSlot(view, slot)`, which measures
the laid-out element instead of hard-coding 224. **The brief named `select.js` and
`gameover.js`; the identical stale constant was also in `reward.js` (two call sites)
and `shop.js`, so all four now use the helper** — leaving two of them wrong would
have been worse than the small increase in scope.

`gameover.js` had a second, separate instance of the same drift: the MVP slot sized
itself `--card-w * 0.6` wide by `--card-h * 0.6` tall. `--card-w` is responsive and
`--card-h` is still a flat `312px`, so the pair no longer describes one rectangle —
at 1280x720 that reserved a 187 px-tall box for a 144 px-tall card and the MVP sat
in a hole. The height now comes off `--card-w / --card-aspect`; measured after, slot
104x144 and card 104x145 at 1280x720, 111x154 and 111x155 at 1366x768.

**Not mine to fix — `ui/tokens.css`:** `--card-h: 312px` is now a lie next to a
responsive `--card-w`. Anything that pairs the two is wrong by up to 30%. It should
be `calc(var(--card-w) / var(--card-aspect))`. I derived it locally in `gameover.js`
rather than edit a token I do not own.

### 6. Fix 5: Backpack Gear no longer wears a Keepsake's clothes

`state/run.js` feeds the engine `[...keepsakes, ...backpackHooks(backpack)]`, and
those Gear entries are relic-shaped (`gear: true`, id `gear/<id>`) because the engine
only cares that a thing has hooks. The HUD drew the lot in one bar, so Maya's Camera
showed up as a Keepsake wearing the unknown-relic lozenge.

`ui/hud.js` now splits them: Keepsakes keep the warm, rarity-bordered **square** with
the relic's own sigil; Gear gets a cool, `--spectre`-toned **round** pack chip in its
own `role="list"` labelled "Backpack Gear", behind a divider and a small `GEAR` tag.
Shape and temperature, so the two never have to be told apart by reading them. The
tooltip spells out the distinction. `shots/gear_zoom.png`.

Gear is read from **`run.backpack`, not from the engine's list.** The engine only
holds the hook-bearing subset, so sourcing it there would make half the pack blink
out of the bar the moment a Scuffle started. Counters still come off the engine entry
when there is one. Falls back to the engine's gear entries when there is no run
(deep-linked dummy combat). Verified 3/3 Gear chips on map, event, shop, rest, reward
and combat with a live run, and 0 where there is no run.

**Owed to `ui/hud.css`:** the Gear chip CSS is currently a one-shot `<style>` tag
injected by `hud.js` (`GEAR_CSS` + `ensureGearCss()`), because this pass was scoped to
`hud.js` and `hud.css` belongs to ui-chrome and was being edited concurrently. It uses
only existing tokens. **Lift it into `hud.css` beside `.mm-hud__relic` verbatim and
delete `ensureGearCss()`** — nothing else needs to change.

**Not mine to fix — `ui/icons.js`:** there is no Backpack art, so every Gear chip
shares one stroked-knapsack glyph drawn locally in `hud.js`. The chips carry
`data-gear="<item icon name>"` so per-item drawings can drop in later without
touching `gearChip()`.

**Not mine to fix — `scenes/gameover.js` + meta-run:** the run summary lists
Keepsakes off `run.relics` and never shows Gear at all, so nothing there is
mislabelled — it is incomplete rather than wrong. Adding it needs item *names*, and
that file deliberately refuses to import `data/*` (see its comment on
`_hydrateKeepsakes`). Someone who owns both seams should decide whether the summary
gains a Gear row.

### 7. fps and longest long task, before -> after

Same harness both times. The long-task column is dominated by the shader warm-up
described in section 1 and the spread between runs is ~±400 ms, so read it as "no
regression", not as a result.

| scene | fps before | fps after | longest LT before | longest LT after |
|---|---|---|---|---|
| title | 61 | 61 | 3298 ms | 2249 ms |
| select | 61 | 61 | 4047 ms | 2702 ms |
| clubhouse | 61 | 61 | 3549 ms | 2578 ms |
| map | 61 | 61 | 3080 ms | 3022 ms |
| combat | 61 | 61 | 2346 ms | 2410 ms |
| reward | 61 | 61 | 2287 ms | 2433 ms |
| event | 61 | 61 | 2247 ms | 2364 ms |
| shop | 61 | 61 | 2476 ms | 2734 ms |
| rest | 61 | 61 | 4989 ms | 2313 ms |
| gameover | 61 | 61 | 1944 ms | 2351 ms |

**The <500 ms target is not met and is not reachable from these files.** The floor is
one `linkProgram` chunk inside `Stage._warmup()`. Everything the scenes own is
already off the measurement.

### Screenshots

Before `shots/b_<scene>_a.png`, after `shots/a_<scene>_a.png`, all ten scenes read
back and compared. Canvas-visibility pairs `shots/{b,a}_<scene>_{a,a2,b}.png`.
Card sizing `shots/dk_1280.png` / `shots/dk2_1280.png` (select, before/after),
`shots/go_1280_mvp.png`, `shots/cw2_{reward,shop,gameover}_{1280,1366}.png`.
Gear chips `shots/gear_combat.png`, `shots/gear_zoom.png`, `shots/gear_map.png`.
Title `shots/ti_1280.png`, `shots/ti_1366.png`, `shots/ti_rm_on.png`.
Transition sweep `shots/seq2.state.json` (19 hops, pause state logged per hop).
