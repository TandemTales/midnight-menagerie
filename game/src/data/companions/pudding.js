/**
 * Pudding, the Graveyard Pug.  OWNER: companion-cards.
 * Spec: docs/design/companions/12-pudding.md
 *
 * Best Friend · Loyalty · Plots · Bury · Dig Up · Unearthed · Graveside
 *
 * A very small dog who has appointed himself the graveyard's caretaker. He does
 * not command the dead; he keeps watch over them. His whole strategic tension is
 * one sentence from the chapter: **the graveyard is strongest when things stay
 * buried, and your best Tricks are strongest when you dig them back up.**
 *
 * ── The rules that decide whether he works ──────────────────────────────────
 *
 * 1. A PLOT IS A SLOT, NOT A PILE. Bones already buries Tricks in `stash` with a
 *    countdown on the card; Pudding's three Plots each perform ONE cemetery
 *    operation per turn, so "which plot" is a real question and the plot has
 *    state the card cannot carry. The cards live in `stash` so the pile renders
 *    and the engine owns them; the plot row beside it records which slot holds
 *    what and whether that slot has been turned over yet this turn.
 *
 * 2. BURIED TRICKS CANNOT BE PLAYED. `Pile.STASH` is playable — the zone exists
 *    for Hush's Shadow Pocket, a second hand. Mopsy's Torn pile borrows it for
 *    the opposite job and had to flag `unplayable`; so does this. Trap 17.
 *
 * 3. UNEARTHED IS "DUG UP THIS TURN", not "was ever buried". It is stamped with
 *    the turn on the card's own meta and read back against the current turn, so
 *    a Trick retained across the turn boundary loses it exactly as the spec
 *    says — unless Warm Spot by the Headstones is out, which is the one Power
 *    whose whole text is suspending that rule.
 *
 * 4. IN SOLO, PUDDING IS HIS OWN BEST FRIEND, and the chapter is explicit that a
 *    Trick naming both "you" and "your Best Friend" does not then pay twice.
 *    Every card therefore addresses `bf(c)` and never adds a separate self
 *    clause, so the same card is honest at one seat and at four.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'pudding';
const N = U.N;

const LOYALTY = 'loyalty';
const PLOTS = 'plots';

const BASE_PLOTS = 3;
const MAX_PLOTS = 4;              // Family Plot
const GRAVESIDE_AT = 2;
const BASE_LOYALTY = 5;
const BIG_LOYALTY = 8;            // Forever Home

const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ════════════════════════════════════════════════════════════════════════════
//  Best Friend
// ════════════════════════════════════════════════════════════════════════════

/**
 * Whoever Pudding has decided is his responsibility.
 *
 * Solo resolves to Pudding himself, which is what makes the whole normal pool
 * double as a support toolkit in a party without a second printing of every
 * defensive Trick.
 */
function bf(c) {
  const s = U.mm(c);
  if (!s.bestFriendId) return c.self;
  if (s.bestFriendId === c.self.id) return c.self;
  const found = c.party().find(p => p.id === s.bestFriendId && p.alive);
  return found || c.self;
}

function setBestFriend(c, who) {
  if (!who) return false;
  const s = U.mm(c);
  if (s.bestFriendId === who.id) return false;
  s.bestFriendId = who.id;
  U.fire(c, 'bestFriend', { who });
  return true;
}

/** Is this enemy's current action an Attack aimed at `who`? */
function aimsAt(c, en, who) {
  const m = en && en.pendingMove;
  if (!m || !ATTACK_INTENTS.has(m.intent)) return false;
  if (m.partyTarget === 'all' || m.partyTarget === 'two') return true;
  if (m.splash > 0 || m.splashFn) return true;
  const e = c.e;
  if (e && e.partyTargets) {
    let list = [];
    try { list = e.partyTargets(en, m) || []; } catch (_) { list = []; }
    if (list.length) return list.includes(who);
  }
  // Solo, or an engine with no party targeting: the one seat is the target.
  return true;
}

const threats = (c, who) => U.enemies(c).filter(en => aimsAt(c, en, who || bf(c)));
const threatened = (c, who) => threats(c, who).length > 0;

// ════════════════════════════════════════════════════════════════════════════
//  Loyalty
// ════════════════════════════════════════════════════════════════════════════

const loyalty = (c) => U.res(c, LOYALTY);
const loyaltyMax = (c) => (U.mm(c).foreverHome ? BIG_LOYALTY : BASE_LOYALTY);
const atMaxLoyalty = (c) => loyalty(c) >= loyaltyMax(c);

/** @returns {number} how much was actually gained. */
function gainLoyalty(c, n) {
  if (n <= 0) return 0;
  const s = U.mm(c);
  const room = loyaltyMax(c) - loyalty(c);
  if (room <= 0) {
    // Forever Home converts the overflow rather than wasting it.
    if (s.foreverHome) U.guardOn(c, bf(c), 6 * n);
    return 0;
  }
  const give = Math.min(n, room);
  U.addRes(c, LOYALTY, give, 0, BIG_LOYALTY);
  return give;
}

/** @returns {number} how much was actually spent — 0 if it could not be paid. */
function spendLoyalty(c, n) {
  if (n <= 0) return 0;
  if (loyalty(c) < n) return 0;
  U.addRes(c, LOYALTY, -n, 0, BIG_LOYALTY);
  const s = U.mm(c);
  U.bump(c, 'loyaltySpent', n);
  if (s.neverOffDuty && U.once(c, 'neverOffDuty')) U.guardOn(c, bf(c), s.neverOffDuty);
  U.fire(c, 'loyalty', { spent: n });
  return n;
}

const spentLoyaltyThisTurn = (c) => U.got(c, 'loyaltySpent') > 0;

// ════════════════════════════════════════════════════════════════════════════
//  Plots, Bury, Dig Up, Unearthed, Graveside
// ════════════════════════════════════════════════════════════════════════════

/**
 * The cemetery: one entry per Plot, each holding at most one Trick and each
 * able to perform one operation a turn.
 *
 * The cards themselves live in `stash` — the engine owns them there, the pile
 * button renders them, and they survive a save. This row is only the slot
 * bookkeeping the pile cannot express.
 */
function plots(c) {
  const s = U.mm(c);
  if (!s.plots) s.plots = [];
  const want = BASE_PLOTS + (s.extraPlots || 0);
  while (s.plots.length < want) s.plots.push({ card: null, used: false });
  return s.plots;
}

const occupied = (c) => plots(c).filter(p => p.card).length;
const graveside = (c) => occupied(c) >= GRAVESIDE_AT;
const buriedCards = (c) => plots(c).filter(p => p.card).map(p => p.card);
const freePlot = (c) => plots(c).find(p => !p.card && !p.used) || null;
const diggablePlot = (c, filter) =>
  plots(c).find(p => p.card && !p.used && (!filter || filter(p.card))) || null;

function syncPlotCounter(c) {
  const track = U.res(c, PLOTS);
  const now = occupied(c);
  if (track !== now) U.addRes(c, PLOTS, now - track, 0, MAX_PLOTS);
}

/**
 * Move a Trick from the hand into an empty Plot.
 *
 * @param {Object} o.plot   bury into this specific Plot
 * @param {boolean} o.free  does not spend the Plot's operation for the turn
 * @returns {boolean}
 */
function bury(c, card, o = {}) {
  if (!card) return false;
  const p = o.plot || freePlot(c);
  if (!p || p.card) return false;
  p.card = card;
  if (!o.free) p.used = true;
  U.moveCard(c, card, 'stash', { buried: true });
  /* Trap 17: the stash is PLAYABLE — it exists for Hush's second hand. A Buried
     Trick is the opposite and has to say so. */
  card.unplayable = true;
  card.meta.buried = true;
  syncPlotCounter(c);

  const s = U.mm(c);
  if (s.hauntedHeadstones && U.once(c, 'hauntedHeadstones')) U.guardOn(c, bf(c), s.hauntedHeadstones);
  if (s.littleGhostEscort) s.escortArmed = true;
  U.fire(c, 'bury', { card });
  return true;
}

/**
 * Move a Trick out of a Plot and into the hand, Unearthed for the turn.
 * @returns {Object|null} the Trick
 */
function digUp(c, o = {}) {
  const p = o.plot || diggablePlot(c, o.filter);
  if (!p || !p.card) return null;
  const card = p.card;
  p.card = null;
  if (!o.free) p.used = true;
  card.unplayable = false;
  card.meta.buried = false;
  syncPlotCounter(c);

  const s = U.mm(c);
  /* Treat for Later never comes back to the hand at all — being Dug Up IS its
     effect. Handled here rather than in its own card, because the card is not
     the thing being played when this happens. */
  if (U.flag(card, 'treat')) {
    const n = card.def && card.def.nums ? card.def.nums : { e: 1, c1: 1 };
    U.energy(c, n.e || 1);
    U.draw(c, n.c1 || 1);
    U.moveCard(c, card, 'exhaust', { vanish: true });
    U.fire(c, 'digUp', { card });
    return card;
  }

  U.moveCard(c, card, 'hand', { dugUp: true });
  markUnearthed(c, card);
  if (s.keeperOfTheYard && U.once(c, 'keeperOfTheYard')) U.costMod(c, card, -1, 'turn');
  if (card.meta.freshDirt) { card.meta.freshDirt = false; U.draw(c, 1); }
  U.fire(c, 'digUp', { card });
  return card;
}

function markUnearthed(c, card) {
  if (!card) return;
  card.meta.unearthedTurn = U.turn(c);
  /* Warm Spot by the Headstones: Unearthed lasts until the Trick is PLAYED
     rather than until the end of the turn, so the stamp stops being compared
     against the clock at all. */
  card.meta.unearthedSticky = !!U.mm(c).warmSpot;
}

const isUnearthed = (c, card) => {
  if (!card || !card.meta) return false;
  if (card.meta.unearthedSticky) return true;
  return card.meta.unearthedTurn === U.turn(c);
};

/** A Trick that was Dug Up this turn and is being played now. */
const playedUnearthed = (c) => isUnearthed(c, c.card);

/** Put a temporary 0-cost copy in hand. It Vanishes and cannot be Buried. */
function spectralCopy(c, def) {
  if (!def) return null;
  U.spawn(c, def, 'hand', {});
  const k = U.cardsIn(c, 'hand').slice(-1)[0];
  if (!k) return null;
  U.costSet(c, k, 0, 'turn');
  U.makeVanish(c, k);
  k.meta.noBury = true;
  return k;
}

const canBury = (c, card) => !!card && !card.meta.noBury;

/** Install a Power once. */
const power = (c, id, install) => {
  const s = U.mm(c);
  U.applySelf(c, id, 1);
  if (!s['pw:' + id]) { s['pw:' + id] = true; install(c, s); }
};

// ── the Loyalty track, declared at the capacity he actually has ─────────────
/*
 * Not at BIG_LOYALTY. The HUD prints the DECLARED max, so declaring at 8 shows
 * "LOYALTY 0/8" to a pug whose real ceiling is 5 — Boggle's Lurk shipped that
 * bug and Drizzle's Forecast row nearly did. Forever Home REDEFINES the track,
 * carrying the banked Loyalty across as `start`.
 */
const loyaltyTrack = (max, start = 0) => ({
  id: LOYALTY, name: 'Loyalty', icon: 'loyalty', min: 0, max, start,
  desc: 'Earned when something threatens your Best Friend. Spent on protection, retaliation and tempo.',
  states: [{ at: 0, label: 'Calm' }, { from: max, to: max, label: 'Devoted' }],
});

const plotTrack = (max, start = 0) => ({
  id: PLOTS, name: 'Plots', icon: 'plot', min: 0, max, start,
  desc: 'Occupied cemetery Plots. Two or more and Pudding is Graveside.',
  states: [{ at: 0, label: 'Empty' }, { from: GRAVESIDE_AT, to: max, label: 'Graveside' }],
});

// ════════════════════════════════════════════════════════════════════════════
//  per-combat bookkeeping
// ════════════════════════════════════════════════════════════════════════════
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [loyaltyTrack(BASE_LOYALTY), plotTrack(BASE_PLOTS)]);
  const fake = () => U.trackerCtx(e, seat);

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);

    // Every Plot can be turned over once more.
    for (const p of plots(c)) p.used = false;

    st.bfHurtLastTurn = !!st.bfHurtThisEnemyTurn;
    st.bfHurtThisEnemyTurn = false;

    /* The innate Loyalty rule: at most ONE a turn however many enemies are
       winding up, and only if they are winding up at the Best Friend — or at
       ANYBODY, once The Whole Pack has widened his remit. */
    const watching = st.wholePack
      ? c.party().some(pl => threatened(c, pl))
      : threatened(c);
    if (watching) gainLoyalty(c, 1);
    if (st.shiftSupervisor && graveside(c)) gainLoyalty(c, 1);

    if (st.drawNextTurn) { U.draw(c, st.drawNextTurn); st.drawNextTurn = 0; }
    st.escortArmed = false;

    /* Community Plot hands every friend's stored Trick back, discounted. Their
       card, so it moves inside THEIR seat — `moveCard` acts on the acting seat's
       piles and would silently move nothing otherwise. */
    if (st.shared && st.shared.length) {
      for (const entry of st.shared.splice(0)) {
        const owner = c.party().find(pl => pl.id === entry.ownerId);
        if (!owner || !entry.card) continue;
        entry.card.unplayable = false;
        c.allyMoveCard(owner, entry.card, 'hand', {});
        U.costMod(c, entry.card, -entry.discount, 'turn');
      }
    }
    syncPlotCounter(c);

    /* The two Powers whose text is "once each turn you MAY". Neither has a
       Trick to hang off, so the offer is made at the top of the turn and only
       when it could actually do something — a prompt for nothing every round
       would be worse than the Power. */
    if (st.wholePack && c.isParty()) {
      (async () => {
        const pool = c.party().filter(pl => pl !== bf(c));
        if (!pool.length) return;
        const pick = await c.choose({
          options: [...pool.map(pl => `Look after ${pl.name}`), 'Stay where he is'],
          prompt: 'The Whole Pack', optional: true,
        });
        const who = pool[pick[0]];
        if (who && setBestFriend(c, who)) U.guardOn(c, who, st.wholePack);
      })();
    }
    if (st.cemeteryGates && buriedCards(c).length && U.cardsIn(c, 'hand').length) {
      (async () => {
        const [want] = await U.pickCards(c, {
          pile: 'stash', pool: buriedCards(c), count: 1, optional: true,
          prompt: 'Cemetery Gates — bring back which Trick?',
        });
        if (!want) return;
        const [give] = await U.pickCards(c, {
          pile: 'hand', count: 1, optional: true,
          prompt: 'And put which one in its place?', filter: (x) => canBury(c, x),
        });
        if (!give) return;
        const p = plots(c).find(x => x.card === want);
        if (!p) return;
        p.card = give; p.used = true;
        want.unplayable = false; want.meta.buried = false;
        give.unplayable = true; give.meta.buried = true;
        U.moveCard(c, want, 'hand', {});
        U.moveCard(c, give, 'stash', { buried: true });
        markUnearthed(c, want);
      })();
    }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    if (st.hallowedGround && graveside(c)) U.guardOn(c, bf(c), st.hallowedGround);
    if (st.graveyardChoir && graveside(c)) {
      for (let i = 0; i < occupied(c); i++) U.hitAll(c, st.graveyardChoir);
    }
    /* Unearthed normally expires with the turn. Nothing has to be cleared for
       that — `isUnearthed` compares the stamp against the CURRENT turn — but a
       sticky stamp from Warm Spot has to survive, which is why it is a separate
       flag rather than a bigger number. */
  }, seat);

  /* Dog Eared Epitaph and The Goodest Ghost both fire on an Unearthed Trick
     actually being played. `ev.actorId` against `seat.id`, never `ev.seat`,
     which is a number while the tracker's seat is an actor (trap 18). */
  e.on('card:play', (ev) => {
    if (!ev || ev.actorId !== seat.id) return;
    const c = fake();
    const st = U.mm(c);
    /* `ev.card` is a SNAPSHOT (trap 19) — the Unearthed stamp lives on the
       RUNTIME card, so it has to be looked up by uid. */
    const card = e.card(ev.cardUid);
    if (!card) return;

    if (isUnearthed(c, card)) {
      if (st.dogEaredEpitaph && U.once(c, 'dogEared')) U.draw(c, 1);
      if (st.goodestGhost && card.type !== POWER && U.once(c, 'goodestGhost')) {
        spectralCopy(c, card.def);
      }
      if (card.meta.unearthedSticky) card.meta.unearthedSticky = false;   // spent by playing it
    }
    if (st.littleGhostEscort && st.escortArmed && card.type === ATTACK && U.once(c, 'escort')) {
      st.escortArmed = false;
      const t = c.target || c.randomEnemy();
      if (t) U.hitAt(c, t, st.littleGhostEscort);
    }
  });

  /* Home Is Where You Are. `onLethal` is the engine's "about to hit 0" step; its
     payload names the victim `defender` and survives via `setHp(n)` — there is
     no `actor` and no `survive`, and reaching for either would have been a
     silent no-op on the one Power whose whole job is not being silent. */
  e.hooks.add('onLethal', (h) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.homeIsWhereYouAre || st.homeUsed) return;
    if (!h || h.defender !== bf(c)) return;
    st.homeUsed = true;
    h.setHp(1);
    U.setRes(c, LOYALTY, loyaltyMax(c), 0, BIG_LOYALTY);
    for (const k of U.cardsIn(c, 'discard').slice()) {
      if (!freePlot(c)) break;
      bury(c, k, { free: true });
    }
  });

  /* Graveyard Rules adds damage to an Attack that is already resolving, so it
     has to be a damage REDUCER on the seat rather than anything card-shaped.
     Value reducers take `(amount, payload)`; void hooks take `(payload)`, and
     the two are not interchangeable. */
  e.hooks.add('modifyDamageDealt', (amt, h) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.graveyardRules || !graveside(c)) return amt;
    if (!h || h.kind !== 'attack' || !h.card) return amt;
    if (!h.defender || !aimsAt(c, h.defender, bf(c))) return amt;
    if (!U.once(c, 'graveyardRules')) return amt;
    return amt + st.graveyardRules;
  }, { owner: seat });

  /* Finish a burial the played Trick asked for. Trap 16: the engine parks a
     resolving Trick in LIMBO and pushes it to the discard the instant the effect
     returns, so Never Drop the Ball, Treat for Later and Bury the Hatchet cannot
     bury themselves from inside their own effect. */
  e.on('card:resolved', (ev) => {
    const c = fake();
    const st = U.mm(c);
    const want = st.awaitingBury;
    if (!want || ev.cardUid !== want.uid) return;
    st.awaitingBury = null;
    bury(c, want);
  });

  /* All Dogs Go Somewhere: once a combat, a Vanishing Trick lands in a Plot. */
  e.hooks.add('onCardExhausted', (h) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.allDogs || st.allDogsUsed) return;
    const k = h && h.card;
    if (!k || !canBury(c, k) || !freePlot(c)) return;
    st.allDogsUsed = true;
    bury(c, k);
  }, { owner: seat });

  /* Track whether the Best Friend actually lost Courage, for Leave My Person
     Alone. The `damage` event carries `targetId`, never `defender` (trap 11). */
  e.on('damage', (ev) => {
    if (!ev || !ev.hpLoss) return;
    const c = fake();
    if (ev.targetId !== bf(c).id) return;
    U.mm(c).bfHurtThisEnemyTurn = true;
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('bury', 'pudding/haunted-headstones', () => {});
U.onHook('digUp', 'pudding/keeper-of-the-yard', () => {});
U.onHook('loyalty', 'pudding/never-off-duty', () => {});
U.onHook('bestFriend', 'pudding/the-whole-pack', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'pudding/little-chomp', name: 'Little Chomp', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'All of the intent, roughly a fifth of the teeth.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'pudding/guard-the-ankles', name: 'Guard the Ankles', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard.',
    flavor: 'Nothing gets past the ankles. Nothing.',
    nums: { b: 5 },
    effect: eff((c) => U.guardOn(c, bf(c), N(c).b)),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'pudding/bury-this', name: 'Bury This!', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, keywords: ['bury', 'plot'],
    text: '[Bury] another Trick from your hand. Draw {c1} Trick.',
    flavor: 'For safekeeping. He is very serious about this.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k && bury(c, k)) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'pudding/dig-it-up', name: 'Dig It Up!', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['dig-up', 'unearthed', 'best-friend'],
    text: '[Dig Up] one Trick. With no Plot to dig, your [Best Friend] gains {b} Guard instead.',
    flavor: 'He remembers exactly where. He always does.',
    nums: { b: 5 },
    effect: eff((c) => { if (!digUp(c)) U.guardOn(c, bf(c), N(c).b); }),
    upgrade: { nums: { b: 8 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'pudding/protective-nip', name: 'Protective Nip', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['best-friend'],
    text: 'Deal {d} damage. If the target is winding up at your [Best Friend], they gain {b} Guard.',
    flavor: 'A warning. Delivered at shin height.',
    nums: { d: 7, b: 5 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && aimsAt(c, t, bf(c))) U.guardOn(c, bf(c), N(c).b);
    }),
    upgrade: { nums: { d: 10, b: 7 } },
  },
  {
    id: 'pudding/bark-first', name: 'Bark First, Ask Later', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['best-friend'],
    text: 'Deal {d} damage, or {m0} more if it is winding up at your [Best Friend].',
    flavor: 'The asking part never actually happens.',
    nums: { d: 6, m0: 4 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d + (t && aimsAt(c, t, bf(c)) ? N(c).m0 : 0));
    }),
    upgrade: { nums: { d: 9, m0: 5 } },
  },
  {
    id: 'pudding/headstone-hop', name: 'Headstone Hop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['graveside', 'plot'],
    text: 'Deal {d} damage. While [Graveside], gain {b} Guard.',
    flavor: 'Up, along, and off the end. A practised route.',
    nums: { d: 9, b: 5 },
    effect: eff((c) => { U.hit(c, N(c).d); if (graveside(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 12, b: 7 } },
  },
  {
    id: 'pudding/muddy-tackle', name: 'Muddy Tackle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['unearthed'],
    text: 'Deal {d} damage to all enemies. [Unearthed]: deal {m0} more.',
    flavor: 'He has been digging. It shows.',
    nums: { d: 5, m0: 3 },
    effect: eff((c) => U.hitAll(c, N(c).d + (playedUnearthed(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 7, m0: 4 } },
  },
  {
    id: 'pudding/grave-dirt', name: 'Grave Dirt in Your Eyes', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['best-friend'],
    text: 'Deal {d} damage and apply {n} Weak.',
    flavor: 'Kicked backwards with great precision.',
    nums: { d: 6, n: 1 },
    effect: eff((c) => { const t = c.target; U.hit(c, N(c).d); U.apply(c, t, 'weak', N(c).n); }),
    upgrade: { nums: { d: 9, n: 2 } },
  },
  {
    id: 'pudding/collar-charge', name: 'Collar Charge', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['loyalty'],
    text: 'Deal {d} damage. Costs 1 less Nerve if you have spent [Loyalty] this turn.',
    flavor: 'The collar arrives slightly before the dog.',
    nums: { d: 15 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (spentLoyaltyThisTurn(c) ? 1 : 2),
    upgrade: { nums: { d: 20 } },
  },
  {
    id: 'pudding/digging-claws', name: 'Digging Claws', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['unearthed', 'loyalty'],
    text: 'Deal {d} damage. [Unearthed]: also gain {n} [Loyalty].',
    flavor: 'Small. Efficient. Alarming.',
    nums: { d: 9, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (playedUnearthed(c)) gainLoyalty(c, N(c).n); }),
    upgrade: { nums: { d: 12, n: 1 } },
  },
  {
    id: 'pudding/stay-back', name: 'Stay Back!', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['loyalty', 'best-friend'],
    text: 'Deal {d} damage. You may spend {n} [Loyalty] to give your [Best Friend] {b} Guard.',
    flavor: 'He has planted himself. That is the whole plan.',
    nums: { d: 9, n: 1, b: 6 },
    effect: eff((c) => { U.hit(c, N(c).d); if (spendLoyalty(c, N(c).n)) U.guardOn(c, bf(c), N(c).b); }),
    upgrade: { nums: { d: 12, n: 1, b: 9 } },
  },
  {
    id: 'pudding/stay-close', name: 'Stay Close', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard, or {m0} more if anything is winding up at them.',
    flavor: 'Right by the leg. Exactly there.',
    nums: { b: 8, m0: 4 },
    effect: eff((c) => U.guardOn(c, bf(c), N(c).b + (threatened(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 11, m0: 6 } },
  },
  {
    id: 'pudding/bury-it-better', name: 'Bury It Better', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['bury', 'plot'],
    text: '[Bury] another Trick from your hand. If it was not Basic, draw {c1} Trick.',
    flavor: 'Deeper. Tidier. With a small pat at the end.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (!k) return;
      const wasBasic = k.rarity === BASIC;
      if (bury(c, k) && !wasBasic) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'pudding/sniff-around', name: 'Sniff Around', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bury', 'plot'],
    text: 'Look at the top {n} Tricks. Put one in your hand and you may [Bury] one of the others.',
    flavor: 'Thorough. Extremely thorough. Still going.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const top = U.cardsIn(c, 'draw').slice(-N(c).n);
      if (!top.length) return;
      const [keep] = await U.pickCards(c, { pile: 'draw', pool: top, count: 1, prompt: 'Take which Trick?' });
      if (keep) U.toHand(c, keep);
      const rest = top.filter(k => k !== keep);
      if (rest.length && freePlot(c)) {
        const [put] = await U.pickCards(c, { pile: 'draw', pool: rest, count: 1, optional: true, prompt: 'Bury one of the others?' });
        if (put) bury(c, put);
      }
    }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'pudding/dig-here', name: 'Dig Here!', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['dig-up', 'unearthed'],
    text: '[Dig Up] one Trick. It costs {n} less Nerve this turn.',
    flavor: 'He is certain. He has been certain for some time.',
    nums: { n: 1 },
    effect: eff((c) => { const k = digUp(c); if (k) U.costMod(c, k, -N(c).n, 'turn'); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pudding/plot-patrol', name: 'Plot Patrol', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['plot', 'best-friend'],
    text: 'Your [Best Friend] gains {b} Guard, and {m0} more for each occupied [Plot].',
    flavor: 'A full circuit of the grounds, at speed.',
    nums: { b: 4, m0: 4 },
    effect: eff((c) => U.guardOn(c, bf(c), N(c).b + N(c).m0 * occupied(c))),
    upgrade: { nums: { b: 6, m0: 6 } },
  },
  {
    id: 'pudding/good-dog-reserve', name: 'Good Dog Reserve', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['loyalty', 'vanish'],
    text: 'Spend {n} [Loyalty]. Gain {e} Nerve. [Vanish].',
    flavor: 'Cashing in a very small amount of goodwill.',
    nums: { n: 1, e: 1 },
    playable: (c) => loyalty(c) >= 1,
    effect: eff((c) => { if (spendLoyalty(c, N(c).n)) U.energy(c, N(c).e); }),
    upgrade: { nums: { n: 1, e: 2 } },
  },
  {
    id: 'pudding/tail-on-watch', name: 'Tail on Watch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['loyalty', 'best-friend'],
    text: 'Gain {n} [Loyalty]. At maximum already, your [Best Friend] gains {b} Guard instead.',
    flavor: 'It has not stopped once. Not once.',
    nums: { n: 1, b: 8 },
    effect: eff((c) => { if (atMaxLoyalty(c)) U.guardOn(c, bf(c), N(c).b); else gainLoyalty(c, N(c).n); }),
    upgrade: { nums: { n: 2, b: 11 } },
  },
  {
    id: 'pudding/fresh-flowers', name: 'Fresh Flowers', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bury', 'graveside', 'best-friend'],
    text: '[Bury] a Trick. Your [Best Friend] gains {b} Guard, and {m0} more if this made you [Graveside].',
    flavor: 'Picked from the good bush. He knows which one.',
    nums: { b: 5, m0: 5 },
    effect: eff(async (c) => {
      const before = graveside(c);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k) bury(c, k);
      U.guardOn(c, bf(c), N(c).b + (!before && graveside(c) ? N(c).m0 : 0));
    }),
    upgrade: { nums: { b: 8, m0: 8 } },
  },
  {
    id: 'pudding/reburial', name: 'Reburial', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['dig-up', 'bury', 'plot'],
    text: '[Dig Up] a Trick. If another [Plot] is free, you may [Bury] a different Trick there.',
    flavor: 'Reorganising. It had to happen eventually.',
    nums: {},
    effect: eff(async (c) => {
      if (!digUp(c)) return;
      if (!freePlot(c)) return;
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k) bury(c, k);
    }),
    upgrade: { text: '[Dig Up] a Trick and draw one. If another [Plot] is free, you may [Bury] a different Trick there.' },
  },
  {
    id: 'pudding/sit-with-me', name: 'Sit With Me', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['unearthed', 'best-friend'],
    text: 'Keep a Trick in hand through this turn. If it is [Unearthed], your [Best Friend] gains {b} Guard.',
    flavor: 'Just sitting. Companionably. For hours.',
    nums: { b: 5 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Keep which Trick?' });
      if (!k) return;
      U.retain(c, k, 'turn');
      if (isUnearthed(c, k)) U.guardOn(c, bf(c), N(c).b);
    }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'pudding/haunted-headstones', name: 'Haunted Headstones', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bury', 'best-friend'],
    text: 'The first time you [Bury] a Trick each turn, your [Best Friend] gains {b} Guard.',
    flavor: 'The stones approve. Faintly.',
    nums: { b: 5 },
    effect: eff((c) => power(c, 'pudding/haunted-headstones', (x, s) => { s.hauntedHeadstones = N(x).b; })),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'pudding/graveyard-rules', name: 'Graveyard Rules', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['graveside', 'best-friend'],
    text: 'While [Graveside], your first Attack each turn on something winding up at your [Best Friend] deals {m0} more.',
    flavor: 'There are rules here. He wrote them. Nobody can read them.',
    nums: { m0: 6 },
    effect: eff((c) => power(c, 'pudding/graveyard-rules', (x, s) => { s.graveyardRules = N(x).m0; })),
    upgrade: { nums: { m0: 9 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'pudding/you-heard-me-bark', name: 'You Heard Me Bark', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['loyalty', 'best-friend'],
    text: 'Deal {d} damage. If it is winding up at your [Best Friend], you may spend {n} [Loyalty] to repeat it.',
    flavor: 'He did. Everyone did.',
    nums: { d: 9, n: 1, hits: 2 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && aimsAt(c, t, bf(c)) && spendLoyalty(c, N(c).n)) U.hitAt(c, t, N(c).d);
    }),
    upgrade: { nums: { d: 13, n: 1, hits: 2 } },
  },
  {
    id: 'pudding/headstone-ricochet', name: 'Headstone Ricochet', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['plot'],
    text: 'Deal {d} damage to all enemies, then {d} more at random for each occupied [Plot].',
    flavor: 'Off one, off the next, off a third, into a hedge.',
    nums: { d: 5, hits: 4 },
    balance: { scalesWith: 'occupied Plots' },
    effect: eff((c) => { U.hitAll(c, N(c).d); U.hitRandomN(c, N(c).d, occupied(c)); }),
    upgrade: { nums: { d: 7, hits: 4 } },
  },
  {
    id: 'pudding/dug-up-trouble', name: 'Dug Up Trouble', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['unearthed'],
    text: 'Deal {d} damage. [Unearthed]: deal it again.',
    flavor: 'Whatever it was, it is awake now.',
    nums: { d: 9, hits: 2 },
    effect: eff((c) => { const t = c.target; U.hit(c, N(c).d); if (playedUnearthed(c)) U.hitAt(c, t, N(c).d); }),
    upgrade: { nums: { d: 13, hits: 2 } },
  },
  {
    id: 'pudding/graveyard-gallop', name: 'Graveyard Gallop', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['graveside', 'loyalty'],
    text: 'Deal {d} damage to all enemies. While [Graveside], gain {n} [Loyalty].',
    flavor: 'A lap of honour nobody requested.',
    nums: { d: 12, n: 1 },
    effect: eff((c) => { U.hitAll(c, N(c).d); if (graveside(c)) gainLoyalty(c, N(c).n); }),
    upgrade: { nums: { d: 16, n: 2 } },
  },
  {
    id: 'pudding/threat-assessment', name: 'Threat Assessment', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['best-friend'],
    text: 'Deal {d} damage. If it is winding up at your [Best Friend], apply {n} Weak.',
    flavor: 'He has looked it up and down. He is not impressed.',
    nums: { d: 9, n: 2 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && aimsAt(c, t, bf(c))) U.apply(c, t, 'weak', N(c).n);
    }),
    upgrade: { nums: { d: 13, n: 3 } },
  },
  {
    id: 'pudding/collar-snap', name: 'Collar Snap', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['loyalty'],
    text: 'Deal {d} damage twice. You may spend {n} [Loyalty] to hit a third time.',
    flavor: 'Snap. Snap. Optional third snap.',
    nums: { d: 5, n: 1, hits: 3 },
    effect: eff((c) => {
      const t = c.target;
      U.hitN(c, N(c).d, 2);
      if (spendLoyalty(c, N(c).n)) U.hitAt(c, t, N(c).d);
    }),
    upgrade: { nums: { d: 7, n: 1, hits: 3 } },
  },
  {
    id: 'pudding/cemetery-shortcut', name: 'Cemetery Shortcut', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['dig-up', 'plot'],
    text: 'Deal {d} damage. You may then [Dig Up] an Attack.',
    flavor: 'Through the yew, under the railing, out by the shed.',
    nums: { d: 6 },
    effect: eff((c) => { U.hit(c, N(c).d); digUp(c, { filter: (k) => k.type === ATTACK }); }),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'pudding/leave-my-person-alone', name: 'Leave My Person Alone', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['best-friend'],
    text: 'Deal {d} damage. Costs 1 Nerve if your [Best Friend] lost Courage last enemy turn.',
    flavor: 'The politest thing he is willing to say about it.',
    nums: { d: 16 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (U.mm(c).bfHurtLastTurn ? 1 : 2),
    upgrade: { nums: { d: 21 } },
  },
  {
    id: 'pudding/muddy-revenge', name: 'Muddy Revenge', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['plot'],
    text: 'Deal {d} damage, and once more for each occupied [Plot].',
    flavor: 'Every paw accounted for.',
    nums: { d: 5, hits: 4 },
    balance: { scalesWith: 'occupied Plots' },
    effect: eff((c) => U.hitN(c, N(c).d, 1 + occupied(c))),
    upgrade: { nums: { d: 7, hits: 4 } },
  },
  {
    id: 'pudding/crypt-keepers-chomp', name: "Crypt Keeper's Chomp", companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['graveside', 'best-friend'],
    text: 'Deal {d} damage. While [Graveside], your [Best Friend] gains {b} Guard.',
    flavor: 'He has the keys. Metaphorically. He has no pockets.',
    nums: { d: 16, b: 9 },
    effect: eff((c) => { U.hit(c, N(c).d); if (graveside(c)) U.guardOn(c, bf(c), N(c).b); }),
    upgrade: { nums: { d: 21, b: 13 } },
  },
  {
    id: 'pudding/never-drop-the-ball', name: 'Never Drop the Ball', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bury', 'plot', 'unearthed'],
    text: 'Deal {d} damage. If this was not [Unearthed], you may [Bury] it instead of discarding it.',
    flavor: 'He has held it for six hours. He will hold it for six more.',
    nums: { d: 9 },
    effect: eff((c) => {
      const self = c.card;
      const wasUnearthed = playedUnearthed(c);
      U.hit(c, N(c).d);
      /* Trap 16: the played Trick is already parked in LIMBO and the engine
         pushes it to the discard the moment this returns, so the burial is
         finished on `card:resolved` instead. */
      if (!wasUnearthed && freePlot(c)) U.mm(c).awaitingBury = self;
    }),
    upgrade: { nums: { d: 13 } },
  },
  {
    id: 'pudding/ghost-hound-charge', name: 'Ghost Hound Charge', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 3, target: ENEMY, keywords: ['graveside', 'loyalty'],
    text: 'Deal {d} damage. Costs 1 less while [Graveside] and 1 less at maximum [Loyalty].',
    flavor: 'Briefly, and unmistakably, enormous.',
    nums: { d: 28 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => Math.max(1, 3 - (graveside(c) ? 1 : 0) - (atMaxLoyalty(c) ? 1 : 0)),
    upgrade: { nums: { d: 36 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'pudding/take-me-instead', name: 'Take Me Instead', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['best-friend'],
    text: 'Gain {b} Guard. In a party, an Attack aimed at your [Best Friend] comes to Pudding instead.',
    flavor: 'He steps in front. He is nine inches tall.',
    nums: { b: 13 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      const who = bf(c);
      if (who === c.self) return;
      /* Racket is the engine's taunt — `intentTargetFor` prefers a seat wearing
         it over the move's own party preference. Redirecting by rewriting the
         enemy's pending move would fight the intent display, which is shown to
         the players before they act and has to survive a replay. */
      U.applySelf(c, 'racket', 1);
    }),
    upgrade: { nums: { b: 18 } },
  },
  {
    id: 'pudding/good-dog-emergency', name: 'Good Dog Emergency', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loyalty', 'best-friend'],
    text: 'Spend up to {n} [Loyalty]. Your [Best Friend] gains {b} Guard for each spent.',
    flavor: 'It is an emergency because he says it is.',
    nums: { n: 2, b: 9 },
    effect: eff((c) => {
      let spent = 0;
      for (let i = 0; i < N(c).n; i++) if (spendLoyalty(c, 1)) spent++;
      U.guardOn(c, bf(c), N(c).b * spent);
    }),
    upgrade: { nums: { n: 3, b: 9 } },
  },
  {
    id: 'pudding/paws-on-the-plot', name: 'Paws on the Plot', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['bury', 'graveside'],
    text: 'You may [Bury] one Trick. If it makes you [Graveside], draw {c1} Trick.',
    flavor: 'Both front paws. Ceremonially.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const before = graveside(c);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k && bury(c, k) && !before && graveside(c)) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'pudding/careful-excavation', name: 'Careful Excavation', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['dig-up', 'unearthed'],
    text: '[Dig Up] a Trick. If you do not play it this turn, keep it in hand. It still loses [Unearthed].',
    flavor: 'A small brush. Immense concentration.',
    nums: {},
    effect: eff((c) => { const k = digUp(c); if (k) U.retain(c, k, 'combat'); }),
    upgrade: { text: '[Dig Up] two Tricks. If you do not play them this turn, keep them in hand. They still lose [Unearthed].' },
  },
  {
    id: 'pudding/sniff-out-the-good-one', name: 'Sniff Out the Good One', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bury', 'plot'],
    text: 'Search your draw pile. Put that Trick in your hand, or [Bury] it directly.',
    flavor: 'It is at the bottom. It is always at the bottom.',
    nums: {},
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Find which Trick?' });
      if (!k) return;
      const opts = freePlot(c) ? ['Into your hand', 'Straight into a Plot'] : ['Into your hand'];
      const pick = await c.choose({ options: opts, prompt: 'Where does it go?' });
      if (pick[0] === 1) bury(c, k); else U.toHand(c, k);
      U.reshuffle(c);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/fresh-dirt', name: 'Fresh Dirt', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['bury', 'plot'],
    text: '[Bury] a Trick. The next time that Trick is [Dig Up]-ed this combat, draw {c1} Trick.',
    flavor: 'Still soft. Still warm. Recently attended to.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k && bury(c, k)) k.meta.freshDirt = true;
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'pudding/move-the-flowers', name: 'Move the Flowers', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plot'],
    text: 'Swap a Trick in your hand for a Buried one. This is not [Bury] or [Dig Up], and it is not [Unearthed].',
    flavor: 'A tidy-up, technically.',
    nums: {},
    effect: eff(async (c) => {
      const row = plots(c).filter(p => p.card);
      if (!row.length) return;
      const [want] = await U.pickCards(c, { pile: 'stash', pool: row.map(p => p.card), count: 1, prompt: 'Bring back which Trick?' });
      const [give] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Put which Trick in its place?', filter: (x) => canBury(c, x) });
      if (!want || !give) return;
      const p = row.find(x => x.card === want);
      p.card = give;
      want.unplayable = false; want.meta.buried = false;
      give.unplayable = true; give.meta.buried = true;
      U.moveCard(c, want, 'hand', {});
      U.moveCard(c, give, 'stash', { buried: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/night-patrol', name: 'Night Patrol', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loyalty', 'graveside', 'best-friend'],
    text: 'Gain {n} [Loyalty]. While [Graveside], your [Best Friend] also gains {b} Guard.',
    flavor: 'Three circuits, then a long stare at nothing.',
    nums: { n: 1, b: 9 },
    effect: eff((c) => { gainLoyalty(c, N(c).n); if (graveside(c)) U.guardOn(c, bf(c), N(c).b); }),
    upgrade: { nums: { n: 2, b: 13 } },
  },
  {
    id: 'pudding/double-dig', name: 'Double Dig', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['dig-up', 'plot'],
    text: '[Dig Up] as many as {n} Tricks from different [Plot]s. Each costs {m0} less this turn.',
    flavor: 'Both paws, alternating, at a frankly unsafe speed.',
    nums: { n: 2, m0: 1 },
    effect: eff((c) => {
      for (let i = 0; i < N(c).n; i++) {
        const k = digUp(c);
        if (!k) break;
        U.costMod(c, k, -N(c).m0, 'turn');
      }
    }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'pudding/graveyard-picnic', name: 'Graveyard Picnic', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['graveside', 'bury'],
    text: 'Playable only while [Graveside]. Draw {c1} Tricks, then [Bury] one from your hand.',
    flavor: 'A blanket. A sandwich. Several headstones.',
    nums: { c1: 2 },
    playable: (c) => graveside(c),
    effect: eff(async (c) => {
      U.draw(c, N(c).c1);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k) bury(c, k);
    }),
    upgrade: { nums: { c1: 3 } },
  },
  {
    id: 'pudding/pug-sized-shield', name: 'Pug Sized Shield', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard. If that is somebody else, Pudding gains {m0} too.',
    flavor: 'It is not a large shield. It is a very determined one.',
    nums: { b: 13, m0: 5 },
    effect: eff((c) => {
      const who = bf(c);
      U.guardOn(c, who, N(c).b);
      if (who !== c.self) U.guard(c, N(c).m0);
    }),
    upgrade: { nums: { b: 18, m0: 8 } },
  },
  {
    id: 'pudding/treat-for-later', name: 'Treat for Later', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['bury', 'plot', 'vanish'],
    text: '[Bury] this. When it is [Dig Up]-ed, gain {e} Nerve, draw {c1} Trick, and it [Vanish]es.',
    flavor: 'Hidden behind the third headstone. Obviously.',
    nums: { e: 1, c1: 1 },
    effect: eff((c) => { U.mm(c).awaitingBury = c.card; U.setFlag(c.card, 'treat', true); }),
    upgrade: { nums: { e: 2, c1: 1 } },
  },
  {
    id: 'pudding/digging-frenzy', name: 'Digging Frenzy', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['dig-up', 'bury', 'plot'],
    text: '[Dig Up] one Trick, then you may [Bury] a different one. The dug Trick costs {m0} less this turn.',
    flavor: 'Dirt everywhere. Genuinely everywhere.',
    nums: { m0: 1 },
    effect: eff(async (c) => {
      const k = digUp(c);
      if (k) U.costMod(c, k, -N(c).m0, 'turn');
      if (!freePlot(c)) return;
      const [put] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) && x !== k });
      if (put) bury(c, put);
    }),
    upgrade: { nums: { m0: 2 } },
  },
  {
    id: 'pudding/cemetery-map', name: 'Cemetery Map', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bury', 'plot'],
    text: 'Look at the top {n} Tricks. Put one in your hand and optionally [Bury] one.',
    flavor: 'Drawn in mud, from memory, by a dog.',
    nums: { n: 5 },
    effect: eff(async (c) => {
      const top = U.cardsIn(c, 'draw').slice(-N(c).n);
      if (!top.length) return;
      const [keep] = await U.pickCards(c, { pile: 'draw', pool: top, count: 1, prompt: 'Take which Trick?' });
      if (keep) U.toHand(c, keep);
      const rest = top.filter(k => k !== keep);
      if (rest.length && freePlot(c)) {
        const [put] = await U.pickCards(c, { pile: 'draw', pool: rest, count: 1, optional: true, prompt: 'Bury one?' });
        if (put) bury(c, put);
      }
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/loyal-little-idiot', name: 'Loyal Little Idiot', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['loyalty', 'vanish'],
    text: 'Lose all your Guard. Gain {n} [Loyalty], or only {m0} if you had none. [Vanish].',
    flavor: 'He has thought about this exactly as much as you think.',
    nums: { n: 2, m0: 1 },
    effect: eff((c) => {
      const had = c.self.block > 0;
      U.stripGuard(c, c.self, c.self.block);
      gainLoyalty(c, had ? N(c).n : N(c).m0);
    }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'pudding/share-the-blanket', name: 'Share the Blanket', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard. If that is somebody else, Pudding gains it too; if it is himself, gain {m0} instead.',
    flavor: 'There is enough blanket. There is always enough blanket.',
    nums: { b: 9, m0: 14 },
    effect: eff((c) => {
      const who = bf(c);
      if (who === c.self) { U.guard(c, N(c).m0); return; }
      U.guardOn(c, who, N(c).b);
      U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 13, m0: 19 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'pudding/hallowed-ground', name: 'Hallowed Ground', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['graveside', 'best-friend'],
    text: 'While [Graveside], your [Best Friend] gains {b} Guard at the end of your turn.',
    flavor: 'Something here has decided to be kind.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'pudding/hallowed-ground', (x, s) => { s.hallowedGround = N(x).b; })),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'pudding/dog-eared-epitaph', name: 'Dog Eared Epitaph', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unearthed'],
    text: 'The first [Unearthed] Trick you play each turn draws {c1} Trick afterwards.',
    flavor: 'The corner is turned down. He did that.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'pudding/dog-eared-epitaph', (x, s) => { s.dogEaredEpitaph = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/never-off-duty', name: 'Never Off Duty', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loyalty', 'best-friend'],
    text: 'The first time you spend [Loyalty] each turn, your [Best Friend] gains {b} Guard.',
    flavor: 'Asleep. Still on duty. Somehow both.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'pudding/never-off-duty', (x, s) => { s.neverOffDuty = N(x).b; })),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'pudding/keeper-of-the-yard', name: 'Keeper of the Yard', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['dig-up'],
    text: 'The first Trick you [Dig Up] each turn costs 1 less Nerve that turn.',
    flavor: 'It is his yard. It has been for a hundred years.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/keeper-of-the-yard', (x, s) => { s.keeperOfTheYard = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/little-ghost-escort', name: 'Little Ghost Escort', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['bury'],
    text: 'The first Attack you play after [Bury]ing a Trick each turn deals {m0} more.',
    flavor: 'Something small walks him to the gate every night.',
    nums: { m0: 9 },
    effect: eff((c) => power(c, 'pudding/little-ghost-escort', (x, s) => { s.littleGhostEscort = N(x).m0; })),
    upgrade: { nums: { m0: 13 } },
  },
  {
    id: 'pudding/cemetery-shift-supervisor', name: 'Cemetery Shift Supervisor', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['graveside', 'loyalty'],
    text: 'At the start of your turn, if [Graveside], gain {n} [Loyalty].',
    flavor: 'He has a clipboard. Nobody knows where he got it.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'pudding/cemetery-shift-supervisor', (x, s) => { s.shiftSupervisor = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/warm-spot', name: 'Warm Spot by the Headstones', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['unearthed', 'dig-up'],
    text: 'Tricks you [Dig Up] stay [Unearthed] until you play them, instead of only for the turn.',
    flavor: 'The sun hits it for about twenty minutes. He is always there.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/warm-spot', (x, s) => { s.warmSpot = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'pudding/pug-of-the-baskervilles', name: 'Pug of the Baskervilles', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['loyalty'],
    text: 'Deal {d} damage. Spend any [Loyalty]; each one sends a spectral pug in for {m0} more.',
    flavor: 'The moor. The fog. A very small silhouette.',
    nums: { d: 20, m0: 24 },
    balance: { scalesWith: 'Loyalty spent' },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      let n = 0;
      while (spendLoyalty(c, 1)) n++;
      for (let i = 0; i < n; i++) U.hitAt(c, t, 6);
    }),
    upgrade: { nums: { d: 27, m0: 32 } },
  },
  {
    id: 'pudding/cemetery-stampede', name: 'Cemetery Stampede', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['plot'],
    text: 'Deal {d} damage to all enemies, then {m0} more to all for each occupied [Plot].',
    flavor: 'All of them at once. It is not a large graveyard.',
    nums: { d: 10, m0: 15 },
    balance: { scalesWith: 'occupied Plots' },
    effect: eff((c) => { U.hitAll(c, N(c).d); U.hitAllN(c, 5, occupied(c)); }),
    upgrade: { nums: { d: 14, m0: 21 } },
  },
  {
    id: 'pudding/return-to-sender', name: 'Return to Sender', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['best-friend'],
    text: 'Hit something winding up at your [Best Friend] for as much as its own Attack. Otherwise deal {d}.',
    flavor: 'He has thought about this and considers it fair.',
    nums: { d: 14 },
    balance: { scalesWith: "the enemy's own Attack" },
    effect: eff((c) => {
      const t = c.target;
      const aiming = t && aimsAt(c, t, bf(c)) ? t : threats(c)[0];
      if (!aiming) { U.hit(c, N(c).d); return; }
      const m = aiming.pendingMove || {};
      const amount = Math.max(N(c).d, (m.damage || 0) * (m.hits || 1));
      U.hitAt(c, aiming, amount);
    }),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'pudding/exhumed-menace', name: 'Exhumed Menace', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['unearthed', 'vanish'],
    text: 'Deal {d} damage. [Unearthed]: put a free copy in your hand that [Vanish]es.',
    flavor: 'It should not have been dug up. It has been dug up.',
    nums: { d: 9 },
    effect: eff((c) => {
      const def = c.card && c.card.def;
      const un = playedUnearthed(c);
      U.hit(c, N(c).d);
      if (un) spectralCopy(c, def);
    }),
    upgrade: { nums: { d: 13 } },
  },
  {
    id: 'pudding/bury-the-hatchet', name: 'Bury the Hatchet', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['bury', 'unearthed', 'vanish'],
    text: 'Deal {d} damage. Not [Unearthed]: you may [Bury] this. [Unearthed]: deal {m0} more, then [Vanish].',
    flavor: 'A gesture of peace. With a hatchet.',
    nums: { d: 16, m0: 12 },
    effect: eff((c) => {
      const self = c.card;
      const un = playedUnearthed(c);
      U.hit(c, N(c).d + (un ? N(c).m0 : 0));
      if (un) U.makeVanish(c, self);
      else if (freePlot(c)) U.mm(c).awaitingBury = self;
    }),
    upgrade: { nums: { d: 21, m0: 16 } },
  },
  {
    id: 'pudding/all-bark-some-bite', name: 'All Bark, Actually Some Bite', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['loyalty'],
    text: 'Deal {d} damage, and once more for every {n} [Loyalty] you hold. It is not spent.',
    flavor: 'Mostly bark. Statistically, mostly bark.',
    nums: { d: 5, n: 2, hits: 4 },
    balance: { scalesWith: 'Loyalty held' },
    effect: eff((c) => U.hitN(c, N(c).d, 1 + Math.floor(loyalty(c) / N(c).n))),
    upgrade: { nums: { d: 7, n: 2, hits: 4 } },
  },
  {
    id: 'pudding/headstone-avalanche', name: 'Headstone Avalanche', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['dig-up', 'plot'],
    text: '[Dig Up] everything you legally can. Deal {d} to all enemies, plus {m0} more for each Trick dug.',
    flavor: 'The whole row. All at once. Downhill.',
    nums: { d: 18, m0: 18 },
    balance: { scalesWith: 'Tricks Dug Up' },
    effect: eff((c) => {
      let n = 0;
      while (digUp(c)) n++;
      U.hitAll(c, N(c).d);
      U.hitAllN(c, 6, n);
    }),
    upgrade: { nums: { d: 24, m0: 24 } },
  },
  {
    id: 'pudding/good-boy-of-the-graveyard', name: 'Good Boy of the Graveyard', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['unearthed', 'graveside', 'loyalty'],
    text: 'Deal {d} damage. [Unearthed] while [Graveside]: refund {e} Nerve and gain {n} [Loyalty].',
    flavor: 'The best one. Ask anybody. Ask the headstones.',
    nums: { d: 16, e: 1, n: 1 },
    effect: eff((c) => {
      const both = playedUnearthed(c) && graveside(c);
      U.hit(c, N(c).d);
      if (both) { U.energy(c, N(c).e); gainLoyalty(c, N(c).n); }
    }),
    upgrade: { nums: { d: 21, e: 1, n: 2 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'pudding/lay-to-rest', name: 'Lay to Rest', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['bury', 'plot'],
    text: '[Bury] up to {n} Tricks into separate [Plot]s, then draw that many.',
    flavor: 'One at a time, with a small pause for each.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      let n = 0;
      for (let i = 0; i < N(c).n; i++) {
        if (!freePlot(c)) break;
        const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
        if (!k || !bury(c, k)) break;
        n++;
      }
      U.draw(c, n);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/exhume', name: 'Exhume', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['dig-up', 'vanish'],
    text: '[Dig Up] everything you legally can. Those Tricks cost 0 this turn and [Vanish] when played.',
    flavor: 'All of it. Right now. He has decided.',
    nums: {},
    effect: eff((c) => {
      let k;
      while ((k = digUp(c))) { U.costSet(c, k, 0, 'turn'); U.makeVanish(c, k); }
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/stay-with-me', name: 'Stay With Me', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard, and until your next turn no one Attack costs them more than {m0} Courage.',
    flavor: 'Please. Just stay. Just for a bit.',
    nums: { b: 13, m0: 8 },
    effect: eff((c) => {
      U.guardOn(c, bf(c), N(c).b);
      c.giveStatus(bf(c), 'stay-with-me', N(c).m0);
    }),
    upgrade: { nums: { b: 18, m0: 6 } },
  },
  {
    id: 'pudding/no-one-gets-left-behind', name: 'No One Gets Left Behind', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['loyalty', 'best-friend'],
    text: 'Spend any [Loyalty]. Your [Best Friend] gains {b} Guard per {n} spent, and it keeps if you spend {m0}.',
    flavor: 'Nobody. He means it.',
    nums: { b: 13, n: 2, m0: 5 },
    effect: eff((c) => {
      let spent = 0;
      while (spendLoyalty(c, 1)) spent++;
      const who = bf(c);
      U.guardOn(c, who, N(c).b * Math.floor(spent / N(c).n));
      if (spent >= N(c).m0) who.keepBlock = true;
    }),
    upgrade: { nums: { b: 18, n: 2, m0: 4 } },
  },
  {
    id: 'pudding/seance-at-supper', name: 'Séance at Supper', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['graveside', 'plot', 'vanish'],
    text: 'Playable only while [Graveside]. Copy a Buried Trick into your hand for free. It [Vanish]es.',
    flavor: 'Everyone at the table. Most of them are dead.',
    nums: {},
    playable: (c) => graveside(c),
    effect: eff(async (c) => {
      const pool = buriedCards(c).filter(k => k.type !== POWER);
      if (!pool.length) return;
      const [k] = await U.pickCards(c, { pile: 'stash', pool, count: 1, prompt: 'Copy which Buried Trick?' });
      if (k) spectralCopy(c, k.def);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/dig-until-dawn', name: 'Dig Until Dawn', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['plot', 'dig-up', 'bury', 'vanish'],
    text: 'Every [Plot] can be worked again this turn. [Dig Up] one and [Bury] one if you can. [Vanish].',
    flavor: 'It is four in the morning. He is not tired.',
    nums: {},
    effect: eff(async (c) => {
      for (const p of plots(c)) p.used = false;
      digUp(c);
      if (!freePlot(c)) return;
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k) bury(c, k);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/whos-a-good-pug', name: "Who's a Good Pug?", companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['loyalty', 'vanish'],
    text: 'Playable only at maximum [Loyalty]. Spend it all. Gain {e} Nerve and draw {c1}. [Vanish].',
    flavor: 'He is. He is a good pug. It has been established.',
    nums: { e: 2, c1: 3 },
    playable: (c) => atMaxLoyalty(c),
    effect: eff((c) => {
      U.setRes(c, LOYALTY, 0, 0, BIG_LOYALTY);
      U.energy(c, N(c).e);
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { e: 3, c1: 4 } },
  },
  {
    id: 'pudding/final-resting-spot', name: 'Final Resting Spot', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['bury', 'plot'],
    text: 'Search your draw or discard pile and [Bury] that Trick directly.',
    flavor: 'The good spot. Under the willow.',
    nums: {},
    effect: eff(async (c) => {
      if (!freePlot(c)) return;
      const pick = await c.choose({ options: ['The draw pile', 'The discard pile'], prompt: 'Look where?' });
      const pile = pick[0] === 1 ? 'discard' : 'draw';
      const [k] = await U.pickCards(c, { pile, count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (k) bury(c, k);
      if (pile === 'draw') U.reshuffle(c);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/emergency-burial', name: 'Emergency Burial', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['bury', 'loyalty', 'best-friend', 'vanish'],
    text: '[Bury] a Trick. Your [Best Friend] gains {b} Guard per Nerve it cost. If they are threatened, gain {n} [Loyalty]. [Vanish].',
    flavor: 'No ceremony. No flowers. Straight down.',
    nums: { b: 6, n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (!k) return;
      const cost = U.printedCost(k);
      if (!bury(c, k)) return;
      U.guardOn(c, bf(c), N(c).b * Math.max(1, cost));
      if (threatened(c)) gainLoyalty(c, N(c).n);
    }),
    upgrade: { nums: { b: 9, n: 2 } },
  },
  {
    id: 'pudding/cemetery-sanctuary', name: 'Cemetery Sanctuary', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['best-friend'],
    text: 'Your [Best Friend] gains {b} Guard, and Guard you give them keeps until your next turn.',
    flavor: 'Inside the railings, nothing is allowed to happen.',
    nums: { b: 13 },
    effect: eff((c) => {
      const who = bf(c);
      U.guardOn(c, who, N(c).b);
      who.keepBlock = true;
    }),
    upgrade: { nums: { b: 19 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'pudding/family-plot', name: 'Family Plot', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['plot', 'graveside'],
    text: 'A fourth [Plot] for the rest of the fight. [Graveside] still only needs two.',
    flavor: 'Room for everyone. Eventually.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/family-plot', (x, s) => {
      s.extraPlots = 1;
      x.self.piles.stashCap = MAX_PLOTS;
      plots(x);
      x.defineCounter(plotTrack(MAX_PLOTS, occupied(x)));
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/cemetery-gates', name: 'Cemetery Gates', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['plot', 'unearthed'],
    text: 'Once each turn, swap a Trick in your hand for a Buried one. It becomes [Unearthed] and the [Plot] is used.',
    flavor: 'They are never locked. They are simply gates.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/cemetery-gates', (x, s) => { s.cemeteryGates = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'pudding/forever-home', name: 'Forever Home', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['loyalty', 'best-friend'],
    text: 'Maximum [Loyalty] becomes {n}. Loyalty you cannot hold becomes Guard for your [Best Friend].',
    flavor: 'He found one. He is not going anywhere.',
    nums: { n: BIG_LOYALTY },
    effect: eff((c) => power(c, 'pudding/forever-home', (x, s) => {
      s.foreverHome = true;
      /* Redefines the track rather than declaring it wide from the start, so the
         gauge never advertises a ceiling he does not have. */
      x.defineCounter(loyaltyTrack(BIG_LOYALTY, loyalty(x)));
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/the-goodest-ghost', name: 'The Goodest Ghost', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['unearthed', 'vanish'],
    text: 'The first [Unearthed] Trick you play each turn leaves a free copy in your hand. It [Vanish]es.',
    flavor: 'There is a second one. There has always been a second one.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/the-goodest-ghost', (x, s) => { s.goodestGhost = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'pudding/all-dogs-go-somewhere', name: 'All Dogs Go Somewhere', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bury', 'plot', 'vanish'],
    text: 'Once each combat, a Trick that would [Vanish] may be [Bury]-ed instead. The [Plot] is used.',
    flavor: 'Not away. Somewhere.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/all-dogs-go-somewhere', (x, s) => { s.allDogs = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'pudding/graveyard-choir', name: 'Graveyard Choir', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['graveside', 'plot'],
    text: 'While [Graveside], the residents deal {m0} to all enemies at the end of your turn, once per occupied [Plot].',
    flavor: 'Not singing, exactly. Not not singing.',
    nums: { m0: 5 },
    effect: eff((c) => power(c, 'pudding/graveyard-choir', (x, s) => { s.graveyardChoir = N(x).m0; })),
    upgrade: { nums: { m0: 8 } },
  },
  {
    id: 'pudding/home-is-where-you-are', name: 'Home Is Where You Are', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['best-friend', 'loyalty', 'bury'],
    text: 'Once each combat, your [Best Friend] survives at 1 Courage. Fill [Loyalty] and [Bury] your discard pile.',
    flavor: 'Wherever you are. That is the whole of it.',
    nums: {},
    effect: eff((c) => power(c, 'pudding/home-is-where-you-are', (x, s) => { s.homeIsWhereYouAre = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'pudding/pack-walk', name: 'Pack Walk', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['loyalty'],
    text: 'Every Kid gains {b} Guard. Gain {n} [Loyalty] for each friend something is winding up at, at most {m0}.',
    flavor: 'Everyone together. Everyone where he can see them.',
    nums: { b: 6, n: 1, m0: 2 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      let got = 0;
      for (const mate of c.teammates()) {
        c.giveBlock(mate, N(c).b);
        if (got < N(c).m0 && threatened(c, mate)) got += N(c).n;
      }
      gainLoyalty(c, Math.min(got, N(c).m0));
    }),
    upgrade: { nums: { b: 9, n: 1, m0: 3 } },
  },
  {
    id: 'pudding/bring-it-here', name: 'Bring It Here', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['loyalty', 'bury'],
    text: 'A friend takes a Trick back from their discard pile. Pudding spends {n} [Loyalty] or [Bury]s one.',
    flavor: 'He has fetched it. It is damp. You are welcome.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      /* Their discard, so THEY pick — the broker, never a guess made here. */
      const back = await c.askAlly(ally, { pool: c.allyCards(ally, 'discard'), prefer: 'costliest' });
      const k = Array.isArray(back) ? back[0] : back;
      if (k) c.allyMoveCard(ally, k, 'hand', {});
      if (spendLoyalty(c, N(c).n)) return;
      const [own] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury which Trick?', filter: (x) => canBury(c, x) });
      if (own) bury(c, own);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'pudding/take-my-treat', name: 'Take My Treat', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, coop: true, exhaust: true, keywords: ['loyalty', 'vanish'],
    text: 'Spend {n} [Loyalty]. A friend gains {e} Nerve and draws {c1}. Pudding draws {c1}. [Vanish].',
    flavor: 'It was his. He is giving it to you. This is enormous.',
    nums: { n: 2, e: 1, c1: 1 },
    playable: (c) => loyalty(c) >= 2,
    effect: eff(async (c) => {
      if (!spendLoyalty(c, N(c).n)) return;
      const ally = await c.chooseAlly();
      if (ally) { c.bankEnergy(N(c).e, ally); c.giveDraw(ally, N(c).c1); }
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 2, e: 2, c1: 2 } },
  },
  {
    id: 'pudding/the-whole-pack', name: 'The Whole Pack', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, coop: true, keywords: ['best-friend', 'loyalty'],
    text: 'Once each turn, change your [Best Friend] for free; they gain {b} Guard. [Loyalty] now watches the whole party.',
    flavor: 'All of them. He has decided. All of them.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'pudding/the-whole-pack', (x, s) => { s.wholePack = N(x).b; })),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'pudding/community-plot', name: 'Community Plot', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, coop: true, exhaust: true, keywords: ['plot', 'graveside', 'vanish'],
    text: 'Each friend stores a Trick of their own. They take it back next turn costing {m0} less. It counts for [Graveside]. [Vanish].',
    flavor: 'Everyone gets a plot. Everyone.',
    nums: { m0: 1 },
    effect: eff(async (c) => {
      const s = U.mm(c);
      s.shared = s.shared || [];
      for (const mate of c.teammates()) {
        const pick = await c.askAlly(mate, { pool: c.allyCards(mate, 'hand'), prefer: 'costliest' });
        const k = Array.isArray(pick) ? pick[0] : pick;
        if (!k) continue;
        k.unplayable = true;
        c.allyMoveCard(mate, k, 'stash', { buried: true });
        s.shared.push({ card: k, ownerId: mate.id, discount: N(c).m0 });
      }
      syncPlotCounter(c);
    }),
    upgrade: { nums: { m0: 2 } },
  },
];

export default {
  slug: SLUG,
  name: 'Pudding',
  title: 'the Graveyard Pug',
  region: 'graveyard',
  identity:
    'Pudding has appointed himself the graveyard’s caretaker and the personal bodyguard of ' +
    'whoever he has decided is his Best Friend — himself, if he is alone. He does not command ' +
    'the dead; he keeps watch over them. Loyalty accumulates whenever something threatens the ' +
    'person he is looking after, and Plots let him put important Tricks away and dig them back ' +
    'out at exactly the right moment. His whole tension is one line: the graveyard is strongest ' +
    'when things stay buried, and his best Tricks are strongest when he digs them back up.',
  strengths: [
    'Unmatched control over WHERE an important Trick is — reserve an answer instead of hoping to redraw it',
    'Defence that becomes more reliable exactly when the threat is clearest',
    'Loyalty turns a dangerous enemy turn into a resource for the next one',
    'Loyalty, Unearthed and Graveside all pay each other, so hybrids are the strong decks',
    'In a party, most of his ordinary pool is already genuine support',
  ],
  weaknesses: [
    'Everything needs setup: a burial costs a card and a Plot before it pays anything',
    'Keeping Tricks buried means deliberately denying yourself access to them',
    'Digging too greedily switches Graveside off, and half his Powers with it',
    'Loyalty dries up against enemies that buff, summon or debuff instead of attacking',
    'Unconditional area damage is poor — the good multi-target Tricks all want Plots filled',
    'In a party, one Best Friend means he cannot protect everybody at once',
  ],
  startingHp: 74,
  startingEnergy: 3,
  mechanics: {
    bestFriend: { name: 'Best Friend', kind: 'system', desc: 'Whoever Pudding is protecting. Himself in solo, so a Trick naming both "you" and "your Best Friend" never pays twice. Chosen, and changeable, in a party.', min: 0, max: 1, hooks: ['bestFriend'] },
    loyalty: { name: 'Loyalty', kind: 'resource', desc: 'Maximum 5, or 8 under Forever Home. One a turn from the innate rule when at least one enemy is winding up at his Best Friend, however many of them are. Persists between turns, resets between fights.', min: 0, max: 8, hooks: ['loyalty'] },
    plots: { name: 'Plots', kind: 'resource', desc: 'Three cemetery Plots, four under Family Plot. Each holds one Buried Trick and performs ONE operation per turn — burying into it or digging out of it uses it until your next turn.', min: 0, max: 4, hooks: ['bury', 'digUp'] },
    unearthed: { name: 'Unearthed', kind: 'status', desc: 'A Trick Dug Up this turn. Some Tricks are stronger played while Unearthed. Lost at end of turn, unless Warm Spot by the Headstones is out.', min: 0, max: 1, hooks: [] },
    graveside: { name: 'Graveside', kind: 'system', desc: 'Two or more Plots occupied, checked the moment an effect resolves. This is the tension: digging your Tricks up for value can switch it off.', min: 0, max: 1, hooks: [] },
  },
  startingDeck: [
    'pudding/little-chomp', 'pudding/little-chomp', 'pudding/little-chomp', 'pudding/little-chomp',
    'pudding/guard-the-ankles', 'pudding/guard-the-ankles', 'pudding/guard-the-ankles', 'pudding/guard-the-ankles',
    'pudding/bury-this', 'pudding/dig-it-up',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'The Loyal Guardian', desc: 'Treat enemy aggression as a resource: watch who is winding up at your Best Friend, bank the Loyalty, and spend it on protection that arrives exactly when it is needed.', coreCards: ['pudding/stay-close', 'pudding/good-dog-emergency', 'pudding/never-off-duty', 'pudding/no-one-gets-left-behind', 'pudding/stay-with-me', 'pudding/tail-on-watch', 'pudding/forever-home'] },
    { name: 'The Gravedigger', desc: 'Bury deliberately and dig on purpose. Unearthed turns a burial into a better draw than any draw, and the sequencing is the whole game.', coreCards: ['pudding/dig-here', 'pudding/dug-up-trouble', 'pudding/digging-claws', 'pudding/double-dig', 'pudding/dog-eared-epitaph', 'pudding/warm-spot', 'pudding/the-goodest-ghost'] },
    { name: 'The Haunted Cemetery', desc: 'Keep two or three Plots occupied and stop excavating. Everything supernatural about the graveyard is switched on by staying still.', coreCards: ['pudding/fresh-flowers', 'pudding/headstone-hop', 'pudding/hallowed-ground', 'pudding/cemetery-shift-supervisor', 'pudding/graveyard-choir', 'pudding/graveyard-picnic', 'pudding/family-plot'] },
    { name: 'The Scrappy Watchdog', desc: 'Threats against your Best Friend are fuel. Loyalty becomes damage, big Attacks get cheap, and protecting someone is how you attack.', coreCards: ['pudding/bark-first', 'pudding/you-heard-me-bark', 'pudding/collar-charge', 'pudding/collar-snap', 'pudding/leave-my-person-alone', 'pudding/pug-of-the-baskervilles', 'pudding/graveyard-rules'] },
    { name: 'The Cemetery Caretaker', desc: 'Two Plots stay filled forever and the third is a rotating toolbox. The highest skill ceiling he has, and the one that asks you to count.', coreCards: ['pudding/reburial', 'pudding/digging-frenzy', 'pudding/move-the-flowers', 'pudding/cemetery-gates', 'pudding/keeper-of-the-yard', 'pudding/seance-at-supper', 'pudding/final-resting-spot'] },
  ],
};
