# Round 30's graft — onto SANDARAC's old paper

Round 30 merged SANDARAC (`65899599`, +2.72, 2 of 3). All three judges'
fixes and grafts are in `VERDICTS-r30.md`; read it, `BRIEF-r30.md`
(ownership, tests, traps) and the three builds' notes at its end.

Losers' branches: `ui/r30-strip-b` (VERONESE: won the run strip 3 of 3) and
`ui/r30-strip-a` (ALIZARIN: the atlas's inner double rule, the strip's bigger
coins). PORT ideas onto dev's tip; do not merge either branch.

## The graft, in order (all three judges agree on items 1-3)

1. **The run strip -- VERONESE's grouping.** Snacks, Keepsakes and Gear each
   in their own framed plate, separated by ENGRAVED gold dividers (a small
   fleur or double rule, full height -- not a flat bar, not a bronze dot), so
   the strip reads as a few plates and not one 18-socket chain. Delete the
   scroll flourish after the last Gear socket and give its width to the
   sockets: about 24-26 px each at 1280 (SANDARAC's are ~20), item art filling
   its socket. Bring back the place name: "The Foyer · Wing 1" at 1280, taking
   room from spacers, never from the name; the seed field stays out so the
   strip stays ONE row. The three empty Snack sockets read as empty plates
   (lighter interior or a faint glyph), not black holes.
2. **The map's hazard washes.** The blue cold-draught zone's milky glowing
   fill and neon rim -> a thin, uneven ink wash with a hand-drawn, slightly
   heavier outline (or ALIZARIN's surveyor's hatching), the SAME hand as the
   red zone, legible at 1280 without glow.
3. **The atlas's surveyed wing.** Drop the lighter square of paper behind the
   Foyer; draw its walls in the darkest, heaviest ink on the sheet
   (VERONESE's weight on SANDARAC's paper) with at most a soft, uneven warm
   candle halo, its nameplate BELOW the wing. The unknown wings keep
   receding at ONE consistent hairline weight (some, like the garden at the
   left, still read as dark as the Foyer), but crisp, not brown mud, at 1280.
4. **Smaller, from the lists:** the map's four reachable entrance medallions
   a touch more lift (a brighter rim or candle glint) so they outrank the boss
   crown; distant room glyphs on the right a step more ink at 1280 (treasure
   vs scare legible), still well under the reachable; the map's outer 10-15%
   burnt toward umber if it is not already; "SURVEY REF." and the scale-bar
   labels readable; ALIZARIN's clean inner double-rule border around the
   atlas's plan, inside the burnt edge.

## Proof

- Before/after captures of hud-late, map and atlas at both sizes (the
  BRIEF-r30 commands, into C:/UILOOP/r30/graft/), LOOKED at.
- The strip at 1280 on a fight and the shop too, holding ONE row.
- Tests via `tools/on_port.py PORT`: steam-deck, css-tokens, scene-css,
  chrome, map, gamepad, platform. `python tools/endings_guard.py --base
  <your base>` prints ENDINGS OK. Commit as you go; stop only your own
  processes, by PID.
