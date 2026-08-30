/**
 * Shared data vocabulary. OWNER: lead. Read-only for everyone else.
 *
 * Every card, enemy, status, relic and map node in the game conforms to these
 * shapes. The combat engine, the card renderer, the enemy renderer and the
 * content authors all agree here and nowhere else.
 */

// ── Vocabulary ──────────────────────────────────────────────────────────────
export const CardType   = /** @type {const} */ ({ ATTACK: 'attack', SKILL: 'skill', POWER: 'power', STATUS: 'status', CURSE: 'curse' });
export const Rarity     = /** @type {const} */ ({ BASIC: 'basic', COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare', SPECIAL: 'special', CURSE: 'curse' });
export const Target     = /** @type {const} */ ({ ENEMY: 'enemy', ALL_ENEMIES: 'allEnemies', SELF: 'self', NONE: 'none', RANDOM_ENEMY: 'randomEnemy', ALLY: 'ally' });
export const Pile       = /** @type {const} */ ({ DRAW: 'draw', HAND: 'hand', DISCARD: 'discard', EXHAUST: 'exhaust', LIMBO: 'limbo', STASH: 'stash' });

/** Intent silhouettes. The single most important read in combat. */
export const Intent = /** @type {const} */ ({
  ATTACK: 'attack',                 // shows exact post-modifier damage
  ATTACK_BIG: 'attackBig',          // same, but a heavier silhouette
  ATTACK_DEFEND: 'attackDefend',
  ATTACK_BUFF: 'attackBuff',
  ATTACK_DEBUFF: 'attackDebuff',
  DEFEND: 'defend',
  DEFEND_BUFF: 'defendBuff',
  DEFEND_DEBUFF: 'defendDebuff',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  STRONG_DEBUFF: 'strongDebuff',
  SUMMON: 'summon',
  SLEEP: 'sleep',
  STUN: 'stun',
  ESCAPE: 'escape',
  UNKNOWN: 'unknown',
});

// ── Card ────────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} CardDef
 * @property {string}  id            unique, kebab-case, prefixed by companion: 'marmalade/pounce'
 * @property {string}  name
 * @property {string}  companion     companion slug, or 'neutral' | 'status' | 'curse'
 * @property {CardType[keyof CardType]} type
 * @property {Rarity[keyof Rarity]}     rarity
 * @property {number}  cost          -1 = X cost, -2 = unplayable
 * @property {Target[keyof Target]}     target
 * @property {string}  text          rules text. Use {d}, {b}, {m0}.. placeholders (see below)
 * @property {string}  [flavor]
 * @property {Object}  [nums]        named numbers the text interpolates: { d: 9, b: 5, m0: 2 }
 * @property {Object}  [upgrade]     partial override applied when upgraded: { nums:{d:12}, cost:0, text:'…' }
 * @property {string[]} [keywords]   keyword ids present on this card (for tooltips + search)
 * @property {boolean} [exhaust]
 * @property {boolean} [ethereal]
 * @property {boolean} [innate]
 * @property {boolean} [retain]
 * @property {boolean} [unplayable]
 * @property {string}  [art]         optional art key
 * @property {(c:Ctx)=>void|Promise<void>} effect  the actual behaviour
 * @property {(c:Ctx)=>Preview}  [previewFn]  overrides the default preview
 * @property {(c:Ctx)=>boolean}  [playable]   extra play condition
 * @property {(c:Ctx)=>number}   [dynamicCost]
 * @property {Object} [handHooks] behaviour that runs while the card sits in a
 *   seat's HAND, dispatched by combat/hooks.js — the only place an `unplayable`
 *   card can do anything at all, since `effect` is reached solely through
 *   `_playCard` and `canPlay` refuses those. Same hook names as StatusDef.hooks
 *   plus `onHeldTurnEnd(h)`, and one difference that matters: `h.owner` is the
 *   CARD, so a hand hook names its actor explicitly (`h.loseHp(h.player, n)`).
 *
 * Text placeholders:
 *   {d}   → nums.d, recoloured live if modified by Strength/Weak/Vulnerable
 *   {b}   → nums.b, block, recoloured live if modified by Dexterity/Frail
 *   {n}   → nums.n, a plain number (no modifier maths)
 *   {m0}… → nums.m0…, extra plain numbers
 *   [Keyword] → renders as a hoverable keyword chip
 */

// ── Ctx: what a card effect is handed ───────────────────────────────────────
/**
 * @typedef {Object} Ctx
 * @property {Engine}  e        the combat engine
 * @property {Actor}   self     the player
 * @property {Actor?}  target   chosen target, if the card targets
 * @property {Card}    card     the runtime card instance (has .uid, .upgraded, .nums)
 * @property {number}  x        the X value for X-cost cards
 * Helpers (all emit engine events, all respect modifiers):
 *   damage(target, amount, opts)     attack damage through the full pipeline
 *   damageAll(amount, opts)
 *   loseHp(target, amount)           ignores block
 *   block(actor, amount)
 *   heal(actor, amount)
 *   applyStatus(actor, id, stacks)
 *   draw(n) / discard(n, opts) / exhaust(card) / addCard(def, pile, opts)
 *   gainEnergy(n) / loseEnergy(n)
 *   count(statusId, actor) / has(statusId, actor)
 *   forEachEnemy(fn) / randomEnemy() / livingEnemies()
 */

// ── Status ──────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} StatusDef
 * @property {string} id
 * @property {string} name
 * @property {'buff'|'debuff'|'neutral'} kind
 * @property {string} icon        glyph id in ui/icons.js
 * @property {string} desc        plain language, uses {n} for stacks
 * @property {'turnEnd'|'turnStart'|'never'|'combat'} decay  when a stack is removed
 * @property {boolean} [stacks]   false = duration-only, no numeric display when 1
 * @property {number} [max]
 * @property {Object} [hooks]     { onApply, onRemove, onTurnStart, onTurnEnd,
 *                                  modifyDamageDealt(amt,ctx), modifyDamageTaken(amt,ctx),
 *                                  modifyBlockGain(amt,ctx), onCardPlayed, onAttacked, onDeath }
 */

// ── Enemy ───────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} MoveDef
 * @property {string} id
 * @property {string} name
 * @property {Intent[keyof Intent]} intent
 * @property {number} [damage]     base damage, pre-modifier
 * @property {number} [hits]       multi-hit count (intent shows "d x hits")
 * @property {number} [block]
 * @property {string} [tell]       one short line of flavour shown on the intent tooltip
 * @property {(c:EnemyCtx)=>void|Promise<void>} effect
 *
 * @typedef {Object} EnemyDef
 * @property {string} id
 * @property {string} name
 * @property {string} region
 * @property {'normal'|'elite'|'boss'} tier      ('elite' = Big Scare, 'boss' = region boss)
 * @property {[number,number]} hp                inclusive roll range ("Courage")
 * @property {Object<string,MoveDef>} moves
 * @property {(c:EnemyCtx)=>string} nextMove     returns a move id; MUST be deterministic
 *                                               given (rng, turn, history, board state)
 * @property {(c:EnemyCtx)=>void} [onSpawn]
 * @property {(c:EnemyCtx)=>void} [onDeath]
 * @property {string} [silhouette]               visual rig key in ui/enemy.js
 * @property {number} [scale]
 * @property {string} [lore]
 */

// ── Relic (Keepsake) / Backpack item / Potion (Snack) ───────────────────────
/**
 * @typedef {Object} RelicDef
 * @property {string} id, name, desc
 * @property {'starter'|'common'|'uncommon'|'rare'|'boss'|'shop'|'event'} rarity
 * @property {string} icon
 * @property {Object} hooks   same hook names as StatusDef, plus onPickup, onRestSite,
 *                            onCombatStart, onCombatEnd, onEnterRoom, onShuffle
 * @property {number} [counter]  visible counter on the relic chip
 */

// ── Map node ────────────────────────────────────────────────────────────────
export const NodeType = /** @type {const} */ ({
  SCUFFLE: 'scuffle',        // normal combat
  BIG_SCARE: 'bigScare',     // elite
  BOSS: 'boss',
  SAFE: 'safe',              // rest site — "Safe Room"
  SHOP: 'shop',              // "Lost Things"
  CURIOSITY: 'curiosity',    // event
  TREASURE: 'treasure',
  RESCUE: 'rescue',          // Companion rescue
  UNKNOWN: 'unknown',
});

/**
 * @typedef {Object} MapNode
 * @property {string} id
 * @property {NodeType[keyof NodeType]} type
 * @property {number} row, col
 * @property {number} x, y            normalised 0..1 position on the blueprint section
 * @property {string[]} next          ids of reachable nodes in the next row
 * @property {string} [roomName]      authored room name from the design doc
 * @property {Object} [payload]       encounter id, shop stock seed, event id…
 * @property {boolean} [visited]
 */

export const REGION_ORDER = [
  'foyer', 'nursery', 'sleeping-quarters', 'kitchens-cellars', 'greenhouse',
  'graveyard', 'study-library', 'attic-observatory', 'lampworks', 'ballroom',
  'crypt', 'hedge-maze', 'secret-passages', 'bathhouse', 'kennels',
  'pumpkin-grounds', 'heart',
];

export const COMPANIONS = [
  { slug: 'marmalade',  name: 'Marmalade',      title: 'the Ghost Cat',            region: 'foyer' },
  { slug: 'wisp',       name: 'Wisp',           title: "the Baby Will-o'-Wisp",    region: 'lampworks' },
  { slug: 'crumbula',   name: 'Count Crumbula', title: 'the Vampire Chinchilla',   region: 'ballroom' },
  { slug: 'boggle',     name: 'Boggle',         title: 'the Monster Under the Bed', region: 'sleeping-quarters' },
  { slug: 'bones',      name: 'Bones',          title: 'the Skeleton Puppy',       region: 'crypt' },
  { slug: 'pipkin',     name: 'Pipkin',         title: 'the Pumpkin Frog',         region: 'pumpkin-grounds' },
  { slug: 'taffy',      name: 'Taffy',          title: 'the Candy Slime',          region: 'kitchens-cellars' },
  { slug: 'truffle',    name: 'Truffle',        title: 'the Zombie Hedgehog',      region: 'hedge-maze' },
  { slug: 'hush',       name: 'Hush',           title: 'the Shadow Ferret',        region: 'secret-passages' },
  { slug: 'mopsy',      name: 'Mopsy',          title: 'the Rag Doll Bunny',       region: 'nursery' },
  { slug: 'drizzle',    name: 'Drizzle',        title: 'the Raincloud Ghost',      region: 'bathhouse' },
  { slug: 'pudding',    name: 'Pudding',        title: 'the Graveyard Pug',        region: 'graveyard' },
  { slug: 'wink',       name: 'Wink',           title: 'the Eyeball Spider',       region: 'attic-observatory' },
  { slug: 'crinkle',    name: 'Crinkle',        title: 'the Paper Crow',           region: 'study-library' },
  { slug: 'mossbit',    name: 'Mossbit',        title: 'the Tombstone Turtle',     region: 'kennels' },
  { slug: 'brambleboo', name: 'Brambleboo',     title: 'the Haunted Houseplant',   region: 'greenhouse' },
];

/**
 * The eight kids and the pets they are looking for.
 * `pronouns` is AUTHORITATIVE and set by the designer. Do not re-derive it from the design
 * doc: a pass over the doc's possessives read Mateo as he/him from "Mateo shakes his head",
 * and that is wrong — Mateo is they/them. Eli and Jordan are he/him even though the doc
 * never says so directly. Copy must read this field and never hardcode or guess a pronoun.
 * `petKind`/`petBreed` are the design doc's own words — five of these were invented
 * during scaffolding and wrong for months (Orbit was listed as a parrot; he is a cat).
 */
export const KIDS = [
  { slug: 'maya',   name: 'Maya Chen',       pet: 'Orbit',    petKind: 'cat',        petBreed: 'black domestic cat, white chest patch',
    pronouns: { s: 'she',  o: 'her',  p: 'her',   r: 'herself',    plural: false } },
  { slug: 'mateo',  name: 'Mateo Alvarez',   pet: 'Pepper',   petKind: 'parrot',     petBreed: 'green cheek conure',
    pronouns: { s: 'they', o: 'them', p: 'their', r: 'themselves', plural: true  } },
  { slug: 'amina',  name: 'Amina Okafor',    pet: 'Mochi',    petKind: 'rabbit',     petBreed: 'cream lop-eared rabbit',
    pronouns: { s: 'she',  o: 'her',  p: 'her',   r: 'herself',    plural: false } },
  { slug: 'eli',    name: 'Eli Rosen',       pet: 'Sprocket', petKind: 'rat',        petBreed: 'black and white fancy rat',
    pronouns: { s: 'he',   o: 'him',  p: 'his',   r: 'himself',    plural: false } },
  { slug: 'priya',  name: 'Priya Shah',      pet: 'Pixel',    petKind: 'gecko',      petBreed: 'leopard gecko',
    pronouns: { s: 'she',  o: 'her',  p: 'her',   r: 'herself',    plural: false } },
  { slug: 'jordan', name: 'Jordan Brooks',   pet: 'Scout',    petKind: 'dog',        petBreed: 'beagle mix',
    pronouns: { s: 'he',   o: 'him',  p: 'his',   r: 'himself',    plural: false } },
  { slug: 'lena',   name: 'Lena Yazzie',     pet: 'Mooncake', petKind: 'hamster',    petBreed: 'Syrian hamster',
    pronouns: { s: 'she',  o: 'her',  p: 'her',   r: 'herself',    plural: false } },
  { slug: 'samir',  name: 'Samir Haddad',    pet: 'Bean',     petKind: 'guinea pig', petBreed: 'tricolour guinea pig',
    pronouns: { s: 'he',   o: 'him',  p: 'his',   r: 'himself',    plural: false } },
];

/** In-fiction names for the universal resources. Use these strings in all UI. */
export const TERMS = {
  hp: 'Courage',
  block: 'Guard',
  energy: 'Nerve',
  card: 'Trick',
  deck: 'Tricks',
  relic: 'Keepsake',
  potion: 'Snack',
  gold: 'Lost Things',
  combat: 'Scuffle',
  elite: 'Big Scare',
  rest: 'Safe Room',
  shop: "Mr. Moth's",
  event: 'Curiosity',
  ascension: 'Haunt Level',
};
