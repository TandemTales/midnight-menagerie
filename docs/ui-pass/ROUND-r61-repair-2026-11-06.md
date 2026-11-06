# Round 61, a repair: the atlas and the shop as drawn objects again

Survey 12 (`SURVEY-2026-11-06.md`) was better than survey 10 overall. But both judges found the atlas, atlas-house and shop worse than survey 10, because they had lost their drawn objects. Rather than run a full round, one builder repaired those three screens in `ui/r61-repair`; it was merged as `361fe127`.

- **Atlas.** Survey 10's plate was the painted `mansion.png`, which `tests/blueprint/estate.py` forbids loading. So the house is now composed from the playable plans:
  - each wing at its own scale and in its own place, five towers turned a quarter;
  - one outer wall round the house wings, with the courts and halls between them hatched;
  - hedged grounds, the vaults below stairs in dashed line, woods on the open lawn, and galleries joining neighbouring wings.

  What round 60 fixed is kept: captions clear of plans, the count whole at 1280, the key in the north-east bay. The fork behaves as before (`tests/held/check.py` 87/0). The plans are still the generator's strips, about 10% smaller than before.
- **Shop.** Bell jars and sweet jars stand on brass plinths, each with its price tag and a dark name plate. All five Tricks, both shelves and Forgetting are in view at both sizes, with no rail, at unchanged type.

**The paired check:** two blind judges, in opposite orders, compared the repair against dev on these three screens: **repair 6, dev 0.** That was atlas and atlas-house by 2 from each judge, and shop by 1.

Tests:
- `tests/blueprint/estate.py` PASS; `estate.py` now accepts a plan turned a quarter, still demands an exact footprint, and checks the scale is uniform.
- `tests/scene-css/check.py`: 0 conflicts.
- `tests/css-tokens/check.py`: 0 undefined tokens.
- `tests/readability/run.py` on the tree before the merge: no font floor fell.

Still open:
- At 1280 the snack row is cramped: "Stubborn Toffee" and "Liquorice" run past their plaques, and the price tags press on the jars.
- The atlas shortens some names ("Quarters", "Passages", "Heart").
- Every wing is still the same tiled rectangle, so a wing silhouette of its own needs the plan generator.
- The parchment is flat and evenly lit.
- The shop's BACK TO THE BLUEPRINT bar is a flat strip.

Judges' answers are in `D:/UILOOP/pairs61r/`; the key is in `PAIRED-r61-repair-key.json`.
