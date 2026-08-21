# Round 4 — the Rescue node, and the screens that carry the ending

Owned this pass: `scenes/{title,select,clubhouse,gameover,reward,shop,rest,event}.js`
and their CSS, `ui/portrait.js`, `data/events.js`.

The reviewer's verdict was that the arc "lands, and it is the reason to finish this
game", and then named what was undercutting it. This is what changed.

---

## 1. The Rescue node

> "A game about freeing animals renders the freeing of an animal as a paragraph beside a
> wireframe box, while the beautiful painted portrait of that exact animal already sits
> in the assets folder."

Correct, and it was the worst thing in the build relative to what it was competing with.
The Curiosity vignette — a parametric cyan arch and two rectangles — was being reused for
the one screen the whole run is for.

**`scenes/event.js` `_enterRescue()` is now its own screen, not a Curiosity with a
different noun.**

- The painted portrait (`assets/portraits/<slug>.png`, 828x516) is on screen from the
  first frame, **behind a shut door**. The `-card` thumbnail paints immediately and
  `upgradeToFullArt()` swaps in the full render once it has decoded, so the plate is
  never a grey box and never a soft upscale.
- Before you act: two dark panelled doors meet in the middle with a flickering sliver of
  warm light in the crack, and the caption reads `MARMALADE · the Ghost Cat · BEHIND THE DOOR`.
- **"Open the door."** parts the doors outward over ~1.7s on a front-loaded ease, while
  the portrait lifts out of `brightness(.34) saturate(.34)` into full colour over ~1.5s,
  a warm bloom comes up, dust starts turning over in the light, the frame goes from brass
  to lit gold, and the caption becomes `FREE · 4 OF 16`.
- The outcome prose is **held back 0.7s** so the door finishes first. Landing the door and
  "Marmalade does not run…" in the same frame threw away the beat the writing is built on.
- The scene's key light flips warm (`.rm--event.is-rescue`), against the cold spectral
  key every other Curiosity uses. Same warm/cold argument as the Clubhouse against the
  mansion.
- Everything animated is a transform, an opacity or one `filter` on a composited layer;
  all durations are motion tokens, so `reduceMotion` collapses the whole thing and lands
  straight on the open state (verified: `.rs-plate.is-open` present within 300ms with
  reduced motion on).
- Re-entering an already-freed node gets the same plate in an "empty room" state —
  floorboards, an open doorway, `THE ROOM IS EMPTY` — rather than a rectangle of gradient.

Also: the outcome heading is now `Marmalade, come out` (the reviewer's comma). No other
word of the authored prose was touched.

Shots: `shots/p4-rescue-closed.png`, `shots/p4-rescue-open.png`, `shots/rs-already.png`,
`shots/rsstrip_f0..f9.png` (the door parting), `shots/rs-720.png` (1280x720).

## 2. Run-end screens printed internal ids

`ctx.run.deck` holds **instances** — `{uid, id, upgraded}` — not `CardDef`s. `gameover.js`
passed them straight to the renderer, so:

- FINAL TRICKS printed `bones/bite ×4` (`def.name ?? def.id`, and `name` was undefined)
- the WORKED HARDEST `CardView` was constructed from an instance, so its face read
  `BONES/BITE` and its type line defaulted to `SKILL` on an Attack
- the closing line rendered *"This run it was **,** right up until it was not enough."*
  because `esc(undefined)` is an empty string

`resolveCard(entry, cardById)` now normalises all three shapes that reach this screen
(run instances, `Run.snapshot()` `{def, upgraded}`, and the mock's real defs), and
anything that will not resolve is **dropped rather than printed as an id** — a run
summary that shows an internal id has already failed.

While in there:
- deck rows are keyed on `id + upgraded`, so `Bite ×5` and `Bite+` are separate rows, and
  `+` renders in the upgrade green.
- the MVP `CardView` is given `upgraded`, so a sharpened Trick shows its sharpened face.
- **`played 21×` was a lie.** It was `4 + new RNG(seed).int(38)` — a number invented on
  the spot and printed as a statistic on the screen players screenshot. Neither
  `Run.stats` nor `CombatEngine.stats` keeps a per-Trick play count, so the chip states
  the thing that is actually true: `5 copies`. **Ask for meta-run / combat-engine below.**

## 3. Three counters, one source of truth

`title.js` said `0 / 16 freed` (raw `Save.data.companionsRescued`) while `select.js` and
`clubhouse.js` said `4 / 16` (starters ∪ saves) — same save, same session, same label.

`ui/portrait.js` now exports `STARTER_COMPANIONS` and **`freedCompanions()`**, and all
three screens call it. The four starters count: they are on the corkboard, they are
pickable, they are out of the house. `select.js` re-exports `STARTER_COMPANIONS` because
`clubhouse.js` has always imported it from there.

One subtlety: `?all=1` at Select is a review door, not progress, so the grid tally reads
`freedCompanions()` while the *unlocked* set still reveals everything.

Verified live: title `4`, select `4`, clubhouse `4`.

## 4. Everything else

**Kid step opened dead.** Step 2 landed on an empty grey MISSING poster over three empty
section headers. `_pickKid` is split into `_showKid()` (fill the dossier, commit nothing)
and `_pickKid()` (commit). Hover and focus preview; click and Enter choose; walking into
the step previews the first Kid. And the three states are now visually distinct — round 3
gave hover, focus and selection the same lifted brass glow while the footer said
"Kid — not chosen":

| state | look |
|---|---|
| looking at (hover / focus / previewed) | cool spectral outline, small lift |
| keyboard focus | + dashed ring, offset |
| **chosen** | warm brass, plate lights, **tick badge** |

**Mr. Moth's inventory panel was a snapshot.** The `TRICKS / KEEPSAKES / SNACKS / CLUES`
row was written once at build time, so after buying two Snacks the HUD read 2 and the
counter underneath still read `SNACKS 0/3`. It is `_syncInventory()` now, called from
`_syncAffordable()` after every purchase. Snack fullness is recomputed there too, instead
of being frozen per row — buying the last free slot locks the rows next to it immediately.

**Safe Room upgrade preview was sticky.** The picker hung the preview off each slot's
enter/leave *and* focus/blur, so opening it focused slot 0 (showing `Scratch+`) and then
hovering `Boo!` showed `Boo!+` without ever blurring slot 0 — two `+` cards on screen with
nothing selected. `RoomScene.pickCard` now keeps one `hoverEntry` and one `focusEntry`;
pointer beats focus, focus is what is left when the pointer leaves, and a single `paint()`
puts exactly one card (plus the chosen one) in its upgraded face.

**"you have not used the fort yet" persisted after sharpening.** The hint synced only off
`bus.on('run:courage')`, and Sharpen and Sit change no Courage. `_syncFoot` is called from
`_choose` now, where `used` actually changes.

**Composition.**
- *Curiosity* — the wireframes are gone. The reviewer offered "lean into type-led layouts
  that don't need it" and that is the honest answer next to this prose. The Curiosity is a
  printed page: one 64ch measure shared by the prose, the doors and the outcome, a drop
  cap, a hairline rule, a centred header, and a faint masked "sheet" behind the column so
  the margins read as margins and not as a hole. `mood` survives as the page's ground
  temperature (`.ev-page[data-mood]`), which is all it was ever really doing.
- *Reward* — the room title sat in the top-left corner while the spoils, the heading and
  the three Tricks were all centred, leaving an L-shaped void across half the frame.
  Everything is on one axis now, and the cards are bigger (`16.6vw`, was `15vw`) because
  they are the screen.
- *Safe Room* — the fort was a 620px drawing floating in a column half again as wide. The
  art column is the same weight as the choices now and the drawing fills it (820px).

**Clubhouse blueprint covered Pixel's polaroid.** The fifth pet was pinned at `left:72%`
and the recovered blueprint (later in the DOM, same z-index) sat on top of it — a missing
pet you could not see, on the missing-pets board. The eight photographs are a 2x4 block
across the left now and the right ~24% belongs to the blueprint and the clue notes.

**Seed.** Select and Game Over both print `formatSeed()` (`009B-GALE`), and the field at
Select is **typeable** — same notation, so a seed screenshotted off Game Over pastes
straight back in. `parseSeed()` round-trips `formatSeed()` exactly and **rejects**
out-of-range input instead of folding it, because answering `ZZZZ-1234` with a different
seed is the one thing a seed field must never do. Verified: `009B-GALE` → `563431586` →
`009B-GALE`.

---

## Asks — things outside this agent's files

| Owner | File | Ask |
|---|---|---|
| ui-chrome | `ui/hud.js:450`, `ui/settings.js:166` | The run HUD and Settings print the **raw integer** (`563431586`) where Select and Game Over print `formatSeed()` (`009B-GALE`). They are the same number in two notations, which reads as three different seeds. `formatSeed`/`parseSeed` are exported from `ui/portrait.js`. |
| companion-cards | `data/companions/bones.js:610` | `'[Dig Up] a [Bury]ed Trick'` renders as **"Buryed"**. Either author it as `Buried` in plain text, or teach the keyword markup an alias form (`[Bury\|Buried]`) — the same problem will hit any keyword needing an inflection. |
| combat-engine + meta-run | `combat/engine.js`, `state/run.js` | No per-Trick play count exists anywhere. Game Over's "Worked hardest" wants one. `engine.stats` already counts `cardsPlayedThisCombat`; a `Map<cardId, n>` accumulated into `run.stats` at `_endCombat` would let that block say `played 21×` truthfully instead of `5 copies`. |
| map | `scenes/map.js` | The node hover card covers the two legal nodes below it — you cannot read what a node is and see where else you could go at the same time. Flip it above the cursor, or offset it out of the forward path. |
| ui-chrome | `ui/hud.js` | Clues and Luck are still bolted on by `RoomScene._buildHudExtras()` via `addChip()`, so they appear in the four room screens but not on the map or in a Scuffle. (Carried over from round 3.) |

## Notes for whoever comes next

- **`scenes/combat.js` and `ui/enemy.js` were unparseable for ~20 minutes mid-pass** and
  took the whole app down with them (`main.js` imports `combat.js` statically, so
  `window.MM` never existed). Both had the same bug: an **HTML comment containing a
  backtick inside a template literal** — <code>&lt;!-- … `setRule` … --&gt;</code> and
  <code>&lt;!-- … `engine.state.counters` … --&gt;</code>. The backtick closes the
  template, and the parser then trips on the next identifier. Chrome reports it as
  `Unexpected identifier 'setRule'` at a line hundreds of lines away from the real one.
  Don't put backticks in comments inside template strings; both are fixed now.
- `tools/shot.py --steps` splits on `|`, so any JS you pass through it must not contain a
  pipe. `--script` runs *before* `--steps`, not after.
- `formatSeed` is base-36 over a 31-bit seed, so eight displayed digits are always enough
  and the round trip is exact. Anything wider than `00ZI-K0ZJ` is not a seed.
