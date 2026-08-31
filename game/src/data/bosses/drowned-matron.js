/**
 * The Drowned Matron — Bathhouse boss. OWNER: enemies.
 * Source of truth: docs/design/regions/14-bathhouse.md §17–§34, §44–§50.
 *
 * "She is not presented as a drowned corpse. Her visual design should remain
 * spectral and storybook rather than horrific." Her philosophy is §17's:
 *
 *     You may leave when you are calm enough to know what is good for you.
 *
 * "That is the problem. She appoints herself the one who decides when that is."
 *
 * ── TWO PHASES, TWO METERS, AND NEITHER HAS A CORRECT SETTING ───────────────
 *
 * Phase one is WEATHER on the region's own three-state cycle, announced a full
 * turn ahead (§22), with a Drain the player can break to cancel it. Phase two
 * replaces Weather with WATER LEVEL and gives the player two valves — one that
 * raises it and one that lowers it.
 *
 * §31 is explicit that there is "deliberately no universally best Water Level",
 * and the numbers below are what make that true rather than a claim:
 *
 *   0  Drained    she takes 15% more — and Bath Key hits for 18 instead of 15
 *   1  Ankle      nothing
 *   2  Waist      BOTH sides gain 2 more Guard — and Tidal Sweep hits for 13
 *   3  Submerged  she gains 7 Guard a turn and your first Trick costs 1 more —
 *                 but Undertow and Tidal Sweep both get weaker
 *
 * A damage deck wants 0 and has to survive Bath Key there. A Guard deck wants 2
 * and is feeding her Guard to get it. Nobody wants 3 except the player who has
 * worked out that 3 is where her two multi-hit attacks stop hurting.
 *
 * ── CALM IS NOT A METER YOU KEEP AT ZERO ────────────────────────────────────
 *
 * §26 says so in as many words: "The player is not expected to keep Calm at
 * zero. Sometimes a setup turn that gives the Matron Calm is strategically
 * correct. The mechanic asks whether the player can TOLERATE the future
 * consequence." A turn spent breaking a valve is a turn she reads as
 * cooperation, and that is the trade the fight is about.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, field, lastMove,
} from '../enemies/_lib.js';
import {
  weather, prepareWeather, openWeather, soak, wx, announceWeather,
} from '../enemies/bathhouse.js';

const REGION = 'bathhouse';

const LEVELS = ['Drained', 'Ankle Deep', 'Waist Deep', 'Submerged'];

/* ══ the battlefield objects ════════════════════════════════════════════════ */

/**
 * §23's Drain and §29's two Valves. All three are real actors with real
 * Integrity, because all three are things the player spends a turn's damage on
 * instead of spending it on the boss — which is the decision §26 is about.
 *
 * `onDeath` writes a plain flag into the Matron's mem and nothing else. `mem`
 * is JSON round-tripped, so a function stored there comes back null.
 */
function fixture(id, name, hp, lore, tell, flagKey, guarded) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart', summonOnly: true,
    hp: [hp, hp],
    silhouette: id,
    palette: ['#7d8a91', '#b9c6cc', '#171d21'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.4,
    lore,
    /* §23: "The Drain cannot be attacked during the turn immediately after
       repairing. This prevents constant Weather cancellation." The cooldown was
       a number the Matron wrote and nothing read until this. */
    isTargetable: guarded ? (c) => {
      const matron = allies(c).find(a => a.defId === 'drowned-matron' && isAlive(a));
      return !(matron && (matron.mem || {}).drainCooldown > 0);
    } : undefined,
    onDeath(c) {
      const matron = allies(c).find(a => a.defId === 'drowned-matron' && isAlive(a));
      if (!matron) return;
      const m = (matron.mem ||= {});
      m[flagKey] = (m[flagKey] || 0) + 1;
    },
    moves: { hold: { id: 'hold', name: 'Fitted', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'boss'); },
  };
}

export const bathDrain = fixture('bath-drain', 'The Drain', 18,
  'A brass grate in the middle of the floor. Everything in the room is running toward it.',
  'Break it and the Weather cancels for a turn.', 'drainBroken', true);

export const drainValve = fixture('drain-valve', 'Drain Valve', 14,
  'A wheel valve, painted blue, seized with lime.',
  'Break it and the water drops a level.', 'valveDown');

export const intakeValve = fixture('intake-valve', 'Intake Valve', 14,
  'A wheel valve, painted red, and warm to the touch.',
  'Break it and the water rises a level.', 'valveUp');

/* ══ the Matron ═════════════════════════════════════════════════════════════ */
export const drownedMatron = {
  id: 'drowned-matron',
  name: 'The Drowned Matron',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [425, 425],
  silhouette: 'matron',
  palette: ['#3d5560', '#9fc0cc', '#0d1417'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  /* 1.55 and not 1.7. At 1.7 beside the Drain her name plate and Courage bar
     sat behind the card hand — the screenshot showed her name and about a
     third of the bar. A boss whose Courage cannot be read is a boss whose
     phase thresholds are invisible. */
  scale: 1.55,
  lore: 'A tall supernatural caretaker in an old fashioned bathhouse uniform. Her clothes drip even when the room is dry, and her hair floats around her as though she were underwater.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.phaseStart = 0;
    m.drainBroken = 0;
    m.valveUp = 0;
    m.valveDown = 0;
    m.drainCooldown = 0;
    setCnt(c, 'calm', 0);
    setCnt(c, 'water', 1);
    field(c).weather = 'rain';
    c.applyStatus(c.player, 'weather-rain', 1, { fresh: true });
    c.summon('bath-drain');
    announceMatron(c);
  },

  /**
   * §25's Calm, settled HERE rather than at `onPlayerTurnEnd`.
   *
   * Calm 3 adds 2 to her attacks and Calm 4 replaces her whole next move, and
   * both of those are things the player has already been shown by the time the
   * enemy phase starts. Resolved at the end of the player's turn, Calm 4 rerouted
   * a committed Towel Snap into a heal — `tests/enemies/audit.py` scored it as
   * "promised 10 got 0" thirty-three times. Measured at the top of the turn, the
   * meter, the move and the number all agree.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    const before = m.hpAtStart;
    const toHer = (before ?? c.self.hp) - c.self.hp;
    if (before != null) {
      if (toHer >= flag(c, 'calmBreak', 18)) addCnt(c, 'calm', -1, 4, 0);
      else if (toHer < 8) addCnt(c, 'calm', 1, 4, 0);
    }
    m.hpAtStart = c.self.hp;
    if (m.drainCooldown) m.drainCooldown -= 1;
    /* §25: "At 4, the next move becomes There, Much Better." Settled into a
       flag so the line-cut is committed with everything else. */
    m.soothe = cnt(c, 'calm') >= 4 ? 1 : 0;
    checkPhase(c);
    if (m.phase === 1) openMatronWeather(c);
    else openWater(c);
    announceMatron(c);
  },

  onAllyDeath(c) {
    /* §23 and §29 both want the effect the MOMENT the fixture goes, and both
       are player-driven: the intent that changes is one the player just changed
       on purpose. */
    consumeFixtures(c);
    announceMatron(c);
  },

  onTurnStart(c) {
    soak(c);
    /* §21 Flood and §28 Submerged, the two states that hand her Guard. */
    if (mem(c).phase === 1 && weather(c) === 'flood' && !mem(c).drainage) c.block(c.self, 6);
    if (mem(c).phase >= 2 && cnt(c, 'water') >= 3) c.block(c.self, 7);
    /* §25: "Gain 4 Guard at the start of the enemy turn" at 2 Calm or more. */
    if (cnt(c, 'calm') >= 2) c.block(c.self, 4);
  },

  moves: {
    /* ── phase one (§24) ─────────────────────────────────────────────────── */
    'towel-snap': {
      id: 'towel-snap', name: 'Towel Snap', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => single(c, 12),
      tell: 'A wet towel, very fast, exactly where she meant it.',
      effect(c) { hitPlayer(c, single(c, 12)); },
    },
    'run-the-bath': {
      id: 'run-the-bath', name: 'Run the Bath', intent: Intent.DEFEND_BUFF, block: 7,
      tell: 'She turns the taps and lets it run.',
      effect(c) { c.block(c.self, 7); prepareMatronWeather(c, 'rain'); },
    },
    'turn-the-hot-tap': {
      id: 'turn-the-hot-tap', name: 'Turn the Hot Tap', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => single(c, 6),
      tell: 'The room begins to fill with white.',
      effect(c) { hitPlayer(c, single(c, 6)); prepareMatronWeather(c, 'steam'); },
    },
    'stop-splashing': {
      id: 'stop-splashing', name: 'Stop Splashing', intent: Intent.ATTACK, damage: 5, hits: 2,
      /* §24's rider is on the SECOND hit only, and an intent is `damage x hits`.
         The Kitchens made this call first for Cutlery Devil: a printed number
         that is true beats a design nicety that is not, so the +4 is spread
         across both hits rather than hidden in one of them. */
      damageFn: (c) => wx(c, 5 + (c.has('wet', c.player) ? 2 : 0)),
      tell: 'Twice, and harder if you are dripping on her floor.',
      effect(c) { hitPlayer(c, wx(c, 5 + (c.has('wet', c.player) ? 2 : 0)), 2); },
    },
    'fill-it-higher': {
      id: 'fill-it-higher', name: 'Fill It Higher', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'She does not think you have had enough yet.',
      effect(c) { c.block(c.self, 9); prepareMatronWeather(c, 'flood'); },
    },
    'there-much-better': {
      id: 'there-much-better', name: 'There, Much Better', intent: Intent.DEFEND_BUFF, block: 12,
      tell: 'She decides you are settling down nicely.',
      effect(c) {
        c.heal(c.self, 12);
        c.block(c.self, 12);
        setCnt(c, 'calm', 1);
        mem(c).soothe = 0;
        announceMatron(c);
      },
    },

    /* ── the transition (§27) ────────────────────────────────────────────── */
    'this-bath-is-not-finished': {
      id: 'this-bath-is-not-finished', name: 'This Bath Is Not Finished', intent: Intent.BUFF,
      tell: 'The floor gives way beneath the bath.',
      effect(c) {
        setCnt(c, 'calm', 0);
        field(c).pendingWeather = null;
        field(c).weather = 'clear';
        for (const id of ['weather-rain', 'weather-steam', 'weather-flood',
          'weather-downpour', 'weather-drain']) c.removeStatus(c.player, id);
        for (const a of board(c)) {
          if (a && a.alive && String(a.defId || '').startsWith('bath-drain')) c.despawn(a);
        }
        setCnt(c, 'water', 1);
        waistDeep(c);
        c.summon('drain-valve');
        c.summon('intake-valve');
        c.say('The room below is much larger than the room above.', 'warn');
        announceMatron(c);
      },
    },

    /* ── phase two (§30) ─────────────────────────────────────────────────── */
    'bath-key': {
      id: 'bath-key', name: 'Bath Key', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
      damageFn: (c) => wx(c, cnt(c, 'water') === 0 ? 18 : 15),
      tell: 'The brass key, swung on its chain, from the shoulder.',
      effect(c) { hitPlayer(c, wx(c, cnt(c, 'water') === 0 ? 18 : 15)); },
    },
    undertow: {
      id: 'undertow', name: 'Undertow', intent: Intent.ATTACK, damage: 6, hits: 2,
      damageFn: (c) => wx(c, cnt(c, 'water') >= 3 ? 5 : 6),
      tell: 'Something takes your feet out from under you twice.',
      effect(c) { hitPlayer(c, wx(c, cnt(c, 'water') >= 3 ? 5 : 6), 2); },
    },
    'fill-the-room': {
      id: 'fill-the-room', name: 'Fill the Room', intent: Intent.DEFEND_BUFF, block: 7,
      tell: 'She opens something you cannot see.',
      effect(c) { c.block(c.self, 7); raiseWater(c, 1); },
    },
    'pull-the-plug': {
      id: 'pull-the-plug', name: 'Pull the Plug', intent: Intent.DEFEND_BUFF, block: 0,
      tell: 'She lets some of it go, and takes some of it back.',
      effect(c) {
        /* §34: "Her healing from Pull the Plug is disabled" in the last phase. */
        if (mem(c).phase < 3) c.heal(c.self, 6);
        lowerWater(c, 1);
      },
    },
    'tidal-sweep': {
      id: 'tidal-sweep', name: 'Tidal Sweep', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => wx(c, tidal(c)),
      tell: 'The whole room leans.',
      effect(c) {
        hitPlayer(c, wx(c, tidal(c)));
        if (cnt(c, 'water') >= 3) c.block(c.self, 8);
      },
    },

    /* ── the final escalation (§34) ──────────────────────────────────────── */
    'enough-bathing': {
      id: 'enough-bathing', name: 'Enough Bathing', intent: Intent.BUFF,
      tell: 'She stops pretending this was ever about getting you clean.',
      effect(c) {
        c.say('Every valve you turn costs her now, and nothing she does heals her.', 'good');
        announceMatron(c);
      },
    },
  },

  /**
   * §24, §30 and §34's sequences. PURE — the engine re-calls this to re-render
   * dynamic intents, so the step is derived from the history and offset by
   * where the current phase began, never incremented here.
   */
  nextMove: (c) => {
    const m = mem(c);
    if (m.pendingTransition) return m.pendingTransition;
    /* §25's line-cut, from the flag settled at turn start — see the note there. */
    if (m.soothe) return 'there-much-better';
    const step = (c.history || []).length - (m.phaseStart || 0);
    if (m.phase >= 2) {
      return cyc(['fill-the-room', 'bath-key', 'undertow', 'pull-the-plug', 'tidal-sweep'], step);
    }
    return cyc(['run-the-bath', 'towel-snap', 'turn-the-hot-tap', 'stop-splashing',
      'fill-it-higher', 'towel-snap'], step);
  },

  onTurnEnd(c) {
    if (mem(c).pendingTransition) mem(c).pendingTransition = null;
    announceMatron(c);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.calmBreak = 24;
      h.notes.push('Haunt 10: it takes 24 damage in a turn to knock a Calm off her, not 18.');
    }
    return h;
  },
};

/* ══ the machinery ══════════════════════════════════════════════════════════ */

/** §19: "The Matron's SINGLE HIT attacks deal 2 less" while it is raining. */
function single(c, base) {
  const w = weather(c);
  return wx(c, Math.max(1, base - (w === 'rain' ? 2 : 0)));
}

/** §30's Tidal Sweep, whose whole point is that it is worst in the middle. */
function tidal(c) {
  const l = cnt(c, 'water');
  return l === 2 ? 13 : l >= 3 ? 8 : 10;
}

/** §22: every change is announced one action ahead, and lands at turn start. */
function prepareMatronWeather(c, next) {
  prepareWeather(c, next, `She is preparing ${next}.`);
  announceMatron(c);
}

/**
 * §23's Drainage. "When the Drain is destroyed, the current Weather immediately
 * becomes Drainage until the end of the next player turn... At the end of
 * Drainage, the Drain repairs at full Integrity and the previously scheduled
 * Weather becomes active."
 */
function openMatronWeather(c) {
  const m = mem(c);
  if (m.drainage) {
    m.drainage = 0;
    m.drainCooldown = 1;                       // §23: no attacking it the turn it repairs
    c.summon('bath-drain');
    c.say('The grate seats itself again.', 'warn');
    if (m.heldWeather) { field(c).pendingWeather = m.heldWeather; m.heldWeather = null; }
  }
  openWeather(c);
}

function consumeFixtures(c) {
  const m = mem(c);
  if (m.drainBroken) {
    m.drainBroken = 0;
    m.drainage = 1;
    /* Hold whatever was scheduled; §23 gives it back when the Drain repairs. */
    m.heldWeather = field(c).pendingWeather || null;
    field(c).pendingWeather = null;
    field(c).weather = 'clear';
    for (const id of ['weather-rain', 'weather-steam', 'weather-flood',
      'weather-downpour', 'weather-drain']) c.removeStatus(c.player, id);
    c.removeStatus(c.player, 'wet');
    c.removeStatus(c.self, 'wet');
    c.say('The grate goes. Everything runs out of the room for a turn.', 'good');
  }
  if (m.valveDown) { m.valveDown = 0; lowerWater(c, 1, true); }
  if (m.valveUp) { m.valveUp = 0; raiseWater(c, 1, true); }
}

/**
 * §32's Overflowing and §33's Empty Pipes, plus §34's tax.
 *
 * "Forcing a resource beyond its legal boundary creates a small advantage" is
 * §33's own summary, and it is why the boundaries are worth reaching: keeping
 * the room full and letting her waste Fill the Room is a real plan.
 */
function raiseWater(c, n, byPlayer) {
  if (cnt(c, 'water') >= 3) {
    c.loseHp(c.self, 8);
    repairValves(c);
    c.applyStatus(c.player, 'wet', 1, { fresh: true });
    c.say('It overflows. Every valve in the room reseats itself.', 'good');
    if (mem(c).phase >= 3) c.loseHp(c.self, 4);
  } else {
    addCnt(c, 'water', n, 3, 0);
  }
  waistDeep(c);
  if (byPlayer && mem(c).phase >= 3) c.loseHp(c.self, 4);
  announceMatron(c);
}

function lowerWater(c, n, byPlayer) {
  if (cnt(c, 'water') <= 0) {
    c.loseHp(c.self, 6);
    c.block(c.self, 8);
    c.say('The pipes run dry and knock. It costs her.', 'good');
    if (mem(c).phase >= 3) c.loseHp(c.self, 4);
  } else {
    addCnt(c, 'water', -n, 3, 0);
  }
  waistDeep(c);
  if (byPlayer && mem(c).phase >= 3) c.loseHp(c.self, 4);
  announceMatron(c);
}

/**
 * §28 Level 2: "BOTH SIDES gain 2 additional Guard whenever they gain Guard."
 *
 * The Overflow's High Water in the roster is the same idea at a different
 * number, so this reuses that status rather than adding a near-duplicate — the
 * player learns "high water means everyone Guards harder" once.
 */
function waistDeep(c) {
  const on = cnt(c, 'water') === 2 && mem(c).phase >= 2;
  for (const who of [c.player, c.self]) {
    if (on) c.applyStatus(who, 'high-water', 1);
    else c.removeStatus(who, 'high-water');
  }
}

/** §29: "Both repair after two enemy turns." */
function openWater(c) {
  const m = mem(c);
  m.valveTimer = (m.valveTimer || 0) + 1;
  if (m.valveTimer >= 2) { m.valveTimer = 0; repairValves(c); }
}

function repairValves(c) {
  for (const id of ['drain-valve', 'intake-valve']) {
    if (!board(c).some(a => a && a.alive && a.defId === id)) c.summon(id);
  }
}

/** §28's bands. Level 0 is the damage window; level 2 helps both sides. */
function damageTakenMulFor(c) { return cnt(c, 'water') === 0 && mem(c).phase >= 2 ? 1.15 : 1; }
drownedMatron.damageTakenMul = damageTakenMulFor;

/** §27 and §34. */
function checkPhase(c) {
  const m = mem(c);
  if (m.phase === 1 && c.self.hp <= 240) {
    m.phase = 2;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'this-bath-is-not-finished';
    return;
  }
  if (m.phase === 2 && c.self.hp <= 90) {
    m.phase = 3;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'enough-bathing';
  }
}

function announceMatron(c) {
  const m = mem(c);
  const calm = cnt(c, 'calm');
  const calmLine = calm >= 4 ? 'CALM 4 — her next move heals her 12 and Guards her 12'
    : calm >= 3 ? 'Calm 3 — her attacks deal 2 more'
      : calm >= 2 ? 'Calm 2 — she gains 4 Guard every turn'
        : `Calm ${calm}`;
  if (m.phase >= 2) {
    const l = cnt(c, 'water');
    const band = l === 0 ? 'Drained: she takes 15% MORE — and Bath Key hits for 18 instead of 15.'
      : l === 1 ? 'Ankle Deep: no modifier either way.'
        : l === 2 ? 'Waist Deep: BOTH sides gain 2 more Guard — and Tidal Sweep hits for 13.'
          : 'Submerged: she gains 7 Guard a turn and your first Trick costs 1 more, but Undertow and Tidal Sweep both get weaker.';
    c.announceRule({
      id: `matron:${c.self.id}`,
      name: `WATER ${l} / 3 · ${LEVELS[l].toUpperCase()}`,
      text: `${band} Break the blue valve to drop a level, the red one to raise it; both reseat after two turns. `
        + `Push past either end and it costs her. ${calmLine} — she gains one every turn you deal her less than 8, `
        + `and loses one every turn you deal her ${flag(c, 'calmBreak', 18)} or more.`
        + (m.phase >= 3 ? ' ENOUGH BATHING: every valve you turn costs her 4 Courage and nothing heals her.' : ''),
    });
    return;
  }
  const w = weather(c);
  const next = field(c).pendingWeather;
  c.announceRule({
    id: `matron:${c.self.id}`,
    name: m.drainage ? 'DRAINAGE — no Weather at all'
      : next ? `${w.toUpperCase()} → ${next.toUpperCase()} NEXT TURN` : `WEATHER · ${w.toUpperCase()}`,
    text: (m.drainage
      ? 'You broke the grate. No Weather, no Wet, and she gets no Guard from it — until it reseats at the start of your next turn, and whatever she had scheduled comes back with it. '
      : 'She announces every change a full turn before it happens. Break the Drain to cancel one — it reseats afterwards, and cannot be attacked on the turn it does. ')
      + `${calmLine} — she gains one every turn you deal her less than 8, and loses one every turn you deal her ${flag(c, 'calmBreak', 18)} or more. `
      + 'A turn spent on the Drain is a turn she counts as cooperation.',
  });
}

export const MATRON_BOSSES = [drownedMatron, bathDrain, drainValve, intakeValve];
