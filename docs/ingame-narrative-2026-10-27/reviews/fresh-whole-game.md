# Fresh whole-game manuscript review

Status: final revised manuscript assessment, 27 October 2026, after reading the exact sanctuary scripts, chronology wrapper and unconditional Heart continuity recap. This is an AI editorial and source audit, not a human review or child playtest. **Final score: 88/100. Every category reaches 80%; the requested 90 target is not met.** No remaining high-severity manuscript branch defect was found in the reviewed snapshot. This is not an implementation or release gate pass.

I read CONTRACTS.md and all of deliverables 01–08, including seventeen regional packages, the complete tutorial, all eight E/R/F/H pet packages, all sixteen A/B/C Companion packages, pair scenes and endings. I did not read earlier reviews, writer defenses or prior scores. I checked relevant actual source for routes, rescue dispatch, party identities, clue counters, keyboard input, intent focus and boss-log delivery. I edited no game file.

The baseline manuscript is approximately **84/100**. Its most successful material is specific animal behavior, physical comic business, gentle reunion staging and the distinction between helpful care and compulsory residence. Its recurring weakness is explaining the same moral conclusion immediately after showing it. This reduces mystery, differentiates the children less than the bible promises, and makes a complete reading more repetitive than the strongest individual scenes suggest. This baseline does not meet the requested 90 target.

## Baseline findings submitted during the read

These record what I independently found during the baseline read. Their final dispositions appear below; quoted superseded copy is evidence of the original finding, not a claim that it remains in the manuscript.

1. **High — END-10 does not supply a complete sanctuary variant.** Its generic instruction to replace blocked-exit statements in R leaves F untouched. PET-MATEO-F still says they need an open route out; PET-ELI-F names the remaining obstacle as the way out; PET-MAYA-F is still working on that door; PET-PRIYA-F still needs a new door plan. PET-SAMIR-R's optional greeting asks for the door to be opened. A player who opened the sanctuary can immediately be told it is closed. Supply exact eight present-day R/F variants, including optional lines, rather than requiring the implementer to invent replacements.
2. **High — L03 repeat contradicts the local promise.** L03-P says “They may hide. They may come out”; its repeat B says “Nobody here. And nobody leaving.” Calling the latter state-neutral does not make it so. The player sees the very promise they earned revoked. Repeat encounters must leave the restored inside curtain control intact and identify some other bounded source of the challenge. Check the Conservatory's renewed closure for the same problem.
3. **Medium — player-facing recap contains internal editorial language.** MM15-P says “This is not a persistent missing-pet reunion.” The initial MM17-P recap says “The next scene must show an animal's actual choice.” These are instructions to an implementer in a child's story. Move the technical conditions out of quotation marks; retain only the concrete observation in visible copy.
4. **High — END-02 overstates mixed-party presence.** It runs with at least one newly home pet, yet says “The pet beside each child is the one they came to find.” A second active child's already-home pet is absent. Scope the caption to the animals actually leaving, and use singular or neutral Ward prose in solo play.
5. **Medium — initial Heart chain repeats the same introduction and resolution.** Initial MM17-F, HEART-EVIDENCE and MM17-B0 all establish care/refusal; initial MM17-P, MM17-T and END-01 all explain the opened door. Playing every individually essential unit produces a much slower climax than any one duration suggests. The revised shorter MM17-F/B0/P/T seen during this review substantially improves this; the final manifest must name one authoritative evidence carrier and one exit outcome.
6. **Medium — optional clues often solve their own inference twice.** L03-C1's comfortable blocked passage is followed by “A good hiding place. A bad way to be kept”; L03-C3 supplies “Privacy means you get to open it, too”; L04-P explains dinner versus deciding someone's life; MM14-C2 tells the player to keep both dry spot and way out. Across seventeen wings, this becomes a lecture rhythm. Preserve concrete props, let selected conclusions remain unstated until a distinct later payoff, and give some children a plausible interpretation to revise. Do not fix this by inventing a founder or false pet death.
7. **Medium — mixed sanctuary chronology needs its own policy.** N.sanctuary is per profile. A party can contain both completed and uncompleted sanctuary profiles, independently of their pet states. The manuscript must explicitly choose a shared mode or scope sanctuary to local-profile play until the policy exists. Pet status filtering alone does not reconcile mutually different present-day Houses.
8. **Low — source table names the wrong participant API.** Section 08 initially calls run.players an existing field. Run uses run.kids, run.local and kidAt(seat); engine.players belongs to combat actors. A writing integration map should not direct dispatch to a nonexistent participant collection.
9. **Medium — optional Companion callback setup is not guaranteed.** C is gated by freedom and sanctuary, not B. Crinkle's “rejected filing notice,” Wisp's lamp and the other B-prop returns therefore need exact standalone variants if B was skipped. A general request for a stateless alternative is not the alternative's finished text.

## Verified source boundary

- game/src/state/run.js:187 sets the default expedition to six wings. wingOffer at line 346 offers every unvisited non-Heart region until the final crossing forces Heart. Region catalogue order therefore cannot be a story prerequisite.
- canChooseEntry at run.js:259 uses actual persistent Foyer clear. Surveying alone is insufficient.
- _heldTarget and rescueCompanion at run.js:2910–2929 select the actual held/substituted Companion and separate party availability from this profile's newly recorded rescue. A room rescue followed by boss victory must not narrate a second captive.
- addClues at run.js:1230 updates totals, not identity-bearing narrative evidence.
- engine.js:486 emits EV.LOG from say. The inspected combat scene has no visible EV.LOG/case-log consumer. The manuscript correctly labels D-BARK as work to build, so its optional barks are authored text rather than verified player-visible content.
- gameover.js:273 contains the victory chance fallback for pet-home. It cannot substantiate a persistent reunion.
- intent.js has focusable intent elements; hand.js:2489–2490 supports Up confirmation and Down cancellation. The proposed lesson resolver and actual large-text/input behavior remain unverified.

## Editorial differences that should survive revision

The mystery perspective wants less immediate interpretation; the family-readability perspective reasonably wants a clear essential recap. Those goals can coexist by withholding some explanations in optional full scenes while keeping the short essential route explicit. Removing every clarification would make the youngest reader's experience worse.

The narrative perspective wants the sanctuary to change the world; the replay perspective needs the deckbuilding game to remain available. An explicit remembered expedition plus a peaceful present-day search is a credible proposed solution. It becomes a complete solution only with exact variants and a multiplayer chronology policy. Merely renaming a hostile run does not establish those facts.

The comedy perspective favors the interrupted paw, the lamps chasing one another's shadows, the frog ignoring promotion and Mopsy turning the cushion sideways. The mystery perspective is less well served by another label that openly announces its own contradiction. Retain the former physical variety while reducing the latter repetition.

## Final weighted score

| Category | Awarded / weight | Category percentage | Reason |
|---|---:|---:|---|
| Character and relationships | 13 / 15 | 86.7% | All eight reunions have recognizable habits, room for the animal, and a quiet beat. Pair scenes differentiate the children better than the many shared thematic verdicts do. |
| Humor | 17.5 / 20 | 87.5% | Several memorable physical bits and affectionate animal jokes; a long read still relies heavily on labels, lists and bureaucratic contradictions. |
| Tutorial clarity | 13.5 / 15 | 90% | Useful action sequence, legal-action freedom, honest acknowledgement language, retry and early-victory paths, and specific keyboard copy. Real input and display verification remains pending. |
| Mystery and discovery | 12.5 / 15 | 83.3% | Fair evidence, excellent claim-versus-fact discipline, no route lock or invented historical answer. Many clues confirm an already clear explanation rather than revise the player's model. |
| Agency and emotional payoff | 13.5 / 15 | 90% | No forced forgiveness, no moral score, distinct found/home outcomes, exact sanctuary visits and genuine leave/return demonstration. Most personal scenes still offer presentation choices rather than different authored actions. |
| Pacing | 8.5 / 10 | 85% | Heart deduplication and optional scene limits substantially help. Region after region still uses a similar belief/challenge/concession rhythm. |
| Canon and continuity | 4.75 / 5 | 95% | Careful source distinctions and repaired state seams; new campaign decisions are explicitly provisional. Some dependency cross-references can still be cleaned up. |
| Age and family appropriateness | 4.75 / 5 | 95% | Reassuring without erasing fear; disability and pet identity respected; no death fakeout or punitive transformation clock. Some abstract recap language will work better with adult co-reading. |
| **Total** | **88 / 100** | | **Below 90; all category floors met.** |

These are editorial judgments about the actual manuscript, not measured audience scores or evidence of observed child comprehension. The score rose from approximately 84 because the repair changed actual scenes and routing, not because the acceptance target changed.

## Final disposition of baseline findings

| Finding | Final status | Text checked |
|---|---|---|
| 1: sanctuary R/F reuse | Closed | All eight PET-kid-S full, return and recap variants are printed. END-10 calls these rather than string-editing R/F. END-10A now names PET-S. No locked-door objection survives in those variants. |
| 2: local promise reversal | Closed | L03 repeat preserves the inside cord; L05 repeat preserves the canopy opening. The regional contract suppresses contradictory historical props after resolution. |
| 3: internal QA in runtime recap | Closed for cited defects | MM15-P now describes the animal leaving and bed ready; its persistence warning is outside runtime quotation. MM17-P is a short physical handoff. |
| 4: mixed-party pet presence | Closed | END-02 says “The newly reunited pets walk beside their children.” PET-WARD-REST has solo copy and an all-home suppression guard. |
| 5: duplicate Heart exposition/outcome | Closed | MM17-F is optional atmosphere, B0 is a brief status-sensitive challenge, P is a single beat, T has no page; HEART-EVIDENCE and END-01 own the substantive facts. |
| 6: overexplained optional inference | Improved; editorial issue remains | The named-child lines in L03-C1/C3, L07-C1, L08-C1 and MM14-C2 now observe or ask. Many absent-child fallback lines and other region recaps still immediately explain the same inference. |
| 7: incompatible sanctuary chronology | Closed as an explicitly limited proposal | PARTY-CHRONOLOGY offers shared memory or separate present searches. Its exact neutral memory result overrides END-08 for incompatible profiles. Shared present-day campaign progression across those profiles is honestly deferred. |
| 8: wrong participant API | Closed | Section 08 now names run.kids / run.local / kidAt(seat) and distinguishes engine.players. |
| 9: unseen Companion B callback | Closed | C now requires delivered B, or offers voluntary B first. The section 08 callback guard matches. Starter availability also permits Marmalade's C. |

Two further defects found while rechecking were also repaired in the text: a solo Jordan who skipped optional clues and reunion prose could miss transformation continuity entirely; HEART-EVIDENCE now always supplies the short paired-picture card and its factual skip recap. A pre-sanctuary guest in a shared memory could receive END-08's false present-day open-gate result; PARTY-CHRONOLOGY now supplies a neutral result that does not claim that guest reached an ending.

## Remaining actionable editorial findings

**Medium — deduction still often arrives as an explanation rather than a discovery.** The revised L03-C3 child observes the cut cord, but the absent-child version still says “Someone outside controls both hiding and being seen.” MM14-C2's absent narrator says “A useful shelter does not need to close around its guest,” then its recap explains the same conclusion again. A solo child other than the named speaker therefore receives the more didactic version. Make the fallback just as observational as the revised spoken line; keep the explicit explanation in the essential recap or later changed action. This is the largest remaining obstacle to a 90-level mystery score.

**Medium — child voices converge during thematic confrontations.** L04-P's Samir says “You can give someone dinner without deciding the rest of their life”; L07-P's Priya says “Make one that fits the facts”; MM17-B0's Priya says “Your rule needs to change.” These are clear, but the repeated role is a child supplying the correct adult-sized diagnosis. Preserve the strong pet-specific tenderness and the pair-scene comic habits. In several middle-wing confrontations, let the child test, misunderstand, improvise or notice something personal before arriving at the answer. This is a writing-quality recommendation, not a request for a morality mechanic.

**Medium — too many different rooms resolve through the same kind of written prop.** L01-C1's form, L04-C1's feeding note, L07-C1's catalogue, MM10-C1's coat ticket and MM15-C1's intake card are individually clear. Together they repeatedly spell out the same unjust inference. The physical spoon, shadow-chasing lamps, frog's ignored crown and sideways cushion are stronger sources of variety. Replace selected explanatory label beats with observed behavior or a practical failed attempt; do not remove all records, since some are excellent fair evidence.

**Low — final metadata still needs one consistency sweep.** MM17-C3's fallback still refers to the Heart continuity card only “when no personal R/F supplies it,” while the final HEART-EVIDENCE card is unconditional. The major revelation map still lists MM17-F as a Keeper-identity carrier although F is now atmosphere only. These do not break the authoritative final chain, but the implementation handoff should point to the actual carrier rather than a superseded one.

## Adversarial manuscript path audit

| Path | Result of text inspection |
|---|---|
| First six-wing expedition, skip every optional clue | Core purpose and Heart care/refusal/identity/continuity, personal recognition and exit outcome have explicit carriers independent of intermediate wings. This requires the proposed scheduler. |
| Arbitrary legal unlocked entry and chosen middle wings | No mandatory region-number chronology found. Tested mentally against Foyer → Crypt → Bathhouse → Pumpkin Grounds → Graveyard → Heart, and an unlocked Kennels → Greenhouse → Study → Ballroom → Lampworks → Heart path; code allows the required unvisited-wing choices. |
| Any Kid with any available Companion | Personal pet recognition has no Companion, collectible or Backpack gate. Presence-filtered regional speech has narrator fallback; Eli's optional tool line has a non-tool version. |
| Every first reunion shortened to recap | The owning seat receives explicit recognition before found; the unconditional Heart continuity recap closes the former transformation hole. |
| Prior found pet, failed expedition, next search | F replaces R; found is not undone; Ward rest keeps pets outside combat; no new disappearance is narrated. Actual durability is proposed, not tested. |
| Prior home pet, including mixed home/found/unknown party | R is suppressed for home, eligible first scenes queue by profile, already-home animals are not placed beside every child in END-02. Unknown and unavailable data are not treated as home. |
| Rescue room plus same wing boss; substituted captive; full roster | Actual held/rescue result drives Companion A. No nominal regional Companion or second captive is announced. |
| Sanctuary after one pet, seven still unknown | END-10 provides all eight exact S routes and END-10A home outcomes; no hostile present-day run or all-pets prerequisite gates them. |
| Unavailable Companions after sanctuary | END-10B proposes a distinct joining event; availability is separate from historical rescue counts. This is a required integration hook, not currently working progression. |
| Mixed pre/post-sanctuary profiles | Exact choice and neutral memory wrappers are present. Shared present-day campaign progression is expressly unsupported pending design/engineering; this limitation must remain visible. |
| Skipped Companion B then sanctuary C | Voluntary B-before-C guard supplies the setup; no callback is forced as already experienced. |
| Save failure or disconnected profile | Pending result and honest UI are specified. No durable completion is claimed without commit. Reconciliation and navigation policy still require engineering validation. |
| Boss barks | Correctly classified as unrendered until D-BARK. No exclusive essential fact depends on hearing them. |

The manuscript is substantially more coherent after repair and is suitable for a concrete implementation discussion. It does not earn a 90 score merely through exhaustive coverage. The remaining improvement is chiefly literary: a less explained mystery, more variation in the children's responses, and fewer repetitions of the same comic device. None of the source inspections or mental path traces above constitutes an in-game test of the proposed narrative systems.
