# The house opens, and the Kid board becomes its painting

2026-09-07. Three asks from the design owner, taken together because two of them
are the same screen.

---

## 1. Every wing is reachable from every fork

`wingOffer` handed back two or three doors: a seeded subset of the wing's
architectural neighbours, plus sometimes one manifested door. Most of the house
was unreachable from any given fork. The owner's call is that the party should
go where they like.

The gate is gone. Every wing not yet walked is offered — the Heart excepted,
which is the ending rather than a wing you pick. **`openExitsFor` is still
load-bearing**, and that is the part worth keeping: it separates a door that
prints the design doc's own reason for the join from one that is a wardrobe that
does not end. The three layers decide HOW you get in; they no longer decide
whether.

### It argues with a design chapter, and says so

`01-mansion-structure.md` closes on *"What changes is not the identity of the
mansion. What changes is what the mansion is WILLING TO LET THEM REACH."* That
sentence now describes how a wing reads, not whether it opens. This is a
decision against the chapter rather than an implementation of it, taken by the
owner, and it is written into `wingOffer`'s own comment where the next person
will meet it. Every comment that promised two-or-three was corrected rather than
left to rot — `run.js`, `atlas.js`, `net/actions.js` (CONTRACTS trap 54).

### The sweep that polices the distribution was measuring itself

The 4000-route table picked uniformly "among what the house opens" using a
hand-rolled LCG sharing one state across every route and every step:

    s = (s * 1103515245 + 12345) & 0x7fffffff;  return s % n;

Its period is 10466 against the ~20000 draws the sweep takes, and its low bits
correlate across the interleaved moduli a fork uses (15, 14, 13, 12 as wings are
spent). **In isolation it looks fine** — 6000 draws of `rnd(15)` land 375-428
against an expected 400 — which is exactly how it survived every eyeball it got
while offers were only two or three wide.

I first said the bug was float precision: `s * 1103515245` reaches 2.4e18, far
past `MAX_SAFE_INTEGER`, so the masked low bits are garbage. **That was wrong
about the effect** — the histogram above disproves it — and the A/B is what
settled it. Same offers, same seeds, only the picker moving:

    wing                LCG      game RNG          wing            LCG    RNG
    nursery            51.3%      27.4%            bathhouse      15.1%  24.9%
    pumpkin-grounds    14.1%      26.9%            greenhouse     17.1%  26.8%

Uniform over four middle slots drawn from fifteen candidates is 4/15 = **26.7%**,
which is the right-hand column across the board. So the **"min 12% / median
24.7% / max 53%" distribution the last handoff quoted was substantially this
generator**, not the house. It uses `RNG` now: min 24.9% / median 26.9% / max
28.0%.

### Gated, and the gate was proved to see

200 seeded forks must offer exactly the unwalked set minus the Heart, and the
Heart only on the last crossing. Regressing `wingOffer` to `.slice(0, 3)` turns
it red with `800 forks did not offer every unwalked wing — seed 90000 step 0
from foyer: offered 3 of 15`, and takes nine wings under the 7% floor with it.

## 2. Where tonight starts

The Foyer was wing one of every expedition ever run. It still is the first time
— the opening teaches that run, and an atlas of seventeen blank rectangles is
not a choice. After the Foyer has been **cleared** once, the way in is a
decision.

    save      `blueprint.cleared` beside `revealed`. Two different facts: you
              survey a wing by walking in, and dying counts. `deepMerge` gives
              old saves both, so no migration.
    run.js    `canChooseEntry()` reads the LIFETIME record — the unlock survives
              a defeat. `new Run` takes `startRegion` and validates it: an
              unknown slug or the Heart falls back to the front door, so neither
              a deep link nor the network seam can strand a run.
    select.js hands its `run:start` payload to the atlas instead of firing it.
    atlas.js  `enter` mode, then fires `run:start` with the wing appended.

### And it names who is held where

Everywhere else the atlas gates that on having surveyed the wing — its own
header argues that printing "Hush — the Secret Passages" on night one hands back
what Companion Select refuses to say. On the way in it prints it anyway,
deliberately: the screen exists so you can go and get the one you want first,
and it cannot do that job silently. It is not night one either — the mode does
not exist until the Foyer is down. Recorded as an exception in the header rather
than by quietly loosening `_surveyed`, which still governs every other screen.

**The chain was verified end to end for all 15 non-Foyer wings**: choosing a
wing starts you there, and clearing its boss frees the Companion the atlas said
was held there. `rescueTargetFor` already preferred a Companion whose home wing
you are standing in; what was missing was any way to stand in it on purpose.

### One thing measured rather than assumed

Marking all sixteen wings as doors drew sixteen boxes and sixteen labels over a
plan that overlaps itself, and the labels collided into an unreadable band
across the middle of the house. At a fork there are two or three and finding
them IS the screen; at sixteen it is texture. Entry mode leaves the ordinary
hover-reveal alone and dims only what is closed — the Heart. Everything legible
is choosable.

## 3. The Kid board is its painting

`UI/selectKid.png` was prepped to `game/assets/ui/select-kid.jpg` in August and
**wired to nothing**. Both `ui/portrait.js` and HANDOFF.md said so in as many
words. The screen was a grid of eight thumbnails and a paragraph.

It is the painting now, the way `selectCompanion.png` is the Companion board.
The eight portraits, the oval mirror, the slotted dossier and both corner
buttons are painted; the page lays transparent hotspots over the frames, puts
the chosen Kid's portrait in the glass, and writes live text into the slots.

Every number measured off the file (`KID_BOARD` in `ui/portrait.js`):

- **frames** — the gold rails, found with the same warm-pixel scan
  `tools/prep_board.py` uses: x 74-300 and 1148-1372, rails at y 174/366/551/737.
- **glass** — the bounding box of the oval's OPENING (x 380-619, y 344-796), not
  of its gold surround. Guessing generously put the portrait's hands and map
  over the frame's lower ornament: a picture sitting *on* the mirror.
- **dossier** — its four boxes are not evenly spaced (93px for the name, 188 for
  the pet), and the third is TWO boxes with a medallion over each. One paragraph
  stretched across both ignored the drawing, so the shield gets the perk and the
  star gets what the Kid is for.

**The order is the painting's, not the roster's.** `KIDS` runs maya, mateo,
amina, eli, …; the painting puts samir fourth on the left and jordan, priya,
eli, lena down the right. Iterating `KIDS` in order would have put four kids in
the wrong frames. Identified by matching each painted face to its portrait art.

### Three things found by measuring across viewports

1. The hotspot border was drawn OUTSIDE the measured rect, so every highlight
   sat a hair proud of its painted frame. `box-sizing: border-box`.
2. The dossier was sized in `vmin`, which tracks the window and not the
   letterboxed sheet, so a square window shrank the painting and left the text
   large. `cqw` against a `container-type: inline-size` sheet now: 1448 design
   px maps to 100cqw at every size.
3. Seven Kids then fitted and Samir did not — his perk ran 5px past its box at
   900x900. Rather than size all eight down to the longest entry, each band
   carries a `--fit` knob and `_fitBands()` turns down only the band that
   overflows. Measured against the children's boxes, not `scrollHeight`: the
   bands are centred flex columns, so content escapes upwards too.

Verified: 8 Kids × 5 viewports (1920x1080, 1280x800, 1280x720, 1024x768,
900x900), zero band overflow, no page scroll, aspect held at 4:3. And the whole
opening driven end to end — board, pick Amina, painted tick, her own pet in the
story, into the coached Dust Bunny fight with 5 cards in hand.

## Gates

    38 × tests/*/check.py       all green
    tests/run/run.py            50 runs, 1 error (the documented `_losePatience`)
    tests/coop/run.py           645 passed
    tests/vote/run.py           35 passed
    tests/combat-scene/seam.py  22 passed
    tests/critic-design/anchor.py  5/5 agree
    tests/teaching/check.py     7 passed
    tests/licences/check.py     0 problems
    determinism 5/5 · resume 3/3 · localStorage 3/3 · mid-fight 3/3

The routing change also shortened the run gate's own tail — past-30 5 → 3,
longest 51 → 36 at n=50 — which nothing here was aiming at and which is one
sample, so it is recorded rather than claimed.

## What is NOT done

- **`_losePatience` still fires.** Unchanged by any of this and still the one
  documented failure. The remaining fights are boss treadmills; see
  `2026-09-06-the-wall-that-was-a-bot-passing.md`.
- **An expedition is still six wings of seventeen.** Nobody asked to change
  that, and it is what makes a run a route rather than a tour.
- **`scenes/select.js` still has its own Kid step** (step 2 of Companion
  Select) and it is still the old grid. Only the opening's picker is the
  painting. Making the board a shared component is the obvious follow-up and was
  not done here.
