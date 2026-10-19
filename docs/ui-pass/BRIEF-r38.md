# Round 38 — the parchment again: the map's stamps and regions, and the atlas

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit) and `BRIEF-r30.md` (the round that built this
parchment; its ownership, traps and fix list are the starting point). This
file wins wherever they disagree. **Your rubric is `RUBRIC.md` as amended by
`RUBRIC-r38.md`.**

## WHY

Survey 5 (`SURVEY-2026-10-16.md`): the last item on its list. The map scored
6 · 7 and the atlas 6 · 6.5, a point under the boards around them, and both
judges named the same things.

- **map:** "the fifty-odd room nodes across the parchment are small
  thin-outline glyphs in identical grey rings on one flat sepia field, so the
  blueprint has no depth or hierarchy beyond the four entry medallions and
  the boss crown" (J1); "all room stamps are one sepia tone and one size; give
  reachable next-row nodes a brighter ink or a gilt ring so the player's
  choice is the focal point" (J2). J2's worst: "the two region overlays (the
  red rounded box near top-centre and the blue one at lower-centre) are
  translucent tinted rectangles with a felt-tip outline, the one thing on the
  map that reads as a software highlight rather than ink". Both: at 1280 the
  RECEIVING CHAMBER boss plate lies over the blue region and its nodes. J2:
  the vertical help text on the right edge ("DRAG TO PAN ...") is faint grey
  at 9-10 px. J1: the parchment is "one uniform mid-tone"; the KEY strip is a
  dense two-row list of tiny pairs.
- **atlas:** "the sixteen unsurveyed wings are one faint, fuzzy
  undifferentiated tint across the parchment, and the one surveyed wing (the
  Foyer, top left) is a black ink blob, so the map shows neither the house's
  shape nor the player's progress clearly" (J1); "a tiny dense black blot of
  overlapping rooms that cannot be read as a plan, while the unsurveyed house
  fills the sheet in faint grey" (J2). Both: the still life at bottom right
  floats on a thin gold line; the scalloped band behind the title repeats
  mechanically / is blurry.

## THE FIX LIST

### 1. THE MAP'S STAMPS: WEIGHT AND HIERARCHY — both judges

Room nodes as inked stamps with weight -- a darker umber fill, a firmer ring
-- and a clear hierarchy: the reachable next row brightest (a gilt ring or a
fresh ink), rows already passed or out of reach a lighter ghost, the far rows
faint. The player's choice is the focal point at a glance, at both sizes. The
node glyphs stay legible and their meaning unchanged (the KEY still matches).

### 2. THE MAP'S REGIONS AS INK — J2's worst, J1's depth

The region overlays drawn on the paper, not laid over it: a hatched ink or a
hand-stippled wash bounded by a dashed surveyor's line, with a small label --
never a translucent tinted rectangle. The boss plate tucked below the crown or
inside the margin so it covers no region and no node at 1280. The parchment
given local variation -- foxing, a fold shadow, the corner candles' warmth --
and the edge help text and the KEY at a readable size (11 px+ at 1280) or
folded into the KEY.

### 3. THE ATLAS: A HOUSE WITH SEVENTEEN PARTS — both judges

Every unsurveyed wing a crisp, pale pencil OUTLINE with a lettered label or a
faint "?" cartouche -- the house's shape readable -- not a fuzzy tint. Every
surveyed wing an inked plan with a gilt or sepia wash, drawn large and clean
enough that its rooms and doors read at 1280 -- never a dense black blot.
Check it with ONE wing surveyed (`atlas`) and with ALL surveyed
(`atlas-house`, `#all=1`): the first must make the one earned wing the focal
point, the second must still read as seventeen distinct wings.

### 4. THE SMALLER ITEMS

The atlas's still life on a real ledge or the desk's edge, not a thin gold
line; the band behind the atlas title sharpened or replaced with the house's
damask, lit by the candles; the map's KEY as a cartouche legend a size up.

## WHO OWNS WHAT THIS ROUND

**Yours:** `scenes/map.css` / `scenes/map.js` / `ui/mapnode.js`;
`scenes/atlas.css` / `scenes/atlas.js`; `kit.css` and `tokens.css` by
APPENDING; the existing prep tools, extended.

**Not yours:** the run strip (`ui/hud.*`, round 33), `fx/*`, `core/renderer.js`
(keep its render-scale governor: Josh's standing rule), the cards, the boards,
`ui/hang.js`, `ui/enemy.js`, the sprites, gameplay -- the map's ROUTES and
which rooms are reachable are gameplay; only how they are DRAWN is yours.
**Lay out through your own classes** (a scene sheet that sets `position`,
`display` or `left` on a shared `.kit-*` selector turns `tests/scene-css` red).

## TESTING, TRAPS, DELIVERABLES

- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: at least `tests/map`, `tests/steam-deck`,
  `tests/gamepad`, `tests/platform`, `tests/chrome`, `tests/scene-css`,
  `tests/css-tokens`, `tests/seams`.
- `shot.py` sometimes marks the bright map void (its parchment trips the
  white-flash check): LOOK at the frame. Three builders share one GPU: wrap
  captures in `timeout 600`.
- **No running text under 11 px at 1280** on the three screens.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Commit after every step that works.
  Say in your notes what you did NOT do.**

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && timeout 600 python tools/shot.py CODE-map         --port PORT --scene map   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-atlas       --port PORT --scene atlas --seed 7 --companion bones --kid maya --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-atlas-house --port PORT --scene atlas --seed 7 --companion bones --kid maya --wait 3 --hash all=1
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
