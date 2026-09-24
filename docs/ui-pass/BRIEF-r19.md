# Round 19 — the boards and the controls, after eleven rounds away

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r19.md`.**

## WHY THIS ROUND, AND WHERE ITS LIST CAME FROM

Rounds 8 to 18 all went to the WebGL room behind the fight, and their gains
had fallen to +2.00, +1.25, +0.72. The six boards, the dialogs and the Kids'
places were last judged in rounds 6-7 — and the ground behind them was rebuilt
on 2026-09-16 since, so their old fix lists were stale.

So on 2026-09-23 those screens were **surveyed**: photographed as they stood
and scored by two blind judges who never saw a candidate
(`SURVEY-2026-09-23.md` — read it, all of it). Every screen scored 5-7, both
judges said the chrome itself is close to the samples everywhere, and **both
named the same shared defects independently**. A defect shared by several
screens is one fix for all of them. That is this round.

## THE FIX LIST, from both survey judges, shared defects first

### 1. THE RUN HUD WRAPS TO TWO ROWS AT 1280x800 — both judges

On the fights, Haunt, the seed, Tricks and the gear drop to a second row and
double the frame's top border; on the boards the strip is full to the edge.
**1280x800 is the Steam Deck**, the platform this game ships on first, so this
is a layout bug, not a taste. Fit the strip to ONE row at 1280 on every
in-run screen: shorten "No Keepsakes yet", collapse the three empty keepsake
circles into one plate, tighten the Clue and Luck plates. It must stay legible
(nothing under ~11 px) and keep the boss board's crown finial and Guard shield
clear. Check it at 1280x800 AND 1600x900 on every screen that carries it.

### 2. THE BOARD WALL — both judges, on four or five screens

The room behind reward, event, rest and gameover carries **a row of gold
picture frames around empty black rectangles** — "holes in the wall, not
paintings" — and on reward and event **the gothic windows are drawn OVER
them: a window cannot overlap a picture frame.** It is one shared room (the
CSS room shell, `scenes/reward.js` `RoomScene._shell`, and the kit pieces it
uses), so one fix buys every board. Either fill the frames with dim painted
subjects in shadow, or remove them where a window stands; never both a window
and a frame in one bay. Gameover's grey-framed empty wall panel and atlas's
grey stone panel peeking out at its left edge are the same class.

### 3. CONTROLS THAT ARE STILL WEB FORM ELEMENTS — both judges, six screens

- **settings**: the toggles are "a dark disc beside a thin bar with OFF in
  it" — make them physical: a brass lever in a slot, or a two-position
  engraved plate (ON | OFF) with a lit side; the ON state never gold type on a
  gold fill. Sliders get a recessed groove, a gold fill and a proper knob. The
  seed fields become engraved tags or parchment slips. The SEED header is a
  dark plate where every other header is a ribbon.
- **piles** (the pile viewer, `ui/deckview.js`): five rounded selects with
  chevron circles plus a search field — recast as gilt tabs or engraved dial
  plates with the value on a cartouche, and the search as an inked slip.
- **shop**: the keepsake and snack icons are icon-font glyphs in empty rings,
  and the three snacks share ONE glyph. A small painted object for each: a
  chalk stub, a ticket, a heap of buttons, a jawbreaker, a paper cone, a
  toffee brick. The BUY discs become proper purple enamel buttons.
- **rest**: the four option medallions are line icons in rings and the side
  pills are flat lozenges — painted objects (a pillow, a whetstone, a candle,
  a teacup) and cartouches with end caps.
- **event**: the tiny black chevron discs at the end of each choice row read
  as web buttons — give them the I/II/III numerals' gilt-rim medallion.
- **clubhouse**: the Haunt 1-5 steppers are dim black discs like disabled web
  steppers — candle stubs or skull tokens, unlit and lit.

**Build ONE vocabulary for all of them** — one brass, one enamel, one
engraved plate — so the six screens read as one house's hardware, and put it
in the kit where the next screen can use it.

### 4. THE MAP — both judges, the highest headroom on the survey (+2)

"The routes are loose, same-weight brush strokes that stop short of the node
icons and cross one another mid-field, so you cannot trace which room leads to
which." Draw every route as ONE continuous uncrossed ink line from rim to rim
of its two nodes, with reachable next steps bold and the rest faint; seat the
nodes on small parchment roundels; fade the floor plan behind the routes to
half contrast; remove the unexplained watercolour blobs and the red ball at
the top, or tie them to the key. The margin notes and the title block are
ghost type — ink them.

### 5. SMALLER, both judges

- **event**: the lead-in words after the drop cap ("LECTERN. A BRASS") are in
  pale embossed small caps "almost invisible on the parchment" — solid ink.
  The fold creases run as hard bright lines through the choice rows.
- **the card**: "a grey hump and side diamonds peek out behind every card's
  top edge" in the pile viewer's tray and on the reward rack — a second card
  back mis-registered. Find the element and fix it; a rendering bug.
- **the dialogs** (settings, piles): the screen behind shows through at the
  edges — a solid scrim.
- **gameover**: the right ledger crams ~25 rows of 9 px type at 1280 and runs
  into its frame; two keepsakes show a placeholder star; the Worked Hardest
  card shrinks to unreadable at 1280. Nothing under ~12 px at 1280.
- **combat-crowd**: past six cards the hand overlaps so tightly the title
  ribbons are covered — fan wider into the space between the piles, and push
  the overlap into the art window, not the name.

## NOT THIS ROUND

- **The WebGL room behind the fight.** Both judges saw pixel stair-stepping
  in it and a Kid with no floor under her. Neither is yours this round: the
  stair-stepping needs a discriminator first (the stage calibrates its render
  scale from measured frame times, and the survey's captures were taken while
  other builders held the GPU), and the floor belongs to a rooms round.
- **Painted assets.** The clubhouse's pet Polaroids, Mr. Moth's portrait and
  the gameover Kid are soft painted assets in a different hand from the inked
  Kids and cards. That is Josh's call, not a builder's; do not repaint them.

## WHO OWNS WHAT THIS ROUND

**Yours:** every `kit.css` component and a new section appended for the
control kit; `tokens.css` by appending; `hud.css`/`hud.js`; `settings.css`/
`settings.js`; `ui/deckview.js`; `ui/mapnode.js`; the room shell in
`scenes/reward.js` and the six boards' scene files (shop, reward, event, map,
rest, gameover); `ui/card.css`/`ui/card.js` ONLY for the card-back hump; the
clubhouse's Haunt steppers. New assets through the existing prep tools, never
a second script with the same job; grep `game/src` and `game/assets` before
you name anything — round 4 had three builders paint three different
`lamp.webp`.

**Not yours:** `fx/*` and `core/renderer.js` (the WebGL room, and a fix to its
cold start that has just landed), `ui/coach.*`, `ui/handoff.*`, the
achievement toast, the sprites, gameplay, the region palettes. **Lay out
through your own classes**: a scene sheet that sets `position`, `display` or
`left` on a shared `.kit-*` selector turns `tests/scene-css` red.

## TESTING, TRAPS, DELIVERABLES

- Tests hard-code `:8777`, the MAIN checkout. Run them from your worktree as
  `python tools/on_port.py PORT <test>`, with your own dev server up —
  `on_port.py` rewrites the port, it does not start a server. At least
  `tests/steam-deck`, `tests/css-tokens`, `tests/scene-css`, `tests/chrome`,
  `tests/settings-play`, `tests/piles-reachable`, `tests/map`, `tests/platform`.
  (`tests/steam-deck`'s Map row is a known pre-existing race; read its rows.)
- **`shot.py` marks bright paper screens VOID** — the Map and the Clubhouse
  trip its white-flash check on legitimately bright parchment. Look at the
  frame; do not retry it forever.
- Stop ONLY the processes you started, BY PID. Never kill by name or pattern.
- `python tools/endings_guard.py --base BASE` must print ENDINGS OK.
- **Say in your notes what you did NOT do.**

Photograph each screen at the default size AND at `--w 1280 --h 800` as
`<screen>-1280.png`, into `JUDGING/CODE/`:

```
cd "WT" && python tools/shot.py CODE-<board> --port PORT --scene <board> --seed 7 --companion bones --kid maya --wait 3     # shop reward event map rest gameover
cd "WT" && python tools/shot.py CODE-settings --port PORT --scene map --seed 7 --companion bones --kid maya --wait 3 --steps "click:.mm-hud__settings|wait:1"
cd "WT" && python tools/shot.py CODE-piles    --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5 --steps "click:#draw-pile|wait:1"
cd "WT" && python tools/shot.py CODE-combat-crowd --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8 --script @tools/shot-scripts/combat-crowd.js --steps "wait:2.5"
```

Copy each PNG to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Before you finish, photograph two screens OUTSIDE the list (the lobby and the
atlas) on your port and look at them: your kit changes land there unwatched.
