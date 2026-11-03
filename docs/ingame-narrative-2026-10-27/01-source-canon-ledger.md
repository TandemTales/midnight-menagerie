# Midnight Menagerie source and canon ledger

## Follow-up implementation authority and new authored decisions

The later user instruction explicitly authorizes implementation in the game. The audit below remains a historical record of the build before that work. Current executable support and exact text are documented in [10](10-runtime-integration.md) and [11](11-runtime-player-script.md); an old “missing support” entry does not describe the current build.

| Decision or support | Classification after follow-up | Evidence / consequence |
|---|---|---|
| Persistent unknown/found/home pet states, peaceful visits, sanctuary gate, pending ending recovery | Newly implemented; previously missing | `state/narrative.js`, Save v3, Clubhouse and ending UI; isolated real-browser save/reload tests pass |
| Sanctuary resolution and earlier-night replay | Authored implementation choice consistent with developed source possibility; not a newly discovered prior owner decision | No pet must reverse transformation; leaving, staying and returning demonstrated; current reunions persist |
| Collection through small passages, moss openings, carried calls and an animated empty coat | New authored present-day explanations | Eight `PET_DISCOVERIES` with open-route variants pay off opening traces; no founder, dead family or unrelated villain introduced |
| Three optional evidence cases and seventeen guardian aftermath choices | Newly authored and implemented participation | Comparisons require observed checks, not a guessed answer; only chosen aftermath recorded; no combat rebalance |
| Six-wing variable route, cards/resources/Companion rescue dispatch | Existing implementation retained | Actual Run and CombatEngine contracts; prose cannot award an extra rescue or win a battle |
| Maya's forearm crutches; eight child/pet pairs; pets distinct from Companions | Established brief preserved | No disability joke, cure or pet-loss timer; ambiguous pet pronouns avoided |
| Network dialogue synchronization, bespoke animation, human comprehension testing | Still unsupported or untested as specified | Local optional narrative and reliable ending fallback exist; no synchronized blocking party choice or new animation claimed |

Final fresh runtime review: 91/100, all categories at least 80%, no mandatory editorial finding remaining. This is an AI review, not a child/family playtest.

## Diagnosis

The strong story already present in the detailed design is about animals receiving real care without being allowed to leave. The playable build has a robust deckbuilding expedition structure and much thinner narrative persistence. The writing must join those two facts without claiming that a proposed pet campaign already works.

Three repairs govern this package: remove transformation panic as a deadline; make discoveries understandable in any middle-wing order; distinguish meeting a pet, opening a route out, and saving that pet's home status. The comedy comes from residents trying to help in wonderfully wrong ways, with enough concrete animal behavior to keep the story from becoming a lecture about rules.

## Source authority and access

The current user brief is the latest explicit decision for this assignment. `CONTRACTS.md` designates `docs/design/` as the design source of truth. Explicit designer corrections recorded in schema comments and dated notes outrank conflicting older prose on the specific matter corrected. A newer file timestamp or assistant summary is not itself a designer decision. Implementation establishes what the build can do, not what its contradictory story text ought to canonize.

| ID | Source inspected | Authority and limit |
|---|---|---|
| U | Current in-game narrative commission | Replaces the television adaptation workflow; authorizes separate writing only |
| S01 | `CONTRACTS.md` | Source, deterministic state, accessibility and ownership contracts |
| S02 | `docs/design/00-core-overview.md` and `01-mansion-structure.md` | Premise, architecture, older progression proposals; not every statement is final |
| S03 | `docs/design/kids/01-maya-orbit.md` through `08-kid-08.md` | Detailed individual investigations; Samir's introduction also appears at the end of Lena's file; shared rescue rules at the end of file 08 |
| S04 | `docs/design/companions/` sixteen chapters | Companion identities and mechanical fantasies; Crinkle explicitly reconstructed and later designer accepted |
| S05 | `docs/design/regions/01-foyer.md` through `17-heart.md` | Named rooms, residents, boss beliefs, developed sanctuary ending; precise founding incident remains unresolved |
| S06 | `game/src/data/schema.js`, `data/bosses/`, `data/enemies/`, `data/encounters.js` | Current identities, terms, boss roster and executable encounters |
| S07 | `game/src/state/run.js`, `mapgen.js`, `floorplan.js` | Current routes, rescue dispatch, votes, generic clues, run serialization |
| S08 | `game/src/core/save.js` | Save version 2, persistent fields and migration behavior |
| S09 | `game/src/scenes/tutorial.js`, `ui/coach.js`, combat scene and input code | Existing opening, live practice Scuffle, coach and actual controls; detailed audit in section 03 |
| S10 | `game/src/data/events.js`, `scenes/event.js` | Authored prose and choice outcomes; gear gates, risk/reward disclosure, rescue screen |
| S11 | `scenes/select.js`, `clubhouse.js`, `gameover.js` | Dossiers, persistent displays and misleading victory pet-home fallback |
| S12 | Notes dated August 25, September 6–7 and September 12, 2026 | Samir/pronoun correction, opening/route decisions, Greenhouse boss correction |
| S13 | Accessible chats “Research current game story” and “Write Midnight Menagerie Season One” | Prior audit and adaptation context read through chat tools. The former is assistant research, not independent canon; the latter requested a show and produced a partial architecture |
| S14 | `docs/season-one-gauntlet/batch-01/01-source-ledger.md` and related index | Useful conflict index; TV traversal, added gags and scores are not imported as final game canon |

This is a targeted primary-source audit, including code reads by the writing agents. It is not a claim that all 47,000 source paragraphs, all historical chats or all cloud documents were read. The extracted design chapters preserve their original document source ranges. The old `.docx` originals remain untouched. No newly supplied synopsis or visible Page was available; the open-Page context was null. Recent accessible project chats were inspected; no inaccessible conversation is treated as evidence. No public-web comparison research was needed to write original scenes.

## Established canon and developed material

| Item | Classification | Writing rule |
|---|---|---|
| Eight kids seek their eight missing pets | Established; U/S02/S03/S06 | Search is personal; no trick-or-treat motivation |
| House offers genuine shelter, food and care but prevents departure | Established premise | Show both help and harm concretely |
| Keeper embodies protective instinct | Established; S05 Heart | No unrelated puppet-master reveal |
| Sixteen Companions differ from eight missing pets | Established | No reunion unlocks an extra pet deck |
| Transformation does not erase identity or require reversal | Established direction; U/S03 shared rules | Never call a transformed pet ruined |
| Maya uses forearm crutches | Established | No cure plot, joke target, inaccessible mandatory action or required companion assistance |
| Pet adaptations and identifying signals | Developed detailed design | Use them as recognition, not an automatic translation of animal thoughts |
| Pet reunion before Keeper, permanent found state, no combat escort | Developed design; not implemented campaign | Explicit proposal conditions in sections 06–08 |
| Sanctuary with stay, leave and return | Strongly developed possible ending | Selected provisionally for this complete script; not falsely called user-final |
| Exact origin event, founder, deceased family, resident ghost biographies | Unresolved | No invented historical answer |
| Every Companion was an ordinary pet | Broad premise with specific exceptions | Mopsy is an animated stuffed rabbit in her detailed chapter; avoid universal spoken claim |

## Conflicts and provisional choices

| Conflict | Evidence | Choice in this package |
|---|---|---|
| Halloween, candy and old starter roster | Overview and older scaffolding versus later designs/build | Missing-pet premise; Buttons currency; Marmalade first partner |
| Linear seventeen-floor campaign versus chosen wings | Older regional gating versus explicit September 7 owner decision/current run code | Six-wing expedition, middle wings in chosen order, Heart culmination; no mandatory all-boss gate |
| Mateo pronouns | Old biography he/him versus designer-authoritative schema | They/them |
| Eli pronouns and identity | Old biography they/them/nonbinary versus authoritative he/him | He/him. Do not infer a changed gender identity from pronouns |
| Jordan pronouns | Older ambiguity versus schema | He/him |
| Samir versus Lucy/Biscuit scaffolding | August 25 explicit correction | Samir Haddad/Bean |
| Ages | Detailed bios versus select cards | Bio ages provisional: Maya 13, Mateo 12, Amina 13, Eli 12, Priya 14, Jordan 13, Lena 11, Samir 12. Avoid stating ages in dialogue. Audience 7–10 does not de-age the cast |
| Mochi/Pixel pronouns | Detailed bios he/him versus UI she | Prefer pet names in new scenes; detailed-bio he/him only where unavoidable, flagged for owner |
| Disappearance details | Maya closed-house UI versus detailed collar trail; Amina moving-house UI versus moss refuge | Use detailed investigation clues without retelling contradicted departure incidents as settled facts |
| Pudding/Mossbit region assignment | Older region narrative versus current schema | Current executable assignment informs native roster; dynamic held-Companion result always wins. No script assumes a fixed rescue |
| Greenhouse boss | Old Head Gardener versus September 12 correction/current boss file | Carnivorous Conservatory; Head Gardener remains a Big Scare |
| Exact fifty-year stay and seven missing pets | Existing tutorial prose | Remove ungrounded date; eight is the roster count, selected child's goal remains personal |
| Timed transformation danger | Old overview urgency versus later shared rules/current brief | No irreversible timers or fail-count loss; no “before it is too late” copy |
| Television additions | Prior eight-episode architecture | Do not canonize its named inventions or require its order |

## Implementation ledger

| Feature | Verified state | Narrative implication |
|---|---|---|
| Seventeen region catalogs; boss encounters | Implemented | Every current region/boss receives a full package |
| Six-wing expeditions | Implemented default | One run does not visit all regions |
| First Foyer entry; later entry selection | `canChooseEntry()` checks persistent Foyer clear | Do not confuse surveying with clearing. Later starting choices are constrained by actual UI/route logic |
| Kid plus selected Companion; co-op seats and votes | Implemented | Never stage all eight kids as physically present in a solo run; never say “you chose” after a split vote unless true for that seat |
| Companion liberation | `rescueCompanion`, `held`, `freedRoster`, `companionsFreed`; end/save code | A wing frees its actual promised captive once. `rescued` is lifetime-seeded; `companionsFreed` is this run. Do not announce a native captive after substitution |
| Blueprint surveyed/cleared | Separate persistent arrays and writers | Revisit can acknowledge actual prior boss clear |
| Generic clue gain | `addClues()` increments run counters and emits `run:clue` | It does not record authored evidence identity or kid knowledge |
| `Save.data.clues` and `petsRescued` | Fields exist; no campaign writer found by project-wide JS search | Fields alone do not implement investigations or reunion persistence |
| Gameover pet-home result | `gameover.js:273` falls back to a seeded 35% victory chance | Misleading claim risk. Recommend removal/replacement; untouched in this writing task |
| Opening, practice battle and coach | Implemented; no normal replay-opening link located | Text replacement is low-complexity integration; added step gating/help entry needs engineering |
| Curiosity prose/choice outcomes | Implemented | Suitable existing carrier for most optional written material; new content still needs wiring |
| Boss `c.say` events | `engine.say` emits `EV.LOG`; no player-visible consumer found in audited scene code | Authored hook exists, display support is missing/unverified. New barks require a renderer; never put essential facts only there |
| Persistent evidence journal, party knowledge, reunion ward guarantee, staged cutscenes, sanctuary state | Missing support for this script | Proposed in section 08; no implementation or test claim |

## Consequential decisions to resolve before integration

Adopt or revise the sanctuary resolution; approve the found/home persistence model and how saves synchronize in multiplayer; approve mandatory Heart evidence/reunion insertion; reconcile pet pronouns and biography ages; decide whether post-sanctuary Scuffles are explicitly agreed practice or remain unresolved defensive echoes. This package writes both pre-sanctuary and clearly labeled practice variants. None of these decisions is silently made into deployed behavior.
