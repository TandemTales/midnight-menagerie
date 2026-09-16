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
   OneDrive (a checkout per builder inside the synced folder is a sync storm),
   with `GIT_LFS_SKIP_SMUDGE=1`. Each builder runs its own
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
- **One dev server serves one capture at a time.** `tools/devserver.py` listens
  with a backlog of 5. Two `shot.py` runs at once get ERR_CONNECTION_REFUSED on
  fonts and images, and write console files that look like page errors.
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
placeholder at about 5. `docs/art/background-prompts.md` is the list Josh paints
from, and `tools/prep_backgrounds.py` builds them into `game/assets/backgrounds/`.
