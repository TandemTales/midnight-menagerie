/**
 * The Kennels and Animal Ward — Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/15-kennels.md §14, §15, §16.
 *
 * Three of them, and each is the region's lesson at a different size:
 *
 *   THE COLLAR COLLECTOR  every rule you remove makes it angrier
 *   THE ROLLING WARD      the rescue and the fight are the same objective
 *   THE PERFECT PEN       a system whose defence is a measurable safety score
 *
 * ── THE PEN IS THE BODY, AND THE ANIMAL IS INSIDE IT ────────────────────────
 *
 * §15 gives the Rolling Ward three Pens with three Ward Animals in them, which
 * read literally is seven bodies on a board the layout tops out at six. The Pen
 * and the animal it holds are one actor here — the Pen is what you can see, what
 * you can hit, and what carries the animal's Fright — and the House Rule names
 * who is inside. Nothing about §15's decisions changes: three Latches, three
 * passives, and a Fright clock on each.
 *
 * ── AND A BROKEN COLLAR PAYS OUT AT THE TOP OF THE NEXT TURN ────────────────
 *
 * §14's Loose Buckle gives the Collector 2 more attack damage per Collar the
 * player destroys. Granted the instant the Collar falls, that is +2 on a number
 * the player was already looking at. The RULE the Collar imposed ends the moment
 * it breaks — that is the reward, and it is immediate — but the Buckle is
 * counted at the start of the next player turn, so the bigger attack is
 * something the player reads before they decide anything.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, field, lastMove, hpFrac,
} from './_lib.js';
import { frighten } from './kennels.js';

const REGION = 'kennels';

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 1 — The Collar Collector (§14)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One Collar. Each is separately targetable with 18 Integrity, and each imposes
 * a rule on the PLAYER — so each rule lives in a status the Collar keeps on the
 * Kid and takes back when it breaks.
 */
function collar(id, name, statusId, lore, tell) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart', summonOnly: true,
    hp: [18, 18],
    silhouette: id,
    palette: ['#6b4b33', '#b08a5f', '#191007'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.36,
    lore,
    onSpawn(c) {
      const boss = allies(c).find(a => a.defId === 'collar-collector' && isAlive(a));
      if (boss) c.applyStatus(c.player, statusId, 1);
    },
    onDeath(c) {
      c.removeStatus(c.player, statusId);
      const boss = allies(c).find(a => a.defId === 'collar-collector' && isAlive(a));
      if (!boss) return;
      const m = (boss.mem ||= {});
      m.pendingBuckles = (m.pendingBuckles || 0) + 1;
      m.spares = m.spares || 0;
    },
    moves: { hold: { id: 'hold', name: 'Buckled', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'elite'); },
  };
}

export const shortCollar = collar('short-collar', 'Short Collar', 'short-collar-rule',
  'Buckled to the last hole. There is a name on the tag and it has been scratched out.',
  'Break it and your fourth Trick stops costing extra.');
export const heavyCollar = collar('heavy-collar', 'Heavy Collar', 'heavy-collar-rule',
  'Cast iron, lined with felt. Somebody thought the felt made it kind.',
  'Break it and your big Guard turns stop being trimmed.');
export const bellCollar = collar('bell-collar', 'Bell Collar', 'bell-collar-rule',
  'A little brass bell, so that whatever wears it can always be found.',
  'Break it and drawing stops feeding it.');

export const spareCollar = {
  id: 'spare-collar', name: 'Spare Collar', region: REGION, tier: 'elite',
  role: 'bossPart', summonOnly: true,
  hp: [10, 10],
  silhouette: 'spare-collar',
  palette: ['#5a4d3f', '#9d8b74', '#161109'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.3,
  lore: 'It keeps spares. Of course it keeps spares.',
  onSpawn(c) { c.applyStatus(c.player, 'spare-collar-rule', 1); },
  onDeath(c) {
    c.removeStatus(c.player, 'spare-collar-rule');
    const boss = allies(c).find(a => a.defId === 'collar-collector' && isAlive(a));
    if (boss) { const m = (boss.mem ||= {}); m.spares = Math.max(0, (m.spares || 1) - 1); }
  },
  moves: { hold: { id: 'hold', name: 'Buckled', intent: Intent.SLEEP,
    tell: 'A spare, and it does not count toward the three.', effect() {} } },
  nextMove: () => 'hold',
  hauntScaling(level) { return hauntBase(level, 'elite'); },
};

export const collarCollector = {
  id: 'collar-collector',
  name: 'The Collar Collector',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [152, 152],
  silhouette: 'collar-rack',
  palette: ['#4e3a28', '#a4835c', '#150e06'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.5,
  lore: 'A tall rack covered in hundreds of collars walks on polished wooden legs. Each collar carries a little tag. Some of the names are familiar.',

  onSpawn(c) {
    setCnt(c, 'buckles', 0);
    mem(c).pendingBuckles = 0;
    mem(c).spares = 0;
    c.summon('short-collar');
    c.summon('heavy-collar');
    c.summon('bell-collar');
    announceCollector(c);
  },

  /** See the file header: the rule ends at once, the Buckle is counted here. */
  onPlayerTurnStart(c) {
    const owed = mem(c).pendingBuckles || 0;
    if (owed) {
      mem(c).pendingBuckles = 0;
      addCnt(c, 'buckles', owed, 3, 0);
      c.say('Another buckle comes loose. It swings harder for it.', 'warn');
    }
    for (const id of ['heavy-collar-rule', 'bell-collar-rule']) {
      const who = c.player;
      if (who) who[`_${id.replace(/-/g, '')}Spent`] = false;
    }
    c.player._heavySpent = false;
    c.player._bellSpent = false;
    announceCollector(c);
  },

  onAllyDeath(c) { announceCollector(c); },

  moves: {
    'tag-strike': {
      id: 'tag-strike', name: 'Tag Strike', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + 2 * cnt(c, 'buckles'),
      tell: 'A hundred tags on one swing.',
      effect(c) { hitPlayer(c, 10 + 2 * cnt(c, 'buckles')); },
    },
    'adjust-the-fit': {
      id: 'adjust-the-fit', name: 'Adjust the Fit', intent: Intent.DEFEND, block: 6,
      tell: 'It goes down the rack tightening everything by one hole.',
      effect(c) {
        c.block(c.self, 6);
        const worn = collarsOf(c).sort((a, b) => hpFrac(a) - hpFrac(b))[0];
        if (worn) c.block(worn, 8);
        announceCollector(c);
      },
    },
    'jingle-charge': {
      id: 'jingle-charge', name: 'Jingle Charge', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + 2 * cnt(c, 'buckles'),
      tell: 'It runs at you and every single collar is ringing.',
      effect(c) { hitPlayer(c, 5 + 2 * cnt(c, 'buckles'), 2); },
    },
    'collect-another': {
      id: 'collect-another', name: 'Collect Another', intent: Intent.SUMMON,
      tell: 'It has spares. Of course it has spares.',
      effect(c) {
        if (collarsOf(c).length >= 3 || mem(c).spares >= 1) { c.block(c.self, 10); return; }
        mem(c).spares = 1;
        c.summon('spare-collar');
        announceCollector(c);
      },
    },
  },

  nextMove: (c) => cyc(['tag-strike', 'adjust-the-fit', 'jingle-charge', 'collect-another'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.counters.buckles = 1;
      h.notes.push('Haunt 9: it opens with one buckle already loose.');
    }
    return h;
  },
};

function collarsOf(c) {
  return allies(c).filter(a => isAlive(a) && /collar$/.test(String(a.defId)) && a.defId !== 'spare-collar');
}

function announceCollector(c) {
  const worn = collarsOf(c).map(a => a.name);
  c.announceRule({
    id: `collector:${c.self.id}`,
    name: `${worn.length} COLLARS · ${cnt(c, 'buckles')} LOOSE BUCKLES`,
    text: (worn.length ? `Still on: ${worn.join(', ')}. ` : 'Every collar is off. ')
      + 'Breaking one ends its rule immediately AND loosens a buckle worth 2 attack damage, '
      + 'counted at the start of your next turn so you see the bigger number before you spend anything. '
      + 'Maximum 3. Breaking all of them, leaving one you can live with, and ignoring them entirely are all real plans.',
  });
}

/* ══ the three Collar rules, on the player ══════════════════════════════════ */
export const SCARE_STATUSES = [
  {
    /** §14 Short Collar: "The fourth Trick played each turn costs 1 additional Nerve." */
    id: 'short-collar-rule', name: 'Short Collar', kind: 'debuff', icon: 'collar',
    desc: 'Your fourth Trick each turn costs 1 more Nerve. Break the Short Collar to end it.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        return n === 3 ? Math.max(1, cost + 1) : cost;
      },
    },
  },
  {
    /** §14 Heavy Collar: "The first time the player gains 10 or more Guard in one turn, gain 3 less." */
    id: 'heavy-collar-rule', name: 'Heavy Collar', kind: 'debuff', icon: 'collar',
    desc: 'The first time you gain 10 or more Guard in a turn, gain 3 less. Break the Heavy Collar to end it.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (amt < 10 || h.owner?.side !== 'player' || h.owner._heavySpent) return amt;
        h.owner._heavySpent = true;
        return Math.max(0, amt - 3);
      },
      onTurnStart: (h) => { if (h.owner) h.owner._heavySpent = false; },
    },
  },
  {
    /** §14 Bell Collar: "The first time the player draws 2 or more additional Tricks, the Collector gains 7 Guard." */
    id: 'bell-collar-rule', name: 'Bell Collar', kind: 'debuff', icon: 'bell',
    desc: 'The first time you draw 2 or more extra Tricks in a turn, the Collector gains 7 Guard. Break the Bell Collar to end it.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onCardsDrawn: (h) => {
        if (h.reason === 'turnStart' || h.owner?._bellSpent) return;
        const owner = h.owner;
        owner._bellDrew = (owner._bellDrew || 0) + ((h.cards || []).length);
        if (owner._bellDrew < 2) return;
        owner._bellSpent = true;
        const boss = h.e.enemies.find(x => x.defId === 'collar-collector' && x.alive);
        if (boss) h.e.gainBlock(boss, 7, { reason: 'bell' });
      },
      onTurnStart: (h) => { if (h.owner) { h.owner._bellSpent = false; h.owner._bellDrew = 0; } },
    },
  },
  {
    /** §14's Spare: "The first 0 Nerve Trick played each turn costs 1 Nerve." */
    id: 'spare-collar-rule', name: 'Spare Collar', kind: 'debuff', icon: 'collar',
    desc: 'Your first free Trick each turn costs 1 Nerve. Break the Spare Collar to end it.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        if (cost !== 0) return cost;
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        return n === 0 ? 1 : cost;
      },
    },
  },
  {
    /** §16's Gentle Restraint, and the Kennelmaster's Lead Post, share this. */
    id: 'gentle-restraint', name: 'Gentle Restraint', kind: 'debuff', icon: 'collar',
    desc: 'Your next fourth Trick costs 1 more Nerve. Then it passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        return n === 3 ? Math.max(1, cost + 1) : cost;
      },
    },
  },
];

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 2 — The Rolling Ward (§15)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One Pen, with one animal inside it. See the file header for why they are one
 * body. §15 gives each Pen its own passive and its own Latch, and both survive
 * the merge exactly.
 */
function pen(id, name, who, passive, lore) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart', summonOnly: true,
    hp: [14, 14],
    silhouette: id,
    palette: ['#68635a', '#a9a396', '#191712'],
    shape: { body: 'squat', limbs: 0, eyes: 2 },
    scale: 0.4,
    lore,
    onSpawn(c) { setCnt(c, 'fright', 0); },

    /**
     * §15: freeing the animal and the animal fleeing at Fright 3 both remove
     * the Pen's passive permanently. Only the first pays out Encouraged, and
     * only a rescue the PLAYER made counts.
     */
    onDeath(c) {
      const ward = allies(c).find(a => a.defId === 'rolling-ward' && isAlive(a));
      if (!ward) return;
      const m = (ward.mem ||= {});
      m.freed = (m.freed || 0) + 1;
      if (m.freed === 1) {
        c.applyStatus(c.player, 'encouraged', 1, { fresh: true });
        c.block(c.player, 5, { source: null });
      }
      c.say(`${who} is out, and goes straight for the side passage.`, 'good');
    },

    moves: { hold: { id: 'hold', name: 'Latched', intent: Intent.SLEEP,
      tell: `While this is locked the Rolling Ward ${passive}. Break the latch and ${who} is out `
        + 'and that goes for good. At Fright 3 the pen opens on its own — the passive still goes, '
        + 'you just do not get the credit.',
      effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'elite'); },
  };
}

/* One card, on the body. See the same note in `bosses/kennelmaster.js`: three
   pens with their own House Rules plus the Ward's own is four, and the fourth
   lands on the Kid's portrait. */

export const penFirst = pen('ward-pen-1', 'First Pen', 'the grey dog',
  'gains 5 Guard at the start of its turn',
  'A wire pen on castors, with a folded blanket in it and something under the blanket.');
export const penSecond = pen('ward-pen-2', 'Second Pen', 'the long haired cat',
  'deals 3 more damage with every attack',
  'A pen with the water bowl bolted down so it cannot be knocked over.');
export const penThird = pen('ward-pen-3', 'Third Pen', 'the sooty bird',
  'gains 3 additional Guard whenever it gains Guard',
  'A tall pen with a perch in it, and a cloth half over the front.');

export const rollingWard = {
  id: 'rolling-ward',
  name: 'The Rolling Ward',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [165, 165],
  silhouette: 'rolling-ward',
  palette: ['#575047', '#9c9384', '#15130f'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.7,
  lore: 'An entire row of small kennel pens has torn itself from the floor and rolls through the corridor on dozens of wheels.',

  onSpawn(c) {
    mem(c).freed = 0;
    c.summon('ward-pen-1');
    c.summon('ward-pen-2');
    c.summon('ward-pen-3');
    announceWard(c);
  },

  onPlayerTurnStart(c) { announceWard(c); },
  onAllyDeath(c) { announceWard(c); },

  onTurnStart(c) { if (penAlive(c, 'ward-pen-1')) c.block(c.self, 5); },

  /** §15's Third Pen: "whenever the Ward gains Guard, gain 3 additional Guard." */
  onBoardEvent(c, ev) {
    if (!ev || ev.type !== 'block' || ev.actor !== c.self) return;
    if (!penAlive(c, 'ward-pen-3') || mem(c).echoing) return;
    mem(c).echoing = 1;
    c.block(c.self, 3, { noJoin: true });
    mem(c).echoing = 0;
  },

  moves: {
    'wheel-charge': {
      id: 'wheel-charge', name: 'Wheel Charge', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => wardDmg(c, 12),
      tell: 'Every wheel it has, in one direction.',
      effect(c) { hitPlayer(c, wardDmg(c, 12)); },
    },
    'lock-check': {
      id: 'lock-check', name: 'Lock Check', intent: Intent.BUFF,
      tell: 'It runs its own inspection.',
      effect(c) {
        let any = 0;
        for (const p of pensOf(c)) { c.block(p, 5); any++; }
        if (!any) c.block(c.self, 8);
        announceWard(c);
      },
    },
    'turn-the-corner': {
      id: 'turn-the-corner', name: 'Turn the Corner', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => wardDmg(c, 5),
      /* §15's third hit while at least two pens are still locked. Pens only
         break during the PLAYER's turn, so the count is settled before the
         intent is drawn and the player is the only thing that moves it. */
      hitsFn: (c) => (pensOf(c).length >= 2 ? 3 : 2),
      tell: 'It leans through the turn and everything on it swings out.',
      effect(c) { hitPlayer(c, wardDmg(c, 5), pensOf(c).length >= 2 ? 3 : 2); },
    },
    'roll-deeper': {
      id: 'roll-deeper', name: 'Roll Deeper', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'It takes them further in.',
      effect(c) {
        c.block(c.self, 9);
        for (const p of pensOf(c)) {
          const f = Math.min(3, (p.counters.fright || 0) + 1);
          p.counters.fright = f;
          if (f >= 3) {
            c.say(`${p.name} opens on its own and whatever was inside is gone.`, 'info');
            c.despawn(p);
            mem(c).freed = (mem(c).freed || 0) + 1;
          }
        }
        announceWard(c);
      },
    },
  },

  nextMove: (c) => cyc(['wheel-charge', 'lock-check', 'turn-the-corner', 'roll-deeper'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: Roll Deeper also gives every locked pen 4 Guard.');
    return h;
  },
};

const pensOf = (c) => allies(c).filter(a => isAlive(a) && /^ward-pen-/.test(String(a.defId)));
const penAlive = (c, id) => allies(c).some(a => isAlive(a) && a.defId === id);
function wardDmg(c, base) { return base + (penAlive(c, 'ward-pen-2') ? 3 : 0); }

function announceWard(c) {
  const n = pensOf(c).length;
  c.announceRule({
    id: `ward:${c.self.id}`,
    name: `${n} PENS STILL LOCKED`,
    text: 'Each locked pen is doing something for it: Guard every turn, 3 more damage on every attack, '
      + 'and 3 extra on every Guard it gains. Break a latch and the animal leaves AND the passive goes, permanently. '
      + 'You can win this by hitting the body alone. It is just slower.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 3 — The Perfect Pen (§16)
 * ═══════════════════════════════════════════════════════════════════════════ */
function control(id, name, lore, tell) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart', summonOnly: true,
    hp: [12, 12],
    silhouette: id,
    palette: ['#7f8a8f', '#c3cdd1', '#181d20'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.34,
    lore,
    onDeath(c) {
      const pen = allies(c).find(a => a.defId === 'perfect-pen' && isAlive(a));
      if (!pen) return;
      const m = (pen.mem ||= {});
      m.broken = (m.broken || 0) + 1;
      m.repair = { ...(m.repair || {}), [id]: 2 };
    },
    moves: { hold: { id: 'hold', name: 'Running', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'elite'); },
  };
}

export const penHeater = control('pen-heater', 'Heater',
  'A ceramic panel, exactly warm enough, never off.',
  'Break it and the Safety Rating drops. It comes back in two turns at half strength.');
export const penFeeder = control('pen-feeder', 'Food Dispenser',
  'It measures the portion. It has never once got it wrong.',
  'Break it and the Safety Rating drops. It comes back in two turns at half strength.');
export const penLock = control('pen-lock', 'Door Lock',
  'There is no keyhole on this side. There is no door on this side.',
  'Break it and the Safety Rating drops. It comes back in two turns at half strength.');

export const perfectPen = {
  id: 'perfect-pen',
  name: 'The Perfect Pen',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [158, 158],
  silhouette: 'perfect-pen',
  palette: ['#cfd6d9', '#8a969b', '#1b2124'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 1.65,
  lore: 'A spotless circular enclosure assembles itself around a frightened animal. Padded walls. Soft bed. Food. Water. Heating. No visible exit.',

  onSpawn(c) {
    setCnt(c, 'safety', 2);
    mem(c).broken = 0;
    mem(c).repair = {};
    c.summon('pen-heater');
    c.summon('pen-feeder');
    c.summon('pen-lock');
    announcePerfect(c);
  },

  onPlayerTurnStart(c) {
    mem(c).touched = 0;
    announcePerfect(c);
  },

  onAllyDeath(c) { mem(c).touched = 1; announcePerfect(c); },

  /**
   * §16: "At the end of every enemy turn, if the player did not damage one of
   * the Pen's control objects, gain 1 Safety." Measured at the enemy turn's
   * end, which is after this turn's numbers have already resolved and before
   * the next turn's are drawn — so the band the player reads is always the band
   * they will be hit by.
   */
  onTurnEnd(c) {
    if (!mem(c).touched) addCnt(c, 'safety', 1, 5, 0);
    /* §16: "The object repairs after two enemy turns with 6 Integrity." */
    const rep = { ...(mem(c).repair || {}) };
    for (const id of Object.keys(rep)) {
      rep[id] -= 1;
      if (rep[id] > 0) continue;
      delete rep[id];
      c.summon(id, { hp: 6 });
    }
    mem(c).repair = rep;
    if (cnt(c, 'safety') >= 3) c.block(c.self, 5);
    announcePerfect(c);
  },

  /** §16: 0 or 1 Safety and it takes 15% more. */
  damageTakenMul(c) { return cnt(c, 'safety') <= 1 ? 1.15 : 1; },

  moves: {
    'padded-wall': {
      id: 'padded-wall', name: 'Padded Wall', intent: Intent.DEFEND, block: 13,
      tell: 'Another layer, softer than the last.',
      effect(c) { c.block(c.self, 13); },
    },
    'gentle-restraint': {
      id: 'gentle-restraint', name: 'Gentle Restraint', intent: Intent.ATTACK_DEBUFF, damage: 8, hits: 1,
      damageFn: (c) => penDmg(c, 8),
      applies: [{ id: 'gentle-restraint', stacks: 1, to: 'player' }],
      tell: 'It holds you still, carefully, the way you hold something that is panicking.',
      effect(c) {
        hitPlayer(c, penDmg(c, 8));
        c.applyStatus(c.player, 'gentle-restraint', 1, { fresh: true });
      },
    },
    'automatic-feeder': {
      id: 'automatic-feeder', name: 'Automatic Feeder', intent: Intent.BUFF,
      tell: 'It is time. It is always time.',
      effect(c) { c.heal(c.self, 7); },
    },
    'complete-lockdown': {
      id: 'complete-lockdown', name: 'Complete Lockdown', intent: Intent.ATTACK_BIG,
      damage: 18, hits: 1, block: 18,
      damageFn: (c) => penDmg(c, 18),
      tell: 'Everything closes at once, and inside it something stops shaking.',
      effect(c) {
        hitPlayer(c, penDmg(c, 18));
        c.block(c.self, 18);
        setCnt(c, 'safety', 3);
        /* §16: "The Ward Animal's Fright decreases by 1. THAT LAST PART IS
           IMPORTANT. The Pen's oppressive action genuinely makes the animal
           feel temporarily safer. That is precisely why the system believes it
           is correct." */
        const animal = board(c).find(a => a && a.alive && String(a.defId || '').startsWith('ward-')
          && !/^ward-pen/.test(String(a.defId)));
        if (animal) frighten(c, animal, -1);
        c.say('Inside, whatever it is, stops shaking. That is the whole problem.', 'info');
        announcePerfect(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'safety') >= 5) return 'complete-lockdown';
    return cyc(['padded-wall', 'gentle-restraint', 'automatic-feeder'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.counters.safety = 3;
      h.notes.push('Haunt 9: it assembles at Safety 3.');
    }
    return h;
  },
};

function penDmg(c, base) { return base + (cnt(c, 'safety') >= 4 ? 3 : 0); }

function announcePerfect(c) {
  const s = cnt(c, 'safety');
  const band = s <= 1 ? 'takes 15% MORE damage'
    : s === 2 ? 'has no modifier'
      : s === 3 ? 'gains 5 Guard every turn'
        : s === 4 ? 'deals 3 more damage with every attack'
          : 'goes into Complete Lockdown next turn — 18 damage, 18 Guard, and back to Safety 3';
  c.announceRule({
    id: `perfect:${c.self.id}`,
    name: `SAFETY RATING ${s} / 5`,
    text: `At ${s} it ${band}. It gains one every enemy turn you do NOT damage a control object — `
      + 'the Heater, the Food Dispenser or the Door Lock. Breaking one drops the Rating by 1, and it '
      + 'comes back in two turns at half Integrity. You are fighting something whose defence is a score for how safe it is.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const KENNEL_SCARES = [
  collarCollector, shortCollar, heavyCollar, bellCollar, spareCollar,
  rollingWard, penFirst, penSecond, penThird,
  perfectPen, penHeater, penFeeder, penLock,
];
