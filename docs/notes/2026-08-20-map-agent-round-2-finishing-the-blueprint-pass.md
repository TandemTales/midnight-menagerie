## 2026-08-20 — map agent, round 2 (finishing the blueprint pass)

Picking up a round-2 map pass that a rate limit cut short. Everything below was
re-measured against the live build; nothing is taken on trust from the previous pass.

### Verified as already fixed (measured, not assumed)

- **Clicking works.** `setPointerCapture` is inside the drag branch. A click on a legal
  mark takes `visited` 0 to 1, `walked` edges 0 to 1, and the walked route inks.
- **Branching.** 64 nodes, 5 legal at the door on seed 42 / foyer; 115 route edges.
- **Dimming exists.** At the door `{legal 5, far 59, cold 0}`; after one step
  `{legal 2, far 46, cold 15}`; after two `{legal 2, far 36, cold 24}`.
- **Zoom.** Fit is now **0.7584x**, and the marks counter-scale (`--mn-k` 1.14), so a mark's
  effective scale on screen is **0.864x** — above the 0.85 bar. Wheel is ~1.22x per notch.

**On the "is-far too subtle at the door" question:** measured, non-legal ink sits at 48%
of the pencil colour with the paper clearing at 50%, while the five legal marks carry a
double amber pencil ring, a breathing warm clearing and a two-stop glow. Amber is the only
warm thing on a blue-and-parchment sheet. `shots/map2_start.png` — the five read at a
glance out of sixty-four. Left as it is; the plan stays legible enough to route two rows
ahead, which is the other half of section 5.

### What I changed

1. **Safe Room glyph.** No longer a hazard triangle (predecessor fixed that), but its lamp
   was a solid disc, and at 20px that disc plus the two chairback posts collapsed into
   *a dark mass with points on top* — the boss silhouette. Only the boss may be a solid
   mass. The lamp is now an outlined lantern with a wick spark and six rays; the fort stays
   an open, airy mark. `shots/m2_sil2_zoom.png` — nine glyphs at 52/30/20px in greyscale,
   all nine distinct by outline alone.
2. **Boss / Rescue / Curiosity / Unsurveyed / Scuffle** — verified distinct on the same
   sheet. The boss is the only filled mass, sits in a 156px box against 86px, wears a BOSS
   tag, and is never dimmed below 88% ink. `shots/m2_crop_boss.png`.
3. **Hover card placement.** Was: left, else right — and "right" is where a room's onward
   edges go, so every row-one node (all of which are hard against the west edge) got a card
   over its own fan. Now: **left, then above, then below, then right**. Measured per side: a
   mid-wing node places `left` and covers 8 marks, all of them on rows already behind you;
   the boss places `left` over rows 8-10; a row-one node places `above` and covers 4. It
   never covers the node it describes.
4. **Hover card staleness.** Hovering a node you have just walked into now reads
   *"you are standing here"*, not *"you may go here"* (`_refreshTip` on every state sync).
5. **Keyboard ring.** The focused mark wears amber draughtsman's crop marks at the corners
   of its box, in addition to the ring — a different *shape*, not a shade.
   `shots/m2_kbd2_zoom.png`. Arms lengthened from 20% to 25% of the box for legibility at
   fit zoom.
6. **Header counters** reconciled: `Wing 1 of 17 - at the door - Boss: The Butler`, becoming
   `Wing 1 of 17 - row 2 of 13 - Boss: The Butler` once you are underway — the same
   two-level address the hover card uses ("Row 2 of 13 in this wing").
7. **`@media (prefers-reduced-motion: reduce)`** present and parsed (5 rules, confirmed via
   `document.styleSheets`), and extended to cover the new entrance. The in-game
   `reduceMotion` path still lands on `map-screen is-still is-drawn` with every
   `animation-name: none`.
8. **Room-name labels** were being crossed by their own pencil ring and by the next lane's
   ink: moved below the box, 19px to 16.5px, and the hovered / keyboard / current mark now
   wins the stack. Lane band widened from 0.600 to 0.640 of the sheet for a little more air.
9. **Per-frame cost.** The two 1280px lamp layers are blend-mode composited; their transform
   is now quantised and skipped when nothing visible changed, instead of a fresh template
   string and two style writes every frame.

### The entrance — this one was not what it looked like

The review said the ink-draw-on was "effectively instant": 29,085 changed pixels on the
first frame delta then 0-217 for the remaining eleven. That was true, and the cause was not
the animation's timing.

Measured on a cold deep-link entry: **one 2,564ms frame gap** immediately after the map
screen is built, then 372ms, then smooth. Entering from another scene (so the engine is
already warm) it is **667ms of build followed by a 389ms stall and a 303ms stall**. The old
entrance was 115 simultaneous `stroke-dashoffset` animations plus 64 node stamps on a
2030x1010 SVG — every frame of that forces a full re-raster of the ink layer, and the
compositor simply stopped producing frames. An 800ms animation that spends ~690ms frozen is
not an animation.

Also worth recording for anyone else measuring animation here: `page.evaluate` **awaits a
returned promise**, so `--steps "js:scene._drawOn()"` blocks until the whole entrance is
over and every strip frame lands on the end state. Use `js:(()=>{ ...; return 1 })()`. And a
freshly `will-change`-promoted layer's clip is missing from the *first* capture after
promotion.

What replaced it:

- **One composited sweep.** `clip-path: inset()` on `.map-ink` and `.map-nodes` together
  (so an edge and the room it runs into are inked by the same pass of the pen), with a
  travelling wet-pencil edge — three animations total, not 179. 0.10s delay + 0.70s =
  **800ms**, `--ease-soft`. `--ease-out` (`cubic-bezier(.16,1,.3,1)`) was tried first and is
  ~70% done by 200ms, which is the same lie in a new costume.
- **Armed state.** The sheet is painted and the marks are laid out but held at 2% ink before
  the sweep. Clipping them away instead skipped their raster and moved the stall into the
  middle of the animation (244ms gap, measured); rastering them at 2% moved it before.
- **The sweep waits for the screen.** `scenes.go` awaits `enter()` and lifts the veil
  *after* it, so a sweep started in `enter()` spends its first third behind a black screen.
  `_whenVisible()` waits for `scenes.busy` to clear and then for three consecutive frames
  under 40ms, capped at 2.5s of wall clock.

Result, sampled on rAF during a cold entry: clip-path 100% to 85% to 61% to 3% to -3% across
**822ms**, worst frame gap **149ms** (was: one gap of 491ms inside the animation, and 2,564ms
on the cold path). Deterministic capture at 0 / 200 / 400 / 600 / 800ms:
`shots/map2_sweep_strip.png` — blank sheet, first lane, three-quarters with the wet edge
visible, boss arriving, complete.

### Node composition — varied, confirmed

`generateRegionMap` picks a weighted **character** for the wing (plain / market / haunted /
hoard / quiet / strange / derelict) that leans the recipe, on top of a jittered base share.
All seven characters appeared across the 24 audited maps. Counts across those 24
(min / max / mean):

| type | min | max | mean |
|---|---|---|---|
| Scuffle | 17 | 32 | 26.2 |
| Curiosity | 8 | 13 | 11.0 |
| Big Scare | 4 | 10 | 6.8 |
| Unsurveyed | 3 | 10 | 6.2 |
| Safe Room | 4 | 8 | 5.4 |
| Treasure | 2 | 6 | 4.0 |
| Lost Things | 1 | 3 | 2.5 |
| Rescue | 1 | 1 | 1.0 |
| Boss | 1 | 1 | 1.0 |

Rescue is deliberately exactly one per region — there is one Companion per wing — and it is
zero once that Companion is already rescued (`opts.rescued`). Node totals 54-72.

### Edge crossings — 24 maps, zero

6 regions (foyer, greenhouse, lampworks, crypt, hedge-maze, heart) x 4 seeds (42, 7, 1337,
2026), re-run **after** the lane-band widening. Two tests per map: proper segment
intersection on centre-to-centre lines, and the same on the actual wobbled polylines the
scene draws (`inkLine`, trimmed at the real node radii, 9-12 segments each). Pairs sharing
an endpoint excluded.

**straight crossings 0 - drawn crossings 0 - 2,584 edges over 24 maps.** Mean out-degree
1.73-1.82. The staircase-plus-skip-passage construction still holds at the higher branching
factor, and the per-row depth jitter plus sub-half-lane lane jitter keeps it true on the
paper and not only in the graph.

### fps — do not trust a single number today

Four other agents were building while I measured, and the readings are not usable. Same
scene, same seed, three consecutive runs at 1920x1080: **8, 30, 35**. At 1600x900: 44-61.
An A/B that hid the lamp layers, then the grain, then the shade, then the whole map scene
produced 36 / 39 / 40 / 29 / **2** — hiding the entire map made it "slower", so the signal
is external contention, not the map. GL is `ANGLE (Intel UHD Graphics, D3D11)`. Best
observed on the map: **61 fps at 1100x620, 49 at 1600x900**. Needs re-measuring in isolation.

### Known, not fixed

- The region banner overlaps the top-left corner of the plan, so a row-one room's name can
  fall behind it. The banner is `pointer-events: none`, so it never eats a click, and the
  mark's ring stays visible below it — but on tall banners (three-line region names) it is
  close. Wants either a shorter banner or a top margin in the lane band.
- The boss's room name can run past the sheet's right border rule at fit zoom
  ("RECEIVING CHAMBER"). It sits over paper, so it stays readable.
- Two files of mine (`map.css`, `mapgen.js`) briefly went CRLF via a scripted edit and were
  committed that way by another agent's `commit -a`; I have converted them back to LF, so
  the next commit will show a whole-file diff on both. Content-wise the only real changes
  are the ones listed above.

### Screenshots

`shots/map2_start.png` (the sheet at the door), `map2_tip_left.png`, `map2_tip_row0.png`
(hover card above a row-one room, its onward fan clear), `map2_walked.png` (two rooms in —
inked route, you-are-here ring, tick stamps, 24 cold marks), `map2_sweep_strip.png`
(the entrance at 0/200/400/600/800ms), `m2_sil2_zoom.png` (nine glyphs, greyscale,
52/30/20px), `m2_kbd2_zoom.png` (keyboard crop marks), `m2_crop_boss.png`,
`m2_r_heart.png`, `m2_r_lampworks.png`, `m2_r_greenhouse.png`.

---
