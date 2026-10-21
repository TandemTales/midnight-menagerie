# The round-41/42 repair — five pairs a paired test found worse

Survey 8's paired test (`SURVEY-2026-10-20b.md`) put survey 7 (`786ece38`)
against survey 8 (`efa91356`). Both paired judges found five pairs WORSE, all
from rounds 41 and 42: **map**, **hud-late**, the **Kennels**, the
**Passages** and the **Sleeping Quarters**. Put back what survey 7 did better,
KEEP what rounds 41-42 fixed, and prove it paired.

**The rule:** a drawn object beats an empty, dimmed or muted surface, even a
reused one. Round 41 removed the toy-box doghouses, the reused runner and the
Nursery's toys as survey 7's judges asked, and replaced them with emptier
things. Do not undo the brief's intent (each room its own things) -- give
each room things at least as rich, as many and as lit as survey 7's.

The captures to compare: survey 7 `C:/UILOOP/survey7/NOW/` (`map.png`,
`hud-late.png`, their `-1280`, and `rooms/SURVEY-room-<wing>-<kind>.png`) and
survey 8 `C:/UILOOP/survey8/NOW/` (same names). LOOK at each pair first, then
read the judges' lines in `C:/UILOOP/pairs78/judge1.md` and `judge2.md`
(A/B there are random per pair; the lines' descriptions tell you which is
which) and both survey-8 judges' sections for these screens and rooms.

## 1. The map and hud-late: the whole wing legible again

"Fades most of the map into a muddy brown fog with faint routes" (survey 8)
against "inks every node as a gilt medallion and every route as a dark line on
lit parchment, so the whole wing reads" (survey 7). Keep round 42's GAINS:
the reachable rooms clearly marked (lit, rimmed, enamel), the district names
on dark enamel plates, the inked routes, the 12 px+ tags at 1280. Undo the
LOSS: every node drawn and legible to the far edge (a gilt or inked medallion,
not mud), every route a dark line, the sheet's far reaches lit, not fogged.
Mark "where you can go" by ADDING light and rim to the reachable rooms, not by
taking it from the others. The boxed district labels should read as
cartouches, not chips (judge 1). Files: `scenes/map.*`, `ui/mapnode.js`.

## 2. The atlas: one name per wing at every size

Wing X is "BALLROOM" at 1600 but "VELVET SUITES" at 1280; "MOON COURTYARD"
becomes "COURTYARD" (both survey-8 judges). Each wing keeps ONE name at every
size, wrapping to two lines before it changes. Files: `scenes/atlas.*`.

## 3. The three rooms (fx/)

Rule for fx/: a room or shape choice is a `#define`, never a uniform. Read
`gl.getProgramInfoLog` for every program you change.

- **The Kennels:** doghouses that read instantly as separate kennels in
  colour -- painted boards in distinct, saturated-enough paints (green, red,
  blue, or oxblood / bottle / slate at a real chroma), weathered and inked,
  each with its name board; straw visibly over the flags in drifts and
  strewn, the near floor dressed (bowls, a dog bed, straw), not an empty
  brown field.
- **The Passages:** a patterned runner of the passage's OWN design as rich as
  the old medallion runner (red and gold, a border, a repeat -- not the
  Foyer's, not a plain herringbone strip); the side tables with vases and
  flowers again (round 41's graft drew them crisp: keep that), the props solid
  with shadows.
- **The Sleeping Quarters:** the aisle furnished at survey 7's density -- a
  toy chest with stars and moon, a teddy, a rocking horse (drawn for this room,
  fully in frame, not cropped at both edges), the trunk -- and a
  patterned runner of its own as rich as the old one, not a bare rag stripe.

## Proof

- The map and hud-late at both sizes, `sheet-kennels`, `sheet-passages`,
  `sheet-sleeping` (BRIEF-r41's commands) and the 17-room seeded room_batch
  (the list in `survey-2026-10-20b.sh`) into `C:/UILOOP/r41/repair/after/`,
  LOOKED at beside survey 7 and survey 8.
- The other fourteen wings pixel-identical (seeded room_batch before/after).
- Performance on a quiet machine (`tasklist`: no UnrealEditor), kn-1, sp-1,
  sq-1 against BASE, three pairs, drawW checked: under 15.5 ms.
- Tests via `tools/on_port.py PORT`: map, steam-deck, gamepad, chrome,
  dup-keys, shader-literals, link-queue, combat-scene/seam, kennels,
  secret-passages, sleeping-quarters, scene-css, css-tokens.
  `tools/endings_guard.py --base <base>` prints ENDINGS OK before every
  commit. Commit after every item; stop only your own processes, by PID.
- `NOTES.md` in `C:/UILOOP/r41/repair/`: commits, measurements, and what you
  did NOT do.
