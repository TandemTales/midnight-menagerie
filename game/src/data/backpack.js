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
 * ── THE SEAM SHAPE. Read this before touching anything that carries a loadout ─
 *
 * A Backpack is **`string[]` of item ids** — `['multitool', 'thermos']` — at
 * EVERY join in the game.  There is exactly one item table (`BACKPACK_ITEMS`,
 * below) and exactly one representation of "what the kid packed":
 *
 *     Save.data.backpacks[kidSlug]   string[]   the Clubhouse editor writes it
 *     bus 'run:start' .backpack      string[]   select.js emits it
 *     new Run({ backpack })          string[]   run.js stores it verbatim
 *     run.backpack                   string[]   hud.js / event.js read it
 *     run.snapshot().backpack        string[]   round-trips through Save
 *
 * Names, slot counts and descriptions are NEVER carried across a seam; they are
 * looked up from the id.  Selecting a screen's own copy of the item table is how
 * this system died the first time: `select.js` emitted `[{name:'Multitool',
 * slots:2}]`, `clubhouse.js` stored display names, and `data/backpack.js` keyed
 * everything by `'multitool'` — so `run.flags.gear` was all zeros, `run.carrying`
 * was empty, no gear hook ever fired, and every gear-gated Curiosity option was
 * locked *while you were carrying the item it named*.  Three modules, all green,
 * none agreeing (CONTRACTS.md rule 9).
 *
 * `assertLoadout()` below makes that failure loud instead of silent, and
 * `Run`'s constructor calls it.  If you have display data at a seam, you are on
 * the wrong side of the contract: pass the id and call `itemById`.
 *
 *   BACKPACK_ITEMS                 every definition
 *   itemById(id) / itemByName(n)
 *   defaultLoadout(kidSlug)        the Kid's authored starting Gear
 *   loadoutSize(ids) / SLOTS_BASE
 *   assertLoadout(ids, where)      throws on anything that is not string[] ids
 *   migrateLoadout(list, where)    lenient: legacy shapes -> ids, loudly
 *   backpackTags(ids)              -> Set of satisfied tags (ids included)
 *   backpackHooks(ids)             -> pseudo-relics for the combat engine
 *   backpackRunFlags(ids)          -> aggregated run-layer flags
 *   canSatisfy(ids, requirement)   -> boolean, the one call scenes need
 *   itemsSatisfying(requirement)   -> every item that would open that gate
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
      /* Turn 1, NOT onCombatStart. `_beginPlayerTurn` wipes Guard (step 2)
         after `onCombatStart` has already run, so Guard granted there is gone
         before the player sees a card — measured, not assumed: the seam test
         read 0 Guard either way until this moved. `onTurnStart` runs at step 3,
         on the safe side of the wipe. */
      onTurnStart(h) {
        if (h.side !== 'player' || h.turn !== 1) return;
        h.e.gainBlock(h.player, 3, { fromCard: false, source: 'gear' });
      },
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
        if ((h.player.damageTakenThisTurn || 0) > 0) return;
        const f = (h.e.field.gear || (h.e.field.gear = {}));
        if (f.thermos) return;
        f.thermos = true;
        h.e.heal(h.player, 4, 'gear');
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
export function itemById(id) { return typeof id === 'string' ? BY_ID.get(id) : undefined; }
export function allItems() { return BACKPACK_ITEMS.slice(); }

/* ── Name lookup, for migration only ────────────────────────────────────────
   Two screens used to key Gear by its display name.  Those names live in old
   `Save.data.backpacks` entries, so the table has to survive even though no new
   code may use it.  Keys are squashed (lowercase, letters and digits only) so
   "Walkie-Talkie", "walkie talkie" and "WalkieTalkie" all land.  The aliases are
   the display names the two deleted tables used where they differed from the
   canonical one. */
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const BY_NAME = new Map();
for (const it of BACKPACK_ITEMS) { BY_NAME.set(squash(it.name), it); BY_NAME.set(squash(it.id), it); }
for (const [alias, id] of [
  ['Flashlight', 'flashlight'], ['Big Flashlight', 'flashlight'],
  ['First Aid Kit', 'first-aid-tin'], ['First Aid Tin', 'first-aid-tin'],
  ['Walkie-Talkie', 'walkie-talkie'], ['Walkie Talkie', 'walkie-talkie'],
  ['Spare Batteries', 'spare-batteries-gear'],
  ['Collar Tag', 'collar-tag'], ['Collar and Tag', 'collar-tag'],
  ['Blanket', 'blanket'], ['Good Blanket', 'blanket'],
  ['Rope', 'rope'], ['Coil of Rope', 'rope'],
  ['Chalk', 'chalk'], ['Box of Chalk', 'chalk'],
  ['Notebook', 'notebook'], ['Investigation Notebook', 'notebook'],
]) BY_NAME.set(squash(alias), BY_ID.get(id));

/** Resolve a display name (or an id) to an item. Migration path only. */
export function itemByName(name) { return BY_NAME.get(squash(name)); }

/**
 * Authored starting Gear per Kid.  Each must fit inside SLOTS_BASE — the
 * module-load check at the bottom of this file enforces it.
 *
 * These were reconciled against the loadouts `select.js` used to print on the
 * Kid dossier, because those were the ones the player actually read and the
 * ones each Kid's perk is written around (Maya "Checked the Batteries" wants a
 * Flashlight and Spare Batteries to check; Jordan improvises with a Thermos).
 * Two of them overflowed five slots once real sizes were applied, and are
 * noted where they were trimmed.
 */
export const KID_LOADOUTS = {
  // Orbit, a cat. Equipment specialist: the pack IS her kit.        2+1+1+1 = 5
  maya:   ['flashlight', 'spare-batteries-gear', 'multitool', 'notebook'],
  // Pepper, a conure. Evidence and cross-referencing.                 1+2+2 = 5
  mateo:  ['notebook', 'camera', 'walkie-talkie'],
  // Mochi, a rabbit. Comfort, recovery, animal Curiosities.         2+1+1+1 = 5
  amina:  ['blanket', 'first-aid-tin', 'pet-treats', 'glow-sticks'],
  // Sprocket, a rat. Mechanisms and ways through.                     1+3+1 = 5
  eli:    ['multitool', 'rope', 'chalk'],
  // Pixel, a gecko. Plans three rooms ahead.                       1+1+1+1+1 = 5
  priya:  ['notebook', 'pocket-mirror', 'compass', 'glow-sticks', 'chalk'],
  // Scout, a beagle. Improvises, loudly.                            1+1+2+1 = 5
  jordan: ['dog-whistle', 'pet-treats', 'thermos', 'glow-sticks'],
  // Mooncake, a hamster. Secrets and evidence. (Chalk trimmed: 6 -> 5.)  2+2+1
  lena:   ['flashlight', 'camera', 'pocket-mirror'],
  // Bean, a guinea pig. Talks to things; the Walkie-Talkie is his signature
  // Gear in the design doc, and Bean answers "Bean Bean" over it.   2+1+1+1 = 5
  samir:  ['walkie-talkie', 'pet-treats', 'familiar-toy', 'notebook'],
};

export function defaultLoadout(kidSlug = 'maya') {
  return (KID_LOADOUTS[kidSlug] || KID_LOADOUTS.maya).slice();
}

export function loadoutSize(ids = []) {
  return ids.reduce((s, id) => s + (itemById(id)?.size || 0), 0);
}
export function loadoutFits(ids = [], slots = SLOTS_BASE) {
  return loadoutSize(ids) <= slots;
}

/* ── The seam guard (CONTRACTS.md rule 8) ───────────────────────────────────
   The Backpack is a pillar of the game and it failed *silently* for a whole
   build, because a wrong shape at this join produces empty Sets and zeroed
   flags rather than an error.  So: anything that is not `string[]` of known ids
   throws here, at the moment the loadout is handed over, naming the caller. */

/**
 * Throw unless `list` is an array of known item ids.
 * @param {unknown} list
 * @param {string} where  the seam being crossed, for the message
 * @returns {string[]} the same list
 */
export function assertLoadout(list, where = 'backpack') {
  if (!Array.isArray(list)) {
    throw new TypeError(
      `[backpack] ${where}: a loadout must be string[] of item ids, got ${kindOf(list)}. ` +
      `See the seam-shape note at the top of data/backpack.js.`);
  }
  const bad = [];
  for (const entry of list) {
    if (typeof entry !== 'string') { bad.push(`${kindOf(entry)} ${brief(entry)}`); continue; }
    if (!BY_ID.has(entry)) bad.push(`unknown id ${JSON.stringify(entry)}`);
  }
  if (bad.length) {
    throw new TypeError(
      `[backpack] ${where}: ${bad.length} bad entr${bad.length === 1 ? 'y' : 'ies'} — ${bad.join('; ')}. ` +
      `A loadout is string[] of ids from BACKPACK_ITEMS, never names or {name,slots} objects. ` +
      `Known ids: ${BACKPACK_ITEMS.map(i => i.id).join(', ')}.`);
  }
  return list;
}

function kindOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }
function brief(v) { try { return JSON.stringify(v).slice(0, 60); } catch { return String(v); } }

/**
 * The lenient door, for data that was written by an older build: saved runs and
 * `Save.data.backpacks` entries that hold display names, or the `{name,slots}`
 * objects `select.js` used to emit.  Converts what it can and says so loudly;
 * drops what it cannot.  Live code must never route through this — the strict
 * `assertLoadout` is what keeps the seam honest.
 * @returns {string[]}
 */
export function migrateLoadout(list, where = 'backpack') {
  if (list == null) return [];
  if (!Array.isArray(list)) {
    console.error(`[backpack] ${where}: discarding a loadout of type ${kindOf(list)}; expected string[] of ids.`);
    return [];
  }
  const out = [];
  let legacy = 0;
  for (const entry of list) {
    if (typeof entry === 'string' && BY_ID.has(entry)) { out.push(entry); continue; }
    const it = typeof entry === 'string' ? itemByName(entry)
      : (entry && typeof entry === 'object') ? (itemById(entry.id) || itemByName(entry.name))
        : undefined;
    if (it) { out.push(it.id); legacy++; continue; }
    legacy++;
    console.error(`[backpack] ${where}: dropped an unrecognised Gear entry ${brief(entry)}.`);
  }
  if (legacy) {
    console.warn(`[backpack] ${where}: migrated ${legacy} legacy Gear entr${legacy === 1 ? 'y' : 'ies'} to ids. ` +
      `Loadouts are string[] of ids — see data/backpack.js.`);
  }
  return out;
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
  if (!requirement) return null;
  const list = Array.isArray(requirement) ? requirement : [requirement];
  for (const id of ids) {
    const it = itemById(id);
    if (!it) continue;
    if (list.includes(it.id) || (it.tags || []).some(t => list.includes(t))) return it;
  }
  return null;
}

/**
 * Every item that WOULD open this gate — what a locked Curiosity option names
 * so the player learns what to pack next time.  A requirement may be a tag
 * (`'canine'`), so listing ids alone would print nothing at all.
 */
export function itemsSatisfying(requirement) {
  if (!requirement) return [];
  const list = Array.isArray(requirement) ? requirement : [requirement];
  return BACKPACK_ITEMS.filter(it => list.includes(it.id) || (it.tags || []).some(t => list.includes(t)));
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

/* ── Boot-time table check ──────────────────────────────────────────────────
   Runs once, at module load, before a single screen exists. It catches the two
   ways this table can rot: an authored loadout naming an item that no longer
   exists, and one that no longer fits in a new Kid's five slots. Both used to
   fail as "the Gear row is empty" three screens later. */
(function assertTables() {
  const problems = [];
  const seen = new Set();
  for (const it of BACKPACK_ITEMS) {
    if (seen.has(it.id)) problems.push(`duplicate item id ${it.id}`);
    seen.add(it.id);
    if (!(it.size >= 1 && it.size <= 3)) problems.push(`${it.id}: size ${it.size} is not 1-3`);
    if (!it.name || !it.desc) problems.push(`${it.id}: missing name or desc`);
  }
  for (const [kid, ids] of Object.entries(KID_LOADOUTS)) {
    for (const id of ids) if (!BY_ID.has(id)) problems.push(`KID_LOADOUTS.${kid}: unknown item id ${JSON.stringify(id)}`);
    const size = loadoutSize(ids);
    if (size > SLOTS_BASE) problems.push(`KID_LOADOUTS.${kid}: ${size} slots, over the ${SLOTS_BASE} a new Kid has`);
  }
  if (problems.length) throw new Error(`[backpack] table check failed:\n  ${problems.join('\n  ')}`);
})();

export default {
  BACKPACK_ITEMS, itemById, itemByName, defaultLoadout, loadoutSize, loadoutFits,
  assertLoadout, migrateLoadout, backpackTags, canSatisfy, satisfyingItem,
  itemsSatisfying, backpackHooks, backpackRunFlags, KID_LOADOUTS,
  SLOTS_BASE, SLOTS_MAX,
};
