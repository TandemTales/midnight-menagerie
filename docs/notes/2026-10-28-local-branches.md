# Local branches, lengthwise sections

Supersedes the scattered suite placement in `2026-10-28-constrained-mansion.md`.
The user requested nearby split/rejoin choices, rare distant connections, and
the original lengthwise section shape while retaining separate rooms/hallways.

`floorplan.js` now passes its original room partitions and doorway geometry to
`mansion-layout.js`. The display expands those partitions and inserts 76-pixel
cross galleries between neighboring columns. The recipe's side passages remain
real corridors between rooms. A principal chamber projects from the facade.
The original encounter edges, branch/rejoin choices, content and pacing are
preserved; the layout no longer scatters successive choices into remote bays.

The random conversion of ordinary links into secrets has been removed. A wing
keeps the recipe's rare secret shortcuts. If it has none, one existing short
optional bypass receives a hidden entrance, without adding an edge or changing
its destination. This produces only one or two secrets on the checked maps.
Cross-passage damage sits between usable forward exits. It does not force
ordinary choices into a long detour or replace them with portals.

Each route has its own departure and arrival thresholds. Only those thresholds
open when the route is offered, including when a room has multiple doors.
Future routes are visible in faint pencil again, so the player can compare
local forks and see where they reconnect before choosing.

The atlas continues to draw the same generated section plans. Its footprint
outline builder now handles partial shared wall spans, preserving the stepped
lengthwise silhouette. Version 5 uses a fresh annotation coordinate key; older
saved drawings are retained under their previous layout version.

Validation over 68 maps and 3,812 room states: mean ordinary connection length
378 sheet pixels; longest 775 pixels rounded up; 96.3% of ordinary links join
neighboring encounter stages; 83 total secrets across 68 maps. All seventeen
section footprints differ. Tests retain corridor containment, obstruction
avoidance, door geometry, legal physical access and its negative controls,
drawing/erasing/persistence, and real mouse/keyboard selection.
