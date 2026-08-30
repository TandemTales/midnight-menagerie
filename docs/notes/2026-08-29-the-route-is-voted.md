# The route is voted, and two checks that could not have failed

2026-08-29, third session, second half. The map went onto the wire in the
morning; this is the mechanic that needed it.

---

## 1. Why this and not the balance item

The handoff I was given ranked "party cost is still 15–30 points from solo" as
the largest open item. `docs/STS2-REFERENCE.md` §8.5 disagrees, in writing, and
has since the day it was researched:

> `scenes/map.js` has no seat concept whatsoever … and `run.chooseNode(node)`
> asks nobody, so seat 0 picks the entire route for the whole expedition. This
> is the largest co-op gap we have and the only one on this list that is both
> buildable today and unaffected by the transport decision.

Two lists, two different top items, and the handoff's list did not mention the
reference's at all. Worth saying plainly for next time: **HANDOFF's open list is
not the only open list.** §8 of the reference carries its own "For us" verdicts
and nothing syncs them.

The balance item also reads weaker than its ranking once §8.3 is next to it.
StS2 scales enemy HP linearly with player count and **does not scale enemy
damage at all** — the reference's verdict on our matching design is "Keep it; it
needs no defending." Our 4p parties finishing with more Courage than a solo Kid
may be the same shape theirs finish in. Nobody has a number for how comfortable
an StS2 co-op fight ends, so "close the 15–30 point gap" has no source behind
it. It is not wrong to want it; it is wrong to call it the top item as though
the doc asked for it.

## 2. The mechanic, taken whole

Every player votes at every fork. A weighted roulette picks the winner. Ties
break randomly. The host has no special authority. **A minority vote can win**,
proportionally to how many wanted it.

- `ACT.MAP_VOTE { id }` — one seat's vote, decisive only when it is the last one
  owed. Exactly `ROOM_DONE`'s shape: every Kid sends the same verb and the last
  one closes the room. `ACT.MAP_CHOOSE`, one commit old, was renamed because
  "choose" is a lie about a ballot and nothing persists the wire value.
- `run.resolveVote()` runs on every client. The winner is not published by
  anybody, so there is no host and no answer to trust.
- A party of one is the degenerate case: one vote, one candidate, walks in.
  Every solo suite and every map-clicking driver in `tests/playthrough*` was
  unaffected, which is how you can tell.

## 3. The two checks that could not have failed

Both were written confidently, both passed, both were worthless until a control
killed them. This is the second and third time in one session.

**One.** Applying a whole-party act through `asSeat` is obviously wrong, so
`PARTY_ACTS` skips the borrow, and the check was that both clients end on the
same `localSeat`. It passed with `PARTY_ACTS` deleted. `asSeat` restores the
*applying* client's own seat — which `enterNode`'s `resetSeat()` had just chosen
anyway — so every client agrees either way. The observable difference is **who
pays**: `enterNode` calls `hurt(3)` on a sagging wing and `courage` is a
`PER_KID` accessor, so borrowing the sender's seat moves the damage onto
whoever clicked, identically on all four clients, where no digest reports it.

```
seat 1 chooses a sagging wing, courage before 64/43
  with PARTY_ACTS      64 -> 61    seat 0 pays        (both clients)
  without              43 -> 40    the clicker pays   (both clients)
```

**Two.** `resolveVote` skips the draw when the ballot has one candidate, and
the comment said that was what kept a solo run byte-identical. The test asserted
the master RNG had not moved. Neither could fail: the draw is a `fork(tag)`,
which builds a **separate RNG**, so it never touches the master stream however
often it is taken — and `weighted()` on a single item returns that item, so
skipping changes nothing at all.

The guarantee comes from the fork. The skip exists so `rolled` means something
to the screen. The check now asserts that a **split** ballot leaves the spine
alone, and dies the moment `this.fork(...)` becomes `this.rng`:

```
  and it comes out of a FORK — the master stream is untouched
      calls 0 -> 1, state MOVED
```

The general form, worth keeping: **for any "X is what protects Y", break X and
watch Y break. If Y survives, the credit belongs somewhere else.**

## 4. What the screenshots found that the tests did not

Two things, both invisible to every assertion in the repo.

**The blueprint came back blank.** Handing the sheet to the next voter rebuilds
the map scene, which replays the 820 ms survey draw-on plus `_whenVisible()`
waiting for three clean frames. Measured: `is-armed` with the ink at **0.02
opacity** for about three and a half seconds after every single vote — three
blank sheets per fork at four Kids. `params.drawn` skips the sweep for a seat
change only, deliberately not folded into `this.still` (reduce-motion), which
also stops the lamp, the pans and the visit stamp.

**The announcement was never on screen.** When a number overrides the vote the
party has to be told (rule 45). The verdict was painted from `map:voted`, which
`resolveVote` emits *before* it walks. Sampled at 200 ms intervals it was gone
before the first sample — `scenes.go` covers the screen **before** it calls
`exit()`, so the sheet is already veiled by the time anything is painted.

The fix is a beat in `resolveVote` before `enterNode`. That is a game beat, not
decoration: the roulette is a moment in StS2 too, it is deterministic, and no
state moves during it. It is skipped when there is no `ctx.scenes` — a headless
harness, a rejoining client replaying a log, `tests/vote` spinning 150 ballots,
which would otherwise spend three minutes animating nothing for nobody.

## 5. `tests/vote`, and why it is not in `tests/net`

`tests/net` has two Runs and a wire, and asserts the property lockstep needs:
the same ballot resolves to the same room on both machines. It **cannot** show
proportionality, because two seats voting differently is a coin flip whichever
way the weights work — plain majority rule would pass it.

So the roulette is measured at three seats over 150 seeds:

```
  and every ballot resolved to a room somebody voted for  102 majority + 48 minority of 150
  THE MINORITY SOMETIMES WINS — this is not majority rule  48/150
  one vote in three wins about one fork in three           32.0% against 33.3% expected, n=150
```

Control, majority rule instead of the roulette: `0/150`, `0.0%`.

## 6. Controls

| broken | what failed |
|---|---|
| majority rule instead of the roulette | minority wins 0/150, 0.0% vs 33.3% |
| the draw off `this.rng` | master stream: calls 0 → 1, state MOVED |
| no `votesPending` guard | one Kid's click moves the whole party |
| no `drawn: true` on the handoff | the survey redraws to change seats |
| `PARTY_ACTS` removed | the floor sags under the clicker, 43 → 40 |

## 7. Left open

- **A fork with one legal exit still opens a ballot** and resolves instantly.
  Harmless, and possibly the wrong feel — a designer's call.
- **The beat is 1.5 s.** Long enough to read the verdict in a screenshot, not
  playtested.
- **The map drawing tool** (§8.4's coloured route markers) is presence, not
  routing, and is untouched.
- `tests/coop/hotseat.py` walked into its first fight with one click and timed
  out at `#end-turn` until it was taught to vote. Any future harness that clicks
  a map node in a PARTY needs the same. The solo drivers do not.
