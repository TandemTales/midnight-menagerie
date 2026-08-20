# The Withered Hedge Maze

_Source: Midnight Menagerie Design.docx, lines 22411-23397_

# The Withered Hedge Maze
Companion: Truffle Boss: The Gardener of Rot Region identity: Regeneration, quills, retaliation, decomposition, persistence, changing states through damage, and creatures becoming stranger as they fall apart
The Withered Hedge Maze should feel like a garden that refuses to finish dying.
Dead leaves crawl back onto branches.
Mushrooms grow from broken topiary.
Rotten hedges knit themselves together overnight.
Scarecrows keep functioning after losing half their stuffing.
Everything decomposes, but decomposition simply creates material for the next thing.
The Impossible Greenhouse was about unchecked growth.
The Withered Hedge Maze is about what happens after growth ends.
Its central combat lesson is:
Damage is not always progress in a straight line.
Truffle belongs here naturally. Truffle survives, regenerates, retaliates with quills, and treats cartoonish decay less like death and more like an inconvenient condition.
# 1. Hedge Maze enemy roster
The six ordinary enemies are:
Mildew Puff
Briar Lump
Rotcap
Wilted Scarecrow
Compost Crawler
Thorn Topiary
The three Big Scares are:
The Mold Minotaur
The Briar Idol
The Carrion Hedge
Boss:
The Gardener of Rot
# 2. Regional mechanic: Decay States
Several Maze enemies change through Decay States.
The basic language is:
Fresh
Withered
Rotten
These are not universal status effects with identical rules.
Each enemy explains what its own Decay States do.
The general pattern is:
Fresh creatures are stable.
Withered creatures become less defensive.
Rotten creatures become unstable, aggressive, regenerative, or otherwise strange.
This lets the region explore deterioration without simply creating another poison mechanic.
# 3. Mildew Puff
Role: Introductory retaliation buildup enemy Courage: 26
A fuzzy ball of pale green mold rolls through the hedges like a tumbleweed.
It emits an offended little puff whenever struck.
### Core mechanic: Disturbed
Whenever Mildew Puff takes Attack damage:
Gain 1 Disturbed.
Maximum 3.
Disturbed does not retaliate immediately.
Its next damaging move gains 2 damage per Disturbed.
Then all Disturbed is removed.
### Moves
Puff
Deal 5 damage plus 2 per Disturbed.
Remove all Disturbed.
Mildew Cloud
Apply Mildewed.
Gain 5 Guard.
### Mildewed
The next time the player gains Guard:
Gain 3 less.
Then remove Mildewed.
Mildewed does not stack.
### Soft Roll**
Deal 6 damage.
### Pattern
Mildew Cloud.
Soft Roll.
Puff.
Repeat.
### Design purpose
Attacking is still correct.
But several small attacks may produce more retaliation buildup than one decisive burst.
This gently introduces Truffle's retaliation theme.
# 4. Briar Lump
Role: Quill retaliation enemy Courage: 35
A round mass of thorny hedge clippings hops around like an angry hedgehog shaped bush.
### Core mechanic: Briars
Briar Lump begins with 4 Briars.
Whenever it takes damage from an Attack Trick:
Deal 2 retaliation damage.
Then lose 1 Briar.
Maximum four retaliation triggers before the Briars are gone.
### Bare
At 0 Briars:
Briar Lump becomes Bare.
While Bare:
Take 20 percent additional damage.
Its attacks deal 2 additional damage.
### Regrow
After one enemy turn while Bare:
Use:
Bristle Up
Restore all 4 Briars.
Gain 7 Guard.
Deal no damage.
### Other moves
Briar Bump
Deal 8 damage.
Rolling Thorns
Deal 4 damage twice.
### Pattern
Briar Bump.
Rolling Thorns.
Briar Bump.
Check Bristle Up if Bare.
Repeat.
### Strategic question
Chip away through retaliation?
Strip all Briars quickly and exploit Bare?
Use non Attack damage?
Wait until enough Courage and Guard are available to commit?
# 5. Rotcap
Role: Regeneration enemy Courage: 39
A huge mushroom creature walks on a bundle of roots.
Its cap sags, tears, and regrows constantly.
### Core mechanic: Regenerate
At the end of the enemy turn:
If Rotcap lost fewer than 8 Courage during the previous player turn:
Recover 6 Courage.
If it lost 8 or more:
Regeneration is suppressed for that turn.
### Maximum recovery
Rotcap cannot recover above its starting Courage.
### Moves
Cap Slam
Deal 9 damage.
Spore Shake
Deal 5 damage.
Gain 7 Guard.
Rot In Place
Lose 4 Courage.
Its next Regeneration restores 10 instead of 6 if not suppressed.
### Pattern
Cap Slam.
Spore Shake.
Rot In Place.
Cap Slam.
Repeat.
### Why Rot In Place matters
Rotcap willingly damages itself because decay fuels its recovery.
The player may deliberately suppress the next regeneration or allow it to waste a turn hurting itself.
# 6. Wilted Scarecrow
Role: Progressive deterioration enemy Courage: 43
An old scarecrow drags itself through the hedge maze.
It gets less intact and more dangerous throughout combat.
### Core mechanic: Falling Apart
Wilted Scarecrow changes at two Courage thresholds.
## Stitched
Above 28 Courage.
Gain 4 Guard at the start of its turn.
### Moves
Rake Swing
Deal 8 damage.
Stuffing Brace
Gain 10 Guard.
## Ragged
28 through 15 Courage.
Lose automatic Guard.
Attacks deal 2 additional damage.
Gain access to:
Loose Arm
Deal 5 damage twice.
## Barely Together
14 Courage or less.
Attacks deal 5 additional damage.
At the end of its own turn:
Lose 2 Courage.
### Special effect
The first time it enters Barely Together:
It leaves 1 Straw Pile.
Straw Pile has 6 Integrity.
If Straw Pile survives until the Scarecrow's next turn:
The Scarecrow recovers 5 Courage.
Destroying the Straw Pile prevents this.
### Pattern
Rake Swing.
Stuffing Brace.
Rake Swing.
Then substitute Loose Arm as its body deteriorates.
### Design purpose
The Scarecrow becomes more dangerous as it approaches defeat, but also begins destroying itself.
The player wants to avoid getting trapped in the dangerous final state for several turns.
# 7. Compost Crawler
Role: Cannibalistic support enemy Courage: 34
A squat creature made from mulch, dead leaves, apple cores, twigs, and garden scraps.
It sees damaged creatures as ingredients.
### Core mechanic: Scavenge
If another enemy is missing at least 10 Courage:
Compost Crawler can use:
Take a Little
That enemy loses 5 Courage.
Compost Crawler recovers 8 Courage.
Gain 1 Compost.
Maximum 3 Compost.
Take a Little cannot defeat the target.
It leaves them at minimum 1 Courage.
### Compost
Each Compost gives Compost Crawler:
2 additional maximum Guard whenever it gains Guard.
At 3 Compost:
Its next attack gains 4 additional damage.
Then all Compost is removed.
### Other moves
Mulch Slap
Deal 7 damage.
Pile Up
Gain 8 Guard plus 2 per Compost.
### Behavior
If an eligible ally exists:
Take a Little.
Otherwise:
Mulch Slap.
Pile Up.
Repeat.
### Strategic effect
Damaging another enemy may cause the Crawler to cannibalize it.
That can sometimes be useful.
The player may intentionally leave a low priority enemy wounded so the Crawler spends turns feeding instead of attacking.
# 8. Thorn Topiary
Role: Persistent retaliation threat Courage: 47
A once elegant animal shaped hedge has become a dense mass of black thorns.
Its original shape is almost impossible to recognize.
### Core mechanic: Thorn Crown
Thorn Topiary begins with 1 Thorn Crown.
At the end of every enemy turn:
Gain 1 Thorn Crown.
Maximum 4.
Whenever the player damages Thorn Topiary with an Attack Trick:
Take retaliation damage equal to current Thorn Crown.
This does not remove Thorn Crown.
### Prune
If one Attack Trick deals at least 12 damage:
Remove 2 Thorn Crown after the attack resolves.
Minimum 0.
### Moves
Branch Swipe
Deal 8 damage.
Tangle
Gain 9 Guard.
Gain 1 additional Thorn Crown.
Overgrown Charge
Deal 6 damage plus 3 per Thorn Crown.
Then lose 1 Thorn Crown.
### Pattern
Branch Swipe.
Tangle.
Overgrown Charge.
Repeat.
### Design purpose
Repeated weak attacks become increasingly painful.
Large committed attacks can actually prune the defense.
That creates the inverse of Briar Lump.
Briar Lump has finite retaliation that gets stripped.
Thorn Topiary continually regrows retaliation unless actively pruned.
# 9. Early Hedge Maze Scuffles
### Scuffle 1
Mildew Puff
Purpose:
Introduce retaliation buildup.
### Scuffle 2
Rotcap
Purpose:
Introduce regeneration thresholds.
### Scuffle 3
Briar Lump
Purpose:
Introduce finite Quill style retaliation.
### Scuffle 4
Wilted Scarecrow
Purpose:
Introduce deterioration states.
# 10. Standard Hedge Maze Scuffles
### Scuffle 5
Rotcap
Mildew Puff
The player must keep pressure on Rotcap without carelessly overloading Mildew Puff.
### Scuffle 6
Briar Lump
Compost Crawler
Damaging Briar Lump may give the Crawler an opportunity to feed on it.
### Scuffle 7
Wilted Scarecrow
Rotcap
Both enemies behave differently depending on how aggressively they are damaged.
### Scuffle 8
Thorn Topiary
Solo introduction.
The player gets room to understand Thorn Crown and Pruning.
# 11. Advanced Hedge Maze Scuffles
### Scuffle 9
Thorn Topiary
Rotcap
One enemy wants large attacks.
The other simply wants consistent pressure.
### Scuffle 10
Mildew Puff
Wilted Scarecrow
The player may want to burst through the Scarecrow's dangerous final state while avoiding unnecessary Disturbed buildup on the Puff.
### Scuffle 11
Compost Crawler
Rotcap
The Crawler can damage Rotcap, then Rotcap may regenerate that damage.
They form a self sustaining little ecosystem.
### Scuffle 12
Briar Lump
Thorn Topiary
A retaliation focused encounter.
The player must decide where direct Attack damage is least costly.
### Scuffle 13
Wilted Scarecrow
Compost Crawler
The Crawler can repeatedly feed on the deteriorating Scarecrow without killing it.
### Scuffle 14
Rotcap
Thorn Topiary
Compost Crawler
The hardest baseline Maze formation.
Rotcap regenerates.
Topiary punishes careless offense.
Crawler converts injured allies into its own resources.
This encounter is designed to punish automatic focus fire and reward deliberate damage allocation.
# 12. Encounter generation rules
Thorn Topiary cannot appear before the player has completed at least two Maze Scuffles.
Compost Crawler cannot appear alone in ordinary encounters.
Two Thorn Topiaries cannot appear together at Haunt 0.
Two Compost Crawlers cannot appear together at Haunt 0.
Rotcap should appear alone before appearing with Compost Crawler.
Wilted Scarecrow cannot recover above its Ragged threshold from Straw Pile recovery once it has entered Ragged.
This prevents awkward state reversal.
Scuffle 14 belongs only to the advanced pool.
# 13. Big Scare: The Mold Minotaur
Courage: 146
Role: Regeneration plus maze charge timing
A huge topiary bull creature covered in mushrooms and mildew crashes through hedge walls.
Its horns are crooked branches.
### Core mechanic: Maze Charge
The Mold Minotaur cycles through:
Searching
Lining Up
Charging
### Searching
Gain 8 Guard.
The Minotaur's next direction is shown.
### Lining Up
Prepare a Charge.
Gain 1 Momentum.
Maximum 3.
### Charging
Deal 10 damage plus 5 per Momentum.
Lose all Momentum.
### Player interaction: Lose the Trail
Whenever the Minotaur takes at least 16 damage during one player turn while Lining Up:
It becomes Lost.
Lose 1 Momentum.
Its next action becomes:
Wrong Turn
Gain 10 Guard.
Deal no damage.
Then return to Searching.
### Regrowth
At the end of every second enemy turn:
If the Minotaur did not lose at least 10 Courage during the preceding player turn:
Recover 7 Courage.
### Moves
Hedge Horn
Deal 10 damage.
Snort Spores
Deal 6 damage.
Apply Mildewed.
Line Up
Gain Momentum.
Prepare Charge.
### Strategic identity
The player can interrupt Charges through focused offense.
Or accept the Charge and instead maintain steady damage to suppress regeneration.
Doing both every cycle may not be possible.
# 14. Big Scare: The Briar Idol
Courage: 151
Role: Retaliation mastery test
An old garden statue has been completely swallowed by thorny vines.
Only its stone eyes remain visible.
### Core mechanic: Briar Rings
The Idol has three Briar Rings.
Each active Ring causes 1 retaliation damage whenever the player damages the Idol with an Attack Trick.
So with all three Rings:
Each Attack causes 3 retaliation damage.
### Breaking Rings
Each Ring has 18 Integrity and can be targeted separately.
Destroying a Ring removes one retaliation damage permanently.
### But
Whenever a Ring is destroyed:
The Briar Idol gains 1 Fury.
Each Fury gives 2 attack damage.
Maximum 3.
### Idol moves
Stone Palm
Deal 11 damage.
Briar Sweep
Deal 4 damage three times.
Rooted Silence
Gain 14 Guard.
Each surviving Briar Ring gains 6 Guard.
Angry Growth
If one or more Rings have been destroyed:
Gain 1 Fury.
Restore 1 destroyed Ring with 8 Integrity.
Can occur only once during the fight.
### Strategic choices
Destroy Rings and make the Idol more aggressive.
Ignore Rings and accept retaliation.
Use indirect damage.
Burst through while maintaining healing or defense.
There is no single intended answer.
# 15. Big Scare: The Carrion Hedge
Courage: 160
Role: Persistent regeneration and collapse
This is an entire section of dead hedge that has become one enormous crawling creature.
Its branches are bare.
New shoots appear from rotten wood every few seconds.
### Core mechanic: Rot Sections
The Carrion Hedge has three sections:
Crown
Middle
Roots
Each section has 24 Integrity.
The main body can be attacked normally.
Each intact section provides a passive effect.
### Crown
Attacks deal 3 additional damage.
### Middle
Gain 6 Guard at the beginning of the enemy turn.
### Roots
Recover 5 Courage at the end of the enemy turn.
### Destroying Sections
Destroying a section disables that passive.
However:
Every destroyed section begins a Regrowth Countdown 3.
When it reaches 0:
The section returns with 12 Integrity.
### Preventing Regrowth
When the main body falls below 50 percent Courage:
Destroyed sections stop regrowing.
### Moves
Dead Branches
Deal 12 damage.
### Drag Through the Hedge
Deal 5 damage twice.
### Feed the Roots
Recover 6 Courage.
Reduce every Regrowth Countdown by 1.
### Collapse Forward
Lose 5 Courage.
Gain 15 Guard.
Its next damaging move deals 5 additional damage.
### Strategic question
Strip sections early.
Race the body to half Courage.
Repeatedly suppress the Root section.
Or simply overpower the whole thing.
# 16. The Gardener of Rot
Boss Courage: 405
The Gardener of Rot is the Head Gardener's philosophical opposite.
The Head Gardener wanted everything trimmed, ordered, cultivated, and controlled.
The Gardener of Rot believes all those distinctions are temporary.
Flowers become mulch.
Mulch becomes mushrooms.
Mushrooms feed roots.
Roots crack stone.
Nothing stays what it was.
The Gardener wears a decayed straw coat covered in mushrooms and thorny vines.
Its face is hidden behind a smiling wooden scarecrow mask.
A pair of rusted pruning shears hangs unused at its side.
It carries a compost fork instead.
Its philosophy is:
Nothing is ruined if something else can grow from it.
The danger is that it refuses to recognize when something wants to remain itself.
# 17. Core boss mechanic: The Decay Cycle
The Gardener continuously moves through three visible states:
Withered
Rotten
Regrown
The current state changes its abilities.
The player can influence how quickly the cycle advances.
## Withered
The Gardener is dry and brittle.
Takes 15 percent additional damage.
Attacks deal 2 less damage.
## Rotten
The Gardener becomes unstable.
Attack damage is normal.
Whenever damaged by an Attack Trick:
Deal 1 retaliation damage.
Maximum four triggers per player turn.
## Regrown
The Gardener is covered in new fungal and thorn growth.
Gain 7 Guard at the start of its turn.
Attacks deal 3 additional damage.
# 18. Advancing the Decay Cycle
The state normally advances after two Gardener actions.
Withered becomes Rotten.
Rotten becomes Regrown.
Regrown becomes Withered.
The next state and number of actions remaining are always displayed.
### Player acceleration
If the player deals at least 22 Courage damage during one turn:
Advance the Decay Cycle by one step after the player turn.
This can happen once per turn.
### Why acceleration can help
The player may want to:
Push Rotten into Regrown to stop retaliation.
Push Regrown into Withered to create vulnerability.
Or keep Withered active by avoiding the threshold.
This means heavy damage changes the boss's state rather than simply being universally correct.
# 19. Phase one moves
From 405 through 231 Courage.
### Rusted Fork
Deal 12 damage.
### Moldy Sweep
Deal 5 damage twice.
Apply Mildewed if both hits deal Courage damage.
### Compost Toss
Create one Rot Pile.
Maximum two Rot Piles.
Gain 6 Guard.
### Let It Break Down
Lose 6 Courage.
Gain 1 Compost.
Each Compost makes the next Regeneration effect restore 3 additional Courage.
Maximum 3.
### Reclaim
Used if at least one Rot Pile exists.
Consume one Rot Pile.
Recover 8 Courage plus 3 per Compost.
Remove all Compost.
# 20. Rot Piles
A Rot Pile has:
Integrity: 12
Rot Piles do nothing on their own.
The Gardener can consume them through Reclaim.
### Player options
Destroy them.
Ignore them.
Allow the boss to spend a turn healing from them instead of attacking.
Sometimes Reclaim is actually a welcome tempo loss.
That is intentional.
# 21. Phase one sequence
Compost Toss.
Rusted Fork.
Moldy Sweep.
Let It Break Down.
Reclaim if a Rot Pile exists.
Otherwise Rusted Fork.
Repeat.
The Decay Cycle runs independently of the move pattern.
This creates varying combinations.
For example:
Rusted Fork during Withered is modest.
Rusted Fork during Regrown is much more dangerous.
# 22. The first key decision
The player controls two related clocks.
The Gardener's Courage.
The Decay Cycle.
A high damage turn may push the boss toward defeat but also move it into a more dangerous state.
A low damage setup turn may preserve a favorable state.
This is the heart of the fight.
# 23. Phase transition
At 230 Courage:
The Gardener uses:
Good Soil Needs Something Dead
Destroy all Rot Piles.
Remove all Compost.
The maze walls collapse inward.
Three huge dead hedge shapes rise around the arena.
These are:
The Bramble
The Fungus
The Husk
Phase two begins.
# 24. Phase two secondary growths
These are battlefield objects rather than full enemies.
Each has:
Integrity: 25
Only two can be active at the same time.
At phase transition:
Two of the three are selected randomly.
The third remains dormant.
## The Bramble
While active:
Attack Tricks that hit The Gardener cause 1 additional retaliation damage.
## The Fungus
At the end of The Gardener's turn:
Recover 4 Courage.
## The Husk
At the beginning of The Gardener's turn:
Gain 6 Guard.
### Destroying a Growth
It becomes Composted.
After two enemy turns:
The dormant Growth takes its place with 15 Integrity.
This means the battlefield keeps changing.
# 25. Phase two Decay Cycle
The cycle still uses:
Withered.
Rotten.
Regrown.
But now each state interacts with the secondary Growths.
## Withered
Secondary Growths lose 5 Integrity at the beginning of the enemy turn.
## Rotten
The Gardener gains 1 Compost whenever a Growth is destroyed.
Maximum 2.
Each Compost grants 2 attack damage.
## Regrown
Each active Growth gains 5 Guard at the beginning of the enemy turn.
This creates a stronger relationship between the boss and its environment.
# 26. Phase two moves
### Thorn Fork
Deal 15 damage.
### Rotting Flurry
Deal 4 damage four times.
### Feed the Maze
One active Growth recovers 8 Integrity.
The Gardener gains 8 Guard.
### Everything Returns
If one Growth is currently Composted:
Reduce its return Countdown by 1.
Deal 8 damage.
Otherwise:
Create 1 Compost and deal 10 damage.
### Tear Yourself Open
Lose 8 Courage.
Advance the Decay Cycle one step immediately.
Its next damaging move deals 5 additional damage.
### Pattern
Thorn Fork.
Feed the Maze.
Rotting Flurry.
Everything Returns.
Tear Yourself Open.
Repeat.
# 27. Phase two tactical possibilities
The player may deliberately destroy Bramble before a high Attack turn.
Or keep Fungus alive because 4 healing per turn is less dangerous than Bramble retaliation.
A defensive deck may prefer Husk to Fungus.
A high burst deck may exploit Withered to damage both boss and Growths efficiently.
The boss should never force one universally correct target priority.
# 28. Compost instability
Whenever the Gardener reaches 2 Compost during phase two:
Its next move becomes:
Compost Burst
Deal 14 damage.
Then lose all Compost.
All active Growths lose 6 Integrity.
### Why this matters
The boss's own power can damage its garden.
The player may intentionally allow Compost to build because the Burst helps dismantle the secondary Growths.
Again, enemy resources can sometimes be useful to the player.
# 29. Final escalation
At 85 Courage or less:
The Gardener gains:
Beautiful Ruin
Whenever an active Growth is destroyed:
The Gardener loses 5 Courage.
Whenever the Decay Cycle advances:
The Gardener loses 3 Courage.
The boss is now collapsing faster than it can regenerate.
Regeneration from The Fungus drops from 4 to 2 Courage.
This prevents a long attrition slog at the end.
# 30. Optional mastery condition
If the player defeats The Gardener while it is Withered:
Gain a small bonus chance at a region themed passive reward.
This should not affect permanent progression.
It is simply a flavorful optional combat objective.
The player has defeated decay during its most vulnerable moment.
# 31. Why Truffle feels especially good here
### Quills
Briar Lump, Thorn Topiary, Briar Idol, and The Gardener all present hostile versions of retaliation.
A Truffle player already understands the value of making enemies hurt themselves for attacking.
### Regeneration
Rotcap and The Carrion Hedge teach different kinds of recovery.
Truffle's regeneration can use similar timing while remaining mechanically distinct.
### Decay
Truffle does not treat deterioration as failure.
Many Truffle builds should become stronger or stranger after taking damage or entering particular states.
### Persistence
Bone themed recursion was about bringing things back.
Truffle's persistence should feel different.
Truffle stays dangerous because Truffle never quite stops functioning in the first place.
### Damage tolerance
Some Truffle strategies may willingly absorb small retaliation or Courage loss because they have tools to recover or exploit it.
That can make Maze decisions feel especially natural.
# 32. Boss narrative outcome
### Truffle not yet rescued
The Gardener of Rot is fascinated by Truffle.
Truffle is, in its view, the perfect proof that decay is beautiful.
A zombie hedgehog that keeps walking.
Keeps eating.
Keeps growing quills.
Keeps being Truffle.
The Gardener has repeatedly tried to bury Truffle in compost beds, fungal circles, and rotting hedges to see what Truffle becomes next.
Truffle would prefer snacks and freedom.
Defeating The Gardener allows Truffle to decide whether being a little bit dead is anybody else's business.
### Truffle already rescued and currently active
This becomes Truffle's Legacy homecoming.
The thematic statement is:
Changing over time does not mean someone else gets to decide what you should become next.
### Another Companion active
Normal regional boss reward.
No Truffle Legacy advancement.
# 33. Multiplayer scaling
Use the established baseline.
2 players:
160 percent Courage.
3 players:
210 percent.
4 players:
255 percent.
The Hedge Maze should create cooperation around who absorbs retaliation, who suppresses regeneration, and who handles secondary growths.
# 34. Mildew Puff multiplayer
Disturbed is shared.
Any player's Attack damage can increase it.
Puff targets one player.
At 3 Disturbed:
Puff hits all players for reduced damage.
Recommended:
8 damage each.
Then Disturbed resets.
# 35. Briar Lump multiplayer
Briars track each player separately.
Each player can trigger retaliation from each Briar once per round.
Once all four global Briars are stripped:
Briar Lump becomes Bare for the entire team.
# 36. Rotcap multiplayer
Regeneration checks team damage during the full round.
Recommended suppression threshold:
2 players: 13
3 players: 17
4 players: 21
If the team meets the threshold:
No regeneration.
# 37. Wilted Scarecrow multiplayer
Decay States remain global.
Loose Arm can target two different players when possible.
Straw Pile Integrity scales modestly:
2 players: 9
3 players: 12
4 players: 14
# 38. Compost Crawler multiplayer
Take a Little remains an enemy side action.
Compost remains global.
At 3 Compost:
Its empowered attack targets the player with the lowest percentage Courage.
# 39. Thorn Topiary multiplayer
Each player receives retaliation according to current Thorn Crown when their own Attack hits.
Prune uses combined team damage from a single player's Attack Trick, not total team damage.
This preserves the reward for high impact Attacks.
# 40. Mold Minotaur multiplayer
Charge targets one player.
The target is shown during Lining Up.
If Lost is triggered through team damage:
The attack is canceled for everyone.
Damage threshold:
2 players: 26
3 players: 35
4 players: 43
# 41. Briar Idol multiplayer
Briar Rings remain shared targets.
Retaliation applies independently to each player's Attack Tricks.
A player with good recovery may volunteer to focus the Idol while teammates break Rings.
# 42. Carrion Hedge multiplayer
Sections scale less aggressively than the main body.
Suggested Section Integrity:
2 players: 34
3 players: 43
4 players: 51
Regrowth Countdowns remain three enemy turns.
Below half body Courage:
Destroyed Sections remain gone.
# 43. Gardener of Rot multiplayer Decay Cycle
The Decay Cycle is shared.
The team can accelerate it once per round.
Recommended damage threshold:
2 players: 34
3 players: 45
4 players: 55
Only one acceleration can occur per round regardless of excess damage.
# 44. Multiplayer Growths
Phase two uses:
2 active Growths with one or two players.
3 active Growths with three or four players.
With three Growths active, all three types appear simultaneously.
This creates substantially more battlefield management for larger groups.
### Growth Integrity
2 players: 36
3 players: 45
4 players: 54
# 45. Multiplayer retaliation
Bramble retaliation applies separately to each player.
One player does not consume or neutralize another player's retaliation trigger.
This gives naturally defensive or regenerative Companions a reason to volunteer for direct offense.
# 46. Multiplayer cooperative opportunities
One player can keep Rotcap regeneration suppressed.
Another can focus the primary target.
A Truffle player can deliberately absorb Briar retaliation while teammates avoid it.
A high damage Companion can Prune Thorn Topiary.
A defensive player can prepare for Mold Minotaur's announced Charge target.
The team can decide whether Fungus healing or Bramble retaliation is the more dangerous phase two Growth.
The players can intentionally force the Gardener into Withered just before a teammate's large burst turn.
That is the kind of coordinated planning the Maze should encourage.
# 47. Haunt Level progression
### Haunt 1
Ordinary enemies gain approximately 8 percent Courage.
Big Scares and boss gain approximately 6 percent.
### Haunt 2
Advanced Maze formations enter earlier.
### Haunt 3
Mildew Puff can hold 4 Disturbed.
Its scaling remains 2 damage per Disturbed.
### Haunt 4
Briar Lump begins advanced encounters with 5 Briars.
### Haunt 5
Rotcap's regeneration suppression threshold increases from 8 to 10 Courage in solo play.
### Haunt 6
Wilted Scarecrow enters Barely Together at 17 Courage instead of 14.
Its dangerous final state lasts longer.
### Haunt 7
Compost Crawler can hold 4 Compost.
Its Guard scaling remains unchanged.
Its empowered attack triggers at 3 or more.
### Haunt 8
Thorn Topiary begins advanced encounters with 2 Thorn Crown.
### Haunt 9
Big Scares receive upgrades.
Mold Minotaur begins with 1 Momentum.
Briar Idol begins with one reinforced Briar Ring carrying 8 Guard.
Carrion Hedge begins with its Root section restored to full Integrity even if altered by a prior special event.
### Haunt 10
The Gardener of Rot begins combat in Rotten instead of Withered.
Its first Decay Cycle state is therefore more dangerous.
# 48. Higher Haunt behavior upgrades
Potential later upgrades include:
Mildew Puff may preserve some Disturbed after using Puff.
Briar Lump may regrow only part of its Briars, but do so faster.
Rotcap may deliberately enter a deeper Rot state that heals more but lowers its defense.
Wilted Scarecrow may throw detached parts as temporary battlefield objects.
Compost Crawler may feed on defeated enemy remains.
Thorn Topiary may transfer Thorn Crown to another plant enemy.
Mold Minotaur may fake one Charge direction before committing.
Carrion Hedge may move recovery between Crown, Middle, and Roots.
The Gardener of Rot may choose to delay a favorable Decay Cycle transition in exchange for self damage.
These upgrades should increase decision complexity rather than simply increase damage.
# 49. Hedge Maze themed run reward concepts
### Bent Garden Fork
The first time each combat an enemy recovers Courage, deal 3 damage to it.
### Truffle Brush
The first three times each combat you take retaliation damage, reduce it by 1.
### Dead Rose
The first time each combat you fall below half Courage, draw 1 Trick and gain 4 Guard.
### Compost Charm
The first time each combat one of your own effects causes you to lose Courage, gain 1 Nerve next turn.
### Briar Glove
After taking Attack damage three times in one combat, your next Attack Trick deals 5 additional damage.
Once per combat.
### Maze Key
Hedge gates, gardener doors, root tunnels, ruined gazebos, potting sheds, and concealed garden passages become easier to access during exploration.
# 50. Hedge Maze Curiosity hooks
### The Hedge That Knows Your Name
The active Kid's name has grown naturally into the branches.
Cut it out.
Photograph it.
Follow where the branches point.
Leave it alone.
### The Mushroom Circle
Sit inside.
Step over it.
Dig beneath it.
Place a Companion in the center.
The circle may reveal a memory of an animal that lived in the maze decades ago.
### The Half Eaten Pet Treat
It is fresh.
The packaging comes from a store near the kids' neighborhood.
This can become a missing pet Clue.
### The Dead Fountain
The fountain contains no water.
Instead, dead leaves continuously bubble upward.
Something valuable lies at the bottom.
### The Scarecrow With a Collar
A pet collar has been tied around the scarecrow's neck.
The tag belongs to one of the older Menagerie Companions.
The Companion may recognize it.
### The Compost Ledger
The Gardener records what has been "returned to the soil."
Many entries are not deaths.
They are discarded toys.
Shed fur.
Old collars.
Broken furniture.
Dead plants.
Unwanted memories.
This establishes that the mansion conceptually treats anything no longer being used as material to be repurposed.
# 51. Important Truffle lore
The Hedge Maze is a good place to clarify that Truffle's zombie appearance does not mean Truffle literally died in the conventional sense.
The mansion's magic interpreted:
Old age.
Injury.
Hibernation.
Burrowing.
Decay.
And hedgehog resilience
into a supernatural form built around persistence.
Truffle became something that behaves like a cartoon zombie because the house transformed the idea:
This little animal keeps going.
into a supernatural rule.
That keeps Truffle cute and spooky without requiring a grim origin.
# 52. Architectural identity
The established Withered Hedge Maze contains 20 rooms.
A strong authored set would be:
Moon Gate
Outer Hedge Walk
Dead Rose Court
Topiary Lane
Mushroom Circle
Sunken Fountain
Rotting Gazebo
Scarecrow Field
Briar Tunnel
Compost Yard
Withered Orchard
Gardener's Shed
Tool Arbor
Thorn Court
Dead End Garden
Spiral Hedge
Forgotten Picnic Lawn
Root Arch
Inner Maze
Gardener of Rot's Clearing
The region should feel much more open than most indoor wings, but the hedges create corridor like movement.
# 53. Maze Connectors
Natural Connectors include:
Hedge tunnels.
Root passages.
Broken garden walls.
Animal burrows.
Drainage channels.
A collapsed gate into the Mansion Graveyard.
A root tunnel into the Impossible Greenhouse.
A concealed servants' gardening route back toward Kitchens and Cellars.
A moonlit path toward the Pumpkin Grounds.
A hedge opening that occasionally leads straight into a mansion corridor instead of outside.
This lets the exterior regions feel physically entangled with the interior house.
# 54. Blueprint investigation progression
Early notes:
"Maze is NOT same every time."
Later:
"Dead plants keep moving."
Later:
"Truffle was here a LONG time."
Later still:
"Stuff house doesn't want gets sent here."
Eventually:
"House doesn't throw anything away."
That last line should become important to the larger mystery.
The mansion's inability to let go applies not just to animals.
It applies to possessions.
Rooms.
Memories.
Names.
Broken things.
Everything.
The house does not understand disposal.
It only understands keeping or repurposing.
# 55. What the Withered Hedge Maze teaches
By the time the player reaches The Gardener of Rot, the region has taught:
Damage can make an enemy more dangerous before it makes them easier.
Retaliation can be finite, persistent, or conditional.
Regeneration can be suppressed through damage thresholds rather than simply outpaced.
Some enemies willingly hurt themselves because deterioration benefits them.
Damaged enemies can become resources for other enemies.
A creature near defeat may behave fundamentally differently from one at full Courage.
Destroying protective layers can expose vulnerability while increasing aggression.
Regrowth creates timing windows rather than permanent resets.
A boss state can be manipulated by how much damage the player chooses to deal.
Decay does not necessarily mean an ending.
The thematic distinction between Truffle and The Gardener of Rot is important:
Truffle persists through change. The Gardener believes change gives it permission to redefine everything.
