# Round 38's graft — onto MORION's atlas

Round 38 merged MORION (`fe57233e`, +3.58, 2 of 2 judges). HELIOTROPE won
the map 2 of 2; SARD was a solid third. All judges' fixes and grafts are in
`VERDICTS-r38.md`; read it, `BRIEF-r38.md` (ownership, traps, the three
screens' capture commands -- `atlas-house` is `--hash all=1`) and the three
builds' notes.

Losers' branches: `ui/r38-parchment-c` (HELIOTROPE: the map's stamps ghosted
by row, regions hatched and stippled with dash-dot surveyor's lines and corner
crosses, the label engraved on the paper, the compact two-line boss plate at
1280, numeral medallions) and `ui/r38-parchment-a` (SARD: `data-ahead` on
every node, the atlas's gold corner brackets on the surveyed wing, paper
label tags with the numeral above). PORT ideas onto dev's tip; do not merge
either; keep MORION's wing footprints and its atlas drawing.

Ownership is BRIEF-r38's. DOM/CSS/canvas only; no fx/ change.

## The graft, in order (both judges agree on all)

1. **The map's stamps** (both, first): only the reachable next row keeps the
   heavy dark gold-rimmed disc; rows passed and far rows fade to a lighter
   ink ghost -- a thin ring, a pale fill, a faded glyph -- so the next choice
   is the focal point at both sizes (HELIOTROPE's, or SARD's `data-ahead`
   steps). The routes and which rooms are reachable are gameplay: unchanged.
2. **The map's regions:** HELIOTROPE's dash-dot surveyor's line with corner
   crosses, red diagonal hatching for one and blue stipple for the other, NO
   translucent tint under the hatching; the region's name engraved straight
   onto the paper at its corner, off the route lines and the nodes, in place
   of MORION's bright ribbon chips.
3. **The boss plate at 1280:** HELIOTROPE's compact plate (RECEIVING /
   CHAMBER on two lines) beside the boss, covering no region and no node.
4. **The atlas's focus and labels:** SARD's gold corner brackets around the
   surveyed wing, darkened and crisped into the lit focal point with its
   cartouche attached; small engraved paper tags with the wing's numeral
   above under every label in `atlas-house`, so no letter collides with wall
   ink (now the Lampworks, Ballroom and Hedge Maze); the densest wings'
   interior ink thinned.
5. **The atlas's smaller items:** the roman numerals 11 px+ with more contrast
   at 1280; in `atlas-house` the seventeen cream plates toned to a warm aged
   vellum with tooth and a candle falloff toward the sheet's edges; each
   unsurveyed outline a darker pencil edge so neighbours separate.
6. **The map's KEY:** the floating KEY ribbon dropped, the label seated inside
   the plate.

## Proof

- Before/after captures of BRIEF-r38's three screens at both sizes (its
  commands, into C:/UILOOP/r38/graft/), LOOKED at beside UI/mainMenu.png.
- No running text under 11 px at 1280 on the three screens (a small-text
  probe in your scratch dir).
- Tests (via `tools/on_port.py PORT`): map, steam-deck, gamepad, platform,
  chrome, scene-css, css-tokens, seams. `python tools/endings_guard.py --base
  <your base>` prints ENDINGS OK. Commit after every item; stop only your own
  processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
