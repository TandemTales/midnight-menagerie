# Round58 — the table: what a party of four sees

Start from dev at BASE. Read BRIEF-r0.md, BRIEF-r55.md, BRIEF-r56.md and RUBRIC.md, then
inspect all four reference paintings first. This brief supersedes overlapping earlier
priorities.

The demo is a co-op demo, and these screens have never been in front of a judge. Every
round so far photographed one Kid. A party of four was only proved to work on November 4,
and its fight, its ballot, its Treehouse and its dropped-friend plate are the plainest
surfaces left in the game. Look at the baseline captures before reading on.

## Highest-value changes, in order

1. **The fight of four (`combat-party`).** Four Kids and four Companions pile into one
   clump: Maya stands in front of the others, a friend's head is half hidden by another,
   and the back friend stands over the first enemy's House Rule sign. Stage them as a party
   that came in together. Every Kid's FACE and every Companion must be readable at both
   sizes, with the party in depth rather than a heap, and no Kid over an enemy's sign or
   plate. Staging is `.cb-hero--friend` and its `--friend-dx`/`--friend-dy`/scale in
   `combat.css`; enemies keep their positions. **The trap:** the easy fix is to shrink the
   friends until they stop overlapping. Small dim figures in a row are worse than a heap.
   Keep them large enough to recognise, and let the depth do the work.

2. **The friends' plates (`combat-party`, `.cb-mates`).** Three flat dark boxes with a thin
   rule, and `Weak 2` as a web pill. They should belong with the Companion plate at lower
   left and the sample nameplates: a worn plaque, the Companion's medallion seated in it,
   a bar that belongs to the HUD's, and conditions as small struck tokens rather than pills.
   Keep the name, Courage numbers, Guard and condition names readable at both sizes. The
   plates must not grow past 18vw: the Kids stand right of them.

3. **The notes toolbar (`map-vote`, `ui/map-markings.*`).** The most web-looking thing left
   in the demo: a flat brown box of flat rectangular buttons laid over a band of the
   blueprint, beside the same flat `Discoveries` and `How to play`. Draw it as an object
   that belongs on a draughtsman's table: a pencil tray, a ruler's edge, a brass rail with
   real pencils in the pencils' colours. **Every control stays, with its words or a label
   readable at 1280** (Hand, Yellow, Red, Green, Chalk, Eraser, Undo, Clear, X room, Unmark,
   You are here, Overview, zoom out, zoom in) and the hint line. **The trap:** do not solve
   it by hiding it behind a toggle or making it faint. It may cover LESS of the sheet than
   it does now and may not cover more. Bring `Discoveries` and `How to play` into the same
   family.

4. **The ballot (`map-vote`).** The whole point of voting is seeing what friends chose. The
   `3 of 4 have chosen` strip and the pins on the doors (`.mn-votes`, one Kid's initial each)
   are small and thin. Make a pin read as a friend's mark on the blueprint at both sizes,
   and give the strip the weight of the footer around it. The doors' text stays.

5. **The dropped-friend plate (`net-plate`, `ui/netplate.*`).** A flat purple rectangle laid
   across the top of the board, covering the House Rule sign. It is a moment of real worry
   for the table and should look deliberate: a plaque with the same fittings as the rest of
   the house, in a place that hides no enemy's sign, plate or intent. Its words and both
   buttons stay at their size. It is not a modal: the board stays playable underneath.

6. **The Treehouse with a party (`lobby-party`).** The intro line runs through the moon and
   stars. A window and a coil of rope peer out from behind the outer seats, cut off by them.
   `seed 609573837` reads as a debug print beside the password. Clean up what collides by
   moving or redrawing it, not by removing the room: a drawn object beats an empty surface.
   The four seats, the ready marks and the pickers keep their size.

7. **The shop's rules panels (`shop`).** Open from round 57's judges: large dark voids. Give
   them a painted surface with grain and worn corners, darkened to sit with the card frames.
   Do not shrink the large text. A pasted swatch was marked down last round.

Prioritize a few strong improvements over touching every selector. **A drawn object beats
an empty, dimmed or muted surface, so brief any removal as a richer replacement.** Three
times now a paired test has overturned a fix that darkened or removed something.

## Art, scope and proof requirements

Painted surfaces are CSS, SVG and code-drawn textures in your own files, or crops and edits
of art the repo already holds; keep new committed bitmaps under 8MB, on versioned
`game/assets/ui/r58-CODE` paths. No baked text, no whole-scene generation. Keep the
non-negotiables from BRIEF-r55: larger text, global two-thirds animation speed, no seed in
the top HUD, and all shop content.

**Who owns what this round.** Yours: `game/src/scenes/combat.css` (friends and plates only),
`game/src/scenes/map.css`, `game/src/ui/map-markings.*`, `game/src/ui/netplate.css` and the
markup in `netplate.js`, `game/src/scenes/lobby.css` and the markup in `_paintRoom`,
`game/src/scenes/shop.css`, and new asset paths. Not yours: engine, data, state, netcode
(`game/src/net`), `run.js`, renderer, hand, run rail, enemies' positions, the blueprint's
drawing, any behaviour. A button that worked must still work, by keyboard and pad as well.

Prove it with `tests/chrome/run.py`, `tests/steam-deck/run.py`, `tests/gamepad/run.py`,
`tests/coop/lobby.py`, `tests/coop/matedeck.py`, `tests/scene-css/check.py`,
`tests/css-tokens/check.py` and `tests/readability/run.py`, all through
`python tools/on_port.py PORT` so they hit your server and not :8777. Fights stay under the
15.5 ms budget (`tools/gpuprof.py --settle 14`, on your port, one reading is noise). Three
friends are drawn in `combat-party`, so measure that fight if you touch their filters.

Take canonical captures only with
`python D:/UILOOP/r58/capture.py <your worktree> <your port> <your code>`, which writes the
ten PNGs the judges see. Then LOOK at all ten yourself. Commit as you go. Stop only processes
you started, by PID.
