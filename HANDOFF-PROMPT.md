# Handoff — every deck re-costed, the dead cards named, and the Kids animate

You are picking up Midnight Menagerie on `dev`, at `e29ddc2`. Everything below
is pushed. Nothing is half-applied and no branch is waiting.

**The previous asks are finished.** "Fix the card cost range across all decks"
became a per-deck design pass over all sixteen pools; the dead effects it
catalogued became a repair round on the three worst decks plus the gate that can
see the whole class; and "implement the Kid animations and wire the Companions
completely" is done and gated. What is left is named at the bottom, and the
biggest single piece of art work — thirty enemy stills — is sitting untracked on
disk waiting for someone to wire it.

## FIRST, BEFORE ANYTHING: `python tools/gates.py`

That is new, and it replaces "run the whole sweep". It runs **99 gates one at a
time** — 45 `check.py`, 43 `run.py`, and 11 entry points named neither, which no
list reached before. `--only check|run|extra`, `--filter <substring>`, `--list`.
It also scans `tests/*/*.py` for anything printing a `RESULT:` line that no list
runs, so `EXTRAS` cannot rot; add a new one there, or to `NOT_GATES` with a
reason.

It needs the dev server: `python tools/devserver.py 8777`.

**Three reds are expected and none of them is yours:**

| gate | reads | why |
|---|---|---|
| `tests/sprites/check.py` | 195 clips, 24 stills, 51 enemy stills, 6 failures | Taffy's five HALO clips (open since 09-11) plus `maya/defeat` |
| `tests/run/run.py` | 50 runs, 2 errors | the Archivist draw on seed 371416, and `_losePatience` past turn 30 |
| `tests/steam-deck/run.py` | 5 passed, 1 failed | the Map fits its panel after the gate measures; red on origin/dev too |

Anything else red is new. The full battery takes ~30 minutes.

## WHAT SHIPPED

**The card cost pass** (`c90374e`..`7cd3de3`). 270 Tricks re-priced across all
sixteen pools. Cost 1 went from 57.4% of the pool to 41.0%; commons from 80% to
54%; every deck gained a Trick costing 4 and an X Trick, where there had been
none and one. `tests/cost-curve/check.py` asserts the TARGET **by default** now,
per rarity and per Companion. Three engine rules had to be fixed to make the new
costs mean anything, and they are CONTRACTS traps 61, 62 and the trap 24
extension. `docs/notes/2026-09-11-card-cost-pass.md` is the record.

**The dead-effects round** (`8c4e8e9`..`8b81d26`). Truffle 27→107 suite checks,
Wisp 25→128, Wink 16→86 — each deck had one root cause under most of its list.
Ten Powers were firing once per ENEMY behind a gate that could not see the
`?.on?.(` spelling. `tests/upgrade-effects/check.py` and `tools/gates.py` were
built here. `docs/notes/2026-09-11-dead-effects-round.md` is the record.

**The animations** (`c971d7e`..`e29ddc2`). Pudding's eleven clips and all eight
Kids' four clips are built and wired: 24 animated slugs, 195 clips, 181MB. The
Kid on the board swings on the wind-up, flinches on an unblocked hit only, and
falls with her Companion. Pudding's Protective Brace, Dig and Fetch have rules.

## DO NOT RE-DERIVE THESE

- **Every deck sits EXACTLY at its cost quota.** Adding a Trick at cost 1, or
  moving one back down, turns `cost-curve` red. That is deliberate. Offset it in
  the same deck and rarity.
- **`ev.card.cost` is the printed cost; `ev.cost` is what the play took.** X is
  -1 and ignores discounts. Three hooks had this wrong (trap 61).
- **A one-shot discount is spent only by a Trick it PRICED** — the engine passes
  `pricedWith` (trap 62). An X Trick spends none.
- **A free X still counts the owner's Nerve and spends none.** The seam is
  `hooks.any('playsFree', { card })`, asked of X Tricks only. Crinkle's
  Overfolded is the one rule that uses it.
- **Anything "next turn" banks:** `U.energyNextTurn`, `U.guardNextTurn`. Six
  more callers were found on the timer path this round (trap 24).
- **A delayed effect runs with NO CARD**, so `N(c)` is empty — capture the
  resolved nums when you SCHEDULE it (trap 63). That was sixteen dead Wisp
  upgrades.
- **The SS sheets are never committed.** `.gitignore` covers
  `animations/SS_*.png` and `animations/kids/SS_*.png`; the LFS rule never
  matched the subfolder, so `animations/kids/` (208MB) would have gone in as
  plain blobs. The built atlases under `game/assets/sprites` ARE committed.
- **A Kid builds at `KID_TARGET_CONTENT_H = 256`, a Companion at 128**, and each
  slug publishes its own `unit`. `SLUG_ALIAS` maps the delivered `prya` to the
  game's `priya`, because `ClipPlayer` looks an atlas up by the GAME's slug.
- **`tests/upgrade-effects` is report-only on purpose.** Its 218 are real, but a
  dummy board cannot judge everything: 28 Tricks it cannot play at all, 54 that
  need a friend, and 72 that hinge on a choice are counted APART. Read its
  docstring before "fixing" the number.

## DONE SINCE: THE ENEMIES ARE PAINTED (2026-09-12)

**51 enemies stand on the board as their paintings** — the Foyer, the Nursery,
the Sleeping Quarters, the Kitchens and the Greenhouse, delivered while it was
being built. `python tools/prep_sprites.py --enemies` builds them into
`game/assets/sprites/enemies/<EnemyDef id>.webp`, `ENEMY_ALIAS` covers the four
files whose names do not convert, `EnemyView` hides its rig in its CONSTRUCTOR
when the manifest names a painting, and `tests/enemy-stills/check.py` gates all
of it — including a delivered source nobody built, and one rebuilt from old art.

- **The sources stay untracked** (`animations/sprites/enemies/`): Josh's call,
  2026-09-12. The gate skips its source checks on a machine without them.
- **No matte repair runs on an enemy**, and each was measured before it was left
  out — `dewhite` erased brass highlights on 22 of the first 31. Read the
  enemy-stills comment in `prep_sprites.py` before turning one on.
- **A painted stage takes its painting's shape** (`combat.css`,
  `data-art="still"`): wide Big Scares were drawing at 41% of their stage height
  with their intent 235px above them.
- **Parts with no art keep their drawn rigs**: the Hydra's Heads, the Wardrobe's
  Doors, the Favorite Doll, the Head Gardener's seeds, the Growth Patches. The
  Hydra and Wardrobe paintings include their parts, so those fights show them
  twice until part art exists.

## DONE SINCE: THE GREENHOUSE HAS A NEW BOSS (2026-09-12)

**The Carnivorous Conservatory is the Greenhouse boss and the Head Gardener is a
Big Scare** — Josh's call. `bosses/carnivorous-conservatory.js` is the old §14 kit
as phase one at 300 Courage, plus a phase two from StS2's own boss shape (below
half: The Glass Gives Way clears its debuffs and hits every Kid, then the room
grows 1 Overgrowth a turn by itself). The Gardener moved to
`enemies/greenhouse-gardener.js` at 150 with his thresholds scaled. The chapter
(§14a, §16) carries both, so `tests/design-courage` needs no divergence. The
enemy ctx gained `cleanse` (and so did `tests/enemies/index.html`'s mock).

- **Measured on the SAME decks at a 4th-wing boss door, 24 fights each:** the
  Conservatory wins 42% at 118% of pool; the Head Gardener it replaced wins 21%;
  the Confectioner 83%, the Bedframe Beast 88%. Easier than before, still the
  hardest of the three. `sweep.py` cannot measure a mid-house boss any more: its
  expeditions never reach the wing. `tests/run/run.py` saw it 3 times — noise.

## ASKED FOR, NOT STARTED WHEN THIS WAS WRITTEN

- **"create a loop to perfect the UI of the game to look like the included
  samples in midnight menagerie/UI, as well as the backgrounds looking at the
  same level, critiqued by blind judges ... fan out agents to triplicate and
  duplicate builds and critique runs. dont stop until its perfected."** Title,
  Companion Select and Kid Select already ARE the painted samples; everything
  else is not. Josh will paint the backgrounds from a prompt pack.

## OPEN, NAMED, NOT STARTED

- **218 upgrades move nothing a fight can see.** `python
  tests/upgrade-effects/check.py --verbose` names every one, grouped by deck.
  Worst: pipkin 23, drizzle 26, brambleboo 25, mopsy/mossbit 28.
- **Thirteen decks' dead-effect lists** are in the cost-pass note under "Found
  and NOT fixed". Truffle, Wisp and Wink are done; the rest stand.
- **`maya/defeat` fails the HALO bar** (edge 22% of body against 50%). It was
  authored on a darker backdrop than her other clips and lift is +0.4, so
  `dehalo` never fires. Taffy's five are the older one. Fixing either means
  re-tuning a matte rule against all 195 clips, not one.
- **Pipkin has no `SS_pipkin_ready.png`** — the only missing universal clip
  across sixteen Companions. He falls back to idle, which is correct behaviour
  for a missing `ready`.
- **The built stills are older than their sources.** Seven Kids and Pudding were
  redrawn (`e29ddc2`); the `.webp` files are from 09-05. A rebuild also re-keys
  the Kid stills to first names (`maya.webp`, not `mayaChen.webp`), which needs
  `STILL_ALIAS` in `ui/sprite.js` updated in the same commit, and it rewrites ten
  Companion stills under matte rules that changed after they were built. Compare
  all 24 before and after.
- **22 SS sheets are still tracked** from `e2233c1`. Ignoring a path does not
  untrack what is in it. Untracking them is a decision nobody has made.
- **Wisp's Too Bright for Bedtime** reads the hand at `turn:start`, before the
  deal, so it only discounts retained cards. It needs a "next two Tricks played"
  status through `discountHooks`, not a `costMod` on two hand slots.
- **Wink's `readSuccess` cannot survive the enemy phase** — it lives in
  `turnFlags`, so Gotcha!, Skitter's Guard, Wrong Answer and Closed Loop only
  ever see Reads that resolved during your own turn.

## TRAPS THIS SESSION HIT

- **A blanket line-ending claim in an agent brief flipped fifteen files.** The
  brief said "files are CRLF" (true of the `.js`), and it also covered each
  Companion's design chapter, which are LF. Fifteen came back whole-file CRLF:
  10,800 lines of churn over ~230 real ones, and every agent reported its
  endings kept. Gate a parallel pass with `git diff --numstat` against
  `git diff --numstat --ignore-cr-at-eol` before believing a single report.
- **A gate's ruler goes stale when the thing it measures changes shape.**
  `tests/sprites/clips.py` measured the Kid's width with `getBBox()`, which
  ignores clipping: fine for a trimmed still, and the whole 9x9 atlas once she
  animated. It failed on correct code.
- **Heredocs mangle backslashes.** `\s` and `\b` inside a `<<'PY'` heredoc
  arrived as a SyntaxWarning and a literal backspace this session. Write patch
  scripts with the Write tool, or build backslashes with `chr(92)`.
- **A report-only gate must bucket what it cannot judge**, or nobody believes
  it. The upgrade gate's first draft called 600 upgrades dead because it read
  the board after the turn-start Guard wipe.

## GATES

Every number below was re-run at `e29ddc2` unless noted.

| gate | reads |
|---|---|
| `tools/gates.py` | 98 gates, 4 red — one of which (`sprites/clips.py`) was fixed after that run and is 28/0 |
| `tests/cards/run.py` | 1470 cards, 0 errors, 0 warnings |
| `tests/combat/run.py` · `tests/coop/run.py` | 695 · 645 |
| `tests/cost-curve/check.py` | 17 passed — the TARGET, per rarity AND per Companion |
| `tests/upgrade-effects/check.py` | 1288 played, 218 moved nothing, 28 unplayable, 54 need a friend, 72 a choice |
| `tests/sprite-triggers/check.py` | 292 passed — no dead clip, no dead keyword |
| `tests/kid-clips/check.py` | 10 passed — she swings, flinches (not when blocked) and falls |
| `tests/sprites/check.py` | 195 clips, 24 stills, 51 enemy stills, **6 failures** (known) |
| `tests/enemy-stills/check.py` | 433 passed — 51 painted enemies on 35 boards, 6 drawn controls |
| `tests/turn-events/check.py` | 152 files, 4 raw turn listeners, 0 unguarded, 46 through the helper |
| `tests/hook-names/check.py` | 41 engine hooks, 84 companion hooks, 0 unknown |
| `tests/seams/proof.py` · `tests/seams/check.py` | 52 passed · 8343 call sites, 0 problems |
| `tests/net/run.py` · `tests/map/run.py` · `tests/chrome/run.py` | 190 · 30 · 27 |
| `tests/enemies/run.py` · `audit.py` | 275 enemies · 20162 turns, 0 errors |
| `tests/backpack/run.py` · `tests/critic-design/run.py` | 80 checks · 695 |
| companion suites | boggle 31, bones 30, brambleboo 52, crinkle 49, crumbula 25, drizzle 71, hush 17, marmalade 29, mopsy 28, mossbit 59, pipkin 23, pudding 52, taffy 12, truffle 107, wink 86, wisp 128 — all 0 failed |
| `tests/run/run.py` | 50 runs, **2 errors** (known); victories 4/40, mean run 12.1 rooms |
| `tests/steam-deck/run.py` | 5 passed, **1 failed** (known) |
