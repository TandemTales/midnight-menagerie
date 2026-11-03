# Midnight Menagerie opening and tutorial

Status: finished proposed copy, source-audited on 27 October 2026; not installed or playtested. This package replaces the opening and teaches the existing deckbuilding game. It does not introduce walking controls, pet combat, friendship meters, timed escapes, or a scripted combat hand.

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

**Amina:** “Mochi disappeared from his pen. The latch was shut. There was strange moss under his shelter.”

**Amina:** “He likes sitting beside me. Being picked up is a whole meeting.”

**Amina:** “I'll find him. Then I'll give him room to come over.”

### OPN-013 Eli and Sprocket

Selected Kid Eli; 20 seconds.

**Eli:** “Sprocket explores. Then he comes back. This time, he didn't.”

**Eli:** “I found one of my screws in a vent. His tooth marks were on it.”

**Eli:** “He checks everything by sniffing, patting, then biting. We disagree about step three.”

### OPN-014 Priya and Pixel

Selected Kid Priya; 18 seconds.

**Priya:** “Pixel's enclosure was shut. Pixel was gone. There was warm moss inside.”

**Priya:** “I packed his favorite rock. It's crooked.”

**Priya:** “I found him a better rock once. Pixel filed his complaint by sitting on the old one.”

### OPN-015 Jordan and Scout

Selected Kid Jordan; 18 seconds.

**Jordan:** “Scout heard an animal near the mansion. He pulled free before I could stop him.”

**Jordan:** “He always checks when somebody sounds scared.”

**Jordan:** “I brought his ball. Finding Scout is the plan. Throwing it is the backup plan.”

### OPN-016 Lena and Mooncake

Selected Kid Lena; 18 seconds.

**Lena:** “Mooncake's cage was closed. His secret treasures were gone too.”

**Lena:** “He left a scrap of wallpaper. Silver leaves. Like the mansion's.”

**Lena:** “He takes his collection seriously. One button has its own room.”

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

“She washes one paw.”

“Something under the furniture sneezes. The cat stops washing.”

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

### OPN-070 A name

Trigger after OPN-060; 12 seconds.

“A tag rests by the chair. MARMALADE.”

“The cat nudges it toward you.”

“Then Marmalade moves down the hall, looks back, and waits.”

“You can go together.”

No date, former owner or biography asserted. Tag-nudge is new staging supported as prose. No inventory collection or equip consequence.

### OPN-080 The expedition begins

Trigger end of opening; existing begin action writes `seenTutorials.opening` and starts Run. 18 seconds.

“Your missing pet is still the reason you're here. Marmalade may need a way out too.”

“Search the rooms. Follow the clues. Find out what this house is keeping—and why.”

“First, choose a route.”

Button: **“Open the map”**. Actual consequence: fresh expedition begins; tutorial damage and cards are not carried into a Run. Required outgoing page subline if integrated: **“Your expedition starts fresh after this practice Scuffle.”**

### OPN-099 Essential recap

Trigger first actual expedition after a skipped opening; proposed one-time text insertion, no cutscene prerequisite. 13 seconds.

“Eight neighborhood pets are missing. Their clues lead to this living mansion. Marmalade is your ghost-cat Companion. Search the rooms for evidence and help the animals find a way out.”

State: does not assert a pet's location as confirmed, rescue, transformation, or new player agreement. Fallback static Foyer arrival/selection text; returning profiles may dismiss it. The recap never says the player won a battle they skipped.

## First battle action lessons

These are a proposed improved presentation sequence over the same ordinary combat. Let the player inspect or play immediately; never lock the hand behind acknowledgements. The six brief core lessons before the first prompted play target about 75 seconds at a slow reading pace; optional exceptions and humor are not extra mandatory cards. No lesson requires a particular draw. Lessons already demonstrated may be acknowledged as complete; defeating the Dust Bunny early ends the battle normally and gives TUT-090 as a reading card. No target is kept alive for instruction. Optional humor is a separate note, not embedded in the rule sentence.

### TUT-010 Look before acting

Goal: recognize turn-based play. Trigger combat ready. Action: look at the board and select **Got it**. Success: acknowledgement; not a claim that the player understood. Instruction: **“This is a Scuffle. You take turns. Nothing attacks just because you take time to read.”** Optional Mateo-only line: **“Good. I have a question about the sneezing furniture.”** Other Kids: caption **“Marmalade watches the Dust Bunny.”** Success: **“First, see what the Dust Bunny plans.”** Hint: **“Choose Got it when you're ready.”** Fallback: Skip remains available. Read/change: current combat phase / presentation acknowledgement only. Visual: whole board; 13 seconds.

### TUT-020 Read an intention

Goal: locate enemy intent. Trigger TUT-010 acknowledged. Action: inspect intent text above Dust Bunny. Success: acknowledgement; no invented intent-click event. Instruction: **“The sign above the Dust Bunny shows its next move. Read the words and number before choosing a Trick.”** Humor: **“A very polite warning from a very dusty rabbit.”** Success: **“Now look at your Tricks.”** Hint: **“The sign is above the Dust Bunny.”** Fallback if enemy gone: skip ahead to recap; never point at empty coordinates. Visual: intent plus full text; 13 seconds.

### TUT-030 Find a Trick

Goal: locate hand and read card. Trigger prior acknowledgement. Action: point to a card or use Left/Right to select one. Success: player acknowledges after inspection; optional selection observation is proposed. Instruction: **“These cards are your Tricks. Each says what it does. Point to one to read it. On a keyboard, use Left or Right.”** Humor: **“Marmalade has brought an entire deck and no pockets.”** Success: **“Check its cost before playing.”** Hint: **“You can read a Trick without playing it.”** Fallback: plain text help if hover unavailable. Visual: hand; 17 seconds.

### TUT-040 Nerve pays the cost

Goal: compare cost with available Nerve. Trigger prior acknowledgement. Action: compare card cost with Nerve display; acknowledge. Success: acknowledgement. Instruction: **“A Trick's number is its Nerve cost. Compare it with your Nerve. You need enough to play.”** Optional Help detail: **“Nerve refills at the start of your turn. Tricks and other effects can change it.”** Humor none; arithmetic gets room. Success: **“You choose what is worth playing.”** Hint: **“Look for a Trick that costs no more Nerve than you have.”** Fallback when none is playable: end-turn lesson; do not demand a play. Visual: Nerve then cost; 12 seconds core, 11 seconds optional Help.

### TUT-050 Courage and Guard

Goal: recognize damage and defense before committing a play. Trigger prior acknowledgement. Action: inspect Courage/Guard. Success: acknowledgement. Instruction: **“Courage keeps you in the Scuffle. At zero, you are out. Guard usually stops damage before it reaches Courage.”** Core second sentence: **“Guard normally clears at your next turn.”** Optional Help detail: **“Read the Trick or attack: some rules change this.”** Humor none. Success: **“You can defend, attack, or use another Trick.”** Hint: **“Curl Up gives Guard if it is in your hand. You do not need to wait for that card.”** Fallback absent Guard badge: spotlight Courage and use text, not a nonexistent shield. Visual: player panel; 18 seconds core, 8 seconds optional Help.

### TUT-060 Play one Trick

Goal: play a legal Trick. Trigger prior acknowledgement or any early valid card play. Action: play any currently legal Trick; success `card:play` for the local player, not an enemy or teammate. Instruction: **“Play a Trick you can afford. You can drag it onto its target, or click it and choose a target if asked.”** Keyboard page: **“Use Left or Right to select a Trick. Press Up to use it. If it needs a target, choose with Left or Right, then press Up again.”** Success: **“That Trick worked. Check what changed on the board.”** Humor after success: **“Marmalade looks as if this was her idea.”** Hint: **“A Trick that helps you may not need an enemy target.”** Unavailable-card fallback: **“No useful play right now? You can end your turn.”** Proposed resolver allows advance to TUT-070 on player end-turn without pretending a card was played. Existing Coach fallback: Skip removes the action wait. Visual: hand/target, no color-only cue; about 31 seconds over two pages plus action.

### TUT-070 End the turn

Goal: intentionally hand over turn. Trigger a play completed or player chooses to stop playing; read phase/ended state. Action: activate End Turn or E; success `turn:end` with `side === 'player'` and local actor. Instruction: **“Play more Tricks if they help. When you're ready, choose End Turn. On a keyboard, press E.”** Success: **“Now the Dust Bunny takes its turn.”** Hint: **“You may end a turn with Nerve left.”** Humor: **“Marmalade can wait. She has been practicing.”** Fallback early win: do not wait for end-turn; show recap. If Auto End Turn already fired, acknowledge actual transition, never require a duplicate. Visual: End Turn; 12 seconds plus action.

### TUT-080 Your next turn

Goal: observe the repeatable cycle. Trigger next local player turn after dealing/refill complete, not the early `turn:start` event alone. Action: inspect new hand/Nerve and make own play. Success: next valid play or dismiss lesson. Instruction: **“Your next turn brings more Tricks and a Nerve refill. Read the new enemy plan, then decide what to do.”** Success: **“Keep going at your own pace.”** Hint: **“You can look at your Draw and Discard piles whenever you need them.”** Humor omitted while learning. Fallback battle ended: TUT-090. Visual: hand, then intent; 14 seconds.

### TUT-090 Battle recap

Trigger coach completed, early battle victory or request help; no combat prerequisite for rereading. Action acknowledge. Instruction: **“Read the enemy plan. Check your Tricks and Nerve. Play what helps. End your turn when you're ready.”** Second card: **“Guard usually protects Courage. At zero Courage, you're out of the Scuffle. A failed expedition does not permanently take your pet away.”** Success button **“Got it”**. Hint **“You can take your time.”** State none. Visual text only. Skip exits recap without altering outcome. 28 seconds over two cards. This promise forbids a permanent pet-loss design; it does not claim a persistent rescue has been implemented.

## Just in time system introductions

### SYS-010 The map

Location map; trigger first real map; prerequisite Run exists. Goal/action/success: choose a legal reachable room; actual `Run.chooseNode` acceptance. Instruction: **“Choose one of the rooms you can reach. Its label tells you what kind of stop it is. Your route can change next expedition.”** Humor, selected Kid only: Maya **“We can make a plan. The floor may have notes.”** Success **“This is your next room.”** Hint **“Choose a connected room that is available.”** Fallback static map help. State reads legal nodes/current map; existing node selection changes route only. No free walking, teleporting, or arbitrary boss selection. Recap same; first 17 seconds, repeat none.

### SYS-020 A reward

Location reward; trigger first reward with cards; goal compare adding versus declining. Action choose one Trick and confirm, or Take none; success actual reward resolution. Instruction: **“Choose one Trick for your expedition deck, or Take none. Taking none gives Buttons and more Luck. The button shows how much.”** Humor Eli **“I can collect things. Apparently I can also not collect things.”** Success take **“That Trick is in your expedition deck.”** Success decline **“No Trick added. You gained the shown Buttons and Luck.”** Hint **“Read each Trick before deciding. Either option works.”** Fallback existing reward copy. State actual reward chosen/skipped, deck/Buttons/Luck; not permanent card ownership. First 17 seconds; recap instruction. No reward in prologue is invented.

### SYS-030 A Pillow Fort

Location rest; trigger first visit; goal choose one available camp action. Instruction: **“A Pillow Fort is a safe stop. Read the choices and their costs. Rest restores Courage. Sharpen improves one Trick for this expedition.”** Second optional detail **“Forge improves a Keepsake but lowers your maximum Courage. Read its preview before you confirm.”** Action choose any eligible option, including Sit; success actual rest action resolution. Humor Amina **“A fort. Finally, some sensible architecture.”** Success **“Your choice is shown below. Continue when you're ready.”** Hint **“A choice may be unavailable because of your current items or condition.”** Fallback existing four-door descriptions, no additional overlay. Read restHealAmount, upgradeableCards, forge cost and eligibility. Effects remain exactly existing action. Never promise an upgrade survives all expeditions. 18 seconds core, 11 optional.

### SYS-040 Buttons and the Midnight Market

Location shop; trigger first shop. Goal/action/success: inspect an offer and either purchase or leave; no forced purchase. Instruction **“Buttons buy things at the Midnight Market. Read the price and effect. You can leave without buying.”** Humor Samir **“We accept Buttons. We do not accept ‘but it's my birthday.’ I checked.”** Success purchase **“Your purchase is added.”** Leave **“On with the search.”** Hint **“If the price is too high, keep your Buttons.”** Fallback static shop header. Read actual shop offer/currency; change only actual buy or leave. 14 seconds. No fabricated merchant biography.

### SYS-050 A Curiosity

Location event; trigger first Curiosity. Goal/action/success: read choices, choose one actual enabled response, receive its actual outcome. Instruction **“A Curiosity offers a choice. Read what each option costs or gives. Some results are uncertain; the choice tells you what you know.”** Humor Lena **“The furniture has an offer. That seems fair. We sat on its cousin.”** Success **“Here is what happened.”** Hint **“You can take time to compare the choices.”** Fallback event screen text; never fabricate a Leave choice if absent. Read event options/requirements; no extra narrative choice state. 17 seconds.

### SYS-060 A new Companion

Location existing rescue reward; trigger actual `rescueCompanion` success, not just boss defeat. Goal: distinguish Companion from missing pet. Instruction **“This animal is a Companion. Once freed, they can be chosen for a later expedition. Your missing pet has a separate story.”** Action acknowledge rescue then continue; success actual unlock is recorded. Humor omitted for this relationship moment. Success **“You have another possible partner.”** Hint **“Check the Companion board before your next expedition.”** Fallback existing rescue text. Read actual rescued slug/set; write existing rescue only, not `petsRescued`. No claim every boss automatically frees a Companion. 16 seconds.

### SYS-070 Clues

Location first actual Clue award or Clubhouse; trigger `Run.addClues` positive count. Goal avoid misleading generic points as authored evidence. Instruction **“Clues show progress in the search. This number is a clue total. Read notes and discoveries for what the evidence actually says.”** Action inspect award and continue; success acknowledgement. Humor Priya **“One number. Several questions. That's normal.”** Hint **“A clue total does not mean a pet has been rescued.”** Fallback change existing Clue tooltip only. State actual generic clue count; no specific discovery flag is inferred. The complete investigation journal is proposed elsewhere. 16 seconds. If narrative notes are not installed, omit the second sentence about reading them and use **“This number tracks search progress. It does not mean a pet has been rescued.”**

### SYS-080 Keepsakes and Snacks

Location HUD/reward; two separate cards shown only when relevant. SYS-080A prerequisite first acquired Keepsake: **“A Keepsake changes your expedition's rules. Read its description to see when it helps and what it costs.”** SYS-080B prerequisite first held Snack: **“Snacks are items you can use. Read a Snack's effect before using it. Using one spends that Snack.”** Goal inspect actual item; action inspect or dismiss, no consumption required; success acknowledgement. Humor Jordan **“Emergency snacks. Finally, my training matters.”** Success **“Use it when it helps.”** Hint **“You do not have to use it now.”** Read actual held items; state unchanged unless player independently uses one. Fallback existing tooltip. 13 seconds each; no universal Snack effect or recharge is invented.

### SYS-090 Party play

Location first multiplayer handoff; prerequisite party mode only. Instruction **“You each have your own Tricks and supplies. Read whose turn or choice is shown before acting.”** Map variant **“Vote for the route you want. The game resolves the votes; one player's vote is not everyone's agreement.”** Fort variant **“Mend helps a friend instead of resting yourself. Clone copies a friend's Trick for your deck this expedition. Read the choice before confirming.”** Goal/action/success follow actual active seat and actual voting/action result; no new shared control scheme. Humor optional Jordan **“Team meeting! The chair is not on the team. Yet.”** Success **“The result is shown on the board.”** Hint **“Check the active player's name.”** Fallback current handoff/choice UI. Read party active seat, choices and vote results; writes only existing action. 14–17 seconds each; no solo interruption.

## Revisit and shortened support

### HELP-001 Battle help

Proposed menu entry **“How Scuffles work”** in Settings; location text modal, any player; prerequisite none, no progress change. This entry is not in the audited build. A live tutorial replay should not reset the current expedition. Simpler alternative: static help pages using the existing modal component, accessed through a proposed button. Existing systems alone provide card, intent, status and item tooltips, plus pile viewers; they do not provide a complete tutorial revisit. No-new-feature fallback: put pages 2, 3 and 5 into the existing Nerve, Guard/Courage and End Turn tooltip text respectively, and retain the existing card/pile viewers. A complete sequential replay of explanations still requires the proposed Help button.

Exact pages:

1. **“A Scuffle uses turns. Read the enemy's next move. Then choose your Tricks. You can take time to think.”**
2. **“Tricks cost Nerve. Compare a Trick's cost with your current Nerve. Nerve refills at the start of your turn; other effects can change it.”**
3. **“Guard usually absorbs damage before Courage. Guard normally clears at the start of your turn. Read special rules when they appear.”**
4. **“At zero Courage you are out of the Scuffle. A failed expedition never permanently costs you your pet.”**
5. **“Choose End Turn when you're ready. You may leave Nerve unspent. The best move depends on this turn's cards and enemies.”**
6. **“Mouse: point to a Trick to read it. Click it and choose a target if asked, or drag it onto a target.”**
7. **“Keyboard: Left and Right select a Trick. Up uses it. If it needs a target, Left and Right choose; Up confirms. E ends your turn.”**
8. **“Q opens Draw. W opens Discard. D opens your deck. These views let you read your Tricks.”**
9. **“Controller: left and right select a Trick. Confirm uses it. When aiming, choose a target and confirm again. The alternate-action button ends your turn.”**

Buttons **“Back”**, **“Next”**, **“Close”**; no timer. Display actual controller-family glyphs if implemented, otherwise omit page 9 and provide verified platform control reference. Do not print Nintendo/A or PlayStation labels by guessing custom Steam Input bindings. Named buttons are the primary accessible text.

### HELP-010 Returning player

Existing behavior skips story once completed/skipped or a Companion has been freed. Proposed optional selection prompt: **“Want a quick refresher?”** Choices **“Read battle help”** and **“Start expedition”**. No default reread. Success returns to unchanged selection. Fallback retain current skip behavior plus existing tooltips. No new skip reward or penalty.

## Minimal existing presentation version

If no progressive lesson resolver is built, keep the existing eight-step Coach and replace only authored text and selectors. This supplies a workable, simpler alternative but cannot automatically verify every learning action or offer inline rescue hints.

1. **“This is a Scuffle. You take turns. Take your time. The sign above the Dust Bunny shows its next move.”** Got it.
2. **“These are your Tricks. Read what each does. A Trick's number is its Nerve cost; your current Nerve is beside your hand.”** Got it.
3. **“Courage keeps you in the Scuffle. Guard usually stops damage first. Guard normally clears at the start of your next turn.”** Got it.
4. **“Nerve refills at the start of your turn. Spend it on Tricks that help. You do not have to spend it all.”** Got it.
5. **“Play any Trick you can afford. Drag it to a target, or select it with Left or Right and press Up. Choose a target if asked.”** Wait for `card:play`; Skip remains escape from stale wait.
6. **“Check what changed. You can play more Tricks if they help.”** Got it.
7. **“Choose End Turn when you're ready, or press E. Then the Dust Bunny acts.”** Wait for local player `turn:end`.
8. **“Read the enemy plan. Check your Tricks and Nerve. Play what helps. End your turn when you're ready.”** Got it.

Do not claim the coach verified inspection on acknowledgement cards. If a battle ends before all cards, show TUT-090 on the following story page. Appending that prose uses existing page rendering, but routing remains a proposed edit. Shipping any version still requires code integration and display/input verification; none was performed here.

