/**
 * The eight missing pets, photographed. OWNER: frontend agent (pairs with
 * ui/portrait.js).
 *
 * The eight pets had no art: one grey glyph per rough species, while the
 * Companions next to them have painted portraits. The single image the whole
 * game is about was a placeholder, and a reviewer said so.
 *
 * THE KIDS ARE NOT HERE ANY MORE. This file used to generate their faces too —
 * one body silhouette recoloured eight times, which drew the same review — and
 * the eight of them are now authored paintings on disk, loaded by
 * `ui/portrait.js` (`kidImg` / `kidPortrait`, assets/kids/*.jpg). The pets
 * stayed generated because no pet art was commissioned and, more importantly,
 * because generating them is the RIGHT answer here: see the framing below.
 * Do not add a second Kid pipeline back into this file.
 *
 * There is no pet art to commission against, so these are generated.
 * The trick that makes that survivable is the framing: a missing-pet picture is
 * a PHOTOGRAPH taken by a child on a phone or a disposable camera, and a
 * convincingly bad snapshot is far easier to make beautiful than a portrait.
 * So the target is not "illustration of a rabbit". It is:
 *
 *   direct flash, blown highlights, crushed-then-lifted blacks, a shallow
 *   depth of field with the room a soft blur behind, eyeshine, halation round
 *   the bright edges, film grain, an orange date imprint in the corner, and an
 *   animal that is slightly too close to the lens and not quite centred.
 *
 * Every one is deterministic: the pet's slug seeds the RNG, so Bean is the
 * same guinea pig in the same kitchen forever.
 *
 * ── how a picture is built ─────────────────────────────────────────────────
 *   1  room        blurred domestic backdrop, one per pet (hallway, kitchen,
 *                  hutch, cage, vivarium, garden, bedding, lino)
 *   2  bounce      flash spill on the nearest surfaces
 *   3  shadow      hard flash shadow cast behind the subject
 *   4  subject     species anatomy, drawn as smooth closed loops filled with a
 *                  direction-field fur/feather/scale texture, with hairs that
 *                  break the silhouette so nothing reads as vector
 *   5  face        eyes are the whole game: limbal ring, striated iris, wet
 *                  specular, flash eyeshine (green-gold for the carnivores,
 *                  red for the prey animals — which is what a real flash does)
 *   6  foreground  a thumb, a cage bar, a blade of grass — out of focus
 *   7  grade       flash falloff, halation, black lift, colour cast, vignette,
 *                  grain, corner softness, date imprint
 *
 * ── colour ────────────────────────────────────────────────────────────────
 * UI colour comes from tokens.css via getComputedStyle, same as ui/cardart.js.
 * Fur, feather, scale and skin are ILLUSTRATION pigment, not interface colour,
 * and live in the PELT / SKIN tables below. That is the precedent cardart.js
 * set with its PIGMENT table and the reasoning is the same: a beagle's saddle
 * is not a UI state and must never become a token.
 *
 * ── cost ──────────────────────────────────────────────────────────────────
 * One pet is ~9 ms, and each is cached as a single canonical bitmap reused at
 * every size (the polaroid, the poster, the run-end ledger all share one
 * decode). `warmFaces()` renders the set a couple per frame off the critical
 * path; call it on scene entry and never await it.
 */

import { KIDS } from '../data/schema.js';

/* ═══════════════════════════════════════════════════════════════════════════
   colour utilities
   ═══════════════════════════════════════════════════════════════════════════ */

function hex2rgb(h) {
  h = String(h || '#000').trim();
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(r) {
  return '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function rgba(h, a) { const c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function lift(h, t) { return mix(h, '#ffffff', t); }
function sink(h, t) { return mix(h, '#000000', t); }

/** UI tokens, read once. Only the frame/atmosphere colours come from here. */
let T = null;
function tokens() {
  if (T) return T;
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const g = (n, f) => { const v = cs && cs.getPropertyValue(n).trim(); return v || f; };
  T = {
    ink900: g('--ink-900', '#07060d'), ink800: g('--ink-800', '#0d0b16'),
    ink700: g('--ink-700', '#14111f'), ink600: g('--ink-600', '#1d1930'),
    flame100: g('--flame-100', '#fff4d6'), flame200: g('--flame-200', '#ffe2a8'),
    flame300: g('--flame-300', '#f8c96b'), flame400: g('--flame-400', '#e0a23c'),
    flame500: g('--flame-500', '#b87826'), flameGlow: g('--flame-glow', '#ffb64a'),
    spec100: g('--spectre-100', '#e6fbff'), spec200: g('--spectre-200', '#a8ecf7'),
    spec300: g('--spectre-300', '#6fd9ec'), spec500: g('--spectre-500', '#2a7f99'),
    parch: g('--parchment', '#e8dcc0'),
  };
  return T;
}

/* ═══════════════════════════════════════════════════════════════════════════
   deterministic rng — the same shape ui/cardart.js uses
   ═══════════════════════════════════════════════════════════════════════════ */

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
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

/* ═══════════════════════════════════════════════════════════════════════════
   geometry — smooth closed loops, so nothing in here is a circle-and-triangle
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Closed Catmull-Rom through `pts`, evaluated to a dense polyline. Working in
 * polylines rather than bezier paths buys two things at once: `trace()` gives a
 * clip region, and the same array gives per-point outward normals for the fur
 * that has to poke out past the edge.
 */
function loop(pts, n = 9) {
  const out = [];
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
function trace(g, d) {
  g.beginPath();
  g.moveTo(d[0][0], d[0][1]);
  for (let i = 1; i < d.length; i++) g.lineTo(d[i][0], d[i][1]);
  g.closePath();
}
function bbox(d) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of d) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
/** An ellipse as a loop, so it can be furred and fuzzed like everything else. */
function oval(cx, cy, rx, ry, rot = 0, n = 14) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return loop(pts, 4);
}

/* ═══════════════════════════════════════════════════════════════════════════
   texture — the layer that decides whether this reads as a photo or clip-art
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fill a loop with fur. `dir(x, y)` returns the hair angle at a point: a head
 * radiates from its crown, a flank flows toward the tail, a chest sweeps down.
 * Hairs are quadratics, not lines, because a straight hair looks like a hatch.
 */
function fur(g, d, o) {
  const { base, dark, light, dir, len = 9, dens = 0.0075, R, key = [0.28, 0.16], round = 0.24 } = o;
  const b = bbox(d);
  g.save();
  trace(g, d); g.clip();

  const grd = g.createLinearGradient(b.x + b.w * key[0], b.y, b.x + b.w * 0.9, b.y + b.h);
  grd.addColorStop(0, light);
  grd.addColorStop(0.42, base);
  grd.addColorStop(1, dark);
  g.fillStyle = grd;
  g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);

  // the flash key: a soft hot patch where the light lands
  const kx = b.x + b.w * key[0], ky = b.y + b.h * key[1];
  const kg = g.createRadialGradient(kx, ky, 0, kx, ky, Math.max(b.w, b.h) * 0.62);
  kg.addColorStop(0, rgba(lift(light, 0.35), 0.5));
  kg.addColorStop(0.55, rgba(light, 0.12));
  kg.addColorStop(1, rgba(light, 0));
  g.fillStyle = kg;
  g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);

  const n = Math.min(5200, Math.round(b.w * b.h * dens));
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = b.x + R() * b.w, y = b.y + R() * b.h;
    const a = dir(x, y, b) + (R() - 0.5) * 0.55;
    const L = len * (0.5 + R() * 1.2);
    const pale = R() < 0.46;
    g.strokeStyle = rgba(pale ? light : dark, 0.1 + R() * 0.3);
    g.lineWidth = 0.5 + R() * 1.15;
    const mx = x + Math.cos(a) * L * 0.5 - Math.sin(a) * L * 0.16;
    const my = y + Math.sin(a) * L * 0.5 + Math.cos(a) * L * 0.16;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx, my, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  // Guard hairs: a sparse pass of long, bright, high-contrast strands over the
  // lit side only. Uniform fur of uniform alpha averages out to a flat wash at
  // any size below about 300px; a handful of hairs you can actually see
  // individually is what registers as "this is fur" in a 122px polaroid.
  const gx = b.x + b.w * key[0], gy = b.y + b.h * key[1];
  const gn = Math.round(n * 0.1);
  for (let i = 0; i < gn; i++) {
    const x = b.x + R() * b.w, y = b.y + R() * b.h;
    const near = 1 - Math.min(1, Math.hypot(x - gx, y - gy) / (Math.max(b.w, b.h) * 0.7));
    if (near < 0.25) continue;
    const a = dir(x, y, b) + (R() - 0.5) * 0.4;
    const L = len * (1.4 + R() * 1.6);
    g.strokeStyle = rgba(lift(light, 0.35), (0.16 + R() * 0.34) * near);
    g.lineWidth = 0.7 + R() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 - Math.sin(a) * L * 0.2,
      y + Math.sin(a) * L * 0.5 + Math.cos(a) * L * 0.2,
      x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  g.restore();
  if (round) roundOff(g, d, { dark: sink(dark, 0.55), a: 0.5, width: round, lightCol: lift(light, 0.3), lightA: 0.22 });
}

/**
 * Inner shadow round the rim of a form, and a bounce of light opposite it.
 *
 * This is the difference between a shape and a body. Every part in here used
 * to be a flat plate with one linear gradient across it, which averages to
 * moulded vinyl no matter how good the fur on top is: real volume comes from
 * the fact that a rounded surface turns away from the light at every edge, and
 * that the surfaces underneath it are occluded. One thick blurred stroke,
 * clipped inside the loop, buys all of that for a single draw.
 */
function roundOff(g, d, o = {}) {
  const { dark = '#000000', a = 0.5, width = 0.22, lightCol = null, lightA = 0.3 } = o;
  const b = bbox(d);
  const t = Math.max(b.w, b.h) * width;
  g.save();
  trace(g, d); g.clip();
  g.filter = 'blur(' + (t * 0.42) + 'px)';
  g.strokeStyle = rgba(dark, a);
  g.lineWidth = t;
  g.lineJoin = 'round';
  trace(g, d); g.stroke();
  if (lightCol) {
    // the bounce: a second, offset, brighter rim on the underside
    g.globalCompositeOperation = 'screen';
    g.strokeStyle = rgba(lightCol, lightA);
    g.lineWidth = t * 0.42;
    g.save();
    g.translate(-t * 0.22, -t * 0.3);
    trace(g, d); g.stroke();
    g.restore();
  }
  g.filter = 'none';
  g.restore();
}

/**
 * The shadow one form casts on the one behind it. Ears onto skull, head onto
 * chest, muzzle onto ruff. Called explicitly because only the painter knows
 * which part is in front.
 */
function occlude(g, under, caster, o = {}) {
  const { dx = 0, dy = 10, blur = 14, a = 0.5 } = o;
  g.save();
  trace(g, under); g.clip();
  g.filter = 'blur(' + blur + 'px)';
  g.fillStyle = 'rgba(0,0,0,' + a + ')';
  g.translate(dx, dy);
  trace(g, caster); g.fill();
  g.filter = 'none';
  g.restore();
}

/** Outward unit normal at index i of a dense loop, pushed away from centroid. */
function normalAt(d, i, cx, cy) {
  const p = d[i], q = d[(i + 5) % d.length];
  let nx = p[1] - q[1], ny = q[0] - p[0];
  const m = Math.hypot(nx, ny) || 1;
  nx /= m; ny /= m;
  if ((p[0] - cx) * nx + (p[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

/**
 * Hairs that cross the outline. Without this every shape has a laser-cut edge
 * and the whole thing collapses into vector art no matter how good the fill is.
 */
function fuzz(g, d, o) {
  const { colors, len = 8, R, step = 2, alpha = 0.55, arc = 0.55, lw = 1.0 } = o;
  const b = bbox(d);
  g.lineCap = 'round';
  for (let i = 0; i < d.length; i += step) {
    const p = d[i];
    const [nx, ny] = normalAt(d, i, b.cx, b.cy);
    const j = (R() - 0.5) * arc;
    const ax = nx * Math.cos(j) - ny * Math.sin(j);
    const ay = nx * Math.sin(j) + ny * Math.cos(j);
    const L = len * (0.3 + R() * 1.25);
    g.strokeStyle = rgba(colors[(R() * colors.length) | 0], (0.14 + R() * 0.5) * alpha);
    g.lineWidth = (0.4 + R() * 0.8) * lw;
    g.beginPath();
    g.moveTo(p[0] - ax * L * 0.55, p[1] - ay * L * 0.55);
    g.quadraticCurveTo(p[0] + ax * L * 0.35 - ay * L * 0.18, p[1] + ay * L * 0.35 + ax * L * 0.18,
      p[0] + ax * L, p[1] + ay * L);
    g.stroke();
  }
}

/** Overlapping feather scallops. Birds are not furry and must not look it. */
function plumage(g, d, o) {
  const { base, dark, light, R, size = 13, rows = 7, dir = 0.5, round = 0.24 } = o;
  const b = bbox(d);
  g.save();
  trace(g, d); g.clip();
  const grd = g.createLinearGradient(b.x + b.w * 0.25, b.y, b.x + b.w, b.y + b.h);
  grd.addColorStop(0, light); grd.addColorStop(0.4, base); grd.addColorStop(1, dark);
  g.fillStyle = grd; g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);

  for (let r = 0; r < rows; r++) {
    const y = b.y + (r + 0.4) * (b.h / rows);
    const s = size * (0.72 + r * 0.1);
    for (let x = b.x - s; x < b.x + b.w + s; x += s * 0.82) {
      const ox = (r % 2 ? s * 0.41 : 0) + (R() - 0.5) * 2.4;
      const cxx = x + ox, cyy = y + (R() - 0.5) * 2.4;
      g.beginPath();
      g.moveTo(cxx - s * 0.5, cyy - s * 0.34);
      g.quadraticCurveTo(cxx, cyy + s * dir, cxx + s * 0.5, cyy - s * 0.34);
      g.strokeStyle = rgba(sink(dark, 0.3), 0.16 + R() * 0.16);
      g.lineWidth = 0.9;
      g.stroke();
      g.beginPath();
      g.moveTo(cxx - s * 0.44, cyy - s * 0.4);
      g.quadraticCurveTo(cxx, cyy + s * dir * 0.72, cxx + s * 0.44, cyy - s * 0.4);
      g.strokeStyle = rgba(lift(light, 0.3), 0.11 + R() * 0.14);
      g.lineWidth = 0.8;
      g.stroke();
    }
  }
  // barbs, so the surface is not just tiles
  for (let i = 0; i < 900; i++) {
    const x = b.x + R() * b.w, y = b.y + R() * b.h;
    const a = Math.PI * 0.5 + (R() - 0.5) * 0.7;
    const L = 4 + R() * 6;
    g.strokeStyle = rgba(R() < 0.5 ? light : dark, 0.06 + R() * 0.12);
    g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  g.restore();
  if (round) roundOff(g, d, { dark: sink(dark, 0.5), a: 0.52, width: round, lightCol: lift(light, 0.35), lightA: 0.26 });
}

/** Beaded reptile skin: tubercle scales, bigger over the spine. */
function scales(g, d, o) {
  const { base, dark, light, R, size = 5.2, round = 0.24 } = o;
  const b = bbox(d);
  g.save();
  trace(g, d); g.clip();
  const grd = g.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h);
  grd.addColorStop(0, light); grd.addColorStop(0.45, base); grd.addColorStop(1, dark);
  g.fillStyle = grd; g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  for (let y = b.y - size; y < b.y + b.h + size; y += size * 0.86) {
    for (let x = b.x - size; x < b.x + b.w + size; x += size * 0.9) {
      const jx = x + (R() - 0.5) * size * 0.5, jy = y + (R() - 0.5) * size * 0.5;
      const rr = size * (0.3 + R() * 0.2);
      const sg = g.createRadialGradient(jx - rr * 0.35, jy - rr * 0.4, 0, jx, jy, rr * 1.5);
      sg.addColorStop(0, rgba(lift(light, 0.4), 0.42));
      sg.addColorStop(0.6, rgba(base, 0.05));
      sg.addColorStop(1, rgba(sink(dark, 0.35), 0.3));
      g.fillStyle = sg;
      g.beginPath(); g.arc(jx, jy, rr * 1.4, 0, 7); g.fill();
    }
  }
  g.restore();
  if (round) roundOff(g, d, { dark: sink(dark, 0.5), a: 0.5, width: round, lightCol: lift(light, 0.3), lightA: 0.24 });
}

/** A markings mask: paint `colour` through a loop, clipped to the body. */
function marking(g, body, d, colour, o = {}) {
  const { soft = 5, alpha = 1, R } = o;
  g.save();
  trace(g, body); g.clip();
  if (soft) g.filter = 'blur(' + soft + 'px)';
  g.globalAlpha = alpha;
  trace(g, d);
  g.fillStyle = colour;
  g.fill();
  g.filter = 'none';
  g.globalAlpha = 1;
  // fur runs across the boundary, so the boundary must be hairy too
  if (R) {
    const b = bbox(d);
    for (let i = 0; i < d.length; i += 3) {
      const p = d[i];
      const [nx, ny] = normalAt(d, i, b.cx, b.cy);
      const L = 3 + R() * 8;
      g.strokeStyle = rgba(colour, 0.2 + R() * 0.5);
      g.lineWidth = 0.5 + R() * 0.8;
      g.beginPath();
      g.moveTo(p[0] - nx * L * 0.4, p[1] - ny * L * 0.4);
      g.lineTo(p[0] + nx * L, p[1] + ny * L);
      g.stroke();
    }
  }
  g.restore();
}

/* ═══════════════════════════════════════════════════════════════════════════
   the eye
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * An animal eye under a direct flash. In order: socket shadow, wet sclera,
 * iris with radial striations and a dark limbal ring, pupil (round or slit),
 * TAPETUM EYESHINE — the bounce off the back of the eye that makes every
 * flash photo of a pet look like that — then the specular window highlight and
 * the lid shadow. The eyeshine is the single most photographic mark on the
 * whole picture and it is why these read as snapshots rather than drawings.
 */
function eye(g, x, y, r, o) {
  const {
    iris = '#8a5a24', pupil = 'round', tilt = 0, shine = '#dff4ff',
    glow = null, aspect = 1, lidTop = 0.3, lidCol = '#241a12',
    open = 1, look = 0, R,
  } = o;
  g.save();
  g.translate(x, y);
  g.rotate(tilt);

  // socket
  const sk = g.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 2.5);
  sk.addColorStop(0, rgba(sink(lidCol, 0.2), 0.55));
  sk.addColorStop(1, rgba(sink(lidCol, 0.2), 0));
  g.fillStyle = sk;
  g.beginPath(); g.arc(0, 0, r * 2.5, 0, 7); g.fill();

  g.save();
  g.beginPath(); g.ellipse(0, 0, r, r * aspect * open, 0, 0, 7); g.clip();

  // eyeball body
  const eb = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.25);
  eb.addColorStop(0, lift(iris, 0.5));
  eb.addColorStop(0.5, iris);
  eb.addColorStop(1, sink(iris, 0.62));
  g.fillStyle = eb;
  g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);

  // striations
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + (R ? R() * 0.1 : 0);
    g.strokeStyle = rgba(i % 2 ? lift(iris, 0.55) : sink(iris, 0.5), 0.16 + (R ? R() * 0.2 : 0.1));
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    g.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02);
    g.stroke();
  }

  // eyeshine: the flash coming back out
  if (glow) {
    const eg = g.createRadialGradient(look * r * 0.2, 0, 0, 0, 0, r * 1.05);
    eg.addColorStop(0, rgba(lift(glow, 0.55), 0.85));
    eg.addColorStop(0.42, rgba(glow, 0.5));
    eg.addColorStop(1, rgba(glow, 0));
    g.fillStyle = eg;
    g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  }

  // pupil
  g.fillStyle = 'rgba(6,5,9,0.94)';
  g.beginPath();
  if (pupil === 'slit') g.ellipse(look * r * 0.16, 0, r * 0.19, r * 0.86, 0, 0, 7);
  else if (pupil === 'wide') g.ellipse(look * r * 0.14, 0, r * 0.62, r * 0.62, 0, 0, 7);
  else g.ellipse(look * r * 0.14, 0, r * 0.44, r * 0.46, 0, 0, 7);
  g.fill();

  // limbal ring
  g.strokeStyle = 'rgba(8,6,10,0.6)';
  g.lineWidth = r * 0.2;
  g.beginPath(); g.arc(0, 0, r * 0.98, 0, 7); g.stroke();

  // the window: a soft square catchlight, off to one side, plus its echo
  g.fillStyle = rgba(shine, 0.95);
  g.beginPath();
  g.ellipse(-r * 0.34, -r * 0.4, r * 0.3, r * 0.24, -0.4, 0, 7);
  g.fill();
  g.fillStyle = rgba(shine, 0.42);
  g.beginPath(); g.arc(r * 0.36, r * 0.36, r * 0.15, 0, 7); g.fill();
  g.fillStyle = rgba(lift(shine, 0.4), 0.5);
  g.beginPath(); g.arc(-r * 0.28, -r * 0.34, r * 0.13, 0, 7); g.fill();

  // lid shadow
  const ls = g.createLinearGradient(0, -r * aspect, 0, r * aspect * 0.3);
  ls.addColorStop(0, rgba(sink(lidCol, 0.3), lidTop));
  ls.addColorStop(1, rgba(lidCol, 0));
  g.fillStyle = ls;
  g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  g.restore();

  // wet rim
  g.strokeStyle = rgba(sink(lidCol, 0.4), 0.72);
  g.lineWidth = Math.max(1, r * 0.16);
  g.beginPath(); g.ellipse(0, 0, r, r * aspect * open, 0, 0, 7); g.stroke();
  g.strokeStyle = rgba(lift(lidCol, 0.42), 0.3);
  g.lineWidth = Math.max(0.8, r * 0.09);
  g.beginPath(); g.ellipse(0, r * 0.1, r * 0.96, r * aspect * open * 0.96, 0, 0.5, Math.PI - 0.5); g.stroke();
  g.restore();
}

/** A wet nose: leather, nostrils, and the specular blob that says "damp". */
function nose(g, x, y, w, h, col, o = {}) {
  const { shine = 0.8 } = o;
  g.save();
  g.translate(x, y);
  const ng = g.createRadialGradient(-w * 0.2, -h * 0.35, 0, 0, 0, w);
  ng.addColorStop(0, lift(col, 0.4));
  ng.addColorStop(0.55, col);
  ng.addColorStop(1, sink(col, 0.5));
  g.fillStyle = ng;
  g.beginPath();
  g.moveTo(-w, -h * 0.42);
  g.quadraticCurveTo(-w * 0.9, -h, 0, -h);
  g.quadraticCurveTo(w * 0.9, -h, w, -h * 0.42);
  g.quadraticCurveTo(w * 0.86, h * 0.6, 0, h);
  g.quadraticCurveTo(-w * 0.86, h * 0.6, -w, -h * 0.42);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(8,4,8,0.6)';
  g.beginPath(); g.ellipse(-w * 0.44, -h * 0.05, w * 0.2, h * 0.3, 0.4, 0, 7); g.fill();
  g.beginPath(); g.ellipse(w * 0.44, -h * 0.05, w * 0.2, h * 0.3, -0.4, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,252,248,' + (0.55 * shine) + ')';
  g.beginPath(); g.ellipse(-w * 0.22, -h * 0.5, w * 0.26, h * 0.19, -0.3, 0, 7); g.fill();
  g.strokeStyle = rgba(sink(col, 0.55), 0.5);
  g.lineWidth = Math.max(1, w * 0.08);
  g.beginPath(); g.moveTo(0, h * 0.7); g.lineTo(0, h * 1.5); g.stroke();
  g.restore();
}

function whiskers(g, x, y, n, len, dirSign, R, col) {
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (-0.5 + (i / Math.max(1, n - 1)) * 1.0) * 0.85 + (R() - 0.5) * 0.12;
    const L = len * (0.62 + R() * 0.55);
    const ex = x + dirSign * Math.cos(a) * L;
    const ey = y + Math.sin(a) * L;
    g.strokeStyle = rgba(col, 0.2 + R() * 0.4);
    g.lineWidth = 0.7 + R() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + dirSign * Math.cos(a) * L * 0.55, y + Math.sin(a) * L * 0.45 - L * 0.1, ex, ey);
    g.stroke();
  }
  g.restore();
}

/* ═══════════════════════════════════════════════════════════════════════════
   illustration pigment — see the header note. Not UI colour. Never a token.
   ═══════════════════════════════════════════════════════════════════════════ */

const PELT = {
  soot: '#241f24', sootHi: '#4a4048', sootLo: '#0d0b0f',
  cream: '#f4e6cf', creamHi: '#fffaf0', creamLo: '#c2ad90',
  ginger: '#c2762f', gingerHi: '#efab5c', gingerLo: '#7d4416',
  cocoa: '#7a5334', cocoaHi: '#b98a58', cocoaLo: '#412a17',
  tan: '#c99a5e', tanHi: '#efc78e', tanLo: '#8a6031',
  slate: '#8d8b93', slateHi: '#c5c3ca', slateLo: '#4f4d55',
  gold: '#d8a047', goldHi: '#f6cd82', goldLo: '#8e6222',
  fern: '#5f9a3c', fernHi: '#93c862', fernLo: '#2f5a1c',
  lime: '#9fc94e', teal: '#2f7f6b',
  chilli: '#c8452a', chilliHi: '#f07b52',
  sand: '#e0c079', sandHi: '#f6e2ab', sandLo: '#a1834a',
  pinkSkin: '#e8a493', pinkHi: '#f7cfc2', pinkLo: '#b06f5f',
  leather: '#2a1c1c', liver: '#5b3226',
  amber: '#c98a1e', jade: '#7fbf5a', ruby: '#c0392b',
  wood: '#5c3a22', woodHi: '#8a5c35',
  lino: '#c9bda2', carpet: '#5d4b3c', hay: '#c8a95e',
  bedding: '#e3d6bd', lawn: '#4b6b33', night: '#141a24',
};

/** Human skin and hair. Same rule: illustration pigment, not interface colour. */
const SKIN = {
  porcelain: ['#f0cdb4', '#ffe6d4', '#b9846a'],
  fair: ['#e8bd9c', '#fbdcc2', '#ac7554'],
  olive: ['#d3a172', '#f0c79b', '#94643c'],
  tan: ['#bd8551', '#e0ac78', '#7c5029'],
  brown: ['#96603a', '#c08a5c', '#5d3820'],
  deep: ['#6d4227', '#9a6741', '#3d2113'],
  rich: ['#4e2e1c', '#7a4e30', '#2a160c'],
};

/* ═══════════════════════════════════════════════════════════════════════════
   camera — flash, halation, grade, grain
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Scratch canvases are POOLED by size. Sixteen photographs allocating six
 * full-frame canvases each was 1.0 s of the 2.0 s the first version cost, and
 * most of that was the allocation and the GC behind it, not the drawing.
 */
/**
 * `willReadFrequently` matters more here than anywhere else in the build. Every
 * one of these canvases ends in `toDataURL`, which forces a GPU->CPU readback;
 * on the accelerated backend that stall was two thirds of the render cost. On
 * the software backend there is no readback at all and the vector work is not
 * meaningfully slower, because none of it is a texture upload.
 */
export const CTX2D = { willReadFrequently: true, alpha: false };
/** Scratch layers MUST keep their alpha channel: `blurred()` composites them
 *  over the picture and `grade()` masks one with destination-in. An opaque
 *  scratch paints a black rectangle over the whole photograph. */
const CTX2DA = { willReadFrequently: true, alpha: true };

const POOL = new Map();
function scratchCanvas(w, h, slot = 0) {
  const k = w + 'x' + h + '#' + slot;
  let c = POOL.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; POOL.set(k, c); }
  const x = c.getContext('2d', CTX2DA);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.filter = 'none';
  x.clearRect(0, 0, w, h);
  return c;
}

/**
 * Depth of field. Everything painted by `fn` comes back blurred by `px`.
 * The layer is painted at HALF resolution and scaled up, which is both four
 * times less blur to compute and, conveniently, a slightly mushier blur —
 * exactly what an out-of-focus background looks like.
 */
function blurred(g, w, h, px, fn) {
  const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
  const c = scratchCanvas(hw, hh, 1);
  const x = c.getContext('2d');
  x.save();
  x.scale(0.5, 0.5);
  fn(x);
  x.restore();
  g.save();
  g.filter = 'blur(' + (px / 2) + 'px)';
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, w, h);
  g.filter = 'none';
  g.restore();
}

/**
 * One 96px grain tile, generated once and tiled forever. Building a fresh
 * full-frame ImageData per photograph was 300k RNG calls a piece.
 */
let _grainTile = null;
function grainTile() {
  if (_grainTile) return _grainTile;
  const n = 96;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const x = c.getContext('2d');
  const id = x.createImageData(n, n);
  const d = id.data;
  const R = mulberry(0x9e3779b9);
  for (let i = 0; i < d.length; i += 4) {
    const v = 118 + (R() - 0.5) * 200;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  _grainTile = c;
  return c;
}

/**
 * The grade. Order matters: light effects (flash falloff, halation) belong to
 * the lens and happen first; chemistry (black lift, cast) belongs to the film
 * and happens after; grain and edge softness belong to the print and happen
 * last. Doing the black lift before the halation makes the glow look like fog.
 */
function grade(g, cv, w, h, R, o = {}) {
  const {
    warm = 0.5, lift0 = '#171f28', liftA = 0.2, vig = 0.9,
    cast = '#2a3a4a', castA = 0.13, grain = 0.075, bloom = 0.3,
    flashX = 0.42, flashY = 0.34, date = null, dateCol = '#ff8b2c',
  } = o;
  const t = tokens();

  // flash falloff — the corners of a flash photo are always dark
  const ff = g.createRadialGradient(w * flashX, h * flashY, Math.min(w, h) * 0.14,
    w * flashX, h * flashY, Math.max(w, h) * 0.86);
  ff.addColorStop(0, 'rgba(255,246,228,0.16)');
  ff.addColorStop(0.42, 'rgba(0,0,0,0)');
  ff.addColorStop(1, 'rgba(0,0,0,' + (0.55 * vig) + ')');
  g.fillStyle = ff;
  g.fillRect(0, 0, w, h);

  // halation: bright edges bleed a warm glow into their surroundings.
  // Computed at quarter scale — a 44px blur of a 160px image is the same
  // picture as an 11px blur of a 640px one, for a sixteenth of the work.
  if (bloom > 0) {
    const qw = Math.ceil(w / 4), qh = Math.ceil(h / 4);
    const c = scratchCanvas(qw, qh, 2);
    const x = c.getContext('2d');
    x.filter = 'blur(3px) saturate(1.6) brightness(1.2)';
    x.drawImage(cv, 0, 0, qw, qh);
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = bloom;
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, w, h);
    g.restore();
  }

  // contrast: an S-curve, because everything above has been additive and the
  // midtones have crept together. Overlay with a copy of the frame is the
  // cheapest true contrast curve canvas has.
  {
    const qw = Math.ceil(w / 2), qh = Math.ceil(h / 2);
    const c = scratchCanvas(qw, qh, 5);
    const x = c.getContext('2d', CTX2DA);
    x.drawImage(cv, 0, 0, qw, qh);
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.3;
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, w, h);
    g.restore();
  }

  // chemistry: raise the floor, then push a cast into it
  g.save();
  g.globalCompositeOperation = 'lighten';
  g.fillStyle = rgba(lift0, 1);
  g.globalAlpha = liftA;
  g.fillRect(0, 0, w, h);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'soft-light';
  const cg = g.createLinearGradient(0, 0, w * 0.3, h);
  cg.addColorStop(0, rgba(t.flame300, warm * 0.85));
  cg.addColorStop(1, rgba(cast, 1));
  g.globalAlpha = Math.max(castA, warm * 0.5);
  g.fillStyle = cg;
  g.fillRect(0, 0, w, h);
  g.restore();

  // corner softness — a cheap lens is only sharp in the middle. One scratch,
  // blurred and then masked in place with destination-in, then drawn back.
  const soft = scratchCanvas(w, h, 3);
  const sx = soft.getContext('2d');
  sx.filter = 'blur(3.2px)';
  sx.drawImage(cv, 0, 0);
  sx.filter = 'none';
  sx.globalCompositeOperation = 'destination-in';
  const mask = sx.createRadialGradient(w * 0.46, h * 0.44, Math.min(w, h) * 0.2,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.66);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  sx.fillStyle = mask;
  sx.fillRect(0, 0, w, h);
  g.save();
  g.globalAlpha = 0.9;
  g.drawImage(soft, 0, 0);
  g.restore();

  // grain, tiled from the shared 96px plate with a per-photograph offset so
  // no two pictures show the same speckle in the same place
  const tile = grainTile();
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = grain;
  const pat = g.createPattern(tile, 'repeat');
  g.translate(-Math.floor(R() * 96), -Math.floor(R() * 96));
  g.fillStyle = pat;
  g.fillRect(0, 0, w + 96, h + 96);
  g.restore();

  // a light leak, because these cameras all had one
  if (R() < 0.75) {
    const side = R() < 0.5;
    const lk = g.createLinearGradient(side ? 0 : w, 0, side ? w * 0.3 : w * 0.7, h * 0.4);
    lk.addColorStop(0, rgba(t.flameGlow, 0.16));
    lk.addColorStop(1, rgba(t.flameGlow, 0));
    g.save();
    g.globalCompositeOperation = 'screen';
    g.fillStyle = lk;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  // the orange date imprint every one of these cameras burned into the corner
  if (date) {
    const fs = Math.max(9, Math.round(h * 0.042));
    g.save();
    g.font = '600 ' + fs + 'px "DSEG7", "Courier New", monospace';
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.shadowColor = rgba(dateCol, 0.85);
    g.shadowBlur = fs * 0.7;
    g.fillStyle = rgba(lift(dateCol, 0.45), 0.92);
    g.fillText(date, w - fs * 0.8, h - fs * 0.75);
    g.restore();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   the rooms these photographs were taken in
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Backdrops. Each is drawn into a blurred layer, so they only ever contribute
 * shape, colour and depth — never detail that competes with the animal. What
 * they DO carry is where this pet lived, which is most of the individuality:
 * Pixel's vivarium heat lamp is not Scout's back fence at dusk.
 */
function room(g, w, h, kind, R) {
  const t = tokens();
  blurred(g, w, h, 13, (x) => {
    const wall = (a, b) => {
      const gr = x.createLinearGradient(0, 0, w * 0.3, h);
      gr.addColorStop(0, a); gr.addColorStop(1, b);
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    };
    switch (kind) {
      case 'hallway': {                       // Orbit: a dark landing at night
        wall(mix(t.ink700, PELT.cocoa, 0.32), t.ink900);
        x.fillStyle = rgba(sink(PELT.wood, 0.35), 1);
        x.fillRect(0, h * 0.72, w, h * 0.28);
        for (let i = 0; i < 7; i++) {         // banister spindles
          x.fillStyle = rgba(sink(PELT.wood, 0.55), 0.9);
          x.fillRect(w * (0.02 + i * 0.16), h * 0.1, w * 0.028, h * 0.66);
        }
        const mg = x.createRadialGradient(w * 0.86, h * 0.16, 0, w * 0.86, h * 0.16, w * 0.5);
        mg.addColorStop(0, rgba(t.spec200, 0.5));
        mg.addColorStop(1, rgba(t.spec500, 0));
        x.fillStyle = mg; x.fillRect(0, 0, w, h);
        break;
      }
      case 'kitchen': {                       // Pepper: bright, cluttered, warm
        wall(mix(PELT.cream, t.flame300, 0.3), mix(PELT.tan, t.ink700, 0.45));
        x.fillStyle = rgba(mix(PELT.slate, t.flame200, 0.3), 0.85);
        x.fillRect(0, h * 0.6, w, h * 0.1);
        for (let i = 0; i < 5; i++) {
          x.fillStyle = rgba(PELT.wood, 0.55);
          x.fillRect(w * (0.05 + i * 0.2), h * 0.06, w * 0.13, h * 0.3);
        }
        x.fillStyle = rgba(t.flame100, 0.5);
        x.beginPath(); x.arc(w * 0.14, h * 0.12, w * 0.16, 0, 7); x.fill();
        break;
      }
      case 'hutch': {                         // Mochi: hay, a cardboard box
        wall(mix(PELT.hay, t.ink700, 0.5), sink(PELT.wood, 0.5));
        x.fillStyle = rgba(PELT.hay, 0.7);
        x.fillRect(0, h * 0.66, w, h * 0.34);
        for (let i = 0; i < 60; i++) {
          x.strokeStyle = rgba(lift(PELT.hay, R() * 0.4), 0.5);
          x.lineWidth = 2.4;
          const sx2 = R() * w, sy = h * (0.6 + R() * 0.4);
          x.beginPath(); x.moveTo(sx2, sy); x.lineTo(sx2 + (R() - 0.5) * 60, sy + (R() - 0.5) * 20); x.stroke();
        }
        x.fillStyle = rgba(mix(PELT.tan, PELT.cocoa, 0.4), 0.9);
        x.fillRect(w * 0.62, h * 0.2, w * 0.42, h * 0.5);
        break;
      }
      case 'cage': {                          // Sprocket: bars and a bookshelf
        wall(mix(t.ink700, PELT.slate, 0.3), t.ink900);
        for (let i = 0; i < 9; i++) {         // book spines
          x.fillStyle = rgba([PELT.chilli, PELT.fern, PELT.gold, PELT.teal][i % 4], 0.5);
          x.fillRect(w * (0.02 + i * 0.11), h * (0.08 + R() * 0.06), w * 0.075, h * 0.42);
        }
        x.fillStyle = rgba(sink(PELT.wood, 0.3), 1);
        x.fillRect(0, h * 0.52, w, h * 0.48);
        break;
      }
      case 'vivarium': {                      // Pixel: heat lamp, sand, branch
        wall(mix(PELT.sand, t.ink700, 0.55), sink(PELT.cocoa, 0.55));
        const lg = x.createRadialGradient(w * 0.2, 0, 0, w * 0.2, 0, w * 0.8);
        lg.addColorStop(0, rgba(t.flameGlow, 0.75));
        lg.addColorStop(0.4, rgba(PELT.chilli, 0.28));
        lg.addColorStop(1, rgba(PELT.chilli, 0));
        x.fillStyle = lg; x.fillRect(0, 0, w, h);
        x.fillStyle = rgba(PELT.sand, 0.85);
        x.fillRect(0, h * 0.7, w, h * 0.3);
        x.strokeStyle = rgba(sink(PELT.wood, 0.25), 0.9);
        x.lineWidth = h * 0.09;
        x.beginPath(); x.moveTo(-w * 0.1, h * 0.62); x.quadraticCurveTo(w * 0.5, h * 0.5, w * 1.1, h * 0.7); x.stroke();
        break;
      }
      case 'garden': {                        // Scout: back lawn, dusk, fence
        const sky = x.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, mix(t.spec500, t.flame400, 0.45));
        sky.addColorStop(0.45, mix(t.ink700, PELT.night, 0.4));
        sky.addColorStop(1, sink(PELT.lawn, 0.45));
        x.fillStyle = sky; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {        // fence
          x.fillStyle = rgba(sink(PELT.wood, 0.45), 0.9);
          x.fillRect(w * (i * 0.075), h * 0.24, w * 0.055, h * 0.4);
        }
        x.fillStyle = rgba(PELT.lawn, 0.85);
        x.fillRect(0, h * 0.6, w, h * 0.4);
        break;
      }
      case 'bedding': {                       // Mooncake: shredded paper, tunnel
        wall(mix(PELT.bedding, t.ink700, 0.42), sink(PELT.tan, 0.5));
        for (let i = 0; i < 140; i++) {
          x.strokeStyle = rgba(lift(PELT.bedding, R() * 0.35), 0.55);
          x.lineWidth = 3 + R() * 4;
          const sx2 = R() * w, sy = h * (0.42 + R() * 0.62);
          x.beginPath(); x.moveTo(sx2, sy); x.lineTo(sx2 + (R() - 0.5) * 70, sy + (R() - 0.5) * 26); x.stroke();
        }
        x.strokeStyle = rgba(mix(t.spec300, PELT.cream, 0.5), 0.5);
        x.lineWidth = h * 0.2;
        x.beginPath(); x.moveTo(w * 0.78, h * 0.1); x.lineTo(w * 1.1, h * 0.5); x.stroke();
        break;
      }
      default: {                              // Bean: kitchen lino, a bowl
        wall(mix(PELT.lino, t.ink700, 0.4), sink(PELT.lino, 0.6));
        x.fillStyle = rgba(sink(PELT.lino, 0.2), 0.5);
        for (let i = -1; i < 8; i++) {
          x.save(); x.translate(w * i * 0.18, 0); x.rotate(0.12);
          x.fillRect(0, -h * 0.2, w * 0.05, h * 1.6); x.restore();
        }
        x.fillStyle = rgba(mix(PELT.fern, t.ink700, 0.25), 0.8);
        x.beginPath(); x.ellipse(w * 0.86, h * 0.5, w * 0.2, h * 0.16, 0, 0, 7); x.fill();
        break;
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   the eight pets
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Each entry is one animal, not one species: Orbit's white chest patch, the
 * brown patch over Bean's right eye and Sprocket's hood are named in
 * docs/design/kids/*.md and they are the things the kids would recognise them
 * by, so they are the things the photographs have to show.
 *
 *   scene   which room, above
 *   paint   the species painter
 *   date    the imprint in the corner — the day they went missing
 */
/**
 * `frame` is the thing that stops these reading as an icon set. Eight animals
 * photographed dead-centre at the same size, all fully inside the frame, is a
 * sticker sheet. A real person taking a picture of a rabbit gets too close,
 * cuts an ear off, tilts the camera and puts the subject a third of the way
 * across. So each pet gets its own crop: `z` zoom, `dx`/`dy` offset in frame
 * widths, `rot` camera tilt in radians, `blur` a smear if they moved.
 *
 * `key` is where the flash lands, in frame coordinates. Everything else in the
 * lighting follows from it, so moving it moves the whole picture's mood.
 */
const PETS = {
  orbit: {
    kid: 'maya', scene: 'hallway', paint: paintCat, date: '11 03 2019', shine: '#7ad6a8',
    frame: { z: 1.26, dx: -0.06, dy: 0.07, rot: -0.05, blur: 0 }, key: [0.36, 0.3], dark: 0.62,
  },
  pepper: {
    kid: 'mateo', scene: 'kitchen', paint: paintConure, date: '02 09 2020', shine: null,
    frame: { z: 1.1, dx: 0.09, dy: 0.02, rot: 0.07, blur: 1.4 }, key: [0.6, 0.26], dark: 0.4,
  },
  mochi: {
    kid: 'amina', scene: 'hutch', paint: paintLop, date: '24 06 2021', shine: '#e07070',
    frame: { z: 1.08, dx: 0.03, dy: 0.06, rot: 0.03, blur: 0 }, key: [0.38, 0.24], dark: 0.46,
  },
  sprocket: {
    kid: 'eli', scene: 'cage', paint: paintRat, date: '07 01 2022', shine: '#e26a6a',
    frame: { z: 1.02, dx: -0.1, dy: -0.02, rot: -0.09, blur: 2.2 }, key: [0.34, 0.34], dark: 0.58,
  },
  pixel: {
    kid: 'priya', scene: 'vivarium', paint: paintGecko, date: '19 08 2021', shine: null,
    frame: { z: 1.12, dx: -0.02, dy: -0.02, rot: 0.05, blur: 0 }, key: [0.26, 0.28], dark: 0.44,
  },
  scout: {
    kid: 'jordan', scene: 'garden', paint: paintBeagle, date: '30 04 2020', shine: '#8fd66a',
    frame: { z: 1.14, dx: -0.03, dy: 0.06, rot: -0.06, blur: 1.1 }, key: [0.58, 0.24], dark: 0.5,
  },
  mooncake: {
    kid: 'lena', scene: 'bedding', paint: paintHamster, date: '15 11 2022', shine: '#e77a6a',
    frame: { z: 1.02, dx: 0.02, dy: 0.02, rot: 0.1, blur: 0 }, key: [0.4, 0.3], dark: 0.42,
  },
  bean: {
    kid: 'samir', scene: 'lino', paint: paintGuinea, date: '05 12 2022', shine: '#e0736b',
    frame: { z: 1.05, dx: -0.06, dy: 0.03, rot: 0.04, blur: 0 }, key: [0.32, 0.32], dark: 0.48,
  },
};

/** slug lookups both ways, so callers can pass a kid or a pet or a name. */
const PET_BY_KID = {};
for (const [pet, spec] of Object.entries(PETS)) PET_BY_KID[spec.kid] = pet;

/** Resolve anything a caller might hold to a pet key. */
export function petKey(any) {
  const s = String(any || '').toLowerCase().trim();
  if (PETS[s]) return s;
  if (PET_BY_KID[s]) return PET_BY_KID[s];
  const k = KIDS.find((x) => x.slug === s || x.pet.toLowerCase() === s || x.name.toLowerCase() === s);
  if (k) return PET_BY_KID[k.slug] || k.pet.toLowerCase();
  return null;
}

/* ── Orbit: black domestic cat, white patch on his chest ─────────────────── */
function paintCat(g, w, h, R) {
  const cx = w * 0.47, cy = h * 0.6, s = h / 480;
  const base = PELT.soot, hi = PELT.sootHi, lo = PELT.sootLo;

  // chest / shoulders, pushing out of frame at the bottom
  const body = loop([
    [cx - 200 * s, h + 40], [cx - 190 * s, cy + 60 * s], [cx - 130 * s, cy - 30 * s],
    [cx - 20 * s, cy - 52 * s], [cx + 110 * s, cy - 24 * s], [cx + 188 * s, cy + 70 * s],
    [cx + 208 * s, h + 40],
  ], 10);
  fur(g, body, { base, dark: lo, light: hi, R, len: 13 * s, dens: 0.0052,
    dir: (x, y) => Math.atan2(h + 60 - y, (cx - x) * 0.25) * 0.55 + 1.1, key: [0.3, 0.1] });
  fuzz(g, body, { colors: [hi, base, lift(hi, 0.3)], len: 13 * s, R, step: 2 });

  // the white chest patch — the thing Maya would point at in the photograph
  const patch = loop([
    [cx - 18 * s, cy + 34 * s], [cx + 30 * s, cy + 46 * s], [cx + 44 * s, cy + 120 * s],
    [cx + 6 * s, cy + 170 * s], [cx - 42 * s, cy + 128 * s], [cx - 40 * s, cy + 62 * s],
  ], 8);
  marking(g, body, patch, rgba(PELT.creamHi, 0.92), { soft: 7 * s, R });
  g.save();
  trace(g, body); g.clip();
  for (let i = 0; i < 420; i++) {              // guard hairs over the patch edge
    const a = R() * Math.PI * 2, rr = 40 * s + R() * 100 * s;
    const x = cx + Math.cos(a) * rr * 0.6, y = cy + 100 * s + Math.sin(a) * rr * 0.7;
    g.strokeStyle = rgba(R() < 0.5 ? PELT.creamHi : hi, 0.1 + R() * 0.3);
    g.lineWidth = 0.6 + R();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 12 * s, y + 9 * s + R() * 10 * s); g.stroke();
  }
  g.restore();

  // ears — drawn before the head so the head's fuzz overlaps their base
  for (const o of [-1, 1]) {
    const ex = cx + o * 96 * s, ey = cy - 196 * s;
    const ear = loop([
      [ex - o * 44 * s, ey + 66 * s], [ex - o * 26 * s, ey - 44 * s],
      [ex + o * 22 * s, ey - 56 * s], [ex + o * 46 * s, ey + 52 * s],
    ], 9);
    fur(g, ear, { base: sink(base, 0.15), dark: lo, light: hi, R, len: 8 * s, dens: 0.006,
      dir: () => Math.PI * 0.5, key: [0.4, 0.6] });
    fuzz(g, ear, { colors: [hi, PELT.creamLo, base], len: 12 * s, R, step: 2, arc: 0.8 });
    // the pink inner ear catching the flash
    g.save();
    trace(g, ear); g.clip();
    const ig = g.createRadialGradient(ex, ey + 16 * s, 0, ex, ey + 16 * s, 46 * s);
    ig.addColorStop(0, rgba(PELT.pinkSkin, 0.55));
    ig.addColorStop(1, rgba(PELT.pinkSkin, 0));
    g.fillStyle = ig; g.fillRect(ex - 60 * s, ey - 70 * s, 120 * s, 150 * s);
    g.restore();
  }

  // head
  const head = loop([
    [cx - 118 * s, cy - 150 * s], [cx - 132 * s, cy - 60 * s], [cx - 96 * s, cy + 30 * s],
    [cx, cy + 62 * s], [cx + 100 * s, cy + 28 * s], [cx + 134 * s, cy - 62 * s],
    [cx + 116 * s, cy - 152 * s], [cx + 46 * s, cy - 196 * s], [cx - 50 * s, cy - 194 * s],
  ], 10);
  fur(g, head, { base, dark: lo, light: hi, R, len: 10 * s, dens: 0.008,
    dir: (x, y) => Math.atan2(y - (cy - 190 * s), x - cx) , key: [0.3, 0.2] });
  fuzz(g, head, { colors: [hi, base, lift(hi, 0.35)], len: 12 * s, R, step: 2 });

  // muzzle
  const muz = oval(cx, cy - 6 * s, 66 * s, 44 * s, 0);
  fur(g, muz, { base: mix(base, PELT.slate, 0.22), dark: base, light: lift(hi, 0.2), R,
    len: 6 * s, dens: 0.012, dir: (x) => (x < cx ? Math.PI - 0.5 : 0.5), key: [0.4, 0.3] });

  nose(g, cx, cy - 22 * s, 20 * s, 15 * s, mix(PELT.leather, PELT.pinkLo, 0.35));
  g.strokeStyle = rgba(sink(base, 0.4), 0.65);
  g.lineWidth = 2.4 * s;
  g.beginPath();
  g.moveTo(cx - 34 * s, cy + 4 * s); g.quadraticCurveTo(cx - 12 * s, cy + 20 * s, cx, cy + 6 * s);
  g.quadraticCurveTo(cx + 12 * s, cy + 20 * s, cx + 34 * s, cy + 4 * s);
  g.stroke();

  whiskers(g, cx - 40 * s, cy - 6 * s, 6, 150 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 40 * s, cy - 6 * s, 6, 150 * s, 1, R, PELT.creamHi);

  const er = 40 * s;
  eye(g, cx - 62 * s, cy - 92 * s, er, { iris: PELT.jade, pupil: 'slit', glow: '#7ad6a8', R, tilt: 0.14, lidCol: lo });
  eye(g, cx + 66 * s, cy - 92 * s, er, { iris: PELT.jade, pupil: 'slit', glow: '#7ad6a8', R, tilt: -0.14, lidCol: lo });
}

/* ── Pepper: green-cheek conure ───────────────────────────── */
/* Round 1 gave him a small head on a big scalloped chest and he read as a
   knitted jumper with a beak. A conure is mostly head: the skull is nearly as
   wide as the body, the eye is enormous and ringed in bare white skin, and the
   grey breast scalloping is a fine texture rather than a pattern of scales. */
function paintConure(g, w, h, R) {
  const cx = w * 0.46, cy = h * 0.56, s = h / 480;

  // perch
  g.save();
  g.strokeStyle = rgba(sink(PELT.wood, 0.25), 1);
  g.lineWidth = 26 * s;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(-30, h * 0.98); g.lineTo(w + 30, h * 0.9); g.stroke();
  g.strokeStyle = rgba(lift(PELT.wood, 0.25), 0.4);
  g.lineWidth = 5 * s;
  g.beginPath(); g.moveTo(-30, h * 0.955); g.lineTo(w + 30, h * 0.875); g.stroke();
  g.restore();

  // body: a teardrop leaning back, tail dropping off the bottom right
  const body = loop([
    [cx - 104 * s, cy + 26 * s], [cx - 128 * s, cy + 138 * s], [cx - 74 * s, cy + 232 * s],
    [cx + 42 * s, cy + 250 * s], [cx + 130 * s, cy + 168 * s], [cx + 122 * s, cy + 40 * s],
    [cx + 46 * s, cy - 26 * s], [cx - 48 * s, cy - 20 * s],
  ], 11);
  plumage(g, body, { base: PELT.fern, dark: PELT.fernLo, light: PELT.fernHi, R,
    size: 15 * s, rows: 9, round: 0.26 });
  g.save();
  trace(g, body); g.clip();
  // the grey scalloped breast: fine, low contrast, only on the upper chest
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 13; i++) {
      const bx = cx - 100 * s + i * 18 * s + (r % 2 ? 9 * s : 0);
      const by = cy + 34 * s + r * 17 * s;
      g.strokeStyle = rgba(mix(PELT.slate, PELT.cream, 0.5), 0.22);
      g.lineWidth = 3 * s;
      g.beginPath(); g.arc(bx, by, 9 * s, 0.2, Math.PI - 0.2); g.stroke();
    }
  }
  // a warm rust wash low on the belly, which a green-cheek has
  const bel = g.createRadialGradient(cx + 6 * s, cy + 210 * s, 0, cx + 6 * s, cy + 210 * s, 130 * s);
  bel.addColorStop(0, rgba(mix(PELT.chilli, PELT.cocoa, 0.4), 0.55));
  bel.addColorStop(1, rgba(PELT.chilli, 0));
  g.fillStyle = bel;
  g.fillRect(cx - 140 * s, cy + 60 * s, 280 * s, 220 * s);
  g.restore();
  fuzz(g, body, { colors: [PELT.fernHi, PELT.fern, PELT.lime], len: 9 * s, R, step: 3, arc: 0.35 });

  // maroon tail, long, running out of the bottom of the frame
  const tail = loop([
    [cx + 78 * s, cy + 176 * s], [cx + 176 * s, cy + 222 * s], [cx + 226 * s, h + 60],
    [cx + 120 * s, h + 60], [cx + 44 * s, cy + 244 * s],
  ], 9);
  plumage(g, tail, { base: mix(PELT.chilli, PELT.cocoa, 0.4), dark: sink(PELT.chilli, 0.6),
    light: PELT.chilliHi, R, size: 26 * s, rows: 4, dir: 0.28, round: 0.2 });
  g.save();
  trace(g, tail); g.clip();
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = rgba(lift(PELT.chilliHi, 0.3), 0.28);
    g.lineWidth = 2.6 * s;
    g.beginPath();
    g.moveTo(cx + 62 * s + i * 12 * s, cy + 196 * s);
    g.lineTo(cx + 150 * s + i * 20 * s, h + 40);
    g.stroke();
  }
  g.restore();

  // folded wing with a blue flight edge
  const wing = loop([
    [cx - 104 * s, cy + 34 * s], [cx - 138 * s, cy + 132 * s], [cx - 92 * s, cy + 226 * s],
    [cx - 26 * s, cy + 194 * s], [cx - 34 * s, cy + 62 * s],
  ], 10);
  plumage(g, wing, { base: sink(PELT.fern, 0.22), dark: PELT.fernLo, light: PELT.fern,
    R, size: 17 * s, rows: 6, round: 0.28 });
  g.save();
  trace(g, wing); g.clip();
  const blue = g.createLinearGradient(cx - 140 * s, 0, cx - 86 * s, 0);
  blue.addColorStop(0, rgba(mix(PELT.teal, '#2f5fc0', 0.55), 0.75));
  blue.addColorStop(1, rgba(PELT.teal, 0));
  g.fillStyle = blue;
  g.fillRect(cx - 145 * s, cy + 90 * s, 62 * s, 150 * s);
  g.restore();

  /* The head. Big — a conure skull is nearly the width of its chest — set
     forward and overlapping the shoulders, with the dark olive cap and the
     rust cheek patch that name the species. */
  const head = loop([
    [cx - 118 * s, cy - 36 * s], [cx - 130 * s, cy - 132 * s], [cx - 76 * s, cy - 204 * s],
    [cx + 28 * s, cy - 216 * s], [cx + 112 * s, cy - 156 * s], [cx + 122 * s, cy - 52 * s],
    [cx + 56 * s, cy + 10 * s], [cx - 46 * s, cy + 8 * s],
  ], 11);
  plumage(g, head, { base: mix(PELT.cocoa, PELT.soot, 0.35), dark: sink(PELT.soot, 0.15),
    light: mix(PELT.cocoa, PELT.slate, 0.35), R, size: 8 * s, rows: 9, dir: 0.42, round: 0.22 });
  g.save();
  trace(g, head); g.clip();
  const ck = g.createRadialGradient(cx - 54 * s, cy - 72 * s, 0, cx - 54 * s, cy - 72 * s, 80 * s);
  ck.addColorStop(0, rgba(PELT.chilliHi, 0.62));
  ck.addColorStop(0.55, rgba(PELT.chilli, 0.3));
  ck.addColorStop(1, rgba(PELT.chilli, 0));
  g.fillStyle = ck;
  g.fillRect(cx - 140 * s, cy - 200 * s, 240 * s, 220 * s);
  const nk = g.createLinearGradient(0, cy - 58 * s, 0, cy + 14 * s);
  nk.addColorStop(0, rgba(PELT.fern, 0));
  nk.addColorStop(1, rgba(PELT.fernHi, 0.8));
  g.fillStyle = nk;
  g.fillRect(cx - 130 * s, cy - 66 * s, 260 * s, 90 * s);
  g.restore();
  fuzz(g, head, { colors: [mix(PELT.cocoa, PELT.slate, 0.5), PELT.fernHi, PELT.chilliHi],
    len: 8 * s, R, step: 3, arc: 0.4 });
  occlude(g, body, head, { dx: 0, dy: 16 * s, blur: 20 * s, a: 0.45 });

  // beak: horn grey, hooked, with a highlight down the culmen and a cere above
  g.save();
  const bk = loop([
    [cx + 26 * s, cy - 128 * s], [cx + 78 * s, cy - 112 * s], [cx + 86 * s, cy - 60 * s],
    [cx + 42 * s, cy - 6 * s], [cx + 16 * s, cy - 52 * s],
  ], 10);
  trace(g, bk);
  const bg = g.createLinearGradient(cx + 10 * s, cy - 140 * s, cx + 70 * s, cy + 10 * s);
  bg.addColorStop(0, mix(PELT.slate, PELT.leather, 0.35));
  bg.addColorStop(0.45, sink(PELT.slate, 0.4));
  bg.addColorStop(1, sink(PELT.leather, 0.2));
  g.fillStyle = bg; g.fill();
  g.strokeStyle = rgba(sink(PELT.slate, 0.65), 0.6); g.lineWidth = 2.4 * s; g.stroke();
  g.fillStyle = rgba(lift(PELT.slate, 0.55), 0.5);
  g.beginPath(); g.ellipse(cx + 48 * s, cy - 100 * s, 15 * s, 6 * s, -0.5, 0, 7); g.fill();
  g.restore();
  // cere: a narrow band of bare skin over the beak, not a second beak
  g.fillStyle = rgba(mix(PELT.slate, PELT.cocoa, 0.55), 0.85);
  g.beginPath(); g.ellipse(cx + 34 * s, cy - 130 * s, 18 * s, 9 * s, -0.2, 0, 7); g.fill();
  g.fillStyle = 'rgba(10,8,10,0.7)';
  g.beginPath(); g.arc(cx + 32 * s, cy - 130 * s, 4 * s, 0, 7); g.fill();

  // the bare white eye ring, then the eye inside it
  const ex = cx - 44 * s, ey = cy - 122 * s;
  g.strokeStyle = rgba(lift(PELT.creamHi, 0.2), 0.92);
  g.lineWidth = 9 * s;
  g.beginPath(); g.arc(ex, ey, 32 * s, 0, 7); g.stroke();
  g.strokeStyle = rgba(sink(PELT.tan, 0.45), 0.4);
  g.lineWidth = 2 * s;
  g.beginPath(); g.arc(ex, ey, 37 * s, 0, 7); g.stroke();
  eye(g, ex, ey, 27 * s, { iris: sink(PELT.cocoa, 0.4), pupil: 'wide', glow: '#c05a4a',
    shine: '#ffffff', R, lidCol: PELT.leather });

  // feet gripping the perch
  for (const o of [-1, 1]) {
    g.save();
    g.strokeStyle = rgba(mix(PELT.slate, PELT.pinkLo, 0.42), 0.95);
    g.lineWidth = 10 * s;
    g.lineCap = 'round';
    for (let t2 = -1; t2 <= 1; t2++) {
      g.beginPath();
      g.moveTo(cx + o * 42 * s, cy + 226 * s);
      g.quadraticCurveTo(cx + o * 54 * s + t2 * 18 * s, cy + 268 * s,
        cx + o * 48 * s + t2 * 34 * s, cy + 296 * s);
      g.stroke();
    }
    g.restore();
  }
}

/* ── Mochi: lop-eared rabbit ─────────────────────────────────────────────── */
function paintLop(g, w, h, R) {
  const cx = w * 0.48, cy = h * 0.52, s = h / 480;
  const base = mix(PELT.slate, PELT.cream, 0.42);
  const hi = lift(base, 0.35), lo = sink(base, 0.5);

  const body = loop([
    [cx - 190 * s, h + 40], [cx - 176 * s, cy + 120 * s], [cx - 110 * s, cy + 40 * s],
    [cx + 60 * s, cy + 34 * s], [cx + 176 * s, cy + 130 * s], [cx + 196 * s, h + 40],
  ], 10);
  fur(g, body, { base, dark: lo, light: hi, R, len: 16 * s, dens: 0.006,
    dir: (x, y) => Math.atan2(h - y + 40, (cx - x) * 0.3) * 0.6 + 1.0, key: [0.34, 0.08] });
  fuzz(g, body, { colors: [hi, lift(hi, 0.4), base], len: 18 * s, R, step: 2, arc: 0.7 });

  // head: round, low-slung, brachycephalic
  const head = loop([
    [cx - 108 * s, cy - 110 * s], [cx - 122 * s, cy - 10 * s], [cx - 86 * s, cy + 74 * s],
    [cx, cy + 104 * s], [cx + 88 * s, cy + 72 * s], [cx + 124 * s, cy - 12 * s],
    [cx + 106 * s, cy - 112 * s], [cx + 40 * s, cy - 156 * s], [cx - 44 * s, cy - 154 * s],
  ], 10);
  fur(g, head, { base, dark: lo, light: hi, R, len: 11 * s, dens: 0.0085,
    dir: (x, y) => Math.atan2(y - (cy - 150 * s), x - cx), key: [0.32, 0.16] });
  fuzz(g, head, { colors: [hi, lift(hi, 0.45), base], len: 14 * s, R, step: 2, arc: 0.7 });

  /* The lop ears, drawn AFTER the head so they hang OVER it. Drawn before, the
     head's own fur and rim shadow ate them and Mochi came out looking like a
     hamster — an eight-week-old rabbit's ears are the whole breed and they
     have to break the head's outline, not sit behind it. Cocoa, because they
     also have to be a different value from the silver-grey head at 122 px. */
  for (const o of [-1, 1]) {
    const ear = loop([
      [cx + o * 74 * s, cy - 150 * s], [cx + o * 162 * s, cy - 158 * s],
      [cx + o * 214 * s, cy - 30 * s], [cx + o * 202 * s, cy + 128 * s],
      [cx + o * 138 * s, cy + 166 * s], [cx + o * 100 * s, cy + 54 * s],
      [cx + o * 88 * s, cy - 70 * s],
    ], 10);
    fur(g, ear, { base: mix(PELT.cocoa, base, 0.42), dark: sink(PELT.cocoa, 0.5),
      light: mix(PELT.tanHi, base, 0.4), R, len: 13 * s, dens: 0.0055,
      dir: () => Math.PI * 0.5 + o * 0.22, key: [o < 0 ? 0.66 : 0.28, 0.12], round: 0.3 });
    fuzz(g, ear, { colors: [PELT.tanHi, mix(PELT.cocoa, base, 0.5), hi], len: 15 * s, R, step: 2, arc: 0.7 });
    g.save();
    trace(g, ear); g.clip();
    const ig = g.createLinearGradient(cx + o * 90 * s, cy - 110 * s, cx + o * 208 * s, cy + 110 * s);
    ig.addColorStop(0, rgba(PELT.pinkSkin, 0.34));
    ig.addColorStop(1, rgba(PELT.pinkLo, 0));
    g.fillStyle = ig;
    g.fillRect(cx - 240 * s, cy - 200 * s, 480 * s, 420 * s);
    g.restore();
    // and the shadow each ear throws on the cheek behind it
    occlude(g, head, ear, { dx: -o * 10 * s, dy: 8 * s, blur: 16 * s, a: 0.45 });
  }

  // a soft cocoa mask across the nose, so Mochi is an individual rabbit
  const mask = loop([
    [cx - 52 * s, cy - 40 * s], [cx + 50 * s, cy - 44 * s], [cx + 66 * s, cy + 40 * s],
    [cx, cy + 84 * s], [cx - 64 * s, cy + 38 * s],
  ], 8);
  marking(g, head, mask, rgba(mix(PELT.cocoa, base, 0.45), 0.6), { soft: 12 * s, R });

  // muzzle, split lip, tiny triangular nose
  const muz = oval(cx, cy + 34 * s, 56 * s, 40 * s);
  fur(g, muz, { base: lift(base, 0.22), dark: base, light: lift(hi, 0.25), R,
    len: 6 * s, dens: 0.013, dir: (x) => (x < cx ? Math.PI - 0.6 : 0.6), key: [0.4, 0.3] });
  nose(g, cx, cy + 18 * s, 15 * s, 10 * s, mix(PELT.pinkSkin, PELT.pinkLo, 0.4), { shine: 1 });
  g.strokeStyle = rgba(sink(base, 0.5), 0.55);
  g.lineWidth = 2.6 * s;
  g.beginPath(); g.moveTo(cx, cy + 30 * s); g.lineTo(cx, cy + 58 * s);
  g.moveTo(cx, cy + 58 * s); g.quadraticCurveTo(cx - 22 * s, cy + 70 * s, cx - 32 * s, cy + 54 * s);
  g.moveTo(cx, cy + 58 * s); g.quadraticCurveTo(cx + 22 * s, cy + 70 * s, cx + 32 * s, cy + 54 * s);
  g.stroke();
  whiskers(g, cx - 34 * s, cy + 30 * s, 5, 130 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 34 * s, cy + 30 * s, 5, 130 * s, 1, R, PELT.creamHi);

  // the enormous side-set eyes of a prey animal, red-eyed by the flash
  eye(g, cx - 74 * s, cy - 42 * s, 34 * s, { iris: sink(PELT.cocoa, 0.4), pupil: 'wide',
    glow: '#e06a62', R, tilt: 0.2, aspect: 1.04, lidCol: lo });
  eye(g, cx + 78 * s, cy - 42 * s, 34 * s, { iris: sink(PELT.cocoa, 0.4), pupil: 'wide',
    glow: '#e06a62', R, tilt: -0.2, aspect: 1.04, lidCol: lo });
}

/* ── Sprocket: black-and-white hooded fancy rat ──────────────────────────── */
function paintRat(g, w, h, R) {
  const cx = w * 0.44, cy = h * 0.52, s = h / 480;
  const white = PELT.cream, wHi = PELT.creamHi, wLo = PELT.creamLo;

  // the naked tail, which is what makes a rat unmistakably a rat
  g.save();
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? rgba(lift(PELT.pinkSkin, 0.3), 0.5) : rgba(mix(PELT.pinkLo, PELT.slate, 0.4), 0.95);
    g.lineWidth = (pass ? 5 : 15) * s;
    g.beginPath();
    g.moveTo(cx + 120 * s, cy + 190 * s);
    g.bezierCurveTo(cx + 300 * s, cy + 150 * s, cx + 330 * s, cy - 60 * s, w + 30, cy - 130 * s);
    g.stroke();
  }
  g.restore();

  const body = loop([
    [cx - 150 * s, cy + 210 * s], [cx - 130 * s, cy + 80 * s], [cx - 20 * s, cy + 40 * s],
    [cx + 110 * s, cy + 76 * s], [cx + 156 * s, cy + 180 * s], [cx + 96 * s, h + 40],
    [cx - 90 * s, h + 40],
  ], 10);
  fur(g, body, { base: white, dark: wLo, light: wHi, R, len: 9 * s, dens: 0.008,
    dir: (x, y) => Math.atan2(cy + 260 * s - y, (cx - x) * 0.3) * 0.5 + 1.1, key: [0.3, 0.1] });
  fuzz(g, body, { colors: [wHi, white, lift(wHi, 0.2)], len: 10 * s, R, step: 2 });

  // ears: big, thin, translucent, set wide
  for (const o of [-1, 1]) {
    const ex = cx + o * 118 * s, ey = cy - 118 * s;
    const ear = oval(ex, ey, 54 * s, 58 * s, o * 0.3);
    g.save();
    trace(g, ear);
    const eg = g.createRadialGradient(ex, ey + 10 * s, 0, ex, ey, 58 * s);
    eg.addColorStop(0, rgba(lift(PELT.pinkSkin, 0.2), 0.95));
    eg.addColorStop(0.7, rgba(PELT.pinkSkin, 0.9));
    eg.addColorStop(1, rgba(sink(PELT.pinkLo, 0.2), 1));
    g.fillStyle = eg; g.fill();
    g.restore();
    // fine veins and a rim of fur
    g.save(); trace(g, ear); g.clip();
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = rgba(sink(PELT.pinkLo, 0.3), 0.28);
      g.lineWidth = 1.6 * s;
      g.beginPath();
      g.moveTo(ex - o * 30 * s, ey + 30 * s);
      g.quadraticCurveTo(ex + (R() - 0.5) * 40 * s, ey, ex + o * (10 + i * 8) * s, ey - 40 * s);
      g.stroke();
    }
    g.restore();
    fuzz(g, ear, { colors: [PELT.sootHi, PELT.soot], len: 6 * s, R, step: 3, alpha: 0.7 });
  }

  // head: a long tapered wedge, not a ball
  const head = loop([
    [cx - 96 * s, cy - 74 * s], [cx - 86 * s, cy + 6 * s], [cx - 40 * s, cy + 74 * s],
    [cx + 26 * s, cy + 96 * s], [cx + 92 * s, cy + 66 * s], [cx + 106 * s, cy - 16 * s],
    [cx + 70 * s, cy - 96 * s], [cx - 20 * s, cy - 116 * s],
  ], 10);
  fur(g, head, { base: white, dark: wLo, light: wHi, R, len: 8 * s, dens: 0.01,
    dir: (x, y) => Math.atan2(y - (cy - 110 * s), x - cx) * 0.8 + 0.4, key: [0.34, 0.2] });
  fuzz(g, head, { colors: [wHi, white], len: 9 * s, R, step: 2 });

  // the HOOD: black over head and shoulders with a stripe down the spine.
  // This is the marking that names him, so it gets a hairy border, not an edge.
  const hood = loop([
    [cx - 120 * s, cy - 96 * s], [cx - 108 * s, cy + 40 * s], [cx - 20 * s, cy + 84 * s],
    [cx + 58 * s, cy + 52 * s], [cx + 116 * s, cy - 30 * s], [cx + 92 * s, cy - 128 * s],
    [cx - 34 * s, cy - 148 * s],
  ], 10);
  marking(g, head, hood, rgba(PELT.sootLo, 1), { soft: 3 * s, R });
  // and over the ears and the shoulders, because a hood is not a face mask
  for (const o of [-1, 1]) {
    marking(g, oval(cx + o * 118 * s, cy - 118 * s, 54 * s, 58 * s, o * 0.3),
      oval(cx + o * 118 * s, cy - 140 * s, 58 * s, 44 * s, o * 0.3),
      rgba(PELT.sootLo, 0.85), { soft: 8 * s });
  }
  marking(g, body, loop([
    [cx - 130 * s, cy + 74 * s], [cx + 4 * s, cy + 40 * s], [cx + 118 * s, cy + 84 * s],
    [cx + 96 * s, cy + 168 * s], [cx - 110 * s, cy + 172 * s],
  ], 9), rgba(PELT.sootLo, 0.9), { soft: 10 * s, R });
  const stripe = loop([
    [cx - 60 * s, cy + 30 * s], [cx + 24 * s, cy + 46 * s], [cx + 40 * s, cy + 200 * s],
    [cx - 10 * s, h + 30], [cx - 62 * s, cy + 190 * s],
  ], 9);
  marking(g, body, stripe, rgba(PELT.soot, 0.9), { soft: 5 * s, R });
  g.save();
  trace(g, head); g.clip();
  for (let i = 0; i < 700; i++) {              // black guard hairs over the join
    const x = cx - 110 * s + R() * 220 * s, y = cy - 130 * s + R() * 210 * s;
    g.strokeStyle = rgba(R() < 0.6 ? PELT.sootLo : PELT.sootHi, 0.07 + R() * 0.25);
    g.lineWidth = 0.5 + R() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 10 * s, y + 6 * s + R() * 8 * s); g.stroke();
  }
  g.restore();

  nose(g, cx + 42 * s, cy + 74 * s, 13 * s, 9 * s, mix(PELT.pinkSkin, PELT.pinkLo, 0.3));
  whiskers(g, cx + 20 * s, cy + 62 * s, 7, 165 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 56 * s, cy + 60 * s, 7, 165 * s, 1, R, PELT.creamHi);

  eye(g, cx - 44 * s, cy - 20 * s, 22 * s, { iris: sink(PELT.leather, 0.2), pupil: 'wide',
    glow: '#e26a6a', R, lidCol: PELT.sootLo });
  eye(g, cx + 62 * s, cy - 24 * s, 21 * s, { iris: sink(PELT.leather, 0.2), pupil: 'wide',
    glow: '#e26a6a', R, lidCol: PELT.sootLo });

  // a pink hand-like forepaw on the glass
  g.save();
  g.fillStyle = rgba(lift(PELT.pinkSkin, 0.1), 0.95);
  g.beginPath(); g.ellipse(cx - 84 * s, cy + 200 * s, 30 * s, 22 * s, -0.4, 0, 7); g.fill();
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = rgba(PELT.pinkSkin, 0.95);
    g.lineWidth = 8 * s; g.lineCap = 'round';
    const a = -1.9 + i * 0.42;
    g.beginPath();
    g.moveTo(cx - 84 * s, cy + 196 * s);
    g.lineTo(cx - 84 * s + Math.cos(a) * 40 * s, cy + 196 * s + Math.sin(a) * 40 * s);
    g.stroke();
  }
  g.restore();
}

/* ── Pixel: leopard gecko ────────────────────────────────────────────────── */
/* Round 1 drew the head as an oval stacked on a body oval with a gap between
   them and Pixel came out a snowman. A gecko is one continuous low horizontal
   line — snout, neck, shoulders, hips, tail, all the same tube — so the body
   is drawn as one long form and the head is a WIDER swelling on the front of
   it that overlaps, not a separate ball above it. */
function paintGecko(g, w, h, R) {
  const cx = w * 0.5, cy = h * 0.54, s = h / 480;
  const base = PELT.sand, hi = PELT.sandHi, lo = PELT.sandLo;

  // the fat tail, banded, sweeping back and out of frame
  const tail = loop([
    [cx + 40 * s, cy - 18 * s], [cx + 170 * s, cy - 40 * s], [cx + 300 * s, cy + 30 * s],
    [cx + 320 * s, cy + 124 * s], [cx + 180 * s, cy + 128 * s], [cx + 50 * s, cy + 80 * s],
  ], 10);
  scales(g, tail, { base: mix(base, PELT.cream, 0.2), dark: lo, light: hi, R, size: 7.4 * s, round: 0.3 });
  g.save(); trace(g, tail); g.clip();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = rgba(sink(PELT.cocoa, 0.15), 0.42);
    g.save();
    g.translate(cx + 80 * s + i * 44 * s, cy + 40 * s);
    g.rotate(0.42);
    g.beginPath(); g.roundRect(-11 * s, -120 * s, 22 * s, 240 * s, 10 * s); g.fill();
    g.restore();
  }
  g.restore();

  // legs, splayed out sideways the way a lizard's are
  for (const [lx, ly, dir] of [[-96, 74, -1], [92, 60, 1], [-52, 96, -1], [128, 96, 1]]) {
    g.save();
    g.strokeStyle = rgba(mix(base, PELT.cocoa, 0.18), 1);
    g.lineWidth = 21 * s; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx + lx * s, cy + (ly - 40) * s);
    g.quadraticCurveTo(cx + (lx + dir * 62) * s, cy + (ly + 40) * s, cx + (lx + dir * 44) * s, cy + (ly + 92) * s);
    g.stroke();
    for (let t2 = 0; t2 < 5; t2++) {
      const a = -1.15 + t2 * 0.5;
      g.lineWidth = 6.5 * s;
      g.beginPath();
      g.moveTo(cx + (lx + dir * 44) * s, cy + (ly + 92) * s);
      g.lineTo(cx + (lx + dir * 44) * s + Math.cos(a) * dir * 34 * s,
        cy + (ly + 96) * s + Math.sin(a) * 30 * s + 16 * s);
      g.stroke();
    }
    g.restore();
  }

  /* One tube: snout at the left, hips at the right. The head is the part of it
     that is wider than the neck, so there is no join to give away. */
  const body = loop([
    [cx - 236 * s, cy - 46 * s],           // snout tip
    [cx - 214 * s, cy - 112 * s],          // over the top of the muzzle
    [cx - 130 * s, cy - 158 * s],          // brow ridge
    [cx - 24 * s, cy - 146 * s],           // back of the skull
    [cx + 20 * s, cy - 84 * s],            // neck, narrower
    [cx + 118 * s, cy - 60 * s],           // shoulders widening again
    [cx + 190 * s, cy + 26 * s],           // hips
    [cx + 96 * s, cy + 118 * s],
    [cx - 60 * s, cy + 108 * s],
    [cx - 168 * s, cy + 44 * s],           // throat
    [cx - 226 * s, cy + 4 * s],
  ], 12);
  scales(g, body, { base, dark: lo, light: lift(hi, 0.1), R, size: 6 * s, round: 0.2 });

  // leopard spots: clustered along the spine, sparse on the flanks
  g.save();
  trace(g, body); g.clip();
  for (let i = 0; i < 62; i++) {
    const t2 = R();
    const x = cx + (-210 + t2 * 400) * s;
    const y = cy + (-150 + Math.pow(R(), 0.7) * 260) * s;
    const rr = (4 + R() * 14) * s;
    g.fillStyle = rgba(sink(PELT.cocoa, 0.22), 0.5 + R() * 0.4);
    g.beginPath();
    g.ellipse(x, y, rr, rr * (0.55 + R() * 0.7), R() * 3, 0, 7);
    g.fill();
  }
  // the pale banding a leopard gecko keeps from its juvenile pattern
  for (let i = 0; i < 3; i++) {
    const bx = cx + (-70 + i * 90) * s;
    const bg2 = g.createLinearGradient(bx - 26 * s, 0, bx + 26 * s, 0);
    bg2.addColorStop(0, rgba(lift(hi, 0.4), 0));
    bg2.addColorStop(0.5, rgba(lift(hi, 0.4), 0.34));
    bg2.addColorStop(1, rgba(lift(hi, 0.4), 0));
    g.fillStyle = bg2;
    g.fillRect(bx - 30 * s, cy - 200 * s, 60 * s, 380 * s);
  }
  g.restore();

  // the throat and jawline, so the head reads as a head
  g.save();
  trace(g, body); g.clip();
  g.strokeStyle = rgba(sink(PELT.cocoa, 0.4), 0.5);
  g.lineWidth = 4 * s;
  g.beginPath();
  g.moveTo(cx - 232 * s, cy - 24 * s);
  g.quadraticCurveTo(cx - 150 * s, cy + 26 * s, cx - 44 * s, cy - 24 * s);
  g.stroke();
  g.strokeStyle = rgba(lift(hi, 0.5), 0.42);
  g.lineWidth = 2.6 * s;
  g.beginPath();
  g.moveTo(cx - 230 * s, cy - 32 * s);
  g.quadraticCurveTo(cx - 150 * s, cy + 16 * s, cx - 46 * s, cy - 32 * s);
  g.stroke();
  // ear opening
  g.fillStyle = 'rgba(12,8,6,0.55)';
  g.beginPath(); g.ellipse(cx - 34 * s, cy - 76 * s, 15 * s, 20 * s, -0.3, 0, 7); g.fill();
  g.restore();

  // nostril
  g.fillStyle = 'rgba(10,8,6,0.65)';
  g.beginPath(); g.ellipse(cx - 218 * s, cy - 82 * s, 5.5 * s, 4.2 * s, 0.3, 0, 7); g.fill();

  // the eye: vertical slit, gold, with the tubercled lid geckos actually have
  const ex = cx - 132 * s, ey = cy - 110 * s;
  eye(g, ex, ey, 33 * s, { iris: PELT.gold, pupil: 'slit', glow: null, shine: '#ffffff',
    R, tilt: 0.12, lidCol: sink(PELT.cocoa, 0.3) });
  g.save();
  g.strokeStyle = rgba(lift(base, 0.3), 0.85);
  g.lineWidth = 6 * s;
  g.beginPath(); g.arc(ex, ey, 35 * s, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (1.03 + i * 0.073);
    g.fillStyle = rgba(lift(base, 0.5), 0.75);
    g.beginPath(); g.arc(ex + Math.cos(a) * 37 * s, ey + Math.sin(a) * 37 * s, 3.6 * s, 0, 7); g.fill();
  }
  g.restore();
}

/* ── Scout: beagle mix ───────────────────────────────────────────────────── */
function paintBeagle(g, w, h, R) {
  const cx = w * 0.48, cy = h * 0.56, s = h / 480;
  const white = PELT.cream, wHi = PELT.creamHi, wLo = PELT.creamLo;

  const body = loop([
    [cx - 210 * s, h + 40], [cx - 196 * s, cy + 110 * s], [cx - 120 * s, cy + 20 * s],
    [cx + 10 * s, cy - 6 * s], [cx + 150 * s, cy + 44 * s], [cx + 206 * s, cy + 140 * s],
    [cx + 220 * s, h + 40],
  ], 10);
  fur(g, body, { base: white, dark: wLo, light: wHi, R, len: 8 * s, dens: 0.0058,
    dir: (x, y) => Math.atan2(h + 60 - y, (cx - x) * 0.3) * 0.55 + 1.05, key: [0.3, 0.08] });
  fuzz(g, body, { colors: [wHi, white, PELT.tan], len: 8 * s, R, step: 2 });

  // the black saddle over the shoulders and a tan wash under it — tricolour
  const saddle = loop([
    [cx - 180 * s, cy + 150 * s], [cx - 120 * s, cy + 60 * s], [cx + 40 * s, cy + 40 * s],
    [cx + 170 * s, cy + 96 * s], [cx + 190 * s, h + 30], [cx - 170 * s, h + 30],
  ], 9);
  marking(g, body, saddle, rgba(PELT.soot, 0.9), { soft: 9 * s, R });
  const tanL = loop([
    [cx - 200 * s, cy + 130 * s], [cx - 130 * s, cy + 46 * s], [cx - 60 * s, cy + 66 * s],
    [cx - 120 * s, cy + 190 * s], [cx - 200 * s, cy + 220 * s],
  ], 9);
  marking(g, body, tanL, rgba(PELT.tan, 0.75), { soft: 12 * s, R });

  // head, long muzzle, domed skull
  const head = loop([
    [cx - 104 * s, cy - 130 * s], [cx - 116 * s, cy - 30 * s], [cx - 86 * s, cy + 46 * s],
    [cx - 40 * s, cy + 104 * s], [cx + 42 * s, cy + 106 * s], [cx + 90 * s, cy + 44 * s],
    [cx + 118 * s, cy - 32 * s], [cx + 104 * s, cy - 132 * s], [cx + 40 * s, cy - 172 * s],
    [cx - 44 * s, cy - 170 * s],
  ], 10);
  fur(g, head, { base: mix(PELT.cocoa, PELT.tan, 0.5), dark: sink(PELT.cocoa, 0.45),
    light: PELT.tanHi, R, len: 8 * s, dens: 0.009,
    dir: (x, y) => Math.atan2(y - (cy - 166 * s), x - cx) * 0.85 + 0.3, key: [0.32, 0.16] });
  fuzz(g, head, { colors: [PELT.tanHi, PELT.tan, PELT.cocoa], len: 9 * s, R, step: 2 });

  // the white blaze up the middle of the face — Scout's signature
  const blaze = loop([
    [cx - 26 * s, cy - 176 * s], [cx + 24 * s, cy - 176 * s], [cx + 40 * s, cy + 20 * s],
    [cx + 62 * s, cy + 98 * s], [cx - 60 * s, cy + 98 * s], [cx - 40 * s, cy + 20 * s],
  ], 9);
  marking(g, head, blaze, rgba(wHi, 0.94), { soft: 5 * s, R });
  const brow = (o) => marking(g, head,
    oval(cx + o * 52 * s, cy - 92 * s, 30 * s, 20 * s, o * 0.25),
    rgba(PELT.tanHi, 0.8), { soft: 8 * s, R });
  brow(-1); brow(1);
  // the dark mask around the eyes
  marking(g, head, oval(cx - 58 * s, cy - 48 * s, 46 * s, 34 * s, 0.2), rgba(sink(PELT.cocoa, 0.4), 0.45), { soft: 14 * s });
  marking(g, head, oval(cx + 60 * s, cy - 48 * s, 46 * s, 34 * s, -0.2), rgba(sink(PELT.cocoa, 0.4), 0.45), { soft: 14 * s });

  /* The drop ears go on last. Behind the head they vanished into the skull and
     Scout read as a generic puppy; hanging over it in near-black liver against
     the white blaze, the beagle silhouette is unmistakable at polaroid size. */
  for (const o of [-1, 1]) {
    const ear = loop([
      [cx + o * 88 * s, cy - 148 * s], [cx + o * 182 * s, cy - 108 * s],
      [cx + o * 210 * s, cy + 30 * s], [cx + o * 178 * s, cy + 168 * s],
      [cx + o * 108 * s, cy + 176 * s], [cx + o * 98 * s, cy - 10 * s],
    ], 10);
    fur(g, ear, { base: mix(PELT.liver, PELT.cocoa, 0.45), dark: sink(PELT.liver, 0.55),
      light: mix(PELT.tan, PELT.liver, 0.5), R, len: 13 * s, dens: 0.006,
      dir: () => Math.PI * 0.5 + o * 0.18, key: [o < 0 ? 0.66 : 0.28, 0.12], round: 0.3 });
    fuzz(g, ear, { colors: [PELT.tan, PELT.liver, PELT.tanHi], len: 15 * s, R, step: 2, arc: 0.7 });
    occlude(g, head, ear, { dx: -o * 12 * s, dy: 8 * s, blur: 16 * s, a: 0.5 });
  }

  // muzzle
  const muz = loop([
    [cx - 62 * s, cy + 6 * s], [cx - 70 * s, cy + 66 * s], [cx - 34 * s, cy + 110 * s],
    [cx + 36 * s, cy + 110 * s], [cx + 72 * s, cy + 64 * s], [cx + 62 * s, cy + 6 * s],
  ], 9);
  fur(g, muz, { base: lift(white, 0.05), dark: wLo, light: wHi, R, len: 5 * s, dens: 0.013,
    dir: (x) => (x < cx ? Math.PI - 0.7 : 0.7), key: [0.4, 0.25] });
  nose(g, cx, cy + 60 * s, 30 * s, 21 * s, PELT.leather);
  // jowls and a hint of tongue
  g.strokeStyle = rgba(sink(PELT.leather, 0.1), 0.7);
  g.lineWidth = 4 * s;
  g.beginPath();
  g.moveTo(cx - 48 * s, cy + 96 * s);
  g.quadraticCurveTo(cx, cy + 122 * s, cx + 48 * s, cy + 96 * s);
  g.stroke();
  g.fillStyle = rgba(mix(PELT.pinkSkin, PELT.chilli, 0.35), 0.9);
  g.beginPath(); g.ellipse(cx + 4 * s, cy + 118 * s, 22 * s, 13 * s, 0.1, 0, 7); g.fill();
  whiskers(g, cx - 46 * s, cy + 74 * s, 4, 80 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 46 * s, cy + 74 * s, 4, 80 * s, 1, R, PELT.creamHi);

  eye(g, cx - 58 * s, cy - 54 * s, 30 * s, { iris: mix(PELT.cocoa, PELT.amber, 0.35),
    pupil: 'wide', glow: '#8fd66a', R, tilt: 0.1, lidCol: PELT.leather });
  eye(g, cx + 62 * s, cy - 54 * s, 30 * s, { iris: mix(PELT.cocoa, PELT.amber, 0.35),
    pupil: 'wide', glow: '#8fd66a', R, tilt: -0.1, lidCol: PELT.leather });
}

/* ── Mooncake: Syrian hamster ────────────────────────────────────────────── */
function paintHamster(g, w, h, R) {
  const cx = w * 0.5, cy = h * 0.54, s = h / 480;
  const base = PELT.gold, hi = PELT.goldHi, lo = PELT.goldLo;

  // one round animal, essentially no neck, cheeks full
  const body = loop([
    [cx - 186 * s, cy + 90 * s], [cx - 200 * s, cy - 40 * s], [cx - 120 * s, cy - 150 * s],
    [cx + 20 * s, cy - 178 * s], [cx + 160 * s, cy - 120 * s], [cx + 204 * s, cy + 20 * s],
    [cx + 168 * s, cy + 168 * s], [cx + 20 * s, cy + 222 * s], [cx - 140 * s, cy + 190 * s],
  ], 10);
  fur(g, body, { base, dark: lo, light: hi, R, len: 12 * s, dens: 0.0068,
    dir: (x, y) => Math.atan2(y - (cy - 190 * s), x - cx) * 0.9 + 0.2, key: [0.3, 0.14] });
  fuzz(g, body, { colors: [hi, lift(hi, 0.45), base], len: 15 * s, R, step: 2, arc: 0.75 });

  // cream belly and cheek flashes
  marking(g, body, loop([
    [cx - 140 * s, cy + 70 * s], [cx - 30 * s, cy + 40 * s], [cx + 130 * s, cy + 80 * s],
    [cx + 110 * s, cy + 200 * s], [cx - 100 * s, cy + 196 * s],
  ], 9), rgba(PELT.creamHi, 0.72), { soft: 16 * s, R });
  marking(g, body, oval(cx - 128 * s, cy + 6 * s, 46 * s, 62 * s, 0.2), rgba(PELT.cream, 0.5), { soft: 18 * s });
  marking(g, body, oval(cx + 136 * s, cy + 6 * s, 46 * s, 62 * s, -0.2), rgba(PELT.cream, 0.5), { soft: 18 * s });
  // the dark cheek stripe a Syrian has
  marking(g, body, loop([
    [cx - 176 * s, cy - 60 * s], [cx - 140 * s, cy - 84 * s], [cx - 124 * s, cy - 10 * s],
    [cx - 168 * s, cy + 12 * s],
  ], 8), rgba(sink(PELT.cocoa, 0.3), 0.45), { soft: 12 * s });
  marking(g, body, loop([
    [cx + 176 * s, cy - 60 * s], [cx + 140 * s, cy - 84 * s], [cx + 124 * s, cy - 10 * s],
    [cx + 168 * s, cy + 12 * s],
  ], 8), rgba(sink(PELT.cocoa, 0.3), 0.45), { soft: 12 * s });

  // little round ears, dark and thin
  for (const o of [-1, 1]) {
    const ex = cx + o * 118 * s, ey = cy - 162 * s;
    const ear = oval(ex, ey, 42 * s, 40 * s, o * 0.25);
    g.save();
    trace(g, ear);
    const eg = g.createRadialGradient(ex, ey + 8 * s, 0, ex, ey, 44 * s);
    eg.addColorStop(0, rgba(mix(PELT.pinkLo, PELT.cocoa, 0.45), 1));
    eg.addColorStop(1, rgba(sink(PELT.cocoa, 0.45), 1));
    g.fillStyle = eg; g.fill();
    g.restore();
    fuzz(g, ear, { colors: [hi, base, PELT.creamLo], len: 8 * s, R, step: 2, alpha: 0.85 });
  }

  // muzzle and the enormous incisors
  const muz = oval(cx, cy + 74 * s, 74 * s, 52 * s);
  fur(g, muz, { base: lift(base, 0.3), dark: base, light: PELT.creamHi, R,
    len: 6 * s, dens: 0.014, dir: (x) => (x < cx ? Math.PI - 0.6 : 0.6), key: [0.4, 0.25] });
  nose(g, cx, cy + 54 * s, 15 * s, 10 * s, mix(PELT.pinkSkin, PELT.pinkLo, 0.3));
  g.fillStyle = rgba(mix(PELT.sand, PELT.creamHi, 0.4), 0.95);
  g.beginPath(); g.roundRect(cx - 15 * s, cy + 86 * s, 13 * s, 26 * s, 3 * s); g.fill();
  g.beginPath(); g.roundRect(cx + 2 * s, cy + 86 * s, 13 * s, 26 * s, 3 * s); g.fill();
  g.strokeStyle = rgba(sink(PELT.cocoa, 0.4), 0.6);
  g.lineWidth = 2.4 * s;
  g.beginPath();
  g.moveTo(cx, cy + 66 * s); g.lineTo(cx, cy + 86 * s);
  g.moveTo(cx, cy + 86 * s); g.quadraticCurveTo(cx - 26 * s, cy + 96 * s, cx - 38 * s, cy + 78 * s);
  g.moveTo(cx, cy + 86 * s); g.quadraticCurveTo(cx + 26 * s, cy + 96 * s, cx + 38 * s, cy + 78 * s);
  g.stroke();
  whiskers(g, cx - 40 * s, cy + 66 * s, 6, 150 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 40 * s, cy + 66 * s, 6, 150 * s, 1, R, PELT.creamHi);

  // black bead eyes — pure specular, and a red flash core
  eye(g, cx - 72 * s, cy - 22 * s, 27 * s, { iris: sink(PELT.leather, 0.35), pupil: 'wide',
    glow: '#e2604e', R, lidCol: PELT.sootLo });
  eye(g, cx + 74 * s, cy - 22 * s, 27 * s, { iris: sink(PELT.leather, 0.35), pupil: 'wide',
    glow: '#e2604e', R, lidCol: PELT.sootLo });

  // both front paws up, holding something
  for (const o of [-1, 1]) {
    g.save();
    g.fillStyle = rgba(lift(PELT.pinkSkin, 0.12), 0.95);
    g.beginPath(); g.ellipse(cx + o * 52 * s, cy + 156 * s, 26 * s, 20 * s, o * 0.4, 0, 7); g.fill();
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = rgba(PELT.pinkSkin, 0.9);
      g.lineWidth = 7 * s; g.lineCap = 'round';
      const a = -1.5 + i * 0.4;
      g.beginPath();
      g.moveTo(cx + o * 52 * s, cy + 154 * s);
      g.lineTo(cx + o * 52 * s + Math.cos(a) * o * 26 * s, cy + 154 * s + Math.sin(a) * 26 * s);
      g.stroke();
    }
    g.restore();
  }
}

/* ── Bean: tricolour guinea pig ──────────────────────────────────────────── */
function paintGuinea(g, w, h, R) {
  const cx = w * 0.48, cy = h * 0.56, s = h / 480;
  const white = PELT.cream, wHi = PELT.creamHi, wLo = PELT.creamLo;

  // a loaf. No neck, no tail, ears like tiny petals at the sides.
  const body = loop([
    [cx - 236 * s, cy + 60 * s], [cx - 216 * s, cy - 74 * s], [cx - 90 * s, cy - 160 * s],
    [cx + 70 * s, cy - 168 * s], [cx + 214 * s, cy - 86 * s], [cx + 250 * s, cy + 60 * s],
    [cx + 200 * s, cy + 190 * s], [cx + 10 * s, cy + 236 * s], [cx - 190 * s, cy + 184 * s],
  ], 10);
  fur(g, body, { base: white, dark: wLo, light: wHi, R, len: 15 * s, dens: 0.0062,
    dir: (x, y, b) => {
      // rosettes: the fur of a guinea pig grows in whorls, not one direction
      const a1 = Math.atan2(y - (b.y + b.h * 0.3), x - (b.x + b.w * 0.32)) + 1.4;
      const a2 = Math.atan2(y - (b.y + b.h * 0.62), x - (b.x + b.w * 0.76)) - 1.2;
      const t2 = Math.min(1, Math.max(0, (x - b.x) / b.w));
      return a1 * (1 - t2) + a2 * t2;
    }, key: [0.3, 0.14] });
  fuzz(g, body, { colors: [wHi, white, lift(wHi, 0.3)], len: 20 * s, R, step: 2, arc: 0.85 });

  // the tricolour: a warm brown saddle and a black hip patch
  marking(g, body, loop([
    [cx - 60 * s, cy - 160 * s], [cx + 90 * s, cy - 150 * s], [cx + 150 * s, cy - 30 * s],
    [cx + 60 * s, cy + 40 * s], [cx - 50 * s, cy - 10 * s],
  ], 9), rgba(mix(PELT.cocoa, PELT.ginger, 0.5), 0.88), { soft: 8 * s, R });
  marking(g, body, loop([
    [cx + 130 * s, cy + 10 * s], [cx + 236 * s, cy + 40 * s], [cx + 216 * s, cy + 176 * s],
    [cx + 90 * s, cy + 200 * s], [cx + 96 * s, cy + 70 * s],
  ], 9), rgba(PELT.soot, 0.85), { soft: 9 * s, R });

  // ears: small, floppy, folded, sitting low at the sides of the head
  for (const o of [-1, 1]) {
    const ex = cx + o * 168 * s, ey = cy - 58 * s;
    // small, low, folded-over petals — NOT the round high ears of a hamster
    // and not a dog's flap. Wrong ears turned Bean into a puppy last round.
    const ear = loop([
      [ex - o * 40 * s, ey - 30 * s], [ex + o * 10 * s, ey - 34 * s],
      [ex + o * 34 * s, ey + 6 * s], [ex + o * 12 * s, ey + 38 * s],
      [ex - o * 34 * s, ey + 20 * s],
    ], 9);
    g.save();
    trace(g, ear);
    const eg = g.createRadialGradient(ex, ey, 0, ex, ey, 52 * s);
    eg.addColorStop(0, rgba(mix(PELT.pinkLo, PELT.cocoa, 0.5), 1));
    eg.addColorStop(1, rgba(sink(PELT.cocoa, 0.5), 1));
    g.fillStyle = eg; g.fill();
    g.restore();
    fuzz(g, ear, { colors: [wHi, white], len: 8 * s, R, step: 3, alpha: 0.6 });
  }

  // the brown patch around his RIGHT eye — the identifier in the design doc
  marking(g, body, oval(cx - 96 * s, cy - 76 * s, 74 * s, 62 * s, 0.15),
    rgba(mix(PELT.cocoa, PELT.ginger, 0.4), 0.9), { soft: 8 * s, R });

  // muzzle: broad, blunt, chewing
  const muz = loop([
    [cx - 78 * s, cy + 22 * s], [cx - 88 * s, cy + 96 * s], [cx - 20 * s, cy + 142 * s],
    [cx + 52 * s, cy + 132 * s], [cx + 86 * s, cy + 66 * s], [cx + 56 * s, cy + 12 * s],
  ], 9);
  fur(g, muz, { base: lift(white, 0.06), dark: wLo, light: wHi, R, len: 7 * s, dens: 0.012,
    dir: (x) => (x < cx ? Math.PI - 0.5 : 0.5), key: [0.4, 0.25] });
  nose(g, cx - 8 * s, cy + 58 * s, 20 * s, 13 * s, mix(PELT.pinkSkin, PELT.cocoa, 0.25));
  g.strokeStyle = rgba(sink(PELT.cocoa, 0.35), 0.6);
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(cx - 8 * s, cy + 72 * s); g.lineTo(cx - 8 * s, cy + 100 * s);
  g.moveTo(cx - 8 * s, cy + 100 * s); g.quadraticCurveTo(cx - 40 * s, cy + 116 * s, cx - 56 * s, cy + 92 * s);
  g.moveTo(cx - 8 * s, cy + 100 * s); g.quadraticCurveTo(cx + 24 * s, cy + 116 * s, cx + 40 * s, cy + 92 * s);
  g.stroke();
  // a strand of lettuce, because he would be eating in any photograph of him
  g.save();
  g.fillStyle = rgba(mix(PELT.fernHi, PELT.lime, 0.5), 0.92);
  g.beginPath();
  g.moveTo(cx - 8 * s, cy + 104 * s);
  g.quadraticCurveTo(cx - 90 * s, cy + 150 * s, cx - 150 * s, cy + 120 * s);
  g.quadraticCurveTo(cx - 96 * s, cy + 178 * s, cx - 8 * s, cy + 118 * s);
  g.closePath(); g.fill();
  g.strokeStyle = rgba(sink(PELT.fern, 0.2), 0.5); g.lineWidth = 2 * s; g.stroke();
  g.restore();
  whiskers(g, cx - 46 * s, cy + 74 * s, 6, 160 * s, -1, R, PELT.creamHi);
  whiskers(g, cx + 34 * s, cy + 72 * s, 6, 150 * s, 1, R, PELT.creamHi);

  // dark side-set eyes, red under the flash
  eye(g, cx - 100 * s, cy - 68 * s, 28 * s, { iris: sink(PELT.leather, 0.2), pupil: 'wide',
    glow: '#e0736b', R, tilt: 0.18, lidCol: PELT.sootLo });
  eye(g, cx + 92 * s, cy - 74 * s, 26 * s, { iris: sink(PELT.leather, 0.2), pupil: 'wide',
    glow: '#e0736b', R, tilt: -0.18, lidCol: PELT.sootLo });
}

/* ═══════════════════════════════════════════════════════════════════════════
   pet photograph: assemble, light, grade
   ═══════════════════════════════════════════════════════════════════════════ */

/* Canonical render size. One bitmap per subject, reused everywhere: the
   biggest place any of these lands is the MISSING poster at ~190 css px wide,
   so 512 across is already 1.3x a 2-dpr display and anything larger is pixels
   nobody sees paid for in render time. */
const PET_W = 496, PET_H = 372;

/**
 * A single directional light pass over everything painted so far. Drawing each
 * body part with its own gradient gets you a value range of about two stops
 * and a picture that looks like moulded vinyl. One hard falloff over the whole
 * frame — hot where the flash lands, near black away from it — is what gives a
 * flash photograph its actual range, and it costs one fill.
 */
function flashLight(g, w, h, kx, ky, darkness) {
  const cx = w * kx, cy = h * ky;
  const rad = Math.max(w, h) * 0.86;
  g.save();
  g.globalCompositeOperation = 'multiply';
  const fall = g.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
  fall.addColorStop(0, 'rgb(255,255,255)');
  fall.addColorStop(0.36, 'rgb(226,222,226)');
  const d = Math.round(255 * (1 - darkness));
  fall.addColorStop(1, 'rgb(' + d + ',' + Math.round(d * 0.95) + ',' + Math.round(d * 1.04) + ')');
  g.fillStyle = fall;
  g.fillRect(0, 0, w, h);
  g.restore();

  // and the hot core the flash blows out on the nearest fur
  g.save();
  g.globalCompositeOperation = 'screen';
  const hot = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 0.34);
  hot.addColorStop(0, 'rgba(255,248,232,0.3)');
  hot.addColorStop(0.5, 'rgba(255,242,220,0.09)');
  hot.addColorStop(1, 'rgba(255,240,215,0)');
  g.fillStyle = hot;
  g.fillRect(0, 0, w, h);
  g.restore();
}

function paintPet(g, w, h, key, R) {
  const spec = PETS[key];
  const t = tokens();
  const fr = spec.frame;

  room(g, w, h, spec.scene, R);

  // Camera framing. The subject is painted into a canvas-wide coordinate space
  // and the whole thing is then zoomed, offset and tilted, so the animal can
  // run off the edge of the picture the way it would in a real snapshot.
  g.save();
  g.translate(w * (0.5 + fr.dx), h * (0.5 + fr.dy));
  g.rotate(fr.rot);
  g.scale(fr.z, fr.z);
  g.translate(-w * 0.5, -h * 0.5);

  // the hard flash shadow behind the subject: a direct flash always throws one
  g.save();
  g.filter = 'blur(' + (w * 0.024) + 'px)';
  g.fillStyle = 'rgba(3,2,5,0.72)';
  g.beginPath();
  g.ellipse(w * 0.58, h * 0.64, w * 0.36, h * 0.34, 0.12, 0, 7);
  g.fill();
  g.filter = 'none';
  g.restore();

  spec.paint(g, w, h, R);
  g.restore();

  flashLight(g, w, h, spec.key[0], spec.key[1], spec.dark);

  // camera shake: the shutter was open a little too long in a dark room
  if (fr.blur) {
    const c = scratchCanvas(w, h, 4);
    const x = c.getContext('2d', CTX2DA);
    x.drawImage(g.canvas, 0, 0);
    g.save();
    g.globalAlpha = 0.5;
    g.drawImage(c, fr.blur, fr.blur * 0.4);
    g.globalAlpha = 0.3;
    g.drawImage(c, -fr.blur * 0.7, -fr.blur * 0.3);
    g.restore();
  }

  // foreground: something out of focus, close to the lens. A thumb, a bar, a
  // blade of grass. This is the single cheapest thing that says "photograph".
  blurred(g, w, h, 18, (x) => {
    const pick = Math.floor(R() * 3);
    if (pick === 0) {                       // a thumb over the corner
      x.fillStyle = rgba(mix(SKIN.tan[0], PELT.pinkSkin, 0.4), 0.94);
      x.beginPath();
      x.ellipse(w * 0.0, h * 1.04, w * 0.22, h * 0.24, -0.4, 0, 7);
      x.fill();
    } else if (pick === 1) {                // a bar or a stem
      x.strokeStyle = rgba(sink(PELT.slate, 0.3), 0.8);
      x.lineWidth = w * 0.04;
      x.beginPath(); x.moveTo(w * 0.96, -20); x.lineTo(w * 0.86, h + 20); x.stroke();
    } else {                                 // the near edge of the floor
      x.fillStyle = rgba(sink(PELT.cocoa, 0.5), 0.8);
      x.fillRect(0, h * 0.93, w, h * 0.12);
    }
  });

  // eyeshine halo: the flash coming back out of the animal, bloomed
  if (spec.shine) {
    g.save();
    g.globalCompositeOperation = 'screen';
    g.filter = 'blur(' + (h * 0.032) + 'px)';
    g.globalAlpha = 0.34;
    g.fillStyle = rgba(spec.shine, 1);
    g.beginPath();
    g.arc(w * (0.5 + fr.dx * 0.6), h * (0.44 + fr.dy * 0.6), h * 0.11, 0, 7);
    g.fill();
    g.restore();
  }

  return {
    date: spec.date,
    warm: spec.scene === 'garden' || spec.scene === 'hallway' ? 0.26 : 0.5,
    cast: spec.scene === 'hallway' ? mix(t.spec500, t.ink700, 0.4)
      : spec.scene === 'garden' ? mix(t.spec500, t.ink800, 0.3)
        : mix(t.flame500, t.ink700, 0.45),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   public API
   ═══════════════════════════════════════════════════════════════════════════ */

const CACHE = new Map();

/**
 * One canonical bitmap per subject, reused at every display size, so the
 * polaroid, the poster and the run-end ledger all share a single decode.
 * WebP where the browser has it (these are photographs; PNG is the wrong
 * codec and cost ~5x the bytes), JPEG where it does not.
 */
function encode(cv) {
  // JPEG, not PNG and not WebP. These are photographs with heavy grain: PNG
  // costs about five times the bytes for no visible gain, and WebP encodes
  // ~3.5x slower here (12 ms vs 3.5 ms a frame) for a saving nobody can see
  // once the image is 122 px wide inside a polaroid.
  return cv.toDataURL('image/jpeg', 0.9);
}

function renderPet(key) {
  const cv = document.createElement('canvas');
  cv.width = PET_W; cv.height = PET_H;
  const g = cv.getContext('2d', CTX2D);
  const R = mulberry(hash32('pet:' + key));
  const o = paintPet(g, PET_W, PET_H, key, R);
  grade(g, cv, PET_W, PET_H, R, {
    warm: o.warm, cast: o.cast, date: o.date,
    liftA: 0.22, grain: 0.085, bloom: 0.3, vig: 0.95,
    flashX: 0.46, flashY: 0.4,
  });
  return encode(cv);
}

/** Data URL for one pet. `any` = pet slug, kid slug, or pet name. */
export function petPhoto(any) {
  const key = petKey(any);
  if (!key || !PETS[key]) return null;
  const ck = 'pet:' + key;
  let hit = CACHE.get(ck);
  if (!hit) { hit = renderPet(key); CACHE.set(ck, hit); }
  return hit;
}

/**
 * An <img> for a pet, sized so nothing reflows when the bitmap lands: the
 * intrinsic size is on the element before the src is even set.
 */
export function petImg(any, { alt, className = 'petpic' } = {}) {
  const key = petKey(any);
  const img = document.createElement('img');
  img.className = className;
  img.decoding = 'async';
  img.draggable = false;
  img.width = PET_W; img.height = PET_H;
  const k = KIDS.find((x) => PET_BY_KID[x.slug] === key);
  img.alt = alt ?? (k ? 'Photograph of ' + k.pet + ', ' + k.name.split(' ')[0] + "'s missing pet" : 'Missing pet');
  const src = petPhoto(key);
  if (src) img.src = src;
  return img;
}

/**
 * Render the eight photographs. Two modes, and picking the wrong one is a
 * measurable frame-rate bug either way:
 *
 *   default (rAF chunks)  — for a caller that is about to leave the screen.
 *        The title kicks this off as the player commits to a destination, so
 *        the work happens under the transition veil that is going down anyway.
 *   `{ sync: true }`      — for a scene's own `enter()`, which already runs
 *        behind the veil. Chunking there is worse than blocking: the chunks
 *        resolve after enter() does, so they run in the live scene instead of
 *        behind the black, and one photograph is ~30 ms.
 *
 * Warming on an idle callback on the Title was tried and measured 6 fps: a
 * 30 ms paint does not fit in a 10 ms idle slice, and requestIdleCallback will
 * hand you the slice anyway. Do not put this back on a screen the player is
 * looking at.
 */
let _warming = false;
export function warmFaces({ budgetMs = 8, sync = false } = {}) {
  const jobs = [];
  for (const key of Object.keys(PETS)) if (!CACHE.has('pet:' + key)) jobs.push(['pet', key]);
  if (!jobs.length) return Promise.resolve(0);

  /* Synchronous is the mode scenes use, because a scene calls this from
     `Scene.enter()`, which runs behind the transition veil. Chunking across
     rAF there is actively wrong: the chunks land AFTER enter() resolves, so
     the work moves out from behind the black screen and into the live scene,
     and one photograph is ~35 ms — enough to halve the frame rate of whatever
     screen you just opened. Behind the veil, blocking is the cheap option. */
  if (sync) {
    for (const [, key] of jobs) petPhoto(key);
    return Promise.resolve(jobs.length);
  }

  if (_warming) return Promise.resolve(0);
  _warming = true;
  return new Promise((resolve) => {
    let done = 0;
    const step = () => {
      const t0 = performance.now();
      while (jobs.length) {
        const [, key] = jobs.shift();
        petPhoto(key);
        done++;
        if (performance.now() - t0 > budgetMs) break;
      }
      if (jobs.length) { requestAnimationFrame(step); return; }
      _warming = false;
      resolve(done);
    };
    requestAnimationFrame(step);
  });
}

/** Test/diagnostic hooks. */
export function faceCacheSize() { return CACHE.size; }
export function clearFaceCache() { CACHE.clear(); }
export const PET_KEYS = Object.keys(PETS);
