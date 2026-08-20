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
 *   Courage · maximum Courage · Lost Things · a Keepsake · a Trick · a Snack
 *   a Clue · a Curse in your deck · a fight / a Big Scare · Nothing
 *
 * Say `Nothing` only when the option genuinely cannot cost anything.  Say "or"
 * when the outcomes disagree about which resource moves ('Lost Things, or a
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
export const CURIOSITIES = [

  // ── §26: Scratching Behind the Wall ────────────────────────────────────────
  {
    id: 'scratching-behind-the-wall',
    name: 'Scratching Behind the Wall',
    room: 'A papered corridor',
    mood: 'listen',
    regions: ['any'], minDepth: 0, once: true, weight: 3,
    text: [
      'The scratching starts about waist height and moves along with you when you walk.',
      'Three scratches. A pause. Three scratches. It is not the sound something makes when it is trapped. It is the sound something makes when it wants you to know where it is.',
      'There is a service panel screwed into the wainscoting, painted over four times.',
    ],
    options: [
      {
        id: 'open', label: 'Open the panel.',
        requires: 'multitool',
        gateText: 'The screws are painted in. You would need a tool.',
        risk: 'Courage, or a Curse in your deck',
        reward: 'Lost Things, or a Keepsake',
        outcomes: [
          { w: 3, title: 'A cat, an ordinary cat',
            text: 'Grey, filthy, absolutely furious, and completely normal. It walks over your hands, out into the corridor, and sits down to wash as if it has been waiting for a door its whole life. In the cavity behind the panel: a nest of chewed paper and a small pile of shiny things somebody was saving.',
            effects: { lostThings: 55, clues: 1 } },
          { w: 2, title: 'Not a cat',
            text: 'It is made of dust and coathangers and it is very glad to meet you. It shakes your hand for slightly too long. Then it climbs back inside and pulls the panel shut, and you hear it settle in the dark like something going back to sleep.',
            effects: { relic: 'common', hp: -6 } },
          { w: 2, title: 'Nothing at all',
            text: 'The cavity is empty and clean, and there are marks on the inside of the plaster where something has been counting. Hundreds of marks. You do not open the next panel you pass.',
            effects: { clues: 1, curse: 'curse/night-terror' } },
        ],
      },
      {
        id: 'call', label: 'Call through the wall.',
        risk: 'A little Courage',
        reward: 'Clues, and pocket money',
        outcomes: [
          { w: 3, title: 'It answers',
            text: 'You say your pet\'s name into the wallpaper and the scratching stops dead. Then, very carefully, three scratches. You say the name again. Three scratches. You write it all down with your hand shaking.',
            effects: { clues: 2, lostThings: 15 } },
          { w: 2, title: 'It copies you',
            text: 'A moment later the wall says your pet\'s name back, in your voice, slightly wrong. You back away down the corridor and it follows you for eleven feet and then loses interest.',
            effects: { clues: 1, hp: -4 } },
        ],
      },
      {
        id: 'feed', label: 'Post food under the panel.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to give it.',
        risk: 'Nothing you can see',
        reward: 'A Keepsake, and a Clue',
        outcomes: [
          { w: 1, title: 'Taken',
            text: 'You slide two treats under the gap. There is a pause exactly long enough to be polite, and then they are gone. Something pushes a button back out to you — brass, four holes, warm. It seems important that this was a trade and not a gift.',
            effects: { relic: 'lucky-button', clues: 1 } },
        ],
      },
      {
        id: 'leave', label: 'Walk away.',
        risk: 'You never find out',
        reward: 'A little Courage back',
        effects: { heal: 4 },
        outcomes: [
          { w: 1, title: 'You walk away',
            text: 'You walk away, and the scratching goes with you as far as the corner, and then stops. Somewhere behind you a panel opens, and closes. You do not turn round. Your Companion presses against your leg the whole way to the next room.',
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
      'The room is completely empty. Bare boards, bare walls, one window boarded from the inside.',
      'In the exact centre of the floor there is a pet collar. Red nylon, worn pale on one side. It has been placed there, squared up, the way you put out something you want found.',
    ],
    options: [
      {
        id: 'take', label: 'Pick it up.',
        risk: 'Courage — a bite of it, or a lot',
        reward: 'A Keepsake, and a Clue',
        outcomes: [
          { w: 3, title: 'It is still warm',
            text: 'It is still warm, which does not make sense in a room this cold. The tag has a name on it that you have seen on a lamppost poster four streets from your school. You put the collar in your bag and something in the wall lets out a long breath.',
            effects: { relic: 'the-collar', clues: 1, hp: -5 } },
          { w: 2, title: 'The house objects',
            text: 'The moment it leaves the floor every door in the corridor shuts at once. The collar is yours. Getting out of the room is a separate problem, and it takes some of you with it.',
            effects: { relic: 'the-collar', hp: -12, clues: 1 } },
        ],
      },
      {
        id: 'read', label: 'Read the tag and copy it down.',
        requires: ['notebook', 'record'],
        gateText: 'You would need something to write on.',
        risk: 'Nothing',
        reward: 'Three Clues, and Lost Things',
        outcomes: [
          { w: 1, title: 'BISCUIT — and a phone number',
            text: 'You copy the name, the number, and the little scratched-out word underneath that somebody tried to remove. Back home this goes on the board with a red string running to the photographs. That is three animals from the same four streets.',
            effects: { clues: 3, lostThings: 20 } },
        ],
      },
      {
        id: 'leave', label: 'Leave it exactly where it is.',
        risk: 'You walk away empty-handed',
        reward: 'A Keepsake, and a little Courage',
        outcomes: [
          { w: 1, title: 'Squared up again',
            text: 'You square it up again, the way you found it, and back out. When you look through the doorway from the corridor, the collar is gone and the boards are dusty and undisturbed, as if it was never put down at all. Something decides you are all right.',
            effects: { relic: 'common', heal: 6 } },
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
      'Bowls. Dozens of them, in neat rows across the whole floor, each one exactly a hand-span from the next.',
      'Some are enamel with the pattern worn off. Some are cracked pottery from before anyone alive was born. Four of them, near the window, have fresh food in them.',
      'Something is still doing this. Every day. For a very long time.',
    ],
    options: [
      {
        id: 'fill', label: 'Fill the empty ones.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to put in them.',
        risk: 'Nothing you can see',
        reward: 'A Keepsake, and a Clue',
        outcomes: [
          { w: 1, title: 'It notices',
            text: 'You go down the rows and share out what you brought. It takes a while. When you stand up, every bowl you filled has been licked clean and there is nothing else in the room, and hanging on the door handle is a bowl with your own name on it in your own handwriting.',
            effects: { relic: 'bowl-with-your-name', clues: 1 } },
        ],
      },
      {
        id: 'read', label: 'Read the names on the bowls.',
        risk: 'Courage',
        reward: 'Clues, maybe maximum Courage',
        outcomes: [
          { w: 3, title: 'Sixty-one names',
            text: 'You copy down sixty-one names. Four of them are from posters on your street. One of them is a dog your neighbour lost before you were born and still talks about. And near the window, in newer paint, a bowl with your pet\'s name and today\'s date.',
            effects: { clues: 3, hp: -6 } },
          { w: 2, title: 'The bowls are dated',
            text: 'Under each name is a date. They go back a hundred and ten years. The four fresh bowls are all this month. Whoever is doing this has never once missed a day, and you find that you cannot decide whether that is horrifying or kind.',
            effects: { clues: 2, maxHp: 4 } },
        ],
      },
      {
        id: 'wait', label: 'Hide and wait for whoever feeds them.',
        risk: 'A lot of Courage',
        reward: 'A Keepsake, or a Snack',
        outcomes: [
          { w: 2, title: 'You see it',
            text: 'It comes in at a quarter past, carrying a jug bigger than itself, and it does the whole room without hurrying. It is not a person. It has never been a person. When it finishes it looks straight at your hiding place, bows very slightly, and leaves. Your Companion is shaking. So are you.',
            effects: { relic: 'uncommon', clues: 1 } },
          { w: 2, title: 'It finds you first',
            text: 'You feel it counting the bowls behind you. Fifty-nine, sixty, sixty-one, and one extra thing in the room that should not be here. It puts a bowl down in front of you before it goes.',
            effects: { hp: -14, clues: 1, snacks: 1 } },
        ],
      },
      {
        id: 'leave', label: 'Close the door quietly.',
        risk: 'Nothing',
        reward: 'A little Courage back',
        outcomes: [
          { w: 1, title: 'Quietly',
            text: 'You close the door quietly, the way you would leave a room where something is asleep. Halfway down the corridor you hear the sound of a jug being set down, and you walk a little faster.',
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
      'Between two enormous oil portraits there is one small photograph in a cheap frame: a family on the front steps, squinting, in clothes from fifty years ago.',
      'Sitting on the bottom step, exactly where she sits now, is a completely ordinary ginger cat.',
      'You know that cat. She has been walking beside you all evening. She is not ordinary any more, and this photograph is fifty years old.',
    ],
    options: [
      {
        id: 'photograph', label: 'Photograph the photograph.',
        requires: ['camera', 'photo'],
        gateText: 'You would need a camera.',
        risk: 'Nothing',
        reward: 'Clues, and a Keepsake',
        outcomes: [
          { w: 1, title: 'The flash shows more',
            text: 'In the flash, for a fraction of a second, the photograph is different: there are nine animals on the steps instead of one, and the family are not looking at the camera, they are looking at the door. When you lower the camera the picture is just a picture again. But you have it now.',
            effects: { clues: 3, relic: 'photograph-of-a-cat' } },
        ],
      },
      {
        id: 'take', label: 'Take the photograph out of the frame.',
        risk: 'Courage',
        reward: 'Clues, maybe maximum Courage',
        outcomes: [
          { w: 3, title: 'It comes away easily',
            text: 'It comes away easily, and on the back somebody has written a name and a date and, later, in a different pen, a second date with a question mark. Your Companion will not look at it. You put it in the notebook and you do not bring it up again tonight.',
            effects: { clues: 2, maxHp: 5 } },
          { w: 2, title: 'Every frame in the hall turns',
            text: 'Every frame in the hall turns to face you at once. You leave with the photograph. You leave with rather less of your nerve.',
            effects: { clues: 2, hp: -10 } },
        ],
      },
      {
        id: 'ask', label: 'Ask your Companion about it.',
        risk: 'A little Courage',
        reward: 'Maximum Courage, and a Clue',
        outcomes: [
          { w: 3, title: 'She remembers the step',
            text: 'She remembers the step. She remembers the warm bit at eleven in the morning. She does not remember the people, and when you ask their names she puts her ears back and looks at the door and asks, in the way animals ask, whether you can go now. You go.',
            effects: { clues: 1, heal: 10, maxHp: 3 } },
          { w: 2, title: 'She does not remember',
            text: 'She looks at the photograph for a long time and then at you, politely, the way you look at a stranger\'s holiday snaps. She has been here long enough that this is not sad to her. It is only sad to you.',
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
      'A lectern, a brass lamp that comes on by itself, and a ledger the size of a paving slab.',
      'It is a register of every animal in the house. Name, date arrived, room assigned, condition. The handwriting changes eleven times and never gets less careful.',
      'The last four entries are from this month. The final one has been started and not finished.',
    ],
    options: [
      {
        id: 'find', label: 'Look for your pet\'s name.',
        risk: 'Courage',
        reward: 'Clues, maybe maximum Courage',
        outcomes: [
          { w: 3, title: 'Page 1,144',
            text: 'It is there. Arrived, three weeks ago. Room assigned: blank. Condition: "settling". Somebody has written, in the margin, in smaller writing, "asks about the front door".',
            effects: { clues: 3, hp: -6, maxHp: 4 } },
          { w: 2, title: 'Not yet',
            text: 'Not there. Not yet. You check twice, and the relief goes through you like cold water, and then you understand what "not yet" means and you stop feeling relieved.',
            effects: { clues: 2, heal: 8 } },
        ],
      },
      {
        id: 'tear', label: 'Tear out the last page.',
        risk: 'A fight, or a Curse in your deck',
        reward: 'Four Clues',
        outcomes: [
          { w: 2, title: 'The lamp goes out',
            text: 'The page comes out clean. The lamp goes out. Every door on this floor is now shut, and something a long way off has started walking. But you have the page, and the page has four names on it that nobody else in the world knows.',
            effects: { clues: 4, combat: 'standard' } },
          { w: 2, title: 'The ink runs back',
            text: 'You tear it out and the words peel off the paper and crawl back into the book, and the page in your hand is blank. The register is unbothered. You are not.',
            effects: { hp: -8, curse: 'curse/regret' } },
        ],
      },
      {
        id: 'sign', label: 'Write your own name in it.',
        risk: 'Maximum Courage',
        reward: 'A Keepsake',
        outcomes: [
          { w: 1, title: 'Condition: guest',
            text: 'You write your name and, under condition, "guest". The ink dries gold. Doors that were locked are now merely closed, and something that was following you at a distance stops following you. You will worry about this later. You should worry about it later.',
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
      'A velvet rope hangs beside a brass plate engraved RING FOR SERVICE.',
      'Above it, a board of forty little bells, one per room, each labelled in copperplate. Every single bell is trembling very slightly, as if the whole house is being rung constantly and quietly by somebody nobody has answered in ninety years.',
    ],
    options: [
      {
        id: 'ring', label: 'Ring it.',
        risk: 'A Big Scare, right here',
        reward: 'Lost Things, or Snacks and Courage',
        outcomes: [
          { w: 2, title: 'Service arrives',
            text: 'Something comes. It is enormous and it is extremely polite and it would like to know what you require. What you require is to not be here.',
            effects: { combat: 'elite', lostThings: 60 } },
          { w: 3, title: 'A tray',
            text: 'Nobody comes. Twenty minutes later, in a completely different room, you find a tray waiting on a side table with two glasses of something warm and a note that says, in copperplate, "welcome back".',
            effects: { snacks: 2, heal: 12 } },
        ],
      },
      {
        id: 'cut', label: 'Cut the rope down.',
        requires: ['multitool', 'open'],
        gateText: 'You would need something with a blade.',
        risk: 'Nothing',
        reward: 'A Keepsake, and Clues',
        outcomes: [
          { w: 1, title: 'Quiet',
            text: 'You saw through it and the whole board goes still for the first time in a century. In the silence you can hear, very faintly, animals moving about upstairs — a lot of animals, in a lot of rooms. You write down the floor and the direction.',
            effects: { clues: 2, relic: 'common' } },
        ],
      },
      {
        id: 'read', label: 'Read the room labels.',
        risk: 'Nothing',
        reward: 'Lost Things, and a Clue',
        outcomes: [
          { w: 1, title: 'Forty rooms, thirty-eight named',
            text: 'Thirty-eight rooms are named. Two are labelled only with a small drawn paw. You note where the wires run.',
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
      'Two hundred umbrellas in brass stands, and one enormous table.',
      'It is, objectively, the best available fort site you have seen all night: a solid roof, one door, and a wall of umbrellas you can arrange into an early-warning system that goes clatter.',
    ],
    options: [
      {
        id: 'build', label: 'Build the fort. Properly.',
        risk: 'Nothing but the time',
        reward: 'Courage, and a Trick sharpened',
        outcomes: [
          { w: 1, title: 'Blankets over the table',
            text: 'You drag the table, hang the blankets, wedge the door, and build a clatter-line of umbrellas across the entrance. Inside it is warm and yellow and about four feet high. Your Companion falls asleep almost immediately. You sit up a while listening to the house being somewhere else.',
            effects: { heal: 22, upgradeCard: 1 } },
        ],
      },
      {
        id: 'search', label: 'Go through the umbrella stands.',
        risk: 'Courage',
        reward: 'A great many Lost Things',
        outcomes: [
          { w: 3, title: 'Pockets and handles',
            text: 'Umbrella handles unscrew. This is the sort of thing you only learn by doing it two hundred times. Inside: coins, a key, three marbles, and a folded photograph of a dog.',
            effects: { lostThings: 70, clues: 1 } },
          { w: 2, title: 'Occupied',
            text: 'The nineteenth stand is occupied. It objects. It objects with an umbrella.',
            effects: { hp: -9, lostThings: 40 } },
        ],
      },
      {
        id: 'take-umbrella', label: 'Take an umbrella for later.',
        risk: 'Nothing',
        reward: 'A Keepsake',
        outcomes: [
          { w: 1, title: 'Black, enormous, unkillable',
            text: 'You pick the biggest, blackest, most funeral-looking one on the rack, and it settles into your hand like it has been waiting for someone with the sense to choose properly.',
            effects: { relic: 'uncommon' } },
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
      'There is a cat flap in this door. That would be unremarkable except that both sides of the door are inside the house, and the flap has been fitted the wrong way round, so it opens *towards* you.',
      'Warm air comes through it. Warm air, and a smell of dry grass and sunshine that has no business in this building at this hour.',
    ],
    options: [
      {
        id: 'look', label: 'Lie down and look through.',
        risk: 'Courage',
        reward: 'Clues, and a little Courage',
        outcomes: [
          { w: 3, title: 'A field',
            text: 'On the other side of an interior door on the second floor there is a field at about four in the afternoon, in summer, and there are animals in it, a lot of them, asleep in the warm. One of them lifts its head. You are absolutely certain it is looking at you.',
            effects: { clues: 3, heal: 8 } },
          { w: 2, title: 'Something looks back',
            text: 'Something on the other side is lying down too, with its eye against the flap, and it has been there the entire time you were deciding.',
            effects: { hp: -10, clues: 1 } },
        ],
      },
      {
        id: 'whistle', label: 'Whistle through it.',
        requires: ['dog-whistle', 'call'],
        gateText: 'You have nothing that would carry.',
        risk: 'Nothing',
        reward: 'A Keepsake, Clues and Courage',
        outcomes: [
          { w: 1, title: 'Something comes',
            text: 'You do not hear it. The field does. Something bounds up out of the grass and pushes its whole head through the flap — a scruffy, delighted, utterly ordinary terrier — licks your face once, and is pulled back by the scruff by a hand you do not see. In your palm, left behind: a tag.',
            effects: { relic: 'collar-tag', clues: 2, heal: 6 } },
        ],
      },
      {
        id: 'reach', label: 'Reach through.',
        risk: 'A little Courage',
        reward: 'A Keepsake, or maximum Courage',
        outcomes: [
          { w: 2, title: 'Grass',
            text: 'Your hand comes back warm and smelling of cut grass, with three seed heads caught in your sleeve and a small hard object you did not pick up.',
            effects: { relic: 'common', heal: 5 } },
          { w: 2, title: 'Held',
            text: 'Something takes your hand. Not roughly. It holds on for four full seconds, the way you hold on to somebody who is leaving, and then it lets go. You sit on the landing for a while afterwards.',
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
      'A little hatch in the wall with a rope pulley and a wooden box behind it, big enough for a roast, a tea service, or a child who has not thought this through.',
      'Chalked on the inside of the box, in a child\'s handwriting: SEND SOMETHING GOOD.',
    ],
    options: [
      {
        id: 'send-things', label: `Send up 55 Lost Things.`,
        cost: { lostThings: 55 },
        risk: '55 Lost Things, possibly wasted',
        reward: 'A Keepsake',
        outcomes: [
          { w: 3, title: 'It sends back better',
            text: 'The rope goes up on its own. Two minutes later the box comes down with something in it that is worth considerably more than buttons, and a note that says THANK YOU in the same handwriting.',
            effects: { relic: 'uncommon' } },
          { w: 2, title: 'It sends back a joke',
            text: 'The box comes down containing one (1) marble, and the word SORRY, and — under the marble, so you nearly miss it — a folded page torn out of a register.',
            effects: { lostThings: 10, clues: 2 } },
        ],
      },
      {
        id: 'send-toy', label: 'Send up the toy.',
        requires: ['familiar-toy', 'pet'],
        gateText: 'You would have to have brought something of theirs.',
        risk: 'Nothing',
        reward: 'Clues, and maximum Courage',
        outcomes: [
          { w: 1, title: 'It comes back chewed',
            text: 'It comes back chewed. Freshly. There is one long ginger-and-white hair caught in the seam, and it is exactly the right colour, and you sit down on the floor of a haunted house at midnight and put your face in your hands for a minute. Then you get up, because now you know they are upstairs.',
            effects: { clues: 4, maxHp: 8, heal: 10 } },
        ],
      },
      {
        id: 'ride', label: 'Get in the box.',
        risk: 'A lot of Courage',
        reward: 'Lost Things, or a Keepsake',
        outcomes: [
          { w: 2, title: 'Up two floors, sideways one',
            text: 'You fold yourself in and the rope takes you up two floors and then, impossibly, sideways, and lets you out in a linen cupboard full of things people have hidden.',
            effects: { lostThings: 90, hp: -6 } },
          { w: 2, title: 'The rope is old',
            text: 'The rope is ninety years old and it does not appreciate being asked. You fall one and a half floors into a pile of tablecloths, which is lucky, and land on something hard, which is not.',
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
      'A counter, a bell, and behind it a wall of pigeonholes going up further than the ceiling should allow, each one stuffed with things people came in with and left without.',
      'Gloves. Keys. Spectacles. A violin. Ninety-one single shoes. A pigeonhole entirely full of collars.',
    ],
    options: [
      {
        id: 'grab', label: 'Take an armful and run.',
        risk: 'Courage, or a Curse in your deck',
        reward: 'A great deal of Lost Things',
        outcomes: [
          { w: 3, title: 'You get out',
            text: 'You get out with both arms full and a coat you did not intend to steal. Nobody stops you. Somebody, somewhere behind the pigeonholes, writes something down.',
            effects: { lostThings: 130, curse: 'curse/heavy-heart' } },
          { w: 2, title: 'The counter is attended',
            text: 'The attendant has been standing there the whole time, at the correct height, behind the correct part of the counter, and it is very disappointed. You keep some of it.',
            effects: { lostThings: 45, hp: -13 } },
        ],
      },
      {
        id: 'collars', label: 'Go through the collars.',
        risk: 'A little Courage',
        reward: 'Clues, and Lost Things',
        outcomes: [
          { w: 1, title: 'Ninety-four collars',
            text: 'You take them out one at a time and read every tag and put them back in the right order, which takes forty minutes you did not have. Ninety-four names. You know two. One of them is on a poster in your kitchen.',
            effects: { clues: 3, lostThings: 30, hp: -4 } },
        ],
      },
      {
        id: 'ring', label: 'Ring the bell and ask properly.',
        risk: 'Maximum Courage',
        reward: 'A Keepsake, and a Clue',
        outcomes: [
          { w: 3, title: 'Ticket 41',
            text: 'The attendant appears, listens to the whole thing without interrupting, and hands you a numbered ticket. "When you find them," it says, "bring this." It will not explain further, and it is not being unkind.',
            effects: { relic: 'coatcheck-ticket', clues: 1 } },
          { w: 2, title: 'A fee',
            text: 'The attendant appears, listens, and names a fee. The fee is not money. The fee is that you will remember one thing less about the outside than you did when you came in. You pay it, and you get something in return, and you cannot afterwards say what you paid.',
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
      'Eleven family portraits, all extremely serious, and in the corner of every single one there is the same brown-and-white spaniel.',
      'In the first painting it is a puppy. In the eleventh it is old and grey around the muzzle and lying at somebody\'s feet.',
      'In the twelfth frame, which is empty and has been empty for a long time, there is a dog-shaped patch where the varnish has not yellowed.',
    ],
    options: [
      {
        id: 'call', label: 'Call it.',
        risk: 'Nothing',
        reward: 'A Keepsake, and Courage',
        outcomes: [
          { w: 1, title: 'It comes out',
            text: 'You whistle the way you whistle for a dog and eleven painted spaniels lift their heads at once. Then something steps out of the empty frame, brown and white and not quite solid, and puts its chin on your knee, and stays for exactly as long as it takes you to say good boy.',
            effects: { relic: 'uncommon', heal: 14, clues: 1 } },
        ],
      },
      {
        id: 'photograph', label: 'Photograph all eleven.',
        requires: ['camera', 'photo'],
        gateText: 'You would need a camera.',
        risk: 'Nothing',
        reward: 'Four Clues, and Lost Things',
        outcomes: [
          { w: 1, title: 'The same dog, eleven times, eighty years apart',
            text: 'You photograph the lot. Laid out on the board at home, in order, they will show one dog living through four generations of a family that clearly never once questioned it. That is the whole thesis, in eleven frames.',
            effects: { clues: 4, lostThings: 25 } },
        ],
      },
      {
        id: 'straighten', label: 'Straighten the empty frame and move on.',
        risk: 'Nothing',
        reward: 'A little Courage, and Lost Things',
        outcomes: [
          { w: 1, title: 'Level',
            text: 'You get it level and step back and check it from the doorway, the way you do. Behind you, all eleven painted dogs have moved to the side of their frames nearest the empty one.',
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
      'A card table, a paraffin lamp, and something in a coat approximately the shape of a person who has been described to a moth over the telephone.',
      '"He\'s my cousin," it says, before you ask. "Same family. Better prices."',
      'On the table: three things under a cloth, and a pair of scissors.',
    ],
    options: [
      {
        id: 'buy-blind', label: 'Buy what is under the cloth. 80 Lost Things.',
        cost: { lostThings: 80 },
        risk: '80 Lost Things, sight unseen',
        reward: 'A Keepsake — possibly a Rare one',
        outcomes: [
          { w: 3, title: 'Better than you would have chosen',
            text: 'It sweeps the cloth off with real theatre. One of the three is genuinely good, and it lets you take that one, and looks quietly pleased with itself the whole time.',
            effects: { relic: 'rare' } },
          { w: 2, title: 'Worse than you would have chosen',
            text: 'Two are rubbish and one is fine. You get the fine one. "Family prices," it says, unrepentant.',
            effects: { relic: 'common', snacks: 1 } },
        ],
      },
      {
        id: 'scissors', label: 'Ask about the scissors.',
        risk: 'You must give up a Trick',
        reward: 'You choose which Trick goes',
        outcomes: [
          { w: 1, title: 'Snip',
            text: '"Everyone carries something they wish they didn\'t," it says, and holds them out handles first. It does not charge you. That is somehow worse.',
            effects: { removeCard: 1 } },
        ],
      },
      {
        id: 'ask-moth', label: 'Ask whether Mr. Moth really has a cousin.',
        risk: '20 Lost Things',
        reward: 'Lost Things, or a Keepsake',
        outcomes: [
          { w: 2, title: 'No',
            text: '"No," it admits, after a pause of exactly the right length. It seems relieved. It gives you a marble and its actual name and asks you not to spread it about.',
            effects: { lostThings: 45, clues: 1 } },
          { w: 2, title: 'Yes, and that is the problem',
            text: '"Oh, he has," it says, and something in the coat rearranges itself. "Several. We do not speak." It sells you something at cost and would like you to move along now.',
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
      'A sash window, open six inches at the bottom, on a wall that does not have an outside.',
      'There is night air coming through it. Real night air, with a street smell in it, and — faintly, a long way off — a car.',
      'On the sill, on the inside, there are muddy paw prints going out.',
    ],
    options: [
      {
        id: 'follow', label: 'Follow the prints out.',
        risk: 'Courage',
        reward: 'Lost Things, and Clues',
        outcomes: [
          { w: 3, title: 'A roof, and then back in',
            text: 'You get out onto a slate roof under a sky with the wrong number of stars, follow the prints thirty feet, and come back in through a window into a room you have not been able to find all night.',
            effects: { lostThings: 75, clues: 2 } },
          { w: 2, title: 'The window shuts',
            text: 'The window shuts behind you and there is no handle on the outside. Getting back in costs you skin, nerve, and one of the things in your bag.',
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
          { w: 1, title: 'Four toes, no claw marks, 5cm',
            text: 'Four toes, no claw marks, five centimetres across, going out and not coming back. Cat. Big one. Three weeks of mud in this house means nothing but you write down the date anyway, because that is what you do now.',
            effects: { clues: 3, heal: 4 } },
        ],
      },
      {
        id: 'shut', label: 'Shut it.',
        risk: 'Nothing',
        reward: 'A Keepsake, and maximum Courage',
        outcomes: [
          { w: 1, title: 'Latched',
            text: 'You slide it down and latch it, and the street noise stops mid-car. The house settles around you like a held breath let go. Something has been trying to close this window for a long time and could not reach.',
            effects: { relic: 'uncommon', maxHp: 4, clues: -0 } },
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
      'Forty coats on a rail, all facing the same way, all buttoned.',
      'One of them, about two thirds along, is breathing.',
    ],
    options: [
      {
        id: 'pockets', label: 'Go through the pockets. All of them.',
        risk: 'Courage',
        reward: 'A great many Lost Things',
        outcomes: [
          { w: 3, title: 'Forty pockets',
            text: 'Bus tickets, a boiled sweet welded to its wrapper, a house key, eleven coins, a folded shopping list from 1961 that ends "and something for the cat".',
            effects: { lostThings: 85, clues: 1 } },
          { w: 2, title: 'The thirty-first coat',
            text: 'The thirty-first coat closes on your arm up to the elbow, thoughtfully, the way you close your hand around something you are not sure about yet. You get the arm back. You do not get the sleeve.',
            effects: { hp: -11, lostThings: 45 } },
        ],
      },
      {
        id: 'unbutton', label: 'Unbutton the breathing one.',
        risk: 'Courage, and a Curse in your deck',
        reward: 'A Keepsake, and a Snack',
        outcomes: [
          { w: 2, title: 'A rabbit, enormously offended',
            text: 'Inside the coat, standing on the shoulders of the coat below, is a rabbit the size of a spaniel wearing the coat as a coat. It regards you with the deep contempt of someone caught doing something perfectly reasonable, and stalks off down the rail.',
            effects: { relic: 'uncommon', snacks: 1 } },
          { w: 2, title: 'Not a rabbit',
            text: 'The coat is empty and the breathing continues after you have opened it, from the same place, at the same height.',
            effects: { hp: -8, curse: 'curse/clingy-shadow', lostThings: 30 } },
        ],
      },
      {
        id: 'leave-treat', label: 'Leave a treat in its pocket and go.',
        requires: ['pet-treats', 'feed'],
        gateText: 'You have nothing to leave.',
        risk: 'Nothing',
        reward: 'A Keepsake, and Courage',
        outcomes: [
          { w: 1, title: 'A friend on this floor',
            text: 'You drop two treats in the pocket, do the button back up, and leave. For the rest of the region you keep finding doors already open, and once, at a corner, a coat sleeve pointing.',
            effects: { relic: 'common', heal: 10, clues: 1 } },
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
      'There is a cat sitting on the fourth step from the bottom. Not your Companion — a different one, tortoiseshell, extremely settled.',
      'It is sitting in the exact centre of the stair, and the stair is not wide, and it has no intention whatsoever of moving.',
    ],
    options: [
      {
        id: 'step-over', label: 'Step over it.',
        risk: 'A Curse in your deck',
        reward: 'A few Lost Things',
        outcomes: [
          { w: 1, title: 'It watches you all the way up',
            text: 'You step over. It watches you all the way up without moving its body, only its head, and you feel judged in a way that will stay with you.',
            effects: { lostThings: 15, curse: 'curse/bad-luck' } },
        ],
      },
      {
        id: 'sit', label: 'Sit down on the step and wait.',
        risk: 'Nothing',
        reward: 'A Keepsake, Clues and Courage',
        outcomes: [
          { w: 1, title: 'Eleven minutes',
            text: 'You sit two steps down and wait. It takes eleven minutes. Then it gets up, stretches enormously, walks up two steps, and looks back at you, which in cat means come on then. It shows you a door. The door is not on the blueprint.',
            effects: { relic: 'uncommon', clues: 2, heal: 6 } },
        ],
      },
      {
        id: 'ask', label: 'Ask your Companion to talk to it.',
        risk: 'A little Courage',
        reward: 'Maximum Courage, and Clues',
        outcomes: [
          { w: 3, title: 'A long silence between cats',
            text: 'The two of them look at each other for a full minute without a sound and then your Companion comes back and is quiet for a while. Later she tells you: the tortoiseshell has been on that stair since 1958 and does not want to leave, and has asked her, politely, to stop asking.',
            effects: { clues: 2, maxHp: 5, hp: -3 } },
          { w: 2, title: 'She sits down next to it',
            text: 'She goes up and sits beside it, and the two of them face the hall together like a pair of bookends, and for a few minutes nothing in this house is frightening at all. Then she comes back, and something in her step is easier.',
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
      'A workbench, a lamp, and a jar of eyes — glass ones, for toys, sorted by colour.',
      'On the bench is a stuffed rabbit that has been repaired so many times that none of the original rabbit is left. New ears, new body, new stuffing, new eyes.',
      'Beside it is a card that says, in a careful adult hand: STILL THE SAME RABBIT?',
    ],
    options: [
      {
        id: 'yes', label: 'Write YES.',
        risk: 'Nothing',
        reward: 'A Keepsake, and maximum Courage',
        outcomes: [
          { w: 1, title: 'The house agrees',
            text: 'You write YES and the lamp warms up a shade and the whole closet feels, briefly, like somebody being thanked. Something is put into your bag while you are not looking, and you decide not to think too hard about what the question was really about.',
            effects: { relic: 'uncommon', maxHp: 5 } },
        ],
      },
      {
        id: 'no', label: 'Write NO.',
        risk: 'Courage',
        reward: 'Clues, and a Trick sharpened',
        outcomes: [
          { w: 1, title: 'The lamp goes out',
            text: 'You write NO. The lamp goes out. In the dark something puts the rabbit back in the drawer, gently, and shuts it, and you get the strong impression that you have hurt somebody\'s feelings and also that you were right.',
            effects: { clues: 3, hp: -7, upgradeCard: 1 } },
        ],
      },
      {
        id: 'mend', label: 'Mend something of your own.',
        risk: 'A Curse in your deck',
        reward: 'Two Tricks sharpened',
        outcomes: [
          { w: 1, title: 'New stuffing',
            text: 'You put one of your own things on the bench and the room does the rest, quickly and expertly and without asking permission. It comes back stronger and slightly wrong, the way everything in this wing does.',
            effects: { upgradeCard: 2, curse: 'curse/lost-mitten' } },
        ],
      },
      {
        id: 'leave', label: 'Take the card and leave the rabbit.',
        risk: 'Nothing',
        reward: 'Clues, and Lost Things',
        outcomes: [
          { w: 1, title: 'Evidence',
            text: 'You pocket the card. It is the first thing you have found all night that reads like somebody in this house worrying about whether what they are doing is right.',
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
      'Somebody has chalked a sum on the floor of the landing, in a child\'s hand, and worked it out wrong on purpose.',
      'Underneath, in the same chalk: IF YOU FIX IT IT TAKES SOMETHING.',
      'The chalk is still here. There is a lot of floor.',
    ],
    options: [
      {
        id: 'fix', label: 'Fix the sum.',
        risk: 'Maximum Courage, or a Trick',
        reward: 'A Rare Keepsake, or Lost Things',
        outcomes: [
          { w: 3, title: 'It takes the weight',
            text: 'You correct the carry and the whole line rewrites itself in a hand much older than the first. Something lifts off you — you cannot say what — and something else settles in your bag.',
            effects: { relic: 'rare', maxHp: -8 } },
          { w: 2, title: 'It takes a Trick',
            text: 'The numbers rearrange and one of the things you know how to do goes quietly out of your head. In its place: a great many buttons, and the sense of having been paid fairly by somebody who does not understand money.',
            effects: { removeCard: 1, lostThings: 120 } },
        ],
      },
      {
        id: 'add', label: 'Add a harder sum underneath.',
        risk: 'Nothing',
        reward: 'Clues, and a Trick sharpened',
        outcomes: [
          { w: 1, title: 'It answers, and asks one back',
            text: 'You chalk up something you only half understand from school. Overnight — in the four seconds you look away — it is solved, correctly, and a new question is written beneath it that is not arithmetic. It asks how many animals you think are in this house. You write your guess. You are wrong by a factor of nine.',
            effects: { clues: 3, upgradeCard: 1 } },
        ],
      },
      {
        id: 'rub', label: 'Rub it all out.',
        risk: 'Nothing',
        reward: 'A little Courage back',
        outcomes: [
          { w: 1, title: 'Clean floor',
            text: 'You wipe the landing clean with your sleeve. It takes a while and it is oddly upsetting, like tidying away somebody\'s homework. Your Companion sits and watches and does not comment.',
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
