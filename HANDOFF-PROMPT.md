# Handoff — the enemies are painted, the Greenhouse has its boss, and the UI pass is between rounds

You are picking up Midnight Menagerie on `dev`, at the commit that added this
file (on top of `45d1875`). Everything below is pushed. No branch holds
unmerged work: the nine `ui/r2-*` branches are cut and empty.

**Josh's standing order is the UI pass, and it is paused between round 1 and
round 2.** Rounds 0 and 1 were built, judged blind and merged. Round 2 is
briefed and written down as a workflow you can launch, and none of it has been
built. His words, 2026-09-12: "create a loop to perfect the UI of the game to
look like the included samples in midnight menagerie/UI, as well as the
backgrounds looking at the same level, critiqued by blind judges ... fan out
agents to triplicate and duplicate builds and critique runs. dont stop until
its perfected." The loop runs until every screen scores 9 from every judge.

## FIRST, BEFORE ANYTHING

**1. `python tools/devserver.py 8777`, then `python tools/gates.py`.** 99 gates,
about 30 minutes (`--only check|run|extra`, `--filter`, `--list`). The last full
run was on `d30ab6d`; the commits since touch docs only. **Four reds:**

| gate | reads | why |
|---|---|---|
| `tests/enemy-stills/check.py` | 432 passed, **1 failed** | **new art, not a regression.** Josh redrew `butler.png` at 21:52 on 09-12, after the 16:25 build (IoU 0.592). Step 2 fixes it |
| `tests/sprites/check.py` | 195 clips, 24 stills, 51 enemy stills, 6 failures | known: Taffy's five HALO clips plus `maya/defeat` |
| `tests/run/run.py` | 50 runs, 2 errors | known: the Archivist draw on seed 371416, and `_losePatience` past turn 30 |
| `tests/steam-deck/run.py` | 5 passed, 1 failed | known: the Map fits its panel after the gate measures; red before the kit too (A/B 09-11 and 09-12) |

Anything else red is new. **Look before you debug: Josh drops art in while you
work.** `ls -t animations/sprites/enemies | head` shows the newest delivery;
`animations/backgrounds/` does not exist yet, which means no background has
arrived.

**2. Rebuild the Butler before anything photographs combat.** He is
`foyer-boss`, which is exactly the fight round 2's COMBAT track photographs.

```
python tools/prep_sprites.py --enemies
python tests/enemy-stills/check.py
git status --short game/assets/sprites
```

Expect 433 passed, and `butler.webp` to have moved (`index.json` too, if his
size changed). If all 51 moved, compare them before committing. Commit the
built still, never the source, and push. That commit is round 2's base.

## THE UI PASS

`docs/ui-pass/README.md` is the loop's home: how a round runs, the traps it has
already paid for, and the score log. Read it before anything below.

| round | track | mean overall, in its round | merged |
|---|---|---|---|
| 0 | the kit, on Shop / Reward / Curiosity | LOCK 7.0 · WICK 6.3 · MOTH 6.2 · the game before 2.2 | LOCK, `ui/r0-c`, `1641055` |
| 1 | REFINE Shop / Reward / Curiosity | OPAL 6.83 · RUNE 6.50 · IRIS 6.08 · round 0's screens 5.58 | OPAL, `ui/r1-refine-b`, `ef3f7e8` |
| 1 | EXPAND Map / Safe Room / Game Over | HUSK 6.67 · FERN 6.44 · VANE 6.06 · the screens before 3.06 | per screen, three judges: Map HUSK, Safe Room and Game Over FERN, `d30ab6d` |
| 2 | POLISH the six · COMBAT · EXPAND-2 Lobby / Clubhouse / Atlas | briefed, not built | |

**Where the game is.** Title, Companion Select and Kid Select ARE Josh's
paintings. Shop, Reward, Curiosity, Map, Safe Room and Game Over are kit boards.
Combat, the Lobby, the Clubhouse, the Atlas, settings and the modals are still
the old navy web chrome.

**What holds the converted screens under 9.** Every round-1 judge named the
same three things. The grounds are renders rather than paintings: every
placeholder is held at about 5 until Josh's backgrounds land. Flat dark gradient
panels and pills still read as web UI. Small text drifts and crowds at 1280x800.

### Launching round 2

1. **The Butler first** (step 2 above). Round 2's base is that commit.
2. **The worktrees.** This session's loop folder, `UILOOP`, is
   `C:\Users\Josh\AppData\Local\Temp\claude\C--Users-Josh-OneDrive-Desktop-Tandem-Tales-Midnight-Menagerie\45f54fe4-aa2f-4720-9112-605f08bb04ac\scratchpad\ui-loop`.
   - It holds `wt/r2-{polish,combat,expand2}-{a,b,c}`: registered with git, on
     `ui/r2-*`, at `45d1875`, with nothing committed.
   - It also holds `judging/r0/` and `judging/r1/` (every capture a judge saw),
     and empty `judging/r2/<track>/<CODE>/` folders for all twelve codes.
   - **To reuse it**, run `git -C "$UILOOP/wt/<name>" merge --ff-only dev` in
     each worktree.
   - **To cut a fresh set** in your own scratchpad (outside OneDrive, always):
     `git worktree remove --force` the nine and `git branch -D` the nine. Then,
     per builder,
     `GIT_LFS_SKIP_SMUDGE=1 git worktree add -b ui/r2-<track>-<slot> "$UILOOP/wt/r2-<track>-<slot>" <base>`.
     `<track>` is `polish`, `combat` or `expand2`; `<slot>` is `a`, `b` or `c`.
     Finally `mkdir -p` the twelve judging folders.
3. **The baselines.** Take them from the main checkout on 8777, under the neutral
   codes (never "BASE", or a judge can tell which candidate is today's game):

   | code | track | screens |
   |---|---|---|
   | `JADE` | POLISH | shop, reward, event, map, rest, gameover |
   | `KELP` | COMBAT | combat, combat-boss |
   | `LOAM` | EXPAND-2 | lobby, clubhouse, atlas |

   Capture each screen twice: at the default size as `<screen>.png`, and with
   `--w 1280 --h 800` as `<screen>-1280.png`. Use exactly the shot commands in
   `BRIEF-r2.md`'s Deliverables, without `--port`. `tools/shot.py` writes
   `shots/<name>.png`; copy from there into `$UILOOP/judging/r2/<track>/<CODE>/`.
4. **Launch.**
   ```
   Workflow({ scriptPath: "docs/ui-pass/round-workflow.js",
              args: { ...contents of docs/ui-pass/round-2.args.json,
                      repo: "C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie",
                      uiloop: "<UILOOP, forward slashes>",
                      base: "<the Butler commit>" } })
   ```
   - It runs up to 18 agents: nine builders on ports 8831–8839, two judges per
     track, and a third wherever those two split.
   - The builders' angles are in the args file:
     - POLISH: AMBER literal, BRAID material and light, CHALK legibility at 1280.
     - COMBAT: DUSK kit-faithful, EMBER a staged arena, FROST readability first.
     - EXPAND-2: GROVE kit-faithful, HAZE staged scenes, IVORY legible boards.
   - It was dry-run with mocked agents on 09-13. Prompts, paths, orders and
     tiebreaks came out right.
   - Round 1 ran six builders at once on this machine. Nine is new: each runs a
     devserver and a Chromium. If the machine struggles, pass `tracks` one or two
     at a time.
5. **Merge.**
   - **POLISH and COMBAT:** take the one winner's branch whole with
     `git merge --no-ff`, as `1641055` and `ef3f7e8` did.
   - **EXPAND-2:** merge screen by screen, as `d30ab6d` did. Take one winner's
     branch whole. Lay the other winner's screen files on top, with ONLY the
     appended kit components and `--kit-*` tokens those screens use. That
     commit's message says exactly what was taken and what was left.
   - **Conflicts:** the tracks own disjoint files (`BRIEF-r2.md`, "Who owns
     what"). The one overlap is that COMBAT and EXPAND-2 both append sections to
     the end of `kit.css`: keep both.
   - **Every merge:** `python tools/endings_guard.py --base <base>`, then the
     battery.
6. **The next round.**
   - Record the scores in the README table.
   - Write `BRIEF-r3.md` from the judges' `winner_fixes` and `grafts`.
   - Write `RUBRIC-r3.md` only if a decision rule changes.
   - Write `round-3.args.json`.
   - Josh's paintings change what a round can reach: when `animations/backgrounds/`
     appears, run `python tools/prep_backgrounds.py` before the baselines.

## DONE THIS SESSION (2026-09-12)

**The enemies are painted** (`9ddf7cd`). 51 enemies stand on the board as their
paintings: the Foyer, the Nursery, the Sleeping Quarters, the Kitchens and the
Greenhouse, delivered while it was being built.
- **The build.** `python tools/prep_sprites.py --enemies` builds them into
  `game/assets/sprites/enemies/<EnemyDef id>.webp`. `ENEMY_ALIAS` covers the four
  files whose names do not convert, including the Porcelain Twins, who arrived as
  `prim.png` and `proper.png`.
- **The switch.** `EnemyView` hides its rig in its CONSTRUCTOR when the manifest
  names a painting.
- **The gate.** `tests/enemy-stills/check.py` covers all of it, including a
  delivered source nobody built and a still built from older art.
- **The sources stay untracked** (`animations/sprites/enemies/`). The gate skips
  its source checks on a machine without them.
- **No matte repair runs on an enemy**, and each was measured before it was left
  out: `dewhite` erased brass highlights on 22 of the first 31. Read the
  enemy-stills comment in `prep_sprites.py` before turning one on.
- **A painted stage takes its painting's shape** (`combat.css`,
  `data-art="still"`). Wide Big Scares were drawing at 41% of their stage height.

**The Carnivorous Conservatory is the Greenhouse boss, and the Head Gardener is a
Big Scare** (`3a12203`).
- **The boss.** `bosses/carnivorous-conservatory.js` is the old §14 kit as phase
  one, at 300 Courage. Phase two follows StS2's own boss shape: below half, The
  Glass Gives Way clears its debuffs and hits every Kid, then the room grows 1
  Overgrowth a turn by itself.
- **The Gardener** moved to `enemies/greenhouse-gardener.js` at 150 Courage, with
  his thresholds scaled.
- **The chapter** (§14a, §16) carries both, so `tests/design-courage` needs no
  divergence.
- **The engine.** The enemy ctx gained `cleanse`, and so did
  `tests/enemies/index.html`'s mock.
- **Measured on the SAME decks at a 4th-wing boss door, 24 fights each:**

  | boss | wins | cost, % of pool | turns |
  |---|---|---|---|
  | the Conservatory, at 300 | 42% | 118% | 13.7 |
  | the Head Gardener it replaced | 21% | 123% | 11.6 |
  | the Confectioner | 83% | 71% | 10.7 |
  | the Bedframe Beast | 88% | 62% | 10.8 |

  It is easier than the Gardener was and still the hardest of the three.
  `tests/run/run.py` saw it three times, which is noise.

**The UI kit**, merged from rounds 0 and 1 (`d47b09c`..`45d1875`).
- **The stylesheet.** `game/src/ui/kit.css` has a header that indexes every
  component. The SVG engrave filters are in `game/index.html`.
- **Built from Josh's paintings.** `tools/prep_ui_kit.py` cuts the kit's pieces
  out of the select-screen paintings.
- **Rendered, not painted.** `tools/prep_ui_materials.py` renders the room
  grounds and materials.
- **Josh's backgrounds.** `tools/prep_backgrounds.py` builds his paintings into
  `game/assets/backgrounds/` and its `index.json`.
- **Hanging a painting.** `ui/kitboard.js` hangs a board's painting for the Safe
  Room and Game Over; `ui/backdrop.js` does the same job for the Map. POLISH fix
  21 unifies them.
- **Photographing a worktree.** `tools/shot.py --port` (`8173b94`) lets a build
  photograph itself on its own server. `tools/endings_guard.py` is the endings
  proof.

**For Josh to paint.**
- `docs/art/background-prompts.md` (`80c94de`) lists 25 paintings, each with its
  filename: 17 `combat-<wing>.png`, plus the map, rest, shop, event, reward,
  gameover, lobby and clubhouse. They go into `animations/backgrounds/`.
- `docs/art/enemy-stills-checklist.md` (`114dc31`, from
  `tools/enemy_art_checklist.py`) lists the 224 enemies without a painting and
  the filename each needs. `--check` flags a delivered name that needs an alias
  or clashes with another.

## JOSH'S CALLS — do not re-ask

- **Enemy still SOURCES stay untracked** "for now" (09-12). The built `.webp` are
  committed.
- **Josh paints the backgrounds** from the prompt pack (09-12). Until each one
  lands, its board shows a rendered placeholder room, and the painting slot
  takes the painting as soon as `prep_backgrounds.py` builds it.
- **The Carnivorous Conservatory is the Greenhouse boss** (09-12), and the Head
  Gardener is "just a big scare".
- **The SS sheets are never committed** (standing). That includes the Kid sheets.
- **`tests/critic-design/result.json`** has been modified in the main checkout
  since before this session. It is not yours; never commit it.

## DO NOT RE-DERIVE THESE

- **Judge scores anchor to the candidates beside them.** Round 0's winner scored
  7.0 in round 0 and 5.58 as round 1's baseline. Compare a winner with the
  baseline in its own round, never across rounds.
- **The enemy-stills gate goes red whenever Josh delivers.** A new file trips
  "every delivered source is built". A redraw trips the IoU check against the
  built still. Rebuild; don't debug.
- **Every deck sits EXACTLY at its cost quota.** Adding a Trick at cost 1, or
  moving one back down, turns `cost-curve` red. That is deliberate. Offset it in
  the same deck and rarity.
- **`ev.card.cost` is the printed cost; `ev.cost` is what the play took.** X is
  -1 and ignores discounts (trap 61).
- **A one-shot discount is spent only by a Trick it PRICED.** The engine passes
  `pricedWith` (trap 62). An X Trick spends none.
- **A free X still counts the owner's Nerve and spends none.** The seam is
  `hooks.any('playsFree', { card })`, asked of X Tricks only.
- **Anything "next turn" banks:** `U.energyNextTurn`, `U.guardNextTurn` (trap 24).
- **A delayed effect runs with NO CARD**, so `N(c)` is empty. Capture the
  resolved nums when you SCHEDULE it (trap 63).
- **A Kid builds at `KID_TARGET_CONTENT_H = 256`, a Companion at 128.**
  `SLUG_ALIAS` maps the delivered `prya` to the game's `priya`.
- **`tests/upgrade-effects` is report-only on purpose.** Read its docstring before
  "fixing" the number.
- **An expedition is a route the party chooses door by door**, so `sweep.py`
  returns 0 loadouts. To measure a mid-house boss, use `bench({ loadout,
  encounterTier, encounterId, hpScale, region, routeIndex })` from
  `tests/critic-design/lib/expedition.js`.

## OPEN, NAMED, NOT STARTED

- **Part art.** The Hydra's Heads, the Wardrobe's Doors, the Favorite Doll, the
  Gardener's seeds and the Growth Patches are still drawn rigs. The Hydra and
  Wardrobe paintings include their parts, so those two fights show the parts
  twice.
- **224 enemies have no painting.** The checklist names each.
- **The Conservatory's 300 Courage is an opening bid.** Measure it again once
  Josh has played it.
- **218 upgrades move nothing a fight can see.** `python
  tests/upgrade-effects/check.py --verbose` names every one. The worst decks are
  pipkin 23, drizzle 26, brambleboo 25, and mopsy and mossbit at 28.
- **Thirteen decks' dead-effect lists** are in
  `docs/notes/2026-09-11-card-cost-pass.md`, under "Found and NOT fixed".
- **`maya/defeat` fails the HALO bar**, and so do Taffy's five clips. Fixing
  either means re-tuning a matte rule against all 195 clips.
- **Pipkin has no `SS_pipkin_ready.png`.** He falls back to idle.
- **The built Kid stills are older than their sources.** A rebuild re-keys them to
  first names, which needs `STILL_ALIAS` in `ui/sprite.js` updated in the same
  commit, and it rewrites ten Companion stills. Compare all 24 before and after.
- **22 SS sheets are still tracked** from `e2233c1`. Untracking them is a decision
  nobody has made.
- **Wisp's Too Bright for Bedtime** only discounts retained cards. It needs a
  "next two Tricks played" status through `discountHooks`.
- **Wink's `readSuccess` cannot survive the enemy phase.** It lives in
  `turnFlags`.

## TRAPS THIS SESSION HIT

- **The working tree can hold CRLF where git holds LF, and `git status` won't
  say.** `git ls-files --eol` shows `i/lf w/crlf`. A census, `grep` or `sed` of
  the working tree then lies about the committed file. Patch from the blob.
  `python tools/endings_guard.py --base <sha>` rebuilds endings from the blob and
  proves them with both numstats.
- **The Edit tool rewrites a MIXED file whole.** `combat.css` came back
  all-CRLF: 18/15 lines, against 4/1 ignoring CR. Its 14 bare LFs are real.
- **`scenes.go` drops a call made while `busy`.** An in-page scene switch waits
  for `!window.MM.ctx.scenes.busy`, then calls `go(..., { instant: true })`. The
  enemy-stills gate went from 6.5 minutes to 1.5 once it switched in-page, and
  failed four boards until it waited.
- **Poll for a class; don't time a CSS state.** The lights-out check read
  `filter: none` on a fixed delay.
- **A running devserver locks its worktree.** On Windows, `git worktree remove`
  says "Permission denied". Stop the server with PowerShell `Stop-Process`
  first.
- **A per-screen merge drags shared pieces with it.** HUSK's Map needed its
  `.kit-railframe`, `.kit-light` and four tokens ported into FERN's kit by hand.
- **Printing judges' notes on Windows** raised UnicodeEncodeError. Set
  `PYTHONIOENCODING=utf-8`.
- **Heredocs mangle backslashes** (09-11). Write patch scripts with the Write
  tool.

## GATES

Every number below is from the battery on `d30ab6d`, 2026-09-12. The commits
since touch docs only.

| gate | reads |
|---|---|
| `tools/gates.py` | 99 gates in 1750s, 4 red (above) |
| `tests/cards/run.py` | 1470 cards, 0 errors, 0 warnings |
| `tests/combat/run.py` · `tests/coop/run.py` | 695 · 645 |
| `tests/cost-curve/check.py` | 17 passed |
| `tests/upgrade-effects/check.py` | 1288 played, 218 moved nothing, 28 unplayable, 54 need a friend, 72 a choice |
| `tests/sprite-triggers/check.py` · `tests/kid-clips/check.py` | 292 · 10 |
| `tests/sprites/check.py` | 195 clips, 24 stills, 51 enemy stills, **6 failures** (known) |
| `tests/sprites/clips.py` | 28 passed |
| `tests/enemy-stills/check.py` | 432 passed, **1 failed** (the Butler's redraw); 433 once rebuilt |
| `tests/greenhouse/check.py` · `tests/design-courage/check.py` | 45 · 129 checked, 0 failures |
| `tests/turn-events/check.py` | 155 files, 4 raw turn listeners, 0 unguarded, 46 through the helper |
| `tests/hook-names/check.py` | 41 engine hooks, 84 companion hooks, 0 unknown |
| `tests/seams/proof.py` · `tests/seams/check.py` | 52 · 8400 call sites, 0 problems |
| `tests/css-tokens/check.py` · `tests/scene-css/check.py` | 0 undefined tokens · 13 sheets, 1141 classes, 0 conflicts |
| `tests/net/run.py` · `tests/map/run.py` · `tests/chrome/run.py` | 190 · 30 · 27 |
| `card-face` · `piles-reachable` · `settings-play` · `gamepad` · `gameover-keeps` | 14 · 24 · 19 · 23 · 16 |
| `tests/combat-scene/seam.py` · `tests/coop/lobby.py` · `tests/coop/matedeck.py` | 22 · 27 · 11 |
| `tests/enemies/run.py` · `audit.py` | 275 enemies · 20104 turns, 0 errors |
| `tests/backpack/run.py` · `tests/critic-design/run.py` | 80 checks · 695 |
| companion suites | boggle 31, bones 30, brambleboo 52, crinkle 49, crumbula 25, drizzle 71, hush 17, marmalade 29, mopsy 28, mossbit 59, pipkin 23, pudding 52, taffy 12, truffle 107, wink 86, wisp 128 — all 0 failed |
| `tests/run/run.py` | 50 runs, **2 errors** (known); victories 5/40, mean run 12.0 rooms |
| `tests/steam-deck/run.py` | 5 passed, **1 failed** (known) |
