# Midnight Menagerie editorial review history

## Actual six-wing playthrough: current fresh review 90/100

The October 28 round used a real UI-operated campaign, with the successful Foyer → Attic → Kitchens → Greenhouse → Kennels → Heart route, Orbit's homecoming and seven subsequent peaceful visits recorded in the [playthrough report](reviews/six-wing-playthrough/README.md). All eight pets stayed home after reload. An earlier defeat and an operator-interrupted attempt remain documented. No campaign progress, health or victories were injected. The separate repair fixtures are explicitly labeled.

The [fresh editorial reviewer](reviews/six-wing-playthrough/fresh-editorial-round.md) began without the writer's defenses or earlier scores. Its actual assessments progressed **86 → 88 → 90**, then held **90** after reading the completed ending and reload evidence. Revisions replaced repetitive fort captions with forty-eight creature-specific beats, surfaced free conversations, and gave Attic/Greenhouse/Kennels choices different observations and outcomes. Additional live findings prompted clue/explanation cuts, more accurate event rewards and replay wording, and concrete input/display/save-route fixes. The original run exposed a missing final Companion introduction and misleading result counters; the report does not rewrite that run as a clean pass.

Current categories: character **14/15**, humor **18/20**, tutorial **14/15**, mystery **13/15**, gameplay agency **13/15**, pacing/replay **9/10**, canon/state **5/5**, age/accessibility **4/5**. Every category reaches 80%. No mandatory narrative defect remained in the closing review. Optional later-wing investigation variety, convergent promises, long multi-Kid finales and unmeasured child comprehension remain limitations. The earlier 91 was a different review on different evidence; it is not averaged with or substituted for this score.

## Earlier implemented follow-up: historical fresh review 91/100

The earlier manuscript history below is preserved. It is superseded for runtime status by three fresh independent AI reviews and actual source revisions:

| Round | Score | Substantive response |
|---|---:|---|
| [Runtime 1](reviews/fresh-runtime-round1.md) | 84 | Three testable cases, selective guardian response, sixteen solo check-ins, categorized Help, voice and event-risk corrections |
| [Runtime 2](reviews/fresh-runtime-round2.md) | 82 | Seventeen playable three-choice aftermaths; eight concrete disappearance payoffs and open-route versions; three-choice gate; tutorial resource split; remove identity-answer punishment from Mended Thing |
| [Runtime 3](reviews/fresh-runtime-round3.md) | **91** | Fresh all-game review; early Pixel/Bean traces made indirect, Cat Flap reward corrected; reviewer verified repairs. Spoon and goodbye-wave staging then fixed; kitchen branch reveals a mouse chef. Reviewer rechecked these changes and retained 91 |

Final categories: character 14/15; humor 18/20; tutorial 14/15; mystery 14/15; agency 12/15; pacing 9/10; canon 5/5; accessibility 5/5. Every category meets 80%. No mandatory editorial finding remains. Convergent aftermath structure and long multi-Kid endings remain minor craft limitations; they are not represented as solved by a score.

Verification completed after the fresh review: latest real-browser ending/reload/all-eight-home suite passed with no page errors, alongside 22 state/save checks. Separate suites passed all 17 boss aftermath routes, all three investigations and 13 tutorial groups. Syntax, duplicate-key and bus-name checks passed (179 files; zero duplicate keys/dead subscriptions). Narrative and investigation screenshots were inspected. The reviewer’s historical “ending pending” statement reflects the time of that review; subsequent result is in `reviews/runtime-tests/result.json`. No human playtest, full naturally played campaign, physical controller, screen reader or real network transport testing is claimed.

Current engineering and unresolved scope are in [section 10](10-runtime-integration.md); the regenerated exact executable script is in [section 11](11-runtime-player-script.md). Sanctuary/replay/collection mechanisms are explicit authored implementation choices, not assertions of previously finalized source canon. Earlier writing-only and missing-engineering statements below are historical.

## What was reviewed

This is an agent editorial gauntlet, not a human panel, audience research or playtest. Three specialist agents audited and wrote separate sections; they then reviewed one another's work. A fourth, fresh agent read the complete manuscript and relevant code without prior reviews, scores or writer defenses. The primary writer revised the actual files in response. Same-author passes are identified as self-editorial, never counted as independent people.

The coverage is full written scenes for all 17 current region/boss packages, the opening/tutorial, eight pet investigations/reunions/home variants, sixteen Companion three-beat arcs, eight relationship exchanges, service dialogue, and endings with replay/state variants. Runtime integration, visual layout testing and child comprehension testing remain unperformed. Scores judge manuscript quality and design coherence, not whether the game already implements it.

## Role coverage

| Role | Actual reviewer work |
|---|---|
| Narrative direction | Primary architecture passes; both region agents' independent architecture critiques; fresh whole-game review |
| Onboarding | Tutorial specialist's source audit/two passes; levels-a independent tutorial critique and regression |
| Characters and relationships | Levels-a architecture/Companion review; tutorial review of pet reunions; fresh integration |
| Comedy | Both region packages' distinct comedy passes; primary motif repair; fresh reviewer identifies repeated moral pattern |
| Mystery | Levels-b clue/fallback passes; cross-region critique; primary evidence repair; fresh inquiry-versus-explanation review |
| Children's/family tone | Tutorial and levels-b passes; explicit quiet reunion pages; no death biographies/animal distress jokes |
| Gameplay state and continuity | All specialists inspected actual source; primary unified state map; fresh source checks |
| Accessibility and readability | Tutorial input/display-source audit, caption/manual-page contracts, cross-review; no measured UI fit claim |
| Animation/staging feasibility | Caption fallback for every action, no new animation dependency; region staging passes |
| Adversarial player experience | Skip-all, altered route, absent speaker, mixed progress, save failure, early sanctuary and repeated boss paths reviewed on paper |

## Substantive rounds and actual changes

### Architecture

Round 1: three separate critiques of the initial bible. High issues: unconditional captive-pet finale, player beliefs assigned without choice, weighted party vote treated as consensus, unresolved repeat guardian behavior. Revisions: unknown/found/home branches, questions rather than forced beliefs, factual route-result language, local promises versus global sanctuary, explicit remembered expeditions. Medium changes: exact seen/clue semantics, read-time consistency, optional relationship scenes and no duplicated opening anecdotes. Snapshot: `reviews/architecture/architecture-v1.md`.

Round 2: independent rechecks identified a deeper campaign dead-end—sanctuary after the first pet would leave later combat as memories and strand the other seven searches. Revisions: exact present-day END-10/10A visits and all eight PET-S scripts, separate remembered combat, no new pet homes from memory, optional Companion invitations. Profile ownership and post-home introductions were made explicit. Snapshot: `reviews/architecture/architecture-v2.md` records the intermediate architecture rather than erasing the problem.

Fresh integration round: the reviewer tested the combined written paths. Revisions: actual `run.kids` API, explicit mixed-sanctuary policy, distinct skipped/unknown/home result branches, exact post-sanctuary full/return scripts rather than generic substitution, and preservation of local guardian promises. The fresh review file retains findings and final assessment independently.

### Opening and tutorial

Round 1 self-editorial: shortened the pre-play lecture, filtered the coached actor, kept the prologue out of real Run state, separated prologue retry from expedition loss, replaced a generic child voice, and supplied honest help fallback.

Round 2 self-editorial: corrected combat-only Snack use; added Lives versus attempts, discard/reshuffle and relevant Haunt explanation; taught Arrow Down cancellation; checked the real Haunt hook and All Nine restoration instead of relying only on broad glossary text.

Independent round 3: levels-a caught Marmalade being asserted after skip-to-normal-selection, Mooncake knowledge leaking from a later clue, and too many acknowledgement steps. The author revised to three inspect/select/play prompts with optional expanded help, generic selected-Companion recap and earlier-knowledge-safe opening. Independent regression found those targeted issues repaired. Snapshots v1–v4 and critiques are in `reviews/tutorial/`; independent critique/regression are in `reviews/levels-a/`.

### Each region 01 through 08

| Region | First substantial critique and repair | Second substantial critique and repair |
|---|---|---|
| Foyer | Correct boss hook and truthful local aftermath/actual captive dispatch | Short repeat and concrete request list; no global rescue implied |
| Nursery | Separate local mending preference from global liberation | Duster-hat payoff stays specific; repeats preserve local choice |
| Sleeping Quarters | Restore control of hiding place without identifying an unseen pet | Short aftermath/repeat; fresh integration further removes renewed “nobody leaving” contradiction |
| Kitchens | Keep food acceptance separate from permission to stay | Plain-spoon callback and corrected record replace another generic freedom speech |
| Greenhouse | Current Conservatory boss, not old Head Gardener; actual battle events | Return clue made concrete; local canopy opening preserved on repeat |
| Graveyard | Boss encounter no longer assumes optional WENT HOME clue was seen | Show visible evidence in required scene; memorial humor separated from grief |
| Study | Mechanics/phase sites checked; no obligatory Companion presence | Filing-specific joke replaces generic feelings joke; primary later leaves inference to player |
| Attic | Actual prediction outcome variants mutually exclusive | Read-time correction, specific uncertainty payoff, no fake chosen player action |

The actual round tables, issues and author responses are `reviews/levels-a/round-1.md` and `round-2.md`. V1–V3 snapshots are preserved. Round 2 incorporates the tutorial agent's fresh cross-review of all eight. Targeted regressions are in `reviews/tutorial/levels-a-v3-regression.md`. Fresh whole-game fixes are not silently attributed to these earlier passes; they are the later integration work described below.

### Each region 09 through 17

| Region | First substantial critique and repair | Second substantial critique and repair |
|---|---|---|
| Lampworks | Mark battle renderer missing; make lending payoff visible | Replace sign-based opener with lamps chasing one another's shadows |
| Ballroom | Remove authoring conditional from runtime text | Small actual farewell flourish replaces neat sermon |
| Crypt | Add active Bones reaction when present, default understandable alone | Temporary cloth action has no invented inventory reward |
| Hedge Maze | Gardener's practical glove problem replaces universal conversion | Simpler child-readable bench sign and restrained local consequence |
| Secret Passages | Hidden resident shown as small animal with voluntary shutter | Remove belittling reply after animal's quiet choice |
| Bathhouse | Remove gag at threatening water transition | Comfort offered to Puddle Spirit, no fake player reward; later duplicate towel opener replaced |
| Kennels | Room departure separated from missing-pet completion | Toy/box behavior demonstrates care and preference instead of another clipboard |
| Pumpkin Grounds | Repeated four-Tricks bark suppressed, mechanics retained | Frog rejects royal arrangement; no new loss countdown |
| Heart | Open door alone does not prove sanctuary; no automatic pet flag | Require actual outward-and-return demonstration; independent cross-review then condenses duplicate exposition/aftermath |

Detailed records: `reviews/levels-b/round1-structure.md`, `round2-comedy-access.md`, `cross-review-response.md`, `revision-record.md`; draft v1–v4 preserved. The first two are openly self-editorial, followed by independent tutorial cross-review and fresh whole-game review. The Heart's current short handoff is a substantive cross-review repair, not an unreviewed summary replacing a missing scene: full ending is in section 07.

### Investigations and reunions

Round 1 independent tutorial review identified the same yellow button left in a drawer and later supposedly carried, escort acceptance wrongly inferred from eating lettuce, fallback conclusions without evidence, absent multitool assumptions and one player skipping another's first reunion. Repairs: blue discovered button versus carried yellow button; food/transport distinction; eight exact Ward evidence cards; bag in base Eli scene and exact tool/buckle variants; per-seat acknowledgement. Priya's gecko-as-tool joke was softened, though the reviewer acknowledged it could be affectionate rather than harmful.

Round 2 independent recheck found live pet traces could play after the pet was home, Amina's recap could refer to an unseen latch, and Scout's unnamed record lacked identifying evidence. Repairs: unknown-only live clues, visible outside latch, SCOUT label, exact non-Page Bean card. Fresh review required exact sanctuary S scripts for all eight, including already-found returns and optional quiet captions; generic replacement instructions were removed. Snapshots and reviews are in `reviews/reunions/` and `reviews/tutorial/cross-reunions.md`, `reunions-round2.md`.

### Companions and ending

Round 1 independent levels-a/levels-b critiques: post-sanctuary completion dead-end, ambiguous crossed-out NO, false all-home inference, literal sixteen-rescues milestone excluding starter availability, generic B-to-C payoff. Repairs: present-day visit path, RELEASE REFUSED stamp, separate result states, availability milestone without changing rescue counter, specific Companion prop callbacks.

Round 2 independent levels-b recheck: generic sanctuary substitutions missed spoken lock demands, C prerequisites excluded starter and referred to unseen B moments, full reread only offered an isolated final line. Repairs: complete PET-S scripts, C available-set eligibility with prior B or voluntary B-first, full explicit reread, truthful open-gate demonstration recap and read control labelled “Watch them try the open gate.” Mixed-party homeward captions were narrowed to newly reunited pets. These are writing repairs; no behavior was installed.

### Fresh whole game integration

The fresh reviewer read all main sections without earlier scores/defenses and checked relevant code. Its initial concern list included contradictory repeat guardians, engineering notes leaking into runtime recaps, Heart repetition, sanctuary branch holes and overexplained clues. Actual repairs to current files include:

- L03 repeat preserves inside curtain control; L05 repeat preserves the canopy gap. After local resolution, contradicted physical clues are suppressed rather than reset by an invented cause.
- MM15/MM16 recaps use player-facing facts; internal persistence/mechanics cautions moved outside quoted runtime text.
- HEART-EVIDENCE owns care/refusal/identity; MM17 challenge and aftermath are short. Old fallback references were redirected or made optional.
- A concrete identity-continuity card covers a route with no personal reunion scene.
- Every sanctuary reunion uses a complete script; no blocked-door line is inherited by substitution.
- Optional L03/L07/L08/MM14 child lines point to evidence or ask a question instead of immediately pronouncing the answer.
- Shared chronology mismatch gets explicit options; no hidden assumption overwrites a profile's ending.

Final fresh score and remaining findings are recorded in `reviews/fresh-whole-game.md`. No scores from dissimilar section-only reviews are averaged into a whole-game result.

Final integration/polish pass 5: L07-C2 now lets the player uncover the contradictory photograph, and MM13-C2 offers two exact ways to investigate a repeated call/sneeze instead of announcing the answer at once. Absent-speaker alternatives in L03/L08/MM14 now preserve the observational approach. The unconditional Heart continuity recap covers Jordan and every skipped personal route; neutral mixed-memory wrappers avoid claiming a guest already completed the ending. Stale metadata was aligned. The fresh review's 88 score is retained; small post-review wording cleanup is not assigned a fabricated higher score.

## Diagnostic score history

| Review | Score and scope | Limit |
|---|---|---|
| Architecture initial separate reviews | 79 and 80/100 | Architecture only; did not grade unseen completed scripts |
| Architecture second tutorial review | 84/100 | Correctly identified new progression dead-end; not a pass |
| Tutorial v1/v2 | 81 then 84/100 | Same-author diagnostic; revisions required regardless |
| Tutorial v3 author estimate | 89/100 | Not a live learning test or final whole-game score |
| Regions 01–08 author estimate | 88/100 | Regional diagnostic; independent/fresh corrections followed |
| Regions 09–17 round 2 | 69/85 | Tutorial deliberately not scored; do not report this as 85/100 |
| Reunion initial independent review | 84/100 | Section scope; concrete correctness repairs followed |
| Fresh whole-game baseline | 84/100, provisional | Before combined integration repairs; final assessment stored separately |
| Fresh whole-game revised manuscript | **88/100** | All categories at least 80%; 90 target not reached; no remaining high-severity manuscript branch defect found by that reviewer |

### Final weighted assessment

| Category | Score |
|---|---:|
| Character and emotional storytelling | 13 / 15 |
| Humor and comic originality | 17.5 / 20 |
| Tutorial clarity and learning flow | 13.5 / 15 |
| Mystery and fair revelations | 12.5 / 15 |
| Gameplay integration and player agency | 13.5 / 15 |
| Pacing and replay friendliness | 8.5 / 10 |
| Canon, continuity and state correctness | 4.75 / 5 |
| Age suitability, accessibility and readability | 4.75 / 5 |
| Total | **88 / 100** |

The target is missed. The strongest remaining improvements would diversify the repeated guardian-concession structure, replace more labels with behavior, and let more optional discoveries change expectations without a child immediately interpreting them. This manuscript reaches the fifth integrated revision boundary rather than claiming those artistic problems are solved. Complete text coverage is not proof of exceptional comedy or superiority to the requested influences.

## Preserved disagreements and limits

Clarity reviewers wanted explicit moral recaps; comedy/mystery reviewers found repeated conclusions preachy. The resolution keeps one reliable short essential path and makes more optional scenes end on a concrete action/question. This does not prove the repetition is fully solved. The fresh reviewer prefers more discoveries that change expectations rather than seventeen examples of the same care/control theme; that remains a meaningful artistic concern even after targeted cuts.

The sanctuary outcome is a provisional authored choice. The peaceful visit/memory split and conservative mixed-chronology co-op rule are consequential design proposals, not established canon or implemented features. Persistent profile/account behavior, reward rules in memory mode, migration, the missing bark renderer, actual large-text fit and tutorial input arbitration require engineering. Child reading pace, sustained laughter, emotional response and actual tutorial learning require human testing; none is invented here.

## Unresolved owner decisions

1. Final adoption of the sanctuary ending and peaceful-visit/memory presentation.
2. Whether the proposed compressed pet eligibility replaces the developed Heart Search Ready campaign. No current generic clue counter silently becomes that gate.
3. Mixed-chronology co-op campaign support versus the explicit conservative split in section 08; profile/cloud write ownership.
4. Biography ages and Mochi/Pixel pronouns where existing sources conflict. New text minimizes pronoun dependence.
5. Current Pudding/Mossbit narrative-home conflict, though actual held-captive dispatch avoids a false rescue in these scripts.
6. Roster-completion display policy: all sixteen available is distinct from actual rescue count; Marmalade's starter/join story must not invent a rescue credit.
7. Runtime budget for optional full scenes and how to surface reread help. The content can be shortened with supplied recaps; screen fit has not been measured.

No question above prevents delivery of the finished proposed writing. It does prevent treating all proposals as finalized, implemented or tested.
