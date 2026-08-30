# The map was writing the Run, and the call that looked like the API was a no-op

2026-08-29, third session. One item: the last screen not on the wire. It turned
out to be three defects stacked, and the guard I wrote for the third one was
vacuous until a control killed it.

---

## 1. What the handoff said, and what was actually there

The previous session's handoff opened its list with:

> **THE MAP NEVER REACHES `net/actions.js`.** It writes the shared route
> straight onto the Run — `scenes/map.js` never imports the applier, `_choose()`
> assigns run fields directly, and there is no verb for it.

All true. What it missed is that `_choose` *also* called `run.chooseNode(node)`,
which reads exactly like the run layer's own API being used properly:

```js
if (m.run) {
  m.run.currentNodeId = id;
  m.run.pathIds = m.path.slice();
  if (typeof m.run.chooseNode === 'function') { m.run.chooseNode(node); return; }
```

and `chooseNode` opens with

```js
const id = typeof node === 'string' ? node : node?.id;
if (!id || id === this.currentNodeId) return;    // already handled by the bus
```

The screen sets `currentNodeId` on the line above, so that guard is **true on
every click**. The call was a guaranteed no-op, and its doc comment in
`state/run.js` said "The map screen calls this directly (see scenes/map.js
`_choose`)" — describing a call that had never done anything.

The work was being done by a bus listener at the bottom of `state/run.js`:

```js
bus.on('map:choose', (node) => { ... run.enterNode(node.id); });
```

Measured before touching anything, by wrapping both methods on the prototype in
a real two-Kid run and clicking a room in the browser:

```
clicked: foyer-0-1
  ['enterNode',   'foyer-0-1', 'was:null',      'now:foyer-0-1', 'moved:true' ]
  ['chooseNode',  'foyer-0-1', 'was:foyer-0-1', 'now:foyer-0-1', 'moved:false']
```

So: the one screen that decides where the **whole party** goes reached the run
layer down a bus name, and the call that made it look otherwise moved nothing.

**Nothing in this repo could have caught it.** `tests/seams/check.py` finds
silent no-ops at module joins by looking at *calls* — an optional call on a
contract API, an option key nobody reads, a method that does not exist. An
assignment has no verb to be missing. `run.currentNodeId = id` is syntactically
perfect, semantically shared-state mutation, and invisible to all five shapes.

## 2. The fix

`ACT.MAP_CHOOSE { id }` — renamed `ACT.MAP_VOTE` the same day, when the
route became a ballot — named by the node's **authored** id — `foyer-0-1` means
the same room on all four clients because they all generate the blueprint from
the same region and seed. (The header of `net/actions.js` already argues this
for cards; a map node is the easy case, since it never had a uid.)

- `scenes/map.js` imports `act`/`ACT`/`INPUT` and sends the input. It no longer
  writes `currentNodeId` or `pathIds`.
- The `map:choose` bus listener in `state/run.js` is gone. The event is still
  emitted, and it is `audio.js`'s alone now — it plays the door.
- `run.chooseNode` is where the verb lands, and its doc says so.

## 3. Two things fell out that were not in the brief

**`__in` was in every save.** The map screen's route array starts with `ENTRY`,
a pseudo-node standing for the doorway you came in through, so the very first
step forms a pair and inks the way-in arrow. That array was assigned onto
`run.pathIds` whole — so a node id that `nodeById` cannot resolve was in the
run's route and in `snapshot()`. Removing the assignment removed it, and took
the arrow with it:

```
             run.pathIds                    model.path             edgeWalked
before   ['__in', 'foyer-0-0']    ['__in', 'foyer-0-0']                1
after    ['foyer-0-0']            ['foyer-0-0']                        0
```

Measured, not assumed — including a checkout of `HEAD` to establish the
baseline, because "it looks like it should still work" is how the last three
sessions each lost a round. The screen prepends its own sentinel now
(`_route()`), old saves that already start with `__in` are left alone, and the
arrow is back at 1.

**`run.map = map` was a second map generator.** `_buildModel` had
`if (run && !run.map) run.map = map;`, handing the screen's own generated
blueprint back to the Run. It never fired — a `Run` builds its map in the
constructor and again in `advanceRegion` — but if it ever had, it would have
handed over a *different* map: `run._buildMap()` passes `companionsFreed` and
the screen's call cannot. Removed.

## 4. The guard I got wrong, and the control that said so

`applyInput` wraps every act in `run.asSeat(msg.seat, …)`, because every other
act works on `run.local`. A whole-party act should not be applied as a seat, so
`PARTY_ACTS` skips the borrow — and the check I wrote for it was that both
clients end on the same `localSeat`.

**That check passed with `PARTY_ACTS` deleted.** `asSeat` restores the
*applying* client's own seat, and on a blueprint every client's seat is already
the lowest living Kid because `enterNode` ends with `resetSeat()`. The restore
puts back the value `resetSeat` had just chosen. Both clients agree either way.

What actually moves is **who pays**. `enterNode` bites for the hazard wings:

```js
if (node.payload?.hazard === 'sagging') this.hurt(3);
```

`courage` is a `PER_KID` accessor, so `hurt` lands on whoever the seat is.
Without the guard that is the **clicker** — consistently on all four clients, so
no digest would ever report it, and the wrong Kid quietly pays for the rest of
the run. With it, the first living Kid, which is what the screen has always
done.

```
seat 1 chooses a sagging wing, courage before 64/43

  with PARTY_ACTS        64 -> 61   seat 0 pays          (both clients)
  without                43 -> 40   the clicker pays     (both clients)
```

> **Corrected the same day, by an adversarial review of this note's own commit.**
> This control has been retired and the paragraph above is the reasoning it was
> retired for. Two things moved underneath it:
>
> 1. At ONE KEYBOARD the claim was simply false. The vote handoff walks
>    `localSeat` onto each successive voter, and `enterNode` charged the wing
>    *before* `resetSeat()` — so the floor sagged under the Kid who voted LAST,
>    not the first Kid. Measured in the real game: `[68, 74] -> [68, 71]`. The
>    suite could not see it because on a wire nothing moves the seat, which is
>    the only configuration it exercised.
> 2. Charging ONE Kid was itself the bug. With `resetSeat` correctly leaving a
>    networked client on its own seat, `this.hurt(3)` charges a different Kid on
>    each machine — `61/43` on one, `64/40` on the other. A real desync.
>
> `enterNode` calls `resetSeat()` first now, and the wing charges every Kid who
> walks in, which is what mapgen's rule says. The control that replaced this one
> is the ENGINE's seat: `_buildCombat` passes `localSeat` to the engine as
> "which Kid is at THIS screen", so a borrow makes seat 1's client build its
> fight as seat 0. See CONTRACTS 52.

## 5. The gate

A sixth shape in `tests/seams/check.py`: **SHARED-WRITE**, any assignment to a
`Run` field from `game/src/scenes/` or `game/src/ui/`. The field list is read
out of `state/run.js` — the constructor's own `this.x =` plus the `PER_KID`
array — so it cannot drift from the class it describes, which is the rule the
other five surfaces in that file already follow.

The receiver is `run`, anything ending `.run` (`this.run`, `ctx.run`, `m.run`),
or a local alias assigned from one (`const r = this.run`, which `rest.js:139`
and `event.js:72` both use — `reward.js` uses `const run = this.run`, which the
bare name already covers). Missing the alias would have meant checking two of
the room screens against nothing. The first version of that regex also matched
a PREFIX of the right-hand side, so `const c = this.run.combat` registered `c`
as a run alias too; it requires the expression to END at `run` now.

Two self-inflicted lessons went into it:

- The **first** version of `run_fields()` did `code.index('{', i)` after
  `constructor(` — and the signature is `constructor(cfg = {})`, so it found the
  default argument's braces and returned an empty set. The check passed against
  nothing. It reports its own surface collapsing now (`< 20` names is a broken
  extractor, not a clean tree).
- `self.sites += 1` was after the filters, so the gate contributed **zero** to
  the printed site count. A gate that only counts when it finds something reads
  identically to one that never opened a file (CONTRACTS 5c). Counted before the
  filters now: 3842 → 6165 sites.

## 6. Controls

Every one verified to fail:

| broken | what failed |
|---|---|
| `PARTY_ACTS` line removed | the floor sags under the clicker, 43 → 40 *(retired — see the correction in §4)* |
| `ACT.MAP_CHOOSE` case removed | route does not cross; 4 `unknown room act` errors |
| the old direct run-writes restored | SHARED-WRITE ×2 in `scenes/map.js` |
| `run_fields()`'s brace index broken | "returned only 14 names" |
| the doorway prepend removed | `edgeWalked` 1 → 0 after a rebuild |

Green after: net 136/136, map 29/29, run 50 runs / 0 errors, coop 645/645,
combat 689/689, coop rooms / hotseat / playthrough clean, all eight static
gates.

## 7. What this says about the next round

The handoff I was given led with this item and described it accurately as a
latent desync. It was that — but the part that mattered was that **a call which
is present is not a call that does anything**, and the source, the doc comment
and the module's own architecture note all read as though the map used the API.
Three separate places asserted a thing that one browser probe disproved in
thirty seconds.

The previous session's lesson was "when a measurement surprises you, suspect the
instrument". The version of it that would have saved this round is narrower:
**when a document states that a call happens, check that it does something.**
