# Architecture review round 2 from tutorial editor

Reviewed revised section 02 and section 07's new relationships/ending as the tutorial reviewer. Prior round's issues informed regression checks; this is not a blind fresh review and not a playtest.

## Round 1 regression

The opening now branches unknown/found/home, possible questions replace imposed player beliefs, delivered recaps distinguish seen from specific clues, introduction anecdotes avoid double presentation, and the essential route names the Heart fallback. These repairs address the prior concrete concerns. Two-person Safe Room scenes give the children interactions beyond delivering the theme; the Maya/Mateo pencil exchange is a useful model of curiosity being respected rather than punished.

## New integration findings

1. **High — END-03/04 versus END-08 and the progression spine.** Sanctuary can occur after the first successful pet reunion, with seven missing pets still unknown. Thereafter all combat expeditions become memories and cannot add present-day rescue claims. How can the remaining children actually reunite with their pets? This is a structural dead end, not merely unresolved rewards. Choose an explicit path: post-sanctuary present-day search/reunion visits using the safely open House; or defer the global sanctuary ending until the required present-day searches are resolved. The first option best preserves optional order without gating the finale behind eight runs, but needs complete reunion/exit dispatch and an engineering dependency. Do not silently mark the remaining seven home.
2. **High — END-07 all-sixteen test.** Wording says “actual persistent Companion rescue roster is all sixteen,” but Marmalade is starter-only in the audited opening flow, not awarded by rescue. A literal companionsRescued-length test can be unreachable. Test the verified union of starter/free and actually rescued Companions against the roster IDs; do not equate starting availability with an earlier liberation event.
3. **Medium — END-01 none-found branch.** “If none found” chooses a recap that claims “Your already-home pets remain safe at home.” None found does not logically prove all active pets are home; unknown is a third state. Split none-found/all-home from none-found/unknown fallback, or explicitly assert guaranteed R transaction success as a prerequisite and handle failure. Avoid turning a skipped or failed save into a home claim.
4. **Medium — END-02 dispatch from END-03.** “Head home invokes END-02” even after N.sanctuary on a later revisit, while END-02 prerequisite is a newly committed home state and no sanctuary. Specify dispatch guards and use a neutral “Return to the Clubhouse” when END-02 is ineligible. This is modest but essential for replay honesty.
5. **Low — COMP-marmalade-A.** New join vignette repeats the introduction already in OPN-070. State whether it replaces that opening beat or is a later optional reread. Do not auto-play both; architecture already prohibits duplicate introduction anecdotes.

## Relationship findings

PAIR-A/B ordering and both-present conditions are clear. Solo lines do not invent absent children. One issue to monitor at integration: if B is eligible only per presenting profile, a second active player who never saw A may still hear the callback. Prefer each participating seat's A-seen, or prepend a one-line visible setup rather than assert everyone remembers. No current line humiliates a child for a mistake, disability, shyness or identity.

Revised architecture is more playable and honest, but the post-sanctuary completion path is a required structural fix. Diagnostic score: character 14/15; humor 17/20; teaching/information flow 13/15; mystery 13/15; agency 12/15; pacing/replay 7/10; canon/state 3/5; age/access 5/5 = **84/100**. Scores are not proof; fix the listed state problems even if another reviewer rates higher.
