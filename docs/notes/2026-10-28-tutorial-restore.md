# Restore the previous opening tutorial

Restored at the user's request: “restore the old midnight menagerie tutorial.”

## Version and scope

The immediately preceding tutorial is the version present in HEAD `99bdba9f42ec90ffe720b620b1082367b75c7fd1`, before the uncommitted October 27–28 narrative rewrite. The task history for **Rewrite Midnight Menagerie narrative** and its source audit (`docs/ingame-narrative-2026-10-27/01-source-canon-ledger.md`) identify the old fifty-year name reveal, seven-pets wording and longer story as the material replaced. No competing predecessor was found.

- `game/src/scenes/tutorial.js`: source blob `77dc3e5aedcb275f2269bd717d2ec0e628fcff59`, last committed tutorial change `ffa8f7ec` (September 16). Restores all ten original story pages, child dossier text, rumour page, “Stay behind her”, after-fight collar/name reveal, and “Go and find them”.
- `game/src/ui/coach.js`: source blob `6eb37eba98066cdda4257c6ce6f52092210fa2a1`, last committed coach change `d0739f1d` (September 22). Restores Marmalade's original eight coaching steps, normal action waits, and original overlay controls.

The story-page/name-timing block and the complete `openingSteps` function match those Git blobs exactly. The old wording is deliberately preserved, including its historical counts and dates; this is a restoration, not a further rewrite.

Retained compatibility changes: valid-child deep-link guard; focused-button keyboard and controller event isolation; completed-opening `SEARCH-RECAP` acknowledgement so the newer narrative router does not repeat orientation. Skipping still leaves that recap eligible. The corrected seed comment remains. The general How to play manual used elsewhere in the game is retained; the replacement tutorial's added Help button is removed from the coach.

## Backup and reversibility

The overwritten working-tree tutorial and coach were copied byte-for-byte before editing, along with their original diff, in [the labeled backup](../rollbacks/2026-10-28-new-tutorial/README.md). The replacement tutorial's test was also backed up before updating its expectations. There was no repository reset, commit, publication, asset change, or animation job action.

A SHA-256 comparison of 245 pre-existing source and modified tracked files found only the two tutorial runtime files changed before this note and the notes-index entry were added. Combat targeting, Dough Blob repairs, narrative content/routing, saves, map, pet art and enemy asset work are preserved. See `preservation-check.json` in the backup.

## Verification

The regression harness is `tests/tutorial-restore/run.py`. The existing `tests/tutorial-narrative/run.py` delegates tutorial assertions to it and retains checks for general Help and fort conversations/rest actions. The old replacement-specific assertions remain in the backup.

Verification results and screenshots are in `tests/tutorial-restore/`; the backup README records final results and limitations. Tests use isolated browser contexts, not the player's browser profile or saves.
