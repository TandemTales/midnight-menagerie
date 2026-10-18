# Round 35 — the next four rooms, and their near floor: the Attic, the Sleeping Quarters, the Graveyard, the Crypt

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md` and `BRIEF-r34.md` in full:
rounds 31 and 34 are the rounds this one repeats, for four more wings. Read
`VERDICTS-r34.md` too: what its judges rewarded (a drawn, broken silhouette;
an object standing IN the near floor) and punished (spiky "crags", props
washed to one grey). This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r35.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s.

## WHY THESE FOUR

Survey 5 (`SURVEY-2026-10-16.md`) put the rooms at 4-6.5 against the boards'
6-7.5. After round 34's four, these are the next four on both judges'
headroom lists (the Heart follows in round 36):

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Attic** | 5, +1.5 | 5.5, +1.5 | "the trunks and crates are plain cubes and an orange haze fogs the right foreground"; "the left half of the attic is black void (left wall and trunks dissolve), and the floor is a soft purple haze" |
| **Sleeping Quarters** | 4, +2 | 6, +1 | "the iron beds left and right are boxy low-poly forms with smeared flat blankets, and the walls are untextured"; "the centre floor (the lower 55%) is an empty purple-black plank field; the bed frames are thin" |
| **Graveyard** | 4, +2 | 6, +0.9 | "the ground is a uniform milky grey murk and the chapel is a flat box with a tiled brick texture"; "the chapel at upper left is a flat box with a tiled brick texture and a bare roof plane" |
| **Crypt** | 5, +1.5 | 5.5, +1.2 | "the niche plaques and the sarcophagus at right are pale, milky flat boxes"; "the ceiling and the centre of the floor are black void and the floor flags are soft" |

Round 31 owned the Graveyard and coursed its chapel; both judges still read
the chapel as a box with a texture. The SILHOUETTE is what reads (round 34's
lesson): buttresses, a slate roof with a ridge and eaves, a porch.

## THE FIX LIST

### 1. THE NEAR FLOOR

In your four wings the floor nearest the camera is DRESSED and LIT: boards,
flags or turf with tone and edges; a pool of light on it from a source the
room has; one or two props standing IN it, not against the back wall (the
Attic: a strapped trunk, a dust-sheeted chair, a dress form, a lamp; the
Sleeping Quarters: a rug, a trunk at a bed's foot, a dropped toy, lit from
the window; the Graveyard: dark grass with path edges, a near headstone or
two, a lantern; the Crypt: bones or rubble on the flags, a candelabra pool).
In a fight the lower third is under the hand, so dress the band ABOVE the
hand's top edge first. Reuse round 31's and 34's mechanisms
(`VERDICTS-r31.md`, `GRAFT-r34.md`); a SHARED rule is welcome only with the
seventeen-room sweep below.

### 2. EACH WING'S OWN DEFECT

- **The Attic:** no plain cubes -- strapped trunks with lids and hasps,
  crates with slats, dust sheets with folds, a dress form; the left half
  lit (a second skylight beam or a lamp) so its wall and trunks read; no
  orange or purple haze lying on the floor.
- **The Sleeping Quarters:** the iron beds DRAWN -- inked head- and
  foot-rails with finials, quilts with a pattern and folds, pillows; the
  walls given a wainscot and grain, not a flat plane.
- **The Graveyard:** the ground dark grass with tone and path edges, never a
  milky grey murk; the chapel a building -- buttresses, a slate roof with
  ridge and eaves, a darker wall, a lit porch, ivy.
- **The Crypt:** the niche plaques and the sarcophagus carved stone, dark and
  grimed (not milky boxes); vault ribs overhead lit by the candelabra, so
  the ceiling is not black void; the floor flags crisp.

### 3. INK, NOT GRAIN; DARK, NOT MILKY

Edges that matter (bed rails, trunk straps, buttresses, vault ribs, plaque
mouldings) are inked crisp with round 21's pen. Soft or hazy is still worse
than stepped. A dark washed pale or milky is a defect, not a fix -- the
Graveyard and the Crypt were both called "milky".

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark
is too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/`
prep scripts, extended. A shared near-floor rule that lifts other wings too
is welcome ONLY with the seventeen-room sweep, SEEDED (`room_batch --rooms
wing:kind,...`, the list in `docs/ui-pass/survey-2026-10-16.sh`), proving
none got worse.

**Not yours:** the other thirteen wings (otherwise unchanged) -- round 34's
four above all; round 28's painted house and shared contact-shadow rule; the
pen and floor camera from round 21; `ui/enemy.js`, the stand-in room,
`core/renderer.js` (keep its render-scale governor: Josh's standing rule),
the boards, the run strip, the cards, the hand, `ui/hang.js`, the sprites,
gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6`, a fight in each of your four wings against BASE,
  interleaved, three pairs; read the DELTAS (round 34 found T_full bimodal
  page to page while the machine settled; `tools/shapeprof.py` isolates a
  cost inside one page). 15.5 ms hard; the Graveyard was ~16.5 ms before
  round 31 -- leave it no worse than BASE. Cold-start time
  (`tools/coldstart.py`) in the perf report. Check `tasklist` for games.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`, not 180
  (round 34 lost fights to "Target crashed" and "never finished warming").
- **Commit after every step that works.** Round 34's builders were stopped
  twice by usage limits; whatever is committed survives.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py` (directly if on_port says it never names
  8777), `tests/link-queue`, `tests/combat-scene/seam.py`, `tests/chrome`,
  `tests/steam-deck`, and the region gates `tests/attic-observatory`,
  `tests/sleeping-quarters`, `tests/graveyard`, `tests/crypt`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py attic     --port PORT --tier medium --seeds attic,library          --out JUDGING/CODE/sheet-attic.png
cd "WT" && timeout 1500 python tools/variant_sheet.py sleeping  --port PORT --tier medium --seeds dormitory,bedroom      --out JUDGING/CODE/sheet-sleeping.png
cd "WT" && timeout 1500 python tools/variant_sheet.py graveyard --port PORT --tier medium --seeds yard,plots,gate        --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && timeout 1500 python tools/variant_sheet.py crypt     --port PORT --tier medium --seeds catacomb,family,ossuary --out JUDGING/CODE/sheet-crypt.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-graveyard --port PORT --scene combat --region graveyard --encounter gy-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-graveyard-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
