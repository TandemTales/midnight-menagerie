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

## Results

| round | track | candidates (mean overall, both judges) | winner | merged |
|---|---|---|---|---|
| 0 | kit on Shop / Reward / Curiosity | LOCK 7.0 · WICK 6.3 · MOTH 6.2 · the game before 2.2 | LOCK, "staged boards", both judges | `1641055` |
| 1 | REFINE Shop / Reward / Curiosity | OPAL 6.83 · RUNE 6.50 · IRIS 6.08 · round 0's screens 5.58 | OPAL, both judges | `ef3f7e8` |
| 1 | EXPAND Map / Safe Room / Game Over | HUSK 6.67 · FERN 6.44 · VANE 6.06 · the screens before 3.06 | per screen, 3 judges: Map HUSK, Safe Room and Game Over FERN | `d30ab6d` |
| 2 | POLISH Shop / Reward / Curiosity / Map / Safe Room / Game Over | BRAID 6.78 · AMBER 6.75 · CHALK 6.72 · the screens before 6.22 | CHALK: three judges named three winners; CHALK beats each rival 10-8 head to head over the 18 rankings, Borda 34 / 30 / 30 | `a4b2ecc` |
| 2 | COMBAT, a Scuffle and a boss | FROST 7.25 · DUSK 6.75 · EMBER 6.25 · the screen before 3.50 | FROST, both judges | `04af2bc` |
| 2 | EXPAND-2 Lobby / Clubhouse / Atlas | GROVE 6.61 · IVORY 6.56 · HAZE 6.11 · the screens before 2.56 | per screen, 3 judges: Lobby GROVE, Clubhouse and Atlas IVORY | `31b6d8f` |
| 3 | POLISH the six; COMBAT with a full hand; DIALOGS the opening's story / Settings / the pile viewer | briefed (`BRIEF-r3.md`, `RUBRIC-r3.md`, `round-3.args.json`) | | |

**Scores anchor to the candidates beside them.** Round 0's winner scored 7.0 in
round 0 and 5.58 as round 1's baseline: the judges grew stricter as the field
improved. Compare a winner with the baseline IN ITS OWN ROUND (round 1 REFINE:
+1.25), never across rounds.

Round 2 against its own baselines: POLISH +0.50, COMBAT +3.75, EXPAND-2 +4.05.
Converting a screen moves it about four points; refining a converted one moves it
about half a point, and less each round (+1.25, then +0.50). The background
dimension is what stalls: every judge scores it near 6 on every candidate, winner
or not, because the grounds are still renders.

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
