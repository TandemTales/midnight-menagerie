# Third-party notices

Everything in Midnight Menagerie that someone else owns, and the terms it ships
under. Regenerate the verbatim licence texts with:

```bash
python tools/fetch_licences.py
```

`python tools/fetch_licences.py --check` diffs the committed copies against
upstream without writing. `python tests/licences/check.py` is the gate that
fails if a new dependency appears without an entry here.

---

## Software

### three.js — r169 — MIT

Covers `game/vendor/three.module.js` and all 11 files under `game/vendor/jsm/`
(`postprocessing/`, `shaders/`). The main bundle carries
`SPDX-License-Identifier: MIT` in its own header; **the addons carry no header at
all**, which is why the licence sits beside them as a file.

* Licence text: [`game/vendor/LICENSE`](game/vendor/LICENSE)
* Upstream: <https://github.com/mrdoob/three.js>
* Copyright © 2010-2024 three.js authors

MIT requires the copyright notice and permission notice in "all copies or
substantial portions of the Software". Shipping `game/vendor/LICENSE` inside the
build satisfies that; **it must be included in the Steam depot, not stripped as
a development file.**

---

## Fonts

Three families, ten `.woff2` subsets in `game/assets/fonts/`, all under the
**SIL Open Font License, Version 1.1**. Full text and all three copyright lines:
[`game/assets/fonts/OFL.txt`](game/assets/fonts/OFL.txt).

| Family | Copyright | Used for |
|---|---|---|
| Cinzel | 2020 The Cinzel Project Authors | `--font-display` — headings, card names |
| Grenze | 2019 The Grenze Project Authors (Omnibus-Type) | `--font-body` — rules text, prose |
| Rye | 2011 Sorkin Type Co | display accents |

The OFL's conditions that actually bite here:

* **The licence and copyright must travel with the font files.** `OFL.txt` sits
  in the same directory as the `.woff2` files and must ship in the depot.
* **Reserved Font Names.** The families must not be renamed if modified. These
  are unmodified Google Fonts subsets, so nothing to do.
* **The fonts may not be sold on their own.** Selling a game that contains them
  is fine and is the ordinary case.
* **No advertising clause and no attribution required in-game** — the credits
  entry is courtesy, not obligation.

---

## Audio

**All ten music tracks in `game/assets/audio/` were generated with Suno.** They
are not third-party *licensed* work in the usual sense, but they are third-party
*generated*, and Steam requires them to be disclosed. See
[`docs/COMMERCIAL-USE.md`](docs/COMMERCIAL-USE.md) for the evidence, the exact
generation timestamps, and the one question that only the owner can answer.

**Sound effects are not third-party at all.** `game/src/audio/sfx.js` opens with
"There are no sound files in this game. Every cue below is synthesised at play" —
45 cue families built from oscillators and noise in Web Audio. Nothing sampled,
nothing licensed.

---

## Art

Generated with OpenAI's image model. Same story as the audio: see
[`docs/COMMERCIAL-USE.md`](docs/COMMERCIAL-USE.md).

---

## The game itself

Copyright © 2026 the Midnight Menagerie authors. All rights reserved.

> **Replace that line with the legal name or entity that will hold the
> copyright before the store page goes up.** "The Midnight Menagerie authors" is
> a placeholder, not a rights holder, and it is the name that will appear on the
> Steam page and in any future dispute.

No part of this game's own code, art, text or audio is offered under an open
licence. Nothing here grants a redistribution right to anyone.
