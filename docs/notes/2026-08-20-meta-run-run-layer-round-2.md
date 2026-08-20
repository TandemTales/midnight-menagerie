## 2026-08-20 — meta-run (run layer, round 2)

Owner: meta-run. Files touched: `state/run.js`, `scenes/{reward,event,shop,rest}.js`,
`scenes/reward.css`, `data/events.js`, `util/plural.js` (new), `tests/run/**`.

### Enemy deck interference was inert in real runs (STATUS_TRICK_DEFS)

Found by the balance agent. `scenes/combat.js`'s standalone deep-link path did
`engine.registerCards(lib.STATUS_TRICK_DEFS || [])`; `buildCombat()` did not. So
every `addCard('clutter')` / `addCard('drowsy')` an enemy made during an actual
expedition resolved to nothing — **Lost Luggage's and the Grand Coatcheck's whole
mechanical identity was free**, while looking perfect in a deep-linked fight.
Textbook CONTRACTS.md rule 9.

Fixed in `_buildCombat`, which now registers `allCards()`, `ENEMY_LIST` and
`_lib.STATUS_TRICK_DEFS`, with `ENEMY_STATUSES` and the companion keyword /
status registries loaded once in `warmCombatContent()`. Audited the rest of the
asymmetry: the run path is now a strict superset of the standalone path (it also
runs `loadContentRegistries`, which the standalone path never did).

Asserted against the **real** `run.buildCombat()` in `tests/run/index.html` →
"content registries (the real buildCombat path)": `clutter` and `drowsy` resolve
as cards, `dust-bunny` and `coatrack-crawler` resolve as summons. Measured 447
card defs / 37 enemy defs on the live path.

### The blocker: quitting mid-Scuffle no longer skips the fight

**What was wrong.** `enterNode` marked the node visited on the way *in*, and
`resumeScene()` explicitly sent an unfinished fight back to the blueprint. So a
reload during any combat — including the Butler — returned the player to the map
with the node cleared, full Courage, no reward and no damage. `scenes/map.js`
also writes `run.visitedIds` optimistically before it calls `chooseNode`, so
simply not pushing was not enough.

**Semantics chosen: resume INTO the fight, with a verified fallback.**

- A room is now **entered** on the way in and **cleared** only when it resolves.
  `_markEntered()` actively removes the node the map optimistically added;
  `_markCleared()` is called from `leaveNode()`, `claimReward()` and a won fight.
  `visitedIds` is therefore the *cleared* set, and an unfinished room comes back
  standing.
- `pendingCombat` (serialised) carries the fight's identity — node, type, tier,
  encounter id, the `encounterHistory` length at entry so the roll reproduces,
  and the Courage the player walked in with — plus a log of every player action.
- On `run:continue`, `restoreInterruptedCombat()` rebuilds the engine from the
  same `fork('combat:<node>')`, calls `setChoiceScript(pc.choices)` and replays
  the action log. The replayed board is checked against a digest (turn, phase,
  player HP/Guard/Nerve, every enemy's HP/Guard/alive, the hand, pile sizes)
  before it is trusted. **Mode `replay`** puts the player on the exact board they
  left. Anything unverifiable — a card the log could not name, a diverging
  digest, a throw — falls back to **mode `restart`**: a fresh instance of the
  *same* encounter at the entry Courage. Neither mode clears the node or grants
  a reward.
- Actions are recorded off the public event stream (`card:play`, player
  `turn:end`, `snack:used`), never by patching the engine. Cards are identified
  by a **stable key**, not by uid: deck cards get `d<index>` from the pile order
  at construction, cards created mid-fight get `x<n>` from `card:add` order.
  Engine uids come from a module counter and do not survive a reload; these do.
- Saves during a fight are debounced 120 ms so `localStorage` is never written
  inside an animation frame, and flushed on `pagehide` / `beforeunload` /
  `visibilitychange` and at every turn boundary, so a reload keeps everything.

**The race, and why it is closed.** `scenes/title.js` emits `run:continue` and
then navigates *synchronously* using the saved `scene` field. The rebuild is
async, and if it lost, `scenes/combat.js` would build a stand-in engine with the
starting deck. Fixed by pre-warming: `warmCombatContent()` (exported) loads
`combat/engine.js`, `data/enemies/index.js`, `combat/statuses.js`,
`data/keywords.js`, `data/enemies/_lib.js` and runs `loadContentRegistries(null)`
once — at install time when a resumable save exists, and again on `run:start`.
With the modules cached the whole rebuild is a pure microtask chain, which drains
before the scene manager's cover transition reaches its first frame.
`_ensureCombatOnScreen()` is the belt and braces: if the screen ended up
anywhere else, or on a combat scene holding a different engine, it re-enters
combat with the real one. It **polls** rather than listening for
`scene:entered` — `SceneManager.go` drops a navigation while another is in
flight, and `scene:entered` is emitted before `busy` is cleared, so a `go` fired
from that event is dropped too. Real failure this caught: clicking Continue
while the title screen's own entrance transition was still running dropped both
the title's navigation and the fallback, and the player sat on the title screen
with a perfectly restored fight behind it. Bounded to ~2.5 s and it stops the
moment `run.combat` changes.

**The one thing replay still needs from combat-scene, and the self-heal.** A
replayed engine is rules-correct the moment it is rebuilt, but
`scenes/combat.js` fills its hand purely from `draw` events — a resumed engine
already holds its hand and will never emit those, so a replayed fight currently
renders with an *empty hand*: mechanically perfect, unplayable to look at.
Measured in a real browser: engine hand 5, cards on screen 1. Rather than ship
that, `_auditResumedCombat()` reads the scene's own public `Hand.cards()` 700 ms
after the fight is on screen (read-only, mutates nothing) and, if the hand did
not make it to the screen, drops the replay for a fresh instance of the same
encounter — which renders correctly, because the scene starts that one itself.
So **`restart` is what ships today and `replay` is what ships the moment
combat-scene seeds its hand**; there is no flag to remember to flip. The replay
path itself is complete and green headless (3/3 exact board matches).

Regression test: `tests/run/index.html` → "quitting mid-Scuffle does not skip the
fight" (3 seeds; reports as `mid-fight  3/3 … (3 exact replays)` in
`tests/run/run.py`). It walks into a fight, plays part of a turn, JSON
round-trips the real save, resumes, and asserts the node is not in `visitedIds`,
there is no `pendingReward`, `resumeScene() === 'combat'`, the encounter matches,
and Courage never exceeds the entry value.

### Stats

- **DAMAGE DEALT 0.** Nothing ever added combat damage to the run —
  `engine.stats.damageDealtThisTurn` is per-turn and (separately) never
  incremented, so there was no total to read. The run now accumulates
  `stats.damageDealt` from `damage` events whose `sourceId` is the player and
  whose target is not, using `hpLoss`. `end()` also folds it into
  `Save.data.stats.damageDealt`, which the Clubhouse reads and which nothing was
  writing either. Abandoned-attempt damage is un-banked when a fight restarts.
- **"Deepest floor 5" vs "REACHED Floor 1".** One ambiguous name for two
  numbers: `run.floor` was the wing index (correct for map.js's "Wing 1 of 17")
  while `stats.floor` was room depth, and the Clubhouse and Game Over each read a
  different one. Now `run.wing` (region ladder) and `run.depth` (rooms deep,
  cumulative across wings, `= regionIndex * rows + row + 1`) are separate and
  named; `stats.floor` is renamed `stats.depth`; `run.floor` remains a documented
  alias of `wing`. `end()` writes `bestFloor` from `depth` and passes
  `floor: depth, depth, wing` to the Game Over scene, so both screens print the
  same number. (See the ask below for the kicker line.)
- **Aliases.** `hp` / `maxHp` / `gold` / `relics` / `potions` / `regionId` /
  `floor` are now documented compatibility **getters over the canonical field** —
  and the snapshot no longer carries duplicate `hp`/`maxHp`/`gold` keys next to
  `courage`/`maxCourage`/`lostThings` (`resume` still reads the old keys, so
  saves from earlier builds load). `relics` in the snapshot is now `keepsakes`,
  same fallback.

### Pluralisation

New shared helper: **`game/src/util/plural.js`** — `plural(n, one, many)`,
`word(n, one, many)`, `pluralOf(one, many)`, and `fixNumberedNouns(text)` for
text whose numbers were substituted after the noun was authored. Mass nouns
(Courage, Nerve, Guard, Lost Things) are deliberately never touched, and
`fixNumberedNouns` works off an allowlist so prose cannot be mangled. Used in
`reward.js`, `event.js`, `rest.js`, `shop.js`. The remaining occurrences are in
other agents' files — see the asks.

### Curiosities are no longer blind gambles

All **54** option affordances in `data/events.js` rewritten. They now name the
*kind* of thing at stake using the player's own nouns — Courage, maximum
Courage, Lost Things, a Keepsake, a Trick, a Snack, a Clue, a Curse in your deck,
a fight / a Big Scare — while keeping which authored outcome you land on hidden.
`RISK You might find it / GAIN You might find it` is now
`RISK Courage · GAIN Clues, maybe maximum Courage`. **No prose was changed** —
only the two affordance lines per option. The vocabulary and the house rules for
writing new ones are documented at the top of `data/events.js`.
`scenes/event.js` also labels the pair `risk`/`gain` when an option has several
outcomes and `costs`/`always` when it has exactly one, so a bet and a price no
longer look identical on the button.

### Snacks

`Run.useSnack(index, targetId)` and `Run.canUseSnack(index, targetId)` added —
the counterpart `addSnack` never had. It owns the inventory only: it validates
through `engine.canUseSnack`, removes the Snack (spent when eaten, win or lose),
emits `run:snack`, saves, and then awaits `engine.useSnack(snack, targetId)`.
Combat-only by design; outside a Scuffle there is nothing to resolve against.

**Snack prices retuned.** The old table was flat (55–75 for everything), set
while Snacks were unusable, so Cold Milk cost the same as +2 Nerve. Measured
against the purses, which are already at StS parity (Scuffle 11–19, Big Scare
26–36, boss 92–108; shop Tricks 55/85/145 ±12), the ladder is now three tiers:
**45** for one clean effect (Gummy Bat, Liquorice Rope, Cold Milk), **65** for
fight-swinging (Popping Candy, Jawbreaker), **80** for turn-changing (Sherbet
Fizz, Stubborn Toffee). With `shopStock`'s ±8 the shelf runs 37–88 against StS's
48–115 — deliberately a shade cheaper, because this build's fights are shorter
and a Snack has fewer turns to pay for itself.

### Clues and Luck are visible now (partially)

Both were awarded and shown nowhere. The four room screens now add Clue and Luck
chips through `ui/hud.js`'s public `addChip()` (`RoomScene._buildHudExtras`), so
they are at least honest on reward / shop / rest / event. The map and combat
still do not show them — see the ask.

### Asks for other owners

- **frontend (`scenes/gameover.js`)** — line ~164 `hash('floor', run?.floor)`
  now receives a correct `floor` param, so "REACHED Floor N" agrees with the
  Clubhouse. The **kicker** at ~252/256 (`Expedition ${s.floor}`) means the wing,
  not the depth: please read the new `wing` param there. Also line ~283,
  "`${count} ${TERMS.relic}s, left on the floor`" prints "1 Keepsakes" —
  `import { plural } from '../util/plural.js'` and use `plural(n, TERMS.relic)`.
- **frontend (`scenes/clubhouse.js`)** — no change needed; "Deepest floor" now
  reads a `bestFloor` that means depth, and "Damage dealt" now has a number.
- **card-feel (`ui/card.js`)** — the biggest pluralisation win is one line.
  `_renderRules()` substitutes `{n}` into authored text, which is the only place
  that knows the count, so `Draw {n} Tricks` prints "Draw 1 Tricks". There are
  **46** such `{x} <plural noun>` strings across `data/neutral.js` and
  `data/companions/{marmalade,bones,pipkin,taffy}.js`. Running each finished line
  through `fixNumberedNouns()` from `util/plural.js` fixes all of them without
  touching a single authored string.
- **ui-chrome (`ui/hud.js`)** — please carry Clues (and Luck when > 0) natively,
  so they show on the map and in a Scuffle, not just on the room screens.
  `run.cluesFound` and `run.flags.luck` are the sources. Also line ~400,
  "`View your ${deck.length} Tricks`" and `ui/deckview.js` ~223
  "`${total} Tricks`" want `plural()`.
- **combat-scene (`scenes/combat.js`)** — two things. (1) `_makeEngine`'s
  standalone path does `const rng = ctx.run?.rng || new RNG(seed)`, which draws
  from the run's master stream; it should be `ctx.run.fork('combat:' + node)` so
  a deep-linked fight is reproducible and cannot shift the map. (2) `_useSnack`
  still applies effects by hand and splices `run.snacks` directly. Please switch
  to `run.useSnack(index, targetId)` + `engine.useSnack`. Until you do, a fight
  in which a Snack was eaten cannot be exactly replayed on resume — the run
  detects the mismatch by digest and restarts the same encounter instead, which
  is safe but loses the fight's progress. (3) **The one that turns exact resume
  on:** `_buildHand()` never seeds from the engine, so a resumed mid-fight
  engine renders an empty hand. One line, next to the `Hand` construction:

      if (this.engine.started && this.engine.piles.hand.length) {
        this.hand.draw(this.engine.piles.hand.map(c => this._handCard(this.engine.cardSnap(c))));
      }

  `_syncAll()` does not cover it either — it syncs the player, the enemies, the
  piles, Nerve and playability, but never the hand's contents. Until this lands,
  every mid-fight resume silently downgrades from an exact replay to restarting
  the same encounter.
- **map (`scenes/map.js`)** — `_choose` writes `run.visitedIds` /
  `currentNodeId` / `pathIds` directly before calling `chooseNode`.
  `run.enterNode` now undoes the `visitedIds` part on purpose (a room is cleared
  when it resolves, not when it is walked into). Nothing is broken, but the
  optimistic write is now redundant and it would be cleaner to drop it and let
  the run own that field.

Green at hand-off: `tests/run/run.py` 50 runs / 0 errors,
`tests/seams/check.py` 1570 checked / 0 problems, `tests/seams/proof.py` 52 / 0.

---
