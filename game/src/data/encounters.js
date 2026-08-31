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
// The Mansion Graveyard — docs/design/regions/06-graveyard.md §9-§15
// ─────────────────────────────────────────────────────────────────────────────
const GY = [
  // ── Early (§9) ────────────────────────────────────────────────────────────
  { id: 'gy-1', region: 'graveyard', tier: 'early', name: 'Grave Moth',
    members: [m('grave-moth')],
    teaches: 'Countdown. What is coming, and in how many turns.' },
  { id: 'gy-2', region: 'graveyard', tier: 'early', name: 'Headstone Hopper',
    members: [m('headstone-hopper')],
    teaches: 'Delayed retaliation. Attack freely now; the bill arrives on a schedule.' },
  { id: 'gy-3', region: 'graveyard', tier: 'early', name: 'Epitaph Spirit',
    members: [m('epitaph-spirit')],
    teaches: 'An enemy that shows you its next two actions.' },
  { id: 'gy-4', region: 'graveyard', tier: 'early', name: 'Forget Me Not',
    members: [m('forget-me-not')],
    teaches: 'Killing something is not always the end of it.' },

  // ── Standard (§10) ────────────────────────────────────────────────────────
  { id: 'gy-5', region: 'graveyard', tier: 'standard', name: 'Grave Moth + Headstone Hopper',
    members: [m('grave-moth'), m('headstone-hopper')],
    teaches: 'A Mark and a Retaliation that can come due on the same turn.' },
  { id: 'gy-6', region: 'graveyard', tier: 'standard', name: 'Mourning Candle + Forget Me Not',
    members: [m('mourning-candle'), m('forget-me-not')],
    teaches: 'Killing the flower feeds the Candle, and the flower comes back anyway.' },
  { id: 'gy-7', region: 'graveyard', tier: 'standard', name: 'Name Gnawer + Epitaph Spirit',
    members: [m('name-gnawer'), m('epitaph-spirit')],
    teaches: 'You know every future attack. You also know which of your Tricks got more expensive.' },
  { id: 'gy-8', region: 'graveyard', tier: 'standard', name: 'Headstone Hopper + Mourning Candle',
    members: [m('headstone-hopper'), m('mourning-candle')],
    teaches: 'Killing the Hopper charges the Candle on the spot.' },

  // ── Advanced (§11) ────────────────────────────────────────────────────────
  { id: 'gy-9', region: 'graveyard', tier: 'advanced', name: 'Grave Moth + Name Gnawer',
    members: [m('grave-moth'), m('name-gnawer')],
    teaches: 'Future damage and future Nerve pressure, overlapping.' },
  { id: 'gy-10', region: 'graveyard', tier: 'advanced', name: 'Forget Me Not + Headstone Hopper',
    members: [m('forget-me-not'), m('headstone-hopper')],
    teaches: 'You can time the flower\'s disappearance around Epitaph Comes Due.' },
  { id: 'gy-11', region: 'graveyard', tier: 'advanced', name: 'Epitaph Spirit + Mourning Candle',
    members: [m('epitaph-spirit'), m('mourning-candle')],
    teaches: 'Perfect information about one enemy, and kill order deciding the other.' },
  { id: 'gy-12', region: 'graveyard', tier: 'advanced',
    name: 'Grave Moth + Forget Me Not + Mourning Candle',
    members: [m('grave-moth'), m('forget-me-not'), m('mourning-candle')],
    teaches: 'Defeating either of them rewrites the timeline.' },
  { id: 'gy-13', region: 'graveyard', tier: 'advanced', name: 'Headstone Hopper + Epitaph Spirit',
    members: [m('headstone-hopper'), m('epitaph-spirit')],
    teaches: 'Two entirely predictable threats, and a deceptively hard defence puzzle.' },
  { id: 'gy-14', region: 'graveyard', tier: 'advanced',
    name: 'Grave Moth + Headstone Hopper + Name Gnawer',
    members: [m('grave-moth'), m('headstone-hopper'), m('name-gnawer')],
    teaches: 'A Mark, stored Retaliation, Forgotten Tricks and two live intents at once. Mental scheduling, not aggression.',
    advancedOnly: true, minScuffle: 1 },

  // ── Big Scares (§13-§15) ──────────────────────────────────────────────────
  { id: 'gy-scare-angel', region: 'graveyard', tier: 'elite', name: 'The Mourning Angel',
    members: [m('mourning-angel')],
    teaches: 'Prepare, endure, punish. Every point you take off it while Still is in the swing that follows.' },
  { id: 'gy-scare-choir', region: 'graveyard', tier: 'elite', name: 'The Epitaph Choir',
    members: [m('stone-of-rain'), m('stone-of-silence'), m('stone-of-weight'), m('stone-of-sorrow')],
    teaches: 'Four timelines, all visible. Which one do you erase first?' },
  { id: 'gy-scare-mouth', region: 'graveyard', tier: 'elite', name: 'The Mausoleum Mouth',
    members: [m('mausoleum-mouth')],
    teaches: 'One long clock, and offence is what pushes it backwards.' },

  // ── Boss ──────────────────────────────────────────────────────────────────
  { id: 'gy-boss', region: 'graveyard', tier: 'boss', name: 'The Groundskeeper of Names',
    members: [m('groundskeeper')],
    teaches: 'Read the Ledger. Smudging everything is not the answer, because a full Ledger accelerates itself.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Withered Hedge Maze - docs/design/regions/12-hedge-maze.md §9-§12
//
// The ladder is two opposite retaliators. The Mildew Puff banks what you do to
// it and the Briar Lump runs out of thorns; the Thorn Topiary gets its own solo
// Scuffle before anything else meets it, because it is the one that punishes
// exactly the answer the first two taught.
// ─────────────────────────────────────────────────────────────────────────────
const HM = [
  // ── Early (§9) ----------------------------------------------------------
  { id: 'hm-1', region: 'hedge-maze', tier: 'early', name: 'Mildew Puff',
    members: [m('mildew-puff')],
    teaches: 'It banks every Attack you land and spends the lot at once.' },
  { id: 'hm-2', region: 'hedge-maze', tier: 'early', name: 'Rotcap',
    members: [m('rotcap')],
    teaches: 'Under 8 damage in a turn and it takes it all back.' },
  { id: 'hm-3', region: 'hedge-maze', tier: 'early', name: 'Briar Lump',
    members: [m('briar-lump')],
    teaches: 'Finite retaliation. Strip the thorns and there is a window behind them.' },
  { id: 'hm-4', region: 'hedge-maze', tier: 'early', name: 'Wilted Scarecrow',
    members: [m('wilted-scarecrow')],
    teaches: 'It gets more dangerous the closer it is to falling over.' },

  // ── Standard (§10) ------------------------------------------------------
  { id: 'hm-5', region: 'hedge-maze', tier: 'standard', name: 'Rotcap + Mildew Puff',
    members: [m('rotcap'), m('mildew-puff')],
    teaches: 'One wants steady pressure and the other punishes exactly that.' },
  { id: 'hm-6', region: 'hedge-maze', tier: 'standard', name: 'Briar Lump + Compost Crawler',
    members: [m('briar-lump'), m('compost-crawler')],
    teaches: 'Wounding the Lump gives the Crawler something to eat.' },
  { id: 'hm-7', region: 'hedge-maze', tier: 'standard', name: 'Wilted Scarecrow + Rotcap',
    members: [m('wilted-scarecrow'), m('rotcap')],
    teaches: 'Both of them behave differently depending on how hard you swing.' },
  { id: 'hm-8', region: 'hedge-maze', tier: 'standard', name: 'Thorn Topiary',
    members: [m('thorn-topiary')],
    teaches: 'Retaliation that GROWS BACK. Small attacks get worse; big ones prune it.' },

  // ── Advanced (§11) ------------------------------------------------------
  { id: 'hm-9', region: 'hedge-maze', tier: 'advanced', name: 'Thorn Topiary + Rotcap',
    members: [m('thorn-topiary'), m('rotcap')],
    teaches: 'One wants one big swing. The other wants a big swing every single turn.' },
  { id: 'hm-10', region: 'hedge-maze', tier: 'advanced', name: 'Compost Crawler + Wilted Scarecrow',
    members: [m('compost-crawler'), m('wilted-scarecrow')],
    teaches: 'The Scarecrow hurts itself, and the Crawler is waiting for exactly that.' },
  { id: 'hm-11', region: 'hedge-maze', tier: 'advanced', name: 'Briar Lump + Mildew Puff',
    members: [m('briar-lump'), m('mildew-puff')],
    teaches: 'Two different bills for the same swing.' },
  { id: 'hm-12', region: 'hedge-maze', tier: 'advanced',
    name: 'Thorn Topiary + Compost Crawler + Mildew Puff',
    members: [m('thorn-topiary'), m('compost-crawler'), m('mildew-puff')],
    teaches: 'Everything on this board charges you for attacking it, in three different currencies.' },
  { id: 'hm-13', region: 'hedge-maze', tier: 'advanced', name: 'Rotcap + Briar Lump',
    members: [m('rotcap'), m('briar-lump')],
    teaches: 'Commit to one and the other takes everything back.' },
  { id: 'hm-14', region: 'hedge-maze', tier: 'advanced',
    name: 'Thorn Topiary + Wilted Scarecrow + Rotcap',
    members: [m('thorn-topiary'), m('wilted-scarecrow'), m('rotcap')],
    teaches: 'Prune, suppress, and finish — and you cannot do all three in one turn.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§13-§15) ----------------------------------------------
  { id: 'hm-scare-minotaur', region: 'hedge-maze', tier: 'elite', name: 'The Mold Minotaur',
    members: [m('mold-minotaur')],
    teaches: 'Interrupt the Charge or suppress the regrowth. Probably not both.' },
  { id: 'hm-scare-idol', region: 'hedge-maze', tier: 'elite', name: 'The Briar Idol',
    members: [m('briar-idol'), m('briar-ring-1'), m('briar-ring-2'), m('briar-ring-3')],
    teaches: 'Three rings of retaliation, and breaking one makes it angrier for good.' },
  { id: 'hm-scare-carrion', region: 'hedge-maze', tier: 'elite', name: 'The Carrion Hedge',
    members: [m('carrion-hedge'), m('hedge-crown'), m('hedge-middle'), m('hedge-roots')],
    teaches: 'Three sections that grow back — until the body is under half.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'hm-boss', region: 'hedge-maze', tier: 'boss', name: 'The Gardener of Rot',
    members: [m('gardener-of-rot')],
    teaches: 'You drive its Decay Cycle as well as its Courage, and they pull against each other.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Secret Passages - docs/design/regions/13-secret-passages.md §10-§13
//
// §10-§12's fourteen Scuffles verbatim, and the shape of the ladder is the
// region's lesson: every EARLY Scuffle is one enemy alone, because Hidden,
// Passage, stolen Nerve and moved Tricks are four different kinds of "it is
// still there" and meeting two at once teaches neither.
// ─────────────────────────────────────────────────────────────────────────────
const SP = [
  // ── Early (§10) ---------------------------------------------------------
  { id: 'sp-1', region: 'secret-passages', tier: 'early', name: 'False Door',
    members: [m('false-door')],
    teaches: 'Play three Tricks in a turn and it opens. Until then your first Attack is halved.' },
  { id: 'sp-2', region: 'secret-passages', tier: 'early', name: 'Wall Whisper',
    members: [m('wall-whisper')],
    teaches: 'Hidden: Attack Tricks cannot reach it. Everything else still can.' },
  { id: 'sp-3', region: 'secret-passages', tier: 'early', name: 'Shadow Draft',
    members: [m('shadow-draft')],
    teaches: 'It moves your Tricks between piles and destroys nothing.' },
  { id: 'sp-4', region: 'secret-passages', tier: 'early', name: 'Key Snatcher',
    members: [m('key-snatcher')],
    teaches: 'It takes Nerve and carries it where you can see it. Hit it hard enough and it drops one.' },

  // ── Standard (§11) ------------------------------------------------------
  { id: 'sp-5', region: 'secret-passages', tier: 'standard', name: 'Peephole + False Door',
    members: [m('peephole'), m('false-door')],
    teaches: 'Three Tricks opens the Door. Three of the SAME Trick gets you Seen.' },
  { id: 'sp-6', region: 'secret-passages', tier: 'standard', name: 'Wall Whisper + Shadow Draft',
    members: [m('wall-whisper'), m('shadow-draft')],
    teaches: 'One disappears while the other rearranges your deck.' },
  { id: 'sp-7', region: 'secret-passages', tier: 'standard', name: 'Key Snatcher + Peephole',
    members: [m('key-snatcher'), m('peephole')],
    teaches: 'Less Nerve makes varying your turn harder, and varying it is how you stay unseen.' },
  { id: 'sp-8', region: 'secret-passages', tier: 'standard', name: 'Crawlspace Thing',
    members: [m('crawlspace-thing')],
    teaches: 'It leaves the board entirely. The grate it went through does not.' },

  // ── Advanced (§12) ------------------------------------------------------
  { id: 'sp-9', region: 'secret-passages', tier: 'advanced', name: 'Crawlspace Thing + Peephole',
    members: [m('crawlspace-thing'), m('peephole')],
    teaches: 'Four Tricks weakens the ambush. Four of a kind gets you Seen.' },
  { id: 'sp-10', region: 'secret-passages', tier: 'advanced', name: 'False Door + Key Snatcher',
    members: [m('false-door'), m('key-snatcher')],
    teaches: 'The Door rewards reaching your third Trick. The Snatcher makes that harder.' },
  { id: 'sp-11', region: 'secret-passages', tier: 'advanced', name: 'Wall Whisper + Peephole',
    members: [m('wall-whisper'), m('peephole')],
    teaches: 'Being Seen makes the thing you cannot reach hit harder.' },
  { id: 'sp-12', region: 'secret-passages', tier: 'advanced',
    name: 'Shadow Draft + Key Snatcher + False Door',
    members: [m('shadow-draft'), m('key-snatcher'), m('false-door')],
    teaches: 'Deck order, less Nerve, and a window that only opens on your third Trick.' },
  { id: 'sp-13', region: 'secret-passages', tier: 'advanced', name: 'Crawlspace Thing + Shadow Draft',
    members: [m('crawlspace-thing'), m('shadow-draft')],
    teaches: 'The Draft can wreck the four-Trick turn you needed before the ambush lands.' },
  { id: 'sp-14', region: 'secret-passages', tier: 'advanced',
    name: 'Peephole + Key Snatcher + Crawlspace Thing',
    members: [m('peephole'), m('key-snatcher'), m('crawlspace-thing')],
    teaches: 'Stay unseen, get your Nerve back, blunt the ambush, and still kill three things.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§14-§16) ----------------------------------------------
  { id: 'sp-scare-wall', region: 'secret-passages', tier: 'elite', name: 'The Moving Wall',
    members: [m('moving-wall')],
    teaches: 'You steer where it is vulnerable with your own Attack-to-Skill mix.' },
  { id: 'sp-scare-choir', region: 'secret-passages', tier: 'elite', name: 'The Whisper Choir',
    members: [m('threatening-whisper'), m('nervous-whisper'), m('hungry-whisper'), m('lost-whisper')],
    teaches: 'Four voices, four ways to be exposed. Pick the one your deck already does.' },
  { id: 'sp-scare-door', region: 'secret-passages', tier: 'elite', name: "The Door That Wasn't There",
    members: [m('the-door')],
    teaches: 'It offers you a way out, and the offer is neither a trap nor a gift.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'sp-boss', region: 'secret-passages', tier: 'boss', name: 'The Whisper Warden',
    members: [m('whisper-warden')],
    teaches: 'You cannot stop the Ambush. You choose which one it is.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Bathhouse and Rain Wing - docs/design/regions/14-bathhouse.md §10-§13
//
// §10-§12's fourteen Scuffles. The four EARLY ones are solo on purpose: Wet,
// Weather-dependent states, Pressure and Weather-based vulnerability are four
// different answers to the same question, and meeting two at once teaches
// neither.
// ─────────────────────────────────────────────────────────────────────────────
const BH = [
  // ── Early (§10) ---------------------------------------------------------
  { id: 'bh-1', region: 'bathhouse', tier: 'early', name: 'Soap Sprite',
    members: [m('soap-sprite')],
    teaches: 'Wet is 2 more Guard for you and a defence for it. It is not a debuff.' },
  { id: 'bh-2', region: 'bathhouse', tier: 'early', name: 'Puddle Spirit',
    members: [m('puddle-spirit')],
    teaches: 'The Weather changes what it physically is. Rain grows it; Clear shrinks it.' },
  { id: 'bh-3', region: 'bathhouse', tier: 'early', name: 'Pipe Knocker',
    members: [m('pipe-knocker')],
    teaches: 'Stored Pressure, and venting it changes the whole room to Steam.' },
  { id: 'bh-4', region: 'bathhouse', tier: 'early', name: 'Steam Ghost',
    members: [m('steam-ghost')],
    teaches: 'Steam hides it and Rain solidifies it. Changing the Weather is the attack.' },

  // ── Standard (§11) ------------------------------------------------------
  { id: 'bh-5', region: 'bathhouse', tier: 'standard', name: 'Soap Sprite + Puddle Spirit',
    members: [m('soap-sprite'), m('puddle-spirit')],
    teaches: 'Wet and Rain help both of them, differently.' },
  { id: 'bh-6', region: 'bathhouse', tier: 'standard', name: 'Pipe Knocker + Steam Ghost',
    members: [m('pipe-knocker'), m('steam-ghost')],
    teaches: 'Release Valve makes exactly the Weather the Ghost wants.' },
  { id: 'bh-7', region: 'bathhouse', tier: 'standard', name: 'Umbrella Imp + Puddle Spirit',
    members: [m('umbrella-imp'), m('puddle-spirit')],
    teaches: 'The Imp keeps the Spirit dry while the rain grows it anyway.' },
  { id: 'bh-8', region: 'bathhouse', tier: 'standard', name: 'Overflow + Soap Sprite',
    members: [m('overflow'), m('soap-sprite')],
    teaches: 'The flood keeps everyone Wet, and one of them is built for that.' },

  // ── Advanced (§12) ------------------------------------------------------
  { id: 'bh-9', region: 'bathhouse', tier: 'advanced', name: 'Steam Ghost + Umbrella Imp',
    members: [m('steam-ghost'), m('umbrella-imp')],
    teaches: 'You want Rain to expose the Ghost. The Imp wants Rain too.' },
  { id: 'bh-10', region: 'bathhouse', tier: 'advanced', name: 'Pipe Knocker + Overflow',
    members: [m('pipe-knocker'), m('overflow')],
    teaches: 'Pressure pulls toward Steam while the Flood pushes toward Downpour.' },
  { id: 'bh-11', region: 'bathhouse', tier: 'advanced', name: 'Puddle Spirit + Steam Ghost',
    members: [m('puddle-spirit'), m('steam-ghost')],
    teaches: 'They want opposite Weather. Helping one is hurting the other.' },
  { id: 'bh-12', region: 'bathhouse', tier: 'advanced',
    name: 'Umbrella Imp + Overflow + Soap Sprite',
    members: [m('umbrella-imp'), m('overflow'), m('soap-sprite')],
    teaches: 'Rain builds them a defensive network. Fold the umbrella first.' },
  { id: 'bh-13', region: 'bathhouse', tier: 'advanced',
    name: 'Pipe Knocker + Steam Ghost + Umbrella Imp',
    members: [m('pipe-knocker'), m('steam-ghost'), m('umbrella-imp')],
    teaches: 'Steam protects the Ghost while the Imp waits for the next Rain.' },
  { id: 'bh-14', region: 'bathhouse', tier: 'advanced',
    name: 'Overflow + Puddle Spirit + Pipe Knocker',
    members: [m('overflow'), m('puddle-spirit'), m('pipe-knocker')],
    teaches: 'Flood, Pressure, Size, Wet and two Weather transitions, all at once.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§14-§16) ----------------------------------------------
  { id: 'bh-scare-boiler', region: 'bathhouse', tier: 'elite', name: 'The Boiler Bellower',
    members: [m('boiler-bellower')],
    teaches: 'A gauge where the middle is safe and both ends are dangerous, oppositely.' },
  { id: 'bh-scare-mirror', region: 'bathhouse', tier: 'elite', name: 'The Flooded Reflection',
    members: [m('flooded-reflection')],
    teaches: 'It copies whatever you did most. Steam decides whether you get to know.' },
  { id: 'bh-scare-storm', region: 'bathhouse', tier: 'elite', name: 'The Storm Bath',
    members: [m('storm-bath')],
    teaches: 'The whole Weather cycle on a clock, and your fourth Trick can push or hold it.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'bh-boss', region: 'bathhouse', tier: 'boss', name: 'The Drowned Matron',
    members: [m('drowned-matron')],
    teaches: 'There is no correct Water Level, and a quiet turn is one she counts.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Kennels and Animal Ward - docs/design/regions/15-kennels.md §10-§13
//
// §10-§12's fourteen Scuffles, and §13's "a Ward Animal appears in
// approximately one third of normal Kennels Scuffles" is the ladder itself:
// five of the fourteen carry one, and the FIRST Walking Cage encounter always
// does, because §10 says the first thing this region teaches is that the cage
// is the target and the animal is not.
// ─────────────────────────────────────────────────────────────────────────────
const KN = [
  // ── Early (§10) ---------------------------------------------------------
  { id: 'kn-1', region: 'kennels', tier: 'early', name: 'Walking Cage',
    members: [m('walking-cage'), m('ward-pup')],
    teaches: 'The cage is the enemy. The animal inside it is not, and cannot be hurt.' },
  { id: 'kn-2', region: 'kennels', tier: 'early', name: 'Collar Keeper',
    members: [m('collar-keeper')],
    teaches: 'A restraint on YOU: a price for your fourth Trick, not a ban on it.' },
  { id: 'kn-3', region: 'kennels', tier: 'early', name: 'Feeding Cart + Walking Cage',
    members: [m('feeding-cart'), m('walking-cage')],
    teaches: 'The Cart helps whoever needs it — sometimes the cage, sometimes the animal.' },
  { id: 'kn-4', region: 'kennels', tier: 'early', name: 'Leash Hand',
    members: [m('leash-hand')],
    teaches: 'Tether is a threshold. Cross it in one swing and the lead never gets used.' },

  // ── Standard (§11) ------------------------------------------------------
  { id: 'kn-5', region: 'kennels', tier: 'standard', name: 'Walking Cage + Comfort Blanket',
    members: [m('walking-cage'), m('comfort-blanket'), m('ward-cat')],
    teaches: 'The Blanket protects the cage and calms the animal at the same time.' },
  { id: 'kn-6', region: 'kennels', tier: 'standard', name: 'Collar Keeper + Feeding Cart',
    members: [m('collar-keeper'), m('feeding-cart')],
    teaches: 'Your tempo is taxed while theirs is topped up.' },
  { id: 'kn-7', region: 'kennels', tier: 'standard', name: 'Leash Hand + Ward Orderly',
    members: [m('leash-hand'), m('ward-orderly')],
    teaches: 'One stops it dying and the other pulls it out of reach first.' },
  { id: 'kn-8', region: 'kennels', tier: 'standard', name: 'Walking Cage + Ward Orderly',
    members: [m('walking-cage'), m('ward-orderly'), m('ward-bird')],
    teaches: 'The Orderly calms the animal AND makes the containment harder to dismantle.' },

  // ── Advanced (§12) ------------------------------------------------------
  { id: 'kn-9', region: 'kennels', tier: 'advanced', name: 'Comfort Blanket + Feeding Cart',
    members: [m('comfort-blanket'), m('feeding-cart')],
    teaches: 'The two gentlest things in the house are a surprisingly hard wall.' },
  { id: 'kn-10', region: 'kennels', tier: 'advanced', name: 'Collar Keeper + Leash Hand',
    members: [m('collar-keeper'), m('leash-hand'), m('ward-pup')],
    teaches: 'Two restraints on one animal, and you can free it without killing either.' },
  { id: 'kn-11', region: 'kennels', tier: 'advanced', name: 'Ward Orderly + Comfort Blanket',
    members: [m('ward-orderly'), m('comfort-blanket')],
    teaches: 'One redirects the damage and the other refuses to let anything fall.' },
  { id: 'kn-12', region: 'kennels', tier: 'advanced',
    name: 'Walking Cage + Collar Keeper + Feeding Cart',
    members: [m('walking-cage'), m('collar-keeper'), m('feeding-cart'), m('ward-cat')],
    teaches: 'The Cart keeps calming the animal while everything else keeps it locked in.' },
  { id: 'kn-13', region: 'kennels', tier: 'advanced',
    name: 'Leash Hand + Ward Orderly + Comfort Blanket',
    members: [m('leash-hand'), m('ward-orderly'), m('comfort-blanket')],
    teaches: 'Three layers of protection and not one of them is aimed at you.' },
  { id: 'kn-14', region: 'kennels', tier: 'advanced',
    name: 'Walking Cage + Collar Keeper + Ward Orderly',
    members: [m('walking-cage'), m('collar-keeper'), m('ward-orderly'), m('ward-bird')],
    teaches: 'Nothing here is trying to hurt the animal. The system just keeps repairing itself.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§14-§16) ----------------------------------------------
  { id: 'kn-scare-collector', region: 'kennels', tier: 'elite', name: 'The Collar Collector',
    members: [m('collar-collector')],
    teaches: 'Every rule you take off it makes it hit harder. Some rules are worth keeping.' },
  { id: 'kn-scare-rolling', region: 'kennels', tier: 'elite', name: 'The Rolling Ward',
    members: [m('rolling-ward')],
    teaches: 'Freeing them and beating it are the same three latches.' },
  { id: 'kn-scare-perfect', region: 'kennels', tier: 'elite', name: 'The Perfect Pen',
    members: [m('perfect-pen'), m('ward-pup')],
    teaches: 'Its defence is a score for how safe it is, and it goes up when you leave it alone.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'kn-boss', region: 'kennels', tier: 'boss', name: 'The Kennelmaster',
    members: [m('kennelmaster')],
    teaches: 'Nothing here will hurt them. It simply will not let them go.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Crypt and Ossuary - docs/design/regions/11-crypt.md §9-§12
//
// The ladder is what gets left behind. The Tibia leaves one Remains and has no
// use for it; the Fetcher arrives later and turns the whole floor into a
// resource. §12 keeps them in that order because the second enemy is only
// frightening once the first has taught you what it is eating.
// ─────────────────────────────────────────────────────────────────────────────
const CR = [
  // ── Early (§9) ----------------------------------------------------------
  { id: 'cr-1', region: 'crypt', tier: 'early', name: 'Loose Tibia',
    members: [m('loose-tibia')],
    teaches: 'Remains. Killing it leaves something on the floor, and nothing wants it yet.' },
  { id: 'cr-2', region: 'crypt', tier: 'early', name: 'Skull Roller',
    members: [m('skull-roller')],
    teaches: 'It does not resurrect. It leaves, and comes back, and you cannot hit it in between.' },
  { id: 'cr-3', region: 'crypt', tier: 'early', name: 'Bone Heap',
    members: [m('bone-heap')],
    teaches: 'Kill it and it collapses into a Pile. Break the Pile and it stays dead.' },
  { id: 'cr-4', region: 'crypt', tier: 'early', name: 'Ribcage Guard',
    members: [m('ribcage-guard')],
    teaches: 'It takes the first 10 damage aimed at somebody else, and it leaves two Remains.' },

  // ── Standard (§10) ------------------------------------------------------
  { id: 'cr-5', region: 'crypt', tier: 'standard', name: 'Loose Tibia + Crypt Fetcher',
    members: [m('loose-tibia'), m('crypt-fetcher')],
    teaches: 'Now you see what the bones on the floor were for.' },
  { id: 'cr-6', region: 'crypt', tier: 'standard', name: 'Ribcage Guard + Loose Tibia',
    members: [m('ribcage-guard'), m('loose-tibia')],
    teaches: 'The Guard protects the small one and pays for it in Remains when it dies.' },
  { id: 'cr-7', region: 'crypt', tier: 'standard', name: 'Urn Spirit + Skull Roller',
    members: [m('urn-spirit'), m('skull-roller')],
    teaches: 'Whatever dies first is what the Urn gets to keep.' },
  { id: 'cr-8', region: 'crypt', tier: 'standard', name: 'Bone Heap + Loose Tibia',
    members: [m('bone-heap'), m('loose-tibia')],
    teaches: 'A Bone Pile and ordinary Remains at once, and only one of them matters.' },

  // ── Advanced (§11) ------------------------------------------------------
  { id: 'cr-9', region: 'crypt', tier: 'advanced', name: 'Ribcage Guard + Crypt Fetcher',
    members: [m('ribcage-guard'), m('crypt-fetcher')],
    teaches: 'The Guard makes exactly the thing the Fetcher wants, and makes two of them.' },
  { id: 'cr-10', region: 'crypt', tier: 'advanced', name: 'Bone Heap + Crypt Fetcher',
    members: [m('bone-heap'), m('crypt-fetcher')],
    teaches: 'Ignore the Pile or the Remains and something you already killed comes back.' },
  { id: 'cr-11', region: 'crypt', tier: 'advanced', name: 'Urn Spirit + Ribcage Guard',
    members: [m('urn-spirit'), m('ribcage-guard')],
    teaches: 'Kill the Guard and the Urn gets the best defensive memory in the region.' },
  { id: 'cr-12', region: 'crypt', tier: 'advanced',
    name: 'Loose Tibia + Ribcage Guard + Crypt Fetcher',
    members: [m('loose-tibia'), m('ribcage-guard'), m('crypt-fetcher')],
    teaches: 'Killing the first two feeds the third almost everything it needs.' },
  { id: 'cr-13', region: 'crypt', tier: 'advanced', name: 'Bone Heap + Urn Spirit',
    members: [m('bone-heap'), m('urn-spirit')],
    teaches: 'Manage the reassembly while deciding whether to hand the Urn a heal.' },
  { id: 'cr-14', region: 'crypt', tier: 'advanced',
    name: 'Bone Heap + Ribcage Guard + Crypt Fetcher',
    members: [m('bone-heap'), m('ribcage-guard'), m('crypt-fetcher')],
    teaches: 'One redirects, one rebuilds, one turns everything you killed into more of it.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§13-§15) ----------------------------------------------
  { id: 'cr-scare-knight', region: 'crypt', tier: 'elite', name: 'The Ribcage Knight',
    members: [m('ribcage-knight'), m('rib-shield'), m('femur-blade'), m('skull-helm')],
    teaches: 'Three pieces of equipment you can take off it — and twice, it can put one back.' },
  { id: 'cr-scare-ossuary', region: 'crypt', tier: 'elite', name: 'The Walking Ossuary',
    members: [m('walking-ossuary')],
    teaches: 'Every Remains anybody makes feeds it, including the ones it makes itself.' },
  { id: 'cr-scare-coffins', region: 'crypt', tier: 'elite', name: 'The Coffin Collector',
    members: [m('coffin-collector')],
    teaches: 'It buries your best Trick and gives it back if you hit hard enough.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'cr-boss', region: 'crypt', tier: 'boss', name: 'The Bone Curator',
    members: [m('bone-curator')],
    teaches: 'Breaking its Exhibit does not destroy the pieces. It leaves them where it can reach them.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Ballroom and Velvet Suites - docs/design/regions/10-ballroom.md §9-§12
//
// The ladder is one temptation at a time. The Party Phantom opens alone because
// an Invitation has to be understood before it can be weighed against anything
// else, and the Masquerade Mask never appears alone because it has nothing of
// its own to do.
// ─────────────────────────────────────────────────────────────────────────────
const BR = [
  // ── Early (§9) ----------------------------------------------------------
  { id: 'br-1', region: 'ballroom', tier: 'early', name: 'Dancing Shoe',
    members: [m('dancing-shoe')],
    teaches: 'Tempo. A little pressure every turn stops it snowballing.' },
  { id: 'br-2', region: 'ballroom', tier: 'early', name: 'Party Phantom',
    members: [m('party-phantom')],
    teaches: 'Invitations. The offer is a card in your hand and the whole cost is printed on it.' },
  { id: 'br-3', region: 'ballroom', tier: 'early', name: 'Goblet Geist',
    members: [m('goblet-geist')],
    teaches: 'Courage straight into damage — and refusing is not free here.' },
  { id: 'br-4', region: 'ballroom', tier: 'early', name: 'Velvet Curtain',
    members: [m('velvet-curtain')],
    teaches: 'You are not forbidden from hitting the protected one. You are choosing where it lands.' },

  // ── Standard (§10) ------------------------------------------------------
  { id: 'br-5', region: 'ballroom', tier: 'standard', name: 'Party Phantom + Dancing Shoe',
    members: [m('party-phantom'), m('dancing-shoe')],
    teaches: 'Taking the offer may cost you the attack that was keeping Tempo down.' },
  { id: 'br-6', region: 'ballroom', tier: 'standard', name: 'Masquerade Mask + Velvet Curtain',
    members: [m('masquerade-mask'), m('velvet-curtain')],
    teaches: 'The Curtain gains Guard constantly, and the Mask copies half of all of it.' },
  { id: 'br-7', region: 'ballroom', tier: 'standard', name: 'Goblet Geist + Dancing Shoe',
    members: [m('goblet-geist'), m('dancing-shoe')],
    teaches: 'Spend Courage for the burst that keeps the Shoe from running away.' },
  { id: 'br-8', region: 'ballroom', tier: 'standard', name: 'Waltzing Armor + Party Phantom',
    members: [m('waltzing-armor'), m('party-phantom')],
    teaches: 'One tempts you while the other quietly makes somebody else dangerous.' },

  // ── Advanced (§11) ------------------------------------------------------
  { id: 'br-9', region: 'ballroom', tier: 'advanced', name: 'Masquerade Mask + Party Phantom',
    members: [m('masquerade-mask'), m('party-phantom')],
    teaches: 'Every bargain you take feeds one of them and gives the other something to copy.' },
  { id: 'br-10', region: 'ballroom', tier: 'advanced', name: 'Velvet Curtain + Goblet Geist',
    members: [m('velvet-curtain'), m('goblet-geist')],
    teaches: 'You buy burst with Courage and the Curtain decides where half of it goes.' },
  { id: 'br-11', region: 'ballroom', tier: 'advanced', name: 'Waltzing Armor + Dancing Shoe',
    members: [m('waltzing-armor'), m('dancing-shoe')],
    teaches: 'The Armor can Encore a Shoe that is already at full Tempo.' },
  { id: 'br-12', region: 'ballroom', tier: 'advanced',
    name: 'Party Phantom + Masquerade Mask + Velvet Curtain',
    members: [m('party-phantom'), m('masquerade-mask'), m('velvet-curtain')],
    teaches: 'A layered support formation: one grows on your bargains, one copies, one protects.' },
  { id: 'br-13', region: 'ballroom', tier: 'advanced', name: 'Goblet Geist + Waltzing Armor',
    members: [m('goblet-geist'), m('waltzing-armor')],
    teaches: 'Trade Courage for burst while the Armor keeps changing which enemy matters.' },
  { id: 'br-14', region: 'ballroom', tier: 'advanced',
    name: 'Dancing Shoe + Party Phantom + Waltzing Armor',
    members: [m('dancing-shoe'), m('party-phantom'), m('waltzing-armor')],
    teaches: 'One escalates when ignored, one makes attractive offers, one amplifies the future. '
      + 'How much danger will you take for value now?',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§13-§15) ----------------------------------------------
  { id: 'br-scare-masque', region: 'ballroom', tier: 'elite', name: 'The Grand Masque',
    members: [m('grand-masque')],
    teaches: 'Four faces, four different dangers, and Favor survives all of them.' },
  { id: 'br-scare-dance', region: 'ballroom', tier: 'elite', name: 'The Eternal Dance',
    members: [m('the-lead'), m('the-follow')],
    teaches: 'Two dancers on one three-beat clock. Break the rhythm, or break a dancer.' },
  { id: 'br-scare-host', region: 'ballroom', tier: 'elite', name: 'The Velvet Host',
    members: [m('velvet-host')],
    teaches: 'Five offers, each better and each costing more. Taking two and stopping is a plan.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'br-boss', region: 'ballroom', tier: 'boss', name: 'The Master of Revels',
    members: [m('master-of-revels')],
    teaches: 'You set your own Revelry curve — and 25 damage in a turn takes one back off it.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Lampworks - docs/design/regions/09-lampworks.md §9-§12
//
// The ladder is Charge first, then the things that protect or steal it. The
// Blackout Blob arrives after the Spark Sprite on purpose: Blackout's whole
// meaning is "you cannot knock the Charge loose any more", which is nothing
// until the player has learned that they could.
// ─────────────────────────────────────────────────────────────────────────────
const LW = [
  // ── Early (§9) ----------------------------------------------------------
  { id: 'lw-1', region: 'lampworks', tier: 'early', name: 'Spark Sprite',
    members: [m('spark-sprite')],
    teaches: 'Charge. Build, build, release — and 12 damage in a turn knocks one loose.' },
  { id: 'lw-2', region: 'lampworks', tier: 'early', name: 'Waxling',
    members: [m('waxling')],
    teaches: 'An enemy that gets more dangerous AND more fragile as it burns down.' },
  { id: 'lw-3', region: 'lampworks', tier: 'early', name: 'Gaslight Ghost',
    members: [m('gaslight-ghost')],
    teaches: 'Lit and Dim. You can swing whenever you like; one window is simply better.' },
  { id: 'lw-4', region: 'lampworks', tier: 'early', name: 'Candle Cluster',
    members: [m('candle-cluster')],
    teaches: 'Keep it small, or let it grow into a five-hit turn.' },

  // ── Standard (§10) ------------------------------------------------------
  { id: 'lw-5', region: 'lampworks', tier: 'standard', name: 'Spark Sprite + Lamp Moth',
    members: [m('spark-sprite'), m('lamp-moth')],
    teaches: 'The Moth drinks the Sprite Charge and turns a future threat into a present one.' },
  { id: 'lw-6', region: 'lampworks', tier: 'standard', name: 'Waxling + Gaslight Ghost',
    members: [m('waxling'), m('gaslight-ghost')],
    teaches: 'Two enemies whose good windows are at opposite ends of the fight.' },
  { id: 'lw-7', region: 'lampworks', tier: 'standard', name: 'Candle Cluster + Lamp Moth',
    members: [m('candle-cluster'), m('lamp-moth')],
    teaches: 'Flames are not Charge, so the Moth cannot help itself and just presses.' },
  { id: 'lw-8', region: 'lampworks', tier: 'standard', name: 'Spark Sprite + Blackout Blob',
    members: [m('spark-sprite'), m('blackout-blob')],
    teaches: 'While the lights are out, damage will not shake the Charge loose at all.' },

  // ── Advanced (§11) ------------------------------------------------------
  { id: 'lw-9', region: 'lampworks', tier: 'advanced', name: 'Gaslight Ghost + Blackout Blob',
    members: [m('gaslight-ghost'), m('blackout-blob')],
    teaches: 'Blackout forces the Ghost Dim again and again.' },
  { id: 'lw-10', region: 'lampworks', tier: 'advanced', name: 'Spark Sprite + Candle Cluster',
    members: [m('spark-sprite'), m('candle-cluster')],
    teaches: 'Two stored threats on different clocks. You cannot suppress both.' },
  { id: 'lw-11', region: 'lampworks', tier: 'advanced', name: 'Waxling + Lamp Moth',
    members: [m('waxling'), m('lamp-moth')],
    teaches: 'Immediate pressure against a Waxling you would rather let get to 1 Wax.' },
  { id: 'lw-12', region: 'lampworks', tier: 'advanced',
    name: 'Spark Sprite + Lamp Moth + Blackout Blob',
    members: [m('spark-sprite'), m('lamp-moth'), m('blackout-blob')],
    teaches: 'The Sprite builds, the Blob protects the build, and the Moth may take it for itself.' },
  { id: 'lw-13', region: 'lampworks', tier: 'advanced', name: 'Gaslight Ghost + Candle Cluster',
    members: [m('gaslight-ghost'), m('candle-cluster')],
    teaches: 'Two very different timing windows in one fight.' },
  { id: 'lw-14', region: 'lampworks', tier: 'advanced',
    name: 'Spark Sprite + Candle Cluster + Blackout Blob',
    members: [m('spark-sprite'), m('candle-cluster'), m('blackout-blob')],
    teaches: 'Charge, Flames and Blackout at once. The hardest baseline formation.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§13-§15) ----------------------------------------------
  { id: 'lw-scare-chandelier', region: 'lampworks', tier: 'elite', name: 'The Chandelier',
    members: [m('chandelier')],
    teaches: 'Six lights, three states each, and an Overcharged one explodes if you leave it.' },
  { id: 'lw-scare-beast', region: 'lampworks', tier: 'elite', name: 'The Blackout Beast',
    members: [m('blackout-beast')],
    teaches: 'You want the room bright. You do not want it AS bright as it goes.' },
  { id: 'lw-scare-lantern', region: 'lampworks', tier: 'elite', name: 'The Great Lantern',
    members: [m('great-lantern')],
    teaches: 'Forty-eight damage, four turns away, and three different ways to answer it.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'lw-boss', region: 'lampworks', tier: 'boss', name: 'The Lamplighter',
    members: [m('the-lamplighter'), m('lamp'), m('lamp'), m('lamp'), m('lamp'), m('lamp')],
    teaches: 'Five Lamps you can break, and every Charge left hanging becomes its phase-two fuel.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Moonlit Attic and Observatory - docs/design/regions/08-attic-observatory.md
// §9-§12
//
// The region ladder is "one forecast, then two that overlap". The Orrery Imp
// arrives last on purpose: it can only reschedule a forecast that already
// exists, so §12 keeps it out of the pools until the player has met one.
// ─────────────────────────────────────────────────────────────────────────────
const AO = [
  // ── Early (§9) ----------------------------------------------------------
  { id: 'ao-1', region: 'attic-observatory', tier: 'early', name: 'Rafter Peeker',
    members: [m('rafter-peeker')],
    teaches: 'An intent you change by swinging at it. Both futures stay on screen until you pick.' },
  { id: 'ao-2', region: 'attic-observatory', tier: 'early', name: 'Moon Moth',
    members: [m('moon-moth')],
    teaches: 'A visible cycle. The dangerous, fragile Full Moon is three turns out and you can count.' },
  { id: 'ao-3', region: 'attic-observatory', tier: 'early', name: 'Cobweb Bundle',
    members: [m('cobweb-bundle')],
    teaches: 'It names the Trick you have not drawn yet and makes it awkward.' },
  { id: 'ao-4', region: 'attic-observatory', tier: 'early', name: 'Telescope Eye',
    members: [m('telescope-eye')],
    teaches: 'It watches one thing about your turn and tells you which. Change, or pay for it.' },

  // ── Standard (§10) ------------------------------------------------------
  { id: 'ao-5', region: 'attic-observatory', tier: 'standard', name: 'Rafter Peeker + Star Chart',
    members: [m('rafter-peeker'), m('star-chart')],
    teaches: 'The Chart can bless Drop Down, which is a reason to force Scramble Away.' },
  { id: 'ao-6', region: 'attic-observatory', tier: 'standard', name: 'Moon Moth + Cobweb Bundle',
    members: [m('moon-moth'), m('cobweb-bundle')],
    teaches: 'Plan around the Full Moon while the Tricks you were counting on get silk on them.' },
  { id: 'ao-7', region: 'attic-observatory', tier: 'standard', name: 'Telescope Eye + Rafter Peeker',
    members: [m('telescope-eye'), m('rafter-peeker')],
    teaches: 'One reads the whole turn. The other reacts to a single hit.' },
  { id: 'ao-8', region: 'attic-observatory', tier: 'standard', name: 'Moon Moth + Star Chart',
    members: [m('moon-moth'), m('star-chart')],
    teaches: 'A blessed Full Moon attack, visible for three turns before it lands.' },

  // ── Advanced (§11) ------------------------------------------------------
  { id: 'ao-9', region: 'attic-observatory', tier: 'advanced', name: 'Orrery Imp + Moon Moth',
    members: [m('orrery-imp'), m('moon-moth')],
    teaches: 'The Imp can bring the Full Moon forward.' },
  { id: 'ao-10', region: 'attic-observatory', tier: 'advanced', name: 'Telescope Eye + Star Chart',
    members: [m('telescope-eye'), m('star-chart')],
    teaches: 'One predicts you. The other makes the prediction hurt more.' },
  { id: 'ao-11', region: 'attic-observatory', tier: 'advanced', name: 'Cobweb Bundle + Orrery Imp',
    members: [m('cobweb-bundle'), m('orrery-imp')],
    teaches: 'Future card friction and future enemy timing, overlapping.' },
  { id: 'ao-12', region: 'attic-observatory', tier: 'advanced',
    name: 'Rafter Peeker + Orrery Imp + Star Chart',
    members: [m('rafter-peeker'), m('orrery-imp'), m('star-chart')],
    teaches: 'Manipulate the Peeker while the Imp moves the Chart blessing somewhere worse.' },
  { id: 'ao-13', region: 'attic-observatory', tier: 'advanced', name: 'Moon Moth + Telescope Eye',
    members: [m('moon-moth'), m('telescope-eye')],
    teaches: 'Two predictable systems at once, and they want opposite turns from you.' },
  { id: 'ao-14', region: 'attic-observatory', tier: 'advanced',
    name: 'Telescope Eye + Orrery Imp + Moon Moth',
    members: [m('telescope-eye'), m('orrery-imp'), m('moon-moth')],
    teaches: 'Your own behaviour, the lunar cycle, and the timing of both. The hardest baseline formation.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§13-§15) ----------------------------------------------
  { id: 'ao-scare-orrery', region: 'attic-observatory', tier: 'elite', name: 'The Great Orrery',
    members: [m('great-orrery')],
    teaches: 'Four positions, all visible. Twenty damage in one turn moves the heavens.' },
  { id: 'ao-scare-seer', region: 'attic-observatory', tier: 'elite', name: 'The Rafter Seer',
    members: [m('rafter-seer')],
    teaches: 'Three futures at once. Your first Attack, Skill or Power decides which comes true.' },
  { id: 'ao-scare-lens', region: 'attic-observatory', tier: 'elite', name: 'The Moon Lens',
    members: [m('moon-lens')],
    teaches: 'It magnifies whatever it points at, including itself. Your third Trick decides which.' },

  // ── Boss -----------------------------------------------------------------
  { id: 'ao-boss', region: 'attic-observatory', tier: 'boss', name: 'The Watcher in the Rafters',
    members: [m('the-watcher')],
    teaches: 'Its next three actions are on screen. Your 3rd and 5th Trick each let you reorder them.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The Grand Study and Library — docs/design/regions/07-study-library.md §10-§16
//
// The through-line of the region's own progression: each Scuffle pairs enemies
// that read DIFFERENT slices of the same deck, so the player ends up managing
// several simultaneous interpretations of one turn. §12's Scuffle 14 is named
// in the chapter as "the hardest baseline Library formation" for exactly that
// reason — the next draw, the last Trick and the whole turn's composition, all
// being read at once.
// ─────────────────────────────────────────────────────────────────────────────
const SL = [
  // ── Early (§10) ───────────────────────────────────────────────────────────
  { id: 'sl-1', region: 'study-library', tier: 'early', name: 'Book Bat',
    members: [m('book-bat')],
    teaches: 'Enemies can inspect your deck. It reads your next draw and answers it.' },
  { id: 'sl-2', region: 'study-library', tier: 'early', name: 'Inkblot',
    members: [m('inkblot')],
    teaches: 'It copies the LAST Trick you played. End your turn on purpose.' },
  { id: 'sl-3', region: 'study-library', tier: 'early', name: 'Paper Knight',
    members: [m('paper-knight')],
    teaches: 'Alternate forms. Wait it out, or force it open with one big turn.' },
  { id: 'sl-4', region: 'study-library', tier: 'early', name: 'Bookmark Imp',
    members: [m('bookmark-imp')],
    teaches: 'Markup. One Trick, and a real choice about whether to spend it.' },

  // ── Standard (§11) ────────────────────────────────────────────────────────
  { id: 'sl-5', region: 'study-library', tier: 'standard', name: 'Book Bat + Bookmark Imp',
    members: [m('book-bat'), m('bookmark-imp')],
    teaches: 'You know your next draw while deciding whether to spend the Trick in your hand.' },
  { id: 'sl-6', region: 'study-library', tier: 'standard', name: 'Paper Knight + Quill Clerk',
    members: [m('paper-knight'), m('quill-clerk')],
    teaches: 'Sequencing around Corrected Tricks while trying to hit an Unfold threshold.' },
  { id: 'sl-7', region: 'study-library', tier: 'standard', name: 'Inkblot + Book Bat',
    members: [m('inkblot'), m('book-bat')],
    teaches: 'One reads the Trick you just played. The other reads the one you have not drawn.' },
  { id: 'sl-8', region: 'study-library', tier: 'standard', name: 'Quill Clerk + Bookmark Imp',
    members: [m('quill-clerk'), m('bookmark-imp')],
    teaches: 'One taxes a future Trick. The other pressures the one in your hand right now.' },

  // ── Advanced (§12) ────────────────────────────────────────────────────────
  { id: 'sl-9', region: 'study-library', tier: 'advanced', name: 'Index Beast',
    members: [m('index-beast')],
    teaches: 'Classification, alone, so you can learn it. It answers the shape of your whole turn.' },
  { id: 'sl-10', region: 'study-library', tier: 'advanced', name: 'Index Beast + Book Bat',
    members: [m('index-beast'), m('book-bat')],
    teaches: 'One reads the composition of the turn, the other reads the next card of it.' },
  { id: 'sl-11', region: 'study-library', tier: 'advanced', name: 'Paper Knight + Inkblot',
    members: [m('paper-knight'), m('inkblot')],
    teaches: 'You want to end on a Skill for the Inkblot and swing Attacks to open the Knight.' },
  { id: 'sl-12', region: 'study-library', tier: 'advanced',
    name: 'Bookmark Imp + Quill Clerk + Paper Knight',
    members: [m('bookmark-imp'), m('quill-clerk'), m('paper-knight')],
    teaches: 'Your hand is being edited while a burst threshold sits in front of you.' },
  { id: 'sl-13', region: 'study-library', tier: 'advanced', name: 'Index Beast + Quill Clerk',
    members: [m('index-beast'), m('quill-clerk')],
    teaches: 'Correction interferes with the classification you were trying to produce.' },
  { id: 'sl-14', region: 'study-library', tier: 'advanced',
    name: 'Index Beast + Inkblot + Book Bat',
    members: [m('index-beast'), m('inkblot'), m('book-bat')],
    teaches: 'Three readings of one deck at once: the whole turn, the last Trick, the next draw.',
    advancedOnly: true, minScuffle: 2 },

  // ── Big Scares (§14-§16) ──────────────────────────────────────────────────
  { id: 'sl-scare-wyrm', region: 'study-library', tier: 'elite', name: 'The Bookwyrm',
    members: [m('bookwyrm')],
    teaches: 'It eats your best Trick and gets better at whatever that Trick was. Burst damage buys it back.' },
  { id: 'sl-scare-index', region: 'study-library', tier: 'elite', name: 'The Living Index',
    members: [m('living-index')],
    teaches: 'Three counters you can see. You decide which one trips, and a long turn trips all three.' },
  { id: 'sl-scare-oracle', region: 'study-library', tier: 'elite', name: 'The Inkblot Oracle',
    members: [m('inkblot-oracle')],
    teaches: 'It echoes your most EXPENSIVE Trick. The cost of your finisher is now part of its cost.' },

  // ── Boss ──────────────────────────────────────────────────────────────────
  { id: 'sl-boss', region: 'study-library', tier: 'boss', name: 'The Archivist',
    members: [m('the-archivist')],
    teaches: 'The Catalogue is a resource. A Filed tab takes no more Entries — so overloading it on purpose is the point.' },
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
  /* docs/design/regions/15-kennels.md §13. "Ward Animals cannot be directly
     damaged" and "Fright 3 never kills or permanently harms an animal" are
     enforced in the defs, where the damage actually arrives — see the header
     of `enemies/kennels.js` for why one flag was not enough. "No ordinary
     Scuffle can contain more than one Ward Animal" is the formation list
     above, which never places two. */
  kennels: {
    /** §13 outright: two Ward Orderlies at Haunt 0. The rest is the same
        argument — a second copy of any of these support enemies makes a
        board that defends itself faster than it can be taken apart. */
    noDuplicates: ['ward-orderly', 'comfort-blanket', 'walking-cage', 'feeding-cart'],
    /** The Leash Hand and the Blanket both need somebody to hold onto. */
    neverAlone: ['comfort-blanket'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/14-bathhouse.md §13. "Soap Sprite should appear
     before Overflow" and "Steam Ghost should appear alone before it appears
     beside Pipe Knocker" are the tier ladder: both are EARLY solo and both
     pairings are STANDARD. §13's last clause — "if several effects change
     Weather during one enemy turn, the LATEST resolved effect becomes
     active" — is free here, because every change in this region is written
     to `field.pendingWeather` and the last writer wins by construction. */
  bathhouse: {
    /** §13 outright: two Overflows or two Pipe Knockers at Haunt 0. */
    noDuplicates: ['overflow', 'pipe-knocker', 'umbrella-imp', 'steam-ghost'],
    /** §13: the Imp is support and has nobody to shelter on its own. */
    neverAlone: ['umbrella-imp'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/13-secret-passages.md §13. "Wall Whisper should
     appear alone before appearing with Peephole" and "Peephole cannot appear
     alone after the introductory pool" are both the tier ladder: the Whisper
     is EARLY solo and the pair is ADVANCED, and Peephole is never alone in
     any formation in this region. "Key Snatcher cannot reduce a player's
     starting Nerve below 1" is enforced in the def, where the Key is taken. */
  'secret-passages': {
    /** §13: the Crawlspace Thing cannot be the first thing you meet here. */
    minScuffle: { 'crawlspace-thing': 2 },
    /** §13 outright: two Snatchers or two Crawlspace Things at Haunt 0. */
    noDuplicates: ['key-snatcher', 'crawlspace-thing', 'false-door', 'peephole'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/12-hedge-maze.md §12. The Topiary gets a solo
     STANDARD Scuffle of its own (§10, Scuffle 8) before it appears with
     anything, because it is the one enemy that punishes the answer the
     first four teach, and it should get to make that point alone. */
  'hedge-maze': {
    /** Two of anything that retaliates is two bills for one swing. */
    noDuplicates: ['thorn-topiary', 'briar-lump', 'compost-crawler'],
    /** The Crawler needs somebody to eat. */
    neverAlone: ['compost-crawler'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/11-crypt.md §12. "Loose Tibia should appear before
     Crypt Fetcher" and "Bone Heap should appear alone before appearing with
     Crypt Fetcher" are the tier ladder: both are EARLY solo, both Fetcher
     pairings are STANDARD or ADVANCED. "Ribcage Guard cannot Cage another
     Ribcage Guard" and "Crypt Fetcher cannot restore the same enemy twice"
     are enforced in the defs, where the target is actually chosen. */
  crypt: {
    /** The Fetcher wants a floor with something on it. */
    minScuffle: { 'crypt-fetcher': 2 },
    /** Two Fetchers or two Heaps at Haunt 0 are §12 outright. */
    noDuplicates: ['crypt-fetcher', 'bone-heap', 'ribcage-guard'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/10-ballroom.md §12. "Party Phantom should appear
     alone before being paired with Waltzing Armor" is the tier ladder: the
     Phantom alone is Scuffle 2 in EARLY, the pair is Scuffle 8 in STANDARD.
     "Two Velvet Curtains cannot protect each other" and "Waltzing Armor
     cannot Encore another Waltzing Armor" are enforced in the defs, where
     the target is actually chosen. */
  ballroom: {
    /** "Masquerade Mask cannot appear alone in normal Scuffles." It has no
        fight of its own — everything it does is copied from somebody. */
    neverAlone: ['masquerade-mask'],
    /** Two Phantoms at Haunt 0 is two Invitations a turn, which is §12. */
    noDuplicates: ['party-phantom', 'velvet-curtain', 'waltzing-armor'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/09-lampworks.md §12. "Spark Sprite should appear
     before Blackout Blob" and "Gaslight Ghost should appear alone before
     appearing with Blackout Blob" are both handled by the tier ladder: the
     Sprite and the Ghost are EARLY, every Blob pairing is STANDARD or
     ADVANCED. */
  lampworks: {
    /** "Lamp Moth should not appear alone in ordinary Scuffles." It has
        nothing to drink from and no fight of its own. */
    neverAlone: ['lamp-moth'],
    /** The Blob wants a build to protect, so it waits for one. */
    minScuffle: { 'blackout-blob': 2 },
    /** Two Blobs, and two Clusters at baseline, are §12 outright. */
    noDuplicates: ['blackout-blob', 'candle-cluster'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/08-attic-observatory.md SS12. Every clause below is
     one line of that section. "Moon Moth should be encountered alone before
     appearing with Orrery Imp" has no field to hold it and needs none: the
     Moth alone is Scuffle 2 in the EARLY tier and the pair is Scuffle 9 in
     ADVANCED, so the tier ladder already orders them. */
  'attic-observatory': {
    /** "Orrery Imp cannot appear before the player has encountered at least
        one enemy with a forecast system." It has nothing to reschedule. */
    minScuffle: { 'orrery-imp': 2 },
    /** "Star Chart cannot appear alone in ordinary Scuffles." It marks an ALLY. */
    neverAlone: ['star-chart'],
    /** Two Imps at Haunt 0, and two Eyes ever, are SS12 outright. */
    noDuplicates: ['orrery-imp', 'telescope-eye'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/07-study-library.md §13. Every clause below is one line
     of that section.

     "Paper Knight should appear alone before appearing with Quill Clerk" is the
     one rule with no field to hold it: the generator has no notion of "this
     formation must have been seen first". It is satisfied by the POOLS instead
     — the Knight alone is Scuffle 3 in the early tier and the Knight with the
     Clerk is Scuffle 6 in standard, so the tier ladder already orders them. */
  'study-library': {
    /** "Quill Clerk cannot appear in the first Scuffle." */
    bannedFirstScuffle: ['quill-clerk'],
    /** "Index Beast cannot appear before the player has completed at least two
        Library Scuffles." */
    minScuffle: { 'index-beast': 2 },
    /** Two Clerks at Haunt 0 is four Corrections; two Beasts is §13 outright. */
    noDuplicates: ['quill-clerk', 'index-beast'],
    maxConsecutiveLead: 2,
  },
  /* docs/design/regions/06-graveyard.md §12. */
  graveyard: {
    minScuffle: { 'name-gnawer': 1 },
    /** "Mourning Candle should never appear alone in a normal Scuffle." */
    neverAlone: ['mourning-candle'],
    /** Two Hoppers at Haunt 0 is two overlapping bills; two Gnawers is §12's
        "cannot mark more than two Tricks simultaneously" by another route. */
    noDuplicates: ['headstone-hopper', 'name-gnawer', 'forget-me-not'],
    maxConsecutiveLead: 2,
  },
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

const ALL_ENCOUNTERS = [...FOYER, ...NURSERY, ...SQ, ...KC, ...GH, ...GY, ...SL, ...AO, ...LW, ...BR, ...CR, ...HM, ...SP, ...BH, ...KN, ...HEART];

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
