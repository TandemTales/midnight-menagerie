# Ward animal targeting and accessible identity

The actual Kennels campaign exposed a presentation mismatch: the protected Small Grey Dog appeared in the hand's keyboard target cycle, and its accessible label called it an enemy with Courage. The real engine refused the attack, so no animal damage occurred, but the refusal interrupted targeting.

The hand now passes its selected card to the scene's target provider. That provider uses the existing engine `targetableEnemies(card)` API, then intersects the result with living rendered views. Pointer snapping and keyboard cycling therefore use the same real rules, including both Ward protection and attack-specific Hidden. Default targeting and single-target taps use the same engine API. No combat definitions, costs, damage, protection or balance changed.

Ward-role views now announce “Ward animal. Protected; cannot be attacked or hurt,” followed by their current intent, rather than calling them enemies or presenting their internal Courage value as something to remove. Ordinary enemy labels remain unchanged.

Validation: `node tests/ward-targeting/run.mjs` exercises a real Walking Cage / Ward dog / spawned latch encounter across the engine, CombatScene, Hand keyboard confirmation/cycling, pointer pickup/snapping, default/tap targets and EnemyView accessible-label method. It also verifies the real Hidden status excludes an Attack target while retaining a Skill target, excludes dying views, and demonstrates that the previous view-only target list includes the protected dog. DOM geometry and animation leaves are inert in this Node test; this is not browser or human playtesting. The existing real-engine Dough split regression also passed after these changes. A browser visual/input recheck remains pending the parent's isolated campaign boundary.

## Follow-up from the actual Kennels encounter

The parent confirmed keyboard targeting excluded the animal and a real latch break freed it. The screenshot still showed internal health and an ASLEEP combat intent, so the Ward-only presentation now hides the health bar/numerals, Guard and intent and displays **Protected animal**. Its species/name, Fright rule, status information and inspection remain. Ordinary enemies retain their health and intents. The accessible Ward description also omits the combat-intent sentence.

The same release exposed a stale rescue instruction in the external rule dock. A departing Ward view now retires only presentation rules whose source is that animal, then repaints the dock. This does not clear engine rules, change rescue conditions or affect another actor's rule. The expanded Node seam test breaks the real latch with two legal Scratch cards, consumes the real removal event and checks that the animal's old instruction disappears while other rules remain. Both Ward and Dough Node regressions passed after the change.

The pending browser suite now checks the visible protected label, hidden Ward health/intent, visible regular enemy health/intent, preserved Fright/status information, actual keyboard latch release and disappearance of stale Ward instructions while the Cage's open-door rule remains. No browser was launched by this agent; the parent will reload at a safe map boundary before further live visual verification.
