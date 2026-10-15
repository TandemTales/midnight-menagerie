# Round 32's graft — onto PHTHALO's one stage

Round 32 merged PHTHALO (`27d6081f`, +1.83, 2 of 3). All three judges' fixes
and grafts are in `VERDICTS-r32.md`; read it, `BRIEF-r32.md` (ownership,
performance, traps) and the three builds' notes at its end, PHTHALO's above
all: it names `--stage-fl`, `_syncStage()`, the crowded-fan TUNE values and
what it did NOT do.

Losers' branches: `ui/r32-fight-a` (CERULEAN: the long-titled card given a
wider slot so PUT YOURSELF BACK TOGETHER sits on one line; the Butler stepping
past the open frame's lower edge; the largest status coins with gold number
badges) and `ui/r32-fight-c` (RAWUMBER: the soft oval light pool and stronger
contact shadow under the boss's feet -- take the pool, NOT its hard pale
spotlight cone). PORT ideas onto dev's tip; do not merge either.

Ownership is BRIEF-r32's: `ui/enemy.js`, `ui/hand.js`/`hand.css`,
`scenes/combat.css`/`combat.js`, `kit.css`/`tokens.css` by appending. NOT
`fx/*`, `core/renderer.js`, the card's face (`ui/card.*`), gameplay or data.

## 0. The frame budget

Measured after the merge, `tools/gpuprof.py --wait 40 --settle 6`, three
interleaved runs, `12d929af` (BASE) vs `27d6081f` (HEAD), T_full median:

| fight | BASE | HEAD | delta |
|---|---|---|---|
| foyer-boss | 14.55 | 14.21 | -0.34 |
| foyer-14 | 14.24 | 14.32 | +0.08 (noise) |

The round is DOM/CSS only and costs nothing. Keep it that way: a light pool
or rug drawn in CSS over the WebGL stage must not add a full-screen
blend layer.

## The graft, in order

1. **One line for every name in the crowded fan -- all three judges.** At
   1280 PUT YOURSELF BACK TOGETHER still wraps. Give a long-titled card a
   wider strip (CERULEAN's way) and let the overlap eat more of the three
   Bites' ART to pay for it -- never their title bands or cost coins. Its name
   stays at the row's one name size (tighten tracking a touch if needed); it
   must NOT become the smallest title in the hand.
2. **The party an equal on the stage -- all three judges.** Scale the Kid and
   Bones up about 15-20% on the SAME feet line (`--stage-fl`), the Kid at least
   about 2/3 of the Butler's drawn height, and move them in toward centre so
   the empty left floor closes. Give them the warm rim light and the dark,
   tight contact shadow the enemies have. On an ordinary fight keep breathing
   room between the Kid's crutch and the first enemy.
3. **The boss planted -- all three judges.** A darker, tighter contact
   ellipse under his shoes and RAWUMBER's soft oval floor pool (a cool one
   under him is welcome; no hard cone). Lower THE BUTLER's nameplate and its
   crescent medallion about 20px so they never cover his shoes. Let his feet
   step past the frame's lower edge (CERULEAN), and drop the frame and its
   shield/12 crown chip about 20px so the medallion clears the top rail.
   Check two other wings' bosses as well as the Butler.
4. **Status chips a size up again -- all three judges.** About 20-25% bigger
   on the Kid and the enemies (CERULEAN's size): count numerals at least 12px
   at 1280, gold rings that read as medallions. Tuck the boss's chip
   cartouche close to his HP bar so it does not drift right.
5. **The ordinary fight's enemy row.** A few more px between the enemies'
   HP bars and the top of the resting hand (the Door Greeter's 29/29 nearly
   touches the first card); pull nameplates and HP bars up under each enemy
   so a hovered card cannot cover the numbers; seat the Door Greeter, Dust
   Bunny and Calling Bell into their shadows (no gap under the door) with
   darker shadow cores.
6. **The hovered card lifts clear.** In the crowded fan a hovered or focused
   card rises fully clear of its neighbours with a drop shadow and a gold edge
   glow. Prove it with a hover capture of the crowded fan at 1280 (a Bite).
7. **If there is room:** a rug edge on the floor between the party and the
   enemies so the stage reads as one staged space (PHTHALO did not do it).

## Proof

- Before/after captures of BRIEF-r32's three screens at both sizes (its
  commands, into C:/UILOOP/r32/graft/), LOOKED at beside UI/mainMenu.png;
  plus two other wings' bosses at 1280 and the hover capture of item 6.
- Performance: `tools/gpuprof.py --wait 40 --settle 6`, interleaved against
  `27d6081f`, three runs, foyer-boss and foyer-14: no slower.
- Tests (via `tools/on_port.py PORT`): combat-scene/seam, hand-cards,
  card-face, chrome, steam-deck, gamepad, combat, enemies (run.py and
  audit.py), sprites/clips. `python tools/endings_guard.py --base <your base>`
  prints ENDINGS OK. Commit as you go; stop only your own processes, by PID.
- Say in your notes what you did NOT do.
