# Round 25 — the last four rooms: the Greenhouse, the Graveyard, the Foyer, the Ballroom

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`,
`BRIEF-r22.md`, `BRIEF-r23.md` and `BRIEF-r24.md` in full: this round is
round 24 again, for the last four wings. This file wins wherever they
disagree. **Your rubric is `RUBRIC.md` as amended by `RUBRIC-r25.md`.**

## WHY THESE FOUR

Rounds 22, 23 and 24 rebuilt twelve wings from the 2026-09-30 survey (+2.64,
+3.01, +3.78). These are the last four, and they are different: they are
the wings rounds 8 to 18 worked on, so they are the BEST of the survey's rooms
(3-5) — but every one carries the survey's last shared defect, objects that
are "upscaled low-res sprites that both stair-step and blur".

| wing | judge 1 | judge 2 | what both said |
|---|---|---|---|
| **Greenhouse** | 3, +2.5 | 4, +2 | "every potted fern and planter leaf is a pixel-stepped low-res sprite (blocky staircase edges at 1:1)"; "the acid-green floor is the loudest surface in the room" |
| **Graveyard** | 3, +2 | 4, +2 | "the headstones and the tall cross monument are pixel-stepped sprites"; "the ground ends at y≈600, and everything below is an unlit black void with a hard dark band" |
| **Foyer** | 4, +1.5 | 5, +1 | "a milky purple-grey haze lies over the grand stair and its landing"; "the grand staircase, balcony rail and balusters are soft and hazy, a low-contrast brown smear" |
| **Ballroom** | 5, +1 | 5, +1 | "the tall arched windows along the back wall are milky grey panes, and the fluted columns lean inward"; "the grand piano is a soft, low-resolution blur" |

**The Foyer is the first wing of every expedition**: it is the room a new
player judges the game by. Weight it accordingly.

**Read how rounds 22 to 24 did it** (`git log --stat 489d6c9..HEAD --
game/src/fx`): a wall program and props per wing, the other wings
byte-identical. **The trap is different this time.** Those twelve wings
moved to programs of their own; these four still share the older programs
(0-7) and their subjects with each other AND with the Heart (and the
Pumpkin Grounds' exterior house shares the Graveyard's). A change to a
shared subject or prop moves a wing that is not yours. Either give each of
your wings its own program, as rounds 22-24 did, or prove with the sweep
that every other wing is byte-identical. Every program and prop id rounds
22-24 added is TAKEN: add yours after the highest.

## THE FIX LIST

### 1. NO SPRITE-STEPPED OBJECT — both judges, all four wings

Find every object in these rooms that is drawn from a low-resolution source
— a texture, an atlas cell, a silhouette sampled at a coarse size — and that
stair-steps or blurs at 1280x800 at the Deck's tier: the Greenhouse's ferns,
palms and planters; the Graveyard's headstones, cross monument and angel; the
Ballroom's piano and chairs; anything in the Foyer. **Measure** (crop at 2x
nearest-neighbour; find where the source resolution enters) and then redraw
each one with smooth, pixel-aware edges — round 21's pen, a distance field,
or a higher-resolution source — so it is crisp at 0.8 upscaled. A soft object
is not a fix for a stepped one.

- **The Greenhouse's plants** are drawn foliage with inked leaf edges and
  veins; the acid-green floor goes toward a deep moss.
- **The Graveyard's stones** are crisp, carved, with lettering or relief;
  its lawn and path run lit to the bottom of the frame, with foreground
  headstones in it — no black band, no void.
- **The Foyer's grand stair** — string, balusters, rail, landing — is crisp,
  smooth ink with NO haze over it; its empty foreground floor is dressed (a
  rug's border, a hall table, an umbrella stand).
- **The Ballroom's windows** are deep night-blue glass with drawn muntins,
  not milky panes; its columns stand TRUE VERTICAL; its piano and chairs are
  drawn objects; its checker floor is staged (a chandelier's reflection, a
  dropped fan, a chair), not a bare magenta field.

### 2. A WALL IS BUILT, NOT A TEXTURE — both judges

The worst material in all four wings is a mottled cloud/noise texture with
outline drawing laid on it in place of a built surface. Every wall, roof and
room this round is BUILT: glazing, stone, panelling, mouldings,
joints, with
relief and light, drawn with round 21's pen where it is a line. **And the
darks stay dark**: a pale, milky or grey dark is a defect.

### 3. OBJECTS ARE DRAWN, NOT NOISE

"Noise blobs standing in for the wing's signature object" was both judges'
system defect. A fern, a headstone, a baluster, a piano must have a SILHOUETTE a
viewer names at a glance, with its own shading and a contact shadow on the
floor. Speckle is not texture.

### 4. NO HAZE, NO MILK

The survey's Foyer stair is under "a milky purple-grey haze"; the Ballroom's
windows are "milky grey panes". Round 21's rubric holds: a soft or hazy
room is a worse defect than a stepped one. Take the haze off; keep the darks
deep. Say in your notes if you change a palette COLOUR, and why.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, their kinds and props; the palette's COLOURS only
where a wall is too pale a dark, and say so in your notes), and
`fx/shaders/grade.js` only if a fix truly needs it. `tools/` prep scripts if
you make art, extended rather than duplicated.

**Not yours:** the other thirteen wings (prove you left them alone: sweep
all seventeen before and after, and compare content, not hashes; shared code
paths are the trap — round 17 found the Bathhouse sharing plant crowns with
the Greenhouse); the pen and the floor camera from round 21, and rounds 22-24's twelve wings,
their programs and props, AND the Heart (use them, do not rewrite them); `ui/enemy.js`, the stand-in room, `core/renderer.js`, the run
rail, the hand, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier: a fight in
  each of your four wings against BASE, interleaved, three runs, `--wait 40`,
  15.5 ms hard. The Greenhouse and Foyer frames are the reference and are at
  the budget already; a new wing's fight must not be the next one over.
- **BASE's server goes on YOUR port + 100** (9061 -> 9161 and so on),
  never on a port in 9061-9063. In round 22 one builder's BASE sat on
  another builder's port for an hour, and Windows let both bind.
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step); the sheets
  below pass `--tier medium`.
- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/dup-keys/check.py` (round 23's winner left four dead
  `ROOMS_PROGRAM` keys behind when it moved subjects to its own programs, and
  no builder ran it), `tests/shader-literals/check.py`, `tests/combat-scene/seam.py`,
  `tests/chrome`, `tests/steam-deck` (the Map boss row is a known race), and
  every region gate for your four wings (`tests/greenhouse`,
  `tests/graveyard`, `tests/foyer`, `tests/ballroom`) and `tests/heart`.
- Stop ONLY the processes you started, BY PID. Commit as you go (round 21
  lost a day to a usage limit mid-round; the commits are what resumed it).
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. An
  unwritten uniform is `(0,0,0,1)`, not zero. **Say in your notes what you
  did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --tier medium --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --tier medium --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --tier medium --seeds parlor,gallery,landing       --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --tier medium --seeds ballroom,mirrorhall,suite    --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/shot.py CODE-fight-foyer     --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-graveyard --port PORT --scene combat --region graveyard --encounter gy-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The two fights also at `--w 1280 --h 800` as `<screen>-1280.png`. Copy the
fights' PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fights and LOOK at every frame.
