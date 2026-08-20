## 2026-08-20 — frontend agent, round 2 (title / select / clubhouse / gameover)

Picked up the pre-run screens from the previous frontend pass. `shots/title01.png` in the
repo was stale — the logo bug it shows was already partly fixed. Everything below is
against the live build.

### 1. Title

- **Wordmark now fills the cartouche.** In `ui/portrait.css` the two lines went from
  `.062` to `.0715` and `.100` to `.1105` of `--logo-w`, the negative leading tightened, and
  the outer bloom became a two-stop drop-shadow so it reads like the source plate's glow.
  The cartouche itself grew in `ui/portrait.js` (`ry 152 to 166`, inner rings to match) so
  MENAGERIE has air on all four sides instead of colliding with the brass ring.
  Measured against `UI/selectCompanion.png`: MIDNIGHT/MENAGERIE width ratio 0.73 vs the
  plate's 0.71, cap-height ratio 1.62 vs 1.62.
- **The menu has a ground.** New `.ti-plinth` wraps tagline + menu in a framed slate
  plaque (near-opaque ink gradient, brass hairline + diamond top and bottom, `--shadow-4`).
  The nav is `width: fit-content` and centred in it, so the panel is not half-empty.
  `.ti-scrim` widened and softened underneath so the house sits back rather than vanishing.
  **I deliberately did not use `backdrop-filter` here** — blurring a permanently animating
  backdrop (motes + flickering windows) is a full-rect repaint every frame. An opaque
  gradient looks the same and holds 61 fps.
- **Tagline** moved into the plinth, up to `clamp(15px,1.18vw,20px)`, parchment-tinted with
  the second line in flame, hard shadow behind. It is no longer over the building at all.
- The menu chevron glyph now points at its label (it pointed away).

### 2. `scenes/gameover.js` + `gameover.css` — built (was an 8-line stub)

Deep links: `#scene=gameover&result=defeat` and `&result=victory`, plus optional
`companion`, `kid`, `region`, `seed`, `floor`.

Layout is one grid, two arguments:

- **left, the beat** — candle, Companion plate, headline, three stanzas (*what you found* /
  *what you lost* (or *what it cost*) / *the pet you did not reach*), and a blueprint band.
  On defeat the flame is snuffed 1.35s in: the flame ducks and dies, the halo goes out, a
  smoke wisp draws itself at the wick and keeps drifting, and the vignette closes in. The
  vignette close is a **cross-fade of two painted layers**, not a transition on
  `background` — the latter repainted the viewport for 1.4s and cost about 13 fps.
- **right, the ledger** — who went in, eight stat tiles, a Courage bar, the final Tricks as
  typed chips, *worked hardest* rendered as a **real `CardView`**, the Keepsakes, and the
  seed with a copy button.
- The blueprint band crops the master plan through `mapgen.blueprintPlan(region, 3)` so it
  and the map screen are always looking at the same piece of paper. Victory lights the
  wing in flame; defeat circles it in red pencil.

Data: everything funnels through one `_summarise()` object, so a real `ctx.run` and the
standalone mock render through identical code. Fields read (all optional):
`result | won`, `seed`, `companion`, `kid`, `region | regionId`, `floor`, `hp`, `maxHp`,
`gold | lostThings`, `hauntLevel`, `killedBy`, `deck`, `relics`, `companionsFreed`,
`petRescued`, `wingsMapped`, and `stats.{scuffles,bigScares,curiosities,safeRooms,
cardsPlayed,damageDealt,turns,clues}`. Without a run every number is derived
deterministically from the seed, and the deck is built from the **real** `startingDeckFor`
+ `poolFor` data, so the mock is never a placeholder.

`_activate()` clears the run (`Save.clearRun()`, `ctx.run = null`) before leaving, so a
dead run can never be resumed off the title's Continue item.

### 3. Select

- **Starting deck is now real cards.** The old code looked for `mod.startingDeck`, which
  does not exist — it silently fell through to the codex summary every time. It now calls
  `startingDeckFor(slug)`, loads `ui/card.css`, and renders **`new CardView(def, {uid})`**
  per distinct Trick with a brass xN badge. Sizing is CSS-first (`.deckslot` is
  `height:100%; aspect-ratio: var(--card-aspect)`) and JS only does
  `view.setTransform({x: w/2, y: h, scale: w/224})`, re-run on resize. Companions whose
  module has not shipped keep the codex summary. All views are destroyed on re-pick and on
  `exit()`.
- **Dossier re-laid out.** The deck is now a full-width band across the bottom of the
  dossier with the CTAs beside it, strengths/weaknesses moved into the wide body column,
  and the side column gained a **vitals block** — starting Courage / Nerve per turn /
  starting Tricks, read off the companion module's `startingHp` and `startingEnergy`.
  That was a straight gap against StS character select, which always shows those numbers.
- **The wall now says what to do.** It arrived with no instruction at all; there is a
  "Choose a Companion" prompt above it, and the grid is height-clamped
  (`min(830px, 54vw, 71vh)`) so it no longer runs under the footer at 900px.
- **Kid step**: "Together" now shows the chosen Companion's plate next to the pairing line
  instead of a paragraph floating in empty space.

### 4. Clubhouse

- The Menagerie roster was clipping its fourth row. The grid is now centred and width-capped
  so **all sixteen plates are on screen at once** — a roster you have to scroll stops
  reading as a wall.
- The Backpack shelf was cutting off four pieces of Gear; the shelf list is now two columns
  and all of them fit.
- Panel scrollbars are styled (brass thumb) so anything that does still scroll says so.

### Measured

61 fps on every screen at 1600x900 (`shots/*.state.json`), about 11 MB heap. **Zero console
errors** on title, select (grid / hero / kid), clubhouse (all four panels), gameover
(both flavours) and the full flow. Teardown: after eight scene transitions the document is
back to 317 nodes, 1 `.scene`, 0 `.mm-card`, 0 `.pf`, and 6 (not 48) stylesheet links.

Note for anyone reading old numbers: fps dips to 9-24 when two Playwright runs overlap on
this machine. Re-measure in isolation before believing a low number.

### Accessibility

Roving arrow-key focus on the title menu, the companion wall, the kid strip, the haunt
pips and the gameover actions; visible focus rings everywhere (`shots/a11y_title_focus.png`).
`Escape` steps back one level on select and returns to the Clubhouse from gameover.
`reduceMotion` skips every entrance and snuffs the candle instantly; `largeText` verified on
gameover and select (`shots/a11y_go_rm.png`, `a11y_sel_rm.png`).

### Terminology

Swept again. `Curiosities` was rendering as "Curiositys" (`TERMS.event + 's'`) — fixed with
the real plural. No energy/HP/block/card/relic/gold/shop words anywhere in my four scenes.

### Tokens I need (I did not edit `tokens.css`)

Nothing blocking — everything derives from existing tokens or the `--arcane-*` / `--brass-*`
ramps in `ui/portrait.css`. Two would be nice to have, both currently done with
`color-mix()` at the point of use:

- `--paper-wash` — the multiply wash used over blueprint parchment on dark screens.
- `--good-300 / --good-500` — card-feel already asked for these; my gameover chips would
  use them for "this went up" too.

### Breaks outside my ownership

1. **`combat/engine.js` line 71 imports `previewCardAsync` from `./preview.js`, which does
   not export it.** This is a *static* import, so while it is broken the whole app fails to
   boot on every screen — `window.MM` never exists. It was broken around 02:35-02:45 and
   working again by 03:05; the combat-engine agent is mid-edit. Worth a smoke test before
   anyone signs off. (combat-engine)
2. **`state/run.js` does not exist**, so `ctx.run` is always `null`. Select emits
   `run:start` with `{companion, kid, seed, haunt, backpack}` and hands those straight to
   `scenes.go('map', payload)`; map and gameover both mock cleanly without it. Gameover
   will read a real run the moment one exists — the field list is above. (meta-run)
3. `data/relics.js` does not exist. I originally probed for it with a dynamic import, which
   put a 404 in the console; I removed the probe. Gameover reads Keepsakes from
   `ctx.run.relics` only, and otherwise shows an authored fallback set. (meta-run)

### Flow

title -> New Expedition -> select companion -> dossier -> Take X in -> kid ->
Begin Expedition -> `ctx.scenes.go('map', payload)` -> the map scene loads. Verified end to
end by driving real clicks: `shots/flow1_select.png`, `flow2_hero.png`, `flow3_kid.png`,
`flow4_map.png`.

### Screenshots

`shots/t2.png` (title), `go-defeat.png`, `go-victory.png`, `sel2.png` (the wall),
`sel4.png` (Bones dossier, real cards), `sel-kid.png` (kid step), `club2.png` (board),
`club-menagerie.png`, `club-pets.png`, `club-backpack.png`,
`flow1_select.png` through `flow4_map.png`, `a11y_title_focus.png`, `a11y_go_rm.png`,
`a11y_sel_rm.png`, `cycle2.png` (post-teardown).

---
