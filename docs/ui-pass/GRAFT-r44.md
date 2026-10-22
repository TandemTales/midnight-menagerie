# Round 44's graft — onto PYRITE's rooms

Round 44 merged PYRITE (2 of 2 judges, +2.10; SPHENE 6.20 by mean). SPHENE
won the Greenhouse and the Graveyard outright. All judges' fixes and grafts
are in `VERDICTS-r44.md`; read it, `BRIEF-r44.md` (ownership, performance,
traps, the capture commands; **its rule: never fewer objects, never a
smoother surface**) and the three builds' notes.

Losers' branches: `ui/r44-rooms-a` (SPHENE: verdigris iron columns with rust
runs and riveted collars, the conservatory's reflecting pool, moss in the
tiles, the graveyard's winding path, roots and clustered stones in threes,
the pumpkin wall's grass verge and extra pumpkins) and `ui/r44-rooms-b`
(EUCLASE: moonlit mullion shafts across the conservatory floor, the rocking
horse's darker dapples and striped mane). PORT ideas onto dev's tip; do not
merge either. A room or shape choice you port is a `#define`, never a
uniform.

## 0. FIRST: the frame budget and the program logs

PYRITE measured only pk-1 (+0.14 ms, before its last changes); gh-1, gy-1 and
nursery-1 were not measured and its pumpkin floor and greenhouse prop
programs GREW without a linkprof. Measure all four (pk-1/pumpkin-grounds,
gh-1/greenhouse, gy-1/graveyard, nursery-1/nursery) on a quiet machine
(`tasklist`: no UnrealEditor), three pairs each against BASE `297c0545`,
drawW checked; keep every fight under 15.5 ms -- the Pumpkin fight is ~15.0,
the closest to the line. `tools/linkprof.py` every program of the four wings
(under 12 s); read `gl.getProgramInfoLog` for each.

## The graft, in order (VERDICTS-r44's list)

1. **The Greenhouse -- SPHENE's columns and pool**, moss, EUCLASE's mullion
   shafts, PYRITE's puddles without black outlines, the rail band lifted.
2. **The Graveyard -- SPHENE's path, roots and clustered stones**, more of
   them right of the path, each shadowed; crisp tree shadows or inked grass
   for the smeared streaks.
3. **The Pumpkin Grounds:** the near joints inked to the front; reflections
   on the pond; SPHENE's verge and extra pumpkins.
4. **The Nursery:** the strip behind the rug lit; the block set down; the
   rug's letters facing the player; EUCLASE's dapples and mane.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r44's commands, into D:/UILOOP/r44/graft/), LOOKED at beside
  UI/mainMenu.png; the four wings' main rooms with room_batch
  (pumpkin:courtyard,greenhouse:conservatory,graveyard:yard,nursery:nursery,
  --tier medium --w 1280 --h 800) into `after/rooms/` and the base's into
  `before/rooms/` for a paired test.
- The other thirteen wings unchanged: a SEEDED room_batch, before and after,
  back to back.
- Performance and link times: item 0's table.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates
  (pumpkin-grounds, greenhouse, graveyard, nursery). `python
  tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit after
  every item; stop only your own processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
