# Round 33's graft — onto COBALT's controls

Round 33 merged COBALT (`531126e4`, +1.59, 2 of 3; settings and piles 3 of 3,
shop 2 of 3). BONEBLACK won hud-late (2 of 3). All three judges' fixes and
grafts are in `VERDICTS-r33.md`; read it, `BRIEF-r33.md` (ownership, traps,
capture commands) and the three builds' notes at its end -- COBALT's above
all (`.kit-beltpouch`, `.kit-hw-rail`, `.kit-hw-dialrail`, `.sh-buy::before`,
SOCK_FLOOR, the probe11 small-text probe).

Losers' branches: `ui/r33-controls-c` (BONEBLACK: the run strip's SEED label
and diamond separator, Gear shown as a toned set beside a Keepsakes count
plate, brighter gold slider figures) and `ui/r33-controls-b` (CADMIUM: the
single-line swallowtail cartouches "KEEPSAKES 10" / "GEAR 8" with a leading
medallion, the brass price tag with a punched hole, a lamp lit on a toggle's
ON state). PORT ideas onto dev's tip; do not merge either.

Ownership is BRIEF-r33's. The rendering is DOM/CSS only; no fx/ change.

## The graft, in order (all three judges agree on 1-4)

1. **The run strip at 1280 (hud-late) -- all three.** Put SEED in front of
   0000-0000 the way HAUNT is labelled (BONEBLACK). Set KEEPSAKES 10 and
   GEAR 8 each on ONE line in a crisp engraved cartouche (CADMIUM's
   swallowtail), as bright and as large as HAUNT. Use the freed width -- and
   the ~35 px COBALT left unused -- to show more owned objects beside each
   plate: at least 3 per group at 30 px+ at 1280, with a clear gap between
   the groups. The pouch's fan-out tray stays.
2. **The shop's price-and-BUY plate -- all three.** It reads as a flat dark
   stadium. Give it a brass tag or cartouche housing (an engraved rim, a
   clipped or scrolled end; CADMIUM's tag with a punched hole is welcome)
   and give the BUY half an enamel face with brighter cream caps, so the
   press-point outranks the price. Keep ONE control per row; keep the poor /
   sold / blocked states readable. Also set the market subtitle ("Buttons,
   keys, marbles, teeth ...") and "keeper of lost things" upright at 12 px+.
3. **Settings' states -- all three.** The disabled SAVE AND QUIT is grey on
   dark and nearly invisible: engrave it in a dimmed antique gold with a
   visible "no expedition" lock glyph, framed as the cartouche RESTORE
   DEFAULTS and DONE use. Each lever's inactive OFF/ON word at least 4.5:1
   in muted gold, the active one lit (CADMIUM's lamp on ON, if it fits).
   RESET: give the warning glyph its own disc, off the label.
4. **The sliders and the piles rail -- all three.** End caps or finials on
   each brass rail, a slightly heavier rail, tick marks about twice as tall,
   the value in a small engraved gold cartouche at the rail's end (bright
   gold numerals). On piles, the TYPE / COST / RARITY / UPGRADED / SORT
   captions at least as legible as the values under them; one judge asks for
   a centred rail ~75% wide with ~34 px medallions, each with its own enamel
   tint -- try it, keep it if it reads as ONE object.
5. **The last small print.** The piles caption ("Sorted alphabetically ...")
   upright 12 px+ cream; help lines on settings and under shop Keepsakes /
   Snacks at 12-13 px at 1280 where they fit without wrapping worse.

## Proof

- Before/after captures of BRIEF-r33's four screens at both sizes (its
  commands, into C:/UILOOP/r33/graft/), LOOKED at beside UI/mainMenu.png;
  plus the reward board at 1280 (`--hash pics=1`) for TAKE NONE.
- The small-text probe (COBALT's probe11, in your scratch dir) on all four
  screens at 1280: no running text under 11 px outside the card face.
- Tests (via `tools/on_port.py PORT`): chrome, steam-deck, gamepad,
  piles-reachable, settings-play, backpack, scene-css, css-tokens, seams.
  `python tools/endings_guard.py --base <your base>` prints ENDINGS OK.
  Commit as you go; stop only your own processes, by PID.
- Say in your notes what you did NOT do.
