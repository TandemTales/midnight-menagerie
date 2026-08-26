# Frontend round 7 — the Main Menu is the painting

**Designer's instruction, verbatim:**

> "incorporate the mainMenu.png in UI as well as title.png as the main menu for the game"

Two authored paintings, both new. They *are* the menu. `scenes/title.js` was building its own
mansion in SVG and its own wordmark in `logoLockup()`; both are gone rather than layered under
the art.

---

## What went away

`mansionSVG()` — 140 lines of procedural house: a five-block body, a spire with a weathervane
bat, three chimneys, a porch with columns and steps, a seeded treeline, 32 arched windows on a
seeded lit/dark roll, a picket fence, two recursive dead trees, a ground curve, and four
sibling `<svg>` glow layers. Plus, in CSS: `.ti-sky`, `.ti-moon` with craters, two `.ti-stars`
layers, `.ti-clouds`, 34 `.ti-motes`, two corner `cobweb()`s, two `candle()`s, and the
`.ti-plinth` slate panel the menu used to stand on.

All of it was a stand-in for art that now exists. `title.css` went from 488 lines to 430 with
the whole scene rebuilt inside it.

Two things were kept, and they are the two things that cost a round each to learn:

- **PERF.** The old file's long comment about promoting a blurred layer is still true and still
  load-bearing. Animating opacity on a blurred SVG *child* re-ran the blur on the main thread
  every frame — a 3.3s long task on entry. Everything animated on this screen is now a CSS box,
  and everything filtered on this screen is static.
- **TASTE.** A previous round shipped a window flicker aggressive enough that the designer
  called the game unplayable. The lamps here *breathe*: `.66 -> 1` opacity over 8-11s on four
  small halos. Measured idle swing is **0.19% - 0.32%** of mean luminance, against a ~5% budget.

## The two plates

Prepared by `tools/prep_menu_art.py` (already committed — no runtime build step, CONTRACTS #1)
and reached through a new `menuArtSrc()` in `ui/portrait.js`, next to `boardSrc()`.

| file | what it is |
|---|---|
| `game/assets/ui/main-menu.jpg` | the mansion exterior, 1672×941, ~16:9 |
| `game/assets/ui/title.png` | the wordmark, black field keyed to alpha on **luminance**, trimmed to its own ink, 2102×688 |

The wordmark's cartouche interior is left at partial alpha on purpose, so the roofline shows
through it and it reads as a lit sign over the gate rather than a sticker. That is the prep
script's decision and it is the right one; nothing here fights it.

**Cover fit, anchored at `50% 64%`.** The plate is 1.7768:1 and a 16:9 viewport is 1.7778:1, so
at all three target resolutions the crop is 0.06% of the height — nothing. The anchor is for
squarer windows, where it gives up sky (the only part of this painting that repeats) and keeps
the front door, the steps and the cobbles.

**The wordmark is `min(62vw, 110vh, 1280px)`.** 62vw is where it sits in the designer's
composite. The 110vh cap exists because the plate is 3.06:1, so 110vh of width is 36vh of
wordmark; on 16:9 the two caps land within a per-cent of each other and on anything squarer the
height cap is what stops it swallowing the roofline.

## Where the menu stands, and why it is not in the middle

Centred was the obvious answer and it is wrong. Mocked at 1920×1080 against the real plate, a
centred column plus the ground it needs buries the front door, the steps, both cat statues and
the top of the path — the entire axis the painter built — under one dark blob. The menu lives
**bottom-left**, in the quiet corner beside the gate, and the whole central composition stays
lit and visible.

The panel is `width: max-content` capped at `min(440px, 34vw)`, at `left: clamp(24px, 13vw,
262px)`. That is far enough right to leave the gate lantern outside it and far enough left that
the door, at x≈49%, is never touched. The caret lives in the margin *outside* the text column
(`left: -27px`), so the tagline, all five labels and both brass rules share one flush left edge
and the hover marker points in at the item from the dark.

## The ground, and the three ways it was wrong first

> "measure the contrast, don't eyeball it"

Every number below is WCAG relative luminance computed from **rendered pixels**, against the
worst single background pixel inside each glyph box (text hidden for the backdrop shot, so
text-shadows are excluded and the ratio is strict).

**Attempt 1 — a corner-anchored scrim, too strong.** Every menu item measured 12:1 to 16:1 and
the painting was destroyed to get there: a per-cell diff against the source plate put the
cobbled path at **0.17×** its painted luminance. The runway up to the front door had been
deleted to make room for five words, and the overall frame was 20-30% down at every edge from a
second vignette laid on a painting that already has one.

**Attempt 2 — lightened, and now failing.** With the scrim pulled back the path came home but
the tagline sat at **2.23:1**: a 29.6% specular highlight on the fountain finial, directly
behind it. The scrim was in the wrong *place*, not the wrong strength.

**Attempt 3 — anchor the shadow to the panel.** The ground is now a `::before` on `.ti-panel`:
a blurred, rounded, radially-graded box with feathered insets. It is over the type by
construction, at every resolution, whatever the menu is holding — and it needs a peak of only
~66% ink, because the arithmetic says a 35% scrim already takes the worst pixel under threshold.
Static, so the `blur(22px)` bakes into its texture once.

Two supporting layers, both aesthetic rather than load-bearing:

- **`.ti-plate--dof`** — the same `<img>` a second time (one request, one decode, one shared
  bitmap), `blur(10px) brightness(.78) saturate(.84)`, masked to a radial pool that stops at
  x=44%. This is the depth of field, and it is why the menu has a ground that belongs to the
  picture instead of a panel that belongs to a different game. It was at `brightness(.66)` for
  one round and the gate scrollwork, the fountain and the left rose bed all vanished while the
  right-hand garden kept its own — half the frame's furniture gone for contrast the panel's own
  pool was already providing.
- **`.ti-ground`** — a mild corner radial and a shallow full-width bottom fade that seats the
  frame and carries the build string in the far corner.

### The numbers

Worst-case ratio per element, against the brightest single pixel behind it:

| element | 1920×1080 | 1600×900 | 1280×720 |
|---|---|---|---|
| Continue / New Expedition | 11.40 | 11.24 | 11.86 |
| The Menagerie | 14.22 | 12.78 | 14.10 |
| Settings | 14.68 | 13.96 | 12.97 |
| Credits | 15.57 | 14.10 | 12.88 |
| tagline line 1 | 7.05 | 6.34 | 7.86 |
| tagline line 2 | 8.44 | 6.68 | 8.65 |
| counter | 9.65 | 8.72 | 7.74 |
| counter number | 12.46 | 12.41 | 12.36 |
| build string | 5.76 | 5.63 | 5.34 |
| **worst on screen** | **5.76** | **5.63** | **5.34** |

Also measured and passing: hover (the hovered label 10.31, its hint 5.99), a five-item menu with
a saved run (worst 5.25), `reduceMotion` (worst 5.27), and `largeText` at 1280×720 with five
items (worst 4.78).

Two token choices came out of the measurements rather than taste:

- **The counter row moved from `--text-lo` to `--text-mid`.** `--text-lo` needs the backdrop
  under 2.8% relative luminance, which over cobbles means turning the shadow pool into a black
  box. Its hierarchy now comes from size and letterspacing.
- **The build string is `color-mix(in oklab, var(--text-lo) 58%, var(--text-mid))`.** Flat
  `--text-lo` measured 4.59:1 in the far corner, and 4.46:1 once `largeText` grew the glyphs
  into brighter stones — a fail for exactly the reader that setting exists for.

## Life, without fighting it

- **Four lamps on the lights the painter put there**, positioned from measurements off the
  plate: the gate lantern at (10.4%, 63.3%), the two door lamps at (45.6%, 61.4%) and
  (54.6%, 61.4%), the gilt balcony crest at (50.1%, 54.1%). Radii are fractions of plate
  *width*, and the layer is cover-fit exactly like the plate, so one number works at every
  resolution. They sit **above** `.ti-ground` — a light source is not dimmed by the shadow it
  casts, and it is what keeps the gate lantern lit with the darkest part of the screen next to
  it. Durations 7.7 / 8.6 / 9.4 / 11.3s with negative delays, so nothing ever pulses in unison.
- **Two bats** crossing the sky on 46s and 68s loops, with a 1.1s wing flap, passing *behind*
  the wordmark — the sign is nearer than they are. Answering the ones painted into the
  cartouche.
- **Eight star twinkles** laid on the painted stars in the clear upper sky, 5.5-10.5s, opacity 0
  to 0.3-0.75, each a 1.4-2.9px dot.
- **Two mist bands** drifting on 86s and 63s along the path.
- **Pointer parallax.** `.ti-scene` and `.ti-lights` at depth 0.7 with `scale(1.045)`,
  `.ti-mark` at 1.5 — the sign hangs in front of the house and separates from it. The scale is
  applied *by the parallax manager*, not in CSS, because the manager writes `style.transform`
  wholesale and a CSS transform on the same element is overwritten on the first pointer move.
  For the same reason `.ti-mark` is a full-width flex row rather than `left: 50%` + a centring
  translate, and every entrance animation lives on a *child* of a parallaxed element.

Measured over 7 idle seconds at 1600×900: **953 pixels** (0.07% of the frame) changed by more
than 6/255, and mean luminance moved 0.011%. Under `reduceMotion` the parallax is not registered
at all, every animation is off, no element holds a promoted texture for it, and the swing is
**0.00%**.

## Smaller decisions

- **The hover is an ellipse, not a ramp.** A `linear-gradient(90deg, ...)` reaches the top,
  bottom and right edges of its box at full strength, and the first version of the hover read as
  a rectangular UI chip pasted on the painting — the one thing this screen cannot have. A
  radial anchored at the item's left edge reads as light spilling in from the lantern side.
- **`isolation: isolate` on `.ti-item` and `.ti-panel`.** Both use a `z-index: -1` pseudo for
  their ground. Without a stacking context those fall all the way back past the plate and are
  never seen; the old slate plinth had been isolating the item wash by accident.
- **The counter got shorter.** "N / 16 Menagerie Companions freed · N already at the clubhouse"
  needed 490px at 1920 and wrapped inside the menu column, putting the number alone on its own
  line. It is now "N / 16 Companions freed · N at the clubhouse", `white-space: nowrap`, one
  line at every resolution, and inside the measured pool. Semantics unchanged: `freedCompanions()`
  counts rescues only, `starterCount()` names the four separately, and a fresh save still reads
  **0 / 16**.
- **`largeText` no longer double-scales the count.** `--fs-xs` already carries the 1.22
  `--type-scale`; the extra step on top pushed the row 20% wider and straight out of its own
  shadow pool.
- **`enter()` awaits the plate's decode**, capped at 1.8s and unable to reject. It is awaited
  behind the transition veil (CONTRACTS trap #4), so the cost is black frames rather than a
  navy rectangle with a menu floating on it. Same reasoning as `select:ready`.
- **The credits gained a line**: *Menu art — the mansion at midnight, and the wordmark.*

## Not regressed

Title → Select → dossier → Kid → Begin Expedition driven end to end in one Playwright run,
landing on the map with a real run state (`companion: marmalade`, `kid: maya`, seed 1005235647).
The Companion-select painting, the roving-focus keyboard path, the first-pointerdown
`ctx.audio.unlock()`, the shared Settings panel, the Credits overlay and its focus trap, and
`warmFaces()` on commit are all unchanged and verified on screen.

## Verified

| | |
|---|---|
| `tests/seams/check.py` | 1607 call sites, **0 problems** |
| `tests/scene-css/check.py` | 10 sheets, 839 classes, **0 conflicts** |
| `tests/run/run.py` | 50 runs, **0 errors** |
| fps | **61** at 1280×720, 1600×900 and 1920×1080 |
| console | **zero errors** across every run above |
| idle luminance swing | **0.19% – 0.32%** of mean (0.00% under `reduceMotion`) |
| menu contrast | **≥ 5.34:1** worst case at every resolution |

Screens read and held against `UI/mainMenu.png`: 1920×1080, 1600×900, 1280×720, hover, keyboard
focus, five-item Continue, `reduceMotion`, `largeText`, the Credits overlay, the Settings panel,
and the whole flow through to the map. A per-cell luminance diff against the source plate puts
the house facade at 0.87-1.06× and the cobbled path at 0.80-1.36× of its painted value; the only
region deliberately below that is the far bottom-left corner, at 0.36-0.50×, where the menu
stands.

## Loose ends for whoever is next

- **`game/assets/ui/select-kid.jpg` is prepared and not wired to anything.** `tools/prep_menu_art.py`
  produces it from `UI/selectKid.png` (1448×1086) alongside the two plates above, but the
  designer has not asked for it, so nothing references it. `menuArtSrc()` says so in a comment.
  The Kid step in `scenes/select.js` still builds its MISSING poster and generated photographs
  from `ui/petart.js`; that plate would replace the same way the Companion board did.
- `logoLockup()`, `cobweb()` and `candle()` are still exported from `ui/portrait.js` and still
  used by the Clubhouse and the run-end screens. Only the Title stopped calling them.
- The two plates add 3.0 MB to `assets/ui/`. The mansion is JPEG at q92 (438 KB); the wordmark
  has to stay PNG because it is keyed to alpha.
