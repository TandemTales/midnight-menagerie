# Independent architecture review — round 2, mansion/mystery/animation

Reviewed: `03-season-architecture-v2.md`, `04-character-and-comedy-bible.md`, `05-continuity-and-cutscene-ledger.md`, and relevant source locators. No other reviewers' critiques or scores were consulted. This is an independent architecture review, not audience research, measured runtime, or a screenplay verdict.

## Verdict and score

**85/100, provisional.** The second draft is materially better and its central story now works. The former reachable-but-abandoned Mooncake problem is repaired in the actual narrative. Guardian outcomes vary, almost all roster substitutions now drive appropriate physical behavior, and the brass handle is no longer a magic key. The 90-point target has not yet been demonstrated. Several small continuity repairs and a clearer final exit diagram belong in the next revision; compression and humor execution must then be tested by scene breaks and full scripts.

| Category | Awarded | Maximum | Basis |
|---|---:|---:|---|
| Characters and relationships | 13 | 15 | Amina is fallible, Priya retains planning competence, and practical disagreements differentiate the pairs. Relationship consequences remain mostly promises. |
| Comedy and comic originality | 16 | 20 | Classification into nests, overlong procession, pumpkin/gate dimensions, and bedframe braces now carry story. Some polite refusal and prop pile-up repetition remains. |
| Episode stories and pacing | 12 | 15 | Triple-region episodes have more unified goals, though three boss encounters in 22 minutes are still untested. |
| Season arc and mystery | 13 | 15 | Physical evidence, bounded inference, route continuity, and pre-conflict pet reunions are much fairer. One unsupported animal-preference deduction remains. |
| Emotional warmth and resonance | 9 | 10 | Clear reunion before the Keeper confrontation; choice and care stay active, tangible concerns. |
| Visual imagination and animation storytelling | 9 | 10 | More precise barriers, service access, spatial props and character-driven movement. Finale action still needs a simple shared ground plan. |
| Age appropriateness and tone | 5 | 5 | Memorial safeguards, no animal slicing, no pet used as a prop, and no surprise house intrusion into home are strong at architecture level. |
| Dialogue and distinct voices | 4 | 5 | Bible samples differentiate the cast. Full performable scenes are still absent, so this remains provisional. |
| Continuity, source fidelity, originality | 4 | 5 | Correct principal roster and order, with minor unrecorded source conflict and stale callback references. |

Total: 85/100. All categories meet 80% of their available points, but the overall target remains unmet. This score does not certify actual screenplays or “better than” any reference show.

## Round-1 checks: what changed

- **Roster:** repaired. The Grand Coatcheck, Epitaph Choir, Living Index, Great Orrery, Great Lantern, Eternal Dance, Boiler Bellower, Perfect Pen and Gourd Knight are authentic and have recognizable functions. Red Page is supported by `docs/design/kids/08-kid-08.md:87–90`; it is a narrative character, not a combat elite, and v2 correctly says so. My round-1 request to source-check it is resolved.
- **Mooncake:** repaired. Fixed glass is established before the pet appears; Eli attempts the release immediately, discovers the ward-side control, and carries the investigation forward. Lena keeps her button. Episode 8 now gives physical contact before the Keeper's opposition.
- **Causal travel:** mostly repaired. Library plan, observatory lantern/speaking-tube clue, service gallery, buried estate passage and Pipe Gallery now motivate actual next moves. The continuity ledger sensibly keeps episodes 6–8 in one expedition.
- **Guardian variety:** repaired substantially. Watcher and Warden remain opposed; Archivist remains wrong; Confectioner bargains; Curator supervises; Gardener composts; King gets his own desired outcome; Master keeps performing. Kindness no longer means everybody endorses the kids.
- **Exit hardware:** repaired conceptually. The handle restores one mapped spindle. Rotting exterior gate and intact inner release are explicitly different objects. Nothing about this ordinary fitting creates a route.
- **Care/agency:** improved. Animal contact precedes the final obstacle; the animals have an open internal resting place with children in sight. No pet is a prize paid out for winning combat.

## Remaining issues and directions

### R2-M01 — Medium, actual continuity repair: Mossbit/Pudding conflict is referred to but not recorded

V2 E3 and the bible say this is a “documented” implementation conflict, yet neither the source ledger nor the mansion matrix contains its actual evidence. `game/src/data/schema.js:408` assigns Pudding to `graveyard`; :411 assigns Mossbit to `kennels`. `docs/design/01-mansion-structure.md:258` places Mossbit in Graveyard and :587 places Pudding in Kennels. The matrix uses the authored pairings without flagging that implementation difference.

Direction: add the explicit evidence and working authored choice to the conflict ledger and matrix. State that the code swap is not evidence of a later explicit owner decision. Preserve the current show placement unless later authoritative direction resolves it otherwise.

### R2-M02 — Medium, mystery repair: Pixel's rejection is still asserted rather than observed

E2's tray observation is now grounded by a photo. E3 nevertheless says “Priya discovers Pixel has rejected a perfectly positioned warm platform in favor of a crooked stone.” The pet is not shown there, and the new clue ledger does not identify what physically proves the choice. A warm stone and a displaced platform could show prior use; they cannot alone prove a particular gecko's preference.

Direction: either let Priya explicitly propose this as a theory until Pixel chooses the stone in E8, or use a bounded live care-window observation already available in E3. Do not give the children inaccessible current knowledge or show Pixel within easy reach and then ignore a possible rescue. The reveal can be as small as a real-time view through fixed glass plus matching identifying features.

### R2-M03 — Medium, finale staging gate: show the route the locks control

E7 opens the outer kennel/courtyard gate. E8 repairs the inner release, but a braced test route to the exterior porch exists before Return Lock is released. This can work—the temporary brace physically resists closure—but the audience must see whether Return Lock closes a sliding barrier, prevents motion at the spindle, or controls another door. “Script staging must keep ... same visual geography” states the requirement without settling it.

Direction: add a four-node plan and one sentence of operating rules before breaking: Sanctuary Garden/ward side → inner sliding barrier controlled by release spindle → established outer gate → exterior porch. Assign each lock its effect on that one barrier or explicitly drawn connected panels. State that the brace temporarily holds the barrier against the Keeper's attempted closure; releasing Return removes that pressure and leaves a usable self-directed exit. The cat's round trip then becomes visible evidence instead of a teleport cut. All other pets and caretaking children must have established positions off the machinery's travel path.

### R2-M04 — Medium, scope honesty: normal-enemy coverage is not complete in the plan

The cutscene ledger promises selected ordinary enemies and elites “in every region.” V2 does not explicitly place an ordinary enemy in Nursery, Sleeping Quarters, Attic, Lampworks, Crypt or Hedge Maze. Those passages currently have only the principal boss, elite and Companion. This does not violate the user's request to use enemies broadly, but it does conflict with the package's own declared coverage.

Direction: either narrow the ledger's claim or give a small useful ordinary-enemy action to each affected story without adding six independent fights. Examples: Rocking Horse carries a comfort delivery, Slipper Skitter moves an abandoned slipper, Telescope Eye explains an observed sightline, Lamp Moth shades the vent, Skull Roller mis-sorts a nonliving exhibit piece, Compost Crawler returns clippings. Each must alter the scene's immediate objective; name-check cameos should not be reported as developed cutscenes.

### R2-M05 — Low, actual continuity cleanup: two legacy callback lines survived the rewrite

The E4 ending still sneezes out a “sandwich label,” although v2's classification gag now makes nests labeled MATEO and never labels a sandwich. Setup controls still refer to Scout's route marker in E3, which the episode now replaces with a live-care slate and bark/huff feed.

Direction: remove or change the sandwich label to an established MATEO label with a clear source; update Scout's setup row to the actual live window. Do not leave a ledger promising a deleted scene.

### R2-M06 — Medium, episode-break risk: triple-region compression remains unproven

E6 is now a continuous restoration pursuit, which is much stronger, but its Curator encounter has five minutes for entry, a complete comedy setup, Bones, Ribcage Knight, the plan demonstration and a negotiation. E7's five-minute Bathhouse segment must establish Matron, Drizzle, Soap Sprites, Boiler Bellower, Amina's mistake, a valve bargain and physical route repair. Tight execution is possible but cannot be assumed from the allocation.

Direction: in the break, give these segments a small visible beginning–reversal–payoff rather than five explanatory exchanges. Reuse the same shot geography and prop across the mini-story. Preserve the actual guardian choice. If the timed beats overflow, propose extension or redistribution instead of shaving the emotional turn and claiming the encounter has full weight.

### R2-M07 — Medium, continuity/animation check: Companion constraint removal needs a per-resident state

The ledger now seeds a voluntary communication network. However, phrases such as Wisp “elects to accompany” or Crumbula walks through an ordinary unlocked exit make their constraints feel very easy to abandon after the story has described captive residents. A thematic invitation is not always a physical prison; that distinction should be explicit for each.

Direction: at episode breaks identify whether the local constraint is an actual enclosure, obligation, misleading rule, fear, inaccessible route or another established condition. Show the child/Companion action that removes it. Record each resident's location after helping. Do not silently move an imprisoned character into the finale network merely because the region has been visited. The current ledger instructs this distinction; the scenes must execute it.

## Tone and readability regression check

No new major fear or agency violation found. The source's overprotective House is preserved. The Conservatory remains an enclosing room rather than a copied monster biography. Maya's routes are acknowledged materially; the new service lifts are correctly labeled adaptation staging. Keep those lifts visually legible and character-driven rather than pausing every episode to explain access engineering.

The episode 8 bed/pillow sequence is a better comedy payoff than a climax made entirely of thematic dialogue. Keep two or three foreground action teams and short distributed Companion cutaways. Thirty-two named children/pets/Companions should never all compete for the same action frame or line.

## Forward gate

Make the concrete ledger, clue and exit-geometry repairs in the next architecture version, then re-check regressions. Full scene breaks should be the next evidence for pace and guardian weight; finished scripts are required to judge comedy rhythm, dialogue and total runtime. Do not report architecture approval as a completed season or as a 90-point screenplay result.
