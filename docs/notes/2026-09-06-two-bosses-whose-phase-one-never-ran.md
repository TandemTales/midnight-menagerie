# Two bosses whose phase one never ran

2026-09-06. Found by running every `tests/*/check.py` in the repo rather than
the six I had been touching. Three gates were red; two were the gates' own fault
and one was real.

---

## The real one

`tests/graveyard/check.py` had been reporting

    FAIL  the Groundskeeper really writes Entries  - {"entries": 0, …}
    FAIL  30 Courage in one turn Smudges it — still on the Ledger, one turn later

Confirmed pre-existing: identical two failures on a worktree at `07545aa`, so it
predates every change made today.

**The Groundskeeper opened in phase two, at full Courage, on turn one, in every
fight since 2026-09-02.** `mem.phase` was 2 before the first player action and
his first intent was a phase-two move. The Ledger — Record the Name, Turn the
Page, Review the Records, §19 through §22, the mechanic the whole boss is built
around — never ran once.

    const SOLO_MAX = 165;
    const PHASE_TWO_AT = 190;      // …which is larger than the pool
    …
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);        // -> 190
    if (m.phase === 1 && c.self.hp <= two) return 'names-should-not-be-forgotten';

`phaseAt(c, at, max)` returns `at * (self.maxHp / max)`. It rescales a threshold
only when `max` is the pool the threshold was **authored against**. One constant
was doing both jobs — the boss's shipped Courage and the denominator — so
halving it halved the denominator too, the ratio stayed 1, and the threshold
stayed at its absolute 190 against a pool of 165.

The Archivist has the same shape and was nearly as bad: `SOLO_MAX = 200`,
`PHASE_TWO_AT = 195`, so phase two began after **five Courage of a two-hundred
pool** — 2.5% in, against the chapter's 56.5%. Final Edition fired at 37.5%
instead of 21.7%.

### Why it was invisible

- Nothing threw and nothing warned.
- The two phase-two assertions directly beneath the failing one **passed
  vacuously**: `liveEntries === 0` and `frozenBefore === 0 || …` are both true
  of a Ledger that was never written.
- `tests/design-courage` is green, because the Courage numbers themselves are
  the deliberate ones.
- `tests/phase-thresholds` is green, because both thresholds *are* routed
  through `phaseAt` — which is what it checks. It cannot see that the
  denominator is wrong.

### It was predicted, in writing, and still missed

The balance pass that cut them (`b25e0c4`, 2026-09-02, n=200) says in its own
message:

> **WHAT MOVED WHICH: Groundskeeper 330 -> 165 … Archivist 345 -> 200.**

and, about a boss it decided *not* to cut:

> Cutting her to 130 moved the price 62% -> 60% and **broke her phase-two test,
> because `phaseAt` scales the threshold with the pool.**

That is exactly right and exactly the trap: `phaseAt` scales the threshold with
the pool *only if the denominator is held still*. The Governess was left alone
and stayed correct. The two that were cut took their denominators with them.

### The fix

The balance decision stands — it was measured over 200 expeditions and it
worked (graveyard 77% → 37% of pool, 75% → 25% lost). What was wrong is that one
constant meant two things, so they are now two:

    const AUTHORED_MAX = 330;   // the chapter: "Boss Courage: 330"
    const SOLO_MAX     = 165;   // what he has, after the 2026-09-02 pass
    const PHASE_TWO_AT = 190;   // §24, as a share of AUTHORED_MAX -> 95 of 165

Verified in a real fight: the Groundskeeper now runs phase one from 165 down to
93 and turns at 95 — 57.6% of his pool, which is the chapter's 190/330 exactly.
The Archivist runs 200 down to 110 and turns at 113 — 56.5%, the chapter's
195/345. `tests/graveyard` 33/2 → **35/0**; `tests/study-library` stays 50/0.

Every other boss ships `SOLO_MAX` equal to its chapter's Boss Courage — checked
across all nine that declare one — so these two were the only pair where the two
meanings had come apart.

### What it did to the fight

Two hundred seeded expeditions, same build, same seeds, only the two phase gates
different — a git worktree at `d4c0eb2` on its own server for the control:

    region             bosses      cost of pool        margin          lost
    study-library      14 -> 14    67% -> 52%      21pp -> 36pp     9 -> 6
    graveyard           5 ->  5    60% -> 62%      19pp -> 17pp     4 -> 4
    (every other wing identical, or +-1 boss of sampling)

**The Archivist got easier, and that is the direction the balance pass wanted.**
Its own "STILL OPEN, named with numbers" list opens with *"study-library 70% of
pool at a 23pp margin losing 10 of 14"* — the worst margin in the game. Giving
him back the phase one he is supposed to fight most of the fight in moves it to
52% at 36pp without touching a single balance number, because the bug was making
that wing harder than it was ever designed to be.

The graveyard is unchanged inside its sample: five boss fights out of two hundred
expeditions is not enough to separate 60% from 62%. Worth saying plainly rather
than claiming the fix was neutral there — and worth knowing that **the chosen
route thins per-region boss samples**, so a wing like the graveyard now needs a
bigger n than the 2026-09-02 pass did to say anything about its boss.

### Still open, noticed in passing

§29's final escalation — "At 70 Courage or less: Nothing Leaves Unremembered" —
**is not implemented**. It would be a third share of `AUTHORED_MAX` (21%, so 35
of the 165 he has). Left for the enemies owner; noted in the source.

---

## The two gates that were crying wolf

Both were red on correct code. A gate permanently red about something correct
teaches everyone to skim past it on the day it is right — which is the whole
argument for every other gate in this directory.

**`tests/seams` read a sprite clip as a sound.** `\.play\(` matched
`this.pet?.play('affection')` in `scenes/rest.js`; `ui/sprite.js` plays
animation clips through a method of the same name, so the gate reported the clip
that screen exists to give a home to — and which `tests/sprites` gates — as a
missing cue. The receiver decides now, and the set is read off the source:

     66  audio       ctx.audio?.play?.('ui:click')      sound
      5  this        inside game/src/audio/audio.js     sound
      1  sfx         this.sfx.play('world:heartbeat')   sound
      1  __MM_CLIPS  combat.js's clip debug handle      a CLIP
      1  pet         rest.js's Companion sprite         a CLIP

**`tests/dup-keys` read a call as a member.** Its key pattern accepts `name(`
to catch `onTurnEnd(c) { … }` — the shape the Butler bug wore — but a bare
statement call wears it too, so two `addEventListener(…)` lines in
`clubhouse.js#_wire` were a "duplicate key". A method shorthand has a BODY; a
call has a semicolon. Requiring the matching `)` to be followed by `{` separates
them, and holds even inside a frame the brace walker has misclassified — which
is what is happening there, and is the deeper half, left alone.

**`tests/phase-thresholds` read a comment as code.** It scans for
`hp <= <number>` and does not blank comments, so the note above explaining why
the Groundskeeper's gate was broken — which contains the words `hp <= 190` —
was reported as committing the bug it describes. A gate that fires on its own
postmortem. It blanks comments now, the way `dup-keys` already did.

**All three proven red before being trusted green**: a deliberately broken cue
id, an `onTurnEnd` injected twice into the Butler's move table, and a raw
`hp <= 95` phase gate. Each was reported; each went away on revert.

`tests/stdlib-shadow` also prints a `RESULT:` line now, so all thirty-eight
gates can be swept with one grep. That is how these three were found.

---

## Gates

    38 tests/*/check.py, all green
    tests/run/index.html   50 runs, 1 error (pre-existing `_losePatience`)
    tests/coop/run.py      645 · tests/vote/run.py 35 · tests/backpack 72
