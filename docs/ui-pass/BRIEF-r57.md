# Round57 — the rooms around the objects, and what ONYX got wrong

Start from the selected Round56 build recorded in RESULTS-r56.json. Read
BRIEF-r0.md, BRIEF-r55.md, BRIEF-r56.md and RUBRIC.md, then inspect all four
reference paintings first. This brief supersedes overlapping earlier priorities.
Two blind judges chose ONYX independently, with TOPAZ and AMBER each ranking above it
on a few surfaces. Overall scores sit at 7.0, no screen is reference-fit, and the
highest coherence on any screen is 7. The objects are much nearer than the walls
and floors they stand on, so this round spends itself on the room around them.

## Highest-value changes, in the order both judges named them

1. **Gameover's Final Tricks rows.** Both judges' first fix. The repeating diagonal
   violet streaks compete with the central card. Make the rows shallow worn velvet or
   lacquer, lit left and falling off to the right, under firm gold rims, irregular
   rather than repeating. Replace the flat violet square cost badges with small cast
   coins that echo the card's own cost medallion, toned toward aged bronze. Keep every
   quantity readable and the complete memorial hierarchy visible. Both judges also
   asked for the card alcove's hard rectangular edges to fall into the ground through
   carved trim or falloff, and a wider cartouche for FROM YOUR FINAL DECK. Do not
   shrink its letters. The leather depth of an oxblood well behind the featured
   card's rules text was named as worth having.
2. **Shop cost disks.** The pale cream disks do not belong on worn rims. Age them to
   tarnished bronze or gold, with a dark ring, dents, local tarnish and one directional
   candle highlight, keeping the large numerals. Lift the engraved TRICKS ribbon, which
   sits dark on bronze with low contrast, and let the MR. MOTH plate sit clear of the
   shelf edge. Keep merchant, curtains, three large cards, prices and all rules.
3. **Event's light.** Both judges name the airbrushed moonlight cones. Paint them
   into the room with pane shapes, dust, broken edges and light that lands on the
   wainscot and floor. Replace the blurred red-orange edge glow on the option strips
   with torn, scorched fibres and a physical shadow on the page. Break the
   parchment's long straight edges with wear, and keep the dark paragraph text in
   contrast at its right edge. Keep the initial story and first option visible.
4. **Rest's ground.** The framed fort floats in murk and the area beneath it is a
   textured placeholder. Add painted incident to the near-empty dark ground through
   existing CSS: floorboards, a rug edge, pooled candlelight and a cast shadow beneath
   the frame. At 1280, raise the separation of the pillow and candle from their dark
   medallions with a stronger lit rim and a darker well.
5. **Combat's condition plaques.** Warm the cyan and pink letter glow toward painted
   lettering on a gold or lavender base, keeping semantic hue, computed color, large
   size and readable faces. The judges also report +2 WEAK landing across the left
   candle at 1600. Placement is owned by the condition queue, whose packing, lifecycle,
   numeric transforms and reservations may not change, so treat this as paint only and
   report what remains.

Prioritize a few strong improvements over touching every selector. Remember the
standing rule: **a drawn object beats an empty, dimmed or muted surface, so brief a
removal as a richer replacement**. Each builder remains independent. Round56's
surfaces are in the parent, so judge your changes against ONYX and keep what works:
its carved lavender titles, its cloth, metal and wax rest icons and its crisp plaques.

## One defect outside the art, to check rather than assume

Judge 1 reports the top bar's run label truncating to "T." and "T.." beside WING 1.
HUD and run rail are out of scope for this round, so do not fix it here. Say in your
notes whether it appears in your captures.

## Art, scope and proof requirements

All of BRIEF-r56's "Art, scope and proof requirements" hold unchanged, including the
non-negotiables it carries from BRIEF-r55, its runtime proof list, the corrected
native timing protocol and the 10% usage reserve. New committed bitmap art stays under
8MB, on versioned game/assets/ui/r57-CODE paths with own prep helper and
tests/ui-r57-CODE. Use the imagegen skill for at least one materially new painted
family this round, preferably the rest ground or the cost coins, unless a CSS-native
painted surface is plainly better; say which in your notes.

No engine, data, state, netcode, lobby, room, map, atlas, blueprint, actor, position,
renderer, hand, run rail or hung-painting edits. Multiplayer work is landing in main
alongside this round on `game/src/net`, `game/src/scenes/lobby.*`, `game/src/ui/netplate.*`,
`game/src/state/run.js`, `game/src/combat/engine.js` and `game/src/main.js`. Those are not
yours, and integration refuses a change to a file main has changed since the snapshot.
