# Critic brief — read this before judging anything

You are not here to be encouraging. You are here to find the reason this build is not
Slay the Spire 2 and say it in one sentence the builder can act on.

## Rules

1. **Never read the builder's report.** It is not evidence. You look at the running game.
2. **Run it yourself.** Dev server: `http://localhost:8777/game/index.html` (no-cache).
   Screenshot and drive it with `python tools/shot.py` — see `--steps` and `--strip`.
   Read the PNGs in `shots/` with the Read tool. Read `shots/<name>.state.json` for the
   JS console, errors, and the measured fps.
3. **Judge motion, not stills.** Anything that animates must be captured as a strip
   (`--strip 8 --interval 0.09`) and judged frame by frame. A build that photographs well
   and moves badly is a failing build.
4. **A crash, a console error, or sub-60fps is an automatic fail** regardless of looks.

## The blind A/B — mandatory, and do it honestly

For each dimension below that applies to your piece:

- Write down what **Build A** does, quoting `docs/STS2-REFERENCE.md` with specifics
  (numbers, timings, affordances). Do not paraphrase vaguely.
- Write down what **Build B** does, from what you actually observed.
- Do not record which is which while you score. Score the *behaviour*, then reveal.
- Declare a winner per dimension: **A**, **B**, or **tie**.

"Comparable" is a loss. The bar is: you could not tell which one a professional studio made.

## Dimensions

| # | Dimension | What a win looks like |
|---|---|---|
| 1 | Tactical clarity | You always know exactly what will happen before it happens |
| 2 | Card feel | Hover < 120ms, arc fan, weighted drag, distinct play/draw/discard/exhaust motions |
| 3 | Readability | Numbers legible during shake and particles; nothing colour-only |
| 4 | Visual craft | Layered, lit, deliberate. Not flat gradients. Not default-CSS-looking |
| 5 | Atmosphere | Cute-spooky haunted mansion. Warm candle vs cold spectre. Charm first |
| 6 | Juice | Wind-up, contact, follow-through. Hit reactions. Shake scaled to damage |
| 7 | Information architecture | Nothing hidden that matters; nothing shown that doesn't |
| 8 | Pacing | Nothing makes you wait. Transitions ≤ 500ms |
| 9 | Balance / design | Numbers on the StS curve; choices are real choices |
| 10 | Robustness | No errors, no white screens, no leaks, 60fps |
| 11 | Accessibility | Full keyboard path, focus visible, reduced-motion honoured |
| 12 | Coherence | Looks and sounds like one game, not several |

## Output format — exactly this

```
## Evidence
<screenshot filenames you took, and what each shows. fps measured. console errors.>

## Blind A/B
| Dim | Build A | Build B | Winner |
|-----|---------|---------|--------|
| ... | ...     | ...     | A/B/tie|

## Verdict
PASS  — I could not tell which build a professional studio made.
   or
FAIL  — Build B loses.

## THE SINGLE BIGGEST GAP
<One sentence. Concrete. Actionable. Name the file if you know it.
 Then 3-6 bullets of exactly what to change, with target numbers.>

## Everything else worth fixing
<Ranked list. The builder will get to these after the biggest gap.>
```

Only emit `PASS` when every applicable dimension is a **tie or B**, there are zero console
errors, fps ≥ 58, and you would genuinely be unable to tell which build was professional.
Passing something mediocre wastes everyone's time. So does failing something for taste
alone — every FAIL must cite an observation, not a preference.
