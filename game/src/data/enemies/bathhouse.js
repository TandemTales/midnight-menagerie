/**
 * The Bathhouse and Rain Wing — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/14-bathhouse.md §1–§13, §38–§43.
 *
 * "The mansion's plumbing has become its own supernatural climate system."
 * Drizzle's region, and its one lesson is §preamble's:
 *
 *     THE BATTLEFIELD ITSELF CAN BECOME PART OF THE ENEMY FORMATION.
 *
 * ── WEATHER IS A REAL THING AND IT LIVES HERE ───────────────────────────────
 *
 * §2 asks for a global battlefield state with visible rules that "should not
 * simply mean: enemies gain bonuses. The player should sometimes benefit too."
 * Nothing in the engine models a global condition, so this file builds one and
 * the Scares and the boss import it.
 *
 * The state itself is `field.weather` — one string, shared, read by every def
 * that cares. The PLAYER's half of each Weather is a status on the Kid, one at
 * a time, because a status is the only thing that can hook `modifyBlockGain`,
 * `onCardsDrawn` and the rest on the player's side; it also means the player
 * can see which Weather they are standing in on their own portrait.
 *
 * ── AND A WEATHER CHANGE IS ALWAYS ONE TURN AHEAD ───────────────────────────
 *
 * This is the load-bearing rule and it comes straight out of §22, which is
 * written about the boss and is right about the whole region: "The Matron
 * announces every Weather change ONE ACTION BEFORE IT OCCURS... This means the
 * player always has one full turn of warning."
 *
 * Applied region-wide it also settles an intent-honesty problem that would
 * otherwise be everywhere. Downpour adds 2 to every enemy attack; Overflow
 * reaches Flood 3 at the end of an enemy turn; the Pipe Knocker's Release Valve
 * makes Steam mid-phase. Any of those landing immediately would raise numbers
 * the player had already been shown. So nothing changes the Weather directly:
 * everything sets `field.pendingWeather`, the House Rule says what is coming,
 * and `openWeather` promotes it at the start of the player's turn, before
 * intents are drawn. The player reads the new Weather and the numbers it
 * produced at the same moment.
 *
 * ── WET IS NOT A DEBUFF ─────────────────────────────────────────────────────
 *
 * §3: "Wet therefore begins as a mixed condition rather than a pure debuff."
 * For the player it is 2 extra Guard on the first Guard gain of the turn. For
 * about half this roster it is what makes them dangerous. It is `kind:
 * 'neutral'` for that reason and the House Rules say so on both sides.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, field, lastMove,
} from './_lib.js';

const REGION = 'bathhouse';

/* ══ Weather ════════════════════════════════════════════════════════════════ */

export const WEATHERS = ['clear', 'rain', 'steam', 'downpour', 'drain', 'flood'];
const WEATHER_STATUS = {
  rain: 'weather-rain', steam: 'weather-steam', downpour: 'weather-downpour',
  drain: 'weather-drain', flood: 'weather-flood',
};

export const WEATHER_TEXT = {
  clear: 'Clear. Nothing is falling and nothing is fogged.',
  rain: 'RAIN. Everyone becomes Wet at the start of their own turn.',
  steam: 'STEAM. Your first Attack each turn deals 25% LESS — and the first time you '
    + 'draw extra Tricks in a turn you draw one more. It hides them and it helps your hand.',
  downpour: 'DOWNPOUR. Everyone becomes Wet. Enemy attacks deal 2 more, and every Guard '
    + 'you gain is 2 higher.',
  drain: 'DRAIN. Nobody is Wet any more, and EVERYONE loses all their Guard at the end of '
    + 'their turn — you and them. Spend it or lose it.',
  flood: 'FLOOD. You are Wet, your FIRST Trick each turn costs 1 more Nerve and your SECOND '
    + 'costs 1 less. It changes the order you play in, not how much you can do.',
};

/** The Weather right now. Everything reads this; nothing else writes it. */
export function weather(c) { return field(c).weather || 'clear'; }
export function isWet(c, who) { return c.has('wet', who || c.player); }

/**
 * §22's rule, region-wide: a Weather change is SCHEDULED, never immediate.
 *
 * Every caller in this region and both files that import it go through here,
 * which is what keeps Downpour's +2 out of a number the player has already
 * been shown. `openWeather` is the only thing that makes it real.
 */
export function prepareWeather(c, next, why) {
  if (!WEATHERS.includes(next)) return;
  if (weather(c) === next) { field(c).pendingWeather = null; return; }
  field(c).pendingWeather = next;
  if (why) c.say(why, 'warn');
  announceWeather(c);
}

/** Promote the scheduled Weather. Called from every def's `onPlayerTurnStart`. */
export function openWeather(c) {
  const next = field(c).pendingWeather;
  if (next) {
    field(c).pendingWeather = null;
    field(c).weather = next;
    for (const id of Object.values(WEATHER_STATUS)) c.removeStatus(c.player, id);
    if (WEATHER_STATUS[next]) c.applyStatus(c.player, WEATHER_STATUS[next], 1, { fresh: true });
    c.say(`The weather turns: ${next.toUpperCase()}.`, 'warn');
  }
  /* §2's Rain and Downpour soak everyone "at the beginning of their turn", and
     this is the player's beginning. Each enemy soaks itself in `soak`. */
  if (weather(c) === 'rain' || weather(c) === 'downpour' || weather(c) === 'flood') {
    c.applyStatus(c.player, 'wet', 1, { fresh: true });
  }
  /* §16's Drain: "ALL WET IS REMOVED" — everyone, once, as it opens. */
  if (weather(c) === 'drain') {
    c.removeStatus(c.player, 'wet');
    for (const a of board(c)) if (a && a.alive) c.removeStatus(a, 'wet');
  }
  announceWeather(c);
}

/** An enemy's own beginning-of-turn soak. */
export function soak(c) {
  const w = weather(c);
  if (w !== 'rain' && w !== 'downpour') return;
  if (c.has('sheltered', c.self)) return;      // §8: Shelter is exactly this
  c.applyStatus(c.self, 'wet', 1, { fresh: true });
}

/** §2 Downpour: "enemy attacks deal 2 additional damage." One expression, everywhere. */
export function wx(c, dmg) { return weather(c) === 'downpour' ? dmg + 2 : dmg; }

/**
 * The Weather card, announced by whoever is asked.
 *
 * `stack: true` because every enemy here also announces its OWN rule, and
 * `announceRule` otherwise clears a source's previous card. Re-announced from
 * both `onPlayerTurnStart` and `onAllyDeath` so the card survives the death of
 * whichever enemy happened to be holding it.
 */
export function announceWeather(c) {
  const w = weather(c);
  const next = field(c).pendingWeather;
  c.announceRule({
    id: 'weather', stack: true,
    name: next ? `${w.toUpperCase()} → ${next.toUpperCase()} NEXT TURN` : `WEATHER · ${w.toUpperCase()}`,
    text: WEATHER_TEXT[w]
      + (next ? ` It changes at the START of your next turn, so you get a whole turn to plan for it.` : ''),
  });
}

/* ══ the region's own statuses ═══════════════════════════════════════════════ */

/**
 * The five Weather statuses are written out as literals rather than built by a
 * factory, and it is not for readability.
 *
 * `tests/seams/check.py` collects the ids that EXIST by scanning `id: '...'`
 * out of the source, and a factory that returns `{ id, name, ... }` from a
 * parameter puts no such literal anywhere in the file. Every one of these
 * registered perfectly at runtime and the checker still called `weather-rain`
 * "applied but never registered" — correctly, on the evidence it had. A status
 * whose id cannot be found by reading the file is a status nobody can grep for
 * either.
 */

export const BATH_STATUSES = [
  {
    /**
     * §3. "A Wet character remains Wet until the end of their next turn unless
     * refreshed. For players: the first time they gain Guard while Wet, gain 2
     * additional Guard. THEN WET REMAINS."
     *
     * `kind: 'neutral'` on purpose — see the file header. The last clause is
     * why the spend flag clears at turn start rather than removing the status:
     * the bonus is once a turn, Wet is not.
     */
    id: 'wet', name: 'Wet', kind: 'neutral', icon: 'wet',
    desc: 'Dripping. The first Guard you gain each turn is 2 higher. Some things in here get worse when they are wet.',
    /* `enemyTurnEnd`, NOT `turnEnd`. A player's `turnEnd` decay runs BEFORE the
       enemy phase, so Wet applied at the start of a turn was already gone by
       the time anything could hit you for it — the Matron's Stop Splashing
       promised 14 and delivered 10, twelve times, in `tests/enemies/audit.py`.
       §3's "until the end of their next turn" is one whole round, and this is
       where a round ends. */
    decay: 'enemyTurnEnd', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (!amt || h.owner?.side !== 'player' || h.owner._wetSpent) return amt;
        h.owner._wetSpent = true;
        return amt + 2;
      },
      onTurnStart: (h) => { if (h.owner) h.owner._wetSpent = false; },
    },
  },

  {
    /* 'Rainfall' and not 'Rain': the Heart already ships a one-shot Guard buff
       called Rain (Drizzle's own memory of it), and two chips reading the same
       word mean two different things on the same portrait.
       `tests/status-names/check.py` is the gate that says so. */
    id: 'weather-rain', name: 'Rainfall', kind: 'neutral', icon: 'rain',
    desc: 'It is raining indoors. Everyone becomes Wet at the start of their own turn.',
    decay: 'never', stacks: false, max: 1,
  },

  {
    id: 'weather-steam', name: 'Steam', kind: 'neutral', icon: 'steam',
    desc: 'The room is fogged. Your first Attack Trick each turn deals 25% less, and the first time you draw extra Tricks you draw one more.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      /* Both halves of §2's "some targeting and Guard effects change", made
         concrete: Steam hides the enemies AND clears your head. */
      modifyDamageDealt: (amt, h) => {
        if (h.attacker?.side !== 'player' || h.card?.type !== 'attack') return amt;
        if (h.owner?._steamSpent) return amt;
        if (h.owner) h.owner._steamSpent = true;
        return Math.max(0, Math.ceil(amt * 0.75));
      },
      onCardsDrawn: (h) => {
        if (h.reason === 'turnStart' || h.owner?._steamDrew) return;
        if (h.owner) h.owner._steamDrew = true;
        h.e.drawCards(1, 'steam');
      },
      onTurnStart: (h) => { if (h.owner) { h.owner._steamSpent = false; h.owner._steamDrew = false; } },
    },
  },

  {
    id: 'weather-downpour', name: 'Downpour', kind: 'neutral', icon: 'downpour',
    desc: 'It is coming down hard. Everyone becomes Wet, enemy attacks deal 2 more, and every Guard you gain is 2 higher.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => (amt && h.owner?.side === 'player' ? amt + 2 : amt),
    },
  },

  /* §21's Flood. "Flood changes SEQUENCING rather than simply taxing energy" —
     which is why the second Trick gives the Nerve back rather than the tax
     simply being smaller. A turn of one expensive Trick is punished; a turn of
     several is not. */
  {
    id: 'weather-flood', name: 'Flood', kind: 'neutral', icon: 'flood',
    desc: 'The room is filling. You are Wet, your first Trick each turn costs 1 more Nerve and your second costs 1 less.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        if (n === 0) return cost + 1;
        if (n === 1) return Math.max(0, cost - 1);
        return cost;
      },
    },
  },

  /* §16's fourth stage. Guard going at the END of the turn rather than the
     start is what makes it a decision instead of a tax: Guard you spend during
     the turn was never wasted, Guard you banked was. */
  {
    id: 'weather-drain', name: 'Drain', kind: 'neutral', icon: 'drain',
    desc: 'It is all going down the grates. Nobody is Wet, and everyone loses all their Guard at the end of their own turn.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onTurnEnd: (h) => {
        const who = h.owner;
        if (!who || !who.block) return;
        h.e.loseBlock(who, who.block, 'drain');
      },
    },
  },

  {
    /** §4. Slippery is Wet turned into a small, repeatable defence. */
    id: 'slippery', name: 'Slippery', kind: 'buff', icon: 'soap',
    desc: 'Wet and soapy. The first Attack Trick to hit it each turn deals 3 less damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (!amt || h.card?.type !== 'attack' || h.owner?._slipSpent) return amt;
        if (h.owner) h.owner._slipSpent = true;
        return Math.max(0, amt - 3);
      },
    },
  },
  {
    /** §7. Steam hides the Ghost. */
    id: 'diffuse', name: 'Diffuse', kind: 'buff', icon: 'steam',
    desc: 'Spread through the steam. The first Attack Trick to hit it each turn deals HALF damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (!amt || h.card?.type !== 'attack' || h.owner?._diffuseSpent) return amt;
        if (h.owner) h.owner._diffuseSpent = true;
        return Math.max(1, Math.floor(amt * 0.5));
      },
    },
  },
  {
    /** §7. Rain pulls it back together, and a solid thing can be hit properly. */
    id: 'condensed', name: 'Condensed', kind: 'debuff', icon: 'rain',
    desc: 'The rain has pulled it into something solid. It takes 20% more damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.2) },
  },
  {
    /** §8. The Imp's umbrella, on somebody else. */
    id: 'sheltered', name: 'Sheltered', kind: 'buff', icon: 'umbrella',
    desc: 'Under the umbrella. It does not get Wet from the Weather and gains 5 Guard at the start of its turn.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /** §15. The Reflection's shatter window. */
    id: 'cracked', name: 'Cracked', kind: 'debuff', icon: 'mirror',
    desc: 'A line runs through the glass. It takes 25% more damage until the end of your next turn.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.25) },
  },
  {
    /** §14. Overcooled: the furnace has gone out. */
    id: 'cold', name: 'Cold', kind: 'debuff', icon: 'boiler',
    desc: 'The furnace is out. Its next action relights it and does no damage at all.',
    decay: 'never', stacks: false, max: 1,
  },
];

/* ══ shared per-turn bookkeeping ════════════════════════════════════════════ */

/**
 * "Loses at least N Courage during one player turn" is written into five of
 * these enemies with five different numbers, and it means Courage LOST and not
 * damage dealt — a hazard or a retaliation counts.
 *
 * ── AND IT PAYS OUT AT THE START OF THE NEXT TURN ───────────────────────────
 *
 * The obvious place is `onPlayerTurnEnd`, and it is wrong. That hook fires at
 * step 3 of `endTurn` — after the intents were drawn and before the enemy acts
 * — so a meter that drops there drops underneath a number the player has
 * already been shown. `tests/enemies/audit.py` caught the Boiler promising 18
 * and delivering 10 for exactly this, and the Pipe Knocker, the Umbrella Imp
 * and Overflow were each one player-damage roll from the same lie.
 *
 * So this runs at `onPlayerTurnStart` instead: it measures the turn that just
 * finished, pays out, and reopens the ledger, all before this turn's intents
 * exist. The player watches the meter move at the top of their own turn, which
 * is when they are reading the board anyway.
 */
export function settleLedger(c, need, onPay) {
  const before = mem(c).hpAtStart;
  const lost = (before ?? c.self.hp) - c.self.hp;
  mem(c).hpAtStart = c.self.hp;
  if (before == null || lost < need) return false;
  onPay(lost);
  return true;
}

/** Every def in this region opens its turn the same way. */
export function bathTurnStart(c) {
  openWeather(c);
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 1. Soap Sprite — Wet helps both sides, immediately (§4)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const soapSprite = {
  id: 'soap-sprite',
  name: 'Soap Sprite',
  region: REGION,
  tier: 'normal',
  role: 'introducer',
  hp: [24, 24],
  silhouette: 'soap-sprite',
  palette: ['#cfe6f2', '#8fb9d4', '#1c2a33'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.5,
  lore: 'A tiny creature made from bubbles and a bar of soap. It slides everywhere instead of walking.',

  onSpawn(c) { announceSprite(c); },
  onPlayerTurnStart(c) { bathTurnStart(c); c.self._slipSpent = false; announceSprite(c); },
  onAllyDeath(c) { announceWeather(c); },

  onTurnStart(c) {
    soak(c);
    /* §4: "Soap Sprite becomes Slippery WHILE WET." Tied to the condition, so
       drying it out really does take the defence away. */
    if (isWet(c, c.self)) c.applyStatus(c.self, 'slippery', 1);
    else c.removeStatus(c.self, 'slippery');
    announceSprite(c);
  },

  moves: {
    'soap-splash': {
      id: 'soap-splash', name: 'Soap Splash', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 1,
      damageFn: (c) => wx(c, 5),
      applies: [{ id: 'wet', stacks: 1, to: 'player' }],
      tell: 'A faceful of it.',
      effect(c) { hitPlayer(c, wx(c, 5)); c.applyStatus(c.player, 'wet', 1, { fresh: true }); },
    },
    'bubble-up': {
      id: 'bubble-up', name: 'Bubble Up', intent: Intent.DEFEND, block: 8,
      blockFn: (c) => 8 + (isWet(c, c.self) ? 3 : 0),
      tell: 'It swells up into a lather.',
      effect(c) { c.block(c.self, 8 + (isWet(c, c.self) ? 3 : 0)); },
    },
    'slip-tackle': {
      id: 'slip-tackle', name: 'Slip Tackle', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => wx(c, 7),
      tell: 'It comes across the tiles far faster than it should.',
      effect(c) {
        hitPlayer(c, wx(c, 7));
        if (c.has('slippery', c.self)) c.block(c.self, 4);
      },
    },
  },

  nextMove: (c) => cyc(['soap-splash', 'bubble-up', 'slip-tackle'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) h.notes.push('Haunt 3: Soap Splash applies Wet to the whole party.');
    return h;
  },
};

function announceSprite(c) {
  c.announceRule({
    id: `soap:${c.self.id}`,
    name: c.has('slippery', c.self) ? 'SLIPPERY' : 'Dry',
    text: c.has('slippery', c.self)
      ? 'Wet and soapy: the first Attack Trick to hit it each turn deals 3 less. Dry it out and it stops.'
      : 'It is only Slippery while it is Wet, and it gets itself Wet. Being Wet is 2 more Guard for YOU too.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 2. Puddle Spirit — the Weather changes what it physically is (§5)
 * ═══════════════════════════════════════════════════════════════════════════ */
const SIZES = ['Small', 'Medium', 'Large'];

export const puddleSpirit = {
  id: 'puddle-spirit',
  name: 'Puddle Spirit',
  region: REGION,
  tier: 'normal',
  role: 'grower',
  hp: [29, 29],
  silhouette: 'puddle',
  palette: ['#7fa8bf', '#4a6f86', '#131f28'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 0.7,
  lore: 'A face appears inside a puddle. The puddle rises into a little walking figure whenever it attacks.',

  onSpawn(c) { setCnt(c, 'size', 1); announcePuddle(c); },
  onPlayerTurnStart(c) { bathTurnStart(c); announcePuddle(c); },
  onAllyDeath(c) { announceWeather(c); },

  onTurnStart(c) {
    soak(c);
    if (cnt(c, 'size') === 2) c.block(c.self, 5);
    announcePuddle(c);
  },

  /** §5: "At the end of an enemy turn during Rain, increase Size by 1." */
  onTurnEnd(c) {
    const w = weather(c);
    if (w === 'rain' || w === 'downpour') addCnt(c, 'size', 1, 2, 0);
    announcePuddle(c);
  },

  /** §5's Small band. */
  damageTakenMul(c) { return cnt(c, 'size') === 0 ? 1.2 : 1; },

  moves: {
    splash: {
      id: 'splash', name: 'Splash', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => puddleDmg(c, 7),
      tell: 'It rears up and comes down on you.',
      effect(c) { hitPlayer(c, puddleDmg(c, 7)); dryShrink(c); },
    },
    'spread-out': {
      id: 'spread-out', name: 'Spread Out', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'It thins itself across more of the floor.',
      effect(c) { c.block(c.self, 5); addCnt(c, 'size', 1, 2, 0); announcePuddle(c); },
    },
    'drain-away': {
      id: 'drain-away', name: 'Drain Away', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => puddleDmg(c, 5),
      tell: 'It pours itself at you and loses some down the grate.',
      effect(c) {
        hitPlayer(c, puddleDmg(c, 5));
        addCnt(c, 'size', -1, 2, 0);
        c.heal(c.self, 4);
        announcePuddle(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'size') === 0) return 'spread-out';
    if (cnt(c, 'size') === 2) return 'drain-away';
    return 'splash';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.advanced.counters.size = 2;
      h.notes.push('Haunt 4: it opens advanced formations Large.');
    }
    return h;
  },
};

function puddleDmg(c, base) {
  const s = cnt(c, 'size');
  return wx(c, Math.max(1, base + (s === 0 ? -2 : s === 2 ? 3 : 0)));
}

/** §5: "During Clear Weather, after Puddle Spirit attacks, decrease Size by 1." */
function dryShrink(c) {
  if (weather(c) !== 'clear') return;
  addCnt(c, 'size', -1, 2, 0);
  announcePuddle(c);
}

function announcePuddle(c) {
  const s = cnt(c, 'size');
  c.announceRule({
    id: `puddle:${c.self.id}`,
    name: `${SIZES[s].toUpperCase()} PUDDLE`,
    text: (s === 0 ? 'Small: it hits for 2 less and takes 20% MORE damage. '
      : s === 2 ? 'Large: it hits for 3 more and gains 5 Guard every turn. '
        : 'Medium: no modifier either way. ')
      + 'Rain grows it every enemy turn. Clear Weather shrinks it every time it attacks.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 3. Pipe Knocker — stored pressure that changes the room (§6)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const pipeKnocker = {
  id: 'pipe-knocker',
  name: 'Pipe Knocker',
  region: REGION,
  tier: 'normal',
  role: 'charger',
  hp: [35, 35],
  silhouette: 'pipes',
  palette: ['#9a7a4e', '#5e4930', '#181209'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 0.9,
  lore: 'A knot of old pipes tears itself from the wall and walks around on copper elbows. Something keeps hammering from inside.',

  onSpawn(c) { setCnt(c, 'pressure', 0); mem(c).hpAtStart = c.self.hp; announcePipes(c); },

  /** §6: "Whenever it loses at least 13 Courage during one player turn, lose 1 Pressure." */
  onPlayerTurnStart(c) {
    bathTurnStart(c);
    settleLedger(c, flag(c, 'ventAt', 13), () => {
      if (cnt(c, 'pressure') <= 0) return;
      addCnt(c, 'pressure', -1, 4, 0);
      c.say('Something gave, and the knocking is quieter.', 'good');
    });
    announcePipes(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  moves: {
    'build-pressure': {
      id: 'build-pressure', name: 'Build Pressure', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'The hammering gets faster.',
      effect(c) { c.block(c.self, 6); addCnt(c, 'pressure', 1, 4, 0); announcePipes(c); },
    },
    'pipe-slam': {
      id: 'pipe-slam', name: 'Pipe Slam', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => wx(c, 7 + 2 * cnt(c, 'pressure')),
      tell: 'It swings a length of copper at you.',
      effect(c) { hitPlayer(c, wx(c, 7 + 2 * cnt(c, 'pressure'))); },
    },
    'release-valve': {
      id: 'release-valve', name: 'Release Valve', intent: Intent.ATTACK_BIG, damage: 5, hits: 1,
      damageFn: (c) => wx(c, 5 * Math.max(1, cnt(c, 'pressure'))),
      tell: 'Everything it has been holding comes out at once, and the room fogs.',
      effect(c) {
        hitPlayer(c, wx(c, 5 * Math.max(1, cnt(c, 'pressure'))));
        setCnt(c, 'pressure', 0);
        prepareWeather(c, 'steam', 'The burst will fill the room with steam.');
        announcePipes(c);
      },
    },
  },

  /** §6's behaviour: build, slam, build, then check the valve. */
  nextMove: (c) => {
    const step = (c.history || []).length % 4;
    if (step === 3) return cnt(c, 'pressure') >= 3 ? 'release-valve' : 'pipe-slam';
    return step === 1 ? 'pipe-slam' : 'build-pressure';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.ventAt = 16;
      h.notes.push('Haunt 5: it takes 16 Courage in a turn to knock a Pressure off, not 13.');
    }
    return h;
  },
};

function announcePipes(c) {
  const p = cnt(c, 'pressure');
  c.announceRule({
    id: `pipes:${c.self.id}`,
    name: `PRESSURE ${p} / 4`,
    text: `Pipe Slam hits for 2 more per Pressure. At 3 or more it vents instead — ${5 * Math.max(1, p)} `
      + `damage, all the Pressure gone, and STEAM at the start of your next turn. `
      + `Take ${flag(c, 'ventAt', 13)} Courage off it in one turn and a Pressure comes off with it.`,
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 4. Steam Ghost — the Weather is its armour and its weakness (§7)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const steamGhost = {
  id: 'steam-ghost',
  name: 'Steam Ghost',
  region: REGION,
  tier: 'normal',
  role: 'evader',
  hp: [34, 34],
  silhouette: 'steam-ghost',
  palette: ['#dfe8ec', '#a3b4bd', '#242c31'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.85,
  lore: 'A translucent ghost forms from bathroom steam. Its face repeatedly vanishes into condensation.',

  onSpawn(c) { condense(c); },
  onPlayerTurnStart(c) { bathTurnStart(c); c.self._diffuseSpent = false; condense(c); },
  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); condense(c); },

  moves: {
    'fog-the-glass': {
      id: 'fog-the-glass', name: 'Fog the Glass', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'It breathes on everything and the room goes white.',
      effect(c) {
        c.block(c.self, 6);
        prepareWeather(c, 'steam', 'It is fogging the room for next turn.');
      },
    },
    'scalding-touch': {
      id: 'scalding-touch', name: 'Scalding Touch', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => wx(c, 8),
      tell: 'It puts a hand through you and the hand is far too hot.',
      effect(c) { hitPlayer(c, wx(c, 8)); },
    },
    'condensation-drip': {
      id: 'condensation-drip', name: 'Condensation Drip', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 1,
      damageFn: (c) => wx(c, 5 + (weather(c) === 'rain' ? 3 : 0)),
      applies: [{ id: 'wet', stacks: 1, to: 'player' }],
      tell: 'It runs down the walls and finds you.',
      effect(c) {
        hitPlayer(c, wx(c, 5 + (weather(c) === 'rain' ? 3 : 0)));
        c.applyStatus(c.player, 'wet', 1, { fresh: true });
      },
    },
  },

  nextMove: (c) => cyc(['fog-the-glass', 'scalding-touch', 'condensation-drip'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) h.notes.push('Haunt 6: it opens by fogging the room before anyone acts.');
    return h;
  },
};

/** §7's two states, both driven entirely by the Weather. */
function condense(c) {
  const w = weather(c);
  c.removeStatus(c.self, 'diffuse');
  c.removeStatus(c.self, 'condensed');
  if (w === 'steam') c.applyStatus(c.self, 'diffuse', 1);
  else if (w === 'rain' || w === 'downpour') c.applyStatus(c.self, 'condensed', 1);
  c.announceRule({
    id: `ghost:${c.self.id}`,
    name: w === 'steam' ? 'DIFFUSE' : (w === 'rain' || w === 'downpour') ? 'CONDENSED' : 'Between states',
    text: w === 'steam'
      ? 'In its own steam: the first Attack Trick to hit it each turn deals HALF. Change the Weather and it has to come together.'
      : (w === 'rain' || w === 'downpour')
        ? 'The rain has pulled it into something solid: it takes 20% MORE damage. This is the window.'
        : 'Clear air: no modifier. It will fog the room again the first chance it gets.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 5. Umbrella Imp — it decides who is standing in the Weather (§8)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const umbrellaImp = {
  id: 'umbrella-imp',
  name: 'Umbrella Imp',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [31, 31],
  silhouette: 'umbrella',
  palette: ['#4b3f57', '#8f7fa3', '#161119'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.55,
  lore: 'A small creature carries an enormous umbrella and keeps dramatically opening it indoors.',

  onSpawn(c) { mem(c).hpAtStart = c.self.hp; announceImp(c); },

  /** §8: "If Umbrella Imp takes at least 12 Courage damage during one player turn, Shelter ends." */
  onPlayerTurnStart(c) {
    bathTurnStart(c);
    settleLedger(c, flag(c, 'shelterAt', 12), () => {
      let broke = 0;
      for (const a of board(c)) {
        if (a && a.alive && a.hasStatus && a.hasStatus('sheltered')) { c.removeStatus(a, 'sheltered'); broke++; }
      }
      if (broke) c.say('The umbrella folded. Everything under it is in the rain again.', 'good');
    });
    announceImp(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  moves: {
    'open-umbrella': {
      id: 'open-umbrella', name: 'Open Umbrella', intent: Intent.DEFEND_BUFF, block: 5,
      applies: [{ id: 'sheltered', stacks: 1, to: 'ally' }],
      tell: 'It puts the umbrella up over somebody else.',
      effect(c) {
        c.block(c.self, 5);
        const friend = allies(c).find(a => isAlive(a) && !c.has('sheltered', a));
        if (friend) {
          c.applyStatus(friend, 'sheltered', 1);
          c.say(`${friend.name} is under the umbrella.`, 'warn');
        }
        announceImp(c);
      },
    },
    'umbrella-poke': {
      id: 'umbrella-poke', name: 'Umbrella Poke', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => wx(c, 7),
      tell: 'The pointy end.',
      effect(c) { hitPlayer(c, wx(c, 7)); },
    },
    'shake-it-off': {
      id: 'shake-it-off', name: 'Shake It Off', intent: Intent.ATTACK_DEBUFF, damage: 4, hits: 1,
      damageFn: (c) => wx(c, 4),
      appliesFn: (c) => (weather(c) === 'rain' || weather(c) === 'downpour'
        ? [{ id: 'wet', stacks: 1, to: 'player' }] : []),
      tell: 'It shakes everything it has collected straight at you.',
      effect(c) {
        hitPlayer(c, wx(c, 4));
        const w = weather(c);
        if (w === 'rain' || w === 'downpour') c.applyStatus(c.player, 'wet', 1, { fresh: true });
      },
    },
  },

  /** §8: shelter when there is rain and somebody to shelter; otherwise poke and shake. */
  nextMove: (c) => {
    const w = weather(c);
    const wet = w === 'rain' || w === 'downpour';
    if (wet && allies(c).some(a => isAlive(a) && !c.has('sheltered', a))) return 'open-umbrella';
    return cyc(['umbrella-poke', 'shake-it-off'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.shelterAt = 16;
      h.notes.push('Haunt 7: it takes 16 Courage in a turn to fold the umbrella, not 12.');
    }
    return h;
  },
};

function announceImp(c) {
  const under = board(c).filter(a => a && a.alive && a.hasStatus && a.hasStatus('sheltered')).length;
  c.announceRule({
    id: `imp:${c.self.id}`,
    name: under ? `UMBRELLA UP · ${under} sheltered` : 'Umbrella down',
    text: `A Sheltered enemy stays dry in the Weather and gains 5 Guard every turn. `
      + `Take ${flag(c, 'shelterAt', 12)} Courage off the IMP in one turn and the umbrella folds — `
      + 'so the support enemy is the answer to the enemy it is supporting.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 6. Overflow — the fight has a clock and the clock is the room (§9)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const overflow = {
  id: 'overflow',
  name: 'Overflow',
  region: REGION,
  tier: 'normal',
  role: 'clock',
  hp: [42, 42],
  silhouette: 'tub',
  palette: ['#e4e9ec', '#93a3ac', '#1d2429'],
  shape: { body: 'squat', limbs: 4, eyes: 0 },
  scale: 1.0,
  lore: 'A freestanding claw foot bathtub moves across the room while water pours endlessly over its sides.',

  onSpawn(c) { setCnt(c, 'flood', 0); mem(c).hpAtStart = c.self.hp; announceFlood(c); },

  /** §9: "Whenever Overflow loses at least 18 Courage during one player turn, reduce Flood by 1." */
  onPlayerTurnStart(c) {
    bathTurnStart(c);
    settleLedger(c, flag(c, 'drainAt', 18), () => {
      if (cnt(c, 'flood') <= 0) return;
      addCnt(c, 'flood', -1, 3, 0);
      c.say('Enough went over the side that the level dropped.', 'good');
    });
    applyFlood(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  /** §9: "At the end of every enemy turn, increase Flood by 1." */
  onTurnEnd(c) { addCnt(c, 'flood', 1, 3, 0); applyFlood(c); },

  moves: {
    'tub-bash': {
      id: 'tub-bash', name: 'Tub Bash', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => floodDmg(c, 9),
      tell: 'It walks into you on four cast iron feet.',
      effect(c) { hitPlayer(c, floodDmg(c, 9)); },
    },
    'more-water': {
      id: 'more-water', name: 'More Water', intent: Intent.DEFEND_BUFF, block: 8,
      /* Flood 1 soaks you and More Water always reaches at least Flood 1. */
      applies: [{ id: 'wet', stacks: 1, to: 'player' }],
      tell: 'The taps are still running and nobody can find them.',
      effect(c) { c.block(c.self, 8); addCnt(c, 'flood', 1, 3, 0); applyFlood(c); },
    },
    'pull-the-plug': {
      id: 'pull-the-plug', name: 'Pull the Plug', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => floodDmg(c, 6),
      applies: [{ id: 'wet', stacks: 1, to: 'player' }],
      tell: 'It lets most of itself go at once, and takes some back.',
      effect(c) {
        hitPlayer(c, floodDmg(c, 6));
        setCnt(c, 'flood', 1);
        c.heal(c.self, 7);
        applyFlood(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'flood') >= 3 && lastMove(c) !== 'pull-the-plug') return 'pull-the-plug';
    return cyc(['tub-bash', 'more-water'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.drainAt = 22;
      h.notes.push('Haunt 8: it takes 22 Courage in a turn to drop the Flood, not 18.');
    }
    return h;
  },
};

/** §9's Flood 3: "Overflow's attacks gain 4 damage." */
function floodDmg(c, base) { return wx(c, base + (cnt(c, 'flood') >= 3 ? 4 : 0)); }

/**
 * §9's three bands. Flood 1 soaks the player, Flood 2 is a Guard bonus for BOTH
 * sides, and Flood 3 schedules a Downpour — scheduled, not immediate, because
 * Downpour is +2 on every enemy attack and this fires at the end of an enemy
 * turn, well after those numbers were shown.
 */
function applyFlood(c) {
  const f = cnt(c, 'flood');
  if (f >= 1) c.applyStatus(c.player, 'wet', 1, { fresh: true });
  /* Flood 2 is the band that helps the player as much as the tub, so it goes on
     BOTH — see FLOOD_STATUS below. Removed as well as applied, because the
     level comes back down. */
  for (const who of [c.player, c.self]) {
    if (f >= 2) c.applyStatus(who, 'high-water', 1);
    else c.removeStatus(who, 'high-water');
  }
  if (f >= 3) prepareWeather(c, 'downpour', 'It is about to go over the sides completely.');
  announceFlood(c);
}

function announceFlood(c) {
  const f = cnt(c, 'flood');
  c.announceRule({
    id: `flood:${c.self.id}`,
    name: `FLOOD ${f} / 3`,
    text: '1: you are Wet. 2: both sides gain 3 more Guard whenever they gain Guard. '
      + '3: DOWNPOUR next turn and its attacks hit for 4 more. It rises every single enemy turn — '
      + `take ${flag(c, 'drainAt', 18)} Courage off it in one turn and it drops one.`,
  });
}

/* ══ Flood 2's Guard bonus ══════════════════════════════════════════════════ */

/**
 * §9 Flood 2: "BOTH SIDES gain 3 additional Guard whenever they gain Guard."
 *
 * A def cannot hook the player, so this is a status the Overflow keeps on
 * itself and mirrors onto the Kid — one rule, two holders, and the same three
 * points either way. `applyFlood` puts it up and takes it down with the level,
 * which is why it is not a `decay` bucket: the level can go back down.
 */
export const FLOOD_STATUS = {
  id: 'high-water', name: 'High Water', kind: 'neutral', icon: 'wet',
  desc: 'The room is ankle deep. Everyone gains 3 additional Guard whenever they gain Guard.',
  decay: 'never', stacks: false, max: 1,
  hooks: { modifyBlockGain: (amt) => (amt ? amt + 3 : amt) },
};
BATH_STATUSES.push(FLOOD_STATUS);

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const BATH_ENEMIES = [
  soapSprite, puddleSpirit, pipeKnocker, steamGhost, umbrellaImp, overflow,
];
