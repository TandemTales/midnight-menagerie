Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

Read HANDOFF.md first, then CONTRACTS.md. Both were brought up to date on
2026-08-28 and are trustworthy — HANDOFF opens with a "Where it stands" block.
Then read docs/notes/2026-08-28-butler-aoe-and-a-broken-instrument.md, which is
the whole of the last session and the reason several numbers you will find in
older notes are marked as untrustworthy. Don't read the design doc whole; it is
carved into docs/design/.

STATE: branch dev, tree clean. The last code commit is e239740, "The Foyer boss
is winnable in co-op again"; anything after it is documentation. Dev server does
not survive a restart:
python tools/devserver.py 8777

**88 commits are unpushed.** Every previous session pushed to dev at the end;
the last one did not, and did not have permission to. Ask the designer before
pushing.

Everything is green except ONE known failure: tests/chrome's 60fps check, at
54–56 against a threshold of 58. That is real and diagnosed — see §4 below.

━━ THE JOB: A GAUNTLET LOOP TO FINISH THE GAME ━━

Work in a loop, not in a straight line. One pass of the gauntlet is:

  1. RUN THE BATTERY, one suite at a time, never two at once (CONTRACTS trap 7:
     two overlapping Playwright runs make suites fail in ways that look like
     bugs and are not).
  2. Take the first real failure. Reproduce it before believing the list.
  3. Fix it, with a test that asserts the EFFECT, and verify the test FAILS
     without the fix. This is not optional — see the working method.
  4. Re-run the affected suites, then the battery.
  5. Commit with explicit paths and a message that carries the numbers.
  6. Go again.

The battery, in the order that finds things fastest:

  python tests/cards/run.py            1468 cards, 0 errors, 0 warnings
  python tests/combat/run.py           677
  python tests/coop/run.py             604
  python tests/net/run.py              33
  python tests/enemies/run.py          37 enemies, 0 errors
  python tests/enemies/audit.py        2018 turns, intent === delivered
  python tests/run/run.py              50 runs, 0 errors
  python tests/backpack/run.py         80
  python tests/map/run.py              23
  python tests/combat-scene/seam.py    22
  python tests/audio/run.py            46 cues
  python tests/chrome/run.py           27 checks, 1 error (the fps one)
  python tests/critic-design/anchor.py 5/5   ← the party harness's own anchor

  seven gates, each must stay at zero:
  tests/seams/check.py · scene-css/check.py · css-tokens/check.py
  dup-keys/check.py · hook-names/check.py · turn-events/check.py
  stdlib-shadow/check.py

  sixteen effect-asserting Companion suites plus two boss/mechanic ones:
  boggle 30 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 5 · truffle 27
  drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52 · crinkle 44
  butler 26 · pipkin 18

  co-op screens, all "0 failures, 0 console errors":
  tests/coop/selectscreen.py --party 4 · hotseat.py --party 4 · rooms.py
  playthrough.py

━━ 1. MULTIPLAYER IS THE PRIORITY, AND IT IS FOUR THINGS ━━

Networking has a foundation and a proof, not a feature.
docs/notes/2026-08-28-netcode.md lists exactly what exists. Built: the
transport-agnostic lockstep session, inputs-on-the-wire, a total order of
(turn, seat, seq), board-digest divergence detection, reconnection by replaying
the input log, and two working transports (an in-page LoopbackHub and a
BroadcastChannel ChannelTransport that makes two browser TABS two independent
instances). tests/net/run.py drives two complete Sessions against each other.

What is left, in the order I would do it:

  a) ROUTE THE REMAINING SCREENS THROUGH session.input(). Combat is exercised;
     the card/Keepsake reward, Mr. Moth's, the Safe Room and Curiosities still
     act locally. HANDOFF §9 has the seam-by-seam table. Each is a call-site
     change, not a design question, and it is the largest remaining chunk that
     can be done entirely in-repo. Do this first.

  b) LOBBY AND SEAT ASSIGNMENT. Who is seat 0, who hosts, how the seed is
     agreed. `Session` takes all three as constructor arguments today.

  c) THE CHOICE BROKER over a wire. A request for another seat currently
     resolves from its `prefer` rule and is logged with the seat. That fallback
     is deliberate for local play — one player rummaging in another Kid's hand
     would be worse — so with a wire it should reach that player's picker and
     keep the rule as the offline path.

  d) STEAM P2P. One file, five methods, and the two rules the interface spells
     out (ordered per sender, never delivered back to the sender). This ENDS THE
     NO-BUILD RULE because it needs a wrapper shell, so do it last and expect
     CONTRACTS non-negotiable 1 to need rewriting when you do.

`shouldHandOff(run)` is still the single switch: a session that owns one seat
answers false and every pass-and-play handoff stops happening. Never test
`run.partySize` yourself.

━━ 2. MULTIPLAYER BALANCE IS HALF-MEASURED, AND THE HALF THAT IS NOT IS A BOSS ━━

Last session found the Foyer boss was **unwinnable at three and four Kids** —
0%, not merely hard — and fixed it. Read §8 of the note before touching any of
this. The short version:

  - `PARTY_HP_SCALE = [1, 2.2, 4.0, 5.7]` was derived from tests/coop/balance.py,
    which fights the STANDARD TIER, and then applied to every enemy in the game.
  - Bosses had never been measured at any party size. When they were, the Butler
    read 0% at 3p and 4p.
  - The fix went on the BUTLER via `EnemyDef.partyHp` — the per-enemy seam,
    `partyHp: [1, 2.2, 2.8, 3.2]` — not on the global constant, which still
    governs scuffles and was measured on them.

**THE GOVERNESS AND THE BEDFRAME BEAST HAVE STILL NEVER BEEN MEASURED AT ANY
PARTY SIZE.** They are on the same global curve that read 0% for the Butler.
This is the highest-value balance work left and the instrument now exists:

  python tests/critic-design/party-boss.py --region nursery --enc nursery-boss \
      --n 8 --gen 8 --sizes 1,2,3,4 --scales 1

Expect to need a bigger --gen for region 2, because generating a Nursery loadout
means surviving the Foyer first. If a boss reads near zero at 3p/4p, give it its
own `partyHp` the way the Butler has one, derived from a bracketing sweep
(`--scales 1,0.75,0.6`), and say in the def why.

Also still open, and structural rather than a number: **party boss fights are
LONG** — 24 and 32 turns at three and four Kids against solo's 13 — because
party damage output does not scale with the pool the way its Courage does. No
multiplier fixes it. If you want to fix it, the lever is what a boss's per-turn
Guard is allowed to absorb, not the curve.

MEASURING TOOLS, and which question each answers:
  tests/critic-design/sweep.py       SOLO, real pre-boss decks. Cannot seat a
                                     second Kid.
  tests/critic-design/party-boss.py  A boss at 1..4 Kids, real pre-boss decks.
                                     `--scales a,b,c` sweeps on ONE loadout
                                     generation.
  tests/coop/balance.py              The party curve on the STANDARD tier, with
                                     starting decks. Not a boss instrument.
  tests/critic-design/anchor.py      Holds the above honest: at ONE Kid,
                                     partyBench() must reproduce bench() fight
                                     for fight. If this fails, no party number
                                     means anything.
  tests/critic-design/butler-ledger.html  Where a boss's length actually comes
                                     from (Guard gained vs damage that Guard ate).

━━ 3. THE SMALLER OPEN ITEMS ━━

  - **`partyPick` tracks the board and cannot also stay still.** `pickSeat`
    reads live Guard, so the intent arrow MOVES when a Kid raises Guard, which
    reads like a violation of "the target is shown before the players act".
    Holding it was tried on 2026-08-28 and REVERTED — Guard is wiped at turn
    start, so a held pick ties and resolves to seat 0 forever, `lowestGuard`
    stops meaning anything, it measured 33% → 17%, and it broke six co-op
    assertions that encode the tracking behaviour on purpose. The reasoning is
    in `intentTargetFor` and in CONTRACTS. If you want to resolve it properly:
    anything telegraphed a turn ahead should probably prefer something the
    player cannot game inside the turn (`lowestCourage`, `fewestDraw`). That is
    a DESIGN decision — take it to the designer, don't "fix" it.

  - **Cold card art freezes the UI.** 60 cards cold is 816 ms, 13.6 ms each, all
    PNG encoding, in ONE synchronous block, because `DeckView` mounts them while
    the incremental `warmArt` queue sits unused. The encoder is a CLOSED DOOR
    and the numbers are in the note so nobody re-opens it: JPEG is 3.3x faster
    and the art is fully opaque, but 22.6% of pixels differ at q0.98 against the
    0.023% this project accepted for the renderer change; WebP is slower than
    PNG. The open door is that `warmArt` + `onArtReady` already exist and
    `CardView` already subscribes — `_paintArt` just renders synchronously on a
    miss. The remaining decision is about FEEL (a cold card can freeze the UI or
    appear art-less for a few frames) and belongs to card-feel.

  - **Crinkle's design chapter is a RECONSTRUCTION** written by Claude from his
    one-line spec, clearly marked as such, and the designer has not reviewed it.
    docs/design/companions/16-crinkle.md. If they want changes, the chapter is
    where they start; the implementation follows it.

━━ 4. THE ONE FAILING CHECK, AND WHY IT IS NOT A TEST PROBLEM ━━

tests/chrome wants 60 fps and measures 54–56. Do not "fix" the threshold: the
GAME misses it too, and by more.

Measured at 1920x1080 — the size CONTRACTS non-negotiable 3 names — six in-page
samples per scene, one browser, one load:

  title 61 · gameover 58 · map 52 · combat 52
  blank page and a bare served page both 61–62

So the machine, the browser and the compositor can all do 60; the two main
gameplay screens cannot. What is EXCLUDED, with numbers:

  - not JS         665 ms of JavaScript in six seconds of a settled combat
                   scene, ~1.85 ms a frame, against 5592 ms idle
  - not fill rate  55 / 56 / 52 at 720p / 900p / 1080p, flat across 2.25x pixels
  - not the tiers  auto picks 'medium' correctly; high 45, medium 55, LOW 55 —
                   low buys nothing, so render scale, bloom, halation taps and
                   particles are all off the critical path
  - not the scene graph  renderer.info and a scene.traverse read IDENTICAL in
                   title, map and combat (14 drawables, 26 programs, 3 composer
                   passes) — the 3D stage is a shared backdrop
  - not one CSS property  hiding layers gives DOM 60 / canvas 57 / both 53, and
                   disabling box-shadow, will-change, filters or backdrop-filter
                   in turn moves about ONE frame each

What is left is the DOM's aggregate compositing cost — 739 elements at
1920x1080 — so the fix is a compositing pass (fewer elements, fewer promoted
layers), which is design-affecting work and not a line to change. Do NOT guess
at it; it is renderer/atmosphere and ui-chrome territory and the look is what a
wrong guess costs.

If you touch perf: CONTRACTS trap 35. A baseline measured once, at the start, is
not a baseline. The first baseline in that sweep read 52 and the SAME baseline
four cases later read 56, which made box-shadow look worth 4 fps when it is
worth about one. Re-measure the baseline at the END and compare like with like.

━━ THE WORKING METHOD THAT HAS BEEN EFFECTIVE ━━

- Read the whole design chapter before writing anything.
- Every fix gets a test that asserts the EFFECT, and **you verify the test fails
  without the fix.** CONTRACTS trap 12: "it resolves without throwing" is worth
  nothing. Four dead cards passed exactly that check. Every fix in the last
  session was negative-controlled this way and two of them turned out to be
  wrong because of it.
- A measuring instrument is CODE and can be wrong. Last session found the co-op
  harness running two enemy phases a round, a bot that scored clones while
  reading the real board, a bot that gave every seat the whole board's incoming,
  and six test scripts that could not run at all. **Every number that came out
  of it before those fixes was wrong.** If a measurement surprises you, suspect
  the instrument before the game.
- Run tests/cards/run.py and fix every error and warning honestly — never
  silence one.
- ONE Playwright run at a time. Always.
- TAKE A SCREENSHOT. Every single round it has caught something every green
  suite missed — a gauge reading 0/5 against a cap of 3, a Garden nobody could
  see, a card printing 6 while dealing 12, and last session a chip reading
  "SEED 0/2" over three objects the engine had already advanced to Sprouts.
  python tools/shot.py <name> --scene "combat&seed=42&companion=<slug>" --wait 9
- Commit with explicit paths (never git add -A), writing the message to a file
  and using git commit -F — backticks in a -m string get eaten by the shell.

━━ TRAPS THAT COST TIME, ALL NOW IN CONTRACTS (1–35) ━━

The full list is in CONTRACTS.md. The ones that bit most recently:

- **A scripted edit that reads with read_text() and writes with
  write_text(newline="") FLIPS THE FILE'S LINE ENDINGS** and turns a 20-line
  change into a 956-line diff. This repo is genuinely mixed per file. Operate on
  BYTES, and check `git diff --stat` after every scripted edit. It happened once
  last session and was caught only by auditing.
- Heredocs in the Bash tool mangle \n and backticks. Write patch scripts to the
  scratchpad with the Write tool and run them with python <path>, or use Edit.
- **A backtick in a comment inside a template literal ends the template** and
  blanks every screen, with the syntax error reported hundreds of lines away.
- A script named after a stdlib module BECOMES that module for everything in its
  directory. `tests/coop/select.py` broke all six scripts in tests/coop for an
  unknown period. Gated now by tests/stdlib-shadow/check.py.
- `run.buildCombat` seeds the fight from `fork('combat:' + node.id)`, so two
  harnesses that name their bench node differently play different fights and
  look like they disagree.
- `turn:start` fires BEFORE Guard is wiped and BEFORE Nerve is refilled. Use
  U.guardNextTurn / U.energyNextTurn, or listen for `phase: 'playerReady'`.
- The `damage` EVENT carries sourceId/targetId; the HOOKS carry
  attacker/defender.
- A card's uid is NOT a network identity. Use cardRef/refCard from net/session.js.

━━ NOT THE JOB ━━

- Do not change `PARTY_HP_SCALE`. It governs every enemy, it was measured on the
  standard tier where the win rate is flat and correct, and per-boss problems
  belong on `EnemyDef.partyHp`.
- Do not move the tests/chrome fps threshold. The product misses it.
- Do not re-open the card-art encoder question. §3 has the numbers.
- Do not redesign Crinkle without the designer.
- Do not push to origin without asking.

Start by telling me what you'd do first and why.
