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
   found a turn that never ended, with Amina on 413 Guard. Now a Trick that Traces cannot be Traced by
   another; it can still Trace itself (Paper Storm, Duplicate Beak). The keyword's text says so. If you
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

## Not measured

10. **Real-GPU performance with four Kids**, on the Deck or anything else. Fights of one Kid are inside
    the 15.5 ms budget. Four have not been timed on real hardware.
