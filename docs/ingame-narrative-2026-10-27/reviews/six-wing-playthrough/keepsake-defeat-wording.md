# Keepsake defeat wording

The live Kitchens shop displayed Tin of Sardines as “Whenever an enemy dies, recover 3 Courage.” That rule should describe defeat, consistent with guardians remaining alive for their aftermath scenes.

Changed the player-facing `desc` strings in `game/src/data/relics.js` for Tin of Sardines and Hollow Birdcage to “Whenever an enemy is defeated…”. Their `onDeath` engine hook names, effects, numeric values, and flavor text are unchanged. A word search found no further dies/killed/kill/death wording in that file or the reward scene, shop scene, and backpack data. `node --check game/src/data/relics.js` passed; no browser was opened.

A wider but phrase-specific source search also identified enemy-death wording in Crumbula's House Rules card / Bite Mark glossary and Wink's Set glossary. Those were reported separately to the parent; supernatural biographies and card names such as Not Dead Yet were not rewritten.

## Authorized card and glossary follow-through

The parent requested the same narrow correction for confirmed card/keyword text. These five strings were changed:

- `crumbula.js`, House Rules card: “When a marked enemy dies, move up to {n} of its [Bite Mark]s to the living instead of losing them.” → “When a marked enemy is defeated, move up to {n} of its [Bite Mark]s to the remaining enemies instead of losing them.”
- `crumbula.js`, Bite Marks status description: “A stacking enemy status that does nothing by itself — a prepared meal. Lost when the enemy dies.” → “A stacking enemy status that does nothing by itself — a prepared meal. Lost when the enemy is defeated.”
- `wink.js`, Set Tricks system description: the final sentence “If its enemy dies first it returns without triggering.” → “If its enemy is defeated first it returns without triggering.” The preceding sentences are unchanged.
- `keywords.js`, Bite Mark keyword: “A stacking enemy status that does nothing by itself — a prepared meal waiting to be eaten. Lost if the enemy dies.” → “A stacking enemy status that does nothing by itself — a prepared meal waiting to be eaten. Lost if the enemy is defeated.”
- `keywords.js`, House Rules power status: “Bite Marks on a dying enemy move to the living instead of being lost.” → “Bite Marks on a defeated enemy move to the remaining enemies instead of being lost.”

`node --check` passed for all three companion data files. This changes only displayed rule strings; hooks, mechanics, numbers, character biographies, flavor, and supernatural idioms remain unchanged. No browser was opened.
