# Tutorial runtime round 3 — resource load and name continuity

28 October 2026. Response to the fresh review's concrete TUT-002 concept-density and pre-discovery naming findings. Author implementation record; no self-score or playtesting claim.

## Substantive changes

**TUT-002** now teaches only reading a Trick and comparing its Nerve cost: “Point to a Trick to read it. Keyboard: Left or Right. Compare its Nerve cost with your Nerve.” The real Hand's `card:hover` bus event reports pointer hover and keyboard selection. The coach observes only views contained in the current battle and then says, “This Trick is ready to read. Compare its Nerve cost with your Nerve.” This recognizes the action, not understanding. It never auto-advances, forces a card, or requires inspection to continue; acknowledgement and Skip are available throughout.

**TUT-002B** is a separate manual card with a Companion/Courage spotlight: “Courage keeps your Companion in the Scuffle. At zero, they’re out. Guard usually takes damage first and clears at your next turn.” It precedes the first requested play and still works when Guard is zero and its badge is hidden. Cost and defense no longer share a paragraph or spotlight. The implemented sequence is now six steps: 001, 002, 002B, 003, 070, 090. Existing early-action memory, player-only end-turn predicate and asynchronous wait cancellation remain intact.

**Name continuity:** simply masking the coach label would have left the combat HUD and optional Help naming Marmalade before the post-battle tag. With root authorization, OPN-040 now reveals the existing collar tag before combat: “She washes one paw. Her collar tag reads MARMALADE.” Its portrait nameplate follows that page. OPN-070 now shows her walking a little way down the hall, returning and sitting beside the Kid: “The hallway can wait.” This demonstrates her choice to stay without repeating discovery or inventing an age, owner or biography. The opening coach uses **Your Companion** as its warm role label. The stable internal page ID `name` is retained for compatibility.

`03-opening-tutorial.md` records exact new text, unit metadata, actual observation semantics and the six-step route. It also corrects a draft overclaim: early victory does not guarantee a separate TUT-090 story card; the recap remains available through Help.

## Regression result

`python -u tests/tutorial-narrative/run.py`: **PASS, 13 grouped checks**, against real Edge and the actual game/engine/Navigator. The suite now selects steps by stable narrative IDs instead of numeric indices. New assertions cover separation of resource words between cost and defense, the real Hand selection feedback staying on TUT-002, the generic coach role label, pre-battle tag copy and the absence of repeated tag discovery afterward. Existing keyboard/controller, Help isolation, real card-play/end-turn, cleanup, Run handoff and zero-page-error checks still pass.

Inspected `tests/tutorial-narrative/coach-defense-1280.png`: the short defense text and Your Companion label fit; the hand, Courage panel, Nerve and End Turn remain visible. Previous normal/large Help and opening layout checks remain applicable because those layouts were unchanged. `node --check` passes for coach and tutorial.

The extra acknowledgement is an intentional tradeoff for separating concepts. The player can act throughout, and no mandatory specific draw or fake comprehension gate was introduced. Children’s comprehension, screen-reader speech and physical gamepad hardware remain untested. Acceptance scoring belongs to a fresh independent review.
