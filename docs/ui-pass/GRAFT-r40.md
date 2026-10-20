# Round 40's graft — onto SPINEL's boards

Round 40 merged SPINEL (2 of 3 judges, +1.14; the three builds within 0.07 of
each other). AVENTURINE won gameover and the map, IOLITE won reward. All
judges' fixes and grafts are in `VERDICTS-r40.md`; read it, `BRIEF-r40.md`
(ownership, traps, the six screens' capture commands -- reward and gameover
with `--hash pics=1`) and the three builds' notes.

Losers' branches: `ui/r40-boards-b` (IOLITE: the paintings on the upper wall
with plates below, `hang.js settlePlate()`, the gothic windows in the side
bays, gameover's cords at both sizes, the boss's medallions by his nameplate,
the map's tinted, stippled region shapes) and `ui/r40-boards-c` (AVENTURINE:
`map.js regionShape()` -- one irregular boundary per region pulled round its
rooms; gameover's centre as one shrine with both paintings on cords flanking
the card; the shop's Keepsakes and Snacks on raised plinths; the strip's
rimmed objects with a count medallion). PORT ideas onto dev's tip; do not
merge either; keep SPINEL's 12 px floor (its probe:
`C:/UILOOP/r40/spinel/smalltext.py`).

Ownership is BRIEF-r40's. DOM/CSS and the screens' own JS; no fx/ change.

## The graft, in order

1. **Reward -- IOLITE's wall** (all three judges): the paintings high on the
   upper wall either side of the title, on cords, plates below -- never in the
   gutter beside the cards at 1280 -- and the moonlit gothic windows in the
   side bays beside the cards.
2. **The boss's medallions -- IOLITE's:** set either side of the crescent on
   his nameplate, by him, where the hand can never cover them.
3. **The hand's longest cards** (all three): Put Yourself Back Together and Go
   Get It! in the crowded hand at 1280 -- rules at 12 px+ RENDERED (widen the
   card a little, wrap less, or let the title condense to two lines) and the
   SKILL ribbon clear of the first word. Measure those two cards' rendered
   px directly; SPINEL's probe passed while three judges read them at 9-10.
4. **Gameover -- AVENTURINE's hang:** both paintings on cords inside the
   centre frame flanking the Worked Hardest card, plates below; the "leaning
   on one Trick" line under the card; the mansion painting its own cord and a
   gap above HOW FAR, with a nameplate like the Dowager's; the Dowager's plate
   fully below her frame.
5. **The map's regions -- AVENTURINE's shapes with IOLITE's tint:** one convex
   district per region hugging its rooms (no notch or tongue between them), a
   soft tint and stipple across the whole shape, the label off the outline.
6. **The run strip:** KEEPSAKES 10 / GEAR 8 counts in the cartouches; the
   "+7"/"+5" badges inside the strip; colour-coded rings on every coin;
   "Wing 1" back on the location plate.
7. **The shop:** AVENTURINE's plinths with plate and tag hanging below; each
   item's rule under its own jar; the Coatcheck Ticket's description capped at
   three lines (or a wider column) at 1280.

## Proof

- Before/after captures of BRIEF-r40's six screens at both sizes (its
  commands, into C:/UILOOP/r40/graft/), LOOKED at beside UI/mainMenu.png.
- SPINEL's small-text probe on all six at 1280: still 0 runs under 12 px; and
  the two named hand cards measured directly.
- The paintings checked with EVERY painting of each pool in each slot at both
  sizes on reward, gameover, event and rest -- no plate over a canvas, no
  sconce or card over a plate.
- The stacked hand still plays by mouse, keys and pad (round 36's check).
- Tests (via `tools/on_port.py PORT`): chrome, steam-deck, gamepad,
  hand-cards, card-face, cards-feel, map, backpack, gameover-keeps,
  combat-scene/seam, scene-css, css-tokens, seams. `python
  tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit after
  every item; stop only your own processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
