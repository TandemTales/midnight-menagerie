/**
 * Boggle, the Monster Under the Bed.  OWNER: companion-cards.
 * Spec: docs/design/companions/04-boggle.md
 *
 * Awareness (Aware / Unaware / Suspicious) · Search · Ambush · Fright ·
 * Scare N · Lurk
 *
 * Boggle is a predator who is also a coward. The whole Companion is one
 * question asked every turn: who currently knows where I am? Hiding is
 * enormously strong — a directed Attack aimed only at him stops being an Attack
 * — but it cannot be repeated against the same enemy, because hiding from
 * something makes it Suspicious and a Suspicious enemy cannot be hidden from
 * until it has taken another action.
 *
 * ── Two things here that are easy to get silently wrong ─────────────────────
 *
 * 1. AWARENESS IS ONE STATE. `unaware` and `suspicious` are both stacks:false
 *    and mutually exclusive, and every transition goes through `setAware`,
 *    `hide` or `suspect` below rather than through `U.apply` directly. A card
 *    that applied `suspicious` without clearing `unaware` would leave an enemy
 *    in both states at once and `isAware()` would answer false forever.
 *
 * 2. AMBUSH RESOLVES BEFORE THE STATE CHANGES. The spec is explicit that the
 *    target stays Unaware until the complete Trick has finished, including
 *    every hit of a multi-hit and every Scare clause. So an Attack never flips
 *    the target itself: it records the enemy in `s.pending` and the `eff()`
 *    wrapper settles them once the effect has fully resolved, awaiting the
 *    promise first if the card asked a question. Flipping inside the effect
 *    made the second hit of a two-hit Ambush miss its own bonus.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'boggle';
const N = U.N;

const UNAWARE = 'unaware';
const SUSPICIOUS = 'suspicious';
const FRIGHT = 'fright';
const LURK = 'lurk';

const BASE_LURK_CAP = 5;
const LURK_DESC = 'Boggle gains 1 Lurk at the end of his turn while any living enemy is Unaware. Caps at 5.';
const BIG_LURK_CAP = 7;

const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);

const eid = (e) => (e && (e.id ?? e.uid)) || 'unknown';

/**
 * Every Boggle card runs through here. It installs the trackers, then settles
 * any Ambush bookkeeping the effect queued — after awaiting the effect, so a
 * card that asks the player a question still resolves in the right order.
 */
const eff = (fn) => (c) => {
  U.ensure(c, SLUG);
  const r = fn(c);
  if (r && typeof r.then === 'function') return r.then((v) => { settle(c); return v; });
  settle(c);
  return r;
};

// ── awareness ───────────────────────────────────────────────────────────────
const isUnaware = (c, e) => U.stacks(c, e, UNAWARE) > 0;
const isSuspicious = (c, e) => U.stacks(c, e, SUSPICIOUS) > 0;
const isAware = (c, e) => !!e && !isUnaware(c, e) && !isSuspicious(c, e);

const unawareEnemies = (c) => U.enemies(c).filter((e) => isUnaware(c, e));
const suspiciousEnemies = (c) => U.enemies(c).filter((e) => isSuspicious(c, e));
const awareEnemies = (c) => U.enemies(c).filter((e) => isAware(c, e));

/** Clear whichever awareness status is on this enemy. */
function setAware(c, e) {
  if (!e) return;
  if (isUnaware(c, e)) { U.unapply(c, e, UNAWARE, U.stacks(c, e, UNAWARE)); dropSearch(c, e); }
  if (isSuspicious(c, e)) U.unapply(c, e, SUSPICIOUS, U.stacks(c, e, SUSPICIOUS));
}

/**
 * Make an enemy Unaware. Refuses a Suspicious enemy unless `force`, which is
 * what You Didn't See Anything spends Lurk to buy.
 */
function hide(c, e, opts = {}) {
  if (!e) return false;
  if (isUnaware(c, e)) return false;
  if (isSuspicious(c, e) && !opts.force) return false;
  setAware(c, e);
  U.apply(c, e, UNAWARE, 1);
  const s = U.mm(c);
  s.unawareThisTurn = (s.unawareThisTurn || 0) + 1;
  U.fire(c, 'becameUnaware', { enemy: e });
  armSearch(c, e);
  return true;
}

/** Make an enemy Suspicious. `ambushed` is read by Feed the Imagination. */
function suspect(c, e, opts = {}) {
  if (!e) return false;
  setAware(c, e);
  U.apply(c, e, SUSPICIOUS, 1);
  const st = U.mm(c);
  const engine = c.e;
  // Suspicious ends after the enemy's NEXT action. One gained during the enemy
  // phase — a Search — must not be cleared by the same phase's turn:end, so the
  // turn it arrived on is remembered and skipped once.
  if (engine && String(engine.phase || '').startsWith('enemy')) {
    if (!st.freshlySuspicious) st.freshlySuspicious = {};
    st.freshlySuspicious[eid(e)] = engine.turn;
    st.suspiciousLastEnemyTurn = true;
  }
  U.fire(c, 'becameSuspicious', { enemy: e, ambushed: !!opts.ambushed });
  return true;
}

/**
 * Queue an enemy to become Suspicious once the current Trick has completely
 * finished. See the header — Ambush bonuses must all see it still Unaware.
 */
function markSuspicious(c, e, opts = {}) {
  if (!e) return;
  const s = U.mm(c);
  const key = eid(e);
  if (!s.pending) s.pending = {};
  const cur = s.pending[key];
  // 'aware' beats 'suspicious': Big Eyes in the Dark and Quiet as Dust both
  // promise the target ends Aware, and one of them firing must not be undone
  // by an ordinary Ambush marking the same enemy in the same Trick.
  if (cur && cur.to === 'aware') return;
  s.pending[key] = { enemy: e, to: opts.to || 'suspicious', ambushed: !!opts.ambushed };
}

/** Apply everything markSuspicious queued during the Trick that just resolved. */
function settle(c) {
  const s = U.mm(c);
  const pend = s.pending;
  if (!pend) return;
  s.pending = null;
  for (const key of Object.keys(pend)) {
    const { enemy, to, ambushed } = pend[key];
    if (!enemy || !enemy.alive) continue;
    if (to === 'aware') setAware(c, enemy);
    else suspect(c, enemy, { ambushed });
  }
}

/**
 * Resolve an Attack against one enemy with Ambush bookkeeping: reports whether
 * the bonus applies, and queues the state change for after the whole Trick.
 */
function ambush(c, e) {
  if (!e) return false;
  const hidden = isUnaware(c, e);
  if (!hidden) return false;
  const s = U.mm(c);
  if (s.plainSight) markSuspicious(c, e, { to: 'aware', ambushed: true });
  else if (s.quietAsDust && U.once(c, 'quietAsDust')) markSuspicious(c, e, { to: 'aware', ambushed: true });
  else if (s.lightsOff > 0) { s.lightsOff--; markSuspicious(c, e, { to: 'aware', ambushed: true }); }
  else markSuspicious(c, e, { ambushed: true });
  s.ambushedThisTurn = (s.ambushedThisTurn || 0) + 1;
  U.fire(c, 'ambush', { enemy: e });
  return true;
}

// ── Search ──────────────────────────────────────────────────────────────────
/** Is this enemy about to make a directed Attack whose only target is Boggle? */
function aimedAtMe(c, e) {
  const m = e && e.pendingMove;
  if (!m || !ATTACK_INTENTS.has(m.intent)) return false;
  if (m.partyTarget === 'all' || m.partyTarget === 'two') return false;
  if (m.splash > 0 || m.splashFn) return false;
  const engine = c.e;
  if (engine && engine.partyTargets) {
    let list = [];
    try { list = engine.partyTargets(e, m) || []; } catch (_) { list = []; }
    if (list.length > 1) return false;
    if (list.length === 1 && list[0] !== c.self) return false;
  }
  return true;
}

/**
 * The action an Unaware enemy takes instead of its directed Attack. Built here
 * rather than in an enemy def because it belongs to no enemy — every enemy in
 * the game can be made to do it. The effect closes over the engine so it can
 * reach Boggle's own bookkeeping from inside the enemy phase.
 */
function searchMove(c, e) {
  const engine = c.e;
  return {
    id: 'boggle-search', name: 'Search', intent: 'unknown',
    tell: 'It stops. It starts lifting things up and looking underneath them.',
    effect: () => { resolveSearch(engine, e); },
  };
}

/** Swap this enemy's current action for a Search, if it was aiming at Boggle. */
function armSearch(c, e) {
  if (!aimedAtMe(c, e)) return false;
  const engine = c.e;
  if (!engine || !engine.overrideIntent) return false;
  return engine.overrideIntent(e, searchMove(c, e));
}

/** Drop a queued Search because the enemy stopped being Unaware. */
function dropSearch(c, e) {
  const engine = c.e;
  if (!engine || !engine.clearIntentOverride) return;
  engine.clearIntentOverride(e);
}

/** A Search resolving, during the enemy phase. */
function resolveSearch(engine, e) {
  const c = U.trackerCtx(engine);
  if (!e || !e.alive) return;
  U.apply(c, e, FRIGHT, 2);
  U.fire(c, 'search', { enemy: e });
  setAware(c, e);
  suspect(c, e);
}

// ── Fright and Scare ────────────────────────────────────────────────────────
const frightOn = (c, e) => U.stacks(c, e, FRIGHT);
function fright(c, e, n) { if (e && n > 0) { U.apply(c, e, FRIGHT, n); U.fire(c, 'frightApplied', { enemy: e, amount: n }); } }
function frightAll(c, n) { for (const e of U.enemies(c)) fright(c, e, n); }

/**
 * Scare N. Returns true and resolves `fn` if the target has the threshold.
 *
 * The threshold and the amount consumed are the same number by default, and
 * Practice Your Scream lowers BOTH while Fear of the Dark lowers only the
 * amount consumed — which is why they are two separate variables here rather
 * than one. Getting that wrong makes Fear of the Dark silently free.
 */
function scare(c, e, n, fn) {
  if (!e) return false;
  const s = U.mm(c);
  let need = n;
  if (s.practice && U.once(c, 'practiceScream')) need = Math.max(1, n - U.stacks(c, c.self, 'boggle/practice-your-scream'));
  if (frightOn(c, e) < need) return false;
  let spend = need;
  const key = 'fotd:' + eid(e);
  if (s.fearOfDark && U.once(c, key)) spend = 0;
  if (spend > 0) {
    U.unapply(c, e, FRIGHT, spend);
    if (s.biggerInHead) {
      const back = Math.floor(spend / 2);
      if (back > 0) U.atTurnEnd(c, (x) => fright(x, e, back));
    }
  }
  U.fire(c, 'scare', { enemy: e, amount: spend });
  fn(c);
  return true;
}

// ── Lurk ────────────────────────────────────────────────────────────────────
const lurk = (c) => U.res(c, LURK);
const lurkCap = (c) => (U.mm(c).bigLurk ? BIG_LURK_CAP : BASE_LURK_CAP);
function gainLurk(c, n) {
  if (n <= 0) return 0;
  /* The cap is enforced HERE, not by the `max` argument to `U.addRes`: when a
     resource is backed by an engine counter track — Lurk is — addRes hands the
     whole delta to `addCounter` and its own min/max are never consulted. The
     counter is declared at 7 so Underbed Kingdom can raise the ceiling without
     touching the engine, which means passing 5 to addRes silently did nothing
     and Lurk reached 6. */
  const cap = lurkCap(c);
  const before = lurk(c);
  const give = Math.min(n, Math.max(0, cap - before));
  if (give <= 0) return 0;
  U.addRes(c, LURK, give, 0, cap);
  const got = lurk(c) - before;
  if (got > 0) U.fire(c, 'lurkGained', { amount: got });
  return got;
}
function spendLurk(c, n) {
  const have = Math.min(n, lurk(c));
  if (have > 0) U.addRes(c, LURK, -have, 0, lurkCap(c));
  return have;
}

/**
 * "You cannot play Attacks for the rest of this turn."
 *
 * There is no engine-level card-type ban: `modifyCardCost` is clamped at 0, so a
 * hook cannot return the -2 that means unplayable, and `def.playable` only
 * reaches Tricks we wrote — the restriction has to cover neutral Attacks too.
 * `card.unplayable` IS read by `costOf`, so the flag is stamped on every Attack
 * in hand now and on anything Attack-shaped drawn later this turn, then cleared
 * at the start of the next one.
 */
function isAttackCard(k) {
  const t = (k && (k.type || (k.def && k.def.type))) || '';
  return String(t).toLowerCase() === 'attack';
}
function forbidAttacks(c) {
  U.mm(c).noAttacks = true;
  for (const k of U.cardsIn(c, 'hand')) if (isAttackCard(k)) k.unplayable = true;
}

// ── numbers ─────────────────────────────────────────────────────────────────
/** Underbed Kingdom: the ceiling moves from 5 to 7, and the HUD has to say so. */
function raiseLurkCap(c) {
  const e = c.e;
  const st = U.mm(c);
  if (st.bigLurk) return;
  st.bigLurk = true;
  e.defineCounter({
    id: LURK, name: 'Lurk', icon: 'lurk',
    desc: 'Boggle gains 1 Lurk at the end of his turn while any living enemy is Unaware. Underbed Kingdom has raised the cap to 7.',
    min: 0, max: BIG_LURK_CAP, start: lurk(c), ownerId: c.self.id,
  });
}

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: LURK, name: 'Lurk', icon: 'lurk', desc: LURK_DESC, min: 0, max: BASE_LURK_CAP, start: 0,
      // Declared, not left to the renderer's description regex — that would
      // have matched "Caps at 5" and printed CAPS on the gauge.
      states: [{ at: 0, label: 'Still' }, { from: BASE_LURK_CAP, to: BIG_LURK_CAP, label: 'Coiled' }] },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  /* Suspicious lasts until the enemy has taken one action. The engine emits
     TURN_END for an enemy after its move has resolved, which is exactly that
     moment — and a Search sets Suspicious during the same window, so the clear
     has to skip an enemy that only just became Suspicious this very turn. */
  e.on('turn:end', (ev) => {
    if (ev.side !== 'enemy') return;
    const c = fake();
    const en = e.actor(ev.actorId);
    if (!en || !en.alive) return;
    if (!isSuspicious(c, en)) return;
    const st = U.mm(c);
    if (st.freshlySuspicious && st.freshlySuspicious[eid(en)] === e.turn) return;
    setAware(c, en);
  });

  /* An enemy that becomes Unaware mid-enemy-phase (Nobody's Here) still needs
     its Search armed, and one that dies drops its bookkeeping. */
  e.on('death', (ev) => {
    const c = fake();
    const st = U.mm(c);
    if (st.marks) delete st.marks[ev.actorId];
    if (st.pending) delete st.pending[ev.actorId];
  });

  // "have I played an Attack yet this turn", for Wait For It and The Long Wait.
  e.on('card:play', (ev) => {
    /* `seat` here is the ACTOR the tracker was installed for, the way
       U.onPlayerTurn takes it -- while `ev.seat` is a NUMBER. Comparing the
       two was always unequal, so this listener returned on its first line
       every single time and every Patch was silently inert. `card:play`
       carries `actorId`; compare that. (CONTRACTS trap 11.) */
    if (seat && ev.actorId && ev.actorId !== seat.id) return;
    const card = ev.card;
    if (isAttackCard(card)) U.mm(fake()).attackedThisTurn = true;
  });
  // an Attack drawn AFTER the ban went up is banned too
  e.on('draw', (ev) => {
    const c = fake();
    if (!U.mm(c).noAttacks) return;
    /* CONTRACTS 19, silently. `ev.card` is a SNAPSHOT, so `card.unplayable`
       was set on a copy and the Attack actually sitting in hand stayed
       playable: the ban had never once reached a card drawn after it went up.
       Line 300 above already does this correctly on the cards in hand — this
       listener is the half that exists to cover the ones drawn later. */
    const card = ev.cardUid ? e.card(ev.cardUid) : null;
    if (card && isAttackCard(card)) card.unplayable = true;
  });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.unawareThisTurn = 0;
    st.ambushedThisTurn = 0;
    st.houseSettles = 0;
    st.lightsOff = 0;
    st.plainSight = false;
    st.noScreamYet = 0;
    st.attackedThisTurn = false;
    if (st.noAttacks) {
      st.noAttacks = false;
      for (const k of U.cardsIn(c, 'hand')) if (isAttackCard(k)) k.unplayable = false;
    }
    if (st.bedTimeDraw) { U.draw(c, st.bedTimeDraw); st.bedTimeDraw = 0; }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    // One Eye Open
    if (st.oneEyeOpen) {
      const n = suspiciousEnemies(c).length * 3 * U.stacks(c, c.self, 'boggle/one-eye-open');
      U.guard(c, Math.min(n, 10));
    }
    // the ordinary end-of-turn Lurk
    const anyHidden = unawareEnemies(c).length > 0;
    if (anyHidden) {
      const got = gainLurk(c, 1);
      if (got > 0 && st.monsterEveryBed) {
        const all = U.enemies(c).length > 0 && unawareEnemies(c).length === U.enemies(c).length;
        frightAll(c, all ? 3 : 2);
      }
    }
    // Beneath Every Bed
    if (st.beneathEveryBed && U.enemies(c).length > 0 && unawareEnemies(c).length === U.enemies(c).length) {
      gainLurk(c, 1);
      st.bedTimeDraw = (st.bedTimeDraw || 0) + 1;
    }
    // Good Night, Sleep Tight
    if (st.goodNight && U.enemies(c).length > 0 && U.enemies(c).every((x) => frightOn(c, x) >= 8)) {
      let any = false;
      for (const x of awareEnemies(c)) if (hide(c, x)) any = true;
      if (any) gainLurk(c, 1);
    }
    settle(c);
    st.suspiciousLastEnemyTurn = false;
  }, seat);
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('becameUnaware', 'boggle/the-house-settles', (c, p) => {
  const s = U.mm(c);
  if ((s.houseSettles || 0) >= 3) return;
  s.houseSettles = (s.houseSettles || 0) + 1;
  fright(c, p.enemy, U.stacks(c, c.self, 'boggle/the-house-settles'));
});
U.onHook('becameSuspicious', 'boggle/feed-the-imagination', (c, p) => {
  const n = U.stacks(c, c.self, 'boggle/feed-the-imagination');
  fright(c, p.enemy, (p.ambushed ? 3 : 2) * n);
});
U.onHook('becameSuspicious', 'boggle/bedframe-geography', (c, p) => {
  if (!U.once(c, 'bedframeGeography')) return;
  const other = awareEnemies(c).find((x) => x !== p.enemy);
  if (other) hide(c, other);
  else fright(c, p.enemy, 2 * U.stacks(c, c.self, 'boggle/bedframe-geography'));
});
U.onHook('search', 'boggle/creaks-have-teeth', (c, p) => {
  const n = U.stacks(c, c.self, 'boggle/creaks-have-teeth');
  U.hitAt(c, p.enemy, 4 * n);
  fright(c, p.enemy, n);
});
U.onHook('scare', 'boggle/imagination-does-the-rest', (c, p) => {
  const n = U.stacks(c, c.self, 'boggle/imagination-does-the-rest');
  const other = U.enemies(c).find((x) => x !== p.enemy);
  if (other) fright(c, other, n);
  else fright(c, p.enemy, n);
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'boggle/little-chomp', name: 'Little Chomp', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'Small teeth. A great deal of enthusiasm.',
    nums: { d: 7 },
    effect: eff((c) => { ambush(c, c.target); U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'boggle/pillow-shield', name: 'Pillow Shield', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Goose down, and the absolute confidence of a child.',
    nums: { b: 6 },
    effect: eff((c) => U.guard(c, N(c).b)),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'boggle/creepy-little-noise', name: 'Creepy Little Noise', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['fright'],
    text: 'Apply {n} [Fright].',
    flavor: 'Not a word. Not quite a scratch. Somewhere in between.',
    nums: { n: 2 },
    effect: eff((c) => fright(c, c.target, N(c).n)),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'boggle/under-the-bed', name: 'Under the Bed', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['unaware', 'awareness'],
    text: 'Make one Aware enemy [Unaware]. If no enemy is Aware, gain {b} Guard instead.',
    flavor: 'Home.',
    nums: { b: 4 },
    effect: eff((c) => { if (!hide(c, c.target) && !awareEnemies(c).length) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'boggle/bedframe-bonk', name: 'Bedframe Bonk', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'fright'],
    text: 'Deal {d} damage. [Ambush]: apply {n} [Fright] before the target becomes [Suspicious].',
    flavor: 'The frame is his. He knows every slat by name.',
    nums: { d: 7, n: 2 },
    effect: eff((c) => { const a = ambush(c, c.target); U.hit(c, N(c).d); if (a) fright(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'boggle/toe-nibbler', name: 'Toe Nibbler', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['suspicious'],
    text: 'Deal {d} damage. Against a [Suspicious] enemy, deal {d2} damage instead.',
    flavor: 'It is always the one foot that came out from under the blanket.',
    nums: { d: 4, d2: 7 },
    effect: eff((c) => { const big = isSuspicious(c, c.target); ambush(c, c.target); U.hit(c, big ? N(c).d2 : N(c).d); }),
    upgrade: { nums: { d: 6, d2: 10 } },
  },
  {
    id: 'boggle/from-under-here', name: 'From Under Here', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'lurk'],
    text: 'Deal {d} damage. [Ambush]: gain {n} [Lurk] after the Attack resolves.',
    flavor: 'A voice from a place there should not be a voice.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => { const a = ambush(c, c.target); U.hit(c, N(c).d); if (a) gainLurk(c, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'boggle/shadow-puppet', name: 'Shadow Puppet', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['fright', 'unaware'],
    text: 'Deal {d} damage to all enemies and apply {n} [Fright] to each. [Unaware] targets take {n2} instead, before becoming [Suspicious].',
    flavor: 'Two paws and a candle is all it takes.',
    nums: { d: 5, n: 1, n2: 2 },
    effect: eff((c) => {
      const hidden = unawareEnemies(c);
      for (const e of hidden) ambush(c, e);
      U.hitAll(c, N(c).d);
      for (const e of U.enemies(c)) fright(c, e, hidden.includes(e) ? N(c).n2 : N(c).n);
    }),
    upgrade: { nums: { d: 7, n: 1, n2: 3 } },
  },
  {
    id: 'boggle/ankle-grab', name: 'Ankle Grab', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['scare', 'fright'],
    text: 'Deal {d} damage. [Scare] 3: gain {b} Guard.',
    flavor: 'Nothing there. Nothing there. Something there.',
    nums: { d: 7, b: 6 },
    effect: eff((c) => { ambush(c, c.target); U.hit(c, N(c).d); scare(c, c.target, 3, (x) => U.guard(x, N(x).b)); }),
    upgrade: { nums: { d: 10, b: 9 } },
  },
  {
    id: 'boggle/blanket-snap', name: 'Blanket Snap', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['suspicious', 'fright'],
    text: 'Deal {d} damage. If the target is [Suspicious], apply {n} [Fright].',
    flavor: 'The blanket moves on its own, once, quickly.',
    nums: { d: 7, n: 3 },
    effect: eff((c) => { const sus = isSuspicious(c, c.target); ambush(c, c.target); U.hit(c, N(c).d); if (sus) fright(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 10, n: 4 } },
  },
  {
    id: 'boggle/tiny-teeth', name: 'Tiny Teeth', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['scare'],
    text: 'Deal {d} damage. [Scare] 3: deal another {d} damage.',
    flavor: 'Again. And again. And once more, for the principle of it.',
    nums: { d: 4 },
    effect: eff((c) => { ambush(c, c.target); U.hit(c, N(c).d); scare(c, c.target, 3, (x) => U.hitAt(x, x.target, N(x).d)); }),
    upgrade: { nums: { d: 6 } },
  },
  {
    id: 'boggle/hallway-skitter', name: 'Hallway Skitter', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'fright', 'suspicious'],
    text: 'Deal {d} damage. Against Aware targets apply {n} [Fright]. Against [Suspicious] targets gain {b} Guard. [Ambush]: deal {m0} more.',
    flavor: 'Something crosses the hall at knee height and is gone.',
    nums: { d: 4, m0: 3, n: 2, b: 4 },
    effect: eff((c) => {
      const t = c.target;
      const aware = isAware(c, t); const sus = isSuspicious(c, t);
      const a = ambush(c, t);
      U.hit(c, N(c).d + (a ? N(c).m0 : 0));
      if (aware) fright(c, t, N(c).n);
      if (sus) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { d: 6, m0: 4, n: 3, b: 6 } },
  },
  {
    id: 'boggle/hide-under-something', name: 'Hide Under Something', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['unaware', 'awareness'],
    text: 'Make an Aware enemy [Unaware]. If no enemy is Aware, gain {b} Guard instead.',
    flavor: 'The dresser will do. The dresser has always done.',
    nums: { b: 6 },
    effect: eff((c) => { if (!hide(c, c.target) && !awareEnemies(c).length) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'boggle/hold-very-still', name: 'Hold Very Still', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['suspicious'],
    text: 'Gain {b} Guard. Gain {b2} instead if any enemy is [Suspicious].',
    flavor: 'Not breathing is a skill. He has had practice.',
    nums: { b: 6, b2: 10 },
    effect: eff((c) => U.guard(c, suspiciousEnemies(c).length ? N(c).b2 : N(c).b)),
    upgrade: { nums: { b: 9, b2: 14 } },
  },
  {
    id: 'boggle/creak', name: 'Creak...', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['fright', 'unaware'],
    text: 'Apply {n} [Fright], or {n2} if the target is [Unaware]. Does not change [Awareness].',
    flavor: 'One board. Always the same board.',
    nums: { n: 2, n2: 3 },
    effect: eff((c) => fright(c, c.target, isUnaware(c, c.target) ? N(c).n2 : N(c).n)),
    upgrade: { nums: { n: 3, n2: 5 } },
  },
  {
    id: 'boggle/wrong-room', name: 'Wrong Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['unaware', 'fright'],
    text: 'Make an Aware enemy [Unaware]. If its Intent is not a directed Attack on you, also apply {n} [Fright].',
    flavor: 'It opens the wrong door with tremendous confidence.',
    nums: { n: 2 },
    effect: eff((c) => { const wrong = !aimedAtMe(c, c.target); if (hide(c, c.target) && wrong) fright(c, c.target, N(c).n); }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'boggle/blanket-fort', name: 'Blanket Fort', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['search'],
    text: 'Gain {b} Guard. Before your next turn, the first time an enemy [Search]es, gain {b2} Guard.',
    flavor: 'Structurally unsound. Emotionally impregnable.',
    nums: { b: 6, b2: 4 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).fortGuard = N(c).b2; }),
    upgrade: { nums: { b: 9, b2: 7 } },
  },
  {
    id: 'boggle/did-you-hear-that', name: 'Did You Hear That?', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['fright', 'lurk', 'unaware'],
    text: 'Apply {n} [Fright] to all enemies. If at least one enemy is [Unaware], gain {l} [Lurk].',
    flavor: 'Everybody heard that.',
    nums: { n: 1, l: 1 },
    effect: eff((c) => { frightAll(c, N(c).n); if (unawareEnemies(c).length) gainLurk(c, N(c).l); }),
    upgrade: { nums: { n: 2, l: 1 } },
  },
  {
    id: 'boggle/scoot-scoot', name: 'Scoot Scoot', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['suspicious'],
    text: 'Draw {n} Trick. If an enemy became [Suspicious] this turn, draw another, then discard one.',
    flavor: 'Four very short journeys, none of them observed.',
    nums: { n: 1 },
    effect: eff((c) => {
      U.draw(c, N(c).n);
      if (U.mm(c).ambushedThisTurn > 0) { U.draw(c, 1); U.discardRandom(c, 1); }
    }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'boggle/dont-move', name: 'Don’t Move', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['unaware', 'fright'],
    text: 'Choose an [Unaware] enemy. Apply {n} [Fright] to it and gain {b} Guard.',
    flavor: 'Neither of them moves. One of them is enjoying it.',
    nums: { n: 2, b: 6 },
    effect: eff((c) => { const t = isUnaware(c, c.target) ? c.target : unawareEnemies(c)[0]; if (t) { fright(c, t, N(c).n); U.guard(c, N(c).b); } }),
    upgrade: { nums: { n: 3, b: 9 } },
  },
  {
    id: 'boggle/wait-for-it', name: 'Wait For It', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['lurk'],
    text: 'Playable only if you have played no Attack this turn. Gain {l} [Lurk]. You cannot play Attacks this turn.',
    flavor: 'Patience is a kind of appetite.',
    nums: { l: 1 },
    effect: eff((c) => { gainLurk(c, N(c).l); forbidAttacks(c); }),
    playable: (c) => !U.mm(c).attackedThisTurn,
    playableReason: 'You have already played an Attack this turn.',
    upgrade: { nums: { l: 2 } },
  },
  {
    id: 'boggle/dust-bunny-decoy', name: 'Dust Bunny Decoy', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['fright', 'unaware'],
    text: 'Apply {n} [Fright] to an Aware enemy. At the end of your turn, if it is still Aware, make it [Unaware].',
    flavor: 'It is mostly dust. It is enough.',
    nums: { n: 2 },
    effect: eff((c) => {
      const t = c.target;
      if (!t || !isAware(c, t)) return;
      fright(c, t, N(c).n);
      U.atTurnEnd(c, (x) => { if (isAware(x, t)) hide(x, t); });
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'boggle/nervous-giggle', name: 'Nervous Giggle', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['fright', 'scare'],
    text: 'Apply {n} [Fright]. [Scare] 4: draw {d2} Tricks.',
    flavor: 'He is not laughing at you. He is laughing near you.',
    nums: { n: 1, d2: 2 },
    effect: eff((c) => { fright(c, c.target, N(c).n); scare(c, c.target, 4, (x) => U.draw(x, N(x).d2)); }),
    upgrade: { nums: { n: 2, d2: 2 } },
  },
  {
    id: 'boggle/cozy-darkness', name: 'Cozy Darkness', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['unaware', 'suspicious'],
    text: 'Gain {b} Guard for each living enemy that is [Unaware] or [Suspicious].',
    flavor: 'The dark is not empty. That is the nice part.',
    nums: { b: 4 },
    effect: eff((c) => {
      const n = U.enemies(c).filter((e) => !isAware(c, e)).length;
      U.guard(c, N(c).b * n);
    }),
    upgrade: { nums: { b: 6 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (12) ──
  {
    id: 'boggle/underbed-uppercut', name: 'Underbed Uppercut', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: deal {m0} more.',
    flavor: 'Straight up through the mattress.',
    nums: { d: 12, m0: 5 },
    effect: eff((c) => { const a = ambush(c, c.target); U.hit(c, N(c).d + (a ? N(c).m0 : 0)); }),
    upgrade: { nums: { d: 16, m0: 6 } },
  },
  {
    id: 'boggle/sock-drawer-lunge', name: 'Sock Drawer Lunge', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['suspicious'],
    text: 'Deal {d} damage. If the target is [Suspicious], draw {n} Trick.',
    flavor: 'Nobody has ever found the other sock either.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => { const sus = isSuspicious(c, c.target); ambush(c, c.target); U.hit(c, N(c).d); if (sus) U.draw(c, N(c).n); }),
    upgrade: { nums: { d: 10, n: 2 } },
  },
  {
    id: 'boggle/big-eyes-in-the-dark', name: 'Big Eyes in the Dark', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'fright'],
    text: 'Deal {d} damage and apply {n} [Fright]. [Ambush]: afterwards the target becomes Aware instead of [Suspicious].',
    flavor: 'Two of them. Then four. Then rather too many.',
    nums: { d: 5, n: 3 },
    effect: eff((c) => {
      const hidden = isUnaware(c, c.target);
      ambush(c, c.target);
      U.hit(c, N(c).d);
      fright(c, c.target, N(c).n);
      if (hidden) markSuspicious(c, c.target, { to: 'aware', ambushed: true });
    }),
    upgrade: { nums: { d: 7, n: 5 } },
  },
  {
    id: 'boggle/scritch-scratch-scritch', name: 'Scritch Scratch Scritch', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['fright'],
    text: 'Deal three hits of {d}. For every 3 [Fright] on the target, one hit deals {d2} instead. Fright is not spent.',
    flavor: 'Claws on the underside of the bedframe, unhurried.',
    nums: { d: 4, d2: 7, hits: 3 },
    effect: eff((c) => {
      const t = c.target;
      const up = Math.min(3, Math.floor(frightOn(c, t) / 3));
      ambush(c, t);
      for (let i = 0; i < 3; i++) U.hitAt(c, t, i < up ? N(c).d2 : N(c).d);
    }),
    upgrade: { nums: { d: 6, d2: 10, hits: 3 } },
  },
  {
    id: 'boggle/that-was-my-foot', name: 'That Was My Foot', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['suspicious', 'fright', 'vanish'],
    exhaust: true,
    text: 'Deal {d} damage. If the target is [Suspicious], apply {n} [Fright]. [Vanish].',
    flavor: 'An accident, he insists.',
    nums: { d: 4, n: 2 },
    effect: eff((c) => {
      const sus = isSuspicious(c, c.target);
      ambush(c, c.target);
      U.hit(c, N(c).d);
      if (sus) fright(c, c.target, N(c).n);
    }),
    upgrade: { nums: { d: 7, n: 3 } },
  },
  {
    id: 'boggle/surprise-from-behind', name: 'Surprise From Behind', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: refund {n} Nerve. Once per turn.',
    flavor: 'Behind is where he lives.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => {
      const a = ambush(c, c.target);
      U.hit(c, N(c).d);
      if (a && U.once(c, 'surpriseRefund')) U.energy(c, N(c).n);
    }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'boggle/ceiling-creep', name: 'Ceiling Creep', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['ambush', 'fright'],
    text: 'Deal {d} damage to all enemies. [Ambush]: each [Unaware] target also gains {n} [Fright] first.',
    flavor: 'Nobody looks up. Nobody ever looks up.',
    nums: { d: 7, n: 2 },
    balance: { scalesWith: 'the size of the room — every enemy takes it, and every Unaware one is Ambushed for 2 Fright first' },
    effect: eff((c) => {
      const hidden = unawareEnemies(c);
      for (const e of hidden) { ambush(c, e); fright(c, e, N(c).n); }
      U.hitAll(c, N(c).d);
    }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'boggle/dont-look-behind-you', name: 'Don’t Look Behind You', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['scare', 'unaware'],
    text: 'Deal {d} damage. [Scare] 5: make a different Aware enemy [Unaware]. If there is none, gain {b} Guard.',
    flavor: 'Good advice, universally ignored.',
    nums: { d: 7, b: 4 },
    effect: eff((c) => {
      ambush(c, c.target);
      U.hit(c, N(c).d);
      scare(c, c.target, 5, (x) => {
        const other = awareEnemies(x).find((e) => e !== x.target);
        if (other) hide(x, other); else U.guard(x, N(x).b);
      });
    }),
    upgrade: { nums: { d: 10, b: 7 } },
  },
  {
    id: 'boggle/long-arms', name: 'Long Arms', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'fright', 'suspicious'],
    text: 'Deal {d} damage. Against Aware enemies apply {n} [Fright]. Against [Suspicious] enemies gain {b} Guard. [Ambush]: deal {d2} more.',
    flavor: 'Longer than the bed. Considerably longer than the room.',
    nums: { d: 7, d2: 4, n: 2, b: 6 },
    effect: eff((c) => {
      const t = c.target;
      const aware = isAware(c, t); const sus = isSuspicious(c, t);
      const a = ambush(c, t);
      U.hit(c, N(c).d + (a ? N(c).d2 : 0));
      if (aware) fright(c, t, N(c).n);
      if (sus) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { d: 10, d2: 6, n: 3, b: 9 } },
  },
  {
    id: 'boggle/monster-in-the-mirror', name: 'Monster in the Mirror', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['fright'],
    text: 'Deal {d} damage. Move up to {n} [Fright] from the target to another enemy, then apply 1 to both. With no second enemy, apply {n2} to the target instead.',
    flavor: 'It is behind you in there too.',
    nums: { d: 5, n: 3, n2: 2 },
    effect: eff((c) => {
      const t = c.target;
      ambush(c, t);
      U.hit(c, N(c).d);
      const other = U.enemies(c).find((e) => e !== t);
      if (!other) { fright(c, t, N(c).n2); return; }
      const moved = Math.min(N(c).n, frightOn(c, t));
      if (moved > 0) { U.unapply(c, t, FRIGHT, moved); fright(c, other, moved); }
      fright(c, t, 1); fright(c, other, 1);
    }),
    upgrade: { nums: { d: 7, n: 5, n2: 4 } },
  },
  {
    id: 'boggle/wrong-side-of-bed', name: 'Wrong Side of Bed', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['lurk'],
    text: 'Deal {d} damage. Spend up to {l} [Lurk]; deal {d2} more for each. All hits land before the target becomes [Suspicious].',
    flavor: 'There is a correct side. This was not it.',
    nums: { d: 11, d2: 4, l: 2 },
    balance: { scalesWith: 'Lurk — up to two more hits, all of them landing before the target turns Suspicious' },
    effect: eff((c) => {
      const t = c.target;
      ambush(c, t);
      U.hit(c, N(c).d);
      const spent = spendLurk(c, N(c).l);
      for (let i = 0; i < spent; i++) U.hitAt(c, t, N(c).d2);
    }),
    upgrade: { nums: { d: 15, d2: 6, l: 3 } },
  },
  {
    id: 'boggle/boo', name: 'BOO!', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['scare', 'lurk'],
    text: 'Deal {d} damage. [Scare] 6: deal {m0} more. If the target was [Unaware], gain {l} [Lurk] first.',
    flavor: 'The whole point of him, really.',
    nums: { d: 4, m0: 11, l: 1 },
    effect: eff((c) => {
      const t = c.target;
      const hidden = isUnaware(c, t);
      ambush(c, t);
      U.hit(c, N(c).d);
      scare(c, t, 6, (x) => { if (hidden) gainLurk(x, N(x).l); U.hitAt(x, t, N(x).m0); });
    }),
    upgrade: { nums: { d: 6, m0: 15, l: 1 } },
  },

  // ── Skills (15) ──
  {
    id: 'boggle/false-alarm', name: 'False Alarm', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['unaware', 'awareness'],
    text: 'Make one [Unaware] enemy Aware without making it [Suspicious]. Draw {n} Trick. Once per turn.',
    flavor: 'Nothing here. Go back to sleep.',
    nums: { n: 1 },
    effect: eff((c) => {
      const t = isUnaware(c, c.target) ? c.target : unawareEnemies(c)[0];
      if (t) setAware(c, t);
      U.draw(c, N(c).n);
    }),
    playable: (c) => !U.got(c, 'falseAlarm'),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'boggle/scuttle-away', name: 'Scuttle Away', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['unaware'],
    text: 'Gain {b} Guard and make an Aware enemy [Unaware]. If it meant to Attack you, gain {b2} more.',
    flavor: 'Low, fast, and entirely under the furniture.',
    nums: { b: 4, b2: 6 },
    effect: eff((c) => {
      const wasAimed = aimedAtMe(c, c.target);
      U.guard(c, N(c).b);
      if (hide(c, c.target) && wasAimed) U.guard(c, N(c).b2);
    }),
    upgrade: { nums: { b: 7, b2: 9 } },
  },
  {
    id: 'boggle/lump-under-the-blanket', name: 'Lump Under the Blanket', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['suspicious', 'fright'],
    text: 'Choose an enemy. The next time it becomes [Suspicious] before your next turn, apply {n} [Fright].',
    flavor: 'That is not a knee.',
    nums: { n: 3 },
    effect: eff((c) => { mark(c, c.target, 'lump', N(c).n); }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'boggle/creaky-floorboard', name: 'Creaky Floorboard', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['fright', 'awareness'],
    text: 'Apply {n} [Fright] to every Aware or [Suspicious] enemy and {n2} to every [Unaware] one.',
    flavor: 'The house helps.',
    nums: { n: 2, n2: 1 },
    effect: eff((c) => { for (const e of U.enemies(c)) fright(c, e, isUnaware(c, e) ? N(c).n2 : N(c).n); }),
    upgrade: { nums: { n: 3, n2: 2 } },
  },
  {
    id: 'boggle/no-one-here-but-dust', name: 'No One Here But Dust', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['unaware', 'fright'],
    text: 'Make up to two Aware enemies [Unaware]. If only one enemy is alive, also apply {n} [Fright] to it.',
    flavor: 'And dust does not talk.',
    nums: { n: 3 },
    effect: eff((c) => {
      const list = awareEnemies(c).slice(0, 2);
      for (const e of list) hide(c, e);
      const all = U.enemies(c);
      if (all.length === 1) fright(c, all[0], N(c).n);
    }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'boggle/closer-closer', name: 'Closer... Closer...', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['lurk', 'fright', 'unaware'],
    text: 'Playable only while an enemy is [Unaware]. Gain {l} [Lurk] and apply {n} [Fright] to every [Unaware] enemy.',
    flavor: 'It is nearer than it was. It is always nearer than it was.',
    nums: { l: 1, n: 2 },
    effect: eff((c) => { gainLurk(c, N(c).l); for (const e of unawareEnemies(c)) fright(c, e, N(c).n); }),
    playable: (c) => unawareEnemies(c).length > 0,
    upgrade: { nums: { l: 1, n: 4 } },
  },
  {
    id: 'boggle/dont-turn-around', name: 'Don’t Turn Around', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['search', 'fright', 'lurk'],
    text: 'Mark an [Unaware] enemy. The next time it [Search]es, apply {n} more [Fright]. If it does not before your next turn, gain {l} [Lurk].',
    flavor: 'He is right there. He is right there.',
    nums: { n: 3, l: 1 },
    effect: eff((c) => {
      const t = isUnaware(c, c.target) ? c.target : unawareEnemies(c)[0];
      if (!t) return;
      mark(c, t, 'dontTurn', N(c).n);
      const l = N(c).l;
      U.nextTurn(c, (x) => { if (takeMark(x, t, 'dontTurn')) gainLurk(x, l); });
    }),
    upgrade: { nums: { n: 5, l: 1 } },
  },
  {
    id: 'boggle/hide-and-shriek', name: 'Hide and Shriek', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['unaware', 'fright'],
    text: 'Make an Aware enemy [Unaware] and apply {n} [Fright] to a different enemy. With no other enemy, apply {n2} to that one.',
    flavor: 'The shriek is the fun part.',
    nums: { n: 2, n2: 1 },
    effect: eff((c) => {
      const t = c.target;
      const hid = hide(c, t);
      const other = U.enemies(c).find((e) => e !== t);
      if (other) fright(c, other, N(c).n);
      else if (hid) fright(c, t, N(c).n2);
    }),
    upgrade: { nums: { n: 4, n2: 2 } },
  },
  {
    id: 'boggle/shiver-in-the-walls', name: 'Shiver in the Walls', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['fright', 'suspicious'],
    text: 'Apply {n} [Fright] to all enemies. [Suspicious] enemies take {n2} instead.',
    flavor: 'Inside the plaster, something adjusts itself.',
    nums: { n: 1, n2: 3 },
    effect: eff((c) => { for (const e of U.enemies(c)) fright(c, e, isSuspicious(c, e) ? N(c).n2 : N(c).n); }),
    upgrade: { nums: { n: 2, n2: 5 } },
  },
  {
    id: 'boggle/emergency-pillow', name: 'Emergency Pillow', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['suspicious'],
    text: 'Retain. Gain {b} Guard. Costs 0 this turn if an enemy became [Suspicious] during the last enemy turn.',
    flavor: 'Kept under the pillow, which is itself under the bed.',
    nums: { b: 10 },
    effect: eff((c) => U.guard(c, N(c).b)),
    retain: true,
    dynamicCost: (c) => (U.mm(c).suspiciousLastEnemyTurn ? 0 : 1),
    upgrade: { nums: { b: 14 } },
  },
  {
    id: 'boggle/crawlspace-shortcut', name: 'Crawlspace Shortcut', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE,
    text: 'Draw {n} Tricks. Put one from your hand on top of your draw pile; it costs {m} less when drawn.',
    flavor: 'Behind the wardrobe, through the wall, out by the stairs.',
    nums: { n: 2, m: 1 },
    effect: eff(async (c) => {
      U.draw(c, N(c).n);
      const [pick] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Put one Trick back on top' });
      if (!pick) return;
      U.toDrawTop(c, pick);
      U.setFlag(pick, 'crawlspace', N(c).m);
    }),
    upgrade: { nums: { n: 3, m: 1 } },
  },
  {
    id: 'boggle/keep-the-lights-off', name: 'Keep the Lights Off', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['ambush', 'unaware'],
    text: 'The next {n} Attacks you play on [Unaware] enemies leave them Aware instead of [Suspicious].',
    flavor: 'The switch is all the way over there anyway.',
    nums: { n: 2 },
    effect: eff((c) => { U.mm(c).lightsOff = (U.mm(c).lightsOff || 0) + N(c).n; }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'boggle/under-the-rug', name: 'Under the Rug', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE,
    text: 'Set aside another Trick from your hand. It returns at the start of your next turn costing 0.',
    flavor: 'A lump in the hall that everyone steps over.',
    nums: {},
    effect: eff(async (c) => {
      const [pick] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Slide one Trick under the rug' });
      if (!pick) return;
      U.moveCard(c, pick, 'limbo', { set: true });
      U.nextTurn(c, (x) => { U.toHand(x, pick); U.costSet(x, pick, 0, 'turn'); });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'boggle/stage-fright', name: 'Stage Fright', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['fright', 'scare', 'awareness'],
    text: 'Apply {n} [Fright]. [Scare] 4: Aware becomes [Unaware]; [Suspicious] gives {l} [Lurk]; [Unaware] gives {b} Guard.',
    flavor: 'Everybody is watching. That is the problem.',
    nums: { n: 2, l: 1, b: 6 },
    effect: eff((c) => {
      const t = c.target;
      fright(c, t, N(c).n);
      scare(c, t, 4, (x) => {
        if (isUnaware(x, t)) U.guard(x, N(x).b);
        else if (isSuspicious(x, t)) gainLurk(x, N(x).l);
        else hide(x, t);
      });
    }),
    upgrade: { nums: { n: 3, l: 1, b: 9 } },
  },
  {
    id: 'boggle/bedtime-jitters', name: 'Bedtime Jitters', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['lurk', 'fright'],
    text: 'You may spend {l} [Lurk]. If you do, apply {n2} [Fright] to all enemies; otherwise apply {n}.',
    flavor: 'It is nearly bedtime. It is always nearly bedtime.',
    nums: { l: 1, n: 1, n2: 4 },
    effect: eff((c) => { const spent = spendLurk(c, N(c).l); frightAll(c, spent >= N(c).l ? N(c).n2 : N(c).n); }),
    upgrade: { nums: { l: 1, n: 2, n2: 6 } },
  },

  // ── Powers (8) ──
  {
    id: 'boggle/the-house-settles', name: 'The House Settles', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unaware', 'fright'],
    text: 'Whenever an enemy becomes [Unaware], apply {n} [Fright] to it. At most three times a turn.',
    flavor: 'Old houses talk to themselves.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'boggle/the-house-settles', N(c).n)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'boggle/quiet-as-dust', name: 'Quiet as Dust', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['ambush', 'suspicious'],
    text: 'The first [Ambush] Attack each turn leaves its target Aware instead of [Suspicious].',
    flavor: 'He has had a very long time to practise being quiet.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/quiet-as-dust', 1, (x) => { U.mm(x).quietAsDust = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'boggle/underbed-kingdom', name: 'Underbed Kingdom', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['lurk'],
    text: 'Maximum [Lurk] becomes 7 this combat. Gain {l} [Lurk].',
    flavor: 'It is bigger under there. Considerably bigger.',
    nums: { l: 1 },
    effect: eff((c) => power(c, 'boggle/underbed-kingdom', 1, (x) => { raiseLurkCap(x); gainLurk(x, N(x).l); })),
    upgrade: { nums: { l: 2 } },
  },
  {
    id: 'boggle/imagination-does-the-rest', name: 'Imagination Does the Rest', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['scare', 'fright'],
    text: 'Whenever a [Scare] triggers, apply {n} [Fright] to a different enemy.',
    flavor: 'He barely has to do anything now.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'boggle/imagination-does-the-rest', N(c).n)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'boggle/one-eye-open', name: 'One Eye Open', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['suspicious'],
    text: 'At the end of your turn, gain 3 Guard for each [Suspicious] enemy, up to 10.',
    flavor: 'Sleeping is for things that are not being hunted.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/one-eye-open', 1, (x) => { U.mm(x).oneEyeOpen = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'boggle/creaks-have-teeth', name: 'Creaks Have Teeth', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['search', 'fright'],
    text: 'Whenever an enemy [Search]es, deal 4 damage to it and give it {n} more [Fright].',
    flavor: 'Looking under the bed has consequences.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'boggle/creaks-have-teeth', N(c).n)),
    upgrade: { cost: 1 },
  },
  {
    id: 'boggle/practice-your-scream', name: 'Practice Your Scream', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['scare', 'fright'],
    text: 'Your first [Scare] each turn needs and spends {n} less [Fright], minimum 1.',
    flavor: 'In the mirror, quietly, so nobody hears him practising.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'boggle/practice-your-scream', N(c).n, (x) => { U.mm(x).practice = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'boggle/beneath-every-bed', name: 'Beneath Every Bed', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['unaware', 'lurk'],
    text: 'If every living enemy is [Unaware] at the end of your turn, gain 1 extra [Lurk] and draw an extra Trick next turn.',
    flavor: 'Every bed in the house is the same bed, from underneath.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/beneath-every-bed', 1, (x) => { U.mm(x).beneathEveryBed = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ──
  {
    id: 'boggle/the-big-one', name: 'The Big One', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['lurk', 'ambush'],
    text: 'Deal {d} damage. Spend all [Lurk]; deal {d2} more for each. [Ambush]: the last hit deals {d3} instead.',
    flavor: 'Everything he has been saving up, all at once.',
    nums: { d: 11, d2: 7, d3: 11 },
    balance: { scalesWith: 'every point of Lurk you have banked — at 5 Lurk this is 11 + five more hits' },
    effect: eff((c) => {
      const t = c.target;
      const a = ambush(c, t);
      U.hit(c, N(c).d);
      const spent = spendLurk(c, lurk(c));
      for (let i = 0; i < spent; i++) {
        const last = i === spent - 1;
        U.hitAt(c, t, last && a ? N(c).d3 : N(c).d2);
      }
    }),
    upgrade: { nums: { d: 15, d2: 10, d3: 15 } },
  },
  {
    id: 'boggle/check-under-the-bed', name: 'Check Under the Bed', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['ambush', 'fright'],
    text: 'Deal {d} damage. [Ambush]: spend up to 10 [Fright] from the target; deal {d2} for every 2 spent.',
    flavor: 'He was hoping you would.',
    nums: { d: 14, d2: 4 },
    effect: eff((c) => {
      const t = c.target;
      const a = ambush(c, t);
      U.hit(c, N(c).d);
      if (!a) return;
      const spend = Math.min(10, frightOn(c, t));
      const hits = Math.floor(spend / 2);
      if (hits > 0) { U.unapply(c, t, FRIGHT, hits * 2); for (let i = 0; i < hits; i++) U.hitAt(c, t, N(c).d2); }
    }),
    upgrade: { nums: { d: 19, d2: 6 } },
  },
  {
    id: 'boggle/nothing-but-teeth', name: 'Nothing But Teeth', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['fright'],
    text: 'Deal five hits of {d}. For each 3 [Fright] on the target, one hit deals {d2} instead. Fright is not spent.',
    flavor: 'There is no face. There was never a face.',
    nums: { d: 4, d2: 7, hits: 5 },
    effect: eff((c) => {
      const t = c.target;
      const up = Math.min(5, Math.floor(frightOn(c, t) / 3));
      ambush(c, t);
      for (let i = 0; i < 5; i++) U.hitAt(c, t, i < up ? N(c).d2 : N(c).d);
    }),
    upgrade: { nums: { d: 6, d2: 10, hits: 5 } },
  },
  {
    id: 'boggle/too-late-to-run', name: 'Too Late to Run', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['fright', 'scare', 'unaware', 'lurk'],
    text: 'Only targets an enemy with {f} or more [Fright]. Deal {d} damage. [Scare] 8: make every other Aware enemy [Unaware], or gain {l} [Lurk].',
    flavor: 'It was too late a while ago.',
    nums: { d: 22, f: 8, l: 2 },
    effect: eff((c) => {
      const t = c.target;
      ambush(c, t);
      U.hit(c, N(c).d);
      scare(c, t, 8, (x) => {
        const others = awareEnemies(x).filter((e) => e !== t);
        if (others.length) for (const e of others) hide(x, e);
        else gainLurk(x, N(x).l);
      });
    }),
    playable: (c) => frightOn(c, c.target) >= 8,
    playableReason: 'That one is not frightened enough yet.',
    upgrade: { nums: { d: 28, f: 8, l: 2 } },
  },
  {
    id: 'boggle/everywhere-at-once', name: 'Everywhere at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['unaware', 'lurk', 'ambush'],
    text: 'Deal {d} to all enemies, and {d2} more to each [Unaware] one. Gain {l} [Lurk] for each Ambushed this way, up to 2.',
    flavor: 'Under every bed, behind every door, at the same time.',
    nums: { d: 7, d2: 4, l: 1 },
    balance: { scalesWith: 'the whole room, plus an extra hit on every Unaware enemy and Lurk for each' },
    effect: eff((c) => {
      const hidden = unawareEnemies(c);
      for (const e of hidden) ambush(c, e);
      U.hitAll(c, N(c).d);
      for (const e of hidden) U.hitAt(c, e, N(c).d2);
      gainLurk(c, Math.min(2, hidden.length * N(c).l));
    }),
    upgrade: { nums: { d: 10, d2: 6, l: 1 } },
  },
  {
    id: 'boggle/the-shadow-is-bigger', name: 'The Shadow Is Bigger', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['lurk', 'ambush', 'fright'],
    text: 'Deal {d} damage, plus {d} more for each [Lurk] you have. [Ambush]: apply [Fright] equal to your Lurk first. Lurk is not spent.',
    flavor: 'The shadow was always bigger than the monster.',
    nums: { d: 4 },
    balance: { scalesWith: 'your Lurk — one extra hit for each, and Fright equal to it on an Ambush, without spending any' },
    effect: eff((c) => {
      const t = c.target;
      const l = lurk(c);
      const a = ambush(c, t);
      if (a && l > 0) fright(c, t, l);
      U.hit(c, N(c).d);
      for (let i = 0; i < l; i++) U.hitAt(c, t, N(c).d);
    }),
    upgrade: { nums: { d: 6 } },
  },
  {
    id: 'boggle/again-but-over-there', name: 'Again, But Over There', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['ambush', 'unaware'],
    text: 'Deal {d} damage. [Ambush]: if another [Unaware] enemy exists, return this to your hand at 0 Nerve. Twice per turn.',
    flavor: 'And now from over here.',
    nums: { d: 7 },
    effect: eff((c) => {
      const t = c.target;
      const a = ambush(c, t);
      U.hit(c, N(c).d);
      if (!a) return;
      const another = unawareEnemies(c).some((e) => e !== t);
      if (!another) return;
      if (U.bump(c, 'againOverThere') > 2) return;
      U.returnSelf(c);
      U.costSet(c, c.card, 0, 'turn');
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'boggle/i-was-behind-you', name: 'I Was Behind You', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['suspicious', 'scare'],
    text: 'Deal {d} damage. Costs 0 if the target became [Suspicious] during the last enemy turn. [Scare] 4: deal {d2} more.',
    flavor: 'The entire time.',
    nums: { d: 14, d2: 7 },
    effect: eff((c) => {
      const t = c.target;
      ambush(c, t);
      U.hit(c, N(c).d);
      scare(c, t, 4, (x) => U.hitAt(x, t, N(x).d2));
    }),
    dynamicCost: (c) => (U.mm(c).suspiciousLastEnemyTurn ? 0 : 2),
    upgrade: { nums: { d: 19, d2: 10 } },
  },

  // ── Skills (9) ──
  {
    id: 'boggle/lights-out', name: 'Lights Out', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['unaware', 'lurk', 'suspicious'],
    text: 'Make every Aware enemy [Unaware]. [Suspicious] enemies are unaffected. If any became Unaware, gain {l} [Lurk].',
    flavor: 'Click.',
    nums: { l: 1 },
    effect: eff((c) => {
      let any = false;
      for (const e of awareEnemies(c)) if (hide(c, e)) any = true;
      if (any) gainLurk(c, N(c).l);
    }),
    upgrade: { cost: 2 },
  },
  {
    id: 'boggle/the-long-wait', name: 'The Long Wait', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['lurk', 'vanish'],
    exhaust: true,
    text: 'Playable only if you have played no Attack this turn. Gain {l} [Lurk]. No Attacks this turn. Draw {n} extra next turn. [Vanish].',
    flavor: 'He can wait longer than you can.',
    nums: { l: 2, n: 2 },
    effect: eff((c) => {
      gainLurk(c, N(c).l);
      const st = U.mm(c);
      forbidAttacks(c);
      st.bedTimeDraw = (st.bedTimeDraw || 0) + N(c).n;
    }),
    playable: (c) => !U.mm(c).attackedThisTurn,
    playableReason: 'You have already played an Attack this turn.',
    upgrade: { nums: { l: 3, n: 2 } },
  },
  {
    id: 'boggle/dont-check-again', name: 'Don’t Check Again', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['search', 'fright', 'unaware'],
    text: 'Choose an [Unaware] enemy. The next time it [Search]es this combat it takes {n} more [Fright] and ends Aware, not [Suspicious].',
    flavor: 'There is nothing under there. Really.',
    nums: { n: 5 },
    effect: eff((c) => {
      const t = isUnaware(c, c.target) ? c.target : unawareEnemies(c)[0];
      if (t) { mark(c, t, 'dontCheck', N(c).n); }
    }),
    upgrade: { nums: { n: 8 } },
  },
  {
    id: 'boggle/hiding-place-inside-a-hiding-place', name: 'Hiding Place Inside a Hiding Place', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['awareness', 'lurk', 'fright'],
    text: 'Aware: make it [Unaware] and gain {l} [Lurk]. [Unaware]: apply {n} [Fright] and gain {l} [Lurk]. [Suspicious]: gain {b} Guard and draw {c1}.',
    flavor: 'Under the bed there is a box, and under the box there is a Boggle.',
    nums: { l: 1, n: 4, b: 10, c1: 1 },
    effect: eff((c) => {
      const t = c.target;
      if (!t) return;
      if (isUnaware(c, t)) { fright(c, t, N(c).n); gainLurk(c, N(c).l); }
      else if (isSuspicious(c, t)) { U.guard(c, N(c).b); U.draw(c, N(c).c1); }
      else if (hide(c, t)) gainLurk(c, N(c).l);
    }),
    upgrade: { nums: { l: 1, n: 6, b: 14, c1: 2 } },
  },
  {
    id: 'boggle/every-creak-means-me', name: 'Every Creak Means Me', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['fright'],
    text: 'Double the [Fright] on every enemy. No enemy gains more than {n} this way.',
    flavor: 'It is all him. It was all him the whole time.',
    nums: { n: 8 },
    effect: eff((c) => { for (const e of U.enemies(c)) fright(c, e, Math.min(N(c).n, frightOn(c, e))); }),
    upgrade: { nums: { n: 12 } },
  },
  {
    id: 'boggle/dont-scream-yet', name: 'Don’t Scream Yet', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, keywords: ['scare', 'fright', 'vanish'],
    exhaust: true,
    text: 'The next {n} [Scare] clauses this turn still need their [Fright] but do not spend it. [Vanish].',
    flavor: 'Save it. Save it. Now.',
    nums: { n: 2 },
    effect: eff((c) => {
      const st = U.mm(c);
      st.fearOfDark = true;
      st.noScreamYet = (st.noScreamYet || 0) + N(c).n;
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'boggle/hide-in-plain-sight', name: 'Hide in Plain Sight', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['unaware', 'ambush'],
    text: 'This turn your Attacks do not change an [Unaware] target’s [Awareness]. At end of turn each becomes Aware instead.',
    flavor: 'Standing perfectly still in the middle of the rug.',
    nums: {},
    effect: eff((c) => { U.mm(c).plainSight = true; }),
    upgrade: { cost: 1 },
  },
  {
    id: 'boggle/the-room-is-looking-back', name: 'The Room Is Looking Back', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['fright', 'awareness'],
    text: 'Apply {n3} [Fright] to every [Suspicious] enemy, {n2} to every Aware one and {n} to every [Unaware] one.',
    flavor: 'The wallpaper has been paying attention.',
    nums: { n: 1, n2: 3, n3: 6 },
    effect: eff((c) => {
      for (const e of U.enemies(c)) {
        fright(c, e, isSuspicious(c, e) ? N(c).n3 : (isUnaware(c, e) ? N(c).n : N(c).n2));
      }
    }),
    upgrade: { nums: { n: 2, n2: 5, n3: 9 } },
  },
  {
    id: 'boggle/everybody-heard-that', name: 'Everybody Heard That', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ALL_ENEMIES, keywords: ['lurk', 'fright', 'unaware'],
    text: 'Spend all [Lurk]. Apply {n} [Fright] spread over the enemies for each spent. If you spent 4 or more, make an Aware enemy [Unaware].',
    flavor: 'Nobody is pretending any more.',
    nums: { n: 2 },
    effect: eff((c) => {
      const spent = spendLurk(c, lurk(c));
      const list = U.enemies(c);
      if (!list.length) return;
      let total = spent * N(c).n;
      let i = 0;
      while (total > 0) { fright(c, list[i % list.length], 1); total--; i++; }
      if (spent >= 4) { const t = awareEnemies(c)[0]; if (t) hide(c, t); }
    }),
    upgrade: { nums: { n: 3 } },
  },

  // ── Powers (8) ──
  {
    id: 'boggle/fear-of-the-dark', name: 'Fear of the Dark', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['scare', 'fright'],
    text: 'The first [Scare] against each enemy each turn does not spend its [Fright]. It still needs the full amount.',
    flavor: 'The dark does not need to do anything. It just has to be there.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/fear-of-the-dark', 1, (x) => { U.mm(x).fearOfDark = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'boggle/nobodys-here', name: 'Nobody’s Here', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['unaware', 'fright', 'search'],
    text: 'Once a turn, when an Aware enemy with {f} or more [Fright] aims a directed Attack at you, make it [Unaware] first.',
    flavor: 'Nobody at all.',
    nums: { f: 6 },
    effect: eff((c) => power(c, 'boggle/nobodys-here', 1, (x) => { U.mm(x).nobodysHere = N(x).f; })),
    upgrade: { nums: { f: 4 } },
  },
  {
    id: 'boggle/monster-under-every-bed', name: 'Monster Under Every Bed', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['lurk', 'fright', 'unaware'],
    text: 'When you gain your end-of-turn [Lurk], apply 2 [Fright] to all enemies, or 3 if every enemy is [Unaware].',
    flavor: 'There are more of him than anyone has admitted.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/monster-under-every-bed', 1, (x) => { U.mm(x).monsterEveryBed = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'boggle/bedframe-geography', name: 'Bedframe Geography', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['suspicious', 'unaware'],
    text: 'The first time each turn an enemy becomes [Suspicious], make a different Aware enemy [Unaware], or apply {n} [Fright] to it.',
    flavor: 'Every bed connects to every other bed. Obviously.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'boggle/bedframe-geography', N(c).n)),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'boggle/bigger-in-your-head', name: 'Bigger in Your Head', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['scare', 'fright'],
    text: 'Whenever a [Scare] spends [Fright], half of it, rounded down, returns to that enemy at the end of your turn.',
    flavor: 'He is about the size of a cat. You will not believe that.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/bigger-in-your-head', 1, (x) => { U.mm(x).biggerInHead = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'boggle/feed-the-imagination', name: 'Feed the Imagination', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['suspicious', 'fright', 'ambush'],
    text: 'Whenever an enemy becomes [Suspicious], apply 2 [Fright], or 3 if you [Ambush]ed it.',
    flavor: 'They do most of the work themselves.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/feed-the-imagination', 1)),
    upgrade: { cost: 1 },
  },
  {
    id: 'boggle/you-didnt-see-anything', name: 'You Didn’t See Anything', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['suspicious', 'unaware', 'lurk'],
    text: 'Hiding Tricks may target [Suspicious] enemies. The first each turn works if you spend {l} [Lurk].',
    flavor: 'You did not. You were asleep.',
    nums: { l: 2 },
    effect: eff((c) => power(c, 'boggle/you-didnt-see-anything', 1, (x) => { U.mm(x).seeNothing = N(x).l; })),
    upgrade: { nums: { l: 1 } },
  },
  {
    id: 'boggle/good-night-sleep-tight', name: 'Good Night, Sleep Tight', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['fright', 'unaware', 'lurk'],
    text: 'At end of turn, if every living enemy has 8 or more [Fright], make every Aware enemy [Unaware] and gain 1 [Lurk].',
    flavor: 'Don’t let the bedbugs bite. They are the least of it.',
    nums: {},
    effect: eff((c) => power(c, 'boggle/good-night-sleep-tight', 1, (x) => { U.mm(x).goodNight = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'boggle/hide-behind-me', name: 'Hide Behind Me! Wait, You Hide Behind Me!', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unaware', 'search'],
    text: 'Choose another Kid. Until your next turn the first directed Attack aimed at them comes to you instead. If the attacker is [Unaware] it [Search]es; otherwise gain {b} Guard first.',
    flavor: 'Both of them are already under the bed. There is not room.',
    nums: { b: 10 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      U.mm(c).redirect = { seat: ally.seat, guard: N(c).b };
      U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 14 } },
  },
  {
    id: 'boggle/perfect-distraction', name: 'Perfect Distraction', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unaware', 'fright', 'lurk'],
    text: 'Choose another Kid. The next time they Attack this round, make a different Aware enemy [Unaware] and apply {n} [Fright]. With one enemy, apply {n2} and gain {l} [Lurk].',
    flavor: 'Look over there. No — over THERE.',
    nums: { n: 2, n2: 3, l: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      U.mm(c).distraction = { seat: ally.seat, n: N(c).n, n2: N(c).n2, l: N(c).l };
    }),
    upgrade: { nums: { n: 4, n2: 5, l: 1 } },
  },
  {
    id: 'boggle/count-to-three', name: 'Count to Three', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ambush', 'fright'],
    text: 'Choose another Kid and an enemy. The first time they damage it before your next turn, deal {d} damage to it. If it is [Unaware] that hit gets [Ambush]; otherwise apply {n} [Fright].',
    flavor: 'One. Two. He never gets to three.',
    nums: { d: 7, n: 3 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally || !c.target) return;
      mark(c, c.target, 'countTo', N(c).d);
      U.mm(c).countSeat = ally.seat;
      U.mm(c).countFright = N(c).n;
    }),
    upgrade: { nums: { d: 10, n: 5 } },
  },
  {
    id: 'boggle/everybody-under-the-bed', name: 'Everybody Under the Bed!', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: SELF, keywords: ['search', 'lurk', 'unaware'],
    text: 'Every Kid gains {b} Guard. Redirect one attacker from each other Kid to you; any that is [Unaware] [Search]es instead. Gain {l} [Lurk] for each Search.',
    flavor: 'It is a tight fit and nobody is comfortable.',
    nums: { b: 7, l: 1 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      for (const mate of c.teammates()) c.giveBlock(mate, N(c).b);
      let searches = 0;
      for (const e of U.enemies(c)) {
        if (!isUnaware(c, e)) continue;
        if (armSearch(c, e)) searches++;
      }
      if (searches > 0) gainLurk(c, searches * N(c).l);
    }),
    upgrade: { nums: { b: 10, l: 1 } },
  },
  {
    id: 'boggle/monster-squad', name: 'Monster Squad', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['scare', 'fright', 'lurk'],
    text: 'Once a round per other Kid: when they damage an enemy with {f} or more [Fright], [Scare] {f} from it. That Kid draws a Trick and gains {b} Guard, and you gain {l} [Lurk].',
    flavor: 'There is more than one thing under this bed and they have a plan.',
    nums: { f: 4, b: 6, l: 1 },
    effect: eff((c) => power(c, 'boggle/monster-squad', 1, (x) => {
      U.mm(x).squad = { f: N(x).f, b: N(x).b, l: N(x).l };
    })),
    upgrade: { nums: { f: 4, b: 9, l: 1 } },
  },
];

// ── marks (per-enemy one-shot promises) ─────────────────────────────────────
/** Attach a one-shot promise to an enemy. */
function mark(c, e, key, n) {
  if (!e) return;
  const s = U.mm(c);
  if (!s.marks) s.marks = {};
  const id = eid(e);
  if (!s.marks[id]) s.marks[id] = {};
  s.marks[id][key] = n;
}
/** Read and clear a mark. Returns the stored number, or 0. */
function takeMark(c, e, key) {
  const s = U.mm(c);
  const id = eid(e);
  const box = s.marks && s.marks[id];
  if (!box || !box[key]) return 0;
  const n = box[key];
  delete box[key];
  return n;
}

// marks that fire off Boggle's own hooks
U.onHook('becameSuspicious', 'boggle/lump-mark', (c, p) => {
  const n = takeMark(c, p.enemy, 'lump');
  if (n > 0) fright(c, p.enemy, n);
});
U.onHook('search', 'boggle/search-marks', (c, p) => {
  const s = U.mm(c);
  const extra = takeMark(c, p.enemy, 'dontTurn');
  if (extra > 0) fright(c, p.enemy, extra);
  const stop = takeMark(c, p.enemy, 'dontCheck');
  if (stop > 0) { fright(c, p.enemy, stop); markSuspicious(c, p.enemy, { to: 'aware' }); }
  if (s.fortGuard > 0) { U.guard(c, s.fortGuard); s.fortGuard = 0; }
});

export default {
  slug: SLUG,
  name: 'Boggle',
  title: 'the Monster Under the Bed',
  region: 'sleeping-quarters',
  identity:
    'Boggle is a predator who is also a coward, and he is dangerous precisely because he will not ' +
    'stand in front of anything and fight fairly. His question is never "how do I avoid damage" but ' +
    '"who currently knows where I am". Hiding turns a directed Attack into a Search — no damage at ' +
    'all — but it cannot be repeated against the same enemy, because everything that hides him makes ' +
    'something Suspicious, and a Suspicious enemy is watching. At low mastery he hides and hits. At ' +
    'high mastery he keeps three enemies in three different states at once, banks Fright he has no ' +
    'immediate use for, and decides which turn is worth surrendering his own concealment for.',
  strengths: [
    'Turns dangerous directed Attacks into nothing at all',
    'Extremely strong prepared burst out of hiding',
    'Fright banks up for several different payoffs rather than being damage',
    'Every enemy can be in a different Awareness state, so crowded rooms reward him',
    'Long fights scale him through Lurk and accumulated Fright',
  ],
  weaknesses: [
    'He cannot hide from the same enemy two turns running',
    'Room-wide Attacks ignore concealment entirely',
    'Every Ambush he takes deliberately reveals him',
    'Fright does nothing on its own — a deck without Scare payoffs fails badly',
    'Lurk accumulates slowly and caps hard',
    'Enemies that buff, summon or hit the whole room blunt the value of Unaware',
    'Badly timed Ambushes leave several enemies Suspicious at once, which is a very dangerous turn',
  ],
  startingHp: 68,
  startingEnergy: 3,
  mechanics: {
    awareness: { name: 'Awareness', kind: 'system', desc: 'Every enemy is Aware, Unaware or Suspicious with respect to Boggle, one state each and tracked separately.', min: 0, max: 3, hooks: ['becameUnaware', 'becameSuspicious'] },
    search: { name: 'Search', kind: 'system', desc: 'What an Unaware enemy does instead of a directed Attack aimed only at Boggle: no damage, the whole Attack replaced, 2 Fright to itself, and it becomes Suspicious.', min: 0, max: 1, hooks: ['search'] },
    ambush: { name: 'Ambush', kind: 'system', desc: 'A bonus that applies when the target is Unaware as the Trick begins. The target stays Unaware until the whole Trick has resolved, then normally becomes Suspicious.', min: 0, max: 1, hooks: ['ambush'] },
    fright: { name: 'Fright', kind: 'status', desc: 'A persistent resource stored on an enemy. It does no damage, never expires, and exists only to be spent by Scare clauses.', min: 0, max: 99, hooks: ['frightApplied'] },
    scare: { name: 'Scare N', kind: 'system', desc: 'Check the target for N Fright. If it is there, spend N and resolve the Scare; if not, the rest of the Trick still happens.', min: 0, max: 10, hooks: ['scare'] },
    lurk: { name: 'Lurk', kind: 'resource', desc: 'Gained at the end of Boggle’s turn while any living enemy is Unaware. Starts at 0, caps at 5, never decays.', min: 0, max: 7, hooks: ['lurkGained'] },
  },
  startingDeck: [
    'boggle/little-chomp', 'boggle/little-chomp', 'boggle/little-chomp', 'boggle/little-chomp',
    'boggle/pillow-shield', 'boggle/pillow-shield', 'boggle/pillow-shield', 'boggle/pillow-shield',
    'boggle/creepy-little-noise', 'boggle/under-the-bed',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Quiet Ambusher', desc: 'Cycle enemies through Aware, Unaware, Ambush and Suspicious. The whole skill is deciding when an Ambush is worth giving up the concealment that made it possible.', coreCards: ['boggle/hide-under-something', 'boggle/from-under-here', 'boggle/underbed-uppercut', 'boggle/big-eyes-in-the-dark', 'boggle/surprise-from-behind', 'boggle/quiet-as-dust', 'boggle/keep-the-lights-off', 'boggle/hide-in-plain-sight'] },
    { name: 'Fright Engine', desc: 'Build Fright from Searches, noises and paranoia, then choose between several Scare thresholds. Fright is a currency, not damage over time — 3 for Guard now, or 8 saved for Too Late to Run.', coreCards: ['boggle/creak', 'boggle/ankle-grab', 'boggle/nervous-giggle', 'boggle/boo', 'boggle/shiver-in-the-walls', 'boggle/practice-your-scream', 'boggle/every-creak-means-me', 'boggle/fear-of-the-dark'] },
    { name: 'Patient Lurker', desc: 'Bank Lurk by ending turns with something still Unaware, then cash it for explosive Tricks. Excellent in long fights, badly exposed in short ones.', coreCards: ['boggle/wait-for-it', 'boggle/closer-closer', 'boggle/underbed-kingdom', 'boggle/the-big-one', 'boggle/wrong-side-of-bed', 'boggle/the-shadow-is-bigger', 'boggle/the-long-wait', 'boggle/everybody-heard-that'] },
    { name: 'Caught Red Pawed', desc: 'Treat Suspicious turns as the productive phase rather than the punishment. Guard, Fright, discounts and damage all specifically while they are watching for him.', coreCards: ['boggle/toe-nibbler', 'boggle/blanket-snap', 'boggle/hold-very-still', 'boggle/sock-drawer-lunge', 'boggle/emergency-pillow', 'boggle/i-was-behind-you', 'boggle/one-eye-open', 'boggle/shiver-in-the-walls'] },
    { name: 'Houseful of Monsters', desc: 'Deliberately move attention around a crowded room — one Unaware, one Suspicious, one loaded with Fright. The most demanding way to play him and the most powerful.', coreCards: ['boggle/shadow-puppet', 'boggle/hide-and-shriek', 'boggle/no-one-here-but-dust', 'boggle/monster-in-the-mirror', 'boggle/ceiling-creep', 'boggle/lights-out', 'boggle/bedframe-geography', 'boggle/everywhere-at-once'] },
  ],
};
