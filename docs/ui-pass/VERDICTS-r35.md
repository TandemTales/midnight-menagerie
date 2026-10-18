# Round 35 — verdicts: the next four rooms and their near floor

Base `46c95755`. GROSGRAIN is the baseline. Builders: SCHEELITE
(`ui/r35-rooms-a`, LITERAL), ANTHRACITE (`-b`, THE NEAR FLOOR FIRST),
SODALITE (`-c`, THE OBJECT DRAWN). All three finished in one run; two blind
judges agreed (`wf_ca8f1c31-e8d`), no tiebreak.

## Scores (mean of two judges)

| screen | ANTHRACITE | SCHEELITE | SODALITE | GROSGRAIN | winner |
|---|---|---|---|---|---|
| sheet-attic | 6.25 | 5.75 | 5.25 | 4.00 | ANTHRACITE (2 of 2) |
| sheet-sleeping | 6.25 | 6.90 | 5.80 | 4.15 | SCHEELITE (2 of 2) |
| sheet-graveyard | 6.00 | 5.65 | 6.10 | 4.75 | split ANTHRACITE · SODALITE (tied head-to-head and Borda) |
| sheet-crypt | 6.15 | 6.90 | 5.35 | 4.15 | SCHEELITE (2 of 2) |
| fight-graveyard | 6.75 | 5.85 | 5.80 | 5.70 | ANTHRACITE (2 of 2) |
| **mean** | **6.28** | 6.21 | 5.66 | **4.55** | |

**ANTHRACITE wins, 2 of 2 judges, +1.73 over the rooms before.** Both call it
"the most coherent" / "the most even system"; SCHEELITE is a close second
(6.21) that won two screens outright. `fits_between_samples` false
everywhere: "every room is still a lit 3D set, not a painting ... the haze
and leftover black voids are what stand in the way".

## THE GRAFT — what both judges ask for

1. **The Crypt -- SCHEELITE's lit ribbed vault** in all three rooms (both,
   first graft: "the only lit vault ribs"), replacing ANTHRACITE's black
   ceiling band; SODALITE's darker, grimed sarcophagi with carved quatrefoil
   panels (both); SCHEELITE's skeleton grave mounds and near candelabra in
   place of the "flat stick-bones" scattered on the floor (J1); and the
   sepia-orange / ochre HAZE pulled off the near flags so the stone reads
   dark and crisp under the candle pools (both).
2. **The Sleeping Quarters -- SCHEELITE's iron beds:** tall bedheads with
   ring motifs and ball finials, inked crisp, and triangle-pieced quilts with
   folds (both), in place of ANTHRACITE's "thin, soft, barely inked" rails and
   "flat checker squares"; the toy chest and teddy at the bedroom bed's foot
   (both: SCHEELITE's / SODALITE's); the cold blue wash on the dormitory's
   right near floor cut (both).
3. **The Graveyard -- SODALITE's chapel:** the gabled timber porch with a
   hanging lantern, darker stone, the eaves line, buttresses (both); drawn
   ivy leaves, not "dotted green ivy noise" (J2); SODALITE's greener, darker
   turf with a warm lamp pool by the cross tomb (J2); the near turf at lower
   right given a lit path edge, inked kerbs and a turf lip so it is dark green
   with an edge, not black (both); the pale left table tomb carved and grimed
   (J2).
4. **The Attic:** the blue / purple / orange light wash lying across the near
   boards replaced by one warm candle pool or a hard-edged cool moon pool
   (both); a strapped trunk or slatted crate in the bottom fifth (J1;
   SCHEELITE's near floor, trunk left and crate plus armchair right, J1's
   graft); the library's dust sheet given folds, a draped hem and a darker
   tone (J2).
5. **The fight:** a lit turf edge either side of the path behind the hand,
   and a few fallen leaves where the path meets it, so the near headstones
   and the Celtic cross sit on lit ground (both).

## Builders' notes, in short

- **ANTHRACITE** (`7e221984`, self 6.8): round 31's nearFloor rule in all
  four wings, extended with `clean` (flattens the wet-sheen fbm -- the attic's
  "haze" and the lawn's "milky murk"), `litter` (bones and spalled stone on
  the crypt's flags) and `pool.abs` -- each defaults to 0, so rooms that do
  not ask are untouched; `pal.ribs` (a barrel vault, crypt ceiling only).
  Trunks with straps and hasps, dust sheets with folds, a dress form; the
  dormitory bed redrawn with a patchwork quilt; a grained dado; the bedroom's
  carpet actually laid (it had never drawn: dye was 0); the chapel coursed
  rubble with staggered slates.
- **SCHEELITE** (`0134bc7d`, self 7): the dormitory bed turned toward the
  camera with arched rails, bars, rings and ball finials, a three-palette
  patchwork quilt; three trunk kinds by seed; the attic's lamp brought to the
  left; floor gloss and key light down (the haze); a palette hue change on the
  attic floor (purple to old pine); the chapel's slates, ridge, porch; the lit
  vault ribs in the crypt.
- **SODALITE** (`2994524f`, self 7): the chapel as squared rubble with
  coping, kneelers, buttresses with set-offs, slates one by one, a hood mould,
  quoins and a timber porch with a lit lantern; tussocked moss turf; a
  carved, grimed sarcophagus with quatrefoils and an effigy; a ribbed groined
  vault (MM_PAT 17, its own variant); shape 85, bones and rubble.

Performance, the seventeen-room sweep and the battery: see the merge notes in
`GRAFT-r35.md`.
