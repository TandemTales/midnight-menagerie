/**
 * The Harvest King — Pumpkin Grounds boss. OWNER: enemies.
 * Source of truth: docs/design/regions/16-pumpkin-grounds.md §16–§35, §46–§53.
 *
 * "The Harvest King is not obsessed with growing things forever. It understands
 * endings. It understands seasons. Its flaw is different." Its philosophy is
 * §16's:
 *
 *     Nothing should be picked before its time, and nothing should remain
 *     after it is ready.
 *
 * "That is a dangerous philosophy when applied to living beings." The King is
 * not wrong about seasons. It is wrong that it gets to decide when yours is.
 *
 * ── THE ROYAL PATCH IS A BOARD BOTH SIDES ARE PLAYING ───────────────────────
 *
 * Three Plots (four in phase two), each holding a Crop that ripens at the end of
 * every King turn. Every Crop is worth something to whoever takes it Ripe, and
 * the King's version is always the bigger one — so every Crop on the board is a
 * question about whether the player can afford to get there first.
 *
 * §25 is the clause that makes it a fight rather than a race: "The intended
 * Harvest target is SHOWN BEFORE THE PLAYER ACTS. This gives the player a clear
 * opportunity to steal that Harvest first." §26 pays for the steal — the King
 * spends its whole turn inspecting an empty vine — and §34 turns the phase-two
 * version into "one of the strongest mastery rewards in the fight".
 *
 * ── AND EVERY WAY THE PLAYER TOUCHES THE PATCH IS OPTIONAL ──────────────────
 *
 * §21's Encourage Growth is offered, not imposed. §22's Bruise costs nothing but
 * the damage the player was already spending. §31's Moon Ripening is a choice of
 * target. None of them is required to win, and §29 asks the phase transition to
 * "feel exciting rather than purely threatening" — every Crop ripens at once and
 * THE PLAYER GETS FIRST ACCESS.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, bossDmg, flag,
  isAlive, played, field, lastMove, hpFrac,
} from '../enemies/_lib.js';
import {
  STAGES, SEED, GROWING, RIPE, OVERRIPE, stageOf, isRipe, harvest, REWARD,
  crop, growCrop,
} from '../enemies/pumpkin-grounds.js';

const REGION = 'pumpkin-grounds';

/* ══ the Royal Patch (§17–§18, §30) ═════════════════════════════════════════ */

export const guardGourd = crop('guard-gourd', 'Guard Gourd', 'harvest-king',
  'Ribbed and heavy, and it sits in the plot like it owns it.',
  REWARD.guard(8), 'You take the Guard Gourd first. 8 Guard.',
  'you gain 8 Guard — the King would have taken 16.');

export const kingSpark = crop('king-spark', 'Spark Pumpkin', 'harvest-king',
  'It has not stopped crackling since it came up.',
  REWARD.nerve(), 'You take the Spark Pumpkin first. A Nerve next turn.',
  'you gain a Nerve next turn — the King would have hit 7 harder.');

export const moonSquash = crop('moon-squash', 'Moon Squash', 'harvest-king',
  'Pale, and cool to the touch even in the middle of the field.',
  REWARD.heal(4), 'You take the Moon Squash first. 4 Courage back.',
  'you recover 4 Courage — the King would have recovered 10.');

export const jumpingGourd = crop('jumping-gourd', 'Jumping Gourd', 'harvest-king',
  'It will not sit still in the soil and nothing has managed to make it.',
  (c) => c.applyStatus(c.player, 'jumping', 1, { fresh: true }),
  'You take the Jumping Gourd first. Your next Trick jumps.',
  'your next Trick this turn draws you a card, and pays a Nerve back if it cost 2 or more.');

const CROPS = ['guard-gourd', 'king-spark', 'moon-squash'];
const PHASE_TWO_CROPS = [...CROPS, 'jumping-gourd'];

/* ══ the Harvest King ═══════════════════════════════════════════════════════ */
export const harvestKing = {
  id: 'harvest-king',
  name: 'The Harvest King',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [445, 445],
  silhouette: 'harvest-king',
  palette: ['#c9772a', '#5c3a12', '#1a0f04'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.6,
  lore: 'A huge supernatural figure with a carved pumpkin head crowned by twisting antlers made from dead vines. Its body is old gardening clothes, straw, roots and moonlit leaves, and it carries a crooked harvesting sickle. Tiny pumpkins grow along its cloak.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.phaseStart = 0;
    m.plots = 3;
    m.stolen = 0;
    m.cleared = [];
    m.encouraged = 0;
    m.moonTurns = 0;
    setCnt(c, 'bounty', 0);
    for (const id of CROPS) c.summon(id);
    settleTarget(c);
    announceKing(c);
  },

  onPlayerTurnStart(c) {
    const m = mem(c);
    checkPhase(c);
    m.encouraged = 0;
    /* §35: "Whenever the player Harvests a Crop, the Harvest King loses 3
       Courage." The Crop factory counts the steals as they happen; the King
       pays for them at the top of the turn, where the number is readable. */
    if (m.phase >= 3 && m.stolen) c.loseHp(c.self, 3 * m.stolen);
    m.stolen = 0;
    /* §25: the intended Harvest is settled and PRINTED before the player acts,
       which is the whole reason stealing it is a plan rather than a guess. */
    settleTarget(c);
    /* §31's Moon Ripening: "at the end of every second player turn, the moon
       advances one Crop of the player's choice." Offered as a Trick for the
       same reason Encourage Growth is — the engine cannot stop and ask. */
    if (m.phase >= 2) {
      m.moonTurns = (m.moonTurns || 0) + 1;
      if (m.moonTurns % 2 === 0 && cropsOf(c).length) c.addCard('moon/moon-ripening', 'hand');
    }
    announceKing(c);
  },

  /**
   * §21's Encourage Growth. "Whenever the player plays their FOURTH Trick during
   * one turn, they may choose one Crop and advance it one stage. Once per turn.
   * THIS IS OPTIONAL."
   */
  onPlayerCard(c) {
    if (mem(c).encouraged || played(c).length !== 4) return;
    if (!cropsOf(c).length) return;
    c.addCard('moon/encourage-growth', 'hand');
    c.say('Four Tricks, and the patch answers to you as much as to it.', 'info');
  },

  onCardPlayed(c) {
    const id = c.card?.id;
    if (id !== 'moon/encourage-growth' && id !== 'moon/moon-ripening') return;
    if (id === 'moon/encourage-growth') mem(c).encouraged = 1;
    /* Advance the LEAST ripe crop: the offer says "one Crop", and a card cannot
       ask which. The least ripe is the one the player is being offered a use
       for — a Seed rushed toward usefulness, never a Ripe crop shoved past it,
       which §21 says is the one thing you would not want. */
    const pick = cropsOf(c).filter(a => stageOf(a) < RIPE)
      .sort((a, b) => stageOf(a) - stageOf(b))[0];
    if (pick) {
      growCrop(c, pick);
      c.say(`${pick.name} comes on a stage.`, 'good');
    } else {
      c.block(c.player, 4, { source: null });
      c.say('Everything is already ready. You take a moment instead.', 'good');
    }
    settleTarget(c);
    announceKing(c);
  },

  onAllyDeath(c) {
    /* §26 and §34: stealing the marked Crop costs the King its whole plan. */
    settleTarget(c);
    announceKing(c);
  },

  /** §19: "At the end of every Harvest King turn, every occupied Plot advances." */
  onTurnEnd(c) {
    /* The Disappointed turn is over: it may mark again next time. */
    mem(c).robbed = 0;
    /* §29: "The player begins the next turn facing several Ripe Crops. This
       should feel exciting rather than purely threatening... THE PLAYER GETS
       FIRST ACCESS TO THE HARVEST."
       Without this the transition ripened every Plot and then rotted every one
       of them at the end of the same turn, and the player woke up to an empty
       patch and a King that had just eaten the whole thing. */
    if (mem(c).skipGrowth) { mem(c).skipGrowth = 0; announceKing(c); return; }
    for (const plant of cropsOf(c)) resolveGrowth(c, plant);
    if (mem(c).pendingTransition) mem(c).pendingTransition = null;
    settleTarget(c);
    announceKing(c);
  },

  moves: {
    /* ── phase one (§23) ─────────────────────────────────────────────────── */
    'plant-the-patch': {
      id: 'plant-the-patch', name: 'Plant the Patch', intent: Intent.SUMMON,
      tell: 'It puts something in the first empty plot it finds.',
      effect(c) { c.block(c.self, 5); plant(c, 1); announceKing(c); },
    },
    'sickle-sweep': {
      id: 'sickle-sweep', name: 'Sickle Sweep', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => kingDmg(c, 12),
      tell: 'One long unhurried cut at the height of the crop.',
      effect(c) { hitPlayer(c, kingDmg(c, 12)); mem(c).spark = 0; },
    },
    'check-the-crop': {
      id: 'check-the-crop', name: 'Check the Crop', intent: Intent.BUFF,
      tell: 'It walks the row with a thumb on each one.',
      effect(c) {
        const pick = cropsOf(c).filter(a => stageOf(a) < RIPE)
          .sort((a, b) => stageOf(b) - stageOf(a))[0];
        if (pick) {
          resolveGrowth(c, pick);
          if (isRipe(pick)) c.block(c.self, 5);
        } else c.block(c.self, 5);
        settleTarget(c);
        announceKing(c);
      },
    },
    'seed-spit': {
      id: 'seed-spit', name: 'Seed Spit', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => kingDmg(c, 5),
      tell: 'Twice, and it plants something on the way past.',
      effect(c) { hitPlayer(c, kingDmg(c, 5), 2); mem(c).spark = 0; plant(c, 1); announceKing(c); },
    },
    'the-harvest': {
      id: 'the-harvest', name: 'Harvest', intent: Intent.BUFF,
      tell: 'It takes the one it has had its eye on.',
      effect(c) { takeHarvest(c, 1); },
    },
    'inspect-the-empty-vine': {
      id: 'inspect-the-empty-vine', name: 'Inspect the Empty Vine', intent: Intent.DEFEND, block: 7,
      tell: 'It reaches for something that is not there any more.',
      effect(c) {
        c.block(c.self, 7);
        c.say('It spends the whole turn looking at the gap where the crop was.', 'good');
      },
    },

    /* ── the transition (§28) ────────────────────────────────────────────── */
    'the-moon-is-high': {
      id: 'the-moon-is-high', name: 'The Moon Is High', intent: Intent.BUFF,
      tell: 'A large moon rises behind the courtyard and everything in the patch answers it.',
      effect(c) {
        for (const plant0 of cropsOf(c)) {
          c.removeStatus(plant0, 'bruised');
          while (stageOf(plant0) < RIPE) growCrop(c, plant0);
        }
        mem(c).plots = 4;
        mem(c).skipGrowth = 1;
        c.say('Everything is ready at once — and it is YOUR turn next.', 'good');
        settleTarget(c);
        announceKing(c);
      },
    },

    /* ── phase two (§32) ─────────────────────────────────────────────────── */
    'sow-everywhere': {
      id: 'sow-everywhere', name: 'Sow Everywhere', intent: Intent.SUMMON,
      tell: 'Every gap in the patch fills at once.',
      effect(c) { c.block(c.self, 6); plant(c, 4); announceKing(c); },
    },
    'harvest-sickle': {
      id: 'harvest-sickle', name: 'Harvest Sickle', intent: Intent.ATTACK, damage: 15, hits: 1,
      damageFn: (c) => kingDmg(c, 15),
      tell: 'It stops pretending the sickle is for the crop.',
      effect(c) { hitPlayer(c, kingDmg(c, 15)); mem(c).spark = 0; },
    },
    'royal-inspection': {
      id: 'royal-inspection', name: 'Royal Inspection', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'Two of them, checked and hurried along.',
      effect(c) {
        c.block(c.self, 8);
        for (const p of cropsOf(c).filter(a => stageOf(a) < RIPE).slice(0, 2)) resolveGrowth(c, p);
        settleTarget(c);
        announceKing(c);
      },
    },
    'pumpkin-barrage': {
      id: 'pumpkin-barrage', name: 'Pumpkin Barrage', intent: Intent.ATTACK, damage: 4, hits: 4,
      damageFn: (c) => kingDmg(c, 4) + (cnt(c, 'bounty') >= 2 ? 1 : 0),
      tell: 'Four of them, and it does not miss with any.',
      effect(c) {
        hitPlayer(c, kingDmg(c, 4) + (cnt(c, 'bounty') >= 2 ? 1 : 0), 4);
        mem(c).spark = 0;
      },
    },
    'harvest-feast': {
      id: 'harvest-feast', name: 'Harvest Feast', intent: Intent.BUFF,
      tell: 'It reaches for two at once.',
      effect(c) { takeHarvest(c, 2); },
    },
    'empty-basket': {
      id: 'empty-basket', name: 'Empty Basket', intent: Intent.DEFEND, block: 8,
      tell: 'Both of them are gone and it has nothing to put in the basket.',
      effect(c) {
        c.block(c.self, 8);
        addCnt(c, 'bounty', -1, 4, 0);
        c.say('You took both. The whole feast comes to nothing.', 'good');
        announceKing(c);
      },
    },

    /* ── the final escalation (§35) ──────────────────────────────────────── */
    'last-harvest': {
      id: 'last-harvest', name: 'Last Harvest', intent: Intent.BUFF,
      tell: 'The season is ending and it can feel it.',
      effect(c) {
        c.say('Nothing rots now. Every crop taken, by either of you, brings this to an end.', 'good');
        announceKing(c);
      },
    },
    'royal-reaping': {
      id: 'royal-reaping', name: 'Royal Reaping', intent: Intent.ATTACK_BIG, damage: 18, hits: 1,
      damageFn: (c) => kingDmg(c, 18),
      tell: 'Everything it has taken, swung at once.',
      effect(c) {
        hitPlayer(c, kingDmg(c, 18));
        setCnt(c, 'bounty', 2);
        mem(c).spark = 0;
        announceKing(c);
      },
    },
  },

  /** §24, §32 and §35's sequences. PURE — the step is derived, never incremented. */
  nextMove: (c) => {
    const m = mem(c);
    if (m.pendingTransition) return m.pendingTransition;
    const step = (c.history || []).length - (m.phaseStart || 0);
    if (m.phase >= 2) {
      const move = cyc(['sow-everywhere', 'harvest-sickle', 'royal-inspection',
        'pumpkin-barrage', 'harvest-feast'], step);
      if (move === 'harvest-feast' && !ripeOf(c).length) return 'empty-basket';
      if (move === 'harvest-sickle' && cnt(c, 'bounty') >= 4) return 'royal-reaping';
      return move;
    }
    const move = cyc(['plant-the-patch', 'sickle-sweep', 'check-the-crop', 'seed-spit',
      'the-harvest'], step);
    /* §23: "If no Crop is Ripe, use Plant the Patch instead." §26: if the player
       took the marked one, it inspects the empty vine and does nothing else. */
    if (move === 'the-harvest') {
      /* SS26 is about the MARKED crop, not about the patch: "if the player
         destroys the Crop the King has marked for Harvest, the King becomes
         Disappointed". Checking whether anything at all was ripe let it shrug
         and take a different one, which is the opposite of what SS26 wants the
         steal to feel like. */
      if (m.robbed) return 'inspect-the-empty-vine';
      if (m.mark && cropsOf(c).some(a => a.id === m.mark)) return 'the-harvest';
      return 'plant-the-patch';
    }
    if (move === 'sickle-sweep' && cnt(c, 'bounty') >= 4) return 'royal-reaping';
    return move;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.counters.bounty = 1;
      h.notes.push('Haunt 10: it comes into the field with a Bounty already counted.');
    }
    return h;
  },
};

/* ══ the machinery ══════════════════════════════════════════════════════════ */

const cropsOf = (c) => allies(c).filter(a => isAlive(a)
  && PHASE_TWO_CROPS.includes(String(a.defId)));
const ripeOf = (c) => cropsOf(c).filter(isRipe);

/** §27's Bounty, and §19's Overripe leftovers, both in the damage number. */
/**
 * Every rider on a Harvest King attack, including the Haunt one.
 *
 * `bossDmg` is the whole of boss Haunt scaling above the flat +6% Courage:
 * +1 damage a hit every third level, deliberately per-hit so a multi-hit
 * finisher scales with its own shape. `_lib.js` states the contract — "Bosses
 * must apply this in BOTH their `damageFn` and their `effect`, or the intent
 * stops telling the truth" — and this boss applied it in NEITHER, so its own
 * Haunt notes promised a number it never delivered. Added here, in the one
 * helper both halves already share, because two expressions that must agree
 * will eventually not. `tests/boss-haunt/check.py` is the gate.
 */
function kingDmg(c, base) {
  return base + cnt(c, 'bounty') + (mem(c).spark ? (mem(c).sparkBig ? 7 : 4) : 0)
    + bossDmg(c);
}

function plant(c, howMany) {
  const pool = mem(c).phase >= 2 ? PHASE_TWO_CROPS : CROPS;
  const have = new Set(cropsOf(c).map(a => String(a.defId)));
  let room = (mem(c).plots || 3) - have.size;
  let planted = 0;
  for (const id of pool) {
    if (planted >= howMany || room <= 0) break;
    if (have.has(id)) continue;
    c.summon(id);
    have.add(id);
    room -= 1;
    planted += 1;
  }
  if (!planted) c.block(c.self, 10);
  settleTarget(c);
  return planted;
}

/**
 * §25's priority, settled where the player can read it. "The intended Harvest
 * target is shown before the player acts."
 */
function settleTarget(c) {
  const m = mem(c);
  const ripe = ripeOf(c);
  m.markWas = m.mark || null;
  /* SS26. The moment the marked Crop leaves the board the King is Disappointed
     for that turn, and re-marking a different one would let it shrug the steal
     off — which is exactly the tempo advantage SS26 says should feel excellent.
     The mark still moves so the House Rule stays useful; `robbed` is what the
     plan reads. */
  if (m.mark && !cropsOf(c).some(a => a.id === m.mark)) m.robbed = 1;
  if (!ripe.length) { m.mark = null; m.mark2 = null; return; }
  const want = hpFrac(c.self) < 0.5 ? 'moon-squash'
    : cnt(c, 'bounty') >= 2 ? 'guard-gourd' : 'king-spark';
  const first = ripe.find(a => String(a.defId) === want) || ripe[0];
  m.mark = first.id;
  /* §33: Harvest Feast marks two, and "only one may be Moon Squash". */
  const second = ripe.find(a => a !== first
    && !(String(a.defId) === 'moon-squash' && String(first.defId) === 'moon-squash'));
  m.mark2 = m.phase >= 2 && second ? second.id : null;
}

/** §18, §27, §34 and §35, all of which land on one action. */
function takeHarvest(c, howMany) {
  const m = c.self.mem || {};
  const wanted = [m.mark, m.mark2].filter(Boolean).slice(0, howMany);
  const got = wanted.map(id => cropsOf(c).find(a => a.id === id)).filter(Boolean);

  /* §34: "For each marked Crop the player Harvests before Harvest Feast, the
     King loses 4 Courage." */
  const stolen = wanted.length - got.length;
  if (stolen > 0 && mem(c).phase >= 2) c.loseHp(c.self, 4 * stolen);

  if (!got.length) {
    c.block(c.self, howMany > 1 ? 8 : 7);
    if (howMany > 1) addCnt(c, 'bounty', -1, 4, 0);
    c.say(howMany > 1 ? 'You took both. The whole feast comes to nothing.'
      : 'It reaches for something that is not there any more.', 'good');
    announceKing(c);
    return;
  }

  for (const plant0 of got) {
    const id = String(plant0.defId);
    if (id === 'guard-gourd') c.block(c.self, 16);
    if (id === 'king-spark') { mem(c).spark = 1; mem(c).sparkBig = 1; }
    if (id === 'moon-squash') c.heal(c.self, 10);
    if (id === 'jumping-gourd') mem(c).twice = 1;
    c.say(`It takes the ${plant0.name}.`, 'warn');
    c.despawn(plant0);
    /* §35: "The King no longer gains Bounty", and every Harvest costs it. */
    if (mem(c).phase >= 3) c.loseHp(c.self, 2);
    else addCnt(c, 'bounty', 1, 4, 0);
  }
  settleTarget(c);
  announceKing(c);
}

/** §19's Overripe consolation, weaker on purpose. */
function resolveGrowth(c, plant0) {
  /* §35's Last Harvest: "Crops no longer become Overripe. They remain Ripe." */
  if (mem(c).phase >= 3 && isRipe(plant0)) return;
  const what = growCrop(c, plant0);
  if (what === 'bruised') { c.say(`${plant0.name} is too bruised to come on.`, 'good'); return; }
  if (what !== 'overripe') return;
  const id = String(plant0.defId);
  if (id === 'guard-gourd') c.block(c.self, 8);
  if (id === 'king-spark') { mem(c).spark = 1; mem(c).sparkBig = 0; }
  if (id === 'moon-squash') c.heal(c.self, 5);
  if (id === 'jumping-gourd') c.block(c.self, 6);
  c.say(`${plant0.name} goes over. It gets the poor version of it.`, 'info');
  c.despawn(plant0);
}

function checkPhase(c) {
  const m = mem(c);
  if (m.phase === 1 && c.self.hp <= 255) {
    m.phase = 2;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'the-moon-is-high';
    return;
  }
  if (m.phase === 2 && c.self.hp <= 95) {
    m.phase = 3;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'last-harvest';
  }
}

function announceKing(c) {
  const m = mem(c);
  const ripe = ripeOf(c);
  const marked = [m.mark, m.mark2].filter(Boolean)
    .map(id => cropsOf(c).find(a => a.id === id)).filter(Boolean).map(a => a.name);
  const b = cnt(c, 'bounty');
  c.announceRule({
    id: `king:${c.self.id}`,
    name: marked.length ? `IT WANTS: ${marked.join(' + ').toUpperCase()}`
      : `${cropsOf(c).length} / ${m.plots || 3} PLOTS · BOUNTY ${b}`,
    text: (marked.length
      ? `Take ${marked.length > 1 ? 'either of those' : 'that one'} before it does and it gets nothing`
        + `${m.phase >= 2 ? ' — and loses 4 Courage for each one you take' : ''}. `
      : 'Nothing is ready. Every Plot ripens one stage at the end of its turn. ')
      + `Bounty ${b}/4 — each is 1 attack damage, and at 4 the next Sickle Sweep becomes an 18-damage Royal Reaping. `
      + 'It gains one every time it harvests a Ripe Crop. Play FOUR Tricks in a turn and the patch offers '
      + 'itself to you as well.'
      + (m.phase >= 3 ? ' LAST HARVEST: nothing goes over any more, it gains no more Bounty, and every crop taken by either of you costs it Courage.' : ''),
  });
}

export const KING_BOSSES = [
  harvestKing, guardGourd, kingSpark, moonSquash, jumpingGourd,
];
