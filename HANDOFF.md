# Midnight Menagerie — handoff

Written 2026-08-26, last updated 2026-08-30 (evening). Everything a fresh conversation needs to pick
this up. Read this, then `CONTRACTS.md`, then `docs/STS2-REFERENCE.md`. Nothing else is
required reading.

---

## 1. What this is

A cute-spooky deckbuilding roguelike. Kids whose pets have gone missing enter a haunted mansion
that transforms animals; you pick a Kid and a Companion (your deck) and go in. Built to a
**Slay the Spire 2** quality bar, in Three.js + plain ES modules, **no build step**.

Design source of truth: `Midnight Menagerie Design.docx` (1.6M chars), carved into 44 readable
files under `docs/design/`. Read only what you need — the full doc will not fit in context.

**One chapter is not from the doc.** Crinkle, the Paper Crow never had one — his entire
specification in the source is a single line, "card duplication, folding, transformations and
fragile high power effects". `docs/design/companions/16-crinkle.md` is a RECONSTRUCTION written
on 2026-08-28 to unblock him, clearly marked as such in its own header, and **the designer has
not reviewed it**. The implementation follows the chapter, so editing the chapter is how to
change him.

**~65,500 lines** across `game/src/`. Currently on branch **`dev`**, pushed to
`github.com/TandemTales/midnight-menagerie`. `main` is untouched and stale.

### Where it stands, 2026-08-30 (evening)

**SEVEN of the seventeen regions ship rosters.** The Heart of the House — region
17, the ending — was built this session, then the Greenhouse and the Mansion
Graveyard. Ten remain, and `HANDOFF-PROMPT.md` opens with the template all three
were built against.

    BUILT   foyer · nursery · sleeping-quarters · kitchens-cellars ·
            greenhouse · graveyard · heart
    LEFT    study-library · attic-observatory · lampworks · ballroom · crypt ·
            hedge-maze · secret-passages · bathhouse · kennels · pumpkin-grounds

`RUN_REGIONS` in `state/run.js` is the ladder the run walks — an explicit list
of BUILT regions ending at the Heart, not a count off `REGION_ORDER`. Adding a
region is one string in the right place.

**The run harness's bot could not reach any of it.** It scored every PLAY with
`preview()` and built its DECK with a die, so 46 of 50 expeditions died inside
the Foyer and nothing past region 1 was exercised by anything. It drafts with
`tests/critic-design/lib/policy.js` now, routes with `pickNode`, and fights with
the same `competentTurn` the balance numbers were measured against — one bot,
not two disagreeing ones. Eleven of forty unaided runs now clear the game.

| what was wrong | where |
|---|---|
| The bot rolled dice for its deck while playing a considered game | `tests/run/index.html` |
| Two bots disagreed about what a player is; this one's picture was believed | `tests/run/index.html` |
| `bones/never-really-lost` CRASHED any fight where a Slobbered Trick was played | `companions/bones.js`, CONTRACTS 19 |
| Boggle's Attack ban had never reached a card drawn after it went up | `companions/boggle.js`, CONTRACTS 19 |
| `EnemyDef.damageTakenMul` was declared by two enemies and read by nothing | `combat/damage.js` |
| `EnemyDef.isTargetable` — same two files, same story | `combat/engine.js` |
| `Hooks.removeByOwner` said "removed with the enemy" and had no callers | `combat/engine.js` |
| The mock named actors `id: def.id`; the engine names them `e0` | `tests/enemies/index.html` |
| …so FOUR multi-body enemies could not find their own parts | `enemies/sleeping-quarters.js`, `nursery.js` |
| The intent audit's batch list stopped at region 3 and printed a healthy number | `tests/enemies/engine-audit.html` |
| Three enemies armed a buff AFTER publishing the intent that carried it | Namekeeper, House Remembers, the Dish |
| `loadContentRegistries` read the library, not the registry — two regions of statuses had no tooltips | `data/keywords.js` |
| The Groundskeeper's Ledger was an unbounded Guard engine; the fight could not END | `bosses/groundskeeper.js` |
| Five full-size bodies pushed the final boss off the left edge of its own fight | `scenes/combat.css` |

New gates: `tests/part-lookups/check.py` (an actor id is never kebab-case),
`tests/snapshot-cards/check.py` (CONTRACTS 19, gated at last). New real-engine
region suites: `tests/heart/` 41, `tests/greenhouse/` 33, `tests/graveyard/` 35.
New enemy-ctx seams, all mirrored in the mock: `cardsIn`, `moveCardTo`,
`playerDraw`, `schedule`/`adjustTimer`/`cancelTimer`/`timers`, `reveal`, and the
`onPlayerReady` def hook.

The intent audit went 2085 → 7530 turns and found 40 lies on the way. All fixed.

**Two open findings live in `HANDOFF-PROMPT.md`'s numbered list and are the best
evidence available**: the difficulty curve flattens after the Nursery (sixteen
runs become eleven and then almost nothing dies for four wings), and two bosses
authored for a seventeen-wing expedition are being measured against a
seven-wing one. Neither has been tuned, deliberately.

---

### Where it stands, 2026-08-29 (second session)

**Read this list first; the detail is underneath.** Nine defects, four of them
in instruments this project was making decisions from, and every fix has a
control that was verified to FAIL without it.

| what was wrong | where |
|---|---|
| The 44-turn elite grind, and "party output does not scale" — both were the BOT | `lib/bot.js`, CONTRACTS 47 |
| `tests/net/run.py` had exited 1 since the day it was written, printing "128 passed" | `tests/net/run.py` |
| A last Kid standing took the Porcelain Doll's swing TWICE and was shown HALF | `combat/engine.js`, CONTRACTS 48 |
| Every Kid but the host opened the HOST'S draw pile | `scenes/combat.js` |
| No Wink Set had ever fired; every Read always resolved WRONG | `companions/wink.js` |
| Three Kids in four crossed into the Nursery unhealed | `state/run.js` |
| Every Gummy Taffy made was unmarked, and she had no suite | `companions/taffy.js`, `tests/taffy/` |
| The Twins' Joined and the Horse's Excitement were dead FOUR ways at once | `combat/engine.js`, CONTRACTS 50 |
| After every resume, no card in hand had a replay key | `state/run.js` |
| The map moved the whole party by ASSIGNING to the Run, down a bus name | `scenes/map.js`, CONTRACTS 52 |
| One seat chose the whole expedition's route; nobody else got a say | `state/run.js`, `tests/vote/` |
| 39 bus subscriptions that could never fire, and the gate that could not see them | `audio/audio.js`, `ui/hud.js`, `tests/bus-names/` |
| Six of the eight wing conditions did nothing at all | `data/wings.js`, `tests/wings/` |
| The mix layer had never run — `tension` and `telegraph` had no caller | `scenes/combat.js`, `audio/audio.js` |
| Twelve authored cues could not be played by anything | `tests/audio/cues.py` |
| The board followed ARRIVAL order while only the log was sorted | `net/session.js`, `tests/net` §4b |
| `resetSeat()` handed every networked client seat 0's screen | `state/run.js` |
| The sagging wing charged a DIFFERENT Kid on each machine | `state/run.js`, `tests/wings/` |

Instruments repaired: the bot's `turnsLeft` (47), `balance.html`'s missing
`fc` (49), the ledger's `left%` — quantised to tens AND wins-only (51) — and
`tests/seams/check.py`, which had been checking four of its five APIs against
an empty set (5c). New gates: `tests/critic-design/party-turns.py`,
`tests/bus-names/check.py`, and `tests/seams/check.py`'s sixth shape
SHARED-WRITE. New suite: `tests/taffy/`.

**WHAT IS OPEN, in the order I would take it:**

1. **ELITES ARE NOT A FIGHT IN A PARTY, and the lever this list used to name is
   the wrong one.** Re-measured 2026-08-29 now that five inert wings do
   something — `party-ledger.py --tier elite --region foyer`, committed as
   `tests/critic-design/party-ledger-2026-08-29.json`:

   | party | win% | left% | %blocked | aimed | landed | content buys |
   |---|---|---|---|---|---|---|
   | 1p | 83.3 | 59.5 | 57.6 | 82.1 | 34.8 | — |
   | 2p | 100 | 68.7 | 62.5 | 118.1 | 44.3 | +3.5 |
   | 3p | 100 | 75.1 | 63.7 | 140.8 | 51.2 | +2.5 |
   | 4p | 100 | 80.8 | 68.3 | 165.9 | 52.6 | +1.2 |

   Read it in this order. **`win%` is 100 at every party size** and 83.3 solo:
   a Foyer elite is a real fight for one Kid and not a fight at all for two.
   **`%blocked` CLIMBS with party size**, and the ledger's own rule for that is
   "the table's Guard budget is the lever and a bigger printed number will be
   eaten too". **`landed` goes 51.2 → 52.6 from 3p to 4p** while `aimed` goes
   140.8 → 165.9 — the fourth Kid's share of the threat arrives as 1.4 extra
   damage. And **what the party content buys COLLAPSES**, +3.5 → +2.5 → +1.2,
   so the elite is converging on a contentless enemy exactly where it is most
   outnumbered.

   **This list used to say the lever was AoE coverage. The instrument says it
   is not.** `party-ledger.html` carries a measured note of its own: "only
   pierce reliably gets there — a pick SPREADS damage, AoE ADDS damage a party
   then blocks, and only pierce is KEPT." AoE raises `aimed`, and `%blocked`
   says a party eats the increase. Pierce is what survives four Kids' Guard.
   **Do not build AoE for this before reading §8.3 and that note.**

   **FIXED, same day, by following that note instead of this list.** A search
   found ONE `pierceFn` in the whole of `foyer.js` — the Grand Coatcheck's. The
   Unwelcome Guest and the House Bell had none, and the Bell's MIDNIGHT TOLL
   was already `partyTarget: 'all'`, which is the finding in miniature: being
   the AoE was exactly what was not enough. Both now pierce in a party, each on
   a tell that already existed. Re-measured, four Kids:

   | | landed | %blocked | left% | content buys |
   |---|---|---|---|---|
   | before | 52.6 | 68.3 | 80.8 | +1.2 |
   | after | **65.7** | **60.3** | 77.0 | **+5.0** |

   `%blocked` no longer climbs with party size — 57.6 / 59.8 / 62.8 / 60.3 —
   which was the diagnostic. Solo is byte-identical across both runs, which is
   the check that `partySize() > 1` really gates it.

   **What is still open here:** `win%` is still 100 at every party size. Moving
   that is a question about how deadly a Big Scare should be, and it must not
   be answered by piling on until a BOT starts losing — CONTRACTS 47 is this
   project having already done exactly that once.

   **AND THE BIGGER FINDING, measured 2026-08-30: in every Foyer fight, at
   every party size, the damage lands on ONE KID.** `spreadOf` is 0 when a
   single seat takes everything and 1 when it is shared evenly. Three
   independent ledger runs, 12 fights per cell:

   | | 2p | 3p | 4p |
   |---|---|---|---|
   | elite, before pierce | 0.177 | 0.203 | 0.209 |
   | elite, after pierce | 0.181 | 0.163 | 0.259 |
   | standard tier | 0.144 | 0.198 | 0.278 |

   Three Kids in four are SPECTATORS as far as incoming threat goes. That is
   one cause for both tiers' rising "Courage left" lines — `tests/coop/
   balance.py` reads +16 / +20 / +23 over solo at the standard tier — and it
   means those lines are substantially an averaging artefact, because the
   average is taken over Kids who were never in danger. It also means the co-op
   FEEL is wrong in a way no win rate could show: an ordinary scuffle happens
   to one person while everyone else watches.

   **This reframes AoE.** The ledger's note that AoE is "added damage a party
   then blocks" is true, and is why pierce was the right lever for DIFFICULTY.
   But AoE's value here is not damage, it is PARTICIPATION — it is the
   mechanism that puts the other three Kids in the fight. Two different
   problems wanting two different measurements: `spread` for participation,
   `%blocked` and `landed` for difficulty.

   `spread` is in every ledger row and was simply never printed by
   `party-ledger.html`, which is why nobody had looked at it. Data in
   `tests/critic-design/party-ledger-normals.json` and the two elite files.

   One number in the table is NOT evidence and is left out above on purpose:
   `partyGuard` reads 63.8 / 209.3 / 321.8 / 757.9, an 11.9x jump at 4p that no
   count of seats and turns explains. It is Guard GAINED, not Guard that
   stopped anything, so a party-wide Guard card scores once per seat and the
   ratio is not comparable across party sizes. Read `%blocked` instead.

2. **fps DOES NOT REPRODUCE — sampled 2026-08-30 and closed.** The standing
   item was that `tests/chrome` read 52 on one battery and 61 on another with
   no perf work in between, which was recorded as needing a quiet machine.
   Eight consecutive samples, `tools/shot.py` on the map and on combat, four
   runs each: **61 every single time**, no variance at all. The three verify
   shots taken the same day read 61 as well, so eleven of eleven.

   The 52 was a busy machine, not the game. Treat a lone fps reading as noise
   unless it repeats — and take more than one before writing it into a list,
   which is the whole reason this sat open for three sessions.

   **THE ENTRY STALL IS THE OPPOSITE CASE — it REPRODUCES.** Sampled the same
   day: `tools/entryprof.py --goto combat`, thirteen runs, reads 1150 / 1200 /
   1233 / 1250 / 1283 / 1350 / 1917 / 1933 / 1933 / 2033 / 2050 / 2166 / 2217
   ms against a 1200 ms budget. **Eleven of thirteen are over it.** This
   document has carried "entry-stall timings swing 2x run to run, do not chase
   them on this machine" for three sessions on the strength of THREE samples,
   one of which happened to pass. The variance is real; the conclusion drawn
   from it was not — and it is the exact inverse of the fps item above, where
   more samples showed there was nothing there. Take more samples either way.

   **Where the time goes matters more than the total, and it is not all at
   entry.** A typical run: ~250 ms just before the scene enters, ~550 ms
   immediately after, then evenly spaced TRIPLETS of ~100–130 ms at about
   t+1.5 s and again at t+3.3 s, and sometimes one large gap near t+6 s. Combat
   keeps hitching for seconds after it is nominally in. The triplet shape —
   three gaps ~117 ms apart, twice, ~1.8 s between clusters — is the strongest
   lead anyone has had on this and nobody has followed it.

   One trap, recorded in the tool because the tool invites it: `--goto` already
   filters frames to after the goto, so page boot is NOT in a `--goto` number,
   while `--scene` samples from page load and includes a very stable ~620 ms
   boot gap. The two modes must never be subtracted from each other. That
   mistake was made on 2026-08-30 and briefly "proved" 700 ms of the stall was
   page boot. It was not.

   **AND THE CARD-ART HITCH REPRODUCES TOO, WITH A LINE NUMBER.** This document
   has said "THE CARD-ART HITCH DOES NOT REPRODUCE" since 2026-08-26. It does.
   Hooking `HTMLCanvasElement.prototype.toDataURL` across the transition finds
   **six calls, 274 ms, worst 122 ms, zero of them at the title** — and all six
   are `cardart.js render()` line 352, a synchronous PNG encode.

   The earlier investigation instrumented `cardart.js render` and reported "6
   renders, 27.7 ms total, ZERO of them synchronous". Six is the right count; it
   found the right function and bracketed the wrong side of the call inside it.

   Ruled out first, each by measurement: NOT JavaScript (1289 of 1398 ms sampled
   is native `(program)`; all game files together are ~48 ms), NOT shader
   linking (289 ms of blocking `getProgramInfoLog` is a BOOT cost — only 2
   programs and 12 ms entering combat), NOT texture upload (`texImage2D` is
   0.1 ms over 61 calls).

   `warmArt`'s incremental budget cannot help: `step` checks its 11 ms budget
   AFTER each job, so a 122 ms job overruns by 111 ms and the budget only ever
   stops the NEXT one. A frame budget that cannot protect a frame.

   A fix was tried and REJECTED by measurement — pre-warming the encoder, which
   works in isolation (25.5 ms then 1–5 ms) and does nothing in the real
   transition (still 113 ms). Reverted rather than shipped. The real fix is
   `toBlob` plus object URLs, which is scoped in the note.

   Full detail, including every probe: `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`.

3. **Steam P2P is approved and is blocked on something only the designer has.**
   "Yes build is fine", 2026-08-29. It still needs a wrapper shell, which ends
   the no-build rule, and it needs a **Steam App ID from a Steamworks partner
   account** — an account, a fee and a registered app. Nothing in this repo can
   produce one. `net/transport.js` is ready for it: five members, two working
   implementations, "a third file rather than a rewrite".
   **THE LOBBY IS BUILT, 2026-08-30, and Steam was never the last piece.**
   `net/lobby.js` had been tested since 2026-08-28 and nothing in `game/src/`
   imported it: no host UI, no join UI, no room-code field anywhere in the game.
   `SteamTransport` would have landed and there would still have been no way for
   a player to start a networked game. The Treehouse (`scenes/lobby.js`) works
   today over `ChannelTransport` — two tabs, two Sessions, two Runs, one seed —
   and `tests/coop/lobby.py` drives both at once for 15 checks. **Tested is not
   the same as reachable**, and a suite that only builds a `Lobby` in a harness
   cannot tell the difference.

   Also built the same day: **inspecting a teammate's DECK** (§8.4, carried as
   "buildable now" since it was researched; `tests/coop/matedeck.py`). Their
   KEEPSAKES are the half still unbuilt, and are still unblocked.

   **The turn barrier and idle heartbeats are BUILT, 2026-08-29** — they were
   the part that never needed the transport. A turn T-1 input sorts before
   every turn T input whatever the seats are, so a client that reached turn T
   while a peer was still in T-1 was GUARANTEED to apply the straggler out of
   order, not merely at risk of it. No combat input for turn T is applied now
   until every seat in the fight has reported reaching turn T, and a beat is
   how a seat that is THINKING reports it — which is why these were always one
   job rather than two. It gates this client's own input too; a barrier one
   seat may walk through is not a barrier. `tests/net` 152 → 158.

   It deliberately does not gate the CURRENT turn (that would serialise the
   simultaneous window §8.2 is built on), does not gate ROOM inputs (they
   commute), and is not held by a seat at turn 0 (it is not in the fight).

   **What is left of that case:** the SAME-turn race, two seats acting at once
   with their inputs crossing. Closing it needs ROLLBACK — rewind to the top of
   the turn and replay, and `_resumeCombat` plus the digests are most of that
   machinery already — or a SEQUENCER stamping a global order, which
   reintroduces exactly the host-dependency §8.11 calls StS2's loudest
   weakness. That choice belongs with the transport that sets the latency
   budget. It is named in `_heldByBarrier` rather than left to be rediscovered.

**Design calls — ALL RESOLVED 2026-08-29.** The designer took every one of these
back with "fix as you deem fit, overrule anything previously written":

- **Both authored wing rules stand as the engine reads them.** Long Shadows is
  "Guard you GAIN is halved" — and the literal reading is not merely inert but
  BACKWARDS, since Guard surviving the turn-start wipe would make the hazard a
  boon. The Lights Are Out keeps its own stacking status. What DID change is
  that it no longer displays as "Unseen": Hush's status is called that, his own
  Power says "Starting a turn Unseen gains Nerve", and a party with Hush in a
  lights-out wing showed one word, one glyph and two unrelated rules. It is
  **Lurking** now, and `tests/status-names/` gates the class — no two statuses
  may share a display name, because the id namespace is not what the player
  reads.
- **A single-exit fork no longer opens a ballot.** A door is not a fork: every
  vote still owed there is forced to the same node, so `voteNode` resolves as
  soon as the outcome is settled rather than when the last seat has spoken.
  Same result, sooner. `tests/vote` 30 → 35.
- **The vote beat stays at 1.5 s**, and the item slightly misread it. It is
  already conditional — `_walkAfterVote` waits only when `result.rolled`, so
  solo and unanimous parties never pay it. The 1.5 clears a MEASURED 1.4 s for
  the announcement to vanish, so it is a floor with something behind it. Whether
  a beat that clears its floor is the right LENGTH still needs a person
  watching; it cannot be settled by argument.
- **Crinkle's chapter is ACCEPTED.** Checked against the build, not just read:
  90 Tricks named against 90 built, zero drift both ways, and §2's numbers are
  the code's. Two absences are now recorded in the chapter itself — no
  per-mechanic "what stops this being universally optimal?" audit, and one-line
  pool summaries instead of full card text.
- **The Butler is in BOTH halves of his brief for the first time** — 64.6% at
  11.5 turns, median 11, against a brief of 45–65% and 8–12. The sweep is what
  settled it: no pool value satisfies both at once, because cutting the pool
  shortens him by making him SAFER and "not dangerous, he is long" is a
  complaint about both numbers. So 165 → 149 with the 16 taken out of PHASE ONE
  only (`BASE_HP` pinned to the new pool, so `phaseAt` cannot shrink the
  dangerous half with it), and every phase-TWO Reprimand raised. Phase one is
  untouched, so the fight he opens with is the fight he always opened with.
- **The Haunt ladder has two ladders and, for the first time, moves at all.**
  §8.1's question was never answered here — and building the answer found that
  `hauntLevel` was written by its own default, read by two pickers, and
  incremented by nothing, so every save sat on Haunt 0 permanently and the
  whole ascension analogue was inert. Solo and party climb separately, because
  a Haunt four Kids cleared is no evidence one Kid can clear it. "Credited to
  everyone" falls out; "gated by the weakest" needs the lobby and
  `Save.hauntLevelFor` is the seam. `tests/haunt/` is 18 checks.
- **The two remaining §8 levers are DECLINED, with reasons in the reference.**
  Shortening co-op acts: measured at 5 handoffs for one room with two Kids, so
  ~60 per wing — real, but it is a SHARED-SCREEN cost that `shouldHandOff()`
  deletes the moment a transport exists, not a party-size one. Shortening by
  party size would permanently remove rooms and rewards to work around an
  offline-only cost, and would weaken the side the ledger says has slack. A
  rising-by-act curve: cannot be validated against the one region whose enemies
  are built, and fitting a curve to a single act is how `partyHp` came to be
  fitted to a broken bot. Both are recorded as decisions rather than left
  reading as oversights.

**Known-silent, each needing something built first.** `tests/audio/cues.py`
carries the list and fails if one starts working and stays on it:
`combat:crit` (there is no crit in this game — the only crit flag in the repo
is the soundboard's own test payload). **`card:retain` came off this list on
2026-08-30**: it was never a missing feature, only a missing event, and
`EV.CARD_RETAIN` now fires where the card is actually kept. One known-silent
cue, not two.

**A MULTI-AGENT SWEEP FOR THE CONTRACTS 54 CLASS, 2026-08-30.** Six agents swept
`ui/`, `scenes/`, `combat/`, `data/`, the plumbing and the documents for things
that are built, documented or tested and that nothing can reach; a skeptic per
area then tried to refute each one. What survived, with the critical one already
FIXED:

1. **FIXED — `attachActions` had no caller anywhere in `game/src/`.** The new
   lobby called `session.attach(run)` and shipped a networked game in which no
   input either player made would ever be applied. `attachSession()` is the one
   call now, and `tests/coop/lobby.py` sends a real vote and asserts it lands on
   both tabs. See the commit; this is the single best argument for the sweep.

2. **FIXED — `autoEndTurn` AND `confirmSingleTarget` were live settings
   controls that did nothing.** Four hits repo-wide each, every one of them a
   declaration, a default, or the header sentence claiming they are read. Both
   are implemented in `scenes/combat.js` now. Auto end fires on the exact
   condition `_syncEndTurn` was already computing for the End Turn button's
   `is-ready` class, and is handed that same value so the two cannot disagree;
   it guards on `me.ended`, without which a party seat waiting on the other
   three reads as "nothing playable" and ends its turn on a loop. The confirm
   goes on the TAP path, which is the only place in the game that picks a
   target for you. `tests/settings-play/run.py` (19) runs the CONTROL first for
   both halves — same board, same gesture, setting off — because "the turn
   ended" and "a dialog appeared" are both things that happen for other reasons.

3. **FIXED — nine unplayable Status/Curse cards in `data/neutral.js` printed
   rules that had never once run.** A card's `effect` is invoked at exactly one
   place and that place is behind `canPlay`, which refuses every `unplayable`
   card. `handHooks` on a CardDef is the seam now: hooks that fire while the
   card sits in a HAND, dispatched through the existing machinery in
   `combat/hooks.js`, so a held card gets the same payload, determinism and dev
   guard as a status. Four things it had to get right are written up in the
   commit; the one with reach beyond these cards is `applyStatus(…, {fresh:
   true})`, which spares a status applied during its owner's own end-of-turn
   step from the decay that runs moments later. Without it Bad Luck's Weak
   expired in the same breath it arrived. Slay the Spire calls this
   `justApplied` and needs it for the identical reason. `tests/hand-cards/`
   (40) carries a control per card and the GATE for the class: an `unplayable`
   card may not have a working `effect`.

4. **FIXED — `gameover.js` fabricated 3–6 Keepsakes for a REAL run that ended
   carrying none**, contradicting its own header ("Nothing here is a
   placeholder"). `_summarise` collapsed an EMPTY list to the same `null` it
   used for "there is no run", so the fallback fired for both. Reading the
   fallback table made it worse than the sweep reported: five of its seven ids
   do not exist, and BOTH that do were printed with invented rules — the shelf
   said Chewed Tennis Ball gives you a Nerve and Spare Batteries recharge Gear.
   Seven entries, seven wrong. The table is gone; the deep link's shelf comes
   off the real `RELICS` now, and a run that kept nothing says so.
   `tests/gameover-keeps/run.py` (16) compares every printed rule
   character-for-character against `data/relics.js`.

5. **FIXED — DeckView's Vanished pile could not be opened.** The component's
   header lists "the Vanished pile" among the moments it serves and carries the
   MODES entry for it; nothing in the game ever passed `mode:'exhaust'`. Cards
   left the Scuffle and the only place that could account for them was
   unreachable. There is a pile button now, hidden while the pile is empty as
   Torn is, with T as its hotkey. `tests/piles-reachable/run.py` (24) gates the
   class rather than the instance: it asks the ENGINE which piles it keeps and
   requires each to be openable or exempt with a written reason.

6. **`ANIMATED_EVENTS` is exported, documented, and read by nothing.** Five of
   the 23 events it names have no animator case either. STILL OPEN.

**FIVE OF THE SIX ABOVE ARE NOW FIXED, 2026-08-30**, and they are exactly the
four the previous handoff named as the best-evidenced work available.

**That handoff called all four "the 24 verified sweep findings" and it was
wrong about three of them.** Only the Vanished pile (and the deckview.js sort
claim beside it) came from the verified 24. `autoEndTurn`,
`confirmSingleTarget`, `gameover.js` and the neutral.js cards were LEADS
carrying nothing but their finder's own searches. Every one turned out to be
real when checked, and one — `gameover.js` — was materially WORSE than its
finder said: the two fallback ids that DO exist in `data/relics.js` were also
printed with invented rules text, so the table was seven entries and seven
wrong rather than five missing out of seven.

Which is the argument for reading the 87, and not an argument for trusting
them. Each of the four took a fresh look at the code before a line was written;
the leads were right about where to look and imprecise about what was there.

**READ THE NUMBERS HONESTLY.** The sweep returned 111 findings and its own log
says all 111 survived the skeptics. That line is WRONG and the bug is mine: the
script joined each skeptic's verdict to its finding by exact `where` string, the
skeptics phrased theirs differently, and every unjoined finding fell through as
kept. **24 carry a real adversarial verdict. 87 carry only their finder's own
evidence.** Number 5 above is from the verified 24; 2, 3, 4 and 6 are leads. The rest are leads with
homework attached, and the whole list — with every `rg` invocation each finder
actually ran — is in `docs/notes/2026-08-30-the-unreachable-sweep.md`. Re-run the
skeptic pass with a stable join before believing the total.


**The netcode case is HALF closed, 2026-08-29, and the half that is left is
named.** `_pump` applies the log in order, so anything arriving in the same turn
of the event loop is sorted first. An input arriving in a LATER task cannot be
put back in its place — harmless for room inputs, which commute, a real
divergence for a PLAY or a SNACK.

The CROSS-TURN form of that is now impossible rather than merely reported: the
turn barrier holds turn-T combat input until every seat in the fight has said it
reached turn T, and `beat()` is how a seat that is thinking says so. That half
never needed the transport, which is why this entry used to be wrong about it.

What is left is the SAME-turn race, two seats acting at once with their inputs
crossing. It needs rollback — `_resumeCombat` and the digests are most of that
machinery — or a sequencer stamping a global order, which reintroduces the
host-dependency §8.11 calls StS2's loudest weakness. THAT is the decision that
belongs with Steam P2P, because the transport sets the latency budget that
picks between them.

**Closed 2026-08-29 (third session), and read this before picking the list
above back up:**

- **The map is on the wire.** It was the largest item on this list and it was
  worse than the list said — the `chooseNode` call that made the screen LOOK
  like it used the run layer's API had been a no-op on every click ever made,
  because the screen wrote `currentNodeId` first and that call's own guard
  reads it. CONTRACTS 52.
- **The route is VOTED**, which is the gap `docs/STS2-REFERENCE.md` §8.5 has
  called "the largest co-op gap we have" for two sessions while this list did
  not mention it at all. Every Kid votes at every fork; a weighted roulette
  settles a split, so a minority vote can win. `tests/vote` is new.
  `docs/notes/2026-08-29-the-route-is-voted.md`.
  **This list is not the only list.** The reference carries its own "For us"
  verdicts and they are not synced here; read §8 before deciding what is next.


- **THE 44-TURN ELITE GRIND WAS THE BOT.** So was "party damage output does not
  scale with party size the way the Courage pool does", which this file, two
  session notes and the Butler's own source comment all recorded as a STRUCTURAL
  fact that no constant could fix. `lib/bot.js projectedValue()` estimated the
  rest of a fight as `enemy Courage remaining / MY damage rate` — the Courage
  party-scaled, the rate belonging to one seat — so at four Kids `turnsLeft`
  pinned to its 28-turn cap in every fight, and `turnsLeft` multiplies the Guard
  term. Four Kids valued Guard four times as highly as one Kid while the damage
  aimed at each of them had fallen fourfold. They turtled.

  Foyer elite tier, `party-ledger.py --tier elite --region foyer`, n=12, one
  line changed and the 1p row byte-identical:

  | party | turns | %blocked | partyGuard | left% |
  |---|---|---|---|---|
  | 1p | 9.4 → **9.4** | 57.6 → 57.6 | 63.8 → 63.8 | 59.5 |
  | 2p | 13.3 → 11.3 | 68.3 → 66.9 | 221 → 204 | 72.6 |
  | 3p | 35.5 → **12.5** | 73.7 → 66.7 | 796 → 308 | 78.9 |
  | 4p | 43.7 → **13.0** | 74.7 → 68.8 | 1943 → 733 | 82.8 |

  **The nine per-enemy `partyHp` curves that were scoped as the next piece are
  not needed and would have been nine curves fitted to a bot that turtles.**
  CONTRACTS 47.

  **The standard tier holds up, on a harness that was itself repaired first.**
  `tests/coop/balance.html` called `competentTurn` with no `fc` at all — in
  every commit it has ever had — so `bot.js` rebuilt the running estimates on
  every call and threw away what `bookkeep` had just learned. Its bot had NO
  memory of the fight it was in, at any party size, and this is the file
  `engine.js` names as the instrument to re-measure `PARTY_HP_SCALE` against.
  Repaired, then re-measured at n=24: **100% wins at every party size**, turns
  5.4 / 5.9 / 6.9 / 7.2, zero falls. The global curve is defensible as it
  stands and the brief's "do not change the global" holds — but the leftover
  Courage reads 61 / 78 / 83 / **86**, which is the gap below.

- **`tests/critic-design/party-turns.py` is the gate that was missing.**
  `anchor.py` holds the harness honest at ONE seat, where `partyBench` and
  `bench` must agree; nothing held it honest at four, where there is nothing to
  compare against — which is exactly why a four-seat bug survived two sessions
  with anchor green throughout. Four Kids must finish within 2.0x solo's turns
  and raise under 20x solo's Guard: 1.49x / 15.08x with the fix, 7.94x / 60.07x
  without.

- **`tests/net/run.py` had been red since the day it was written, and said
  "128 passed, 0 failed".** It fails on any console error and three checks
  provoke one deliberately — a drifted board, a peer on the wrong seed, and a
  client speaking for another seat — all of which `session.js` is supposed to
  shout about. The page declares those now and the runner fails on an
  undeclared error AND on a declaration that never fires. Exit 0 for the first
  time. The third declaration was invisible until the other two were named.

- **BOTH BOSSES WERE TUNED AGAINST THE TURTLING BOT, and re-measuring says the
  Courage number is not the lever.** With a party that attacks, `party-boss.py
  --n 24`:

  | | solo | 4 Kids |
  |---|---|---|
  | Butler | 66.7% win · 13.2 turns · 39% left | **100%** · 8.5 turns · **84% left** · 0 falls |
  | Governess | 66.7% win · 11.3 turns · 58% left | **100%** · 10.8 turns · 78% left · 0 falls |

  The Butler's fight is now SHORTER at four Kids than solo, because his
  `partyHp: [1, 2.2, 2.8, 3.2]` was cut from the global specifically to rescue
  a party that could not win. **Bracketing both bosses says raising it back
  does not help:**

  | | ×1 | ×1.4 / ×1.3 | ×1.8 / ×1.6 |
  |---|---|---|---|
  | Butler 4p | 100% · 8.5t · 84% | 100% · 11.6t · 76% | 100% · 15.0t · 70% |
  | Butler 1p | 66.7% | 33.3% | **4.2%** |
  | Governess 4p | 100% · 10.8t · 78% | 95.8% · 13.3t · 76% | 79.2% · 16.2t · 75% |
  | Governess 1p | 66.7% | 41.7% | 37.5% |

  Four Kids win at every multiplier tried; Courage buys TURNS, not danger, and
  the same multiplier that leaves 4p untouched destroys solo. **This is trap 45
  proved twice more**: the lever is threat a party's Guard cannot answer, which
  is what the Governess's Sharp Correction is and what the Butler has only
  5–7 of (the Reprimand's pierce on a House Rule violation). Both curves left
  where they are, deliberately; the comment in `butler.js` records why.

- **`engine.boardEvent()` IS WIRED — it was dead FOUR ways at once.** Nothing
  called it; it passed the event as two arguments while every def reads
  `onBoardEvent(c, ev)`; `twinOf()` matched the ACTOR id, which
  `buildEncounter` never sets; and the enemy ctx's `block: (a, n)` dropped its
  third argument, so `{ source }` and `{ noJoin }` never reached `gainBlock`. A
  fifth appeared once the others were fixed — the Guard mirror did not mark
  itself, so Good Posture paid **15 each** against the 12 its own comment
  warns about. CONTRACTS 50, and the tell was that `boardEvent`'s only caller
  in the repo was a TEST inventing an event the game does not have.

  Emitted now on block, heal and status. The Porcelain Twins' Joined and the
  Rocking Horse's Excitement-from-support are both live, with a control per
  layer.

- **`left%` IS WINS ONLY, AND IT LIES ABOUT A BIMODAL FIGHT.** Two defects in
  the same column, both fixed. It went through a `mean()` that rounds to one
  decimal before the multiply, which on a 0..1 fraction quantised it to
  multiples of TEN (0.849 and 0.851 print as 80 and 90). And it silently
  conditions on winning while the table printed no win rate at all, so the
  deadlier a fight's tail, the healthier its survivors look.

  That combination sent me to the wrong conclusion and it is worth the space:
  the Porcelain Twins printed `left% 96` against the Toy Chest's 81 and read
  as the softest encounter in the game. They are not. They win **9 fights in
  12** at one Kid — the same as the Patchwork Giant, which prints 72.6 off the
  same 9-in-12 — and the three losses are cut from the mean. The ledger prints
  `win%` beside `left%` now so the pair cannot be read apart. CONTRACTS 51.

  The three Nursery elites, n=12, both columns:

  | encounter | 1p win% | 1p left% | 4p win% | 4p left% |
  |---|---|---|---|---|
  | Toy Chest | 91.7 | 81.2 | 100 | 94.8 |
  | Patchwork Giant | 75 | 72.6 | 100 | 93.7 |
  | Porcelain Twins | 75 | 96.0 | 100 | 93.7 |

  **At one Kid the Nursery elite tier is fine.** At four Kids all three are
  100% wins with ~94% of the party's Courage left — which is not a Twins
  problem, it is the standing party problem below, and it is the same at every
  encounter measured.

  The Twins' Tea Party was separately restoring 10 to each of them against the
  chapter's 5 (both defs carry the move, both fire on the same turn, and each
  healed its sibling as well). Fixed, and it made them EASIER — left% 90 to 96
  — because less healing just ends the fight sooner. Their `aimed/turn` is 7.6
  and Proper deals no damage by design, so if anyone does tune them the lever
  is output, not sustain; Prim is already at 13 and 7x2 against the chapter's
  10 and 5x2.

- **THE PARTY-COST GAP IS ARITHMETIC, and exactly one move in the game beats
  it.** The standing "a party finishes too comfortable" item is not an
  encounter-by-encounter mystery. At four Kids the pool is ~4x and the output
  is ~4x, so a fight runs `poolScale/4` as long as solo and the enemy delivers
  that share of its solo total into four times the pool:

      cost4 = costSolo x (poolScale / 4) / 4        with NO content at all

  What an encounter costs BELOW that is what its multiplayer content buys:

  | encounter | solo left | 4p predicted | 4p measured | buys |
  |---|---|---|---|---|
  | Foyer elite tier | 49.5% | 82.0% | 82.8% | −0.8 |
  | Butler | 15.7% | 83.1% | 82.8% | +0.3 |
  | **Governess** | 41.0% | 81.6% | 76.2% | **+5.3** |
  | Toy Chest | 74.5% | 90.9% | 94.8% | −3.9 |
  | Patchwork Giant | 54.5% | 83.8% | 93.7% | −9.9 |
  | Porcelain Twins | 72.0% | 90.0% | 93.7% | −3.6 |

  **Only the Governess is positive, and it is one flag on one move.** Toggling
  Sharp Correction's pierce off moves her 4p Courage-left 78% → 87% and her
  cost 61.6 → 21.6 — a third of the bill from `pierceFn`.

- **A PICK SPREADS DAMAGE, AoE ADDS DAMAGE A PARTY THEN BLOCKS, AND ONLY
  PIERCE IS KEPT — and every measured encounter is now at or above the
  arithmetic baseline.** The ladder, run one rung at a time on two encounters
  before the recipe was applied to the rest:

  | | Toy Chest | Patchwork Giant |
  |---|---|---|
  | no targeting | −3.9 | −9.9 |
  | + `partyPick` (§29) | | −7.3 |
  | + full-number AoE (§27) | −2.6 | −2.0 |
  | + **pierce** on the focused attack (CONTRACTS 45) | **+2.1** | **+7.5** |

  Coverage bought 1.3 and 7.9 points and reached the baseline on neither.
  Pierce bought 4.7 and 9.5 and flipped the sign on both. `%blocked` says why:
  the Chest's AoE took `aimed` at four Kids from 53.8 to 96.1 and `%blocked`
  from 70.4 to 78.8 — the party simply blocked the addition.

  **Every measured encounter, before and after. Solo is byte-identical in all
  of them:**

  | encounter | before | after | what it got |
  |---|---|---|---|
  | Grand Coatcheck | -5.7 | **+8.3** | sweep AoE, pick, pierce on Everything at Once |
  | Patchwork Giant | -9.9 | **+7.5** | pick, flail AoE, pierce on Stuffed Fist |
  | Governess | +5.3 | **+5.3** | already had pierce |
  | Porcelain Twins | -3.6 | **+3.4** | pick, pierce on Pointed Finger |
  | Toy Chest | -3.9 | **+2.1** | pick, barrage AoE, pierce on Lid Slam |
  | Foyer elite tier | -0.8 | **+1.2** | the Coatcheck, in aggregate |
  | Butler | +0.3 | **+0.3** | AoE and splash, no pierce |

  **THIS IS NOT COST PARITY AND SHOULD NOT BE READ AS ONE.** The baseline the
  table scores against is "what a contentless enemy takes", not "what a solo
  Kid pays". A party still finishes far healthier than one Kid does:

  | encounter | solo left | 4p left | still apart |
  |---|---|---|---|
  | Grand Coatcheck | 56.0% | 76.0% | 20.0 pts |
  | Patchwork Giant | 54.5% | 76.3% | 21.8 |
  | Porcelain Twins | 72.0% | 86.7% | 14.6 |
  | Toy Chest | 74.5% | 88.8% | 14.4 |
  | Foyer elite tier | 49.5% | 80.8% | 31.2 |

  4p win rate is 100% everywhere, before and after. What moved is the BILL —
  `left%` at four Kids went 90 → 76 on the Coatcheck, 93.7 → 76.3 on the Giant,
  93.7 → 86.7 on the Twins. Closing the remaining 15–30 points would need most
  of an encounter's damage to pierce, not one move of it, and that is a much
  larger design decision than the one taken here.

  Also fixed on the way, and the reason the first pierce attempt did nothing:
  `hitPlayer(c, n, hits)` took no options, so a fourth argument was dropped in
  SILENCE — the same shape as the enemy ctx's `block`. It forwards `opts` now.

  **The Butler is the only fight left without a Guard-ignoring move** (his
  Reprimand pierces for 5–7 on a House Rule violation and nothing else does).
  He reads +0.3, which is par rather than bad, and foyer §28's Flustered and
  House Rule content is fully implemented — so he is a judgement call, not a
  defect.

### Where it stands, 2026-08-29

- **AT FOUR KIDS EVERY BOSS WAS A ONE-PHASE BOSS.** A phase threshold is an
  absolute Courage number and a pool is not, so phase two went from ~55% of the
  fight solo to **10 / 17 / 9.5%** at four Kids for the Governess, Butler and
  Bedframe Beast. Her three Repair Patches, her Emergency Repair and her whole
  second move cycle were content a party never saw. Fixed with `phaseAt()` per
  nursery §34; solo byte-identical. **A correctness fix, not a balance one** —
  it moves her 4p leftover Courage 90% → 90%.
- **A boss whose damage can be BLOCKED cannot threaten a party — FIXED for the
  Governess.** `tests/critic-design/party-ledger.py` is the new instrument and it
  was decisive: at four Kids she aimed 565 and landed 94 (83% blocked, party
  Guard 2275) while the Butler aimed 404 and landed 173 (57% blocked), and the
  only relevant difference was that two of his Reprimands bypass or remove
  Guard. **AoE is necessary and not sufficient** — targeting is answered by
  Guard, and Guard scales with the party.

  Her Sharp Correction ignores Guard in a party now, the move that already picks
  the Kid closest to breaking, so the party's decision is "nobody may be the
  lowest" rather than "stack Guard". At four Kids: **win 100% → 75%** (solo
  62.5), **turns 18.4 → 12.4** (solo 11.0), **falls 0.0 → 1.0**, cost 17 → 93,
  and `%blocked` flat across party size. Solo byte-identical. That also closes
  "party boss fights are LONG" for her. CONTRACTS 44, 45 and 46.

  ~~**Still open, and now MEASURED: the ELITE tier at three and four Kids is a
  44-turn grind.**~~ **RESOLVED the same day, and it was the instrument.** The
  43.7 turns were `lib/bot.js` turtling at four seats, not the global
  `PARTY_HP_SCALE`; the tier reads 13.0 turns at four Kids once the bot
  projects the fight against the whole table. See the second-session block at
  the top and CONTRACTS 47. The per-enemy `partyHp` sweep this bullet scoped is
  not needed.
- **NETCODE ITEMS 2, 3 AND 4 ARE DONE. Only the transport is left.** Every
  screen routes through `net/actions.js`; `net/lobby.js` decides seats, host and
  seed with no election; a choice reaches the player whose choice it is.
  `tests/net/run.py` is **149 checks**. What remains is Steam P2P — one file
  implementing the five methods in `net/transport.js` — and it needs a wrapper
  shell, so it ends the no-build rule and is the designer's call.
- **`tools/shot.py` was screenshotting a BLACK VOID.** `--wait` was a fixed
  sleep after `load`, and the 3D stage renders nothing while it links shaders —
  about ten seconds cold on this GPU. So every deep-linked combat and map shot
  at the documented `--wait 9` showed the HUD floating on nothing, which is what
  critics have been judging the game from. It waits for
  `stage.warmStage === 'done'` now. **No player was ever affected** — the
  warm-up finishes while they read the title menu — which is exactly why it
  survived. CONTRACTS trap 43.
- **EVERY SCREEN IS ON THE WIRE — including the map, since 2026-08-29 (third
  session).** `game/src/net/actions.js` is the game-side half the netcode never
  had — one applier, one `act(run, input)` seam, and the reward, Mr. Moth's,
  the Safe Room, the Curiosities and COMBAT all route through it. Nothing in
  `game/src/` had ever called `session.input()`; "combat is exercised" was true
  only of `tests/net`'s own harness. Netcode item 2 is done.
  `docs/notes/2026-08-29-the-wire-reaches-the-screens.md`.

  **This sentence was false for two sessions and no gate could tell.** The map
  screen reached the run layer by ASSIGNING to it — `run.currentNodeId = id`,
  `run.pathIds = …` — and by emitting a bus name a listener in `state/run.js`
  turned into `enterNode`. An assignment has no verb to be missing, so the
  seam checker had nothing to see. `ACT.MAP_VOTE` now, and SHARED-WRITE in
  `tests/seams/check.py` keeps it that way. CONTRACTS 52,
  `docs/notes/2026-08-29-the-map-was-writing-the-run.md`.
- **Ending a turn over a wire used to close the TABLE**, which would have shut
  three other people's turns from one keyboard. It ends one seat now.
- **THE GOVERNESS IS MEASURED, and she was the opposite failure from the
  Butler.** At four Kids she read **100% player wins, nobody ever falling, 90%
  of the party's Courage left** — because she declared no `partyTarget`, no
  `partyPick` and no `splash` on any of her five attacks, and an enemy with no
  preference rolls ONE seat and holds it. She has targeting now, authored to the
  Nursery's own §27/§29/§31/§33, and `tests/governess/` is her first
  effect-asserting suite (25 checks, 11 fail without it). Solo is byte-identical.
- **The Bedframe Beast is NOT REACHABLE.** `RUN_LENGTH_REGIONS` is 2 — the Foyer
  and the Nursery — so there are no third-wing loadouts to capture and no
  shipping fight to tune. `party-boss.py --lregion` measures it by proxy and
  says PROXY in the terminal. It is also not untargeted: it implements §46's
  marked Kid with its own held `markedSeat`.
- **`partyPick`'s open question has an authored answer for the Nursery.**
  §29 already chose `lowestCourage`, which is exactly the "preference the player
  cannot game inside the turn" CONTRACTS asks for. Sharp Correction uses it.
- **`tests/coop/rooms.py` was flaky, not the game.** It rolled its own Curiosity
  off an unseeded run and pressed the one button label it knew, so any room with
  a mend/removal/fight follow-up reported the co-op handoff regression it exists
  to catch. Named room, and `press()` now RAISES when it matches nothing.

### Where it stood, 2026-08-28

- **The Companion roster is COMPLETE.** All 16 playable, 1468 cards, 0 errors, 0
  warnings, each with its own effect-asserting suite. Crinkle's design chapter is a
  reconstruction and is **awaiting the designer's review** — see §1 above.
- **A party of four plays end to end on one machine.** `MAX_PARTY` is 4.
- **THE FOYER BOSS IS WINNABLE IN CO-OP AGAIN — it was not.** Measured
  properly for the first time, the Butler read **0% at three and four Kids**:
  not hard, unwinnable. Three things were wrong and each hid the next.
  `PARTY_HP_SCALE` was derived from `tests/coop/balance.py`, which fights the
  STANDARD TIER, then applied to bosses that were never measured at any party
  size; the AoE dealt each move's full SOLO number to every Kid; and the bot
  gave every seat the whole board's incoming. Now, at n=8:

  | party | win% | turns | Courage left | falls |
  |---|---|---|---|---|
  | 1p | 50 | 13.4 | 27% | 0.5 |
  | 2p | 25 | 24.0 | 59% | 1.5 |
  | 3p | 75 | 24.5 | 38% | 0.75 |
  | 4p | 50 | 31.9 | 50% | 2.0 |

  The fix is on the BUTLER, not the global constant: `partyHp: [1, 2.2, 2.8,
  3.2]` via `EnemyDef.partyHp`, the per-enemy seam. The global curve still
  governs scuffles, whose win% is already flat and correct.
- ~~The other two bosses have never been measured at any party size.~~
  **MEASURED 2026-08-29, and it was the opposite problem.** The Governess read
  100% player wins at four Kids with nobody ever falling and 90% Courage left,
  because she had NO party targeting at all. She has it now. The Bedframe Beast
  is not reachable at `RUN_LENGTH_REGIONS = 2` and was left alone. See the
  2026-08-29 block at the top and `docs/notes/2026-08-29-…`.
- **Party boss fights are still LONG** — 24 and 32 turns at three and four Kids
  against solo's 13 — because party output does not scale with the pool the way
  its Courage does. No multiplier fixes that. Note §8.
- **The curve's original numbers were measured wrongly.**
  `[1, 2.2, 4.0, 5.7]` was measured against a harness with three defects, all
  fixed on 2026-08-28: `tests/coop/balance.html` ran **two enemy phases every
  round**, and `lib/bot.js` scored clones while reading the real board and never
  took a seat in half its scoring function. Re-measured, the Foyer standard
  tier wins **100% at every party size** with zero falls, against the
  79/75/96/96% the broken harness reported. See
  `docs/notes/2026-08-28-butler-aoe-and-a-broken-instrument.md` §1.
- **The Butler is dangerous through AoE now**, per §9 decision 4. Solo
  66.7% -> 60.4% win at n=48; at 2p/3p/4p the fight is shorter, costlier and
  the damage is genuinely spread (spread 0.65 -> 0.90 at four Kids).
- **Networking has a foundation and a proof, not a feature.** The lockstep session,
  the protocol and two working transports exist; a transport that reaches another
  machine does not. §9 says exactly what is left.
- **THE CARD-ART HITCH DOES NOT REPRODUCE EITHER, AND ENTRY-STALL TIMINGS SWING
  2x RUN TO RUN.** Three perf claims in this document now rest on timings this
  machine will not reproduce today.

  Instrumenting `cardart.js render` and walking into combat from a settled
  title: **6 renders, 27.7 ms total, ZERO of them synchronous.** The 816 ms
  block this document describes was measured on the CHROME FIXTURE, which
  mounts a 60-card `DeckView` with no prior warm; the game calls `warmArt` in
  `combat._warmDeck()` and `_paintArt` never hits a cold miss on that path.

  `tools/entryprof.py --goto combat`, three runs on identical code:
  **2033 / 1150 / 2217 ms** blocked, worst single gap 867 / 550 / 900 ms,
  against a 1200 ms budget it passes once and fails twice. Whatever the worst
  gap is, it is NOT card art.

  **Do not chase any of the three on this machine as it currently is.** Traps 7
  and 35 are exactly this, and the honest next step is a quiet machine and a
  fresh baseline, not a compositing round aimed at numbers that move by 2x
  between consecutive runs.

- **fps: THE NUMBER DOES NOT REPRODUCE, 2026-08-29 second session. Re-measure
  before spending a round on it.** No perf work was done and none is claimed.
  `tests/chrome/run.py` read **median 52 of [52, 52, 53]** on the first battery
  of this session and **median 61 of [61, 61, 61]** on the last, with two
  further isolated runs also reading 61/61/61. `tools/shot.py` agrees on the
  real game: **combat 61, map 61** at the documented settle, against the 52 / 52
  the block below records. The GL renderer string is the same ANGLE / Intel UHD
  device in both.

  So the standing item below — "the product misses it, the fix is a
  compositing pass" — is **not currently reproducible on this machine**, and
  the compositing round it scopes would be design-affecting work aimed at a
  number that is presently 61. Traps 7 and 35 are both about exactly this:
  fps here depends on what else is running and drifts for seconds past the
  nominal settle. Something about the machine differed between the two
  batteries; a OneDrive-hosted working tree syncing is the obvious candidate
  and was not controlled for.

  **Do not close the item and do not move the threshold on this.** Re-measure
  cold, on a quiet machine, before either believing 61 or spending a round on
  52.

- **THE 60 FPS REQUIREMENT IS MISSED BY THE GAME, not just by a test.** This
  was carried as "tests/chrome measures 51–54"; measured properly it is bigger
  than that. At 1920x1080 — the size CONTRACTS non-negotiable 3 names — six
  in-page samples per scene give **combat 52, map 52**, gameover 58,
  **title 61**. A blank page gives 61–62, so the machine, the browser and the
  compositor can all do 60; the two main gameplay screens cannot.

  What is EXCLUDED, with numbers: it is not JS (665 ms of JavaScript in six
  seconds of a settled combat scene, ~1.85 ms a frame); not fill rate (55 / 56 /
  52 at 720p / 900p / 1080p, nearly flat across 2.25x the pixels); not the post
  chain or the quality tiers (auto picks `medium` correctly, and **low buys
  nothing over medium** — 55 either way, against high's 45); and not the
  fixture. What is left is draw calls and GL state changes in the combat and map
  scene graphs, on a stack this project has already caught being pathological
  about program switching. That is where a graphics round starts.

  Also real, and separate: `ui/cardart.js render` costs **735 ms** across the
  chrome fixture's load — PNG encoding, 60 cards at ~12 ms each, in ONE task
  because `DeckView` mounts synchronously while the incremental `warmArt` queue
  sits unused beside it. `tests/chrome` still fails at 56/53 against 58, and it
  now takes three samples and judges the median, because one sample on this
  machine has a six-point spread. Full working in the note, §7.

---

## 2. Run it

The dev server does **not** survive a session restart. Start it:

```bash
python tools/devserver.py 8777
```

- Game: http://localhost:8777/game/index.html
- Live progress page: http://localhost:8777/progress.html
- Deep links: `#scene=combat&seed=42`, `#scene=map&seed=42&region=foyer`, `#scene=select`,
  `#scene=clubhouse`, `#scene=gameover&result=victory`
- Debug handle in the page: `window.MM` → `{ ctx, bus, clock, Save, goto(scene, params), state() }`

**Dropping a hash does not reload an SPA.** Navigating from `index.html#scene=select` to
`index.html` leaves you on select. Use `preview_start` again or a cache-busting query.

---

## 3. Tooling — this is how the project stays honest

| Tool | What it does |
|---|---|
| `python tools/shot.py <name> [--scene s] [--wait n] [--steps ...] [--strip N]` | Screenshots and drives the real game. Prints fps **and the GL renderer**, flags software rasterisation. Writes `shots/<name>.state.json` with console errors. **Read its docstring.** |
| `python tools/entryprof.py --goto <scene> [--watch cls]` | Blocked main-thread time on ONE scene entry. Samples every rAF and reports GAPS — an average cannot see a stall. `--goto` boots elsewhere, waits for the app to settle, then walks in, so the cost is attributable instead of buried in ~6 s of boot. |
| `python tools/progress.py event/wave/piece ...` | Updates the live progress page |
| `python tools/prep_assets.py` | Copies soundtrack + blueprint art into `game/assets/`, emits `audio/manifest.json` |
| `python tools/prep_kid_art.py` | Kid portraits/thumbnails + 13 Companion portraits |
| `python tools/prep_menu_art.py` | Keys the title wordmark's black to alpha, sizes the mansion plate |
| `python tools/blueprint_trace.py` | Traces blueprint sections to vectors (`sectionNN.plan.json`) |
| `python game/src/ui/make_thumbs.py` | Companion portrait thumbnail variants |

All prep scripts are **one-off and commit their output** — there is no runtime build step.

### Test suites — all must stay green

| Suite | What it says when it is happy |
|---|---|
| `tests/combat/run.py` | 677 assertions |
| `tests/coop/run.py` | 594 assertions |
| `tests/net/run.py` | 128, and **exit 0 since 2026-08-29** — it had always exited 1 on the console errors its own checks provoke, while printing "128 passed, 0 failed". The page declares those three now; an undeclared error fails, and so does a declaration that never fires. The lockstep session; every room and combat through the REAL applier against two real `Run`s; the lobby's seats/host/seed including two tabs over `BroadcastChannel`; and a choice reaching the seat it belongs to, mid-input, without deadlocking |
| `tests/cards/run.py` | 1468 cards, 0 errors, 0 warnings |
| `tests/enemies/run.py` | 37 enemies, 0 errors |
| `tests/enemies/audit.py` | ~2060 turns, intent === delivered |
| `tests/run/run.py` | 50 runs, 0 errors |
| `tests/backpack/run.py` | 77 checks |
| `tests/map/run.py` · `tests/chrome/run.py` | 23 passed · 27 checks |
| `tests/combat-scene/seam.py` · `tests/audio/run.py` | 22 passed · 46 cues |
| `tests/critic-design/sim.py` · `sweep.py` | the balance simulator |
| `tests/critic-design/party-boss.py` | a boss at 1..4 Kids against REAL pre-boss decks — the gap `sweep.py` (solo only) and `tests/coop/balance.py` (starting decks) both leave |
| `tests/critic-design/anchor.py` | 6/6 — `partyBench()` at one Kid reproduces `bench()` fight for fight. The party rows mean nothing without it |
| `tests/critic-design/party-turns.py` | 4 checks — its sibling at FOUR Kids, where there is nothing to compare against. Four Kids finish within 2.0x solo's turns and raise under 20x solo's Guard. A gate, not a reading |
| `tests/critic-design/butler-ledger.html` | where the Butler's length actually comes from |
| `tests/critic-design/party-ledger.py` | where a PARTY's Courage goes — what a boss aimed against what its target's Guard let through. The number `left%` and `cost` are both downstream of |
| `tests/critic-design/phase-probe.html` | what share of a boss's pool is phase two, at each party size |

**One suite per Companion, and every check asserts an EFFECT.** `tests/cards`
proves only that a card resolves without throwing, which CONTRACTS trap 12 is
explicit is worth nothing — four dead cards passed exactly that check. These
drive a real engine with real enemies and mock none of the mechanic under test.

| | |
|---|---|
| `tests/boggle/run.py` | 30 — Search really replaces the Attack, Scare really spends the Fright |
| `tests/mopsy/run.py` | 28 — Cushion halves AFTER Guard, a Torn Trick cannot be played |
| `tests/wisp/run.py` | 25 — two Afterglows in one batch are ONE Convergence |
| `tests/crumbula/run.py` | 25 — one Queasy per Feed, Indulge goes through Guard |
| `tests/hush/run.py` | 17 — the Ambush ordering, both ways round |
| `tests/wink/run.py` | 5 — a Set really leaves the deck |
| `tests/truffle/run.py` | 27 — one Attack ACTION triggers Bristle once, banked Guard arrives |
| `tests/drizzle/run.py` | 70 — a Stormbreak does not dry the board, a Forecast waits to be ENTERED |
| `tests/pudding/run.py` | 46 — a Plot refuses a second operation in one turn, Unearthed doubles |
| `tests/mossbit/run.py` | 55 — hurrying an Epitaph forfeits the Patience, the bill lands through Guard |
| `tests/brambleboo/run.py` | 52 — four Vines Snare and REDUCE, never cancel |
| `tests/crinkle/run.py` | 44 — a Crease survives the discard pile, and the card PRINTS the new number |
| `tests/butler/run.py` | 24 — Dust Them Off really lands on all three Kids, Enough of This really DECLARES its splash, and the converted Reprimands really cost the player |
| `tests/pipkin/run.py` | 18 — the Patch is really on the board, and really matches the array every turn |
| `tests/taffy/run.py` | 8 — a Gummy is MARKED as one, playing it counts, and a Gummy is not a legal source for another. She had no suite until 2026-08-29 |
| `tests/governess/run.py` | 25 — Mind Your Seams really Pinches every seat, Sharp Correction really picks the Kid closest to breaking and really does not move when they brace, and every attack deals a Kid alone exactly what it always did |

**Co-op drives the real screens** — everything else about co-op is asserted
against objects, and the thing that breaks is always the screen.

**Run these one at a time.** They click through real transitions with real
timings, and two Playwright runs overlapping on this machine make them fail in
ways that look like bugs and are not — the same trap CONTRACTS trap 7 records
for fps. Every "failure" of these suites during the pass-and-play round turned
out to be a second browser I had left running.

| | |
|---|---|
| `tests/coop/selectscreen.py` | the entry point: "Go in together" through to two Kids on one route |
| `tests/coop/hotseat.py` | END TURN, the veil, and the screen really being the other Kid's |
| `tests/coop/rooms.py` | all four per-Kid rooms handing over, and a Rescue not |
| `tests/coop/playthrough.py` | a two-Kid expedition, walked the way two people would |
| `tests/coop/balance.py` | the party Courage curve — numbers to read, not a gate |

**Gates against whole bug classes.** Never let one regress; each cost a round to
learn. See §6.

| | |
|---|---|
| `tests/seams/check.py` · `proof.py` | 6189 call sites · 52 passed — silent no-ops at module joins, and a screen writing shared Run state |
| `tests/scene-css/check.py` | 0 conflicts — a class meaning two things in two scenes |
| `tests/css-tokens/check.py` | 0 undefined tokens — `var(--text-low)` when it is `--text-lo` |
| `tests/dup-keys/check.py` | 0 duplicate keys — the second one silently wins |
| `tests/hook-names/check.py` | 0 unknown hooks — a handler nothing dispatches |
| `tests/bus-names/check.py` | 0 dead subscriptions — the THIRD registry. `bus.on('x')` where nothing emits `'x'`. The shared tooltip's only cross-scene teardown was two such names |
| `tests/turn-events/check.py` | 0 unguarded — `turn:start` fires for every enemy too |
| `tests/stdlib-shadow/check.py` | 0 scripts named after a stdlib module. `tests/coop/select.py` **was** the `select` module for that whole directory, and all six scripts in it were broken |

`tests/seams/check.py` and `tests/scene-css/check.py` are **gates against whole bug classes** —
never let them regress. See §6.

---

## 4. How the work has been run

Fan out **builder agents** on independently-judgeable pieces with strict file ownership (the
table in `CONTRACTS.md`), then a **separate critic with fresh context** that judges the *running
game* — never the builder's summary — against `docs/STS2-REFERENCE.md` using the blind A/B in
`docs/CRITIC-BRIEF.md`. When a critic fails a piece it names **one** biggest gap and the builder
goes back in. Between waves, one fresh agent plays the whole game end to end.

Five full playthroughs have been done (`tests/playthrough*/`). The last scored **7 ties, 5 losses**
against StS2, down from 7 losses / 3 ties / 2 wins.

**Run 4–5 agents at a time, not 8.** Eight Opus agents hit the session limit repeatedly and three
lost their transcripts. Resume interrupted agents with `SendMessage` rather than restarting cold.

---

## 5. What is built

Playable end to end: title → Companion select → Kid select → blueprint map → combat → reward /
shop / Safe Room / Curiosity / Rescue → boss → second wing → expedition end → Clubhouse, with
autosave and mid-combat resume.

- **Combat engine** (`src/combat/`) — headless, deterministic, 649 assertions. Player choice with
  a replay log, first-class intent queue, House Rules, `onEnemyPhaseEnd`, preview by cloning the
  engine so it cannot drift from resolution.
- **Content** — **1468 cards across all 16 Companions.** The roster is COMPLETE as of
  2026-08-28 (Marmalade, Bones, Pipkin, Taffy, Wink · Boggle, Mopsy, Wisp, Crumbula, Hush,
  Truffle · Drizzle, Pudding, Mossbit, Brambleboo, Crinkle), each with its own
  effect-asserting suite; 37 enemies
  across Foyer / Nursery / Sleeping Quarters with 3 multi-phase bosses; 38 Keepsakes; 16
  Curiosities; 18 Backpack items; a 10-level Haunt ladder with real behavioural upgrades.
- **Art** — all authored art is wired: the main menu (`UI/mainMenu.png` + keyed `UI/title.png`),
  Companion select (`UI/selectCompanion.png` itself, unrescued frames hidden, candle hover), all
  17 map wings traced from their own `art/sectionNN.png`, 8 painted Kid portraits + thumbnails,
  13 upgraded Companion portraits. Pet photographs are *generated* (`ui/petart.js`) — there is no
  authored pet art, and that code is deliberate, not a placeholder.
- **Balance** (measured, not guessed): whole-run survival 50–58%, Foyer boss ~82%, Governess ~74%
  when reached, naive-vs-competent gap ~33 points.

`UI/selectKid.png` is prepped to `game/assets/ui/select-kid.jpg` and **wired to nothing** — the
designer has not asked for it yet.

---

## 6. Bug classes that have already cost rounds

`CONTRACTS.md` has the full list under "Traps this codebase has already fallen into". The two
that produced automated gates:

**Silent no-ops at module seams.** Every module passed its own tests while doing nothing at the
join. Marmalade's Haunt dealt **zero damage for the entire build** because a keyword called
`ctx.loseHp?.()` and the hook payload never provided `loseHp` — the `?.` swallowed it. "Ignores
Guard" passed `{pierceBlock}` where the pipeline read `pierce`. `tests/seams/check.py` now scans
1607 call sites; `game/src/combat/strict.js` throws on undefined ctx members in dev.
**CONTRACTS rule 8: no `?.` on contract APIs.**

**CSS class collisions between scenes.** `.rs-door` meant an absolutely-positioned door panel in
`event.css` and the Safe Room's buttons in `rest.css`; stylesheets are global and never unload,
so visiting one Curiosity **permanently deleted every Safe Room** — all healing and all card
upgrading — with zero console output. It survived three playthroughs and made the balance
simulator disagree with the real game. `tests/scene-css/check.py` gates it.

**An invented CSS token is silent.** `var(--text-low)` when the token is
`--text-lo`: the declaration is dropped, the element keeps what it inherited,
and nothing appears in the console. The two-Kid Safe Room shipped with SIXTEEN
of them and rendered as unstyled text — caught only by looking at the screen.
`tests/css-tokens/check.py` gates it, and knows about the properties JS hands to
elements at runtime so `setProperty('--i', …)` is not a false positive.

**Listeners that fire too often, or never.** `turn:start` / `turn:end` are emitted for the
player AND for every enemy, so every Companion tracker in this build ran ~3x a round:
Marmalade's Untouched was decided by whichever enemy swung LAST and her whole archetype did
nothing in any multi-enemy fight, Bones' Buried countdown ticked 3x, Pipkin's Patch grew 3x.
Separately, a hook registered under a name nothing dispatches is completely silent — four
cards were written that way, one of them (`bones/tail-a-mile-a-minute`, a Rare) already
shipping with an empty handler on a hook that does not exist. `tests/turn-events/check.py`
and `tests/hook-names/check.py` gate both. See CONTRACTS traps 9-12.

**A duplicate key in an object literal silently wins.** `butler.js` declared `onTurnEnd`
TWICE; the second replaced the first with no error, no warning, and a green suite. The
half that expires his Discomposed status was dead for the whole build, and `discomposed`
never decays — so the first time a player earned the window he stayed Discomposed
forever, permanently taking 25% more and permanently unable to announce another House
Rule. `tests/dup-keys/check.py` gates it.

**A def method with no caller is not a mechanic.** Three of them shipped: the
Governess's `redirect()` (Stitched Together, her whole phase one), her `advancePatch()`
(the phase-two Patch cycle), and the Bedframe Beast's `modifyIncoming()` (its Covered
state). All three read as finished, tested content. `governess.doll()` additionally
looked up an actor `id` that is really a `defId`, so she could not see her own Doll.
This is the seams class again, arriving from the OTHER side — `tests/seams/check.py`
checks that call sites are real, and nothing checks that a def's own surface is called.
When you write a def method, grep for its caller.

**A card that "resolves without throwing" is not a card that works.** A smoke test that plays
every card and checks for exceptions passed all four dead cards above. Assert the EFFECT.

**A fixed sleep racing an animation is a test that lies both ways.** Four suites in
one day, all pre-existing, all surfaced by unrelated work shifting the timing
around them: `tests/map/run.py` waited 1400 ms for an 820 ms sweep that
`_whenVisible()` can hold back 2.5 s, and failed its MOUSE checks while the
keyboard ones passed — which reads exactly like the pointer-capture regression it
was written to catch. `tests/combat-scene/seam.py` waited for `.mm-hand__warm` to
be ABSENT, and it is also absent in the 60 ms gap between rehearsal waves, so it
counted the next wave's cards. Wait for a real signal — `.is-drawn`,
`hand.warming`, a scene name, `scenes.busy` — never for a number of milliseconds.
And `flush=True` on test output: stdout is block-buffered to a file while a
traceback is not, so an unflushed log claims the run died several checks before
it did.

**Measurement traps that produced wrong conclusions.** An averaged fps hides an entry stall. A
mock that implements the mechanic it tests proves nothing. `gl.finish()` is not a fence under
ANGLE. `page.evaluate` awaits returned promises, which makes every motion-strip frame land on the
end state. A `fetch()` 404 is a console error even when handled.

---

## 7. Corrections made to my own early mistakes — do not re-break these

I invented several things during scaffolding that contradicted the design doc:

| Was | Is | Note |
|---|---|---|
| "Pluck" (energy) | **Nerve** | doc uses Nerve 1538×, Pluck 0× |
| "Trinkets" (currency) | **Lost Things** | |
| Kid 8 "Lucy" / pet "Biscuit" | **Samir Haddad** / **Bean** | doc names Samir 628× |
| `petKind` for 5 of 8 pets | corrected + `petBreed` added | Orbit was listed a parrot; he's a cat |

**Pronouns are authoritative in `schema.js KIDS[].pronouns` and set by the designer**, not derived
from the doc: maya she · **mateo they** · amina she · **eli he** · priya she · **jordan he** ·
lena she · samir he. A pass over the doc's possessives read Mateo as he/him and was wrong. Never
infer a pronoun from a name; never re-derive from the doc. Copy must read the field.

---

## 8. Earlier — the boot stall

**No agents are running. Working tree is clean.** The most recent round is §9 (co-op);
this section is the round before it and is kept for the leads at the end of it.

The map "audio" problem is diagnosed and fixed. It was neither audio nor map-specific: a cold
boot blocked the main thread for ~5.5 s on **shader linking**, and `#scene=gameover` measured the
same 5283 ms. A CDP profile put 4975 ms in three.js `onFirstUse`, of which
**`gl.getProgramInfoLog` was 4194 ms** — on this ANGLE/D3D11 Intel UHD stack that call forces the
driver's deferred link at **400–750 ms per program**.

The warm-up was racing itself. `core/renderer.js` drew the scene straight to the canvas while
`_warming` was true, landing 6 ms after phase A created its first program and forcing every
subsequent program to link synchronously inside `setProgram`. The warm-up was dead code in
practice. Fixed by drawing nothing while warming, and by warming **both** program variants
(canvas-target and composer-target have different cache keys).

**Worst frame 1938 ms → 564 ms; total blocked ~5.5 s → ~2.2 s.** All scenes 61 fps, zero console
errors, look unchanged (0.023% of pixels differ, max channel delta 15/255).

The map itself also got: stylesheet no longer re-fetched on every entry (it was the only scene
that unloaded its `<link>`), grain tile cached instead of re-encoded, 64 `innerHTML` parses → 1,
three serial round trips made concurrent, and the entrance sweep promoted to a compositor op.
Route visible at **1.66 s**.

**What remains, and why 120 ms is not reachable on this hardware:** ~520 ms of the residue is
Chrome's own GPU rasteriser compiling Skia shaders on first paint — no script attribution, does
not scale with viewport, and `--disable-gpu-rasterization` drops it to 250 ms. Removing it needs
the map's paint-op vocabulary rendered once somewhere invisible during boot. Two smaller leads
are open: `data/keywords.js` costs 88–107 ms of module eval on the boot path via
`ui/hud.js` → `ui/tooltip.js` (a dynamic import in tooltip's first `show()` would remove it), and
three ~120–160 ms tasks from `atmosphere.setMood('blueprint')` now surface after the sweep.
Full detail in `docs/notes/2026-08-26-map-round-6-the-entry-stall-is-shader-linking.md`.

**Verified from fresh context afterwards** (`docs/notes/2026-08-26-entry-stall-verification.md`),
with a same-filesystem A/B and an identical-code control: map entry 1078 ms -> 765 ms (-29%) and
worst frame gap 650 ms -> 450 ms (-30%) both hold. There is a cost the round-6 commit does not
record: **~400 ms of blocked main thread now lands ~800 ms AFTER the sweep finishes**, where
pre-fix had exactly zero — four frames of 100-220 ms on a settled map the player is already
reading. Best guess, unproven: warm-up phases B/C now overlap the map entrance because the map
enters 313 ms sooner. Same driver work, later. Worth a look before anyone calls this closed.

## 9. MULTIPLAYER — playable end to end for two Kids

### The designer's decisions, 2026-08-27

Three of the four open decisions below are now made:

1. **Transport: Steam P2P.** This ends the no-build rule — it needs a wrapper
   shell. `shouldHandOff()` is still the single switch.
2. **Party size: FOUR.** `MAX_PARTY` is **4**, live from 2026-08-28. Done —
   see "A party of four, built" below.
3. **Reconnection is in scope and shapes the protocol**, decided up front rather
   than retrofitted, because mid-run disconnects are StS2's loudest complaint and
   the lockstep foundation already has what a rejoin needs.

**Decision 4 is made and built, 2026-08-28: AoE coverage, not the Courage
pool.** One AoE per phase (Dust Them Off hits every Kid; Enough of This carries
a declared splash of 6), seat preferences on the two single-target moves, and
the two House Rules whose Reprimand paid him GUARD now cost the player instead.
Measured: `tests/butler/run.py` (24 effect assertions), the party A/B in the
note §4, and a solo A/B at n=48. **His remaining LENGTH is the Courage pool**,
which stays the designer's call — the sweep on record puts him in the 8–12 turn
band at 0.65x.

### A party of four, built

Done on 2026-08-28, in the order this section used to prescribe: **the screen
first, then the constant, then the measurement.** `docs/notes/2026-08-28-party-of-four.md`.

- `scenes/select.js` offers 1..`MAX_PARTY` as a segmented count, **generated from
  the engine's constant**, so the screen and the engine cannot drift apart in
  either direction. The launch path generalised rather than branching:
  `party.length === 0` ("first of two") became `party.length < want - 1`.
- **3p/4p enemy Courage is now measured.** It was `[1, 2.2, 3.1, 4.0]`,
  extrapolated, and 3p and 4p both won **96%** against solo's 79%. StS2's curve
  is linear and that is nowhere near enough here, because enemy damage never
  scales: each added Kid multiplies the party's output AND its Courage while
  incoming damage per Kid falls. Measured parity is `[1, 2.2, 4.0, 5.7]`,
  confirmed at n=36 as 64 / 78 / 67 / 72%.
- Two bugs only four seats could show, both now fixed: `piles.js` emitted every
  pile event with **no owner**, so a four-Kid fight opened with the local Kid's
  fan holding cards from three different seats; and `get mate()` was
  `players[1 - seatIndex]`, so three friends showed as one.

**Still open, and a designer's call:** bigger parties finish with far more
Courage left even at matched win rates (26% solo → 62% at 4p). Raising Courage
further fixes the number and makes fights long rather than dangerous. The real
lever is **AoE coverage** — the compensation for "damage never scales" is
supposed to be targeting, and the Foyer's standard tier is thin on moves that
hit everybody. That is enemy content, not a constant.

### The route is voted, 2026-08-29

StS2's mechanic, taken whole from `docs/STS2-REFERENCE.md` §8.5: one shared
path, every player votes at every fork, a weighted roulette picks the winner,
ties break randomly, **the host has no special authority**, and a minority vote
can win in proportion to how many wanted it.

- `ACT.MAP_VOTE` is one seat's vote, decisive only when it is the LAST one
  owed — the same shape as `ROOM_DONE`. A party of one resolves on its own
  first vote and walks in exactly as before, so every solo suite is untouched
  and every map-clicking driver in `tests/playthrough*` still works.
- The draw is `fork('vote|<node>|<ballot>')`, **never `run.rng`**. That is what
  keeps a run byte-identical; the skipped draw for a unanimous ballot does NOT,
  and a control proved it. CONTRACTS 53.
- At one keyboard the sheet passes between Kids on the per-Kid-room veil, and
  each Kid's pin stays on the room they picked. Handing over does not replay
  the survey sweep — that left the blueprint blank for 3.5s per vote.
- When a number overrides the vote the party is told before they walk, which
  needed a beat in `resolveVote`: the first version of that announcement was
  measured at 200ms intervals and never caught on screen once.

**Measured, not asserted:** at three seats over 150 seeds the lone Kid gets
their way **32.0%** of the time against 33.3% expected (`tests/vote/run.py`).
Two seats cannot show this — a 1-vs-1 split is a coin flip whichever way the
weights work — which is why that suite exists next to `tests/net`'s wire half.

**Still open, and a designer's call:** whether a fork with only one legal exit
should open a ballot at all (it currently does, and resolves instantly), and
whether the beat before the walk is the right length at 1.5s.

**Two people can play the whole game on one machine.** "Go in together" on the
Companion/Kid select, pick your Kid, "Lock in & pass it over", your friend picks
theirs — and from there the screen keeps changing hands: combat turns, the
reward, Mr. Moth's, the Safe Room and Curiosities all pass over with an opaque
veil between them. Shared route, per-Kid everything.

Detail: `docs/notes/2026-08-26-multiplayer-engine.md` (the engine),
`2026-08-26-multiplayer-bosses.md` (the content), `2026-08-27-pass-and-play.md`
(two Kids at one screen). Contract summary: CONTRACTS.md § "Co-op: two Kids".

### Built and tested

`engine.players[]` and `run.kids[]` are the sources of truth. **Solo is a party
of one**, so there is no separate single-player path below construction — the
solo suite is unchanged at 651 assertions and the 50-run determinism sim is
unchanged through the entire refactor.

- **shared**: the route, the rooms, the enemies, the Haunt level, the seed
- **per Kid**: deck, Courage, Nerve, Guard, statuses, Keepsakes, Backpack,
  Snacks, Companion trackers and counters, card rewards, shop prices
- **simultaneous turns** — each seat ends its own; the enemy phase waits
- **fallen** at 0 Courage: keeps its seat, drops its hand, takes no turn, and
  comes back at 1 Courage if the team wins. All fallen = run over.
- **Racket**, the co-op taunt (fourteenth universal status)
- **thrown Snacks**: `useSnack(snack, targetId, { to: seat })`
- **Safe Room**: Mend (heal your friend 30% of their maximum instead of your own
  rest) and Clone (copy one of their Tricks — a copy; they keep theirs)
- **25 authored multiplayer-only Tricks**, 3 Uncommon + 2 Rare for each built
  Companion, OUTSIDE the 80 and never drafted solo
- the combat screen shows the other Kid: Courage, Guard, statuses, whether they
  are ready, and which enemy is winding up at them
- **per-seat turn counters.** `engine.stats` / `engine.playedThisTurn` are the
  TEAM mirror (an elite threshold worded "16 damage per player, all team damage
  contributes" wants it); a Kid's own cards, Keepsakes and House Rules read
  `e.seatStats(seat)` / `e.seatPlayed(seat)`
- **all three bosses' multiplayer rules**, from their region chapters: the
  Butler's per-Kid House Rules, thresholds and Flustered cap (§28), the
  Governess's per-Kid Stitched Together, repair windows and Doll Courage
  (§35), the Bedframe Beast's marked Kid across BOO and all three Bed
  Positions (§46)
- **per-player thresholds and per-Kid allowances** across the built Big Scares
  and ordinary enemies — Grand Coatcheck, Unwelcome Guest, Toy Chest, Blanket
  Blob, Blanket Creeper, Slipper Skitter, Thing Beneath
- **a shelf each at Mr. Moth's** — their Companion's pool, Keepsakes they do
  not own, their own prices and removal price, forked per seat so two Kids on
  one Companion do not race for the same card
- **choices know whose they are.** `ask({ seat })` reaches the picker only for
  `engine.localSeat`; anyone else's resolves from the request's `prefer` rule
  and is logged with its seat, so a replay can tell the two Kids apart
- **`Incoming` is one Kid's** — what is aimed at them plus anything splashing
  off a move aimed at their friend, against their own Guard
- **pass-and-play.** `run.setLocalSeat(n)` moves the seat and every per-Kid
  thing with it; `ui/handoff.js` covers the board with an OPAQUE veil between
  Kids, because a hand of Tricks is the one private thing in this game.
  Combat ends one seat at a time and the enemy phase waits, as it always did;
  the reward, Mr. Moth's, the Safe Room and Curiosities each hand over and the
  last Kid out closes the room. A round, and a room, always starts with seat 0

**The technique worth reusing.** In a party with the dev guard armed,
`engine.player` / `.piles` / `.relics` THROW and name the fix rather than quietly
resolving to seat 0. Running a real two-player fight produced the port list one
throw at a time — engine, then trackers, then the run layer, then the scene, then
the HUD, then a Keepsake. A shipped build still degrades to seat 0 rather than
throwing at a player mid-run.

### Balance: measured, not quoted

**CORRECTED 2026-08-28: every party number below was measured with a harness
that ran TWO enemy phases a round and a bot that could not see its own plan.**
They are kept for the record and for the reasoning, not as figures to build on.
The re-measured curve is in
`docs/notes/2026-08-28-butler-aoe-and-a-broken-instrument.md` §1, and it says
the Foyer standard tier is never in danger at any party size — flat 100% win and
zero falls, which is the curve doing its job on win rate. What is wrong is the
COST: solo pays 39% of its Courage for a Scuffle and four Kids pay 17%.

Enemy Courage at 2p is **220%**, and it took three measurements because the
sources disagree. Our own design doc says 160% (measures far too easy: duo wins
92% vs solo 80%).

**CORRECTED 2026-08-27:** this section used to say "StS2 actually uses 250%" and
frame our 220% as a deliberate divergence. That was wrong. StS2's published
formula is `MonsterHP × PlayerCount × ActScaling` with ActScaling ×1.1 in Act 1,
so their real two-player figure **is 220%** — we converged on them rather than
away from them, and there is no divergence to defend. Their scaling is also
linear in party size, which is what makes 3p/4p answerable. See
`docs/STS2-REFERENCE.md` §8.3 for the formula and its sources.

| | 1p | 2p |
|---|---|---|
| Scuffle win% (n=30) | 73 | **77** |
| Elite win% (n=20) | 55 | **55** |
| falls per fight | 0.27 | 0.57 |

Re-measured unchanged after the boss and per-player work on 2026-08-26.

**Solo boss Courage is now a live question.** Wiring the Governess's Stitched
Together moved her from 95% player wins at every Courage scale — the flat line
of a boss with no defence — to 54.2% and 10.1 turns, inside the 45–65% / 8–12
band for the first time, at the Courage she already had. The Butler moved the
other way on length: a true A/B at x1.0 reads 75% → 66.7% and 12.4 → 13.5 turns
(median 13 → 15). "He is not dangerous, he is long" is still true and the lever
is his Courage pool. That is a designer's call, so nothing was re-tuned.

Enemy DAMAGE never scales. The extra threat is targeting — AoE moves and
per-move seat preferences, wired from each region chapter. That half was missing
from the first pass and it broke the game at both ends: Scuffles got easier with
more Kids while Elites became unwinnable. `python tests/coop/balance.py`
re-measures; re-run it after any change to enemy damage, starting decks or the
co-op pool.

### NOT built — and it is one thing

**Up to four Kids can play the whole game on one machine.** Pass-and-play is
built: combat turns, the reward, Mr. Moth's, the Safe Room and Curiosities all
hand the screen over with an opaque veil between them, and `run.setLocalSeat(n)`
moves every per-Kid thing at once. `tests/coop/hotseat.py --party 4` drives four
Kids passing the screen around; `tests/coop/playthrough.py` walks an expedition.

**Networking is the only remaining item, and half of it now exists.**
`docs/notes/2026-08-28-netcode.md`.

BUILT on 2026-08-28 — the transport-agnostic session (`game/src/net/`):

- inputs on the wire, never state, on top of the deterministic RNG + choiceLog +
  digest that were already here
- a total order of `(turn, seat, seq)` — seat breaks the tie, never arrival time
- board-digest divergence detection, reported loudly and once
- reconnection by replaying the input log, which is what a local resume already
  does
- two working transports: an in-page `LoopbackHub`, and a `ChannelTransport` on
  `BroadcastChannel` that makes two browser TABS two independent instances
- `tests/net/run.py` — 33 checks driving two complete Sessions against each other

BUILT on 2026-08-29 — the game-side half (`game/src/net/actions.js`):

- **every screen routes through `act(run, input)`**: the reward, Mr. Moth's, the
  Safe Room, the Curiosities and COMBAT. One applier for a local input and a
  remote one alike, so an ordering bug shows up in a one-machine test.
- `run.asSeat(seat, fn)`, the run-layer twin of `engine._asSeat` — and it
  deliberately does NOT move `engine.localSeat`, or replaying a remote Kid's
  Trick pops their choice in front of everybody at once.
- nothing puts a uid on the wire: an index into an offer, a shelf or a deck, or
  an authored id.
- **`seat` on an input is who ACTED**; an action aimed at somebody else uses
  `to`, because `session.input()` refuses a message claiming another seat.

NOT built:

1. **A transport that reaches another machine.** Steam P2P per the decision,
   which needs the wrapper shell and ends the no-build rule. One file, five
   methods, and the two rules the interface spells out (ordered per sender,
   never delivered back to the sender).
2. ~~Routing each screen's actions through `session.input()`.~~ **DONE
   2026-08-29.** The table below is kept because it is still the right map of
   what each seam means with a wire.

   | Seam | Today | With a wire |
   |---|---|---|
   | `ui/handoff.js` `shouldHandOff()` | true in a party, so the screen is passed | **already answers false** for a session with `remote` |
   | the **select** | the next player picks on the same screen | they pick on theirs |
   | **card + Keepsake reward** | rolled per Kid; each takes theirs in turn | each screen shows its own |
   | **Mr. Moth's** | a shelf per Kid, taken in turn | each shelf on its own screen |
   | **Curiosities** | one room, each Kid answers it in turn | answered at the same time |
   | the **choice broker** | a request for another seat resolves from its `prefer` rule | it reaches that player's picker |

   The choice broker's fallback is not a placeholder — one player rummaging in
   another Kid's hand would be worse than a stable rule — so it stays as the
   offline path. **DONE 2026-08-29:** `ChoiceBroker.setRemote()` is where a wire
   plugs in, and the fallback is untouched. Two things about it are load-bearing
   and easy to undo: the answer is delivered OUT OF BAND (`session._accept`),
   because `ask()` is awaited from inside the input the queue is applying and
   queueing the answer behind it is a deadlock; and a request naming NO seat
   still belongs to one over a wire (`engine.acting`), or all four clients
   answer it and answer it differently.
3. ~~**Lobby and seat assignment.**~~ **DONE 2026-08-29** — `net/lobby.js`.
   Seat is position in the SORTED PEER-ID LIST, host is seat 0, and the seed is
   a hash of the room code, so four clients compute four identical answers with
   no election, no round trip and no tiebreak. "First to connect is seat 0" is
   the tempting wrong answer and it is the one thing lockstep cannot use.
   **The lobby SCREEN is not built and is a design question** — what it looks
   like, how a code is shared, whether joining is a Steam invite or a typed room
   name. `ChannelTransport` already makes two tabs a real two-player lobby.
4. **Two players reaching for the same Keepsake.** StS2 resolves that with
   rock-paper-scissors. Every Kid gets their own offer and nobody can reach for
   somebody else's, so there is nothing to resolve until the wire exists.

**Every Companion's co-op pool is written.** All 16 shipped their three Uncommon
and two Rare multiplayer-only Tricks with them, in `def.coopCards`, outside the
80 and never drafted solo.

### Lockstep foundation

The deterministic RNG, `choiceLog` and `setChoiceScript` replay are a genuinely
good base — the run layer already uses them to reconstruct an interrupted fight
and verify it against a board digest, and that digest now covers every seat.
Seats shuffle in seat order off the one shared RNG, so the same seed deals the
same opening hands to the same Kids.

## 10. Where things are

```
game/src/{core,combat,data,scenes,ui,fx,audio,state}/   the game
docs/design/            45 carved design files
docs/notes/             46 per-agent notes (one file per agent — never a shared file, see below)
docs/STS2-REFERENCE.md  the yardstick every critic judges against
docs/CRITIC-BRIEF.md    how a critic works, and the required output format
docs/CARD-AUDIT.md · docs/ENEMY-AUDIT.md · docs/AUDIO-MAP.md
CONTRACTS.md            file ownership, non-negotiables, the traps list
shots/                  every screenshot + .state.json (gitignored)
```

**Notes are one file per agent** under `docs/notes/`, indexed by a row in `docs/NOTES.md`. A
single shared append-only file was tried and two agents lost their sections to concurrent writes.

**Do not `git add -A` while agents are editing.** Four agents had in-flight work swallowed by
unrelated commits — one had an entire `music.js` rewrite land inside a commit titled "Pronouns per
the designer", which then made a later revert restore the wrong version. Commit explicit paths.
