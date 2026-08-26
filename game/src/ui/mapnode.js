/**
 * Inked map symbols.  OWNER: map agent.
 *
 * Rule: every node type must be identifiable by SILHOUETTE alone, at 26px, in
 * one ink colour, by a colourblind player, on top of busy blueprint linework.
 * So no two glyphs share an outline: X · burst · arch · triangle · wings ·
 * lollipop · box · barred dome · torn patch.
 *
 * Everything here is drawn as if the kids inked it onto a stolen floorplan:
 * strokes wobble a little, deterministically, seeded off the node id.
 */
import { NodeType } from '../data/schema.js';

// ── deterministic wobble ─────────────────────────────────────────────────────
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wobbler(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) - 0.5; };
}

/**
 * A hand-drawn ellipse: the pencil circle the kids put round a room they mean
 * to visit.  Returns an SVG path `d` in a 0..size box.
 */
export function pencilRing(seed, cx, cy, rx, ry, wobble = 0.08, points = 22) {
  const w = wobbler(seed);
  let d = '';
  const over = 0.22;                              // overshoot: pencil doesn't close neatly
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * (Math.PI * 2 + over) - 0.1;
    const k = 1 + w() * wobble * 2;
    const x = cx + Math.cos(t) * rx * k;
    const y = cy + Math.sin(t) * ry * k;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

/** A wobbly line between two points, as an SVG path. `amp` in px. */
export function inkLine(seed, x1, y1, x2, y2, amp = 3, segs = 8) {
  const w = wobbler(seed);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  let d = `M${x1.toFixed(2)} ${y1.toFixed(2)}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const bow = Math.sin(t * Math.PI) * amp * (0.5 + w());
    d += `L${(x1 + dx * t + nx * bow).toFixed(2)} ${(y1 + dy * t + ny * bow).toFixed(2)}`;
  }
  return d;
}

/**
 * Catmull-Rom through the points, emitted as cubics.  Graphite has no corners:
 * a hand pulling a pencil along a straightedge-less line curves through its own
 * wobble.  The printed plan under it is all hard right angles and mitred joins,
 * so "smooth" is one of the four things separating the route from the building.
 */
function smoothPath(p) {
  if (p.length < 2) return '';
  if (p.length === 2) {
    return `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}L${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  }
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}`
       + ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}`
       + ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * A route leg drawn as GRAPHITE OVER INK, not as more ink.
 *
 * The map's one decision is pathing, and for four rounds it was invisible for a
 * reason no amount of stroke-width could fix: the route and the building were
 * the same kind of mark.  Both were thin dashed blue-grey lines on parchment,
 * so raising the route's weight and dropping the plan's alpha only ever moved a
 * measurement — a heavier dashed navy line among three hundred dashed navy
 * lines is still camouflage.  What separates a pencil route from a printed
 * survey is not strength, it is KIND:
 *
 *   colour   warm graphite against the plan's cold blue (see --graphite)
 *   texture  one continuous deposit, never the architect's dash
 *   join     smooth curves through a real hand's tremble, not mitred corners
 *   pass     drawn twice, because nobody rules a route in one stroke
 *   relief   a soft offset shade, so the mark sits ON the paper not IN it
 *
 * Returns the two passes.  `a` is the firm one, `b` the lighter overdraw that
 * shadows it a pixel or two away; the caller strokes `a` again, offset and very
 * pale, for the relief.  Both share one low-frequency bow so they read as one
 * line gone over twice rather than as two routes.
 */
export function pencilStroke(seed, x1, y1, x2, y2, opt = {}) {
  const { bow = 20, tremble = 1.6, step = 30 } = opt;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const ux = dx / len, uy = dy / len;
  const segs = Math.max(5, Math.min(26, Math.round(len / step)));

  // one arc for both passes: the hand committed to a curve before it drew it
  const arcRng = wobbler(seed);
  const lean = arcRng() * bow;

  const pass = (jitSeed, drift) => {
    const w = wobbler(jitSeed);
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const arc = Math.sin(t * Math.PI) * lean + drift * Math.sin(t * Math.PI * 0.86);
      const jit = w() * tremble * 2;
      const slip = w() * tremble;              // the hand varies its speed too
      pts.push([x1 + dx * t + nx * (arc + jit) + ux * slip,
                y1 + dy * t + ny * (arc + jit) + uy * slip]);
    }
    // land on the marks: a route that misses its own room is not a route
    pts[0] = [x1, y1]; pts[segs] = [x2, y2];
    return smoothPath(pts);
  };

  return { a: pass(seed ^ 0x5f37, 0), b: pass(seed ^ 0x2b91, 1.5) };
}

// ── the nine glyphs, viewBox 0 0 48 48 ───────────────────────────────────────
// `S` = stroked path, `F` = filled path.  Kept as data so states can restyle.
const G = {
  // Crossed claw scratches.  The commonest room gets the simplest mark — but
  // simple is not the same as faint: fifteen of thirty rooms wear this, and at
  // the sheet's fit zoom a hairline X vanishes into the plan's dot field.  So
  // it is the heaviest single stroke weight on the map, with two gouged ends.
  [NodeType.SCUFFLE]: `
    <path class="s w3" d="M13 11 L34 35"/>
    <path class="s w3" d="M23 8 L41 29"/>
    <path class="s w3" d="M35 12 L14 36"/>
    <path class="s w1" d="M41 19 L27 37"/>
    <path class="f" d="M33.4 34 l3.6 4.6 -5.6 -1.2Z"/>
    <path class="f" d="M14.6 35 l-3.8 4.4 5.6 -1Z"/>`,

  // Spiked burst with a fanged mouth: heavier, angrier, unmistakably not a Scuffle.
  [NodeType.BIG_SCARE]: `
    <path class="s w2 j" d="M24 3 L29 13 L40 8 L37 19 L46 24 L37 29 L40 40 L29 35 L24 45
                            L19 35 L8 40 L11 29 L2 24 L11 19 L8 8 L19 13 Z"/>
    <path class="f" d="M18.5 21 a2.1 2.4 0 1 0 .01 0Z"/>
    <path class="f" d="M29.5 21 a2.1 2.4 0 1 0 .01 0Z"/>
    <path class="s w1" d="M18 29 L21 32 L24 29 L27 32 L30 29"/>`,

  // The keeper of the wing.  This used to be an arched door with vertical bars
  // inside it, which in greyscale was the SAME silhouette as the Rescue cage —
  // the two most important marks on the sheet were indistinguishable.  It is
  // now the only large SOLID mass of ink on the whole drawing: a horned bulk
  // with the paper showing through its eyes, standing inside a struck-out
  // survey rosette.  Nothing else is filled, nothing else is this size, and
  // nothing else radiates.  You can find it from across the sheet.
  [NodeType.BOSS]: `
    <path class="s w1 ray" d="M24 24 L24 1 M24 24 L24 47 M24 24 L1 24 M24 24 L47 24
                              M24 24 L7.7 7.7 M24 24 L40.3 40.3 M24 24 L40.3 7.7 M24 24 L7.7 40.3"/>
    <path class="s w1 ray" d="M24 24 m-21 0 a21 21 0 1 0 42 0 a21 21 0 1 0 -42 0Z"/>
    <path class="f mass" d="M4 46.5 L7.5 28 L3 15 L11.5 21 L14.5 6 L19.5 18
                            L24 2 L28.5 18 L33.5 6 L36.5 21 L45 15 L40.5 28 L44 46.5 Z"/>
    <path class="pw eye" d="M13.6 29.2 a4.6 5.4 0 1 0 9.2 0 a4.6 5.4 0 1 0 -9.2 0Z"/>
    <path class="pw eye" d="M25.2 29.2 a4.6 5.4 0 1 0 9.2 0 a4.6 5.4 0 1 0 -9.2 0Z"/>
    <path class="f" d="M16.4 30.6 a1.8 2.2 0 1 0 3.6 0 a1.8 2.2 0 1 0 -3.6 0Z"/>
    <path class="f" d="M28 30.6 a1.8 2.2 0 1 0 3.6 0 a1.8 2.2 0 1 0 -3.6 0Z"/>
    <path class="pw grin" d="M14 39 L17.5 42.5 L21 39 L24.5 42.5 L28 39 L31.5 42.5 L35 39
                             L35 40.6 L31.5 44.2 L28 40.6 L24.5 44.2 L21 40.6 L17.5 44.2 L14 40.6 Z"/>`,

  // Blanket fort.  This was a triangle with a hem, which on a plan covered in
  // hazard warnings read as a warning sign — exactly backwards for the one room
  // that is safe.  A blanket does not stand up in a point: it SAGS between two
  // chairbacks and hangs in scallops, and there is a lamp on under it.
  //
  // The lamp used to be a solid disc.  At 20px that disc plus the two chairback
  // posts collapsed into a dark mass with two points on top — which is the BOSS
  // silhouette.  Only one mark on this sheet is allowed to be a solid mass, so
  // the lamp is now drawn as an outlined lantern with a wick spark and rays: the
  // fort stays an open, airy shape and cannot be mistaken for the horned bulk.
  [NodeType.SAFE]: `
    <path class="s w1" d="M8 14 L8 7 M40 13 L40 6"/>
    <path class="s w1" d="M8 7 a1.9 1.9 0 1 0 .01 0Z M40 6 a1.9 1.9 0 1 0 .01 0Z"/>
    <path class="s w3" d="M7 13 C12 24 18 26 24 26 C30 26 36 23.5 41 12"/>
    <path class="s w2" d="M7 13 L5 37 M41 12 L43 37"/>
    <path class="s w2" d="M4 37 q3.5 5.4 7 0 q3.5 5.4 7 0 q3.5 5.4 7 0 q3.5 5.4 7 0 q3.5 5.4 7 0"/>
    <path class="s w1" d="M24 26 L24 29.4"/>
    <path class="s w2" d="M20.6 33.4 a3.4 3.4 0 0 1 6.8 0 L27.4 36.4
                          a3.4 3.4 0 0 1 -6.8 0 Z"/>
    <path class="f" d="M22.8 34.3 a1.2 1.4 0 1 0 2.4 0 a1.2 1.4 0 1 0 -2.4 0Z"/>
    <path class="s w1" d="M16.6 34.9 L12.4 34.9 M31.4 34.9 L35.6 34.9
                          M18 30.6 L15.2 28.2 M30 30.6 L32.8 28.2
                          M18.4 39.2 L15.8 41.4 M29.6 39.2 L32.2 41.4"/>`,

  // Mr. Moth: wide soft wings + a tag. Nothing else on the map is this wide.
  [NodeType.SHOP]: `
    <path class="s w2" d="M23 18 C15 6 2 9 3 20 C4 30 15 32 22 27"/>
    <path class="s w2" d="M25 18 C33 6 46 9 45 20 C44 30 33 32 26 27"/>
    <path class="s w2" d="M22 15 L24 13 L26 15 L26 31 L24 34 L22 31 Z"/>
    <path class="s w1" d="M23 12 C21 7 17 5 14 5 M25 12 C27 7 31 5 34 5"/>
    <path class="f" d="M9 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0Z"/>
    <path class="f" d="M35 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0Z"/>
    <path class="s w1" d="M20 37 L28 37 L30 45 L18 45 Z"/>`,

  // Magnifying glass. Circle-on-a-stick — the "look into this" mark.
  // The question mark that used to sit in the lens is gone: Unsurveyed already
  // owns the "?" on this sheet, and two marks asking the same question is one
  // too many.  What is in the lens now is a spiral — the house doing something
  // odd in there, which is what a Curiosity actually is.
  [NodeType.CURIOSITY]: `
    <path class="s w2" d="M20.5 20.5 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0Z"/>
    <path class="s w2" d="M30.5 30.5 L43 43.5"/>
    <path class="s w1" d="M12.5 17 a8.5 8.5 0 0 1 6.5 -6.2"/>
    <path class="s w2" d="M20.5 27.5 a7 7 0 1 1 7 -7 a5 5 0 1 1 -5 5 a3.1 3.1 0 1 1 3.1 -3.1"/>`,

  // A chest. Hard-edged box with a lid band — the only rectangle with a lid.
  [NodeType.TREASURE]: `
    <path class="s w2" d="M5 20 L43 20 L43 41 L5 41 Z"/>
    <path class="s w2" d="M5 20 C7 10 12 6 24 6 C36 6 41 10 43 20"/>
    <path class="s w1" d="M5 25.5 L43 25.5"/>
    <path class="f" d="M20.6 27.5 L27.4 27.5 L27.4 36 L20.6 36 Z"/>
    <path class="s w1 pl" d="M24 30.2 a1.8 1.8 0 1 0 .01 0Z"/>
    <path class="s w1" d="M11 14.5 L11 20 M37 14.5 L37 20"/>`,

  // A cage with a paw inside. Barred dome — the only glyph with vertical bars.
  [NodeType.RESCUE]: `
    <path class="s w2" d="M7 43 L7 22 a17 17 0 0 1 34 0 L41 43 Z"/>
    <path class="s w2" d="M4 43.5 L44 43.5"/>
    <path class="s w1" d="M15 43 L15 15.5 M24 43 L24 11.5 M33 43 L33 15.5"/>
    <path class="s w1" d="M7 27.5 L41 27.5"/>
    <path class="f pw" d="M24 36.5 c-3.4 0 -5.6 -2.1 -5.6 -4 c0 -1.7 2.4 -3.2 5.6 -3.2
                          c3.2 0 5.6 1.5 5.6 3.2 c0 1.9 -2.2 4 -5.6 4Z"/>
    <path class="f pw" d="M18.6 26.6 a1.9 2.3 0 1 0 3.8 0 a1.9 2.3 0 1 0 -3.8 0Z"/>
    <path class="f pw" d="M25.6 26.6 a1.9 2.3 0 1 0 3.8 0 a1.9 2.3 0 1 0 -3.8 0Z"/>`,

  // A torn scrap of the blueprint. Ragged on every edge — reads as damage.
  [NodeType.UNKNOWN]: `
    <path class="s w2 tear" d="M7 9 L14 6 L21 9.5 L28 5.5 L35 9 L41 6.5 L43 14 L40 21 L43.5 28
                               L40 35 L42 42 L34 40 L27 43.5 L20 40 L13 43 L7 40.5 L5 33
                               L8 26 L4.5 19 L6.5 13 Z"/>
    <path class="s w2" d="M18.5 19.5 c0 -4 2.6 -6.2 5.9 -6.2 c3.3 0 5.6 2 5.6 5
                          c0 3.6 -5 4.1 -5.4 7.4 l-.1 1.4"/>
    <path class="f" d="M22.2 33.4 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0Z"/>`,
};

/** Raw glyph markup for a node type (inside a 0 0 48 48 viewBox). */
export function glyphMarkup(type) { return G[type] || G[NodeType.SCUFFLE]; }

/** A standalone <svg> string for a type — used by the legend and tooltips. */
export function nodeSymbol(type, size = 28, cls = '') {
  return `<svg class="mn-glyph ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}"
    aria-hidden="true" focusable="false">${glyphMarkup(type)}</svg>`;
}

// ── hazard marginalia glyphs (16x16) ─────────────────────────────────────────
const HG = {
  lamp:    `<path class="s" d="M8 2 L8 4 M4.5 5.5 L11.5 5.5 L10 11 L6 11 Z"/><path class="s" d="M3 3 L13 13"/>`,
  beam:    `<path class="s" d="M2 6 L14 6 M2 6 L8 10 L14 6 M8 10 L8 14"/>`,
  sheet:   `<path class="s" d="M3 13 C3 5 5.5 2.5 8 2.5 C10.5 2.5 13 5 13 13 L11 11.5 L9.5 13 L8 11.5 L6.5 13 L5 11.5 Z"/>`,
  draught: `<path class="s" d="M2 5 C6 5 7 3 9 3 C11 3 11.5 5.5 9.5 5.5 M2 8.5 C8 8.5 10 6.5 12 6.5 C14 6.5 14.5 9.5 12 9.5 M2 12 C6 12 7.5 10.5 9 10.5"/>`,
  pipe:    `<path class="s" d="M2 4 L9 4 C11 4 11 7 9 7 L5 7 C3 7 3 10 5 10 L14 10"/><path class="s" d="M8.5 2.5 L8.5 5.5 M5.5 8.5 L5.5 11.5"/>`,
  shadow:  `<path class="s" d="M8 2 a5 5 0 1 0 .01 0Z"/><path class="s" d="M4 12 L12 12 M2.5 14.5 L13.5 14.5"/>`,
  moon:    `<path class="s" d="M11 2.5 A6.2 6.2 0 1 0 11 13.5 A5 5 0 1 1 11 2.5Z"/>`,
  paw:     `<path class="f" d="M8 14 c-2.4 0 -4 -1.5 -4 -2.9 c0 -1.2 1.7 -2.3 4 -2.3 c2.3 0 4 1.1 4 2.3 c0 1.4 -1.6 2.9 -4 2.9Z"/>
            <path class="f" d="M3.4 6.6 a1.4 1.7 0 1 0 2.8 0 a1.4 1.7 0 1 0 -2.8 0Z"/>
            <path class="f" d="M9.8 6.6 a1.4 1.7 0 1 0 2.8 0 a1.4 1.7 0 1 0 -2.8 0Z"/>
            <path class="f" d="M6.6 3.4 a1.3 1.6 0 1 0 2.6 0 a1.3 1.6 0 1 0 -2.6 0Z"/>`,
};
export function hazardSymbol(glyph, size = 16) {
  return `<svg class="mn-hz" viewBox="0 0 16 16" width="${size}" height="${size}"
    aria-hidden="true" focusable="false">${HG[glyph] || HG.beam}</svg>`;
}
/** The same mark's raw paths, for drawing straight into another SVG (0 0 16 16). */
export function hazardGlyphMarkup(glyph) { return HG[glyph] || HG.beam; }

// ── the node button ──────────────────────────────────────────────────────────
/**
 * Build one map node.  Positioning + state classes are the scene's job; this
 * owns the drawing.
 * @param {object} node  MapNode from mapgen
 * @param {object} info  NODE_INFO[type]
 */
export function createMapNode(node, info, hazardName = '') {
  const t = document.createElement('template');
  t.innerHTML = mapNodeMarkup(node, info, hazardName);
  return t.content.firstElementChild;
}

/**
 * The same node as a markup string.
 *
 * A wing is up to sixty-four marks and the scene builds all of them at once, so
 * it wants ONE parse, not sixty-four: handing the browser a single string for
 * the whole layer took `_buildNodes` from 57 ms to 23 ms on the Foyer, and that
 * time sits squarely on the critical path between the veil and the sheet.
 * `createMapNode` above is the single-element form, kept for anything that
 * genuinely needs one node.
 *
 * @param {object} node  MapNode from mapgen
 * @param {object} info  NODE_INFO[type]
 * @param {{left:number,top:number}} [at]  sheet-px placement, written inline
 */
export function mapNodeMarkup(node, info, hazardName = '', at = null) {
  // The wing condition is named here too: the plan itself now carries only the
  // wing's keyed symbol, and a symbol is not a thing a screen reader can key.
  const aria =
    `${node.roomName || info.label}. ${info.label}.${hazardName ? ` In ${hazardName}.` : ''} Row ${node.row + 1}.`;

  const s = seedOf(node.id);
  const big = node.type === NodeType.BOSS;
  const box = big ? 156 : 86;
  const gs = big ? 112 : 52;                      // glyph size inside the box
  const off = (box - gs) / 2;

  // A pencil ring for "you may go here", drawn once and revealed by CSS.
  const ringD = pencilRing(s ^ 0x9e37, box / 2, box / 2,
    big ? 66 : 36, big ? 63 : 34, 0.07, 26);
  const ring2 = pencilRing(s ^ 0x51ed, box / 2, box / 2,
    big ? 73 : 41, big ? 70 : 39, 0.085, 26);
  // The tick the kids scratch over a room once they have been through it.
  const tickD = `M${box * 0.24} ${box * 0.55} L${box * 0.42} ${box * 0.72} L${box * 0.79} ${box * 0.26}`;
  // Draughtsman's crop marks.  A merely-legal room wears a pencil ring; the one
  // the KEYBOARD is on wears these as well, so the two states cannot be confused
  // by anyone looking at the sheet instead of reading the hover card.
  const i = box * 0.02, a = box * 0.25, f = box - i;
  const kbdD = `M${i} ${i + a} L${i} ${i} L${i + a} ${i}
                M${f - a} ${i} L${f} ${i} L${f} ${i + a}
                M${f} ${f - a} L${f} ${f} L${f - a} ${f}
                M${i + a} ${f} L${i} ${f} L${i} ${f - a}`;

  return `<button type="button" class="map-node map-node--${node.type}" tabindex="-1"
      data-id="${escapeHtml(node.id)}" data-type="${escapeHtml(node.type)}"
      data-row="${node.row}" data-col="${node.col}"${
        node.hazard ? ` data-hazard="${escapeHtml(node.hazard)}"` : ''}
      style="--mn-box:${box}px${at ? `;left:${at.left}px;top:${at.top}px` : ''}"
      aria-label="${escapeHtml(aria)}">
    <span class="mn-in" aria-hidden="true">
      <span class="mn-pool"></span>
      <svg class="mn-art" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">
        <path class="mn-ring"  d="${ringD}"/>
        <path class="mn-ring2" d="${ring2}"/>
        <g transform="translate(${off} ${off}) scale(${gs / 48})">${glyphMarkup(node.type)}</g>
        <path class="mn-tick" d="${tickD}"/>
        <path class="mn-kbd"  d="${kbdD}"/>
        <!-- A drafting leader.  The collision pass moves a name chip off its own
             mark when there is no clear paper beside it, and a displaced name
             with nothing tying it back is worse than the collision was: the
             playtester's two overlapping labels were readable, they just did
             not say which room they belonged to.  The scene writes this path
             whenever it has moved a chip more than a mark's width. -->
        <path class="mn-lead" d=""/>
      </svg>
      <span class="mn-label">${escapeHtml(shortName(node.roomName || info.label))}</span>
      ${big ? '<span class="mn-boss-tag">BOSS</span>' : ''}
    </span>
  </button>`;
}

function shortName(n) {
  return n.replace(/ — .*$/, m => m.replace(' — ', ' · '));
}
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { seedOf };
