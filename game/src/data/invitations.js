/**
 * Invitations — the Ballroom's offers, as real Tricks. OWNER: cards.
 * Source of truth: docs/design/regions/10-ballroom.md §2, §6, §7, §13, §15, §17.
 *
 * THESE ARE CARDS, and they live here rather than in `enemies/ballroom.js`
 * because of what that costs: `tests/seams/check.py` maps every `ctx` inside
 * `data/enemies/` to the ENEMY ctx, and a card effect uses the CARD ctx —
 * `ctx.draw`, `ctx.gainEnergy` and `ctx.modifyCost` are all real, and all of
 * them looked like calls into a surface that does not have them. The checker
 * was right about the ambiguity even though it was wrong about the calls: a
 * file of card definitions inside the enemy folder is a file whose ownership
 * cannot be read off its path.
 *
 * ── WHY AN INVITATION IS A CARD ─────────────────────────────────────────────
 *
 * §2 says an Invitation is "a temporary player choice", that the player may
 * Accept or Decline, and that it "should ALWAYS SHOW THE COMPLETE TERMS BEFORE
 * THE PLAYER CHOOSES. No hidden consequences."
 *
 * There is no engine surface for an enemy to stop the fight and ask a question.
 * But the game already has a thing that means "an offer, on the table, with its
 * whole cost written on it, which you may take or leave" — a card. Playing it
 * is Accept. Letting it expire is Decline. The terms are the card text.
 *
 * That satisfies §2's hardest clause for free: a card cannot have hidden
 * consequences, because everything it does is printed on it.
 *
 * The COST half of each bargain is deliberately NOT in here. The enemy that
 * made the offer takes its own payment in `onCardPlayed`, because the enemy is
 * what knows its own bookkeeping — and a card that quietly buffed the thing
 * hitting you would be exactly the hidden consequence §2 forbids. The text
 * still says who gets what.
 */

/* ══ Invitations ════════════════════════════════════════════════════════════ */

/**
 * One Invitation Trick. `cost: 0` so declining is never a Nerve decision,
 * `ethereal` so the offer expires with the turn rather than clogging the deck,
 * and `exhaust` so it cannot come round again.
 *
 * The COST half of the bargain is deliberately NOT in here. The enemy that made
 * the offer takes its own payment in `onCardPlayed`, because the enemy is what
 * knows its own bookkeeping — and because a card that quietly buffed the thing
 * hitting you would be the hidden consequence §2 forbids. The text says who
 * gets what.
 */
function invite(id, name, text, flavor, effect, nums) {
  return {
    id: `invite/${id}`, name, companion: 'status', type: 'status', rarity: 'special',
    cost: 0, target: 'self', exhaust: true, ethereal: true, nums: nums || {},
    text, flavor, keywords: ['exhaust', 'ethereal'],
    effect,
  };
}

export const INVITATION_TRICKS = [
  invite('sweet-treat', 'Sweet Treat',
    'Recover {h} Courage. The Party Phantom is delighted. [Vanish]',
    'A little iced thing on a silver tray, and it really is very good.',
    (ctx) => ctx.heal(ctx.self, ctx.card?.nums?.h ?? 5), { h: 5 }),

  invite('sparkling-punch', 'Sparkling Punch',
    'Gain {n} Nerve this turn. The Party Phantom is delighted. [Vanish]',
    'It fizzes in a way punch should not.',
    (ctx) => ctx.gainEnergy(ctx.card?.nums?.n ?? 1), { n: 1 }),

  invite('encore', 'Encore',
    'Draw {d} Tricks. The Party Phantom is delighted. [Vanish]',
    'Everyone is clapping. It would be rude not to.',
    (ctx) => ctx.draw(ctx.card?.nums?.d ?? 2), { d: 2 }),

  invite('take-a-sip', 'Take a Sip',
    'Lose {c} Courage. Your next Attack Trick this turn deals 5 more damage. [Vanish]',
    'Cordial, probably. It is very red and it is very cold.',
    (ctx) => {
      ctx.loseHp(ctx.self, ctx.card?.nums?.c ?? 4);
      ctx.applyStatus(ctx.self, 'exhilarated', 1);
    }, { c: 4 }),

  invite('welcome-in', 'Welcome In',
    'Draw 1 Trick and gain 1 Nerve this turn. The Grand Masque gains Favor. [Vanish]',
    'It holds the door as though it has been waiting all evening for you specifically.',
    (ctx) => { ctx.draw(1); ctx.gainEnergy(1); }),

  invite('your-turn', 'Your Turn',
    'Recover 6 Courage and draw 2 Tricks. The Grand Masque gains 2 Favor. [Vanish]',
    'It steps back from the middle of the floor and gestures you into it.',
    (ctx) => { ctx.heal(ctx.self, 6); ctx.draw(2); }),

  invite('appetizer', 'Appetizer',
    'Recover 5 Courage. The Host is pleased. [Vanish]',
    'Something small on a very large plate.',
    (ctx) => ctx.heal(ctx.self, 5)),

  invite('fine-drink', 'A Fine Drink',
    'Gain 2 Nerve this turn. Lose 4 Courage. The Host is pleased. [Vanish]',
    'The good bottle. It has been waiting for an occasion and you are one.',
    (ctx) => { ctx.gainEnergy(2); ctx.loseHp(ctx.self, 4); }),

  invite('private-performance', 'A Private Performance',
    'Draw 3 Tricks. Each of them costs 1 more Nerve this turn. The Host is pleased. [Vanish]',
    'The musicians turn to face you and only you.',
    (ctx) => {
      const before = new Set(ctx.cardsIn('hand').map(k => k && k.uid));
      ctx.draw(3);
      for (const k of ctx.cardsIn('hand')) {
        if (k && !before.has(k.uid)) ctx.modifyCost(k, 1, 'turn');
      }
    }),

  invite('anything-you-want', 'Anything You Want',
    'Gain 12 Guard. Lose 7 Courage. The Host reaches the end of its hospitality. [Vanish]',
    'It does not blink while it says this.',
    (ctx) => { ctx.block(ctx.self, 12); ctx.loseHp(ctx.self, 7); }),

  invite('goblet', 'The Goblet',
    'Lose {c} Courage. Gain {n} Nerve this turn. The Master gains Revelry. [Vanish]',
    'A tray at your elbow that was not there a moment ago.',
    (ctx) => {
      ctx.loseHp(ctx.self, ctx.card?.nums?.c ?? 4);
      ctx.gainEnergy(ctx.card?.nums?.n ?? 2);
    }, { c: 4, n: 2 }),

  invite('plate', 'The Plate',
    'Recover {h} Courage. The Master gains Revelry. [Vanish]',
    'You had not noticed you were hungry.',
    (ctx) => ctx.heal(ctx.self, ctx.card?.nums?.h ?? 6), { h: 6 }),

  invite('dance-card', 'The Dance Card',
    'Draw {d} Tricks. The Master gains Revelry. [Vanish]',
    'Your name is already on it, in a hand you do not recognise.',
    (ctx) => ctx.draw(ctx.card?.nums?.d ?? 2), { d: 2 }),
];
