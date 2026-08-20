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
    id: 'foyer-7', region: 'foyer', tier: 'early', name: 'Lost Luggage + Dust Bunny',
    members: [m('lost-luggage'), m('dust-bunny')],
    teaches: 'Deck interference competes with immediate escalation.',
    // BALANCE 2026-08-20: promoted from 'standard'. The early pool was three
    // solos and one pair, and a lone enemy cannot out-damage one turn of Guard,
    // so a quarter of opening Scuffles cost literally nothing. This is the
    // cheapest pair in the roster, so it raises the floor without moving the
    // ceiling. Promoting the 53-Courage pair as well overshot the 8-12 band
    // (measured: mean scuffle cost 15.6), so only this one moved.
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
  {
    id: 'foyer-scare-coatcheck', region: 'foyer', tier: 'elite', name: 'The Grand Coatcheck',
    members: [m('grand-coatcheck')],
    teaches: 'Adaptability. Accept the current Garment or spend 18 damage in a turn to Snag it.',
  },
  {
    id: 'foyer-scare-guest', region: 'foyer', tier: 'elite', name: 'The Unwelcome Guest',
    members: [m('unwelcome-guest')],
    teaches: 'Pattern breaking. It never says "do not play Skills" — only "not three of them again".',
  },
  {
    id: 'foyer-scare-bell', region: 'foyer', tier: 'elite', name: 'The House Bell',
    members: [m('house-bell')],
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
// Per-region generation rules (design doc §10 "Encounter selection rules")
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_RULES = {
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

const ALL_ENCOUNTERS = [...FOYER, ...NURSERY, ...SQ];

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
 * three pairs, and the pairs are picked twice as often; the solos remain
 * because each one is the first time the player meets that enemy and that
 * introduction is worth keeping.
 */
function defaultWeight(enc) {
  return (enc.members && enc.members.length > 1) ? 2 : 1;
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
