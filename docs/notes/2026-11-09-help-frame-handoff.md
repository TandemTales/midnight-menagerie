# Help-frame repair handoff — November 9, 2026

> **FINISHED 2026-11-11. This checkpoint is history.**
> - FRAME3 passed its fresh blind test 13-7 and merged (`91da720e`); its focus repair won 4-0 (`e5b32a7e`).
> - Survey 16 beat survey 15, 27-0-39 (`docs/ui-pass/SURVEY-2026-11-10.md`).
> - The final battery left only the three reds that were red before FRAME3.
> - Repair 16 followed (`c5425b02`).
>
> Read HANDOFF-PROMPT.md's START HERE instead of the steps below.

Paused because Josh requested a handoff. **No repair has been accepted, committed, merged or pushed.** Game base is dev `50f803650219a7b4cdd766566bdc7f8798da1655`. Handoff notes are working changes in the main workspace. Do not mistake functional passes for blind acceptance.

## Read first

1. Updated START HERE in HANDOFF-PROMPT.md, through Steam demo.
2. docs/notes/2026-11-05-questions-for-josh.md (defaults already taken).
3. This checkpoint and `D:/UILOOP/r61-help-frame/build/docs/ui-pass/HELP-FRAME-2026-11-08.md`.
4. The UI round step-by-step section and paired judge prompts. Read real-wire notes only if touching multiplayer; this repair does not change network logic.

## Exact working state

- Main workspace: `C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie`, branch dev, HEAD 50f80365 at handoff. Its 28 pre-existing modified capture files remain byte-for-byte unchanged. Their hashes are in `D:/UILOOP/r61-help-frame/checkpoint.json` under originalDirty. Preserve them; do not stage them.
- Frozen comparison worktree: `D:/UILOOP/r61-help-frame/wt`, branch codex/r61-help-frame, HEAD 50f80365.
- Single-builder candidate: `D:/UILOOP/r61-help-frame/build`, branch codex/r61-help-frame-build, HEAD 50f80365, **ten uncommitted game/test files** plus parent-owned uncommitted evidence docs/harnesses. Do not reset this tree.
- No task browser/capture/server process remains. Ports 8777 and 8831 have no listener. Old server PIDs 17712/50648 are historical; never blindly kill them after restart. No agents remain live in the current tool inventory. Recreate one builder only if a revision is needed; create fresh blind judges for acceptance.
- Latest usage: 74% used, 26% remaining. Stop at 5% remaining, not5% used.
- Source hashes were rechecked at handoff: all ten match the final manifest. No source edit followed the builder's final queue pass.

Evidence originally lives at `C:/Users/Josh/AppData/Local/Temp/mm-help-frame-20261108` (call this EVIDENCE). A complete 626-file, approximately 530 MB snapshot is preserved and SHA256-verified as `D:/UILOOP/r61-help-frame/handoff-2026-11-09/mm-help-frame-20261108-handoff-20261109.zip`; the adjacent ARCHIVE-SHA256.txt records completed verification (`7fdba2a36e09f61c6d93ad2ec14ad63638a83365f0792070246e1632431b8750`). The ZIP contains ARCHIVE-MANIFEST.json with each file hash. Keep both original and archive; delete nothing on D without Josh's permission. Worktrees stay on D; temporary captures moved to C because D screenshot writes stalled for minutes.

## FRAME3, the current candidate

Two direct 44px enamel medallions occupy fixed slots in the left gold frame: x=4, Discoveries top=50%-48px, Help top=50%+4px. Full-size upright 20px/22px labels appear immediately on hover or actual keyboard/controller focus, expanding over their medallion in existing dark-cartouche art. The entire fitting and any revealed labels hide under native/custom modals. Existing scene availability remains map, atlas, clubhouse, rest, combat; combat has only Help. No empty book mount.

Original combat shelf/End Turn, rest exit, clubhouse action, atlas dossier and map/candle layouts are restored. Guardian voice is a separate contextual action above the combat shelf, with its original enemy-turn enable rule. Old per-scene help positioning hacks and _syncHelpSpot are removed. No reading-font or card-scale reduction; no room, map-zoom or multiplayer logic edit.

Final source manifest and full builder report:
- EVIDENCE/frame3-diagnostics/frame3-source-manifest.json
- EVIDENCE/frame3-diagnostics/FRAME3-BUILDER-REPORT.md

The ten paths are game/src/scenes/{atlas.css,clubhouse.css,combat.css,combat.js,map.css,narrative.css,rest.css}, game/src/ui/{story.js,story.css}, tests/help-frame/run.py. Stage explicit paths only, after a winning blind test.

Validation already completed:
- Default help gate 38/38, 309.29s, 0 page errors (gate3/ and gate3 log).
- Queue 18/18, every condition delivered at 1280/1600, exit 0 (queue.log, queue/proof.json).
- Synthetic 2/4-Kid layouts plus actual 12-card expanded-label clearance 6/6, 133.02s (party2/). This is local layout evidence, not real-wire/Steam proof.
- Frozen-dev 5/9/12-card comparisons at both sizes: exactly 0 delta in fit, actual transform scale and effective name/rules fonts (hand-comparison-summary.json).
- Static: 0 CSS conflicts, 0 undefined tokens; JS/Python syntax, whitespace and endings checks pass. Only blank EOF cleanup occurred after the full gate, before the final queue/manifest.
- Focused labels can cover decorative map WAY IN lettering; protected controls, hand, candles and teammate plates remain clear. Let blind judges assess the focused views.

## Rejected designs and method limits

FRAME1 used rotated spine labels: **3 new /15 dev /2 same**, rejected. FRAME2 used horizontal bottom-right labels and shifted nearby footer controls: **6 new /12 dev /2 same**, rejected. The same builder produced all three attempts. Rejected exact implementations are at D:/UILOOP/r61-help-frame/rejected-frame1 and rejected-frame2. Raw keys/verdicts are in the build worktree's docs/ui-pass/PAIRED-r61-repair14-frame1-* and frame2-* files. Do not merge either rejected design.

Some earlier votes concerned intermittent blueprint lettering or missing pile decorations despite identical source/assets. Preserve the raw votes, but do not attribute these differences to help positioning. A frozen-dev diagnostic proved one late skull.webp image: it appears in a second still 1.21s later. This does not prove the cause of every previous artifact.

The shared capture wrapper now adds an opt-in still-only network-idle/font-ready/DOM-image-decode/two-RAF guard. Map views also require drawn state, completed finite animations, stable geometry and zero shell scrolling. Both sides get identical guards. Original seeds/viewports/waits remain. tools/shot.py and animation-strip timing are unchanged. The wrapper uses installed Chrome 156, explicit browser overrides remain respected, and only localhost favicon gets a 204 stub. The stub covers Browser.new_page as well as new_context. Cross-drive diagnostic filenames use an absolute fallback. No game URL is intercepted.

## Where capture work stopped

The fresh FRAME3 comparison is **not complete**. EVIDENCE/DEV3 contains17 valid published PNG/state pairs: all twelve 1600 views, plus 1280 map/rest/clubhouse/atlas/atlas-house. EVIDENCE/FRAME3 has no published images. The later dev attempts exited 3221226091 with empty attempt logs; the runner stopped before candidate capture. Cause is unestablished. No process remains to resume. Do not treat these exits as game assertion failures or claim a finished comparison.

Parent harnesses: EVIDENCE/capture.py and chrome.py; matching D:/UILOOP/r61-help-frame copies. Reproducible versions in build/docs/ui-pass/survey-2026-11-08.py and survey-chrome-2026-11-08.py. Pair helper EVIDENCE/pair-frame3.py is prepared but NOT run and hardcodes DEV3/FRAME3/pairs61r; adapt to fresh uniquely named directories. Never overwrite retained evidence.

## Next actions, in order

1. Start hidden owned dev servers: frozen wt on 8777, candidate build on 8831 (`python tools/devserver.py PORT`, cwd respective tree). Record new PIDs. One GPU job at a time; do not touch Unreal or unrelated processes. Recheck source hashes and a small capture after the previous Windows exit before the full pass.
2. Take NEW complete frozen-dev and FRAME3 sets into new C temp directories with the same harness. Use 12 recipes: `map,rest,clubhouse,atlas,atlas-house,hud-late,combat-boss,combat-crowd,piles,settings,map-focus,combat-boss-focus`. Each set has 24 images. Command shape: `python EVIDENCE/capture.py WORKTREE PORT NEW_OUTPUT --screens LIST`. Validate errors[], hardwareGL, readiness markers, no warm timeout/void frame; inspect any bright-paper warnings. Recheck source manifest afterward.
3. Make blind pairs using tools/make_pairs.py: ten ordinary screens, two sizes, 40 images. Add the eight focused map/combat-boss pair images using the SAME random coin as their parent screen. Total 48 images, **ten votes per judge**, not twelve. Existing pair-frame3.py implements this and verifies bytes; update its directory names before use. Key stays outside judge folder.
4. Spawn two fresh blind judges with only RUBRIC.md, four UI reference images and the pair folder. Copy PAIRED-boards.md; opposite screen order and A-first/B-first. Map/boss votes jointly include ordinary+focused views. No source/history/key/other verdict access. Tally with tools/tally_pairs.py. If it loses, retain evidence and have one builder revise; no merge on functional checks alone.
5. If it wins, explicit-path source commit with Co-Authored-By footer, then merge --no-ff into root dev. Preserve all 28 original dirty files. Check merged source against manifest. Fast-forward build worktree to merged dev tip. Parent docs are still uncommitted; carry updated main handoff notes into the final docs commit deliberately.
6. Capture **fresh survey 16 after merge**, sixteen neutral screens at both sizes plus 17 rooms (49 images), using capture.py with --rooms and default screen list. Do not reuse repair PNGs. Survey 15 baseline is D:/UILOOP/survey 15/NOW; all 49 expected images were verified present. Its code predates already-merged repairs 11–13. Pair 33 logical screens/rooms with two NEW judges and PAIRED-survey.md, opposite orders, 66 total votes. Never compare panel scores across surveys.
7. Run full final battery on merged code, one browser job: `python tools/gates.py --logs NEW_C_TEMP/final-gates`. There should be 120 gates including tests/help-frame. Replace owned frozen 8777 server with merged-build 8777 only after baseline capture is finished. Set PYTHONPATH=D:/UILOOP/r61-help-frame/runtime, PYTHONIOENCODING=utf-8, MM_HELP_OUT and R49_OUT to fresh C temp output directories. Do NOT enable MM_CAPTURE_READY for functional tests. This runtime applies Chrome/favicon adapters without weakening assertions. Any 900s timeout may leave descendants: stop only the owned process tree before another GPU test. Compare actual failures against the baseline below.
8. Finish Repair 14 notes, survey 16 report/key/raw verdicts, HELP-FRAME report, docs/ui-pass/README.md and START HERE. Check line endings before edits; HANDOFF is CRLF, most notes LF, combat source mixed. Run endings_guard.py and whitespace checks; stage explicit paths only. Commit/push dev only after actual acceptance/verification, with honest remaining reds. Stop owned processes and verify original dirty files again.

## Battery truth, not the old green claim

Before edits, frozen dev ran 119 gates in 4807s with **22 red**, not the old handoff's four. Raw baseline: D:/UILOOP/r61-help-frame/baseline-gates.log and baseline-gates/. EVIDENCE/baseline-gates-summary.json has all 119 results.

Standing failures: enemy-clips 5 timing, seams 4 floorplan false positives, sprites 7 halo clips. Base-effects passed 170/0. Other initial reds: cards-feel, chrome, map, net, piles-reachable, settings-play, steam-deck, tutorial-narrative, tutorial-restore, upgrade-effects, combat-scene/seam, coop/{rejoin,latency,matedeck,selectscreen,hotseat,rooms,playthrough}, sprites/clips. Many were timeouts; Chrome had large-text HUD clipping, net four functional failures, Deck controller focus.

Initial default browser was downloaded Chromium 151. Subsequent installed-Chrome baseline rechecks: cards-feel passed; net passed 227/0 with 0 unexpected console errors after favicon adapter coverage was corrected (baseline-net-favicon-recheck.log). Other follow-up baseline suites were not completed. Do not erase original results or claim the whole tree green. Final full battery has NOT run.

Hard rules remain: never Steam 480; never shrink reading type; keep art/, animations/, .docx, marketing/, output/, .claude out ofgit; one GPU browser job; worktrees on D; never delete D evidence without permission; stop only owned PIDs; stop at 5% weekly remaining. No real Steam or two-machine claim.

## Paused later on November 9, at Josh's request

The live meter (`get_usage`) read 94% weekly used, not the 74% above; it resets 2026-11-10 09:00 UTC. FRAME3's ten source files were rechecked against the manifest: all match. A fresh capture was started and stopped on purpose after 5 of 24 frozen-dev images, in `EVIDENCE/DEV4`; `FRAME4` was never started. Treat DEV4 as incomplete: start again in new directories. Nothing is running; ports 8777 and 8831 have no listener. Exit code 3221226091 is 0xC000026B, which may mean the Windows session was shutting down when those earlier captures failed; unconfirmed. The next actions above still stand, from step 1.
