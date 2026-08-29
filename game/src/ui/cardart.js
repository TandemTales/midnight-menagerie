/**
 * Procedural card art. OWNER: card-feel agent.
 *
 * There is no per-card illustration in this game, so we generate one.
 * `cardArt(def, w, h)` returns a data URL for a deterministic illustration
 * derived from the card id: same id -> byte-identical picture, forever.
 *
 * The picture is built in named layers so it reads as a designed icon-
 * illustration rather than noise:
 *
 *   1  sky          vertical gradient, family-tinted
 *   2  moon         disc or crescent + halo, seeded position
 *   3  scene        a silhouette set piece (mansion / graves / vines / drapes / web)
 *   4  floor        mist band + ground curve
 *   5  subject      A SILHOUETTE CHOSEN BY CARD ID — claw, curled cat, pouncing
 *                   cat, bone, pumpkin, candy drip, eye, flask… This layer used
 *                   to be the companion PORTRAIT, re-cropped per card, so all
 *                   five Marmalade cards showed the same ghost-cat face and you
 *                   could not tell Scratch from Curl Up without reading. The
 *                   companion now lives in the palette, scene and accents; the
 *                   card lives in the shape.
 *   6  motif        family accents (paw wisps, bones, vines, drips, eyes…)
 *   7  type         attack = claw slashes, skill = ward arcs, power = rays + runes
 *   8  particles    seeded embers with a soft glow
 *   9  grade        vignette, warm/cool bloom, upgrade gild, bottom fade
 *
 * Cost: one `paint()` is a few ms. Five of them inside one frame (draw 5 into a
 * hand of 12) cost ~18 fps. `warmArt(defs)` renders a whole deck ahead of time,
 * a couple per frame, so combat never pays for art during motion.
 *
 * Colour: UI colours are read from tokens.css via getComputedStyle. A short
 * `PIGMENT` table adds illustration-only hues (moss, bone, candy, rot, stone)
 * that are not UI tokens and have no business being ones — see NOTES.md.
 */

// ── colour utils ────────────────────────────────────────────────────────────
function hex2rgb(h) {
  h = (h || '#000').trim();
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(r) {
  return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function rgba(h, a) { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function lift(h, t) { return mix(h, '#ffffff', t); }
function sink(h, t) { return mix(h, '#000000', t); }

// ── tokens ──────────────────────────────────────────────────────────────────
let T = null;
function tokens() {
  if (T) return T;
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const g = (n, f) => { const v = cs && cs.getPropertyValue(n).trim(); return v || f; };
  T = {
    ink900: g('--ink-900', '#07060d'), ink800: g('--ink-800', '#0d0b16'),
    ink700: g('--ink-700', '#14111f'), ink600: g('--ink-600', '#1d1930'),
    ink500: g('--ink-500', '#2a2442'), ink400: g('--ink-400', '#3d3559'),
    flame100: g('--flame-100', '#fff4d6'), flame200: g('--flame-200', '#ffe2a8'),
    flame300: g('--flame-300', '#f8c96b'), flame400: g('--flame-400', '#e0a23c'),
    flame500: g('--flame-500', '#b87826'), flameGlow: g('--flame-glow', '#ffb64a'),
    spec100: g('--spectre-100', '#e6fbff'), spec200: g('--spectre-200', '#a8ecf7'),
    spec300: g('--spectre-300', '#6fd9ec'), spec400: g('--spectre-400', '#3fb4d0'),
    spec500: g('--spectre-500', '#2a7f99'),
    threat200: g('--threat-200', '#ff9c8a'), threat300: g('--threat-300', '#f2654c'),
    threat400: g('--threat-400', '#cf3c28'), threat500: g('--threat-500', '#8e2417'),
    parch: g('--parchment', '#e8dcc0'), curse: g('--rarity-curse', '#7a4a9e'),
    power: g('--type-power', '#b071d6'), skill: g('--type-skill', '#4f8fbf'),
    attack: g('--type-attack', '#d9583f'), courage: g('--courage-300', '#f26d78'),
  };
  return T;
}

/** Illustration-only pigments. Not UI colour — never used for interface state. */
const PIGMENT = {
  moss:  '#6f9a4e', leaf: '#a8cf6a', rot: '#4d6b3a',
  bone:  '#efe4c8', stone: '#8b8a97', ash: '#3a3742',
  candy: '#ff8fc4', cream: '#ffe6ef', grape: '#8f5bd0',
  rust:  '#c1662b', cocoa: '#6b4630', slate: '#5d7f9e',
};

// ── deterministic rng ───────────────────────────────────────────────────────
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── families ────────────────────────────────────────────────────────────────
/** One entry per companion + the non-companion pools. Built from tokens + pigments. */
function families() {
  const t = tokens(), P = PIGMENT;
  const F = (o) => Object.assign({ scene: 'mansion', motif: 'moon', crescent: 0.4 }, o);
  return {
    marmalade: F({ sky: [sink(t.spec500, .82), mix(t.ink800, t.spec500, .40)], glow: t.spec300, key: t.spec100, sec: t.spec200, silh: sink(t.spec500, .60), scene: 'mansion', motif: 'cat' }),
    wisp:      F({ sky: [sink(t.spec500, .86), mix(t.ink800, t.flame500, .30)], glow: t.flameGlow, key: t.flame100, sec: t.spec200, silh: sink(t.ink600, .30), scene: 'lanterns', motif: 'flame' }),
    crumbula:  F({ sky: [sink(t.curse, .80), mix(t.ink800, t.threat500, .40)], glow: t.threat300, key: t.flame200, sec: t.curse, silh: sink(t.curse, .62), scene: 'drapes', motif: 'fang' }),
    boggle:    F({ sky: [sink(t.ink900, .1), mix(t.ink700, t.power, .26)], glow: t.power, key: t.flame200, sec: lift(t.power, .3), silh: sink(t.ink900, .2), scene: 'bed', motif: 'claw' }),
    bones:     F({ sky: [sink(t.ink800, .35), mix(t.ink700, P.stone, .34)], glow: lift(P.bone, .1), key: P.bone, sec: t.spec200, silh: sink(P.ash, .45), scene: 'graves', motif: 'bone' }),
    pipkin:    F({ sky: [sink(t.flame500, .84), mix(t.ink800, P.rot, .42)], glow: t.flameGlow, key: t.flame300, sec: P.leaf, silh: sink(P.rot, .55), scene: 'vines', motif: 'pumpkin' }),
    taffy:     F({ sky: [sink(P.candy, .82), mix(t.ink800, P.grape, .34)], glow: P.candy, key: P.cream, sec: lift(P.candy, .2), silh: sink(P.grape, .60), scene: 'drips', motif: 'drip' }),
    truffle:   F({ sky: [sink(P.rot, .80), mix(t.ink800, P.moss, .32)], glow: P.leaf, key: lift(P.moss, .45), sec: P.moss, silh: sink(P.rot, .58), scene: 'hedge', motif: 'quill' }),
    hush:      F({ sky: [sink(t.ink900, .0), mix(t.ink800, t.curse, .30)], glow: lift(t.curse, .25), key: t.spec200, sec: t.curse, silh: sink(t.ink900, .3), scene: 'passage', motif: 'swirl' }),
    mopsy:     F({ sky: [sink(t.courage, .80), mix(t.ink800, t.courage, .26)], glow: lift(t.courage, .2), key: t.flame100, sec: P.cream, silh: sink(t.courage, .66), scene: 'nursery', motif: 'stitch' }),
    drizzle:   F({ sky: [sink(P.slate, .78), mix(t.ink800, P.slate, .40)], glow: lift(P.slate, .35), key: t.spec100, sec: P.slate, silh: sink(P.slate, .62), scene: 'rain', motif: 'cloud' }),
    pudding:   F({ sky: [sink(P.cocoa, .80), mix(t.ink800, P.moss, .22)], glow: t.flame300, key: t.flame200, sec: P.moss, silh: sink(P.cocoa, .58), scene: 'graves', motif: 'pawbone' }),
    wink:      F({ sky: [sink(t.power, .84), mix(t.ink800, t.power, .32)], glow: lift(t.power, .18), key: t.flame200, sec: t.spec200, silh: sink(t.power, .68), scene: 'web', motif: 'eye' }),
    crinkle:   F({ sky: [sink(t.ink700, .2), mix(t.ink700, P.slate, .28)], glow: t.parch, key: t.parch, sec: P.slate, silh: sink(P.slate, .70), scene: 'books', motif: 'feather' }),
    mossbit:   F({ sky: [sink(P.stone, .80), mix(t.ink800, P.moss, .28)], glow: P.leaf, key: lift(P.stone, .40), sec: P.moss, silh: sink(P.stone, .66), scene: 'graves', motif: 'tomb' }),
    brambleboo:F({ sky: [sink(P.rot, .82), mix(t.ink800, P.moss, .36)], glow: P.leaf, key: lift(P.leaf, .25), sec: P.rust, silh: sink(P.rot, .60), scene: 'vines', motif: 'sprig' }),
    neutral:   F({ sky: [sink(t.ink800, .25), mix(t.ink700, t.flame500, .22)], glow: t.flameGlow, key: t.flame200, sec: t.parch, silh: sink(t.ink600, .35), scene: 'mansion', motif: 'moon' }),
    status:    F({ sky: [sink(P.moss, .86), mix(t.ink800, P.rot, .30)], glow: P.moss, key: lift(P.moss, .3), sec: P.stone, silh: sink(P.ash, .30), scene: 'passage', motif: 'sick' }),
    curse:     F({ sky: [sink(t.curse, .88), sink(t.ink900, .0)], glow: t.curse, key: lift(t.curse, .40), sec: t.threat300, silh: sink(t.ink900, .2), scene: 'thorns', motif: 'thorn' }),
  };
}
let FAM = null;
function fam(slug) {
  if (!FAM) FAM = families();
  return FAM[slug] || FAM.neutral;
}

// ── subject: what this specific card is a picture OF ────────────────────────
/**
 * Keyed off `def.id` (and the printed name as a fallback signal), so Scratch is
 * a claw, Curl Up is a sleeping cat, Spectral Pounce is a cat mid-leap, Fetch!
 * is a bone, Lantern Smash is a pumpkin and Sugar Rush is a candy drip — you
 * can name every card in the hand without reading a word of it.
 * First match wins; order is significance order, not alphabetical.
 */
const SUBJECT_RULES = [
  [/(scratch|rake|shred|rend|swipe|slash|claw)/, 'claw'],
  [/(pounce|leap|lunge|spring|ambush|dive|prowl)/, 'pounce'],
  [/(curl|nap|sleep|doze|cosy|cozy|snug|hunker|tuck)/, 'curl'],
  [/(fetch|bone|dig|bury|marrow|skull|rattle)/, 'bone'],
  [/(pumpkin|lantern|gourd|jack|smash)/, 'pumpkin'],
  [/(sugar|candy|taffy|sweet|syrup|caramel|drip|gum)/, 'candy'],
  [/(eye|eyes|gaze|stare|glare|watch|peek|hundred)/, 'eye'],
  [/(boo|haunt|spook|shriek|wail|scare|fright|spectre|spirit)/, 'ghost'],
  [/(lives|life|revive|rebirth|soul)/, 'ninelives'],
  [/(draught|potion|brew|elixir|tonic|flask|philtre|remedy)/, 'flask'],
  [/(web|silk|thread|weave|spin|snare)/, 'webbing'],
  [/(thorn|curse|regret|doom|dread|hex|blight)/, 'thorn'],
  [/(dust|grime|rot|mould|mold|wound|sick|ache|nausea|burden)/, 'sick'],
  [/(fang|bite|chomp|gnash|snarl|growl|howl|bark)/, 'fang'],
  [/(ward|guard|block|brace|shield|bulwark|parry|shell)/, 'ward'],
  [/(paw|pad|step|stalk|tiptoe|creep)/, 'paw'],
  [/(feather|quill|plume|page|book|tome|scroll|note)/, 'feather'],
  [/(flame|candle|ember|spark|burn|torch|blaze|wick)/, 'flame'],
  [/(tomb|grave|crypt|stone|headstone|epitaph)/, 'tomb'],
  [/(leaf|vine|sprig|bramble|root|seed|bloom|thicket)/, 'sprig'],
  [/(cloud|rain|storm|drizzle|mist|fog|damp)/, 'cloud'],
  [/(hush|whisper|silence|veil|swirl|shroud|fade)/, 'swirl'],
  [/(stitch|patch|mend|sew|plush|seam)/, 'stitch'],
  [/(moon|midnight|night|dusk|dark|shadow)/, 'moon'],

  /* ── round 4: the rules table only covered a third of the roster ─────────
     286 of the 429 shipped companion cards fell straight through to
     `TYPE_POOL`, which is why ~40 skills per companion shared four shapes and
     why two of three reward cards could show the same paw. The block below is
     the actual printed vocabulary of the five companions — dog gear, cat
     zoomies, frog hops, blob squish, spider probability — matched against the
     card's own words. Everything above this line is untouched, so every
     subject that already resolved still resolves to the same shape; these
     rules can only claim cards that used to be a coin toss.
     Ordering inside the block is significance order: the more specific noun
     wins ("Skeleton Key" is a key, "Skeleton Stampede" is bones).           */
  [/(key|keyhole|lock|unlock|latch)/, 'key'],
  /* Dog obedience is a big slice of the Bones vocabulary, so it is split three
     ways rather than piled onto one shape: a hand of five really can hold
     "Sit Pretty", "Go Get It!" and "Good Boy!" at once. */
  [/(play dead|flop over|roll over|lie down)/, 'curl'],
  [/(good (boy|dog)|best dog|well done|praise|proud)/, 'paw'],
  [/(collar|leash|jingle|heel|obey|\bsit\b|\bstay\b|leave it|come here|\bcall\b|whistle|recall)/, 'collar'],
  [/(emergency|panic|desperate|last resort|wrong|mistake|misfire|broken|busted)/, 'crack'],
  [/\bcat\b|kitty|meow|hiss|purr|whisker|catastrophe|poltercat|curiosit/, 'cat'],
  [/(skeleton|femur|\brib\b|spine|tailbone|vertebra|headless|burie)/, 'bone'],
  [/(come back|brought it back|not dead|dead yet|undying|still works)/, 'ninelives'],
  [/(predator|hunter|\bhunt\b|patien|\bprey\b|quarry|gotcha|grab|snatch|seize)/, 'claw'],
  [/(ball|\btoy\b|throw|toss|chase|catch|bounce|ricochet|rebound|fling|hurl|go get)/, 'ball'],
  [/(hop|jump|boing|vault|hurdle|catapult|frogapult|pogo|springs?)/, 'coil'],
  [/(stretch|elastic|pull|taut|overstretch|orbit|tension|long pull|snap back)/, 'coil'],
  [/(zoomie|dash|sprint|scurry|frenzy|stampede|scramble|circles|flurry|whirl)/, 'coil'],
  [/(crouch|squat|brace up|wind up|hold your|deep breath|big breath|breathing)/, 'coil'],
  [/(squish|squash|smoosh|blob|glob|plump|inflate|deflate|puff|swell|wobble|sag|melt|goo|slime|jiggle|pffft?)/, 'blob'],
  [/(chew|jaw|mouth|gulp|swallow|regurgitate|belly|tummy|stomach|digest)/, 'blob'],
  [/(croak|frog|ribbit|tongue|toad)/, 'blob'],
  [/(split|unsplit|pinch|apart|halve|half|recombin|remake|reassembl|whole|together|multipack|family size)/, 'stitch'],
  [/(spare part|missing piece|piece|fragment|scatter|shard|fall apart|take me apart|anatomy)/, 'pawbone'],
  [/(land|feet|fall|\bdrop\b|crater|cannonball|impact|slam|smack|punch|tackle|crash|thud|bellyflop|flop)/, 'crack'],
  [/(knock|topple|shove|bump|\bbop\b|kick|nudge|barrage|splat)/, 'ball'],
  [/(stash|hoard|store|save|keep|pocket|pantry|larder|supper|picnic|basket|jar|wrapper|wrapped)/, 'flask'],
  [/(sniff|scent|smell|nose|track|trail|whiff)/, 'cloud'],
  [/(pond|puddle|water|pool|splash|skim|soak|damp|wet)/, 'cloud'],
  [/(yard|\bmap\b|treasure|hoardings|excavat|unearth)/, 'tomb'],
  [/(harvest|plant|garden|ripe|rind|grow|fertile|crop|sprout|replant)/, 'sprig'],
  [/(treat|snack|dinner|lunch|meal|feed|eat|taste|flavou?r|sample|serving|licorice|jawbreaker|wrapper)/, 'candy'],
  [/(hide|hidden|seek|disappear|vanish|phase|slip|sneak|untouchable|nope|elsewhere|now you see)/, 'swirl'],
  [/(perch|rafter|ceiling|lampshade|high|above|overhead|aloft|window|sill|sunbeam|warm)/, 'moon'],
  [/(wall|through|between|room|doorway|doorframe|threshold|corner|squeeze|floor|table|shelf|mantel)/, 'key'],
  [/(again|later|second|another|encore|repeat|postpone|stall|deadline|inevitable|future|predict|foresee|tense|forked|script|rewind|turn back|\btime\b|clock|moment)/, 'hourglass'],
  [/(odds|\bbet\b|chance|random|guess|luck|dice|gamble|coin|probabilit|blindside|long shot|choose|\bpick\b|price|\bcost)/, 'dice'],
  [/(mirror|replica|copy|duplicate|clone|twin|same again|copycat|reflect)/, 'eye'],
  [/(blink|wink|glimpse|glance|sight|vision|\bsee\b|seen|look|observe|examin|survey|inspect|check|read the|tell)/, 'eye'],
  [/(sticky|\bstick\b|glue|adhere|palm|snare|cling|tripline|\btrip\b|\btrap\b)/, 'webbing'],
  [/(spider|eight|angle|lattice|string|geometr|silk)/, 'webbing'],
  [/(pattern|loom|weav|library|catalogue)/, 'stitch'],
  [/(shake|wag|wiggle|\broll\b|tumble|spin|twitch|shiver|shudder|rush|charge|loop|cycle)/, 'coil'],
  [/(snip|\bcut\b|scissor|sever|shear)/, 'crack'],
  [/(pile|heap|\bstack\b|swarm|horde|crowd|dogpile)/, 'pawbone'],
  [/(couch|\brug\b|cushion|sofa|\bbed\b|carpet|blanket)/, 'curl'],
  [/(steal|thief|pilfer|filch|borrow)/, 'key'],
  [/(spit|drool|slobber|spray)/, 'drip'],
  [/(nibble|\bnip\b|munch)/, 'fang'],
  [/(startle|jolt|flinch|shock)/, 'ghost'],
  [/(lost|found|\bfind\b|misplace)/, 'cloud'],
  [/(reach|distance|\bfar\b|retreat|back up|back off|meant|on purpose|deliberate)/, 'paw'],
  [/(house|mansion|manor|parlour|foyer)/, 'key'],
  [/(\btail\b|\bear\b|\bears\b|fluff|\bfur\b|hair)/, 'quill'],
  [/(nine|eight|three|triple|double|all of|every)/, 'ninelives'],
];

/**
 * Fallback pools, for a card whose own words match nothing above.
 *
 * Round 3 shipped four shapes per type. With two thirds of the roster falling
 * through, that meant ~40 skills per companion sharing `ward / curl / swirl /
 * paw` — so two cards in one hand, or two of three cards in a reward triple,
 * routinely drew the same silhouette. Both the rules table above and these
 * pools are widened; the pools are the safety net, not the main mechanism.
 *
 * Only shapes that read for ANY companion are listed. The family-specific
 * silhouettes (`cat`, `pumpkin`, `candy`, `drip`) stay out of the fallbacks so
 * a Bones card can never be a random pumpkin — those are reached by name only.
 */
const TYPE_POOL = {
  attack: ['claw', 'fang', 'pounce', 'bone', 'flame', 'ball', 'crack', 'quill', 'thorn'],
  skill:  ['ward', 'curl', 'swirl', 'paw', 'feather', 'cloud', 'flask', 'stitch',
           'webbing', 'key', 'collar', 'coil', 'blob', 'sprig', 'tomb'],
  power:  ['eye', 'moon', 'ninelives', 'flask', 'ghost', 'hourglass', 'dice', 'flame', 'sprig'],
  status: ['sick'],
  curse:  ['thorn'],
};

/**
 * The part of a card id that actually names the card.
 *
 * Ids are `<companion-slug>/<card-slug>` — `bones/tailbone-thump`. Matching
 * SUBJECT_RULES against the WHOLE id meant the companion slug decided the
 * picture for its entire pool: `bones/*` hit /bone/, `taffy/*` hit /taffy/,
 * `hush/*` hit /hush/, `drizzle/*` hit /drizzle/ and `brambleboo/*` hit /boo/.
 * Five companions, ~200 cards, one drawing each. The slug is a *family* label —
 * it already picks the palette in `fam()` — so it must never pick the subject.
 */
function cardStem(id) {
  const s = String(id || '');
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

export function subjectFor(def) {
  const s = (cardStem(def.id) + ' ' + (def.name || '')).toLowerCase();
  // Statuses are clutter you did not choose: they never borrow a hero shape.
  if (def.type === 'status') {
    const p = ['sick', 'cloud', 'swirl', 'stitch'];
    return p[hash32(def.id || 'x') % p.length];
  }
  for (let i = 0; i < SUBJECT_RULES.length; i++) {
    if (SUBJECT_RULES[i][0].test(s)) return SUBJECT_RULES[i][1];
  }
  const pool = TYPE_POOL[def.type] || TYPE_POOL.skill;
  return pool[hash32(def.id || 'x') % pool.length];
}

// ── art-ready subscribers (kept for API compatibility) ──────────────────────
const readyFns = new Set();
/** Subscribe to "the art source changed, regenerate". Returns an unsubscribe. */
export function onArtReady(fn) { readyFns.add(fn); return () => readyFns.delete(fn); }
function fireReady() { for (const fn of [...readyFns]) { try { fn(); } catch (e) { console.error(e); } } }

/**
 * DEPRECATED. The subject layer no longer uses the companion portraits, so
 * there is nothing to preload. Kept so existing callers keep working.
 * Use `warmArt(defs, w, h)` instead — that is the one that matters for fps.
 */
/**
 * DEAD STUB — resolves immediately and warms nothing. Nothing in the build
 * calls it, and anything that did would get a promise that means "done" while
 * every card was still cold. Kept only because it is in the default export;
 * use `warmArt` (budgeted, incremental) or `warmArtSync` (blocking, for tests
 * and loading screens). CONTRACTS rule 8's shape: an API that answers
 * successfully without doing the thing is worse than one that is missing.
 */
export function preloadArt() { return Promise.resolve([]); }

// ── canvas plumbing ─────────────────────────────────────────────────────────
const CACHE = new Map();
const SCRATCH = new Map();
function scratch(w, h) {
  const k = w + 'x' + h;
  let c = SCRATCH.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; SCRATCH.set(k, c); }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.clearRect(0, 0, w, h);
  return c;
}

/**
 * @param {object} def  CardDef-ish: { id, companion, type, rarity }
 * @param {number} w    css pixels
 * @param {number} h    css pixels
 * @param {object} [o]  { upgraded, dpr }
 * @returns {string} data URL
 */
export function cardArt(def, w, h, o = {}) {
  const key = artKey(def, w, h, o);
  const hit = CACHE.get(key);
  if (hit) return hit;
  return render(def, w, h, o, key);
}

function artKey(def, w, h, o) {
  const dpr = Math.min(o.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 2);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  return `${def.id}|${def.type}|${def.companion || 'neutral'}|${W}x${H}|${o.upgraded ? 'u' : ''}`;
}

function render(def, w, h, o, key) {
  const dpr = Math.min(o.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 2);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  paint(g, w, h, def, def.companion || 'neutral', !!o.upgraded);
  const url = cv.toDataURL('image/png');
  if (CACHE.size > 320) CACHE.clear();
  CACHE.set(key, url);
  return url;
}

/**
 * Put the DECODED bitmap in the browser's image cache under the same data URL
 * the CSS will use. Generating the PNG is only half the cost of a cold card —
 * the other half is Blink decoding it the first time it appears as a
 * background-image, which lands inside the frame that starts the animation.
 */
function predecode(url) {
  if (typeof Image !== 'function' || DECODED.has(url)) return null;
  DECODED.add(url);
  if (DECODED.size > 400) DECODED.clear();
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img.decode ? img.decode().catch(() => {}) : null;
}
const DECODED = new Set();

// ── warming ─────────────────────────────────────────────────────────────────
let warmQueue = [];
let warmRAF = 0;

/**
 * Pre-render card art OFF the critical path. Call it on scene entry with every
 * CardDef that can reach the hand this combat (deck + statuses + curses).
 *
 * Painting five fresh canvases inside the frame that starts a draw animation
 * cost 43 fps cold / 56 warm at n=12. With the deck warmed first, every
 * `cardArt()` during motion is a Map hit and the same draw runs at ~61.
 *
 * Work is chunked to a ~6 ms budget per frame, and each finished bitmap is
 * decoded as well as encoded, so the first paint of a card is not a decode
 * stall either.
 *
 * @param {object[]} defs  CardDefs (duplicates fine — keys dedupe)
 * @param {number} w  css px, must match what CardView asks for (ART_W * CARD_SS)
 * @param {number} h  css px (ART_H * CARD_SS)
 * @param {object} [o] { upgraded: boolean | 'both', budgetMs }
 * @returns {Promise<number>} how many were rendered
 */
export function warmArt(defs, w, h, o = {}) {
  const budget = o.budgetMs || 11;
  const jobs = [];
  const seen = new Set();
  const variants = o.upgraded === 'both' ? [false, true] : [!!o.upgraded];
  for (const def of defs || []) {
    if (!def || !def.id) continue;
    for (const up of variants) {
      const opt = { upgraded: up };
      const key = artKey(def, w, h, opt);
      if (seen.has(key) || CACHE.has(key)) continue;
      seen.add(key);
      jobs.push({ def, opt, key });
    }
  }
  if (!jobs.length) return Promise.resolve(0);
  warmQueue = warmQueue.concat(jobs);

  return new Promise((resolve) => {
    let done = 0;
    const decodes = [];
    const step = () => {
      warmRAF = 0;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      while (warmQueue.length) {
        const j = warmQueue.shift();
        const url = CACHE.get(j.key) || render(j.def, w, h, j.opt, j.key);
        if (!CACHE.has(j.key)) CACHE.set(j.key, url);
        const d = predecode(url);
        if (d) decodes.push(d);
        done++;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (now - t0 > budget) break;
      }
      if (warmQueue.length) { warmRAF = requestAnimationFrame(step); return; }
      // Decodes run in the background — do NOT block the caller on them. They
      // are opportunistic, and awaiting 24 of them pushed scene-entry warm-up
      // out past two seconds.
      Promise.all(decodes).catch(() => {});
      fireReady();
      resolve(done);
    };
    if (!warmRAF) warmRAF = requestAnimationFrame(step);
    else resolve(0);
  });
}

/** Synchronous warm — for tests and for a loading screen that can afford it. */
export function warmArtSync(defs, w, h, o = {}) {
  let n = 0;
  const variants = o.upgraded === 'both' ? [false, true] : [!!o.upgraded];
  for (const def of defs || []) {
    if (!def || !def.id) continue;
    for (const up of variants) {
      const opt = { upgraded: up };
      const key = artKey(def, w, h, opt);
      if (!CACHE.has(key)) { render(def, w, h, opt, key); n++; }
    }
  }
  return n;
}

/** How many bitmaps are resident. Used by the test page's fps harness. */
export function artCacheSize() { return CACHE.size; }
export function clearArtCache() { CACHE.clear(); }

// ── the painting ────────────────────────────────────────────────────────────
function paint(g, w, h, def, slug, upgraded) {
  const f = fam(slug);
  const seed = hash32(def.id || 'x');
  const R = mulberry(seed);
  const type = def.type || 'skill';
  const rnd = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];

  // 1 sky ────────────────────────────────────────────────────────────────────
  const sky = g.createLinearGradient(0, 0, w * 0.18, h);
  sky.addColorStop(0, f.sky[1]);
  sky.addColorStop(0.55, mix(f.sky[0], f.sky[1], 0.42));
  sky.addColorStop(1, f.sky[0]);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);

  // a broad off-centre wash so the ground isn't flat
  const wash = g.createRadialGradient(w * rnd(0.3, 0.7), h * 0.9, 0, w * 0.5, h * 0.9, h * 1.25);
  wash.addColorStop(0, rgba(f.glow, 0.16));
  wash.addColorStop(1, rgba(f.glow, 0));
  g.fillStyle = wash; g.fillRect(0, 0, w, h);

  // 2 moon ───────────────────────────────────────────────────────────────────
  const mx = w * (R() < 0.5 ? rnd(0.10, 0.24) : rnd(0.76, 0.91));
  const my = h * rnd(0.10, 0.24);
  const mr = h * rnd(0.085, 0.125);
  const halo = g.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 3.4);
  halo.addColorStop(0, rgba(f.glow, 0.30));
  halo.addColorStop(0.45, rgba(f.glow, 0.10));
  halo.addColorStop(1, rgba(f.glow, 0));
  g.fillStyle = halo; g.beginPath(); g.arc(mx, my, mr * 3.4, 0, 7); g.fill();

  g.save();
  g.beginPath(); g.arc(mx, my, mr, 0, 7);
  if (R() < 0.55) { // crescent
    g.arc(mx + mr * f.crescent * 1.6, my - mr * 0.25, mr * 0.95, 0, 7, true);
  }
  const mg = g.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
  mg.addColorStop(0, lift(f.key, 0.35));
  mg.addColorStop(1, mix(f.key, f.glow, 0.6));
  g.fillStyle = mg; g.fill();
  g.restore();

  // 3 scene silhouette ───────────────────────────────────────────────────────
  drawScene(g, w, h, f, f.scene, R);

  // 4 floor mist ─────────────────────────────────────────────────────────────
  const mist = g.createLinearGradient(0, h * 0.58, 0, h);
  mist.addColorStop(0, rgba(f.glow, 0));
  mist.addColorStop(0.62, rgba(f.glow, 0.13));
  mist.addColorStop(1, rgba(f.glow, 0.03));
  g.fillStyle = mist; g.fillRect(0, h * 0.58, w, h * 0.42);

  // 5 subject ────────────────────────────────────────────────────────────────
  // One silhouette per CARD, not per companion. See SUBJECT_RULES.
  const subject = subjectFor(def);
  const cx = w * rnd(0.44, 0.56), cy = h * 0.58;
  const rad = h * rnd(0.40, 0.47);

  // backlight behind the subject — a rim of family colour so the silhouette
  // separates from the scene even at 45% overlap in a big hand
  const bl = g.createRadialGradient(cx, cy - rad * 0.20, 0, cx, cy - rad * 0.16, rad * 1.7);
  bl.addColorStop(0, rgba(f.glow, 0.58));
  bl.addColorStop(0.45, rgba(f.glow, 0.20));
  bl.addColorStop(1, rgba(f.glow, 0));
  g.fillStyle = bl; g.fillRect(0, 0, w, h);

  if (type === 'power') drawRays(g, cx, cy - rad * 0.22, w, h, f, R);

  // contact shadow so the subject sits in the scene rather than floating
  const sh = g.createRadialGradient(cx, cy + rad * 0.72, 0, cx, cy + rad * 0.72, rad * 1.15);
  sh.addColorStop(0, rgba(sink(f.sky[0], 0.55), 0.55));
  sh.addColorStop(1, rgba(sink(f.sky[0], 0.55), 0));
  g.fillStyle = sh; g.beginPath();
  g.ellipse(cx, cy + rad * 0.72, rad * 1.1, rad * 0.24, 0, 0, 7); g.fill();

  drawMotif(g, cx, cy - rad * 0.10, rad, f, subject, R, true);

  // 6 family accents ─────────────────────────────────────────────────────────
  drawAccents(g, w, h, f, f.motif, R);

  // 7 type overlay ───────────────────────────────────────────────────────────
  if (type === 'attack') drawSlashes(g, w, h, f, R);
  else if (type === 'skill') drawWard(g, w, h, f, R);
  else if (type === 'power') drawRunes(g, w, h, f, R);
  else if (type === 'curse') drawThorns(g, w, h, f, R);
  else if (type === 'status') drawGrime(g, w, h, f, R);

  // 8 particles ──────────────────────────────────────────────────────────────
  const n = 14 + Math.floor(R() * 10);
  for (let i = 0; i < n; i++) {
    const px = rnd(0, w), py = rnd(h * 0.05, h * 0.98), pr = rnd(0.8, 2.6);
    const a = rnd(0.20, 0.75);
    const gg = g.createRadialGradient(px, py, 0, px, py, pr * 4);
    gg.addColorStop(0, rgba(lift(f.key, 0.2), a));
    gg.addColorStop(1, rgba(f.glow, 0));
    g.fillStyle = gg; g.beginPath(); g.arc(px, py, pr * 4, 0, 7); g.fill();
    g.fillStyle = rgba(lift(f.key, 0.45), Math.min(1, a + 0.2));
    g.beginPath(); g.arc(px, py, pr * 0.55, 0, 7); g.fill();
  }

  // 9 grade ──────────────────────────────────────────────────────────────────
  const vig = g.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, rgba(sink(f.sky[0], 0.55), 0.82));
  g.fillStyle = vig; g.fillRect(0, 0, w, h);

  if (upgraded) {
    const up = g.createLinearGradient(0, 0, 0, h);
    up.addColorStop(0, rgba(tokens().flame200, 0.16));
    up.addColorStop(1, rgba(tokens().flame400, 0.05));
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = up; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }

  // bottom fade so the art melts into the card face
  const fade = g.createLinearGradient(0, h * 0.66, 0, h);
  fade.addColorStop(0, rgba(sink(f.sky[0], 0.4), 0));
  fade.addColorStop(1, rgba(sink(f.sky[0], 0.55), 0.95));
  g.fillStyle = fade; g.fillRect(0, h * 0.66, w, h * 0.34);

  // fine grain
  g.globalAlpha = 0.055;
  for (let i = 0; i < 240; i++) {
    g.fillStyle = R() < 0.5 ? '#ffffff' : '#000000';
    g.fillRect(Math.floor(R() * w), Math.floor(R() * h), 1, 1);
  }
  g.globalAlpha = 1;
}

// ── scenes (background silhouettes) ─────────────────────────────────────────
function drawScene(g, w, h, f, kind, R) {
  const base = h * 0.80;
  g.save();
  g.fillStyle = f.silh;
  g.strokeStyle = f.silh;
  switch (kind) {
    case 'mansion': {
      let x = -w * 0.05;
      while (x < w * 1.05) {
        const bw = w * (0.16 + R() * 0.16), bh = h * (0.16 + R() * 0.26);
        g.beginPath();
        g.moveTo(x, base);
        g.lineTo(x, base - bh);
        g.lineTo(x + bw / 2, base - bh - h * 0.09);   // gable
        g.lineTo(x + bw, base - bh);
        g.lineTo(x + bw, base);
        g.closePath(); g.fill();
        if (R() < 0.62) {                              // lit window
          g.fillStyle = rgba(f.glow, 0.42);
          const ww = bw * 0.16;
          g.fillRect(x + bw * 0.28, base - bh * 0.62, ww, ww * 1.5);
          g.fillStyle = f.silh;
        }
        x += bw * 0.92;
      }
      break;
    }
    case 'graves': {
      // iron fence
      g.globalAlpha = 0.75;
      for (let x = w * 0.02; x < w; x += w * 0.052) {
        g.fillRect(x, base - h * 0.15, w * 0.011, h * 0.15);
        g.beginPath(); g.moveTo(x - w * 0.006, base - h * 0.15);
        g.lineTo(x + w * 0.0055, base - h * 0.19); g.lineTo(x + w * 0.017, base - h * 0.15);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const gx = w * (0.08 + i * 0.28 + R() * 0.06), gw = w * (0.10 + R() * 0.05), gh = h * (0.16 + R() * 0.10);
        g.save(); g.translate(gx, base); g.rotate((R() - 0.5) * 0.16);
        g.beginPath();
        g.moveTo(-gw / 2, 0); g.lineTo(-gw / 2, -gh + gw / 2);
        g.arc(0, -gh + gw / 2, gw / 2, Math.PI, 0);
        g.lineTo(gw / 2, 0); g.closePath(); g.fill();
        g.restore();
      }
      break;
    }
    case 'vines': {
      for (let i = 0; i < 3; i++) {
        const y0 = h * (0.10 + i * 0.30);
        g.lineWidth = h * 0.016; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-w * 0.05, y0);
        g.bezierCurveTo(w * 0.3, y0 + h * 0.14, w * 0.7, y0 - h * 0.14, w * 1.05, y0 + h * 0.05);
        g.stroke();
        for (let k = 0; k < 4; k++) {
          const lx = w * (0.12 + k * 0.24 + R() * 0.07), ly = y0 + h * (R() - 0.5) * 0.14;
          leaf(g, lx, ly, h * (0.05 + R() * 0.03), (R() - 0.5) * 2, f.silh);
        }
      }
      break;
    }
    case 'drapes': {
      for (let i = 0; i < 5; i++) {
        const x = w * (i / 5), bw = w / 5;
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + bw, 0);
        g.lineTo(x + bw, h * (0.16 + R() * 0.10));
        g.quadraticCurveTo(x + bw / 2, h * (0.30 + R() * 0.12), x, h * (0.16 + R() * 0.10));
        g.closePath(); g.fill();
      }
      break;
    }
    case 'lanterns': {
      for (let i = 0; i < 4; i++) {
        const x = w * (0.12 + i * 0.26 + R() * 0.05), y = h * (0.10 + R() * 0.24), s = h * (0.07 + R() * 0.04);
        g.lineWidth = Math.max(1, h * 0.006);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - s * 0.6); g.stroke();
        g.beginPath();
        g.moveTo(x - s * 0.4, y - s * 0.5); g.lineTo(x + s * 0.4, y - s * 0.5);
        g.lineTo(x + s * 0.3, y + s * 0.5); g.lineTo(x - s * 0.3, y + s * 0.5);
        g.closePath(); g.fill();
        const lg = g.createRadialGradient(x, y, 0, x, y, s * 2.4);
        lg.addColorStop(0, rgba(f.glow, 0.55)); lg.addColorStop(1, rgba(f.glow, 0));
        g.fillStyle = lg; g.beginPath(); g.arc(x, y, s * 2.4, 0, 7); g.fill();
        g.fillStyle = f.silh;
      }
      break;
    }
    case 'bed': {
      g.fillRect(0, base, w, h - base);
      g.beginPath();
      g.moveTo(-w * 0.1, base); g.lineTo(-w * 0.1, base - h * 0.30);
      g.lineTo(w * 0.16, base - h * 0.30); g.lineTo(w * 0.16, base);
      g.closePath(); g.fill();
      g.globalAlpha = 0.8;
      for (let x = 0; x < w; x += w * 0.09) {
        g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + w * 0.045, base - h * 0.06, x + w * 0.09, base);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'web': {
      const ox = R() < 0.5 ? 0 : w, oy = 0;
      g.strokeStyle = rgba(lift(f.key, 0.1), 0.30);
      g.lineWidth = Math.max(1, h * 0.005);
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 2) * (i / 6) + (ox ? Math.PI / 2 : 0);
        g.beginPath(); g.moveTo(ox, oy);
        g.lineTo(ox + Math.cos(a) * w * 1.2 * (ox ? -1 : 1), oy + Math.sin(a) * h * 1.2);
        g.stroke();
      }
      for (let r = 1; r <= 5; r++) {
        const rr = (h * 0.20) * r;
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (Math.PI / 2) * (i / 6) + (ox ? Math.PI / 2 : 0);
          const px = ox + Math.cos(a) * rr * (ox ? -1 : 1), py = oy + Math.sin(a) * rr;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
      }
      break;
    }
    case 'thorns': {
      g.lineWidth = h * 0.014;
      for (let i = 0; i < 4; i++) {
        const y0 = h * (0.08 + i * 0.28);
        g.beginPath(); g.moveTo(-w * 0.05, y0);
        g.bezierCurveTo(w * 0.35, y0 + h * 0.18, w * 0.65, y0 - h * 0.18, w * 1.05, y0);
        g.stroke();
        for (let k = 0; k < 6; k++) {
          const tx = w * (0.06 + k * 0.17), ty = y0 + h * (R() - 0.5) * 0.1;
          g.beginPath(); g.moveTo(tx, ty);
          g.lineTo(tx + h * 0.02, ty - h * 0.055); g.lineTo(tx + h * 0.035, ty);
          g.closePath(); g.fill();
        }
      }
      break;
    }
    case 'rain': {
      g.strokeStyle = rgba(lift(f.key, 0.1), 0.26);
      g.lineWidth = Math.max(1, h * 0.006);
      for (let i = 0; i < 34; i++) {
        const x = R() * w * 1.2 - w * 0.1, y = R() * h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - h * 0.03, y + h * 0.09); g.stroke();
      }
      break;
    }
    case 'books': {
      for (let i = 0; i < 9; i++) {
        const x = w * (0.03 + i * 0.107), bh = h * (0.14 + R() * 0.12), bw = w * (0.05 + R() * 0.035);
        g.save(); g.translate(x, base); g.rotate((R() - 0.5) * 0.22);
        g.fillRect(0, -bh, bw, bh);
        g.restore();
      }
      break;
    }
    case 'hedge': {
      g.beginPath(); g.moveTo(-w * 0.05, h);
      for (let x = -w * 0.05; x <= w * 1.05; x += w * 0.08) {
        g.lineTo(x, base - h * (0.06 + R() * 0.10));
      }
      g.lineTo(w * 1.05, h); g.closePath(); g.fill();
      break;
    }
    case 'drips': {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.12);
      for (let x = w; x >= 0; x -= w * 0.1) {
        g.quadraticCurveTo(x - w * 0.05, h * (0.12 + R() * 0.16), x - w * 0.1, h * 0.12);
      }
      g.closePath(); g.fill();
      break;
    }
    case 'nursery': {
      for (let i = 0; i < 6; i++) {
        const x = w * (0.06 + i * 0.18), y = h * (0.08 + R() * 0.2), s = h * 0.035;
        star(g, x, y, s, 5, 0.45, rgba(lift(f.key, 0.2), 0.35));
      }
      g.fillStyle = f.silh;
      g.fillRect(0, base + h * 0.06, w, h);
      break;
    }
    default: { // 'passage'
      g.globalAlpha = 0.7;
      for (let i = 0; i < 5; i++) {
        const x = w * (i * 0.24 - 0.08);
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + w * 0.14, 0);
        g.lineTo(x + w * 0.09, h); g.lineTo(x - w * 0.05, h);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  g.restore();
}

// ── motifs (the subject when there is no portrait) ──────────────────────────
function drawMotif(g, cx, cy, r, f, kind, R, big) {
  g.save();
  g.translate(cx, cy);
  /* Per-card variation of the SILHOUETTE, not just the palette. Even with the
     widened rules table two cards in one hand can legitimately land on the
     same subject (a Bones deck really is mostly bones). A mirror and a few
     degrees of tilt, both keyed off the card's own seed, change the outline
     itself, so "same subject" never reads as "same picture". Consumes two
     draws from R, deliberately before any shape is laid out. */
  if (typeof R === 'function') {
    g.rotate((R() - 0.5) * 0.22);
    if (R() < 0.5) g.scale(-1, 1);
  }
  const fill = mix(f.key, f.glow, 0.35);
  const line = sink(f.sky[0], 0.35);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = r * 0.10;
  g.strokeStyle = line;
  g.fillStyle = fill;

  const shade = () => {
    const s = g.createLinearGradient(0, -r, 0, r);
    s.addColorStop(0, lift(fill, 0.25));
    s.addColorStop(1, sink(fill, 0.35));
    g.fillStyle = s;
  };

  switch (kind) {
    case 'cat': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.72, -r * 0.30); g.lineTo(-r * 0.52, -r * 0.92); g.lineTo(-r * 0.16, -r * 0.50);
      g.lineTo(r * 0.16, -r * 0.50); g.lineTo(r * 0.52, -r * 0.92); g.lineTo(r * 0.72, -r * 0.30);
      g.bezierCurveTo(r * 0.95, r * 0.42, r * 0.45, r * 0.80, 0, r * 0.80);
      g.bezierCurveTo(-r * 0.45, r * 0.80, -r * 0.95, r * 0.42, -r * 0.72, -r * 0.30);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = line;
      g.beginPath(); g.ellipse(-r * 0.30, r * 0.05, r * 0.13, r * 0.17, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(r * 0.30, r * 0.05, r * 0.13, r * 0.17, 0, 0, 7); g.fill();
      g.fillStyle = lift(f.key, 0.5);
      g.beginPath(); g.arc(-r * 0.26, r * 0.0, r * 0.05, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.34, r * 0.0, r * 0.05, 0, 7); g.fill();
      // tail curl
      g.strokeStyle = fill; g.lineWidth = r * 0.14;
      g.beginPath(); g.moveTo(r * 0.70, r * 0.55);
      g.bezierCurveTo(r * 1.25, r * 0.45, r * 1.20, -r * 0.15, r * 0.85, -r * 0.05);
      g.stroke();
      break;
    }
    // ── cat, curled up asleep: a fat comma with ears and a tail round it ──
    case 'curl': {
      shade();
      g.beginPath();                              // body
      g.ellipse(0, r * 0.16, r * 0.86, r * 0.62, 0, 0, 7);
      g.fill(); g.stroke();
      g.beginPath();                              // head tucked to the left
      g.arc(-r * 0.44, -r * 0.16, r * 0.40, 0, 7);
      g.fill(); g.stroke();
      g.beginPath();                              // ears
      g.moveTo(-r * 0.72, -r * 0.40); g.lineTo(-r * 0.68, -r * 0.80); g.lineTo(-r * 0.34, -r * 0.50);
      g.closePath(); g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(-r * 0.26, -r * 0.50); g.lineTo(-r * 0.10, -r * 0.78); g.lineTo(-r * 0.06, -r * 0.38);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = fill; g.lineWidth = r * 0.20; g.lineCap = 'round';
      g.beginPath();                              // tail curled round the front
      g.moveTo(r * 0.78, r * 0.30);
      g.bezierCurveTo(r * 1.05, r * 0.85, -r * 0.30, r * 0.98, -r * 0.72, r * 0.42);
      g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.06;
      g.beginPath();                              // closed, sleeping eye
      g.arc(-r * 0.50, -r * 0.16, r * 0.16, 0.25, Math.PI - 0.25);
      g.stroke();
      // zzz
      g.fillStyle = lift(f.key, 0.4);
      for (let i = 0; i < 3; i++) {
        const s = r * (0.11 + i * 0.05), zx = r * (0.34 + i * 0.30), zy = -r * (0.62 + i * 0.30);
        g.beginPath();
        g.moveTo(zx - s, zy - s); g.lineTo(zx + s, zy - s); g.lineTo(zx - s, zy + s); g.lineTo(zx + s, zy + s);
        g.lineTo(zx + s, zy + s * 1.3); g.lineTo(zx - s * 1.3, zy + s * 1.3);
        g.lineTo(zx + s, zy - s * 1.3); g.lineTo(zx - s * 1.3, zy - s * 1.3);
        g.closePath(); g.fill();
      }
      break;
    }

    // ── cat mid-pounce: stretched, forelegs out, tail streaming behind ────
    case 'pounce': {
      shade();
      g.rotate(-0.22);
      g.beginPath();                              // stretched body
      g.ellipse(0, 0, r * 0.95, r * 0.40, 0, 0, 7);
      g.fill(); g.stroke();
      g.beginPath();                              // head, forward and low
      g.arc(r * 0.82, -r * 0.16, r * 0.34, 0, 7);
      g.fill(); g.stroke();
      for (const o of [-1, 1]) {                  // ears
        g.beginPath();
        g.moveTo(r * (0.66 + o * 0.10), -r * 0.40);
        g.lineTo(r * (0.72 + o * 0.14), -r * 0.78);
        g.lineTo(r * (0.94 + o * 0.06), -r * 0.42);
        g.closePath(); g.fill(); g.stroke();
      }
      g.strokeStyle = fill; g.lineWidth = r * 0.17; g.lineCap = 'round';
      g.beginPath();                              // forelegs reaching
      g.moveTo(r * 0.52, r * 0.16); g.quadraticCurveTo(r * 1.02, r * 0.34, r * 1.30, r * 0.10); g.stroke();
      g.beginPath();
      g.moveTo(r * 0.40, r * 0.30); g.quadraticCurveTo(r * 0.92, r * 0.58, r * 1.22, r * 0.40); g.stroke();
      g.beginPath();                              // back legs coiled
      g.moveTo(-r * 0.62, r * 0.22); g.quadraticCurveTo(-r * 0.98, r * 0.56, -r * 0.66, r * 0.72); g.stroke();
      g.lineWidth = r * 0.13;
      g.beginPath();                              // tail streaming
      g.moveTo(-r * 0.90, -r * 0.06);
      g.bezierCurveTo(-r * 1.35, -r * 0.30, -r * 1.42, -r * 0.86, -r * 1.02, -r * 1.00);
      g.stroke();
      g.fillStyle = lift(f.key, 0.55);            // eye
      g.beginPath(); g.ellipse(r * 0.92, -r * 0.20, r * 0.09, r * 0.06, -0.2, 0, 7); g.fill();
      // motion streaks behind the leap
      g.strokeStyle = rgba(lift(f.key, 0.3), 0.42); g.lineWidth = r * 0.05;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(-r * 1.15, r * i * 0.30); g.lineTo(-r * 1.75, r * i * 0.44); g.stroke();
      }
      break;
    }

    // ── little sheeted ghost ──────────────────────────────────────────────
    case 'ghost': {
      const gg = g.createLinearGradient(0, -r, 0, r);
      gg.addColorStop(0, lift(f.key, 0.55));
      gg.addColorStop(1, mix(f.key, f.glow, 0.7));
      g.fillStyle = gg;
      g.beginPath();
      g.moveTo(-r * 0.72, r * 0.72);
      g.lineTo(-r * 0.72, -r * 0.10);
      g.arc(0, -r * 0.10, r * 0.72, Math.PI, 0);
      g.lineTo(r * 0.72, r * 0.72);
      for (let i = 0; i < 4; i++) {               // scalloped hem
        const x1 = r * (0.72 - i * 0.36), x2 = r * (0.72 - (i + 1) * 0.36);
        g.quadraticCurveTo((x1 + x2) / 2, r * (i % 2 ? 1.02 : 0.42), x2, r * 0.72);
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = sink(f.sky[0], 0.45);
      g.beginPath(); g.ellipse(-r * 0.26, -r * 0.16, r * 0.11, r * 0.15, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(r * 0.26, -r * 0.16, r * 0.11, r * 0.15, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(0, r * 0.20, r * 0.17, r * 0.12, 0, 0, 7); g.fill();
      break;
    }

    // ── nine lives: a cat's head inside a ring of tally marks ─────────────
    case 'ninelives': {
      g.strokeStyle = rgba(lift(f.key, 0.35), 0.8); g.lineWidth = r * 0.06;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        g.lineTo(Math.cos(a) * r * 1.14, Math.sin(a) * r * 1.14);
        g.stroke();
      }
      shade();
      g.beginPath();
      g.moveTo(-r * 0.58, -r * 0.20); g.lineTo(-r * 0.42, -r * 0.74); g.lineTo(-r * 0.12, -r * 0.38);
      g.lineTo(r * 0.12, -r * 0.38); g.lineTo(r * 0.42, -r * 0.74); g.lineTo(r * 0.58, -r * 0.20);
      g.bezierCurveTo(r * 0.76, r * 0.42, -r * 0.76, r * 0.42, -r * 0.58, -r * 0.20);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = lift(f.key, 0.6);
      g.beginPath(); g.arc(-r * 0.22, -r * 0.06, r * 0.09, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.22, -r * 0.06, r * 0.09, 0, 7); g.fill();
      break;
    }

    // ── flask / draught ───────────────────────────────────────────────────
    case 'flask': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.22, -r * 0.86);
      g.lineTo(-r * 0.22, -r * 0.28);
      g.bezierCurveTo(-r * 0.86, r * 0.12, -r * 0.66, r * 0.86, 0, r * 0.86);
      g.bezierCurveTo(r * 0.66, r * 0.86, r * 0.86, r * 0.12, r * 0.22, -r * 0.28);
      g.lineTo(r * 0.22, -r * 0.86);
      g.closePath(); g.fill(); g.stroke();
      g.save();                                    // liquid
      g.beginPath();
      g.moveTo(-r * 0.62, r * 0.14);
      g.bezierCurveTo(-r * 0.66, r * 0.86, r * 0.66, r * 0.86, r * 0.62, r * 0.14);
      g.closePath(); g.clip();
      g.fillStyle = rgba(f.glow, 0.85); g.fillRect(-r, r * 0.12, r * 2, r);
      g.fillStyle = rgba(lift(f.key, 0.5), 0.5);
      g.beginPath(); g.arc(-r * 0.2, r * 0.48, r * 0.10, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.24, r * 0.62, r * 0.07, 0, 7); g.fill();
      g.restore();
      g.fillStyle = sink(fill, 0.2);               // stopper
      g.beginPath(); g.roundRect(-r * 0.30, -r * 1.06, r * 0.60, r * 0.26, r * 0.08); g.fill(); g.stroke();
      break;
    }

    // ── candy drip: a wrapped sweet melting ───────────────────────────────
    case 'candy': {
      shade();
      g.beginPath(); g.ellipse(0, -r * 0.06, r * 0.56, r * 0.52, 0, 0, 7); g.fill(); g.stroke();
      for (const o of [-1, 1]) {                   // wrapper twists
        g.beginPath();
        g.moveTo(o * r * 0.50, -r * 0.22);
        g.lineTo(o * r * 1.02, -r * 0.56);
        g.lineTo(o * r * 0.92, -r * 0.02);
        g.lineTo(o * r * 1.06, r * 0.42);
        g.lineTo(o * r * 0.50, r * 0.14);
        g.closePath(); g.fill(); g.stroke();
      }
      g.strokeStyle = rgba(lift(f.key, 0.5), 0.85); g.lineWidth = r * 0.09;
      for (let i = -1; i <= 1; i++) {              // swirl stripes
        g.beginPath();
        g.arc(0, -r * 0.06, r * (0.18 + i * 0.14 + 0.16), -0.9, 1.6);
        g.stroke();
      }
      g.fillStyle = mix(PIGMENT.candy, f.glow, 0.4);
      for (let i = -1; i <= 1; i++) {              // drips off the bottom
        const x = i * r * 0.32, dl = r * (0.42 + Math.abs(i) * 0.16);
        g.beginPath(); g.moveTo(x - r * 0.11, r * 0.36);
        g.quadraticCurveTo(x, r * 0.46 + dl, x + r * 0.11, r * 0.36);
        g.closePath(); g.fill();
        g.beginPath(); g.arc(x, r * 0.48 + dl * 0.92, r * 0.10, 0, 7); g.fill();
      }
      break;
    }

    // ── a single big paw print ────────────────────────────────────────────
    case 'paw': {
      shade();
      g.beginPath(); g.ellipse(0, r * 0.34, r * 0.62, r * 0.50, 0, 0, 7); g.fill(); g.stroke();
      const toes = [[-0.62, -0.30, -0.35], [-0.24, -0.56, -0.14], [0.24, -0.56, 0.14], [0.62, -0.30, 0.35]];
      for (const [tx, ty, rot] of toes) {
        g.beginPath();
        g.ellipse(tx * r, ty * r, r * 0.20, r * 0.27, rot, 0, 7);
        g.fill(); g.stroke();
      }
      break;
    }

    // ── ward: a heater shield with a rune ─────────────────────────────────
    case 'ward': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.72, -r * 0.78);
      g.lineTo(r * 0.72, -r * 0.78);
      g.lineTo(r * 0.66, r * 0.20);
      g.quadraticCurveTo(r * 0.40, r * 0.92, 0, r * 1.02);
      g.quadraticCurveTo(-r * 0.40, r * 0.92, -r * 0.66, r * 0.20);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = rgba(lift(f.key, 0.45), 0.9); g.lineWidth = r * 0.09;
      g.beginPath();
      g.moveTo(0, -r * 0.48); g.lineTo(0, r * 0.52);
      g.moveTo(-r * 0.34, -r * 0.10); g.lineTo(r * 0.34, -r * 0.10);
      g.stroke();
      g.strokeStyle = rgba(lift(f.key, 0.2), 0.5); g.lineWidth = r * 0.05;
      g.beginPath();
      g.moveTo(-r * 0.56, -r * 0.62); g.lineTo(r * 0.56, -r * 0.62); g.stroke();
      break;
    }

    // ── a web corner with a dangling spider thread ────────────────────────
    case 'webbing': {
      g.strokeStyle = rgba(lift(f.key, 0.25), 0.85); g.lineWidth = r * 0.055; g.lineCap = 'round';
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI * (0.12 + (i / 6) * 0.76);
        g.beginPath(); g.moveTo(0, -r * 0.95);
        g.lineTo(Math.cos(a) * r * 1.25, -r * 0.95 + Math.sin(a) * r * 1.25);
        g.stroke();
      }
      for (let k = 1; k <= 4; k++) {
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI * (0.12 + (i / 6) * 0.76), rr = r * 0.30 * k;
          const px = Math.cos(a) * rr, py = -r * 0.95 + Math.sin(a) * rr;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
      }
      shade();
      g.beginPath(); g.ellipse(0, r * 0.42, r * 0.30, r * 0.26, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.05;
      for (let i = 0; i < 4; i++) {
        for (const o of [-1, 1]) {
          g.beginPath(); g.moveTo(o * r * 0.22, r * (0.30 + i * 0.10));
          g.quadraticCurveTo(o * r * 0.62, r * (0.22 + i * 0.14), o * r * 0.74, r * (0.52 + i * 0.12));
          g.stroke();
        }
      }
      g.fillStyle = lift(f.key, 0.6);
      g.beginPath(); g.arc(-r * 0.10, r * 0.36, r * 0.06, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.10, r * 0.36, r * 0.06, 0, 7); g.fill();
      break;
    }

    case 'bone': {
      shade();
      g.rotate(-0.5);
      const bl = r * 1.35, bw = r * 0.24;
      g.beginPath(); g.roundRect(-bl / 2, -bw / 2, bl, bw, bw / 2); g.fill(); g.stroke();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.beginPath(); g.arc(sx * bl / 2, sy * bw * 0.8, bw * 0.72, 0, 7); g.fill(); g.stroke();
      }
      break;
    }
    case 'pumpkin': {
      shade();
      g.beginPath(); g.ellipse(0, r * 0.1, r * 0.92, r * 0.78, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = sink(fill, 0.35); g.lineWidth = r * 0.05;
      for (const o of [-0.5, 0, 0.5]) {
        g.beginPath(); g.ellipse(o * r * 0.55, r * 0.1, r * 0.30, r * 0.77, 0, 0, 7); g.stroke();
      }
      g.fillStyle = sink(f.sky[0], 0.4);
      tri(g, -r * 0.36, -r * 0.14, r * 0.24);
      tri(g, r * 0.36, -r * 0.14, r * 0.24);
      g.beginPath();
      g.moveTo(-r * 0.45, r * 0.30); g.lineTo(-r * 0.22, r * 0.52); g.lineTo(0, r * 0.32);
      g.lineTo(r * 0.22, r * 0.52); g.lineTo(r * 0.45, r * 0.30);
      g.lineTo(r * 0.30, r * 0.58); g.lineTo(-r * 0.30, r * 0.58);
      g.closePath(); g.fill();
      g.strokeStyle = PIGMENT.moss; g.lineWidth = r * 0.12;
      g.beginPath(); g.moveTo(0, -r * 0.68); g.quadraticCurveTo(r * 0.12, -r * 0.95, -r * 0.05, -r * 1.05); g.stroke();
      break;
    }
    case 'drip': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.85, -r * 0.2);
      g.bezierCurveTo(-r * 0.85, r * 0.75, r * 0.85, r * 0.75, r * 0.85, -r * 0.2);
      g.bezierCurveTo(r * 0.6, -r * 0.85, -r * 0.6, -r * 0.85, -r * 0.85, -r * 0.2);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = fill;
      for (let i = -2; i <= 2; i++) {
        const x = i * r * 0.34, dl = r * (0.25 + Math.abs(i) * 0.12);
        g.beginPath(); g.moveTo(x - r * 0.10, r * 0.35);
        g.quadraticCurveTo(x, r * 0.45 + dl, x + r * 0.10, r * 0.35);
        g.closePath(); g.fill();
        g.beginPath(); g.arc(x, r * 0.45 + dl * 0.9, r * 0.09, 0, 7); g.fill();
      }
      g.fillStyle = sink(f.sky[0], 0.35);
      g.beginPath(); g.arc(-r * 0.28, -r * 0.12, r * 0.12, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.28, -r * 0.12, r * 0.12, 0, 7); g.fill();
      break;
    }
    case 'eye': {
      shade();
      g.beginPath(); g.ellipse(0, 0, r * 0.92, r * 0.72, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = mix(f.sec, f.glow, 0.4);
      g.beginPath(); g.arc(0, 0, r * 0.40, 0, 7); g.fill();
      g.fillStyle = sink(f.sky[0], 0.5);
      g.beginPath(); g.arc(0, 0, r * 0.20, 0, 7); g.fill();
      g.fillStyle = lift(f.key, 0.6);
      g.beginPath(); g.arc(-r * 0.13, -r * 0.15, r * 0.08, 0, 7); g.fill();
      g.strokeStyle = fill; g.lineWidth = r * 0.08;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.66);
        g.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.15);
        g.stroke();
      }
      break;
    }
    case 'flame': {
      const fg = g.createLinearGradient(0, r * 0.8, 0, -r);
      fg.addColorStop(0, sink(f.glow, 0.2)); fg.addColorStop(0.6, f.glow); fg.addColorStop(1, lift(f.key, 0.5));
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(0, -r * 1.05);
      g.bezierCurveTo(r * 0.62, -r * 0.35, r * 0.72, r * 0.45, 0, r * 0.82);
      g.bezierCurveTo(-r * 0.72, r * 0.45, -r * 0.62, -r * 0.35, 0, -r * 1.05);
      g.closePath(); g.fill();
      g.fillStyle = rgba(lift(f.key, 0.7), 0.85);
      g.beginPath(); g.ellipse(0, r * 0.22, r * 0.24, r * 0.36, 0, 0, 7); g.fill();
      break;
    }
    case 'fang': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.8, -r * 0.35); g.quadraticCurveTo(0, -r * 0.75, r * 0.8, -r * 0.35);
      g.quadraticCurveTo(0, r * 0.15, -r * 0.8, -r * 0.35); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = lift(f.key, 0.5);
      for (const sx of [-0.42, 0.42]) {
        g.beginPath(); g.moveTo(sx * r - r * 0.11, -r * 0.22);
        g.lineTo(sx * r + r * 0.11, -r * 0.22); g.lineTo(sx * r, r * 0.42); g.closePath(); g.fill();
      }
      break;
    }
    case 'claw': {
      shade();
      for (let i = -1; i <= 1; i++) {
        g.save(); g.rotate(i * 0.28);
        g.beginPath();
        g.moveTo(-r * 0.16, -r * 0.85);
        g.quadraticCurveTo(r * 0.16, -r * 0.2, 0, r * 0.85);
        g.quadraticCurveTo(-r * 0.30, -r * 0.1, -r * 0.16, -r * 0.85);
        g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
      break;
    }
    case 'quill': {
      shade();
      g.beginPath(); g.ellipse(0, r * 0.22, r * 0.85, r * 0.58, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = sink(fill, 0.3); g.lineWidth = r * 0.07;
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.78, r * 0.22 + Math.sin(a) * r * 0.5);
        g.lineTo(Math.cos(a) * r * 1.22, r * 0.22 + Math.sin(a) * r * 0.95);
        g.stroke();
      }
      break;
    }
    case 'swirl': {
      g.strokeStyle = fill; g.lineWidth = r * 0.16; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 90; i++) {
        const t = i / 89, a = t * Math.PI * 3.1, rr = r * (0.15 + t * 0.85);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.75;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
      break;
    }
    case 'stitch': {
      shade();
      g.beginPath();
      g.moveTo(0, r * 0.72);
      g.bezierCurveTo(-r * 1.15, -r * 0.05, -r * 0.55, -r * 0.95, 0, -r * 0.34);
      g.bezierCurveTo(r * 0.55, -r * 0.95, r * 1.15, -r * 0.05, 0, r * 0.72);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = sink(f.sky[0], 0.4); g.lineWidth = r * 0.06;
      g.setLineDash([r * 0.12, r * 0.12]);
      g.beginPath(); g.moveTo(-r * 0.05, -r * 0.3); g.lineTo(-r * 0.05, r * 0.5); g.stroke();
      g.setLineDash([]);
      break;
    }
    case 'cloud': {
      shade();
      g.beginPath();
      g.arc(-r * 0.45, 0, r * 0.42, 0, 7);
      g.arc(0, -r * 0.22, r * 0.55, 0, 7);
      g.arc(r * 0.48, 0, r * 0.40, 0, 7);
      g.rect(-r * 0.45, -r * 0.05, r * 0.95, r * 0.45);
      g.fill();
      g.fillStyle = rgba(f.glow, 0.8);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.3, r * 0.5); g.lineTo(i * r * 0.3 - r * 0.1, r * 0.95);
        g.lineTo(i * r * 0.3 + r * 0.04, r * 0.9); g.closePath(); g.fill();
      }
      break;
    }
    case 'pawbone': {
      shade();
      g.beginPath(); g.ellipse(0, r * 0.28, r * 0.55, r * 0.45, 0, 0, 7); g.fill(); g.stroke();
      for (let i = -1.5; i <= 1.5; i++) {
        g.beginPath(); g.ellipse(i * r * 0.34, -r * 0.42, r * 0.17, r * 0.24, i * 0.2, 0, 7); g.fill(); g.stroke();
      }
      break;
    }
    case 'feather': {
      shade();
      g.rotate(-0.4);
      g.beginPath();
      g.moveTo(0, -r); g.quadraticCurveTo(r * 0.55, 0, 0, r);
      g.quadraticCurveTo(-r * 0.55, 0, 0, -r); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = sink(fill, 0.4); g.lineWidth = r * 0.045;
      for (let i = -6; i <= 6; i++) {
        const y = i * r * 0.13;
        g.beginPath(); g.moveTo(0, y);
        g.lineTo((i % 2 ? 1 : -1) * r * 0.34, y + r * 0.16); g.stroke();
      }
      break;
    }
    case 'tomb': {
      shade();
      g.beginPath();
      g.moveTo(-r * 0.6, r * 0.8); g.lineTo(-r * 0.6, -r * 0.2);
      g.arc(0, -r * 0.2, r * 0.6, Math.PI, 0);
      g.lineTo(r * 0.6, r * 0.8); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = PIGMENT.moss;
      g.beginPath(); g.ellipse(-r * 0.32, r * 0.55, r * 0.3, r * 0.14, 0.2, 0, 7); g.fill();
      g.strokeStyle = sink(f.sky[0], 0.4); g.lineWidth = r * 0.09;
      g.beginPath(); g.moveTo(0, -r * 0.4); g.lineTo(0, r * 0.2); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.22, -r * 0.18); g.lineTo(r * 0.22, -r * 0.18); g.stroke();
      break;
    }
    case 'sprig': {
      g.strokeStyle = PIGMENT.rot; g.lineWidth = r * 0.11;
      g.beginPath(); g.moveTo(0, r * 0.9); g.quadraticCurveTo(r * 0.12, 0, -r * 0.05, -r * 0.9); g.stroke();
      for (let i = 0; i < 5; i++) {
        const y = r * (0.7 - i * 0.36), sx = i % 2 ? 1 : -1;
        leaf(g, sx * r * 0.34, y, r * 0.36, sx * 0.7, mix(PIGMENT.leaf, f.glow, 0.25));
      }
      break;
    }
    /* ── round 4: eight shapes so the fallback pools are not four ──────────
       `TYPE_POOL.skill` had `ward / curl / swirl / paw` for ~40 unmatched
       skills per companion, so two cards in one hand — or two of three in a
       reward triple — routinely drew the same picture. These are deliberately
       companion-NEUTRAL: a spring, a key, a die and an hourglass suit a dog,
       a cat, a frog, a blob or a spider equally, which is what a fallback has
       to do. Family-specific shapes (cat, pumpkin, candy, drip) stay out of
       the pools and are only ever reached by a card's own name.            */
    case 'ball': {                              // a toy ball: seam + highlight
      shade();
      g.beginPath(); g.arc(0, 0, r * 0.72, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.09;
      g.beginPath(); g.ellipse(0, 0, r * 0.30, r * 0.72, 0, 0, 7); g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.72, -2.5, -0.7); g.stroke();
      g.fillStyle = lift(f.key, 0.55); g.globalAlpha = 0.75;
      g.beginPath(); g.ellipse(-r * 0.28, -r * 0.34, r * 0.17, r * 0.11, -0.5, 0, 7); g.fill();
      g.globalAlpha = 1;
      break;
    }
    case 'collar': {                            // a banded collar with a tag
      g.strokeStyle = fill; g.lineWidth = r * 0.30;
      g.beginPath(); g.arc(0, -r * 0.18, r * 0.62, 0.18, Math.PI - 0.18); g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.06;
      g.beginPath(); g.arc(0, -r * 0.18, r * 0.47, 0.18, Math.PI - 0.18); g.stroke();
      g.beginPath(); g.arc(0, -r * 0.18, r * 0.77, 0.18, Math.PI - 0.18); g.stroke();
      shade();
      g.beginPath(); g.arc(0, r * 0.64, r * 0.30, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.07;
      g.beginPath(); g.moveTo(0, r * 0.44); g.lineTo(0, r * 0.34); g.stroke();
      break;
    }
    case 'key': {                               // a skeleton key
      shade();
      g.beginPath(); g.arc(0, -r * 0.52, r * 0.34, 0, 7); g.fill(); g.stroke();
      g.fillStyle = sink(f.sky[0], 0.42);
      g.beginPath(); g.arc(0, -r * 0.52, r * 0.14, 0, 7); g.fill();
      shade();
      g.beginPath(); g.rect(-r * 0.10, -r * 0.24, r * 0.20, r * 1.06); g.fill(); g.stroke();
      g.beginPath(); g.rect(r * 0.06, r * 0.42, r * 0.32, r * 0.16); g.fill(); g.stroke();
      g.beginPath(); g.rect(r * 0.06, r * 0.68, r * 0.22, r * 0.14); g.fill(); g.stroke();
      break;
    }
    case 'coil': {                              // a spring, wound and ready
      g.strokeStyle = fill; g.lineWidth = r * 0.16;
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, a = t * Math.PI * 6;
        const x = Math.cos(a) * r * 0.56;
        const y = -r * 0.74 + t * r * 1.48 + Math.sin(a) * r * 0.10;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.06;
      g.beginPath(); g.moveTo(-r * 0.58, -r * 0.82); g.lineTo(r * 0.58, -r * 0.82); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.58, r * 0.82); g.lineTo(r * 0.58, r * 0.82); g.stroke();
      break;
    }
    case 'blob': {                              // an amorphous, wobbling mass
      shade();
      g.beginPath();
      g.moveTo(-r * 0.86, r * 0.30);
      g.bezierCurveTo(-r * 0.98, -r * 0.34, -r * 0.46, -r * 0.86, r * 0.06, -r * 0.72);
      g.bezierCurveTo(r * 0.58, -r * 0.60, r * 0.96, -r * 0.10, r * 0.84, r * 0.34);
      g.bezierCurveTo(r * 0.74, r * 0.74, r * 0.24, r * 0.88, -r * 0.20, r * 0.80);
      g.bezierCurveTo(-r * 0.62, r * 0.74, -r * 0.78, r * 0.62, -r * 0.86, r * 0.30);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = lift(f.key, 0.5); g.globalAlpha = 0.7;
      g.beginPath(); g.ellipse(-r * 0.30, -r * 0.32, r * 0.22, r * 0.13, -0.4, 0, 7); g.fill();
      g.globalAlpha = 1;
      break;
    }
    case 'crack': {                             // impact: a starburst fracture
      g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = r * 0.06;
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = r * (i % 2 ? 0.30 : 0.86);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = sink(f.sky[0], 0.45); g.lineWidth = r * 0.08;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); g.stroke();
      }
      break;
    }
    case 'hourglass': {                         // time, running out
      shade();
      g.beginPath();
      g.moveTo(-r * 0.58, -r * 0.78); g.lineTo(r * 0.58, -r * 0.78);
      g.lineTo(r * 0.08, 0); g.lineTo(r * 0.58, r * 0.78); g.lineTo(-r * 0.58, r * 0.78);
      g.lineTo(-r * 0.08, 0); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = line; g.lineWidth = r * 0.14;
      g.beginPath(); g.moveTo(-r * 0.74, -r * 0.84); g.lineTo(r * 0.74, -r * 0.84); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.74, r * 0.84); g.lineTo(r * 0.74, r * 0.84); g.stroke();
      g.fillStyle = lift(f.key, 0.4);
      g.beginPath(); g.moveTo(-r * 0.40, -r * 0.60); g.lineTo(r * 0.40, -r * 0.60);
      g.lineTo(0, -r * 0.06); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, r * 0.60, r * 0.30, r * 0.16, 0, 0, 7); g.fill();
      break;
    }
    case 'dice': {                              // chance, on a tilted die
      shade();
      const ds = r * 0.62;
      g.save(); g.rotate(0.22);
      g.beginPath();
      if (g.roundRect) g.roundRect(-ds, -ds, ds * 2, ds * 2, r * 0.16);
      else g.rect(-ds, -ds, ds * 2, ds * 2);
      g.fill(); g.stroke();
      g.fillStyle = sink(f.sky[0], 0.42);
      for (const p of [[-0.55, -0.55], [0.55, -0.55], [0, 0], [-0.55, 0.55], [0.55, 0.55]]) {
        g.beginPath(); g.arc(p[0] * ds, p[1] * ds, r * 0.11, 0, 7); g.fill();
      }
      g.restore();
      break;
    }
    case 'sick': {
      shade();
      g.beginPath(); g.arc(0, 0, r * 0.7, 0, 7); g.fill(); g.stroke();
      g.fillStyle = sink(f.sky[0], 0.4);
      g.beginPath(); g.arc(-r * 0.25, -r * 0.1, r * 0.15, 0, 7); g.fill();
      g.beginPath(); g.arc(r * 0.25, -r * 0.1, r * 0.15, 0, 7); g.fill();
      g.beginPath(); g.moveTo(-r * 0.3, r * 0.3); g.quadraticCurveTo(0, r * 0.1, r * 0.3, r * 0.3);
      g.lineTo(r * 0.3, r * 0.4); g.quadraticCurveTo(0, r * 0.2, -r * 0.3, r * 0.4); g.closePath(); g.fill();
      break;
    }
    case 'thorn': {
      g.strokeStyle = fill; g.lineWidth = r * 0.13;
      g.beginPath(); g.arc(0, 0, r * 0.66, 0, 7); g.stroke();
      g.fillStyle = fill;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.save(); g.rotate(a); g.translate(0, -r * 0.66);
        g.beginPath(); g.moveTo(-r * 0.1, 0); g.lineTo(0, -r * 0.36); g.lineTo(r * 0.1, 0); g.closePath(); g.fill();
        g.restore();
      }
      break;
    }
    default: { // moon
      shade();
      g.beginPath(); g.arc(0, 0, r * 0.72, 0, 7);
      g.arc(r * 0.42, -r * 0.16, r * 0.62, 0, 7, true);
      g.fill();
      break;
    }
  }
  g.restore();
}

// ── family accents scattered over the subject ───────────────────────────────
function drawAccents(g, w, h, f, kind, R) {
  g.save();
  const c = rgba(lift(f.key, 0.25), 0.5);
  switch (kind) {
    case 'cat': // paw prints drifting up
      for (let i = 0; i < 3; i++) {
        const x = w * (0.10 + R() * 0.80), y = h * (0.12 + R() * 0.7), s = h * (0.03 + R() * 0.02);
        g.fillStyle = c;
        g.beginPath(); g.ellipse(x, y + s * 0.6, s * 0.7, s * 0.55, 0, 0, 7); g.fill();
        for (let k = -1; k <= 1; k++) {
          g.beginPath(); g.ellipse(x + k * s * 0.55, y - s * 0.25, s * 0.24, s * 0.3, k * 0.3, 0, 7); g.fill();
        }
      }
      break;
    case 'bone': case 'pawbone': case 'tomb':
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(w * (0.08 + R() * 0.84), h * (0.1 + R() * 0.75));
        g.rotate(R() * 3); g.fillStyle = c;
        const bl = h * 0.10, bw = h * 0.022;
        g.beginPath(); g.roundRect(-bl / 2, -bw / 2, bl, bw, bw / 2); g.fill();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          g.beginPath(); g.arc(sx * bl / 2, sy * bw * 0.7, bw * 0.62, 0, 7); g.fill();
        }
        g.restore();
      }
      break;
    case 'pumpkin': case 'sprig': case 'quill':
      for (let i = 0; i < 4; i++) {
        leaf(g, w * (0.06 + R() * 0.88), h * (0.10 + R() * 0.78), h * (0.035 + R() * 0.03),
          (R() - 0.5) * 2.4, rgba(mix(PIGMENT.leaf, f.glow, 0.3), 0.55));
      }
      break;
    case 'drip':
      for (let i = 0; i < 5; i++) {
        const x = w * (0.05 + R() * 0.9), y = h * (0.05 + R() * 0.3), l = h * (0.08 + R() * 0.14);
        g.fillStyle = rgba(mix(f.glow, f.key, 0.3), 0.45);
        g.beginPath(); g.moveTo(x - h * 0.014, y);
        g.quadraticCurveTo(x, y + l, x + h * 0.014, y); g.closePath(); g.fill();
        g.beginPath(); g.arc(x, y + l * 0.92, h * 0.016, 0, 7); g.fill();
      }
      break;
    case 'eye':
      for (let i = 0; i < 3; i++) {
        const x = w * (0.08 + R() * 0.84), y = h * (0.08 + R() * 0.5), s = h * (0.03 + R() * 0.025);
        g.fillStyle = rgba(lift(f.key, 0.4), 0.6);
        g.beginPath(); g.ellipse(x, y, s, s * 0.62, 0, 0, 7); g.fill();
        g.fillStyle = rgba(sink(f.sky[0], 0.4), 0.9);
        g.beginPath(); g.arc(x, y, s * 0.32, 0, 7); g.fill();
      }
      break;
    case 'flame': case 'cloud': case 'swirl': case 'stitch': case 'fang': case 'claw':
    default:
      for (let i = 0; i < 5; i++) {
        star(g, w * (0.06 + R() * 0.88), h * (0.06 + R() * 0.7), h * (0.016 + R() * 0.016), 4, 0.34,
          rgba(lift(f.key, 0.35), 0.55));
      }
  }
  g.restore();
}

// ── type overlays ───────────────────────────────────────────────────────────
function drawSlashes(g, w, h, f, R) {
  // Three parallel claw rakes across one corner — thin, tapered at both ends,
  // bright core over a dark tear. Reads as a slash, not a smudge.
  g.save();
  const flip = R() < 0.5 ? 1 : -1;
  const ax = flip > 0 ? w * 0.06 : w * 0.94;
  const ay = h * (0.82 + R() * 0.12);
  const len = w * (0.72 + R() * 0.14);
  const ang = flip > 0 ? -0.72 - R() * 0.18 : Math.PI + 0.72 + R() * 0.18;
  g.translate(ax, ay);
  g.rotate(ang);
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * h * 0.135 + (R() - 0.5) * h * 0.02;
    const L = len * (0.80 + (i === 1 ? 0.20 : 0.06 * i));
    const thick = h * (0.014 + (i === 1 ? 0.006 : 0));
    const steps = 18;
    g.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, px = L * t;
      const py = off + Math.sin(t * Math.PI) * h * 0.035;
      g.lineTo(px, py - Math.sin(Math.pow(t, 0.7) * Math.PI) * thick);
      if (!s) { g.moveTo(px, py - 0.01); }
    }
    for (let s = steps; s >= 0; s--) {
      const t = s / steps, px = L * t;
      const py = off + Math.sin(t * Math.PI) * h * 0.035;
      g.lineTo(px, py + Math.sin(Math.pow(t, 0.7) * Math.PI) * thick);
    }
    g.closePath();
    const grd = g.createLinearGradient(0, 0, L, 0);
    grd.addColorStop(0, rgba(sink(tokens().threat500, 0.4), 0.0));
    grd.addColorStop(0.35, rgba(lift(tokens().threat200, 0.55), 0.62));
    grd.addColorStop(0.72, rgba(tokens().threat300, 0.42));
    grd.addColorStop(1, rgba(tokens().threat400, 0));
    g.fillStyle = grd; g.fill();
  }
  g.restore();
}
function drawWard(g, w, h, f, R) {
  g.save();
  g.translate(w * 0.5, h * 0.86);
  g.strokeStyle = rgba(mix(tokens().skill, f.glow, 0.5), 0.6);
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.lineWidth = h * (0.014 - i * 0.003);
    g.globalAlpha = 0.75 - i * 0.18;
    g.beginPath();
    g.ellipse(0, 0, w * (0.30 + i * 0.13), h * (0.20 + i * 0.09), 0, Math.PI * 1.12, Math.PI * 1.88);
    g.stroke();
  }
  g.globalAlpha = 1;
  // chevron ticks along the inner arc
  g.fillStyle = rgba(lift(f.key, 0.3), 0.55);
  for (let i = -2; i <= 2; i++) {
    const a = Math.PI * 1.5 + i * 0.24;
    const px = Math.cos(a) * w * 0.30, py = Math.sin(a) * h * 0.20;
    g.save(); g.translate(px, py); g.rotate(a - Math.PI / 2);
    g.beginPath(); g.moveTo(0, -h * 0.03); g.lineTo(h * 0.022, 0); g.lineTo(0, h * 0.03);
    g.lineTo(-h * 0.008, 0); g.closePath(); g.fill();
    g.restore();
  }
  g.restore();
}
function drawRays(g, cx, cy, w, h, f, R) {
  g.save();
  g.translate(cx, cy);
  g.globalCompositeOperation = 'screen';
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.2;
    const len = h * (0.55 + R() * 0.45);
    const wdt = 0.035 + R() * 0.03;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a - wdt) * len, Math.sin(a - wdt) * len);
    g.lineTo(Math.cos(a + wdt) * len, Math.sin(a + wdt) * len);
    g.closePath();
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, len);
    grd.addColorStop(0, rgba(mix(tokens().power, f.glow, 0.4), 0.30));
    grd.addColorStop(1, rgba(f.glow, 0));
    g.fillStyle = grd; g.fill();
  }
  g.restore();
}
function drawRunes(g, w, h, f, R) {
  g.save();
  const cx = w * 0.5, cy = h * 0.56, rr = Math.min(w, h) * 0.46;
  g.strokeStyle = rgba(mix(tokens().power, lift(f.key, 0.3), 0.5), 0.5);
  g.lineWidth = Math.max(1, h * 0.006);
  g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.62, 0.2, 0, 7); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.62;
    g.save(); g.translate(px, py); g.rotate(a);
    g.fillStyle = rgba(lift(f.key, 0.4), 0.75);
    const s = h * 0.024;
    g.beginPath();
    g.moveTo(0, -s); g.lineTo(s * 0.7, 0); g.lineTo(0, s); g.lineTo(-s * 0.7, 0);
    g.closePath(); g.fill();
    g.restore();
  }
  g.restore();
}
function drawThorns(g, w, h, f, R) {
  g.save();
  g.strokeStyle = rgba(tokens().curse, 0.75);
  g.lineWidth = h * 0.012;
  g.beginPath();
  g.moveTo(0, h * 0.1);
  g.bezierCurveTo(w * 0.4, h * 0.35, w * 0.6, -h * 0.1, w, h * 0.22);
  g.stroke();
  g.restore();
}
function drawGrime(g, w, h, f, R) {
  g.save();
  g.globalAlpha = 0.30;
  for (let i = 0; i < 8; i++) {
    const x = R() * w, y = R() * h, r = h * (0.04 + R() * 0.08);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(PIGMENT.rot, 0.6));
    grd.addColorStop(1, rgba(PIGMENT.rot, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.restore();
}

// ── tiny shape helpers ──────────────────────────────────────────────────────
function leaf(g, x, y, s, rot, fill) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, -s);
  g.quadraticCurveTo(s * 0.75, -s * 0.1, 0, s);
  g.quadraticCurveTo(-s * 0.75, -s * 0.1, 0, -s);
  g.closePath(); g.fill();
  g.restore();
}
function star(g, x, y, s, points, inner, fill) {
  g.save(); g.translate(x, y); g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? s * inner : s;
    i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill(); g.restore();
}
function tri(g, x, y, s) {
  g.beginPath(); g.moveTo(x - s * 0.62, y + s * 0.5); g.lineTo(x + s * 0.62, y + s * 0.5);
  g.lineTo(x, y - s * 0.6); g.closePath(); g.fill();
}

export default { cardArt, warmArt, warmArtSync, preloadArt, onArtReady, subjectFor, artCacheSize, clearArtCache };
