/**
 * The one path from a player's click into the game. OWNER: foundation.
 *
 * `net/session.js` moves inputs and orders them; it deliberately does not know
 * what any of them MEAN. This is the other half: the single applier that turns
 * an ordered input into a change to the `Run`, and the seam every screen calls
 * instead of touching the run layer directly.
 *
 *   import { act, ACT } from '../net/actions.js';
 *   act(run, { t: INPUT.ROOM, act: ACT.REWARD_TAKE, index: 1 });
 *
 * ── Why a screen must not just call `run.takeRewardCard()` ──────────────────
 *
 * Because every client simulates the whole expedition, not just its own seat.
 * `run._combatDigest()` fingerprints EVERY seat's board, and the next fight
 * deals from decks that all four clients must agree about — so a Kid taking a
 * Trick on their own screen is not a private act. If seat 1's client alone
 * knows they took Rib Rattle, the two clients hold different decks, the next
 * digest mismatches, and the desync is reported a whole room away from the
 * screen that caused it.
 *
 * ── One path, local and remote alike ────────────────────────────────────────
 *
 * With no session (solo, and pass-and-play) `act()` applies straight through
 * and behaves exactly as the direct call it replaced. With a session it goes
 * `session.input()` → the total order → back here through `on('input')`. Both
 * ends run THIS function, which is the point: an ordering bug shows up in a
 * one-machine test rather than only over a real wire, where it would look like
 * latency. `net/session.js` argues the same thing about its own queue.
 *
 * ── Never a uid on the wire ─────────────────────────────────────────────────
 *
 * CONTRACTS trap 30. Uids come from a per-PAGE counter, so two clients building
 * the same deck from the same seed hold the same cards under different uids;
 * a uid on the wire looks right and makes the remote client silently find
 * nothing. Everything here names a card by POSITION — an index into an offer,
 * a shelf, or a Kid's deck — or by an AUTHORED id (an option's `id`, a
 * Keepsake's `id`), which is the identity both clients genuinely share.
 * Converting uid → index is the CALL SITE's job, on the client that has the
 * uid; `cardAt()` converts back.
 */

import { INPUT } from './session.js';

/**
 * What a Kid can do in a room. One verb per thing the run layer can be asked
 * to do, because a verb that means two things cannot be replayed.
 */
export const ACT = Object.freeze({
  /* the card + Keepsake reward */
  REWARD_TAKE: 'reward.take',       // { index }   which of the offered Tricks
  REWARD_SKIP: 'reward.skip',       // {}          none of these three
  REWARD_CLAIM: 'reward.claim',     // { close }   bank the purse and the Keepsake

  /* Mr. Moth's */
  SHOP_BUY: 'shop.buy',             // { kind:'card'|'keepsake'|'snack', key, id, price }
  SHOP_REMOVE: 'shop.remove',       // { index }   a Trick in the buyer's own deck

  /* the Safe Room */
  REST_MEND: 'rest.mend',           // { index }   a Trick in their own deck
  REST_CLONE: 'rest.clone',         // { seat, index }  one of a friend's
  REST_FORGE: 'rest.forge',         // { id }      an authored Keepsake id
  REST_SIT: 'rest.sit',             // {}
  REST_HEAL: 'rest.heal',           // { n }       the night's rest
  REST_MEND_ALLY: 'rest.mendAlly',  // { seat, n } patch a friend up instead

  /* a Curiosity */
  EVENT_OPTION: 'event.option',     // { id }      an authored option id
  EVENT_MEND: 'event.mend',         // { index }
  EVENT_FORGET: 'event.forget',     // { index }

  /* every per-Kid room */
  ROOM_DONE: 'room.done',           // {}          this Kid's turn in here is over
});

/**
 * The card at `index` in a Kid's deck, on THIS client.
 *
 * The deck is the same list in the same order on every client — that is the
 * lockstep premise, the same one `cardRef` in session.js rests on. If two
 * clients ever disagree about it they have already desynced, and saying so is
 * the digest's job, not this lookup's job to hide.
 */
export function cardAt(run, seat, index) {
  const k = run?.kids?.[seat | 0];
  if (!k) return null;
  return k.deck[index | 0] || null;
}

/** Where a card sits in its owner's deck — the call site's uid → wire step. */
export function deckIndex(run, seat, uid) {
  const k = run?.kids?.[seat | 0];
  if (!k) return -1;
  return k.deck.findIndex(c => c.uid === uid);
}

/**
 * Apply one input. Called for a local input and a remote one alike.
 *
 * Returns whatever the run layer returned, so a screen that needs to say what
 * just happened can. Remote inputs discard it; `act()` reads it back off the
 * message for local ones.
 */
export function applyInput(run, msg) {
  if (!run || !msg) return null;
  const seat = msg.seat === undefined ? (run.localSeat | 0) : (msg.seat | 0);
  // A screen deep-linked for review can be handed a run-shaped object rather
  // than a `Run` (reward.js `_resolveRun`). It has one Kid and no seats, so
  // there is no seat to borrow — not a missing API, a degenerate case.
  if (typeof run.asSeat !== 'function') return _apply(run, msg, 0);
  return run.asSeat(seat, () => _apply(run, msg, seat));
}

function _apply(run, msg, seat) {
  switch (msg.t) {
    case INPUT.PLAY: {
      const e = run.combat;
      if (!e) return null;
      const pl = e.players[msg.seat | 0];
      const card = pl && pl.piles.list(msg.pile)[msg.index | 0];
      if (!card) return null;
      return e.playCard(card.uid, msg.target || null);
    }
    case INPUT.END: {
      const e = run.combat;
      if (!e) return null;
      return e.endTurn(e.players[msg.seat | 0]);
    }
    case INPUT.SNACK:
      return run.useSnack(msg.index | 0, msg.target || null);
    case INPUT.CHOICE:
      // NOT BUILT. `ChoiceBroker` has `ask`, `setResolver` and `setScript` and
      // no way to be answered from outside, because local play deliberately
      // resolves another seat's request from its own `prefer` rule — one player
      // rummaging in another Kid's hand would be worse than a stable rule. The
      // remote picker is its own item and it needs a broker change, not a call
      // site: docs/notes/2026-08-28-netcode.md §5.3.
      //
      // Loud rather than `?.`-swallowed (CONTRACTS rule 8): a choice that
      // silently returned null here would desync the two clients by one answer
      // and the digest would report it a turn later, a long way from the cause.
      console.error('[net] INPUT.CHOICE has no applier yet — the remote picker '
                  + 'is not built. See docs/notes/2026-08-28-netcode.md §5.3.', msg);
      return null;
    case INPUT.READY:
    case INPUT.ROOM:
      return _room(run, msg, seat);
    default:
      console.error('[net] unknown input kind', msg.t, msg);
      return null;
  }
}

function _room(run, msg, seat) {
  switch (msg.act) {
    case ACT.REWARD_TAKE: {
      const r = run.local.pendingReward;
      const entry = r && r.cards[msg.index | 0];
      return entry ? run.takeRewardCard(entry.id) : null;
    }
    case ACT.REWARD_SKIP:
      return run.skipRewardCards();
    case ACT.REWARD_CLAIM:
      return run.claimReward({ close: msg.close !== false });

    case ACT.SHOP_BUY: {
      if (msg.kind === 'keepsake') return run.buyKeepsake(msg.id, msg.price | 0, msg.key || null);
      if (msg.kind === 'snack') return run.buySnack(msg.snack, msg.price | 0, msg.key || null);
      return run.buyCard(msg.id, msg.price | 0, msg.key || null);
    }
    case ACT.SHOP_REMOVE: {
      const c = cardAt(run, seat, msg.index);
      return c ? run.buyRemoval(c.uid) : null;
    }

    case ACT.REST_MEND: {
      const c = cardAt(run, seat, msg.index);
      return c ? run.upgradeCard(c.uid) : null;
    }
    case ACT.REST_CLONE: {
      const c = cardAt(run, msg.seat | 0, msg.index);
      // A COPY. `addCard` mints a fresh instance into the learner's deck and
      // the friend's deck is never touched — rest.js `_doClone`.
      return c ? run.addCard(c.id) : null;
    }
    case ACT.REST_FORGE:
      return run.forgeKeepsake(msg.id);
    case ACT.REST_SIT:
      return run.addClues(1);
    case ACT.REST_HEAL:
      return run.heal(msg.n | 0);
    case ACT.REST_MEND_ALLY:
      return run.healKid(run.kids[msg.seat | 0], msg.n | 0);

    case ACT.EVENT_OPTION:
      return run.chooseEventOption(msg.id);
    case ACT.EVENT_MEND: {
      const c = cardAt(run, seat, msg.index);
      return c ? run.upgradeCard(c.uid) : null;
    }
    case ACT.EVENT_FORGET: {
      const c = cardAt(run, seat, msg.index);
      return c ? run.removeCard(c.uid) : null;
    }

    case ACT.ROOM_DONE:
      return run.markRoomDone();

    default:
      console.error('[net] unknown room act', msg.act, msg);
      return null;
  }
}

/**
 * Do a thing, wherever this game is being played.
 *
 * Returns the run layer's own answer when there is no session — synchronously,
 * so a screen that was calling `run.takeRewardCard()` directly keeps the timing
 * it had. Over a wire it returns a promise for the same answer, which lands
 * once the input has taken its place in the total order.
 */
export function act(run, input) {
  const s = run && run.session;
  if (!s) return applyInput(run, { ...input, seat: input.seat === undefined ? run.localSeat : input.seat });
  const msg = s.input(input);
  if (!msg) return null;
  return s.settled().then(() => msg.result);
}

/**
 * Wire a session to a run so remote inputs actually land.
 *
 * One listener, one applier. `msg.result` is written back so `act()` can hand
 * the local caller the same answer a direct call would have given.
 */
export function attachActions(session, run) {
  if (!session || !run) return () => {};
  session.attach(run);
  return session.on('input', async (msg) => {
    msg.result = await applyInput(run, msg);
  });
}

export default { ACT, act, applyInput, attachActions, cardAt, deckIndex };
