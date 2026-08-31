/**
 * The Lampworks — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/09-lampworks.md §1–§12, §49–§50.
 *
 * "Power that has not been used yet can be more dangerous than power being used
 * now." (§preamble.) Wisp's home region, and every enemy here is a hostile
 * version of his own resource philosophy: build, build, release, reset.
 *
 * ── CHARGE IS A COUNTER AND ITS RELEASE IS AN INTENT ────────────────────────
 *
 * §2 says Charge "should usually create a recognizable rhythm: build, build,
 * release, reset. The player can therefore decide whether to interrupt the
 * buildup, prepare for the release, or DELIBERATELY ALLOW IT." None of those
 * three decisions exists unless the release is legible before it lands, so
 * every scaling number in this file is a counter read by `damageFn`, never a
 * `modifyDamageDealt` status — the intent recomputes as the counter moves and
 * the player watches Discharge grow from 12 to 17 to 22.
 *
 * ── THE ONE WORD THIS REGION MAY NOT USE ────────────────────────────────────
 *
 * §4 gives the Lamp Moth a resource called Glow. GLOW IS WISP'S, declared in
 * `companions/wisp.js` as his central meter — and this is Wisp's own region, so
 * the collision would land in the one place it is most confusing. The Moth's is
 * `stolen` / "Stolen Light" here, which is also a better name for what it is:
 * Charge taken off somebody else. `tests/status-names/check.py` gates the class.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, field,
  dmgTaken, isAlive, board,
} from './_lib.js';

const REGION = 'lampworks';

/** §8: is the room in Blackout? Shared per-combat state, so everything agrees. */
export const isBlackout = (c) => !!field(c).blackout;

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const LAMPWORKS_STATUSES = [
  {
    /**
     * §21. The Lamplighter's Dimmed. "The first time the player gains Guard
     * during that turn, gain 4 less Guard. Then Dimmed ends. Minimum 0."
     *
     * §21 explains itself, and the reasoning is worth keeping: "The Lamplighter
     * is not literally extinguishing the player's energy resource. It creates a
     * small defensive INEFFICIENCY without suppressing an entire archetype."
     */
    id: 'dimmed', name: 'Dimmed', kind: 'debuff', icon: 'dimmed',
    desc: 'The first Guard you gain this turn is 4 less. Then it passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (!amt || (h.owner && h.owner._dimSpent)) return amt;
        if (h.owner) h.owner._dimSpent = true;
        return Math.max(0, amt - 4);
      },
    },
  },
  {
    /**
     * §6. The Gaslight Ghost is Dim: "the first Attack Trick targeting it each
     * player turn deals 50 percent damage."
     *
     * PER TURN, so the allowance is a field on the actor cleared by the Ghost's
     * own `onPlayerTurnStart` — the Paper Knight's Folded, one region back, and
     * for the same reason: `modifyDamageTaken` and `onAttacked` are two hook
     * invocations that have to agree about one allowance, and `ctx.owner` is
     * the only thing both are handed.
     */
    id: 'gaslit-dim', name: 'Dim', kind: 'buff', icon: 'gaslit-dim',
    desc: 'Hard to see. The first Attack Trick aimed at it each turn deals half damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, ctx) => {
        if (ctx.card?.type !== 'attack') return amt;
        const o = ctx.owner || {};
        if (o._dimUsed) return amt;
        return Math.max(0, Math.floor(amt * 0.5));
      },
      onAttacked: (ctx) => {
        if (ctx.card?.type !== 'attack') return;
        const o = ctx.owner || {};
        o._dimUsed = (o._dimUsed || 0) + 1;
        if (o._dimUsed >= (o._dimAllowance || 1)) o._dimSpent = true;
      },
    },
  },
  {
    /**
     * §8. Blackout's half that belongs on the enemies rather than in the field:
     * "enemies that gain Guard gain 2 additional Guard."
     *
     * A status on each living enemy, rather than a flag every enemy's block call
     * has to remember to consult — the Blob turns the lights out and the whole
     * board visibly gains it, which is also how the player learns what Blackout
     * costs them.
     */
    id: 'unlit', name: 'Unlit', kind: 'buff', icon: 'unlit',
    desc: 'The lights are out. It gains 2 additional Guard whenever it gains any.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyBlockGain: (amt) => (amt > 0 ? amt + 2 : amt) },
  },
  {
    /**
     * §29. The Lamplighter at 0 Stored Flame still has something to lose:
     * "instead become Flickering. Its next damaging attack deals 5 less."
     *
     * One-shot, and consumed on the attack rather than per hit — the Lamplighter
     * has no multi-hit move whose intent this could split (`damage x hits` is
     * the whole vocabulary), so removing it after the first hit would be safe;
     * removing it at `enemyTurnEnd` is safe for any future move too, so that is
     * what it does.
     */
    id: 'flickering', name: 'Flickering', kind: 'debuff', icon: 'flickering',
    desc: 'Its next damaging attack deals 5 less. Then it steadies.',
    decay: 'enemyTurnEnd', stacks: false, max: 1,
    hooks: { modifyDamageDealt: (amt) => Math.max(0, amt - 5) },
  },
];

/* ══ Blackout, the shared room state (§8) ═══════════════════════════════════ */

/** Turn the lights out. Every living enemy visibly gains Unlit. */
export function killTheLights(c, until) {
  field(c).blackout = true;
  field(c).blackoutUntil = until;
  for (const a of board(c)) c.applyStatus(a, 'unlit', 1, { fresh: true });
  c.announceRule({
    id: `dark:${c.self.id}`,
    name: 'Blackout',
    text: 'The lights are out. Nothing here sheds Charge from damage, everything gains 2 more Guard, '
      + 'and any Gaslight Ghost is Dim.',
  });
}

/** Bring them back. */
export function bringUpTheLights(c) {
  if (!field(c).blackout) return;
  field(c).blackout = false;
  for (const a of board(c)) c.removeStatus(a, 'unlit');
  c.clearRules(`dark:${c.self.id}`);
}

/**
 * §8: "enemies do not lose Charge when damaged" while the lights are out. One
 * helper so the rule lives in one place and every Charge-shedder agrees.
 *
 * ── CALL THIS FROM `onDamaged`, NOT `onPlayerTurnEnd` ───────────────────────
 *
 * Every threshold in this region is worded "whenever X loses at least N Courage
 * DURING ONE PLAYER TURN", and the tempting reading is to score it once at the
 * end of that turn. That reading lies. Moves and intents are committed at
 * player-turn start, so a counter dropped at turn end changes a number the
 * player has already read and acted on — the Chandelier promised a 9 and
 * delivered an 8 seven times before this was moved.
 *
 * Resolved the moment the threshold is CROSSED, the whole thing becomes the
 * feature instead: the Light goes out, the intent re-renders from 9 to 8 while
 * the player is still holding cards, and they can see what their damage bought.
 * The audit counts that as a dynamic intent responding to play, which is what
 * it is.
 */
export function shedCharge(c, key, threshold, n = 1) {
  if (isBlackout(c)) return 0;
  if (dmgTaken(c) < threshold) return 0;
  if (mem(c).shedThisTurn) return 0;
  mem(c).shedThisTurn = true;
  const before = cnt(c, key);
  addCnt(c, key, -n, 99, 0);
  return before - cnt(c, key);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Waxling — more dangerous AND more fragile as it goes (§3)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Waxling teaches that an enemy can become both more vulnerable and more
 * dangerous over time." (§3.)
 *
 * Wax counts DOWN, and every number the player reads is a `damageFn` over that
 * counter, so the ramp is visible three turns before it matters.
 */
const waxBonus = (c) => {
  const w = cnt(c, 'wax');
  if (w >= 3) return 0;
  if (w === 2) return 2;
  if (w === 1) return 4;
  return 0;
};

export const waxling = {
  id: 'waxling',
  name: 'Waxling',
  region: REGION,
  tier: 'normal',
  role: 'escalator',
  hp: [25, 25],
  silhouette: 'waxling',
  palette: ['#e8dcc0', '#c4a468', '#3a2f1c'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.55,
  lore: 'A small person made of candle wax, melting slowly, getting brighter the less of it there is.',

  onSpawn(c) { setCnt(c, 'wax', flag(c, 'openWax', 3)); announceWax(c); },

  /** §3: 3 Wax gains Guard; the melt happens at the END of its turn. */
  onTurnStart(c) { if (cnt(c, 'wax') >= 3) c.block(c.self, 5); },
  onTurnEnd(c) {
    if (mem(c).relit) { mem(c).relit = false; announceWax(c); return; }
    addCnt(c, 'wax', -1, 5, 0);
    announceWax(c);
  },

  /** §3: "At 1 Wax, Waxling takes 20 percent additional damage." */
  damageTakenMul(c) { return cnt(c, 'wax') === 1 ? 1.2 : 1; },

  moves: {
    'wax-slap': {
      id: 'wax-slap', name: 'Wax Slap', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + waxBonus(c),
      tell: 'It hits you with the soft end of itself.',
      effect(c) { hitPlayer(c, 6 + waxBonus(c)); },
    },
    drip: {
      id: 'drip', name: 'Drip', intent: Intent.ATTACK_DEFEND, damage: 4, hits: 1, block: 5,
      damageFn: (c) => 4 + waxBonus(c),
      tell: 'It runs, and some of it lands on you.',
      effect(c) { c.block(c.self, 5); hitPlayer(c, 4 + waxBonus(c)); },
    },
    flare: {
      id: 'flare', name: 'Flare', intent: Intent.ATTACK_BIG, damage: 11, hits: 1,
      damageFn: (c) => 11 + waxBonus(c),
      tell: 'There is almost nothing left of it and all of that is on fire.',
      effect(c) { hitPlayer(c, 11 + waxBonus(c)); },
    },
    relight: {
      id: 'relight', name: 'Relight', intent: Intent.BUFF,
      tell: 'The puddle finds its own wick again.',
      effect(c) {
        c.heal(c.self, 8);
        setCnt(c, 'wax', 2);
        mem(c).relit = true;                 // the melt skips the turn it relights
        announceWax(c);
      },
    },
  },

  /** §3: Puddle Form cannot attack; at 1 Wax it Flares; otherwise Slap/Drip. */
  nextMove: (c) => {
    const w = cnt(c, 'wax');
    if (w <= 0) return 'relight';
    if (w === 1) return 'flare';
    return cyc(['wax-slap', 'drip'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.advanced.counters.wax = 2;
      h.advanced.flags.openWax = 2;
      h.notes.push('Haunt 4: in advanced formations it starts at 2 Wax and gets dangerous sooner.');
    }
    return h;
  },
};

function announceWax(c) {
  const w = cnt(c, 'wax');
  const TXT = [
    'Puddle Form: it cannot attack. Next turn it relights for 8 Courage and comes back at 2 Wax.',
    '1 Wax: Flare, and it takes 20% MORE damage. This is the window.',
    '2 Wax: no Guard any more, and its attacks deal 2 more.',
    '3 Wax: 5 Guard every turn, ordinary damage.',
  ];
  c.announceRule({
    id: `wax:${c.self.id}`,
    name: `Wax ${w} / 3`,
    text: TXT[Math.min(3, Math.max(0, w))],
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Lamp Moth — it turns an ALLY's stored threat into an immediate one (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Charge is not always something the player wants removed. Lamp Moth can
 * convert an ally's stored future threat into its own immediate threat. That
 * creates interesting target order problems." (§4.)
 *
 * So it is worthless alone, and §12 keeps it out of solo Scuffles.
 */
const stolen = (c) => 2 * cnt(c, 'stolen');
/** Any ally actually holding Charge this instant. Pure — safe from nextMove. */
const charged = (c) => allies(c).filter(a => isAlive(a) && (a.counters?.charge || 0) > 0);

export const lampMoth = {
  id: 'lamp-moth',
  name: 'Lamp Moth',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [27, 27],
  silhouette: 'lampmoth',
  palette: ['#efe6cf', '#b8a97e', '#2e2a1e'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.6,
  lore: 'A pale moth that will not settle, circling anything bright enough to be worth drinking.',

  onSpawn(c) { setCnt(c, 'stolen', 0); },

  moves: {
    'drink-the-flame': {
      id: 'drink-the-flame', name: 'Drink the Flame', intent: Intent.BUFF,
      tell: 'It finds the brightest thing in the room and starts on it.',
      effect(c) {
        const pool = charged(c);
        if (!pool.length) { c.block(c.self, 6); return; }
        let pick = pool[0];
        for (const a of pool) if ((a.counters.charge || 0) > (pick.counters.charge || 0)) pick = a;
        pick.counters.charge = Math.max(0, (pick.counters.charge || 0) - 1);
        addCnt(c, 'stolen', 1, flag(c, 'maxStolen', 3));
        c.announceRule({
          id: `moth:${c.self.id}`,
          name: `Stolen Light ${cnt(c, 'stolen')} / ${flag(c, 'maxStolen', 3)}`,
          text: `It drinks Charge off its friends. Every Stolen Light is 2 more damage on Wing Spark — `
            + `so removing that Charge yourself is not always what you want.`,
        });
      },
    },
    'wing-spark': {
      id: 'wing-spark', name: 'Wing Spark', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + stolen(c),
      tell: 'It beats its wings once and something jumps off them.',
      effect(c) { hitPlayer(c, 5 + stolen(c)); },
    },
    'dust-the-bulb': {
      id: 'dust-the-bulb', name: 'Dust the Bulb', intent: Intent.DEFEND,
      block: 4,
      tell: 'It powders something else with its wings.',
      effect(c) {
        c.block(c.self, 4);
        const friends = allies(c).filter(isAlive);
        if (friends.length) c.block(friends[c.rng.int(friends.length)], 5);
      },
    },
  },

  /** §4: drink if there is anything to drink, otherwise Spark / Dust / Spark. */
  nextMove: (c) => {
    if (charged(c).length) return 'drink-the-flame';
    return cyc(['wing-spark', 'dust-the-bulb', 'wing-spark'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.maxStolen = 4;
      h.notes.push('Haunt 5: it can hold 4 Stolen Light. The scaling stays 2 apiece.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. Spark Sprite — the region's Charge tutorial (§5)
// ═════════════════════════════════════════════════════════════════════════════
export const sparkSprite = {
  id: 'spark-sprite',
  name: 'Spark Sprite',
  region: REGION,
  tier: 'normal',
  role: 'charger',
  hp: [30, 30],
  silhouette: 'sprite',
  palette: ['#7fd4ff', '#d9f4ff', '#12304a'],
  shape: { body: 'floating', limbs: 2, eyes: 2 },
  scale: 0.5,
  lore: 'A bouncing handful of blue fire with small arms and eyes far too big for it.',

  onSpawn(c) { setCnt(c, 'charge', flag(c, 'openCharge', 0)); announceSpark(c); },

  onPlayerTurnStart(c) { mem(c).shedThisTurn = false; },

  /** §5: "If Spark Sprite loses at least 12 Courage during one player turn, remove 1 Charge." */
  onDamaged(c) { if (shedCharge(c, 'charge', 12)) announceSpark(c); },

  moves: {
    'gather-spark': {
      id: 'gather-spark', name: 'Gather Spark', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'It pulls something blue in out of the air.',
      effect(c) { c.block(c.self, 5); addCnt(c, 'charge', 1, 3); announceSpark(c); },
    },
    'static-nip': {
      id: 'static-nip', name: 'Static Nip', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'A small unpleasant snap.',
      effect(c) { hitPlayer(c, 6); },
    },
    discharge: {
      id: 'discharge', name: 'Discharge', intent: Intent.ATTACK_BIG, damage: 7, hits: 1,
      damageFn: (c) => 7 + 5 * cnt(c, 'charge'),
      tell: 'Everything it has been holding comes out at once.',
      effect(c) {
        const d = 7 + 5 * cnt(c, 'charge');
        setCnt(c, 'charge', 0);
        hitPlayer(c, d);
        announceSpark(c);
      },
    },
  },

  nextMove: (c) => cyc(['gather-spark', 'static-nip', 'gather-spark', 'discharge'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.counters.charge = 1;
      h.notes.push('Haunt 3: it opens advanced formations already holding 1 Charge.');
    }
    return h;
  },
};

function announceSpark(c) {
  const n = cnt(c, 'charge');
  c.announceRule({
    id: `spark:${c.self.id}`,
    name: `Charge ${n} / 3`,
    text: `Discharge is 7 damage plus 5 per Charge — ${7 + 5 * n} right now. Deal it 12 in one turn and it drops one. `
      + 'Not while the lights are out.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Gaslight Ghost — the window you choose to wait for (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player can attack whenever they want, but Lit creates the better
 * offensive window." (§6.) The whole enemy is one legible trade.
 */
export const gaslightGhost = {
  id: 'gaslight-ghost',
  name: 'Gaslight Ghost',
  region: REGION,
  tier: 'normal',
  role: 'state',
  hp: [36, 36],
  silhouette: 'gaslight',
  palette: ['#9fd8e8', '#e6f6fb', '#1c3038'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 0.95,
  lore: 'A person-shaped piece of gas flame. You can only make out its face when the light is right.',

  onSpawn(c) { setLit(c, true); },

  /** The half-damage allowance is PER PLAYER TURN. */
  onPlayerTurnStart(c) {
    c.self._dimUsed = 0;
    c.self._dimSpent = false;
    c.self._dimAllowance = flag(c, 'dimAllowance', 1);
    // §8: "Gaslight Ghost automatically becomes Dim" while the lights are out.
    if (isBlackout(c) && mem(c).lit) setLit(c, false);
  },

  moves: {
    brighten: {
      id: 'brighten', name: 'Brighten', intent: Intent.DEFEND, block: 5,
      tell: 'It turns itself up and you can see its face.',
      effect(c) { c.block(c.self, 5); setLit(c, true); },
    },
    'gas-burn': {
      id: 'gas-burn', name: 'Gas Burn', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + (mem(c).lit ? 2 : 0),
      tell: 'A long blue tongue of it.',
      effect(c) { hitPlayer(c, 9 + (mem(c).lit ? 2 : 0)); },
    },
    fade: {
      id: 'fade', name: 'Fade', intent: Intent.DEFEND_BUFF, block: 8,
      applies: [{ id: 'gaslit-dim', stacks: 1, to: 'self' }],
      tell: 'It turns itself down until there is almost nothing there.',
      effect(c) { c.block(c.self, 8); setLit(c, false); },
    },
    'cold-flame': {
      id: 'cold-flame', name: 'Cold Flame', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + (mem(c).lit ? 2 : 0),
      tell: 'It burns without any warmth in it at all.',
      effect(c) { hitPlayer(c, 6 + (mem(c).lit ? 2 : 0)); },
    },
  },

  nextMove: (c) => cyc(['brighten', 'gas-burn', 'fade', 'cold-flame'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.dimAllowance = 2;
      h.notes.push('Haunt 6: Dim halves the first TWO Attack Tricks each turn, not one.');
    }
    return h;
  },
};

function setLit(c, lit) {
  mem(c).lit = lit;
  if (lit) c.removeStatus(c.self, 'gaslit-dim');
  else c.applyStatus(c.self, 'gaslit-dim', 1, { fresh: true });
  c.announceRule({
    id: `gas:${c.self.id}`,
    name: lit ? 'Lit' : 'Dim',
    text: lit
      ? 'You can see it. Full damage — and its own attacks deal 2 more.'
      : `Hard to see. The first Attack Trick aimed at it each turn deals HALF. Its attacks are ordinary.`,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Candle Cluster — keep it small, or let it become a burst (§7)
// ═════════════════════════════════════════════════════════════════════════════
export const candleCluster = {
  id: 'candle-cluster',
  name: 'Candle Cluster',
  region: REGION,
  tier: 'normal',
  role: 'grower',
  hp: [40, 40],
  silhouette: 'candles',
  palette: ['#f2e2b8', '#d09a4a', '#33260f'],
  shape: { body: 'squat', limbs: 0, eyes: 7 },
  scale: 0.8,
  lore: 'Seven candles melted into one crawling thing. The flames do not agree with each other.',

  onSpawn(c) { setCnt(c, 'flames', 3); announceCandles(c); },

  onPlayerTurnStart(c) { mem(c).shedThisTurn = false; },

  /** §7: "at least 10 total damage during one player turn: lose 1 Flame. Minimum 1." */
  onDamaged(c) {
    if (isBlackout(c) || mem(c).shedThisTurn) return;
    if (dmgTaken(c) < 10 || cnt(c, 'flames') <= 1) return;
    mem(c).shedThisTurn = true;
    addCnt(c, 'flames', -1, 9, 1);
    announceCandles(c);
  },

  moves: {
    'relight-another': {
      id: 'relight-another', name: 'Relight Another', intent: Intent.DEFEND_BUFF, block: 4,
      tell: 'One of the dead ones catches again.',
      effect(c) {
        c.block(c.self, 4);
        addCnt(c, 'flames', 1, flag(c, 'maxFlames', 5), 1);
        announceCandles(c);
      },
    },
    'hot-wax': {
      id: 'hot-wax', name: 'Hot Wax', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + cnt(c, 'flames'),
      tell: 'It leans over you.',
      effect(c) { hitPlayer(c, 5 + cnt(c, 'flames')); },
    },
    'many-little-fires': {
      id: 'many-little-fires', name: 'Many Little Fires', intent: Intent.ATTACK, damage: 2, hits: 3,
      hitsFn: (c) => Math.max(1, Math.min(flag(c, 'maxFlames', 5), cnt(c, 'flames'))),
      tell: 'All of them at once, one after another.',
      effect(c) {
        hitPlayer(c, 2, Math.max(1, Math.min(flag(c, 'maxFlames', 5), cnt(c, 'flames'))));
      },
    },
  },

  nextMove: (c) => cyc(['relight-another', 'hot-wax', 'many-little-fires'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.maxFlames = 6;
      h.notes.push('Haunt 7: it can reach 6 Flames, so Many Little Fires hits six times.');
    }
    return h;
  },
};

function announceCandles(c) {
  const n = cnt(c, 'flames');
  c.announceRule({
    id: `candles:${c.self.id}`,
    name: `Flames ${n} / ${flag(c, 'maxFlames', 5)}`,
    text: `Every Flame is 1 more on Hot Wax and one more hit on Many Little Fires. `
      + 'Deal it 10 in one turn and one goes out — never the last one.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Blackout Blob — it does not hurt you, it makes everything else worse (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Blackout Blob does not directly deal huge damage. It makes the rest of the
 * encounter harder to control." (§8.)
 */
export const blackoutBlob = {
  id: 'blackout-blob',
  name: 'Blackout Blob',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [35, 35],
  silhouette: 'blackout',
  palette: ['#0e0d12', '#31303a', '#050506'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 0.9,
  lore: 'A patch of dark that has got out of a broken lantern and is going somewhere.',

  /**
   * §8: Blackout "lasts until the beginning of Blackout Blob's next turn" —
   * Haunt 8 extends that to the END of its next turn, which buys the enemy team
   * one full extra Blackout action.
   */
  onTurnStart(c) {
    if (field(c).blackoutUntil === 'start' && field(c).blackout) bringUpTheLights(c);
  },
  onTurnEnd(c) {
    if (field(c).blackoutUntil === 'end' && field(c).blackout && mem(c).litFor) {
      bringUpTheLights(c);
      mem(c).litFor = false;
    } else if (field(c).blackout) {
      mem(c).litFor = true;
    }
  },

  onDeath(c) { bringUpTheLights(c); },

  moves: {
    'kill-the-lights': {
      id: 'kill-the-lights', name: 'Kill the Lights', intent: Intent.STRONG_DEBUFF,
      /* Declared, or Unlit lands on the whole board with no warning — and
         "everything here gains 2 more Guard" is exactly the kind of thing a
         player has to be able to see coming. */
      applies: [{ id: 'unlit', stacks: 1, to: 'allies' }],
      tell: 'It reaches the nearest lamp.',
      effect(c) {
        killTheLights(c, flag(c, 'longDark', false) ? 'end' : 'start');
        mem(c).litFor = false;
      },
    },
    'dark-bump': {
      id: 'dark-bump', name: 'Dark Bump', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'Something you cannot see walks into you.',
      effect(c) { hitPlayer(c, 7); },
    },
    'swallow-the-glow': {
      id: 'swallow-the-glow', name: 'Swallow the Glow', intent: Intent.DEFEND, block: 10,
      tell: 'It eats the light off something.',
      effect(c) {
        /* §8: "remove 1 beneficial temporary player battlefield effect IF SUCH
           EFFECTS EXIST. Otherwise gain 10 Guard." The section is explicit that
           it "cannot remove Companion core resources", and the player's own
           buffs are not a battlefield layer this file may safely reach into —
           so the honest reading of "if such effects exist" is that here they do
           not, and it takes the Guard. */
        c.block(c.self, 10);
      },
    },
  },

  nextMove: (c) => cyc(['kill-the-lights', 'dark-bump', 'swallow-the-glow', 'dark-bump'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.longDark = true;
      h.notes.push('Haunt 8: Blackout lasts until the END of its next turn — one whole extra dark action.');
    }
    return h;
  },
};

export const LAMPWORKS_ENEMIES = [
  waxling, lampMoth, sparkSprite, gaslightGhost, candleCluster, blackoutBlob,
];
export const LAMPWORKS_REGION = REGION;
