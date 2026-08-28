/**
 * The icon set. OWNER: ui-chrome agent.
 *
 * ONE rule governs this file: **every icon must be identifiable at 16px from
 * its SILHOUETTE ALONE**, with no colour and no label. A greyscale critic will
 * flatten these to alpha and check that no two read the same. That rule is why
 * the shield family carries its modifier as a shape that BREAKS the outline
 * (a spike above, a bite out of the flank) rather than as an inner detail, and
 * why the four rarity tiers are square / circle / diamond / star rather than
 * four coloured dots.
 *
 *   import { icon, iconSvg, hasIcon, ICON_IDS, ICON_GROUPS } from './icons.js';
 *
 *   el.append(icon('intent.attack', { size: 16, title: 'Attacking' }));
 *   host.innerHTML = iconSvg('status.weak');
 *
 * Ids are namespaced `group.name`. A bare name is resolved against the groups
 * in the order status → intent → res → node → type → rarity → ui, so
 * `icon('weak')` and `icon('status.weak')` are the same icon.
 *
 * Paths are authored on a 24x24 grid, filled with `currentColor`, and use
 * `fill-rule: evenodd` so a counter-form (the hole in Focus, the gap in a
 * split shield) survives the flatten. Nothing here uses stroke-only geometry:
 * a hairline stroke vanishes at 16px and its silhouette is a lie.
 */

const NS = 'http://www.w3.org/2000/svg';

/* ── shared sub-shapes, so members of a family share exact geometry ───────── */
const SHIELD   = 'M12 1.6 3.2 4.9v6.6c0 5.6 3.8 9.4 8.8 11 5-1.6 8.8-5.4 8.8-11V4.9z';
const BLADE    = 'M8.2 1.8h7.6v3.4h-1.5L12 22.4 9.7 5.2H8.2z';
/* The defend family carries its modifier as a WHOLE ARROW STANDING CLEAR of a
   narrowed shield, not as a notch in the shield outline. A notch disappears at
   16px, and mistaking "gaining Guard and buffing" for "gaining Guard and
   debuffing you" is a real tactical error, so the two must never be close. */
const SHIELD_SM = 'M8 1.6 0.9 4.3v5.6c0 4.7 3.1 7.9 7.1 9.2 4-1.3 7.1-4.5 7.1-9.2V4.3z';
const UPSPIKE  = 'M19.6 2.8 24 10.4h-2.6v8.6h-3.6v-8.6h-2.6z';
const DOWNSPIKE= 'M19.6 19.2 15.2 11.6h2.6V3h3.6v8.6H24z';
const CARDBACK = 'M5.2 2.4h13.6a1.6 1.6 0 0 1 1.6 1.6v16a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V4a1.6 1.6 0 0 1 1.6-1.6z';

/* ═══════════════════════════════════════════════════════════════════════════
   INTENTS — all 16 in data/schema.js `Intent`.
   Family reads from the OUTER FORM: blade = attack, shield = defense,
   arrow-on-a-plinth = scheme, everything else = special.
   ═══════════════════════════════════════════════════════════════════════════ */
const INTENT = {
  /* a broad crossguard with a single downward spike */
  attack: 'M2.6 2.2h18.8v4.2h-3.9L12 22.6 6.5 6.4H2.6z',
  /* two crossed blades — deliberately a different outline, not a bigger one */
  attackBig: 'M3.1 0.9 23.1 20.9l-2.9 2.9L0.2 3.8zM20.9 0.9l2.9 2.9L3.8 23.8l-2.9-2.9z',
  /* half shield (left) beside a spike (right): the two halves are read separately */
  attackDefend: 'M10.6 1.9 2.9 4.8v5.9c0 5 3.1 8.4 7.7 9.8zM13.8 2.4h8.6v3.6h-1.9l-2.4 16-2.4-16h-1.9z',
  /* blade + a spike breaking the top-right corner */
  attackBuff: 'M1.6 2.6h11.2v3.8H10L7.2 22.4 4.4 6.4H1.6zM18.5 0.6 23.9 9H13.1z',
  /* blade + a spike breaking the bottom-right corner */
  attackDebuff: 'M1.6 2.6h11.2v3.8H10L7.2 22.4 4.4 6.4H1.6zM18.5 23.4 13.1 15h10.8z',

  defend: SHIELD,
  defendBuff: SHIELD_SM + UPSPIKE,
  defendDebuff: SHIELD_SM + DOWNSPIKE,

  /* scheme: an arrow standing on a plinth. Up = buff, down = debuff. */
  buff: 'M12 0.8 20.6 10h-4.9v6.4H8.3V10H3.4zM4.4 18.4h15.2v4.8H4.4z',
  debuff: 'M4.4 0.8h15.2v4.8H4.4zM8.3 7.6h7.4V14h4.9L12 23.2 3.4 14h4.9z',
  /* three stacked chevrons pouring downward — heavier than one arrow at a glance */
  strongDebuff: 'M12 8.2 1.6 0.9h20.8zM12 15.4 3.8 9.6h16.4zM12 23.2 6.4 17.4h11.2z',

  /* special: none of these share an outline with anything above */
  summon: 'M12 6.2 17.4 9.3v6.2L12 18.6 6.6 15.5V9.3zM12 0.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM2.3 18.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM21.7 18.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
  sleep: 'M20.4 14.6A9.6 9.6 0 0 1 8.1 3.4 9.8 9.8 0 1 0 20.4 14.6zM13.4 1.2h8.4v2.3l-5 5.4h5v2.4h-8.6V8.8l5-5.3h-4.8z',
  stun: 'M12 0 14.4 6.6 20.5 3.5 17.4 9.6 24 12l-6.6 2.4 3.1 6.1-6.1-3.1L12 24l-2.4-6.6-6.1 3.1 3.1-6.1L0 12l6.6-2.4L3.5 3.5l6.1 3.1z',
  escape: 'M3.2 1.8h9.4v3.4H6.6v13.6h6v3.4H3.2zM15.4 5.6 23.4 12l-8 6.4v-4.6H9.2v-3.6h6.2z',
  unknown: 'M12 0.6c4 0 6.9 2.3 6.9 5.9 0 2.7-1.4 4.1-3.6 5.5-1.5 1-2 1.7-2 3v1.3H9.5v-1.8c0-2.2.9-3.4 2.9-4.7 1.6-1 2.2-1.7 2.2-3 0-1.5-1.1-2.5-2.7-2.5-1.8 0-2.9 1.1-3 3.1H4.8C4.9 3.2 7.7.6 12 .6zM11.5 19.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
};

/* ═══════════════════════════════════════════════════════════════════════════
   STATUSES — the 13 universal, the companion set, the enemy set.
   ═══════════════════════════════════════════════════════════════════════════ */
const STATUS = {
  /* ── universal buffs ── */
  strength: 'M4.4 9.6c0-1.5 1.2-2.4 2.6-2.4h2.4V4.4c0-1.5 1.1-2.6 2.6-2.6s2.6 1.1 2.6 2.6v2.8h1.6c1.6 0 2.8.8 3.4 2.2l1.8 4.2c.5 1.2.2 2.4-.8 3.1l-3.3 2.4v3.1H7.6v-3.4l-2.4-2.6a3.4 3.4 0 0 1-.8-2.2z',
  dexterity: 'M20.8 1.2c1.4 5.6-.4 11.2-4.6 15.1l-3.4 3.1 4.4.6-.4 2.8-9.6-1.4 1-9.7 2.8.3-.5 4.6 3-2.8c2.4-2.2 3.8-5 4.1-8.1l-3.6 3.3-1.9-2.1z',
  focus: 'M12 .8A11.2 11.2 0 1 1 12 23.2 11.2 11.2 0 0 1 12 .8zm0 4.6a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 3.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z',
  regen: 'M12 1.6a10.4 10.4 0 0 1 9.4 5.9l-3.5 1.7A6.5 6.5 0 0 0 5.9 10.4H9.7L4.2 17 0 10.4h2A10.4 10.4 0 0 1 12 1.6zM22 13.6h2L19.8 20l-5.5-6.6h3.8a6.5 6.5 0 0 1-11.4.8l-3.4 1.9A10.4 10.4 0 0 0 22 13.6z',
  bristle: 'M12 22.4A11 11 0 0 1 1 12.6h22a11 11 0 0 1-11 9.8zM3.1 10.2 6 .6l3.1 9.6zm7.4 0L12 .2l1.5 10zm7.4 0L14.9.6l2.9 9.6z',
  faint: 'M12 1.2c4.6 0 8 3.4 8 8v13.6l-2.7-2.4-2.6 2.4-2.7-2.4-2.7 2.4-2.6-2.4L4 22.8V9.2c0-4.6 3.4-8 8-8zM9.4 7.4a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm5.2 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z',
  charm: 'M12 8.6c-1.2-2.6-.4-5.4 1.8-6.6 2-1.2 4.4-.3 5.3 1.6.9 2-.2 4.2-2.6 5.2-.6.2-1.3.4-2 .5 2.4.5 4.2 1.9 4.7 3.8.6 2.1-.7 4.2-2.9 4.6-2.2.4-4.2-1.3-4.4-4.1-.2 2.8-2.2 4.5-4.4 4.1-2.2-.4-3.5-2.5-2.9-4.6.5-1.9 2.3-3.3 4.7-3.8-.7-.1-1.4-.3-2-.5C4.9 7.8 3.8 5.6 4.7 3.6c.9-1.9 3.3-2.8 5.3-1.6C12.2 3.2 13 6 11.8 8.6zM10.9 17.6h2.2l1 6.2h-4.2z',

  /* ── universal debuffs ── */
  /* a snapped bar: the notch is a hole in the outline, visible at 16px */
  weak: 'M1.4 6.8h7.4l2 3.4-2.4 4.2L1.4 17zM22.6 6.8v10.2l-6.9-2.6-2.4-4.2 2-3.4z',
  /* a shield split down the middle — two facing halves with real daylight between */
  vulnerable: 'M10.7 1.9 2.9 4.8v6c0 5.2 3.2 8.8 7.8 10.4zM13.3 1.9v19.3c4.6-1.6 7.8-5.2 7.8-10.4v-6z',
  /* a shield whose bottom has crumbled away */
  frail: 'M12 1.6 3.2 4.9v6.6c0 1.7.3 3.2.9 4.5l3-2.1 2.6 3.2 2.9-2.6 2.7 3 2.5-2.7 2.1 1.6c.7-1.5 1.1-3.2 1.1-5V4.9z',
  dread: 'M12 .8c5.6 0 9.6 3.8 9.6 9.2 0 2.9-1.1 5-2.8 6.3v3.9c0 1.7-1.3 3-3 3H8.2c-1.7 0-3-1.3-3-3v-3.9c-1.7-1.3-2.8-3.4-2.8-6.3C2.4 4.6 6.4.8 12 .8zM8.2 8.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zm7.6 0a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM10 17.2h1.2v4H10zm2.8 0H14v4h-1.2z',
  confusion: 'M12 .6a11.4 11.4 0 1 1 0 22.8A11.4 11.4 0 0 1 12 .6zm0 3.2a8.2 8.2 0 0 0 0 16.4 4.6 4.6 0 0 0 0-9.2 1.6 1.6 0 0 1 0-3.2 7.8 7.8 0 0 1 0 15.6v-3.2a4.6 4.6 0 0 0 0-9.2 1.6 1.6 0 0 1 0-3.2 8.2 8.2 0 0 0 0-4z',
  entangle: 'M7.6 3.4a5.4 5.4 0 0 1 4.4 8.5 5.4 5.4 0 1 1-8.8 0A5.4 5.4 0 0 1 7.6 3.4zm0 3a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM7.6 14a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM16.4 3.4a5.4 5.4 0 0 1 4.4 8.5 5.4 5.4 0 1 1-8.8 0 5.4 5.4 0 0 1 4.4-8.5zm0 3a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm0 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',

  /* ── generic companion statuses ── */
  empowered: 'M13.6.4 3.8 13.2h6L8.8 23.6 20.2 9.6h-6.6z',
  'no-guard': 'M12 1.6 3.2 4.9v6.6c0 5.6 3.8 9.4 8.8 11 2-.6 3.8-1.7 5.2-3.1L4.9 6.9zM20.8 4.9 12 1.6v3l7.5 7.4c.2-.8.3-1.6.3-2.5z',
  energy: 'M12 .6a11.4 11.4 0 1 1 0 22.8A11.4 11.4 0 0 1 12 .6zm1.9 3.6L6.4 13.4h4.4l-.9 6.6 7.7-9.4h-4.6z',
  ghoststep: 'M8.6 12.4c2.9 0 5.2 1.9 5.2 4.4s-2.3 4.4-5.2 4.4-5.2-1.9-5.2-4.4 2.3-4.4 5.2-4.4zM3.4 4.8a2.4 2.9 0 1 1 0 5.8 2.4 2.9 0 0 1 0-5.8zm5.2-2.2a2.4 2.9 0 1 1 0 5.8 2.4 2.9 0 0 1 0-5.8zm5.2 2.2a2.4 2.9 0 1 1 0 5.8 2.4 2.9 0 0 1 0-5.8zM17.6 13.2h5.8v2.4h-5.8zm2 5h4.4v2.4h-4.4z',
  haunt: 'M15.8 1.2c3.6 0 6.4 2.8 6.4 6.4v9.6l-2.1-1.8-2.1 1.8-2.1-1.8-2.1 1.8-2.1-1.8-2.3 1.8V7.6c0-3.6 2.8-6.4 6.4-6.4zM6.6 17.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm-4.8-1.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z',
  lives: 'M4.2 1.4 8.4 6h7.2l4.2-4.6 1.2 8.2c.6 1.4.9 2.9.9 4.4 0 5-4.4 8.6-9.9 8.6S2.1 19 2.1 14c0-1.5.3-3 .9-4.4zM8.4 11.6a1.8 2.2 0 1 0 0 4.4 1.8 2.2 0 0 0 0-4.4zm7.2 0a1.8 2.2 0 1 0 0 4.4 1.8 2.2 0 0 0 0-4.4z',
  untouched: 'M12 .8A11.2 11.2 0 1 1 12 23.2 11.2 11.2 0 0 1 12 .8zm-1.6 16.9 8.2-8.2-2.6-2.6-5.6 5.6-2.4-2.4-2.6 2.6z',
  'untouched-streak': 'M12 .6l2.9 6.6 7.1.7-5.3 4.8 1.5 7-6.2-3.6-6.2 3.6 1.5-7L2 7.9l7.1-.7zM3.4 20.8h17.2v2.6H3.4z',
  scattered: 'M2.4 3.6a2 2 0 0 1 3.3 2l4.4 2.2a2 2 0 1 1-.9 1.8L4.8 7.4a2 2 0 0 1-3.2-.6 2 2 0 0 1 .8-3.2zM21.8 8.6a2 2 0 0 1-1.7 3.1l-1.5 4.6a2 2 0 1 1-2-.4l1.4-4.4a2 2 0 0 1 .9-3.2 2 2 0 0 1 2.9.3zM8.6 15.4a2 2 0 0 1 1 3.5l.6 3.4-2.1.4-.6-3.4a2 2 0 0 1 1.1-3.9z',
  'play-dead': 'M4.6 9.4a7.4 7.4 0 0 1 14.8 0v13H4.6zM9 6.6l1.4 1.4 1.4-1.4 1.2 1.2-1.4 1.4 1.4 1.4-1.2 1.2-1.4-1.4-1.4 1.4-1.2-1.2L9.2 9.2 7.8 7.8zM2.2 22.4h19.6v1.4H2.2z',
  height: 'M12 .8 19.4 8h-4.2v3.6H8.8V8H4.6zM12 11.8l5.6 5.4h-3.2v2.6H9.6v-2.6H6.4zM3 21.6h18v2.2H3z',
  plump: 'M12 2.2c5.4 0 9.8 3.6 9.8 8v3.6c0 4.4-4.4 8-9.8 8s-9.8-3.6-9.8-8v-3.6c0-4.4 4.4-8 9.8-8zM2.6 11.4h18.8v2.6H2.6z',
  /* Boggle. `unaware` deliberately reuses `hidden` — it is the same idea and a
     second glyph for it would only make the row harder to read. */
  suspicious: 'M3.6 4.2 5 2.4l6.9 3.4-1.1 2.1zM20.4 4.2 19 2.4l-6.9 3.4 1.1 2.1zM12 9.4c4 0 7.4 2.6 8.8 5.4-1.4 2.8-4.8 5.4-8.8 5.4S4.6 17.6 3.2 14.8C4.6 12 8 9.4 12 9.4zm0 2.4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  lurk: 'M2.4 5.2h19.2v2.4H2.4zM4.6 7.6h2.2v3.6H4.6zm12.6 0h2.2v3.6h-2.2zM12 12c3.4 0 6.2 2.2 7.4 4.6-1.2 2.4-4 4.6-7.4 4.6s-6.2-2.2-7.4-4.6C5.8 14.2 8.6 12 12 12zm0 2.2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
  /* Mopsy. */
  stuffing: 'M8 3.6a3.6 3.6 0 0 1 6.6-1 3.4 3.4 0 0 1 4.6 4.8 3.6 3.6 0 0 1-2.4 6.2H7.2A3.6 3.6 0 0 1 4.8 7.4 3.6 3.6 0 0 1 8 3.6zM6.4 16.6h11.2v2.2H6.4zm1.8 3.6h7.6v2.2H8.2z',
  patch: 'M4.2 4.2h15.6v15.6H4.2zm2.4 2.4v10.8h10.8V6.6zM8 2.2h1.8v3.2H8zm6.2 0H16v3.2h-1.8zM8 18.6h1.8v3.2H8zm6.2 0H16v3.2h-1.8zM2.2 8h3.2v1.8H2.2zm0 6.2h3.2V16H2.2zM18.6 8h3.2v1.8h-3.2zm0 6.2h3.2V16h-3.2z',
  globs: 'M8 9.2c3.4 0 6.2 2.5 6.2 5.6S11.4 20.4 8 20.4s-6.2-2.5-6.2-5.6S4.6 9.2 8 9.2zM18.4 12.4c2.4 0 4.2 1.7 4.2 3.8s-1.8 3.8-4.2 3.8-4.2-1.7-4.2-3.8 1.8-3.8 4.2-3.8zM15.4 2.4c1.8 0 3.2 1.3 3.2 2.9s-1.4 2.9-3.2 2.9-3.2-1.3-3.2-2.9 1.4-2.9 3.2-2.9z',
  'loose-bones': 'M4.2 4.6a2.6 2.6 0 0 1 4.4 1.9l7.6 7.6a2.6 2.6 0 1 1-1.7 1.7L6.9 8.2a2.6 2.6 0 0 1-4.1-1.3 2.6 2.6 0 0 1 1.4-2.3zM6.5 3.2a2.6 2.6 0 1 1 1.4 4.5zM19.6 15.7a2.6 2.6 0 1 1-1.4 4.5z',
  'open-eyes': 'M12 3.6c5.6 0 10.3 3.4 12 8.4-1.7 5-6.4 8.4-12 8.4S1.7 17 0 12c1.7-5 6.4-8.4 12-8.4zm0 3.2a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4zm0 2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z',
  web: 'M1.2 1.2h4.2c9.6 0 17.4 7.8 17.4 17.4v4.2h-3.2v-4.2c0-7.8-6.4-14.2-14.2-14.2H1.2zM1.2 7.4h1.6a13.8 13.8 0 0 1 13.8 13.8v1.6h-3V21A10.8 10.8 0 0 0 2.8 10.2H1.2zM1.2 13.8h.4A8.6 8.6 0 0 1 10.2 22.4v.4H7.4A5.8 5.8 0 0 0 1.6 17H1.2z',
  nope: 'M12 .8A11.2 11.2 0 1 1 12 23.2 11.2 11.2 0 0 1 12 .8zm0 3.2a8 8 0 0 0-6.3 12.9L18.9 5.7A8 8 0 0 0 12 4zM8.2 20l10.6-11.6A8 8 0 0 1 8.2 20zM3.6 2.4l18 18-2 2-18-18z',

  /* ── enemy statuses (data/enemies/_lib.js) ── */
  'bell-small': 'M12 1.4a2 2 0 0 1 2 2v.6a6.6 6.6 0 0 1 4.6 6.3v4.2l2 3.1H3.4l2-3.1v-4.2A6.6 6.6 0 0 1 10 4v-.6a2 2 0 0 1 2-2zM9.4 19.2h5.2a2.6 2.6 0 0 1-5.2 0z',
  blanket: 'M1.4 3.6h21.2v11.2c0 1.4-1.1 2.2-2.2 1.5l-1.6-1-1.8 2.1c-.8.9-2 .9-2.7 0l-1.5-1.8-1.6 1.9c-.8.9-2 .9-2.7 0l-1.7-2-1.5 1c-1.1.7-2.1-.1-2.1-1.5zM3.6 18.6h16.8v3.8H3.6z',
  'button-brass': 'M12 1.2a10.8 10.8 0 1 1 0 21.6 10.8 10.8 0 0 1 0-21.6zM8.6 7.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm6.8 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM8.6 13.4a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm6.8 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z',
  'button-pillow': 'M4.8 4.4h14.4c1.6 0 2.8 1.4 2.4 2.9l-2 8.2c-.6 2.4-2.6 4.1-5 4.1H9.4c-2.4 0-4.4-1.7-5-4.1l-2-8.2c-.4-1.5.8-2.9 2.4-2.9zM12 9.4a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
  'button-spring': 'M6.4 1.4h11.2v2.4H8.8L17.6 7v2.4H8.8l8.8 3.2v2.4H8.8l8.8 3.2v2.4H6.4L3.2 19.4V17l8.8-3.2H3.2v-2.4L12 8.2H3.2V5.8L12 2.6H6.4z',
  darkness: 'M12 .6a11.4 11.4 0 1 1 0 22.8A11.4 11.4 0 0 1 12 .6zm0 3.6L7.8 12l4.2 7.8L16.2 12z',
  fluster: 'M2.4 4.6c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 3.2 2v3c-2 0-2-2-4-2s-2 2-4 2-2-2-4-2-2 2-4 2-2-2-3.2-2zM2.4 13.4c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 3.2 2v3c-2 0-2-2-4-2s-2 2-4 2-2-2-4-2-2 2-4 2-2-2-3.2-2z',
  fright: 'M12 0 15 6.4 21.6 4.2 19.4 10.8 24 12l-4.6 1.2 2.2 6.6L15 17.6 12 24l-3-6.4-6.6 2.2 2.2-6.6L0 12l4.6-1.2L2.4 4.2 9 6.4zM10.8 6.6h2.4v7.2h-2.4zM12 15.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
  hidden: 'M2.8 1.6 22.4 21.2l-2 2-3.6-3.6a13 13 0 0 1-4.8.9c-5.6 0-10.3-3.4-12-8.4a13.8 13.8 0 0 1 4.2-5.9L.8 3.6zM12 3.6c5.6 0 10.3 3.4 12 8.4a13.7 13.7 0 0 1-3.4 5.2L8.4 4.1A13 13 0 0 1 12 3.6z',
  needle: 'M20.4 1.2a3.4 3.4 0 0 1 0 4.8L8.2 18.2 2.4 21.6l3.4-5.8L18 3.6c1-1 2.4-1.6 2.4-2.4zM17.9 5.6l1.8 1.8-1.6 1.6-1.8-1.8z',
  scurry: 'M4.6 15.2a2.6 3.2 0 1 1 0 6.4 2.6 3.2 0 0 1 0-6.4zm-1-6.6a1.5 1.9 0 1 1 0 3.8 1.5 1.9 0 0 1 0-3.8zm3.6-1.8a1.5 1.9 0 1 1 0 3.8 1.5 1.9 0 0 1 0-3.8zM15.6 8.4a2.6 3.2 0 1 1 0 6.4 2.6 3.2 0 0 1 0-6.4zm-1-6.6a1.5 1.9 0 1 1 0 3.8 1.5 1.9 0 0 1 0-3.8zm3.6-1.4a1.5 1.9 0 1 1 0 3.8 1.5 1.9 0 0 1 0-3.8z',
  smother: 'M3.4 12.6h17.2c1.4 0 2.4 1.2 2.1 2.5l-1.2 5.4a2.2 2.2 0 0 1-2.1 1.7H5.6a2.2 2.2 0 0 1-2.1-1.7l-1.2-5.4c-.3-1.3.7-2.5 2.1-2.5zM12 .4l4.2 5.4h-2.6v4.4h-3.2V5.8H7.8z',

  unknown: INTENT.unknown,
};

/* ═══════════════════════════════════════════════════════════════════════════
   RESOURCES
   ═══════════════════════════════════════════════════════════════════════════ */
const RES = {
  courage: 'M12 22.4 3.2 13.9C.6 11.3.6 7.2 3.1 4.7a5.9 5.9 0 0 1 8.4 0l.5.5.5-.5a5.9 5.9 0 0 1 8.4 0c2.5 2.5 2.5 6.6-.1 9.2z',
  guard: SHIELD,
  nerve: 'M12 .6a11.4 11.4 0 1 1 0 22.8A11.4 11.4 0 0 1 12 .6zm1.9 3.6L6.4 13.4h4.4l-.9 6.6 7.7-9.4h-4.6z',
  'lost-things': 'M7.6 2.4a5.8 3.4 0 1 1 0 6.8 5.8 3.4 0 0 1 0-6.8zM1.8 8.2c1.1 1.4 3.3 2.4 5.8 2.4s4.7-1 5.8-2.4v2.2c0 1.9-2.6 3.4-5.8 3.4s-5.8-1.5-5.8-3.4zM16.4 10.6a5.8 3.4 0 1 1 0 6.8 5.8 3.4 0 0 1 0-6.8zM10.6 16.4c1.1 1.4 3.3 2.4 5.8 2.4s4.7-1 5.8-2.4v2.2c0 1.9-2.6 3.4-5.8 3.4s-5.8-1.5-5.8-3.4z',
  snack: 'M8.4 8.2h7.2c1.3 0 2.4 1.1 2.4 2.4v2.8c0 1.3-1.1 2.4-2.4 2.4H8.4A2.4 2.4 0 0 1 6 13.4v-2.8c0-1.3 1.1-2.4 2.4-2.4zM.6 6.2 5 9.4l-1.6 2.6L5 14.6.6 17.8zM23.4 6.2v11.6L19 14.6l1.6-2.6L19 9.4z',
  keepsake: 'M15.8 1.4a6.8 6.8 0 0 1 0 13.6c-.9 0-1.7-.2-2.5-.5l-1.5 1.6H9.4v2.4H7v2.4H2.4v-4l8.6-8.8c-.3-.8-.4-1.6-.4-2.5a6.8 6.8 0 0 1 5.2-4.2zm1.4 3.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
  deck: 'M3.4 6.6 8 4.9v14.6L3.4 17.8zM9.6 3.4h9.2c1 0 1.8.8 1.8 1.8v13.6c0 1-.8 1.8-1.8 1.8H9.6z',
  draw: 'M2.6 5.4h8.8v13.2H2.6zM18 1.6l5.4 6.4h-3.6v14h-3.6V8h-3.6z',
  discard: 'M2.6 5.4h8.8v13.2H2.6zM18 22.4 12.6 16h3.6V2h3.6v14h3.6z',
  exhaust: 'M4.4 10.6h8.4v11H4.4zM8.6 1.2c2 2 2.6 3.9 1.8 5.8 2-1 3.1-2.8 3.2-5.4 3 2.6 4.4 5.2 4.4 7.9 0 .5-.1 1-.2 1.5h-3.2c.4-.8.4-1.7 0-2.6-.3 2-1.4 3.3-3.2 3.9-.5-2.2-1.4-3.9-2.8-5.1zM18.6 13.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zm2.8 4.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm-3.4 2.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  'haunt-level': 'M12 .6 22.4 6.6v10.8L12 23.4 1.6 17.4V6.6zM12 5.2c1.4 2.6.4 4-.8 5.5-1.3 1.6-2 3-2 4.4a4.6 4.6 0 0 0 9.2 0c0-2-1.4-4-3-5.4.2 1.5-.2 2.6-1.2 3.2.4-2.6-.4-5-2.2-7.7z',
  seed: 'M4.2 2.6h15.6c.9 0 1.6.7 1.6 1.6v15.6c0 .9-.7 1.6-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V4.2c0-.9.7-1.6 1.6-1.6zM7.6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8.8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.6 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8.8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  floor: 'M2.2 21.8v-5.2h5.6v-4.8h5.6V7h5.6V2.2h2.8v22.4zM2.2 19.4h17.2v2.4H2.2z',
  region: 'M12 1.4c5 0 9 4 9 9v12.2h-5.8V10.4a3.2 3.2 0 0 0-6.4 0v12.2H3V10.4c0-5 4-9 9-9z',
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAP NODES — Boss, Rescue and Safe Room must not share a silhouette with
   each other or with anything else, and Safe Room is a lit candle, NEVER a
   hazard triangle. (A previous review found exactly those two faults.)
   ═══════════════════════════════════════════════════════════════════════════ */
const NODE = {
  /* scuffle — a bite: a jagged fanged arc */
  scuffle: 'M1.6 4.4h20.8v3.8l-3.4 4-2.6-4-2.8 5.4-2.6-5.4-2.6 4.6-2.8-4.6-4 4zM1.6 17.4h20.8v3.2H1.6z',
  /* big scare — a horned skull. The horns break the outline; nothing else has them. */
  bigScare: 'M2.4 1.2c2.8.6 4.8 2.4 5.9 4.6A9.8 9.8 0 0 1 12 5c1.3 0 2.6.3 3.7.8 1.1-2.2 3.1-4 5.9-4.6-1.4 2.2-1.7 4.4-1.1 6.2 1 1.4 1.5 3.1 1.5 4.9 0 2.9-1.2 5-3 6.3v3.2a2.4 2.4 0 0 1-2.4 2.4H7.4A2.4 2.4 0 0 1 5 21.8v-3.2c-1.8-1.3-3-3.4-3-6.3 0-1.8.5-3.5 1.5-4.9.6-1.8.3-4-1.1-6.2zM8.4 10.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm7.2 0a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
  /* boss — a crown. Wide, five-pointed, sitting on a band. Not a skull, not a cage. */
  boss: 'M1.2 5.4 6.6 10 12 1.8 17.4 10l5.4-4.6-2 12H3.2zM3.6 20h16.8v2.8H3.6z',
  /* safe room — a lit candle on a saucer. Warm, obviously not a warning. */
  safe: 'M12 .8c1.8 2.6 2.6 4.4 2.6 6a2.6 2.6 0 0 1-5.2 0c0-1.6.8-3.4 2.6-6zM9.2 9.6h5.6v9.2H9.2zM3.4 20h17.2c0 1.9-3.8 3.4-8.6 3.4S3.4 21.9 3.4 20z',
  /* shop — Mr. Moth's bowler hat */
  shop: 'M7.4 2.6h9.2c1 0 1.8.7 1.9 1.7l1 9.6c3 .9 4.9 2.3 4.9 3.9 0 2.6-5.5 4.6-12.4 4.6S-.4 20.4-.4 17.8c0-1.6 1.9-3 4.9-3.9l1-9.6a1.9 1.9 0 0 1 1.9-1.6z',
  /* curiosity — a keyhole */
  curiosity: 'M12 1.4a6.4 6.4 0 0 1 3.4 11.8l2.4 9.4H6.2l2.4-9.4A6.4 6.4 0 0 1 12 1.4zm0 3.2a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z',
  /* treasure — a chest with a domed lid and a clasp */
  treasure: 'M12 2.6c5 0 9 3 9.6 7h-6.8a2.8 2.8 0 0 0-5.6 0H2.4c.6-4 4.6-7 9.6-7zM2.2 12h7.4v2.6h4.8V12h7.4v7.4c0 1.1-.9 2-2 2H4.2a2 2 0 0 1-2-2zM10.8 11h2.4v3.2h-2.4z',
  /* rescue — an open cage: bars on the left, the door swung wide on the right */
  rescue: 'M2.6 1.6h1.8L3.6 5.2v14.2H1.4V5.2zM6.2 5.2h2.2v14.2H6.2zM10.8 5.2H13v14.2h-2.2zM1.4 21h13.4v2.4H1.4zM2.4 1.6h11.4l1 3.6H1.4zM16.6 3.2l6.2 3.2-1.4 2.4-2-1v11.6h-2.6V6.4l-1.6-.8z',
  unknown: INTENT.unknown,
};

/* ═══════════════════════════════════════════════════════════════════════════
   CARD TYPES + RARITY. Rarity is square / circle / diamond / star so the four
   tiers survive both greyscale and 16px.
   ═══════════════════════════════════════════════════════════════════════════ */
const TYPE = {
  attack: 'M3.6 1.2c4.4 3.1 8.2 7.1 11.2 11.8l-3.2 1.2 5.6 8.6-6.8-6.4-2.4 2.6C6.4 13.6 4.8 7.6 3.6 1.2zM17.4 2.4c2.4 2.6 4.2 5.5 5.4 8.8l-2.6.9c-1-2.9-2.6-5.5-4.7-7.8z',
  skill: 'M12 1.2A10.8 10.8 0 0 1 22.8 12h-3.4A7.4 7.4 0 0 0 12 4.6zM12 7.4a4.6 4.6 0 0 1 4.6 4.6h-3a1.6 1.6 0 0 0-1.6-1.6zM1.2 12h3.4a7.4 7.4 0 0 0 7.4 7.4v3.4A10.8 10.8 0 0 1 1.2 12zM7.4 12h3a1.6 1.6 0 0 0 1.6 1.6v3A4.6 4.6 0 0 1 7.4 12z',
  power: 'M12 .6l2.6 6.4L21.4 5l-2 6.6 4.6 3.4-5.6 2 1 6.4-5.4-3.4-5.4 3.4 1-6.4-5.6-2 4.6-3.4-2-6.6 6.8 2z',
  status: 'M6.4 1.4h11.2l-2.4 6.2 5.6 1.8-6 3.4 3.4 5.4-6.6-1.6-1.2 6-4-5.2-5 3.4 1.8-6.4-5.6-1.4 4.8-3.8-3.2-5.2 6.4 1.2z',
  curse: 'M12 1.2a10.8 10.8 0 1 1 0 21.6 10.8 10.8 0 0 1 0-21.6zm0 3.6-2 3.2-3.4-1.4 1 3.6-3.6.8 2.8 2.4-2.2 3 3.7-.4.4 3.7 3-2.2 2.4 2.8.8-3.6 3.6 1-1.4-3.4 3.2-2-3.2-2 1.4-3.4-3.6 1-.8-3.6-2.4 2.8z',
};

const RARITY = {
  basic:    'M4.6 4.6h14.8v14.8H4.6z',
  common:   'M12 2.2a9.8 9.8 0 1 1 0 19.6 9.8 9.8 0 0 1 0-19.6z',
  uncommon: 'M12 1.2 22.8 12 12 22.8 1.2 12z',
  rare:     'M12 .8l3.1 7.4 8 .7-6.1 5.3 1.8 7.8L12 17.9l-6.8 4.1 1.8-7.8L.9 8.9l8-.7z',
  curse:    TYPE.curse,
  status:   TYPE.status,
};

/* ═══════════════════════════════════════════════════════════════════════════
   UI GLYPHS
   ═══════════════════════════════════════════════════════════════════════════ */
const UI = {
  gear: 'M9.9 1.2h4.2l.6 3a8.9 8.9 0 0 1 2.2 1.3l2.9-1 2.1 3.6-2.3 2a9 9 0 0 1 0 2.6l2.3 2-2.1 3.6-2.9-1a8.9 8.9 0 0 1-2.2 1.3l-.6 3H9.9l-.6-3a8.9 8.9 0 0 1-2.2-1.3l-2.9 1-2.1-3.6 2.3-2a9 9 0 0 1 0-2.6l-2.3-2 2.1-3.6 2.9 1a8.9 8.9 0 0 1 2.2-1.3zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z',
  close: 'M4.4 1.6 12 9.2l7.6-7.6 2.8 2.8L14.8 12l7.6 7.6-2.8 2.8L12 14.8l-7.6 7.6-2.8-2.8L9.2 12 1.6 4.4z',
  check: 'M9.4 18.6 2.2 11.4l2.8-2.8 4.4 4.4L19 3.4l2.8 2.8z',
  plus: 'M9.8 2.4h4.4v7.4h7.4v4.4h-7.4v7.4H9.8v-7.4H2.4V9.8h7.4z',
  minus: 'M2.4 9.8h19.2v4.4H2.4z',
  'chevron-down': 'M12 17.4 1.8 7.2l3-3L12 11.4l7.2-7.2 3 3z',
  'chevron-up': 'M12 6.6 22.2 16.8l-3 3L12 12.6l-7.2 7.2-3-3z',
  'chevron-left': 'M17.4 12 7.2 22.2l-3-3L11.4 12 4.2 4.8l3-3z',
  'chevron-right': 'M6.6 12 16.8 1.8l3 3L12.6 12l7.2 7.2-3 3z',
  search: 'M10.2 1.4a8.8 8.8 0 0 1 6.9 14.3l5.6 5.6-2.4 2.4-5.6-5.6A8.8 8.8 0 1 1 10.2 1.4zm0 3.2a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z',
  sort: 'M6.6 1.6 11.4 8H8.2v14.4H5V8H1.8zM17.4 22.4 12.6 16h3.2V1.6H19V16h3.2z',
  filter: 'M1.6 2.6h20.8v3.2l-7.6 8v9.6l-5.6-3.4v-6.2l-7.6-8z',
  eye: 'M12 3.6c5.6 0 10.3 3.4 12 8.4-1.7 5-6.4 8.4-12 8.4S1.7 17 0 12c1.7-5 6.4-8.4 12-8.4zm0 3.2a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4z',
  info: 'M12 .8A11.2 11.2 0 1 1 12 23.2 11.2 11.2 0 0 1 12 .8zm-1.8 8.8v9.2h3.6V9.6zM12 4a2.1 2.1 0 1 0 0 4.2A2.1 2.1 0 0 0 12 4z',
  lock: 'M12 1.2a5.4 5.4 0 0 1 5.4 5.4v2.6h1.8c1 0 1.8.8 1.8 1.8v10c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8v-10c0-1 .8-1.8 1.8-1.8h1.8V6.6A5.4 5.4 0 0 1 12 1.2zm0 3.2a2.2 2.2 0 0 0-2.2 2.2v2.6h4.4V6.6A2.2 2.2 0 0 0 12 4.4z',
  warn: 'M12 1.4 23.4 21.8H.6zM10.4 8.6v6.6h3.2V8.6zM12 17a1.9 1.9 0 1 0 0 3.8A1.9 1.9 0 0 0 12 17z',
  reset: 'M12 1.6a10.4 10.4 0 0 1 10.4 10.4h-3.4A7 7 0 1 0 12 19v3.4A10.4 10.4 0 0 1 12 1.6zM12 1.6v9.2L5.4 6.2z',
  keyboard: 'M2.2 4.6h19.6c1 0 1.8.8 1.8 1.8v11.2c0 1-.8 1.8-1.8 1.8H2.2a1.8 1.8 0 0 1-1.8-1.8V6.4c0-1 .8-1.8 1.8-1.8zM4 7.6v2.6h2.6V7.6zm4.4 0v2.6H11V7.6zm4.4 0v2.6h2.6V7.6zm4.4 0v2.6H20V7.6zM4 11.8v2.6h2.6v-2.6zm4.4 0v2.6H11v-2.6zm4.4 0v2.6h2.6v-2.6zm4.4 0v2.6H20v-2.6zM6.6 16v2.4h10.8V16z',
  volume: 'M11.6 2.2v19.6l-5.4-4.6H1.8V6.8h4.4zM15 7.4a6.4 6.4 0 0 1 0 9.2l-2-2a3.6 3.6 0 0 0 0-5.2zM18.2 3.6a11.4 11.4 0 0 1 0 16.8l-2-2a8.6 8.6 0 0 0 0-12.8z',
  'volume-mute': 'M11.6 2.2v19.6l-5.4-4.6H1.8V6.8h4.4zM16 8 18.6 10.6 21.2 8l2 2-2.6 2.6 2.6 2.6-2 2-2.6-2.6-2.6 2.6-2-2 2.6-2.6L14 10z',
  book: 'M2.4 3h6.4c1.4 0 2.6.7 3.2 1.8V21c-.6-.9-1.8-1.5-3.2-1.5H2.4zM21.6 3h-6.4c-1.4 0-2.6.7-3.2 1.8V21c.6-.9 1.8-1.5 3.2-1.5h6.4z',
  grid: 'M2.4 2.4h8.2v8.2H2.4zM13.4 2.4h8.2v8.2h-8.2zM2.4 13.4h8.2v8.2H2.4zM13.4 13.4h8.2v8.2h-8.2z',
  list: 'M2 4h4v4H2zM8.4 4.8h13.6v2.4H8.4zM2 10h4v4H2zM8.4 10.8h13.6v2.4H8.4zM2 16h4v4H2zM8.4 16.8h13.6v2.4H8.4z',
  star: RARITY.rare,
  dice: RES.seed,
};

/* ── registry ─────────────────────────────────────────────────────────────── */
export const ICON_GROUPS = Object.freeze({
  intent: INTENT, status: STATUS, res: RES,
  node: NODE, type: TYPE, rarity: RARITY, ui: UI,
});

/**
 * DELIBERATE ALIASES. Each group below is ONE drawing published under several
 * ids because the concepts genuinely are the same picture: Guard *is* a shield,
 * Nerve *is* the energy orb, a seed *is* a die. `tests/chrome/run.py` collapses
 * ids that share identical path data before running the silhouette check, so an
 * alias is never mistaken for a collision — and two DIFFERENT drawings that
 * happen to read the same still fail.
 */
export const ICON_ALIASES = Object.freeze([
  ['intent.defend', 'res.guard'],
  ['intent.unknown', 'status.unknown', 'node.unknown'],
  ['status.energy', 'res.nerve'],
  ['res.seed', 'ui.dice'],
  ['type.status', 'rarity.status'],
  ['type.curse', 'rarity.curse'],
  ['rarity.rare', 'ui.star'],
  ['status.open-eyes', 'ui.eye'],
]);

/** Search order for a bare (un-namespaced) id. */
const ORDER = ['status', 'intent', 'res', 'node', 'type', 'rarity', 'ui'];

/** Every id, namespaced. */
export const ICON_IDS = Object.freeze(
  Object.entries(ICON_GROUPS).flatMap(([g, m]) => Object.keys(m).map(k => `${g}.${k}`)),
);

/** The fallback: a hollow lozenge that cannot be mistaken for a real glyph. */
const MISSING = 'M12 1.6 22.4 12 12 22.4 1.6 12zm0 4.6L6.2 12 12 17.8 17.8 12z';

/** Resolve an id to its path data. Never throws; unknown ids get MISSING. */
export function iconPath(id) {
  if (!id) return MISSING;
  const s = String(id);
  const dot = s.indexOf('.');
  if (dot > 0) {
    const g = ICON_GROUPS[s.slice(0, dot)];
    const p = g && g[s.slice(dot + 1)];
    if (p) return p;
  }
  for (const g of ORDER) { const p = ICON_GROUPS[g][s]; if (p) return p; }
  return MISSING;
}

export function hasIcon(id) { return iconPath(id) !== MISSING; }

/**
 * Raw SVG markup. `title` makes it an accessible image; without one it is
 * decorative and hidden from assistive tech (the usual case — the label is
 * always beside it).
 */
export function iconSvg(id, { title = '', cls = '' } = {}) {
  const d = iconPath(id);
  const a11y = title
    ? `role="img" aria-label="${String(title).replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="mm-icon__svg ${cls}" viewBox="0 0 24 24" ${a11y}>`
       + `<path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>`;
}

/**
 * An `<span class="mm-icon">` wrapper sized in `em` so it tracks the text it
 * sits next to (and therefore honours largeText for free).
 *
 * @param {string} id
 * @param {{size?:number|string, title?:string, cls?:string}} [o]
 * @returns {HTMLSpanElement}
 */
export function icon(id, o = {}) {
  const span = document.createElement('span');
  span.className = 'mm-icon' + (o.cls ? ' ' + o.cls : '');
  span.dataset.icon = id;
  if (o.size != null) {
    const s = typeof o.size === 'number' ? `${o.size}px` : o.size;
    span.style.width = s; span.style.height = s;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  if (o.title) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', o.title); }
  else { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); }
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('d', iconPath(id));
  svg.appendChild(path);
  span.appendChild(svg);
  return span;
}

/** Map an Intent enum value (schema.js) to its icon id. */
export function intentIcon(type) { return `intent.${INTENT[type] ? type : 'unknown'}`; }
/** Map a StatusDef.icon to its icon id, falling back to the status' own id. */
export function statusIcon(def) {
  const k = def?.icon || def?.id;
  return STATUS[k] ? `status.${k}` : (STATUS[def?.id] ? `status.${def.id}` : 'status.unknown');
}

export default { icon, iconSvg, iconPath, hasIcon, intentIcon, statusIcon, ICON_IDS, ICON_GROUPS, ICON_ALIASES };
