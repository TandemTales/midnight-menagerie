// Authored playable edition. No biography is inferred from a supernatural shape.
export const PET_STORIES = {
  maya: { pet: 'Orbit', trace: ['Three scratches. A pause. Three more.', 'The marks stop beside a little door with a cat-sized handle.'], closer: ['A black hair catches on the handle. Below it: a white one.'], reunion: ['Orbit comes out with a white chest full of lint. Maya holds still. Orbit bumps a crutch, then presses against her leg.', {speaker:'maya',text:'There you are. I saved your window.'}], home: ['Orbit steps outside, checks both sides of the doorway, and comes back for Maya.', {speaker:'maya',text:'Right. Together.'}] },
  mateo: { pet:'Pepper', trace:['A green feather turns slowly under a ceiling fan that is not moving.','From the vent: a bright, familiar whistle.'], closer:['A beak has tested the edge of the vent. Several times.'], reunion:['Pepper lands on Mateo’s shoulder and immediately investigates an ear.',{speaker:'mateo',text:'I have about a thousand questions. You can start with that one.'}], home:['Pepper flies through the open door, circles back, and settles on Mateo.',{speaker:'mateo',text:'You checked the way? Okay. Your turn to lead.'}] },
  amina: {pet:'Mochi',trace:['Two quick thumps. One slow thump.','A cream tuft clings to a tunnel lined with very clean towels.'],closer:['The tunnel has a latch. It is on the outside.'],reunion:['Mochi waits under the lowest shelf. Amina sits nearby. A gray nose appears, followed by the rest of the rabbit.',{speaker:'amina',text:'I’m here. Take your time.'}],home:['The doorway stays open. Mochi noses the threshold, retreats once, then hops onto the path beside Amina.',{speaker:'amina',text:'There. At your speed.'}]},
  eli:{pet:'Sprocket',trace:['A shiny screw sits on a folded napkin.','The next screw is missing. So is the next.'],closer:['A tiny paw print leads away from a thoroughly tested latch.'],reunion:['Sprocket sniffs Eli’s finger, puts a paw on it, then tests a sleeve with tiny teeth.',{speaker:'eli',text:'Sniff. Paw. Bite. Inspection passed.'}],home:['Sprocket retrieves one last screw and climbs into Eli’s open carrying pouch.',{speaker:'eli',text:'That is probably structural. We’ll ask on our next visit.'}]},
  priya:{pet:'Pixel',trace:['A warm stone sits at a very exact angle.','Someone has dragged the bedding away from the perfectly straight replacement.'],closer:['Tiny toe-prints cross the warm corner. The trail continues through a gap behind the bedding.'],reunion:['Pixel watches from the crooked stone. Priya sets the familiar carrier beside it and waits.',{speaker:'priya',text:'I packed the wrong stone. You noticed.'}],home:['Pixel steps into the carrier. Priya adds the crooked stone without straightening it.',{speaker:'priya',text:'Revised packing list: this stone. Exactly this stone.'}]},
  jordan:{pet:'Scout',trace:['One bark. Two huffs.','A red thread is snagged beneath a row of freshly polished bowls.'],closer:['The little gate has tooth marks beside the latch. The bowls are untouched.'],reunion:['Scout’s crooked tail knocks a bowl into another bowl. The entire row rings. Jordan kneels; Scout arrives at full wiggle.',{speaker:'jordan',text:'I kept thinking I should’ve— Hi. Hi, Scout.'}],home:['Scout pauses on the path until Jordan catches up. This time Jordan follows the pause.',{speaker:'jordan',text:'I’m coming. We’ve got time.'}]},
  lena:{pet:'Mooncake',trace:['A button, a seed, and a scrap of shiny paper sit in three separate piles.','The enormous empty cushion beside them has not been used.'],closer:['A tiny tunnel leads beneath the piles. The collections have a back entrance.'],reunion:['Mooncake emerges with both cheeks full. Lena opens a pocket of soft cloth.',{speaker:'lena',text:'You brought the museum.'},'Mooncake makes one more trip.'],home:['Mooncake tucks the last treasure into the cloth pocket and climbs in after it.',{speaker:'lena',text:'Museum closed. Traveling exhibition.'}]},
  samir:{pet:'Bean',trace:['“Wheek! Wheek!”','A vegetable cart rolls toward the sound. The squeaks keep coming from a narrow grille behind it.'],closer:['The grille covers a speaking tube. Beside it, red thread clings to a low carrying pocket.'],reunion:[{speaker:'samir',text:'Bean Bean.'},'Bean answers before Samir finishes the second Bean. Samir laughs, then has to try the words again.',{speaker:'samir',text:'I missed talking to you.'}],home:['Bean walks into the open carrier, turns around, and waits for Samir’s hand.',{speaker:'samir',text:'Our ride is leaving. Very slowly. With several snack stops.'}]},
};

// New authored collection mechanism, not an inherited founder/ghost history.
// These present-tense observations pay off the selected Kid's opening evidence.
export const PET_DISCOVERIES = {
 maya:{id:'PET-maya-route',title:'The collar-sized gap',lines:[
   'A tiny passage runs through the wall. A black hair and a snag of collar-thread cling to its edge.',
   'Beyond it, three scratches. A pause. Three more. The collar’s broken fastening fits the snag.',
   {speaker:'maya',text:'You found a door I couldn’t see.'}],recap:'Orbit used a small House passage. The collar caught at its edge; Orbit is on the other side.'},
 mateo:{id:'PET-mateo-route',title:'Who said it first?',lines:[
   'A little brass mouth beside the animal door chirps, “Open the little door.” Pepper answers in exactly that voice.',
   'The wall opens beside the brass mouth. Pepper flutters toward it, then stops at the latch on the far side.',
   {speaker:'mateo',text:'That’s who you copied. I couldn’t find you because I was looking for a person.'}],recap:'Pepper copied a House speaking tube. Its little doorway brought Pepper inside, but its far latch prevented leaving.'},
 amina:{id:'PET-amina-route',title:'The moss doorway',lines:[
   'A moss-lined opening unfolds through a solid wall. Beyond it is the underside of Mochi’s little shelter.',
   'A cream tuft catches on the same gray-green moss Amina found at home.',
   {speaker:'amina',text:'The pen stayed shut. This was the other way.'}],recap:'The House opened a moss-lined passage beneath Mochi’s shelter, bypassing the closed pen.'},
 eli:{id:'PET-eli-route',title:'The screw trail',lines:[
   'Behind the vent, a row of tiny footprints passes a line of screws. One bears Sprocket’s tooth marks.',
   'The passage ends at a polished latch. Its handle is outside, well beyond a rat’s reach.',
   {speaker:'eli',text:'You worked out how to get in. They didn’t give you the parts for getting out.'}],recap:'Sprocket explored the vent route into the House. The return handle was unreachable from inside.'},
 priya:{id:'PET-priya-route',title:'The warm patch',lines:[
   'A warm moss pad opens like a little door. Through it, Priya can see the bottom of Pixel’s empty enclosure.',
   'The House has moved Pixel’s crooked stone into a warm nook beside the passage.',
   {speaker:'priya',text:'It took the right stone. I packed a substitute.'}],recap:'The House made a moss passage into Pixel’s enclosure and brought the familiar stone along. Its care did not include a way back.'},
 jordan:{id:'PET-jordan-route',title:'The call at the fence',lines:[
   'A speaking tube carries a small animal’s worried call. Scout answers: one bark, two huffs.',
   'The tube reaches the garden fence. Beside it is a narrow passage with a red collar-thread caught on the edge.',
   {speaker:'jordan',text:'You heard someone. You went to help.'}],recap:'Scout followed a real animal call carried to the fence by a House tube, then entered its passage.'},
 lena:{id:'PET-lena-route',title:'The missing silver leaf',lines:[
   'Lena holds the wallpaper scrap beside a tiny opening. Its torn silver leaf fits the missing piece exactly.',
   'Inside the opening: a trail of seeds, a small box, and room for a determined hamster.',
   {speaker:'lena',text:'You didn’t escape the cage. You found another room.'}],recap:'Mooncake carried the collection through a House passage behind the cage. The torn silver wallpaper marks that route.'},
 samir:{id:'PET-samir-route',title:'The red coat',lines:[
   'An empty red coat hangs beside a low carrying pocket. Samir’s thread fits the tear in its cuff. Bean’s fur is still caught there.',
   'The coat lifts the pocket. The wall opens beneath its sleeve. There is nobody inside the coat.',
   {speaker:'samir',text:'My cousin saw a person. It was the coat.'}],recap:'An animated red coat carried Bean through a House passage. The matching torn cuff explains the cousin’s sighting.'},
};

export const OPEN_PET_DISCOVERIES = {
 maya:{id:'PET-maya-route-open',title:'The collar-sized gap',lines:['Maya finds the tiny wall passage beside Orbit’s room. Its edge holds a black hair and a snag of collar-thread.','The broken fastening fits the snag. The passage is open now, with a soft cover over the rough edge.'],recap:'Orbit used a small House passage; the collar caught at its edge. That passage is open and its rough edge covered now.'},
 mateo:{id:'PET-mateo-route-open',title:'Who said it first?',lines:['A little brass mouth says, “Open the little door.” Pepper answers in exactly that voice.','The doorway opens. Its far latch is tied up. Pepper flies through, then turns back toward Mateo.'],recap:'Pepper copied a House speaking tube and followed its little doorway. The return latch is now open.'},
 amina:{id:'PET-amina-route-open',title:'The moss doorway',lines:['A moss-lined opening unfolds beside Mochi’s room. Amina recognizes the underside of Mochi’s shelter beyond it.','A cream tuft catches on the same moss Amina found at home. Both ends are open now.'],recap:'A moss passage bypassed Mochi’s closed pen. Both ends of the passage are open now.'},
 eli:{id:'PET-eli-route-open',title:'The screw trail',lines:['Tiny footprints follow a line of screws through a vent. One screw has Sprocket’s tooth marks.','At the far end, the old outside latch has been lifted clear of the opening. Sprocket can pass either way.'],recap:'Sprocket explored a vent route into the House. Its old return latch no longer blocks the way.'},
 priya:{id:'PET-priya-route-open',title:'The warm patch',lines:['A moss pad opens beside Pixel’s nook. Through it, Priya sees the bottom of the familiar enclosure.','The House brought the crooked stone along. Priya’s warm substitute is still in the bag.'],recap:'The House made a moss doorway into Pixel’s enclosure and brought the familiar stone along. The doorway is now open.'},
 jordan:{id:'PET-jordan-route-open',title:'The call at the fence',lines:['A speaking tube carries a little animal’s call to the garden fence. Scout answers: one bark, two huffs.','Beside it, red collar-thread marks the passage Scout followed. The passage stands open in both directions.'],recap:'Scout followed an animal call carried by a House tube. The passage at the fence is open both ways now.'},
 lena:{id:'PET-lena-route-open',title:'The missing silver leaf',lines:['Lena fits the wallpaper scrap beside an open wall passage. The torn silver leaf is complete again.','Inside: a trail of seeds, Mooncake’s little box, and a route to the cage that stayed closed.'],recap:'Mooncake moved the collection through a House passage behind the closed cage. The matching wallpaper marks that route.'},
 samir:{id:'PET-samir-route-open',title:'The red coat',lines:['An empty red coat hangs by Bean’s room. Samir’s thread fits its torn cuff; Bean’s fur is still caught there.','The coat lifts a carrying pocket and opens a wall passage beneath its sleeve. It waits instead of going through.'],recap:'An animated red coat carried Bean through a House passage. Its torn cuff explains the cousin’s sighting; now it waits.'},
};

// A: meeting; B: safe-room relationship; C: sanctuary visit. Captions, not human speech.
export const COMPANION_STORIES = {
 marmalade:[['Marmalade walks through the open latch, then comes back through it. She rubs one cheek against the frame. Hers, apparently.'],['Marmalade starts washing a paw. A creak interrupts her. She waits. The House waits. She finishes the paw.'],['Marmalade sleeps across the open doorway. Everyone carefully steps around her. The door remains open.']],
 wisp:[['Wisp lights the latch from underneath. It looks much less important that way.'],['Wisp tries to light the inside of a closed lunchbox. A thin blue line leaks out around the sandwich.'],['Wisp drifts outside, becomes one small light among many, then returns to light the step.']],
 crumbula:[['Count Crumbula spreads a magnificent cape. One corner is under a bowl. The second attempt is magnificent.'],['Crumbula offers a crumb on an enormous saucer. He waits until you take it before touching his own.'],['Crumbula discovers that the breeze makes his cape billow. He takes the long way to every door.']],
 boggle:[['Two eyes peer beneath the bed. A small hand pushes your dropped torch back into reach.'],['Boggle tries a cushion over his head. Too bright. Two cushions. He gives a satisfied little wiggle.'],['Boggle chooses a bench with good shade underneath. Visitors leave the space below it clear.']],
 bones:[['Bones trots out, doubles back, and retrieves the latch. A wonderful new fetching object.'],['Bones drops a stick. Then another. Then he looks at your single throwing arm, considering the problem.'],['Bones brings his stick out to the path. He can visit the crypt again. The stick comes everywhere.']],
 pipkin:[['Pipkin hops past the grand cushion and settles in a shallow dish of water.'],['A seed sticks to Pipkin’s nose. Pipkin eyes it. It eyes Pipkin. One enormous frog blink settles nothing.'],['Pipkin sits half in the garden, half in the sun. The decorative pedestal remains empty.']],
 taffy:[['Taffy pours through the opening, remembers one sticky corner, and peels it off with a pop.'],['Taffy stretches toward a spoon. The spoon sticks. A second spoon is sent to help.'],['Taffy leaves a little gap around a new visitor instead of wrapping them in a hug. The visitor steps closer.']],
 truffle:[['Truffle uncurls, sniffs the open air, and takes one extremely purposeful step.'],['Truffle arranges three leaves. You offer a fourth. After consideration, it becomes the roof.'],['Truffle chooses the leaf heap. A hand-painted marker beside it asks feet to go around.']],
 hush:[['Hush slips out. A long shadow gets briefly caught on the corner, then catches up in a hurry.'],['Hush hides a button in your shadow. You move your hand; Hush retrieves it from the new hiding place.'],['Hush takes the shaded path outside. This time, the shadow keeps up.']],
 mopsy:[['Mopsy catches a loose stitch on the gate, carefully frees it, and keeps the thread.'],['You set a cushion beside Mopsy. Mopsy turns it over to the lumpy side and settles there.'],['Mopsy chooses a window seat. A sewing basket rests within reach, closed until wanted.']],
 drizzle:[['Drizzle floats out beneath a little rainbow. A hopeful bucket follows. Drizzle turns left. The bucket overshoots.'],['Drizzle makes one soft raindrop land in a cup. Then another. The rhythm is almost a song.'],['Drizzle watches a real cloud pass. For a moment the two clouds share one shadow.']],
 pudding:[['Pudding sits just outside the gate. The tail starts slowly, then becomes a whole-body event.'],['Pudding falls asleep against the blanket pile. A small snore makes the top blanket tremble.'],['Pudding settles beside a visitor who has chosen to sit quietly. Neither asks the other to get up.']],
 wink:[['Wink inspects the open latch from three angles. Then a fourth, upside down.'],['Wink weaves a tiny hammock. You lean closer. Wink adds a curtain.'],['Wink hangs the hammock beside the entrance, with the curtain cord on the inside.']],
 crinkle:[['Crinkle unfolds one wing, then the other. A tiny paper scrap drifts down like a very small standing ovation.'],['Crinkle folds a boat. You put it on the blanket. Crinkle waits for you to notice the missing water.'],['Crinkle folds directions into a bird. It points both toward the House and away from it.']],
 mossbit:[['Mossbit steps over the sill. The moss on the shell brushes the latch with a soft shh.'],['Mossbit studies a crumb. Then eats it. This took exactly as long as Mossbit required.'],['Mossbit rests halfway down the garden path. There is plenty of path left for everyone else.']],
 brambleboo:[['Brambleboo lifts one root, then another. A flowerpot attempts to follow and is gently set down.'],['Brambleboo turns a leaf toward the torch. You move the torch closer. The leaf turns away. Back a little, then.'],['Brambleboo chooses a sunny patch outside, keeping one long root curled by the open door.']],
};

export const GATE_ENDING = {
 id:'END-GATE', title:'Both ways',
 lines:[
  {speaker:'The Keeper',text:'If I leave it open… something could happen.'},
  'Outside, wind bends the grass. Inside, the little beds are warm. A water bowl waits beside the gate.',
  {speaker:'The Keeper',text:'I can keep the beds. I can keep the light on.'},
 ], recap:'The Keeper is ready to open the gate. The warm beds and water will remain for visitors.',
 choices:[
  {id:'END-GATE-hold',label:'Hold the gate steady.',lines:[
    'The Keeper lifts the latch. You hold the gate while a small animal goes out. Another stays on a cushion.',
    'You let go. The first animal returns, pushes the gate open from outside, and drinks. The latch stays up.',
    {speaker:'The Keeper',text:'No more reaching into other homes. This one will be here if they want it.'}],recap:'You steadied the gate. One animal stayed; another left and opened it from outside to return. The Keeper will welcome visitors, not collect them.'},
  {id:'END-GATE-water',label:'Set the bowl beside the path.',lines:[
    'You move the bowl clear of the doorway. The Keeper lifts the latch, and a small animal goes outside.',
    'Another stays curled on a cushion. The first returns, pushes the gate open from outside, and finds the bowl.',
    {speaker:'The Keeper',text:'No more reaching into other homes. There can be water without a lock.'}],recap:'You moved the water bowl. One animal stayed; another left and opened the gate from outside to return. The Keeper will offer care without collecting animals.'},
  {id:'END-GATE-space',label:'Leave room for the animals.',lines:[
    'You step aside. The Keeper lifts the latch. One animal goes out; another stays on a cushion.',
    'The first returns and pushes the gate open from outside. It drinks, then settles where it chooses.',
    {speaker:'The Keeper',text:'No more reaching into other homes. I can wait here.'}],recap:'You left room. One animal stayed; another left and opened the gate from outside to return. The Keeper will wait for visitors.'},
 ],
};

export const PAIR_STORIES = [
 {kids:['maya','mateo'], title:'The question pocket', scenes:[
  [{speaker:'mateo',text:'If the House is alive, are the windows its eyes? What are the chimneys?'},{speaker:'maya',text:'One question pocket. Put them in there. We need the door first.'},{speaker:'mateo',text:'Can the pocket be enormous?'},{speaker:'maya',text:'Obviously.'}],
  [{speaker:'maya',text:'Window question. I’ve been thinking about it.'},{speaker:'mateo',text:'You kept it?'},{speaker:'maya',text:'I said pocket. Not bin.'}]]},
 {kids:['amina','jordan'], title:'A place beside you', scenes:[
  [{speaker:'jordan',text:'I should’ve watched the gate. I should’ve checked—'},{speaker:'amina',text:'Jordan. Sit here.'},'Amina makes room on the blanket. Jordan sits. Neither fills the quiet immediately.'],
  ['Jordan starts to pull a blanket around Amina, then pauses.',{speaker:'jordan',text:'Want this?'},{speaker:'amina',text:'One corner. You keep the rest.'}]]},
 {kids:['eli','priya'], title:'The spare part', scenes:[
  [{speaker:'eli',text:'If I put this here, the hinge could go both ways.'},{speaker:'priya',text:'That is the only clip holding our map.'},'Eli looks at the clip. Priya holds the map down with a cup.',{speaker:'priya',text:'Now show me.'}],
  ['The hinge works. The map attempts to roll itself into the cup.',{speaker:'eli',text:'Version two needs a second clip.'},{speaker:'priya',text:'Already on the list.'}]]},
 {kids:['lena','samir'], title:'Museum hours', scenes:[
  ['Lena arranges three odd buttons on the blanket.',{speaker:'samir',text:'Welcome, visitors, to the—'},{speaker:'lena',text:'Quiet museum.'},'Samir mouths an extravagant opening speech. Lena places a fourth button in the front row.'],
  [{speaker:'samir',text:'May I announce the new exhibit?'},{speaker:'lena',text:'Whisper.'},{speaker:'samir',text:'A crumb. Artist unknown.'},{speaker:'lena',text:'Artist is you.'}]]},
 {kids:['maya','lena'], title:'The other sound', scenes:[
  ['Maya holds the torch steady while Lena listens to the wall.',{speaker:'maya',text:'Got anything?'},'Lena holds up one finger. Maya waits.',{speaker:'lena',text:'Two sounds. One behind the other.'}],
  ['The wall creaks. Maya waits without asking. Lena points to the loose hinge above them.',{speaker:'lena',text:'This one just needs oil.'},{speaker:'maya',text:'Excellent. A mystery with a shopping list.'}]]},
 {kids:['mateo','eli'], title:'An important test', scenes:[
  [{speaker:'mateo',text:'Can a haunted door be ticklish?'},{speaker:'eli',text:'We need a feather and a door that agrees.'},{speaker:'mateo',text:'Scientific equipment.'},'Eli adds a pencil to the little pile.'],
  ['The door gives one tiny creak when the feather brushes its handle.',{speaker:'mateo',text:'Ticklish?'},{speaker:'eli',text:'Loose screw. We need a second test.'},{speaker:'mateo',text:'Science takes ages.'}]]},
 {kids:['amina','samir'], title:'The quiet entrance', scenes:[
  ['Samir prepares a grand introduction. Amina points toward a sleeping resident.',{speaker:'samir',text:'I can do a quiet entrance.'},'Samir bows. The backpack squeaks.',{speaker:'amina',text:'Tell your backpack.'}],
  ['Samir sets the backpack down before bowing. The sleeping resident does not stir. Amina gives a small, silent round of applause.'] ]},
 {kids:['priya','jordan'], title:'Wait for the plan', scenes:[
  [{speaker:'priya',text:'First, we look at the latch.'},{speaker:'jordan',text:'Then I open it?'},{speaker:'priya',text:'Then we finish the sentence.'},'Jordan puts both hands in the jacket pockets.'],
  ['Jordan spots the dangling latch and stops.',{speaker:'priya',text:'You saw it.'},{speaker:'jordan',text:'I’m leaving room for the rest of your sentence.'},{speaker:'priya',text:'This time, open it.'}]]},
];

export const SERVICE_STORIES = {
 shop:{id:'SERVICE-MOTH',title:'Mr. Moth’s counter',lines:['Mr. Moth puts a tiny lamp beside a large lamp. He admires both.',{speaker:'Mr. Moth',text:'Please browse. The lamps are also browsing.'}],recap:'Mr. Moth offers supplies for Buttons. Check the price before buying.'},
 rest:{id:'SERVICE-REST',title:'The blanket fort',lines:['A cushion slides toward the doorway to keep watch. It is facing the wrong way. You turn it around. It settles proudly.'],recap:'The fort is a safe place to rest. Its choices show their effects before you choose.'},
};

// Solo players can hear their Kid develop too. B follows a resolved guardian;
// neither scene claims an optional clue or a pet reunion happened.
export const KID_CHECK_INS = {
 maya:[
  ['Maya opens a folded route list. On the back is a drawing of Orbit taking up an entire windowsill.',{speaker:'maya',text:'I measured that window. There is technically room for a plant.'},'Maya folds the drawing outward this time.'],
  [{speaker:'maya',text:'I keep writing FIND ORBIT at the top. As if I might forget.'},'Maya draws a small box beside the words, then leaves the pencil there.']],
 mateo:[
  [{speaker:'mateo',text:'Pepper learned my whistle. Then changed the ending. I practiced the changed one. Then Pepper changed it again.'},'Mateo tries a little whistle and stops at the last note.'],
  ['Mateo whistles a new ending.',{speaker:'mateo',text:'I’m saving that one. When we find Pepper, I want to hear what happens to it.'}]],
 amina:[
  ['Amina shakes a blanket flat, then ruffles one corner again.',{speaker:'amina',text:'Mochi would spend ages arranging that. Then sit on the floor beside it.'}],
  ['Amina pulls the loose corner over cold knees. It stays beautifully untidy.',{speaker:'amina',text:'Mochi can fix it later.'}]],
 eli:[
  ['Eli turns a small screw over twice.',{speaker:'eli',text:'I used to put shiny things up high. Sprocket got very good at climbing.'},'The screw goes in an easy-to-reach pocket.'],
  [{speaker:'eli',text:'I can make a latch work. Getting someone to want an open latch… that part doesn’t have a screwdriver.'},'Eli puts the tool down for a minute.']],
 priya:[
  ['Priya checks a packing list. WARM STONE is underlined.',{speaker:'priya',text:'I tested the temperature. I did not test whether Pixel likes it. Hard to do without Pixel.'}],
  ['Priya leaves a blank line at the end of the plan.',{speaker:'priya',text:'For whatever Pixel has to say.'}]],
 jordan:[
  ['Jordan makes room for a dog who is not beside the blanket yet. The space stays there.',{speaker:'jordan',text:'Scout always circles three times. Sometimes four. I never ask what went wrong on the third.'}],
  ['Jordan circles the cushion once before sitting, then catches the joke halfway through.',{speaker:'jordan',text:'Okay. It is a good way to check a seat.'}]],
 lena:[
  ['Lena finds a shiny scrap in a pocket and sets it beside a button.',{speaker:'lena',text:'Mooncake’s museum has a very strict rule.'},'A pause.',{speaker:'lena',text:'Everything is interesting.'}],
  ['Lena puts a plain pebble beside the shiny scrap.',{speaker:'lena',text:'This one felt nice. That counts.'}]],
 samir:[
  [{speaker:'samir',text:'I was planning a speech for Bean. A proper welcome-home speech.'},'Samir considers it.',{speaker:'samir',text:'Bean will interrupt at the vegetable part.'}],
  ['Samir folds the speech very small.',{speaker:'samir',text:'I can start with hello. That’s a good bit.'}]],
};
