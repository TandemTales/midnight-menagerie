# Content architecture, expansions, monetization boundaries

_Source: Midnight Menagerie Design.docx, lines 43637-44104_

# 1. Core commercial model
Midnight Menagerie is a premium game.
The base game contains the complete original campaign.
Base ownership must include:
All 8 original Kids
All 16 original Menagerie Companions
All 17 original mansion regions
All original Tricks
All original bosses
Kid progression
Backpacks
Companion Legacy progression
Haunt Levels
Solo play
Cooperative multiplayer
The Heart of the House
The original missing pet storyline and ending
No core progression system should require additional purchases.
# 2. Design content as modular packages from the beginning
Do not hardcode all game content as though the original release will permanently contain exactly 16 Companions and 17 regions.
Create a general Content Package system.
Every content package should have a permanent internal identifier.
Example:
base_game
expansion_forgotten_theater
cosmetic_pajama_collection
The base game itself should use the same content registration architecture as future expansions wherever practical.
This makes additional content an extension of existing systems rather than a separate special case.
# 3. Content ownership
Create a centralized ownership or entitlement service.
Game systems should be able to ask:
DoesPlayerOwn(contentPackageID)
Ownership should determine whether optional content is eligible to enter the game.
Ownership must not be used for base campaign progression.
The base package is always treated as owned for anyone who owns the game.
# 4. Separate ownership from gameplay unlocks
This distinction is essential.
A paid expansion Companion should not immediately become playable simply because the expansion is owned.
There are two separate states:
Owned
The player has access to the expansion containing the Companion.
Rescued
The player has found and freed that Companion through gameplay.
A Companion can therefore have states such as:
Not owned
Owned but undiscovered
Discovered but not rescued
Rescued
Legacy Rank I through VIII
The original 16 Companions are always owned but still follow normal rescue progression.
# 5. Companion data architecture
Every Companion should be data driven and use the same schema regardless of whether it belongs to the base game or an expansion.
Each Companion record should include fields conceptually similar to:
companion_id
content_package_id
display_name
home_region_id
starting_deck_id
trick_pool_id
mechanics
rescue_state
legacy_track_id
cosmetic_set_ids
multiplayer_trick_pool_id
portrait_assets
sprite_assets
dialogue_set_id
story_flags
Do not write game systems that explicitly assume the only possible Companion IDs are the original 16.
# 6. Region data architecture
Every mansion region should also be data driven.
Each region should include fields conceptually similar to:
region_id
content_package_id
display_name
associated_companion_id
boss_id
room_pool_id
blueprint_data
connection_rules
encounter_tables
story_requirements
discovery_requirements
completion_flags
legacy_support
The Heart of the House is a region with no associated Companion.
Future expansion regions should use the exact same region system.
# 7. Preserve the original campaign
The original 17 regions must remain sufficient to complete the original campaign.
Future expansion regions must not become prerequisites for:
Rescuing the original 16 Companions
Entering the original Heart of the House
Rescuing the original Kids' missing pets
Completing the base story
Unlocking normal base Haunt Levels
Base campaign progression requirements should refer explicitly to base campaign objectives rather than dynamically requiring every Companion or every region installed.
For example, do not implement:
if all_companions_rescued
if that would later include expansion Companions.
Instead use something conceptually equivalent to:
if base_menagerie_rescued
or a defined objective group containing the original 16.
# 8. Expansion regions integrate into the mansion
Future expansion regions should appear as additional parts of the same mansion.
Do not architect them as separate game modes unless a specific expansion later requires that.
The map system must support adding additional region definitions beyond the original 17.
Expansion regions should be capable of:
Appearing on the mansion blueprint
Connecting to existing regions
Having their own rooms
Participating in procedural expedition routing
Containing Scuffles
Containing Big Scares
Containing Curiosities
Containing Midnight Markets
Containing Blanket Forts
Containing Treasure
Containing Clues
Containing Secrets
Containing bosses
Containing Companion rescues
Supporting Legacy progression
# 9. Blueprint expansion support
The mansion blueprint system must support additional region layers or blueprint sections being revealed later.
Do not build the final blueprint as one permanently baked image that cannot be extended.
Use modular blueprint region data whenever possible.
The base mansion can initially display the 17 established regions.
Future content should be able to add additional blueprint sections while retaining the same visual system.
The player facing map should still use:
Architectural blueprint as the permanent base
Player investigation annotations as a separate overlay
Procedural route information as another dynamic layer
Expansion ownership should determine whether expansion architecture can become discoverable.
# 10. Expansion discovery
Owning an expansion should make its discovery event eligible.
The game should then unlock the region through normal narrative gameplay.
Use progression flags such as:
expansion_region_discovered
rather than displaying new regions immediately solely because the entitlement exists.
This preserves the fiction that the mansion is revealing previously hidden architecture.
# 11. Expansion Companions
Future major expansions are expected to add new Menagerie Companions.
Every expansion Companion should support all normal Companion systems:
Rescue encounter
Home region
Region boss relationship
Basic starting deck
80 regular Tricks
20 Common Tricks
35 Uncommon Tricks
25 Rare Tricks
5 multiplayer Tricks
8 Legacy Ranks
Cosmetic options
Dialogue
Kid interactions
Solo gameplay
Multiplayer gameplay
Expansion Companions must be treated as additional strategic archetypes, not stronger characters.
# 12. Legacy compatibility
The Legacy system must not assume there are exactly 16 Legacy tracks.
Each Companion references its own Legacy track.
Every Legacy track supports eight ranks.
Each rank can unlock:
Cosmetic option
Legacy Trick
Starting deck substitution
Passive option
Signature Keepsake
Small stat option
Other Companion specific enhancement
Legacy loadout slots remain part of the general Companion system.
Expansion Companions use the same implementation.
# 13. Cosmetic architecture
Cosmetics must be completely separated from gameplay statistics.
Create cosmetic slots or appearance categories that reference visual assets only.
Possible categories include:
Kid outfit
Companion appearance
Companion accessory
Backpack appearance
Clubhouse theme
Blueprint theme
Trick frame theme
Multiplayer expression or emote
No cosmetic object should directly modify:
Courage
Nerve
Damage
Guard
Trick rarity
Card rewards
Backpack capacity
Legacy power
Experience
Drop rates
Procedural generation
# 14. Earned versus optional cosmetics
Cosmetics need metadata describing how they are obtained.
Possible acquisition sources include:
Default
Gameplay unlock
Legacy unlock
Story unlock
Achievement unlock
Optional cosmetic package
Expansion content
Do not implement every locked cosmetic as a paid item.
Legacy cosmetics are earned through gameplay and remain separate from optional cosmetic collections.
# 15. Cosmetic package support
Optional cosmetic packages should be able to contain multiple cosmetic items.
Example structure:
cosmetic_package_id
content_package_id
included_cosmetic_ids
A themed package might contain:
Several Kid outfits
Several Companion accessories
A Backpack appearance
A Clubhouse theme
A blueprint theme
The cosmetic system should recognize ownership automatically without modifying gameplay progression.
# 16. Blueprint themes
Blueprint appearance should be skinnable independently from blueprint gameplay data.
Separate:
Map geometry
Room data
Connections
Annotations
Gameplay symbols
Visual blueprint theme
This will allow optional visual styles without affecting readability or map functionality.
Accessibility settings must be able to override cosmetic presentation if necessary.
# 17. Clubhouse themes
The persistent headquarters should also separate functionality from visual presentation.
Functional stations, menus, and interactions should remain unchanged when a different Clubhouse theme is active.
Theme data may change:
Background art
Furniture appearance
Lighting
Decorative props
Ambient effects
Music variation if appropriate
It must not alter gameplay bonuses.
# 18. No premium currency system
Do not build a premium currency.
Optional content should use platform storefront ownership directly.
There should be no systems for:
Premium gems
Premium coins
Paid Candy
Paid Lost Things
Paid rerolls
Paid unlock tokens
# 19. No loot box architecture
Do not implement randomized paid reward containers.
All purchasable cosmetic packages and expansions should have explicitly defined contents.
Normal gameplay may still contain random rewards as part of the roguelike systems.
Real money purchasing must not affect those probabilities.
# 20. No battle pass architecture
Do not implement seasonal progression tracks tied to purchases or expiration dates.
Companion Legacy progression is permanent.
All Legacy rewards remain obtainable indefinitely.
# 21. Store interface isolation
Optional content browsing should exist outside normal expedition gameplay.
Possible access locations:
Main menu
Settings or customization menus
Dedicated optional content screen
Relevant cosmetic customization screens
Do not place storefront prompts in:
Scuffles
Big Scares
Curiosities
Blanket Forts
Boss victories
Run defeat screens
Companion rescue scenes
Missing pet scenes
Heart of the House story sequences
# 22. Save data
Save files must separately track:
Content ownership references where needed
Content discovery
Companion rescue state
Legacy progression
Kid progression
Story flags
Cosmetic unlocks
Equipped cosmetics
Expansion region discovery
Expansion story progression
Do not destroy or invalidate save data when an optional content package is removed or temporarily unavailable.
If content is unavailable, preserve its progress and restore it when ownership or installation becomes available again.
# 23. Save compatibility with future expansions
Installing new content must not require starting a new save.
Existing saves should be capable of detecting newly available content packages.
The game then activates the relevant discovery conditions and story triggers.
Never serialize critical game state using assumptions such as:
Exactly 16 Companion array positions
Exactly 17 region array positions
Exactly 8 Kid array positions
Use persistent IDs rather than array position as identity.
# 24. Procedural generation compatibility
Procedural generation systems should use content eligibility filters.
A room, enemy, Curiosity, Keepsake, or region should only enter procedural selection if:
Its content package is available
Its story requirements are satisfied
Its region requirements are satisfied
Any other relevant progression conditions are satisfied
This allows expansion content to integrate naturally without contaminating saves belonging to players who do not own it.
# 25. Multiplayer ownership model
Build multiplayer content validation so different players may have different owned content.
Whenever practical, support a host ownership model for expansion regions.
If the host owns an expansion, nonowning invited players should be capable of participating in that host's expansion expedition.
However, permanent account specific access should still respect ownership.
A nonowner should not be able to independently select an expansion Companion on later runs unless they own the relevant content.
Multiplayer logic therefore needs to distinguish:
Session content access
Permanent content ownership
Character ownership
Character rescue status
Persistent progression eligibility
# 26. Multiplayer Companion validation
When joining a lobby, validate the selected Companion against that player's entitlement and rescue state.
Base Companions require only rescue state because base content is universally available to owners of the game.
Expansion Companions require both:
Relevant expansion ownership
Companion rescued
Temporary hosted access to a region should not permanently grant ownership of its Companion.
# 27. Expansion rewards for nonowners in multiplayer
Avoid save corruption or unusable permanent rewards.
If a nonowner participates in hosted expansion content, define how expansion specific permanent rewards are handled.
The architecture should support one of these outcomes per reward type:
Temporary session use
Recorded but inactive until ownership
Converted into an eligible base reward
Not awarded
This should be controlled by reward metadata rather than hardcoded case by case.
# 28. Content registry
Create a central registry for major game content.
The registry should allow systems to query content by ID and type.
Relevant categories include:
Kids
Companions
Tricks
Regions
Rooms
Bosses
Enemies
Big Scares
Curiosities
Keepsakes
Backpack items
Legacy rewards
Cosmetics
Blueprint themes
Clubhouse themes
Story events
Content packages
This architecture is important because Midnight Menagerie is intended to support substantial additional content after release.
# 29. Data driven dependencies
Content should be capable of declaring dependencies.
Example:
A Companion requires a particular content package.
A Legacy Track requires its Companion.
A region references a boss.
A boss references its region.
A rescue event references a Companion.
A cosmetic references a Companion model.
A story event requires a particular region completion flag.
Avoid tightly coupling these systems through scene specific code.
# 30. Base content tag
Tag every original piece of game content as belonging to the base game.
Example:
content_package_id = base_game
This includes all original:
Kids
Companions
Regions
Tricks
Enemies
Bosses
Curiosities
Keepsakes
Backpack equipment
Legacy tracks
Story events
Cosmetics earned through the original campaign
This makes it possible to distinguish original campaign requirements from later additions.
# 31. Expansion content tag
Every future expansion receives its own package ID.
All of its content references that package.
Example:
content_package_id = expansion_01
This allows one ownership check to control eligibility while preserving individual progression states within that package.
# 32. Free update content
The content package architecture must also support free postrelease additions.
Free additions should not require a paid entitlement.
A free update package might include:
New Curiosities
New Keepsakes
New enemies
New Backpack equipment
Additional dialogue
Additional cosmetics
Quality of life content
Treat free and paid packages similarly in the content registry, with the difference being their entitlement rule.
# 33. Do not encode power advantage into ownership
Gameplay balance code should never contain logic equivalent to:
Paid character gets bonus damage
Expansion owner gets higher rarity
Deluxe owner gains additional Courage
Cosmetic owner gains bonuses
Ownership determines content eligibility, not power.
# 34. Initial UI preparation
When designing the initial menus, leave room for:
Base Menagerie roster expansion
Additional blueprint regions
Additional Kid roster entries
Additional cosmetic categories
Additional content package discovery
Do not design grids that permanently assume:
16 maximum Companions
17 maximum regions
8 maximum Kids
The original presentation can display these numbers, but the underlying UI must support expansion.
# 35. Companion selection screen
The Companion selection screen must distinguish between states visually.
Possible states include:
Available and rescued
Available but not rescued
Unknown silhouette
Expansion content not available
Legacy progression status
Do not use the same locked state for every situation.
The player should understand the difference between:
Something they have not discovered yet
Something requiring gameplay progression
Optional content they do not own
# 36. Expansion discovery should remain narrative
Do not create implementation assumptions that purchasing content directly teleports the player into it.
Ownership only enables the relevant discovery event or availability condition.
Actual entry into expansion regions should happen through the mansion's established map and story systems.
# 37. Original design integrity rule
When implementing future monetization support, preserve this hierarchy:
Base game progression is gameplay.
Expansion ownership adds new gameplay content.
Cosmetic ownership changes appearance only.
These systems must remain separate at the code and data level.
# 38. Technical guiding principle
Build Midnight Menagerie from the beginning as a content expandable premium game, not as a live service economy.
The architecture should make it straightforward to later add:
New mansion regions
New Menagerie Companions
New Tricks
New Kids
New enemies
New bosses
New Curiosities
New Keepsakes
New Backpack items
New Legacy tracks
New storylines
New cosmetic themes
without rewriting the original campaign or progression systems.
The central implementation rule is:
New purchases add new content branches. They never bypass existing progression.
