# The Grand Study and Library

_Source: Midnight Menagerie Design.docx, lines 17530-18554_

# The Grand Study and Library
Companion: Crinkle Boss: The Archivist Region identity: Trick annotation, classification, copying, folding, temporary card modification, deck knowledge, and enemies reacting to patterns in what the player plays
The Grand Study and Library should feel like the mansion is studying the player back.
Books rearrange themselves according to what Tricks are in the deck. Marginal notes appear before the kids write them. Index cards contain information about expeditions that have not happened yet. Paper animals fold themselves out of discarded pages.
The central combat lesson is:
Your deck is information, and enemies can use that information.
Unlike the Graveyard, which tells the player what enemies will do in the future, the Library watches what the player does and responds intelligently.
Crinkle fits naturally because its own identity involves folding, alternate Trick forms, copying, tearing, and transforming information into new shapes.
# 1. Library enemy roster
The six ordinary enemies are:
Book Bat
Inkblot
Paper Knight
Bookmark Imp
Quill Clerk
Index Beast
The three Big Scares are:
The Bookwyrm
The Living Index
The Inkblot Oracle
Boss:
The Archivist
# 2. Regional mechanic: Markup
Several Library enemies place temporary modifications called Markup onto individual Tricks.
Markup always:
Identifies the affected Trick clearly
Explains exactly what will happen
Disappears when its condition resolves
Disappears after combat
Never permanently alters the player's deck
Examples include:
Bookmarked
Corrected
Dog Eared
Misfiled
The Library should make the player's deck feel temporarily scribbled over without ever making permanent changes without consent.
# 3. Important copying rule
Library enemies can copy information from Tricks.
They should not literally execute arbitrary player card text.
That would create enormous balance and implementation problems.
Instead, enemy copies translate the Trick into predictable properties such as:
Trick type
Nerve cost
Whether it dealt damage
Whether it generated Guard
Whether it was a Power
Whether it was upgraded
This preserves the fantasy of enemies studying the player's deck without requiring every Trick in the game to have a bespoke enemy interpretation.
# 4. Book Bat
Role: Introductory prediction enemy Courage: 24
A leather bound book flaps through the room using its covers as wings.
Tiny spectacles hang from a ribbon around its spine.
### Core mechanic: Read Ahead
Book Bat can reveal the top Trick of the player's draw pile.
The Trick stays where it is.
The Book Bat's next action changes according to that Trick's type.
### If the revealed Trick is an Attack
Book Bat prepares:
Hide Behind the Cover
Gain 11 Guard.
### If it is a Skill
Book Bat prepares:
Scholarly Swoop
Deal 9 damage.
### If it is a Power
Book Bat prepares:
Alarmed Screech
Deal 6 damage.
Gain 6 Guard.
### Moves
Read Ahead
Reveal the top Trick.
Prepare the appropriate response.
Page Peck
Deal 6 damage.
Flutter Away
Gain 8 Guard.
### Behavior
Read Ahead.
Resolve response.
Page Peck.
Flutter Away.
Repeat.
### Why it works
The player knows both:
What they will probably draw next.
What the Book Bat intends to do because of it.
If the deck can manipulate draw order, the player can even change the answer.
# 5. Inkblot
Role: Pattern copying enemy Courage: 30
A puddle of black ink crawls across the floor and briefly takes the shape of whatever it just observed.
### Core mechanic: Impression
At the end of every player turn:
Inkblot records the type of the last Trick played.
Its next specialized move depends on that Impression.
### Attack Impression
Ink Claw
Deal 10 damage.
### Skill Impression
Ink Shield
Gain 12 Guard.
Deal 4 damage.
### Power Impression
Ink Bloom
Gain 1 Darkening.
Each Darkening gives Inkblot 2 additional attack damage.
Maximum 3.
Then deal 5 damage.
### If no Trick was played
Inkblot uses:
Blank Page
Gain 7 Guard.
### Other move
Smear
Deal 7 damage.
Clear Impression afterward.
### Pattern
Impression response.
Smear.
Impression response.
Smear.
Repeat.
### Strategic effect
The player can deliberately end their turn with a particular Trick type to manipulate Inkblot's next action.
# 6. Paper Knight
Role: Alternate form enemy Courage: 39
A knight folded from thick parchment.
Its sword is a sharpened ruler.
Its shield is an old library card.
### Core mechanic: Folded and Unfolded
Paper Knight alternates between two forms.
## Folded
Compact and defensive.
The first Attack Trick that damages it each turn deals 5 less damage.
Minimum 0.
### Folded moves
Paper Shield
Gain 10 Guard.
Needle Point
Deal 7 damage.
### Unfolded
Larger and more vulnerable.
Takes normal damage.
Its attacks are stronger.
### Unfolded moves
Full Page Slash
Deal 12 damage.
Paper Sweep
Deal 5 damage twice.
### Forcing Unfold
If Paper Knight takes at least 14 Attack damage during one player turn while Folded:
It immediately becomes Unfolded.
Its next action becomes Full Page Slash.
### Refolding
After taking two actions while Unfolded:
Use:
Refold
Gain 8 Guard.
Become Folded.
### Design purpose
The player can wait for natural transformation or spend enough damage to force it.
Crinkle's own folded forms make this concept immediately recognizable.
# 7. Bookmark Imp
Role: Hand sequencing enemy Courage: 26
A little red creature with a ribbon tail and a bookmark shaped tongue.
### Core mechanic: Bookmarked
Bookmark Imp marks one Trick in the player's hand.
The affected Trick becomes Bookmarked until the end of that player turn.
The player has a choice.
### If the Bookmarked Trick is played
Bookmark Imp immediately deals 4 damage.
This triggers once.
### If the Bookmarked Trick is not played
At end of turn:
Place that Trick on the bottom of the draw pile.
Bookmark Imp gains 7 Guard.
Then remove Bookmarked.
### Moves
Mark Your Place
Apply Bookmarked.
Ribbon Whip
Deal 7 damage.
Hold the Page
Gain 9 Guard.
### Pattern
Mark Your Place.
Ribbon Whip.
Hold the Page.
Ribbon Whip.
Repeat.
### Strategic purpose
The enemy creates a small sequencing dilemma.
Is the Trick worth playing now despite the immediate consequence?
Or should the player accept losing access to it for a while?
# 8. Quill Clerk
Role: Temporary Trick modification enemy Courage: 33
A floating quill wearing tiny white gloves furiously edits everything it sees.
### Core mechanic: Correction
Quill Clerk can mark individual Tricks as Corrected.
A Corrected Trick costs 1 additional Nerve the next time it is played.
Then Correction disappears.
Maximum two Corrected Tricks can exist from one Quill Clerk.
### Moves
Red Ink
Mark one Trick in the player's hand as Corrected.
Prefer a Trick costing at least 1 Nerve.
Editorial Jab
Deal 8 damage.
Margin Note
Mark the top Trick of the draw pile as Corrected.
Reveal that Trick.
Gain 5 Guard.
### Pattern
Red Ink.
Editorial Jab.
Margin Note.
Editorial Jab.
Repeat.
### Important rule
The same Trick cannot receive multiple Corrections.
No 4 Nerve Basic Attack nonsense.
# 9. Index Beast
Role: Player pattern adaptation Courage: 44
A large animal made from index cards, drawer labels, library tabs, and wooden catalogue handles.
Its body reorganizes itself according to what the player does.
### Core mechanic: Classification
At the end of the player turn, Index Beast checks which Trick type the player used most.
Attack.
Skill.
Power.
That category becomes Indexed for its next action.
Ties use whichever tied type was played most recently.
### Attack Indexed
Defensive Filing
Gain 15 Guard.
### Skill Indexed
Overdue Charge
Deal 12 damage.
### Power Indexed
Permanent Record
Gain 1 Record.
Each Record gives 2 additional attack damage.
Maximum 3.
Then deal 6 damage.
### Diverse turn
If the player used at least one Attack, one Skill, and one Power:
Index Beast instead becomes Confused.
Its next action becomes:
Reorganize
Gain 7 Guard.
Deal no damage.
### Other attack
Drawer Slam
Deal 8 damage.
### Pattern
Indexed response.
Drawer Slam.
Indexed response.
Drawer Slam.
Repeat.
### Design purpose
Index Beast rewards deliberate variation without requiring it.
A highly specialized deck can simply prepare for its predictable response.
# 10. Early Library Scuffles
### Scuffle 1
Book Bat
Purpose:
Introduce enemies inspecting deck information.
### Scuffle 2
Inkblot
Purpose:
Introduce reactions to player sequencing.
### Scuffle 3
Paper Knight
Purpose:
Introduce alternate enemy forms.
### Scuffle 4
Bookmark Imp
Purpose:
Introduce Trick specific Markup.
# 11. Standard Library Scuffles
### Scuffle 5
Book Bat
Bookmark Imp
The player knows their next draw while deciding whether to play a particular current Trick.
### Scuffle 6
Paper Knight
Quill Clerk
The player may need to sequence around corrected Tricks while trying to force Unfold.
### Scuffle 7
Inkblot
Book Bat
One enemy responds to the last Trick played.
The other responds to the next Trick expected.
The player's whole deck cycle suddenly matters.
### Scuffle 8
Quill Clerk
Bookmark Imp
One enemy modifies future Trick efficiency.
The other pressures the current hand.
# 12. Advanced Library Scuffles
### Scuffle 9
Index Beast
Solo introduction.
This lets the player learn Classification without other distractions.
### Scuffle 10
Index Beast
Book Bat
The Beast responds to broad turn composition while the Bat reads the next draw.
### Scuffle 11
Paper Knight
Inkblot
The player may want to end with a Skill to manipulate Inkblot, even while needing Attacks to force Paper Knight open.
### Scuffle 12
Bookmark Imp
Quill Clerk
Paper Knight
A strong sequencing encounter.
The hand is modified while the Knight creates a burst damage threshold.
### Scuffle 13
Index Beast
Quill Clerk
Correction may interfere with the player's preferred classification pattern.
### Scuffle 14
Index Beast
Inkblot
Book Bat
The hardest baseline Library formation.
One enemy reads the player's overall turn.
One reads the last Trick.
One reads the future draw.
The player is effectively managing three different interpretations of their deck simultaneously.
# 13. Encounter generation rules
Index Beast cannot appear before the player has completed at least two Library Scuffles.
Quill Clerk cannot appear in the first Scuffle.
Two Quill Clerks cannot appear together at Haunt 0.
Two Index Beasts cannot appear together.
Paper Knight should appear alone before appearing with Quill Clerk.
Bookmark Imp cannot Bookmarked a Trick already Corrected if another valid target exists.
Scuffle 14 belongs only to the advanced encounter pool.
# 14. Big Scare: The Bookwyrm
Courage: 139
Role: Temporary deck removal and adaptation
The Bookwyrm is a long serpentine creature covered in overlapping pages instead of scales.
Its belly is full of half digested books.
### Core mechanic: Devour
The Bookwyrm can temporarily swallow the player's Tricks.
When it uses:
Demand a Volume
The player chooses one Trick from their hand.
That Trick becomes Swallowed.
It is removed from the player's deck for the remainder of combat unless recovered.
Maximum three Swallowed Tricks.
The Bookwyrm gains a temporary ability based on the Trick type.
### Swallowed Attack
Gain Sharp Prose.
Next damaging attack deals 4 additional damage.
### Swallowed Skill
Gain Useful Reference.
Next time Bookwyrm gains Guard, gain 6 additional Guard.
### Swallowed Power
Gain Forbidden Knowledge.
Gain 1 permanent Insight.
Each Insight grants 1 attack damage and 2 maximum Guard whenever the Bookwyrm gains Guard.
Maximum 3 Insight.
### Recovering Tricks
Whenever the Bookwyrm loses at least 22 Courage during one player turn:
It coughs up the oldest Swallowed Trick.
That Trick returns immediately to the player's hand.
Once per turn.
All remaining Tricks return after combat.
### Moves
Demand a Volume
Swallow one chosen Trick.
Gain 5 Guard.
Spine Whip
Deal 13 damage.
Page Storm
Deal 4 damage three times.
Digest
Use all pending swallowed type bonuses that can currently resolve.
Gain 8 Guard.
### Pattern
Demand a Volume.
Spine Whip.
Page Storm.
Demand a Volume.
Digest.
Repeat.
### Strategic question
What Trick are you willing to temporarily lose?
A weak Basic?
A Power you did not intend to play yet?
A strong Trick you know you can recover immediately through burst damage?
That makes Devour a meaningful player choice rather than random card theft.
# 15. Big Scare: The Living Index
Courage: 126
Role: Long term category management
An enormous wooden card catalogue walks around on dozens of tiny drawer legs.
Every drawer opens into another drawer.
### Core mechanic: Index Entries
The Living Index tracks three counters:
Attack Entries
Skill Entries
Power Entries
Whenever the player plays a Trick:
Add 1 Entry to the appropriate category.
At 4 Entries:
That category becomes Filed.
It immediately resets to 0 and schedules an effect for the next enemy turn.
### Attack Filed
Cross Reference: Violence
Gain 14 Guard.
Its next attack deals 4 additional damage.
### Skill Filed
Cross Reference: Preparation
Gain 10 Guard.
The player draws 1 fewer Trick next turn.
Minimum draw 3.
### Power Filed
Cross Reference: Permanence
Gain 1 Permanent Record.
Each Permanent Record gives 2 attack damage.
Maximum 3.
### Multiple Files
Multiple categories can become Filed in one player turn.
All scheduled effects resolve.
This makes extremely long combo turns potentially dangerous.
### Moves
Drawer Charge
Deal 11 damage.
Catalogue Slam
Deal 5 damage twice.
Reshelve
Reduce the highest current Entry count by 1.
Gain 10 Guard.
### Pattern
Drawer Charge.
Reshelve.
Catalogue Slam.
Drawer Charge.
Repeat.
Filed effects resolve in addition to its normal move.
### Player agency
The Entry counters are completely visible.
The player can intentionally stop a category at 3.
Or deliberately trigger it now to clear the counter before a more important turn.
# 16. Big Scare: The Inkblot Oracle
Courage: 132
Role: Distorted copying
A towering black shape sits behind a desk.
It has no fixed body.
Whenever the player plays a Trick, a distorted image of that action briefly appears inside it.
### Core mechanic: Reflection
At the end of the player turn:
The Inkblot Oracle selects the highest Nerve cost Trick played that turn.
Ties use the last tied Trick.
It creates a simplified Reflection based on that Trick.
### Reflected Attack
Next turn:
Violent Reflection
Deal 5 damage plus 3 per printed Nerve cost of the copied Trick.
### Reflected Skill
Next turn:
Protective Reflection
Gain 6 Guard plus 4 per printed Nerve cost.
Then deal 4 damage.
### Reflected Power
Next turn:
Enduring Reflection
Gain 1 Vision per printed Nerve cost.
Maximum 5 total Vision.
Each Vision gives 1 additional attack damage for the rest of combat.
### Zero cost Trick
A 0 Nerve Trick still produces a Reflection.
The base effect remains.
### Other moves
Ink Finger
Deal 9 damage.
Blot the Margin
Apply Corrected to one Trick in the player's hand.
Wash Away
Lose all current Guard.
Then gain 16 Guard.
This intentionally resets accumulated defensive modifiers.
### Pattern
Resolve Reflection.
Ink Finger.
Blot the Margin.
Resolve Reflection.
Wash Away.
Repeat.
### Strategic question
Playing an expensive Trick may still be completely correct.
But now its enemy echo becomes part of the cost calculation.
# 17. The Archivist
Boss Courage: 345
The Archivist is a tall figure wrapped in layered paper robes.
Its head resembles an old brass library lamp surrounded by floating spectacles.
Dozens of mechanical hands move around it, stamping cards, shelving books, writing notes, and filing records.
The Archivist does not consider Crinkle a prisoner.
It considers Crinkle:
Part of the collection.
That distinction means everything to The Archivist and nothing to Crinkle.
# 18. The Archivist's core mechanic: The Catalogue
Three large catalogue tabs appear beside The Archivist:
Attacks
Skills
Powers
Each begins at 0.
Whenever the player plays a Trick:
Add 1 Catalogue Entry to the matching tab.
At 4 Entries, that tab becomes:
Filed
A Filed tab cannot gain additional Entries until The Archivist processes it.
This creates an important strategic wrinkle.
Once the Attack tab is Filed, the player may play more Attacks without increasing that tab until The Archivist resolves it.
The player can exploit the bureaucracy.
# 19. Processing Filed categories
At the beginning of The Archivist's turn:
If one or more tabs are Filed:
Process the tab that became Filed first.
Only one tab is processed per enemy turn during phase one.
After processing:
Reset that tab to 0.
Other Filed tabs remain waiting.
# 20. Attack Catalogue effect
Offensive Works
The Archivist gains 16 Guard.
Its next damaging move deals 4 additional damage.
# 21. Skill Catalogue effect
Practical Works
Apply Correction to two different Tricks.
Targets can come from:
Hand first.
Then draw pile if fewer than two valid Tricks are in hand.
Affected Tricks are revealed.
# 22. Power Catalogue effect
Restricted Works
The Archivist gains 1 Citation.
Each Citation gives:
1 permanent attack damage.
Maximum 5.
Then gain 8 Guard.
Powers therefore create long term pressure, but one or two Power heavy turns are not catastrophic.
# 23. Exploiting bureaucracy
Suppose all three categories become Filed during one enormous turn.
The Archivist can process only one next turn.
The other two remain Filed.
While they remain Filed:
The player can continue playing those Trick types without adding more Entries.
This means deliberately overwhelming The Catalogue can be strategically excellent.
The boss mechanic should reward players who understand its rules deeply enough to exploit them.
# 24. Archivist phase one moves
From 345 through 196 Courage.
### Paper Cutter
Deal 12 damage.
### Stamp of Approval
Gain 12 Guard.
The next Trick added to a Catalogue tab counts as 2 Entries instead of 1.
This effect disappears after triggering.
### Margin Correction
Deal 7 damage.
Apply Correction to one Trick in hand.
### Reorganize
Reduce the highest non Filed Catalogue counter by 1.
Gain 8 Guard.
If every tab is either at 0 or Filed:
Gain 13 Guard instead.
### Opening sequence
Stamp of Approval.
Paper Cutter.
Margin Correction.
Paper Cutter.
Reorganize.
Repeat.
Catalogue processing occurs separately at the beginning of each enemy turn.
# 25. Phase one strategy
The player can:
Spread Tricks across categories
Fill one category deliberately
Fill multiple categories to overload processing
Avoid a Power filing if Citation is becoming dangerous
Trigger Skill filing when Correction is relatively harmless
Use a long combo after a tab is already Filed
The Catalogue is therefore not merely a punishment meter.
It is a manipulable resource.
# 26. Phase transition
At 195 Courage:
The Archivist uses:
This Collection Is Misclassified
Clear all non Filed Catalogue Entries.
Resolve no waiting Filed effects.
Waiting Filed tabs remain Filed.
The Archivist tears several catalogue labels from their drawers and attaches them directly to the player's Tricks.
Phase two begins.
# 27. Phase two mechanic: Misfiled
At the beginning of every player turn:
The Archivist marks one Trick in hand as Misfiled.
That Trick still performs its normal effect and retains its actual Trick type for every other game system.
But for The Catalogue only, it counts as a different type.
The new Catalogue type is shown on the card.
Examples:
Attack counted as Skill.
Skill counted as Power.
Power counted as Attack.
Misfiled disappears after that Trick is played or at end of turn.
### Why this is interesting
Misfiled is not necessarily harmful.
The player can use it to:
Avoid filling one dangerous Catalogue
Intentionally fill another
Overload multiple tabs
Manipulate processing order
The Archivist is trying to confuse the records.
A clever player weaponizes the mistake.
# 28. Phase two Catalogue threshold
During phase two:
A category becomes Filed at 3 Entries instead of 4.
The Archivist still processes only one Filed category each enemy turn.
This makes Catalogue management faster without destroying the exploit of overloading it.
# 29. Phase two moves
### Red Pen
Deal 14 damage.
### Binding Thread
Deal 5 damage three times.
If at least one tab is currently Filed:
Gain 6 Guard.
### Complete Revision
Apply Correction to one Trick in hand and one revealed Trick in the draw pile.
Gain 7 Guard.
### Reshelve Everything
Each non Filed Catalogue counter moves 1 step toward 2.
Examples:
0 becomes 1.
1 becomes 2.
2 remains 2.
This cannot directly File a category.
### Pattern
Red Pen.
Complete Revision.
Binding Thread.
Reshelve Everything.
Repeat.
# 30. Phase two Catalogue processing upgrades
The Filed effects become slightly stronger.
### Offensive Works
Gain 18 Guard.
Next attack gains 5 damage.
### Practical Works
Apply Correction to three Tricks instead of two.
No Trick can receive multiple Corrections.
### Restricted Works
Gain 1 Citation.
Gain 10 Guard.
Maximum Citation remains 5.
# 31. Final escalation
At 75 Courage or less:
The Archivist gains:
Final Edition
Correction no longer lasts indefinitely.
Instead:
Any existing Corrected Trick loses Correction after being drawn once, even if the player does not play it.
This actually makes the card interference slightly less oppressive.
In exchange:
The Archivist gains 2 permanent attack damage.
Its damaging moves gain an additional 2 damage.
### Why make the deck interference easier?
The end of the boss fight should accelerate toward a finish rather than bury the player under increasing card tax.
The final danger becomes direct combat.
The player feels like they have broken The Archivist's careful filing system and forced it to abandon procedure.
# 32. Optional rare boss move: Cross Reference
Once per phase, if all three Catalogue tabs are simultaneously Filed:
The Archivist's next move becomes:
Cross Reference
Gain 15 Guard.
Lose 1 Citation if any exists.
Become Overwhelmed until the end of the next player turn.
While Overwhelmed:
Take 20 percent additional damage.
### Design purpose
The player's greatest possible Catalogue overload creates a genuine reward.
This turns mastering the boss's central mechanic into an offensive strategy.
# 33. Why Crinkle feels especially good here
Crinkle should interact beautifully with the Library without receiving a numerical advantage.
### Folding
Paper Knight and the region's physical design make Crinkle's alternate forms immediately intuitive.
### Alternate Trick forms
A Crinkle player may have more control over which Trick type or form is actually played, giving additional tools for Catalogue manipulation.
### Copying
The Bookwyrm, Inkblot, and Inkblot Oracle all present hostile versions of copying.
Crinkle's copying is self directed.
The Library's copying is intrusive.
### Tearing
Crinkle builds that sacrifice or tear Tricks may handle temporary Corrected cards in unusual ways.
### Transformation
If Crinkle can change a Trick's form before playing it, that may affect which Catalogue category it enters according to the Trick's actual form at the moment it resolves.
That interaction should be supported intentionally.
# 34. Important Crinkle rules interaction
For The Archivist:
Catalogue type should be determined when the Trick is played.
If Crinkle transforms an Attack into a Skill before playing it:
It counts as a Skill.
If the Trick is Misfiled:
It instead counts according to the Misfiled label for The Catalogue only.
This makes card transformation mechanically meaningful in Crinkle's home region without creating an arbitrary bonus.
# 35. Boss narrative outcome
### Crinkle not yet rescued
The Archivist has kept Crinkle in the Library as a living specimen.
Crinkle has been:
Catalogued.
Pressed flat.
Refolded.
Documented.
Assigned classification numbers.
Placed in drawers.
Moved when The Archivist decides a different category is more accurate.
The Archivist thinks this is preservation.
Crinkle thinks this is extremely annoying.
Defeating The Archivist allows Crinkle to leave the collection.
### Crinkle already rescued and currently active
This becomes Crinkle's Legacy homecoming.
The emotional theme is:
Understanding something is not the same as owning it.
### Another Companion active
Normal regional boss reward.
No Crinkle Legacy advancement.
# 36. Multiplayer scaling
Use the established baseline:
2 players:
160 percent Courage.
3 players:
210 percent.
4 players:
255 percent.
The Library should scale through multiple decks providing information simultaneously.
# 37. Book Bat multiplayer
Read Ahead chooses one player.
Reveal that player's top Trick.
The intended target of any damaging response is that same player.
The player being read is clearly marked.
# 38. Inkblot multiplayer
Inkblot records the last Trick played by the entire team during the round.
That means turn order matters.
The team can intentionally decide which player's final Trick creates the Impression.
# 39. Paper Knight multiplayer
Unfold threshold uses team damage during the round.
Recommended thresholds:
2 players: 20 Attack damage
3 players: 26
4 players: 31
Once Unfolded, it remains Unfolded through the entire next team round.
# 40. Bookmark Imp multiplayer
Bookmarked is applied to one player's Trick.
Only that player determines whether the mark resolves through play or nonplay.
The resulting immediate damage targets that player.
# 41. Quill Clerk multiplayer
Red Ink targets one player.
It prefers a player without an existing Correction.
This spreads inconvenience rather than repeatedly suppressing one deck.
# 42. Index Beast multiplayer
Classification checks the whole team round.
Instead of raw card count, use proportion.
If more than half of all Tricks played were Attacks:
Attack Indexed.
If more than half were Skills:
Skill Indexed.
If more than half were Powers:
Power Indexed.
If no category exceeds half:
Reorganize.
This naturally rewards diverse team composition.
# 43. Bookwyrm multiplayer
Demand a Volume selects one player.
That player chooses the Trick to surrender.
The Bookwyrm cycles players when possible so one deck is not repeatedly stripped.
### Recovery threshold
Use total team damage.
2 players:
34 Courage.
3 players:
4 players:
Only one Swallowed Trick can be recovered per team round.
The recovered Trick returns to its owner's hand.
# 44. Living Index multiplayer
Index Entries are shared across all players.
Thresholds increase slightly:
2 players:
6 Entries.
3 players:
4 players:
This is intentionally less than simply multiplying 4 by player count because team play naturally produces more varied Trick types.
Multiple categories can still File during the same round.
# 45. Inkblot Oracle multiplayer
At the end of the team round:
It selects the highest printed Nerve cost Trick played by any player.
The owner of that Trick becomes the primary target of an Attack Reflection.
Skill and Power Reflections remain global effects on the Oracle.
This creates an interesting cooperative concern around expensive finishers.
# 46. The Archivist multiplayer Catalogue
Each player has their own three Catalogue counters.
This is preferable to one enormous shared Catalogue because each Companion should retain a distinct relationship to the boss.
Every player tracks:
Attack.
Skill.
Power.
### Phase one threshold
4 Entries.
### Phase two threshold
3 Entries.
### Processing
At the beginning of The Archivist's turn:
It processes up to:
1 Filed tab with one player.
2 Filed tabs with two players.
2 Filed tabs with three players.
3 Filed tabs with four players.
It always processes the oldest Filed tabs first.
# 47. Multiplayer Catalogue effects
### Offensive Works
The Archivist gains Guard once.
The player whose Catalogue triggered it becomes the target of the enhanced attack if possible.
### Practical Works
Corrections primarily target Tricks belonging to the triggering player.
### Restricted Works
Citation remains a global boss buff.
This makes Power heavy players potentially create a team wide problem.
That is appropriate because teammates can help compensate.
# 48. Multiplayer Misfiled
Each player receives at most one Misfiled Trick per round.
With four players, The Archivist marks only two players each round and alternates targets.
This prevents excessive UI clutter.
# 49. Multiplayer cooperative opportunities
One player may deliberately fill Attack Catalogue so another player can act without worrying about the next processing slot.
A Crinkle player can manipulate Trick forms to control their own Catalogue.
A teammate can finish a Bookwyrm damage threshold to return someone else's essential Trick.
Players can coordinate the last Trick played against Inkblot.
A player with inexpensive Tricks may deliberately create the Inkblot Oracle Reflection so a teammate can safely play a powerful expensive Trick on a different turn.
A diverse team can keep Index Beast from achieving a dominant Classification.
The Library rewards players for understanding each other's decks, which is thematically ideal.
# 50. Haunt Level progression
### Haunt 1
Ordinary enemies gain approximately 8 percent Courage.
Big Scares and The Archivist gain approximately 6 percent.
### Haunt 2
Advanced Library formations appear earlier.
### Haunt 3
Book Bat's first Read Ahead reveals the top two Tricks.
The player chooses which remains on top.
Book Bat reacts to the one left on top.
This actually gives the player more agency while making the information puzzle richer.
### Haunt 4
Inkblot retains its previous Impression if the player ends a turn without playing a Trick.
### Haunt 5
Paper Knight's Folded reduction increases from 5 to 7.
### Haunt 6
Bookmark Imp's Bookmarked immediate damage increases from 4 to 6.
### Haunt 7
Quill Clerk can maintain 3 Corrections instead of 2.
### Haunt 8
Index Beast becomes Confused only if all three Trick types were played and no type represented more than half of the turn.
### Haunt 9
Big Scares gain signature upgrades.
Bookwyrm begins with one random swallowed Basic Trick from the player's draw pile. The Trick is shown immediately.
Living Index begins with 1 Entry in each category.
Inkblot Oracle begins with 1 Vision.
### Haunt 10
The Archivist begins combat with:
2 Attack Entries.
1 Skill Entry.
1 Power Entry.
The opening Catalogue state is visible before the player acts.
# 51. Higher Haunt behavior upgrades
Potential later upgrades include:
Book Bat can read a Trick in the discard pile and predict when it will return.
Inkblot can retain two Impressions and alternate between them.
Paper Knight can fold itself into a second specialized defensive shape.
Bookmark Imp can move Bookmarked from one Trick to another if the player draws additional cards.
Quill Clerk can correct a Trick's type for one play rather than only its cost.
Index Beast may track upgraded versus unupgraded Tricks as an additional category.
Bookwyrm may temporarily swallow two cheap Tricks instead of one expensive Trick.
The Living Index may gain a fourth temporary category based on 0 Nerve Tricks.
The Archivist may deliberately Misfile a Trick into the category closest to becoming Filed.
These should appear only at high Haunt Levels because the Library already demands substantial card state awareness.
# 52. Library themed run reward concepts
### Brass Bookmark
The first time each combat a specific Trick is marked or modified by an enemy, draw 1 Trick.
### Folding Ruler
The first transformed Trick you play each combat costs 1 less Nerve.
Minimum 0.
### Librarian's Stamp
Whenever you play an Attack, Skill, and Power during the same turn, gain 5 Guard.
Once per turn.
### Bottle of Red Ink
The first temporary cost increase applied to one of your Tricks each combat is ignored.
### Reading Glasses
At the start of combat, reveal the top 3 Tricks of your draw pile.
You may place one on the bottom.
### Restricted Section Key
Library doors, archive cabinets, locked studies, document vaults, and hidden bookshelves become easier to access during exploration.
# 53. Library Curiosity hooks
### The Book About You
The player finds a book titled with the active Kid's full name.
Early chapters describe their life accurately.
The final pages are blank.
Possible choices:
Read further.
Write something.
Tear out a page.
Close it.
### The Missing Pet Index
A catalogue drawer contains cards for animals the mansion has taken.
Some cards are decades old.
Some are recent.
A card exists for the active Kid's missing pet.
Its status may initially read:
UNCATALOGUED
Later:
NEW ARRIVAL
Eventually:
A location code.
This can become a major persistent investigation system.
### The Origami Flock
Dozens of paper birds sit on a shelf.
One resembles Crinkle.
One unfolds into a handwritten map fragment.
### The Book That Bites
Open it.
Feed it another book.
Offer it a Trick.
Put it back.
### The Children's Ledger
The Archivist has records of previous children who entered the mansion.
Some escaped.
Some never reached the Heart.
Several names have been deliberately blacked out.
### The Incorrect Blueprint
An architectural folio shows the mansion.
It contains rooms that do not exist on the current blueprint.
Several eventually appear in later expeditions.
# 54. Important campaign clue: The Catalogue
The Grand Study and Library should contain one of the first hard pieces of evidence that the mansion is not taking animals randomly.
The Archivist's records reveal classifications such as:
Lost
Unclaimed
Unsafe Outside
Returned Repeatedly
Suitable for Sanctuary
New Arrival
That implies the mansion has an actual internal system for deciding which animals it believes should remain.
The kids may initially assume The Archivist created this system.
Later they learn:
The Archivist is merely documenting decisions made by the house itself.
That helps build toward the Heart.
# 55. Architectural identity
The established Grand Study and Library contains 21 rooms.
A strong authored room set would be:
Grand Reading Room
Main Stacks
East Stacks
West Stacks
Children's Library
Atlas Room
Map Cabinet
Periodicals Room
Rare Books Room
Restricted Collection
Ancestral Study
Writing Room
Copying Room
Index Hall
Catalogue Chamber
Archivist's Office
Restoration Workshop
Rolling Ladder Gallery
Whispering Stacks
Book Vault
Grand Archive
These should vary enormously in physical shape.
The Stacks can be narrow and labyrinthine.
The Grand Reading Room can be huge and vertically open.
The Catalogue Chamber can be geometrically precise.
The Whispering Stacks can violate normal architecture.
# 56. Library Connectors
Useful Connector spaces include:
Bookcase doors.
Rolling ladder passages.
Fireplaces into private studies.
Service stairs.
Archive lifts.
Map drawers large enough to crawl through.
Rotating shelves.
A dumbwaiter used to move books between floors.
A paper tunnel created when an atlas unfolds into a physical landscape.
One staircase should lead upward directly toward the Moonlit Attic and Observatory.
That makes the transition into Wink's region architecturally natural.
# 57. Blueprint investigation progression
Early notes:
"Library keeps changing alphabetically??"
Later:
"Books move when we move."
Later:
"It has files on the pets."
Later still:
"House decides. Archivist records."
Eventually:
"There are records from before the mansion was built."
That last discovery should raise a major mystery:
Is the mansion older than the building?
Or did something that became the mansion exist before the physical structure?
# 58. What the Grand Study and Library teaches
By the time the player reaches The Archivist, the region has taught:
Enemies can inspect the player's deck.
Trick specific temporary modifications can create meaningful decisions without permanent punishment.
Enemy behavior can depend on what the player played last.
Enemies can react to the overall composition of a turn.
Individual Tricks can be temporarily removed and recovered.
Copying arbitrary card text is unnecessary for creating a convincing copying mechanic.
Trick types can become tactical resources beyond their printed effects.
A player's own repetitive patterns can become predictable to enemies.
Systems designed to categorize the player can often be manipulated by the player.
Information is valuable, but classification is not understanding.
That last point is central to Crinkle and The Archivist.
The Archivist knows almost everything about Crinkle.
It still does not understand what Crinkle wants.
