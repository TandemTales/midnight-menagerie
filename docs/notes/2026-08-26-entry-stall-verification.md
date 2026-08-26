# Entry-stall verification — integrator, 2026-08-26

Verifying round 6 (`8f9c0bf`, "the entry stall was shader linking, not the audio layer")
from fresh context, against the running game rather than the commit message.

## Result

Round 6 is a real win on the thing it targeted, and it leaves a smaller regression behind
that the commit does not mention.

| metric (map entry, `seed=42 region=foyer`) | pre-fix `f6e607c` | round 6 | delta |
|---|---|---|---|
| `scene:entered map` after `goto` | 1078 / 1074 / 1085 ms | 741 / 755 / 766 ms | **−313 ms (−29%)** |
| worst single frame gap | 650 / 667 / 650 ms | 450 / 450 / 450 ms | **−200 ms (−30%)** |
| blocked ms landing >200 ms AFTER `is-drawn` | **0 / 0 / 0** | **367 / 434 / 350** | **+~400 ms** |
| total blocked over the 8 s window | 1133 / 1200 / 1183 ms | 1317 / 1350 / 1300 ms | +~150 ms |

The new cost is four frames of 100–220 ms landing ~800 ms after the sweep finishes — on a
settled map the player is already reading and moving the mouse over. The entry stall it
replaces was behind the transition veil and under the sweep. Whether that trade is good is a
judgement call, but it should be a deliberate one: right now the win is recorded and the cost
is not.

Most likely cause, not yet proven: warm-up phases B/C now overlap the map's entrance instead
of preceding it, because the map enters 313 ms sooner. Same total driver work, later.

## How it was measured — and how it was nearly measured wrong

`tools/entryprof.py` (new). Samples every rAF from page load, reports gaps rather than an
average, and marks `scene:leaving` / `scene:entered` plus class changes on the screen so a
stall can be pinned to a state instead of guessed at from a timestamp.

Three traps hit while building it, all of which produced confident wrong answers first:

1. **Measuring from page load buries the scene inside boot.** Boot here is ~6 s, so a 4 s
   map stall sat unattributed in a 12 s window. `--goto` boots elsewhere, waits for the app
   to settle, then walks in — which is the only window that can attribute anything.
2. **`SceneManager.go` silently drops a call while it is busy** (`[scenes] busy, queued
   drop`). The first `--goto` implementation fired during the boot transition, the map goto
   was refused, and the tool cheerfully reported numbers for the title screen. A transition
   veil animates at a clean 60 fps, so "frames are smooth" was true the whole time. Settling
   now requires `body.dataset.scene === boot && scenes.busy === false` as well.
3. **A/B across two filesystems is not an A/B.** Comparing the OneDrive working tree against
   a worktree on local Temp showed a 330 ms "win" for code that was byte-identical. Both
   sides must sit on the same disk, and an identical-code control must be run alongside the
   real comparison every time — the numbers above have one (FIXED-A vs FIXED-B, byte-identical,
   agreeing within noise).

A fourth trap cost the most: this session's measurements straddled another session's commits.
The working tree gained `renderer.js` changes mid-run, so half the samples were of different
code than the other half. See below.

## Concurrency — this bit an agent again

Two Claude sessions were live in this repo at once. `30f79ff` ("Tooling: entry-stall
profiler…") is a commit by the other session that swallowed this session's in-flight
`tools/entryprof.py` and `tools/devserver.py` — CONTRACTS trap 9, fifth occurrence, this time
between whole sessions rather than between agents inside one. The rule needs to extend past
"do not `git add -A` while agents are editing": **check for a live peer session before
committing at all** (`ListAgents`), because the other writer may not be an agent you spawned.

## Also fixed

`tools/devserver.py` printed a `→` to a cp1252 console and died before binding. Any
non-interactive launch on Windows hit this. stdout/stderr are now reconfigured to UTF-8.
