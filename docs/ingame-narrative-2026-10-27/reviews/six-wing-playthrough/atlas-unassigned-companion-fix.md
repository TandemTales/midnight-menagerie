# Atlas unassigned Companion display

The live second expedition (seed 21972029) offered the Foyer as holding “Nobody” / “everyone this wing could hold is already free,” then freed Taffy after the Butler. The recorded `foyer-boss-taffy` scene begins “Taffy pours through the opening…”. This was a misleading display, not evidence of an impossible rescue or an automation selector failure.

`Run._assignHeld()` first reserves each missing native Companion across all offered wings. Its distinct-name pass can consequently leave the Foyer's `held` assignment null while other Companions remain missing. `Run._heldTarget()` falls back to `rescueTargetFor()` for that null assignment; the room or boss can still free a missing Companion.

Changed only `game/src/scenes/atlas.js`: an offered wing with no assigned name now displays “Not yet known” / “another Companion may be waiting here” when `run.missingCompanions()` is nonempty. The matching accessibility label says that a Companion may be held there and their name is unknown. Assigned names remain intact; “Nobody” is reserved for an empty missing pool. The Heart still omits this block.

Validation: `node --check game/src/scenes/atlas.js` passed. A direct Node invocation of the actual imported `Run` methods, using seed 21972029 with Marmalade in the party and Marmalade/Bones in the freed roster, reproduced `held: null` for the Foyer and `taffy` for `_heldTarget('boss:foyer', 'marmalade')`. Assertions against the actual `AtlasScene._hotLabel()` passed for unassigned/missing, assigned/named, and all-free cases. No browser was opened; the visible dossier branch was source-reviewed and awaits the ongoing live audit's next reload.

Separate source-level concern, not changed here: the null-assignment fallback is reevaluated for each Rescue-room/boss tag. Unlike the named-assignment branch, it does not pin the first rescued Companion, so a route through both a Rescue room and the boss can potentially free more than one Companion in that wing. The observed boss-only Taffy route does not test that concern. Parent reviewer was notified; no gameplay or save behavior was changed in this display correction.
