/**
 * Mr. Moth's — the Buttons market.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §25.  The mansion is full of
 * buttons, coins, keys, marbles and charms dropped by a hundred years of
 * occupants, and Mr. Moth considers them incredibly valuable.
 *
 * Four counters, all seeded per node so the stock is the same every time you
 * walk back in:
 *
 *   Tricks       five real CardViews with prices under them
 *   Keepsakes    three, at their rarity's price
 *   Snacks       three consumables
 *   Forgetting   the removal service — and its price goes up every time you
 *                use it, which is the whole tension of the counter
 *
 * Affordability is unmistakable at a glance: an item you cannot pay for is
 * desaturated, its price is struck through in the threat colour, and its
 * button says how short you are.  You never have to do the subtraction.
 */
import { bus } from '../core/bus.js';
import { TERMS, NodeType } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { word } from '../util/plural.js';
import { relicById, relicSigil } from '../data/relics.js';
import { RoomScene, esc } from './reward.js';
import { act, ACT, deckIndex } from '../net/actions.js';
import { INPUT } from '../net/session.js';
import { el, ensureCss, rovingFocus } from '../ui/portrait.js';
import { iconSvg } from '../ui/icons.js';
import { fitCardToSlot } from './_cardfit.js';

const CSS_SHOP = new URL('./shop.css', import.meta.url).href;

/** Mr. Moth says something when you arrive, when you buy, and when you leave. */
const GREETING = [
  'Buttons, keys, marbles, teeth. I take all of it. Look around.',
  'You have found things. I have found things. This is the basis of a relationship.',
  'Everything here was dropped by somebody who is not coming back for it.',
  'No haggling. I do not understand haggling. I understand swapping.',
];
const ON_BUY = [
  'A fine choice. Nobody has wanted that in sixty years.',
  'Yes. Yes. Take it away from me.',
  'It has been waiting. I told it somebody would come.',
  'Do not tell the others what you paid.',
];
const ON_BROKE = [
  'You are short. I can see the exact amount you are short. It is not personal.',
  'Come back with more buttons.',
];

/**
 * Mr. Moth himself: a tall stooped thing in a too-long coat with moth wings
 * spread behind him, holding the lamp that keeps the market findable.
 * Pure SVG, every colour a class dressed from the tokens, so it costs nothing
 * and never 404s.
 *
 * Round 5: he is a PORTRAIT, standing in the Kid board's own mirror at the head
 * of his shelf (moth-mirror.webp). Wings with eye-spots, a ruff of fur at his
 * throat, a fuzzy head with two great dark eyes, feathered antennae, a lantern
 * low in his hand; lit by that lantern, and wobbled and toothed by a brush
 * filter so it reads as paint. The drawing is tools/moth/portrait.tpl.svg, and
 * tools/prep_moth_portrait.py lays the antennae's barbs and the fur strokes into
 * it (seeded): regenerate from there rather than editing this string.
 */
const MOTH_SVG = `
<svg class="sh-moth" viewBox="0 20 120 232" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Mr. Moth, behind his counter">
  <defs>
    <radialGradient id="shLamp" cx="50%" cy="50%">
      <stop offset="0%" class="sh-lamp-a"/><stop offset="100%" class="sh-lamp-b"/>
    </radialGradient>
    <radialGradient id="shWingU" cx="80%" cy="95%" r="115%">
      <stop offset="0" class="sh-wu-a"/><stop offset=".42" class="sh-wu-b"/><stop offset="1" class="sh-wu-c"/>
    </radialGradient>
    <radialGradient id="shWingL" cx="74%" cy="30%" r="100%">
      <stop offset="0" class="sh-wl-a"/><stop offset=".55" class="sh-wl-b"/><stop offset="1" class="sh-wl-c"/>
    </radialGradient>
    <linearGradient id="shCoat" x1="0" y1="0" x2="1" y2=".2">
      <stop offset="0" class="sh-coat-a"/><stop offset=".6" class="sh-coat-b"/><stop offset="1" class="sh-coat-c"/>
    </linearGradient>
    <radialGradient id="shHead" cx="66%" cy="74%" r="78%">
      <stop offset="0" class="sh-head-a"/><stop offset=".6" class="sh-head-b"/><stop offset="1" class="sh-head-c"/>
    </radialGradient>
    <radialGradient id="shEye" cx="36%" cy="30%" r="72%">
      <stop offset="0" class="sh-eye-a"/><stop offset=".3" class="sh-eye-b"/><stop offset="1" class="sh-eye-c"/>
    </radialGradient>
    <radialGradient id="shRuff" cx="62%" cy="85%" r="80%">
      <stop offset="0" class="sh-ruff-a"/><stop offset="1" class="sh-ruff-b"/>
    </radialGradient>
    <filter id="shBrush" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="7" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 .3 .72  0 0 0 .3 .72  0 0 0 .3 .72  0 0 0 0 1" result="g"/>
      <feBlend in="d" in2="g" mode="multiply" result="b"/>
      <feComposite in="b" in2="d" operator="in"/>
    </filter>
  </defs>
  <g class="sh-moth__fig" filter="url(#shBrush)">
    <g class="sh-moth__wings">
      <path class="sh-moth__wingu" d="M52 110 C40 94 22 74 7 52 C3 45 8 39 15 42 C34 51 50 73 60 101 Z"/>
      <path class="sh-moth__wingu" d="M68 110 C80 94 98 74 113 52 C117 45 112 39 105 42 C86 51 70 73 60 101 Z"/>
      <path class="sh-moth__wingl" d="M52 118 C38 124 20 142 17 162 C15 175 26 181 36 173 C48 163 55 142 58 124 Z"/>
      <path class="sh-moth__wingl" d="M68 118 C82 124 100 142 103 162 C105 175 94 181 84 173 C72 163 65 142 62 124 Z"/>
      <path class="sh-moth__vein" d="M56 104 C44 90 30 70 14 47 M56 106 C42 98 30 88 18 80 M57 120 C46 132 34 148 24 166 M57 122 C50 138 44 154 36 170 M64 104 C76 90 90 70 106 47 M64 106 C78 98 90 88 102 80 M63 120 C74 132 86 148 96 166 M63 122 C70 138 76 154 84 170"/>
      <circle class="sh-moth__spot" cx="27" cy="66" r="6.4"/><circle class="sh-moth__spot" cx="93" cy="66" r="6.4"/>
      <circle class="sh-moth__pupil" cx="27" cy="66" r="2.7"/><circle class="sh-moth__pupil" cx="93" cy="66" r="2.7"/>
      <circle class="sh-moth__spot sh-moth__spot--sm" cx="31" cy="158" r="4.6"/><circle class="sh-moth__spot sh-moth__spot--sm" cx="89" cy="158" r="4.6"/>
      <path class="sh-moth__wingrim" d="M105 42 C86 51 70 73 60 101 M113 52 C98 74 80 94 68 110 M103 162 C105 175 94 181 84 173"/>
    </g>
    <path class="sh-moth__coat" d="M45 118 C40 150 33 196 28 236 L92 236 C87 196 80 150 75 118 C69 112 51 112 45 118Z"/>
    <path class="sh-moth__coatrim" d="M75 118 C80 150 87 196 92 236"/>
    <path class="sh-moth__lapel" d="M50 118 L60 146 L70 118 C66 121 54 121 50 118Z"/>
    <path class="sh-moth__seam" d="M60 146 L60 236"/>
    <circle class="sh-moth__btn" cx="60" cy="160" r="2.1"/><circle class="sh-moth__btn" cx="60" cy="176" r="2.1"/><circle class="sh-moth__btn" cx="60" cy="192" r="2.1"/>
    <path class="sh-moth__sleeve" d="M74 122 C84 134 90 152 94 172 L86 176 C83 158 78 142 70 130Z"/>
    <path class="sh-moth__hand" d="M85 173 C88 169 95 169 96 174 C96 178 90 180 86 178Z"/>
    <path class="sh-moth__ruff" d="M36 116 C42 102 78 102 84 116 C80 126 40 126 36 116Z"/>
    <path class="sh-moth__fur" d="M77.7 117.1 l5.5 -1.0 M79.6 117.5 l6.5 3.6 M78.1 117.8 l6.1 0.2 M77.3 117.9 l3.7 3.2 M81.4 118.9 l7.0 0.3 M80.0 118.9 l5.1 4.5 M76.3 118.8 l5.2 3.6 M76.6 119.1 l5.9 0.3 M80.2 120.2 l5.8 1.9 M78.0 120.1 l4.5 5.7 M76.8 120.1 l5.5 3.1 M75.9 120.1 l7.0 1.1 M77.2 120.8 l4.0 3.2 M75.0 120.7 l7.1 2.9 M73.8 120.7 l5.6 3.1 M75.9 121.8 l3.6 3.9 M72.1 121.0 l3.7 2.4 M73.8 122.1 l3.8 3.2 M72.8 121.9 l2.0 3.9 M73.7 123.2 l1.1 6.7 M70.9 121.9 l2.5 7.2 M72.4 123.5 l1.5 6.2 M69.2 122.1 l4.4 3.7 M70.8 123.9 l4.4 3.1 M67.9 122.2 l3.8 5.8 M66.9 122.2 l3.5 6.8 M66.2 122.2 l2.8 3.4 M65.4 122.5 l1.3 4.1 M66.5 124.7 l1.1 4.5 M64.3 123.3 l1.8 7.4 M63.9 123.4 l1.2 4.2 M63.6 124.6 l1.1 7.0 M62.3 123.1 l2.0 4.6 M61.7 124.6 l2.3 4.1 M60.2 123.9 l0.8 7.6 M59.4 124.1 l-1.9 6.7 M59.0 122.7 l-2.1 4.5 M57.4 124.8 l-1.4 5.2 M56.8 124.0 l-1.2 6.9 M56.0 124.1 l-2.9 4.2 M55.9 122.5 l-4.9 5.8 M55.4 122.4 l0.8 7.3 M53.3 123.8 l0.1 4.4 M52.9 123.5 l-4.7 4.9 M53.7 122.0 l0.9 7.4 M52.4 122.1 l-4.6 5.3 M50.4 123.0 l-1.3 7.2 M50.5 122.4 l-5.1 5.2 M49.3 122.7 l-0.3 4.3 M48.6 122.4 l-4.6 5.6 M48.7 122.1 l-4.1 5.6 M46.2 122.9 l-1.6 6.9 M47.2 121.7 l-3.4 6.1 M46.2 121.7 l-2.5 7.2 M45.0 121.8 l-5.2 5.2 M43.1 121.9 l-2.6 6.4 M45.7 120.5 l-4.9 1.8 M42.2 121.3 l-4.6 1.4 M45.3 120.1 l-4.1 4.2 M40.5 120.8 l-3.2 5.9 M42.2 120.1 l-5.6 1.9 M44.4 119.2 l-5.0 0.8 M40.0 119.8 l-7.2 2.6 M40.5 119.3 l-5.3 0.0 M38.3 119.3 l-5.3 0.1 M39.8 118.6 l-4.4 3.7 M41.1 118.1 l-5.1 4.0 M42.4 117.9 l-5.8 4.0 M40.6 117.5 l-5.8 2.2 M42.4 117.2 l-5.4 -1.4 M40.2 111.5 l-4.5 0.6 M44.2 111.2 l-5.8 -2.9 M39.9 110.0 l-6.4 0.5 M42.1 109.8 l-3.8 -3.7 M40.0 108.8 l-3.3 -2.1 M41.9 108.6 l-3.8 -4.0 M41.4 108.0 l-3.9 -2.8 M43.9 107.6 l-4.2 -1.7 M44.8 107.5 l-3.1 -5.8 M46.8 107.4 l-5.2 -3.2 M49.4 107.7 l-2.6 -3.2 M48.3 106.3 l-0.9 -4.6 M51.0 106.8 l-0.3 -3.8 M50.3 105.0 l-3.3 -4.3 M52.5 106.3 l-0.1 -4.3 M53.4 104.9 l-2.2 -3.4 M53.9 104.4 l0.0 -4.1 M56.5 105.1 l-2.7 -5.9 M58.0 105.9 l-2.2 -3.2 M59.1 106.0 l1.6 -3.4 M60.4 104.2 l1.4 -5.5 M62.5 104.2 l2.0 -5.9 M63.7 104.8 l1.4 -5.6 M64.3 106.1 l1.5 -6.0 M65.1 106.1 l0.4 -6.2 M67.8 105.3 l1.4 -6.0 M68.4 106.0 l2.8 -2.4 M71.0 105.2 l0.7 -4.0 M72.7 106.0 l2.8 -3.3 M73.2 106.4 l3.6 -2.1 M74.7 107.0 l6.0 -2.0 M75.9 107.0 l4.9 -3.6 M75.5 107.6 l4.2 -4.8 M78.2 107.9 l2.9 -4.6 M75.5 109.1 l5.9 -1.9 M79.5 108.8 l4.6 -3.0 M80.3 109.6 l6.3 0.4 M79.5 110.2 l5.3 -1.2 M77.8 111.0 l3.8 0.2 M79.1 111.2 l5.1 -1.9"/>
    <ellipse class="sh-moth__head" cx="60" cy="88" rx="18" ry="17"/>
    <path class="sh-moth__fur sh-moth__fur--head" d="M73.3 88.1 l4.6 1.8 M73.5 89.4 l5.0 2.1 M72.8 90.0 l4.9 1.4 M72.7 91.0 l4.8 -0.8 M73.1 91.9 l3.1 2.4 M75.8 94.1 l3.6 1.1 M71.8 93.4 l2.6 3.1 M74.9 96.3 l2.9 2.4 M73.6 96.8 l3.9 1.2 M74.1 97.7 l4.8 2.2 M71.1 97.6 l2.3 4.0 M71.4 98.7 l2.5 2.6 M69.5 98.0 l1.3 3.5 M70.2 100.6 l0.7 3.1 M67.4 98.6 l0.7 3.5 M68.2 102.6 l3.1 2.9 M66.4 101.1 l3.7 4.1 M66.2 103.2 l-0.2 3.3 M64.6 102.3 l-0.3 4.6 M64.1 103.8 l0.2 3.4 M62.9 103.7 l1.5 3.1 M61.5 101.7 l-1.2 3.6 M60.0 102.0 l1.6 5.2 M59.2 104.8 l-1.1 5.3 M57.9 100.4 l-1.8 5.0 M56.4 103.9 l0.2 3.3 M56.2 102.1 l-1.2 4.2 M54.5 102.9 l-2.7 4.3 M54.8 100.0 l-0.5 3.5 M53.5 99.6 l-1.5 4.3 M51.4 101.4 l-1.4 5.2 M49.7 101.8 l-0.7 3.5 M49.3 100.6 l-4.2 2.3 M50.9 97.0 l-3.1 2.2 M50.0 96.8 l-2.8 2.8 M48.2 97.0 l-1.5 3.0 M46.1 96.7 l-2.4 3.2 M46.5 95.7 l-4.4 2.8 M45.8 94.2 l-3.3 1.1 M45.2 93.7 l-3.3 3.5 M43.9 93.1 l-2.5 2.2 M46.1 91.6 l-3.7 1.7 M46.4 90.3 l-3.9 0.1 M42.3 89.8 l-5.1 1.7 M44.4 88.8 l-4.3 0.7 M46.1 87.4 l-4.0 1.2 M44.2 86.2 l-5.4 1.1 M44.3 85.3 l-2.8 -1.4 M47.1 84.8 l-4.7 -2.6 M45.1 83.4 l-3.6 0.3 M43.9 82.0 l-3.3 -1.2 M45.1 81.5 l-3.8 -3.8 M46.8 81.1 l-2.6 -1.5 M45.8 78.7 l-2.7 -1.7 M47.8 79.6 l-4.8 -2.2 M46.9 76.6 l-4.5 -2.3 M48.0 75.8 l-5.1 -2.0 M50.3 77.9 l-3.1 -3.0 M50.1 75.9 l-2.4 -4.0 M51.6 75.5 l-3.9 -2.7 M53.5 76.7 l-0.8 -3.1 M53.8 75.4 l-1.3 -3.5 M54.0 73.8 l0.1 -3.2 M54.9 72.8 l-1.6 -4.1 M56.7 74.4 l-1.0 -4.8 M58.0 74.7 l-1.9 -4.1 M58.7 72.7 l-0.0 -4.4 M60.0 74.8 l0.9 -5.3 M61.3 71.3 l-0.3 -4.1 M61.8 74.4 l-0.2 -3.7 M62.9 73.7 l0.3 -3.7 M64.0 74.8 l2.7 -4.4 M65.6 72.7 l-0.1 -3.4 M65.6 76.8 l2.1 -2.2 M67.1 74.2 l0.9 -4.3 M69.1 73.5 l1.2 -3.8 M69.6 75.2 l0.9 -3.6 M68.7 78.3 l0.8 -3.0 M70.7 77.9 l3.6 -3.2 M71.1 78.9 l3.3 -2.0 M71.3 79.0 l4.0 -2.9 M74.6 78.6 l3.8 -1.6 M71.5 81.5 l2.8 -2.8 M72.7 81.6 l2.9 -1.7 M75.6 82.2 l4.5 -2.7 M76.6 82.9 l4.0 0.2 M76.9 83.5 l5.1 0.8 M76.3 85.5 l4.1 0.1 M75.8 86.6 l4.4 1.3 M74.6 87.3 l3.0 0.9"/>
    <ellipse class="sh-moth__eye" cx="51.5" cy="89" rx="7" ry="8"/>
    <ellipse class="sh-moth__eye" cx="68.5" cy="89" rx="7" ry="8"/>
    <circle class="sh-moth__glint" cx="49.6" cy="86" r="1.8"/><circle class="sh-moth__glint" cx="66.6" cy="86" r="1.8"/>
    <path class="sh-moth__stem" d="M53.0 76.0 L52.2 73.9 L51.3 71.8 L50.4 69.8 L49.4 67.7 L48.5 65.7 L47.4 63.6 L46.4 61.6 L45.3 59.6 L44.2 57.6 L43.1 55.7 L42.0 53.8 L40.8 51.9 L39.6 50.0 L38.4 48.2 L37.2 46.4 L36.0 44.6 L34.8 42.9 L33.6 41.3 L32.4 39.7 L31.2 38.1 L29.9 36.6 L28.7 35.2 L27.5 33.8 L26.3 32.4 L25.2 31.2 L24.0 30.0 M67.0 76.0 L67.8 73.9 L68.7 71.8 L69.6 69.8 L70.6 67.7 L71.5 65.7 L72.6 63.6 L73.6 61.6 L74.7 59.6 L75.8 57.6 L76.9 55.7 L78.0 53.8 L79.2 51.9 L80.4 50.0 L81.6 48.2 L82.8 46.4 L84.0 44.6 L85.2 42.9 L86.4 41.3 L87.6 39.7 L88.8 38.1 L90.1 36.6 L91.3 35.2 L92.5 33.8 L93.7 32.4 L94.8 31.2 L96.0 30.0"/>
    <path class="sh-moth__barbs" d="M50.4 69.8 L53.3 65.9 M50.4 69.8 L45.5 69.4 M49.4 67.7 L53.0 63.0 M49.4 67.7 L43.5 67.3 M48.5 65.7 L52.4 60.1 M48.5 65.7 L41.6 65.3 M47.4 63.6 L51.8 57.3 M47.4 63.6 L39.8 63.3 M46.4 61.6 L51.0 54.7 M46.4 61.6 L38.1 61.4 M45.3 59.6 L50.1 52.2 M45.3 59.6 L36.5 59.5 M44.2 57.6 L49.1 49.9 M44.2 57.6 L35.0 57.7 M43.1 55.7 L48.0 47.7 M43.1 55.7 L33.8 55.9 M42.0 53.8 L46.7 45.7 M42.0 53.8 L32.6 54.1 M40.8 51.9 L45.3 43.9 M40.8 51.9 L31.7 52.3 M39.6 50.0 L43.9 42.3 M39.6 50.0 L30.9 50.5 M38.4 48.2 L42.3 40.9 M38.4 48.2 L30.3 48.8 M37.2 46.4 L40.7 39.7 M37.2 46.4 L29.8 47.0 M36.0 44.6 L39.0 38.7 M36.0 44.6 L29.4 45.3 M34.8 42.9 L37.3 37.8 M34.8 42.9 L29.1 43.6 M33.6 41.3 L35.6 37.1 M33.6 41.3 L29.0 41.9 M32.4 39.7 L33.8 36.5 M32.4 39.7 L28.9 40.2 M31.2 38.1 L32.1 36.0 M31.2 38.1 L28.9 38.5 M29.9 36.6 L30.5 35.3 M29.9 36.6 L28.6 36.8 M28.7 35.2 L29.2 33.9 M28.7 35.2 L27.4 35.4 M27.5 33.8 L28.0 32.5 M27.5 33.8 L26.2 34.1 M26.3 32.4 L26.8 31.2 M26.3 32.4 L25.0 32.8 M25.2 31.2 L25.6 29.9 M25.2 31.2 L23.8 31.5 M69.6 69.8 L74.5 69.4 M69.6 69.8 L66.7 65.9 M70.6 67.7 L76.5 67.3 M70.6 67.7 L67.0 63.0 M71.5 65.7 L78.4 65.3 M71.5 65.7 L67.6 60.1 M72.6 63.6 L80.2 63.3 M72.6 63.6 L68.2 57.3 M73.6 61.6 L81.9 61.4 M73.6 61.6 L69.0 54.7 M74.7 59.6 L83.5 59.5 M74.7 59.6 L69.9 52.2 M75.8 57.6 L85.0 57.7 M75.8 57.6 L70.9 49.9 M76.9 55.7 L86.2 55.9 M76.9 55.7 L72.0 47.7 M78.0 53.8 L87.4 54.1 M78.0 53.8 L73.3 45.7 M79.2 51.9 L88.3 52.3 M79.2 51.9 L74.7 43.9 M80.4 50.0 L89.1 50.5 M80.4 50.0 L76.1 42.3 M81.6 48.2 L89.7 48.8 M81.6 48.2 L77.7 40.9 M82.8 46.4 L90.2 47.0 M82.8 46.4 L79.3 39.7 M84.0 44.6 L90.6 45.3 M84.0 44.6 L81.0 38.7 M85.2 42.9 L90.9 43.6 M85.2 42.9 L82.7 37.8 M86.4 41.3 L91.0 41.9 M86.4 41.3 L84.4 37.1 M87.6 39.7 L91.1 40.2 M87.6 39.7 L86.2 36.5 M88.8 38.1 L91.1 38.5 M88.8 38.1 L87.9 36.0 M90.1 36.6 L91.4 36.8 M90.1 36.6 L89.5 35.3 M91.3 35.2 L92.6 35.4 M91.3 35.2 L90.8 33.9 M92.5 33.8 L93.8 34.1 M92.5 33.8 L92.0 32.5 M93.7 32.4 L95.0 32.8 M93.7 32.4 L93.2 31.2 M94.8 31.2 L96.2 31.5 M94.8 31.2 L94.4 29.9"/>
  </g>
  <circle class="sh-moth__glow" cx="95" cy="196" r="46" fill="url(#shLamp)"/>
  <g class="sh-moth__lantern">
    <path class="sh-moth__bail" d="M91 178 C92 182 98 182 99 178"/>
    <path class="sh-moth__lampcap" d="M87 184 L103 184 L100 179 L90 179Z"/>
    <path class="sh-moth__lampglass" d="M88 185 L102 185 L101 205 L89 205Z"/>
    <path class="sh-moth__lampflame" d="M95 189 C98.5 193.5 98.5 198 95 201.5 C91.5 198 91.5 193.5 95 189Z"/>
    <path class="sh-moth__lampbars" d="M92 185 L92 205 M98 185 L98 205"/>
    <path class="sh-moth__lampbase" d="M86 205 L104 205 L102 210 L88 210Z"/>
  </g>
</svg>`;

export class ShopScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'shop' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.SHOP);
    if (this._dead) return;
    await ensureCss(CSS_SHOP);
    if (this._dead) return;

    if (!this.run.pendingShop && this.run.currentNode) this.run._prepareShop(this.run.currentNode);
    // Both default to the LOCAL Kid: the shelf is theirs, rolled off their
    // Companion and their Keepsakes, and so is the record of what they have
    // already bought off it. `shopSold` is a documented Run API — no `?.` on
    // it (CONTRACTS rule 8); if it ever goes missing that must be a loud
    // TypeError here rather than a shop that silently forgets every purchase.
    this.stock = this.run.shopStock();
    this.sold = new Set(this.run.shopSold());

    const g = this.run.fork(`shopline:${this.stock.nodeId}`);
    this._greeting = GREETING[g.int(GREETING.length)];
    this._shell({
      eyebrow: TERMS.shop,
      title: 'The Midnight Market',
      sub: 'Buttons, keys, marbles, teeth. He considers them incredibly valuable.',
    });
    // The market needs its height for the shelf: the plaque is drawn tighter.
    this.root.querySelector('.kit-titleblock')?.classList.add('kit-titleblock--compact');

    await this._buildCounters();
    this._buildFoot();
    this._bindKeys();
    bus.emit('shop:ready', { node: this.stock.nodeId });
  }

  /* ── counters ─────────────────────────────────────────────────────────── */
  async _buildCounters() {
    const { CardView } = await import('../ui/card.js');
    if (this._dead) return;

    /* The board, composed like the Kid board. One shelf across the whole
       cabinet holds every purchase (MINT's and PEARL's arrangement): Mr. Moth
       himself stands at its LEFT end in his lit portrait medallion with his
       name on a cartouche, then the five Tricks on a carved ledge in front of
       the curtain he hangs behind them, and his Forgetting service closes the
       row as a sixth framed card, every price hung on the ledge's front.
       Under it the counter: Keepsakes and Snacks either side, and between them
       only the one thing he says to you, over what you already carry. */
    const wrap = el('div', 'sh-floor');
    wrap.innerHTML = `
      <div class="sh-left">
        <section class="sh-counter sh-counter--cards kit-panel kit-mat--curtain" data-medal="star2" aria-label="${esc(TERMS.card)}s for sale">
          <h2 class="sh-h sh-h--cards kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp">${esc(TERMS.deck)} <em>on the table</em></h2>
          <!-- Mr. Moth, standing at the left end of the shelf: not for sale, so
               outside the list of things that are. Round 5: the Kid board's
               mirror is his portrait frame, its moon on the crest and its paw
               at the foot, the glass a dark room his own lamp lights. -->
          <figure class="sh-keeper">
            <span class="sh-keeper__light" aria-hidden="true"></span>
            <span class="sh-keeper__glass" aria-hidden="true"></span>
            ${MOTH_SVG}
            <span class="sh-moth__frame" aria-hidden="true"></span>
            <figcaption class="sh-moth__name kit-plate"><b class="kit-plate__name">Mr. Moth</b><span class="kit-plate__epithet">keeper of lost things</span></figcaption>
          </figure>
          <div class="sh-cards kit-cards" data-tip-avoid=".sh-card, .rm-where, .sh-counter--moth, .sh-side .sh-counter, .sh-keeper, .sh-service" data-tip-gap="12" role="list"></div>
          <i class="sh-ledge kit-ledge" aria-hidden="true"></i>
          <!-- the shelf's two ends, as the Kid board dresses its mirror's foot:
               the skull on its books and a candle, and a cast brass boss
               capping each end of the rail -->
          <span class="sh-still sh-still--l" aria-hidden="true"><i class="kit-prop kit-prop--skull sh-still__skull"></i></span>
          <span class="sh-still sh-still--m" aria-hidden="true"><i class="kit-prop kit-prop--candle sh-still__candle"></i></span>
          <span class="sh-still sh-still--r" aria-hidden="true"><i class="kit-prop kit-prop--candle sh-still__candle"></i><i class="sh-still__books"></i></span>
          <i class="sh-boss sh-boss--l" aria-hidden="true"></i>
          <i class="sh-boss sh-boss--r" aria-hidden="true"></i>
        </section>
      </div>
      <div class="sh-side">
        <section class="sh-counter sh-counter--keeps kit-panel" data-medal="shield" aria-label="${esc(TERMS.relic)}s for sale">
          <h2 class="sh-h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp">${esc(TERMS.relic)}s <em>under the glass</em></h2>
          <div class="sh-list sh-list--keeps" role="list"></div>
        </section>
        <section class="sh-counter sh-counter--moth kit-panel" data-medal="moon">
          <div class="sh-moth__say">
            <!-- what he says, lettered on a gilt-framed plaque on the counter
                 (never on the bare cloth), signed on an engraved rule, and
                 under it what you carry in four filigree settings -->
            <div class="sh-moth__plaque">
              <p class="sh-moth__line">&ldquo;${esc(this._greeting)}&rdquo;</p>
            </div>
            <p class="sh-moth__by kit-heading" aria-hidden="true">Mr. Moth</p>
            <!-- Live, not a snapshot: this panel is the only place in the shop
                 that says what you already have, and it used to be written once
                 at build time — so after buying two Snacks the HUD read 2 and
                 the counter underneath still read SNACKS 0/3. -->
            <dl class="sh-moth__you">
              <div><dt>${esc(TERMS.deck)}</dt><dd><button type="button" class="sh-deck"
                data-tip-title="Your ${esc(TERMS.deck)}"
                data-tip="Look through every ${esc(TERMS.card)} you own before you spend anything."
                data-inv="deck"></button></dd></div>
              <div><dt data-invlabel="keeps"></dt><dd data-inv="keeps"></dd></div>
              <div><dt>${esc(TERMS.potion)}s</dt><dd data-inv="snacks"></dd></div>
              <div><dt data-invlabel="clues"></dt><dd data-inv="clues"></dd></div>
            </dl>
          </div>
        </section>
        <section class="sh-counter sh-counter--snacks kit-panel" data-medal="paw" aria-label="${esc(TERMS.potion)}s for sale">
          <h2 class="sh-h kit-heading kit-heading--ribbon kit-heading--inline kit-heading--clasp">${esc(TERMS.potion)}s <em>in the jar</em></h2>
          <div class="sh-list sh-list--snacks" role="list"></div>
        </section>
      </div>`;
    this.$body.appendChild(wrap);

    this.$cards = wrap.querySelector('.sh-cards');
    this.$keeps = wrap.querySelector('.sh-list--keeps');
    this.$snacks = wrap.querySelector('.sh-list--snacks');
    this._cardSlots = [];

    // ── Tricks ──────────────────────────────────────────────────────────────
    // Mr. Moth stands at the left end of the ledge (in the markup above); the
    // five Tricks follow him, and his Forgetting service closes the row.
    for (const item of this.stock.cards) {
      const def = cardById(item.id);
      if (!def) continue;
      const key = `card:${item.id}`;
      const slot = el('div', 'sh-card');
      slot.setAttribute('role', 'listitem');
      slot.dataset.key = key;
      const view = new CardView(def, {
        uid: `sh-${item.id}`, largeText: this.largeText, reduceMotion: this.reduceMotion,
      });
      const face = el('div', 'sh-card__face');
      face.appendChild(view.el);
      slot.appendChild(face);
      // Owning one already is a *note*, not a lock — a second copy is often the play.
      if (item.owned) slot.appendChild(el('span', 'sh-card__own', 'already in your deck'));
      slot.appendChild(this._priceTag(item.price, key, `Buy ${def.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'card', id: item.id, price: item.price, key })) return false;
        return `${def.name} is yours.`;
      }));
      this.$cards.appendChild(slot);
      this._views.push(view);
      this._cardSlots.push({ slot, view });
    }
    // The sixth card: the Forgetting service, framed and dealt like a Trick —
    // the crescent medallion lit in its art window, FORGETTING on the Tricks'
    // own dark nameplate, "a service" as its type line, what it does as its
    // rules — and its price hung on the ledge beneath it like everything else.
    const service = el('div', 'sh-service');
    service.setAttribute('role', 'listitem');
    service.setAttribute('aria-label', 'Removal service');
    service.innerHTML = `
      <div class="sh-service__face">
        <div class="sh-service__card">
          <span class="sh-service__art" aria-hidden="true"><span class="sh-service__medal"></span></span>
          <h3 class="sh-h sh-service__h">Forgetting <em>a service</em></h3>
          <div class="sh-service__rules"></div>
        </div>
      </div>
      <div class="sh-remove"></div>`;
    this.$cards.appendChild(service);
    this.$remove = service.querySelector('.sh-remove');
    this.$removeText = service.querySelector('.sh-service__rules');

    // ── Keepsakes ───────────────────────────────────────────────────────────
    for (const item of this.stock.keepsakes) {
      const def = relicById(item.id);
      if (!def) continue;
      const key = `keep:${item.id}`;
      const row = el('div', 'sh-row');
      row.setAttribute('role', 'listitem');
      row.dataset.key = key;
      row.innerHTML = `
        <span class="sh-row__sig" data-rarity="${esc(def.rarity)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${relicSigil(def.id)}"/></svg>
        </span>
        <span class="sh-row__txt">
          <b>${esc(def.name)}</b>
          <em>${esc(def.desc)}</em>
        </span>`;
      row.appendChild(this._priceTag(item.price, key, `Buy ${def.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'keepsake', id: item.id, price: item.price, key })) return false;
        return `${def.name} goes in the bag.`;
      }));
      this.$keeps.appendChild(row);
    }

    // ── Snacks ──────────────────────────────────────────────────────────────
    for (const item of this.stock.snacks) {
      const key = `snack:${item.id}`;
      const row = el('div', 'sh-row sh-row--snack');
      row.setAttribute('role', 'listitem');
      row.dataset.key = key;
      row.innerHTML = `
        <span class="sh-row__sig sh-row__sig--snack" aria-hidden="true">
          <!-- the shared res.snack drawing, so a Snack looks the same here and in the HUD -->
          ${iconSvg('res.snack')}
        </span>
        <span class="sh-row__txt"><b>${esc(item.name)}</b><em>${esc(item.desc)}</em></span>`;
      // Fullness is recomputed in `_syncAffordable()`, not frozen here: buying
      // the last free slot has to lock the rows next to it immediately.
      const tag = this._priceTag(item.price, key, `Buy ${item.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'snack', id: item.id, price: item.price, key })) return false;
        return `${item.name} in the pocket.`;
      });
      tag.dataset.kind = 'snack';
      row.appendChild(tag);
      this.$snacks.appendChild(row);
    }

    // You are buying Tricks. You can see the deck you are buying them for.
    this._on(wrap.querySelector('.sh-deck'), 'click', () => this.hud?.openDeck());

    this._renderRemoval();
    this._own(rovingFocus(wrap, '.sh-buy', { cols: 0 }));
    this._layout();
    const onResize = () => this._layout();
    window.addEventListener('resize', onResize);
    this._own(() => window.removeEventListener('resize', onResize));
    // The frames take the height the counter below them leaves, and that is
    // only known once the counter's text has laid out (fonts, Mr. Moth's line),
    // which can be after this runs — so re-fit whenever a frame changes size,
    // not only when the window does.
    if (typeof ResizeObserver === 'function') {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { if (!this._dead) this._layout(); });
      });
      // the card too: a stylesheet that lands late restyles the card, not its frame
      for (const { slot, view } of this._cardSlots) { ro.observe(slot.querySelector('.sh-card__face')); ro.observe(view.el); }
      this._own(() => { cancelAnimationFrame(raf); ro.disconnect(); });
    }
    this._syncAffordable();
  }

  /**
   * The removal service.  Its price is on the run, not the stock, because it
   * rises across the whole expedition — that is the decision the counter asks.
   */
  _renderRemoval() {
    const price = this.run.removalPrice;
    const flat = this.run.flags.flatRemoval;
    const canRemove = (this.run.removableCards?.() || []).length > 0;
    // the words are the sixth card's rules; its price hangs on the ledge under it
    this.$removeText.innerHTML = `
      <p class="sh-remove__blurb">Hand over one ${esc(TERMS.card)} and he will keep it. You will not
        remember it. <b>${flat ? 'The price never moves.' : `Each one after this costs 25 more.`}</b></p>`;
    this.$remove.innerHTML = '';
    const key = 'removal';
    this.$remove.appendChild(this._priceTag(price, key, `Forget a ${TERMS.card}`, async () => {
      const cards = this.run.removableCards().map(c => ({ uid: c.uid, def: cardById(c.id), upgraded: c.upgraded }))
        .filter(c => c.def);
      const uid = await this.pickCard({
        title: `Which ${TERMS.card} would you rather not know?`,
        sub: `${price} ${TERMS.gold}. He will take it away and neither of you will bring it up again.`,
        cards, confirmLabel: 'Hand it over',
      });
      if (!uid) return false;
      // uid → index HERE, on the client that has the uid. A uid is not a
      // network identity (CONTRACTS trap 30) — `net/actions.js` says why.
      const i = deckIndex(this.run, this.run.localSeat, uid);
      if (i < 0) return false;
      const gone = await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_REMOVE, index: i });
      if (!gone) return false;
      this._renderRemoval();
      this._syncAffordable();
      return `${cardById(gone.id)?.name || 'It'} is gone.`;
    }, canRemove ? '' : 'Nothing you could spare.', { repeatable: true }));
  }

  /**
   * One purchasable. `onBuy` returns a message on success, or false.
   * Everything about affordability is expressed here so it is consistent.
   */
  _priceTag(price, key, label, onBuy, blockedReason = '', { repeatable = false } = {}) {
    // One counter plaque (.kit-price): the price struck on a small enamel
    // cartouche led by one of the house's Buttons (coin.webp stands for the
    // word, which stays in the DOM for anything that reads it), and BUY on the
    // Kid board's round purple enamel button in its gold rim, seated over the
    // cartouche's end so the two read as one piece.
    const b = el('button', 'sh-buy kit-price');
    b.type = 'button';
    b.dataset.key = key;
    b.dataset.price = String(price);
    if (blockedReason) b.dataset.blocked = blockedReason;
    b.setAttribute('aria-label', `${label}, ${price} ${TERMS.gold}`);
    b.innerHTML = `
      <span class="sh-buy__price kit-price__plate"><i class="sh-coin kit-price__coin" aria-hidden="true"></i><b class="kit-enamel__value kit-price__value">${price}</b><i class="kit-enamel__label">${esc(TERMS.gold)}</i></span>
      <span class="sh-buy__state kit-price__buy"></span>`;
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      if (this.sold.has(key) && !repeatable) return;
      if (this.run.lostThings < price) { this._say(ON_BROKE[0], 'bad'); this._bump(b); return; }
      b.disabled = true;
      const msg = await onBuy();
      b.disabled = false;
      if (!msg) { this._bump(b); return; }
      if (!repeatable) this.sold.add(key);
      this.run.save?.();
      this.ctx.audio?.play?.('ui:confirm');
      const g = this.run.fork(`shopbuy:${key}`);
      this._say(`${msg} <i>&ldquo;${esc(ON_BUY[g.int(ON_BUY.length)])}&rdquo;</i>`, 'good');
      this._syncAffordable();
      this._syncHud();
    });
    return b;
  }

  _bump(b) {
    b.classList.remove('is-refused'); void b.offsetWidth; b.classList.add('is-refused');
  }

  /** What you are carrying, restated after every purchase. */
  _syncInventory() {
    const set = (k, v) => {
      const n = this.root?.querySelector(`[data-inv="${k}"]`);
      if (n) n.textContent = String(v);
    };
    const label = (k, v) => {
      const n = this.root?.querySelector(`[data-invlabel="${k}"]`);
      if (n) n.textContent = v;
    };
    const keeps = this.run.keepsakes.length;
    const clues = Number(this.run.cluesFound) || 0;
    set('deck', this.run.deck.length);
    set('keeps', keeps);
    set('snacks', `${this.run.snacks.length}/${this.run.snackCap}`);
    set('clues', clues);
    label('keeps', word(keeps, TERMS.relic));
    label('clues', word(clues, 'Clue'));
  }

  /** One pass over every purchasable: sold, unaffordable, or ready. */
  _syncAffordable() {
    const purse = this.run.lostThings;
    const pocketsFull = this.run.snacks.length >= this.run.snackCap;
    this._syncInventory();
    for (const b of this.root.querySelectorAll('.sh-buy')) {
      const price = Number(b.dataset.price);
      const key = b.dataset.key;
      const owner = b.closest('.sh-card, .sh-row, .sh-remove');
      const sold = this.sold.has(key);
      if (b.dataset.kind === 'snack') {
        if (pocketsFull) b.dataset.blocked = 'Your pockets are full.';
        else delete b.dataset.blocked;
      }
      const blocked = b.dataset.blocked || '';
      const short = purse - price;
      const state = b.querySelector('.sh-buy__state');

      b.classList.toggle('is-sold', sold);
      b.classList.toggle('is-poor', !sold && !blocked && short < 0);
      b.classList.toggle('is-blocked', !sold && !!blocked);
      b.disabled = sold || !!blocked;
      owner?.classList.toggle('is-sold', sold);
      owner?.classList.toggle('is-poor', !sold && !blocked && short < 0);

      if (sold) state.textContent = 'Taken';
      else if (blocked) state.textContent = blocked;
      else if (short < 0) state.textContent = `${-short} short`;
      else state.textContent = 'Buy';
    }
    // The removal price can move mid-visit.
    const rm = this.$remove?.querySelector('.sh-buy');
    if (rm) {
      rm.dataset.price = String(this.run.removalPrice);
      rm.querySelector('.sh-buy__price b').textContent = String(this.run.removalPrice);
    }
  }

  _layout() {
    // The shelf is read, not glanced at: rules type never prints smaller than
    // the pre-kit shop printed it at 1280x800, on a 228 px card (_cardfit.js).
    for (const { slot, view } of this._cardSlots || []) {
      fitCardToSlot(view, slot.querySelector('.sh-card__face'), { legibleAt: 232 });
    }
    // The Forgetting card is drawn, not a CardView: its rules take the same lift.
    const svc = this.root?.querySelector('.sh-service__card');
    const w = svc?.clientWidth || 0;
    if (w) svc.style.setProperty('--rules-k', Math.max(1, Math.min(1.4, 232 / w)).toFixed(3));
  }

  _say(html, tone = '') {
    if (!this.$line) {
      this.$line = el('p', 'sh-line');
      this.$line.setAttribute('role', 'status');
      this.$line.setAttribute('aria-live', 'polite');
      this.$foot.prepend(this.$line);
    }
    this.$line.className = `sh-line${tone ? ` is-${tone}` : ''}`;
    this.$line.innerHTML = html;
  }

  _buildFoot() {
    this._say('&nbsp;');
    // Escape belongs to Settings now, everywhere in a run — the HUD owns it.
    this._primary('Back to the blueprint', () => this._leaveRoom(), { key: 'Enter' });
    this.$go.classList.add('is-ready');
  }

  _bindKeys() {
    this._on(window, 'keydown', (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      // Enter leaves, unless something that answers to Enter itself has focus.
      if (e.key === 'Enter' && !document.activeElement?.closest?.('.sh-buy, .sh-deck, .rm-go, .mm-hud')) {
        e.preventDefault(); this._leaveRoom();
      }
    });
  }
}

export default ShopScene;
