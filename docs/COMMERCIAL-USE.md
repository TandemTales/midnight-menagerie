# Commercial use: what ships, who owns it, what is still open

Audited **2026-08-30**. Every claim here was measured against the files in this
repo, not taken from a summary. Where something could not be established from the
repo, it says so rather than guessing.

**One item can stop the launch and only the owner can settle it: [the Suno
subscription question](#the-one-that-can-stop-the-launch).**

---

## What was fixed in this pass

Before today the repository contained **no LICENSE, NOTICE, COPYING or OFL file
of any kind** — verified by a repo-wide `find`. Three.js and three OFL fonts were
being redistributed with no licence text, which is a straightforward breach of
both licences.

| Now shipping | Covers |
|---|---|
| `game/vendor/LICENSE` | three.js r169, MIT — the bundle *and* the 11 unheadered `jsm/` addons |
| `game/assets/fonts/OFL.txt` | Cinzel, Grenze, Rye — SIL OFL 1.1, all three copyright lines |
| `THIRD-PARTY-NOTICES.md` | the human-readable index |
| `tools/fetch_licences.py` | regenerates both from upstream; `--check` diffs them |
| `tests/licences/check.py` | the gate — fails if a dependency appears with no entry |

Both licence texts were **downloaded from the authoritative source**, not typed
out. A licence retyped from memory with a clause dropped is not the licence, and
Cinzel proved the point: a search result said the copyright line was "2012
Natanael Gama" and the real upstream line is "2020 The Cinzel Project Authors".

**These files must be in the Steam depot.** Both licences require the notice to
travel with the work. Excluding them as "development files" during packaging
re-creates exactly the breach this pass closed.

---

## Inventory: everything in the build that someone else made

| Thing | Count | Terms | Status |
|---|---|---|---|
| three.js r169 + jsm addons | 12 files | MIT | ✅ notice shipping |
| Cinzel / Grenze / Rye | 10 `.woff2` | OFL 1.1 | ✅ notice shipping |
| Music | 10 `.mp3` | Suno — **conditional** | ⚠️ see below |
| Images | 106 shipped | OpenAI — user owns output | ✅ clean |
| Sound effects | 0 files | n/a | ✅ synthesised in code |

Sound effects are worth stating explicitly because their absence is the good
news: `game/src/audio/sfx.js` opens *"There are no sound files in this game.
Every cue below is synthesised at play."* 45 cue families from oscillators and
noise. Nothing sampled, nothing licensed, nothing to clear.

---

## AI-generated content: the evidence

### Music — signed, verifiable, and it ships that way

All ten tracks in `game/assets/audio/` carry a **cryptographically signed C2PA
manifest**. Extracted from the bytes:

```
claim_generator_info   name "Suno", version "chirp-fenix-t4-haddock-h-t02"
digitalSourceType      http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia
com.suno.provenance    providerName "Suno, Inc.", systemName "Suno"
signature chain        Suno Inc → Suno C2PA Root CA, valid 2026-07-23 → 2028-10-25
```

Per-track generation timestamps, which are the ones that matter:

| Track | Generated (UTC) | | Track | Generated (UTC) |
|---|---|---|---|---|
| 001 | 2026-08-14 03:19:04 | | 006 | 2026-08-14 03:28:27 |
| 002 | 2026-08-14 03:14:58 | | 007 | 2026-08-15 01:58:46 |
| 003 | 2026-08-15 02:12:16 | | 008 | 2026-08-15 02:08:38 |
| 004 | 2026-08-15 02:22:20 | | 009 | 2026-08-15 02:08:38 |
| 005 | 2026-08-15 02:00:11 | | 010 | 2026-08-15 02:23:40 |

**Two dates: 14 and 15 August 2026.** The account string `jaroxby` is embedded in
every file. The manifests are intact in the shipped copies — this is not a case
where processing stripped them, so **anyone who downloads the game can verify the
origin with a public C2PA tool.**

### Images — generated, but the manifests do *not* ship

| Directory | Images | Carrying C2PA |
|---|---|---|
| `game/assets/` — **what ships** | 106 | **0** |
| `art/` — source | 46 | 22 |
| `UI/` — source | 4 | 3 |
| `rooms/` — source | 1 | 1 |

The 26 source images carry OpenAI `gpt-image` manifests with
`trainedAlgorithmicMedia`. The shipped derivatives carry none: the `tools/prep_*`
pipeline re-encodes and the C2PA chain does not survive it.

**This does not reduce the disclosure obligation.** Valve's requirement is about
what the content *is*, not about whether anyone can prove it. It is recorded here
because the two cases genuinely differ, and because an earlier audit claimed the
image origin was "externally provable by anyone who checks" — for the shipped
images, it is not.

*Not established:* whether OpenAI's invisible watermark survives the re-encode.
That needs their detector; it cannot be answered from these files. Assume it may.

---

## The one that can stop the launch

**Suno grants commercial rights only for output generated while subscribed.**
From Suno's Terms of Use: Suno assigns rights to output generated from your
submissions *"during the term of your paid-tier subscription"*. Free and Basic
tier output is restricted to *"lawful, internal, personal and non-commercial
purposes"*, with mandatory attribution to Suno.

So the question is narrow and factual:

> **Was the `jaroxby` Suno account on a paid tier on 14 and 15 August 2026?**

* **Yes** → the soundtrack ships. Save the subscription receipts alongside the
  ten content IDs (in the table above and in the manifests) and keep them with
  the build records. That is the evidence if it is ever queried.
* **No** → **48.5 MB of the build cannot ship** and the soundtrack must be
  re-generated under a paid subscription or replaced. Every track is
  individually timestamped and signed, so this is not a risk that can be
  quietly carried.

Nothing in this repository can answer it. Check the billing history on the
account and settle it before the store page exists.

By contrast, **the images are clean**: OpenAI assigns output ownership to the
user with no subscription condition, and commercial use is permitted.

---

## Steamworks answers

Fill these in on the partner site once the App ID exists. They are the honest
answers to the questions Valve actually asks.

**AI content disclosure — Pre-Generated: YES.**

> Some art and music in this game were created with the help of AI tools during
> development. All in-game images were generated with OpenAI's image model and
> hand-edited; the ten soundtrack pieces were generated with Suno. All gameplay,
> code, writing, card design and sound effects are human-authored, and the sound
> effects are synthesised procedurally at runtime rather than recorded.

**AI content disclosure — Live-Generated: NO.** Nothing is generated at runtime.
The only network call in the entire build is a local `fetch` for a blueprint
JSON; there is no model, no API key and no inference anywhere in `game/src`.

**Age rating.** Nothing in the repo has ever mentioned ESRB, PEGI or IARC.
Expect **E10+ / PEGI 7** for mild fear themes. The content is gentle by design —
defeat is non-lethal, health is "Courage", there is no violence vocabulary — but
answer honestly about the premise, which is children held in a house that
confuses protecting someone with keeping them.

**Privacy policy: not required today.** Verified: nothing leaves the machine.
Saves are local, there is no telemetry, no analytics and no account. **Revisit
the day Steam P2P lands** — networked play changes the answer, and a privacy
policy that appears after launch is a worse look than one that was there.

**EULA: none exists.** Steam's default Subscriber Agreement covers a game with
no custom terms, which is the normal choice for a game this size. A custom EULA
is only needed if you want terms Valve's does not give you.

---

## What the depot must and must not contain

There is no packaging step yet, so this is a note for whoever writes one. Getting
it wrong in either direction has a cost.

**Must be IN.** `game/vendor/LICENSE` and `game/assets/fonts/OFL.txt`. Both
licences require the notice to travel with the work, so dropping them as
"development files" re-creates the breach this pass closed. They are 6.5 KB
between them.

**Must be OUT**, and none of it is currently excluded by anything:

| Path | Size | Why |
|---|---|---|
| `art/`, `UI/`, `rooms/` | ~67 MB | source images, 26 of them still carrying C2PA manifests; `game/assets/` holds the shipped derivatives |
| `tests/` | — | full HTML harnesses that import game source |
| `tools/` | — | dev scripts, including the dev server |
| `docs/`, `*.md`, `*.docx` | — | design and handoff material |
| `shots/` | 4253 files | screenshots, already gitignored |

That is roughly **67 MB of source art in a build whose shipped assets are
38 MB** — the depot would be nearly three times the size it needs to be, and it
would ship the unprocessed originals.

---

## Still open, and owned by a person rather than a file

1. **The Suno subscription question above.** Highest priority; it is the only
   item that can invalidate work already done.
2. **Replace the copyright holder placeholder.** `THIRD-PARTY-NOTICES.md` says
   "the Midnight Menagerie authors". That is not a rights holder. Put the legal
   name or entity there before the store page goes up.
3. **Confirm the depot includes the notice files.** They are worthless in git if
   packaging drops them.
4. **Credits.** Now names the tools, the fonts and the licences in-game. Add the
   human names when you know whose they are — the file is
   `game/src/scenes/title.js`.
