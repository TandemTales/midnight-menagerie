# Midnight Menagerie UI pass — round 2 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided** — the kit it describes is still the
language, now extended by round 1. Then this file.

## Where the game is

| screen | who built it | judged (mean, 0–10, in its round) |
|---|---|---|
| Shop, Reward, Curiosity | OPAL, round 1 REFINE: a rendered room behind every board, enamel and brass materials | 7.0 / 7.0 / 6.5 |
| Map | HUSK, round 1 EXPAND: the survey in the ornate gilt rail, the wing title in the cartouche | 6.5 |
| Safe Room, Game Over | FERN, round 1 EXPAND: a framed painted fort; a memorial board | 6.8 / 7.0 |
| Combat, Lobby, Clubhouse, Atlas | not converted yet | — |
| Title, Companion Select, Kid Select | ARE Josh's paintings | — |

What the kit gained in round 1 (read `game/src/ui/kit.css` and its header):
rendered room grounds (`tools/prep_ui_materials.py`, `.kit-ground__warm/__moon`),
`.kit-enamel` tags, `.kit-window`, `.kit-sconce`, `.kit-web`,
`.kit-heading--ribbon/--clasp`, SVG engrave filters in `game/index.html`,
`.kit-frame--over`, `.kit-stats`, `.kit-railframe(--ornate)`, `.kit-light`.
Boards that are not RoomScenes hang their painting with `ui/kitboard.js`
(Safe Room, Game Over) or `ui/backdrop.js` (Map).

Losing branches you may read for their ideas (`git show <branch>:<path>`):
`ui/r0-a` (MOTH), `ui/r0-b` (WICK), `ui/r1-refine-a` (IRIS), `ui/r1-refine-c`
(RUNE), `ui/r1-expand-b` (HUSK's Safe Room and Game Over), `ui/r1-expand-c` (VANE).

## Who owns what this round

Three tracks build at once from the same commit and all three winners are merged.

- **POLISH owns the shared pieces:** every EXISTING primitive in `kit.css` and
  `tokens.css`, `hud.css`/`hud.js`, the tooltip, the room shell (`reward.js`),
  `ui/kitboard.js` and `ui/backdrop.js`, and the six converted screens' files.
- **COMBAT owns** `scenes/combat.css`, `scenes/combat.js`, `ui/card.css`,
  `ui/card.js`, `ui/hand.css`, `ui/hand.js`, `ui/intent.js` and every intent style,
  and the presentation in `ui/enemy.js`. Not the HUD bar: that is POLISH's.
- **EXPAND-2 owns** `scenes/lobby.*`, `scenes/clubhouse.*`, `scenes/atlas.*`,
  `ui/modal.css`, `ui/settings.css`, `ui/deckview.css`.
- **COMBAT and EXPAND-2 never edit an existing kit primitive.** New components go
  in a section APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`;
  new tokens are appended to the end of the `--kit-*` block. A modifier class,
  never an edit. Use `kitboard.js`/`backdrop.js` as they are.

## The bar, and what is holding it

9 is "a viewer could not tell this was not painted by the same hand as the
samples." Every judge in round 1 said the same three things stand between the
converted screens and a 9: grounds that are renders rather than paintings,
flat dark gradient panels and pills that still read as web UI, and small text or
labels that drift and crowd at 1280x800. Josh is painting the backgrounds
(`docs/art/background-prompts.md`); none have arrived. Everything else is yours.

## POLISH — the six converted screens, every judge's fix

Shop, Reward, Curiosity:
1. **Curiosity choice rows.** The teal-black stadium pills become aubergine
   rectangular plates with a double gold rule and gold corner fleurons; a chosen or
   hovered row glows warm from inside, never with an outline.
2. **Shop lower panels.** Keepsakes, Mr. Moth and Snacks stop being flat dark
   boxes: a damask or painted interior, an inner double rule, corner filigree.
3. **Shop prices.** Split each long "104 BUTTONS · BUY" pill into a compact
   engraved price cartouche with a button-coin glyph (no word BUTTONS) and a
   separate round purple enamel BUY medallion with a gold rim.
4. **Mr. Moth** in a filigree portrait medallion with a nameplate at the LEFT END
   of the Tricks shelf; **Forgetting** as a sixth crescent-medallion slot on the
   shelf with its own price. The centre panel is left with one focal point.
5. **Shop TRICKS header.** The ribbon is cut in half by its medallion: centre one
   ribbon under the medallion and set "on the table" below it.
6. **Card bodies (Shop and Reward).** Rules-text panels get a parchment or damask
   texture and an inner double rule; card names are larger and lettered in the
   lavender engraved display face.
7. **Reward stage.** A velvet cloth or painted table and a pool of candlelight under
   the three cards; the cards centred, the keyword tooltip anchored to the hovered
   card as a parchment/enamel plaque with filigree corners and a nameplate header;
   the +Buttons / +Luck plates and CHOOSE ONE TRICK ribbon on the frame's top rail
   under a star medallion.
8. **Curiosity reading panel.** Tuck the drop cap into an ornamented initial box;
   give the panel a subtle vellum texture. Cold moonlight shafts fall from both
   windows across wall and floor against the warm sconces.

Map:
9. **Entry-room names** each on a small dark gold-rimmed cartouche anchored to its
   node — at 1280 they currently drift between nodes and mis-assign.
10. **The key** as one full-width bar that never drops entries at 1280: round glyph
    medallions, candle finials at both ends, THE WHOLE HOUSE a labelled cartouche
    that keeps its caption. The title-block strip's labels darker and larger.
11. **The parchment** lit and aged: candle-warm corners falling off to cool edges,
    foxing and fold texture, inked slightly irregular paths, the red and blue zone
    rectangles redrawn as inked washes with deckled edges, a curled corner.
12. **The boss cartouche** tall enough for its caps and moved into clear parchment.

Safe Room:
13. **Option titles** in engraved spaced small caps that outrank their values; the
    values on gold-rimmed cartouche plates or ribbon tabs, not capsules; numbered
    key badges 1–4 on each card; emblem medallions on each card's top rule.
14. **The fort** lit: a warm lantern pool inside spilling onto the rug, a cold
    moonbeam from the window across it. At 1280 the subtitle stops crowding the
    ribbon and the location line is lifted to a readable lavender-grey.

Game Over:
15. **The stat strip** on one baseline with every label the same line count.
16. **The ledger** gets a focal number: 8 ROOMS DEEP in lavender display type with
    air around it, clear of its medallion at 1280; SEED and REACHED as matching
    corner cartouches flanking the title.
17. **All three exits** carry round purple enamel medallion ends.
18. **The centre:** the Kid and Companion portraits side by side under the title
    with the smoking candle between them on a shared shelf; Worked Hardest on a
    gilt plinth or frame as the secondary focus.

Everywhere:
19. **HUD:** the chips become small gold cartouche nameplates on an engraved rail,
    the empty item slots real filigree sockets, labels legible.
20. **The standalone-preview note** becomes a faint engraved caption, not a plate.
21. **Unify the painting slot:** `ui/kitboard.js#paintBackdrop` and
    `ui/backdrop.js#hangBackdrop` do one job; make it one module and move every
    caller to it.

## COMBAT — the screen the player lives on

Capture `--scene combat --encounter foyer-14` and look at it beside the Shop: the
creatures and the room are painted, and everything the player touches is the old
navy web chrome. Bring all of it into the kit:

- **The hand.** Cards in the same brass dressing the kit gives cards on a board
  (`.kit-cards`, cost on an enamel disc, name on a dark cartouche over the art),
  with every card-feel behaviour intact: hover lift, fan, drag, aim, play arcs.
  Rules text at least as large as today at 1280x800.
- **The Kid's panel.** Portrait in a kit frame with a nameplate, Courage as the
  brass tube, the Nerve orb as a gold-rimmed enamel medallion, counters (Loose
  Bones and the like) on enamel plates.
- **Draw, discard, and the other piles** as enamel medallions with brass counts.
- **END TURN** as the kit's primary nameplate with its ornate medallion.
- **Enemy plates.** Name on a nameplate, Courage as a brass tube with the ghost
  drain intact, Guard and statuses in enamel sockets; intents as brass-rimmed
  enamel medallions that stay instantly readable.
- **House Rules, turn banners, the boss banner** in the cartouche and lavender
  engraved display type.
- **The room** stays the WebGL atmosphere until Josh's `combat-<wing>.png`
  paintings arrive. Do not rewrite `fx/atmosphere.js`. You may frame the stage
  (a vignette, candle pools, the board's rule and dressing at the edges) as long
  as nothing covers a creature, an intent or a card.

Tests drive this screen hard: `tests/combat-scene`, `card-face`, `cards-feel`,
`piles-reachable`, `gamepad`, `settings-play`, `playthrough3`, `coop`,
`kid-clips`, `enemy-stills`, `sprites`, `steam-deck`, `chrome`. Before changing a
selector, grep `tests/`, and run the tests you touched against YOUR server
(**Testing your branch**, below). Keep 60 fps.

## EXPAND-2 — the Lobby, the Clubhouse, the Atlas

- **The Treehouse lobby** (`#scene=lobby`) is a plain dark modal: a title, a
  password field and three buttons. Make it a staged board — the field an engraved
  plate, the buttons kit buttons, a painting slot for `lobby.png` (a treehouse at
  night).
- **The Clubhouse** (`#scene=clubhouse`, "Neighbourhood Headquarters") is a warm kid
  HQ: cork board, polaroids, red string, wooden walls. KEEP that concept — Josh's
  `clubhouse.png` prompt is "cosy, same painted style, warmer than the mansion" —
  and bring its chrome into the kit: the tabs, the Expedition Log, the Haunt Level
  selector, PLAN THE EXPEDITION and ← TITLE as kit panels, plates, medallions and
  buttons; polaroids and notes painted-feeling, not flat CSS.
- **The Atlas** (`#scene=atlas`): the whole-house floor plan and a side panel. Frame
  the plan like the Map does (`.kit-railframe`), the side panel a kit panel with a
  nameplate, the held Companion in a portrait frame, Back a kit medallion.

## Testing your branch

Every test under `tests/` hard-codes `:8777`, and `:8777` is the MAIN checkout's
server. A test run from `WT` as its docstring says drives `dev`, not your branch,
and passes whatever you changed. With your own server up, run it through the
wrapper, which swaps the port in memory and changes nothing on disk:
```
cd "WT" && python tools/on_port.py PORT tests/combat-scene/seam.py
```
A test run any other way has tested nothing of yours.

## Deliverables

Endings guard `ENDINGS OK`, commits on your branch, and the canonical screenshots
into `JUDGING/CODE/` under exactly these names (and `--w 1280 --h 800` into
`<name>-1280.png` for each):

POLISH: `shop`, `reward`, `event`, `map`, `rest`, `gameover`
```
cd "WT" && python tools/shot.py CODE-<screen> --port PORT --scene <screen> --seed 7 --companion bones --kid maya --wait 3
```
COMBAT: `combat`, `combat-boss`
```
cd "WT" && python tools/shot.py CODE-combat      --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
```
EXPAND-2: `lobby`, `clubhouse`, `atlas`
```
cd "WT" && python tools/shot.py CODE-<screen> --port PORT --scene <screen> --seed 7 --companion bones --kid maya --wait 3
```

Before you finish, photograph at least two screens OUTSIDE your track on your
port and look at them. Stop your dev server when you are done.
