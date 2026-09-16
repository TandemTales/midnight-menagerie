# Midnight Menagerie UI pass — round 6 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**: the kit it describes is still the
language, extended by rounds 1 to 5. Nothing else in those two files is an
instruction for this round. Then read this file, which wins wherever they
disagree.

## Two tracks this round, not four

Rounds 4 and 5 ran POLISH, COMBAT, DIALOGS and KIDS' PLACES together. **Round 6
runs POLISH and COMBAT only** — the nine screens a player is inside for almost
the whole run. DIALOGS and KIDS' PLACES keep round 5's winners (BIRCH, GORSE and
ELDER) untouched and are next round's work.

That changes one thing for you: **the files DIALOGS and KIDS' PLACES own are
nobody's this round.** Do not edit `ui/modal.css`, `ui/settings.css`,
`ui/deckview.css`, `scenes/tutorial.*`, `scenes/lobby.*`, `scenes/clubhouse.*` or
`scenes/atlas.*`, and do not edit the kit sections named for those tracks below.
If a change of yours would land on one of their screens, photograph that screen
and make sure it still reads.

## Where the game is

| screen | who built it | judged in round 5 (mean overall, 0–10) |
|---|---|---|
| Shop, Reward, Curiosity, Map, Safe Room, Game Over | THISTLE, round 5 POLISH | 7.0 / 7.25 / 7.0 / 7.25 / 7.25 / 7.0 |
| Combat: a Scuffle, a boss, a boss with a full hand | VESPER, round 5 COMBAT | 7.17 / 7.17 / 7.0 |
| The opening's story, Settings, the pile viewer | BIRCH, round 5 DIALOGS | 7.25 / 7.0 / 7.0 |
| Lobby, Atlas | GORSE, round 5 KIDS' PLACES | 6.83 / 6.83 |
| Clubhouse | ELDER, round 5 KIDS' PLACES | 6.83 |
| The coach, the handoff veil, toasts | web chrome | — |
| Title, Companion Select, Kid Select, the opening's Kid picker | ARE Josh's paintings | — |

## What the kit gained in round 5

Read `game/src/ui/kit.css`'s sections, in file order.

- **THISTLE (POLISH)** appended a "FOCAL POINTS" section and changed the HUD:
  - `.kit-mirror` (+`__glass`), the Kid board's tall mirror over a stadium glass
    that clips what it holds; `--mirror-w` sizes it.
  - `.kit-rosette`, a cast brass boss for a rail's end.
  - `.kit-spoil` (+`__medal` `__value` `__label`), a gain on a lit dark nameplate
    with an enamel medallion holding an `ui/icons.js` glyph.
  - `tokens.css` gained `--kit-ink-oxblood`, `--kit-ink-green`, `--kit-ink-violet`
    (the Curiosity register's inks).
  - `hud.css`: chips are `cartouche-lit.webp` plates with ogee ends and a
    `--chip-end` padding; the group separator is a cast brass boss; Courage is a
    cartouche-dark plate with a heart medallion and a sunk crimson enamel gauge;
    Snack slots are `socket-filigree.webp` settings; Keepsakes sit in
    `socket-keep.webp` octagonal settings; `.kit-btn kbd` is a 9-sliced
    `keycap.webp`.
- **VESPER (COMBAT)** touched no shared component at all. Its work is in
  `scenes/combat.css`, `ui/card.js`, `ui/hand.js` and `ui/enemy.js`, plus eleven
  uniquely named assets built by `tools/prep_combat_table.py`: painted DRAW and
  DISCARD decks in a gilded tray, DISCARD on a walnut shelf on an iron bracket, a
  condition cartouche tray, and the boss nameplate.

## Branches you may read for their ideas

Read them with `git show <branch>:<path>`.

- **POLISH:**
  - `ui/r5-polish-b` (SABLE): the Curiosity as an aged parchment ledger page with
    folded creases and ruled entry lines under a moon medallion; the large
    candle-lit Mr. Moth portrait with glowing eyes and a ruff in a tall arched
    niche; the gold-rimmed medallion rings for the shop counters.
  - `ui/r5-polish-a` (RAVEN): Game Over's large centred Worked Hardest card
    flanked by symmetric HOW FAR and quote panels — the strongest centrepiece
    hierarchy any candidate has had; medallion counters threaded on a gold rail
    beneath a framed quote plaque.
  - `ui/r4-polish-a` (QUINCE): the moonlit gothic stained-glass windows, lit by
    cold moonlight, which BOTH round-5 judges asked for on the Reward in place of
    the floating sconces.
- **COMBAT:**
  - `ui/r5-combat-c` (YEW): dark, deep mirror glass with diagonal moonlight
    streaks behind the boss; the enemy intent ribbon hung as one attached unit
    beneath its quatrefoil medallion, larger; the flatter nine-card fan that kept
    titles and rules text most legible on the crowded board.
  - `ui/r5-combat-b` (WALNUT): the brass hourglass painted with visible falling
    sand and a lit bulb; full-size single card backs for the piles with a gold rim
    and moon-sun sigil; the painted wood backing plaque behind Nerve and Draw.
  - `ui/r4-combat-b` (ZEPHYR): the dense black-iron filigree cradle around the
    Nerve medallion, which three judges called the most sample-like ornament on
    any board; the End Turn hourglass set in a round purple enamel disc with a
    gold rim; the fleur-de-lis / acanthus crest over THE BUTLER's nameplate, which
    joins mirror to plate without covering a letter; card title plates that fit
    long names on two clean lines.

## Who owns what this round

Two tracks build at once from the same commit, and both winners are merged.

- **POLISH owns:**
  - every `kit.css` component above "READINGS IN METAL", and its own "shelf rail",
    "stat plate" and "FOCAL POINTS" sections;
  - `tokens.css`, `hud.css`/`hud.js`, the tooltip, the room shell (`reward.js`),
    `ui/backdrop.js`, `ui/kitboard.js` and `ui/mapnode.js`;
  - the six boards' scene files.
  - **The top HUD strip is POLISH's, and COMBAT's judges are the ones asking for
    it.** See POLISH fix 8.
- **COMBAT owns:**
  - `scenes/combat.css` and `scenes/combat.js`;
  - `ui/card.css`, `ui/card.js`, `ui/hand.css`, `ui/hand.js` and `ui/intent.js`;
  - the presentation in `ui/enemy.js`;
  - kit.css's "READINGS IN METAL" and "A CONDITION, ROUND" sections.
  - **COMBAT does not touch `hud.css`.** Every judge this round called the top
    strip a web toolbar; it is POLISH's to fix, and two tracks editing it would
    collide at the merge.
- **Changes to another track's component:** new components go in a section
  APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`. New tokens are
  appended to the end of the `--kit-*` block. Change another track's component with
  a modifier class, never by editing it.
- **Lay out through your own classes.** A scene sheet that sets `position`,
  `display`, `left` and the like on a selector naming a shared `.kit-*` class turns
  `tests/scene-css` red, even when the rule is scoped.
- **Never reuse a name.** Before you add a class or an asset, grep `game/src` and
  `game/assets` for it. Round 4 had three builders paint three different
  `lamp.webp` and define `.kit-bulbs--candle` three ways.
- **Nobody edits** `ui/coach.*`, `ui/handoff.*` or the achievement toast.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." **No candidate in six rounds has scored above 8 on any screen, and the
reason every judge gives is the same: the ground behind the screen is a render,
not a painting.** Round 5's judges scored the background dimension 5 or 6 on every
POLISH and COMBAT candidate, winner or not, and 3 or 4 on the dialogs. Josh is
painting them (`docs/art/background-prompts.md`); `animations/backgrounds/` does
not exist yet.

So do not spend this round trying to paint rooms in CSS. **Keep every painting
slot working and unobstructed**, and spend your effort on what a judge can still
move: focal points, flat fills that should be objects, controls that read as web
UI, ornament that repeats like a border image, and anything that crowds or clips
at 1280x800.

## POLISH — the six boards

Every item is a round-5 judge's words about THISTLE's screens, or a graft they
asked for. THISTLE won every screen but the Shop and the Curiosity.

Shop:
1. **Mr. Moth has to anchor the counter.** His portrait is shrunk into a narrow
   niche, so the shopkeeper stops being a focal point and the row of cards loses
   its host — and the MR. MOTH plate is laid across the lower third of the arch,
   covering the figure. Take SABLE's: a large candle-lit portrait with glowing
   eyes and a ruff in a tall arched niche, with a candle and skull at its foot,
   and the nameplate clear of his face.
2. **The centre counter's tallies** become gold-rimmed medallion rings for
   TRICKS / KEEPSAKES / SNACKS / CLUES, threaded on a gold rail beneath a framed
   quote plaque (SABLE's rings, RAVEN's rail).

Reward:
3. **The room behind the cards is an empty dark wainscot with floating sconces,
   and the cards float on a void.** Both judges asked for the same thing: QUINCE's
   moonlit gothic stained-glass windows either side of the card stage, cold light
   against the warm candles, for the contrast the samples use.

Curiosity:
4. **The choice rows are flat purple rectangles with thin gold outlines** and read
   as web buttons inside an ornate frame. Take SABLE's, which both judges called
   the most painted, in-world panel across all candidates: an aged parchment
   ledger page with folded creases and ruled entry lines under a moon medallion,
   for a panel called "The House Register". **Each choice keeps a visible
   affordance** — a judge asked for that explicitly; a ledger line nobody can tell
   is clickable is a new defect, not a fix.

Map:
5. **The blueprint fills the frame edge to edge with no aubergine or gold
   surround**, and the dense icon field has no candlelit focal point, so the board
   departs from the samples' dark framed boards.
6. **The Receiving Chamber boss token is a flat black spiky silhouette with
   cartoon eyes** — the one element on the blueprint that is neither ink nor gilt.
   Draw it as the plan's own ink and gilt.

Safe Room:
7. **The four option plates on the right are identical flat purple slabs**, told
   apart only by the medallion on the top edge. Give each a lit, textured face so
   REST, SHARPEN, FORGE and SIT read as four painted objects.

Game Over:
8. **The centre is the run's emotional centrepiece and it is undersized.** The
   Worked Hardest card is small and sits low between two taller side panels. Take
   RAVEN's: the large centred card flanked by symmetric HOW FAR and quote panels,
   with the WORKED HARDEST plaque as a pedestal nameplate under it — and no
   overlap at 1280.
9. **The seed field is a flat gold rectangle** and **Final Tricks is a crowded tag
   cloud of gold-studded pills.** Make the seed a plaque and the Tricks a plain
   engraved list with gold cost coins.

The HUD (every board and every fight):
10. **The top strip still reads as a web toolbar**, and this round all three
    COMBAT judges said so as well as the POLISH ones: "a row of small, samey pill
    chips (the red 74/74 lozenge, the Clues/Luck/Tricks tags)". THISTLE gave them
    ogee-ended cartouche plates and a sunk enamel Courage gauge; they still read
    as a row. Make the strip one carved nameplate rail — a thing with ends, a
    surface and a shadow — that the readouts are set INTO, rather than a line of
    separate plates with a boss between them. It must stay legible at 1280x800,
    and the boss board's crown finial and Guard shield must have room under it
    (COMBAT's judge named that collision).

## COMBAT — the fight, and the fight when it is full

All three judges' words about VESPER's boards. VESPER had no hard defects; these
are the things that keep it at 7.

1. **The boss mirror's glass is the centrepiece and it is flat.** "A pale haze
   with the room showing through", "a flat grey-blue haze with no reflection or
   tarnish, so the frame's centerpiece reads as a CSS gradient panel behind a
   sprite". Take YEW's: dark, deep mirror glass with diagonal moonlight streaks,
   which makes the Butler pop. Keep VESPER's clean nameplate, and keep any gem or
   crest clear of THE BUTLER's letters — YEW lost the boss screens to a moon
   medallion covering the U.
2. **The crowded hand breaks its own typography.** "Put Yourself Back Together" is
   crushed onto three tiny lines inside a single-line banner; "Shake, Boy!" shrinks
   below its neighbours' size; bodies break as "Shed 1 / Bone. Draw / 1 Trick."
   Take ZEPHYR's: title plates that fit long names on two clean lines, and
   one-line bodies for short rules, with every name, type line, cost and rules
   text legible at 1280x800 on a hand of nine or ten.
3. **The enemy's intent reads as two unrelated pieces.** The HOUSE RULE ribbon is
   a thin strip sitting on the Door Greeter's crown, cut off from its quatrefoil
   medallion 70px above. Take YEW's: hang the ribbon as one attached unit beneath
   its medallion, larger, and lift it clear of the creature's art so it reads at a
   glance.
4. **END TURN's hourglass is a flat gold glyph in a dark disc.** Take WALNUT's
   painted brass hourglass with visible falling sand and a lit bulb, set in
   ZEPHYR's round purple enamel disc with a gold rim, which is what the samples'
   round enamel buttons look like.
5. **Nerve's setting.** Take ZEPHYR's dense black-iron filigree cradle around the
   medallion — three judges named it the most sample-like ornament on any board —
   brightened toward antique gold, and keep VESPER's numeral legible at 1280.
6. **The piles.** Take WALNUT's full-size single card backs for DRAW and DISCARD,
   with a crisp gold rim and the moon-sun sigil, so they read clearly at 1280
   rather than as small badges.
7. **The conditions.** VESPER's scroll-ended gilt cartouche tray under the 74/74
   bar is the best any candidate has made; keep it, and make sure it still holds
   when both sides are stacked on the crowded board.

### The creatures move now, and so do the Companion and the Kid

This is new since round 5 and it changes what your screenshots look like.

- **19 enemies animate** from Josh's sheets (`game/assets/sprites/enemy-clips/`,
  22 creatures built). `EnemyView` ticks a moving painting through the same
  `.rg-stillimg`, now inside `.rg-stillfit > .rg-stillclip`. The wind-up plays
  `attack` (or `cast`), an unblocked hit plays `hurt`, a death plays `defeat`, and
  our procedural breath, sway and twitch are OFF while a clip idles.
- **`paintRect()` gives a painting's box and feet**, and is what the gates measure
  by. If you move the creature's stage, that is the method to check against.
- **Every clip now holds 22 frames of its sheet's 81** and publishes its own
  fractional `fps` so the beat lasts what it always did (`prep_sprites.py`,
  `TARGET_FRAMES`). A `defeat` is cut at the frame the creature is most collapsed
  and holds there, because every sheet delivered falls and then stands back up.
- **So two captures of the same board show DIFFERENT IDLE FRAMES.** Your
  screenshot and the baseline beside it will not have the creature in the same
  pose, and neither will your three candidates'. That is expected. Do not chase
  it, do not freeze it, and do not read a pose difference as a change you made.
  Judge and photograph everything AROUND the creature.
- **Nothing in the sprite pipeline is yours to change.** `ui/enemy.js`'s
  presentation is COMBAT's, but `ui/sprite.js`, `tools/prep_sprites.py` and
  everything under `game/assets/sprites/` are not. A clip that stops playing or a
  creature that changes size turns `tests/enemy-clips` and `tests/enemy-stills`
  red.

## Testing your branch

Every test under `tests/` hard-codes `:8777`, which is the MAIN checkout's server.
A test run from `WT` as its docstring says drives `dev`, not your branch, and
passes whatever you changed. With your own server up, run it through the wrapper,
which swaps the port in memory and changes nothing on disk:
```
cd "WT" && python tools/on_port.py PORT tests/combat-scene/seam.py
```
A test run any other way has tested nothing of yours. `python tests/scene-css/check.py`
and `python tests/css-tokens/check.py` are static: run them before you finish.

COMBAT builders: `python tools/on_port.py PORT tests/enemy-clips/check.py` before
you finish, because the creatures' stage is in the file you own.

## Deliverables

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

POLISH: `shop`, `reward`, `event`, `map`, `rest`, `gameover`
```
cd "WT" && python tools/shot.py CODE-<screen> --port PORT --scene <screen> --seed 7 --companion bones --kid maya --wait 3
```
COMBAT: `combat`, `combat-boss`, `combat-crowd`
```
cd "WT" && python tools/shot.py CODE-combat       --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss  --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
```
`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, photograph at least two screens OUTSIDE your track on your
port and look at them — for this round make one of them a DIALOGS or KIDS' PLACES
screen (`settings`, `piles`, `lobby`, `clubhouse`, `atlas`), because nobody is
building those and your kit or HUD change lands on them unwatched. Stop your dev
server when you are done.
