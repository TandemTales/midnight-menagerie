# Background paintings — prompt pack

Every background in the game should sit at the level of `UI/mainMenu.png`: a full
painting, not a gradient. The Title already is one. This is the list of the rest,
in the order they are seen most.

## Delivering

- Drop each painting in **`animations/backgrounds/`** under the exact filename in
  the tables below (lowercase, hyphenated). The build picks them up by name, the
  way it picks up enemy stills from `animations/sprites/enemies/`.
- **16:9, as large as the generator allows** — 2560x1440 ideal, 1920x1080 minimum.
  `mainMenu.png` is 1672x941 and that is the floor, not the target.
- PNG. No transparency needed.
- A file can be replaced at any time; the newest one wins.

## The style block — paste this into every prompt

> Detailed painterly storybook illustration of a haunted Victorian gothic mansion
> interior, cute-spooky, the same art style as a dark fantasy card game's main
> menu: deep indigo and aubergine shadows, muted stone and dark wood, antique
> brass and gold accents, small warm pools of candle and lantern light against
> cold blue moonlight, ivy and cobwebs, fine hand-painted texture with a subtle
> grain, crisp readable silhouettes, eye-level camera, wide 16:9 composition, no
> people, no animals, no creatures, no text, no UI, no border, no vignette.

The last line matters. The game draws the creatures, the Kid, the Companion, the
frames and the vignette on top; anything baked into the painting fights them.

## Where the game draws on top of a combat room

Measured off the live combat screen, as fractions of the painting:

| zone | where | keep it |
|---|---|---|
| top bar | top 6% | dark, plain — the HUD sits here |
| intents | 10–40% down, middle and right | quiet: dim back wall, no bright windows or light sources |
| the creatures | 30–90% across, standing on a floor line at **45–55% down** | an open floor with clear space in front of the back wall; no furniture in the middle of that band |
| the Kid | 5–22% across, standing at ~55% down | open floor on the left, a little light falling there |
| the hand of cards | bottom 35% | anything — it is covered |

So: **a room seen from eye level, back wall across the upper half, open floor from
the middle of the picture down, the most interesting set dressing at the far left
and right edges.** One warm light source near the left (the Kid's side) and cold
moonlight from the right is the lighting the game already assumes.

## 1. Combat rooms — one per wing (17)

Each prompt below goes after the style block.

| file | wing | prompt |
|---|---|---|
| `combat-foyer.png` | The Forgotten Foyer | a grand forgotten entrance hall: faded red carpet runner, dusty coat racks heavy with old coats, a brass service bell on a side table, a sweeping staircase in the background, portraits in gilded frames, dust drifting in moonlight |
| `combat-nursery.png` | The Forgotten Nursery | an abandoned Victorian nursery: rocking horse and toy chest pushed to the edges, porcelain dolls on shelves, patchwork quilts, a jack-in-the-box, faded star-and-moon wallpaper, a single nightlight |
| `combat-sleeping.png` | The Sleeping Quarters | a dim bedroom corridor of canopy beds and tall wardrobes with doors slightly ajar, rumpled blankets on the floor, a guttering nightlight, deep shadows under the beds |
| `combat-kitchens.png` | The Kitchens and Cellars | a cavernous old mansion kitchen stepping down into a cellar: iron ovens with a faint ember glow, copper pots, jam jars and candy jars on shelves, a flour-dusted table at the side, barrels in the cellar arch |
| `combat-greenhouse.png` | The Impossible Greenhouse | an impossibly large Victorian glass conservatory at night: iron-framed glass ceiling, overgrown carnivorous plants and potted ferns crowding the edges, vines through broken panes, moonlight through the glass |
| `combat-graveyard.png` | The Mansion Graveyard | the mansion's private graveyard at night seen from a gravel path: leaning headstones and a small mausoleum at the edges, iron fence, mist along the ground, a lantern on a post |
| `combat-study.png` | The Grand Study and Library | a two-storey mansion library: towering bookshelves with rolling ladders, loose index cards and open books scattered, a green-shaded reading lamp, a globe, candlelight on leather spines |
| `combat-attic.png` | The Moonlit Attic and Observatory | a steep-roofed attic that opens into an observatory: exposed rafters thick with cobwebs, old trunks, star charts pinned to beams, a brass telescope under an open roof hatch full of stars |
| `combat-lampworks.png` | The Lampworks | the mansion's lamp workshop: rows of hanging oil lamps burning with blue flame, gas pipes along the walls, a huge unlit chandelier overhead, workbenches of glass chimneys at the edges |
| `combat-ballroom.png` | The Ballroom and Velvet Suites | a beautiful candlelit ballroom: crystal chandeliers, velvet curtains, a banquet table of cakes and silver trays at the side, masks left on chairs, a polished dance floor reflecting the lights |
| `combat-crypt.png` | The Crypt and Ossuary | a vaulted stone crypt: arched niches of neatly stacked skulls and bones, funeral urns, a sarcophagus at the side, candles melted onto stone ledges |
| `combat-hedge.png` | The Withered Hedge Maze | a withered moonlit hedge maze: dying hedge walls, broken topiary animals, mushrooms growing from rot, a scarecrow at the edge, fallen leaves over the path |
| `combat-passages.png` | The Secret Passages | a narrow hidden passage inside the mansion's walls: bare timber and brick, a peephole in a painting seen from behind, a dumbwaiter shaft, speaking tubes, a single candle in a wall sconce |
| `combat-bathhouse.png` | The Bathhouse and Rain Wing | an ornate tiled Victorian bathhouse where it rains indoors: a sunken bath, clawfoot tubs, steam, dripping brass pipes, puddles on patterned tiles, a storm through tall windows |
| `combat-kennels.png` | The Kennels and Animal Ward | a warm but eerie mansion kennel ward: rows of wooden kennel pens with blankets and food bowls, leashes and collars on hooks, straw, a lantern, a soft protective atmosphere |
| `combat-pumpkin.png` | The Moon Courtyard and Pumpkin Grounds | a moonlit walled courtyard pumpkin patch: huge ripening pumpkins and curling vines at the edges, a scarecrow, a wooden harvest cart, a full moon over the wall |
| `combat-heart.png` | The Heart of the House | the quiet innermost room of the mansion: cleaner and warmer than anywhere else, shelves of carefully kept belongings from every wing, a hearth, soft golden light — peaceful and faintly wrong |

## 2. The other screens

| file | screen | prompt |
|---|---|---|
| `map.png` | The floor-plan map | a candlelit study desk seen from above at a slight angle: dark wood surface, brass instruments, a candle, cobwebs in the corners, an ink pot and quill at the edges — **the centre 80% must be empty desk**, the game lays the floor plan there |
| `rest.png` | The Safe Room | a blanket fort built inside a mansion room: a table and chairs draped with quilts, cushions, a lantern glowing inside, a wedged door — the fort sits **left of centre**, the right half is a dim quiet wall |
| `shop.png` | Mr. Moth's Midnight Market | a moth merchant's cabinet-stall set up in a mansion corridor: glass-fronted cabinets of buttons, keys, marbles, teeth and trinkets, jars, price tags on string, a hanging lantern — **no shopkeeper**, stall at the edges, open middle |
| `event.png` | A Curiosity | an eerie quiet mansion portrait hall: rows of gilded family portraits, a velvet bench, a single lectern, candlelight — **the centre third is a plain dim wall**, the story panel sits there |
| `reward.png` | After a fight | an emptied mansion room after a scuffle: an old treasure chest glowing softly at centre-bottom, scattered buttons and candy, dust settling in moonlight |
| `gameover.png` | The candle goes out | a moonlit windowsill with a single snuffed candle trailing a thread of smoke, a child's backpack left on the floor, cold blue light — melancholy, quiet |
| `lobby.png` | The Treehouse | inside a kids' treehouse at night: plank walls, a rope ladder hatch, string lights and a lantern, comics and snacks, a window onto the mansion in the distance |
| `clubhouse.png` | Neighbourhood Headquarters | a kids' clubhouse at night: wooden walls, a cork investigation board, polaroids and red string, string lights, a snack shelf — cosy, same painted style, warmer than the mansion |

## Priority

1. `combat-foyer.png`, `combat-nursery.png`, `combat-sleeping.png` — the first three wings, seen every run.
2. `map.png`, `rest.png`, `shop.png`, `event.png`, `reward.png` — every run too.
3. The other fourteen combat rooms.
4. `gameover.png`, `lobby.png`, `clubhouse.png`.
