# Round 41's graft — onto AMETHYST's rooms

Round 41 merged AMETHYST (2 of 3 judges, +1.59; LABRADORITE 5.23 and ZIRCON
5.16 close behind). ZIRCON won the Hedge sheet and the fight, LABRADORITE the
Sleeping Quarters. All judges' fixes and grafts are in `VERDICTS-r41.md`;
read it, `BRIEF-r41.md` (ownership, performance, traps, the capture commands)
and the three builds' notes.

Losers' branches: `ui/r41-rooms-a` (ZIRCON: the clipped `yewRagW`/`yewRagP`
cut, the root line, the walk's dark laid flags `r41Joint`, the spiral topiary
seed, straw heaps, per-panel figure in the Passages) and `ui/r41-rooms-b`
(LABRADORITE: the prop pen `uPropPen`, `yewCutR`, the walk's inked joints
`r41Walk`, the hit-and-miss rag runner and the elm blanket chest, straw round
the doghouse feet). PORT ideas onto dev's tip; do not merge either. **Any
room or shape choice you port is a `#define`, never a uniform** --
LABRADORITE's `uPropPen` included.

## 0. FIRST: the program logs and the frame budget

AMETHYST did not read `gl.getProgramInfoLog`, and ZIRCON found a ceiling
program in these wings drawing the clear colour (an undefined define shared
through FLOOR_FRAG). Read every program's info log for the four wings
(`tools/gpuprof.py` records `proglog` since round 39) and LOOK at every room.
Measure on a quiet machine (`tasklist`: no UnrealEditor) with `size.drawW`
checked, three pairs, BASE `1271452b` vs your tip, for hm-1, kn-1, sq-1 and
sp-1: AMETHYST's single kn-1 pair was +1.3 ms (13.94). Keep every fight
under 15.5 ms.

## The graft, in order

1. **The Hedge path** (all three judges): ZIRCON's/LABRADORITE's dark laid
   flagstones with inked joints shrinking toward the fountain, a
   stone-coloured kerb instead of the two pale strips that read as road
   paint; the hedges' green and the lawn's dark held at 1280.
2. **The Hedge walls:** LABRADORITE's hard clipped top with sprigs, a dark
   inked root line and contact shadow, the face darkening toward the
   ground; ZIRCON's spiral topiary in the fountain room; the lawn's leaf
   litter in inked clumps, dark.
3. **The dormitory:** LABRADORITE's crisp striped rag runner and its inked
   trunk with a bedroll, in place of the olive runner; the bedroom's near
   planks dressed (a light pool, a slipper or rug edge).
4. **The Kennels:** straw in crisp inked clumps against the doghouse footings
   with bare flags between (ZIRCON's scale, not a scribble texture); the wash
   house's tile muted and wet-dark, grout wear and inked puddle edges in
   place of the soft black blotches, its near-left corner lit, no milky blue
   on the right.
5. **The Passages' walls:** varied bays -- inked doors, recesses, sconce
   plates, different panel sizes -- so no wall repeats one stretched grain
   (all three judges still see it on AMETHYST's tip; find out why its bay
   variation does not show at the Deck tier before adding more).
6. **The pen:** LABRADORITE's prop outline, lightly, on the four wings'
   props, as a `#define`.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r41's commands, into C:/UILOOP/r41/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them (the list
  in `survey-2026-10-20.sh`), before and after, back to back (twice if a
  wing differs: one build can differ from itself between runs).
- Performance: item 0's table, three pairs, all four wings, quiet machine.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals,
  link-queue, combat-scene/seam, chrome, steam-deck and the four region gates
  (hedge-maze, kennels, sleeping-quarters, secret-passages). `python
  tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit after
  every item; stop only your own processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
