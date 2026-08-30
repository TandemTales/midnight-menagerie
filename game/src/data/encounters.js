/**
 * Authored Scuffle formations. OWNER: enemies.
 * Source of truth: docs/design/regions/*.md ("Early / Standard / Advanced Scuffles"
 * plus each region's "Encounter selection rules").
 *
 * The point of this file, in the design doc's own words: "The same six enemy designs
 * therefore produce a much larger combat pool." Formations are authored, never random
 * bags of enemies — each one exists to ask a specific question.
 *
 * Public API
 *   encountersFor(region, tier)                  → EncounterDef[]
 *   rollEncounter(region, tier, rng, history)    → EncounterDef   (no immediate repeats)
 *   buildEncounter(id, rng, hauntLevel)          → [{enemyId, hp, slot, ...}]
 */

import { getEnemy, hasEnemy, rollHp } from './enemies/index.js';

/**
 * @typedef {Object} EncounterMember
 * @property {string} enemyId
 * @property {number} [hpMul]    scale this member's rolled Courage (summon-style spawns)
 * @property {number} [hp]       absolute Courage override, wins over hpMul
 *
 * @typedef {Object} EncounterDef
 * @property {string} id
 * @property {string} region
 * @property {'early'|'standard'|'advanced'|'elite'|'boss'} tier
 * @property {string} name        the formation as the design doc names it
 * @property {EncounterMember[]} members   left-to-right board order
 * @property {string} teaches     why this formation exists
 * @property {number} [minScuffle] earliest Scuffle index (0-based) it may appear at
 * @property {boolean} [advancedOnly] excluded from any "appears earlier" relaxation
 * @property {number} [weight]    relative pick weight within its tier (default 1)
 */

const m = (enemyId, extra) => Object.assign({ enemyId }, extra || {});

// ─────────────────────────────────────────────────────────────────────────────
// The Forgotten Foyer — docs/design/regions/01-foyer.md §7–§10
// ─────────────────────────────────────────────────────────────────────────────
const FOYER = [
  // ── Early: "The earliest encounter pool should be simple." ────────────────
  {
    id: 'foyer-1', region: 'foyer', tier: 'early', name: 'Dust Bunny',
    members: [m('dust-bunny')],
    teaches: 'Introduces escalating enemy state. Poking it for 3 is sometimes better than killing it.',
  },
  {
    id: 'foyer-2', region: 'foyer', tier: 'early', name: 'Coatrack Crawler',
    members: [m('coatrack-crawler')],
    teaches: 'Introduces disruptible enemy preparation — break the Brace, shrink the Jab.',
  },
  {
    id: 'foyer-3', region: 'foyer', tier: 'early', name: 'Two Dust Bunnies',
    members: [m('dust-bunny'), m('dust-bunny')],
    teaches: 'Target prioritisation. One is Gathering while the other prepares to Tumble.',
  },
  {
    id: 'foyer-4', region: 'foyer', tier: 'early', name: 'Lost Luggage',
    members: [m('lost-luggage')],
    teaches: 'Very mild deck interference. Clutter costs a draw, not a Nerve.',
  },
  {
    /**
     * BALANCE 2026-08-20 round 3 — authored to close the free-opening gap.
     *
     * A quarter of opening Scuffles cost the player nothing. The cause is structural,
     * not numeric: only three enemies are legal in a first Scuffle, and against a fresh
     * deck a SOLO enemy is almost perfectly blockable. Measured Guard absorption is 95%
     * for one Dust Bunny and 91% for one Coatrack Crawler, versus 46-57% once two
     * enemies act on different cycles. Raising a single enemy's damage does not fix
     * that — the bot simply blocks the bigger number. Two attackers does.
     *
     * The early pool had exactly one pair (foyer-3, 40 Courage) and the next step up was
     * foyer-7 at 50, which measured 14.65 and overshot the 8-12 target once Clutter went
     * live. This sits between them at 43: a half-packed case that still runs its full
     * Pack Wrong / Baggage Bash / Snap Shut cycle and still pollutes the deck, but dies
     * early enough to land roughly one Clutter instead of two or three.
     *
     * The two cycles are deliberately coprime — the Bunny alternates on 2, the case runs
     * on 4 — so they never stack their big turns and the fight threatens without spiking.
     */
    id: 'foyer-4b', region: 'foyer', tier: 'early', name: 'Dust Bunny + Half-Packed Luggage',
    members: [m('dust-bunny'), m('lost-luggage', { hpMul: 0.75 })],
    teaches: 'Two attackers on different clocks. One turn of Guard can no longer cover '
      + 'the whole room, which is the first time that is true.',
  },

  // ── Standard: "These begin combining mechanics." ──────────────────────────
  {
    id: 'foyer-5', region: 'foyer', tier: 'standard', name: 'Dust Bunny + Calling Bell',
    members: [m('dust-bunny'), m('calling-bell')],
    teaches: 'The Bell makes the Bunny dangerous faster than expected.',
  },
  {
    id: 'foyer-6', region: 'foyer', tier: 'standard', name: 'Coatrack Crawler + Dust Bunny',
    members: [m('coatrack-crawler'), m('dust-bunny')],
    teaches: 'Choose between disrupting Brace and preventing Dust accumulation.',
  },
  {
    id: 'foyer-7', region: 'foyer', tier: 'standard', name: 'Lost Luggage + Dust Bunny',
    members: [m('lost-luggage'), m('dust-bunny')],
    teaches: 'Deck interference competes with immediate escalation.',
    // BALANCE 2026-08-20 round 1 promoted this to 'early' to put a second pair
    // in the opening pool; round 2 put it back. Clutter went live in between
    // (state/run.js now registers STATUS_TRICK_DEFS, so Lost Luggage's deck
    // interference finally does something), which made this a materially harder
    // fight than the one that was promoted: opening-Scuffle cost measured 14.65
    // against an 8-12 target. The weighted roll below does the composition work
    // on its own.
  },
  {
    id: 'foyer-8', region: 'foyer', tier: 'standard', name: 'Door Greeter + Dust Bunny',
    members: [m('door-greeter'), m('dust-bunny')],
    teaches: 'Wanting to play several Tricks conflicts with the Greeter\'s rule.',
  },

  // ── Advanced: "These appear deeper in the region." ────────────────────────
  {
    id: 'foyer-9', region: 'foyer', tier: 'advanced', name: 'Coatrack Crawler + Calling Bell',
    members: [m('coatrack-crawler'), m('calling-bell')],
    teaches: 'Roused can make Umbrella Jab substantially more threatening.',
  },
  {
    id: 'foyer-10', region: 'foyer', tier: 'advanced', name: 'Lost Luggage + Door Greeter',
    members: [m('lost-luggage'), m('door-greeter')],
    teaches: 'Your hand gets less efficient while the Greeter discourages dumping it.',
  },
  {
    id: 'foyer-11', region: 'foyer', tier: 'advanced', name: 'Red Carpet Runner',
    members: [m('red-carpet-runner')],
    teaches: 'Strong enough to carry a solo encounter. The region\'s first serious telegraph.',
    minScuffle: 2,
  },
  {
    id: 'foyer-12', region: 'foyer', tier: 'advanced', name: 'Red Carpet Runner + Dust Bunny',
    members: [m('red-carpet-runner'), m('dust-bunny')],
    teaches: 'How much damage do you spend disrupting Momentum versus controlling Dust?',
    minScuffle: 2,
  },
  {
    id: 'foyer-13', region: 'foyer', tier: 'advanced', name: 'Coatrack Crawler + Lost Luggage',
    members: [m('coatrack-crawler'), m('lost-luggage')],
    teaches: 'A slower attrition fight.',
  },
  {
    id: 'foyer-14', region: 'foyer', tier: 'advanced', name: 'Door Greeter + Calling Bell + Dust Bunny',
    // Board order is turn order. The Bell is placed LAST so Ring always resolves after
    // its allies have swung — a Roused granted mid-phase would boost an attack whose
    // intent number was already on screen, and the intent must never under-report.
    members: [m('door-greeter'), m('dust-bunny'), m('calling-bell')],
    teaches: 'One of the region\'s hardest normal formations. The Bell demands attention, the Greeter modifies sequencing, the Bunny punishes neglect.',
    advancedOnly: true,
  },

  // ── Big Scares ────────────────────────────────────────────────────────────
  /**
   * BALANCE 2026-08-20 (two-region round) — all three at 0.9x Courage.
   *
   * The Foyer's Big Scares were tuned when the Foyer WAS the game: at that point a
   * 78%-competent elite was the right shape, because the only thing behind it was the
   * Butler. With `RUN_LENGTH_REGIONS = 2` they are act-one elites, and act one was
   * removing 35% of all competent runs before the Nursery had been seen at all — ten of
   * sixty competent deaths were at a Foyer Big Scare and eight more were Foyer Scuffles
   * fought on the Courage those Big Scares had taken. Whole-run survival is the product
   * of every act, so an act-one elite band that was correct for a one-act game caps a
   * two-act game far below its own target.
   *
   * Swept at the real Foyer elite door, 45 fights per step (`sweep.py --tier elite`):
   *
   *   xCourage   competent   naive   turns
   *     1.00       80.0%     55.6%    9.1
   *     0.90       91.1%     73.3%    8.1     <- here
   *     0.85       95.6%     75.6%    7.8
   *     0.80      100.0%     77.8%    7.4
   *
   * 0.85 and below make them free for a competent player and stop teaching anything.
   * 0.90 keeps an 18-point skill gap and still costs 35 Courage to win.
   *
   * Applied as `hpMul` here rather than in `enemies/foyer.js` because this pass owns the
   * encounter tables, not the Foyer roster — see the note in docs/notes/.
   */
  {
    id: 'foyer-scare-coatcheck', region: 'foyer', tier: 'elite', name: 'The Grand Coatcheck',
    members: [m('grand-coatcheck', { hpMul: 0.9 })],
    teaches: 'Adaptability. Accept the current Garment or spend 18 damage in a turn to Snag it.',
  },
  {
    id: 'foyer-scare-guest', region: 'foyer', tier: 'elite', name: 'The Unwelcome Guest',
    members: [m('unwelcome-guest', { hpMul: 0.9 })],
    teaches: 'Pattern breaking. It never says "do not play Skills" — only "not three of them again".',
  },
  {
    id: 'foyer-scare-bell', region: 'foyer', tier: 'elite', name: 'The House Bell',
    members: [m('house-bell', { hpMul: 0.9 })],
    teaches: 'Add management. Race the Toll, or kill its summons to push Resonance back down.',
  },

  // ── Boss ──────────────────────────────────────────────────────────────────
  {
    id: 'foyer-boss', region: 'foyer', tier: 'boss', name: 'The Butler',
    members: [m('butler')],
    teaches: 'House Rules. Breaking one is sometimes correct — three Flustered makes him Discomposed.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Forgotten Nursery — docs/design/regions/02-nursery.md §8–§11
// ─────────────────────────────────────────────────────────────────────────────
const NURSERY = [
  // ── Early ─────────────────────────────────────────────────────────────────
  {
    id: 'nursery-1', region: 'nursery', tier: 'early', name: 'Button Baby',
    members: [m('button-baby')],
    teaches: 'A support enemy with nobody to support. It still fights — and shows you what a Button is for.',
  },
  {
    id: 'nursery-2', region: 'nursery', tier: 'early', name: 'Jack in the Box',
    members: [m('jack-in-the-box')],
    teaches: 'Introduces Wound Up and Jammed. Break the Guard, unwind the POP.',
  },
  {
    id: 'nursery-3', region: 'nursery', tier: 'early', name: 'Porcelain Doll',
    members: [m('porcelain-doll')],
    teaches: 'Enemies that change at Courage thresholds. Hurting it makes it worse.',
  },
  {
    id: 'nursery-4', region: 'nursery', tier: 'early', name: 'Patchwork Soldier',
    members: [m('patchwork-soldier')],
    teaches: 'Its baseline pattern, alone, before you ever see it repair anything.',
  },

  // ── Standard ──────────────────────────────────────────────────────────────
  {
    id: 'nursery-5', region: 'nursery', tier: 'standard', name: 'Button Baby + Jack in the Box',
    members: [m('button-baby'), m('jack-in-the-box')],
    teaches: 'A Button can dramatically change POP!',
  },
  {
    id: 'nursery-6', region: 'nursery', tier: 'standard', name: 'Patchwork Soldier + Porcelain Doll',
    members: [m('patchwork-soldier'), m('porcelain-doll')],
    teaches: 'Repairing the Doll moves it backward between Crack states — which can help you or hurt you.',
  },
  {
    id: 'nursery-7', region: 'nursery', tier: 'standard', name: 'Blanket Blob + Button Baby',
    members: [m('blanket-blob'), m('button-baby')],
    teaches: 'The Blob protects the support enemy while the support enemy improves the Blob.',
  },
  {
    id: 'nursery-8', region: 'nursery', tier: 'standard', name: 'Rocking Horse + Button Baby',
    members: [m('rocking-horse'), m('button-baby')],
    teaches: 'Every Button generates Excitement. Enemy mechanics visibly feeding each other.',
    minScuffle: 2,
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    id: 'nursery-9', region: 'nursery', tier: 'advanced', name: 'Rocking Horse + Patchwork Soldier',
    members: [m('rocking-horse'), m('patchwork-soldier')],
    teaches: 'Every repair generates Excitement. This gets dangerous surprisingly quickly.',
    minScuffle: 2,
  },
  {
    id: 'nursery-10', region: 'nursery', tier: 'advanced', name: 'Blanket Blob + Porcelain Doll',
    members: [m('blanket-blob'), m('porcelain-doll')],
    teaches: 'Cover makes it hard to push the Doll quickly through its dangerous middle state.',
  },
  {
    id: 'nursery-11', region: 'nursery', tier: 'advanced', name: 'Jack in the Box + Patchwork Soldier',
    members: [m('jack-in-the-box'), m('patchwork-soldier')],
    teaches: 'The Soldier repairs the damage you spent trying to Jam the Jack.',
  },
  {
    id: 'nursery-12', region: 'nursery', tier: 'advanced', name: 'Button Baby + Blanket Blob + Porcelain Doll',
    members: [m('button-baby'), m('blanket-blob'), m('porcelain-doll')],
    teaches: 'A target priority puzzle: the support, the protector, or the escalating Doll?',
    advancedOnly: true, requiresSeen: ['jack-in-the-box', 'porcelain-doll'],
  },
  {
    id: 'nursery-13', region: 'nursery', tier: 'advanced', name: 'Rocking Horse + Blanket Blob',
    members: [m('rocking-horse'), m('blanket-blob')],
    teaches: 'Cover grants Excitement the moment it lands. The Horse escalates from there.',
    minScuffle: 2,
  },
  {
    id: 'nursery-14', region: 'nursery', tier: 'advanced', name: 'Patchwork Soldier + Rocking Horse + Button Baby',
    members: [m('patchwork-soldier'), m('rocking-horse'), m('button-baby')],
    teaches: 'One of the Nursery\'s hardest ordinary encounters. Every Button and every repair accelerates the Horse.',
    advancedOnly: true, requiresSeen: ['jack-in-the-box', 'porcelain-doll'],
  },

  // ── Big Scares ────────────────────────────────────────────────────────────
  {
    id: 'nursery-scare-chest', region: 'nursery', tier: 'elite', name: 'The Toy Chest',
    members: [m('toy-chest')],
    teaches: 'Battlefield management. Hold the lid shut, farm the toys, or race the chest.',
  },
  {
    id: 'nursery-scare-giant', region: 'nursery', tier: 'elite', name: 'The Patchwork Giant',
    members: [m('patchwork-giant')],
    teaches: 'Progressive transformation. It loses options and gains damage as you dismantle it.',
  },
  {
    id: 'nursery-scare-twins', region: 'nursery', tier: 'elite', name: 'The Porcelain Twins',
    members: [m('porcelain-twin-prim'), m('porcelain-twin-proper')],
    teaches: 'Effect transfer. Split them, or push both into Shattered at the same time.',
  },

  // ── Boss ──────────────────────────────────────────────────────────────────
  {
    id: 'nursery-boss', region: 'nursery', tier: 'boss', name: 'The Governess',
    members: [m('governess'), m('favorite-doll')],
    teaches: 'Stitched Together. Tear the Doll for a window, and decide whether her repair turns are your setup time.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Sleeping Quarters — docs/design/regions/03-sleeping-quarters.md §9–§12
// ─────────────────────────────────────────────────────────────────────────────
const SQ = [
  // ── Early ─────────────────────────────────────────────────────────────────
  {
    id: 'sq-1', region: 'sleeping-quarters', tier: 'early', name: 'Pillow Puff',
    members: [m('pillow-puff')],
    teaches: 'Introduces Drowsy — a status Trick that is inefficient rather than dead.',
  },
  {
    id: 'sq-2', region: 'sleeping-quarters', tier: 'early', name: 'Slipper Skitter',
    members: [m('slipper-skitter')],
    teaches: 'Introduces temporary target inefficiency. Do not lead with your biggest Attack.',
  },
  {
    id: 'sq-3', region: 'sleeping-quarters', tier: 'early', name: 'Blanket Creeper',
    members: [m('blanket-creeper')],
    teaches: 'Introduces Layers, and an enemy that gets angrier as you strip them.',
  },
  {
    id: 'sq-4', region: 'sleeping-quarters', tier: 'early', name: 'Wardrobe Guest',
    members: [m('wardrobe-guest')],
    teaches: 'Introduces Hidden. Not invulnerable — a different set of available interactions.',
  },

  // ── Standard ──────────────────────────────────────────────────────────────
  {
    id: 'sq-5', region: 'sleeping-quarters', tier: 'standard', name: 'Pillow Puff + Slipper Skitter',
    members: [m('pillow-puff'), m('slipper-skitter')],
    teaches: 'Deck interference while an evasive enemy harasses you.',
  },
  {
    id: 'sq-6', region: 'sleeping-quarters', tier: 'standard', name: 'Wardrobe Guest + Pillow Puff',
    members: [m('wardrobe-guest'), m('pillow-puff')],
    teaches: 'The Guest disappearing creates natural windows to deal with the Puff.',
  },
  {
    id: 'sq-7', region: 'sleeping-quarters', tier: 'standard', name: 'Blanket Creeper + Nightlight Snuffer',
    members: [m('blanket-creeper'), m('nightlight-snuffer')],
    teaches: 'Darkness makes the Creeper worse while its Layers make killing the Snuffer inconvenient.',
    minScuffle: 1,
  },
  {
    id: 'sq-8', region: 'sleeping-quarters', tier: 'standard', name: 'Thing Beneath',
    members: [m('thing-beneath')],
    teaches: 'The complete Scare cycle with no distractions. Watch a 26 assemble itself.',
    minScuffle: 1,
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    id: 'sq-9', region: 'sleeping-quarters', tier: 'advanced', name: 'Thing Beneath + Pillow Puff',
    members: [m('thing-beneath'), m('pillow-puff')],
    teaches: 'Drowsy interferes with exactly the turn you wanted to answer UNDER THE BED.',
    minScuffle: 1,
  },
  {
    id: 'sq-10', region: 'sleeping-quarters', tier: 'advanced', name: 'Wardrobe Guest + Nightlight Snuffer',
    members: [m('wardrobe-guest'), m('nightlight-snuffer')],
    teaches: 'Darkness improves the Guest\'s hiding cycle.',
    requiresSeen: ['wardrobe-guest'],
  },
  {
    id: 'sq-11', region: 'sleeping-quarters', tier: 'advanced', name: 'Blanket Creeper + Slipper Skitter',
    members: [m('blanket-creeper'), m('slipper-skitter')],
    teaches: 'One resists sustained pressure, the other resists careless opening attacks.',
  },
  {
    id: 'sq-12', region: 'sleeping-quarters', tier: 'advanced', name: 'Thing Beneath + Nightlight Snuffer',
    members: [m('thing-beneath'), m('nightlight-snuffer')],
    teaches: 'The Snuffer amplifies the major scare while Thing Beneath forces urgent target decisions.',
    minScuffle: 1,
  },
  {
    id: 'sq-13', region: 'sleeping-quarters', tier: 'advanced', name: 'Wardrobe Guest + Blanket Creeper',
    members: [m('wardrobe-guest'), m('blanket-creeper')],
    teaches: 'A slower tactical fight where targeting windows matter.',
  },
  {
    id: 'sq-14', region: 'sleeping-quarters', tier: 'advanced', name: 'Slipper Skitter + Nightlight Snuffer + Thing Beneath',
    // Snuffer placed LAST: Darkness expires at the start of its turn, so from any earlier
    // slot it would strip the +2 out of an ally's already-telegraphed attack.
    members: [m('slipper-skitter'), m('thing-beneath'), m('nightlight-snuffer')],
    teaches: 'One of the region\'s hardest. The Skitter distracts, the Snuffer amplifies, and Thing Beneath looms.',
    advancedOnly: true, minScuffle: 1,
  },

  // ── Big Scares ────────────────────────────────────────────────────────────
  {
    id: 'sq-scare-terror', region: 'sleeping-quarters', tier: 'elite', name: 'The Night Terror',
    members: [m('night-terror')],
    teaches: 'Intent uncertainty with full agency — your first Trick picks the branch.',
  },
  {
    id: 'sq-scare-hydra', region: 'sleeping-quarters', tier: 'elite', name: 'The Blanket Hydra',
    members: [
      m('blanket-hydra'), m('hydra-head-snoring'), m('hydra-head-biting'), m('hydra-head-crying'),
    ],
    teaches: 'Heads or body? Push the body below half Courage and the Heads stop coming back.',
  },
  {
    id: 'sq-scare-wardrobe', region: 'sleeping-quarters', tier: 'elite', name: 'The Wardrobe',
    members: [m('the-wardrobe'), m('wardrobe-door-left'), m('wardrobe-door-right')],
    teaches: 'Break a Door to reach the body. Break both and it takes 20% more for the rest of the fight.',
  },

  // ── Boss ──────────────────────────────────────────────────────────────────
  {
    id: 'sq-boss', region: 'sleeping-quarters', tier: 'boss', name: 'The Bedframe Beast',
    members: [m('bedframe-beast')],
    teaches: 'Standing, Covered, Underneath. Decide when to attack and when to prepare for BOO.',
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// The Kitchens and Cellars — docs/design/regions/04-kitchens-cellars.md §8–§11
// ─────────────────────────────────────────────────────────────────────────────
const KC = [
  // ── Early: one lesson each, in the order the design introduces them ───────
  {
    id: 'kc-1', region: 'kitchens-cellars', tier: 'early', name: 'Kitchen Imp',
    members: [m('kitchen-imp')],
    teaches: 'A visible, temporary modification to a familiar attack. You get a turn to plan against it.',
  },
  {
    id: 'kc-2', region: 'kitchens-cellars', tier: 'early', name: 'Jam Jar',
    members: [m('jam-jar')],
    teaches: 'Introduces Sticky — interference that costs tempo rather than hand size.',
  },
  {
    id: 'kc-3', region: 'kitchens-cellars', tier: 'early', name: 'Dough Blob',
    members: [m('dough-blob')],
    teaches: 'Introduces splitting. Killing it cleanly from above 16 is worth more than killing it efficiently.',
  },
  {
    id: 'kc-4', region: 'kitchens-cellars', tier: 'early', name: 'Rising Batter',
    members: [m('rising-batter')],
    teaches: 'Introduces escalation that changes behaviour, not just numbers.',
  },

  // ── Standard ──────────────────────────────────────────────────────────────
  {
    id: 'kc-5', region: 'kitchens-cellars', tier: 'standard', name: 'Kitchen Imp + Jam Jar',
    members: [m('kitchen-imp'), m('jam-jar')],
    teaches: 'Simple pressure plus tempo interference.',
  },
  {
    id: 'kc-6', region: 'kitchens-cellars', tier: 'standard', name: 'Dough Blob + Kitchen Imp',
    members: [m('dough-blob'), m('kitchen-imp')],
    teaches: 'The Imp pressures you while the Blob threatens to multiply.',
  },
  {
    id: 'kc-7', region: 'kitchens-cellars', tier: 'standard', name: 'Candy Clump + Jam Jar',
    members: [m('candy-clump'), m('jam-jar')],
    teaches: 'Killing the Jar first improves the Clump\'s next attack. Order is the whole question.',
  },
  {
    id: 'kc-8', region: 'kitchens-cellars', tier: 'standard', name: 'Rising Batter + Jam Jar',
    members: [m('rising-batter'), m('jam-jar')],
    teaches: 'Keep touching the Batter while Sticky eats the Nerve you wanted to touch it with.',
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    id: 'kc-9', region: 'kitchens-cellars', tier: 'advanced', name: 'Candy Clump + Kitchen Imp',
    members: [m('candy-clump'), m('kitchen-imp')],
    teaches: 'Killing the Imp may hand its utensil straight to the Clump.',
  },
  {
    id: 'kc-10', region: 'kitchens-cellars', tier: 'advanced', name: 'Dough Blob + Candy Clump',
    members: [m('dough-blob'), m('candy-clump')],
    teaches: 'If the Blob divides and the Doughlings die, the Clump eats dough repeatedly.',
  },
  {
    id: 'kc-11', region: 'kitchens-cellars', tier: 'advanced', name: 'Pantry Mimic + Jam Jar',
    members: [m('pantry-mimic'), m('jam-jar')],
    teaches: 'One useful Trick goes behind the Mimic while the Jar degrades your tempo.',
  },
  {
    id: 'kc-12', region: 'kitchens-cellars', tier: 'advanced',
    name: 'Rising Batter + Kitchen Imp + Jam Jar',
    members: [m('rising-batter'), m('kitchen-imp'), m('jam-jar')],
    teaches: 'High tempo. Pressure on the Batter, small repeated hits, and Sticky throughout.',
  },
  {
    id: 'kc-13', region: 'kitchens-cellars', tier: 'advanced', name: 'Pantry Mimic + Candy Clump',
    members: [m('pantry-mimic'), m('candy-clump')],
    teaches: 'Reveal and kill the Mimic first and the Clump takes 10 Guard off its corpse.',
  },
  {
    id: 'kc-14', region: 'kitchens-cellars', tier: 'advanced',
    name: 'Dough Blob + Candy Clump + Rising Batter',
    members: [m('dough-blob'), m('candy-clump'), m('rising-batter')],
    teaches: 'The Blob multiplies, the Clump grows on death, the Batter grows on neglect. Constant re-evaluation.',
    advancedOnly: true, minScuffle: 1,
  },

  // ── Big Scares ────────────────────────────────────────────────────────────
  {
    id: 'kc-scare-oven', region: 'kitchens-cellars', tier: 'elite', name: 'The Oven Maw',
    members: [m('oven-maw'), m('dough-blob'), m('jam-jar')],
    teaches: 'Kill the ingredients, hit the Oven, or let it take one away and deal with what comes back.',
  },
  {
    id: 'kc-scare-golem', region: 'kitchens-cellars', tier: 'elite', name: 'The Sugar Golem',
    members: [m('sugar-golem')],
    teaches: 'Three layers, read off its Courage. The last one is soft and hits hardest.',
  },
  {
    id: 'kc-scare-poltergeist', region: 'kitchens-cellars', tier: 'elite',
    name: 'The Pantry Poltergeist',
    members: [m('pantry-poltergeist')],
    teaches: 'Variable but never opaque — the objects are visible and each one is one line of rules.',
  },

  // ── Boss ──────────────────────────────────────────────────────────────────
  {
    id: 'kc-boss', region: 'kitchens-cellars', tier: 'boss', name: 'The Confectioner',
    members: [m('confectioner')],
    teaches: 'Read the Recipe Board. Hurt it hard enough in one turn and the last Ingredient is spilled.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Impossible Greenhouse — docs/design/regions/05-greenhouse.md §9-§15
// ─────────────────────────────────────────────────────────────────────────────
const GH = [
  // ── Early (§9): one lesson each, in the order the chapter introduces them ──
  { id: 'gh-1', region: 'greenhouse', tier: 'early', name: 'Potling',
    members: [m('potling')],
    teaches: 'Seedlings. The thing on the floor is harmless now and will not stay harmless.' },
  { id: 'gh-2', region: 'greenhouse', tier: 'early', name: 'Snapping Blossom',
    members: [m('snapping-blossom')],
    teaches: 'Bloom. The big number is three turns away and you can see all three.' },
  { id: 'gh-3', region: 'greenhouse', tier: 'early', name: 'Spore Puff',
    members: [m('spore-puff')],
    teaches: 'Delayed damage that outlives the thing that scheduled it.' },
  { id: 'gh-4', region: 'greenhouse', tier: 'early', name: 'Topiary Beast',
    members: [m('topiary-beast')],
    teaches: 'An enemy that reshapes itself around how you played last turn.' },

  // ── Standard (§10) ────────────────────────────────────────────────────────
  { id: 'gh-5', region: 'greenhouse', tier: 'standard', name: 'Potling + Creeping Ivy',
    members: [m('potling'), m('creeping-ivy')],
    teaches: 'The Ivy protects the Potling while its Seedlings come up.' },
  { id: 'gh-6', region: 'greenhouse', tier: 'standard', name: 'Snapping Blossom + Spore Puff',
    members: [m('snapping-blossom'), m('spore-puff')],
    teaches: 'Immediate Bloom pressure against damage already scheduled.' },
  { id: 'gh-7', region: 'greenhouse', tier: 'standard', name: 'Glassvine + Potling',
    members: [m('glassvine'), m('potling')],
    teaches: 'Repeated attacks into the Glassvine compete with pruning Seedlings.' },
  { id: 'gh-8', region: 'greenhouse', tier: 'standard', name: 'Topiary Beast + Creeping Ivy',
    members: [m('topiary-beast'), m('creeping-ivy')],
    teaches: 'Ivy changes what each Topiary form is worth.' },

  // ── Advanced (§11) ────────────────────────────────────────────────────────
  { id: 'gh-9', region: 'greenhouse', tier: 'advanced', name: 'Spore Puff + Potling',
    members: [m('spore-puff'), m('potling')],
    teaches: 'The floor fills up with future problems.' },
  { id: 'gh-10', region: 'greenhouse', tier: 'advanced', name: 'Snapping Blossom + Glassvine',
    members: [m('snapping-blossom'), m('glassvine')],
    teaches: 'The Blossom wants burst; the Glassvine punishes it.' },
  { id: 'gh-11', region: 'greenhouse', tier: 'advanced', name: 'Topiary Beast + Spore Puff',
    members: [m('topiary-beast'), m('spore-puff')],
    teaches: 'React to a changing form while planning around a landing Cloud.' },
  { id: 'gh-12', region: 'greenhouse', tier: 'advanced',
    name: 'Creeping Ivy + Glassvine + Potling',
    members: [m('creeping-ivy'), m('glassvine'), m('potling')],
    teaches: 'A target puzzle: Entwine, retaliation and Seeds all want different answers.' },
  { id: 'gh-13', region: 'greenhouse', tier: 'advanced', name: 'Topiary Beast + Snapping Blossom',
    members: [m('topiary-beast'), m('snapping-blossom')],
    teaches: 'Two enemies changing state on two different schedules.' },
  { id: 'gh-14', region: 'greenhouse', tier: 'advanced',
    name: 'Potling + Spore Puff + Snapping Blossom',
    members: [m('potling'), m('spore-puff'), m('snapping-blossom')],
    teaches: 'Seedlings threaten future enemies, Spores threaten future damage, Bloom threatens a major attack. You cannot solve all three.',
    advancedOnly: true, minScuffle: 1 },

  // ── Big Scares (§13-§15) ──────────────────────────────────────────────────
  { id: 'gh-scare-compost', region: 'greenhouse', tier: 'elite', name: 'The Compost Colossus',
    members: [m('compost-colossus')],
    teaches: 'Take the Nodes, race the body, or push it under half and then take the Nodes.' },
  { id: 'gh-scare-conservatory', region: 'greenhouse', tier: 'elite',
    name: 'The Carnivorous Conservatory',
    members: [m('carnivorous-conservatory')],
    teaches: 'A pressure gauge. Ignore the room and the room becomes the fight.' },
  { id: 'gh-scare-topiary', region: 'greenhouse', tier: 'elite', name: 'The Ancient Topiary',
    members: [m('ancient-topiary')],
    teaches: 'Four forms, and your first Trick each turn picks which one arrives.' },

  // ── Boss ──────────────────────────────────────────────────────────────────
  { id: 'gh-boss', region: 'greenhouse', tier: 'boss', name: 'The Head Gardener',
    members: [m('head-gardener')],
    teaches: 'Which plant hurts YOUR deck? And it will eat its own garden for damage if you leave one too long.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Heart of the House — docs/design/regions/17-heart.md §12-§15
//
// "There are no truly introductory Heart encounters. The player has reached the
// final region. The first encounters should still avoid overwhelming
// combinations." (§12.) So the early tier is not a tutorial: it is four
// formations that each ask ONE of the region's questions before they start
// asking two at once.
// ─────────────────────────────────────────────────────────────────────────────
const HEART = [
  // ── Early (§12) ───────────────────────────────────────────────────────────
  {
    id: 'ht-1', region: 'heart', tier: 'early', name: 'House Pulse + Memory Animal',
    members: [m('house-pulse'), m('memory-animal')],
    teaches: 'The house itself is in the fight, and it is watching what you open with.',
  },
  {
    id: 'ht-2', region: 'heart', tier: 'early', name: 'Sanctuary Warden + Namekeeper',
    members: [m('sanctuary-warden'), m('namekeeper')],
    teaches: 'Protection that helps its target, and a Trick of yours held hostage behind it.',
  },
  {
    id: 'ht-3', region: 'heart', tier: 'early', name: 'Quiet Room',
    members: [m('quiet-room')],
    teaches: 'You may play as many Tricks as you like. The room responds.',
  },
  {
    id: 'ht-4', region: 'heart', tier: 'early', name: 'Old Welcome + Housekeeper',
    members: [m('old-welcome'), m('housekeeper')],
    teaches: 'Two enemies being genuinely helpful, and what that costs.',
  },

  // ── Standard (§13) ────────────────────────────────────────────────────────
  {
    id: 'ht-5', region: 'heart', tier: 'standard', name: 'Perfect Keeper',
    members: [m('perfect-keeper')],
    teaches: 'Assessment, alone, so you can watch the intent change under your hands.',
  },
  {
    id: 'ht-6', region: 'heart', tier: 'standard', name: 'House Pulse + Sanctuary Warden',
    members: [m('house-pulse'), m('sanctuary-warden')],
    teaches: 'The Pulse amplifies whoever the Warden is keeping alive.',
  },
  {
    id: 'ht-7', region: 'heart', tier: 'standard', name: 'Namekeeper + Quiet Room',
    members: [m('namekeeper'), m('quiet-room')],
    teaches: 'Is playing the Named Trick worth another potentially noisy action?',
  },
  {
    id: 'ht-8', region: 'heart', tier: 'standard', name: 'Old Welcome + Memory Animal',
    members: [m('old-welcome'), m('memory-animal')],
    teaches: 'Extra draw and Nerve change what the Memory Animal sees you do first.',
  },
  {
    id: 'ht-9', region: 'heart', tier: 'standard', name: 'Housekeeper + Perfect Keeper',
    members: [m('housekeeper'), m('perfect-keeper')],
    teaches: 'One rearranges your deck while the other judges the turn that comes out of it.',
  },
  {
    id: 'ht-10', region: 'heart', tier: 'standard', name: 'Sanctuary Warden + Old Welcome',
    members: [m('sanctuary-warden'), m('old-welcome')],
    teaches: 'Tempting tempo in front of layered defence.',
  },

  // ── Advanced (§14) ────────────────────────────────────────────────────────
  {
    id: 'ht-11', region: 'heart', tier: 'advanced', name: 'Quiet Room + House Pulse',
    members: [m('quiet-room'), m('house-pulse')],
    teaches: 'You want a long turn to kill the Pulse. The long turn is what feeds the Room.',
  },
  {
    id: 'ht-12', region: 'heart', tier: 'advanced', name: 'Perfect Keeper + Memory Animal',
    members: [m('perfect-keeper'), m('memory-animal')],
    teaches: 'Two enemies interpreting the same turn in two different ways.',
  },
  {
    id: 'ht-13', region: 'heart', tier: 'advanced',
    name: 'Housekeeper + Namekeeper + Sanctuary Warden',
    members: [m('housekeeper'), m('namekeeper'), m('sanctuary-warden')],
    teaches: 'A highly controlled formation. Everything you hold is being managed.',
  },
  {
    id: 'ht-14', region: 'heart', tier: 'advanced',
    name: 'Old Welcome + Quiet Room + House Pulse',
    members: [m('old-welcome'), m('quiet-room'), m('house-pulse')],
    teaches: 'The Welcome hands you exactly the resources that make the Room angry.',
  },
  {
    id: 'ht-15', region: 'heart', tier: 'advanced',
    name: 'Perfect Keeper + House Pulse + Sanctuary Warden',
    members: [m('perfect-keeper'), m('house-pulse'), m('sanctuary-warden')],
    teaches: 'A final region pressure formation.',
  },
  {
    id: 'ht-16', region: 'heart', tier: 'advanced',
    name: 'Housekeeper + Memory Animal + Namekeeper + Perfect Keeper',
    members: [m('housekeeper'), m('memory-animal'), m('namekeeper'), m('perfect-keeper')],
    teaches: 'It remembers what you did, names what you might do, moves your Tricks between zones, and interprets all of it. One of the hardest ordinary Scuffles in the game.',
    advancedOnly: true, minScuffle: 1,
  },

  // ── Big Scares (§16-§29) ──────────────────────────────────────────────────
  {
    id: 'ht-scare-names', region: 'heart', tier: 'elite', name: 'The Hall of Names',
    members: [m('kid-stone'), m('companion-stone'), m('missing-pet-stone'), m('unknown-stone')],
    teaches: 'Four schedules on four clocks. Erasing one simplifies the timeline and strengthens what is left.',
  },
  {
    id: 'ht-scare-remembers', region: 'heart', tier: 'elite', name: 'House Remembers',
    members: [m('house-remembers')],
    teaches: 'One familiar mechanic at a time, in a visible order you are allowed to edit.',
  },
  {
    id: 'ht-scare-sanctuary', region: 'heart', tier: 'elite', name: 'Perfect Sanctuary',
    members: [m('perfect-sanctuary')],
    teaches: 'Two of its three Systems are helping you. Which ones are hurting THIS deck?',
  },
  {
    id: 'ht-scare-door', region: 'heart', tier: 'elite', name: 'The Door That Says Stay',
    members: [m('door-that-says-stay')],
    teaches: 'Accept and get stronger. Refuse and it gets easier to open. Both paths work.',
  },

  // ── Boss ──────────────────────────────────────────────────────────────────
  {
    id: 'ht-boss', region: 'heart', tier: 'boss', name: 'The Keeper',
    members: [m('keeper')],
    teaches: 'Break the Locks when you want the aggression. Reject the Arguments with whatever your deck is actually good at.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Per-region generation rules (design doc §10 "Encounter selection rules")
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_RULES = {
  /* docs/design/regions/05-greenhouse.md §12. */
  greenhouse: {
    bannedFirstScuffle: ['glassvine'],
    minScuffle: { glassvine: 1 },
    /** "Creeping Ivy cannot appear alone." It has no fight without a host. */
    neverAlone: ['creeping-ivy'],
    /** Two Ivies compound; two Potlings are a Haunt-level thing (§12). */
    noDuplicates: ['creeping-ivy', 'potling'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/17-heart.md §15. The Heart's list is longer than any
     other region's because it is the only one that fields four-body
     formations, and because three separate enemies here modify what a Trick
     costs — §15's last clause is a cap on how many of those may meet. */
  heart: {
    bannedFirstScuffle: ['perfect-keeper'],
    minScuffle: { 'perfect-keeper': 1 },
    /** Two Perfect Keepers compound; two Quiet Rooms double every Noise. */
    noDuplicates: ['perfect-keeper', 'quiet-room'],
    /** "House Pulse cannot appear alone" — it amplifies a formation it has not got. */
    neverAlone: ['house-pulse'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/04-kitchens-cellars.md §11. Every clause below is one
     sentence from that section, and `noDuplicates` carries two of them because
     the design bans a second Clump and a second Batter for different reasons —
     the Clump because two absorbers compound, the Batter because two escalators
     make the fight a stopwatch. */
  'kitchens-cellars': {
    bannedFirstScuffle: ['pantry-mimic', 'candy-clump'],
    minScuffle: { 'candy-clump': 1, 'pantry-mimic': 1 },
    noDuplicates: ['candy-clump', 'rising-batter'],
    maxConsecutiveLead: 2,
  },
  'sleeping-quarters': {
    bannedFirstScuffle: ['nightlight-snuffer', 'thing-beneath'],
    minScuffle: { 'thing-beneath': 1, 'nightlight-snuffer': 1 },
    /** Two of these may never share a formation at baseline difficulty. */
    noDuplicates: ['thing-beneath', 'nightlight-snuffer'],
    /** Pillow Puff thins out as the region's real threats come online. */
    fadesLate: ['pillow-puff'],
    maxConsecutiveLead: 2,
  },
  nursery: {
    bannedFirstScuffle: ['blanket-blob', 'rocking-horse'],
    minScuffle: { 'rocking-horse': 2, 'blanket-blob': 1 },
    /** Button Baby appears unescorted only in the earliest pool. */
    aloneOnlyEarly: ['button-baby'],
    /** No formation may field two of these. */
    noDuplicates: ['patchwork-soldier', 'blanket-blob'],
    maxConsecutiveLead: 2,
  },
  foyer: {
    /** Enemies banned from the player's very first Scuffle in the region. */
    bannedFirstScuffle: ['door-greeter', 'calling-bell', 'red-carpet-runner'],
    /** enemyId → earliest 0-based Scuffle index it may appear at. */
    minScuffle: { 'red-carpet-runner': 2 },
    /** These enemies may never be the only member of a formation. */
    neverAlone: ['calling-bell'],
    /** Discourage the same lead enemy appearing in three consecutive Scuffles. */
    maxConsecutiveLead: 2,
  },
};

const ALL_ENCOUNTERS = [...FOYER, ...NURSERY, ...SQ, ...KC, ...GH, ...HEART];

/** id → EncounterDef */
export const ENCOUNTERS = Object.freeze(
  ALL_ENCOUNTERS.reduce((acc, e) => { acc[e.id] = e; return acc; }, Object.create(null)),
);

export const ENCOUNTER_LIST = Object.freeze(ALL_ENCOUNTERS.slice());

export function encounterById(id) {
  const e = ENCOUNTERS[id];
  if (!e) throw new Error(`[encounters] unknown encounter id: ${id}`);
  return e;
}

/** Regions with authored formations. */
export const IMPLEMENTED_REGIONS = Object.freeze([...new Set(ALL_ENCOUNTERS.map(e => e.region))]);

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every authored formation for a region and tier.
 * @param {string} region
 * @param {'early'|'standard'|'advanced'|'elite'|'boss'} tier
 * @returns {EncounterDef[]}
 */
export function encountersFor(region, tier) {
  return ENCOUNTER_LIST.filter(e => e.region === region && (!tier || e.tier === tier));
}

/** The lead (first-listed) enemy of a formation — used for the anti-monotony rule. */
function leadOf(enc) { return enc.members[0]?.enemyId; }

/**
 * Choose a formation, honouring the region's selection rules.
 *
 * Randomness is never used to decide *whether* a rule applies — only to pick among the
 * candidates that already satisfy every rule. That keeps pacing authored and the roll
 * reproducible from the run seed.
 *
 * @param {string} region
 * @param {'early'|'standard'|'advanced'|'elite'|'boss'} tier
 * @param {import('../core/rng.js').RNG} rng
 * @param {string[]} history  encounter ids already fought in this region, oldest first
 * @returns {EncounterDef}
 */
export function rollEncounter(region, tier, rng, history = []) {
  const hist = Array.isArray(history) ? history : (history?.ids || []);
  const index = hist.length;                       // this is the (index+1)-th Scuffle
  const rules = REGION_RULES[region] || {};
  const pool = encountersFor(region, tier);
  if (!pool.length) throw new Error(`[encounters] no formations for ${region}/${tier}`);

  const prevId = hist[hist.length - 1];
  const recentLeads = hist.slice(-(rules.maxConsecutiveLead || 2))
    .map(id => ENCOUNTERS[id] && leadOf(ENCOUNTERS[id]))
    .filter(Boolean);

  // Filters, hardest first. Each returns the surviving list, or the previous list if
  // applying it would leave nothing — a soft rule must never deadlock the generator.
  const soften = (list, next) => { const r = list.filter(next); return r.length ? r : list; };

  let cand = pool;

  // Hard rule: an enemy may not appear before its earliest allowed Scuffle.
  cand = soften(cand, (e) => {
    if (e.minScuffle != null && index < e.minScuffle) return false;
    for (const mem of e.members) {
      const min = rules.minScuffle?.[mem.enemyId];
      if (min != null && index < min) return false;
    }
    return true;
  });

  // Hard rule: the region's first Scuffle excludes its more demanding enemies.
  if (index === 0 && rules.bannedFirstScuffle?.length) {
    cand = soften(cand, (e) => !e.members.some(mem => rules.bannedFirstScuffle.includes(mem.enemyId)));
  }

  // Hard rule: support enemies never open the region unescorted.
  if (rules.neverAlone?.length) {
    cand = soften(cand, (e) => !(e.members.length === 1 && rules.neverAlone.includes(leadOf(e))));
  }

  // Hard rule: some enemies may appear alone only in the earliest pool.
  if (rules.aloneOnlyEarly?.length && tier !== 'early') {
    cand = soften(cand, (e) => !(e.members.length === 1 && rules.aloneOnlyEarly.includes(leadOf(e))));
  }

  // Hard rule: a formation may require that the player has already met certain enemies.
  cand = soften(cand, (e) => {
    if (!e.requiresSeen?.length) return true;
    const seen = new Set();
    for (const id of hist) for (const mm of (ENCOUNTERS[id]?.members || [])) seen.add(mm.enemyId);
    return e.requiresSeen.some(x => seen.has(x));
  });

  // No immediate repeats.
  cand = soften(cand, (e) => e.id !== prevId);

  // Soft rule: some enemies should thin out once the region's real threats are online.
  if (rules.fadesLate?.length && tier === 'advanced') {
    cand = soften(cand, (e) => !e.members.some(mm => rules.fadesLate.includes(mm.enemyId)));
  }

  // Strongly discourage a third consecutive Scuffle led by the same enemy.
  if (recentLeads.length >= (rules.maxConsecutiveLead || 2)
      && recentLeads.every(l => l === recentLeads[0])) {
    cand = soften(cand, (e) => leadOf(e) !== recentLeads[0]);
  }

  // Weighted, not uniform. A formation's `weight` is how often the region wants
  // to ask that particular question; two-body formations carry 2 because a lone
  // enemy is structurally unable to out-damage one turn of Guard, so a pool of
  // solos produces free fights however much Courage the solos have. See the
  // `defaultWeight` note.
  return rng.weighted(cand.map(e => ({ e, w: e.weight != null ? e.weight : defaultWeight(e) }))).e;
}

/**
 * BALANCE 2026-08-20 — why two-body formations weigh double.
 *
 * Measured over whole-region expeditions: 22-29% of the first three Scuffles of
 * a region cost the player **zero** Courage. Not because the early enemies are
 * weak — a Dust Bunny's Tumble projects up to 19 — but because one enemy's
 * whole turn fits inside one turn of Guard, so the player simply never pays.
 * A fight that costs nothing is not a fight, and it is the pacing, not the
 * damage numbers, that is wrong: raising a lone enemy's damage to beat a turn
 * of Guard would make it lethal the moment the player draws no Guard card.
 *
 * So the fix is composition. The Foyer's early pool is now three solos and
 * one pair, and the pair is picked three times as often; the solos remain
 * because each one is the first time the player meets that enemy and that
 * introduction is worth keeping.
 */
function defaultWeight(enc) {
  return (enc.members && enc.members.length > 1) ? 3 : 1;
}

/**
 * Instantiate a formation into concrete spawn orders.
 *
 * @param {string} id            encounter id
 * @param {import('../core/rng.js').RNG} rng
 * @param {number} hauntLevel
 * @returns {{enemyId:string, hp:number, maxHp:number, slot:number, counters:Object,
 *            flags:Object, moveOverrides:Object, tier:string}[]}
 */
export function buildEncounter(id, rng, hauntLevel = 0) {
  const enc = encounterById(id);
  const advanced = enc.tier === 'advanced';
  const out = [];

  enc.members.forEach((mem, slot) => {
    if (!hasEnemy(mem.enemyId)) throw new Error(`[encounters] ${id} references unknown enemy '${mem.enemyId}'`);
    const def = getEnemy(mem.enemyId);
    const haunt = def.hauntScaling ? def.hauntScaling(hauntLevel) : null;

    let hp = mem.hp != null ? mem.hp : rollHp(def, rng);
    if (mem.hp == null) {
      if (haunt?.hpMul) hp = Math.round(hp * haunt.hpMul);
      if (mem.hpMul) hp = Math.round(hp * mem.hpMul);
    }
    hp = Math.max(1, hp);

    const counters = Object.assign({}, def.counters, haunt?.counters,
      advanced ? haunt?.advanced?.counters : null);
    const flags = Object.assign({}, haunt?.flags,
      advanced ? haunt?.advanced?.flags : null);

    out.push({
      enemyId: def.id,
      name: def.name,
      tier: def.tier,
      hp,
      maxHp: hp,
      slot,
      counters,
      flags,
      moveOverrides: Object.assign({}, haunt?.moves),
    });
  });

  return out;
}

/**
 * Convenience for the map generator: the full authored Scuffle pool for a region,
 * in the order the doc lists it (Scuffle 1 … Scuffle 14).
 */
export function scufflePool(region) {
  return ENCOUNTER_LIST.filter(e => e.region === region
    && (e.tier === 'early' || e.tier === 'standard' || e.tier === 'advanced'));
}
