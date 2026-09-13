/**
 * The Safe Room — a Blanket Fort.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §24.  The kids find a
 * defensible room, barricade the door, drag the furniture together and put
 * blankets over the table.  Dangerous supernatural mansion outside; warm
 * flashlight-lit fort inside.  That contrast is the whole screen.
 *
 * STS2-REFERENCE §6: "Rest site: heal ~30% or upgrade a card — StS2 adds Forge:
 * permanently upgrade a relic (+1 tier) at a max-HP cost."  So four doors, one
 * choice:
 *
 *   Rest    recover 30% of maximum Courage, stated as an exact before → after
 *   Sharpen upgrade a Trick, previewed on the real card
 *   Forge   +1 tier on a Keepsake, paid in maximum Courage, with before/after
 *   Sit     free: a Clue, and a line from your Companion you have not heard
 *
 * Sitting exists because a Safe Room that is only two numbers is not a Safe
 * Room.  It is deliberately the weakest mechanical option and the best one to
 * take when you are already healthy.
 */
import { bus } from '../core/bus.js';
import { TERMS, NodeType, COMPANIONS } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { plural } from '../util/plural.js';
import { relicSigil } from '../data/relics.js';
import { RoomScene, esc } from './reward.js';
import { act, ACT, deckIndex } from '../net/actions.js';
import { INPUT } from '../net/session.js';
import { el, ensureCss, rovingFocus } from '../ui/portrait.js';
import { ClipPlayer } from '../ui/sprite.js';

/* WHO STANDS WHERE IN THE FORT, in FORT_SVG viewBox units. Both figures are
   anchored at their feet on the floor line the drawing already has, in the spots
   it already leaves for them, and `h` is how tall each one stands there.

   THE HEIGHTS COME FROM THE DRAWING, NOT FROM COMBAT. The flat kid is 56 units
   to the top of her head and the flat pet 29 including ears -- a ratio near 1.9,
   where the Scuffle screen uses 3.3. That is not an inconsistency to correct:
   this is a small warm scene with the two of them nestled together, drawn that
   way on purpose, and matching the glyphs keeps the composition the art was made
   for. She also ends up facing the Companion, because the Kid stills face right
   and the pet sits to her right.

   `unit` (ui/sprite.js) divides out whether a frame came from an atlas or a
   still, so both arrive at the height asked for either way. */
const FORT_CAST = [
  { who: 'kid', x: 180, y: 248, h: 56, warm: ['idle'] },
  { who: 'pet', x: 246, y: 248, h: 26, warm: ['idle', 'affection'] },
];

const CSS_REST = new URL('./rest.css', import.meta.url).href;

/** What your Companion says when you sit down with them. */
const COMPANION_TALK = {
  marmalade: [
    'She tells you the stair by the west landing is warm at eleven in the morning, and has been for fifty years, and she does not know why she knows that.',
    'She lets you check her ear, which she has never done. There is a notch in it. She says a door did that. She will not say which door.',
    'She sits with her back to you facing the door, which you eventually understand is not rudeness. It is a watch.',
  ],
  bones: [
    'He brings you a bone that is definitely part of him, and is extremely proud, and will not take it back.',
    'He does not remember his name. He remembers the sound of a gate and somebody running, and he is certain the running was towards him.',
    'He falls asleep upside down against your leg and twitches like he is chasing something. You hope he catches it.',
  ],
  pipkin: [
    'She hums. The pumpkin resonates. It is genuinely the nicest sound in the building.',
    'She has been collecting seeds in her hollow. She shows you all of them. It takes a while.',
    'She asks, in the way frogs ask, whether outside is still there. You say yes. She sits with that.',
  ],
  taffy: [
    'He very carefully makes himself the exact shape of a mug so you have something to hold.',
    'He remembers being made. He does not remember being alive before that, and he has decided this is fine, and mostly it is.',
    'He is trying to learn to whistle. He does not have a mouth. He is undeterred.',
  ],
  wink: [
    'She watches the door with four eyes and you with two, which is the most tactful thing anyone has done for you all night.',
    'She has been mapping the wall cavities in web. She has done nine rooms. Nine rooms that are not on the blueprint.',
    'She blinks slowly at you, one eye at a time, all the way round. Your Companion is telling you she is glad you came.',
  ],
};
const GENERIC_TALK = [
  'They lean against you and go quiet, and for eleven minutes nothing in the house is frightening.',
  'They show you something they have been carrying since before you met. You do not know what it is. You say it is very good.',
  'They fall asleep. You keep watch. It is the first time all night that somebody else has been the one resting.',
];

/* THE FORT, IN TWO LAYERS, both on the same 420x280 grid.
 *
 * `.rs-fort__paint` is the room and the fort: wall, barricaded door, moonlit
 * window, rug, the quilts with their patches and folds, the lamplit way in.
 * Painted with gradients and one woven-cloth texture filter, and NOTHING in it
 * moves — a turbulence filter re-rasters every time anything inside the same
 * SVG changes, and the two figures change every frame.
 *
 * `.rs-fort` is what lives: the lamp's flame and its pool of light, the flat
 * stand-ins and the real Kid and Companion. Its classes, ids and coordinates
 * are the ones `_mountFort` and tests/sprites/clips.py read, unchanged.
 *
 * When Josh's painting arrives (`rest.png`, the fort left of centre) the board
 * shows it behind this panel; rest.css then lifts the painted layer away and
 * leaves the frame, the lamp and the two of them standing in front of it. */
const KIT_ART = new URL('../../assets/ui/kit/', import.meta.url).href;

const FORT_PAINT = `
<svg class="rs-fort__paint" viewBox="0 0 420 280" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="rsWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-wall-a"/><stop offset=".6" class="rs-wall-b"/><stop offset="1" class="rs-wall-c"/>
    </linearGradient>
    <radialGradient id="rsMoonWash" cx="90%" cy="16%" r="64%">
      <stop offset="0" class="rs-moon-a"/><stop offset="1" class="rs-moon-z"/>
    </radialGradient>
    <radialGradient id="rsWarmWash" cx="50%" cy="80%" r="50%">
      <stop offset="0" class="rs-warm-a"/><stop offset="1" class="rs-warm-z"/>
    </radialGradient>
    <linearGradient id="rsGlass" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0" class="rs-glass-a"/><stop offset="1" class="rs-glass-b"/>
    </linearGradient>
    <linearGradient id="rsShaft" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-shaft-a"/><stop offset="1" class="rs-shaft-z"/>
    </linearGradient>
    <linearGradient id="rsWood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" class="rs-wood-a"/><stop offset=".55" class="rs-wood-b"/><stop offset="1" class="rs-wood-a"/>
    </linearGradient>
    <linearGradient id="rsPlank" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-plank-a"/><stop offset=".5" class="rs-plank-b"/><stop offset="1" class="rs-plank-c"/>
    </linearGradient>
    <linearGradient id="rsFloorG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-floor-a"/><stop offset="1" class="rs-floor-b"/>
    </linearGradient>
    <radialGradient id="rsRugG" cx="50%" cy="35%" r="70%">
      <stop offset="0" class="rs-rug-a"/><stop offset="1" class="rs-rug-b"/>
    </radialGradient>
    <linearGradient id="rsQuilt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-quilt-a"/><stop offset=".45" class="rs-quilt-b"/><stop offset="1" class="rs-quilt-c"/>
    </linearGradient>
    <linearGradient id="rsThrow" x1="0" y1=".3" x2="1" y2="0">
      <stop offset="0" class="rs-throw-a"/><stop offset=".5" class="rs-throw-b"/><stop offset="1" class="rs-throw-c"/>
    </linearGradient>
    <linearGradient id="rsDrapeG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-drape-a"/><stop offset="1" class="rs-drape-b"/>
    </linearGradient>
    <linearGradient id="rsSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" class="rs-side-a"/><stop offset=".3" class="rs-side-z"/>
      <stop offset=".8" class="rs-side-z"/><stop offset="1" class="rs-side-b"/>
    </linearGradient>
    <linearGradient id="rsFoot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="rs-foot-z"/><stop offset="1" class="rs-foot-a"/>
    </linearGradient>
    <radialGradient id="rsInner" cx="50%" cy="100%" r="100%">
      <stop offset="0" class="rs-in-a"/><stop offset=".42" class="rs-in-m"/><stop offset="1" class="rs-in-b"/>
    </radialGradient>
    <radialGradient id="rsVelvet" cx="36%" cy="26%" r="84%">
      <stop offset="0" class="rs-vel-a"/><stop offset="1" class="rs-vel-b"/>
    </radialGradient>
    <linearGradient id="rsGilt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" class="rs-gilt-a"/><stop offset=".5" class="rs-gilt-b"/><stop offset="1" class="rs-gilt-c"/>
    </linearGradient>
    <radialGradient id="rsVig" cx="50%" cy="58%" r="76%">
      <stop offset=".5" class="rs-vig-a"/><stop offset="1" class="rs-vig-b"/>
    </radialGradient>
    <pattern id="rsDamask" width="46" height="52" patternUnits="userSpaceOnUse">
      <image href="${KIT_ART}damask.webp" width="46" height="52" preserveAspectRatio="none"/>
    </pattern>

    <!-- old plaster: slow fractal noise multiplied into the wall -->
    <filter id="rsPlaster" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".04 .055" numOctaves="4" seed="5" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 .75 .38  0 0 0 .75 .38  0 0 0 .75 .38  0 0 0 0 1" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="multiply" result="b"/>
      <feComposite in="b" in2="SourceGraphic" operator="in"/>
    </filter>
    <!-- cloth: edges that wander the way a brush does, then a weave along the weft -->
    <filter id="rsCloth" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.1 .3" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 .5 .5  0 0 0 .5 .5  0 0 0 .5 .5  0 0 0 0 1" result="g"/>
      <feBlend in="d" in2="g" mode="multiply" result="b"/>
      <feComposite in="b" in2="d" operator="in"/>
    </filter>
    <!-- the whole picture, as if brushed: edges that wander, and the tooth of
         the canvas multiplied into everything -->
    <filter id="rsPaint" filterUnits="userSpaceOnUse" x="-24" y="-24" width="468" height="328" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".024" numOctaves="3" seed="8" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="3.4" xChannelSelector="R" yChannelSelector="B" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency=".55 .75" numOctaves="3" seed="3" result="c"/>
      <feColorMatrix in="c" type="matrix"
        values="0 0 0 .34 .68  0 0 0 .34 .68  0 0 0 .34 .68  0 0 0 0 1" result="cg"/>
      <feBlend in="d" in2="cg" mode="multiply"/>
    </filter>
    <filter id="rsBlur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="rsBlur4" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="rsBlur8" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>

    <clipPath id="rsClipFront">
      <path d="M58 257C66 214 84 168 102 128c68-6 148-6 218-2 6 44 10 88 14 131-7 4-18-3-26 1s-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-14-3-18-1Z"/>
    </clipPath>
    <clipPath id="rsClipThrow">
      <path d="M290 134c16-16 38-32 66-38 14-2 22 8 25 24 6 44 14 88 22 137-10 5-22-5-32 1s-20-4-30 0-20-4-30 0c-4-42-6-84-21-124Z"/>
    </clipPath>
  </defs>

  <g filter="url(#rsPaint)">
  <!-- the room: damask plaster, a dado rail, and moonlight coming in from the right -->
  <g filter="url(#rsPlaster)">
    <rect x="-24" y="-24" width="468" height="281" fill="url(#rsWall)"/>
    <path class="rs-wains" d="M-24 178h468v79H-24Z"/>
  </g>
  <rect width="420" height="178" fill="url(#rsDamask)" class="rs-damask"/>
  <path class="rs-rail" d="M0 178h420"/>
  <path class="rs-rail rs-rail--lo" d="M0 181.5h420"/>
  <rect width="420" height="257" fill="url(#rsMoonWash)"/>
  <ellipse class="rs-wallglow" cx="206" cy="170" rx="150" ry="74" filter="url(#rsBlur8)"/>

  <!-- a portrait of the house, hung where the kids could not reach to take it down -->
  <rect class="rs-picframe" x="186" y="22" width="48" height="58" rx="2" fill="url(#rsGilt)"/>
  <image href="${KIT_ART}hall-towers.webp" x="192" y="28" width="36" height="46" preserveAspectRatio="xMidYMid slice" class="rs-pic"/>
  <rect class="rs-picedge" x="192" y="28" width="36" height="46"/>

  <!-- the window the moon comes through, and what it lays across the room -->
  <path class="rs-winframe" d="M350 110V46c0-23 13-35 30-35s30 12 30 35v64Z"/>
  <path d="M357 106V48c0-18 10-29 23-29s23 11 23 29v58Z" fill="url(#rsGlass)"/>
  <circle class="rs-moonglow" cx="391" cy="40" r="15" filter="url(#rsBlur4)"/>
  <circle class="rs-moondisc" cx="391" cy="40" r="7"/>
  <g class="rs-stars"><circle cx="365" cy="36" r=".9"/><circle cx="371" cy="74" r=".7"/><circle cx="395" cy="84" r=".8"/><circle cx="362" cy="94" r=".6"/><circle cx="386" cy="60" r=".6"/></g>
  <path class="rs-mullion" d="M380 19v87M357 60h46"/>
  <path class="rs-winsill" d="M344 108h72v7h-72Z"/>
  <path d="M362 40 404 40 322 257 190 257Z" fill="url(#rsShaft)" filter="url(#rsBlur8)"/>
  <path class="rs-moonbeam" d="M370 46 398 46 300 257 226 257Z" filter="url(#rsBlur4)"/>

  <!-- the door they wedged: panelled, boarded across, still shut -->
  <path class="rs-doorframe" d="M4 58h80v199H4Z"/>
  <path d="M10 64h68v193H10Z" fill="url(#rsWood)"/>
  <path class="rs-doorpanel" d="M17 74h23v74H17ZM47 74h23v74H47ZM17 160h23v88H17ZM47 160h23v88H47Z"/>
  <circle class="rs-doorknob" cx="72" cy="166" r="3.2"/>
  <g class="rs-plank">
    <rect x="2" y="98" width="84" height="10" rx="1.5" fill="url(#rsPlank)" transform="rotate(-9 44 103)"/>
    <rect x="3" y="142" width="82" height="10" rx="1.5" fill="url(#rsPlank)" transform="rotate(6 44 147)"/>
    <rect x="1" y="192" width="84" height="10" rx="1.5" fill="url(#rsPlank)" transform="rotate(-5 43 197)"/>
  </g>
  <path class="rs-grain" d="M6 104c24-3 50-7 78-11M8 146c26 2 50 5 76 9M4 196c26-1 52-3 80-6"/>
  <g class="rs-nail">
    <circle cx="9" cy="109" r="1.3"/><circle cx="79" cy="98" r="1.3"/>
    <circle cx="9" cy="143" r="1.3"/><circle cx="79" cy="150" r="1.3"/>
    <circle cx="7" cy="200" r="1.3"/><circle cx="79" cy="194" r="1.3"/>
  </g>

  <!-- floorboards, and the rug the fort was built on -->
  <path d="M-24 257h468v47H-24Z" fill="url(#rsFloorG)"/>
  <path class="rs-floor" d="M0 266h420M0 274h420"/>
  <g filter="url(#rsCloth)">
    <ellipse cx="218" cy="265" rx="194" ry="13" fill="url(#rsRugG)"/>
    <ellipse class="rs-rugrim" cx="218" cy="265" rx="184" ry="10"/>
    <ellipse class="rs-rugrim rs-rugrim--in" cx="218" cy="265" rx="176" ry="8"/>
  </g>
  <ellipse class="rs-shadow" cx="230" cy="258" rx="178" ry="7" filter="url(#rsBlur4)"/>
  <ellipse class="rs-spill" cx="212" cy="266" rx="120" ry="15" filter="url(#rsBlur8)"/>
  <!-- where the moonbeam lands: a cold patch on the rug's far side -->
  <ellipse class="rs-moonpool" cx="266" cy="263" rx="62" ry="9" filter="url(#rsBlur4)"/>

  <!-- the chair the second blanket hangs off -->
  <g class="rs-chair">
    <path d="M324 96h6v40h-6ZM352 96h6v30h-6Z"/>
    <path d="M320 98h42v6h-42Z"/>
    <circle cx="327" cy="94" r="3.4"/><circle cx="355" cy="94" r="3.4"/>
  </g>

  <!-- the fort's flag, and the bunting strung from it to the chair -->
  <path class="rs-pole" d="M104 132 91 34"/>
  <circle class="rs-polecap" cx="91" cy="32" r="2.6"/>
  <path class="rs-pennant" d="M93 38 138 49 95 62Z"/>
  <path class="rs-pennant-star" d="M108 46l1.4 2.9 3.1.4-2.3 2.1.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.1 3.1-.4Z"/>
  <path class="rs-string" d="M94 44C170 98 282 108 354 98"/>
  <g class="rs-bunting">
    <path class="rs-bunt rs-bunt--gold"   d="M125 64h11l-5.5 12Z"/>
    <path class="rs-bunt rs-bunt--violet" d="M165 79h11l-5.5 12Z"/>
    <path class="rs-bunt rs-bunt--rose"   d="M206 89h11l-5.5 12Z"/>
    <path class="rs-bunt rs-bunt--gold"   d="M247 95h11l-5.5 12Z"/>
    <path class="rs-bunt rs-bunt--violet" d="M287 98h11l-5.5 12Z"/>
    <path class="rs-bunt rs-bunt--rose"   d="M320 99h11l-5.5 12Z"/>
  </g>

  <!-- THE FORT: the quilt over the front, the throw off the chair, the drape
       over the table top; patchwork, folds and stitching, all in one cloth -->
  <g filter="url(#rsCloth)">
    <path d="M58 257C66 214 84 168 102 128c68-6 148-6 218-2 6 44 10 88 14 131-7 4-18-3-26 1s-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-18-4-26 0-14-3-18-1Z" fill="url(#rsQuilt)"/>
    <g clip-path="url(#rsClipFront)">
      <path class="rs-patch rs-patch--rose"   d="M108 170l30-3 3 36-32 3Z"/>
      <path class="rs-patch rs-patch--ochre"  d="M78 214l34 1-1 44-38-1Z"/>
      <path class="rs-patch rs-patch--indigo" d="M280 168l30 2-1 40-30-2Z"/>
      <path class="rs-patch rs-patch--rose"   d="M284 222l34 1 4 36-36-1Z"/>
      <path class="rs-stitchbox" d="M108 170l30-3 3 36-32 3ZM78 214l34 1-1 44-38-1ZM280 168l30 2-1 40-30-2ZM284 222l34 1 4 36-36-1Z"/>
      <path class="rs-stitch" d="M70 196c40-8 220-10 262-4M64 236c46-6 226-8 272-2"/>
      <path class="rs-fold" d="M118 158c-2 36-4 68-8 100M288 160c1 34 2 66 4 98M102 132c-6 44-12 86-16 126" filter="url(#rsBlur2)"/>
      <path class="rs-foldlit" d="M128 158c-1 36-2 68-4 100M296 160c1 34 3 66 6 98M100 134c-12 42-24 82-34 122" filter="url(#rsBlur2)"/>
      <rect x="50" y="120" width="290" height="140" fill="url(#rsSide)"/>
      <rect x="50" y="228" width="290" height="32" fill="url(#rsFoot)"/>
    </g>

    <path d="M290 134c16-16 38-32 66-38 14-2 22 8 25 24 6 44 14 88 22 137-10 5-22-5-32 1s-20-4-30 0-20-4-30 0c-4-42-6-84-21-124Z" fill="url(#rsThrow)"/>
    <g clip-path="url(#rsClipThrow)">
      <path class="rs-fold" d="M362 104c4 52 10 104 16 154M334 112c2 48 4 96 8 146" filter="url(#rsBlur2)"/>
      <path class="rs-foldlit" d="M378 110c6 50 12 98 20 148M348 108c3 50 6 100 10 150" filter="url(#rsBlur2)"/>
      <path class="rs-throwstripe" d="M296 238c34-3 74-3 110 2M296 245c34-3 74-3 110 2"/>
      <rect x="280" y="228" width="140" height="32" fill="url(#rsFoot)"/>
    </g>
    <path class="rs-moonrim" d="M300 128c14-14 34-28 56-32 12-2 20 8 24 22 6 44 12 88 20 136" filter="url(#rsBlur2)"/>

    <path d="M94 132c56-14 156-16 212-4-4 10-8 22-14 30-6-10-16-10-24 2-8-12-18-12-26 0-8-12-18-12-26 0-8-12-18-12-26 0-8-12-18-12-26 0-8-12-18-12-26 0-8-12-18-12-26 0-8-12-18-12-26 2-8-8-14-16-18-26Z" fill="url(#rsDrapeG)"/>
    <path class="rs-drapehem" d="M94 132c4 10 10 18 18 26 8-14 18-14 26 2 8-12 18-12 26 0 8-12 18-12 26 0 8-12 18-12 26 0 8-12 18-12 26 0 8-12 18-12 26 0 8-12 18-12 24-2 6-8 10-20 14-30"/>
    <path class="rs-drapelit" d="M100 130c56-12 150-14 204-4" filter="url(#rsBlur2)"/>
  </g>
  <g class="rs-tassel">
    <path d="M112 158v6M138 160v6M164 160v6M190 160v6M216 160v6M242 160v6M268 160v6M292 158v6"/>
    <circle cx="112" cy="165" r="1.6"/><circle cx="138" cy="167" r="1.6"/><circle cx="164" cy="167" r="1.6"/>
    <circle cx="190" cy="167" r="1.6"/><circle cx="216" cy="167" r="1.6"/><circle cx="242" cy="167" r="1.6"/>
    <circle cx="268" cy="167" r="1.6"/><circle cx="292" cy="165" r="1.6"/>
  </g>

  <!-- the lamp's warmth on the cloth round the way in -->
  <path d="M50 120h360v140H50Z" fill="url(#rsWarmWash)" clip-path="url(#rsClipFront)"/>

  <!-- the way in: a flap tied back, lamplight on everything inside -->
  <path d="M146 257v-47c0-31 27-46 64-46s64 15 64 46v47Z" fill="url(#rsInner)"/>
  <path class="rs-archshade" d="M154 220c0-28 22-46 56-46s56 18 56 46" filter="url(#rsBlur4)"/>
  <g class="rs-inside">
    <path class="rs-inpillow" d="M150 257c-2-14 4-26 16-28 12-2 24 4 28 16 2 6 0 12-2 12Z"/>
    <path class="rs-inpillow rs-inpillow--b" d="M268 257c3-16-3-28-17-30-13-2-24 6-27 18-1 6 1 12 3 12Z"/>
    <path class="rs-inblanket" d="M186 257c4-8 12-12 24-12s22 4 26 12Z"/>
  </g>
  <path class="rs-flap" d="M146 257c-5-22-6-50 4-72 6-12 14-18 22-18-8 28-10 62 4 90Z"/>
  <path class="rs-flaplit" d="M172 167c-8 28-10 62 4 90"/>
  <path class="rs-tie" d="M147 213c6 4 14 4 20 0"/><circle class="rs-knot" cx="168" cy="213" r="2.4"/>
  <path class="rs-archline" d="M184 165c8-1 17-1 26-1 37 0 64 15 64 46v47"/>

  <!-- floor cushions either side of the way in -->
  <g class="rs-cushions" filter="url(#rsCloth)">
    <path d="M292 259c-3-6-2-15 3-20 4-3 9 0 14-1 8-1 18-1 26 0 5 1 10-2 14 1 5 5 6 14 3 20-4 2-8-1-13 0-10 1-24 1-34 0-5-1-9 2-13 0Z" fill="url(#rsVelvet)"/>
    <path d="M74 259c-3-6-2-13 3-17 4-3 8 0 12-1 7-1 16-1 23 0 5 1 9-2 12 1 5 4 6 11 3 17-4 2-7-1-11 0-9 1-21 1-30 0-4-1-8 2-12 0Z" fill="url(#rsVelvet)"/>
    <path class="rs-piping" d="M292 259c-3-6-2-15 3-20 4-3 9 0 14-1 8-1 18-1 26 0 5 1 10-2 14 1 5 5 6 14 3 20M74 259c-3-6-2-13 3-17 4-3 8 0 12-1 7-1 16-1 23 0 5 1 9-2 12 1 5 4 6 11 3 17"/>
    <path class="rs-sheen" d="M300 244c10-2 26-2 38 0M82 246c9-2 22-2 32 0"/>
    <circle class="rs-tuft" cx="321" cy="249" r="1.6"/><circle class="rs-tuft" cx="100" cy="250" r="1.4"/>
  </g>
  <g class="rs-tassel">
    <path d="M350 250l5 6M126 251l4 6"/><circle cx="356" cy="257" r="1.8"/><circle cx="131" cy="258" r="1.8"/>
  </g>

  <path class="rs-bloom" d="M146 257v-47c0-31 27-46 64-46s64 15 64 46v47" filter="url(#rsBlur4)"/>
  </g>

  <!-- set dressing from the Kid board itself: the skull on its books and a
       candle, down at the front where the Kid board keeps them -->
  <ellipse class="rs-propshadow" cx="30" cy="272" rx="26" ry="4" filter="url(#rsBlur2)"/>
  <image href="${KIT_ART}skull.webp" x="4" y="220" width="48" height="56" class="rs-prop"/>
  <ellipse class="rs-propshadow" cx="400" cy="273" rx="16" ry="3" filter="url(#rsBlur2)"/>
  <circle class="rs-candleglow" cx="400" cy="232" r="30" filter="url(#rsBlur8)"/>
  <image href="${KIT_ART}candle.webp" x="386" y="229" width="28" height="44" class="rs-prop"/>

  <rect x="-24" y="-24" width="468" height="328" fill="url(#rsVig)"/>
</svg>`;

const FORT_SVG = `
<svg class="rs-fort" viewBox="0 0 420 280" role="img"
     aria-label="A blanket fort: a table with blankets over it, a torch burning inside,
                 a kid and a small animal sitting in the warm.">
  <defs>
    <radialGradient id="rsGlow" cx="50%" cy="50%">
      <stop offset="0%" class="rs-glow-a"/><stop offset="100%" class="rs-glow-b"/>
    </radialGradient>
    <radialGradient id="rsInside" cx="50%" cy="50%">
      <stop offset="0%" class="rs-halo-a"/><stop offset="100%" class="rs-halo-b"/>
    </radialGradient>
    <!-- One window per figure onto its atlas cell, sized per clip in _tickFigure. -->
    <clipPath id="rsClipKid"><rect x="0" y="0" width="1" height="1"/></clipPath>
    <clipPath id="rsClipPet"><rect x="0" y="0" width="1" height="1"/></clipPath>
  </defs>

  <!-- the lamp's light: filling the fort, spilling out of the way in and
       across the rug in front of it -->
  <ellipse class="rs-pool" cx="210" cy="257" rx="168" ry="26" fill="url(#rsGlow)"/>
  <ellipse class="rs-pool rs-pool--in" cx="210" cy="232" rx="74" ry="40" fill="url(#rsGlow)"/>
  <circle class="rs-halo" cx="210" cy="222" r="62" fill="url(#rsInside)"/>

  <!-- the lamp between them -->
  <path class="rs-torchbody" d="M203 238h14v3h-14ZM201 241h18v7h-18Z"/>
  <path class="rs-lampcage" d="M204 238v-24M216 238v-24M202 214h16M206 210h8"/>
  <path class="rs-flame" d="M210 213c6 7 5 12 3 15-3 5-9 4-10-1-1-6 3-8 7-14Z"/>

  <!-- two shapes sitting in the warm -->
  <path class="rs-kid" d="M160 248c0-22 9-34 20-34s20 12 20 34Z"/>
  <path class="rs-kid" d="M180 212a10 10 0 1 1 0-.02"/>
  <path class="rs-pet" d="M228 248c0-13 8-22 18-22s18 9 18 22Z"/>
  <path class="rs-petear" d="M234 230l-4-11m20 10 5-11"/>
  <!-- ...and the real pair, for a Kid and a Companion whose art is built. Same
       swap as ui/enemy.js makes over PAL_ART: each flat path above stays until a
       frame is genuinely on screen, so a missing or slow atlas leaves the drawing
       whole rather than cutting a hole in it. Kid first, so the Companion draws
       in front of her the way she does on the Scuffle screen. -->
  <g class="rs-fig" data-who="kid" style="display:none">
    <g class="rs-fig__fit"><g clip-path="url(#rsClipKid)">
      <image class="rs-fig__img" preserveAspectRatio="none"/>
    </g></g>
  </g>
  <g class="rs-fig" data-who="pet" style="display:none">
    <g class="rs-fig__fit"><g clip-path="url(#rsClipPet)">
      <image class="rs-fig__img" preserveAspectRatio="none"/>
    </g></g>
  </g>
</svg>`;

/** Which of the board's painted medallions each night's choice wears on its
 *  rail: the moon for sleep, the star for sharpening, the shield for the
 *  forge, the paw for your Companion. The co-op two share the small star. */
const DOOR_MEDAL = { rest: 'moon', upgrade: 'star', forge: 'shield', sit: 'paw', mend: 'star2', clone: 'star2' };

export class RestScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'rest' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.SAFE);
    if (this._dead) return;
    await ensureCss(CSS_REST);
    if (this._dead) return;

    this.used = false;
    this._shell({
      eyebrow: TERMS.rest,
      title: 'You Build the Fort',
      sub: 'Door wedged. Table dragged over. Blankets down. Nothing gets in here without knocking things over first.',
    });
    // The fort and its four panels need the board's height more than the
    // plaque does — the same trade Mr. Moth's makes.
    this.root.querySelector('.kit-titleblock')?.classList.add('kit-titleblock--compact');

    this._buildBody();
    this._buildFoot();
    this._bindKeys();
    bus.emit('rest:ready', {});
  }

  /* ── the four doors ───────────────────────────────────────────────────── */
  _buildBody() {
    const r = this.run;
    const healAmt = r.restHealAmount();
    const upgradeable = r.upgradeableCards?.() || [];
    const forgeable = r.forgeableKeepsakes?.() || [];
    const forgeCost = r.forgeCost?.() ?? 8;
    const forgeAffordable = r.maxCourage - forgeCost >= 10;

    // The other Kid, in a two-Kid expedition. Null in solo, which is what makes
    // the two co-op options below disappear rather than sit there greyed out.
    const mate = r.partner || null;
    const mateName = mate ? r.kidNameOf(mate) : '';
    const mendAmt = mate ? Math.max(1, Math.round(mate.maxCourage * 0.30)) : 0;
    const mateDeck = mate ? r.deckViewsOf(mate) : [];

    const wrap = el('div', 'rs-room');
    // The fort is staged in a gold-railed panel with the moon on its rail, the
    // way the Kid board seats its mirror; the choices are panels beside it.
    wrap.innerHTML = `
      <div class="rs-art kit-panel" data-medal="moon">
        <div class="rs-scene">${FORT_PAINT}
          <i class="rs-glow rs-glow--moon" aria-hidden="true"></i>
          <i class="rs-glow rs-glow--rug" aria-hidden="true"></i>
          ${FORT_SVG}
          <i class="rs-glow rs-glow--lamp" aria-hidden="true"></i>
        </div>
      </div>
      <div class="rs-choices" role="group" aria-label="Choose one thing to do here"></div>`;
    this.$body.appendChild(wrap);
    this._mountFort(wrap);
    const list = wrap.querySelector('.rs-choices');

    this._options = [
      {
        id: 'rest', name: 'Rest',
        blurb: `Sleep for two hours with somebody keeping watch.`,
        readout: healAmt > 0
          ? `${TERMS.hp} ${r.courage} <b>&rarr;</b> ${Math.min(r.maxCourage, r.courage + healAmt)}`
          : `No rest tonight`,
        note: healAmt > 0
          ? (r.courage >= r.maxCourage ? 'You are already at full Courage.' : `Recovers ${healAmt}.`)
          : 'A Keepsake you are carrying will not let you.',
        can: healAmt > 0,
        why: healAmt > 0 ? '' : 'The White Glove does not permit resting.',
        run: async () => {
          const n = await act(r, { t: INPUT.ROOM, act: ACT.REST_NIGHT });
          return `You sleep. ${n} ${TERMS.hp} back.`;
        },
      },
      {
        id: 'upgrade', name: `Sharpen a ${TERMS.card}`,
        blurb: `Work on one ${TERMS.card} by torchlight until it is better than it was.`,
        readout: `${plural(upgradeable.length, TERMS.card)} can be sharpened`,
        note: `Permanent, for the rest of the expedition.`,
        can: upgradeable.length > 0,
        why: upgradeable.length ? '' : `Every ${TERMS.card} you carry is already as good as it gets.`,
        run: () => this._doUpgrade(),
      },
      {
        id: 'forge', name: 'Forge a Keepsake',
        blurb: `Hold it in the flame. It comes out meaning more, and you come out smaller.`,
        readout: `Costs ${forgeCost} maximum ${TERMS.hp}`,
        note: `${TERMS.hp} ${r.maxCourage} <b>&rarr;</b> ${r.maxCourage - forgeCost} &middot; the Keepsake fires twice`,
        can: forgeable.length > 0 && forgeAffordable,
        why: !forgeable.length ? 'Nothing left to forge.'
          : !forgeAffordable ? 'You cannot spare the Courage.' : '',
        run: () => this._doForge(),
      },
      // ── co-op only ────────────────────────────────────────────────────
      // Slay the Spire 2's two camp additions, and they cost you your own camp
      // action — that trade is the whole design. Mend is theirs: heal a friend
      // 30% of their maximum instead of resting yourself. Clone is a copy of
      // one of their Tricks, so the two decks can grow toward each other.
      // Both are hidden entirely in solo rather than shown greyed out: an
      // option that can never be taken is noise on a screen that is asking you
      // to make one careful choice.
      ...(mate ? [{
        id: 'mend', name: `Mend ${mateName}`,
        blurb: `Sit up with them instead of sleeping. You will feel it tomorrow.`,
        readout: `${TERMS.hp} ${mate.courage} <b>&rarr;</b> ${Math.min(mate.maxCourage, mate.courage + mendAmt)}`,
        note: mate.courage >= mate.maxCourage
          ? `${mateName} is already at full ${TERMS.hp}.`
          : `Recovers ${mendAmt} — 30% of their maximum. You get no rest.`,
        can: mendAmt > 0 && mate.courage < mate.maxCourage,
        why: mate.courage >= mate.maxCourage ? `${mateName} does not need it.` : '',
        run: async () => {
          // `to`, not `seat`: `seat` is who ACTED and the wire refuses a
          // message claiming to be somebody else. See net/actions.js.
          const n = await act(r, { t: INPUT.ROOM, act: ACT.REST_MEND_ALLY,
                                   to: r.kids.indexOf(mate), n: mendAmt });
          return `You keep watch. ${mateName} gets ${n} ${TERMS.hp} back.`;
        },
      }] : []),
      ...(mate ? [{
        id: 'clone', name: `Copy one of ${mateName}'s ${TERMS.deck}`,
        blurb: `Watch them do it until you can do it too.`,
        readout: `${plural(mateDeck.length, TERMS.card)} to copy`,
        note: `The copy is yours for the rest of the expedition. They keep theirs.`,
        can: mateDeck.length > 0,
        why: mateDeck.length ? '' : `${mateName} has nothing you can learn.`,
        run: () => this._doClone(mate),
      }] : []),
      {
        id: 'sit', name: 'Sit with your Companion',
        blurb: `Nothing useful. Ask them something.`,
        readout: `+1 Clue`,
        note: 'They have been in this house a long time.',
        can: true, why: '',
        run: () => this._doSit(),
      },
    ];

    for (const [i, o] of this._options.entries()) {
      const b = el('button', 'rs-door kit-panel');
      b.type = 'button';
      b.dataset.opt = o.id;
      b.dataset.medal = DOOR_MEDAL[o.id] || 'star2';
      b.disabled = !o.can;
      b.setAttribute('aria-label', `${o.name}. ${String(o.readout).replace(/<[^>]+>/g, ' ')}`);
      // The 1-4 keys choose the first four (_bindKeys): each of those wears its
      // key on a small enamel badge at the corner of its rail.
      b.innerHTML = `${i < 4 ? `<span class="rs-door__key kit-num" aria-hidden="true">${i + 1}</span>` : ''}
        <span class="rs-door__glyph" aria-hidden="true">${DOOR_GLYPH[o.id]}</span>
        <span class="rs-door__txt">
          <b>${esc(o.name)}</b>
          <em>${esc(o.blurb)}</em>
          <span class="rs-door__read kit-plate">${o.readout}</span>
          <span class="rs-door__note">${o.can ? o.note : esc(o.why)}</span>
        </span>`;
      b.addEventListener('click', () => this._choose(o));
      list.appendChild(b);
    }
    this._own(rovingFocus(list, '.rs-door', { cols: 0 }));
    requestAnimationFrame(() => list.querySelector('.rs-door:not(:disabled)')?.focus());
  }

  async _choose(o) {
    if (this.used || !o.can) return;
    this.used = true;
    this._lock();
    let msg = null;
    try { msg = await o.run(); } catch (e) { console.error('[rest]', e); }
    if (this._dead) return;
    if (!msg) {                       // the player backed out of a picker
      this.used = false;
      this._lock(false);
      return;
    }
    this.root.querySelector(`[data-opt="${o.id}"]`)?.classList.add('is-done');
    this._say(msg);
    this._syncHud();
    /* Sharpening and Sitting change no Courage, so hanging the footer hint off
       `run:courage` alone left "you have not used the fort yet" under the
       button after the fort had plainly been used. The hint follows `this.used`
       now, and `used` is what just changed. */
    this._syncFoot?.();
    this.$go?.classList.add('is-ready');
    this.$go?.focus();
    this.ctx.audio?.play?.('ui:confirm');
  }

  _lock(on = true) {
    for (const b of this.root.querySelectorAll('.rs-door')) {
      b.disabled = on ? true : !this._options.find(o => o.id === b.dataset.opt)?.can;
      b.classList.toggle('is-spent', on);
    }
    this.root.querySelector('.rs-room')?.classList.toggle('is-spent', on);
  }

  /* ── the three real actions ───────────────────────────────────────────── */
  async _doUpgrade() {
    const cards = this.run.upgradeableCards().map(c => ({
      uid: c.uid, def: cardById(c.id), upgraded: c.upgraded,
    })).filter(c => c.def);
    const uid = await this.pickCard({
      title: `Which ${TERMS.card} do you want to be better at?`,
      sub: 'Hover or arrow across them — the card shows you what it becomes.',
      cards, preview: 'upgrade', confirmLabel: 'Sharpen it',
    });
    if (!uid) return null;
    const i = deckIndex(this.run, this.run.localSeat, uid);
    if (i < 0) return null;
    const c = await act(this.run, { t: INPUT.ROOM, act: ACT.REST_MEND, index: i });
    if (!c) return null;
    return `${cardById(c.id)?.name}+ for the rest of the expedition.`;
  }

  /**
   * Clone: take a copy of one of your friend's Tricks.
   *
   * A COPY — they keep theirs. Two Kids sharing one card instance would be the
   * quiet kind of wrong this codebase keeps finding, so `run.addCard` mints a
   * fresh instance into the local deck and the friend's deck is never touched.
   * Upgrades do not come across: you learned the Trick, not their practice.
   */
  async _doClone(mate) {
    if (!mate) return null;
    const cards = this.run.deckViewsOf(mate).map(c => ({
      uid: c.uid, def: c.def, upgraded: c.upgraded,
    })).filter(c => c.def);
    if (!cards.length) return null;
    const name = this.run.kidNameOf(mate);
    const uid = await this.pickCard({
      title: `Which of ${name}'s ${TERMS.deck} do you want to learn?`,
      sub: 'You get a copy. They keep theirs.',
      cards, confirmLabel: 'Learn it',
    });
    if (!uid) return null;
    const src = cards.find(c => c.uid === uid);
    if (!src) return null;
    const to = this.run.kids.indexOf(mate);
    const i = deckIndex(this.run, to, uid);
    if (i < 0) return null;
    const before = this.run.cardCount();
    await act(this.run, { t: INPUT.ROOM, act: ACT.REST_CLONE, to, index: i });
    if (this.run.cardCount() === before) return null;
    return `You watched ${name} until you had it. ${src.def.name} is yours now.`;
  }

  async _doForge() {
    const id = await this._pickKeepsake();
    if (!id) return null;
    const k = await act(this.run, { t: INPUT.ROOM, act: ACT.REST_FORGE, id });
    if (!k) return null;
    return `${k.name} is forged. It costs you ${this.run.forgeCost()} maximum ${TERMS.hp} and it was worth it.`;
  }

  /* ── THE TWO OF THEM IN THE FORT ─────────────────────────────────
   * The art draws a generic kid and a generic small animal in the warm, and both
   * are the same kind of stand-in `PAL_ART` is on the Scuffle screen, so both get
   * the same treatment: the real art replaces them once it has actually decoded.
   *
   * Table-driven because the two figures differ only in where they stand, how
   * tall they are and which clips are worth warming -- everything else, down to
   * the swap, is one routine.
   *
   * This is also the only screen that can honestly play `affection`. The brief
   * builds that clip for "Kid petting Companion, bond scenes, camp interactions"
   * and says outright it is "not required during combat", so it has no beat in a
   * fight -- and sitting down with them IS the interaction the clip depicts.
   */
  _mountFort(wrap) {
    const svg = wrap.querySelector('.rs-fort');
    if (!svg) return;
    const SLUG = { kid: this.run?.kid, pet: this.run?.companion };
    const GLYPH = { kid: '.rs-kid', pet: '.rs-pet, .rs-petear' };
    const CLIP = { kid: '#rsClipKid rect', pet: '#rsClipPet rect' };
    this._fort = [];
    for (const c of FORT_CAST) {
      const slug = SLUG[c.who];
      const root = svg.querySelector(`.rs-fig[data-who="${c.who}"]`);
      // No Kid chosen yet (a deep link, a standalone review) keeps her drawn.
      if (!slug || !root) continue;
      this._fort.push({
        ...c,
        root,
        fit: root.querySelector('.rs-fig__fit'),
        img: root.querySelector('.rs-fig__img'),
        rect: svg.querySelector(CLIP[c.who]),
        glyphs: Array.from(svg.querySelectorAll(GLYPH[c.who])),
        /* Opens on `idle`, never `ready`: nothing in a blanket fort is entering
           combat. Warming only what this screen can actually play keeps it off
           the combat atlases -- attack and hurt, ~2 MB -- it has no way to show. */
        player: new ClipPlayer(String(slug), { opening: 'idle', warm: c.warm }),
        src: null,
        clip: null,
      });
    }
    if (!this._fort.length) return;
    /** The Companion's own player: `_doSit` plays a clip on her by name. */
    this.pet = (this._fort.find(r => r.who === 'pet') || {}).player || null;
    this._off.push(this.ctx.clock.onFrame((dt) => this._tickFort(dt)));
  }

  _tickFort(dt) {
    if (this._dead || !this._fort) return;
    for (const r of this._fort) this._tickFigure(r, dt);
  }

  /** Advance one figure and blit its current cell. Mirrors PlayerView#_tickSprite. */
  _tickFigure(r, dt) {
    if (!this.reduceMotion) r.player.advance(dt);
    const fr = r.player.frame({ still: this.reduceMotion });
    if (!fr || !fr.loaded) return;

    if (fr.src !== r.src) {
      r.img.setAttribute('href', fr.src);
      r.img.setAttribute('width', fr.atlasW);
      r.img.setAttribute('height', fr.atlasH);
      r.src = fr.src;
    }
    if (fr.clip !== r.clip) {
      const s = r.h / Math.max(1, fr.unit);
      r.rect.setAttribute('width', fr.fw);
      r.rect.setAttribute('height', fr.fh);
      r.fit.setAttribute('transform',
        `translate(${r.x} ${r.y}) scale(${s.toFixed(4)})`
        + ` translate(${(-fr.anchor[0]).toFixed(2)} ${(-fr.anchor[1]).toFixed(2)})`);
      r.clip = fr.clip;
    }
    r.img.setAttribute('transform',
      `translate(${(-fr.col * fr.fw).toFixed(2)} ${(-fr.row * fr.fh).toFixed(2)})`);
    r.root.setAttribute('opacity', fr.opacity.toFixed(3));

    if (r.root.style.display !== '') {
      r.root.style.display = '';
      for (const g of r.glyphs) g.style.display = 'none';
    }
  }

  async _doSit() {
    // The clip this screen exists to give a home to. See _mountCompanion.
    this.pet?.play('affection');
    const lines = COMPANION_TALK[this.run.companion] || GENERIC_TALK;
    const g = this.run.fork(`sit:${this.run.currentNodeId}`);
    const line = lines[g.int(lines.length)];
    await act(this.run, { t: INPUT.ROOM, act: ACT.REST_SIT });
    const name = COMPANIONS.find(c => c.slug === this.run.companion)?.name || 'They';
    return `${name}: ${line}`;
  }

  /**
   * The Forge picker.  Same shell as the card picker, but a Keepsake is not a
   * card, so it gets its own list with an explicit before / after.
   */
  _pickKeepsake() {
    return new Promise((resolve) => {
      const items = this.run.forgeableKeepsakes()
        .map(k => this.run.forgePreview(k.id)).filter(Boolean);
      const ov = el('div', 'rm-picker rs-forge');
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Forge a Keepsake');
      ov.innerHTML = `
        <div class="rm-picker__scrim"></div>
        <div class="rm-picker__panel kit-panel" data-medal="shield">
          <h2>Which Keepsake goes in the flame?</h2>
          <p class="rm-picker__sub">Costs ${this.run.forgeCost()} maximum ${esc(TERMS.hp)}.
             A forged Keepsake does its opening trick twice.</p>
          <div class="rs-forgelist" role="listbox" aria-label="Your Keepsakes"></div>
          <div class="rm-picker__foot">
            <p class="rm-picker__read" aria-live="polite"></p>
            <button type="button" class="rm-btn rm-btn--ghost" data-cancel>Not this one <kbd>Esc</kbd></button>
            <button type="button" class="rm-btn rm-btn--go" data-ok disabled>Put it in the flame</button>
          </div>
        </div>`;
      const list = ov.querySelector('.rs-forgelist');
      const read = ov.querySelector('.rm-picker__read');
      const ok = ov.querySelector('[data-ok]');
      let chosen = null;

      for (const it of items) {
        const row = el('button', 'rs-forgerow');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.dataset.id = it.id;
        row.innerHTML = `
          <span class="rs-forgerow__sig"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${relicSigil(it.id)}"/></svg></span>
          <span class="rs-forgerow__txt">
            <b>${esc(it.name)}</b>
            <span class="rs-ba">
              <em class="rs-ba__before">${esc(it.before)}</em>
              <i aria-hidden="true">&rarr;</i>
              <em class="rs-ba__after">${esc(it.after)}</em>
            </span>
          </span>`;
        if (!it.worthwhile) row.classList.add('is-weak');
        row.addEventListener('click', () => {
          chosen = it.id;
          for (const n of list.children) {
            n.classList.toggle('is-chosen', n.dataset.id === chosen);
            n.setAttribute('aria-selected', String(n.dataset.id === chosen));
          }
          read.textContent = it.worthwhile
            ? `${it.name} will fire twice.`
            : `${it.name} has no opening trick — forging it does very little.`;
          ok.disabled = false;
        });
        list.appendChild(row);
      }

      const done = (v) => { offRove?.(); ov.remove(); resolve(v); };
      const offRove = rovingFocus(list, '.rs-forgerow', { cols: 0 });
      ov.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      ok.addEventListener('click', () => chosen && done(chosen));
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
      });
      this.root.appendChild(ov);
      this._own(() => ov.remove());
      requestAnimationFrame(() => list.querySelector('.rs-forgerow')?.focus());
    });
  }

  /* ── chrome ───────────────────────────────────────────────────────────── */
  _say(text) {
    if (!this.$line) {
      this.$line = el('p', 'rs-line');
      this.$line.setAttribute('role', 'status');
      this.$line.setAttribute('aria-live', 'polite');
      this.$foot.prepend(this.$line);
    }
    this.$line.textContent = text;
  }

  _buildFoot() {
    this._say('');
    this._primary('Pack up and go on', () => this._leaveRoom(), {
      hint: 'you have not used the fort yet', key: 'Enter',
    });
    this._syncFoot = () => {
      const hint = this.$go?.querySelector('em');
      if (hint) hint.textContent = this.used ? '' : 'you have not used the fort yet';
    };
    this._syncFoot();
    this._own(bus.on('run:courage', this._syncFoot));
  }

  _bindKeys() {
    this._on(window, 'keydown', (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      // Escape belongs to Settings now, everywhere in a run — the HUD owns it.
      // Enter leaves. While an unused option has focus Enter belongs to that
      // option; once the fort has been used there is nothing left to do here.
      if (e.key === 'Enter'
          && (this.used || !document.activeElement?.closest?.('[data-opt], .rm-go, .mm-hud'))) {
        e.preventDefault(); this._leaveRoom(); return;
      }
      if (e.key >= '1' && e.key <= '4') {
        const o = this._options?.[Number(e.key) - 1];
        if (o) { e.preventDefault(); this.root.querySelector(`[data-opt="${o.id}"]`)?.focus(); }
      }
    });
  }
}

const DOOR_GLYPH = {
  rest: '<svg viewBox="0 0 24 24"><path d="M4 17v-5a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5M2 17h20v3H2ZM7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>',
  upgrade: '<svg viewBox="0 0 24 24"><path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4ZM19 3v4M17 5h4"/></svg>',
  forge: '<svg viewBox="0 0 24 24"><path d="M12 3c3.6 4.6 1.6 7 0 9.4C9.6 10 8.4 7.6 12 3ZM6 14h12l-1.6 7H7.6Z"/></svg>',
  sit: '<svg viewBox="0 0 24 24"><path d="M8 20c0-4 2-6 4-6s4 2 4 6ZM12 11a3 3 0 1 1 0-.01M4 20c0-2.4 1.4-4 3-4M20 20c0-2.4-1.4-4-3-4"/></svg>',
  // Co-op. Mend is a bandaged heart — you spend your own night on it. Clone is
  // two overlapping cards, the second traced from the first.
  mend: '<svg viewBox="0 0 24 24"><path d="M12 20S4 14.5 4 9.5A4 4 0 0 1 12 7a4 4 0 0 1 8 2.5c0 5-8 10.5-8 10.5ZM7 12h4l1-2 1.5 4 1-2h2.5"/></svg>',
  clone: '<svg viewBox="0 0 24 24"><path d="M9 3h9a2 2 0 0 1 2 2v11M6 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM8 13h6M8 16h4"/></svg>',
};

export default RestScene;
