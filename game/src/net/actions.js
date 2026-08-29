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
 *
 * ── `seat` is who ACTED; `to` is who it lands on ────────────────────────────
 *
 * `session.input()` rejects any message whose `seat` is not the sending
 * client's, because a client may only speak for itself. So an action aimed at
 * somebody else — mending a friend, copying one of their Tricks — names them
 * with `to`, the same field `useSnack(snack, targetId, { to: seat })` already
 * uses. Reusing `seat` for the target makes the wire refuse the message.
 */

import { INPUT } from './session.js';
import { SNACKS } from '../state/run.js';

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
  SHOP_BUY: 'shop.buy',             // { kind:'card'|'keepsake'|'snack', id, price, key }
  SHOP_REMOVE: 'shop.remove',       // { index }   a Trick in the buyer's own deck

  /* the Safe Room */
  REST_MEND: 'rest.mend',           // { index }   a Trick in their own deck
  REST_CLONE: 'rest.clone',         // { to, index }  one of a friend's
  REST_FORGE: 'rest.forge',         // { id }      an authored Keepsake id
  REST_SIT: 'rest.sit',             // {}
  REST_NIGHT: 'rest.night',         // {}          sleep — the amount is the run's
  REST_MEND_ALLY: 'rest.mendAlly',  // { to, n }   sit up with a friend instead

  /* a Curiosity */
  EVENT_OPTION: 'event.option',     // { id }      an authored option id
  EVENT_MEND: 'event.mend',         // { index }
  EVENT_FORGET: 'event.forget',     // { index }
  EVENT_RESCUE: 'event.rescue',     // { slug }    a Companion comes home
  EVENT_LOOT: 'event.loot',         // { lostThings, clues }  the tidy pile

  /* the blueprint */
  MAP_CHOOSE: 'map.choose',         // { id }      the room the PARTY walks into

  /* every per-Kid room */
  ROOM_DONE: 'room.done',           // {}          this Kid's turn in here is over
});

/**
 * The acts that are nobody's in particular.
 *
 * Everything else in `ACT` reads or writes `run.local`, so it has to be applied
 * AS the Kid who sent it — which is what `asSeat` is for. `map.choose` is the
 * one act that moves the WHOLE PARTY, and applying it as a seat is actively
 * wrong: `enterNode` finishes by calling `resetSeat()` to hand the next room to
 * the lowest living Kid, and `asSeat` would then silently put the borrowed seat
 * back on top of it. Silently, because `asSeat` restores without emitting
 * `run:seat` — so the HUD would keep showing the Kid `resetSeat` chose while
 * `run.local` answered as whoever happened to click the map.
 */
const PARTY_ACTS = new Set([ACT.MAP_CHOOSE]);

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
  if (msg.t === INPUT.ROOM && PARTY_ACTS.has(msg.act)) return _apply(run, msg, seat);
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
      // ONE seat, never the table: over a wire the other Kids are on other
      // machines, and `endTurn()` with no seat would close their turns from
      // here. Every client applies all four ENDs in the one agreed order and
      // the enemy phase falls out of the last of them on every machine.
      return e.endTurn(e.players[msg.seat | 0]);
    }
    case INPUT.SNACK:
      return run.useSnack(msg.index | 0, msg.target || null);
    case INPUT.CHOICE:
      // Never reaches here. `session._accept` delivers a CHOICE out of band,
      // straight to the `ask()` that is blocked on it, because queueing an
      // answer behind the input that is waiting for it is a deadlock. See
      // `attachChoices` below and `session._accept`.
      console.error('[net] a CHOICE reached the input applier, which means '
                  + 'session._accept stopped routing it out of band', msg);
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
      if (msg.kind === 'snack') {
        /* The shelf is NOT re-rolled to find the item. `shopStock` reads the
           Kid's keepsakes to decide what to offer, so recomputing it after a
           purchase answers a different shelf — the buyer names the Snack by its
           AUTHORED id and the price it was standing under. */
        const def = SNACKS.find(s => s.id === msg.id);
        return def ? run.buySnack({ ...def, price: msg.price | 0 }, msg.price | 0, msg.key || null) : null;
      }
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
      const c = cardAt(run, msg.to | 0, msg.index);
      // A COPY. `addCard` mints a fresh instance into the learner's deck and
      // the friend's deck is never touched — rest.js `_doClone`.
      return c ? run.addCard(c.id) : null;
    }
    case ACT.REST_FORGE:
      return run.forgeKeepsake(msg.id);
    case ACT.REST_SIT:
      return run.addClues(1);
    case ACT.REST_NIGHT:
      // `run.rest()` and not `run.heal(n)`: the night also counts a Safe Room
      // and fires every `onRestSite` Keepsake hook, and the amount it heals is
      // the run's own answer rather than a number the screen computed.
      return run.rest();
    case ACT.REST_MEND_ALLY:
      return run.healKid(run.kids[msg.to | 0], msg.n | 0);

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
    case ACT.EVENT_RESCUE:
      // One pet comes home, for everybody: `rescued` is shared and it reaches
      // the lifetime save. A Rescue is the one Curiosity that is not per Kid.
      return run.rescueCompanion(msg.slug);
    case ACT.EVENT_LOOT: {
      if (msg.lostThings) run.addLostThings(msg.lostThings | 0);
      if (msg.clues) run.addClues(msg.clues | 0);
      return true;
    }

    case ACT.MAP_CHOOSE:
      /* By the node's AUTHORED id. Every client generates the same blueprint
         from the same region and seed, so `foyer-0-1` means the same room on
         all four — the shared identity the header asks for, and the reason this
         is not "the third node from the left". */
      return run.chooseNode(msg.id);

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

/**
 * Put a seat's choices in front of that seat, on every client.
 *
 * `engine.choices` raises a request and awaits an answer. Locally the answer
 * for anybody but the person at this screen comes from the request's own
 * `prefer` rule — which is the RIGHT local behaviour, not a placeholder: one
 * player rummaging in another Kid's hand would be worse than a stable rule.
 * Over a wire the answer can be the real one, so it is.
 *
 * ── The shape ───────────────────────────────────────────────────────────────
 *
 * All four clients raise the SAME request at the same point of the same input,
 * because that is what lockstep means. One of them owns it: it opens its
 * picker, publishes the answer as `INPUT.CHOICE`, and the other three — blocked
 * in `ask()` — take that answer and carry on. Everybody resolves the same
 * request with the same picks and the boards stay identical.
 *
 * ── A request is named by its SEQUENCE, never by `req.id` ────────────────────
 *
 * `REQ` in `choice.js` is a module-level counter shared with every preview, so
 * one player hovering a card bumps their numbering and the ids stop matching —
 * a card uid's problem wearing a different hat (CONTRACTS trap 30). `seq`
 * counts this fight's own asks in the order it raises them.
 *
 * ── An answer may arrive BEFORE the question ────────────────────────────────
 *
 * Which sounds impossible and is routine: a fast peer publishes while we are
 * still applying an earlier input, and a rejoining client absorbs a log full of
 * answers before it has replayed the plays that ask them. So answers are kept
 * by seq and `ask()` takes a stored one immediately. Without that the replay
 * hangs on the first choice it reaches.
 */
export function attachChoices(session, engine) {
  if (!session || !engine || !engine.choices) return () => {};
  const broker = engine.choices;
  const answers = new Map();          // seq -> picked[]
  const waiting = new Map();          // seq -> resolve

  const off = session.on('answer', (msg) => {
    const seq = msg.seq2 | 0;
    answers.set(seq, msg.picked || []);
    const w = waiting.get(seq);
    if (w) { waiting.delete(seq); w(msg.picked || []); }
  });

  broker.setRemote(async (req, { seq, seat, mine }) => {
    if (answers.has(seq)) return answers.get(seq);
    if (mine) {
      /* Our own call. The picker if there is one, the deterministic rule if
         there is not — a headless client still has to answer, and it has to
         answer the way every other client would if it were theirs. */
      const picked = (broker.resolver && !broker.autoOnly)
        ? await broker.resolver(req)
        : broker.auto(req);
      // `seq2`, not `seq`: `session.input()` stamps its own `seq` for ordering
      // and would overwrite this one.
      session.input({ t: INPUT.CHOICE, seq2: seq, forSeat: seat, picked });
      return picked;
    }
    /**
     * Somebody else's call, and we wait for it. If that seat is not at the
     * table any more the wait would never end, so a seat that has FALLEN or
     * does not exist falls back to the deterministic rule — the same answer on
     * every client, which is the only kind of fallback lockstep can take. A
     * seat that has merely DISCONNECTED is not this function's problem: the
     * game waits, and `session.rejoin()` is what ends the wait.
     */
    const pl = engine.players[seat | 0];
    if (!pl || pl.fallen || !pl.alive) return broker.auto(req);
    return new Promise(res => waiting.set(seq, res));
  });

  return () => { off(); broker.setRemote(null); answers.clear(); waiting.clear(); };
}

export default { ACT, act, applyInput, attachActions, attachChoices, cardAt, deckIndex };
