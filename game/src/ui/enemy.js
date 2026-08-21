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

/* ── silhouette props ──────────────────────────────────────────────────────── */
/**
 * Each returns { back, front, faceY, faceScale, override } in body space
 * (origin at the base centre, up is negative y).  `override` replaces the trunk.
 */
const PROPS = {
  dustball: (b, rnd) => {
    let s = '';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      const x = Math.cos(a) * b.w * 1.0, y = -b.h + Math.sin(a) * b.h * 1.02;
      const l = 12 + rnd() * 12;
      s += `<path class="rg-tuft" d="M${f(x)},${f(y)} l${f(Math.cos(a) * l)},${f(Math.sin(a) * l)}"/>`;
    }
    return { back: s, faceY: -0.52 };
  },
  coatrack: (b) => ({
    back: `<path class="rg-ln" d="M0,${-b.h * 1.05} V${-b.h * 1.9}"/>`
      + `<path class="rg-ln" d="M${-34},${-b.h * 1.78} H34"/>`
      + hooks(-b.h * 1.78, 3),
    front: `<path class="rg-shade" d="M-26,${-b.h * 1.7} q26,26 0,64 q-26,-34 0,-64Z"/>`,
    faceY: -0.62,
  }),
  'coat-rack-mass': (b) => ({
    back: `<path class="rg-ln" d="M-40,${-b.h * 1.1} V${-b.h * 1.7} M40,${-b.h * 1.1} V${-b.h * 1.7}"/>`
      + hooks(-b.h * 1.6, 5),
    front: `<path class="rg-shade" d="M-70,${-b.h * 0.9} q22,60 0,86 M-24,${-b.h} q20,66 0,92 M28,${-b.h * 0.95} q22,60 0,88 M70,${-b.h * 0.85} q20,54 0,80"/>`,
    faceY: -0.66,
  }),
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
    override: `M${-b.w},0 h${b.w * 2} v-14 h${-b.w * 2} Z`
      + ` M0,${-b.h * 1.6} a${b.w * 0.92},${b.h * 1.45} 0 0 0 ${-b.w * 0.92},${b.h * 1.45} h${b.w * 1.84} a${b.w * 0.92},${b.h * 1.45} 0 0 0 ${-b.w * 0.92},${-b.h * 1.45} Z`,
    back: `<circle class="rg-metal" cx="0" cy="${-b.h * 1.72}" r="11"/>`,
    faceY: -0.72, faceScale: 0.85,
  }),
  'great-bell': (b) => ({
    override: `M0,${-b.h * 1.85} c${-b.w * 0.8},0 ${-b.w * 1.05},${b.h * 0.9} ${-b.w * 1.12},${b.h * 1.85}`
      + ` h${b.w * 2.24} c${-0.07 * b.w},${-b.h * 0.95} ${-b.w * 0.32},${-b.h * 1.85} ${-b.w * 1.12},${-b.h * 1.85} Z`,
    back: `<path class="rg-ln" d="M0,${-b.h * 2.35} v${b.h * 0.5}"/><circle class="rg-metal" cx="0" cy="${-b.h * 2.45}" r="13"/>`,
    front: `<path class="rg-crack" d="M${-b.w * 0.5},${-b.h * 1.2} l14,26 l-9,22"/>`
      + `<ellipse class="rg-metal" cx="6" cy="${-b.h * 0.16}" rx="15" ry="19"/>`,
    faceY: -0.86, faceScale: 0.9,
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
  'faceless-guest': (b) => ({
    back: `<path class="rg-shade" d="M${-b.w * 0.9},${-b.h * 0.9} q${b.w * 0.9},${b.h * 0.5} ${b.w * 1.8},0 l${-b.w * 0.2},${b.h * 0.9} h${-b.w * 1.4} Z"/>`,
    front: `<path class="rg-ln" d="M${-b.w * 0.5},${-b.h * 1.55} l${b.w * 0.5},${b.h * 0.34} l${b.w * 0.5},${-b.h * 0.34}"/>`
      + `<path class="rg-void" d="M0,${-b.h * 1.62} a${b.w * 0.52},${b.h * 0.4} 0 1 0 0.1,0 Z"/>`
      + `<path class="rg-ln2" d="M${-b.w * 0.72},${-b.h * 1.9} h${b.w * 1.44}"/>`,
    faceY: -1.6, faceScale: 0.9,
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
    back: `<path class="rg-lid" d="M${-b.w - 5},${-b.h * 1.25} h${b.w * 2 + 10} l-8,-22 h${-b.w * 2 + 6} Z"/>`,
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
    back: `<path class="rg-shade" d="M${-b.w * 1.02},${-b.h * 1.46} q${b.w * 1.02},${b.h * 0.62} ${b.w * 2.04},0 l${-b.w * 0.2},${b.h * 1.46} h${-b.w * 1.64} Z"/>`
      // coat tails, so the silhouette says "formal" from across the room
      + `<path class="rg-shade" d="M${-b.w * 0.62},${-b.h * 0.62} q${-b.w * 0.34},${b.h * 0.5} ${-b.w * 0.18},${b.h * 0.62} l${b.w * 0.5},${-b.h * 0.16} Z"/>`
      + `<path class="rg-shade" d="M${b.w * 0.62},${-b.h * 0.62} q${b.w * 0.34},${b.h * 0.5} ${b.w * 0.18},${b.h * 0.62} l${-b.w * 0.5},${-b.h * 0.16} Z"/>`,
    // a starched shirt front: the one bright shape on an otherwise black rig
    front: `<path class="rg-shirt" d="M${-b.w * 0.3},${-b.h * 1.5} L0,${-b.h * 1.16} L${b.w * 0.3},${-b.h * 1.5} L${b.w * 0.22},${-b.h * 0.5} h${-b.w * 0.44} Z"/>`
      + `<path class="rg-collar" d="M${-b.w * 0.42},${-b.h * 1.62} l${b.w * 0.42},${b.h * 0.46} l${b.w * 0.42},${-b.h * 0.46} l${-b.w * 0.16},${-b.h * 0.2} h${-b.w * 0.52} Z"/>`
      + `<path class="rg-bow" d="M${-b.w * 0.3},${-b.h * 1.2} l${b.w * 0.3},${b.h * 0.13} l${b.w * 0.3},${-b.h * 0.13} l${-b.w * 0.3},${-b.h * 0.13} Z"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 0.92}" r="5"/>`
      + `<circle class="rg-metal" cx="0" cy="${-b.h * 0.72}" r="5"/>`,
    faceY: -1.76, faceScale: 0.9,
  }),
  governess: (b) => ({
    back: `<path class="rg-bun" d="M0,${-b.h * 1.98} a24,20 0 1 0 0.1,0 Z"/>`
      + `<path class="rg-shade" d="M${-b.w * 0.9},${-b.h * 1.3} q${b.w * 0.9},${b.h * 0.7} ${b.w * 1.8},0 l${-b.w * 0.2},${b.h * 1.3} h${-b.w * 1.4} Z"/>`,
    front: `<path class="rg-collar" d="M${-26},${-b.h * 1.68} q26,20 52,0 l-8,-18 h-36 Z"/>`,
    faceY: -1.76, faceScale: 0.84,
  }),
};

function hooks(y, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = -34 + (i / (n - 1)) * 68;
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
    };

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

    const el = document.createElement('div');
    el.className = 'enemy cb-enemy';
    el.dataset.id = this.id;
    el.dataset.body = bodyKind;
    el.dataset.tier = this.tier;
    /* ROLE, not just tier. The Governess's Favorite Doll is `tier:'boss'`,
       `role:'bossPart'`, 50 Courage — and the stylesheet's boss-arena size rule
       applied to every rig on the board, so she staged at 258x420 while her own
       doll staged at 436x366 and the boss read as the sidekick. `data-role` is
       what lets the arena size the creature it is actually for. */
    this.role = def.role || snap.role || (this.tier === 'boss' ? 'boss' : 'normal');
    el.dataset.role = this.role;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
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
                ${eyes === 0 ? `<path class="rg-mouth" d="M-20,14 q20,12 40,0"/>` : ''}
              </g>
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
    return this;
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

  /** Telegraph before the move resolves. Resolves when the pose is held. */
  async windup(type = 'attack') {
    if (this.dying) return;
    this.el.classList.add('is-acting');
    const a = this.a;
    const fam = String(type || '');
    if (fam.startsWith('attack')) {
      a.leanT = -1; a.squashT = 0.18;
      a.lookTX = -1; a.lookTY = 0.35;
    } else if (fam.startsWith('defend')) {
      a.leanT = 0; a.squashT = 0.55; a.lookTY = 0.6;
    } else if (fam === 'buff' || fam === 'defendBuff') {
      a.riseT = 1; a.leanT = -0.25; a.lookTY = -0.7;
    } else if (fam.includes('ebuff')) {
      a.leanT = 0.3; a.squashT = -0.2; a.lookTX = -1;
    } else {
      a.squashT = 0.3; a.shiver = 1;
    }
    await this.clock?.ramp(this._d(0.34), () => {}, Clock.easeOutCubic);
  }

  /** The contact beat: a fast lunge toward the player. */
  async strike() {
    if (this.dying) return;
    const a = this.a;
    a.leanT = 1.15;
    await this.clock?.ramp(this._d(0.085), () => {}, Clock.easeInCubic);
    a.leanT = 0.15;
    await this.clock?.ramp(this._d(0.13), () => {}, Clock.easeOutCubic);
  }

  /** Back to the idle pose. */
  async settle() {
    const a = this.a;
    a.leanT = 0; a.squashT = 0; a.riseT = 0; a.shiver = 0;
    a.lookTX = 0; a.lookTY = 0;
    this.el.classList.remove('is-acting');
    await this.clock?.ramp(this._d(0.2), () => {}, Clock.easeOutCubic);
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

function statusTip(s) {
  return `${s.name}|${s.desc || ''}|${s.decay === 'turnEnd' ? 'Wears off at the end of its turn.' : s.decay === 'turnStart' ? 'Ticks at the start of its turn.' : 'Lasts the whole Scuffle.'}`;
}

/** The status set from ui/icons.js. One resolver, shared with the intent pips. */
export function statusGlyph(s) {
  return iconSvg(statusIconId(s), { cls: 'cb-status__g' });
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export default EnemyView;
