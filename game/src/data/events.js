/**
 * Curiosities — the authored branching encounters.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §26 (Scratching Behind the
 * Wall, The Collar, The Feeding Room, The Photograph) and the Foyer's own room
 * list in docs/design/regions/01-foyer.md.
 *
 * A Curiosity is not a slot machine.  Every option is a decision the player can
 * reason about before taking it: the risk is *named* in the option's `risk`
 * line, the reward is named in `reward`, and the only thing hidden is which of
 * the authored outcomes you land on.
 *
 * ── What `risk` and `reward` are for (read this before writing one) ─────────
 * They name the **kind of thing at stake**, never the flavour and never the
 * roll.  This build shipped with `RISK You might find it / GAIN You might find
 * it`, which is beautiful prose and a blind gamble — in a game whose combat is
 * a clarity showcase.  Slay the Spire's `?` rooms always tell you the shape of
 * the bet: HP, gold, a relic, a card, a curse, a fight.  So do these.
 *
 * The vocabulary is the player's own nouns, and one line names at most two:
 *   Courage · maximum Courage · Buttons · a Keepsake · a Trick · a Snack
 *   a Clue · a Curse in your deck · a fight / a Big Scare · Nothing
 *
 * Say `Nothing` only when the option genuinely cannot cost anything.  Say "or"
 * when the outcomes disagree about which resource moves ('Buttons, or a
 * Keepsake') and "and" when they all deliver both.  Hedge with "maybe" when
 * only some outcomes carry it.  What stays hidden — and should — is which
 * authored outcome you land on and how big the number is.
 *
 * `scenes/event.js` labels the pair `risk`/`gain` when an option has more than
 * one outcome and `costs`/`always` when it has exactly one, so "this is a bet"
 * and "this is a price" never look the same on the button.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * {
 *   id, name, room, mood,
 *   regions: ['any'] | ['foyer', …],   where it may appear
 *   minDepth: 0,                       earliest map row
 *   once: true,                        never twice in one run
 *   text: [ 'paragraph', … ],
 *   options: [{
 *     id, label,
 *     requires: 'camera' | 'canine' | ['a','b'],   Backpack gate (id or tag)
 *     gateText:  what the option says while locked
 *     risk / reward:  one short line each, shown on the button
 *     outcomes: [{ w, title, text, effects }]      weighted; w defaults to 1
 *     effects:  shorthand for a single certain outcome
 *   }]
 * }
 *
 * ── Effects vocabulary (applied by state/run.js, nothing else) ──────────────
 *   hp: n            change Courage (negative hurts, can end a run)
 *   heal: n          recover Courage, capped at max
 *   maxHp: n         change maximum Courage
 *   lostThings: n    currency
 *   snacks: n
 *   clues: n
 *   relic: 'common'|'uncommon'|'rare'|'event'|'<relic id>'
 *   card: {rarity, count, upgraded}   add a Trick straight to the deck
 *   curse: '<curse card id>'
 *   removeCard: n    forget n Tricks (opens a picker)
 *   upgradeCard: n   upgrade n Tricks (opens a picker)
 *   combat: 'standard'|'elite'        the room turns into a fight
 *   heat: n          Haunt pressure for the rest of the region (unused for now)
 *
 * Every string here is player-facing. Cute-spooky, warm, a little sad
 * underneath — the kids are looking for their pets and the house is not, in its
 * own opinion, doing anything wrong.
 */

// ─────────────────────────────────────────────────────────────────────────────

/** @type {any[]} */
/* The currency's NAME lives in one place. Every `risk`/`reward`/`label`
   below interpolates it rather than spelling it out, so renaming the
   currency is one line in schema.js and not twenty-six here. */
import { TERMS } from './schema.js';

export const CURIOSITIES = [

  // ── §26: Scratching Behind the Wall ────────────────────────────────────────
  {
    id: 'scratching-behind-the-wall',
    name: 'Scratching Behind the Wall',
    room: 'A papered corridor',
    mood: 'listen',
    regions: ['any'], minDepth: 0, once: true, weight: 3,
    text: [
      'A faint scritch travels along the wall beside you.',
      'It stops. A service panel lifts a fraction, catches on its painted screws, and settles.',
      'A narrow gap remains beneath it. Something shiny rests just inside.',
    ],
    options: [
      {
        id: 'open', label: 'Open the panel.',
        requires: 'multitool',
        gateText: 'The screws are painted in. You would need a tool.',
        risk: "Up to 6 Courage, or a Curse",
        reward: `Possible ${TERMS.gold}, Keepsake, or Clues`,
        outcomes: [
          { w: 3, title: 'A dusty visitor',
            text: 'A gray cat squeezes out and immediately washes one paw. Behind the panel: a nest of Buttons and a food dish. The dish is clean. The wall is not.',
            effects: { lostThings: 55, clues: 1 } },
          { w: 2, title: 'A generous handshake',
            text: 'A bundle of coat hangers offers a hook. It shakes your tool, then the tool bag, then the bag strap. Its thank-you gift finally lets you step away.',
            effects: { relic: 'common', hp: -6 } },
          { w: 2, title: 'A busy wall',
            text: 'The little space is empty. Scratch marks run between a food dish and a tiny closed hatch. A loose hanger suddenly clatters down. The noise stays with you.',
            effects: { clues: 1, curse: 'curse/night-terror' } },
        ],
      },
      {
        id: 'call', label: 'Call through the wall.',
        risk: "Up to 4 Courage",
        reward: `Clues; possibly 15 ${TERMS.gold}`,
        outcomes: [
          { w: 3, title: 'An answer',
            text: 'You call hello. A nose touches the gap, then withdraws. Fresh paw prints cross older ones beside a bowl of water. A Button rolls out.',
            effects: { clues: 2, lostThings: 15 } },
          { w: 2, title: 'An echo with opinions',
            text: 'You call hello. The wall calls HELLO back much louder. Your Companion pauses beside you. A second, much smaller hello follows.',
            effects: { clues: 1, hp: -4 } },
        ],
      },
      {
        id: 'feed', label: 'Post food under the panel.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to give it.',
        risk: `25 ${TERMS.gold}`,
        reward: "A Keepsake and a Clue",
        outcomes: [
          { w: 1, title: 'Fair trade',
            text: 'Treats slide under the panel. A paw taps a price on the wood. When you leave the Buttons, a wrapped Keepsake slides through the gap. Business concluded.',
            effects: { relic: 'lucky-button', clues: 1, lostThings: -25 } },
        ],
      },
      {
        id: 'leave', label: 'Leave the panel alone.',
        risk: 'Nothing',
        reward: 'A little Courage back',
        effects: { heal: 4 },
        outcomes: [
          { w: 1, title: 'On your way',
            text: 'You leave space beside the panel. Behind you, a soft click is followed by a very thorough sneeze. Your Companion stays near.',
            effects: { heal: 4 } },
        ],
      },
    ],
  },

  // ── §26: The Collar ────────────────────────────────────────────────────────
  {
    id: 'the-collar',
    name: 'The Collar',
    room: 'An empty room',
    mood: 'sad',
    regions: ['any'], minDepth: 1, once: true, weight: 3,
    text: [
      'An empty room has one boarded window. A little stool stands under it.',
      'A worn red collar lies below the stool. Its tag is polished on the side facing the floor.',
    ],
    options: [
      {
        id: 'take', label: 'Pick it up.',
        risk: "5 or 12 Courage",
        reward: "A Keepsake and a Clue",
        outcomes: [
          { w: 3, title: 'A sudden rattle',
            text: 'The collar is soft with wear. As you lift it, the window rattles sharply. A small paw print shows on the stool, facing the window.',
            effects: { relic: 'the-collar', clues: 1, hp: -5 } },
          { w: 2, title: 'A loud objection',
            text: 'The boards bang against the window. You keep the collar, but the sudden noise rattles you. Beneath its buckle is a tiny patch of dried garden mud.',
            effects: { relic: 'the-collar', hp: -12, clues: 1 } },
        ],
      },
      {
        id: 'read', label: 'Read the tag and copy it down.',
        requires: ['notebook', 'record'],
        gateText: 'You would need something to write on.',
        risk: 'Nothing',
        reward: `Three Clues, and ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'A place to call',
            text: 'The name has worn away. A phone number remains, beside the words CALL HOME. The inside is stitched with a row of little stars. You copy both details.',
            effects: { clues: 3, lostThings: 20 } },
        ],
      },
      {
        id: 'leave', label: 'Leave it exactly where it is.',
        risk: 'Nothing',
        reward: 'Courage, and a Clue',
        outcomes: [
          { w: 1, title: 'A quiet room',
            text: 'You leave the collar where it is. The window settles. In the quiet, you notice that the stool has been nudged away from a soft bed and toward the glass.',
            effects: { heal: 10, clues: 1 } },
        ],
      },
    ],
  },

  // ── §26: The Feeding Room ──────────────────────────────────────────────────
  {
    id: 'the-feeding-room',
    name: 'The Feeding Room',
    room: 'A long service room',
    mood: 'unsettling',
    regions: ['any'], minDepth: 2, once: true, weight: 3,
    text: [
      'Bowls stand in neat rows. One row is straight. The next has gone around a table leg.',
      'Some bowls are patched; others are shiny and new. Fresh food fills four near the window.',
      'A jug tips water into each dish, including the empty space where a dish ought to be. It waits for the water to become a bowl.',
    ],
    options: [
      {
        id: 'fill', label: 'Fill the empty ones.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to put in them.',
        risk: `30 ${TERMS.gold}`,
        reward: "A Keepsake and a Clue",
        outcomes: [
          { w: 1, title: 'One more place',
            text: 'You share the treats and leave Buttons for more food. The jug stops pouring onto the floor. A little bowl slides toward you. Your name is already on it.',
            effects: { relic: 'bowl-with-your-name', clues: 1, lostThings: -30 } },
        ],
      },
      {
        id: 'read', label: 'Read the names on the bowls.',
        risk: "Up to 6 Courage",
        reward: "Clues; possibly 4 maximum Courage",
        outcomes: [
          { w: 3, title: 'Names and arrows',
            text: 'The bowls have many different names. Several have arrows pointing toward the same little door. The door shuts with a bang as you inspect it.',
            effects: { clues: 3, hp: -6 } },
          { w: 2, title: 'Careful repairs',
            text: 'Dates beside the cracks mark repairs. One bowl has been mended six times. The latest repair follows a tiny tooth mark instead of hiding it.',
            effects: { clues: 2, maxHp: 4 } },
        ],
      },
      {
        id: 'wait', label: 'Wait quietly by the door.',
        risk: "Up to 14 Courage",
        reward: "A Clue, plus a Keepsake or Snack",
        outcomes: [
          { w: 2, title: 'The feeder',
            text: 'You wait nearby. A tall apron, with no one visible inside, checks each bowl. It leaves a small gift beside you, then tries to wipe up its own reflection.',
            effects: { relic: 'uncommon', clues: 1 } },
          { w: 2, title: 'A place for you',
            text: 'The apron whirls around and drops an entire stack of spoons. Once the clatter stops, it sets out a human-sized bowl and a Snack. It has noticed its extra guest.',
            effects: { hp: -14, clues: 1, snacks: 1 } },
        ],
      },
      {
        id: 'leave', label: 'Close the door quietly.',
        risk: 'Nothing',
        reward: 'A little Courage back',
        outcomes: [
          { w: 1, title: 'Let them eat',
            text: 'You close the door gently. The jug starts again. This time you hear water landing in a bowl.',
            effects: { heal: 5 } },
        ],
      },
    ],
  },

  // ── §26: The Photograph ────────────────────────────────────────────────────
  {
    id: 'the-photograph',
    name: 'The Photograph',
    room: 'A portrait hall',
    mood: 'revelation',
    regions: ['any'], minDepth: 2, once: true, weight: 3,
    text: [
      'A small photograph shows a cat on a striped cushion. Beside it, another photograph shows a translucent cat on the same cushion.',
      'Both cats have one folded ear. Both have shoved the same red toy into the same corner.',
      'Neither picture has a date. A tiny corner of writing peeks out beneath the frame.',
    ],
    options: [
      {
        id: 'photograph', label: 'Photograph the photograph.',
        requires: ['camera', 'photo'],
        gateText: 'You would need a camera.',
        risk: "7 Courage",
        reward: "3 Clues and a Keepsake",
        outcomes: [
          { w: 1, title: 'The edge of the picture',
            text: 'Your camera catches the writing: SAME CUSHION, PLEASE. A frame suddenly tilts toward the lens. Then another. They all want their picture taken.',
            effects: { clues: 3, relic: 'photograph-of-a-cat', hp: -7 } },
        ],
      },
      {
        id: 'take', label: 'Take the photograph out of the frame.',
        risk: "Up to 10 Courage",
        reward: "2 Clues; possibly 5 maximum Courage",
        outcomes: [
          { w: 3, title: 'A note on the back',
            text: 'The back reads: STILL LIKES THE RED ONE. The red toy appears in both photographs, worn at the same seam.',
            effects: { clues: 2, maxHp: 5 } },
          { w: 2, title: 'A crowded audience',
            text: 'Every frame swings toward you at once. It is a startling amount of attention for one small photograph. The note on its back reads: STILL LIKES THE RED ONE.',
            effects: { clues: 2, hp: -10 } },
        ],
      },
      {
        id: 'ask', label: 'Examine it beside your Companion.',
        risk: "Up to 4 Courage",
        reward: "Maximum Courage and a Clue; possible healing",
        outcomes: [
          { w: 3, title: 'A careful look',
            text: 'You examine the pictures beside your Companion. The folded ear and worn toy match in both. A new outline has not erased every familiar thing.',
            effects: { clues: 1, heal: 10, maxHp: 3 } },
          { w: 2, title: 'Something missing',
            text: 'You examine the pictures beside your Companion. A frame snaps shut with a pop, startling you. Neither picture tells you whether this cat wanted to change.',
            effects: { clues: 1, hp: -4, maxHp: 6 } },
        ],
      },
    ],
  },

  // ── Foyer authored rooms ───────────────────────────────────────────────────
  {
    id: 'the-house-register',
    name: 'The House Register',
    room: 'House Register Alcove',
    mood: 'investigation',
    regions: ['foyer', 'study-library'], minDepth: 1, once: true, weight: 2,
    text: [
      'A brass lamp lights a book so large it has its own stool.',
      'Pages record animals, rooms, meals, and care. Some entries have been corrected carefully.',
      'The ARRIVAL column is crowded. The RETURN column has much more space.',
    ],
    options: [
      {
        id: 'find', label: 'Compare arrivals and returns.',
        risk: "Up to 6 Courage",
        reward: "Clues, plus maximum Courage or healing",
        outcomes: [
          { w: 3, title: 'Two columns',
            text: 'One entry says RECOVERED. Beneath it: HOME KNOWN. The return box is crossed out, with SAFER HERE pressed hard over it. The lamp flickers as you read.',
            effects: { clues: 3, hp: -6, maxHp: 4 } },
          { w: 2, title: 'An unfinished entry',
            text: 'A page lists fresh bedding and a meal, then stops. There is no animal name yet. A prepared place does not tell you who, if anyone, arrived.',
            effects: { clues: 2, heal: 8 } },
        ],
      },
      {
        id: 'tear', label: 'Tear out the last page.',
        risk: "A Scuffle, or 8 Courage and a Curse",
        reward: "Possibly 4 Clues",
        outcomes: [
          { w: 2, title: 'The book complains',
            text: 'You take the page. It lists several requests to go home, each crossed out. The lamp flashes; a guardian comes to reclaim the page.',
            effects: { clues: 4, combat: 'standard' } },
          { w: 2, title: 'Stubborn ink',
            text: 'The page comes free, but its words slide back into the book. The sudden movement makes you jump. One phrase remains on the paper: RETURN REQUESTED.',
            effects: { hp: -8, curse: 'curse/regret' } },
        ],
      },
      {
        id: 'sign', label: 'Write your own name in it.',
        risk: "4 maximum Courage",
        reward: "A Keepsake",
        outcomes: [
          { w: 1, title: 'Guest',
            text: 'You sign. A key drops beside the book with a very loud clink. The lamp dims; the room feels smaller. Your entry says GUEST. No return date has been added.',
            effects: { relic: 'spare-key', maxHp: -4 } },
        ],
      },
    ],
  },

  {
    id: 'the-bell-pull',
    name: 'The Bell Pull',
    room: 'Bell Pull Gallery',
    mood: 'mischief',
    regions: ['foyer'], minDepth: 1, once: true, weight: 2,
    text: [
      'A velvet rope hangs beside a plate: RING FOR SERVICE.',
      'Above it, little bells tremble on a board. One shakes so hard that its name plate has turned upside down.',
    ],
    options: [
      {
        id: 'ring', label: 'Ring it.',
        risk: "A possible Big Scare",
        reward: `60 ${TERMS.gold}, or 2 Snacks and healing`,
        outcomes: [
          { w: 2, title: 'Very prompt service',
            text: 'A tall service guardian arrives carrying a tray like a shield. It mistakes your raised hand for a challenge. The tray rattles: service has become a Scuffle.',
            effects: { combat: 'elite', lostThings: 60 } },
          { w: 3, title: 'A helpful tray',
            text: 'A tray floats over with two Snacks. It circles until both handles point toward you. Then it circles again, just to be extremely helpful.',
            effects: { snacks: 2, heal: 12 } },
        ],
      },
      {
        id: 'cut', label: 'Cut the rope down.',
        requires: ['multitool', 'open'],
        gateText: 'You would need something with a blade.',
        risk: 'Nothing',
        reward: `Clues, and ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'A useful silence',
            text: 'The rope drops. In the quiet you hear water dishes being filled behind a wall. A little pile of Buttons spills from the rope housing.',
            effects: { clues: 3, lostThings: 60 } },
        ],
      },
      {
        id: 'read', label: 'Read the room labels.',
        risk: 'Nothing',
        reward: `${TERMS.gold}, and a Clue`,
        outcomes: [
          { w: 1, title: 'Two extra rooms',
            text: 'Most plates name rooms. Two show paw prints beside little beds. One of those bells is muffled with cloth. Buttons have collected on the ledge below.',
            effects: { lostThings: 25, clues: 1 } },
        ],
      },
    ],
  },

  {
    id: 'the-umbrella-fort',
    name: 'The Umbrella Gallery',
    room: 'Umbrella Gallery',
    mood: 'warm',
    regions: ['foyer', 'any'], minDepth: 1, once: true, weight: 2,
    text: [
      'Umbrellas crowd around an enormous table. Every curved handle points toward it.',
      'A folded blanket waits on the tabletop. One umbrella opens eagerly, bumping three others. The whole row performs a brief, noisy bow.',
    ],
    options: [
      {
        id: 'build', label: 'Build the fort. Properly.',
        risk: "Nothing",
        reward: "Healing and one Trick sharpened",
        outcomes: [
          { w: 1, title: 'A very fine roof',
            text: 'You arrange the blanket and umbrellas into a snug shelter. Your Companion settles nearby. For a while, the only thing to practice is getting comfortable. Then a Trick clicks into place.',
            effects: { heal: 22, upgradeCard: 1 } },
        ],
      },
      {
        id: 'search', label: 'Go through the umbrella stands.',
        risk: "Up to 9 Courage",
        reward: `40–70 ${TERMS.gold}; possibly a Clue`,
        outcomes: [
          { w: 3, title: 'Hollow handles',
            text: 'Several handles unscrew. Inside: Buttons and a tiny photograph of a dog carrying an umbrella. The dog has chosen the middle of the handle. Admirably balanced.',
            effects: { lostThings: 70, clues: 1 } },
          { w: 2, title: 'Occupied',
            text: 'A stand objects with an umbrella. The sudden snap makes you jump. Buttons spill out; the umbrella immediately pretends it was helping.',
            effects: { hp: -9, lostThings: 40 } },
        ],
      },
      {
        id: 'take-umbrella', label: 'Check the largest umbrella for supplies.',
        risk: 'Nothing',
        reward: `${TERMS.gold}, and a Snack`,
        outcomes: [
          { w: 1, title: 'Packed for rain',
            text: 'Inside the largest umbrella are Buttons and a wrapped Snack. The umbrella opens proudly to display its empty pockets. It has packed everything except itself.',
            effects: { lostThings: 70, snacks: 1 } },
        ],
      },
    ],
  },

  {
    id: 'the-cat-flap',
    name: 'The Cat Flap',
    room: 'An interior door',
    mood: 'curious',
    regions: ['any'], minDepth: 0, once: true, weight: 2,
    text: [
      'A cat flap joins two indoor rooms. Warm grass brushes its lower edge.',
      'Through the gap comes the smell of sunshine. The hall on your side smells mostly of floor polish.',
    ],
    options: [
      {
        id: 'look', label: 'Look through the open flap.',
        /* The one option in the game that put the SAME noun on both tags with
           no word between them to say they were alternatives: `RISK Courage /
           GAIN Clues, and a little Courage` read as a wash rather than a bet,
           and a playtester read it as a bug. The other four Courage-swinging
           options are already legible because their gain side names *maximum*
           Courage, which is a different resource in the player's vocabulary.
           "instead" is the hedge the vocabulary note asks for: Clues either
           way, and the Courage goes one direction or the other, not both. */
        risk: "Up to 10 Courage",
        reward: "Clues, with possible healing",
        outcomes: [
          { w: 3, title: 'A sunny patch',
            text: 'Beyond the flap, animals rest in warm grass beneath an indoor sky. One lifts its head, yawns, and puts its chin back down. The grass grows right up to the sill.',
            effects: { clues: 3, heal: 8 } },
          { w: 2, title: 'A close inspection',
            text: 'A curious eye appears on the other side at exactly the same moment. You both startle. Then the eye politely moves back.',
            effects: { hp: -10, clues: 1 } },
        ],
      },
      {
        id: 'whistle', label: 'Whistle through it.',
        requires: ['dog-whistle', 'call'],
        gateText: 'You have nothing that would carry.',
        risk: `35 ${TERMS.gold}`,
        reward: "A Keepsake, 2 Clues and healing",
        outcomes: [
          { w: 1, title: 'A small visitor',
            text: 'A scruffy terrier pokes its head through, sniffs, and drops a tag beside a little payment dish. You leave the Buttons. The terrier takes a drink, then trots back into the grass.',
            effects: { relic: 'collar-tag', clues: 2, heal: 6, lostThings: -35 } },
        ],
      },
      {
        id: 'reach', label: 'Reach through.',
        risk: "Up to 6 Courage",
        reward: "A Keepsake and healing; or maximum Courage and a Clue",
        outcomes: [
          { w: 2, title: 'Summer on your sleeve',
            text: 'Your hand brushes warm grass. A breeze rolls a small Keepsake within reach. Three seeds cling to your sleeve as you draw it back.',
            effects: { relic: 'common', heal: 5 } },
          { w: 2, title: 'A firm handshake',
            text: 'A leafy tendril curls around your hand. The surprise gives you a jolt. You draw back; it opens immediately, leaving a green leaf in your palm.',
            effects: { maxHp: 6, hp: -6, clues: 1 } },
        ],
      },
    ],
  },

  {
    id: 'the-dumbwaiter',
    name: 'The Dumbwaiter',
    room: 'A service shaft',
    mood: 'trade',
    regions: ['any'], minDepth: 1, once: true, weight: 2,
    text: [
      'A little lift waits behind a hatch. It has a rope, a wooden box, and a shelf full of tiny empty plates.',
      'On the box: SEND SOMETHING GOOD. Beneath it, in smaller writing: NO MORE SPOONS.',
    ],
    options: [
      {
        id: 'send-things', label: `Send up 55 ${TERMS.gold}.`,
        cost: { lostThings: 55 },
        risk: `55 ${TERMS.gold}`,
        reward: `A Keepsake; or 10 ${TERMS.gold} and 2 Clues`,
        outcomes: [
          { w: 3, title: 'A good exchange',
            text: 'The box goes up and returns with a Keepsake on a tiny plate. A note says THANK YOU. There is also one spoon, crossed out with chalk.',
            effects: { relic: 'uncommon' } },
          { w: 2, title: 'A modest exchange',
            text: 'The box returns with a marble, a few Buttons, and a torn care record. The record lists fresh water and a request to open a garden door. The request has no answer.',
            effects: { lostThings: 10, clues: 2 } },
        ],
      },
      {
        id: 'send-toy', label: 'Send up the toy.',
        requires: ['familiar-toy', 'pet'],
        gateText: 'You would have to have brought something of theirs.',
        risk: "Nothing",
        reward: "4 Clues, 8 maximum Courage and healing",
        outcomes: [
          { w: 1, title: 'Returned with interest',
            text: 'The toy returns with fresh tooth marks and a loose feather beside it. Two different visitors may have inspected it. Somebody upstairs is awake, but these traces do not tell you who.',
            effects: { clues: 4, maxHp: 8, heal: 10 } },
        ],
      },
      {
        id: 'ride', label: 'Send a ribbon up and trace its path.',
        risk: "6 or 16 Courage",
        reward: `90 ${TERMS.gold}, or a Keepsake`,
        outcomes: [
          { w: 2, title: 'A very long ribbon',
            text: 'You send a ribbon up with the box and follow its path from the hall. It leads to a cupboard full of Buttons. A tray pops out as you open it: surprise delivery.',
            effects: { lostThings: 90, hp: -6 } },
          { w: 2, title: 'Special delivery',
            text: 'The box returns too fast. You step back as it tips linen and a Keepsake across the floor with an enormous crash. The lift dings, pleased with itself.',
            effects: { hp: -16, relic: 'common' } },
        ],
      },
    ],
  },

  {
    id: 'the-lost-and-found',
    name: 'The Lost and Found',
    room: 'A cloakroom counter',
    mood: 'greedy',
    regions: ['any'], minDepth: 1, once: true, weight: 2,
    text: [
      'A counter faces a wall of cubbyholes, each stuffed with things separated from their owners.',
      'One shelf holds gloves. Another holds collars. A violin occupies three shelves and looks very pleased about it.',
    ],
    options: [
      {
        id: 'grab', label: 'Gather the loose Buttons.',
        risk: "13 Courage, or a Curse",
        reward: `45–130 ${TERMS.gold}`,
        outcomes: [
          { w: 3, title: 'A heavy collection',
            text: 'You gather loose Buttons. A coat hooks itself onto your bag too. It is surprisingly heavy and much too interested in staying with you.',
            effects: { lostThings: 130, curse: 'curse/heavy-heart' } },
          { w: 2, title: 'An attentive attendant',
            text: 'A small attendant pops up beneath your nose. The surprise costs you your Courage for a moment. It lets you keep the loose Buttons, then straightens the empty pile.',
            effects: { lostThings: 45, hp: -13 } },
        ],
      },
      {
        id: 'collars', label: 'Go through the collars.',
        risk: "4 Courage",
        reward: `3 Clues and 30 ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'Waiting to be returned',
            text: 'A collar clasp has been repaired with three careful loops of thread. The address on its tag matches the envelope beneath it, stamped and ready to post. A wooden bar holds the cubby shut. The service bell rings directly behind you.',
            effects: { clues: 3, lostThings: 30, hp: -4 } },
        ],
      },
      {
        id: 'ring', label: 'Ring the bell and ask properly.',
        risk: "Up to 6 maximum Courage",
        reward: "A Keepsake; possibly a Clue",
        outcomes: [
          { w: 3, title: 'One useful ticket',
            text: 'The attendant listens, then gives you a ticket. It points from the ticket to a cubby, and from the cubby to the door. This is where belongings wait to be collected.',
            effects: { relic: 'coatcheck-ticket', clues: 1 } },
          { w: 2, title: 'A very long wait',
            text: 'The attendant searches every shelf while bells ring overhead. By the time it returns with a Keepsake, the racket has worn you down. It solemnly hushes the smallest bell.',
            effects: { relic: 'uncommon', maxHp: -6 } },
        ],
      },
    ],
  },

  {
    id: 'the-portrait-that-follows',
    name: 'The Painted Dog',
    room: 'Portrait Hall',
    mood: 'sad',
    regions: ['foyer', 'ballroom', 'study-library', 'any'], minDepth: 1, once: true, weight: 2,
    text: [
      'Eleven portraits show the same brown-and-white spaniel in eleven extremely grand chairs.',
      'In each picture, the dog has pulled the cushion onto the floor.',
      'A twelfth frame is empty except for cushion-shaped dents in the paint.',
    ],
    options: [
      {
        id: 'call', label: 'Call it.',
        risk: 'Nothing',
        reward: 'Courage, and a Clue',
        outcomes: [
          { w: 1, title: 'A painted hello',
            text: 'At your call, eleven painted ears lift. A translucent spaniel steps out of the empty frame and noses your hand. Then it turns back toward its cushion, tail waving.',
            effects: { heal: 20, clues: 1 } },
        ],
      },
      {
        id: 'photograph', label: 'Photograph all eleven.',
        requires: ['camera', 'photo'],
        gateText: 'You would need a camera.',
        risk: 'Nothing',
        reward: `Four Clues, and ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'Eleven matching details',
            text: 'Every photograph catches the same crooked ear and heart-shaped patch. In the empty frame, the cushion bears a little sign: BACK AFTER A WALK. Buttons tumble from behind it.',
            effects: { clues: 4, lostThings: 25 } },
        ],
      },
      {
        id: 'straighten', label: 'Straighten the empty frame and move on.',
        risk: 'Nothing',
        reward: `A little Courage, and ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'Almost level',
            text: 'You straighten the frame. The spaniel pokes its head out to inspect the work, tilts the frame slightly, and disappears again. A few Buttons fall onto the ledge.',
            effects: { heal: 8, lostThings: 20 } },
        ],
      },
    ],
  },

  {
    id: 'moths-cousin',
    name: "Mr. Moth's Cousin",
    room: 'A folding table in a corridor',
    mood: 'trade',
    regions: ['any'], minDepth: 2, once: true, weight: 2,
    text: [
      'A coat stands behind a folding table. Something inside has arranged the sleeves to look very businesslike.',
      '“Mr. Moth’s cousin,” it announces. “On the coat side.”',
      'Three covered objects and a pair of scissors wait on the table. The scissors have their own tiny chair.',
    ],
    options: [
      {
        id: 'buy-blind', label: `Buy what is under the cloth. 80 ${TERMS.gold}.`,
        cost: { lostThings: 80 },
        risk: `80 ${TERMS.gold}`,
        reward: "A Rare Keepsake; or a Common Keepsake and Snack",
        outcomes: [
          { w: 3, title: 'A splendid flourish',
            text: 'The coat sweeps away the cloth. A Rare Keepsake gleams beneath it. The empty sleeve keeps sweeping, enjoying its big moment.',
            effects: { relic: 'rare' } },
          { w: 2, title: 'A smaller flourish',
            text: 'The coat reveals a modest Keepsake and a Snack. “Two things!” it declares. “Twice as many as one.”',
            effects: { relic: 'common', snacks: 1 } },
        ],
      },
      {
        id: 'scissors', label: 'Ask about the scissors.',
        risk: 'You must give up a Trick',
        reward: 'You choose which Trick goes',
        outcomes: [
          { w: 1, title: 'A clean snip',
            text: '“One Trick out, a little room made,” says the coat. It offers the scissors handles first. You choose which Trick to remove.',
            effects: { removeCard: 1 } },
        ],
      },
      {
        id: 'ask-moth', label: 'Ask whether Mr. Moth really has a cousin.',
        risk: `Up to 20 ${TERMS.gold}`,
        reward: `45 ${TERMS.gold} and a Clue; or a Keepsake`,
        outcomes: [
          { w: 2, title: 'A loose connection',
            text: '“Well. His coat hung beside mine once.” A sleeve droops. It offers Buttons by way of an apology, then moves the scissors’ chair a little closer.',
            effects: { lostThings: 45, clues: 1 } },
          { w: 2, title: 'Family resemblance',
            text: 'The coat points proudly to a matching button. “Same tailor.” It offers a Keepsake for twenty Buttons. The scissors stand up as though the deal deserves applause.',
            effects: { relic: 'shop', lostThings: -20 } },
        ],
      },
    ],
  },

  {
    id: 'the-open-window',
    name: 'The Open Window',
    room: 'A landing',
    mood: 'escape',
    regions: ['any'], minDepth: 2, once: true, weight: 2,
    text: [
      'An open window faces a wall that should have another room behind it.',
      'Cool air carries a distant car noise. A narrow ledge curves out of sight.',
      'Muddy paw prints lead onto the ledge, beside scratches from a sliding latch.',
    ],
    options: [
      {
        id: 'follow', label: 'Trace the prints with your torch.',
        risk: "Up to 12 Courage",
        reward: `${TERMS.gold} and Clues`,
        outcomes: [
          { w: 3, title: 'A path around the corner',
            text: 'You follow the prints with your torch from the open window. The ledge bends into a nearby cupboard. Inside are Buttons and a muddy little resting place.',
            effects: { lostThings: 75, clues: 2 } },
          { w: 2, title: 'An abrupt closing',
            text: 'You trace the prints from inside. The window slams with a bang, rattling your courage and shaking Buttons from the sill. The prints continue under the cupboard door.',
            effects: { hp: -12, lostThings: 40, clues: 1 } },
        ],
      },
      {
        id: 'measure', label: 'Measure the prints and write it down.',
        requires: ['notebook', 'record', 'evidence'],
        gateText: 'You would need to write it down properly.',
        risk: 'Nothing',
        reward: 'Clues, and a little Courage',
        outcomes: [
          { w: 1, title: 'A small set of prints',
            text: 'Four toes. Five centimetres wide. The prints head toward the ledge; there is no matching trail back on this sill.',
            effects: { clues: 3, heal: 4 } },
        ],
      },
      {
        id: 'shut', label: 'Shut it.',
        risk: 'Nothing',
        reward: 'Maximum Courage',
        outcomes: [
          { w: 1, title: 'Closed for now',
            text: 'You shut the window. The rattling stops. The latch stays on your side, within reach, and you can hear the little door to the next room tapping in the breeze.',
            effects: { maxHp: 8 } },
        ],
      },
    ],
  },

  {
    id: 'the-coat-with-something-in-it',
    name: 'The Coat With Something In It',
    room: 'Coat Room',
    mood: 'mischief',
    regions: ['foyer', 'any'], minDepth: 0, once: true, weight: 2,
    text: [
      'Coats hang neatly from a rail, each with its buttons done up.',
      'One coat is breathing. Its empty sleeve is trying to look casual.',
    ],
    options: [
      {
        id: 'pockets', label: 'Go through the pockets. All of them.',
        risk: "Up to 11 Courage",
        reward: `45–85 ${TERMS.gold}; possibly a Clue`,
        outcomes: [
          { w: 3, title: 'Useful pockets',
            text: 'Inside are Buttons and a folded shopping list: WATER DISH, SOFT BED, SOMETHING TO CHEW. Beneath that, squeezed into the margin: OPEN THE DOOR?',
            effects: { lostThings: 85, clues: 1 } },
          { w: 2, title: 'A clingy coat',
            text: 'A sleeve wraps around your wrist and gives you a fright. It releases you when you pull back, then offers loose Buttons as though that had been its plan.',
            effects: { hp: -11, lostThings: 45 } },
        ],
      },
      {
        id: 'unbutton', label: 'Unbutton the breathing one.',
        risk: "Possibly 8 Courage and a Curse",
        reward: `A Keepsake and Snack; or 30 ${TERMS.gold}`,
        outcomes: [
          { w: 2, title: 'A rabbit in a coat',
            text: 'A large rabbit has been wearing the coat. It steps out, adjusts the collar with its nose, and hops along the rail. Behind it: a Keepsake and a Snack.',
            effects: { relic: 'uncommon', snacks: 1 } },
          { w: 2, title: 'An empty outfit',
            text: 'The coat is empty. It gives one enormous sigh anyway. Your own shadow briefly puts on a matching coat, which is unsettling. Buttons drop from the empty pocket.',
            effects: { hp: -8, curse: 'curse/clingy-shadow', lostThings: 30 } },
        ],
      },
      {
        id: 'leave-treat', label: 'Leave a treat in its pocket and go.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to leave.',
        risk: 'Nothing',
        reward: 'Courage, and Clues',
        outcomes: [
          { w: 1, title: 'A small thank-you',
            text: 'You leave the treat. A sleeve points to a hidden feeding hatch beside the rail, then gently pats the pocket. The hatch has been polished by many little noses.',
            effects: { heal: 14, clues: 2 } },
        ],
      },
    ],
  },

  {
    id: 'the-stair-cat',
    name: 'The Cat on the Stair',
    room: 'Grand Staircase',
    mood: 'warm',
    regions: ['any'], minDepth: 0, once: true, weight: 2,
    text: [
      'A tortoiseshell cat sits near the bottom of the staircase. Your Companion pauses beside you.',
      'The cat has left a way around, but watches it as though it has personally invented passing.',
    ],
    options: [
      {
        id: 'step-over', label: 'Go around the cat.',
        risk: 'A Curse in your deck',
        reward: `A few ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'A serious inspection',
            text: 'You go around the cat. It follows every movement with its eyes, then sneezes at the exact moment you relax. A few Buttons lie beside its step.',
            effects: { lostThings: 15, curse: 'curse/bad-luck' } },
        ],
      },
      {
        id: 'sit', label: 'Wait nearby.',
        risk: 'Nothing',
        reward: 'Clues, and Courage',
        outcomes: [
          { w: 1, title: 'The scenic route',
            text: 'You wait nearby. The cat stretches, moves one step, stretches again, then noses a little door open. A clean bed waits inside. The cat leaves the door open behind it.',
            effects: { clues: 3, heal: 12 } },
        ],
      },
      {
        id: 'ask', label: 'Let your Companion approach.',
        risk: "Up to 3 Courage",
        reward: "Maximum Courage, plus Clues or healing",
        outcomes: [
          { w: 3, title: 'A startling greeting',
            text: 'Your Companion approaches. The cat suddenly sneezes, startling you both. It sniffs in greeting, then turns toward the little room behind it. The door is propped open.',
            effects: { clues: 2, maxHp: 5, hp: -3 } },
          { w: 2, title: 'Room beside it',
            text: 'Your Companion stays nearby. The cat shifts to make a little more space. For a quiet moment, nobody needs anything from anyone.',
            effects: { heal: 18, maxHp: 3 } },
        ],
      },
    ],
  },

  {
    id: 'the-mended-thing',
    name: 'The Mended Thing',
    room: 'Mending Closet',
    mood: 'unsettling',
    regions: ['nursery', 'any'], minDepth: 1, once: true, weight: 2,
    text: [
      'A lamp lights a toy-repair bench. Glass eyes wait in a padded tray.',
      'A stuffed rabbit has mismatched ears, patched paws, and a red ribbon tied carefully around its middle.',
      'Beside it, a card asks: STILL THE SAME RABBIT?',
    ],
    options: [
      {
        id: 'yes', label: 'Sit beside the rabbit and rest.',
        risk: 'Nothing',
        reward: 'Maximum Courage, and a Snack',
        outcomes: [
          { w: 1, title: 'A warm light',
            text: 'You sit beside the rabbit. The lamp warms. A drawer slides open to offer a Snack, and the rabbit makes room on the cushion. You stay until you feel braver.',
            effects: { maxHp: 9, snacks: 1 } },
        ],
      },
      {
        id: 'no', label: 'Open the rattling repair drawer.',
        risk: "7 Courage",
        reward: "3 Clues and one Trick sharpened",
        outcomes: [
          { w: 1, title: 'Spring-loaded sewing',
            text: 'The drawer springs open with a BANG. It gives you a fright. Inside are repair sketches, a worn ribbon, and a drawing of this rabbit wearing it. A spring-loaded spool demonstrates a sharper way to use one of your Tricks.',
            effects: { clues: 3, hp: -7, upgradeCard: 1 } },
        ],
      },
      {
        id: 'mend', label: 'Mend something of your own.',
        risk: 'A Curse in your deck',
        reward: 'Two Tricks sharpened',
        outcomes: [
          { w: 1, title: 'An eager repair',
            text: 'You set out something to mend. The needles work briskly, then add one extra pocket in a completely silly place. There is a mitten in it. Just one.',
            effects: { upgradeCard: 2, curse: 'curse/lost-mitten' } },
        ],
      },
      {
        id: 'leave', label: 'Take the card and leave the rabbit.',
        risk: 'Nothing',
        reward: `Clues, and ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'A question worth keeping',
            text: 'You take the question card. Under it is a sketch of the rabbit before its repairs, still wearing the red ribbon. Loose Buttons sit beside the sewing kit.',
            effects: { clues: 2, lostThings: 20 } },
        ],
      },
    ],
  },

  {
    id: 'the-nights-arithmetic',
    name: "The Night's Arithmetic",
    room: 'A dark landing',
    mood: 'trade',
    regions: ['any'], minDepth: 3, once: true, weight: 2,
    text: [
      'A chalk sum crawls across the landing. Its answer keeps changing.',
      'Underneath: FIXING THIS COSTS SOMETHING. The chalk has underlined COSTS twice.',
      'A little chalk arrow points toward a clear patch of floor.',
    ],
    options: [
      {
        id: 'fix', label: 'Fix the sum.',
        risk: "8 maximum Courage, or one Trick",
        reward: `A Rare Keepsake, or 120 ${TERMS.gold}`,
        outcomes: [
          { w: 3, title: 'A tiring problem',
            text: 'You correct the sum. The numbers finally settle down, but the effort leaves you worn out. A Rare Keepsake appears in the space marked ANSWER.',
            effects: { relic: 'rare', maxHp: -8 } },
          { w: 2, title: 'An unusual exchange',
            text: 'The chalk trades one Trick for a heap of Buttons. It draws a circle around the pile, then adds two eyes. The answer looks delighted with itself.',
            effects: { removeCard: 1, lostThings: 120 } },
        ],
      },
      {
        id: 'add', label: 'Add a harder sum underneath.',
        risk: 'Nothing',
        reward: 'Clues, and a Trick sharpened',
        outcomes: [
          { w: 1, title: 'A better question',
            text: 'You add a harder sum. The chalk solves it, then draws four open doors and four little beds. Below: HOW MANY GUESTS? It leaves the answer blank.',
            effects: { clues: 3, upgradeCard: 1 } },
        ],
      },
      {
        id: 'rub', label: 'Rub it all out.',
        risk: "Nothing",
        reward: `Healing and 10 ${TERMS.gold}`,
        outcomes: [
          { w: 1, title: 'A clean start',
            text: 'You wipe the chalk away. Your Companion stays nearby as the landing grows quiet. One last chalk dot rolls off the floor like a Button. It is a Button.',
            effects: { heal: 12, lostThings: 10 } },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────
const BY_ID = new Map(CURIOSITIES.map(e => [e.id, e]));
export function eventById(id) { return BY_ID.get(id); }
export function allEvents() { return CURIOSITIES.slice(); }

/** Which Curiosities may appear here and now. */
export function eventsFor(regionId, { depth = 0, seen = [] } = {}) {
  const done = seen instanceof Set ? seen : new Set(seen);
  return CURIOSITIES.filter(e =>
    (!e.once || !done.has(e.id))
    && (e.regions.includes('any') || e.regions.includes(regionId))
    && depth >= (e.minDepth || 0));
}

/**
 * Pick one, deterministically.  Falls back to the whole authored set rather
 * than returning nothing — a Curiosity node must always have something in it.
 * @param {import('../core/rng.js').RNG} rng
 */
export function rollEvent(rng, regionId, opts = {}) {
  let pool = eventsFor(regionId, opts);
  if (!pool.length) pool = eventsFor(regionId, { ...opts, seen: [] });
  if (!pool.length) pool = CURIOSITIES;
  return rng.weighted(pool.map(e => ({ ...e, w: e.weight || 1 })));
}

/** Resolve one option to a single authored outcome. */
export function rollOutcome(rng, option) {
  const list = option?.outcomes;
  if (!list || !list.length) {
    return { title: '', text: '', effects: option?.effects || {} };
  }
  if (list.length === 1) return list[0];
  return rng.weighted(list.map(o => ({ ...o, w: o.w ?? 1 })));
}

export default { CURIOSITIES, eventById, eventsFor, rollEvent, rollOutcome };
