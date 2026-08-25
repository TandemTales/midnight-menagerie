# Frontend round 5 — the lost pets get faces

Agent: frontend. Owns `src/scenes/{title,select,clubhouse,gameover}.{js,css}`,
`src/ui/portrait.{js,css}`, and (new this round) `src/ui/petart.js`.

The reviewer's finding, in their words:

> "**The lost pets have no faces.** Eight polaroids on the investigation board are empty dark
> rectangles with one flat grey silhouette each. The MISSING poster on the kid-select screen uses
> a hard-coded cat-shaped SVG path for every pet — I read the markup: one fixed `d` attribute,
> shown for Lucy's guinea pig as readily as for a cat. **The single image the whole game is about
> is a placeholder.**"
>
> "**The kids have no faces either** — one shared body silhouette recoloured with a hat or
> glasses, eight times, while the Companions get gorgeous painted portraits."

Both are now generated art. Nothing on the four screens I own is a placeholder.

---

## 1. `src/ui/petart.js` — sixteen generated photographs

**New file.** Frontend-owned; it pairs with `ui/portrait.js` the way `ui/cardart.js` pairs with
`ui/card.js`, and it follows that file's established shape exactly: FNV-1a hash of the subject's
slug seeds a mulberry32 PRNG, one canonical bitmap per subject, a `Map` cache, and a documented
table of illustration-only pigment that is deliberately not UI colour. **Please add it to the
ownership table in CONTRACTS.md under `frontend` — I cannot edit that file.**

### The framing that makes it achievable

There is no budget for sixteen paintings, so the question was how to generate art that can sit
beside `game/assets/portraits/marmalade.png` without embarrassment. The answer was not to try to
paint. A missing-pet picture is **a photograph a child took**, and a convincingly bad snapshot is
much easier to make beautiful — and much more moving — than a portrait. So the target became:

> direct flash, blown highlights, crushed-then-lifted blacks, a shallow depth of field with the
> room a soft blur behind, eyeshine, halation round the bright edges, film grain, an orange date
> imprint in the corner, and an animal slightly too close to the lens and not quite centred.

That also does something the brief hoped for: the Companions are painted illustrations of what
the house *turned these animals into*, and the pets are photographs of what they *were*. The two
halves of the story now read as two different kinds of image on purpose.

### Pipeline, per photograph

1. **room** — a blurred domestic backdrop, one per pet. Orbit's landing at night, Pepper's warm
   kitchen, Mochi's hay-strewn hutch, Sprocket's cage in front of a bookshelf, Pixel's vivarium
   under a heat lamp, Scout's back fence at dusk, Mooncake's shredded bedding, Biscuit's lino.
   This carries most of the individuality and costs almost nothing, because it is 12 px of blur
   over six rectangles.
2. **flash shadow** — the hard one a direct flash always throws behind the subject.
3. **subject** — species anatomy built from smooth closed Catmull-Rom loops, filled with a
   direction-field fur / feather / scale texture.
4. **face** — the eyes are the whole thing: limbal ring, striated iris, wet specular window, lid
   shadow, and **tapetum eyeshine**, the bounce off the back of the eye that makes every flash
   photo of a pet look like that. Green-gold for the carnivores, red for the prey animals, which
   is what a real flash actually does.
5. **foreground** — a thumb over a corner, a cage bar, the near edge of the floor. Out of focus.
6. **grade** — flash falloff, halation, an S-curve, the black lift, a colour cast, corner
   softness, grain, a light leak, and the date imprint.

### The three techniques that decide whether this reads as a photo or as clip-art

- **`fuzz()` — hairs that cross the outline.** Without it every shape has a laser-cut edge and no
  quality of fill can rescue it. This is why forms are polylines rather than bezier paths: the
  same array gives both a clip region and per-point outward normals.
- **`roundOff()` — an inner shadow round the rim of every form, plus a bounce opposite it.** Each
  part used to be a flat plate with one linear gradient, which averages to moulded vinyl however
  good the fur on top is. One thick blurred stroke clipped inside the loop buys real volume for a
  single draw. `occlude()` does the same job between parts — ears onto skull, head onto chest.
- **`flashLight()` — one directional falloff over the entire finished frame.** Per-part gradients
  give you about two stops of range. A single hard falloff, hot where the flash lands and near
  black away from it, is what gives a flash photograph its actual range, and it costs one fill.

### Things that were wrong and had to be found by looking

- **Mochi's lop ears vanished.** Drawn before the head, the head's own fur and rim shadow ate
  them and she came out looking like a hamster. An eight-week-old rabbit's ears *are* the breed;
  they now go on last, over the head, in cocoa so they are a different value from the silver head
  at 122 px. Same fix for Scout's drop ears in near-black liver against the white blaze.
- **Pixel was a snowman.** Head oval stacked on body oval with a gap. A gecko is one continuous
  low horizontal tube; the head is now a *swelling on the front of the body*, not a ball above it.
- **Pepper was a knitted jumper with a beak.** Small head, big scalloped chest. A conure is mostly
  head — the skull is nearly the width of the chest, the eye is enormous inside a ring of bare
  white skin, and the grey breast scalloping is a fine texture, not a pattern of scales.
- **Biscuit had a puppy's ears.** Guinea-pig ears are small folded petals set low at the sides.

### The eight Kids

Same engine, torch-lit instead of flash-lit. Age, background and the details the design docs
actually name do the identifying work: Maya's forearm crutch, Mateo's round glasses, Eli's
rectangular ones, Amina's puffs, Priya's braid and headband, Jordan's fade and hood, Lena's
camera and hair tie, Lucy's bunches and backpack straps. Priya lost the glasses she had in the
old `KID_LOOKS` table — three kids in glasses was one identifying feature doing no work, and the
docs only give them to Mateo and Eli.

Two bugs worth writing down:

- **Five of the eight were bald.** The hair silhouettes were traced as an outline and then a
  second arc back along the inside of it, which under nonzero winding is a *ring* — correct for a
  bob or a curtain of long hair, a hairband on a bare skull for everything else. Fixed by laying
  a solid dome down for every cut before the cut-specific mass goes on top.
- **Hair at RGB 20 is invisible.** `HAIRCOL` is deliberately about two stops lighter than
  "correct": at true black the fill, the fur strokes and the rim light all clip to the same value.
  Real hair under a torch is dark with a hard specular band, so the fill stays dark and the
  highlight is pushed all the way to the torch side.

---

## 2. Performance — where the 30 ms per photograph goes, and where it must not land

Cold render started at **~140 ms each**, 2.3 s for the set. Now ~30 ms each, ~0.5 s for all
sixteen. The wins, largest first:

| change | why |
|---|---|
| `willReadFrequently: true` on every canvas | every one of these ends in `toDataURL`, which forces a GPU→CPU readback. On the accelerated backend that stall was two thirds of the cost; on the software backend there is no readback and the vector work is not meaningfully slower. |
| pooled scratch canvases | sixteen photographs were allocating six full-frame canvases each. |
| one shared 96 px grain tile, drawn as a pattern | was a fresh full-frame `ImageData` per photograph: 300k RNG calls apiece. |
| halation computed at quarter scale | a 3 px blur of a 124 px image is the same picture as an 11 px blur of a 496 px one, for a sixteenth of the work. |
| backdrops painted at half scale | four times less blur, and a mushier blur is what out-of-focus looks like anyway. |
| JPEG, not PNG or WebP | these are grainy photographs. PNG costs ~5x the bytes for nothing visible; WebP encodes 3.5x slower (12 ms vs 3.5 ms) for a saving nobody can see at 122 px. |

**`alpha: false` belongs on the render canvas only.** Setting it on the pooled scratch layers too
made `blurred()` paint an opaque black rectangle over every photograph and broke the
`destination-in` mask in the grade. Both scratch uses need their alpha channel.

### Scheduling, which is the part that actually threatens 61 fps

30 ms of canvas work cannot be hidden on a screen the player is looking at. Measured:

- **`requestIdleCallback` on the Title: 6 fps.** A 30 ms paint does not fit a 10 ms idle slice and
  rIC hands you the slice regardless. Do not put this back.
- **What ships:** the Title kicks off `warmFaces()` (rAF-chunked) the instant the player commits
  to a destination, so the work happens under the transition veil that is coming down anyway.
  The destination scene then calls `warmFaces({ sync: true })` in its own `enter()`, which is
  *also* behind the veil. Blocking there is the cheap option; chunking there is actively wrong,
  because the chunks resolve after `enter()` does and run in the live scene (CONTRACTS trap 4,
  read the other way round — behind the veil is where you *want* the blocking work).

Measured after: Title 61, Select grid 61, Select kid step 61, Clubhouse board 61, Clubhouse
Menagerie 61, Clubhouse Missing Pets 61, run-end victory 61, run-end defeat 61.
(The Menagerie panel first read 39 with a second Playwright process alive — CONTRACTS trap 7 is
real, it re-measured at 61 in isolation.)

---

## 3. `freedCompanions()` — available is not freed

The Title claimed **"4 / 16 MENAGERIE COMPANIONS FREED" on a completely empty `localStorage`**.

There are two different questions and one function was answering both:

```
available — may I take this Companion in?      starters + lifetime rescues
freed     — did I get this one out of that house?          rescues only
```

An earlier round unified them because the Title said "0 / 16" while Select and the Clubhouse said
"4 / 16" on the same save. That *was* a real bug, but it was unified in the wrong direction: it
put a lie on a fresh save and it flattens the counter the whole game is about, because the first
Companion you genuinely free moves it from four to five. The four starters were never in the
house. They live at the clubhouse; that is why you have them.

- `availableCompanions()` — pickability and portrait unlocking.
- `freedCompanions()` — the score. Fresh save: **0**.
- `starterCount()` — how many starters are not also rescues, for the clarifying line.

The clarifier is added everywhere the count appears rather than the count being fudged:
Title footer `0 / 16 Menagerie Companions freed · 4 already at the clubhouse`; Select grid
`0 / 16 FREED · 4 already with you`; Clubhouse Menagerie `0 / 16 freed / 4 already with us`, and
a starter's roster caption now reads "never in the house" instead of borrowing a rescue's title.

**Note for meta-run:** `scenes/event.js` also calls `freedCompanions(this.run.rescued)` for the
rescue door's `free · N of 16`. That number now excludes the starters too. I believe that is the
correct reading of that line — it is counting freeings — but it is your screen, so flagging it.

---

## 4. Also fixed on the way past

- **Every clue on the investigation board was stacked in the top-left corner under the
  polaroids.** `clubhouse.css` renamed `.note` to `.ch-note` to get out of another scene's way
  and `clubhouse.js` was not updated, so all five notes lost `position: absolute`. Exactly the
  `.rs-door` class of failure the scene-css gate exists for, one level down: same name, different
  *file kind*. Nothing in the gate can see a JS/CSS class drift — worth someone's round.
- **Two half-empty screens I own.**
  - Select's Kid dossier had a small 288×320 portrait pinned top-left with ~380 px of empty black
    under it. The portrait now runs the full height of the panel and the info column uses
    `space-between`. A tall shot of one kid alone in a dark corridor is also a better picture.
  - The Clubhouse Missing Pets grid was a row of small horizontal cards over ~440 px of empty
    board. It is now four across by two down, rows sharing the panel height, the photograph
    leading each card at full width with the kid looking for them inset over its corner.
- **`.kidpf` / `.petpic` were declared with conflicting `height` in three scene sheets** — the
  scene-css gate caught it immediately. Their geometry now lives only in `ui/portrait.css`; a
  scene sizes the *container* (or gives it an `aspect-ratio`) and never touches the shared class's
  layout again. Filters and `object-position` per frame are fine; neither is layout.
- `tests/faces/index.html` — a contact sheet of all sixteen at review size next to the painted
  Companion portraits, so the next reviewer does not have to click through three screens.
  Dev only; nothing in the game links to it.

## Protected, and verified in the screenshots

The corkboard, the string lights, the red yarn, *"too many pets. same house. not a coincidence."*,
the lit candle on victory and the extinguished one on defeat, and every word of the run-end prose
are untouched. Only the pictures changed.

## Gates

`tests/seams/check.py` — 1607 call sites, **0 problems**.
`tests/scene-css/check.py` — 822 classes, **0 conflicts**.
`tests/run/run.py` — 50 runs, **0 errors**; determinism 5/5, resume 3/3, mid-fight 3/3.

## Deviations from the design doc

`KID_CODEX` in `select.js` already had it right and the art follows it, not `data/schema.js`'s
coarser `petKind`: Orbit is a black cat (not a parrot), Pepper a green-cheek conure (not a dog),
Sprocket a black-and-white fancy rat (not a ferret), Pixel a leopard gecko (not a cat), Mooncake a
Syrian hamster (not a cat). Eight species, no duplicates, and the poster text already said so.
`schema.js` is not mine; someone should reconcile `petKind` with the codex.
