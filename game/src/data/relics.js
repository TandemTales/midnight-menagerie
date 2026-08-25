/**
 * Keepsakes — the run-defining passives.  OWNER: meta-run.
 *
 * A Keepsake is a small object a kid would put in a pocket: a chewed tennis
 * ball, a music box key, half a torch.  Mechanically they are Slay the Spire
 * relics — always on, always visible, and they change how you play rather than
 * adding +2 damage.
 *
 * Two kinds of behaviour live on a def:
 *
 *   hooks   combat behaviour, dispatched by `combat/hooks.js`.  Every hook name
 *           in that file's header works here.  Relics only ever apply to the
 *           player side.
 *   run     declarative flags the *run layer* reads: gold multipliers, shop
 *           rules, map reveals, rest-site rules.  Scenes stay dumb — they ask
 *           `relicRunFlags(run.keepsakes)` and read one plain object.
 *
 * Determinism: no hook may call Math.random.  Anything random goes through
 * `h.e.rng`.  Per-combat memory lives in `h.e.field` (which the engine deep
 * clones for previews) so hovering a card can never consume a "first time each
 * Scuffle" trigger.
 *
 *   relicById(id)                       -> RelicDef | undefined
 *   relicsOfRarity('rare')              -> RelicDef[]
 *   makeRelic(def|id)                   -> a live instance (own `counter`)
 *   starterKeepsake(companionSlug)      -> a live instance
 *   rollKeepsake(rng, { rarity, owned, pool }) -> a live instance | null
 *   relicRunFlags(list)                 -> aggregated run-layer flags
 *   RELIC_SIGILS[id]                    -> an SVG path for the chip glyph
 */
import { TERMS } from './schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// hook helpers — every one of these is preview-safe
// ─────────────────────────────────────────────────────────────────────────────

/** Per-combat scratch for one Keepsake. Lives in engine.field so previews fork it. */
function mem(h) {
  const e = h.e;
  if (!e.field) e.field = {};
  const all = e.field._keepsakes || (e.field._keepsakes = {});
  const id = h.owner?.id || h.hookId || 'anon';
  return all[id] || (all[id] = {});
}

const EMPTY = Object.freeze({});
/** Read-only view of the scratch. Use this inside value reducers: they run on
 *  the display path (intent numbers, live card text) and must not write. */
function peek(h) {
  return h.e?.field?._keepsakes?.[h.owner?.id] || EMPTY;
}

/** True exactly once per combat for `key`. Safe inside previews. */
function once(h, key = 'once') {
  const m = mem(h);
  if (m[key]) return false;
  m[key] = true;
  return true;
}

/** Bump the visible chip counter. Never during a preview clone. */
function bump(h, n = 1) {
  if (h.e.isPreview) return;
  h.owner.counter = (h.owner.counter || 0) + n;
}

/** Announce the trigger so the Keepsake bar can flash. */
function fire(h, reason = '') {
  if (h.e.isPreview) return;
  try {
    h.e._emit?.('relic:trigger', {
      relicId: h.owner?.id, name: h.owner?.name,
      counter: h.owner?.counter ?? null, reason,
    });
  } catch { /* the bar is cosmetic */ }
}

/** Trigger + counter in one call. */
function pop(h, reason) { bump(h); fire(h, reason); }

const player = (h) => h.e.player;

/**
 * Grant extra Nerve for a turn.
 *
 * The turn pipeline refills Nerve to `energyMax` at step 6, *after* every
 * onTurnStart hook has run, so a plain `gainEnergy` at turn start is silently
 * overwritten.  Raising `energyMax` instead means the orb honestly reads 4/4
 * and the refill hands the player the right number.
 */
function lendNerve(h, n = 1) {
  const m = mem(h);
  if (m.lent) return;
  m.lent = n;
  player(h).energyMax += n;
}
function returnNerve(h) {
  const m = mem(h);
  if (!m.lent) return;
  player(h).energyMax = Math.max(1, player(h).energyMax - m.lent);
  m.lent = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Keepsakes
// ─────────────────────────────────────────────────────────────────────────────
/** @type {import('./schema.js').RelicDef[]} */
export const RELICS = [

  // ── starter ───────────────────────────────────────────────────────────────
  {
    id: 'pocket-flashlight', name: 'Pocket Flashlight', rarity: 'starter', icon: 'torch',
    desc: `At the end of every ${TERMS.combat}, recover 6 ${TERMS.hp}.`,
    flavor: 'The bulb is going. You keep it anyway.',
    hooks: {
      onCombatEnd(h) {
        if (!h.victory) return;
        h.e.heal(player(h), 6, 'relic');
        pop(h, 'end');
      },
    },
  },
  {
    id: 'spare-batteries', name: 'Spare Batteries', rarity: 'starter', icon: 'battery',
    desc: `Draw 1 extra ${TERMS.card} on your first turn of every ${TERMS.combat}.`,
    flavor: 'Two AAs, warm from a coat pocket, rolling like dice.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player' || h.turn !== 1) return;
        h.e.drawCards(1, 'relic');
        pop(h, 'draw');
      },
    },
  },
  {
    id: 'friendship-bracelet', name: 'Friendship Bracelet', rarity: 'starter', icon: 'knot',
    desc: `Gain 1 ${TERMS.block} at the start of every turn for each Keepsake you carry.`,
    flavor: 'Six colours. Six kids. One knot that will not come out.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player') return;
        const n = (h.e.relics || []).length;
        if (n > 0) { h.e.gainBlock(player(h), n, { fromCard: false, source: 'relic' }); fire(h, 'guard'); }
      },
    },
  },

  // ── common ────────────────────────────────────────────────────────────────
  {
    id: 'welcome-mat', name: 'Welcome Mat', rarity: 'common', icon: 'mat',
    desc: `Gain 4 ${TERMS.block} at the start of every ${TERMS.combat}.`,
    flavor: 'It still says WELCOME. Nobody has changed it in ninety years.',
    hooks: {
      /* onTurnStart, not onCombatStart: `_beginPlayerTurn` wipes Guard at step 2, so Guard
         granted at combat start is gone before the player is dealt a card. */
      onTurnStart(h) {
        if (h.e.turn !== 1) return;
        h.e.gainBlock(player(h), 4, { fromCard: false, source: 'relic' }); pop(h, 'guard');
      },
    },
  },
  {
    id: 'house-slippers', name: 'House Slippers', rarity: 'common', icon: 'slipper',
    desc: `The first attack against you each ${TERMS.combat} deals 3 less damage.`,
    flavor: 'Too big. Warm anyway. The house approves of quiet feet.',
    hooks: {
      onIncomingHit(h) {
        if (h.defender !== player(h) || h.kind !== 'attack') return;
        if (!once(h, 'soft')) return;
        h.setAmount?.(Math.max(0, (h.amount || 0) - 3));
        pop(h, 'soften');
      },
    },
  },
  {
    id: 'brass-service-bell', name: 'Brass Service Bell', rarity: 'common', icon: 'bell',
    desc: `The first time each ${TERMS.combat} you end a turn with 0 ${TERMS.energy}, `
        + `draw 1 extra ${TERMS.card} next turn.`,
    flavor: 'Rung once, in 1934, by someone who did not know better.',
    hooks: {
      onTurnEnd(h) {
        if (h.side !== 'player') return;
        if (h.e.energy > 0) return;
        if (!once(h, 'rung')) return;
        h.e.drawDeltaNextTurn = (h.e.drawDeltaNextTurn || 0) + 1;
        pop(h, 'ring');
      },
    },
  },
  {
    id: 'chewed-tennis-ball', name: 'Chewed Tennis Ball', rarity: 'common', icon: 'ball',
    desc: `The first Attack you play each ${TERMS.combat} deals 8 more damage.`,
    flavor: 'Fuzz long gone. Someone loved this into a lump.',
    hooks: {
      // Pure: `modifyDamageDealt` also runs on the display path (intent numbers,
      // live card text), so it must never write anything.  The spend is recorded
      // in onAttackDealt, which only fires on a real resolution.
      modifyDamageDealt(amount, h) {
        if (h.attacker !== player(h) || h.kind !== 'attack' || !h.card) return amount;
        return peek(h).spent ? amount : amount + 8;
      },
      onAttackDealt(h) {
        const m = mem(h);
        if (m.spent) return;
        m.spent = true;
        pop(h, 'bounce');
      },
    },
  },
  {
    id: 'jar-of-fireflies', name: 'Jar of Fireflies', rarity: 'common', icon: 'jar',
    desc: `The first time your ${TERMS.block} breaks each ${TERMS.combat}, `
        + `gain 6 ${TERMS.block} and draw 1 ${TERMS.card}.`,
    flavor: 'Punched holes in the lid. They have not dimmed in decades.',
    hooks: {
      onDamaged(h) {
        if (h.defender !== player(h)) return;
        if (!(h.blocked > 0 && player(h).block === 0)) return;
        if (!once(h, 'break')) return;
        h.e.gainBlock(player(h), 6, { fromCard: false, source: 'relic' });
        h.e.drawCards(1, 'relic');
        pop(h, 'glow');
      },
    },
  },
  {
    id: 'butterfly-net', name: 'Butterfly Net', rarity: 'common', icon: 'net',
    desc: `Every 10th ${TERMS.card} you play in a ${TERMS.combat}, draw 2.`,
    flavor: 'For moths, mostly. Mr. Moth pretends not to notice it.',
    counter: 0,
    hooks: {
      onCombatStart(h) { if (!h.e.isPreview) h.owner.counter = 0; },
      onCardPlayed(h) {
        const m = mem(h);
        m.n = (m.n || 0) + 1;
        if (!h.e.isPreview) h.owner.counter = m.n % 10;
        if (m.n % 10 !== 0) return;
        h.e.drawCards(2, 'relic');
        fire(h, 'catch');
      },
    },
  },
  {
    id: 'sticky-hand', name: 'Sticky Hand', rarity: 'common', icon: 'hand',
    desc: `Whenever you Vanish a ${TERMS.card}, gain 2 ${TERMS.block}.`,
    flavor: 'Prize from a machine. Picks up dust, hair, and the occasional ghost.',
    hooks: {
      onCardExhausted(h) { h.e.gainBlock(player(h), 2, { fromCard: false, source: 'relic' }); },
    },
  },
  {
    id: 'lucky-button', name: 'Lucky Button', rarity: 'common', icon: 'button',
    desc: `Rare ${TERMS.card} rewards appear noticeably more often.`,
    flavor: 'Brass, four holes, off a coat nobody remembers. It has never once helped. You keep it.',
    run: { luck: 2 },
  },
  {
    id: 'chalk-stub', name: 'Chalk Stub', rarity: 'common', icon: 'chalk',
    desc: 'Unsurveyed rooms on the blueprint show what they really are.',
    flavor: 'You mark the doors you came through. The house rubs them out behind you.',
    run: { revealUnknown: true },
  },
  {
    id: 'thermos-of-cocoa', name: 'Thermos of Cocoa', rarity: 'common', icon: 'thermos',
    desc: `Safe Rooms restore an extra 12 ${TERMS.hp}.`,
    flavor: 'Still hot. It has been still hot for a very long time.',
    run: { restBonus: 12 },
  },

  // ── uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'wind-up-mouse', name: 'Wind-Up Mouse', rarity: 'uncommon', icon: 'mouse',
    desc: `Every third ${TERMS.card} you play in a turn grants 4 ${TERMS.block}.`,
    flavor: 'Tin, painted grey, one ear missing. It runs in circles and something always watches.',
    hooks: {
      onTurnStart(h) { if (h.side === 'player') mem(h).t = 0; },
      onCardPlayed(h) {
        const m = mem(h);
        m.t = (m.t || 0) + 1;
        if (m.t % 3 !== 0) return;
        h.e.gainBlock(player(h), 4, { fromCard: false, source: 'relic' });
        fire(h, 'wind');
      },
    },
  },
  {
    id: 'moth-eaten-monocle', name: 'Moth-Eaten Monocle', rarity: 'uncommon', icon: 'monocle',
    desc: `Enemies begin every ${TERMS.combat} with 1 Vulnerable.`,
    flavor: 'Through it, everything in the house looks slightly guilty.',
    hooks: {
      onCombatStart(h) {
        for (const en of h.e.enemies) h.e.applyStatus(en, 'vulnerable', 1, { reason: 'relic' });
        pop(h, 'look');
      },
    },
  },
  {
    id: 'nightlight', name: 'Nightlight', rarity: 'uncommon', icon: 'nightlight',
    desc: 'Attacks that would deal 5 or less damage to you deal 1 instead.',
    flavor: 'A little plastic moon. It only ever kept small things away — but it kept them away.',
    hooks: {
      modifyDamageTaken(amount, h) {
        if (h.defender !== player(h) || h.kind !== 'attack') return amount;
        return amount <= 5 && amount > 0 ? 1 : amount;
      },
    },
  },
  {
    id: 'porcupine-slipper', name: 'Porcupine Slipper', rarity: 'uncommon', icon: 'quill',
    desc: `Gain 3 Bristle at the start of every ${TERMS.combat}.`,
    flavor: 'A hedgehog slept in it once. The quills stayed. So did the hedgehog, sort of.',
    hooks: {
      onCombatStart(h) { h.e.applyStatus(player(h), 'bristle', 3, { reason: 'relic' }); pop(h, 'quills'); },
    },
  },
  {
    id: 'coatcheck-ticket', name: 'Coatcheck Ticket', rarity: 'uncommon', icon: 'ticket',
    desc: `On your first turn of every ${TERMS.combat}, put your most expensive `
        + `${TERMS.card} back on the bottom of your draw pile and draw a replacement.`,
    flavor: 'No. 41. Nobody has ever come to collect No. 41.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player' || h.turn !== 1) return;
        const hand = h.e.piles?.hand || [];
        if (hand.length < 2) return;
        let worst = null;
        for (const c of hand) {
          const cost = h.e.costOf(c);
          if (!worst || cost > worst.cost) worst = { card: c, cost };
        }
        if (!worst || worst.cost <= 0) return;
        h.e.moveCard(worst.card, 'draw', { position: 'bottom', reason: 'relic' });
        h.e.drawCards(1, 'relic');
        pop(h, 'swap');
      },
    },
  },
  {
    id: 'spare-key', name: 'Spare Key', rarity: 'uncommon', icon: 'key',
    desc: 'Curiosities show you one extra way through. The locked option is never locked to you.',
    flavor: 'Under the third flowerpot, exactly where the note said.',
    run: { unlockEvents: true },
  },
  {
    id: 'knotted-handkerchief', name: 'Knotted Handkerchief', rarity: 'uncommon', icon: 'knot2',
    desc: `The first debuff applied to you each ${TERMS.combat} is refused.`,
    flavor: 'One knot per thing you must not forget. There are a lot of knots.',
    hooks: {
      onDebuffIncoming(h) {
        if (h.actor !== player(h)) return;
        if (!once(h, 'refuse')) return;
        h.prevent?.();
        pop(h, 'refuse');
      },
    },
  },
  {
    id: 'tin-of-sardines', name: 'Tin of Sardines', rarity: 'uncommon', icon: 'tin',
    desc: `Whenever an enemy dies, recover 3 ${TERMS.hp}. Something always comes to eat.`,
    flavor: 'The key snapped off years ago. It opens anyway, for the right company.',
    hooks: {
      onDeath(h) {
        if (h.actor === player(h) || h.actor?.side === 'player') return;
        h.e.heal(player(h), 3, 'relic');
        pop(h, 'feed');
      },
    },
  },

  // ── rare ──────────────────────────────────────────────────────────────────
  {
    id: 'ninth-life-charm', name: 'Ninth Life Charm', rarity: 'rare', icon: 'charm',
    desc: `The first time you would run out of ${TERMS.hp} each ${TERMS.combat}, `
        + `survive at 1 instead.`,
    flavor: 'Nine notches on a bit of bone. Two are already crossed out and you did not do it.',
    hooks: {
      onLethal(h) {
        if (h.defender !== player(h)) return;
        if (!once(h, 'life')) return;
        h.setHp ? h.setHp(1) : h.prevent?.();
        pop(h, 'save');
      },
    },
  },
  {
    id: 'bag-of-preparation', name: "Night-Before Bag", rarity: 'rare', icon: 'bag',
    desc: `Draw 2 extra ${TERMS.card}s on your first turn of every ${TERMS.combat}.`,
    flavor: 'Packed the night before, twice, because the first pack was wrong.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player' || h.turn !== 1) return;
        h.e.drawCards(2, 'relic'); pop(h, 'draw');
      },
    },
  },
  {
    id: 'stopped-pocket-watch', name: 'Stopped Pocket Watch', rarity: 'rare', icon: 'watch',
    desc: `Gain 1 extra ${TERMS.energy} on each of your first three turns of a ${TERMS.combat}.`,
    flavor: 'Stopped at 11:58. In this house that is not late — it is early.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player') return;
        if (h.turn > 3) { returnNerve(h); return; }
        lendNerve(h, 1); pop(h, 'tick');
      },
      onCombatEnd(h) { returnNerve(h); },
    },
  },
  {
    id: 'mothballed-quilt', name: 'Mothballed Quilt', rarity: 'rare', icon: 'quilt',
    desc: `At the start of your turn, if you have no ${TERMS.block}, gain 8 ${TERMS.block}.`,
    flavor: 'Squares cut from clothes that belonged to people the house has stopped naming.',
    hooks: {
      onTurnStart(h) {
        if (h.side !== 'player') return;
        if (player(h).block > 0) return;
        h.e.gainBlock(player(h), 8, { fromCard: false, source: 'relic' });
        pop(h, 'tuck');
      },
    },
  },
  {
    id: 'hollow-birdcage', name: 'Hollow Birdcage', rarity: 'rare', icon: 'cage',
    desc: `Whenever an enemy dies, draw 1 ${TERMS.card} and gain 4 ${TERMS.block}.`,
    flavor: 'The door has been open the entire time.',
    hooks: {
      onDeath(h) {
        if (h.actor?.side === 'player') return;
        h.e.drawCards(1, 'relic');
        h.e.gainBlock(player(h), 4, { fromCard: false, source: 'relic' });
        pop(h, 'open');
      },
    },
  },
  {
    id: 'black-cats-shadow', name: "Black Cat's Shadow", rarity: 'rare', icon: 'shadow',
    desc: 'Powers cost 1 less.',
    flavor: 'It arrived before the cat did, and it has not left with her.',
    hooks: {
      modifyCardCost(cost, h) {
        return h.card?.type === 'power' ? Math.max(0, cost - 1) : cost;
      },
      onCardPlayed(h) { if (h.card?.type === 'power') pop(h, 'free'); },
    },
  },
  {
    id: 'the-collar', name: 'The Collar', rarity: 'rare', icon: 'collar',
    desc: 'The name on the tag is legible again. Every room you clear turns up a Clue.',
    flavor: 'You did not want to pick it up. You picked it up.',
    run: { clueOnClear: true, lostThingsMul: 1.1 },
  },

  // ── boss ──────────────────────────────────────────────────────────────────
  {
    id: 'butlers-white-glove', name: "The Butler's White Glove", rarity: 'boss', icon: 'glove',
    desc: `Gain 1 extra ${TERMS.energy} every turn. You can no longer rest in a Safe Room.`,
    flavor: 'Spotless. He would like you to notice that it is spotless.',
    run: { noRestHeal: true },
    hooks: {
      onCombatStart(h) { lendNerve(h, 1); pop(h, 'serve'); },
      onCombatEnd(h) { returnNerve(h); },
    },
  },
  {
    id: 'governess-hand-bell', name: "The Governess's Hand Bell", rarity: 'boss', icon: 'handbell',
    desc: `Draw 2 extra ${TERMS.card}s every turn. Your hand holds 3 fewer.`,
    flavor: 'One ring means come here. Two means you are already late.',
    hooks: {
      modifyDraw(n, h) { return h.reason === 'turnStart' ? n + 2 : n; },
      modifyHandCap(n) { return Math.max(4, n - 3); },
      onTurnStart(h) { if (h.side === 'player' && h.turn === 1) pop(h, 'ring'); },
    },
  },
  {
    id: 'bedframe-splinter', name: 'Bedframe Splinter', rarity: 'boss', icon: 'splinter',
    desc: `Gain 2 Strength at the start of every ${TERMS.combat}. `
        + `Everything in the house is 15% harder to put down.`,
    flavor: 'You pulled it out of your palm. It grew back in your pocket.',
    run: { enemyHpMul: 1.15 },
    hooks: {
      onCombatStart(h) { h.e.applyStatus(player(h), 'strength', 2, { reason: 'relic' }); pop(h, 'grip'); },
    },
  },
  {
    id: 'lantern-of-the-lamplighter', name: "Lamplighter's Wick", rarity: 'boss', icon: 'wick',
    desc: `Your first ${TERMS.card} each turn costs 1 less. You start every `
        + `${TERMS.combat} with 5 fewer ${TERMS.hp}.`,
    flavor: 'It burns whatever is nearest. Tonight that is you.',
    hooks: {
      onCombatStart(h) {
        // Never the thing that ends a run before a turn has been taken.
        const p = player(h);
        const cost = Math.min(5, Math.max(0, p.hp - 1));
        if (cost > 0) h.e.loseHp(p, cost, 'relic');
        pop(h, 'burn');
      },
      // Pure. Before you have played anything this turn EVERY Trick shows the
      // discount, and whichever one you play first is the one that gets it —
      // so the number on the card is never a lie.
      modifyCardCost(cost, h) {
        return (h.e.stats?.cardsPlayedThisTurn || 0) === 0 ? Math.max(0, cost - 1) : cost;
      },
      onCardPlayed(h) { if ((h.index ?? 1) === 1) pop(h, 'light'); },
    },
  },

  // ── shop ──────────────────────────────────────────────────────────────────
  {
    id: 'mr-moths-ledger', name: "Mr. Moth's Ledger", rarity: 'shop', icon: 'ledger',
    desc: `Forgetting a ${TERMS.card} at ${TERMS.shop} never gets more expensive.`,
    flavor: 'Every column adds up. None of the columns say what they are for.',
    run: { flatRemoval: true },
  },
  {
    id: 'pocketful-of-buttons', name: 'Pocketful of Buttons', rarity: 'shop', icon: 'buttons',
    desc: `You find 25% more ${TERMS.gold}.`,
    flavor: 'Bone, brass, shell, one made of tooth. You stopped counting at forty.',
    run: { lostThingsMul: 1.25 },
  },
  {
    id: 'night-vendors-lantern', name: "Night Vendor's Lantern", rarity: 'shop', icon: 'lantern',
    desc: `${TERMS.shop} always has one Rare ${TERMS.card} on the table, and everything costs 10% less.`,
    flavor: 'He hangs it out when he wants company. He wants company most nights.',
    run: { shopRare: true, shopDiscount: 0.9 },
  },

  // ── event ─────────────────────────────────────────────────────────────────
  {
    id: 'bowl-with-your-name', name: 'Bowl With Your Name On It', rarity: 'event', icon: 'bowl',
    desc: `Recover 3 ${TERMS.hp} at the start of every ${TERMS.combat}.`,
    flavor: 'Ceramic. Chipped. Your handwriting, though you have never been here.',
    hooks: {
      onCombatStart(h) { h.e.heal(player(h), 3, 'relic'); pop(h, 'fed'); },
    },
  },
  {
    id: 'photograph-of-a-cat', name: 'Photograph of a Cat', rarity: 'event', icon: 'photo',
    desc: `Whenever you free a Companion or finish a Big Scare, gain 6 maximum ${TERMS.hp}.`,
    flavor: 'Fifty years old. She is sitting on the same stair she sits on now.',
    run: { maxHpOnMilestone: 6 },
  },
  {
    id: 'wall-scratchings', name: 'Wall Scratchings', rarity: 'event', icon: 'scratch',
    desc: `The first Attack you play each ${TERMS.combat} strikes a second time for 4.`,
    flavor: 'Four lines and a fifth across. Counting days, or counting us.',
    hooks: {
      onAttackDealt(h) {
        const t = h.target;
        if (!t || !t.alive) return;
        if (!once(h, 'echo')) return;
        h.e.dealDamage({ attacker: player(h), defender: t, amount: 4, kind: 'attack', cause: 'relic' });
        pop(h, 'echo');
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Chip glyphs.  24x24 paths, stroke-drawn by the consumer.
// ─────────────────────────────────────────────────────────────────────────────
export const RELIC_SIGILS = {
  torch:      'M9 3h6l-1 7h3l-8 11 2-8H8Z',
  battery:    'M6 8h11v8H6Zm11 2h2v4h-2ZM9 10v4M13 10v4',
  knot:       'M5 12c4-6 10-6 14 0-4 6-10 6-14 0Zm7-4v8',
  mat:        'M3 9h18l-2 8H5Zm4 0v8m4-8v8m4-8v8',
  slipper:    'M4 15c0-3 2-5 6-5h5c3 0 5 1 5 3s-2 3-5 3H4Zm4-5V7',
  bell:       'M12 4a5 5 0 0 1 5 5v5l2 2H5l2-2V9a5 5 0 0 1 5-5Zm-2 14a2 2 0 0 0 4 0',
  ball:       'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-6 3c4 2 4 8 0 10m12-10c-4 2-4 8 0 10',
  jar:        'M8 4h8v3l2 3v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8l2-3Zm2 9h1m3 2h1m-3-4h1',
  net:        'M14 4l6 6-6 2-2 6-6-6Zm-4 8 6-6',
  hand:       'M9 20V9a1.5 1.5 0 0 1 3 0V4.5a1.5 1.5 0 0 1 3 0V10l3 2v5a3 3 0 0 1-3 3Z',
  button:     'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-2 6h.01M14 10h.01M10 14h.01M14 14h.01',
  chalk:      'M6 18l3-12 5 2-3 12Zm-1 2h6',
  thermos:    'M9 3h6v3l1 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l1-2Zm-1 7h8',
  mouse:      'M6 16a5 4 0 0 1 10 0Zm11 0h3M6 12l-2-3m14 2 2-3M9 14h.01',
  monocle:    'M9 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0Zm0 0H4m10 5v4',
  nightlight: 'M15 4a7 7 0 1 0 5 9 6 6 0 0 1-5-9Z',
  quill:      'M5 19c6-1 10-5 14-14-8 1-13 5-14 14Zm3-3 8-8',
  ticket:     'M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4Zm6 0v10',
  key:        'M14 4a5 5 0 1 1-4 8l-6 6v3h3l1-2h2v-2h2l2-2a5 5 0 0 1 0-11Zm2 4h.01',
  knot2:      'M4 8c5-4 11-4 16 0-5 8-11 8-16 0Zm8 1v9',
  tin:        'M4 9h16v9H4Zm0 0 3-4h10l3 4M9 13h6',
  charm:      'M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5Z',
  bag:        'M6 8h12l1 12H5Zm3 0V6a3 3 0 0 1 6 0v2',
  watch:      'M12 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 3v4l3 2M10 3h4',
  quilt:      'M3 6h18v12H3Zm6 0v12m6-12v12M3 12h18',
  cage:       'M12 3l7 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Zm-3 6v9m3-9v9m3-9v9',
  shadow:     'M7 20c-2-4 0-9 4-11 1 3 4 4 6 3 1 4-2 8-6 8Zm2-13a3 3 0 1 1 0-.01',
  collar:     'M4 10a8 5 0 0 0 16 0M12 15v3m0 3a2 2 0 1 1 0-.01M6 9l1-2m10 2-1-2',
  glove:      'M7 20V10a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v3l1 2v5Z',
  handbell:   'M12 3v2m-4 4a4 4 0 0 1 8 0v6l2 3H6l2-3Zm2 14a2 2 0 0 0 4 0',
  splinter:   'M4 20 20 4l-3 9-4 1-2 4Z',
  wick:       'M12 3c3 4 1 6 0 8-2-2-3-4 0-8Zm-6 9h12l-1 8H7Z',
  ledger:     'M5 4h11l3 3v13H5Zm3 5h8M8 12h8M8 15h5',
  buttons:    'M8 8a4 4 0 1 1 0 .01M16 15a4 4 0 1 1 0 .01M7 8h.01M9 8h.01M15 15h.01M17 15h.01',
  lantern:    'M9 3h6M8 6h8l1 12H7Zm4-3v3m0 15v3M10 9v6m4-6v6',
  bowl:       'M4 11h16a8 8 0 0 1-16 0Zm4-3 1-2m6 2-1-2',
  photo:      'M4 5h16v14H4Zm3 11 4-5 3 3 2-2 3 4M8 9h.01',
  scratch:    'M6 4l3 16M11 4l1 16M16 5l2 15M4 12h16',
};
export const DEFAULT_SIGIL = 'M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5Z';
export function relicSigil(id) { return RELIC_SIGILS[relicById(id)?.icon || id] || DEFAULT_SIGIL; }

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────
const BY_ID = new Map(RELICS.map(r => [r.id, r]));
export function relicById(id) { return BY_ID.get(id); }
export function allRelics() { return RELICS.slice(); }
export function relicsOfRarity(rarity) { return RELICS.filter(r => r.rarity === rarity); }

/** Rarities that can turn up as a random find. */
export const FINDABLE = ['common', 'uncommon', 'rare'];

/**
 * A live instance.  Shares `hooks` (pure functions) with the def but owns its
 * own `counter`, so two runs never trample each other.
 */
export function makeRelic(defOrId) {
  const def = typeof defOrId === 'string' ? BY_ID.get(defOrId) : defOrId;
  if (!def) return null;
  const inst = Object.create(def);
  inst.counter = def.counter ?? null;
  inst.acquiredAt = null;
  return inst;
}

const STARTERS = ['pocket-flashlight', 'spare-batteries', 'friendship-bracelet'];

/** Deterministic per Companion, so a Companion always feels like itself. */
export function starterKeepsake(companionSlug = 'marmalade') {
  const map = {
    marmalade: 'pocket-flashlight',
    bones: 'friendship-bracelet',
    pipkin: 'spare-batteries',
    taffy: 'pocket-flashlight',
    wink: 'spare-batteries',
  };
  return makeRelic(map[companionSlug] || STARTERS[0]);
}

/**
 * Roll a Keepsake the player does not already own.
 * @param {import('../core/rng.js').RNG} rng
 * @param {{rarity?:string, owned?:string[]|Set<string>, pool?:string[]}} opts
 */
export function rollKeepsake(rng, opts = {}) {
  const owned = opts.owned instanceof Set ? opts.owned : new Set(opts.owned || []);
  let pool = opts.pool
    ? opts.pool.map(id => BY_ID.get(id)).filter(Boolean)
    : RELICS.filter(r => (opts.rarity ? r.rarity === opts.rarity : FINDABLE.includes(r.rarity)));
  pool = pool.filter(r => !owned.has(r.id));
  if (!pool.length) {
    // fall back to any findable Keepsake still missing, then give up honestly
    pool = RELICS.filter(r => FINDABLE.includes(r.rarity) && !owned.has(r.id));
    if (!pool.length) return null;
  }
  return makeRelic(pool[rng.int(pool.length)]);
}

/** The usual reward-rarity ladder for a random (non-boss) Keepsake. */
export function rollKeepsakeRarity(rng, luck = 0) {
  const roll = rng.next() * 100 + luck * 2;
  if (roll > 92) return 'rare';
  if (roll > 62) return 'uncommon';
  return 'common';
}

/**
 * Aggregate the declarative `run` blocks.  One plain object, so the reward /
 * shop / rest / event scenes never have to know a Keepsake by name.
 */
export function relicRunFlags(list = []) {
  const f = {
    lostThingsMul: 1, luck: 0, restBonus: 0, shopDiscount: 1,
    revealUnknown: false, unlockEvents: false, flatRemoval: false,
    shopRare: false, noRestHeal: false, clueOnClear: false,
    enemyHpMul: 1, maxHpOnMilestone: 0,
  };
  for (const r of list) {
    const run = r?.run;
    if (!run) continue;
    if (run.lostThingsMul) f.lostThingsMul *= run.lostThingsMul;
    if (run.enemyHpMul) f.enemyHpMul *= run.enemyHpMul;
    if (run.shopDiscount) f.shopDiscount *= run.shopDiscount;
    if (run.luck) f.luck += run.luck;
    if (run.restBonus) f.restBonus += run.restBonus;
    if (run.maxHpOnMilestone) f.maxHpOnMilestone += run.maxHpOnMilestone;
    for (const k of ['revealUnknown', 'unlockEvents', 'flatRemoval', 'shopRare', 'noRestHeal', 'clueOnClear']) {
      if (run[k]) f[k] = true;
    }
  }
  return f;
}

export default { RELICS, relicById, makeRelic, rollKeepsake, relicRunFlags, relicSigil };
