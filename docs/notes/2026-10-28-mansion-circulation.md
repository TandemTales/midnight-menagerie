# Mansion circulation rebuild (2026-10-28)

Follow-up to the unfolded blueprint: larger adjacent boxes still did not read
as a mansion. The physical floor plan now comes from `state/mansion-layout.js`.
The earlier partition generator supplies only the tested encounter graph and
fight pacing; its temporary room geometry is discarded.

## Building and room relationships

- One entrance vestibule opens onto a continuous north gallery. An east
  cross-hall connects it to the south gallery and a principal stair pavilion.
- The two wings enclose a substantial open courtyard, reached through court
  porches. Appropriate wings instead label and draw a roof terrace, lower light
  court, atrium, or walled garden.
- Bays share structural axes, with varied subdivision and depth: generous
  principal rooms face smaller supporting rooms across the gallery.
- Authored room identities are arranged in groups: the Foyer starts with an
  Entry Hall, Coat Room, Front Vestibule and Visitor Cloakroom, followed by
  reception/domestic suites. Duplicate identities use room numerals instead of
  misleading random compass prefixes.
- Suitable principal chambers have separate, internally connected service
  spaces: serving pantries and china closets, dressing closets and washrooms,
  book stores and writing cabinets, or cloak closets and retiring rooms.
- Door gaps and swings support horizontal and vertical walls, including double
  doors for large principal chambers. Windows and walls derive from all rooms,
  annexes and halls together; the courtyard stays outside those spaces.

## Routes and retained tools

Ordinary routes leave a room through its actual doorway, follow the gallery
centreline and cross-hall where necessary, and enter the next room through its
door. Starting routes all enter the same vestibule. Secret ways retain their
special wall-crossing behavior.

Physical circulation is shared, so paths can meet at real hall junctions. The
old blanket "no crossing edges" rule is replaced for mansion maps by the
stronger relevant check that routes stay within halls and meet their doors.
The expedition still offers its balanced forward choices: the lit room marks
say where the House permits the next encounter. This is not a free-roaming
movement rewrite, and architectural annexes are not additional encounters.

Available and walked routes remain drawn. Hovering or keyboard-inspecting a
room previews its outgoing routes; overlapping future paths are otherwise
hidden so they do not obliterate the corridors. Hazard hatching is clipped to
the affected rooms rather than stretching diagonally across the courtyard.

The aged paper, handwritten notes, scrolling, zoom, markers, eraser, undo and
local persistence remain. Annotation keys include the plan version so old
coordinates are not painted onto unrelated rooms in the new layout.

## Verification

- 24 blueprint interaction/geometry checks pass, including draw-over-room
  safety, local persistence, erasure/undo, navigation and classic-map fallback.
- 68 deterministic maps across all 17 wings: 408 circulation spaces, no room
  overlaps, valid horizontal/vertical door gaps, all ordinary routes contained
  in halls, valid entrance routes, courtyard clearance, and varied room sizes.
- 38 map regression checks pass, including real Run entry/return, route
  reachability, branching and fight pacing.
- JavaScript parsing, scene CSS isolation, CSS tokens and diff whitespace pass.
- Final captures: `tests/blueprint/overview.png`, `foyer.png`, `foyer-1280.png`.
