# Midnight Menagerie UI pass — round 12 builder brief: THE LAST WEB CHROME

Read `BRIEF-r0.md` in this folder first: its **The style, in rules**, **Hard
rules** and **Your sandbox** sections apply word for word. Then read
`BRIEF-r1.md`'s **What round 0 decided**: the kit it describes is still the
language, extended by every round since. Nothing else in those two files is an
instruction for this round. Then read this file, which wins wherever they
disagree.

## One track: CHROME — the coach, the handoff veil, the achievement toast

Every screen in the game has been through this loop at least once except
three, and those three have been listed as "still web chrome" in the handoff
since round 3. Round 7's brief parked them on purpose ("Nobody edits
`ui/coach.*`, `ui/handoff.*` or the achievement toast") and no round ever came
back for them. **No judge has ever seen them.** They are what a player meets in
their first ten minutes (the coach), every co-op turn (the veil), and at every
milestone (the toast).

Converting a screen from web chrome to the kit has moved it about FOUR points
in every round that did it (round 1 EXPAND +3.61, round 2 COMBAT +3.75 and
EXPAND-2 +4.05, round 3 DIALOGS +3.84). This is that kind of round.

**Round 11 is running at the same time** on the WebGL room (`game/src/fx/*`).
Nothing you own touches it and nothing it owns touches you. Captures from both
rounds queue for the GPU (see "Photographing").

## What each one is, what it must keep doing, and what it looks like now

Photographed on dev before this round (the baseline, `TWILL`, is exactly this):

### 1. The coach — `ui/coach.js`, `ui/coach.css`

The walkthrough laid OVER the first real fight (`scenes/tutorial.js` deep-links
the ordinary combat scene at `foyer-1` with `tutorial=1` and mounts the coach
on top). Read the long comment at the top of `coach.js`: the design decision is
that it is presentation only and never touches the rules.

**Now:** a flat cream rectangle with square corners and a hairline rule, pinned
top-centre over the fight; the spotlight is a plain rectangle outline round the
target; SKIP is a bare text link and GOT IT a flat gold button. It reads as a
browser tooltip laid on a painting.

**It must keep:** taking NO pointer events except on its own buttons (the fight
underneath stays playable); pointing at its target — the spotlight must still
find and frame whatever the step names, and the note must not cover the thing
it is pointing at, the hand, or End Turn; being dismissible at any point;
reading at 1280x800. The words are the tutorial's and are not yours to rewrite.
The tutorial's other pages are Marmalade's voice (`figure: 'marmalade'` in
`scenes/tutorial.js`), so a note that is visibly HERS is in keeping — but that
is an idea, not an instruction.

### 2. The handoff veil — `ui/handoff.js` (`passTo`), `ui/handoff.css`

The full-screen cover a hot-seat co-op game raises between two Kids' turns, so
the next player never sees the previous player's hand. It is a `Modal` of size
`full` with `className: 'mm-handoff'`.

**Now:** a pure black screen with centred type — "PASS IT OVER", the next
Kid's first name, "with <Companion>", "Your turn.", a sub-line, and an I'M READY
button with an Enter keycap. No object, no frame, no material, nobody's face.

**It must keep:** HIDING THE BOARD COMPLETELY — that is the only reason it
exists, and the comment on `passTo` explains why `onReady` runs behind the
cover. Nothing of the hand, the cards or the enemies may be legible through it,
so a translucent veil over the fight is not an option; what is BEHIND the veil
may be anything you draw. Enter and Space still say ready; focus still lands
on the button; `aria-labelledby` still names the title; `onReady` still runs
before the veil lifts. The Kid and Companion are real data (`KIDS` and
`COMPANIONS` in `data/schema.js`), and `ui/portrait.js` already draws both.

### 3. The achievement toast — `ui/achievement-toast.js`, `.css`

Raised on `achievement:unlocked` with a definition from
`core/achievements.js` (a name, a tier — bronze, silver or gold — and a
description). It queues several at once.

**Now:** a small dark pill in the bottom-left corner, with tiny type, sitting
ON TOP of the Companion's portrait and Nerve plate.

**It must keep:** queueing; `aria-live="polite"`; appearing on every screen
(it is hosted on the tip layer, over whatever scene is showing); and it must
NOT cover the HUD's readouts, the Companion portrait, the Nerve and piles, the
hand or End Turn. The TIER is information a player should read at a glance.

## The kit is the language

`game/src/ui/kit.css` opens with an index of every component, and each has
been judged: `.kit-panel` (dark panel in a painted gold rail), `.kit-frame`
(ornate portrait frame), `.kit-plate` (nameplate), `.kit-btn` and `--quiet`,
`.kit-medallion`, `.kit-enamel`, `.kit-ribbon`, `.kit-heading`, `.kit-tag`,
`.kit-prop--candle`, and the dialog vocabulary rounds 3 to 7 built in
`ui/modal.css` (the veil is a Modal, so read how the Settings and pile-viewer
frames were drawn). **Use them before you invent.** A new component goes in a
section APPENDED to the end of `kit.css`, headed
`/* ── the coach, the veil and the toast ── */`; new tokens are appended to the
end of the `--kit-*` block; a new asset is named `chrome-*` and built by a
script you commit under `tools/`, never painted by hand into the tree.

**Variety WITHIN the palette.** Round 6 gave four plates the real materials of
the things they were — velvet, walnut, fired enamel — and two judges marked it
DOWN because the browns and roses left the palette. A real material in the
wrong hue is a regression.

## Who owns what this round

- **CHROME owns:** `ui/coach.css`, `ui/coach.js` (presentation, not the steps'
  text or logic), `ui/handoff.css`, `ui/handoff.js` (markup and style, not
  `passTo`'s contract), `ui/achievement-toast.css`, `ui/achievement-toast.js`,
  your appended `kit.css` section, and new `chrome-*` assets with their build
  script.
- **Nobody's this round:** `game/src/fx/*` (round 11's), `hud.css`/`hud.js`,
  `tokens.css` except appending, `ui/modal.css` (style the veil through
  `.mm-handoff` in `handoff.css`), `scenes/*`, `ui/card.*`, `ui/hand.*`,
  `ui/enemy.js`, `ui/intent.js`, `ui/portrait.js` (use it; do not change it).
- **Lay out through your own classes.** A scene sheet that positions a shared
  `.kit-*` class turns `tests/scene-css` red, even scoped.
- **Never reuse a name.** Grep `game/src` and `game/assets` before you add a
  class or an asset.

## The bar

9 is "a viewer could not tell this was not made by the same hand as the
samples". The screens around these three score 7 to 8 now; a coach note, a
veil and a toast that look like the rest of the game is the whole ask. The
three are small, so the judges will look closely: type size and weight, the
edge of every plate, what a button is made of, whether a glow is a candle or a
CSS box-shadow.

## Photographing

Every capture takes a machine-wide GPU slot (`tools/gpu_slot.py`) and queues
behind round 11's builders when they are capturing; `gpu_slot: waiting for the
GPU` means queued, not hung — do not kill it. Budget your captures.

```
cd "WT" && python tools/shot.py CODE-coach   --port PORT --scene combat --encounter foyer-1  --companion marmalade --kid maya --seed 7 --region foyer --hash "tutorial=1" --wait 7
cd "WT" && python tools/shot.py CODE-handoff --port PORT --scene combat --encounter foyer-14 --companion bones --kid maya --seed 7 --wait 5 --script @tools/shot-scripts/chrome-handoff.js
cd "WT" && python tools/shot.py CODE-toast   --port PORT --scene combat --encounter foyer-14 --companion bones --kid maya --seed 7 --wait 5 --script @tools/shot-scripts/chrome-toast.js
```

Each again with `--w 1280 --h 800`, named `CODE-<screen>-1280`. `shot.py`
writes into `WT/shots/`; copy each to `JUDGING/CODE/<screen>.png` and
`<screen>-1280.png` with the `CODE-` prefix removed. A capture that exits 2 is
VOID (the GPU, not your work) — retake it. Look at each capture's state file:
0 console errors.

The coach's later steps point at other things (the hand, a card's cost, End
Turn). Advance with `--steps "click:.coach__next|wait:1.2|shot:CODE-coach-2"`;
a step that waits for an ACTION shows `.coach__hint` instead of the button, so
do the action (click a card, then its target). Photograph at least two more
steps than the first, so the spotlight and the note are proven against more
than one target.

## Testing your branch

Every test hard-codes :8777, the main checkout's server; run each against your
own server as `python tools/on_port.py PORT <test>`:

- `tests/coop/hotseat.py`, `tests/coop/playthrough.py`, `tests/coop/rooms.py`
  (the veil)
- `tests/platform/run.py` (the toast)
- `tests/teaching/check.py` (the tutorial and its coach)
- `tests/chrome/run.py`, `tests/css-tokens/check.py`, `tests/scene-css/check.py`

And `python tools/endings_guard.py --base BASE` in your worktree before you
finish: ENDINGS OK.

## Deliverables

- commits on your branch; ENDINGS OK; the eight gates above green;
- `coach`, `handoff`, `toast` at the default size and at 1280x800 in
  `JUDGING/CODE/` (six files), 0 console errors each;
- at least two more coach steps photographed and looked at (not judged);
- the veil photographed once over a screen other than combat (the Map or the
  Reward board: raise it with the same script after `--scene map` or
  `--scene reward`) and looked at;
- `notes_for_merger`: every kit piece you used, every new class and asset, and
  what you changed in each `.js` file and why.
