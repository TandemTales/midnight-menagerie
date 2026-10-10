# The house's family portraits — prompt pack

Josh, 2026-10-09: *"there shouldn't be pictures of pets when it doesn't pertain
specifically to their role/room ... if there are pictures to be hung, just make
a haunted house portrait that would fit in this place, maybe a painting of the
previous owner and her cat from 200 years ago."*

So the reward alcove, an event's hall, the rest fort and game over hang the
family who lived in the house, each with an ORDINARY pet: the design's Drawing
Room clue is that "family photographs and sketches contain recurring household
cats" (`docs/design/01-mansion-structure.md`). The pets in these paintings are
plain animals, never one of the sixteen Companions. Each hangs in the Kid
board's carved gilt frame with a brass nameplate the game letters itself.

## Delivering

- Save each painting as **`art/portraits/<id>.png`**, with `<id>` from the table.
- Portrait orientation, **4:5**, as large as the generator allows (1600x2000
  ideal, 864x1080 minimum). The prep crops to 4:5 from the centre, keeping more
  of the head than the foot.
- Then tell Claude, or run `python tools/prep_ui_kit.py --only residents` and set
  `ready: true` for that id in `game/src/ui/hang.js` (RESIDENTS). Until a
  portrait is ready, the house's own picture hangs in its place.
- A file can be replaced at any time; run the prep again.

## The style block — paste this into every prompt

> An antique oil portrait painting from the early 1800s, hanging in a haunted
> Victorian gothic mansion, painted in the same storybook style as a cute-spooky
> dark fantasy card game: deep indigo and aubergine shadows, muted dark wood and
> stone, antique brass and gold accents, warm candlelight on the faces against
> cold blue moonlight, fine hand-painted texture with craquelure and a slightly
> darkened varnish, crisp readable silhouettes, slightly eerie but gentle (the
> eyes may seem to follow you), 4:5 portrait composition, the sitter and the pet
> filling the canvas, plain dark painted background, no frame, no text, no
> signature, no border.

The "no frame" line matters: the game draws the gilt frame and the nameplate.

## The six portraits

| id | nameplate | add to the style block |
|---|---|---|
| `lady` | The Lady of the House · and her cat, 1826 | A dignified young woman in an 1820s high-waisted dark plum gown and a cameo brooch, seated in a carved chair, holding a sleek ordinary black cat with green eyes in her lap; her hand rests on the cat; a single candle beside her. **This is the one Josh asked for: paint it first.** |
| `master` | The Master of the House · and his hound, 1824 | A stern gentleman in a dark tailcoat, cravat and waistcoat, standing with one hand on a walking cane, a lean grey wolfhound sitting at his side looking out of the painting; a ring of keys at his belt. |
| `dowager` | The Dowager · and her parrot, 1811 | An elderly lady in black mourning silk and a lace cap, sitting very upright, a grey parrot perched on the back of her chair; spectacles on a chain; a knowing half-smile. |
| `children` | The Children · and the nursery rabbit, 1838 | A boy and a girl of about eight and ten in 1830s nursery clothes, standing close together, the girl holding a white lop-eared rabbit; a rocking horse half-seen in the shadow behind them; solemn faces. |
| `gardener` | The Gardener · and the stable cat, 1833 | A weathered gardener in a waistcoat with rolled sleeves and a battered hat, holding a trowel and a pot of white flowers, an ordinary orange tabby cat curled on a potting bench beside him. |
| `scholar` | The Younger Son · and his tortoise, 1849 | A thin young man with ink-stained fingers, in a dark frock coat, seated at a desk stacked with books and a brass telescope, a small tortoise on the open pages in front of him; candlelight from below. |

Names are deliberately places in the house, not a surname: the family is not
named anywhere in the design. Rename any of them in `game/src/ui/hang.js`.

## Where each hangs

| board | left | right |
|---|---|---|
| Reward (after a fight) | `lady` | `master` |
| Event (the house's hall) | `dowager` | `children` |
| Rest (the blanket fort) | `gardener` | `scholar` |
| Game over | (the mansion) | `lady` |
