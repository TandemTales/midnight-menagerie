# Architecture review round two from late region writer

Target: current `02-narrative-character-bible.md`, after first structural revisions. Independent agent review of the root author's work; not a human playtest. Earlier critique is retained, so this pass is not blind.

The revised revelation table no longer assigns the player beliefs, correctly distinguishes a shared route from unanimity, and defines a seen scene separately from found evidence. These are substantive improvements. The pet introduction can now work if the guaranteed Ward scheduler in section 06 is implemented; it remains a proposal rather than a verified live feature.

## Findings requiring revision

1. **High — N namespace still says “multiplayer ownership unresolved until integration.”** This was a first-round blocking state issue and remains. Add a concrete conservative design: home state belongs to each participating local profile, only a verified local commit warrants its “saved” line, no absent player pet writes, and no remote save-success assumption. Party scenes need neutral fallbacks when results differ. Engineering synchronization may remain pending; narrative behavior cannot.

2. **High — Character intro contract still repeats the last quote after a pet is home.** Mateo and Jordan specifically continue yearning for a missing animal after reunion. Gate these intros to unknown/found, and add a home-state intro whose exact line expresses voluntary helping. This also keeps continued Kid selection emotionally legible.

3. **Medium — “which safe question to ask” still lacks a printed question-selection contract.** Change to “which objects to examine” unless actual authored question choices are supplied. It is a small phrase but claims player authorship the scene may not offer.

4. **Medium — comic motif list still names Harvest King “abundance,” Kennelmaster “assignments,” Lamplighter “reassurance.”** The late-region draft is now anchored to timing, certainty, and control of light. Align this bible with those actual scripts so it does not steer later writing back toward interchangeable hospitality.

5. **High — post-sanctuary state now depends on ending policy.** Section 07 permits sanctuary after a first rescued pet, while seven pets may remain unknown. A universal memory-only replay wrapper would block or fictionalize later present-day searches. The whole-game architecture must explicitly allow a present-day sanctuary search/reunion for still-missing pets or defer the global sanctuary until the relevant campaign condition. Do not silently decide that remembered rescues alter present state.

## Recommended exact core repair

“After the sanctuary opens, still-missing pets may be found in present-day sanctuary visits. These visits use the recognition and home scenes with unlocked access, not a new boss gate. Remembered expeditions revisit old battles and cannot newly rescue a present-day pet.” This is a proposal needing its own short delivery scene and eligibility mapping. Alternatively, establish a clear late-campaign sanctuary condition and let END-03 be a local trial until then. Preserve that decision openly.

## Assessment

Architecture has a coherent mystery and a strong agency premise, but state correctness is not yet at the requested gate. No overall score given while the ending integration is incomplete. Repeat-state issues outrank line polish even if the regional jokes score well.
