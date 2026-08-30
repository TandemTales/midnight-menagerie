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
written here — naming one dates this file the moment it is committed, which
is how the last two handoffs went stale. Run `git log --oneline -5`. What is
durable: the last commit to touch CODE is 7b52920, and everything after it is
this document, so the battery numbers below still stand. Pushing to origin/dev
was authorised on 2026-08-29; ask again if that is no longer live. Dev server
does not survive a restart:

  python tools/devserver.py 8777

EVERYTHING IS GREEN. Not "green except one" — every suite and every gate below
was run at 7b52920.

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

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Numbers are from
7b52920; if one differs, that is the finding.

  python tests/cards/run.py               1468 cards, 0 errors, 0 warnings
  python tests/combat/run.py              689
  python tests/coop/run.py                645
  python tests/net/run.py                 152
  python tests/enemies/run.py             37 enemies, 0 errors
  python tests/enemies/audit.py           2093 turns, 0 errors
  python tests/run/run.py                 50 runs, 0 errors
  python tests/backpack/run.py            80 checks, 0 failures
  python tests/map/run.py                 30
  python tests/vote/run.py                30      ← the route ballot
  python tests/wings/run.py               35      ← the eight wing conditions
  python tests/combat-scene/seam.py       22
  python tests/audio/run.py               46 cues, 0 errors
  python tests/chrome/run.py              27 checks, 0 errors
  python tests/cards-feel/run.py          exit 0
  python tests/critic-design/anchor.py    6/6 agree

  NINE gates, each must stay at zero:
    tests/seams/check.py          6178 call sites, 0 problems
    tests/bus-names/check.py      0 dead subscriptions, 0 advisory
    tests/audio/cues.py           46 cues, 44 reachable, 2 known-silent
    scene-css · css-tokens · dup-keys · hook-names · turn-events · stdlib-shadow

  fourteen effect-asserting Companion suites:
    boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8      plus butler 38 · governess 56

  four co-op screens, all "0 failures, 0 console errors":
    tests/coop/selectscreen.py · hotseat.py · rooms.py · playthrough.py

━━ WHAT IS OPEN ━━

HANDOFF.md carries this in full. In short, and honestly: **there is no defect on
the list.** What is left is one measurement, one machine problem, and decisions
that are the designer's.

1. **Party cost is 15–30 points from solo, and it may not be a problem.** Read
   §8.3 of the reference first: StS2 scales enemy HP linearly and does not scale
   damage either, and its verdict on our matching design is "Keep it; it needs
   no defending". Nobody has a figure for how much HP an StS2 party finishes a
   fight with, so the 15–30 has no source behind it.
   **What DOES need doing: re-measure.** The sagging wing charges every Kid now
   instead of one, and five wings that did nothing now do something. Party
   economy has moved and no table in the repo reflects it.
       python tests/critic-design/party-ledger.py --tier elite --region foyer
2. **fps and the entry stall need a quiet machine.** Several perf claims in
   older notes do not reproduce. `tests/chrome` read 52 on one battery and 61 on
   another with no perf work in between.
3. Steam P2P (designer; ends the no-build rule) and Crinkle's chapter (designer
   review — it is a reconstruction by Claude, marked as such, unreviewed).

**Design calls waiting on a person.** None is a defect; each is a place the code
chose and a person should confirm:

- **Two authored rules could not be carried as written.** Long Shadows read
  "Guard is halved at the start of each of your turns" — Guard is already WIPED
  there, so it is "Guard you GAIN is halved" now and mapgen's text was reworded
  to match the code. The Lights Are Out read "2 Unseen"; `unseen` is Hush's, it
  does not stack and its break rules live in his card code, so the wing uses its
  own status displayed as "Unseen".
- A fork with only one legal exit still opens a ballot and resolves instantly.
- The 1.5 s beat before the party walks into a voted room is unplaytested.

**Two cues are known-silent and need something built first**, listed with their
reasons in `tests/audio/cues.py`: `combat:crit` (there is no crit in this game —
the only crit flag in the repo is the soundboard's own test payload) and
`card:retain` (no retain event is emitted).

**One netcode case is left and it needs the transport.** `session._pump` applies
the log in order now, so anything arriving in the same turn of the event loop is
sorted first. An input arriving in a LATER task cannot be put back in its place.
That is harmless for room inputs — see the commutativity rule below — and
reported as a desync for a PLAY or a SNACK. Closing it needs a turn barrier and
idle heartbeats, which belongs with Steam P2P.

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
- Do not redesign Crinkle, and do not start Steam P2P, without the designer.

Start by telling me what you'd do first and why.
