/**
 * The Keeper — the Heart of the House, and the end of the game. OWNER: enemies.
 * Source of truth: docs/design/regions/17-heart.md §30–§57.
 *
 * "The Keeper is not a separate villain secretly controlling the house. The
 * Keeper is the house trying to speak in a shape the Kids can understand."
 *
 * Its belief is the culmination of every region: outside, things get lost, so
 * keep them here forever. §31 is careful that the error is NOT "the outside
 * world is safe" — it obviously is not. The error is that eliminating risk
 * matters more than preserving freedom. Nothing in this fight should read as
 * defeating a monster; it reads as talking somebody out of a locked door.
 *
 * ── THREE PHASES, AND EACH ONE IS A DIFFERENT ARGUMENT ──────────────────────
 *
 *   1  540 → 351.  Four Sanctuary Locks, each a real body with 24 Integrity.
 *                  Every one you break hands you something and frightens it:
 *                  Panic, +1 attack damage a stack. You choose WHEN to take on
 *                  that aggression, never whether. At 350 the rest snap on
 *                  their own and phase two always opens at 4 Panic.
 *   2  350 → 161.  Four House Arguments cycle, one live per player turn. Each
 *                  one GIVES you something and takes something. You reject one
 *                  by demonstrating agency — any two of four Independence
 *                  conditions in a turn — and a rejected Argument never returns,
 *                  which makes the survivors come round more often.
 *   3  160 → 0.    Nothing clever. Open Heart, no healing, and a boss that has
 *                  stopped building a system and is just holding a door shut.
 *
 * ── WHAT MAKES THIS FIGHT DIFFERENT TO WRITE ────────────────────────────────
 *
 * Half of the Keeper's moves are kind. Let Me Help really does improve the
 * Argument's gift. I Can Fix This heals it and the offer is genuine. If any of
 * that reads as a trap the fight has failed, because the player is supposed to
 * be able to see exactly why staying would be easier.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, played, phaseAt,
  hitPlayer, hauntBase, bossDmg, flag, isAlive,
} from '../enemies/_lib.js';
import { costRule, clearCostRule } from '../enemies/heart.js';

const REGION = 'heart';

/** Authored pool and thresholds, before the party curve and the Haunt ladder. */
const SOLO_MAX = 540;
const PHASE_TWO_AT = 350;
const PHASE_THREE_AT = 160;

/** Every Keeper attack reads this. Panic is +1 per stack, `bossDmg` is the ladder. */
function punch(c) { return cnt(c, 'panic') + bossDmg(c); }

/* ══ phase one — the four Sanctuary Locks (§32–§38) ══════════════════════════
 *
 * Real bodies rather than counters, because §32's whole premise is that the
 * player may attack EITHER the Keeper or a Lock, and that is not a choice if a
 * Lock is a number on the boss. 24 Integrity each, no attacks of their own:
 * a Lock is a rule with Courage, exactly like Perfect Sanctuary's Systems.
 *
 * `onDeath` is where the trade happens — the player's benefit, and the Panic.
 * Both halves are on the LOCK rather than on the Keeper so that a Lock which
 * broke on its own at the phase transition can withhold the benefit, which is
 * §38's rule: "The player does not receive the Lock breaking benefit for Locks
 * they did not personally destroy."
 */
function lock({ id, name, palette, lore, rule, benefit, install, onBreak }) {
  return {
    /* `role: 'bossPart'` is what `scenes/combat.css` sizes escorts by — the
       Favorite Doll uses it — so a Lock comes out explicitly smaller than the
       boss on both axes with no rule of its own. A screenshot of this fight
       showed four Locks and no Keeper, because five full-size bodies do not
       fit the row. The LOGIC flag is separate: `bossPart` is a presentation
       role, and two different questions must not share one field. */
    id, name, region: REGION, tier: 'boss', role: 'bossPart', lock: true,
    hp: [24, 24],
    silhouette: 'lock',
    palette,
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.7,
    summonOnly: true,
    lore,

    /* NO RULE CARD OF ITS OWN. Four Locks each announcing one, plus the
       Keeper's, put FIVE House Rule cards down the left of the screen and
       buried the Companion portrait under them — found in a screenshot, not by
       any suite, because nothing measures how much of the screen a rule strip
       eats. The Keeper prints ONE card listing whichever Locks are standing;
       the Lock's own name and Courage bar are on the Lock itself. */
    onSpawn(c) { if (install) install(c); },

    onDeath(c) {
      const boss = allies(c).find(a => isAlive(a) && a.defId === 'keeper');
      if (boss) {
        const before = boss.counters?.panic || 0;
        if (boss.counters) boss.counters.panic = Math.min(4, before + 1);
        c.say(`${c.self.name} breaks. It does not like that.`, 'warn');
      }
      // Withheld when the transition snapped it rather than the player (§38).
      if (mem(c).auto) return;
      if (onBreak) onBreak(c);
    },

    moves: {
      hold: {
        id: 'hold', name: 'Hold', intent: Intent.DEFEND, block: 3,
        tell: 'It holds. That is the entire job.',
        effect(c) { c.block(c.self, 3); },
      },
    },
    nextMove: () => 'hold',
    hauntScaling(level) {
      const h = hauntBase(level, 'boss');
      if (level >= 10 && (id === 'shelter-lock' || id === 'routine-lock')) {
        h.notes.push('Haunt 10: this Lock carries 5 additional Integrity.');
      }
      return h;
    },
  };
}

export const shelterLock = lock({
  id: 'shelter-lock', name: 'Shelter Lock',
  palette: ['#b9c4cc', '#7c8a94', '#374149'],
  lore: 'A brass bolt the size of a child, driven through a door frame that is part of the Keeper.',
  rule: 'While it holds, the Keeper gains 7 Guard at the start of its turn.',
  benefit: 'gain 8 Guard now and 4 more at the start of your next turn.',
  onBreak(c) {
    c.block(c.player, 8);
    c.applyStatus(c.player, 'i-can-protect-myself', 1);
    c.say('I can protect myself.', 'good');
  },
});

export const routineLock = lock({
  id: 'routine-lock', name: 'Routine Lock',
  palette: ['#c6bcd2', '#8a7fa0', '#3f3750'],
  lore: 'A clock face with the hands welded in place, set into the Keeper’s shoulder.',
  rule: "While it holds, your fourth Trick each turn costs 1 additional Nerve.",
  benefit: 'your next two Tricks this turn cost 1 less.',
  install(c) {
    // No `text`: `costRule` only announces when it is given one, and this rule
    // is already printed on the Keeper's single Sanctuary Locks card. A second
    // card repeating the same sentence is the strip-clutter problem again.
    costRule(c, { id: 'routine-lock', name: 'Routine Lock', steps: [[4, 1]] });
  },
  onBreak(c) {
    c.applyStatus(c.player, 'i-choose-what-i-do', 2);
    c.say('I choose what I do.', 'good');
  },
});

export const observationLock = lock({
  id: 'observation-lock', name: 'Observation Lock',
  palette: ['#cbd8c4', '#8ba081', '#3f4a39'],
  lore: 'A window with no curtain, and nothing on the other side of it but more of the Keeper.',
  rule: 'While it holds, playing 3 Tricks of one type in a turn gives the Keeper 7 Guard. Once each turn.',
  benefit: 'draw 2 Tricks.',
  onBreak(c) { c.playerDraw(2); c.say("You don't know everything.", 'good'); },
});

export const returnLock = lock({
  id: 'return-lock', name: 'Return Lock',
  palette: ['#d8ccb4', '#a3906c', '#4b4132'],
  lore: 'A doormat, nailed down. Every route in this house eventually crosses it.',
  rule: 'While it holds, ending your turn with unspent Nerve gives the Keeper 5 Guard.',
  benefit: 'gain 1 Nerve next turn.',
  onBreak(c) { c.applyStatus(c.player, 'i-know-where-im-going', 1); c.say("I know where I'm going.", 'good'); },
});

/** The player-side statuses the Locks hand over. Registered with HEART_STATUSES. */
export const KEEPER_STATUSES = [
  {
    id: 'i-can-protect-myself', name: 'I Can Protect Myself', kind: 'buff', icon: 'guard-self',
    desc: 'Gain 4 Guard at the start of your next turn.',
    decay: 'turnStart', stacks: false, max: 1,
    hooks: { onTurnStart: (ctx) => { ctx.block(ctx.actor, 4); ctx.remove(); } },
  },
  {
    id: 'i-choose-what-i-do', name: 'I Choose What I Do', kind: 'buff', icon: 'free-hand',
    desc: 'Your next {n} Tricks cost 1 less Nerve.',
    decay: 'turnEnd', stacks: true,
    hooks: {
      modifyCardCost: (cost, h) => ((h.stacks || 0) > 0 ? Math.max(0, cost - 1) : cost),
      onCardPlayed: (ctx) => ctx.consume(1),
    },
  },
  {
    id: 'i-know-where-im-going', name: "I Know Where I'm Going", kind: 'buff', icon: 'compass',
    desc: 'Gain 1 Nerve at the start of your next turn.',
    decay: 'turnStart', stacks: false, max: 1,
    energyDelta: 1,
  },
];

/* ══ phase two — the four House Arguments (§42–§51) ══════════════════════════
 *
 * "Each Argument gives the player something beneficial. Each also imposes
 * control. This is intentional." (§42.)
 *
 * `gift` runs at the start of the player turn; `control` is a cost rule or a
 * turn-end clause. `boosted` is what Let Me Help improves — the GIFT only, never
 * the control, which is §50's exact wording: "Its control cost remains
 * unchanged. The offer becomes more tempting."
 */
const ARGUMENTS = [
  {
    id: 'safety', name: 'Safety',
    line: 'You need me to keep you safe.',
    text: 'Gain {g} Guard at the start of your turn. Your first Attack this turn deals 4 less damage.',
    gift(c, boosted) { c.block(c.player, boosted ? 7 : 5); c.applyStatus(c.player, 'held-back', 1); },
    guard: [5, 7],
  },
  {
    id: 'comfort', name: 'Comfort',
    line: 'You are better off here.',
    text: 'Recover {g} Courage at the start of your turn. Your third Trick costs 1 more Nerve.',
    gift(c, boosted) {
      c.heal(c.player, boosted ? 3 : 2);
      costRule(c, {
        id: 'comfort', name: 'Comfort',
        text: 'Your third Trick this turn costs 1 additional Nerve.',
        steps: [[3, 1]],
      });
    },
    guard: [2, 3],
  },
  {
    id: 'routine', name: 'Routine',
    line: 'Everything works when you follow the routine.',
    text: 'Your first {g} Tricks cost 1 less Nerve. Your fifth costs 1 more.',
    gift(c, boosted) {
      costRule(c, {
        id: 'routine-arg', name: 'Routine',
        text: boosted
          ? 'Your first two Tricks cost 1 less Nerve. Your fifth costs 1 more.'
          : 'Your first Trick costs 1 less Nerve. Your fifth costs 1 more.',
        steps: boosted ? [[1, -1], [2, -1], [5, 1]] : [[1, -1], [5, 1]],
      });
    },
    guard: [1, 2],
  },
  {
    id: 'belonging', name: 'Belonging',
    line: 'Everything you need is already here.',
    text: 'Draw {g} additional Trick at the start of your turn. End the turn holding 2 or more and the Keeper gains 8 Guard.',
    gift(c, boosted) { c.playerDraw(boosted ? 2 : 1); },
    guard: [1, 2],
    endTurn(c) {
      const hand = c.cardsIn ? c.cardsIn('hand') : [];
      if (hand.length >= 2) { c.block(c.self, 8); c.say('Everything you need is already here.', 'warn'); }
    },
  },
];

/** The four Independence conditions (§47). Two in one turn rejects the Argument. */
function independence(c) {
  const met = [];
  if (played(c).length >= 4) met.push('Act');
  if ((mem(c).guardGained || 0) >= 12) met.push('Stand');
  if ((c.self.damageTakenThisTurn || 0) >= 18) met.push('Push');
  if (((c.player && c.player.energy) || 0) === 0) met.push('Choose');
  return met;
}

function liveArguments(c) {
  const rejected = mem(c).rejected || [];
  return ARGUMENTS.filter(a => !rejected.includes(a.id));
}
function currentArgument(c) {
  const live = liveArguments(c);
  if (!live.length) return null;
  return live[(mem(c).argAt || 0) % live.length];
}

function announceKeeper(c) {
  const m = mem(c);
  if (m.phase === 1) {
    const standing = locks(c).map(l => `${l.name} — ${LOCK_RULES[l.defId] || ''}`);
    c.announceRule({
      id: `keeper:${c.self.id}`, name: `Sanctuary Locks · Panic ${cnt(c, 'panic')}`,
      text: `${standing.join('. ')}${standing.length ? '. ' : ''}`
        + 'Break one and it hands you something and frightens the Keeper: each Panic is 1 more attack damage. At 350 Courage the rest snap on their own, with no benefit to you.',
    });
    return;
  }
  if (m.phase === 2) {
    const live = liveArguments(c);
    const cur = currentArgument(c);
    const names = live.map(a => `${cur && a.id === cur.id ? '▸ ' : ''}${a.name}`).join(' · ');
    c.announceRule({
      id: `keeper:${c.self.id}`, name: `House Arguments · Panic ${cnt(c, 'panic')}`,
      text: names
        ? `${names}. ${cur ? cur.line + ' ' : ''}Satisfy two of Act (4 Tricks), Stand (12 Guard), Push (18 damage to the Keeper) or Choose (spend all Nerve) in one turn to reject the live Argument for good.`
        : 'Every Argument has been rejected.',
    });
    return;
  }
  c.announceRule({
    id: `keeper:${c.self.id}`, name: 'Open Heart',
    text: 'It takes 15% more damage and can no longer recover Courage. Deal 25 damage in a turn and the Heart cracks for 5 more.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// The Keeper
// ═════════════════════════════════════════════════════════════════════════════
export const keeper = {
  id: 'keeper',
  name: 'The Keeper',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'keeper',
  palette: ['#e8dcc8', '#9c7f56', '#2f3a4a'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.9,
  lore: 'Warm wooden doors, blankets, brass keys and window glass in the shape of a very large animal. Its face is almost friendly. Small doors in its body open onto rooms you have already walked through.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.rejected = [];
    m.argAt = 0;
    m.fixes = 0;
    setCnt(c, 'panic', flag(c, 'startPanic', 0));
    for (const id of ['shelter-lock', 'routine-lock', 'observation-lock', 'return-lock']) {
      c.summon(id, {});
    }
    announceKeeper(c);
  },

  onTurnStart(c) {
    if (mem(c).phase === 1 && locks(c).some(l => l.defId === 'shelter-lock')) c.block(c.self, 7);
  },

  onPlayerTurnStart(c) {
    const m = mem(c);
    m.guardGained = 0;
    m.hpAtTurnStart = c.self.hp;
    m.observationUsed = false;
    if (m.phase !== 2) return;
    const arg = currentArgument(c);
    if (!arg) return;
    arg.gift(c, m.boosted === arg.id);
    m.boosted = null;
    announceKeeper(c);
  },

  /** A Lock broke: rewrite the one rule card so it lists what is left. */
  onAllyDeath(c) { if (mem(c).phase === 1) announceKeeper(c); },

  /** Guard the player raised, for Stand — nothing else records it per turn. */
  onBoardEvent(c, ev) {
    const e = ev || c.boardEvent || {};
    if (e.type === 'block' && e.actor && e.actor.side === 'player') {
      mem(c).guardGained = (mem(c).guardGained || 0) + (e.amount || 0);
    }
  },

  /** Observation Lock: 3 Tricks of one type in a turn, once per turn (§35). */
  onCardPlayed(c) {
    const m = mem(c);
    if (m.phase !== 1 || m.observationUsed) return;
    if (!locks(c).some(l => l.defId === 'observation-lock')) return;
    const counts = {};
    for (const p of (c.cardsPlayedThisTurn || [])) counts[p.type] = (counts[p.type] || 0) + 1;
    if (Object.values(counts).some(n => n >= 3)) {
      m.observationUsed = true;
      c.block(c.self, 7);
      c.say('It is watching what you do.', 'warn');
    }
  },

  onPlayerTurnEnd(c) {
    const m = mem(c);

    // Return Lock: ending the turn with Nerve to spare (§36).
    if (m.phase === 1 && locks(c).some(l => l.defId === 'return-lock')
        && ((c.player && c.player.energy) || 0) > 0) {
      c.block(c.self, 5);
    }

    if (m.phase === 2) {
      const arg = currentArgument(c);
      if (arg && arg.endTurn) arg.endTurn(c);
      // Rejection: two different Independence conditions in one turn (§47).
      const met = independence(c);
      if (arg && met.length >= 2) {
        m.rejected = [...(m.rejected || []), arg.id];
        c.loseHp(c.self, 7);
        clearCostRule(c, 'comfort');
        clearCostRule(c, 'routine-arg');
        c.say(`${met.slice(0, 2).join(' and ')}. ${arg.name} is rejected.`, 'good');
        if (m.rejected.length >= ARGUMENTS.length) {
          c.applyStatus(c.self, 'uncertain', 1);
          m.uncertain = true;
          c.say('It has run out of arguments.', 'good');
        }
      } else if (liveArguments(c).length) {
        m.argAt = ((m.argAt || 0) + 1) % liveArguments(c).length;
      }
      announceKeeper(c);
    }

    if (m.phase === 3) {
      // Open Heart: 25 damage in a turn cracks it for 5 more (§54).
      const lost = (m.hpAtTurnStart == null ? c.self.hp : m.hpAtTurnStart) - c.self.hp;
      if (lost >= 25) { c.loseHp(c.self, 5); c.say('The Heart cracks.', 'good'); }
    }
    m.hpAtTurnStart = c.self.hp;
  },

  /** Open Heart and Uncertain both forbid recovery, so healing is refused here. */
  onDamaged(c) {
    const m = mem(c);
    if (m.phase !== 3) return;
    if (!c.has('open-heart', c.self)) c.applyStatus(c.self, 'open-heart', 1);
  },

  moves: {
    /* ── phase one (§39) ─────────────────────────────────────────────────── */
    'close-the-door': {
      id: 'close-the-door', name: 'Close the Door', intent: Intent.ATTACK, damage: 13, hits: 1,
      damageFn: (c) => 13 + punch(c),
      tell: 'It closes something you had not noticed was open.',
      effect(c) { hitPlayer(c, 13 + punch(c)); },
    },
    'put-you-somewhere-safe': {
      id: 'put-you-somewhere-safe', name: 'Put You Somewhere Safe', intent: Intent.DEFEND, block: 14,
      tell: 'It reinforces itself, and then the nearest Lock.',
      effect(c) {
        c.block(c.self, 14);
        const l = locks(c)[0];
        if (l) c.block(l, 7);
      },
    },
    'stay-where-i-can-see-you': {
      id: 'stay-where-i-can-see-you', name: 'Stay Where I Can See You',
      intent: Intent.ATTACK, damage: 7, hits: 2,
      damageFn: (c) => 7 + punch(c) + (locks(c).some(l => l.defId === 'observation-lock') ? 3 : 0),
      tell: 'Two windows in its body turn to follow you.',
      /**
       * §39 gives the second hit the +3. An intent is `damage × hits` and
       * cannot say "7 then 10", so BOTH hits carry it and the intent tells the
       * truth about the total. Same call the Kitchens made for the Whisk, and
       * for the same reason: the promise beats the nicety.
       */
      effect(c) {
        const extra = locks(c).some(l => l.defId === 'observation-lock') ? 3 : 0;
        hitPlayer(c, 7 + punch(c) + extra, 2);
      },
    },
    'everything-is-ready-for-you': {
      id: 'everything-is-ready-for-you', name: 'Everything Is Ready for You',
      intent: Intent.DEFEND, block: 9,
      blockFn: (c) => 9 + (locks(c).some(l => l.defId === 'shelter-lock') ? 5 : 0),
      tell: 'Somewhere inside it, a bed is turned down.',
      effect(c) { c.block(c.self, 9 + (locks(c).some(l => l.defId === 'shelter-lock') ? 5 : 0)); },
    },
    'come-back': {
      id: 'come-back', name: 'Come Back', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + punch(c),
      tell: 'It says your name the way somebody says it from a doorway.',
      effect(c) {
        hitPlayer(c, 10 + punch(c));
        if (locks(c).some(l => l.defId === 'return-lock')) {
          costRule(c, {
            id: 'come-back', name: 'Come Back',
            text: 'Your first Trick next turn costs 1 additional Nerve. Your second costs 1 less.',
            steps: [[1, 1], [2, -1]],
          });
        }
      },
    },

    /* ── the two turns (§41, §52) ────────────────────────────────────────── */
    'i-remember-every-one-of-them': {
      id: 'i-remember-every-one-of-them', name: 'I Remember Every One of Them',
      intent: Intent.BUFF,
      tell: 'Every small door in its body opens at once, onto somewhere different.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        m.argAt = 0;
        // "All remaining Locks break automatically. The Keeper gains 1 Panic for
        // each. The player does not receive the benefit." (§38.)
        for (const l of locks(c)) { (l.mem ||= {}).auto = true; c.despawn(l); }
        setCnt(c, 'panic', 4);
        clearCostRule(c, 'routine-lock');
        clearCostRule(c, 'come-back');
        c.say('It remembers every one of them.', 'warn');
        announceKeeper(c);
      },
    },
    'please-dont-go': {
      id: 'please-dont-go', name: "Please Don't Go", intent: Intent.BUFF,
      applies: [{ id: 'open-heart', stacks: 1, to: 'self' }],
      tell: 'The Heart Chamber starts coming apart, and doors open all over the mansion.',
      effect(c) {
        const m = mem(c);
        m.phase = 3;
        m.rejected = ARGUMENTS.map(a => a.id);
        clearCostRule(c, 'comfort');
        clearCostRule(c, 'routine-arg');
        c.removeStatus(c.self, 'uncertain');
        c.applyStatus(c.self, 'open-heart', 1);
        c.say("Please don't go.", 'warn');
        announceKeeper(c);
      },
    },

    /* ── phase two (§50) ─────────────────────────────────────────────────── */
    'hold-on': {
      id: 'hold-on', name: 'Hold On', intent: Intent.ATTACK, damage: 15, hits: 1,
      damageFn: (c) => 15 + punch(c),
      tell: 'It takes hold of the door frame with both hands.',
      effect(c) { hitPlayer(c, 15 + punch(c)); },
    },
    'i-know-what-happens-outside': {
      id: 'i-know-what-happens-outside', name: 'I Know What Happens Outside',
      intent: Intent.ATTACK, damage: 6, hits: 3,
      damageFn: (c) => 6 + punch(c),
      tell: 'It shows you three of them, quickly, and none of them end well.',
      effect(c) { hitPlayer(c, 6 + punch(c), 3); },
    },
    'let-me-help': {
      id: 'let-me-help', name: 'Let Me Help', intent: Intent.DEFEND, block: 15,
      tell: 'It makes the offer better. It is not pretending.',
      effect(c) {
        c.block(c.self, 15);
        const arg = currentArgument(c);
        if (arg) { mem(c).boosted = arg.id; c.say(`${arg.name} will be more generous next turn.`, 'warn'); }
      },
    },
    'you-always-come-back': {
      id: 'you-always-come-back', name: 'You Always Come Back',
      intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + punch(c),
      tell: 'It picks something you have already used back up and shows it to you.',
      effect(c) {
        hitPlayer(c, 11 + punch(c));
        const pile = c.cardsIn ? c.cardsIn('discard') : [];
        const card = pile.length ? pile[pile.length - 1] : null;
        if (card) { c.moveCardTo(card.uid, 'draw', { top: true }); c.say(`${card.name} comes back.`, 'warn'); }
      },
    },
    'i-can-fix-this': {
      // Intent.BUFF: schema.js has no HEAL, and a healing boss reads as a buff
      // to a player deciding whether to race it.
      id: 'i-can-fix-this', name: 'I Can Fix This', intent: Intent.BUFF, block: 8,
      tell: 'It repairs itself, carefully, the way it repairs everything.',
      effect(c) { c.heal(c.self, 8); c.block(c.self, 8); mem(c).fixes = (mem(c).fixes || 0) + 1; },
    },
    'but-what-if-something-happens': {
      id: 'but-what-if-something-happens', name: 'But What If Something Happens?',
      intent: Intent.DEFEND, block: 10,
      tell: 'It stops arguing and asks a question instead.',
      effect(c) { c.block(c.self, 10); mem(c).uncertain = false; c.removeStatus(c.self, 'uncertain'); },
    },

    /* ── phase three (§55) ───────────────────────────────────────────────── */
    'hold-the-door': {
      id: 'hold-the-door', name: 'Hold the Door', intent: Intent.ATTACK_DEFEND,
      damage: 8, hits: 1, block: 16,
      damageFn: (c) => 8 + punch(c),
      tell: 'It puts its whole weight against it.',
      effect(c) { c.block(c.self, 16); hitPlayer(c, 8 + punch(c)); },
    },
    'dont-leave': {
      id: 'dont-leave', name: "Don't Leave", intent: Intent.ATTACK, damage: 17, hits: 1,
      damageFn: (c) => 17 + punch(c),
      tell: 'There is nothing clever left in it.',
      effect(c) { hitPlayer(c, 17 + punch(c)); },
    },
    'every-door-closes': {
      id: 'every-door-closes', name: 'Every Door Closes', intent: Intent.ATTACK, damage: 6, hits: 3,
      damageFn: (c) => 6 + punch(c),
      tell: 'Three of the small doors in its body shut, one after another.',
      effect(c) { hitPlayer(c, 6 + punch(c), 3); },
    },
    'i-kept-you-safe': {
      id: 'i-kept-you-safe', name: 'I Kept You Safe', intent: Intent.ATTACK_DEFEND,
      damage: 12, hits: 1, block: 10,
      damageFn: (c) => 12 + punch(c),
      tell: 'It says it like it is the only thing it has ever done.',
      effect(c) { c.block(c.self, 10); hitPlayer(c, 12 + punch(c)); },
    },
    please: {
      id: 'please', name: 'Please', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + punch(c),
      tell: 'It stops asking you to stay and just says please.',
      effect(c) { hitPlayer(c, 8 + punch(c)); c.loseHp(c.self, 4); },
    },
  },

  /**
   * PURE. Phase is written by the two transition moves, never here — this only
   * reads Courage to decide whether the transition move is next, which is the
   * same shape the Confectioner uses.
   */
  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    const three = phaseAt(c, PHASE_THREE_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'i-remember-every-one-of-them';
    if ((m.phase || 1) === 2 && c.self.hp <= three) return 'please-dont-go';

    if (m.phase === 3) {
      const seq = ['hold-the-door', 'dont-leave', 'every-door-closes', 'i-kept-you-safe', 'please'];
      const pick = cyc(seq, (c.history || []).length);
      // "At 80 Courage or less: replace every second defensive move with Please."
      const low = c.self.hp <= phaseAt(c, 80, SOLO_MAX);
      if (low && (pick === 'hold-the-door' || pick === 'i-kept-you-safe')
          && (c.history || []).length % 2 === 1) return 'please';
      return pick;
    }

    if (m.phase === 2) {
      if (m.uncertain) return 'but-what-if-something-happens';
      const seq = ['hold-on', 'let-me-help', 'i-know-what-happens-outside', 'you-always-come-back', 'i-can-fix-this'];
      const pick = cyc(seq, (c.history || []).length);
      // "Can occur at most twice during phase two." (§50.)
      if (pick === 'i-can-fix-this' && (m.fixes || 0) >= 2) return 'hold-on';
      return pick;
    }

    return cyc(['close-the-door', 'put-you-somewhere-safe', 'stay-where-i-can-see-you',
      'everything-is-ready-for-you', 'come-back'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.startPanic = 1;
      h.counters.panic = 1;
      h.notes.push('Haunt 10: it begins at 1 Panic, and the Shelter and Routine Locks carry 5 more Integrity. Phase one still caps at 4.');
    }
    return h;
  },
};

function locks(c) { return allies(c).filter(a => isAlive(a) && a.def?.lock); }

/** The one-line rule each Lock enforces, for the Keeper's single rule card. */
const LOCK_RULES = {
  'shelter-lock': 'the Keeper gains 7 Guard each turn',
  'routine-lock': 'your fourth Trick costs 1 more Nerve',
  'observation-lock': '3 Tricks of one type gives it 7 Guard',
  'return-lock': 'unspent Nerve gives it 5 Guard',
};

export const HEART_BOSSES = [keeper, shelterLock, routineLock, observationLock, returnLock];
