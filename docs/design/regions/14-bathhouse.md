# The Bathhouse and Rain Wing

_Source: Midnight Menagerie Design.docx, lines 24406-25352_

# The Bathhouse and Rain Wing
Companion: Drizzle Boss: The Drowned Matron Region identity: Rain, Wet, steam, flooding, drains, pressure, changing Weather, and battlefield conditions that affect everyone differently
The Bathhouse and Rain Wing should feel like the mansion's plumbing has become its own supernatural climate system.
Rain falls indoors.
Bathtubs overflow upward.
Steam moves against the wind.
Pipes knock from inside the walls.
Hallways periodically flood and drain.
Windows show storms even when the sky outside is clear.
The central combat lesson is:
The battlefield itself can become part of the enemy formation.
Drizzle belongs here because Drizzle does not merely inflict status effects. Drizzle manipulates Weather and changes the conditions under which everyone is fighting.
## 1. Bathhouse enemy roster
The six ordinary enemies are:
Soap Sprite
Puddle Spirit
Pipe Knocker
Steam Ghost
Umbrella Imp
Overflow
The three Big Scares are:
The Boiler Bellower
The Flooded Reflection
The Storm Bath
Boss:
The Drowned Matron
## 2. Regional mechanic: Weather
The Bathhouse introduces explicit Weather.
Only one Weather can normally be active at a time.
Common regional Weather states are:
Clear
No special effect.
Rain
Certain enemies gain benefits. Wet becomes easier to apply.
Steam
Some targeting and Guard effects change.
Downpour
A stronger form of Rain used by Big Scares and the boss.
Weather always affects both sides according to visible rules.
This is important.
Weather should not simply mean:
Enemies gain bonuses.
The player should sometimes benefit too.
## 3. Regional mechanic: Wet
Wet is a temporary combat status.
A Wet character remains Wet until the end of their next turn unless refreshed.
For players:
The first time they gain Guard while Wet, gain 2 additional Guard.
Then Wet remains.
For certain enemies:
Wet modifies their specific abilities.
Wet therefore begins as a mixed condition rather than a pure debuff.
Drizzle's full Trick pool can use Wet much more extensively.
## 4. Soap Sprite
Role: Introductory Wet enemy Courage: 24
A tiny creature made from bubbles and a bar of soap.
It slides everywhere instead of walking.
### Core mechanic: Slippery
Soap Sprite becomes Slippery while Wet.
While Slippery:
The first Attack Trick targeting it each player turn deals 3 less damage.
Minimum 0.
### Moves
Soap Splash
Deal 5 damage.
Apply Wet.
Bubble Up
Gain 8 Guard.
If Wet, gain 3 additional Guard.
Slip Tackle
Deal 7 damage.
If Slippery, gain 4 Guard afterward.
### Pattern
Soap Splash.
Bubble Up.
Slip Tackle.
Repeat.
### Design purpose
The first Wet enemy shows immediately that Weather related conditions can benefit both sides.
## 5. Puddle Spirit
Role: Environmental growth enemy Courage: 29
A face appears inside a puddle.
The puddle rises into a little walking figure whenever it attacks.
### Core mechanic: Puddle Size
Puddle Spirit has three Size levels:
Small
Medium
Large
It begins Medium.
### Rain interaction
At the end of an enemy turn during Rain:
Increase Size by 1.
Maximum Large.
### Dry interaction
During Clear Weather:
After Puddle Spirit attacks, decrease Size by 1.
Minimum Small.
### Effects
Small:
Attacks deal 2 less damage.
Takes 20 percent additional damage.
Medium:
Normal.
Large:
Attacks deal 3 additional damage.
Gain 5 Guard at the start of its turn.
### Moves
Splash
Deal 7 damage.
Spread Out
Increase Size by 1.
Gain 5 Guard.
Drain Away
Deal 5 damage.
Decrease Size by 1.
Recover 4 Courage.
### Behavior
If Small:
Spread Out.
Otherwise:
Splash.
Drain Away when Large.
### Design purpose
Weather alters the enemy's physical state over time.
## 6. Pipe Knocker
Role: Delayed pressure enemy Courage: 35
A knot of old pipes tears itself from the wall and walks around on copper elbows.
Something keeps hammering from inside.
### Core mechanic: Pressure
Pipe Knocker has a Pressure meter from 0 to 4.
### Moves
Build Pressure
Gain 1 Pressure.
Gain 6 Guard.
Pipe Slam
Deal 7 damage plus 2 per Pressure.
Release Valve
If at 3 or 4 Pressure:
Deal 5 damage per Pressure.
Remove all Pressure.
Change Weather to Steam.
### Pressure reduction
Whenever Pipe Knocker loses at least 13 Courage during one player turn:
Lose 1 Pressure.
Once per turn.
### Behavior
Build Pressure.
Pipe Slam.
Build Pressure.
Check Release Valve.
Repeat.
### Design purpose
This connects stored resource management from Lampworks to environmental manipulation.
The difference is that discharging Pressure changes the entire battlefield.
## 7. Steam Ghost
Role: Weather dependent evasion enemy Courage: 34
A translucent ghost forms from bathroom steam.
Its face repeatedly vanishes into condensation.
### Core mechanic: Condense
During Steam Weather:
Steam Ghost becomes Diffuse.
While Diffuse:
The first Attack Trick targeting it each player turn deals 50 percent damage.
During Rain:
Steam Ghost becomes Condensed.
While Condensed:
It takes 20 percent additional damage.
### Moves
Scalding Touch
Deal 8 damage.
Fog the Glass
Change Weather to Steam.
Gain 6 Guard.
Condensation Drip
Deal 5 damage.
Apply Wet.
If Weather is Rain, deal 3 additional damage.
### Pattern
Fog the Glass.
Scalding Touch.
Condensation Drip.
Repeat.
### Design purpose
Changing Weather can create vulnerability windows rather than simply enemy buffs.
## 8. Umbrella Imp
Role: Weather support enemy Courage: 31
A small creature carries an enormous umbrella and keeps dramatically opening it indoors.
### Core mechanic: Shelter
During Rain or Downpour:
Umbrella Imp can Shelter one other enemy.
A Sheltered enemy:
Does not become Wet from Weather effects.
Gains 5 Guard at the beginning of its turn.
### Moves
Open Umbrella
Shelter another enemy.
Gain 5 Guard.
Umbrella Poke
Deal 7 damage.
Shake It Off
Deal 4 damage.
If Rain is active:
Apply Wet.
### Breaking Shelter
If Umbrella Imp takes at least 12 Courage damage during one player turn:
Shelter ends.
### Behavior
If Rain and valid ally:
Open Umbrella.
Otherwise:
Umbrella Poke.
Shake It Off.
Repeat.
### Design purpose
The support enemy manipulates which enemies participate in the current Weather.
## 9. Overflow
Role: Battlefield timer enemy Courage: 42
A freestanding claw foot bathtub moves across the room while water pours endlessly over its sides.
### Core mechanic: Flood Level
Overflow has a Flood Level from 0 to 3.
It begins at 0.
At the end of every enemy turn:
Increase Flood by 1.
### Flood 1
Apply Wet to the player.
### Flood 2
Both sides gain 3 additional Guard whenever they gain Guard.
### Flood 3
Weather becomes Downpour.
Overflow's attacks gain 4 damage.
### Resetting Flood
Whenever Overflow loses at least 18 Courage during one player turn:
Reduce Flood by 1.
Once per turn.
### Moves
Tub Bash
Deal 9 damage.
More Water
Gain 8 Guard.
Increase Flood by 1.
Pull the Plug
Available at Flood 3.
Reduce Flood to 1.
Recover 7 Courage.
Deal 6 damage.
### Design purpose
Overflow turns the whole encounter into an environmental escalation clock.
## 10. Early Bathhouse Scuffles
The introductory sequence should be:
Soap Sprite, teaching Wet.
Puddle Spirit, teaching Weather dependent enemy states.
Pipe Knocker, teaching Pressure and Steam.
Steam Ghost, teaching Weather based vulnerability.
## 11. Standard Bathhouse Scuffles
Soap Sprite plus Puddle Spirit
Wet and Rain help both enemies differently.
Pipe Knocker plus Steam Ghost
Release Valve creates exactly the Weather Steam Ghost wants.
Umbrella Imp plus Puddle Spirit
The Imp can Shelter the Spirit during Rain while the Spirit grows.
Overflow plus Soap Sprite
Flooding creates Wet repeatedly while Soap Sprite exploits Slippery.
## 12. Advanced Bathhouse Scuffles
Steam Ghost plus Umbrella Imp
The player may want Rain to expose the Ghost, while the Imp benefits from the same Weather.
Pipe Knocker plus Overflow
Pressure can create Steam while Flood pushes toward Downpour.
Puddle Spirit plus Steam Ghost
The two enemies prefer different Weather states.
Manipulating one may weaken the other.
Umbrella Imp plus Overflow plus Soap Sprite
Rain creates a defensive network.
Pipe Knocker plus Steam Ghost plus Umbrella Imp
Steam protects the Ghost while the Imp prepares for the next Rain state.
Overflow plus Puddle Spirit plus Pipe Knocker
The hardest baseline formation.
The player is managing Flood, Pressure, enemy Size, Wet, and Weather transitions simultaneously.
## 13. Encounter generation rules
Soap Sprite should appear before Overflow.
Steam Ghost should appear alone before it appears beside Pipe Knocker.
Umbrella Imp should not appear alone in standard Scuffles.
Two Overflows cannot appear together at Haunt 0.
Two Pipe Knockers cannot appear together at Haunt 0.
Weather changing enemies should not create unresolved conflicts. If several effects change Weather during one enemy turn, the latest resolved Weather effect becomes active.
## 14. Big Scare: The Boiler Bellower
Courage: 154
Role: Pressure management and temperature control
A huge iron boiler tears itself out of the basement wall.
A furnace door opens and closes like a mouth.
### Core mechanic: Boiler Pressure
Pressure ranges from 0 to 6.
The Boiler begins at 1.
### Low Pressure, 0 or 1
Attacks deal 3 less damage.
The Boiler takes normal damage.
### Normal Pressure, 2 through 4
No passive modifier.
### Dangerous Pressure, 5
Attacks deal 4 additional damage.
### Critical Pressure, 6
The next action becomes:
Boiler Burst
### Building Pressure
Stoke
Gain 2 Pressure.
Gain 10 Guard.
Hot Pipes
Deal 9 damage.
Gain 1 Pressure.
### Releasing Pressure
Vent
Lose 2 Pressure.
Deal 5 damage twice.
Change Weather to Steam.
### Boiler Burst
Deal 24 damage.
Set Pressure to 2.
Change Weather to Steam.
Gain 10 Guard.
### Player interaction
Whenever the player deals at least 16 damage during one turn:
Lose 1 Pressure.
If the player deals at least 30:
Lose 2 instead.
Once per turn.
### Overcool
If the player reduces Pressure to 0:
The Boiler becomes Cold.
Its next action becomes:
Relight Furnace
Gain 12 Guard.
Gain 2 Pressure.
Deal no damage.
### Strategic identity
This is the Great Lantern's resource suppression idea translated into environmental control.
The difference is that Venting and Burst create Steam, which can matter to both sides.
## 15. Big Scare: The Flooded Reflection
Courage: 145
Role: Player behavior reflection through Weather
A tall mirror stands ankle deep in water.
The reflection inside moves a moment later than the player.
Sometimes it moves first.
### Core mechanic: Reflection Pool
At the end of each player turn, record:
Damage dealt.
Guard gained.
Additional Tricks drawn.
The Reflection chooses the largest proportional category and prepares a corresponding response.
### Damage dominant
Violent Reflection
Deal 12 damage.
### Guard dominant
Defensive Reflection
Gain 16 Guard.
Deal 5 damage.
### Draw dominant
Curious Reflection
Deal 7 damage.
Move the top Trick of the draw pile to the discard pile.
Then draw 1 additional Trick next turn.
### Balanced turn
If no category clearly dominates:
Still Water
Gain 7 Guard.
Deal 7 damage.
### Weather interaction
During Rain:
All responses are visible immediately after the player satisfies their determining condition.
During Steam:
The Reflection remains uncertain until the end of the player turn.
All possible outcomes remain visible.
### Shatter window
If the Reflection takes at least 22 damage during Rain:
It becomes Cracked.
Until the end of the next player turn:
Take 25 percent additional damage.
### Design purpose
Weather affects information quality as well as damage and defense.
## 16. Big Scare: The Storm Bath
Courage: 162
Role: Full environmental cycle encounter
The Storm Bath is an enormous tiled bathing chamber that has become alive.
Fixtures twist into limbs.
Rain pours from the ceiling.
Drains open like mouths.
### Core mechanic: Storm Cycle
The battlefield moves through four Weather stages:
Clear
Rain
Downpour
Drain
The complete cycle is visible.
### Clear
No global effect.
### Rain
All characters become Wet at the beginning of their turn.
### Downpour
All characters become Wet.
Enemy attacks deal 2 additional damage.
Players gain 2 additional Guard whenever they gain Guard.
### Drain
All Wet is removed.
Every character loses all Guard at the end of the turn.
Then Weather returns to Clear.
### Storm Bath moves
Turn the Taps
Advance Weather one stage.
Gain 8 Guard.
Tile Slam
Deal 11 damage.
Shower Burst
Deal 4 damage three times.
During Downpour:
Deal a fourth hit.
Drain Pull
Used during Drain.
Deal 8 damage.
The next Weather stage becomes Clear normally.
### Player interaction: Redirect the Water
Whenever the player plays exactly their fourth Trick during one turn:
They may choose:
Advance Weather one stage.
Or delay the next Weather transition by one enemy turn.
Once per turn.
### Strategic possibilities
Hold Rain because Wet benefits the player's defensive plan.
Rush to Drain because the enemy currently has too much Guard.
Delay Downpour.
Force Drain just before the Storm Bath gains a huge defensive turn.
This is Drizzle style Weather manipulation without requiring Drizzle.
## 17. The Drowned Matron
Boss Courage: 425
The Drowned Matron is a tall supernatural caretaker dressed in an old fashioned bathhouse uniform.
Her clothes constantly drip even when the room is dry.
Her hair floats around her as though she were underwater.
She carries towels, soap, a thermometer, and an enormous brass bath key.
She is not presented as a drowned corpse.
Her visual design should remain spectral and storybook rather than horrific.
The Matron believes cleanliness, warmth, hydration, and rest solve nearly every problem.
If an animal struggles, it needs calming.
If it runs, it needs bathing.
If it becomes upset, it needs to stay until it settles down.
Her philosophy is:
You may leave when you are calm enough to know what is good for you.
That is the problem.
She appoints herself the one who decides when that is.
## 18. Core boss mechanic: Bathhouse Weather
The Drowned Matron controls a three state Weather cycle:
Rain
Steam
Flood
There is no ordinary Clear state during most of the boss fight.
The active Weather remains until changed by an effect.
## 19. Rain
At the beginning of each player turn:
Apply Wet.
The first Guard gain that turn gains 3 additional Guard.
The Matron's single hit attacks deal 2 less damage.
## 20. Steam
The first Attack Trick targeting the Matron each turn deals 4 less damage.
Minimum 0.
The first time the player draws additional Tricks through an effect that turn:
Draw 1 additional Trick.
Steam therefore protects the boss but improves player card access.
## 21. Flood
At the beginning of the player turn:
Apply Wet.
The player's first Trick costs 1 additional Nerve.
The second Trick costs 1 less Nerve.
Minimum 0.
The Matron gains 6 Guard at the start of her turn.
Flood changes sequencing rather than simply taxing energy.
## 22. Changing Weather
The Matron announces every Weather change one action before it occurs.
For example:
Prepare Steam
means the current Weather remains active through the player turn.
At the beginning of the following enemy turn:
Weather becomes Steam before the Matron acts.
This means the player always has one full turn of warning.
## 23. Player interaction: Open the Drain
A visible Drain battlefield object is present.
Integrity: 18
When destroyed:
The current Weather immediately becomes Drainage until the end of the next player turn.
### Drainage
Remove Wet from everyone.
The Matron cannot gain Guard from Weather.
The player is unaffected by Weather based Nerve changes.
At the end of Drainage:
The Drain repairs at full Integrity.
The previously scheduled Weather becomes active.
### Cooldown
The Drain cannot be attacked during the turn immediately after repairing.
This prevents constant Weather cancellation.
## 24. Phase one
From 425 through 241 Courage.
### Towel Snap
Deal 12 damage.
### Run the Bath
Prepare Rain.
Gain 7 Guard.
### Turn the Hot Tap
Prepare Steam.
Deal 6 damage.
### Stop Splashing
Deal 5 damage twice.
If the player is Wet:
The second hit deals 4 additional damage.
### Fill It Higher
Prepare Flood.
Gain 9 Guard.
### Phase one sequence
Run the Bath.
Towel Snap.
Turn the Hot Tap.
Stop Splashing.
Fill It Higher.
Towel Snap.
Repeat.
The exact impact changes according to Weather timing and Drain use.
## 25. Matron mechanic: Calm
The Matron tracks Calm from 0 to 4.
She gains 1 Calm whenever the player ends a turn without dealing at least 8 damage to her.
### Calm benefits
At 1:
No effect.
At 2:
Gain 4 Guard at the start of the enemy turn.
At 3:
Attacks deal 2 additional damage.
At 4:
The next move becomes:
There, Much Better
### There, Much Better
Recover 12 Courage.
Gain 12 Guard.
Set Calm to 1.
### Reducing Calm
Whenever the player deals at least 18 Courage damage during one turn:
Lose 1 Calm.
Once per turn.
### Design purpose
The Matron interprets low aggression as cooperation.
The player may sometimes deliberately let Calm rise because attacking the Drain or setting up is more valuable.
But ignoring the Matron indefinitely lets her stabilize the fight.
## 26. Why Calm is not simply another escalation meter
The player is not expected to keep Calm at zero.
Sometimes a setup turn that gives the Matron Calm is strategically correct.
The mechanic asks whether the player can tolerate the future consequence.
That is consistent with the broader Midnight Menagerie combat philosophy.
## 27. Phase transition
At 240 Courage:
The Matron uses:
This Bath Is Not Finished
Set Calm to 0.
Destroy the current Drain.
Return any scheduled Weather effects to neutral.
The floor gives way beneath the bath.
The fight descends into an enormous impossible submerged chamber.
Phase two begins.
Weather is replaced by Water Level.
## 28. Phase two Water Level
Water Level ranges from 0 to 3.
It begins at 1.
### Level 0: Drained
The Matron takes 15 percent additional damage.
The player cannot become Wet from the environment.
### Level 1: Ankle Deep
No passive modifier.
### Level 2: Waist Deep
Both sides gain 2 additional Guard whenever they gain Guard.
### Level 3: Submerged
The Matron gains 7 Guard at the beginning of her turn.
The player's first Trick each turn costs 1 additional Nerve.
Every third Trick played costs 1 less Nerve.
Minimum 0.
Again, sequencing can partially compensate for the penalty.
## 29. Raising and lowering Water
The Matron's actions can change Water Level.
The player now gains access to two battlefield controls:
Drain Valve
Intake Valve
Each has 14 Integrity.
Destroying Drain Valve:
Lower Water Level by 1.
Destroying Intake Valve:
Raise Water Level by 1.
Both repair after two enemy turns.
### Why would the player raise the water?
Some boss actions become weaker at higher Water Level.
This prevents the interaction from having an obvious permanent direction.
## 30. Phase two moves
### Bath Key
Deal 15 damage.
At Water Level 0:
Deal 18 instead.
The Matron becomes more directly dangerous when fully drained.
### Undertow
Deal 6 damage twice.
At Water Level 3:
Deal only 5 damage twice.
But the player's next first Trick still receives the Submerged cost modifier.
### Fill the Room
Increase Water Level by 1.
Gain 7 Guard.
### Pull the Plug
Decrease Water Level by 1.
Recover 6 Courage.
### Tidal Sweep
Deal 10 damage.
If Water Level is 2:
Deal 13.
If Water Level is 3:
Deal 8 and gain 8 Guard.
### Pattern
Fill the Room.
Bath Key.
Undertow.
Pull the Plug.
Tidal Sweep.
Repeat.
## 31. Phase two strategic identity
There is deliberately no universally best Water Level.
### Level 0
Excellent damage window.
But Bath Key becomes dangerous.
### Level 1
Stable and predictable.
### Level 2
Both sides gain stronger Guard.
A defensive deck may benefit heavily.
### Level 3
The Matron becomes more defensive and alters Nerve sequencing.
But Undertow and Tidal Sweep become less damaging.
The player can therefore manipulate the environment according to their current hand and build.
## 32. Overflowing
If the Matron attempts to raise Water above Level 3:
Instead trigger:
Overflow
The Matron loses 8 Courage.
All battlefield Valves immediately repair.
The player becomes Wet.
Water Level remains 3.
### Why this matters
The player may deliberately keep the room fully flooded and tempt the Matron into wasting Fill the Room.
This rewards understanding the boss's pattern.
## 33. Empty Pipes
If the Matron attempts to lower Water below Level 0:
Trigger:
Empty Pipes
The Matron loses 6 Courage.
Gain 8 Guard.
Water remains 0.
Again, forcing a resource beyond its legal boundary creates a small advantage.
## 34. Final escalation
At 90 Courage or less:
The Matron gains:
Enough Bathing
Whenever the player changes Water Level through a Valve:
The Matron loses 4 Courage.
Whenever Overflow or Empty Pipes occurs:
The Matron loses an additional 4 Courage.
Her healing from Pull the Plug is disabled.
The environmental puzzle becomes an offensive tool for ending the fight.
## 35. Why Drizzle feels especially good here
### Weather
Drizzle's entire identity revolves around conditions affecting the battlefield rather than only individual targets.
### Wet
Drizzle players should already understand that Wet can create both advantages and disadvantages.
### Rain
Some Drizzle builds may actively want Rain or Wet states to persist.
That creates interesting moments where the region's environmental pressure becomes useful.
### Storms
Drizzle should have strong thematic resonance with Water Level and Weather cycles.
### Battlefield control
A Drizzle deck may be particularly comfortable changing conditions rather than trying to brute force through them.
The home region should feel expressive, not easier.
## 36. Boss narrative outcome
### Drizzle not yet rescued
The Drowned Matron considers Drizzle the perfect bathhouse companion.
Drizzle is literally a little raincloud ghost.
The Matron has kept Drizzle in the Rain Wing because Drizzle makes everything pleasantly damp.
Whenever Drizzle floated toward an exit:
The Matron redirected the water.
Closed another door.
Started another bath.
Insisted Drizzle was not finished yet.
The Matron thinks Drizzle belongs where rain is useful.
Defeating her allows Drizzle to rain wherever Drizzle wants.
Or not rain at all.
### Drizzle already rescued and currently active
This becomes Drizzle's Legacy homecoming.
The thematic statement is:
Care stops being care when someone else decides when you are allowed to be finished.
### Another Companion active
Normal boss reward.
No Drizzle Legacy advancement.
## 37. Multiplayer scaling
Use the established baseline:
2 players, 160 percent Courage.
3 players, 210 percent.
4 players, 255 percent.
Weather remains shared by the entire team.
That is essential to Drizzle's multiplayer identity.
## 38. Soap Sprite multiplayer
Wet is tracked per player.
Slippery reduces the first Attack from each player separately.
Soap Splash targets one player.
## 39. Puddle Spirit multiplayer
Size remains shared.
Rain increases Size once per enemy round, not once per player.
Large Puddle Spirit attacks can target multiple players.
## 40. Pipe Knocker multiplayer
Pressure is shared.
Release Valve deals reduced damage to all players.
Recommended at 4 Pressure:
12 damage to each player.
Weather becomes Steam for everyone.
## 41. Steam Ghost multiplayer
Diffuse reduces the first Attack from each player individually.
Condensed vulnerability applies to all player damage.
## 42. Umbrella Imp multiplayer
Shelter remains attached to one enemy.
The entire team can contribute to breaking it.
Suggested break threshold:
2 players, 20 damage.
3 players, 27.
4 players, 33.
## 43. Overflow multiplayer
Flood is shared.
At Flood 1:
Apply Wet to all players.
At Flood 2:
Guard bonus applies to everyone.
At Flood 3:
Downpour becomes global.
The reduction threshold uses team damage.
2 players, 29.
3 players, 38.
4 players, 47.
Maximum one Flood reduction per round.
## 44. Boiler Bellower multiplayer
Pressure remains shared.
Boiler Burst damages all players.
Recommended damage:
2 players, 18 each.
3 players, 16 each.
4 players, 14 each.
Pressure suppression uses total team damage.
## 45. Flooded Reflection multiplayer
The Reflection observes the whole team round.
Damage, Guard, and extra draw are normalized per player before comparing categories so larger parties do not distort the mechanic.
If Damage dominates:
The strongest damaging Reflection targets the player who contributed the most damage.
If Guard dominates:
The boss gains defense.
If Draw dominates:
Its deck manipulation targets the player who drew the most additional Tricks.
## 46. Storm Bath multiplayer
Weather remains global.
Redirect the Water uses total team Trick count.
Suggested triggers:
2 players, 7th Trick.
3 players, 10th.
4 players, 13th.
One Weather manipulation per team round at baseline.
## 47. Drowned Matron multiplayer Weather
Weather is shared.
Wet remains individual.
Calm becomes a global boss meter.
The Matron gains Calm if the team deals less than a scaled damage threshold during the round.
Suggested thresholds:
2 players, 14.
3 players, 19.
4 players, 24.
Heavy team damage reduces Calm once per round.
## 48. Drowned Matron multiplayer Drain
Drain Integrity:
2 players, 28.
3 players, 36.
4 players, 44.
The whole team benefits from Drainage.
This creates a clear cooperative choice:
Spend a round damaging the boss.
Or invest actions into changing the battlefield for everyone.
## 49. Multiplayer phase two Valves
Both Valves are shared objects.
One player can lower Water while another raises it later in the same round if strategically useful.
Each Valve can trigger only once per team round.
The intended boss actions and Water Level modifiers remain fully visible.
## 50. Multiplayer cooperative opportunities
A defensive player can exploit Wet's Guard bonus.
Another player can spend burst damage controlling Overflow.
A fast deck can trigger Storm Bath Weather manipulation.
Players can deliberately leave Water at Level 2 because several decks benefit from extra Guard.
A player facing a dangerous Bath Key can ask the team not to drain the room to Level 0.
One teammate can attack the Drain while the rest preserve damage for the Matron.
Drizzle multiplayer Tricks should feel particularly strong conceptually here because Weather is genuinely shared.
## 51. Haunt Level progression
Haunt 1: Ordinary enemies gain approximately 8 percent Courage. Big Scares and boss gain approximately 6 percent.
Haunt 2: Advanced Bathhouse formations appear earlier.
Haunt 3: Soap Sprite begins advanced encounters Wet and therefore Slippery.
Haunt 4: Puddle Spirit begins Large in advanced encounters.
Haunt 5: Pipe Knocker can hold 5 Pressure. Release Valve scales accordingly but remains clearly telegraphed.
Haunt 6: Steam Ghost's Diffuse effect applies to the first two Attack Tricks.
Haunt 7: Umbrella Imp's Shelter grants 7 Guard per turn instead of 5.
Haunt 8: Overflow begins advanced encounters at Flood 1.
Haunt 9: Big Scares gain signature upgrades. Boiler Bellower begins with 2 Pressure. Flooded Reflection begins during Steam. Storm Bath begins at Rain rather than Clear.
Haunt 10: The Drowned Matron begins combat with Rain already active and 1 Calm.
## 52. Higher Haunt behavior upgrades
At later Haunt Levels, Soap Sprite may transfer Wet between enemies.
Puddle Spirit may split into two Small Spirits when Large.
Pipe Knocker may delay a Release Valve deliberately to reach greater Pressure.
Steam Ghost may conceal another enemy in Steam.
Umbrella Imp may move Shelter between targets.
Overflow may temporarily block Drainage effects.
Boiler Bellower may create different kinds of Steam.
Flooded Reflection may compare two consecutive turns instead of one.
The Drowned Matron may begin reacting to which Water Level the player has favored most often.
All of these should remain visible and predictable.
The Bathhouse should be complicated because the environment is dynamic, not because the rules are hidden.
## 53. Bathhouse themed run reward concepts
Rubber Duck
The first time each combat Weather changes, gain 4 Guard.
Fluffy Towel
The first time each combat Wet is removed from you, recover 2 Courage.
Brass Drain Plug
Once per combat, when an enemy environmental meter would increase to maximum, prevent that increase.
Clouded Mirror
The first time each combat an enemy becomes harder to target because of Steam, Shadow, or a similar state, draw 1 Trick.
Bathhouse Slippers
The first temporary increase to a Trick's Nerve cost each combat is ignored.
Rain Wing Key
Bathhouse doors, maintenance valves, drainage grates, pipe routes, boiler rooms, and water control passages become easier to access during exploration.
## 54. Bathhouse Curiosity hooks
### The Bath That Fills Itself
The water changes temperature depending on which Companion approaches.
The player can bathe the Companion, search beneath the water, drain it, or leave it alone.
### The Fogged Mirror
A message appears:
THEY ARE DOWNSTAIRS
Wipe it away.
Wait for another message.
Write back.
The handwriting is not the kids'.
### The Pet Shampoo Shelf
Bottles are labeled for animals that passed through the mansion.
One recently opened bottle has the active Kid's missing pet's name written on masking tape.
### The Drain
A familiar object is caught far below the grate.
Following the pipe may reveal a Secret Connector toward the Kennels or Pet Holding Ward.
### The Rain Room
Rain falls indoors beneath a perfectly dry ceiling.
Standing in it produces memories that do not belong to the Kid.
These may be Drizzle's memories.
### The Bathhouse Register
The Matron kept records of animals brought here for:
Cleaning.
Warming.
Treatment.
Calming.
Observation.
Transfer.
The word Transfer appears increasingly often in recent entries.
That can point the investigation toward the Kennels and Animal Ward.
## 55. Important campaign clue
The Bathhouse can establish that newly arrived animals move through a care process.
An animal may be:
Found by the house.
Moved through a Secret Passage.
Brought to the Bathhouse.
Cleaned and evaluated.
Transferred to the Kennels and Animal Ward.
Then eventually moved deeper if nobody comes for it.
This is important because the mansion's operation begins to look like an actual institutional system.
The house is not behaving randomly.
It has procedures.
Those procedures were built around helping genuinely lost animals.
They become horrifying only because the system does not adequately distinguish:
Lost
from
Loved and being searched for.
## 56. Architectural identity
The established Bathhouse and Rain Wing contains 18 rooms.
A strong authored set is:
Bathhouse Reception
Changing Room
Towel Room
Warm Bath
Cold Bath
Rain Room
Steam Room
Shower Hall
Mirror Gallery
Pipe Corridor
Drain Chamber
Boiler Room
Laundry Room
Water Tank
Flooded Hall
Matron's Office
Rain Gallery
Grand Bath
The earlier rooms should feel comforting and domestic.
The deeper rooms become increasingly impossible.
Rain falls upward.
Water hangs in spheres.
Pipes disappear into ceilings.
The Grand Bath seems deeper than the entire mansion is tall.
## 57. Bathhouse Connectors
Natural connections include:
Drain tunnels into the Crypt.
Boiler passages into Lampworks.
Laundry routes toward Sleeping Quarters.
Servant corridors toward the Ballroom.
Pipe shafts into Kitchens.
Storm drains toward exterior grounds.
Animal sized drainage tunnels toward the Kennels.
A major maintenance conduit leading toward the Heart's holding systems.
This region should make the mansion feel physically interconnected through utilities rather than only hallways.
## 58. Blueprint investigation progression
Early notes:
"Rain indoors again."
Later:
"Water goes to kennels."
Later:
"New animals come through here."
Later still:
"They clean them before transfer."
Eventually:
"THIS IS A PROCESS."
That is an important campaign turning point.
The kids are no longer simply exploring a haunted mansion full of strange rooms.
They are beginning to understand the mechanism by which the mansion acquires, evaluates, transforms, and retains animals.
## 59. What the Bathhouse and Rain Wing teaches
By the time the player reaches The Drowned Matron, the region has taught:
Weather can function as a shared combat state.
Environmental conditions can help the player and enemies simultaneously.
Wet should be contextual rather than a generic debuff.
Enemy resources can change Weather when released.
Weather can affect vulnerability, defense, sequencing, and information.
Entire encounters can move through predictable environmental cycles.
The player can manipulate environmental state rather than simply endure it.
There does not need to be one universally optimal battlefield condition.
Changing the environment can become an offensive strategy against the boss.
Care becomes coercion when the person receiving it is not allowed to decide when it is enough.
