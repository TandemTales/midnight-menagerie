/**
 * Companion Select — the heart of the pre-run experience.
 *
 * Three steps in one scene, each a transform on the same living wall:
 *   1. COMPANION  `UI/selectCompanion.png` itself — the painted Menagerie
 *                 board, wordmark, candles, cobwebs and all. Not a grid rebuilt
 *                 out of sliced portraits: the painting, lit.
 *                 Choosing one shrinks the wall to a rail and blows the pick up
 *                 into a hero dossier: identity, signature mechanics, starting
 *                 deck, strengths/weaknesses, archetypes.
 *   2. KID        the eight kids, their missing pets, their perk and Backpack.
 *   3. GO         Haunt Level, seed, Begin Expedition.
 *
 * Emits `run:start` with { companion, kid, seed, haunt, backpack } and hands off
 * to the map scene.
 *
 * OWNER: frontend agent.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { clock, Clock } from '../core/clock.js';
import { COMPANIONS, KIDS, TERMS } from '../data/schema.js';
/* The cap comes from the ENGINE, never from a literal here. A screen that can
   set up a bigger party than the engine accepts is exactly the failure the old
   "just flip the constant" plan would have produced, in the other direction. */
import { MAX_PARTY } from '../combat/engine.js';
import {
  ensureCss, fontsReady, companionPortrait, kidPortrait, logoLockup, petPortrait,
  el, svg, rovingFocus, setReduceMotion, reduceMotion, formatSeed,
  REGION_NAMES, COMPANION_BY_SLUG, heroSrc, cobweb, candle,
  freedCompanions, availableCompanions, STARTER_COMPANIONS, parseSeed, warmFaces,
  boardSrc, boardCellVars, BOARD_CELLS,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { fitCardToSlot } from './_cardfit.js';
import {
  itemById, defaultLoadout, loadoutSize, migrateLoadout, assertLoadout, SLOTS_BASE,
} from '../data/backpack.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_SEL  = new URL('./select.css', import.meta.url).href;
const CSS_CARD = new URL('../ui/card.css', import.meta.url).href;

/* `STARTER_COMPANIONS` and the "N / 16 freed" count now live in ui/portrait.js
   so the Title, this screen and the Clubhouse cannot drift apart again; it is
   re-exported here because clubhouse.js has always imported it from select. */
export { STARTER_COMPANIONS };

/* ═══════════════════════════════════════════════════════════════════════════
   Companion codex. Condensed from docs/design/companions/*.md.
   Crinkle has no design file yet; her entry is authored from the one-line brief
   in 00-core-overview.md ("Card duplication, folding, transformations and
   fragile high power effects") and is flagged provisional in docs/NOTES.md.
   ═══════════════════════════════════════════════════════════════════════════ */
export const CODEX = {
  marmalade: {
    knows: 'Remembers doors that only appear to ghosts.',
    identity: 'The agile technical Companion. Poor conventional defence and only moderate raw damage — what makes her powerful is avoiding attacks entirely, punishing enemies for trying to hit her, spending Nine Lives for bursts, and chaining lots of small actions together. High skill ceiling: she rewards reading intents and planning a turn ahead.',
    mechanics: [
      ['Ghoststep', 'Each stack cancels the next hit of enemy Attack damage. Not Guard — one stack eats a 20-damage swing, but a six-hit flurry chews straight through it.'],
      ['Haunt', 'Haunted enemies hurt themselves whenever they attack. It dissipates as it triggers.'],
      ['Nine Lives', 'She starts every Scuffle with 9 Lives. Powerful Tricks spend them. They do not come back until the next fight.'],
      ['Zoomies', 'Effects that only fire on the third or later Trick you play this turn.'],
      ['Untouched', 'Bonuses if she lost no Courage during the last enemy turn.'],
    ],
    strengths: ['High card mobility', 'Cancels single huge attacks outright', 'Powerful reactive damage', 'Strong draw', 'Excellent 0-cost chains', 'Converts defence into offence'],
    weaknesses: ['Unreliable conventional Guard', 'Multi-hit attacks strip Ghoststep fast', 'Little straightforward heavy damage', 'Nine Lives are finite per fight', 'Haunt is dead against passive enemies'],
    archetypes: ['Ghoststep & Untouched', 'Haunt', 'Nine Lives', 'Zoomies', 'Hybrid Ghost Cat'],
    deck: [
      [5, 'Scratch', 'attack', 'Deal light damage.'],
      [4, 'Curl Up', 'skill', 'Gain basic Guard.'],
      [1, 'Boo!', 'skill', 'Apply a small amount of Haunt.'],
    ],
  },
  wisp: {
    knows: 'Remembers which lamps the house lights when it is watching you.',
    identity: 'A delayed-resolution and stored-power archetype. Much of Wisp’s value does not happen when a Trick is played — Tricks hang suspended in the Gloaming and resolve later. Every turn asks three questions at once: what do I need now, what do I schedule, and do I want my delayed Tricks arriving one at a time or all together as a Convergence?',
    mechanics: [
      ['Glow', 'The stored resource. It accumulates, powers everything, and caps — hoarding it wastes future generation.'],
      ['Linger X', 'The Trick does not finish. It waits X turns in the Gloaming, then resolves.'],
      ['Afterglow', 'The delayed half of a Lingering Trick, usually bigger than the immediate half.'],
      ['Convergence', 'Several delayed Tricks landing on the same turn, amplifying one another.'],
      ['Hasten / Delay', 'Move a scheduled Trick earlier or later. The whole build is timing control.'],
    ],
    strengths: ['Exceptional long-fight scaling', 'Deck compression via the Gloaming', 'Turns setup turns into explosive payoffs', 'Very flexible Glow economy'],
    weaknesses: ['Slow opening turns', 'Delayed defence is useless when you need it now', 'Bad scheduling wastes whole Tricks', 'Glow cap punishes hoarding'],
    archetypes: ['Convergence', 'Deep Gloaming', 'Bright Wisp', 'Flare', 'Countdown Manipulation'],
    deck: [
      [4, 'Baby Spark', 'attack', 'Deal light damage.'],
      [4, 'Soft Halo', 'skill', 'Gain moderate Guard.'],
      [1, 'Wait… Wait…', 'attack', 'Deal light damage. Linger 1. Afterglow: light damage, gain 1 Glow.'],
      [1, 'Nightlight Practice', 'skill', 'Gain light Guard. Linger 1. Afterglow: light Guard, gain 1 Glow.'],
    ],
  },
  crumbula: {
    knows: 'Knows which rooms the house keeps warm, and why.',
    identity: 'A risk-management and state-cycling Companion. He puts Bite Marks on enemies as stored feeding opportunities, then consumes them later to recover Courage — but feeding raises Appetite, shutting off his Hungry effects and eventually making him Queasy. He hurts himself on purpose, stays alive on a prepared food supply, and chooses exactly when to cash it in.',
    mechanics: [
      ['Appetite', 'Hungry → Sated → Queasy. Nearly every Trick cares which one he is in.'],
      ['Bite Marks', 'Stored on an enemy. Consumed later for Courage. Lost if that enemy dies first.'],
      ['Feed', 'Spend Bite Marks to heal, and climb the Appetite track.'],
      ['Indulge', 'Voluntarily spend Courage to make a Trick much stronger.'],
      ['Leftovers', 'Value salvaged from Bite Marks you never got to eat.'],
    ],
    strengths: ['Excellent control of his own Courage', 'Strong burst from spent Courage', 'Bite Marks bank value across turns', 'Great boss scaling on one durable target'],
    weaknesses: ['Healing requires setup', 'Bite Marks die with their host', 'Overfeeding causes Queasy', 'Careless Indulging kills him'],
    archetypes: ['Famished Fangs', 'Velvet Banquet', 'Bite Mark Engine', 'Indulgent Aristocrat'],
    deck: [
      [4, 'Tiny Nibble', 'attack', 'Deal light damage and apply 1 Bite Mark.'],
      [4, 'Cape Curl', 'skill', 'Gain light Guard.'],
      [1, 'Midnight Snack', 'skill', 'Feed 1. If this makes him Sated, gain light Guard.'],
      [1, 'Bad Idea, Delicious', 'attack', 'Deal moderate damage. Indulge to apply 2 Bite Marks.'],
    ],
  },
  boggle: {
    knows: 'Knows every space underneath the mansion’s furniture.',
    identity: 'A setup, concealment and burst Companion who alternates between two phases. Hidden: he makes enemies Unaware, stacks Fright and Lurk, and prepares Ambushes. Exposed: he has jumped out, enemies are Suspicious, and he plays defensively until their attention lapses. The strongest Boggle decks move deliberately between the two rather than trying to hide forever.',
    mechanics: [
      ['Awareness', 'Every enemy is Aware, Unaware or Suspicious — independently. Multi-enemy fights become a puzzle.'],
      ['Ambush', 'Huge bonuses on Tricks played while an enemy is Unaware. Usually reveals him.'],
      ['Fright', 'Accumulates and does nothing by itself. Scare N spends it for a payoff.'],
      ['Lurk', 'Slow, capped, permanent-for-the-fight power gained by staying hidden.'],
      ['Search', 'The enemy looks under the bed. Being found makes them Suspicious.'],
    ],
    strengths: ['Excellent control of directed enemy attacks', 'Enormous prepared burst', 'Great multi-enemy tactics', 'Strong long-fight scaling'],
    weaknesses: ['Cannot re-hide from the same enemy every turn', 'Room-wide attacks ignore concealment', 'Fright with no Scare payoff is wasted', 'Lurk accumulates slowly'],
    archetypes: ['Quiet Ambusher', 'Fright Engine', 'Patient Lurker', 'Caught Red-Pawed', 'Houseful of Monsters'],
    deck: [
      [4, 'Little Chomp', 'attack', 'Deal moderate damage.'],
      [3, 'Pillow Shield', 'skill', 'Gain moderate Guard.'],
      [2, 'Creepy Little Noise', 'skill', 'Apply 2 Fright.'],
      [1, 'Under the Bed', 'skill', 'Make one Aware enemy Unaware, or gain light Guard.'],
    ],
  },
  bones: {
    knows: 'Remembers where the house buried the things it wanted forgotten.',
    identity: 'A zone-manipulation and body-state Companion on a cycle: Whole → shed bones → Rattle → Scattered → exploit the missing pieces → fetch old Tricks back → reattach → cash out → fall apart again. His recursion is deliberately constrained, so he rewards planning a turn or two ahead while keeping an instantly readable fantasy: the puppy keeps losing his bones, burying things, finding them again, and somehow winning.',
    mechanics: [
      ['Loose Bones', 'A resource he sheds off his own body. Fuel for almost everything.'],
      ['Whole / Scattered', 'Two body states. Defensive Tricks like Whole; offensive Tricks like Scattered.'],
      ['Rattle', 'Triggers that fire as bones come loose.'],
      ['Fetch', 'Pull a specific spent Trick back out of the discard pile. Slobbered stops him re-fetching the same premium card forever.'],
      ['Bury / Dig Up', 'Deeper recursion and deck thinning, paid for with tempo.'],
    ],
    strengths: ['Exceptional access to specific spent Tricks', 'The discard pile becomes a toolbox', 'Excellent long-fight scaling', 'Can temporarily thin his own deck'],
    weaknesses: ['Re-fetching one premium Trick is restricted', 'Burying costs immediate tempo', 'Whole and Scattered pull in opposite directions', 'Sitting at max Loose Bones shuts off Rattle'],
    archetypes: ['The Rattle Engine', 'Scattered Puppy', 'Fetch Toolbox', 'Deep Burial', 'Good Boy Hybrid'],
    deck: [
      [4, 'Bite', 'attack', 'Deal light damage.'],
      [3, 'Sit Pretty', 'skill', 'Gain modest Guard. Gain more if Whole.'],
      [1, 'Shake, Boy!', 'skill', '0 Nerve. Shed 1 Bone. Draw 1 Trick.'],
      [1, 'Put Yourself Back Together', 'skill', 'Reattach up to 2 Bones. Guard for each.'],
      [1, 'Go Get It!', 'skill', 'Fetch a non-Slobbered Trick costing 1 or less.'],
    ],
  },
  pipkin: {
    knows: 'Knows the grounds outside — and the one gap in the boundary.',
    identity: 'A rhythm and maturation Companion. A Pipkin turn is a sequence, not a list: hop, hop again, accelerate a Sprout into a Pumpkin, harvest it, use the harvest to swell, then come crashing down with a Landing Trick. Seeds planted now pay out two turns later, so the player must think about what the Patch will contain, not what it contains.',
    mechanics: [
      ['Height', 'Gained by hopping. Spent by landing. Disappears at end of turn unless preserved.'],
      ['Hop / Land', 'The core rhythm. Landing Tricks scale with the Height you built.'],
      ['The Patch', 'Limited plots holding Seeds → Sprouts → Pumpkins, ripening over turns.'],
      ['Harvest', 'Cash a ripe Pumpkin. Dead Trick if the Patch is empty.'],
      ['Plump', 'Permanent-for-the-fight body mass. Improves heavy Tricks, eventually taxes Hops.'],
    ],
    strengths: ['Explosive burst once systems align', 'Strong multi-enemy damage from Landings', 'Flexible delayed resources', 'Scales without a damage stat'],
    weaknesses: ['Patch Tricks are weak before things ripen', 'Limited Patch capacity', 'Harvest payoffs go dead with no Pumpkins', 'Height evaporates each turn'],
    archetypes: ['The Hopper', 'Patch Farmer', 'Plump Bruiser', 'Seed Cannon', 'Growth Acceleration'],
    deck: [
      [3, 'Tiny Tongue', 'attack', 'Deal light damage.'],
      [3, 'Leaf Umbrella', 'skill', 'Gain moderate Guard.'],
      [1, 'Puddle Hop', 'skill', 'Hop and gain light Guard.'],
      [1, 'Belly Drop', 'attack', 'Light damage. Land: more damage per Height spent.'],
      [1, 'Plant a Little One', 'skill', 'Plant 1 Seed.'],
      [1, 'Puff Up', 'skill', 'Gain 1 Plump and light Guard.'],
    ],
  },
  taffy: {
    knows: 'Remembers the kitchens before the house closed them.',
    identity: 'An adaptive combo architect whose strongest resource is the mutable state of her own deck mid-fight. She holds Tricks until they become unusually valuable, pulls awkward ones out of circulation to sculpt her draws, makes expendable copies of the good ones, rewrites costs, and alternates between a dispersed unstable body and a recombined one. Her best decks manufacture a favourable board over several turns and then cash it.',
    mechanics: [
      ['Globs', 'Split pieces of herself. Useful, but too many expose her to Courage loss.'],
      ['Stretch', 'Hold a Trick in hand and grow it. Clogs the hand if overdone.'],
      ['Belly', 'Absorb Tricks out of circulation to sculpt future draws.'],
      ['Gummy Copies', 'Temporary duplicates, weaker than the original but free.'],
      ['Card Shaping', 'Rewriting cost and properties of specific Tricks for the rest of the fight.'],
    ],
    strengths: ['Exceptional control of what is circulating', 'Turns mediocre cards into ingredients', 'Reuses key Attacks without discard recursion', 'Loves expensive rare Tricks'],
    weaknesses: ['Substantial setup cost', 'Stretching clogs the hand', 'Over-absorbing leaves her unable to answer now', 'Too many Globs is a liability'],
    archetypes: ['Puddle Cycle', 'Long Pull', 'Snack Pocket', 'Candy Factory', 'Cost Sculptor'],
    deck: [
      [4, 'Sugar Bonk', 'attack', 'Deal light damage.'],
      [4, 'Squish', 'skill', 'Gain light Guard.'],
      [1, 'Pinch Off', 'skill', 'Split 1. Gain a small amount of Guard.'],
      [1, 'Long Pull', 'skill', 'Stretch one other Attack or Skill.'],
    ],
  },
  truffle: {
    knows: 'Knows the hedges, and what the hedges have grown over.',
    identity: 'A controlled-damage and retaliation Companion. He is strongest when the player regulates incoming damage instead of preventing it: grow Quills, raise some with Bristle, block *most* of an attack, let a little through, and Bristle fires and sheds Quills onto the floor as ammunition. A second axis is Ragged — his dangerous, powerful state at half Courage or below.',
    mechanics: [
      ['Quills', 'Attached to his body. The raw material for everything.'],
      ['Bristle', 'Retaliation that fires when enemy Attack damage actually reaches his Courage.'],
      ['Shed / Gather', 'Quills fall to the battlefield as Loose Quills, then get picked back up.'],
      ['Regrow', 'Rebuilds attached Quills over time.'],
      ['Ragged', 'At half Courage or below. Many of his best Tricks only work here.'],
    ],
    strengths: ['Excellent retaliation vs regular attackers', 'Strong resource conversion', 'Great sustained scaling on a littered battlefield', 'Flexible recovery'],
    weaknesses: ['Big single attacks are still lethal', 'Perfect blocking switches his engine off', 'Non-attack damage bypasses Bristle', 'Buff/summon enemies starve him'],
    archetypes: ['Bristle Counterattack', 'Quill Carpet', 'Ragged Survivor', 'Regrowth Engine', 'Damage Valve'],
    deck: [
      [4, 'Zombie Nibble', 'attack', 'Deal light damage.'],
      [3, 'Round Up', 'skill', 'Gain light Guard.'],
      [1, 'Prickle Up', 'skill', 'Gain 1 Bristle and Regrow 1.'],
      [1, 'Oops, a Quill', 'attack', 'Deal moderate damage and Shed 1.'],
      [1, 'Found It', 'skill', '0 Nerve. Gather 1. If a Quill was gathered, gain light Guard.'],
    ],
  },
  hush: {
    knows: 'Can travel through certain shadows.',
    identity: 'A zone-manipulation, preparation and theft archetype. The Shadow Pocket is almost a second hand, but with only three spaces. His strongest turns are not created by drawing well — they were created two turns earlier by putting the right Trick where he would need it.',
    mechanics: [
      ['Shadow Pocket', 'Three slots outside the deck. Stash Tricks now, pull them later.'],
      ['Stash', 'Move a Trick from hand into the Pocket.'],
      ['Unseen', 'A stealth state. Not invulnerability — damage reaching Courage makes him Seen.'],
      ['Ambush', 'Big bonuses on Tricks played from concealment or straight out of the Pocket.'],
      ['Pilfer', 'Steal a resource or effect off the enemy, reactive to what they are doing.'],
    ],
    strengths: ['Exceptional card access', 'Enormous planned turns', 'Flexible reactive answers', 'Strong tactical burst'],
    weaknesses: ['Needs a turn to prepare', 'Three Pocket slots vanish instantly', 'Unseen is not invulnerability', 'Weak when forced to improvise'],
    archetypes: ['Ambush Hush', 'Pocket Architect', 'Scurry Engine', 'Little Thief', 'Hallway Phantom'],
    deck: [
      [4, 'Quick Nip', 'attack', 'Deal light damage.'],
      [3, 'Cushion Dive', 'skill', 'Gain modest Guard.'],
      [1, 'Pocket This', 'skill', 'Stash 1 Trick, then draw 1 Trick.'],
      [1, 'Lights Out', 'skill', 'Become Unseen and gain a small amount of Guard.'],
      [1, 'From Under the Sofa', 'attack', 'Moderate damage. Ambush: additional light damage.'],
    ],
  },
  mopsy: {
    knows: 'Remembers the nursery, and who used to be kept there.',
    identity: 'A combat-modification and reconstruction Companion. She sews temporary Patches onto Tricks that physically change what they do for the rest of the fight, Tears Tricks out of her deck and Mends them back later, and spends Stuffing as both crafting material and emergency protection. She rebuilds the exact deck she needs, mid-fight, out of whatever she was dealt.',
    mechanics: [
      ['Patch', 'Bolt a new effect onto a specific Trick. It wears out after a number of uses.'],
      ['Stuffing', 'A limited internal resource: crafting material and emergency damage soak.'],
      ['Tear / Mend', 'Pull a Trick out of the deck temporarily, then stitch it back where you want it.'],
      ['Cushion / Hollow', 'How full of Stuffing she currently is. Both states have Tricks that want them.'],
      ['Masterpiece', 'The payoff for maintaining a diverse set of Patches at once.'],
    ],
    strengths: ['Extremely adaptable', 'Excellent in long encounters', 'Less dependent on one rare card', 'Turns mediocre reward picks into engine parts'],
    weaknesses: ['Considerable setup cost', 'Patches can land on cards you draw at bad times', 'Patch durability is a real constraint', 'Too many appliers, too few carriers'],
    archetypes: ['Patchwork Toolbox', 'The Masterpiece', 'Tear and Mend', 'Stuffing Oscillation', 'Rag Doll Endurance'],
    deck: [
      [3, 'Sock Kick', 'attack', 'Deal light damage.'],
      [3, 'Folded Arms', 'skill', 'Gain light Guard.'],
      [1, "Beginner's Patch", 'skill', 'Patch a Trick in hand: "when played, gain light Guard." 2 Stitches.'],
      [1, 'Loose Stuffing', 'skill', 'Gain 1 Stuffing.'],
      [1, 'Snip and Save', 'skill', 'Tear another Trick in hand. Draw 1 and gain 1 Stuffing.'],
      [1, 'Little Repair', 'skill', 'Mend a chosen Torn Trick to your discard pile.'],
    ],
  },
  drizzle: {
    knows: 'Knows how water still moves through a house that has no plumbing.',
    identity: 'Drizzle controls a global Weather state shared by the whole Scuffle. Most Companions manipulate their hand or their resources; she manipulates the conditions the fight is happening under. Her ideal turn began several turns earlier — holding at Downpour to keep everything Soaked, or racing to Thunderstorm for explosive Conduct chains, or deliberately collapsing her own storm because her deck is built on what happens after the rain.',
    mechanics: [
      ['Weather', 'Clear → Sprinkle → Downpour → Thunderstorm. Global, and everything reads it.'],
      ['Soaked', 'A wet enemy. Useful, but does nothing on its own.'],
      ['Conduct', 'Chains an effect between Soaked enemies. The multi-target payoff.'],
      ['Forecast', 'A Trick that waits for a specific Weather before paying out.'],
      ['Stormbreak', 'Thunderstorm is unstable and collapses. Some builds want exactly that.'],
    ],
    strengths: ['Excellent multi-enemy control', 'Very efficient delayed effects', 'Can intensify, stabilise or ease the pace', 'Strong medium and long fights'],
    weaknesses: ['Clear is deliberately her weakest state', 'Forecasts can sit uselessly', 'Thunderstorm collapses on its own', 'Slow to set the board'],
    archetypes: ['Stormchaser', 'Rainkeeper', 'Conduct Network', 'Forecast Engine', 'Silver Lining'],
    deck: [
      [4, 'Pitter Patter', 'attack', 'Light damage. A little more if the target is Soaked.'],
      [4, 'Cloud Cover', 'skill', 'Light Guard. More while it is raining.'],
      [1, 'Damp Spot', 'skill', 'Soak one enemy. If already Soaked, gain light Guard.'],
      [1, 'Just a Sprinkle', 'skill', 'Advance Weather one step. If it changed, gain light Guard.'],
    ],
  },
  pudding: {
    knows: 'Remembers every animal buried on the grounds, by name.',
    identity: 'A protective setup and retrieval Companion with unusual control over where his important Tricks are. Instead of relying on draw order he buries them in three cemetery Plots and digs them up when needed — and occupied Plots make the graveyard itself stronger. His second system is Loyalty: he gets better when enemies threaten whoever he has decided is his responsibility.',
    mechanics: [
      ['Plots', 'Three graves. Bury a Trick now, Dig It Up exactly when you need it.'],
      ['Bury / Dig Up', 'Deck control and a guaranteed answer held in reserve.'],
      ['Loyalty', 'Builds when enemies threaten his Best Friend. Spent for defence or retaliation.'],
      ['Graveside', 'Bonuses while Plots stay occupied — digging too eagerly turns it off.'],
      ['Unearthed', 'Bonuses on a Trick the turn it comes out of the ground.'],
    ],
    strengths: ['Excellent control of important Tricks', 'Very reliable defence against clear threats', 'Banks Loyalty and buried answers together', 'Hybridises well'],
    weaknesses: ['Burials cost hand resources up front', 'Buried means denied to yourself', 'Digging too aggressively kills Graveside', 'Slows against non-attacking enemies'],
    archetypes: ['The Loyal Guardian', 'The Gravedigger', 'The Haunted Cemetery', 'The Scrappy Watchdog', 'Cemetery Caretaker'],
    deck: [
      [4, 'Little Chomp', 'attack', 'Deal light damage.'],
      [4, 'Guard the Ankles', 'skill', 'Best Friend gains light Guard.'],
      [1, 'Bury This!', 'skill', '0 Nerve. Bury another Trick from hand. Draw 1.'],
      [1, 'Dig It Up!', 'skill', 'Dig Up one Trick, or Best Friend gains light Guard.'],
    ],
  },
  wink: {
    knows: 'Can see passages hidden behind walls.',
    identity: 'Predictive control and information management. Wink asks four questions: what is this enemy doing *after* the thing I can already see; do I want to know or would I rather gamble; can I rearrange that sequence into something more convenient; and can I prepare now so a future event gives me a free action later. She should feel like a tiny spider building an increasingly elaborate plan in the corners of the ceiling.',
    mechanics: [
      ['Preview', 'Reveal enemy intents several turns ahead.'],
      ['Reads', 'Placed predictions. Correct Reads pay out; Blind Reads gamble for more.'],
      ['Web', 'Accumulates on an enemy and does nothing alone — Web spenders are the payoff.'],
      ['Intent Reordering', 'Actually rearrange the enemy’s action queue. Anchored intents resist it.'],
      ['Set Tricks', 'Pay Nerve now for an effect that fires automatically on a future trigger.'],
    ],
    strengths: ['Exceptional future information', 'Reorders enemy actions instead of just weakening them', 'Very efficient delayed effects', 'Punishes predictable enemies brutally'],
    weaknesses: ['Setup costs real tempo', 'Web does nothing by itself', 'Information has diminishing returns', 'Anchored intents refuse to move'],
    archetypes: ['The Seer', 'Web Weaver', 'Set and Forget', 'Blind Gambler', 'Ceiling Architect'],
    deck: [
      [4, 'Little Nibble', 'attack', 'Deal light damage.'],
      [3, 'Silk Screen', 'skill', 'Moderate Guard. If an enemy intends to attack, apply 1 Web.'],
      [1, 'Peek Around the Corner', 'skill', 'Preview 1. If a new intent is revealed, open 1 Eye.'],
      [1, 'Call It', 'skill', 'Place a Read on an enemy intent.'],
      [1, 'Tripline', 'skill', 'Set: the next time this enemy attacks, apply 2 Web.'],
    ],
  },
  crinkle: {
    knows: 'Knows how the house changes its floor plan.',
    identity: 'A duplication and transformation Companion built out of folded paper. Crinkle copies her best Tricks, folds cards into sharper versions of themselves, and reaches for enormous single-turn effects that tear her apart in the process. Everything she makes is powerful and everything she makes is fragile — a Crinkle deck is a stack of one-use masterpieces that has to win before it runs out of paper.',
    mechanics: [
      ['Fold', 'Permanently reshape a Trick in your deck into a sharper, narrower version.'],
      ['Copy', 'Duplicate a Trick for this fight. Copies are real, and usually Vanish.'],
      ['Creased', 'A Trick folded too many times. Powerful, and one use from falling apart.'],
      ['Origami', 'Transform a Trick into an entirely different one from the same pool.'],
      ['Paper Thin', 'High-power effects that cost durability rather than Nerve.'],
    ],
    strengths: ['Enormous single-turn ceilings', 'Duplicates rare finds', 'Reshapes bad draws into good ones', 'Very high skill expression'],
    weaknesses: ['Fragile effects vanish permanently', 'Deck degrades as it folds', 'Poor at grinding long fights', 'Punished hard by a bad opening'],
    archetypes: ['Paper Storm', 'The Fold', 'Origami Toolbox', 'One Perfect Crane', 'Confetti'],
    deck: [
      [4, 'Paper Cut', 'attack', 'Deal light damage.'],
      [4, 'Fold Flat', 'skill', 'Gain light Guard.'],
      [1, 'Trace', 'skill', 'Copy a Trick in your hand. The copy Vanishes.'],
      [1, 'Sharp Crease', 'skill', 'Fold a Trick in your hand. It becomes Creased.'],
    ],
    provisional: true,
  },
  mossbit: {
    knows: 'Remembers rooms that existed decades ago.',
    identity: 'A delayed-resolution and temporal-planning Companion. Most of his power exists several turns from the moment he creates it. The question is always: what must happen now, and what can I afford to let happen later? He writes Epitaphs that resolve on a countdown, earns Patience for letting them run on schedule, lets held Tricks improve by Weathering, and buries incoming damage instead of preventing it.',
    mechanics: [
      ['Epitaph', 'A delayed effect on a countdown. Up to five active at once.'],
      ['Patience', 'Earned by letting Epitaphs resolve on schedule instead of rushing them.'],
      ['Advance / Delay', 'Move a countdown. Fast is tempting and costs Patience.'],
      ['Weather', 'Tricks held in hand accumulate Weather counters and get stronger.'],
      ['Buried Harm', 'Absorb attack damage now, deal with it later. It does not go away.'],
    ],
    strengths: ['Excellent long-fight scaling', 'Preloads future turns', 'Big effects without paying their full cost on the payoff turn', 'Aligns offence and defence around known intents'],
    weaknesses: ['Very fast encounters kill him', 'Vulnerable before the Epitaph network exists', 'Weather Tricks congest the hand', 'Buried Harm always comes due'],
    archetypes: ['Buried Weight', 'Weathered Relics', 'Patient Monument', 'Gravekeeper', 'Set in Stone'],
    deck: [
      [4, 'Small Headbutt', 'attack', 'Deal light damage.'],
      [3, 'Pull In', 'skill', 'Gain modest Guard.'],
      [1, 'Written in Stone', 'skill', 'Create Epitaph 2: moderate damage to a chosen enemy.'],
      [1, 'Not Yet', 'skill', 'Bury a light amount of Attack damage next enemy turn.'],
      [1, 'Sun on the Shell', 'skill', 'Weather 1. Light Guard. Weathered: moderate Guard, draw 1.'],
    ],
  },
  brambleboo: {
    knows: 'Is connected to the roots growing through the mansion itself.',
    identity: 'A garden-builder and battlefield controller. Brambleboo grows four Cultivars in four Plots, matures them over turns, and Harvests them for payoffs that also destroy the engine that made them. Vines pin enemies down; Compost recycles what he tears up; and Overgrown gradually contaminates his own deck with Weeds. Slow to start, then he owns the room.',
    mechanics: [
      ['The Garden', 'Four Plots. Creeping Ivy, Briar, Moonflower and Grave Moss each do something different.'],
      ['Growth / Mature', 'Plants ripen over turns. Mature plants have recurring effects.'],
      ['Harvest / Uproot', 'Cash a plant in, or rip it out for Compost. Either way the Plot is empty again.'],
      ['Entwine / Snare', 'Vines pile onto an enemy; enough of them cancel its Attack outright.'],
      ['Overgrown', 'Four mature plants. Enormous, and it adds a Weed to your deck every turn.'],
    ],
    strengths: ['Excellent long-fight scaling', 'Strong against repeat attackers', 'Highly modular defence', 'Excellent multi-enemy control once established'],
    weaknesses: ['Slow initial setup', 'Only four Plots', 'Harvesting destroys your own engine', 'Overgrown contaminates the deck with Weeds', 'Weak against non-attacking enemies'],
    archetypes: ['Creeping Ivy Control', 'Briar Retaliation', 'Moonflower Selection', 'Overgrown', 'Compost Cycle'],
    deck: [
      [3, 'Leaf Bop', 'attack', 'Deal light damage.'],
      [4, 'Curl the Leaves', 'skill', 'Gain light Guard.'],
      [1, 'Tiny Creeper', 'skill', 'Plant a Creeping Ivy.'],
      [1, 'Cup of Water', 'skill', 'Give one immature Plant 1 Growth, or gain light Guard.'],
      [1, 'Careful Snip', 'skill', '0 Nerve. Harvest a Mature Plant, or Uproot an immature one.'],
    ],
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   Kid codex. Species and circumstances come from docs/design/kids/*.md; the
   slugs, names and pet names come from data/schema.js. Where the two disagree
   the design doc wins for player-facing text — see docs/NOTES.md.

   No `pack` here. This screen used to carry its own `[[name, slots], …]` Gear
   table, the Clubhouse carried a third one, and `data/backpack.js` — the file
   that actually resolves Gear into tags, hooks and run flags — keyed everything
   by id, so none of the three ever met. The loadout is now read from
   `loadoutFor(kid)` below: the Clubhouse's saved pack if there is one, the
   authored `KID_LOADOUTS` if there is not, ids either way.
   ═══════════════════════════════════════════════════════════════════════════ */
export const KID_CODEX = {
  maya: {
    age: 13, species: 'Black domestic cat, white patch on his chest',
    lost: 'Slipped out of a closed house. Every door was shut.',
    note: '"The building refuses to follow rules. That is the part I intend to fix."',
    trait: 'Practical, organised, observant, stubborn, dryly funny. Uses forearm crutches.',
    perk: ['Checked the Batteries', 'Backpack Gear has one extra use per expedition, and Gear never breaks in the first region.'],
    focus: 'Backpack preparation and equipment specialisation',
  },
  mateo: {
    age: 12, species: 'Green-cheek conure',
    lost: 'Flew toward the mansion at dusk and did not come back.',
    note: '"Pepper repeats things. If he’s in there, he’s been listening to something."',
    trait: 'Talkative, warm, keeps every scrap of evidence in order.',
    perk: ['Cross-Reference', 'Start each expedition already holding one Clue, and Clue rooms reveal one extra detail.'],
    focus: 'Clues, persistent investigation, interpreting old evidence',
  },
  amina: {
    age: 11, species: 'Lop-eared rabbit',
    lost: 'Escaped her enclosure during the move to the new house.',
    note: '"Mochi hides when she’s frightened. She’s very good at it."',
    trait: 'Gentle, patient, the one who notices when someone needs to stop.',
    perk: ['Blanket Fort Builder', 'Safe Rooms restore an extra chunk of Courage and let you keep one Snack.'],
    focus: 'Courage recovery, long expeditions, animal Curiosities',
  },
  eli: {
    age: 13, species: 'Black and white fancy rat',
    lost: 'Got out through a gap nobody knew existed.',
    note: '"Sprocket finds the way through. That’s literally what he does."',
    trait: 'Inventive, funny, cannot walk past a mechanism without opening it.',
    perk: ['Jimmy the Latch', 'Locked doors and mechanical Curiosities always offer one extra option.'],
    focus: 'Mechanical Curiosities, utility Gear, Connectors and Secrets',
  },
  priya: {
    age: 12, species: 'Leopard gecko',
    lost: 'Vanished from a locked tank on a warm night.',
    note: '"Pixel does not go anywhere. Which is how I know she did not go anywhere."',
    trait: 'Methodical, competitive, plans three rooms ahead.',
    perk: ['Read the Room', 'See one extra Trick in every reward, and upgrades cost less at Safe Rooms.'],
    focus: 'Trick rewards, upgrade decisions, long-range planning',
  },
  jordan: {
    age: 12, species: 'Beagle mix',
    lost: 'Slipped his leash near the property fence.',
    note: '"Scout tracks. If I can get him to hear me, he’ll come."',
    trait: 'Loud, brave, improvises constantly, apologises later.',
    perk: ['Whatever Works', 'Start with one extra Snack and find Lost Things more often.'],
    focus: 'Consumables, temporary resources, Treasure, improvisation',
  },
  lena: {
    age: 13, species: 'Syrian hamster',
    lost: 'Gone from a sealed cage. The latch was still closed.',
    note: '"Mooncake left something behind. Things always leave something behind."',
    trait: 'Quiet, watchful, records everything, misses nothing.',
    perk: ['Look Again', 'Secret rooms appear more often, and every Secret you find is recorded permanently.'],
    focus: 'Secrets, evidence, environmental observation',
  },
  /* Samir Haddad and Bean, from docs/design/kids/08-kid-08.md — every line
     below is the doc's, not an invention. He was scaffolded as "Lucy" with a
     pet "Biscuit" and stayed wrong for months while the doc named him 628
     times. His register is deadpan and precise: he does not get angry at the
     House, he cross-examines it. "He ate lettuce. That is not a contract." */
  samir: {
    age: 12, species: 'Tricolour guinea pig, brown eye patch',
    lost: 'Wandered off during a family party. A cousin saw a tiny man in a red coat.',
    note: '"Bean would accept lettuce from a burglar. That is not the same as agreeing to live somewhere."',
    trait: 'Deadpan, exact about words, will negotiate with anything that talks back. Wants everybody comfortable, and is finding out that is not always the answer.',
    perk: ['Ask What It Means', 'Every Curiosity adds one option that asks what accepting actually costs, and the house has to answer before you choose.'],
    focus: 'Curiosities, information over loot, reading the terms before you agree to them',
  },
};

/**
 * The loadout a run will actually start with, as `string[]` of item ids.
 *
 * The Clubhouse Backpack editor writes `Save.data.backpacks[kid]`; if the
 * player has been in there, that IS the pack, and this screen must show it or
 * the editor is decoration. Otherwise the Kid's authored `KID_LOADOUTS` entry.
 * `migrateLoadout` covers saves written before the seam was ids.
 *
 * Exported because clubhouse.js needs the same answer for its own preview.
 */
export function loadoutFor(kidSlug) {
  const saved = Save?.data?.backpacks?.[kidSlug];
  if (Array.isArray(saved)) {
    const ids = migrateLoadout(saved, `Save.data.backpacks.${kidSlug}`);
    if (ids.length) return ids;
    // An explicitly emptied pack is a choice, not a missing value.
    if (saved.length === 0) return [];
  }
  return defaultLoadout(kidSlug);
}

/** Authored Gear copy goes through innerHTML; it is content, so it is escaped. */
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Is this loadout the Clubhouse's doing, or the one the Kid came with? */
function loadoutIsCustom(kidSlug) {
  const saved = Save?.data?.backpacks?.[kidSlug];
  if (!Array.isArray(saved)) return false;
  const a = loadoutFor(kidSlug).join('|');
  const b = defaultLoadout(kidSlug).join('|');
  return a !== b;
}

const HAUNTS = [
  [0, 'Standard', 'The mansion as it is.'],
  [1, 'Stirred', 'Enemies hit harder and have more Courage.'],
  [2, 'Watchful', 'Curiosities turn dangerous.'],
  [3, 'Awake', 'Bosses gain an additional ability.'],
  [4, 'Hungry', 'Far more dangerous room combinations.'],
  [5, 'Possessive', 'The house actively works against you.'],
];

const TYPE_LABEL = { attack: 'Attack', skill: 'Skill', power: 'Power' };

/**
 * How wide the candle's pool of light is, as a fraction of the board.
 *
 * Owned here rather than in the stylesheet because the same number appears in
 * two places that must agree: it sizes `.sel__candlelight`, and it is the
 * divisor that turns a position on the board into that element's own transform
 * percentage. Split across two files they would drift and the light would sit
 * off the frame it is supposed to be lighting.
 */
const GLOW = 0.62;

/** Companion species, for Kid/Companion pairing flavour. */
const COMPANION_SPECIES = {
  marmalade: 'cat', wisp: null, crumbula: 'rodent', boggle: null, bones: 'dog',
  pipkin: 'amphibian', taffy: null, truffle: 'rodent', hush: 'rodent', mopsy: 'rabbit',
  drizzle: null, pudding: 'dog', wink: 'spider', crinkle: 'bird', mossbit: 'reptile',
  brambleboo: 'plant',
};
const PET_SPECIES = {
  maya: 'cat', mateo: 'bird', amina: 'rabbit', eli: 'rodent',
  priya: 'reptile', jordan: 'dog', lena: 'rodent', samir: 'rodent',
};

/** One line about what happens when this Kid walks in with this Companion. */
function pairingNote(compSlug, kidSlug) {
  const c = COMPANION_BY_SLUG[compSlug];
  const k = KIDS.find((x) => x.slug === kidSlug);
  if (!c || !k) return '';
  const same = COMPANION_SPECIES[compSlug] && COMPANION_SPECIES[compSlug] === PET_SPECIES[kidSlug];
  if (same) {
    return `${c.name} keeps looking at ${k.name.split(' ')[0]}'s collar tag. ` +
      `Whatever ${k.pet} is now, ${c.name} was once the same kind of animal — and remembers being found.`;
  }
  /* Pronoun from the Kid record (schema.js KIDS[].pronouns) and NEVER from the
     name or the design doc — the field is the designer's and is authoritative.
     This line printed a hardcoded "she" for all eight, which is wrong for five
     of them. `plural` carries the verb agreement with it: they KNOW, she KNOWS. */
  const pr = k.pronouns || { s: 'they', plural: true };
  return `${c.name} does not know ${k.pet}. But ${c.name} knows the house, ` +
    `and ${k.name.split(' ')[0]} knows what ${pr.s} ${pr.plural ? 'are' : 'is'} looking for. ` +
    `That is enough to get through the door.`;
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export class SelectScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._deckCards = [];
    this._lit = null;
    this.state = {
      mode: 'grid', companion: null, kid: null, seed: 0, haunt: 0,
      /**
       * How many Kids go in. 1 to `MAX_PARTY`, chosen on this screen.
       * `coop` is derived and kept only because several call sites read it.
       */
      partySize: 1,
      coop: false,
      /** Kids already confirmed this session, in seat order. */
      party: [],
    };
  }

  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_SEL)]);

    const settings = Save?.settings ?? {};
    setReduceMotion(!!settings.reduceMotion);
    document.documentElement.classList.toggle('mm-large-text', !!settings.largeText);
    try { ctx.atmosphere?.setMood?.('foyer'); } catch {}

    // The canvas measures 0.00% visible behind this screen — stop drawing it.
    this._unpauseStage = pauseStageFor(ctx);

    warmFaces({ sync: true });   // behind the veil. See ui/petart.js.

    // Who is pickable, plus ?all=1 for review.
    const revealAll = params.all === '1' || params.all === true;
    this.unlocked = revealAll ? new Set(COMPANIONS.map((c) => c.slug)) : availableCompanions();
    /* The grid tally must never move with `?all=1`: that flag is a review door,
       not progress. It counts what you actually freed either way — and the four
       starters are pickable without being freed, so this is a different set
       from `unlocked` and not just a copy of it. See ui/portrait.js. */
    this.freed = freedCompanions();

    this.state.seed = Number(params.seed) || (Date.now() % 0x7fffffff);
    this.state.haunt = Math.max(0, Math.min(HAUNTS.length - 1, Number(params.haunt ?? Save?.data?.hauntLevel ?? 0)));

    const root = this.root;
    root.innerHTML = '';
    root.dataset.mode = 'grid';

    root.appendChild(el('div', 'sel-bg'));
    root.appendChild(svg(`<div class="sel-web sel-web--l">${cobweb()}</div>`));
    root.appendChild(svg(`<div class="sel-web sel-web--r">${cobweb()}</div>`));
    root.appendChild(svg(`<div class="sel-candle sel-candle--l">${candle()}</div>`));
    root.appendChild(svg(`<div class="sel-candle sel-candle--r">${candle()}</div>`));

    root.appendChild(this._buildHeader());
    const stage = el('div', 'sel__stage');
    stage.appendChild(this._buildBoard());
    stage.appendChild(this._buildHero());
    stage.appendChild(this._buildKidStep());
    root.appendChild(stage);
    root.appendChild(this._buildFooter());

    this._wire();

    /* The painting is the screen, so `select:ready` must not fire while it is
       still a blank square — a reviewer screenshotting the moment the scene
       says it is ready would catch an empty wall. Both waits are races against
       a timeout and neither can reject. */
    await Promise.all([fontsReady(), this._plateReady()]);
    if (params.companion && this.unlocked.has(params.companion)) this._pickCompanion(params.companion, true);
    if (params.kid && KID_CODEX[params.kid]) { this._pickKid(params.kid, true); this._setMode('kid'); }
    bus.emit('select:ready');
  }

  /* ── header ─────────────────────────────────────────────────────────────── */
  _buildHeader() {
    const h = el('header', 'sel__head');

    const back = el('button', 'sel-back');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">&#8592;</span> Back';
    back.addEventListener('click', () => this._back());
    h.appendChild(back);

    const logo = logoLockup({ size: 'sm', plaque: 'Menagerie Companions' });
    logo.classList.add('sel__logo');
    h.appendChild(logo);

    const rail = el('ol', 'sel-rail');
    rail.setAttribute('aria-label', 'Expedition setup steps');
    for (const [i, label] of [['1', 'Companion'], ['2', 'Kid'], ['3', 'Expedition']]) {
      const li = el('li', 'sel-rail__step');
      li.dataset.step = i;
      li.innerHTML = `<b>${i}</b><span>${label}</span>`;
      rail.appendChild(li);
    }
    h.appendChild(rail);
    this._rail = rail;
    return h;
  }

  /* ── the Menagerie board ────────────────────────────────────────────────── */
  /**
   * The screen is the painting.
   *
   * Base layer: `menagerie-empty.png` — the whole sheet with every frame emptied
   * to a dark recess. Over it, one sprite per AVAILABLE Companion, cut from
   * `menagerie-board.png` at that frame's measured rect. Both images are the
   * same painting at the same size, so the sprites seat into the wall exactly.
   *
   * An un-freed Companion gets no element at all — no portrait, no name, no
   * region hint, nothing in the accessibility tree. "Hidden" here means the
   * player cannot find out who is missing, not that they are drawn in grey.
   * (This screen used to print "Not yet rescued — somewhere in the Ballroom" on
   * twelve tiles, which told you both that there were twelve and where each one
   * was.)
   */
  _buildBoard() {
    const wrap = el('div', 'sel__boardwrap');

    const board = el('div', 'sel__board');
    board.style.setProperty('--board-img', `url("${boardSrc('board')}")`);
    board.setAttribute('role', 'listbox');
    board.setAttribute('aria-label',
      `The Menagerie — ${this.unlocked.size} of ${COMPANIONS.length} Companions can come with you`);

    /* The painting itself. `alt=""` on purpose — it makes the image
       presentational, which is what keeps this listbox's only exposed children
       the sixteen options. Everything it says in words is said again for
       assistive tech: the wall by the listbox label below, and every frame that
       holds a Companion by its own button's aria-label. */
    const plate = document.createElement('img');
    plate.className = 'sel__plate';
    plate.src = boardSrc('empty');
    plate.alt = '';
    plate.width = 1254;
    plate.height = 1254;
    plate.decoding = 'async';
    plate.fetchPriority = 'high';
    plate.draggable = false;
    board.appendChild(plate);
    this._plate = plate;

    /* One candle for the whole wall. It moves to whichever frame is lit and
       spills onto its neighbours — which is why it is a single element above the
       sprites rather than a glow baked into each one. */
    const flame = el('div', 'sel__candlelight');
    flame.setAttribute('aria-hidden', 'true');
    flame.style.setProperty('--glow-w', `${(GLOW * 100).toFixed(2)}%`);
    board.appendChild(flame);
    this._flame = flame;

    for (const c of COMPANIONS) {
      if (!this.unlocked.has(c.slug)) continue;
      /* The sheet has exactly sixteen painted frames and schema.js has exactly
         sixteen Companions. If those two ever diverge the Companion without a
         frame would just quietly stop being pickable, so say so out loud. */
      if (!BOARD_CELLS[c.slug]) {
        console.warn(`select: no frame on the Menagerie board for "${c.slug}" — ` +
          'add it to UI/selectCompanion.png and re-run tools/prep_board.py');
        continue;
      }
      const tile = el('button', 'companion-tile');
      tile.type = 'button';
      tile.dataset.slug = c.slug;
      tile.style.cssText = boardCellVars(c.slug);
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-selected', 'false');
      tile.setAttribute('aria-label',
        `${c.name}, ${c.title}. Found in ${REGION_NAMES[c.region] ?? c.region}.`);
      tile.appendChild(el('span', 'tile__art'));
      board.appendChild(tile);
    }

    wrap.appendChild(board);
    this._grid = board;

    const cap = el('div', 'sel__boardcap');
    const withYou = this.unlocked.size - this.freed.size;
    cap.innerHTML =
      `<em class="sel__boardhint">Choose the one who walks back in with you</em>` +
      `<span class="sel__boardcount"><b>${this.freed.size}</b> / ${COMPANIONS.length} freed` +
      (withYou > 0 ? `<i>${withYou} already with you</i>` : '') + `</span>`;
    wrap.appendChild(cap);
    return wrap;
  }

  /** The painted board, decoded and ready to paint. Never rejects, never hangs. */
  _plateReady(timeout = 2500) {
    const img = this._plate;
    if (!img) return Promise.resolve();
    return Promise.race([
      (img.decode?.() ?? Promise.resolve()).catch(() => {}),
      new Promise((r) => setTimeout(r, timeout)),
    ]);
  }

  /**
   * Bring the candle to one frame. `slug` null puts the wall back in the dark.
   * Hover and keyboard focus both land here, so the two states are the same
   * state and cannot drift.
   */
  _light(slug) {
    if (this._lit === slug) return false;
    this._lit = slug;
    const board = this._grid;
    if (!board) return false;
    for (const t of board.querySelectorAll('.companion-tile')) {
      t.classList.toggle('is-lit', t.dataset.slug === slug);
    }
    if (slug && BOARD_CELLS[slug]) {
      /* The candle is `GLOW` wide, anchored at the board's top-left corner, and
         moved with a transform in units of ITS OWN width — so the offset that
         centres it on this frame is (centre - GLOW/2) / GLOW. Composited: the
         light slides from frame to frame without touching layout. */
      const [x, y, w, h] = BOARD_CELLS[slug];
      const at = (v) => `${(((v - GLOW / 2) / GLOW) * 100).toFixed(3)}%`;
      this._flame?.style.setProperty('--lxe', at(x + w / 2));
      this._flame?.style.setProperty('--lye', at(y + h / 2));
      board.dataset.lit = slug;
    } else {
      delete board.dataset.lit;
    }
    return true;
  }

  /* ── hero dossier ───────────────────────────────────────────────────────── */
  _buildHero() {
    const hero = el('section', 'sel__hero');
    hero.setAttribute('aria-live', 'polite');
    hero.innerHTML = `
      <div class="hero__side">
        <div class="hero__art">
          <img class="hero__img" alt="" decoding="async" width="560" height="560">
          <div class="hero__artvig"></div>
          <div class="hero__region"></div>
        </div>
        <div class="hero__vitals" aria-label="Starting numbers"></div>
        <div class="hero__knows">
          <h3 class="hero__h">Knows about the house</h3>
          <p class="hero__knowstext"></p>
        </div>

        <div class="hero__bond">
          <h3 class="hero__h">Bond <em class="hero__bondlvl"></em></h3>
          <div class="bondbar"><i></i></div>
        </div>
      </div>
      <div class="hero__body">
        <div class="hero__titles">
          <h2 class="hero__name"></h2>
          <p class="hero__sub"></p>
        </div>
        <p class="hero__identity"></p>
        <div class="hero__cols">
          <div class="hero__col hero__col--mech">
            <h3 class="hero__h">Signature mechanics</h3>
            <ul class="hero__mechs"></ul>
          </div>
          <div class="hero__swrap">
            <div>
              <h3 class="hero__h hero__h--good">Strengths</h3>
              <ul class="hero__list hero__list--good"></ul>
            </div>
            <div>
              <h3 class="hero__h hero__h--bad">Weaknesses</h3>
              <ul class="hero__list hero__list--bad"></ul>
            </div>
          </div>
        </div>
        <div class="hero__arch"><h3 class="hero__h">Deck archetypes</h3><div class="hero__pills"></div></div>
      </div>
      <div class="hero__deckwrap">
        <h3 class="hero__h hero__deckhead">Starting ${TERMS.deck} <em class="hero__decknote">every expedition begins here &mdash; the rest of the pool is found inside the house</em></h3>
        <div class="hero__deck"></div>
        <div class="hero__cta">
          <button type="button" class="btn btn--ghost" data-act="deselect">Choose another</button>
          <button type="button" class="btn btn--primary" data-act="tokid">Take <span class="hero__ctaname"></span> in <span aria-hidden="true">&#8594;</span></button>
        </div>
      </div>`;
    this._hero = hero;
    return hero;
  }

  /* ── kid step ───────────────────────────────────────────────────────────── */
  _buildKidStep() {
    const step = el('section', 'sel__kidstep');
    step.innerHTML = `
      <div class="kid__detail">
        <div class="kid__portrait"></div>
        <div class="kid__poster">
          <div class="poster__head">Missing</div>
          <div class="poster__photo"></div>
          <div class="poster__pet"></div>
          <div class="poster__species"></div>
          <p class="poster__lost"></p>
          <p class="poster__note"></p>
        </div>
        <div class="kid__info">
          <h2 class="kid__name"></h2>
          <p class="kid__trait"></p>
          <div class="kid__perk">
            <h3 class="hero__h">Persistent perk</h3>
            <b class="kid__perkname"></b>
            <p class="kid__perkdesc"></p>
          </div>
          <div class="kid__pack">
            <h3 class="hero__h">Backpack loadout <em class="kid__slots"></em></h3>
            <ul class="kid__packlist"></ul>
          </div>
          <p class="kid__focus"></p>
          <div class="kid__pairing">
            <h3 class="hero__h">Together</h3>
            <div class="pair">
              <div class="pair__pf" aria-hidden="true"></div>
              <p class="kid__pairtext"></p>
            </div>
          </div>
        </div>
      </div>
      <div class="kid__strip" role="listbox" aria-label="Choose a Kid"></div>`;

    const strip = step.querySelector('.kid__strip');
    for (const k of KIDS) {
      const info = KID_CODEX[k.slug] || {};
      const b = el('button', 'kid-tile');
      b.type = 'button';
      b.dataset.slug = k.slug;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      const pw = el('div', 'kid-tile__pf');
      /* The square head-and-shoulders crop, not the full painting. Eight full
         3:4 portraits squeezed into a strip of eight columns puts every face
         about 40 px tall and the row stops being a roster you can read. */
      pw.appendChild(kidPortrait({ ...k, petKind: info.species || k.petKind },
        { w: 192, h: 192, variant: 'thumb' }));
      b.appendChild(pw);
      b.appendChild(el('div', 'kid-tile__plate',
        `<span class="kid-tile__name">${k.name.split(' ')[0]}</span>` +
        `<span class="kid-tile__pet">looking for ${k.pet}</span>`));
      b.setAttribute('aria-label', `${k.name}, looking for ${k.pet}`);
      strip.appendChild(b);
    }
    this._kidStep = step;
    return step;
  }

  /* ── footer ─────────────────────────────────────────────────────────────── */
  _buildFooter() {
    const f = el('footer', 'sel__foot');

    const picks = el('div', 'foot__picks');
    picks.innerHTML =
      `<span class="foot__chip is-empty" data-chip="companion"><i></i><b>Companion</b><em>not chosen</em></span>` +
      `<span class="foot__chip is-empty" data-chip="kid"><i></i><b>Kid</b><em>not chosen</em></span>`;
    f.appendChild(picks);

    const haunt = el('div', 'foot__haunt');
    haunt.innerHTML = `<span class="foot__lbl">${TERMS.ascension}</span>`;
    const hrow = el('div', 'haunt__row', '');
    hrow.setAttribute('role', 'radiogroup');
    hrow.setAttribute('aria-label', TERMS.ascension);
    const maxHaunt = Math.max(0, Number(Save?.data?.hauntLevel ?? 0));
    for (const [lvl, name, desc] of HAUNTS) {
      const b = el('button', 'haunt__pip');
      b.type = 'button';
      b.dataset.haunt = String(lvl);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(lvl === this.state.haunt));
      b.textContent = String(lvl);
      const locked = lvl > maxHaunt;
      if (locked) { b.classList.add('is-locked'); b.disabled = true; }
      b.title = locked ? `Haunt ${lvl}: ${name} — locked` : `Haunt ${lvl}: ${name}. ${desc}`;
      b.setAttribute('aria-label', b.title);
      hrow.appendChild(b);
    }
    haunt.appendChild(hrow);
    haunt.appendChild(el('span', 'haunt__desc', HAUNTS[this.state.haunt][1]));
    f.appendChild(haunt);

    /* Typeable, not just readable. Settings already lets you set next run's
       seed while this screen — the one place you are actually choosing a run —
       only showed one, so "run my friend's house" meant a detour through a
       menu. Same `XXXX-XXXX` form the run-end screen prints, so a seed
       screenshotted off Game Over can be pasted straight back in here. */
    const seed = el('div', 'foot__seed');
    seed.innerHTML =
      `<label class="foot__lbl" for="sel-seed">Seed</label>` +
      `<input class="seed__val" id="sel-seed" type="text" spellcheck="false" autocomplete="off"
              maxlength="9" size="9" aria-describedby="sel-seed-hint"
              value="${formatSeed(this.state.seed)}">` +
      `<span class="seed__hint" id="sel-seed-hint">type one in, or roll</span>` +
      `<button type="button" class="seed__roll" aria-label="Roll a new seed">&#8635;</button>`;
    f.appendChild(seed);

    /* GOING IN TOGETHER.
       The flow is deliberately the SAME screen N times rather than a split
       view: you pick your Kid, then the next player picks theirs, and each
       pass after the first is exactly the seam a network layer will replace —
       another player's choice arriving from the wire instead of from the chair
       next to you. Nothing else about the screen changes.

       The count is a segmented control rather than a checkbox because the cap
       is four, and it is capped by MAX_PARTY itself rather than by a literal:
       the screen must never be able to set up a party the engine will refuse,
       which is precisely the failure mode the old "flip the constant" plan
       would have produced. */
    const pair = el('div', 'sel-pair');
    pair.setAttribute('role', 'group');
    pair.setAttribute('aria-label', 'How many Kids go in');
    const sizes = [];
    for (let n = 1; n <= MAX_PARTY; n++) {
      sizes.push(`<button type="button" class="sel-pair__size${n === 1 ? ' is-on' : ''}" `
        + `data-n="${n}" aria-pressed="${n === 1}" `
        + `aria-label="${n === 1 ? 'Go in alone' : `Go in with ${n - 1} friend${n > 2 ? 's' : ''}`}">${n}</button>`);
    }
    pair.innerHTML =
      `<span class="sel-pair__txt"><b>Kids going in</b><em>one house, up to ${MAX_PARTY}</em></span>`
      + `<span class="sel-pair__sizes">${sizes.join('')}</span>`;
    f.appendChild(pair);
    this._pair = pair;
    this._sizeBtns = [...pair.querySelectorAll('.sel-pair__size')];

    const go = el('button', 'btn btn--go');
    go.type = 'button';
    go.disabled = true;
    go.innerHTML = 'Begin Expedition';
    f.appendChild(go);

    this._foot = f;
    this._go = go;
    return f;
  }

  /* ── wiring ─────────────────────────────────────────────────────────────── */
  _wire() {
    const root = this.root;

    const unlockOnce = () => { try { this.ctx.audio?.unlock?.(); } catch {} };
    root.addEventListener('pointerdown', unlockOnce, { once: true });
    this._offs.push(() => root.removeEventListener('pointerdown', unlockOnce));

    /* The board. Hover and focus both LIGHT a frame; click and Enter CHOOSE it.
       One delegated listener per event for all sixteen, and the light itself is
       a CSS transition on two custom properties — nothing here runs per frame. */
    const board = this._grid;
    const onGrid = (e) => {
      const t = e.target.closest('.companion-tile');
      if (!t) return;
      unlockOnce();
      this._pickCompanion(t.dataset.slug);
    };
    /* Moving onto the wall between the frames — or onto an empty one — takes
       the candle away again. Leaving it burning on the last frame you touched
       while the pointer is somewhere else reads as a stuck highlight. */
    const onOver = (e) => {
      const t = e.target.closest?.('.companion-tile');
      const moved = this._light(t ? t.dataset.slug : this.state.companion);
      if (moved && t) { try { this.ctx.audio?.play?.('ui:hover'); } catch {} }
    };
    const onOut = () => this._light(this.state.companion);
    const onBlur = (e) => { if (!board.contains(e.relatedTarget)) onOut(); };
    board.addEventListener('click', onGrid);
    board.addEventListener('pointerover', onOver);
    board.addEventListener('pointerleave', onOut);
    board.addEventListener('focusin', onOver);
    board.addEventListener('focusout', onBlur);
    this._offs.push(() => {
      board.removeEventListener('click', onGrid);
      board.removeEventListener('pointerover', onOver);
      board.removeEventListener('pointerleave', onOut);
      board.removeEventListener('focusin', onOver);
      board.removeEventListener('focusout', onBlur);
    });
    /* Linear, not `cols: 4`. Only the Companions you can actually take are on
       the wall, so on a fresh save the four sit at (0,0), (1,0), (1,1) and
       (1,2) — arrow keys that step by four rows would land on empty frames that
       have no element. Left/Right and Up/Down both walk the roster in reading
       order instead. */
    this._offs.push(rovingFocus(board, '.companion-tile', {
      cols: 0,
      onActivate: (t) => this._pickCompanion(t.dataset.slug),
    }));

    // hero buttons
    const onHero = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'deselect') this._deselect();
      if (b.dataset.act === 'tokid') this._setMode('kid');
    };
    this._hero.addEventListener('click', onHero);
    this._offs.push(() => this._hero.removeEventListener('click', onHero));

    // kid strip — hover and focus PREVIEW, click and Enter CHOOSE
    const strip = this._kidStep.querySelector('.kid__strip');
    const onKid = (e) => {
      const b = e.target.closest('.kid-tile');
      if (b) this._pickKid(b.dataset.slug);
    };
    const onKidHover = (e) => {
      const b = e.target.closest?.('.kid-tile');
      if (b) this._showKid(b.dataset.slug);
    };
    const onKidOut = () => { if (this.state.kid) this._showKid(this.state.kid); };
    strip.addEventListener('click', onKid);
    strip.addEventListener('pointerover', onKidHover);
    strip.addEventListener('pointerleave', onKidOut);
    strip.addEventListener('focusin', onKidHover);
    this._offs.push(() => {
      strip.removeEventListener('click', onKid);
      strip.removeEventListener('pointerover', onKidHover);
      strip.removeEventListener('pointerleave', onKidOut);
      strip.removeEventListener('focusin', onKidHover);
    });
    this._offs.push(rovingFocus(strip, '.kid-tile', { cols: 4, onActivate: (b) => this._pickKid(b.dataset.slug) }));

    // haunt
    const hrow = this._foot.querySelector('.haunt__row');
    const onHaunt = (e) => {
      const b = e.target.closest('.haunt__pip');
      if (!b || b.disabled) return;
      this.state.haunt = Number(b.dataset.haunt);
      for (const p of hrow.querySelectorAll('.haunt__pip')) p.setAttribute('aria-checked', String(Number(p.dataset.haunt) === this.state.haunt));
      this._foot.querySelector('.haunt__desc').textContent = HAUNTS[this.state.haunt][1];
    };
    hrow.addEventListener('click', onHaunt);
    this._offs.push(() => hrow.removeEventListener('click', onHaunt));
    this._offs.push(rovingFocus(hrow, '.haunt__pip', { cols: 0, onActivate: (b) => b.click() }));

    // seed
    const roll = this._foot.querySelector('.seed__roll');
    const seedIn = this._foot.querySelector('.seed__val');
    const onRoll = () => {
      this.state.seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      seedIn.value = formatSeed(this.state.seed);
      seedIn.classList.remove('is-bad');
    };
    // Commit on blur / Enter, not per keystroke: half a seed is not a seed.
    const onSeedCommit = () => {
      const n = parseSeed(seedIn.value);
      if (n == null) { seedIn.classList.add('is-bad'); seedIn.value = formatSeed(this.state.seed); }
      else { this.state.seed = n; seedIn.classList.remove('is-bad'); }
      seedIn.value = formatSeed(this.state.seed);
    };
    const onSeedKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onSeedCommit(); seedIn.blur(); }
    };
    roll.addEventListener('click', onRoll);
    seedIn.addEventListener('change', onSeedCommit);
    seedIn.addEventListener('blur', onSeedCommit);
    seedIn.addEventListener('keydown', onSeedKey);
    this._offs.push(() => {
      roll.removeEventListener('click', onRoll);
      seedIn.removeEventListener('change', onSeedCommit);
      seedIn.removeEventListener('blur', onSeedCommit);
      seedIn.removeEventListener('keydown', onSeedKey);
    });

    // how many Kids go in
    const onSize = (ev) => {
      const btn = ev.currentTarget;
      const n = Math.max(1, Math.min(MAX_PARTY, Number(btn.dataset.n) || 1));
      this.state.partySize = n;
      this.state.coop = n > 1;
      /* Shrinking the party mid-flow drops anyone already locked in beyond the
         new size, rather than leaving Kids nobody can see waiting for a slot
         that no longer exists. */
      if (this.state.party.length > n - 1) this.state.party.length = Math.max(0, n - 1);
      for (const b of this._sizeBtns) {
        const on = Number(b.dataset.n) === n;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      this._syncGo();
    };
    for (const b of this._sizeBtns) {
      b.addEventListener('click', onSize);
      this._offs.push(() => b.removeEventListener('click', onSize));
    }

    // go
    const onGo = () => this._begin();
    this._go.addEventListener('click', onGo);
    this._offs.push(() => this._go.removeEventListener('click', onGo));

    const onResize = () => {
      clearTimeout(this._rzT);
      this._rzT = setTimeout(() => this._layoutDeck(), 120);
    };
    addEventListener('resize', onResize, { passive: true });
    this._offs.push(() => { removeEventListener('resize', onResize); clearTimeout(this._rzT); });

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this._back(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !this._go.disabled) { e.preventDefault(); this._begin(); }
    };
    addEventListener('keydown', onKey);
    this._offs.push(() => removeEventListener('keydown', onKey));
  }

  /* ── selection ──────────────────────────────────────────────────────────── */
  _pickCompanion(slug, instant = false) {
    const c = COMPANION_BY_SLUG[slug];
    const codex = CODEX[slug];
    if (!c || !codex) return;
    this.state.companion = slug;
    // the Kid dossier's "Together" panel is about THIS Companion — force a redraw
    this._shownKid = null;

    for (const t of this._grid.querySelectorAll('.companion-tile')) {
      const on = t.dataset.slug === slug;
      t.classList.toggle('is-selected', on);
      t.setAttribute('aria-selected', String(on));
    }
    this._light(slug);   // the candle stays with the one you took

    const h = this._hero;
    const img = h.querySelector('.hero__img');
    img.src = heroSrc(slug);
    img.alt = `${c.name}, ${c.title}`;
    h.querySelector('.hero__region').textContent = `Bound to ${REGION_NAMES[c.region] ?? c.region}`;
    h.querySelector('.hero__name').textContent = c.name;
    h.querySelector('.hero__sub').textContent = c.title;
    h.querySelector('.hero__identity').textContent = codex.identity;
    h.querySelector('.hero__knowstext').textContent = codex.knows ?? '';
    const bond = Number(Save?.data?.bonds?.[slug] ?? 0);
    h.querySelector('.hero__bondlvl').textContent = `${bond} / 5`;
    h.querySelector('.bondbar i').style.width = `${(bond / 5) * 100}%`;
    h.querySelector('.hero__ctaname').textContent = c.name;

    const mechs = h.querySelector('.hero__mechs');
    mechs.innerHTML = codex.mechanics.map(([name, desc]) =>
      `<li><span class="chip">${name}</span><span class="mech__desc">${desc}</span></li>`).join('');

    this._renderDeck(h.querySelector('.hero__deck'), slug, codex);

    h.querySelector('.hero__list--good').innerHTML = codex.strengths.map((s) => `<li>${s}</li>`).join('');
    h.querySelector('.hero__list--bad').innerHTML = codex.weaknesses.map((s) => `<li>${s}</li>`).join('');
    h.querySelector('.hero__pills').innerHTML = codex.archetypes.map((a) => `<span class="pill">${a}</span>`).join('');

    this._setChip('companion', c.name, c.title);
    this._setMode('hero', instant);
    this._syncGo();
  }

  /**
   * The starting deck.
   *
   * The codex summary paints first so there is never an empty frame, then the
   * authored cards from data/cards.js replace it with the *real* renderer —
   * card-feel's CardView, at the exact frame, rarity and rules text the player
   * will hold in combat. Companions whose module has not shipped keep the
   * summary. Both paths are guarded: neither module is ours.
   */
  async _renderDeck(host, slug, codex) {
    this._killDeckCards();
    host.classList.remove('is-real');

    const renderSummary = (rows) => {
      host.innerHTML = rows.map(([n, name, type, text]) => `
        <div class="mcard" data-type="${type}">
          <span class="mcard__cost">1</span>
          <span class="mcard__n">${n > 1 ? `&#215;${n}` : ''}</span>
          <span class="mcard__name">${name}</span>
          <span class="mcard__type">${TYPE_LABEL[type] ?? type}</span>
          <span class="mcard__text">${text}</span>
        </div>`).join('');
      const total = rows.reduce((s, r) => s + r[0], 0);
      host.appendChild(el('div', 'hero__decktotal', `${total} ${TERMS.deck}`));
    };
    renderSummary(codex.deck);

    let defs = [];
    let def = null;
    try {
      const mod = await import('../data/cards.js');
      defs = mod.startingDeckFor?.(slug) ?? [];
      def = mod.companion?.(slug) ?? null;
    } catch { defs = []; }
    if (this.state.companion !== slug || !this._hero) return;   // moved on mid-import
    this._setVitals(def, defs.length);
    if (!Array.isArray(defs) || !defs.length) return;

    let CardView;
    try {
      await ensureCss(CSS_CARD);
      ({ CardView } = await import('../ui/card.js'));
    } catch { return; }
    if (this.state.companion !== slug || !this._hero || !CardView) return;

    // collapse duplicates: the player wants to read five distinct Tricks, not
    // count ten identical ones
    const counts = new Map();
    for (const d of defs) {
      if (!d?.id) continue;
      const hit = counts.get(d.id);
      if (hit) hit.n++; else counts.set(d.id, { n: 1, def: d });
    }
    const rows = [...counts.values()];

    host.innerHTML = '';
    host.classList.add('is-real');
    host.style.setProperty('--deck-n', String(rows.length));
    const largeText = !!Save?.settings?.largeText;
    for (const { n, def: d } of rows) {
      const slot = el('div', 'deckslot');
      if (n > 1) slot.appendChild(el('span', 'deckslot__n', `&#215;${n}`));
      let view;
      try {
        view = new CardView(d, { uid: `sel-${d.id}`, largeText, reduceMotion: reduceMotion() });
      } catch { continue; }
      slot.appendChild(view.el);
      host.appendChild(slot);
      this._deckCards.push({ view, slot });
    }
    host.appendChild(el('div', 'hero__decktotal', `${defs.length} ${TERMS.deck}`));
    this._layoutDeck();
  }

  /** Scale each CardView to the slot CSS gave it. Called on render and resize. */
  _layoutDeck() {
    // Measured, not hard-coded at 224 — `--card-w` is responsive now, and the
    // stale constant left the "x2" count pill floating off the card. _cardfit.js.
    for (const { view, slot } of this._deckCards) fitCardToSlot(view, slot);
  }

  _killDeckCards() {
    for (const { view } of this._deckCards) { try { view.destroy(); } catch {} }
    this._deckCards.length = 0;
  }

  /** Starting Courage / Nerve / deck size, the way a character-select should. */
  _setVitals(def, deckSize) {
    const host = this._hero?.querySelector('.hero__vitals');
    if (!host) return;
    const hp = Number(def?.startingHp) || 70;
    const nerve = Number(def?.startingEnergy) || 3;
    host.innerHTML =
      `<div class="vital vital--hp"><span class="vital__n">${hp}</span><span class="vital__l">${TERMS.hp}</span></div>` +
      `<div class="vital vital--nerve"><span class="vital__n">${nerve}</span><span class="vital__l">${TERMS.energy} / turn</span></div>` +
      `<div class="vital vital--deck"><span class="vital__n">${deckSize || 10}</span><span class="vital__l">Starting ${TERMS.deck}</span></div>`;
  }

  _deselect() {
    this.state.companion = null;
    for (const t of this._grid.querySelectorAll('.companion-tile')) {
      t.classList.remove('is-selected');
      t.setAttribute('aria-selected', 'false');
    }
    this._light(null);
    this._setChip('companion', null);
    this._setMode('grid');
    this._syncGo();
  }

  /**
   * Fill the dossier for one Kid WITHOUT choosing them.
   *
   * Step 2 used to render nothing at all until you clicked: an empty grey
   * MISSING poster over three empty section headers, which read as a broken
   * screen rather than an invitation. The panel is a preview now — it follows
   * the pointer and the focus ring the way the reward fan does — and the footer
   * chip still says "not chosen" until you actually commit.
   */
  _showKid(slug) {
    const k = KIDS.find((x) => x.slug === slug);
    const info = KID_CODEX[slug];
    if (!k || !info || !this._kidStep) return;
    if (this._shownKid === slug) return;
    this._shownKid = slug;

    const step = this._kidStep;
    for (const b of step.querySelectorAll('.kid-tile')) {
      b.classList.toggle('is-shown', b.dataset.slug === slug);
    }

    /* The hero slot: the whole painting, full height of the dossier. This is
       the one place a Kid is looked at rather than glanced at, so it gets the
       720x960 file and not the thumbnail crop. */
    const pf = step.querySelector('.kid__portrait');
    pf.innerHTML = '';
    pf.appendChild(kidPortrait({ ...k, petKind: info.species }, { w: 360, h: 480 }));

    step.querySelector('.poster__pet').textContent = k.pet;
    step.querySelector('.poster__species').textContent = info.species;
    step.querySelector('.poster__lost').textContent = info.lost;
    step.querySelector('.poster__note').textContent = info.note;
    /* The actual photograph of the actual animal. This box used to hold one
       hard-coded cat-shaped path shown for every pet on the roster, Samir's
       guinea pig included — the single image the whole game is about. */
    const photo = step.querySelector('.poster__photo');
    photo.innerHTML = '';
    photo.appendChild(petPortrait(k.slug, { alt: `${k.pet}, ${info.species.toLowerCase()}` }));

    step.querySelector('.kid__name').textContent = k.name;
    step.querySelector('.kid__trait').textContent = info.trait;
    step.querySelector('.kid__perkname').textContent = info.perk[0];
    step.querySelector('.kid__perkdesc').textContent = info.perk[1];
    step.querySelector('.kid__focus').innerHTML = `<span class="foot__lbl">Plays around</span> ${info.focus}`;
    step.querySelector('.kid__pairtext').textContent = pairingNote(this.state.companion, slug);

    // the Companion travelling with them, so "Together" is a picture and not a claim
    const pairHost = step.querySelector('.pair__pf');
    if (pairHost) {
      try { this._pairPf?.destroy?.(); } catch {}
      this._pairPf = null;
      pairHost.innerHTML = '';
      const cslug = this.state.companion;
      if (cslug && COMPANION_BY_SLUG[cslug]) {
        const pf = companionPortrait({ slug: cslug, variant: '@2x', parallax: 0.5, shimmer: true });
        this._pairPf = pf;
        pairHost.appendChild(pf.el);
        pairHost.appendChild(el('span', 'pair__name', COMPANION_BY_SLUG[cslug].name));
      }
    }

    /* The Backpack, read from the one item table and from the Clubhouse's saved
       pack. This is the loadout `_begin` hands to the run — the same array, from
       the same call — so what is printed here is what the kid walks in with. */
    const ids = loadoutFor(slug);
    const used = loadoutSize(ids);
    const custom = loadoutIsCustom(slug);
    const slots = step.querySelector('.kid__slots');
    slots.textContent = `${used} / ${SLOTS_BASE} slots${custom ? ' · packed at the Clubhouse' : ''}`;
    slots.classList.toggle('is-custom', custom);
    step.querySelector('.kid__packlist').innerHTML = ids.length
      ? ids.map((id) => {
        const it = itemById(id);
        const n = it.size;
        /* The description rides a tooltip rather than a fourth cell: `.packitem`
           is a three-column grid in select.css, which this scene does not own. */
        return `<li class="packitem" tabindex="0" data-tip-title="${escHtml(it.name)}" ` +
          `data-tip="${escHtml(it.desc)}" data-tip-placement="top">` +
          `<span class="packitem__slots" aria-hidden="true">${'■'.repeat(n)}</span>` +
          `<span class="packitem__name">${escHtml(it.name)}</span>` +
          `<span class="packitem__n">${n} slot${n > 1 ? 's' : ''}</span></li>`;
      }).join('')
      : '<li class="packitem packitem--empty">Nothing packed. Every Curiosity that asks for Gear will be closed.</li>';

    step.dataset.chosen = '1';
  }

  /** Commit to a Kid. The dossier is already on screen; this is the decision. */
  _pickKid(slug, instant = false) {
    const k = KIDS.find((x) => x.slug === slug);
    if (!k || !KID_CODEX[slug]) return;
    this.state.kid = slug;
    this._showKid(slug);

    for (const b of this._kidStep.querySelectorAll('.kid-tile')) {
      const on = b.dataset.slug === slug;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', String(on));
    }
    this._setChip('kid', k.name, `looking for ${k.pet}`);
    if (!instant) this._setMode('kid');
    this._syncGo();
  }

  _setChip(which, name, sub) {
    const chip = this._foot.querySelector(`[data-chip="${which}"]`);
    if (!chip) return;
    chip.classList.toggle('is-empty', !name);
    chip.querySelector('b').textContent = name ?? (which === 'kid' ? 'Kid' : 'Companion');
    chip.querySelector('em').textContent = name ? (sub ?? '') : 'not chosen';
  }

  _syncGo() {
    const ready = !!(this.state.companion && this.state.kid);
    this._go.disabled = !ready;
    this._go.classList.toggle('is-ready', ready);

    /* More Kids still to pick than the one being picked right now. */
    const want = this.state.partySize || 1;
    const waiting = this.state.party.length < want - 1;
    this._go.innerHTML = waiting ? 'Lock in &amp; pass it over' : 'Begin Expedition';

    // Who is already locked in, so the next player can see whose turn it is.
    if (this._pair) {
      const inAlready = this.state.party;
      this._pair.classList.toggle('is-armed', want > 1);
      if (!inAlready.length) {
        this._pair.dataset.first = '';
      } else {
        const names = inAlready.map(p => {
          const k = KIDS.find(x => x.slug === p.kid);
          return (k ? k.name : p.kid).split(' ')[0];
        });
        this._pair.dataset.first = want > 2
          ? `${names.join(', ')} in — ${want - inAlready.length} to go`
          : `${names[0]} is in`;
      }
    }
  }

  _setMode(mode, instant = false) {
    if (mode === 'kid' && !this.state.companion) return;
    this.state.mode = mode;
    this.root.dataset.mode = mode;
    /* Arriving at step 2 with a live dossier instead of an empty poster. The
       Companion decides the "Together" panel, so the preview is re-rendered
       whenever we walk in. */
    if (mode === 'kid' && !this._shownKid) this._showKid(this.state.kid || KIDS[0].slug);
    const stepIndex = mode === 'grid' ? 1 : mode === 'hero' ? 1 : 2;
    for (const li of this._rail.querySelectorAll('.sel-rail__step')) {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === (this.state.kid && mode === 'kid' ? 3 : stepIndex));
      li.classList.toggle('is-done', n < stepIndex || (n === 2 && !!this.state.kid && mode === 'kid'));
    }
    if (instant || reduceMotion()) return;
    // move focus somewhere sensible for keyboard users
    requestAnimationFrame(() => {
      if (mode === 'hero') this._hero.querySelector('[data-act="tokid"]')?.focus();
      else if (mode === 'kid') (this._kidStep.querySelector('.kid-tile.is-selected') || this._kidStep.querySelector('.kid-tile'))?.focus();
      else (this._grid.querySelector('.companion-tile.is-selected') || this._grid.querySelector('.companion-tile'))?.focus();
    });
  }

  _back() {
    if (this.state.mode === 'kid') this._setMode('hero');
    else if (this.state.mode === 'hero') this._deselect();
    else this.ctx.scenes?.go?.('title', {});
  }

  _begin() {
    const { companion, kid, seed, haunt } = this.state;
    if (!companion || !kid) return;
    /* `string[]` of ids — the shape `state/run.js` and `data/backpack.js` both
       consume. This used to emit `[{name:'Multitool', slots:2}]`, which nothing
       downstream could read, and it silently disabled the entire Backpack. */
    const backpack = assertLoadout(loadoutFor(kid), `select.js _begin(kid:'${kid}')`);

    /* Not the LAST of the party. Lock this Kid in, wipe the picks, and hand the
       screen over. The expedition does not start until everybody has chosen —
       this is the same branch that used to hard-code "of two", and the only
       thing that changed is what it counts against. */
    const want = this.state.partySize || 1;
    if (this.state.party.length < want - 1) {
      this.state.party.push({ companion, kid, backpack });
      this.state.companion = null;
      this.state.kid = null;
      // 'ui:confirm', not the expedition's 'ui:begin' — locking a Kid in is a
      // step, not the door opening.
      try { this.ctx.audio?.play?.('ui:confirm'); } catch {}
      this._setChip('companion', null);
      this._setChip('kid', null);
      this._syncGo();
      this._setMode('grid');
      return;
    }

    const payload = want > 1
      ? { seed, haunt, kids: [...this.state.party, { companion, kid, backpack }] }
      : { companion, kid, seed, haunt, backpack };
    try { this.ctx.audio?.play?.('ui:begin'); } catch {}
    bus.emit('run:start', payload);
    this.root.classList.add('is-leaving');
    const go = () => this.ctx.scenes?.go?.('map', payload);
    if (reduceMotion()) go();
    else clock.wait(0.32).then(go);
  }

  update(dt, t) {
    // nothing per-frame: every animation on this screen is CSS-composited.
  }

  async exit() {
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this._killDeckCards();
    try { this._pairPf?.destroy?.(); } catch {}
    this._pairPf = null;
    this._lit = this._flame = this._plate = null;
    this._grid = this._hero = this._kidStep = this._foot = this._go = this._rail = null;
    this.root.innerHTML = '';
  }
}
