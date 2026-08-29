/**
 * The Governess — Forgotten Nursery region boss. OWNER: enemies.
 * Source of truth: docs/design/regions/02-nursery.md §15–§24.
 *
 * She does not believe she is cruel. She believes everything damaged should be repaired,
 * everything messy corrected, and everything frightened kept somewhere safe. Forever,
 * if necessary. "Nothing properly cared for should ever be allowed to come apart."
 *
 *   Phase 1  175 → 101   Stitched Together: Favorite Doll eats the first 10 damage each
 *                        turn. Tear the Doll, get a window, watch her spend a turn mending.
 *   Transition at ≤100   Look What You've Done: the Doll is permanently Torn, and she
 *                        starts patching herself with what is left of it.
 *   Phase 2  100 → 0     A three-Patch cycle you can either play around or hit through.
 *
 * BALANCE 2026-08-20 (two-region round): she was 280 Courage and 15.2 turns against an
 * 8-12 band, and a competent player beat her 94.7% of the time against a 60-75% band.
 * A Courage sweep at the real Nursery door settled the question — x1.0/0.8/0.7/0.6/0.5
 * measured 95% / 95% / 95% / 95% / 95%. Her Courage was buying LENGTH and nothing else,
 * because 85% of her printed damage was being blocked and one turn in four of each cycle
 * dealt none at all. Courage came down to 190; the threat was bought back in damage, and
 * Tighten the Stitch stopped being a free turn for the player.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, hitPlayer, dmgTaken,
  hauntBase, flag, isAlive, bossDmg,
  phaseAt,
} from '../enemies/_lib.js';

const PHASE2_AT = 100;
/** The pool the threshold above was authored against. See `phaseAt`. */
const BASE_HP = 175;

/**
 * Stitched Together: how much damage Favorite Doll eats before she feels any,
 * PER KID, PER ROUND.
 *
 * "The first damage redirected from each player every round is 10. So with four
 * players, each player can independently trigger the thread. This prevents
 * player order from determining who gets punished by the mechanic."
 * (docs/design/regions/02-nursery.md §35.) A single shared 10 would mean the
 * first Kid to swing spends the whole allowance and the second Kid's opening
 * Trick hits her directly — the mechanic would reward acting last, which is
 * not a decision anybody should be making.
 */
const STITCH_PER_TURN = 10;

/** Favorite Doll's random Patch, visible before the first player turn. */
export const DOLL_PATCHES = {
  'stuffed-patch': { id: 'stuffed-patch', name: 'Stuffed Patch', desc: 'Favorite Doll has 10 additional maximum Courage.' },
  'button-patch': { id: 'button-patch', name: 'Button Patch', desc: 'Whenever damage is redirected into Favorite Doll, The Governess gains 2 Guard. Maximum 6 per turn.' },
  'lace-patch': { id: 'lace-patch', name: 'Lace Patch', desc: 'Whenever The Governess repairs Favorite Doll, it returns with 6 additional Courage.' },
};
const DOLL_PATCH_IDS = Object.keys(DOLL_PATCHES);

// ─────────────────────────────────────────────────────────────────────────────
// Favorite Doll — not an independent actor, a limb of the boss
// ─────────────────────────────────────────────────────────────────────────────
export const favoriteDoll = {
  id: 'favorite-doll',
  name: 'Favorite Doll',
  region: 'nursery',
  tier: 'boss',
  role: 'bossPart',
  hp: [50, 50],
  silhouette: 'favorite-doll',
  palette: ['#f2e2d0', '#b9899a', '#5a4450'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.85,
  passive: true,
  lore: 'She has repaired it so many times that none of the original doll is left. She has never once considered that this might matter.',

  /**
   * "Favorite Doll scales to: 2 players 80 Courage, 3 players 105, 4 players
   * 128." (docs/design/regions/02-nursery.md §35.) That is a shallower curve
   * than the party default of 2.2x, which would put it at 110 — and the Doll is
   * not a health bar, it is a timer on a window the party is trying to open.
   * Scaling it like an enemy would make the vulnerability window arrive later
   * with more Kids, which is backwards.
   */
  partyHp: (n) => [1, 1.6, 2.1, 2.56][Math.min(n, 4) - 1] ?? 1,

  onSpawn(c) {
    // One Patch, rolled from the run seed and shown before the first player turn.
    const n = flag(c, 'patchCount', 1);
    const pool = c.rng.shuffle(DOLL_PATCH_IDS).slice(0, n);
    mem(c).patches = pool;
    setCnt(c, 'patches', pool.length);
    if (pool.includes('stuffed-patch')) {
      c.self.maxHp += 10;
      c.self.hp += 10;
    }
  },

  hasPatch(c, id) { return (mem(c).patches || []).includes(id); },

  /** Torn: still on the battlefield, no longer redirecting, no longer targetable. */
  isTorn(c) { return !!mem(c).torn; },

  /**
   * Torn. It keeps its place on the board — Mend My Darling has to find it
   * again, and `governess.doll()` therefore searches the whole board rather
   * than the living enemies.
   */
  onDeath(c) {
    mem(c).torn = true;
    mem(c).tornOnTurn = c.turn;
    /**
     * The repair window has to be one every Kid can actually use.
     *
     * "When Favorite Doll becomes Torn, it remains Torn until every player has
     * completed at least one player turn before The Governess can use Mend My
     * Darling. Every player therefore receives access to the vulnerability
     * window." (docs/design/regions/02-nursery.md §35.)
     *
     * Turns here are simultaneous, so one turn IS everybody's turn — unless a
     * teammate had already ended theirs when the Doll came apart, in which case
     * they never got to swing at an undefended Governess and the window owes
     * them one more round. Solo always takes the first branch, which is exactly
     * the `turn > tornOnTurn` this used to be.
     */
    const seats = c.e.livingPlayers();
    mem(c).tornWindowUntil = c.turn + (seats.some(pl => pl.ended) ? 1 : 0);
  },

  moves: {
    'sit-still': {
      id: 'sit-still', name: 'Held Together', intent: Intent.SLEEP,
      tell: 'It does not act on its own. It is only here to be hurt instead of her.',
      effect() { /* the Doll never takes an action */ },
    },
  },

  nextMove: () => 'sit-still',

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.patchCount = 2;
      h.notes.push('Haunt 10: Favorite Doll carries two Patches instead of one. Both function simultaneously.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The Governess
// ─────────────────────────────────────────────────────────────────────────────
const REPAIR_PATCHES = ['reinforced', 'stuffed', 'buttoned'];

export const governess = {
  id: 'governess',
  name: 'The Governess',
  region: 'nursery',
  tier: 'boss',
  role: 'boss',
  hp: [175, 175],
  silhouette: 'governess',
  palette: ['#2b2233', '#6b5a72', '#e6dcc8'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.55,
  lore: 'Her dress is made from nursery curtains, her fingers taper into silver needles, and a measuring tape moves around her neck like a snake.',

  phases: 2,
  phaseThresholds: [PHASE2_AT],
  escort: [{ enemyId: 'favorite-doll' }],

  onSpawn(c) {
    mem(c).phase = 1;
    mem(c).emergencyRepairs = 0;
    mem(c).cycle = 0;
    mem(c).redirectedBySeat = {};
    setCnt(c, 'repair-patch', 0);

    /**
     * Stitched Together and the Reinforced Patch are hung on a Power here.
     *
     * They were written as plain def methods — `governess.redirect()` and
     * `governess.modifyIncoming()` — that NOTHING in the engine ever called,
     * so her entire phase-one mechanic was inert: 30 damage aimed at her landed
     * 30 on her and 0 on the Doll, and the Doll was a decorative 60-Courage
     * bystander. That is the silent-no-op class CONTRACTS rule 8 exists for,
     * and it is why her Courage sweep measured 95% player wins at every pool
     * size — she was not defended, only long.
     *
     * A Power is how the rest of this codebase does it (Blanket Blob's Cover is
     * a status with the same shape), so `hooks.actorHooks(defender)` finds it
     * with no new engine surface.
     */
    c.addPower({
      id: 'stitched-together',
      name: 'Stitched Together',
      icon: 'needle',
      desc: `The first ${STITCH_PER_TURN} damage each Kid deals her every round goes into Favorite Doll instead.`,
      hooks: {
        onIncomingHit(h) {
          governess.reinforce(h);
          governess.absorb(h);
        },
      },
    });
  },

  phase(c) { return mem(c).phase || 1; },

  /**
   * Favorite Doll, torn or whole.
   *
   * By DEF id, and across the WHOLE board rather than `allies()`.
   *
   * This read `allies(c).find(a => a.id === 'favorite-doll')`, and an actor's
   * `id` is its board slot — `e1` — while `favorite-doll` is its `defId`. She
   * could therefore never see her own Doll: Stitched Together redirected
   * nothing, Inspect the Nursery never covered it, and Mend My Darling was
   * never once selected in a full simulated fight. `allies()` is living
   * enemies only, so it also could not have found a Torn Doll to mend.
   */
  doll(c) {
    const board = (c.e && c.e.enemies) || [];
    return board.find(a => a.defId === 'favorite-doll') || null;
  },
  dollActive(c) {
    const d = governess.doll(c);
    return !!d && !(d.mem && d.mem.torn) && (d.hp || 0) > 0;
  },

  /**
   * How much of THIS hit the Doll eats. Pure, so a test and the intent preview
   * can both ask without moving anything.
   *
   * @param {Object} c        her enemy ctx
   * @param {number} incoming the post-modifier, pre-Guard damage
   * @param {Object} attacker the Kid swinging, or null
   */
  redirect(c, incoming, attacker = null) {
    if (governess.phase(c) >= 2 || !governess.dollActive(c)) return 0;
    const used = governess.redirectedBy(c, attacker);
    return Math.max(0, Math.min(incoming, STITCH_PER_TURN - used));
  },

  /** This Kid's spent Stitched Together allowance this round. */
  redirectedBy(c, attacker) {
    const key = (attacker && attacker.side === 'player') ? attacker.seat : 'x';
    return (mem(c).redirectedBySeat || {})[key] || 0;
  },

  /**
   * The live half: move the damage into the Doll and take it off the hit.
   * Runs inside `onIncomingHit`, which is the last point before Guard is
   * consulted — the Doll eats the swing before her own Guard sees it.
   */
  absorb(h) {
    const gov = h.owner;
    const e = h.e;
    if (!gov || !e || h.amount <= 0) return;
    const c = e.enemyCtx(gov, null);
    const m = mem(c);
    // The Doll's own hit is dealt from inside this hook. Without the latch it
    // would re-enter and redirect itself.
    if (m._absorbing) return;
    const take = governess.redirect(c, h.amount, h.attacker);
    if (take <= 0) return;

    const key = (h.attacker && h.attacker.side === 'player') ? h.attacker.seat : 'x';
    (m.redirectedBySeat || (m.redirectedBySeat = {}))[key] =
      governess.redirectedBy(c, h.attacker) + take;
    h.setAmount(h.amount - take);

    m._absorbing = true;
    try {
      const d = governess.doll(c);
      // skipModifiers: this number has already been through the whole pipeline
      // once. Running it again would apply Vulnerable and Strength twice.
      e.dealDamage({
        attacker: h.attacker, defender: d, amount: take,
        kind: h.kind || 'attack', cause: 'redirected', skipModifiers: true,
      });
      // Button Patch: she profits from being protected. Capped at 6 Guard per
      // turn — a TEAM cap, because it is her Guard and not a per-Kid allowance.
      if (d && d.mem && (d.mem.patches || []).includes('button-patch')) {
        const gained = m.buttonGuardThisTurn || 0;
        if (gained < 6) { e.gainBlock(gov, 2, { fromCard: false, reason: 'button-patch' }); m.buttonGuardThisTurn = gained + 2; }
      }
    } finally {
      m._absorbing = false;
    }
  },

  /**
   * Reinforced Patch, phase two: the first damaging Trick each round deals 6
   * less. The FIRST HIT, not every hit of a multi-hit Trick — spreading it over
   * three hits of Snip Snip would be an 18-point patch, and the same reasoning
   * the Butler's Reprimand rider settled on applies here.
   *
   * One reduction per ROUND, not per Kid: it is one patch on one dress, and the
   * team can choose who spends it.
   */
  reinforce(h) {
    const gov = h.owner;
    const e = h.e;
    if (!gov || !e || h.amount <= 0) return;
    const c = e.enemyCtx(gov, null);
    if (governess.activePatch(c) !== 'reinforced') return;
    const m = mem(c);
    if (m.reinforcedTurn === e.turn) return;
    m.reinforcedTurn = e.turn;
    h.setAmount(governess.modifyIncoming(c, h.amount, true));
  },

  onPlayerTurnStart(c) {
    // Each Kid's Stitched Together allowance comes back every round.
    mem(c).redirectedBySeat = {};
    mem(c).buttonGuardThisTurn = 0;
  },

  onPlayerTurnEnd(c) {
    if (governess.phase(c) < 2) return;
    // Tearing a Repair Patch: "20 damage per player across the entire team
    // round. All players can contribute." (§35.) `dmgTaken` is already the
    // whole round's damage to her, so only the threshold moves.
    if (dmgTaken(c) >= c.perPlayer(20)) mem(c).patchTorn = true;
    // Stuffed Patch: she recovers if you were too gentle. Scales the same way,
    // or two Kids doing 8 each would count as gentle and hand her the heal.
    if (governess.activePatch(c) === 'stuffed' && dmgTaken(c) < c.perPlayer(12)) c.heal(c.self, 5);
  },

  /**
   * Her Patch cycle turns over after every one of her turns.
   *
   * `advancePatch` existed and nothing called it, so `repair-patch` sat on 0
   * for the whole of phase two and the cycle the fight is built around —
   * Reinforced, then Stuffed, then Buttoned — never happened. Measured over a
   * full simulated fight: the counter finished on 0.
   */
  onTurnEnd(c) { governess.advancePatch(c); },

  /** Active phase-two Repair Patch, or null while torn. Cycle is always the same. */
  activePatch(c) {
    if (governess.phase(c) < 2 || mem(c).patchTorn) return null;
    return REPAIR_PATCHES[cnt(c, 'repair-patch') % REPAIR_PATCHES.length];
  },

  /** Reinforced Patch: the first damaging Trick each turn deals 6 less. */
  modifyIncoming(c, amount, isFirstThisTurn) {
    if (governess.activePatch(c) === 'reinforced' && isFirstThisTurn) return Math.max(0, amount - 6);
    return amount;
  },

  /**
   * Every living Kid except the one this move is aimed at.
   *
   * The seats a declared `splash` is for. `c.player` is the aim and it is fixed
   * when the ctx is built, so this is the honest complement of it — the same
   * helper the Butler carries for Enough of This.
   */
  bystanders(c) {
    const aim = c.player;
    const all = typeof c.players === 'function' ? c.players() : [];
    return all.filter(pl => pl && pl !== aim && pl.alive);
  },

  /** Buttoned Patch: every Guard gain is 4 bigger. */
  gainGuard(c, n) {
    c.block(c.self, n + (governess.activePatch(c) === 'buttoned' ? 4 : 0));
  },

  /** Advance the Patch after every Governess turn. A torn Patch still yields to the next. */
  advancePatch(c) {
    if (governess.phase(c) < 2) return;
    setCnt(c, 'repair-patch', (cnt(c, 'repair-patch') + 1) % REPAIR_PATCHES.length);
    mem(c).patchTorn = false;
  },

  /**
   * Mend My Darling is legal only once EVERY Kid has had a turn with the Doll
   * Torn. See `favoriteDoll.onDeath` for how the window is measured.
   */
  canMend(c) {
    const d = governess.doll(c);
    if (governess.phase(c) >= 2 || !d || !d.mem || !d.mem.torn) return false;
    const until = (d.mem.tornWindowUntil != null) ? d.mem.tornWindowUntil : (d.mem.tornOnTurn || 0);
    return (c.turn || 0) > until;
  },

  moves: {
    // ── phase one ────────────────────────────────────────────────────────────
    'inspect-the-nursery': {
      id: 'inspect-the-nursery', name: 'Inspect the Nursery', intent: Intent.DEFEND, block: 10,
      tell: 'She runs a finger along a shelf and looks at it for a long moment.',
      effect(c) {
        c.block(c.self, 10);
        const d = governess.doll(c);
        if (d && !d.mem?.torn) c.block(d, 8);
      },
    },
    'sharp-correction': {
      /**
       * MULTIPLAYER: single-target on purpose, and aimed at the Kid closest to
       * breaking. §29 is the Nursery's own authored preference for a
       * telegraphed pick — Jack in the Box "prefers the player with the lowest
       * percentage Courage. The target is shown clearly before players act."
       *
       * `lowestCourage` and not `lowestGuard` for the reason CONTRACTS records
       * under `partyPick`: a preference computed from state the player controls
       * cannot both track that state and stay still, and Guard is wiped at the
       * start of every turn. Courage is not something a Kid can move inside the
       * turn they are shown the arrow, so the arrow holds still by itself.
       */
      /**
       * IN A PARTY IT IGNORES GUARD, and that is the whole co-op fight.
       *
       * Measured, with `tests/critic-design/party-ledger.py`: at four Kids she
       * AIMED 565 Courage over a fight and landed 94, because the party's Guard
       * ate 83% of it. Guard scales with the party and enemy damage deliberately
       * does not, so a table of four generates Guard far faster than any boss
       * can spend it — party Guard reached 2275 against her 565. Coverage does
       * not fix that: AoE was authored onto her first and measured twice, and
       * the leftover-Courage gap did not move (100% wins -> 87.5%, 90% left ->
       * 89%).
       *
       * The Butler is the controlled comparison and the precedent. He aims LESS
       * at four Kids (404) and lands nearly twice as much (173), and the only
       * relevant difference is that two of his Reprimands bypass or remove
       * Guard. So "targeting is the compensation for damage not scaling"
       * (foyer §26) is necessary and not sufficient — targeting is answered by
       * Guard.
       *
       * This move, and not one of the others, because it is the one that
       * already picks the Kid closest to breaking. Piercing turns the party's
       * decision from "stack Guard" into "nobody may be the lowest", which is
       * what §26 asks a cooperative version to do — *"change tactical
       * relationships"* — and it is what a sharp correction from a governess
       * with silver needles for fingers has always meant. It is shown a turn
       * ahead like everything else, so the counterplay is healing and
       * distribution rather than blocking.
       *
       * SOLO IS UNTOUCHED, on purpose: solo already reads 62.5% at 11 turns,
       * inside the 45-65% and 8-12 bands. Piercing it solo was measured too and
       * took solo leftover Courage 60% -> 40%, which is a fight that does not
       * need fixing.
       */
      id: 'sharp-correction', name: 'Sharp Correction', intent: Intent.ATTACK, damage: 24, hits: 1,
      partyPick: 'lowestCourage',
      pierceFn: (c) => c.partySize() > 1,
      tell: 'Her needles come together with a small, tidy click.',
      damageFn: (c) => 24 + bossDmg(c),
      effect(c) {
        c.damage(24 + bossDmg(c), { pierce: c.partySize() > 1 });
      },
    },
    'mind-your-seams': {
      /**
       * MULTIPLAYER: phase one's AoE. She takes in a seam on EVERY child.
       *
       * §35 covers the Doll's Courage, Stitched Together's per-Kid allowance
       * and the repair windows, and says nothing about how her own attacks find
       * a target — so this follows the region's own precedents: §31 sends
       * Gallop at "all players" once the Rocking Horse is excited, restating
       * the damage per head; §27 says "individual enemy attack damage generally
       * remains close to solo values. Mechanics change to account for multiple
       * players."
       *
       * Measured before this existed: she has no targeting at all, and an enemy
       * with no `partyPick` rolls ONE seat at the start of the fight and holds
       * it (`engine.intentTargetFor`). So at four Kids she fought one Kid for
       * eighteen turns while three stood untouched and hit her freely — 100%
       * player wins, nobody ever falling, 90% of the party's Courage left, at
       * n=16, against a solo 62.5% at 11 turns.
       *
       * 12x2 EACH, and the number does not come down.
       *
       * The Butler's Dust Them Off trades per-head damage for coverage (5x2 to
       * 3x2) and that is right for HIM: it comes up every third turn of phase
       * one, so at four Kids the full number put the party under pressure every
       * round and measured 0% wins. Hers comes up once in four turns and only
       * in phase one. The reduced version was tried first and measured — at
       * n=16 it moved four Kids from 100% wins to 93.8% and their leftover
       * Courage from 90% to 87%, against a solo 62.5% and 56%. Which is to say
       * it did nothing: her per-head number after the cut was small enough that
       * four Kids' Guard simply ate it.
       *
       * So this follows §27 literally instead — "individual enemy attack damage
       * generally remains close to solo values. Mechanics change to account for
       * multiple players." The mechanic that changed is who it lands on.
       */
      id: 'mind-your-seams', name: 'Mind Your Seams', intent: Intent.ATTACK_DEBUFF, damage: 12, hits: 2,
      partyTarget: 'all',
      tell: 'She takes in a seam somewhere on you that you did not know you had.',
      applies: [{ id: 'seam-pinch', stacks: 1, to: 'player' }],
      damageFn: (c) => 12 + bossDmg(c),
      hitsFn: () => 2,
      effect(c) {
        hitPlayer(c, 12 + bossDmg(c), 2);
        /**
         * Every seat the damage reached, not `c.player`.
         *
         * `c.player` is the aimed seat and it is computed ONCE when the ctx is
         * built, so on an AoE move the damage goes to everybody and a status
         * hung on `c.player` lands on one Kid — the Pinched Seam would arrive
         * on a single child while all four took the hit. `c.targets()` is the
         * seats this move actually lands on, whatever it declares.
         */
        for (const pl of c.targets()) c.applyStatus(pl, 'seam-pinch', 1);
      },
    },
    'mend-my-darling': {
      id: 'mend-my-darling', name: 'Mend My Darling', intent: Intent.BUFF,
      tell: 'She gathers the Doll into her lap and begins, patiently, to put it back.',
      effect(c) {
        const d = governess.doll(c);
        if (d) {
          const bonus = (d.mem.patches || []).includes('lace-patch') ? 6 : 0;
          d.mem.torn = false;
          d.mem.tornWindowUntil = null;      // a second tearing measures its own window
          d.alive = true;
          d.hp = Math.min(d.maxHp, 28 + bonus);
        }
        c.block(c.self, 6);
      },
    },

    // ── transition ───────────────────────────────────────────────────────────
    'look-what-youve-done': {
      id: 'look-what-youve-done', name: "Look What You've Done", intent: Intent.BUFF,
      tell: 'She looks at the Doll. Then at you. Then she starts taking the Doll apart herself.',
      phaseTransition: 2,
      effect(c) {
        const d = governess.doll(c);
        if (d) {
          d.mem = d.mem || {};
          d.mem.torn = true;
          d.mem.permanent = true;
          d.alive = false;
          d.hp = 0;
          c.despawn(d);
        }
        mem(c).phase = 2;
        setCnt(c, 'repair-patch', 0);
        mem(c).patchTorn = false;
      },
    },

    // ── phase two ────────────────────────────────────────────────────────────
    'needle-point': {
      id: 'needle-point', name: 'Needle Point', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'One long silver finger, held perfectly level.',
      damageFn: (c) => 13 + (mem(c).tightened ? 5 : 0) + bossDmg(c),
      effect(c) {
        hitPlayer(c, 13 + (mem(c).tightened ? 5 : 0) + bossDmg(c));
        mem(c).tightened = false;
      },
    },
    'tighten-the-stitch': {
      /**
       * BALANCE 2026-08-20: this was `DEFEND_BUFF`, 13 Guard and no damage — one turn in
       * every four of phase two where a competent player could block nothing and spend the
       * whole hand on her. A wasted enemy turn against a deck that can convert energy to
       * Guard on demand is worth more to the player than the Guard is worth to her, and it
       * was the single largest reason 85% of her printed damage never landed. The thread
       * she is drawing tight is the seam Mind Your Seams took in on YOU, so it hurts.
       */
      /**
       * MULTIPLAYER: one thread, and it goes through everybody.
       *
       * The tell already says so — "through herself, and through you" — and in
       * a nursery full of children the thread does not stop at the first one.
       * A DECLARED `splashFn`, because CONTRACTS is explicit that a move whose
       * main number belongs to one Kid while other seats also take damage must
       * declare it or the intent lies to every seat with no arrow.
       *
       * This is PHASE TWO'S ONLY AoE, and phase two is the longer half — the
       * cycle is Needle Point, Tighten the Stitch, Snip Snip, Needle Point, and
       * without this the other three touch at most two Kids. 10 and not the
       * Butler's 6 for that reason: his splash sits beside a phase-two move
       * that already hits everybody, and hers does not.
       */
      id: 'tighten-the-stitch', name: 'Tighten the Stitch', intent: Intent.ATTACK_DEFEND,
      damage: 17, hits: 1, block: 13,
      tell: 'She pulls a thread through herself, and through you, and draws it tight.',
      damageFn: (c) => 17 + bossDmg(c),
      splashFn: (c) => (c.partySize() > 1 ? 10 : 0),
      blockFn: (c) => 13 + (governess.activePatch(c) === 'buttoned' ? 4 : 0),
      effect(c) {
        hitPlayer(c, 17 + bossDmg(c));
        for (const pl of governess.bystanders(c)) c.damage(pl, 10);
        governess.gainGuard(c, 13);
        mem(c).tightened = true;
      },
    },
    'snip-snip': {
      /**
       * MULTIPLAYER: three quick cuts, across two children.
       *
       * §33 is the precedent and it is the same gesture: the Porcelain Doll's
       * Sharp Little Hands "can target two different players" once Shattered,
       * "if only one player remains available, both hits target that player" —
       * which is exactly what `partyTarget: 'two'` does.
       *
       * 11x3 to each, per §27 — the number stays at its solo value and the
       * change is who it reaches. Two seats is the coverage; cutting the number
       * as well was tried and measured nothing (see Mind Your Seams).
       */
      id: 'snip-snip', name: 'Snip Snip', intent: Intent.ATTACK, damage: 11, hits: 3,
      partyTarget: 'two',
      tell: 'Three quick cuts, the way one trims a loose thread.',
      damageFn: (c) => 11 + bossDmg(c),
      hitsFn: () => 3,
      effect(c) { hitPlayer(c, 11 + bossDmg(c), 3); },
    },
    'emergency-repair': {
      id: 'emergency-repair', name: 'Emergency Repair', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'She stops fighting entirely and repairs herself, which she finds humiliating.',
      blockFn: (c) => 8 + (governess.activePatch(c) === 'buttoned' ? 4 : 0),
      effect(c) {
        c.heal(c.self, 10);
        governess.gainGuard(c, 8);
        mem(c).emergencyRepairs = (mem(c).emergencyRepairs || 0) + 1;
        mem(c).lastEmergencyCycle = mem(c).cycle;
      },
    },
  },

  nextMove(c) {
    const hp = c.self.hp ?? 0;
    const hist = c.history || [];

    if (governess.phase(c) === 1 && hp <= phaseAt(c, PHASE2_AT, BASE_HP) && !hist.includes('look-what-youve-done')) {
      return 'look-what-youve-done';
    }

    if (governess.phase(c) === 1) {
      const p1 = ['inspect-the-nursery', 'sharp-correction', 'mind-your-seams', 'sharp-correction'];
      const i = countMoves(c, p1.concat('mend-my-darling'));
      const planned = cyc(p1, i);
      // "Mend My Darling replaces the next Inspect the Nursery."
      if (planned === 'inspect-the-nursery' && governess.canMend(c)) return 'mend-my-darling';
      return planned;
    }

    // Phase two: Needle Point, Tighten the Stitch, Snip Snip, Needle Point, then check
    // Emergency Repair. Twice per combat, never on consecutive cycles, and only when
    // there is actually something to repair.
    const p2 = ['needle-point', 'tighten-the-stitch', 'snip-snip', 'needle-point'];
    const acted = countMoves(c, p2);
    const cycle = Math.floor(acted / p2.length);
    if (acted > 0 && acted % p2.length === 0) {
      const used = countMoves(c, 'emergency-repair');
      const missing = (c.self.maxHp || 0) - (c.self.hp || 0);
      const last = lastEmergency(c);
      // Twice per combat, never on back-to-back cycles, and only when it would do something.
      if (used < 2 && last !== cycle && last !== cycle - 1 && missing >= 15) return 'emergency-repair';
    }
    return cyc(p2, acted);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.notes.push('Haunt 10: Favorite Doll carries two Patches instead of one (see favorite-doll).');
    }
    return h;
  },
};

/** Which cycle Emergency Repair last fired on. Kept pure for nextMove. */
function lastEmergency(c) {
  const h = c.history || [];
  const i = h.lastIndexOf('emergency-repair');
  if (i < 0) return -Infinity;
  const p2 = ['needle-point', 'tighten-the-stitch', 'snip-snip', 'needle-point'];
  const before = h.slice(0, i).filter(m => p2.includes(m)).length;
  return Math.floor(before / p2.length);
}

export const NURSERY_BOSSES = [governess, favoriteDoll];
