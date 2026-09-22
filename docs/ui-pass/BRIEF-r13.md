# Midnight Menagerie UI pass — round 13 builder brief

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**, then `BRIEF-r12.md` in full — its
three CONTRACTS (what the coach, the veil and the toast must keep doing), its
ownership rules and its capture commands all still hold. This file wins
wherever they disagree.

## CHROME, second pass: the pieces are converted, now make them the samples'

Round 12 converted the last web chrome in the game — the coach, the hot-seat
handoff veil and the achievement toast went from 2 / 1 / 1.33 to **7.33 /
8.00 / 7.67**, the largest gain of the pass. What merged (`57bb92f`,
`90d0fad`):

- **the coach** — VELLUM's: a `.kit-panel` note with a paw, brass corner
  guards, a heading ("THE FIRST SCUFFLE"), kit-button SKIP / GOT IT with an
  Enter keycap, placed by scoring positions against what it must not cover;
  the spotlight is the kit's gilt rail frame.
- **the veil** — ORMOLU's: the next Kid's first name in title.png's
  cartouche, "with <Companion>", PASS IT OVER on a ribbon, the Kid and the
  Companion in the Kid board's frames with nameplates, I'M READY with keycap
  and tick medallion — over Josh's painting of the house (`main-menu.jpg`).
- **the toast** — VELLUM's: a silver/bronze/gold medal and a `.kit-plate`
  plaque, moved under the top rail, clear of the HUD.

No judge put any of them at 9 or marked them `fits_between_samples`. All
three judges said the same things about each, and that agreement is your fix
list. Where a judge named a GRAFT from a candidate that lost, the branch is
there to read: `git show ui/r12-chrome-b:<path>` (GESSO: things in the house)
and `ui/r12-chrome-c` (ORMOLU: type and ceremony), `ui/r12-chrome-a` (VELLUM).

### The coach

1. **The spotlight reads as a selection box** — all three judges. "A hard
   rectangular gilt box with a flat dark fill, reading as a CSS highlight
   frame rather than a painted light." Make it LIGHT: a candle-warm pool that
   falls off, with filigree at the corners only, so the target is lit rather
   than outlined.
2. **Nothing points from the note to what it teaches** — two judges. A gilt
   filigree tail, a ribbon, ORMOLU's fleur-de-lis finial turned toward the
   target: the note and its target must read as one object.
3. **Graft ORMOLU's speaker** — two judges: Marmalade's face in a gilt cameo
   with her nameplate on the plate, "so the tutorial's voice belongs to a
   character". The tutorial's other pages are hers (`figure: 'marmalade'`).
4. The plate is a straight-edged rectangle with thin corner pieces: a real
   cartouche — scrolled corners, a double gold rule. Drop the row of filler
   star glyphs at its bottom left.
5. GOT IT as a round purple enamel button with a gold rim and a check glyph,
   like the samples' confirm; keep the Enter keycap. The heading in the
   lavender engraved display face, larger.

### The veil

1. **The portraits are pasted cards** — all three judges: "flat square crops
   with thin gilt corners... sitting directly on the mansion painting with no
   backing plate". Heavy gilt filigree frames — selectKid.png's arched mirror
   is the reference — on a backing plate with the samples' double rules, and
   a GAP between the two.
2. **The painting competes with the words** — all three: dim or vignette it
   more behind the centre stack, so the name, the portraits and I'M READY
   carry the hierarchy.
3. **Everything is named twice** — the cartouche says MATEO and the plate says
   "Mateo Alvarez"; "with Wink" sits under the cartouche and on Wink's plate.
   Say each thing once.
4. **Candlelight** to answer the moonlit house: candle dressing in the lower
   corners, a lantern beside the portraits. Graft ideas the judges named:
   VELLUM's small shelf between the portraits (a skull, books, a candle) and
   its moon and paw medallions on the frame; GESSO's theatre valance and
   tassels crowning the cover.

### The toast

1. **The plate is a plain dark bar** — all three: make it a gold ribbon with
   star glyphs (ORMOLU's toast ribbon is the graft two judges named), or a
   gilt cartouche with a double rule and star ends. Keep three levels of
   type: the tier in spaced small caps, the name, the italic description.
2. **It hides the corner candle** — all three. Move it down or inward, clear
   of the candle sconce, the top rail and the enemies' intents. It is still
   bound by BRIEF-r12's contract: off the HUD, the portrait, the Nerve, the
   piles, the hand and End Turn.
3. **The medal is a flat vector star on a gradient disc** — engraved relief and
   a lit rim, so it is as painted as the plate. GESSO's idea, named by two
   judges: hang it from a purple silk ribbon, as a real award hangs. Its
   METAL is the tier (bronze, silver, gold), readable without the words.

## Who owns what this round

As `BRIEF-r12.md`: the coach, the veil and the toast (`ui/coach.*`,
`ui/handoff.*`, `ui/achievement-toast.*`), the `kit.css` section headed
`/* ── the coach, the veil and the toast ── */` (append to it, or append a
new section after it), `tokens.css` by appending only, and `chrome-*` assets
built by `tools/prep_chrome.py` (extend it; do not add a second script with
the same job). Nothing in `game/src/fx/*`, `scenes/*`, the HUD, the cards or
`ui/portrait.js`.

## Photographing, testing, deliverables

Exactly as `BRIEF-r12.md`: the same three captures at both sizes, the same
gates through `on_port.py`, ENDINGS OK. Captures and gpuprof runs queue on the
machine's GPU slot; **hold it for one capture or one batch at a time, not for
a whole session** — round 11's builders held it for 35-90 minutes each, and
everything else on the machine, their fellow builders included, waited.

**Stop only the processes you started, by the PID you recorded when you
started them.** Never kill by name or command-line pattern (`python`,
`perf.sh`, `gpuprof`, `on_port.py`): other builders run the same tools at
the same time. A round-14 builder stopped its own profile script by pattern
and took three or four processes that were not its own with it.
