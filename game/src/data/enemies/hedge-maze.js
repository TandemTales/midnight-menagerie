/**
 * The Withered Hedge Maze — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/12-hedge-maze.md §1–§12, §47–§48.
 *
 * "The Impossible Greenhouse was about unchecked growth. The Withered Hedge
 * Maze is about WHAT HAPPENS AFTER GROWTH ENDS." Truffle's region, and its one
 * lesson is §preamble's: "Damage is not always progress in a straight line."
 *
 * ── RETALIATION IS NOT AN INTENT, AND THAT IS THE POINT ─────────────────────
 *
 * Half this roster hurts you for hitting it. That damage lands during the
 * PLAYER's turn, in response to a card, so it is not something an intent could
 * ever have promised — and `tests/enemies/audit.py` measures only the enemy
 * phase, so it is not scored against one either.
 *
 * What it does need is to be READABLE BEFORE THE SWING, which is why every
 * retaliation number in this file is a displayed counter with a House Rule
 * beside it rather than a surprise after the fact. The Briar Lump's four
 * Briars, the Thorn Topiary's growing Crown and the Mildew Puff's banked
 * Disturbed are all things the player can count.
 *
 * ── AND THE TWO RETALIATORS ARE DELIBERATE OPPOSITES ────────────────────────
 *
 * §8 says so outright: "Briar Lump has FINITE retaliation that gets stripped.
 * Thorn Topiary continually REGROWS retaliation unless actively pruned." One
 * rewards committing; the other punishes chipping. A deck that only knows one
 * answer will meet the other.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, dmgTaken,
} from './_lib.js';

const REGION = 'hedge-maze';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const MAZE_STATUSES = [
  {
    /**
     * §3. Mildewed: "the next time the player gains Guard, gain 3 less."
     *
     * The Lamplighter's Dimmed with a different number, and it is the same
     * shape for the same reason — a small defensive inefficiency rather than a
     * suppressed archetype. The spend flag lives on the actor because
     * `modifyBlockGain` is a reducer that must not write anywhere else.
     */
    id: 'mildewed', name: 'Mildewed', kind: 'debuff', icon: 'mildewed',
    desc: 'The next Guard you gain is 3 less. Then it wears off.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (!amt || (h.owner && h.owner._mildewSpent)) return amt;
        if (h.owner) h.owner._mildewSpent = true;
        return Math.max(0, amt - 3);
      },
      onTurnStart: (h) => { if (h.owner && h.owner._mildewSpent) h.remove(); },
    },
  },
  {
    /**
     * §4. Bare: "at 0 Briars, take 20 percent additional damage; its attacks
     * deal 2 additional damage."
     *
     * A status rather than a bare counter because it is the window the whole
     * enemy is about — §4's strategic question is four different ways to reach
     * it — and a window the player is meant to aim for should have a name on
     * the screen.
     */
    id: 'bare', name: 'Bare', kind: 'debuff', icon: 'bare',
    desc: 'Its thorns are gone. It takes 20% more damage and its attacks deal 2 more.',
    decay: 'never', stacks: false, max: 1,
  },
];

/**
 * Retaliate. Returns what was dealt.
 *
 * One helper so the whole region agrees about when a swing costs the player:
 * §3, §4, §8, §14 and the boss's Rotten state all say "whenever the player
 * damages it WITH AN ATTACK TRICK", which is card-typed and not merely any
 * damage — indirect damage is one of the answers the chapters keep offering.
 */
export function retaliate(c, n) {
  const info = c.info || {};
  if (!n || info.kind !== 'attack' || info.card?.type !== 'attack') return 0;
  hitPlayer(c, n);
  return n;
}

/* ══ small objects the region leaves lying about ════════════════════════════ */
function pile(id, name, hp, lore, tell) {
  return {
    id, name, region: REGION, tier: 'normal', role: 'object', summonOnly: true,
    hp: [hp, hp],
    silhouette: id,
    palette: ['#b9a878', '#8a7a52', '#241d12'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.4,
    lore,
    moves: { sit: { id: 'sit', name: 'Lying There', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'sit',
    hauntScaling(level) { return hauntBase(level, 'normal'); },
  };
}

export const strawPile = pile(
  'straw-pile', 'Straw Pile', 6,
  'A heap of old straw that came out of something.',
  'Break it before the Scarecrow\'s next turn or it stuffs itself back up.',
);
export const rotPile = pile(
  'rot-pile', 'Rot Pile', 12,
  'A wet heap of the garden, going quietly back to soil.',
  'The Gardener can eat this to heal. Breaking it is a choice, not an obligation.',
);

// ═════════════════════════════════════════════════════════════════════════════
// 1. Mildew Puff — several small hits bank more than one big one (§3)
// ═════════════════════════════════════════════════════════════════════════════
export const mildewPuff = {
  id: 'mildew-puff',
  name: 'Mildew Puff',
  region: REGION,
  tier: 'normal',
  role: 'retaliator',
  hp: [26, 26],
  silhouette: 'puff',
  palette: ['#c7d6b4', '#8fa178', '#22291b'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 0.5,
  lore: 'A ball of pale green mould rolling through the hedges, deeply offended by everything.',

  onSpawn(c) { setCnt(c, 'disturbed', 0); announcePuff(c); },

  /** §3: "Whenever Mildew Puff takes Attack damage, gain 1 Disturbed." */
  onAttacked(c) {
    const info = c.info || {};
    if (info.card?.type !== 'attack') return;
    addCnt(c, 'disturbed', 1, flag(c, 'maxDisturbed', 3));
    announcePuff(c);
  },

  moves: {
    puff: {
      id: 'puff', name: 'Puff', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + 2 * cnt(c, 'disturbed'),
      tell: 'It has been storing that up.',
      effect(c) {
        const d = 5 + 2 * cnt(c, 'disturbed');
        setCnt(c, 'disturbed', 0);
        hitPlayer(c, d);
        announcePuff(c);
      },
    },
    'mildew-cloud': {
      id: 'mildew-cloud', name: 'Mildew Cloud', intent: Intent.DEFEND_DEBUFF, block: 5,
      applies: [{ id: 'mildewed', stacks: 1, to: 'player' }],
      tell: 'A small damp cloud of it.',
      effect(c) {
        c.block(c.self, 5);
        c.player._mildewSpent = false;
        c.applyStatus(c.player, 'mildewed', 1);
      },
    },
    'soft-roll': {
      id: 'soft-roll', name: 'Soft Roll', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It rolls into you without much conviction.',
      effect(c) { hitPlayer(c, 6); },
    },
  },

  nextMove: (c) => cyc(['mildew-cloud', 'soft-roll', 'puff'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.maxDisturbed = 4;
      h.notes.push('Haunt 3: it can bank 4 Disturbed. Still 2 damage apiece.');
    }
    return h;
  },
};

function announcePuff(c) {
  const n = cnt(c, 'disturbed');
  c.announceRule({
    id: `puff:${c.self.id}`,
    name: `Disturbed ${n} / ${flag(c, 'maxDisturbed', 3)}`,
    text: `Every Attack Trick that hits it banks one, and Puff spends the lot — ${5 + 2 * n} right now. `
      + 'Attacking is still right. Several small ones bank more than one decisive swing.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Briar Lump — finite retaliation, and a window behind it (§4)
// ═════════════════════════════════════════════════════════════════════════════
export const briarLump = {
  id: 'briar-lump',
  name: 'Briar Lump',
  region: REGION,
  tier: 'normal',
  role: 'retaliator',
  hp: [35, 35],
  silhouette: 'briar',
  palette: ['#4c4030', '#7d6a4c', '#1a150e'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 0.6,
  lore: 'A hopping mass of thorny clippings with the temperament of a hedgehog that has been stepped on.',

  onSpawn(c) { setCnt(c, 'briars', flag(c, 'openBriars', 4)); mem(c).bare = 0; announceBriar(c); },

  /** §4: retaliate, then lose one. Four triggers and the thorns are gone. */
  onAttacked(c) {
    if (cnt(c, 'briars') <= 0) return;
    if (!retaliate(c, 2)) return;
    addCnt(c, 'briars', -1, 9, 0);
    if (cnt(c, 'briars') === 0) {
      mem(c).bare = 1;
      c.applyStatus(c.self, 'bare', 1, { fresh: true });
    }
    announceBriar(c);
  },

  /** §4: "While Bare, take 20 percent additional damage." */
  damageTakenMul(c) { return cnt(c, 'briars') <= 0 ? 1.2 : 1; },

  moves: {
    'briar-bump': {
      id: 'briar-bump', name: 'Briar Bump', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + (cnt(c, 'briars') <= 0 ? 2 : 0),
      tell: 'It hops into you thorns-first, or what is left of them.',
      effect(c) { hitPlayer(c, 8 + (cnt(c, 'briars') <= 0 ? 2 : 0)); },
    },
    'rolling-thorns': {
      id: 'rolling-thorns', name: 'Rolling Thorns', intent: Intent.ATTACK, damage: 4, hits: 2,
      damageFn: (c) => 4 + (cnt(c, 'briars') <= 0 ? 2 : 0),
      tell: 'It rolls over you and then back again.',
      effect(c) { hitPlayer(c, 4 + (cnt(c, 'briars') <= 0 ? 2 : 0), 2); },
    },
    'bristle-up': {
      id: 'bristle-up', name: 'Bristle Up', intent: Intent.DEFEND_BUFF, block: 7,
      tell: 'It grows the whole lot back at once.',
      effect(c) {
        c.block(c.self, 7);
        setCnt(c, 'briars', flag(c, 'openBriars', 4));
        mem(c).bare = 0;
        c.removeStatus(c.self, 'bare');
        announceBriar(c);
      },
    },
  },

  /** §4: "After ONE enemy turn while Bare, use Bristle Up." */
  nextMove: (c) => {
    if (cnt(c, 'briars') <= 0 && (mem(c).bare || 0) >= 2) return 'bristle-up';
    return cyc(['briar-bump', 'rolling-thorns'], (c.history || []).length);
  },

  onTurnEnd(c) { if (cnt(c, 'briars') <= 0) mem(c).bare = (mem(c).bare || 0) + 1; },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.advanced.flags.openBriars = 5;
      h.advanced.counters.briars = 5;
      h.notes.push('Haunt 4: it opens advanced formations with 5 Briars.');
    }
    return h;
  },
};

function announceBriar(c) {
  const n = cnt(c, 'briars');
  c.announceRule({
    id: `briar:${c.self.id}`,
    name: n > 0 ? `Briars ${n}` : 'BARE',
    text: n > 0
      ? 'Every Attack Trick that hits it costs you 2 and takes one Briar off. They run out.'
      : 'No thorns left: it takes 20% MORE damage and hits for 2 more. One enemy turn and it grows them all back.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Rotcap — it heals unless you commit (§5)
// ═════════════════════════════════════════════════════════════════════════════
export const rotcap = {
  id: 'rotcap',
  name: 'Rotcap',
  region: REGION,
  tier: 'normal',
  role: 'regenerator',
  hp: [39, 39],
  silhouette: 'rotcap',
  palette: ['#8a5a52', '#c99b86', '#241612'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 0.85,
  lore: 'A mushroom the size of a person walking on a bundle of roots. The cap tears and grows back while you watch.',

  onSpawn(c) { announceRotcap(c); },

  /**
   * §5: "If Rotcap lost FEWER than 8 Courage during the previous player turn,
   * recover 6." At the end of its own turn, reading the damage the player did —
   * `damageTakenThisTurn` survives into the enemy turn precisely for this.
   */
  onTurnEnd(c) {
    const gate = flag(c, 'suppressAt', 8);
    if (dmgTaken(c) >= gate) { announceRotcap(c); return; }
    c.heal(c.self, 6 + (mem(c).fed ? 4 : 0));
    mem(c).fed = false;
    announceRotcap(c);
  },

  moves: {
    'cap-slam': {
      id: 'cap-slam', name: 'Cap Slam', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It brings the whole cap down.',
      effect(c) { hitPlayer(c, 9); },
    },
    'spore-shake': {
      id: 'spore-shake', name: 'Spore Shake', intent: Intent.ATTACK_DEFEND, damage: 5, hits: 1, block: 7,
      tell: 'It shakes itself and the air goes thick.',
      effect(c) { c.block(c.self, 7); hitPlayer(c, 5); },
    },
    'rot-in-place': {
      id: 'rot-in-place', name: 'Rot In Place', intent: Intent.BUFF,
      tell: 'It lets a bit more of itself go.',
      effect(c) { c.loseHp(c.self, 4); mem(c).fed = true; announceRotcap(c); },
    },
  },

  nextMove: (c) => cyc(['cap-slam', 'spore-shake', 'rot-in-place', 'cap-slam'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.suppressAt = 10;
      h.notes.push('Haunt 5: it takes 10 damage in a turn to suppress the regrowth, not 8.');
    }
    return h;
  },
};

function announceRotcap(c) {
  c.announceRule({
    id: `rot:${c.self.id}`,
    name: mem(c).fed ? 'Rotting — next regrowth 10' : 'Regrowing 6 a turn',
    text: `Deal it ${flag(c, 'suppressAt', 8)} or more in a turn and it recovers NOTHING. `
      + 'Under that and it takes it all back. It will damage itself to make the next one bigger.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Wilted Scarecrow — worse as it dies, and dying of it (§6)
// ═════════════════════════════════════════════════════════════════════════════
const STATES = ['Stitched', 'Ragged', 'Barely Together'];
function scareState(c) {
  const hp = c.self.hp || 0;
  if (hp <= flag(c, 'lastAt', 14)) return 2;
  if (hp <= 28) return 1;
  return 0;
}

export const wiltedScarecrow = {
  id: 'wilted-scarecrow',
  name: 'Wilted Scarecrow',
  region: REGION,
  tier: 'normal',
  role: 'deteriorator',
  hp: [43, 43],
  silhouette: 'scarecrow',
  palette: ['#b8975a', '#e0c98d', '#2b2113'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.0,
  lore: 'A scarecrow dragging itself along the hedge rows, losing pieces and getting worse about it.',

  onSpawn(c) { mem(c).lowSeen = false; announceScarecrow(c); },

  /** §6: Stitched gains Guard; Barely Together bleeds. */
  onTurnStart(c) { if (scareState(c) === 0) c.block(c.self, 4); },
  onTurnEnd(c) {
    if (scareState(c) === 2) c.loseHp(c.self, 2);
    /* §6: "If Straw Pile survives until the Scarecrow's NEXT turn, the
       Scarecrow recovers 5 Courage. Destroying the Straw Pile prevents this." */
    const straw = allies(c).find(a => a.defId === 'straw-pile' && isAlive(a));
    if (straw && mem(c).strawArmed) { c.heal(c.self, 5); c.despawn(straw); }
    mem(c).strawArmed = !!straw;
    announceScarecrow(c);
  },

  /** §6: entering Barely Together the first time drops a Straw Pile. */
  onDamaged(c) {
    if (mem(c).lowSeen || scareState(c) !== 2) return;
    mem(c).lowSeen = true;
    mem(c).strawArmed = false;
    c.summon('straw-pile');
    announceScarecrow(c);
  },

  moves: {
    'rake-swing': {
      id: 'rake-swing', name: 'Rake Swing', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + [0, 2, 5][scareState(c)],
      tell: 'It swings the rake in a long flat arc.',
      effect(c) { hitPlayer(c, 8 + [0, 2, 5][scareState(c)]); },
    },
    'stuffing-brace': {
      id: 'stuffing-brace', name: 'Stuffing Brace', intent: Intent.DEFEND, block: 10,
      tell: 'It packs itself back in.',
      effect(c) { c.block(c.self, 10); },
    },
    'loose-arm': {
      id: 'loose-arm', name: 'Loose Arm', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + [0, 2, 5][scareState(c)],
      tell: 'One arm is barely attached and it uses that.',
      effect(c) { hitPlayer(c, 5 + [0, 2, 5][scareState(c)], 2); },
    },
  },

  nextMove: (c) => {
    const s = scareState(c);
    if (s === 0) return cyc(['rake-swing', 'stuffing-brace'], (c.history || []).length);
    return cyc(['rake-swing', 'loose-arm', 'stuffing-brace'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.lastAt = 17;
      h.notes.push('Haunt 6: it reaches Barely Together at 17 Courage, so its worst state lasts longer.');
    }
    return h;
  },
};

function announceScarecrow(c) {
  const s = scareState(c);
  const TXT = [
    'Stitched: 4 Guard every turn, ordinary damage.',
    'Ragged: no Guard any more, and its attacks deal 2 more.',
    'Barely Together: attacks deal 5 more — and it loses 2 Courage every turn of its own.',
  ];
  c.announceRule({
    id: `scare:${c.self.id}`,
    name: STATES[s],
    text: `${TXT[s]} It gets more dangerous the closer it is to falling over, and it knows.`,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Compost Crawler — a wounded ally is an ingredient (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player may INTENTIONALLY LEAVE a low priority enemy wounded so the
 * Crawler spends turns feeding instead of attacking." (§7.)
 */
const wounded = (c) => allies(c).filter(a => isAlive(a) && a.defId !== 'compost-crawler'
  && a.maxHp - a.hp >= 10 && a.hp > 1);

export const compostCrawler = {
  id: 'compost-crawler',
  name: 'Compost Crawler',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [34, 34],
  silhouette: 'compost',
  palette: ['#5c4a2e', '#8f7a4c', '#1d160c'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 0.75,
  lore: 'Mulch, dead leaves, apple cores and twigs in roughly the shape of an animal. It looks at hurt things the way you look at lunch.',

  onSpawn(c) { setCnt(c, 'compost', 0); mem(c).plan = null; announceCrawler(c); },

  /** Settled at turn start so a mid-turn kill cannot rewrite a committed intent. */
  onPlayerTurnStart(c) { mem(c).plan = wounded(c).length ? 'take-a-little' : null; },

  moves: {
    'take-a-little': {
      id: 'take-a-little', name: 'Take a Little', intent: Intent.BUFF,
      tell: 'It has noticed that one of its friends is not doing well.',
      effect(c) {
        const pool = wounded(c);
        if (!pool.length) { c.block(c.self, 6); return; }
        const meal = pool[c.rng.int(pool.length)];
        // "Take a Little cannot defeat the target. It leaves them at minimum 1."
        const take = Math.min(5, Math.max(0, meal.hp - 1));
        if (take > 0) c.loseHp(meal, take);
        c.heal(c.self, 8);
        addCnt(c, 'compost', 1, flag(c, 'maxCompost', 3));
        announceCrawler(c);
      },
    },
    'mulch-slap': {
      id: 'mulch-slap', name: 'Mulch Slap', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + (cnt(c, 'compost') >= flag(c, 'burstAt', 3) ? 4 : 0),
      tell: 'A wet armful of the garden.',
      effect(c) {
        const big = cnt(c, 'compost') >= flag(c, 'burstAt', 3);
        const d = 7 + (big ? 4 : 0);
        if (big) setCnt(c, 'compost', 0);
        hitPlayer(c, d);
        announceCrawler(c);
      },
    },
    'pile-up': {
      id: 'pile-up', name: 'Pile Up', intent: Intent.DEFEND, block: 8,
      blockFn: (c) => 8 + 2 * cnt(c, 'compost'),
      tell: 'It gathers more of the garden onto itself.',
      effect(c) { c.block(c.self, 8 + 2 * cnt(c, 'compost')); },
    },
  },

  nextMove: (c) => {
    if (mem(c).plan === 'take-a-little') return 'take-a-little';
    return cyc(['mulch-slap', 'pile-up'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.maxCompost = 4;
      h.notes.push('Haunt 7: it can hold 4 Compost. Its burst still triggers at 3.');
    }
    return h;
  },
};

function announceCrawler(c) {
  c.announceRule({
    id: `crawler:${c.self.id}`,
    name: `Compost ${cnt(c, 'compost')} / ${flag(c, 'maxCompost', 3)}`,
    text: 'It eats any ally missing 10 Courage — 5 off them, 8 onto itself, and it cannot finish them. '
      + 'Each Compost is 2 more Guard on Pile Up, and at 3 its next Mulch Slap gains 4. '
      + 'Leaving something wounded is a real way to waste its turns.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Thorn Topiary — the Briar Lump inverted (§8)
// ═════════════════════════════════════════════════════════════════════════════
export const thornTopiary = {
  id: 'thorn-topiary',
  name: 'Thorn Topiary',
  region: REGION,
  tier: 'normal',
  role: 'retaliator',
  hp: [47, 47],
  silhouette: 'topiary-thorn',
  palette: ['#1f2a1c', '#4a5c3f', '#0c110a'],
  shape: { body: 'sprawling', limbs: 4, eyes: 0 },
  scale: 1.1,
  lore: 'It was an animal-shaped hedge once. Now it is a dense black mass of thorns and you can only just tell which end was the head.',

  onSpawn(c) { setCnt(c, 'crown', flag(c, 'openCrown', 1)); announceTopiary(c); },

  /** §8: retaliation equal to the Crown, and it does NOT spend it. */
  onAttacked(c) {
    const n = cnt(c, 'crown');
    if (!n || !retaliate(c, n)) return;
    /* §8's Prune: "if ONE Attack Trick deals at least 12 damage, remove 2 Thorn
       Crown after the attack resolves." A committed swing is the answer here,
       which is the exact inverse of the Briar Lump. */
    const info = c.info || {};
    const dealt = (info.amount ?? ((info.hpLoss || 0) + (info.blocked || 0)));
    if (dealt >= 12) addCnt(c, 'crown', -2, 4, 0);
    announceTopiary(c);
  },

  /** §8: "At the end of every enemy turn, gain 1 Thorn Crown. Maximum 4." */
  onTurnEnd(c) { addCnt(c, 'crown', 1, 4); announceTopiary(c); },

  moves: {
    'branch-swipe': {
      id: 'branch-swipe', name: 'Branch Swipe', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'One long black branch.',
      effect(c) { hitPlayer(c, 8); },
    },
    tangle: {
      id: 'tangle', name: 'Tangle', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'It knits itself tighter.',
      effect(c) { c.block(c.self, 9); addCnt(c, 'crown', 1, 4); announceTopiary(c); },
    },
    'overgrown-charge': {
      id: 'overgrown-charge', name: 'Overgrown Charge', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + 3 * cnt(c, 'crown'),
      tell: 'The whole hedge comes at you at once.',
      effect(c) {
        const d = 6 + 3 * cnt(c, 'crown');
        addCnt(c, 'crown', -1, 4, 0);
        hitPlayer(c, d);
        announceTopiary(c);
      },
    },
  },

  nextMove: (c) => cyc(['branch-swipe', 'tangle', 'overgrown-charge'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.advanced.counters.crown = 2;
      h.advanced.flags.openCrown = 2;
      h.notes.push('Haunt 8: it opens advanced formations with 2 Thorn Crown.');
    }
    return h;
  },
};

function announceTopiary(c) {
  const n = cnt(c, 'crown');
  c.announceRule({
    id: `thorn:${c.self.id}`,
    name: `Thorn Crown ${n} / 4`,
    text: `Every Attack Trick that hits it costs you ${n}, and it does NOT lose the Crown for it — `
      + 'it grows another every turn. One Attack dealing 12 or more prunes TWO. '
      + 'Chipping away is the wrong answer here.',
  });
}

export const MAZE_ENEMIES = [
  mildewPuff, briarLump, rotcap, wiltedScarecrow, compostCrawler, thornTopiary,
  strawPile, rotPile,
];
export const MAZE_REGION = REGION;
