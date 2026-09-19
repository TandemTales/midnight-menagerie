# Handoff — rounds 8-10 merged; round 11 is cut and waiting on one command

You are picking up Midnight Menagerie on `dev`. Everything below is pushed.

**Read item 3a before you touch a background.** "The background" is two
different systems that share nothing, and a change to one does not touch the
other.

**Josh's standing order is the UI pass, and it is running.** 2026-09-12: *"create
a loop to perfect the UI of the game to look like the included samples in
midnight menagerie/UI, as well as the backgrounds looking at the same level,
critiqued by blind judges ... fan out agents to triplicate and duplicate builds
and critique runs. dont stop until its perfected."* Re-issued 09-13 as "continue
loop until perfected". Two later calls narrow it and both are in force:
**no background art is coming** and **a background's colour is NOT held to
`UI/*.png`** — what matters is readable, accurately drawn, well-detailed objects
(item 3).

## START HERE — 2026-09-18 evening, session 6250d1da

**Where it stands.** The machine was restarted (18:31) and round 11's
baselines were taken — but they are about to be RETAKEN, because the order
changed: the two round-10 grafts go in FIRST, so round 11 builds on the rooms
the game will actually have, and so whichever lands second is not the one that
runs out of the perf budget.

1. **The graft is being built** on `ui/r11-graft` (worktree
   `C:/UILOOP/r11/wt/r11-graft`, port 8904, cut at `fc881cf`): SORREL2's
   Greenhouse (`ff71330` + `0092f30`) and BISTRE2's Foyer (`8e096b2`,
   `17d0a3e`, `055f2b0`), with SORREL2's planting bed renumbered 22 -> 24
   (OAKGALL's fittings own 22 and 23) and one fitting per light. Its captures
   go to `C:/UILOOP/r11/judging/graft/`. Check them against
   `C:/UILOOP/r10/judging/r10/bg3/{SORREL2/room-greenhouse,BISTRE2/room-foyer}.png`
   before merging.
2. **Then:** merge it, fast-forward `ui/r11-vary-{a,b,c}` to the merge, finish
   `BRIEF-r11.md`'s "what changed under you" section and its perf numbers,
   retake the baselines (`bash docs/ui-pass/baseline-r11.sh`, now ~4x faster),
   **check `band` on combat and rest**, and launch round 11 with that merge as
   `base`.

**Four harness fixes landed today, and they change how a round runs:**
- `fc881cf` — **the fifth way a capture lies**: a board with NO ROOM behind it
  (warm-up ~35 s against a 40 s timeout; `shot.py` shot into phase A). Round
  11's first combat baseline was one. A timeout is void now; `perf.band` is
  the check (29-36 with a room, 23.6 without).
- `9966399` — `tools/room_batch.py`: one warmed page photographs every room of
  a sheet (equivalent to fresh captures to 0.001%). `variant_sheet.py` uses it.
  A 17-region sweep is one launch: `python tools/room_batch.py --port P
  --regions all --sheet out.png`.
- `2d08cca` — `tools/gpu_slot.py`: ONE WebGL page at a time machine-wide.
  Captures run on the Intel UHD iGPU, where one holds ~1.5 GB of shared (=
  system) memory plus ~0.9 GB of browser, with 4.7 GB free idle — three
  builders capturing at once was the likeliest cause of the "degradation".
  It also makes every gpuprof run quiet by construction.
- `BRIEF-r11.md` gained **the empty-room defect**: 4 of the 12 baseline
  panels drew `perimeter` and are nearly empty (and the piano vanishes,
  because only `colonnade` places `props.solo`).

**THE PREVIOUS START HERE, kept for its detail:** restart the machine, then
finish round 11's baselines and launch it.

```
bash docs/ui-pass/baseline-r11.sh      # skips what already exists, retries voids
```

It needs 8 files in `C:/UILOOP/r11/judging/r11/vary/QUILL/` — four SHEETS
(foyer, ballroom, greenhouse, graveyard, three rooms each) plus combat and rest
at both sizes. Two are there. Then:

```
Workflow({ scriptPath: 'docs/ui-pass/round-workflow.js',
           args: { ...docs/ui-pass/round-11.args.json,
                   repo, uiloop: 'C:/UILOOP/r11', base: '3a32fc0' } })
```

Worktrees `ui/r11-vary-{a,b,c}` are already cut at `3a32fc0`, ports 8901-8903,
and the probe dry-runs clean at 5 agents.

**Why it is blocked:** this machine's GPU process degrades across a long session
of Chromium launches until it cannot draw — `glStd` pins at 1.85-1.98 where a
healthy capture of the same region reads 27-48. It recovers when left alone (a
17-room sweep failed one evening and ran 17 of 17 the next morning on the same
commit), but by the end of 2026-09-18 it managed one or two captures per rest.
**That is a restart, not a wait.**

**THE SECOND THING, and it is the highest-value work outstanding:** two grafts
from round 10 are the only screens in eleven rounds a judge has marked
`fits_between_samples: true` — SORREL2's GREENHOUSE (`ff71330` on
`ui/r10-bg3-b`, 3 of 3 judges) and BISTRE2's FOYER (`8e096b2` on
`ui/r10-bg3-c`, 2 of 3). **Neither cherry-picks**: five conflict regions, two of
them 100+ lines of GLSL where two builders rewrote the same plant branches. Give
them to a BUILDER with a dev server, the way round 9's ballroom graft was done.
Do not hand-resolve them.

## THE STATE OF THE PASS

Rounds 0-10 merged. Round 9 (+2.71) is the one to read: it is where props
stopped being coverage masks and got an interior. Round 10 merged OAKGALL
(`f39dbc6`); its reported +1.72 should be read as **+0.93**, because the
baseline's own combat capture was a blown white frame that all three judges
scored 1 of 10.

Frame cost on the merged build, quiet window, four runs: **14.4-14.8 ms** against
a hard 15.5, backdrop 9.26-9.33, props 1.35-1.41. Under a millisecond of
headroom, which `BRIEF-r11.md` says out loud.

`fits_between_samples` is still FALSE on every screen of every round except the
two grafts above, and the best room has scored 7.

## THE FOUR WAYS A CAPTURE LIES, all of which have cost a verdict or an evening

`tools/shot.py` now detects all four and exits 2 on any of them:

| signature | what it means |
|---|---|
| `gl: none` | the page never got a GPU context |
| frame std < 8 | a dead frame, white or black |
| `glStd` ~ 0 | the UI drew and the BACKDROP did not — the frame still looks busy |
| >8% of pixels above L200 | a white transition flash caught in the composite |

And `tools/variant_sheet.py` refuses to write a sheet with fewer panels than
asked for: all four of round 11's first baselines came back with ONE panel and
each looked like a perfectly normal screenshot.

**Before briefing a round from a judge's verdict, check the capture the verdict
was written about.** Round 9's judges both opened with a blocking fix for a bug
that did not exist, because the capture they were shown had no backdrop.

## THEN, THE REST

So there is no track with an unspent fix list any more, and round 8 went to the
thing every judge had blamed for seven rounds instead: the ROOM (item 3).

**ROUND 11 IS READY AND BLOCKED ON THE MACHINE, NOT THE WORK (2026-09-18).**

Everything is committed and pushed: `BRIEF-r11.md`, `RUBRIC-r11.md`,
`round-11.args.json`, `tools/variant_sheet.py`, and three worktrees cut at
`3a32fc0` (`ui/r11-vary-{a,b,c}`, ports 8901-8903). The probe dry-runs clean at
5 agents. **The only thing missing is its baselines.**

TO FINISH IT, after the machine has been restarted:

    bash docs/ui-pass/baseline-r11.sh      # skips what exists, retries voids

It needs 8 files in `C:/UILOOP/r11/judging/r11/vary/QUILL/`: four SHEETS
(foyer, ballroom, greenhouse, graveyard -- three rooms each) and combat, rest,
each at both sizes. Two are already there (`rest`, `rest-1280`). Then launch
with `round-11.args.json` plus repo, `uiloop: C:/UILOOP/r11`, `base: 3a32fc0`.

WHY IT IS BLOCKED. This machine's GPU process degrades across a long session of
Chromium launches and eventually cannot draw: `glStd` pins at 1.85-1.98 where a
healthy capture of the same region reads 27-48. It used to recover after a rest
-- a 17-room sweep failed one evening and ran 17 of 17 the next morning on the
same commit -- but by the end of 2026-09-18 it was managing only one or two
captures per rest. **That is a restart, not a wait.**

WHAT THE ROUND IS. Josh: *"i want variation between backgrounds within sections
of the mansion as well, multiple different foyer, ballroom, greenhouse, etc.
rooms so that different encounters within the same section wont feel stale."*
The machinery already exists and must not be rebuilt -- `combat.js` passes
`setMood(region, { seed: roomName })` and `_vary()` re-rolls layout, prop count,
room proportions, every lamp and the shafts, and three Foyers differ in 51-55%
of their pixels. **What it never touches is `pal.cam`, `subject`,
`floorPattern` and the prop shape set**, so every Foyer shows the same staircase
on the same wall from the same camera. That is the staleness. Fix order, which
is also cheapest-first: the camera, where the subject sits, a subject POOL per
wing, then floor and prop families.

AND THE ONE THAT NEARLY SHIPPED BROKEN: all four baseline sheets came back with
ONE PANEL each and every one looked like a normal screenshot. `variant_sheet.py`
now refuses to write a sheet shorter than the seeds asked for (`75528b7`).

**ROUND 10 IS MERGED (2026-09-18) AND TWO GRAFTS ARE OUTSTANDING AND VALUABLE.**

OAKGALL merged as `f39dbc6`, 2 of 3 judges, 5.78 against the baseline's 4.06 --
**but read that as +0.93, not +1.72**: the baseline's own combat capture was a
blown white frame (33.6% of pixels above L200, a transition flash caught in the
composite while the #gl layer drew fine) and all three judges scored it 1 of 10.
Excluding that screen: 5.60 against 4.67. The test that catches it is `81c49b4`.

It fixed what the brief diagnosed -- every practical light drew a flame and
nothing drew the FITTING, so a light in mid-air was a pale oval attached to
nothing -- and a judge on the merged build confirms "the three floating ovals
are now real chandeliers: ceiling rose, rod, two scrolled arms, candle cups,
drop finial". The statue also gained a face, hands, folded wings and cloth,
which pays four times (Ballroom, Crypt, Graveyard, Heart).

**TWO GRAFTS, AND THEY ARE THE FIRST `fits_between_samples: true` IN ELEVEN
ROUNDS.** Both lost the round overall and both won their own screen:

- **SORREL2's GREENHOUSE** (`ff71330` on `ui/r10-bg3-b`) -- 3 of 3 judges, 7,
  fits TRUE. Containers with rolled rims and soil lines, leaves with secondary
  veining, planting beds, and a GLAZED roof.
- **BISTRE2's FOYER** (`8e096b2` on `ui/r10-bg3-c`) -- 2 of 3, 7, fits TRUE.
  The hall's furniture, a stair runner, and a handrail with real thickness.

**Neither could be cherry-picked**: five conflict regions, two of them 100+
lines of GLSL where OAKGALL and SORREL2 both rewrote the same plant branches.
Hand-resolving semantic GLSL conflicts is how a silent defect gets in, so it was
aborted deliberately. **Give it to a BUILDER with a dev server**, the way round
9's ballroom graft was done -- it is the single highest-value piece of work
outstanding, because it is the only thing in the pass a judge has ever said
could pass for a painting.

**And a negative result worth more than most positive ones.** SORREL2 built the
same fitting layer as a NEW instanced mesh and reverted it: the chandeliers
appeared in one capture of five or six, frames otherwise byte-identical, with
instance data verified correct at render time (instanceCount 10, aPos on the
lamp), and it ruled out shader size, quad extent, `visible`, dynamic instance
count, depthTest, blending and renderOrder. Its conclusion: **a mesh ADDED to
that group after core/renderer.js has warmed the scene is unreliable**, while the
flame, prop, shaft and shadow meshes -- the same pattern, same group -- never
miss. OAKGALL independently put its fittings on the PROP layer (shape 22,
inserted before the MAX_PROPS slice) and they render byte-identically across
repeat captures. **Put a new object on the prop layer, not a new mesh.**

**ROUNDS 8 AND 9 ARE MERGED AND VERIFIED (2026-09-18).** Round 9 is the one to
read: **+2.71, the largest gain of the pass**, and it is where the props stopped
being slabs. `docs/ui-pass/README.md` has the full account; the short version:

- Josh, after looking at the rooms: *"nothing in the greenhouse looks like
  plants, and the ballroom seems to be occupied by statues or oversized oscar
  awards"*, at **highest priority**, to the standard of the mansion and
  characters in `UI/*.png`. Both judges then scored the baseline **2/10** on
  both rooms unprompted. They merged at 7 and 6.5.
- **THE CAUSE: a prop had no interior.** `shapeField()` returned a coverage mask
  and the normal came from its gradient, so every prop was a rounded slab with
  material noise on it -- which is exactly what an award statuette is.
  `reliefH()` now returns metres of relief inside the outline for all twenty
  silhouettes. Props got CHEAPER doing it (1.04-1.17 ms vs 1.19-1.25).
- **Four findings that explain years of symptoms, and DO NOT re-derive them:** a
  column's flutes had never rendered in any round (the shaft coordinate spanned
  the whole quad, giving 1.5 flutes per drum); the prop luminance ceiling is a
  COMPRESSOR and the diffuse loop sits inside it, mapping pre-grade 0.6 and 1.5
  to a nine-per-cent spread, which is why five rounds of Greenhouse work only
  changed its outline; props were half the size their rooms needed (a flat +-5%
  spread on all twenty shapes); and recess occlusion darkens NEGATIVE relief
  only, so a shape must subtract its own mid-height or its relief shows nothing.
- **The Ballroom was a CONTENT failure in the region data.** `shapes[0]` is used
  for both files of a `colonnade`, so `[15,4,7,6,0]` at count 30 built thirty
  tall narrow figures on plinths. Josh was describing the data. It now has a
  pier glass (shape 20) and a grand piano (21, `props.solo`), grafted from
  CARMINE which won that screen.
- Frame 13.5-14.2 ms against the 15.5 budget. Battery: 101 gates, 3 red, all
  three pre-existing (HALO clips, Archivist seed / `_losePatience`, steam-deck).

**WHAT ROUND 10 SHOULD TAKE**, from both judges and the last sweep:
`fits_between_samples` is still FALSE everywhere and the best room is 7. The
Foyer is furnished but still bare below the dado and its handrails are
one-pixel stepped diagonals (UMBER's branch `ui/r9-bg2-b` fixed those and scored
7 on it); the Greenhouse's pots are rimless dark tubs with no lip or soil line,
so a 2 m specimen grows out of a shadow; the piano's lid underside wants more
shade. `docs/ui-pass/BRIEF-r9.md` and `RUBRIC-r9.md` are the right shape to
re-use -- objects first, colour explicitly not a target.

**AND THE TRAP THAT COST AN EVENING: a capture with no GPU is not a regression.**
A seventeen-room sweep came back all dead with `VALIDATE_STATUS false`, which
reads as "the round broke the shader". Six captures at three commits settled it:
the round's own BASE failed 4 of 6. This machine's GPU process degrades across a
few hundred Chromium launches in a session and cannot create a context;
**it recovers when left to idle**, and the same sweep next morning got 17 of 17.
`tools/shot.py` now flags a void capture and exits 2 -- and note the second
correction, that a live GL context is NOT proof the frame drew, so the test is
the frame's own std (void under 5, darkest real room 29, threshold 8).

**ROUND 8, for the record, ran as of 2026-09-17.** One track, 3 builders + 2 judges.

    run          wf_75ec8ee9-95d
    base         27f7028
    UILOOP       C:/UILOOP/r8   (SHORT root -- see item 3d, it is not optional)
    codes        SOOT a:8871 / VERDIGRIS b:8872 / BISTRE c:8873, baseline TALLOW
    screens      room-foyer, room-crypt, room-graveyard, combat, combat-boss, rest
    artifacts    docs/ui-pass/BRIEF-r8.md, RUBRIC-r8.md, round-8.args.json
    merge        docs/ui-pass/MERGE-r8.md  -- READ THIS BEFORE MERGING

Three of its six captures have no interface on them at all: a room,
photographed by `tools/shot-scripts/backdrop-room.js`, judged as a painting.

**When it lands, `MERGE-r8.md` is the procedure**, and it exists because of
round 6: a converged field plus the ranking tiebreak once returned a candidate
whose mean was below the screens it started from. Two disqualifiers first (the
15.5 ms budget, and a sweep of all seventeen rooms against the baseline, because
the round photographs three), then a test per briefed fix.

**Two fixes are already diagnosed and QUEUED BEHIND THE MERGE. Do not
re-derive them** -- `docs/notes/2026-09-17-a-third-of-the-hedge-maze-is-pure-black.md`
has the measurements and the constants:

- **A painted sky**, for the open-sky shell AND the glass ceilings. 71.5% of the
  Hedge Maze's upper third is PURE black where mainMenu.png, also a night sky,
  has none; ours is 4x-20x too dark and its stars up to 11x too HOT. His sky is
  a nearly pure linear navy ramp: (3,11,26) to (13,24,44), variation 3.4% of
  level, stars 0.01% of area above L110. A CPU prototype hits every axis. The
  bound: any variation term above ~0.34 drives the sky back to pure black at
  the low end of its own modulation.
- ~~The CSS room's two lit passes never reach black.~~ **RETRACTED the same day,
  do not act on it.** `kit.css` composites `room-warm` and `room-moon` through
  the candle-pool and moonbeam MASKS, so they are never drawn full-frame: they
  are the room as it looks INSIDE a light pool, and `amb` 0.66 / 0.52 is correct
  by design. The full-frame pass is `room.webp` and it does reach black (minCh
  0.61). Comparing a pool-masked layer with the samples' whole-composition 0.00
  is the wrong population. Lowering it would darken every candle pool in the
  game.

**POLISH is still converged** (see round 6) and COMBAT has had no round since 6.
Round 7's judges' own words for why the room was the right target: "the ceiling
is the ground: every wall, floor and corkboard here is a render, not a painting
at mainMenu.png's level, which pins the background score at 5-6 everywhere."

**2. Where every round's verdicts live**, as absolute paths, because they are in
another session's scratch and you will not be able to guess them. Under
`%TEMP%\claude\C--Users-Josh-OneDrive-Desktop-Tandem-Tales-Midnight-Menagerie\`:

  rounds 6 and 7   `5a602355-7630-4c23-94f4-dfeaea93a0a4\tasks\`
                   `wby5zlql9.output` (r7 DIALOGS + KIDS' PLACES)
                   `wei4yfxc4.output` (r6 POLISH + COMBAT)
  rounds 4 and 5   `f921e739-3596-4b9f-b0d2-9e78e6b37796\tasks\`
                   `w4c312fpu.output`, `wcudg6f1y.output`

All read with `python tools/ui_pass_digest.py <file> <track> [--worst CODE]
[--notes CODE,...]`; set `PYTHONIOENCODING=utf-8` first, the judges write curly
quotes. **If those folders have been cleaned, the verdicts are gone** -- the
README's results table and the per-round `docs/ui-pass/BRIEF-r*.md` fix lists are
then the whole record, which is why each brief quotes its judges verbatim.

The UILOOP (worktrees `wt/` and every capture a judge has seen, `judging/r0`..`r7`)
is at `5a602355-.../scratchpad/ui-loop`. A new session moves the worktrees into
its own scratchpad with `git worktree move` and copies `judging/` across.

`docs/ui-pass/BRIEF-r7.md`, `RUBRIC-r7.md` and `round-7.args.json` are the
template: copy to `-r8`, keep the two-track shape, and keep the paragraphs about
the animated creatures and about not painting rooms in CSS. Codes used so far are
listed across `round-*.args.json`; check a new one is unused before you assign it.

**3. THERE WILL BE NO BACKGROUND ART. The procedural room is the finished
article, and the loop's job is to take it as far as procedure goes.**

Josh, 2026-09-17, and this supersedes everything earlier rounds recorded about
paintings: *"no more background art. i wanted to start the loop to perfect
backgrounds and see how good they could possibly be with just procedural
generation only. there will be no background art. make it as good as it can be
without it. now finish the loop with this in mind."*

So, concretely, and **do not re-derive any of this**:

- `docs/art/background-prompts.md` is RETIRED. Nobody is painting those 25.
- `animations/backgrounds/` will never exist. Stop waiting for it, stop telling
  builders to keep a painting slot clear, and stop running
  `python tools/prep_backgrounds.py` before a round's baselines. The slot code
  (`tools/prep_backgrounds.py`, `ui/backdrop.js`, `ui/kitboard.js`) is harmless
  and is left in place; it simply never has an input.
- **The briefs' old instruction was backwards.** Every brief from r5 on told
  builders not to spend the round painting rooms in CSS and to keep the painting
  slots unobstructed. From round 8 the ROOM IS THE DELIVERABLE.
- **The rubric's 9 is now a target rather than a deferral.** "A viewer could
  not tell this was not painted by the same hand as the samples" is what
  procedure is being asked to reach. It may not reach it; the answer to "how
  good can this get procedurally" is what Josh asked the loop to find out, and
  a converged field is a legitimate answer.
- The four samples stay the reference, and `tools/bgmetrics.py` stays the
  instrument: they are how "as good as it can be" is measured against
  something rather than asserted.

**What the ground already is, measured** (both rooms, 2026-09-16, and item 3a
has the detail):

| | before the pass | after | `mainMenu.png` |
|---|---|---|---|
| combat room, tooth | 0.076 | 0.150 | 0.226 |
| ...its 0.8 px octave | 0.050 | 0.086 | 0.124 |
| ...min channel | 5.49 | 3.30 | 2.32 |
| ...edge width, px | 2.54 | 2.51 | 2.52 |
| an isolated room, tooth | 0.085 | 0.246-0.317 | 0.226 |
| ...ink share | 0.33 | 0.35-0.53 | 0.674 |
| ...ink DEPTH | 0.000 | 0.009-0.080 | 0.248 |

Read that table before briefing: **tooth and edge width are AT his figure on an
isolated room; ink depth is the axis still an order of magnitude short**, and
his ink depth comes from drawn subject matter -- masonry joints, tracery,
ironwork -- not from a stronger line. That is where a procedural round has room
to move, and it is the first thing round 8's brief should aim at.

**3a. WHICH ROOM a screen shows, because there are two and they share nothing.**

| | file | shows on |
|---|---|---|
| the CSS room | `tools/prep_ui_paint.py` -> `game/assets/ui/kit/room*.webp` | the six boards, round every dialog |
| the WebGL room | `game/src/fx/backdrop.js` + `fx/shaders/backdrop.js` + `fx/atmosphere.js` | **COMBAT**, and the showcase |

The ground pass of 2026-09-16 (`57da26a`, `cc59d6e`, `16e608d`) painted only the
CSS one, and the handoff then recorded "the procedural half is DONE" -- while
combat, the ONE screen where a large area of room is visible, had never been
touched. `aebb6d7` and `da37410` are that work.
`docs/notes/2026-09-16-the-webgl-room-was-never-painted.md` is the full account;
the four findings a round 8 must not re-derive:

- **Josh's tooth is WHITE NOISE, not 1/f.** Read through the cumulative
  high-pass `tools/bgmetrics.py` uses, the samples run 0.41 0.67 0.83 0.94 1.00
  across the 0.8-12 px octaves. The 1/f^1.1 the CSS ground uses gives
  0.06 0.14 0.30 0.60 1.00 and leaves the fine end empty: copying it to the
  WebGL room moved the measurement 0.038 -> 0.038. Canvas tooth lives in the
  POST GRADE, in display space, multiplicative so pure black stays black, on
  cells measured in PIXELS.
- **A drawn line's width is in PIXELS.** A 4 cm chair rail across a 19 m room is
  a fifth of a pixel of relief, so lighting can only ever draw it as a hairline.
  `length(vec2(dFdx(h), dFdy(h)))` is metres of relief per pixel; a threshold on
  it is a constant-width line at any depth and costs nothing, because the shader
  already takes those derivatives for its normal. Gate it on resolvability or it
  draws BANDS. Same for antialias, joint and rim widths.
- **A recess is darker than the face it is cut into.** The wall's panels were
  hairlines because the flat floor of a 42 cm recess has the same NORMAL as the
  wall. One occlusion term off the height field gave six architecture modes
  their joinery.
- **AND MEASURE WHAT IT COSTS.** The first version was +3.75 ms of an 11.2 ms
  frame, 2.14 ms of it the post grade: six octaves of value noise is 24 hash
  calls on 921,600 pixels, and "the post chain is bandwidth-bound" is only true
  for the taps it was measured with. Three taps with the same measured spectrum
  (**the finest octave is white noise, so ONE hash, not four**), one tap for the
  wear field, `MM_TOOTH` off at tier low, no drawn work on the ceiling: 13.95 ms
  and 59 fps observed, before AND after.

**3b. PIN THE PHASE, and a capture is byte-identical.** Two mounts of one region
differed over 17% of their pixels, and this handoff blamed the prop layout and
the particle stream -- both wrong. `clock.t` accumulates scaled dt,
`clock.scale = 0` stops it at whatever the page reached while booting, and
everything time-driven reads it: props sway on `sin(uTime*0.55 + seed)`, stars
twinkle, clouds drift, flames flicker. `ctx.clock.t = 120` before the shot gives
**0 differing pixels, motes and props and all** -- one line in
`tools/shot-scripts/backdrop-room.js`, which also has `region=`, `tier=`,
`seed=`, `props=0`, `actor=0`, `frames=0`, `shafts=0`, `motes=0` and one-knob
overrides (`tooth=`, `damask=`, `ink=`, `propsat=`).
**So a single prop CAN be A/B'd**, which the prop pass needs: five of the twenty
silhouettes are done (plant, shrub, column, statue, cabinet) and the rest still
carry 44 headstones, 35 chairs, 33 drapes, 30 crates, 25 candelabra. A batch
written blind regressed and was reverted -- at thirty pixels the recognisable
CUE beats the parts, and two of its clips were the classic SDF error, a `max()`
applied to the ACCUMULATED distance instead of to the primitive it was shaping.

**3c. `tests/shader-literals/check.py` before you edit a shader.** A backtick
inside a `/* glsl */` template literal ends it, and what you get is
`PAGEERROR Unexpected identifier '<a GLSL local>'`, a black frame, `state: no MM`
and an empty `.console.txt`. It cost four cycles in one afternoon because this
codebase quotes identifiers in backticks everywhere else. The gate also checks
every `${SPLICE}` against what the file imports.

**3d. UI-pass worktrees need a SHORT root, and `git worktree add` simply fails
without one.** Use `C:/UILOOP/<round>/{wt,judging}`. `LongPathsEnabled` is 0 in
the registry on this machine, so 260 characters is a hard ceiling for Python and
the edit tools (and enabling it is a system setting, not ours to change). A
session scratchpad path is ~148 characters before `/wt/<round>-<track>-<slot>`;
with the repo's longest tracked path (84) that wants 262, and round 8 hit exactly
that -- three half-made checkouts and three dangling branches, which
`git worktree remove` will not clean up (`git branch -D`, `rm -rf`, then
`git worktree prune`). Rounds 5-7 fitted only because their track keys were two
characters shorter: 259 of 260, by luck. `C:/UILOOP/r8/wt/r8-background-a` is 31,
needs no permission prompt, and its judging folders outlive the session.

**4. The enemies animate (09-15); round 6's COMBAT brief says how, and round 7's
must keep saying it.** Josh's call was "do it after round 5 merges". His sheets in
`animations/sprites/enemies/animations/` (90 for 22 enemies on 09-15, still
arriving) build with `python tools/prep_sprites.py --enemy-clips`.
- **The build:** it writes `game/assets/sprites/enemy-clips/<id>/` and the
  manifest's `enemyClips` section. The sheets take the Companion matte path,
  because they are grey-flattened generator output, unlike the stills.
  - **Size:** the idle figure builds at the lesser of its native height and its
    still's (at least 256); a boss keeps native, the Butler 379.
  - **Frame cap:** no frame side over 400, clip by clip. Each clip publishes its
    own `unit`, so a wide lunge is softer, not smaller.
  - **Defeats:** every defeat sheet delivered falls AND GETS BACK UP, so it is
    cut at its first most-defeated frame (`defeat_hold`) and held.
  - **No fades:** a clip's `fade` is dropped, because a lunge's blur is not a
    dissolve.
  - **Sheet names:** `rug`, `suitcase` and `conservatory` are aliases in
    `ENEMY_ALIAS`.
- **The game (`ui/enemy.js`, `ui/sprite.js`):**
  - `ClipPlayer` loads an enemy's clips before its still.
  - EnemyView ticks a moving painting through the same `.rg-stillimg`, now
    inside `.rg-stillfit > .rg-stillclip`. The hit flash, lights-out and entrance
    silhouette reach it unchanged.
  - **Beats:** the wind-up plays `attack`, or `cast` for buff, debuff and summon
    intents; an unblocked hit plays `hurt`; a death plays `defeat`, and the
    lights go out at 70% of it.
  - **Idle:** our procedural breath, sway and twitch are off while a clip idles.
  - **Measuring:** `paintRect()` gives a painting's box and feet, and what the
    gates measure by.
- **The gates:** `tests/enemy-clips/check.py` is new: 761 passed, 0 console
  errors. `tests/enemy-stills` measures moving paintings by their feet: 433
  passed.
- **For round 6's COMBAT brief:** the creatures now move, so two captures of one
  board show different idle frames. `enemy.js` is still COMBAT's presentation
  file.

**5. And only a dissolve fades now (09-15, `5b312b8`).** 37 Companion and Kid
clips had been drawn at 35% opacity in the middle of their beat -- Bones bit at
0.35, measured in the running game. `fade_envelope`'s focus dip TIMES a dissolve
but cannot tell one from a lunge's motion blur (Boggle's Hide dips to 0.084,
Bones' attack to 0.424), so `prep_sprites.FADE_FLOOR` is now the list of clips
that may fade at all: `spectral`, `zoomies`, `hide`, `shadow`, each quoted from
Josh's animation brief. 16 slugs were rebuilt; `tests/sprites/check.py` now fails
both ways round. Pipkin gained the `ready` clip Josh delivered on 09-12.

**6. Twenty-two frames a clip, and a death that stays down (09-15, `0d6b3b2`).**
A sheet is 81 cells and about a fifth of them carry the animation, so every clip
now keeps `prep_sprites.TARGET_FRAMES` = 22 of them: 4,242 frames where there
were 15,853, and 121 MB of atlases where there were 373.
- **Which 22:** even spans, medoid within each. Scored as the runtime plays them,
  that reconstructs the clip at 0.066 against 0.076 for plain `linspace`, 0.080
  for the sharpest frame in each span, and 0.214 for spacing them evenly in
  motion. The last two are the intuitions to distrust -- the sharpest frame is
  the FADE_FLOOR mistake again, and respacing by motion respaces the beat.
- **The beat still lasts as long:** each clip publishes its own `fps`, scaled by
  the share of frames it kept. A 4.05s idle is 22 frames at 5.43fps. Nothing may
  round that number.
- **The defeats:** every sheet delivered falls and GETS BACK UP, so `hold` was
  freezing the Companion upright and alive. The enemies were cut at
  `defeat_hold` in September; the Companions and Kids never were, and all 24 now
  are -- checked by eye on the built clips, and in the running game.
- **The gate asks `defeatCut`,** not the frame count: every clip is shorter now,
  so "fewer frames than the sheet" would pass a defeat that still recovers.
  `tests/sprites` also holds frames against fps, and sweeps every frame for the
  halo rather than nine (which is how `boggle/celebrate` joined the known-red
  list; it was never passing, only unsampled).

**7. Josh drops art in while you work.**
- **Enemies:** `ls -t animations/sprites/enemies | head` shows the newest
  delivery. A new file or a redraw turns `tests/enemy-stills` red until
  `python tools/prep_sprites.py --enemies` rebuilds it. Commit the built still,
  never the source.
- **Enemy animation sheets:** `ls -t animations/sprites/enemies/animations | head`.
  A new or redelivered sheet turns `tests/enemy-clips` red, checked by name and by
  SHA-1. `python tools/prep_sprites.py --enemy-clips --only <id>` rebuilds one
  enemy in about 3 minutes; a run without `--only` rebuilds all 27 in about an
  hour. Five arrived DURING round 6 and turned the gate red in the battery; that
  is the gate working, not a regression. A sheet under a new name that resolves to no EnemyDef needs an
  `ENEMY_ALIAS` entry: match it by eye against the stills. The sheets are
  gitignored; commit the built clips.
- **Backgrounds: none are coming** (item 3, Josh 2026-09-17). Do not look for
  `animations/backgrounds/` and do not run `prep_backgrounds.py`.

**8. The battery:** `python tools/devserver.py 8777`, then `python tools/gates.py`
(100 gates, about 30 minutes). On the round 6 merge it ran 100 gates in 1881s,
red only on the known three:
- `tests/sprites/check.py`: the seven HALO clips;
- `tests/run/run.py`: the Archivist on seed 371416, and `_losePatience` past
  turn 30;
- `tests/steam-deck`: the Map race, 6/0 run alone.
`steam-deck`'s Map row is load-sensitive, so re-run it alone before blaming a
change.

## THE UI PASS

`docs/ui-pass/README.md` is the loop's home: how a round runs, the traps, the
score log.

`UILOOP` holds the worktrees (`wt/`) and every capture a judge has seen
(`judging/r0` to `r5`, and `judging/r5/merged/`, the merged tree's fifteen
screens). Since round 5 it is session `f921e739`'s,
`C:\Users\Josh\AppData\Local\Temp\claude\C--Users-Josh-OneDrive-Desktop-Tandem-Tales-Midnight-Menagerie\f921e739-3596-4b9f-b0d2-9e78e6b37796\scratchpad\ui-loop`.
Session `5714ff4c`'s copy holds `judging/r0` to `r5`'s baselines too. A new
session moves the worktrees into its own scratchpad with `git worktree move`
(an instant rename on one drive) and copies `judging/` across, because
subagents write to their own session's scratchpad without permission prompts.
Keep it outside OneDrive, always.

| round | track | mean overall, in its round | merged |
|---|---|---|---|
| 0 | the kit, on Shop / Reward / Curiosity | LOCK 7.0 · WICK 6.3 · MOTH 6.2 · the game before 2.2 | LOCK `1641055` |
| 1 | REFINE Shop / Reward / Curiosity | OPAL 6.83 · RUNE 6.50 · IRIS 6.08 · before 5.58 | OPAL `ef3f7e8` |
| 1 | EXPAND Map / Safe Room / Game Over | HUSK 6.67 · FERN 6.44 · VANE 6.06 · before 3.06 | Map HUSK, the other two FERN `d30ab6d` |
| 2 | POLISH the six boards | BRAID 6.78 · AMBER 6.75 · CHALK 6.72 · before 6.22 | CHALK, decided on the rankings `a4b2ecc` |
| 2 | COMBAT, a Scuffle and a boss | FROST 7.25 · DUSK 6.75 · EMBER 6.25 · before 3.50 | FROST `04af2bc` |
| 2 | EXPAND-2 Lobby / Clubhouse / Atlas | GROVE 6.61 · IVORY 6.56 · HAZE 6.11 · before 2.56 | Lobby GROVE, the other two IVORY `31b6d8f` |
| 3 | POLISH the six boards | ONYX 6.56 · PEARL 6.28 · MINT 6.28 · before 5.50 | ONYX, 2 of 3 `1d9f09d` |
| 3 | COMBAT, with a full-hand board | TOPAZ 7.00 · QUILL 6.50 · SLATE 6.33 · before 5.17 | TOPAZ `f025e59` |
| 3 | DIALOGS opening / Settings / pile viewer | YARROW 6.61 · UMBER 6.56 · WILLOW 6.50 · before 2.72 | UMBER, decided on the rankings `6806123` |
| 4 | POLISH the six boards | ACORN 6.98 · CEDAR 6.82 · BASALT 6.63 · before 6.51 | ACORN `8d05ca5` |
| 4 | COMBAT, three boards | FLINT 7.33 (boss board 8.0) · GARNET 6.92 · EBONY 6.42 · before 5.58 | FLINT `265ac4d` |
| 4 | DIALOGS | KESTREL 7.00 · INDIGO 6.42 · JASPER 6.33 · before 4.92 | KESTREL `42753f9` |
| 4 | KIDS' PLACES | OCHRE 6.94 · MARL 6.94 · NUTMEG 6.83 · before 5.94 | Lobby NUTMEG, Clubhouse OCHRE, Atlas MARL `ecb9315` |
| 5 | POLISH the six boards | THISTLE 7.08 · SABLE 7.08 · RAVEN 6.92 · before 6.25 | THISTLE; a second judging agreed, 4 of 4 `dbcc970` |
| 5 | COMBAT, three boards | VESPER 7.11 · YEW 6.89 · WALNUT 6.83 · before 6.67 | VESPER, 2 of 3; a second judging agreed, 4 of 5 `e3f23aa` |
| 5 | DIALOGS | BIRCH 7.08 · ALDER 6.83 · CLOVE 6.58 · before 5.75 | BIRCH `5313c65` |
| 5 | KIDS' PLACES | GORSE 6.89 · ELDER 6.78 · FINCH 6.72 · before 5.89 | Lobby and Atlas GORSE, Clubhouse ELDER `25a5111` |

**Where the game is.**
- **Paintings:** Title, Companion Select, Kid Select and the opening's Kid picker
  ARE Josh's paintings.
- **Kit screens:** the six boards, combat, the lobby, the clubhouse, the atlas, and
  every Modal (the opening's story, Settings, the pile viewer, the confirm dialog),
  scoring between 6.0 and 8.0 in their last rounds.
- **Still web chrome:** the coach, the handoff veil and the toasts.

**The ceiling is the backgrounds.** Converting a screen has been worth about four
points. Refining a converted one is worth 0.5 to 1.8 points, most when the brief
names defects the judges can see. Every judge scores background near 6 on every candidate, because the
grounds are renders. Until Josh's paintings land, the loop plateaus around 7.

### A round, step by step

1. **Art first** (FIRST, item 2).
2. **Brief.**
   - Write `BRIEF-r<n>.md` self-contained: builders read EVERY brief the args list,
     in full, so never list an old round's brief, with its fix lists.
   - Write `RUBRIC-r<n>.md`, and `round-<n>.args.json`: per track its screens, a
     neutral baseline code, and three builders with slot, code, port 8831–8839 and
     angle; plus `maxBuilders: 6`.
   - Fix lists come from each judge's `worst_problem` for the winning screens, plus
     `grafts`. A judge's `winner_fixes` aim at THAT judge's winner.
   - Dry-run first: `python tools/ui_pass_probe.py docs/ui-pass/round-<n>.args.json`
     prints the agents, the queue, and a builder's and a judge's full prompt.
3. **Worktrees.**
   - `git worktree remove --force` last round's nine, keeping their branches for
     grafts. A running devserver locks a worktree: `Stop-Process` it first.
   - Then, per builder:
     `GIT_LFS_SKIP_SMUDGE=1 git worktree add -b ui/r<n>-<track>-<slot> "$UILOOP/wt/r<n>-<track>-<slot>" <base>`.
   - Make the twelve `judging/r<n>/<track>/<CODE>/` folders.
4. **Baselines.**
   - Photograph from the main checkout on 8777 with the brief's Deliverables
     commands, without `--port`.
   - Take each screen at the default size and again with `--w 1280 --h 800`, saved
     as `<screen>-1280.png`.
   - File them under the neutral codes, never "BASE".
5. **Launch:**
   `Workflow({ scriptPath: "docs/ui-pass/round-workflow.js", args: { ...round-<n>.args.json, repo, uiloop, base } })`.
   Nine builders took about five hours in round 2.
   - If a usage limit stops builders, finish the round as a NEW run of only the
     unfinished tracks, with `resume` set on each stopped builder. Never
     `resumeFromRunId`: it re-ran round 5's finished judges.
6. **Merge.**
   - **REFINE:** `git merge --no-ff` the winner's branch whole. Put the message in
     a file, because `git merge -F -` does not read stdin.
   - **EXPAND:** take one winner's branch whole, then lay the other winner's
     screen files on top with only the kit pieces those screens use (`31b6d8f`).
   - The result's `winnerHow` says whether a majority or the rankings decided.
   - Two appended `kit.css` sections conflict at the end of the file, and git
     aligns their shared `/* ===` opener and final `}`. Run
     `python tools/kitcss_merge.py <base> <branch>`, which rebuilds it from the
     blobs; never just delete the markers.
7. **Check.**
   - Endings, commit to commit: `git diff --numstat <base> HEAD` must equal the
     same with `--ignore-cr-at-eol`. The endings guard is for worktrees: in the
     main checkout it would rewrite Josh's modified `tests/critic-design/result.json`.
   - Photograph every merged screen beside its judged capture, one capture at a
     time.
   - Run the battery, then push.
8. **Log** the scores in the README, update this file and the memory, and brief
   the next round.

### How round 5 merged

- **REFINE, whole branches:** POLISH THISTLE, COMBAT VESPER and DIALOGS BIRCH.
  None conflicted: THISTLE's `kit.css` change was mid-file and VESPER made none,
  and BIRCH's merged by git alone, its change equal to BIRCH's line for line.
- **EXPAND, KIDS' PLACES:** GORSE's branch whole, with its `kit.css` tail joined
  by `tools/kitcss_merge.py`. Then ELDER's `clubhouse.*` on top, with only the kit
  pieces that screen uses, appended as their own section, and ELDER's webps and
  tool. Both sections defined `.kit-stud`; ELDER's is kept, because its winning
  Headquarters uses it. GORSE's `.kit-newsclip` and `newsclip.webp` served only
  its losing Headquarters and are removed. `25a5111`'s message has the whole list.
- **Checks on the assembled tree:**
  - every kit class the screens use is defined, and every referenced asset
    exists;
  - all fifteen screens photographed match their judged captures, the fights
    apart from THISTLE's top bar;
  - scene-css 0 conflicts, css-tokens 0 undefined, then the battery.
- **Reading a result:** `python tools/ui_pass_digest.py <task output> <track> --notes CODE --worst CODE`.
- **Still unconverted:** the coach, the handoff veil and the toasts.

## DONE 2026-09-16 (the WebGL room)

- **`tools/bgmetrics.py`** scores a capture against `UI/*.png` on the axes that
  separate a render from a painting: floor, shadow saturation, tooth per octave,
  edge width in pixels, ink share and depth, peak over median, mid-tone
  saturation and hue, tile spread. `--samples --patches` prints the targets.
  Every image is scaled to a common height, and a CROP's scale comes from the
  FULL image's height -- a 200 px patch upscaled to 900 reads 0.018 of fine tooth
  where it should read 0.28.
- **`tools/shot-scripts/backdrop-room.js`** photographs one region's room on its
  own through the atmosphere showcase, with the clock frozen. `region=`, `tier=`,
  `props=0`, `actor=0` and one-knob overrides (`tooth=`, `damask=`, `ink=`,
  `propsat=`...) come off the URL fragment, which is how every amount in the pass
  was set by eye against a 1:1 crop.
- **The room itself:** see FIRST, item 3a. Combat's room band went tooth 0.076 ->
  0.145 against mainMenu's 0.226, fine octave 0.050 -> 0.081 against 0.124, min
  channel 5.49 -> 3.32 against 2.32, edge width 2.55 against 2.52.
- **`tests/shader-literals/check.py`** is new and belongs to every future shader
  edit: a backtick inside a `/* glsl */` literal ends it, and a `${SPLICE}` the
  file does not import throws at module load. Both cost cycles today.
- **All seventeen regions swept** after every change, three times. That sweep is
  what caught the per-material chroma ceiling, the Kitchens' inked rafters, the
  damask printing on brick, the sky plane's missing 78 px and 10 m, and the
  Greenhouse's planting losing its mass. **Do not judge a backdrop change on one
  region.**
- **The battery on this work: 101 gates in 1920s, 3 red, all three the known
  rows** -- the seven HALO sprite clips, run.py's Archivist seed 371416 and
  `_losePatience`, and steam-deck's Map boss node. steam-deck read 5/1 in the
  battery AND 5/1 twice alone this time, which is the load-sensitive row memory
  already A/B'd red on `origin/dev` (2026-09-11); nothing in this pass touches
  the map or any layout. `tests/shader-literals` is the 101st gate and green.
- **AND MEASURE WHAT IT COSTS.** The first version was **+3.75 ms of a 11.2 ms
  frame -- a third** -- and 2.14 ms of that was the post grade alone. The round-2
  note that the post chain is bandwidth-bound is true for the taps it measured;
  six octaves of value noise is 24 hash calls on 921,600 pixels and it is not
  free. Cut to three taps with the same measured spectrum (**the finest octave is
  white noise, so it needs one hash, not four**), one tap for the wear field,
  `MM_TOOTH` off at tier low, and no drawn work on the ceiling: 13.79 ms, +2.56
  ms, 58 fps observed before AND after. `bash` the A/B out of
  `tools/gpuprof.py --scene combat`, three runs each way.
- **TWO TRAPS THIS PASS PAID FOR, and the second cost the most:**
  - **A staging directory keyed by BASENAME.** The A/B script copied the files it
    was about to swap into one flat folder, and `game/src/fx/backdrop.js` and
    `game/src/fx/shaders/backdrop.js` share a basename: the second overwrote the
    first, and the restore wrote the SHADER over the module. The game stopped
    booting (`state: no MM`) and the four checks queued behind it -- tier low,
    the seam diagnosis, steam-deck alone -- all ran against a dead build before
    anyone read a state file. Mirror the path, never the basename.
  - **A seam in a flat sky cannot be attributed by eye.** Two guesses were wrong
    before `frames=0` / `shafts=0` / `props=0` on
    `tools/shot-scripts/backdrop-room.js` pinned the Graveyard's dark band on
    the near frame's LINTEL, drawn over open sky where there is no doorway for
    it to be the head of. Layer A/B, not inspection.

## DONE 2026-09-14 to 09-15

- **Round 5 launched** from session `f921e739` (run `wf_64c93733-bc2`), after
  `5714ff4c`'s prep script finished the 30 baselines and the worktrees moved.
- **The weekly usage limit** stopped all six DIALOGS and KIDS' PLACES builders
  about an hour in (09-14 04:55). POLISH and COMBAT had finished.
- **Josh, 09-15: "Try again."** The six were resumed from their worktrees with a
  note on where each stopped (`ef6c00c`). `resumeFromRunId` re-ran POLISH's and
  COMBAT's judges as well (`d0de98e`). That second, blind judging picked the same
  two winners.
- **Merged:** POLISH THISTLE `dbcc970`, COMBAT VESPER `e3f23aa`, DIALOGS BIRCH
  `5313c65`, KIDS' PLACES GORSE's Treehouse and Atlas with ELDER's Headquarters
  `25a5111`.
- **BIRCH fixed two input bugs that were on dev:**
  - typing an E in the pile viewer's search ended the turn behind the dialog;
  - with Reset open over Settings, Tab stayed trapped on one button and Escape
    closed both dialogs.
- **The loop's README** logs round 5 and the three traps it paid for: the usage
  limit, one capture per dev server, and endings in the main checkout.
- **The enemies animate.** Nineteen enemies, from 78 of Josh's sheets, play
  idle, attack, hurt and defeat, and the Butler and the Governess also play cast.
  - **The build:** `prep_sprites.py --enemy-clips`, with 173 MB of atlases.
  - **The game:** `ClipPlayer` and EnemyView (FIRST, item 1).
  - **The gate:** `tests/enemy-clips`.
  - **Measured before it was decided:** the defeat sheets that get back up, the
    three silhouette names, the per-clip size cap, and the motion-blur fade.
- **The fade defect the enemy work turned up** (`5b312b8`): 37 Companion and Kid
  clips were drawn at 35% opacity mid-beat. `FADE_FLOOR` is now the list of clips
  that may fade; 16 slugs rebuilt; the sprites gate fails both ways round; Pipkin
  gained his `ready`; the manifest is written sorted.

## DONE 2026-09-13

- **The Butler** rebuilt from Josh's redraw (`e32e1ab`; enemy-stills 433 passed).
- **The loop's tooling:**
  - `maxBuilders` in the workflow (`d5935f6`): one capture peaks near 0.9 GB, so
    six builders at once, not nine.
  - `tools/on_port.py` (`6cfaef5`): every test hard-codes :8777, so a worktree
    ran its tests against `dev`.
  - Split decisions on the rankings (`d805f17`); `tools/shot.py --script @file`
    and `tools/shot-scripts/combat-crowd.js` (`662d874`); `tools/ui_pass_probe.py`.
- **Round 2 built, judged and merged** (`a4b2ecc`, `04af2bc`, `31b6d8f`). The
  battery then turned up two undefined tokens (`e14011b`).
- **Round 3 briefed** (`662d874`), built, judged and merged (`1d9f09d`, `f025e59`,
  `6806123`). `c53376a` moved two layout rules off shared kit classes for
  `scene-css`, and `8de2362` rebuilt the Butler from Josh's second redraw.
- **Round 4 built, judged and merged** (`8d05ca5`, `265ac4d`, `42753f9`, `ecb9315`).
  - KIDS' PLACES was assembled from three builders, one per screen.
  - `tools/kitcss_merge.py` and `tools/ui_pass_digest.py` were kept from the
    session's scratchpad.
- **Round 5 briefed** (`d1dd14b`), with its worktrees and baselines set up. Josh
  launches it in a new conversation.
- **Flagged for a separate session:** hovering a card dealt straight into the hand
  logs "ctxFor reading 'hand'" (true on dev too; a task chip was offered).

## DONE 2026-09-12

**The enemies are painted** (`9ddf7cd`). 51 enemies stand on the board as their
paintings: the Foyer, the Nursery, the Sleeping Quarters, the Kitchens and the
Greenhouse, delivered while it was being built.
- **The build.** `python tools/prep_sprites.py --enemies` builds them into
  `game/assets/sprites/enemies/<EnemyDef id>.webp`. `ENEMY_ALIAS` covers the four
  files whose names do not convert, including the Porcelain Twins, who arrived as
  `prim.png` and `proper.png`.
- **The switch.** `EnemyView` hides its rig in its CONSTRUCTOR when the manifest
  names a painting.
- **The gate.** `tests/enemy-stills/check.py` covers all of it, including a
  delivered source nobody built and a still built from older art.
- **The sources stay untracked** (`animations/sprites/enemies/`). The gate skips
  its source checks on a machine without them.
- **No matte repair runs on an enemy**, and each was measured before it was left
  out: `dewhite` erased brass highlights on 22 of the first 31. Read the
  enemy-stills comment in `prep_sprites.py` before turning one on.
- **A painted stage takes its painting's shape** (`combat.css`,
  `data-art="still"`). Wide Big Scares were drawing at 41% of their stage height.

**The Carnivorous Conservatory is the Greenhouse boss, and the Head Gardener is a
Big Scare** (`3a12203`).
- **The boss.** `bosses/carnivorous-conservatory.js` is the old §14 kit as phase
  one, at 300 Courage. Phase two follows StS2's own boss shape: below half, The
  Glass Gives Way clears its debuffs and hits every Kid, then the room grows 1
  Overgrowth a turn by itself.
- **The Gardener** moved to `enemies/greenhouse-gardener.js` at 150 Courage, with
  his thresholds scaled.
- **The chapter** (§14a, §16) carries both, so `tests/design-courage` needs no
  divergence.
- **The engine.** The enemy ctx gained `cleanse`, and so did
  `tests/enemies/index.html`'s mock.
- **Measured on the SAME decks at a 4th-wing boss door, 24 fights each:**

  | boss | wins | cost, % of pool | turns |
  |---|---|---|---|
  | the Conservatory, at 300 | 42% | 118% | 13.7 |
  | the Head Gardener it replaced | 21% | 123% | 11.6 |
  | the Confectioner | 83% | 71% | 10.7 |
  | the Bedframe Beast | 88% | 62% | 10.8 |

  It is easier than the Gardener was and still the hardest of the three.
  `tests/run/run.py` saw it three times, which is noise.

**The UI kit**, merged from rounds 0 and 1 (`d47b09c`..`45d1875`).
- **The stylesheet.** `game/src/ui/kit.css` has a header that indexes every
  component. The SVG engrave filters are in `game/index.html`.
- **Built from Josh's paintings.** `tools/prep_ui_kit.py` cuts the kit's pieces
  out of the select-screen paintings.
- **Rendered, not painted.** `tools/prep_ui_materials.py` renders the room
  grounds and materials.
- **Josh's backgrounds.** `tools/prep_backgrounds.py` builds his paintings into
  `game/assets/backgrounds/` and its `index.json`.
- **Hanging a painting.** `ui/kitboard.js` hangs a board's painting for the Safe
  Room and Game Over; `ui/backdrop.js` does the same job for the Map. POLISH fix
  21 unifies them.
- **Photographing a worktree.** `tools/shot.py --port` (`8173b94`) lets a build
  photograph itself on its own server. `tools/endings_guard.py` is the endings
  proof.

**For Josh to paint.**
- `docs/art/background-prompts.md` (`80c94de`) lists 25 paintings, each with its
  filename: 17 `combat-<wing>.png`, plus the map, rest, shop, event, reward,
  gameover, lobby and clubhouse. They go into `animations/backgrounds/`.
- `docs/art/enemy-stills-checklist.md` (`114dc31`, from
  `tools/enemy_art_checklist.py`) lists the 224 enemies without a painting and
  the filename each needs. `--check` flags a delivered name that needs an alias
  or clashes with another.

## JOSH'S CALLS — do not re-ask

- **Enemy animation sheets go in between UI rounds** (09-13, "do it after round 5
  merges"), never during one: `ui/enemy.js` is the COMBAT track's. Wired 09-15.
- **Enemy still SOURCES stay untracked** "for now" (09-12). The built `.webp` are
  committed.
- **NO BACKGROUND ART** (09-17, and it replaces the 09-12 call that he would
  paint them). The procedural room is final; the loop's job is to take it as far
  as procedure goes. `docs/art/background-prompts.md` is retired.
- **A BACKGROUND'S COLOUR IS NOT HELD TO `UI/*.png`** (09-17, and it closes the
  only question round 8 left open). *"it is way more important that it just look
  appropriate for the setting and as accurately presented with readable objects
  that make sense and are drawn with care and attention (straight lines,
  appropriate scale, etc)"*. The Greenhouse stays green, the Ballroom plum, the
  Passages magenta; `midHue`/`midSat` are not targets. The samples are still the
  reference for CRAFT, not for hue. Round 9 is re-weighted around it:
  `BRIEF-r9.md`, `RUBRIC-r9.md`.
- **The Carnivorous Conservatory is the Greenhouse boss** (09-12), and the Head
  Gardener is "just a big scare".
- **The SS sheets are never committed** (standing). That includes the Kid sheets.
- **`tests/critic-design/result.json`** has been modified in the main checkout
  since before this session. It is not yours; never commit it.

## DO NOT RE-DERIVE THESE

- **A test run from a worktree tests `dev`.** All 102 test scripts hard-code
  `:8777`, the main checkout's server. `python tools/on_port.py PORT <test>` runs
  one against a worktree's own server.
- **A judge's `winner_fixes` aim at that judge's own winner.** To brief the next
  round on a winner, read every judge's `worst_problem` for it.
- **Judge scores anchor to the candidates beside them.** Round 0's winner scored
  7.0 in round 0 and 5.58 as round 1's baseline. Compare a winner with the
  baseline in its own round, never across rounds.
- **The enemy-stills gate goes red whenever Josh delivers.** A new file trips
  "every delivered source is built". A redraw trips the IoU check against the
  built still. Rebuild; don't debug.
- **So does the enemy-clips gate, for his animation sheets.** A new sheet trips
  "every delivered sheet is built", and a redelivered one the SHA-1 check. Rebuild
  that enemy with `--enemy-clips --only <id>`; don't debug.
- **EVERY defeat sheet gets back up** -- all 22 enemies and all 24 Companions
  and Kids. The last frame matches the first (silhouette IoU 0.87-1.00). The
  build cuts each at `defeat_hold`; never hold a defeat sheet's own last frame.
- **Every deck sits EXACTLY at its cost quota.** Adding a Trick at cost 1, or
  moving one back down, turns `cost-curve` red. That is deliberate. Offset it in
  the same deck and rarity.
- **`ev.card.cost` is the printed cost; `ev.cost` is what the play took.** X is
  -1 and ignores discounts (trap 61).
- **A one-shot discount is spent only by a Trick it PRICED.** The engine passes
  `pricedWith` (trap 62). An X Trick spends none.
- **A free X still counts the owner's Nerve and spends none.** The seam is
  `hooks.any('playsFree', { card })`, asked of X Tricks only.
- **Anything "next turn" banks:** `U.energyNextTurn`, `U.guardNextTurn` (trap 24).
- **A delayed effect runs with NO CARD**, so `N(c)` is empty. Capture the
  resolved nums when you SCHEDULE it (trap 63).
- **A Kid builds at `KID_TARGET_CONTENT_H = 256`, a Companion at 128.**
  `SLUG_ALIAS` maps the delivered `prya` to the game's `priya`.
- **`tests/upgrade-effects` is report-only on purpose.** Read its docstring before
  "fixing" the number.
- **An expedition is a route the party chooses door by door**, so `sweep.py`
  returns 0 loadouts. To measure a mid-house boss, use `bench({ loadout,
  encounterTier, encounterId, hpScale, region, routeIndex })` from
  `tests/critic-design/lib/expedition.js`.

## OPEN, NAMED, NOT STARTED

**Left in the WebGL room after 2026-09-16, honestly:**
- **`animations/backgrounds/` is still empty.** Procedure now gets the surfaces,
  the structure, the light and the ink; what it cannot invent is a painting's
  SUBJECT. The samples' rooms are near-black with ornament and props that have
  drawn detail -- pages on a book, drips on a candle, a gilt edge -- and that is
  still Josh's.
- **The region palettes are far more saturated than the samples in places.** The
  Ballroom is plum and magenta at exposure 3.55, the Greenhouse acid green. The
  PROPS are capped now (`PROP_MATERIAL.sat`) but the walls and floors are as
  authored, and nobody has decided whether those palettes are deliberate. Ask
  before re-tuning them: it is a design change.
- **The Greenhouse's planting reads as clumps**, not as individual plants, and
  the statue's arms are crude. Both are shape work in `shapeField`, and both are
  better than they were rather than right.
- **The Foyer's floor is planks** (`floorPattern: 0`) where `selectKid.png` shows
  stone. The authored choice was left alone.
- **One cosmetic slip, knowingly left:** the floor's grit subtracts its own
  shadow (`col *= 1.0 - speck*0.22`) without the `drawable` guard the rest of
  that block has, so at a grazing angle it averages a ~3% darkening over
  sub-pixel cells. Costs a 7-minute 17-region re-sweep to fix and verify; not
  worth a round on its own.

- **The co-op lobby loses keyboard focus on every wire message.** GROVE's
  `_paintRoom` rebuilds the board; IVORY's lost lobby had kept focus
  (`ui/r2-expand2-c`). The game did the same before round 2.
- **`.kit-field`, `.kit-select`, `.kit-select-wrap` and `.kit-hatch` are unused**
  since IVORY's lobby lost. Round 3's DIALOGS may take the first three.
- **Part art.** The Hydra's Heads, the Wardrobe's Doors, the Favorite Doll, the
  Gardener's seeds and the Growth Patches are still drawn rigs. The Hydra and
  Wardrobe paintings include their parts, so those two fights show the parts
  twice.
- **224 enemies have no painting.** The checklist names each.
- **The Conservatory's 300 Courage is an opening bid.** Measure it again once
  Josh has played it.
- **218 upgrades move nothing a fight can see.** `python
  tests/upgrade-effects/check.py --verbose` names every one. The worst decks are
  pipkin 23, drizzle 26, brambleboo 25, and mopsy and mossbit at 28.
- **Thirteen decks' dead-effect lists** are in
  `docs/notes/2026-09-11-card-cost-pass.md`, under "Found and NOT fixed".
- **`maya/defeat` fails the HALO bar**, and so do Taffy's five clips and
  `boggle/celebrate`. Fixing any of them means re-tuning a matte rule against all
  196 clips. Boggle's is the newest name on that list and the oldest defect: the
  gate used to measure nine sampled frames and now sweeps every one, and over the
  whole clip he has always read 0.484 against a 0.50 bar.
- **The Calling Bell and 255 other enemies have no animation.** They stand as
  stills or rigs until Josh's sheets for them arrive.
- **Bones' and Marmalade's atlases still predate the current matte rules** in
  part: rebuilding Bones on 09-15 moved 0.01-0.11% of his pixels and added the
  UNTAIL and DEBLACK flags to his index. Marmalade has not been rebuilt since
  09-04. Neither is visibly wrong; a rebuild is cheap if one ever looks it.
- **The built Kid stills are older than their sources.** A rebuild re-keys them to
  first names, which needs `STILL_ALIAS` in `ui/sprite.js` updated in the same
  commit, and it rewrites ten Companion stills. Compare all 24 before and after.
- **22 SS sheets are still tracked** from `e2233c1`. Untracking them is a decision
  nobody has made.
- **Wisp's Too Bright for Bedtime** only discounts retained cards. It needs a
  "next two Tricks played" status through `discountHooks`.
- **Wink's `readSuccess` cannot survive the enemy phase.** It lives in
  `turnFlags`.

## TRAPS

- **`var(--x, fallback)` still needs `--x` defined somewhere,** or `css-tokens`
  goes red. A merge that drops the only file setting a knob does exactly that
  (`e14011b`).
- **When three judges named three winners,** the old vote count returned the
  first judge's pick. Rankings decide now (`d805f17`); read `winnerHow`.
- **Nine builders at once is more than this 16 GB laptop holds.** One Playwright
  capture peaks near 0.9 GB. Keep `maxBuilders` at 6.
- **The working tree can hold CRLF where git holds LF, and `git status` won't
  say.** `git ls-files --eol` shows `i/lf w/crlf`. A census, `grep` or `sed` of
  the working tree then lies about the committed file. Patch from the blob.
  `python tools/endings_guard.py --base <sha>` rebuilds endings from the blob and
  proves them with both numstats.
- **The Edit tool rewrites a MIXED file whole.** `combat.css` came back
  all-CRLF: 18/15 lines, against 4/1 ignoring CR. Its 14 bare LFs are real.
- **`scenes.go` drops a call made while `busy`.** An in-page scene switch waits
  for `!window.MM.ctx.scenes.busy`, then calls `go(..., { instant: true })`. The
  enemy-stills gate went from 6.5 minutes to 1.5 once it switched in-page, and
  failed four boards until it waited.
- **Poll for a class; don't time a CSS state.** The lights-out check read
  `filter: none` on a fixed delay.
- **A running devserver locks its worktree.** On Windows, `git worktree remove`
  says "Permission denied". Stop the server with PowerShell `Stop-Process`
  first.
- **A per-screen merge drags shared pieces with it.** HUSK's Map needed its
  `.kit-railframe`, `.kit-light` and four tokens ported into FERN's kit by hand.
- **Printing judges' notes on Windows** raised UnicodeEncodeError. Set
  `PYTHONIOENCODING=utf-8`.
- **Heredocs mangle backslashes** (09-11). Write patch scripts with the Write
  tool. It happened again 09-15: a heredoc patch's `\w` never matched.
- **A usage limit can stop builders mid-build, and `resumeFromRunId` re-runs
  more than it should.** It replays a finished agent only when it is called in
  the same order. Finish a stopped round as a new run of its unfinished tracks,
  with `resume` on each stopped builder (`round-workflow.js`).
- **One dev server serves one capture at a time.** Its listen backlog is 5. Two
  `shot.py` runs at once get ERR_CONNECTION_REFUSED on fonts and images, and
  write console files that look like page errors.
- **A threshold tuned on one Companion is not a rule.** `DIP_THRESHOLD` was set
  in the gap Marmalade's twelve clips left, and caught 39 more when the other 23
  slugs were built. Where a measurement cannot separate two intents -- a dissolve
  from a lunge's motion blur -- name the members instead, and quote the brief in
  the table (`FADE_FLOOR`).
- **A partial sprite build used to reshuffle the whole manifest**, because
  carried entries kept their order and rebuilt ones landed at the end. It is
  written sorted now; a diff there is a real change.
- **The endings guard in the main checkout rewrites files that aren't yours.** It
  repairs every file that differs from its base, and Josh's modified
  `tests/critic-design/result.json` is one. Prove a merge's endings commit to
  commit instead.

## GATES

Every number below is from the battery on the round 3 merge (`8de2362`),
2026-09-13. The round 4 merge's battery (`ecb9315`) matched it: red only on the
known sprites and run.py rows, with steam-deck 6/0, map 30/0 and coop/lobby 29/0.
The round 5 merge's (`25a5111`, 2026-09-15, 1754s) matched again. Only two
counts grew with the new code: seams checks 8506 call sites, and scene-css 1424
classes. With the enemy clips (09-15) the battery is 100 gates in 1917s, red
only on the known three. The round 6 merge's (2026-09-16, 1881s) ran 4 red, and
the fourth was `enemy-clips` reporting twenty sheets Josh had delivered WHILE
the round ran -- the gate working, not a regression. Built, it is 921/0/0 across
27 creatures. steam-deck went 5/1 then 6/0 run alone, as it always does.

| gate | reads |
|---|---|
| `tools/gates.py` | 100 gates in 1881s, 3 red: sprites and run.py (known), steam-deck (the Map race; 6/0 run alone) |
| `tests/enemy-clips/check.py` | 921 passed, 0 failed, 0 console errors (27 enemies; beats on door-greeter, dust-bunny, butler) |
| `tests/cards/run.py` | 1470 cards, 0 errors, 0 warnings |
| `tests/combat/run.py` · `tests/coop/run.py` | 695 · 645 |
| `tests/cost-curve/check.py` | 17 passed, 0 failed |
| `tests/upgrade-effects/check.py` | 1288 upgrades played, 218 moved nothing, 28 unplayable on this board, 54 need a friend, 72 hinge on a choice, 0 stale waivers, 0 broken, 0 console errors |
| `tests/sprite-triggers/check.py` · `tests/kid-clips/check.py` | 292 · 10 |
| `tests/sprites/check.py` | 196 clips, 24 stills, 51 enemy stills, 7 failures (known: Taffy's five HALO clips, `maya/defeat` and `boggle/celebrate`), 4 dissolve envelopes verified, 24 deaths cut before the recovery |
| `tests/sprites/clips.py` | 28 passed, 0 failed |
| `tests/enemy-stills/check.py` | 433 passed, 0 failed, 0 console errors |
| `tests/greenhouse/check.py` · `tests/design-courage/check.py` | 45 · 129 checked, 0 failures |
| `tests/turn-events/check.py` | 155 files scanned, 4 raw turn listeners (0 unguarded), 46 through U.onPlayerTurn |
| `tests/hook-names/check.py` | 167 files, 41 engine hooks, 84 companion hooks, 97 listeners, 201 declared, 0 unknown |
| `tests/seams/proof.py` · `tests/seams/check.py` | 52 · 8506 call sites checked, 0 problems |
| `tests/css-tokens/check.py` · `tests/scene-css/check.py` | 0 undefined tokens · 13 scene sheets, 1424 classes, 0 conflicts |
| `tests/net/run.py` · `tests/map/run.py` · `tests/chrome/run.py` | 190 · 30 · 27 |
| `card-face` · `piles-reachable` · `settings-play` · `gamepad` · `gameover-keeps` | 14 · 24 · 19 · 23 · 16 |
| `tests/combat-scene/seam.py` · `tests/coop/lobby.py` · `tests/coop/matedeck.py` | 22 · 27 · 11 |
| `tests/enemies/run.py` · `audit.py` | 275 enemies, 0 errors · 20104 enemy turns audited, 0 errors |
| `tests/backpack/run.py` · `tests/critic-design/run.py` | 80 checks, 0 failures · {"passed": 695, "failed": 0} |
| companion suites | boggle 31, bones 30, brambleboo 52, crinkle 49, crumbula 25, drizzle 71, hush 17, marmalade 29, mopsy 28, mossbit 59, pipkin 23, pudding 52, taffy 12, truffle 107, wink 86, wisp 128 — all 0 failed |
| `tests/run/run.py` | 50 runs, 2 errors  (115871 ms) (known: the Archivist on seed 371416, `_losePatience` past turn 30) |
| `tests/steam-deck/run.py` | 5 passed, 1 failed in the battery (the Map boss node, load-sensitive); 6 passed, 0 failed alone |
