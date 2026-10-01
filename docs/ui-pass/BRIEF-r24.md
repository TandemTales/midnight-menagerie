# Round 24 — the house's own rooms: the Nursery, the bedrooms, the Library, the Crypt

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`,
`BRIEF-r22.md` and `BRIEF-r23.md` in full: this round is round 23 again, for
four more wings. This file wins wherever they
disagree. **Your rubric is `RUBRIC.md` as amended by `RUBRIC-r24.md`.**

## WHY THESE FOUR

Rounds 22 and 23 built the eight wings the 2026-09-30 survey said lacked
their name (+2.64 and +3.01). These are the next four by both survey judges'
headroom: rooms that HAVE a subject but draw it as boxes and texture.

| wing | judge 1 | judge 2 | what both said |
|---|---|---|---|
| **Nursery** | 3, +2 | 4, +1 | "the cribs and cots across the middle are boxy crate shapes with a plank texture, under a back wall washed in pale lavender light with flat grey curtain planes" |
| **Sleeping Quarters** | 3, +2 | 3, +2 | "the back wall is a raw electric-blue flat colour, and the two beds are cardboard boxes with a quilt texture pasted on the front"; it copies the Nursery's portraits-and-cabinets template |
| **Study & Library** | 4, +1.5 | 3, +2 | "the bookcases filling the back wall are a soft smear of vertical streaks where no shelf or spine reads"; "the two foreground cabinets are the same crate-box prop reused" |
| **Crypt & Ossuary** | 3, +2 | 4, +2 | "the ossuary walls' niches and arches blur into an unreadable blue texture, and the room's only objects are two grey box tombs and a lamp post"; "two green shafts read as thin laser lines, not light" |

**Read how rounds 22 and 23 did it before you start** (`git log --stat
489d6c9..HEAD -- game/src/fx`). Each wing got its OWN wall program, so the
other thirteen wings stayed byte-identical. The signature objects are props
under the `MM_WINGS` define. Round 22's graft drew a library passage's
spines (rounded, lit, gilt-banded, varied) and round 23's drew an attic of
trusses: learn from both. **Every program and prop id rounds 22 and 23
added is TAKEN** -- find the highest in `ROOMS_PROGRAM` and the prop switch
and add yours after them; never reuse an id.

## THE FIX LIST

### 1. EACH ROOM'S SUBJECT IS DRAWN, NOT BOXED — both judges, all four wings

- **The Nursery has cribs and toys.** Cribs and cots with turned spindles and
  a canopy, a rocking horse, a toy chest, dolls on a shelf, a mobile;
  curtains with folds. Its sewing/blanket room reads as that. No plank crates.
- **The Sleeping Quarters have beds.** Four-posters with turned posts,
  canopies and hanging curtains, pillows and blankets with volume; a bedroom
  with its hearth. It must NOT read as the Nursery re-lit: a wing's room is a
  room that wing really has (BRIEF-r11).
- **The Study & Library is a library.** A gallery of shelves with lit,
  varied spines that read as books (not a streak texture), a library ladder,
  a reading desk with a green-shaded lamp, a globe; the fireplace study its
  hearth and writing desk. Retire the reused crate cabinets.
- **The Crypt is a crypt.** Ossuary niches of stacked skulls and long bones
  that READ, sarcophagi with carved lids, candle clusters, a chapel's altar.
  The "laser line" shafts become light or go.

### 2. A WALL IS BUILT, NOT A TEXTURE — both judges

The worst material in all four wings is a mottled cloud/noise texture with
outline drawing laid on it in place of a built surface. Every wall, roof and
panelled room this round is BUILT: panelling, plaster mouldings, brick,
stone courses, vaulting,
joints, with
relief and light, drawn with round 21's pen where it is a line. **And the
darks stay dark**: a pale, milky or grey dark is a defect.

### 3. OBJECTS ARE DRAWN, NOT NOISE

"Noise blobs standing in for the wing's signature object" was both judges'
system defect. A crib, a bed, a book, a skull must have a SILHOUETTE a
viewer names at a glance, with its own shading and a contact shadow on the
floor. Speckle is not texture.

### 4. THE DARKS

The Sleeping Quarters' "raw electric-blue" wall and the Nursery's "pale
lavender wash" are the two worst darks in the house now. Deep indigo,
aubergine and walnut, lit in candle pools. Say in your notes if you change a
palette COLOUR to get there, and why.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, their kinds and props; the palette's COLOURS only
where a wall is too pale a dark, and say so in your notes), and
`fx/shaders/grade.js` only if a fix truly needs it. `tools/` prep scripts if
you make art, extended rather than duplicated.

**Not yours:** the other thirteen wings (prove you left them alone: sweep
all seventeen before and after, and compare content, not hashes; shared code
paths are the trap — round 17 found the Bathhouse sharing plant crowns with
the Greenhouse); the pen and the floor camera from round 21, and rounds 22 and 23's eight wings,
their programs and props (use them, do not rewrite them); `ui/enemy.js`, the stand-in room, `core/renderer.js`, the run
rail, the hand, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier: a fight in
  each of your four wings against BASE, interleaved, three runs, `--wait 40`,
  15.5 ms hard. The Greenhouse and Foyer frames are the reference and are at
  the budget already; a new wing's fight must not be the next one over.
- **BASE's server goes on YOUR port + 100** (9051 -> 9151 and so on),
  never on a port in 9051-9053. In round 22 one builder's BASE sat on
  another builder's port for an hour, and Windows let both bind.
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step); the sheets
  below pass `--tier medium`.
- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/dup-keys/check.py` (round 23's winner left four dead
  `ROOMS_PROGRAM` keys behind when it moved subjects to its own programs, and
  no builder ran it), `tests/shader-literals/check.py`, `tests/combat-scene/seam.py`,
  `tests/chrome`, `tests/steam-deck` (the Map boss row is a known race), and
  every region gate for your four wings (`tests/nursery`,
  `tests/sleeping-quarters`, `tests/study-library`, `tests/crypt`).
- Stop ONLY the processes you started, BY PID. Commit as you go (round 21
  lost a day to a usage limit mid-round; the commits are what resumed it).
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. An
  unwritten uniform is `(0,0,0,1)`, not zero. **Say in your notes what you
  did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && python tools/variant_sheet.py nursery  --port PORT --tier medium --seeds nursery,sewing           --out JUDGING/CODE/sheet-nursery.png
cd "WT" && python tools/variant_sheet.py sleeping --port PORT --tier medium --seeds dormitory,bedroom        --out JUDGING/CODE/sheet-sleeping.png
cd "WT" && python tools/variant_sheet.py study    --port PORT --tier medium --seeds library,fireplace        --out JUDGING/CODE/sheet-study.png
cd "WT" && python tools/variant_sheet.py crypt    --port PORT --tier medium --seeds catacomb,chapel,ossuary  --out JUDGING/CODE/sheet-crypt.png
cd "WT" && python tools/shot.py CODE-fight-nursery --port PORT --scene combat --region nursery       --encounter nursery-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-study   --port PORT --scene combat --region study-library --encounter sl-1      --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The two fights also at `--w 1280 --h 800` as `<screen>-1280.png`. Copy the
fights' PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fights and LOOK at every frame.
