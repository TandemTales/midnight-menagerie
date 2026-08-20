# Map agent — round 3: the Safe Room guarantee, and making the route graph visible

2026-08-20. Files touched: `game/src/state/mapgen.js`, `game/src/scenes/map.js`,
`game/src/scenes/map.css`, `game/src/ui/mapnode.js`. All owned by this agent.

---

## 1. Guaranteed Safe Room before the boss

The balance agent's whole-region simulator put the survival gap on one line: **0.7
Safe Room rests per expedition**. The old rule was an 80% chance of one Safe Room
placed *two* rows before the boss, so it could be routed past and one sheet in
five did not have one at all. Measured over 30 Foyer maps: **the minimum number
of Safe Rooms on any root-to-boss path was 0 on every single sheet.** A player who
routed for anything other than rest could reach the Butler having never sat down.

**Every room on the last walkable row is now a Safe Room** — the floor-15 rule
from Slay the Spire. Every node on that row feeds the boss and nothing else does,
so there is no route that misses it and no routing decision to get wrong. Two
existing constraints were deliberately re-read rather than broken:

* *"Never two Safe Rooms in a row."* The rule that matters is along a **path**,
  and it still holds — measured 0 consecutive-Safe path segments across 30 maps
  per region. The rooms on the door row are alternatives, never a sequence, and
  because the general placement rule forbids a Safe Room adjacent to another, no
  room on the row that *feeds* the door can be one either.
* *"Never a Safe Room on row 14 whichever way you count it."* In a 15-row wing the
  pre-boss row **is** row index 13. The superstition does not get to cost the
  player the run; it still applies everywhere else.

The door row is **in addition to** the wing's own Safe quota, not instead of one
of them. Taking it out of the quota measured as one extra rest per expedition
rather than two, and left the boss's door as the only deep place to sit down.

### Two things this broke, and the fixes

**(a) The wing never actually closed towards the boss.** `wantAt()` asks for two
rooms on the last row but the trim loop ran `r < lastWalk`, so the random walks
left a mean of **4.5** rooms there — a wing that fans *out* at its far end. With
the whole row given over to Safe Rooms that was also four blanket forts and four
content slots gone. The trim now includes `lastWalk`, and `wantAt(lastWalk)` is 3
so the trim leaves **3–4**. Not two: narrowing further makes the band into it
3 → 3, which by the crossing-free staircase theorem quoted at the top of the
generator *forces* a single-exit room where there was none — measured, single-exit
rooms went 19.7% → 21.8% and `tests/map/run.py` failed on it. Four ways to the
boss, every one of them a rest.

**(b) Big Scares became unavoidable, and region survival went DOWN.** Before this
change, **74 of 184** Big Scares across 30 sheets sat on the door row and another
59 on the row before it — i.e. three quarters of them were parked where a player
heading for the boss simply went round, and the bot met 0.8 per expedition against
a graph average of 1.21. Taking the door row out of the content pool pushed them
forward into the narrow rows that feed it, where **every** route had to fight one,
on the way to a boss it now had no Courage for. Elite win rate 69% → 54%,
region survival 46.7% → 40.0%.

Two fixes, both principled rather than tuning:

* **Every Big Scare must be avoidable.** A named horror you cannot route around is
  not a decision, it is a toll. The placer now runs the same "is the boss still
  reachable if you refuse to enter any of these" BFS the hazard placer already
  runs for its wings, and rejects a placement that would make the set of Big
  Scares unavoidable.
* **Big Scare quota 0.11 → 0.065 of the sheet.** 0.11 was 5.7 named horrors on a
  58-room wing. Slay the Spire puts **two** elites on an act-one map of this size.
  Three is the ceiling now for an ordinary wing; a haunted one still earns its
  extra, and hauntLevel ≥ 3 still adds one.

### Numbers

`python tests/critic-design/sim.py --n 60 --bots naive,competent --policies balanced --seed 90000`,
Foyer, haunt 0, same machine, back to back. Before = `bd23414^`-era generator.

| | before | after |
|---|---|---|
| **region survival, competent** | **40.0%** | **50.0%** |
| **region survival, naive** | **18.3%** | **33.3%** |
| reached the boss, competent | 58.3% | 68.3% |
| boss win rate, competent | 68.6% | 73.2% |
| Big Scare win rate, competent | 71.2% | 79.6% |
| Big Scare fights per expedition | 1.20 | 0.72 |
| Safe Rooms entered per expedition | 1.47 | 1.70 |
| rests taken per expedition | 1.0 | 1.2 |
| Courage at the boss door (mean / p25) | 59.8 / 48 | 59.9 / **53** |
| deaths at a Big Scare / at the boss | 20 / 11 | 11 / 15 |
| **guaranteed Safe Rooms on the worst path** | **0** | **1** |

`n=30` was too noisy to steer by — the same before-configuration measured 46.7%
at n=30 and 40.0% at n=60. Everything above is n=60. The same caveat applies to
the headline "0.7 rests per expedition" that started this: at n=30 the unchanged
generator measures 0.7, at n=60 it measures 1.0. The *shape* of the finding was
right — the worst path had no rest at all on every sheet — but the size of the
lever was smaller than 0.7 → 1.7 suggested.

### The 60–75% target is not reachable from here, and here is the arithmetic

Region survival in this simulator **is** "won the boss": survivors = expeditions
that reached the Butler × the rate they beat him. So

```
region survival = P(reach the boss) × P(win the boss)   ≤   P(win the boss)
```

At 68.3% reached and 73.2% boss win we get 50%. To land at 60% with a realistic
ceiling on P(reach) of ~0.85 the boss must win **≥ 71%**; for 75% it must win
**≥ 88%**. The balance agent's own stated band for the boss is **45–65%**. The two
targets are mutually exclusive: with the Butler inside his band, whole-region
survival cannot exceed 65% even if nothing before him ever kills anybody.

Everything the map can contribute has been contributed — pre-boss attrition is
down from 41.7% to 31.7%, the guaranteed rest is unmissable, and Courage at the
door has come up at the bottom of the distribution (p25 48 → 53) which is exactly
the population that was dying. **The residual is content**: either the Butler's
band moves up, or the whole-region target moves down. Flagging for the balance
owner rather than papering over it by making the map easier — I could hit 60% by
deleting Big Scares, and that would be a worse game.

Also worth knowing for whoever picks this up: the prediction that motivated the
change ("boss 15% → 45.8% with one extra rest") came from `sweep.py`, not from
`sim.py`, whose boss was already at 68.6% before any of this. The direction was
right; the magnitude was measured on a different harness.

---

## 2. The route graph was invisible

The biggest defect on the screen and worth writing down, because the mistake is
easy to make again. STS2-REFERENCE §5's map rule has two halves and only one was
implemented: *"available next nodes are highlighted"* — yes — *"and everything
else is dimmed"* — which had been read as *and everything else is erased*.

Measured on the live DOM, 112 edges on the Foyer at seed 42, four rooms in:

| tier | before | after |
|---|---|---|
| open (walk it now) | 6px, α1.0 | 6.4px, α1.0, halo 18 |
| walked | 6.4px, α0.95 | 6.4px, α0.95, halo 18 |
| **ahead of you (26 edges)** | **2.4px, α0.34, halo 5 @ α0.2** | **4px, α0.72, halo 13 @ α0.7** |
| **cut off (80 edges)** | **1.8px, α0.15, halo none** | **2.8px, α0.38, halo 8 @ α0.38** |

At the 0.92 fit zoom that is 2.2 and 1.7 screen pixels respectively, in
`#111829`, over several hundred navy lines of the same weight. A corridor you may
not walk *this turn* is not noise; it is the entire reason the screen is a graph
and not a list of two buttons.

Making the pencil heavier was **not sufficient on its own** — the first A/B pair
of screenshots showed barely any difference, because the plan and the route were
competing on equal terms and the route lost on count. The comment in `_layInk`
had said the right thing for months ("the plan is GROUND, not figure") while
drawing it at `globalAlpha 0.74`. The architecture now sits at **0.52** (bleed
0.24 → 0.16), which leaves the wing completely legible as a building while
letting the pencil read as something laid *on* it. Together with the widened
parchment halos — which carve a real clear channel under every line — that is
what actually fixed it.

"Where you may go" stays unmistakable through colour + solidity + arrowhead + the
breathing pencil ring on the node, which is a far stronger signal than being the
only visible line on the paper. Slay the Spire draws its whole graph at full
strength too.

**Can you plan three rooms ahead?** Measured by walking the rendered DOM forward
from where the player is standing (seed 42, two rooms in):

```
depth 1   2 rooms   weakest edge: open,  α1.00, 5.9 screen px
depth 2   3 rooms   weakest edge: ahead, α0.72, 3.7 screen px
depth 3   4 rooms   weakest edge: ahead, α0.72, 3.7 screen px
                    13 rooms visible within four steps
```

Screenshots: `shots/map-r3-edges-before.png` and `shots/map-r3-edges-after.png`
are the same seed, same walk, same everything, with only the edge weights and the
plan alpha differing. `shots/map-r3-planahead.png` is the plannable sheet.

**One real bug found while doing this.** `reachableFrom(map, null)` returns what
is reachable *from* the seeds, so at the door the entire first row was not in the
set, and every edge leaving row one was classified "no route from here" and drawn
at the faintest weight there is — at exactly the moment the player is reading the
sheet for the first time. Standing at the door, the first row is ahead of you.

*A methodology note, since `tools/shot.py` warns about this and it caught me
anyway:* the first "before" screenshot at `--wait 4.5` landed mid-`mm-wipe`, with
the sheet clipped at 40% and two thirds of the wing simply absent. It looked like
a catastrophic bug. The entrance sweep can start as late as ~3.3s after load on a
slow first raster; **use `--wait 9` for map screenshots.**

---

## 3. Hazard banners were sitting on node icons

Confirmed and measured: **five marks covered, the worst by 2,211 px²**.

There is nowhere on this drawing that the old banner fits. It is ~300px of solid
ink; rows are 125px apart and a mark is 106px wide, so the clear paper between
them is nineteen pixels. Hanging it off the outside of the wing boundary just
moves it onto the neighbouring lane's rooms instead (tried it, measured it, still
five clashes).

So the plan is now **keyed the way a real drawing is keyed**: the wing carries its
symbol in a 40px roundel with a leader back to its boundary, and the margin
carries the legend. It is the same glyph the bar's note already wears, so the two
read as one thing. The roundel's position is chosen by measuring — six candidate
spots just outside the boundary, scored against every mark on the sheet,
least-covered wins. The full name and rule are still on the bar note, on every
affected room's hover card, and — new — in each affected node's `aria-label`,
since a symbol is not something a screen reader can key.

**Now 0 icon clashes** across seeds 42 and 7, walked and unwalked, at fit zoom and
zoomed in. Boundary padding also went 0.045 → 0.062 of the sheet height so the
line itself keeps a full mark's radius clear of its members.

---

## 4. Node labels overlapped

Lanes sit 129 sheet-px apart and a counter-scaled mark plus its name is ~125 of
them, so a room's name lands on the next lane's icon the moment the lane jitter
closes the gap. That is what put "Formal Dining R…" under the "Music Room" chip.

Measured before, zoomed in on a fresh Foyer sheet: **61 chips shown, 23
chip-on-chip overlaps and 5 chip-on-glyph overlaps.**

There is no CSS for this — it is a placement problem, so it is solved as one,
analytically, in sheet coordinates (`_layoutLabels`). Each visible chip tries a
short ladder of vertical offsets (in place, nudged down, flipped above its own
mark, further out) and takes the first that touches nothing. Priority decides who
gets the good slot: where you are standing, then the boss, then the rooms you may
enter, then the rest. Only the last group may be dropped, and only when nothing
clears — a chip that cannot be read is worse than no chip. How big a mark counts
as depends on what it is wearing: a lit room has the pencil ring round it and
nothing may touch that; a quiet room is only its glyph.

It runs on state changes and when the counter-scale or the is-close threshold
steps, never per frame. Widths are measured once, in a single batched layout read
at build.

**After: 53 chips shown, 0 overlaps of either kind, 9 dropped.** At fit zoom
(4–6 chips) nothing is ever dropped.

---

## 5. Wing / Row / Floor

The two halves of the address now read as one thing — same capitalisation, same
bold numeral, same "N of M": `Wing **1** of 17 · Row **4** of 13`, and the hover
on either one explains the pair. Before the door it reads `Row — of 13 — at the
door`; at the boss, `Row 13 of 13 — the boss`. The hover card already said
"Row 1 of 13 in this wing".

**Not fixed, because they are not my files — please pass to the integrator:**

* `game/src/ui/hud.js:278` renders `Floor ${floor}` in the shared HUD strip, which
  is mounted **on the map screen**. So the sheet currently says "Wing 1 of 17" in
  the banner and "Floor 1" in the strip above it, for the same number. Measured
  live: `.mm-hud__where` reads `"The FoyerFloor 1"`. Suggest `Wing 1 of 17`.
* `game/src/scenes/gameover.js:371` — `<b>Floor ${s.floor}</b>`, and lines 252/256
  render the same number again as `Expedition ${s.floor}`. Three words for one
  quantity. Suggest "Wing" throughout; the mansion has seventeen *wings* spread
  over several floors, so "Floor" is also factually wrong.

---

## 6. The legend's nine node types

All nine are real, distinct and generated. Averaged over 20 sheets per region:
22 Scuffles, 10 Curiosities, 8 Safe Rooms, 6 Unsurveyed, 3–4 Big Scares, 3
Treasures, 2 of Mr. Moth's, 1 Rescue, 1 Boss.

* **Unsurveyed is not a second Curiosity.** `run.js:_unknownAs` resolves it on
  entry into a Curiosity (50), Treasure (16), Scuffle (20) or shop (14). It is
  Slay the Spire's `?` and it earns its symbol.
* **Rescue is conditional** — it exists only while that wing's Companion is still
  trapped, and the Heart has no Companion at all, so it never appears there.

So the key is now a key to **this** drawing: it lists the marks actually on the
sheet. Verified: the Heart prints eight, every other region prints nine. Printing
a symbol for a room the player will not find is the kind of small lie that makes a
key untrustworthy.

**Terminology fixed:** the shop node's label was "Lost Things", which is also the
name of the currency, while the shop itself is "Mr. Moth's". The node is now
`Mr. Moth's` (`NODE_INFO[SHOP].label`), matching what `ui/tooltip.js`'s own
`NODE_TEXT` already called it. Its reward line still reads "Spend Lost Things",
which is now the only place that phrase appears and it means the currency.

---

## 7. The shared tooltip — adopted in part, and why not in whole

`ui/tooltip.js` is genuinely good and its `data-tip-avoid` occlusion scoring was
built for this case. But the literal request — delete the map's renderer and use
`data-tip-node` + `data-tip-avoid` — **loses information the playtester singled
out as the best thing on the screen**, so it is not what happened.

`data-tip-node="scuffle"` renders: a type name, a one-line generic description,
and whatever `data-tip-room` holds as a subtitle. Against the map's card:

| | map card | `data-tip-node` |
|---|---|---|
| room name as the heading | yes | demoted to subtitle |
| the type | yes | yes (as the heading) |
| flavour | authored per type | one generic line |
| `YIELDS …` | yes | **missing** |
| wing condition + its full rule | yes | **missing** |
| `Row 5 of 13 in this wing` | yes | **missing** |
| `you may go here` / `already walked` / `no route from where you are standing` | yes | **missing** |
| the hand-inked map glyph | yes | a different icon set |

Four of the eight rows are the ones that make it a decision aid rather than a
label. There is also a look problem: `.mm-tip` is `--text-hi` on a dark panel, and
the map is a paper world — a dark game-UI panel over the parchment reads as a
different application.

**What was adopted is the part that was actually better: the placement.** The map
had a fixed ladder (left, then above, then below, then right) reasoned from
"depth runs west to east, so the fan leaves to the right" — true on average and
wrong often enough, since a long passage or a lane change can put an outgoing edge
anywhere. It now does what `tooltip.js` does: builds the avoid set from the real
`.mi-edge` paths leaving this node, scores all four sides by viewport fit minus
occluded area, and takes the best. Left keeps a small bias because that is ground
already walked.

Measured over the legal nodes at three different walk depths and two seeds: **0
outgoing edges covered by the card, in every case.**

Happy to revisit if the shared panel grows descriptor-level support for a
parchment skin — the content could then be handed over as a custom node and the
map would keep its card while losing the duplicate renderer.

---

## Verification

* `python tests/seams/check.py` → **1571 call sites, 0 problems**
* `python tests/run/run.py` → **50 runs, 0 errors**, determinism 5/5, resume 3/3
* `python tests/map/run.py` → **23 passed, 0 failed**
* Live DOM probes at 1920×1080, seeds 42 and 7, walk 0 and 4, fit zoom and zoomed
  in: 0 label overlaps, 0 hazard-key/icon overlaps, 0 tooltips covering an
  outgoing edge, 0 console errors.
* Every region generates: door row 3–4 rooms, **all Safe**, on 13-, 14- and
  15-row wings; legend 9 everywhere except the Heart's 8.
* Screenshots: `shots/map-r3-edges-before.png`, `shots/map-r3-edges-after.png`,
  `shots/map-r3-planahead.png`, `shots/map-r3-before.png`, `shots/map-r3-after.png`.
* Sim artefacts: `tests/critic-design/sim-map-before60.json`,
  `sim-map-after.json`.

## Note for the integrator

Two commits by other agents (`c0a26e2`, `bd23414`) swept parts of this round's
working tree into themselves mid-session. No work was lost and nothing needs
undoing — recording it only so the map changes in those commits are not mistaken
for their authors'.
