/**
 * First guardian resolutions: a chosen action, followed by its exact outcome.
 * Pure authored data. No combat effects, rewards, inventory requirements or RNG.
 * The consumer keeps choices after Short version and commits the chosen ID and
 * region resolution only after the selected outcome is continued. Never play
 * every outcome or infer an unselected action. Repeats use narrative-regions.
 * All three branches preserve the same regional promise; none resolves a pet.
 */
const say = (speaker, text) => ({ speaker, text });
const choice = (id, label, lines, recap) => ({ id, label, lines, recap });
const care = (id, title, lines, recap, choices) => ({ id, title, lines, recap, choices });

export const AFTERCARE = Object.freeze({
  foyer: care('AFTER-foyer', 'The little bell', [
    'A low bell rings. A water dish tips at the edge of the Butler’s tray.',
    'A little hatch opens beside the counter. A tiny towel hangs from the Butler’s head.',
  ], 'A little service bell rings. The Butler’s water dish is tipping beside an open hatch.', [
    choice('AFTER-foyer-dish', 'Steady the edge of the dish.', [
      'You steady the dish. The Butler catches the tray beneath it without spilling a drop.',
      say('The Butler', 'Excellent timing. Animals dislike a breakfast served vertically.'),
      'He sets the water by the hatch. An unseen nose sniffs; the dish slides inside.',
      'He leaves the towel on his head until the drinking stops.',
    ], 'You steadied the dish. The Butler served water to an animal behind the hatch.'),
    choice('AFTER-foyer-hatch', 'Point out the waiting hatch.', [
      'You point to the hatch. The Butler catches the dish with his free hand and turns the tray.',
      say('The Butler', 'The breakfast bell. Supper? The clock is unhelpful. They are fed.'),
      'A nose sniffs at the water. The dish slides inside, and quiet lapping follows.',
      'The towel stays on his head. For once, something else comes first.',
    ], 'You pointed out the waiting hatch. The Butler caught the dish and served the animal its water.'),
    choice('AFTER-foyer-watch', 'Give the Butler room.', [
      'You leave room beside the tray. The Butler catches the tipping dish without losing a drop.',
      say('The Butler', 'The animals’ water. I do remember the important parts.'),
      'He serves it through the hatch. A nose sniffs, and the dish slides inside.',
      'The tiny towel remains on his head until the drinking stops.',
    ], 'You gave the Butler room. He caught the dish and tended the animal behind the hatch.'),
  ]),

  nursery: care('AFTER-nursery', 'A busy hat', [
    'The Governess reaches toward the soldier’s crooked duster hat.',
    'The soldier pats its hat, then points the feathers toward a dusty sleeve.',
  ], 'The Governess wants to straighten the hat. The soldier has a job for it.', [
    choice('AFTER-nursery-sleeve', 'Point to the dusty sleeve.', [
      'You point to the dust. The Governess lowers her sleeve within the soldier’s reach.',
      'The crooked hat dusts it beautifully. The soldier pats the hat again.',
      say('The Governess', 'Oh. You were busy.'),
      'She leaves the hat alone and offers her other sleeve.',
    ], 'You pointed out the dust. The Governess let the soldier keep its hat and finish its job.'),
    choice('AFTER-nursery-space', 'Clear a little space on the table.', [
      'You slide an empty spool aside. The soldier steps into the space and dusts the Governess’s sleeve.',
      say('The Governess', 'I see. You require working room.'),
      'She turns her other sleeve toward it. The hat remains proudly crooked.',
    ], 'You cleared working space. The soldier kept its hat, and the Governess offered both sleeves for dusting.'),
    choice('AFTER-nursery-watch', 'Watch what the soldier does.', [
      'You wait. The soldier ducks beneath the Governess’s hand and dusts her sleeve.',
      'Her hand stops above the crooked hat.',
      say('The Governess', 'Oh. You were busy.'),
      'She offers the other sleeve instead of straightening anything.',
    ], 'You watched. The soldier showed what its hat was for, and the Governess left it alone.'),
  ]),

  'sleeping-quarters': care('AFTER-sleeping-quarters', 'From the inside', [
    'A small paw reaches beneath the curtain toward its dangling cord.',
    'The Beast’s foot blocks the gap. The cord stops just short of the paw.',
  ], 'The occupant is reaching for a curtain cord it cannot quite reach.', [
    choice('AFTER-sleeping-quarters-cord', 'Lower the loose end of the cord.', [
      'You lower the loose end. The Beast shifts its foot aside, and the paw takes the cord.',
      'The curtain opens a little, then closes again.',
      say('The Bedframe Beast', 'An excellent hiding place. It works both ways.'),
      'The cord stays within reach on the inside.',
    ], 'You lowered the cord. The Beast cleared the gap, and the occupant can now open or close its own curtain.'),
    choice('AFTER-sleeping-quarters-foot', 'Show the Beast where its foot is.', [
      'You point to the blocked gap. The Beast looks down.',
      say('The Bedframe Beast', 'That foot again. Always somewhere.'),
      'It moves the foot and lowers the cord. The paw opens the curtain a little, then closes it.',
      'The Beast keeps the gap clear and the cord within reach.',
    ], 'You showed the blocked gap. The Beast moved its foot and gave the occupant control of the curtain.'),
    choice('AFTER-sleeping-quarters-watch', 'Give the little paw room.', [
      'You wait clear of the curtain. The paw reaches again.',
      'The Beast notices, shifts its foot, and lowers the cord into the paw’s reach.',
      'The curtain opens a little, then closes.',
      say('The Bedframe Beast', 'A very good place to choose to hide.'),
    ], 'You gave the occupant room. The Beast cleared the gap and left the cord where the paw could reach it.'),
  ]),

  'kitchens-cellars': care('AFTER-kitchens-cellars', 'One plain spoon', [
    'The Recipe Board pins the handle of a plain spoon. A bowl of soup waits nearby.',
    'The Confectioner reaches for its icing bag.',
  ], 'A plain spoon is caught under the Recipe Board. The Confectioner is considering icing it.', [
    choice('AFTER-kitchens-cellars-spoon', 'Put the plain spoon beside the bowl.', [
      'You ease the spoon from under the board and put it beside the bowl. The Confectioner gives the soup one careful stir.',
      say('The Confectioner', 'No lumps. No sprinkles. Remarkable.'),
      'It sets the icing bag down and places the plain spoon safely apart from the decorations.',
    ], 'You put the spoon by the soup. The Confectioner used it and decided to keep it plain.'),
    choice('AFTER-kitchens-cellars-ask', 'Ask, “Who ordered the soup?”', [
      'A tiny whisk rises from behind the bowl. A mouse in a chef’s hat steps out.',
      say('The Confectioner', 'Ah. My supervisor.'),
      'The mouse points its whisk at the icing bag. Then at the cupboard.',
      'The Confectioner puts the icing away, frees the plain spoon, and stirs. The mouse tastes one drop and nods.',
      say('The Confectioner', 'A good review. You should have seen the face it made at my lemon gravy.'),
    ], 'You asked who ordered the soup. A mouse chef directed the Confectioner to put away the icing and use the spoon plain.'),
    choice('AFTER-kitchens-cellars-watch', 'Watch the spoon for a moment.', [
      'You wait. The Confectioner shifts the board and lifts the spoon with the hand that was reaching for the icing.',
      'It tries one stir. Then another.',
      say('The Confectioner', 'Keep this one. We may need to stir something.'),
      'It leaves the spoon plain and puts the icing aside.',
    ], 'You watched. The Confectioner discovered that the plain spoon worked and left it that way.'),
  ]),

  greenhouse: care('AFTER-greenhouse', 'The light over there', [
    'A seedling leans toward a small ordinary window. Its pot nudges a vine across the path.',
    'The Conservatory lowers an enormous growing lamp beside it. The seedling keeps facing the window.',
  ], 'The seedling wants the ordinary window. A vine blocks its path, and a fancy growing lamp has not tempted it.', [
    choice('AFTER-greenhouse-path', 'Point out the ordinary window.', [
      'You point to the window. Its small pane is open a crack; the edge of a leaf trembles in the breeze.',
      'The Conservatory follows your finger and uncurls the vines from the path.',
      'The pot shuffles to the window. Its leaves turn in the moving air. The enormous lamp is left lighting an empty saucer.',
    ], 'You pointed out the ordinary window. The Conservatory cleared the path, and the seedling moved into its light and breeze.'),
    choice('AFTER-greenhouse-leaf', 'Look at the fancy lamp.', [
      'You look beneath the gold-painted shade. The Conservatory tilts it, showing off a bright, tidy circle of light.',
      'The seedling turns one leaf away. The lamp tilts farther. The leaf turns farther.',
      'The Conservatory stops tilting. It lifts the lamp and the blocking vines out of the way.',
      'The pot shuffles to the ordinary window. The lamp’s gold tassel swings over the empty spot.',
    ], 'You examined the lamp. The seedling kept turning away as it tilted closer. The Conservatory moved it and the vines aside; the seedling chose the window.'),
    choice('AFTER-greenhouse-watch', 'Ask for a clear path to both lights.', [
      'You ask for a clear path to each light. The Conservatory draws the vines back from both.',
      'The seedling shuffles past the lamp’s bright circle. A loose root pauses at the edge, then follows the pot toward the window.',
      'At the sill, the seedling spreads its leaves. The lamp stays where it is. Both paths remain open.',
    ], 'You asked for both paths to be clear. The seedling passed the lamp and settled at the window; neither light was taken away.'),
  ]),

  graveyard: care('AFTER-graveyard', 'The part that stays', [
    'The Groundskeeper opens a book at WENT HOME. A paw-shaped smudge covers part of the writing.',
    'His polishing cloth pauses above the smudge.',
  ], 'A familiar pawprint marks the record of an animal who went home. The Groundskeeper is about to polish the page.', [
    choice('AFTER-graveyard-print', 'Point gently to the pawprint.', [
      'You point to the little shape. The Groundskeeper lowers his cloth beside it.',
      say('The Groundskeeper of Names', 'This one always sat on my writing.'),
      'He dusts around the print and leaves it untouched.',
      say('The Groundskeeper of Names', 'That part can stay.'),
    ], 'You pointed to the pawprint. The Groundskeeper remembered its visitor and kept the mark.'),
    choice('AFTER-graveyard-listen', 'Ask, “What were they like?”', [
      say('The Groundskeeper of Names', 'Very interested in whatever page I needed next.'),
      'His cloth moves away from the pawprint.',
      say('The Groundskeeper of Names', 'This one always sat on my writing.'),
      'He leaves the familiar smudge on the record of going home.',
    ], 'You asked about the animal. The Groundskeeper shared a familiar habit and left its pawprint in the book.'),
    choice('AFTER-graveyard-watch', 'Sit with the quiet moment.', [
      'You stay quietly beside the open book. The Groundskeeper looks at the smudge again.',
      say('The Groundskeeper of Names', 'This one always sat on my writing.'),
      'He puts down the cloth.',
      say('The Groundskeeper of Names', 'That part can stay.'),
    ], 'You shared the quiet moment. The Groundskeeper remembered the animal and kept its pawprint.'),
  ]),

  'study-library': care('AFTER-study-library', 'A place for the replies', [
    'Unanswered return requests spill from a drawer. An empty outgoing tray waits on the desk.',
    'The Archivist opens a tiny drawer and hesitates.',
  ], 'The return requests need an answer. The outgoing tray is empty, and the Archivist is reconsidering where to put them.', [
    choice('AFTER-study-library-tray', 'Bring the outgoing tray within reach.', [
      'You slide the outgoing tray closer. The Archivist moves the requests into it.',
      'They write I WAS WRONG on the tiny drawer, look at the remaining pile, and open a cupboard instead.',
      say('The Archivist', 'Room to improve. Quite a lot of room.'),
      'The last requests need a second outgoing tray.',
    ], 'You brought the outgoing tray closer. The Archivist sent the requests onward and made a cupboard for corrections.'),
    choice('AFTER-study-library-order', 'Set the loose requests together on the desk.', [
      'You gather the loose pages into a readable stack. The Archivist checks each request before placing it in the outgoing tray.',
      say('The Archivist', 'A small drawer for my mistakes should—'),
      'They see how much of the stack remains and open a cupboard marked I WAS WRONG.',
      'The requests fill two outgoing trays.',
    ], 'You gathered the requests. The Archivist checked them, sent them onward, and made a cupboard for corrections.'),
    choice('AFTER-study-library-watch', 'Wait while the Archivist reads.', [
      'You give the Archivist time to read the unanswered requests.',
      'They write I WAS WRONG on the tiny drawer, then look at the pile.',
      say('The Archivist', 'A cupboard.'),
      'The requests move into the outgoing tray. It needs a second tray.',
    ], 'You waited while the Archivist read. The requests went to outgoing trays, and the corrections gained a cupboard.'),
  ]),

  'attic-observatory': care('AFTER-attic-observatory', 'One thing happening now', [
    'Warning threads slacken across the rafters. A loose telescope starts to roll along a tilted table.',
    'An empty stand waits beside the table. The Watcher’s eyes dart between the telescope and a hundred tangled forecasts.',
  ], 'A telescope is starting to roll while the Watcher watches too many possible dangers at once.', [
    choice('AFTER-attic-observatory-point', 'Point out the rolling telescope.', [
      'You point. One quick thread catches the telescope before it reaches the edge.',
      say('The Watcher in the Rafters', 'That one was happening.'),
      'It keeps that thread in place and loosens the other warnings. The way onward becomes visible.',
    ], 'You pointed out the real movement. The Watcher caught the telescope and cleared the other warning threads from the route.'),
    choice('AFTER-attic-observatory-place', 'Point to the empty telescope stand.', [
      'You show the Watcher the empty telescope stand beside you.',
      'A quick thread catches the rolling telescope and settles it into the stand.',
      say('The Watcher in the Rafters', 'A place to put it. Yes.'),
      'It loosens the other warnings, leaving room to see the way onward.',
    ], 'You showed the empty stand. The Watcher secured the telescope and cleared the warning threads from the route.'),
    choice('AFTER-attic-observatory-watch', 'Ask, “Could something nice happen?”', [
      'The Watcher catches the rolling telescope and settles it in the stand. Then it parts a knot of warning threads.',
      'In one silvery thread, a window opens. A sparrow takes a seed from the sill and flies back to a tree.',
      say('The Watcher in the Rafters', 'That might happen. I kept covering it with the broken-window one.'),
      'The forecast fades. The Watcher leaves that thread visible and clears the warnings from the way onward.',
    ], 'You asked about a pleasant possibility. After securing the telescope, the Watcher showed a sparrow taking a seed and flying away. It might happen; it was not a promise. The route is clear.'),
  ]),

  lampworks: care('AFTER-lampworks', 'A useful place to shine', [
    'A little lamp swings toward the dark threshold. The Lamplighter reaches after it.',
    'An empty hook waits beside the way onward.',
  ], 'A lamp is leaning toward the dark threshold, where an empty hook offers a place to shine.', [
    choice('AFTER-lampworks-hook', 'Point out the empty hook.', [
      'You point to the hook. The Lamplighter lifts the leaning lamp onto it.',
      'The beam reveals a small pawprint at the threshold.',
      say('The Lamplighter', 'Lighting the way. That is a position.'),
      'The smaller lamp leans toward the door too. The doorway light stays in place.',
    ], 'You showed the hook. The Lamplighter placed a lamp there to light the way onward.'),
    choice('AFTER-lampworks-shadow', 'Step out of the lamp’s beam.', [
      'You move clear of the beam. Its light reaches the threshold, and the lamp leans farther that way.',
      'The Lamplighter follows its aim and sets it on the waiting hook.',
      say('The Lamplighter', 'Oh. You were lighting something.'),
      'The little lamp keeps its useful place by the door.',
    ], 'You cleared the beam. The Lamplighter followed the lamp’s aim and gave it a place by the threshold.'),
    choice('AFTER-lampworks-watch', 'Watch where the lamp turns.', [
      'You wait. The lamp keeps swinging toward the dark way onward.',
      'The Lamplighter reaches after it, then lifts it onto the hook there.',
      'The beam finds a small pawprint. A smaller lamp leans after it.',
      say('The Lamplighter', 'One at a time. I see the position now.'),
    ], 'You watched the lamp’s direction. The Lamplighter set it by the threshold, where it stayed to light the way.'),
  ]),

  ballroom: care('AFTER-ballroom', 'One goodbye', [
    'A Party Phantom lowers its empty plate and reaches toward its coat.',
    'The Master raises a baton. A serving tray starts drifting after the guest.',
  ], 'A guest is ready to leave for another hall. The Master is preparing more music and food.', [
    choice('AFTER-ballroom-coat', 'Hold the coat where the guest can reach it.', [
      'You hold the coat within reach. The phantom takes it and waves once.',
      'The Master catches the following tray. Its baton dips before an encore can begin.',
      'The guest walks into another hall of the House. The Master answers with one small wave.',
    ], 'You offered the coat. The guest left for another hall, and the Master ended the music and service for that visit.'),
    choice('AFTER-ballroom-wave', 'Wave goodbye to the guest.', [
      'You give one goodbye wave. The phantom answers, takes its coat, and starts toward the next hall.',
      'The Master looks at its baton, then sets it down and waves too.',
      'It stops the serving tray from following. The guest leaves the Ballroom.',
    ], 'You waved goodbye. The Master joined the farewell and let the guest leave for another hall.'),
    choice('AFTER-ballroom-watch', 'Leave the guest a clear way out.', [
      'You leave space by the doorway. The phantom takes its coat and waves once.',
      'The Master catches the serving tray before it can follow.',
      say('The Master of Revels', 'A tiny farewell flourish?'),
      'It chooses one wave, puts down the baton, and lets the guest enter the next hall.',
    ], 'You kept the way clear. The Master stopped the encore and let the guest leave for another hall.'),
  ]),

  crypt: care('AFTER-crypt', 'Room for the curl', [
    'A curved spring bounces out of a straight groove between two display bones.',
    'The Curator reaches to stretch it. Its own ribs make a roomy arch above the curl.',
  ], 'The spring does not fit the straight display. The Curator is considering stretching it.', [
    choice('AFTER-crypt-arch', 'Point from the curl to the Curator’s arched ribs.', [
      'You point to the curl, then the arch. The Curator looks down at its own ribs.',
      say('The Bone Curator', 'Ah. Room at the ribs. Keep the bend.'),
      'It moves the display bones into an arch. The spring settles beneath them, still curled.',
    ], 'You showed the matching arch. The Curator changed the display so the spring could keep its curl.'),
    choice('AFTER-crypt-gap', 'Slide one loose display bone a little farther out.', [
      'You widen the gap. The spring curls comfortably into the extra room.',
      'The Curator moves the other display bone to make an arch above it.',
      say('The Bone Curator', 'More space. Fewer arguments with springs.'),
      'It leaves the spring curled in the new display.',
    ], 'You widened the gap. The Curator completed an arched display around the spring’s unchanged curl.'),
    choice('AFTER-crypt-watch', 'Watch how the spring settles.', [
      'You wait. The spring bounces beneath the Curator’s arched ribs and settles into its curl.',
      'The Curator looks from its ribs to the straight groove.',
      say('The Bone Curator', 'Ah. Keep the bend.'),
      'It makes the display into an arch, leaving room for the curled spring.',
    ], 'You watched. The Curator learned from its own ribs and changed the display to fit the spring.'),
  ]),

  'hedge-maze': care('AFTER-hedge-maze', 'Two useful things', [
    'A mushroom pokes through the Gardener’s glove. The glove cannot close around its fork.',
    'An empty pot and a broad fallen leaf rest on the bench.',
  ], 'A mushroom has grown through a useful glove. A pot and a patching leaf are nearby.', [
    choice('AFTER-hedge-maze-pot', 'Set the empty pot within reach.', [
      'You set the pot beside the glove. The Gardener eases the mushroom into its new home.',
      'It patches the glove with the fallen leaf and gives the mushroom a little water.',
      say('The Gardener of Rot', 'One pot. One glove. Two successes.'),
    ], 'You offered the pot. The Gardener replanted the mushroom, repaired the glove and cared for both.'),
    choice('AFTER-hedge-maze-leaf', 'Offer the broad leaf as a patch.', [
      'You offer the leaf. The Gardener holds it against the hole, considering.',
      'It moves the mushroom into the pot, patches the glove, and tries the fork again.',
      say('The Gardener of Rot', 'This one stays a glove.'),
      'It waters the mushroom in its pot.',
    ], 'You offered a patch. The Gardener kept the useful glove and gave the mushroom a watered pot.'),
    choice('AFTER-hedge-maze-watch', 'Give the Gardener working room.', [
      'You leave the bench clear. The Gardener tries the fork once more, then looks at the empty pot.',
      'It replants the mushroom and patches the glove with the leaf.',
      say('The Gardener of Rot', 'This one stays a glove.'),
      'It waters the mushroom. Both things have a place.',
    ], 'You gave the Gardener room. It repaired the glove and replanted and watered the mushroom.'),
  ]),

  'secret-passages': care('AFTER-secret-passages', 'Just one listener', [
    'A resident taps a speaking tube. The taps clatter from every tube in the wall. The resident covers its ears.',
    'A route switch sits above the resident’s reach.',
  ], 'A resident’s call is being sent everywhere. The switch that selects a destination is too high.', [
    choice('AFTER-secret-passages-switch', 'Point out the unreachable switch.', [
      'You point to the switch. The Warden lowers it within the resident’s reach.',
      'The resident aims it toward the quiet nook and taps again. Only the nook answers: three soft taps.',
      say('The Whisper Warden', 'I could repeat that for—oh. You heard.'),
      'The switch stays within reach. The other tubes remain quiet.',
    ], 'You showed the unreachable switch. The resident can now choose a destination, and its call goes only there.'),
    choice('AFTER-secret-passages-listen', 'Ask the Warden to listen without repeating.', [
      'You ask the Warden to listen. In the pause, it notices the resident reaching toward the route switch.',
      'It lowers the switch. The resident selects the quiet nook and taps three times.',
      'Three soft taps answer from that nook alone. The Warden keeps its echo to itself.',
    ], 'You asked for a quiet listener. The Warden lowered the switch, and the resident chose the only destination for its call.'),
    choice('AFTER-secret-passages-watch', 'Wait quietly for the resident.', [
      'You stay quiet. The resident points at the high switch, then reaches again.',
      'The Warden lowers it. The resident chooses the quiet nook and taps.',
      'Only that nook answers. The Warden starts to echo, catches itself, and waits.',
    ], 'You waited for the resident. It gained control of the route switch, and its call reached only the chosen nook.'),
  ]),

  bathhouse: care('AFTER-bathhouse', 'Beside the towel', [
    'A little Puddle Spirit rests near a dry nook. The Matron holds a warm towel just above it.',
    'The spirit edges sideways, toward the space beside the towel.',
  ], 'The Puddle Spirit is making space beside the offered towel. The Matron has not put it down yet.', [
    choice('AFTER-bathhouse-space', 'Point to the empty space beside the spirit.', [
      'You point to the space. The Matron sets the towel there, within reach.',
      'The spirit rests beside it and stays there.',
      say('The Drowned Matron', 'Beside is also an option.'),
      'Her hand moves away. The towel stays available.',
    ], 'You showed the empty space. The spirit chose to rest beside the towel, and the Matron left it undisturbed.'),
    choice('AFTER-bathhouse-offer', 'Ask, “Could we leave it within reach?”', [
      'The Matron lowers the towel into the nook instead of onto the spirit.',
      'The spirit settles beside the towel, close enough to reach it.',
      say('The Drowned Matron', 'Beside. Yes. I can leave beside alone.'),
      'She draws her hand back.',
    ], 'You asked for an offer within reach. The Matron left the towel beside the spirit and let it rest there.'),
    choice('AFTER-bathhouse-watch', 'Give the spirit a little space.', [
      'You wait clear of the nook. The spirit edges beside the Matron’s hovering towel again.',
      'She notices and puts the towel down in the space it left.',
      say('The Drowned Matron', 'Beside is also an option.'),
      'She keeps her hand out of the spirit’s way.',
    ], 'You gave the spirit space. The Matron put the towel within reach and let the spirit rest beside it.'),
  ]),

  kennels: care('AFTER-kennels', 'An empty bed', [
    'A ward animal noses toward the next hall. Its clean bed is behind it; its water bowl is in the doorway.',
    'The Kennelmaster holds a folded blanket and looks between the animal and the empty bed.',
  ], 'A ward animal wants to reach the next hall. Its bowl blocks the threshold, while its clean bed waits behind it.', [
    choice('AFTER-kennels-bowl', 'Slide the bowl clear of the threshold.', [
      'You slide the bowl beside the wall. The animal sniffs the clear threshold, then steps into the next hall.',
      'The Kennelmaster follows for one step. Then it stops beside the doorway.',
      'It sets the blanket on the bed. The water stays where a passing nose can reach it.',
    ], 'You moved the bowl out of the doorway. The animal entered the next hall, and the Kennelmaster stopped following. Its bed and water remain available.'),
    choice('AFTER-kennels-bed', 'Ask, “What if it comes back?”', [
      'The Kennelmaster unfolds the blanket on the empty bed, turning the soft side up.',
      say('The Kennelmaster', 'Then this will be here.'),
      'It moves the bowl off the threshold and fills it with fresh water. The animal steps into the next hall.',
      'The Kennelmaster checks the bed once more, then leaves it empty and ready.',
    ], 'You asked what would happen if the animal came back. The Kennelmaster prepared its bed and fresh water, then cleared the threshold so it could leave. Returning is an offer, not a requirement.'),
    choice('AFTER-kennels-watch', 'Ask, “Can we leave the bowl within reach?”', [
      'The Kennelmaster sets the bowl beside the doorway instead of in it.',
      'The animal drinks, lifts its wet nose, and steps into the next hall. Three drops mark the way.',
      say('The Kennelmaster', 'I can wipe those up later.'),
      'It leaves the bowl within reach and the clean bed ready behind it.',
    ], 'You asked to keep the water within reach. The animal drank before leaving for the next hall. Its bowl and bed remain available without blocking the way.'),
  ]),

  'pumpkin-grounds': care('AFTER-pumpkin-grounds', 'The pond is ready', [
    'The King kneels by a marker marked HARVEST DATE. A frog turns toward the pond.',
    'The King dips its brush, trying to decide what to write about the frog.',
  ], 'The frog is heading toward the pond while the King tries to fit it into a harvest plan.', [
    choice('AFTER-pumpkin-grounds-direction', 'Point the loose marker toward the pond.', [
      'You turn the loose marker toward the water. The King looks along it.',
      'It crosses out HARVEST DATE and writes POND THIS WAY.',
      'The frog slips into the pond before the paint is dry.',
      say('The Harvest King', 'An early success.'),
    ], 'You pointed toward the pond. The King replaced the harvest plan with a direction; the frog reached the water on its own.'),
    choice('AFTER-pumpkin-grounds-tell', 'Tell the King where the frog is going.', [
      'You tell the King the frog is heading for the pond. It looks up just as the frog reaches the water.',
      say('The Harvest King', 'Already? I had not finished the—'),
      'It crosses out HARVEST DATE and writes POND THIS WAY, pointing the marker toward the pond.',
      'The frog is comfortably ahead of the sign.',
    ], 'You drew attention to the frog’s route. The King replaced its harvest plan with a pond sign after the frog arrived.'),
    choice('AFTER-pumpkin-grounds-watch', 'Let the frog go at its own pace.', [
      'You wait. The frog slips into the pond while the King studies its brush.',
      say('The Harvest King', 'Frog? Pumpkin-frog? I cannot finish the label.'),
      'It crosses out HARVEST DATE and writes POND THIS WAY.',
      say('The Harvest King', 'An early success.'),
    ], 'You let the frog continue. The King replaced its harvest plan with a direction to the pond.'),
  ]),

  heart: care('AFTER-heart', 'Room at the threshold', [
    'The Keeper’s hands hover near the locks. A loose fold of curtain lies across the way onward.',
    'No animal is being moved toward the passage. The House waits.',
  ], 'The Keeper is hesitating at the locks. The way onward is still closed, and everyone has room to wait.', [
    choice('AFTER-heart-clear', 'Move the loose curtain away from the threshold.', [
      'You draw the loose fold aside, leaving a clear space at the threshold.',
      'The Keeper lowers its hands. The locks relax, and the way onward opens.',
      say('The Keeper', 'I must let them answer.'),
      'Nothing is pushed through the opening.',
    ], 'You cleared the threshold. The Keeper stopped holding the locks, and the passage opened without moving anyone through it.'),
    choice('AFTER-heart-wait', 'Tell the Keeper, “We can wait here.”', [
      'You offer to wait. The Keeper looks at the space before the door.',
      'Its hands lower. The locks relax, and the passage opens.',
      say('The Keeper', 'I must let them answer.'),
      'Nobody is hurried through the opening.',
    ], 'You offered to wait. The Keeper opened the passage and left everyone room to decide what comes next.'),
    choice('AFTER-heart-room', 'Step back and leave the threshold clear.', [
      'You leave space before the door. The Keeper lowers its hands from the locks.',
      'The House grows quiet. A way onward opens without pulling anyone through.',
      say('The Keeper', 'I must let them answer.'),
    ], 'You left space at the threshold. The Keeper stopped holding the passage shut, without pushing anyone through.'),
  ]),
});

export default AFTERCARE;
