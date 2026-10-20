# The round-40 repair — three boards a paired test found worse, and the shop's ellipsis

Survey 7's paired test (`SURVEY-2026-10-20.md`) put survey 6 (`f8150d8e`)
against survey 7 (`786ece38`) blind. Both paired judges found round 40 and its
graft made **reward**, **combat-crowd** and **event** WORSE, and both survey-7
judges named the **shop's** ellipsis at 1280 their worst problem. Put back
what survey 6 did better on those boards, KEEP what round 40 fixed, and prove
it paired.

The captures to compare, both sizes: survey 6 `C:/UILOOP/survey6/NOW/<screen>.png`
and `<screen>-1280.png`; survey 7 `C:/UILOOP/survey7/NOW/` (same names). LOOK at
each pair before you start. Read the judges' words in
`C:/UILOOP/pairs67/judge1.md`, `judge2.md` and `C:/UILOOP/survey7/judge1.md`,
`judge2.md` (their sections for these four screens), then `GRAFT-r40.md` and
`C:/UILOOP/r40/graft/NOTES.md`, which say what changed and why.

Ownership is `BRIEF-r40.md`'s (the boards' DOM/CSS and the screens' own JS,
`ui/hang.js`, `ui/hand.*`, `ui/enemy.js` for the medallions' placement only,
`kit.css`/`tokens.css` by appending). No `fx/`, no `core/renderer.js` (keep
the render-scale governor), no card face design, data, gameplay or test edits.

## 1. reward — the paintings and the rules text as survey 6 had them

- **The paintings:** survey 6 "hangs the two paintings large beside the cards
  like a gallery with the windows high"; survey 7 "squeezes small paintings up
  by the candles ... pushed up into the top corners" with "nameplates wider
  than the frames" (survey-7 J1). Hang them at survey 6's size beside the
  cards, on cords, each plate under its frame and no wider than it. At 1280,
  where round 40's judges found survey 6's paintings jammed into a 15 px gutter
  against the trays, keep them large: take the width they need from the side
  bays (the windows can go higher or narrower), never a gutter under ~24 px.
  `fitHung` still guarantees nothing covers a plate.
- **The rules text at 1600:** survey 6's "card rules text is larger", survey
  7 "leaves the rules text small in a lot of empty card" / "small inside
  oversized panels". Measure the rendered rules px of the three reward cards on
  both builds (`git worktree add` a checkout of `f8150d8e` if you need it) and
  give the cards back survey 6's size or larger, filling the panel; 12 px+ at
  1280 still.

## 2. combat-crowd — the hand and the Butler's intents

- **The intents:** both paired judges preferred survey 6's "framed gold
  bracket beside the Courage bar" / "cartouche hooked onto his health bar" to
  survey 7's coins on THE BUTLER plate, and both survey-7 judges say the coins
  crowd the nameplate's top rule. Put them back in survey 6's bracket by his
  bar (survey 6's code is the reference; round 40's judges' complaint about it
  was "bolted onto the right end ... a detached strip": seat the bracket so it
  reads as part of the bar's frame).
- **The hand:** survey 6 "deals a larger fanned hand whose rules text reads
  clearly"; survey 7 "squeezes the cards smaller". Give the hand survey 6's
  card size or larger, kept LOW (its top below the fighters' bars, as round 40
  asked) and narrow by stacking duplicates (round 36). Both survey-7 judges at
  1280: **no card may cover another card's cost coin or title ribbon**; the
  ×N stack medallion INSIDE its own card's top-right, not on the next card;
  long titles (Put Yourself Back Together) on at most two lines so the art
  keeps its window; rules 12 px+ rendered (the graft's `probe/handpx.py`
  method, both sizes). The stack still plays by mouse, keys and pad for every
  copy (the graft's `probe/stackplay.py`).

## 3. event (and rest, which shares the hang) — plates within the frame

Survey 6's "nameplates under the two hung paintings wrap to sit within each
frame's width, where B's single-line plates overhang the paintings". Cap every
hung plate's width at its frame's width, wrapping to two lines (`settlePlate`
in `ui/hang.js`), on event, rest, reward and gameover. If that costs Josh's
paintings at 1280 (event and rest already swap most pools for three family
portraits), say so with counts before and after.

## 4. shop — no ellipsis, goods that fill their domes

- The Coatcheck Ticket's rule is clamped with an ellipsis at 1280: never
  truncate a rule. Fit every Keepsake and Snack rule in full at 1280 and 1600
  (a wider column, a fixed four-line rule box, tighter leading -- 12 px+).
- The goods under glass are 20-30 px icons: each object at least ~50 px,
  filling its dome (both survey-7 judges).

## Proof

- Captures of the four screens at both sizes from your tip (`BRIEF-r40.md`'s
  commands plus event with `--scene event --hash pics=1`; reward, event and
  gameover with `--hash pics=1`) into `C:/UILOOP/r40/repair/after/`, LOOKED
  at beside the survey-6 and survey-7 captures and `UI/mainMenu.png`.
- Gameover, map, hud-late must not change for the worse (they won the paired
  test): capture them too and LOOK.
- SPINEL's small-text probe (`C:/UILOOP/r40/spinel/smalltext.py`) on the four
  at 1280: 0 runs under 12 px. The paintings checked with EVERY painting of
  each pool in each slot at both sizes on reward, event, rest and gameover.
- Tests via `python tools/on_port.py PORT <test>`, your own server started
  FROM your worktree: chrome, steam-deck, gamepad, hand-cards, card-face,
  cards-feel, map, backpack, gameover-keeps, combat-scene/seam, scene-css,
  css-tokens, seams. `python tools/endings_guard.py --base 786ece38` prints
  ENDINGS OK before every commit. Commit after every item; captures in
  `timeout 600`; stop ONLY your own processes, BY PID. Never commit
  `tests/critic-design/result.json`.
- `NOTES.md` in `C:/UILOOP/r40/repair/`: commits, measurements, and what you
  did NOT do.
