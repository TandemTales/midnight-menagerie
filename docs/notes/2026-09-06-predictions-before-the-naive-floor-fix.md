# Written BEFORE the fix was measured

Mechanism: the naive floor loses to the pass because both are judged by the
scorer the floor exists to correct. Fix = the floor may not lose to an EMPTY
sequence. If that mechanism is the right one, then:

1. seed 957908 `gh-12` shortens from 38 turns toward the naive line's 13.
2. Fights already at healthy `cpt` (1.5-2.6) barely move: the new clause only
   fires when the beam chose to play NOTHING, which a healthy fight never does.
3. n=200: past-30 and the longest fight both fall from 15 / 49.
4. The blast radius should track the MECHANISM, not the calendar: regions whose
   rosters carry one-turn `dmgTaken` thresholds and/or per-hit retaliation move
   most; regions with neither are ~unchanged. This is the strongest test — it is
   the prediction that a merely-plausible cause would not make.
5. Win rate must not fall. The clause only replaces "do nothing at all", and
   doing nothing is rarely better than blocking the telegraph and swinging.

Failure conditions I will report honestly if they happen:
- if (2) is violated, the clause is firing in healthy fights and is too broad;
- if (5) is violated, the floor is dragging the bot into bad turns;
- if (4) shows a flat, uniform shift, the cause is probably NOT what I named.
