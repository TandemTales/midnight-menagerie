/**
 * A STATUS-ONLY Trick, driven to its trigger. OWNER: companion-cards.
 *
 * The base gate (index.html) calls a Trick alive when its board differs from
 * its blank twin's. A Power that only puts its own icon on the Kid differs in
 * exactly that icon, so it passed - and if its hook never fires, the icon is
 * all it ever does. Taffy's Family Size was such a card: its marker went on,
 * no hook read it, and every Gummy still Vanished on its first play.
 *
 * This module plays the card and its twin as twin.js does, then DRIVES both
 * boards through the same actions - the Companion's own Tricks (so their
 * Split, Scare, Harvest, Absorb ... hooks fire), Attacks and Skills, a blank
 * Power, enemy hits, a discard, an exhaust, a draw, turn ends - and reads both
 * after every step with the card's OWN statuses taken out (the ones the play
 * put on the Kid that the twin's play did not). Identical readings at every
 * step mean the buff changed nothing a player can see, however its trigger
 * was reached.
 *
 * A card whose trigger this battery does not reach gets its own drive in
 * drives.js (what to do to the board to make the trigger happen).
 */
import * as CARDS from '../../game/src/data/cards.js';
import { blankTwin, richSnap, seededParty, FRIENDLY } from './twin.js';
import { seededBoard } from '../upgrade-effects/harness.js';
import { _resetUid } from '../../game/src/combat/piles.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The board reading with the given Kid statuses removed (every seat). */
export function withoutOwn(snap, own) {
  if (!own.length) return snap;
  const res = own.map(id => new RegExp('(^| )' + esc(id) + ':-?[0-9.]+(?= |$)', 'g'));
  return snap.split(' # ').map((part, i) => {
    if (i < 1 || part.indexOf(' ; ') < 0) return part;
    const f = part.split(' ; ');
    for (const re of res) f[4] = f[4].replace(re, '');
    f[4] = f[4].trim();
    return f.join(' ; ');
  }).join(' # ');
}

/** Every card's public meta by uid, right after the play: a Power that only
 *  marks a card ("your Favorite") shows that mark the way it shows its icon. */
function metaByUid(e) {
  const out = new Map();
  for (const pl of e.players || [e.player]) {
    for (const n of ['hand', 'draw', 'discard', 'exhaust', 'stash', 'limbo']) {
      for (const k of (pl.piles && pl.piles[n]) || []) {
        const m = {};
        for (const [key, v] of Object.entries(k.meta || {})) if (!key.startsWith('_')) m[key] = JSON.stringify(v);
        out.set(k.uid, m);
      }
    }
  }
  return out;
}
const JSON_VALUE = String.raw`(?:"[^"]*"|-?[0-9.]+|true|false|null|\[[^\]]*\]|\{[^{}]*\})`;
/** The reading with the card's own meta marks removed from every card. */
export function withoutMeta(snap, keys) {
  let s = snap;
  for (const k of keys) s = s.replace(new RegExp('"' + esc(k) + '":' + JSON_VALUE + ',?', 'g'), '');
  return s.replace(/,\}/g, '}').replace(/\{\}/g, '');
}

/** The tally the base gate keeps, with status stacks counted per id. */
function startLog(e) {
  const t = { dmg: 0, hits: 0, block: 0, heal: 0, st: new Map() };
  const amt = (ev) => ((ev && ev.amount) || 0);
  e.on('damage', (ev) => { t.dmg += amt(ev); t.hits += 1; });
  e.on('block', (ev) => { t.block += amt(ev); });
  e.on('heal', (ev) => { t.heal += amt(ev); });
  e.on('status', (ev) => {
    if (!ev) return;
    const k = (ev.statusId || ev.id || '?') + '@' + (ev.actorId || ev.targetId || '?');
    t.st.set(k, (t.st.get(k) || 0) + Math.abs(ev.delta || 0));
  });
  return t;
}
function logText(t, own) {
  const ownSet = new Set(own);
  const st = [...t.st].filter(([k]) => !ownSet.has(k.split('@')[0])).map(([k, v]) => k + '=' + v).sort().join(',');
  return ['dmg' + t.dmg, 'hits' + t.hits, 'guard' + t.block, 'heal' + t.heal, st].join(' ');
}

/** The Companion's own Tricks the battery plays: every non-Power card it owns. */
export function stimulusFor(slug, exceptId) {
  const comp = CARDS.companion(slug);
  const pool = comp ? [...(comp.cards || []), ...(comp.coopCards || [])] : CARDS.sharedPool();
  return pool.filter(d => d.id !== exceptId && d.type !== 'power' && !d.unplayable && d.cost !== -2
    && !['status', 'curse'].includes(d.type));
}
const A_POWER = (slug) => {
  const comp = CARDS.companion(slug);
  const p = comp && (comp.cards || []).find(d => d.type === 'power');
  return p ? blankTwin(p) : null;
};

/** Play a def from hand at the target, Nerve refilled. Errors are the card's business. */
async function playDef(e, def, t) {
  const made = e.addCard(def, 'hand');
  const k = Array.isArray(made) ? made[0] : made;
  if (!k) return;
  (e.current || e.player).energy = 9;
  const chk = e.canPlay(k.uid, t && t.id);
  if (chk && chk.ok === false) { try { e.discardCard(k, 'drive'); } catch (_) { /* gone */ } return; }
  try { await e.playCard(k.uid, def.target === 'enemy' ? (t && t.alive ? t.id : (e.livingEnemies()[0] || {}).id) : undefined); }
  catch (_) { /* the same on both boards */ }
}

/**
 * The standard battery: three rounds of (the hand's Tricks, a slice of the
 * Companion's own Tricks, a blank Power, a friend's Tricks when there is one,
 * an enemy hit on every Kid, a discard, an exhaust, a draw, the turn end).
 * Courage is set to full, then under half, then 10 with a killing blow at the
 * end, so "while below half" and "when you would die" are reached too.
 * `step()` reads the board after each.
 */
export async function battery(e, t, def, step, hold = false) {
  const stim = stimulusFor(def.companion, def.id);
  const blankPower = A_POWER(def.companion);
  const rounds = 3;
  const per = Math.ceil(stim.length / rounds);
  /* Play what is in hand (up to 12, so a copy or a spawned Trick the
     Companion's Tricks just made is played too - Family Size only shows when
     a Gummy is PLAYED). */
  const playHand = async (label) => {
    if (hold) return;
    const me = e.current || e.player;
    for (let i = 0; i < 12 && !e.over; i++) {
      const k = e.piles.hand.find(x => { me.energy = 9; const chk = e.canPlay(x.uid, t && t.id); return !(chk && chk.ok === false); });
      if (!k) break;
      me.energy = 9;
      try { await e.playCard(k.uid, k.target === 'enemy' ? (t && t.alive ? t.id : (e.livingEnemies()[0] || {}).id) : undefined); } catch (_) { /* same both sides */ }
      if (e.piles.hand.includes(k)) break;   // it came back: stop rather than loop
    }
    await step(label);
  };
  const seats = e.players || [e.player];
  const seat0 = seats[0];
  for (let r = 0; r < rounds && !e.over; r++) {
    const me = e.current || e.player;
    me.energy = 9;
    for (const pl of seats) if (pl.alive) pl.hp = r === 0 ? pl.maxHp : r === 1 ? Math.ceil(pl.maxHp * 0.45) : Math.min(pl.hp, 10);
    await step('courage ' + r);
    await playHand('hand ' + r);
    if (e.over) return;
    const chunk = stim.slice(r * per, (r + 1) * per);
    for (let i = 0; i < chunk.length; i++) {
      await playDef(e, chunk[i], t);
      if (e.over) return;
      await step(chunk[i].id);
      if (i % 6 === 5) { await playHand('hand ' + r + '.' + i); if (e.over) return; }
    }
    await playHand('hand ' + r + ' end');
    if (e.over) return;
    if (blankPower) { await playDef(e, blankPower, t); await step('a Power'); }
    /* A friend's turn: two of their own Tricks, then one Attack and one Skill
       from the Companion's pool, played from THEIR hand. */
    for (const pl of seats) {
      if (pl === seat0 || !pl.alive || e.over) continue;
      const theirs = (e.pilesOf ? e.pilesOf(pl) : pl.piles).hand.slice(0, 2);
      const extra = [stim.find(d => d.type === 'attack'), stim.find(d => d.type === 'skill')].filter(Boolean)
        .map(d => { const m = e.addCard(d, 'hand', { to: pl }); return Array.isArray(m) ? m[0] : m; }).filter(Boolean);
      for (const k of [...theirs, ...extra]) {
        pl.energy = 9;
        const aim = t && t.alive ? t : e.livingEnemies()[0];
        try { await e.playCard(k.uid, k.target === 'enemy' ? (aim && aim.id) : undefined); } catch (_) { /* same both sides */ }
        if (e.over) return;
      }
      await step('friend ' + r);
    }
    const hitter = e.livingEnemies()[0];
    for (const pl of seats) {
      if (!hitter || !pl.alive || e.over) continue;
      e.dealDamage({ attacker: hitter, defender: pl, amount: 6, kind: 'attack' });
      await step('enemy hit ' + pl.id);
    }
    if (e.over) return;
    if (r === rounds - 1 && hitter) {
      e.dealDamage({ attacker: hitter, defender: seat0, amount: seat0.hp + seat0.block + 5, kind: 'attack' });
      await step('killing blow');
      if (e.over) return;
    }
    const [d1, d2] = e.piles.hand;
    if (d1) { try { e.discardCard(d1, 'drive'); } catch (_) { /* */ } await step('discard'); }
    if (d2) { try { e.exhaustCard(d2, 'drive'); } catch (_) { /* */ } await step('exhaust'); }
    try { e.drawCards(1, 'drive'); } catch (_) { /* */ }
    await step('draw');
    me.energy = 9;
    try { await e.endTurn(); } catch (_) { /* */ }
    await step('turn end ' + r);
  }
}

/**
 * Card vs twin under a drive. `o.drive(e, t, step)` replaces the battery;
 * `o.setup(e, t)` runs before the card; `o.party` seats a friend.
 * Returns { same, played, own, at } - `at` names the first step that differed.
 */
export async function driveCompare(def, o = {}) {
  /* The battery twice: once playing out the hand, once HOLDING it, so a
     Power about held Tricks (Stretch climbing, Retain) sees a hand at the
     turn end. A custom drive runs once. */
  if (!o.drive && o.hold === undefined) {
    let r = await driveCompare(def, { ...o, hold: false });
    if (r.same) r = await driveCompare(def, { ...o, hold: true });
    /* A Trick that pays a friend gets the same battery with one at the table. */
    if (r.same && !o.party && FRIENDLY.test(def.text || '')) {
      const p = await driveCompare(def, { ...o, party: true });
      if (!p.same) r = { ...p, party: true };
    }
    return r;
  }
  const run = async (blank) => {
    /* Card uids come from one module-wide counter, so the twin's board would
       number every card differently and a timer naming its card by uid would
       read as a difference. Both boards start the count at the same place. */
    _resetUid(0);
    const { e, t: t0 } = o.party ? await seededParty(def.companion) : await seededBoard(def.companion);
    if (o.setup) await o.setup(e, t0);
    const t = t0;
    for (const x of e.enemies) { x.maxHp = 99999; x.hp = 99999; }
    const made = e.addCard(blank ? blankTwin(def) : def, 'hand');
    const card = Array.isArray(made) ? made[0] : made;
    let played = false;
    e.on('card:play', (ev) => { if (ev && ev.cardUid === card.uid) played = true; });
    (e.current || e.player).energy = 9;
    const rng = e.rng.snapshot();
    try { await e.playCard(card.uid, def.target === 'enemy' ? (t && t.id) : undefined); } catch (_) { /* */ }
    e.rng.restore(rng);
    const statusesNow = new Map([...(e.player.statuses || [])]);
    const metaNow = metaByUid(e);
    const log = startLog(e);
    const steps = [];
    /* A choice is awaited even when the auto-picker answers at once, so a hook
       that asks (Closed Terrarium, Cemetery Gates) finishes a few microtasks
       after the event that set it off. Let those land before reading. */
    const step = async (label) => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
      steps.push([label, richSnap(e, card), log]);
    };
    await step('played');
    await (o.drive ? o.drive(e, t, step) : battery(e, t, def, step, !!o.hold));
    // Readings are taken as strings after `own` is known, so they are frozen now.
    return { played, statusesNow, metaNow, steps: steps.map(([l, s]) => [l, s]), log, e };
  };
  // The log is live: snapshot its text at each step instead.
  const runText = async (blank) => {
    const r = await run(blank);
    return r;
  };
  const a = await runText(false);
  const b = await runText(true);
  const own = [...a.statusesNow.keys()].filter(k => b.statusesNow.get(k) !== a.statusesNow.get(k));
  const ownMeta = new Set();
  for (const [uid, m] of a.metaNow) {
    const mb = b.metaNow.get(uid) || {};
    for (const k of new Set([...Object.keys(m), ...Object.keys(mb)])) if (m[k] !== mb[k]) ownMeta.add(k);
  }
  const norm = (s) => withoutMeta(withoutOwn(s, own), ownMeta);
  let at = null;
  const n = Math.max(a.steps.length, b.steps.length);
  for (let i = 0; i < n && at === null; i++) {
    const sa = a.steps[i] ? norm(a.steps[i][1]) : '-';
    const sb = b.steps[i] ? norm(b.steps[i][1]) : '-';
    if (sa !== sb) {
      at = (a.steps[i] || b.steps[i])[0];
      if (o.debug) {
        const pa = sa.split(/ # | ; /), pb = sb.split(/ # | ; /);
        o.debug.push(...pa.map((x, j) => x !== pb[j] ? 'CARD ' + x + ' /// TWIN ' + pb[j] : null).filter(Boolean));
      }
    }
  }
  if (at === null && logText(a.log, own) !== logText(b.log, own)) at = 'the fight\'s tally';
  return { same: at === null, played: a.played, own: [...own, ...[...ownMeta].map(k => 'meta:' + k)], at, debug: o.debug, steps: a.steps.length, over: !!a.e.over, hand: a.e.piles.hand.length };
}
