# The yardstick: Slay the Spire 2

Every critic judges against **this**, not against "is it a nice web game."
Cite specific lines from here when you find a gap.

Sources consulted 2026-08-19: GamesRadar EA review, PCGamesN roadmap + art-direction
piece, xmodhub mechanics guide, GAMES.GG mechanics explainer, sts2front roadmap.
Launched EA 2026-03-05, $24.99, 5 characters, art director Marlowe Dobbe.

Sections 1-7 are single-player only. **Co-op multiplayer is section 8**, researched
separately on 2026-08-27, with its own source list and reliability notes.

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
In co-op the party does not choose the route so much as **vote** on it — see 8.5.

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

## 8. Co-op multiplayer — the mode our co-op is judged against

Researched 2026-08-27, because sections 1–7 were written from single-player coverage and
said **nothing** about co-op, while three rounds of our multiplayer work were nominally
judged against this file. Authority order used below, and it matters — the fan guides
contradict each other and two of them contradict the game:

1. `slaythespire.wiki.gg` *Slay the Spire 2:Multiplayer* and its per-card pages — the only
   source carrying formulas and patch numbers. **Where anything below disagrees, the wiki wins.**
2. GameSpot's co-op feature, allthings.how's mechanics explainer, sts2guides, PC Gamer's
   co-op piece, Steam community discussion threads.
3. **`sts2front` is not reliable on co-op.** It reports 2p enemy HP as "roughly 1.5x" and
   claims death eliminates a player for the rest of the run. Both are flatly wrong per the
   wiki. It is cited in this document's header for single-player; do not extend that trust.

Anything marked *(unconfirmed)* appears in secondary sources only.

### 8.1 The shape of the mode

- **Up to 4 players.** Online only, through the Steam friends list. **No public
  matchmaking and no local/couch co-op.** Every player must own the game.
- One player **hosts**; the save belongs to the host, and the group can resume a run
  together later. Players can start their own solo runs without disturbing it.
- The host picks the **Ascension level, capped by the lowest player's own maximum**.
  Multiplayer Ascension is tracked **separately** from single-player, and on a won run
  **the entire lobby earns the next level**.
- Crossplay covers the PC ecosystem (Windows/Mac/Linux/Steam Deck). No console crossplay.

> **For us — ANSWERED, 2026-08-29.** This used to read "we have not answered it at all",
> and building the answer turned up something worse than the gap: the ladder did not
> advance on a WIN either, for anybody. `hauntLevel` was written by its own default in
> `core/save.js` and read by two pickers, and nothing incremented it — every save sat on
> Haunt 0 permanently and the entire ascension analogue was inert. CONTRACTS 54 again.
>
> There are two ladders now. `hauntLevel` is solo, `partyHauntLevel` is every party size,
> and `Run.end(victory)` advances the one the run was played on, keyed off the Haunt it
> was PLAYED at so a level cannot be farmed or walked backwards. Separate is the half
> that matters: the party curve multiplies enemy Courage and never enemy damage, so a
> Haunt four Kids cleared is no evidence a soloist can. **Credited to everyone** falls
> out rather than being built — each client advances its own save on a shared win.
> **Gated by the weakest** is the one piece left, and it is transport work: the lobby has
> to compare saves across peers. `Save.hauntLevelFor(partySize)` is the seam it calls,
> taking the MIN. `tests/haunt/` is 18 checks.

### 8.2 Turn structure — simultaneous window, sequential resolution

- **All players act in the same turn window.** There is no turn order between players and
  nobody waits for anybody else to finish before acting.
- Everyone queues actions at once; **the game resolves them in the order they were played.**
- **That order is load-bearing and the players know it**: apply Vulnerable first and every
  teammate who attacks afterwards gets the bonus. Resolution order is a coordination
  mechanic, not an implementation detail.

> **For us:** this matches `endTurn(seat)` closing one seat while `endTurn()` closes the
> table — our engine is already the right shape. What we lack is the *shared window*.
> Pass-and-play makes the window sequential, so the debuff-ordering play above cannot
> happen offline at all.

### 8.3 Enemy scaling — the formula, verbatim

```
MultiplayerMonsterHP = MonsterHP * PlayerCount * ActScaling
```

| ActScaling | value |
|---|---|
| Act 1 | ×1.1 |
| Act 2 | ×1.2 |
| Act 3 hallway | ×1.2 |
| Act 3 boss | ×1.3 |

Which resolves to:

| Players | Act 1 | Act 2 / Act 3 hallway | Act 3 boss |
|---|---|---|---|
| 2 | **×2.2** | ×2.4 | ×2.6 |
| 3 | ×3.3 | ×3.6 | ×3.9 |
| 4 | ×4.4 | ×4.8 | ×5.2 |

**Enemy attack damage does not scale at all.** The added threat is that AoE moves land on
every player, so party-wide damage taken rises even though no single number does.

Enemy defensive buffs scale on their own separate curves:

| Buff | Scaling |
|---|---|
| Block (2p) | flat ×2 — *changed from* ×2.2/×2.4/×2.6, i.e. deliberately decoupled from the HP curve |
| Plating | `Amount * ((PlayerCount - 1) * 2 + 1)` |
| Artifact | `Amount + PlayerCount - 1` |
| Slippery | `Amount * PlayerCount` |
| Skittish | `Amount * ((PlayerCount - 1) * 0.5 + 1)`, rounded down |

> **For us — and this corrects the record.** HANDOFF §9 states that "StS2 actually uses
> 250%" and that our 220% is a deliberate divergence to a parity point. **StS2's real Act 1
> two-player figure is 220%** — `2 × 1.1` — which is the number we independently measured
> and shipped. We did not diverge from them; we converged on them. Three things follow:
> - Their curve **rises by act** (×1.1 → ×1.2 → ×1.3 for the final boss). Ours is flat.
>   A Nursery / Sleeping-Quarters ramp is an untried lever, and it is the one that would
>   most directly address the Butler being "not dangerous, just long".
>   **DECLINED FOR NOW, 2026-08-29 — it cannot be validated yet.** A by-act curve is a
>   claim about the SHAPE across acts, and one region has enemies built: the table lists
>   seventeen. Fitting a ramp against a single act would tune the Foyer and call it a
>   curve, which is how this project got `partyHp: [1, 2.2, 2.8, 3.2]` fitted to a broken
>   bot (CONTRACTS 47). It also stopped being the answer to the Butler on the same day —
>   he is in both halves of his brief now (8–12 turns, 45–65%) with no ramp at all, via a
>   pool cut taken entirely out of phase one plus harsher phase-two Reprimands. Revisit
>   when the Nursery's enemies are measurable against the Foyer's, which is the first
>   point at which "rising" describes two things rather than one.
> - **The curve is LINEAR in party size.** `ActScaling` is a function of the act ALONE, not
>   of the player count, so per-player HP is a flat 110% in Act 1 whether there are two
>   players or four: 2p ×2.2, 3p ×3.3, 4p ×4.4. It does not get proportionally harder as
>   the party grows — a fourth player adds exactly what the second one did. **Open decision
>   2's 3p/4p curve is no longer an extrapolation**: at a party of four our Courage figure
>   is 440% of solo in the Foyer, by the same measurement that produced 220% at two.
> - Enemy damage not scaling **matches what we shipped**, and our "the extra threat is
>   targeting" is the same design reached independently. Keep it; it needs no defending.

### 8.4 Presence — what you can see of the other player

This is the part of StS2 co-op that reviewers single out, and the part we have least of.

- **A semi-translucent hand per teammate, mirroring their cursor in real time.** You watch
  which cards and which targets they are hovering while they are still deciding. It exists
  so a group can coordinate *without voice chat*.
- **You can inspect any teammate's full deck and relics at any time**, for the whole run.
- **A shared map drawing tool**: colour-coded markers drawn on the map to flag an elite or
  argue for a route. Visible to the whole group and **persists for the act**.

> **For us:** the hovering hand needs a live wire and should wait for open decision 1 —
> offline, while you are aiming, the other Kid is behind an opaque veil and has not chosen
> anything, so there is no state to draw. Building it now would ship a mechanic no code
> path can call, which is the failure class that has already cost this project two rounds.
> **Inspecting a teammate's deck and Keepsakes does not need the wire.** A deck list is not
> a hand — our veil exists because a hand of Tricks is private, while StS2 treats the deck
> as open information for the whole run. That is a real, buildable gap that was on none of
> our lists.

### 8.5 The map — one route, voted

- One shared path. **At every fork, every player votes.**
- **A roulette-style randomiser then picks the winning path, weighted by the votes.** It is
  not majority-rules: a minority vote can win, proportionally to how many wanted it.
- **Ties are broken randomly.**
- **The host has no special authority.** The stated design goal is that nobody drags the
  team around and everyone has a voice even without voice chat.
- *(unconfirmed)* the vote happens after each cleared room, i.e. at every step, not only at
  visually branching forks.

> **For us — BUILT, 2026-08-29.** This paragraph used to read "`scenes/map.js` has no
> seat concept whatsoever — a grep for `seat|party|kids|handOff|local` returns one prose
> comment — and `run.chooseNode(node)` asks nobody, so seat 0 picks the entire route for
> the whole expedition", and called it the largest co-op gap we have. Taken whole:
>
> - `ACT.MAP_VOTE` is one seat's vote, decisive only when it is the last one owed — the
>   same shape as `ROOM_DONE`. A party of one resolves on its own first vote.
> - `run.resolveVote()` runs the weighted roulette on every client, so **there is no host
>   authority**, and a minority vote wins in proportion to how many wanted it. Measured at
>   three seats over 150 seeds: the lone Kid gets their way 32.0% against 33.3% expected
>   (`tests/vote`).
> - At one keyboard the sheet passes between Kids on the same veil the per-Kid rooms use,
>   and each Kid's pin stays on the room they picked so the next one can see it.
> - When a number overrides the vote the party is told, on the sheet, before they walk.
>
> The weighted roulette is **reproducible for us where it is not for them**, which is what
> made it takeable whole. It is a `fork('vote|<node>|<ballot>')` and NOT `ctx.run.rng` as
> this paragraph originally proposed: the master stream is the run's spine, and drawing
> from it would shift every later roll by however much the party happened to disagree.
> Keyed by the ballot as well as the fork, so a replay reaches the same room while the
> answer is not one fixed value per node. CONTRACTS' "seat choice ALWAYS ties on seat
> index, never the RNG" is a rule about enemy *targeting*, which is shown before the
> players act and must survive a replay unchanged; a vote resolved after everyone has
> committed is a different case.
>
> **Not built:** the map drawing tool above, which is presence rather than routing.

### 8.6 What is shared and what is each player's own

| | StS2 | Ours today |
|---|---|---|
| Map, route, floor progression | shared | shared |
| Enemy encounters, events | shared | shared |
| Enemy buffs/debuffs | apply to everyone equally | same |
| Deck | own | own |
| Gold / currency | own | own (Lost Things) |
| Energy | own, explicitly no sharing | own (Nerve) |
| HP | own | own (Courage) |
| Relics / Keepsakes | own | own |
| Potions / Snacks | own, **throwable at another player** | own, thrown via `useSnack(…, { to: seat })` |
| Card rewards | own, different options per player | own |
| Merchants | **entirely separate stock per player** | own shelf per Kid |
| Rest sites | every option independently available to each player | same |

### 8.7 Rewards, and the one place players actually contend

Almost nothing is contested — with one exception:

- **Treasure chests offer one relic per player, and no two players may take the same one.**
- When two players want the same relic, the game runs **an automated rock-paper-scissors
  duel** between them. The winner takes it; the loser picks something else.

> **For us:** every Kid gets their own offer and nobody can reach into somebody else's, so
> there is nothing to resolve — HANDOFF already files this as pending the wire. Worth
> noting the shape they chose: contention is treated as *entertainment*, not arbitration.
> They made the collision into a moment rather than designing it away.

### 8.8 Falling over, and getting back up

- HP to 0 → **out for the remainder of that fight**, not the run.
- **As long as one player survives the fight, the downed player returns at 1 HP** afterwards.
- Everyone is restored to full at the start of an act.
- Rest sites add **Mend: heal another player for 30% of their max HP** instead of resting.
- *(unconfirmed — secondary sources only)* rare co-op relics granting one free mid-combat
  revive; a rest-site revive costing a percentage of the survivors' max HP; a "Clone" camp
  action copying a teammate's card. The wiki lists only Mend.

> **For us:** our fallen rule and our Mend at 30% are **exact matches**, arrived at
> independently. Our Clone is not confirmed to exist in StS2 — treat it as ours, not as
> something to check against them.

### 8.9 Multiplayer-only cards

They are **Colorless** and multiplayer-exclusive, plus a five-card set per character.

**Colorless:** Believe in You · Coordinate · Gang Up · Huddle Up · Intercept · Lift ·
Tag Team · The Ball · Beacon of Hope · Knockdown · Mimic · Rally

**Per character (5 each):**

| Character | Cards |
|---|---|
| Ironclad | Blaze · Demonic Shield · Outrage · Midnight · Tank |
| Silent | Blade Symphony · Concoct · Fade · Flanking · Sneaky |
| Regent | Constellation · Largesse · Plot · Hammer Time · Tutor |
| Necrobinder | Legion of Bone · Soulbound · Underworld · Cacophony · Glimpse Beyond |
| Defect | Energy Surge · Hibernate · Ignition · Imitation Learning · One for All |

Exact texts, for the shape of the design space:

| Card | Cost | Type | Text | Upgraded |
|---|---|---|---|---|
| **Gang Up** | 1 | Attack, Uncommon | Deal 5 damage. Deals 5 additional damage for each time another player has attacked the enemy this turn. | 7 additional |
| **Tag Team** | 2 | Attack, Uncommon | Deal 11 damage. The next Attack another player plays on the enemy is played an extra time. | 15 damage |
| **Huddle Up** | 1 | Skill, Uncommon | ALL allies draw 2 cards. Exhaust. | draw 3 |

**Huddle Up gained `Exhaust` as a nerf in v0.100.0 (2026-03-19)** — a repeatable team-wide
draw skill was too strong. Worth knowing before we balance our own team-draw Tricks.

Some cards are explicitly documented as **not** affecting other players: Cruelty, Accuracy,
Tracking, Shadow Step, Lethality, Reaper Form, Claw, Maul. They wrote down the negative
space too.

> **For us:** 25 authored co-op Tricks, 5 per built Companion, outside the 80 and never
> drafted solo — the **same architecture** they used. The three design shapes to compare
> ours against: *pays off a teammate having acted first* (Gang Up), *makes a teammate's next
> card better* (Tag Team), *hands the whole team a resource* (Huddle Up).

### 8.10 Structural changes co-op makes to the run

- **Every act is one floor shorter in multiplayer.** Boss floors move to 16 / 31 / 45.
- Golden Compass replaces the Act 2 map with a single path plus a 2-floor extension, for
  everyone.
- Neow's offers change: Silver Crucible and Winged Boots are replaced by Massive Scroll.

> **For us — MEASURED AND DECLINED, 2026-08-29, because the lever is aimed at the wrong
> axis.** The pacing problem is real and now has a number: `tests/coop/playthrough.py`
> walks ONE scuffle room with two Kids and reports **5 screen handoffs**. A Foyer wing is
> `rows - 1` = 12 rooms plus the boss, so a two-Kid wing costs on the order of 60 passes,
> and four Kids roughly doubles it. That is worth taking seriously.
>
> But it is not a PARTY-SIZE problem, it is a SHARED-SCREEN problem, and the two only look
> alike today because pass-and-play is the only co-op we have. StS2's Golden Compass
> shortens an act whose length is inherent — everyone is playing at once and it simply
> takes a long time. Ours is the handoff ceremony, and `shouldHandOff()` already returns
> false the moment `run.session.remote` is true, so **the transport deletes this problem
> rather than mitigating it**. Shortening the route by party size would permanently remove
> rooms, rewards and Companion rescues from the game to work around a cost that only
> exists offline — and would weaken the party, which the elite ledger says is already the
> side with too much slack.
>
> If a shortening is ever wanted, scope it to `shouldHandOff()` being true, not to party
> size. That is a different change from the one this section proposed and the reason is
> the useful part.

### 8.11 Where StS2 co-op is actually weak — the opening

Their loudest technical complaint, by a wide margin, is **disconnects**:

- Players report dropping every 3–20 minutes; endless "Connecting…"; "Connection
  Interrupted (Poor Connection)"; whole runs desyncing.
- **You cannot rejoin.** A disconnect effectively ends the run for the group. There are
  open Steam threads titled, in as many words, asking to be allowed to rejoin.
- The netcode is strongly **host-dependent** — the host's connection quality determines
  everyone's experience.
- The community workaround is save-and-quit, then re-host from the save.

> **For us:** this is open decision 3, and it is the one place where beating them is
> realistic rather than aspirational. Our lockstep foundation — deterministic RNG,
> `choiceLog`, `setChoiceScript` replay, per-seat board digests, and a run layer that
> already reconstructs an interrupted fight and verifies it against a digest — is
> *precisely* the machinery a rejoin needs, and we have it before writing a line of
> transport. It shapes the protocol rather than being retrofittable, so it wants deciding
> before decision 1 is built, not after.

### 8.12 Scorecard — where we stand against this section

| Dimension | Verdict |
|---|---|
| Enemy HP scaling at 2p | **Level** — 220%, independently measured, same number |
| Enemy damage not scaling | **Level** — same design, same reasoning |
| Per-player decks / currency / rewards / shops | **Level** |
| Fallen and revival | **Level** — same rule, same 30% Mend |
| Co-op-only card architecture | **Level** — 5 per character, held out of the solo pool |
| Route voting | **Built 2026-08-29** — every Kid votes, weighted roulette settles a split (§8.5) |
| Inspecting a teammate's deck and Keepsakes | **Behind, buildable now** |
| Simultaneous turn window | **Behind, transport-blocked** — our window is sequential |
| Resolution order as a coordination mechanic | **Behind, transport-blocked** |
| Teammate cursor / hovering hand | **Behind, transport-blocked** |
| Map drawing markers | **Absent** — needs a wire to be worth anything |
| Relic contention | **N/A until the wire** — no shared offer exists to contend over |
| Scaling curve rising by act | **Declined for now, 2026-08-29** — cannot be validated against the one region whose enemies are built; see §8.3 |
| Co-op acts shortened | **Declined 2026-08-29** — measured at 5 handoffs/room; it is a shared-screen cost the transport removes, not a party-size one (§8.10) |
| Haunt / Ascension ladder in a party | **Answered 2026-08-29** — separate ladder, credited to everyone; "gated by the weakest" needs the lobby (§8.1) |
| Reconnection after a drop | **Ahead on foundation, behind on product** — we have the lockstep machinery and no wire; they have the wire and no rejoin |

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
