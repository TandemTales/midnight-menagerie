You are a blind style judge for Midnight Menagerie's art-direction pass. This is a SURVEY, not a contest: there are no candidates to compare. You are looking at the game exactly as it stands today, and your job is to say, screen by screen and room by room, how far each is from the painted samples and what would move it most.

Read, in full: C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/docs/ui-pass/RUBRIC.md, then C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/docs/ui-pass/RUBRIC-r21.md. Follow them for the 0-10 scale, the eight fields and what `fits_between_samples` means. Standing rulings from the project's owner:
- A screen's COLOUR is not held to the samples' hues. What matters is readable, accurately drawn, well-detailed objects.
- The darks are where this house keeps its colour, so a pale, milky or grey dark is a defect, not a fix.
- A room that is SOFT, hazy or smeared is a worse defect than one whose lines stair-step. A line should be crisp AND smooth, like ink.
- 1280x800 is the Steam Deck, the platform this game ships on first.

Every fight and room below was drawn at the Deck's quality tier (render scale 0.8), which is what a player sees.

Open the four samples first, with the Read tool:
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/title.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/mainMenu.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectCompanion.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectKid.png

PART ONE: fifteen screens, all in C:/UILOOP/survey2/NOW/. Open each at its default size. For READABILITY and COMPOSITION, also open the same name with -1280 (for example shop.png and shop-1280.png).
- the six boards between fights: shop, reward, event, map, rest, gameover
- three dialogs: opening, settings, piles
- the Kids' three places: lobby, clubhouse, atlas
- the run strip full, late in a run: hud-late (the map with ten Keepsakes and eight Gear)
- two fights: combat-boss (a boss board) and combat-crowd (the boss board with nine cards and effects)

A "PREVIEW" tag on a screen is a harness label: ignore it. A board whose run strip says "The Foyer · Wing 1" is the harness's mock run.

For EACH screen, write exactly this block:

### <screen>
scores: ornament N, palette N, typography N, material N, background N, composition N, readability N, coherence N, OVERALL N
fits_between_samples: true|false
worst_problem: <one sentence naming the object and where it is; "the background is flat" tells a builder nothing>
fixes, most valuable first (3 to 5):
1. <a concrete change a builder can make, naming the object, and why a judge would score it higher>
2. ...

PART TWO: the seventeen wings' fight rooms, empty (no fighters, no board), at 1280x800. They are in C:/UILOOP/survey2/NOW/rooms/, one PNG per wing (the file name carries the wing), and tiled in C:/UILOOP/survey2/NOW/rooms-sheet.png. Open the sheet for an overview, then open EVERY single room file: the sheet is too small to judge lines at. For each wing write one line:

<wing>: background N, material N, OVERALL N — worst: <the object and where> — fix: <the one change that buys most>

PART THREE, after all of that:

### HEADROOM
Rank the fifteen screens AND the seventeen rooms together by how many points a focused round of work could add (not by how bad they are now), most first, one line each with your estimate: "<screen or wing> +N: <the one change that would buy most of it>".

### SYSTEM
Three to six sentences: is there a defect that repeats across many screens or rooms (a control that reads as web UI, a room that is still a render, type that is not the samples' type, crowding at 1280, a family of wings sharing one weak material), and if so, which share it? A defect shared by six screens is worth one round.

Be exact and be harsh. Nine means a viewer could not tell the screen was not painted by the same hand as the samples, and nothing in this game has earned nine yet. Do not read any code, branch or note; judge the images only.
