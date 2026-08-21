# combat-engine — round 6

Companion trackers at combat start, counter states, and the two intents that were
lying to the player.

**649 assertions, 0 failures** (`tests/combat/run.py`).
`tests/seams/check.py` 1600 / 0 problems · `tests/seams/proof.py` 52 / 0 ·
`tests/combat-scene/seam.py` 14 / 0.

---

## 1. Companion trackers install at combat start

`installTrackers` was only ever reached from `U.ensure()` inside a card effect, so
a Companion's counters did not exist until it played something. `loose-bones` was
absent on turn one, the HUD gauge the combat scene had just built had nothing to
show, and any Keepsake or status that wanted to read a counter before the first
card play saw nothing.

The engine now installs them itself, inside `_startCombat()`, **before the first
intent is drawn**.

```js
// injected — combat/ will not statically import data/companions/**
new CombatEngine({ ..., trackerInstaller })
engine.setTrackerInstaller(fn)

// or, the path the game takes, which also loads cards/enemies/statuses/keywords:
await loadContentRegistries(engine);      // data/keywords.js
```

`loadContentRegistries` now also calls `preloadCompanionTrackers()` (exported from
`combat/engine.js`), which dynamic-imports `_util.js` and registers its
`installTrackers` for every engine. So in the real game nothing extra is needed —
the scene already calls it.

Installs for `player.companion`, plus any extra slugs passed as
`cfg.companions: ['bones', …]` for co-op. `engine.trackersInstalled` records what
ran. A Companion with **no** installer available logs a loud warning rather than
booting a fight with no counters (CONTRACTS rule 8).

### The mistake worth recording

My first cut made `startCombat()` `await` a dynamic import before calling
`_startCombat()`. That is a one-line change and it broke eight assertions in
`tests/seams/proof.py`, because `proof.js:50` calls `e.startCombat()` **without
awaiting** and relies on the fight being fully set up when it returns. Moving
setup one microtask later emptied the opening hand for every harness that does
the same.

`startCombat()` returns a Promise, but **its body runs to completion
synchronously** and several callers depend on that. There is now a regression
test that calls it without awaiting and asserts the hand is dealt, the turn is 1
and intents are drawn before it returns. Anything that needs I/O has to happen
before `startCombat`, not inside it.

## 2. Counters declare their own states

The renderer was regexing `"Whole at 0, Scattered at 4 or more"` out of Loose
Bones's `desc` to find the band labels. That breaks the first time anyone rewords
a description. Counters now declare them:

```js
engine.defineCounter({
  id: 'loose-bones', name: 'Loose Bones', min: 0, max: 6,
  states: [{ at: 0, label: 'Whole' }, { from: 4, to: 6, label: 'Scattered' }],
});
```

- `at` is an exact value; `from`/`to` are an inclusive range and either may be
  omitted. **The first matching entry wins**, so list exact values first.
- A value in no band gives `null` — the engine says "no state" rather than
  guessing at the nearest one.
- Malformed entries are dropped at definition time rather than throwing mid-fight.

Where to read it:

```js
engine.counterState('loose-bones')          // 'Whole' | 'Scattered' | null
state.counters[i].state                     // the current label
state.counters[i].states                    // the full band list, to draw the track
```

and the `counter` event now carries `state`, `stateBefore` and `states`, so a
band transition can be animated without diffing anything.

**The renderer can drop its regex.**

## 3. `buildIntent` carries `addsCards` and `rule`

Two intents were actively lying.

**Pack Wrong** is `intent: DEBUFF, block: 5` and shuffles Clutter into your
discard pile. The chip showed a bare `5` — its *Guard* — under a debuff icon, and
the label read "Pack Wrong. 5 Guard." The deck pollution, which is the actual
threat, was never mentioned. **Door Greeter** showed a chip reading just
`DEBUFF`: no magnitude, no duration, no name.

Both are now first-class fields on the Intent:

```js
intent.addsCards  // [{ id, name, pile, count }]   resolved and COUNTED
intent.rule       // { id, name, text } | null
```

- `addsCards` entries are grouped by `(id, pile)` and counted, so two identical
  static entries collapse to `count: 2`. The name is resolved through the card
  registry, so the chip can say `CLUTTER` rather than `clutter`; an unregistered
  id falls back to the id rather than vanishing. Default pile is `discard`.
- **`addsCardsFn(c)`** is preferred over the static `addsCards`, exactly like
  `damageFn`. That is what lets Pack Wrong's chip honestly read `+2 CLUTTER` on
  its first use — the enemies agent needs to add it:

  ```js
  addsCardsFn: (c) => [{ id: 'clutter', pile: 'discard',
                         count: countMoves(c, 'pack-wrong') === 0 ? 2 : 1 }],
  ```

- `rule` accepts an id string or `{id,name,text}`. **`ruleFn(c)`** is preferred,
  which is what the Greeter needs, because it alternates between NO RUNNING and
  ONE AT A TIME at Haunt 2 and the chip must name the one it is *actually* about
  to announce.
- Rule names resolve through a registry: `engine.registerRules([{id,name,text}])`,
  seeded automatically by `announceRule`, falling back to a humanised id
  (`no-running` → `NO RUNNING`) so an unregistered rule still reads as a name
  rather than a slug. `engine.resolveRule(idOrObj)` never returns null for an id.

Both fields feed `intent.tooltip`:

> Puts 2 Clutter into your discard pile.
> Announces a House Rule: NO RUNNING. Playing a fourth Trick this turn breaks the rule.

and both take part in `sameIntent`, so the chip re-renders when the count or the
rule changes. That comparison looks at what is **drawn** — `rule.name`,
`rule.text` and each card's display `name` — not just the ids, because
registering a rule's real text changes the chip.

`state.enemies[i].queue[k]` carries them too, for the Wink preview queue.

## 4. `retain` — the engine-side contract

Prompted by the renderer bug where `hand.discardAll()` at `turn:end` wiped
retained cards.

**The engine never empties the hand.** At end of turn, Ethereal cards Vanish,
Retain cards *stay where they are*, and everything else is discarded; at the
start of the next turn the fresh draw is **added** to whatever is still in hand.
So `state.piles.hand` is authoritative and continuous across the boundary, and a
retained Trick never generates a `discard` event.

The renderer must reconcile against `state.piles.hand`, never rebuild from "the
cards drawn this turn". There is now a test asserting the retained card is still
in `state.piles.hand` next turn, that the new hand is `drawPerTurn + retained`,
and that no `discard` event is emitted for it.

## For other agents

- **combat-scene** — drop the `desc` regex; read `counter.states` / `counter.state`.
  Drop the `addsCards`/`rule` lookups off the enemy def; they are on the intent now,
  with a resolved count and a resolved rule name.
- **enemies** — add `addsCardsFn` to Pack Wrong (and anywhere the count varies) and
  `ruleFn` to Door Greeter, so those chips are exact rather than merely honest.
  Optionally `engine.registerRules(...)` your rule table so a chip can show the
  real text before the rule has ever been announced.
- **companion-cards** — add `states: [...]` to the counters that have named bands
  (Loose Bones Whole/Scattered, Globs Runny, Glow Bright/Blazing, Height, Plump).
  `U.ensure()` is still correct and still needed; it is just no longer the *first*
  thing that creates the counters.
- **anyone calling `startCombat()`** — it completes synchronously. Do any loading
  (`loadContentRegistries`) before it.
