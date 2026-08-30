Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

Read HANDOFF.md first — it opens with a "Where it stands" block and a numbered
list of what is open. Then CONTRACTS.md, which is at 54 traps. Then, for the
last two sessions:

  docs/notes/2026-08-29-the-map-was-writing-the-run.md
  docs/notes/2026-08-29-the-route-is-voted.md

Don't read the design doc whole; it is carved into docs/design/. And read §8 of
docs/STS2-REFERENCE.md before deciding what to work on — see below.

STATE: branch dev, tree clean, everything pushed. Do not trust a HEAD hash
written here — naming one dates this file the moment it is committed, which is
how two handoffs in a row went stale. Run `git log --oneline -12`. Pushing to
origin/dev was authorised on 2026-08-29; ask again if that is no longer live.
Dev server does not survive a restart:

  python tools/devserver.py 8777

EVERYTHING IS GREEN, and the battery below was RUN on 2026-08-30 rather than
copied forward. Not "green except one".

━━ THE ONE THING TO UNDERSTAND BEFORE YOU CHANGE ANYTHING ━━

**Three separate systems were fully wired, fully documented, and doing nothing.**
Not subtly wrong — inert, for months, while every suite stayed green:

- **Six of the eight WING CONDITIONS.** `state/mapgen.js` HAZARDS declares
  eight, every blueprint places two to four, and the map shades the area, prints
  the name along the footer, lists it in the legend and renders its rule in the
  hover card. A search for each id returned mapgen and nothing else, for six.
  The player was told "Guard is halved" and nothing halved anything.
- **33 of audio.js's 38 BUS SUBSCRIPTIONS.** `combat/engine.js` forwards engine
  events to the bus as `combat:<type>`; audio listened for the bare names. Two
  `EV` entries are themselves `combat:start`/`combat:end`, so the bus literally
  carried `combat:combat:start`. Twelve authored cues could be played by nothing.
- **The whole audio MIX LAYER.** `tension()` and `telegraph()` are public, were
  written in the sound pass, and had no caller anywhere, so `_effTension()` was
  permanently 0. The bed never darkened as Courage fell and there was no warning
  before a big hit.

All three are fixed and gated. The lesson, now CONTRACTS 54: **content that
describes itself will be believed.** A table with ids and rule sentences reads
like an implementation. A note saying "audio.js listens on the bus and needs no
calls from anyone" reads like a contract. Neither is a call.

**When you build a gate, prove it can SEE the file you care about before you
trust the number it prints.** `tests/bus-names/check.py` printed "0 dead
subscriptions" while blind to the file holding thirty of them, because its regex
needed a literal `bus.on('x')` and audio.js subscribes through a local alias.

**Its sibling, CONTRACTS 55: the id namespace is not what the player reads.**
The Lights Are Out correctly gave itself its own status id, because Hush owns
`unseen` and it does not stack — then correctly named it "Unseen", because that
is what the wing's rule promises. Two locally right decisions put two statuses
behind one word, on one glyph, with two unrelated break rules. **No single file
was wrong.** The collision existed only where they met, on screen, which is the
one place no unit test was pointed. `tests/status-names/` gates the class, and
reads the REGISTRY rather than the source because statuses are declared in three
shapes and the browser finds 268 where a regex finds 256.

**And a screenshot is not optional.** On 2026-08-30 `tests/chrome` (27 checks),
scene-css, css-tokens, seams and stdlib-shadow ALL passed while `select.js` was
a syntax error and the screen rendered nothing at all. One suite caught it, as a
30-second Playwright timeout that reads like a flake. A browser probe for
pageerrors named it in one line:

  python tools/shot.py <name> --scene select --wait 4

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Every number below was
RUN on 2026-08-30, not copied forward; if one differs, that is the finding.

  python tests/cards/run.py               1468 cards, 0 errors, 0 warnings
  python tests/combat/run.py              694     ← +5, the card:retain event
  python tests/coop/run.py                645
  python tests/net/run.py                 158     ← +6, the turn barrier
  python tests/enemies/run.py             37 enemies, 0 errors
  python tests/enemies/audit.py           2085 turns, 0 errors
  python tests/run/run.py                 50 runs, 0 errors
  python tests/backpack/run.py            80 checks, 0 failures
  python tests/map/run.py                 30
  python tests/vote/run.py                35      ← the route ballot
  python tests/wings/run.py               44      ← the eight wing conditions
  python tests/haunt/run.py               21      ← the two Haunt ladders
  python tests/combat-scene/seam.py       22
  python tests/hand-cards/run.py          40      ← the nine cards that did nothing
  python tests/piles-reachable/run.py     24      ← every pile openable, or exempt
  python tests/settings-play/run.py       19      ← the two Play toggles
  python tests/gameover-keeps/run.py      16      ← the invented Keepsakes
  python tests/audio/run.py               46 cues, 0 errors
  python tests/chrome/run.py              27 checks, 0 errors
  python tests/cards-feel/run.py          exit 0
  python tests/critic-design/anchor.py    6/6 agree

  ELEVEN gates, each must stay at zero:
    tests/seams/check.py          6267 call sites, 0 problems
    tests/bus-names/check.py      0 dead subscriptions, 0 advisory
    tests/audio/cues.py           46 cues, 45 reachable, 1 known-silent
    tests/status-names/check.py   268 statuses, 0 unwaived name collisions
    tests/party-tells/check.py    13 party moves, 0 tells that address one Kid
    scene-css · css-tokens · dup-keys · hook-names · turn-events · stdlib-shadow

  `tests/hook-names/check.py` reads "76 declared" as of 2026-08-30 and did not
  before. It had always checked `hooks.add(name)` call sites and `U.onHook`, and
  had never looked at the `hooks: { … }` object literals on statuses, relics and
  enemy defs — the biggest surface in the game. The two regexes for it sat
  UNUSED at the top of that file and the gate reported green over them. They are
  wired up now, with a brace scan rather than a line regex, and proved seeing.

  `tests/enemies/audit.py` reads 2085 and not the 2093 an older note quotes.
  That is the Butler's pool going 165 → 149: a shorter boss is fewer audited
  turns. It is the expected consequence of a committed change, not drift —
  which is exactly the kind of thing this list exists to let you tell apart.

  fourteen effect-asserting Companion suites:
    boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8      plus butler 38 · governess 56

  SIX co-op screens, all "0 failures, 0 console errors":
    tests/coop/selectscreen.py · hotseat.py · rooms.py · playthrough.py
    tests/coop/lobby.py     20 checks ← two tabs, one seed, and a vote that CROSSES
    tests/coop/matedeck.py  11 checks ← a friend's deck and Keepsakes, and they are THEIRS

━━ WHAT IS OPEN ━━

HANDOFF.md carries this in full. **Every design call the designer was holding
was delegated back on 2026-08-29 — "fix as you deem fit, overrule anything
previously written" — and all of them are resolved.** What is left is blocked
on a person or a machine, or is a decision with the reason already written down.

1. **Steam P2P is APPROVED and BLOCKED, and only Josh can unblock it.** It needs
   a **Steam App ID**, which needs a Steamworks partner account, a fee and a
   registered app. Nothing in this repo can produce one, so do not start
   `SteamTransport` expecting to finish it. `net/transport.js` is ready — five
   members, two working implementations, "a third file rather than a rewrite".
   It also ends the no-build rule, which is a real change to how the project is
   developed and not a side effect to absorb quietly.

   **It is no longer the last piece, and calling it that was the mistake.**
   `net/lobby.js` had been written, documented and TESTED since 2026-08-28 with
   nothing in `game/src/` importing it — no host UI, no join UI, no code field
   anywhere, every `join` in the scenes an `Array.join()`. Steam would have
   landed and there would STILL have been no way to start a networked game.
   **The Treehouse (`scenes/lobby.js`) is built as of 2026-08-30** and works
   today over `ChannelTransport`: two tabs are two Sessions, two Runs and two
   boards from one seed. `tests/coop/lobby.py` drives both at once, 15 checks.
   Steam now genuinely is one constructor.

   Tested code is not reachable code. A suite that only ever builds a `Lobby`
   in a harness cannot tell the difference — CONTRACTS 54 with the serial
   numbers filed off.

2. **The same-turn netcode race.** The cross-turn half is CLOSED — the turn
   barrier and idle heartbeats were built 2026-08-29 and never needed the
   transport. What remains is two seats acting at once with their inputs
   crossing, and closing it needs ROLLBACK (rewind to the top of the turn and
   replay; `_resumeCombat` and the digests are most of that machinery) or a
   SEQUENCER stamping a global order, which reintroduces the host-dependency
   §8.11 calls StS2's loudest weakness. Both are named in `_heldByBarrier`.
   The transport decides the latency budget that picks between them, so this
   genuinely waits on item 1.

3. **A party wins Foyer elites 100% of the time, against 83.3% solo — and this
   is NOT a question for the designer.** It was written up as one and that was
   wrong: `foyer.js` already records the authored target in its own balance
   note. Elites run **8–12 turns** and land near **88.9% for a competent
   player**, tuned so region survival sits in a **65–78% band** — the arithmetic
   is that ~0.83 Big Scares per path means a 73%-win elite removes 18% of runs
   before the boss is seen. So the target exists, our solo bot reads 83.3%
   against it, and a party at 100% is above the band.

   Two changes this session moved the party economy hard toward it — pierce,
   then Wrong Face reaching two Kids — and "Courage left over solo" went
   +9.2 / +15.6 / +21.3 → +0.4 / +6.5 / +13.0, with two Kids now finishing
   level with a soloist. `win%` did not follow. The remaining gap is most
   likely a bot that plays elites very well, and CONTRACTS 47 is this project
   having already fitted a curve to a broken bot once. **Measure the bot before
   adding content.**

4. **ONE KID TAKES THE FIGHT AND THE REST WATCH — measured, both tiers, every
   party size.** `spreadOf` is 0 when one seat takes all the damage and 1 when
   it is shared evenly. Three ledger runs, 12 fights per cell:

       elite, before pierce   2p 0.177   3p 0.203   4p 0.209
       elite, after pierce    2p 0.181   3p 0.163   4p 0.259
       standard tier          2p 0.144   3p 0.198   4p 0.278

   Three Kids in four are spectators as far as incoming threat goes. It is one
   cause for BOTH tiers' rising "Courage left" lines (+16 / +20 / +23 over solo
   at the standard tier), and it makes those lines substantially an averaging
   artefact — averaged over Kids who were never in danger. More importantly it
   is a co-op FEEL problem no win rate would ever surface.

   **It also reframes AoE.** "AoE is added damage a party then blocks" is true
   and is why pierce was right for DIFFICULTY. But AoE's value here is
   PARTICIPATION — it is what puts the other three Kids in the fight. Measure
   `spread` for that and `%blocked`/`landed` for difficulty; they are different
   problems. `spread` is in every ledger row and was never printed, which is
   why nobody had looked at it.

5. **fps is CLOSED and the ENTRY STALL is REAL** — both sampled 2026-08-30,
   and they went opposite ways, which is the point.

   fps: eleven of eleven readings at 61. The 52 was a busy machine.

   The stall: `tools/entryprof.py --goto combat`, thirteen runs, 1150–2217 ms
   against a 1200 ms budget, **eleven of thirteen over**. "Timings swing 2x, do
   not chase them" had been carried for three sessions on three samples, one of
   which passed. And it is not all at entry — ~250 ms before the scene enters,
   ~550 ms after, then evenly spaced triplets of ~100–130 ms at t+1.5 s and
   again at t+3.3 s. Combat keeps hitching for seconds. **That triplet shape is
   the lead to follow.**

   **The cause is found.** Six `toDataURL` calls, 274 ms, worst 122 ms, zero at
   the title, all from `cardart.js render()` line 352 — a synchronous PNG
   encode. Not JS (1289 of 1398 ms sampled is native), not shader linking (that
   is a boot cost), not texture upload (0.1 ms). "THE CARD-ART HITCH DOES NOT
   REPRODUCE" has been in HANDOFF since 2026-08-26 and is wrong: the earlier
   probe instrumented `render` and the cost is the `toDataURL` inside it.

   Pre-warming the encoder was tried and REJECTED — it works in isolation and
   does nothing in the real transition. The fix is `toBlob` plus object URLs,
   scoped in `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`, and the
   note carries the probe that will tell you whether it worked.

   Do not subtract a `--scene` run from a `--goto` run: `--goto` already filters
   out page boot and `--scene` does not. The tool's docstring says so because
   that error was made and briefly believed.

6. **Two cues are known-silent and need something built first**, with their
   reason in `tests/audio/cues.py`: `combat:crit`. There is no crit in this
   game — the only crit flag in the repo is the soundboard's own test payload —
   so wiring it means designing critical hits, which nobody has asked for.
   `card:retain` came off this list on 2026-08-30: it was never a missing
   feature, only a missing event.

   **A SWEEP LEFT A PILE OF WORK AND SIX OF IT ARE NOW DONE, 2026-08-30** —
   every item the previous handoff named as the best-evidenced work available.
   `HANDOFF.md` carries the detail. Closed since: the two Play toggles
   (`autoEndTurn`, `confirmSingleTarget`) are implemented rather than removed;
   the nine unplayable Status/Curse cards in `data/neutral.js` do what they
   print, through a new `handHooks` seam on CardDef; `gameover.js` stopped
   inventing Keepsakes for real runs, and its fallback table — seven entries,
   all seven wrong — is gone; DeckView's Vanished pile has a button, and its
   header's claim that combat.js sorts the draw pile is corrected (it does not;
   the no-oracle guarantee rests on DeckView's own default alone). Four new
   suites, each with the control that runs the same board WITHOUT the change,
   and each proved red against the old code before being believed.

   **STILL OPEN AND UNBLOCKED:** `ANIMATED_EVENTS` exported and read by nothing
   (5 of its 23 events have no animator case), and the other 100-odd findings.

   The sweep returned 111 findings and its own log claims all 111 survived
   the skeptics. **That is my orchestration bug, not a result** — the verdict
   join was on an unstable string, so 87 were kept unchecked. 24 are really
   verified; the rest are leads carrying their finder's own searches. The
   full list is `docs/notes/2026-08-30-the-unreachable-sweep.md`.

   **What the six taught about that split:** two came from the verified 24 and
   FOUR were unverified leads, and every one was real when checked. One was
   WORSE than reported — the gameover fallback table's two surviving ids turned
   out to carry invented rules text as well, so it was seven entries and seven
   wrong rather than five missing out of seven. The previous handoff called all
   of them "the 24 verified sweep findings" and was wrong about four. So the 87
   are worth reading. They are still not worth trusting unread, which is the
   same sentence with the verb changed, and it is the whole point.

7. **The vote beat is 3.0 s and that was arithmetic, not a playtest.** It sat
   open for three sessions as "unplaytested" and never needed a playtest — it
   needed the words counted. The announcement is ~18 words; on-screen reading
   runs 200–250 wpm, so it takes 4.3–5.4 s to read and 3.6 at a skim. **1.5 s
   was a third of what its own message needs.** The old 1.5 cleared a measured
   1.4 s floor, but that floor was about the card still EXISTING, not about
   anyone reading it. 3.0 rather than 5.4 because the message repeats and a
   familiar reader checks two things, ~6 words.

   What a person could still confirm, having seen it: whether 3.0 feels long on
   a third of forks. And the better fix is a scene-layer one — let the verdict
   survive the transition instead of being covered by it (`scenes.go` veils
   before `exit()`), and the beat could go back to being short.

**Resolved on 2026-08-29/30, so you do not re-open them:** both authored wing
rules (Long Shadows is "Guard you GAIN is halved" — the literal reading is
backwards, not merely inert; The Lights Are Out's status is **Lurking** now, not
"Unseen", which was Hush's word); the single-exit ballot (a door is not a fork);
Crinkle's chapter (ACCEPTED — 90 Tricks named against 90 built, zero drift);
the Butler (in both halves of his brief for the first time, 64.6% at 11.5
turns); the Haunt ladder (two ladders, and it advances at all now — it never
did); and the two remaining §8 levers, DECLINED with reasons in the reference
rather than left reading as oversights.

━━ THINGS THAT WILL SAVE YOU A ROUND ━━

- **HANDOFF's open list is not the only open list.** `docs/STS2-REFERENCE.md` §8
  carries its own "For us:" verdicts and nothing syncs them. On 2026-08-29 the
  handoff's number-one item was a balance question while §8.5 had been calling
  the map route "the largest co-op gap we have" since it was researched. When
  you close one, update the reference's verdict too — it is a claim about the
  code, and a stale one reads as a gap that is still open.
- **ROOM inputs COMMUTE; COMBAT inputs do not.** Every room act works on the
  sender's own Kid or adds to a shared counter; `map.vote` writes one seat's
  slot in a ballot whose resolution sorts the seats itself; `end` commutes
  because the enemy phase falls out of the LAST seat to close. Only `play` and
  `snack` reorder the board. This is why a late-input warning must be narrow —
  both clients apply their own input as they issue it, so whichever seat acts
  second always sees the other's arrive late, and a guard that shouts about it
  shouts six times during an ordinary reward screen.
- **The route is VOTED.** A single click no longer moves the party: every living
  Kid votes, and a weighted roulette settles a split so a minority vote can win.
  Any harness that clicks a map node with a PARTY needs one vote per Kid with
  `.hoff__go` between them — `tests/coop/hotseat.py` timed out at `#end-turn`
  until it was taught to. Solo still resolves on its first vote, which is why
  every solo driver was unaffected.

━━ THE WORKING METHOD ━━

- Read the whole design chapter before writing anything.
- **Every fix gets a test that asserts the EFFECT, and you verify it FAILS
  without the fix.** This is not ceremony. In the last two sessions it caught
  four checks that could not fail — including one whose own comment named it as
  the control for the line it could not test.
- **A control has to be re-checked whenever the thing under it moves.** A
  `PARTY_ACTS` control stopped failing when the route became a ballot, and
  nothing said so; it kept passing. CONTRACTS 52 and two notes cited it.
- For any "X is what protects Y": break X and watch Y break. If Y survives, the
  credit belongs somewhere else and the check is decorative.
- A measuring instrument is CODE and can be wrong. Suspect it first when a
  measurement surprises you — and suspect your own analysis script: three
  separate greps in one session produced three different wrong answers about the
  audio wiring before a browser probe settled it.
- **TAKE A SCREENSHOT.** It found a blank blueprint after every vote and an
  announcement that was never once on screen, both with every suite green.
      python tools/shot.py <name> --scene map --wait 2
- ONE Playwright run at a time.
- Commit with explicit paths, message via `git commit -F` — backticks in a `-m`
  string get eaten.
- Scripted edits: this repo is MIXED per file (CONTRACTS + HANDOFF are both
  CRLF with bare-LF runs). Read with `newline=''`, convert to LF, patch, convert
  back, and check `git diff --stat` — a 370-line diff for a two-paragraph edit
  means the endings flipped. Heredocs in the Bash tool eat backslash escapes:
  one of them wrote a literal 0x08 into a checked-in file that parsed clean.
  Write patch scripts with the Write tool and run them with `python <path>`.

━━ NOT THE JOB ━━

- Do not change `PARTY_HP_SCALE`; it was re-measured on a repaired harness.
- Do not chase fps on this machine as it currently is.
- Do not re-open the card-art encoder question — it does not reproduce.
- Do not re-wire audio's dead bus names. `scenes/combat.js` plays thirteen of
  those cues directly, timed to its FX, and reviving the handlers would stack a
  second voice on every one. The note in `_wireBus` says so.
- Do not redesign Crinkle — his chapter is accepted, checked against the build.
- Do not start Steam P2P until Josh has a Steam App ID; see item 1.
- Do not tune the Butler or the Foyer elites by feel. Both were measured this
  session and both have a committed before/after in `tests/critic-design/`.
- Do not build AoE for the ELITE tier. The ledger's own note is that AoE is
  added damage a party then blocks, and only pierce is kept — measured.

Start by telling me what you'd do first and why.
