# Crinkle, the Paper Crow

_**NOT from the design doc.** Every other chapter in this folder is carved out of
`Midnight Menagerie Design.docx`. Crinkle has no chapter there and never did —
his entire specification in the source is one line in `00-core-overview.md`:_

> **Crinkle** — The Paper Crow — Card duplication, folding, transformations and
> fragile high power effects.

_This chapter was written on 2026-08-28 to unblock the sixteenth Companion, from
that line plus everything else the doc already says about him:_

- `01-mansion-structure.md` §7 — his region is **the Grand Study and Library**,
  his boss is **the Archivist**, and "Crinkle related paper doors can appear
  after his rescue". Bookshelves rotate; a map can temporarily become a doorway
  into the region it depicts.
- `00-core-overview.md` — "Crinkle knows how the house changes its floor plan."
- `01-mansion-structure.md` — "Interprets maps, written clues, hidden documents,
  and paper mechanisms."
- `kids/02-mateo-pepper.md` — a Ghost Written sentence can appear folded into
  Crinkle's paper form, and he reacts indignantly.
- The art direction already settled: "folded paper crow: every edge straight,
  every plane a flat facet."

_It is therefore a reconstruction, not a transcription._

_**The designer accepted it on 2026-08-29**, on a review that checked it against
the build rather than only reading it. Every Trick named in this chapter is
implemented, and nothing is implemented that this chapter does not name — 90
against 90, zero drift in both directions, counting the five co-op Tricks. The
numbers in §2 are the numbers in `data/companions/crinkle.js`: Paper caps at 8
and at 16 under Paper Everything, the Crease multiplier is `1 + n/3` (so ×1⅓,
×1⅔, ×2, and Deckle Edge doubles the step to give "an additional third"), cost
is `max(0, cost - n)`, Overfolded is 3, and Fourth Crease raises the cap to 4
while leaving "Overfolded" at three or more. `tests/crinkle/run.py` is 44 effect
assertions and green._

_Two things the designer-authored chapters carry that this one does not,
recorded here so its brevity is not mistaken for completeness. There is no
per-mechanic **"what stops this from becoming universally optimal?"** audit —
compare Wink §144, Hush's four closing sections, Mossbit's final structural
audit — which is where those chapters keep their balance reasoning. And the
pools below are one-line summaries of each Trick's core effect rather than full
card text with per-card design notes, which is most of why this chapter runs to
369 lines where its siblings reach 700–800. Both are additions, not
corrections: nothing here is known to be wrong._

_The implementation follows this file, so changing this file is still how you
change him._

---

# 1. Overall gameplay identity

Crinkle is a **card-manipulation** Companion. Every other Companion in the roster
changes the board — the weather, the garden, the graveyard, the enemies. Crinkle
changes **the Tricks themselves**.

He does three things nobody else does:

- He **copies** a Trick, cheaply and repeatedly.
- He **folds** a Trick, making it permanently stronger and permanently cheaper —
  and, past a point, permanently fragile.
- He **refolds** a Trick into a different one entirely.

The central tension is a single sentence:

> **A folded Trick is the best card in your deck, right up until the fold you
> cannot take back.**

Folding is one-way. Paper does not unfold. The third Crease makes a Trick
enormous and free and destroys it the moment you use it, so every Crinkle deck is
a running argument about whether to stop at two.

He is the most **deck-aware** Companion: his good turns come from knowing what is
left in the draw pile, which Tricks are worth the Paper, and which of them he is
willing to lose.

---

# 2. Signature mechanics

## Paper

Crinkle's combat resource. **He holds up to 8.** It resets between Scuffles.

He gains Paper whenever one of his Tricks **Vanishes** — which his own deck does
constantly — and from several Tricks directly. Paper is spent on **Trace** and
**Refold**, and a handful of Tricks read the number without spending it.

Paper is deliberately abundant and deliberately not free: almost everything he
wants to do costs some, and the two things it buys compete.

## Crease, and Fold X

**Fold X** puts X **Creases** on a Trick in your hand. **A Trick holds at most 3.**

A Trick with Creases is changed for the rest of the combat, wherever it goes:

| Creases | Its numbers | Its cost | On play |
|---|---|---|---|
| 0 | printed | printed | normal |
| 1 | ×1⅓ | −1 (minimum 0) | normal |
| 2 | ×1⅔ | −2 (minimum 0) | normal |
| 3 | **×2** | **0** | **it Vanishes** |

Creases are permanent. They survive being discarded, shuffled and drawn again —
a folded piece of paper stays folded. This is what makes Crinkle's deck get
genuinely better over a long fight rather than just cheaper for a turn.

## Overfolded

A Trick at **3 Creases** is Overfolded. It is twice its printed size, it costs
nothing, and playing it removes it from the combat.

Overfolded is not a punishment. It is the payoff, and it is the cost, and it is
the same event. Several Tricks care about Overfolded specifically — some reward
you for having one in hand, some for playing one, and one Rare Power lets him
keep them.

## Trace

**Trace** a Trick in your hand: put a **Paper Copy** of it into your hand.

The copy:

- costs **0**,
- carries the original's **Creases** (so tracing an Overfolded Trick gives you a
  second enormous free one),
- **Vanishes** when played,
- **cannot itself be Traced**, and
- does not exist after the Scuffle.

Trace is Crinkle's engine. It is also how a fragile deck gets a second use out of
the thing it is about to destroy.

## Refold

**Refold** a Trick in your hand: it becomes a **different** Trick from Crinkle's
own pool of the same type — Attack for Attack, Skill for Skill — **keeping its
Creases**.

Refolding is transformation, not selection: the result is random. A Refolded
Overfolded Trick is still Overfolded, which makes Refold the answer to "I folded
the wrong card three times".

Several Tricks narrow the randomness (same cost, higher rarity, your choice of
two) and those are among his best Uncommons.

---

# 3. Major strengths

- The only Companion whose **deck improves permanently** inside a fight.
- Extraordinary single-turn ceilings: an Overfolded Trace of an Overfolded Rare
  is four times a printed effect for nothing.
- Excellent at fixing a bad draw — Refold turns a dead card into a live one.
- Cost reduction that compounds with everything, including other Companions'
  discounts in a party.
- Long fights suit him: every turn spent folding pays for the rest of the fight.
- Very strong with expensive Rares, which is exactly where other decks struggle.

# 4. Major weaknesses

- **Folding is one-way.** The third Crease cannot be taken back, and neither can
  a Refold that gave you something worse.
- His deck **shrinks**. Overfolded Tricks leave the fight when used, and a
  Crinkle who folds greedily runs out of cards to draw.
- Setup-heavy: a turn spent folding is a turn spent doing nothing to the enemy.
- Paper Copies are Paper — they Vanish, so a copy-heavy turn leaves nothing
  behind.
- Refold is random, and randomness is worst exactly when the situation is
  specific.
- He has no defensive mechanic of his own. His Guard comes from ordinary Skills
  that happen to be folded.
- Against a fight that ends in three turns he is simply worse than everybody.

---

# 5. Recognizable archetypes

### The Copyist
Trace constantly. Every turn is the same good Trick two or three times, paid for
in Paper rather than Nerve. Wants cheap Paper generation and one excellent card.

### Deep Folds
Pick one Trick early and put all three Creases in it. Build the whole deck around
drawing it, copying it, and getting more than one use out of the turn it dies.

### The Refolder
Treat the hand as raw material. Refold anything unwanted, keep the Creases, and
accept that the deck at the end of the fight is not the deck at the start.

### Paper Economy
Vanish everything. Every Vanish is Paper and Paper is everything. The lightest,
fastest version of him and the one that runs out of deck first.

### Fragile Perfection
Overfold on purpose, everywhere, and win before the deck is gone. The highest
ceiling and the shortest fuse in the roster.

These compete for the same Creases and the same Paper. A deck that tries to be
all five folds nothing far enough.

---

# BASIC STARTING DECK

10 Tricks.

| Trick | Type | Core function | Qty |
|---|---|---|---|
| Paper Cut | Attack | 1 Nerve. Deal light damage. | 4 |
| Flatten | Skill | 1 Nerve. Gain light Guard. | 3 |
| First Fold | Skill | 1 Nerve. Fold 1. Gain 1 Paper. | 1 |
| Trace It | Skill | 1 Nerve. Trace a Trick in your hand. | 1 |
| Scrap Paper | Skill | 0 Nerve. Gain 2 Paper. Vanish. | 1 |

The starter shows all three verbs once and none of them twice. A new player can
fold Paper Cut and immediately see a Basic Attack become genuinely good; a
curious one can Trace the folded copy and see where the ceiling is.

---

# COMMON TRICKS

20 total.

| # | Trick | Type | Core effect |
|---|---|---|---|
| 1 | Sharp Edge | Attack | 1 Nerve. Deal light damage. Deal additional light damage if you have already played a Trick this turn. |
| 2 | Papercrow Dive | Attack | 1 Nerve. Deal light damage. If this Trick has any Crease, deal additional light damage. |
| 3 | Fold and Strike | Attack | 1 Nerve. Fold this Trick 1, then deal light damage. |
| 4 | Duplicate Beak | Attack | 1 Nerve. Deal light damage. Trace this Trick. |
| 5 | Bookmark | Attack | 1 Nerve. Deal moderate damage. Gain 1 Paper. |
| 6 | Flying Page | Attack | 1 Nerve. Deal light damage to all enemies. |
| 7 | Guillotine Cut | Attack | 2 Nerve. Deal heavy damage. Costs 1 less for each Crease on it. |
| 8 | Read the Room | Skill | 1 Nerve. Draw 1 Trick. Fold it 1. |
| 9 | Careful Crease | Skill | 1 Nerve. Fold a Trick in your hand 1. Gain 1 Paper. |
| 10 | Double Crease | Skill | 2 Nerve. Fold a Trick in your hand 2. |
| 11 | Second Copy | Skill | 1 Nerve. Spend 1 Paper. Trace a Trick in your hand. |
| 12 | Refold It | Skill | 1 Nerve. Refold a Trick in your hand. |
| 13 | Paper Screen | Skill | 1 Nerve. Gain light Guard. Gain additional light Guard if you hold any Paper. |
| 14 | Concertina | Skill | 1 Nerve. Gain light Guard for each Crease on Tricks in your hand, plus a light amount. |
| 15 | Loose Leaf | Skill | 0 Nerve. Discard a Trick. Gain 2 Paper and draw 1 Trick. |
| 16 | Pulp | Skill | 0 Nerve. Vanish a Trick in your hand. Gain Paper equal to its Nerve cost plus 1. |
| 17 | Filing | Skill | 1 Nerve. Look at the top 3 Tricks. Put one in your hand and Fold it 1. Return the rest. |
| 18 | Paper Trail | Power | 1 Nerve. The first time a Trick Vanishes each turn, gain 1 additional Paper. |
| 19 | Practised Hands | Power | 1 Nerve. The first Trick you Fold each turn is Folded 1 more. |
| 20 | Marginalia | Power | 1 Nerve. The first Paper Copy you play each turn draws 1 Trick. |

**Common pool purpose.** Every verb appears at 1 Nerve with no engine attached.
Pulp establishes that his own cards are raw material. Guillotine Cut shows a
player what Creases do to cost before they have any way to reach 3. Double Crease
is deliberately two-thirds of the way to a decision the Commons cannot finish.

---

# UNCOMMON TRICKS

35 total.

## Uncommon Attacks

| # | Trick | Type | Core effect |
|---|---|---|---|
| 21 | Thousand Cuts | Attack | 1 Nerve. Deal light damage once for each Crease on this Trick, at least once. |
| 22 | Origami Crow | Attack | 2 Nerve. Deal substantial damage. If this is Overfolded, it hits all enemies. |
| 23 | Cut and Paste | Attack | 1 Nerve. Deal moderate damage, then Trace this Trick. |
| 24 | Bookbinder's Blade | Attack | 1 Nerve. Deal moderate damage. Gain 1 Paper for each Crease on this Trick. |
| 25 | Errata | Attack | 1 Nerve. Deal moderate damage. Refold a Trick in your hand. |
| 26 | Folded Flock | Attack | 2 Nerve. Deal light damage to all enemies once for every 2 Paper you hold, at least once. |
| 27 | Dog-Ear | Attack | 0 Nerve. Deal light damage. Fold this Trick 1. Return it to your hand once per turn. |
| 28 | Shredder | Attack | 2 Nerve. Vanish a Trick in your hand. Deal heavy damage plus damage for its Nerve cost. |
| 29 | Between the Lines | Attack | 1 Nerve. Deal moderate damage. Deal additional moderate damage if you have an Overfolded Trick in hand. |
| 30 | Sharpened Corner | Attack | 2 Nerve. Deal substantial damage. Costs 1 Paper less to Fold for the rest of this turn. |
| 31 | Quill | Attack | 1 Nerve. Deal light damage three times. Each hit gains from this Trick's Creases separately. |
| 32 | Press Cutting | Attack | 2 Nerve. Trace a Trick in your hand, then deal moderate damage for each Crease on the copy. |

## Uncommon Skills

| # | Trick | Type | Core effect |
|---|---|---|---|
| 33 | Crease Along the Grain | Skill | 1 Nerve. Fold a Trick in your hand 2. Gain 1 Paper if it is now Overfolded. |
| 34 | Paper Mirror | Skill | 1 Nerve. Trace a Trick in your hand. The copy does not Vanish when played. |
| 35 | Rewrite | Skill | 1 Nerve. Refold a Trick. You may look at two results and choose one. |
| 36 | Reference Copy | Skill | 2 Nerve. Trace every Trick in your hand costing 0 after Creases. |
| 37 | Sheaf | Skill | 1 Nerve. Draw 2 Tricks. Fold one of them 1. |
| 38 | Bookplate | Skill | 1 Nerve. Gain substantial Guard. Gain 1 Paper for each Overfolded Trick in your hand. |
| 39 | Unbound | Skill | 0 Nerve. Spend any Paper. Draw 1 Trick for every 3 spent. Vanish. |
| 40 | Fold Along the Fold | Skill | 1 Nerve. Choose a Trick with at least 1 Crease. Fold it 1. It cannot be Refolded this turn. |
| 41 | Index | Skill | 1 Nerve. Search your draw pile for a Trick, put it in your hand, and Fold it 1. Shuffle. |
| 42 | Watermark | Skill | 1 Nerve. Choose a Trick in your hand. Whenever a copy of it is played this turn, gain 1 Paper. |
| 43 | Straighten | Skill | 0 Nerve. Move all Creases from one Trick in your hand onto another. Vanish. |
| 44 | Foolscap | Skill | 1 Nerve. Gain moderate Guard and 2 Paper. |
| 45 | Air Between the Pages | Skill | 1 Nerve. Gain light Guard for each Trick that Vanished this turn, plus a moderate amount. |
| 46 | Impression | Skill | 2 Nerve. Trace a Trick, then Fold the copy 1. |

## Uncommon Powers

| # | Trick | Type | Core effect |
|---|---|---|---|
| 47 | Standing Order | Power | 2 Nerve. At the start of your turn, Fold a random Trick in your hand 1. |
| 48 | Under the Blotter | Power | 1 Nerve. Overfolded Tricks you play give 2 Paper when they Vanish. |
| 49 | Cheap Reproduction | Power | 2 Nerve. Tracing costs 1 Paper less, to a minimum of 0. |
| 50 | Reading Aloud | Power | 2 Nerve. The first Trick you draw each turn is Folded 1. |
| 51 | The Second Draft | Power | 2 Nerve. The first time you Refold each turn, Trace the result. |
| 52 | Pressed Flat | Power | 1 Nerve. Whenever you Fold a Trick to exactly 2 Creases, gain moderate Guard. |
| 53 | Paper Doors | Power | 2 Nerve. Whenever a Paper Copy Vanishes, gain 1 Paper. |
| 54 | Collated | Power | 2 Nerve. At the end of your turn, put one Trick with a Crease from your discard pile on top of your draw pile. |
| 55 | Deckle Edge | Power | 2 Nerve. Creases give an additional third of a Trick's printed numbers. |

**Uncommon pool purpose.** This is where the archetypes separate. Paper Mirror
and Reference Copy make copies into a real engine; Crease Along the Grain and
Fold Along the Fold push toward Overfolded; Rewrite and The Second Draft make
Refold reliable enough to build on; Straighten is the card that admits folding
the wrong thing is survivable. Deckle Edge is the single largest power increase
in the pool and it does nothing at all on turn one.

---

# RARE TRICKS

25 total.

## Rare Attacks

| # | Trick | Type | Core effect |
|---|---|---|---|
| 56 | The Whole Library | Attack | 3 Nerve. Deal moderate damage to all enemies once for each Crease across your whole hand, up to six times. |
| 57 | Perfect Fold | Attack | 2 Nerve. Deal massive damage. If this is Overfolded, deal it twice before it Vanishes. |
| 58 | Paper Storm | Attack | 2 Nerve. Trace this Trick twice, then deal moderate damage. |
| 59 | The Archivist's Knife | Attack | 1 Nerve. Deal damage equal to your Paper. Spend it all. |
| 60 | Fold Everything | Attack | 3 Nerve. Fold every Trick in your hand 1, then deal heavy damage for each Trick that became Overfolded. |
| 61 | Cut Along the Dotted Line | Attack | 2 Nerve. Deal substantial damage. Vanish. Gain 4 Paper. |
| 62 | Flight of Pages | Attack | 2 Nerve. Deal light damage to a random enemy once for each Trick that has Vanished this combat, up to eight times. |
| 63 | The Same Page Twice | Attack | 1 Nerve. Deal moderate damage. If a copy of this Trick has already been played this turn, deal it again. |

## Rare Skills

| # | Trick | Type | Core effect |
|---|---|---|---|
| 64 | Master Copy | Skill | 2 Nerve. Trace a Trick three times. The copies keep their Creases. |
| 65 | Third Crease | Skill | 1 Nerve. Fold a Trick in your hand to exactly 3 Creases, however many it had. |
| 66 | Unfold | Skill | 2 Nerve. Remove every Crease from a Trick in your hand. Gain 2 Paper for each removed and draw that many Tricks. Vanish. |
| 67 | The House's Floor Plan | Skill | 1 Nerve. Look at your entire draw pile. Put any one Trick in your hand and Fold it 2. Vanish. |
| 68 | Papermaking | Skill | 1 Nerve. Vanish any number of Tricks in your hand. Gain 2 Paper for each and draw half that many. |
| 69 | Second Edition | Skill | 2 Nerve. Refold every Trick in your hand. They all keep their Creases. |
| 70 | Endless Ream | Skill | 0 Nerve. Gain Paper up to your maximum. Vanish. |
| 71 | Bind | Skill | 2 Nerve. Choose two Tricks in your hand. Each gains the other's Creases. |
| 72 | Kept Flat | Skill | 1 Nerve. Choose an Overfolded Trick. It does not Vanish the next time it is played. |
| 73 | The Long Fold | Skill | 3 Nerve. Fold a Trick 3. It becomes Overfolded and is Traced twice. Vanish. |

## Rare Powers

| # | Trick | Type | Core effect |
|---|---|---|---|
| 74 | Never Unfolds | Power | 3 Nerve. Overfolded Tricks no longer Vanish when played. |
| 75 | Paper Everything | Power | 2 Nerve. Your maximum Paper becomes 16. |
| 76 | Fourth Crease | Power | 3 Nerve. Tricks can hold a fourth Crease. Overfolded still means 3 or more. |
| 77 | The Archive | Power | 2 Nerve. Tricks that Vanish go to the bottom of your draw pile instead, keeping their Creases. |
| 78 | Mass Production | Power | 3 Nerve. The first Trick you play each turn is Traced after it resolves. |
| 79 | Everything Is Paper | Power | 2 Nerve. Whenever you gain Paper past your maximum, deal that much damage to a random enemy. |
| 80 | The Crow Remembers | Power | 3 Nerve. At the start of each turn, put a Trick that Vanished this combat back into your hand with its Creases. |

**Why the Rares change the rules.** Never Unfolds and The Archive both answer the
deck-shrinking problem from opposite directions — one keeps the card, the other
recycles it. Third Crease and The Long Fold turn folding from a project into an
action. Unfold is the only card in the game that takes Creases off, and it pays
for the privilege. Fourth Crease quietly rewrites the table at the top of this
chapter.

---

# MULTIPLAYER ONLY TRICKS

Outside the 80. Three Uncommon, two Rare.

| Trick | Type | Core effect |
|---|---|---|
| Carbon Copy | Skill | 1 Nerve. Uncommon. Choose an ally and a Trick in your hand. Put a Paper Copy of it into their hand. It costs 0 and Vanishes. |
| Lend a Page | Skill | 1 Nerve. Uncommon. Choose an ally. Fold a Trick in their hand 1. Gain 1 Paper. |
| Paper Screen for Two | Skill | 1 Nerve. Uncommon. You and one ally each gain moderate Guard, plus a light amount for each Crease in your hand. |
| Shared Library | Power | 2 Nerve. Rare. Whenever an ally plays a Trick that costs 2 or more, gain 1 Paper. |
| The Whole House on Paper | Skill | 3 Nerve. Rare. Every ally draws 1 Trick and Folds it 1. Trace one Trick in your own hand for each ally who did. |

The multiplayer pool does the thing only Crinkle can do to somebody else's deck:
it improves it. Lend a Page and The Whole House on Paper make another player's
Tricks permanently better for the fight, which no other Companion's co-op pool
offers, and Carbon Copy hands a teammate a free use of Crinkle's best card
without giving it away.
