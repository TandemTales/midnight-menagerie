# Handoff — the house: tutorial, mansion map, ladder

Paste this whole file into a new conversation. Branch `dev`, all work below is
committed. `python -m http.server 8777` is expected to be running at the repo
root; every test drives the real game at `http://localhost:8777/game/index.html`.

The ask has three parts. **Part 3 is done. Parts 1 and 2 are not started**, but
the data and the decisions they need are established below — read the FACTS
section before designing anything, because four of those facts have already been
measured and cost a wrong assumption if you re-derive them.

---

## 1. Tutorial opening sequence — NOT STARTED

The user's spec, close to verbatim:

* Starting a **new game** picks a **Kid first**, then goes straight into a
  tutorial. Skippable.
* If the player **has already rescued a Companion**, skip the tutorial entirely
  and go straight to the Companion-selection screen.
* The tutorial tells the story: a kid looking for their lost animal → falls in
  with the other kids → they go to the house → finds **Marmalade in the Foyer
  immediately** → Marmalade **jumps in to protect the kid**, which starts the
  first battle. The point of the beat is that the Companions protect the kids
  **by choice**.
* A simple battle the player is walked through.
* At the end you **get Marmalade**.
* The player learns there are more pets in the house to rescue, "both of this
  world and not" — so the adventure begins.

What exists to build on:

* `game/src/scenes/select.js` is the Companion/Kid select screen, and it already
  runs as a numbered flow: `1 COMPANION · 2 KID · 3 EXPEDITION`. The tutorial
  needs that order **reversed for a first run** (Kid, then the tutorial hands
  you Marmalade in place of step 1).
* `STARTER_SLUGS` / `STARTER_COMPANIONS` is `['marmalade']` and nothing else, so
  a fresh save can only pick her anyway — the tutorial is the fiction for a rule
  that is already enforced. `availableCompanions()` = starters + lifetime
  rescues; `freedCompanions()` = rescues only. Those two are the skip condition:
  **skip the tutorial when `freedCompanions().size > 0`**, not when
  `availableCompanions()` is non-empty, which is always true.
* `Save.data.companionsRescued` is the persisted list (`core/save.js`).
* `COMPANIONS` in `data/schema.js` gives each Companion a `region` — Marmalade's
  is `foyer`, which is exactly where the story puts her.
* Scenes register in `main.js` (`.register('rest', c => new RestScene(c))`), and
  every scene is deep-linkable with `#scene=NAME&...`, which is how all the
  tests drive them. A `tutorial` scene should follow that.
* `fx/transition.js` has a `blueprint` transition kind and `sfx.js` has
  `world:blueprint-unfold`, both unused by any map screen yet.

Not designed yet, and the user has not specified: how the walked-through battle
is constrained (scripted hand? forced targets? a coach overlay on the real
CombatScene?). Ask before inventing it — the real CombatScene is large and
heavily gated, and a parallel tutorial combat would be a second set of bugs.

---

## 2. The mansion map — NOT STARTED, but its data is READY

The user wants: a giant blueprint of the whole house; hovering a wing highlights
it; selecting it zooms in and expands that wing's section drawing; and you can
see **which pet is held in which area**.

**The data is committed and verified**: `game/assets/blueprint/sections.json`,
produced by `tools/blueprint_locate.py`. For all seventeen wings it gives

    region slug, section number, companion held there, boss, display name,
    x/y/w/h on mansion.png, and nx/ny/nw/nh normalised 0..1

so hit-testing works at whatever size the estate is drawn. `mansion.png` is
1448x1086 and is pixel-identical to `art/blueprint.png` (different encoding
only). The Companion column comes from `mapgen.js`'s own region table, so it
cannot drift from the game.

Read the tool's header before doubting a low `match` value — 0.67 is a good
match here, and it is verified three independent ways. The short version: the
section files are 1:1 crops with everything outside the wing **erased to blank
parchment**, which depresses correlation without moving the peak.

What exists to build on:

* `scenes/map.js` is the WITHIN-a-wing plan (rooms, route, nodes). The new
  screen is a level above it and should not be bolted into it.
* `state/mapgen.js` has `blueprintSection(regionId)`, `blueprintSectionUrl()`,
  `blueprintTraceUrl()`, `SECTION_PX`, and `regionMeta()`. Section drawings are
  **vectorised** into `sectionNN.plan.json` by `tools/blueprint_trace.py` so they
  can be re-inked at any size instead of resampled — use those for the zoomed
  view, not the PNG, and read that tool's header for why.
* `Save.data.blueprint = { revealed: ['foyer'] }` already exists — the reveal
  model for which wings the player has seen.
* `scenes/map.js`'s own title-card bug is worth copying the fix from: a label
  that covers marks is wrong on a drawing, whatever its z-index says. Two
  separate elements have now hit that, and both ended up moved or tucked.

**The routing question this raises, which is NOT answered yet.** Today
`Run.route = expeditionRoute(seed, 6)` picks six of seventeen wings up front and
`advanceRegion()` walks that fixed list. Letting the player choose the next wing
means either replacing the route with a choice at each step, or keeping the
route and letting the map choose among its remaining members. That is a design
decision with save-format consequences (`route` is persisted) and the user has
not stated which. **Ask.**

---

## 3. Difficulty rising with depth — DONE (`752dc9e`)

`enemyDamageScale` used to read the region's fixed slot in `REGION_ORDER`. That
is only right while the route is fixed: open on the Heart and wing one hits at
2.0; take six early wings and the run never ramps.

It now reads the player's progress — `runDepthDamageScale(step, steps)` in
`data/schema.js`, fed `this.regionIndex` and `this.route.length` in `run.js`.
Same shape and endpoint as before. Measured on seed 7: **1.00, 1.20, 1.40, 1.60,
1.80, 2.00** across six wings, monotonic whichever regions the route holds.

`regionDamageFix` deliberately still reads the region. It is not a ladder — it
is the measured correction for four wings whose bodies do not survive a turn
(`REGION_CONTENT_FIX`). Where a fight is authored prices the fight; how deep the
player is prices the run.

If the route becomes player-chosen, this term needs no change — that is the
point of it.

---

## FACTS ALREADY MEASURED — do not re-derive these

1. **The mansion is not a ladder.** Against a held-constant player, region 2 is
   the second-hardest ordinary pool and region 16 matches region 1; the final
   region's Big Scares are easier than the first's. Enemy damage slope was
   -0.03 per region step. `docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md`.
2. **Scaling enemy Courage by depth was built, measured and FAILED.** It made
   fights longer without making them dangerous — a player who blocks everything
   is missed regardless of how much health the thing missing them has. **Damage
   is the axis that reaches them.** Partial Pierce by depth was also tried: no
   measurable effect.
3. **Four wings are under-priced for a content reason, not a ladder reason** —
   secret-passages, bathhouse, kennels, pumpkin-grounds. They do not need to hit
   harder; their bodies need to *survive a turn*. That is why `REGION_CONTENT_FIX`
   is a table and not a curve.
4. **`tests/critic-design/ladder.py` is the instrument** that can see any of
   this: it holds one loadout captured at the end of the Foyer still and walks
   it into every region. `bench()` takes an `hpScale` lever. Any difficulty
   change should be measured there, not argued.

---

## TRAPS

* **Line endings are per file and mixed across the repo.** `combat.js`, `run.js`,
  `map.js`, `select.js` are CRLF; `enemy.js`, `sprite.js`, `portrait.js`,
  `title.js`, `map.css` are LF. Scripted edits flip them and blow up the diff —
  count bytes (`d.count(b'\r\n')`) before and after every edit.
* **There is no Node runtime.** JS runs in Chromium via Playwright. Drive the
  real game and probe it; `python -m http.server 8777` must be up.
* **The Browser pane throttles to zero rAF ticks when hidden**, so the game
  freezes and every `javascript_tool` call times out at 45s. That is not a bug in
  the game. Use Playwright for anything automated.
* `tests/run/index.html` reports **1 pre-existing error** — `_losePatience`
  firing on 6 of 738 fights. Confirmed pre-existing by stashing. Do not chase it
  as a regression.

## GATES

    python tests/sprites/check.py          22 clips, 24 stills, 0 failures
    python tests/sprites/clips.py          28 passed
    python tests/combat-scene/seam.py      22 passed
    python tests/cards/run.py              1470 cards, 0 errors
    tests/run/index.html                   50 runs, 1 error (pre-existing)
    tests/backpack/index.html              72 checks, 0 failures

Browser-page suites (`tests/run`, `tests/backpack`) have no runner; load them in
Playwright and read `RESULT:` off `document.body.innerText`.

## ALSO OPEN

* `art/` composites are ~110 MB and untracked. `animations/SS_*.png` are in
  **Git LFS** (`.gitattributes`), ~270 MB, and **have never been pushed** —
  GitHub's free LFS allowance is 1 GB storage / 1 GB bandwidth a month, which is
  a billing decision left to the owner.
* Card art covers marmalade, mopsy, boggle and taffy — 358 of their 359 Tricks,
  every image distinct. `tools/cut_card_art.py`. The twelve other Companions
  have no sheets yet and render procedural art, which is the designed fallback.
