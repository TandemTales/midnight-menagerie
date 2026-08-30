/**
 * The Mansion Graveyard — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/06-graveyard.md §13–§15.
 *
 *   The Mourning Angel    prepare, endure, punish. Damage while it is Still
 *                         powers the swing that ends the cycle.
 *   The Epitaph Choir     four timelines, all visible, and the only question is
 *                         which one you erase first.
 *   The Mausoleum Mouth   one long clock you can push backwards with offence.
 *
 * All three are §2's region identity at Big Scare size: nothing is hidden and
 * the difficulty is that several announced futures overlap.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, isAlive, dmgTaken,
} from './_lib.js';
import { countdown, countdownHit, forget } from './graveyard.js';

const REGION = 'graveyard';

/* ══ Big Scare 1 — the Mourning Angel (§13) ══════════════════════════════════ */
export const mourningAngel = {
  id: 'mourning-angel',
  name: 'The Mourning Angel',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [127, 127],
  silhouette: 'angel',
  palette: ['#b6b2a8', '#e4e0d6', '#3c3933'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.45,
  lore: 'A stone angel beside an empty grave, hands over its face. It does not move while you are watching it.',

  onSpawn(c) { mem(c).still = true; announceAngel(c); },

  onTurnStart(c) { if (mem(c).still) c.block(c.self, 8); },

  /**
   * "For every 10 Courage lost while Still: gain 1 Grief." Measured at the end
   * of the PLAYER turn from `damageTakenThisTurn`, so the Grief the player just
   * bought is on the plate before they decide what to do next — and before the
   * intent for Grief Unbound is drawn.
   */
  onPlayerTurnEnd(c) {
    if (!mem(c).still) return;
    const banked = (mem(c).lost = (mem(c).lost || 0) + dmgTaken(c));
    const want = Math.min(5, Math.floor(banked / 10));
    if (want > cnt(c, 'grief')) setCnt(c, 'grief', want);
    announceAngel(c);
  },

  /** The vulnerability window: the player turn right after Grief Unbound. */
  damageTakenMul(c) { return mem(c).exposed ? 1.25 : 1; },

  moves: {
    'silent-vigil': {
      id: 'silent-vigil', name: 'Silent Vigil', intent: Intent.DEFEND, block: 9,
      tell: 'It does not move. That is the entire action, and it is worse than moving.',
      effect(c) { c.block(c.self, 9); addCnt(c, 'vigil', 2, 10); announceAngel(c); },
    },
    'grief-unbound': {
      id: 'grief-unbound', name: 'Grief Unbound', intent: Intent.ATTACK_BIG, damage: 5, hits: 1,
      damageFn: (c) => 5 + 4 * cnt(c, 'grief') + cnt(c, 'vigil'),
      tell: 'The hands come away from the face.',
      effect(c) {
        hitPlayer(c, 5 + 4 * cnt(c, 'grief') + cnt(c, 'vigil'));
        setCnt(c, 'grief', 0);
        setCnt(c, 'vigil', 0);
        mem(c).lost = 0;
        mem(c).still = false;
        mem(c).exposed = true;                 // 25% more damage for one player turn
        announceAngel(c);
      },
    },
    'return-to-stone': {
      id: 'return-to-stone', name: 'Return to Stone', intent: Intent.DEFEND, block: 12,
      tell: 'It puts its hands back and stops being a thing that moves.',
      effect(c) {
        c.block(c.self, 12);
        mem(c).still = true;
        mem(c).exposed = false;
        announceAngel(c);
      },
    },
  },

  /** Still, Still, Awakened, Return. Pure: derived from history alone. */
  nextMove: (c) => {
    const h = c.history || [];
    const i = h.length % 4;
    if (i === 0 || i === 1) return 'silent-vigil';
    if (i === 2) return 'grief-unbound';
    return 'return-to-stone';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: it begins the fight with 1 Grief already banked.');
    if (level >= 9) h.counters.grief = 1;
    return h;
  },
};
function announceAngel(c) {
  const still = mem(c).still;
  c.announceRule({
    id: `angel:${c.self.id}`,
    name: still ? `Still · Grief ${cnt(c, 'grief')} / 5` : 'Awakened',
    text: still
      ? 'It gains 8 Guard each turn and does not attack. Every 10 Courage you take off it while Still is 1 Grief, and Grief Unbound deals 5 plus 4 per Grief.'
      : 'It has just swung. For this turn it takes 25% more damage.',
  });
}

/* ══ Big Scare 2 — the Epitaph Choir (§14) ═══════════════════════════════════
 *
 * Four stones, four timelines, no shared Courage pool. Each schedules its own
 * Epitaph, waits a turn after it resolves, and inscribes it again. Destroying a
 * stone erases that timeline for good.
 *
 * The Choir effect is the pressure: while all four stand, the LONGEST countdown
 * loses an extra step every enemy turn, so the four futures converge on each
 * other until the player breaks one.
 */
function choirStone({ id, name, turns, label, palette, lore, resolve }) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'stone',
    hp: [32, 32],
    silhouette: 'name-stone',
    palette,
    shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
    scale: 1.0,
    choir: true,
    epitaphTurns: turns,
    lore,

    onSpawn(c) { inscribe(c); },

    /** Reinscription: one turn of quiet, then the same Epitaph again. */
    onTurnEnd(c) {
      const m = mem(c);
      if (m.timerId && (c.timers() || []).some(t => t.id === m.timerId)) { converge(c); return; }
      if (m.wait > 0) { m.wait -= 1; announceStone(c); return; }
      if (m.timerId) { m.timerId = null; m.wait = 1; announceStone(c); return; }
      inscribe(c);
    },

    moves: {
      inscribed: {
        id: 'inscribed', name: 'Inscribed', intent: Intent.SLEEP,
        tell: 'It does not act. What it wrote does.',
        effect() { /* everything this stone does is on its own clock */ },
      },
    },
    nextMove: () => 'inscribed',

    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 9) h.notes.push('Haunt 9: it inscribes again immediately rather than waiting a turn.');
      if (level >= 9) h.flags.noWait = 1;
      return h;
    },

    _resolve: resolve,
    _label: label,
  };
}

function inscribe(c) {
  const def = c.self.def;
  const t = countdown(c, {
    id: 'epitaph', turns: def.epitaphTurns, label: `${def.name} — ${def._label}`,
    run: ({ e, seat }) => { def._resolve(e, seat); },
  });
  const m = mem(c);
  m.timerId = t ? t.id : null;
  m.wait = 0;
  announceStone(c);
}

/**
 * "As long as all four Gravestones remain: at the end of every enemy turn, the
 * Gravestone with the highest current Countdown reduces its Countdown by one
 * additional step." Only the stone that owns the longest clock does the work,
 * so the check runs on every stone and only one of them acts.
 */
function converge(c) {
  const stones = [c.self, ...allies(c)].filter(a => isAlive(a) && a.def?.choir);
  if (stones.length < 4) { announceStone(c); return; }
  const all = (c.e && c.e.timers) ? c.e.timers.filter(t => /—/.test(t.label)) : [];
  if (!all.length) { announceStone(c); return; }
  const longest = all.reduce((best, t) => (!best || t.turnsLeft > best.turnsLeft ? t : best), null);
  if (longest && longest.ownerId === c.self.id && longest.turnsLeft > 1) {
    c.adjustTimer(longest.id, -1, 'choir');
  }
  announceStone(c);
}

function announceStone(c) {
  const t = (c.timers() || [])[0];
  c.announceRule({
    id: `choir:${c.self.id}`,
    name: `${c.self.name}${t ? ` — ${t.turnsLeft}` : ''}`,
    text: `${c.self.def._label} While all four stones stand, the longest countdown loses an extra step each turn.`,
  });
}

export const stoneOfRain = choirStone({
  id: 'stone-of-rain', name: 'Stone of Rain', turns: 2, label: '8 damage.',
  palette: ['#7f96a8', '#c2d2de', '#2f3a44'],
  lore: 'Rain has been running down this one for a very long time and the name is nearly gone.',
  resolve: (e, seat) => countdownHit(e, seat, 8),
});

export const stoneOfSilence = choirStone({
  id: 'stone-of-silence', name: 'Stone of Silence', turns: 3,
  label: 'A Graveside Hush goes into your discard pile.',
  palette: ['#9a9a92', '#d2d2c8', '#38382f'],
  lore: 'No name at all, and no dates. Somebody chiselled the whole face flat.',
  /**
   * §14 calls the card "Hush", and Hush is a Companion. CONTRACTS 55 — the id
   * namespace is not what the player reads — so it is "Graveside Hush" on the
   * card, which is the same card with a surname.
   */
  resolve: (e, seat) => {
    const def = e.resolveCardDef ? e.resolveCardDef('status/graveside-hush') : null;
    if (def && e.addCard) e.addCard(def, 'discard', { reason: 'stone-of-silence', to: seat });
  },
});

export const stoneOfWeight = choirStone({
  id: 'stone-of-weight', name: 'Stone of Weight', turns: 2,
  label: 'Your next Trick costs 1 additional Nerve.',
  palette: ['#8b8378', '#c0b6a8', '#332e28'],
  lore: 'It has sunk further into the ground than the others and is still going.',
  resolve: (e, seat) => {
    // The next card played, whichever it is — so the mark goes on the whole
    // hand and the first one played spends it.
    const marks = (seat._forgotten ||= new Set());
    for (const card of seat.piles.hand) marks.add(card.uid);
    if (e.applyStatus) e.applyStatus(seat, 'forgotten', 1);
  },
});

export const stoneOfSorrow = choirStone({
  id: 'stone-of-sorrow', name: 'Stone of Sorrow', turns: 4, label: '14 damage.',
  palette: ['#6d6470', '#a89eab', '#2b2630'],
  lore: 'The longest inscription of the four, and the only one anybody still visits.',
  resolve: (e, seat) => countdownHit(e, seat, 14),
});

/* ══ Big Scare 3 — the Mausoleum Mouth (§15) ═════════════════════════════════ */
export const mausoleumMouth = {
  id: 'mausoleum-mouth',
  name: 'The Mausoleum Mouth',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [143, 143],
  silhouette: 'mausoleum',
  palette: ['#6f6a5e', '#a49c8a', '#2a2721'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 1.6,
  lore: 'An old family mausoleum that has grown teeth around the doorway. The doors are further apart than they were.',

  onSpawn(c) { setCnt(c, 'opening', 0); announceMouth(c); },

  onTurnStart(c) { if (cnt(c, 'opening') >= 2) c.block(c.self, 5); },

  onPlayerTurnEnd(c) {
    // Push the clock backwards with offence (§15). Once per turn.
    const need = mem(c).tightened ? 16 : 20;
    mem(c).tightened = false;
    if (dmgTaken(c) >= need && cnt(c, 'opening') > 0) {
      addCnt(c, 'opening', -1, 4, 0);
      c.say('The doors close a little.', 'good');
    }
    // And forward, every third player turn.
    const m = mem(c);
    m.turns = (m.turns || 0) + 1;
    if (m.turns % 3 === 0) addCnt(c, 'opening', 1, 4);
    announceMouth(c);
  },

  moves: {
    'stone-teeth': {
      id: 'stone-teeth', name: 'Stone Teeth', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (cnt(c, 'opening') >= 1 ? 2 : 0),
      hitsFn: (c) => (cnt(c, 'opening') >= 3 ? 2 : 1),
      tell: 'The doorway closes on something that is not a door.',
      effect(c) {
        hitPlayer(c, 10 + (cnt(c, 'opening') >= 1 ? 2 : 0), cnt(c, 'opening') >= 3 ? 2 : 1);
      },
    },
    'crypt-breath': {
      id: 'crypt-breath', name: 'Crypt Breath', intent: Intent.ATTACK_DEBUFF, damage: 6, hits: 1,
      applies: [{ id: 'forgotten', stacks: 1, to: 'player' }],
      damageFn: (c) => 6 + (cnt(c, 'opening') >= 1 ? 2 : 0),
      tell: 'Something very old comes out of it, at room temperature.',
      effect(c) {
        hitPlayer(c, 6 + (cnt(c, 'opening') >= 1 ? 2 : 0));
        const hand = c.cardsIn ? c.cardsIn('hand') : [];
        if (!hand.length) return;
        const pick = hand[c.rng.int(hand.length)];
        forget(c, c.player, [pick.uid]);
        c.announceRule({
          id: `crypt:${c.self.id}`, name: `Forgotten: ${pick.name}`,
          text: 'It costs 1 additional Nerve the first time you play it.',
        });
      },
    },
    'shut-tight': {
      id: 'shut-tight', name: 'Shut Tight', intent: Intent.DEFEND, block: 15,
      tell: 'It pulls itself closed, which is not the same as being closed.',
      effect(c) { c.block(c.self, 15); mem(c).tightened = true; announceMouth(c); },
    },
    'the-doors-open': {
      id: 'the-doors-open', name: 'THE DOORS OPEN', intent: Intent.ATTACK_BIG, damage: 22, hits: 1,
      tell: 'They open all the way.',
      effect(c) {
        hitPlayer(c, 22);
        c.summon('epitaph-spirit', { hp: 18 });
        setCnt(c, 'opening', 1);
        announceMouth(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'opening') >= 4) return 'the-doors-open';
    return cyc(['stone-teeth', 'crypt-breath', 'shut-tight'],
      (c.history || []).filter(x => x !== 'the-doors-open').length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) { h.counters.opening = 1; h.notes.push('Haunt 9: it begins at Opening 1.'); }
    return h;
  },
};
function announceMouth(c) {
  const o = cnt(c, 'opening');
  c.announceRule({
    id: `mouth:${c.self.id}`,
    name: `Opening ${o} / 4`,
    text: '1: attacks deal 2 more. 2: 5 Guard every turn. 3: its bite hits twice. 4: THE DOORS OPEN. '
      + 'It gains 1 Opening every third turn, and loses 1 for any turn you deal it 20 damage.',
  });
}

export const GRAVEYARD_SCARES = [
  mourningAngel,
  stoneOfRain, stoneOfSilence, stoneOfWeight, stoneOfSorrow,
  mausoleumMouth,
];
