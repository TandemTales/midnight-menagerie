# The house controls the route

Supersedes the open-gallery circulation described in
`2026-10-28-mansion-circulation.md`. A visible hall no longer implies that every
room opening onto it can be entered.

`state/mansion-layout.js` builds seventeen independently authored footprints:
the Foyer's formal entrance block, a Nursery court, long residential galleries,
stepped library additions, a narrow Lampworks, the Bathhouse pool surround,
garden paths, vaults, and the other sections. Rooms share walls; galleries and
cross passages meet through actual openings. Section proportions differ.
The established encounter graph and balance are retained. As before, its
encounter slots can reuse the twenty authored room identities in a wing;
this change does not migrate the expedition to exactly twenty encounters.

The three layers from `docs/design/01-mansion-structure.md` are explicit:

- Permanent rooms, galleries, junctions, doors, and supporting spaces.
- Seeded obstructions across complete corridor thresholds: fallen ceilings,
  missing floors, floods, roots, furniture, shelves, glass, gates, or machinery.
  They stay fixed for that expedition. Corridor routing searches the remaining
  junction graph, so it takes a clear detour or cannot use that ordinary route.
- Paired concealed passages connect rooms independently of intervening spaces.
  Each carries a unique S-number, two endpoint symbols, a named mechanism, and
  an explanation in the room tooltip. Kits are appropriate to the wing: hinged
  portraits and bell pulls, coal chutes and cold-store walls, globe stairs and
  bookcases, under-bed crawls and dollhouses, roof walks, feed hatches, and more.
  A dotted crossing is not an accessible junction.

Self-latching room doors show the current house state. Only the current room's
ordinary outgoing choices are unlatched; hidden destinations retain their
barred ordinary doors. Doors latch behind the party. This is the explicit
supernatural constraint that preserves forward encounter progression even
where permanent corridors meet. The overlay consumes the same graph edges as
gameplay, and changes after selection; it does not offer an independent route.

`ui/estate-blueprint.js` replaces the atlas's unrelated master scan and crop
traces. It draws representative section plans from the same generator and
derives their estate silhouettes from the same footprint rectangles. The main
estate galleries join the wings; roof/tower and foundation drawings are inset
surveys, labeled by level. Nightly obstructions and the kids' S-marks are kept
off the permanent master survey. Seed variation can change the internal
partitions slightly, while the section footprint remains fixed.

The aged cyanotype, scrolling/zoom controls, player pens, eraser, undo, and
saved annotations remain. Layout version 4 has a separate annotation key so
marks from the old courtyard plan do not land on unrelated rooms.

Validation:

- `tests/blueprint/run.py`: 68 maps, 17 distinct footprints, 3,812 room states.
  Checks nonoverlapping rooms/halls, real doorway gaps, corridor containment,
  obstruction avoidance, paired hidden endpoints, and physical accessibility
  versus legal choices. Every state has a negative control that opens an
  unauthorized door and must fail. Real browser interactions cover the pen,
  eraser, undo, pan/zoom, selection, closed-room rejection, and rendered latches.
- `tests/blueprint/estate.py`: all seventeen master/section plans match,
  inset bounds do not overlap, old master/traces are not requested, and atlas
  selection/zoom render without exceptions. Captures representative wings.
- `tests/map/run.py`: 38 checks, including real Run room entry, keyboard
  selection, encounter balance and reachability, and the classic map fallback.
- JavaScript syntax, scene CSS collisions, CSS token references, and diff
  whitespace checks pass.
