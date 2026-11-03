# Midnight Menagerie level scripts for regions 09 to 17

Authoring status: complete first draft for the nine current regions listed here; new writing and proposed narrative support, not implemented game content. Current region numbers are catalogue numbers, not the order of a particular expedition. This package is for play, including solo play with any Kid and available Companion.

## Source and implementation boundaries

Read against `docs/design/regions/09-lampworks.md` through `17-heart.md`; the corresponding nine files in `game/src/data/bosses/`; `game/src/state/mapgen.js` room names and REGIONS; `game/src/state/run.js` route, reward and rescue paths; `game/src/core/save.js`; and `game/src/scenes/event.js`. The code supports a default six-wing expedition, selected routes, a final Heart, combat events through `c.say`, region boss clears, rewards, and persistent Companion rescues. It does not establish these authored clues, scene history, persistent pet reunions or sanctuary state. `engine.say` emits `EV.LOG`, but this audit found no `EV.LOG` or `case 'log'` consumer in the scene. A trigger is not proof of visible battle dialogue; the new barks require a renderer.

The Greenhouse boss elsewhere in the game is the Carnivorous Conservatory. The Gardener of Rot remains the Hedge Maze boss. Do not turn references to an older Head Gardener boss into an additional main boss. The Kennels design associates Pudding with that region, but the current map associates Mossbit. Moreover, `heldIn` and `rescueTargetFor` can substitute a different missing Companion. No script here declares a specific animal freed merely because a regional boss fell.

### Binding contract for every unit below

Every heading with an ID is one narrative unit. Its explicitly listed fields override these complete defaults:

- **Canon:** established location and boss identity; exact dialogue, props, observations and local outcome are new proposals. No human ghost biography or historic tragedy is asserted. Where a developed source idea is dramatized, it is identified.
- **Speaker and presence:** narration is on-screen descriptive text, never an unseen child. A named Kid speaks only if that Kid is an active party member. The following `Otherwise` line is the exact replacement. A named Companion reaction runs only when that Companion is present; otherwise omit it without replacing the animal. Pets and Companions do not speak human dialogue.
- **Input and choices:** `Continue` advances a text page; `Skip scene` goes directly to the unit's recap. These controls and their persistence are proposed. Exploration units offer `Look closer` and `Move on` as proposed presentation-only choices, with no currency, combat, moral, or reward consequence. Moving on retains the clue's question unanswered; it never records the clue as found. No timed choice.
- **Visual direction:** use existing room background and existing portraits where available. Stage all new object business in descriptive text; no new art or animation is required by the minimum version. Optional animation is an engineering/art proposal only. One speaking turn or up to 35 words of narration per page; allow unhurried manual advance and scrolling. Estimates assume roughly 100 words per minute plus input, not a time limit. They have not been measured with children or in the UI.
- **Read:** actual `run.region`, current node identity, active party/Companion, and boss outcome when relevant; proposed `N.seen[id]`, `N.clues[id]`, `N.bossMet[region]`, `N.bossResolved[region]`, `N.runPlayed[id]`, `N.sanctuary`. These proposed fields must not be confused with existing generic clue totals or `blueprint.cleared`.
- **Write:** after full text or recap is displayed, mark `N.seen[id]` and `N.runPlayed[id]`. An examined clue also sets `N.clues[id]`; a skipped optional clue does not. Boss introduction sets `N.bossMet[region]`; boss postscene sets `N.bossResolved[region]` only following actual victory. None of these flags changes combat rules or awards a pet/Companion.
- **Repeat:** show the specified shorter version once per expedition. Do not auto-repeat optional clues; their `Look closer` content remains available. No bark repeats in one battle. Resume midway through a scene at its last complete page, with a visible recap option; this checkpointing is proposed. `N.bossResolved` records an earlier conversation, not permanent reform of every House mechanism.
- **Dependencies:** `D-SCENE`, a proposed state-aware manual-advance text overlay before/after existing scenes; `D-CLUE`, proposed identity-bearing clues and revisit list; `D-STATE`, proposed narrative save fields; `D-BARK`, a proposed readable battle-text renderer with per-encounter suppression and a transcript. Existing `c.say` sites supply triggers, not verified presentation. D-BARK is required for every battle bark below. Until it exists, omit added barks and retain actual rule panels. These labels refer to proposals, not completed systems.
- **Minimum existing-system alternative:** author these as new text entries using the existing prose Curiosity/reward presentation; they still require data/wiring work. Omit optional Kid/Companion branches and state-dependent claims if that wiring is absent. Put essential Heart facts on the final encounter's static introduction; never pretend an earlier optional room was visited. Do not replace mechanical rule descriptions with story prose.
- **Skip and fallback:** each unit's recap is exact text. Essential facts absent from any optional region recur at the Heart. After a boss, show recap before the route chooser; route choice remains the actual game's choice/vote. If a line depends on a pet, rescue, clue or named Companion not verified by state, omit that line. No unit depends on finding all sixteen Companions, rescuing all eight pets, or traversing all seventeen regions.

### Repeat expeditions after the ending

Combat interrupts a guardian's enforcement; it does not prove a moral argument. Each postscene adds one small piece of contrary evidence and one bounded concession. The House's broader rule remains until the explicitly supported ending. These scripts do not reimprison rescued pets or silently undo the sanctuary. Until `N.sanctuary`, repeat encounters concern rules still running elsewhere in the living House. Local promises apply to the current scene and do not claim persistent changes to map geometry or enemies. After `N.sanctuary`, canonical repeat combat needs a proposed clearly selected **Revisit a remembered expedition** mode. Exact entry text: “This is a memory of an earlier expedition. Your friends are safe in the present.” Button: “Revisit the memory.” Leaving it reads: “Back to now.” This is not currently supported. Without that support, do not attach a completed sanctuary narrative to contradictory live replay. Flag the implementation dependency rather than claim it solved.

## Region 09 The Lampworks

**Identity:** The Lamplighter believes a light is safest in its own hands. It wants every spark accounted for. Its comic flaw is treating illumination as a scarce resource while lighting its own inventory labels. Its relationship to the House is caretaker of stored power, not jailer of souls by established fact. Some source lamp shapes are ambiguous; no clue declares fuel to be animal souls.

### MM09 F The very visible warning

**Location/trigger:** first entry to Lampworks; no prior wing required. **Duration:** 20 seconds. **Read/write:** default. **Priority:** optional foreshadowing.

Narration: “A sign reads: KEEP ALL LIGHT UNDER SUPERVISION. A tiny lamp shines on the sign. A second lamp shines on the first lamp.”

Eli, if present: “Who's watching the second one?”

Otherwise narration: “There is no third lamp. Apparently two is sensible.”

**Repeat:** “The two lamps are still supervising each other.” **Recap:** “The Lamplighter wants every light watched.” **Direction:** static sign description; no flashing.

### MM09 C1 The shelf with two shadows

**Location/trigger:** Lantern Gallery, optional examination. **Duration:** 25 seconds. **Question:** are the lights imprisoned animals? **Evidence:** a flame casts a small animal-like shadow, then a kettle-shaped shadow when the flame bends. **Classification:** ambiguous appearance; interpretation explicitly unproved. **Payoff:** learn to distinguish a suggestive shape from a living captive; the Heart supplies positive evidence of transformed animals.

Narration: “One lantern throws a rabbit-shaped shadow. The flame leans. Now the shadow looks like a kettle.”

Mateo, if present: “I was about to write ‘rabbit prison.’ New note: ‘check before naming prison.’”

Otherwise narration: “A familiar shape is a clue to check, not an answer.”

**Repeat/recap:** “The shadow changes with the flame. It does not prove an animal is inside.” **State:** set C1 only on examination. **Fallback:** no later claim requires this clue.

### MM09 C2 The lending hooks

**Location/trigger:** Lamplighter's Office, optional examination. **Duration:** 25 seconds. **Question:** was light always held centrally? **Evidence:** hooks labelled OUT and BACK; the OUT hooks have been covered by a board labelled SAFER HERE. **Classification:** proposed physical evidence, not a dated historical account. **Payoff:** Lamplighter's postscene moves one useful lamp to a route, reversing its hoarding locally.

Narration: “Two rows of hooks are marked OUT and BACK. A board covers OUT. It reads SAFER HERE.”

Maya, if present: “It kept the return hooks. It stopped allowing the leaving.”

Otherwise narration: “These lamps used to have a way out and a way back.”

**Repeat/recap:** “The lending hooks were covered, not removed.” **Fallback:** postboss shows the same labels on a portable hook board, without saying the player saw the office.

### MM09 C3 A moth applies for permission

**Location/trigger:** Wick Room Curiosity; optional, outside combat. **Duration:** 20 seconds. **Question:** what do residents do with excessive rules? **Evidence:** a Lamp Moth circles a lamp whose label says CIRCLING BY APPOINTMENT. **Classification:** observable comic behavior, no story gate.

Narration: “A Lamp Moth circles a lamp. Its label reads CIRCLING BY APPOINTMENT. The moth lands on the word APPOINTMENT, eats a neat hole, and resumes.”

Lena, if present: “Approved.”

Otherwise narration: “The paperwork is now lighter.”

**Repeat/recap:** “The Lamp Moth has dealt with the paperwork.” **Fallback:** omit; no mechanical moth behavior is promised.

### MM09 B0 The Great Lantern Room

**Trigger:** before actual Lamplighter battle. **Duration:** 30 seconds. **Choice:** Continue to current combat; skip to recap. **Direction:** hold existing boss portrait; text conveys action.

Lamplighter: “Stay by me. I have counted every light.”

Narration: “It checks its list by the glow of a lamp labelled LIST-CHECKING LAMP.”

Lamplighter: “Except that one. That one is administration.”

Eli, if present: “The lights could help people find the way.”

Otherwise narration: “The way behind you is dark. The lamps are gathered around the Lamplighter.”

Lamplighter: “And wander away? No. I will carry enough for everyone.”

**Repeat:** Lamplighter: “Every spark accounted for. I have made a smaller list.”

**Recap:** “The Lamplighter keeps the lamps close. The battle's rule panel explains their effects.”

### MM09 B1 Holding the light

**Trigger/site:** replacement flavor for `lamplighter.js` `one-light-is-enough` existing `c.say`; only when transition actually executes. **Text:** Lamplighter: “One light. Mine to hold.” **Duration:** 4 seconds estimated with D-BARK. **Repeat:** same once per fight. **Skip/recap:** omit flavor; all Stored Flame rules remain separately displayed. **State:** runPlayed only. **Fallback:** keep existing event; no player-visible bark claimed.

### MM09 P A useful lamp

**Trigger:** confirmed boss victory, before rewards/route choice. **Duration:** 40 seconds. **Consequence:** the caretaker performs one useful act for the departing party; no permanent light-rule change claimed.

Narration: “The Lamplighter sets down its pole. A small lamp swings toward the unlit threshold.”

Lamplighter: “That lamp is leaving its assigned position.”

Eli, if present: “Give it a better one.”

Otherwise narration: “The dark threshold has no lamp.”

Narration: “The Lamplighter lifts a board: OUT on one side, BACK on the other. It hangs the lamp at the threshold. The beam reaches an old pawprint hidden in the dark.”

Lamplighter: “Lighting the way. That is a position.”

Narration: “It turns the list-checking lamp toward the list.”

Lamplighter: “Do not get ideas.”

**Repeat:** “The Lamplighter places a lamp by the way onward. ‘A useful position,’ it says.”

**Recap:** “The Lamplighter lights the party's way onward. Keeping every light close was leaving other places dark.” **Fallback:** display recap with reward; no implication that a new lantern item was obtained.

### MM09 T Onward

**Trigger:** after P, before existing wing options. **Text:** “A little light reaches the map. Choose from the routes the House offers tonight.” **Repeat:** same. **Recap:** same. **Duration:** 7 seconds. **Consequences/state:** no changes beyond ordinary route selection; never name a guaranteed next region.

## Region 10 The Ballroom and Velvet Suites

**Identity:** the Master of Revels wants a party nobody leaves. It equates comfort with agreement. Its comic flaw is converting every boundary into an event to host. The House's hospitality is real; the invitation still has costs. Tactical acceptance of an actual Banquet card is not consent to captivity.

### MM10 F A farewell rehearsal

**Location/trigger:** Ballroom Foyer first entry. **Duration:** 20 seconds.

Narration: “A Party Phantom practises waving goodbye. Each time it reaches ‘good—’, a curtain drops in front of it.”

Samir, if present: “Very dramatic. Difficult to leave a review.”

Otherwise narration: “The farewell has excellent curtains and no ending.”

**Repeat:** “The phantom tries waving around the curtain.” **Recap:** “The Ballroom makes leaving awkward.”

### MM10 C1 The coat ticket

**Location/trigger:** Dance Card Room, examination. **Duration:** 25 seconds. **Question:** does taking hospitality create an obligation? **Evidence:** ticket reads COAT RECEIVED on front, GUEST WILL REMAIN on back. **Classification:** resident's false claim, not a valid rule binding the player. **Payoff:** postboss coat service without residence terms.

Narration: “The coat ticket says COAT RECEIVED. On the back, in much smaller letters: GUEST WILL REMAIN.”

Samir, if present: “I asked you to keep a coat. That's one coat too far.”

Otherwise narration: “A coat ticket cannot decide where a person lives.”

**Repeat/recap:** “The ticket tries to turn a small service into a promise to stay.” **Fallback:** B0 and P state the distinction without needing the ticket.

### MM10 C2 The short dance

**Location/trigger:** Musicians' Gallery, examination outside battle. **Duration:** 25 seconds. **Question:** can a resident like the party and want a break? **Evidence:** music stand score titled ONE SHORT DANCE; added pages spiral into a basket. **Classification:** physical evidence; no named composer or ghost history.

Narration: “The music is called ONE SHORT DANCE. Someone has added forty-seven endings. Each says AGAIN.”

Priya, if present: “The first version was a better plan.”

Otherwise narration: “The dance has forgotten how to finish.”

**Repeat/recap:** “The short dance has forty-seven extra endings.” **Fallback:** optional comic reinforcement.

### MM10 C3 A guest with an empty plate

**Location/trigger:** Red Drawing Room, Curiosity. **Duration:** 25 seconds. **Question:** are satisfied guests required to accept more? **Evidence:** Party Phantom lowers its empty plate; a tray pursues the plate, not the guest's gesture. **Classification:** observed behavior. **Payoff:** P turns a serving tray aside.

Narration: “A Party Phantom lowers its empty plate. A tray follows the plate under the table, determined to fill it.”

Amina, if present: “Being finished is allowed.”

Otherwise narration: “The guest's empty plate means finished. The tray thinks it means emergency.”

**Repeat/recap:** “The tray keeps offering food after the guest is finished.” **Fallback:** boss's refusal to end the party gives core fact.

### MM10 B0 Master of Revels' Hall

**Trigger:** before boss battle. **Duration:** 35 seconds.

Master: “Welcome! Your chairs have been expecting you.”

Narration: “The chairs bow. One bows too far and needs help from a footstool.”

Master: “We have everything you could want.”

Samir, if present: “Including a goodbye?”

Otherwise narration: “The door closes behind the waiting chairs.”

Master: “A goodbye! How charming. We shall hold a farewell banquet. Followed by the after-farewell banquet.”

**Repeat:** Master: “The after-after-farewell banquet is ready.”

**Recap:** “The Master treats guests as permanent residents. Battle offers have their displayed tactical costs; accepting one does not mean agreeing to stay.”

### MM10 B1 Another beginning

**Trigger/site:** `master-of-revels.js`, existing `the-party-is-just-beginning` c.say. **Text:** Master: “A fresh beginning! Endings are so undercatered.” **Duration:** 5 seconds. **State:** runPlayed only. **Fallback:** current line. **Skip/recap:** preserve phase and Banquet mechanical announcements; do not replace them.

### MM10 P The first finished party

**Trigger:** actual victory. **Duration:** 40 seconds. **Consequence:** an ordinary guest is allowed to finish its visit; no Companion outcome presumed.

Narration: “The Master lowers the baton.”

**If MM10 F was shown this run:** “The Party Phantom from the doorway lifts a hand to wave.”

**Otherwise:** “A Party Phantom lifts a hand to wave.”

Master: “A final course?”

Narration: “The guest shakes its head.”

Master: “A very small final course?”

Narration: “The Master catches the tray before it follows the guest.”

Master: “No. I heard you.”

Narration: “The guest takes its coat. The Master holds the door for this departure.”

Samir, if present: “That was good hosting.”

Otherwise narration: “For once, the farewell finishes.”

Master: “I shall need a smaller invitation.”

**Repeat:** “The Master holds back a pursuing tray. ‘Our guests are finished for tonight.’”

**Recap:** “The Master lets a guest finish its visit. Accepting a treat never meant agreeing to stay forever.” **Direction:** guest need not have a new asset; describe the action. **Branch:** use only the applicable exact Party Phantom line above.

### MM10 T An actual goodbye

**Text:** Master: “Goodbye. No second verse.” **Trigger:** before route screen. **Duration:** 5 seconds. **Repeat/recap:** same. **Consequence:** route selection unchanged.

## Region 11 The Crypt and Ossuary

**Identity:** the Bone Curator wants every piece in its correct exhibit. It confuses caring for a collection with choosing another creature's body and habits. Comic flaw: impeccable labels, terrible categories. Keep skeleton imagery toy-like and non-graphic. No missing pet's death is inferred from a collar, urn, bone or name.

### MM11 F The uncooperative exhibit

**Location/trigger:** Crypt Vestibule first entry. **Duration:** 20 seconds.

Narration: “A sign says PLEASE DO NOT MOVE THE EXHIBITS. A loose bone hops past carrying the sign.”

Jordan, if present: “That one's in charge of not moving.”

Otherwise narration: “The sign is keeping up as best it can.”

**Repeat:** “The sign travels past again.” **Recap:** “The exhibits do not always follow their labels.”

### MM11 C1 A name without a death

**Location/trigger:** Name Vault examination. **Duration:** 25 seconds. **Question:** does a preserved name mean its owner died? **Evidence:** drawers label names RETURNED HOME, STILL HERE and UNKNOWN; no contents identify the active pet. **Classification:** proposed record categories, not proof of any individual fate. **Payoff:** Heart Hall of Names records departures without erasure.

Narration: “Name drawers are marked RETURNED HOME, STILL HERE, and UNKNOWN. Someone has carefully polished all three.”

Mateo, if present: “Kept names. Different stories. We have to read the labels.”

Otherwise narration: “Keeping a name does not tell you what happened to the animal.”

**Repeat/recap:** “Names are kept for animals who left as well as animals who stayed.” **Fallback:** Heart supplies an unambiguous departed-animal record.

### MM11 C2 The incorrect tail

**Location/trigger:** Skull Alcove examination. **Duration:** 20 seconds. **Question:** who defines the correct arrangement? **Evidence:** diagram of a straight tail; curled wire spring labelled INCORRECT TAIL. **Classification:** Curator's opinion.

Narration: “A spring is labelled INCORRECT TAIL. The picture of a correct tail is very straight. The spring bounces the label onto a shelf.”

Lena, if present: “Correct bounce, though.”

Otherwise narration: “The spring is good at something the picture cannot do.”

**Repeat/recap:** “The Curator's label misses what the spring can do.” **Fallback:** no plot dependency.

### MM11 C3 The borrowed brush

**Location/trigger:** Memorial Chamber, optional examination. **Duration:** 25 seconds. **Question:** can preservation be kind? **Evidence:** dust brushed from a small nameplate without changing its worn lettering. **Classification:** observed useful care.

Narration: “A soft brush clears dust from a worn nameplate. It follows every crooked letter instead of painting a new name over it.”

Amina, if present: “That part is good. Helping something stay itself.”

Otherwise narration: “Care can preserve a name without replacing it.”

**Repeat/recap:** “The little brush protects the original name.” **Fallback:** P shows positive preservation through a changed label.

### MM11 B0 The Great Ossuary

**Trigger:** before boss combat. **Duration:** 30 seconds.

Curator: “Excellent. Visitors. Please remain in your original arrangement.”

Narration: “The Curator straightens a label tied to its elbow. The label says KNEE.”

Curator: “A temporary filing problem.”

Jordan, if present: “Maybe the elbow knows more about being an elbow.”

Otherwise narration: “The elbow bends. The Curator moves its label instead.”

Curator: “Every piece belongs somewhere. I shall find your somewhere.”

**Repeat:** Curator: “Visitors again. I have prepared a less specific label.”

**Recap:** “The Curator wants to assign every creature a place. The battle rules explain its exhibits and attached pieces.”

### MM11 B1 The incomplete display

**Trigger/site:** `bone-curator.js`, existing `the-display-is-incomplete` c.say. **Text:** Curator: “The display is incomplete. I shall be the display.” **Duration:** 5 seconds. **Fallback:** original c.say. **Skip/recap:** mechanics remain in the Exhibit rule panel. **State:** runPlayed only.

### MM11 P A label that fits

**Trigger:** victory. **Duration:** 35 seconds. **Consequence:** Curator changes a category rather than rearranging an individual; no pet restoration.

Narration: “The Curator picks up the spring labelled INCORRECT TAIL. The spring hops away before it can be straightened.”

Curator: “It will not fit.”

Jordan, if present: “Try a bigger idea.”

Otherwise narration: “The spring fits perfectly into its own curl.”

Narration: “The Curator turns the label over and writes: SPRING. EXCELLENT AT BOUNCING.”

Curator: “I may need more categories.”

Narration: “The spring bounces once. The Curator does not correct it.”

**Optional only when Bones is present; adds 12 seconds:** Curator: “May I label you?” Narration: “Bones takes the blank tag, buries it under a cushion, and settles on top.” Curator: “I shall record that as a no.”

**Repeat:** “The Curator clears a space on its label: ‘Additional uses welcome.’”

**Recap:** “The Curator changes its label instead of forcing the spring to change. A creature is more than someone else's category.” **Fallback:** this scene introduces the spring if C2 absent; no “as you saw” line.

### MM11 T Visitors may move

**Text:** “The Curator turns the visitor sign toward you: VISITORS MAY MOVE. The map shows tonight's routes onward.” **Duration:** 8 seconds. **Repeat/recap:** “Visitors may move. Choose a route onward.” **Consequence:** actual route options unchanged.

## Region 12 The Withered Hedge Maze

**Identity:** the Gardener of Rot sees change everywhere and treats every object or creature as material for the next thing. It wants to prove that nothing is wasted. Its comic flaw is offering compost as the answer to every practical question. The House's pattern appears as unwanted redesign, not a moral claim that transformation is bad.

### MM12 F A useful bench

**Location/trigger:** Hedge Gate first entry. **Duration:** 20 seconds.

Narration: “A sign says REST BENCH. Below it: CURRENTLY A MUSHROOM. PLEASE REST PROPORTIONATELY.”

Lena, if present: “A very short break.”

Otherwise narration: “The mushroom is doing its best.”

**Repeat:** “The mushroom bench has acquired a very small cushion.” **Recap:** “The Gardener turns yesterday's things into tomorrow's growth.”

### MM12 C1 The bowl kept clean

**Location/trigger:** Burrow Row examination. **Duration:** 25 seconds. **Question:** does changing make an animal stop being itself? **Evidence:** a quill trail and repeatedly cleared bowl beside compost. Do not identify Truffle unless present or actual identity clue has been established elsewhere. **Classification:** behavior without identity claim.

Narration: “Mushrooms cover a little bowl. A path of quill marks leads to it. Something has pushed the mushrooms away from the rim, again and again.”

Lena, if present: “Whatever else changed, it still likes its bowl.”

Otherwise narration: “New growth has not erased an old preference.”

**Repeat/recap:** “The bowl keeps being cleared. Its visitor still has preferences.” **Fallback:** P demonstrates same principle without animal identity.

### MM12 C2 The mulching instructions

**Location/trigger:** Groundskeeper's Garden examination. **Duration:** 25 seconds. **Question:** what is the Gardener overlooking? **Evidence:** slate says DEAD LEAVES, BROKEN TWIGS, UNWANTED THINGS; below a smaller question reads UNWANTED BY WHOM? **Classification:** proposed resident question; author unknown, not attributed to a pet.

Narration: “The compost slate lists DEAD LEAVES, BROKEN TWIGS, UNWANTED THINGS. Somebody has scratched: UNWANTED BY WHOM?”

Maya, if present: “Good question. Keep that question.”

Otherwise narration: “The slate has no answer.”

**Repeat/recap:** “The Gardener has not asked who wants to keep a thing.” **Fallback:** B0 and P expose the belief directly.

### MM12 C3 The scarecrow's button

**Location/trigger:** Rose Deadwalk Curiosity, after any battle there is resolved. **Duration:** 25 seconds. **Question:** can an old thing remain valued? **Evidence:** Wilted Scarecrow mends its coat around a retained button. **Classification:** observed care, no reward item.

Narration: “A Wilted Scarecrow patches its coat. One button has been sewn back on with five different threads.”

Eli, if present: “That button has a longer maintenance history than my bike.”

Otherwise narration: “The button is old. It is also wanted.”

**Repeat/recap:** “The scarecrow keeps repairing the same button.” **Fallback:** postboss uses an unrelated work glove; never claims the scarecrow was met.

### MM12 B0 Rotunda of Rot

**Trigger:** before actual boss fight. **Duration:** 30 seconds.

Gardener: “Welcome! What would you like to become?”

Lena, if present: “Someone who found what she came for.”

Otherwise narration: “The path behind you has already sprouted two new turns.”

Gardener: “Mushrooms are very dependable.”

Narration: “It offers a tray of labelled pots. Every label says MUSHROOM, with different handwriting.”

Gardener: “Plenty of choices.”

**Repeat:** Gardener: “I have added a non-mushroom option. It is a larger pot.”

**Recap:** “The Gardener treats change as permission to decide what everything becomes. Its visible battle state changes its effects.”

### MM12 B1 New growth

**Trigger/site:** `gardener-of-rot.js` existing phase-transition c.say currently “Good soil needs something dead.” **Replacement text:** Gardener: “Old leaves. New growth. Nothing wasted!” **Duration:** 5 seconds. **Reason:** avoids a threatening death premise toward children while preserving compost identity. **Fallback:** omit flavor; preserve mechanical state announcement. **State:** runPlayed only. **Skip/recap:** Decay Cycle rule panel remains authoritative.

### MM12 P The glove can stay a glove

**Trigger:** victory. **Duration:** 35 seconds. **Consequence:** preservation becomes a local alternative to imposed change.

Narration: “The Gardener's glove has a hole. A mushroom pokes through one finger.”

Gardener: “A useful new planter.”

Lena, if present: “Do you still want the glove?”

Otherwise narration: “The Gardener tries to grip its fork. The mushroom gets in the way.”

Gardener: “Actually. Yes.”

Narration: “It moves the mushroom into a pot. It patches the glove with a leaf.”

Gardener: “This one stays a glove.”

Narration: “It looks at the pots labelled MUSHROOM.”

Gardener: “I am keeping the mushroom pots. But not everything needs to go in one.”

**Repeat:** “The Gardener repairs its glove before reaching for the compost.”

**Recap:** “The Gardener keeps the glove and gives the mushroom its own pot. Change can be welcome without being compulsory.” **Fallback:** prose alone; no glove item or gardening mechanic.

### MM12 T Leave the bowl

**Text:** “The Gardener clears this path instead of planting over it. Tonight's other routes wait on the map.” **Duration:** 7 seconds. **Repeat/recap:** “This path is clear. Choose tonight's next route.” **State/consequences:** no persistent geometry claim.

## Region 13 The Secret Passages

**Identity:** the Whisper Warden wants everything safely hidden. It mistakes privacy for disappearance from everyone else's reach. Its comic flaw is being secretive about public information and conspicuous about secrecy. Hush's voluntary hiding is not an evil power. No child must crawl, climb or squeeze through an inaccessible passage to understand the scene.

### MM13 F A public secret

**Location/trigger:** Narrow Service Hall first entry. **Duration:** 20 seconds.

Narration: “A little plaque says SECRET PASSAGE. A second plaque says PLEASE DO NOT READ THE FIRST PLAQUE.”

Mateo, if present: “This is a very well-advertised secret.”

Otherwise narration: “The secret has excellent signage.”

**Repeat:** “A third plaque says THERE ARE NO PLAQUES.” **Recap:** “The Warden hides things even when hiding makes no sense.”

### MM13 C1 Two handles

**Location/trigger:** Portrait Cavity examination from the room floor; no crawling. **Duration:** 25 seconds. **Question:** when is hiding chosen? **Evidence:** peephole cover can be closed only from the corridor side; painted label PRIVACY. **Classification:** physical restriction, false label.

Narration: “A cover marked PRIVACY shuts a little viewing hole. Its handle is on the corridor side. There is no handle inside.”

Maya, if present: “Privacy needs a handle for the person inside.”

Otherwise narration: “Whoever is inside cannot choose when to open it.”

**Repeat/recap:** “The outside handle gives the watcher control over the hidden room.” **Fallback:** P demonstrates a cover that the occupant controls.

### MM13 C2 A voice with a label

**Location/trigger:** Speaking Tube Junction examination. **Duration:** 30 seconds. **Question:** does a familiar call prove the caller is present? **Evidence:** tube marked RECORDED CALL: COME HERE; valve repeats identical phrase while speaker unseen. **Classification:** recorded message, not active pet speech; no Pepper identity claim. **Payoff:** later pet identification requires actual behavior/appearance, not a voice alone.

Narration: “A speaking tube says, ‘Come here!’ Its label reads RECORDED CALL. A little wheel turns. Exactly the same ‘Come here!’ follows.”

Mateo, if present: “A voice can travel without the person. We still need to check.”

Otherwise narration: “The sound is familiar. The label explains how it repeats.”

**Repeat/recap:** “A recorded call is not proof its original speaker is here.” **Fallback:** root's reunion scripts must not use an unverified voice as sole evidence.

### MM13 C3 The borrowed key

**Location/trigger:** Behind the Nursery Curiosity, noncombat. **Duration:** 20 seconds. **Question:** can residents choose contact? **Evidence:** Key Snatcher offers a key then withdraws it to scratch its own nose. **Classification:** comic behavior, no obtained item.

Narration: “A Key Snatcher raises a key toward you. Then it uses the key to scratch its nose. The offer may need clarification.”

Samir, if present: “I nearly thanked your face.”

Otherwise narration: “The key remains firmly employed.”

**Repeat/recap:** “The Key Snatcher has not offered you a key.” **Fallback:** optional; never record an inventory change.

### MM13 B0 The Whisper Room

**Trigger:** before Warden battle. **Duration:** 30 seconds.

Warden: “You did not find this room.”

Narration: “A sign behind it says WHISPER ROOM.”

Warden: “You did not read that.”

Mateo, if present: “Would you like us to whisper the questions?”

Otherwise narration: “The Warden spreads its coat across the sign.”

Warden: “No questions. Nothing hidden can be taken away.”

**Repeat:** Warden: “You have found this room an unreasonable number of times.”

**Recap:** “The Warden hides creatures and information so others cannot choose. The route and latch rules remain in the battle panel.”

### MM13 B1 More routes

**Trigger/site:** existing `whisper-warden.js` c.say “Two more routes. Every Latch on them is weaker.” **Text:** keep exact mechanical sentence. Append only if log presentation supports a separate line: Warden: “A secret exit for my secret exit.” **Duration:** 4 seconds plus rules. **Dependency:** separate readable log entry; omit flavor if it crowds the mechanic. **Repeat:** once per actual transition. **Recap:** existing mechanical sentence. **State:** runPlayed only.

### MM13 P The inside handle

**Trigger:** victory. **Duration:** 35 seconds. **Consequence:** Warden gives an occupant control of one screen, not global visibility or a forced reveal.

Narration: “A small animal waits behind a shutter. The Warden reaches for the outside handle, then stops.”

Warden: “If I open it, you will see.”

Mateo, if present: “Then let whoever's in there open it.”

Otherwise narration: “A little paw reaches toward the handle it cannot touch.”

Narration: “The Warden slides the handle through to the other side. The shutter opens a finger's width. A small eye looks out. Then the shutter closes.”

Warden: “That was hardly anything.”

Narration: “The handle turns once from inside.”

Warden: “But it was an answer.”

**Repeat:** “The Warden checks which side of the shutter has the handle.”

**Recap:** “The occupant chooses when to open the shutter, and may close it again. Privacy needs control from inside.” **Fallback:** shadow remains unnamed; no claim that Hush or a missing pet is here.

### MM13 T An honest sign

**Text:** “The Warden uncovers the room sign. ‘This one you may read.’ Tonight's route choices appear on the map.” **Duration:** 7 seconds. **Repeat/recap:** “The sign stays visible. Choose a route onward.”

## Region 14 The Bathhouse and Rain Wing

**Identity:** the Drowned Matron offers genuine warmth, rest and washing, but decides nobody may leave until calm enough by her standard. She is a spectral storybook caretaker, not a drowned corpse. Her comic flaw is prescribing towels for problems towels cannot solve. Fear is not failure; calmness is not a condition for agency.

### MM14 F The towel for the towel

**Location/trigger:** Changing Room first entry. **Duration:** 20 seconds.

Narration: “A towel hangs over a wet towel to dry it. A smaller towel hangs over that towel. The smallest towel is wearing a shower cap.”

Amina, if present: “Somebody is trying very hard.”

Otherwise narration: “The drying plan has become complicated.”

**Repeat:** “The smallest towel still has its cap.” **Recap:** “The Bathhouse supplies more care than a problem always needs.”

### MM14 C1 The moving calm line

**Location/trigger:** Rain Gallery examination. **Duration:** 30 seconds. **Question:** can a resident ever satisfy the Matron's rule? **Evidence:** chart shows READY TO LEAVE at three successive heights, each crossed out and raised. No real child's emotions are scored.

Narration: “A practice chart says READY TO LEAVE. The line has been moved higher three times. Each old line is marked ALMOST.”

Amina, if present: “If she keeps moving the line, nobody can finish.”

Otherwise narration: “The rule changes whenever somebody gets close.”

**Classification:** proposed evidence of institutional rule, not medical advice. **Payoff:** Matron stops testing a guest's feelings before offering a towel. **Repeat/recap:** “The Matron's leaving rule keeps moving.” **Fallback:** B0 states her standard; P rejects it directly.

### MM14 C2 A dry little place

**Location/trigger:** Flooded Conservatory examination from dry threshold. **Duration:** 25 seconds. **Question:** is all comfort false? **Evidence:** a resting nook has a folded towel and an unobstructed opening; no animal present means no inferred gratitude.

Narration: “Beside the rain, a dry nook holds a folded towel. The opening is wide. A creature could rest here and leave without moving the towel.”

Priya, if present: “That works. Keep the dry spot. Keep the way out.”

Otherwise narration: “A useful shelter does not need to close around its guest.”

**Classification:** directly observable. **Repeat/recap:** “A dry nook can offer comfort without trapping anyone.” **Fallback:** sanctuary ending reuses principle, not this exact location.

### MM14 C3 Soap's official opinion

**Location/trigger:** Drying Room Curiosity after any encounter. **Duration:** 20 seconds.

Narration: “A Soap Sprite inspects a spotless tile. It polishes its reflection. Its reflection polishes back.”

Eli, if present: “They've found twice as much work.”

Otherwise narration: “Both inspectors look very satisfied.”

**Question/payoff:** character color, care becoming endless work; no clue gate. **Classification:** comic observation. **Repeat/recap:** “The Soap Sprite's inspection continues.”

### MM14 B0 The Drowned Rotunda

**Trigger:** before boss combat. **Duration:** 30 seconds.

Matron: “There. A warm towel. You may leave when you are calm enough.”

Amina, if present: “I can be worried and still know where I want to go.”

Otherwise narration: “She places another towel beside the locked way onward.”

Matron: “Then perhaps a second towel.”

Narration: “She checks her pockets. More towels.”

Matron: “I have prepared for most situations.”

**Repeat:** Matron: “I have brought one towel. I am trying to listen before choosing the second.”

**Recap:** “The Matron makes calmness a condition for leaving. Feelings do not remove anyone's right to choose. Read Weather and Water Level rules in battle.”

### MM14 B1 A larger room

**Trigger/site:** existing transition `drowned-matron.js` c.say “The room below is much larger than the room above.” **Text:** retain this exact line. No joke is added during this transition. **Duration:** 5 seconds estimated with D-BARK. **Direction:** text only; no breath-holding, struggling underwater or drowning imagery. **State:** runPlayed. **Fallback/recap:** retain the original event and mechanical rule panel; no visible bark claimed without D-BARK.

### MM14 P The towel is an offer

**Trigger:** victory. **Duration:** 35 seconds. **Consequence:** Matron demonstrates accepting a refusal without measuring feelings.

Narration: “The Matron sets a towel on the dry edge of the room. She does not push it toward you.”

Matron: “There, if you want it.”

Amina, if present: “And if we don't?”

Otherwise narration: “She looks at the extra towels in her pockets.”

Matron: “Then it remains a perfectly good towel.”

Narration: “A little Puddle Spirit settles beside it instead of on it.”

Matron: “Beside is also an option.”

Narration: “She lets the spirit rest its own way.”

**Repeat:** “The Matron puts one towel within reach and waits.”

**Recap:** “The Matron offers comfort without making anyone accept it or become calm first.” **Choices:** no towel selection is claimed; player may simply Continue. Optional offer UI is unnecessary.

### MM14 T Leave with your feelings

**Text:** “The Matron steps aside. You can leave with whatever you are feeling.” **Duration:** 6 seconds. **Repeat/recap:** same. **Consequence:** proceeds to actual route selection, not a calmness test.

## Region 15 The Kennels and Animal Ward

**Identity:** the Kennelmaster knows how to help animals and will not permit any uncertainty after helping them. It wants a guarantee that no animal will ever face danger. Its comic flaw is classifying normal animal habits as problems requiring forms. This region must confirm actual care while exposing why care does not confer ownership. Battle Ward Animals are not the Kid's pet by default.

### MM15 F The safety inspection

**Location/trigger:** Animal Intake Room first entry. **Duration:** 20 seconds.

Narration: “A clipboard lists: WATER, FOOD, BLANKET, TOY. Every box is checked. Below them: POSSIBLE ESCAPE BY ENJOYING WALK. Three boxes.”

Priya, if present: “That last part is a different problem.”

Otherwise narration: “The checklist has mixed care with control.”

**Repeat:** “The care checklist still has the wrong extra boxes.” **Recap:** “The ward provides care, then treats leaving as a fault.”

### MM15 C1 The collar and the card

**Location/trigger:** Collar Room examination. **Duration:** 30 seconds. **Question:** did the House know some animals had homes? **Evidence:** unnamed collar tray paired with card KNOWN HOME, AWAITING RETURN; return box covered by a slip reading NOT YET SAFE. No collar is assigned to active pet without that pet's authored clue.

Narration: “A tray holds a collar and an intake card: KNOWN HOME. AWAITING RETURN. A newer slip covers the return box: NOT YET SAFE.”

Maya, if present: “It knew there was someone to go home to.”

Otherwise narration: “The House had evidence of a home. It kept the animal anyway.”

**Classification:** developed source concept, new specific prop text. **Payoff:** Heart repeats clear evidence if missed. **Repeat/recap:** “Known homes were recorded. Return was postponed.” **Fallback:** MM17 C1 or B0 recap.

### MM15 C2 The well-used bandage box

**Location/trigger:** Veterinary Room examination. **Duration:** 30 seconds. **Question:** was the good care a lie? **Evidence:** treatment card records ARRIVED LIMPING, WALKING COMFORTABLY, TREATMENT COMPLETE; departure permission remains unchecked. No injury is shown.

Narration: “A care card reads ARRIVED LIMPING. WALKING COMFORTABLY. TREATMENT COMPLETE. Beneath that, LEAVING is still unchecked.”

Amina, if present: “The help was real. So was the locked gate.”

Otherwise narration: “Getting well did not earn the animal a way home.”

**Classification:** developed care-history concept; proposed card wording. **Payoff:** separate gratitude from obligation. **Repeat/recap:** “The ward helped an animal recover, then still withheld permission to leave.” **Fallback:** Keeper introduction affirms genuine care.

### MM15 C3 The enormous toy inventory

**Location/trigger:** Cat Room Curiosity outside battle. **Duration:** 20 seconds. **Question:** can a caretaker miss actual preference? **Evidence:** three elaborate toys unopened; one ordinary box worn from use.

Narration: “Three splendid toys sit untouched. Their box is battered, cosy, and occupied by a comfortable little shadow.”

Priya, if present: “The box wins. Update the report.”

Otherwise narration: “The inventory lists the box as PACKAGING. The occupant disagrees.”

**Classification:** observable choice; identity unknown. **Repeat/recap:** “The occupant prefers the box.” **Fallback:** no plot dependency; no specific pet inference.

### MM15 B0 Kennelmaster's Court

**Trigger:** before boss combat. **Duration:** 35 seconds.

Kennelmaster: “Fresh water. Clean bedding. A safe place for everyone.”

Narration: “It adjusts a blanket corner before lifting its keys.”

Kennelmaster: “Tell me nothing bad can happen outside. Then I can let them go.”

Priya, if present: “I can't promise that. You can't make staying their only choice.”

Otherwise narration: “The gate's latch is on the Kennelmaster's side.”

Kennelmaster: “I have a form for everything except that answer.”

**Repeat:** Kennelmaster: “The House has sent the same rule again: no risk, no leaving. I have no way to promise no risk.”

**Recap:** “The Kennelmaster provides real care but demands impossible certainty before releasing anyone. The Ward Animals in this fight are not automatically your missing pet.”

### MM15 B1 Visitors and control

**Trigger/site:** `kennelmaster.js` phase transition c.say “It has stopped thinking of you as a visitor.” **Text:** retain exact sentence. **Duration:** 4 seconds. **Skip/recap:** preserve all restraint/Trust announcements. **Fallback:** existing line. **State:** runPlayed only. No joke at restraint or frightened animals' expense.

### MM15 P The empty bed is ready

**Trigger:** victory. **Duration:** 45 seconds. **Consequence:** the Keeper of beds learns an empty bed can mean readiness rather than failure. Use one anonymous ward resident only after battle has resolved; never assert it was personally freed by a mechanic the player did not use.

Narration: “The Kennelmaster looks at an empty bed. It smooths the blanket as though something has gone wrong.”

Kennelmaster: “I had everything ready.”

Priya, if present: “You still do. For somebody who needs it.”

Otherwise narration: “The water is fresh. The blanket is clean. The empty bed is ready to help another visitor.”

Kennelmaster: “An empty bed is not a failed bed.”

Narration: “A small ward animal waits by the room's open threshold. The Kennelmaster sets a bowl beside the bed, clear of the way out.”

Kennelmaster: “You can rest. You can also go.”

Narration: “The animal steps through the threshold. The Kennelmaster leaves the bowl where it is.”

**Repeat:** “The Kennelmaster sets out a bowl without using it to block the way.”

**Recap:** “A ward animal leaves the room. The Kennelmaster keeps a bed ready without making staying compulsory. This is not a persistent missing-pet reunion.” **Direction:** text-only resident silhouette is optional; no treatment or distress animation.

### MM15 T The distinction

**Text:** “That animal has left this room. Your search continues through the House.” **Duration:** 6 seconds. **Repeat/recap:** same. **State:** no pet flags written; actual Companion rescue flow remains authoritative. A room threshold is not the mansion exit or a persistent reunion.

## Region 16 The Moon Courtyard and Pumpkin Grounds

**Identity:** the Harvest King believes every living thing has a correct season and that its calendar can identify it. It wants readiness to be orderly. Comic flaw: treating a frog that will not stay planted as a crop-management emergency. Do not tell players to delay the rescue of a pet until it transforms or becomes ripe.

### MM16 F The runaway vegetable

**Location/trigger:** Moon Gate first entry. **Duration:** 20 seconds.

Narration: “A sign shows a frog beside a pumpkin. It reads: IF YOUR PUMPKIN LEAPS, CONSULT THE KING. Beneath it: DO NOT REPLANT UNTIL CONSULTATION.”

Maya, if present: “At least somebody added the second line.”

Otherwise narration: “The second line appears to have been necessary.”

**Repeat:** “The leaping-pumpkin sign is now weighted down with a rock.” **Recap:** “The King keeps confusing a creature with a crop.”

### MM16 C1 The impossible calendar

**Location/trigger:** Moon Dial Garden examination. **Duration:** 25 seconds. **Question:** who decides readiness? **Evidence:** calendar says FROG READY; frog-shaped footprints lead across it and away. **Classification:** King's schedule versus animal behavior; does not identify Pipkin unless verified.

Narration: “The calendar says FROG READY. Tiny damp footprints cross out READY and continue over the edge.”

Maya, if present: “The frog has submitted an update.”

Otherwise narration: “The calendar did not ask the frog.”

**Repeat/recap:** “The frog went its own way despite the calendar.” **Payoff:** P retires animal harvest labels. **Fallback:** B0 states category error.

### MM16 C2 A seed with no deadline

**Location/trigger:** Pumpkin Patch examination. **Duration:** 25 seconds. **Question:** are stages a moral ranking? **Evidence:** seed, sprout and ripe pumpkin all healthy; source mechanics distinguish states but none makes a creature less entitled to agency.

Narration: “A seed rests beside a new sprout and a round pumpkin. Each has a small label: GROWING WELL.”

Amina, if present: “Different sizes. Nobody's behind.”

Otherwise narration: “The garden has room for more than one stage.”

**Classification:** proposed environmental beat. **Repeat/recap:** “Different growth stages can all be doing well.” **Fallback:** no mechanical timing advice; battle crop states retain their actual consequences.

### MM16 C3 The official frog pool

**Location/trigger:** Frog Pool examination. **Duration:** 20 seconds. **Question:** what happens when someone observes instead of assigning? **Evidence:** signs crop bed and pond; frog takes pond. No specific Companion assigned.

Narration: “A garden bed says FROGS. The pond says WATER. A frog sits in the pond with the air of someone who has solved a difficult puzzle.”

Jordan, if present: “Good work, frog.”

Otherwise narration: “The frog's answer is hard to argue with.”

**Repeat/recap:** “The frog prefers the pond to its assigned bed.” **Fallback:** optional comedy; no leap input needed.

### MM16 B0 Harvest King's Court

**Trigger:** before boss combat. **Duration:** 35 seconds.

King: “You arrive precisely when expected.”

Narration: “It turns a calendar around. Every square says VISITORS.”

Maya, if present: “Very accurate. Not very useful.”

Otherwise narration: “The calendar is impossible to prove wrong.”

King: “Everything has its proper moment. My task is to decide it.”

Narration: “A tiny frog hops off a planting marker. The King writes a very small complaint.”

**Repeat:** King: “Visitors. Again, precisely as the calendar foretold.”

**Recap:** “The King confuses tending crops with deciding an animal's life. Battle crop timing is a tactical system, not a countdown for your missing pet.”

### MM16 B1 The patch answers

**Trigger/site:** existing `harvest-king.js` `c.say` “Four Tricks, and the patch answers to you as much as to it.” **Text:** keep exact mechanical statement. Optional separate flavor: King: “That is not in my almanac.” **Duration:** 4 extra seconds. **Repeat:** flavor only at the first qualifying fourth Trick in this encounter, requiring D-BARK suppression; the underlying event can recur. **Fallback:** current event only, no visible bark claimed. **State:** runPlayed. **Skip/recap:** no alteration to card-generation or crop rules.

### MM16 P Frog is a complete answer

**Trigger:** victory. **Duration:** 40 seconds. **Consequence:** King stops applying harvest categories to an animal, without requiring an identity speech from it.

Narration: “The King kneels by the planting marker. The frog sits beside the pond.”

King: “Pumpkin? Frog? Pumpkin-frog? I cannot finish the label.”

Maya, if present: “Does the frog need you to?”

Otherwise narration: “The frog slips into the water without consulting the label.”

Narration: “The King crosses out HARVEST DATE and writes POND THIS WAY.”

King: “A sign can help without deciding.”

Narration: “It places the sign facing the pond. The frog is already there.”

King: “I shall call that an early success.”

**Repeat:** “The King puts the pond sign where a newcomer could use it.”

**Recap:** “The King replaces an animal's harvest label with a helpful direction. Animals do not need to reach a scheduled stage to choose.” **Fallback:** unnamed frog; Pipkin may remain active, already rescued elsewhere, or absent.

### MM16 T A useful direction

**Text:** “The sign points to the pond. The map points to tonight's available routes. Neither chooses for you.” **Duration:** 7 seconds. **Repeat/recap:** “Choose among the routes available tonight.” **Consequence:** follows actual solo choice or party vote; never claims unanimous agreement.

## Region 17 The Heart of the House

**Identity:** the Keeper is the House's protective instinct given form. Its fear of losing animals has become a rule that prevents them leaving. It has provided real safety and used that fact to overrule individual choice. No separate hidden villain, founder, dead family or specific catastrophe is revealed. The sanctuary resolution is a developed possible ending, not claimed as an already approved implementation.

### MM17 F Warmth at the centre

**Location/trigger:** first entry to Heart regardless of route. **Duration:** 25 seconds. **Priority:** essential, its recap survives skipping.

Narration: “The rooms near the Heart are warm. Bowls are clean. Blankets are folded. Every handle you can see is on the outside of a door.”

Narration: “The House has helped animals here. It has also decided they cannot leave.”

**Repeat before sanctuary:** “Warm rooms. Outside handles. The House's old rule is still being enforced here.”

**Recap:** “The House gives real care, but keeps the choice to leave for itself.” **Dependency:** scene delivery/recap; no optional clue prerequisite.

### MM17 C1 Known home

**Location/trigger:** Hall of Collars optional examination. **Duration:** 30 seconds. **Question:** did the House know some animals belonged elsewhere? **Evidence:** collar name tag, matching card marked KNOWN HOME, RETURN REFUSED: OUTSIDE CANNOT BE GUARANTEED SAFE. No player's pet is identified by this generic item. **Classification:** developed source concept, proposed precise evidence.

Narration: “A collar still has its name tag. The matching card reads KNOWN HOME. Below it: RETURN REFUSED. OUTSIDE CANNOT BE GUARANTEED SAFE.”

Maya, if present: “It didn't lose the information. It refused the answer.”

Otherwise narration: “The House knew there was a home. It chose its own rule instead.”

**Repeat/recap:** “Known homes were recorded, then overruled by the House's safety rule.” **Payoff/fallback:** B0 explicitly includes the same card if this clue was missed; no accusation about active pet's collar until verified personal arc.

### MM17 C2 The name that stayed

**Location/trigger:** Hall of Names examination. **Duration:** 35 seconds. **Question:** does letting an animal leave mean forgetting it? **Evidence:** name tile “Tansy”; beneath it “WENT HOME”; tile remains clean. Name is a proposed minor historical animal, no species, owner or tragic biography established.

Narration: “A little tile reads TANSY. Beneath it: WENT HOME. The tile has been cleaned as carefully as all the others.”

Lena, if present: “Gone home. Not gone from the wall.”

Otherwise narration: “The House can remember someone who is no longer inside it.”

**Repeat/recap:** “A name remains after its animal went home.” **Payoff:** Keeper can remember without possessing. **Fallback:** B0 shows an unnamed WENT HOME tile if C2 missed; specific name is optional and flagged for canon acceptance.

### MM17 C3 Two photographs

**Location/trigger:** Ancestral Gallery examination. **Duration:** 35 seconds. **Question:** did transformation erase the animal? **Evidence:** paired pictures labelled same name; ordinary animal then supernatural silhouette; same distinctive bowl and ear tilt, not proof of thoughts. No existing pet or Companion identity invented.

Narration: “Two pictures share a name. In one, a small animal tilts its head beside a crooked bowl. In the other, its outline glows. The head tilt and bowl are the same.”

Mateo, if present: “Changed. Still someone with a favourite bowl.”

Otherwise narration: “The pictures show change and continuity together.”

**Repeat/recap:** “The animal changed, but familiar habits remained.” **Classification:** developed transformation idea, new unnamed example. **Fallback:** B0 states transformed animals still have preferences; reunions demonstrate actual known pets rather than infer from silhouette.

### MM17 C4 The bricked gate

**Location/trigger:** Sanctuary Garden examination. **Duration:** 35 seconds. **Question:** was departure once possible? **Evidence:** weathered gate with handles on both sides, blocked by newer bricks; sign GOING HOME mostly covered. **Classification:** developed source environmental evidence. **Payoff:** sanctuary ending reopens genuine passage; no tragedy explanation.

Narration: “Behind newer bricks stands an old gate. It has a handle on each side. Two uncovered words remain above it: GOING HOME.”

Priya, if present: “It was built to let someone through. The wall came later.”

Otherwise narration: “The blocked gate was once a way out.”

**Repeat/recap:** “The House once allowed departures. It blocked that way later.” **Fallback:** B0 names the old gate if missed. Do not infer a date or cause from the bricks.

### MM17 C5 A letter that leaves a choice

**Location/trigger:** Memory Room Curiosity. **Duration:** 25 seconds. **Question:** can connection survive a departure? **Evidence:** unsigned card: THANK YOU FOR THE WARM BED. I WILL VISIT WHEN I CAN; no author identity. **Classification:** proposal, optional supporting testimony rather than proof all visitors return.

Narration: “A small card reads: THANK YOU FOR THE WARM BED. I WILL VISIT WHEN I CAN. It has been kept in a place where it will not get damp.”

Samir, if present: “A visit is a nice thing to offer. It isn't a debt.”

Otherwise narration: “The card offers a visit. It does not promise to stay.”

**Repeat/recap:** “Someone once offered to visit after leaving.” **Fallback:** optional only; ending does not promise every animal returns.

### MM17 B0 The Keeper and the evidence

**Location:** Heart Chamber. **Trigger:** before final boss. **Duration:** 60–80 seconds, manual pages. **Priority:** essential with 25-second recap. **Prerequisites:** actual Heart boss node; no pet, clue or Companion completion gate.

Narration: “The Keeper stands among the little doors. Its shape repeats the House's locks, warm windows and folded corners.”

Keeper: “I have room for everyone.”

Narration: “A clean care card hangs beside a collar: KNOWN HOME. RETURN REFUSED.”

Keeper: “I knew they had homes. I could not know they would always be safe there.”

Narration: “Above another door, an old tile reads WENT HOME. The name on it has not been erased.”

Keeper: “They left once. I remembered every one.”

Narration: “Farther back, bricks cover a gate marked GOING HOME.”

Keeper: “I made the rooms safer. I made the doors stronger. I stopped letting anyone leave.”

**Choose exactly one active Kid line using current focus, then lowest active seat if unavailable. These are story lines, not dialogue choices:**

- Maya: “You had the right names. You made the wrong rule.”
- Mateo: “You listened for danger. You stopped listening for ‘home.’”
- Amina: “They can need your help and still want to leave.”
- Eli: “You made the locks better. That didn't make locking them in better.”
- Priya: “The plan has to change when it stops helping them.”
- Jordan: “They can love you and still go with somebody else.”
- Lena: “You kept their names. You can keep them after goodbye.”
- Samir: “Nobody has to stop loving you to go home.”

**If no valid Kid metadata:** narration: “A safe room is still a locked room when someone wants to leave.”

Keeper: “Outside, I cannot keep every bad thing from happening.”

Narration: “The doors close around its fear.”

**Repeat before sanctuary:** Keeper: “The same fear. The same rule. I still don't know how to let go.” Then active Kid line above, followed by “The doors close around its fear.”

**Essential recap:** “The House is the Keeper. It helped animals, knew some had homes, and stopped letting them leave because it feared outside danger. Animals can change and still remain themselves. The old gate once opened; a name can remain after an animal goes home.”

**State:** bossMet; mark facts shown by full scene or recap, not optional clue completion. **Fallback:** use recap as a static intro if scene player absent. Root's ending owns rescue outcomes. No card mechanic is represented as an explicit moral choice.

### MM17 B1 Remembering

**Trigger/site:** `keeper.js` existing `i-remember-every-one-of-them` c.say. **Text:** Keeper: “I remember every one. I thought that meant keeping every one.” **Duration:** 6 seconds. **Mechanical dependency:** keep Arguments rule UI and all acceptance/rejection feedback intact. **Repeat:** once at actual transition. **Fallback:** existing “It remembers every one of them.” **State:** runPlayed only.

### MM17 B2 Please do not go

**Trigger/site:** `keeper.js` existing `please-dont-go` c.say. **Text:** Keeper: “Please don't go.” **Duration:** 3 seconds estimated; requires D-BARK and a revisitable transcript. **Direction:** no extra joke, accusation, rapid cuts or frightened-animal montage. **Fallback/recap:** retain existing event; no visible bark claimed. **State:** runPlayed only. This is a plea, not a required player promise.

### MM17 P The Keeper puts down the rule

**Trigger:** confirmed Keeper victory. **Duration:** 40 seconds. **Priority:** essential handoff to root's selected ending/reunion logic. **Consequences:** cease this encounter; no pet rescued flag here. **No automatic `N.sanctuary` write.**

Narration: “The Keeper's hands stop reaching for the locks. The House is quiet. It is still here.”

Keeper: “If I stop holding the doors… someone may leave.”

Narration: “One little door eases open. Nothing is pushed through it.”

Keeper: “Someone may stay.”

Narration: “The opening remains.”

Keeper: “I must let them answer.”

**Active Kid line:**

- Maya: “Yes. And listen when they do.”
- Mateo: “The whole answer. Even the part you weren't hoping for.”
- Amina: “Give them time.”
- Eli: “Leave the handle where they can reach it.”
- Priya: “We can start with one real choice.”
- Jordan: “We're here. We can help.”
- Lena: “An open door can be quiet.”
- Samir: “You can ask. You can't answer for them.”

**No valid Kid:** narration: “For once, the room waits for the animal.”

**Repeat pre-sanctuary:** “The Keeper lowers its hands. ‘Let them answer,’ it says. The door remains open.”

**Recap:** “The Keeper stops holding this door shut. The next scene must show an animal's actual choice; victory alone does not prove a pet has returned home.”

**Fallback:** recap before normal gameover screen, whose current random pet-home claim must not be reused as proof of persistent rescue. The implementation team must resolve that screen conflict before shipping this narrative.

### MM17 T The answer belongs to the animal

**Trigger:** after P, dispatch verified reunion or no-pet ending branch defined by the main package. **Exact bridge text:** “The way is open. Nobody calls it a choice until the animal can use it.” **Duration:** 7 seconds. **Read:** proposed verified pet eligibility, actual active Kid; `N.sanctuary`. **Write:** none beyond seen. **Fallback when no reunion eligibility exists:** “The Keeper has stopped this fight. The search for your pet continues.” **Skip/recap:** same as selected bridge. **Dependencies:** pet eligibility and persistent completion remain proposed; this file does not implement or infer them.

## Delivery and consistency checklist

All nine regions contain a complete foreshadowing unit, at least three finished exploration units, first boss encounter, actual-site battle line, postboss scene, transition, repeat and recap text. Each local resolution changes a distinct action: lending light; finishing a visit; changing a label; preserving a useful object; letting an occupant control privacy; offering comfort; preparing an empty bed; giving a direction instead of assigning a season; letting an animal answer. None claims an enemy died.

Battle flavor is subordinate to readable mechanical text. No flash, color, audio cue, timer or mandatory animated action carries exclusive plot information. If the user skips optional scenes and traverses any legal six-wing route, MM17 F and MM17 B0 still convey the essential premise and evidence. This reliability requires the proposed mandatory recap delivery; the current build has not been changed or tested for it.
