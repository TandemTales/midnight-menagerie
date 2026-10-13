/**
 * A Trick against its blank twin, on the seeded board. OWNER: companion-cards.
 *
 * Shared by the gate (index.html) and the waiver proofs (proofs.html), so a
 * waiver is proved with exactly the comparison the gate makes - only the board
 * differs. See index.html's header for why the control is a twin.
 */
import { RNG } from '../../game/src/core/rng.js';
import { makeDummyParty } from '../../game/src/combat/dummy.js';
import * as U from '../../game/src/data/companions/_util.js';
import * as CARDS from '../../game/src/data/cards.js';
import { SEED, SEED_COUNTERS, SEED_ENEMY_STATUS, seededBoard, startTally, tallyText, playTurns } from '../upgrade-effects/harness.js';

/** The control: everything the engine and the trackers can see of the card,
 *  except its effect. A different id, so a tracker that pays out for THIS card
 *  by name (a Power counting its copies) is counted as the card's doing. */
export function blankTwin(def) {
  return { ...def, id: def.id + '~blank', name: 'Blank ' + def.name, text: '', effect: () => {}, upgrade: undefined };
}

/**
 * The same board with a second Kid at the table (same Companion, same deck),
 * for a Trick that pays a friend. Seat 0 plays; the friend's whole state is
 * read. Seeded exactly as `seededBoard` seeds the solo board.
 */
export async function seededParty(slug) {
  const deck = CARDS.companion(slug) ? CARDS.startingDeckFor(slug) : CARDS.sharedPool().slice(0, 8);
  const e = makeDummyParty(new RNG(SEED), 2, { companion: slug, decks: [deck, deck], strictCtx: false });
  e.setTrackerInstaller(U.installTrackers);
  await e.startCombat();
  for (const x of e.enemies) { x.maxHp = 9999; x.hp = 9999; }
  for (const pl of e.players) {
    for (const c of e.counters.values()) {
      const want = Math.min(c.max === undefined ? 3 : c.max, 3);
      if (want > (c.min || 0)) { try { e.setCounter(c.id, want, 'test', pl.id); } catch (_) { /* shared */ } }
    }
    for (const [id, v] of SEED_COUNTERS) if (e.counters.has(id)) { try { e.setCounter(id, v, 'test', pl.id); } catch (_) { /* shared */ } }
  }
  const t = e.livingEnemies()[0];
  if (t) for (const [id, v] of SEED_ENEMY_STATUS) e.applyStatus(t, id, v);
  const warm = e.piles.hand[0];
  if (warm) {
    e.player.energy = 9;
    const chk = e.canPlay(warm.uid, t && t.id);
    if (!chk || chk.ok !== false) {
      try { await e.playCard(warm.uid, warm.target === 'enemy' ? (t && t.id) : undefined); } catch (_) { /* affordability */ }
    }
  }
  const spare = e.piles.hand[0];
  if (spare) { try { e.moveCard(spare, 'discard', { reason: 'test' }); } catch (_) { /* pile guard */ } }
  return { e, t };
}

const replacer = (k, v) => {
  if (typeof v === 'function') return undefined;
  if (v && typeof v === 'object' && v.def && v.uid) return 'card:' + v.id;       // a Card
  if (v && typeof v === 'object' && v.side && v.statuses) return 'actor:' + v.id; // an actor
  return v;
};
export const js = (v) => { try { return JSON.stringify(v, replacer); } catch (_) { return '?'; } };

/** Companion state that is ON SCREEN but lives in the seat's scratch rather
 *  than a counter. Hand-picked on purpose: the scratch also holds flags, and a
 *  flag nothing reads is exactly the defect this gate is for, so dumping the
 *  whole scratch would call every one of those cards alive. */
export function visibleScratch(p) {
  const s = p.__mm || {};
  const len = (a) => (Array.isArray(a) ? a.length : 0);
  return ['patch=' + (s.patch || []).join(','), 'patchCap=' + s.patchCap, 'sets=' + len(s.sets),
    'setCap=' + s.setCap, 'bellyCap=' + s.bellyCap, 'buried=' + len(s.buried), 'reads=' + len(s.reads),
    'previewed=' + js(s.previewed), 'maxPlump=' + s.maxPlump,
    'gloaming=' + (s.gloaming || []).map(g => (g.def && g.def.id) + ':' + g.count).join(','),
    'harm=' + (s.buriedHarm || 0), 'pocket+' + (s.pocketBonus || 0), 'slots+' + (s.extraSlots || 0)].join(' ');
}

const st = (a) => [...a.statuses].map(([k, v]) => k + ':' + v).sort().join(' ');

/** One seat, everything a player can see of it. The card under test and its
 *  twin are taken out of the piles and reported by WHERE they are. */
function seatSnap(e, pl, self) {
  const cost = (k) => { try { return e._asSeat ? e._asSeat(pl, () => e.costOf(k)) : e.costOf(k); } catch (_) { return '?'; } };
  const meta = (k) => {
    const m = {};
    for (const [key, v] of Object.entries(k.meta || {})) if (!key.startsWith('_')) m[key] = v;
    return Object.keys(m).length ? js(m) : '';
  };
  const piles = ['hand', 'draw', 'discard', 'exhaust', 'stash', 'limbo'].map(n => {
    const list = ((pl.piles && pl.piles[n]) || []).filter(k => k !== self);
    return n + '=[' + list.map(k => k.id + (k.upgraded ? '+' : '') + '@' + cost(k) + meta(k)
      + (k.retain || k.retainThisTurn ? 'R' : '') + (k.exhaust ? 'X' : '') + (k.ethereal ? 'E' : '')).sort().join(',') + ']';
  }).join(' ');
  const counters = [...e.counters.values()].map(c => { let v; try { v = e.counter(c.id, pl.id); } catch (_) { v = '?'; } return c.id + ':' + v; }).sort().join(' ');
  return ['hp' + pl.hp + '/' + pl.maxHp, 'guard' + pl.block, 'nerve' + pl.energy + '/' + pl.energyMax,
    'draw' + pl.drawPerTurn + ' cap' + pl.handCap, st(pl), counters, piles, visibleScratch(pl)].join(' ; ');
}

/** The upgrade gate's snapshot, widened: see index.html's header. */
export function richSnap(e, self) {
  const intent = (x) => {
    const i = x.intent;
    if (!i) return '-';
    return [i.moveId, i.totalDamage, i.hits, i.block, (i.statuses || []).map(s => js(s)).join(','), i.revealed ? 1 : 0].join(':');
  };
  const bodies = [...e.enemies, ...(e.allies || [])]
    .map(x => [x.id, x.hp, x.block, x.alive ? 1 : 0, st(x), intent(x), x.previewDepth || 0, (x.queue || []).length].join('/')).join(' | ');
  const owner = (self && e.seatOfCard && e.seatOfCard(self)) || e.player;
  const where = self ? ((owner.piles.pileOf ? owner.piles.pileOf(self) : self.pile) + (self.meta && self.meta.zone ? ':' + self.meta.zone : '')) : '-';
  const seats = (e.players || [e.player]).map(pl => seatSnap(e, pl, self));
  return [bodies, ...seats, 'self@' + where, 'timers' + js(e.timers || []), 'objects' + js(e.objects || []),
    'drawNext' + (e.drawDeltaNextTurn || 0)].join(' # ');
}

/** The Kid's statuses (field 1 of seat 0: index 4 inside the seat) blanked, for
 *  the status-blind reading. */
function blindOf(snap) {
  return snap.split(' # ').map((part, i) => {
    if (i < 1 || part.indexOf(' ; ') < 0) return part;
    const f = part.split(' ; '); f[4] = ''; return f.join(' ; ');
  }).join(' # ');
}

/** Pick the LAST offered options instead of the first. */
export const lastResolver = (req) => {
  const n = Math.min(req.count, req.pool.length);
  const out = [];
  for (let i = req.pool.length - 1; i >= 0 && out.length < n; i--) out.push(i);
  return out;
};

/**
 * Play `def` (or its blank twin) on the seeded board.
 *   o.party     a second Kid at the table
 *   o.resolver  a choice resolver (default: the engine's lowest-index auto pick)
 *   o.setup     async (e, t) => {} run on the board before the card is added -
 *               how a proof reaches the condition a waiver names
 *   o.target    (e, t) => the enemy to aim at (default t)
 */
export async function playOnce(def, blank, o = {}) {
  const { e, t: t0 } = o.party ? await seededParty(def.companion) : await seededBoard(def.companion);
  if (o.resolver) e.setChoiceResolver(o.resolver);
  if (o.setup) await o.setup(e, t0);
  const t = o.target ? o.target(e, t0) : t0;
  const made = e.addCard(blank ? blankTwin(def) : def, 'hand');
  const card = Array.isArray(made) ? made[0] : made;
  if (!card) return null;
  const tally = startTally(e);

  e.player.energy = 9;
  const rng = e.rng.snapshot();
  let threw = '';
  try {
    await e.playCard(card.uid, def.target === 'enemy' ? (t && t.id) : undefined);
  } catch (err) { threw = String((err && err.message) || err); }
  e.rng.restore(rng);
  const played = !((e.piles.hand || []).includes(card));
  const onPlay = richSnap(e, card);
  if (o.after) await o.after(e, t);
  const after = await playTurns(e, t);
  if (!threw) threw = after;
  const end = richSnap(e, card);
  /* The same readings with the Kid's statuses and the emitted status stacks
     taken out. A Power that only shows its own buff icon, and whose buff then
     changed nothing in two turns, reads identical here. */
  const blind = blindOf(onPlay) + ' || ' + [tally.dmg, tally.hits, tally.block, tally.heal].join(' ') + ' || ' + blindOf(end);
  return { played, snap: onPlay + ' || ' + tallyText(tally) + ' || ' + end, blind, threw };
}

/** Card and twin from the same board; `same` is the finding. */
export async function compare(def, o = {}) {
  const a = await playOnce(def, false, o);
  const b = await playOnce(def, true, o);
  if (!a || !b) return null;
  /* A card this board refuses to play is identical by definition - its twin
     may well be playable (a rule keyed by the card's id), and comparing a
     refused play with a real one would call the card alive. A twin refused
     where the card was not is an unfair comparison, and says so. */
  const same = !a.played ? true : (a.snap === b.snap);
  const unfair = a.played && !b.played;
  return { a, b, same, unfair, played: a.played, threw: a.threw || b.threw, buffOnly: !same && a.blind === b.blind };
}
