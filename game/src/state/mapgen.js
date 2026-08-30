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
  M('foyer','The Forgotten Foyer','The Butler','marmalade',1,6,13,'Formal entrance block · symmetrical about a central axis'),
  M('nursery','The Forgotten Nursery','The Governess','mopsy',2,6,13,'Compact suite around two communal play spaces'),
  M('sleeping-quarters','The Sleeping Quarters','The Bedframe Beast','boggle',3,5,14,'Long residential corridor · bedrooms both sides'),
  M('kitchens-cellars','The Kitchens and Cellars','The Confectioner','taffy',4,6,14,'Service complex above · older cellars below'),
  M('greenhouse','The Impossible Greenhouse','The Head Gardener','brambleboo',5,6,13,'Branching glass complex beyond the exterior wall'),
  M('graveyard','The Mansion Graveyard','The Groundskeeper of Names','pudding',6,6,14,'Irregular ring of burial paths'),
  M('study-library','The Grand Study and Library','The Archivist','crinkle',7,6,14,'Asymmetrical library wing · several expansions'),
  M('attic-observatory','The Moonlit Attic and Observatory','The Watcher in the Rafters','wink',8,6,14,'Attic chambers climbing to a tower'),
  M('lampworks','The Lampworks','The Lamplighter','wisp',9,5,15,'Narrow vertical shaft · maintenance floors'),
  M('ballroom','The Ballroom and Velvet Suites','The Master of Revels','crumbula',10,6,14,'Formal entertainment wing · strict symmetry'),
  M('crypt','The Crypt and Ossuary','The Bone Curator','bones',11,6,14,'Subterranean radial complex'),
  M('hedge-maze','The Withered Hedge Maze','The Gardener of Rot','truffle',12,6,15,'Exterior maze · the paths are the rooms'),
  M('secret-passages','The Secret Passages','The Whisper Warden','hush',13,5,15,'Thin circulation network inside the walls'),
  M('bathhouse','The Bathhouse and Rain Wing','The Drowned Matron','drizzle',14,5,14,'Crescent wing around an indoor pool'),
  M('kennels','The Kennels and Animal Ward','The Kennelmaster','mossbit',15,6,14,'Animal care wing around an exercise yard'),
  M('pumpkin-grounds','The Moon Courtyard and Pumpkin Grounds','The Harvest King','pipkin',16,6,15,'Enclosed grounds · ponds, patches and paths'),
  M('heart','The Heart of the House','The Heart','',17,6,15,'Impossible interior · a plan folded into an organ'),
].map(m => [m.slug, m]));

export function regionMeta(regionId) {
  return REGIONS[regionId] || REGIONS['foyer'];
}
export function blueprintSectionUrl(regionId) {
  return `assets/blueprint/section${String(sectionNo(regionId)).padStart(2, '0')}.png`;
}
/** The traced vector plan for a section — see tools/blueprint_trace.py. */
export function blueprintTraceUrl(regionId) {
  return `assets/blueprint/section${String(sectionNo(regionId)).padStart(2, '0')}.plan.json`;
}
function sectionNo(regionId) { return regionMeta(regionId).section; }

/**
 * Pixel size of each of the seventeen section drawings.  Recorded here rather
 * than read off the decoded image because the sheet has to be FRAMED before the
 * PNG lands, and because the aspect ratios vary enormously — 713x237 for the
 * glass complex, 165x470 for the bathhouse — and the framing decision below
 * needs them all at once.
 */
export const SECTION_PX = [null,
  { w: 273, h: 195 }, { w: 273, h: 292 }, { w: 312, h: 250 }, { w: 301, h: 287 },
  { w: 713, h: 237 }, { w: 278, h: 237 }, { w: 291, h: 266 }, { w: 392, h: 169 },
  { w: 410, h: 396 }, { w: 419, h: 285 }, { w: 243, h: 340 }, { w: 363, h: 255 },
  { w: 230, h: 570 }, { w: 165, h: 470 }, { w: 220, h: 370 }, { w: 274, h: 539 },
  { w: 243, h: 380 },
];

/**
 * How this wing's sheet frames its own section drawing.
 *
 * Six of the seventeen wings are drawn TALL — the bathhouse is 165x470, the
 * secret passages 230x570 — and the plan window on a 16:9 sheet is 2.4:1.
 * Cover-fitting a 0.35 plan into a 2.4 window shows a seventh of the wing;
 * contain-fitting it leaves five sixths of the paper blank.  Neither is a
 * survey of that wing.
 *
 * So the sheet turns the plan, the way a real drawing does when the building
 * does not suit the paper — and says so, with the compass rose turned to match.
 * The bathhouse then reads 470x165: 90% of the wing on the sheet instead of
 * 15% of it, at 4.9x instead of 11.8x.  `rot` is computed, not authored, so
 * the framing follows the window if the window ever changes.
 *
 * The margin exists because turning the sheet is a real cost to the reader: a
 * wing only turns when turning is clearly better, never when it is a coin toss.
 */
export function blueprintSection(regionId, aspect = 2.43) {
  const n = sectionNo(regionId);
  const s = SECTION_PX[n] || SECTION_PX[1];
  const miss = (a) => Math.abs(Math.log(a / aspect));
  const rot = miss(s.h / s.w) + 0.25 < miss(s.w / s.h);
  return {
    n, rot,
    url: blueprintSectionUrl(regionId),
    traceUrl: blueprintTraceUrl(regionId),
    w: s.w, h: s.h,
    // what the sheet actually has to fit
    pw: rot ? s.h : s.w,
    ph: rot ? s.w : s.h,
  };
}

/**
 * Where each region sits on the master estate drawing (1448 x 1086).
 * Centres were recovered by matching each cut-out section against the master.
 * The MAP no longer reads this — every wing is drawn from its own section via
 * `blueprintSection` — but the run-end sheet (`scenes/gameover.js`, owned by
 * meta-run) shows the estate as a whole and still crops here.
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
  // The node is "Mr. Moth's" and the currency is "Lost Things".  The key used to
  // call the node "Lost Things" too, so the legend, the shop sign and the wallet
  // were three different things wearing one name.
  [NodeType.SHOP]:      { label: "Mr. Moth's",  blurb: 'Mr. Moth trades in buttons, keys and things people dropped.', reward: 'Spend Lost Things' },
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
//
// A NOTE ON THE WORD "WING".  These rules used to say "any room in this wing",
// while the banner over the sheet says "Wing 1 of 17" meaning the whole region.
// One word, two scopes, and a playtester read "The Floor Sags — entering any
// room in this wing costs 3 Courage" as a tax on the entire Foyer, then found
// only a handful of rooms carrying `data-hazard="sagging"` and concluded the
// tooltip was lying.  It was not; it was ambiguous, which on a rules screen is
// the same thing.  The region keeps "wing" (the banner, the HUD, gameover and
// run.js all use it).  A hazard now occupies a **marked area** — which is also
// what it looks like: a hatched, bounded region of the plan with a keyed
// roundel, exactly the way a real survey flags a condition.
export const HAZARDS = [
  { id: 'lights-out',   kind: 'hazard', name: 'The Lights Are Out',
    rule: 'Enemies inside the marked area start every Scuffle with 2 Lurking. You cannot read an intent until Lurking breaks.',
    note: 'sconces dry · no gas to these rooms', glyph: 'lamp' },
  { id: 'sagging',      kind: 'hazard', name: 'The Floor Sags',
    rule: 'Entering any room inside the marked area costs 3 Courage. The boards remember your weight.',
    note: 'joists unsound — do not crowd', glyph: 'beam' },
  { id: 'dust-sheets',  kind: 'hazard', name: 'Under Dust Sheets',
    rule: 'Enemy intents are hidden on the first turn of every Scuffle inside the marked area.',
    note: 'furniture covered · rooms closed', glyph: 'sheet' },
  { id: 'cold-draught', kind: 'hazard', name: 'A Cold Draught',
    rule: 'You begin every Scuffle inside the marked area with 2 Chill: your first Trick each turn costs 1 more Nerve.',
    note: 'window sashes never seated', glyph: 'draught' },
  { id: 'pipes',        kind: 'hazard', name: 'The Pipes Rattle',
    rule: 'Noise carries. Every Scuffle inside the marked area brings one extra small enemy.',
    note: 'service risers pass behind', glyph: 'pipe' },
  // The rule used to read "Guard is halved at the start of each of your
  // turns". Guard is already WIPED at the start of every player turn
  // (`_beginPlayerTurn` step 2), so halving it there is a no-op — and a
  // hazard that does nothing is the one thing it cannot be. Reworded to the
  // threat it was plainly reaching for, and implemented in `data/wings.js`.
  // Confirmed by the designer 2026-08-29, along with the Lurking rename above.
  { id: 'long-shadows', kind: 'hazard', name: 'Long Shadows',
    rule: 'Guard you gain is halved while you are inside the marked area. Your defence is worth less in the dark.',
    note: 'no daylight reaches these rooms', glyph: 'shadow' },
  { id: 'moonlit',      kind: 'boon',   name: 'Moonlit Rooms',
    rule: 'Moonlight through the roof lights. Leaving the marked area restores 8 Courage.',
    note: 'glazed roof · full moon aspect', glyph: 'moon' },
  { id: 'paw-prints',   kind: 'boon',   name: 'Fresh Paw Prints',
    rule: 'A trail runs through here. Every room inside the marked area also yields a Clue for your Kid.',
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

  // -- 1. Carve paths ---------------------------------------------------------
  //
  // Two facts drive this whole pass.
  //
  //  (a) Between two consecutive rows of width m and n, the largest set of
  //      edges you can draw WITHOUT one crossing another is exactly m+n-1 - a
  //      monotone staircase and not one edge more.  So the mean number of exits
  //      per room in a crossing-free layered plan can never exceed 2 - 1/width,
  //      and the number of rooms forced onto a single exit can never fall below
  //      max(0, m-n+1) per band.  Those are theorems, not tuning knobs.
  //  (b) A greedy "add any edge that fits" pass gets nowhere near either bound,
  //      because one badly-placed early edge can wall a room off from every
  //      target to its right for good.
  //
  // So: the random walks decide only the SHAPE of the wing - which rooms exist
  // on which row.  The edges are then laid down as the canonical maximal
  // staircase for each band, which hits (a) exactly.  Long passages that skip a
  // row are the one legal way past that ceiling, and go on top.
  const grid = new Map();                            // "r:c" -> node

  const node = (r, c) => {
    const k = key(r, c);
    let n = grid.get(k);
    if (!n) {
      n = { id: `${regionId}-${r}-${c}`, row: r, col: c, type: null, next: [], prev: [] };
      grid.set(k, n);
    }
    return n;
  };
  const has  = (r, c) => grid.has(key(r, c));
  const at   = (r) => [...grid.values()].filter(n => n.row === r);
  const cols = (r) => at(r).map(n => n.col).sort((a, b) => a - b);

  // 1a. Random walks lay out the wing's footprint: an irregular, organic set of
  //     occupied lanes per row rather than a solid block.
  const walks = lanes + 2;
  for (let w = 0; w < walks; w++) {
    let c = rng.int(lanes);
    node(0, c);
    for (let r = 0; r < lastWalk; r++) {
      const converge = r / lastWalk;
      const cand = [c - 1, c, c + 1].filter(nc => nc >= 0 && nc < lanes);
      const weights = cand.map(nc => {
        const pull = nc === c ? 1.0 : 0.86;
        const centre = 1 - Math.abs((nc + 0.5) / lanes - 0.5) * 2;   // 0..1
        return pull * (1 + converge * centre * 1.4);
      });
      let t = weights.reduce((a, b) => a + b, 0) * rng.next();
      let pick = cand[cand.length - 1];
      for (let i = 0; i < cand.length; i++) { t -= weights[i]; if (t <= 0) { pick = cand[i]; break; } }
      node(r + 1, pick);
      c = pick;
    }
  }

  // 1b. Widen the footprint into a bulge - narrow at the door, widest through
  //     the middle, closing again towards the boss.  A band whose next row is
  //     no wider than itself is FORCED to leave a room on a single exit, so the
  //     wing holds its width for as long as the plan can afford to.
  const wantAt = (r) => {
    // The boss's door.  Three, so the trim below leaves four: narrowing it
    // further to three would make the band into it 3 -> 3, and by the theorem
    // above that FORCES a single-exit room where there was none (measured:
    // single-exit rooms 19.7% -> 21.8% across 24 sheets).  Four ways to the
    // boss, every one of them the guaranteed Safe Room.
    if (r === lastWalk) return 3;
    if (r >= lastWalk - 1) return 2;
    if (r === 0) return 3;
    if (r === lastWalk - 2) return 3;
    return clamp(Math.min(lanes, 2 + r) - (rng.chance(0.22) ? 1 : 0), 3, lanes);
  };
  for (let r = 0; r <= lastWalk; r++) {
    const want = Math.min(lanes, wantAt(r));
    for (let guard = 0; cols(r).length < want && guard < lanes + 2; guard++) {
      const present = new Set(cols(r));
      const free = [...Array(lanes).keys()].filter(c => !present.has(c));
      if (!free.length) break;
      // Prefer a lane touching one already in use: rows read as a band, not a
      // scatter, and the staircase between two bands stays short and diagonal.
      const touching = free.filter(c => present.has(c - 1) || present.has(c + 1));
      node(r, rng.pick(touching.length ? touching : free));
    }
  }
  // Trim any row the walks left wider than the plan wants, from the edges in.
  // `lastWalk` is included: it was not, and `wantAt` asks for 2 there, so the
  // wing never actually closed towards the boss — the walks left a mean of 4.5
  // rooms on the last row, all of them feeding the boss.  That is both wrong on
  // the sheet (a wing that fans OUT at its far end) and expensive now that the
  // whole row is the guaranteed Safe Room.
  for (let r = 1; r <= lastWalk; r++) {
    const want = Math.min(lanes, wantAt(r));
    let cs = cols(r);
    while (cs.length > want + 1) {
      const drop = cs[0] <= (lanes - 1 - cs[cs.length - 1]) ? cs[0] : cs[cs.length - 1];
      grid.delete(key(r, drop));
      cs = cols(r);
    }
  }

  // 1c. The staircase.  Walk both rows in rank order, always advancing whichever
  //     side is further behind: that is the unique maximal crossing-free edge set
  //     between two ordered rows, and it spreads exits as evenly as the widths
  //     allow, which is what holds single-exit rooms down at their floor.
  const linkIds = (a, b) => {
    if (!a.next.includes(b.id)) a.next.push(b.id);
    if (!b.prev.includes(a.id)) b.prev.push(a.id);
  };
  const REACH = 4;                       // no room reaches a lane four away
  for (let r = 0; r < lastWalk; r++) {
    const S = cols(r), T = cols(r + 1);
    if (!S.length || !T.length) continue;
    let pairs = [];
    let i = 0, j = 0;
    while (i < S.length && j < T.length) {
      pairs.push([S[i], T[j]]);
      if (i === S.length - 1) j++;
      else if (j === T.length - 1) i++;
      else if ((i + 1) / S.length <= (j + 1) / T.length) i++;
      else j++;
    }
    // Thin for character: a plan where every room has exactly two exits is a
    // lattice, not a house.  Never strand a room on either side of the band.
    const outDeg = new Map(), inDeg = new Map();
    for (const [a, b] of pairs) {
      outDeg.set(a, (outDeg.get(a) || 0) + 1);
      inDeg.set(b, (inDeg.get(b) || 0) + 1);
    }
    for (const [a, b] of rng.shuffle(pairs.slice())) {
      const far = Math.abs(a - b) > REACH;
      if (!far) continue;
      if (outDeg.get(a) <= 1 || inDeg.get(b) <= 1) continue;
      outDeg.set(a, outDeg.get(a) - 1); inDeg.set(b, inDeg.get(b) - 1);
      pairs = pairs.filter(p => !(p[0] === a && p[1] === b));
    }
    for (const [a, b] of pairs) linkIds(node(r, a), node(r + 1, b));
  }

  // 1d. Long passages.  The staircase is now provably maximal, so the ONLY way
  //     to give a room another exit without drawing a crossing is a corridor
  //     that skips a row: straight down an empty lane from row r to row r+2.
  //     That cannot cross anything when the lane is empty at r+1 and no edge in
  //     either band straddles it - and on the sheet it reads as exactly what it
  //     is, a long service passage that misses a room out.
  const bandEdges = Array.from({ length: rows + 1 }, () => []);
  {
    const byNodeId = new Map([...grid.values()].map(n => [n.id, n]));
    for (const n of grid.values()) for (const id of n.next) {
      const b = byNodeId.get(id);
      if (b && b.row === n.row + 1) bandEdges[n.row].push([n.col, b.col]);
    }
  }
  const straddles = (r, c) => bandEdges[r].some(([a, b]) =>
    (a < c && b > c) || (a > c && b < c));
  const taken = new Set();
  const OUT_CAP = 3;
  const trySkip = (r, a) => {
    const c = a.col;
    if (r + 2 > lastWalk || a.next.length >= OUT_CAP) return false;
    if (has(r + 1, c) || !has(r + 2, c)) return false;
    if (straddles(r, c) || straddles(r + 1, c)) return false;
    if (taken.has(`${r - 1}:${c}`) || taken.has(`${r + 1}:${c}`)) return false;
    const b = node(r + 2, c);
    if (a.next.includes(b.id)) return false;
    linkIds(a, b);
    a.passage = true;
    taken.add(`${r}:${c}`);
    bandEdges[r].push([c, c]); bandEdges[r + 1].push([c, c]);
    return true;
  };
  for (let r = 0; r + 2 <= lastWalk; r++) for (const a of at(r)) {
    if (a.next.length <= 1) trySkip(r, a);            // starved rooms first
  }
  for (let r = 0; r + 2 <= lastWalk; r++) for (const a of rng.shuffle(at(r))) {
    if (rng.chance(0.40)) trySkip(r, a);
  }

  // 1e. Safety net: nothing may be stranded at either end.
  for (let r = lastWalk - 1; r >= 0; r--) for (const a of at(r)) {
    if (a.next.length) continue;
    const near = cols(r + 1).sort((p, q) => Math.abs(p - a.col) - Math.abs(q - a.col));
    if (near.length) linkIds(a, node(r + 1, near[0]));
  }
  for (let r = 1; r <= lastWalk; r++) for (const b of at(r)) {
    if (b.prev.length) continue;
    const near = cols(r - 1).sort((p, q) => Math.abs(p - b.col) - Math.abs(q - b.col));
    if (near.length) linkIds(node(r - 1, near[0]), b);
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
  // The first room is always a fight, the way it is in Slay the Spire.  Row two
  // is left open so the second decision already has texture in it.
  for (const n of rowsOf[0]) n.type = NodeType.SCUFFLE;

  const open = all.filter(n => !n.type);
  const n0 = open.length;
  const wantRescue = !!(companion === null || !rescued.includes(meta.companion)) && !!meta.companion;

  // Two wings should never feel like the same wing.  The recipe is a base share
  // of the rooms plus a die roll, and then a CHARACTER that leans the whole
  // sheet one way — a market wing really does have more to buy in it, and a
  // haunted one really is short of places to sleep.  Everything left over is a
  // Scuffle, and that leftover is held near 40% so the sheet is not a wall of
  // claw marks.
  const CHARACTERS = [
    { id: 'plain',    w: 3, lean: {} },
    { id: 'market',   w: 2, lean: { [NodeType.SHOP]: +1, [NodeType.TREASURE]: +1, [NodeType.BIG_SCARE]: -1 } },
    { id: 'haunted',  w: 2, lean: { [NodeType.BIG_SCARE]: +2, [NodeType.SAFE]: -1, [NodeType.CURIOSITY]: -1 } },
    { id: 'hoard',    w: 2, lean: { [NodeType.TREASURE]: +2, [NodeType.UNKNOWN]: -1 } },
    { id: 'quiet',    w: 2, lean: { [NodeType.SAFE]: +2, [NodeType.CURIOSITY]: +1, [NodeType.BIG_SCARE]: -1 } },
    { id: 'strange',  w: 2, lean: { [NodeType.UNKNOWN]: +2, [NodeType.CURIOSITY]: +2, [NodeType.TREASURE]: -1 } },
    { id: 'derelict', w: 1, lean: { [NodeType.UNKNOWN]: +3, [NodeType.SHOP]: -1, [NodeType.SAFE]: -1 } },
  ];
  const character = rng.weighted(CHARACTERS);
  const share = (frac, lo, hi, jitter = 1) =>
    clamp(Math.round(n0 * frac) + rng.range(-jitter, jitter), lo, hi);

  const quota = {
    // 0.11 of the sheet was 5.7 named horrors on a 58-room wing, and the only
    // reason it did not read as one was that three quarters of them were parked
    // on the two deepest rows, where any player heading for the boss simply went
    // round.  With the boss's door row given over to the Safe Room they came
    // forward into the wide middle of the wing, and the same quota that had been
    // costing 0.8 elite fights per expedition started costing 1.23 — which is
    // where the survival that the Safe Room bought was going.  Slay the Spire
    // puts TWO elites on an act-one map of this size.  Three is our ceiling for
    // an ordinary wing, and a haunted one earns its extra.
    [NodeType.BIG_SCARE]: share(0.065, 2, 5) + (hauntLevel >= 3 ? 1 : 0),
    [NodeType.SAFE]:      share(0.10, 2, 6),
    [NodeType.SHOP]:      clamp(Math.round(n0 / 26) + (rng.chance(0.35) ? 1 : 0), 1, 3),
    [NodeType.TREASURE]:  share(0.06, 1, 5),
    [NodeType.RESCUE]:    wantRescue ? 1 : 0,
    [NodeType.UNKNOWN]:   share(0.10, 2, 7),
    [NodeType.CURIOSITY]: share(0.19, 3, 12, 2),
  };
  for (const t in character.lean) quota[t] = Math.max(0, (quota[t] || 0) + character.lean[t]);
  if (wantRescue) quota[NodeType.RESCUE] = 1;

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
    // guaranteed pre-boss row (that whole row is already Safe, see below), and
    // never on row 14 whichever way you count it.
    [NodeType.SAFE]: (n) => n.row >= 4 && n.row !== lastWalk && n.row !== 13
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

  // ── The boss's door row: a guaranteed rest, and a real choice ─────────────
  //
  // History, because both halves of this were learned the hard way.
  //
  // It began as an 80% chance on the row two before the boss, so it could be
  // routed past and one sheet in five had none at all.  The balance sim put the
  // whole survival gap on that line: 0.7 rests per expedition, and the boss won
  // 15% of the time at the Courage the player actually arrived with.  So round 3
  // made EVERY room on the last walkable row a Safe Room, which bought +9 points
  // of reach-the-boss and 1 guaranteed rest on the worst path.
  //
  // And it over-corrected into a fake choice.  Measured across five seeds and
  // three regions: the door row was 4/4 (or 3/3) Safe Rooms on every single
  // sheet.  Four branches, four identical rooms — the last decision of the wing
  // was not a decision, it was a corridor drawn four times.
  //
  // What survives is the part that was load-bearing: **there is always a rest at
  // the boss's door.**  Exactly one room on the row is guaranteed Safe, so no
  // route can be denied it; the others carry something worth walking past a rest
  // for.  That is Slay the Spire's actual pre-boss shape — you may take the
  // campfire, and taking it costs you whatever the other branch held.
  //
  // Two consequences, both deliberate:
  //   · the row-14 taboo does not apply here.  In a 15-row wing the pre-boss row
  //     IS row index 13; a superstition about numbering does not get to cost the
  //     player the run.
  //   · a Big Scare may sit on this row.  It is the one place a named horror is
  //     trivially avoidable — every room on the row is an alternative to every
  //     other — so it is a genuine risk/reward and not the unavoidable toll that
  //     round 3 correctly banned.  It is registered in `scares` below so the
  //     avoidability BFS counts it.
  // The rest is IN ADDITION to the wing's own Safe quota, not instead of one.
  const doorRow = rowsOf[lastWalk] || [];
  const scares = new Set();
  if (doorRow.length) {
    // The guaranteed rest sits on a lane chosen by the seed, not always the
    // middle: which branch the safe one is on is itself information the player
    // reads off the sheet.
    const restIdx = rng.int(doorRow.length);
    // What the other doors hold.  Weighted so the row reads as a choice between
    // real things: a shop or a treasure most of the time, a named horror often
    // enough to matter, and a plain Scuffle as the "nothing special, keep your
    // Courage" option.  Drawn WITHOUT replacement so three doors are never the
    // same door again.
    const others = rng.shuffle([
      NodeType.TREASURE, NodeType.SHOP, NodeType.BIG_SCARE, NodeType.SCUFFLE,
      NodeType.CURIOSITY, NodeType.UNKNOWN,
    ]).slice(0, Math.max(0, doorRow.length - 1));
    let k = 0;
    doorRow.forEach((n, i) => {
      if (i === restIdx) { n.type = NodeType.SAFE; return; }
      n.type = others[k++] || NodeType.SCUFFLE;
      if (n.type === NodeType.BIG_SCARE) scares.add(n.id);
    });
  }

  /**
   * Would making `n` a Big Scare leave some room whose every exit is one?
   *
   * "Every Big Scare must be avoidable" was implemented in round 3 as a GLOBAL
   * property: there exists a root-to-boss path that meets none of them.  That is
   * necessary and it is not sufficient, because a player does not route from the
   * door with the whole sheet in front of them — they stand in a room and pick
   * an exit, and a global guarantee says nothing about the room they are
   * standing in.  `tests/run/run.py`'s boss-path bot walked into exactly that:
   * at row 7 of 13 every legal exit was a named horror, so a test that
   * deliberately routes around them had to fight one, and lost the run.
   * The local rule is the one that matters at the moment of the decision.
   */
  const forcesAScare = (n) => {
    for (const pid of n.prev || []) {
      const p = byId[pid];
      if (!p || !p.next.length) continue;
      if (p.next.every(id => id === n.id || scares.has(id) ||
                             byId[id]?.type === NodeType.BIG_SCARE)) return true;
    }
    return false;
  };

  // The door row is typed before anything else, so its horrors get the same
  // test: a room on the row that feeds it must always have somewhere else to go.
  for (const n of doorRow) {
    if (n.type === NodeType.BIG_SCARE && forcesAScare(n)) {
      n.type = NodeType.SCUFFLE;
      scares.delete(n.id);
    }
  }

  /**
   * Is the boss still reachable from the door if you refuse to enter any room
   * in `blocked`?  (Same question the hazard placer asks about its wings.)
   */
  const bossReachableAvoiding = (blocked) => {
    const seen = new Set();
    const q = rowsOf[0].filter(n => !blocked.has(n.id)).map(n => n.id);
    for (const id of q) seen.add(id);
    while (q.length) {
      const cur = byId[q.shift()];
      if (!cur) continue;
      for (const id of cur.next) {
        if (id === boss.id) return true;
        if (blocked.has(id) || seen.has(id)) continue;
        seen.add(id); q.push(id);
      }
    }
    return false;
  };

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
      if (!rules[type](n)) continue;
      // EVERY Big Scare must be avoidable.  Same-row and along-path adjacency
      // used to be the only brakes, and they are local: with the boss's door row
      // taken out of the content pool the deepest-first pass packed two Big
      // Scares onto the three-room row that feeds it, and then every single
      // route had to fight one on the way to a boss it now had no Courage for.
      // Elite win rate fell 69% -> 54% and whole-region survival went DOWN.
      // A named horror you cannot route around is not a decision, it is a toll.
      if (type === NodeType.BIG_SCARE) {
        if (forcesAScare(n)) continue;                     // local: an exit that is not this
        scares.add(n.id);
        if (!bossReachableAvoiding(scares)) { scares.delete(n.id); continue; }  // global
      }
      n.type = type; need--;
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
  //
  // The wobble is deliberately constrained, and that constraint is what makes
  // the zero-crossing guarantee hold on the SHEET and not merely in the graph:
  //   · depth jitter is applied per ROW, not per node, so every row keeps its
  //     own vertical strip of the paper and two edges from different bands can
  //     never share x — a row that is a little early or a little late still
  //     cannot overtake its neighbour.
  //   · lane jitter is capped below half a lane, so the top-to-bottom order of
  //     a row's rooms is never inverted, and a monotone staircase drawn on a
  //     monotone row cannot self-intersect.
  // Rooms still sit at irregular, hand-surveyed intervals; they just cannot lie
  // about which row or which lane they are in.
  const padD = 0.105, spanD = 0.800;       // along depth  (x)
  const laneMid = 0.425, spanL = 0.640;    // across lanes (y)
  const padL = laneMid - spanL / 2;
  const jd = (spanD / rows) * 0.34;
  const jl = (spanL / Math.max(1, lanes - 1)) * 0.22;
  const rowShift = Array.from({ length: rows }, () => (rng.next() - 0.5) * 2 * jd);
  for (const n of all) {
    const d = n.row / (rows - 1);
    const l = lanes > 1 ? n.col / (lanes - 1) : 0.5;
    n.x = padD + d * spanD + (n.type === NodeType.BOSS ? 0 : rowShift[n.row]);
    n.y = padL + l * spanL;
    if (n.type !== NodeType.BOSS) n.y += (rng.next() - 0.5) * 2 * jl;
    else n.y = laneMid;
    // stay inside the drawn plan window: a room on the scale bar is a bug
    n.x = clamp(n.x, 0.078, 0.930);
    n.y = clamp(n.y, 0.098, 0.752);
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
    regionId, seed, rows, lanes, character: character.id,
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

/**
 * How a second Parlor gets its name.
 *
 * The old ladder was ' — West', ' — Lower', ' — Far End', ' — Back', and the
 * playtester's verdict was exact: "the authored room names are good; the
 * disambiguation suffixes make them look generated."  They are right, and the
 * reason is that no house has a room called "Parlor — Far End".  A house has a
 * Parlor and a Second Parlor and a Little Parlor and the Old Parlor, and those
 * are four different real rooms rather than one room wearing an index.
 *
 * So the qualifier is a PREFIX drawn from the vocabulary a floorplan actually
 * uses, chosen from where the room sits: compass first (it is a survey), then
 * storey, then the words that distinguish two rooms of the same use.
 */
/**
 * The first repeat is placed, because this is a survey: which side of the wing
 * it is on.  Only ONE positional word, and it has to be the one derived from
 * the LANE.  A word derived from the row is identical for every room on that
 * row, so a depth-based qualifier printed "Upper Visitor Cloakroom / Upper Bell
 * Pull Gallery / Upper Grand Staircase / Upper Drawing Room" across the four
 * doors of the boss's row — the same tell as the old suffix ladder, one word
 * further along.  ("Upper" was also just wrong: depth on this sheet runs west
 * to east, not up.)
 */
const ROOM_PLACE = [(west) => (west ? 'West ' : 'East ')];
/** After that: the words a house uses for two rooms of the same kind. */
const ROOM_KIND = ['Second ', 'Little ', 'Old ', 'Back ', 'Front ', 'Inner ', 'Far '];

function assignRoomNames(regionId, all, boss, rng, lanes, rows) {
  const rooms = ROOMS[regionId] || ROOMS['foyer'];
  const usable = rooms.filter(r => r.tag !== 'bo');
  const uses = new Map();      // room name -> times used
  const taken = new Set();     // final display names
  // stable, seed-free tie-break so two equally-unused rooms are not always
  // resolved the same way (which is what put four Umbrella Galleries on a sheet)
  const jitter = (a, b) => {
    let h = 2166136261;
    const s = a + '|' + b;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 11;
  };
  const shuffled = rng.shuffle(usable.slice());

  for (const n of all) {
    if (n.type === NodeType.BOSS) continue;
    const prefs = PREFERRED[n.type] || ['sc'];
    // Use MORE of the region's twenty rooms before reusing any of them.  The
    // score is dominated by how often a name is already on this sheet, so an
    // unused room of the "wrong" tag beats a preferred room that is already
    // there — which is exactly what the playtester asked for.  Tag affinity and
    // the jitter only decide between rooms with the same use count.
    let room = null, bestScore = Infinity;
    for (const r of shuffled) {
      const pi = prefs.indexOf(r.tag);
      const score = (uses.get(r.name) || 0) * 1000
                  + (pi >= 0 ? pi * 17 : 420)
                  + jitter(n.id, r.name);
      if (score < bestScore) { bestScore = score; room = r; }
    }
    if (!room) room = usable[0] || rooms[0];

    const u = uses.get(room.name) || 0;
    uses.set(room.name, u + 1);
    const west = n.col < (lanes - 1) / 2;
    let bump = u, display = qualify(room.name, bump, west, n.id);
    while (taken.has(display) && bump < ROOM_PLACE.length + ROOM_KIND.length) {
      display = qualify(room.name, ++bump, west, n.id);
    }
    taken.add(display);
    n.roomName = display;
    n.roomTag = room.tag;
  }
  boss.roomName = (ROOMS[regionId] || ROOMS['foyer']).find(r => r.tag === 'bo')?.name || 'Boss Room';
  boss.roomTag = 'bo';
}

function qualify(name, i, west, id) {
  if (i <= 0) return name;
  // Never "West East Reception Hall" or "Lower Lower Attic": a wing that already
  // authored a compass or a storey into a room's name does not get a second one.
  const lead = name.split(' ')[0].toLowerCase();
  const ok = q => q.trim().toLowerCase() !== lead;
  const place = ROOM_PLACE.map(f => f(west)).filter(ok);
  if (i <= place.length) return place[i - 1] + name;
  // Past the two positional words the index alone is not enough: on a late row
  // every room is already on the sheet twice, so keying off the use count put
  // "Second Entry Hall / Second Umbrella Gallery / Second Visitor Cloakroom /
  // Second Receiving Room" side by side at the boss's door — a different tell
  // for the same fault the suffix ladder had.  Which word a room gets is a
  // property of the ROOM, chosen deterministically from its id.
  const kind = ROOM_KIND.filter(ok);
  if (!kind.length) return name + ' ' + (i + 1);
  let h = 2166136261;
  const s = String(id) + '|' + name;
  for (let j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); }
  return kind[((h >>> 0) + i - place.length - 1) % kind.length] + name;
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
        // The boundary keeps a full mark's radius clear of its members on every
        // side (a node box is 86px on a 1010px sheet, counter-scaled up to 1.15x
        // = 0.049 of the height), so the scene can hang the wing's name tag off
        // the outside of the line without it ever landing on a room's icon.
        rect: {
          x0: clamp(Math.min(...xs) - 0.075, 0.012, 0.98),
          x1: clamp(Math.max(...xs) + 0.075, 0.02, 0.988),
          y0: clamp(Math.min(...ys) - 0.062, 0.050, 0.98),
          y1: clamp(Math.max(...ys) + 0.062, 0.02, 0.845),
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
