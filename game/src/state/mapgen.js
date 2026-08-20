/**
 * Route generation for a mansion region.  OWNER: map agent.
 *
 * The mansion is NOT a random dungeon.  All 340 rooms are permanently authored
 * (docs/design/01-mansion-structure.md).  What a seed changes is *which rooms the
 * house is currently willing to let you reach* and what is happening inside them.
 * So: the graph shape is procedural, every node's identity is authored.
 *
 * Deterministic: same (regionId, seed, opts) -> byte-identical map.  Never Math.random.
 *
 *   import { generateRegionMap } from '../state/mapgen.js';
 *   const map = generateRegionMap('foyer', 42, { hauntLevel: 0, companion: 'marmalade' });
 *   // -> { regionId, seed, rows, lanes, nodes, edges, bossId, startIds, hazards, meta }
 */
import { RNG, hashSeed } from '../core/rng.js';
import { NodeType, REGION_ORDER } from '../data/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Room tags, straight from the design doc's room lists.
//   sc scuffle · bs big scare · cu curiosity · cl clue · se secret · tr treasure
//   bf blanket fort · mk midnight market · cn connector · bo boss · st story
// ─────────────────────────────────────────────────────────────────────────────
const R = (name, tag) => ({ name, tag });

/** @type {Object<string, {name,tag}[]>} 20 authored rooms per region. */
export const ROOMS = {
  'foyer': [
    R('Front Vestibule','cu'), R('Entry Hall','sc'), R('Coat Room','se'), R('Receiving Room','cu'),
    R('Parlor','sc'), R('Drawing Room','cl'), R('Portrait Hall','cl'), R('Music Room','sc'),
    R('Formal Dining Room','sc'), R('Umbrella Gallery','bf'), R('Grand Staircase','cn'),
    R('East Landing','sc'), R('West Landing','cu'), R('Visitor Cloakroom','se'),
    R('Marble Gallery','tr'), R('House Register Alcove','cl'), R('Bell Pull Gallery','cu'),
    R('East Reception Hall','sc'), R("Butler's Passage",'se'), R('Receiving Chamber','bo'),
  ],
  'nursery': [
    R('Day Nursery','sc'), R('Night Nursery','cu'), R('Playroom','sc'), R('Toy Room','sc'),
    R('Dollhouse Room','cl'), R('Story Nook','cl'), R('Schoolroom','cu'), R('Changing Room','cu'),
    R('Blanket Room','bf'), R('Music Box Room','sc'), R("Nanny's Closet",'se'),
    R('Rocking Chair Gallery','bs'), R('Cradle Alcove','cu'), R('Wardrobe Room','tr'),
    R('Milk Room','mk'), R('Sewing Room','cl'), R('Mending Closet','se'), R("Nanny's Room",'cu'),
    R('Governess Landing','cl'), R('Bedtime Hall','bo'),
  ],
  'sleeping-quarters': [
    R('Guest Hall','sc'), R('Blue Bedroom','sc'), R('Rose Bedroom','cu'), R('Green Bedroom','sc'),
    R('Yellow Bedroom','cu'), R('Twin Bedroom','sc'), R('Guest Dressing Room','tr'),
    R('Shared Bath','cu'), R('Linen Press','se'), R('Wardrobe Corridor','sc'),
    R('Underbed Hollow','cl'), R('Canopy Bedroom','bs'), R('Box Room','cu'),
    R('Dreaming Hall','cu'), R('Nightstand Gallery','tr'), R("Servants' Stair Landing",'cn'),
    R('Moon Window Room','bf'), R('Master Dressing Room','cl'), R('Master Bedroom','cl'),
    R('Bedframe Court','bo'),
  ],
  'kitchens-cellars': [
    R('Main Kitchen','sc'), R('Baking Kitchen','sc'), R('Pastry Room','cu'), R('Scullery','cu'),
    R("Butler's Pantry",'mk'), R('Dry Pantry','tr'), R('Preserves Pantry','cu'),
    R('Candy Cupboard','cl'), R('Cold Larder','sc'), R('Root Cellar','cu'), R('Wine Cellar','tr'),
    R('Bottle Room','sc'), R('Dish Room','sc'), R('Breakfast Room','bf'),
    R("Servants' Dining Room",'cl'), R('Spice Closet','se'), R('Flour Room','sc'),
    R('Sugar Store','tr'), R('Dumbwaiter Hall','cn'), R("Confectioner's Kitchen",'bo'),
  ],
  'greenhouse': [
    R('Glass Hall','sc'), R('Palm House','sc'), R('Fernery','cu'), R('Orchid House','tr'),
    R('Cactus Gallery','bs'), R('Moss House','bf'), R('Potting Room','mk'), R('Seed Vault','tr'),
    R('Tool Shed','se'), R('Rain House','sc'), R('Moon Pool','cu'), R('Ivy Bridge','cn'),
    R('Root Nursery','cl'), R('Topiary Court','sc'), R('Herbarium','cl'), R('Compost House','cu'),
    R('Orangery','bf'), R('Winter Garden','sc'), R('Overgrown Conservatory','bs'),
    R("Head Gardener's Rotunda",'bo'),
  ],
  'graveyard': [
    R('Front Cemetery Gate','sc'), R('Gravel Walk','cn'), R('Angel Row','cu'), R('Family Plot','sc'),
    R('Pet Memorial Row','cl'), R('Old Chapel Yard','bf'), R('Sunken Grave','se'),
    R('Mausoleum Lane','sc'), R('Crypt Steps','cn'), R("Caretaker's Shed",'mk'),
    R('Bell Grave','cu'), R('Weeping Yew Court','sc'), R('Tomb Garden','cl'),
    R('Broken Monument Field','bs'), R('Stone Pond','cu'), R('Name Wall','cl'),
    R('Forgotten Plot','tr'), R('Moonlit Mausoleum','bs'), R("Groundskeeper's Path",'sc'),
    R('Great Mausoleum','bo'),
  ],
  'study-library': [
    R('Main Library','sc'), R('Reading Room','bf'), R('Map Room','cl'), R('Writing Study','cu'),
    R('Private Study','tr'), R("Children's Library",'sc'), R('Reference Room','cl'),
    R('Newspaper Archive','cl'), R('Letter Archive','cu'), R('Book Repair Room','mk'),
    R("Scribe's Room",'sc'), R('Cabinet of Curiosities','tr'), R('Globe Room','cu'),
    R('Index Hall','sc'), R('Restricted Stacks','bs'), R('Rolling Ladder Gallery','cn'),
    R('Fireplace Study','se'), R('Document Vault','tr'), R("Archivist's Office",'cl'),
    R('Grand Study','bo'),
  ],
  'attic-observatory': [
    R('Attic Stair','cn'), R('Lower Attic','sc'), R('Trunk Room','cu'), R('Costume Loft','sc'),
    R('Rafter Walk','cn'), R('Cobweb Gallery','cl'), R('Moth Loft','mk'), R('Storage Maze','se'),
    R('Astronomy Library','cl'), R('Star Chart Room','cu'), R('Telescope Gallery','sc'),
    R('Observatory Landing','bf'), R('Moon Dome','bs'), R('Weather Instrument Room','cu'),
    R('Rooftop Access','cn'), R('Chimney Walk','sc'), R('Hidden Eaves','se'),
    R('Water Tank Loft','cu'), R("Watcher's Nook",'cl'), R('Grand Observatory','bo'),
  ],
  'lampworks': [
    R('Lampkeeper Stair','cn'), R('Lamp Store','sc'), R('Candle Room','cu'), R('Wax Room','sc'),
    R('Oil Closet','se'), R('Chimney Passage','cn'), R('Gas Valve Room','sc'),
    R('Lantern Gallery','cl'), R('Sconce Hall','sc'), R('Match Safe','tr'), R('Wick Room','cu'),
    R('Lamp Repair Shop','mk'), R('Blue Flame Room','bs'), R('Boiler Walk','cn'),
    R('Reflector Gallery','cu'), R('Service Catwalk','cn'), R('Chimney Stack Room','sc'),
    R('Glow Chamber','bf'), R("Lamplighter's Office",'cl'), R('Great Lantern Room','bo'),
  ],
  'ballroom': [
    R('Ballroom Foyer','cu'), R('Grand Ballroom','sc'), R('Small Ballroom','sc'),
    R("Musicians' Gallery",'cl'), R('Dance Card Room','cu'), R('Refreshment Salon','mk'),
    R('Velvet Lounge','bf'), R('Red Drawing Room','cu'), R('Gold Salon','tr'),
    R('Moon Terrace','cn'), R('Mask Room','sc'), R('Powder Room','se'),
    R("Gentlemen's Room",'cu'), R("Ladies' Retiring Room",'cu'), R('Guest Suite','sc'),
    R('Velvet Bedroom','cl'), R('Balcony Corridor','cn'), R('Mirror Ballroom','bs'),
    R('Midnight Supper Room','sc'), R("Master of Revels' Hall",'bo'),
  ],
  'crypt': [
    R('Crypt Vestibule','sc'), R('Family Crypt','cl'), R('Pet Crypt','cl'), R('Ossuary Hall','sc'),
    R('Bone Gallery','sc'), R('Skull Alcove','cu'), R('Reliquary','tr'), R('Stone Passage','cn'),
    R('Burial Preparation Room','cu'), R('Coffin Store','mk'), R('Name Vault','cl'),
    R('Memorial Chamber','bf'), R('Catacomb Junction','cn'), R('East Catacomb','sc'),
    R('West Catacomb','cu'), R('Candle Chapel','cl'), R('Bone Pit','bs'), R('Sealed Crypt','se'),
    R("Keeper's Cell",'cl'), R('Great Ossuary','bo'),
  ],
  'hedge-maze': [
    R('Hedge Gate','sc'), R('North Maze','sc'), R('South Maze','sc'), R('Rose Deadwalk','cu'),
    R('Briar Tunnel','cn'), R('Thorn Arbor','bs'), R('Rotting Gazebo','bf'),
    R('Compost Court','sc'), R('Mushroom Bed','cu'), R('Leaf Pit','se'), R('Dead Fountain','cu'),
    R('Slug Garden','sc'), R('Hollow Stump','tr'), R('Burrow Row','cl'), R('Moonlit Hedge','sc'),
    R('Mulch Shed','mk'), R('Snail Path','cn'), R('Withered Orchard','bs'),
    R("Groundskeeper's Garden",'cl'), R('Rotunda of Rot','bo'),
  ],
  'secret-passages': [
    R('Narrow Service Hall','sc'), R('Wall Passage','cn'), R('Behind the Library','cl'),
    R('Behind the Nursery','cu'), R('Behind the Ballroom','sc'), R('Mirror Crawlspace','se'),
    R('Fireplace Passage','cn'), R('False Closet','tr'), R('Hollow Wall','sc'),
    R('Speaking Tube Junction','cu'), R('Ventilation Shaft','cn'), R('Trapdoor Landing','sc'),
    R('Hidden Stair','cn'), R('Portrait Cavity','cu'), R('Dumbwaiter Shaft','cn'),
    R('Underfloor Run','se'), R('Back Stair Junction','sc'), R('Blind Corridor','bs'),
    R('Shadow Junction','cl'), R('Whisper Room','bo'),
  ],
  'bathhouse': [
    R('Changing Room','cu'), R('Locker Gallery','cu'), R('Towel Hall','bf'), R('Washroom','sc'),
    R('Bathing Chamber','sc'), R("Children's Bath",'cu'), R('Steam Room','bs'), R('Sauna','cu'),
    R('Rain Gallery','cl'), R('Indoor Pool','sc'), R('Plunge Pool','tr'), R('Drain Hall','sc'),
    R('Pipe Gallery','cn'), R('Cistern Room','bs'), R('Pump Room','mk'), R('Shower Arcade','sc'),
    R('Drying Room','cu'), R('Storm Balcony','cn'), R('Flooded Conservatory','cl'),
    R('Drowned Rotunda','bo'),
  ],
  'kennels': [
    R('Animal Intake Room','cl'), R('Front Kennel Hall','sc'), R('Small Dog Kennels','cl'),
    R('Large Dog Kennels','sc'), R('Cat Room','cu'), R('Grooming Room','bf'), R('Wash Room','cu'),
    R('Animal Kitchen','sc'), R('Feed Store','tr'), R('Treat Pantry','mk'), R('Collar Room','cl'),
    R('Leash Cupboard','se'), R('Exercise Yard','sc'), R('Training Hall','sc'),
    R('Veterinary Room','cu'), R('Quarantine Room','bs'), R('Rear Kennel Run','cn'),
    R("Groundskeeper's Office",'cl'), R('Night Kennels','sc'), R("Kennelmaster's Court",'bo'),
  ],
  'pumpkin-grounds': [
    R('Moon Gate','sc'), R('Pumpkin Court','sc'), R('Pumpkin Patch','cl'), R('Gourd House','cu'),
    R('Seed Shed','tr'), R('Moon Pond','cu'), R('Lily Walk','cn'), R('Frog Pool','cl'),
    R('Stone Bridge','cn'), R('Firefly Lawn','bf'), R('Harvest Arcade','sc'),
    R('Scarecrow Walk','bs'), R('Wheelbarrow Shed','mk'), R('Apple Court','cu'),
    R('Corn Maze','sc'), R('Moon Dial Garden','cl'), R('Glass Pumpkin House','tr'),
    R('Rain Barrel Row','sc'), R('Harvest Pavilion','bf'), R("Harvest King's Court",'bo'),
  ],
  'heart': [
    R('Threshold Hall','sc'), R('Inner Stair','cn'), R('Menagerie Hall','cl'),
    R('Hall of Collars','cl'), R('Hall of Names','cl'), R('Ancestral Gallery','cl'),
    R('Transformation Gallery','bs'), R('Memory Room','cu'), R('Quiet Kennels','sc'),
    R('Sanctuary Garden','bf'), R('New Arrival Ward','cl'), R('Pet Holding Ward','st'),
    R('Observation Room','cu'), R('House Nursery','sc'), R('Impossible Door','cn'),
    R('Lost Things Vault','tr'), R('Pulse Passage','sc'), R('Voice Chamber','cu'),
    R('Inner Sanctuary','bs'), R('Heart Chamber','bo'),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Region metadata.  `section` is the blueprint cut-out; lanes/rows encode the
// architectural character of the wing (a vertical shaft is narrow and deep, a
// glass complex is broad and shallow).
// ─────────────────────────────────────────────────────────────────────────────
const M = (slug, name, boss, companion, section, lanes, rows, form) =>
  ({ slug, name, boss, companion, section, lanes, rows, form,
     index: REGION_ORDER.indexOf(slug) + 1, roman: ROMAN[REGION_ORDER.indexOf(slug) + 1] });

const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII'];

/** @type {Object<string, object>} */
export const REGIONS = Object.fromEntries([
  M('foyer','The Forgotten Foyer','The Butler','marmalade',1,4,13,'Formal entrance block · symmetrical about a central axis'),
  M('nursery','The Forgotten Nursery','The Governess','mopsy',2,4,13,'Compact suite around two communal play spaces'),
  M('sleeping-quarters','The Sleeping Quarters','The Bedframe Beast','boggle',3,3,14,'Long residential corridor · bedrooms both sides'),
  M('kitchens-cellars','The Kitchens and Cellars','The Confectioner','taffy',4,4,14,'Service complex above · older cellars below'),
  M('greenhouse','The Impossible Greenhouse','The Head Gardener','brambleboo',5,4,13,'Branching glass complex beyond the exterior wall'),
  M('graveyard','The Mansion Graveyard','The Groundskeeper of Names','pudding',6,4,14,'Irregular ring of burial paths'),
  M('study-library','The Grand Study and Library','The Archivist','crinkle',7,4,14,'Asymmetrical library wing · several expansions'),
  M('attic-observatory','The Moonlit Attic and Observatory','The Watcher in the Rafters','wink',8,4,14,'Attic chambers climbing to a tower'),
  M('lampworks','The Lampworks','The Lamplighter','wisp',9,3,15,'Narrow vertical shaft · maintenance floors'),
  M('ballroom','The Ballroom and Velvet Suites','The Master of Revels','crumbula',10,4,14,'Formal entertainment wing · strict symmetry'),
  M('crypt','The Crypt and Ossuary','The Bone Curator','bones',11,4,14,'Subterranean radial complex'),
  M('hedge-maze','The Withered Hedge Maze','The Gardener of Rot','truffle',12,4,15,'Exterior maze · the paths are the rooms'),
  M('secret-passages','The Secret Passages','The Whisper Warden','hush',13,3,15,'Thin circulation network inside the walls'),
  M('bathhouse','The Bathhouse and Rain Wing','The Drowned Matron','drizzle',14,3,14,'Crescent wing around an indoor pool'),
  M('kennels','The Kennels and Animal Ward','The Kennelmaster','mossbit',15,4,14,'Animal care wing around an exercise yard'),
  M('pumpkin-grounds','The Moon Courtyard and Pumpkin Grounds','The Harvest King','pipkin',16,4,15,'Enclosed grounds · ponds, patches and paths'),
  M('heart','The Heart of the House','The Heart','',17,4,15,'Impossible interior · a plan folded into an organ'),
].map(m => [m.slug, m]));

export function regionMeta(regionId) {
  return REGIONS[regionId] || REGIONS['foyer'];
}
export function blueprintSectionUrl(regionId) {
  const n = regionMeta(regionId).section;
  return `assets/blueprint/section${String(n).padStart(2, '0')}.png`;
}

/**
 * Where each region sits on the master estate drawing (1448 x 1086).
 * Centres were recovered by matching each cut-out section against the master;
 * the map screen crops here rather than blowing the 273px sections up 7x, which
 * turns the linework to mush.  Width is authored per region so a vertical shaft
 * reads as a tight detail and a glass complex reads as a broad one.
 */
export const MASTER = { url: 'assets/blueprint/mansion.png', w: 1448, h: 1086 };
const PLAN_CROP = {
  'foyer':             { cx: 285,  cy: 186, w: 800 },
  'nursery':           { cx: 1185, cy: 208, w: 760 },
  'sleeping-quarters': { cx: 1228, cy: 427, w: 820 },
  'kitchens-cellars':  { cx: 999,  cy: 716, w: 820 },
  'greenhouse':        { cx: 817,  cy: 925, w: 1080 },
  'graveyard':         { cx: 291,  cy: 953, w: 860 },
  'study-library':     { cx: 1034, cy: 489, w: 790 },
  'attic-observatory': { cx: 664,  cy: 755, w: 900 },
  'lampworks':         { cx: 263,  cy: 706, w: 640 },
  'ballroom':          { cx: 280,  cy: 533, w: 880 },
  'crypt':             { cx: 568,  cy: 600, w: 720 },
  'hedge-maze':        { cx: 322,  cy: 272, w: 900 },
  'secret-passages':   { cx: 559,  cy: 331, w: 940 },
  'bathhouse':         { cx: 813,  cy: 251, w: 700 },
  'kennels':           { cx: 956,  cy: 231, w: 720 },
  'pumpkin-grounds':   { cx: 767,  cy: 436, w: 900 },
  'heart':             { cx: 1252, cy: 726, w: 680 },
};

/** Source rectangle on MASTER for a region, at the given output aspect. */
export function blueprintPlan(regionId, aspect = 1.98) {
  const c = PLAN_CROP[regionMeta(regionId).slug] || PLAN_CROP['foyer'];
  let w = Math.min(c.w, MASTER.w);
  let h = Math.min(w / aspect, MASTER.h);
  w = Math.min(w, h * aspect);
  // stay clear of the master sheet's own ornamental border
  const bx = Math.min(88, (MASTER.w - w) / 2), by = Math.min(74, (MASTER.h - h) / 2);
  const sx = clamp(c.cx - w / 2, bx, MASTER.w - w - bx);
  const sy = clamp(c.cy - h / 2, by, MASTER.h - h - by);
  return { url: MASTER.url, sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(w), sh: Math.round(h) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node vocabulary — the words and one-line promises the player reads on hover.
// ─────────────────────────────────────────────────────────────────────────────
export const NODE_INFO = {
  [NodeType.SCUFFLE]:   { label: 'Scuffle',     blurb: 'Something in this room does not want you here.',            reward: 'Lost Things · a Trick to learn' },
  [NodeType.BIG_SCARE]: { label: 'Big Scare',   blurb: 'A named horror holds this room. Harder, and worth it.',      reward: 'A Keepsake · more Lost Things' },
  [NodeType.BOSS]:      { label: 'Boss',        blurb: 'The keeper of this wing. The way onward is behind it.',       reward: 'A Boss Keepsake · the next region' },
  [NodeType.SAFE]:      { label: 'Safe Room',   blurb: 'Barricade the door, drag the table over, hang the blankets.', reward: 'Rest · upgrade a Trick · talk' },
  [NodeType.SHOP]:      { label: 'Lost Things', blurb: 'Mr. Moth trades in buttons, keys and things people dropped.', reward: 'Spend Lost Things' },
  [NodeType.CURIOSITY]: { label: 'Curiosity',   blurb: 'The house is doing something odd in here. Your call.',        reward: 'Unknown · sometimes a Clue' },
  [NodeType.TREASURE]:  { label: 'Treasure',    blurb: 'Something worth carrying out has been left behind.',          reward: 'A Keepsake' },
  [NodeType.RESCUE]:    { label: 'Rescue',      blurb: 'A Companion is trapped in here. It has been a long time.',    reward: 'Free a Menagerie Companion' },
  [NodeType.UNKNOWN]:   { label: 'Unsurveyed',  blurb: 'The blueprint is water-damaged here. Nobody drew this room.', reward: 'You will find out' },
};

/** Which scene a node hands off to. run.js may override. */
export function sceneForNode(node) {
  switch (node?.type) {
    case NodeType.SAFE:      return 'rest';
    case NodeType.SHOP:      return 'shop';
    case NodeType.TREASURE:  return 'reward';
    case NodeType.CURIOSITY:
    case NodeType.RESCUE:
    case NodeType.UNKNOWN:   return 'event';
    default:                 return 'combat';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environmental hazards — StS2's contribution to map decisions.
//
// A hazard occupies a WING: a contiguous block of rows x columns.  Every node
// inside inherits it.  Generation guarantees each wing is avoidable, so walking
// into one is always a choice you made.  Two of the eight are boons, so the
// player is sometimes routing *towards* a condition, not only away from one.
// ─────────────────────────────────────────────────────────────────────────────
export const HAZARDS = [
  { id: 'lights-out',   kind: 'hazard', name: 'The Lights Are Out',
    rule: 'Enemies here start every Scuffle with 2 Unseen. You cannot read an intent until Unseen breaks.',
    note: 'sconces dry · no gas to this wing', glyph: 'lamp' },
  { id: 'sagging',      kind: 'hazard', name: 'The Floor Sags',
    rule: 'Entering any room in this wing costs 3 Courage. The boards remember your weight.',
    note: 'joists unsound — do not crowd', glyph: 'beam' },
  { id: 'dust-sheets',  kind: 'hazard', name: 'Under Dust Sheets',
    rule: 'Enemy intents are hidden on the first turn of every Scuffle in this wing.',
    note: 'furniture covered · room closed', glyph: 'sheet' },
  { id: 'cold-draught', kind: 'hazard', name: 'A Cold Draught',
    rule: 'You begin every Scuffle here with 2 Chill: your first Trick each turn costs 1 more Nerve.',
    note: 'window sashes never seated', glyph: 'draught' },
  { id: 'pipes',        kind: 'hazard', name: 'The Pipes Rattle',
    rule: 'Noise carries. Every Scuffle in this wing brings one extra small enemy.',
    note: 'service risers pass behind', glyph: 'pipe' },
  { id: 'long-shadows', kind: 'hazard', name: 'Long Shadows',
    rule: 'Guard is halved at the start of each of your turns while you are in this wing.',
    note: 'no daylight reaches these rooms', glyph: 'shadow' },
  { id: 'moonlit',      kind: 'boon',   name: 'Moonlit Wing',
    rule: 'Moonlight through the roof lights. Leaving this wing restores 8 Courage.',
    note: 'glazed roof · full moon aspect', glyph: 'moon' },
  { id: 'paw-prints',   kind: 'boon',   name: 'Fresh Paw Prints',
    rule: 'A trail runs through here. Every room in this wing also yields a Clue for your Kid.',
    note: 'tracks logged, not yet followed', glyph: 'paw' },
];

const HAZARD_BY_ID = Object.fromEntries(HAZARDS.map(h => [h.id, h]));
export function hazardById(id) { return HAZARD_BY_ID[id] || null; }

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const key = (r, c) => `${r}:${c}`;

/**
 * @param {string} regionId  slug from REGION_ORDER
 * @param {number|string} seed
 * @param {{hauntLevel?:number, companion?:string, rescued?:string[]}} [opts]
 * @returns {{regionId,seed,rows,lanes,nodes,edges,bossId,startIds,hazards,meta}}
 */
export function generateRegionMap(regionId, seed = 1, opts = {}) {
  const { hauntLevel = 0, companion = null, rescued = [] } = opts;
  const meta = regionMeta(regionId);
  regionId = meta.slug;
  const rng = new RNG(hashSeed(`mm-map-v1|${regionId}|${seed}|${hauntLevel}`));

  const rows  = meta.rows;                 // includes the boss row
  const lanes = meta.lanes;
  const lastWalk = rows - 2;               // last row of ordinary rooms
  const bossRow  = rows - 1;

  // ── 1. Carve paths ────────────────────────────────────────────────────────
  const grid = new Map();                            // "r:c" -> node
  const rowEdges = Array.from({ length: rows }, () => []); // per-row [{from,to}]

  const node = (r, c) => {
    const k = key(r, c);
    let n = grid.get(k);
    if (!n) {
      n = { id: `${regionId}-${r}-${c}`, row: r, col: c, type: null, next: [], prev: [] };
      grid.set(k, n);
    }
    return n;
  };
  /** Two edges in the same row cross if their endpoints invert. */
  const crosses = (r, from, to) => rowEdges[r].some(e =>
    (e.from < from && e.to > to) || (e.from > from && e.to < to));

  const link = (r, from, to) => {
    if (!rowEdges[r].some(e => e.from === from && e.to === to)) rowEdges[r].push({ from, to });
    const a = node(r, from), b = node(r + 1, to);
    if (!a.next.includes(b.id)) a.next.push(b.id);
    if (!b.prev.includes(a.id)) b.prev.push(a.id);
  };

  const walks = lanes + 1;
  const starts = [];
  for (let i = 0; i < walks; i++) starts.push(rng.int(lanes));
  if (new Set(starts).size < 2) starts[0] = (starts[1] + 1) % lanes;   // never one-lane

  for (const s of starts) {
    let c = s;
    node(0, c);
    for (let r = 0; r < lastWalk; r++) {
      const cand = [c - 1, c, c + 1]
        .filter(nc => nc >= 0 && nc < lanes)
        .filter(nc => !crosses(r, c, nc));
      if (!cand.length) { link(r, c, c); continue; }
      // Bias: keep spreading while the map is young, converge near the boss.
      const converge = r / lastWalk;
      const weights = cand.map(nc => {
        const pull = nc === c ? 1.0 : 0.72;
        const centre = 1 - Math.abs((nc + 0.5) / lanes - 0.5) * 2;   // 0..1
        return pull * (1 + converge * centre * 1.4);
      });
      let t = weights.reduce((a, b) => a + b, 0) * rng.next();
      let pick = cand[cand.length - 1];
      for (let i = 0; i < cand.length; i++) { t -= weights[i]; if (t <= 0) { pick = cand[i]; break; } }
      link(r, c, pick);
      c = pick;
    }
  }

  // Boss node, fed by every node on the last walked row.
  const boss = { id: `${regionId}-boss`, row: bossRow, col: (lanes - 1) / 2, type: NodeType.BOSS, next: [], prev: [] };
  grid.set(key(bossRow, 'boss'), boss);
  for (const n of [...grid.values()]) {
    if (n.row === lastWalk && n !== boss) { n.next = [boss.id]; boss.prev.push(n.id); }
  }

  const all = [...grid.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const byId = Object.fromEntries(all.map(n => [n.id, n]));
  const rowsOf = Array.from({ length: rows }, (_, r) => all.filter(n => n.row === r));

  // ── 2. Assign node types ──────────────────────────────────────────────────
  for (const n of rowsOf[0]) n.type = NodeType.SCUFFLE;
  if (rowsOf[1]) for (const n of rowsOf[1]) n.type = NodeType.SCUFFLE;

  const open = all.filter(n => !n.type);
  const n0 = open.length;
  const wantRescue = !!(companion === null || !rescued.includes(meta.companion)) && !!meta.companion;

  const quota = {
    [NodeType.BIG_SCARE]: clamp(Math.round(n0 * 0.13) + (hauntLevel >= 3 ? 1 : 0), 3, 6),
    [NodeType.SAFE]:      clamp(Math.round(n0 * 0.11), 3, 5),
    [NodeType.SHOP]:      n0 >= 34 ? 2 : 1,
    [NodeType.TREASURE]:  2,
    [NodeType.RESCUE]:    wantRescue ? 1 : 0,
    [NodeType.UNKNOWN]:   clamp(Math.round(n0 * 0.09), 2, 4),
    [NodeType.CURIOSITY]: clamp(Math.round(n0 * 0.18), 4, 7),
  };

  const adjacentTypes = (n) => {
    const out = new Set();
    for (const id of n.next) if (byId[id]?.type) out.add(byId[id].type);
    for (const id of n.prev) if (byId[id]?.type) out.add(byId[id].type);
    return out;
  };
  const sameRowNeighbourTypes = (n) => {
    const set = new Set();
    for (const o of rowsOf[n.row]) if (o !== n && Math.abs(o.col - n.col) <= 1 && o.type) set.add(o.type);
    return set;
  };

  const rules = {
    // Big Scares only from row 5 (index 4), never touching another Big Scare.
    [NodeType.BIG_SCARE]: (n) => n.row >= 4
      && !adjacentTypes(n).has(NodeType.BIG_SCARE)
      && !sameRowNeighbourTypes(n).has(NodeType.BIG_SCARE),
    // Never two Safe Rooms in a row (along a path or side by side); never on the
    // row before the boss, and never on row 14 whichever way you count it.
    [NodeType.SAFE]: (n) => n.row >= 4 && n.row !== lastWalk && n.row !== 13 && (n.row + 1) !== 14
      && !adjacentTypes(n).has(NodeType.SAFE)
      && !sameRowNeighbourTypes(n).has(NodeType.SAFE),
    [NodeType.SHOP]: (n) => n.row >= 3 && n.row !== lastWalk
      && !adjacentTypes(n).has(NodeType.SHOP) && !sameRowNeighbourTypes(n).has(NodeType.SHOP),
    [NodeType.TREASURE]: (n) => n.row >= 3
      && !adjacentTypes(n).has(NodeType.TREASURE) && !sameRowNeighbourTypes(n).has(NodeType.TREASURE),
    // The trapped Companion sits mid-depth and off the trunk: a detour you take.
    [NodeType.RESCUE]: (n) => n.row >= 4 && n.row <= rows - 4 && rowsOf[n.row].length >= 2,
    [NodeType.UNKNOWN]: (n) => n.row >= 2 && n.row !== lastWalk,
    [NodeType.CURIOSITY]: (n) => n.row >= 2,
  };

  // A Safe Room on the last legal row before the boss: likely, never certain.
  // (Only the paths that happen to run through it get the rest — which is the
  // decision.  StS guarantees this; we deliberately do not.)
  if (quota[NodeType.SAFE] > 0 && rng.chance(0.80)) {
    const lastSafeRow = rowsOf[lastWalk - 1] || [];
    const cand = rng.shuffle(lastSafeRow.filter(n => !n.type));
    for (const n of cand) {
      if (n.row !== 13 && (n.row + 1) !== 14) { n.type = NodeType.SAFE; quota[NodeType.SAFE]--; break; }
    }
  }

  // Place scarce, heavily-constrained types first.
  const order = [NodeType.RESCUE, NodeType.BIG_SCARE, NodeType.SAFE, NodeType.TREASURE,
                 NodeType.SHOP, NodeType.UNKNOWN, NodeType.CURIOSITY];
  for (const type of order) {
    let need = quota[type] || 0;
    if (!need) continue;
    // Deeper rows first for Big Scares, spread evenly for everything else.
    const pool = rng.shuffle(open.filter(n => !n.type));
    if (type === NodeType.BIG_SCARE) pool.sort((a, b) => b.row - a.row);
    if (type === NodeType.TREASURE)  pool.sort((a, b) => Math.abs(a.row - rows * 0.55) - Math.abs(b.row - rows * 0.55));
    for (const n of pool) {
      if (need <= 0) break;
      if (rules[type](n)) { n.type = type; need--; }
    }
  }
  for (const n of open) if (!n.type) n.type = NodeType.SCUFFLE;

  // ── 3. Positions on the blueprint (0..1) ─────────────────────────────────
  // Depth runs LEFT → RIGHT across the wing: you come in off the west edge and
  // the boss holds the far end.  That is how the design doc describes every
  // region's circulation, and on a landscape floorplan it keeps the route
  // edges short and diagonal instead of stretching into a horizontal web.
  // The lane band is deliberately narrower than the sheet: it keeps a route
  // step and a lane change roughly the same distance apart, which is what makes
  // a Slay the Spire map readable instead of a cat's cradle.
  const padD = 0.105, spanD = 0.800;       // along depth  (x)
  const laneMid = 0.455, spanL = 0.600;    // across lanes (y)
  const padL = laneMid - spanL / 2;
  const jd = (spanD / rows) * 0.30;
  const jl = (spanL / Math.max(1, lanes - 1)) * 0.24;
  for (const n of all) {
    const d = n.row / (rows - 1);
    const l = lanes > 1 ? n.col / (lanes - 1) : 0.5;
    n.x = padD + d * spanD;
    n.y = padL + l * spanL;
    if (n.type !== NodeType.BOSS) {
      n.x += (rng.next() - 0.5) * 2 * jd;
      n.y += (rng.next() - 0.5) * 2 * jl;
    } else { n.y = laneMid; }
    n.x = clamp(n.x, 0.075, 0.935);
    n.y = clamp(n.y, 0.105, 0.805);
  }

  // ── 4. Authored room names, matched to node type ─────────────────────────
  assignRoomNames(regionId, all, boss, rng, lanes, rows);

  // ── 5. Hazard wings ───────────────────────────────────────────────────────
  const hazards = placeHazards(rng, all, rowsOf, byId, boss, rows, lanes, lastWalk, hauntLevel);

  // ── 6. Payloads + edge list ───────────────────────────────────────────────
  const edges = [];
  for (const n of all) {
    n.visited = false;
    n.payload = {
      region: regionId,
      depth: n.row,
      tier: n.row < 4 ? 'early' : n.row < rows - 5 ? 'mid' : 'late',
      roomTag: n.roomTag,
      hazard: n.hazard || null,
      scene: sceneForNode(n),
    };
    if (n.type === NodeType.RESCUE) n.payload.companion = meta.companion;
    if (n.type === NodeType.BOSS)   n.payload.boss = meta.boss;
    delete n.prev;                                  // `next` is the schema contract
    for (const id of n.next) edges.push({ from: n.id, to: id });
  }

  return {
    regionId, seed, rows, lanes,
    nodes: all,
    edges,
    bossId: boss.id,
    startIds: rowsOf[0].map(n => n.id),
    hazards,
    meta,
  };
}

// ── room naming ──────────────────────────────────────────────────────────────
const PREFERRED = {
  [NodeType.SCUFFLE]:   ['sc', 'cn', 'cu'],
  [NodeType.BIG_SCARE]: ['bs', 'sc', 'cn'],
  [NodeType.SAFE]:      ['bf', 'cu', 'cn'],
  [NodeType.SHOP]:      ['mk', 'se', 'cu'],
  [NodeType.TREASURE]:  ['tr', 'se', 'cl'],
  [NodeType.CURIOSITY]: ['cu', 'cl', 'cn'],
  [NodeType.RESCUE]:    ['cl', 'se', 'cu'],
  [NodeType.UNKNOWN]:   ['se', 'cn', 'cl'],
  [NodeType.BOSS]:      ['bo'],
};

function assignRoomNames(regionId, all, boss, rng, lanes, rows) {
  const rooms = ROOMS[regionId] || ROOMS['foyer'];
  const pools = {};
  for (const t of ['sc','bs','cu','cl','se','tr','bf','mk','cn','bo','st']) {
    pools[t] = rng.shuffle(rooms.filter(r => r.tag === t));
  }
  const uses = new Map();      // room name -> times used
  const taken = new Set();     // final display names

  const qualifier = (n, i) => {
    const west = n.col < (lanes - 1) / 2;
    const lower = n.row < rows / 2;
    const list = [
      '',
      west ? ' — West' : ' — East',
      lower ? ' — Lower' : ' — Upper',
      ' — Far End',
      ' — Back',
      west ? ' — North' : ' — South',
    ];
    return list[Math.min(i, list.length - 1)];
  };

  for (const n of all) {
    const prefs = PREFERRED[n.type] || ['sc'];
    let room = null;
    for (const tag of prefs) {
      const pool = pools[tag];
      if (!pool || !pool.length) continue;
      // least-used entry in this pool, stable order
      room = pool.reduce((best, r) =>
        (uses.get(r.name) || 0) < (uses.get(best.name) || 0) ? r : best, pool[0]);
      break;
    }
    if (!room) room = rooms[0];
    const u = uses.get(room.name) || 0;
    uses.set(room.name, u + 1);
    let display = room.name + qualifier(n, u);
    let bump = u;
    while (taken.has(display) && bump < 8) display = room.name + qualifier(n, ++bump);
    taken.add(display);
    n.roomName = display;
    n.roomTag = room.tag;
  }
  boss.roomName = (ROOMS[regionId] || ROOMS['foyer']).find(r => r.tag === 'bo')?.name || 'Boss Room';
  boss.roomTag = 'bo';
}

// ── hazard wings ─────────────────────────────────────────────────────────────
function placeHazards(rng, all, rowsOf, byId, boss, rows, lanes, lastWalk, hauntLevel) {
  const count = clamp(2 + (rows >= 14 ? 1 : 0) + (hauntLevel >= 2 ? 1 : 0), 2, 4);
  const bag = rng.shuffle(HAZARDS.filter(h => h.kind === 'hazard'));
  const boons = rng.shuffle(HAZARDS.filter(h => h.kind === 'boon'));
  const chosen = [];
  for (let i = 0; i < count; i++) {
    if (i === 1 && boons.length) chosen.push(boons.pop());     // exactly one boon, mid-list
    else if (bag.length) chosen.push(bag.pop());
  }

  const usedRows = new Set();
  const out = [];

  /** Can you still reach the boss without entering `blocked`? */
  const reachable = (blocked) => {
    const seen = new Set();
    const q = rowsOf[0].filter(n => !blocked.has(n.id)).map(n => n.id);
    q.forEach(id => seen.add(id));
    while (q.length) {
      const n = byId[q.shift()] || (boss.id === q[0] ? boss : null);
      const cur = n || boss;
      if (!cur) continue;
      for (const id of cur.next || []) {
        if (id === boss.id) return true;
        if (blocked.has(id) || seen.has(id)) continue;
        seen.add(id); q.push(id);
      }
    }
    return false;
  };

  for (const h of chosen) {
    let placed = null;
    for (let attempt = 0; attempt < 26 && !placed; attempt++) {
      const span = rng.range(2, 3);
      const r0 = rng.range(2, Math.max(2, lastWalk - span));
      const r1 = Math.min(r0 + span - 1, lastWalk);
      let clash = false;
      for (let r = r0; r <= r1; r++) if (usedRows.has(r)) clash = true;
      if (clash) continue;

      // At most half the wing wide, so there is always a lane around it.
      const width = clamp(rng.range(1, Math.ceil(lanes / 2)), 1, Math.max(1, lanes - 1));
      const c0 = rng.int(lanes - width + 1);
      const c1 = c0 + width - 1;

      const members = all.filter(n => n.type !== NodeType.BOSS &&
        n.row >= r0 && n.row <= r1 && n.col >= c0 && n.col <= c1);
      if (members.length < 2) continue;
      // Avoidable, or it is not a decision.
      if (!reachable(new Set(members.map(n => n.id)))) continue;

      for (let r = r0; r <= r1; r++) usedRows.add(r);
      for (const n of members) n.hazard = h.id;
      const xs = members.map(n => n.x), ys = members.map(n => n.y);
      placed = {
        ...h,
        rows: [r0, r1], cols: [c0, c1],
        nodeIds: members.map(n => n.id),
        rect: {
          x0: clamp(Math.min(...xs) - 0.075, 0.012, 0.98),
          x1: clamp(Math.max(...xs) + 0.075, 0.02, 0.988),
          y0: clamp(Math.min(...ys) - 0.045, 0.012, 0.98),
          y1: clamp(Math.max(...ys) + 0.045, 0.02, 0.988),
        },
      };
    }
    if (placed) out.push(placed);
  }
  return out.sort((a, b) => a.rows[0] - b.rows[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Traversal helpers — run.js is welcome to use these instead of reimplementing.
// ─────────────────────────────────────────────────────────────────────────────
/** Node ids the player may legally move to right now. */
export function legalNextIds(map, currentId) {
  if (!map) return [];
  if (!currentId) return map.startIds.slice();
  const cur = map.nodes.find(n => n.id === currentId);
  return cur ? cur.next.slice() : [];
}

/** Every node that is still reachable from here (for the dimming pass). */
export function reachableFrom(map, currentId) {
  const out = new Set();
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  const seeds = currentId ? [currentId] : map.startIds;
  const q = [...seeds];
  while (q.length) {
    const n = byId.get(q.shift());
    if (!n) continue;
    for (const id of n.next) if (!out.has(id)) { out.add(id); q.push(id); }
  }
  return out;
}
