# Tutorial critique and revision round 1

Separate self-editorial pass by tutorial author, not an independent human review. Reviewed tutorial-v1.md against the source. Roles: onboarding flow, gameplay-state correctness, accessibility, adversarial play. No playtest conducted.

1. **High, TUT-010 through TUT-060:** eight acknowledgement cards can precede the first actual play. The prose is short individually but the sequence recreates a lecture before participation. Move the conditional exceptions to Help; shorten early core cards, let the player inspect cards immediately, and use six concise core cards before the first play. Preserve Guard teaching before spending.
2. **High, TUT-060:** “local player” filtering alone does not identify the coached actor in a party. The opening is solo; explicitly prohibit party coach reuse until actor/seat handling is integrated. Otherwise a teammate can satisfy the wait and teach the wrong player.
3. **Medium, record contract:** `tutorialSession.completed` adds a competing namespace to the shared narrative contract. Use `N.runPlayed[TUT-ID]` for session eligibility only and do not save a prologue run that does not exist. Document transient storage separately from actual Run state.
4. **Medium, TUT-010 optional line:** a generic selected-Kid question makes every child sound like Mateo. Restrict it to Mateo, with a caption fallback. Keep the controls in neutral UI text.
5. **Medium, OPN-051 and TUT-090:** defeat copy says “out” without clearly distinguishing prologue retry from expedition loss. Add exact retry explanation to OPN-051, while avoiding any invented ability to restart a real battle without consequence.
6. **Medium, HELP-001:** static help button is proposed, so “way to revisit” is designed but not current. Already labeled; add a concrete no-new-feature fallback for instructions on the current combat tooltip surfaces, and explicitly state a full revisit requires that button. Do not imply the developer debug route satisfies the user need.
7. **Low, OPN-080:** wording “Marmalade may need a way out too” is careful, but prologue fresh-state explanation is tucked into a proposal subline. Keep the fresh-state explanation as mandatory outgoing tutorial copy if the implementation preserves the existing reset.

Scores on v1: character 13/15, humor 16/20, tutorial 11/15, mystery 13/15, agency 13/15, pacing 7/10, canon/state 4/5, age/readability 4/5 = **81/100**. Meaningful changes required regardless of score. These categories assess this tutorial package only.

Revision response: v2 shortens and restructures the pre-play cards, makes the solo scope explicit, adopts the shared state contract, narrows the joke voice, makes prologue reset clear, and adds static-tooltip help fallback. Preserved v1 before revision.
