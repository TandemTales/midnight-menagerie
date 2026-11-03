# Live Safe Room journal and accessibility correction

28 October 2026. Root retains the only active browser during the six-wing playthrough; this agent did not launch a browser.

## Observed problem and source diagnosis

The Greenhouse Safe Room offered “Sit and talk” after the finite Maya and Marmalade conversations had already been read. The button opens the Discoveries journal, which still contains observations and recorded choices, but no remaining conversation. `ui/story.js` chose its label from the room name alone, independently of the journal's eligibility checks.

## Small repair

The shared journal button now reads **Discoveries** in Safe Rooms as it already does elsewhere. This accurately names the dialog both before and after optional talks are exhausted. Available conversations remain in the journal under their specific titles. The fix does not duplicate the Kid, pair, and Companion eligibility rules or create a stale promise after the final conversation is consumed. No dialogue availability, saved milestones, gameplay action, or cost changed.

The Rest and co-op Mend action readouts used HTML arrows, then stripped tags to construct their accessible names. `setAttribute` does not decode HTML entities, so the names contained literal `&rarr;`. The shared Safe Room option label construction now substitutes **to** and normalizes spaces. The visible arrow remains unchanged; the spoken label is, for example, **Rest. Courage 52 to 78**. Both readouts use this same code path.

## Validation and limits

JavaScript syntax checks passed for `ui/story.js` and `scenes/rest.js`; Python compilation passed for `tests/tutorial-narrative/run.py`. A focused addition to that existing browser suite opens the real journal with Maya/Marmalade talks eligible and again after their seen flags are exhausted, checking the same truthful Discoveries label and actual presence/absence of talk buttons. It also checks the rendered Rest accessible name contains “to” and no HTML entity. **These new runtime assertions are not yet executed**, because root owns the active browser. This is not a playtest claim. Original line endings and unrelated edits are preserved.
