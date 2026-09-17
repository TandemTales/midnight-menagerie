# Blind style judgment — rubric, round 9: THE ROOM, DRAWN ACCURATELY

Read `RUBRIC.md` first for the 0–10 scale and the blindness rules, then
`RUBRIC-r1.md`. **This file changes what several of the eight dimensions MEAN
for this round.** Where it disagrees with `RUBRIC.md` or `RUBRIC-r8.md`, this
one wins. The score fields you return are unchanged; what you put in them is not.

## THE CHANGE, in one paragraph

Rounds 0–8 asked "could this have been painted by the hand that painted
`UI/*.png`", and judges correctly marked rooms down for using colours the
samples do not contain. **That is no longer the question.** The game's owner has
ruled that a background's colour only needs to suit its setting, and that what
matters far more is whether the room is a careful, accurate drawing of a real
place: objects you can recognise, built the way the real object is built, at the
right size, with straight lines where the thing is straight.

**So: do not mark a room down for being green, or plum, or magenta.** The
Impossible Greenhouse is allowed to be green. Mark it down if its planting does
not read as planting.

## WHAT TO ASK, in this order

1. **Can you name everything you can see?** Point at each object in the frame
   and say what it is. Anything you cannot name, or that you name wrongly before
   correcting yourself ("that's a cauliflower — no, a broken tomb"), is the
   round's central failure. A room of unnameable shapes scores low however
   beautifully it is lit.
2. **Is each thing built the way that thing is built?** A staircase has treads
   and risers of one repeated size, a stringer carrying them, balusters at a
   regular pitch, a handrail parallel to the rake. A roof has a ridge, straight
   eaves, courses, and a hard edge against the sky. A bookcase has boards with
   thickness and uprights. Shapes that merely gesture at the object fail here.
3. **Is the SCALE right?** Use what you can measure by eye against a known
   thing: a door is about 2 m, so a chair back is about half a door, a
   headstone about a third to a half, a brick course about a thirteenth of a
   metre, a maze hedge a little under a door. A room where one object is at the
   wrong size makes every other object in it suspect.
4. **Are the lines straight, and the rhythms regular?** A line that should be
   straight must be straight for its whole length; a regular run must be
   regular. **But this is a decayed house** — a leaning headstone, a cracked
   arch, a missing paling and a sagging gutter are all correct, and all still
   DRAWN. Judge whether you can tell the difference between a thing that is
   deliberately bent and a thing that is badly drawn.
5. **Does it hold at 1:1?** Open the capture at full size. Surfaces that read at
   thumbnail size and fall apart up close are the render tell.
6. **Can you see the objects at all?** A room so dark that its contents are
   guesswork fails question 1 by another route.

## HOW THE EIGHT FIELDS ARE SCORED THIS ROUND

- **`ornament`** — the density and QUALITY of drawn detail. Not how much noise
  is on a surface: how much of it is a thing a hand put there deliberately, and
  drawn correctly. A wall of accurate coursed ashlar scores above a wall of
  ornate nonsense.
- **`palette`** — **does the colour suit the SETTING**: a decayed Victorian
  house at night, this region being what it is. **Not** whether it matches
  `UI/*.png`. A green glasshouse, a plum ballroom and a magenta passage are all
  legitimate. Score this low only for colour that fights the setting or that
  stops you seeing the objects.
- **`typography`** — not this round's work; identical in every candidate. Score
  it the same for all of them.
- **`material`** — does stone read as stone, timber as timber, glass as glass,
  cloth as cloth, at the right grain size for the distance.
- **`background`** — the room AS A DEPICTION: is it a place, accurately drawn,
  that you could describe to someone who had not seen it.
- **`composition`** — including **perspective and scale correctness**: do the
  planes meet, does the floor recede consistently, are objects the right size
  relative to each other and to the room.
- **`readability`** — on `combat`, `combat-boss` and `rest`, whether the board
  and its type still read against the room. On the three bare rooms, whether the
  objects are legible.
- **`coherence`** — does the whole read as one built place, lit by one set of
  lights, rather than as several good surfaces next to each other.

## `fits_between_samples`

**Re-read this field for round 9.** It no longer asks whether the room could
hang beside `mainMenu.png` as a colour match. It asks:

> **Is this a careful, accurate drawing of a real place — good enough that a
> viewer would take it for a painted background rather than a render?**

Colour is not part of that judgment. Accuracy, legibility and care are all of it.

## `worst_problem`

Name the most specific thing you can see, on the capture where you see it, and
say where on the screen it is. **Prefer the accuracy failures**: name the object,
say what is wrong with how it is built or sized, and say what it currently reads
as instead. "The balustrade's balusters are spaced wider than they are tall, so
the landing rail reads as a row of posts rather than a balustrade" is worth ten
of "the background is flat", which has been written eight times.

## What these six captures are

- **`room-foyer`, `room-crypt`, `room-graveyard`** — a room photographed on its
  own: no HUD, no board, no cards, no creature. **Judge these as drawings.**
  They are the round's subject.
- **`combat`, `combat-boss`** — a real fight, so you are judging whether the
  room survives having a board in front of it: whether it still reads as a place
  and whether it sits behind the fight instead of competing with it.
- **`rest`** — a board, and a different room entirely (the boards' background is
  a separate system from combat's). Judge it as a papered wall behind a plate.

## Things that are NOT differences any builder made

- **The prop ARRANGEMENT may differ.** Furniture is placed procedurally per
  region, so a builder who changed a room's proportions gets a different
  arrangement. Judge the props themselves — silhouette, construction, size,
  surface — not which corner one landed in.
- **The creatures are animated** and will be on a different frame in every
  candidate. Do not score them.
- **The HUD, cards, plates and type** are identical in every candidate.
- **There is no background art in this game and none is coming.** You are not
  being asked whether a painting would be better, and not whether this matches
  the paintings' colour. You are being asked how accurately and carefully
  procedure has drawn the room.
