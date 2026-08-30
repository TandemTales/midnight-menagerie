# The unreachable sweep — 2026-08-30


A six-agent sweep of `ui/`, `scenes/`, `combat/`, `data/`, the plumbing and the
documents, looking for the CONTRACTS 54 class: things that are built,
documented, sometimes tested, and that nothing can reach — plus documented
claims that are false against the code. A skeptic per area was then told to
refute each finding.

It was worth running on the strength of one result alone: **`attachActions` had
no caller anywhere in `game/src/`**, so the lobby screen written four hours
earlier shipped a networked game in which no input either player made would ever
have been applied. That is fixed (`attachSession`), and `tests/coop/lobby.py`
now sends a real vote and asserts it lands on both tabs.

## Read the numbers honestly

**111 findings. 24 of them carry a real adversarial verdict. The other 87 do
not, and that is a bug in my orchestration rather than a clean bill of health.**

The workflow's own log says "111 of 111 survived the skeptics", and that line is
wrong. The script matched each skeptic's verdict to its finding by exact `where`
string equality; the skeptics phrased their `where` differently ("game/src/ui/
settings.js:65 (claim at settings.js:19)" against the finder's "…(claim at
game/src/ui/settings.js:19)"), so most verdicts never joined and every unjoined
finding was kept by the `if (v && v.refuted) continue` fall-through.

So: the 24 below were adversarially checked and stood up. The remaining 87 carry
their finder's own evidence — actual `rg` invocations and what they returned —
and nothing more. Treat them as leads with homework attached, not as confirmed
defects. **Re-run the skeptic pass with a join on something stable (a file:line
pair, or an index) before believing the total.**

Composition: 61 unreachable, 48 false-claim, 2 cannot-fail. By area: claims 23, combat 16, data 21, plumbing 17, scenes 11, ui 23.

---

## Closed later the same day

Six findings are FIXED and marked as such below. In the order they were taken:

| finding | where it sat | what it turned out to be |
|---|---|---|
| Leads 1 + 2 + 57 — `autoEndTurn`, `confirmSingleTarget` | lead | both implemented in `scenes/combat.js`; `tests/settings-play/run.py` (19) |
| Leads 7 — `gameover.js` fabricates Keepsakes | lead | **worse than reported**; `tests/gameover-keeps/run.py` (16) |
| Leads 28 — nine unplayable cards' rules never ran | lead | a new `handHooks` seam on CardDef; `tests/hand-cards/run.py` (40) |
| Verified 1 — DeckView's Vanished pile | verified | a pile button and the `T` hotkey; `tests/piles-reachable/run.py` (24) |
| Verified 2 — deckview.js's sort claim | verified | a two-line doc fix; combat.js really does no sorting |

**What that says about the 24/87 split.** Two of the six came from the verified
24 and four were unverified leads — and every one of the four was real when
checked. One was materially worse than its finder said: the `gameover.js`
fallback table was reported as "5 of 7 ids do not exist", and reading the two
that DO exist showed both were printed with invented rules text. Seven entries,
seven wrong.

So the 87 are worth reading. They are still not worth trusting unread, which is
the same sentence with the verb changed. Each one took a fresh look at the code
before a line was written, and the leads' own searches were right about where to
look and imprecise about what was there.

**And one thing no finding contained,** which is the other half of what a sweep
is for. Lead 28 read the engine correctly and said the nine cards' rules could
never run. It could not tell you that `onCardDrawn` and `onCardPlayed` are
GLOBAL dispatches, so in a party a Curse in YOUR hand hears about a teammate's
draw and would have charged you for their turn; or that Weak and Frail expire in
the same `turnEnd` bucket the fix fires in, so Bad Luck and Clingy Shadow would
have handed you a stack that died in the same breath it arrived. Both came out
of building it. A finding is a place to start reading, not a spec.

---

## Adversarially verified (24)

Each of these was handed to an agent instructed to refute it, which could not.

### 1. FIXED 2026-08-30. DeckView's `exhaust` mode (title "Vanished", note "Out of this Scuffle…") is never requested by anything, so the Vanished pile viewer the header advertises cannot be opened in the game.

**Where:** `game/src/ui/deckview.js:37 (MODES.exhaust; claim at deckview.js:4-5)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> Same three openPile call sites as above; none passes `mode:'exhaust'`. `rg -n "mode:\s*'(deck|draw|discard|exhaust|reward)'" game/src/` returns only the two `'deck'` literals plus the doc line. combat.js's `_pileCards` (combat.js:3275) handles only 'draw', 'torn' and discard — there is no exhaust/Vanished pile button on the combat screen.

**Skeptic, told to refute it:** Same three openPile call sites; none passes 'exhaust'. I read combat.js:3275-3302 `_pileCards`, which handles only 'draw', 'torn' (mine.stash) and discard — there is no Vanished pile button or hotkey on the combat screen. The header's "the Vanished pile" in the list of moments this component serves is therefore unbacked.

### 2. FIXED 2026-08-30. deckview.js's header says "combat.js already sorts by name before handing the list over; this view sorts again anyway so the guarantee does not depend on the caller" — combat.js does no sorting at all, so the draw-pile-is-not-an-oracle guarantee rests entirely on DeckView's own default.

**Where:** `game/src/ui/deckview.js:18-20`  
**Kind:** false-claim · **finder confidence:** high · **area:** ui

> Read game/src/scenes/combat.js:3275-3302 `_pileCards`: it returns `raw.map(...)` over `mine.draw` / `mine.discard.slice().reverse()` with no sort. `rg -n "\.sort\(" game/src/scenes/combat.js` yields one unrelated hit (combat.js:3128, sorting waiting players by seat). The guarantee does hold, via deckview.js:70 (`this.sort = this.mode === 'draw' ? 'name' : …`), but the stated reason is wrong.

**Skeptic, told to refute it:** I read game/src/scenes/combat.js:3275-3302: `_pileCards` returns `raw.map(...)` over `mine.draw` with no sort at all. `grep -n "\.sort(" game/src/scenes/combat.js` returns exactly one hit, combat.js:3128, sorting waiting players by seat — unrelated. The other two callers (hud.js:483 via `r.deckViews()`, combat.js:2607) are 'deck' mode. The guarantee itself does hold via deckview.js:70, but the stated reason ("combat.js already sorts by name before handing the list over") is false.

### 3. `intentIcon(type)` has no caller — both places that need an intent icon id inline the identical expression instead of importing it.

**Where:** `game/src/ui/icons.js:402`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "intentIcon" . --glob '!node_modules'` returns only icons.js:402 (definition), icons.js:409 (the default-export object) and one docs/notes API list. No file in game/src/ does a default import of icons.js (`rg -n "^import [A-Za-z_$][A-Za-z0-9_$]*(,| from)" game/src/` matched nothing for ui modules), so the default object is not a reader. The duplicated logic lives at ui/intent.js:563 (`hasIcon(`intent.${i.type}`) ? … : 'intent.unknown'`) and ui/tooltip.js:592.

**Skeptic, told to refute it:** Word-boundary grep for intentIcon across the repo: icons.js:402 (definition), icons.js:409 (the default-export object), one docs/notes API list. Nothing imports icons.js's default binding — `import * as` across game/src matches only THREE and data/companions/_util.js, and no `import <ident> from './icons.js'` exists. The two places that need the id inline it instead: ui/intent.js:563 (`hasIcon(\`intent.${i.type}\`) ? ... : 'intent.unknown'`) and ui/tooltip.js:592 (`\`intent.${INTENT_TEXT[type] ? type : 'unknown'}\``). No string dispatch reaches the export.

### 4. `inkLine()` — the wobbly-line path generator — is exported and called by nothing in the entire repository.

**Where:** `game/src/ui/mapnode.js:44`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "inkLine" . --glob '!node_modules'` returns exactly two lines: mapnode.js:44 (the declaration) and one prose mention in docs/notes/2026-08-20-map-agent-round-2… claiming "scene draws (`inkLine`, trimmed at the real node radii…)". scenes/map.js draws its edges with `pencilStroke` instead (mapnode.js:101, imported at map.js). Not in the default-export list; mapnode.js has no default export.

**Skeptic, told to refute it:** Word-boundary grep for inkLine across the repo returns two lines: mapnode.js:44 (declaration) and one prose mention in docs/notes/2026-08-20-map-agent-round-2. scenes/map.js imports `mapNodeMarkup, nodeSymbol, hazardSymbol, hazardGlyphMarkup, pencilStroke, seedOf, escapeHtml` (map.js:21) — not inkLine — and draws its edges with pencilStroke at map.js:1010 and :1022. mapnode.js has no default export and no namespace import of it exists.

### 5. `faceCacheSize()` and `clearFaceCache()` are labelled "Test/diagnostic hooks" but no test — and no other file — references either one.

**Where:** `game/src/ui/petart.js:2117-2118 (comment at petart.js:2116)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "faceCacheSize" . --glob '!node_modules'` and the same for `clearFaceCache` each return a single line: the declaration. Compare the neighbouring `PET_KEYS` (petart.js:2119), which really is used by tests/faces/index.html:49/56/66, and cardart.js's `artCacheSize` ("Used by the test page's fps harness"), which really is used by tests/cards-feel/index.html:105.

**Skeptic, told to refute it:** Word-boundary greps for faceCacheSize and clearFaceCache each return a single line — the declaration at petart.js:2117 / :2118. Nothing under tests/ or tools/ references either, so the "Test/diagnostic hooks" label at petart.js:2116 has no harness behind it. The immediately following `PET_KEYS` (petart.js:2119) really is used by the faces test page, which rules out a whole-block exclusion.

### 6. `Hand.maxBottom()` has no caller, and its doc comment ("What the critic's assertion measures: the lowest pixel any card reaches") is false — the critic measures DOM `getBoundingClientRect().bottom`, not this method's tween-space arithmetic.

**Where:** `game/src/ui/hand.js:910`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "maxBottom" . --glob '!node_modules'`: hand.js:910 (declaration) plus tests/cards-feel/index.html:302 and tests/cards-feel/run.py:758/804-805. Reading tests/cards-feel/index.html:281-303, the harness computes `const bottom = Math.max(...rs.map(r => r.bottom))` from `document.querySelectorAll('.mm-hand__cards .mm-card')` rects and stores it under the key `maxBottom` — it never calls `hand.maxBottom()`. The two are different quantities (the method uses `c.y + |sin(rot)|*hw` in hand-local space).

**Skeptic, told to refute it:** Word-boundary grep for maxBottom: hand.js:910 (declaration) plus tests/cards-feel/index.html:302 and run.py:758/804-805. I read hand.js:909-918 — the method sums `c.y + |sin(c.rot)| * hw` in hand-local tween space. The harness lines are object-literal KEYS: index.html:302 `maxBottom: +bottom.toFixed(1)` where `bottom` comes from DOM `getBoundingClientRect()` rects, and run.py:758 `maxBottom: +Math.max(...rows.map(r => r.bottom))`. Neither invokes `hand.maxBottom()`; a call would have matched the same grep. So both halves of the claim hold — no caller, and the doc comment names a quantity the critic does not measure.

### 7. `EnemyView.headTop()` is a public geometry accessor with zero callers anywhere.

**Where:** `game/src/ui/enemy.js:1216`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "headTop" . --glob '!node_modules'` returns exactly one line: the declaration. Its sibling `centre(out)` (enemy.js:1208) is called from scenes/combat.js for FX placement; nothing asks for the head position.

**Skeptic, told to refute it:** Word-boundary grep for headTop across the whole repo returns exactly one line, the declaration at enemy.js:1216. I read enemy.js:1205-1219: the sibling `centre(out)` is the accessor combat.js actually uses for FX placement; `headTop()` is never asked for, by name or by any string.

### 8. icons.js declares `['status.open-eyes','ui.eye']` in ICON_ALIASES as "ONE drawing published under several ids", but the two path strings differ (open-eyes carries a third sub-path, the pupil), so tests/chrome/run.py's identical-path collapse cannot collapse them; separately, ICON_ALIASES itself is read by nothing.

**Where:** `game/src/ui/icons.js:328 (list at icons.js:320)`  
**Kind:** false-claim · **finder confidence:** high · **area:** ui

> Wrote a parser over icons.js's group objects and compared resolved path data for all 8 declared alias groups: 7 print OK, `['status.open-eyes','ui.eye']` prints DIFF — icons.js:188 ends `…0-10.4zm0 2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z` while icons.js:291 stops at `…0-10.4z`. tests/chrome/run.py:269-279 collapses by `canon[paths[iid]]`, i.e. exact path equality, so this pair is not collapsed. `rg -n -w "ICON_ALIASES"` finds only icons.js:320, icons.js:409 (the unimported default object) and a docs/notes mention.

**Skeptic, told to refute it:** I compared the two path strings directly. icons.js:188 `'open-eyes'` ends `...0-10.4zm0 2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z` (three sub-paths — outline, iris, pupil); icons.js:291 `eye` stops at `...0-10.4z` (two). I then read tests/chrome/run.py:268-280: it builds `paths` from `CHROME.ICON_IDS` + `CHROME.iconPath(id)` and collapses with `canon.setdefault(paths[iid], iid)` — exact string equality — so this pair cannot collapse. run.py never reads ICON_ALIASES; the word grep for ICON_ALIASES finds only icons.js:320, icons.js:409 (default export, unimported) and a docs/notes mention. Both halves verified.

### 9. CSS class `.mm-focusable` — the shared keyboard focus ring — is never put on any element by any JS or HTML in the repo.

**Where:** `game/src/ui/base.css:52`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n --fixed-strings "mm-focusable" . --glob '!node_modules'` returns exactly one line, the selector itself. A word-boundary sweep of all 231 class names declared in game/src/ui/*.css against every .js/.html under game/ confirms it. The co-selector `.mm-btn:focus-visible` on the next line does fire, so the rule is not entirely dead — the `.mm-focusable` half is.

**Skeptic, told to refute it:** Fixed-string grep for mm-focusable across the repo (excluding node_modules) returns exactly one line, the selector at base.css:52. I checked for dynamic construction too: no `mm-` template-literal class builder produces it (the only such builders I found are `mm-logo--${size}` in portrait.js:481 and the hand's literal class names). The `.mm-btn:focus-visible` co-selector on the next line does fire, so only the `.mm-focusable` half is dead.

### 10. CSS class `.mm-hand__pile` ("pile markers (the hand draws to/from these)") is never produced — the Hand flies cards to numeric coordinates supplied by `setPiles()`, not to marker elements.

**Where:** `game/src/ui/hand.css:274 (comment at hand.css:273)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n --fixed-strings "mm-hand__pile" . --glob '!node_modules'` returns exactly one line, the selector. hand.js:320-322 defaults `this.piles.draw/{x,y}` to hardcoded numbers, hand.js:472 `setPiles(p)` merges caller-supplied coordinates, and hand.js:624/749/1599 read `this.piles.draw.x` / `this.piles.discard.y` — plain numbers, no DOM lookup.

**Skeptic, told to refute it:** Fixed-string grep for mm-hand__pile returns one line, the selector. I listed every `mm-hand__` class hand.js actually creates (hand.js:237-240 markup, :260 probe, :264-271 querySelectors, :539 warm host): threshold, cards, hit, arrow, probe, warm — no pile marker. hand.js:320-322 defaults the pile coordinates to hardcoded numbers, setPiles() merges caller numbers, and the readers use `this.piles.draw.x` style arithmetic; there is no DOM lookup of a marker element anywhere.

### 11. CSS class `.is-shimmering` (portrait plate sheen trigger) is never added by any code; only the `:hover` half of that rule can fire.

**Where:** `game/src/ui/portrait.css:88`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n --fixed-strings "is-shimmering" . --glob '!node_modules'` returns exactly one line, the selector. `companionPortrait` (portrait.js:341/370) appends `pf__shimmer` when its `shimmer` option is true but never toggles `is-shimmering` on the `.pf` root, and no scene does either.

**Skeptic, told to refute it:** Fixed-string grep for is-shimmering across the repo returns one line, the selector. I read portrait.js:341/370: `companionPortrait` takes a `shimmer` option and appends the `pf__shimmer` LAYER when it is true, but never toggles `is-shimmering` on the `.pf` root; the two call sites that pass shimmer (select.js:1379 true, clubhouse.js:300 false, gameover.js:268 conditional) only control whether that layer exists. No classList.add of any `is-shim*` string exists. Only `.pf:hover .pf__shimmer` (portrait.css:87) can fire.

### 12. CSS class `.mm-logo--md` is never produced: `logoLockup()` builds `mm-logo--${size}` and the only caller passes 'sm'.

**Where:** `game/src/ui/portrait.css:189`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n --fixed-strings "mm-logo--md" . --glob '!node_modules'` returns only the rule. `rg -n "logoLockup" game/src/scenes/*.js` gives one real call, select.js:645 `logoLockup({ size: 'sm', … })`; title.js's only mention is a past-tense header comment about art that was removed. (The 'hero' default at portrait.js:479 has no rule at all in portrait.css, which only defines --md and --sm.)

**Skeptic, told to refute it:** Fixed-string grep for mm-logo--md returns only the rule. logoLockup repo-wide (excluding .git and node_modules) has exactly one live call: select.js:645 `logoLockup({ size: 'sm', plaque: 'Menagerie Companions' })`. I read scenes/title.js:1-20 — its mention is a past-tense header paragraph about SVG art that was deleted ("All of it ... is gone"), not a call. portrait.js:481 builds `mm-logo mm-logo--${size}` with default 'hero', which portrait.css does not define either; only --md and --sm exist (portrait.css:189-190), and --md is never produced.

### 13. CSS class `.mm-card__badge--innate` can never render in the game: the `innate` card flag is fully wired end-to-end (piles -> engine opening-hand reorder -> badge row -> keyword rule sentence) but no shipped card sets it — only a test fixture does.

**Where:** `game/src/ui/card.css:329 (produced at game/src/ui/card.js:355)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n "innate:\s*true" . --glob '!node_modules'` returns exactly one line — tests/combat/suite.js:492 (`{ ...CURL_UP, id: 'x/innate', innate: true }`). `rg -n "'innate'" game/src/` shows no card listing it in a `keywords:` array either; the only hits are combat/piles.js:64, ui/card.js:355 and the two K() keyword definitions. Consumers that therefore never fire: combat/engine.js:2501-2502 (moves innate cards to the front of the draw pile), card.js:355 and :396, and the Innate keyword rule at data/keywords.js:57. Tested is not the same as reachable.

**Skeptic, told to refute it:** `innate` across game/src/data returns only schema.js:52 (the JSDoc property), keywords.js:57 and companions/keywords.js:76 (the two keyword definitions), and two prose lines in pudding.js about an unrelated "innate Loyalty rule" — no card sets the flag and no card lists 'innate' in a `keywords:` array. Repo-wide, `innate: true` occurs once, at tests/combat/suite.js:492 (`{ ...CURL_UP, id: 'x/innate', innate: true }`). I confirmed the consumers exist and are real (combat/piles.js:64 and :103 copy the flag, engine.js:2501-2502 hoists innate cards into the opening hand, card.js:355 emits the badge, card.js:396 the chip), which is exactly the shape of the bug class: fully wired, exercised only by a fixture.

### 14. `Tooltip.setEnabled()` has no caller, so `this.enabled` is set true at construction and never changes — the four `if (!this.enabled) return` guards can never take their early-return branch.

**Where:** `game/src/ui/tooltip.js:474`  
**Kind:** unreachable · **finder confidence:** medium · **area:** ui

> `rg -n -w "setEnabled" . --glob '!node_modules'` returns the declaration plus one docs/notes line listing `ctx.tooltip.setEnabled(false)` as a console API. `rg -n "this\.enabled" game/src/ui/tooltip.js` shows the only write is tooltip.js:156 (`= true`) and tooltip.js:474; reads at :241, :249, :259, :837. No settings key drives it. Counted medium because a docs/notes page presents it as a manual console entry point, though nothing in the code says so.

**Skeptic, told to refute it:** Word-boundary grep for setEnabled returns tooltip.js:474 plus one docs/notes line. `this.enabled` in tooltip.js: written only at :156 (`= true` in the constructor) and inside setEnabled itself; read at :241, :249, :259, :837. No settings key drives it (the settings sweep above found no such spec entry). The one mitigating fact I found, and the reason to treat this as the weakest item in the batch: docs/notes/2026-08-20-ui-chrome.md:38-50 lists `ctx.tooltip.setEnabled(false) / ctx.tooltip.destroy()` under a "Programmatic API" heading — but that is an API listing, not a documented seam, tooltip.js's own header does not mention it, and its list-mate `destroy()` genuinely is called by scenes. So it is not covered by the deliberate-seam exclusion.

### 15. card.js's KEYWORD_ALIAS comment states that the enemy status Tricks in `data/enemies/_lib.js` "still author `[Exhaust]`" and reports specific lines to fix — the content was already changed to `[Vanish]`, so the alias's only entry can never fire and the reported bug no longer exists.

**Where:** `game/src/ui/card.js:36-46 (map at card.js:46)`  
**Kind:** false-claim · **finder confidence:** medium · **area:** ui

> `rg -n "\[Exhaust\]" . --glob '!node_modules'` returns no hits under game/src/data/ — only docs/notes entries and card.js:38 itself. The two cards named are now data/enemies/_lib.js:314 (`'Does nothing. [Vanish].'`) and :322 (`'Gain {b} Guard. [Vanish].'`). The comment even predicts this state ("the day it does, this entry is a harmless no-op") but still asserts it in the present tense.

**Skeptic, told to refute it:** I read the current content: data/enemies/_lib.js:314 is `text: 'Does nothing. [Vanish].'` (Clutter) and :322 is `text: 'Gain {b} Guard. [Vanish].'` (Drowsy) — both already say Vanish. `[Exhaust]` across game/src and tests returns exactly one hit: card.js:38, the comment asserting it. So `KEYWORD_ALIAS = { exhaust: 'vanish' }` (card.js:46) can never fire — I checked both keywordLabel call sites (card.js:281 and :381) and they only ever see authored bracket text. The comment additionally cites `_lib.js:234,242`, which are not the lines those cards live on any more.

### 16. DeckView documents a `pickLabel` option in its constructor JSDoc that the implementation never reads.

**Where:** `game/src/ui/deckview.js:60`  
**Kind:** unreachable · **finder confidence:** medium · **area:** ui

> `rg -n "pickLabel" game/src/` returns exactly one line, the JSDoc at deckview.js:60. The reward footer button uses `o.skipLabel || 'Skip'` (deckview.js:395) and the non-reward button is hardcoded 'Close' (deckview.js:401); nothing consults pickLabel. (Moot in practice since reward mode itself is unreachable.)

**Skeptic, told to refute it:** `pickLabel` across game/src returns exactly one line, the JSDoc at deckview.js:60. I read the constructor (deckview.js:33-75) and the footer build: the option is never destructured, never read off `this.o`, and the two button labels are `o.skipLabel || 'Skip'` (deckview.js:395) and a hardcoded 'Close' (deckview.js:401). Documented option, no implementation.

### 17. tokens.css's header lists `[data-anim-scale]` as one of the three accessibility switch attributes driven by Save.settings — no such attribute is ever written or selected on; settings.js sets the `--anim-scale` custom property instead.

**Where:** `game/src/ui/tokens.css:9`  
**Kind:** false-claim · **finder confidence:** low · **area:** ui

> `rg -n "data-anim-scale" . --glob '!node_modules'` returns exactly one line, the header text itself. settings.js:107 does `root.style.setProperty('--anim-scale', …)`, and tokens.css:132-137 consume the custom property. The sibling claims in the same sentence are true: `data-large-text` (settings.js:104, used at tokens.css / hud.css:195 / deckview.css:130) and `data-reduce-motion` (settings.js:103, used at tokens.css:265-276).

**Skeptic, told to refute it:** `data-anim-scale` across the repo returns exactly one line — the tokens.css:9 header text itself. There is no attribute write and no selector. applySettings writes the custom property instead (settings.js: `root.style.setProperty('--anim-scale', ...)`, which I read in context at settings.js:95-115), and tokens.css consumes `--anim-scale`. The two sibling claims in the same sentence are genuine (`data-large-text` and `data-reduce-motion` are both written by applySettings and selected on), which is what makes the third one a false claim rather than a stale file.

### 18. Nine bus event names emitted by scenes/ have no subscriber anywhere in the repo — game/src, tools/ or tests/ — so every `<scene>:ready` announcement and `map:shown` goes nowhere.

**Where:** `game/src/scenes/title.js:332, select.js:632, clubhouse.js:111, map.js:326, reward.js:482, event.js:109, rest.js:134, shop.js:116, gameover.js:157`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> `rg -oN "bus\.emit\('([^']+)'" game/src/scenes/` gives 12 names. The complete subscription set (built from a comment-stripped corpus of game/src/**.js, matching `.on('…')` so audio.js's `const on = (ev,fn)=>bus.on(ev,…)` alias is included, plus ui/hud.js:149 EVENTS array) is: card:*, combat:end, damage, death, discard, draw, enemyTurn:end, input, intent, map:choose, map:vote, map:voted, phase, run:continue, run:courage, run:ready, run:start, scene:entered, scene:leaving, settings:changed, snack:used, status, timer:fire, turn:*. Of the twelve emitted, only run:start, run:continue and map:choose (audio/audio.js:327) appear. `rg -F 'gameover:ready' .` (excluding .git) returns the emit line and nothing else; same for the other eight. No `bus.on('*')` subscriber exists (`rg "on\('\*'"` hits only engine emitters in combat/preview.js and scenes/combat.js:1604), and `.once(` is used nowhere. tools/shot.py waits on fixed timeouts and window.MM.ctx.stage, never on an event; tools/entryprof.py uses scene:leaving/scene:entered. select.js:625's comment ("a reviewer screenshotting the moment the scene says it is ready") describes a consumer that does not exist. tests/bus-names/check.py only gates the opposite direction ("a literal bus.on('x') whose name nothing emits"), so this stays green.

**Skeptic, told to refute it:** COULD NOT REFUTE. I searched the whole repo (`grep -rn` over everything, .git excluded) for each of the nine literal names — title:ready, select:ready, clubhouse:ready, map:shown, reward:ready, event:ready, rest:ready, shop:ready, gameover:ready. Every one returns its single emit line plus, for select:ready, two docs/notes prose mentions and its own comment at select.js:625. No `.on(...)` anywhere. I checked the escape hatches the brief names: core/bus.js does support a wildcard (`const w = this.#m.get('*')`, bus.js:19), but the only `on('*')` subscribers in game/src are engine-side, not bus-side — combat/preview.js:106 `sim.on('*')` and scenes/combat.js:1604 `this.engine.on('*')`, both on the combat engine's own emitter (engine.js:439), never on `bus`. `bus.once` exists (bus.js:9) and is called nowhere. The only variable-name subscription in game/src is ui/hud.js:195-197 looping `EVENTS` = ['run:start','run:enterNode','run:combatEnd','run:reward','run:heal','run:deck','settings:changed','scene:entered'] (hud.js:149-152) — none of the nine. Outside game/src: tools/entryprof.py:113-116 subscribes through `window.MM.bus` but only to scene:leaving / scene:entered; tools/shot.py contains no 'ready' or 'bus' reference at all; tests/playthrough5/q/trans.js:2 is the literal no-op `window.MM.bus.on&&0;` and then monkey-patches `scenes.go` instead. Partial mitigation worth passing on, not enough to refute: `bus` IS exposed on the documented debug surface (`window.MM = { ctx, bus, ... }`, main.js:78, comment at :72 "Debug surface (used by automated critics + the dev overlay)"), and entryprof.py proves an out-of-repo harness can subscribe that way — so these are plausibly an intended external seam. But no such consumer exists in the repo, and select.js:625's comment describes the reviewer as hypothetical rather than naming a harness.

### 19. scenes/atmostest.js declares AtmosTestScene and is imported by nothing and registered nowhere, so `#scene=atmostest` throws `Unknown scene`.

**Where:** `game/src/scenes/atmostest.js:15`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> `rg -n "atmostest" .` (excluding .git) returns only the file itself, its own header ("NEEDS REGISTERING in src/main.js") and docs/notes/2026-08-19-atmosphere.md:24,154-155 which lists registering it as an outstanding action. main.js:19-29 imports 11 scene modules; atmostest is not one of them. A comment-stripped reference count over game/src/**.js gives AtmosTestScene exactly one occurrence — its own declaration — the only such top-level declaration in scenes/. Noted as self-documented: the header says it needs registering rather than claiming it is a harness seam.

**Skeptic, told to refute it:** COULD NOT REFUTE. `grep -rn "atmostest|AtmosTestScene" .` (.git excluded) returns only the file itself (its header at :4-6 and the class at :15) and docs/notes/2026-08-19-atmosphere.md:24,154-155, which list registering it as an OUTSTANDING action. main.js registers exactly 11 scenes (lines 52-62: title, clubhouse, select, lobby, map, combat, reward, event, shop, rest, gameover) and atmostest is not among them; core/scenes.js has no dynamic-import fallback — `register()` at :35 is the only way in and `go()` at :40 throws `Unknown scene: ${name}` when the registry misses. Worth flagging to whoever triages: this is self-documented as a TODO ("NEEDS REGISTERING in src/main.js") rather than mislabelled as live, so it is closer to a known open action than to the believed-wired bug class.

### 20. `.sh-counter--rm` is never applied — the removal service is built as `.sh-service` inside `.sh-counter--moth`.

**Where:** `game/src/scenes/shop.css:215`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> shop.js:126-163 is the only place `sh-counter` markup is written; the classes used are `sh-counter sh-counter--cards` (:127), `sh-counter sh-counter--moth` (:131) and two bare `sh-counter` (:157, :161). The removal block at :150-153 is `<div class="sh-service">…<div class="sh-remove"></div>`. `rg -F 'sh-counter--rm' game/` returns only shop.css:215. Confirmed by a whole-file scan: every `.class` selector in each scenes/*.css was checked against a comment-stripped token corpus of game/**/*.js and game/index.html.

**Skeptic, told to refute it:** COULD NOT REFUTE. `grep -rn "sh-counter" .` (.git excluded) gives shop.css:29, 97, 215, 232, 243, 244 and shop.js:127, 131, 157, 161 — nothing else in the repo. shop.js:120-165 `_buildCounters()` is the only place `sh-counter` markup is authored, and it writes `sh-counter sh-counter--cards` (:127), `sh-counter sh-counter--moth` (:131) and two bare `sh-counter` (:157, :161). The removal service is nested inside the moth counter as `<div class="sh-service" aria-label="Removal service">` with `<div class="sh-remove">` (:150-153). No `classList.add('sh-counter--rm')` or equivalent exists anywhere.

### 21. `.rg-lid2`, `.rg-lid-plate` and `.rg-bun` are enemy-rig fill rules for classes no rig ever emits.

**Where:** `game/src/scenes/combat.css:311 and :313`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> `rg -n "rg-bun|rg-lid2|rg-lid-plate" .` (excluding .git) returns exactly these two CSS lines and nothing else in the repo. ui/enemy.js is the only rig emitter; it emits `.rg-lid` (:953, and :879 collects them for blinking) and `.rg-chestlid`, and its comment at :415-416 explains the chest lid was moved out of the eyelid class. `.rg-chestlid` (same rule as rg-lid2/rg-lid-plate) and `.rg-mane` / `.rg-hair` (same rule as rg-bun) are live, so only the listed fragments are dead.

**Skeptic, told to refute it:** COULD NOT REFUTE. `grep -rn "rg-bun|rg-lid2|rg-lid-plate" .` (.git excluded) returns exactly combat.css:311 and :313 and nothing else in the repo — no JS, no HTML, no docs. The sibling classes in the same two rules are live: ui/enemy.js:418 emits `class="rg-chestlid"`, :430-431 emit `rg-mane`, :633 emits `rg-hair`, and `.rg-lid` (a different rule, combat.css:369) is emitted at enemy.js:953 and collected for blinking at :879. enemy.js is the only rig emitter, and its comment at :415-417 records deliberately moving the chest lid off the eyelid class. So the three named fragments are dead selector text inside otherwise-live rules — real but low severity.

### 22. The selector half `.cb-enemy[data-role="minion"]` can never match: no enemy or boss definition authors `role: 'minion'`, and the engine never sets `role` at all.

**Where:** `game/src/scenes/combat.css:230`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> ui/enemy.js:767 `this.role = def.role || snap.role || (this.tier === 'boss' ? 'boss' : 'normal')`, then :768 `el.dataset.role = this.role`. `rg -oN "role: '[a-zA-Z]+'" game/src/data/enemies/ game/src/data/bosses/ | sort -u` yields exactly: bigScare, boss, bossPart, interaction, introductory, pressure. `rg -n "role" game/src/combat/engine.js` returns nothing, so `summon()` (engine.js:1708-1725) does not stamp a role either and `snap.role` is undefined. `rg -n "minion" .` finds the word only in docs and two comments. The `[data-role="bossPart"]` half of the same rule is live.

**Skeptic, told to refute it:** COULD NOT REFUTE. `grep -rn "role" game/src/combat/engine.js` returns NO matches at all, so `summon()` cannot stamp a role and `snap.role` is always undefined. ui/enemy.js:767-768 is the only writer: `this.role = def.role || snap.role || (this.tier === 'boss' ? 'boss' : 'normal'); el.dataset.role = this.role;`. Every authored role in game/src/data (`grep -rno "role: '[a-zA-Z]*'" game/src/data/`) is one of bigScare (9), boss (3), bossPart (3), interaction (6), introductory (6), pressure (6) — no 'minion'. Repo-wide, the word "minion" appears only in docs (design/02, STS2-REFERENCE:137,139), a combat.css comment at :221, an engine.js:1706 comment, and tests/combat/suite.js:698 where it is an enemy ID (`id: 'test/minion'`), not a role. The `[data-role="bossPart"]` half of the same rule is live, so this is a dead selector half rather than a dead rule.

### 23. `moodForRoom` is documented as "Exported so a test can assert the whole 340-room table without booting a scene" — no test imports it.

**Where:** `game/src/scenes/combat.js:149-151`  
**Kind:** false-claim · **finder confidence:** medium · **area:** scenes

> `rg -n "moodForRoom" .` (excluding .git) returns combat.js:151 (declaration), combat.js:297 (its only call site, inside the scene it claims to let a test avoid booting), and two docs/notes prose mentions. Nothing under tests/ references it; tests/combat-scene/ contains only seam.py. The export itself is not dead — the stated reason for it is.

**Skeptic, told to refute it:** COULD NOT REFUTE the narrow version of this. `grep -rn "moodForRoom" .` (.git excluded) returns combat.js:151 (the declaration), combat.js:297 (`this.mood = moodForRoom(this.roomName, this.region, this.arena)` — its only call site, inside the very scene the doc says a test can avoid booting), and two prose mentions in docs/notes (2026-08-20-combat-scene-round-2.md:152 and 2026-08-20-loose-ends.md:18). Nothing under tests/ imports it — I found no test file importing scenes/combat.js at all. So the docstring's stated reason ("Exported so a test can assert the whole 340-room table without booting a scene") describes a test that was never written. Note the export itself is NOT dead — it is called at :297 — so this is a stale rationale comment, the weakest class of finding here, and it is one `import { moodForRoom }` away from becoming true.

### 24. Two exports in the companion helper library name consumers that do not exist: `CAP` is "clamps used by the balance validator" and `HOOK_NAMES` is "for the audit page" — neither has a single reference anywhere in the repo, tests and tools included.

**Where:** `game/src/data/companions/_util.js:507 (CAP) and :112 (HOOK_NAMES)`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "\bCAP\b" . -g '!node_modules' -g '!*.json' -g '!docs/**'` returns exactly one line: _util.js:507. Same for HOOK_NAMES: _util.js:112 and nothing else. The `rshuffle` helper at :123 is likewise unreferenced, though it makes no claim.

**Skeptic, told to refute it:** Could not refute. `rg -n "\bCAP\b|HOOK_NAMES|rshuffle" . -g '!node_modules' -g '!*.json' -g '!docs/**'` returns exactly three lines, all in _util.js: :112 HOOK_NAMES, :123 rshuffle, :507 CAP. Nothing else in the repo, tests and tools included. I checked the one wildcard consumer path too — companions import `* as U from './_util.js'`, so a `U.CAP` or `U.HOOK_NAMES` reference would have matched the same grep, and none did. The named consumers ('the balance validator', 'the audit page') do not exist. Finding stands.

---

## Leads, evidence but no second opinion (87)


Each carries the searches its finder ran. None has been independently checked —
see the caveat above. Verify before acting.

### 1. FIXED 2026-08-30. The `autoEndTurn` settings toggle is a live control in the panel that does nothing — no code anywhere reads it — while settings.js's own header claims every control "actually takes effect" and names autoEndTurn among the flags "read from `Save.settings` at the point of use".

**Where:** `game/src/ui/settings.js:65 (claim at game/src/ui/settings.js:19)`  
**Kind:** false-claim · **finder confidence:** high · **area:** ui

> `rg -n -w "autoEndTurn" . --glob '!node_modules'` (untruncated) returns exactly 4 lines: settings.js:19 (the claim), settings.js:65 (SETTINGS_SPEC entry), settings.js:82 (DEFAULTS), core/save.js:31 (persisted default). No reader in combat/, scenes/, state/, or tests/. combat.js never auto-ends a turn.

### 2. FIXED 2026-08-30. The `confirmSingleTarget` settings toggle likewise has zero consumers — nothing ever asks before playing a targeted Trick at one enemy — yet the same header sentence claims it is read at the point of use.

**Where:** `game/src/ui/settings.js:67 (claim at game/src/ui/settings.js:19)`  
**Kind:** false-claim · **finder confidence:** high · **area:** ui

> `rg -n -w "confirmSingleTarget" . --glob '!node_modules'` returns 4 lines: settings.js:19/67/83 and core/save.js:31. Nothing in combat/ or scenes/ reads it. Contrast with the neighbouring keys, which all resolve: screenShake -> core/renderer.js:445 + combat.js:371, flashes -> renderer.js:453, showDamageNumbers -> fx/combatfx.js:53, colorblind/largeText/reduceMotion -> tokens.css attribute selectors.

### 3. `CardView.registerKeywords()` is a public static with no caller anywhere, so `KEYWORD_LABEL` is permanently `{}` and every `[Bracketed]` keyword in card rules text falls through to its raw authored spelling; the comment at card.js:32 says it is "filled by keywords.js consumers via CardView.registerKeywords()", which never happens.

**Where:** `game/src/ui/card.js:701 (declaration), game/src/ui/card.js:32 (false comment)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n "registerKeywords|KEYWORD_LABEL" . --glob '!node_modules'` — the only `CardView.registerKeywords` hits are card.js:701 (definition) and two docs/notes entries that ASK combat-engine to call it ("combat-engine: please call this from data/keywords.js at boot"). data/keywords.js exports its own unrelated `registerKeywords()` which is called at keywords.js:162/180/198/202 — a different function on a different registry. `KEYWORD_LABEL` is read only at card.js:52.

### 4. DeckView's entire `reward` mode is dead: the MODES.reward entry, the `sort:'none'` default, the extra "As offered" sort option, the `onPick` activation branch, and openPile's skip-button path all gate on `mode === 'reward'`, and nothing ever passes that mode. The header's claim that this one component serves "card-reward inspection" is false.

**Where:** `game/src/ui/deckview.js:37 (MODES.reward), :70, :124-127, :357, :392-397`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n "openPile\(" game/src/` gives exactly three call sites: hud.js:483 (`mode:'deck'`), combat.js:2607 (`mode:'deck'`), combat.js:3310 (`mode: which === 'torn' ? 'deck' : which`, where `which` is only 'draw'|'discard'|'torn' per combat.js:2991-2993/3054-3056). `new DeckView` appears only inside openPile (deckview.js:386). scenes/reward.js uses CardView directly, never openPile. The CSS at deckview.css:122-127 (`.mm-deck[data-mode="reward"]`) is unreachable for the same reason.

### 5. `warmArtSync()` is documented as the blocking warm "for tests and for a loading screen that can afford it" and is what the deprecated `preloadArt()` stub tells callers to use instead — but it has no caller in game/src/, in tests/, or anywhere in the repo.

**Where:** `game/src/ui/cardart.js:445 (claims at cardart.js:303 and cardart.js:444)`  
**Kind:** unreachable · **finder confidence:** high · **area:** ui

> `rg -n -w "warmArtSync" . --glob '!node_modules'` returns three lines, all inside cardart.js: :303 (preloadArt's doc pointing at it), :445 (declaration), :1658 (the default-export object, which nothing imports). tests/cards-feel/index.html:105 imports `warmArt, clearArtCache, artCacheSize, subjectFor` — not warmArtSync.

### 6. The HUD's documented `compact` option ("denser padding, hides the seed") is passed by no scene, so the `[data-compact="1"]` rules in hud.css are unreachable.

**Where:** `game/src/ui/hud.js:38 / :239, rules at game/src/ui/hud.css:190-192`  
**Kind:** unreachable · **finder confidence:** medium · **area:** ui

> `rg -n "new HUD\(" -A6 game/src/` gives all three construction sites: combat.js:832 (mount/variant/useSnacks/escape), map.js:470 (mount/escape/useSnacks), reward.js:163-165 (mount/run/fixed/escape/useSnacks). None passes `compact`, so hud.js:239 (`if (this.o.compact) root.dataset.compact = '1'`) never runs and hud.css:190-192 never match.

### 7. FIXED 2026-08-30, and it was worse than this says. gameover.js fabricates 3–6 Keepsakes for a REAL run that ended carrying none, contradicting its own header ("Reads ctx.run when meta-run has built one; otherwise fabricates…", "Nothing here is a placeholder") — and 5 of the 7 fabricated ids do not exist in data/relics.js.

**Where:** `game/src/scenes/gameover.js:219 (summary), :631-637 (_buildKeeps), constant at :41-50, header claim at :15-18`  
**Kind:** false-claim · **finder confidence:** high · **area:** scenes

> `relics: Array.isArray(run?.relics) && run.relics.length ? run.relics : null` (gameover.js:219) — Run.relics is `get relics() { return this.keepsakes; }` (state/run.js:286), so a real run holding zero Keepsakes yields null. gameover.js:632 `if (!list)` then samples FALLBACK_KEEPSAKES regardless of the `mocked` flag that _summarise already computes and passes through (:180, :212). `rg -c '<id>' game/src/data/relics.js` returns 0 for half-a-torch, collar-tag, bent-house-key, mothbitten-ribbon, jar-of-nothing (only chewed-tennis-ball and spare-batteries exist). The constant's own doc comment says "used only when data/relics.js has not shipped yet" — relics.js shipped.

### 8. `export { STARTER_COMPANIONS }` in select.js is imported by nothing, and the comment justifying it names a consumer that does not import it.

**Where:** `game/src/scenes/select.js:49 (comment at :46-48)`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> The comment reads "it is re-exported here because clubhouse.js has always imported it from select." clubhouse.js:24 is `import { KID_CODEX, loadoutFor } from './select.js';` — no STARTER_COMPANIONS. `rg -n "STARTER_COMPANIONS" .` (excluding .git): declared in ui/portrait.js:170, used inside portrait.js, imported into select.js:32 only to be re-exported at :49, and tests/backpack/index.html:46 imports it from ui/portrait.js, not from select.js. `rg -n "from '[^']*scenes/select" .` shows only main.js (SelectScene), clubhouse.js (KID_CODEX, loadoutFor) and tests/backpack (loadoutFor).

### 9. The four `.cb-tip__*` rules in combat.css are never applied to anything; the block's own header comment claims they are "the blocks this scene puts inside" the tooltip.

**Where:** `game/src/scenes/combat.css:1492-1507 (.cb-tip__title :1495, .cb-tip__body :1500, .cb-tip__tell :1502, .cb-tip__note :1507)`  
**Kind:** unreachable · **finder confidence:** high · **area:** scenes

> `rg -n "cb-tip" .` (excluding .git) returns only these CSS rules plus three JS *comments* — ui/intent.js:31 and :517 and scenes/combat.js:939 — all three describing the round-1 bug where the literal string `<div class="cb-tip__title">Pack Wrong</div>` printed on screen because the tooltip escapes strings. The live path is `tooltip.attach(el, () => v.intentView.describe())` (combat.js:958-960) returning a descriptor object, and ui/tooltip.js renders it into `.mm-tip__inner` / `.mm-tip__kw` markup (tooltip.js:210, 680, 724, 748). No element in game/src is ever given a cb-tip class.

### 10. event.js lists `curious` among the authored moods "keyed in event.css off `.ev-page[data-mood]`" and uses it as the default, but event.css has no `[data-mood="curious"]` rule.

**Where:** `game/src/scenes/event.js:40-42 (header), :116 (default); event.css:45-55`  
**Kind:** false-claim · **finder confidence:** high · **area:** scenes

> event.js:116 is `page.dataset.mood = d.mood || 'curious';`. `rg -oN "mood: '[a-z]+'" game/src/data/events.js | sort -u` gives 11 values including `curious` (events.js:466). `grep -n 'data-mood' game/src/scenes/event.css` returns 10 rules — sad, warm, trade, greedy, unsettling, revelation, escape, listen, mischief, investigation — and no curious. A Curiosity with mood 'curious', and every event with no mood at all, silently falls through to the bare `.ev-page` default at event.css:45 (spectre-200, identical to `listen`).

### 11. Six scene modules carry `export default` alongside their named export; no file in the repo imports a scene module's default.

**Where:** `game/src/scenes/combat.js:3521, event.js:452, gameover.js:762, rest.js:488, reward.js:721, shop.js:423`  
**Kind:** unreachable · **finder confidence:** medium · **area:** scenes

> `rg -n "import\s+\w+\s+from\s+'[^']*scenes/" .` (excluding .git) returns nothing. main.js:19-29 uses named imports exclusively (`import { CombatScene } from './scenes/combat.js'` etc.), the intra-scenes imports are named (`import { RoomScene, esc, chip } from './reward.js'` in event.js:23, rest.js:27, shop.js:26), and tests/backpack/index.html:45 imports `{ loadoutFor }`. Low-value boilerplate rather than a behavioural gap, reported only because it is literally a declared export nothing imports.

### 12. `ANIMATED_EVENTS` — exported and documented as "Events the renderer must animate rather than just re-render state for", but nothing anywhere in the repo imports or reads it; the renderer never consults it, and 5 of the 23 events it names have no animator case.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/events.js:189`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "ANIMATED_EVENTS" --glob '!node_modules' .` returns exactly one line: its own declaration (events.js:189). No string form exists either (`rg -n "'ANIMATED_EVENTS'|\"ANIMATED_EVENTS\"" game/src/` → nothing). The only renderer is scenes/combat.js, which subscribes `engine.on('*')` at line 1604 and switches on `ev.type`; I listed all 33 `case '…':` labels in that switch — card:play, status:trigger, player:fall, player:revive and timer:fire are in ANIMATED_EVENTS but have no case there.

### 13. `status:trigger`, `player:fall` and `player:revive` are emitted by the engine and have ZERO subscribers anywhere in game/src — no `engine.on` for them, no case in the renderer's animator, and no bus handler.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/engine.js:1476`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> Emitters: engine.js:1476 `_emit(EV.STATUS_TRIGGER, …)`, engine.js:1771 `_emit(EV.PLAYER_FALL, …)`, engine.js:1794 `_emit(EV.PLAYER_REVIVE, …)`. Listeners: `rg -no "e\.on\('[^']+'|engine\.on\('[^']+'" game/src/` yields only *, card:add, card:play, card:resolved, combat:end, damage, death, discard, draw, enemyTurn:end, intent, phase, snack:used, status, timer:fire, turn:end, turn:start. scenes/combat.js's switch has no 'status:trigger' / 'player:fall' / 'player:revive' case. The bus mirror (`engine.js:441` emits `combat:<type>`) has no subscribers either — `rg -no "bus\.on\('[^']+'" game/src/` lists only card:*, map:*, run:*, scene:entered, settings:changed. So a seat falling or reviving in co-op publishes nothing anyone reads.

### 14. `EV.RELIC` — the constant is referenced nowhere (the one emitter hardcodes the raw string), and nothing in game/src subscribes to `relic:trigger`, so the Keepsake-bar flash its emitter promises never happens.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/events.js:181`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "EV\.RELIC" game/src/` → 0 hits (every other EV member has ≥1). `rg -n "relic:trigger" --glob '!node_modules' .` → events.js:115 (the payload doc), events.js:181 (the constant), data/relics.js:71 `h.e._emit?.('relic:trigger', {…})`, and one docs note. No `.on('relic:trigger')` and no `case 'relic:trigger'` in scenes/combat.js. The emitter's own comment at relics.js:68 reads "Announce the trigger so the Keepsake bar can flash." — ui/hud.js re-renders keepsake chips from `this.o.relics()` on sync and never listens for this event.

### 15. `CombatEngine.addMaxHp()` has no caller anywhere in the repo, and it is the ONLY emitter of `EV.HP_MAX`, so the `hp:max` event documented in events.js can never be emitted.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/engine.js:1357`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "addMaxHp" --glob '!node_modules' .` returns exactly one line — the definition at engine.js:1357. Not called by tests, tools, or docs; no string form (`rg -n "'addMaxHp'" game/src/` → nothing); no ctx alias (the only `maxHp` writes in engine.js are the constructor at 342/404 and inside addMaxHp itself). `rg -n "hp:max|HP_MAX"` shows the sole emit at engine.js:1362, inside addMaxHp. The run layer sets seat maxHp directly at state/run.js:1200 and never routes through the engine.

### 16. `assertApi()` — exported as the boot-time guard CONTRACTS.md rule 8 prescribes ("fail at boot, not at the moment it matters") and called by nothing, anywhere, including tests.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/hooks.js:111`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "assertApi" --glob '!node_modules' .` → CONTRACTS.md:48 (the rule that recommends it), hooks.js:72 (a comment about it), hooks.js:111 (the definition). Zero call sites in game/src, tests/, or tools/. No string dispatch (`rg -n "'assertApi'" game/src/` → nothing).

### 17. `HOOK_PAYLOAD_API` is documented as "Kept next to the builder so the two cannot drift" — nothing compares it to `_payload()`, and nothing imports the constant at all, so the two can drift silently and only a Proxy throw at runtime would catch it.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/hooks.js:100`  
**Kind:** false-claim · **finder confidence:** high · **area:** combat

> `rg -n "HOOK_PAYLOAD_API" --glob '!node_modules' .` → only hooks.js:96 (the comment) and hooks.js:100 (the declaration). The builder it claims to be pinned to is `Hooks._payload()` at hooks.js:233; no code reads the array and diffs it against the object literal, and its only stated consumer (`assertApi`, hooks.js:111) is itself never called. The list happens to match today (I compared all 16 names against the keys _payload returns), which is exactly why the drift would be silent when it stops matching.

### 18. `isAttackIntent(type)` — exported from intents.js and referenced nowhere in the entire repo.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/intents.js:60`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "isAttackIntent" --glob '!node_modules' .` returns exactly one line, the declaration at intents.js:60. No string form (`rg -n "'isAttackIntent'" game/src/` → nothing). Callers that want this ask `intentFamily(type) === 'attack'` or compare against `FAMILY.ATTACK` directly (e.g. data/companions/wink.js:922).

### 19. Universal statuses `dread` and `confusion` are declared with full hooks but no card, enemy move, relic, snack or companion anywhere in game/src ever applies them, so neither hook can ever run.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/statuses.js:158`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -in "dread" game/src/` outside fx/atmosphere shows only combat/statuses.js (the def, and its own `applyStatus(h.owner,'dread',-1)` decay at line 167), plus engine.js/damage.js prose comments. `rg -in "dread|confus" game/src/data/` → one hit, `COMMON_DEBUFFS = [… 'confused']` in companions/_util.js:154, a different id. `rg -n "'confusion'" game/src/` → statuses.js only. I also collected every literal status id applied anywhere (`giveStatus(…, 'x')` / `applyStatus(…, 'x')` / `status: ['x'` / `{id:'x'}`) — neither 'dread' with a positive delta nor 'confusion' appears. The statuses.js header claims all fourteen "exist in every fight regardless of Companion".

### 20. Universal status `entangle` is never applied by anything, which makes the Attack-veto branch in `CombatEngine.canPlay` unreachable — it can never return "Entangled — you cannot play Attacks this turn."

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/statuses.js:185`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "entangle" game/src/` → combat/statuses.js:185-186 (the def), statuses.js:230 (STATUS_ORDER), ui/icons.js:98 (the glyph), and engine.js:2724 `if (card.type === CardType.ATTACK && who.hasStatus('entangle'))`. No application site: nothing calls applyStatus/giveStatus/debuff with 'entangle', and it appears in no enemy move's `applies:` array. The def's own comment says "Enforced in engine.canPlay" — the enforcement exists, the status never arrives.

### 21. Universal statuses `regen` and `dexterity` are never applied by any content, so `regen`'s heal hook and the `actor.status('dexterity')` term in gainBlock are both dead code paths.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/statuses.js:71`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "'regen'" game/src/` → statuses.js:72/78/79 (its own def and its own heal hook), statuses.js:229 (STATUS_ORDER), and data/enemies/sleeping-quarters.js:356 `SNUFFABLE: ['strength','focus','dexterity','regen','bristle','charm']` — a strip list, not a grant. `rg -n "'dexterity'" game/src/` → statuses.js:55/229, engine.js:1298 `v += actor.status('dexterity') || 0`, and the same SNUFFABLE list. No applyStatus/giveStatus/snack/relic/enemy-move grants either id. By contrast the live ones do show grants (e.g. 'strength' at data/relics.js:486, 'racket' at data/companions/pudding.js:909).

### 22. Universal status `focus` is dead twice over: nothing applies it, and its `modifyCounterGain` hook gates on `h.focusable`, which is never true because no counter in game/src is declared `focusable`.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/statuses.js:62`  
**Kind:** unreachable · **finder confidence:** high · **area:** combat

> `rg -n "'focus'" game/src/` → statuses.js:63/229 and data/enemies/sleeping-quarters.js:356 (SNUFFABLE strip list); no grant site. The hook reads `h.focusable`, supplied by engine.js:1562 `hooks.reduce('modifyCounterGain', d, { id, owner, focusable: c.focusable }, …)`. `rg -n "focusable" --glob '!node_modules' .` shows the only place `focusable: true` is ever set is tests/combat/suite.js:676; the ~20 real `defineCounter({…})` calls across data/companions/** never pass it. The passing test at suite.js:679 supplies the flag itself, so it proves the hook works on a counter shape the game never creates.

### 23. hooks.js documents `onBoardEvent` alongside the status/relic/power hook names, but board events are only ever delivered to EnemyDefs — a status, relic or power declaring `onBoardEvent` would never fire — and the documented payload `h.event, h.data` does not exist.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/hooks.js:46`  
**Kind:** false-claim · **finder confidence:** high · **area:** combat

> hooks.js opens "Statuses, relics, powers, summoned entities and board objects all expose the same hook names" and lists `onBoardEvent(h) a generic broadcast: h.event, h.data` at line 46. `rg -n "onBoardEvent" game/src/` → hooks.js:46 and engine.js:1045 only; engine.js:1038 `boardEvent(ev)` iterates enemies/allies and calls `en.def.onBoardEvent(ctx, ev)`. There is no `hooks.dispatch('onBoardEvent', …)` anywhere (I extracted every dispatched name: it is absent, unlike onAttack, onHeal, onShuffle, etc.). The real payload is `{type, actor, source, amount}` (documented correctly at engine.js:1025-1027), not `{event, data}`. engine.js:1057 gets it right, calling onBoardEvent an EnemyDef lifecycle hook.

### 24. HANDOFF.md and HANDOFF-PROMPT.md still list `card:retain` as a known-silent cue "(no retain event is emitted)" and claim tests/audio/cues.py carries it — the event is emitted, the cue plays, and cues.py no longer lists it.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/HANDOFF.md:313`  
**Kind:** false-claim · **finder confidence:** high · **area:** combat

> engine.js:3084 emits `EV.CARD_RETAIN` in the end-of-turn hand pass; scenes/combat.js:1743-1745 has `case 'card:retain':` and calls `this.ctx.audio?.play?.('card:retain')`; the bank entry is audio/sfx.js:171. tests/audio/cues.py's `UNREACHABLE` dict (lines 52-58) now contains only `combat:crit` — card:retain has been removed. HANDOFF-PROMPT.md contradicts itself: line 79 credits the suite with "+5, the card:retain event" while line 227 still calls it silent.

### 25. The `phase` event's documented value set is wrong in both directions: `'over'` is never emitted, and `'playerReady'` — which is emitted every turn — is missing. The engine's own inline comment on `this.phase` also omits `'enemyPhaseEnd'`, a value it assigns.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/events.js:23`  
**Kind:** false-claim · **finder confidence:** high · **area:** combat

> events.js:23 documents `phase { phase:'player'|'enemy'|'enemyPhaseEnd'|'over', turn }`. All four emit sites: engine.js:2575 'player', engine.js:2610 'playerReady', engine.js:3124 'enemy', engine.js:3190 'enemyPhaseEnd'. `rg -n "phase: 'over'" game/src/` → nothing; engine.js:1784 sets the field `this.phase = 'over'` but emits no PHASE event for it. engine.js:211's comment reads `// 'setup' | 'player' | 'enemy' | 'over'` yet line 3188 assigns `this.phase = 'enemyPhaseEnd'`. A renderer branching on `ev.phase === 'over'` would never run.

### 26. `EVENT_TYPES` — exported as "Handy for test harnesses and debug UI"; no harness, debug UI, or anything else in the repo references it.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/events.js:186`  
**Kind:** unreachable · **finder confidence:** medium · **area:** combat

> `rg -n "EVENT_TYPES" --glob '!node_modules' .` returns exactly one line, its own declaration at events.js:186. Nothing under tests/ or tools/ imports it either — the combat suite lists module filenames by hand (tests/combat/suite.js:139) rather than reading this. Reported at medium because the comment names an intended audience, though it stops short of the "kept as the by-name entry point for harnesses" phrasing this codebase uses for real seams.

### 27. `CombatEngine.playerOf(actor)` is named in two engine error messages as the API content should call, but nothing in the repo calls it.

**Where:** `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/game/src/combat/engine.js:603`  
**Kind:** unreachable · **finder confidence:** medium · **area:** combat

> `rg -n "playerOf" --glob '!node_modules' .` → engine.js:491 (a doc comment), engine.js:497 (the throw text "Say which one: engine.playerOf(actor), ctx.self, or pass a seat."), and engine.js:603 (the definition). No call site in game/src, tests/, or tools/. Medium rather than high because it is a plausible deliberate escape hatch for content authors, but nothing in the file says so.

### 28. FIXED 2026-08-30 — nine, not eight. Eight unplayable Status/Curse cards in data/neutral.js each carry an `effect` describing end-of-turn, on-draw or on-play behaviour, but a card's `effect` is invoked at exactly one place in the engine and that place is gated behind `canPlay`, which refuses every `unplayable` card — so none of the printed rules text has ever done anything.

**Where:** `game/src/data/neutral.js:29 (status/candle-burn), :42 (status/gloom), :49 (status/wrong-side), :60 (curse/regret), :67 (curse/bad-luck), :74 (curse/clingy-shadow), :87 (curse/heavy-heart), :94 (curse/night-terror), :101 (curse/lost-mitten)`  
**Kind:** cannot-fail · **finder confidence:** high · **area:** data

> `rg -n "def\.effect|\.effect\(" game/src/combat/*.js game/src/state/*.js game/src/scenes/*.js` returns ONLY engine.js:2819/2824, inside `_playCard`. `_playCard` (engine.js:2766) begins `const check = this.canPlay(...); if (!check.ok) { emit CARD_INVALID; return; }` and canPlay (engine.js:2715) has `if (card.unplayable) return { ok:false, reason:'This Trick cannot be played.' }`. All nine cards declare `cost:-2, unplayable:true`. I read `_closeSeatHand` (engine.js:3056-3095) and `_endTurn` (3095-3200) in full: end-of-turn hand processing only exhausts Ethereal, emits CARD_RETAIN, or discards — it never calls a card def. There is no onDraw path either: `drawOne` (piles.js:247) dispatches `onCardDrawn` to hooks only, and `hooks.js _actorProviders`/`_relicProviders`/`_objectProviders`/`_extraProviders` (lines 158-190) collect from statuses, powers, relics, objects and ad-hoc hooks — cards in hand contribute no hooks. For curse/lost-mitten ("you cannot play more than 3 Tricks each turn") I read canPlay end-to-end (2708-2752): no per-turn play-count check exists at all. Six of these are granted by real Curiosity outcomes (events.js:104, 350, 585, 800, 836, 904).

### 29. The `button-spring` (Spring Button) enemy status tells the player "Its next attack occurs twice at 60% damage each, then the Button falls off", but it declares no `hooks`, nothing reads it, and the helper its own comment names as the implementation — `splitAttack()` — has zero callers in the entire repo.

**Where:** `game/src/data/enemies/_lib.js:385 (status def) and :509 (splitAttack)`  
**Kind:** cannot-fail · **finder confidence:** high · **area:** data

> `rg -n "button-spring|'spring'" . -g '!node_modules' -g '!*.json' -g '!docs/**'` returns only: ui/icons.js:197 (a glyph path), _lib.js:385 (the def), nursery.js:43 (the BUTTONS id list) and nursery.js:66 (`chooseButton` RETURNING the id so Button Baby can apply it). Nothing ever asks `c.has('button-spring', …)`. `rg -n "splitAttack" . -g '!node_modules' -g '!*.json' -g '!docs/**'` returns only _lib.js:509 (the declaration) and _lib.js:388 (the comment "Split is applied by the attacking enemy's own move resolution (see splitAttack())"). Its two siblings do work — `button-brass` has `modifyDamageDealt`, `button-pillow` has `onTurnStart` — and the Patchwork Giant's separate Spring *Patch* is implemented inline in its own damageFn/hitsFn (nursery.js:929-936), not through splitAttack. So Button Baby's most dangerous Button, the one nursery.js:40 calls out ("A weak Rocking Horse with a Spring Button is suddenly the most dangerous thing in the room"), neither splits the attack nor falls off.

### 30. Eight of the twelve declarative `run` flags on Backpack Gear are aggregated by `backpackRunFlags` and then read by nothing — the whole `run.flags.gear` sub-object has no reader — leaving six of the eighteen items with no effect in any channel: no hook, no live run flag, and no Curiosity gate that names their id or tags.

**Where:** `game/src/data/backpack.js:418-422 (backpackRunFlags defaults); dead flags set at :72 revealCanine, :98 petTrail, :105 trackNames, :112 lightWings, :130 rerollEvent, :156/:172 mapPeek, :179 rememberEvents, :209 gearRecharge`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> Per-flag `rg -n "\b<flag>\b" . -g '!node_modules' -g '!*.json'`: revealCanine, petTrail, trackNames, lightWings, rerollEvent, gearRecharge and rememberEvents appear ONLY in backpack.js (declaration + defaults object); the sole extra hit is tests/backpack/index.html:319 asserting `run.flags.gear.revealCanine === true`, i.e. a green test over a flag nothing consumes. mapPeek adds exactly one more hit, state/run.js:324, which is the `flagsOf` merge itself — no consumer. `rg -n "flags\.gear"` across game/src returns nothing but backpack.js's own header comment at :36. Contrast the flags that DO work: revealUnknown (run.js:751), clueBonus (:731), restBonus (:1866), curiosityHeal (:2066). Cross-referencing the item table against every `requires:` gate in events.js (11 gates naming multitool, pet-treats, notebook, camera, dog-whistle, familiar-toy plus tags call/feed/photo/record/evidence/open/pet), the items with no hooks, a dead run flag and no gate are: chalk, compass (mapPeek), collar-tag (trackNames), walkie-talkie (rerollEvent), spare-batteries-gear (gearRecharge), and rope (nothing at all). Big Flashlight is half-inert: its `onTurnStart` Guard hook fires, but "Dark wings hold fewer surprises" (`lightWings`) does nothing even though wing conditions now exist in data/wings.js.

### 31. The Haunt ladder table printed to the player names five effects; at least three of them describe systems that never read the haunt level at all — Curiosities, encounter selection and boss abilities are all haunt-independent.

**Where:** `game/src/data/haunts.js:18-25`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> HAUNTS[2] promises "Curiosities turn dangerous": `rg -n "hauntLevel" game/src/scenes/event.js game/src/data/events.js` returns nothing, and run.js's Curiosity path (`_prepareEvent` → `rollEvent(rng, this.region, {depth, seen})` at run.js:2061, then `applyEffects` at 2144-2190) never touches hauntLevel. HAUNTS[3] promises "Bosses gain an additional ability": all three boss `hauntScaling(level)` functions branch only at level>=1 (a Courage note), level>=8 (butler) and level>=10 — governess.js:709-716, butler.js, bedframe-beast.js; grep of `l >= N` across data/bosses shows no level-3 branch. What actually happens at haunt>=3 is +1 Big Scare in mapgen.js:651 and per-enemy flags on ordinary enemies. HAUNTS[4] promises "Far more dangerous room combinations": `rollEncounter(region, tier, rng, history)` (encounters.js:516) takes no haunt argument and REGION_RULES contains no haunt branch — only `buildEncounter(id, rng, hauntLevel)` scales the enemies already chosen. Both scenes/clubhouse.js:477-490 and scenes/select.js:927-941 render these sentences verbatim to the player.

### 32. The `advancedOnly` encounter field is declared in the EncounterDef typedef with a rule sentence ("excluded from any 'appears earlier' relaxation"), authored onto four formations, and read by nothing — the relaxation it opts out of is the `soften()` fallback in rollEncounter, which never consults it.

**Where:** `game/src/data/encounters.js:32 (typedef), set at :153, :277, :289, :402`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "advancedOnly" . -g '!node_modules'` returns exactly five lines: the typedef and the four authored uses. Zero readers, in game/src or tests. I read rollEncounter in full (encounters.js:516-585): every filter is spelled out — minScuffle, bannedFirstScuffle, neverAlone, aloneOnlyEarly, requiresSeen, no-immediate-repeat, fadesLate, maxConsecutiveLead — and `advancedOnly` appears in none of them. This is the same shape as the mapgen wing conditions in CONTRACTS 54: a named rule, authored onto content, implemented nowhere.

### 33. The `noDuplicates` key in REGION_RULES is declared on two regions with player-facing rule comments ("Two of these may never share a formation at baseline difficulty" / "No formation may field two of these") and is read by nothing.

**Where:** `game/src/data/encounters.js:440 and :451`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "noDuplicates" . -g '!node_modules'` returns exactly those two authored lines and nothing else — no reader in game/src, none in tests/enemies/index.html either (that file reads REGION_RULES only for bannedFirstScuffle, at line 944). rollEncounter (encounters.js:516-585) reads rules.minScuffle, .bannedFirstScuffle, .neverAlone, .aloneOnlyEarly, .fadesLate and .maxConsecutiveLead; `noDuplicates` is never dereferenced.

### 34. A Curiosity outcome hands out `relic: 'collar-tag'`, but `collar-tag` is a Backpack ITEM id, not a Keepsake id — the effect silently falls through to a random common/uncommon/rare Keepsake instead of the tag the prose describes.

**Where:** `game/src/data/events.js:495`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> The outcome text at events.js:494 ends "In your palm, left behind: a tag" and the option advertises "A Keepsake, Clues and Courage". I extracted all 38 relic ids from relics.js (`^\s{4}id: '...'`) — there is no `collar-tag`; `collar-tag` is defined at backpack.js:104 as an item. In run.js applyEffects (2165-2172): `const direct = relicById('collar-tag')` → undefined, so it takes the else branch `rollKeepsake(r, {owned, rarity:'collar-tag'})`; rollKeepsake (relics.js:651-664) filters RELICS by that rarity → empty pool → falls back to `RELICS.filter(r => FINDABLE.includes(r.rarity) && !owned.has(r.id))`, i.e. any random findable Keepsake. A validator I ran over every `relic:`/`curse:`/`requires:` reference in events.js flagged this as the only bad reference.

### 35. The Keepsake `wall-scratchings` is fully implemented (an onAttackDealt hook, desc, flavour, sigil) but no code path can ever grant it: its rarity 'event' is requested nowhere, and unlike its two siblings it is never named by id.

**Where:** `game/src/data/relics.js:548`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "wall-scratchings" . -g '!node_modules'` returns exactly one line — its own declaration. The three 'event'-rarity Keepsakes are bowl-with-your-name (:534), photograph-of-a-cat (:542) and wall-scratchings (:548); the first two are granted by id from events.js. Every rollKeepsake call site was enumerated: run.js:1672/1716/1738/1752 use rollKeepsakeRarity → 'common'|'uncommon'|'rare' (relics.js:667-672), run.js:1673/1717 use rarity 'boss', shopStock (run.js:1965) iterates ['common','uncommon','shop'], and applyEffects (run.js:2169) passes fx.relic. Extracting every `relic: '...'` value in events.js gives only relic ids plus 'common'/'uncommon'/'rare'/'shop' — never 'event'. FINDABLE (relics.js:618) is ['common','uncommon','rare'], so the no-rarity path excludes it too.

### 36. `renderCardText` is documented as the tokeniser "for the card renderer" and `plainCardText` as the version "for the deck view, search and accessibility labels" — no file in game/src imports either; ui/card.js carries its own private regex tokeniser instead.

**Where:** `game/src/data/keywords.js:224 (renderCardText) and :251 (plainCardText)`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "data/keywords" game/src/` returns only ui/tooltip.js:79 (which imports getKeyword, allKeywords, slug, loadCompanionKeywords, loadContentRegistries — not these two), state/run.js:149 (dynamic import for loadContentRegistries) and two comments. `rg -n "renderCardText" . -g '!node_modules'` → keywords.js declaration, its own use inside plainCardText, the default export, and tests/combat/suite.js. `rg -n "plainCardText" . -g '!node_modules'` → the declaration and one docs/notes line; zero callers anywhere, tests included. ui/card.js:256 and :375 each build card text with their own `/\{(\w+)\}|\[([^\]]+)\]|\*([^*]+)\*/g`. Related: ui/card.js:32 says KEYWORD_LABEL is "filled by keywords.js consumers via CardView.registerKeywords()" and `CardView.registerKeywords` (card.js:701) has no caller, so that map is permanently empty.

### 37. `canSatisfy` is described in backpack.js's own header as "the one call scenes need" and in its doc comment as "The single question a Curiosity asks" — nothing calls it; Run.optionOpen reimplements its body inline, so the gate rule exists twice with the documented copy dead.

**Where:** `game/src/data/backpack.js:374`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "canSatisfy" game/src/` returns only backpack.js:54 (header), :374 (declaration) and :460 (default export) — no scene, no state module, no test. scenes/event.js:141 uses `satisfyingItem` and :180 uses `itemsSatisfying`; the actual gate decision lives in state/run.js:2082-2088 `optionOpen`, which is a line-for-line duplicate of canSatisfy's `list.some(r => have.has(r))` over `this.carrying`. This is the exact duplication haunts.js:5-12 was created to eliminate for the Haunt table.

### 38. The MoveDef `summons` field is authored on six enemy moves to declare what they will call in, and nothing anywhere reads it — the intent layer never shows it and the actual spawning is done imperatively inside each move's effect.

**Where:** `game/src/data/enemies/foyer.js:346, :1024, :1060; nursery.js:714; sleeping-quarters.js:991; bosses/butler.js:565`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "summons" . -g '!node_modules' -g '!*.json' -g '!docs/**'` shows no reader: combat/intents.js and ui/intent.js never mention it (I grepped both directly), and combat/preview.js's `summons` is an unrelated event counter incremented on EV.SUMMON. Every listed move spawns via `c.summon(...)` in its own effect body (e.g. foyer.js:348, nursery.js:716). The repo's own sim output records this: tests/critic-design/sim_current.txt:58,61,62,64,68 list "calling-bell/call-for-service: engine ignores summons" and four more.

### 39. Six EnemyDef/MoveDef fields are authored as if load-bearing and read by nothing; two of them (maxResonance, maxWoundUp) restate a cap that is separately hardcoded at every real call site, so they are a second source of truth that can silently drift.

**Where:** `game/src/data/enemies/foyer.js:996 (maxResonance), :627 (garments); nursery.js:149 (maxWoundUp); sleeping-quarters.js:724 and :896 (partOf); bosses/governess.js:184 (escort); governess.js:579, butler.js:597, bedframe-beast.js:281 (phaseTransition)`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> I enumerated every object-literal key in data/enemies/** and data/bosses/** and grepped each against the rest of game/src, then re-checked survivors repo-wide. maxResonance: `rg -n "maxResonance"` returns one line, its declaration — the real cap 4 is hardcoded at foyer.js:1004, 1027, 1055 and 1093. maxWoundUp: one line — the real cap 2 is hardcoded at nursery.js:163, 175, 187. Compare the working pattern: maxDust and maxMomentum are read back via `flag(c,'maxDust',4)` at foyer.js:48/58/68 and :406/419/433. garments: one line; activeGarment (foyer.js:629) closes over the module-level GARMENTS const directly. partOf: two lines, no reader. escort: `rg -n "escort" . -g '!docs/**'` finds only governess.js:184 plus unrelated Pudding cards — the Favorite Doll is actually placed by the encounter members list (encounters.js:312). phaseTransition: three lines, no reader. Note the contrast that makes escort and phaseTransition findings rather than noise: governess.js:167-181 explicitly LABELS `phases` and `phaseThresholds` as "DECLARED, and read by nothing — documentation, not a mechanic", and toy-chest's maxSummons (nursery.js:686-692) carries the same disclaimer; escort and phaseTransition carry no such label.

### 40. `scufflePool` is documented as "Convenience for the map generator" and the map generator does not import data/encounters.js at all.

**Where:** `game/src/data/encounters.js:658`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "encounters|scufflePool" game/src/state/mapgen.js` returns nothing — mapgen has no dependency on the encounter tables. `rg -n "scufflePool" . -g '!node_modules'` returns the declaration and tests/enemies/index.html:17 only.

### 41. STATUS_ORDER's doc comment says it is "the order the status row should display them: buffs, then debuffs" — no status row reads it; the engine hands the UI statuses in Map insertion (application) order and the UI renders that list as-is.

**Where:** `game/src/data/statuses.js:11 (re-export); declared at game/src/combat/statuses.js:228`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "STATUS_ORDER" . -g '!node_modules'` returns four lines: the declaration, the data/statuses.js re-export, and tests/combat/suite.js:328 and :792. I read `Engine.statusList` (engine.js:715-734): it iterates `actor.statuses` (a Map) and pushes in iteration order with no sort. ui/enemy.js `_renderStatuses` (enemy.js:998-1019) does `for (const s of list)` and appends — no sort either. `rg -n "statusRow|sortStatuses|statusOrder" game/src/ui game/src/scenes` returns nothing. The neighbouring `hasStatusDef` (data/statuses.js:18, combat/statuses.js:219) has zero references anywhere in the repo.

### 42. schema.js declares a CardDef field `previewFn` that "overrides the default preview"; the preview system never reads it, so a card author who wrote one would get silence.

**Where:** `game/src/data/schema.js:57`  
**Kind:** false-claim · **finder confidence:** high · **area:** data

> `rg -n "previewFn" . -g '!node_modules' -g '!*.json' -g '!docs/**'` returns the schema line plus three lines in tests/cards/index.html (a shape validator and one direct call in the harness) — nothing in combat/, ui/, scenes/ or state/. combat/preview.js works by replaying the card on an RNG-seeded clone (`previewCard`, engine.js:3213) and has no override branch. No card in data/companions/** declares one, so nothing is currently broken — but the shared schema promises a hook the engine does not honour.

### 43. The `roused` enemy status declares `consumeAfterAttack: true` and nothing anywhere reads that field; the behaviour it names is separately implemented by the `onDealtDamage` hook two lines below it.

**Where:** `game/src/data/enemies/_lib.js:343`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "consumeAfterAttack" . -g '!node_modules' -g '!*.json'` returns exactly one line, the declaration. The working implementation is `onDealtDamage: (ctx) => ctx.remove()` at _lib.js:346, dispatched from combat/damage.js:292. The engine's own status-decay path (engine.js:2700-2705) reads `def.decayAll` and `def.expiresFully`, never this field.

### 44. `hauntName(level)` is exported to name a Haunt rung and has no caller anywhere in the repo; both screens that print rung names index HAUNTS[n][1] inline instead.

**Where:** `game/src/data/haunts.js:28`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "hauntName" . -g '!node_modules'` returns two lines, both in haunts.js: the declaration and the default export object. scenes/clubhouse.js:490 and :555 and scenes/select.js:941, :1088 and :1459 all write `HAUNTS[this.haunt][1]` by hand. This is the duplication haunts.js's own header (lines 5-12) was written to eliminate, reintroduced on the other side.

### 45. Two independent `IMPLEMENTED_REGIONS` constants exist — one derived, one hand-written — and neither is read anywhere; nothing would notice if they disagreed.

**Where:** `game/src/data/encounters.js:482 and game/src/data/enemies/index.js:56`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> `rg -n "IMPLEMENTED_REGIONS" . -g '!node_modules'` returns exactly those two declaration lines and nothing else — no consumer in game/src, none in tests. encounters.js derives its copy from the authored formations; enemies/index.js hardcodes `['foyer','nursery','sleeping-quarters']`. `enemiesForRegion` on the line above (enemies/index.js:42) is likewise unreferenced repo-wide.

### 46. A cluster of data-layer exports have no caller in game/src, including two that name a consumer in their doc comment — `rollRewards` is "Convenience for the reward screen" and `relicsOfRarity` is listed in relics.js's own public-API header.

**Where:** `game/src/data/cards.js:141 (rollRewards), :83 (companionSlugs), :133 (statusCards), :134 (curseCards), :135 (sharedCards); game/src/data/relics.js:615 (relicsOfRarity); game/src/data/keywords.js:127 (hasKeyword), :129 (keywordsByCategory); game/src/data/events.js:974 (allEvents); game/src/data/enemies/_lib.js:123 (playedOfType)`  
**Kind:** unreachable · **finder confidence:** high · **area:** data

> I enumerated every `export` in every data module and grepped each name across all of game/src excluding its own file, then re-verified the survivors repo-wide. rollRewards, companionSlugs, statusCards, curseCards, sharedCards, relicsOfRarity, hasKeyword, keywordsByCategory, allEvents and playedOfType each return zero hits outside their declaring file — tests included, so this is not the tests-only case. The reward screen instead rolls its own pools in state/run.js:1782-1799 via poolWithCoop and `_rollRarity`; relics are rolled by rollKeepsake/rollKeepsakeRarity, never by rarelicsOfRarity. (cardsOf, coopCardsOf, neutralCards and registryErrors are also unreferenced in game/src but do have test callers, so I am listing them separately here rather than as findings.)

### 47. Backpack `tags` are documented as "the main channel" by which Gear matters, but only 7 of the 34 declared tags are ever named by a Curiosity gate, and 12 of the 18 items are named by no gate at all — including the Dog Whistle's 'canine' tag, whose advertised job ("Reveals hidden canine creatures") therefore has no implementation in either channel.

**Where:** `game/src/data/backpack.js:12-16 (the claim), tags declared at :71, :78, :84, :97, :104, :111, :128, :136, :143, :150, :157, :164, :171, :178, :185, :192, :200, :207`  
**Kind:** unreachable · **finder confidence:** medium · **area:** data

> I extracted every `tags: [...]` value from backpack.js (34 distinct tags, 18 items) and every `requires:` value from events.js (11 gates: multitool, ['pet-treats','feed']×3, ['notebook','record'], ['notebook','record','evidence'], ['camera','photo']×2, ['multitool','open'], ['dog-whistle','call'], ['familiar-toy','pet']). `rg -n "requires:" game/src/` confirms events.js is the only place gates are declared. Unused tags: animal, calm, canine, climb, dark, direction, fix, fort, friends, heal, light, map, mark, memory, name, power, pry, reach, reflect, rescue, scent, search, see, share, sound, tracking, warm. Items no gate names: blanket, chalk, collar-tag, compass, first-aid-tin, flashlight, glow-sticks, pocket-mirror, rope, spare-batteries-gear, thermos, walkie-talkie — of which blanket, first-aid-tin, glow-sticks, pocket-mirror and thermos still work through a live hook or run flag, and the rest are covered by the dead-run-flags finding above.

### 48. `attachActions()` and `attachChoices()` — the only things that register a `session.on('input')` / `broker.setRemote` handler — have no caller in `game/src/`, so the one networked Session the game builds (scenes/lobby.js:362) applies no inputs at all, local or remote.

**Where:** `game/src/net/actions.js:299 (and :339)`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "attachActions|attachChoices" .` → only actions.js itself, its own `export default {…}` object line 382, a prose mention in combat/choice.js:54, docs/notes/2026-08-29-the-wire-reaches-the-screens.md:163, and tests/net/index.html:19. `rg -n "from '.*net/actions.js'" game/src/` → six scenes, all importing only `{ act, ACT, deckIndex }`; no default import of the module anywhere (`rg -n "import [A-Za-z]* from" game/src/ | grep net/` → empty). `rg -n "\.on\('input'" game/src/` → actions.js:302 ONLY. The only `new Session` in game/src is scenes/lobby.js:362, which calls `session.attach(run)` — session.js:193, which just sets `run.session`/`run.localSeat` and registers nothing. `Session._pump()` (session.js:264) iterates `this._listeners.input`, populated only by `on('input', …)`. `act()` (actions.js:285) does NOT apply locally when a session exists: `const s = run.session; if (!s) return applyInput(...); const msg = s.input(input); return s.settled().then(() => msg.result)`, and `session.input()`'s own comment (session.js:406) says "The local board is not advanced here. The caller applies it, or waits for `on('input')`". Neither happens. So over the Treehouse wire a card play (combat.js:1157 `act(run, {t: INPUT.PLAY, ...ref})`), a snack, a map vote, a reward take and a shop buy are stamped, ordered, logged — and never applied on any client, and `msg.result` is always undefined. This also contradicts HANDOFF.md:224, HANDOFF-PROMPT.md:138 and docs/STS2-REFERENCE.md:467, all of which say the Treehouse "works today over ChannelTransport — two tabs, two Sessions, two Runs, one seed".

### 49. `Session.publishDigest()` — the entire desync-detection half of the netcode — has no caller in `game/src/`, despite its own doc comment stating it is "Called at every turn boundary."

**Where:** `game/src/net/session.js:625`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "publishDigest" .` → session.js:625 (the definition) and tests/net/index.html:258, 259, 268, 271. Nothing else, in game/src or anywhere. It is not called from `_pump`, `_maybeBeat`, `_accept` or `beat` (`rg -n "publishDigest|_checkDigest|WIRE.DIGEST" game/src/net/session.js` → 453 `_checkDigest`, 625 def, 635 def). `_checkDigest` only ever runs on an inbound `WIRE.DIGEST` frame, and the sole sender of that frame is `publishDigest`, so no client ever sends one and `_diverge({reason:'digest'})` can never fire in the shipped game. The file header (session.js:36-41) presents this as one of the three things that go wrong and what catches each: "The board digest is exchanged at every turn boundary and a mismatch is reported LOUDLY rather than papered over" — false against the code.

### 50. `Session.rejoin()` — the reconnection handshake the header calls the answer to "StS2's loudest complaint" — is called by nothing at all in the repo, so `absorb()` is likewise unreachable in the game (its only in-game path is the `WIRE.LOG` reply to a REJOIN nobody sends).

**Where:** `game/src/net/session.js:610`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "\.rejoin\(" .` → zero call sites; the name appears only in prose: actions.js:372, lobby.js:53, session.js:42/133. `rg -n "\.absorb\(" game/src/` → session.js:458 only, inside `case WIRE.LOG:` guarded by `m.to === this.transport?.id`; `WIRE.REJOIN` is sent only by `rejoin()`. Tests reach `absorb()` directly (tests/net/index.html:306, 312, 1144), bypassing the handshake. session.js:38-45 claims "a rejoining client asks for the log from wherever it got to, replays it against the seed, and checks the digest" — nothing in game/src ever asks.

### 51. `core/input.js` is completely inert: `ctx.input` is assigned once and never read again, and all six bus events the class emits — `input:down`, `input:move`, `input:up`, `input:dragstart`, `key:down`, `key:up` — have no subscriber anywhere in the repo (`input:move` fires on every pointermove).

**Where:** `game/src/core/input.js:4`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "core/input.js" .` → main.js:10 only. `rg -n "ctx.input|\.held\(" game/src/ tests/ tools/` → main.js:44 (`ctx.input = new Input()`) and nothing else; `pointer`/`keys`/`held()` are never queried. `rg -n "input:down|input:move|input:up|input:dragstart|key:down|key:up" .` (js/html/py/md, excluding node_modules) → six hits, all of them the `bus.emit` lines in input.js:17,19,25,31,38,40. `tests/bus-names/check.py` gates only the opposite direction (its docstring: "Exit code 1 if any subscribed name has no emitter"), so this side is ungated. The file's own header also claims "hover intent" — there is no dwell timer, no hover handler and no `pointerover` anywhere in the 44-line file; only `DRAG_PX` (the drag threshold) exists.

### 52. `audio/audio.js`'s bus-block comment states the mix layer "still has no live caller" and that "Twelve cues in the bank are still unreachable" — both were fixed and the comment was not updated.

**Where:** `game/src/audio/audio.js:313`  
**Kind:** false-claim · **finder confidence:** high · **area:** plumbing

> The comment reads "Twelve cues in the bank are still unreachable and the mix layer (`tension`, `telegraph`, `duck` on a hit) still has no live caller — both are open items in HANDOFF, with the evidence." But `rg -n "telegraph" game/src/` → scenes/combat.js:1867 `this.ctx.audio?.telegraph?.(Math.min(1, dmg / 40))`, and `rg -n "tension" game/src/scenes/` → combat.js:2474 `this.ctx.audio?.tension?.(1 - pct)` in `_syncPlayer`. `python tests/audio/cues.py --verbose` exits 0 and prints "RESULT: 46 cues, 45 reachable, 0 silent, 1 known-silent" — the one silent cue is `combat:crit`, listed in that gate's own UNREACHABLE table. HANDOFF.md:49-50 lists both items in its table of what WAS wrong and has been fixed, not in its open list.

### 53. `Audio.applySettings()` has no caller anywhere, and its doc comment asserts a caller in `scenes/title.js` that does not exist.

**Where:** `game/src/audio/audio.js:187`  
**Kind:** false-claim · **finder confidence:** high · **area:** plumbing

> The comment at audio.js:182 says "`scenes/title.js` has always called `ctx.audio?.applySettings?.()` after the settings panel closes". `rg -n "applySettings" game/src/scenes/title.js` → no matches; the only `audio` references in title.js are lines 271 (`unlock`), 285 and 347 (`play`). `rg -n "audio\??\.applySettings" .` across js/html/py/md → only audio.js:182 (the comment itself) and docs/notes/2026-08-20-seam-audit…md:35. The unrelated `applySettings` in ui/settings.js:93 is a different function (CSS token application) and never calls into `ctx.audio`. The volume path that actually works is the `settings:changed` bus handler at audio.js:346.

### 54. Four of the five authored screen transitions — `doorway`, `blueprint`, `candle-out`, `dawn` — can never play in the shipped game, because no `scenes.go()` call anywhere passes `opts.transition`; and the `TRANSITION_KINDS` export is referenced by nothing in the entire repo.

**Where:** `game/src/fx/transition.js:297`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> core/scenes.js:45 is the only in-game caller: `trans.cover(opts.transition || 'veil', …)`. `rg -n "transition:" game/src/ --include=*.js` → one hit, a CSS string in ui/hud.js:100; no `go(name, params, { transition: … })` exists (`rg -n "scenes\.?go" game/src/` → 20 call sites, none passing a third arg other than `{ instant: true }` at main.js:98 and ui/settings.js:222). The only other callers of `cover`/`wipe` are fx/showcase.js:75/195 and scenes/atmostest.js — and atmostest is never registered (`rg -n "atmostest" .` → only its own header and docs/notes/2026-08-19-atmosphere.md:154 saying it "needs registering in main.js"; main.js:52-62 registers eleven scenes and not it). `rg -n "TRANSITION_KINDS" .` → transition.js:297 and nothing else. transition.js:8 advertises the full menu ("Kinds: 'veil' (default), 'doorway', 'blueprint', 'candle-out', 'dawn'") and core/scenes.js:3 claims "Transitions are authored … so every screen change is deliberate" — every screen change is in fact the same default veil.

### 55. The six `--atmo-*` CSS custom properties `Atmosphere._publishCss()` writes onto `<html>` every frame are read by nothing — no stylesheet, no JS — so the documented "DOM actors shaded by the same lamp that lights the room" never happens.

**Where:** `game/src/fx/atmosphere.js:1158`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "atmo-" --include=*.css --include=*.js --include=*.html --include=*.md .` (excluding node_modules) → the six `setProperty` lines at atmosphere.js:1169-1174, the header block at atmosphere.js:29-33 that documents them, and two docs/notes files. Zero `var(--atmo-…)` anywhere; no .css file in game/, UI/ or elsewhere mentions the prefix. atmosphere.js:27-28 claims "so DOM actors (enemies, companions) can be shaded by the same lamp that lights the room".

### 56. Five methods listed in `fx/atmosphere.js`'s "Public API (other agents call these)" header have no caller in game/src, tests or tools: `light(spec)`, `setIntensity()`, `setActors()`, `keyLight()`, `screenToFloor()`.

**Where:** `game/src/fx/atmosphere.js:994`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -nE "atmosphere\s*\??\.\s*(dread|pulse|light|setIntensity|setActors|keyLight|screenToFloor)\s*\??\.?\(" game/src/ tests/ tools/` → hits only for `dread` (scenes/combat.js ×6) and `pulse` (scenes/combat.js ×2, atmosphere.js:900 internal); zero for the other five. Definitions are at atmosphere.js:994 (`light`), :997 (`setIntensity`), :1004 (`setActors`), :1010 (`keyLight`), :1020 (`screenToFloor`). `setActors` is the ground-shadow entry point, which is the same feature the dead `--atmo-ground` property serves.

### 57. FIXED 2026-08-30 (a duplicate of leads 1 and 2). Two player-facing settings toggles, `autoEndTurn` and `confirmSingleTarget`, are read by nothing — yet `ui/settings.js`'s header claims every control "actually takes effect" and names both as "read from `Save.settings` at the point of use".

**Where:** `game/src/core/save.js:31`  
**Kind:** false-claim · **finder confidence:** high · **area:** plumbing

> `rg -n "autoEndTurn" game/src/ tests/ tools/` → core/save.js:31 (the DEFAULT), ui/settings.js:19 (the claim), :65 (the toggle spec with the hint "Ends your turn automatically once nothing in hand is playable"), :82 (a second defaults table). `rg -n "confirmSingleTarget"` → the same four kinds of site (save.js:31, settings.js:19/67/83). No consumer in combat.js or anywhere else. By contrast the neighbouring `showDamageNumbers` in the same claim IS read, at fx/combatfx.js:53 — so the sentence is right about one of the three flags it names and wrong about two.

### 58. `core/assets.js`'s texture half is dead: `texture()` and `all()` have no caller and `onProgress` is never assigned, so the header's "progress reporting and texture caching" describes machinery that never runs. Only `image()` is used, once.

**Where:** `game/src/core/assets.js:14`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "\.texture\(|onProgress" game/src/ tests/ tools/` → only assets.js itself (:12 `_tick`, :14 def, :45 inside the equally dead `all()`); `onProgress` is read at :12 and written nowhere. `rg -nE "\bassets\b" game/src/` shows the singleton reaching exactly one consumer: scenes/map.js:241 `ctx.assets.image(sec.url)`. `.all(` matches in game/src are all `Promise.all`.

### 59. `Stage.setCameraBase()` and `Stage.setQuality()` are both named in `core/renderer.js`'s "Public API (do not break)" header and neither has a caller anywhere in the repo.

**Where:** `game/src/core/renderer.js:537`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "setCameraBase" game/src/ tests/ tools/` → renderer.js:5 (the header list) and :537 (the definition). Nothing else. `rg -n "setQuality"` → renderer.js:7 (header), :210 (definition) and fx/shaders/grade.js:15, which only mentions the name in a comment. `setQuality` is self-described at :209 as a "Legacy knob kept for compatibility", but `setCameraBase` carries no such note and is presented as live public API.

### 60. `scenes/lobby.js` calls `atmosphere.setMood('terrace')` believing `terrace` is one of the authored moods; it is a prop LAYOUT value, not a region, so the call silently falls back to `foyer` and the Treehouse renders the Forgotten Foyer.

**Where:** `game/src/scenes/lobby.js:141`  
**Kind:** false-claim · **finder confidence:** high · **area:** plumbing

> `resolve()` at fx/atmosphere.js:731 is `REGION_ALIAS[name] || (REGIONS[name] ? name : 'foyer')`. `terrace` is in neither table: REGIONS keys (extracted between atmosphere.js:147 and :674) are foyer, nursery, sleeping, kitchens, greenhouse, graveyard, study, attic, lampworks, ballroom, crypt, hedge, passages, bathhouse, kennels, pumpkin, heart, title; REGION_ALIAS (atmosphere.js:674-683) adds only slug spellings plus `exterior: 'title'`. `rg -n "terrace" game/src/` shows what it actually is: atmosphere.js:54 lists it among the `props.layout` values ("wings | colonnade | rows | aisle | clutter | nook | terrace | hang | perimeter"), atmosphere.js:278 uses it as greenhouse's layout, and :718 is its entry in the layout-fallback table. The lobby.js comment at :135-140 — "Every authored mood is an interior — foyer, colonnade, aisle, nook … `terrace` is the most open of them" — lists four layout names as if they were moods; only `foyer` is one.

### 61. `refCard()` is exported and named by CONTRACTS trap 30 as the way to resolve a wire card reference, but nothing in `game/src/` calls it — only tests do.

**Where:** `game/src/net/session.js:99`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "refCard" .` → session.js:98 (jsdoc) and :99 (definition), CONTRACTS.md:276 ("Use `cardRef` / `refCard` from `net/session.js`"), docs/notes/2026-08-28-netcode.md:91, and tests/net/index.html:17/92/157/159. Its partner `cardRef` IS live (scenes/combat.js:26, :1151), so the encoding half is used and the decoding half never is — consistent with finding 1, since the applier that would decode a ref (`attachActions` → `applyInput`) is itself never wired.

### 62. The bus event `audio:ready` is emitted on unlock and has no subscriber anywhere in the repo.

**Where:** `game/src/audio/audio.js:130`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "audio:ready" .` (js/html/py/md, excluding node_modules) → one hit, the emit at audio.js:130. No `.on('audio:ready')` in game/src, tests or tools. `tests/bus-names/check.py` only fails on subscriptions with no emitter, so an emit with no subscriber is ungated (its docstring: "Exit code 1 if any subscribed name has no emitter").

### 63. `LOCAL_SESSION` is an exported constant (`= null`) that nothing in the repo imports or references.

**Where:** `game/src/net/session.js:672`  
**Kind:** unreachable · **finder confidence:** medium · **area:** plumbing

> `rg -n "LOCAL_SESSION" .` across js/html/py/md excluding node_modules → exactly one hit, the declaration itself at session.js:672. Its own doc block explains why the local case needs no session object at all ("Nothing needs a null check for the local case; that is why this is not the default"), i.e. it documents its own uselessness rather than reserving a seam.

### 64. The save field `seenTutorials` is declared in the save DEFAULT and is never read or written by anything.

**Where:** `game/src/core/save.js:34`  
**Kind:** unreachable · **finder confidence:** high · **area:** plumbing

> `rg -n "seenTutorials" game/src/ tests/ tools/` → one hit, core/save.js:34. No reader, no writer, no migration reference. (Every other DEFAULT key has consumers: e.g. `petsRescued` 4, `clues` 89, `partyHauntLevel` via `hauntKey`.)

### 65. HANDOFF.md and HANDOFF-PROMPT.md both still list `card:retain` as a known-silent cue with "no retain event is emitted" — the event exists and is emitted, and the gate lists only one known-silent cue.

**Where:** `HANDOFF.md:310-314 and HANDOFF-PROMPT.md:224-228`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> `python tests/audio/cues.py` prints "RESULT: 46 cues, 45 reachable, 0 silent, 1 known-silent" and its UNREACHABLE dict (tests/audio/cues.py:48) holds only `combat:crit`. `EV.CARD_RETAIN: 'card:retain'` is declared at game/src/combat/events.js:139 and emitted at game/src/combat/engine.js:3084; game/src/scenes/combat.js:1743-1745 plays it. Fixed in commit 64f5433 "card:retain was never a missing feature, only a missing event". HANDOFF-PROMPT contradicts itself: its own battery line 99 says "46 cues, 45 reachable, 1 known-silent" and line 63 says "tests/combat/run.py 694 ← +5, the card:retain event".

### 66. HANDOFF.md says the vote beat "stays at 1.5 s" in two places; the constant is 3.0 s.

**Where:** `HANDOFF.md:272 and HANDOFF.md:1128`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> `const VOTE_BEAT = 3.0;` at game/src/state/run.js:113, used at run.js:978. The comment block above `_walkAfterVote` (run.js:936-960) is headed "── 1.5 s → 3.0 s, 2026-08-30, and this is arithmetic not taste ──". Commit f68ab2f "The vote beat was a third of the time its own message takes to read". HANDOFF-PROMPT item 7 has the new number; HANDOFF.md was not updated.

### 67. HANDOFF.md §9 states "The lobby SCREEN is not built and is a design question" — it is built, registered and reachable from the title menu.

**Where:** `HANDOFF.md:1310`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> game/src/scenes/lobby.js exists; game/src/main.js:22 imports `LobbyScene` and main.js:55 registers `.register('lobby', (c) => new LobbyScene(c))`; game/src/scenes/title.js:366 `case 'together': ctx.scenes?.go?.('lobby', {})`. Built in commit fc30a54 "The Treehouse — net/lobby.js finally has a face". HANDOFF.md:219-227 and docs/STS2-REFERENCE.md §8.12 both already record it as built, so §9 contradicts the same file.

### 68. The `_wireBus` header comment in audio.js claims "Twelve cues in the bank are still unreachable and the mix layer (`tension`, `telegraph`, `duck` on a hit) still has no live caller" — one cue is unreachable and both mix-layer entry points have live callers.

**Where:** `game/src/audio/audio.js:313-315`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> `python tests/audio/cues.py` → "46 cues, 45 reachable, 0 silent, 1 known-silent". `audio.tension()` is called from game/src/scenes/combat.js:2475 (`this.ctx.audio?.tension?.(1 - pct)`) and from audio.js:339/342 itself; `audio.telegraph()` is called from game/src/scenes/combat.js:1867 (`this.ctx.audio?.telegraph?.(Math.min(1, dmg / 40))`). Both call sites carry comments saying they are the fix for exactly this. This is the file's own header believing an out-of-date note — CONTRACTS trap 54.

### 69. HANDOFF.md §9 lists as still open "whether a fork with only one legal exit should open a ballot at all (it currently does, and resolves instantly)" — a single-exit fork no longer opens a ballot.

**Where:** `HANDOFF.md:1126-1128`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> game/src/state/run.js:848-867: the "A DOOR IS NOT A FORK" block computes `const forced = this.legalNextIds().length <= 1;` and returns `this.resolveVote()` immediately rather than waiting for the remaining seats. HANDOFF.md:268 in the same file already records this as resolved ("A single-exit fork no longer opens a ballot"), so §9 contradicts §'Design calls'.

### 70. HANDOFF.md §5 describes "a 10-level Haunt ladder"; the ladder has six rungs (0–5).

**Where:** `HANDOFF.md:903`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> game/src/data/haunts.js: `HAUNTS` holds exactly six rows, levels 0..5 (Standard, Stirred, Watchful, Awake, Hungry, Possessive). game/src/core/save.js:13 `export const MAX_HAUNT = 5;` and tests/haunt/index.html:53 asserts `MAX_HAUNT === HAUNTS.length - 1`.

### 71. HANDOFF.md says Crinkle's design chapter is unreviewed / "awaiting the designer's review" in two places; the chapter records that the designer accepted it on 2026-08-29.

**Where:** `HANDOFF.md:21-22 and HANDOFF.md:647`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> docs/design/companions/16-crinkle.md lines 27-38: "_**The designer accepted it on 2026-08-29**, on a review that checked it against the build rather than only reading it… 90 against 90, zero drift in both directions_". HANDOFF.md:280-285 (the design-calls block) also says "**Crinkle's chapter is ACCEPTED.**", and HANDOFF-PROMPT lists it under "Resolved… so you do not re-open them". §1 and §5 were not updated.

### 72. HANDOFF-PROMPT's battery claims `tests/seams/check.py` reads "6191 call sites" and says every number in it was run on 2026-08-30 rather than copied forward; at HEAD it reads 6249.

**Where:** `HANDOFF-PROMPT.md:97 (and the "EVERYTHING IS GREEN … RUN on 2026-08-30" preamble at line 33)`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> Exported both commits to a scratch dir with `git archive` and ran the gate: at 8eb9d65 ("Battery numbers, re-run rather than carried forward") it prints "6191 call sites checked, 0 problems"; at HEAD (d9515a5) it prints "6249 call sites checked, 0 problems". The three commits after 8eb9d65 (fc30a54 lobby scene, 4dad8b3 matedeck, d9515a5 docs) added call sites, and d9515a5 rewrote HANDOFF-PROMPT.md without re-running this line. The doc's own instruction is "if one differs, that is the finding".

### 73. HANDOFF.md §3's "Test suites — all must stay green" table is stale across most rows: the numbers it says each suite prints when happy no longer match.

**Where:** `HANDOFF.md:793-810`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> Table says `tests/net/run.py` 128 — tests/net/index.html contains 160 `check(` calls and the current battery reads 158 (HANDOFF.md:239 itself says "tests/net 152 → 158"). Table says `tests/wink/run.py` 5 — tests/wink/index.html contains 17 `check(` calls (16 plus the catch-all), and the battery reads 16. Table also says combat 677 (battery 694), coop 594 (645), backpack 77 (80), map 23 (30), butler 24 (38), governess 25 (56), enemies/audit ~2060 (2085), seams 6189 (measured 6249 at HEAD).

### 74. HANDOFF.md §1 says "**~65,500 lines** across `game/src/`"; it is ~80,500.

**Where:** `HANDOFF.md:25`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> `find game/src -name "*.js" | xargs wc -l` → 80517 total (game/vendor excluded, as the claim scopes to game/src).

### 75. Both HANDOFF.md and docs/STS2-REFERENCE.md §8.1 say "`tests/haunt/` is 18 checks"; the suite has 21.

**Where:** `HANDOFF.md:298 and docs/STS2-REFERENCE.md:188`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> tests/haunt/index.html has 22 `check(` call sites, of which line 165 is the `catch` fallback — 21 real checks. HANDOFF-PROMPT's re-run battery (line 71) also reads 21. Same stale number in two files, which is the "nothing syncs them" case HANDOFF-PROMPT warns about.

### 76. HANDOFF.md §9 "Built and tested" says "**25 authored multiplayer-only Tricks**, 3 Uncommon + 2 Rare for each built Companion" — all 16 Companions ship a co-op pool, so it is ~80.

**Where:** `HANDOFF.md:1157-1159`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> All 16 companion modules under game/src/data/companions/ declare `const coopCards = [...]` (boggle, bones, brambleboo, crinkle, crumbula, drizzle, hush, marmalade, mopsy, mossbit, pipkin, pudding, taffy, truffle, wink, wisp); an id-count over those blocks totals ~82. The same file at HANDOFF.md:1281 says "**Every Companion's co-op pool is written.** All 16 shipped their three Uncommon and two Rare multiplayer-only Tricks", so §9 contradicts itself.

### 77. HANDOFF-PROMPT.md says "Then CONTRACTS.md, which is at 54 traps" — it is at 55.

**Where:** `HANDOFF-PROMPT.md:6`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> Parsing CONTRACTS.md's "Traps this codebase has already fallen into" section for `^\d+\. \*\*` yields trap numbers 1..55, count 55, max 55 (trap 55 "THE ID NAMESPACE IS NOT WHAT THE PLAYER READS" at CONTRACTS.md:788). HANDOFF-PROMPT itself cites "CONTRACTS 55" thirty lines later.

### 78. HANDOFF.md §5 says "16 Curiosities"; `CURIOSITIES` holds 17.

**Where:** `HANDOFF.md:902-903`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> game/src/data/events.js:74 `export const CURIOSITIES = [` — 17 top-level entries: scratching-behind-the-wall, the-collar, the-feeding-room, the-photograph, the-house-register, the-bell-pull, the-umbrella-fort, the-cat-flap, the-dumbwaiter, the-lost-and-found, the-portrait-that-follows, moths-cousin, the-open-window, the-coat-with-something-in-it, the-stair-cat, the-mended-thing, the-nights-arithmetic. (The same sentence's "38 Keepsakes" and "18 Backpack items" both check out: RELICS has 38 entries, BACKPACK_ITEMS has 18.)

### 79. HANDOFF.md's "Closed 2026-08-29" boss block says "Both curves left where they are, deliberately; the comment in `butler.js` records why" — the Butler's `partyHp` curve was removed and his pool was cut.

**Where:** `HANDOFF.md:428-429`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> game/src/data/bosses/butler.js:258 opens "NO party curve. He rides the global `PARTY_HP_SCALE` like everything else" and explains the removal; `git log -S "partyHp: [1, 2.2, 2.8, 3.2]" -- game/src/data/bosses/butler.js` → 33a5a59 "The Butler's party curve was fitted to the broken bot; he rides the global again" (an ancestor of HEAD). His pool is `hp: [149, 149]` (butler.js:251), changed in 5616a56. So the butler.js comment records the opposite decision to the one HANDOFF cites it for.

### 80. docs/STS2-REFERENCE.md §8.3 says "HANDOFF §9 states that 'StS2 actually uses 250%' and that our 220% is a deliberate divergence" — HANDOFF §9 was corrected and now says the opposite.

**Where:** `docs/STS2-REFERENCE.md:238-239`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> HANDOFF.md:1258-1263 reads "**CORRECTED 2026-08-27:** this section used to say 'StS2 actually uses 250%' and frame our 220% as a deliberate divergence. That was wrong." The reference's "and this corrects the record" framing now describes a record that no longer exists.

### 81. docs/STS2-REFERENCE.md §8.3 says "at a party of four our Courage figure is 440% of solo in the Foyer" — our shipped 4p multiplier is 5.7 (570%), and our curve is not linear.

**Where:** `docs/STS2-REFERENCE.md:258-259`  
**Kind:** false-claim · **finder confidence:** medium · **area:** claims

> game/src/combat/engine.js:165 `const PARTY_HP_SCALE = [1, 2.2, 4.0, 5.7];`, read by `get partyHpScale()` at engine.js:377. 440% is StS2's linear 4p figure (2 sentences earlier in the same bullet: "2p ×2.2, 3p ×3.3, 4p ×4.4"), not ours. HANDOFF.md:1181 and CONTRACTS.md both state our curve as [1, 2.2, 4.0, 5.7], i.e. 3p is 400% against a linear 330% and 4p is 570% against 440%.

### 82. HANDOFF.md §6 says "`tests/seams/check.py` now scans 1607 call sites"; it scans 6249.

**Where:** `HANDOFF.md:925-926`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> Running the gate at HEAD prints "RESULT: 6249 call sites checked". The same document's §3 table (HANDOFF.md:804) says 6189 and HANDOFF-PROMPT says 6191, so three different figures for the same gate appear across the two docs and none matches.

### 83. HANDOFF.md §10 says "docs/notes/ 46 per-agent notes … indexed by a row in docs/NOTES.md" — there are 61 notes and four have no row, including the two HANDOFF-PROMPT tells the next session to read.

**Where:** `HANDOFF.md:1334 and HANDOFF.md:1338-1340`  
**Kind:** false-claim · **finder confidence:** high · **area:** claims

> `ls docs/notes/*.md | wc -l` → 61. Cross-referencing every `notes/<name>.md` link in docs/NOTES.md against the directory leaves four files unindexed: 2026-08-29-the-grind-was-the-instrument, 2026-08-29-the-map-was-writing-the-run, 2026-08-29-the-party-cost-gap-is-arithmetic, 2026-08-29-the-route-is-voted. HANDOFF-PROMPT.md:9-10 names two of those four as required reading.

### 84. HANDOFF.md §9 says "A round, and a room, always starts with seat 0" — it starts with the lowest LIVING seat, which CONTRACTS states correctly.

**Where:** `HANDOFF.md:1186`  
**Kind:** false-claim · **finder confidence:** medium · **area:** claims

> game/src/state/run.js:494-517 `resetSeat()` does `const first = this.kids.findIndex(k => k.courage > 0); if (first >= 0) this.setLocalSeat(first);`. CONTRACTS.md (Co-op section) says "A round, and a room, starts with the lowest living seat. Not 'whoever has not gone yet'". With seat 0 fallen the round starts at seat 1, so the HANDOFF wording is wrong in exactly the case the rule exists for.

### 85. HANDOFF.md §1 says the design doc is "carved into 44 readable files under docs/design/"; there are 45, which is what §10 of the same file says.

**Where:** `HANDOFF.md:15-16 (vs HANDOFF.md:1333)`  
**Kind:** false-claim · **finder confidence:** medium · **area:** claims

> `find docs/design -name "*.md" | wc -l` → 45. HANDOFF.md:1333 says "docs/design/ 45 carved design files".

### 86. CONTRACTS.md's file-ownership table enumerates `src/net/**` as "(`session.js`, `transport.js`, `actions.js`)", omitting `lobby.js`, which has been in that directory since 2026-08-28.

**Where:** `CONTRACTS.md:866`  
**Kind:** false-claim · **finder confidence:** low · **area:** claims

> game/src/net/ contains actions.js, lobby.js, session.js, transport.js. HANDOFF.md:1305 records `net/lobby.js` as DONE 2026-08-29. The glob still covers it, but the parenthetical roster of the netcode area is incomplete.

### 87. HANDOFF.md's header says "last updated 2026-08-29" while the body carries findings dated and committed 2026-08-30.

**Where:** `HANDOFF.md:3`  
**Kind:** false-claim · **finder confidence:** low · **area:** claims

> The same file contains "**AND THE BIGGER FINDING, measured 2026-08-30**" (line ~100), "**fps DOES NOT REPRODUCE — sampled 2026-08-30**" (line ~150) and "**THE LOBBY IS BUILT, 2026-08-30**" (line ~218); `git log -1 --format=%ci -- HANDOFF.md` places its last commit on the 2026-08-30 run (d9515a5). A reader trusting the header will treat the 08-30 blocks as un-reviewed.
