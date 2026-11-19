# Questions for Josh, saved while you were away (2026-11-05)

Each one has a default I have already taken, so nothing is waiting on you unless you disagree.

## Needs you (nobody else can do it)

1. **The Steam App IDs, and the demo's.** Still empty. Nothing has run on real Steam or on two real
   computers. Once they are in `steam_appid.txt` and `docs/RELEASE.md`, the first test is two machines,
   one invite, one fight. Never 480.
2. **Steam Cloud on the partner site** (RELEASE item 8): Auto-Cloud, 10 MB, 10 files, root
   `WinAppDataRoaming`, subdirectory `Midnight Menagerie/saves` (demo: `Midnight Menagerie Demo/saves`).
   Saves are files now (`shell/saves.js`), so Cloud can see them once this is set.
3. The usual store items: copyright holder, credits, the 32 achievements' art and text, and the
   store page's AI disclosure.

## Decisions I took. Tell me if any is wrong

4. **Demo saves do not carry into the full game.** They live in separate folders, so a demo player
   starts the full game fresh. Steam does this for most demos. Carrying them over is one line in
   `shell/main.js` if you want it.
5. **The password door cannot find a friend everywhere.** Steam's lobby list answers with the nearest
   rooms and cannot be asked for one by name, so two friends in different regions, or on a busy night,
   can type the same words and never meet. The Treehouse now says so after 15 seconds alone and
   points to **Invite a friend**, which always works, as does joining from the friends list. The
   screen for coming back to a saved expedition now has the Invite button too. Should the password
   stop being the headline and become a fallback? A different binding could filter lobbies by
   metadata, but steamworks.js 0.4.0 cannot.
6. **Two friends coming back to a save now find each other** on real machines. Each save named the
   expedition by its own clock, so on two computers nothing ever matched. Fixed and tested.

6b. **Crinkle had a free infinite, and I closed it.** Two Tricks that Trace in one hand (two Impressions, say)
   looped for ever: play one to copy the other, and the free copy copies it again. The whole-game walk
   found a turn that never ended, with Amina on 413 Guard. Now a Trick that Traces ANOTHER (nine of them: Trace It, Impression, Master Copy...) cannot itself be
   Traced; Watermark, the Powers and the self-tracers (Paper Storm, Duplicate Beak) still can. The keyword's text says so. If you
   want infinites as a reward for a built deck, the other fix is to make a Paper Copy cost 1 Paper.

## Art and look

7. **224 of 275 enemies are unpainted.** The demo's three wings borrow stills, and the other twelve
   wings in the full game draw grey stand-ins (the Graveyard's Dust Bunnies are grey blobs with eyes).
   Is art coming, or should the full game borrow paintings the way the demo does?
8. **Survey 11 lost its paired test against survey 10**, 27-6 and 28-5. Each of rounds 47-58 won its
   own test, but none of them could see what the 11-03 merge did:
   - a rule that walked every room's furniture to the back wall, to stop a Companion standing in a
     chair. Round 59 is putting the floors back without bringing that bug back;
   - the Atlas's new drawing, which no round judged. Its labels now cover the plan;
   - your larger fonts, which stay. But nobody fitted the boards around them, so the shop shows 3 of
     its 5 Tricks behind a "More wares below" rail. Round 60 fits the boards without shrinking text.
   If larger text was meant only for some screens, say which ones. I have treated it as everywhere.
9. **The map's floor plan** lost to the old parchment with both judges ("milky", "pale"). The plan is
   yours and it stays. Round 60 deepens the sheet and thins the toolbar, nothing more.

9b. **The floor plan opens with part of the sheet off-screen, and the judges count that against it.** Two
   surveys now mark the map down for rooms cut at its right edge ("UMBRELLA GA", "VISITOR CLO"). A repair
   framed the whole building instead, but then every room name is 5.5 to 7 px on screen, which breaks the
   large-type rule, and it went against the 10-28 choice to open at a readable 0.85x. I kept your opening
   view. The framed version is on branch `ui/r61-repair2` (commits `87630b49`, `1f445378`) if you want it,
   or a middle way: open framed and zoom to 0.85x on the party's room after a moment.

## Release

9c. **The demo depot ships the whole game behind one flag.** `package_release.py --demo` builds the
   same 881.6 MB, 2,927 files as the full game, with `"demo": true` in `release.json` (docs/RELEASE.md,
   "The demo"). A player who edits that one line in the demo's folder plays the full game free. Many
   indie demos accept this; the alternative is a demo build that leaves the other fourteen wings' art,
   enemies and data out of the depot. I changed nothing. Default: ship as is.

## Not measured

10. **Real-GPU performance with four Kids**, on the Deck or anything else. Fights of one Kid are inside
    the 15.5 ms budget. Four have not been timed on real hardware.
    **Measured 2026-11-15 on this laptop** (RTX 3050 Ti; Unreal not running), with the Foyer boss at 1280x800
    and `tools/gpuprof.py --settle 6`: one Kid **9.06 ms**, four Kids (`&kids=4`, a new deep link) **9.59 ms**.
    Both are inside 15.5 ms. The same four-Kid fight captured by `tools/shot.py` ran at 62 fps on the Intel
    integrated GPU. Each player's stage shows their own Kid, with the other three as plates, so four Kids
    cost little more than one. Still not timed on a Deck itself.

## Asked 2026-11-18

11. **Dev is about 60 commits ahead of origin and not pushed.** Eighteen repairs and surveys 21 and 22
    are on it. Nothing was pushed because nobody asked. Default: leave it until you say push.

12. **The D: drive was not attached on 11-17 and 11-18.** Survey 16-20's images and every older round's
    worktree are on it. This session worked in `C:/UILOOP/s21/` (about 5 GB) and paired survey 21 against
    a fresh capture of survey 20's build in place of survey 20's own images. When D: is back, should
    `C:/UILOOP/s21/` move to `D:/UILOOP/s21/`? Default: leave it on C: until you say; nothing on D: was
    touched or pruned.

13. **`tests/enemy-clips/check.py` is red (3 to 5 of 981) and was green on 11-15.** It fails the same
    way on the build this session started from, so the repairs did not cause it, and nothing since 11-15
    touches enemy clips. The machine was compiling shaders slowly on 11-18 (8 programs over the 12 s link
    budget, 6 on the old build too). Did anything change on this machine between 11-15 and 11-17 (a
    Windows or driver update, as on 10-13)? Default: re-run it and `tools/linkprof.py` after a reboot
    before treating either as a fault in the game.

14. **The settings cog's enamel face is drawn at 90.3% of its old size** (repair 43) so its gilt ring
    fits inside the HUD rail and matches its neighbours. Its glyph, button box and hit area are unchanged
    and no text shrank. Both judges preferred it. If "never shrink" covers a control's face too, say so
    and it goes back (`git revert fc7f43e5` restores repair 36's larger ring).

15. **Shader link time is now the limit on more room paint.** `tools/linkprof.py` budgets 12 s per prop
    program. On 11-18 the foyer read 19 s, the bathhouse 13-14, sleeping 13, the kitchens 11.8 and the
    graveyard 9-12 (unsettled: the machine slowed mid-session). The foyer, bathhouse and sleeping were
    over before this session's work. Is 12 s on this machine still the right budget for the Deck's first
    visit to a wing, or should the over-budget wings be trimmed before anything is added to them?
    Default taken: every repair in a wing near the budget takes lines out as it adds them, and nothing is
    added to the foyer's, bathhouse's or sleeping quarters' prop programs.

**Answered 2026-11-18:** question 11. Josh said "Push dev"; dev was pushed at `f9d8e916`. Later commits are not covered: ask again.

**Answered 2026-11-19 (Josh):**
- 12: move `C:/UILOOP/s21/` to D: when D: is attached again. (Still detached on 11-19; not moved yet.)
- 13: Josh did not know what enemy-clips is and guessed it was on D:. It is not: `tests/enemy-clips/check.py` reads only the repo and the dev server. Its 976 static and geometry checks pass; the 5 failures are all live "beats" in the browser (door-greeter, dust-bunny, butler: "attack hands back to idle", "no cast, so a buff plays nothing - hurt"). So the machine-change question stands unanswered and the red is OPEN: either a timing flake on a slow machine or a real fault in how those three enemies return to idle. Nobody has looked at it in the game.
- 14: the cog is fine as it is. Closed.
- 15: trim the over-budget wings FIRST. No more paint in a wing whose prop program is over 12 s (foyer 19.0, greenhouse 14.9 and 12.5, bathhouse 13.1, sleeping 12.7, hedge 12.4, kitchens 12.1) until it is under.
