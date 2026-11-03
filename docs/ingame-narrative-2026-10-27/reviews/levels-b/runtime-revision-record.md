# Executable regional and Curiosity revision record

This record follows the subsequent user authorization to implement the narrative. Earlier proposal-only manuscripts and review snapshots remain preserved. It does not claim player testing or award an achieved score.

## Authored implementation

- `game/src/data/narrative-regions.js`: all 17 actual region IDs; 153 main scenes, clues and optional barks; 51 clues; four explicitly chosen inspection actions in two clues. Kids' optional reactions require the consumer's active-party filter. No data function mutates combat, routing, pets or saves.
- `game/src/data/events.js`: all 17 Curiosities and 79 outcomes revised. Anonymous observed traces replace unconditional current-pet identification. All Companions fit the generic interactions. Unsupported family chronology, fifty-year cat biography, ordinary/dead assumptions, invented poster recognition and forced memory loss were removed. Costs and results are preserved.
- `game/src/scenes/rest.js`: safe-room captions read stage B from `COMPANION_STORIES`, covering all 16 roster slugs. No rest reward, choice, RNG or save logic changed.
- Actual manuscripts 04 and 05 now contain exact runtime excerpts, generated from the module. Earlier extended scenes are retained as reference.

## Critique and applied revisions

1. **Runtime adversary: high, player-facing implementation prose.** Kennels, Grounds and Heart recaps exposed terms such as pet-loss timer and saved departure. Replaced them with visible room outcomes. Removed several additional identity disclaimers and external author instructions from optional clue text.
2. **Root: medium, duplicate mandatory revelation.** Heart regional before repeated the parent Heart Ward's care/refusal/Keeper explanation. Regional scene now carries a short Keeper challenge and safe-pets orientation; the required Ward remains responsible for evidence and identity on every eligible route. Regional after only opens the onward passage; it never marks a pet home.
3. **Root: medium, same resolution twice.** Bedframe and Whisper Warden both gave an occupant an inside control for a curtain. The Warden now lowers a speaking-tube route switch. The resident selects one destination; only that destination replies. The Warden's overactive echoes establish this conflict before the battle. Bedframe keeps its private hiding-place outcome.
4. **Root: medium, inspection without discovery.** Two initial closer captions exposed all later branch facts. They now provide only physical setup. Choosing a worn cord or a high knot reveals different evidence; inspecting a shadow or glass reveals different details. Unchosen actions are never attributed to the player. All necessary plot information has another carrier.
5. **Root: high, stale physical restrictions.** Six clues now have `beforeResolutionOnly:true`: sleeping-quarters-1, greenhouse-1, lampworks-2, kennels-1/2 and heart-1. New discovery is suppressed after that region's resolution by the parent consumer; archived observations must be framed as earlier records. This metadata does not itself implement persistence.
6. **Root: high, reward-label mismatch.** Register tear, dumbwaiter trade and lost-and-found service labels implied guaranteed rewards absent from some outcomes. Reviewed every option against all 79 outcomes, corrected alternatives and explicit possible costs, also repaired coat-unbutton and stair-cat rewards and named Courage consistently. No weights, costs, effects or conditions changed.
7. **Editorial voice pass: medium, children explaining the lesson.** Amina now attends to a recovered animal's pain, Priya counts the plant/window result, Eli wants to meet a repairer, Mateo chases the rabbit/kettle observation, Samir helps a phantom wave around a curtain. Narrator observations continue to carry meaning when these Kids are absent.
8. **Comedy architecture: medium, excess forms and labels.** Lamplighter's list-checking label gag became a stack of smaller inspection lamps. Earlier comic mechanisms remain differentiated: grooming hospitality; rigid toys dusting one another; a visible hiding bed; icing ruining tools; nonverbal plant preferences; a carefully memorialized resting rake; recursive filing; selective prophecy; lamps chasing shadows; a party unable to finish; misclassified body parts; gardening everything; echoes defeating secrecy; soothing objects; rejected luxurious toys; a frog ignoring royal ceremony. Their success with the target audience is untested.

## Verification and limits

`runtime-data-validation.json` records the final structural check. Node imported actual modules and verified all 17 schema region IDs, 51 clues, 153 main units plus four unique inspection IDs, neutral information without optional Kids, six restriction guards and all 16 safe-room caption slugs. Syntax checks passed for events, regional data and rest.

The full Curiosity structure, excluding display-text properties only, exactly matches the pre-edit projection in `curiosity-mechanics-before.json`. This checks every effect, cost, outcome weight, prerequisite, pool weight, minimum depth, region and stable ID. It does not substitute for the parent integration's browser checks of modal layout, persistence, branch dispatch or multiplayer. Optional barks require the consumer to schedule them; no combat timing is promised merely by exporting them.

The standalone mutation scripts are review-history artifacts, not game dependencies. `revise-curiosities.mjs` describes the one-time historical rewrite and must not be rerun on the revised source. `sync-runtime-manuscripts.mjs` safely regenerates the current runtime appendix.
