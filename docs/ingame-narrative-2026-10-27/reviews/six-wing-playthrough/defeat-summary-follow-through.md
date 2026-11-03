# Defeat summary and persistent narrative review

28 October 2026. Attempt 1 ended in an actual defeat to the Great Lantern in the Lampworks. This review did not restore state, run a browser, change balance, or treat the lost attempt as a completed six-wing playthrough. The coordinating agent is continuing with a normal new expedition.

The recorded `attempt1-defeat` shows “7 Keepsakes, left on the floor” and “7 kept.” `GameOverScene` reads the ended Run's relic list; it does not read persistent Keepsake ownership. `Run.end(false)` clears the saved run, and a new Kid/Run starts with its normal starting equipment. The list now says **7 carried** (or **none carried**) and its empty sentence explicitly refers to the end of that expedition. The defeat panel is **What resets**, with expedition Tricks, Keepsakes, Buttons, Snacks and Gear uses. Gear can be packed again: `select.js::loadoutFor` still reads the saved Backpack selection or the default loadout.

Other confirmed summary-copy fixes in `gameover.js`:

- **Explored**, not **crossed**: the count is `regionIndex + 1`, which includes the Lampworks where this attempt ended before clearing it.
- **Clues found this expedition**, not **for the board**: the 14 generic Clues counted in run statistics are separate from seven saved named observations.
- The defeat introduction keeps the Kid and Companion together and says recorded discoveries persist. The Companion caption no longer assumes this was a repeat entry.
- The Heart completion text now agrees with the authored ending: the Keeper releases the locks and the gate works both ways. It no longer invents the Keeper breaking into objects after the gate scene. The non-Heart fallback victory text no longer puts every possible Companion on the Kid's shoulder.
- The seed hint promises another expedition using that seed, rather than an identical experience despite different choices, roster and progress.
- **From your final deck** replaces **Worked hardest**. `_buildMvp` picks the first non-basic final-deck entry, not a card ranked by play count or contribution. Its sentence now states only that the displayed Trick was in the final deck.

Separately authorized label fixes: selection tiles in `select.js` now say **Available for your expedition**, retaining name and type. Their old **Found in [native wing]** claim contradicted this run's Bones rescue in the Foyer and treated starter Marmalade as a rescue. The loop already filters for unlocked/pickable Companions, so the new label reflects availability. The Clubhouse's starter caption now says **with you from the start**, replacing **never in the house**. No other Clubhouse or selection logic was changed by this review.

Read-only save audit: `Run.end(false)` updates expedition statistics, persists rescued Companions and surveyed wings, then calls `Save.clearRun()`. That function removes only the run storage key. It does not reset `Save.data.narrative`, pet rescue state, or Backpack selections. The ending listener creates `pendingEnding` only for a Heart victory. `markPet` is monotone, so an already found/home pet is not downgraded by defeat.

Recorded evidence agrees with that source: both `attempt1-defeat` and `between-attempts-clubhouse` retain **7 named observations, 2 investigations, and 1 chosen aftermath**. The Clubhouse reports Bones freed and two surveyed wings. Pets remain unknown, sanctuary remains false, and pending ending remains null; this attempt had not reached a reunion. This run therefore verifies preservation of its actual discoveries, not the unexercised found-pet defeat path. That path is supported by source and the separate existing regression evidence, not by this attempt.

Validation: `node --check` passed for `gameover.js`, `select.js`, and `clubhouse.js`. Only presentation text was changed; run/save behavior and all numerical outcomes remain intact. Live visual verification awaits the coordinating agent's reload and follow-through.
