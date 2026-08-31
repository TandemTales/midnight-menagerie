/**
 * The Lamplighter — the Lampworks boss. OWNER: enemies.
 * Source of truth: docs/design/regions/09-lampworks.md §16–§33.
 *
 * "The Lamplighter believes darkness is inherently unsafe. Everything should be
 * illuminated. Everything should be visible. EVERYTHING SHOULD REMAIN WHERE IT
 * CAN BE WATCHED. Its philosophy is: nothing bad can happen if the lights never
 * go out." (§16.)
 *
 * The fourth jailer in a row whose cruelty is a safety measure, and the one
 * whose obsession finally turns on itself: §33 lets it CREATE darkness when
 * keeping everything lit has failed.
 *
 * ── THE LAMP ROW IS FIVE REAL ACTORS ────────────────────────────────────────
 *
 * §18: the Lamps "are targetable battlefield objects", 10 Courage each, and
 * "DAMAGE DEALT TO LAMPS DOES NOT DAMAGE THE LAMPLIGHTER" — which is true for
 * free once they are separate actors, and impossible to get right any other
 * way. They are `bossPart`s in the boss formation, exactly like the Wardrobe's
 * Doors and the Blanket Hydra's Heads.
 *
 * WHICH MEANS THE PART-LOOKUP TRAP APPLIES. The engine names actors `e0`, `e1`,
 * `e2` and puts the definition's id on `defId`. `allies(c).find(a => a.id ===
 * 'lamp')` resolves to nothing in every real fight, and four multi-body enemies
 * shipped broken that way before `tests/part-lookups/check.py` existed. Every
 * lookup here is `defId`.
 *
 * ── PHASE ONE IS A BUDGET, NOT A PUZZLE ─────────────────────────────────────
 *
 * §18 states the decision plainly: "the player is deciding whether to spend
 * offense controlling the energy network." §24 then closes the obvious exploit —
 * three or more Broken Lamps and the boss starts rebuilding instead of
 * attacking, so razing the row is a real plan that costs the boss tempo rather
 * than a way to switch the mechanic off. And §26 makes the whole phase matter
 * twice: every Charge still in the row at the transition becomes Stored Flame.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, field, dmgTaken, isAlive,
} from '../enemies/_lib.js';
import { killTheLights, bringUpTheLights } from '../enemies/lampworks.js';

const REGION = 'lampworks';
const SOLO_MAX = 365;
const PHASE_TWO_AT = 210;
const LAST_LIGHT_AT = 80;

/* ══ one Lamp ════════════════════════════════════════════════════════════════ */
/**
 * §17: "Each Lamp can hold up to 2 Charge. 0 is Dark, 1 is Lit, 2 is Bright."
 *
 * It never acts. `Intent.SLEEP` is what the Wardrobe's Doors use for exactly
 * this — a body on the board that is a target and a state and nothing else.
 */
export const lamp = {
  id: 'lamp',
  /* SHORT ON PURPOSE. The name plate is the widest part of a body on the
     enemy row and this row is six of them; 'Hanging Lamp' five times over
     is a third of the screen. 'Lamp' is the same object and half the plate. */
  name: 'Lamp',
  region: REGION,
  tier: 'boss',
  role: 'bossPart',
  partOf: 'the-lamplighter',
  hp: [10, 10],
  silhouette: 'hanging-lamp',
  palette: ['#f2d99a', '#fff6dc', '#2a2211'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.45,
  lore: 'One of hundreds, hung on a chain at head height, burning something that is not oil.',

  onSpawn(c) { setCnt(c, 'charge', 0); },

  moves: {
    hang: {
      id: 'hang', name: 'Dark', intent: Intent.SLEEP,
      tell: 'Empty. It gives the Lamplighter nothing.',
      effect() {},
    },
    burn: {
      id: 'burn', name: 'Lit', intent: Intent.SLEEP,
      tell: 'One Charge. It gives the Lamplighter 1 Light on its turn.',
      effect() {},
    },
    blaze: {
      id: 'blaze', name: 'Bright', intent: Intent.SLEEP,
      tell: 'Full. It gives the Lamplighter 2 Light, and it counts toward Flashpoint.',
      effect() {},
    },
  },
  nextMove: (c) => ['hang', 'burn', 'blaze'][Math.max(0, Math.min(2, cnt(c, 'charge')))],

  hauntScaling(level) { return hauntBase(level, 'boss'); },
};

/** Every Lamp still standing. `defId`, never `id` — see the header. */
function lamps(c) {
  return allies(c).filter(a => a.defId === 'lamp' && isAlive(a));
}

/** §19: each Lit Lamp gives 1 Light, each Bright 2. Light lasts one enemy turn. */
function lightOf(c) {
  if (mem(c).phase === 2) return 0;
  return lamps(c).reduce((n, a) => n + Math.min(2, a.counters?.charge || 0), 0);
}

/** Stored Flame, phase two's resource (§27). */
const flame = (c) => cnt(c, 'stored');

/* ══ the boss ════════════════════════════════════════════════════════════════ */
export const lamplighter = {
  id: 'the-lamplighter',
  name: 'The Lamplighter',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'lamplighter',
  palette: ['#3a3326', '#f0d99a', '#14110b'],
  shape: { body: 'tall-thin', limbs: 3, eyes: 1 },
  scale: 1.9,
  lore: 'A tall figure in a maintenance coat with an antique lantern for a head. The small blue flame inside the glass is almost a face. The lighting pole is longer than the room.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.broken = 0;
    m.snuffed = false;
    setCnt(c, 'stored', 0);
    /* Haunt 10: "begins phase one with two Lamps already Lit and one Bright.
       Their locations are VISIBLE before the player acts." */
    const open = flag(c, 'openLamps', null);
    if (open) {
      const row = lamps(c);
      for (let i = 0; i < row.length; i++) {
        const want = open[i] || 0;
        if (want) (row[i].counters ||= {}).charge = want;
      }
    }
    announceRow(c);
  },

  onPlayerTurnStart(c) { mem(c).snuffed = false; },

  /**
   * §29's Snuff Stored Flame, and §32's Last Light.
   *
   * Scored at the end of the player turn — where the damage total is readable —
   * and it does not touch any number an already-drawn intent promised: Stored
   * Flame is SPENT by moves rather than added to them passively (§27 is explicit
   * that it "does nothing passively"), so removing one cannot contradict an
   * intent the way Certainty could.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (m.phase !== 2 || m.snuffed || dmgTaken(c) < 22) return;
    m.snuffed = true;
    if (m.sealed) { m.sealed = false; c.say('The lantern is sealed.', 'warn'); return; }
    if (flame(c) <= 0) {
      c.applyStatus(c.self, 'flickering', 1, { fresh: true });
      announceRow(c);
      return;
    }
    addCnt(c, 'stored', -1, 10, 0);
    // §32: below 80 Courage, suppressing its energy damages it directly.
    if (m.lastLight) c.loseHp(c.self, 3);
    announceRow(c);
  },

  /**
   * §24's Replace the Bulb trigger, and §32's threshold, both checked at the
   * end of its own turn so the next intent is drawn from the settled board.
   */
  onTurnEnd(c) {
    const m = mem(c);
    m.broken = 5 - lamps(c).length;
    if (!m.lastLight && m.phase === 2 && c.self.hp <= phaseAt(c, LAST_LIGHT_AT, SOLO_MAX)) {
      m.lastLight = true;
      c.announceRule({
        id: `last:${c.self.id}`,
        name: 'Last Light',
        text: 'Every Stored Flame you snuff now costs it 3 Courage as well — and every one it spends itself buys it 3 Guard.',
      });
      c.say('The last light. Keep it.', 'warn');
    }
    announceRow(c);
  },

  /** §33: Blackout makes it 20% more fragile while it lasts. */
  damageTakenMul(c) { return field(c).blackout && mem(c).madeDark ? 1.2 : 1; },

  moves: {
    /* ── phase one (§20) ──────────────────────────────────────────────────── */
    'light-two-lamps': {
      id: 'light-two-lamps', name: 'Light Two Lamps', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'The pole reaches two of them without the figure moving at all.',
      effect(c) {
        c.block(c.self, 5);
        // "Prefer Lamps with 0 Charge."
        const row = lamps(c).filter(a => (a.counters?.charge || 0) < 2);
        row.sort((x, y) => (x.counters?.charge || 0) - (y.counters?.charge || 0));
        for (const a of row.slice(0, 2)) (a.counters ||= {}).charge = Math.min(2, (a.counters.charge || 0) + 1);
        announceRow(c);
      },
    },
    'lamp-pole': {
      id: 'lamp-pole', name: 'Lamp Pole', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + lightOf(c) + bossDmg(c),
      tell: 'The long end of the pole, from further away than it should reach.',
      effect(c) { hitPlayer(c, 10 + lightOf(c) + bossDmg(c)); },
    },
    'sweep-the-hall': {
      id: 'sweep-the-hall', name: 'Sweep the Hall', intent: Intent.ATTACK, damage: 4, hits: 2,
      damageFn: (c) => 4 + bossDmg(c),
      hitsFn: (c) => (lightOf(c) >= 5 ? 3 : 2),
      tell: 'It sweeps the pole down the length of the hall.',
      effect(c) { hitPlayer(c, 4 + bossDmg(c), lightOf(c) >= 5 ? 3 : 2); },
    },
    'tend-the-flame': {
      id: 'tend-the-flame', name: 'Tend the Flame', intent: Intent.BUFF,
      blockFn: (c) => (lamps(c).some(a => (a.counters?.charge || 0) < 2) ? 0 : 12),
      tell: 'It gives one lamp its full attention.',
      effect(c) {
        const row = lamps(c).filter(a => (a.counters?.charge || 0) < 2);
        if (!row.length) { c.block(c.self, 12); return; }
        // "the Lamp with the HIGHEST Charge that is not already Bright"
        let pick = row[0];
        for (const a of row) if ((a.counters?.charge || 0) > (pick.counters?.charge || 0)) pick = a;
        (pick.counters ||= {}).charge = Math.min(2, (pick.counters.charge || 0) + 1);
        announceRow(c);
      },
    },
    'replace-the-bulb': {
      id: 'replace-the-bulb', name: 'Replace the Bulb', intent: Intent.SUMMON,
      tell: 'It takes a fresh lamp off its own back and hangs it up.',
      effect(c) {
        /* §24: three or more Broken Lamps and Tend the Flame becomes this
           instead. "This prevents the optimal solution from always being
           destroy every Lamp immediately. The player can still do that, but The
           Lamplighter spends tempo rebuilding the system." */
        const made = c.summon('lamp');
        if (made) (made.counters ||= {}).charge = 1;
        announceRow(c);
      },
    },
    'extinguish-you': {
      id: 'extinguish-you', name: 'Extinguish You', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      damageFn: (c) => 7 + bossDmg(c),
      appliesFn: (c) => (lightOf(c) >= 6 ? [{ id: 'dimmed', stacks: 1, to: 'player' }] : []),
      tell: 'It turns the lantern head toward you specifically.',
      effect(c) {
        const bright = lightOf(c) >= 6;
        hitPlayer(c, 7 + bossDmg(c));
        if (bright) {
          c.player._dimSpent = false;
          c.applyStatus(c.player, 'dimmed', 1);
        }
      },
    },
    flashpoint: {
      id: 'flashpoint', name: 'Flashpoint', intent: Intent.ATTACK_BIG, damage: 22, hits: 1,
      damageFn: (c) => 22 + bossDmg(c),
      tell: 'Every lamp on the row goes to white at once.',
      effect(c) {
        hitPlayer(c, 22 + bossDmg(c));
        c.block(c.self, 15);
        // "Then every Bright Lamp loses 1 Charge." — the reset the player may
        // deliberately buy rather than spending damage on the row forever.
        for (const a of lamps(c)) {
          if ((a.counters?.charge || 0) >= 2) a.counters.charge -= 1;
        }
        announceRow(c);
      },
    },

    /* ── the transition (§26) ─────────────────────────────────────────────── */
    'one-light-is-enough': {
      id: 'one-light-is-enough', name: 'One Light Is Enough', intent: Intent.BUFF, anchored: true,
      tell: 'It reaches up and takes all of it back.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        // "Every remaining Charge is absorbed. Stored Flame equal to the number
        // of Charge absorbed. Maximum 10." How well phase one went, priced.
        let taken = 0;
        for (const a of lamps(c)) {
          taken += Math.min(2, a.counters?.charge || 0);
          c.despawn(a);
        }
        setCnt(c, 'stored', Math.min(10, taken));
        c.say('One light is enough. I will hold it myself.', 'warn');
        announceRow(c);
      },
    },

    /* ── phase two (§28) ──────────────────────────────────────────────────── */
    'gather-the-sparks': {
      id: 'gather-the-sparks', name: 'Gather the Sparks', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'It collects what is loose in the air.',
      effect(c) { c.block(c.self, 9); addCnt(c, 'stored', 2, 10, 0); announceRow(c); },
    },
    'burning-pole': {
      id: 'burning-pole', name: 'Burning Pole', intent: Intent.ATTACK, damage: 13, hits: 1,
      damageFn: (c) => 13 + (flame(c) >= 4 ? 6 : 0) + bossDmg(c),
      tell: 'The pole is alight along its whole length.',
      effect(c) {
        const big = flame(c) >= 4;
        const d = 13 + (big ? 6 : 0) + bossDmg(c);
        if (big) { addCnt(c, 'stored', -2, 10, 0); if (mem(c).lastLight) c.block(c.self, 6); }
        hitPlayer(c, d);
        announceRow(c);
      },
    },
    'lantern-burst': {
      id: 'lantern-burst', name: 'Lantern Burst', intent: Intent.ATTACK_BIG, damage: 6, hits: 1,
      damageFn: (c) => 6 + 4 * Math.min(4, flame(c)) + bossDmg(c),
      tell: 'The glass opens on a hinge you did not know was there.',
      effect(c) {
        const spend = Math.min(4, flame(c));
        const d = 6 + 4 * spend + bossDmg(c);
        addCnt(c, 'stored', -spend, 10, 0);
        if (mem(c).lastLight && spend) c.block(c.self, 3 * spend);
        hitPlayer(c, d);
        announceRow(c);
      },
    },
    'trail-of-fire': {
      id: 'trail-of-fire', name: 'Trail of Fire', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + bossDmg(c),
      tell: 'It walks, and the floor keeps burning where it went.',
      effect(c) {
        const before = c.player.hp;
        hitPlayer(c, 5 + bossDmg(c), 2);
        const through = before - c.player.hp;
        // "Gain 1 Stored Flame for each hit that deals Courage damage. Max 2."
        const per = Math.max(1, 5 + bossDmg(c));
        addCnt(c, 'stored', Math.min(2, Math.floor(through / per)), 10, 0);
        announceRow(c);
      },
    },
    'seal-the-lantern': {
      id: 'seal-the-lantern', name: 'Seal the Lantern', intent: Intent.DEFEND, block: 16,
      tell: 'It closes the glass and holds it closed.',
      effect(c) {
        c.block(c.self, 16);
        mem(c).sealed = true;
        announceRow(c);
      },
    },
    'everything-goes-dark': {
      id: 'everything-goes-dark', name: 'Everything Goes Dark', intent: Intent.STRONG_DEBUFF,
      applies: [{ id: 'unlit', stacks: 1, to: 'allies' }],
      tell: 'It has nothing left to burn, so it stops pretending.',
      effect(c) {
        /* §33, and the best beat in the fight: the thing that believes nothing
           bad can happen while the lights are on turns them off itself. */
        mem(c).madeDark = true;
        mem(c).usedDark = true;
        killTheLights(c, 'start');
        addCnt(c, 'stored', 3, 10, 0);
        c.say('…fine. Let it be dark.', 'warn');
        announceRow(c);
      },
    },
  },

  onDeath(c) { if (mem(c).madeDark) bringUpTheLights(c); },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'one-light-is-enough';

    if (m.phase === 2) {
      // §33: once per fight, at 0 Stored Flame, it makes the darkness itself.
      if (!m.usedDark && flame(c) === 0) return 'everything-goes-dark';
      return cyc(['gather-the-sparks', 'burning-pole', 'trail-of-fire', 'lantern-burst', 'seal-the-lantern'],
        (c.history || []).filter(x => x !== 'everything-goes-dark').length);
    }

    // §23: a full row overrides the pattern entirely.
    const row = lamps(c);
    if (row.length && row.every(a => (a.counters?.charge || 0) >= 2)) return 'flashpoint';

    const beat = cyc(['light-two-lamps', 'lamp-pole', 'tend-the-flame', 'sweep-the-hall', 'extinguish-you'],
      (c.history || []).length);
    // §24: with three or more Broken, Tend the Flame becomes Replace the Bulb.
    if (beat === 'tend-the-flame' && row.length <= 2) return 'replace-the-bulb';
    return beat;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openLamps = [1, 1, 2, 0, 0];
      h.notes.push('Haunt 10: it opens with two Lamps Lit and one Bright, all of them visible first.');
    }
    return h;
  },
};

function announceRow(c) {
  const m = mem(c);
  if (m.phase === 2) {
    c.announceRule({
      id: `lamp:${c.self.id}`,
      name: `Stored Flame ${flame(c)} / 10`,
      text: 'It does nothing on its own — its moves SPEND it. Lantern Burst is 6 damage plus 4 per Flame spent. '
        + `Deal it 22 in one turn to snuff one; at zero, snuff it anyway and its next attack deals 5 less.`
        + (m.sealed ? ' The lantern is SEALED: the next snuff does nothing.' : ''),
    });
    return;
  }
  const row = lamps(c);
  const state = row.map(a => ['Dark', 'Lit', 'Bright'][Math.min(2, a.counters?.charge || 0)]).join(' · ');
  const light = lightOf(c);
  c.announceRule({
    id: `lamp:${c.self.id}`,
    name: `Lamp Row — ${state || 'all Broken'}  (Light ${light})`,
    text: `Each Lit Lamp gives it 1 Light on its turn and each Bright gives 2; Lamp Pole is 10 plus Light. `
      + 'Lamps have 10 Courage of their own and hitting them does NOT hurt the Lamplighter. '
      + 'Fill every Lamp and it uses Flashpoint for 22 — which also empties them. '
      + 'Break three and it starts rebuilding instead of attacking. '
      + 'Whatever Charge is still hanging at 210 Courage becomes its Stored Flame.',
  });
}

export const LAMPWORKS_BOSSES = [lamplighter, lamp];
