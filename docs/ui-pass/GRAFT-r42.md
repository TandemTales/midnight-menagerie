# Round 42's graft — onto PREHNITE's boards

Round 42 merged PREHNITE (2 of 3 judges, +1.25; ZOISITE 6.85 and LAPIS 6.81
within 0.15). ZOISITE won the atlas; LAPIS won atlas-house, the clubhouse
(3 of 3) and piles. All judges' fixes and grafts are in `VERDICTS-r42.md`;
read it, `BRIEF-r42.md` (ownership, traps, the eight screens' capture
commands) and the three builds' notes.

Losers' branches: `ui/r42-boards-a` (ZOISITE: the darker `_paintPaper` with a
burnt margin and the lamp on the legal nodes, the riveted legend, the
arrow-ended +N tab, the swallow-tail seed ribbons, the brass plate round the
search and under the ledger) and `ui/r42-boards-c` (LAPIS: the clubhouse's
tan paper tabs with a gold active tab, the atlas's burned edges and
`.at-rims` gold rim, atlas-house's cartouches with the numeral inside, the
map's district cartouches). PORT ideas onto dev's tip; do not merge either.

Ownership is BRIEF-r42's. DOM/CSS, the screens' own JS, `ui/petart.js` for how
photographs are drawn; no fx/, no `ui/hang.js`, no gameplay.

## The graft, in order (VERDICTS-r42's list)

1. **The clubhouse tabs -- LAPIS's**, clear of the lamp; clue notes 12 px at
   1280.
2. **The atlas -- ZOISITE's sheet and legend**, LAPIS's burned edges and lit
   selected wing, hand-inked unsurveyed outlines, fills dark enough for the
   cartouches, labels that wrap and never truncate.
3. **atlas-house -- LAPIS's cartouches** with the numeral inside, the gold
   rim; the pastel washes down to aged paper tints with grain; the shelf
   aligned.
4. **The map:** ZOISITE's vignetted sheet with a lit centre; unreachable rooms
   a clear secondary state (dimmed, not invisible); continuous inked routes
   between reachable rooms; hand-inked district strokes and dark enamel
   district plates; the compass back; entry room tags and the KEY 12 px at
   1280.
5. **hud-late:** ZOISITE's arrow-ended brass +N tab after at least three
   tokens per group at 1280, its numerals 12 px.
6. **event:** RISK/GAIN lines 12 px at 1280 in inks that hold on the burned
   paper; ZOISITE's brass plate under the ledger.
7. **piles:** ZOISITE's brass plate round the search; CLOSE below the shelf's
   rail at 1280 with a gutter at the end cards; placeholder and sort note 12
   px.
8. **settings at 1280:** the panels clear of the Restore Defaults / Done bar;
   palette labels and seed values 12 px; ZOISITE's swallow-tail seed ribbons.

## Proof

- Before/after captures of BRIEF-r42's eight screens at both sizes (its
  commands, into C:/UILOOP/r42/graft/), LOOKED at beside UI/mainMenu.png.
- The small-text probe (`C:/UILOOP/r40/spinel/smalltext.py`) on all eight at
  1280: 0 runs under 12 px, or each survivor named.
- Every redrawn control works by mouse, keys and pad (the seed fields take
  typing, the search filters, the palette switches, every event choice
  chooses, each clubhouse tab opens its panel).
- If you keep any SVG displacement filter on the map, measure the map's frame
  with and without it.
- Tests (via `tools/on_port.py PORT`): chrome, steam-deck, gamepad, map,
  backpack, piles-reachable, settings-play, events, scene-css, css-tokens,
  seams. `python tools/endings_guard.py --base <your base>` prints ENDINGS
  OK. Commit after every item; stop only your own processes, by PID;
  captures in `timeout 600`.
- Say in your notes what you did NOT do.
