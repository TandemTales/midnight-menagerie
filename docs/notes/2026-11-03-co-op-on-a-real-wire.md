# Co-op on a real wire

Audited 2026-11-03 for a Steam demo. Every suite was green. Everything below would
still have gone wrong between two computers, because a two-tab test on one machine
has no latency worth the name, and nobody in those tests ever leaves.

## What was wrong

| What a player would have seen | Why |
|---|---|
| A friend's connection drops. Everyone else's game stops answering. No message, ever. | Nothing in `game/src` listened to `session.on('peer')`; the turn barrier and END waited on the missing seat forever. |
| Two players' boards quietly become two different games. | `publishDigest()` had tests and no caller, so the out-of-sync check never ran in real play. |
| Two players act within one network delay of each other and their boards split. | Each machine applied its own Trick at once and the other's on arrival. The code's own comments left this "until the transport sets the latency budget". Steam sets it. |
| Continue on a co-op save turns it into one person playing everybody's Kid, while the friends wait. | The run resumed with no session. There was no path back to the party. |
| A slower player is pulled out of the shop or reward they are still reading. | A door with one exit resolved on the first vote, a shortcut meant for one shared screen. |
| Two parties built from one seed. | Every client derived the roster from its own rows when GO landed, and messages are only ordered per sender. A third player could hear GO before a friend's last change. |
| Somebody with the password arrives after the party left, and waits in an empty treehouse forever. | A running Session ignored lobby messages. |
| The host drops, and a later rejoin could not have been answered. | Only seat 0 answered `REJOIN`. |
| Alt-tabbing stalls that player's client partway through the table's inputs. | Window blur stops the clock, right for a solo game and wrong for a shared one. |
| Two machines on different map styles draw different wings from one seed. | `mapStyle()` reads each machine's own storage. |
| A player stays on the map with a fight running behind them. | `SceneManager.go` drops a navigation while another is in flight, and over a wire a door is opened by somebody else's vote, whenever it lands. Found only when a real two-tab fight ran. |
| A fast player's first card is lost on a slower machine, and the boards split. | The scene starts the fight after its door and any boss's entrance. An input arriving before that found no card and returned. It waits now (`run.readyForCombatInput`). |
| **A built depot does not start.** | The packager shipped tracked files only. Codex's uncommitted modules (`state/floorplan.js`, `ui/story.js`, `core/motion.js`...) would have been missing, with imports still pointing at them. |
| A rejoin mid-fight in a party could not have replayed. | `turn:end` fires once per seat and was recorded as a bare `['e']`, replayed as "the whole table ends", so seat two's entry ended the NEXT turn. `courageOnEntry` is the local Kid's only, so the other seat's Courage came back wrong. |

## What it does now

**The agreed order** (`session._heldByBarrier`). Every input carries a Lamport clock
and the log sorts on it, seat breaking ties. A combat input is applied once every
other seat has promised (`clk` on a beat) never to send a lower one. Seats ack every
combat input they hear, so that wait is one round trip, not a beat interval. All
machines apply the same inputs in the same order, with no host and nothing to fail
over. **The cost is that a player's own Trick lands one round trip after they let
go.** Room inputs commute and are not held.

**Who is still here** (`session.lost`, `session.gone`, `ui/netplate.js`). A seat is
`lost` when Steam says it left the lobby or after 15 s of silence. The plate says so
and offers **Play on without them** or **Leave the expedition**. Playing on is an
input in the log (`seat.gone`), so every machine applies it in order. That seat
stops being a voter, its open question gets the deterministic rule, and its Kid goes
down at the top of the next turn. Later fights are priced without them. They keep
their Courage and any waiting reward.

**Climbing back in** (`scenes/lobby.js`, `session.requestState`). Continue on a co-op
save goes to the Treehouse with the save's password and Steam lobby id. A running
session answers `lobby:started`; if the roster names them, a survivor sends a
snapshot and the log. The answer is a SAVE and not the log alone, because each client
leaves a room in its own time and that walk is not an input. `Run.resume` stands the
run up, `restoreInterruptedCombat` replays the fight, and a replay that does not land
on the same board fails loudly instead of restarting (a restart would strand the rest
of the party). If nobody is home, **Open the house back up** resumes from the save,
and two players returning together agree that the lowest seat opens it.

**Lost messages.** A beat names how many inputs its seat has sent, so a shorter count
here is a gap, and it gets asked for again. Everybody answers rejoin and resend
requests. `_accept` dedupes on (seat, seq).

**The check runs.** A board digest at each `playerReady` and a party digest at each
room. The plate tells the player if they split and offers Leave and climb back in.

## What a whole walk found (2026-11-04)

`tests/coop/demo_walk.py` plays the demo from the lobby to the ending with up to four
real tabs on a 60-180 ms wire, pressing what a player can press. It takes about three
hours. Every suite above was green when it found these, and none of them could have:

| What a player would have seen | Why |
|---|---|
| **The whole table freezes, for good, solo as well.** | House Guest moved Bite Marks "until none are left" onto a Porcelain Twin, and Joined copied each one straight back. It counts first now. Under every other Trick, the engine stops an effect at 2000 events and the turn goes on: counted rather than timed, so every machine stops at the same event. |
| **The boards split a few fights in.** | Answering a chooser moves nothing on the board, so the queue walks past an answer without waiting for anybody. A friend's Trick with the same clock sorts behind it, was taken for late and went straight through: in arrival order on the machine that answered, the agreed order everywhere else. That is why only the answering seat ever reported it, and only about lower seats. Behind nothing but answers it is not late, so the cursor steps back and it waits its turn. |
| **You choose a card and your friend draws it.** 58 Tricks. | `_asSeat` ended at a Trick's first `await`, so everything after a chooser ran as seat 0. Every machine agreed, so no out-of-sync check could see it. The seat now holds until the Trick ends. A second question went to the host for the same reason, and Papermaking looked for its card in the wrong hand forever. |
| **The next input lands either side of a chooser's answer.** | `c.discard(1, { choose: true })` is a promise nobody awaited, so the Trick finished while its question was open. A Trick is not over now until all it asked has been answered. |
| **A friend's "draw at the start of your turn" Power draws for the host.** 3 Powers. | `c.draw` draws for whoever is acting, and a hook fires when nobody is. A party's ctx runs each call as its own Kid. |
| A party walks on with somebody still on the reward screen. | The next door was on the ballot during a fight, and a late Leave could take a player back out of one. Neither counts now. |
| Two Kids of four stand behind the plates, and a friend's plate prints `marmalade/haunted-housecat`. | Staging for four, and a Power that has no status of its own. |
| A long achievement name is cut off, and the medal covers the tier's first letter, at the Deck's size. | The size floor beat the banner's sums. A long name is lettered narrower now. |

`tests/seat-sweep` keeps the seat faults out: it plays all 1,416 playable Tricks from
seat 1 at a table of four and every Power for a round, and only a Trick that says it
reaches a friend may touch the host.

**Method, because three confident causes were wrong first.** A console message prints
only the first few fields of an object: the late-input report had the answer in a field
the log never showed. Print JSON. The walker records every send and receipt with its
clock, and a hung tab now reports its stack instead of waiting forever. Seats follow the
transport id, not tab order, so tab A is not seat 0. A test wire must keep per-sender
order, as `tests/coop/latency.py` already says: one timer per message reports false splits.

## What whole-game walks found (2026-11-05)

`tests/coop/demo_walk.py --full --fast --mixed --walked FILE --party ...` walks the full
game, not the demo, with every seat's Companion and Kid named, and votes at each fork for
a wing not yet walked. With rendering and animation waits stubbed out it runs a whole
expedition in under an hour. Two real faults, both in the network, neither seen by any
suite:

- **A friend going quiet flooded the wire.** When a seat fell silent for `LOST_MS`, every
  other client forwarded that seat's WHOLE input log, and a loaded machine flaps between
  lost and heard. Late in an expedition four tabs were sending each other thousands of
  inputs until one stopped answering. Now each client passes on only the last 64 inputs
  it has not passed on before (`_forward`), and a gap asks for the seqs it lacks
  (`RESEND` with `miss`). An old client that names nothing still gets the lot.
- **Two friends coming back to a save never found each other on two machines.** Each save
  named the expedition by its own `startedAt`, stamped by its own clock. The host's `GO`
  now carries one time `at`, and both saves keep it (`roster.at`). `rejoin.py` step 7 is
  two machines with different clocks.

One harness fault looked like a game fault: the walker clicked the atlas's wing button
during a scene curtain and reported the screen "not on screen". It waits for the curtain
now. A four-player walk through ballroom, crypt, graveyard, hedge maze and kennels passed
37/0 in sync, every ending each player's own Kid's.

**2026-11-06: the three stalls were a card, not the wire.** Walk f (three seats: Crinkle,
Wisp, Taffy; mixed profiles) stalled at the Lampworks boss, the Study boss, and in Pumpkin
and Attic fights. Every tab had applied every input and the barrier held nothing. One seat
was playing for ever: Crinkle's Trace had a free infinite, because a copy of a Trick that
Traces could Trace another one still in hand. It is closed in `39749300`. The walk now:

- reports a party whose PLACE has not moved for 15 minutes, since a refilling animation
  queue had fooled both old stall clocks;
- dumps each tab's barrier, horizons and held input before pausing it for a stack;
- ends, and fails, any turn past 60 plays.

After the fix walk f went 31 of 31 to a victory, in step, in 4.4 hours. With the earlier
walks, all seventeen wings have now been walked in co-op.

## What has NOT been tested

**Nothing here has run against real Steam, because there is no App ID yet.**
`tests/shell/steam.test.cjs` plays Steam with a fake. `tests/coop/rejoin.py` and
`tests/coop/latency.py` use two real tabs on a BroadcastChannel, the second through a
simulated 60-180 ms wire. All are honest about the protocol. None can speak for Valve's
relay, real latency, or `electronEnableSteamOverlay`, whose `in-process-gpu` switch has
only been exercised without Steam. `--no-steam-overlay`,
or `"overlay": false` in `release.json`, turns it off if a machine objects.

## Known and left

- `seat.gone` and the last vote can cross within one network delay, and then only one
  machine prices the next fight without that seat. A digest catches it. Votes are not
  held by the agreed order because rooms have to stay responsive.
- A snapshot taken while the table is stuck on a question only the returning player
  can answer is bounded at 1.5 s and may fail to replay. The player is told and sent
  back to the title; the table can play on.
- Rejoining mid-fight after the table already played on keeps that Kid down until the
  next fight. That is deliberate: dealing them back in mid-turn is a rules question,
  not a wire question.
