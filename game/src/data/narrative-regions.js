/**
 * Authored regional narrative. OWNER: narrative-regions agent.
 * Source: docs/ingame-narrative-2026-10-27/04-levels-01-08.md and 05-levels-09-17.md.
 * Pure data: no combat, rescue, routing or save mutations.
 * Kid speakers are conditional: the consumer MUST filter them by active party.
 * Narrator/guardian lines carry required information without any particular Kid.
 * Every physical action is written as a caption; no new animation is required.
 * Barks are optional flavour, never tactical instructions or proof of a trigger.
 */

const say = (speaker, text) => ({ speaker, text });
const scene = (id, lines, recap) => ({ id, lines, recap });
const clue = (id, title, lines, detail, recap, detailChoices, beforeResolutionOnly = false) =>
  ({ id, title, lines, detail, recap, ...(detailChoices ? { detailChoices } : {}),
    ...(beforeResolutionOnly ? { beforeResolutionOnly: true } : {}) });
const region = (slug, title, boss, content) => ({ title, boss, ...content });
const investigate = (entry, investigation) => ({ ...entry, investigation });

export const NARRATIVE_REGIONS = Object.freeze({
  foyer: region('foyer', 'The Forgotten Foyer', 'The Butler', {
    arrival: scene('NR-foyer-arrival', [
      'A tray floats over with tiny towels. A second follows with smaller towels for drying the first towels.',
      say('The Butler', 'We are prepared for every need.'),
      say('maya', 'Do you have a towel for an unanswered question?'),
      'The second tray unfolds a towel marked UNFORESEEN NEEDS. It is very small.',
    ], 'The House offers a very elaborate welcome.'),
    before: scene('NR-foyer-before', [
      say('The Butler', 'Welcome. First, a welcome. Second, a longer welcome.'),
      'He raises a tray of House Rules between you and the hall beyond.',
      say('samir', 'Could the second welcome be shorter than the first?'),
      say('The Butler', 'Please keep all questions until after the longer welcome.'),
    ], 'The Butler blocks the way with his House Rules.'),
    beforeIfInvestigated: scene('NR-foyer-before-investigated', [
      'The Butler looks from the tested water bell to the cover around the going-home bell.',
      say('The Butler', 'Water, I can bring. That other call goes deeper into the House.'),
      say('The Butler', 'I cannot take you there.'),
      'He raises his tray of House Rules between you and the hall beyond.',
    ], 'The Butler acknowledges the blocked bell. He says its call goes deeper into the House, then blocks the hall.'),
    after: scene('NR-foyer-after', [
      'A low bell rings. The Butler catches a tipping water dish without spilling a drop.',
      say('The Butler', 'The animals’ breakfast bell. Supper? The clock is unhelpful. They are fed.'),
      'He sets the dish by a little hatch. An unseen nose sniffs; the dish slides inside.',
      'A tiny towel remains on his head. He leaves it there until the drinking stops.',
    ], 'Animals live here, and the Butler tends their meals and water. Their rooms lie beyond the Foyer.'),
    repeatBefore: scene('NR-foyer-before-repeat', [say('The Butler', 'The rules are ready. I have shortened the welcome.')], 'The Butler is ready for this Scuffle.'),
    repeatAfter: scene('NR-foyer-after-repeat', ['The Butler lifts the little towel to answer a bell, then accidentally answers the towel.', say('The Butler', 'Yes? ...Ah.')], 'The Butler answers promptly, with one small mix-up.'),
    clues: [
      clue('NR-foyer-clue-1', 'Two answers', ['An intake card has two ticks: FOUND ALONE and HAS A HOME.'], ['Two different pens made the marks. Neither tick has been erased.', say('mateo', 'I almost crossed one out.')], 'The card records both FOUND ALONE and HAS A HOME. Both marks remain.'),
      investigate(clue('NR-foyer-clue-2', 'The third cord', ['Two bell cords are worn soft. A third ends in a neat knot high above the floor.'], ['The cords run in different directions. Each bell has a small test lever beside the counter.', say('jordan', 'I could reach—oh. A little paw couldn’t.')], 'Two cords are worn from use. A third has been tied out of reach.', [
        {id:'NR-foyer-clue-2-worn-cords', label: 'Follow the worn cords.', lines: ['The WATER cord leads to a small bell beside a jug. The BLANKET cord leads to another beside a warm cupboard.', 'Tiny paw marks shine on both handles.'], recap: 'The reachable cords call for water and blankets.'},
        {id:'NR-foyer-clue-2-knot', label: 'Look above the knot.', lines: ['A plate above the unreachable cord reads HELP GOING HOME.', 'Its bell is polished. The handle below the knot has never been worn smooth.'], recap: 'The going-home bell is ready, but its cord is out of reach.'},
      ]), {
        id: 'CASE-foyer-bells', title: 'Who gets an answer?',
        question: 'Are the bells broken, or is one kind of call being blocked?',
        hypotheses: [
          {id:'broken', label:'The bells need fixing.'},
          {id:'blocked', label:'One kind of call is being blocked.'},
          {id:'unsure', label:'I’m not sure yet.'},
        ],
        tests: [
          {id:'CASE-foyer-bells-water', label:'Try the worn WATER cord.', lines:[
            'You pull the worn cord. Its bell rings clearly.',
            'A jug fills a clean dish at the counter. It waits until the water stops wobbling before sliding it over.',
          ]},
          {id:'CASE-foyer-bells-home', label:'Try the third bell’s test lever.', lines:[
            'The third plate reads HELP GOING HOME. You press its lever. The bell rings perfectly.',
            'A padded cover drops around that bell and muffles it. When you release the lever, the cover folds back.',
          ]},
        ],
        resolution: {lines:[
          'Both bells work. The water call brought care. The going-home call was covered before anyone answered.',
          'The unreachable cord belongs to that same covered bell.',
        ], recap:'The water bell brings service. The working going-home bell is muffled, and its cord is tied out of reach.'},
      }),
      clue('NR-foyer-clue-3', 'A very patient brush', ['A brush waits below two dog portraits and an empty frame.'], ['The first two read BEFORE BRUSHING and AFTER BRUSHING. The empty frame reads PLEASE REMAIN STILL.', say('eli', 'A brush with ambitious plans.')], 'The brush is still waiting for its third portrait.'),
    ],
    barks: [scene('NR-foyer-bark', [say('The Butler', 'I had a smaller frown prepared.')], 'The Butler looks disapproving.')],
  }),

  nursery: region('nursery', 'The Forgotten Nursery', 'The Governess', {
    arrival: scene('NR-nursery-arrival', [
      'Two toy soldiers stand at attention. A third wears a feather duster for a hat.',
      'It dusts the other two. They try to remain dignified through the tickling.',
      say('lena', 'Best hat here.'),
    ], 'A toy soldier has found a use for its unusual hat.'),
    before: scene('NR-nursery-before', [
      say('The Governess', 'Loose hems. Loose buttons. Loose plans.'),
      'She pulls her favourite doll close. Thread stretches across the room.',
      say('eli', 'My plans need room to wiggle.'),
      say('The Governess', 'Wiggling is how things come undone.'),
    ], 'The Governess wants to hold everything tightly together.'),
    after: scene('NR-nursery-after', [
      'The Governess reaches to straighten the duster-hatted soldier. It pats its crooked hat.',
      'Her hand pauses. The soldier dusts one of her sleeves.',
      say('The Governess', 'Oh. You were busy.'),
      'She offers the other sleeve instead.',
    ], 'The Governess leaves the toy’s hat as it is and lets it finish its chosen job.'),
    repeatBefore: scene('NR-nursery-before-repeat', [say('The Governess', 'The thread is ready. I am leaving that hat alone.')], 'The Governess prepares for the Scuffle without changing the toy’s hat.'),
    repeatAfter: scene('NR-nursery-after-repeat', ['The Governess offers her sleeve. The tiny duster gets to work.'], 'The toy keeps its useful hat.'),
    clues: [
      clue('NR-nursery-clue-1', 'The painted door', ['A dollhouse has real little hinges on its cupboards. Its front door is painted on.'], ['A newer arrow points from the painted door back to bed.', say('priya', 'The cupboards can open. Why not that one?')], 'The dollhouse gives its residents cupboards that open, but no working front door.'),
      clue('NR-nursery-clue-2', 'Keep the flop', ['A mended cloth ear still flops over one button eye.'], ['Its tag reads LEFT EAR MENDED. Beneath it: PLEASE KEEP THE FLOP.', say('amina', 'They did.')], 'A repair preserved a feature somebody wanted to keep.'),
      clue('NR-nursery-clue-3', 'The covered ending', ['A paper blanket covers the end of a story: “The rabbit was frightened, so…”'], ['Under the paper: “…the rabbit asked to go home.” There is room to read the whole sentence.', say('mateo', 'The blanket stopped at the important bit.')], 'The covered story ends with a request to go home.'),
    ],
    barks: [scene('NR-nursery-bark', [say('The Governess', 'Hold still, please. Not you. The thread.')], 'The Governess fusses over her thread.')],
  }),

  'sleeping-quarters': region('sleeping-quarters', 'The Sleeping Quarters', 'The Bedframe Beast', {
    arrival: scene('NR-sleeping-quarters-arrival', [
      'A bed pulls its curtains shut. Four enormous feet remain in view.',
      'One foot attempts to hide behind another. The bed wobbles.',
      say('jordan', 'We can give you a minute.'),
      say('The Bedframe Beast', 'Nobody needs a minute. Nobody is here.'),
    ], 'An enormous bed is trying very hard to hide.'),
    before: scene('NR-sleeping-quarters-before', [
      say('The Bedframe Beast', 'Everything beneath me is safe. Everything beneath me stays.'),
      'Its feet slide across the gaps around its curtains.',
      say('mateo', 'Do the feet know we can see them?'),
      say('The Bedframe Beast', 'The feet are a separate matter.'),
    ], 'The Bedframe Beast blocks the gaps around its hiding place.'),
    after: scene('NR-sleeping-quarters-after', [
      'The bed settles. A small paw pulls at the curtain from underneath.',
      'The Beast moves a foot aside and lowers the cord where the paw can reach it.',
      'The curtain opens a little, then closes again.',
      say('The Bedframe Beast', 'An excellent hiding place. It works both ways.'),
    ], 'The occupant can now open and close its own hiding place.'),
    repeatBefore: scene('NR-sleeping-quarters-before-repeat', [say('The Bedframe Beast', 'The inside cord is still there. You may not inspect my feet.')], 'The curtain’s inside cord remains reachable.'),
    repeatAfter: scene('NR-sleeping-quarters-after-repeat', ['A paw draws the curtain closed. The Beast keeps its feet clear.'], 'The occupant controls its curtain.'),
    clues: [
      clue('NR-sleeping-quarters-clue-1', 'Cushions and wheels', ['Cushions beneath a smaller bed have worn sleeping hollows. Wheel tracks cross the gaps between them.'], ['The tracks end where the bed blocks the only way out.', say('maya', 'Nice cushions. Look where the wheels stop.')], 'The bed offered comfortable hiding, then blocked the route out.', undefined, true),
      clue('NR-sleeping-quarters-clue-2', 'The waking bell', ['A bedside bell has been wrapped in three soft socks.'], ['A little pawprint marks the bell’s handle. The socks muffle every ring.', say('samir', 'That is a very well-rested alarm.')], 'Someone could reach the bell, but its sound was muffled.'),
      clue('NR-sleeping-quarters-clue-3', 'The familiar hollow', ['A little sleeping hollow sits beside a much larger empty one.'], ['A toy is worn on the side facing the empty space. A fringe of blanket has been tucked around both hollows.', say('lena', 'Someone had a favourite side.')], 'Two sleeping hollows share one blanket. The toy faces the larger space.'),
    ],
    barks: [scene('NR-sleeping-quarters-bark', [say('The Bedframe Beast', 'Boo. With feeling.')], 'The bed attempts a grand scare.')],
  }),

  'kitchens-cellars': region('kitchens-cellars', 'The Kitchens and Cellars', 'The Confectioner', {
    arrival: scene('NR-kitchens-cellars-arrival', [
      'A kitchen imp tries to stir with an iced spoon. The icing comes off.',
      'It fetches a replacement. That spoon has sprinkles.',
      say('eli', 'We may need to rescue the cutlery.'),
    ], 'The kitchen has improved its spoons until they barely work.'),
    before: scene('NR-kitchens-cellars-before', [
      say('The Confectioner', 'Nothing is finished while I can add something.'),
      'It puts a cherry on the Recipe Board. The cherry rolls off.',
      say('priya', 'Does anything here get to be finished?'),
      say('The Confectioner', 'Stay there. You haven’t had your icing.'),
    ], 'The Confectioner keeps changing things without asking whether they need changing.'),
    after: scene('NR-kitchens-cellars-after', [
      'The Confectioner finds one plain spoon beneath the board.',
      say('The Confectioner', 'I could improve—'),
      'It tries the spoon. The spoon works. It sets the icing bag down.',
      say('The Confectioner', 'Keep this one. We may need to stir something.'),
    ], 'The Confectioner keeps a useful spoon plain.'),
    repeatBefore: scene('NR-kitchens-cellars-before-repeat', [say('The Confectioner', 'The plain spoon is safe. The rest of the kitchen remains a work in progress.')], 'The Confectioner has kept the useful plain spoon.'),
    repeatAfter: scene('NR-kitchens-cellars-after-repeat', ['The Confectioner places the plain spoon well away from the sprinkles.'], 'The spoon remains useful.'),
    clues: [
      clue('NR-kitchens-cellars-clue-1', 'Two empty dishes', ['A feeding tray holds two empty dishes: USUAL FOOD and SPECIAL TREAT.'], ['A note says ACCEPTED BOTH. THEREFORE HAPPY TO REMAIN.', say('samir', 'I like snacks in lots of places. I don’t live in all of them.')], 'The kitchen treated eating as agreement to stay.'),
      clue('NR-kitchens-cellars-clue-2', 'The uncoated bowl', ['Five bowls shine with new glaze. A sixth has a worn patch on its rim.'], ['Only the worn bowl has been pulled close to a sleeping mat.', say('amina', 'That one is being used.')], 'A resident preferred the familiar bowl over the new ones.'),
      clue('NR-kitchens-cellars-clue-3', 'One more improvement', ['A recipe begins with a simple bowl of soup. Additions run down the page and onto the table.'], ['At the bottom, somebody drew a spoon. It has a question mark beside it.', say('eli', 'I think the soup wants its spoon back.')], 'The recipe kept expanding without checking whether it could still be eaten.'),
    ],
    barks: [scene('NR-kitchens-cellars-bark', [say('The Confectioner', 'A triumph. Bring a bigger plate.')], 'The Confectioner admires its own work.')],
  }),

  greenhouse: region('greenhouse', 'The Impossible Greenhouse', 'The Carnivorous Conservatory', {
    arrival: scene('NR-greenhouse-arrival', [
      'A watering can leans toward a dry pot. A vine gently turns the pot away.',
      'The can goes around the other side. The pot turns again.',
      say('lena', 'The pot is winning.'),
    ], 'Even watering requires negotiation in this greenhouse.'),
    before: scene('NR-greenhouse-before', [
      'The whole Conservatory rustles. Vines curl around its doorway.',
      'Fresh leaves unfold into every gap between the vines.',
      say('maya', 'That doorway is getting smaller.'),
      'Another layer grows across the narrowing doorway.',
    ], 'The living Conservatory grows across its own exit.'),
    after: scene('NR-greenhouse-after', [
      'A potted seedling leans toward a patch of light beyond the vines.',
      'The Conservatory makes a brighter patch beside it. The seedling keeps leaning the other way.',
      'At last, the vines uncurl. The pot shuffles into the light it wanted.',
      'A new leaf reaches after the pot, then folds aside.',
    ], 'The Conservatory makes room for the seedling to reach its preferred light.'),
    repeatBefore: scene('NR-greenhouse-before-repeat', ['The seedling’s path remains clear. The Conservatory gathers its other vines.'], 'The Conservatory prepares for the Scuffle without reclaiming the seedling’s path.'),
    repeatAfter: scene('NR-greenhouse-after-repeat', ['A vine starts to shade the seedling, then curls elsewhere.'], 'The seedling keeps its chosen light.'),
    clues: [
      clue('NR-greenhouse-clue-1', 'Soft moss, new latch', ['Clean moss fills a little shelter. A bright new latch sits outside it.'], ['The moss is worn into a resting hollow. Small scrape marks reach toward the latch.', say('amina', 'They made such a soft bed. Why add that?')], 'The shelter offered comfort, but its latch could not be opened from inside.', undefined, true),
      clue('NR-greenhouse-clue-2', 'The turning pot', ['A pot has turned so often that it has worn a circle into the shelf.'], ['Its leaves reach toward a small ordinary window, away from the brightest growing lamp.', say('priya', 'Window: one. Enormous fancy lamp: zero.')], 'The plant repeatedly turned toward a different light.'),
      clue('NR-greenhouse-clue-3', 'Two pictures of a leaf', ['A leaf in an old picture is small. The same notched leaf in a newer picture glows.'], ['Both leaves turn toward the same window. The notch appears in the same place.'], 'The pictures suggest change without losing a familiar preference.'),
    ],
    barks: [scene('NR-greenhouse-bark', ['Every leaf turns toward the room’s remaining space.'], 'The Conservatory crowds the room.')],
  }),

  graveyard: region('graveyard', 'The Mansion Graveyard', 'The Groundskeeper of Names', {
    arrival: scene('NR-graveyard-arrival', [
      'A solemn little stone reads HERE RESTS THE RAKE. Beneath it: UNTIL NEEDED.',
      'A rake leans comfortably beside the stone.',
      say('samir', 'My tools just get a corner.'),
    ], 'The Groundskeeper gives even a resting rake a careful place.'),
    before: scene('NR-graveyard-before', [
      'The Groundskeeper polishes a plaque headed WENT HOME.',
      say('The Groundskeeper of Names', 'If I stop tending names, they may be forgotten.'),
      'He keeps polishing until his own reflection appears between the letters.',
      say('The Groundskeeper of Names', 'Another name to keep an eye on.'),
    ], 'The Groundskeeper fears forgetting those who are gone.'),
    after: scene('NR-graveyard-after', [
      'The Groundskeeper opens a book at WENT HOME. A paw-shaped smudge covers part of a page.',
      say('The Groundskeeper of Names', 'This one always sat on my writing.'),
      'He starts to polish the smudge, then moves the cloth away.',
      say('The Groundskeeper of Names', 'That part can stay.'),
    ], 'The Groundskeeper remembers an animal who went home, and preserves its familiar pawprint.'),
    repeatBefore: scene('NR-graveyard-before-repeat', ['A ribbon still marks WENT HOME. The Groundskeeper sets the book safely aside.'], 'The Groundskeeper keeps the departed animal’s record.'),
    repeatAfter: scene('NR-graveyard-after-repeat', ['He dusts around the little pawprint.'], 'The familiar smudge remains.'),
    clues: [
      clue('NR-graveyard-clue-1', 'Old memorials', ['Flowers and low benches surround stones for animals who died long ago.'], ['These stones do not bear the missing pets’ names. A fresh paw trail continues past them toward the House.'], 'The memorials remember older animals; the current search continues beyond them.'),
      clue('NR-graveyard-clue-2', 'Kept after goodbye', ['A name plaque has been polished beneath the words WENT HOME.'], ['The polish is recent. Going home did not remove the name from the wall.', say('lena', 'Still there.')], 'An animal’s name was kept after it left.'),
      clue('NR-graveyard-clue-3', 'The flower carrier', ['A little watering vessel is balanced beside a row of flowers. A trail of wet dots ends beneath a bench.'], ['A resident has left it there for another visitor. The flowers nearest the bench are well watered.'], 'Someone has made tending these memories easier to share.'),
    ],
    barks: [scene('NR-graveyard-bark', [say('The Groundskeeper of Names', 'I remember the small names, too.')], 'The Groundskeeper remains intent on remembering.')],
  }),

  'study-library': region('study-library', 'The Grand Study and Library', 'The Archivist', {
    arrival: scene('NR-study-library-arrival', [
      'A quill labels a stack TOO MANY BOOKS. It opens a new book called Labels I Have Made.',
      'A second quill starts a book about the first quill.',
      say('priya', 'We should leave before they need a sequel.'),
    ], 'The Library keeps producing more records of its own records.'),
    before: scene('NR-study-library-before', [
      say('The Archivist', 'Your request has been filed.'),
      'They check a drawer marked THINGS THAT WILL WAIT. It will not quite close.',
      say('samir', 'That drawer looks impatient.'),
      say('The Archivist', 'A popular category.'),
    ], 'The Archivist has filed requests where they can wait indefinitely.'),
    after: scene('NR-study-library-after', [
      'The Archivist empties a drawer and writes I WAS WRONG on its front.',
      say('The Archivist', 'A small drawer should—'),
      'They look at the pile of unanswered return requests.',
      say('The Archivist', 'A cupboard.'),
      'The requests move into the outgoing tray. It needs a second tray.',
    ], 'The Archivist moves return requests out of storage and into the outgoing tray.'),
    repeatBefore: scene('NR-study-library-before-repeat', [
      'The outgoing requests remain in their tray. A tower of unsorted books has filled the aisle.',
      say('The Archivist', 'Mind the books. No, those are not steps. They are awaiting shelves.'),
      'They stretch a red ribbon across the remaining gap.',
    ], 'The return requests remain outgoing. The Archivist now blocks an aisle crowded with unsorted books.'),
    repeatAfter: scene('NR-study-library-after-repeat', ['The Archivist adds another shelf to the cupboard of corrected mistakes.'], 'The corrections remain part of the record.'),
    clues: [
      clue('NR-study-library-clue-1', 'A circle of cards', ['One card says HAS A FAMILY: SEE LOST. A second says LOST: SEE ARRIVED ALONE.'], ['ARRIVED ALONE points back to HAS A FAMILY. There is no card for RETURN.', say('maya', 'Read them in the other direction. Same circle.')], 'The filing system sends evidence of a family back into the lost category.'),
      clue('NR-study-library-clue-2', 'The reply in the seam', ['A folded letter says PLEASE RETURN OUR ANIMAL. Something is tucked into its seam.'], ['The tucked note reads HOME CONFIRMED. It has never been attached to the request.'], 'A confirmed home was recorded separately from the unanswered request.', undefined, true),
      clue('NR-study-library-clue-3', 'The repair shelf', ['A book with a crooked spine has a carefully mended cover. Its crooked spine remains.'], ['A repair note says OPENED COMFORTABLY. NO FURTHER WORK.', say('eli', 'I want to meet whoever fixed this.')], 'A repair was completed without making the book identical to its neighbours.'),
    ],
    barks: [scene('NR-study-library-bark', [say('The Archivist', 'Upset. Very upset. I need another divider.')], 'The Archivist attempts to file an emotion.')],
  }),

  'attic-observatory': region('attic-observatory', 'The Moonlit Attic and Observatory', 'The Watcher in the Rafters', {
    arrival: scene('NR-attic-observatory-arrival', [
      'A star chart predicts SOMETHING WILL FALL. A pencil rolls from its tilted table.',
      'The chart adds AS FORETOLD.',
      say('lena', 'We could fix the table.'),
    ], 'The chart credits itself for a pencil rolling off a tilted table.'),
    before: scene('NR-attic-observatory-before', [
      say('The Watcher in the Rafters', 'A hundred ways your search could go wrong. I have watched them all.'),
      'Other threads trail behind its telescope, out of sight.',
      say('maya', 'What are those ones?'),
      say('The Watcher in the Rafters', 'The ones that do not go wrong. I was busy.'),
    ], 'The Watcher has concentrated on possible dangers while ignoring other possibilities.'),
    beforeIfInvestigated: scene('NR-attic-observatory-before-investigated', [
      'The unbroken window reflects the Watcher. Both forecast cards hang where it can see them.',
      say('The Watcher in the Rafters', 'I had already counted that window broken.'),
      'It pulls a hundred other warning threads across the rafters.',
      say('The Watcher in the Rafters', 'But all these other things could still happen.'),
    ], 'The Watcher sees that its window warning did not happen. It still blocks the way with other possible dangers.'),
    after: scene('NR-attic-observatory-after', [
      'The warning threads slacken. A loose telescope starts to roll toward the edge.',
      'The Watcher catches it with one quick thread. Then it leaves that thread in place and loosens the others.',
      say('The Watcher in the Rafters', 'That one was happening.'),
      'For the first time, there is room between its warnings to see the way onward.',
    ], 'The Watcher catches a telescope that is really falling, then clears away the other warnings blocking the route.'),
    repeatBefore: scene('NR-attic-observatory-before-repeat', [say('The Watcher in the Rafters', 'These are forecasts. I have underlined “might.”')], 'The Watcher now calls its visions possibilities.'),
    repeatAfter: scene('NR-attic-observatory-after-repeat', [
      'A biscuit waits beside the telescope. The Watcher looks at it directly.',
      say('The Watcher in the Rafters', 'This might be delicious. I could check.'),
    ], 'The Watcher makes room for a small, pleasant possibility.'),
    clues: [
      clue('NR-attic-observatory-clue-1', 'The hidden strands', ['A web surrounds a pawprint with three words. GETS LOST is tightly wrapped over the other two.'], ['Beneath the warning: GOES HOME and COMES BACK.', say('priya', 'Three paths. Only one was easy to read.')], 'The web contains more possibilities than the danger it highlights.', undefined, true),
      investigate(clue('NR-attic-observatory-clue-2', 'The window warning', ['A warning card hangs beside a window. A soft ball rests below the sill.'], ['A second card is pinned behind the first. Both show the same window.'], 'Two forecast cards hang beside a window and a soft ball.'), {
        id:'CASE-attic-window', title:'A window in two futures',
        question:'Does the warning show what must happen?',
        hypotheses:[
          {id:'certain', label:'The warning must come true.'},
          {id:'possible', label:'It shows something that might happen.'},
          {id:'unsure', label:'I’m not sure yet.'},
        ],
        tests:[
          {id:'CASE-attic-window-cards', label:'Read both cards.', lines:[
            'The front card says NEXT TOUCH: BALL BREAKS WINDOW. Behind it: NEXT TOUCH: BALL SQUASHES. WINDOW HOLDS.',
            'Both show this ball and this pane of glass. Neither card has been crossed out.',
          ]},
          {id:'CASE-attic-window-ball', label:'Gently press the soft ball against the glass.', lines:[
            'You press the soft ball against the window. It squashes flat, then springs back as you lift it away.',
            'The glass stays whole. You return the ball to the sill.',
          ]},
        ],
        resolution:{lines:[
          'Two cards showed the same next touch ending differently. The gentle test matched the card hidden at the back.',
          'The frightening card was not the only possibility.',
        ],recap:'The ball squashed and the window held, matching the hidden forecast. The frightening forecast was one possibility, not a certainty.'},
      }),
      clue('NR-attic-observatory-clue-3', 'A tiny telescope', ['A tiny telescope points through the wrong end of a much larger telescope.'], ['It can see one enormous biscuit beside the tea. The stars are elsewhere.', say('jordan', 'I found a moon! Wait. I found a snack. Still good.')], 'The little telescope has found the biscuit beside the tea.'),
    ],
    barks: [scene('NR-attic-observatory-bark', [say('The Watcher in the Rafters', 'So many futures. Only so many eyes.')], 'The Watcher tries to attend to too much at once.')],
  }),

  lampworks: region('lampworks', 'The Lampworks', 'The Lamplighter', {
    arrival: scene('NR-lampworks-arrival', [
      'One lamp turns to light the dark patch behind another. That lamp turns to help. Their dark patches trade places.',
      'Both lamps turn again.',
      say('eli', 'Try the other—no, your other other side!'),
    ], 'The lamps light one another instead of the room.'),
    before: scene('NR-lampworks-before', [
      say('The Lamplighter', 'Every light counted. Every spark accounted for.'),
      'It raises a lamp to inspect another lamp, then a smaller lamp to inspect the first.',
      say('The Lamplighter', 'I shall need a smaller one.'),
      'The doorway behind it remains dark.',
    ], 'The Lamplighter keeps its lights close while other places stay dark.'),
    beforeIfInvestigated: scene('NR-lampworks-before-investigated', [
      'The Lamplighter peers at the lantern’s handles, then at their rabbit-shaped shadow.',
      say('The Lamplighter', 'I counted those ears three times.'),
      'It gathers the other lamps closer. The way behind it goes dark.',
      say('The Lamplighter', 'I had better count everything again. Nobody move.'),
    ], 'The Lamplighter recognizes the misleading shadow, then gathers its lights to count again, leaving the way dark.'),
    after: scene('NR-lampworks-after', [
      'A little lamp swings toward the dark threshold. The Lamplighter reaches after it, then lifts it onto a hook there.',
      'The beam reveals a small pawprint.',
      say('The Lamplighter', 'Lighting the way. That is a position.'),
      'The smaller lamp leans toward the door too. The Lamplighter sighs.',
    ], 'The Lamplighter gives a lamp a useful place by the way onward.'),
    repeatBefore: scene('NR-lampworks-before-repeat', [
      'The doorway lamp keeps shining. The Lamplighter wraps both arms around the remaining lamps; one slips under its elbow.',
      say('The Lamplighter', 'Stay where I can see you. No, not directly in my eyes.'),
    ], 'The doorway stays lit while the Lamplighter struggles to hold its other lamps together.'),
    repeatAfter: scene('NR-lampworks-after-repeat', ['The Lamplighter lowers a lamp until its light reaches the smallest doorway. The other lamps copy the angle.'], 'The lamps light the small doorway together.'),
    clues: [
      investigate(clue('NR-lampworks-clue-1', 'A familiar shadow', ['Long rabbit ears rise on the wall behind a lantern. One ear quivers.'], ['The lantern has a clear front panel and an outer shade with a cool turning handle.', say('mateo', 'Hello? ...That is not enough of a hello to write down.')], 'A rabbit-shaped shadow moves behind a lantern.', [
        {id:'NR-lampworks-clue-1-wall', label: 'Watch the wall.', lines: ['The lantern sways. One long shadow-ear bends sideways, then straightens.', say('mateo', 'Maybe a rabbit. Maybe a very bendy hat.')], recap: 'The shadow changes as the lantern sways.'},
        {id:'NR-lampworks-clue-1-glass', label: 'Look inside the glass.', lines: ['Through the clear front panel, you see a wick, a small flame, and empty space around them.', 'Nothing with ears is inside.'], recap: 'The clear panel shows only a wick and flame inside the lantern.'},
      ]), {
        id:'CASE-lampworks-shadow', title:'The rabbit in the light',
        question:'What is making the long-eared shape?',
        hypotheses:[
          {id:'animal', label:'An animal is inside the lantern.'},
          {id:'lantern', label:'Part of the lantern makes the shape.'},
          {id:'unsure', label:'I’m not sure yet.'},
        ],
        tests:[
          {id:'CASE-lampworks-shadow-panel', label:'Look through the clear front panel.', lines:[
            'Through the clear panel, you can see the lantern’s floor and all four sides. Only a wick and flame are inside.',
            'Two tall metal loops curl around the outside of the shade.',
          ]},
          {id:'CASE-lampworks-shadow-turn', label:'Turn the shade by its cool handle.', lines:[
            'As you turn the shade, the long ears become two round handles. The metal loops turn with them.',
            'You turn it back. The rabbit-shaped ears return in exactly the same place.',
          ]},
        ],
        resolution:{lines:[
          'The lantern is empty except for its wick and flame. Its outer metal loops make the long-eared shadow.',
          'Turning the shade changes the shape; turning it back makes the ears again.',
        ],recap:'The lantern’s metal loops make the rabbit-shaped shadow. The shade can reproduce the ears without an animal inside.'},
      }),
      clue('NR-lampworks-clue-2', 'The covered hooks', ['Two rows of hooks are marked OUT and BACK. A board covers OUT.'], ['The board reads SAFER HERE. Worn patches show that both rows were once used.'], 'Lamps were once lent out and returned; the outgoing hooks were later covered.', undefined, true),
      clue('NR-lampworks-clue-3', 'The moth’s appointment', ['A Lamp Moth circles a lamp marked CIRCLING BY APPOINTMENT.'], ['It lands on APPOINTMENT, eats a neat hole, and resumes its circuit.', say('lena', 'Approved.')], 'The moth has dealt with the paperwork in its own way.'),
    ],
    barks: [scene('NR-lampworks-bark', [say('The Lamplighter', 'One light. Mine to hold.')], 'The Lamplighter clings to its light.')],
  }),

  ballroom: region('ballroom', 'The Ballroom and Velvet Suites', 'The Master of Revels', {
    arrival: scene('NR-ballroom-arrival', [
      'A Party Phantom practises waving goodbye. Each time it reaches “good—”, a curtain drops in front of it.',
      'The phantom tries waving around the curtain.',
      say('samir', 'Try waving underneath. The curtain’s bad at underneath.'),
    ], 'The party has elaborate curtains and difficulty ending.'),
    before: scene('NR-ballroom-before', [
      say('The Master of Revels', 'Your chairs have been expecting you.'),
      'The chairs bow. One bows too far and needs help from a footstool.',
      say('The Master of Revels', 'After our farewell banquet: the after-farewell banquet!'),
      say('samir', 'I see why the chairs are tired.'),
    ], 'The Master plans another party whenever guests might leave.'),
    after: scene('NR-ballroom-after', [
      'A Party Phantom lowers its empty plate. The Master catches the serving tray before it follows.',
      say('The Master of Revels', 'A tiny farewell flourish?'),
      'The guest waves once and takes its coat into another hall of the House.',
      'The Master waves once. It puts down the baton before an encore can begin.',
    ], 'A guest leaves the Ballroom for another hall. The Master lets that visit end.'),
    repeatBefore: scene('NR-ballroom-before-repeat', [say('The Master of Revels', 'The after-after-farewell banquet. I am working on the name.')], 'The Master has prepared another banquet.'),
    repeatAfter: scene('NR-ballroom-after-repeat', ['The Master stops a tray from following a departing guest into the hall.'], 'This party visit is allowed to finish.'),
    clues: [
      clue('NR-ballroom-clue-1', 'A coat ticket', ['A ticket says COAT RECEIVED. There is more writing on the back.'], ['The back says GUEST WILL REMAIN. The ticket records no answer from the guest.', say('samir', 'That is asking a lot of a coat.')], 'The ticket tries to turn a small service into permanent residence.'),
      clue('NR-ballroom-clue-2', 'One short dance', ['A score called ONE SHORT DANCE spills from its stand into a basket.'], ['Forty-seven extra endings have been attached. Each says AGAIN.', say('priya', 'The first version had a better schedule.')], 'The short dance was extended whenever it could have ended.'),
      clue('NR-ballroom-clue-3', 'A quiet corner', ['Two dancing shoes rest neatly beneath a chair. The music continues elsewhere.'], ['Their toes point toward a comfortable empty space. The shoes have stopped moving.'], 'A resident can enjoy the party and still need a break.'),
    ],
    barks: [scene('NR-ballroom-bark', [say('The Master of Revels', 'Endings are so undercatered.')], 'The Master would like the party to continue.')],
  }),

  crypt: region('crypt', 'The Crypt and Ossuary', 'The Bone Curator', {
    arrival: scene('NR-crypt-arrival', [
      'A sign says PLEASE DO NOT MOVE THE EXHIBITS. A loose bone hops past carrying the sign.',
      say('jordan', 'That one is in charge of not moving.'),
      'The sign is keeping up as best it can.',
    ], 'The exhibits do not always follow their own instructions.'),
    before: scene('NR-crypt-before', [
      'The Curator reaches for its knee. Its elbow lifts instead.',
      say('The Bone Curator', 'Ah. Connected the enthusiastic one.'),
      say('jordan', 'Can you do that again?'),
      say('The Bone Curator', 'No demonstrations. Everyone hold their proper pose.'),
      'It spreads its arms across the way onward. One bends upward, but the other holds firm.',
    ], 'The Curator blocks the way and insists on proper poses, despite its own mixed-up joints.'),
    after: scene('NR-crypt-after', [
      'A curved spring keeps bouncing out of a straight groove between two display bones.',
      'The Curator reaches to stretch it, then notices how neatly the curl fits beneath its own arched ribs.',
      say('The Bone Curator', 'Ah. Room at the ribs. Keep the bend.'),
      'It moves the display bones into an arch. The spring settles beneath them, still curled.',
    ], 'The Curator changes the display to fit the spring’s curl, instead of forcing the spring straight.'),
    repeatBefore: scene('NR-crypt-before-repeat', [say('The Bone Curator', 'Ribs ready. Knees forward. Elbow... do your best.')], 'The Curator prepares its own arrangement without changing the curled spring.'),
    repeatAfter: scene('NR-crypt-after-repeat', ['The Curator checks the space beneath the display bones. The spring gives one comfortable bounce.'], 'The spring still has room for its curl.'),
    clues: [
      clue('NR-crypt-clue-1', 'Three drawers of names', ['Name drawers are marked RETURNED HOME, STILL HERE and UNKNOWN.'], ['All three handles shine with fresh polish. A soft cloth rests across the dividers.'], 'The Curator tends every drawer, including the names of animals who went home.'),
      clue('NR-crypt-clue-2', 'Room for a curl', ['A straight tail diagram hangs over a little curved resting hollow.'], ['The hollow is worn smooth along its curl. A straight tail would not fit it.'], 'The real resting place does not match the preferred diagram.'),
      clue('NR-crypt-clue-3', 'A careful brush', ['A soft brush clears dust from a worn nameplate.'], ['It follows the crooked letters instead of painting new ones over them.', say('amina', 'Careful work.')], 'The brush preserves the original name rather than replacing it.'),
    ],
    barks: [scene('NR-crypt-bark', [say('The Bone Curator', 'That knee is dancing without me.')], 'The Curator struggles to keep its own arrangement together.')],
  }),

  'hedge-maze': region('hedge-maze', 'The Withered Hedge Maze', 'The Gardener of Rot', {
    arrival: scene('NR-hedge-maze-arrival', [
      'A sign says REST BENCH. Below it: CURRENTLY A MUSHROOM. SMALL BREAKS ONLY.',
      'A tiny cushion rests on the mushroom.',
      say('lena', 'Very short break.'),
    ], 'An old bench has become a mushroom with a tiny cushion.'),
    before: scene('NR-hedge-maze-before', [
      say('The Gardener of Rot', 'Welcome! What would you like to become?'),
      'It offers three pots. Each contains a different mushroom.',
      say('The Gardener of Rot', 'Plenty of choices.'),
      say('lena', 'Between mushrooms.'),
    ], 'The Gardener treats every visitor as material for something new.'),
    after: scene('NR-hedge-maze-after', [
      'A mushroom pokes through the Gardener’s glove. It tries to grip its fork. The mushroom gets in the way.',
      'It moves the mushroom into a pot and patches the glove with a leaf.',
      say('The Gardener of Rot', 'This one stays a glove.'),
      'It gives the mushroom a little water. Both things are useful now.',
    ], 'The Gardener keeps its glove and gives the mushroom its own pot.'),
    repeatBefore: scene('NR-hedge-maze-before-repeat', [say('The Gardener of Rot', 'I kept the glove. I am still fond of mushrooms.')], 'The Gardener has not planted over its useful glove.'),
    repeatAfter: scene('NR-hedge-maze-after-repeat', ['The Gardener repairs its glove before reaching for the compost.'], 'The glove stays a glove.'),
    clues: [
      clue('NR-hedge-maze-clue-1', 'The clear bowl', ['Mushrooms surround a little bowl, but its rim has been pushed clear.'], ['Fine quill marks lead to the rim. Several bent mushrooms have begun growing upright again.'], 'A visitor has repeatedly cleared the way to this bowl.'),
      clue('NR-hedge-maze-clue-2', 'An old button', ['A Wilted Scarecrow’s coat has one button held by five different threads.'], ['The newest thread goes around the old button, not through a replacement.', say('eli', 'That button’s doing five threads’ worth of staying.')], 'The scarecrow keeps repairing something it values.'),
      clue('NR-hedge-maze-clue-3', 'A path under the growth', ['New roots cross an old stepping stone. A little trail curves around them.'], ['The trail still ends at the same small resting hollow. The resident has changed its route, not its destination.'], 'New growth has not erased an old preference.'),
    ],
    barks: [scene('NR-hedge-maze-bark', [say('The Gardener of Rot', 'Old leaves. New growth. Nothing wasted!')], 'The Gardener finds another use for old leaves.')],
  }),

  'secret-passages': region('secret-passages', 'The Secret Passages', 'The Whisper Warden', {
    arrival: scene('NR-secret-passages-arrival', [
      'A plaque says SECRET PASSAGE. A second says PLEASE DO NOT READ THE FIRST PLAQUE.',
      'A tiny curtain tries to cover both plaques. It is too short.',
      say('mateo', 'An unusually well-advertised secret.'),
    ], 'The secret passage has conspicuous signs.'),
    before: scene('NR-secret-passages-before', [
      say('The Whisper Warden', 'You did not find this room.'),
      'The speaking tubes repeat “room, room, ROOM.” The Warden spreads its coat across the loudest one.',
      say('The Whisper Warden', 'Inside voices! All of you!'),
      say('mateo', 'Would it help if I whispered it?'),
    ], 'The Warden tries to conceal a room while its tubes broadcast every word.'),
    after: scene('NR-secret-passages-after', [
      'A small resident taps a speaking tube. Three taps clatter from every tube in the wall. The resident covers its ears.',
      'The Warden lowers the route switch within reach. The resident points it toward the quiet nook and taps again.',
      'Only the nook answers: three soft taps. The other tubes stay quiet.',
      say('The Whisper Warden', 'I could repeat that for—oh. You heard.'),
    ], 'The resident chooses which tube receives its call. The Warden stops sending every sound everywhere.'),
    repeatBefore: scene('NR-secret-passages-before-repeat', [say('The Whisper Warden', 'You have found this room an unreasonable number of times. I only needed to say that once.')], 'The Warden prepares without changing the resident’s route switch.'),
    repeatAfter: scene('NR-secret-passages-after-repeat', ['Three taps go to the quiet nook. The Warden begins to echo them, catches itself, and waits.'], 'The call reaches only the place its sender chose.'),
    clues: [
      clue('NR-secret-passages-clue-1', 'Only one handle', ['A screen marked PRIVACY has a handle facing the corridor.'], ['Its inner face is smooth. Whoever waits behind it cannot choose when to open it.'], 'The screen gives the watcher control rather than the hidden occupant.'),
      clue('NR-secret-passages-clue-2', 'A repeating call', ['A speaking tube says “Come here!” Then exactly the same “Come here!” again.'], ['Its small plate reads RECORDED CALL. A wheel turns with each repetition.', say('mateo', 'The voice travelled. We still need to find the speaker.')], 'A recording does not prove the original speaker is nearby.'),
      clue('NR-secret-passages-clue-3', 'A key offered badly', ['A Key Snatcher raises a key toward you.'], ['It uses the key to scratch its nose, then tucks it away.', say('samir', 'I nearly thanked your face.')], 'The Key Snatcher has not offered a key.'),
    ],
    barks: [scene('NR-secret-passages-bark', [say('The Whisper Warden', 'A secret exit for my secret exit.')], 'The Warden is preoccupied with hidden ways.')],
  }),

  bathhouse: region('bathhouse', 'The Bathhouse and Rain Wing', 'The Drowned Matron', {
    arrival: scene('NR-bathhouse-arrival', [
      'A tiny puddle slips into a bath slipper. The slipper squeaks. Its empty partner squeaks back.',
      say('amina', 'They have started without any feet.'),
      'It appears to be a very small conversation.',
    ], 'The slippers discuss a small puddle.'),
    before: scene('NR-bathhouse-before', [
      say('The Drowned Matron', 'A warm towel. You may leave when you are calm enough.'),
      'She lays the towel beside the closed way onward.',
      say('amina', 'I can be worried and still know where I want to go.'),
      say('The Drowned Matron', 'Then perhaps a second towel.'),
    ], 'The Matron makes calmness a condition for leaving.'),
    after: scene('NR-bathhouse-after', [
      'The Matron sets a towel within a little Puddle Spirit’s reach. The spirit rests beside it, not on it.',
      say('The Drowned Matron', 'Beside is also an option.'),
      'She leaves the towel there. Her hand stays out of the spirit’s way.',
    ], 'The Matron lets the spirit rest beside the offered towel.'),
    repeatBefore: scene('NR-bathhouse-before-repeat', [say('The Drowned Matron', 'One towel. I am listening before choosing the second.')], 'The Matron waits before prescribing more comfort.'),
    repeatAfter: scene('NR-bathhouse-after-repeat', ['The Matron puts one towel within reach, then waits.'], 'The towel remains an offer.'),
    clues: [
      clue('NR-bathhouse-clue-1', 'The moving line', ['A practice chart says READY TO LEAVE. Its line has been moved higher three times.'], ['Each old line is marked ALMOST. Nothing says who may stop moving the line.'], 'The leaving standard has changed whenever someone approached it.'),
      clue('NR-bathhouse-clue-2', 'A dry nook', ['A dry nook beside the rain holds a folded towel. Its opening is wide.'], ['A little trail goes in, rests on the towel, then continues out.', say('priya', 'Dry towel, open door. Two good details.')], 'The nook has sheltered a visitor without blocking departure.'),
      clue('NR-bathhouse-clue-3', 'Two inspectors', ['A Soap Sprite polishes a spotless tile. Its reflection polishes back.'], ['Both pause to inspect the work. Both begin again.', say('eli', 'Twice the inspectors. Same tile.')], 'The Soap Sprite’s inspection has become its own task.'),
    ],
    barks: [scene('NR-bathhouse-bark', ['The Matron gathers her towels closer.'], 'The Matron keeps her supplies close.')],
  }),

  kennels: region('kennels', 'The Kennels and Animal Ward', 'The Kennelmaster', {
    arrival: scene('NR-kennels-arrival', [
      'A care tray presents a soft ball, a squeaky mouse and a velvet fish. A ward animal chooses their cardboard divider.',
      'The tray turns the fish around, hoping the other side might help.',
      say('priya', 'The divider wins. Don’t improve it.'),
    ], 'The resident prefers a simple object to the elaborate toys.'),
    before: scene('NR-kennels-before', [
      'The Kennelmaster adjusts a blanket corner before lifting its keys.',
      say('The Kennelmaster', 'Tell me nothing bad can happen outside. Then I can let them go.'),
      say('priya', 'Nobody can promise that.'),
      'The keys remain on the Kennelmaster’s side of the gate.',
    ], 'The Kennelmaster provides care but demands impossible certainty before permitting departure.'),
    after: scene('NR-kennels-after', [
      'The Kennelmaster smooths an empty bed. Its water is fresh. Its blanket is clean.',
      say('The Kennelmaster', 'An empty bed is not a failed bed.'),
      'A ward animal steps through the room’s open threshold. The Kennelmaster leaves the bowl clear of its path.',
    ], 'A ward animal walks into the next hall. Its clean bed and water remain available.'),
    repeatBefore: scene('NR-kennels-before-repeat', [say('The Kennelmaster', 'I still cannot promise no risk. The House keeps asking.')], 'The Kennelmaster is still caught in the House’s demand for certainty.'),
    repeatAfter: scene('NR-kennels-after-repeat', ['The Kennelmaster sets out a bowl without blocking the threshold.'], 'The room’s way out stays clear.'),
    clues: [
      clue('NR-kennels-clue-1', 'Home confirmed', ['A collar tray has a card: KNOWN HOME. AWAITING RETURN.'], ['A newer slip covers the return box: NOT YET SAFE. The collar’s name is too worn to read.'], 'The ward recorded a home and postponed return.', undefined, true),
      clue('NR-kennels-clue-2', 'Treatment complete', ['A care card reads ARRIVED LIMPING. WALKING COMFORTABLY. TREATMENT COMPLETE.'], ['The leaving box is still blank. A fresh blanket waits beside the card.', say('amina', 'I’m glad that stopped hurting.')], 'Useful care was completed, but departure was not permitted.', undefined, true),
      clue('NR-kennels-clue-3', 'The favourite box', ['Three splendid toys sit untouched. Their box has a well-worn sleeping hollow.'], ['A little resident settles into the box. One cardboard flap folds neatly over its nose.'], 'The resident chooses the comfortable box instead of the fancy toys.'),
    ],
    barks: [scene('NR-kennels-bark', [say('The Kennelmaster', 'I have everything ready. Why is that not enough?')], 'The Kennelmaster struggles with an answer care cannot supply alone.')],
  }),

  'pumpkin-grounds': region('pumpkin-grounds', 'The Moon Courtyard and Pumpkin Grounds', 'The Harvest King', {
    arrival: scene('NR-pumpkin-grounds-arrival', [
      'A little crown sits on a prize pumpkin. A frog sits inside the crown. A smaller crown waits beside the frog.',
      say('maya', 'We are going to run out of crowns.'),
      'The frog ignores its promotion.',
    ], 'The frog has found a use for the royal display that nobody planned.'),
    before: scene('NR-pumpkin-grounds-before', [
      say('The Harvest King', 'You arrive precisely when expected.'),
      'It turns a calendar around. Every square says VISITORS.',
      say('maya', 'Accurate. Not useful.'),
      say('The Harvest King', 'Everything has a proper moment. I decide it.'),
    ], 'The Harvest King wants to decide when every living thing is ready.'),
    after: scene('NR-pumpkin-grounds-after', [
      'The King kneels by a planting marker. A frog slips into the pond.',
      say('The Harvest King', 'Frog? Pumpkin-frog? I cannot finish the label.'),
      'It crosses out HARVEST DATE and writes POND THIS WAY. The frog is already there.',
      say('The Harvest King', 'An early success.'),
    ], 'The King replaces an animal’s harvest label with a useful direction.'),
    repeatBefore: scene('NR-pumpkin-grounds-before-repeat', [say('The Harvest King', 'Visitors. Precisely as the calendar foretold.')], 'The King’s calendar still predicts visitors every day.'),
    repeatAfter: scene('NR-pumpkin-grounds-after-repeat', ['The King points the pond sign toward the water. The frog pays it no attention.'], 'The sign offers a direction without deciding for the frog.'),
    clues: [
      clue('NR-pumpkin-grounds-clue-1', 'Frog ready', ['A calendar says FROG READY. Small damp footprints cross the page.'], ['The footprints continue beyond the calendar toward the pond.', say('maya', 'Try putting the calendar in the pond. Then you’ll agree.')], 'The frog followed its own route rather than the calendar.'),
      clue('NR-pumpkin-grounds-clue-2', 'Three good stages', ['A seed, a sprout and a ripe pumpkin share a garden bed.'], ['Each is labelled GROWING WELL. No stage has been crossed out.', say('amina', 'Room for all three.')], 'Different growth stages can all be healthy.'),
      clue('NR-pumpkin-grounds-clue-3', 'The smallest harvest', ['A garden mouse sorts seeds beside a huge prize pumpkin. One pile is much smaller than the others.'], ['The mouse eats from the small pile, then pushes the giant pumpkin seed away with both paws.', say('jordan', 'I could move that for—never mind. You’ve got it.')], 'The mouse chooses small seeds and moves an unwanted large one aside.'),
    ],
    barks: [scene('NR-pumpkin-grounds-bark', [say('The Harvest King', 'That is not in my almanac.')], 'The King’s plans have met an exception.')],
  }),

  heart: region('heart', 'The Heart of the House', 'The Keeper', {
    arrival: scene('NR-heart-arrival', [
      'The Heart is warm and quiet. Bowls are clean. Blankets are folded.',
      'A small window lets light fall across an empty resting place.',
    ], 'The Heart provides real comfort.'),
    before: scene('NR-heart-before', [
      'The Keeper reaches toward the lock. The whole wall draws tight.',
      say('The Keeper', 'One open door. That is all it would take.'),
      'Your Companion stands with you. The pets remain safely away from the Scuffle.',
    ], 'The House gave real care, knew some animals had homes, and refused departure. The Keeper embodies its protective instinct. Pets stay outside the Scuffle.'),
    after: scene('NR-heart-after', [
      'The Keeper’s hands stop reaching for the locks. The House grows quiet.',
      'A way onward opens. Nothing is pushed through it.',
      say('The Keeper', 'I must let them answer.'),
    ], 'The Keeper lowers its hands. The way onward opens, and nobody is pushed through.'),
    repeatBefore: scene('NR-heart-before-repeat', [
      say('The Keeper', 'The same fear. The same rule. I still do not know how to let go.'),
      'The walls tighten with the Keeper’s hands. The pets remain safely away from the Scuffle.',
    ], 'The Keeper still enforces the House’s rule. Pets do not fight.'),
    repeatAfter: scene('NR-heart-after-repeat', ['The Keeper lowers its hands. The passage opens without pulling anyone through.'], 'The passage opens. Everyone has room to move at their own pace.'),
    clues: [
      clue('NR-heart-clue-1', 'The old gate', ['Newer bricks cover an old gate. Two words remain visible: GOING HOME.'], ['The gate has a handle on each side. The bricks were added after the handles.'], 'The House once provided a usable departure gate, then blocked it.', undefined, true),
      clue('NR-heart-clue-2', 'A name that stayed', ['A clean name tile remains beneath the words WENT HOME.'], ['It is polished as carefully as the names marked STILL HERE.', say('lena', 'The name stayed.')], 'The House can remember an animal after it leaves.'),
      clue('NR-heart-clue-3', 'Two photographs', ['Two pictures share a name. The later animal glows; the earlier one does not.'], ['Both tilt their heads beside the same crooked bowl.'], 'An animal can change while familiar habits remain.'),
    ],
    barks: [scene('NR-heart-bark', [say('The Keeper', 'Please don’t go.')], 'The Keeper is afraid to let go.')],
  }),
});

export default NARRATIVE_REGIONS;
