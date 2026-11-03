# Midnight Menagerie narrative and character bible

## The playable story

A child enters to find one particular animal. The House seems empty, then much too attentive. A fresh bowl and a barred little door create the first question: if this place cares for animals, why is leaving so difficult? Each expedition can add a piece of an answer. At the Heart, an unknown pet receives a first recognition scene, a found pet remembers the earlier reunion, and an already-home pet stays home. In that last branch the child helps other residents instead. Victory opens the way out for the present search. A later sanctuary can keep its kindness while giving up its claim on everyone inside.

The player's authorship is where to search, what to inspect, whether to take an offered quiet moment and how to build a deck. Authored character questions are not claimed as player-selected questions. Animal agency is shown through approach, retreat, preference and an available exit. Neither is replaced by a hidden morality score. No correct emotional answer earns a pet; no joke requires a failed action.

## Order independent revelation spine

| Beat | Possible player question, never assigned belief | Play and evidence | Available conclusion | Reliable carrier |
|---|---|---|---|---|
| A Search | Is my pet here? | Selected child's identifying trace; Marmalade chooses to approach | The building holds living residents | Opening recap plus first wing entry |
| B Care | Are the animals being cared for? | Fresh species-appropriate food, mended bedding, recovery record | Its care is real | Any wing's local clue; mandatory Heart evidence if missed |
| C Refusal | Can an animal leave? | Departure hatch shuts; known-home label retained; a request is reclassified | The House can know an animal has a home and still keep it | Local boss scene; Heart fallback |
| D Identity | How will I recognize my pet? | Familiar signal survives a harmless new ability | Change and belonging can coexist | Personal evidence and reunion |
| E Choice | Does every resident want the same home? | Some residents approach the exit, another settles inside beside an open door | Different animals can choose different homes | Keeper aftermath and ending |
| F Return | Can a departing resident visit again? | A departing animal is welcomed back without a new lock | Sanctuary is a place to return to freely | Final wordless return demonstration |

No wing says “now we finally know” unless the actual evidence state supports it. A late-designed region visited first can deliver B or C directly; it need not pretend to be early in its own history. The Heart repeats the facts using present evidence, never “as you remember” when the player skipped the source.

Essential: search purpose, real care, blocked departure, recognizable pet, Keeper's identity, valid exit, persistence promise only after support exists. Optional: guardian objections, child tensions, Companion preferences. Completionist: paired old/new records, callback endings, residents revising their habits. No historical founder answer is hidden behind completion.

## Scene and implementation contract

All exact new dialogue, captions, scene arrangements and new evidence IDs are **proposed writing**, grounded in the canon ledger. Directions are staging requests, not created assets. Runtime paragraphs and dialogue are exact text; prose outside quotation marks is implementation/staging instruction. Braced runtime variables, where explicitly defined, mean a verified display name, never unfinished dialogue. Personal scripts use names directly to avoid ambiguous substitution.

Every unit inherits this record unless its local metadata overrides it:

| Field | Default |
|---|---|
| Canon | New proposal based on established/developed source; not implemented |
| Location and trigger | The unit's named room/event; optional unless labeled essential |
| Prerequisites | Active expedition and relevant current region; speaker present; any additional condition stated locally |
| Speakers | Named child only if selected/present; narrator captions otherwise. Companions communicate by described behavior, not assumed human speech |
| Visual direction | Existing room backdrop/portrait plus text. All gestures can be presented as captions; no new animation needed to understand the scene |
| Choices | Continue, optional inspect, or explicitly printed options. Advance/skip controls are interface actions, not invented in-world decisions |
| Consequence | Narrative only unless an existing gameplay effect is explicitly identified; no new rewards, healing, damage or gates |
| State | Reads current party/region and proposed N fields. Seen records the full scene or its delivered core recap. Clues record only evidence explicitly displayed by that version. Skip never bulk-awards unseen optional clues. No combat-model changes |
| First/repeat | First eligible unseen scene; repeat uses its printed short line or suppresses optional dialogue. No repeat exposition by default |
| Skip/recap | Skip reaches the printed essential recap. A recap delivers a fact only if it actually states or depicts that fact. Optional skipped evidence remains unseen |
| Dependency | New content registration for existing prose screens; N persistence, narrative scheduler and mandatory recaps require engineering |
| Fallback | Narrator/printed evidence when speaker absent; current prose screen can carry captioned action. Without N persistence use stateless text, not claims about previous visits |
| Timing/access | Approximate silent reading at 100–120 words/minute; not an enforced timer. User advances every page. Aim 8–22 words per speech, 45 words per card. Larger scenes paginate at paragraph boundaries |

Section 03 has a more specific tutorial contract; region packages state local defaults. Metadata is inherited deliberately so each line does not repeat a page of boilerplate. Scene text is not considered delivered merely because the player saw its title.

**Proposed state namespace:** N.seen[unitID], N.clues[evidenceID], N.bossMet[region], N.bossResolved[region], N.pet[kid] (unknown/found/home), N.sanctuary. Persistent per local profile; multiplayer ownership unresolved until integration. N.runPlayed[unitID] is run-local. These are not aliases for existing generic clue counters. Use existing run and Save data only for facts those fields actually establish.

## Children and comic identities

The child portraits represent the source characters, not a newly younger cast. Ages below are provisional biography ages. Ethnicity, religion, gender and disability are identities, never gag generators.

| Child | Voice and want | Comic engine | Relationship movement | Guardrail |
|---|---|---|---|---|
| Maya Chen, she/her, 13 | Concrete, short, prepared; wants Orbit recognized | Tries a sensible small fix on an extravagantly unreasonable room | Lets evidence revise her model without accepting unfair rules | Forearm crutches remain ordinary equipment. Position objects within reach; seated examination is valid |
| Mateo Alvarez, they/them, 12 | Eager questions, specific comparisons; wants Pepper heard accurately | Builds a large exciting theory, then gladly narrows it when proof arrives | Learns a useful question can beat an impressive answer | Not an exposition machine; no joke about pronouns |
| Amina Okafor, she/her, 13 | Patient but firm; wants Mochi comfortable enough to choose | Notices the one small animal need an elaborate “calming” system missed | Can be frightened and still act; can refuse politely without soothing everyone | Never equate silence with consent or fear with incompetence |
| Eli Rosen, he/him, 12 | Verbs, experiments, delighted specificity; wants Sprocket's real exit | Wants to inspect an object that is already inspecting him | Gives up being the clever solver when the animal solves something differently | He/him does not settle or erase the source nonbinary identity |
| Priya Shah, she/her, 14 | Precise plans, then honest corrections; wants Pixel well cared for | Competes with absurd overengineering, discovers an overlooked preference | Makes plans that can change; prefers a good exception to a bad perfect score | Competence is a strength, not a personality defect |
| Jordan Brooks, he/him, 13 | Offers help quickly, energetic action; wants Scout back | Volunteers for a modest task and discovers a ridiculous job title | Shares responsibility, learns rest is not abandonment | Do not make him the permanent reckless fool or blame him for Scout's captivity |
| Lena Yazzie, she/her, 11 | Few words after close observation; wants Mooncake findable on his terms | Quietly changes one tiny thing that defeats a very loud system | Claims attention when she wants it; keeps privacy when she doesn't | Quiet does not mean mystical, emotionless or passive |
| Samir Haddad, he/him, 12 | Warm invitations, playful ceremony; wants Bean and Bean's bonds respected | Treats a haunted social ritual seriously just long enough to expose its silliness | Says a clear no without having to win everyone over | Not a tiny contract lawyer in every scene |

## Character introductions

INTRO records use the character selection dossier/first optional introduction only while that kid's pet is unknown. Read selected kid; N.seen[INTRO-ID] proposed; no gameplay writes. 10–15 seconds each. One still pet image and existing kid portrait; description is visible text. Repeat: quoted last line only while still unknown; found uses the section 06 F line, home uses that kid's exact helping line. Skip: pet name/species remains on dossier. Existing dossier text is the low-support carrier; without pet-state support, do not offer post-rescue dossier claims. No child claims the whole party is present.

**INTRO-MAYA** — Maya: “Orbit scratches three times when he wants a door opened. If this house has doors, I've got a lead.” Caption: “Maya checks the straps on her crutch caddy.” Maya: “And spare batteries. A lead can be badly lit.” Recap: “Maya is searching for Orbit, a black cat with a white chest patch.”

**INTRO-MATEO** — Mateo: “Pepper can copy our cupboard squeak. Every time, someone checks for biscuits. So far, nobody has learned except Pepper.” Mateo: “I want to hear him again.” Recap: “Mateo is searching for Pepper, a green-cheek conure.”

**INTRO-AMINA** — Amina: “Mochi likes sitting beside me. Not being picked up. Beside is a very important place.” Caption: “Amina leaves a little space beside her bag.” Amina: “I've saved it.” Recap: “Amina is searching for Mochi, a cream lop-eared rabbit.”

**INTRO-ELI** — Eli: “Sprocket checks things by sniffing, pawing, then biting. I use a screwdriver.” Eli: “His method leaves more reviews.” Recap: “Eli is searching for Sprocket, a black-and-white fancy rat.”

**INTRO-PRIYA** — Priya: “Pixel has a lovely new basking stone. He sits on the old crooked one.” Priya: “I packed the crooked one.” Recap: “Priya is searching for Pixel, a leopard gecko.”

**INTRO-JORDAN** — Jordan: “Scout can find someone who needs help in a whole street full of sandwich smells.” Jordan: “I hope someone is helping him.” Recap: “Jordan is searching for Scout, a beagle mix.”

**INTRO-LENA** — Lena: “Mooncake collects treasures. A button. A bit of paper. The thing you put down one second ago.” Lena: “I'm keeping my eyes open.” Recap: “Lena is searching for Mooncake, a Syrian hamster.”

**INTRO-SAMIR** — Samir: “Bean recognizes my voice. Also the fridge. I'm trying not to make it a competition.” Samir: “Bean Bean. That's what I call.” Recap: “Samir is searching for Bean, a tricolour guinea pig.”

## Comedy and emotional spacing

Give each short optional scene a comic action, not merely a sarcastic reply. A resident makes a specific attempt; an animal or child exposes the overlooked detail; the resident's adjustment gives the joke a different ending on replay. Reunions get at least one quiet page without a gag or interruption. Never interrupt pet recognition with rewards, achievements or tutorial overlays.

Comic motifs are distributed: Butler presentation, Governess over-arrangement, Bedframe self-important rest, Confectioner portion confidence, Conservatory possessive cultivation, Groundskeeper reverent cataloguing, Archivist immaculate filing, Watcher forecasting, Lamplighter hoarded light, Master social attention, Curator preservation, Gardener boundary growth, Warden secrecy, Matron compulsory comfort, Kennelmaster impossible safety guarantees, Harvest King deciding when growth is ready, Keeper fear of letting go. Avoid making all seventeen forms of paperwork.

There are no frightening jump-cut requirements, implied dead children, graphic bodily harm or comedy about hunger/animal distress. Bones may happily assemble himself; that does not establish that an ordinary puppy died. The Drowned Matron is not presented as a drowned corpse. Truffle's appearance is not an occasion for disgust at his body.

## Staging and player agency

Only present party members speak. Solo narration carries missing exchanges. A split co-op ballot produces a shared route, not unanimous consent: say “The route leads here,” never “Everyone agreed.” Never write “you forgive,” “you agree,” or “you want to stay” as a forced consequence of Continue. The House can open a gate without requiring the child to absolve it.

Use the current map and Curiosity presentation to make exploration legible; these are not free-walking 3D interactions. “Examine the plaque” means a prose choice unless an interactable is separately implemented. Physical bits are captionable: “The umbrella turns toward the cloud.” Their meaning survives muted audio, reduced motion and static art. Proposals do not require new walk cycles or fine motor timing.

Essential scenes have a short version that states the change, then returns to play. Optional scenes do not block rewards. The proposed journal provides full replay; until it exists, do not advertise it. Existing boss logs are insufficient for guaranteed essential information because they can be missed during combat.

## Recurrence and the essential route

Before sanctuary, a resolved boss scene records a local encounter, not a permanent change in the entire House. Repeat encounters use state-neutral challenge lines and do not deny the last meeting. A guardian's specific promise in a local scene must remain true locally or be rewritten; do not automatically excuse betrayal with “the House reset.” After sanctuary, continued hostile expeditions are explicitly **remembered expeditions**, a consequential new presentation proposal. They reproduce old encounters for gameplay without recapturing present-day pets or making the repaired House break its promise. They give no new present-day rescue claim. Current-build alternative: omit sanctuary persistence and present only the individual expedition ending until the memory wrapper is implemented. No player is silently entered into a replay of captivity.

The integration manifest in section 08 must put purpose at opening skip, care/refusal/Keeper identity at Heart arrival, recognition in the Ward before combat, and exit outcome after confirmed Keeper victory. Each carrier has a printed recap. Optional clues never bear the only copy of those facts. Introduction anecdotes appear in the dossier OR opening during a first session, not automatically in both. Full reread remains voluntary.

In co-op, pet facts belong to the owning profile and kid; present-tense party narration uses only facts agreed by the synchronized snapshot. Unknown/mismatched data is not “missing again”: use neutral search/result prose and defer the affected completion. No writes to absent profiles. Each affected player controls their first reunion's full/recap presentation. Engineering must implement the synchronization; writers must not invent its success. The sanctuary payoff must demonstrate an animal crossing out and returning through an open gate while another can remain. An open-looking prop alone is insufficient proof.

Relationships receive optional two-person scenes in section 07, gated by both participants. Solo editions use the selected child's observation rather than invent an offscreen child's physical presence. Companion recognition and animal actions do not require specific pairings.

Sanctuary can be reached before all personal searches finish. END-10 provides a separate peaceful present-day visit for every remaining pet and unavailable Companion; END-08 is only remembered combat. They must be integrated together or sanctuary persistence is deferred. Mixed pre/post-sanctuary parties use the explicit conservative chronology policy in section 08; the package does not silently assume one player's ending rewrites another player's present.
