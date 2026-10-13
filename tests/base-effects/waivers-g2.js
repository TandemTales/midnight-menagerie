/* Base-effect waivers, group 2 (pipkin, boggle, hush, wink). OWNER: companion-cards.
   [id, 'why the gate's one seeded board cannot show it'] - each one is proved
   live by proofs-g2.html (python tests/base-effects/run.py g2). */
export default [
  // Pipkin: the seeded Patch is empty, so nothing can be advanced or Harvested.
  ['pipkin/damp-corner', 'Advances a Patch object, and the seeded Patch is empty'],
  ['pipkin/warm-windowsill', 'Advances Patch objects, and the seeded Patch is empty'],
  ['pipkin/overnight-miracle', 'A growth step on an empty Patch moves nothing'],
  ['pipkin/moonbeam-on-the-patch', 'Advances every Seed or Sprout, and the seeded Patch is empty'],
  ['pipkin/pick-one', 'Harvest needs a Pumpkin, and the seeded Patch is empty'],
  ['pipkin/choose-the-biggest', 'Harvest needs a Pumpkin, and the seeded Patch is empty'],
  ['pipkin/pantry-raid', 'Harvest needs Pumpkins, and the seeded Patch is empty'],
  ['pipkin/replant-the-rind', 'Harvest needs a Pumpkin, and the seeded Patch is empty'],
  ['pipkin/picnic-basket', 'Harvest needs a Pumpkin, and the seeded Patch is empty'],
  ['pipkin/perfect-harvest', 'Harvest needs Pumpkins, and the seeded Patch is empty'],
  ['pipkin/back-to-seed', 'Turns Pumpkins into Seeds, and the seeded Patch is empty'],
  ['pipkin/store-for-supper', 'Harvest needs Pumpkins, and the seeded Patch is empty'],
  ['pipkin/pick-of-the-patch', 'Harvest needs a Pumpkin, and the seeded Patch is empty'],
  ['pipkin/harvest-festival', 'Harvest needs Pumpkins, and the seeded Patch is empty'],

  // Boggle: every seeded enemy is Aware with 0 Fright, and the follow-up plays
  // Attack the target before any Search can happen.
  ['boggle/dont-move', 'Needs an Unaware enemy, and every seeded enemy is Aware'],
  ['boggle/cozy-darkness', 'Counts Unaware or Suspicious enemies, and every seeded enemy is Aware'],
  ['boggle/closer-closer', 'Playable only while an enemy is Unaware, and every seeded enemy is Aware'],
  ['boggle/lump-under-the-blanket', 'Pays when the enemy becomes Suspicious, which needs an Ambush on an Unaware enemy'],
  ['boggle/dont-turn-around', 'Marks an Unaware enemy that then Searches, and every seeded enemy is Aware'],
  ['boggle/dont-check-again', 'Marks an Unaware enemy that then Searches, and every seeded enemy is Aware'],
  ['boggle/keep-the-lights-off', 'Changes what an Ambush does, and no seeded enemy is Unaware to Ambush'],
  ['boggle/hide-in-plain-sight', 'Changes what an Ambush does, and no seeded enemy is Unaware to Ambush'],
  ['boggle/too-late-to-run', 'Only targets an enemy with 8 Fright, and the seeded Fright is 0'],
  ['boggle/every-creak-means-me', 'Doubles Fright, and the seeded Fright is 0'],
  ['boggle/dont-scream-yet', 'Saves the Fright a Scare spends, and nothing Scares on the seeded board'],
  ['boggle/perfect-distraction', 'Pays on a friend Attacking, and the friend at the table never plays a Trick'],
  ['boggle/count-to-three', 'Pays on a friend damaging the enemy, and the friend at the table never plays a Trick'],

  // Hush: the seeded Shadow Pocket is empty, and the gate deals every Trick to the hand.
  ['hush/make-room', 'Swaps with a Trick in the Shadow Pocket, and the seeded Pocket is empty'],
  ['hush/shhh', 'Discounts Tricks in the Shadow Pocket, and the seeded Pocket is empty'],
  ['hush/under-the-door', 'Needs a Trick to have left the Shadow Pocket this turn, and none has'],
  ['hush/behind-you', 'Playable only from the Shadow Pocket, and the gate deals every Trick to the hand'],
  ['hush/whole-ferret-no-warning', 'Playable only from the Shadow Pocket, and the gate deals every Trick to the hand'],
  ['hush/empty-the-pockets', 'Plays Contraband from the Shadow Pocket, and the seeded Pocket is empty'],
  ['hush/all-according-to-hush', 'Primes a Trick in the Shadow Pocket for when he is next Seen; the Pocket is empty and he is never Unseen'],
  ['hush/buried-in-the-couch', 'Removes Statuses and Curses, and the seeded deck has none'],
  ['hush/three-places-at-once', 'Copies a Trick when it Scurries, and nothing Scurries after it on the seeded board'],

  // Wink: no Read, no Preview, no Set on the seeded board, and 6 Web.
  ['wink/watch-this-one', 'Set on an enemy with an unresolved Read, and the seeded board has no Read'],
  ['wink/rehearsed-pounce', 'Set on an enemy with an unresolved Read, and the seeded board has no Read'],
  ['wink/gotcha', 'Playable only after a Read succeeded this turn, and the seeded board has no Read'],
  ['wink/i-meant-that-one', 'Rescues an unresolved Read, and the seeded board has no Read'],
  ['wink/red-string-theory', 'Webs enemies with a Previewed Intent, and nothing is Previewed on the seeded board'],
  ['wink/set-the-table', 'Discounts the next Set Trick, and the seeded deck holds no Set Trick to play after it'],
  ['wink/house-spider', 'Re-Sets Set Tricks from the discard, and the seeded discard holds none'],
  ['wink/snip-here', 'Needs 8 Web on the target, and the seeded Web is 6'],
  ['wink/forked-future', 'Needs two Previewed Intents, and nothing is Previewed on the seeded board'],
  ['wink/back-pocket-web', 'Returns an active Set, and the seeded board has none'],
];
