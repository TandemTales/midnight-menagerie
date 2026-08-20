## 2026-08-19 — companion-cards

Shipped the full card content layer: **445 CardDefs, 0 validation errors.**

### Files created (all within companion-cards ownership)
- `game/src/data/companions/_util.js` — the helper layer every card effect is written against.
- `game/src/data/companions/keywords.js` — 54 companion keywords + 25 statuses. **The engine must merge these**; `data/keywords.js` is combat-engine's.
- `game/src/data/companions/{marmalade,bones,pipkin,taffy,wink}.js` — 20 Commons / 35 Uncommons / 25 Rares each, plus Basics, exactly per the design docs.
- `game/src/data/cards.js` — registry: `allCards`, `cardById`, `poolFor`, `startingDeckFor`, `registerCompanion`, plus `companions`, `sharedPool`, `rollRewards`, `registryErrors`.
- `game/src/data/neutral.js` — 6 Status Tricks, 7 Curses, 8 shared colourless Tricks.
- `tests/cards/index.html` + `tests/cards/run.py` — schema validation, mechanical-distinctness check, balance bands, cost curve, damage-per-Pluck histogram, and a live smoke test that plays every card (base **and** upgraded) against a mock engine. `--audit` regenerates `docs/CARD-AUDIT.md`.

### Pool counts

| companion | deck | basic | common | uncommon | rare | special | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| marmalade | 10 | 3 | 20 | 35 | 25 | 0 | 83 |
| bones | 10 | 5 | 20 | 35 | 25 | 1 | 86 |
| pipkin | 10 | 6 | 20 | 35 | 25 | 0 | 86 |
| taffy | 10 | 4 | 20 | 35 | 25 | 0 | 84 |
| wink | 10 | 5 | 20 | 35 | 25 | 0 | 85 |

MULTIPLAYER-ONLY pools were skipped deliberately (single-player build).

### Decisions that deviate from, or resolve gaps in, the design docs
- **"Nerve" vs "Pluck".** Every companion doc says Nerve; `schema.js` `TERMS.energy` says Pluck and CONTRACTS says to use TERMS in all UI. Card text uses **Pluck**. Flagging for the lead — one of the two sources should change.
- **Vanish = Exhaust.** The docs' word is Vanish; `CardDef.exhaust` is the field. Cards set `exhaust: true` and print `[Vanish]`.
- **Haunt dissipation** was "gradually" in the doc. Concrete rule: the enemy loses Courage equal to its Haunt when it takes a damaging action, then loses **half its Haunt, rounded up**. 6 Haunt across three attacks = 10 damage. Permanent Haunting changes the decay to 1.
- **Starting Courage** was unspecified: Marmalade 68, Wink 66, Pipkin 72, Bones 74, Taffy 76. All start at 3 Pluck.
- Bones's Buried zone uses `Pile.STASH`; Taffy's Belly also uses STASH (distinguished by a card flag); Wink's Sets use `Pile.LIMBO`.

### Integration with combat-engine

The engine landed while this was being written, so the whole pool was re-pointed at the real
`ctxFor` surface and re-verified against it. `tests/cards/index.html` no longer uses a mock: it
builds a **real `CombatEngine`** per card via `makeDummySetup`, plays every card base and upgraded,
and then runs a three-turn full cycle per companion. **445 cards, 0 errors.**

What that migration changed on my side:
- Companion resources are engine **counters**, not statuses. Each companion's tracker calls
  `defineCounter` for its track: `lives` 0–9 start 9, `loose-bones` 0–6, `height` 0–3, `plump` 0–5,
  `globs` 0–6, `open-eyes` 0–8 start 3. `ctx.canSpend` therefore answers Life and Bone costs.
- `companions/keywords.js` now self-registers `COMPANION_STATUSES` through `data/statuses.js`.
  `data/keywords.js` already dynamic-imports it for `COMPANION_KEYWORDS`, so **combat-engine has
  nothing to wire up.**
- Scheduling goes through `ctx.schedule({turns, when, run})`; Taffy's Runny tick is a repeating
  `enemyTurnEnd` timer.
- Per-card state (Slobbered, Dug Up, Stretch, Gummy, Chewed, Buried counters, Favorite) uses
  `card.meta`, with numeric counters under a `#` prefix.
- Zones: Bones's Buried and Taffy's Belly both live in `Pile.STASH`, told apart by a card flag;
  Wink's Sets live in `Pile.LIMBO`.

**One bug worth knowing about:** `engine.state` is a full serialising snapshot getter. Reading
`engine.state.turn` in a helper that runs on every card effect caused a stack overflow inside
`statusList`/`costOf` under load. Nothing in `data/companions/**` touches `engine.state` any more —
worth a warning in the engine docstring for the other content agents.

### Still needed from combat-engine

Small, and all called as `c.foo?.(…)` through `_util.js`, so nothing breaks before they exist:

| Need | Used by |
|---|---|
| `ctx.chooseCard({pile, filter, count, prompt})` and `ctx.choose({options, count})` | ~70 cards that say "choose". Without them `_util.js` auto-picks deterministically, which is correct but not playable. **Biggest gap.** |
| `ctx.discard(n, {choose:true})` | "draw then discard one" cards currently fall through to random discard |
| `ctx.setVanish(card, bool)`, `ctx.returnToHand(card)`, `ctx.cancelIntent(enemy)`, `ctx.shuffleDraw()`, `ctx.modifyDraw(n)` | Overstretch, Boomerang Bone, Steal a Turn, Who Buried That?, Phase Out |
| Status hooks `onAttack`, `onAttackDealt`, `onIncomingHit`, `onLethal`, `onDebuffIncoming` | Haunt, Empowered, Play Dead, Not Dead Yet, Nope. — listed in `keywords.js` `ENGINE_HOOKS_REQUIRED` |
| An `enemyTurnEnd` decay bucket | Ghoststep expiry |
| The intent queue for Wink: `intentQueue`, `previewIntent`, `previewDepth`, `intentFamily`, `isAnchored`, `swapIntents`, `postponeIntent`, `deleteIntent`, `forkFuture`, `forceIntentFamily`, and an `intent` event carrying `{enemy, family, changed}` | Wink's Preview / Read / reorder pool. Wink keeps its own shadow bookkeeping meanwhile, so his cards resolve without crashing but do not yet move real Intents. Needs a joint pass with the enemies agent. |

`installTrackers(engine, slug)` from `_util.js` should be called at combat start. Card effects
self-install it defensively, so it only matters for a turn where the player plays nothing.

---
