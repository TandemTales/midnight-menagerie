# Tutorial runtime round 2 — response and verification

28 October 2026. Responds to the independent `fresh-runtime-round1.md` finding that eleven sequential Help pages impose unnecessary navigation cost. This is an author implementation/verification record, not an independent regrade. No score is assigned here.

## Revision

`ui/scuffle-help.js` now opens with three plain topic groups: **Turns and resources**, **Controls and piles**, and **Marmalade**. Selecting a group shows only its two to five topic buttons. Selecting a topic shows one explanation. Haunt, Nerve, and pile shortcuts each require two selections from the index, without stepping through any unrelated explanation. This applies to first and repeat Help requests and does not add a persistent seen flag.

**All topics** returns directly to the main index. **Previous** and **Next** remain available within the selected group. No tutorial lesson is mandatory; **Back to game** and Escape remain available. The first view contains only the short choice prompt, not a page of rules. Native buttons support Tab/Enter and the real controller menu navigator. Replacing an index moves focus to the replacement choices or the selected explanation, and the modal still captures input before focus transfer and closes on scene leave.

No new mechanics, controls, art, reward or narrative state were added. The five-step battle coach is unchanged: this revision addresses the observed Help finding without adding more mandatory pre-action instruction. Its exact mechanics and event-wait repairs remain under the previous regression suite.

`03-opening-tutorial.md` now records HELP-000's metadata and exact index copy, followed by all eleven actual runtime topics under HELP-001. Earlier nine-page proposal text is replaced; the old eight-step fallback is labeled archival rather than described as current behavior.

## Verification and actual repair

`python -u tests/tutorial-narrative/run.py` passes **12 grouped checks**, including the entire previous real-game suite. New checks exercise:

- Exactly three initial groups and the choice prompt.
- Direct Haunt lookup by pointer, pile shortcuts by real keyboard Enter, and Nerve by actual `Navigator.handle` Confirm.
- Focus remains in the dialog after replacing the menu.
- Previous/Next preserve the selected group.
- Physical Escape and controller Cancel close Help without dismissing coaching or opening Settings.
- Gameplay input remains isolated, real card-play/end-turn listeners still work, and the Run handoff still reaches the map through the narrative arrival.
- No uncaught page errors.

Visual review found that adding All topics made four footer buttons overrun the framed panel. The shared modal defaults to `flex-wrap: nowrap`; the Help instance now enables wrapping and uses spacing token `--s-3`. The follow-up test checks every visible footer button against the dialog bounds. This was a real layout defect caught and repaired, not merely a successful snapshot assertion.

Inspected screenshots at 1280×800: `help-index-1280.png`, `help-resources-1280.png`, and `help-resources-1280-large.png` in `tests/tutorial-narrative/`. The three-group index is uncluttered; normal/large text and the two-row footer fit within the frame. The intentionally protruding decorative close button is excluded from the footer-bound assertion. All source files pass syntax checking.

These are automated real-browser checks and agent screenshot inspection. Physical gamepad hardware, screen-reader speech and child comprehension have not been playtested. A fresh independent reviewer must decide whether the work meets the requested quality threshold.
