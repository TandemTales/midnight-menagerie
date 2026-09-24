# The UI pass — builds judged blind against Josh's samples

Josh's ask, 2026-09-12: "create a loop to perfect the UI of the game to look like
the included samples in midnight menagerie/UI, as well as the backgrounds looking
at the same level, critiqued by blind judges who are ensuring the UI and
backgrounds match the style of the samples i provided you. fan out agents to
triplicate and duplicate builds and critique runs. dont stop until its perfected."

The four samples are `UI/title.png`, `UI/mainMenu.png`, `UI/selectCompanion.png`
and `UI/selectKid.png`. The Title, Companion Select and Kid Select screens already
ARE those paintings; this pass is everything else.

## How a round runs

1. **Baselines.** Photograph the round's screens as they are on `dev`, with the
   canonical commands in the round's brief, into `judging/<round>/<track>/<CODE>/`
   under a NEUTRAL code (never "BASE": a judge who can tell which candidate is
   today's game is not blind).
2. **Three builds per track.** One `git worktree` per builder, created OUTSIDE
   OneDrive (a checkout per builder inside the synced folder is a sync storm)
   and under a SHORT root -- `C:/UILOOP/<round>` is the one to use -- with
   `GIT_LFS_SKIP_SMUDGE=1`.

   **The short root is not a preference.** `LongPathsEnabled` is 0 on this
   machine, so 260 characters is a hard ceiling for Python and for the edit
   tools, and the longest tracked path in the repo is 84
   (`docs/notes/2026-08-25-frontend-round-8-....md`). A session scratchpad is
   ~148 characters before `/wt/<round>-<track>-<slot>` is added, which puts the
   checkout at 262 and `git worktree add` fails outright with `Filename too
   long` -- r8 hit exactly that. Rounds 5-7 fitted only because their track keys
   were two characters shorter, at 259 of 260. `C:/UILOOP/r8/wt/r8-background-a`
   is 31, and the judging folders survive the session instead of dying with its
   temp directory. Each builder runs its own
   `python tools/devserver.py <port>` and photographs itself with
   `python tools/shot.py ... --port <port>`. Each gets a different design angle.
3. **Two blind judges per track.** Images only — the samples and the candidates'
   canonical screenshots — named by neutral codes, shown in opposite orders.
   They never read code, branches or notes. `RUBRIC.md` is the scale: eight
   dimensions, 0–10, and 9 means "a viewer could not tell this was not painted by
   the same hand as the samples". A third judge breaks a disagreement.
4. **Merge the winner** into `dev`, check endings (`tools/endings_guard.py`), run
   the battery, capture the next baselines, and brief the next round with the
   judges' fixes and grafts.
5. **Stop** when every screen's winner scores 9 from every judge with
   `fits_between_samples` true, and nothing in the battery went red.

Steps 2 and 3 are one workflow: `round-workflow.js`, given a round's
`round-<n>.args.json` plus `repo` (the main checkout), `uiloop` (the folder
outside OneDrive that holds `wt/` and `judging/`) and `base` (the commit the
worktrees were cut from). The args name each track's screens, baseline code,
decision rule (`refine`: one winner; `expand`: per screen) and three builders
with their slot, code, port and angle. The worktrees and the baselines must
exist before it starts; its header says where each goes. It returns every
build, every verdict, the means, the winner and the screen winners per track.
`maxBuilders` caps how many builders run at once across every track, and a
queued builder starts the moment any builder returns. Each builder runs a dev
server and a Chromium, and one capture peaks near 0.9 GB on Josh's 16 GB laptop,
so round 2 runs six at once, as round 1 did.

## Traps this pass has already paid for

- **Mixed line endings.** The edit tools normalise a MIXED file on write, and the
  working tree can hold CRLF where git holds LF without `git status` noticing.
  Every builder runs `python tools/endings_guard.py --base <commit>` before
  committing; it rebuilds endings from the blob and proves them with both numstats.
- **`scenes.go` drops a call made while it is busy**, and a board can look settled
  before its reveal finishes. Anything that switches scenes in one page waits for
  `!window.MM.ctx.scenes.busy`.
- **`tests/steam-deck`'s Map row is load-sensitive** and fails the same way on the
  commit before the kit (A/B, 2026-09-12). Re-run it alone before blaming a change.
- **A usage limit can stop builders mid-build.** In round 5 the weekly limit
  stopped all six DIALOGS and KIDS' PLACES builders about an hour in. Their
  worktrees kept their commits and half-made edits.
  - Set `resume` on each stopped builder in the args, saying where it stopped,
    and it finishes from its worktree instead of starting again at BASE.
  - Run only the unfinished tracks, as a new run. `resumeFromRunId` replays a
    finished agent only when it is called in the same order, and round 5's
    resume re-ran POLISH's and COMBAT's four judges on byte-identical prompts.
  - A builder that FINISHED before the limit carries its recorded result as
    `done` (the BUILD object from the stopped run's `journal.jsonl`) and is not
    built again. Rounds 11 and 12 (2026-09-19) were both stopped by the session
    limit about six hours in: all three round-11 builders in their final
    captures, and in round 12 one builder and every judge, with two builders
    already returned. Both finished as new runs the same morning.
- **One dev server serves one capture at a time.** `tools/devserver.py` listens
  with a backlog of 5. Two `shot.py` runs at once get ERR_CONNECTION_REFUSED on
  fonts and images, and write console files that look like page errors.
- **A board baseline with no room behind it passes every check but one.** Round
  11's first combat baseline was the board perfectly drawn over a flat plum
  plane: warm-up on this machine's Intel UHD is ~35 s after load, the timeout
  was 40 s, and on a slow moment `shot.py` warned to a discarded stdout and shot
  into phase A, where the stage draws nothing by design. `glStd` read a healthy
  41, because Playwright's element screenshot is a clip of the PAGE (on a board
  it measures the board) taken seconds after the snap. Since `fc881cf` a warm-up
  timeout is void, and `perf.band` records the board's upper-middle luminance
  (29-36 with a room, 23.6 without): **read `band` on every board baseline
  before a round launches.** That makes five ways a capture has lied: no GPU
  context, a dead frame, a backdrop that never drew, a blown white transition
  frame, and this one.
- **`gpuprof`'s default 5 s wait measures ANGLE LINKING, not the frame** (round
  14, and it reframes every perf number that round reported). Its window sits
  inside the ~35 s warm-up, so a build that adds shader variants reads about
  +0.5 ms that is the compiler threads taking GPU time from the stage, not
  steady-state cost. Interleaved at `--wait 40`, the same build read equal or
  faster on both frames. **A/B at a long wait before believing a regression**,
  and remember this machine read BASE itself ~0.9 ms slow all of 2026-09-22:
  compare deltas, never a number against the brief's absolute.
- **A builder must stop only the processes it started, by PID.** A round-14
  builder killed its own profile script by command-line pattern (`perf.sh`,
  `gpuprof`) and took three or four processes belonging to other builders with
  it. Every round runs three builders using the same tool names at the same
  time. In the brief from round 13 on (`858417a`).
- **A big new shader variant is a stall the first time its room is shown.**
  Round 14's winner links a `stones` variant in ~15 s on this iGPU, behind the
  game; a graveyard, crypt, hedge, pumpkin or conservatory room shown before
  the background queue drains stalls on first show, and one batch VOIDed that
  way until the wall variants were moved back to the front of the queue.
- **Prove a merge's endings commit to commit, not with the endings guard.** In the
  main checkout, `endings_guard.py` repairs every file that differs from the
  base, including files someone else has modified and not committed
  (`tests/critic-design/result.json`). Instead, compare
  `git diff --numstat BASE HEAD` with the same diff plus `--ignore-cr-at-eol`.

## Results

| round | track | candidates (mean overall, both judges) | winner | merged |
|---|---|---|---|---|
| 0 | kit on Shop / Reward / Curiosity | LOCK 7.0 · WICK 6.3 · MOTH 6.2 · the game before 2.2 | LOCK, "staged boards", both judges | `1641055` |
| 1 | REFINE Shop / Reward / Curiosity | OPAL 6.83 · RUNE 6.50 · IRIS 6.08 · round 0's screens 5.58 | OPAL, both judges | `ef3f7e8` |
| 1 | EXPAND Map / Safe Room / Game Over | HUSK 6.67 · FERN 6.44 · VANE 6.06 · the screens before 3.06 | per screen, 3 judges: Map HUSK, Safe Room and Game Over FERN | `d30ab6d` |
| 2 | POLISH Shop / Reward / Curiosity / Map / Safe Room / Game Over | BRAID 6.78 · AMBER 6.75 · CHALK 6.72 · the screens before 6.22 | CHALK: three judges named three winners; CHALK beats each rival 10-8 head to head over the 18 rankings, Borda 34 / 30 / 30 | `a4b2ecc` |
| 2 | COMBAT, a Scuffle and a boss | FROST 7.25 · DUSK 6.75 · EMBER 6.25 · the screen before 3.50 | FROST, both judges | `04af2bc` |
| 2 | EXPAND-2 Lobby / Clubhouse / Atlas | GROVE 6.61 · IVORY 6.56 · HAZE 6.11 · the screens before 2.56 | per screen, 3 judges: Lobby GROVE, Clubhouse and Atlas IVORY | `31b6d8f` |
| 3 | POLISH the six boards | ONYX 6.56 · PEARL 6.28 · MINT 6.28 · the screens before 5.50 | ONYX, 2 of 3 judges | `1d9f09d` |
| 3 | COMBAT, a Scuffle, a boss and a boss with a full hand | TOPAZ 7.00 · QUILL 6.50 · SLATE 6.33 · the screen before 5.17 | TOPAZ, both judges | `f025e59` |
| 3 | DIALOGS the opening's story / Settings / the pile viewer | YARROW 6.61 · UMBER 6.56 · WILLOW 6.50 · the screens before 2.72 | UMBER: three judges named three winners; UMBER wins the rankings (3 head-to-head, Borda 20 / 17 / 17) | `6806123` |
| 4 | POLISH the six boards | ACORN 6.98 · CEDAR 6.82 · BASALT 6.63 · the screens before 6.51 | ACORN, both judges | `8d05ca5` |
| 4 | COMBAT, three boards | FLINT 7.33 · GARNET 6.92 · EBONY 6.42 · the screen before 5.58 | FLINT, both judges; the boss board 8.0, the loop's first 8 | `265ac4d` |
| 4 | DIALOGS opening / Settings / pile viewer | KESTREL 7.00 · INDIGO 6.42 · JASPER 6.33 · the screens before 4.92 | KESTREL, both judges | `42753f9` |
| 4 | KIDS' PLACES Lobby / Clubhouse / Atlas | OCHRE 6.94 · MARL 6.94 · NUTMEG 6.83 · the screens before 5.94 | per screen, 3 judges: Lobby NUTMEG, Clubhouse OCHRE, Atlas MARL | `ecb9315` |
| 5 | POLISH the six boards | THISTLE 7.08 · SABLE 7.08 · RAVEN 6.92 · the screens before 6.25 | THISTLE, both judges; a second blind judging agreed, 4 of 4 | `dbcc970` |
| 5 | COMBAT, three boards | VESPER 7.11 · YEW 6.89 · WALNUT 6.83 · the screen before 6.67 | VESPER, 2 of 3 judges; a second blind judging agreed, 4 of 5 | `e3f23aa` |
| 5 | DIALOGS opening / Settings / pile viewer | BIRCH 7.08 · ALDER 6.83 · CLOVE 6.58 · the screens before 5.75 | BIRCH, both judges | `5313c65` |
| 5 | KIDS' PLACES Lobby / Clubhouse / Atlas | GORSE 6.89 · ELDER 6.78 · FINCH 6.72 · the screens before 5.89 | per screen, 3 judges: Lobby GORSE, Clubhouse ELDER, Atlas GORSE | `25a5111` |
| 6 | POLISH the six boards | ROWAN 6.83 · **the screens before 6.83** · TEASEL 6.78 · SORREL 6.17 | CONVERGED: three judges, three winners, one of them the baseline. The ranking tiebreak returned TEASEL, below the baseline. ROWAN merged instead for the HUD rail and the Shop (3 of 3), its `rest` reverted | `2e0de84` |
| 6 | COMBAT, three boards | CAMPION 7.33 · HAWTHORN 7.17 · the screen before 6.50 · JUNIPER 6.00 | CAMPION, both judges; HAWTHORN's enemy condition tray grafted in | `4718b54` |
| 7 | DIALOGS opening / Settings / pile viewer | SORLEY 7.67 · PLOVER 7.17 · MEADOW 7.00 · the screens before 5.17 | SORLEY, both judges, all three screens. **+2.50**, the largest gain since round 3; its Settings scored 8.0 | `d5cd11f` |
| 7 | KIDS' PLACES Lobby / Clubhouse / Atlas | HARROW 7.56 · TINDER 7.33 · SEDGE 7.00 · the screens before 6.44 | per screen, 3 judges: Lobby HARROW, Clubhouse TINDER, Atlas HARROW | `40b2a1b`, `05c1916` |
| 8 | **BACKGROUNDS** — three ROOMS with no interface on them (foyer / crypt / graveyard) plus combat, combat-boss, rest | VERDIGRIS 5.83 · SOOT 4.92 · BISTRE 4.42 · the screens before 4.25 | VERDIGRIS, both judges, **and it beats the baseline on all six screens**. +1.58. `fits_between_samples` FALSE for every candidate on every screen | `d94cf23`, then the sky graft `5f0da30` |
| 9 | **THE THINGS IN THE ROOMS** — greenhouse / ballroom / foyer / graveyard / combat / rest | GALLNUT 6.42 · UMBER 5.71 · CARMINE 5.21 · the screens before **3.71** | GALLNUT, both judges. **+2.71, the largest gain of the pass.** The baseline scored **2/10** on both rooms Josh named; they merged at 7 and 6.5 | `5cf3efd` + the ballroom graft `723dc2b` |
| 10 | **THE OBJECTS, FINISHED** — greenhouse / ballroom / foyer / graveyard / combat / rest | OAKGALL 5.78 · SORREL2 5.39 · BISTRE2 5.22 · the screens before 4.06 | OAKGALL, 2 of 3 (every light gets a drawn fitting, on the PROP layer). Read the margin as **+0.93, not +1.72**: the baseline's combat was a blown white frame all three judges scored 1. Per screen, SORREL2 won the Greenhouse 3 of 3 and BISTRE2 the Foyer 2 of 3 — the first `fits_between_samples: true` of the pass — grafted afterwards | `f39dbc6` |
| 11 | **VARIATION** — contact sheets of three rooms per wing (foyer / ballroom / greenhouse / graveyard) plus combat and rest | CAMBER 6.67 · MADDER 6.00 · LIMEWASH 5.83 · the screens before 4.50 | CAMBER, 2 of 2, and 5 of 6 screens 2 of 2: **fits TRUE on the Foyer and Ballroom sheets** — ROOM_KINDS gives each wing the rooms it really has (ten new subjects). MADDER won the Graveyard (7, fits TRUE): its vantages are a graft. Finished as a second run after the session limit | `155133e` |
| 12 | **THE LAST WEB CHROME** — the coach / the hot-seat handoff veil / the achievement toast (EXPAND; ran beside round 11) | VELLUM 7.33 · ORMOLU 7.11 · GESSO 6.89 · the game before **1.44** | per screen: coach VELLUM (2 of 3), handoff ORMOLU (3 of 3), toast VELLUM (2 of 3). **+5.9, the largest gain of the pass** — the three screens no round had touched. Finished as a second run after the session limit, VELLUM and ORMOLU carried in as `done` | `57bb92f` + ORMOLU's veil `90d0fad` |

| 14 | **WHERE YOU STAND** — sheets of three rooms per wing for six wings (foyer / ballroom / greenhouse / graveyard, plus lampworks and bathhouse judged for the first time) and combat | ORPIMENT 7.07 · VERMEIL 6.86 · SEPIA 5.71 · the screens before **3.43** | ORPIMENT, 2 of 2, six of seven sheets. **+3.64, the largest gain of the pass**, and its Graveyard is `fits TRUE`. A kind now carries a VANTAGE (MADDER's rig grafted), a wing's MAIN room keeps its authored shell and camera, and the six wings with no `ROOM_KINDS` got rooms. VERMEIL won the Bathhouse (8.0, fits TRUE) and both judges demand that graft | `c1c32a5` |

| 13 | **CHROME, second pass** — the coach / the veil / the toast, told they are DRAWN and not LIT (EXPAND) | GAMBOGE 7.89 · SMALT 6.67 · NACRE 6.44 · round 12's screens 5.67 | GAMBOGE, 3 of 3 judges; coach and veil 3 of 3, and the toast on the rankings after three judges named three different winners. Two judges say its veil "could be cut into a trailer beside the samples". NACRE's toast is the round's only `fits TRUE` and is the graft all three judges asked for | `1e69f27` |

| 15 | **NAME EVERYTHING AT THE EDGES** — the same four sheets and combat, on the round-14 judges' seven-item fix list | MASSICOT 6.60 · REALGAR 5.50 · AZURITE 4.60 · the screens before **4.60** | MASSICOT, 2 of 2, four of five screens (one judge gave it all five). **+2.00**, and it won on a FINDING: three of the four things making the edges and upper halves black were masks and defaults, not the room's darkness. REALGAR won the Graveyard and its mansion elevation is the graft both judges named | `4a47bca` |

| 16 | **FINISH THE OBJECTS** — the same four sheets and combat, on the round-15 judges' list: what is INSIDE an object, and does a repeated element vary | CINNABAR 6.70 · VERDACCIO 5.50 · MINIUM 5.10 · the screens before **4.70** | CINNABAR, 2 of 2, four of five screens. **+2.00.** Coffered ceilings, leaves with midribs, a mansion with varied bays and dark windows among the lit, and **the black inset margins gone at last** (66px -> 3px, 64px -> 2px) — the defect open since round 14. VERDACCIO won the Foyer as the only build with a real sitter in the frames, and that is the graft both judges named | `84d61d1` |

| 17 | **PEOPLE IN THE HOUSE** — the same four sheets and combat: sitters, busts, musicians, and nothing repeated without variation | LITHARGE 6.65 · SIENNA 6.23 · FOLIUM 6.20 · the screens before **5.40** | LITHARGE, 2 of 2, three of five screens. **+1.25.** The only candidate that peoples the house, and with variety. It left the greenhouse and graveyard untouched, and the best work there — FOLIUM's treeline, both losers' prosceniums, SIENNA's broken panes — is round 18's graft. **The parquet was measured and is right** (21 px near, 12 px far) | `44b37fe` |

| 18 | **THE GARDEN AND THE HORIZON** — the same four sheets and combat, with round 17's losers' work as named grafts | WOAD 6.26 · ORCHIL 6.23 · WELD 5.93 · the screens before **5.54** | WOAD, 2 of 2 — **but on the mean by 0.03, while ORCHIL won four of five screens 2 of 2.** Both judges chose WOAD as the even SYSTEM (good on all four sheets, flattens nothing), and both asked for ORCHIL's people as the graft. **+0.72** | `1272403` |

**Scores anchor to the candidates beside them.** Round 0's winner scored 7.0 in
round 0 and 5.58 as round 1's baseline: the judges grew stricter as the field
improved. Compare a winner with the baseline IN ITS OWN ROUND (round 1 REFINE:
+1.25), never across rounds.

Against their own baselines:

| round | refining a converted screen | converting a screen |
|---|---|---|
| 1 | REFINE +1.25 | EXPAND +3.61 |
| 2 | POLISH +0.50 | COMBAT +3.75, EXPAND-2 +4.05 |
| 3 | POLISH +1.06, COMBAT +1.83 | DIALOGS +3.84 |
| 4 | POLISH +0.47, COMBAT +1.75, DIALOGS +2.08, KIDS' PLACES +1.00 | — |
| 5 | POLISH +0.83, COMBAT +0.44, DIALOGS +1.33, KIDS' PLACES +1.00 | — |
| 6 | **POLISH +0.00**, COMBAT +0.83 | — |
| 7 | DIALOGS **+2.50**, KIDS' PLACES +1.11 | — |
| 8 | BACKGROUNDS **+1.58** | — |
| 9 | THE THINGS IN THE ROOMS **+2.71** | — |
| 10 | THE OBJECTS, FINISHED **+0.93** (reported +1.72; the baseline's combat was void) | — |
| 11 | VARIATION **+2.17** (sheets 3-3.5 -> 6-7) | — |
| 12 | — | THE LAST WEB CHROME **+5.9** (per-screen winners 7.33 / 8.00 / 7.67 against 2 / 1 / 1.33) |
| 13 | CHROME, second pass **+2.22** (coach 6.0 -> 8.0, veil 6.0 -> 8.67, toast 5.0 -> 7.0) | — |
| 18 | THE GARDEN AND THE HORIZON **+0.72** (and the field inside 0.33) | — |
| 17 | PEOPLE IN THE HOUSE **+1.25** (the baseline had risen to 5.40, and the field sat inside 0.45) | — |
| 16 | FINISH THE OBJECTS **+2.00** | — |
| 15 | NAME EVERYTHING AT THE EDGES **+2.00** (and the baseline it beat was the tree with both grafts in it) | — |
| 14 | WHERE YOU STAND **+3.64** (two of its six wings had never been judged, and the baseline scored 2.0 on both) | — |

Converting a screen moves it about four points. Refining one moves it half a point
to two points, more when the brief names concrete defects the judges can see
(round 3's COMBAT gained most on the crowded board, 7.0 against 4.0). The
background dimension is what stalls: every judge scores it between 5 and 6 on
every candidate, winner or not, because the grounds are still renders.

**How much of a score is the judge.** Round 5's resume judged POLISH and COMBAT a
second time, blind, on the same captures. Both judgings named the same winners.
Candidate means moved by up to a third of a point (COMBAT's YEW 6.89 then 6.58,
its baseline 6.67 then 6.33), and the order below the winner swapped (YEW and
WALNUT). A gap of 0.3 or less between two means is within that noise: read the
judges' picks and rankings, which decide the merge, before the means.

**Round 6 is where POLISH ran out.** For the first time the BASELINE tied for
first (6.83, level with ROWAN, above TEASEL's 6.78), one of the three judges
named it the winner outright, and the three judges named three different winners.
The whole field — four candidates and the screens they started from — sat inside
0.67. In every earlier round the baseline came last by a wide margin (round 5
POLISH: 6.50 against a 7.13 winner). A refine track whose baseline is inside the
noise has nothing left to refine, and the ranking tiebreak stops meaning
anything: it returned TEASEL, whose mean is the lowest of the top three.

What that does NOT mean is that nothing improved. An aggregate mean hides a track
that gains on some screens and loses on others, and the round's two briefed
headline fixes both landed: ROWAN won the Shop 3 of 3, the only unanimous screen
result in the track, and it is the one candidate that turned the top HUD strip
into a carved rail — the fix every judge on both tracks had asked for twice.
**When a track converges, read the screens and the briefed fixes, not the mean,
and merge the candidate that did the thing you asked for.**

And a fix the brief got wrong. POLISH fix 7 asked for the Safe Room's four option
plates to stop being identical purple slabs and become four painted objects.
ROWAN did exactly that — velvet, walnut, fired enamel — and two judges marked it
DOWN for it ("brown and rose option panels", "the wainscot bleeding through the
rest plaques"). They were right: the materials were real but they left the
palette. Ask for variety WITHIN the palette, or the fix makes the screen worse.

**When the judges split with no majority**, `round-workflow.js` decides on their
rankings: the candidate that beats each other one head to head across every
judge's ranking of every screen, then Borda points, then the mean. Round 2's
POLISH needed it: three judges named three winners, and a plain vote count had
returned the first judge's pick. A tied screen is decided the same way on that
screen's rankings alone.

Round 0's losing kits stay on `ui/r0-a` (painted pieces) and `ui/r0-b` (vector
system) because the judges asked for pieces of them: WICK's star-glyph ribbon
headers and moonlit windows, MOTH's crest medallions and card nameplates.

The backgrounds cannot pass until they are paintings: both judges hold every
placeholder at about 5.

**And a measured account of WHY, 2026-09-16.** The judges' words for six rounds
were "a flat, evenly lit tiled texture", "no painted depth or candle falloff",
"wallpaper behind cards". Measured against the samples, that is one defect.
Over the darkest tenth of each image:

  Josh's four samples   rgb(0.3,0.2,0.2) — (1.2,1.0,2.3) — (0.5,0.4,2.5)
                        — (3.8,3.4,3.7), min channel 0.1 to 2.9
  our ten screens       rgb(7.8,5.2,7.8) and alike, min channel 3.9 to 5.1

Every screen sat about five levels off the floor: nothing in the game was ever
black. It cost twice, because saturation is (max-min)/max and a minimum channel
that cannot reach 0 caps S at 0.73 — exactly where our screens topped out
(0.61-0.73) against the samples' 0.85-1.00. And that is where the style lives:
57% of `title`'s pixels at S >= 0.85 sit below V 0.05, and 27% of
`selectCompanion`'s. Their colour is in the DARKS, a near-black that is purely
violet; ours was a grey.

`57da26a` took the floor out (prep_ui_paint's unlit pass, --kit-void,
--kit-ground-0, the vignette's terminal stop, combat's corner). Min channel
3.9-5.1 -> 2.0-3.4, shadow saturation 0.33-0.40 -> 0.48-0.62, dynamic range
16-20x -> 21-32x, S p95 0.67-0.70 -> 0.71-0.80, and the ground's lit-to-unlit
ratio 3.2-3.8x -> 4.1-4.9x against mainMenu's 4.5x. Still short: the ground's
column-to-column spread is 0.021-0.024 against the samples' 0.034-0.082, so the
light pools less across the width than theirs does.

**One measurement lied, and looking caught it.** Cutting combat's full-frame
violet wash from .16 to .08 alpha gave the best black-floor number of the whole
pass — and turned the fight sepia, because the render under it is warm brown
and that violet is the only thing tying it to a purple-black house. The alpha
went back and the colour darkened instead. **Put the before and after side by
side; a metric moving the right way is not the same as the screen improving.**

### And the half of the ground nobody had touched, 2026-09-16

Everything above is `tools/prep_ui_paint.py`, which paints the **CSS** room:
`room.webp` and the plates that stand on it. That is what shows behind the six
boards and round the dialogs.

**Combat does not use it.** The room behind a fight is the WebGL stage
(`game/src/fx/backdrop.js`, `shaders/backdrop.js`), and it is also the only
screen where a large area of *room* is visible — the boards cover theirs almost
completely and the map is a blueprint sheet over it. None of the ground pass
reached it, so the wall behind every fight measured 0.022 of tooth at the 0.8 px
octave against the samples' 0.12–0.48, and not one prop edge in the house
carried a line darker than both sides.

`tools/bgmetrics.py` is the kept scorer: floor, shadow saturation, tooth per
octave, edge width in pixels, ink share and depth, peak over median, mid-tone
saturation and hue, tile spread. Every image is scaled to a common height first,
because tooth and edge width are both measured in pixels and neither survives a
resize — and the crop's scale comes from the FULL image's height, or a 200 px
patch upscaled to 900 reads 0.018 where it should read 0.28.

What it found, what changed and the four traps are in
`docs/notes/2026-09-16-the-webgl-room-was-never-painted.md`. The three worth
carrying into the next round:

- **Josh's tooth is white noise, not 1/f.** Flat weights across 1–21 px match the
  samples' spectrum; the painted room's own 1/f^1.1 leaves the fine end empty and
  moved the measurement 0.038 → 0.038.
- **A drawn line's width is in PIXELS.** A 4 cm chair rail across a 19 m room is a
  fifth of a pixel of relief, so lighting can only ever draw it as a hairline.
  Screen-space derivatives of the height field give a line of constant width at
  any depth, for free.
- **One number for the whole house is not a rule.** The prop chroma ceiling was
  set by eye at 0.14 on the Ballroom's statuary and the seventeen-region sweep
  immediately showed the Greenhouse's planting going grey. It is per material now.

Where it landed, on combat's room band against `mainMenu.png`: tooth 0.076 ->
0.145 (his 0.226), the 0.8 px octave 0.050 -> 0.081 (0.124), min channel 5.49 ->
3.32 (2.32), edge width 2.55 against 2.52, tile spread 0.636 -> 0.784 (0.540).
Two thirds of his figure, which is where the CSS ground settled too, and for the
same reason: the last third is drawn subject matter and not noise.

**And it cost more than the reasoning said.** A/B against the commit before,
three runs each: the frame went 11.23 -> 14.98 ms, and 2.14 ms of that was the
post grade alone -- six octaves of value noise is twenty-four hash calls on
921,600 pixels, however bandwidth-bound the pass is. Cut to three taps (the
finest octave is white noise, so one hash instead of four) with the same
measured spectrum, one tap for the wear field, MM_TOOTH off at tier low, and no
drawn work on the ceiling: **13.79 ms, +2.56 ms, and 58 fps observed before and
after.** Headroom spent, not frames -- but measure it next time instead of
quoting the round-2 note at it.

**And from 2026-09-17 the room is not a placeholder at all: it is the
deliverable.** Josh: *"no more background art ... see how good they could
possibly be with just procedural generation only ... make it as good as it can
be without it. now finish the loop with this in mind."* Every brief from r5 to
r7 told builders NOT to spend the round painting rooms in CSS and to keep the
painting slots clear. That instruction is retired, `background-prompts.md` is
retired, and round 8 is a BACKGROUNDS round: see `BRIEF-r8.md`.

The one axis still an order of magnitude short is **ink depth** -- 0.009-0.080
against mainMenu.png's 0.248 -- and his depth comes from drawn subject matter,
masonry joints and tracery and ironwork, not from a heavier line. Tooth and edge
width are already at his figures on an isolated room.

### Round 8: the room, with no art coming, 2026-09-17

The first round whose subject was the BACKGROUND itself, and the first in which
three captures carried no interface at all. Josh had just retired the painting
plan -- "there will be no background art ... make it as good as it can be
without it" -- so the brief aimed at the one axis measurement said was short by
an order of magnitude: ink DEPTH, drawn subject matter on the wall.

**VERDIGRIS won on one idea: a region names a SUBJECT, and it is drawn into the
wall's RELIEF rather than its colour.** Seventeen subjects, no two shared --
stair, toyshelf, wardrobe, range, terrace, fence, bookcase, rafters, bench,
mirrors, niches, topiary, timber, dado, pens, coping, hearth -- so each arrives
with the recess occlusion, the ink in its hollows, the lip on its crests and the
room's own candlelight for free. Fix 1 and fix 5 in one move, at no frame cost,
because fix 6's ceiling saving paid for it.

Across all seventeen rooms: ink depth 0.077 -> 0.098, tooth 0.277 -> 0.288, with
kitchens 0.023 -> 0.111, passages 0.011 -> 0.036 and kennels 0.025 -> 0.054.

**Four things this round taught, and three of them are about the instruments.**

- **A SCREENING SWEEP IS WORTH RUNNING AND NOT WORTH OBEYING.** The round
  photographs three rooms of seventeen, so all seventeen were swept at BASE and
  again after the merge. It flagged exactly one room worse on every axis -- the
  Study, ink 0.013 -> 0.011, tooth 0.234 -> 0.225, void 10.3 -> 16.9% -- and the
  Study is the most improved room in the sweep to LOOK at: a generic panelled
  hall became a library with floor-to-ceiling bookcases. Bookcase relief is
  darker than the lit damask it replaced. The sweep did its whole job by naming
  the one room to go and look at.
- **TWO MEASUREMENTS THAT CONTRADICT EACH OTHER CAN BOTH BE RIGHT.** The sky
  measured too DARK at the zenith (level 2.7, and 71.5% of the Hedge Maze's
  upper third pure black) and too BRIGHT in its visible band (three to four
  times the moonlit paving under it). The gradient climbed to a full horizon
  colour low down and to raw masonry-colour at the top: wrong in both directions
  at once. His sky is a narrow horizon band on a never-black navy field.
- **CHECK WHICH POPULATION YOU MEASURED. Twice in one day.** A "cloud variation
  of 34% of level" in `mainMenu.png` turned out to be the tower spires inside
  the patch; the clean sky is 3.4% at the zenith rising to 8.6% near the
  roofline. And a finding that the CSS room's two LIT passes never reach black
  was retracted before it was built: `kit.css` masks them to the candle pools,
  so they are the room INSIDE a light pool and must not be black. Acting on it
  would have darkened every candle pool in the game.
- **A FIX LIST CAN BE WRONG, and this round proved it a second way.** Fix 6 told
  builders the near-black top of the frame was deliberate, "all four samples go
  near-black at the top". Near-black and black are not the same thing, and the
  difference was the round's own subject. Worse, BISTRE's angle quoted
  "mainMenu: 3.6% above L192" -- the true figure is 0.001%, its brightest pixel
  is L230 -- so it was told to build highlights its reference does not contain,
  and the judges marked it last for pale washed forms. Round 6 wrote this lesson
  down already: when judges punish a candidate for doing what you asked, the ask
  was the defect.

**Kept from the losing branches**, because a candidate can lose the round and
still be right about something:

- `tools/valuemetrics.py` (BISTRE) measures where the LIGHT is, which
  `bgmetrics.py` does not. Its headline survives the merge and is round 9's:
  mainMenu's five horizontal bands run 14.9 / 28.7 / 29.8 / 29.6 / 39.6,
  brightest at the FLOOR, while our Foyer runs 7.2 / 13.7 / 39.8 / 19.9 / 21.0,
  brightest at the WALL. **Every sample lights the floor. Every room here lights
  the wall.**
- **The sky fix** (BISTRE), which the sweep proved the winner never touched
  (hedge void 31.61 -> 31.61, unchanged to two decimals). The sky was painted
  only for the EXTERIOR arch mode and the Hedge Maze is arch 3 with room.h = 0,
  so it got unlit plane. Merged as `5f0da30`: hedge void 31.6 -> 3.4%, its upper
  third 72.6 -> 0.0%, sky level 0.6 -> 19.5 against mainMenu's 16.5; graveyard
  and pumpkin tooth 0.145/0.137 -> 0.280 against his 0.226, because those two
  never lacked tooth -- a third of the frame at zero was dividing it away. All
  thirteen interiors identical to three decimals.
- Six additive one-knob overrides in `backdrop-room.js`, and a gap in
  `tests/shader-literals/check.py`: an unterminated GLSL comment is the one
  fault in that family that does NOT break the page, so the room draws with the
  last program that linked and the capture looks plausible.

**Nobody reached the bar.** `fits_between_samples` is false for every candidate
on every screen, and the best room scored 7. The two judges agree on what is
left, and they name it in the same order: the Foyer's staircase is drawn in
hairlines and reads as a wireframe on wallpaper; the Crypt's loculi repeat at
one pitch and read as a stamped tile; nothing carries an ink contour ("the
samples outline everything"); and on `combat` the balustrade's hairlines cross
straight behind the enemy nameplates, so the room competes with the board.

### Round 9: the things in the rooms, 2026-09-17/18

Josh, having looked at the palette comparison and then at the rooms themselves:
*"colors are fine but im very concerned that nothing in the greenhouse looks
like plants, and the ballroom seems to be occupied by statues or oversized oscar
awards or something. this needs to be fixed at the highest priority."* With the
bar set explicitly: as well painted as **the mansion and the characters** in
`UI/*.png`, and up to a modern Steam game's standard.

**The first round the rooms he named were even LOOKED at.** The round already
running when he said it had six judged screens and neither the Greenhouse nor
the Ballroom was among them, so it was stopped and rebuilt. Both judges then
scored the baseline **2/10** on both rooms, unprompted: *"the planting is a
field of smooth pale-grey popcorn lobes on stubs standing in grey slab tubs ...
the Impossible Greenhouse contains no recognisable plant at all"*, and *"still
occupied by award statuettes: six smooth featureless standing figures on stepped
plinths ... standing about 2.5 m to the top of the head — taller than the
doorway on the back wall"*.

**ONE CAUSE UNDER BOTH COMPLAINTS, and it was structural.** `shapeField()`
returned a 2D coverage mask and nothing else; the fragment shader built each
prop's normal from the *coverage gradient* — outward at the outline, toward the
camera in the middle — plus one fbm wobble and four bands of material noise
that know nothing about the object's form. That is a rounded slab. **A smooth,
featureless, correctly-shaped standing figure with a uniform metallic surface
IS an award statuette**; it was not a taste problem, it was the only thing the
prop shader could draw. The same cause made thirty separate plant fronds shade
as one lobed blob.

Round 8 had solved exactly this for the WALL, when subjects stopped being drawn
in colour and moved into RELIEF. Props were the last surface in the house still
lit as a silhouette. `reliefH()` now returns METRES of relief inside the outline
for all twenty silhouettes, positions in uv and amplitudes off `vSize` the way
`wallH` authors the wall; the normal comes from coverage AND carving; a recess
is darker than the face it is cut into; `mmDrawn` inks the interior lines.

**Props got CHEAPER doing it** — 1.04–1.17 ms against 1.19–1.25 — because
replacing six smin'd circles per frond with one distance to its axis paid for
the new branch. Frame 13.5–14.2 ms against the 15.5 budget.

**FOUR THINGS IT FOUND THAT EXPLAIN YEARS OF SYMPTOMS:**

- **A column's flutes had never rendered, in any round.** Round 8 wrote the
  groove, set its width in pixels, gated it on resolvability and looked at the
  capture — and the shaft coordinate was `(vUv.x - 0.5)*2.0`, which spans the
  whole QUAD. The shaft is 0.132 of the quad, so that reaches ±0.264, and
  `asin` of it times 5.0 is **one and a half flutes across an entire drum**.
  That is why every column in this house read as a post.
- **The prop luminance ceiling is a COMPRESSOR, and the diffuse loop sits
  inside it.** On the Greenhouse's numbers (propCeil 0.569, exposure 1.67) it
  maps pre-grade 0.6 and 1.5 to 0.299 and 0.325 — **nine per cent**. Any value
  a prop's interior created through its normal was crushed before it reached the
  screen, **which is why five rounds of work on the Greenhouse only ever changed
  its outline**. Relief has to be drawn as SHADE on the far side of both
  ceilings.
- **Props were half the size their rooms needed** — a correct fix applied with
  one wrong constant. Pinning each to its real metres is right, but it shipped
  with a flat ±5% spread on all twenty shapes, so thirty 1.43 m plants in a
  30×26×10.5 m glasshouse photographed as an EMPTY room. Living things get a
  real spread now (plant 0.62, shrub 0.48) and joinery does not: a chair is
  0.88 m in every house on the street, a conservatory palm is whatever it has
  grown to.
- **Recess occlusion darkens NEGATIVE relief only.** CARMINE's first foliage was
  built entirely from positive height, so it got a normal, an ink line and no
  shadow anywhere — "a cauliflower with veins on it". A shape must subtract its
  own mid-height or its relief executes and shows nothing.

**THE BALLROOM WAS A CONTENT FAILURE BEFORE A DRAWING ONE**, and nobody had
ever asked whether a room's contents make sense. Its data said
`shapes: [15,4,7,6,0], count: 30, layout: 'colonnade'` — and a colonnade takes
`shapes[0]` for both receding files, so the room was literally thirty tall
narrow figures on plinths. **Josh was describing the DATA.** The winner removed
the statues and put nothing back (judge: *"under-furnished and mis-scaled ... no
mirror, no chandelier and no piano in a 20 m hall"*), so CARMINE's contents were
grafted in: a **pier glass** (the object a ballroom has most of, and a dark sunk
arch with no reflection is a DOORWAY, which is how the wall's own `mirrors`
subject had been reading) and a **grand piano** whose propped lid is a
TRAPEZOID — the hinge lies flat on the case for its whole length and only the
free edge rises. A 2 cm lid board is one pixel at that distance and
photographed as a wire over a bench; a sheared slab lifts the hinge off the
case at the tail.

Three content bugs came with it: the prop picker is UNIFORM, so a piano in the
list means three or four pianos; a room's one-of-something must be PLACED rather
than dealt, or it lands 24 m back behind a column; and the colonnade dealt its
remaining props from a pack that still contained the column it is made of, then
scattered them to the back wall where a 0.95 m gilt chair is fifteen pixels.

**VERIFIED ACROSS ALL SEVENTEEN ROOMS** (and the sweep had to wait overnight for
the GPU — see the trap below): ink depth 0.097 → 0.106, ink share 0.514 →
0.525, tooth 0.299 → 0.310, void 11.38% → 11.25%. Hedge 0.179 → 0.257,
graveyard 0.089 → 0.121, pumpkin and heart both roughly doubled. Three rooms
read lower and none is a regression: the **Foyer** (0.203 → 0.124) traded a few
very strong troughs on a bare wall for many mid-strength drawn lines, which is
what a median does, and its judges went 3.5 → 6.75; the **Ballroom** is a
different room now; the **bathhouse** still carries the highest ink in the
house.

**STILL SHORT.** `fits_between_samples` is false for every candidate on every
screen and the best room is 7. What both judges name next: the Foyer is
*furnished* but still under-furnished below the dado and its handrails are
one-pixel stepped diagonals, the Greenhouse's pots are rimless dark tubs with no
lip or soil line so a 2 m specimen grows out of a shadow, and the piano's lid
underside wants more shade.

### The trap this round paid for: a capture with no GPU is not a regression

The verification sweep came back with **all seventeen frames dead** and
`VALIDATE_STATUS false` on every one, which reads exactly like "the round broke
the shader". It was not. Repetition at three commits, six captures each, is what
settled it — the round's own BASE failed 4 of 6, GALLNUT 5 of 6, the tip 5 of 6,
and the base ran FIRST when the GPU was least degraded. This machine's GPU
process degrades across a few hundred Chromium launches in one session and
eventually cannot create a context; **it recovers when left to idle**, and the
same sweep the next morning captured 17 of 17 with no voids at all.

The signature: `gl` comes back `none`, and the console errors name three.js's own
`MeshStandardMaterial` alongside ours — if OUR program were over a hardware
limit, three's stock material would still link. `tools/shot.py` now detects it
and **exits 2**, so a sweep can tell a void capture from a page error.

And the correction that followed, because the first version of that check was
also wrong: **a live GL context is not proof the frame drew.** It passed a
Greenhouse capture with a healthy context, mean 8.8 and std 4.84, after which
`bgmetrics` reported that room's ink depth as 0.000 — "the round destroyed the
room it was written to fix". The test is the PIXELS now: void frames sit under
std 5 whether they fail white or black, the darkest real room measures 29, and
the threshold is 8.

**Three instruments lied in one session** — a "cloud variation" that was the
tower spires inside the crop, a CSS-room defect that dissolved once `kit.css`
showed those assets are masked to the candle pools, and a sweep with no GPU
attached. Measure to find the defect; then check what population you measured,
and check the instrument was alive.

### Round 14: where you stand, 2026-09-22

**ORPIMENT, 2 of 2 judges, 7.07 against a 3.43 baseline — +3.64, the largest
gain of the pass** (`c1c32a5`, run `wf_4588259d-501`). Six of the seven sheets,
and its Graveyard is only the third sheet ever marked `fits_between_samples`.
Read the margin knowing two of its six wings — Lampworks and Bathhouse — had
never been judged and scored 2.0 as the baseline, because they had no
`ROOM_KINDS` at all: every room of theirs was one room rearranged.

- **A kind now carries a VANTAGE, not just a back wall.** Both round-11 judges
  had put this first: three panels shot "from the same centred tripod" differ
  by wall feature only. MADDER's rig (`ui/r11-vary-c`) is grafted into
  `renderer.js` `setCameraRig`, which takes and eases `x / lookX / lookZ`, all
  defaulting to 0 so every existing region rig is untouched. A kind says where
  you stand — among, along, corner, threshold, above.
- **A wing's MAIN room keeps its authored shell, walk, layout and camera.** A
  room named for its wing that resolves to `kinds[0]` ignores `kind.room` and
  `kind.view`, so `foyer-14` and `gh-14` play in exactly the rooms they did.
  This is not a detail: before the last commit of the round, a landing kind's
  0.86 x 0.92 room scale had leaked into the canonical Foyer fight.
- **All three builders converged on the same shape** — vantage per kind, rooms
  for the six unvaried wings, subjects compiled only into their own wing's
  `MM_ROOMS` variant — and were separated by DRAWING. ORPIMENT won on leaves
  with midribs in pots with rims, chest tombs with carved panels, a chapel with
  courses and tracery, and mirrors that are glazed and mullioned rather than a
  white smear in an arch.
- **What beat it where it lost:** VERMEIL's Bathhouse, 8.0 and `fits TRUE` —
  the only unmistakable pool in the round (a sunk tank with a proud coping and
  a step down to the water), a steam room of arched niches with basins and
  taps, boilers with grates and gauges, pipe runs with spoked handwheels.
  **Both judges independently made that graft their first instruction**, and
  ORPIMENT's own Bathhouse (6.0) is its weakest sheet.
- **The fixes both judges name next**, beyond the graft: the mansion behind the
  graveyard railing is a flat slab of one repeated window; the Ballroom suite
  panel is letterboxed inside black margins while its neighbours fill the
  frame; the vinery is thin stems on empty brick; the Foyer landing's hangings
  and pictures are undrawn rectangles; and the Foyer's left and right thirds
  fall to near-black and swallow nameable objects.

### Round 13: light, and the object the light falls on, 2026-09-22

**GAMBOGE, 3 of 3 judges, 7.89 against 5.67 — +2.22** (`1e69f27`, run
`wf_35dbc3c9-39a`). Round 12 converted the coach, the veil and the toast;
round 13 told all three builders the judges' real complaint, which was that
the pieces are DRAWN and not LIT. The winner's angle was exactly that.

- **The coach's spotlight is a wash of candlelight inside four filigree corner
  scrolls**, not a gilt box ruled over the room, with a tapered gold leader
  running from the note to the thing it teaches — the two fixes round 12's
  three judges all named.
- **Its veil is the best single screen of the pass so far**: two judges say it
  could be cut into a trailer beside the samples, and it scored 8.67.
- **The toast is its weakest piece and did not really win.** Three judges named
  three different winners; GAMBOGE took it on the rankings, and it is the one
  screen where the round behaved like round 6's converged POLISH. The
  difference from round 6 is that GAMBOGE is never below second on any judge's
  ranking and has the highest mean, so the tiebreak is not an accident — but
  all three judges then named the same repair, which makes it a graft and not
  a win: NACRE's gold ribbon banner (the samples' own device, and the round's
  only `fits_between_samples`) on SMALT's plate, at SMALT's anchor.

**The verification trap this round paid for, and it is a general one.**
Round 11's standard was BYTE-IDENTICAL captures on the merged tree, and on an
animated screen that standard is wrong. Six of round 14's eight captures
"differed" and both chrome screens differed by 20-30% of pixels. Three things
were going on, and only a discriminator separated them:

- **The sheets were fine.** Mean |difference| 0.00 and no pixel off by more
  than 8: the builder's last two commits were genuinely look-neutral, and only
  the PNG bytes differed. Compare CONTENT, not hashes.
- **A live board never repeats.** Two captures of the SAME tree differ by 18%
  of pixels on combat and by 11-18% on the chrome screens. **Take the same-tree
  A/B first and use it as the noise floor**; merged-vs-judged inside that
  floor is a pass.
- **A later round changes the room behind an earlier round's captures.** Round
  13's builders worked from `d46eec5`, so their judged captures show the OLD
  room; round 14 had already merged. The veil matched to 0.02 because it covers
  the whole board, while the coach and the toast sit over a live room. Cropped
  to the toast plate itself, merged versus judged is 0.00. **Compare the OBJECT
  the round built, not the frame it sits in** — and confirm with
  `git diff <winner's branch> HEAD -- <the files it owns>`, which is the real
  proof that a merge took the judged work.

### The two grafts, 2026-09-22

Both rounds left exactly one thing owed, and in both cases every judge had
named the same one. Both were given to a single builder with its own dev
server and worktree, the way round 9's ballroom graft was done, and they ran
side by side because they touched disjoint files.

**Round 14's BATHHOUSE (`60dd632`).** VERMEIL's bathhouse scored 8.0 with
`fits_between_samples` TRUE from both judges against the winner's 6.0, and it
could not be cherry-picked: VERMEIL and ORPIMENT had rewritten the same shader
branches with different numbering. Rebuilt inside the merged tree instead: the
pool is a tank with coping and its tiles, lane lines and steps drawn THROUGH
the water; the steam room is an arcade of niches with basins and taps; the
boilers have firebox doors with grate bars, gauges and sight glasses; the pipe
gallery has real bores with spoked handwheels. **It added no numbers at all**
— no new subject, floor pattern or variant — and every new function sits
inside `#if MM_ROOMS == 6 || MM_ROOMS == 7`.
- It was FASTER: default combat 13.46 against BASE's 13.70 at `--wait 40`.
- Its variants link in 2.4 s and 4.3 s, against the round-14 winner's ~15 s.
- **It measured the fix instead of eyeballing it.** "The upper half ends in
  void" became: on the top 35% band, the share of pixels under L6 falls from
  38.3% to 17.9% on the pool and from 61.3% to 13.0% on the reflector gallery.
- **It proved the blast radius rather than asserting it.** The pumpkin
  grounds' pond shares the floor's pool block, so every added term was
  multiplied by the wing flag and moved expressions were DUPLICATED rather
  than shared; the pond was then captured on both trees (mean |difference|
  0.0010, max 3). The four untouched sheets read 0.0016-0.0026, and both
  combat figures sat below their own same-tree noise floor.

**Round 13's TOAST, and two more (`b66b79b`).** The toast is now the Kid
board's gold ribbon banner on a plate with the engraved double rule, at
SMALT's anchor; the veil's portrait ovals were fixed in the FRAME rather than
the art (`prep_chrome.py` removes two runs of the plain side rail and
cross-fades the joins, so the gilt is untouched); the coach's GOT IT moved
into a long cartouche with the keycap inside it. It also took the coach
heading to title scale — named by all three judges and missing from the
graft's first brief, which was the briefer's error, not the builder's. Round
13 had rejected that treatment as unreadable; it had been set at 16px, and
16px was the defect.

**AND THE CORRECTION WORTH REMEMBERING (`7332e9f`): the fixture said it, not
the game.** A judge marked the veil for naming the pet twice — "looking for
Pepper" on the plate and "Pepper is still out there somewhere" under YOUR
TURN. No caller ever wrote that: all four `passTo()` callers in `scenes/` pass
a name-free sub-line, and the sentence came from
`tools/shot-scripts/chrome-handoff.js`, which invented one for the capture.
The graft answered it in `handoff.js`, with a guard that silently replaced any
caller's line that word-matched the Kid, the pet or the Companion — game code
grown to satisfy a screenshot, which would have swallowed the first deliberate
line a writer wrote about a Kid, with no error. The guard is gone and the
script now passes the line `combat.js` passes for that moment. **When a judge
names a defect, check whether the CAPTURE put it there**: the same trap cost
round 9 an evening, and this is its second sighting.

### Round 15: the edges were masked, not dark, 2026-09-22/23

**MASSICOT, 2 of 2 judges, 6.60 against 4.60 — +2.00** (`4a47bca`, run
`wf_518ef88e-dd1`), four of the five screens, and one judge gave it all five.
The round ran the round-14 judges' own seven-item fix list, three angles: the
list in order (REALGAR), the architecture and the projections (AZURITE), and
the edges and placeholders (MASSICOT).

**THE FINDING, and it is the reason to run a round rather than to argue about
one. Three of the four things making this game's edges and upper halves black
were MASKS AND DEFAULTS, not the room's own darkness** — found with the layer
toggles BEFORE anything was changed:

- **The near-frame lintel was a soft gradient mask over 40% of the picture.**
  Hiding that one quad took the Ballroom's top four tenths from
  9.6/7.0/3.6/6.8 to 46.1/31.0/10.4/12.9.
- **Every plaster ceiling was lit by four uniforms nobody ever writes.**
  `uPool[]` is never written for a ceiling and an unwritten `Vector4` is
  `(0,0,0,1)`, so `r = 0` and each slot was a flat wash. Zeroing them took the
  Ballroom's ceiling from 52.2 to 0.5, which is the proof the light was
  fictitious.
- **The grade's vignette reached zero before the frame's mid-edge**, so the
  whole outer band was multiplied by 0.28 with no gradient left in it.

**THE BRIEF'S TRAP AND THE RUBRIC'S COUNTERWEIGHT BOTH EARNED THEIR KEEP, and
this is the transferable part.** The fix list said the edges go black; the
obvious fix is to raise the ambient, and that would have undone the measured
black floor of 2026-09-16 — the one rendering advance of the pass. So the
brief said light the OBJECT and not the room, and `RUBRIC-r15.md` told the
judges to mark a milky candidate BELOW a dark one. Judge 1 then measured it
unprompted: MASSICOT's darkest decile sits at 0.9-2.4 against 0.1-0.6 for the
others, **but its darks are MORE saturated (0.65 against 0.52-0.56)** — "a
floored vignette, not a raised ambient, and I do not mark it down". Judge 2
found the cautionary case was the BASELINE: "DIMITY's combat foyer is a milky
grey haze through the middle." **Write the trap into the brief AND its test
into the rubric: a fix list without a counterweight steers a round into the
defect it was trying to remove.**

- **An angle can take its fixes down with it.** Fixes 2 and 6 — the
  letterboxed suite panel and the bent parquet — were AZURITE's, and AZURITE
  finished level with the baseline at 4.60, so both are still outstanding in
  the merged game. The literal builder is only insurance for the items it
  actually reaches.
- **The winner's notes said what it had NOT done**, which is worth asking for
  by name in every brief: fix 1 untouched, fix 7 answered in spirit rather
  than to the letter, and one placeholder class left in `subjChimney`.
- **A dispute to settle, not to guess at.** Judge 1 says the mirror hall's
  parquet "runs in concentric arcs across the whole foreground". The builder
  checked and says the parquet is laid in world coordinates and is straight by
  construction, and what curves is the back wall, drawn on an arc. One of them
  is wrong, and a test pattern on that floor settles it in ten minutes.

### Round 16: finish the objects, 2026-09-23

**CINNABAR, 2 of 2 judges, 6.70 against 4.70 — +2.00** (`84d61d1`, run
`wf_b4cd7e06-518`), four of five screens. The round asked two questions of
every panel — is the object FINISHED inside, and does a repeated element VARY
— and both judges say CINNABAR is the only candidate that answered them on
more than one wing: coffered beams with side faces and a moulded panel inside
each coffer; leaves with a midrib, parallel laterals and a pinnate margin; a
mansion with unequal bays, more than one window size, dormers, an oculus and
several windows DARK among the lit.

- **THE BLACK INSET MARGINS ARE GONE**, and this is the item to learn from: it
  was named in round 14, stayed on round 15's list, and was not fixed there
  because the builder who owned it finished level with the baseline. Keeping
  an unfixed item ON the list, with the branch that got closest named beside
  it, is what eventually spent it. Judge 2 measured the win — foyer parlor
  66px -> 3px, ballroom suite 64px -> 2px.
- **Round 15's regression is fixed**: the wall behind the pale Dust Bunny is
  dark again and the board reads at 1280. A round that lights a room must
  check the creatures still have silhouettes.
- **Two candidates FLATTENED an object that the baseline had drawn** (the
  ballroom's coffered ceiling went to a smooth plum field) while fixing
  something else. Both judges marked it as a loss against the baseline. A
  refine round can go backwards in one room while going forwards in another,
  and only a per-screen reading catches it.

**THE MIRROR HALL DISPUTE, SETTLED BY EXPERIMENT — and neither side was
right.** Round 15's judge saw "concentric arcs across the whole foreground";
round 15's winner said the parquet was straight by construction and the arc
belonged to the back wall. Round 16's brief refused to pick a side and made
settling it the first task. The builder read the code (a rigid 45-degree
rotation of the plane's own world metres over a CONSTANT block width, no
radial term anywhere), then tested its OWN hypothesis — a 0.16 m block crosses
about a pixel in the middle distance, so a pattern past Nyquist is drawn at
full strength — fitted the fade, photographed it, and found **it changed only
the top 200 rows of 800 while the arcs across the middle and near floor stayed
byte-identical. Ruled out by experiment**, and said so in its own commit
message. What draws the arcs is correct perspective: two families of parallel
world lines running to two vanishing points across a very wide field of view,
with the floor's elliptical light pools laid over the swing to give it
centres. **When a judge and a builder disagree about what is on the screen,
neither one is evidence — make the next round settle it with a capture before
it is allowed to change a line.**

### Round 17: people in the house, 2026-09-23

**LITHARGE, 2 of 2 judges, 6.65 against 5.40 — +1.25** (`44b37fe`, run
`wf_8b1896a4-619`), three of five screens. For sixteen rounds this house was
painted and unpeopled; both judges say LITHARGE is the only candidate that
peoples it, and does so with VARIETY: sitters that differ in sex, dress, pose
and scale, musicians behind the gallery rail, dancing couples in the
mirror-hall glass, a veiled mourner in the graveyard, a figure in a lit
window.

- **The gain was the smallest since round 11, and that is information, not
  failure.** The baseline had risen to 5.40 and the three candidates sat
  inside 0.45 of each other. Both judges still agreed on the winner, so this is
  not round 6's convergence — but read the next round's margin against it.
- **A winner that leaves two wings untouched hands the next round a free
  sheet.** LITHARGE's angle was people, and it did not touch the greenhouse or
  the graveyard. The best work on those sheets was on the two losing branches,
  and both judges named it as the graft. Round 18 gives a whole builder to
  those two wings.
- **A losing branch can carry a regression inside its best idea.** FOLIUM
  rebuilt the glass roof as true pitched geometry, which judge 2 wanted — and
  left the palmhouse's centre bay a starry void, which judge 1 scored below
  the baseline. Its treeline, which both judges wanted, leaks thin diagonal
  lines over the mausolea. A graft brief must name the defect to leave behind,
  not just the idea to take.
- **THE PARQUET IS SETTLED FOR GOOD.** Round 17's brief asked for one
  measurement before any drawing, and FOLIUM made it: the block period, from
  the autocorrelation of the high-passed luminance, is **21 px near and 12 px
  far** on both BASE and its build — a ratio of ~1.75, which is
  1/(y - horizon) for this camera. With round 16's finding that the arcs are
  correct perspective, **two rounds of judge complaints about that floor were
  both perceptual**, and no round changed a line of it. RUBRIC-r18 now tells
  judges not to report it again without naming a line that misses its
  vanishing point.
- **A builder's dev server can die mid-round and another builder's server can
  take its port.** LITHARGE lost its 8962 server and found a BASE server
  listening there; it noticed, moved to 8994 and shot its canonical captures
  from its own worktree. The merged sheets are pixel-identical to its judged
  captures, which is the proof it got it right.

### Round 18: the whole house, not its best room, 2026-09-23

**WOAD, 2 of 2 judges, 6.26 against 5.54 — +0.72** (`1272403`, run
`wf_3a881c5a-1cf`). **Read this one by its screens.** WOAD's mean beat ORCHIL's
by 0.03, while ORCHIL won FOUR of the five screens, each 2 of 2, and WOAD took
only the greenhouse on the tiebreak. The mean alone would have misled either
way — and both judges still chose WOAD, for the reason RUBRIC-r18 asked them to
weigh: **ORCHIL made the round's best single sheets and left one wing below
the baseline; WOAD is good on all four and flattens nothing.** A system that
holds everywhere beats one that peaks. Both then asked for ORCHIL's people as
the graft, which runs on `ui/r18-graft`.

- **THE GAINS ARE SHRINKING, and it is time to look elsewhere.** Round 16
  +2.00, round 17 +1.25, round 18 +0.72, with the field inside 0.33 and the
  baseline climbing (4.70 → 5.40 → 5.54). The rooms are not converged — both
  judges still agreed — but eleven straight rounds have gone to them while the
  boards, dialogs and Kids' places were last judged in rounds 6-7. See the
  SURVEY below.
- **THE BASELINE CARRIES DEFECTS NO BUILDER MADE**, and a judge who sees them
  on one candidate will call them that candidate's regression. The flat
  greenhouse ceiling over a black band, green streaks across its end-wall
  glazing, and horizontal leak lines across the graveyard's masonry are all in
  the merged game; ORCHIL was scored "below baseline" on the greenhouse for a
  roof it never touched. Read a "regression" against the baseline's own
  capture before believing it.
- **A builder that owns one wing hands the rest of the sheet back unchanged**,
  and the judges can see it: WELD's foyer and ballroom were pixel-identical to
  the baseline, and both judges noticed. That is fine for a specialist angle
  and it is why the literal angle keeps winning on the mean.
