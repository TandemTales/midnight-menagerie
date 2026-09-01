# The Foyer is attrition, and the ledger could not see it

2026-08-31. The previous handoff asked one question about the front half of the
ladder: are the twelve early Foyer deaths **the content** or **the opening
deck**? Every number here was run against this tree; none is carried forward.

The answer is neither, and the reason the question had two options instead of
three is that the cost ledger could not see depth.

## What the ledger could not say

`tests/run/run.py` priced a fight by REGION. One Foyer row averaged a row-0
Scuffle fought out of the starting twelve cards together with the Butler on row
12 — which are precisely the two halves of the Foyer's 28 defeats, 16 at the
boss and 12 before it. One number cannot separate them and the two have
opposite fixes.

Two columns were missing and one was recorded but never printed:

* `row` was not on the ledger row at all.
* `hpBefore` **has been recorded for every fight since the ledger existed and
  was never printed** — and it is the whole difference between "the boss costs
  too much" and "the player arrives broke".

Both are in now, as `the first wing, by depth` and `what the player brings to
each boss door`.

## The answer, in one row

    region   bosses  courage in  arrives at  boss costs  of pool  margin  lost   won hp/deck   lost hp/deck
    foyer      29       61.3        85%        46.4       64%     21pp     15    95% / 14.2    76% / 14.6

The winners and the losers arrive at the Butler's door **with the same deck**.
14.2 cards against 14.6 — the losers are carrying slightly more. What separates
them is Courage: **95% of the pool against 76%.**

So it is not the deck, and the depth table says it is not the content either —
the ordinary rooms are cheap and the bot only meets about four of them:

    row  fights  what                   cost   % of pool  turns  deck  courage in  lost
     0     40    scuffle 40             14.2     20.3%     6.3   10.0     100%      0
     1     35    scuffle 35              7.5     10.6%     5.2   11.0      80%      1
     2     14    scuffle 14             22.1     30.8%     5.2   12.0      68%      3
     3     11    scuffle 11             14.1     19.6%     5.5   11.9      75%      1
     …
    12     29    boss 29                46.4     64.2%    13.6   14.4      85%     15

It is **attrition**. The wing costs about a pool to walk, the rests give most of
it back, and the player arrives at 85% in front of a boss priced at 64%.

## Why that is arithmetic and not an opinion

Margin — arrival minus price, in points of the pool — predicts the boss loss
rate across every wing that has a real boss, monotonically:

    margin    0pp   20pp   21pp   35pp   54pp   75pp
    lost      2/2    4/5   15/29   1/3    0/1    1/5
              graveyard  greenhouse  foyer  lampworks  nursery  sleeping-quarters

**Arrival cannot exceed 100%.** So while the Butler costs 64% of the pool the
Foyer's margin has a ceiling of +36pp, no matter how well the wing is routed,
rested or drafted. Every wing measured at or below +21pp loses at least half of
its boss fights. That ceiling is the finding.

## The committed anchor is under-powered, not stale in its numbers

`tests/critic-design/sweep-butler-final.json` is dated **2026-08-29** and reads
68.8% win / 51.46 cost / 64.25 at the door, on **8 loadouts**. Since it was
written the Butler changed once (`677ec48`, nine lines of `tellFn` — wording for
parties, no numbers), and `data/events.js` and `state/run.js` both changed on
08-31.

Re-run today at the committed configuration: **60.4%**, cost 55.17, door 61.52,
and **7 of 8** generating expeditions reach the door instead of 8.

Re-run properly powered — 24 generations, n=96, **22 loadouts**:

    Butler pool   win%   turns   cost
       x1.0       62.5   11.57   51.73
       x0.9       77.1   10.47   46.77
       x0.8       81.3    9.47   40.57

**62.5% on 22 loadouts is within noise of 68.8% on 8.** There is no Butler
regression to repair. What the committed anchor actually is, is under-powered:
eight loadouts cannot resolve a six-point difference, and it has been quoted as
though it could. `sweep-butler-2026-08-31-powered.json` is the replacement.

## What the Curiosity fix cost, measured

Same sweep, same seeds, with `data/events.js` reverted to `24cf02c^`:

                        loadouts   win%   cost    at the door
    pre-Curiosity-fix       8      64.6   55.6      65.88
    current                 7      60.4   55.17     61.52

The fix costs about **4.4 Courage of arrival** at the Butler's door, and one
generating expedition in eight. That is a real downstream price that was never
measured, and it is in the direction of the problem.

## And the fix did not move the number it was named for

The handoff's headline defect was that **a Curiosity paid 0.97 Keepsakes per
visit.** The purse table on this tree:

    room        visits   keepsakes   per visit
    curiosity     105        97        0.92

0.97 to 0.92. What changed the end-state distribution was the ROUTE change
(`EXPEDITION_WINGS = 6`), which cut Curiosity visits per run from about 6.8 to
2.6. The per-visit rate is essentially untouched, because `pickEventOption`
scores `relic` at 30 — far above every other term — so the bot steers to
whichever options still pay, and eight of them still certainly do.

The events work was a genuine repair of the *text*: the risk and reward lines
are derived from the outcomes now and no longer say untrue things. It was not a
repair of the *economy*, and HANDOFF credits it with both.

## Two negative results, recorded so they are not re-run

**The map is not starving the player of rests.** Measured over 5100 generated
sheets: nothing but a Scuffle exists before row 2 in any region — every quota
rule's floor is `row >= 2` or deeper — but the shallowest *reachable* Safe Room
sits behind only **1.98 fights**, and a route to the boss's door exists behind
about 2.5.

**And moving the rest floor earlier does not save anybody.** `NodeType.SAFE`'s
`n.row >= 4` has no stated reason and sits at the elite floor, which does; SHOP
and TREASURE sit at 3. Setting it to 3:

    foyer defeats     28 -> 28
    reached the door  29 -> 33
    lost at the door  15 -> 18
    victories          7 ->  8

The deaths moved from the corridor to the boss door, one for one. Reverted. A
wing whose defeat count is unchanged by where its rests are is not being killed
by its rests — which is the same conclusion the margin ceiling reaches from the
other side.

## What is actually on the table

The only lever with headroom is the Butler's price, and the curve above costs
it: `x0.9` buys 62.5% -> 77.1%.

That is a **design decision, not a repair.** The Butler has not drifted; it has
always been about this hard, and making the first boss easier is a call about
what the first wing is for. The measurement is here so that the call can be
made against numbers instead of against a stale eight-loadout anchor.

## A trap that cost this session a round

`grep -c $'\r$'` **does not work in the Bash tool.** The `\r` is eaten before
grep sees it, the pattern collapses to `$`, and it then matches EVERY line — so
every file reads as 100% CRLF and the count is just the line count. Checked
this way, `tests/run/index.html`, `data/events.js` and `state/mapgen.js` all
looked like CRLF and HANDOFF-PROMPT's line-ending list looked wrong on three
counts. All three are LF and the list is correct.

Count the bytes instead — `raw.count(b"\r\n")` against `raw.count(b"\n")` — and
keep using `git diff --stat` against `git diff --ignore-cr-at-eol --stat`, which
is independent of the shell and was right throughout. The real census of this
tree: **1750 CRLF files, 377 LF, 10 mixed.** Everything under `docs/notes/` is
LF; `combat/engine.js` and `state/run.js` are CRLF, as documented.
