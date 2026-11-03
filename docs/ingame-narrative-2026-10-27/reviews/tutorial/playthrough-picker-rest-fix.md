# Live playthrough repairs — card picker and Safe Room copy

28 October 2026. Root owns the only active browser for the six-wing audit. This agent performed source inspection and syntax checks only; no competing browser was launched.

## Confirmed picker defect and shared repair

Both Safe Room sharpening and Curiosity mending/removal use `RoomScene.pickCard` in `game/src/scenes/reward.js`. The card face preview correctly gives pointer hover precedence over keyboard focus. The footer previously did not: separate hover/focus listeners each wrote a card name directly. The scheduled initial focus on slot zero could therefore overwrite the footer with Scratch while a different hovered card showed its upgraded face. Neither was necessarily selected.

The shared `paint()` function now derives the footer from the actual `chosen` UID only. Before selection, upgrade copy says **“Choose a Trick to sharpen. Hovering only previews it.”** Other pickers say **“Choose a Trick, then confirm.”** After selection, sharpening reads **“Selected: Scratch. It will become Scratch+.”** using the selected card's actual name. Other operations show **“Selected: [actual Trick name].”** with its existing upgrade suffix where relevant. These examples describe formatting; the executable strings render real card names, not placeholders.

The footer initializes before the picker is shown and remains tied to the selected card when the pointer previews another. The confirmation button remains disabled until selection. This fixes the shared mechanism once; `event.js` requires no duplicate override. No card legality, costs, upgrade behavior, or selection hit areas changed.

## Wrong-card hypothesis corrected by later live evidence

The initial report interpreted a displayed Boo!+ face as a deck mutation after requesting Rattle the Chandelier. Root's later live inspection corrected that interpretation: Rattle, Perch Up High and Predator's Patience were absent from the available upgrades, base Boo! remained available, and Rattle had dealt its upgraded 17 damage. The Boo!+ display was leftover hover-preview evidence, not proof that the wrong deck card had been upgraded. **There is no confirmed wrong-card mapping defect.** This correction supersedes the initial hypothesis without rewriting the raw session record.

Static mapping is consistent: a slot's closure stores its `c.uid`; confirmation resolves that UID; Rest/Event convert it through `deckIndex` in the active Kid's full deck; REST_MEND/EVENT_MEND recover it through `cardAt`; `Run.upgradeCard` updates `findCard(uid)`. No filtered-grid/full-deck index mismatch was found. No geometry or hit-area changes were made. Root has now verified the corrected neutral footer live and is checking explicit selected UID → result as a further precaution.

## Procedural upgrade wording

The live Curiosity still called the same upgrade operation “mending” in its continuation prompt, picker heading, and confirmation button. `event.js` now uses **Choose a Trick to sharpen**, **Which Trick will you sharpen?**, and **Sharpen it**, matching the Safe Room's action term. Its existing subtitle already says to sharpen and inspect the improved version. Only procedural UI strings changed: authored Mended Thing flavor, event outcome data, and REST_MEND/EVENT_MEND constants are preserved. No exact matching selector or authored instruction in this agent's tests required replacement; historical raw session logs keep their observed old text.

## Safe Room copy

`rest.js` now uses existing `visitedIds` plus actual resolved node types to detect another Safe Room earlier in the current wing, excluding the current node. Such visits show **“A Quiet Stop”** and **“Blankets down. Take a moment.”** The first Safe Room retains its longer introduction. Run map construction clears visitedIds on wing change, so this deliberately makes no claim about previous wings. `stats.safeRooms` was not used: it increments for the Rest action, not every visit or Sharpen choice.

Forge flavor is now **“The flame strengthens a Keepsake. Its price is some of your maximum Courage.”** The numeric cost/readout remains unchanged. The result states the actual maximum Courage reduction instead of claiming the player became physically smaller or that the cost was “worth it.” Root's other Rest changes are preserved.

## Validation

`node --check` passes for rest.js, reward.js and event.js. Rest's original CRLF line endings and Reward's LF line endings are preserved. No live browser was launched by this agent. Root reported live verification of the neutral picker footer and the correction to the wrong-card hypothesis above. The new Curiosity wording passes syntax checking; its display is awaiting root’s next reload.
