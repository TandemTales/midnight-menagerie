# Midnight Menagerie state and payoff map

**Historical proposal below.** The later implementation instruction supersedes its writing-only boundary. Actual Save v3 fields, choices, observations, pet persistence, ending recovery and test coverage are recorded in [10-runtime-integration.md](10-runtime-integration.md); exact executable units and payoffs are collected in [11-runtime-player-script.md](11-runtime-player-script.md). Proposed field names below must not be mistaken for the implemented schema.

## Integration boundary

This is a writing and engineering proposal. No fields below have been added, no save migration has run, and no game behavior has been tested. Existing calls were inspected to avoid false claims. The narrative scripts are complete text assets; implementing their dispatch, persistence and UI is separate authorized work that has not been requested here.

The smallest honest integration can replace opening/coach/event prose and keep stateless boss-introduction text. It cannot promise permanent reunions, a completed sanctuary or a reread journal. Use END-CURRENT until the relevant support exists. The full experience requires the dependencies below, not merely copying dialogue strings into code.

## Existing facts and proposed facts

| State or API | Exists | Meaning and allowed use |
|---|---|---|
| Save.data.seenTutorials / opening | Yes | Suppresses the first opening after complete/skip; not completion of every lesson |
| run.region, route, regionIndex, currentNodeId | Yes | Current expedition and actual traversed route; not every catalogued region |
| Save.data.blueprint.revealed / cleared | Yes | Surveyed and boss-cleared wings are distinct; Foyer clear unlocks later entry choice |
| run.kids / run.local / kidAt(seat) | Yes | Run participants and selected kid/Companion; engine.players is the separate combat actor list. Only present kids physically speak |
| held, freedRoster, companionsFreed, rescued | Yes | Actual captive and liberation facts; lifetime and this-run counts differ |
| companionsRescued / freedCompanions | Yes | Actual rescues. Starter availability is separate and must not inflate this counter |
| availableCompanions / starter set | Yes | What can be selected; use for END-07 availability milestone only |
| run.cluesFound, stats.clues, addClues | Yes | Generic counters, not which authored clue was read |
| Save.data.clues and petsRescued | Fields only | No complete campaign writer found. Do not infer done rescues from empty schema support |
| run.petRescued | No verified campaign writer | Current gameover fallback is not a valid source of truth |
| boss c.say / EV.LOG | Event generation only | No visible log consumer verified; D-BARK required |
| N.seen[id] | Proposed | Core unit delivered via full version or factual recap. It does not assert every optional sentence was read |
| N.fullRead[id] | Optional proposal | Full prose read, only if a replay UI needs to distinguish it. Never used to gate rescue |
| N.clues[id] | Proposed | That specific evidence shown, not an inferred conclusion or all related clues |
| N.bossMet[region] | Proposed | Encounter introduction delivered; not victory |
| N.bossResolved[region] | Proposed | Confirmed victory plus resolution scene/recap delivered. Not permanent guardian reform |
| N.pet[profile,kid] | Proposed | unknown → found → home. Monotonic; no reverse transition on death, fail, rerun, character switch or Haunt |
| N.sanctuary[profile] | Proposed | The open-gate outcome demonstrated and durably committed |
| N.runPlayed[id], N.runMemory | Proposed | Current-run repetition suppression and explicit remembered-expedition wrapper |

No script depends on N.fullRead. If a region chapter uses “seen” to mean full-read, normalize it at integration: its repeat guard is bossResolved/core seen; optional detail is fullRead. Do not create a rescue gate from this naming difference. This map is the shared semantic authority for the package.

## Essential carrier manifest

| Required fact | Full carrier | Skip and absent-route carrier | Commit |
|---|---|---|---|
| Selected child searches for their pet; Companion is the deck partner | OPN-010–017, OPN-070 | OPN-099 exact selected-state recap | Existing opening seen only; no rescue |
| Scuffles use turns, readable intent, Nerve, Tricks, Guard and Courage | TUT action lessons | TUT-090 and eight-step minimal Coach | Proposed lesson seen; no gameplay mutation |
| House has provided real care | Region clues | HEART-EVIDENCE photographs and factual recap | Fact IDs only after display |
| House knowingly refuses departure | Local records/blocked objects | HEART-EVIDENCE release-refused card | Same; no optional clue backfill |
| Keeper is protective instinct embodied | HEART-EVIDENCE wall/shape connection | HEART-EVIDENCE recap | Core seen, not a founder/history claim |
| Specific pet recognizes child and approaches freely | PET-kid-R | Its exact recognition recap, acknowledged by that seat | found only after delivered outcome and successful save |
| Pet is outside combat and not an escort objective | PET-WARD-REST | “The pets wait safely outside the Scuffle.” | No combat entity created |
| Keeper defeat is nonlethal; exit opens | END-01 | Its state-specific exact recap | home only for found pets whose exit was delivered |
| Animals may stay, leave and return | END-04 witnessed outward/return crossing | Exact recap includes those actions | sanctuary after successful commit |
| Remaining pets can still be found after sanctuary | END-10/10A | Same short present-day recognition and exit pages | Per-profile found/home; never fake all-eight completion |
| Post-sanctuary combat represents the past | END-08 explicit opt-in | Its opening/result captions | runMemory, no recapture or new present-day pet home |

### Heart ordering and deduplication

Present-day hostile expedition: Heart arrival → HEART-EVIDENCE (full or short, once per run) → missing E2 Ward cards → per-seat R/F or already-home helping branch → PET-WARD-REST if any pets found → MM17 B0 brief challenge → actual Keeper Scuffle → MM17 P / MM17 T handoff → END-01 → END-02/home vignettes or optional END-03/04. MM17 B0 must not repeat the full evidence lecture; MM17 P must not duplicate the whole END-01 ending. First reunions are never delayed until after victory.

If no new pet is found because all active pets are home, omit Ward pet staging and use resident animals in the finale. If facts are unknown because a transaction/profile is unavailable, use neutral text and resolve the pending state; do not assume home or narrate recapture. Optional Heart clues enrich the mandatory evidence but never unlock the only route to the boss.

Post-sanctuary present-day visit: END-10 → exact PET-kid-S full/return variant → END-10A → H. Historical E2 records are optional and explicitly labeled as before the gate opened. No blocked-door R/F lines are reused. It contains no Scuffle. Remembered combat: END-08 → historical scene variants labelled memory → return to now; current pets remain untouched.

## Pet transaction proposal

Before displaying R, capture profile, selected kid, version and prior pet state in a pending narrative transaction. On acknowledgement of R or its full factual recap, persist found idempotently. Do not write home until END-01 or END-10A actually delivers an exit and the save succeeds. Preserve found if the expedition fails. A resumed pending scene uses its recap, never respawns a lost pet. Writes cannot lower a state. A failed save must preserve the pending result and offer retry; it must not silently discard it or say “saved.” This is proposed behavior, not a tested implementation.

**SAVE-RETRY.** UI unit, anywhere a proposed narrative commit fails. Trigger failed save acknowledgement; speaker neutral UI. Text: “Your progress could not be saved yet. Keep this screen open and try again.” Buttons: “Try saving again” and “Keep reading.” The latter continues locally with a visible “Not saved yet” label and retains the pending result; it does not claim durable persistence. Exact success text after verified commit: “Progress saved.” No audio-only error, no automatic departure, no countdown. Repeat same text, no comedy. Fallback before this support exists: do not ship the promised persistent scene. Account/cloud semantics must be confirmed by engineering.

Multiplayer: profile-and-kid ownership, not just a globally shared kid slug. Only profiles whose scene outcome was delivered receive completion. A party snapshot may coordinate staging, but it cannot erase a home state or write to an absent account. Each affected seat controls first-reunion full/recap acknowledgement. On mismatch, exact UI: “This player's story progress is not available yet. Their reunion will resume when it is.” No need to block unrelated player's optional reading. Joint combat synchronization and the choice to block departure pending reconciliation need implementation review; no guessed network guarantee is offered.

**PARTY-CHRONOLOGY.** Proposed conservative policy for mixed sanctuary-complete and pre-sanctuary profiles: do not infer a shared present from any/all flags. Before starting, show “Your stories are at different points. You can revisit a memory together, or continue your searches separately.” Choices “Shared remembered expedition,” “Continue my search,” “Back.” The first clearly selects memory for all seats and grants no new present-day pet/sanctuary state. The second returns each local profile to its own present-day route (ordinary search or END-10). Shared present-day campaign progression across incompatible chronology is deferred, not advertised as supported. This is a consequential co-op presentation proposal requiring owner review; it preserves existing combat play without narrating anyone's repaired House as newly hostile. Before the UI exists, full sanctuary campaign integration is limited to local-profile story play. No hidden account change occurs.

## Major revelation map

PARTY-CHRONOLOGY exact shared-memory wrapper overrides END-08's individual present-tense claims when sanctuary states differ. Opening caption: “This shared expedition revisits the House as it was. Each player's present story stays unchanged.” Result caption: “The shared memory is over. Your own story progress is unchanged.” No open-gate or homeward-journey claim is made for a profile that has not reached it. END-08's original result is used only when every participant has the corresponding sanctuary state. These are proposed presentation choices, not existing multiplayer behavior.

The local region records supply the full text, room, speaker, first/repeat, initial interpretation and fallback for every local clue. The rows here connect those pieces into the whole-game mystery. Clue IDs with spaces in section 05 are canonical manuscript IDs, e.g. `MM09 C1`; do not silently rename them. An eventual data export can map them explicitly.

| Question | Evidence IDs and form | Prerequisites | Plausible early reading | Eventual payoff and reliable fallback |
|---|---|---|---|---|
| Are these animals being helped? | L02-C1; L03-C1; L04-C2; MM12 C1; recovery photos in HEART-EVIDENCE | Local inspection only; Heart no clue gate | A kind or fussy shelter | Food/restoration are real; Keeper's wrong conclusion does not erase care; Heart photos repeat proof |
| Why are departures blocked if a home is known? | L01-C1/C3; L04-C1; MM15 C1/C2; each PET-E2 | Named kid only for personal record | A mistake, a temporary restriction | Keeper admits fear of outside risk; release-refused card at Heart guarantees explanation |
| Did accepting help mean agreeing to stay? | L02-C3; L04-C1; MM14 C1/C2; PET-SAMIR-E2 | No special gear, not every clue needed | A visitor accepted comfort | Reunion approaches and a real exit distinguish present choice; Heart and END-04 show choice rather than a lecture |
| Are strange forms proof of harm or death? | L01-C2 comic portrait; MM09 C1 shadow; MM11 C1/C2; PET-E3 and R | Optional local; R supplies identity itself | A frightening label may be literal | Living recognizable pets, Mopsy-specific exception, no invented deaths; R plus Heart identity recap |
| Does leaving erase a bond/name? | L06-C2; L07-C2; MM17 C2/C4/C5; PET-SAMIR-E3 | Optional; no prior chronology required | An old name or thank-you is a memorial | Kept WENT HOME names and actual return; ending demonstrates one return, never promises all return |
| Who is the Keeper? | HEART-EVIDENCE wall writing and shape; MM17 B0 challenge | Actual Heart entry | A separate powerful guard | Protective instinct embodied, no secret villain; mandatory recap exact identity. MM17 F is atmosphere only |
| What caused the House's fear? | Old gate bricked later; known-home records changed; optional testimony | None beyond inspection | Fear grew, some unrecorded event may have occurred | Cause remains unresolved; do not answer with invented founder/fire/tragedy. The present refusal is enough to confront |
| Is the sanctuary change real? | END-01 opens exit; END-04 stay/out/return; END-10 later access | Confirmed outcomes, not a boss count alone | A promise might fail | Usable two-way threshold, later visit retains it; short recap includes actual actions |

Evidence labels: **Fact** means the player can observe the prop/action; **House claim** may be self-serving; **rumor** must be named as rumor; **misunderstanding** is corrected by observable detail. A record saying “happy” establishes that someone wrote “happy,” not the animal's feelings. A familiar sound may be an old echo. A generic collar is not automatically the selected pet's collar. The one deliberate comic false lead is the grooming portrait, resolved in the same optional examination; no fake pet death.

## Personal clue and payoff tracker

All eight use E1 recognition, E2 contradiction, E3 emerging ability, R present verification. Prerequisite for R is the selected/present kid in the guaranteed Ward in the proposed compressed campaign, not collecting three optional clues. A missed E2 is physically re-presented at the Ward. E1/E3 are not retroactively credited by R.

| Kid | E1 | E2 | E3 | R recognition and retained agency | Home payoff |
|---|---|---|---|---|---|
| Maya | Three scratches | Knows Maya/home, still refuses | Shadow senses doorway | Orbit approaches; collar offered, not imposed | Shadow curls by familiar bag |
| Mateo | Cupboard squeak may be echo | Go-home request omitted | Feather/arrow versus bell | Living response to Mateo; asks home | Cupboard callback retains affection |
| Amina | Clean moss, outside latch | Quiet equated with happy | Familiar thumps, refuge | Wait without timer; voluntary approach | Refuge has a way out |
| Eli | Sniff/paw/bite marks | Every puzzle returns to enclosure | Hinge moved after escape | Sprocket opens latch himself | Curious inspection survives |
| Priya | Crooked rock preferred | Good care plus restricted movement | Warm square | Pixel chooses familiar stone, approaches at own pace | Notebook receives harmless warmth |
| Jordan | Recalculating trail | Endless “last job” | Helps then approaches exit | Rest without assignment | Resting place replaces emergency duty |
| Lena | Sorted Museum; blue button stays there | Privacy arrow hidden | Pocket bigger inside | Carried yellow button invitation; emerges freely | Knock before visiting Museum |
| Samir | Red thread/hair/lettuce | Food acceptance not transport permission | New friendship | Approaches Samir; Page bond retained | Fridge joke and friend's drawing |

## Callback scheduling

| Setup | Payoff | What changes | Guard |
|---|---|---|---|
| L01 towels, Butler service | L01-P and END-05 two welcome mats | Helpful objects finally serve departures too | END-05 optional, no compulsory repeated towel scene |
| L02 duster hat | L02-P unusual hat remains | Preference can beat arrangement | No renewed forced hat correction on repeat |
| L03 hiding sign | L03-P inside curtain cord | Occupant controls privacy | Repeat must not revoke that local promise |
| L04 iced utensils | L04-P plain spoon | Plain useful care beats spectacle | No gag during pet vulnerability |
| L06 remembered rake | L06-T BACK SOON | Absence can be temporary | Keep separate from memorial grief |
| L07 filing everything | L07-P correction | Record serves truth | No new filing joke in every other region |
| L08 prediction/biscuit | L08-P “might” | Forecast becomes uncertain | Only on full scene; mechanics stay exact |
| MM09 lamp labels | MM09-P useful light | Light used instead of hoarded | Local act, not free global hazard removal |
| MM10 endless welcome | MM10-P goodbye | Visit can end | Does not require coat-check action |
| MM11 labels | MM11-P usable collection | Preserve without immobilizing | No invented ordinary pet death |
| MM12 glove | MM12-P glove retained | Not everything must become mulch | Narrated object, no equipment award |
| MM13 secrecy | MM13-P inside handle | Privacy controlled by occupant | Not every secret forcibly exposed |
| MM14 towel ritual | MM14-P optional comfort | Comfort offered without requirement | Never imply water/submersion injury |
| MM15 endless preparation | MM15-P empty bed | Prepare for need without creating a captive | Does not count as pet home |
| MM16 harvest readiness | MM16-P directions | Journey need not wait for ideal ripeness | No timed pet-loss interpretation |
| Companion B motifs | Matching Companion C | Box/napkin/cushion/leaf/notice becomes freely chosen use | C requires B delivered or offers voluntary B first; do not claim “again” |
| PAIR A | Corresponding PAIR B | Children adjust behavior toward one another | Both participants present and A delivered to both |
| Pet intro anecdote | Matching H | Familiar behavior returns in a safe context | home state only; intro suppresses after home |

One optional scene per noncombat room, one battle bark per eligible hook per encounter, no repeated bark across three expeditions unless explicitly reread (proposed history). Default long scenes once per profile; neutral repeats after actual prior resolution. Suppress banter during targeting, reward choice, reunion quiet pages and save errors. A backlog is discarded or offered in the journal, never burst-played after a battle. A seed must not be rerolled to pick jokes; use stable priority and seen state, preserving deterministic mechanics.

## Engineering dependency map

| ID | Required work | Existing carrier or simpler alternative | Acceptance evidence required later |
|---|---|---|---|
| D-TEXT | Register exact units and resolve speaker presence/ID | Existing tutorial pages, Curiosity prose, result text | Text matches script; no absent speakers; no original mechanics replaced |
| D-COACH | Action-aware lesson sequence, actor filter, input arbitration, optional help | Existing eight-card Coach and tooltips; no invented success checks | Keyboard Enter/Escape conflicts resolved; no blocked legal action; battle loss/retry works |
| D-SCENE | Safe pre/postboss display and manual recap | Static prose on boss intro/reward route | All skip paths reach short facts; no double reward or boss completion |
| D-BARK | Consumer for emitted boss dialogue, readable transcript/captions | Omit optional barks | No mechanics obscured, no timed essential reading, combat unchanged |
| D-CLUE | Named evidence persistence and optional journal | Stateless event text, no claimed memory | Only shown clue IDs written; generic counter never unlocks unseen story |
| D-PET | Guaranteed Ward, recognition/exit states, idempotent persistence | Script-only until supported; END-CURRENT result | Found survives defeat/reload; home never reverses; no pet combat entity; save failure honest |
| D-PARTY | Per-profile story ownership, acknowledgements and reconciliation | Local profile story only, explicitly scoped | Mixed home/found/unknown, disconnect/reconnect, new guest and shared vote tested |
| D-END | Sanctuary proof/commit, END-10 peaceful visits and END-08 memory wrapper | Defer sanctuary persistence; individual exit ending only | Seven remaining pets reachable after first sanctuary; remembered battles never recapture or falsely rescue |
| D-JOIN | Sanctuary invitations for still-unavailable Companions | Defer full sanctuary mode if it strands roster progression | Available versus rescued counts stay distinct; no invented prior rescue |
| D-A11Y | Focus order, screen-reader labels, large-text pagination, transcript | Existing text surfaces with short copy | Actual 1280×800/1920×1080 large-text screenshots, keyboard/controller, muted/reduced-motion verification |

No new combat stat, difficulty adjustment, card, reward, pet meter, morality system, irreversible timer, animation production or art replacement is requested by this map. D-END introduces a narrative visit view, not changes to Scuffle rules. Rewards and achievements in memory mode remain an explicit engineering decision; do not let unknown reward policy block present-day reunion access.

## Manual scenario audit for later integration

These are specified acceptance scenarios, not executed tests: first Maya/Marmalade full tutorial; opening skipped before selection; keyboard-only prologue; battle victory before coach waits finish; prologue defeat; first run chooses unexpected second wing; every optional clue skipped; every scene shortened; Heart with unknown/found/home; mixed co-op statuses and dissenting vote; same Companion rescue room then boss; substituted captive; all Companions already available; save fails at found and home; player disconnects during first reunion; first sanctuary with seven unknown pets; every later pet via END-10; memory run win/loss; all-eight and all-sixteen milestones independently. The fresh editorial review is a manuscript audit against these paths, not evidence of executing them in game.


