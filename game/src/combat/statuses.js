/**
 * The universal status set. OWNER: combat-engine.
 *
 * These fourteen exist in every fight regardless of Companion (Racket, the co-op
 * taunt, is the only one solo never uses). Companion-specific
 * conditions (Ghoststep, Haunt, Soaked, Web, Vines, Slobbered, Unseen…) are
 * registered by the content agents through `registerStatus()` — they use the same
 * shape and the same hook names, so the engine needs no changes to support them.
 *
 * Naming: schema.js TERMS renames the resources (Courage / Guard / Nerve) but has
 * no in-fiction word for the universal conditions, so the recognisable roguelike
 * names are kept where they exist (Strength, Dexterity, Weak, Vulnerable, Frail,
 * Regen, Focus) and the four that DO have Menagerie names use them:
 *   Poison     → Dread    (creeping fear that gnaws at Courage)
 *   Artifact   → Charm    (a lucky trinket that eats one bad thing)
 *   Thorns     → Bristle  (fur/quills that hurt whoever touches them)
 *   Intangible → Faint    (barely there; nothing lands for more than a scratch)
 *
 * StatusDef shape is schema.js's — id, name, kind, icon, desc, decay, stacks,
 * max, hooks. `desc` uses {n} for the current stack count.
 *
 * DECAY TIMING (this is the part players notice):
 *   'turnEnd'   — loses 1 stack at the END of its OWNER's turn. So a Vulnerable
 *                 you put on an enemy survives that enemy's whole turn and then
 *                 ticks; a Weak an enemy put on you survives your whole turn.
 *   'turnStart' — loses 1 stack at the START of its owner's turn (before draw).
 *   'never'     — permanent for the fight (Strength, Bristle, Charm).
 *   'combat'    — cleared when combat ends (same as 'never' during a fight).
 */

const D = (fn) => fn; // readability marker for hook definitions

/** Weak: the attacker deals 25% less attack damage. Multiplicative, floored. */
export const WEAK_MULT = 0.75;
/** Vulnerable: the defender takes 50% more attack damage. Multiplicative, floored. */
export const VULNERABLE_MULT = 1.5;
/** Frail: the actor gains 25% less Guard. Multiplicative, floored. */
export const FRAIL_MULT = 0.75;

/** @type {Object<string, import('../data/schema.js').StatusDef>} */
export const UNIVERSAL_STATUSES = {

  // ── Buffs ─────────────────────────────────────────────────────────────────
  strength: {
    id: 'strength', name: 'Strength', kind: 'buff', icon: 'strength',
    desc: 'Attacks deal {n} more damage per hit.',
    decay: 'never', stacks: true,
    // PIPELINE STATUS — applied at a guaranteed position inside damage.js
    // (step 2, additive, attacker side) rather than through a hook, so its
    // ordering relative to Weak and Vulnerable can never drift.
    pipeline: 'damage.step2',
  },

  dexterity: {
    id: 'dexterity', name: 'Dexterity', kind: 'buff', icon: 'dexterity',
    desc: 'Gain {n} more Guard from Tricks.',
    decay: 'never', stacks: true,
    // PIPELINE STATUS — applied inside engine.gainBlock (step 1, additive).
    pipeline: 'block.step1',
  },

  focus: {
    id: 'focus', name: 'Focus', kind: 'buff', icon: 'focus',
    desc: 'Companion resources you gain are increased by {n}.',
    decay: 'never', stacks: true,
    hooks: {
      modifyCounterGain: D((amt, h) => (amt > 0 && h.focusable) ? amt + h.stacks : amt),
    },
  },

  regen: {
    id: 'regen', name: 'Regen', kind: 'buff', icon: 'regen',
    desc: 'Recover {n} Courage at the end of your turn, then lose 1 Regen.',
    decay: 'turnEnd', stacks: true,
    hooks: {
      onTurnEnd: D((h) => {
        if (h.stacks > 0 && h.owner.alive) {
          h.e._statusTrigger(h.owner, 'regen', h.stacks, 'heal');
          h.e.heal(h.owner, h.stacks, 'regen');
        }
      }),
    },
  },

  bristle: {
    id: 'bristle', name: 'Bristle', kind: 'buff', icon: 'bristle',
    desc: 'When hit by an attack, deal {n} damage back to the attacker.',
    decay: 'never', stacks: true,
    hooks: {
      onAttacked: D((h) => {
        if (h.kind !== 'attack' || h.stacks <= 0) return;
        const attacker = h.attacker;
        if (!attacker || attacker === h.owner || !attacker.alive) return;
        h.e._statusTrigger(h.owner, 'bristle', h.stacks, 'retaliate');
        h.e.dealDamage({
          attacker: h.owner, defender: attacker, amount: h.stacks,
          kind: 'thorns', cause: 'bristle', skipModifiers: true,
        });
      }),
    },
  },

  faint: {
    id: 'faint', name: 'Faint', kind: 'buff', icon: 'faint',
    desc: 'Reduce ALL damage taken to 1. Lose 1 Faint at the end of your turn.',
    decay: 'turnEnd', stacks: true,
    hooks: {
      modifyDamageTaken: D((amt, h) => (h.stacks > 0 && amt > 1) ? 1 : amt),
    },
  },

  racket: {
    id: 'racket', name: 'Racket', kind: 'buff', icon: 'racket',
    // The co-op taunt. Multiplayer only in practice — with one seat at the
    // table there is nobody to pull attention away FROM, so it reads as a dead
    // status in solo and no solo card grants it.
    //
    // Named rather than borrowed: this game renames every universal condition
    // it has fiction for (Poison -> Dread, Thorns -> Bristle), and "Taunt" is a
    // genre word, not a Menagerie one. A kid making a racket in a dark house so
    // the thing looks at them instead of their friend is the actual fiction.
    //
    // Read in `engine.intentTargetFor`, not through a hook: targeting has to be
    // decided in one place or a preview and its resolution can disagree.
    desc: 'Enemies attack you instead of your friends. Lose 1 Racket at the end of your turn.',
    decay: 'turnEnd', stacks: true,
  },

  charm: {
    id: 'charm', name: 'Charm', kind: 'buff', icon: 'charm',
    desc: 'Prevent the next {n} negative conditions applied to you.',
    decay: 'never', stacks: true,
    // Consumed inside engine.applyStatus — a hook cannot cleanly veto there.
  },

  // ── Debuffs ───────────────────────────────────────────────────────────────
  weak: {
    id: 'weak', name: 'Weak', kind: 'debuff', icon: 'weak',
    desc: 'Deal 25% less attack damage. Lasts {n} turns.',
    decay: 'turnEnd', stacks: true,
    pipeline: 'damage.step3',   // ×0.75 floored, attacker side, after Strength
  },

  vulnerable: {
    id: 'vulnerable', name: 'Vulnerable', kind: 'debuff', icon: 'vulnerable',
    desc: 'Take 50% more attack damage. Lasts {n} turns.',
    decay: 'turnEnd', stacks: true,
    pipeline: 'damage.step4',   // ×1.5 floored, defender side, after Weak
  },

  frail: {
    id: 'frail', name: 'Frail', kind: 'debuff', icon: 'frail',
    desc: 'Gain 25% less Guard from Tricks. Lasts {n} turns.',
    decay: 'turnEnd', stacks: true,
    pipeline: 'block.step2',    // ×0.75 floored, after Dexterity
  },

  dread: {
    id: 'dread', name: 'Dread', kind: 'debuff', icon: 'dread',
    desc: 'At the start of its turn, lose {n} Courage, then lose 1 Dread.',
    decay: 'never', stacks: true,
    hooks: {
      onTurnStart: D((h) => {
        if (h.stacks <= 0 || !h.owner.alive) return;
        h.e._statusTrigger(h.owner, 'dread', h.stacks, 'tick');
        h.e.loseHp(h.owner, h.stacks, 'dread');
        h.e.applyStatus(h.owner, 'dread', -1, { reason: 'tick', silentBlock: true });
      }),
    },
  },

  confusion: {
    id: 'confusion', name: 'Confusion', kind: 'debuff', icon: 'confusion',
    desc: 'Tricks cost a random amount of Nerve (0-3) when drawn.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onCardDrawn: D((h) => {
        const c = h.card;
        if (!c || c.baseCost < 0) return;           // X-cost and unplayable are untouched
        h.e.setCardCost(c, h.e.rng.int(4), 'combat', 'confusion');
      }),
    },
  },

  entangle: {
    id: 'entangle', name: 'Entangle', kind: 'debuff', icon: 'entangle',
    desc: 'You cannot play Attacks. Lasts {n} turns.',
    decay: 'turnEnd', stacks: false, max: 1,
    // Enforced in engine.canPlay — a play-veto, not a value modifier.
  },
};

/** Every status the engine or content has registered. */
const REGISTRY = new Map(Object.entries(UNIVERSAL_STATUSES));

/** Register (or replace) a status definition. Content agents call this. */
export function registerStatus(def) {
  if (!def || !def.id) throw new Error('registerStatus: def.id required');
  REGISTRY.set(def.id, {
    kind: 'neutral', decay: 'never', stacks: true, icon: def.id, desc: '', ...def,
  });
  return REGISTRY.get(def.id);
}

export function registerStatuses(defs) {
  const list = Array.isArray(defs) ? defs : Object.values(defs);
  for (const d of list) registerStatus(d);
}

/** Look up a status. Unknown ids return a generic placeholder rather than throwing —
 *  a typo in card content must not take the whole fight down. */
export function getStatus(id) {
  return REGISTRY.get(id) || {
    id, name: id, kind: 'neutral', icon: 'unknown',
    desc: '', decay: 'never', stacks: true, hooks: {}, _missing: true,
  };
}

export function hasStatusDef(id) { return REGISTRY.has(id); }
export function allStatuses() { return [...REGISTRY.values()]; }

/** Fill {n} in a status description. */
export function statusDesc(id, stacks) {
  return String(getStatus(id).desc || '').replace(/\{n\}/g, String(stacks));
}

/** Ids in the order the status row should display them: buffs, then debuffs. */
export const STATUS_ORDER = Object.freeze([
  'strength', 'dexterity', 'focus', 'regen', 'bristle', 'faint', 'charm', 'racket',
  'weak', 'vulnerable', 'frail', 'dread', 'confusion', 'entangle',
]);
