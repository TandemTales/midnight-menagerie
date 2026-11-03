# Fresh runtime editorial review — round 1

Reviewed 2026-10-27. Scope: the executable narrative, not the manuscript. I read CONTRACTS.md; all 17 packages in `game/src/data/narrative-regions.js`; all pet, Companion, pair, service and ending content in `narrative-relationships.js`; all Curiosities in `events.js`; tutorial, coach, help, narrative scene, narrative state/router, journal, and relevant Clubhouse/Game Over implementation. I checked Run/schema/select/Companion definitions where claims crossed those seams. I did not consult previous editorial scores or writer defenses.

This is an independent source/editorial review with supplied automated evidence, not a human playtest. I did not launch a browser concurrently. I inspected `runtime-tests/result.json` and both supplied 1280×800 screenshots. The result records 22 state/save/real-Run checks, five UI checks and zero page errors. The integrator reports ten tutorial check groups passing; I did not treat that as observed player comprehension. Additional full-ending/reload/peaceful-visit and investigation-branch checks were still underway when this review was written.

## Findings raised during this review

These findings refer to the actual code encountered, including defects corrected while I was reviewing. Resolved findings are retained so this report does not falsely imply the initial snapshot had none.

| ID / severity | Exact scene or seam; player problem | Required fix and observed status |
|---|---|---|
| F1 — high, mandatory mechanics | `events.js`, House Register / tear advertised “Four Clues” and omitted Courage loss, while Stubborn ink awarded no Clues and cost 8 Courage plus a Curse. Dumbwaiter / send-things advertised a Keepsake but could return Buttons/Clues. Lost and Found / ring promised a Clue that one outcome omitted. The player's advertised bet was false. | Correct option labels against every outcome. **Re-read confirms corrected alternatives/possible gains and explicit relevant costs.** A broader outcome-label pass is present. |
| F2 — medium, mandatory continuity | Priya opening said she packed Pixel's favorite crooked rock; reunion said “I packed the wrong stone” while the favorite rock was already in the House. | Keep one prop history. **Fixed in current opening:** she packed a warm stone and hopes it is right. The reunion now pays that uncertainty off. |
| F3 — medium, mandatory state framing | `narrativeRoute` suppresses map story units for remote sessions, including MEMORY-START. A remote player could enter a post-sanctuary expedition without learning why the House was closed again. | Nonblocking memory/search orientation on an existing screen. **Source now adds a remote-session toolbar context line**, including “An earlier night. Today’s reunions stay safe.” Local MEMORY-START was already adequate. New toolbar layout has not been independently visually checked. |
| F4 — medium, repetitive resolution | `NR-sleeping-quarters-after` and initial `NR-secret-passages-after` both moved an outside-only control within reach, let a paw open a little then close, and ended with the guardian leaving space. Their replay beats repeated the same proof. | Give the Warden a different observable change. **Fixed:** a resident chooses the destination of its speaking-tube call; the Warden stops rebroadcasting it. This preserves agency and gives the region its own action. |
| F5 — medium, inference/interaction | Newly added Foyer clue 2 and Lampworks clue 1 examination choices initially repeated facts already exposed by generic “Look closer.” Extra clicks did not earn new evidence. | Hold the branch-specific fact until the selected examination. **Fixed on re-read:** generic detail now orients the player; following cords/reading the plate and watching the shadow/looking inside glass produce different observations. |
| F6 — medium, state consistency | A freshly available observation could describe a blocked path that the same guardian's completed resolution said was cleared. The old record and a current inspection are different claims. | Preserve archived records but prevent fresh contradictory observations. **Current source uses `beforeResolutionOnly` guards** for selected affected clues. Archived observations explicitly say they were recorded on an earlier look. |
| F7 — medium, mandatory canon | Runtime portrait/dossier and new text disagree about pronouns: Mochi is she/her in `KID_CODEX` but he/him in the opening; Pixel is she in the dossier but his in the opening; Pipkin and Hush use he/him in existing Companion descriptions but she/her in new captions. | Align new copy with established character definitions, including all forms in each opening/caption. Reported to integrator. Final status is recorded below. |

No source edits were made by this reviewer. Suggested fixes were sent to the integrator as findings, and I checked the resulting text where marked fixed.

## Architecture, tutorial and relationships

The story now has a workable runtime home: real scene-boundary routing, named save state, per-run encounter markers, replay variants, party filtering, explicit found/home progression, and a recovery path for pending endings. The supplied tests exercise real Run persistence and failure handling instead of merely checking prose exports. The main campaign is a six-wing expedition with four chosen intermediate wings; I did not judge pacing as if every player reads all 17 packages consecutively.

Short/full scenes keep required search, safety, transformation and ending facts. Optional barks are correctly not tactical promises. The journal provides observations rather than turning a numeric Clue reward into an invented pet identification. The new examination branches are modest but real: the player chooses which physical evidence to inspect, and the source persists the chosen observation. This is evidence gathering, not a deduction system; describing it as a branching mystery with consequential theories would overstate it.

The five-step coach gets to reading intent, reading resources, playing and ending a turn without forcing a specific drawn card. Remembering actions already performed is a useful protection against stale instructions. Help preserves the game's actual nouns and important exceptions; Haunt explicitly does not prevent its triggering attack. Opening failure and a fresh expedition are distinguished. The chief remaining tutorial issue is navigation cost: eleven sequential help pages make a returning player step through unrelated material to find Haunt or pile controls. **Low severity:** add a topic index/direct topic buttons when revisiting this UI. This is an improvement request, not a claim that help is inaccessible.

The eight pet reunions use different species behaviors and different emotional rhythms. Jordan's interrupted self-blame and Samir's difficulty repeating “Bean” are particularly effective; do not replace them with general speeches about bravery. Pets approach, retreat, inspect, choose carriers, and sometimes lead. All sixteen Companion sets express character through bodies and preferences rather than giving every creature human dialogue. The eight pair sequences contain the clearest Kid differentiation: Maya keeps Mateo's questions; Priya enables Eli's experiment while protecting the map; Lena accommodates Samir's performance on her terms. Their optional placement is sound, but a plain “Discoveries” button at rest hides the relationship invitation. **Low severity:** a “Sit and talk” cue was proposed and accepted by the integrator; verify its final source/UI before claiming delivery.

The ending demonstrates the central change with one animal staying, another leaving and returning, and care remaining available. That is stronger than a concluding moral speech. The found/home distinction and peaceful post-victory visits avoid making players win eight complete campaigns to earn eight reunions. The final “spoon rescuing another spoon” callback is light enough after the emotional beat.

## All 17 regional packages

Each row covers arrival, guardian encounter/resolution, replay lines, three clues and bark. “Keep” means no specific change required, not an assertion of human playtest success.

| Region | Finding, player effect and action |
|---|---|
| Foyer | **Keep** the escalating towels and answering the towel. Clue-choice fix F5 gives observation a purpose. **Low:** the Butler explicitly states the House's central error very early; later clues should deepen causes or exceptions instead of repeatedly rediscovering the identical proposition. |
| Nursery | **Keep.** Crooked duster hat → offered sleeve is a complete visual payoff; the Governess's seam/wiggle vocabulary belongs to her. The painted door and preserved flop give contrasting evidence about care. |
| Sleeping Quarters | **Keep** the feet trying to hide and the inside cord. F4 originally duplicated this scene elsewhere; it now owns this resolution. The shared-blanket hollow now lets the player infer companionship without an identity disclaimer. |
| Kitchens/Cellars | **Keep.** “An excellent question. Needs icing” follows the Confectioner's compulsion. A spoon that simply works is an effective small concession. **Low:** Samir's snack line directly states the consent conclusion; one such line is enough across a route. |
| Greenhouse | **Keep.** A guardian without human dialogue is valuable variety. Offering brighter light fails to satisfy a seedling with a different preference; the second attempt supplies the meaning through action. |
| Graveyard | **Keep strongly.** “This one always sat on my writing” and leaving the pawprint make remembrance specific. The old memorials are distinguished from the missing pets without denying that death exists. Do not add another joke after the smudge. |
| Study/Library | **Keep** the cupboard of corrections and the actual outgoing requests. **Low:** “This is a separate disagreement” in repeatBefore names no concrete disagreement, making replay combat feel administratively excused. Give one brief specific obstruction if this beat is expanded. |
| Attic/Observatory | **Keep.** The tilted-table prophecy and investigated biscuit make certainty funny. **Low:** “Excellent discovery. Wrong expedition” could come from several Kids; a more impulsive Jordan response would sharpen ownership. |
| Lampworks | **Keep** the physical lamp misdirection and revised two-way examination. **Low:** repeat lines still return to list/checking language after the first scene was made more physical; a repeat lamp-handling action would sustain the distinct voice. |
| Ballroom | **Keep.** The guest leaves only for another hall, avoiding a premature whole-House escape claim. Samir trying to help the wave get under the curtain is more characterful than a detached punchline. |
| Crypt | **Keep** the spring refusing a straight-tail label and the crooked lettering. **Low:** “temporary filing problem” overlaps the Archivist's lexicon; a bodily Curator correction could separate them without removing the elbow/knee gag. |
| Hedge Maze | **Keep.** Three mushroom options are an intelligible false choice; repairing the glove while repotting the mushroom preserves both beings/functions. Revised quill evidence allows inference without assigning it to a named pet. |
| Secret Passages | **Keep revised scene.** Routing three taps to a selected nook is a specific communication/privacy act, distinct from the Bedframe's curtain. Recorded calls and nose-scratching with a key do not falsely award a rescue or an item. |
| Bathhouse | **Keep.** Amina's “I can be worried and still know where I want to go” is direct but emotionally necessary here. Letting the spirit rest beside the towel demonstrates the lesson without forcing calmness. |
| Kennels | **Keep.** The cardboard divider and retained clean bed recognize real care and preference. “An empty bed is not a failed bed” is the strongest explicit thematic line here; avoid stacking an additional explanatory Kid response after it. |
| Pumpkin Grounds | **Keep.** The frog ignoring promotion and reaching the pond before its sign preserve animal agency. **Low:** three frog-preference examples offer little new evidence after the first; future expansion should add a different resident or uncertainty. |
| Heart | **Keep.** Quiet arrival, pets outside combat, Keeper embodied from the House, and voluntary departure are coherent. Required recap supplies the essential case even if all optional evidence is missed. The Keeper's fear gets a voice without excusing detention. |

## Remaining editorial limits and disagreements

The manuscript-to-runtime gap has materially narrowed: these are imported scenes with state and UI consumers. I would not label the whole package unimplemented, nor require essential facts to be hidden behind optional clues to make it “more mysterious.” The mandatory safety statements are justified where a child could mistake a failed expedition for losing a pet.

The remaining broad weakness is sameness of rhetorical shape: an absurd object, a dry observation, then a small corrective accommodation. It is substantially mitigated by the quiet Graveyard, nonverbal Greenhouse, emotional reunions and revised Warden, so I do not classify the current whole round as mandatory repetitive exposition. The most useful next editorial work would be a few more uncertain, impulsive or emotionally revealing Kid responses, not adding more jokes per scene. “Good work, frog,” “A popular category,” “The elbow seems certain,” and “Accurate. Not useful” are individually effective but collectively show the same authorial taste.

Mystery fairness is good; mystery depth remains moderate. Once the Butler says the House feeds animals but refuses to return them, many clues confirm that case. The branching inspections improve how evidence is acquired, but there is little opportunity for a player's theory to be challenged or revised beyond the lamp-shadow example. A future pass should add a small number of genuinely competing explanations with observable resolution, while keeping the required ending legible without them.

The narrative screenshot is legible at 1280×800 with short/full and Continue visible. The Clubhouse status screenshot displays the eight-pet grid; its smaller italic descriptions are materially denser than the story page. I did not verify screen-reader behavior, large-text extremes, every controller path, or comprehension by children. The screenshot's achievement toast came from the test session; it is not evidence that ordinary Foyer entry triggers a loss.

## Final status and rubric

Final source check: Mochi and Pixel openings now use names/neutral references; Pipkin and Hush captions likewise avoid the conflicting pronouns. F7 is resolved in the reviewed new copy. The rest toolbar now says **Sit and talk**, resolving the source-level discoverability request. The remote context, examination branches and these last copy edits remain subject to the integrator's final regression pass; their presence in source is confirmed, their complete runtime coverage is not asserted here.

**84/100 for the final source snapshot reviewed in this round. No predetermined pass score was used.**

| Category | Score | Basis |
|---|---:|---|
| Character / emotion | 13/15 | Specific reunion behaviors and strong pair exchanges; some incidental Kid observations remain interchangeable. |
| Humor / originality | 16/20 | Good physical callbacks, nonverbal variation and distinct guardian compulsions; recurring dry-correction structure still limits surprise. |
| Tutorial | 13/15 | Honest mechanics, flexible first actions, fresh-run explanation and rereadable help; sequential help navigation and concept density remain improvable. |
| Mystery / fairness | 12/15 | Evidence is inspectable and does not overclaim identity; the central answer arrives early and much later evidence confirms it. |
| Gameplay / agency | 13/15 | Corrected outcome previews, optional investigation actions, route choices, voluntary pet behavior and peaceful visits; story interpretation has limited consequence. |
| Pacing / replay | 8/10 | Six-wing structure, short/full controls and repeat variants are appropriate; familiar concession arcs still recur over repeated expeditions. |
| Canon / state | 5/5 | Reported continuity/pronoun defects corrected; found/home permanence, memory framing and pending endings are represented coherently in the reviewed source and supplied state checks. |
| Age / accessibility | 4/5 | Warm treatment of grief, safety, uncertainty and consent; readable story screenshot and keyboard-oriented implementation. Dense Clubhouse copy and unverified broader accessibility limit a perfect rating. |
| **Total** | **84/100** | |

**Disposition:** no unresolved mandatory editorial revision identified in this final source snapshot. Complete the remaining regression checks before claiming the newly added interactions and every ending/reload path tested. Do not describe this review or its automation as a child or human playtest. The next quality gain lies in deeper inference and more character-owned responses, not in pursuing an arbitrary numerical threshold.
