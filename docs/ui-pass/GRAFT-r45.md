# Round 45's graft — onto AXINITE's rooms

Round 45 merged AXINITE (2 of 2 judges, +1.03; LARIMAR 6.31 and HOWLITE 6.25
close). LARIMAR won the Kitchens and the Bathhouse. All judges' fixes and
grafts are in `VERDICTS-r45.md`; read it, `BRIEF-r45.md` (ownership,
performance, traps, the capture commands; **its rule: never fewer objects,
never a smoother or tidier surface**) and the three builds' notes.

Losers' branches: `ui/r45-rooms-b` (LARIMAR: opaque burlap sacks with tied
necks, flour and a wheat roundel; the crate of apples and spilt potatoes; warm
hammered copper tubs with opaque towels) and `ui/r45-rooms-a` (HOWLITE: straw
in the crate tops, a shipping label, the lantern's wire cage and flame, the
burlap weave and XXX stencil, the '3' crock and glazed jug, the near-right
apple crate, the pool tub's towel, dead twigs on the hedge's right wall).
PORT ideas onto dev's tip; do not merge either. A room or shape choice you
port is a `#define`, never a uniform.

## 0. FIRST: the program logs and the frame budget

AXINITE did not read `gl.getProgramInfoLog` and did not measure its last
commit. Read every program's log for the four wings; `tools/linkprof.py` every
program you grow (12 s budget; the Lampworks prop is 8.2 s now, the Hedge prop
~10). Measure lw-1, kc-1, bh-1, hm-1 on a quiet machine (`tasklist`: no
UnrealEditor or UnrealBuildTool), three pairs each against BASE `69298dfb`,
drawW checked. The Hedge fight is at the 15.5 line on this machine (BASE
itself 15.5-15.6): add nothing there that is not paid for in the same wing.

## The graft, in order (VERDICTS-r45's list)

1. **The Kitchens -- LARIMAR's opaque sacks**, HOWLITE's weave, stencil and
   crocks, LARIMAR's apple crate and potatoes in a loose fan, the near-right
   floor dressed, contact shadows.
2. **The Bathhouse -- LARIMAR's warm copper** with rolled rims and specular
   lines, opaque draped towels, the green capsule tub drawn, HOWLITE's pool
   towel, no milky smear.
3. **The Lampworks -- HOWLITE's straw, label and worn stencils**, the
   lantern's cage and flame, the crates lit at 1280, deeper shadows.
4. **The Hedge:** the near lit wall dark green; HOWLITE's dead twigs on the
   right wall.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r45's commands, into D:/UILOOP/r45/graft/), LOOKED at beside
  UI/mainMenu.png; the four main rooms with room_batch
  (lampworks:lampworks,kitchens:kitchen,bathhouse:bathhouse,hedge:hedge,
  --tier medium --w 1280 --h 800) into `after/rooms/` and the base's into
  `before/rooms/` for a paired test.
- The other thirteen wings unchanged: a SEEDED room_batch, before and after.
- Performance and link times: item 0.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates (lampworks,
  kitchens, bathhouse, hedge-maze). `python tools/endings_guard.py --base
  <your base>` prints ENDINGS OK. Commit after every item; stop only your own
  processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
