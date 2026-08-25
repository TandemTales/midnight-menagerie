/**
 * EnemyView — procedural enemy rigs. OWNER: combat-scene.
 *
 * No enemy art exists, so every enemy is built at runtime from its EnemyDef's
 * `silhouette`, `shape` ({ body, limbs, eyes }) and `palette` ([main, light, dark]).
 * The result must be CHARMING and READABLE first and spooky second:
 *
 *   silhouette  → a prop layer (hooks, clasps, a bell dome, a coat collar…)
 *   shape.body  → the trunk archetype: squat | tall-thin | sprawling | floating
 *   shape.limbs → how many spindly legs/arms hang off it
 *   shape.eyes  → how many eyes, and therefore how the face is arranged
 *
 * SVG, because it stays crisp at any size and because the whole rig animates
 * from ~7 transform writes per enemy per frame — 4 enemies is ~28 writes, which
 * is nothing. No per-frame allocation: every string is built with a scratch
 * array and cached numbers.
 *
 *   const v = new EnemyView(snap, { clock, reduceMotion });
 *   host.appendChild(v.el);
 *   v.setState(snap);  v.setIntent(intent, { playerHp });
 *   await v.windup('attack');  await v.strike();  v.flinch(9);  await v.die();
 *   v.update(dt, t);   // once per frame from the scene
 *
 * ── DELIVERING a hit, not just receiving one ────────────────────────────────
 * Round 3's receiving side was strong (flinch, flash, shards, HP drain lag, a
 * real dissolve) and its delivering side did not exist: measured across a full
 * enemy attack the sprite moved 8.2 px, all of it idle sway, and the fourteen
 * captured frames were byte-identical. The cause was that the whole pose lived
 * in RIG SPACE — `lean * -26` inside a viewBox that `meet`-fits into a ~170 px
 * stage, so a full-commitment lunge was worth about twelve screen pixels, and a
 * critically-damped spring chasing a 85 ms target never reached even that.
 *
 * The attack pose is now driven in SCREEN PIXELS by explicit ramps (never a
 * spring — a spring cannot promise it arrives), published as `--e-lx/--e-ly` on
 * the creature's own element so `.cb-enemy`'s rect genuinely moves and can be
 * measured, and shaped per silhouette family: a bell SWINGS, a suitcase LUNGES,
 * a carpet RIPPLES.  See `MOTIF` / `MOTIFS` below.
 */

import { Clock } from '../core/clock.js';
import { IntentView, statusIconId } from './intent.js';
import { iconSvg } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

/* ── deterministic per-enemy noise ─────────────────────────────────────────── */
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── geometry helpers ──────────────────────────────────────────────────────── */
/** Closed Catmull-Rom through `pts`, emitted as cubics. Charmingly lumpy. */
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)}`
      + ` ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)}`
      + ` ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}
const f = (v) => (Math.round(v * 10) / 10);

/**
 * An organic trunk. Centre is (0, -ry); the base sits on y = 0.
 * `flat` pins the bottom vertices to the floor so it reads as standing.
 */
function blob(rnd, rx, ry, o = {}) {
  const n = o.n || 20, wob = o.wob ?? 0.075, flat = o.flat !== false;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const r = 1 + (rnd() * 2 - 1) * wob;
    let x = Math.cos(a) * rx * r;
    let y = -ry + Math.sin(a) * ry * r;
    if (flat && y > -ry * 0.10) y = Math.min(y, 0) * 0.35;
    pts.push([x, y]);
  }
  return smoothClosed(pts);
}

function roundRect(x, y, w, h, r) {
  return `M${f(x + r)},${f(y)} H${f(x + w - r)} A${r},${r} 0 0 1 ${f(x + w)},${f(y + r)}`
    + ` V${f(y + h - r)} A${r},${r} 0 0 1 ${f(x + w - r)},${f(y + h)}`
    + ` H${f(x + r)} A${r},${r} 0 0 1 ${f(x)},${f(y + h - r)}`
    + ` V${f(y + r)} A${r},${r} 0 0 1 ${f(x + r)},${f(y)} Z`;
}

/* ── body archetypes ───────────────────────────────────────────────────────── */
const BODY = {
  squat: (rnd) => ({ path: blob(rnd, 78, 62, { wob: 0.10 }), w: 78, h: 62, lift: 0 }),
  'tall-thin': (rnd) => ({ path: blob(rnd, 52, 98, { wob: 0.06, n: 22 }), w: 52, h: 98, lift: 0 }),
  sprawling: (rnd) => ({ path: blob(rnd, 100, 46, { wob: 0.13, n: 24 }), w: 100, h: 46, lift: 0 }),
  floating: (rnd) => ({ path: blob(rnd, 62, 68, { wob: 0.07, n: 20, flat: false }), w: 62, h: 68, lift: 30 }),
};

/* ── how a creature COMMITS to a hit ────────────────────────────────────────
 * Screen pixels, not rig units. The player stands bottom-LEFT, so forward is
 * −x / +y. Every motif has the same three beats and differs only in shape:
 *
 *   b*  the wind-up pose        held ~120 ms before the move resolves
 *   f*  the contact pose        reached in ~90 ms, exactly on the damage event
 *   s*  the follow-through      drifted back over ~250 ms
 *
 * `mass` scales the travel down for heavy things (a bolted bell does not leap
 * across the room) and up for light ones, so weight reads without any text.
 */
const MOTIFS = {
  // a thrown suitcase of a hit: back, then the whole body goes
  lunge:  { bx: 20, by: -6, br: -5, fx: -50, fy: 12, fr: 10, sx: -12, sy: 3, sr: 3 },
  // hops: leaves the floor on the way in
  pounce: { bx: 16, by: 12, br: 2, fx: -56, fy: -30, fr: -8, sx: -10, sy: -4, sr: -2 },
  // a bell does not travel, it SWINGS — nearly all of the read is rotation
  swing:  { bx: 12, by: -3, br: -19, fx: -26, fy: 2, fr: 24, sx: -4, sy: 0, sr: -7 },
  // a tall formal thing stoops over you
  stoop:  { bx: 16, by: -8, br: -6, fx: -44, fy: 14, fr: 13, sx: -11, sy: 4, sr: 4 },
  // heavy: gathers high, comes down
  slam:   { bx: 10, by: -20, br: -3, fx: -30, fy: 26, fr: 7, sx: -6, sy: 6, sr: 2 },
  // a rug/blanket travels flat and fast, and rolls rather than tips
  ripple: { bx: 26, by: 2, br: 4, fx: -58, fy: 0, fr: -6, sx: -14, sy: 0, sr: -2 },
  // a jack-in-the-box is a coil release
  spring: { bx: 4, by: 18, br: 0, fx: -36, fy: -42, fr: -14, sx: -8, sy: -6, sr: -4 },
  // something that has no feet slides in
  drift:  { bx: 14, by: -12, br: -4, fx: -40, fy: 8, fr: 8, sx: -10, sy: 2, sr: 3 },
};

/** silhouette -> motif. Anything unlisted falls back to its body archetype. */
const MOTIF = {
  'service-bell': 'swing', 'great-bell': 'swing',
  'rug-serpent': 'ripple', 'blanket-pile': 'ripple', 'blanket-crawl': 'ripple',
  'blanket-hydra': 'ripple', pillow: 'ripple', slippers: 'ripple',
  suitcase: 'lunge', door: 'lunge', wardrobe: 'lunge', 'wardrobe-door': 'lunge',
  'wardrobe-arm': 'lunge', 'toy-chest': 'lunge',
  jackbox: 'spring',
  dustball: 'pounce', 'under-bed-claws': 'pounce', 'rocking-horse': 'pounce',
  'hydra-head': 'pounce',
  'shadow-shape': 'drift', 'faceless-guest': 'drift',
  butler: 'stoop', governess: 'stoop', coatrack: 'stoop', 'coat-rack-mass': 'stoop',
  'toy-soldier': 'stoop', 'porcelain-doll': 'stoop', 'porcelain-twin': 'stoop',
  'favorite-doll': 'stoop', 'button-doll': 'stoop',
  'patchwork-giant': 'slam', bedframe: 'slam', snuffer: 'slam',
};
const BODY_MOTIF = { squat: 'pounce', 'tall-thin': 'stoop', sprawling: 'ripple', floating: 'drift' };

/* ── silhouette props ──────────────────────────────────────────────────────── */
/**
 * Each returns { back, front, faceY, faceScale, override } in body space
 * (origin at the base centre, up is negative y).  `override` replaces the trunk.
 *
 * `front` draws over the trunk and under the face; `over` draws over the FACE,
 * which is the only way to put a hat brim, a veil or a held prop in front of a
 * creature's own eyes.  Anything in `back` that does not extend past the trunk
 * outline is invisible — that is how The Governess's bun, cape and collar all
 * ended up inside her own silhouette and she shipped as a brown oval.
 */
const PROPS = {
  /**
   * The Dust Bunny. It shipped as a grey egg with a few hairs and it is the
   * FIRST creature in the game, so it is the one that has to say "this is a
   * mansion full of cute-spooky junk" in one silhouette. It is now a ragged
   * lint ball: a spiked trunk, a long trailing wisp on each side, three stubby
   * feet and a lint crest.
   */
  dustball: (b, rnd) => {
    // a genuinely ragged outline: alternate long and short spikes
    const pts = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2;
      const spike = i % 2 ? 1.24 + rnd() * 0.2 : 0.92;
      let x = Math.cos(a) * b.w * spike;
      let y = -b.h + Math.sin(a) * b.h * spike;
      if (y > -b.h * 0.14) y = Math.min(y, 0) * 0.3;
      pts.push([x, y]);
    }
    let tufts = '';
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI * 0.98 + (i / 10) * Math.PI * 1.06;
      const x = Math.cos(a) * b.w * 1.12, y = -b.h + Math.sin(a) * b.h * 1.16;
      const l = 14 + rnd() * 20;
      tufts += `<path class="rg-tuft" d="M${f(x)},${f(y)} q${f(Math.cos(a) * l * 0.6)},${f(Math.sin(a) * l * 0.5 - 6)}`
        + ` ${f(Math.cos(a) * l)},${f(Math.sin(a) * l)}"/>`;
    }
    // two long wisps trailing off the sides, the thing that makes it read as DUST
    tufts += `<path class="rg-tuft" d="M${f(-b.w * 1.05)},${f(-b.h * 0.5)} q${f(-b.w * 0.5)},6 ${f(-b.w * 0.86)},${f(-b.h * 0.34)}"/>`
      + `<path class="rg-tuft" d="M${f(b.w * 1.05)},${f(-b.h * 0.42)} q${f(b.w * 0.52)},10 ${f(b.w * 0.9)},${f(-b.h * 0.2)}"/>`;
    // three stubby feet so it stands rather than floats
    let feet = '';
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * b.w * 0.52;
      feet += `<ellipse class="rg-foot" cx="${f(x)}" cy="-5" rx="${f(b.w * 0.19)}" ry="8"/>`;
    }
    return {
      override: smoothClosed(pts),
      back: tufts + feet,
      // motes orbiting it, because a dust bunny sheds
      front: `<circle class="rg-mote" cx="${f(-b.w * 1.25)}" cy="${f(-b.h * 1.35)}" r="4"/>`
        + `<circle class="rg-mote" cx="${f(b.w * 1.18)}" cy="${f(-b.h * 1.6)}" r="3"/>`
        + `<circle class="rg-mote" cx="${f(b.w * 0.5)}" cy="${f(-b.h * 1.9)}" r="2.6"/>`,
      faceY: -0.54,
    };
  },
  /**
   * Coatrack Crawler — "six carved legs, four brass hooks, and one very old
   * umbrella it has never once put down." All three of those are now on screen.
   * The trunk becomes a turned post so it is not a blob with a stick on it.
   */
  coatrack: (b) => ({
    override: `M${-b.w * 0.42},0 L${-b.w * 0.3},${-b.h * 0.5}`
      + ` q${-b.w * 0.28},${-b.h * 0.12} ${-b.w * 0.02},${-b.h * 0.26}`      // lower knop
      + ` L${-b.w * 0.26},${-b.h * 1.15}`
      + ` q${-b.w * 0.3},${-b.h * 0.1} ${0},${-b.h * 0.24}`                   // upper knop
      + ` L${-b.w * 0.2},${-b.h * 1.72} H${b.w * 0.2}`
      + ` L${b.w * 0.26},${-b.h * 1.39} q${b.w * 0.3},${-b.h * 0.1} ${0},${b.h * 0.24}`
      + ` L${b.w * 0.3},${-b.h * 0.76} q${b.w * 0.28},${-b.h * 0.12} ${b.w * 0.02},${b.h * 0.26}`
      + ` L${b.w * 0.42},0 Z`,
    back: `<path class="rg-ln" d="M${-b.w * 1.5},${-b.h * 1.66} H${b.w * 1.5}"/>`   // the hook bar
      + hooks(-b.h * 1.66, 4, b.w * 1.34)
      + `<ellipse class="rg-foot" cx="0" cy="-4" rx="${f(b.w * 1.1)}" ry="10"/>`,
    // the coat, and the umbrella held out to one side
    front: `<path class="rg-coat" d="M${-b.w * 1.16},${-b.h * 1.58} q${b.w * 0.5},${b.h * 0.18} ${b.w * 0.44},${b.h * 0.62}`
      + ` l${-b.w * 0.16},${b.h * 0.76} h${-b.w * 0.62} q${-b.w * 0.24},${-b.h * 0.7} ${b.w * 0.34},${-b.h * 1.38} Z"/>`
      + `<path class="rg-ln2" d="M${b.w * 1.28},${-b.h * 1.56} L${b.w * 1.06},${-b.h * 0.12}"/>`
      + `<path class="rg-umb" d="M${b.w * 1.28},${-b.h * 1.56} q${-b.w * 0.3},${b.h * 0.26} ${-b.w * 0.16},${b.h * 0.78}`
      + ` q${b.w * 0.2},${b.h * 0.1} ${b.w * 0.34},${-b.h * 0.06} q${b.w * 0.06},${-b.h * 0.5} ${-b.w * 0.18},${-b.h * 0.72} Z"/>`
      + `<path class="rg-hook" d="M${b.w * 1.06},${-b.h * 0.12} q0,${b.h * 0.14} ${-b.w * 0.24},${b.h * 0.1}"/>`,
    faceY: -1.44, faceScale: 0.62,
  }),
  /**
   * The Grand Coatcheck (Big Scare) — "every coat left behind since the house
   * opened, and it has learned to wear all of them at once." A rail, five
   * hangers, and a mountain of overlapping coats with a ragged hem.
   */
  'coat-rack-mass': (b) => {
    /* `sprawling` is 100 wide by 46 tall, and a MOUNTAIN of coats measured in
       units of 46 came out as a squashed pancake. Everything vertical here is
       measured in `H` instead, so the archetype sets the footprint and the prop
       sets the height. */
    const H = Math.max(b.h, b.w * 0.86);
    let coats = '', bar = '';
    const N = 5;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = (t - 0.5) * b.w * 1.62;
      const drop = H * (1.5 + (i % 2) * 0.3);
      const wide = b.w * (0.34 + (i % 2) * 0.06);
      bar += `<path class="rg-hook" d="M${f(x)},${f(-H * 2.5)} v${f(H * 0.16)}"/>`
        + `<path class="rg-hook" d="M${f(x - wide * 0.8)},${f(-H * 2.3)} L${f(x)},${f(-H * 2.38)} L${f(x + wide * 0.8)},${f(-H * 2.3)}"/>`;
      // one coat: shoulders, body, ragged hem
      coats += `<path class="rg-coat" d="M${f(x - wide)},${f(-H * 2.26)}`
        + ` q${f(wide)},${f(-H * 0.2)} ${f(wide * 2)},0`
        + ` l${f(wide * 0.34)},${f(drop)}`
        + ` q${f(-wide)},${f(H * 0.16)} ${f(-wide * 2.68)},0 Z" opacity="${(0.74 + i * 0.05).toFixed(2)}"/>`
        // a sleeve hanging off it
        + `<path class="rg-sleeve" d="M${f(x - wide * 0.9)},${f(-H * 2.1)}`
        + ` q${f(-wide * 0.5)},${f(H * 0.4)} ${f(-wide * 0.2)},${f(H * 0.8)}"/>`;
    }
    return {
      override: `M${-b.w * 1.12},0 q${-b.w * 0.04},${-H * 1.6} ${b.w * 0.36},${-H * 2.32}`
        + ` q${b.w * 0.76},${-H * 0.4} ${b.w * 1.52},0`
        + ` q${b.w * 0.4},${H * 0.72} ${b.w * 0.36},${H * 2.32} Z`,
      back: `<path class="rg-ln" d="M${-b.w * 1.3},${-H * 2.52} H${b.w * 1.3}"/>` + bar,
      front: coats,
      faceY: -H * 1.66 / b.h, faceScale: 1.05,
    };
  },
  suitcase: (b) => ({
    override: roundRect(-b.w, -b.h * 1.5, b.w * 2, b.h * 1.5, 10),
    back: `<path class="rg-ln" d="M-18,${-b.h * 1.5} v-12 a18,12 0 0 1 36,0 v12"/>`,
    front: `<path class="rg-ln2" d="M${-b.w},${-b.h * 0.86} H${b.w}"/>`
      + `<rect class="rg-metal" x="-40" y="${-b.h * 0.95}" width="16" height="16" rx="3"/>`
      + `<rect class="rg-metal" x="24" y="${-b.h * 0.95}" width="16" height="16" rx="3"/>`
      + `<path class="rg-ln2" d="M${b.w - 6},${-b.h * 1.2} l16,26"/><circle class="rg-metal" cx="${b.w + 12}" cy="${-b.h * 1.2 + 30}" r="9"/>`,
    faceY: -0.42,
  }),
  'service-bell': (b) => ({
    override: `M0,${-b.h * 1.6} a${b.w * 0.92},${b.h * 1.45} 0 0 0 ${-b.w * 0.92},${b.h * 1.45} h${b.w * 1.84} a${b.w * 0.92},${b.h * 1.45} 0 0 0 ${-b.w * 0.92},${-b.h * 1.45} Z`,
    // a hexagonal desk plate under it, and the plunger it rings itself with
    back: `<path class="rg-plate" d="M${-b.w * 1.24},-8 l${b.w * 0.28},-13 h${b.w * 1.92} l${b.w * 0.28},13`
      + ` l${-b.w * 0.28},13 h${-b.w * 1.92} Z"/>`
      + `<path class="rg-ln" d="M0,${-b.h * 1.56} v${-b.h * 0.34}"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.98}" r="13"/>`,
    // the sound: two faint arcs well clear of the dome, so they read as RINGING
    // rather than as a pair of arms
    front: `<path class="rg-ring" d="M${-b.w * 1.5},${-b.h * 1.9} a${b.w * 0.62},${b.h * 0.62} 0 0 0 0,${b.h * 0.9}"/>`
      + `<path class="rg-ring" d="M${b.w * 1.5},${-b.h * 1.9} a${b.w * 0.62},${b.h * 0.62} 0 0 1 0,${b.h * 0.9}"/>`,
    faceY: -0.7, faceScale: 0.85,
  }),
  /**
   * The House Bell (Big Scare) — "bolted to the house itself." A real church
   * bell: a headstock beam across the top with two brackets, a rope, banded
   * inscription rings, a flared lip, and the clapper hanging inside it.
   */
  'great-bell': (b) => ({
    // symmetric by construction: left flank mirrors the right, so the mouth of
    // the bell is level. Hand-written `c` pairs came out visibly lopsided.
    override: `M${-b.w * 0.52},${-b.h * 2.2} H${b.w * 0.52}`
      + ` C${b.w * 0.62},${-b.h * 1.7} ${b.w * 1.12},${-b.h * 0.9} ${b.w * 1.2},${-b.h * 0.2}`
      + ` H${b.w * 1.34} V0 H${-b.w * 1.34} V${-b.h * 0.2} H${-b.w * 1.2}`
      + ` C${-b.w * 1.12},${-b.h * 0.9} ${-b.w * 0.62},${-b.h * 1.7} ${-b.w * 0.52},${-b.h * 2.2} Z`,
    // headstock beam + brackets + rope: it hangs, it is not standing there
    back: `<path class="rg-beam" d="M${-b.w * 1.5},${-b.h * 2.72} h${b.w * 3} v${b.h * 0.3} h${-b.w * 3} Z"/>`
      + `<path class="rg-ln" d="M${-b.w * 0.62},${-b.h * 2.42} v${b.h * 0.26} M${b.w * 0.62},${-b.h * 2.42} v${b.h * 0.26}"/>`
      + `<circle class="rg-metal" cx="${f(-b.w * 1.5)}" cy="${f(-b.h * 2.57)}" r="10"/>`
      + `<circle class="rg-metal" cx="${f(b.w * 1.5)}" cy="${f(-b.h * 2.57)}" r="10"/>`
      + `<path class="rg-rope" d="M${b.w * 1.5},${-b.h * 2.5} q${b.w * 0.3},${b.h * 0.9} ${b.w * 0.1},${b.h * 1.9}`
      + ` q${-b.w * 0.16},${b.h * 0.6} ${b.w * 0.06},${b.h * 0.9}"/>`,
    front: `<path class="rg-band" d="M${-b.w * 0.86},${-b.h * 1.16} q${b.w * 0.86},${-b.h * 0.16} ${b.w * 1.72},0"/>`
      + `<path class="rg-band" d="M${-b.w * 1.06},${-b.h * 0.62} q${b.w * 1.06},${-b.h * 0.16} ${b.w * 2.12},0"/>`
      // the crack lives DOWN the flank, not beside the eyes — at eye height a
      // three-segment jag reads as whiskers and the bell reads as a cat
      + `<path class="rg-crack" d="M${-b.w * 0.86},${-b.h * 1.06} l16,30 l-11,26 l9,22"/>`
      + `<path class="rg-ln" d="M0,${-b.h * 0.86} v${b.h * 0.58}"/>`
      + `<ellipse class="rg-metal" cx="0" cy="${-b.h * 0.2}" rx="17" ry="21"/>`,
    faceY: -1.44, faceScale: 0.94,
  }),
  'rug-serpent': (b) => ({
    override: `M${-b.w * 1.15},0 q${b.w * 0.28},${-b.h * 1.5} ${b.w * 0.62},${-b.h * 1.05}`
      + ` q${b.w * 0.34},${b.h * 0.42} ${b.w * 0.68},${-b.h * 0.5}`
      + ` q${b.w * 0.4},${-b.h * 0.7} ${b.w * 0.98},${-b.h * 0.2}`
      + ` q${b.w * 0.2},${b.h * 1.4} ${-b.w * 0.2},${b.h * 1.75} Z`,
    front: fringe(-b.w * 1.1, b.w * 1.0, 0, 12)
      + `<path class="rg-ln2" d="M${-b.w * 0.9},${-b.h * 0.35} q${b.w * 0.9},${-b.h * 0.55} ${b.w * 1.8},${-b.h * 0.1}"/>`,
    faceY: -1.35, faceScale: 0.72, faceX: 0.6,
  }),
  door: (b) => ({
    override: roundRect(-b.w * 0.92, -b.h * 2.0, b.w * 1.84, b.h * 2.0, 8),
    front: `<path class="rg-ln2" d="${roundRect(-b.w * 0.62, -b.h * 1.82, b.w * 1.24, b.h * 0.72, 4)}"/>`
      + `<path class="rg-ln2" d="${roundRect(-b.w * 0.62, -b.h * 0.94, b.w * 1.24, b.h * 0.72, 4)}"/>`
      + `<circle class="rg-metal" cx="${b.w * 0.66}" cy="${-b.h}" r="9"/>`,
    faceY: -1.5, faceScale: 0.8,
  }),
  /**
   * The Unwelcome Guest (Big Scare) — "its coat hangs incorrectly, its shadow
   * faces the wrong way, nobody remembers seeing it come in." It is a HAT, a
   * long overcoat with lapels, gloved hands and no face. Round 3 drew a shade
   * wedge and a 48px void inside a plain tall blob and it read as a blob.
   */
  'faceless-guest': (b) => ({
    // the coat IS the body: narrow shoulders, long flared hem
    override: `M${-b.w * 0.52},${-b.h * 1.86}`
      + ` q${b.w * 0.52},${-b.h * 0.2} ${b.w * 1.04},0`
      + ` q${b.w * 0.46},${b.h * 0.24} ${b.w * 0.56},${b.h * 0.86}`
      + ` L${b.w * 1.24},0 H${-b.w * 1.24}`
      + ` L${-b.w * 1.08},${-b.h} q${b.w * 0.1},${-b.h * 0.62} ${b.w * 0.56},${-b.h * 0.86} Z`,
    // the wrong-way shadow, cast to the same side as the light
    back: `<ellipse class="rg-wrongshadow" cx="${f(b.w * 1.5)}" cy="-6" rx="${f(b.w * 0.9)}" ry="12"/>`,
    front:
      // A NECK. Round 4's first pass put it in `back`, behind the very trunk
      // hiding it, and the hat floated 30px clear of the shoulders with a gap.
      `<path class="rg-neck2" d="M${-b.w * 0.26},${-b.h * 1.78} h${b.w * 0.52} v${-b.h * 0.34} h${-b.w * 0.52} Z"/>`
      + `<ellipse class="rg-void" cx="0" cy="${f(-b.h * 2.16)}" rx="${f(b.w * 0.46)}" ry="${f(b.h * 0.32)}"/>`
      +
      // lapels — the single clearest "this is a coat" mark
      `<path class="rg-lapel" d="M${-b.w * 0.5},${-b.h * 1.84} L0,${-b.h * 1.28} L${-b.w * 0.16},${-b.h * 0.9} Z"/>`
      + `<path class="rg-lapel" d="M${b.w * 0.5},${-b.h * 1.84} L0,${-b.h * 1.28} L${b.w * 0.16},${-b.h * 0.9} Z"/>`
      + `<path class="rg-ln2" d="M0,${-b.h * 1.28} V${-b.h * 0.12}"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 0.98}" r="5"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 0.66}" r="5"/>`
      // gloved hands, one of them a little too far forward
      + `<ellipse class="rg-glove" cx="${f(-b.w * 1.12)}" cy="${f(-b.h * 0.6)}" rx="13" ry="17"/>`
      + `<ellipse class="rg-glove" cx="${f(b.w * 1.06)}" cy="${f(-b.h * 0.78)}" rx="13" ry="17"/>`,
    // the hat draws OVER everything, so its brim cuts the void where a face is
    over: `<path class="rg-hat" d="M${-b.w * 1.04},${-b.h * 2.36} q${b.w * 1.04},${b.h * 0.2} ${b.w * 2.08},0`
      + ` q${-b.w * 1.04},${-b.h * 0.22} ${-b.w * 2.08},0 Z"/>`
      + `<path class="rg-hat" d="M${-b.w * 0.58},${-b.h * 2.38} q0,${-b.h * 0.5} ${b.w * 0.58},${-b.h * 0.48}`
      + ` q${b.w * 0.58},${-b.h * 0.02} ${b.w * 0.58},${b.h * 0.48} Z"/>`
      + `<path class="rg-band2" d="M${-b.w * 0.58},${-b.h * 2.42} h${b.w * 1.16}"/>`,
    faceY: -2.16, faceScale: 0.9, grad: 'dark',
  }),
  bedframe: (b) => ({
    back: `<path class="rg-ln" d="M${-b.w},${-b.h * 1.1} V${-b.h * 2.2} M${b.w},${-b.h * 1.1} V${-b.h * 2.2} M${-b.w},${-b.h * 2.1} H${b.w}"/>`
      + bars(-b.w * 0.7, b.w * 0.7, -b.h * 2.05, -b.h * 1.1, 4),
    faceY: -0.6,
  }),
  'blanket-pile': (b, rnd) => ({ back: quilt(b, rnd), faceY: -0.55 }),
  'blanket-crawl': (b, rnd) => ({ back: quilt(b, rnd), faceY: -0.5 }),
  'blanket-hydra': (b, rnd) => ({ back: necks(b, 3) + quilt(b, rnd), faceY: -0.5 }),
  'hydra-head': (b) => ({ back: necks(b, 3), faceY: -0.7 }),
  pillow: (b) => ({
    override: `M${-b.w},${-b.h * 0.1} q${-10},${-b.h * 0.75} ${8},${-b.h * 1.25} q${b.w},${-24} ${b.w * 1.92},0 q${18},${b.h * 0.5} ${8},${b.h * 1.25} q${-b.w},${26} ${-b.w * 1.92},0 Z`,
    front: `<path class="rg-ln2" d="M${-b.w * 0.85},${-b.h * 0.2} q${b.w * 0.85},${-16} ${b.w * 1.7},0"/>`,
    faceY: -0.55,
  }),
  slippers: (b) => ({
    override: `M${-b.w},0 q0,${-b.h * 1.1} ${b.w * 0.72},${-b.h * 1.05} q${b.w * 0.24},${b.h * 0.05} ${b.w * 0.2},${b.h * 1.05} Z`
      + ` M${b.w * 0.06},0 q0,${-b.h * 0.95} ${b.w * 0.7},${-b.h * 0.9} q${b.w * 0.24},${b.h * 0.05} ${b.w * 0.2},${b.h * 0.9} Z`,
    front: `<path class="rg-shade" d="M${-b.w * 0.86},${-b.h * 0.9} q${b.w * 0.5},${-12} ${b.w * 0.78},2"/>`,
    faceY: -0.55, faceScale: 0.72, faceX: -0.45,
  }),
  'toy-chest': (b) => ({
    override: roundRect(-b.w, -b.h * 1.25, b.w * 2, b.h * 1.25, 7),
    /* `rg-lid` is the EYELID class — `_eyes()` emits one per eye and `update()`
       scales every `.rg-lid` it finds to blink them. The chest's lid was in the
       same class, so the Toy Chest's lid folded flat every time it blinked. */
    back: `<path class="rg-chestlid" d="M${-b.w - 5},${-b.h * 1.25} h${b.w * 2 + 10} l-8,-22 h${-b.w * 2 + 6} Z"/>`,
    front: `<rect class="rg-metal" x="-13" y="${-b.h * 0.92}" width="26" height="20" rx="4"/>`,
    faceY: -0.5,
  }),
  'toy-soldier': (b) => ({
    back: `<path class="rg-hat" d="M${-b.w * 0.72},${-b.h * 1.42} h${b.w * 1.44} l-6,-40 h${-b.w * 1.44 + 12} Z"/>`
      + `<path class="rg-ln" d="M${b.w * 0.85},${-b.h * 1.25} l16,-64"/>`,
    front: `<circle class="rg-metal" cx="0" cy="${-b.h * 0.72}" r="6"/><circle class="rg-metal" cx="0" cy="${-b.h * 0.42}" r="6"/>`,
    faceY: -1.05, faceScale: 0.78,
  }),
  'rocking-horse': (b) => ({
    back: `<path class="rg-ln" d="M${-b.w * 1.2},${-6} q${b.w * 1.2},${34} ${b.w * 2.4},0"/>`
      + `<path class="rg-mane" d="M${b.w * 0.3},${-b.h * 1.5} q28,-18 38,10 q-20,-2 -30,14 Z"/>`
      + `<path class="rg-mane" d="M${-b.w * 0.95},${-b.h * 0.95} q-34,20 -14,44 q4,-26 22,-30 Z"/>`,
    faceY: -1.35, faceScale: 0.72, faceX: 0.55,
  }),
  'porcelain-doll': (b, rnd) => ({ back: dollHair(b), front: cracks(b, rnd, 2) + dress(b), faceY: -1.28, faceScale: 0.86 }),
  'porcelain-twin': (b, rnd) => ({ back: dollHair(b), front: cracks(b, rnd, 3) + dress(b), faceY: -1.28, faceScale: 0.86 }),
  'favorite-doll': (b) => ({ back: dollHair(b), front: dress(b), faceY: -1.28, faceScale: 0.9 }),
  'button-doll': (b) => ({
    back: dollHair(b),
    front: dress(b) + `<path class="rg-stitch" d="M${-b.w * 0.4},${-b.h * 0.95} h${b.w * 0.8}"/>`,
    faceY: -1.26, faceScale: 0.9, buttons: true,
  }),
  jackbox: (b) => ({
    override: roundRect(-b.w * 0.86, -b.h * 1.1, b.w * 1.72, b.h * 1.1, 6),
    back: `<path class="rg-spring" d="M0,${-b.h * 1.1} q26,-14 0,-28 q-26,-14 0,-28 q26,-14 0,-28"/>`
      + `<path class="rg-ln" d="M${b.w * 0.86},${-b.h * 0.7} l20,-6"/><circle class="rg-metal" cx="${b.w * 0.86 + 24}" cy="${-b.h * 0.78}" r="8"/>`,
    faceY: -1.62, faceScale: 0.72,
  }),
  wardrobe: (b) => ({
    override: roundRect(-b.w * 1.1, -b.h * 1.95, b.w * 2.2, b.h * 1.95, 8),
    front: `<path class="rg-ln2" d="M0,${-b.h * 1.9} V-6"/>`
      + `<circle class="rg-metal" cx="-11" cy="${-b.h}" r="7"/><circle class="rg-metal" cx="11" cy="${-b.h}" r="7"/>`,
    faceY: -1.5, faceScale: 0.86,
  }),
  'wardrobe-door': (b) => ({
    override: roundRect(-b.w * 0.8, -b.h * 1.95, b.w * 1.6, b.h * 1.95, 8),
    front: `<path class="rg-ln2" d="${roundRect(-b.w * 0.55, -b.h * 1.75, b.w * 1.1, b.h * 1.5, 5)}"/>`
      + `<circle class="rg-metal" cx="${b.w * 0.56}" cy="${-b.h}" r="8"/>`,
    faceY: -1.45, faceScale: 0.86,
  }),
  'wardrobe-arm': (b) => ({
    override: roundRect(-b.w * 0.9, -b.h * 1.6, b.w * 1.8, b.h * 1.6, 8),
    back: `<path class="rg-limb" d="M${b.w * 0.85},${-b.h * 1.2} q60,-10 74,44"/>`,
    front: `<circle class="rg-metal" cx="${b.w * 0.5}" cy="${-b.h * 0.85}" r="7"/>`,
    faceY: -1.2, faceScale: 0.8,
  }),
  'under-bed-claws': (b) => {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const x = -b.w * 0.8 + (i / 4) * b.w * 1.6;
      s += `<path class="rg-claw" d="M${f(x)},4 q${6},${-b.h * 0.9} ${16},${-b.h * 1.25} q${-2},${b.h * 0.8} ${2},${b.h * 1.25} Z"/>`;
    }
    return { back: s, faceY: -0.42, faceScale: 0.8 };
  },
  'shadow-shape': (b) => ({ front: `<path class="rg-void" d="M${-b.w * 0.7},${-b.h * 0.9} q${b.w * 0.7},${-b.h * 0.5} ${b.w * 1.4},0 q${-b.w * 0.7},${b.h * 1.1} ${-b.w * 1.4},0 Z"/>`, faceY: -0.86, glow: true }),
  snuffer: (b) => ({
    override: `M0,${-b.h * 1.75} L${-b.w * 0.85},0 H${b.w * 0.85} Z`,
    back: `<path class="rg-ln" d="M0,${-b.h * 1.75} v-46"/><circle class="rg-metal" cx="0" cy="${-b.h * 1.75 - 52}" r="8"/>`,
    faceY: -0.72, faceScale: 0.78,
  }),
  'patchwork-giant': (b, rnd) => ({ front: stitches(b, rnd, 5), faceY: -1.25, faceScale: 0.95 }),
  /**
   * The Butler. He is the 250-Courage region boss and round 1 drew him as a
   * grey blob with two eyes, because the only props he had were a 48px collar
   * and a bow tie the size of a coin, both filled in his own coat colour.
   * A butler is READ from three things — a white shirt front, a wing collar and
   * a black tie — so all three are now full-size and in contrasting fills.
   */
  butler: (b) => ({
    // tailcoat: narrow shoulders, a nipped waist, and two tails past the knee
    override: `M${-b.w * 0.44},${-b.h * 2.24}`
      + ` q${b.w * 0.44},${-b.h * 0.16} ${b.w * 0.88},0`
      + ` q${b.w * 0.62},${b.h * 0.2} ${b.w * 0.72},${b.h * 0.9}`      // right shoulder
      + ` L${b.w * 0.92},${-b.h * 0.66} L${b.w * 0.7},0 H${b.w * 0.2}`
      + ` L${b.w * 0.28},${-b.h * 0.66} H${-b.w * 0.28} L${-b.w * 0.2},0 H${-b.w * 0.7}`
      + ` L${-b.w * 0.92},${-b.h * 0.66} L${-b.w * 1.16},${-b.h * 1.34}`
      + ` q${b.w * 0.1},${-b.h * 0.7} ${b.w * 0.72},${-b.h * 0.9} Z`,
    // head on a real neck, hair parted, plus the coat tails behind the legs
    back: `<ellipse class="rg-head2" cx="0" cy="${f(-b.h * 2.54)}" rx="${f(b.w * 0.56)}" ry="${f(b.h * 0.36)}"/>`
      // combed flat and parted, in HAIR colour: `.rg-hair` is `--e3`, which on
      // his palette is the same cream as his own face, so round 4's first pass
      // gave him a white cap on a white head.
      + `<path class="rg-updo" d="M${-b.w * 0.6},${-b.h * 2.66} q${b.w * 0.16},${-b.h * 0.32} ${b.w * 0.6},${-b.h * 0.26}`
      + ` q${b.w * 0.46},${-b.h * 0.04} ${b.w * 0.6},${b.h * 0.26} q${-b.w * 0.34},${-b.h * 0.14} ${-b.w * 0.62},${b.h * 0.06}`
      + ` q${-b.w * 0.28},${-b.h * 0.14} ${-b.w * 0.58},${-b.h * 0.06} Z"/>`
      + `<path class="rg-tail" d="M${-b.w * 0.62},${-b.h * 0.8} q${-b.w * 0.4},${b.h * 0.5} ${-b.w * 0.22},${b.h * 0.86} l${b.w * 0.56},${-b.h * 0.2} Z"/>`
      + `<path class="rg-tail" d="M${b.w * 0.62},${-b.h * 0.8} q${b.w * 0.4},${b.h * 0.5} ${b.w * 0.22},${b.h * 0.86} l${-b.w * 0.56},${-b.h * 0.2} Z"/>`,
    // a starched shirt front, a wing collar, a black tie — and the SILVER TRAY,
    // held out flat. It is the shape you recognise a butler by at 40px.
    front: `<path class="rg-shirt" d="M${-b.w * 0.26},${-b.h * 2.2} L0,${-b.h * 1.9} L${b.w * 0.26},${-b.h * 2.2} L${b.w * 0.2},${-b.h * 1.1} h${-b.w * 0.4} Z"/>`
      + `<path class="rg-collar" d="M${-b.w * 0.38},${-b.h * 2.3} l${b.w * 0.38},${b.h * 0.42} l${b.w * 0.38},${-b.h * 0.42} l${-b.w * 0.14},${-b.h * 0.18} h${-b.w * 0.48} Z"/>`
      + `<path class="rg-bow" d="M${-b.w * 0.28},${-b.h * 1.9} l${b.w * 0.28},${b.h * 0.12} l${b.w * 0.28},${-b.h * 0.12} l${-b.w * 0.28},${-b.h * 0.12} Z"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.6}" r="5"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.38}" r="5"/>`
      // the arm that holds the tray, drawn in FRONT — behind the trunk it was
      // invisible and the tray floated unsupported beside him
      + `<path class="rg-arm" d="M${-b.w * 0.8},${-b.h * 1.96} q${-b.w * 0.44},${b.h * 0.32} ${-b.w * 0.32},${b.h * 0.5}"/>`
      + `<ellipse class="rg-glove2" cx="${f(-b.w * 1.12)}" cy="${f(-b.h * 1.44)}" rx="12" ry="10"/>`
      + `<ellipse class="rg-tray" cx="${f(-b.w * 1.6)}" cy="${f(-b.h * 1.52)}" rx="${f(b.w * 0.8)}" ry="${f(b.h * 0.13)}"/>`
      + `<ellipse class="rg-trayrim" cx="${f(-b.w * 1.6)}" cy="${f(-b.h * 1.52)}" rx="${f(b.w * 0.8)}" ry="${f(b.h * 0.13)}"/>`,
    faceY: -2.56, faceScale: 0.72, grad: 'dark',
  }),
  /**
   * The Governess. Her own flavour text is the brief and round 3 met none of
   * it: "her fingers taper into silver needles, and a measuring tape moves
   * around her neck like a snake." She shipped as a brown oval because her
   * only props were a 24px bun and a 52px collar, both inside her own trunk
   * outline and both in the `back` layer, i.e. behind the very shape hiding
   * them. She is now a floor-length high-collared dress, a severe bun on a
   * real head, EIGHT needle fingers, and the tape.
   */
  governess: (b) => {
    // the needles — four per hand, tapering to a point, at the end of each arm
    const hand = (hx, hy, dir) => {
      let s = `<path class="rg-cuff" d="M${f(hx - 13)},${f(hy - 13)} h26 v20 h-26 Z"/>`;
      for (let i = 0; i < 4; i++) {
        const a = (-0.5 + i * 0.34) * dir;
        const L = 40 + (i === 1 || i === 2 ? 12 : 0);
        s += `<path class="rg-needle" d="M${f(hx)},${f(hy + 4)} L${f(hx + Math.sin(a) * L)},${f(hy + Math.cos(a) * L)}"/>`;
      }
      return s;
    };
    return {
      // dress: high narrow shoulders down to a wide floor-length skirt
      override: `M${-b.w * 0.4},${-b.h * 2.16}`
        + ` q${b.w * 0.4},${-b.h * 0.14} ${b.w * 0.8},0`
        + ` q${b.w * 0.3},${b.h * 0.16} ${b.w * 0.34},${b.h * 0.66}`
        + ` L${b.w * 1.66},0 H${-b.w * 1.66}`
        + ` L${-b.w * 0.74},${-b.h * 1.5} q${b.w * 0.04},${-b.h * 0.5} ${b.w * 0.34},${-b.h * 0.66} Z`,
      back: `<ellipse class="rg-head2" cx="0" cy="${f(-b.h * 2.44)}" rx="${f(b.w * 0.5)}" ry="${f(b.h * 0.34)}"/>`
        // A SEVERE BUN, in hair colour and clearly separate from the skull.
        // `--e3` on her palette is cream — the same value as her face — so a bun
        // painted with it merged with her head into one pale lozenge.
        + `<path class="rg-updo" d="M0,${f(-b.h * 3.0)} a${f(b.w * 0.36)},${f(b.h * 0.22)} 0 1 0 0.1,0 Z"/>`
        + `<path class="rg-updo" d="M${-b.w * 0.54},${-b.h * 2.6} q${b.w * 0.04},${-b.h * 0.44} ${b.w * 0.54},${-b.h * 0.42}`
        + ` q${b.w * 0.5},${-b.h * 0.02} ${b.w * 0.54},${b.h * 0.42} q${-b.w * 0.2},${-b.h * 0.2} ${-b.w * 0.54},${-b.h * 0.16}`
        + ` q${-b.w * 0.34},${-b.h * 0.04} ${-b.w * 0.54},${b.h * 0.16} Z"/>`
        ,
      front:
        // a high lace collar, tight to the throat
        `<path class="rg-collar" d="M${-b.w * 0.42},${-b.h * 2.3} q${b.w * 0.42},${b.h * 0.3} ${b.w * 0.84},0`
        + ` l${-b.w * 0.08},${-b.h * 0.22} q${-b.w * 0.34},${-b.h * 0.1} ${-b.w * 0.68},0 Z"/>`
        // a row of tiny buttons down the bodice
        + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.9}" r="4"/>`
        + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.66}" r="4"/>`
        + `<circle class="rg-metal" cx="0" cy="${-b.h * 1.42}" r="4"/>`
        // pleats in the skirt
        + `<path class="rg-ln2" d="M${-b.w * 0.5},${-b.h * 1.1} L${-b.w * 1.2},${-b.h * 0.08}`
        + ` M0,${-b.h * 1.14} V${-b.h * 0.06} M${b.w * 0.5},${-b.h * 1.1} L${b.w * 1.2},${-b.h * 0.08}"/>`
        // the arms, thin and long, reaching down past the waist. In FRONT: the
        // trunk is an opaque dress, so anything behind it does not exist.
        + `<path class="rg-arm" d="M${-b.w * 0.58},${-b.h * 2.02} q${-b.w * 0.56},${b.h * 0.42} ${-b.w * 0.56},${b.h * 1.02}"/>`
        + `<path class="rg-arm" d="M${b.w * 0.58},${-b.h * 2.02} q${b.w * 0.56},${b.h * 0.42} ${b.w * 0.56},${b.h * 1.02}"/>`
        + hand(-b.w * 1.14, -b.h * 1.0, -1) + hand(b.w * 1.14, -b.h * 1.0, 1),
      // THE MEASURING TAPE — over the face layer, because it moves "around her
      // neck like a snake" and a snake is in front of you. It loops the throat
      // and drapes down ONE side; drawn down the centre it read as a bib.
      over: `<path class="rg-tape" d="M${-b.w * 0.54},${-b.h * 2.24}`
        + ` q${b.w * 0.54},${b.h * 0.3} ${b.w * 1.08},0`
        + ` q${b.w * 0.3},${b.h * 0.42} ${b.w * 0.06},${b.h * 0.82}`
        + ` q${-b.w * 0.36},${b.h * 0.34} ${b.w * 0.1},${b.h * 0.56}"/>`
        + `<path class="rg-tapetick" d="M${-b.w * 0.3},${-b.h * 2.2} v9 M0,${-b.h * 2.13} v9`
        + ` M${b.w * 0.3},${-b.h * 2.2} v9 M${b.w * 0.78},${-b.h * 1.6} h9`
        + ` M${b.w * 0.86},${-b.h * 1.2} h9"/>`,
      faceY: -2.46, faceScale: 0.64, grad: 'dark',
    };
  },
};

function hooks(y, n, span = 34) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = -span + (i / (n - 1)) * span * 2;
    s += `<path class="rg-hook" d="M${f(x)},${f(y)} v14 q0,10 10,10"/>`;
  }
  return s;
}
function bars(x0, x1, y0, y1, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + (i / (n - 1)) * (x1 - x0);
    s += `<path class="rg-ln2" d="M${f(x)},${f(y0)} V${f(y1)}"/>`;
  }
  return s;
}
function fringe(x0, x1, y, n) {
  let s = '';
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * (x1 - x0);
    s += `<path class="rg-ln2" d="M${f(x)},${f(y - 6)} v14"/>`;
  }
  return s;
}
function necks(b, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = (t - 0.5) * b.w * 1.5;
    const h = b.h * (1.5 + (i % 2) * 0.35);
    s += `<path class="rg-neck" d="M${f(x * 0.4)},${f(-b.h * 0.5)} Q${f(x)},${f(-h)} ${f(x * 1.25)},${f(-h - 14)}"/>`;
    s += `<ellipse class="rg-head" cx="${f(x * 1.25)}" cy="${f(-h - 20)}" rx="17" ry="14"/>`;
  }
  return s;
}
function quilt(b, rnd) {
  let s = '';
  for (let i = 0; i < 4; i++) {
    const y = -b.h * (0.28 + i * 0.22);
    s += `<path class="rg-ln2" d="M${f(-b.w * 0.9)},${f(y)} q${f(b.w * 0.45)},${f(-8 - rnd() * 10)} ${f(b.w * 0.9)},0 q${f(b.w * 0.45)},${f(8 + rnd() * 8)} ${f(b.w * 0.9)},0"/>`;
  }
  return s;
}
function dollHair(b) {
  return `<path class="rg-hair" d="M0,${f(-b.h * 1.95)} q${f(-b.w * 0.85)},0 ${f(-b.w * 0.8)},${f(b.h * 0.7)}`
    + ` q${f(-6)},${f(b.h * 0.5)} ${f(14)},${f(b.h * 0.35)} q${f(-16)},${f(-b.h * 0.6)} ${f(b.w * 0.15)},${f(-b.h * 0.72)}`
    + ` h${f(b.w * 1.3)} q${f(b.w * 0.3)},${f(b.h * 0.14)} ${f(b.w * 0.05)},${f(b.h * 0.72)}`
    + ` q${f(20)},${f(b.h * 0.15)} ${f(14)},${f(-b.h * 0.35)} q${f(6)},${f(-b.h * 0.7)} ${f(-b.w * 0.8)},${f(-b.h * 0.7)} Z"/>`;
}
function dress(b) {
  return `<path class="rg-dress" d="M${f(-b.w * 0.4)},${f(-b.h * 1.05)} L${f(-b.w * 1.05)},0 H${f(b.w * 1.05)} L${f(b.w * 0.4)},${f(-b.h * 1.05)} Z"/>`;
}
function cracks(b, rnd, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * b.w * 1.2, y = -b.h * (1.1 + rnd() * 0.7);
    s += `<path class="rg-crack" d="M${f(x)},${f(y)} l${f(6 + rnd() * 8)},${f(12 + rnd() * 10)} l${f(-4 - rnd() * 8)},${f(10 + rnd() * 10)}"/>`;
  }
  return s;
}
function stitches(b, rnd, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = -b.h * (0.25 + (i / n) * 1.3);
    s += `<path class="rg-stitch" d="M${f(-b.w * 0.8)},${f(y)} h${f(b.w * 1.6)}"/>`;
  }
  return s;
}

/* ── eye layouts ───────────────────────────────────────────────────────────── */
function eyeLayout(n) {
  switch (n) {
    case 0: return [];
    case 1: return [[0, 0, 1.28]];
    case 2: return [[-20, 0, 1], [20, 0, 1]];
    case 3: return [[-22, 4, 0.92], [22, 4, 0.92], [0, -20, 0.72]];
    case 4: return [[-24, -6, 0.86], [24, -6, 0.86], [-13, 16, 0.62], [13, 16, 0.62]];
    case 5: return [[-30, 0, 0.8], [0, -8, 0.94], [30, 0, 0.8], [-16, 20, 0.56], [16, 20, 0.56]];
    default: {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 1.7;
        out.push([Math.cos(a) * 32, Math.sin(a) * 20 - 2, 0.62]);
      }
      return out;
    }
  }
}

/* ── the view ──────────────────────────────────────────────────────────────── */
let VSEQ = 0;

export class EnemyView {
  /**
   * @param {object} snap  engine enemy snapshot (+ `def` for palette/shape if given)
   * @param {object} [o]   { clock, reduceMotion, def, index, count }
   */
  constructor(snap, o = {}) {
    this.clock = o.clock || null;
    this.reduceMotion = !!o.reduceMotion;
    this.id = snap.id;
    this.name = snap.name;
    this.def = o.def || snap.def || null;
    this.seed = hash32(snap.id + '|' + (snap.defId || snap.name || ''));
    this.rnd = mulberry(this.seed);
    this.uid = ++VSEQ;

    this.hp = snap.hp; this.maxHp = snap.maxHp || snap.hp || 1;
    this.block = snap.block || 0;
    this.ghostHp = snap.hp;
    this.alive = true;
    this.dying = false;

    // animation state — plain numbers, mutated in place, never reallocated
    this.a = {
      swayPh: this.rnd() * TAU, breathPh: this.rnd() * TAU,
      breathRate: 0.72 + this.rnd() * 0.3,
      lean: 0, leanT: 0,          // -1 back (windup) .. +1 forward (strike)
      squash: 0, squashT: 0,      // hunker / flinch
      shove: 0,                   // knockback from a hit
      rise: 0, riseT: 0,          // buff lift
      shiver: 0,
      blink: 0, nextBlink: 1 + this.rnd() * 3,
      lookX: 0, lookY: 0, lookTX: 0, lookTY: 0, nextLook: 1 + this.rnd() * 2,
      twitch: 0, nextTwitch: 2.5 + this.rnd() * 4,
      dead: 0, spawn: 0,
      glow: 0,
      entrance: 0,     // 1 = fully off-frame below, 0 = standing. Boss entrance.
      // the ATTACK pose, in SCREEN PIXELS. Published as --e-lx/--e-ly/--e-lr.
      px: 0, py: 0, pr: 0,
    };
    this._poseToken = 0;
    this._poseWrote = false;

    this._build(snap, o);
  }

  /* ── construction ───────────────────────────────────────────────────────── */
  _build(snap, o) {
    const def = this.def || {};
    const shape = def.shape || snap.shape || { body: 'squat', limbs: 2, eyes: 2 };
    const bodyKind = BODY[shape.body] ? shape.body : 'squat';
    const pal = (def.palette && def.palette.length >= 3) ? def.palette : null;
    const sil = def.silhouette || snap.silhouette || '';
    const scale = def.scale || snap.scale || 1;
    this.tier = snap.tier || def.tier || 'normal';

    const b = BODY[bodyKind](this.rnd);
    this.body = b;
    const props = (PROPS[sil] || (() => ({})))(b, this.rnd) || {};
    this.props = props;

    /* HOW IT COMMITS. A bell swings, a suitcase lunges, a carpet ripples —
       chosen by silhouette, and by body archetype for anything not named. */
    this.motifKey = MOTIF[sil] || BODY_MOTIF[bodyKind] || 'lunge';
    this.motif = MOTIFS[this.motifKey];
    /* Heavier things travel less and rotate more. A 1.7-scale bolted bell that
       leapt 50 px would read as weightless; a 0.8-scale dust bunny that only
       managed 30 would read as bored. */
    this.mass = 1 / (0.62 + 0.38 * Math.min(1.9, Math.max(0.6, scale)));

    const el = document.createElement('div');
    el.className = 'enemy cb-enemy';
    el.dataset.id = this.id;
    el.dataset.body = bodyKind;
    el.dataset.tier = this.tier;
    /* The trunk gradient runs `--e2 -> --e1 -> --e3` top to bottom, and the
       EnemyDef palettes are not consistent about which slot is the dark one:
       The Butler's `--e3` is cream, so his tailcoat faded to white trousers at
       the hem. A garment silhouette can opt out and stay dark all the way down. */
    if (props.grad) el.dataset.grad = props.grad;
    /* ROLE, not just tier. The Governess's Favorite Doll is `tier:'boss'`,
       `role:'bossPart'`, 50 Courage — and the stylesheet's boss-arena size rule
       applied to every rig on the board, so she staged at 258x420 while her own
       doll staged at 436x366 and the boss read as the sidekick. `data-role` is
       what lets the arena size the creature it is actually for. */
    this.role = def.role || snap.role || (this.tier === 'boss' ? 'boss' : 'normal');
    el.dataset.role = this.role;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    /* A NAME FOR THE CREATURE. This element is `role="button"`, focusable, and
       every readable thing inside it is either `aria-hidden` (the rig) or a
       bare numeral, so a screen reader announced it as "button" and nothing
       else — on the four most important objects on the screen. `_syncAria`
       keeps it current with Courage, Guard and what it is about to do. */
    el.setAttribute('aria-label', this.name);
    el.style.setProperty('--e-scale', String(scale));
    if (pal) {
      el.style.setProperty('--e1', pal[0]);
      el.style.setProperty('--e2', pal[1]);
      el.style.setProperty('--e3', pal[2]);
    }

    // ── the rig ───────────────────────────────────────────────────────────
    const limbs = Math.max(0, shape.limbs | 0);
    const eyes = Math.max(0, shape.eyes | 0);
    const trunk = props.override || b.path;
    const faceY = (props.faceY ?? -0.62) * b.h;
    const faceX = (props.faceX ?? 0) * b.w;
    const faceS = props.faceScale ?? 1;

    const gid = `eg${this.uid}`;
    el.innerHTML = `
      <div class="cb-enemy__above">
        <!-- The House Rule's TEXT is not here. See setRule() and the docked
             rail in scenes/combat.js: pinned above the head it measured
             [571, -120] on The Butler, entirely off the top of the screen. -->
        <div class="cb-enemy__badges"></div>
        <div class="cb-enemy__alts" hidden></div>
        <div class="cb-enemy__intent"></div>
        <div class="cb-enemy__queue" hidden></div>
      </div>
      <div class="cb-enemy__stage">
        <div class="cb-enemy__pool"></div>
        <svg class="cb-enemy__rig" viewBox="-140 -300 280 320" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <defs>
            <linearGradient id="${gid}b" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="rg-g1"/><stop offset="0.55" class="rg-g2"/><stop offset="1" class="rg-g3"/>
            </linearGradient>
            <radialGradient id="${gid}r" cx="0.32" cy="0.24" r="0.9">
              <stop offset="0" class="rg-r1"/><stop offset="1" class="rg-r2"/>
            </radialGradient>
          </defs>
          <g class="rg-root">
            <g class="rg-limbs-back">${this._limbs(b, limbs, true)}</g>
            <g class="rg-body">
              <g class="rg-back">${props.back || ''}</g>
              <path class="rg-trunk" d="${trunk}" fill="url(#${gid}b)"/>
              <path class="rg-trunk-lit" d="${trunk}" fill="url(#${gid}r)"/>
              <path class="rg-trunk-rim" d="${trunk}"/>
              <g class="rg-front">${props.front || ''}</g>
              <g class="rg-face" transform="translate(${f(faceX)} ${f(faceY)}) scale(${faceS})">
                ${this._eyes(eyes, props.buttons)}
                ${eyes === 0 && !props.over ? `<path class="rg-mouth" d="M-20,14 q20,12 40,0"/>` : ''}
              </g>
              <g class="rg-over">${props.over || ''}</g>
            </g>
            <g class="rg-limbs-front">${this._limbs(b, limbs, false)}</g>
          </g>
        </svg>
        <div class="cb-enemy__flash"></div>
      </div>
      <div class="cb-enemy__plate">
        <div class="cb-enemy__name"></div>
        <div class="cb-enemy__bar">
          <div class="cb-enemy__ghost"></div>
          <div class="cb-enemy__fill"></div>
          <div class="cb-enemy__hp"><span class="cb-enemy__hpn"></span><span class="cb-enemy__hpm"></span></div>
        </div>
        <div class="cb-enemy__guard" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L21 5.5 C21 14 17 20 12 22.5 C7 20 3 14 3 5.5 Z"/></svg><span></span></div>
        <div class="cb-enemy__counters"></div>
        <div class="cb-enemy__statuses"></div>
      </div>
      <div class="cb-enemy__preview" hidden></div>`;

    this.el = el;
    this.$stage = el.querySelector('.cb-enemy__stage');
    this.$rig = el.querySelector('.cb-enemy__rig');
    this.$root = el.querySelector('.rg-root');
    this.$body = el.querySelector('.rg-body');
    this.$face = el.querySelector('.rg-face');
    this.$back = el.querySelector('.rg-limbs-back');
    this.$frontL = el.querySelector('.rg-limbs-front');
    this.$flash = el.querySelector('.cb-enemy__flash');
    this.$pool = el.querySelector('.cb-enemy__pool');
    this.$name = el.querySelector('.cb-enemy__name');
    this.$fill = el.querySelector('.cb-enemy__fill');
    this.$ghost = el.querySelector('.cb-enemy__ghost');
    this.$hpn = el.querySelector('.cb-enemy__hpn');
    this.$hpm = el.querySelector('.cb-enemy__hpm');
    this.$guard = el.querySelector('.cb-enemy__guard');
    this.$guardN = el.querySelector('.cb-enemy__guard span');
    this.$statuses = el.querySelector('.cb-enemy__statuses');
    this.$counters = el.querySelector('.cb-enemy__counters');
    this.$badges = el.querySelector('.cb-enemy__badges');
    this.$alts = el.querySelector('.cb-enemy__alts');
    this.$queue = el.querySelector('.cb-enemy__queue');
    this.$preview = el.querySelector('.cb-enemy__preview');
    this.$eyes = Array.from(el.querySelectorAll('.rg-eye'));
    this.$pupils = Array.from(el.querySelectorAll('.rg-pupil'));
    this.$lids = Array.from(el.querySelectorAll('.rg-lid'));
    this.$limbs = Array.from(el.querySelectorAll('.rg-limb-a'));

    this.intentView = new IntentView({ clock: this.clock, reduceMotion: this.reduceMotion });
    el.querySelector('.cb-enemy__intent').appendChild(this.intentView.el);

    this.$name.textContent = this.name;
    this._statusKey = '';
    this.setState(snap);
    this.a.spawn = 1;
  }

  _limbs(b, n, back) {
    if (!n) return '';
    let s = '';
    const half = Math.ceil(n / 2);
    const count = back ? n - half : half;
    const off = back ? half : 0;
    for (let i = 0; i < count; i++) {
      const k = i + off;
      const t = n === 1 ? 0.5 : k / (n - 1);
      const x = (t - 0.5) * b.w * 1.75;
      const dir = x < 0 ? -1 : 1;
      const len = b.h * (0.5 + this.rnd() * 0.42) + 16;
      const y0 = -b.h * (0.18 + this.rnd() * 0.3);
      s += `<path class="rg-limb rg-limb-a" data-i="${k}" d="M${f(x * 0.55)},${f(y0)}`
        + ` Q${f(x + dir * 14)},${f(y0 + len * 0.55)} ${f(x + dir * 22)},${f(y0 + len)}"/>`;
    }
    return s;
  }

  _eyes(n, buttons) {
    const L = eyeLayout(n);
    if (!L.length) return '';
    let s = '';
    for (let i = 0; i < L.length; i++) {
      const [x, y, k] = L[i];
      const rx = 15 * k, ry = 16.5 * k;
      s += `<g class="rg-eye" data-i="${i}" transform="translate(${f(x)} ${f(y)})">`
        + (buttons
          ? `<circle class="rg-sclera is-button" r="${f(rx)}"/><circle class="rg-pupil" r="${f(rx * 0.3)}"/>`
            + `<circle class="rg-btnhole" cx="${f(-rx * 0.34)}" cy="${f(-rx * 0.34)}" r="${f(rx * 0.13)}"/>`
            + `<circle class="rg-btnhole" cx="${f(rx * 0.34)}" cy="${f(rx * 0.34)}" r="${f(rx * 0.13)}"/>`
          : `<ellipse class="rg-sclera" rx="${f(rx)}" ry="${f(ry)}"/>`
            + `<circle class="rg-pupil" r="${f(rx * 0.46)}"/>`
            + `<circle class="rg-glint" cx="${f(-rx * 0.3)}" cy="${f(-ry * 0.34)}" r="${f(rx * 0.19)}"/>`)
        + `<ellipse class="rg-lid" rx="${f(rx * 1.14)}" ry="${f(ry * 1.16)}"/>`
        + `</g>`;
    }
    return s;
  }

  /* ── state ──────────────────────────────────────────────────────────────── */
  setState(snap) {
    if (!snap) return this;
    const hpChanged = snap.hp !== this.hp;
    this.hp = snap.hp;
    this.maxHp = snap.maxHp || this.maxHp;
    this.block = snap.block || 0;
    this.alive = snap.alive !== false;

    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.$fill.style.transform = `scaleX(${pct.toFixed(4)})`;
    this.$hpn.textContent = String(Math.max(0, this.hp));
    this.$hpm.textContent = '/' + this.maxHp;
    this.el.classList.toggle('is-hurt', pct <= 0.34);
    if (hpChanged) this._ghostFrom = performance.now();

    if (this.block > 0) {
      this.$guard.hidden = false;
      this.$guardN.textContent = String(this.block);
    } else {
      this.$guard.hidden = true;
    }
    this._renderStatuses(snap.statuses || []);
    this._syncAria();
    return this;
  }

  /** The one spoken sentence for this creature. Cheap, and only on change. */
  _syncAria() {
    const tier = this.tier === 'boss' ? 'Boss' : this.tier === 'elite' ? 'Big Scare' : 'Enemy';
    let s = `${this.name}. ${tier}. ${Math.max(0, this.hp)} of ${this.maxHp} Courage`;
    if (this.block > 0) s += `, ${this.block} Guard`;
    if (this.lastIntent) s += `. Next: ${this.intentView.ariaLabel()}`;
    else s += '.';
    if (s === this._ariaKey) return;
    this._ariaKey = s;
    this.el.setAttribute('aria-label', s);
  }

  _renderStatuses(list) {
    const key = list.map(s => s.id + ':' + s.stacks).join('|');
    if (key === this._statusKey) return;
    const prev = this._statusKey;
    this._statusKey = key;
    this.$statuses.textContent = '';
    this.statusData = list;
    for (const s of list) {
      const d = document.createElement('span');
      d.className = 'cb-status';
      d.dataset.kind = s.kind || 'buff';
      d.dataset.id = s.id;
      d.dataset.tip = statusTip(s);
      d.tabIndex = 0;
      // A real icon, from the 118-glyph set in ui/icons.js. Round 1 emitted an
      // empty `<i data-g="haunt">` that no stylesheet ever drew, so Haunt was a
      // bare `2` in a dark box.
      d.innerHTML = statusGlyph(s)
        + (s.showStacks === false ? '' : `<b>${s.stacks}</b>`);
      if (prev && !prev.includes(s.id + ':')) d.classList.add('is-new');
      this.$statuses.appendChild(d);
    }
  }

  /**
   * `o` is the scene's render context ({ playerHp, playerBlock, mods }). The
   * EnemyDef and this creature's name are added here so the intent tooltip can
   * say WHY a number moved without the scene having to plumb them through.
   */
  setIntent(intent, o) {
    this.intentView.set(intent, { ...(o || {}), def: this.def, selfName: this.name });
    this.lastIntent = intent;
    this._syncAria();
    return this;
  }

  /**
   * Enemy counters (Dust, Momentum, Resonance, Wound Up…). The enemies agent
   * calls these "the telegraph" — they sit right under the Courage bar and are
   * the reason a 14 becomes an 11 when you poke something.
   * @param {Array<{id,label,value,max}>} list
   */
  setCounters(list) {
    const key = (list || []).map(c => c.id + ':' + c.value).join('|');
    if (key === this._counterKey) return this;
    const bumped = new Set();
    if (this._counterPrev) {
      for (const c of list || []) {
        const was = this._counterPrev.get(c.id);
        if (was !== undefined && was !== c.value) bumped.add(c.id);
      }
    }
    this._counterKey = key;
    this._counterPrev = new Map((list || []).map(c => [c.id, c.value]));
    this.$counters.textContent = '';
    for (const c of list || []) {
      const d = document.createElement('span');
      d.className = 'cb-count' + (bumped.has(c.id) ? ' is-bumped' : '');
      d.dataset.tip = `${c.label}|${c.desc || `${c.label}: ${c.value}${c.max ? ' of ' + c.max : ''}.`}|${c.note || 'Watch this number — it drives what this enemy does next.'}`;
      d.tabIndex = 0;
      d.innerHTML = `<i>${esc(c.label)}</i><b>${c.value}${c.max ? `<u>/${c.max}</u>` : ''}</b>`;
      this.$counters.appendChild(d);
    }
    return this;
  }

  /** Named state badges above the intent: Garment, Pristine/Cracked, Hidden… */
  setBadges(list) {
    const key = (list || []).map(b => b.text + (b.tone || '')).join('|');
    if (key === this._badgeKey) return this;
    this._badgeKey = key;
    this.$badges.textContent = '';
    for (const b of list || []) {
      const d = document.createElement('span');
      d.className = 'cb-badge';
      d.dataset.tone = b.tone || 'neutral';
      if (b.desc) { d.dataset.tip = `${b.text}|${b.desc}|`; d.tabIndex = 0; }
      d.textContent = b.text;
      this.$badges.appendChild(d);
    }
    return this;
  }

  /**
   * The planned intent queue past position 0. Wink reorders, postpones and
   * deletes future intents, so this has to be a real read, not decoration.
   * Unrevealed slots come back `revealed:false` and render as a locked slot.
   * @param {Array<{position,name,type,family,damage,hits,block,revealed,anchored}>} q
   */
  setQueue(q) {
    const rest = (q || []).filter(x => x && x.position > 0);
    const key = rest.map(x => `${x.position}:${x.revealed ? (x.moveId || x.name) : '?'}:${x.damage}x${x.hits}`).join('|');
    if (key === this._queueKey) return this;
    this._queueKey = key;
    const show = rest.length > 0 && rest.some(x => x.revealed);
    this.$queue.hidden = !show;
    this.$queue.textContent = '';
    if (!show) return this;
    for (const x of rest.slice(0, 3)) {
      const d = document.createElement('span');
      d.className = 'cb-qslot';
      d.dataset.family = x.family || 'special';
      d.dataset.revealed = x.revealed ? '1' : '0';
      if (x.anchored) d.dataset.anchored = '1';
      const num = x.revealed
        ? (x.damage > 0 ? `${x.damage}${x.hits > 1 ? '×' + x.hits : ''}` : (x.block > 0 ? String(x.block) : '·'))
        : '?';
      d.innerHTML = `<i>${x.position + 1}</i><b>${num}</b>`;
      d.dataset.tip = x.revealed
        ? `Turn +${x.position} — ${x.name || 'planned'}|${x.tooltip || ''}|Its plan, not a guarantee: change the board and it changes.`
        : `Turn +${x.position} — hidden|You cannot see this far ahead yet.|Some Tricks reveal an enemy's plan.`;
      d.tabIndex = 0;
      this.$queue.appendChild(d);
    }
    return this;
  }

  /**
   * This creature is holding a House Rule. `null` clears it.
   *
   * The rule's TEXT lives in the scene's docked rail — round 3 rendered it as a
   * parchment card stacked on top of the intent inside `.cb-enemy__above`, and
   * because that block grows upward from the creature's head The Butler's
   * measured `[571, -120, 135, 155]`: 120px above the top of the viewport, on
   * the most consequential sentence in the fight. What stays here is the marker
   * that says WHICH creature is keeping it.
   */
  setRule(rule) {
    const key = rule ? rule.name + '|' + rule.text : '';
    if (key === this._ruleKey) return this;
    this._ruleKey = key;
    this.rule = rule || null;
    this.el.classList.toggle('has-rule', !!rule);
    return this;
  }

  /**
   * The Night Terror's two-possibility read: both outcomes on screen at once,
   * collapsing to one the moment the branch resolves.
   */
  setAlternatives(list) {
    const key = (list || []).map(a => a.key + a.label + a.note).join('|');
    if (key === this._altKey) return this;
    this._altKey = key;
    this.$alts.textContent = '';
    const many = (list || []).length > 1;
    this.$alts.hidden = !many;
    this.el.classList.toggle('has-alts', many);
    if (!many) return this;
    for (const a of list) {
      const d = document.createElement('div');
      d.className = 'cb-alt';
      const iv = new IntentView({ clock: this.clock, reduceMotion: this.reduceMotion });
      iv.set({
        type: a.intent, moveId: a.key, name: a.label,
        damage: a.damage || 0, hits: a.hits || 0,
        totalDamage: (a.damage || 0) * (a.hits || 0),
        block: a.block || 0, statuses: a.statuses || [],
        tell: a.note || '', tooltip: a.note || '',
      });
      d.appendChild(iv.el);
      const l = document.createElement('span');
      l.className = 'cb-alt__l';
      l.textContent = a.label || '';
      d.appendChild(l);
      d.dataset.tip = `${a.label || 'Possibility'}|${a.note || ''}|Both are on the table until you commit.`;
      d.tabIndex = 0;
      this.$alts.appendChild(d);
      (this._altViews ||= []).push(iv);
    }
    return this;
  }
  hideIntent(v) { this.el.classList.toggle('no-intent', !!v); }

  /**
   * Preview overlay: predicted damage / LETHAL / statuses coming to this enemy.
   *
   * GUARD IS PART OF THE ANSWER. Round 3 printed `-6` on a 5-Guard enemy and
   * the Courage it actually lost was 1 — the single worst kind of lie this
   * screen can tell, because STS2-REFERENCE §2 is "the player can always see
   * exactly what will happen before it happens." `p.guard` is the Guard
   * standing when the hit lands and `p.hpLoss` is what gets through it.
   */
  showPreview(p) {
    if (!p) { this.$preview.hidden = true; this.el.classList.remove('is-targeted', 'is-lethal'); return this; }
    const bits = [];
    if (p.damage > 0) {
      bits.push(`<span class="cb-prev__dmg">-${p.damage}${p.uncertain ? '?' : ''}</span>`);
      if (p.hits > 1) bits.push(`<span class="cb-prev__x">×${p.hits}</span>`);
      if (p.guard > 0) {
        bits.push(p.hpLoss > 0
          ? `<span class="cb-prev__thru">${p.hpLoss} through ${p.guard} Guard</span>`
          : `<span class="cb-prev__thru is-stopped">${p.guard} Guard stops it</span>`);
      }
    }
    if (p.uncertain) bits.push(`<span class="cb-prev__maybe">depends on your pick</span>`);
    if (p.kills) bits.push(`<span class="cb-prev__lethal">LETHAL</span>`);
    for (const s of p.statuses || []) {
      bits.push(`<span class="cb-prev__st" data-kind="${s.kind}">${s.remove ? '−' : '+'}${s.stacks} ${s.name}</span>`);
    }
    if (!bits.length) { this.$preview.hidden = true; this.el.classList.add('is-targeted'); return this; }
    this.$preview.innerHTML = bits.join('');
    this.$preview.hidden = false;
    this.el.classList.add('is-targeted');
    this.el.classList.toggle('is-lethal', !!p.kills);
    this.$preview.classList.toggle('is-uncertain', !!p.uncertain);
    return this;
  }

  /** Centre of the creature in viewport pixels — where FX should land. */
  centre(out) {
    const r = this.$stage.getBoundingClientRect();
    const o = out || {};
    o.x = r.left + r.width / 2;
    o.y = r.top + r.height * 0.58;
    o.w = r.width; o.h = r.height;
    return o;
  }
  headTop() {
    const r = this.$stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.22 };
  }

  /* ── acting ─────────────────────────────────────────────────────────────── */
  _d(s) { return this.reduceMotion ? 0.001 : s; }

  /**
   * Ramp the screen-space attack pose to an absolute target.
   *
   * NOT a spring. `a.lean` was spring-chased at k=13, which over an 85 ms
   * contact beat only ever covers 70% of the distance and then gets retargeted
   * — the pose never once arrived at the value the code asked for. An explicit
   * ramp is the only thing that can promise "at the end of this await the
   * creature is exactly `x,y,r` from home", which is what a contact frame is.
   *
   * `reduceMotion` collapses the whole pose to zero rather than merely making
   * it fast: a 50 px snap is worse for a motion-sensitive player than no move.
   */
  _pose(x, y, r, dur, ease) {
    const a = this.a;
    if (this.reduceMotion || !this.clock) {
      a.px = a.py = a.pr = 0;
      return Promise.resolve();
    }
    const m = this.mass;
    const tx = x * m, ty = y * m, tr = r;
    const x0 = a.px, y0 = a.py, r0 = a.pr;
    this._posing = (this._posing || 0) + 1;
    const token = ++this._poseToken;
    return this.clock.ramp(dur, (v) => {
      if (token !== this._poseToken) return;
      a.px = x0 + (tx - x0) * v;
      a.py = y0 + (ty - y0) * v;
      a.pr = r0 + (tr - r0) * v;
    }, ease).then(() => { this._posing--; });
  }

  /** Telegraph before the move resolves. Resolves when the pose is held. */
  async windup(type = 'attack') {
    if (this.dying) return;
    this.el.classList.add('is-acting');
    const a = this.a;
    const fam = String(type || '');
    const m = this.motif;
    let posed = null;
    if (fam.startsWith('attack')) {
      a.leanT = -0.7; a.squashT = 0.2;
      a.lookTX = -1; a.lookTY = 0.35;
      // the coil: back and slightly up, ~120 ms, then HELD until damage lands
      posed = this._pose(m.bx, m.by, m.br, this._d(0.12), Clock.easeOutCubic);
    } else if (fam.startsWith('defend')) {
      a.leanT = 0; a.squashT = 0.55; a.lookTY = 0.6;
      posed = this._pose(0, 7, 0, this._d(0.16), Clock.easeOutCubic);
    } else if (fam === 'buff' || fam === 'defendBuff') {
      a.riseT = 1; a.leanT = -0.25; a.lookTY = -0.7;
      posed = this._pose(0, -14, 0, this._d(0.2), Clock.easeOutCubic);
    } else if (fam.includes('ebuff')) {
      a.leanT = 0.3; a.squashT = -0.2; a.lookTX = -1;
      posed = this._pose(m.bx * 0.5, -6, m.br * 0.4, this._d(0.16), Clock.easeOutCubic);
    } else {
      a.squashT = 0.3; a.shiver = 1;
    }
    await Promise.all([posed, this.clock?.ramp(this._d(0.2), () => {}, Clock.easeOutCubic)]);
  }

  /**
   * The contact beat. Resolves ON CONTACT — the caller lands damage, particles
   * and shake on the same frame the pose reaches `f*`. The follow-through is
   * deliberately NOT awaited, so the impact is not gated behind 250 ms of
   * recovery.
   */
  async strike() {
    if (this.dying) return;
    const a = this.a;
    const m = this.motif;
    a.leanT = 1.0;
    this.el.classList.add('is-striking');
    await this._pose(m.fx, m.fy, m.fr, this._d(0.09), Clock.easeInCubic);
    // follow-through: past the contact pose, then drifting home. Fire and forget.
    a.leanT = 0.12;
    const tail = this._pose(m.sx, m.sy, m.sr, this._d(0.25), Clock.easeOutCubic);
    tail.then(() => this.el.classList.remove('is-striking'));
  }

  /** Back to the idle pose. */
  async settle() {
    const a = this.a;
    a.leanT = 0; a.squashT = 0; a.riseT = 0; a.shiver = 0;
    a.lookTX = 0; a.lookTY = 0;
    this.el.classList.remove('is-acting', 'is-striking');
    await Promise.all([
      this._pose(0, 0, 0, this._d(0.22), Clock.easeOutCubic),
      this.clock?.ramp(this._d(0.2), () => {}, Clock.easeOutCubic),
    ]);
  }

  /** Hit reaction. `mag` is hpLoss — drives how hard it is thrown. */
  flinch(mag = 4, dir = 1) {
    if (this.dying) return;
    const k = Math.min(1.4, 0.35 + mag / 22);
    this.a.shove = Math.max(this.a.shove, 16 * k * dir);
    this.a.squash = Math.max(this.a.squash, 0.42 * k);
    this.a.blink = Math.max(this.a.blink, 0.9);
    this.el.classList.remove('is-hit');
    void this.el.offsetWidth;
    this.el.classList.add('is-hit');
    this.$flash.style.opacity = String(Math.min(0.6, 0.24 + k * 0.28));
    this._flashDecay = 1;
  }

  /** Guard absorbed the hit — a firmer, duller reaction. */
  clank(mag = 4) {
    if (this.dying) return;
    this.a.shove = Math.max(this.a.shove, 6);
    this.a.squash = Math.max(this.a.squash, 0.16);
    this.el.classList.remove('is-clank');
    void this.el.offsetWidth;
    this.el.classList.add('is-clank');
  }

  shimmer() {
    this.el.classList.remove('is-guarding');
    void this.el.offsetWidth;
    this.el.classList.add('is-guarding');
  }

  /**
   * A boss does not simply be there. STS2-REFERENCE §4: StS2 aims for "epic
   * rather than intimate", and §4 again: "Deaths are events." So are arrivals.
   *
   * Three beats, and it owns the frame for all of them:
   *   1. it is a silhouette, sunk below the floor line, eyes shut
   *   2. it rises — slow, heavy, with the lights coming up on it
   *   3. it plants, opens its eyes, and leans in once
   *
   * Resolves when the pose is held. `reduceMotion` collapses it to nothing.
   */
  async enterArena(o = {}) {
    const a = this.a;
    if (this.reduceMotion || !this.clock) { this.el.classList.add('has-entered'); return; }
    const big = o.big !== false;
    this.el.classList.add('is-entering');
    a.entrance = 1;
    a.spawn = 0;
    a.squashT = 0.16;
    // 1 — hold in shadow for a beat, so the room reads before the shape does
    await this.clock.wait(big ? 0.24 : 0.12);
    // 2 — the rise
    await this.clock.ramp(big ? 0.86 : 0.5, (v) => { a.entrance = 1 - v; }, Clock.easeOutCubic);
    this.el.classList.remove('is-entering');
    this.el.classList.add('has-entered');
    // 3 — plant, then one slow lean at the player
    a.squashT = 0.34;
    await this.clock.ramp(0.12, () => {}, Clock.easeOutCubic);
    a.blink = 1;
    a.squashT = 0;
    a.leanT = 0.5; a.lookTX = -0.6;
    await this.clock.ramp(0.3, () => {}, Clock.easeOutCubic);
    a.leanT = 0; a.lookTX = 0;
    await this.clock.ramp(0.26, () => {}, Clock.easeOutCubic);
  }

  /** A death is an EVENT: it sags, the eyes go out, then it comes apart. */
  async die() {
    if (this.dying) return;
    this.dying = true;
    this.alive = false;
    this.el.classList.add('is-dying');
    this.intentView.el.style.opacity = '0';
    this.a.leanT = 0; this.a.riseT = 0;
    // 1 — the stagger
    this.a.squashT = 0.5;
    this.a.shove = -10;
    await this.clock?.ramp(this._d(0.22), () => {}, Clock.easeOutCubic);
    // 2 — the lights go out
    this.el.classList.add('is-lightsout');
    await this.clock?.ramp(this._d(0.16), () => {}, Clock.easeOutCubic);
    // 3 — it comes apart
    await this.clock?.ramp(this._d(0.62), (v) => { this.a.dead = v; }, Clock.easeInCubic);
    this.el.classList.add('is-gone');
  }

  /* ── frame ──────────────────────────────────────────────────────────────── */
  /**
   * Crop the viewBox to what the rig actually draws, so a squat dust bunny and
   * a 2.0-scale bedframe both sit on the floor with their intent right above
   * their heads instead of floating in a fixed box.
   */
  _fitViewBox() {
    if (this._fitted || !this.el.isConnected) return;
    let b;
    try { b = this.$root.getBBox(); } catch { return; }
    if (!b || !b.width || !b.height) return;
    this._fitted = true;
    const padX = b.width * 0.14 + 10;
    const padT = b.height * 0.12 + 8;
    this.$rig.setAttribute('viewBox',
      `${f(b.x - padX)} ${f(b.y - padT)} ${f(b.width + padX * 2)} ${f(b.height + padT + 6)}`);
    // keep the on-screen footprint proportional to the rig's real aspect
    const aspect = (b.width + padX * 2) / (b.height + padT + 6);
    this.$stage.style.setProperty('--e-aspect', aspect.toFixed(3));
  }

  update(dt, t) {
    if (!this._fitted) this._fitViewBox();
    const a = this.a;
    const rm = this.reduceMotion;

    // spring the pose values toward their targets
    const sp = (cur, target, k) => cur + (target - cur) * Math.min(1, k * dt);
    a.lean = sp(a.lean, a.leanT, 13);
    a.squash = sp(a.squash, a.squashT, 11);
    a.rise = sp(a.rise, a.riseT, 9);
    a.shove *= Math.max(0, 1 - dt * 9);
    a.lookX = sp(a.lookX, a.lookTX, 7);
    a.lookY = sp(a.lookY, a.lookTY, 7);

    if (this._flashDecay > 0) {
      this._flashDecay -= dt * 6.5;
      this.$flash.style.opacity = String(Math.max(0, this._flashDecay * 0.5));
      if (this._flashDecay <= 0) this.$flash.style.opacity = '0';
    }

    // ── idle life ─────────────────────────────────────────────────────────
    let breath = 0, sway = 0, tw = 0;
    if (!rm && !this.dying) {
      a.breathPh += dt * a.breathRate;
      a.swayPh += dt * 0.44;
      breath = Math.sin(a.breathPh * TAU * 0.42);
      sway = Math.sin(a.swayPh * TAU * 0.31);

      a.nextTwitch -= dt;
      if (a.nextTwitch <= 0) {
        a.nextTwitch = 3 + this.rnd() * 5;
        a.twitch = 1;
        a.lookTX = (this.rnd() * 2 - 1) * 0.8;
        a.lookTY = (this.rnd() - 0.6) * 0.6;
        a.blink = 1;
        if (!this.el.classList.contains('is-acting')) {
          this._twitchBack = this.clock?.wait(0.5).then(() => { a.lookTX = 0; a.lookTY = 0; });
        }
      }
      if (a.twitch > 0) { a.twitch -= dt * 4.2; tw = Math.max(0, a.twitch); }

      a.nextBlink -= dt;
      if (a.nextBlink <= 0) { a.nextBlink = 2.2 + this.rnd() * 4.2; a.blink = 1; }
      if (a.blink > 0) a.blink -= dt * 7.5;
    }

    if (a.spawn > 0) a.spawn = Math.max(0, a.spawn - dt * 2.2);

    // ── compose the root transform ────────────────────────────────────────
    const lean = a.lean;
    const ent = a.entrance;
    const dx = sway * 3.4 + lean * -26 + a.shove * -1 + tw * 3;
    // `entrance` sinks the whole rig below its own floor line and lets it rise.
    const dy = -a.rise * 16 + Math.abs(lean) * -4 + a.spawn * 40 + ent * this.body.h * 3.4;
    const rot = sway * 1.25 + lean * -4.5 + tw * 2.4;
    this.$root.setAttribute('transform',
      `translate(${f(dx)} ${f(dy)}) rotate(${f(rot)} 0 0)`);

    // breathing + squash about the feet
    const sq = a.squash;
    const sy = 1 + breath * 0.031 - sq * 0.24 + a.rise * 0.05;
    const sx = 1 - breath * 0.026 + sq * 0.2;
    this.$body.setAttribute('transform', `scale(${f2(sx)} ${f2(sy)})`);

    // eyes
    // a real blink: open -> shut -> open, over the life of `a.blink`
    const lidK = a.blink > 0 ? Math.sin(Math.min(1, a.blink) * Math.PI) : 0;
    for (let i = 0; i < this.$pupils.length; i++) {
      const p = this.$pupils[i];
      p.setAttribute('transform', `translate(${f(a.lookX * 5.2)} ${f(a.lookY * 4.4)})`);
    }
    for (let i = 0; i < this.$lids.length; i++) {
      this.$lids[i].setAttribute('transform', `scale(1 ${f2(lidK)})`);
    }

    // limbs ripple
    if (!rm && this.$limbs.length) {
      for (let i = 0; i < this.$limbs.length; i++) {
        const ph = Math.sin(a.swayPh * TAU * 0.5 + i * 1.3) * (2.6 + lean * 3);
        this.$limbs[i].setAttribute('transform', `rotate(${f(ph)} 0 0)`);
      }
    }

    /* ── the ATTACK POSE, in screen pixels ─────────────────────────────────
       Published as custom properties so the creature (and its intent) move as
       one on the compositor, while `.cb-enemy__plate` cancels the same offset
       and the Courage bar stays where the eye left it. This is what makes
       `.cb-enemy`'s own rect move — the previous pose lived inside the SVG
       viewBox and was worth ~12 px on screen at full commitment.
       Written only while the pose is non-zero: idle enemies cost nothing. */
    const posed = a.px !== 0 || a.py !== 0 || a.pr !== 0;
    if (posed || this._poseWrote) {
      const st = this.el.style;
      st.setProperty('--e-lx', f2(a.px) + 'px');
      st.setProperty('--e-ly', f2(a.py) + 'px');
      st.setProperty('--e-lr', f2(a.pr) + 'deg');
      this._poseWrote = posed;
    }

    // dissolve
    if (a.dead > 0) {
      const d = a.dead;
      this.$stage.style.opacity = String(Math.max(0, 1 - d * 1.05));
      this.$stage.style.transform = `translateY(${f(-38 * d)}px) scale(${f2(1 - d * 0.12)})`;
      this.$stage.style.filter = `blur(${f(d * 5)}px)`;
    }

    // hp ghost bar drains behind the real one
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const gp = this._ghost === undefined ? pct : this._ghost;
    if (gp > pct) {
      const lag = this._ghostFrom && performance.now() - this._ghostFrom < 260 ? 0 : dt * 0.85;
      this._ghost = Math.max(pct, gp - lag);
      this.$ghost.style.transform = `scaleX(${this._ghost.toFixed(4)})`;
    } else if (gp !== pct) {
      this._ghost = pct;
      this.$ghost.style.transform = `scaleX(${pct.toFixed(4)})`;
    }

    this.intentView.update(dt, t);
  }

  destroy() {
    this.intentView.destroy();
    this._altViews?.forEach(v => v.destroy());
    this._altViews = null;
    this.el.remove();
  }
}

const f2 = (v) => (Math.round(v * 1000) / 1000);

/* ═══════════════════════════════════════════════════════════════════════════
 * THE KID — the player's body on the board.  OWNER: combat-scene.
 *
 * Round 3 had no player character in the Scuffle at all: the "player" was a
 * framed portrait pinned to the bottom-left corner, captioned KID, which is a
 * picture hanging on a wall and not a participant. Every hit you dealt was a
 * number appearing on an enemy with nothing to have caused it, and
 * STS2-REFERENCE §4 is explicit that this is the exact StS1 complaint Slay the
 * Spire 2 set out to fix: "characters animate their attacks… a strike swings
 * a weapon."
 *
 * So the Kid now STANDS IN THE ROOM, on the same floor line as the creatures,
 * facing them, with the companion at her shoulder — and she winds up, swings
 * the torch, flinches and braces. The portrait panel stays exactly where it
 * was, because it carries Guard, the resource counters and the INCOMING
 * readout, and none of that belongs on a moving body.
 *
 * Same rig machinery as EnemyView, same pose contract (`windup` / `strike` /
 * `settle` / `flinch`), same screen-pixel publication, so the two sides of an
 * exchange are written once and read the same.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Companion accents. Presentation only — the data layer carries no palette. */
const PALS = {
  marmalade: ['#f2a44a', '#ffd7a3', '#7a3c12'], wisp: ['#8fd7ff', '#dff4ff', '#2a5f80'],
  crumbula: ['#c9b28a', '#efe2c6', '#5b4a2e'], boggle: ['#8fd18a', '#dcf3d6', '#33552f'],
  bones: ['#e8e2d2', '#ffffff', '#6b6455'], pipkin: ['#f2c14e', '#ffe9b0', '#7a5a12'],
  taffy: ['#f0a3c8', '#ffdcec', '#7d3a58'], hush: ['#a9a0d8', '#e2dcff', '#443a70'],
  truffle: ['#b98a5e', '#e8cfae', '#5c3d22'], mopsy: ['#dcd6ef', '#f6f3ff', '#6a6188'],
  drizzle: ['#7fb6e6', '#d6ecff', '#2f5878'], pudding: ['#d8a26a', '#f6dcbd', '#6b452a'],
  wink: ['#9d8ad4', '#ded3ff', '#453a6e'], mossbit: ['#7fae72', '#d3ecc9', '#31502c'],
  brambleboo: ['#a2c46a', '#e0f0bd', '#425a25'], crinkle: ['#e9c46a', '#fff0c4', '#7a5c1c'],
};

export class PlayerView {
  /** @param {object} o { clock, reduceMotion, companion, name } */
  constructor(o = {}) {
    this.clock = o.clock || null;
    this.reduceMotion = !!o.reduceMotion;
    this.slug = String(o.companion || 'marmalade');
    this.rnd = mulberry(hash32(this.slug));
    this.a = {
      breathPh: 0, bobPh: 0, lean: 0, leanT: 0, squash: 0, squashT: 0,
      swing: 0, swingT: 0, shove: 0,
      blink: 0, nextBlink: 1.4 + this.rnd() * 3,
      px: 0, py: 0, pr: 0,
    };
    this._poseToken = 0;
    this._poseWrote = false;
    this._build();
  }

  _build() {
    const pal = PALS[this.slug] || PALS.marmalade;
    const el = document.createElement('div');
    el.className = 'cb-hero';
    el.setAttribute('aria-hidden', 'true');   // the .cb-player panel is the label
    el.style.setProperty('--c1', pal[0]);
    el.style.setProperty('--c2', pal[1]);
    el.style.setProperty('--c3', pal[2]);
    // Body space: feet on y=0, up is −y, facing +x (the creatures are to the right).
    el.innerHTML = `
      <svg class="cb-hero__rig" viewBox="-120 -270 260 285" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g class="pr-root">
          <g class="pr-pack">
            <path class="pr-packbag" d="M-46,-146 q-22,6 -20,40 q2,30 22,36 l12,-7 v-66 Z"/>
            <path class="pr-packflap" d="M-46,-146 q-22,6 -20,26 q14,10 32,4 v-28 Z"/>
            <path class="pr-strap" d="M-26,-152 q-12,40 -4,78"/>
          </g>
          <g class="pr-legs">
            <path class="pr-leg" d="M-16,-66 q-6,34 -2,62"/>
            <path class="pr-leg" d="M16,-66 q8,32 4,62"/>
            <path class="pr-boot" d="M-26,-6 h30 v12 h-38 q-4,-8 8,-12 Z"/>
            <path class="pr-boot" d="M8,-6 h30 v12 h-38 q-4,-8 8,-12 Z"/>
          </g>
          <g class="pr-body">
            <path class="pr-coat" d="M-36,-158 q36,-16 72,0 q18,26 20,62 l6,42 q-42,16 -84,0 l4,-42 q4,-38 18,-62 Z"/>
            <path class="pr-hem" d="M-42,-56 q42,16 84,0"/>
            <circle class="pr-btn" cx="6" cy="-118" r="4"/>
            <circle class="pr-btn" cx="8" cy="-98" r="4"/>
          </g>
          <!-- the swinging arm and the torch; pr-swing is rotated by update() -->
          <g class="pr-swing">
            <path class="pr-arm" d="M22,-150 q38,8 54,40"/>
            <g class="pr-torch">
              <path class="pr-beam" d="M98,-116 L206,-160 L214,-64 L104,-90 Z"/>
              <path class="pr-torchbody" d="M60,-98 l38,-18 l11,20 l-38,18 Z"/>
              <circle class="pr-flame" cx="110" cy="-96" r="17"/>
              <circle class="pr-flamehot" cx="110" cy="-99" r="8"/>
            </g>
          </g>
          <g class="pr-head">
            <path class="pr-hair" d="M-34,-186 q4,-42 36,-42 q34,0 38,42 q-16,-16 -38,-14 q-22,-2 -36,14 Z"/>
            <ellipse class="pr-face" cx="4" cy="-182" rx="32" ry="30"/>
            <path class="pr-hair" d="M-32,-190 q6,-38 36,-38 q32,0 36,34 q-18,-20 -40,-14 q-20,4 -32,18 Z"/>
            <g class="pr-eyes">
              <g class="pr-eye"><ellipse class="pr-sclera" cx="-2" cy="-180" rx="8" ry="9"/>
                <circle class="pr-pupil" cx="0" cy="-179" r="4"/>
                <circle class="pr-glint" cx="-2" cy="-182" r="1.8"/>
                <ellipse class="pr-lid" cx="-2" cy="-180" rx="9.5" ry="10.5"/></g>
              <g class="pr-eye"><ellipse class="pr-sclera" cx="20" cy="-180" rx="8" ry="9"/>
                <circle class="pr-pupil" cx="22" cy="-179" r="4"/>
                <circle class="pr-glint" cx="18" cy="-182" r="1.8"/>
                <ellipse class="pr-lid" cx="20" cy="-180" rx="9.5" ry="10.5"/></g>
            </g>
            <path class="pr-mouth" d="M4,-168 q7,7 14,0"/>
          </g>
          <!-- the companion, floating at her shoulder -->
          <g class="pr-pal">
            <path class="pr-paltail" d="M-96,-196 q-26,-6 -22,-30 q4,-20 22,-12"/>
            <path class="pr-palear" d="M-92,-224 l-6,-22 l22,10 Z"/>
            <path class="pr-palear" d="M-56,-224 l6,-22 l-22,10 Z"/>
            <ellipse class="pr-palbody" cx="-74" cy="-206" rx="26" ry="23"/>
            <ellipse class="pr-palmuzzle" cx="-74" cy="-197" rx="11" ry="8"/>
            <circle class="pr-paleye" cx="-84" cy="-210" r="4.5"/>
            <circle class="pr-paleye" cx="-64" cy="-210" r="4.5"/>
            <path class="pr-palwhisk" d="M-96,-198 h-13 M-52,-198 h13"/>
          </g>
        </g>
      </svg>
      <div class="cb-hero__flash"></div>`;
    this.el = el;
    this.$root = el.querySelector('.pr-root');
    this.$body = el.querySelector('.pr-body');
    this.$head = el.querySelector('.pr-head');
    this.$swing = el.querySelector('.pr-swing');
    this.$pal = el.querySelector('.pr-pal');
    this.$flash = el.querySelector('.cb-hero__flash');
    this.$lids = Array.from(el.querySelectorAll('.pr-lid'));
  }

  _d(s) { return this.reduceMotion ? 0.001 : s; }

  /** Same contract as EnemyView#_pose — absolute screen-pixel ramp, never a spring. */
  _pose(x, y, r, dur, ease) {
    const a = this.a;
    if (this.reduceMotion || !this.clock) { a.px = a.py = a.pr = 0; return Promise.resolve(); }
    const x0 = a.px, y0 = a.py, r0 = a.pr;
    const token = ++this._poseToken;
    return this.clock.ramp(dur, (v) => {
      if (token !== this._poseToken) return;
      a.px = x0 + (x - x0) * v;
      a.py = y0 + (y - y0) * v;
      a.pr = r0 + (r - r0) * v;
    }, ease);
  }

  /** She coils: weight back onto the heel, torch drawn up and behind. */
  async windup() {
    if (this._dead) return;
    this.el.classList.add('is-acting');
    this.a.leanT = -0.8; this.a.squashT = 0.2; this.a.swingT = -1;
    await this._pose(-16, -5, -5, this._d(0.12), Clock.easeOutCubic);
  }

  /**
   * Contact. Resolves ON the contact frame — the caller lands damage, sparks
   * and shake on the same tick the torch reaches the bottom of its arc.
   */
  async strike() {
    if (this._dead) return;
    this.el.classList.add('is-striking');
    this.a.leanT = 1.1; this.a.squashT = -0.1; this.a.swingT = 1;
    await this._pose(44, 10, 8, this._d(0.09), Clock.easeInCubic);
    this.a.leanT = 0.2; this.a.swingT = 0.25;
    this._pose(12, 2, 2, this._d(0.26), Clock.easeOutCubic)
      .then(() => this.el.classList.remove('is-striking'));
  }

  async settle() {
    this.a.leanT = 0; this.a.squashT = 0; this.a.swingT = 0;
    this.el.classList.remove('is-acting', 'is-striking');
    await this._pose(0, 0, 0, this._d(0.24), Clock.easeOutCubic);
  }

  /** Took a hit. `mag` is Courage actually lost. */
  flinch(mag = 4, blocked = false) {
    const k = Math.min(1.3, 0.35 + mag / 22);
    this.a.shove = Math.max(this.a.shove, (blocked ? 7 : 20) * k);
    this.a.squashT = blocked ? 0.12 : 0.3;
    this.a.blink = 1;
    this.clock?.wait(0.18).then(() => { this.a.squashT = 0; });
    this.el.classList.remove('is-hit', 'is-clank');
    void this.el.offsetWidth;
    this.el.classList.add(blocked ? 'is-clank' : 'is-hit');
    if (!blocked) { this.$flash.style.opacity = String(Math.min(0.75, 0.3 + k * 0.36)); this._flash = 1; }
  }

  guard() {
    this.el.classList.remove('is-guarding');
    void this.el.offsetWidth;
    this.el.classList.add('is-guarding');
  }

  /** Where FX should land on her. */
  centre() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left + r.width * 0.52, y: r.top + r.height * 0.46, w: r.width, h: r.height };
  }
  /** The tip of the torch — where a swing's arc should start. */
  reach() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left + r.width * 0.86, y: r.top + r.height * 0.42 };
  }

  update(dt, t) {
    const a = this.a;
    const rm = this.reduceMotion;
    const sp = (cur, target, k) => cur + (target - cur) * Math.min(1, k * dt);
    a.lean = sp(a.lean, a.leanT, 13);
    a.squash = sp(a.squash, a.squashT, 11);
    a.swing = sp(a.swing, a.swingT, 16);
    a.shove *= Math.max(0, 1 - dt * 9);

    let breath = 0, bob = 0;
    if (!rm) {
      a.breathPh += dt * 0.8;
      a.bobPh += dt * 1.15;
      breath = Math.sin(a.breathPh * TAU * 0.5);
      bob = Math.sin(a.bobPh * TAU * 0.5);
      a.nextBlink -= dt;
      if (a.nextBlink <= 0) { a.nextBlink = 2.4 + this.rnd() * 4; a.blink = 1; }
      if (a.blink > 0) a.blink -= dt * 7.5;
    }

    if (this._flash > 0) {
      this._flash -= dt * 5;
      this.$flash.style.opacity = String(Math.max(0, this._flash * 0.7));
    }

    // rig-space life, on top of the screen-space attack pose
    const dx = a.lean * 9 - a.shove;
    const dy = Math.abs(a.lean) * -3;
    this.$root.setAttribute('transform', `translate(${f(dx)} ${f(dy)}) rotate(${f(a.lean * 3)} 0 0)`);
    this.$body.setAttribute('transform',
      `scale(${f2(1 - breath * 0.012 + a.squash * 0.14)} ${f2(1 + breath * 0.018 - a.squash * 0.16)})`);
    this.$head.setAttribute('transform', `translate(${f(a.lean * 6)} ${f(breath * 1.6)})`);
    // the torch arm: −24° drawn back, +64° at the bottom of the swing
    this.$swing.setAttribute('transform', `rotate(${f(a.swing * (a.swing < 0 ? 24 : 64))} 20 -150)`);
    this.$pal.setAttribute('transform', `translate(${f(bob * 3 - a.lean * 4)} ${f(bob * 5)})`);
    const lid = a.blink > 0 ? Math.sin(Math.min(1, a.blink) * Math.PI) : 0;
    // `.pr-lid` is `transform-box: fill-box; transform-origin: 50% 0%` in CSS,
    // so a plain vertical scale closes it from the brow down.
    for (let i = 0; i < this.$lids.length; i++) {
      this.$lids[i].setAttribute('transform', `scale(1 ${f2(lid)})`);
    }

    const posed = a.px !== 0 || a.py !== 0 || a.pr !== 0;
    if (posed || this._poseWrote) {
      const st = this.el.style;
      st.setProperty('--p-lx', f2(a.px) + 'px');
      st.setProperty('--p-ly', f2(a.py) + 'px');
      st.setProperty('--p-lr', f2(a.pr) + 'deg');
      this._poseWrote = posed;
    }
  }

  destroy() { this._dead = true; this.el.remove(); }
}

function statusTip(s) {
  return `${s.name}|${s.desc || ''}|${s.decay === 'turnEnd' ? 'Wears off at the end of its turn.' : s.decay === 'turnStart' ? 'Ticks at the start of its turn.' : 'Lasts the whole Scuffle.'}`;
}

/** The status set from ui/icons.js. One resolver, shared with the intent pips. */
export function statusGlyph(s) {
  return iconSvg(statusIconId(s), { cls: 'cb-status__g' });
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export default EnemyView;
