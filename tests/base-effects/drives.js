/**
 * Drives for the status-only Tricks the standard battery cannot bring to their
 * trigger. OWNER: companion-cards.
 *
 * drive.js plays a Power and its blank twin and runs both boards through the
 * same generic battery. A trigger that needs a particular board (a Mature
 * Briar and a Snared enemy, a killing blow inside the same turn, a friend
 * playing a 2-Nerve Trick) is not reached by it, and the card would read as
 * dead when it is not. Each entry here is the board that trigger needs:
 *
 *   [id, 'what the board needs', { setup(e, t), drive(e, t, step), party }]
 *
 *   setup(e, t)        before the card is played (both boards)
 *   drive(e, t, step)  after it, instead of the battery; call step(label) to
 *                      take a reading. Both boards run the same drive.
 *
 * A drive that leaves the two boards identical FAILS the gate: the card's
 * trigger was reached and still changed nothing, which is a dead card.
 */
import * as U from '../../game/src/data/companions/_util.js';
import { DEFS, add } from './proofkit.js';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const me = (e) => e.current || e.player;
/** Add a Trick to the acting seat's hand (or another pile) and play it. */
async function playId(e, id, tgt, opts = {}) {
  const k = add(e, id, 'hand', opts);
  return playCard(e, k, tgt);
}
async function playCard(e, k, tgt) {
  if (!k) return null;
  me(e).energy = 9;
  const t = tgt || e.livingEnemies()[0];
  try { await e.playCard(k.uid, k.target === 'enemy' ? (t && t.id) : undefined); } catch (_) { /* same both sides */ }
  return k;
}
/** A friend's Trick, played from the friend's hand. */
async function friendPlays(e, who, id, tgt) {
  const d = DEFS.get(id);
  const m = e.addCard(d, 'hand', { to: who });
  const k = Array.isArray(m) ? m[0] : m;
  who.energy = 9;
  const t = tgt || e.livingEnemies()[0];
  try { await e.playCard(k.uid, k.target === 'enemy' ? (t && t.id) : undefined); } catch (_) { /* */ }
  return k;
}
const emptyHand = (e) => { for (const k of e.piles.hand.slice()) e.discardCard(k, 'drive'); };
const lethal = (e, who) => {
  const w = who || me(e);
  const from = e.livingEnemies()[0];
  /* Big enough to kill through the seeded Weak on the attacker and any Guard. */
  e.dealDamage({ attacker: from, defender: w, amount: (w.hp + w.block) * 3 + 50, kind: 'attack' });
};
const PUFF = (n = 6) => ({ id: 'puff', name: 'Puff', intent: 'attack', damage: n, effect: (c) => c.damage(n) });
/** Every enemy swings a plain directed Attack at `who` this enemy turn. */
const aimAll = (e, who, n = 6) => {
  for (const x of e.livingEnemies()) { if (who) x.targetSeatId = who.id; e.overrideIntent(x, PUFF(n)); }
  e.refreshIntents('test');
};
const endTurn = async (e) => { for (const pl of e.players || [e.player]) pl.energy = 9; try { await e.endTurn(); } catch (_) { /* */ } };
const plants = (e) => e.objects.filter(o => o.kind === 'plant');
async function ripe(e, id) {
  const before = new Set(plants(e).map(o => o.id));
  await playId(e, id);
  const o = plants(e).find(p => !before.has(p.id));
  if (o) e.updateObject(o.id, { growth: 2, mature: true });
  return o;
}
const friend = (e) => (e.players || []).find(p => p !== e.players[0]);

/* [id, what the board needs, { setup, drive, party }] */
export const DRIVES = [
  // ── Marmalade ─────────────────────────────────────────────────────────────
  ['marmalade/poltercat', 'an enemy buffs itself', {
    drive: async (e, t, step) => { e.applyStatus(t, 'strength', 1); await step('enemy buff'); } }],
  ['marmalade/not-dead-yet', 'a killing blow the same turn, with Lives to spend', {
    drive: async (e, t, step) => { lethal(e); await step('killing blow'); } }],

  // ── Bones ─────────────────────────────────────────────────────────────────
  ['bones/favorite-toy', 'the Favorite Slobbered in the discard, then a Fetch', {
    setup: (e) => { emptyHand(e); add(e, 'bones/sit-stay'); },
    drive: async (e, t, step) => {
      const fav = e.piles.hand.find(k => k.id === 'bones/sit-stay') || [...e.piles.discard].reverse().find(k => k.id === 'bones/sit-stay');
      if (fav) e.moveCard(fav, 'discard');
      for (const k of e.piles.discard) U.setFlag(k, 'slobbered', true);   // nothing else is Fetchable
      await playId(e, 'bones/fetch');
      await step('fetch');
    } }],
  ['bones/built-wrong', '6 Loose Bones, Rattletrap out, then a Shed', {
    drive: async (e, t, step) => {
      await playId(e, 'bones/rattletrap');
      e.setCounter('loose-bones', 6, 'drive');
      await playId(e, 'bones/rib-rattle', t);
      await step('shed at 6');
    } }],

  // ── Taffy ─────────────────────────────────────────────────────────────────
  ['taffy/elastic-memory', 'two Stretched Tricks in hand, one played', {
    drive: async (e, t, step) => {
      emptyHand(e);
      const a = add(e, 'taffy/sugar-bonk'), b = add(e, 'taffy/squish');
      U.setCounter(a, 'stretch', 1); U.setCounter(b, 'stretch', 1);
      await playCard(e, a, t);
      await step('played a Stretched Trick');
    } }],

  // ── Wink ──────────────────────────────────────────────────────────────────
  ['wink/the-house-has-tells', 'an enemy re-derives its next Intent because conditions changed', {
    drive: async (e, t, step) => {
      const def = t.def, moves = Object.keys(def.moves || {});
      const other = moves.find(m => m !== (t.pendingMove && t.pendingMove.id));
      t.def = { ...def, nextMove: (c, pos) => (e.field.__changed && (pos | 0) === 0 ? other : def.nextMove(c, pos)) };
      e.field.__changed = true;
      e.refreshIntents('status');
      await step('intent changed');
    } }],
  ['wink/probability-collapse', 'a Read on every enemy at the turn end', {
    drive: async (e, t, step) => {
      for (const x of e.livingEnemies()) await playId(e, 'wink/call-it', x);
      await step('reads');
      await endTurn(e); await step('turn end');
    } }],

  // ── Boggle ────────────────────────────────────────────────────────────────
  ['boggle/nobodys-here', 'an Aware enemy with 6 Fright aiming a directed Attack at Boggle', {
    drive: async (e, t, step) => {
      for (const x of e.livingEnemies()) e.applyStatus(x, 'fright', 6);
      aimAll(e, null);
      await endTurn(e); await step('enemy turn');
    } }],
  ['boggle/good-night-sleep-tight', 'every enemy at 8 Fright at the turn end', {
    drive: async (e, t, step) => {
      for (const x of e.livingEnemies()) e.applyStatus(x, 'fright', 8);
      await endTurn(e); await step('turn end');
    } }],

  // ── Mopsy ─────────────────────────────────────────────────────────────────
  ['mopsy/cushion-fort', 'two hits in one enemy turn, with Stuffing', {
    drive: async (e, t, step) => {
      e.setCounter('stuffing', 4, 'drive');
      e.applyStatus(me(e), 'cushion', 1);
      me(e).block = 0;
      aimAll(e, null, 9);
      await endTurn(e); await step('enemy turn');
    } }],
  ['mopsy/family-quilt', 'a friend plays a Trick Mopsy Patched', {
    party: true,
    drive: async (e, t, step) => {
      const f = friend(e);
      const hand = e.pilesOf(f).hand;
      const k = hand[0];
      if (k) U.setFlag(k, 'patches', [{ id: 'secret', stitches: 2 }]);
      if (k) { f.energy = 9; try { await e.playCard(k.uid, k.target === 'enemy' ? t.id : undefined); } catch (_) { /* */ } }
      await step('friend played a Patched Trick');
    } }],

  // ── Wisp ──────────────────────────────────────────────────────────────────
  ['wisp/three-little-lights', 'exactly three Tricks in the Gloaming at the turn end', {
    drive: async (e, t, step) => {
      for (const id of ['wisp/boo-eventually', 'wisp/wait-wait', 'wisp/two-rooms-over']) await playId(e, id, t);
      await step('three Lingering');
      await endTurn(e); await step('turn end');
    } }],
  ['wisp/bigger-than-a-nightlight', 'Glow pushed past 6', {
    drive: async (e, t, step) => { e.setCounter('glow', 9, 'drive'); await step('glow 9'); await playId(e, 'wisp/boo-eventually', t); await step('afterglow'); } }],
  ['wisp/too-bright-for-bedtime', 'Blazing at the start of a turn', {
    drive: async (e, t, step) => { e.setCounter('glow', 6, 'drive'); await endTurn(e); e.setCounter('glow', 6, 'drive'); await step('turn start'); await endTurn(e); await step('next'); } }],

  // ── Crumbula ──────────────────────────────────────────────────────────────
  ['crumbula/house-rules', 'a marked enemy dies with another alive', {
    drive: async (e, t, step) => {
      e.applyStatus(t, 'bite-mark', 3);
      t.hp = 1; e.dealDamage({ attacker: me(e), defender: t, amount: 50, kind: 'attack' });
      await step('marked enemy died');
    } }],

  // ── Hush ──────────────────────────────────────────────────────────────────
  ['hush/nobody-saw-that', 'already Unseen', {
    setup: (e) => { e.applyStatus(me(e), 'unseen', 1); },
    drive: async (e, t, step) => { await step('played Unseen'); } }],
  ['hush/inside-job', 'a Contraband played with a Trick in the discard', {
    drive: async (e, t, step) => {
      add(e, 'hush/quick-nip', 'discard');
      const k = add(e, 'hush/borrowed-cover', 'stash', { meta: { contraband: true } });
      await playCard(e, k, t);
      await step('contraband');
    } }],
  ['hush/sticky-little-legend', 'a Contraband played', {
    drive: async (e, t, step) => {
      const k = add(e, 'hush/borrowed-cover', 'stash', { meta: { contraband: true } });
      await playCard(e, k, t);
      await step('contraband');
    } }],
  ['hush/now-you-see-me', 'an Ambush Attack from the Pocket while Unseen', {
    drive: async (e, t, step) => {
      e.applyStatus(me(e), 'unseen', 1);
      const k = add(e, 'hush/quick-nip', 'stash');
      await playCard(e, k, t);
      await step('ambush');
    } }],

  // ── Truffle ───────────────────────────────────────────────────────────────
  ['truffle/raggedy-breathing', 'not Ragged, then hit', {
    drive: async (e, t, step) => {
      aimAll(e, null, 8);
      await endTurn(e); await step('enemy turn');
    } }],
  ['truffle/refuse-to-stay-down', 'a killing blow the same turn', {
    drive: async (e, t, step) => { lethal(e); await step('killing blow'); } }],
  ['truffle/shared-pincushion', 'a friend loses Courage in the enemy turn', {
    party: true,
    drive: async (e, t, step) => {
      const f = friend(e); f.block = 0;
      aimAll(e, f, 8);
      await endTurn(e); await step('enemy turn');
    } }],

  // ── Drizzle ───────────────────────────────────────────────────────────────
  ['drizzle/quiet-after', 'a Stormbreak, then a Trick that costs Nerve', {
    drive: async (e, t, step) => {
      e.setCounter('weather', 3, 'drive');
      await playId(e, 'drizzle/storm-door-slam', t);
      me(e).energy = 5;
      const k = add(e, 'drizzle/storm-door-slam');
      try { await e.playCard(k.uid, t.id); } catch (_) { /* */ }
      await step('after the break');
    } }],
  ['drizzle/electric-house', 'a Conduct reaching two other Soaked enemies', {
    drive: async (e, t, step) => {
      while (e.livingEnemies().length < 3) { const s = e.summon(t.def); if (s) { s.maxHp = 9999; s.hp = 9999; } else break; }
      for (const x of e.livingEnemies()) e.applyStatus(x, 'soaked', 3);
      await step('three Soaked');
      await playId(e, 'drizzle/static-pop', t);
      await step('conduct');
    } }],

  // ── Brambleboo ────────────────────────────────────────────────────────────
  ['brambleboo/thorny-disposition', 'a Mature Briar, and an enemy Snared', {
    drive: async (e, t, step) => {
      await ripe(e, 'brambleboo/little-bramble');
      for (const x of e.livingEnemies()) e.applyStatus(x, 'vines', 6);
      aimAll(e, null);
      await endTurn(e); await step('enemy turn');
    } }],
  ['brambleboo/closed-terrarium', 'ending a turn Overgrown, and choosing to Uproot', {
    drive: async (e, t, step) => {
      e.setChoiceResolver(() => [0]);
      for (let i = 0; i < 4; i++) await ripe(e, 'brambleboo/tiny-creeper');
      await step('overgrown');
      await endTurn(e); await step('turn end');
    } }],
  ['brambleboo/green-in-every-room', 'three Mature Plants', {
    drive: async (e, t, step) => {
      for (let i = 0; i < 3; i++) await ripe(e, 'brambleboo/tiny-creeper');
      await step('three mature');
      await endTurn(e); await step('turn end');
    } }],
  ['brambleboo/no-more-empty-rooms', 'Overgrown, then a Harvest', {
    drive: async (e, t, step) => {
      for (let i = 0; i < 4; i++) await ripe(e, 'brambleboo/tiny-creeper');
      await step('overgrown');
      await playId(e, 'brambleboo/careful-snip', t);
      await step('harvest');
      await endTurn(e); await step('turn end');
    } }],

  // ── Crinkle ───────────────────────────────────────────────────────────────
  ['crinkle/shared-library', 'a friend plays a 2-Nerve Trick', {
    party: true,
    drive: async (e, t, step) => {
      const f = friend(e);
      const two = [...DEFS.values()].find(d => d.companion === 'crinkle' && d.cost === 2 && d.type === 'skill');
      if (two) await friendPlays(e, f, two.id, t);
      await step('friend played a 2');
    } }],
];
