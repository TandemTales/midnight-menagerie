# The round-40 repair, part 2 — the hand's air and the three-line plates

`REPAIR-r40.md` was merged after a paired blind test (`C:/UILOOP/pairsR6/`,
`pairsR7/`, key in the session scratchpad): against survey 7 (the build it
replaces) it won 3-2 and 4-1; against survey 6 it won the shop (both, by 2),
the event and rest plates (J1), split reward, and LOST two things both judges
name:

1. **combat-crowd** (both survey-6 judges, by 1): survey 6 "fans the five
   cards with gaps between them and its stacked duplicates splay so each one
   reads as a separate physical card, while A's cards butt edge to edge in a
   flat row (very tight at 1280)"; "fans the cards apart with real gaps and a
   tilt, and stacks the duplicate Sit Pretty and Bite cards as visible
   physical decks, so the hand reads as cards held in a hand". The survey-7
   judges liked the repair's bigger cards and the intents on the bar's rail:
   keep both.
2. **The three-line plates** (gameover, rest, event at 1280): "B breaks 'The
   Lady of the House' onto three lines and the nameplate rides up over the
   painting's frame" (gameover-1280, a real overlap); rest "crams 'The /
   Nursery / Shelf' into three and drops 'The / Gardener' onto two lines that
   crowd the fort frame's moon medallion"; "the same title on one line looks
   like the samples' even cartouches".

Ownership as `REPAIR-r40.md`. No `fx/`, no `core/renderer.js`.

## 1. THE HAND: AIR AND A TILT, THE CARDS KEPT WHOLE

At nine cards with duplicates stacked: a fan with a visible gap between
places and a gentle tilt (survey 6's `ui/hand.*` is the reference --
`git show f8150d8e:game/src/ui/hand.js`), each stack splayed so its copies read
as a small physical deck, the cards at the repair's whole size, its top still
below the Butler's bar and his conditions tray, no card over another's cost
coin or title ribbon, every ×N inside its own card. If the gap cannot fit at
1280 with whole cards, shrink the cards there by at most 6% before you close
the gaps. Stack play still 6/6 by mouse, keys and pad (`C:/UILOOP/r40/repair/`
probes).

## 2. PLATES: ONE OR TWO LINES, NEVER OVER A FRAME

A hung painting's plate is one or two lines at 12 px+, under its frame,
never touching the frame or a neighbour ornament (the fort's moon medallion).
Make it a FIT criterion in `ui/hang.js fitHung`: a slot whose painting's plate
needs three lines first tries a wider frame (if the wall has room), then a
plate up to ~1.25x the frame's width centred under it, then swaps in a pool
painting whose name fits -- never three lines. Count stand-ins before and
after on event, rest, reward and gameover at both sizes, every painting of
each pool in each slot.

## Proof

As `REPAIR-r40.md`: the eight screens at both sizes into
`C:/UILOOP/r40/repair2/after/` (reward, event, rest, gameover with `--hash
pics=1`), LOOKED at beside `C:/UILOOP/r40/repair/after/` and survey 6; the
small-text probe 0 under 12 px; the browser tests via `tools/on_port.py`;
ENDINGS OK before every commit; `NOTES.md` with what you did NOT do.
