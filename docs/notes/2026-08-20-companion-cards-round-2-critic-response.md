## 2026-08-20 — companion-cards, round 2 (critic response)

**445 cards, 0 errors, 0 warnings**, verified against the real `CombatEngine`.

### The gap: rarity ladders

The critic was right, and my distinctness check was the reason I missed it — it keyed on
`rarity|type|cost|target|text`, so "the same card one rarity up" passed by construction.

Rewrote it as an **effect-shape** check (`shapeOf` in `tests/cards/index.html`): strip every
number, placeholder, keyword bracket and punctuation mark, then group within a companion.
Rarity and cost are deliberately excluded from the key — "same card, different price" is exactly
what it now hunts. It found **the same nine groups the critic did**, which is a decent sign the
check is honest, and it will keep finding them.

All nine re-authored so the card changes in kind, not in size:

| was | now |
|---|---|
| `marmalade/fluff-up` — bigger Curl Up | Guard, plus 1 [Ghoststep] **if you have none** — the common that teaches the mechanic |
| `marmalade/haunting-hiss` — bigger Boo! | 3 Haunt, or **7 if the target is already Haunted** — a follow-up, not an opener |
| `marmalade/moonlit-claw` — 3rd cost-discount big hit | 16 damage, **you cannot gain Guard this turn** (new `no-guard` status, `modifyBlockGain → 0`) |
| `marmalade/final-pounce` — Spectral Scratch at rare | 18 damage; while Untouched **refunds 1 Pluck and returns to hand**, once a turn |
| `marmalade/across-the-veil` — Moonlit Claw at rare | **Spend all Ghoststep**, 11 piercing damage per stack — defence converted to offence |
| `marmalade/spectral-stampede` — Ricochet Cat at rare | 5 damage per **Life spent this combat** (cap 8) — the Nine Lives archetype's finisher |
| `bones/sit-stay` — bigger Sit Pretty | 7 Guard and **[Retain]** — held defence |
| `bones/shake-it-loose` — byte-identical to Shake, Boy! | Shed 1, **next Trick costs 1 less** — a tempo enabler |
| `bones/fetch` — byte-identical to Go Get It! | **Shed 1, then** Fetch — the Rattle/Fetch bridge |
| `bones/smell-something` — Sniff Around +2 | Look at top 5 and **Bury one** — a tutor into the Buried zone |
| `pipkin/big-breath` — Puff Up +1 Guard | 1 Plump, **draw 1** |
| `pipkin/inflate` — Puff Up at uncommon | 2 Plump; **at maximum Plump gain 1 Pluck — and Heavy Feet with it** |
| `taffy/pinch-a-piece` — Pinch Off +2 Guard | Split 1, **3 Guard per Glob you have** (keeps them, unlike Little Recombine) |
| `taffy/pull-it-long` — byte-identical to Long Pull | Stretch, **then draw 1** — answers Stretch's hand congestion |
| `wink/web-patch` — Silk Screen at common | Guard plus **1 Web to every enemy** |
| `wink/tighten-the-silk` — Loose Thread at common | **3 Web, then Preview 1** — Web plus information, not Web conditional on it |

Marmalade's three 2-Pluck attacks now occupy separate structural roles rather than three prices:
Moonlit Claw is flat damage with a real drawback, Ambush from Nowhere is the cost-discount card
(doc-faithful), Across the Veil converts Ghoststep into piercing damage.

### Numbers

`leave-a-life-behind` 24 → **15** Guard (up 20). `claws-in-the-dark` 6 → **9** base.
`the-last-thing-they-see` 12 → **15**, and the execute now checks Courage **after** the hit
(threshold 15/20) so it scales with your damage buffs instead of being a dead 25 HP window.
`taffy/elastic-orbit` 13 → **15**. `wink/gotcha` 9 → **8**. `wink/spiders-paradox` 13 → **15**.
`neutral/big-swing` 14 → **16**.

Rather than silence the last false positive, cards may now declare `balance: { scalesWith: '…' }`;
the validator then skips the damage **floor** for them and still enforces the ceiling. Only
`claws-in-the-dark` uses it, and it says why.

### Engine round 2

Removed the `trackerCtx` fallback branch — `engine.ctxFor(null, null, 0)` is the whole thing now.
Confirmed nothing under `data/companions/**` reads `engine.state`. `ctx.chooseCard`, `choose`,
`chooseEnemy` and `discard(n,{choose:true})` matched the shapes `_util.js` was already written
against, so the ~70 "choose" cards now prompt the player instead of auto-picking, with no card
edits. The Wink intent-queue names matched too, and `intentFamilyOf` returns the capitalised
labels `wink.js` compares against — his Preview/Read/reorder pool is live rather than shadowed.

New statuses this round: `no-guard`, `next-trick-discount`, `next-attack-discount` (28 total).

---
