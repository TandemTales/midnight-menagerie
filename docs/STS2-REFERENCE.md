# The yardstick: Slay the Spire 2

Every critic judges against **this**, not against "is it a nice web game."
Cite specific lines from here when you find a gap.

Sources consulted 2026-08-19: GamesRadar EA review, PCGamesN roadmap + art-direction
piece, xmodhub mechanics guide, GAMES.GG mechanics explainer, sts2front roadmap.
Launched EA 2026-03-05, $24.99, 5 characters, art director Marlowe Dobbe.

---

## 1. Combat screen layout (the thing we are copying the *feel* of)

```
┌─────────────────────────────────────────────────────────────┐
│ [relic bar — small icons, left, wraps]        [HP] [gold] ⚙ │
│                                                             │
│                    ENEMY   ENEMY   ENEMY                    │
│                   [intent] [intent] [intent]                │
│                   [HP bar] [HP bar] [HP bar]                │
│                                                             │
│  PLAYER                                                     │
│  [block shield]                                             │
│  [HP bar + numbers]                                         │
│  [status icon row]                                          │
│                                                             │
│ ┌──┐                                          ┌───────────┐ │
│ │3 │      ╱▔╲ ╱▔╲ ╱▔╲ ╱▔╲ ╱▔╲                 │  END TURN │ │
│ │/3│     │  ││  ││  ││  ││  │  ← arc-fanned   └───────────┘ │
│ └──┘     ╲__╱╲__╱╲__╱╲__╱╲__╱                               │
│ energy                                                      │
│ [draw pile n]                              [discard pile n] │
└─────────────────────────────────────────────────────────────┘
```

Precise properties that matter:

- **Hand is an arc.** Cards rotate along the arc (roughly ±3° per card from centre),
  and their *vertical* position follows the arc too — outer cards sit lower.
  With few cards the arc flattens; with many, cards overlap and the arc tightens.
  The arc re-lays out with easing on every draw/play/discard. It never teleports.
- **Hover** raises the card ~40–60px, scales it ~1.15–1.25×, zeroes its rotation,
  and brings it to the top of the stack. Neighbours nudge aside slightly.
  This happens in **under 120ms** and reverses just as fast. It is *snappy*, not floaty.
- **Playable/unplayable is unmistakable at a glance.** Unaffordable cards are
  desaturated and sit visibly lower/dimmer. You never have to read a number to know.
- **Dragging a card**: the card follows the cursor with slight lag and tilt-toward-motion.
  For a targeted card a **curved arrow** springs from the card to the cursor and snaps
  onto the hovered enemy with a distinct click of feedback and a target reticle.
  Non-targeted cards play when dragged above a threshold line.
- **Playing a card**: card flies to a play position, the effect resolves, then the card
  arcs to the discard pile. Draw/discard/exhaust each have a *different* motion signature.
- **Energy orb** bottom-left, large, reads `current/max`. It visibly depletes on play.
- **End Turn** bottom-right, large, and it *changes state* — glows when the hand has
  nothing playable left.
- **Draw pile / discard pile** bottom corners with live counts; clicking opens the pile.
- **Intent icons** float above enemies and are the single most important UI element in
  the game: a distinct silhouette per intent (attack / big attack / attack+block /
  defend / buff / debuff / unknown / sleep / escape), and attack intents show
  **the exact damage number after all modifiers**, ×N for multi-hits.
- **Status icons** are small, in a fixed row, with numeric stacks, and every one of them
  is hoverable for a plain-language tooltip.

## 2. Numbers are never a mystery

This is the core of StS's design and the easiest place to lose.

- Attack intent shows damage **after** Strength, Weak, Vulnerable are applied.
  If the player gains Strength, the enemy's displayed intent number updates immediately.
- Card damage numbers **in the card text** update live to reflect Strength/Weak/
  Vulnerable/Wrath, and are recoloured (green = boosted, red = reduced).
- Hovering a target while holding a card previews the outcome on that target.
- Block is a number on a shield next to HP; it visibly shatters when broken.
- Every keyword in card text is a hoverable term with a short, concrete definition.
- Nothing important is communicated by colour alone.

## 3. Card anatomy

Cost gem top-left. Name on a banner. Full-bleed art in the upper ~55%.
Type line (Attack / Skill / Power) centred under the art. Rules text below,
with numbers bolded and keywords in a distinct colour. Rarity is legible in the
frame treatment (common/uncommon/rare have visibly different border materials),
not just a coloured dot. Upgraded cards show `+` in the name and green rules numbers.

## 4. Feel and juice (StS2 specifically raised this bar)

- "Combat effects pop off the screen in a way that makes even simple attacks feel
  satisfying" — a basic Strike is not a number appearing. Attacks have wind-up,
  contact, and follow-through.
- Characters **animate their attacks**: StS2 explicitly fixed the StS1 complaint that
  the player figure just twitched. A strike swings a weapon.
- Hit reactions: the struck enemy flinches, flashes, and its HP bar drains with a
  short lag so the loss is legible. Damage numbers rise and fade.
- Screen shake scaled to damage. Hitstop on big hits. Never on small ones.
- Deaths are events, not disappearances.
- StS2 has "considerably more animations and transitions" than StS1 and more
  full-screen art, aiming for **epic rather than intimate**.
- Art direction is **crisper and more playful** than StS1's painterly look, and more
  colourful — while keeping the dark themes.

## 5. Map

Branching node graph, bottom-to-top, ~15 rows per act, with distinct node icons
(combat / elite / rest / merchant / treasure / unknown / boss). The path you have
walked is visibly marked. Available next nodes are highlighted and everything else
is dimmed — you can never be confused about where you may go. Hovering a node
previews what it is. Boss is shown at the top from the start of the act.
StS2 adds **environmental hazards**: nodes carrying global modifiers that make
pathing a real decision.

## 6. Structure and pacing

- Act structure with elites, a boss, shops, rests, unknown events.
- Card reward after combat: 3 cards, take one or skip; rarity odds shift with luck.
- Rest site: heal ~30% or upgrade a card — **StS2 adds Forge**: permanently upgrade a
  relic (+1 tier) at a max-HP cost.
- Potions: 3 slots, usable any time in combat, they are a real tactical layer.
- Relics: passive, always-on, run-defining. The relic bar is always visible.
- Ascension (StS2 reworked it in v0.104): escalating difficulty modifiers per level.

## 7. StS2 mechanical additions worth stealing the *shape* of

| Mechanic | What it does |
|---|---|
| Momentum | Card costs 1 less for each consecutive turn played |
| Echo | Card plays itself again next turn for free |
| Brittle | Next unblocked attack takes double damage |
| Linger | Effect persists after the card goes to discard |
| Enchantments | A modifier layered onto a specific card |
| Dual-type cards | Cards belonging to two colour pools |
| Dynamic intents | Enemies re-choose intent based on player board state |
| Multi-phase bosses | Phase transition below 50% HP: debuff clear + AoE |
| Elite reinforcements | Elites summon minions if the fight drags |
| Cursed variants | Buffed normal enemies that drop a bonus relic |
| Grave/summon slots | Necrobinder: 3 minion slots + persistent Soul energy (cap 10) |
| Infinite loop limiters | Boss mechanics that punish infinite combos |
| Active/passive curses | Curses matter more; removal is a real decision |

Midnight Menagerie's design doc already has analogues for most of these
(Companion signature systems). The bar is that ours read as clearly and land as hard.

---

## How to run a blind A/B (mandatory for critics)

1. Write down, from this document, what **Build A** (Slay the Spire 2) does on the
   specific dimension you are judging — concretely, with numbers and timings.
2. Look at the actual screenshots/interaction traces of **Build B** (ours). Never the
   builder's summary.
3. Score each dimension and name the winner. Be brutal. "Comparable" is a loss for us —
   we need to be *at least* level, and the user asked for wowed.
4. If B loses any dimension, output **exactly one** biggest gap, phrased as a concrete,
   actionable instruction, and send the builder back.
5. Only sign off when you would genuinely be unable to tell which build was made by a
   professional studio.
