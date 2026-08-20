/**
 * Companion keyword + status registry.  OWNER: companion-cards.
 *
 * `data/keywords.js` belongs to combat-engine, so every keyword and status that
 * only exists because of a Companion's signature mechanic is declared here and
 * merged in by the engine:
 *
 *     import { COMPANION_KEYWORDS, COMPANION_STATUSES } from './companions/keywords.js';
 *     registerKeywords(COMPANION_KEYWORDS);
 *     registerStatuses(COMPANION_STATUSES);
 *
 * KEYWORDS are tooltip entries — card text writes them as `[Ghoststep]`.
 * STATUSES are live combat objects with stacks and hooks.  Several of them are
 * pure counters with no behaviour (Lives, Height, Globs, Open Eyes): they exist so
 * the status row can display them and so `ctx.count()` can read them.
 *
 * Hook names beyond the StatusDef set documented in schema.js are marked EXTRA.
 * They are listed in ENGINE_HOOKS_REQUIRED at the bottom of this file.
 */

// ── keyword tooltips ────────────────────────────────────────────────────────
const K = (id, name, desc, extra) => ({ id, name, desc, ...(extra || {}) });

export const COMPANION_KEYWORDS = [
  // shared vocabulary
  K('vanish', 'Vanish', 'Remove this Trick from the combat after it resolves. Midnight Menagerie’s word for Exhaust.'),
  K('retain', 'Retain', 'This Trick is not discarded at the end of your turn.'),
  K('innate', 'Innate', 'This Trick starts in your opening hand.'),
  K('ethereal', 'Ethereal', 'If this Trick is in your hand at the end of your turn, it Vanishes.'),
  K('empowered', 'Empowered', 'Your next Attack this turn deals additional damage.'),

  // ── Marmalade ─────────────────────────────────────────────────────────────
  K('ghoststep', 'Ghoststep', 'Each stack prevents the next hit of enemy Attack damage entirely. Unused Ghoststep expires at the end of the enemy turn. It is not Guard — one stack can eat a 30 damage hit, but six small hits eat six stacks.', { companion: 'marmalade' }),
  K('haunt', 'Haunt', 'When a Haunted enemy takes a damaging action, it loses Courage equal to its Haunt, then loses half its Haunt, rounded up.', { companion: 'marmalade' }),
  K('lives', 'Lives', 'Marmalade begins every combat with 9 Lives. Lives are a combat resource, not Courage. Certain Tricks spend them. They do not return until the next battle.', { companion: 'marmalade' }),
  K('zoomies', 'Zoomies', 'This effect activates if this is the third or later Trick you have played this turn.', { companion: 'marmalade' }),
  K('untouched', 'Untouched', 'Active while you lost no Courage during the previous enemy turn.', { companion: 'marmalade' }),

  // ── Bones ─────────────────────────────────────────────────────────────────
  K('loose-bones', 'Loose Bones', 'How much of Bones is currently detached. 0 to 6. Loose Bones vanish after combat.', { companion: 'bones' }),
  K('shed', 'Shed', 'Increase Loose Bones, to a maximum of 6.', { companion: 'bones' }),
  K('reattach', 'Reattach', 'Reduce Loose Bones. As a cost, you must have enough Loose Bones to pay it.', { companion: 'bones' }),
  K('whole', 'Whole', 'You are Whole while you have exactly 0 Loose Bones.', { companion: 'bones' }),
  K('scattered', 'Scattered', 'You are Scattered while you have 4 or more Loose Bones.', { companion: 'bones' }),
  K('rattle', 'Rattle', 'A Rattle happens whenever your Loose Bones actually change. Changing three at once is one Rattle. Shedding and then Reattaching is two.', { companion: 'bones' }),
  K('fetch', 'Fetch', 'Return an eligible Trick from your discard pile to your hand. This is not drawing. A Fetched Trick becomes Slobbered.', { companion: 'bones' }),
  K('slobbered', 'Slobbered', 'A Slobbered Trick cannot be Fetched again this combat. It can still be drawn, played, discarded or Buried.', { companion: 'bones' }),
  K('bury', 'Bury', 'Place a Trick in the Buried zone with 2 counters. It loses 1 counter at the start of your turn, and is Dug Up when the last one goes. Buried Tricks cannot be drawn, played, discarded or Fetched.', { companion: 'bones' }),
  K('dig-up', 'Dig Up', 'Return a Trick from the Buried zone to your hand. This is not drawing or Fetching, and it does not Slobber the Trick. It gains a Dug Up marker until it is next played.', { companion: 'bones' }),
  K('dug-up', 'Dug Up', 'This Trick came out of the ground and has not been played since.', { companion: 'bones' }),

  // ── Pipkin ────────────────────────────────────────────────────────────────
  K('height', 'Height', 'How far off the ground Pipkin has bounced, 0 to 3. Height does nothing on its own and disappears at the end of your turn.', { companion: 'pipkin' }),
  K('hop', 'Hop', 'Gain 1 Height, to a maximum of 3.', { companion: 'pipkin' }),
  K('land', 'Land', 'Spend all your Height and resolve this clause using the amount spent. With 0 Height the Land clause does not resolve.', { companion: 'pipkin' }),
  K('patch', 'The Patch', 'Pipkin’s private garden. Up to 6 objects. At the end of your turn every Sprout becomes a Pumpkin and every Seed becomes a Sprout.', { companion: 'pipkin' }),
  K('seed', 'Seed', 'The first Patch stage. Becomes a Sprout at the next growth step.', { companion: 'pipkin' }),
  K('sprout', 'Sprout', 'The middle Patch stage. Becomes a Pumpkin at the next growth step.', { companion: 'pipkin' }),
  K('pumpkin', 'Pumpkin', 'The mature Patch stage. Does nothing until something Harvests it — its purpose is decided by the Trick that takes it.', { companion: 'pipkin' }),
  K('plant', 'Plant', 'Add that many Seeds to the Patch, up to its capacity.', { companion: 'pipkin' }),
  K('harvest', 'Harvest', 'Remove up to that many Pumpkins from the Patch to power an effect. Harvesting is optional.', { companion: 'pipkin' }),
  K('plump', 'Plump', 'How round Pipkin is, 0 to 3. Plump persists between turns.', { companion: 'pipkin' }),
  K('heavy-feet', 'Heavy Feet', 'While at maximum Plump, Tricks containing Hop cost 1 more Pluck. A Trick that Hops twice is still only taxed once.', { companion: 'pipkin' }),
  K('deflate', 'Deflate', 'Spend that much Plump. If you do not have enough, the clause cannot be used.', { companion: 'pipkin' }),

  // ── Taffy ─────────────────────────────────────────────────────────────────
  K('glob', 'Globs', 'Pieces of Taffy that have separated from her body, 0 to 6. Globs cannot pay Trick costs.', { companion: 'taffy' }),
  K('split', 'Split', 'Gain that many Globs, to a maximum of 6.', { companion: 'taffy' }),
  K('recombine', 'Recombine', 'Spend that many Globs.', { companion: 'taffy' }),
  K('runny', 'Runny', 'At 5 or 6 Globs Taffy is Runny and loses a little Courage at the end of each enemy turn. Once per enemy turn, not once per Glob.', { companion: 'taffy' }),
  K('stretch', 'Stretch', 'A Stretched Trick Retains and gains 1 Stretch at the end of each of your turns, to a maximum of 3. All Stretch is removed when it is played.', { companion: 'taffy' }),
  K('belly', 'Belly', 'Taffy’s storage zone, normally 2 slots. Absorbed Tricks leave deck circulation but keep every modification and return after combat.', { companion: 'taffy' }),
  K('absorb', 'Absorb', 'Place a Trick face up in the Belly.', { companion: 'taffy' }),
  K('spit-out', 'Spit Out', 'Move a Trick from the Belly to your hand, or to your discard pile if your hand is full.', { companion: 'taffy' }),
  K('gummy', 'Gummy', 'A temporary replica. It copies the original’s text and current cost, starts at 0 Stretch, has Vanish, and cannot be copied or Absorbed.', { companion: 'taffy' }),
  K('chewed', 'Chewed', 'A Gummy copy that survived one play. It Vanishes the next time it is played, and Chewed can never be removed.', { companion: 'taffy' }),

  // ── Wink ──────────────────────────────────────────────────────────────────
  K('preview', 'Preview', 'Reveal that many additional future Intent positions for an enemy, to a depth of three.', { companion: 'wink' }),
  K('read', 'Read', 'Predict an Intent Family for an enemy’s future position. Correct: Open 1 Eye. Wrong: Close 1 Eye. A Read stays attached to the position, not the action.', { companion: 'wink' }),
  K('blind-read', 'Blind Read', 'A Read placed on a position that was still hidden. Its Blind status is remembered even if you Preview it afterwards.', { companion: 'wink' }),
  K('intent-family', 'Intent Family', 'Every Intent is exactly one of Attack, Defense, Scheme or Special.', { companion: 'wink' }),
  K('eye', 'Eyes', 'Wink has eight supernatural eyes. Opening and Closing them costs no Pluck. Eyes persist between turns, and a Trick that Closes Eyes as a cost needs enough Open ones to pay.', { companion: 'wink' }),
  K('open-eyes', 'Open Eyes', 'Wink has eight eyes and begins combat with 3 Open. Eyes persist between turns and cost no Pluck to open or close.', { companion: 'wink' }),
  K('full-gaze', 'Full Gaze', 'Active at 8 Open Eyes. No automatic benefit — specific Tricks reward it.', { companion: 'wink' }),
  K('web', 'Web', 'A persistent resource attached to an enemy. Web does nothing by itself; Wink’s Tricks spend it to rearrange, postpone, attack or defend.', { companion: 'wink' }),
  K('set', 'Set', 'Place this Trick face up outside your deck, in one of 3 Set slots. It resolves automatically and for free when its trigger occurs.', { companion: 'wink' }),
  K('anchored', 'Anchored', 'An Anchored Intent can be Previewed and Read, but never swapped, postponed or deleted.', { companion: 'wink' }),
  K('reorder', 'Reorder', 'Change when an enemy action happens. Reordering never erases the action.', { companion: 'wink' }),
];

export const KEYWORD_IDS = COMPANION_KEYWORDS.map(k => k.id);

// ── statuses ────────────────────────────────────────────────────────────────
/** A plain visible counter with no behaviour of its own. */
const counterStatus = (id, name, desc, max, kind = 'neutral') => ({
  id, name, kind, icon: id, desc, decay: 'never', stacks: true, max, resource: true,
});

export const COMPANION_STATUSES = [
  // ── generic ───────────────────────────────────────────────────────────────
  {
    id: 'empowered', name: 'Empowered', kind: 'buff', icon: 'empowered', decay: 'turnEnd', stacks: true,
    desc: 'Your next Attack this turn deals {n} additional damage.',
    hooks: {
      // EXTRA: onAttackDealt — fired once per Attack card, after its damage resolves.
      modifyDamageDealt: (amt, ctx) => (ctx?.isAttack ? amt + (ctx.stacks || 0) : amt),
      onAttackDealt: (ctx) => ctx?.remove?.(),
    },
  },

  // ── Marmalade ─────────────────────────────────────────────────────────────
  {
    id: 'ghoststep', name: 'Ghoststep', kind: 'buff', icon: 'ghoststep', decay: 'enemyTurnEnd', stacks: true, max: 9,
    desc: 'Prevents the next {n} hits of enemy Attack damage entirely. Expires at the end of the enemy turn.',
    hooks: {
      modifyDamageTaken: (amt, ctx) => {
        if (!ctx?.fromAttack || amt <= 0) return amt;
        ctx.consume?.(1);
        ctx.fire?.('ghoststepConsumed');
        return 0;
      },
    },
  },
  {
    id: 'haunt', name: 'Haunt', kind: 'debuff', icon: 'haunt', decay: 'never', stacks: true,
    desc: 'When this enemy takes a damaging action it loses {n} Courage, then loses half its Haunt, rounded up.',
    hooks: {
      // EXTRA: onAttack — fired on the acting enemy just after its damaging move resolves.
      onAttack: (ctx) => {
        const n = ctx?.stacks || 0;
        if (n <= 0) return;
        ctx.loseHp?.(ctx.actor, n);
        ctx.consume?.(ctx.slowDissipation ? 1 : Math.ceil(n / 2));
      },
    },
  },
  counterStatus('lives', 'Lives', 'Marmalade has {n} of her nine Lives left this combat.', 9, 'buff'),
  {
    id: 'untouched', name: 'Untouched', kind: 'buff', icon: 'untouched', decay: 'never', stacks: false,
    desc: 'You lost no Courage during the previous enemy turn.',
  },
  counterStatus('untouched-streak', 'Perfect Streak', 'You have been Untouched for {n} consecutive enemy turns.', 99, 'buff'),
  {
    id: 'predators-patience', name: 'Predator’s Patience', kind: 'buff', icon: 'strength', decay: 'never', stacks: true,
    desc: 'Your Attacks deal {n} additional damage for the rest of this combat.',
    hooks: { modifyDamageDealt: (amt, ctx) => (ctx?.isAttack ? amt + (ctx.stacks || 0) : amt) },
  },
  {
    id: 'slow-haunting', name: 'Permanent Haunting', kind: 'buff', icon: 'haunt', decay: 'never', stacks: false,
    desc: 'Haunt loses only 1 stack when it triggers instead of half.',
  },
  {
    id: 'not-dead-yet', name: 'Not Dead Yet', kind: 'buff', icon: 'lives', decay: 'turnStart', stacks: false,
    desc: 'The next time your Courage would reach 0 this turn, spend 3 Lives instead and survive at 1 Courage.',
    hooks: {
      // EXTRA: onLethal — fired before a hit would reduce the player to 0 Courage.
      onLethal: (ctx) => { if ((ctx.count?.('lives') || 0) >= 3) { ctx.spend?.('lives', 3); ctx.survive?.(1); ctx.remove?.(); return true; } return false; },
    },
  },
  {
    id: 'nope', name: 'Nope.', kind: 'buff', icon: 'nope', decay: 'turnStart', stacks: true,
    desc: 'Prevents the next {n} debuffs an enemy would apply to you.',
    hooks: {
      // EXTRA: onDebuffIncoming — fired before a debuff lands on the player.
      onDebuffIncoming: (ctx) => { ctx.consume?.(1); return false; },
    },
  },

  // ── Bones ─────────────────────────────────────────────────────────────────
  counterStatus('loose-bones', 'Loose Bones', '{n} of Bones is currently detached. Whole at 0, Scattered at 4 or more.', 6),
  {
    id: 'anatomy-optional', name: 'Anatomy Is Optional', kind: 'buff', icon: 'scattered', decay: 'never', stacks: false,
    desc: 'You count as Scattered at 2 or more Loose Bones instead of 4.',
  },
  {
    id: 'play-dead', name: 'Play Dead', kind: 'buff', icon: 'play-dead', decay: 'turnStart', stacks: false,
    desc: 'Until your next turn, you may Shed 1 Bone before any hit to reduce that hit’s damage by half. Once per hit.',
    hooks: {
      // EXTRA: onIncomingHit — fired per individual attack hit, before mitigation.
      onIncomingHit: (amt, ctx) => { if ((ctx.count?.('loose-bones') || 0) >= 6) return amt; ctx.shed?.(1); return Math.ceil(amt / 2); },
    },
  },

  // ── Pipkin ────────────────────────────────────────────────────────────────
  counterStatus('height', 'Height', 'Pipkin is {n} bounces off the ground. Height disappears at the end of your turn.', 3),
  counterStatus('plump', 'Plump', 'Pipkin is {n} sizes rounder. At maximum Plump, Hop Tricks cost 1 more.', 5),
  {
    id: 'hang-time', name: 'Hang Time', kind: 'buff', icon: 'height', decay: 'turnStart', stacks: false,
    desc: 'Your Height does not disappear at the end of this turn.',
  },
  {
    id: 'land-boost', name: 'Higher Than It Looks', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: true,
    desc: 'Your next Land effect this turn treats the Height spent as {n} higher, to a maximum of 3.',
  },
  {
    id: 'double-land', name: 'Double Landing', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: false,
    desc: 'Your next Land effect this turn resolves its Land clause twice.',
  },

  // ── Taffy ─────────────────────────────────────────────────────────────────
  counterStatus('globs', 'Globs', 'Taffy has separated into {n} pieces. Runny at 5 or more.', 6),
  {
    id: 'blob-insurance', name: 'Blob Insurance', kind: 'buff', icon: 'globs', decay: 'turnStart', stacks: false,
    desc: 'You cannot lose Courage from being Runny before your next turn.',
  },
  {
    id: 'no-runny', name: 'Runaway Puddle', kind: 'buff', icon: 'globs', decay: 'never', stacks: false,
    desc: 'Being Runny no longer costs you Courage.',
  },

  // ── Wink ──────────────────────────────────────────────────────────────────
  counterStatus('open-eyes', 'Open Eyes', 'Wink has {n} of eight eyes open. Full Gaze at 8.', 8, 'buff'),
  {
    id: 'web', name: 'Web', kind: 'debuff', icon: 'web', decay: 'never', stacks: true,
    desc: '{n} Web. Web does nothing on its own — Wink’s Tricks spend it to rearrange, postpone, attack or defend.',
  },
  {
    id: 'web-discount', name: 'All Eyes Open', kind: 'buff', icon: 'web', decay: 'never', stacks: true,
    desc: 'Your first Intent manipulation each turn costs {n} less Web, minimum 1.',
  },
  {
    id: 'free-web', name: 'Master of the Web', kind: 'buff', icon: 'web', decay: 'never', stacks: false,
    desc: 'The first time each turn you spend Web to reorder or delete an Intent, the Web is not actually removed.',
  },
];

export const STATUS_IDS = COMPANION_STATUSES.map(s => s.id);

/**
 * Hook names used above that are NOT in the StatusDef hook set documented in
 * schema.js.  combat-engine needs to fire these for the marked statuses to work.
 * Everything else a Companion Power does is handled inside data/companions/**.
 */
export const ENGINE_HOOKS_REQUIRED = [
  { hook: 'onAttack', when: 'An enemy finishes a damaging move.', neededBy: ['haunt'] },
  { hook: 'onAttackDealt', when: 'The player finishes resolving an Attack card.', neededBy: ['empowered'] },
  { hook: 'onIncomingHit', when: 'Per individual attack hit against the player, before mitigation.', neededBy: ['play-dead'] },
  { hook: 'onLethal', when: 'A hit is about to reduce the player to 0 Courage.', neededBy: ['not-dead-yet'] },
  { hook: 'onDebuffIncoming', when: 'A debuff is about to land on the player.', neededBy: ['nope'] },
  { hook: 'enemyTurnEnd decay', when: 'Decay bucket that expires at the end of the enemy turn.', neededBy: ['ghoststep'] },
];

export default { COMPANION_KEYWORDS, COMPANION_STATUSES, KEYWORD_IDS, STATUS_IDS, ENGINE_HOOKS_REQUIRED };
