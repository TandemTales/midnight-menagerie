# Midnight Menagerie UI pass — builder brief

## The goal

Josh's four sample images in `UI/` are the art direction for the whole game:

| file | what it is |
|---|---|
| `UI/title.png` | the MIDNIGHT MENAGERIE wordmark: marbled lavender serif caps with a gold edge, inside a dark cartouche of gold filigree, purple scrollwork, bats and gold stars |
| `UI/mainMenu.png` | a full painted night scene: gothic mansion, navy sky, ivy, iron fence, lanterns, purple roses |
| `UI/selectCompanion.png` | a board of painted portrait tiles in thin gold frames, each with a dark cartouche nameplate (serif name, small italic epithet); logo cartouche and a gold ribbon banner on top; purple damask and filigree ground; lit candles and cobwebs in the corners |
| `UI/selectKid.png` | CHOOSE YOUR KID: purple filigree side borders, eight portraits in ornate gold frames, a gold mirror frame with a moon medallion on top and a paw medallion below, dark info panels with thin gold rules and small medallion icons on their top edge, round purple enamel buttons with gold rims for back / confirm, a skull on books and a candle as set dressing |

The Title, Companion Select and Kid Select screens already ARE those paintings.
Every other screen is a clean modern dark web UI — thin 1px borders, flat
near-black voids, blue-glow cards — and does not look like the same game. Your
job is to make the screens you are given look like they sit **between the
samples** in a trailer. Blind judges will compare your screenshots against the
samples and against the other builds, without knowing whose is whose and
without reading a word you write.

**Open every one of the four sample PNGs with the Read tool before you design
anything,** and look at the in-game Title (`#scene=title`) on your own server.

## Your sandbox (the values are in your prompt)

- You work ONLY in your worktree `WT`, on your branch. Never edit, build, run
  git, or start servers in the main repo under `C:\Users\Josh\OneDrive\...`.
  Every shell command starts with `cd "WT" && ...`.
- Start your own server once, in the background:
  `cd "WT" && python tools/devserver.py PORT`
- Photograph the game: `cd "WT" && python tools/shot.py NAME --port PORT --scene shop --seed 7 --companion bones --kid maya --wait 3`
  → `WT/shots/NAME.png`, plus `NAME.console.txt` if the page logged errors.
  `--w 1280 --h 800` for the Steam Deck size. `--steps "hover:.sel|wait:0.3"` to
  photograph a hover state. Read the PNG with the Read tool — look at your work
  after every meaningful change, the way the judges will.
- Commit on your branch in `WT` when done (several commits is fine).

## The style, in rules

- **Ground:** near-black aubergine (#0d0911 → #1a1022), never pure flat black.
  Large areas carry texture — a faint damask or filigree, dust, a vignette.
- **Gold:** antique brass, not yellow — dark #6b4c24 shadow, #b08a4a body,
  #e6c98a highlight — used for thin double rules, corner scrollwork, frames,
  medallion rims, ribbon edges.
- **Purple:** lavender #b99be0 → violet #6f45a8 for display type, enamel and
  scrollwork. Warm candle light (#ffb35c glow) against cold moonlight blue,
  sparingly.
- **Type:** engraved serif caps for titles (Cinzel is in `game/src/ui/fonts.css`,
  with Grenze and Rye), letter-spaced small caps for labels, a readable serif
  for body. A name on a nameplate reads like the sample tiles: **Name** over a
  small italic epithet.
- **Frames and panels:** a dark panel inside a thin gold double rule with a
  small ornament at the corners or a medallion centred on the top edge (the
  selectKid info panels). Titles sit in a cartouche or on a gold ribbon banner
  with star glyphs at its ends ("✦ CHOOSE YOUR KID ✦").
- **Buttons:** icon actions are round purple enamel medallions with gold rims;
  the primary action is a gold-framed cartouche; secondary actions are
  quieter versions of the same, never plain rectangles.
- **Dressing:** candles with a soft animated glow, cobwebs in corners, filigree
  — at the edges, never over information.
- **Not the style:** flat boxes, 1px grey borders, glassmorphism, neon glows,
  pill buttons, default web form controls, emoji, drop shadows that look like
  CSS drop shadows.

## Techniques that work here

1. **Use the samples' own painted pieces.** The select screens were built by
   preparing crops of the sample paintings — read `tools/prep_board.py` and
   `tools/prep_menu_art.py`. The empty info panels, ribbon banner, round buttons,
   medallions, filigree borders, candles and cobwebs in `UI/selectKid.png` are
   exactly the kit every screen needs, and a crop of an empty panel frame makes
   a CSS `border-image` 9-slice that draws that exact frame at any size. Prepare
   them with a script in `tools/` (commit the script AND its outputs, under
   `game/assets/ui/kit/`, as WebP where it has no alpha seams).
2. **Vector re-drawings** (inline SVG, CSS masks) of the same grammar for things
   that must scale crisply: rules, corner flourishes, small medallions.
3. **A shared kit, not per-screen one-offs.** Put reusable classes in ONE new
   global stylesheet, `game/src/ui/kit.css`, linked from `game/index.html` next
   to `tokens.css`, with its colours as custom properties in
   `game/src/ui/tokens.css`. Screens then use the kit classes. The winning kit
   becomes the language for every later screen.
4. **Backgrounds.** Josh is painting one per screen from
   `docs/art/background-prompts.md` (e.g. `shop.png`, `reward.png`, `event.png`)
   into `animations/backgrounds/`; none exist yet. Build the slot: a backdrop
   layer that shows `game/assets/backgrounds/<name>.webp` when it exists, with a
   vignette and candle-light treatment over it. Until then its placeholder must
   already feel painted — use the samples' own dark damask and filigree texture,
   candle glows and depth. A flat void scores near zero with the judges.

## Hard rules

1. **Keep every piece of information and every control.** Do not rename or
   remove ids, classes, data attributes, ARIA or visible text that code or tests
   use — `grep -rn "<selector>" game/src tests` before touching one. ADD classes.
2. **Legible:** body text contrast at least 4.5:1 on its actual background;
   numbers stay readable; nothing clipped or overlapping at 1600x900 or 1280x800.
3. Reduced motion is honoured (`prefers-reduced-motion` and the game's setting);
   keyboard focus stays visible.
4. **No console errors.** Check `shots/*.console.txt`.
5. **Line endings.** This repo has CRLF, LF and MIXED files and the edit tools
   silently normalise mixed ones. Before every commit run
   `cd "WT" && python "UILOOP/endings_guard.py" --base BASE`
   and do not commit until it prints `ENDINGS OK`.
6. New assets: WebP or optimised PNG, under 8MB in total.
7. Touch presentation only — never `game/src/data`, `game/src/combat`, `game/src/state`.

## Deliverables

- Your commits on your branch.
- The canonical screenshots, copied into `JUDGING/CODE/` with these exact names,
  taken with exactly these commands so every build is compared like for like:

```
cd "WT" && python tools/shot.py CODE-shop   --port PORT --scene shop   --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-reward --port PORT --scene reward --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-event  --port PORT --scene event  --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-shop-1280   --port PORT --scene shop   --seed 7 --companion bones --kid maya --wait 3 --w 1280 --h 800
cd "WT" && python tools/shot.py CODE-reward-1280 --port PORT --scene reward --seed 7 --companion bones --kid maya --wait 3 --w 1280 --h 800
cd "WT" && python tools/shot.py CODE-event-1280  --port PORT --scene event  --seed 7 --companion bones --kid maya --wait 3 --w 1280 --h 800
```
  → `JUDGING/CODE/shop.png`, `reward.png`, `event.png`, `shop-1280.png`,
  `reward-1280.png`, `event-1280.png`.

- Stop your dev server when you are finished.
