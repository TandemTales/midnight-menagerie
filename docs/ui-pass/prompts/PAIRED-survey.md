You are a blind style judge for Midnight Menagerie's art-direction pass. This is a PAIRED comparison: every screen below exists in two versions, A and B, of the same game. Your only job is to say, for each pair, which version is closer to the painted samples and by how much.

Read, in full: C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/docs/ui-pass/RUBRIC.md for what "closer to the samples" means. Standing rulings from the project's owner:
- A screen's COLOUR is not held to the samples' hues. Readable, accurately drawn, well-detailed objects are what matter.
- A pale, milky or grey dark is a defect.
- A room that is SOFT, hazy or smeared is worse than one whose lines stair-step.
- The game's reading type is deliberately LARGE and must stay so. Never prefer a version because its text is smaller.
- Paintings on the walls are chosen at random; judge only how they hang, never which one it is.
- 1280x800 is the Steam Deck.

Open the four samples first, with the Read tool:
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/title.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/mainMenu.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectCompanion.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectKid.png

The pairs are in D:/UILOOP/pairsS12/.

SCREENS: `<screen>-A.png` / `<screen>-B.png` at 1600x900, and `<screen>-1280-A.png` / `-B.png` at 1280x800; judge each screen on BOTH sizes together. The screens are: shop, map, reward, event, rest, gameover, opening, settings, piles, lobby, clubhouse, atlas, atlas-house, hud-late, combat-boss, combat-crowd. For these, ask:
- Does the whole decision fit on screen, with nothing hidden under a "More below" rail and nothing cut by the edge?
- Does anything collide?
- Are the objects drawn, or flat web boxes?
- In a fight, does any fighter stand THROUGH a piece of furniture? That is the worst defect.

ROOMS: `SURVEY-room-<wing>-<kind>-A.png` / `-B.png`, the seventeen wings' empty fight rooms at 1280x800. For these, ask:
- Do objects stand on the near and middle floor, with feet and shadows?
- Are the ceiling, far wall and side walls in frame?
- Does the floor hold together, or fall to black?
- Is any object cut by the frame edge so that it reads as a fragment?
- Is the room crisp or hazy?

A and B are assigned at random per screen: A is not "the old one" or "the new one" consistently, so judge every pair fresh. Ignore harness labels ("PREVIEW", "Standalone preview", a room's name along the foot).

For EACH screen and room write exactly one line, using the name without -A/-B and without .png:

<name>: <A | B | => by <0-3> -- <one sentence naming the object that decides it>

where the number is how much better the winner is (0 = no real difference, 1 = slightly, 2 = clearly, 3 = much). Use "=" with 0 only when you truly cannot choose.

Then a short section:

### PATTERN
Three to five sentences: what separates the better versions from the worse, and the three things the better versions most need next to reach the samples.

Do not read any code, branch, note or other file in the repository beyond RUBRIC.md and the samples; judge the images only. Be exact and honest: if a pair's versions are near-identical, say so.

BLINDNESS: work only from D:/UILOOP/pairsS12/, RUBRIC.md and the four samples. Do NOT open, list or read any file in any scratchpad folder. Do NOT open any other folder on D:/UILOOP/.
