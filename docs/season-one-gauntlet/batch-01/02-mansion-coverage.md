# Mansion coverage and progression audit

Audit date: 2026-10-27. This is a read-only audit of source material, saved as a new adaptation document. It does not change game canon or implementation.

## What “in game order” means

The stable authored sequence is the 17-region order below, confirmed by `game/src/data/schema.js:176` and `game/src/state/run.js:108`. It is an appropriate spine for the requested television journey toward the Heart.

**It is not a compulsory 17-wing campaign run.** Current play uses six wings per expedition (`run.js:187`). At a fork, every unvisited non-Heart wing can be offered; the Heart is forced as the final wing (`run.js:346–399`). The first expedition begins at the Foyer; clearing it once unlocks later entry selection (`run.js:247–261`). Thus following all 17 authored regions in order across the television season is an adaptation decision responding to the user's request, not a claim that the game enforces this route.

Architecture matters even when connections are supernatural. The mansion has 340 permanent named rooms, 20 per region. Ordinary circulation, current house state, and manifested connections are different layers (`docs/design/01-mansion-structure.md:6–50`). The Heart occupies impossible space inside and beneath the estate (:68). Exterior regions are part of the estate journey; their later position does not mean they are literally closer to the center on a normal floor plan.

## Complete principal-boss matrix

The enemy examples are registered ordinary enemies, not invented television characters. The Big Scare column lists the actual encounter titles returned by `encountersFor(region, 'elite')`; paired creatures and component objects count as one encounter. The boss column lists all **17 principal bosses**. Additional boss-tier parts are inventoried below.

| Order | Region / home Companion | Principal boss | Ordinary enemy examples | Big Scare encounters | Useful named rooms, in approach-to-boss order |
|---|---|---|---|---|---|
| 1 | The Forgotten Foyer / Marmalade, Ghost Cat | The Butler | Dust Bunny; Coatrack Crawler; Calling Bell; Lost Luggage | The Grand Coatcheck; The Unwelcome Guest; The House Bell | Front Vestibule; Portrait Hall; House Register Alcove; Bell Pull Gallery; Receiving Chamber |
| 2 | The Forgotten Nursery / Mopsy, Rag Doll Bunny | The Governess | Button Baby; Jack in the Box; Patchwork Soldier; Rocking Horse | The Toy Chest; The Patchwork Giant; The Porcelain Twins | Playroom; Dollhouse Room; Story Nook; Mending Closet; Bedtime Hall |
| 3 | The Sleeping Quarters / Boggle, Monster Under the Bed | The Bedframe Beast | Pillow Puff; Slipper Skitter; Wardrobe Guest; Nightlight Snuffer | The Night Terror; The Blanket Hydra; The Wardrobe | Guest Hall; Wardrobe Corridor; Underbed Hollow; Moon Window Room; Bedframe Court |
| 4 | The Kitchens and Cellars / Taffy, Candy Slime | The Confectioner | Dough Blob; Jam Jar; Kitchen Imp; Pantry Mimic | The Oven Maw; The Sugar Golem; The Pantry Poltergeist | Main Kitchen; Candy Cupboard; Cold Larder; Root Cellar; Dumbwaiter Hall; Confectioner's Kitchen |
| 5 | The Impossible Greenhouse / Brambleboo, Haunted Houseplant | The Carnivorous Conservatory | Potling; Snapping Blossom; Creeping Ivy; Spore Puff | The Compost Colossus; The Head Gardener; The Ancient Topiary | Glass Hall; Ivy Bridge; Root Nursery; Herbarium; The Great Conservatory |
| 6 | The Mansion Graveyard / Mossbit, Tombstone Turtle | The Groundskeeper of Names | Grave Moth; Headstone Hopper; Name Gnawer; Epitaph Spirit | The Mourning Angel; The Epitaph Choir; The Mausoleum Mouth | Front Cemetery Gate; Pet Memorial Row; Name Wall; Great Mausoleum |
| 7 | The Grand Study and Library / Crinkle, Paper Crow | The Archivist | Book Bat; Inkblot; Quill Clerk; Index Beast | The Bookwyrm; The Living Index; The Inkblot Oracle | Main Library; Map Room; Newspaper Archive; Restricted Stacks; Archivist's Office; Grand Study |
| 8 | The Moonlit Attic and Observatory / Wink, Eyeball Spider | The Watcher in the Rafters | Rafter Peeker; Star Chart; Telescope Eye; Orrery Imp | The Great Orrery; The Rafter Seer; The Moon Lens | Lower Attic; Rafter Walk; Astronomy Library; Moon Dome; Watcher's Nook; Grand Observatory |
| 9 | The Lampworks / Wisp, Baby Will o' Wisp | The Lamplighter | Waxling; Lamp Moth; Spark Sprite; Blackout Blob | The Chandelier; The Blackout Beast; The Great Lantern | Lampkeeper Stair; Lantern Gallery; Reflector Gallery; Glow Chamber; Great Lantern Room |
| 10 | The Ballroom and Velvet Suites / Count Crumbula, Vampire Chinchilla | The Master of Revels | Dancing Shoe; Masquerade Mask; Goblet Geist; Waltzing Armor | The Grand Masque; The Eternal Dance; The Velvet Host | Ballroom Foyer; Dance Card Room; Grand Ballroom; Velvet Lounge; Mirror Ballroom; Master of Revels' Hall |
| 11 | The Crypt and Ossuary / Bones, Skeleton Puppy | The Bone Curator | Loose Tibia; Skull Roller; Urn Spirit; Crypt Fetcher | The Ribcage Knight; The Walking Ossuary; The Coffin Collector | Crypt Vestibule; Pet Crypt; Name Vault; Memorial Chamber; Great Ossuary |
| 12 | The Withered Hedge Maze / Truffle, Zombie Hedgehog | The Gardener of Rot | Mildew Puff; Rotcap; Compost Crawler; Thorn Topiary | The Mold Minotaur; The Briar Idol; The Carrion Hedge | Hedge Gate; Briar Tunnel; Compost Court; Burrow Row; Rotunda of Rot |
| 13 | The Secret Passages / Hush, Shadow Ferret | The Whisper Warden | Peephole; Wall Whisper; False Door; Key Snatcher | The Moving Wall; The Whisper Choir; The Door That Wasn't There | Narrow Service Hall; Behind the Library; Speaking Tube Junction; Shadow Junction; Whisper Room |
| 14 | The Bathhouse and Rain Wing / Drizzle, Raincloud Ghost | The Drowned Matron | Soap Sprite; Puddle Spirit; Pipe Knocker; Umbrella Imp | The Boiler Bellower; The Flooded Reflection; The Storm Bath | Towel Hall; Rain Gallery; Drain Hall; Pipe Gallery; Storm Balcony; Drowned Rotunda |
| 15 | The Kennels and Animal Ward / Pudding, Graveyard Pug | The Kennelmaster | Walking Cage; Collar Keeper; Feeding Cart; Comfort Blanket | The Collar Collector; The Rolling Ward; The Perfect Pen | Animal Intake Room; Collar Room; Exercise Yard; Night Kennels; Kennelmaster's Court |
| 16 | The Moon Courtyard and Pumpkin Grounds / Pipkin, Pumpkin Frog | The Harvest King | Pumpkin Pip; Moonseed; Gourd Guard; Harvest Hopper | The Moon Scarecrow; The Gourd Knight; The Great Root | Moon Gate; Pumpkin Patch; Frog Pool; Moon Dial Garden; Harvest Pavilion; Harvest King's Court |
| 17 | The Heart of the House / no home Companion | The Keeper | Housekeeper; Memory Animal; Sanctuary Warden; Namekeeper; Quiet Room; House Pulse | The Hall of Names; House Remembers; Perfect Sanctuary; The Door That Says Stay | Menagerie Hall; Hall of Collars; Hall of Names; New Arrival Ward; Pet Holding Ward; Voice Chamber; Inner Sanctuary; Heart Chamber |

The room lists select useful actual places; they are **not** claimed as fixed in-game room routes. Assigning an elite to a particular room in a screenplay remains a staging proposal unless an encounter source explicitly requires it. Cover all regions meaningfully; “most areas” should not be reported as “most of the 340 rooms.”

## Source locators

Room and Companion coverage comes from `docs/design/01-mansion-structure.md`, with section starts at: Foyer 70; Nursery 109; Sleeping Quarters 147; Kitchens 183; Greenhouse 220; Graveyard 257; Library 293; Attic 330; Lampworks 366; Ballroom 402; Crypt 439; Hedge Maze 475; Passages 511; Bathhouse 547; Kennels 586; Pumpkin Grounds 624; Heart 661. Its architectural adjacency starts at 698. The detailed region documents at `docs/design/regions/01-foyer.md` through `17-heart.md` supply motives and encounter behavior.

Actual registered ordinary enemies and their lore are in `game/src/data/enemies/<region>.js`, plus the relevant `*-scares.js` files. `game/src/data/enemies/index.js:98–151` assembles the registry. Actual encounter grouping is in `game/src/data/encounters.js`: this distinction matters for the Porcelain Twins, Epitaph Choir, Eternal Dance, Whisper Choir, and Hall of Names. Examples: Epitaph Choir :675; Whisper Choir :829; Eternal Dance :1217; the four Heart elite encounters :1566–1584.

Principal boss definitions and exact name lines:

| Boss | Source |
|---|---|
| Butler | `game/src/data/bosses/butler.js:309` |
| Governess | `game/src/data/bosses/governess.js:155` |
| Bedframe Beast | `game/src/data/bosses/bedframe-beast.js:40` |
| Confectioner | `game/src/data/bosses/confectioner.js:272` |
| Carnivorous Conservatory | `game/src/data/bosses/carnivorous-conservatory.js:101` |
| Groundskeeper of Names | `game/src/data/bosses/groundskeeper.js:293` |
| Archivist | `game/src/data/bosses/archivist.js:161` |
| Watcher in the Rafters | `game/src/data/bosses/watcher.js:135` |
| Lamplighter | `game/src/data/bosses/lamplighter.js:115` |
| Master of Revels | `game/src/data/bosses/master-of-revels.js:122` |
| Bone Curator | `game/src/data/bosses/bone-curator.js:140` |
| Gardener of Rot | `game/src/data/bosses/gardener-of-rot.js:105` |
| Whisper Warden | `game/src/data/bosses/whisper-warden.js:162` |
| Drowned Matron | `game/src/data/bosses/drowned-matron.js:109` |
| Kennelmaster | `game/src/data/bosses/kennelmaster.js:123` |
| Harvest King | `game/src/data/bosses/harvest-king.js:84` |
| Keeper | `game/src/data/bosses/keeper.js:325` |

## Boss parts and supporting actors: do not inflate the boss count

The registry marks these additional objects with `tier: 'boss'` because they participate in principal boss encounters. They are not additional regional villains:

- Governess: Favorite Doll.
- Carnivorous Conservatory: Growth Patch.
- Groundskeeper: Player Stone, Companion Stone, Unknown Stone.
- Lamplighter: Lamp.
- Master of Revels: The Admirer, The Chaperone.
- Bone Curator: Bone Piece.
- Gardener of Rot: The Bramble, The Fungus, The Husk.
- Whisper Warden: Wall Passage Latch, Floor Hatch Latch, Ceiling Shaft Latch, Mirror Passage Latch, Dumbwaiter Shaft Latch.
- Drowned Matron: The Drain, Drain Valve, Intake Valve.
- Kennelmaster: Gate, Collar Dock, Lead Post.
- Keeper: Shelter Lock, Routine Lock, Observation Lock, Return Lock.

The other five principal-boss definitions have no additional boss-tier registry objects. Summons can also use ordinary or elite registry entries. A television adaptation should preserve each principal guardian's distinct dramatic behavior; it need not give every component an independent character arc.

## Conflicts and implementation distinctions

1. **Greenhouse swap — resolved.** `docs/design/regions/05-greenhouse.md:27` explicitly records Josh's 2026-09-12 swap: the Carnivorous Conservatory became the boss, the Head Gardener became a Big Scare. The revised source heading at :463 and actual `enemies/greenhouse-gardener.js:2–13` agree. Older paragraphs still talk about approaching the Head Gardener and freeing Brambleboo from its Garden Bed (:664–668, :884–905). Treat those as legacy staging, not evidence to undo the swap. The Head Gardener should still appear as an elite; it can establish the imposed-shape conflict before the Conservatory encounter.
2. **Final boss placeholder — resolved.** Mansion structure :663 says “Final Boss: Unlocked later.” The complete Keeper implementation at `bosses/keeper.js:323` resolves the identity. Its lore at :334 gives a great animal shape made of wooden doors, blankets, brass keys, and window glass, with small doors opening into previously visited rooms. Do not replace it with an unrelated hidden human villain.
3. **Linear route versus player choice — distinguished.** The numbered design sequence is stable; the older design's route-gating language is explicitly superseded in `run.js:360–382` by the 2026-09-06 owner decision to offer every unvisited wing. Use the sequence as the show's ordered tour, not as a claim about mandatory unlocks.
4. **Home Companion versus rescue target — distinguished.** `run.js:2833–2880` prefers the authored Companion if still missing but substitutes another available rescue when needed. **Marmalade is the sole current starter**, confirmed by executable `STARTER_SLUGS` at `run.js:439` and its explanatory comment at :426. The older comment at :2837 still describes four starters (Marmalade, Bones, Taffy, Pipkin); that comment is stale and must not override the current set. The Foyer need not actually rescue Marmalade in current game play. Television placement and initial freedom/captivity must be recorded as adaptation proposals. The Heart has no held Companion in this system. Audit correction: the first matrix draft repeated the stale four-starter comment; independent canon review caught it and this entry now records the corrected evidence.
5. **Encounter names versus components — distinguished.** The Porcelain Twins are Prim and Proper; Eternal Dance uses The Lead and The Follow; Whisper Choir comprises four whispers. The Epitaph Choir's stones and Hall of Names' stones are ensemble components, not extra regional elite story arcs. Heart currently has four elite encounters, exceeding the older “three per region” target.
6. **Care does not erase individual threats.** The Conservatory's actual lore calls it a predatory greenhouse room with sealed exits (`carnivorous-conservatory.js:110`). Keep this local danger visually readable and non-graphic; do not infer that the whole House eats children. The Matron's name and drifting underwater appearance are established; an actual drowned person's biography is not established by that name (`drowned-matron.js:122`).

## Adaptation handoff requirements

**Additional home-region conflict:** authored structure at lines 258 and 587 places Mossbit in Graveyard and Pudding in Kennels, but `game/src/data/schema.js:408` assigns Pudding to Graveyard and `:411` assigns Mossbit to Kennels. The matrix intentionally follows authored narrative homes as the show's working proposal. This is not a resolved designer decision or evidence that current implementation matches the matrix.

- In the episode guide, give every principal boss a consequential scene, not a list mention or end-credit cameo.
- Track at least one recognizable ordinary enemy and a meaningful elite encounter per regional story block; the matrix preserves options for later cutscene/dialogue work.
- Use the estate's real named rooms as scene headings. Label invented bridges or altered adjacency as manifested connections.
- Preserve region order in first substantial visits, with earlier glimpses through telescopes, maps, mirrors, or service shafts clearly signposted as clues rather than out-of-order resolutions.
- Keep the Graveyard and Crypt clearly distinct: memory/name landscape above; collection/preservation system below.
- Keep the Head Gardener and Gardener of Rot distinct: imposed arrangement versus breakdown/reuse. Neither is the Groundskeeper of Names.
- Treat all 17 principal bosses as covered only after their actual screenplay scenes exist and have been reviewed. An architecture assignment is planned coverage.
