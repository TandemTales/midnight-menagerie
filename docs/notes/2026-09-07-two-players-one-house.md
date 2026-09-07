# Two players, one house

2026-09-07. "Does this work with multiplayer yet, and what can be fixed before
the Steam App ID arrives?" The answer to the first is *mostly*, and finding out
turned up two real desyncs that predate everything in this session.

---

## The principle, because every bug here is one violation of it

**A co-op run must be a pure function of the shared roster and the seed.**
Anything a client reads out of `Save.data` while building or running the
expedition is a divergence vector, because two players do not have the same
save.

The seed never had this problem and shows what right looks like: it is derived
from the room code by a pure function every client runs
(`seedFromRoom`, FNV-1a with `Math.imul`, and its comment says "this has to be
exact on four machines").

## What was diverging

Measured with two clients in one room, different lifetime progress:

    Haunt level     4  vs  0     `scenes/lobby.js` called Save.hauntLevelFor()
    rescue pool     9  vs  15    `Run`'s constructor seeded from companionsRescued

The first is the serious one. **Haunt scales enemy stats, so the two machines
simulate different enemies from the first fight.** The second means
`rescueTargetFor` frees a different Companion from the same boss — 3 of 4 shared
decisions differed in the probe.

    what                veteran      rookie
    graveyard boss      pudding      pudding      (agreed: authored, both missing)
    lampworks boss      taffy        wisp         DIVERGES
    ballroom boss       pipkin       crumbula     DIVERGES
    a Rescue room       crinkle      pudding      DIVERGES

The Rescue *room* is partly saved by accident: `ACT.EVENT_RESCUE` carries the
slug, so whichever client clicks broadcasts its answer and the applied state
agrees. Only the displayed name differed. The **boss** path has no such luck —
`completeRegion()` calls `rescueCompanion()` directly on every client.

## The fix, and the line it does not cross

`haunt` and `freed` are announced in the lobby and frozen into the roster at
`Lobby#start()`. Seat 0 anchors both, for the same reason it anchors seat order:
`players` is already sorted identically on every machine, so every client
freezes the same values without anybody publishing an answer. **That it is the
host's ladder and the host's house is a design choice**, and it is stated as one
in the source rather than dressed up as a derivation.

`rescued` stays local and had to. It is what `rescueCompanion` no-ops against
and what merges into YOUR save at run end — seeding it from somebody else would
hand a new player another player's whole roster on their next run. So the shared
*decision* draws from a new `freedRoster` (the party's agreed view) while the
local *effect* stays yours. `rescueCompanion` advances both, so a second rescue
in the same run cannot pick the same Companion on one machine and not the other.

Solo passes nothing and gets `rescued`: determinism 5/5, byte-identical.

## Two more, found by looking rather than by failing

**The Backpack you packed never reached a co-op run.** The Clubhouse editor
writes `Save.data.backpacks[kid]`; the roster carried only a Companion and a
Kid, so every co-op Kid walked in on the default loadout while the same player's
solo run used what they had packed. It travels per SEAT now, unlike haunt and
freed — it belongs to the Kid you brought, not to seat 0.

**`startRegion` would have split the party across two wings.** Nothing passes it
in co-op today, so nothing was broken. But `new Run` validated it against
`canChooseEntry()`, which reads *this machine's* save — so the moment anyone
wires the entry choice into the lobby, a player who had cleared the Foyer would
accept the wing and one who had not would fall back to the front door. The
unlock is a LOCAL fact and the start is a SHARED one; they are two inputs now.

## The lesson that cost the least and is worth the most

The first Backpack assertion was *"both tabs agree"*, and it did **not** catch
dropping the pack from the payload — both machines get the default, so they
agree perfectly while both are wrong.

**A determinism assertion cannot see a feature gap.** There is a second
assertion now that the packed loadout actually ARRIVED. I only found this
because I regressed the code on purpose to check the gate could see it, which is
the entire reason for doing that and not a formality.

## Making Steam checkable instead of hopeful

`net/transport.js` states its contract in prose and says the quiet part out
loud: *"Neither is guaranteed by every real transport. Steam's P2P has reliable
and unreliable channels; the session's traffic must go on a reliable, ordered
one."*

The contract is executable now. Add a transport to `WIRES` in `tests/net` and it
is held to what `Session` actually relies on: per-sender order, no
self-delivery, a working unsubscribe, an idempotent `close()` that stops
delivery, and a message that crosses unchanged. 21 checks across three
transports; **`SteamTransport` is one line in that list when it exists.**

### The rule a loopback cannot be trusted on

`LoopbackHub._deliver` hands every peer the **same object reference** — no copy,
no serialisation. So anything JSON cannot represent (a Map, a Set, a class
instance, `undefined`) passes every test in the repo and changes shape the first
time it crosses a real wire.

So I measured before writing the rule. Two real Sessions over a real Run:
**7 messages, three shapes — hello `k,seat,seed`, input `k,seat,turn,seq`, ack
`k,i` — every one identical after a JSON round trip**, with no Maps, Sets,
classes or functions anywhere. The wire format is already Steam-safe. The point
of the rule is that it stays that way.

## What multiplayer does and does not do today

**Works.** The wing fork is option-count agnostic — it tallies whatever seats
voted for and settles a split with a seeded weighted roulette, so opening the
route from 2-3 doors to 15 needed no netcode change at all. Rooms, rewards, the
turn barrier, seat handoff, digest-based desync detection, two-tab lobby.

**The way in is a VOTE now, and co-op has it.** Written up below.

**Solo only, by design.** The painted Kid board is the first-run opening; co-op
picks its Companion and Kid in the lobby.

**Still blocked on the App ID.** `SteamTransport` cannot be written without it,
and a wrapper shell cannot exist inside a no-build browser project. Everything
above is what could be done without it.

## Gates

    38 x tests/*/check.py       all green
    tests/net/run.py            158 -> 179 passed
    tests/coop/run.py           645 passed
    tests/coop/lobby.py         20 -> 27 passed
    tests/run/run.py            50 runs, 1 error (the documented one)
                                determinism 5/5 — solo is byte-identical
    tests/vote/run.py           35 passed

Both new gates were proved to see. Reverting `scenes/lobby.js` to read local
save turns four red at once — `0 / 4`, `'' / 'boggle,crumbula,…'`, `15 / 9`,
`'wisp' / 'brambleboo'`. Dropping the Backpack from the payload turns the
arrival assertion red while the agreement assertion stays green, which is the
whole reason both exist.


---

# The party votes on the way in

Added the same day, after the above. The open design question — *who chooses
where a co-op expedition begins* — had an answer sitting in the codebase
already: **the mid-run fork votes, so the way in is a fork.**

## It is not a new mechanism, it is `ENTRY_STEP = -1`

`Run` opens a fork at a negative step instead of committing to the front door.
Negative because `regionIndex` is 0 for the first wing, so a choice made BEFORE
it has to sort before it. Everything else is the existing machinery: `voteWing`,
`resolveWingVote`, `ACT.WING_CHOOSE`, the atlas's ballot, the seeded weighted
roulette, the pass-the-sheet handoff. Everybody votes, the host has no special
authority (STS2-REFERENCE §8.5), and a party of one short-circuits on its own
first vote and takes no number — so solo stays byte-identical to its seed.

**It deleted more than it added.** `scenes/atlas.js` lost its bespoke `enter`
mode, its `startPayload` and its `canChooseEntry` import; `scenes/select.js`
lost the atlas hop and now starts the run and asks `run.openingScene()` where to
go. Co-op needed one roster field and got the feature for nothing.

`enterRegion` is separate from `advanceRegion` on purpose: crossing increments
`regionIndex` and heals the party for the wing behind them, and neither is true
of walking through the front door. **Beginning in the Kennels is still wing one.**

## And the last local-save read left run construction

`entryUnlocked` was falling back to `canChooseEntry()` — this machine's save,
the same class as the Haunt level and the rescue pool above. Two ways it bites:
two clients disagree about whether there is a fork at all (one votes, the other
walks into the Foyer), and any headless driver that clears the Foyer once starts
getting a fork it never asked for. It is explicit-only now, and the run gate
asserts that a caller who says nothing gets the front door whatever the save
holds.

## Three bugs found by running it, not by reading it

- `enterRegion` validated against `pendingWing`, which `resolveWingVote` has
  already nulled by the time it crosses — **every vote fell back to the Foyer.**
  It validates against `entryOffer()`, a pure function of the roster.
- The tally read "1 of 6 wings crossed" on a run that had crossed nothing, and
  the plaque read "The Way On", both because a way-in fork is also `choosing`.
  `entering` is asked first in both.
- The screen-reader line would have said "A way on from here: **null**", because
  a way-in option carries no `why` — there is no wing to come FROM.

## The measurement trap that looked exactly like a broken feature

Reading the four-seat result 120 ms after the vote reported *everyone is still
in the Foyer*. That is `VOTE_BEAT`: `_crossAfterVote` holds **3 seconds** when
the roulette overrode somebody, so the party can SEE the verdict card — and
`get ctx()` falls back to `window.MM?.ctx`, so the beat really does run in a
page-hosted harness. Wait past it; do not race it.

## Gated at four seats, with a split

Two for the Kennels and two for the Graveyard, because that forces the roulette
— and `rolled` is asserted, or the gate would be testing a unanimous vote by
accident. All four open the fork, all four land in the Graveyard, same route,
same map, `regionIndex` 0.

    tests/net/run.py    179 -> 190 passed
