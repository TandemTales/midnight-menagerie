/**
 * Which body clip a Companion's mechanic plays.  OWNER: frontend.
 *
 * `MM animation prompts.docx` builds eight universal clips for every Companion
 * and two or three mechanic ones, and says how the hundreds of Tricks are meant
 * to use them: "one of the universal body animations, one Companion specific
 * body animation when appropriate, Trick specific VFX".  This table is the
 * "when appropriate".  Data only — no DOM, no engine — so a gate can load it on
 * its own and hold it against the built clips and the real keywords
 * (tests/sprite-triggers/check.py).
 *
 * ── TWO ROADS A MECHANIC TAKES TO THE SCREEN ──────────────────────────────────
 *
 *   cards    A Trick being played.  Rules are read in ORDER and the first whose
 *            keyword the card carries wins, so the specific keyword sits above
 *            the broad one.  A rule marked STRIKE is a body moving at the enemy
 *            and may stand in for `attack` on an Attack; every other rule only
 *            ever replaces `trick`, so an Attack that merely carries a keyword
 *            still lunges.
 *
 *   events   A payoff that lands OUTSIDE a play: Patience paid when an Epitaph
 *            comes due at the start of the turn, Cushion spending Stuffing in the
 *            enemy phase, Hush slipping Unseen.  Counter and status rules match
 *            the DATA id and, where it matters, the direction of the change.
 *            They never cut off a clip already mid-beat (`ClipPlayer#busy`),
 *            which is also what stops them doubling the clip a play just chose.
 *
 * Ids here are the ids the data uses, which are not always the keyword's:
 * Taffy's counter is `globs`, Truffle's is `quills`.
 *
 * Marmalade's and Bones' mechanic clips predate this table and stay in
 * `scenes/combat.js`, because each keys off a predicate rather than a keyword —
 * the third Trick of a turn, a prevented hit, a Life, a card crossing into the
 * stash.  SCENE_DRIVEN names them so the gate does not report them as dead.
 * Pudding's Dig and Fetch are scene-driven for the same reason Bones' are: a
 * Trick crossing into the stash is a burial and one coming back out of the
 * discard is a fetch, whoever is holding the leash.
 */

/** Built for every Companion and driven by the scene without this table. */
export const UNIVERSAL_CLIPS = ['idle', 'ready', 'attack', 'trick', 'hurt', 'celebrate', 'defeat', 'affection'];

/** Mechanic clips wired directly in scenes/combat.js. */
export const SCENE_DRIVEN = {
  marmalade: ['caution', 'spectral', 'zoomies', 'spark'],
  bones: ['dig', 'fetch'],
  pudding: ['dig', 'fetch'],
};

/** A rule's third field: this clip may replace the lunge on an Attack. */
const STRIKE = true;

export const MECHANIC_CLIPS = {
  /* Charge and Store — "store energy, prepare delayed effect, escalate".
     Release — "stored power release, major magical attack, energy payoff". */
  wisp: {
    cards: [
      ['hasten', 'release', STRIKE], ['converge', 'release', STRIKE], ['flare', 'release', STRIKE],
      ['blazing', 'release', STRIKE],
      ['linger', 'charge'], ['delay', 'charge'], ['gloaming', 'charge'], ['glow', 'charge'],
    ],
  },

  /* Feeding Bite — "feed, vampiric attack, bite based Tricks". Mesmerize —
     "temptation, Courage manipulation, risk reward manipulation". */
  crumbula: {
    cards: [
      ['feed', 'bite', STRIKE], ['bite-mark', 'bite', STRIKE], ['leftover', 'bite'],
      ['indulge', 'mesmerize'], ['appetite', 'mesmerize'], ['sated', 'mesmerize'], ['hungry', 'mesmerize'],
    ],
  },

  /* Giant Scare — "fear, large scare, ambush reveal payoff". Hide and Emerge —
     "hide, become concealed, prepare ambush". An Ambush ATTACK still lunges:
     the brief builds that one out of Hide plus the Generic Attack. */
  boggle: {
    cards: [
      ['scare', 'scare', STRIKE], ['fright', 'scare'],
      ['lurk', 'hide'], ['unaware', 'hide'], ['ambush', 'hide'],
    ],
    // Lurk is gained at the end of his own turn, while an enemy is Unaware.
    counters: [{ id: 'lurk', dir: 1, clip: 'hide' }],
  },

  /* Hop — "jump, leap attack, repositioning". Plant and Harvest. Transformation
     — "pumpkin form change, alternate state", which is Plump: how round he is. */
  pipkin: {
    cards: [
      ['land', 'hop', STRIKE], ['hop', 'hop', STRIKE], ['height', 'hop', STRIKE],
      ['plump', 'transformation'], ['deflate', 'transformation'], ['heavy-feet', 'transformation'],
      ['harvest', 'plant'], ['plant', 'plant'], ['seed', 'plant'], ['sprout', 'plant'],
      ['pumpkin', 'plant'], ['patch', 'plant'],
    ],
  },

  /* Absorb and Morph — "absorb, copy Trick, transform Trick". Stretch — "stretch
     attack, reach, body whip". Split and Recombine. */
  taffy: {
    cards: [
      ['absorb', 'absorb'], ['spit-out', 'absorb'], ['belly', 'absorb'], ['gummy', 'absorb'],
      ['stretch', 'stretch', STRIKE],
      ['split', 'split'], ['recombine', 'split'], ['glob', 'split'], ['runny', 'split'],
    ],
  },

  /* Quill Flare — "raise quills, retaliation, reactive damage". Decay and
     Regenerate — "regeneration, recover from decay". */
  truffle: {
    cards: [
      ['shed', 'flare', STRIKE], ['loose-quill', 'flare', STRIKE], ['bristle', 'flare'],
      ['regrow', 'regenerate'], ['gather', 'regenerate'], ['ragged', 'regenerate'],
    ],
    /* Bristle sheds a quill and hits back in the ENEMY phase; regrowth lands on
       his own turn. One counter, two directions. */
    counters: [
      { id: 'quills', dir: -1, clip: 'flare' },
      { id: 'quills', dir: 1, clip: 'regenerate' },
    ],
  },

  /* Snatch — "steal, move Trick, manipulate card zones". Shadow Phase — "enter
     shadow, stealth, prepare surprise attack". */
  hush: {
    cards: [
      ['pilfer', 'sneak', STRIKE], ['unseen', 'shadow'],
      ['stash', 'sneak'], ['scurry', 'sneak'], ['contraband', 'sneak'], ['shadow-pocket', 'sneak'],
      ['ambush', 'shadow'],
    ],
    statuses: [{ id: 'unseen', dir: 1, clip: 'shadow' }],
  },

  /* Sew and Patch — "stitch, patch, repair, modify Trick". Stuffing Change —
     "gain stuffing, lose stuffing, expand, compress". */
  mopsy: {
    cards: [
      ['patch', 'sew'], ['stitch', 'sew'], ['reinforce', 'sew'], ['mend', 'sew'], ['tear', 'sew'], ['torn', 'sew'],
      ['stuffing', 'stuffed'], ['scrap', 'stuffed'], ['cushion', 'stuffed'], ['plump', 'stuffed'],
      ['hollow', 'stuffed'],
    ],
    // Cushion spends Stuffing to halve a hit in the enemy phase.
    counters: [{ id: 'stuffing', clip: 'stuffed' }],
  },

  /* Storm Discharge — "lightning attack, weather payoff". Weather Summon —
     "rain, weather change, apply Wet". */
  drizzle: {
    cards: [
      ['stormbreak', 'discharge', STRIKE], ['conduct', 'discharge', STRIKE],
      ['forecast', 'weather'], ['advance', 'weather'], ['ease', 'weather'],
      ['weather', 'weather'], ['soaked', 'weather'],
    ],
    /* The table's Weather is one counter. A Stormbreak drops it from
       Thunderstorm straight to Clear; anything else moves it one step. */
    counters: [
      { id: 'weather', below: -2, clip: 'discharge' },
      { id: 'weather', clip: 'weather' },
    ],
  },

  /* Web Cast — "create web, manipulate enemy intent, prepare future effect".
     Focus and Predict — "prediction, read enemy intent". */
  wink: {
    cards: [
      ['web', 'webbing', STRIKE], ['reorder', 'webbing'], ['set', 'webbing'], ['anchored', 'webbing'],
      ['preview', 'focus'], ['read', 'focus'], ['blind-read', 'focus'], ['eye', 'focus'],
      ['full-gaze', 'focus'], ['intent-family', 'focus'],
    ],
  },

  /* Fold and Transform — "fold, origami transformation, copy through folding".
     Tear and Repair — "sacrifice paper, restore, reconstruct effect". */
  crinkle: {
    cards: [
      ['trace', 'repair'], ['refold', 'fold'], ['fold', 'fold'], ['crease', 'fold'], ['overfolded', 'fold'],
      ['paper', 'repair'],
    ],
  },

  /* Anchor — "patience, defensive state, prepare delayed effect". Inevitable
     Release — "delayed retaliation, patience payoff". */
  mossbit: {
    cards: [['epitaph', 'anchor'], ['patience', 'anchor'], ['buried-harm', 'anchor'], ['weathering', 'anchor']],
    /* "One Patience is paid whenever an Epitaph reaches zero from its own
       scheduled tick" — the start of his turn, which is the Release exactly. */
    counters: [{ id: 'patience', dir: -1, clip: 'release' }],
  },

  /* Protective Brace — "protect teammate, guard teammate, Loyalty reaction,
     intercept attack, cooperative defense". His other two, Dig and Fetch, are
     scene-driven off the pile a Trick crosses, so they need no keyword here. */
  pudding: {
    cards: [
      ['best-friend', 'brace'], ['loyalty', 'brace'], ['graveside', 'brace'],
    ],
    /* Loyalty is paid when his Best Friend is threatened or hit, which lands in
       the enemy phase rather than on a play — the brace nobody asked for. */
    counters: [{ id: 'loyalty', dir: 1, clip: 'brace' }],
  },

  /* Root and Overgrow — "root, grow vines, propagation, overgrowth, battlefield
     control, bloom, retract growth". One clip for the whole Garden. */
  brambleboo: {
    cards: [
      ['garden', 'overgrow'], ['propagate', 'overgrow'], ['entwine', 'overgrow'], ['vines', 'overgrow'],
      ['snare', 'overgrow'], ['harvest', 'overgrow'], ['uproot', 'overgrow'], ['compost', 'overgrow'],
      ['overgrown', 'overgrow'], ['ivy', 'overgrow'], ['briar', 'overgrow'], ['moonflower', 'overgrow'],
      ['grave-moss', 'overgrow'], ['weed', 'overgrow'],
    ],
  },
};

/** The keywords a played card carries, whichever shape it arrived in. */
function keywordsOf(card) {
  return new Set(card?.keywords || card?.def?.keywords || []);
}

/**
 * The mechanic clip a played card asks for, or null for the universal one.
 * `{ clip, strike }` — `strike` says it may replace the Attack lunge.
 */
export function cardClip(slug, card) {
  const rules = MECHANIC_CLIPS[slug]?.cards;
  if (!rules || !card) return null;
  const kws = keywordsOf(card);
  for (const [kw, clip, strike] of rules) {
    if (kws.has(kw)) return { clip, strike: strike === STRIKE };
  }
  return null;
}

/** Does one counter/status rule match a change? */
function matches(rule, ev) {
  if (rule.id !== ev.id) return false;
  const d = Number(ev.delta) || 0;
  if (!d) return false;
  if (rule.dir && Math.sign(d) !== rule.dir) return false;
  if (rule.below !== undefined && !(d <= rule.below)) return false;
  return true;
}

/**
 * The clip an out-of-play change asks for, or null.
 * `kind` is 'counter' or 'status'; `ev` carries `id` and `delta`.
 */
export function eventClip(slug, kind, ev) {
  const set = MECHANIC_CLIPS[slug];
  if (!set || !ev) return null;
  const rules = kind === 'counter' ? set.counters : kind === 'status' ? set.statuses : null;
  for (const r of rules || []) if (matches(r, ev)) return r.clip;
  return null;
}
