# Round 42 — the pale boards and the last web controls: map, hud-late, atlas, atlas-house, clubhouse, event, piles, settings

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r33.md` and `BRIEF-r36.md` (the controls
rounds), `BRIEF-r38.md` (the map and the atlas) and `BRIEF-r40.md` (the 12 px
floor at 1280). Read `VERDICTS-r38.md` and `VERDICTS-r40.md` for what judges
rewarded on these boards. This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r42.md`.**

## WHY

Survey 7 (`SURVEY-2026-10-20.md`, items 8 and 9). J1's SYSTEM: "the
pale-parchment family (map, hud-late, atlas, atlas-house, event, and the
clubhouse cork) is the one place the house loses its darks; all six would gain
from one pass on aged, darker paper with inked labels in cartouches. The
remaining web-UI leaks are few and specific: the piles search input, the
settings palette pills and seed inputs, the clubhouse tabs, and the double
control on event choices." J2's: "Leftover web controls ... the piles search
input, the settings seed fields, the atlas legend boxes and the event's arrow
circles"; "Small type at 1280 ... gameover, shop, map/hud-late, clubhouse,
event".

| screen | J1 | J2 | what they said |
|---|---|---|---|
| **map** | 5.5 | 7 | "about forty identical tan node discs at one size ... nothing separates where you can go from where you cannot"; "the two conditions ... read as a highlighter pen, not ink" (J1); "flat vector fills with crisp digital outlines on a painted map"; at 1280 coins in columns 5-7 crowd, first-column room tags ~9 px (J2) |
| **hud-late** | 6 | 6 | at 1280 the "+8 / +5 badges sit on top of the last icon and cover it" (J1); "show two tokens and let the +N be its own engraved stub" (J2) |
| **atlas** | 5.5 | 6 | "the unsurveyed wings are faint hair-line outlines on a mid-tan parchment, and their labels sit across the boundary lines ... one beige smear with words on it" (J1); "draw unsurveyed wings as a darker sepia ghost" (J2) |
| **atlas-house** | 5.5 | 7 | "all seventeen surveyed wings are filled with the same pale cream cut-paper ... nothing marks the selected Foyer" (J1); the prop shelf "stops dead at the right edge ... reads as a pasted band"; the legend "the most web-like object on the board" (J2) |
| **clubhouse** | 6.5 | 7 | both: the eight pet polaroids are "soft, blurred photos" -- "the board's focal objects are its blurriest"; a pale even cork; web tab pills; the clue notes ~9-10 px at 1280 |
| **event** | 6 | 7 | "each of its three choices is drawn twice (a roman-numeral medallion on the left, an arrow button on the right)"; "a broad pale even cream that dominates the dark board" (J1); the wainscot "a dark, almost empty plane" (J2) |
| **piles** | 6.5 | 7 | both: the "Seek a Trick by name..." search "is a plain dark rounded web input"; a dead band between the cards and CLOSE |
| **settings** | 6.5 | 7 | both: the seed fields "none yet" / "left to chance" are web text inputs; the palette choices "four rounded web pills"; descriptions 10-11 px at 1280 |

## THE FIX LIST

### 1. THE PARCHMENT FAMILY KEEPS THE HOUSE'S DARKS -- J1's SYSTEM, both on the atlas

The map, hud-late, atlas and atlas-house sheets, the event's ledger and the
clubhouse's cork: aged, DARKER paper or cork -- a step down in value, burned
or foxed edges, a vignette toward the corners, lit by a source on the board
(the clubhouse's hanging lamp, a candle) -- so the one lit thing on each board
reads as lit. Not a grey or milky wash: a dark is where this house keeps its
colour. Ink everything on the paper a step darker to match.

### 2. INK, NOT VECTOR -- both

- **The map's districts:** an ink wash with an irregular, hand-drawn boundary
  (keep round 40's rule: one district per condition, following its rooms, no
  rectangle), its hatch or stipple in the line's own ink, the label in a small
  cartouche -- not a translucent fill with a crisp digital outline.
- **The map's node states** (J1 first): reachable nodes in dark enamel with a
  gold rim, visited ones stamped or struck through, distant ones faded into
  the sheet; routes as inked strokes, dashed where unexplored. At 1280 no two
  coins' rims touch, the room tags 12 px, the boss plate next to its crown,
  the KEY strip at 12 px.
- **The atlas:** each unsurveyed wing a darker sepia ghost -- a dashed ink
  outline, a grey-brown wash, its label in dark ink in a small cartouche
  INSIDE its outline, clear of boundary lines; the surveyed wing the one gold,
  lit thing. **atlas-house:** surveyed wings in darker inked paper (or a
  low-chroma tint per wing), the selected wing rimmed in gold, label plates as
  clipped-corner cartouches on a dark ground; the prop shelf a real ledge
  joined to the frame or ended on a carved bracket.

### 3. THE LAST WEB CONTROLS -- both

- **piles:** the search a recessed, engraved slot in a brass cartouche with a
  magnifier and end caps matching the 5 TRICKS and CLEAR plates; the dead
  band under the cards removed.
- **settings:** the seed fields engraved brass plates with a recessed slot
  (like the sliders' value tags); the palette choices brass-rimmed enamel
  medallions with a name plate, the chosen one lit; descriptions 12 px at 1280.
- **The atlas legend:** an engraved key plate with a parchment swatch and an
  outline swatch, not two boxes in a rectangle.
- **The clubhouse tabs:** folder tabs or brass plates, not web pills.
- **event:** ONE control per choice -- the whole row the button with its
  numeral medallion, or the enamel arrow alone -- never both.

### 4. THE BOARDS' OWN DEFECTS

- **clubhouse:** the pet photographs crisp -- sharp, or deliberately old
  prints with a crisp grain, a vignette and a hard white border -- never soft
  upscales; each Kid's coin pinned BESIDE its photo; the red string a thread
  with a shadow; clue notes 12 px at 1280.
- **hud-late at 1280:** the +N an engraved stub of its own AFTER the visible
  tokens, never a badge over one; "KEEPSAKES 10" not touching its end cap;
  HAUNT and SEED clear of the cog.
- **event:** the wainscot and floor under the ledger dressed and lit (a
  lectern base, candle pools), not a dark empty plane; RISK/GAIN lines 12 px
  with a green that holds on the paper.

## WHO OWNS WHAT THIS ROUND

**Yours:** `scenes/map.*`, `ui/mapnode.js`, `scenes/atlas.*`,
`scenes/clubhouse.*`, `scenes/event.*` (not its paintings' hang: `ui/hang.js`
is not yours), `ui/settings.*`, `ui/deckview.*` (the piles dialog),
`ui/hud.*` (the run strip, at 1280), `ui/petart.js` only for how the pet
photographs are DRAWN, `kit.css` and `tokens.css` by APPENDING; the existing
prep tools, extended.

**Not yours:** `fx/*` (the rooms), `core/renderer.js` (keep its render-scale
governor: Josh's standing rule), the cards' face design, the fight HUD, the
shop, reward, rest, gameover, `ui/hang.js` and the paintings (round 40's
repair just settled them), the pets' and the house's art files, the sprites,
gameplay -- the map's ROUTES and which rooms are reachable are gameplay; only
how they are DRAWN is yours. **Lay out through your own classes** (a scene
sheet that sets `position`, `display` or `left` on a shared `.kit-*` selector
turns `tests/scene-css` red).

## TESTING, TRAPS, DELIVERABLES

- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: `tests/chrome`, `tests/steam-deck`, `tests/gamepad`,
  `tests/map`, `tests/backpack`, `tests/piles-reachable`,
  `tests/settings-play`, `tests/scene-css`, `tests/css-tokens`,
  `tests/seams`, and any atlas or clubhouse gate you find (`ls tests`).
- A small-text probe at 1280 on all eight screens (round 40's
  `C:/UILOOP/r40/spinel/smalltext.py`): every line a player reads at 12 px+.
- Every control you redraw still works by mouse, keys and pad -- the seed
  fields still take typing, the search still filters, the palette still
  switches, every event choice still chooses.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works. Stop ONLY the processes you started, BY PID.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. **Say in
  your notes what you did NOT do.** LOOK at every capture: a board with no
  room behind it is a warm-up timeout, not your art.

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
KID="--seed 7 --companion bones --kid maya"
cd "WT" && timeout 600 python tools/shot.py CODE-map         --port PORT --scene map       $KID --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-hud-late    --port PORT --scene map       $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-atlas       --port PORT --scene atlas     $KID --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-atlas-house --port PORT --scene atlas     $KID --wait 3 --hash all=1
cd "WT" && timeout 600 python tools/shot.py CODE-clubhouse   --port PORT --scene clubhouse $KID --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-event       --port PORT --scene event     $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-piles       --port PORT --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-settings    --port PORT --scene map       $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size).
Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
