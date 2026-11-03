# Midnight Menagerie Companion scenes and endings

**Historical manuscript with later runtime replacement:** the follow-up authorizes implementation. All sixteen Companion sequences, eight pet arcs and the chosen sanctuary ending now have executable text and routing. Read [the exact runtime script](11-runtime-player-script.md) and [actual integration/state contract](10-runtime-integration.md) for the implemented edition; longer proposals below are preserved, not all claimed implemented.

## Companion delivery contract

The sixteen Companions are deck partners, not the eight missing pets. These scripts do not give them universal human speech, invented former owners or mandatory attachment to a child. Sources are their individual design chapters and the current roster; all exact behavior, dialogue and arc sequencing below is proposed writing.

Each numbered Companion has three separately stable units: **COMP-name-A**, **COMP-name-B**, **COMP-name-C**. The names in the headings are the ID suffixes in lowercase as printed. A is the liberation reaction; B is the optional Safe Room interaction; C is the post-sanctuary choice image. Each quoted caption is player-facing text. Visual fallback is that same caption over existing Companion art. No new animation is required to understand it.

| Unit | Trigger and read | Choice and write | Repeat, skip and fallback |
|---|---|---|---|
| A | Confirmed actual rescue result equals this slug; not the region's usual association. Marmalade A uses the opening join instead. Reads existing freed result; N.seen[A] proposed | Continue; writes seen only. Existing rescue code retains its actual effect; scene grants nothing | First 10–15 seconds; repeat “A familiar Companion is free to join another expedition.” Omit if no new rescue. Skip keeps accurate rescue name on existing screen |
| B | Active selected Companion, Safe Room action already resolved, A seen or Companion already unlocked. N.seen[B] | Optional “Spend a moment” or “Continue.” Narrative only; no extra Rest benefit, friendship points or combat status | First 15–25 seconds; automatic repeats suppressed; explicit reread shows the full vignette. Skip no facts. Without scheduler use prose on existing rest result |
| C | N.sanctuary, Companion verified available, explicit visit to proposed sanctuary/hub story panel | Continue; N.seen[C]. Observed temporary preference, never permanent departure from playable roster | 10–15 seconds; requires B delivered, or voluntarily present B first. Repeat on request only. Skip leaves availability intact. Without sanctuary state do not show C; retain B as existing-carrier alternative |

All reads/writes beyond current rescue facts are proposals. A does not equip the Companion mid-run, and C does not remove a playable Companion. No release announces an empty roster slot as a rescue. An unlocked Companion need not have A seen; B can introduce them without claiming who freed them. Animals can change their minds later. COMP-marmalade-A is an alternative to the opening join beat, never an automatic second introduction. Her starter availability is not a rescue count.

## 01 Marmalade

**COMP-marmalade-A.** Caption: “Marmalade walks through the shut little gate. Then she waits on the other side, looking back. When you approach, she moves beside you.” Caption: “She has made her own introduction.”

**COMP-marmalade-B.** Caption: “Marmalade chooses the smallest empty box. Her ghostly tail spills through one side. She looks at the larger cushion as if it has offered poor advice.” Optional selected kid line uses neutral narrator instead: “The cushion remains available. Marmalade remains in the box.”

**COMP-marmalade-C.** Caption: “Marmalade investigates a box outside the open gate. It is a better box. She settles into it, ghostly tail trailing toward the House.” Caption: “The cushion inside remains available.”

## 02 Wisp

**COMP-wisp-A.** Caption: “Wisp hovers beside the opening. A little glow gathers, fades, gathers again. Then Wisp drifts through, ready.”

**COMP-wisp-B.** Caption: “Wisp settles over a cold lamp. Nothing happens. A long quiet moment later, the lamp gives one gentle wink. Wisp bobs proudly.” Caption: “The lamp seems pleased with its small performance.” No timed wait or card resource change.

**COMP-wisp-C.** Caption: “Wisp floats out beneath the stars, then returns to the doorstep. The little lamp gives a gentle wink.” Caption: “Wisp pauses beside it. A welcome that can wait.”

## 03 Count Crumbula

ID suffix is **crumbula**, matching the current slug.

**COMP-crumbula-A.** Caption: “Count Crumbula steps through the opening, pauses, and smooths his tiny cape. Then he returns for the corner he has accidentally tucked beneath one foot.”

**COMP-crumbula-B.** Caption: “Crumbula arranges a clean napkin as if expecting an enormous banquet. He sits upon it instead, a very small guest at a very small picnic.” Caption: “The napkin is exactly the right size for his importance.” No hunger harm or pressure to spend a Snack.

**COMP-crumbula-C.** Caption: “Crumbula carries his napkin outside and unfolds it beneath a tree. He pats the empty corner beside him.” Caption: “A very small picnic has acquired a guest space.”

## 04 Boggle

**COMP-boggle-A.** Caption: “Boggle peeks from behind the open gate. Then from beside it. Then from underneath it, which is impressive because it no longer touches the floor.”

**COMP-boggle-B.** Caption: “A blanket rises in a suspiciously Boggle-shaped lump. Beside it lies a cushion in an even more suspiciously Boggle-shaped lump.” Caption: “The real Boggle is under the chair, admiring the arrangement.”

**COMP-boggle-C.** Caption: “Two suspicious cushion lumps rest beside the open gate. Boggle peeks from behind a garden pot instead.” Caption: “New hiding places. The same right to choose when to appear.”

## 05 Bones

**COMP-bones-A.** Caption: “Bones bounds through the opening. A loose tail bone stays behind. He notices, trots back and proudly fetches it himself.”

**COMP-bones-B.** Caption: “Bones buries a little stick beneath a folded blanket. He pats the blanket flat, then looks around for someone who might enjoy discovering it.” Caption: “The stick is sticking out.” No assumption that an ordinary dog died; separation is his established supernatural physical comedy.

**COMP-bones-C.** Caption: “Bones takes his stick outside. A moment later, he returns and places it just inside the gate.” Caption: “A very convenient halfway spot.”

## 06 Pipkin

**COMP-pipkin-A.** Caption: “Pipkin hops through the opening, lands, and turns to inspect the distance. One more tiny hop. Now it counts.”

**COMP-pipkin-B.** Caption: “Pipkin settles beside a small pumpkin. He looks at it. It looks like a pumpkin. He shifts to look from the other side.” Caption: “Still a pumpkin. Excellent work.”

**COMP-pipkin-C.** Caption: “Pipkin chooses a garden patch with a clear path to the gate. He settles into it like a very pleased vegetable.” Caption: “He can leave his patch whenever he likes.”

## 07 Taffy

**COMP-taffy-A.** Caption: “Taffy squeezes through the opening and gathers herself on the other side. One trailing bit catches up with a soft plop.”

**COMP-taffy-B.** Caption: “Taffy tries a round cushion, becomes round, then tries a square cushion. After some consideration, she becomes a shape neither cushion expected.” Caption: “Comfort has improved.”

**COMP-taffy-C.** Caption: “Taffy crosses the open threshold and settles between a round cushion and a square one. Neither determines her shape.” Caption: “She makes herself comfortable.” Do not depict a harmful tear or assume an ordinary former species.

## 08 Truffle

**COMP-truffle-A.** Caption: “Truffle nudges a fallen leaf through the opening before following it. One small traveler, one extremely well-escorted leaf.”

**COMP-truffle-B.** Caption: “Truffle noses a little heap of leaves into a nest. A single leaf refuses to lie flat. He tries another angle. The leaf finally settles.” Caption: “A difficult tenant, comfortably housed.”

**COMP-truffle-C.** Caption: “Truffle carries the awkward leaf into a garden nest. This time he leaves one edge standing up.” Caption: “A little shade for his nose. The gate stays open behind him.” No body-disgust jokes or death biography.

## 09 Hush

**COMP-hush-A.** Caption: “An open gate. A moving shadow. Then Hush is beside you, looking back at the gate as if waiting for it to catch up.”

**COMP-hush-B.** Caption: “Hush disappears beneath a chair's shadow. A curious nose emerges under the next chair. He retreats, then reappears at the first.” Caption: “A thorough inspection of places not to be seen.”

**COMP-hush-C.** Caption: “Hush slips from a chair's shadow to the garden bench's shadow. His nose appears, then disappears.” Caption: “More places to choose. No demand to remain visible.”

## 10 Mopsy

**COMP-mopsy-A.** Caption: “Mopsy touches the open gate with one soft paw. Then she steps through and straightens a loose corner of her patchwork.”

**COMP-mopsy-B.** Caption: “Mopsy studies a cushion with a crooked patch. She carefully turns the whole cushion until the patch looks straight.” Caption: “The cushion is now sideways. Mopsy is satisfied.”

**COMP-mopsy-C.** Caption: “Mopsy takes the crooked-patched cushion to a window seat near the open gate. She settles sideways beside it and pats the empty space.” Caption: “An invitation, not an assignment.” Mopsy is a living stuffed rabbit; do not invent a former biological rabbit.

## 11 Drizzle

**COMP-drizzle-A.** Caption: “Drizzle floats through the opening. A little drop lands on the threshold. Another follows. She pauses, as though checking whether clouds are welcome too.” Caption: “The opening stays open.”

**COMP-drizzle-B.** Caption: “A closed umbrella leans beside Drizzle. She circles it curiously. One drop lands on the handle.” Caption: “The umbrella has been watered. It does not grow.”

**COMP-drizzle-C.** Caption: “Drizzle floats into the garden rain. The umbrella stays by the door for anyone who wants it.” Caption: “When she returns, nobody asks her to stop being a cloud.” No instruction that sadness must be cured or cheerful weather earned.

## 12 Pudding

**COMP-pudding-A.** Caption: “Pudding stands beside the opening, checks that everyone has room, and gives a small satisfied snort. Then he remembers he can use it too.”

**COMP-pudding-B.** Caption: “Pudding guards a cushion. His head droops. He sits up. His head droops again. At last he lies down with one paw still touching his extremely safe cushion.” Caption: “The cushion survives the nap.”

**COMP-pudding-C.** Caption: “Pudding brings the cushion to a garden resting place. Another resident passes the open gate. He watches, then puts his head back down.” Caption: “The cushion is safe without a night watch.”

## 13 Wink

**COMP-wink-A.** Caption: “Wink examines the opening from above, below and sideways. Then the little spider steps through it.” Caption: “A doorway with several excellent views.”

**COMP-wink-B.** Caption: “Wink inspects a small mirror. The reflection inspects Wink. The mirror receives a second inspection from the back.” Caption: “There is no second spider.”

**COMP-wink-C.** Caption: “Wink finds a puddle outside and examines the reflected spider. Then the reflected sky.” Caption: “There is much more to look at when the way outside is open.” No surveillance power granted to the player.

## 14 Crinkle

**COMP-crinkle-A.** Caption: “Crinkle unfolds through the opening and ruffles his paper edges. A little notice brushes his wing. He carefully brushes it back.”

**COMP-crinkle-B.** Caption: “A scrap labeled PLEASE FILE YOURSELF drifts toward Crinkle. He folds its corner into a firm little arrow pointing away.” Caption: “The scrap has received directions.”

**COMP-crinkle-C.** Caption: “Crinkle unfolds the rejected filing notice into a little arrow beside the gate. It points outside. He folds another pointing in.” Caption: “Useful directions at last.” No new text-reading ability required for mechanics.

## 15 Mossbit

**COMP-mossbit-A.** Caption: “Mossbit crosses the opening at his own pace. Nobody closes it while he is still choosing his next step.”

**COMP-mossbit-B.** Caption: “Mossbit rests beside an hourglass. The sand finishes. He remains comfortable.” Caption: “The hourglass has completed its task. Mossbit has not been assigned one.” No countdown challenge or joke at slow movement's expense.

**COMP-mossbit-C.** Caption: “Mossbit pauses halfway along the garden path. The hourglass inside finishes again.” Caption: “The gate stays open. Sand is not in charge of the journey.” Mossbit is alive; the shell does not establish a death story.

## 16 Brambleboo

**COMP-brambleboo-A.** Caption: “Brambleboo extends a leaf through the opening, then follows with the rest of himself. The leaf brushes the gate once on the way past.”

**COMP-brambleboo-B.** Caption: “Brambleboo leans toward a patch of light. A cushion shifts into his way. He leans around it. The cushion has become a very small landscape feature.”

**COMP-brambleboo-C.** Caption: “Brambleboo finds a sunny patch outside. He leans toward it, then moves his whole pot into the light.” Caption: “There is room to do that now. The path remains clear.” Staying is observed today, not a permanent player-issued command.

## Child relationships

PAIR units are optional Safe Room prose after the actual rest choice, requiring both named active kids. Their exchange is an authored conversation, not a vote or selection by either player. Each has 25–35 seconds of text, captioned actions, Continue and skip with no consequence. Read/write N.seen[id]; no stat changes. B requires A seen by both participating profiles and both kids still present. If either has not seen A, present A instead or use the solo line; do not make a callback to an unheard conversation. No combat interruptions. Repeat suppressed unless reread. Fallback solo lines require only the named selected kid and are printed below.

**PAIR-MAYA-MATEO-A.** Mateo: “The doors move when we stop looking. Maybe the whole house is shy.” Maya: “Maybe. How do we check?” Caption: “Mateo marks a door on a scrap of paper.” Mateo: “I was hoping you'd say ‘brilliant theory.’” Maya: “Brilliant pencil.” Mateo: “I'll take it.” Solo Maya: “I'll mark this door. Then I'll know if it moves.” Solo Mateo: “A theory needs a check. And a pencil with a point.”

**PAIR-MAYA-MATEO-B.** Caption: “Mateo shows Maya two different door sketches.” Mateo: “It moved. Still no proof it's shy.” Maya: “Good finding.” Mateo: “The pencil would like some credit.” Maya: “Excellent pencil.” Concrete consequence: mutual respect in dialogue only; the sketches are proposed scene props, not a map update.

**PAIR-AMINA-JORDAN-A.** Jordan: “I'll check the passage, carry the bags, and—” Amina: “Sit with me for a minute?” Jordan: “Is that helping?” Caption: “Amina moves her bag off the other end of the bench.” Amina: “Yes.” Caption: “Jordan sits.” Solo Jordan: “I can sit for a minute. Helping will still be there.” Solo Amina: “There's room here. No one has to earn a rest.”

**PAIR-AMINA-JORDAN-B.** Caption: “Jordan sits first and pats the empty end of the bench.” Jordan: “Very important job available.” Amina: “Sitting?” Jordan: “Experienced applicants preferred.” Caption: “Amina joins him.” No extra healing or suggestion that only a virtuous rest grants benefits.

**PAIR-ELI-PRIYA-A.** Eli: “I can open that box.” Priya: “We don't know what's in it.” Eli: “That's why boxes are exciting.” Caption: “Priya turns it around. The back is already open.” Priya: “Information.” Eli: “Also exciting.” Solo Eli: “Before I open the box, I'll check whether it already is.” Solo Priya: “A look around the back counts as a plan.”

**PAIR-ELI-PRIYA-B.** Caption: “Eli holds up a closed box and checks behind it.” Eli: “Learning.” Priya: “What's inside?” Caption: “Eli opens the lid. A smaller closed box rests within.” Eli: “Further learning.” No tool gate or loot.

**PAIR-LENA-SAMIR-A.** Samir: “Would you like me to introduce us to the chair?” Lena: “Wait.” Caption: “The chair turns away from the draft.” Lena: “It wanted the warm spot.” Samir: “Good evening, chair. Excellent choice of spot.” Solo Lena: “Sometimes you can wait for the answer.” Solo Samir: “I'll say hello after the chair settles.”

**PAIR-LENA-SAMIR-B.** Caption: “Samir waits while a footstool shifts beside the chair.” Lena: “Now.” Samir: “Good evening. I see you've invited a guest.” Caption: “Lena smiles.” No invented chair biography; animation can be text-only.

## Heart essential evidence

**HEART-EVIDENCE.** Essential. Location: Heart entry before Ward and Keeper. Trigger: current Heart, present-day expedition, not N.runPlayed[HEART-EVIDENCE]. Reads N.clues and N.sanctuary; writes only N.seen and N.runPlayed plus evidence IDs actually shown. Full 35–45 seconds. Existing-carrier alternative: a prose event before final boss; requires guaranteed scheduling, otherwise do not claim delivery.

Caption: “A recovery photograph shows an animal resting beneath a blanket. A second photograph shows the same animal standing steadily. Both carry careful notes about food and warmth.”

Caption: “Beside them is a departure card. HOME KNOWN. READY TO LEAVE. Across both lines is a newer stamp: RELEASE REFUSED.”

House writing: “OUTSIDE, I CANNOT KEEP EVERYONE SAFE.”

Caption: “The same writing runs from the card into the walls, then gathers around the Keeper's shape.”

Keeper: “I am the part of this House that holds the doors shut.”

Neutral child-independent narrator: “The care was real. So was the refusal to let animals leave.”

Always include this short essential card, whether personal scenes are full, skipped or absent: Caption: “Two pictures show the same cat and white chest patch. In the newer picture, its shadow reaches around a corner. The name under both is unchanged.” No exact history is assigned to a Companion; this unnamed pictured animal is proposed evidence, not a newly named historical character.

If care/refusal clues already seen, shortened exact version: “The Heart keeps records of care and blocked departures. The Keeper gathers from the same writing in the walls.” Keeper: “I am the part of this House that holds the doors shut.”

Skip recap, always displayed in two short cards: “The House cared for animals and stopped them leaving. The Keeper is its protective instinct, holding the doors shut.” Then: “The pictures show the same animal before and after a new shadow ability. A changed animal can still be themselves.” Facts: current record, House claim, observed connection. No invented cause or founder. No choice/penalty. Door explanation is not permission to assume every in-world caretaker is malicious.

**HEART-ALREADY-HOME.** Essential branch when every active child's N.pet is home, before Keeper, 10–15 seconds. Caption: “Your pets are safe at home. Other residents are still being kept inside. This visit is for them.” If mixed party, per-home child optional helping line from section 06; main Ward queue contains only unknown/found pets. No present pet is summoned back from home.

## Keeper aftermath and ending variation contract

The region 17 package owns encounter and combat dialogue. Its confirmed-victory handoff invokes the END units below. They replace any contradictory generic pet-home result; engineering must use committed per-kid state. The existing random gameover pet claim is not usable evidence. Keeper defeat is nonlethal. All ending text is proposed; no asset/animation or save writer has been added.

**END-01 — The door without a demand.** Essential immediately after confirmed Keeper victory, before rewards/achievement interruptions. Read active pets found/home, N.sanctuary; found pets can exit, unknown pets do not silently become home. 35–45 seconds in three pages. Caption: “The Keeper comes apart into doors, blankets, frames and soft light. Nothing cries out. The room grows still.” Keeper, quieter: “If they leave, I won't know they are safe.” Caption: “The exit opens. Beyond it is the way outside.” Narrator: “The opening does not ask for a promise, a payment or another Scuffle.” [Quiet page.] Caption: “The found pets approach their children. Together they cross the threshold.” Exact recap: “The Keeper has stopped holding this exit shut. The found pets leave safely with their children. The House survives.” Choices: “Continue” or “Stay a moment” (same outcome, adds Caption: “For a moment, the open doorway is enough.”). No forced forgiveness. Proposed transaction commits home only for successfully found active pets after this outcome. If none found, replace last caption with “Several resident animals approach the open exit. Those who want to leave can cross.” Recap then “The exit is open. Residents can leave. Your already-home pets remain safe at home.” Do not commit missing absent pets.

**END-02 — The first homeward journey.** Essential followup if at least one home state was newly committed and sanctuary not established. 20–30 seconds. Caption: “Outside, the night smells of wet leaves and familiar streets. The newly reunited pets walk beside their children.” Caption: “Behind them, the mansion still has lit windows. Other animals remain inside.” UI: “This reunion is saved. Future expeditions can help the animals still inside.” Recap: “These pets are home. The rest of the search continues.” Follow with individual H vignettes at the hub, not all eight unless all eight were actually reunited. Before persistence exists the UI sentence must be omitted and the whole scene remains a proposed script, not shipped reassurance.

**END-03 — Trying an open gate.** Optional conversation after END-01; the player can choose “Head home” and still receive END-02. Choosing “Talk at the open gate” starts this scene. Gate remains open in both branches; no animal stays hostage to the conversation. Any selected kid's line is supplied below; 40–55 seconds. State: proposed N.seen[END-03], no sanctuary until END-04 demonstration completes. Current-system fallback: one prose ending page, not a branching claim.

Keeper: “I have beds. I have food. I know how to care for them.”

Selected kid response:

- Maya: “Keep the beds. Leave the way out.”
- Mateo: “Listen to the answer after you invite them.”
- Amina: “A safe place can have an open door.”
- Eli: “An exit needs to go somewhere else.”
- Priya: “You can keep caring. The plan needs a way out.”
- Jordan: “They can help here without staying forever.”
- Lena: “They can go. You can still remember them.”
- Samir: “You don't stop being friends at the gate.”

Keeper: “And if they want to come back?”

Narrator: “The gate is still open. A small resident waits beside a comfortable bed, watching the way outside.”

Visible choice: “Watch them try the open gate.” Response Keeper: “I will wait.” This does not translate the animal's choice or require forgiveness. Alternative “Head home” leaves the gate physically open now, defers the sanctuary conversation and invokes END-02. A later hub story visit may offer END-03 again; it is not another required boss victory. Recap: “The House can offer care without deciding where an animal must live.”

**END-04 — Stay, leave, return.** Essential if END-03 trial accepted, 35–45 seconds; three still captions, optional animation. Caption: “One resident settles onto the bed beside the gate. Another steps outside. The House does not reach after either.” [Player advances.] Caption: “The animal outside sniffs the garden, explores a little, then comes back through the same opening.” [Player advances.] Caption: “A clean bowl is waiting. The gate stays open.” Keeper: “Welcome back.” Selected kid, only if Samir present: “That's a good welcome.” Otherwise narrator: “A welcome with a way out.” Exact recap: “One animal stays beside an open gate. Another walks outside, then comes back through. The gate stays open. Animals may stay, leave and return.” Proposed N.sanctuary becomes true only when the demonstration or full factual recap is delivered and save succeeds. This is a selected possible resolution, not already final canon. It establishes the rule, not that every resident's every need has instantly been solved.

**END-05 — A smaller problem.** Optional comedy tag after END-04, 15–20 seconds. Caption: “The Butler arrives with a welcome mat. He places it facing inward, hesitates, and turns it outward.” Butler: “Which side is the welcoming side?” Caption: “A resident crosses it, turns around and crosses back.” Butler: “Ah.” Caption: “He places a second welcome mat beside the first.” Recap: “Both directions are welcome.” Requires Butler presence at threshold as a proposed staging cameo, not party membership or defeated-state claim. If cameo unsupported, omit; nothing essential lost. Never follow this with a secretly closing gate sting.

**END-06 — All eight home.** Optional hub milestone after all eight individual home states are verified, independent of all-sixteen-Companions completion. 25–35 seconds. Caption: “Eight pictures fill the home board: Orbit, Pepper, Mochi, Sprocket, Pixel, Scout, Mooncake and Bean. Beside each is a new picture, taken after the journey home.” Caption: “Some shadows look unusual. A square of light shines where no lamp stands. Every name is still the same.” Narrator: “All eight missing pets are home. There are still places to explore and friends to visit.” No all-kid spoken ensemble required. Skip same last sentence. Mark N.seen[END-06], never grant absent home states to make the scene happen.

**END-07 — Sixteen available Companions.** Optional roster milestone, when every current roster slug is in the verified available set (starter plus actual persistent rescues), sanctuary may be false. This is an availability milestone, not sixteen newly performed rescues. `ui/portrait.js` expressly distinguishes availableCompanions from freedCompanions; do not falsify the freed counter. 15–20 seconds. Caption: “Sixteen Companion portraits fill the board. Every one can join another expedition.” If sanctuary false, narrator: “The House still needs to learn how to welcome without keeping.” If true, narrator: “Some visit the garden. Some explore outside. Every invitation can be answered again.” No claim all eight pets are home. Choice Continue only; repeat reread. Writes seen only. Companions remain playable regardless of displayed temporary preference.

**END-08 — Remembered expeditions.** Proposed explicit post-sanctuary selection wrapper, not an implemented mode. Location: expedition entry. UI: “Revisit an earlier expedition.” Caption: “The notebook opens to the House as it was, before the gate stayed open. Reunions in the present are not undone.” Choice “Begin remembered expedition” or “Back.” Only the first opts into replay; set proposed N.runMemory=true for the run. Exit/result caption: “The remembered expedition is over. The open gate and your homeward journeys remain.” This mode uses existing combat rules without inventing new balance; present-day rescue counters do not double award. Rewards/unlocks compatibility must be decided in engineering, not asserted here. END-10 supplies the separate present-day route for unfinished searches; memories never gate it. If these wrappers cannot be implemented, defer global sanctuary persistence and use the individual expedition ending instead of silently relocking a repaired House.

**END-10 — A visit in the present.** Essential available route once N.sanctuary=true, regardless of pet or Companion completion. Proposed hub button: “Visit the open House.” Caption: “The gate is open today. Choose whose search to continue, or visit a friend.” Choices: existing Kid portraits with each profile's actual pet status, “Visit a Companion,” “Back.” No combat, admission cost, new reward or Haunt requirement. This is a new narrative visit screen, not a rebalanced expedition. Choosing an unknown kid dispatches that kid's complete PET-kid-S script in section 06; found dispatches its exact return variant. No old R/F line or House objection is reused. Old evidence is optional and explicitly headed “An old record, before the gate opened.” Found/home states remain per profile. Home selection uses H only on request and never restages a first reunion.

**END-10A — Going home through the open gate.** Essential immediately after a present-day PET-S full/return variant, 15–20 seconds. Caption: “The pet approaches the child. Together they cross the open threshold into the garden. No lock follows them.” Keeper writing beside the gate: “WELCOME BACK WHENEVER YOU WISH.” Narrator: “The way home is open.” Continue commits home for this delivered reunion after save confirmation, then that kid's H. Skip uses the same factual recap: “The pet has left the House with their child and can return freely.” If saving fails, keep the result pending and use SAVE-RETRY from section 08; do not claim saved completion. This route lets the remaining seven searches finish after an early sanctuary ending without granting unseen reunions or requiring another hostile present-day run.

**END-10B — Meeting a Companion in the open House.** Proposed roster visit after sanctuary. Show only the chosen roster creature's portrait and COMP-A text if never available, with opening/gate language already open; continue records a newly accepted Companion invitation through a proposed integration hook, then permits B/C. Exact invitation caption: “There is room to come closer and room to stay where you are. The Companion approaches, then settles nearby.” This is authored animal behavior, not a player command. It makes previously unavailable Companions available for remembered expeditions; the integration must record it as a new present-day joining event, not fabricate an old boss rescue. No mechanic, new deck or resource is invented; it uses the existing roster. If joining persistence is not supported, suppress this option and defer sanctuary persistence. Completion remains optional.

Ending dispatch correction: END-01 none-found branches are separate. If all active pets are home, use its already-home recap. If any remain unknown or a reunion transaction is pending, use “The exit is open. Residents can leave. A pet reunion is recorded only when it has been completed.” Do not claim that unknown pets are home. END-03 “Head home” invokes END-02 only with newly committed home state and no sanctuary; otherwise close with “Return to the Clubhouse.” After sanctuary, END-10 handles present-day visits and END-08 handles remembered combat. They are visibly distinct choices.

**END-09 — No forgiveness required.** Optional post-sanctuary hub thought, one selected kid, 10 seconds. Maya: “The door is open. I'll check it again next time.” Mateo: “I'll keep listening.” Amina: “It can take time to feel safe here.” Eli: “A working exit. I like that.” Priya: “We'll see how the new plan works.” Jordan: “Helping gets easier when someone else helps too.” Lena: “Open. Still open.” Samir: “We can be glad things changed and still remember what happened.” Continue/skip no state except seen. No choice certifies the House morally perfect; all are acknowledgment, not imposed absolution.

## Resident and service dialogue

SERVICE units are optional wrappers for existing screens, not new services. Read actual current screen and transaction outcome; existing buttons, prices, effects and eligibility remain authoritative. No additional purchase, free item, healing or upgrade is implied. First line on first visit; repeat line thereafter using proposed N.seen and one-per-room N.runPlayed. Continue/skip closes prose; it does not buy or choose. All are 5–15 seconds, captionable with existing art, no new resident biography. Fallback is the single repeat sentence on the existing screen. No joke plays during a pet reunion or save error.

**SERVICE-MOTH-ENTER.** Mr. Moth's; before browsing. Mr. Moth: “Welcome! Prices on the labels. Mysterious stains on the labels are free.” Repeat: “Have a look. Looking is still free.” Motivation: proud useful merchant, distractible about light, never uses captivity to upsell.

**SERVICE-MOTH-BUY.** Only after an actual successful purchase. Mr. Moth: “Excellent choice. I considered keeping it, but that is a terrible way to run a shop.” Repeat: “All yours.” No statement that an unavailable item was purchased. Insufficient-Buttons UI stays mechanical and unmocking; no comedy contingent on failed purchase.

**SERVICE-MOTH-LEAVE.** Any departure, including no purchase. Mr. Moth: “Come back whenever you like. That's an invitation. I'm practicing the difference.” Repeat: “The door works both ways.” This refers only to shop doorway, not the mansion exit; omit line if level staging cannot maintain that distinction.

**SERVICE-REST-ENTER.** Safe Room before the player chooses its actual action. Caption: “A cushion fluffs itself, then notices how much fluff is already present and stops.” Narrator: “A quiet place to think.” Repeat: “The room can wait while you choose.” Do not say rested/healed before the action occurs.

**SERVICE-REST-DONE.** After an actual rest-screen choice finishes, whichever supported choice was taken. Caption: “The little lamp tilts toward the map. A cushion remains comfortably busy being a cushion.” Repeat: “Ready when you are.” No universal healing claim; upgrade/other choices are not relabeled Rest.

**SERVICE-REWARD.** Actual reward screen before selection. Caption: “A little tray presents the choices, then tries very hard not to look proud of itself.” Narrator: “Read what is offered. Take only what suits this expedition.” Repeat: “The tray will wait.” The actual available take/skip choices remain unchanged; no promise every reward may be skipped if a particular screen requires selection.

**SERVICE-CLUBHOUSE.** Hub entry, no pet status assumed. Caption: “The map has acquired another curl at the corner. Someone has weighted it with a thoroughly ordinary mug.” Narrator: “A place to prepare for what comes next.” Repeat: “The map is here when you're ready.” Additional actual progress counts use saved data only; no “everyone made it home” default.

**SERVICE-RETURN-MOTH.** Optional sanctuary visit cameo, N.sanctuary only. Mr. Moth: “I've ordered a sign saying VISITORS WELCOME. Very clear.” Caption: “He turns the sign around. The back says VISITORS ALSO WELCOME.” Mr. Moth: “We had a long meeting.” No new shop access/reward; repeat suppressed. If cameo staging unavailable, omit. This echo of the Butler's mat is optional and must not play in the same visit as END-05; choose one, not both.

## Current build result alternative

**END-CURRENT.** Usable writing for current result screen after actual victory, before pet-persistence work. Narrator: “You reached the Heart and cleared this expedition. The route you walked and the Companions you freed are part of your progress.” UI: “Return to the Clubhouse.” This uses only existing recorded run/Companion facts, does not randomly announce a pet home, and does not claim sanctuary is implemented. Defeat variant: “This expedition has ended. Return to the Clubhouse when you're ready.” Specific numeric summaries must still come from actual run data. This is a proposed replacement of text and false fallback behavior, not a code change performed by this commission.




