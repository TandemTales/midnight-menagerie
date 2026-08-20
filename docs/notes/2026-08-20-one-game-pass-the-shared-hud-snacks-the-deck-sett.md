## 2026-08-20 — one-game pass: the shared HUD, Snacks, the deck, Settings, the End Turn tip

Eleven agents each hand-rolled the same furniture and `ui/hud.js` was imported by
nobody. This pass adopts the shared chrome everywhere and deletes the copies.

Edited: `ui/hud.js` + `hud.css`, `ui/tooltip.js`, `scenes/{map,combat,reward,shop,
rest,title}.js` and `scenes/{map,combat,reward,shop}.css`. Nothing else.

### A. One HUD, one position

| scene | before | now |
|---|---|---|
| map | heart + pink bar + `◎ 99` + featureless amber spheres, top-left, dead `⚙` | `ui/hud.js`, top strip |
| combat | `TURN 1 ♥68/68 ◎99` top-right + a gold-star chip top-left | `ui/hud.js`, `variant:"combat"`, top strip |
| reward / shop / rest / event | `COURAGE 67/68` + bar + `LOST THINGS` + a torch chip, top-right (one copy, in `RoomScene`) | `ui/hud.js`, top strip |
| gameover | — | **deliberately none**, see below |

`RoomScene._syncHud()` in `reward.js` is the single seam for all four node rooms,
so shop / rest / event needed no HUD code of their own. `map.js` lost its
`data-placeholder="hud"` block and the `hp / gold / relics` fields of its model;
`combat.js` lost `.cb-keeps`, `.cb-vitals`, `.cb-turn`, `.cb-chip--hp`,
`.cb-chip--gold` and `_syncKeeps()`. `map.css`, `reward.css` and `combat.css` lost
the matching rules (`.hud-*`, `.rm-chip/.rm-bar/.rm-keep*`, `.cb-keep*/.cb-chip*`).

**Position.** Full width, pinned to the top edge, on every screen — `.mm-hud--fixed`.
The four node rooms mount it in flow as the first grid row instead (`fixed:false`)
so a HUD that wraps under largeText pushes the room down rather than sitting on the
title. It looks identical; it just cannot overlap.

**Combat is a variant, not a different component.** `data-variant="combat"` changes
the ground (the Scuffle screen has its own) and the density. Everything else —
markup, class names, order, icons — is the same object. It adds exactly one chip,
`Turn`, through the new `hud.addChip(node)`, and that chip uses `.mm-hud__chip`.
`tests` for this are structural, not visual: `drive2.py` walks the HUD subtree on
all six scenes and asserts the class-name tree is byte-identical (combat = map plus
the one `--extra` chip). **40 checks, all pass.**

**Keepsake icons.** There were four. There is now one set: `relicSigil()` from
`data/relics.js`, which the shop and the reward room were already using. `hud.js`
imports it and draws the per-Keepsake sigil instead of the generic lozenge, so the
Brass Button in the HUD is the Brass Button in Mr. Moth's cabinet. The Snack glyph
was two drawings (`res.snack` in the HUD, a hand-rolled jar in the shop); the shop
now renders `iconSvg('res.snack')`.

**New HUD options** (all optional, all documented in the file header):
`variant`, `fixed`, `run`, `escape`, `useSnacks`, `onUseSnack`, and two live-data
overrides for combat — `courage: () => [hp, max]` and `relics: () => [...]`, because
mid-fight the *engine* is authoritative for both and the run only learns the new
Courage when the fight ends. Without those the HUD would show last-fight numbers on
top of this fight.

### B. Snacks work

`snack` appeared in `shop.js`, `event.js`, `clubhouse.js` and the unused `hud.js`,
and nowhere in combat. You could pay 74 Lost Things for Popping Candy and there was
no code path in the game that could ever consume it. Now:

- Three slots in the HUD, everywhere. In a Scuffle they are **buttons** with a lit
  rim and a `⇧1 / ⇧2 / ⇧3` badge; outside one they are focusable read-outs that say
  "You eat Snacks during a Scuffle" instead of offering a dead click.
- Click, or `⇧1`–`⇧3`. (`1`–`9` belong to the hand; `Shift` keeps them separate.)
- Targeted Snacks (Jawbreaker) ask who, through the chooser the engine already uses
  for card choices — clickable on the board or in the list, arrow keys + Enter,
  Escape to back out. Nothing is consumed until the question is answered.
- Consumed on use, removed from `run.snacks`, `run.save()`, `run:potion` on the bus,
  HUD refreshes.
- Resolved through the engine's ordinary public API — `heal`, `gainBlock`,
  `gainEnergy`, `cleanse`, `dealDamage`, `applyStatus` — so Guard, Strength, Frail,
  Vulnerable, every relic hook and every animation behave exactly as they do for a
  card. No new engine surface was needed and none was bodged in.

All seven `SNACKS` in `state/run.js` are covered by the six effect keys
(`heal / block / damageAll / energy / status / cleanse`, plus `target:'enemy'`).

### C. The deck, everywhere

`ui/deckview.js` was imported only by the unused `hud.js`. The HUD's deck button now
appears on map, combat, reward, shop, rest and event, and opens `openPile()`. The
shop additionally makes the "Tricks: 16" figure under Mr. Moth a button — you are
buying cards, you should be able to look at the deck you are buying them for.
`combat.js`'s private `.cb-pileview` panel is gone; `Q` / `W` / the pile buttons open
`openPile('draw'|'discard')`, which brings search, filters, sort, a real keyboard
grid, and the draw pile force-sorted by the *view* rather than by the caller.
`D` opens the deck from a Scuffle.

### D. Settings reachable

- The HUD cog works on all six scenes. `map.js:204`'s decorative `<span class="hud-cog">⚙</span>` is deleted.
- **Escape** opens Settings on all six. It is **opt-in** (`escape:true`) rather than
  on by default: a mounted component that seizes a global key surprises hosts that
  have their own use for it — `tests/chrome/index.html` does, and defaulting it on
  broke that harness. Combat binds Escape itself so it can close an open pile first.
- Ordering is safe without a priority scheme: the HUD is built before every scene's
  own `_bindKeys()`, it calls `preventDefault()`, and every scene key map already
  opens with `if (e.defaultPrevented) return`. A `Modal` traps Escape in capture
  phase and the HUD also refuses to fire while `.mm-modal` exists, so Escape closes
  the deck view / Settings / a picker before it ever reaches the HUD.
- **This took Escape away from "leave the room" in the shop and the Safe Room.**
  Both now leave on Enter (the shop's button already said `Esc`; it says `Enter`).
  In the Safe Room Enter belongs to a focused option until the fort has been used,
  after which Enter leaves — the same shape `reward.js` already uses.
- `title.js`'s bespoke settings overlay is replaced by `openSettings(ctx)`. It had
  eight controls and no colourblind palette; the shared panel has fifteen including
  the palette (`colorblind` was already in `SETTINGS_SPEC` — the title screen simply
  never showed it). The credits overlay stays where it is; it is not Settings.
  Title also now re-applies its two local mirrors on `settings:changed`, so a change
  made behind the modal is visible immediately.
- `combat.js`'s bespoke `.cb-pileview` modal is replaced by `ui/modal.js` (via
  `openPile`), which brings focus-in/focus-return, a Tab trap and real `inert`.

### E. The End Turn tooltip

Two faults, one root each.

1. **It stayed mounted.** `_syncEndTurn()` sets `this.$endTurn.disabled` — and a
   disabled control stops dispatching pointer events in every browser, so the
   `pointerout` that would dismiss its tooltip never arrives. The panel sat at
   opacity 1 over the board.
2. **It showed stale text.** The panel renders once, at hover. `_syncEndTurn()` then
   rewrites `data-tip` every sync. "Nothing left you can play" was a *correct*
   sentence from a previous turn, frozen on screen while the player had 3/3 Nerve.

Fix: **`Tooltip.refresh(el?)`** — re-read the open panel's anchor; hide if it is now
disabled, detached or invisible, otherwise re-render from its current attributes.
`show()` no longer strips `is-in` when re-showing the same anchor, so a refresh is an
update rather than a blink. `_syncEndTurn()` calls it. Cheap: it does nothing at all
unless a panel is open.

While there: **`combat.js` ran a second, competing tooltip delegation** over the same
`[data-tip]` attribute (`pointerover`/`pointerout` on its root, a probe to detect
whether the shared tooltip was real, and a private `.cb-tip` fallback panel). Two
systems, neither clearly responsible for hiding. That is deleted. `ui/tooltip.js` now
understands the scene's `Title|body|footer` shorthand in `data-tip` (three lines in
`_descFor`, `data-tip-title` still wins), so the attribute path is as good as the
bridge was and no scene needs a tooltip renderer. `_showTip`/`_hideTip` survive as
two-line wrappers for the intent/enemy panels, whose content is built HTML.

### Two bugs found on the way

- **`case 'turn:start'` wrote `String(ev.turn)` while `_syncAll()` wrote `Turn N`** —
  so the top bar said "2" for one beat and "Turn 2" the next. Both say `Turn N` now.
- **`_syncAll()` read `engine.state.turn`.** `engine.state` is cached behind a
  `_dirty` flag and a turn rollover does not always set it, so the Turn chip could
  sit a whole turn behind the fight it labels — reproduced in 1 run of 3. It now
  reads `engine.turn`. *(combat-engine: `_buildState`'s dirty tracking may want a
  look; I worked around it rather than touching your file.)*
- **`combat.js`'s standalone engine path dropped the run's Keepsakes.** Deep-linking
  into a Scuffle mid-expedition built the engine with `relics: []`, so the Keepsake
  bar went empty *and* every relic hook silently stopped firing for that fight. It
  now passes `ctx.run.keepsakes`.

### Verify

- `python tests/chrome/run.py` -> **27 checks, 0 errors**, 61 fps (ui-chrome's own
  harness, unchanged and still green after the Escape default was made opt-in).
- Two Playwright drivers, one run at a time:
  - a real sequence — start a run, three Snacks, enter combat, open the deck, eat
    Popping Candy (10 to all), eat a targeted Jawbreaker through the chooser, open
    Settings with Escape, switch to the deuteranopia palette and confirm it lands on
    `<html>` *and* in `Save`, close, hover / leave / disable / end turn on the
    End Turn tooltip. **22 checks, all pass, 61 fps**, stable over three runs.
  - a structural sweep — six scenes × {HUD mounted, deck button, cog, Escape, Escape
    did not also leave the room} plus the shop's deck read-out, `Q`/`W` piles, the
    draw pile sorted, and the class-tree comparison. **40 checks, all pass.**
- Every scene screenshotted and read: `shots/hudchk-{map2,combat,reward,shop,rest,event,title,large,combat-1080}.png`.
- **`shots/hud-consistency.png`** — the HUD strip from all six scenes, one real run,
  stacked and pixel-aligned. That is the artifact to look at.
- Sequence: `shots/seq-{1-combat-hud,2-deckview,3-snack-used,4-snack-target,5-settings,6-colorblind,7-turn2}.png`.

### What I did not do, and why

- **No HUD on `gameover`.** The run is over — Courage, Lost Things and three Snack
  slots are not live state there, and the screen is already a full-page ledger of
  exactly those numbers. Adding a run strip to it would be consistency for its own
  sake. Settings on that screen is one hop away via the title.
- **No `is-mock` change.** The HUD still labels itself `preview` when there is no
  run; `map` and `combat` deep-linked standalone show it, the four node rooms pass
  their own `Run.mock()` through the new `run:` option so they show real numbers.

### Asks

1. **combat-engine — `engine.useSnack(snack, targetId)` and an `onSnackUsed` hook.**
   The Snack effect table lives in `scenes/combat.js` today and it decides rules,
   which CONTRACTS §5 says belongs in `src/combat/`. It is in a scene only because
   `src/combat/**` is yours. It is ~30 lines, self-contained, and calls nothing but
   your public API — lift it wholesale. The hook matters independently: **no
   Keepsake can react to a Snack today**, and Slay the Spire has several that do
   (extra potion slots, potions applying twice, gaining Block on use).
2. **meta-run — `Run.useSnack(index)`.** `addSnack` exists; there is no matching
   remove, so the scene does `run.snacks.splice(i,1); run.save()` and emits
   `run:potion` by hand. One method and the scene stops reaching into your array.
3. **meta-run — Snack prices.** `SNACKS[].base` is 55–75 and a Scuffle pays roughly
   40–70 Lost Things. Now that Snacks are actually usable this is a real economy
   number rather than a dead one; it wants a balance pass.
4. **combat-engine — `engine.state` cache invalidation on turn rollover** (see above).
5. **meta-run / combat-scene — `_makeEngine`'s standalone path uses `ctx.run.rng`
   directly** rather than a fork, so deep-linked combats consume the run's master
   stream and are not reproducible. Your real path (`Run._startCombat`) forks
   correctly. I left it alone; it is a determinism hole worth closing.
6. **ui-chrome — heads-up.** `hud.js` grew `variant`, `fixed`, `run`, `escape`,
   `useSnacks`, `onUseSnack`, `courage`, `relics`, `addChip()`, per-Keepsake sigils
   and the `⇧1–3` Snack affordance; `tooltip.js` grew `refresh()` and the
   `Title|body|footer` shorthand. Your harness still reads 27/0. Note we were both
   in `hud.js` at the same time — your Backpack Gear bar and my changes are both in
   the file and both green, but the `.mm-hud__gear` list is in the DOM and nothing
   populates it yet.

---
