# Handoff — UI pass round 5 is merged and the enemies animate; brief round 6

You are picking up Midnight Menagerie on `dev`. Everything below is pushed.

**Josh's standing order is the UI pass, and it is running.** His words,
2026-09-12: "create a loop to perfect the UI of the game to look like the
included samples in midnight menagerie/UI, as well as the backgrounds looking at
the same level, critiqued by blind judges ... fan out agents to triplicate and
duplicate builds and critique runs. dont stop until its perfected." On 09-13 he
said "continue loop until perfected". The loop runs until every screen scores 9
from every judge.

## FIRST, BEFORE ANYTHING

**1. The enemies animate (09-15), and round 6's COMBAT brief must say how.** Josh's
call was "do it after round 5 merges". His sheets in
`animations/sprites/enemies/animations/` (78 for 19 enemies on 09-15, still
arriving) build with `python tools/prep_sprites.py --enemy-clips`.
- **The build:** it writes `game/assets/sprites/enemy-clips/<id>/` and the
  manifest's `enemyClips` section. The sheets take the Companion matte path,
  because they are grey-flattened generator output, unlike the stills.
  - **Size:** the idle figure builds at the lesser of its native height and its
    still's (at least 256); a boss keeps native, the Butler 379.
  - **Frame cap:** no frame side over 400, clip by clip. Each clip publishes its
    own `unit`, so a wide lunge is softer, not smaller.
  - **Defeats:** every defeat sheet delivered falls AND GETS BACK UP, so it is
    cut at its first most-defeated frame (`defeat_hold`) and held.
  - **No fades:** a clip's `fade` is dropped, because a lunge's blur is not a
    dissolve.
  - **Sheet names:** `rug`, `suitcase` and `conservatory` are aliases in
    `ENEMY_ALIAS`.
- **The game (`ui/enemy.js`, `ui/sprite.js`):**
  - `ClipPlayer` loads an enemy's clips before its still.
  - EnemyView ticks a moving painting through the same `.rg-stillimg`, now
    inside `.rg-stillfit > .rg-stillclip`. The hit flash, lights-out and entrance
    silhouette reach it unchanged.
  - **Beats:** the wind-up plays `attack`, or `cast` for buff, debuff and summon
    intents; an unblocked hit plays `hurt`; a death plays `defeat`, and the
    lights go out at 70% of it.
  - **Idle:** our procedural breath, sway and twitch are off while a clip idles.
  - **Measuring:** `paintRect()` gives a painting's box and feet, and what the
    gates measure by.
- **The gates:** `tests/enemy-clips/check.py` is new: 665 passed, 0 console
  errors. `tests/enemy-stills` measures moving paintings by their feet: 433
  passed.
- **For round 6's COMBAT brief:** the creatures now move, so two captures of one
  board show different idle frames. `enemy.js` is still COMBAT's presentation
  file.

**2. Then brief round 6 from round 5's judges.** The two task output files hold
every build and verdict (read them with `tools/ui_pass_digest.py`):
- `wcudg6f1y.output`: POLISH's and COMBAT's builds and first judging;
- `w4c312fpu.output`: DIALOGS' and KIDS' PLACES' builds and judging, and
  POLISH's and COMBAT's second judging.
Both are in session `f921e739`'s tasks folder,
`C:\Users\Josh\AppData\Local\Temp\claude\C--Users-Josh-OneDrive-Desktop-Tandem-Tales-Midnight-Menagerie\f921e739-3596-4b9f-b0d2-9e78e6b37796\tasks\`.
`--worst THISTLE`, `--worst VESPER`, `--worst BIRCH`, and `--worst GORSE` and
`--worst ELDER` for KIDS' PLACES' screens, give the fix lists; the grafts come
with them. Round 5's 21 agents took about 13M subagent tokens, and the weekly
usage limit stopped six of its builders once (README, "A usage limit can stop
builders mid-build").

**3. Josh drops art in while you work.**
- **Enemies:** `ls -t animations/sprites/enemies | head` shows the newest
  delivery. A new file or a redraw turns `tests/enemy-stills` red until
  `python tools/prep_sprites.py --enemies` rebuilds it. Commit the built still,
  never the source.
- **Enemy animation sheets:** `ls -t animations/sprites/enemies/animations | head`.
  A new or redelivered sheet turns `tests/enemy-clips` red, checked by name and by
  SHA-1. `python tools/prep_sprites.py --enemy-clips --only <id>` rebuilds one
  enemy in about 3 minutes; a run without `--only` rebuilds all 19 in about an
  hour. A sheet under a new name that resolves to no EnemyDef needs an
  `ENEMY_ALIAS` entry: match it by eye against the stills. The sheets are
  gitignored; commit the built clips.
- **Backgrounds:** `animations/backgrounds/` does not exist yet. When it appears,
  run `python tools/prep_backgrounds.py` before the next round's baselines. His
  paintings are the one thing that can lift every screen's background score.

**4. The battery:** `python tools/devserver.py 8777`, then `python tools/gates.py`
(99 gates, about 30 minutes). On the round 5 merge (`25a5111`) it ran 99 gates
in 1754s, red only on the known three:
- `tests/sprites/check.py`: the six HALO clips;
- `tests/run/run.py`: the Archivist on seed 371416, and `_losePatience` past
  turn 30;
- `tests/steam-deck`: the Map race, 6/0 run alone.
`steam-deck`'s Map row is load-sensitive, so re-run it alone before blaming a
change.

## THE UI PASS

`docs/ui-pass/README.md` is the loop's home: how a round runs, the traps, the
score log.

`UILOOP` holds the worktrees (`wt/`) and every capture a judge has seen
(`judging/r0` to `r5`, and `judging/r5/merged/`, the merged tree's fifteen
screens). Since round 5 it is session `f921e739`'s,
`C:\Users\Josh\AppData\Local\Temp\claude\C--Users-Josh-OneDrive-Desktop-Tandem-Tales-Midnight-Menagerie\f921e739-3596-4b9f-b0d2-9e78e6b37796\scratchpad\ui-loop`.
Session `5714ff4c`'s copy holds `judging/r0` to `r5`'s baselines too. A new
session moves the worktrees into its own scratchpad with `git worktree move`
(an instant rename on one drive) and copies `judging/` across, because
subagents write to their own session's scratchpad without permission prompts.
Keep it outside OneDrive, always.

| round | track | mean overall, in its round | merged |
|---|---|---|---|
| 0 | the kit, on Shop / Reward / Curiosity | LOCK 7.0 · WICK 6.3 · MOTH 6.2 · the game before 2.2 | LOCK `1641055` |
| 1 | REFINE Shop / Reward / Curiosity | OPAL 6.83 · RUNE 6.50 · IRIS 6.08 · before 5.58 | OPAL `ef3f7e8` |
| 1 | EXPAND Map / Safe Room / Game Over | HUSK 6.67 · FERN 6.44 · VANE 6.06 · before 3.06 | Map HUSK, the other two FERN `d30ab6d` |
| 2 | POLISH the six boards | BRAID 6.78 · AMBER 6.75 · CHALK 6.72 · before 6.22 | CHALK, decided on the rankings `a4b2ecc` |
| 2 | COMBAT, a Scuffle and a boss | FROST 7.25 · DUSK 6.75 · EMBER 6.25 · before 3.50 | FROST `04af2bc` |
| 2 | EXPAND-2 Lobby / Clubhouse / Atlas | GROVE 6.61 · IVORY 6.56 · HAZE 6.11 · before 2.56 | Lobby GROVE, the other two IVORY `31b6d8f` |
| 3 | POLISH the six boards | ONYX 6.56 · PEARL 6.28 · MINT 6.28 · before 5.50 | ONYX, 2 of 3 `1d9f09d` |
| 3 | COMBAT, with a full-hand board | TOPAZ 7.00 · QUILL 6.50 · SLATE 6.33 · before 5.17 | TOPAZ `f025e59` |
| 3 | DIALOGS opening / Settings / pile viewer | YARROW 6.61 · UMBER 6.56 · WILLOW 6.50 · before 2.72 | UMBER, decided on the rankings `6806123` |
| 4 | POLISH the six boards | ACORN 6.98 · CEDAR 6.82 · BASALT 6.63 · before 6.51 | ACORN `8d05ca5` |
| 4 | COMBAT, three boards | FLINT 7.33 (boss board 8.0) · GARNET 6.92 · EBONY 6.42 · before 5.58 | FLINT `265ac4d` |
| 4 | DIALOGS | KESTREL 7.00 · INDIGO 6.42 · JASPER 6.33 · before 4.92 | KESTREL `42753f9` |
| 4 | KIDS' PLACES | OCHRE 6.94 · MARL 6.94 · NUTMEG 6.83 · before 5.94 | Lobby NUTMEG, Clubhouse OCHRE, Atlas MARL `ecb9315` |
| 5 | POLISH the six boards | THISTLE 7.08 · SABLE 7.08 · RAVEN 6.92 · before 6.25 | THISTLE; a second judging agreed, 4 of 4 `dbcc970` |
| 5 | COMBAT, three boards | VESPER 7.11 · YEW 6.89 · WALNUT 6.83 · before 6.67 | VESPER, 2 of 3; a second judging agreed, 4 of 5 `e3f23aa` |
| 5 | DIALOGS | BIRCH 7.08 · ALDER 6.83 · CLOVE 6.58 · before 5.75 | BIRCH `5313c65` |
| 5 | KIDS' PLACES | GORSE 6.89 · ELDER 6.78 · FINCH 6.72 · before 5.89 | Lobby and Atlas GORSE, Clubhouse ELDER `25a5111` |

**Where the game is.**
- **Paintings:** Title, Companion Select, Kid Select and the opening's Kid picker
  ARE Josh's paintings.
- **Kit screens:** the six boards, combat, the lobby, the clubhouse, the atlas, and
  every Modal (the opening's story, Settings, the pile viewer, the confirm dialog),
  scoring between 6.0 and 8.0 in their last rounds.
- **Still web chrome:** the coach, the handoff veil and the toasts.

**The ceiling is the backgrounds.** Converting a screen has been worth about four
points. Refining a converted one is worth 0.5 to 1.8 points, most when the brief
names defects the judges can see. Every judge scores background near 6 on every candidate, because the
grounds are renders. Until Josh's paintings land, the loop plateaus around 7.

### A round, step by step

1. **Art first** (FIRST, item 2).
2. **Brief.**
   - Write `BRIEF-r<n>.md` self-contained: builders read EVERY brief the args list,
     in full, so never list an old round's brief, with its fix lists.
   - Write `RUBRIC-r<n>.md`, and `round-<n>.args.json`: per track its screens, a
     neutral baseline code, and three builders with slot, code, port 8831–8839 and
     angle; plus `maxBuilders: 6`.
   - Fix lists come from each judge's `worst_problem` for the winning screens, plus
     `grafts`. A judge's `winner_fixes` aim at THAT judge's winner.
   - Dry-run first: `python tools/ui_pass_probe.py docs/ui-pass/round-<n>.args.json`
     prints the agents, the queue, and a builder's and a judge's full prompt.
3. **Worktrees.**
   - `git worktree remove --force` last round's nine, keeping their branches for
     grafts. A running devserver locks a worktree: `Stop-Process` it first.
   - Then, per builder:
     `GIT_LFS_SKIP_SMUDGE=1 git worktree add -b ui/r<n>-<track>-<slot> "$UILOOP/wt/r<n>-<track>-<slot>" <base>`.
   - Make the twelve `judging/r<n>/<track>/<CODE>/` folders.
4. **Baselines.**
   - Photograph from the main checkout on 8777 with the brief's Deliverables
     commands, without `--port`.
   - Take each screen at the default size and again with `--w 1280 --h 800`, saved
     as `<screen>-1280.png`.
   - File them under the neutral codes, never "BASE".
5. **Launch:**
   `Workflow({ scriptPath: "docs/ui-pass/round-workflow.js", args: { ...round-<n>.args.json, repo, uiloop, base } })`.
   Nine builders took about five hours in round 2.
   - If a usage limit stops builders, finish the round as a NEW run of only the
     unfinished tracks, with `resume` set on each stopped builder. Never
     `resumeFromRunId`: it re-ran round 5's finished judges.
6. **Merge.**
   - **REFINE:** `git merge --no-ff` the winner's branch whole. Put the message in
     a file, because `git merge -F -` does not read stdin.
   - **EXPAND:** take one winner's branch whole, then lay the other winner's
     screen files on top with only the kit pieces those screens use (`31b6d8f`).
   - The result's `winnerHow` says whether a majority or the rankings decided.
   - Two appended `kit.css` sections conflict at the end of the file, and git
     aligns their shared `/* ===` opener and final `}`. Run
     `python tools/kitcss_merge.py <base> <branch>`, which rebuilds it from the
     blobs; never just delete the markers.
7. **Check.**
   - Endings, commit to commit: `git diff --numstat <base> HEAD` must equal the
     same with `--ignore-cr-at-eol`. The endings guard is for worktrees: in the
     main checkout it would rewrite Josh's modified `tests/critic-design/result.json`.
   - Photograph every merged screen beside its judged capture, one capture at a
     time.
   - Run the battery, then push.
8. **Log** the scores in the README, update this file and the memory, and brief
   the next round.

### How round 5 merged

- **REFINE, whole branches:** POLISH THISTLE, COMBAT VESPER and DIALOGS BIRCH.
  None conflicted: THISTLE's `kit.css` change was mid-file and VESPER made none,
  and BIRCH's merged by git alone, its change equal to BIRCH's line for line.
- **EXPAND, KIDS' PLACES:** GORSE's branch whole, with its `kit.css` tail joined
  by `tools/kitcss_merge.py`. Then ELDER's `clubhouse.*` on top, with only the kit
  pieces that screen uses, appended as their own section, and ELDER's webps and
  tool. Both sections defined `.kit-stud`; ELDER's is kept, because its winning
  Headquarters uses it. GORSE's `.kit-newsclip` and `newsclip.webp` served only
  its losing Headquarters and are removed. `25a5111`'s message has the whole list.
- **Checks on the assembled tree:**
  - every kit class the screens use is defined, and every referenced asset
    exists;
  - all fifteen screens photographed match their judged captures, the fights
    apart from THISTLE's top bar;
  - scene-css 0 conflicts, css-tokens 0 undefined, then the battery.
- **Reading a result:** `python tools/ui_pass_digest.py <task output> <track> --notes CODE --worst CODE`.
- **Still unconverted:** the coach, the handoff veil and the toasts.

## DONE 2026-09-14 to 09-15

- **Round 5 launched** from session `f921e739` (run `wf_64c93733-bc2`), after
  `5714ff4c`'s prep script finished the 30 baselines and the worktrees moved.
- **The weekly usage limit** stopped all six DIALOGS and KIDS' PLACES builders
  about an hour in (09-14 04:55). POLISH and COMBAT had finished.
- **Josh, 09-15: "Try again."** The six were resumed from their worktrees with a
  note on where each stopped (`ef6c00c`). `resumeFromRunId` re-ran POLISH's and
  COMBAT's judges as well (`d0de98e`). That second, blind judging picked the same
  two winners.
- **Merged:** POLISH THISTLE `dbcc970`, COMBAT VESPER `e3f23aa`, DIALOGS BIRCH
  `5313c65`, KIDS' PLACES GORSE's Treehouse and Atlas with ELDER's Headquarters
  `25a5111`.
- **BIRCH fixed two input bugs that were on dev:**
  - typing an E in the pile viewer's search ended the turn behind the dialog;
  - with Reset open over Settings, Tab stayed trapped on one button and Escape
    closed both dialogs.
- **The loop's README** logs round 5 and the three traps it paid for: the usage
  limit, one capture per dev server, and endings in the main checkout.
- **The enemies animate.** Nineteen enemies, from 78 of Josh's sheets, play
  idle, attack, hurt and defeat, and the Butler and the Governess also play cast.
  - **The build:** `prep_sprites.py --enemy-clips`, with 173 MB of atlases.
  - **The game:** `ClipPlayer` and EnemyView (FIRST, item 1).
  - **The gate:** `tests/enemy-clips`.
  - **Measured before it was decided:** the defeat sheets that get back up, the
    three silhouette names, the per-clip size cap, and the motion-blur fade.

## DONE 2026-09-13

- **The Butler** rebuilt from Josh's redraw (`e32e1ab`; enemy-stills 433 passed).
- **The loop's tooling:**
  - `maxBuilders` in the workflow (`d5935f6`): one capture peaks near 0.9 GB, so
    six builders at once, not nine.
  - `tools/on_port.py` (`6cfaef5`): every test hard-codes :8777, so a worktree
    ran its tests against `dev`.
  - Split decisions on the rankings (`d805f17`); `tools/shot.py --script @file`
    and `tools/shot-scripts/combat-crowd.js` (`662d874`); `tools/ui_pass_probe.py`.
- **Round 2 built, judged and merged** (`a4b2ecc`, `04af2bc`, `31b6d8f`). The
  battery then turned up two undefined tokens (`e14011b`).
- **Round 3 briefed** (`662d874`), built, judged and merged (`1d9f09d`, `f025e59`,
  `6806123`). `c53376a` moved two layout rules off shared kit classes for
  `scene-css`, and `8de2362` rebuilt the Butler from Josh's second redraw.
- **Round 4 built, judged and merged** (`8d05ca5`, `265ac4d`, `42753f9`, `ecb9315`).
  - KIDS' PLACES was assembled from three builders, one per screen.
  - `tools/kitcss_merge.py` and `tools/ui_pass_digest.py` were kept from the
    session's scratchpad.
- **Round 5 briefed** (`d1dd14b`), with its worktrees and baselines set up. Josh
  launches it in a new conversation.
- **Flagged for a separate session:** hovering a card dealt straight into the hand
  logs "ctxFor reading 'hand'" (true on dev too; a task chip was offered).

## DONE 2026-09-12

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

- **Enemy animation sheets go in between UI rounds** (09-13, "do it after round 5
  merges"), never during one: `ui/enemy.js` is the COMBAT track's. Wired 09-15.
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

- **A test run from a worktree tests `dev`.** All 102 test scripts hard-code
  `:8777`, the main checkout's server. `python tools/on_port.py PORT <test>` runs
  one against a worktree's own server.
- **A judge's `winner_fixes` aim at that judge's own winner.** To brief the next
  round on a winner, read every judge's `worst_problem` for it.
- **Judge scores anchor to the candidates beside them.** Round 0's winner scored
  7.0 in round 0 and 5.58 as round 1's baseline. Compare a winner with the
  baseline in its own round, never across rounds.
- **The enemy-stills gate goes red whenever Josh delivers.** A new file trips
  "every delivered source is built". A redraw trips the IoU check against the
  built still. Rebuild; don't debug.
- **So does the enemy-clips gate, for his animation sheets.** A new sheet trips
  "every delivered sheet is built", and a redelivered one the SHA-1 check. Rebuild
  that enemy with `--enemy-clips --only <id>`; don't debug.
- **Every enemy defeat sheet gets back up.** The last frame matches the first
  (silhouette IoU 0.98-1.00 on all 19). The build cuts it; never hold a defeat
  sheet's own last frame.
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

- **The co-op lobby loses keyboard focus on every wire message.** GROVE's
  `_paintRoom` rebuilds the board; IVORY's lost lobby had kept focus
  (`ui/r2-expand2-c`). The game did the same before round 2.
- **`.kit-field`, `.kit-select`, `.kit-select-wrap` and `.kit-hatch` are unused**
  since IVORY's lobby lost. Round 3's DIALOGS may take the first three.
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
- **41 Companion and Kid clips fade to 35% opacity mid-beat.** Examples are
  bones/attack, crinkle/attack and samir/attack. `fade_envelope` likely reads a
  lunge's motion blur as a dissolve; it was meant for Marmalade's spectral and
  zoomies. The enemy build drops these fades. The Companion clips are unchecked
  in the game; a task chip was offered 09-15.
- **The Calling Bell and 255 other enemies have no animation.** They stand as
  stills or rigs until Josh's sheets for them arrive.
- **The built Kid stills are older than their sources.** A rebuild re-keys them to
  first names, which needs `STILL_ALIAS` in `ui/sprite.js` updated in the same
  commit, and it rewrites ten Companion stills. Compare all 24 before and after.
- **22 SS sheets are still tracked** from `e2233c1`. Untracking them is a decision
  nobody has made.
- **Wisp's Too Bright for Bedtime** only discounts retained cards. It needs a
  "next two Tricks played" status through `discountHooks`.
- **Wink's `readSuccess` cannot survive the enemy phase.** It lives in
  `turnFlags`.

## TRAPS

- **`var(--x, fallback)` still needs `--x` defined somewhere,** or `css-tokens`
  goes red. A merge that drops the only file setting a knob does exactly that
  (`e14011b`).
- **When three judges named three winners,** the old vote count returned the
  first judge's pick. Rankings decide now (`d805f17`); read `winnerHow`.
- **Nine builders at once is more than this 16 GB laptop holds.** One Playwright
  capture peaks near 0.9 GB. Keep `maxBuilders` at 6.
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
  tool. It happened again 09-15: a heredoc patch's `\w` never matched.
- **A usage limit can stop builders mid-build, and `resumeFromRunId` re-runs
  more than it should.** It replays a finished agent only when it is called in
  the same order. Finish a stopped round as a new run of its unfinished tracks,
  with `resume` on each stopped builder (`round-workflow.js`).
- **One dev server serves one capture at a time.** Its listen backlog is 5. Two
  `shot.py` runs at once get ERR_CONNECTION_REFUSED on fonts and images, and
  write console files that look like page errors.
- **The endings guard in the main checkout rewrites files that aren't yours.** It
  repairs every file that differs from its base, and Josh's modified
  `tests/critic-design/result.json` is one. Prove a merge's endings commit to
  commit instead.

## GATES

Every number below is from the battery on the round 3 merge (`8de2362`),
2026-09-13. The round 4 merge's battery (`ecb9315`) matched it: red only on the
known sprites and run.py rows, with steam-deck 6/0, map 30/0 and coop/lobby 29/0.
The round 5 merge's (`25a5111`, 2026-09-15, 1754s) matched again. Only two
counts grew with the new code: seams checks 8506 call sites, and scene-css 1424
classes. With the enemy clips (09-15) the battery is 100 gates in 1917s, red
only on the known three. steam-deck went 5/1 then 6/0 run alone.

| gate | reads |
|---|---|
| `tools/gates.py` | 100 gates in 1917s, 3 red: sprites and run.py (known), steam-deck (the Map race; 6/0 run alone) |
| `tests/enemy-clips/check.py` | 665 passed, 0 failed, 0 console errors (19 enemies; beats on door-greeter, dust-bunny, butler) |
| `tests/cards/run.py` | 1470 cards, 0 errors, 0 warnings |
| `tests/combat/run.py` · `tests/coop/run.py` | 695 · 645 |
| `tests/cost-curve/check.py` | 17 passed, 0 failed |
| `tests/upgrade-effects/check.py` | 1288 upgrades played, 218 moved nothing, 28 unplayable on this board, 54 need a friend, 72 hinge on a choice, 0 stale waivers, 0 broken, 0 console errors |
| `tests/sprite-triggers/check.py` · `tests/kid-clips/check.py` | 292 · 10 |
| `tests/sprites/check.py` | 195 clips, 24 stills, 51 enemy stills, 6 failures (known: Taffy's five HALO clips and `maya/defeat`) |
| `tests/sprites/clips.py` | 28 passed, 0 failed |
| `tests/enemy-stills/check.py` | 433 passed, 0 failed, 0 console errors |
| `tests/greenhouse/check.py` · `tests/design-courage/check.py` | 45 · 129 checked, 0 failures |
| `tests/turn-events/check.py` | 155 files scanned, 4 raw turn listeners (0 unguarded), 46 through U.onPlayerTurn |
| `tests/hook-names/check.py` | 167 files, 41 engine hooks, 84 companion hooks, 97 listeners, 201 declared, 0 unknown |
| `tests/seams/proof.py` · `tests/seams/check.py` | 52 · 8506 call sites checked, 0 problems |
| `tests/css-tokens/check.py` · `tests/scene-css/check.py` | 0 undefined tokens · 13 scene sheets, 1424 classes, 0 conflicts |
| `tests/net/run.py` · `tests/map/run.py` · `tests/chrome/run.py` | 190 · 30 · 27 |
| `card-face` · `piles-reachable` · `settings-play` · `gamepad` · `gameover-keeps` | 14 · 24 · 19 · 23 · 16 |
| `tests/combat-scene/seam.py` · `tests/coop/lobby.py` · `tests/coop/matedeck.py` | 22 · 27 · 11 |
| `tests/enemies/run.py` · `audit.py` | 275 enemies, 0 errors · 20104 enemy turns audited, 0 errors |
| `tests/backpack/run.py` · `tests/critic-design/run.py` | 80 checks, 0 failures · {"passed": 695, "failed": 0} |
| companion suites | boggle 31, bones 30, brambleboo 52, crinkle 49, crumbula 25, drizzle 71, hush 17, marmalade 29, mopsy 28, mossbit 59, pipkin 23, pudding 52, taffy 12, truffle 107, wink 86, wisp 128 — all 0 failed |
| `tests/run/run.py` | 50 runs, 2 errors  (115871 ms) (known: the Archivist on seed 371416, `_losePatience` past turn 30) |
| `tests/steam-deck/run.py` | 5 passed, 1 failed in the battery (the Map boss node, load-sensitive); 6 passed, 0 failed alone |
