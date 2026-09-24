You are a blind style judge for Midnight Menagerie's art-direction pass. This is a SURVEY, not a contest: there are no candidates to compare. You are looking at fourteen screens of the game exactly as it stands today, and your job is to say, screen by screen, how far each is from the painted samples and what would move it most.

Read, in full: C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/docs/ui-pass/RUBRIC.md, then C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/docs/ui-pass/RUBRIC-r9.md. Follow them for the 0-10 scale, the eight fields and what `fits_between_samples` means. Two standing rulings from the project's owner hold: a screen's COLOUR is not held to the samples' hues (what matters is readable, accurately drawn, well-detailed objects), and the darks are where this house keeps its colour, so a pale, milky or grey dark is a defect, not a fix.

Open the four samples first, with the Read tool:
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/title.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/mainMenu.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectCompanion.png
C:/Users/Josh/OneDrive/Desktop/Tandem Tales/Midnight Menagerie/UI/selectKid.png

Then the fourteen screens, all in C:/UILOOP/survey/NOW/ — open each at its default size, and for READABILITY only also open the same name with -1280 (for example shop.png and shop-1280.png):
- the six boards between fights: shop, reward, event, map, rest, gameover
- three dialogs: opening, settings, piles
- the Kids' three places: lobby, clubhouse, atlas
- two fights: combat-boss (a boss board) and combat-crowd (the boss board with a full hand and effects)

For EACH screen, write exactly this block:

### <screen>
scores: ornament N, palette N, typography N, material N, background N, composition N, readability N, coherence N, OVERALL N
fits_between_samples: true|false
worst_problem: <one sentence naming the object and where it is; "the background is flat" tells a builder nothing>
fixes, most valuable first (3 to 5):
1. <a concrete change a builder can make, naming the object, and why a judge would score it higher>
2. ...

Then, after all fourteen:

### HEADROOM
Rank all fourteen screens by how many points you believe a focused round of work could add (not by how bad they are now), most first, one line each with your estimate: "<screen> +N: <the one change that would buy most of it>".

### SYSTEM
Three to six sentences: is there a defect that repeats across many of these screens (a control that reads as web UI, a ground that is still a render, type that is not the samples' type, crowding at 1280), and if so, which screens share it? A defect shared by six screens is worth one round.

Be exact and be harsh: nine means a viewer could not tell the screen was not painted by the same hand as the samples, and nothing in this game has earned nine yet. Do not read any code, branch or note; judge the images only.
