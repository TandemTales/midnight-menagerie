# Round 36's graft — onto KYANITE's stacked hand

Round 36 merged KYANITE (`c924ab66`, +1.69, 2 of 2 judges). OBSIDIAN was a
close second (7.40 against 7.48) and won the shop and the piles 2 of 2. All
judges' fixes and grafts are in `VERDICTS-r36.md`; read it, `BRIEF-r36.md`
(ownership, traps, capture commands -- the lobby's password is typed in by
the capture step) and the three builds' notes.

Losers' branches: `ui/r36-controls-c` (OBSIDIAN: one ware always "in hand"
with its BUY beside the tag, tags on strings, the piles' reset-curl CLEAR and
lit filter pips, brass seed plates, the lobby's chest and ladder) and
`ui/r36-controls-a` (SAPPHIRINE: glass domes on turned bases and lidded jars,
the scalloped lit valance, the filled SAVE AND QUIT, the colour palette as
framed enamel plates). PORT ideas onto dev's tip; do not merge either; keep
KYANITE's hand and its serif-caps password (NOT OBSIDIAN's chalkboard).

Ownership is BRIEF-r36's. DOM/CSS and the screens' own JS; no fx/ change.

## The graft, in order (both judges agree on all six)

1. **The shop's press point.** KYANITE shows BUY only on the ware under the
   pointer or holding focus, so an untouched board -- every capture, and a
   pad player's first look -- shows price tags and no way to buy. Take
   OBSIDIAN's rule: one ware is ALWAYS in hand (the first affordable Trick
   until the pointer or focus moves, then the last one hovered or focused),
   and its BUY plate sits BESIDE its hanging tag, never over the price.
   OBSIDIAN's tags on strings. Poor / taken / full still read at a glance.
2. **The shop's Keepsakes and Snacks.** Out of the ruled list boxes: each dome
   and jar on its own small plate or shelf lip, the name engraved beneath, the
   tag hung from it; SAPPHIRINE's clear glass domes on turned wooden bases and
   larger, lidded jars; SAPPHIRINE's scalloped, lit valance with swags over
   the Tricks row (keep KYANITE's painted curtain under it if it reads).
3. **The piles.** OBSIDIAN's reset-curl glyph for CLEAR (CLEAR and CLOSE now
   share the X medallion) and a small lit pip under any active filter.
4. **Settings.** The SEED wells' contents upright and larger -- lavender, at
   least 12 px at 1280 -- not ~10 px grey italic; SAVE AND QUIT a FILLED
   aubergine enamel plate with a lit gold rim even when locked (keep its
   padlock); SAPPHIRINE's colour-palette choices as framed enamel plates with
   the selected one lit.
5. **The lobby.** The captions under The House and CLIMB UP 11-12 px and
   brighter; the rope ladder pulled up so it is not cut off behind CLIMB UP;
   OBSIDIAN's chest with KYANITE's trapdoor, warmed, a gold rim where the
   ladder meets the shelf; the PASSWORD label thicker and the well given a
   candle-warm inner glow.
6. **The hand.** The stack-count badges larger, gold-rimmed and set fully on
   each stack's top edge; the copies behind fanned out a little more so their
   cost coins show and a stack reads as several cards at a glance -- without
   the fan climbing toward the fighters' bars again.

## Proof

- Before/after captures of BRIEF-r36's five screens at both sizes (its
  commands, into C:/UILOOP/r36/graft/), LOOKED at beside UI/mainMenu.png.
- **The stacked hand plays.** A scratch check (your scratch dir, not tests/)
  in the crowded fight (`tools/shot-scripts/combat-crowd.js`): play the top
  copy of a stack by mouse, then the next copy by keyboard and the last by
  the pad's keys, and confirm each play leaves the hand one card shorter and
  the stack's count one lower; and a hand of 6 deals no stacks.
- No running text under 11 px at 1280 on the five screens (a small-text
  probe in your scratch dir).
- Tests (via `tools/on_port.py PORT`): chrome, steam-deck, gamepad,
  hand-cards, cards-feel, card-face, piles-reachable, settings-play, backpack,
  combat-scene/seam, scene-css, css-tokens, seams, and `tests/coop/lobby.py`.
  `python tools/endings_guard.py --base <your base>` prints ENDINGS OK.
  Commit after every item; stop only your own processes, by PID; captures in
  `timeout 600`.
- Say in your notes what you did NOT do.
