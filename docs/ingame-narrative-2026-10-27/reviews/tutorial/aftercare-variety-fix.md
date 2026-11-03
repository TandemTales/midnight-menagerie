# Three middle/late aftermath revisions

28 October 2026. Response to whole_run_editor F3 (baseline 86), read independently of prior scores. No new score assigned. Source craft revision; no browser launched.

Only the Greenhouse, Attic and Kennels authored units changed in narrative-aftercare.js. Existing unit and choice IDs, choice count, region resolution, reward, persistence and scene renderer remain unchanged. Current saved choices retain their original stored label and recap; newly selected branches record their new exact result.

- Attic retains the real rolling-telescope intervention and stand choice. The former wait branch asks “Could something nice happen?” The Watcher first secures the actual telescope, then shows one possible forecast: a sparrow takes a seed from a windowsill and flies to a tree. The line says “might”; the short recap explicitly says it is not a promise. No missing pet or guaranteed ending appears in the forecast. The route remains clear in every branch.
- Greenhouse now contrasts window observation (a small pane and moving air), lamp observation (the seedling turns away as the ornate lamp tilts closer), and offering both clear paths (the seedling passes the lamp and chooses the window while both remain available). Each selected result supplies distinct evidence. There is no unsupported plant-stat test, changed light mechanic, or player-selected destination imposed on the seedling.
- Kennels contrasts physically clearing the departure route, asking what happens if the animal returns (bed prepared, fresh water offered), and keeping water within reach (the animal drinks before leaving). No former resident history was invented. No return is required or guaranteed, and no pet is rescued by these actions. The repeated “failed bed” lesson was replaced by behavior and specific voice.

All selected recaps name only their selected action and preserve the necessary consequence in Short version. All setup recaps retain enough information to choose without reading the full setup. Choice IDs with old descriptive suffixes remain stable deliberately; labels and exact stored outcomes define the current action.

The free conversation section now states **“These conversations do not spend Clues or use a fort action.”** Its Kid, pair and Companion handlers only append the chosen lines and commit seen milestones. They never invoke REST_SIT, consume Clues, or alter the Safe Room used flag; the statement is true wherever the section exists (currently Safe Rooms only).

Syntax checks passed for narrative-aftercare.js and ui/story.js. Executed pure-data checks cover existing three-choice IDs, unique IDs and complete selected recaps. Live selected-branch and skip validation remains for parent’s campaign/regression window. Text staging uses the existing narrative renderer; no art or animation was produced or required.
