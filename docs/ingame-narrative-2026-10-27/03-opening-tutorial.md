# Midnight Menagerie opening and tutorial

## Implementation update — 28 October 2026

The later user instruction authorized implementation. The source diagnosis below records the original audited build; it does not describe the revised files as still broken. Implemented in `game/src/scenes/tutorial.js`, `game/src/ui/coach.js`, and `game/src/ui/scuffle-help.js`:

- Opening OPN-010–080 now uses the finished eight Kid variants, eight-pet premise, welcome-mat and interrupted-paw jokes, nonfatal Dust Bunny retreat, voluntary partnership, and honest fresh-expedition handoff. The existing painted selection board remains; its accessible label carries OPN-001's count/instruction, while its painted heading and live dossier provide the visual choosing path. Kid preview pet traces now agree with the selected Kid's story. No unselected Kid is inferred on skip or invalid deep links.
- OPN-051 is displayed on a genuine retry return. Skip retains ordinary selection. Root integration owns the essential skipped-opening recap. Completing the full opening now marks its search orientation delivered; skipping does not. This avoids a second search explanation immediately after the full opening without removing the Foyer arrival scene.
- Marmalade’s collar tag is visible in OPN-040 before the first Scuffle; post-battle OPN-070 instead shows her returning to sit beside the Kid. Coach portrait text uses **Your Companion** during the opening, without contradicting the named HUD or Help.
- The live coach is the six-beat adaptation TUT-001, TUT-002, TUT-002B, TUT-003, TUT-070, TUT-090. Defense and cost are introduced before the first requested play. Detailed Haunt, Lives, keyboard, piles, and controller explanations moved to an eleven-topic **Help** dialog with three direct topic groups, available from coaching and exported for the persistent game Help entry. Text is self-paced and does not require optional jokes to understand the rules.
- TUT-003 succeeds on an actual `card:play`, or moves on when the player deliberately ends a turn. No card or target is forced. The actual `turn:end` listener filters player events. Actions performed ahead of coaching are remembered for this mounted coach; stale waits are skipped. This is transient presentation state, not saved learning progress.
- Coach Enter is captured before the hand can play a Trick; focused buttons retain their native action. Coach Escape dismisses coaching only. Help uses the real modal focus trap, prevents forwarded controller input from operating combat, and closes on `scene:leaving`. Down remains the taught card-cancel key.
- No new combat rules, random-hand guarantees, pet rescue flags, rewards or run persistence were added by these files. The battle is still the real `foyer-1` encounter. Detailed SYS overlays outside the opening remain authored content unless the root integration explicitly implements them.

The real-browser seam suite is `tests/tutorial-narrative/run.py`; its final results and visual review are recorded in `reviews/tutorial/implementation-review.md`. Automated input checks and screenshot inspection are not children’s playtesting or a measured proof of comprehension. Controller wording is generic; physical-controller usability remains untested.


Status: finished proposed copy, source-audited on 27 October 2026; revised through two substantive editorial rounds; not installed or playtested. This package replaces the opening and teaches the existing deckbuilding game. It does not introduce walking controls, pet combat, friendship meters, timed escapes, or a scripted combat hand.

## Source diagnosis

`game/src/scenes/tutorial.js` contains a Kid picker, six pre-fight prose beats, one real Dust Bunny fight, and three closing beats. `ui/coach.js` adds eight instruction cards over ordinary combat. `scenes/combat.js:2876` returns prologue victory to `tutorial:after` and defeat to `tutorial:fight`; the prologue has no Run. `tutorial.js:799` starts the actual expedition with Marmalade, the chosen Kid, Haunt 0 and the Kid's loadout. The tutorial battle does not award an expedition victory or rescue a pet.

`shouldPlayOpening()` suppresses the opening when `freedCompanions().size > 0` or `Save.data.seenTutorials` includes `opening`. Both completing and skipping the opening record that existing flag. Skipping routes to selection, retaining a selected Kid if present; it does not silently choose one. There is no ordinary replay-tutorial menu entry in the inspected title, Clubhouse or Settings files. The debug scene route is not a player-facing revisit feature.

Current problems: the opening says seven pets; gives an unsupported exact fifty-year age to Marmalade's tag; describes transformed animals as having stopped being pets; and ends on transformation panic. The coach says unspent Nerve is wasted, although useful play depends on the board and some Tricks have costs beyond Nerve. It defines Courage confusingly as remaining fright. It delays defense teaching until after a play, gives no keyboard-targeting lesson, and promises Marmalade will handle the rest. None of those claims belongs in the replacement.

The coach accepts `text`, a spotlight selector, optional action-event wait, predicate, delay and hint. It has Next and Skip, but no Back, help library, inactivity timer, conditional lesson resolver or durable per-lesson completion record. Combat remains live beneath it. Both coach and hand listen for Enter; input arbitration must be checked before shipping. Arrow Up can commit a selected Trick without also activating the coach's Enter shortcut. Escape may cancel a selection, dismiss the coach and open Settings through separate listeners; do not teach it as a safe single-purpose cancel while the coach is present.

Display audit is source inspection, not a screenshot verification: `tutorial.css` uses a fixed stage, hidden root overflow and responsive prose; `coach.css` sets text to at least 15px with line-height 1.44. A safe authored target is 45 words per story page and 32 per coach card, with controls on a separate short card. This is a writing budget, not a measured capacity. Verify at 1280×800 and 1920×1080, large text, keyboard and gamepad before implementation approval. Never shrink text to force a fit; split pages.

## Record contract

Every ID below is a narrative unit. Shared metadata here applies to each unit unless its record overrides it. Canon: new proposed wording implementing the current brief; established facts are identified in the source diagnosis and source ledger. Speakers: neutral instructional narrator and the selected Kid; Marmalade communicates through visible behavior, not new spoken language. Visual directions are optional captioned descriptions using existing portraits and backgrounds; a new pose or animation is not a delivery dependency. Choices are only the listed UI actions, never inferred emotional commitments. No unit records an invented player choice.

Story units OPN use the existing tutorial page system: location curb, threshold or Foyer as specified; trigger previous page advanced, prerequisite selected Kid after OPN-001; state reads `ctx.tutorial.kid`, page index and opening completion; only final completion/skip changes `seenTutorials.opening`. First only by existing opening routing. Each page advances manually with **Go on**; full opening skip uses existing **Skip** route. Proposed recap OPN-099 must be available on the selection/map route before first play when prose is skipped. Existing-system fallback: put its text in the first Foyer arrival text and selection description; no cutscene need be watched. Per-page repeat is identical if reopening help; no automatic repeat in later expeditions. Reading estimates assume about 100 words/minute and exclude decisions; no text auto-advances.

TUT units use the battle Coach: location Entry Hall prologue, trigger listed below, prerequisite battle active and selected Kid with Marmalade. Read only current actor, hand, target, intent, Courage, Guard, Nerve and combat events. No changes to combat rules, cards, targets or rewards. Proposed presentation-only `N.runPlayed[TUT-ID]` prevents stale action waits. During the prologue this lives in transient tutorial context, because there is no Run yet; do not create or serialize a fake expedition. These N fields are not existing state. The opening coach is solo-only. Reusing it in a party requires explicit coached actor and seat filtering; party tutorials remain SYS-090. First coached battle only; skip dismisses coaching and leaves battle playable. Recap is TUT-090. All hints are offered after player request, not a countdown. Proposed success captions last until acknowledged or are merged into the next instruction; they never stall combat. Existing-system fallback is the compact eight-card sequence at the end of this chapter.

SYS units use an existing screen's explanatory text/tooltip where possible; new first-visit overlays and durable `seenTutorials` entries are engineering proposals. Read the current screen's actual eligibility, prices and effects; never hardcode a displayed amount when the run can change it. Their actions retain existing consequences. Repeat version is the help text, available on request; proposed cooldown is once per system per profile, reset only through an explicit tutorial preference. Without that support, use static instructional text on the relevant screen. Recap equals instruction. Optional humor never carries essential rules.

## Opening

### OPN-001 Choose whose search begins

Location: Kid selection board. Trigger: new opening; prerequisites none. Goal/action/success: choose a Kid, confirm that Kid; success is `this.kid` set. Instruction: **“Eight kids. Eight missing pets. Whose search will you begin?”** Supporting line: **“Your Kid brings a Backpack. Your Companion brings the Tricks.”** Button: **“Begin the search”**. Hint: **“Choose a portrait, then begin.”** No default Kid is described as chosen. Visual: existing eight portraits and pet photographs. Estimate 15 seconds plus choice. Fallback: ordinary selection if opening skipped. State writes only the existing tutorial Kid selection.

### OPN-010 Maya and Orbit

Selected Kid Maya; others OPN-011–017 mutually exclusive. Location: curb; speaker Maya; portrait Maya, existing pet photograph if supported; otherwise text only. 20 seconds.

**Maya:** “Orbit's collar was outside the mansion. Orbit wasn't.”

**Maya:** “He scratches three times when he wants a door opened. I'm listening.”

**Maya:** “I packed a flashlight, spare batteries, and snacks. The snacks are not spare.”

### OPN-011 Mateo and Pepper

Selected Kid Mateo; 20 seconds.

**Mateo:** “Pepper kept saying, ‘Open the little door.’ Then the little door was open.”

**Mateo:** “I thought he was copying somebody. Now I want to know who.”

**Mateo:** “My first question is ‘Where's Pepper?’ My second question has twelve parts.”

### OPN-012 Amina and Mochi

Selected Kid Amina; 18 seconds.

**Amina:** “Mochi disappeared from the pen. The latch was shut. There was strange moss under the shelter.”

**Amina:** “Mochi likes sitting beside me. Being picked up is a whole meeting.”

**Amina:** “I'll be there. Mochi can come over when ready.”

### OPN-013 Eli and Sprocket

Selected Kid Eli; 20 seconds.

**Eli:** “Sprocket explores. Then he comes back. This time, he didn't.”

**Eli:** “I found one of my screws in a vent. His tooth marks were on it.”

**Eli:** “He checks everything by sniffing, patting, then biting. We disagree about step three.”

### OPN-014 Priya and Pixel

Selected Kid Priya; 18 seconds.

**Priya:** “Pixel's enclosure was shut. Pixel was gone. There was warm moss inside.”

**Priya:** “I packed a warm stone. I hope it's the right one.”

**Priya:** “I brought home a better rock once. Pixel filed a complaint by sitting on the old one.”

### OPN-015 Jordan and Scout

Selected Kid Jordan; 18 seconds.

**Jordan:** “Scout heard an animal near the mansion. He pulled free before I could stop him.”

**Jordan:** “He always checks when somebody sounds scared.”

**Jordan:** “I brought his ball. Finding Scout is the plan. Throwing it is the backup plan.”

### OPN-016 Lena and Mooncake

Selected Kid Lena; 18 seconds.

**Lena:** “Mooncake's cage was closed. His secret treasures were gone too.”

**Lena:** “He left a scrap of wallpaper. Silver leaves. Like the mansion's.”

**Lena:** “He takes his collection seriously. One button has its own little box.”

### OPN-017 Samir and Bean

Selected Kid Samir; 18 seconds.

**Samir:** “My cousin saw somebody in a red coat carry Bean through a wall.”

**Samir:** “I found red thread with Bean's fur on it.”

**Samir:** “Bean likes new friends. And lettuce. Lettuce gets a shorter interview.”

### OPN-020 The same lead

Location curb; all eight are known neighborhood children, but do not imply they all become combat party members. Narrator; 18 seconds.

“Eight kids spread their clues across the pavement. Different pets. Different disappearances. The same old mansion.”

“They pack flashlights, snacks and a first-aid kit.”

“Someone adds another snack. A sensible precaution.”

### OPN-030 The front door

Location threshold; selected Kid may use their own portrait, narrator text; 18 seconds.

“Inside: dust, dark corners, one very clean welcome mat.”

“The door clicks shut. Where the way back should be, a different hallway waits.”

“The welcome mat says PLEASE WIPE YOUR FEET.”

“It has priorities.”

### OPN-040 The cat

Location Foyer; narrator; Marmalade portrait, no mandatory effect; 15 seconds.

“A cat sits in the hallway. You can see the wallpaper through her.”

“She washes one paw. Her collar tag reads MARMALADE.”

“Something under the furniture sneezes. Marmalade stops washing.”

“Apparently, that was rude.”

### OPN-050 The first Scuffle

Location Entry Hall; existing fight-kind page; selected Kid and Marmalade; 12 seconds.

“A Dust Bunny bounces out from under a chair.”

“The ghost cat steps beside you. Her tail points toward the trouble.”

“You have a partner.”

Button: **“Try a Scuffle”**. Action/success: button opens actual `foyer-1` tutorial battle. No claim that a non-speaking cat taught words or that she belongs to the Kid. Defeat branch uses OPN-051, victory OPN-060. Proposed replacement routing only; existing retry routes back to fight page.

### OPN-051 Try again

Trigger: existing prologue defeat return; read victory false; no run penalty or permanent loss. 10 seconds.

“The ghost cat sits beside you again. There is time to think.”

**Instruction:** “This practice Scuffle starts fresh when you retry. Try again, or skip to choose your expedition.”

Buttons use existing Try a Scuffle / Skip. Fallback if no defeat-specific page: OPN-050 remains neutral and replayable. Never claim a retry restored a pet or changed its fate.

### OPN-060 After the dust

Trigger actual prologue victory; 12 seconds.

“The Dust Bunny scatters under the chair. Two dusty ears peek out.”

“The cat returns to her paw.”

“The interruption has been dealt with. The paw has not.”

Direction: caption suffices; do not require a new enemy defeat animation. This proposes retreat, not death.

### OPN-070 Staying beside you

Trigger after OPN-060; 16 seconds. The name was already revealed on the collar in OPN-040, before combat HUD and Help use it. Existing page ID `name` is retained for compatibility; this page no longer introduces the name again.

“Marmalade pads a little way down the hall.”

“She looks back. Then she returns and sits beside you.”

“The hallway can wait.”

“You can go together.”

Direction: text and existing portrait suffice. Her return demonstrates chosen companionship without claiming a player decision, requiring new movement art, collecting an inventory tag, or asserting a date/former owner/biography.

### OPN-080 The expedition begins

Trigger end of opening; existing begin action writes `seenTutorials.opening` and starts Run. 18 seconds.

“Your missing pet is still the reason you're here. Marmalade may need a way out too.”

“Search the rooms. Follow the clues. Find out what this house is keeping—and why.”

“First, choose a route.”

Button: **“Open the map”**. Actual consequence: fresh expedition begins; tutorial damage and cards are not carried into a Run. Required outgoing page subline if integrated: **“Your expedition starts fresh after this practice Scuffle.”**

### OPN-099 Essential recap — implemented as SEARCH-RECAP

Trigger: first actual expedition after a skipped opening, when search orientation has not already been delivered. Runtime location: first map narrative route before the Foyer arrival. This is distinct from the opening's general completed-or-skipped flag. Completing the full opening through **Open map** marks `narrative.seen['SEARCH-RECAP']` before the route runs, because the opening already delivered these facts. **Skip** leaves that milestone untouched. A recap subsequently acknowledged through the narrative scene also marks it normally. Profile persistence preserves the distinction across reload; a refused save can cause a harmless repeated explanation, never missing essential information.

Exact runtime text:

“Eight neighborhood pets are missing. Their traces led to this House.”

“Your supernatural Companion is helping you search. Your missing pet is someone else.”

Short version: **“Find your missing pet. Your Companion is a different animal, helping with the search.”**

Read time 13–17 seconds. State: existing `SEARCH-RECAP` knowledge milestone only; no pet rescue, transformation, boss, victory or relationship state. First/repeat: once after delivery, with the ordinary Foyer arrival still eligible independently. Skip/full opening branches do not fabricate a prologue victory. Dependencies: existing narrative router and Save; no new flag or route type. Generic Companion wording remains valid when ordinary selection chooses another partner. The topic Help and first Foyer story remain accessible after the orientation is known.

## First battle action lessons

The implemented primary route is TUT-001, TUT-002, TUT-002B, TUT-003, TUT-070 and TUT-090. TUT-010 through TUT-060 are expandable explanations, never six mandatory acknowledgement gates. Let the player inspect or play immediately; never lock the hand behind reading. A requested explanation stays open until the player closes it; no timed cycling. No lesson requires a particular draw. Lessons already demonstrated may be acknowledged as complete; defeating the Dust Bunny early ends the battle normally; its complete rule recap remains available in Help. Do not claim the post-battle story automatically displayed TUT-090. No target is kept alive for instruction. Optional humor is a separate note, not embedded in the rule sentence.

### TUT-001 Inspect the plan

Primary route, first prompt. Goal: find the enemy's announced move. Action: hover or keyboard-focus the intent; success is that inspection opening, requiring a proposed presentation event. Instruction **“A Scuffle uses turns. Read the sign above the Dust Bunny to see its next move.”** Success **“Now choose a Trick to read.”** Hint **“Point to the sign, or focus it with the keyboard.”** Optional humor narrator **“The warning is less dusty than the rabbit.”** Read intent and phase; write only transient lesson acknowledgement. Visual: intent and text label, not color alone. Fallback existing coach: one Got it button; this acknowledges reading but does not claim to detect inspection. 11 seconds plus inspection. TUT-010/020 are available through **“Explain turns and plans”**, not compulsory pages.

### TUT-002 Read one Trick — implemented

Primary route, second prompt. Goal: read a Trick and compare its cost with available Nerve. Action: point to any Trick or select it using Left/Right. The real Hand emits `card:hover` for both pointer hover and keyboard selection; the coach observes it only when its card view belongs to this battle. This confirms a card was brought forward, never comprehension. It does not auto-advance, play a card, or require a particular draw.

Exact initial instruction: **“Point to a Trick to read it. Keyboard: Left or Right. Compare its Nerve cost with your Nerve.”**

After observed selection: **“This Trick is ready to read. Compare its Nerve cost with your Nerve.”**

**Got it** remains available before and after selection as an acknowledgement/fallback; no forced inspection or stale selection wait. **Skip** and **Help** remain available. Read hand selection and current text only; write a transient observed-ID set, never a saved comprehension flag. Visual: actual hand cards, excluding the measuring probe. First/repeat 13 seconds, success text 9 seconds, no auto-hide. If a hover occurred earlier, retain the observed state but still allow time to read. End-of-scene cleanup removes the bus subscription.

### TUT-002B Courage and Guard — implemented

Primary route, distinct manually advanced prompt before the first requested play. Goal: distinguish Courage from temporary defense. Action: inspect the Companion's current Courage display; acknowledgement advances. No claim that the player understood, and no required Guard card or Guard gain. Exact text: **“Courage keeps your Companion in the Scuffle. At zero, they’re out. Guard usually takes damage first and clears at your next turn.”**

Visual: Companion/Courage panel; the text still works when the Guard badge is absent because Guard is zero. Button **Got it**; **Help** offers the full exceptions, **Skip** leaves combat playable. First/repeat about 16 seconds, self-paced. State: presentation index only; no engine mutation. Fallback is the same acknowledged card with no spotlight if the panel is unavailable. Cost and defense now have separate spotlights and separate goals.

### TUT-003 Try it

Primary route, third prompt. Goal: perform one legal card action. Action/success: same valid local `card:play` handling and early-completion safeguards as TUT-060. Mouse instruction **“Drag the Trick onto its target, or click it and choose a target if asked.”** Keyboard instruction, shown for keyboard input **“Press Up to use the selected Trick. If it needs a target, choose with Left or Right, then Up. Down cancels.”** Controller instruction only with verified current-family controls **“Confirm uses the selected Trick. Choose a target if asked, then confirm again. Cancel backs out.”** Success **“Check what changed. You can play more Tricks if they help.”** Hint **“No useful play? You can choose End Turn instead.”** Optional humor narrator **“Marmalade looks very pleased with your joint idea.”** No required attack, Guard card, exact hand or Nerve spending. Read state / acknowledge actual play only. Fallback existing Coach action wait plus Skip; end-turn-as-alternative needs proposed resolver. Core read time 10–15 seconds plus action; do not display all device instructions together. Expanded TUT-060 is on request.

The first requested play now follows three short acknowledgement cards: intent, Trick/cost, and Courage/Guard. The Trick/cost card also observes a real selection without gating on it or auto-advancing. This trades one extra acknowledgement for separate resource concepts; there is no six-card pre-action lecture. No card is kept alive or forced for instruction. The authored durations are reading estimates, not measured child comprehension.

### TUT-010 Look before acting

Expanded explanations TUT-010 through TUT-060 open only when the player requests the corresponding Explain option or full Help. Their trigger fields describe eligibility/order inside that requested explanation, not automatic blockers in the primary TUT-001–003 route.

Goal: recognize turn-based play. Trigger combat ready. Action: look at the board and select **Got it**. Success: acknowledgement; not a claim that the player understood. Instruction: **“This is a Scuffle. You take turns. Nothing attacks just because you take time to read.”** Optional Mateo-only line: **“Good. I have a question about the sneezing furniture.”** Other Kids: caption **“Marmalade watches the Dust Bunny.”** Success: **“First, see what the Dust Bunny plans.”** Hint: **“Choose Got it when you're ready.”** Fallback: Skip remains available. Read/change: current combat phase / presentation acknowledgement only. Visual: whole board; 13 seconds.

### TUT-020 Read an intention

Goal: locate enemy intent. Trigger TUT-010 acknowledged. Action: inspect intent text above Dust Bunny. Success: acknowledgement; no invented intent-click event. Instruction: **“The sign above the Dust Bunny shows its next move. Read the words and number before choosing a Trick.”** Humor: **“A very polite warning from a very dusty rabbit.”** Success: **“Now look at your Tricks.”** Hint: **“The sign is above the Dust Bunny.”** Fallback if enemy gone: skip ahead to recap; never point at empty coordinates. Visual: intent plus full text; 13 seconds.

### TUT-030 Find a Trick

Goal: locate hand and read card. Trigger prior acknowledgement. Action: point to a card or use Left/Right to select one. Success: player acknowledges after inspection; optional selection observation is proposed. Instruction: **“These cards are your Tricks. Each says what it does. Point to one to read it. On a keyboard, use Left or Right.”** Humor: **“Marmalade has brought an entire deck and no pockets.”** Success: **“Check its cost before playing.”** Hint: **“You can read a Trick without playing it.”** Fallback: plain text help if hover unavailable. Visual: hand; 17 seconds.

### TUT-040 Nerve pays the cost

Goal: compare cost with available Nerve. Trigger prior acknowledgement. Action: compare card cost with Nerve display; acknowledge. Success: acknowledgement. Instruction: **“Read the Nerve cost on the Trick. Compare it with your Nerve. You need enough to play.”** Optional Help detail: **“Nerve refills at the start of your turn. Tricks and other effects can change it.”** Humor none; arithmetic gets room. Success: **“You choose what is worth playing.”** Hint: **“Look for a Trick that costs no more Nerve than you have.”** Fallback when none is playable: end-turn lesson; do not demand a play. Visual: Nerve then cost; 12 seconds core, 11 seconds optional Help.

### TUT-050 Courage and Guard

Goal: recognize damage and defense before committing a play. Trigger prior acknowledgement. Action: inspect Courage/Guard. Success: acknowledgement. Instruction: **“Courage keeps you in the Scuffle. At zero, you are out. Guard usually stops damage before it reaches Courage.”** Core second sentence: **“Guard normally clears at your next turn.”** Optional Help detail: **“Read the Trick or attack: some rules change this.”** Humor none. Success: **“You can defend, attack, or use another Trick.”** Hint: **“Curl Up gives Guard if it is in your hand. You do not need to wait for that card.”** Fallback absent Guard badge: spotlight Courage and use text, not a nonexistent shield. Visual: player panel; 18 seconds core, 8 seconds optional Help.

### TUT-060 Play one Trick

Goal: play a legal Trick. Trigger prior acknowledgement or any early valid card play. Action: play any currently legal Trick; success `card:play` for the local player, not an enemy or teammate. Instruction: **“Play a Trick you can afford. You can drag it onto its target, or click it and choose a target if asked.”** Keyboard page: **“Use Left or Right to select a Trick. Press Up to use it. If it needs a target, choose with Left or Right, then press Up again. Down cancels.”** Success: **“That Trick worked. Check what changed on the board.”** Humor after success: **“Marmalade looks as if this was her idea.”** Hint: **“A Trick that helps you may not need an enemy target.”** Unavailable-card fallback: **“No useful play right now? You can end your turn.”** Proposed resolver allows advance to TUT-070 on player end-turn without pretending a card was played. Existing Coach fallback: Skip removes the action wait. Visual: hand/target, no color-only cue; about 33 seconds over two pages plus action.

### TUT-070 End the turn

Goal: intentionally hand over turn. Trigger a play completed or player chooses to stop playing; read phase/ended state. Action: activate End Turn or E; success `turn:end` with `side === 'player'` and local actor. Instruction: **“Play more Tricks if they help. When you're ready, choose End Turn. On a keyboard, press E.”** Success: **“Now the Dust Bunny takes its turn.”** Hint: **“You may end a turn with Nerve left.”** Humor: **“Marmalade can wait. She has been practicing.”** Fallback early win: do not wait for end-turn; show recap. If Auto End Turn already fired, acknowledge actual transition, never require a duplicate. Visual: End Turn; 12 seconds plus action.

### TUT-080 Your next turn

Goal: observe the repeatable cycle. Trigger next local player turn after dealing/refill complete, not the early `turn:start` event alone. Action: inspect new hand/Nerve and make own play. Success: next valid play or dismiss lesson. Instruction: **“Your next turn brings more Tricks and a Nerve refill. Read the new enemy plan, then decide what to do.”** Success: **“Keep going at your own pace.”** Hint: **“You can look at your Draw and Discard piles whenever you need them.”** Humor omitted while learning. Fallback battle ended: TUT-090. Visual: hand, then intent; 14 seconds.

### TUT-090 Battle recap

Trigger coach completed, early battle victory or request help; no combat prerequisite for rereading. Action acknowledge. Instruction: **“Read the enemy plan. Check your Tricks and Nerve. Play what helps. End your turn when you're ready.”** Second card: **“Guard usually protects Courage. At zero Courage, you're out of the Scuffle. A failed expedition does not permanently take your pet away.”** Success button **“Got it”**. Hint **“You can take your time.”** State none. Visual text only. Skip exits recap without altering outcome. 28 seconds over two cards. This promise forbids a permanent pet-loss design; it does not claim a persistent rescue has been implemented.

### TUT-085 Where the cards went

Location battle; trigger first resolved player end-turn, after TUT-080 or on request; prerequisites battle remains active. Goal: distinguish discard from permanent loss. Action inspect Discard with W or the named pile button; success acknowledgement, not a required pile-open event. Instruction: **“Most unplayed Tricks go to Discard when your turn ends. They aren't lost. When Draw runs out, Discard is shuffled back in.”** Optional Help page: **“Retain keeps a Trick in your hand. Ethereal makes an unplayed Trick Vanish. Read the card for special rules.”** Success **“Your deck keeps cycling during this Scuffle.”** Hint **“The Discard button shows what is there now.”** Humor none. Read actual piles; no state write beyond proposed seen. Fallback use existing Draw/Discard tooltips; early victory defers this to Help. First 17 seconds, optional detail 12; repeat only on request. Source: engine hand resolution and current pile tooltips.

### TUT-086 A word on a Trick

Location first held Boo! or other Trick with Haunt; trigger inspect card, not mandatory autoplay; no assumption it was drawn turn one. Goal: use keyword explanations. Instruction **“A special word explains an extra rule. Haunt waits for an enemy to attack.”** Detail card **“After a Haunted enemy attacks, it loses Courage equal to its Haunt. Then it normally loses half its Haunt, rounded up.”** Action inspect keyword tooltip or acknowledge; success acknowledgement only. Optional example **“With 4 Haunt, an attacking enemy loses 4 Courage. Then its Haunt drops to 2.”** Hint **“Haunt is different from dealing damage right now.”** Success **“Read the enemy plan to decide when this helps.”** Read actual keyword/status; no effects added by the lesson. Fallback existing keyword tooltip (`data/companions/keywords.js`) and no additional overlay. Visual word plus status label, never color alone. First 9 seconds plus 15-second detail, example optional; repeat Help only. This does not claim an Attack was cancelled or that Haunt always prevents damage.

## Just in time system introductions

### SYS-010 The map

Location map; trigger first real map; prerequisite Run exists. Goal/action/success: choose a legal reachable room; actual `Run.chooseNode` acceptance. Instruction: **“Choose one of the rooms you can reach. Its label tells you what kind of stop it is. Your route can change next expedition.”** Humor, selected Kid only: Maya **“We can make a plan. The floor may have notes.”** Success **“This is your next room.”** Hint **“Choose a connected room that is available.”** Fallback static map help. State reads legal nodes/current map; existing node selection changes route only. No free walking, teleporting, or arbitrary boss selection. Recap same; first 17 seconds, repeat none.

### SYS-020 A reward

Location reward; trigger first reward with cards; goal compare adding versus declining. Action choose one Trick and confirm, or Take none; success actual reward resolution. Instruction: **“Choose one Trick for your expedition deck, or Take none. Taking none gives Buttons and more Luck. The button shows how much.”** Humor Eli **“I can collect things. Apparently I can also not collect things.”** Success take **“That Trick is in your expedition deck.”** Success decline **“No Trick added. You gained the shown Buttons and Luck.”** Hint **“Read each Trick before deciding. Either option works.”** Fallback existing reward copy. State actual reward chosen/skipped, deck/Buttons/Luck; not permanent card ownership. First 17 seconds; recap instruction. No reward in prologue is invented.

### SYS-030 A Pillow Fort

Location rest; trigger first visit; goal choose one available camp action. Instruction: **“A Pillow Fort is a safe stop. Read the choices and their costs. Rest restores Courage. Sharpen improves one Trick for this expedition.”** Second optional detail **“Forge improves a Keepsake but lowers your maximum Courage. Read its preview before you confirm.”** Action choose any eligible option, including Sit; success actual rest action resolution. Humor Amina **“A fort. Finally, some sensible architecture.”** Success **“Your choice is shown below. Continue when you're ready.”** Hint **“A choice may be unavailable because of your current items or condition.”** Fallback existing four-door descriptions, no additional overlay. Read restHealAmount, upgradeableCards, forge cost and eligibility. Effects remain exactly existing action. Never promise an upgrade survives all expeditions. 18 seconds core, 11 optional.

### SYS-040 Buttons and the Midnight Market

Location shop; trigger first shop. Goal/action/success: inspect an offer and either purchase or leave; no forced purchase. Instruction **“Buttons buy things at the Midnight Market. Read the price and effect. You can leave without buying.”** Humor Samir **“I brought my best button. It is still just one Button.”** Success purchase **“Your purchase is added.”** Leave **“On with the search.”** Hint **“If the price is too high, keep your Buttons.”** Fallback static shop header. Read actual shop offer/currency; change only actual buy or leave. 14 seconds. No fabricated merchant biography.

### SYS-050 A Curiosity

Location event; trigger first Curiosity. Goal/action/success: read choices, choose one actual enabled response, receive its actual outcome. Instruction **“A Curiosity offers a choice. Read what each option costs or gives. Some results are uncertain; the choice tells you what you know.”** Optional caption **“A cushion bears an offer.”** Humor Lena **“Comfortable reading.”** Use this joke only in an event where that proposed cushion is actually described. Otherwise omit it. Success **“Here is what happened.”** Hint **“You can take time to compare the choices.”** Fallback event screen text; never fabricate a Leave choice if absent. Read event options/requirements; no extra narrative choice state. 17 seconds.

### SYS-060 A new Companion

Location existing rescue reward; trigger actual `rescueCompanion` success, not just boss defeat. Goal: distinguish Companion from missing pet. Instruction **“This animal is a Companion. Once freed, they can be chosen for a later expedition. Your missing pet has a separate story.”** Action acknowledge rescue then continue; success actual unlock is recorded. Humor omitted for this relationship moment. Success **“You have another possible partner.”** Hint **“Check the Companion board before your next expedition.”** Fallback existing rescue text. Read actual rescued slug/set; write existing rescue only, not `petsRescued`. No claim every boss automatically frees a Companion. 16 seconds.

### SYS-070 Clues

Location first actual Clue award or Clubhouse; trigger `Run.addClues` positive count. Goal avoid misleading generic points as authored evidence. Instruction **“Clues show progress in the search. This number is a clue total. Read notes and discoveries for what the evidence actually says.”** Action inspect award and continue; success acknowledgement. Humor Priya **“One number. Several questions. That's normal.”** Hint **“A clue total does not mean a pet has been rescued.”** Fallback change existing Clue tooltip only. State actual generic clue count; no specific discovery flag is inferred. The complete investigation journal is proposed elsewhere. 16 seconds. If narrative notes are not installed, omit the second sentence about reading them and use **“This number tracks search progress. It does not mean a pet has been rescued.”**

### SYS-080 Keepsakes and Snacks

Location HUD/reward; two separate cards shown only when relevant. SYS-080A prerequisite first acquired Keepsake: **“A Keepsake changes your expedition's rules. Read its description to see when it helps and what it costs.”** SYS-080B prerequisite first held Snack during a Scuffle; outside combat inspection only: **“You can use Snacks during Scuffles. Read a Snack's effect first. Using one spends that Snack.”** Goal inspect actual item; action inspect or dismiss, no consumption required; success acknowledgement. Humor Jordan **“Emergency snacks. Finally, my training matters.”** Success **“Use it when it helps.”** Hint **“You do not have to use it now.”** Read actual held items; state unchanged unless player independently uses one. Fallback existing tooltip. 13 seconds each; no universal Snack effect or recharge is invented.

### SYS-090 Party play

Location first multiplayer handoff; prerequisite party mode only. Instruction **“You each have your own Tricks and supplies. Read whose turn or choice is shown before acting.”** Map variant **“Vote for the route you want. The game resolves the votes; one player's vote is not everyone's agreement.”** Fort variant **“Mend helps a friend instead of resting yourself. Clone copies a friend's Trick for your deck this expedition. Read the choice before confirming.”** Goal/action/success follow actual active seat and actual voting/action result; no new shared control scheme. Humor optional Jordan **“Team meeting! The chair is not on the team. Yet.”** Success **“The result is shown on the board.”** Hint **“Check the active player's name.”** Fallback current handoff/choice UI. Read party active seat, choices and vote results; writes only existing action. 14–17 seconds each; no solo interruption.

### SYS-081 Marmalade's Lives

Location battle resource track; trigger first inspection of Lives or first card that spends Lives; prerequisite Marmalade present. Goal distinguish resource from attempts or pet safety. Instruction **“Lives are Marmalade's special battle resource. They are not remaining tries. She starts each Scuffle with 9 Lives. Some Tricks spend them.”** Detail **“Lives do not refill each turn. They reset next battle. Some special Tricks can restore them sooner. Read each Trick's full cost.”** Action inspect or acknowledge; never require spending. Success **“Courage and Lives do different jobs.”** Hint **“Your missing pet is not affected by this number.”** Humor none. Read actual Lives resource; no lesson mutation. Fallback existing resource tooltip with this replacement copy. First 16 seconds plus 12 optional; repeat on request. Grounded in `marmalade.js` resource definition and registered Lives keyword. New presentation, no new mechanic.

## Revisit and shortened support

### HELP-000 Topic index — implemented runtime round 2

Location: Scuffle Help modal, opened from coaching or the persistent **How to play** button. Speaker: instructional narrator. Trigger: explicit Help request; prerequisite game loaded, no progress milestone. Status: implemented presentation, mechanics unchanged. First and repeat both open the three-group index; neither requires paging through unrelated rules. State read/change: transient `group` and `page` only, reset when closed; no Run, Save, pet or learning-completion mutation.

Title: **“Scuffle help”**. Prompt: **“What would you like to check?”** Text: **“Choose a topic. You can come back whenever you need.”**

The exact group buttons and their topic buttons are:

- **“Turns and resources”**: **“Your turn”**, **“Tricks and Nerve”**, **“Courage and Guard”**, **“Remember”**.
- **“Controls and piles”**: **“Mouse and touch”**, **“Keyboard”**, **“Controller”**, **“Where Tricks go”**, **“Pile shortcuts”**.
- **“Marmalade”**: **“Marmalade’s Haunt”**, **“Marmalade’s Lives”**.

Selecting a group shows **“Choose just the explanation you want.”** Selecting a topic displays only that explanation, with **“All topics”**, **“Previous”**, **“Next”**, and **“Back to game”**. Previous/Next move among the selected group's topics; an unavailable direction is disabled. **All topics** returns to the three-group index. These are explanation choices, never story choices or gameplay actions. No timer; the only consequence is the requested text. A requested explanation is two selections from the index, including Haunt, pile shortcuts and Nerve.

Visual direction: existing modal and button art, short text, wrapping footer. No new animation or color-only information. Native buttons support Tab/Enter and controller menu navigation. Replacing a topic menu moves focus to the new choices or explanation, never back into combat. Escape closes Help; scene exit closes it and removes listeners. Fallback: existing card, intent, resource and pile tooltips remain available. Dependencies: implemented Modal, Navigator, and `ui/scuffle-help.js`; no gameplay engineering required for this index.

### HELP-001 Battle help — implemented exact topics

The index displays one topic at a time. Approximate reading time is 15–30 seconds per selected topic at 100–120 words/minute. No timed advance, mandatory reading sequence, or inferred understanding. Repeat text is identical because the player requested the explanation; skip/recap is **Back to game**, with no change to the current expedition. Controller wording uses named actions; custom Steam Input bindings are not guessed.

1. **Your turn** — “Read the sign above each enemy. It shows the move that enemy plans next. Play Tricks to help your Companion. Choose End Turn when you are ready. You may leave Nerve unused.”

2. **Tricks and Nerve** — “Point to a Trick to read it. Compare its Nerve cost with your current Nerve. Nerve refills at the start of your turn. Effects can change how much you get. Read the numbers on your board.”

3. **Courage and Guard** — “At zero Courage, a Companion is out of this Scuffle. Guard usually takes damage before Courage does. Guard normally clears at the start of your next turn. Some Tricks and attacks have special rules: read their text.”

4. **Mouse and touch** — “Select a Trick, then choose its target if it needs one. With a mouse, you can also drag a Trick onto a target. A Trick that does not need a target can play straight away.”

5. **Keyboard** — “Left and Right select a Trick. Up chooses it. If it needs a target, Left and Right change targets, then Up confirms. Down cancels your selection. E ends your turn. Tab moves keyboard focus when no Trick is selected.”

6. **Where Tricks go** — “At turn end, most unplayed Tricks go to Discard. Retain keeps a Trick in your hand. Ethereal makes an unplayed Trick Vanish. When Draw is empty, Discard shuffles into Draw. Use the labeled piles to read their Tricks.”

7. **Pile shortcuts** — “Q opens Draw. W opens Discard. R opens Torn. T opens Vanished. D opens your Deck. Close a pile before playing. Buttons on the board also open these piles.”

8. **Marmalade’s Haunt** — “After a Haunted enemy attacks, it loses Courage equal to its Haunt. Then it normally loses half its Haunt, rounded up. Haunt does not stop the attack that triggers it. Some Tricks change how Haunt works.”

9. **Marmalade’s Lives** — “Lives are a Scuffle resource, not a count of your remaining attempts. They do not refill each turn. They reset for the next Scuffle; some Tricks can restore them sooner. Read each Trick before spending Lives.”

10. **Controller** — “Use the on-screen controller prompts to select a Trick and confirm. Choose a target when asked, then confirm again. Use the cancel action to back out. You can always select the labeled End Turn button.”

11. **Remember** — “Read the enemy’s next move. Read your Tricks. Check Nerve, Courage and Guard. Play what helps, then end your turn. The Dust Bunny has no pockets. You, fortunately, have a Backpack.”

### HELP-010 Returning player

Existing behavior skips story once completed/skipped or a Companion has been freed. Proposed optional selection prompt: **“Want a quick refresher?”** Choices **“Read battle help”** and **“Start expedition”**. No default reread. Success returns to unchanged selection. Fallback retain current skip behavior plus existing tooltips. No new skip reward or penalty.

## Archival fallback — superseded by implemented six-step coach

If no progressive lesson resolver is built, keep the existing eight-step Coach and replace only authored text and selectors. This supplies a workable, simpler alternative but cannot automatically verify every learning action or offer inline rescue hints.

1. **“This is a Scuffle. You take turns. Take your time. The sign above the Dust Bunny shows its next move.”** Got it.
2. **“These are your Tricks. Read what each does and its Nerve cost. Your current Nerve is beside your hand.”** Got it.
3. **“Courage keeps you in the Scuffle. Guard usually stops damage first. Guard normally clears at the start of your next turn.”** Got it.
4. **“Nerve refills at the start of your turn. Spend it on Tricks that help. You do not have to spend it all.”** Got it.
5. **“Play any Trick you can afford. Drag it to a target, or select it with Left or Right and press Up. Choose a target if asked.”** Wait for `card:play`; Skip remains escape from stale wait.
6. **“Check what changed. You can play more Tricks if they help.”** Got it.
7. **“Choose End Turn when you're ready, or press E. Then the Dust Bunny acts.”** Wait for local player `turn:end`.
8. **“Read the enemy plan. Check your Tricks and Nerve. Play what helps. End your turn when you're ready.”** Got it.

Do not claim the coach verified inspection on acknowledgement cards. If a battle ends before all cards, show TUT-090 on the following story page. Appending that prose uses existing page rendering, but routing remains a proposed edit. This eight-step archival alternative was not implemented. The current six-step coach and topic Help were integrated and browser-tested as recorded above.



