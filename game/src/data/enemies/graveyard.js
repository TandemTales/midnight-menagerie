/**
 * The Mansion Graveyard — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/06-graveyard.md §1–§12.
 *
 * The Greenhouse asks "what must I stop before it grows?" The Graveyard asks
 * "what will happen two turns from now, and what do I need to do before then?"
 *
 * Most of these enemies are unusually PREDICTABLE, and §2 is emphatic that the
 * region "should almost never surprise the player with untelegraphed delayed
 * damage. Its difficulty comes from overlapping forecasts." So there is one
 * shared Countdown helper below and everything scheduled goes through it: one
 * label shape, one clock, one place to be wrong.
 *
 * ── WHY COUNTDOWNS ARE ENGINE TIMERS ────────────────────────────────────────
 *
 * `c.schedule` rather than a counter on the enemy, for the same reason the
 * Greenhouse's Spore Clouds are: §3 says in bold that defeating the source does
 * NOT cancel something already set in motion, and that is the region's founding
 * rule. A Mournful Mark on a dead Moth still lands.
 *
 * A timer's damage is `cause: 'timer'`, which `tests/enemies/engine-audit.html`
 * scores separately from intents — a labelled countdown the player has watched
 * for two turns is its own promise, and a different one from an intent.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, hitPlayer, hauntBase,
  flag, isAlive, dmgTaken,
} from './_lib.js';

const REGION = 'graveyard';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const GRAVEYARD_STATUSES = [
  {
    /**
     * §6. A Forgotten Trick is "fully playable" — it just costs one more, once.
     * The marked uids live on the PLAYER, because the mark has to survive the
     * card moving between piles, and `modifyCardCost` reads the set. Pure: the
     * engine re-runs cost on every repaint, so the spend is booked in
     * `onCardPlayed`, which only fires on a card really being played.
     */
    id: 'forgotten', name: 'Forgotten', kind: 'debuff', icon: 'forgotten',
    desc: 'Some of your Tricks have had their names gnawed off. Each costs 1 additional Nerve the first time you play it.',
    decay: 'never', stacks: true,
    hooks: {
      modifyCardCost: (cost, h) => {
        const marks = h.owner && h.owner._forgotten;
        return (marks && h.card && marks.has(h.card.uid)) ? cost + 1 : cost;
      },
      onCardPlayed: (h) => {
        const marks = h.owner && h.owner._forgotten;
        if (!marks || !h.card || !marks.has(h.card.uid)) return;
        marks.delete(h.card.uid);
        h.consume(1);
      },
    },
  },
  {
    id: 'restless', name: 'Restless', kind: 'buff', icon: 'restless',
    desc: 'Its next damaging attack deals 3 more damage. Then it settles.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt) => amt + 3,
      onDealtDamage: (ctx) => ctx.remove(),
    },
  },
  {
    id: 'faded', name: 'Faded', kind: 'buff', icon: 'faded',
    desc: 'The next Attack aimed at it deals 5 less damage. Then it is solid again.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, ctx) => (ctx.card?.type === 'attack' ? Math.max(0, amt - 5) : amt),
      onAttacked: (ctx) => { if (ctx.card?.type === 'attack') ctx.remove(); },
    },
  },
];

/* ══ the shared Countdown ════════════════════════════════════════════════════
 *
 * One helper so every schedule in the region reads the same way on screen, and
 * one place where "the source dying does not cancel it" is true.
 *
 * `when: 'enemyTurnEnd'`, which is §2's own wording: "At the end of each enemy
 * turn: reduce the Countdown by 1."
 */
function countdown(c, { id, turns, label, run }) {
  const key = `${id}:${c.self.id}:${(mem(c).clocks = (mem(c).clocks || 0) + 1)}`;
  return c.schedule({
    id: key, turns, label, when: 'enemyTurnEnd',
    run: ({ e, timer }) => {
      const seat = (typeof e.livingPlayers === 'function' && e.livingPlayers()[0]) || e.player;
      if (!seat || e.over) return;
      run({ e, seat, timer });
    },
  });
}

/** The damage half of a Countdown, tagged so the intent audit scores it apart. */
function countdownHit(e, seat, n) {
  if (!e.dealDamage) return;
  e.dealDamage({ attacker: null, defender: seat, amount: n, kind: 'hazard', cause: 'timer' });
}

/** Mark Tricks Forgotten (§6, §18). The uids live on the seat. */
function forget(c, seat, uids) {
  if (!uids.length) return [];
  const marks = (seat._forgotten ||= new Set());
  for (const u of uids) marks.add(u);
  c.applyStatus(seat, 'forgotten', uids.length);
  return uids;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Grave Moth — the Countdown lesson (§3)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "On Grave Moth defeat: Mournful Mark remains. This establishes the Graveyard
 * rule: defeating the source does not necessarily cancel something already set
 * in motion." (§3.)
 *
 * The Mark's damage grows while it waits — Circle the Stone adds 2, to a cap of
 * 12 — so the number lives on the timer's own `data` and the label is rewritten
 * every time it moves. A countdown the player cannot read the size of would be
 * exactly the untelegraphed damage §2 forbids.
 */
export const graveMoth = {
  id: 'grave-moth',
  name: 'Grave Moth',
  region: REGION,
  tier: 'normal',
  role: 'scheduler',
  hp: [24, 24],
  silhouette: 'moth',
  palette: ['#cfc6b4', '#8f8674', '#3a352c'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.8,
  lore: 'A moth wide enough to cover a gravestone. Names and dates move across its wings and do not settle.',

  moves: {
    'dust-the-name': {
      id: 'dust-the-name', name: 'Dust the Name', intent: Intent.DEBUFF,
      tell: 'It settles on a stone and shakes something pale off its wings.',
      effect(c) {
        if (markOf(c)) { c.block(c.self, 5); return; }
        const t = countdown(c, {
          id: 'mark', turns: 2, label: 'Mournful Mark — 8 damage',
          run: ({ e, seat, timer }) => {
            countdownHit(e, seat, timer.data.n);
            if (typeof e.say === 'function') e.say('The Mournful Mark comes due.', 'warn');
          },
        });
        if (t) { t.data.n = 8; mem(c).markId = t.id; }
      },
    },
    'wing-brush': {
      id: 'wing-brush', name: 'Wing Brush', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'One wing comes round, slowly, and it is heavier than it looks.',
      effect(c) { hitPlayer(c, 6); },
    },
    'circle-the-stone': {
      id: 'circle-the-stone', name: 'Circle the Stone', intent: Intent.DEFEND, block: 7,
      tell: 'It goes round the grave once more, adding to whatever it wrote.',
      effect(c) {
        c.block(c.self, 7);
        const t = markOf(c);
        if (!t) return;
        // Read back through `c.timers()` so the label and the number cannot drift.
        const raw = (c.e && c.e.timers) ? c.e.timers.find(x => x.id === t.id) : null;
        if (!raw) return;
        raw.data.n = Math.min(12, (raw.data.n || 8) + 2);
        raw.label = `Mournful Mark — ${raw.data.n} damage`;
      },
    },
  },

  nextMove: (c) => cyc(['dust-the-name', 'wing-brush', 'circle-the-stone', 'wing-brush'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) h.notes.push('Haunt 5: the Mark starts at 10 rather than 8.');
    return h;
  },
};
function markOf(c) {
  const id = mem(c).markId;
  if (!id || !c.timers) return null;
  return c.timers().find(t => t.id === id) || null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Headstone Hopper — the bill that arrives later (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Unlike Glassvine, Headstone Hopper does not punish the player immediately.
 * The player can attack freely now. The cost arrives later." (§4.)
 *
 * The stored Retaliation is a displayed counter and `damageFn` reads it, so
 * Epitaph Comes Due always shows exactly what it has been saving up. That is
 * the whole enemy: a number you built yourself, on a clock you can see.
 */
export const headstoneHopper = {
  id: 'headstone-hopper',
  name: 'Headstone Hopper',
  region: REGION,
  tier: 'normal',
  role: 'retaliator',
  hp: [39, 39],
  silhouette: 'headstone',
  palette: ['#8c8a82', '#c2c0b6', '#33322c'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 0.95,
  lore: 'A gravestone that has worked itself out of the soil and got up on two short stone feet.',

  onSpawn(c) { announceDue(c); },

  onAttacked(c) {
    addCnt(c, 'retaliation', 3, flag(c, 'retalCap', 15));
    announceDue(c);
  },

  moves: {
    'stone-bump': {
      id: 'stone-bump', name: 'Stone Bump', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It hops once and leans its whole weight into you.',
      effect(c) { hitPlayer(c, 8); },
    },
    'sink-down': {
      id: 'sink-down', name: 'Sink Down', intent: Intent.DEFEND, block: 12,
      tell: 'It settles back into the earth up to the inscription.',
      effect(c) { c.block(c.self, 12); },
    },
    'epitaph-comes-due': {
      id: 'epitaph-comes-due', name: 'Epitaph Comes Due',
      intent: Intent.ATTACK, damage: 0, hits: 1,
      intentFn: (c) => (cnt(c, 'retaliation') > 0 ? Intent.ATTACK : Intent.DEFEND),
      damageFn: (c) => cnt(c, 'retaliation'),
      blockFn: (c) => (cnt(c, 'retaliation') > 0 ? 0 : 8),
      tell: 'It reads the account back to you.',
      effect(c) {
        const owed = cnt(c, 'retaliation');
        if (owed > 0) { hitPlayer(c, owed); setCnt(c, 'retaliation', 0); }
        else c.block(c.self, 8);
        announceDue(c);
      },
    },
  },

  nextMove: (c) => cyc(['stone-bump', 'sink-down', 'epitaph-comes-due'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) { h.flags.retalCap = 21; h.notes.push('Haunt 6: it can store 21 Retaliation, not 15.'); }
    return h;
  },
};
function announceDue(c) {
  c.announceRule({
    id: `due:${c.self.id}`,
    name: `Retaliation ${cnt(c, 'retaliation')}`,
    text: 'Every Attack that damages it adds 3, up to 15. Every third turn it collects the lot at once.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Mourning Candle — kill order matters (§5)
// ═════════════════════════════════════════════════════════════════════════════
export const mourningCandle = {
  id: 'mourning-candle',
  name: 'Mourning Candle',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [26, 26],
  silhouette: 'candle',
  palette: ['#2b2a38', '#6f6ca0', '#12121a'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.6,
  lore: 'A black candle over a small memorial pedestal. The flame turns blue whenever anything nearby is hurt.',

  onAllyDeath(c) { addCnt(c, 'mourning', 1, 3); mem(c).sawDeath = true; },

  moves: {
    'funeral-flame': {
      id: 'funeral-flame', name: 'Funeral Flame', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + 3 * cnt(c, 'mourning'),
      tell: 'The flame leans towards you and stops being a candle flame.',
      effect(c) { hitPlayer(c, 5 + 3 * cnt(c, 'mourning')); setCnt(c, 'mourning', 0); },
    },
    vigil: {
      id: 'vigil', name: 'Vigil', intent: Intent.DEFEND, block: 5,
      tell: 'It burns steadily over whichever of them needs it most.',
      effect(c) {
        c.block(c.self, 5);
        const friend = allies(c).find(a => isAlive(a));
        if (friend) c.block(friend, 7);
      },
    },
    'remember-them': {
      id: 'remember-them', name: 'Remember Them', intent: Intent.DEFEND,
      blockFn: (c) => (mem(c).sawDeath ? 0 : 8),
      intentFn: (c) => (mem(c).sawDeath ? Intent.BUFF : Intent.DEFEND),
      tell: 'It holds still, and the wax runs the wrong way.',
      effect(c) {
        if (mem(c).sawDeath) addCnt(c, 'mourning', 1, 3);
        else c.block(c.self, 8);
      },
    },
  },

  nextMove: (c) => cyc(['vigil', 'funeral-flame', 'remember-them'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 4. Name Gnawer — known, not random (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "This is not random cost inflation. The player knows exactly which future
 * Trick has been altered." (§6.) So every mark is announced by name, and the
 * one taken off the draw pile has its identity revealed — which is the whole
 * difference between this and a tax.
 */
export const nameGnawer = {
  id: 'name-gnawer',
  name: 'Name Gnawer',
  region: REGION,
  tier: 'normal',
  role: 'interference',
  hp: [31, 31],
  silhouette: 'gnawer',
  palette: ['#7d7a72', '#b3afa4', '#2e2c27'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.55,
  lore: 'A small grey thing with far too many teeth, which eats letters out of gravestones and is not sorry.',

  moves: {
    'nibble-the-name': {
      id: 'nibble-the-name', name: 'Nibble the Name', intent: Intent.DEBUFF,
      applies: [{ id: 'forgotten', stacks: 1, to: 'player' }],
      tell: 'It picks a name out of your hand and starts on it.',
      effect(c) {
        const hand = (c.cardsIn ? c.cardsIn('hand') : []);
        if (!hand.length) { c.block(c.self, 5); return; }
        // "Prefer a Trick costing at least 1 Nerve." A free Trick costs nothing
        // to make expensive, so marking one is a wasted turn.
        const pool = hand.filter(x => (x.cost || 0) >= 1);
        const pick = (pool.length ? pool : hand)[c.rng.int((pool.length ? pool : hand).length)];
        forget(c, c.player, [pick.uid]);
        c.announceRule({
          id: `gnaw:${c.self.id}`, name: `Forgotten: ${pick.name}`,
          text: 'It costs 1 additional Nerve the first time you play it.',
        });
      },
    },
    'gravestone-bite': {
      id: 'gravestone-bite', name: 'Gravestone Bite', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It bites something that is not a gravestone.',
      effect(c) { hitPlayer(c, 8); },
    },
    'chew-the-date': {
      id: 'chew-the-date', name: 'Chew the Date', intent: Intent.DEBUFF,
      applies: [{ id: 'forgotten', stacks: 1, to: 'player' }],
      tell: 'It goes for the top of your draw pile, where you cannot see.',
      effect(c) {
        const draw = (c.cardsIn ? c.cardsIn('draw') : []);
        if (!draw.length) { c.block(c.self, 5); return; }
        const pick = draw[0];
        forget(c, c.player, [pick.uid]);
        // "Its identity is revealed to the player" — the whole point of the move.
        c.announceRule({
          id: `gnawtop:${c.self.id}`, name: `Forgotten on top: ${pick.name}`,
          text: 'The next Trick you draw has had its name eaten. It costs 1 additional Nerve once.',
        });
      },
    },
  },

  nextMove: (c) => cyc(['nibble-the-name', 'gravestone-bite', 'chew-the-date', 'gravestone-bite'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 5. Forget Me Not — the one that comes back (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "If combat ends before the Countdown finishes, it remains defeated." (§7.)
 * So the return is a timer, and the timer checks `e.over` before it fires —
 * which the shared `countdown` helper does for everything in this region.
 */
export const forgetMeNot = {
  id: 'forget-me-not',
  name: 'Forget Me Not',
  region: REGION,
  tier: 'normal',
  role: 'recurring',
  hp: [27, 27],
  silhouette: 'flowers',
  palette: ['#5b7fc4', '#a8c2ea', '#233350'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 0.5,
  lore: 'A little mound of earth with blue flowers on it, and a pair of eyes somewhere in among the petals.',

  onDeath(c) {
    if (mem(c).returned) return;               // second death is permanent
    mem(c).returned = true;
    countdown(c, {
      id: 'return', turns: 2, label: 'Forget Me Not returns',
      run: ({ e }) => {
        const def = e.resolveEnemyDef ? e.resolveEnemyDef('forget-me-not') : null;
        if (!def || !e.summon) return;
        const back = e.summon(def, { hp: 13 });
        if (back) (back.mem ||= {}).returned = true;
        if (typeof e.say === 'function') e.say('Forget Me Not comes back.', 'warn');
      },
    });
    c.say('It is not defeated. It is forgotten.', 'warn');
  },

  moves: {
    'little-scratch': {
      id: 'little-scratch', name: 'Little Scratch', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + (mem(c).remembered ? 5 : 0),
      tell: 'Something small comes out from under the petals.',
      effect(c) { hitPlayer(c, 6 + (mem(c).remembered ? 5 : 0)); mem(c).remembered = false; },
    },
    'bloom-again': {
      id: 'bloom-again', name: 'Bloom Again', intent: Intent.DEFEND, block: 4,
      tell: 'It opens a few more flowers.',
      effect(c) { c.heal(c.self, 5); c.block(c.self, 4); },
    },
    'remember-me': {
      id: 'remember-me', name: 'Remember Me', intent: Intent.BUFF,
      tell: 'The eyes fix on you and stay fixed.',
      effect(c) { mem(c).remembered = true; },
    },
  },

  nextMove: (c) => cyc(['little-scratch', 'remember-me', 'little-scratch', 'bloom-again'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) h.notes.push('Haunt 7: it comes back at 18 Courage rather than 13.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 6. Epitaph Spirit — the enemy that shows its homework (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Epitaph Spirit always shows its next two actions instead of only its next
 * action. This gives the player unusually strong information. The Spirit is
 * balanced around that advantage." (§8.)
 *
 * `c.reveal(1)` is said again every turn, because `consumePlan` walks
 * `previewDepth` back down each time a move resolves. Its sequence is FIXED,
 * so what is revealed is what arrives.
 */
export const epitaphSpirit = {
  id: 'epitaph-spirit',
  name: 'Epitaph Spirit',
  region: REGION,
  tier: 'normal',
  role: 'forecaster',
  hp: [35, 35],
  silhouette: 'spirit',
  palette: ['#9aa7bd', '#d6dee8', '#39404f'],
  shape: { body: 'floating', limbs: 2, eyes: 2 },
  scale: 1.0,
  lore: 'A shape that rises from behind a marker. The words appear on the stone before it moves.',

  onSpawn(c) {
    c.reveal(1);
    c.announceRule({
      id: `epitaph:${c.self.id}`, name: 'Epitaph',
      text: 'It writes what it is going to do before it does it. You can always read one action further ahead.',
    });
  },
  onPlayerReady(c) { c.reveal(1); },
  onTurnEnd(c) { c.reveal(1); },

  moves: {
    'cold-hand': {
      id: 'cold-hand', name: 'Cold Hand', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It reaches out without hurrying.',
      effect(c) { hitPlayer(c, 7); },
    },
    restless: {
      id: 'restless', name: 'Restless', intent: Intent.DEFEND_BUFF, block: 9,
      applies: [{ id: 'restless', stacks: 1, to: 'self' }],
      tell: 'The words on the stone rearrange themselves.',
      effect(c) { c.block(c.self, 9); c.applyStatus(c.self, 'restless', 1); },
    },
    'final-line': {
      id: 'final-line', name: 'Final Line', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      tell: 'The last line of the inscription is finished.',
      effect(c) { hitPlayer(c, 14); },
    },
    fade: {
      id: 'fade', name: 'Fade', intent: Intent.DEFEND, block: 5,
      applies: [{ id: 'faded', stacks: 1, to: 'self' }],
      tell: 'It goes thin, and the stone shows through it.',
      effect(c) { c.block(c.self, 5); c.applyStatus(c.self, 'faded', 1); },
    },
  },

  nextMove: (c) => cyc(['cold-hand', 'restless', 'final-line', 'fade'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    return h;
  },
};

export const GRAVEYARD_ENEMIES = [
  graveMoth, headstoneHopper, mourningCandle, nameGnawer, forgetMeNot, epitaphSpirit,
];
export { countdown, countdownHit, forget };
export const GRAVEYARD_REGION = REGION;
