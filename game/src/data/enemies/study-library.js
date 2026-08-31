/**
 * The Grand Study and Library — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/07-study-library.md §1–§13, §50–§51.
 *
 * The Graveyard tells the player what will happen two turns from now. The
 * Library does the opposite: it WATCHES WHAT THE PLAYER DOES AND ANSWERS.
 * §1's identity line is "Your deck is information, and enemies can use that
 * information", and every enemy below reads one different slice of it —
 *
 *   Book Bat      the Trick you are ABOUT to draw
 *   Inkblot       the LAST Trick you played
 *   Index Beast   the WHOLE COMPOSITION of your turn
 *   Bookmark Imp  one Trick in your hand, and whether you spend it
 *   Quill Clerk   one Trick's COST, for the next time you play it
 *   Paper Knight  how much ATTACK damage you can produce in a single turn
 *
 * ── MARKUP IS NOT DECK CORRUPTION (§2) ──────────────────────────────────────
 *
 * §2 sets four rules on every mark this region applies, and they are the whole
 * reason the region is allowed to touch the player's Tricks at all:
 * it "identifies the affected Trick clearly", "explains exactly what will
 * happen", "disappears when its condition resolves", and "NEVER PERMANENTLY
 * ALTERS THE PLAYER'S DECK".
 *
 * So every mark below is (a) a uid set on the SEAT, not on the card — the mark
 * has to survive the Trick moving between piles and a runtime card must never
 * leave the engine (CONTRACTS 19) — and (b) announced by name through
 * `c.announceRule`, which is the only surface that can say WHICH Trick.
 *
 * That is the Graveyard's `forgotten` pattern, deliberately: `Corrected` is
 * "costs 1 more, once" with a cap and a different name, and reusing the shape
 * means reusing a cost path the engine is already proven to re-read on every
 * repaint. See `graveyard.js` §6's note for why the uids live on the seat.
 *
 * ── ONE HOUSE RULE PER SOURCE, AND WHY ──────────────────────────────────────
 *
 * A screenshot of the Heart found five House Rule cards stacked over the boss
 * portrait. This region marks Tricks CONSTANTLY — a Quill Clerk alone marks
 * every other turn — so every announcement here is keyed `<kind>:<self.id>`,
 * which REPLACES that enemy's previous card rather than adding a sixth. Two
 * Quill Clerks are two cards; one Quill Clerk over four turns is one.
 *
 * ── COUNTERS, NOT DAMAGE STATUSES, FOR DARKENING AND RECORD ─────────────────
 *
 * Both read "each gives 2 additional attack damage", and both are gained by a
 * move that then attacks IN THE SAME ACTION ("Gain 1 Darkening… then deal 5
 * damage"). A `modifyDamageDealt` status cannot say that honestly: the intent
 * is drawn before the move resolves, so it would promise 5 and deliver 7. They
 * are counters read by `damageFn` instead — the Groundskeeper's `punch()`
 * pattern — so the number on the intent is computed from the state the move
 * will have WHEN IT RESOLVES, and the audit scores it clean.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, flag, played,
  whenHandArrives, runHandOps,
} from './_lib.js';

const REGION = 'study-library';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const STUDY_LIBRARY_STATUSES = [
  {
    /**
     * §8. "A Corrected Trick costs 1 additional Nerve the next time it is
     * played. Then Correction disappears." The Graveyard's `forgotten` twin —
     * see that def for why the marked uids live on the PLAYER and why the
     * spend is booked in `onCardPlayed` rather than in the cost hook.
     *
     * §8's "the same Trick cannot receive multiple Corrections" is enforced at
     * the MARK site (`correct()` below), not here: a Set already cannot hold a
     * uid twice, and the stack count is what tells the player how many of their
     * Tricks are scribbled on.
     */
    id: 'corrected', name: 'Corrected', kind: 'debuff', icon: 'corrected',
    desc: 'Some of your Tricks have been edited. Each costs 1 additional Nerve the next time you play it.',
    decay: 'never', stacks: true,
    hooks: {
      modifyCardCost: (cost, h) => {
        const marks = h.owner && h.owner._corrected;
        return (marks && h.card && marks.has(h.card.uid)) ? cost + 1 : cost;
      },
      onCardPlayed: (h) => {
        const marks = h.owner && h.owner._corrected;
        if (!marks || !h.card || !marks.has(h.card.uid)) return;
        marks.delete(h.card.uid);
        h.consume(1);
      },
    },
  },
  {
    /**
     * §7. Bookmarked is a QUESTION, not damage: play the Trick and take 4, or
     * keep it and lose it to the bottom of the draw pile.
     *
     * The status carries no hooks at all. Both halves are resolved by the
     * Bookmark Imp — the play half in `onCardPlayed` on the def, the not-played
     * half in `onPlayerTurnEnd` — because both halves need to know WHICH Imp,
     * and a status shared by two Imps could not say. This def exists so the
     * player sees the word on their status bar and can read what it means.
     */
    id: 'bookmarked', name: 'Bookmarked', kind: 'debuff', icon: 'bookmarked',
    desc: 'One of your Tricks has a ribbon in it. Play it and the Imp bites; leave it and it goes to the bottom of your draw pile.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /**
     * §27. The Archivist's phase-two mark, declared here with the rest of the
     * region's Markup because it is Markup and because `data/keywords.js` reads
     * one registry.
     *
     * "That Trick still performs its normal effect and RETAINS ITS ACTUAL TRICK
     * TYPE FOR EVERY OTHER GAME SYSTEM. But for The Catalogue only, it counts
     * as a different type." So this status deliberately has no hooks either:
     * nothing in the engine may read it. The Catalogue asks `misfiledAs()`
     * below, and that is the only reader in the game.
     */
    id: 'misfiled', name: 'Misfiled', kind: 'debuff', icon: 'misfiled',
    desc: 'A catalogue label has been stuck to one of your Tricks. It does what it always did — but The Catalogue will file it as something else.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /**
     * §6. The Paper Knight's defensive posture — "the first Attack Trick that
     * damages it each turn deals 5 less. Minimum 0."
     *
     * The allowance is PER TURN, so the spend is a field on the actor that the
     * Knight's own `onPlayerTurnStart` clears. It lives on the actor rather
     * than in the status because `modifyDamageTaken` and `onAttacked` are two
     * separate hook invocations that have to agree about one allowance, and
     * `ctx.owner` is the only thing both of them are handed.
     *
     * `_foldCut` rather than a literal 5, because Haunt 5 raises it to 7 and a
     * status def cannot read the actor's Haunt flags.
     */
    id: 'folded', name: 'Folded', kind: 'buff', icon: 'folded',
    desc: 'The first Attack Trick that damages it each turn deals 5 less. Minimum 0.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, ctx) => {
        if (ctx.card?.type !== 'attack') return amt;
        const o = ctx.owner || {};
        if (o._foldUsed) return amt;
        return Math.max(0, amt - (o._foldCut ?? 5));
      },
      onAttacked: (ctx) => {
        if (ctx.card?.type !== 'attack') return;
        if (ctx.owner) ctx.owner._foldUsed = true;
      },
    },
  },
];

/* ══ Markup — the shared mark/announce machinery (§2) ════════════════════════ */

/**
 * Mark Tricks Corrected. Returns the uids that actually took a mark.
 *
 * `cap` is §8's "maximum two Corrected Tricks can exist FROM ONE QUILL CLERK"
 * (three at Haunt 7) — per SOURCE, so two Clerks may hold four between them.
 * The source's own live list is recomputed against the seat's set on every
 * call, which is how a mark spent by the player frees a slot without anything
 * having to notify the Clerk it is gone.
 */
export function correct(c, seat, uids, cap = Infinity) {
  const marks = (seat._corrected ||= new Set());
  const mine = (mem(c).corrections = (mem(c).corrections || []).filter(u => marks.has(u)));
  const took = [];
  for (const u of uids) {
    if (mine.length + took.length >= cap) break;
    if (marks.has(u)) continue;            // §8: never two Corrections on one Trick
    marks.add(u);
    took.push(u);
  }
  if (!took.length) return took;
  mine.push(...took);
  c.applyStatus(seat, 'corrected', took.length);
  return took;
}

/** Is this uid currently Corrected? Pure — safe from `nextMove`. */
export function isCorrected(seat, uid) {
  return !!(seat && seat._corrected && seat._corrected.has(uid));
}

/**
 * The Catalogue type of a Trick the player just played (§34).
 *
 * "Catalogue type should be determined WHEN THE TRICK IS PLAYED. If Crinkle
 * transforms an Attack into a Skill before playing it, it counts as a Skill" —
 * which is already true for free, because `cardsPlayedThisTurn` records the
 * runtime card's type at the moment it resolved, not its printed one.
 *
 * "If the Trick is Misfiled, it instead counts according to the Misfiled label
 * FOR THE CATALOGUE ONLY." That is this function and nothing else.
 */
export function catalogueType(seat, rec) {
  if (!rec) return null;
  const label = seat && seat._misfiled;
  if (label && label.uid === rec.uid) return label.as;
  return rec.type;
}

/** Stick a Misfiled label on one Trick (§27). One per seat at a time. */
export function misfile(c, seat, rec, as) {
  seat._misfiled = { uid: rec.uid, as };
  c.applyStatus(seat, 'misfiled', 1);
  return seat._misfiled;
}

/** Drop the Misfiled label — "after that Trick is played or at end of turn". */
export function unfile(c, seat) {
  if (!seat || !seat._misfiled) return;
  seat._misfiled = null;
  c.removeStatus(seat, 'misfiled');
}

/** The three Trick types, in the order every Catalogue in this region lists them. */
export const TYPES = ['attack', 'skill', 'power'];

/**
 * Which Trick type dominated the turn just ended (§9, §42).
 *
 * Solo it is §9's "which Trick type the player used most", ties broken by
 * "whichever tied type was played most recently". In a party §42 replaces the
 * count with a PROPORTION — "if more than half of all Tricks played were
 * Attacks" — and anything short of a majority is Confused. The two rules agree
 * at one seat only by accident, so both are here rather than one pretending.
 *
 * Returns null for "no dominant type" (§9's diverse turn / §42's no-majority).
 */
export function dominantType(c, { majority = false, needAll = false } = {}) {
  const list = played(c).filter(p => p && TYPES.includes(p.type));
  if (!list.length) return null;
  const n = {};
  for (const t of TYPES) n[t] = list.filter(p => p.type === t).length;

  if (needAll && TYPES.every(t => n[t] > 0)) return null;   // §9 diverse turn
  if (majority) {
    const win = TYPES.find(t => n[t] * 2 > list.length);
    return win || null;
  }
  let best = null;
  for (const p of list) {                                   // ties → most recent
    if (best === null || n[p.type] > n[best]) best = p.type;
    else if (n[p.type] === n[best]) best = p.type;
  }
  return best;
}

/** The most recent Trick the table played this turn (§5, §38). */
export function lastPlayed(c) {
  const list = played(c);
  return list.length ? list[list.length - 1] : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Book Bat — the Trick you have not drawn yet (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player knows both: what they will probably draw next, and what the Book
 * Bat intends to do because of it. If the deck can manipulate draw order, the
 * player can even change the answer." (§4.)
 *
 * That last sentence is the reason Read Ahead stores the TYPE and not the card:
 * the Bat committed to answering a Skill, and a player who then puts an Attack
 * on top has beaten it. Re-reading the pile when the response resolves would
 * quietly take that back.
 */
export const bookBat = {
  id: 'book-bat',
  name: 'Book Bat',
  region: REGION,
  tier: 'normal',
  role: 'reader',
  hp: [24, 24],
  silhouette: 'bat',
  palette: ['#6b4f3a', '#c8a97e', '#2b211a'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.6,
  lore: 'A leather-bound book flapping on its own covers, with a pair of tiny spectacles swinging from its spine.',

  onSpawn(c) { mem(c).read = null; },

  moves: {
    'read-ahead': {
      id: 'read-ahead', name: 'Read Ahead', intent: Intent.BUFF,
      tell: 'It thumbs your draw pile and finds its place.',
      effect(c) {
        const draw = c.cardsIn ? c.cardsIn('draw') : [];
        if (!draw.length) { mem(c).read = null; c.block(c.self, 6); return; }

        /* Haunt 3: "reveals the top two Tricks. The player chooses which
           remains on top. Book Bat reacts to the one left on top."
           DEVIATION, and a deliberate one: there is no engine surface for an
           enemy to hand the player a choice mid-move, and inventing one for a
           single Haunt flag would be a new modal in the most-repeated enemy in
           the region. Both Tricks are NAMED instead, and the Bat still answers
           the one on top — so the information is all there and the choice is
           made the region's own way, by a deck that can reorder its draw. */
        const deep = flag(c, 'readTwo', false) && draw.length > 1;
        const top = draw[0];
        mem(c).read = top.type;
        c.announceRule({
          id: `read:${c.self.id}`,
          name: `Read Ahead: ${top.name}`,
          text: deep
            ? `Under it: ${draw[1].name}. It answers whichever is on top when it looks up.`
            : 'It is preparing an answer to this Trick.',
        });
      },
    },

    /* The three answers. Each is its own MoveDef so the intent silhouette is
       right — a Guard answer must not draw as an attack — and `nextMove` picks
       between them from `mem`, which Read Ahead has already set. */
    'hide-behind-the-cover': {
      id: 'hide-behind-the-cover', name: 'Hide Behind the Cover', intent: Intent.DEFEND, block: 11,
      tell: 'It shuts itself and waits for the swing.',
      effect(c) { c.block(c.self, 11); },
    },
    'scholarly-swoop': {
      id: 'scholarly-swoop', name: 'Scholarly Swoop', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It has read enough to know where you are not looking.',
      effect(c) { hitPlayer(c, 9); },
    },
    'alarmed-screech': {
      id: 'alarmed-screech', name: 'Alarmed Screech', intent: Intent.ATTACK_DEFEND, damage: 6, hits: 1, block: 6,
      tell: 'It does not like what it just read.',
      effect(c) { hitPlayer(c, 6); c.block(c.self, 6); },
    },

    'page-peck': {
      id: 'page-peck', name: 'Page Peck', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It pecks at you like you are a footnote.',
      effect(c) { hitPlayer(c, 6); },
    },
    'flutter-away': {
      id: 'flutter-away', name: 'Flutter Away', intent: Intent.DEFEND, block: 8,
      tell: 'It flaps up out of reach.',
      effect(c) { c.block(c.self, 8); },
    },
  },

  /**
   * §4's four-beat cycle. The second beat is chosen by what the first READ, so
   * this reads `mem` — which Read Ahead's effect wrote — and never writes.
   * A Bat that has not read anything yet answers as if it saw a Skill, which
   * is the middle answer and the one that cannot surprise anybody.
   */
  nextMove: (c) => {
    const beat = cyc([0, 1, 2, 3], (c.history || []).length);
    if (beat === 0) return 'read-ahead';
    if (beat === 2) return 'page-peck';
    if (beat === 3) return 'flutter-away';
    const t = mem(c).read;
    if (t === 'attack') return 'hide-behind-the-cover';
    if (t === 'power') return 'alarmed-screech';
    return 'scholarly-swoop';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.readTwo = true;
      h.notes.push('Haunt 3: Read Ahead names the top TWO Tricks. It still answers the one on top.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Inkblot — the last Trick you played (§5)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player can deliberately end their turn with a particular Trick type to
 * manipulate Inkblot's next action." (§5.) In a party that becomes §38's much
 * better version — the Impression is the last Trick the WHOLE TABLE played, so
 * the team decides whose finisher sets it.
 *
 * Darkening is a counter rather than a status. See the header.
 */
const inkDark = (c) => 2 * cnt(c, 'darkening');

export const inkblot = {
  id: 'inkblot',
  name: 'Inkblot',
  region: REGION,
  tier: 'normal',
  role: 'copier',
  hp: [30, 30],
  silhouette: 'blob',
  palette: ['#1c1a22', '#4a4657', '#0d0c11'],
  shape: { body: 'squat', limbs: 0, eyes: 1 },
  scale: 0.7,
  lore: 'A puddle of ink that crawls after you and briefly takes the shape of whatever it last watched you do.',

  onSpawn(c) { mem(c).impression = null; setCnt(c, 'darkening', 0); },

  /**
   * §5: "At the end of every player turn, Inkblot records the type of the last
   * Trick played."
   *
   * `onPlayerTurnEnd` is correct HERE and would be wrong for a damage buff:
   * this sets which MOVE comes next, and the move is chosen after the player
   * turn ends, so the intent is drawn from an Impression already recorded.
   * Nothing about the number changes afterwards.
   */
  onPlayerTurnEnd(c) {
    const last = lastPlayed(c);
    if (last) { mem(c).impression = last.type; announceInk(c); return; }
    /* Haunt 4: "retains its previous Impression if the player ends a turn
       without playing a Trick." Below that, an empty turn wipes it — which is
       what makes Blank Page reachable at all. */
    if (!flag(c, 'keepImpression', false)) mem(c).impression = null;
    announceInk(c);
  },

  moves: {
    'ink-claw': {
      id: 'ink-claw', name: 'Ink Claw', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + inkDark(c),
      tell: 'It sharpens the shape of the last thing you swung.',
      effect(c) { hitPlayer(c, 10 + inkDark(c)); },
    },
    'ink-shield': {
      id: 'ink-shield', name: 'Ink Shield', intent: Intent.ATTACK_DEFEND, damage: 4, hits: 1, block: 12,
      damageFn: (c) => 4 + inkDark(c),
      tell: 'It flattens into a disc the shape of your last Skill.',
      effect(c) { c.block(c.self, 12); hitPlayer(c, 4 + inkDark(c)); },
    },
    'ink-bloom': {
      /* The self-buffing attack the header is about: the Darkening is gained
         BEFORE the damage, so both the intent and the effect must count it. */
      id: 'ink-bloom', name: 'Ink Bloom', intent: Intent.ATTACK_BUFF, damage: 5, hits: 1,
      damageFn: (c) => 5 + 2 * Math.min(3, cnt(c, 'darkening') + 1),
      tell: 'It darkens, and then it spreads.',
      effect(c) {
        addCnt(c, 'darkening', 1, 3);
        hitPlayer(c, 5 + inkDark(c));
      },
    },
    'blank-page': {
      id: 'blank-page', name: 'Blank Page', intent: Intent.DEFEND, block: 7,
      tell: 'It has nothing to copy and goes flat and white.',
      effect(c) { c.block(c.self, 7); },
    },
    smear: {
      id: 'smear', name: 'Smear', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + inkDark(c),
      tell: 'It wipes itself across the floor at you.',
      effect(c) {
        hitPlayer(c, 7 + inkDark(c));
        mem(c).impression = null;             // §5: "Clear Impression afterward."
        announceInk(c);
      },
    },
  },

  /** §5: response, Smear, response, Smear. */
  nextMove: (c) => {
    if ((c.history || []).length % 2 === 1) return 'smear';
    const i = mem(c).impression;
    if (i === 'attack') return 'ink-claw';
    if (i === 'skill') return 'ink-shield';
    if (i === 'power') return 'ink-bloom';
    return 'blank-page';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.keepImpression = true;
      h.notes.push('Haunt 4: an empty turn no longer wipes its Impression.');
    }
    return h;
  },
};

function announceInk(c) {
  const i = mem(c).impression;
  const WORD = { attack: 'an Attack', skill: 'a Skill', power: 'a Power' };
  c.announceRule({
    id: `ink:${c.self.id}`,
    name: i ? `Impression: ${WORD[i]}` : 'Impression: blank',
    text: i
      ? 'It answers the LAST Trick played each turn. End your turn on a different type and its next move changes.'
      : 'Nothing to copy. End a turn on an Attack, Skill or Power to decide what it becomes.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Paper Knight — the damage you can produce in ONE turn (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player can wait for natural transformation or spend enough damage to
 * force it." (§6.) Both routes are real: Folded is a defensive posture that
 * ends on its own after the Knight has taken two swings Unfolded, and 14 Attack
 * damage in a single turn ends it immediately.
 *
 * §39 raises the threshold with the table — 20 / 26 / 31 — because four decks
 * produce a single-turn burst one deck cannot, and "once Unfolded, it remains
 * Unfolded through the entire next team round".
 */
const UNFOLD_AT = { 1: 14, 2: 20, 3: 26, 4: 31 };
const unfoldThreshold = (c) => UNFOLD_AT[Math.min(4, Math.max(1, c.partySize ? c.partySize() : 1))] || 14;

export const paperKnight = {
  id: 'paper-knight',
  name: 'Paper Knight',
  region: REGION,
  tier: 'normal',
  role: 'form-changer',
  hp: [39, 39],
  silhouette: 'knight',
  palette: ['#d9cfb8', '#8a7c62', '#332e26'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 0.95,
  lore: 'A knight folded from heavy parchment. Its sword is a sharpened ruler and its shield is somebody’s library card.',

  onSpawn(c) {
    mem(c).folded = true;
    mem(c).swings = 0;
    c.applyStatus(c.self, 'folded', 1);
    announceKnight(c);
  },

  /**
   * The Folded allowance is "the FIRST Attack Trick that damages it EACH TURN",
   * so the spend has to be cleared at the start of every player turn. It lives
   * on the actor because the status hook is the only other thing that reads it.
   */
  onPlayerTurnStart(c) {
    c.self._foldUsed = false;
    c.self._foldCut = flag(c, 'foldCut', 5);
  },

  /**
   * §6's forced Unfold, measured at the end of the player turn from damage the
   * player actually dealt this turn. `damageTakenThisTurn` is still readable
   * here — that is what it is for — and resolving it now means the Full Page
   * Slash the player just bought is the intent they are shown, not a surprise
   * one turn later.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (!m.folded) return;
    if ((c.self.damageTakenThisTurn || 0) < unfoldThreshold(c)) return;
    m.folded = false;
    m.swings = 0;
    m.forced = true;                          // "Its next action becomes Full Page Slash."
    c.removeStatus(c.self, 'folded');
    announceKnight(c);
  },

  moves: {
    'paper-shield': {
      id: 'paper-shield', name: 'Paper Shield', intent: Intent.DEFEND, block: 10,
      tell: 'It puts the library card between you and it.',
      effect(c) { c.block(c.self, 10); },
    },
    'needle-point': {
      id: 'needle-point', name: 'Needle Point', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'A very precise little jab.',
      effect(c) { hitPlayer(c, 7); },
    },
    'full-page-slash': {
      id: 'full-page-slash', name: 'Full Page Slash', intent: Intent.ATTACK_BIG, damage: 12, hits: 1,
      tell: 'It opens all the way out and swings from the spine.',
      effect(c) { mem(c).swings++; hitPlayer(c, 12); },
    },
    'paper-sweep': {
      id: 'paper-sweep', name: 'Paper Sweep', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'Two long flat sweeps, edge-on.',
      effect(c) { mem(c).swings++; hitPlayer(c, 5, 2); },
    },
    refold: {
      id: 'refold', name: 'Refold', intent: Intent.DEFEND, block: 8,
      /* Declared, because Folded is a real defensive layer and an intent that
         showed a bare "8 Guard" would let it land with no warning. */
      applies: [{ id: 'folded', stacks: 1, to: 'self' }],
      tell: 'It creases itself back down to a manageable size.',
      effect(c) {
        c.block(c.self, 8);
        const m = mem(c);
        m.folded = true;
        m.swings = 0;
        m.forced = false;
        c.applyStatus(c.self, 'folded', 1);
        announceKnight(c);
      },
    },
  },

  /**
   * Pure: every branch reads `mem` and `history`, and the two writes that drive
   * it (`folded`, `swings`) happen in `onPlayerTurnEnd` and in move effects.
   */
  nextMove: (c) => {
    const m = mem(c);
    if (m.folded) {
      return cyc(['paper-shield', 'needle-point'], (c.history || []).length);
    }
    if (m.forced) return 'full-page-slash';           // §6: forced Unfold's answer
    if ((m.swings || 0) >= 2) return 'refold';        // "After taking two actions"
    return (m.swings || 0) === 0 ? 'full-page-slash' : 'paper-sweep';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.foldCut = 7;
      h.notes.push('Haunt 5: Folded turns aside 7 damage instead of 5.');
    }
    return h;
  },
};

function announceKnight(c) {
  const folded = mem(c).folded;
  c.announceRule({
    id: `fold:${c.self.id}`,
    name: folded ? 'Folded' : 'Unfolded',
    text: folded
      ? `The first Attack Trick that hits it each turn deals ${flag(c, 'foldCut', 5)} less. Deal ${unfoldThreshold(c)} Attack damage in one turn and it opens up.`
      : 'It takes full damage. After two swings it folds back down.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Bookmark Imp — one Trick, and whether you spend it (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Is the Trick worth playing now despite the immediate consequence? Or should
 * the player accept losing access to it for a while?" (§7.)
 *
 * Both halves live on this def rather than on the status, because both need to
 * know WHICH Imp asked — two Imps are two separate questions about two separate
 * Tricks, and a status shared between them could answer for the wrong one.
 */
export const bookmarkImp = {
  id: 'bookmark-imp',
  name: 'Bookmark Imp',
  region: REGION,
  tier: 'normal',
  role: 'sequencer',
  hp: [26, 26],
  silhouette: 'imp',
  palette: ['#a8322f', '#e07a5f', '#2a1512'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.55,
  lore: 'A small red thing with a ribbon for a tail and a bookmark where its tongue should be.',

  onSpawn(c) { mem(c).mark = null; },

  /** The ribbon goes in as the player picks the hand up. See `whenHandArrives`. */
  onPlayerReady(c) { runHandOps(c); },

  /**
   * The play half: "Bookmark Imp immediately deals 4 damage. This triggers once."
   *
   * ONE argument. `_enemyLifecycle` merges its `extra` INTO the ctx and calls
   * `def.onCardPlayed(ctx)` — so the played card is `c.card`, and a second
   * `info` parameter would be `undefined` on every call and this whole mechanic
   * would silently never fire.
   */
  onCardPlayed(c) {
    const m = mem(c);
    const uid = c.card && c.card.uid;
    if (!m.mark || !uid || uid !== m.mark.uid) return;
    m.mark = null;
    c.removeStatus(c.player, 'bookmarked');
    c.clearRules(`mark:${c.self.id}`);
    hitPlayer(c, flag(c, 'markBite', 4));
  },

  /**
   * The not-played half: to the bottom of the draw pile, and the Imp gains
   * 7 Guard.
   *
   * The MOVE happens here, where the Trick has just been discarded and going
   * to the bottom of the draw pile still means something. The GUARD does not:
   * the engine wipes every enemy's Guard at the start of that enemy's own turn,
   * three steps after this hook, so 7 Guard banked here is erased before it can
   * stop anything. Measured — the Imp ended the enemy phase on 0. It is flagged
   * here and paid at `onTurnStart`, which runs immediately AFTER the wipe.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (!m.mark) return;
    const uid = m.mark.uid;
    m.mark = null;
    c.removeStatus(c.player, 'bookmarked');
    c.clearRules(`mark:${c.self.id}`);
    if (c.moveCardTo) c.moveCardTo(uid, 'draw', { bottom: true });
    m.owed = true;
  },

  onTurnStart(c) {
    if (!mem(c).owed) return;
    mem(c).owed = false;
    c.block(c.self, 7);
  },

  moves: {
    'mark-your-place': {
      id: 'mark-your-place', name: 'Mark Your Place', intent: Intent.DEBUFF,
      applies: [{ id: 'bookmarked', stacks: 1, to: 'player' }],
      tell: 'It licks a ribbon and reaches for your hand.',
      effect(c) {
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) { k.block(k.self, 7); return; }

          /* §13: "Bookmark Imp cannot Bookmark a Trick already Corrected if
             another valid target exists." Two marks on one Trick is two bills
             for one decision, and the region's whole claim is that each mark is
             a legible question. */
          const clean = hand.filter(x => !isCorrected(k.player, x.uid));
          const pool = clean.length ? clean : hand;
          const pick = pool[k.rng.int(pool.length)];

          mem(k).mark = { uid: pick.uid, name: pick.name };
          k.applyStatus(k.player, 'bookmarked', 1);
          k.announceRule({
            id: `mark:${k.self.id}`,
            name: `Bookmarked: ${pick.name}`,
            text: `Play it this turn and the Imp bites for ${flag(k, 'markBite', 4)}. Leave it and it goes to the bottom of your draw pile, and the Imp gains 7 Guard.`,
          });
        });
      },
    },
    'ribbon-whip': {
      id: 'ribbon-whip', name: 'Ribbon Whip', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It cracks the ribbon at you.',
      effect(c) { hitPlayer(c, 7); },
    },
    'hold-the-page': {
      id: 'hold-the-page', name: 'Hold the Page', intent: Intent.DEFEND, block: 9,
      tell: 'It holds its place and refuses to be moved.',
      effect(c) { c.block(c.self, 9); },
    },
  },

  nextMove: (c) => cyc(['mark-your-place', 'ribbon-whip', 'hold-the-page', 'ribbon-whip'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.markBite = 6;
      h.notes.push('Haunt 6: playing the Bookmarked Trick costs 6 instead of 4.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 5. Quill Clerk — the cost of the Trick, next time (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * §8's own closing rule is the important one: "The same Trick cannot receive
 * multiple Corrections. NO 4 NERVE BASIC ATTACK NONSENSE." Enforced in
 * `correct()`, which refuses a uid the seat already holds.
 */
export const quillClerk = {
  id: 'quill-clerk',
  name: 'Quill Clerk',
  region: REGION,
  tier: 'normal',
  role: 'markup',
  hp: [33, 33],
  silhouette: 'quill',
  palette: ['#f2ede2', '#8d1f1f', '#2b2b2b'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 0.75,
  lore: 'A floating quill in small white gloves. It is editing everything, including things that are not writing.',

  onSpawn(c) { mem(c).corrections = []; },

  /** Red Ink dries on the hand the player is about to hold. */
  onPlayerReady(c) { runHandOps(c); },

  moves: {
    'red-ink': {
      id: 'red-ink', name: 'Red Ink', intent: Intent.DEBUFF,
      applies: [{ id: 'corrected', stacks: 1, to: 'player' }],
      tell: 'It uncaps something red and looks at your hand.',
      effect(c) {
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) { k.block(k.self, 5); return; }
          /* §8: "Prefer a Trick costing at least 1 Nerve." Correcting a free
             Trick spends the Clerk's turn on nothing. */
          const paid = hand.filter(x => (x.cost || 0) >= 1 && !isCorrected(k.player, x.uid));
          const free = hand.filter(x => !isCorrected(k.player, x.uid));
          const pool = paid.length ? paid : free;
          if (!pool.length) { k.block(k.self, 5); return; }
          const pick = pool[k.rng.int(pool.length)];
          const took = correct(k, k.player, [pick.uid], flag(k, 'maxCorrections', 2));
          if (!took.length) { k.block(k.self, 5); return; }
          announceClerk(k, pick.name, 'in your hand');
        });
      },
    },
    'editorial-jab': {
      id: 'editorial-jab', name: 'Editorial Jab', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It stabs at you nib-first.',
      effect(c) { hitPlayer(c, 8); },
    },
    'margin-note': {
      id: 'margin-note', name: 'Margin Note', intent: Intent.DEFEND_DEBUFF, block: 5,
      applies: [{ id: 'corrected', stacks: 1, to: 'player' }],
      tell: 'It writes in the margin of something you have not drawn yet.',
      effect(c) {
        c.block(c.self, 5);
        const draw = c.cardsIn ? c.cardsIn('draw') : [];
        if (!draw.length) return;
        const pick = draw[0];
        const took = correct(c, c.player, [pick.uid], flag(c, 'maxCorrections', 2));
        if (!took.length) return;
        // "Reveal that Trick" — the whole point of marking one you cannot see.
        announceClerk(c, pick.name, 'on top of your draw pile');
      },
    },
  },

  nextMove: (c) => cyc(['red-ink', 'editorial-jab', 'margin-note', 'editorial-jab'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.maxCorrections = 3;
      h.notes.push('Haunt 7: it can hold 3 Corrections at once instead of 2.');
    }
    return h;
  },
};

function announceClerk(c, name, where) {
  c.announceRule({
    id: `ink:${c.self.id}`,
    name: `Corrected: ${name}`,
    text: `It costs 1 additional Nerve the next time you play it (${where}). Then the correction is gone.`,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Index Beast — the whole shape of your turn (§9)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Index Beast rewards deliberate variation without REQUIRING it. A highly
 * specialized deck can simply prepare for its predictable response." (§9.)
 *
 * Record is a counter for the same reason Darkening is — Permanent Record gains
 * one and then attacks with it in the same action.
 */
const beastRec = (c) => 2 * cnt(c, 'record');

export const indexBeast = {
  id: 'index-beast',
  name: 'Index Beast',
  region: REGION,
  tier: 'normal',
  role: 'adapter',
  hp: [44, 44],
  silhouette: 'beast',
  palette: ['#c9b48c', '#7a5f3a', '#2f2519'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.15,
  lore: 'A big animal assembled from index cards, drawer labels and wooden catalogue handles. It reorganises itself while you watch.',

  onSpawn(c) { mem(c).indexed = null; setCnt(c, 'record', 0); },

  /**
   * §9 solo, §42 in a party. `dominantType` carries both rules; the Beast only
   * has to say which one applies to the table in front of it.
   *
   * Haunt 8 narrows Confused: "only if all three Trick types were played AND no
   * type represented more than half of the turn" — so a 3-1-1 turn, which used
   * to Confuse it, now files under Attack.
   */
  onPlayerTurnEnd(c) {
    const party = (c.partySize ? c.partySize() : 1) > 1;
    const strict = flag(c, 'strictConfusion', false);
    const t = party || strict
      ? dominantType(c, { majority: true, needAll: strict && !party })
      : dominantType(c, { needAll: true });
    mem(c).indexed = t;
    announceBeast(c);
  },

  moves: {
    'defensive-filing': {
      id: 'defensive-filing', name: 'Defensive Filing', intent: Intent.DEFEND, block: 15,
      tell: 'Drawers slam shut across its whole body.',
      effect(c) { c.block(c.self, 15); },
    },
    'overdue-charge': {
      id: 'overdue-charge', name: 'Overdue Charge', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + beastRec(c),
      tell: 'It has decided you are late returning something.',
      effect(c) { hitPlayer(c, 12 + beastRec(c)); },
    },
    'permanent-record': {
      id: 'permanent-record', name: 'Permanent Record', intent: Intent.ATTACK_BUFF, damage: 6, hits: 1,
      damageFn: (c) => 6 + 2 * Math.min(3, cnt(c, 'record') + 1),
      tell: 'It writes this down somewhere you will not be able to reach.',
      effect(c) {
        addCnt(c, 'record', 1, 3);
        hitPlayer(c, 6 + beastRec(c));
      },
    },
    reorganize: {
      id: 'reorganize', name: 'Reorganize', intent: Intent.DEFEND, block: 7,
      tell: 'It cannot decide what you are and shuffles itself instead.',
      effect(c) { c.block(c.self, 7); },
    },
    'drawer-slam': {
      id: 'drawer-slam', name: 'Drawer Slam', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + beastRec(c),
      tell: 'It slams a drawer the size of a door.',
      effect(c) { hitPlayer(c, 8 + beastRec(c)); },
    },
  },

  /** §9: Indexed response, Drawer Slam, Indexed response, Drawer Slam. */
  nextMove: (c) => {
    if ((c.history || []).length % 2 === 1) return 'drawer-slam';
    const t = mem(c).indexed;
    if (t === 'attack') return 'defensive-filing';
    if (t === 'skill') return 'overdue-charge';
    if (t === 'power') return 'permanent-record';
    return 'reorganize';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.strictConfusion = true;
      h.notes.push('Haunt 8: it is only Confused if you play all three types AND none is more than half the turn.');
    }
    return h;
  },
};

function announceBeast(c) {
  const t = mem(c).indexed;
  const WORD = { attack: 'Attacks', skill: 'Skills', power: 'Powers' };
  const party = (c.partySize ? c.partySize() : 1) > 1;
  c.announceRule({
    id: `index:${c.self.id}`,
    name: t ? `Indexed: ${WORD[t]}` : 'Confused',
    text: t
      ? 'Attacks make it defend, Skills make it charge, Powers make it stronger for good. It files whatever you played most.'
      : (party
        ? 'No Trick type was more than half of the round, so it can only reorganise itself.'
        : 'You played all three types, so it can only reorganise itself.'),
  });
}

export const STUDY_LIBRARY_ENEMIES = [
  bookBat, inkblot, paperKnight, bookmarkImp, quillClerk, indexBeast,
];
export const STUDY_LIBRARY_REGION = REGION;
