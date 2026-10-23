# Round 46's graft — onto SUGILITE's boards

Round 46 merged SUGILITE (no majority; Borda 44, CHAROITE 41, KUNZITE 37;
+1.08, CHAROITE equal on mean). CHAROITE won the atlas (3 of 3) and rest;
KUNZITE hud-late and event. All judges' fixes and grafts are in
`VERDICTS-r46.md`; read it, `BRIEF-r46.md` (ownership, traps, the seven
screens' capture commands; **its rule: never solve crowding by deleting what
the player reads**) and the three builds' notes.

Losers' branches: `ui/r46-boards-a` (CHAROITE: the atlas's inked ghost floor
plans, rest's filigree medallion niches, the torn parchment slips, the
damask panel interiors) and `ui/r46-boards-c` (KUNZITE: the one-row run
strip, the I-VI wing strip on gameover, the pane-shaped moonlight, the larger
risk/gain words). PORT ideas onto dev's tip; do not merge either.

**First, a bug:** at the default size rest's fourth option row runs under the
"Pack up and go on" bar (J3). Fix it before anything else.

## The graft, in order (VERDICTS-r46's list)

1. **The run strip -- KUNZITE's one row** inside the rails, each face 70%+
   visible, the labels engraved on the strip, the place on one line.
2. **rest -- CHAROITE's niches**, no collision at either size, both blankets
   inked and opaque.
3. **The atlas -- CHAROITE's ghost plans**, darker and finer, the Foyer
   brightest.
4. **event:** torn slips with a shadow, KUNZITE's larger words and pane
   moonlight.
5. **gameover:** KUNZITE's I-VI wing strip in SUGILITE's style, the larger
   lists, a ruled ledger with fixed row heights.
6. **settings:** medallions joined to cartouche nameplates, the chosen one
   filled with a gold pip, damask interiors.
7. **piles:** the search plate bevelled with an inset slot; the note readable
   at 1280.

## Proof

- Before/after captures of BRIEF-r46's seven screens at both sizes (its
  commands, into D:/UILOOP/r46/graft/), LOOKED at beside UI/mainMenu.png.
- The small-text probe (`D:/UILOOP/r40/spinel/smalltext.py`) at 1280 on all
  seven: 0 runs under 12 px, or each survivor named.
- Every redrawn control works by mouse, keys and pad.
- Tests (via `tools/on_port.py PORT`): chrome, steam-deck, gamepad, backpack,
  piles-reachable, settings-play, events, gameover-keeps, scene-css,
  css-tokens, seams. `python tools/endings_guard.py --base <your base>`
  prints ENDINGS OK. Commit after every item; stop only your own processes,
  by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
