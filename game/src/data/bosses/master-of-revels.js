/**
 * The Master of Revels — the Ballroom boss. OWNER: enemies.
 * Source of truth: docs/design/regions/10-ballroom.md §16–§26.
 *
 * "It considers the mansion's captives HONORED GUESTS. Its philosophy is: if
 * someone is comfortable enough, why would they ever want to leave?" (§16.)
 *
 * §16 calls that "a direct expression of the mansion's central flaw", and it is
 * the sharpest version of it in the game: the Butler wants you to behave, the
 * Archivist wants you catalogued, the Keeper wants you safe — this one wants you
 * to have a lovely time, and means it.
 *
 * ── THE PLAYER PACES THIS FIGHT ─────────────────────────────────────────────
 *
 * §22 is titled "phase one decision structure" and its worked example is four
 * turns of the player choosing their own Revelry curve. §20 then gives them a
 * way back down: 25 damage in a turn Spoils the Mood and takes one off. So a
 * high-damage deck can afford to accept more, and a slow scaling deck should
 * refuse more — the boss is "partially player paced" in its own words.
 *
 * Every offer is an Invitation Trick (see `ballroom.js`): a 0-cost `ethereal`
 * card in hand, playing it is Accept, letting it expire is Decline.
 *
 * ── AND ITS PUNISHMENT IS STILL A GIFT ──────────────────────────────────────
 *
 * §19: Never Leave hits for 18 and applies a status whose FIRST half is a
 * discount. "Even the boss's punishment still contains a small benefit. That
 * makes the whole region feel seductively strange rather than purely punitive."
 * That is the region's thesis in one move and it is worth not sanding off.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, isAlive, dmgTaken,
} from '../enemies/_lib.js';
import { offer, accepted, takeBack } from '../enemies/ballroom.js';

const REGION = 'ballroom';
const SOLO_MAX = 375;
const PHASE_TWO_AT = 215;

const revelry = (c) => cnt(c, 'revelry');
/** §18's 4-Revelry threshold, read by every damaging move. */
const revel = (c) => (revelry(c) >= 4 ? 2 : 0) + bossDmg(c);

/* ══ the two guests (§24, §25) ═══════════════════════════════════════════════ */

/**
 * §24. The Admirer makes every offer better AND doubles what it costs you.
 * §25. The Chaperone punishes refusing.
 *
 * Between them they turn phase two into a stated choice: "kill the Chaperone if
 * planning to refuse many offers, kill the Admirer if tempted by powerful
 * offers, ignore both and race the Master."
 */
export const theAdmirer = {
  id: 'the-admirer',
  name: 'The Admirer',
  region: REGION,
  tier: 'boss',
  role: 'bossPart',
  partOf: 'master-of-revels',
  hp: [28, 28],
  silhouette: 'admirer',
  palette: ['#e8d3dc', '#a9607c', '#2a141c'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.6,
  lore: 'A guest who has been watching you all evening and thinks everything you do is wonderful.',
  moves: {
    admire: {
      id: 'admire', name: 'Admiring', intent: Intent.SLEEP,
      tell: 'While it watches, every offer is better — and worth 2 Revelry instead of 1.',
      effect() {},
    },
  },
  nextMove: () => 'admire',
  hauntScaling(level) { return hauntBase(level, 'boss'); },
};

export const theChaperone = {
  id: 'the-chaperone',
  name: 'The Chaperone',
  region: REGION,
  tier: 'boss',
  role: 'bossPart',
  partOf: 'master-of-revels',
  hp: [32, 32],
  silhouette: 'chaperone',
  palette: ['#2a2430', '#8f89a0', '#12101a'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 0.7,
  lore: 'A guest who is keeping count of how many times you have said no.',

  onSpawn(c) { setCnt(c, 'disapproval', 0); },

  moves: {
    watch: {
      id: 'watch', name: 'Disapproving', intent: Intent.SLEEP,
      tell: 'Every offer you refuse is 1 Disapproval. At 2 it takes 7 out of you.',
      effect() {},
    },
    tut: {
      id: 'tut', name: 'A Pointed Silence', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It has noticed that you keep saying no.',
      effect(c) { hitPlayer(c, 7); setCnt(c, 'disapproval', 0); },
    },
  },
  nextMove: (c) => (cnt(c, 'disapproval') >= 2 ? 'tut' : 'watch'),
  hauntScaling(level) { return hauntBase(level, 'boss'); },
};

/* ══ the boss ════════════════════════════════════════════════════════════════ */
const BANQUET = [
  ['plate', 'The Plate', 'recover 6 Courage', { h: 6 }, { h: 9 }],
  ['goblet', 'The Goblet', 'lose 4 Courage and gain 2 Nerve this turn', { c: 4, n: 2 }, { c: 4, n: 3 }],
  ['dance-card', 'The Dance Card', 'draw 2 Tricks', { d: 2 }, { d: 3 }],
];

export const masterOfRevels = {
  id: 'master-of-revels',
  name: 'The Master of Revels',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'revels',
  palette: ['#7a1225', '#f0dfc4', '#1b0810'],
  shape: { body: 'tall-thin', limbs: 3, eyes: 0 },
  scale: 1.9,
  lore: 'A crimson tailcoat and a porcelain smile. Its face changes under the mask now and then, never quite enough to show you what is there. A silver tray in one hand and a conductor\'s baton in the other, and the music does what the baton says.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.spoiled = false;
    m.pending = null;
    setCnt(c, 'revelry', flag(c, 'openRevelry', 0));
    // §21: "The Plate is offered first. This gives the player an immediately
    // understandable low risk bargain."
    m.pending = 'plate';
    announceBanquet(c);
  },

  /**
   * §17: "at the beginning of certain PLAYER turns, one becomes available."
   * `onPlayerReady` rather than `onPlayerTurnStart`, because the offer is a card
   * and there is no hand until step 6c — the same rule the Library's Misfiled
   * and the Head Gardener's Binding Vine are built on.
   */
  onPlayerReady(c) {
    const m = mem(c);
    m.spoiled = false;
    if (!m.pending) return;
    const which = m.pending;
    m.pending = null;
    const row = BANQUET.find(b => b[0] === which) || BANQUET[0];
    const boosted = !!allies(c).find(a => a.defId === 'the-admirer' && isAlive(a));
    const [id, name, what, nums, big] = row;
    offer(c, id, boosted ? big : nums);
    mem(c).boosted = boosted;
    c.announceRule({
      id: `offer:${c.self.id}`,
      name: `The Banquet: ${name}${boosted ? ' (enhanced)' : ''}`,
      text: `It is in your hand. Play it to ACCEPT — ${what}${boosted ? ', improved by the Admirer' : ''} — `
        + `and the Master gains ${boosted ? 2 : 1} Revelry. Leave it and it expires. `
        + (boosted ? 'Killing the Admirer ends the enhancement permanently. ' : '')
        + 'Refusing is free unless the Chaperone is watching.',
    });
  },

  onCardPlayed(c) {
    if (!accepted(c)) return;
    takeBack(c);
    addCnt(c, 'revelry', mem(c).boosted ? 2 : 1, 8);
    // §18's 2-Revelry threshold: "gain 5 Guard whenever an offer is accepted."
    if (revelry(c) >= 2) c.block(c.self, 5);
    announceBanquet(c);
  },

  /** §25: a refusal is what the Chaperone is counting. */
  onPlayerTurnEnd(c) {
    if (!takeBack(c)) return;
    const chap = allies(c).find(a => a.defId === 'the-chaperone' && isAlive(a));
    if (chap) (chap.counters ||= {}).disapproval = Math.min(2, (chap.counters.disapproval || 0) + 1);
  },

  /** §20's Spoiling the Mood, resolved as the threshold is crossed. */
  onDamaged(c) {
    const m = mem(c);
    if (m.spoiled || dmgTaken(c) < 25 || revelry(c) <= 0) return;
    m.spoiled = true;
    addCnt(c, 'revelry', -1, 8, 0);
    c.say('The music skips.', 'warn');
    announceBanquet(c);
  },

  /** §18's 6-Revelry threshold. */
  onTurnStart(c) { if (revelry(c) >= 6) c.block(c.self, 6); },

  moves: {
    /* ── phase one (§21) ──────────────────────────────────────────────────── */
    toast: {
      id: 'toast', name: 'Toast', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => (revelry(c) >= 4 ? 13 : 11) + bossDmg(c),
      tell: 'It raises the tray to you and the room raises everything it is holding.',
      effect(c) { hitPlayer(c, (revelry(c) >= 4 ? 13 : 11) + bossDmg(c)); },
    },
    'invitation-to-dance': {
      id: 'invitation-to-dance', name: 'Invitation to Dance', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + revel(c),
      tell: 'The baton comes round and the floor clears for you.',
      effect(c) { hitPlayer(c, 5 + revel(c), 2); mem(c).pending = 'dance-card'; announceBanquet(c); },
    },
    'dinner-is-served': {
      id: 'dinner-is-served', name: 'Dinner Is Served', intent: Intent.DEFEND, block: 10,
      tell: 'Every table in the room refills itself at once.',
      effect(c) { c.block(c.self, 10); mem(c).pending = 'plate'; announceBanquet(c); },
    },
    'raise-your-glass': {
      id: 'raise-your-glass', name: 'Raise Your Glass', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + revel(c),
      tell: 'It looks at a goblet until there is one in your hand.',
      effect(c) { hitPlayer(c, 7 + revel(c)); mem(c).pending = 'goblet'; announceBanquet(c); },
    },

    /* ── §19 ──────────────────────────────────────────────────────────────── */
    'never-leave': {
      id: 'never-leave', name: 'Never Leave', intent: Intent.ATTACK_DEBUFF, damage: 18, hits: 1,
      damageFn: (c) => 18 + revel(c),
      applies: [{ id: 'well-hosted', stacks: 1, to: 'player' }],
      tell: 'It takes your coat, very gently, and puts it somewhere you will not find it.',
      effect(c) {
        hitPlayer(c, 18 + revel(c));
        c.applyStatus(c.player, 'well-hosted', 1);
        // "Then: reduce Revelry from 8 to 5."
        setCnt(c, 'revelry', 5);
        announceBanquet(c);
      },
    },

    /* ── the transition (§23) ─────────────────────────────────────────────── */
    'the-party-is-just-beginning': {
      id: 'the-party-is-just-beginning', name: 'The Party Is Just Beginning',
      intent: Intent.SUMMON, anchored: true,
      tell: 'It claps twice and two more guests are suddenly and obviously always to have been there.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        c.self.block = 0;                     // "Remove all Guard." Revelry stays.
        c.summon('the-admirer');
        c.summon('the-chaperone');
        c.say('The party is just beginning.', 'warn');
        announceBanquet(c);
      },
    },

    /* ── phase two (§26) ──────────────────────────────────────────────────── */
    'grand-waltz': {
      id: 'grand-waltz', name: 'Grand Waltz', intent: Intent.ATTACK, damage: 6, hits: 3,
      damageFn: (c) => 6 + revel(c),
      tell: 'The whole room turns at once and you are somehow in the middle of it.',
      effect(c) {
        const d = 6 + revel(c);
        hitPlayer(c, d, 2);
        // "If Revelry is 4 or more, the FINAL hit deals 4 additional damage."
        hitPlayer(c, d + (revelry(c) >= 4 ? 4 : 0));
      },
    },
    'more-for-everyone': {
      id: 'more-for-everyone', name: 'More for Everyone', intent: Intent.DEFEND, block: 12,
      tell: 'It sees that somebody has an empty hand and fixes it.',
      effect(c) {
        c.block(c.self, 12);
        for (const a of allies(c)) {
          if (isAlive(a) && (a.defId === 'the-admirer' || a.defId === 'the-chaperone')) c.block(a, 7);
        }
      },
    },
    'dont-be-shy': {
      id: 'dont-be-shy', name: 'Don\'t Be Shy', intent: Intent.BUFF,
      tell: 'It will not take no for an answer, but it will take a while asking.',
      effect(c) {
        /* §26: "offer one random Banquet option IMMEDIATELY during the enemy
           turn. The player chooses before the next player turn begins. If
           accepted, the normal benefit is DEFERRED until the start of the
           player's turn."
           There is no hand during the enemy phase — so the offer is queued and
           lands at `onPlayerReady` like every other one. The deferral §26 asks
           for is what the engine does anyway. */
        mem(c).pending = BANQUET[c.rng.int(BANQUET.length)][0];
        announceBanquet(c);
      },
    },
    'hosts-privilege': {
      id: 'hosts-privilege', name: 'Host\'s Privilege', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
      damageFn: (c) => 15 + revel(c),
      tell: 'It stops being a host for a moment.',
      effect(c) {
        hitPlayer(c, 15 + revel(c));
        // "If Revelry is 6 or more, reduce Revelry by 1 and recover 8 Courage."
        if (revelry(c) >= 6) { addCnt(c, 'revelry', -1, 8, 0); c.heal(c.self, 8); announceBanquet(c); }
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'the-party-is-just-beginning';
    // §18: 8 Revelry makes it the Perfect Host, and its next action is Never Leave.
    if (revelry(c) >= 8) return 'never-leave';
    if (m.phase === 2) {
      return cyc(['grand-waltz', 'more-for-everyone', 'dont-be-shy', 'hosts-privilege'],
        (c.history || []).filter(x => x !== 'never-leave').length);
    }
    return cyc(['dinner-is-served', 'toast', 'invitation-to-dance', 'toast', 'raise-your-glass'],
      (c.history || []).filter(x => x !== 'never-leave').length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openRevelry = 1;
      h.counters.revelry = 1;
      h.notes.push('Haunt 10: it opens with 1 Revelry, so the first Plate can push you straight to a threshold.');
    }
    return h;
  },
};

function announceBanquet(c) {
  const r = revelry(c);
  const marks = [];
  if (r >= 2) marks.push('2: it gains 5 Guard for every offer you take');
  if (r >= 4) marks.push('4: its damaging moves deal 2 more');
  if (r >= 6) marks.push('6: it gains 6 Guard at the start of its turn');
  if (r >= 8) marks.push('8: PERFECT HOST — its next action is Never Leave');
  c.announceRule({
    id: `revels:${c.self.id}`,
    name: `Revelry ${r} / 8`,
    text: (marks.length ? `${marks.join('. ')}. ` : 'Nothing yet. Thresholds at 2, 4, 6 and 8. ')
      + 'Deal it 25 in one turn to Spoil the Mood and take one back. '
      + 'You set this dial yourself — a fast deck can afford to accept more.',
  });
}

export const BALLROOM_BOSSES = [masterOfRevels, theAdmirer, theChaperone];
