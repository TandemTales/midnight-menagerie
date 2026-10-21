# Round 42 — verdicts: the pale boards and the last web controls

Base `4ae71890`. SERGE is the baseline. Builders: ZOISITE (`ui/r42-boards-a`,
LITERAL), PREHNITE (`-b`, THE CONTROLS FIRST), LAPIS (`-c`, ONE LIT THING PER
BOARD). All finished in one run; three blind judges (`wf_6331ce16-61a`): J1
and J3 chose PREHNITE, J2 LAPIS.

## Scores (mean of three judges, each screen at both sizes)

| screen | PREHNITE | ZOISITE | LAPIS | SERGE | winner |
|---|---|---|---|---|---|
| map | 6.73 | 6.43 | 6.67 | 5.20 | PREHNITE (no majority; head-to-head) |
| hud-late | 6.67 | 6.43 | 6.67 | 5.33 | PREHNITE (no majority; head-to-head) |
| atlas | 6.77 | 7.17 | 6.60 | 4.93 | ZOISITE (2 of 3) |
| atlas-house | 6.87 | 7.17 | 7.07 | 5.33 | LAPIS (2 of 3) |
| clubhouse | 6.73 | 6.67 | 7.17 | 5.73 | LAPIS (3 of 3) |
| event | 7.17 | 7.00 | 6.97 | 6.20 | PREHNITE (2 of 3) |
| piles | 7.47 | 7.20 | 7.17 | 6.67 | LAPIS (no majority; head-to-head) |
| settings | 7.27 | 6.77 | 6.20 | 6.30 | PREHNITE (3 of 3) |
| **mean** | **6.96** | 6.85 | 6.81 | **5.71** | |

**PREHNITE wins, 2 of 3 judges, +1.25**, the three within 0.15: "the only
build that shows on the map where you can go: rooms you can't reach are
dimmed. It also darkened the event ledger into burned, lit parchment and
turned the piles search and the settings seed and palette controls into brass
instruments, not web inputs" (J3); "crisp grainy old-print photographs on the
clubhouse" (J1). SERGE last everywhere: "the palest sheets, labels without
cartouches, web-pill controls, an extra arrow button on each event choice,
and '+N' badges and Kid portraits that cover the things they annotate" (J1).
No board fits between the samples: "room tags of about 9-10 px at 1280 and
translucent pastel wing fills are still on every build" (J3).

## THE GRAFT — what the judges ask for

1. **The clubhouse tabs -- LAPIS's** (J1, J3): PREHNITE's teal, blue and red
   folder tabs are off-palette and hide the lamp's shade; LAPIS's aged tan
   paper tabs with a gold active tab (and its star medallion) keep the lamp
   clear. Clue-note body text 12 px at 1280 (J2).
2. **The atlas -- ZOISITE's sheet and legend** (J1, J2): the darker sheet and
   the riveted brass legend plate with drawn swatches; LAPIS's burned edges
   and lit focus round the selected wing; unsurveyed outlines hand-inked, not
   crisp dashed vectors, and fills dark enough that the tan cartouches stop
   sitting tan-on-tan; cartouches that wrap rather than truncate (LAPIS cut
   "XV WARD" / "III QUARTERS").
3. **atlas-house -- LAPIS's cartouches** (J3): the roman numeral inside each
   plate, the selected wing's gold rim and glow; the pastel wing washes
   knocked down toward aged paper tints with grain, every wing darker than
   the paper (J1, J3); the shelf aligned with the right panel and frame (J2).
4. **The map:** ZOISITE's darker vignetted sheet with a lit centre over the
   entry column (J1, J3); unreachable rooms kept dimmed (J2) but a clear
   secondary state, not near-invisible ghosts (J1); routes between reachable
   rooms as continuous inked strokes (J2, J3), dashes only for the rest;
   districts in uneven hand-inked strokes with hand hatching (J2) and their
   tag plates as dark enamel cartouches like the boss's (J3); the compass
   back (J2). At 1280 the entry room tags and the KEY at 12 px (J2, J3).
5. **hud-late -- ZOISITE's arrow-ended brass +N tab** (J1, J2), with at least
   three Keepsake and three Gear tokens shown before it at 1280 (J3), its
   numerals 12 px.
6. **event:** RISK/GAIN/COSTS/ALWAYS 12 px at 1280 with a green and leaders
   that hold on the burned paper (all three); ZOISITE's brass plate under the
   ledger (J2).
7. **piles:** ZOISITE's arrow-ended brass plate round the search (J1); at
   1280 CLOSE below the shelf's bottom rail, not over the frame, a gutter at
   the end cards (J3); the placeholder and sort note 12 px (J2).
8. **settings at 1280:** the Reading and Expedition panels clear of the
   Restore Defaults / Done bar (J3); palette labels and seed values 12 px
   (J1); ZOISITE's swallow-tail ribbon ends on the seed plates (J3).

## Builders' notes, in short

- **PREHNITE** (`bb707ca8`): the piles search as the channel of a slotted
  brass cartouche, CLOSE onto the case's rail, the cards larger; seed fields
  as `hw-slot` cartouches (the input IS the plate); palette choices as enamel
  medallions on nameplates; event: one control per choice (the arrow
  removed, the numeral pinned by a gilt rod), darker register, a lectern;
  pressboard folder tabs; `petart.js printFinish` (no corner blur, unsharp at
  display scale, grain, keyline).
- **ZOISITE** (`4f4ec51f`, 11 commits): `_paintPaper` darkened toward the
  corners with a burnt margin, the pointer lamp aimed at the legal nodes;
  ghosted far stamps, a gall strike for visited, dashed unopened legs;
  districts roughened by an SVG `#mm-pen` filter; the arrow-ended +N tab;
  the riveted legend. Not done: one Keepsake + "+9" at 1280; the atlas
  letters the Ballroom "VELVET SUITES".
- **LAPIS** (`ec9e3baf`): mean luminance map 66 -> 48, atlas 50 -> 36,
  atlas-house 56 -> 42, event 58 -> 48, clubhouse 78 -> 61; `.map-dusk` and
  `.map-litpool` layers aimed at the enterable rooms; district names on
  clipped gall cartouches; `.at-rims` gold rim on the wing being read; the
  ledge ending on a turned gilt post. No gpuprof (an SVG feDisplacement
  filter on the districts is unmeasured).
