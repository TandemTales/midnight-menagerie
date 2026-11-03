# Unfolded, annotated blueprint (2026-10-28)

The blueprint now opens at a readable scale on a portion of a larger sheet.
The Foyer is 4060 × 2020 sheet pixels; longer wings grow horizontally to keep
room widths useful. Geometry, door gaps, hallways, secret waypoints and node
coordinates share the same sheet. The classic map remains selectable.

## Architecture and paper

- Existing room partitions and route topology remain the building's source of
  truth. Corridor carving now permits smaller adjoining rooms (still at least
  144 sheet pixels high), allowing service passages to actually appear.
- Door swings, windows, stairs, dining tables, chairs, shelves and room lettering
  are visible at the default view. Room names stay within their rooms, replacing
  floating duplicate labels that crossed walls.
- The paper has faded cyanotype pigment, ivory ink, worn folds, fibre, bleaching
  and tide marks. Handwritten notes and underlined warnings fill spare floor and
  margin space; secret passages retain their annotated routes.
- Added `--bp-*` colors in `game/src/ui/tokens.css` for paper and marker tools.
  Architecture remains a static canvas; panning transforms the sheet.

## Navigation and player tools

Drag in Hand mode or scroll to move; Shift-scroll moves sideways. Ctrl-scroll
(or Command-scroll) zooms about the pointer. Plus/minus buttons zoom, Overview
fits the whole sheet, and You are here / 0 restores the readable current-room
view. Arrow keys choose rooms; Shift-arrows pan. Keyboard focus brings the
selected room into view.

Four freehand colors, a stroke eraser, Undo and Clear live in the Our notes bar.
Clear and erasing are undoable. V returns to Hand; E selects the eraser;
Ctrl/Command-Z undoes. X room / M stamps the keyboard-selected room; Unmark /
Delete removes personal marks there. Drawing captures the pointer and cannot
select a room underneath it. Toolbar buttons support native keyboard activation.

Marks use sheet coordinates and survive reopening the map in localStorage,
keyed by seed, wing and sheet width. They are local to this browser/device;
networked sharing is not implemented. Recent wing histories are bounded to 24
sheets, 300 strokes per sheet; undo covers this visit's last 30 edits. The
underlying architecture and authored notes are never erased by the player tools.

## Verification

- `python tests/blueprint/run.py`: isolated Chrome context, real pointer and
  keyboard input, pan/scroll/zoom, draw-over-room safety, persistence, eraser,
  undo/clear, room stamps, selection, overview, 1280×800 controls, classic fallback.
- Geometry checks generate 68 deterministic maps across all 17 wings, with 240
  hallways: reachable rooms, valid door gaps and no overlapping spaces.
- `PLAYWRIGHT_CHANNEL=chrome python tests/map/run.py`: real Run integration,
  keyboard and mouse room entry, walked paths, 48 plan/classic graphs, branching
  and fight pacing. Its fixture bypasses narrative introductions explicitly;
  its console filter ignores only the unrelated missing favicon.
- JavaScript syntax, scene CSS collision checks and CSS token checks pass.
- Captures: `tests/blueprint/foyer.png`, `overview.png`, `foyer-1280.png`.
