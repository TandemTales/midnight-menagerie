/**
 * Companion keyword + status registry.  OWNER: companion-cards.
 *
 * `data/keywords.js` belongs to combat-engine, so every keyword and status that
 * only exists because of a Companion's signature mechanic is declared here and
 * merged in by the engine:
 *
 *     import { COMPANION_KEYWORDS, COMPANION_STATUSES } from './companions/keywords.js';
 *     registerKeywords(COMPANION_KEYWORDS);
 *     registerStatuses(COMPANION_STATUSES);
 *
 * KEYWORDS are tooltip entries — card text writes them as `[Ghoststep]`.
 * STATUSES are live combat objects with stacks and hooks.  Several of them are
 * pure counters with no behaviour (Lives, Height, Globs, Open Eyes): they exist so
 * the status row can display them and so `ctx.count()` can read them.
 *
 * Hook names beyond the StatusDef set documented in schema.js are marked EXTRA.
 * They are listed in ENGINE_HOOKS_REQUIRED at the bottom of this file.
 *
 * ── Writing a hook here ─────────────────────────────────────────────────────
 * The payload a hook receives is built by `combat/hooks.js _payload()` and its
 * exact contents are listed at the top of that file. Call those methods
 * DIRECTLY — never `h.something?.()`. Every one of the statuses below used to
 * reach for a helper the payload did not have (`loseHp`, `fire`, `count`,
 * `spend`, `survive`) or read a field it did not carry (`isAttack`,
 * `fromAttack`, `slowDissipation`); the optional chains turned all of it into
 * silence and Haunt dealt zero damage for the whole build. See CONTRACTS rule 8.
 *
 * Two payload shapes appear here and they are NOT interchangeable:
 *   value reducers  (amt, h) => number     modifyDamageDealt / Taken, modifyBlockGain
 *   void hooks      (h) => void            everything else, including onIncomingHit
 * `onIncomingHit` is a VOID hook with a mutable payload: read `h.amount`, then
 * call `h.setAmount(n)` or `h.prevent()`. Writing it as `(amt, h)` — which
 * Play Dead did — makes `h` undefined and the hook throws on its first line.
 *
 * Anything that has to touch a Companion RESOURCE (Lives, Loose Bones…) goes
 * through the same `_util.js` helpers the cards use, so a resource behaves
 * identically whether an engine counter track or a status is backing it.
 */

import { trackerCtx, fire as fireCompanionHook, res, addRes, spendRes,
  flag as cardFlag, stacks, apply as applyTo, unapply as unapplyFrom } from './_util.js';

/** A card-shaped ctx for a hook, so the `_util` resource helpers work in here. */
function uctx(h) { return trackerCtx(h.e); }

/** Does this runtime card carry a keyword? */
function hasKw(card, id) {
  const k = card && (card.keywords || card.def?.keywords);
  return Array.isArray(k) && k.includes(id);
}

/** Hooks for a "your next matching Trick costs {n} less" status. */
/**
 * `applies` is handed the hook payload as well as the card and the engine, so a
 * discount that depends on how much has been played can ask about the SEAT that
 * owns it (`h.player`) rather than the table. Midnight Zoomies read
 * `e.stats.cardsPlayedThisTurn` and therefore switched itself on in co-op when
 * the OTHER Kid played two Tricks.
 */
function discountHooks(applies) {
  return {
    modifyCardCost: (cost, h) => (h.card && applies(h.card, h.e, h)
      ? Math.max(0, cost - (h.stacks || 0)) : cost),
    onCardPlayed: (h) => { if (h.card && applies(h.card, h.e, h)) h.remove(); },
  };
}

// ── keyword tooltips ────────────────────────────────────────────────────────
const K = (id, name, desc, extra) => ({ id, name, desc, ...(extra || {}) });

export const COMPANION_KEYWORDS = [
  // shared vocabulary
  K('vanish', 'Vanish', 'Remove this Trick from the combat after it resolves. Midnight Menagerie’s word for Exhaust.'),
  K('retain', 'Retain', 'This Trick is not discarded at the end of your turn.'),
  K('innate', 'Innate', 'This Trick starts in your opening hand.'),
  K('ethereal', 'Ethereal', 'If this Trick is in your hand at the end of your turn, it Vanishes.'),
  K('empowered', 'Empowered', 'Your next Attack this turn deals additional damage.'),

  // ── Marmalade ─────────────────────────────────────────────────────────────
  K('ghoststep', 'Ghoststep', 'Each stack prevents the next hit of enemy Attack damage entirely. Unused Ghoststep expires at the end of the enemy turn. It is not Guard — one stack can eat a 30 damage hit, but six small hits eat six stacks.', { companion: 'marmalade' }),
  K('haunt', 'Haunt', 'When a Haunted enemy takes a damaging action, it loses Courage equal to its Haunt, then loses half its Haunt, rounded up.', { companion: 'marmalade' }),
  K('lives', 'Lives', 'Marmalade begins every combat with 9 Lives. Lives are a combat resource, not Courage. Certain Tricks spend them. They do not return until the next battle.', { companion: 'marmalade' }),
  K('zoomies', 'Zoomies', 'This effect activates if this is the third or later Trick you have played this turn.', { companion: 'marmalade' }),
  K('untouched', 'Untouched', 'Active while you lost no Courage during the previous enemy turn.', { companion: 'marmalade' }),

  // ── Bones ─────────────────────────────────────────────────────────────────
  K('loose-bones', 'Loose Bones', 'How much of Bones is currently detached. 0 to 6. Loose Bones vanish after combat.', { companion: 'bones' }),
  K('shed', 'Shed', 'Increase Loose Bones, to a maximum of 6.', { companion: 'bones' }),
  K('reattach', 'Reattach', 'Reduce Loose Bones. As a cost, you must have enough Loose Bones to pay it.', { companion: 'bones' }),
  K('whole', 'Whole', 'You are Whole while you have exactly 0 Loose Bones.', { companion: 'bones' }),
  K('scattered', 'Scattered', 'You are Scattered while you have 4 or more Loose Bones.', { companion: 'bones' }),
  K('rattle', 'Rattle', 'A Rattle happens whenever your Loose Bones actually change. Changing three at once is one Rattle. Shedding and then Reattaching is two.', { companion: 'bones' }),
  K('fetch', 'Fetch', 'Return an eligible Trick from your discard pile to your hand. This is not drawing. A Fetched Trick becomes Slobbered.', { companion: 'bones' }),
  K('slobbered', 'Slobbered', 'A Slobbered Trick cannot be Fetched again this combat. It can still be drawn, played, discarded or Buried.', { companion: 'bones' }),
  K('bury', 'Bury', 'Place a Trick in the Buried zone with 2 counters. It loses 1 counter at the start of your turn, and is Dug Up when the last one goes. Buried Tricks cannot be drawn, played, discarded or Fetched.', { companion: 'bones' }),
  // `[Bury]ed` used to render as "Buryed" — the renderer strips the brackets and the
  // suffix lands on the stem. Cards say `[Buried]`, which needs its own entry.
  K('buried', 'Buried', 'A Trick in the Buried zone. It loses 1 counter at the start of your turn and is Dug Up when the last one goes. Buried Tricks cannot be drawn, played, discarded or Fetched.', { companion: 'bones' }),
  K('dig-up', 'Dig Up', 'Return a Trick from the Buried zone to your hand. This is not drawing or Fetching, and it does not Slobber the Trick. It gains a Dug Up marker until it is next played.', { companion: 'bones' }),
  K('dug-up', 'Dug Up', 'This Trick came out of the ground and has not been played since.', { companion: 'bones' }),

  // ── Pipkin ────────────────────────────────────────────────────────────────
  K('height', 'Height', 'How far off the ground Pipkin has bounced, 0 to 3. Height does nothing on its own and disappears at the end of your turn.', { companion: 'pipkin' }),
  K('hop', 'Hop', 'Gain 1 Height, to a maximum of 3.', { companion: 'pipkin' }),
  K('land', 'Land', 'Spend all your Height and resolve this clause using the amount spent. With 0 Height the Land clause does not resolve.', { companion: 'pipkin' }),
  K('patch', 'The Patch', 'Pipkin’s private garden. Up to 6 objects. At the end of your turn every Sprout becomes a Pumpkin and every Seed becomes a Sprout.', { companion: 'pipkin' }),
  K('seed', 'Seed', 'The first Patch stage. Becomes a Sprout at the next growth step.', { companion: 'pipkin' }),
  K('sprout', 'Sprout', 'The middle Patch stage. Becomes a Pumpkin at the next growth step.', { companion: 'pipkin' }),
  K('pumpkin', 'Pumpkin', 'The mature Patch stage. Does nothing until something Harvests it — its purpose is decided by the Trick that takes it.', { companion: 'pipkin' }),
  K('plant', 'Plant', 'Add that many Seeds to the Patch, up to its capacity.', { companion: 'pipkin' }),
  K('harvest', 'Harvest', 'Remove up to that many Pumpkins from the Patch to power an effect. Harvesting is optional.', { companion: 'pipkin' }),
  K('plump', 'Plump', 'How round Pipkin is, 0 to 3. Plump persists between turns.', { companion: 'pipkin' }),
  K('heavy-feet', 'Heavy Feet', 'While at maximum Plump, Tricks containing Hop cost 1 more Nerve. A Trick that Hops twice is still only taxed once.', { companion: 'pipkin' }),
  K('deflate', 'Deflate', 'Spend that much Plump. If you do not have enough, the clause cannot be used.', { companion: 'pipkin' }),

  // ── Taffy ─────────────────────────────────────────────────────────────────
  K('glob', 'Globs', 'Pieces of Taffy that have separated from her body, 0 to 6. Globs cannot pay Trick costs.', { companion: 'taffy' }),
  K('split', 'Split', 'Gain that many Globs, to a maximum of 6.', { companion: 'taffy' }),
  K('recombine', 'Recombine', 'Spend that many Globs.', { companion: 'taffy' }),
  K('runny', 'Runny', 'At 5 or 6 Globs Taffy is Runny and loses a little Courage at the end of each enemy turn. Once per enemy turn, not once per Glob.', { companion: 'taffy' }),
  K('stretch', 'Stretch', 'A Stretched Trick Retains and gains 1 Stretch at the end of each of your turns, to a maximum of 3. All Stretch is removed when it is played.', { companion: 'taffy' }),
  K('belly', 'Belly', 'Taffy’s storage zone, normally 2 slots. Absorbed Tricks leave deck circulation but keep every modification and return after combat.', { companion: 'taffy' }),
  K('absorb', 'Absorb', 'Place a Trick face up in the Belly.', { companion: 'taffy' }),
  K('spit-out', 'Spit Out', 'Move a Trick from the Belly to your hand, or to your discard pile if your hand is full.', { companion: 'taffy' }),
  K('gummy', 'Gummy', 'A temporary replica. It copies the original’s text and current cost, starts at 0 Stretch, has Vanish, and cannot be copied or Absorbed.', { companion: 'taffy' }),
  K('chewed', 'Chewed', 'A Gummy copy that survived one play. It Vanishes the next time it is played, and Chewed can never be removed.', { companion: 'taffy' }),

  // ── Wink ──────────────────────────────────────────────────────────────────
  K('preview', 'Preview', 'Reveal that many additional future Intent positions for an enemy, to a depth of three.', { companion: 'wink' }),
  K('read', 'Read', 'Predict an Intent Family for an enemy’s future position. Correct: Open 1 Eye. Wrong: Close 1 Eye. A Read stays attached to the position, not the action.', { companion: 'wink' }),
  K('blind-read', 'Blind Read', 'A Read placed on a position that was still hidden. Its Blind status is remembered even if you Preview it afterwards.', { companion: 'wink' }),
  K('intent-family', 'Intent Family', 'Every Intent is exactly one of Attack, Defense, Scheme or Special.', { companion: 'wink' }),
  K('eye', 'Eyes', 'Wink has eight supernatural eyes. Opening and Closing them costs no Nerve. Eyes persist between turns, and a Trick that Closes Eyes as a cost needs enough Open ones to pay.', { companion: 'wink' }),
  K('open-eyes', 'Open Eyes', 'Wink has eight eyes and begins combat with 3 Open. Eyes persist between turns and cost no Nerve to open or close.', { companion: 'wink' }),
  K('full-gaze', 'Full Gaze', 'Active at 8 Open Eyes. No automatic benefit — specific Tricks reward it.', { companion: 'wink' }),
  K('web', 'Web', 'A persistent resource attached to an enemy. Web does nothing by itself; Wink’s Tricks spend it to rearrange, postpone, attack or defend.', { companion: 'wink' }),
  K('set', 'Set', 'Place this Trick face up outside your deck, in one of 3 Set slots. It resolves automatically and for free when its trigger occurs.', { companion: 'wink' }),
  K('anchored', 'Anchored', 'An Anchored Intent can be Previewed and Read, but never swapped, postponed or deleted.', { companion: 'wink' }),
  K('reorder', 'Reorder', 'Change when an enemy action happens. Reordering never erases the action.', { companion: 'wink' }),

  K('awareness', 'Awareness', 'Every enemy is Aware, Unaware or Suspicious of Boggle, one state each, tracked separately per enemy.', { companion: 'boggle' }),
  K('unaware', 'Unaware', 'This enemy does not know where Boggle is. A directed Attack aimed only at him becomes [Search] instead. Room-wide Attacks still land, and non-Attack actions do not break it.', { companion: 'boggle' }),
  K('suspicious', 'Suspicious', 'This enemy is watching for Boggle and cannot be made Unaware. It stops being Suspicious after it takes its next action.', { companion: 'boggle' }),
  K('search', 'Search', 'What an Unaware enemy does instead of a directed Attack: no Courage damage, the whole Attack is replaced, it gains 2 [Fright], and it becomes [Suspicious].', { companion: 'boggle' }),
  K('ambush', 'Ambush', 'This bonus applies if the target is [Unaware] when the Trick begins. It stays Unaware until the whole Trick has finished resolving, and normally becomes [Suspicious] afterwards.', { companion: 'boggle' }),
  K('fright', 'Fright', 'A persistent resource stored on an enemy. Fright does nothing by itself and never expires — it is spent by [Scare] clauses.', { companion: 'boggle' }),
  K('scare', 'Scare', 'Scare N checks the target for at least N [Fright]. If it has that much, remove N and resolve the Scare effect; if not, the rest of the Trick still happens.', { companion: 'boggle' }),
  K('lurk', 'Lurk', 'Boggle gains 1 Lurk at the end of his turn if any living enemy is [Unaware]. It starts at 0, caps at 5, and never decays on its own.', { companion: 'boggle' }),

  K('stuffing', 'Stuffing', 'Mopsy starts each combat with 3 and holds at most 6. It is both her crafting material and her armour, and spending it aggressively is what makes her fragile.', { companion: 'mopsy' }),
  K('cushion', 'Cushion', 'Once each enemy turn, when an Attack would cost Mopsy Courage after Guard, she may spend 1 [Stuffing] to halve that loss, rounding up. Much better against one big hit than against several small ones, and unavailable while [Hollow].', { companion: 'mopsy' }),
  K('plump', 'Plump', 'A condition, not a buff: Mopsy is Plump at 5 or 6 [Stuffing].', { companion: 'mopsy' }),
  K('hollow', 'Hollow', 'A condition, not a buff: Mopsy is Hollow at 0 [Stuffing]. Several Tricks want it, but she cannot [Cushion] while empty.', { companion: 'mopsy' }),
  K('patch', 'Patch', 'A modification sewn onto one Trick, adding a line of rules text. It rides with the Trick between every pile, and it is gone when combat ends.', { companion: 'mopsy' }),
  K('stitch', 'Stitches', 'What holds a [Patch] on. A new Patch has 2, loses 1 each time it triggers, and falls off at 0. Four is the most any Patch can hold.', { companion: 'mopsy' }),
  K('reinforce', 'Reinforce', 'Add 1 [Stitch] to a Patch, to a maximum of 4.', { companion: 'mopsy' }),
  K('tear', 'Tear', 'Move a Trick to your [Torn] pile for the rest of combat. It keeps its [Patch]es, it has not Vanished, and it comes back to your deck after the fight.', { companion: 'mopsy' }),
  K('mend', 'Mend', 'Bring a Trick back from the [Torn] pile — to your discard pile unless the Trick says otherwise. The same Trick cannot be Mended twice in one turn.', { companion: 'mopsy' }),
  K('torn', 'Torn', 'Mopsy\u2019s fifth pile. Torn Tricks cannot be drawn or played until something [Mend]s them.', { companion: 'mopsy' }),
  K('scrap', 'Scrap', 'A temporary 0-Nerve Trick: gain 1 [Stuffing], or [Reinforce] a Patch in your hand. [Vanish].', { companion: 'mopsy' }),

  K('glow', 'Glow', 'Wisp starts each combat with 0 and holds at most 6. It is not Nerve and cannot pay costs.', { companion: 'wisp' }),
  K('bright', 'Bright', 'A condition, not a buff: Wisp is Bright at 3 or more [Glow].', { companion: 'wisp' }),
  K('blazing', 'Blazing', 'A condition, not a buff: Wisp is Blazing at 6 or more [Glow] — as much as she can normally hold.', { companion: 'wisp' }),
  K('linger', 'Linger X', 'Instead of being discarded, this Trick goes face up into the [Gloaming] with X countdown counters.', { companion: 'wisp' }),
  K('gloaming', 'The Gloaming', 'Wisp’s delayed-Trick zone, outside hand, draw pile and discard. Anything there is out of circulation.', { companion: 'wisp' }),
  K('afterglow', 'Afterglow', 'The delayed effect on a [Linger]ing Trick. It resolves when the countdown hits 0, and it is NOT a Trick being played.', { companion: 'wisp' }),
  K('converge', 'Converge', 'Two or more [Afterglow]s resolving in the same batch. One Convergence per batch, however many are involved.', { companion: 'wisp' }),
  K('hasten', 'Hasten X', 'Reduce a [Linger]ing Trick’s countdown by X. At 0 its [Afterglow] resolves.', { companion: 'wisp' }),
  K('delay', 'Delay X', 'Increase a countdown by X. Not a penalty — several of Wisp’s Tricks want the extra time.', { companion: 'wisp' }),
  K('flare', 'Flare X', 'You may spend X [Glow] for the listed extra effect. Optional unless the Trick says otherwise.', { companion: 'wisp' }),

  K('appetite', 'Appetite', 'A 0-6 track. It starts at 2 and drops by 1 at the end of every turn. Both ends of it pay.', { companion: 'crumbula' }),
  K('hungry', 'Hungry', 'A condition, not a buff: 0 or 1 [Appetite]. Where the aggressive half of the Count lives.', { companion: 'crumbula' }),
  K('sated', 'Sated', 'A condition, not a buff: 4 or more [Appetite]. Where the safe half lives.', { companion: 'crumbula' }),
  K('bite-mark', 'Bite Mark', 'A stacking enemy status that does nothing by itself — a prepared meal waiting to be eaten. Lost if the enemy dies.', { companion: 'crumbula' }),
  K('feed', 'Feed X', 'Remove up to X [Bite Mark]s from an enemy. Each restores Courage and raises [Appetite] by 1, one mark at a time.', { companion: 'crumbula' }),
  K('queasy', 'Queasy', 'Eating past maximum [Appetite]. One per Feed however far past it goes, stacking to 2, and it costs that much Nerve next turn.', { companion: 'crumbula' }),
  K('indulge', 'Indulge', 'Voluntarily lose Courage. It ignores Guard, it counts as Courage lost, it is not enemy damage, and it can never take him below 1.', { companion: 'crumbula' }),
  K('leftover', 'Leftover', 'A temporary 0-Nerve Trick that [Feed]s 1 with no enemy needed. It Retains, then [Vanish]es.', { companion: 'crumbula' }),

  K('shadow-pocket', 'Shadow Pocket', 'Hush’s second zone. Three Tricks, they survive the end of the turn, they do not count as hand size, and he can play them straight out of it.', { companion: 'hush' }),
  K('stash', 'Stash', 'Move a Trick from your hand into the [Shadow Pocket]. Stashing is not playing it.', { companion: 'hush' }),
  K('scurry', 'Scurry', 'A deliberate move of one of your Tricks between hand, draw pile, discard pile and [Shadow Pocket]. Drawing is not a Scurry, and neither is ordinary discarding.', { companion: 'hush' }),
  K('unseen', 'Unseen', 'It is not armour. It breaks when Hush loses Courage to an Attack — Guard absorbing the whole hit leaves him hidden — or when he plays an Attack.', { companion: 'hush' }),
  K('pilfer', 'Pilfer', 'Read an enemy’s current Intent and put the matching temporary [Contraband] into your [Shadow Pocket].', { companion: 'hush' }),
  K('contraband', 'Contraband', 'A temporary Trick stolen from an enemy’s Intent. It ceases to exist once played, and it never [Scurry]s.', { companion: 'hush' }),

  K('quills', 'Quills', 'The spines actually attached to Truffle. He starts each combat with 6 and holds 12.', { companion: 'truffle' }),
  K('loose-quill', 'Loose Quills', 'Shed Quills, lying about the room with no maximum. [Gather] picks them up; several Tricks fire them.', { companion: 'truffle' }),
  K('shed', 'Shed X', 'Move X [Quills] off Truffle and onto the floor as [Loose Quill]s.', { companion: 'truffle' }),
  K('gather', 'Gather X', 'Pick up to X [Loose Quill]s back onto Truffle. Never past his maximum; the rest stay on the floor.', { companion: 'truffle' }),
  K('regrow', 'Regrow X', 'Grow up to X new [Quills]. It does not consume [Loose Quill]s and cannot exceed his maximum.', { companion: 'truffle' }),
  K('bristle', 'Bristle X', 'NOT "when attacked". When an enemy Attack actually costs Truffle Courage after Guard: consume 1, [Shed] 1, and hit that attacker back. One Attack action triggers it once, however many hits it has.', { companion: 'truffle' }),
  K('ragged', 'Ragged', 'At or below half his maximum Courage. No benefit on its own — individual Tricks are stronger for it.', { companion: 'truffle' }),

  // ── Drizzle ───────────────────────────────────────────────────────────────
  K('weather', 'Weather', 'One state for the WHOLE combat, not for one Kid: Clear → Sprinkle → Downpour → Thunderstorm. Downpour re-[Soak]s every enemy at the start of her turn; Thunderstorm [Soak]s on entry and collapses on its own.', { companion: 'drizzle' }),
  K('advance', 'Advance', 'Move [Weather] one step toward Thunderstorm. It never goes past it.', { companion: 'drizzle' }),
  K('ease', 'Ease', 'Move [Weather] one step back toward Clear. Letting up is often the correct play.', { companion: 'drizzle' }),
  K('stormbreak', 'Stormbreak', 'Thunderstorm collapsing to Clear — automatically at the end of an enemy turn spent in it, or forced by a Trick. It counts as [Weather] changing and as entering Clear, and it does NOT dry anything, because that enemy turn did not begin in Clear.', { companion: 'drizzle' }),
  K('soaked', 'Soaked', 'A yes-or-no condition on an enemy that does nothing by itself. It is what makes an enemy part of the weather. It dries at the end of an enemy turn that BEGAN in Clear.', { companion: 'drizzle' }),
  K('soak', 'Soak', 'Make an enemy [Soaked]. Soaking something already [Soaked] changes nothing — several Tricks pay you for finding it that way.', { companion: 'drizzle' }),
  K('conduct', 'Conduct', 'A marked effect that fires only if the primary target is [Soaked], then repeats against every OTHER [Soaked] enemy. During Thunderstorm the first Conduct of your turn also repeats once on the primary.', { companion: 'drizzle' }),
  K('forecast', 'Forecast', 'Park this Trick face up outside your deck in one of three slots, waiting for a [Weather] state or a [Stormbreak]. It resolves for free when that state is ENTERED — being in it already is not enough — and resolving is not playing a Trick.', { companion: 'drizzle' }),

  // ── Pudding ───────────────────────────────────────────────────────────────
  K('best-friend', 'Best Friend', 'Whoever Pudding has decided he is protecting. Alone, that is himself — and a Trick naming both you and your Best Friend does not then pay twice. In a party he chooses, and a few Tricks can change his mind.', { companion: 'pudding' }),
  K('loyalty', 'Loyalty', 'Earned when something is winding up at his [Best Friend] — one a turn from that rule however many enemies there are. Holds 5. Spent on protection, retaliation and tempo, and it keeps between turns.', { companion: 'pudding' }),
  K('plot', 'Plot', 'One of three cemetery Plots. Each holds a single Buried Trick and performs ONE operation per turn: burying into it or digging out of it uses it up until your next turn.', { companion: 'pudding' }),
  K('bury', 'Bury', 'Move a Trick from your hand into an empty [Plot]. It leaves draw and discard entirely, cannot be played, has not Vanished, and comes back after the Scuffle.', { companion: 'pudding' }),
  K('dig-up', 'Dig Up', 'Take a Buried Trick out of a [Plot] and into your hand. It becomes [Unearthed] and that Plot is used for the turn.', { companion: 'pudding' }),
  K('unearthed', 'Unearthed', 'A Trick that was [Dig Up]-ed THIS turn. Some Tricks do more when played that way. It expires at end of turn even if the Trick is retained — unless Warm Spot by the Headstones is out.', { companion: 'pudding' }),
  K('graveside', 'Graveside', 'True whenever two or more [Plot]s are occupied, checked the moment an effect resolves. This is the whole tension: digging your Tricks up for value can switch it off.', { companion: 'pudding' }),

  // ── Mossbit ───────────────────────────────────────────────────────────────
  /* Advance / Delay / Erase live inside this one entry on purpose. As separate
     keywords, `advance` would collide with Drizzle's Weather verb — ids are
     global while Companions are not — and three thin tooltips read worse than
     one that explains the whole clock. */
  K('epitaph', 'Epitaph', 'A delayed effect with a countdown, in one of five slots. Every Epitaph ticks down once at the start of your turn, oldest first, and resolves at zero. HURRY one along to bring it forward — but only a countdown that runs out ON ITS OWN pays [Patience]. PUT ONE BACK to push it later. ERASE one to clear the slot without resolving it. An Epitaph aimed at an enemy remembers that enemy, and fizzles if it is gone.', { companion: 'mossbit' }),
  K('patience', 'Patience', 'Holds 3, or 5 under Longer Memory. One is paid whenever an [Epitaph] reaches zero from its own scheduled tick — never from being hurried along. That difference is the whole of Mossbit.', { companion: 'mossbit' }),
  K('weathering', 'Weathering', 'A Trick with Weathering left unplayed in your hand at the end of your turn is kept in hand and loses 1. At 0 it is Weathered for the rest of the fight and uses its better half. Leaving your hand before then resets it to its printed number — the progress is the reward for NOT playing it.', { companion: 'mossbit' }),
  K('buried-harm', 'Buried Harm', 'Attack damage postponed rather than prevented. At the END of your next turn you lose that much Courage — not as an Attack, so Guard cannot stop it and it cannot be postponed again. Burying buys exactly one turn to do something about it.', { companion: 'mossbit' }),
];

export const KEYWORD_IDS = COMPANION_KEYWORDS.map(k => k.id);

// ── statuses ────────────────────────────────────────────────────────────────
/** A plain visible counter with no behaviour of its own. */
const counterStatus = (id, name, desc, max, kind = 'neutral') => ({
  id, name, kind, icon: id, desc, decay: 'never', stacks: true, max, resource: true,
});

/**
 * A Companion Power held on its owner, stacking if the Power is taken twice.
 * Registered rather than left to getStatus()'s placeholder, so the status row
 * reads as words instead of an unnamed chip.
 */
const powerStatus = (id, name, desc, icon) => ({
  id, name, kind: 'buff', icon: icon || 'hidden', decay: 'never', stacks: true, desc,
});

export const COMPANION_STATUSES = [
  // ── generic ───────────────────────────────────────────────────────────────
  {
    id: 'empowered', name: 'Empowered', kind: 'buff', icon: 'empowered', decay: 'turnEnd', stacks: true,
    desc: 'Your next Attack this turn deals {n} additional damage.',
    hooks: {
      // EXTRA: onAttackDealt — fired once per Attack card, after its damage resolves.
      modifyDamageDealt: (amt, ctx) => (ctx.kind === 'attack' ? amt + (ctx.stacks || 0) : amt),
      onAttackDealt: (ctx) => ctx.remove(),
    },
  },

  {
    id: 'no-guard', name: 'Exposed', kind: 'debuff', icon: 'no-guard', decay: 'turnEnd', stacks: false,
    desc: 'You cannot gain Guard for the rest of this turn.',
    hooks: { modifyBlockGain: () => 0 },
  },
  // ── "your next Trick costs less" family ───────────────────────────────────
  // All four were applied by cards and read by nobody: a status with no hook and
  // no reader is a no-op with a tooltip. `discountHooks()` supplies the one hook
  // that makes them mean something plus the consumption rule from their own card
  // text. `modifyCardCost` must stay PURE — the engine re-runs it on every repaint
  // of the hand — so the stack is spent in onCardPlayed instead.
  {
    id: 'next-trick-discount', name: 'Loosened', kind: 'buff', icon: 'energy', decay: 'turnEnd', stacks: true,
    desc: 'The next Trick you play this turn costs {n} less.',
    hooks: discountHooks(() => true),
  },
  {
    id: 'next-attack-discount', name: 'Opening', kind: 'buff', icon: 'energy', decay: 'turnEnd', stacks: true,
    desc: 'The next Attack you play this turn costs {n} less.',
    hooks: discountHooks((card) => card.type === 'attack'),
  },
  {
    id: 'land-discount', name: 'Springloaded', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: true,
    desc: 'Your next Trick containing Land this turn costs {n} less.',
    hooks: discountHooks((card) => hasKw(card, 'land')),
  },
  {
    id: 'zoomies-discount', name: 'Midnight Zoomies', kind: 'buff', icon: 'energy', decay: 'turnEnd', stacks: true,
    desc: 'The first Trick each turn that activates Zoomies costs {n} less.',
    hooks: discountHooks((card, e, h) => hasKw(card, 'zoomies') && e.seatStats(h.player).cardsPlayedThisTurn >= 2),
  },

  // ── Marmalade ─────────────────────────────────────────────────────────────
  {
    id: 'ghoststep', name: 'Ghoststep', kind: 'buff', icon: 'ghoststep', decay: 'enemyTurnEnd', stacks: true, max: 9,
    desc: 'Prevents the next {n} hits of enemy Attack damage entirely. Expires at the end of the enemy turn.',
    hooks: {
      // EXTRA: onIncomingHit. Ghoststep is "the hit does not happen", not "the
      // hit does 0" — damage.js step 6b is exactly this shape. It must NOT be a
      // modifyDamageTaken reducer: that one also runs inside computeDamage() for
      // intent previews, so every re-render of an enemy intent would silently
      // eat a stack.
      onIncomingHit: (ctx) => {
        if (ctx.kind !== 'attack' || ctx.amount <= 0) return;
        if (!ctx.attacker || ctx.attacker.side !== 'enemy') return;
        ctx.prevent();
        ctx.consume(1);
        const c = uctx(ctx);
        if (c) fireCompanionHook(c, 'ghoststepConsumed', { attacker: ctx.attacker });
      },
    },
  },
  {
    id: 'haunt', name: 'Haunt', kind: 'debuff', icon: 'haunt', decay: 'never', stacks: true,
    desc: 'When this enemy takes a damaging action it loses {n} Courage, then loses half its Haunt, rounded up.',
    hooks: {
      // EXTRA: onAttack — fired on the acting enemy just after its damaging move
      // resolves. `ctx.actor` is that enemy (the status owner).
      onAttack: (ctx) => {
        const n = ctx.stacks || 0;
        if (n <= 0) return;
        ctx.loseHp(ctx.actor, n);
        // Permanent Haunting is a buff on the PLAYER, not a field on the payload.
        const slow = !!(ctx.player && ctx.player.hasStatus('slow-haunting'));
        ctx.consume(slow ? 1 : Math.ceil(n / 2));
      },
    },
  },
  counterStatus('lives', 'Lives', 'Marmalade has {n} of her nine Lives left this combat.', 9, 'buff'),
  {
    id: 'untouched', name: 'Untouched', kind: 'buff', icon: 'untouched', decay: 'never', stacks: false,
    desc: 'You lost no Courage during the previous enemy turn.',
  },
  counterStatus('untouched-streak', 'Perfect Streak', 'You have been Untouched for {n} consecutive enemy turns.', 99, 'buff'),
  {
    id: 'predators-patience', name: 'Predator’s Patience', kind: 'buff', icon: 'strength', decay: 'never', stacks: true,
    desc: 'Your Attacks deal {n} additional damage for the rest of this combat.',
    hooks: { modifyDamageDealt: (amt, ctx) => (ctx.kind === 'attack' ? amt + (ctx.stacks || 0) : amt) },
  },
  {
    id: 'slow-haunting', name: 'Permanent Haunting', kind: 'buff', icon: 'haunt', decay: 'never', stacks: false,
    desc: 'Haunt loses only 1 stack when it triggers instead of half.',
  },
  {
    id: 'tripwire-tail', name: 'Tripwire Tail', kind: 'buff', icon: 'haunt', decay: 'turnEnd', stacks: true,
    desc: 'The next enemy to attack you this turn gains {n} Haunt.',
    hooks: {
      onAttacked: (ctx) => {
        const src = ctx.attacker;
        if (!src || src.side !== 'enemy' || !src.alive) return;
        ctx.applyStatus(src, 'haunt', ctx.stacks || 0);
        ctx.remove();
      },
    },
  },
  {
    id: 'not-dead-yet', name: 'Not Dead Yet', kind: 'buff', icon: 'lives', decay: 'turnStart', stacks: false,
    desc: 'The next time your Courage would reach 0 this turn, spend 3 Lives instead and survive at 1 Courage.',
    hooks: {
      // EXTRA: onLethal — fired before a hit would reduce the player to 0 Courage.
      // The payload's survival control is `setHp`; Lives is a Companion resource,
      // so it is spent through the same helper the cards use.
      onLethal: (ctx) => {
        const c = uctx(ctx);
        if (!c || res(c, 'lives') < 3) return false;
        spendRes(c, 'lives', 3);
        fireCompanionHook(c, 'lifeSpent', { n: 3 });
        ctx.setHp(1);
        ctx.remove();
        return true;
      },
    },
  },
  {
    id: 'nope', name: 'Nope.', kind: 'buff', icon: 'nope', decay: 'turnStart', stacks: true,
    desc: 'Prevents the next {n} debuffs an enemy would apply to you.',
    hooks: {
      // EXTRA: onDebuffIncoming — fired before a debuff lands on the player.
      // The veto is `prevent()`; a truthy return value is not read here.
      onDebuffIncoming: (ctx) => { ctx.consume(1); ctx.prevent(); return true; },
    },
  },

  // ── Bones ─────────────────────────────────────────────────────────────────
  counterStatus('loose-bones', 'Loose Bones', '{n} of Bones is currently detached. Whole at 0, Scattered at 4 or more.', 6),
  {
    id: 'anatomy-optional', name: 'Anatomy Is Optional', kind: 'buff', icon: 'scattered', decay: 'never', stacks: false,
    desc: 'You count as Scattered at 2 or more Loose Bones instead of 4.',
  },
  {
    id: 'play-dead', name: 'Play Dead', kind: 'buff', icon: 'play-dead', decay: 'turnStart', stacks: false,
    desc: 'Until your next turn, you may Shed 1 Bone before any hit to reduce that hit’s damage by half. Once per hit.',
    hooks: {
      // EXTRA: onIncomingHit — fired per individual attack hit, before mitigation.
      // VOID hook with a mutable payload: it is `(ctx)`, never `(amt, ctx)`.
      onIncomingHit: (ctx) => {
        if (ctx.amount <= 0) return;
        const c = uctx(ctx);
        if (!c || res(c, 'loose-bones') >= 6) return;
        addRes(c, 'loose-bones', 1, 0, 6);
        fireCompanionHook(c, 'rattle', { n: 1, reason: 'play-dead' });
        ctx.setAmount(Math.ceil(ctx.amount / 2));
      },
    },
  },

  // ── Pipkin ────────────────────────────────────────────────────────────────
  counterStatus('height', 'Height', 'Pipkin is {n} bounces off the ground. Height disappears at the end of your turn.', 3),
  counterStatus('plump', 'Plump', 'Pipkin is {n} sizes rounder. At maximum Plump, Hop Tricks cost 1 more.', 5),
  {
    id: 'hang-time', name: 'Hang Time', kind: 'buff', icon: 'height', decay: 'turnStart', stacks: false,
    desc: 'Your Height does not disappear at the end of this turn.',
  },
  {
    id: 'land-boost', name: 'Higher Than It Looks', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: true,
    desc: 'Your next Land effect this turn treats the Height spent as {n} higher, to a maximum of 3.',
  },
  {
    id: 'leapfrog', name: 'Leapfrog', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: false,
    desc: 'The next time Pipkin Lands this turn, a friend gains Guard.',
  },
  {
    id: 'double-land', name: 'Double Landing', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: false,
    desc: 'Your next Land effect this turn resolves its Land clause twice.',
  },
  // Both of these are read by pipkin.js's cost helpers (`hopCost`, `heavyFeet`)
  // but were never registered, so they applied as anonymous placeholder statuses
  // with no name, no icon and no tooltip.
  {
    id: 'elastic-legs', name: 'Elastic Legs', kind: 'buff', icon: 'height', decay: 'turnEnd', stacks: false,
    desc: 'The first Trick containing Hop you play this turn costs 1 less.',
  },
  {
    id: 'ignore-heavy-feet', name: 'Light on Her Feet', kind: 'buff', icon: 'plump', decay: 'turnEnd', stacks: true,
    desc: 'Your next Hop Trick this turn ignores Heavy Feet.',
  },

  // ── Taffy ─────────────────────────────────────────────────────────────────
  counterStatus('globs', 'Globs', 'Taffy has separated into {n} pieces. Runny at 5 or more.', 6),
  {
    id: 'blob-insurance', name: 'Blob Insurance', kind: 'buff', icon: 'globs', decay: 'turnStart', stacks: false,
    desc: 'You cannot lose Courage from being Runny before your next turn.',
  },
  {
    id: 'no-runny', name: 'Runaway Puddle', kind: 'buff', icon: 'globs', decay: 'never', stacks: false,
    desc: 'Being Runny no longer costs you Courage.',
  },

  // ── Wink ──────────────────────────────────────────────────────────────────
  counterStatus('open-eyes', 'Open Eyes', 'Wink has {n} of eight eyes open. Full Gaze at 8.', 8, 'buff'),
  {
    id: 'web', name: 'Web', kind: 'debuff', icon: 'web', decay: 'never', stacks: true,
    desc: '{n} Web. Web does nothing on its own — Wink’s Tricks spend it to rearrange, postpone, attack or defend.',
  },
  {
    id: 'web-discount', name: 'All Eyes Open', kind: 'buff', icon: 'web', decay: 'never', stacks: true,
    desc: 'Your first Intent manipulation each turn costs {n} less Web, minimum 1.',
  },
  {
    id: 'free-web', name: 'Master of the Web', kind: 'buff', icon: 'web', decay: 'never', stacks: false,
    desc: 'The first time each turn you spend Web to reorder or delete an Intent, the Web is not actually removed.',
  },

  // ── Boggle ────────────────────────────────────────────────────────────────
  // Awareness is one state per enemy, so `unaware` and `suspicious` are both
  // stacks:false and are kept mutually exclusive by boggle.js, never by two
  // separate cards racing each other.
  {
    id: 'fright', name: 'Fright', kind: 'debuff', icon: 'fright', decay: 'never', stacks: true,
    desc: '{n} Fright. Fright does nothing on its own and never wears off — Boggle spends it with Scare clauses.',
  },
  {
    id: 'unaware', name: 'Unaware', kind: 'debuff', icon: 'hidden', decay: 'never', stacks: false,
    desc: 'This one has lost track of Boggle. A directed Attack aimed only at him becomes Search instead.',
  },
  {
    id: 'suspicious', name: 'Suspicious', kind: 'buff', icon: 'suspicious', decay: 'never', stacks: false,
    desc: 'It knows something is under there. It cannot be made Unaware, and stops being Suspicious after its next action.',
  },
  counterStatus('lurk', 'Lurk', 'Boggle has been still for a while. {n} Lurk.', 7, 'buff'),

  // Boggle's Powers. Registered rather than left to getStatus()'s placeholder,
  // so the status row reads as words instead of an unnamed chip.
  powerStatus('boggle/the-house-settles', 'The House Settles', 'Whenever an enemy becomes Unaware, apply {n} Fright to it. At most three times a turn.'),
  powerStatus('boggle/quiet-as-dust', 'Quiet as Dust', 'The first Ambush Attack each turn leaves its target Aware instead of Suspicious.'),
  powerStatus('boggle/underbed-kingdom', 'Underbed Kingdom', 'Maximum Lurk is 7 this combat.'),
  powerStatus('boggle/imagination-does-the-rest', 'Imagination Does the Rest', 'Whenever a Scare triggers, apply {n} Fright to a different enemy.'),
  powerStatus('boggle/one-eye-open', 'One Eye Open', 'At the end of your turn, gain Guard for each Suspicious enemy.'),
  powerStatus('boggle/creaks-have-teeth', 'Creaks Have Teeth', 'Whenever an enemy Searches, deal damage to it and give it 1 more Fright.'),
  powerStatus('boggle/practice-your-scream', 'Practice Your Scream', 'Your first Scare each turn needs and spends {n} less Fright, minimum 1.'),
  powerStatus('boggle/beneath-every-bed', 'Beneath Every Bed', 'If every living enemy is Unaware at the end of your turn, gain 1 extra Lurk and draw an extra Trick next turn.'),
  powerStatus('boggle/fear-of-the-dark', 'Fear of the Dark', 'The first Scare against each enemy each turn does not spend its Fright. It still needs the full amount.'),
  powerStatus('boggle/nobodys-here', 'Nobody\u2019s Here', 'Once a turn, an Aware enemy with 6 or more Fright that aims a directed Attack at Boggle becomes Unaware first.'),
  powerStatus('boggle/monster-under-every-bed', 'Monster Under Every Bed', 'When you gain your end-of-turn Lurk, apply 2 Fright to all enemies, or 3 if every enemy is Unaware.'),
  powerStatus('boggle/bedframe-geography', 'Bedframe Geography', 'The first time each turn an enemy becomes Suspicious, make a different Aware enemy Unaware.'),
  powerStatus('boggle/bigger-in-your-head', 'Bigger in Your Head', 'When a Scare spends Fright, half of it comes back to that enemy at the end of your turn.'),
  powerStatus('boggle/feed-the-imagination', 'Feed the Imagination', 'Whenever an enemy becomes Suspicious, apply 2 Fright, or 3 if Boggle Ambushed it.'),
  powerStatus('boggle/you-didnt-see-anything', 'You Didn\u2019t See Anything', 'Hiding Tricks may target Suspicious enemies. The first each turn costs 2 Lurk to succeed.'),
  powerStatus('boggle/good-night-sleep-tight', 'Good Night, Sleep Tight', 'At the end of your turn, if every living enemy has 8 or more Fright, make every Aware enemy Unaware and gain 1 Lurk.'),

  // ── Mopsy ─────────────────────────────────────────────────────────────────
  counterStatus('stuffing', 'Stuffing', 'Mopsy is holding {n} Stuffing. Plump at 5, Hollow at 0.', 6, 'buff'),
  {
    /**
     * Cushion. Inherent rather than bought, applied once by Mopsy's tracker, and
     * a status rather than a hidden rule so the player can see it sitting there
     * and so the once-per-enemy-turn allowance has somewhere to live.
     *
     * `onCourageLoss` is a pipeline step added for this: the spec says "after
     * Guard is applied", and `onIncomingHit` fires before Guard is consulted, so
     * nothing in damage.js could see the number Cushion is defined against. It
     * is a VOID hook with a mutable payload — read `h.amount`, call
     * `h.setAmount(n)` — and CONTRACTS trap: writing it as `(amt, h)` makes `h`
     * undefined and it throws on its first line, which is how Play Dead broke.
     */
    id: 'cushion', name: 'Cushion', kind: 'buff', icon: 'stuffing', decay: 'never', stacks: false,
    desc: 'Once each enemy turn, spend 1 Stuffing to halve a Courage loss after Guard, rounding up. Not while Hollow.',
    hooks: {
      onCourageLoss: (h) => {
        const c = trackerCtx(h.e, h.defender);
        const free = stacks(c, c.self, 'cushion-free') > 0;
        if (!free && res(c, 'stuffing') <= 0) return;          // Hollow cannot Cushion
        const noLimit = stacks(c, c.self, 'cushion-fort') > 0;
        if (!noLimit) {
          const used = stacks(c, c.self, 'cushion-used');
          const allowance = 1 + stacks(c, c.self, 'cushion-extra');
          if (used >= allowance) return;
        }
        if (free) unapplyFrom(c, c.self, 'cushion-free', 1);
        else addRes(c, 'stuffing', -1, 0, 6);
        applyTo(c, c.self, 'cushion-used', 1);
        h.setAmount(Math.ceil(h.amount / 2));
      },
      /**
       * Mopsy's "While attached, this Trick costs 1 less" Patch rides here too.
       * It cannot be a `dynamicCost` because the Patch can be sewn onto ANY
       * Trick, including one this Companion did not write, and hooks are found
       * on the ACTOR — so it needs a status Mopsy is already holding rather
       * than a second inherent chip in her status row explaining nothing.
       *
       * `modifyCardCost` must stay PURE — the engine re-runs it every repaint.
       */
      modifyCardCost: (cost, h) => {
        const list = h.card ? cardFlag(h.card, 'patches') : null;
        if (!Array.isArray(list)) return cost;
        return list.some((x) => x && x.id === 'cheaper') ? Math.max(0, cost - 1) : cost;
      },
    },
  },
  {
    id: 'cushion-used', name: 'Cushioned', kind: 'buff', icon: 'stuffing', decay: 'enemyTurnEnd', stacks: true,
    desc: 'Cushion has been used {n} times during this enemy turn.',
  },

  {
    id: 'cushion-extra', name: 'Cushion Check', kind: 'buff', icon: 'stuffing', decay: 'turnStart', stacks: true,
    desc: 'Cushion may be used against {n} more hits during the next enemy turn. Each still costs 1 Stuffing.',
  },
  {
    id: 'cushion-free', name: 'Full Restuffing', kind: 'buff', icon: 'stuffing', decay: 'never', stacks: true,
    desc: 'Your next {n} uses of Cushion cost no Stuffing.',
  },
  {
    id: 'cushion-fort', name: 'Cushion Fort', kind: 'buff', icon: 'stuffing', decay: 'turnStart', stacks: false,
    desc: 'Cushion has no usage limit until the start of your next turn. Each use still costs 1 Stuffing.',
  },
  powerStatus('mopsy/sewing-kit', 'Sewing Kit', 'The first Patch you apply each turn starts with {n} more Stitches.', 'patch'),
  powerStatus('mopsy/rag-bag', 'Rag Bag', 'The first Trick you Tear each turn gives you {n} Stuffing.', 'patch'),
  powerStatus('mopsy/memory-foam', 'Memory Foam', 'The first time each turn you spend Stuffing, your next Trick costs 1 less.', 'patch'),
  powerStatus('mopsy/loose-ends', 'Loose Ends', 'The first time a Patch breaks each turn, draw a Trick and add a Scrap to your discard pile.', 'patch'),
  powerStatus('mopsy/well-loved', 'Well Loved', 'The first Trick you Mend each turn gains you Guard and Reinforces one of its Patches.', 'patch'),
  powerStatus('mopsy/pattern-book', 'Pattern Book', 'Once a turn, after playing Tricks carrying two differently worded Patches, gain 1 Stuffing.', 'patch'),
  powerStatus('mopsy/safety-pins', 'Safety Pins', 'At the end of your turn, Reinforce one Patch on a Trick you are Retaining.', 'patch'),
  powerStatus('mopsy/master-seamstress', 'Master Seamstress', 'Every eligible Trick can hold one more Patch for the rest of combat.', 'patch'),
  powerStatus('mopsy/heirloom-quilt', 'Heirloom Quilt', 'Once a turn, a breaking Patch moves to a different unpatched Trick with 1 Stitch instead of being lost.', 'patch'),
  powerStatus('mopsy/ship-of-mopsy', 'Ship of Mopsy', 'The first Trick you Tear each turn leaves a temporary 0-Nerve copy in your hand.', 'patch'),
  powerStatus('mopsy/heart-on-her-sleeve', 'Heart on Her Sleeve', 'The first time each enemy turn Mopsy actually loses Courage, gain 1 Stuffing and Reinforce every Patch in hand.', 'patch'),
  powerStatus('mopsy/stuffing-economy', 'Stuffing Economy', 'Plump: your first Patch trigger each turn keeps its Stitch. Hollow: your first Tear or Mend Skill each turn costs 1 less.', 'patch'),
  powerStatus('mopsy/the-whole-pattern', 'The Whole Pattern', 'At the end of your turn, with 3 differently worded Patches attached, gain 1 Nerve and 1 card next turn.', 'patch'),
  powerStatus('mopsy/threadbare-and-thriving', 'Threadbare and Thriving', 'While Hollow, the first patched Trick you play each turn triggers one Patch an extra time.', 'patch'),
  powerStatus('mopsy/held-together-by-love', 'Held Together by Love', 'Once per combat, lethal damage leaves Mopsy at 1 Courage; she Tears her hand and cashes every Patch for Stuffing.', 'patch'),
  powerStatus('mopsy/family-quilt', 'Family Quilt', 'Once a round per Kid, a teammate playing a Trick you Patched draws a card and gives you 1 Stuffing.', 'patch'),

  // ── Wisp ──────────────────────────────────────────────────────────────────
  counterStatus('glow', 'Glow', 'Wisp is carrying {n} Glow. Bright at 3, Blazing at 6.', 9, 'buff'),
  powerStatus('wisp/home-in-the-dark', 'Home in the Dark', 'The first Afterglow each turn gains you Guard.', 'glow'),
  powerStatus('wisp/static-in-the-wallpaper', 'Static in the Wallpaper', 'The first Flare each turn hits a random enemy.', 'glow'),
  powerStatus('wisp/getting-excited', 'Getting Excited', 'The first Convergence each turn gains Glow.', 'glow'),
  powerStatus('wisp/brighter-every-minute', 'Brighter Every Minute', 'The first Trick into the Gloaming each turn gains Guard.', 'glow'),
  powerStatus('wisp/constellation-practice', 'Constellation Practice', 'The first Convergence each turn draws and gains Glow.', 'glow'),
  powerStatus('wisp/hallway-aurora', 'Hallway Aurora', 'Bright: damaging Afterglows hit harder. Blazing: defensive ones give more Guard.', 'glow'),
  powerStatus('wisp/i-can-wait', 'I Can Wait', 'The first deliberate Delay each turn gains Guard.', 'glow'),
  powerStatus('wisp/cant-wait', 'Can’t Wait!', 'The first Hasten to 0 each turn hits a random enemy.', 'glow'),
  powerStatus('wisp/flicker-feedback', 'Flicker Feedback', 'The first Flare each turn Hastens a random Lingering Trick.', 'glow'),
  powerStatus('wisp/three-little-lights', 'Three Little Lights', 'Exactly three in the Gloaming at end of turn gains Glow and a card.', 'glow'),
  powerStatus('wisp/bigger-than-a-nightlight', 'Bigger Than a Nightlight', 'Maximum Glow is 9, and above 6 every Afterglow does more.', 'glow'),
  powerStatus('wisp/falling-dominoes', 'Falling Dominoes', 'The first Afterglow each turn Hastens everything else.', 'glow'),
  powerStatus('wisp/good-things-come', 'Good Things Come to Tiny Ghosts', 'Once a turn, a Delayed Trick resolves its Afterglow twice.', 'glow'),
  powerStatus('wisp/never-goes-out', 'Never Goes Out', 'The first Glow you spend each turn partly comes back.', 'glow'),
  powerStatus('wisp/gloaming-gets-crowded', 'Gloaming Gets Crowded', 'Four in the Gloaming draws two and gains a Nerve.', 'glow'),
  powerStatus('wisp/too-bright-for-bedtime', 'Too Bright for Bedtime', 'Blazing at turn start makes your first two Tricks cheaper, then costs 2 Glow.', 'glow'),
  powerStatus('wisp/tiny-star-long-shadow', 'Tiny Star, Long Shadow', 'Once a turn, a Convergence repeats one of its Afterglows.', 'glow'),
  powerStatus('wisp/follow-my-light', 'Follow My Light!', 'A teammate’s third Trick Hastens one of yours; your Afterglows make theirs cheaper.', 'glow'),

  // ── Count Crumbula ────────────────────────────────────────────────────────
  counterStatus('appetite', 'Appetite', 'The Count is at {n} Appetite. Hungry at 0-1, Sated at 4 or more.', 9, 'buff'),
  {
    id: 'bite-mark', name: 'Bite Mark', kind: 'debuff', icon: 'bite-mark', decay: 'never', stacks: true,
    desc: '{n} Bite Marks. They do nothing on their own — the Count is saving them for later.',
  },
  {
    /**
     * Queasy costs Nerve through `energyDelta`, not by spending it.
     *
     * Two earlier attempts were both silently wiped. `turn:start` is emitted
     * BEFORE the refill, and even an `onTurnStart` status hook runs before it —
     * `_dealSeatTurn` SETS Nerve to the maximum several steps later, so any
     * deduction taken beforehand simply disappears. `energyDelta` is measured
     * with the draw penalties and applied to that refill, which is the only
     * place a "start with less Nerve" status can actually work.
     */
    id: 'queasy', name: 'Queasy', kind: 'debuff', icon: 'appetite', decay: 'turnStart', stacks: true, max: 2,
    desc: 'Ate past full. Start your next turn with {n} less Nerve, then this clears.',
    energyDelta: -1,
    decayAll: true,
  },
  powerStatus('crumbula/velvet-appetite', 'Velvet Appetite', 'Becoming Hungry, and becoming Sated, each draw once a turn.', 'appetite'),
  powerStatus('crumbula/house-rules', 'House Rules', 'Bite Marks on a dying enemy move to the living instead of being lost.', 'bite-mark'),
  powerStatus('crumbula/connoisseur', 'Connoisseur', 'Playing a Leftover also gains Guard.', 'appetite'),
  powerStatus('crumbula/the-counts-cut', 'The Count’s Cut', 'Your first Indulge each turn marks every enemy.', 'bite-mark'),
  powerStatus('crumbula/hunger-pangs', 'Hunger Pangs', 'Your first Attack each turn while Hungry costs 1 less.', 'appetite'),
  powerStatus('crumbula/well-fed-well-dressed', 'Well Fed, Well Dressed', 'Feeding while already Sated gains Guard, once a turn.', 'appetite'),
  powerStatus('crumbula/eternal-hunger', 'Eternal Hunger', 'Appetite is locked at 0. Feeding heals but never fills.', 'appetite'),
  powerStatus('crumbula/bottomless-tummy', 'Bottomless Tummy', 'Maximum Appetite is 9. Above 6, Attacks cost more and your first Skill costs less.', 'appetite'),
  powerStatus('crumbula/on-the-house', 'On the House', 'Your first Indulge each turn goes on the Tab.', 'appetite'),
  powerStatus('crumbula/endless-pantry', 'Endless Pantry', 'Leftovers cost 1 and cycle through the deck instead of Vanishing.', 'appetite'),
  powerStatus('crumbula/not-dead-just-napping', 'Not Dead, Just Napping', 'Once per combat, lethal damage leaves the Count at 1 Courage.', 'appetite'),
  powerStatus('crumbula/feast-and-famine', 'Feast and Famine', 'Swinging between Hungry and Sated pays Nerve and a card.', 'appetite'),
  powerStatus('crumbula/everybody-gets-a-cape', 'Everybody Gets a Cape', 'Becoming Sated Guards the party; becoming Hungry draws for them.', 'appetite'),
  powerStatus('crumbula/the-counts-hospitality', 'The Count’s Hospitality', 'Your first Feed each round also heals the weakest Kid, and costs extra Appetite.', 'appetite'),

  // ── Hush ──────────────────────────────────────────────────────────────────
  {
    id: 'unseen', name: 'Unseen', kind: 'buff', icon: 'hidden', decay: 'never', stacks: false,
    desc: 'Nothing in the room knows where Hush is. Lost when he takes Courage damage or plays an Attack.',
  },
  powerStatus('hush/hidey-hole', 'Hidey Hole', 'A bigger Shadow Pocket, and the first Stash each turn draws.', 'hidden'),
  powerStatus('hush/light-sleeper', 'Light Sleeper', 'Starting a turn Unseen gains Nerve.', 'hidden'),
  powerStatus('hush/kleptomaniac', 'Kleptomaniac', 'The first Pilfer each turn is doubled.', 'scurry'),
  powerStatus('hush/hallway-phantom', 'Hallway Phantom', 'The first Scurry each turn gains Guard.', 'scurry'),
  powerStatus('hush/no-fixed-address', 'No Fixed Address', 'A full Shadow Pocket at end of turn makes him Unseen.', 'hidden'),
  powerStatus('hush/inside-job', 'Inside Job', 'The first Contraband each turn pockets your top discard.', 'scurry'),
  powerStatus('hush/soft-footfalls', 'Soft Footfalls', 'The first Ambush Attack from the Pocket each turn costs less.', 'hidden'),
  powerStatus('hush/bigger-on-the-inside', 'Bigger on the Inside', 'The Shadow Pocket holds five.', 'hidden'),
  powerStatus('hush/professional-nuisance', 'Professional Nuisance', 'Being revealed by an Ambush pockets your top draw.', 'scurry'),
  powerStatus('hush/the-house-has-corners', 'The House Has Corners', 'Starting a turn Seen with a stocked Pocket makes him Unseen.', 'hidden'),
  powerStatus('hush/sticky-little-legend', 'Sticky Little Legend', 'Contraband comes back to the Pocket, costing more each time.', 'scurry'),
  powerStatus('hush/now-you-see-me', 'Now You See Me', 'The first Ambush Attack each turn does not reveal him.', 'hidden'),
  powerStatus('hush/now-you-dont', 'Now You Don’t', 'Emptying the Shadow Pocket hides him, draws and pays Nerve.', 'hidden'),

  // ── Truffle ───────────────────────────────────────────────────────────────
  counterStatus('quills', 'Quills', 'Truffle has {n} spines still attached.', 18, 'buff'),
  counterStatus('loose-quills', 'Loose Quills', '{n} Quills on the floor, waiting to be Gathered or fired.', 99, 'neutral'),
  {
    /**
     * Bristle. It fires on `onCourageLoss` -- the step added for Mopsy's Cushion
     * -- because the spec is explicit that being ATTACKED is not enough: the
     * Attack has to actually reduce Courage after Guard and every other
     * prevention. A hit the Guard eats does nothing at all.
     *
     * `bristle-used` on the attacker is what makes one Attack ACTION trigger it
     * once however many individual hits it contains; it decays at enemyTurnEnd,
     * and each enemy acts once per turn, so that is exactly per-action.
     *
     * Unlike Cushion this hook does NOT call setAmount: Truffle is hitting back,
     * not reducing what he takes.
     */
    id: 'bristle', name: 'Bristle', kind: 'buff', icon: 'quills', decay: 'never', stacks: true,
    desc: '{n} Bristle. When an Attack costs you Courage, spend 1, Shed 1 Quill and hit that attacker back.',
    hooks: {
      onCourageLoss: (h) => {
        const c = trackerCtx(h.e, h.defender);
        if (!c || stacks(c, c.self, 'bristle') <= 0) return;
        const from = h.attacker;
        if (!from || !from.alive) return;
        if (stacks(c, from, 'bristle-used') > 0) return;
        applyTo(c, from, 'bristle-used', 1);
        unapplyFrom(c, c.self, 'bristle', 1);
        const quills = res(c, 'quills');
        if (quills <= 0) return;               // the Bristle is spent either way
        addRes(c, 'quills', -1, 0, 18);
        addRes(c, 'loose-quills', 1, 0, 99);
        h.e.dealDamage({ attacker: c.self, defender: from, amount: 7, kind: 'attack', cause: 'bristle' });
        fireCompanionHook(c, 'bristled', { enemy: from });
      },
    },
  },
  {
    id: 'bristle-used', name: 'Bristled', kind: 'debuff', icon: 'quills', decay: 'enemyTurnEnd', stacks: false,
    desc: 'Truffle has already bristled at this one during this enemy turn.',
  },
  powerStatus('truffle/shed-cycle', 'Shed Cycle', 'Your first Shed each turn Regrows next turn.', 'quills'),
  powerStatus('truffle/quill-carpet', 'Quill Carpet', 'A well-stocked floor damages the room at end of turn.', 'loose-quills'),
  powerStatus('truffle/wretched-little-miracle', 'Wretched Little Miracle', 'Ending a turn Ragged with no Guard gains Bristle.', 'quills'),
  powerStatus('truffle/built-wrong', 'Built Wrong', 'The first Attack each enemy turn that hurts you makes you Regrow.', 'quills'),
  powerStatus('truffle/hard-to-finish', 'Hard to Finish', 'Every Bristle trigger pays Guard next turn.', 'quills'),
  powerStatus('truffle/more-where-that-came-from', 'More Where That Came From', 'Gathering two at once gains Bristle.', 'loose-quills'),
  powerStatus('truffle/comfortable-in-pieces', 'Comfortable in Pieces', 'While Ragged, Guard Tricks give less and also give Bristle.', 'quills'),
  powerStatus('truffle/the-floor-is-mine', 'The Floor Is Mine', 'Spending or Gathering Loose Quills draws.', 'loose-quills'),
  powerStatus('truffle/unpleasant-geometry', 'Unpleasant Geometry', 'The first Quills you Gather each turn hit something.', 'loose-quills'),
  powerStatus('truffle/the-carpet-remembers', 'The Carpet Remembers', 'Your first Loose Quill spend each turn is free.', 'loose-quills'),
  powerStatus('truffle/double-barbed', 'Double Barbed', 'Bristle Sheds more and retaliates more for the same stack.', 'quills'),
  powerStatus('truffle/close-enough-to-dead', 'Close Enough to Dead', 'Ragged begins at 75% Courage.', 'quills'),
  powerStatus('truffle/dead-hedgehog-theory', 'Dead Hedgehog Theory', 'Being hurt pays Quills, Nerve and a card.', 'quills'),
  powerStatus('truffle/grows-back-wrong', 'Grows Back Wrong', 'Regrow can overfill him; the excess falls off at end of turn.', 'quills'),
  powerStatus('truffle/permanent-bad-hair-day', 'Permanent Bad Hair Day', 'Bristle no longer expires.', 'quills'),
  powerStatus('truffle/still-wiggling', 'Still Wiggling', 'Ending a turn Ragged, bare and bristling pays Nerve and a card.', 'quills'),
  powerStatus('truffle/shared-pincushion', 'Shared Pincushion', 'You may Shed to retaliate when a teammate is hurt.', 'quills'),

  // ── Drizzle ───────────────────────────────────────────────────────────────
  /**
   * Soaked is deliberately `stacks: false` and carries no behaviour of its own.
   * The chapter is explicit that it neither damages nor weakens: it exists so an
   * enemy is part of the weather, and every consequence lives in Drizzle's own
   * cards. `decay: 'never'` because drying is a Weather rule (end of an enemy
   * turn that BEGAN in Clear), not a duration.
   */
  {
    id: 'soaked', name: 'Soaked', kind: 'debuff', icon: 'soaked', decay: 'never', stacks: false,
    desc: 'Wet through. Nothing on its own — but Drizzle’s Conduct travels between anything that is.',
  },
  /**
   * The Conduct one Kid lends another (Pass the Puddle, Thunder Buddies). The
   * chip is display only; the effect is driven from Drizzle’s own `damage`
   * listener, because what is lent is "when your Attack lands on something wet",
   * which is precisely what that event reports.
   */
  {
    id: 'lent-conduct', name: 'Lent Conduct', kind: 'buff', icon: 'conduct', decay: 'never', stacks: false,
    desc: 'Your Attack on a [Soaked] enemy carries Drizzle’s [Conduct] through the rest of them.',
  },
  powerStatus('drizzle/steady-patter', 'Steady Patter', 'The first Soak each turn gains Guard.', 'soaked'),
  powerStatus('drizzle/damp-house', 'Damp House', 'The first Soaked attacker each enemy turn gains you Guard.', 'soaked'),
  powerStatus('drizzle/barometer', 'Barometer', 'The first Weather change each turn draws next turn.', 'weather'),
  powerStatus('drizzle/leak-in-every-room', 'Leak in Every Room', 'The first Soak each turn splashes onto somebody else.', 'soaked'),
  powerStatus('drizzle/low-pressure-system', 'Low Pressure System', 'The first Advance each turn moves two steps.', 'weather'),
  powerStatus('drizzle/downpour-darling', 'Downpour Darling', 'Downpour turns start with Guard and a cheaper Attack.', 'weather'),
  powerStatus('drizzle/storm-chaser', 'Storm Chaser', 'Entering Thunderstorm draws, then discards one.', 'weather'),
  powerStatus('drizzle/silver-lining', 'Silver Lining', 'Every Stormbreak Guards you next turn.', 'stormbreak'),
  powerStatus('drizzle/damp-forever', 'Damp Forever', 'Soaked enemies no longer dry on their own in Clear.', 'soaked'),
  powerStatus('drizzle/cloud-calendar', 'Cloud Calendar', 'A fourth Forecast slot.', 'forecast'),
  powerStatus('drizzle/weather-station', 'Weather Station', 'Setting a Forecast Guards; resolving one draws next turn.', 'forecast'),
  powerStatus('drizzle/quiet-after', 'Quiet After', 'The first Trick after each Stormbreak refunds its Nerve.', 'stormbreak'),
  powerStatus('drizzle/never-quite-clears', 'Never Quite Clears', 'Stormbreak returns to Sprinkle instead of Clear.', 'stormbreak'),
  powerStatus('drizzle/storm-in-a-teacup', 'Storm in a Teacup', 'The first automatic Stormbreak each combat is prevented.', 'stormbreak'),
  powerStatus('drizzle/forecast-says-me', 'Forecast Says Me', 'Two more Forecast slots; the first to resolve each turn draws.', 'forecast'),
  powerStatus('drizzle/i-am-the-weather', 'I Am the Weather', 'One free Advance or Ease each turn after playing a Trick.', 'weather'),
  powerStatus('drizzle/electric-house', 'Electric House', 'A wide Conduct arcs once more, at random.', 'conduct'),
  powerStatus('drizzle/weather-has-memory', 'Weather Has Memory', 'The first Forecast each turn resolves twice in familiar Weather.', 'forecast'),
  powerStatus('drizzle/thunder-buddies', 'Thunder Buddies', 'Every friend’s first Attack on a Soaked enemy Conducts.', 'conduct'),

  // ── Pudding ───────────────────────────────────────────────────────────────
  /**
   * Stay With Me caps a single Attack. It runs on `onCourageLoss` — the step
   * added for Mopsy's Cushion — because the cap is defined AFTER Guard, which is
   * the one place in the pipeline that number exists.
   */
  {
    id: 'stay-with-me', name: 'Stay With Me', kind: 'buff', icon: 'loyalty', decay: 'never', stacks: false,
    desc: 'No single Attack can cost more than {n} Courage after Guard.',
    hooks: {
      onCourageLoss: (h) => {
        const cap = stacks({ e: h.e, self: h.defender }, h.defender, 'stay-with-me');
        if (!cap || !h.setAmount) return;
        if (h.amount > cap) h.setAmount(cap);
      },
    },
  },
  powerStatus('pudding/haunted-headstones', 'Haunted Headstones', 'The first Bury each turn Guards your Best Friend.', 'plot'),
  powerStatus('pudding/graveyard-rules', 'Graveyard Rules', 'While Graveside, your first Attack on a threat hits harder.', 'graveside'),
  powerStatus('pudding/hallowed-ground', 'Hallowed Ground', 'Graveside turns end with Guard for your Best Friend.', 'graveside'),
  powerStatus('pudding/dog-eared-epitaph', 'Dog Eared Epitaph', 'The first Unearthed Trick each turn draws.', 'unearthed'),
  powerStatus('pudding/never-off-duty', 'Never Off Duty', 'The first Loyalty spent each turn Guards your Best Friend.', 'loyalty'),
  powerStatus('pudding/keeper-of-the-yard', 'Keeper of the Yard', 'The first Trick Dug Up each turn costs less.', 'plot'),
  powerStatus('pudding/little-ghost-escort', 'Little Ghost Escort', 'The first Attack after a Bury hits harder.', 'plot'),
  powerStatus('pudding/cemetery-shift-supervisor', 'Cemetery Shift Supervisor', 'Graveside turns start with Loyalty.', 'loyalty'),
  powerStatus('pudding/warm-spot', 'Warm Spot by the Headstones', 'Unearthed lasts until the Trick is played.', 'unearthed'),
  powerStatus('pudding/family-plot', 'Family Plot', 'A fourth cemetery Plot.', 'plot'),
  powerStatus('pudding/cemetery-gates', 'Cemetery Gates', 'Once a turn, swap a Trick in hand for a Buried one.', 'plot'),
  powerStatus('pudding/forever-home', 'Forever Home', 'Maximum Loyalty 8; the overflow becomes Guard.', 'loyalty'),
  powerStatus('pudding/the-goodest-ghost', 'The Goodest Ghost', 'The first Unearthed Trick each turn leaves a free copy.', 'unearthed'),
  powerStatus('pudding/all-dogs-go-somewhere', 'All Dogs Go Somewhere', 'Once a combat, a Vanishing Trick is Buried instead.', 'plot'),
  powerStatus('pudding/graveyard-choir', 'Graveyard Choir', 'Graveside turns end with the residents singing.', 'graveside'),
  powerStatus('pudding/home-is-where-you-are', 'Home Is Where You Are', 'Once a combat, your Best Friend survives at 1 Courage.', 'best-friend'),
  powerStatus('pudding/the-whole-pack', 'The Whole Pack', 'Change Best Friend once a turn; Loyalty watches everyone.', 'best-friend'),

  // ── Mossbit ───────────────────────────────────────────────────────────────
  powerStatus('mossbit/quiet-monument', 'Quiet Monument', 'The first Epitaph each turn also Guards on creation.', 'epitaph'),
  powerStatus('mossbit/moss-grows-anyway', 'Moss Grows Anyway', 'The first Epitaph to mature each turn also Guards.', 'epitaph'),
  powerStatus('mossbit/longer-memory', 'Longer Memory', 'Maximum Patience 5.', 'patience'),
  powerStatus('mossbit/set-in-stone', 'Set in Stone', 'Epitaphs take 1 longer and hit harder.', 'epitaph'),
  powerStatus('mossbit/grave-moss', 'Grave Moss', 'Erasing an Epitaph Guards and eases Buried Harm.', 'epitaph'),
  powerStatus('mossbit/cemetery-shift', 'Cemetery Shift', 'Buried Harm becomes an Epitaph at the start of your turn.', 'buried-harm'),
  powerStatus('mossbit/small-monument', 'Small Monument', 'Weathering something arms your next Epitaph with Guard.', 'weathering'),
  powerStatus('mossbit/no-rush', 'No Rush', 'The first Epitaph you put back each turn draws.', 'epitaph'),
  powerStatus('mossbit/lichen-clock', 'Lichen Clock', 'The first Epitaph to mature hurries the next one.', 'epitaph'),
  powerStatus('mossbit/keep-the-appointment', 'Keep the Appointment', 'An aimed Epitaph finds a new target instead of fizzling.', 'epitaph'),
  powerStatus('mossbit/geological-patience', 'Geological Patience', 'Patience you cannot hold becomes damage and Guard.', 'patience'),
  powerStatus('mossbit/house-never-forgets', 'House Never Forgets', 'A matured Epitaph writes itself again at 3.', 'epitaph'),
  powerStatus('mossbit/weathered-beyond', 'Weathered Beyond Recognition', 'Weathered Tricks cost less; unfinished ones cost more.', 'weathering'),
  powerStatus('mossbit/monument-to-small-things', 'Monument to Small Things', 'Clearing Buried Harm makes Epitaphs stronger, cumulatively.', 'buried-harm'),
  powerStatus('mossbit/mansion-moves', 'The Mansion Moves Around Me', 'A quiet turn advances Weathering and delays your oldest Epitaph.', 'weathering'),
  powerStatus('mossbit/already-written', 'Already Written', 'Two more Epitaph slots.', 'epitaph'),
  powerStatus('mossbit/death-can-wait', 'Death Can Wait', 'Once a fight, lethal Buried Harm is cleared and everything fires.', 'buried-harm'),
  powerStatus('mossbit/family-plot', 'Family Plot', 'The first Epitaph to mature each turn Guards every friend.', 'epitaph'),
];

export const STATUS_IDS = COMPANION_STATUSES.map(s => s.id);

/**
 * Hook names used above that are NOT in the StatusDef hook set documented in
 * schema.js.  combat-engine needs to fire these for the marked statuses to work.
 * Everything else a Companion Power does is handled inside data/companions/**.
 */
export const ENGINE_HOOKS_REQUIRED = [
  { hook: 'onAttack', when: 'An enemy finishes a damaging move.', neededBy: ['haunt'] },
  { hook: 'onAttackDealt', when: 'The player finishes resolving an Attack card.', neededBy: ['empowered'] },
  { hook: 'onIncomingHit', when: 'Per individual attack hit against the player, before mitigation.', neededBy: ['play-dead'] },
  { hook: 'onLethal', when: 'A hit is about to reduce the player to 0 Courage.', neededBy: ['not-dead-yet'] },
  { hook: 'onCourageLoss', when: 'A hit has been through Guard and is about to cost Courage. Mutable via setAmount, and it runs BEFORE onLethal so halving a killing blow can save you.', neededBy: ['cushion'] },
  { hook: 'onDebuffIncoming', when: 'A debuff is about to land on the player.', neededBy: ['nope'] },
  { hook: 'enemyTurnEnd decay', when: 'Decay bucket that expires at the end of the enemy turn.', neededBy: ['ghoststep'] },
];

/**
 * Self-register with the engine's status registry.  `data/statuses.js` is the
 * documented entry point for content agents, and `data/keywords.js` already
 * dynamic-imports this module for COMPANION_KEYWORDS, so importing it here means
 * combat-engine has to do nothing at all.  Guarded so the validation page and any
 * headless tooling still load if the combat folder is absent.
 */
try {
  const m = await import('../statuses.js');
  if (m.registerStatuses) m.registerStatuses(COMPANION_STATUSES);
  else if (m.registerStatus) COMPANION_STATUSES.forEach(s => m.registerStatus(s));
} catch (_) { /* engine not present — keyword data is still exported */ }

export default { COMPANION_KEYWORDS, COMPANION_STATUSES, KEYWORD_IDS, STATUS_IDS, ENGINE_HOOKS_REQUIRED };
