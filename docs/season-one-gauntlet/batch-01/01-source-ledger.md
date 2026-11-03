# Midnight Menagerie — source and continuity ledger

Batch 01. Audit date: 2026-10-27. Prepared by the independent canon audit agent. This is an adaptation working ledger, not a change to game canon or implementation.

## Authority and scope

1. The current user's instruction and attached gauntlet brief govern the assignment: a funny, warm, spooky ensemble series for ages approximately 7–10; all bosses and most mansion areas must have meaningful coverage in a traversal toward the Heart; future cutscene/dialogue reuse matters. Eight approximately 22-minute episodes are the working default, not an excuse for abbreviated scripts.
2. Explicit designer decisions preserved in implementation comments/dated project notes override older scaffolding on the subject they actually address. In particular, `KIDS[].pronouns` is expressly authoritative. A newer file timestamp alone does not establish a new story decision.
3. The detailed personal investigations and region chapters supply developed narrative design. They are not all proven to exist in the playable build.
4. The prior chat titled “Research current game story” was inspected by the parent showrunner; it is an earlier assistant audit, not an additional explicit user canon decision. Its conclusions do not independently prove the source facts.
5. The supplied attachment is a production brief at `C:/Users/Josh/.codex/attachments/006eb5b2-f89d-4fe0-8dcd-d0369a800b37/Pasted text.txt`. No separate newly attached synopsis was supplied. Do not claim one was read.

Paths below are relative to the Midnight Menagerie project root. Line references identify the inspected revision; they can drift if source files are changed later. Original files remain untouched.

## Source map

| ID | Source | Use and limitation |
|---|---|---|
| U1 | Current user message and attached production brief | Highest authority for this adaptation and the gauntlet workflow. |
| C1 | `docs/design/00-core-overview.md` | Premise, thematic motivation, companion/pet distinction, older examples and provisional systems. Extract credits `Midnight Menagerie Design.docx` lines 1–691. |
| C2 | `game/src/data/schema.js:415` | Designer-authoritative child pronouns; current names and pet species at lines 424–440. Not proof that every other live field overrides detailed narrative design. |
| C3 | `game/src/scenes/select.js:390` | Current dossier text at lines 403–478; exposes real age, circumstance, and pet-pronoun conflicts. Its own comment says the design document wins for circumstances/player-facing text where these disagree. |
| K1–K7 | `docs/design/kids/01-maya-orbit.md` through `07-lena-mooncake.md` | Detailed personal investigation designs, including identity, identifying pet behavior, regional evidence, reunion and post-rescue scenes. Read opening identity/history sections and relevant cross-cutting rules and later scenes for this audit. Do not represent this pass as a line-by-line review of all approximately 15,000 profile lines. |
| K8 | `docs/design/kids/08-kid-08.md` plus the ending of `07-lena-mooncake.md` | Samir's design is split across two extracts. His identity/personality introduction occurs in the Lena file at line 2175. The eighth file begins in the middle of his discussion. It also contains late shared investigation rules and final dialogue direction. |
| N1 | `docs/notes/2026-08-25-frontend-round-8-the-kids-get-faces-and-the-eighth-is-samir.md` | Explicit account of correcting Lucy/Biscuit scaffolding, current pronouns, and the source of Samir's dossier. |
| N2 | `docs/notes/2026-09-06-the-house-the-opening-and-the-atlas.md:9` | Implemented first-night opening, Marmalade as the sole starting Companion, and blueprint visibility. |
| N3 | `docs/notes/2026-09-07-the-house-opens-and-the-kid-board.md:8` | Explicit owner decision permitting every unwalked non-Heart wing at forks; Foyer required initially, later entry selection. This supersedes restrictive older regional-gating language. |
| R1 | `docs/design/01-mansion-structure.md` | 17 regions, 20 named spaces per region, permanent architecture/current state/manifested links. Stable room identities despite changing routes. |
| R17 | `docs/design/regions/17-heart.md` | Keeper identity, pet reunion before final confrontation, nonlethal victory, continued sanctuary development. |

The showrunner's separate mansion coverage matrix must identify exact bosses, elites, rooms, implemented roster, and proposed episode placements. This ledger does not certify coverage by itself.

## 1. Established facts and binding adaptation constraints

| Fact | Evidence | Writing consequence |
|---|---|---|
| Eight neighborhood kids investigate missing pets; the old Halloween trick-or-treat premise is obsolete. | U1; C1 lines 5–15, 25–49, 388. | Their investigation has a personal purpose; Halloween is not the reason they enter. |
| The House has genuinely cared for animals, but confuses protection with possession. | U1; C1 lines 100–125. | Show real care and real wrongdoing in the same institution; no secret animal-eating scheme. |
| The sixteen supernatural Companions are distinct from the eight recently missing pets. | U1; C1 lines 67–85 and companion roster; K8 lines 2209–2212. | Orbit is not Marmalade; the eight rescues do not produce substitute Companion identities/decks. |
| Rescue does not require making an animal ordinary again. | U1; C1 line 215 onward; K8 lines 2149–2158; R17 lines 980–987. | Transformation is not corruption or an obligatory cure plot. |
| There is no real-time/run-count permanent pet-loss deadline. | U1; K8 lines 2159–2167. | Urgency comes from evidence and emotional stakes, not a countdown that punishes exploring slowly. |
| Maya uses forearm crutches. | U1; K1 lines 42–46, 1407–1418. | Stage access and action thoughtfully; her disability is not a gag, punishment, or cure story. Most of her dialogue concerns other things. |
| Child pronouns are explicitly designer-authoritative in the current schema. | C2 lines 417–440; N1 final pronoun correction discussion. | Use the table below, especially Mateo they/them and Eli he/him. |
| The Keeper is the House's protective instinct embodied, not a separate secret villain. | U1; R17 lines 631–666. | Its choices express the House's error. No reveal that an unrelated mastermind caused everything. |
| First entry is through the Foyer; the Heart remains the culmination. Middle wings are not a mandatory linear campaign order. | N3 lines 8–27, 62–88. | A TV route can preserve architectural progression, but must be labeled an adaptation traversal, not “the one fixed game order.” |
| The House's entities should sound like characters/ghosts; children should speak and act like children. | K8 lines 2338–2339; U1. | Convert bureaucratic design shorthand into performable character speech; avoid eight junior ethics lecturers. |
| No game-file edits, original-source overwrites, publishing, or third-party contact are authorized by this writing assignment. | U1. | Write only new adaptation deliverables. |

## Character identity and working voice table

Pronouns and pet names/species below are from C2 lines 424–440. Ages are the detailed-bio working choice pending the conflict record below. Background labels are source descriptions, not comic premises. Pet he/him usage is the long-investigation working choice where UI copy disagrees; it is not covered by the child-pronoun schema guarantee.

| Child | Pronouns; age working choice | Pet | Source identity/profile | Distinct dramatic/comic foundation |
|---|---|---|---|---|
| Maya Chen | she/her; 13 | Orbit — black domestic cat, white chest patch | K1 lines 42–78; Chinese American; forearm crutches | Practical preparedness and short dry reactions to a building that will not cooperate. Orbit scratches three times, pauses, repeats; rejects cream/wet food in favor of crunchy food. |
| Mateo Alvarez | they/them; 12 | Pepper — green-cheek conure | K2 lines 30–85; Mexican American; round glasses | Excited pattern finder who must distinguish a connection from proof. Pepper's ordinary sounds and “Open the little door” permit fair audio clues. |
| Amina Okafor | she/her; 13 | Mochi — cream lop-eared rabbit | K3 lines 31–78; Nigerian American | Patient observer who understands fear without shaming it. Mochi's gray nose markings, gray front paw, thump pattern, and relaxed “dramatic leg” distinguish genuine comfort from suppression. |
| Eli Rosen | he/him; 12 | Sprocket — black-and-white fancy rat | K4 lines 46–84; Jewish American; rectangular glasses; bio explicitly says nonbinary | Inventive, impatient mechanism-opener. Cleverness must include questioning unfair rules. Sprocket's distinctive markings, nicked ear, stolen screws and sleeve-climbing support recognition. Do not infer that he/him negates a nonbinary identity. |
| Priya Shah | she/her; 14 | Pixel — leopard gecko | K5 lines 59–85; Indian American | Competitive planner who must let reality change the plan. Her desire for excellent care partly resembles the House's, creating conflict without making planning the flaw. |
| Jordan Brooks | he/him; 13 | Scout — beagle mix | K6 lines 45–83; Black American | Generous impulsive volunteer, quick to act and quick to assume blame. Learn limits on obligation, not indifference. Scout has a red collar, crooked tail, white facial stripe and black saddle. |
| Lena Yazzie | she/her; 11 | Mooncake — Syrian hamster | K7 lines 52–85; Diné | Quiet, patient, mischievous evidence collector. Being unobtrusive is not being unimportant; privacy is not erasure. Mooncake is golden cream with white underside and caramel back patch. |
| Samir Haddad | he/him; 12 | Bean — tricolour guinea pig | K7 lines 2175–2195 plus K8 lines 7–61; Arab American | Social and theatrical warmth plus precise questions about what a promise means. Wants others comfortable, fears replacement, learns that sometimes “no” is enough. Bean's brown right-eye patch, food enthusiasm and response to Samir's sing-song “Bean Bean” matter. |

Treat these as foundations, not eight unchanging joke machines. Avoid collapsing Maya, Eli and Samir into the same deadpan voice. Samir's precision can coexist with his original sociability; the implementation note's “not a generic peacemaker” does not require deleting his warmth.

## 2. Developed design, not automatically implemented or season-locked

| Design | Evidence | Adaptation status |
|---|---|---|
| The mansion contains 17 regions and 340 authored named spaces. | R1 opening “Core structural revision.” | Useful stable setting. Showing most regions does not mean claiming to show most of all 340 rooms. |
| A permanent architectural layer, a changing House state, and manifested shortcuts coexist. | R1 “The three connection layers.” | Ground visual transitions in identifiable places, then make impossible joins readable. |
| Each pet has a unique adaptation: Orbit Threshold, Pepper Echo, Mochi Sanctuary, Sprocket Mechanism, Pixel Sunpatch, Scout Beacon, Mooncake Pocket Burrow, Bean Bondlight. | K8 lines 2135–2148. | Potential visual and mystery material; none is interchangeable with a Companion transformation. Do not casually invent the exact stage/time. |
| Each pet's choices reveal a different error in the House's philosophy. | K8 lines 2239–2261 and each profile's opening. | Strong source for character turns, but should emerge through actions rather than eight speeches. |
| Pet reunion normally precedes the Keeper confrontation in the Heart. | R17 lines 961–974. | “Found” and “free to leave” are different story events. The finale should not treat a pet as a reward chest after combat. |
| Found-pet status persists; reunion is not an escort mission, a hidden morality test, or a reward for a prescribed Kid/Companion pairing. | K8 lines 2168–2212. | Useful guardrails for eventual game dialogue extraction; do not build mandatory pairing dependencies into reusable scenes. |
| Keeper victory is nonlethal: the form separates into household materials and the exit opens. | R17 lines 945–960. | A confrontation can be forceful without killing the House. The exact show staging remains a new proposal. |
| Stay / Leave / Return can repair the House into a true sanctuary. | C1 lines 559–567; K8 lines 2262–2286. | Substantial carried-forward ending design. Exact season placement and completeness are not irrevocable canon. |
| Rescued pets keep harmless supernatural traits and appear at home/hub. | K8 lines 2157–2158, 2209–2226; individual post-rescue sections. | Preserve the animal as themselves. Scout must not become a compulsory neighborhood emergency service (K6 lines 1587–1592). |
| Blanket Forts provide chosen temporary shelter. | C1 line 388 onward; K3 lines 615–622. | The healthy counterpart to compulsory safety; good space for intimacy and restrained jokes. |

## 3. Superseded or conflicting sources

| Issue | Competing evidence | Working decision and reason |
|---|---|---|
| Fixed middle-region progression | R1 restrictive routes vs N3 explicit owner decision removing non-Heart wing gates. | Honor N3 for current game facts. Choose and identify a TV traversal based on geography and thematic escalation. Do not invent a canonical mandatory order. |
| Mateo pronouns | Older detailed profile uses he/him and labels “Boy”; C2 expressly says Mateo is they/them. | Use they/them. Do not invent a new gender label from pronouns alone. |
| Eli pronouns | K4 uses they/them, labels nonbinary; C2 expressly sets he/him. | Use he/him; retain nonbinary as developed identity unless superseded by an actual identity decision. These are not inherently incompatible. |
| Ages | K3/K4/K5/K6/K7 give 13/12/14/13/11; C3 lines 421/429/437/445/453 give 11/13/12/12/13. | Use detailed bios provisionally, since UI's own sourcing comment says the design wins and no explicit age-change decision was found. Flag for owner, but do not halt work. |
| Mochi and Pixel pet pronouns | Long bios call both he; C3 lines 422–423 and 439 call them she. | Use long-bio he/him provisionally or pet names in uncertain dialogue. Flag explicitly; child schema pronouns do not settle pet pronouns. |
| Amina disappearance | K3 lines 79–130: supervised outdoor pen, shadow/panic, impossible burrow; C3 line 422: escaped during house move. | Prefer the substantial personal investigation version. No new claim about who/what made the shadow. |
| Maya disappearance | K1 lines 79 onward: Orbit slipped outside, Maya followed, intact collar at property wall; C3 line 406: every door shut. N2 repeats the UI version as implemented opening. | Record the real conflict. Detailed investigation is the adaptation working version; do not claim the shut-house opening never existed or that either is a newer explicit user decision. |
| Eighth child | Old Lucy/Biscuit scaffolding and C1 Lucy/Baxter worked example vs Samir/Bean developed design and N1 implemented correction. | Samir/Bean. Lucy/Baxter is illustrative, not a ninth child. A separate in-world BISCUIT collar clue is not automatically an error (N1 explains this). |
| Timed transformation | C1 lines 86–99 describes a ticking clock; K8 lines 2159–2167 explicitly prohibits permanent pet loss from elapsed play/runs; U1 repeats prohibition. | Emotional narrative urgency only. Transformation follows authored milestones. |
| Starting Companions | C1 lines 208 and 499 propose approximately four; N2 lines 20–27 records Marmalade as the sole starter. | Use Marmalade for first contact if needed, identify broader gathering as TV adaptation. |
| Heart boss name | Older mansion overview says final boss unlocked later; R17 identifies and develops the Keeper. | Keeper is the named final boss. Do not substitute a new mastermind. |
| Mopsy's origin | Core overview broadly describes formerly ordinary animals; `docs/design/companions/10-mopsy.md:6` specifically describes a well-loved stuffed rabbit brought to life. | Preserve Mopsy's present rag-doll identity and the specific stuffed-rabbit design. Do not invent a prior living-rabbit biography or claim the general origin applies identically to every resident. The sixteen remain distinct from the eight missing pets. |
| Mossbit and Pudding home regions | `docs/design/01-mansion-structure.md:258` and `:587`, plus region chapters 06 and 15, place Mossbit in Graveyard and Pudding in Kennels. `game/src/data/schema.js:408` places Pudding in Graveyard and `:411` Mossbit in Kennels. | Use the authored narrative homes for the show; explicitly retain the implementation conflict. No later explicit owner decision settling this swap was found. This is not a game correction. |
| Ghost speech | Several design examples use classification/system language; K8 final notes explicitly requests ghostlike, nonrobotic speech and clear child voices. | Preserve meanings, rewrite delivery as character dialogue. A bureaucracy joke can be occasional; it must not become every guardian's voice. |

## 4. New proposals and required labeling

The following are not established by this audit and must be marked as proposals wherever the showrunner develops them:

- Exact season episode titles, pairings, focus-child distribution, recurring comic motifs, set pieces, jokes and dialogue.
- A particular continuous Foyer-to-Heart TV route through otherwise freely selectable middle wings.
- Compression or merging of boss confrontations; invented connections between guardians; invented history tying them together.
- Which pets are reunited or leave in which episode, and how much of the Stay/Leave/Return resolution season one accomplishes.
- New ghost biographies, founders, former residents, deceased relatives, tragedies, and explanations of how the House first became alive. No definitive founder/tragedy was established in the inspected sources.
- Exact child ages selected from conflicting texts until the owner settles the conflict.
- Whether Companions speak aloud, how much they speak, and a uniform communication convention if the season elects one; card-text personality is not by itself proof of a universal dialogue rule.

## Audit limits and next continuity gate

This is a focused source audit, not a certification that all authored investigation scenes or game content are implemented. It inspected primary identity blocks, premise and late shared rules, relevant dated implementation notes, and the Heart chapter's narrative passages. It did not independently inspect a missing new synopsis, inaccessible historical conversation, every art asset, or every line of each long personal campaign.

For each architecture/script revision, verify: child pronouns; pet species and distinguishing behaviors; no pet/Companion conflation; choice before rescue; access staging for Maya; House care shown concretely; no hidden morality test; recognizable rooms and boss functions; jokes motivated by character rather than identity; and explicit proposal labeling. Record the script/scene locator for each finding. Numeric gauntlet scores apply only to actual supplied work, not this source ledger's ambitions.
