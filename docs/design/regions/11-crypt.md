# The Crypt and Ossuary

_Source: Midnight Menagerie Design.docx, lines 21429-22410_

# The Crypt and Ossuary
Companion: Bones Boss: The Bone Curator Region identity: Recursion, dismantling, retrieval, buried pieces, rebuilding, discard, and deciding what should be destroyed versus temporarily taken apart
The Crypt and Ossuary should immediately establish that defeating something is not necessarily the end of it.
Skeletons collapse into pieces.
Skulls roll away.
Rib cages crawl toward new bodies.
Urns collect what remains.
Something in the dark keeps fetching the pieces back.
The central combat lesson is:
What gets left behind matters.
Bones fits naturally because Bones treats discard, retrieval, burying, fetching, and recursion as useful resources rather than simple loss.
# 1. Crypt enemy roster
The six ordinary enemies are:
Loose Tibia
Skull Roller
Urn Spirit
Ribcage Guard
Bone Heap
Crypt Fetcher
The three Big Scares are:
The Ribcage Knight
The Walking Ossuary
The Coffin Collector
Boss:
The Bone Curator
# 2. Regional mechanic: Remains
Certain Crypt enemies leave Remains when defeated.
Remains are temporary battlefield objects.
A basic Remains object has:
Integrity: 8
Remains do nothing by themselves.
After two enemy turns, unattended Remains crumble and disappear.
Certain enemies can:
Retrieve them.
Rebuild from them.
Consume them.
Attach them to themselves.
The player can attack Remains to destroy them early.
This creates a recurring question:
Do I spend damage cleaning up now, or gamble that the fight ends before those pieces matter?
Not every Crypt enemy leaves Remains.
That keeps the mechanic from becoming tedious.
# 3. Loose Tibia
Role: Introductory Remains enemy Courage: 23
A single animated leg bone hops aggressively toward the player.
It is absurdly determined.
### Core mechanic: Still Useful
When Loose Tibia is defeated:
Leave 1 Remains.
### Moves
Shin Kick
Deal 6 damage.
Hop Back
Gain 7 Guard.
Running Start
Its next Shin Kick deals 5 additional damage.
Gain 4 Guard.
### Pattern
Shin Kick.
Running Start.
Shin Kick.
Hop Back.
Repeat.
### Design purpose
Loose Tibia introduces Remains without possessing any recursion of its own.
The player first learns that a defeated enemy may leave something behind.
# 4. Skull Roller
Role: Recurring harassment enemy Courage: 28
A skull rolls around the floor, bites ankles, then rolls into inconvenient places.
### Core mechanic: Roll Away
After Skull Roller uses Chomp and Roll, it becomes Misplaced.
While Misplaced:
It cannot be targeted.
It does not act during its next turn.
After that skipped turn:
It returns with 5 Guard.
### Moves
Chomp and Roll
Deal 8 damage.
Become Misplaced.
Headbutt
Deal 6 damage.
Rattle
Gain 8 Guard.
Its next Chomp and Roll deals 3 additional damage.
### Pattern
Chomp and Roll.
Skip while Misplaced.
Return.
Headbutt.
Rattle.
Repeat.
### Design purpose
The Skull does not resurrect.
It repeatedly removes itself from the battlefield and comes back.
The player learns to time damage around availability.
# 5. Urn Spirit
Role: Death copying support enemy Courage: 30
A translucent spirit emerges from a cracked funerary urn.
Inside the ceramic vessel, tiny shapes move like memories.
### Core mechanic: Preserve
The first time another enemy is defeated:
Urn Spirit captures a Remembrance based on that enemy.
It can hold one Remembrance.
### Loose Tibia Remembrance
Next attack deals 4 additional damage.
### Skull Roller Remembrance
After its next attack, gain 7 Guard.
### Ribcage Guard Remembrance
Gain 10 Guard.
### Bone Heap Remembrance
Recover 6 Courage.
### Crypt Fetcher Remembrance
Retrieve one Remains and consume it to gain 8 Guard.
### Moves
Preserve
If it does not have a Remembrance and an ally has been defeated:
Capture that enemy's Remembrance.
Release Memory
Use the stored Remembrance.
Then clear it.
Urn Shard
Deal 7 damage.
Seal the Lid
Gain 9 Guard.
### Behavior
If a Remembrance exists:
Release Memory.
Otherwise:
Urn Shard.
Seal the Lid.
Repeat.
### Strategic effect
Kill order changes what tools the Urn Spirit receives.
# 6. Ribcage Guard
Role: Protector Courage: 38
A rib cage crawls on its own bones like a huge skeletal spider.
It tries to put itself around other creatures.
### Core mechanic: Cage
Ribcage Guard can Cage another enemy.
While Caged:
The first 10 Attack damage that enemy would take each player turn is redirected to Ribcage Guard.
Any remaining damage hits the original target normally.
### Moves
Cage Up
Cage another enemy.
Gain 5 Guard.
Rib Bash
Deal 8 damage.
Tighten
Gain 11 Guard.
The Caged enemy gains 5 Guard.
### Breaking the Cage
If Ribcage Guard loses at least 15 Courage during one player turn:
The Cage breaks immediately.
### On defeat
Ribcage Guard leaves 2 Remains rather than 1.
### Design purpose
This establishes a protector whose defeat creates more material for recursion.
Sometimes killing it first solves defense but creates future resources for other enemies.
# 7. Bone Heap
Role: Self rebuilding enemy Courage: 41
A pile of bones pulls itself into a different approximate skeleton every few seconds.
It never assembles correctly.
### Core mechanic: Collapse
The first time Bone Heap reaches 0 Courage:
It becomes Collapsed instead of being defeated.
Create a Bone Pile with 14 Integrity.
The Bone Heap disappears temporarily.
### Reassemble
After two enemy turns:
If the Bone Pile still exists:
Bone Heap returns with 20 Courage.
Then destroy the Bone Pile.
If the player destroys the Bone Pile first:
Bone Heap is defeated permanently.
### Second defeat
If Bone Heap returns and reaches 0 Courage again:
It is defeated permanently.
No second Bone Pile is created.
### Moves
Bone Swing
Deal 9 damage.
Rearrange
Gain 10 Guard.
Its next Bone Swing deals 4 additional damage.
Throw a Piece
Deal 6 damage.
Leave 1 Remains.
Bone Heap loses 3 Courage.
### Pattern
Bone Swing.
Rearrange.
Bone Swing.
Throw a Piece.
Repeat.
### Strategic question
Burst Bone Heap twice?
Destroy the Bone Pile while it is helpless?
Or ignore the Pile and try to finish the entire encounter before it reassembles?
# 8. Crypt Fetcher
Role: Recursion support enemy Courage: 34
A skeletal dog like creature with several mismatched jaws.
It gleefully retrieves bones from around the room.
### Core mechanic: Fetch
If Remains exist:
Crypt Fetcher can retrieve one.
The Remains disappears.
The Fetcher gains one Fetched Bone.
Maximum 3.
### Fetched Bone effects
Each Fetched Bone grants:
2 Guard at the beginning of its turn.
### Moves
Fetch!
Consume one Remains.
Gain 1 Fetched Bone.
Gnaw
Deal 6 damage plus 2 per Fetched Bone.
Bring It Back
Spend 2 Fetched Bones.
Restore the most recently defeated eligible ordinary skeletal enemy with 35 percent of its maximum Courage.
Cannot restore another Crypt Fetcher.
Cannot restore Big Scares.
Cannot restore bosses.
Good Dog
Gain 7 Guard.
If no Remains exist, create 1 Remains by digging through the crypt floor.
### Behavior
If Remains exist and fewer than 2 Fetched Bones:
Fetch.
If 2 or more Fetched Bones and an eligible enemy has been defeated:
Bring It Back.
Otherwise:
Gnaw.
Good Dog.
Repeat.
### Design purpose
Crypt Fetcher makes Remains management suddenly important.
The cute visual joke is that it thinks this is an excellent game.
# 9. Early Crypt Scuffles
### Scuffle 1
Loose Tibia
Purpose:
Introduce Remains.
### Scuffle 2
Skull Roller
Purpose:
Introduce temporary disappearance.
### Scuffle 3
Bone Heap
Purpose:
Introduce reassembly.
### Scuffle 4
Ribcage Guard
Purpose:
Introduce Cage and multiple Remains.
# 10. Standard Crypt Scuffles
### Scuffle 5
Loose Tibia
Crypt Fetcher
The player immediately sees why Remains matter.
### Scuffle 6
Ribcage Guard
Loose Tibia
The Guard protects the small threat but creates extra Remains when defeated.
### Scuffle 7
Urn Spirit
Skull Roller
Defeating the Roller gives the Urn a useful defensive Remembrance.
### Scuffle 8
Bone Heap
Loose Tibia
The player deals with both a temporary Bone Pile and ordinary Remains.
# 11. Advanced Crypt Scuffles
### Scuffle 9
Ribcage Guard
Crypt Fetcher
The Guard creates exactly the resource the Fetcher wants.
### Scuffle 10
Bone Heap
Crypt Fetcher
A high priority recursion puzzle.
If the player ignores either Bone Piles or Remains, defeated enemies may return.
### Scuffle 11
Urn Spirit
Ribcage Guard
The Urn can capture a powerful defensive Remembrance if the Guard dies.
### Scuffle 12
Loose Tibia
Ribcage Guard
Crypt Fetcher
Defeating the first two can rapidly feed the Fetcher's engine.
### Scuffle 13
Bone Heap
Urn Spirit
The player must manage the Bone Heap's reassembly while deciding whether to give the Spirit a recovery effect.
### Scuffle 14
Bone Heap
Ribcage Guard
Crypt Fetcher
The hardest baseline Crypt formation.
The Guard redirects damage.
The Heap rebuilds.
The Fetcher converts destroyed enemies into future recursion.
# 12. Encounter generation rules
Loose Tibia should appear before Crypt Fetcher.
Bone Heap should appear alone before appearing with Crypt Fetcher.
Two Crypt Fetchers cannot appear together at Haunt 0.
Two Bone Heaps cannot appear together at Haunt 0.
Ribcage Guard cannot Cage another Ribcage Guard.
Crypt Fetcher cannot restore the same enemy more than once per combat at baseline difficulty.
Scuffle 14 belongs only to the advanced pool.
# 13. Big Scare: The Ribcage Knight
Courage: 148
Role: Dismantling a modular enemy
A skeletal knight stands inside an enormous rib cage suit of armor.
Its equipment can be broken apart separately.
### Components
The Knight begins with three attached components.
## Rib Shield
Integrity: 24
While intact:
The Knight gains 7 Guard at the beginning of its turn.
## Femur Blade
Integrity: 22
While intact:
Damaging attacks deal 4 additional damage.
## Skull Helm
Integrity: 20
While intact:
The first negative status applied to the Knight each player turn has its magnitude reduced by 1 where applicable.
For non stackable effects, duration is reduced by 1 turn, minimum 1.
### Component targeting
The player may attack:
The Knight itself.
Or one of its Components.
Destroying a Component removes its effect permanently.
### Component Remains
Each destroyed Component leaves 1 special Knight Remains.
The Knight can recover them.
### Moves
Knight's Strike
Deal 11 damage.
Apply Femur Blade if intact.
Brace
Gain 12 Guard.
Apply Rib Shield bonus separately.
Recover Equipment
Consume one Knight Remains.
Restore that Component at 50 percent Integrity.
Can occur only twice during the entire fight.
Bone Rush
Deal 5 damage three times.
### Behavior
Knight's Strike.
Brace.
Bone Rush.
Then check Recover Equipment.
Repeat.
### Strategic question
Strip equipment first?
Race the Knight?
Destroy only Femur Blade?
Allow it to spend turns recovering Components instead of attacking?
# 14. Big Scare: The Walking Ossuary
Courage: 158
Role: Building attacks from defeated pieces
The Walking Ossuary is a massive skeletal structure made from hundreds of bones.
Tiny bones continually crawl into and out of it.
### Core mechanic: Collection
Whenever any Remains object is created:
The Walking Ossuary gains 1 Collection.
Maximum 8.
This happens even if the Remains is immediately destroyed afterward.
### Collection bonuses
At 2 Collection:
Gain 5 Guard at the start of each turn.
At 4:
Attacks deal 3 additional damage.
At 6:
Gain access to Assemble Something.
At 8:
Gain access to Everything Belongs Here.
### Moves
Bone Sweep
Deal 10 damage.
Add to the Walls
Create 1 Remains.
Gain 1 Collection.
Gain 8 Guard.
Assemble Something
Spend 2 Collection.
Choose one effect according to current need.
If low Courage:
Recover 8 Courage.
If preparing offense:
Next attack gains 6 damage.
Otherwise:
Gain 14 Guard.
Everything Belongs Here
Available at 8 Collection.
Spend all Collection.
Deal 18 damage.
Create 3 Remains.
### Player interaction
Whenever the player destroys 2 Remains during one player turn:
The Ossuary loses 1 Collection.
Once per turn.
### Combat identity
Remains are both physical objects and a resource meter.
The player can control the battlefield to control the monster.
# 15. Big Scare: The Coffin Collector
Courage: 141
Role: Temporary deck burial
A long limbed creature drags several small coffins behind it.
Each coffin is labeled:
For Safekeeping
### Core mechanic: Inter
The Coffin Collector can temporarily place Tricks into Coffins.
It never selects randomly from the player's whole deck.
The player chooses.
### Move: Choose Something to Keep Safe
The player chooses one Trick from their hand.
That Trick becomes Interred.
Remove it from combat temporarily.
Maximum 3 Interred Tricks.
Each Interred Trick fills one Coffin.
### Coffin benefits to the enemy
For each occupied Coffin:
The Collector gains 2 attack damage.
At 3 occupied Coffins:
Gain 7 Guard at the start of each turn.
### Opening Coffins
Whenever the Collector loses at least 20 Courage during one player turn:
Open the oldest occupied Coffin.
Return that Trick to the player's hand.
Once per turn.
### Moves
Keep This Safe
Inter one chosen Trick.
Gain 5 Guard.
Coffin Drag
Deal 9 damage plus 2 per occupied Coffin.
Lid Slam
Deal 6 damage twice.
Check the Locks
Gain 9 Guard plus 3 per occupied Coffin.
### Pattern
Keep This Safe.
Coffin Drag.
Lid Slam.
Keep This Safe.
Check the Locks.
Repeat.
### Important design principle
Like Bookwyrm, the player chooses what is temporarily removed.
The game creates sacrifice decisions without randomly deleting the key card a build depends on.
# 16. The Bone Curator
Boss Courage: 390
The Bone Curator is a tall, elegant skeletal figure wearing an old museum coat.
Its own skeleton is obviously assembled from many different creatures.
Not grotesquely.
More like an impossible natural history display that decided to walk around.
It wears tiny labels around various bones.
It carries calipers, brushes, wire, museum tags, and a polished silver retrieving hook.
The Bone Curator believes every fragment belongs somewhere.
Its philosophy is:
Nothing should be lost when it can be put back where it belongs.
The problem is that it decides what belongs together.
# 17. Core boss mechanic: The Exhibit
Three empty Display Stands appear beside the Bone Curator.
Whenever certain things happen, the Curator can place a Bone Piece on a Display Stand.
Each displayed piece gives the boss a different ability.
The player can destroy displayed pieces.
### Displayed Piece Integrity
18
Only one piece of each type can be displayed at baseline difficulty.
# 18. Bone Piece types
## Fang
The Curator's damaging attacks deal 3 additional damage.
## Rib
The Curator gains 6 Guard at the beginning of its turn.
## Paw
After the Curator attacks, gain 4 Guard.
## Spine
The first time the Curator would gain a negative status each player turn, reduce its magnitude by 1 where appropriate.
## Tail
The Curator's multi hit moves gain one additional hit at reduced damage.
Only three pieces can be active at once during phase one.
# 19. Acquiring Pieces
The Curator gains pieces through:
Catalogue Remains
Create one random Bone Piece not currently displayed.
Put it on an empty Display Stand.
If all stands are occupied:
Catalogue Remains becomes Rearrange Exhibit.
### Rearrange Exhibit
Destroy one displayed piece.
Replace it with a different random piece.
The destroyed piece becomes Loose Exhibit rather than disappearing.
Loose Exhibit can matter later.
# 20. Player interaction: Break the Exhibit
Displayed pieces are separately targetable.
Destroying one removes its effect.
When destroyed:
It becomes Loose Exhibit.
Loose Exhibit has no Integrity and cannot be attacked.
It simply sits beside the battlefield.
The Curator may retrieve it later.
This means dismantling the boss creates future resources.
# 21. Bone Curator phase one
From 390 through 221 Courage.
### Polished Femur
Deal 12 damage.
### Catalogue Remains
Add one Bone Piece.
Gain 4 Guard.
### Preservation Wire
Gain 13 Guard.
One Displayed Piece gains 8 Guard.
### Measure Twice
Deal 6 damage.
The Curator's next damaging action gains 4 damage.
### Exhibit Sweep
Deal 4 damage twice.
If Tail is displayed:
Deal a third hit for 3 damage.
### Opening sequence
Catalogue Remains.
Polished Femur.
Catalogue Remains.
Preservation Wire.
Exhibit Sweep.
Measure Twice.
Repeat.
# 22. Retrieving destroyed Pieces
Every fourth Curator action:
It checks for Loose Exhibits.
If at least one exists:
Use:
That Still Belongs Here
Retrieve one Loose Exhibit.
Restore that Bone Piece with 10 Integrity on an empty Display Stand.
If no stand is empty:
Replace the least useful current Piece with the retrieved one.
### Player response
Destroying every Piece is not necessarily efficient.
The Curator will spend actions retrieving them.
Sometimes letting a manageable Piece remain is better than constantly feeding the retrieval cycle.
# 23. Curator special resource: Order
Whenever the Curator successfully restores a destroyed Piece:
Gain 1 Order.
Maximum 3.
Each Order gives:
2 attack damage.
### Removing Order
Whenever the player destroys two Displayed Pieces during the same player turn:
Lose 1 Order.
Once per turn.
This creates a burst threshold for dismantling the exhibit faster than the Curator can maintain it.
# 24. Phase transition
At 220 Courage:
The Bone Curator uses:
The Display Is Incomplete
Destroy every Display Stand.
All currently displayed Pieces and Loose Exhibits fly toward the Curator.
They attach directly to its body.
The Curator gains a phase two form based on the three most recently active Piece types.
If fewer than three unique types were present:
Fill remaining slots randomly from pieces seen during combat.
This means the player's phase one choices help determine phase two.
# 25. Phase two mechanic: The Reconstruction
Three Piece effects become permanently attached to The Curator.
They can no longer be separately targeted.
However:
Each one now has a corresponding Weak Point condition.
The player can temporarily disable a Piece for one enemy turn by meeting that condition.
# 26. Fang Weak Point
Attached effect:
Attacks deal 4 additional damage.
Disable Fang by:
Gaining 15 or more Guard during one player turn.
The player is demonstrating superior defense.
# 27. Rib Weak Point
Attached effect:
Gain 8 Guard at the start of the enemy turn.
Disable Rib by:
Dealing at least 18 damage during one player turn.
# 28. Paw Weak Point
Attached effect:
Gain 6 Guard after attacking.
Disable Paw by:
Playing 4 or more Tricks during one player turn.
# 29. Spine Weak Point
Attached effect:
Reduce the first negative status received each turn.
Disable Spine by:
Applying two separate negative effects during one player turn.
If the current Companion has no practical way to apply two negative effects, Spine can also be disabled by dealing 12 indirect or non Attack damage during the turn.
This fallback rule prevents hard deck checks.
# 30. Tail Weak Point
Attached effect:
Multi hit attacks gain one extra hit.
Disable Tail by:
Ending the player turn with at least 1 unspent Nerve.
### Design principle
Every Weak Point has multiple reasonable ways to be addressed across the complete Companion roster.
No build should be mechanically locked out.
# 31. Phase two moves
### Curated Strike
Deal 15 damage.
Apply active Piece effects.
### Articulated Flurry
Deal 4 damage three times.
Tail may modify it.
### Perfect Arrangement
Gain 14 Guard.
Recover 6 Courage.
Can occur at most twice during phase two.
### Retrieve Yourself
Gain 1 Order.
Then lose 4 Courage.
Maximum Order remains 3.
This represents the Curator literally dismantling and reattaching parts of itself.
### Museum Charge
Deal 10 damage.
If at least two attached Pieces are currently active:
Deal 5 additional damage.
### Pattern
Curated Strike.
Perfect Arrangement.
Articulated Flurry.
Museum Charge.
Retrieve Yourself.
Repeat.
# 32. Weak Point reward
Whenever the player disables all three attached Pieces during the same player turn:
The Curator becomes:
Disassembled
Until the end of the next player turn:
Take 25 percent additional damage.
Lose all Order.
Its next enemy action becomes:
Put Yourself Back Together
Gain 12 Guard.
Deal no damage.
This is the phase two mastery objective.
It should be difficult but highly rewarding.
# 33. Final escalation
At 85 Courage or less:
The Bone Curator gains:
Nothing Missing
Whenever one attached Piece is disabled:
The Curator loses 3 Courage.
Whenever all three are disabled together:
The additional Disassembled vulnerability remains, but Put Yourself Back Together no longer grants Guard.
The fight accelerates toward the finish.
# 34. Why Bones feels especially good here
### Fetching
Crypt Fetcher and The Curator both present hostile versions of Bones' retrieval identity.
Bones retrieves useful things intentionally.
The Crypt tries to force everything back into old arrangements.
### Burying
A Bones deck may be particularly comfortable with temporary removal and delayed retrieval.
The Coffin Collector therefore creates interesting choices rather than pure frustration.
### Discard
If Bones can benefit from Tricks leaving the hand or moving between zones, many Crypt mechanics naturally intersect with that game plan.
### Recursion
Bone Heap and The Bone Curator make recursion a visible battlefield principle.
### Bone resources
A Bones player already thinks of bones as resources rather than simply remains.
That makes the entire region feel thematically native.
# 35. Boss narrative outcome
### Bones not yet rescued
The Bone Curator considers Bones an impossible specimen.
Bones can lose pieces.
Fetch pieces.
Bury pieces.
Recover pieces.
And somehow remain Bones throughout.
The Curator has repeatedly disassembled Bones trying to determine which exact arrangement is the "correct" one.
Bones has repeatedly stolen pieces back.
The Curator thinks this is a preservation problem.
Bones thinks this is the best fetch game ever invented.
Defeating The Bone Curator lets Bones keep every mismatched piece Bones wants.
### Bones already rescued and currently active
This becomes Bones' Legacy homecoming.
The thematic statement is:
Being made from pieces does not mean someone else gets to decide how they fit together.
### Another Companion active
Normal boss reward.
No Bones Legacy advancement.
# 36. Multiplayer scaling
Use the established baseline.
2 players:
160 percent Courage.
3 players:
210 percent.
4 players:
255 percent.
The Crypt should become highly cooperative because one player can manage Remains while another attacks primary enemies.
# 37. Loose Tibia multiplayer
Remains Integrity scales modestly:
2 players:
11
3 players:
14
4 players:
16
Remains should never scale as aggressively as full enemies.
# 38. Skull Roller multiplayer
Misplaced remains global.
When it returns:
Its next attack targets the player who most recently damaged it before it rolled away.
The target is shown when it reappears.
# 39. Urn Spirit multiplayer
Remembrance remains global.
Release Memory attacks or supports according to the captured enemy.
Any player can influence which enemy dies first and therefore what gets preserved.
# 40. Ribcage Guard multiplayer
Cage redirects the first 7 Attack damage from each player per team round.
This prevents the first player from clearing the entire protection mechanic for everyone.
# 41. Bone Heap multiplayer
Bone Pile Integrity:
2 players: 20
3 players: 26
4 players: 32
Reassembly timer remains two enemy turns.
This gives the whole team a meaningful opportunity to destroy it.
# 42. Crypt Fetcher multiplayer
Fetched Bones remain shared.
Bring It Back restores one enemy.
Restored enemy Courage uses 30 percent maximum rather than 35 percent with three or four players, preventing excessive attrition.
# 43. Ribcage Knight multiplayer
Components scale modestly.
Recommended Integrity:
2 players: 34
3 players: 43
4 players: 51
Multiple players can contribute to breaking the same Component.
# 44. Walking Ossuary multiplayer
Collection is shared.
Whenever Remains are created, gain Collection normally.
Destroying three Remains during one team round reduces Collection by 1.
At 8 Collection:
Everything Belongs Here hits all players.
Recommended damage:
2 players: 14 each
3 players: 12 each
4 players: 11 each
# 45. Coffin Collector multiplayer
Each occupied Coffin is tied to its Trick owner.
Keep This Safe rotates among players whenever possible.
Opening the oldest Coffin returns its Trick to the correct player's hand.
Maximum occupied Coffins:
2 players: 3
3 players: 4
4 players: 5
# 46. Bone Curator multiplayer Exhibit
Display Stands increase by party size.
1 player:
3 stands
2 players:
3 stands
3 players:
4 stands
4 players:
5 stands
However, only three Pieces transfer into phase two.
The game chooses the three most recently active Piece types, as in solo.
This keeps phase two readable.
# 47. Multiplayer Weak Points
Phase two Weak Point conditions use team totals where appropriate.
### Fang
Team gains at least 12 Guard per player on average.
### Rib
Team deals a Courage threshold scaled by player count.
2 players: 30
3 players: 40
4 players: 49
### Paw
Team plays:
2 players: 7 Tricks
3 players: 10 Tricks
4 players: 13 Tricks
### Spine
The team applies at least two different negative effects or meets an alternate indirect damage threshold.
### Tail
At least half the players end with 1 or more unspent Nerve.
This lets different teammates handle different Weak Points.
# 48. Multiplayer cooperative opportunities
One player can clean up Remains.
Another can focus Crypt Fetcher.
A player with broad damage can destroy Bone Piles efficiently.
A burst deck can break a Ribcage Knight Component.
A defensive player can deliberately satisfy the Curator's Fang Weak Point.
A status focused player can handle Spine.
A fast deck can handle Paw.
A teammate whose critical Trick was Interred can ask the group to prioritize the Coffin Collector damage threshold.
This region should make each deck's strengths feel like a different tool for dismantling the same machine.
# 49. Haunt Level progression
### Haunt 1
Ordinary enemies gain approximately 8 percent Courage.
Big Scares and boss gain approximately 6 percent.
### Haunt 2
Advanced Crypt formations appear earlier.
### Haunt 3
Loose Tibia Remains persist for three enemy turns instead of two.
### Haunt 4
Skull Roller returns from Misplaced with 8 Guard instead of 5.
### Haunt 5
Urn Spirit can hold two Remembrances.
It still releases only one per action.
### Haunt 6
Ribcage Guard redirects 12 Attack damage instead of 10.
### Haunt 7
Bone Heap returns with 24 Courage instead of 20.
### Haunt 8
Crypt Fetcher requires only 1 Fetched Bone plus 1 existing Remains to use Bring It Back.
It consumes both.
### Haunt 9
Big Scares gain signature upgrades.
Ribcage Knight begins with one Component reinforced by 8 Guard.
Walking Ossuary begins with 1 Collection.
Coffin Collector begins with one Coffin already prepared, making its first Inter action gain 8 Guard.
### Haunt 10
The Bone Curator begins combat with two Display Stands already occupied.
The active Pieces are revealed before the player's first turn.
# 50. Higher Haunt behavior upgrades
Potential later upgrades include:
Loose Tibia Remains can combine into a new minor skeletal enemy.
Skull Roller can choose where it reappears based on player targeting.
Urn Spirit can preserve the type of a Big Scare action in simplified form.
Ribcage Guard can move Cage between allies.
Bone Heap may rebuild using nearby Remains to return with more Courage.
Crypt Fetcher can bury Remains and retrieve them later.
Ribcage Knight may replace destroyed Components with mismatched alternatives.
Walking Ossuary may consume Remains to change its move pattern.
The Bone Curator may deliberately detach one phase two Piece and replace it with another from the combat history.
These belong at high Haunt because the baseline Crypt already involves substantial object tracking.
# 51. Crypt themed run reward concepts
### Old Dog Tag
The first time each combat a Trick returns from your discard pile to your hand through an effect, gain 4 Guard.
### Tiny Shovel
The first time each combat one of your Tricks is deliberately removed from circulation and later returned, draw 1 Trick when it returns.
### Spare Rib
The first time each combat you fall below 50 percent Courage, gain 7 Guard.
### Burial Coin
The first enemy generated status Trick you remove from combat each Scuffle grants a small amount of run currency.
### Crooked Bone
The first time each combat an enemy returns after being defeated or temporarily removed, it returns with 4 less Courage.
Minimum 1.
### Ossuary Key
Crypt gates, coffin locks, funerary lifts, bone cabinets, mausoleum doors, and burial passages become easier to access during exploration.
# 52. Crypt Curiosity hooks
### The Labeled Skeleton
A complete animal skeleton has a museum tag bearing a Companion's original pet name.
The date is decades old.
The Companion is still alive.
That immediately tells the kids the display is not what it appears to be.
### The Box of Collars
Old collars are carefully stored beside corresponding bones.
Some collars belong to animals known to have become Menagerie Companions.
The implication is unsettling:
The Curator may have collected shed or replaced supernatural pieces rather than actual remains.
### The Bone Drawer
Open it.
Search for a labeled name.
Take a strange bone charm.
Close it very carefully.
Something inside scratches back.
### The Fetch Tunnel
A narrow passage contains hundreds of objects Crypt Fetchers have retrieved.
Possible finds include:
Keys.
Toys.
A missing pet's tag.
A Backpack item.
A Secret Connector.
### The Empty Coffin
It has the active Kid's name on it.
Inside is not a body.
It contains several items the Kid has lost over their lifetime.
This supports the broader theme of the mansion collecting lost things, not merely animals.
### The Curator's Catalogue
Records distinguish between:
Original body.
Transformed body.
Shed material.
Replacement material.
Recovered material.
This provides valuable lore about how Menagerie transformations physically work.
# 53. Important transformation lore
The Crypt is a good location to establish that Menagerie transformations do not always obey ordinary biology.
Bones is the clearest example.
A transformed animal may:
Replace physical material.
Regrow supernatural components.
Lose pieces without dying.
Possess objects that become incorporated into its form.
Gradually transform mundane material into supernatural anatomy.
This supports characters like:
Bones.
Mopsy.
Mossbit.
Brambleboo.
Crinkle.
It means their current forms are not necessarily literal medical transformations of ordinary animals.
The mansion's magic can reinterpret what an animal is.
That keeps the tone cute and fantastical rather than body horror focused.
# 54. Architectural identity
The established Crypt and Ossuary contains 17 rooms.
A strong authored set would be:
Crypt Entry
Family Crypt
Pet Crypt
Ossuary Hall
Skull Gallery
Rib Vault
Bone Sorting Room
Preparation Room
Memorial Chamber
Coffin Store
Funerary Lift
Curator's Workshop
Specimen Archive
Fetch Tunnel
Reassembly Chamber
Deep Ossuary
Bone Curator's Gallery
The region should feel increasingly organized as the player approaches the boss.
Early Crypt:
Old stone.
Dust.
Loose bones.
Broken coffins.
Late Ossuary:
Labels.
Display cases.
Catalogues.
Carefully arranged specimens.
The danger is not chaos.
It is obsessive organization.
# 55. Crypt Connectors
Natural Connectors include:
Funerary lift into the Mansion Graveyard.
Old burial tunnels.
Secret coffin passages.
Bone chutes.
Collapsed crypt walls.
Animal sized tunnels created by Crypt Fetchers.
A staircase toward the Heart's deeper holding wards.
A sealed passage into Secret Passages.
An old drainage route toward the Bathhouse foundations.
The Crypt should feel like one of the mansion's deepest physical layers.
# 56. Blueprint investigation progression
Early notes:
"Bones keep moving."
Later:
"Don't leave pieces near dog thing."
Later:
"Curator labels EVERYTHING."
Later still:
"These aren't graves. It's collecting parts."
Eventually:
"House can change what counts as part of you."
That last discovery is significant.
The kids begin to understand that transformation is not merely cosmetic mutation.
The mansion's influence can alter the supernatural rules governing an animal's body.
# 57. What the Crypt and Ossuary teaches
By the time the player reaches The Bone Curator, the region has taught:
Defeated enemies can leave strategically important battlefield objects.
Some enemies can temporarily remove themselves and return later.
Death order can determine what support enemies gain.
Protectors can create future resources when destroyed.
Some enemies must be defeated in multiple stages.
Recursion can be interrupted by controlling what remains on the battlefield.
Temporary Trick removal is most interesting when the player chooses what is lost.
Destroying an enemy component can change future behavior without directly damaging the main body.
An opponent's discarded pieces can become resources for either side.
Taking something apart and truly removing it are not the same thing.
