/**
 * The Backpack — a Kid's persistent equipment.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §19-20.  Gear is chosen at the
 * headquarters before an expedition, it survives between runs, and it is
 * capacity-limited (small 1 slot, medium 2, large 3; a new Kid has 5 slots and
 * progression eventually reaches 8).  The point of the section is that mundane
 * equipment must matter to the *story*, not only to combat — a Dog Whistle
 * should open a door in a Curiosity, not add +2 damage.
 *
 * So each item can carry any of three things:
 *
 *   tags    what the item lets you *do*.  Curiosity options declare
 *           `requires: 'canine'` (or an item id) and unlock when the Kid
 *           brought something that satisfies it.  This is the main channel.
 *   hooks   optional combat behaviour, identical in shape to a Keepsake's.
 *           Deliberately small — Gear is not meant to out-scale Keepsakes.
 *   run     declarative run-layer flags, same aggregation as relics.js.
 *
 *   BACKPACK_ITEMS                 every definition
 *   itemById(id)
 *   defaultLoadout(kidSlug)        the Kid's authored starting Gear
 *   loadoutSize(ids) / SLOTS_BASE
 *   backpackTags(ids)              -> Set of satisfied tags (ids included)
 *   backpackHooks(ids)             -> pseudo-relics for the combat engine
 *   backpackRunFlags(ids)          -> aggregated run-layer flags
 *   canSatisfy(ids, requirement)   -> boolean, the one call scenes need
 */
import { TERMS } from './schema.js';

export const SLOTS_BASE = 5;
export const SLOTS_MAX = 8;

/** Size in Backpack slots. */
export const Size = { SMALL: 1, MEDIUM: 2, LARGE: 3 };

/** @type {{id:string,name:string,size:number,desc:string,flavor:string,tags:string[],hooks?:object,run?:object}[]} */
export const BACKPACK_ITEMS = [
  {
    id: 'dog-whistle', name: 'Dog Whistle', size: Size.SMALL, icon: 'whistle',
    tags: ['canine', 'sound', 'call'],
    desc: 'Reveals hidden canine creatures. Bones and Pudding have opinions about it.',
    flavor: 'You cannot hear it. Everything downstairs can.',
    run: { revealCanine: true },
  },
  {
    id: 'pet-treats', name: 'Pet Treats', size: Size.SMALL, icon: 'treats',
    tags: ['calm', 'feed', 'animal'],
    desc: 'Calms a frightened ordinary animal. Some Curiosities end differently for a kid with a pocket full of these.',
    flavor: 'Liver flavour. Universally beloved, universally disgusting.',
  },
  {
    id: 'camera', name: 'Camera', size: Size.MEDIUM, icon: 'camera',
    tags: ['photo', 'evidence', 'light'],
    desc: 'Photographs supernatural clues. The flash shows what the eye will not.',
    flavor: 'Twelve exposures left. You have counted them nine times.',
    run: { clueBonus: 1 },
    hooks: {
      onCombatStart(h) {
        // One honest flashbulb: the room is legible for a moment.
        for (const en of h.e.enemies) h.e.applyStatus(en, 'weak', 1, { reason: 'gear' });
      },
    },
  },
  {
    id: 'familiar-toy', name: 'Familiar Toy', size: Size.SMALL, icon: 'toy',
    tags: ['pet', 'scent', 'memory'],
    desc: 'Something belonging to your own missing pet. In certain rooms it makes them leave a sign.',
    flavor: 'It still smells of them. That is the whole reason you brought it.',
    run: { clueBonus: 1, petTrail: true },
  },
  {
    id: 'collar-tag', name: 'Collar and Tag', size: Size.SMALL, icon: 'tag',
    tags: ['pet', 'name', 'tracking'],
    desc: 'The spare tag, never used. It interacts with whatever the house uses to keep track of its animals.',
    flavor: 'You had it engraved the week before. It has their name and your phone number.',
    run: { trackNames: true },
  },
  {
    id: 'flashlight', name: 'Big Flashlight', size: Size.MEDIUM, icon: 'flashlight',
    tags: ['light', 'dark', 'search'],
    desc: 'The heavy kind, with the rubber grip. Dark wings hold fewer surprises.',
    flavor: 'Also, if it comes to it, a club.',
    run: { lightWings: true },
    hooks: {
      onCombatStart(h) { h.e.gainBlock(h.e.player, 3, { fromCard: false, source: 'gear' }); },
    },
  },
  {
    id: 'walkie-talkie', name: 'Walkie Talkie', size: Size.MEDIUM, icon: 'radio',
    tags: ['sound', 'call', 'friends'],
    desc: 'Channel 4. Somebody outside is listening, and once per region they can talk you through it.',
    flavor: 'Static, then breathing, then your friend saying "say again?"',
    run: { rerollEvent: 1 },
  },
  {
    id: 'pocket-mirror', name: 'Pocket Mirror', size: Size.SMALL, icon: 'mirror',
    tags: ['see', 'reflect', 'evidence'],
    desc: 'Shows the room the way the house actually left it.',
    flavor: 'Cracked corner. Do not look at the corner.',
    run: { revealUnknown: true },
  },
  {
    id: 'multitool', name: 'Multitool', size: Size.SMALL, icon: 'tool',
    tags: ['open', 'fix', 'pry'],
    desc: 'Opens panels, vents, cages and one particular locked drawer.',
    flavor: 'Fourteen tools. You use two.',
  },
  {
    id: 'rope', name: 'Coil of Rope', size: Size.LARGE, icon: 'rope',
    tags: ['climb', 'reach', 'rescue'],
    desc: 'Twenty feet of it. Enough for a drop, a hole, or a creature that will not come out.',
    flavor: 'Your dad wanted it back by Sunday.',
  },
  {
    id: 'chalk', name: 'Box of Chalk', size: Size.SMALL, icon: 'chalkbox',
    tags: ['mark', 'map'],
    desc: 'Mark the doors. The house rubs them out, but slower than it would like.',
    flavor: 'Yellow, pink, and one blue stub worn to nothing.',
    run: { mapPeek: 1 },
  },
  {
    id: 'glow-sticks', name: 'Glow Sticks', size: Size.SMALL, icon: 'glow',
    tags: ['light', 'dark', 'mark'],
    desc: 'Snap, shake, drop. Light you can leave behind.',
    flavor: 'Green. Always green, whatever the packet said.',
    hooks: {
      onTurnStart(h) { if (h.side === 'player' && h.turn === 1) h.e.drawCards(1, 'gear'); },
    },
  },
  {
    id: 'compass', name: 'Compass', size: Size.SMALL, icon: 'compass',
    tags: ['map', 'direction'],
    desc: 'Spins constantly indoors. When it stops, look where it stopped.',
    flavor: 'It has pointed at the same interior wall for an hour.',
    run: { mapPeek: 1 },
  },
  {
    id: 'notebook', name: 'Investigation Notebook', size: Size.SMALL, icon: 'notebook',
    tags: ['evidence', 'record', 'name'],
    desc: 'Everything you have written down so far. Curiosities you have met before read differently.',
    flavor: 'Page one: "SEPT 3 — Pixel did not come home."',
    run: { clueBonus: 1, rememberEvents: true },
  },
  {
    id: 'blanket', name: 'Good Blanket', size: Size.MEDIUM, icon: 'blanket',
    tags: ['warm', 'fort', 'calm'],
    desc: `Safe Rooms restore an extra 8 ${TERMS.hp}. It is also the roof of the fort.`,
    flavor: 'The one with the rocket ships. Do not tell anyone.',
    run: { restBonus: 8 },
  },
  {
    id: 'thermos', name: 'Thermos', size: Size.MEDIUM, icon: 'thermos2',
    tags: ['warm', 'calm', 'share'],
    desc: `Recover 4 ${TERMS.hp} the first time each ${TERMS.combat} you end a turn without taking damage.`,
    flavor: 'Soup. Nobody has admitted whose.',
    hooks: {
      onTurnEnd(h) {
        if (h.side !== 'player') return;
        if ((h.e.player.damageTakenThisTurn || 0) > 0) return;
        const f = (h.e.field.gear || (h.e.field.gear = {}));
        if (f.thermos) return;
        f.thermos = true;
        h.e.heal(h.e.player, 4, 'gear');
      },
    },
  },
  {
    id: 'spare-batteries-gear', name: 'Spare Batteries', size: Size.SMALL, icon: 'battery2',
    tags: ['power', 'fix'],
    desc: 'Anything electric you are carrying works once more than it should.',
    flavor: 'Four AAs in a sandwich bag.',
    run: { gearRecharge: 1 },
  },
  {
    id: 'first-aid-tin', name: 'First Aid Tin', size: Size.SMALL, icon: 'tin2',
    tags: ['heal', 'fix', 'calm'],
    desc: `Once per region, recover 15 ${TERMS.hp} when you enter a Curiosity.`,
    flavor: 'Plasters with cartoon frogs. Two safety pins. An expired sweet.',
    run: { curiosityHeal: 15 },
  },
];

const BY_ID = new Map(BACKPACK_ITEMS.map(i => [i.id, i]));
export function itemById(id) { return BY_ID.get(id); }
export function allItems() { return BACKPACK_ITEMS.slice(); }

/** Authored starting Gear per Kid. Each fits inside SLOTS_BASE. */
export const KID_LOADOUTS = {
  maya:   ['camera', 'familiar-toy', 'notebook'],            // Orbit, a parrot
  mateo:  ['dog-whistle', 'pet-treats', 'rope'],             // Pepper, a dog
  amina:  ['pet-treats', 'blanket', 'glow-sticks'],          // Mochi, a rabbit
  eli:    ['multitool', 'spare-batteries-gear', 'flashlight'], // Sprocket, a ferret
  priya:  ['pocket-mirror', 'familiar-toy', 'chalk', 'notebook'],
  jordan: ['dog-whistle', 'walkie-talkie', 'compass'],       // Scout, a dog
  lena:   ['collar-tag', 'thermos', 'glow-sticks', 'chalk'],
  lucy:   ['pet-treats', 'first-aid-tin', 'familiar-toy', 'chalk'],
};

export function defaultLoadout(kidSlug = 'maya') {
  return (KID_LOADOUTS[kidSlug] || KID_LOADOUTS.maya).slice();
}

export function loadoutSize(ids = []) {
  return ids.reduce((s, id) => s + (BY_ID.get(id)?.size || 0), 0);
}
export function loadoutFits(ids = [], slots = SLOTS_BASE) {
  return loadoutSize(ids) <= slots;
}

/** Everything this Backpack can satisfy: item ids plus every tag they carry. */
export function backpackTags(ids = []) {
  const out = new Set();
  for (const id of ids) {
    const it = BY_ID.get(id);
    if (!it) continue;
    out.add(it.id);
    for (const t of it.tags || []) out.add(t);
  }
  return out;
}

/**
 * The single question a Curiosity asks: "did they bring anything that does X?"
 * `requirement` may be an item id, a tag, or an array (any-of).
 */
export function canSatisfy(ids = [], requirement) {
  if (!requirement) return true;
  const have = ids instanceof Set ? ids : backpackTags(ids);
  const list = Array.isArray(requirement) ? requirement : [requirement];
  return list.some(r => have.has(r));
}

/** Which carried item satisfies a requirement — for "You have the Camera." prose. */
export function satisfyingItem(ids = [], requirement) {
  const list = Array.isArray(requirement) ? requirement : [requirement];
  for (const id of ids) {
    const it = BY_ID.get(id);
    if (!it) continue;
    if (list.includes(it.id) || (it.tags || []).some(t => list.includes(t))) return it;
  }
  return null;
}

/**
 * Gear that touches combat is handed to the engine as extra relic-shaped
 * providers.  They are marked `gear: true` so the Keepsake bar can tell them
 * apart, and they carry no counter.
 */
export function backpackHooks(ids = []) {
  const out = [];
  for (const id of ids) {
    const it = BY_ID.get(id);
    if (it?.hooks) out.push({ id: `gear/${it.id}`, name: it.name, desc: it.desc, icon: it.icon, gear: true, hooks: it.hooks });
  }
  return out;
}

export function backpackRunFlags(ids = []) {
  const f = {
    clueBonus: 0, restBonus: 0, mapPeek: 0, rerollEvent: 0, curiosityHeal: 0,
    gearRecharge: 0, revealCanine: false, revealUnknown: false, petTrail: false,
    trackNames: false, lightWings: false, rememberEvents: false,
  };
  for (const id of ids) {
    const run = BY_ID.get(id)?.run;
    if (!run) continue;
    for (const k of Object.keys(f)) {
      if (run[k] == null) continue;
      if (typeof f[k] === 'number') f[k] += run[k];
      else f[k] = f[k] || !!run[k];
    }
  }
  return f;
}

export default {
  BACKPACK_ITEMS, itemById, defaultLoadout, loadoutSize, backpackTags,
  canSatisfy, backpackHooks, backpackRunFlags, SLOTS_BASE, SLOTS_MAX,
};
