# Round 46 — the boards: the run strip's +N, the last web controls, the atlas, rest, event, gameover

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r33.md` and `BRIEF-r36.md` (the controls
rounds), `BRIEF-r38.md` (the atlas), `BRIEF-r40.md` (the 12 px floor at 1280),
`BRIEF-r42.md`, `REPAIR-r40.md`, `REPAIR-r40b.md` and `REPAIR-r41.md` (what the
boards' paired tests found). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r46.md`.**

## THE RULE THIS ROUND IS BUILT ON

Five times in a week a pass removed, shrank, muted, dimmed, smoothed or
tidied something a judge named, and a paired blind test found it worse
(README rows 40r-45). On the boards: shrinking the hand and moving the
boss's intents lost (survey 7); dimming the map's far rooms lost (survey 8).
**A drawn object beats an empty, dimmed or shrunken one.** Where a judge says
"cut", "drop" or "collapse", REPLACE the weak thing with something drawn and
readable; never solve crowding by deleting what the player reads.

**Josh's rule:** the hung paintings carry NO names (2026-10-21). Do not add
nameplates with text. Not your boards' paintings this round anyway.

## WHY

Survey 9 (`SURVEY-2026-10-22.md`): both judges' notes on these seven boards.

| screen | what both said |
|---|---|
| **hud-late** | at 1280 "KEEPSAKES 10 shows only two medallions and a +8 chip, and GEAR 8 shows two and +6. A late-run player cannot see what they own"; "let the groups show more medallions, overlapping like a fanned stack at smaller size, before collapsing to +N ... the right third is mostly HAUNT and SEED"; "give the +8 chips the round enamel medallion treatment" |
| **settings** | "the colour-palette choices are four small pills" / "rounded pill buttons that read as web radio chips" -- "round enamel medallions with gold rims, the swatch painted inside, a nameplate beneath"; at 1280 "the six section panels are packed edge to edge"; the panels' interiors "an even plum fill" -- a damask or engraved-paper ground and an inner gold double rule |
| **piles** | the "Seek a Trick by name..." field "is a gold-outlined web text input ... the most web-UI object in the dialog" -- "an engraved brass nameplate or a parchment slip in a cartouche, with the magnifier as a round enamel medallion fused to it"; at 1280 an empty band between the tray and CLOSE; the inner ground "a lit felt or damask with a candle-warm falloff" |
| **atlas** | the sixteen unsurveyed wings "flat sepia blotches with only a dashed outline ... nameplates floating over nothing drawn" / "dark brown shapes under faded tan labels" -- "draw every unsurveyed wing as a faint ink ghost (pencil walls, hatched room outlines)"; labels in dark ink, readable at 1280 |
| **rest** | the blanket fort "fuzzy, noise-textured felt with a flat translucent moonbeam wedge ... Maya and Bones inside are tiny" -- "crisp folds, a visible quilt-patch seam pattern and a clear inked edge", the Kid and Companion about twice the size; the four option rows "four identical long panels" -- a small painted vignette per option (pillow, whetstone, candle, teacup) |
| **event** | the parchment page "pale, evenly lit"; the risk/gain words "about 11 px at 1280, weak contrast" -- a heavier ink (oxblood, bottle green); "nothing about them reads as a control" -- each choice a visible inked slip or ruled ledger row; the window haze cones "drawn moonlight: crisp-edged lit patches" |
| **gameover** | the Final Tricks list "mixes left-aligned names with centred two-line names, so its columns zig-zag" -- every name left-aligned as a ledger; at 1280 the left column's lists ~10 px -- 12 px+; the "As far as we got" plan chip "a pale washed-out chip" |

## THE FIX LIST

1. **hud-late at 1280:** every Keepsake and Gear visible as a fanned,
   overlapping stack of medallions (smaller, but each one distinct) before any
   +N, using the room HAUNT and SEED leave; any remaining +N a round enamel
   medallion; Buttons / Clues / Luck in their own spaced cells. Round 33's
   words stay on the strip.
2. **The last web controls:** the settings palette as four enamel medallions
   with the swatch inside and a nameplate; the piles search as an engraved
   brass nameplate or a parchment slip in a cartouche with the magnifier a
   fused enamel medallion (it still takes typing, filters, clears); the
   settings and piles panels' interiors given a material (damask, engraved
   paper, lit felt) and an inner gold rule; nothing in settings touches a rule
   at 1280; the piles' empty band at 1280 used, not left.
3. **The atlas:** each unsurveyed wing a faint ink ghost of its plan --
   pencil walls, hatched room outlines -- on the paper, its label in dark ink
   readable at 1280; keep round 42's riveted key and the lit surveyed wing.
4. **rest:** the blanket fort redrawn crisp (inked folds, quilt-patch seams,
   a clear edge, a crisp lit patch for the moonbeam), the Kid and Companion
   about twice the size in its lit arch; each option row with its own small
   painted object.
5. **event:** each choice an inked slip or ruled ledger row that reads as the
   control; the risk/gain words 12 px+ at 1280 in a heavier oxblood / bottle
   green; the page's edges burned and darkened; the window haze cones drawn
   as crisp moonlit patches.
6. **gameover:** the Final Tricks list a ledger -- every name left-aligned,
   long names wrapping left-aligned; the left column's lists 12 px+ at 1280
   by reflowing, not by cutting what the player reads; the "As far as we got"
   chip drawn as a crisp inked plan of the wings crossed.

## WHO OWNS WHAT THIS ROUND

**Yours:** `ui/hud.*` (the run strip), `ui/settings.*`, `ui/deckview.*` (the
piles dialog), `scenes/atlas.*`, `scenes/rest.*`, `scenes/event.*`,
`scenes/gameover.*` (not their paintings' hang: `ui/hang.js` is not yours),
`kit.css` and `tokens.css` by APPENDING; the existing prep tools, extended.

**Not yours:** `fx/*` (the rooms), `core/renderer.js` (keep its render-scale
governor: Josh's standing rule), the cards' face design, the fight HUD, the
map, the shop, reward, the hand, `ui/hang.js` and the paintings, the sprites
(the Kid's and Companion's art -- their SIZE in the rest vignette is yours),
gameplay and data. **Lay out through your own classes** (a scene sheet that
sets `position`, `display` or `left` on a shared `.kit-*` selector turns
`tests/scene-css` red).

## TESTING, TRAPS, DELIVERABLES

- **Disk:** everything on D:/UILOOP.
- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: `tests/chrome`, `tests/steam-deck`, `tests/gamepad`,
  `tests/backpack`, `tests/piles-reachable`, `tests/settings-play`,
  `tests/events`, `tests/gameover-keeps`, `tests/scene-css`,
  `tests/css-tokens`, `tests/seams`.
- A small-text probe at 1280 on all seven (round 40's
  `D:/UILOOP/r40/spinel/smalltext.py`): every line a player reads at 12 px+.
- Every control you redraw still works by mouse, keys and pad -- the search
  still filters, the palette still switches, every event and rest choice
  still chooses.
- The painting boards hang at random: rest, event and gameover captures pass
  `--hash pics=1`.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works. Stop ONLY the processes you started, BY PID.
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. **Say in
  your notes what you did NOT do.** LOOK at every capture.

Each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
KID="--seed 7 --companion bones --kid maya"
cd "WT" && timeout 600 python tools/shot.py CODE-hud-late --port PORT --scene map      $KID --wait 3 --script @tools/shot-scripts/hud-late.js --steps "wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-settings --port PORT --scene map      $KID --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-piles    --port PORT --scene combat --encounter foyer-14 $KID --wait 5 --steps "click:#draw-pile|wait:1"
cd "WT" && timeout 600 python tools/shot.py CODE-atlas    --port PORT --scene atlas    $KID --wait 3
cd "WT" && timeout 600 python tools/shot.py CODE-rest     --port PORT --scene rest     $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-event    --port PORT --scene event    $KID --wait 3 --hash pics=1
cd "WT" && timeout 600 python tools/shot.py CODE-gameover --port PORT --scene gameover $KID --wait 3 --hash pics=1
```

(append `--w 1280 --h 800` and `-1280` to the name for the second size).
Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
