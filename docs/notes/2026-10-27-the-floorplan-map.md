# The floorplan map (2026-10-27)

Josh: the symbols on the map were clear but the blueprint under them could not
be read, and the routes ignored its walls and doors. Redraw the blueprints as
simple, clear plans; route only through doors and hallways, plus a few secret
ways (fireplace, bookcase, hidden stair) that may join any two rooms; keep the
old map retrievable; a fight about every other room.

## Switching back

- `localStorage['mm.mapStyle'] = 'classic'` (or deep link `#scene=map&mapstyle=classic`)
  restores the old lattice-over-traced-section map exactly. `'plan'` is the default.
- `generateClassicMap` in `state/mapgen.js` is the old generator, untouched
  (byte-identical output checked by hashing 30 maps before and after).
- Git tag `map-classic-2026-10-27` marks the commit before any of this.
- Co-op: both Kids must be on the same style, or one seed makes two wings.

## How it works

`state/floorplan.js`. Depth runs west to east in COLUMNS; each column is a stack
of rooms. Two rooms in neighbouring columns share wall exactly where their
heights overlap, and that overlap graph IS a crossing-free staircase. So every
route leg is a door in a wall both rooms really have, and the drawing is the
graph.

- **Brick bond.** Each wall of a column is laid a clear 44px inside a room of
  the column behind, so that room opens onto two. Sampling walls freely and
  nudging them apart gave 77% single-exit rooms (aligned walls = a grid).
- **Room counts grow, hold, and close once.** A drop from m to n rooms forces
  m - n + 1 dead-ends; a wobbling 5,4,5,4 profile paid that at every wall.
- **Hallways** are carved through a column between two of its rooms, joining a
  room on each side (the classic "long passage", made real). ~3 a wing.
- **Secret ways**: 0-2 a wing (mean ~1.1), two to four columns, any lane,
  device chosen per wing (`SECRET_DEVICES`). Drawn as the Kids' dotted yellow
  crayon; the only legs allowed to cross anything.
- **Fights**: the classic recipe, then a spacing pass (no route goes three rooms
  without a fight) and a relief pass handing Scuffles back to events where that
  cannot open a gap. Classic: 47% fights per walked room but 82% of routes had
  3+ quiet rooms in a row (worst 12). Plan: ~52-55% fights, ~1% of routes with
  3 quiet rooms, never more than 3.

Measured over 510-1020 sheets (scratch checker; tests/map/run.py now runs
both styles): zero crossings, every door inside a shared wall, every room
reachable and able to reach the boss, mean 1.74 exits a room, 29% single-exit.
The classic gate was 1.75 / 20.5%; the plan's floor is geometry (m + n - 1
doors between stacks, and the wing must close 5 -> 3 at the boss), so its gate
is 1.65 / 33%.

## Each wing's form (`WING_FORM`)

Read off each wing's one-line description in `mapgen.js REGIONS`:

- **Symmetrical** (Foyer, Ballroom, Crypt, Heart): mirrored about the long
  axis. A mirrored brick bond has to alternate 4 and 5 rooms a column (a
  centred block of walls needs an even number of rooms left over behind it).
  Every column on 40 sheets per wing came out centred, with no fallbacks.
- **Curves**: crescent bow (Bathhouse, Graveyard), climb to the tower (Attic),
  meander (Kitchens, Greenhouse, Hedge Maze, Pumpkin Grounds), drift (Study,
  Kennels). Each column's bond steps toward the curve.
- **Depth** (`widest`): compact suite, residential corridor, shaft and the
  passages are four rooms deep at most; the rest five.
- **Halls**: Sleeping Quarters, Lampworks and the Secret Passages get more
  corridor.

A bond that does not fit is re-rolled up to six times before the column gives
up a room (that took 5% of symmetric sheets off a one-room fallback column).

## Captures on this machine

`tools/shot.py` on the map fails or takes ~25 s at `page.screenshot` some of
the time, and the paper canvas sometimes comes back unpainted. Measured
2026-10-27 with four repeats each: the CLASSIC map does the same (23.6 s,
5.6 s, a failure, 7.9 s against the plan's 22.6 s, 25.1 s, a failure, 6.8 s),
so it is GPU state, not the floorplan. Single-run bisects were misleading
(one said hiding the candle lamp fixed it; repeats said not). Retry a failed
capture; look at every one.

## Drawing

`ui/blueprint.js`: the old paper tinted to a cyanotype (`tintBlueprint`), a
drafting grid, wall RUNS computed from every room edge (one space = exterior,
heavy; two = partition, light) with doors, hallway mouths and windows cut out;
door leaves and swings, front-door steps, the boss hall's columns and dais,
furniture kept to the top/bottom walls (the middle is the mark's), room names
where they fit, a dimension chain over the columns. `map.js _drawKidNotes`
scrawls a few crayon notes on clear paper only.

Marks in plan mode are crayon symbols, one colour per room kind, on a
rubbed-clean patch of floor (map.css `.map-screen--plan`, written !important
so the classic stack is overridden wholesale and restored untouched).

## Not done

- The atlas still zooms the traced `sectionNN` drawings of the whole-house
  sheet; it does not show the generated plans.
