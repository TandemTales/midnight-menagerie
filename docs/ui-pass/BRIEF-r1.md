# Midnight Menagerie UI pass — round 1 builder brief

Read `BRIEF-r0.md` in this folder first. Everything in its sections **The style, in
rules**, **Hard rules** and **Your sandbox** still applies, word for word. This
file says what changed and what round 1 asks of you.

## What round 0 decided

Three kits competed on the Shop, the Reward and a Curiosity. Two blind judges
picked the same one — **"staged boards"** — at 7 out of 10 against the samples
(the next two scored 6.3 and 6.2; the game before the pass scored 2.2). It is
merged. It is now the game's language, and you build with it:

- `game/src/ui/kit.css` — read its header first; it lists every primitive
  (`.kit-board`, `.kit-ground`, `.kit-dress`, `.kit-titleblock`, `.kit-ribbon`,
  `.kit-stage`, `.kit-panel[data-medal]`, `.kit-frame`, `.kit-plate`,
  `.kit-heading`, `.kit-btn`, `.kit-medallion`, `.kit-tag`, `.kit-prop--candle`,
  `.kit-cards`). Colours are `--kit-*` tokens in `game/src/ui/tokens.css`.
- `tools/prep_ui_kit.py` cuts the painted pieces out of the four samples into
  `game/assets/ui/kit/`. Add a piece there, re-run it, commit the outputs.
- `RoomScene._shell` in `game/src/scenes/reward.js` is the worked example of a
  whole board, and the Shop, Reward, Curiosity and Safe Room all use it.
- Backgrounds: `tools/prep_backgrounds.py` builds Josh's paintings from
  `animations/backgrounds/<name>.png` into `game/assets/backgrounds/`, and a
  board only requests a painting its `index.json` lists. None exist yet; the
  prompt list is `docs/art/background-prompts.md`.
- **The losing kits are still readable**, and the judges asked for pieces of
  them: `git show ui/r0-a:game/src/ui/kit.css` (painted pieces) and
  `git show ui/r0-b:game/src/ui/kit.css` (vector system), their
  `tools/prep_ui_kit.py`, and their `game/assets/ui/kit/` files.

**Build WITH the kit, and extend it rather than route around it.** A component a
screen needs that the kit lacks goes INTO `kit.css` under a name for what it is
(not for your screen), then your screen uses it. Change a kit primitive and you
have changed every board: photograph one screen outside your round afterwards
and look at it.

## The bar

The judges score against the samples, and **9 is "a viewer could not tell this
was not painted by the same hand as the samples."** Round 0 reached 7. What held
it there, in both judges' words: thin rounded web outlines still standing in for
frames, pill-shaped tags, placeholder grounds that read as tiled wallpaper,
dressing that looks placed rather than painted, and small text that breaks down
at 1280x800.

## Who owns what this round

Two tracks build at the same time from the same commit, and their winners are
merged together afterwards. So:

- **REFINE owns the shared pieces:** the HUD (`hud.css`, `hud.js`), the room shell
  (`RoomScene._shell` in `reward.js`), the tooltip, and every EXISTING primitive in
  `kit.css` and `tokens.css`. REFINE may change any of them.
- **EXPAND does not touch those.** If the Safe Room needs something the shell does
  not give it, do it in `rest.js` / `rest.css`. New components go in a section
  APPENDED to the end of `kit.css`, headed `/* ── <component> ── */`, and new
  tokens appended to the end of the `--kit-*` block. Never edit an existing
  primitive; add a modifier class instead.

## Your track is in your prompt: REFINE or EXPAND

### REFINE — the Shop, the Reward and the Curiosity, from 7 toward 9

Both judges' fixes, merged and ordered by impact. Do all of them:

1. **Reward — the card area.** Replace the big thin rounded-rectangle gold outline
   around the three cards with a filigree double-rule frame: corner flourishes
   and a crest medallion on its top rule, the same frame the Shop's bottom panels
   use.
2. **Shop — the Tricks.** Seat the five cards on a framed shelf or table panel with
   a painted surface under them. They currently hang over one thin gold rule.
3. **Shop and Reward — price and rarity tags.** Rebuild the dark pills under the
   cards as enamel cartouches with a gold rim and bevel, lettered in engraved
   spaced small caps (`BUY`, `UNCOMMON`) — no tiny italic "Buy", no bold
   "Uncommon".
4. **Curiosity — the side walls.** Remove the floating framed thumbnails (two
   mismatched sizes per side, uneven heights). Stage the walls symmetrically:
   a moonlit gothic window, a sconce, cobwebs — set on the wall and floor plane.
   (WICK's moonlit windows, `ui/r0-b`, are the judges' suggestion — painted in
   this kit's richer style, not flat.)
5. **All three — the ground.** Until the paintings arrive, the placeholder must
   stop reading as a repeating wallpaper: real depth, warm light pooling at the
   sconces, cold moonlight falling from the windows, falloff toward the floor.
   Keep the painting slot working.
6. **All three — the title plaque.** The ribbon lettering (ROOM CLEARED /
   CURIOSITY / MR. MOTH'S) is dark gold on tan and hard to read: raise its
   contrast. Give the lavender headline an engraved bevel like `UI/title.png`.
7. **Top HUD, every screen.** The resource chips (Foyer, Courage, Buttons, Clues,
   Luck, Haunt, seed, Tricks) are still thin web capsules. Give the bar a gilded
   rail and set its values on nameplate plates and enamel medallions.
8. **Shop — Keepsakes, Snacks and Mr. Moth.** Raise the description text; turn
   the tiny "Buy" sub-label into legible spaced small caps. Frame Mr. Moth in a
   proper lit portrait medallion and set TRICKS / KEEPSAKES / SNACKS / CLUES as an
   engraved stat strip, not loose inline text.
9. **Shop — card size at 1280x800.** The cards' rules text must be as legible as
   the pre-pass game's was at that size; grow them.
10. **Reward — the keyword tooltip.** Keep it inside the frame, clear of the left
    candle and the screen edge, with the panels' gilded corners.
11. **All three — the footer.** "STANDALONE PREVIEW" runs across the bottom rule and
    collides with the Leave / Back button: set it on its own small plate inside
    the frame.

And the grafts both judges asked for from the other kits:
- **The gold ribbon banner with star glyphs as the section header** ("✦ CHOOSE ONE
  TRICK ✦", "✦ TRICKS ✦") instead of spaced text between thin rules (WICK, `ui/r0-b`).
- **A crest medallion on the top rule of EVERY panel** — including the Shop's
  Tricks shelf — plus filigree corner brackets (MOTH, `ui/r0-a`).
- **Card titles on a dark cartouche nameplate** laid over the bottom of the card
  art, echoing the Companion Select tiles (MOTH).
- **Numbered round enamel medallions** set apart from the Curiosity's choice plates
  (MOTH).

### EXPAND — the Map, the Safe Room and Game Over, into the kit

These three have the new HUD and nothing else — except the Safe Room, which
already inherits the room shell and shows exactly what is missing. Make each one
a staged board at the same finish the judges gave round 0's winner, and push it
further along the list above, which applies here too.

- **The Map** (`game/src/scenes/map.js`, `map.css`): the floor plan is a parchment
  blueprint with icon nodes, a key strip along the bottom and a title block. Make
  the whole screen a board — the plan framed like a document laid on a candlelit
  desk (Josh is painting `map.png` for that desk; build the slot), the key and
  the wing buttons as kit plates and medallions, the boss and region labels on
  nameplates. The nodes and paths must stay exactly as readable and clickable.
- **The Safe Room** (`rest.js` / `rest.css` and the shared shell): it already has
  the plaque, candles and filigree. Missing: the fort is a flat cyan vector
  outline, the four options are plain dark boxes, and the SAFE ROOM ribbon sits
  on top of the second subtitle line. Make the fort a staged, lit, painted-feeling
  scene (Josh is painting `rest.png`: the fort left of centre) and the options
  kit panels with medallions.
- **Game Over** (`gameover.js` / `gameover.css`): dark thin-bordered panels, a
  candle glyph, stat boxes, chips of Tricks, a map strip. Make it a memorial
  board: the headline in the cartouche, the Kid and Companion in portrait frames,
  the stats on an engraved strip, the Tricks as brass-dressed chips, the three
  exits as kit buttons.

## Deliverables

- Your commits on your branch, `endings_guard.py` printing `ENDINGS OK` first.
- The canonical screenshots, taken with exactly these commands and copied into
  `JUDGING/CODE/` under exactly these names:

REFINE (`shop`, `reward`, `event`):
```
cd "WT" && python tools/shot.py CODE-shop   --port PORT --scene shop   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-reward --port PORT --scene reward --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-event  --port PORT --scene event  --seed 7 --companion bones --kid maya --wait 3
```
EXPAND (`map`, `rest`, `gameover`):
```
cd "WT" && python tools/shot.py CODE-map      --port PORT --scene map      --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-rest     --port PORT --scene rest     --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-gameover --port PORT --scene gameover --seed 7 --companion bones --kid maya --wait 3
```
and the same three again with `--w 1280 --h 800` into `<screen>-1280.png`.
  → `JUDGING/CODE/<screen>.png` and `JUDGING/CODE/<screen>-1280.png`.

- Before you finish, photograph `--scene combat --encounter foyer-14` and
  `--scene title` on your port and look at them: the kit is shared, and a change
  that breaks a screen outside your round is a failed build.
- Stop your dev server when you are finished.
