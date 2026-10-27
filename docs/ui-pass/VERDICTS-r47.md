# Round 47 — verdicts: the four bottom rooms (the Kennels, the Hedge, the Attic, the Bathhouse)

Base `3f9b9896`. CHIFFON is the baseline. Builders: SPESSARTINE
(`ui/r47-rooms-a`, LITERAL), RUTILE (`-b`, THE HERO PROP FIRST), TANZANITE
(`-c`, FILL THE NEAR FLOOR). All finished in one run (`wf_03511528-df8`);
two blind judges, both picked RUTILE.

## Scores (mean of two judges)

| screen | RUTILE | TANZANITE | SPESSARTINE | CHIFFON | winner |
|---|---|---|---|---|---|
| sheet-kennels | 5.50 | **6.00** | 5.65 | 4.65 | TANZANITE (2 of 2) |
| sheet-hedge | **6.10** | 5.10 | 5.15 | 4.70 | RUTILE (2 of 2) |
| sheet-attic | **6.15** | 5.65 | 5.25 | 4.30 | RUTILE (2 of 2) |
| sheet-bathhouse | 5.55 | **6.10** | 5.60 | 5.20 | TANZANITE (2 of 2) |
| fight-kennels | 5.90 | 5.70 | **6.00** | 5.30 | SPESSARTINE (2 of 2) |
| **mean** | **5.84** | 5.71 | 5.53 | 4.83 | |

**RUTILE won, +1.01.** It "fixed the hero props themselves": the hedge is
"clumped and inked leaf masses instead of tiled noise", and the attic trunks
have "brass corners and studs without stair-stepped edges". Its attic and
bathhouse darks "stay dark with no lilac milk" (J2). TANZANITE won the
Kennels and the Bathhouse on near-floor dressing, "since a drawn object beats
an empty floor". SPESSARTINE won the fight on its weathered doghouses.

**The stair-stepped trunks were a bug, and all three builders found it.**
`trSD` swept the box back by unioning six offset copies of its front, so
every swept edge was a six-corner staircase. Each builder replaced it with an
exact sweep.

## RUTILE's defects (what the judges ask of it)

- **Empty near floors** in the Attic (below the rug), the Bathhouse (in front
  of the duckboard) and the Hedge lawns.
- **The Kennels:** the doghouses "still clean single-colour boxes with no
  peeling paint or board wear" (J1). The near floor is "a large irregular
  straw puddle decal" (J2). In the fight, the green doghouse behind the Kid
  "smears into a soft flat-green mass" (J2).
- **The Bathhouse:** the water is "a flat blue disc"; the rim highlight only
  on the nearest tubs; the steam room's lower third soft.
- **The Hedge:** the clumps want visible gaps and withered holes, and a dark
  inked line where each hedge meets the lawn.

## THE GRAFT — what the judges ask for

1. **TANZANITE's near floors, everywhere** (both judges):
   - **Kennels room:** the trough on trestles, the bales and the hay fork.
     Give the bales more straw texture than TANZANITE's.
   - **Wash room:** a stool with towels, a tin pail with a brush, and bales.
   - **Bathhouse:** the towel rack, a stool with towels and the bucket in
     the hall and the steam room, and the small stool at the pool's near
     rail.
   - **Attic:** the hatboxes and the rolled rug, redrawn with inked textures
     rather than low-res plaid.
   - **Hedge:** the urn on the near-left lawn, and the leaf-litter verges
     banked along the path in all three hedge rooms.
2. **SPESSARTINE's weathered doghouses** (both): peeling paint over bare
   grey boards, worn edges, darker shingles. Tone it down so it reads as worn
   paint, "not camouflage blotches".
3. **SPESSARTINE's bathhouse floor** (both): dark inked grout, and the
   moonlight cast as hard window-pane grids on the tiles. Also a moon glint
   on the tub water, carried to every tub with the rim highlight.
4. **The Hedge** (both): SPESSARTINE's withered brown patches layered onto
   RUTILE's clumps, so they follow the clumps; gaps; the inked foot line.
5. **The Attic library** (J2): its moon rectangle a hard shaft with mullion
   shadows on dark boards.
6. **fight-kennels** (J2): the green doghouse behind the Kid sharpened at
   fight scale.

## PERFORMANCE — NOT YET TRUSTED

All three builders measured with UnrealEditor running, and BASE itself read
over 15.5 ms on kn-1 and hm-1 in their runs. RUTILE's best guess: props
about +0.7 ms on kn-1. Its linkprof read the Bathhouse prop program at 33.3 s
against BASE's 13.0, on a machine where untouched programs varied 2-4x.
**Both are re-measured, interleaved, before RUTILE merges.**
