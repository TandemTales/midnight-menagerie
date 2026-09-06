/**
 * Traced blueprint plans, and the pen that inks them.  OWNER: map.
 *
 * `tools/blueprint_trace.py` reduces each of the seventeen section drawings to
 * the marks it is actually made of — WALL RUNS, PIER DOTS and the drawing's
 * small change — so a wing can be RE-INKED at any size instead of resampled.
 * Magnification then moves the architecture apart without touching the pen,
 * which is what a large-scale survey looks like, and there is no resampled
 * pixel anywhere on the drawing.
 *
 * This module exists because there are now TWO screens that ink these plans and
 * they must not drift: `scenes/map.js` prints one wing cover-fitted onto a
 * survey sheet, and `scenes/atlas.js` inks a wing back onto the estate drawing
 * at the exact rectangle it was cut from.  Everything they share — the file
 * format, the cache, the pen solver, the three drawing passes — lives here.
 * What differs (how the wing is FRAMED, and whether the source bitmap's wash is
 * laid under it) stays with the screen, because that is a composition decision
 * and not a drawing one.
 *
 * Coordinates: a trace is authored in QUANTISED section pixels — divide every
 * number by `t.q`.  `inkTrace` expects a context already transformed into
 * section-pixel space and draws in it; the caller owns the transform, which is
 * what lets the same trace land on a sheet and on the estate.
 */

/**
 * The pen, and how it is solved.
 *
 * The weights are in DESTINATION pixels and are deliberately not proportional
 * to the blow-up.  A draughtsman does not change pens when the scale changes;
 * 8x a 2px line is a 16px pipe, and a wing drawn in pipes is not a survey.
 *
 * The seventeen drawings are not remotely alike: per unit of paper the
 * Impossible Greenhouse carries three times the line length of the Grand Study,
 * and it is typically shown at half the magnification.  One authored stroke
 * weight leaves the Study faint and turns the Greenhouse into a solid blue
 * field.  So a screen asks for an ink-to-paper COVERAGE and `solvePen` works
 * back to the pen it needs — same drawing weight on all seventeen, the pen
 * changing as it would in a real drawing office.
 */
export const PEN = {
  cover: 0.034,                    // ink-to-paper ratio the pen is solved for
  min: 1.35, max: 5.20,            // and the box it may solve inside
  vary: 0.52,                      // how far one stroke may depart for its own traced weight
  pierR: 0.62,                     // pier radius as a fraction of the pen
  fineR: 0.40,                     // and the drawing's small change, smaller and lighter
  fineA: 0.70,
  bleed: 0.19,                     // the same drawing again, offset — ink soaking into paper
};

/**
 * Small LRU.
 *
 * Holding all seventeen traces forever is tens of megabytes of number arrays
 * for wings nobody is looking at; recomputing on every entry is wasteful
 * because the map is re-entered on every single room.  The atlas asks for one
 * wing at a time and the map for the wing it is standing in, so a handful is
 * generous for both.
 */
const KEEP = 4;
export function lru(map, key, make) {
  if (map.has(key)) {
    const v = map.get(key);
    map.delete(key); map.set(key, v);            // touch
    return v;
  }
  const v = make();
  map.set(key, v);
  while (map.size > KEEP) map.delete(map.keys().next().value);
  return v;
}

const PLAN_CACHE = new Map();
/**
 * Fetch and parse one `sectionNN.plan.json`.
 * @returns {Promise<object|null>} null when the file is missing or unreadable —
 *   every caller must have a drawing it can still show without one.
 */
export function loadPlanTrace(url) {
  return lru(PLAN_CACHE, url,
    () => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
}

/**
 * The INK's bounding box in section pixels, not the file's.
 *
 * Every section PNG carries 3-20% of blank parchment round its plan, and
 * fitting the file frames that margin instead of the wing — most visibly on the
 * secret passages, where it left a band of bare paper along the foot of the
 * sheet.  The tracer records the ink's box for exactly this.
 *
 * @param {object|null} t     parsed trace
 * @param {number} w  @param {number} h   the section's full size, as a fallback
 */
export function traceBox(t, w, h) {
  if (!t || !t.box) return { bx: 0, by: 0, bw: w, bh: h };
  const q = t.q || 1;
  const bx = t.box[0] / q, by = t.box[1] / q;
  return { bx, by, bw: Math.max(1, t.box[2] / q - bx), bh: Math.max(1, t.box[3] / q - by) };
}

/**
 * Solve the pen for a coverage.
 *
 * Drawn-line area / paper area reduces to `len * pen / (area * scale)` with
 * everything in the section's own units, so this needs to know the
 * magnification and nothing about which part of the wing is on screen.
 *
 * @param {object|null} t      parsed trace
 * @param {number} scale       section px -> destination px
 * @param {number} [cover]     wanted ink-to-paper ratio
 * @returns {number} pen width in DESTINATION pixels
 */
export function solvePen(t, scale, cover = PEN.cover) {
  if (!t || !(t.len > 0) || !(t.area > 0)) return 3.2;
  return clamp(cover * t.area * scale / t.len, PEN.min, PEN.max);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Ink a traced plan into a context already transformed into SECTION-PIXEL space.
 *
 * Three passes, and the caller is expected to have given us an offscreen canvas
 * to work on: every stroke overlaps its neighbours at the piers, and multiplying
 * six hundred translucent strokes onto paper directly turns every junction into
 * a black knot.  Drawn opaque and composited once, the drawing holds a single
 * even weight the way printed ink does.
 *
 *   bleed   the vectors, offset and pale — ink soaking into the paper
 *   line    the vectors.  Sharp at any size, because there is nothing to
 *           resample: it is drawn at the size it is asked for.
 *   fine    door swings, dashes, hatch ticks — a couple of hundred marks the
 *           walls and piers do not account for.  Lighter, because on the
 *           original they ARE lighter.
 *
 * @param {CanvasRenderingContext2D} o  transformed into section px
 * @param {object} t                    parsed trace
 * @param {{pen:number, scale:number, ink:string, layerAlpha?:number}} opts
 *        `pen` is in destination px (see `solvePen`) and `scale` is the same
 *        magnification it was solved against — every width here is divided back
 *        through it, because the context is drawing in section px.
 *        `layerAlpha` is the opacity this whole layer will be COMPOSITED at
 *        afterwards; the bleed pass is stated relative to it so the ink sits the
 *        same distance behind the line however faintly the layer is laid down.
 */
export function inkTrace(o, t, { pen, scale, ink, layerAlpha = 1 }) {
  if (!t || !t.s) return;
  const inv = 1 / scale;
  const Qn = t.q || 1;
  o.lineCap = 'round'; o.lineJoin = 'round';
  o.strokeStyle = ink; o.fillStyle = ink;

  // Every mark is the solved pen, times how heavy the tracer found THIS mark
  // against the drawing's own median — held inside ±52% so the hierarchy
  // survives without any one line running away with the sheet.
  const wm = (t.wm || 2 * Qn) / Qn, pm = (t.pr || Qn) / Qn;
  const rel = (v, med) => clamp(v / med, 1 - PEN.vary, 1 + PEN.vary);

  /* Strokes are bucketed by width and each bucket is ONE path with one
     stroke() call: six hundred stroke calls each with its own lineWidth is six
     hundred state changes, and this runs while a veil is still down. */
  const pens = new Map();
  for (const s of t.s) {
    const key = Math.round(pen * rel(s[0] / Qn, wm) * 4);          // quarter-px pens
    let path = pens.get(key);
    if (!path) pens.set(key, path = new Path2D());
    path.moveTo(s[1] / Qn, s[2] / Qn);
    for (let i = 3; i < s.length; i += 2) path.lineTo(s[i] / Qn, s[i + 1] / Qn);
  }
  const piers = new Path2D();
  const pierBase = pen * PEN.pierR;
  for (const p of (t.p || [])) {
    const r = (pierBase * rel(p[2] / Qn, pm)) * inv;
    piers.moveTo(p[0] / Qn + r, p[1] / Qn);
    piers.arc(p[0] / Qn, p[1] / Qn, r, 0, 6.2832);
  }
  const fine = new Path2D();
  const fineBase = pen * PEN.fineR;
  for (const p of (t.f || [])) {
    const r = (fineBase * clamp(p[2] / Qn, 0.5, 1.8)) * inv;
    fine.moveTo(p[0] / Qn + r, p[1] / Qn);
    fine.arc(p[0] / Qn, p[1] / Qn, r, 0, 6.2832);
  }

  // bleed first, under everything, so the drawing sits ON the paper
  o.save();
  o.globalAlpha = PEN.bleed / (layerAlpha || 1);
  o.translate(-1.6 * inv, 1.6 * inv);
  for (const [key, path] of pens) { o.lineWidth = (key / 4 + 1.1) * inv; o.stroke(path); }
  o.fill(piers);
  o.restore();

  for (const [key, path] of pens) { o.lineWidth = (key / 4) * inv; o.stroke(path); }
  o.fill(piers);
  o.save(); o.globalAlpha = PEN.fineA; o.fill(fine); o.restore();
}
