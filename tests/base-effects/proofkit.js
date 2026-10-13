/**
 * The runner behind proofs-g1..g4.html. OWNER: companion-cards.
 *
 * A waiver in waivers-gN.js claims a Trick IS live and only the gate's one
 * seeded board cannot show it. A proof makes that claim checkable: it names a
 * `setup` that brings the same seeded board to the condition the Trick needs
 * (three Pumpkins in the Patch, a Bite Mark on the target, a friend at the
 * table), and then the card and its blank twin are compared EXACTLY as the gate
 * compares them (twin.js). The proof passes only if the card is played and the
 * two boards differ.
 *
 *   PROOFS = [[id, 'what the board needs', { setup, target, party, resolver, after }], ...]
 *
 *   setup(e, t)   async; runs on the seeded board before the card is added
 *   target(e, t)  the enemy to aim at (default: the gate's target)
 *   party         a second Kid at the table
 *   resolver      a choice resolver (twin.js exports lastResolver)
 *   after(e, t)   async; runs right after the play, before the two turns
 */
import * as U from '../../game/src/data/companions/_util.js';
import * as CARDS from '../../game/src/data/cards.js';
import { compare } from './twin.js';

/* Statuses and Curses too: a proof may need one in a pile. */
export const DEFS = new Map([...CARDS.allCards(), ...CARDS.statusCards(), ...CARDS.curseCards()].map(d => [d.id, d]));

/** Put a card in a pile and return the runtime card. */
export function add(e, id, pile = 'hand', opts = {}) {
  const d = DEFS.get(id);
  if (!d) throw new Error('no such Trick ' + id);
  const m = e.addCard(d, pile, opts);
  return Array.isArray(m) ? m[0] : m;
}
/** Play a runtime card (Nerve refilled first). */
export async function play(e, card, tgt) {
  e.current.energy = 9;
  const t = tgt || e.livingEnemies()[0];
  await e.playCard(card.uid, t && t.id);
}
/** Add a Trick to hand and play it. */
export async function addPlay(e, id, tgt, opts = {}) { const k = add(e, id, 'hand', opts); await play(e, k, tgt); return k; }
/** The acting seat's companion scratch (Patch, Sets, Gloaming, flags). */
export const M = (e) => U.mm({ e, self: e.current || e.player });
export const emptyHand = (e) => { for (const k of e.piles.hand.slice()) e.discardCard(k, 'proof'); };
export const st = (a, id) => (a.statuses.get(id) || 0);
/** A hit from an enemy, as its own Attack would land. */
export const enemyHit = (e, amount, who) => e.dealDamage({ attacker: who || e.livingEnemies()[0], defender: e.player, amount, kind: 'attack' });

const out = () => document.getElementById('out');
const say = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; out().appendChild(d); };

export async function runProofs(PROOFS) {
  const pass = [], fail = [], ids = [];
  for (const [id, need, opts] of PROOFS) {
    ids.push(id);
    const def = CARDS.cardById(id);
    if (!def) { fail.push(id + ': no such Trick'); say('FAIL ' + id + ' - no such Trick', 'fail'); continue; }
    let r = null, err = '';
    try { r = await compare(def, opts || {}); } catch (x) { err = String((x && x.stack) || x); }
    if (!r) { fail.push(id + ' (' + need + '): ' + (err || 'could not instantiate')); say('FAIL ' + id + ' - ' + (err || 'could not instantiate'), 'fail'); continue; }
    if (!r.played) { fail.push(id + ' (' + need + '): the board still cannot play it'); say('FAIL ' + id + ' - still cannot play it', 'fail'); continue; }
    if (r.unfair) { fail.push(id + ' (' + need + '): its twin is refused'); say('FAIL ' + id + ' - twin refused', 'fail'); continue; }
    if (r.same) { fail.push(id + ' (' + need + '): STILL identical to its blank twin' + (r.threw ? ' - threw ' + r.threw : '')); say('FAIL ' + id + ' - identical with ' + need, 'fail'); continue; }
    pass.push(id + ' (' + need + ')');
    say('PASS ' + id + ' - ' + need, 'pass');
  }
  window.__RESULT = { pass, fail, ids };
  window.__DONE = true;
}
