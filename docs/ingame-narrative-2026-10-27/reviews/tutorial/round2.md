# Tutorial critique and revision round 2

Separate source-check and adversarial editorial pass on tutorial-v2.md by the tutorial author; not an independent reviewer or live test. Roles: mechanics, family tone, controller/readability and replay.

1. **High — SYS-080B “Snacks are items you can use.”** Source `ui/hud.js` only makes Snacks activatable in combat. At a reward or map this could tell a child to click an inert item. Specify “during Scuffles” and show the usage lesson only in combat; outside combat it is inspection only.
2. **High — first battle has no explanation of Marmalade's Lives.** Nine Lives can be mistaken for nine failures before losing Marmalade or the pet, directly undermining the safety promise. Add short context-triggered text: a battle resource, not remaining attempts, returning next battle. Do not require spending it.
3. **Medium — TUT-080 new hand appears with no explanation of old cards.** A novice can think their unplayed Tricks were destroyed. Add a separate post-turn teaching unit explaining discard/reshuffle, with Retain/Ethereal exceptions in Help, not in a long first-turn lecture.
4. **Medium — Boo! uses Haunt in the starting deck.** Without a contextual keyword lesson, “read the Trick” does not fully teach a first relevant term. Add a contextual keyword inspection card and finished Haunt wording from the actual status definition. Keep it optional until relevant; no forced Boo! draw or play.
5. **Medium — HELP-001 keyboard cancellation.** Earlier audit correctly avoids Escape due to event collisions but leaves no alternative. The existing hand uses Arrow Down to cancel aim and selection; teach Down in the keyboard help. This is a source-verified alternative, not a claim that Escape is fixed.
6. **Low — comic confidence after a successful Trick:** no failure-dependent gag found. Optional jokes now have a named speaker or narrator, so no further voice correction required.

v2 diagnostic score: character 13/15; humor 17/20; tutorial 12/15; mystery 13/15; agency 13/15; pacing 8/10; canon/state 4/5; age/access 4/5 = **84/100**. Missing system explanations require revision regardless of the number.

Revision response: v3 adds SYS-081 and TUT-085/TUT-086, specifies the actual combat-only Snack activation, and gives Arrow Down cancel wording. Earlier gains retained: short core sequence, no forced card draw, no compulsory Nerve spending, no invented rescue persistence, action success based on real events. After manuscript correction the author estimates 89/100 (13,17,14,13,14,9,4,5). This is provisional pending cross-review and UI validation; do not average it with whole-game scores or present it as playtest evidence.

Regression follow-up during round 2: inspected actual Haunt hook and all Marmalade cards, not just glossary. Haunt resolves after the enemy attack and a special power changes its decay; All Nine can restore Lives during combat despite the broad glossary sentence. Final copy now says after/normal decay and explicitly allows special Trick restoration. This is a source correction, not a claimed test result.
