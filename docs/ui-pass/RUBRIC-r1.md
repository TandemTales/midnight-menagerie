# Blind style judgment — rubric, round 1

Read `RUBRIC.md` in this folder first. Its sections **Blindness is the whole
point**, **The reference** and **Score each candidate on each screen** apply
unchanged — the same eight dimensions, the same 0–10 scale, the same bar:
**9 = a viewer could not tell this screen was not painted by the same hand as the
samples.** Be exactly as severe as round 0 was.

What changes is only **Then decide**, because the game's visual language was
chosen last round and every candidate now uses it. Your prompt names your track.

## REFINE track

The candidates are rival refinements of the same three screens. One of them may
be the screens as they are today.

- `ranking` per screen, best first.
- `winner`: the ONE candidate that should replace the current screens, judged
  across all three together.
- `screen_winners`: the best candidate on each screen, one entry per screen.
- `winner_fixes`: 5–10 concrete visual fixes that still separate the winner from
  a 9, each naming a screen and a region, most damaging first.
- `grafts`: specific ideas from the other candidates worth moving into the winner.

## EXPAND track

The candidates bring three screens into the language for the first time. One of
them may be the screens as they are today.

- `ranking` per screen, best first.
- `screen_winners`: the best candidate on EACH screen, one entry per screen. These
  can be different candidates — they share a kit, so each screen is merged on its
  own.
- `winner`: the single strongest candidate across all three, for the record.
- `winner_fixes`: 5–10 concrete visual fixes, each naming a screen, a region, and
  which screen winner it applies to.
- `grafts`: specific ideas from the non-winning candidates, with their codes.
