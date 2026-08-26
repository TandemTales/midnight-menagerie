# Frontend round 8 — the kids get faces, and the eighth one is Samir

OWNER: frontend agent. Files: `ui/portrait.js`, `ui/portrait.css`, `ui/petart.js`,
`scenes/{select,clubhouse,gameover,title}.js` + their CSS. Two one-line fixes outside that:
`data/backpack.js` and `combat/dummy.js` (both were the string `lucy`).

Two jobs in one round: wire the eight authored Kid paintings in, and finish renaming the
eighth Kid — who has been "Lucy with a pet called Biscuit" since scaffolding, while the design
doc calls him Samir Haddad, with a guinea pig called Bean, 628 times.

## 1. The Kids are files now, not a generator

The reviewer's line was "The kids have no faces either — one shared body silhouette recoloured
with a hat or glasses, eight times, while the Companions get gorgeous painted portraits." That
was literally what `ui/petart.js` did: `KID_FACES` was eight rows of `{skin, hair, cut, gear,
torchVar, face:{wide,brow,mouth,chin,freckle,eye}}` and `paintKid` / `paintHair` / `paintGear`
rendered them onto one canvas silhouette.

`tools/prep_kid_art.py` has since produced, per Kid:

| file | size | used for |
|---|---|---|
| `assets/kids/<slug>.jpg` | 720x960, 3:4 | the dossier hero |
| `assets/kids/<slug>-thumb.jpg` | 192x192, 1:1 | tiles, rosters, badges |

The new API lives in `ui/portrait.js`, next to `thumbSrc`/`fullSrc`/`heroSrc` where the other
asset paths already are — NOT in `petart.js`, which is a canvas generator and has no business
knowing about files on disk:

```
kidSrc(slug, variant)                     -> the URL
kidImg(slug, {alt, className, variant})   -> <img class="kidpf">, intrinsic size preset
kidPortrait(kid, {w, h, variant})         -> the shape every existing caller already passes
```

`kidPortrait`'s signature is unchanged on purpose — all five call sites pass
`{...kid, petKind}` and a `{w,h}`, and `variant` is the only addition. `w`/`h` stay data
attributes rather than inline styles for the reason the old comment gives: an inline
`height:auto` silently vetoed the select dossier stretching its portrait to panel height.

### The generator is deleted, not disabled

887 lines out of `petart.js`: `KID_FACES`, `kidHue`, `_kidHue`, `KID_W/KID_H`, `paintKid`,
`paintHair`, `paintGear`, `renderKid`, `kidPhoto`, `kidImg`, `KID_KEYS`, the `HAIRCOL` pigment
table, and the Kid half of `warmFaces`. Two systems that can each answer "what does Maya look
like?" is how a screen ends up showing the wrong one; there is now exactly one answer.

`SKIN` stayed — `paintPet` uses it for the out-of-focus thumb in the corner of a pet snapshot.

**The pets stay generated and that is the right call.** There is no authored pet art, and the
framing (a bad flash photograph taken by a frightened child) is something a generator can
genuinely nail. A child's face is not. The header of `petart.js` now says so explicitly so the
next round does not "helpfully" put a Kid pipeline back.

Falling out of that: `--kid-maya … --kid-lucy` in `portrait.css` and `KID_LOOKS` in
`portrait.js` existed only to tint the silhouettes' torch beams. Nothing else read either.
Both gone.

### Where a Kid now appears

| screen | slot | variant |
|---|---|---|
| Select, step 2 | dossier hero, full height of the panel | painting |
| Select, step 2 | the strip of eight | thumb |
| Clubhouse, board | round badge on each pet polaroid (new) | thumb |
| Clubhouse, Missing Pets | round badge on each pet card | thumb |
| Clubhouse, Backpack | the "whose bag" pills (new) | thumb |
| Run end, ledger header | who went in | thumb |

The two new ones are the corkboard badge and the Backpack pills. Both were text-only —
`LENA'S` under a hamster, and eight identical brass lozenges reading MAYA MATEO AMINA… which
is a dropdown, not a roster. The board badge is `aria-hidden`: `.polaroid__sub` already says
the same thing and two of them is screen-reader noise.

`.kid-tile__pf` and `.go-who__kid` moved from `aspect-ratio: 416/462` (the old canvas) to `1`.
`.petcard__kid`'s `object-position: 46% 28%` — a bias that existed to hunt a face out of a
full-body silhouette — is now `50% 50%`, because the thumbnail IS the face, already framed.

The HUD shows a Kid's *name* in one tooltip and no portrait, so there was nothing to wire.

## 2. The eighth Kid

`schema.js` was already fixed by the lead. Everything else was not. Every surviving
`lucy`/`Lucy`/`Biscuit`, and what it was doing:

| where | was | now |
|---|---|---|
| `scenes/select.js` `KID_CODEX` | `lucy: {...}` | `samir: {...}`, rewritten from the doc |
| `scenes/select.js` `PET_SPECIES` | `lucy: 'rodent'` | `samir: 'rodent'` |
| `scenes/select.js` ~1271 | comment "…Lucy's guinea pig" | Samir's |
| `ui/petart.js` `PETS` | `biscuit: { kid: 'lucy' … }` | `bean: { kid: 'samir' … }` |
| `ui/petart.js` | four Biscuit comments | Bean |
| `ui/portrait.js` `KID_LOOKS` | `lucy:` | (table deleted) |
| `ui/portrait.css` | `--kid-lucy` | (ramp deleted) |
| `ui/portrait.js` `petGlyph` doc | "Lucy's guinea pig" | Samir's |
| `data/backpack.js` `KID_LOADOUTS` | `lucy: [...]` | `samir: [...]`, re-authored |
| `combat/dummy.js` | `o.name \|\| 'Lucy'` | `'Samir'` |
| `tests/run/index.html` | `KIDS = [… 'lucy']` | `'samir'` |

**The `PETS` key was a live bug, not just a stale name.** `PET_BY_KID` is built from
`spec.kid`, so with the schema saying `samir` and `petart.js` saying `lucy`, `petPhoto('samir')`
returned `null` — Bean's polaroid on the Clubhouse board rendered as a black rectangle with alt
text in it, and so did his MISSING poster. `shots/base-club.png` has the before.

### Two `biscuit`s that are correctly still there

- `companions/bones.js` — "something that was once a biscuit". A dog and a biscuit.
- `events.js` "The Collar" — a tag reading `BISCUIT` on a stranger's animal, four streets from
  the school, "three animals from the same four streets". This one only *works* if Biscuit is
  not one of the eight, so the rename improved it. Do not grep-and-replace it.

`docs/design/00-core-overview.md` also says "## Lucy / Missing Pet: Baxter / Golden retriever".
That is a verbatim worked example out of the design docx illustrating what a Kid screen shows.
It is source material, not scaffolding residue. Leave it.

### His dossier copy, and where every line came from

Read `docs/design/kids/08-kid-08.md` before touching any of this. Samir is not a generic
peacemaker; he is deadpan, forensically literal, and cross-examines the House rather than
shouting at it. The doc's own best lines are "He ate lettuce. That is not a contract.",
"Food is his entire legal system.", "Relationships are not vitamins." and "More family does not
erase family."

- `species` — "Tricolour guinea pig, brown eye patch". Doc §3: "One brown patch sits around his
  right eye."
- `lost` — "Wandered off during a family party. A cousin saw a tiny man in a red coat." Doc §5:
  the enclosure was left unlatched during a family gathering, and the younger cousin insists he
  saw "A tiny man in a red coat." Nobody believes him. Samir does.
- `note` — "Bean would accept lettuce from a burglar. That is not the same as agreeing to live
  somewhere." Doc §8 and §22, compressed; it is his thesis and his funniest line at once.
- `perk` — **Ask What It Means**: "Every Curiosity adds one option that asks what accepting
  actually costs, and the house has to answer before you choose." Doc §90, verbatim mechanic:
  "Samir receives: Ask what accepting means. This can reveal hidden conditions. The player may
  still accept. The point is informed choice." The old invented perk ("a kind option, and it
  always works") is exactly what §83 forbids — "Samir should not become: The Kid who can talk
  every enemy out of fighting."
- `focus` — "Curiosities, information over loot, reading the terms before you agree to them",
  from §89's list of his Curiosity options.
- Backpack — **Walkie Talkie, Pet Treats, Familiar Toy, Notebook** (2+1+1+1 = 5). §60 makes the
  Walkie-Talkie his Signature Gear; it is what he says "Bean Bean." into.

He is he/him, from `KIDS[].pronouns`, which is the designer's field.

## 3. A hardcoded pronoun found on the way

`select.js pairingNote()` ended `…and ${first} knows what **she** is looking for.` — printed for
all eight. With the designer's current field that is wrong for five of them. It now reads
`k.pronouns` and carries the verb with it (`they are` / `she is`), the same way `gameover.js`
already did. Checked on screen: Mateo's run-end line reads "**They are** working out what to
bring next time."

Rule, restated because it has now been got wrong twice: read `KIDS[].pronouns`. Do not infer
from a name and do not re-derive from the design doc — the doc's possessives are unreliable and
gave the wrong answer for Mateo.

## Verified

`shots/kid-dossier-sheet.png` is the eight dossiers, each cropped to portrait + printed name,
composed into one sheet — Maya Chen, Mateo Alvarez, Amina Okafor, Eli Rosen, Priya Shah, Jordan
Brooks, Lena Yazzie, Samir Haddad, each against the right painting, in the same order as
`shots/lead-kids-sheet.jpg`. `shots/k-faces.png` is the `tests/faces/` contact sheet: eight
pets, eight paintings, eight thumbnails, no broken images, no console errors.

`tests/faces/index.html` now imports `kidImg` from `ui/portrait.js` (it imported `kidImg` and
`KID_KEYS` from `petart.js`) and shows both variants.

- `tests/seams/check.py` — 1607 call sites, **0 problems**
- `tests/scene-css/check.py` — 841 classes, **0 conflicts**
- `tests/run/run.py` — 50 runs, **0 errors** (its KID list now includes `samir`)
- `tests/backpack/run.py` — 77 checks, **0 failures**
- **61 fps** on select, clubhouse (all four panels), run end (win and loss), title. Zero console
  errors on every screenshot in this round.

### One thing that is not mine, measured because it looked like it might be

The map and the *victory* run-end screen measured 35–39 fps. Suspending the AudioContext
(`--steps "js:window.MM.ctx.audio.ac.suspend()"`) and re-measuring the same frame gives **60**
and **61**. The cost is in the audio layer, which another agent is actively working in
(`game/src/audio/**`); nothing in this round runs on the map at all. Flagging, not touching.
Repro:

```
python tools/shot.py x --scene map --wait 4                       # 37-39 fps
python tools/shot.py x --scene map --wait 4 \
  --steps "js:window.MM.ctx.audio.ac.suspend()|wait:2.5"          # 60 fps
```

## Screenshots

| shot | what |
|---|---|
| `shots/kid-dossier-sheet.png` | all eight, named and faced |
| `shots/k-select.png` | Samir's dossier and the strip of eight |
| `shots/k-club.png`, `k-club-zoom.png` | the board with owner badges; Bean's photo restored |
| `shots/k-club-pets.png` | Missing Pets — Bean, tricolour guinea pig, Samir Haddad |
| `shots/k-club-pack.png` | the Backpack roster as eight faces |
| `shots/k-go.png` | run end, Samir + Bean, he/him |
| `shots/k-go-mateo-pet.png` | run end, Mateo, "They are working out…" |
| `shots/k-faces.png` | `tests/faces/` contact sheet |
| `shots/base-*.png` | the before, including Bean's black rectangle |
