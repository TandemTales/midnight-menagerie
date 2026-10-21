# Round 43's graft — onto CUPRITE's rooms

Round 43 merged CUPRITE (2 of 3 judges, +1.63; BENITOITE 6.20 and ZINCITE
6.05 close). BENITOITE won the Hedge sheet, ZINCITE the Crypt sheet. All
judges' fixes and grafts are in `VERDICTS-r43.md`; read it, `BRIEF-r43.md`
(ownership, performance, traps, the capture commands; **its rule: never
fewer objects**) and the three builds' notes.

Losers' branches: `ui/r43-rooms-a` (ZINCITE: the withered notches with dead
twigs, upright inscribed headstones with a skull, `MM_GRAVE`'s kerbs, a
second blue-strapped attic trunk) and `ui/r43-rooms-b` (BENITOITE: the
undulating leafy hedge tops, the slid-off cross slab, the built barrel vault,
the teal trunk and larger moon-border rug, traceried window shafts, hammered
copper tubs, a tipped white tub). PORT ideas onto dev's tip; do not merge
either. A room or shape choice you port is a `#define`, never a uniform.

## 0. FIRST: the frame budget and the program logs

The Hedge fight is the closest to the line: CUPRITE ~14.55, BENITOITE up to
15.48 ms. Measure hm-1, cr-1, ao-1 and bh-1 on a quiet machine (`tasklist`: no
UnrealEditor), three pairs each against BASE `b0ca54da`, drawW checked; keep
every fight under 15.5 ms -- the Hedge's new tops must pay for themselves.
Read `gl.getProgramInfoLog` for every program you change; `tools/linkprof.py`
every program you grow (under 12 s).

## The graft, in order (VERDICTS-r43's list)

1. **The Hedge:** BENITOITE's leafy undulating tops on EVERY wall, back walls
   and the fountain court's included, without its topiary stripes; ZINCITE's
   withered notches with bare dead twigs.
2. **The Crypt:** ZINCITE's upright inscribed headstones on bases with a skull
   at the kerb; kerbs as lit stone, never emissive; each room its own layout
   (BENITOITE's cross slab in one, sarcophagi forward in the family vault,
   bone-filled pits in the ossuary); shaded bones; the vault crown lifted;
   CUPRITE's skull-and-candle ledges kept.
3. **fight-crypt:** the headstones out of the enemy's lane at 1280; the
   graves' insides lifted.
4. **The Attic:** the teal and blue-strapped trunks whole at two depths, the
   main one larger; warm lamp light breaking the moon shadow at the left;
   BENITOITE's nearer moon-border rug in the library; the draped chair drawn;
   an object on the library's near-right floor.
5. **The Bathhouse:** BENITOITE's traceried shafts, copper tubs and tipped
   tub with CUPRITE's metals and overturned tub; the sheeted tub drawn; the
   pool's near floor lit and dressed; the near tiles one laid pattern.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r43's commands, into C:/UILOOP/r43/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them (the list in
  `survey-2026-10-20b.sh`), before and after, back to back.
- Performance: item 0's table.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates
  (hedge-maze, attic-observatory, crypt, bathhouse). `python
  tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit after
  every item; stop only your own processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
