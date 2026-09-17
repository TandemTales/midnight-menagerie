/**
 * Backdrop GLSL: far wall (6 architecture modes), floor/ceiling (9 surface
 * treatments), silhouette props, contact shadows, light shafts, near frame.
 * OWNER: atmosphere agent.
 *
 * Everything is procedural — there is no environment art in the project — so each
 * shader carries a relief height field and lights it with the scene's real candle
 * positions. That is what makes candlelight read as *lighting the mansion* rather
 * than as a glow sprite pasted on top.
 *
 * All wall/floor features are authored in WORLD METRES (1 unit = 1 m, eye height
 * ~2.2 m) so a chair rail is a chair rail at any plane size.
 *
 * Round 2 (2026-08-20) — the shading model is now shared and physical-ish:
 *
 *     lit = albedo * (ambient + Σ_i lightCol_i * att_i * (wrap + ndl)) + spec
 *
 * Every surface uses that same form so a candle reads at the same strength on the
 * wall, the floor and a prop. Props are lit PER PIXEL from an SDF-derived normal
 * (they used to be lit at four quad corners with a near-black albedo, which is why
 * every prop in the game rendered as a flat silhouette). Shafts now compute their
 * own floor intersection and the floor paints a bright elliptical pool there.
 */
import { GLSL_LIB } from './common.js';

/* Shared lighting helpers, pasted into every surface shader. */
const LIGHT_LIB = /* glsl */`
/* Distance attenuation: tighter than inverse-square so a candle makes a real
   pool with a defined edge instead of a soft global lift. */
float mmAtten(float dist, float radius, float intensity){
  float k = dist / max(radius, 0.001);
  return intensity / (1.0 + k*k*(1.0 + k*1.55));
}
/* Wrapped lambert — a little light bends around the terminator, which is what
   stops procedural geometry reading as hard-edged CG. */
float mmWrapNdL(vec3 n, vec3 l, float wrap){
  return max((dot(n, l) + wrap) / (1.0 + wrap), 0.0);
}
vec3 mmSpec(vec3 n, vec3 l, vec3 v, vec3 lc, float att, float gloss, float power){
  if (gloss <= 0.001) return vec3(0.0);
  vec3 h = normalize(l + v);
  return lc * att * pow(max(dot(n, h), 0.0), power) * gloss;
}
/* THE DRAWN LINE.
   Every form in UI/*.png is outlined: 44-74% of its strong edges carry a value
   darker than both sides (tools/bgmetrics.py), and the crest of every moulding
   carries one loaded stroke of light. This room had neither -- its wall
   measured 0.11 of ink depth and its props 0.000 -- and that is half of what
   the UI pass's judges have been calling a render for seven rounds.

   Width in PIXELS is the whole point. A 4 cm chair rail across a 19 m room is a
   fifth of a pixel of relief, so lighting alone can only ever draw it as a
   hairline; a painter gives it the same two-pixel line wherever it is. The
   screen-space derivative of the relief is metres of relief PER PIXEL, so a
   threshold on it is a line of constant width at any depth, and it is free:
   the shader already takes those derivatives for its normal.

   Returns (ink, lip): how dark the hollow goes and how hard the crest catches.
   rise is > 0 on a face that climbs toward the top of the screen, which is
   the face a light hung above the room reaches. */
vec2 mmDrawn(float h, float lo, float hi){
  vec2 gs = vec2(dFdx(h), dFdy(h));
  float hp = length(gs);
  float stepAmt = smoothstep(lo, hi, hp);
  float rise = -gs.y / max(hp, 1e-6);
  float ink = stepAmt * (0.34 + 0.66 * clamp(-rise, 0.0, 1.0));
  float lip = stepAmt * clamp(rise, 0.0, 1.0);
  return vec2(ink, lip);
}
`;

/* ------------------------------------------------------------------ far wall */

export const WALL_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const WALL_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
${LIGHT_LIB}
uniform float uTime, uSeed, uDread, uFogAmt, uArch, uCool, uGrime, uOpen, uCeil, uGain;
uniform float uGloss, uAlbLift, uInk, uLip, uDamask, uDamCell, uDamKind;
uniform float uSubject, uFar;
uniform vec3  uDamHue;
uniform vec2  uSize;           // wall plane size in metres (w, h)
uniform vec3  uDeep, uMid, uHi, uAccent, uFog, uOpenGlow, uAmbient;
uniform vec4  uLights[5];      // xy in wall-local metres, z radius, w intensity
uniform vec3  uLightCol[5];
uniform vec3  uCamera;
varying vec2  vUv;
varying vec3  vWorld;

float archSD(vec2 q){
  return mmArch(q - vec2(uSize.x*0.5, 0.10), 1.05, 2.30);
}

/* A DAMASK, drawn with a pen: a fleur on a brick offset inside a continuous
   ogee lattice. Returns (body, line) -- the stroke, and the darker edge a
   brush leaves outside it.

   This is the ornament UI/selectKid.png and UI/selectCompanion.png put on
   every wall they show, and it is why a near-black wall in the samples still
   has something in it. Ours had one octave of fbm.

   Two rules, both learned by drawing it wrong first: every element is a
   STROKE, and the lattice is a continuous function of position. A lattice
   assembled per cell tears along the cell edge, which is exactly what the
   first version did. */
float mmStroke(vec2 p, float r, float th){       /* a stroke on a circle */
  return abs(length(p) - r) - th;
}
float mmSeg(vec2 p, float h, float th){          /* a stroke on a segment */
  return length(vec2(p.x, max(abs(p.y) - h, 0.0))) - th;
}
vec2 mmDamask(vec2 q, float cell, float px, float kind){
  vec2 c = q / cell;
  /* THE LATTICE, one of three. A house hung with one paper in every room reads
     as a texture applied twice, and no two of the samples' ornaments share a
     vocabulary. All three are continuous functions of position, which is the
     rule a lattice cannot break: one assembled per cell tears at the cell
     edge. */
  float d;
  if (kind < 0.5) {
    // an ogee: |sin| of each axis, bent by the other
    d = abs(abs(sin(3.14159*c.x)) + abs(sin(3.14159*c.y)) - 1.0) * 0.42 - 0.012;
  } else if (kind < 1.5) {
    // a trellis: two diagonals crossing, with the squares left open
    float u = abs(fract(c.x + c.y) - 0.5);
    float v = abs(fract(c.x - c.y) - 0.5);
    d = min(u, v) * 0.50 - 0.013;
  } else {
    // a stripe: vertical bands, the way a papered hall is hung in widths
    d = abs(fract(c.x) - 0.5) * 0.52 - 0.011;
    d = min(d, abs(abs(sin(3.14159*c.x)) + abs(sin(3.14159*c.y*0.5)) - 1.0) * 0.60 - 0.010);
  }
  /* the motif, one per cell, rows offset by half a cell */
  vec2 g = vec2(fract(c.x + mod(floor(c.y), 2.0)*0.5), fract(c.y)) - 0.5;
  vec2 a = vec2(abs(g.x), g.y);
  if (kind < 0.5) {
    // a FLEUR: a bud on a stem, two leaves curling out, a ring below
    d = min(d, mmStroke(g - vec2(0.0, 0.02), 0.058, 0.014));
    d = min(d, mmSeg(g - vec2(0.0, 0.16), 0.085, 0.012));
    float l1 = mmStroke(a - vec2(0.105,  0.045), 0.085, 0.012);
    l1 = max(l1, -(g.y - 0.045) - 0.017);
    float l2 = mmStroke(a - vec2(0.150, -0.095), 0.058, 0.012);
    l2 = max(l2, -(g.y + 0.095) - 0.012);
    d = min(d, min(l1, l2));
    d = min(d, length(g - vec2(0.0, 0.255)) - 0.024);
    d = min(d, mmStroke(g + vec2(0.0, 0.235), 0.034, 0.011));
  } else if (kind < 1.5) {
    // a QUATREFOIL with a star in it, which is what a trellis carries
    for (int i = 0; i < 4; i++){
      float ang = float(i)*1.5708 + 0.7854;
      d = min(d, mmStroke(g - vec2(cos(ang), sin(ang))*0.082, 0.046, 0.011));
    }
    d = min(d, mmStroke(g, 0.030, 0.010));
    for (int i = 0; i < 4; i++){
      float ang = float(i)*1.5708;
      d = min(d, mmSeg(vec2(g.x*cos(ang) - g.y*sin(ang),
                            g.y*cos(ang) + g.x*sin(ang)) - vec2(0.0, 0.052),
                       0.030, 0.008));
    }
  } else {
    // a SPRIG: three leaves off one stem, the way a striped paper is sprigged
    d = min(d, mmSeg(g - vec2(0.0, 0.02), 0.115, 0.010));
    for (int i = 0; i < 3; i++){
      float f = float(i)/2.0;
      float yy = -0.075 + f*0.155;
      float side = (mod(float(i), 2.0) < 0.5) ? 1.0 : -1.0;
      vec2 lv = g - vec2(side*(0.052 + 0.030*f), yy);
      d = min(d, mmStroke(lv, 0.042 - 0.010*f, 0.0095));
    }
    d = min(d, length(g - vec2(0.0, 0.155)) - 0.020);
  }
  /* Widths in CELL units, floored at about a pixel and a third of screen, so
     the paper survives the back of the room. */
  float w = max(0.010, px / cell * 1.35);
  float body = 1.0 - smoothstep(0.0, w, d);
  float line = (1.0 - smoothstep(w, w*2.6, d)) * (1.0 - body);
  return vec2(body, line);
}

/* ── THE SUBJECT ────────────────────────────────────────────────────────────
   An architecture MODE says what a wall is MADE OF. It never says what the room
   IS. Seventeen regions over six modes is why the Crypt and the Secret Passages
   have been one coursed wall recoloured, and why the thing each of these rooms
   is actually named after -- the Foyer's staircase, the Crypt's ossuary niches,
   the Greenhouse's planting terraces, the Lampworks' benches, every one of them
   written down in docs/art/background-prompts.md -- was nowhere in the room.

   A subject is drawn into the RELIEF and not into the colour, so it arrives
   with the occlusion that makes a recess a recess, ink in its hollows, a lip of
   light along its crests and the candlelight of the room it stands in, all for
   free. Everything is in METRES: at the authored cameras the far wall runs
   27-43 px/m, so a 7 cm book spine is two pixels of drawn line -- which is what
   mmDrawn wants -- and a 30 cm newel post is a form.

   And this is the one axis the measurements say is short. Ink DEPTH runs
   0.009-0.080 against mainMenu.png's 0.248, and that gap is not a heavier line:
   uInk at 1.00 already reads as black wire. It is a thousand small drawn forms,
   each a value darker than both its sides. One shelf of spines is sixty. */

float mmSolid(float d){ return smoothstep(0.018, -0.018, d); }
/* Distance from the nearest member of a row repeating on 'period'. */
float mmRowX(float x, float period){ return abs(mod(x, period) - period*0.5); }
/* 1 between y0 and y1, with an edge sharp enough to ink at each. */
float mmBand(float y, float y0, float y1){
  return smoothstep(-0.016, 0.016, y - y0) * smoothstep(0.016, -0.016, y - y1);
}

/* A RAIL AND ITS UPRIGHTS -- the drawn thing a staircase, a landing gallery, a
   graveyard railing and a kennel pen all are. yb is the line the uprights stand
   on. They are turned, so they are fatter at the foot than at the neck. */
float mmRail(vec2 p, float yb, float hh, float period, float th){
  float t = clamp((p.y - yb)/max(hh, 0.01), 0.0, 1.0);
  float x = mmRowX(p.x, period);
  float w = th * (0.60 + 0.55*(1.0 - t));
  float s = mmBand(p.y, yb + hh*0.15, yb + hh*0.84)
          * (1.0 - smoothstep(w, w*1.45, x)) * 0.60;
  s += mmBand(p.y, yb + hh*0.84, yb + hh) * 0.90;     // the handrail
  s += mmBand(p.y, yb, yb + hh*0.15) * 0.66;          // the bottom rail
  return s;
}

/* A NEWEL, a gate pier, a buttress: a square shaft, a capstone wider than it,
   and a ball finial standing on that. */
float mmPost(vec2 p, float x0, float yb, float hh, float th){
  float d = mmBox(p - vec2(x0, yb + hh*0.5), vec2(th, hh*0.5), 0.02);
  d = min(d, mmBox(p - vec2(x0, yb + hh + 0.06), vec2(th*1.50, 0.06), 0.015));
  d = min(d, mmCircle(p - vec2(x0, yb + hh + 0.27), th*0.90));
  return mmSolid(d);
}

/* SHELVES, AND WHAT IS ON THEM. A plank on its own is one line; a plank with
   its contents is sixty, and the contents are the whole reason to draw it.
   kind 0 book spines, 1 jars and bottles, 2 boxes and bundles, 3 stacked
   skulls, 4 pots with something growing out of them. */
float mmShelf(vec2 p, float y0, float y1, float n, float kind, float sd){
  float pitch = max((y1 - y0)/max(n, 1.0), 0.16);
  float row = floor((p.y - y0)/pitch);
  float ly = y0 + row*pitch;
  float s = mmBand(p.y, ly, ly + 0.05) * 0.80;
  float b = ly + 0.05, cap = pitch - 0.10;
  float inRange = mmBand(p.y, y0 - 0.02, y1);
  if (kind < 0.5) {
    float k = 0.082, i = floor(p.x/k);
    float hs = mmHash11(i*1.7 + sd);
    float tp = b + cap*(0.60 + 0.35*mmHash11(i*3.1 + sd));
    s += mmSolid(mmBox(p - vec2((i + 0.5)*k, (b + tp)*0.5),
                       vec2(k*(0.28 + 0.16*hs), (tp - b)*0.5), 0.004)) * 0.52;
  } else if (kind < 1.5) {
    float k = 0.28, i = floor(p.x/k);
    float hs = mmHash11(i*2.3 + sd);
    float r = k*(0.22 + 0.13*hs), tp = b + cap*(0.42 + 0.44*hs), x = (i + 0.5)*k;
    float d = mmBox(p - vec2(x, (b + tp)*0.5), vec2(r, (tp - b)*0.5), r*0.62);
    d = min(d, mmBox(p - vec2(x, tp + 0.035), vec2(r*0.44, 0.035), 0.012));
    s += mmSolid(d) * 0.60;
  } else if (kind < 2.5) {
    float k = 0.46, i = floor(p.x/k);
    float hs = mmHash11(i*1.9 + sd);
    float w = k*(0.26 + 0.17*hs), hh = cap*(0.34 + 0.38*hs), x = (i + 0.5)*k;
    s += mmSolid(mmBox(p - vec2(x, b + hh*0.5), vec2(w, hh*0.5), 0.012)) * 0.58;
    s += mmBand(p.y, b + hh*0.60, b + hh*0.68)
       * (1.0 - smoothstep(w*0.88, w, abs(p.x - x))) * 0.34;      // the strap
  } else if (kind < 3.5) {
    /* A SKULL: a cranium, a jaw narrower than it, and one socket. At the six
       pixels a far-wall niche gives it this is a stack of pale beads with a
       dark line round each, which is what an ossuary looks like at 30 m; on a
       side wall two metres away it is a skull. */
    float r = 0.082, x = mmRowX(p.x, 0.215);
    float d = mmCircle(vec2(x, p.y - b - r*1.02), r);
    d = min(d, mmBox(vec2(x, p.y - b - r*0.40), vec2(r*0.60, r*0.40), r*0.24));
    float sk = mmSolid(d) * 0.74;
    sk -= mmSolid(mmCircle(vec2(x - r*0.40, p.y - b - r*1.12), r*0.26)) * 0.52;
    s += max(sk, 0.0);
  } else {
    float k = 0.50, i = floor(p.x/k);
    float hs = mmHash11(i*2.7 + sd);
    float x = (i + 0.5)*k, r = k*(0.19 + 0.08*hs);
    s += mmSolid(mmBox(p - vec2(x, b + r*0.70), vec2(r, r*0.70), r*0.26)) * 0.62;
    s += mmRidge(vec2(p.x, p.y)*8.0 + sd) * 0.30
       * mmBand(p.y, b + r*1.30, b + r*1.30 + cap*0.62)
       * (1.0 - smoothstep(r*1.15, r*2.50, abs(p.x - x)));        // and its plant
  }
  return s * inRange;
}

/* The region's subject, in metres of relief. 'far' is 1 on the back wall and 0
   on the two side walls, because a staircase is a thing a room has ONE of and a
   row of ossuary niches is a thing it has forty of.

   occ comes back as the wall the subject COVERS. Relief on its own drew the
   first staircase as a WIREFRAME: every edge inked, and between the balusters
   the lit wallpaper of an empty hall, because the wall does not know there is a
   staircase standing in front of it. A thing against a wall hides it, its
   underside is the darkest value in the room, and the mode's own wainscot and
   chair rail have to stop where it starts. occ is what does all three. */
float subjectH(vec2 q, float far, out float occ){
  occ = 0.0;
  if (uSubject < 0.5) return 0.0;
  /* Taken before any branching, and all the branching below is on uniforms, so
     these derivatives are defined. Below about a fifth of a metre per pixel a
     drawn form is finer than the pixel it lands in and inking it draws BANDS
     rather than joinery -- the same gate the wall's own line uses. */
  float dqm = max(abs(dFdx(q.x)), abs(dFdy(q.y)));
  float fade = smoothstep(0.26, 0.05, dqm);
  float cx = q.x - uSize.x*0.5, ax = abs(cx);
  float s = 0.0;
  /* Set by a subject that knows its own coverage exactly, which then keeps the
     generic "any relief covers the wall" rule at the bottom off its back. The
     Graveyard needs that: its occ has to name the IRONWORK and nothing else, and
     the generic rule was claiming the planting and the mausoleum too, so the
     moonlight stopped at them and both came back black. */
  float occSet = 0.0;

  if (uSubject < 1.5) {
    /* 1  STAIR -- the Forgotten Foyer. "a sweeping staircase in the
       background". An imperial stair: two flights rising from the outside to a
       landing over the doorway, a balustrade on every run, newels at the
       corners and at the foot, the panelled spandrel under each flight, and the
       landing window above it. 20 cm of rise on a 34.8 cm going, which is a
       real Victorian stair and also why the nosings come out as a row of drawn
       steps and not as a ramp. */
    if (far < 0.5) return 0.0;
    float run = clamp(ax - 3.55, 0.0, 6.45);
    /* TWO RAKES, and they are not interchangeable. The STEPPED one is the line
       of nosings, and it is the cue that says staircase. The SMOOTH one is what
       the string board and the spandrel panelling follow -- using the stepped
       one for them put a panel's centre through a 20 cm jump every 35 cm of x,
       eighteen overlapping rectangles, which is the same maze of concentric
       outlines the hung portraits used to make in the middle of this room. */
    float topS = max(3.70 - run*0.575, 0.12);
    float top = mix(3.70, max(3.70 - floor(run/0.348 + 1.0)*0.20, 0.12),
                    step(3.55, ax));
    /* The stair ENDS. Without this the handrail and the string ran on across
       the whole wall at their clamped height, which put two stray horizontal
       lines through the wainscot from the newel to the corner. */
    float on = 1.0 - smoothstep(10.02, 10.30, ax);
    /* THE WALL BEHIND THE BALUSTRADE GOES DARK FIRST. This is the whole
       difference between a staircase and a drawing of one: the first version put
       every member in at +0.8 of relief against a wall at +0.1, so the eye got
       an inked outline with the lit wallpaper of an empty hall showing between
       the balusters. A balustrade is a pale rail and pale uprights standing
       against a shadow. So the band is dropped to -0.72 and the members ride
       back OUT of it -- handrail near +0.7, baluster near +0.2, the gap at
       -0.72, which the wall's own occlusion term then reads as three values. */
    float shade = mmBand(q.y, topS - 0.02, topS + 1.16) * on;
    s -= shade * 0.72;
    s += mmRail(q, topS + 0.17, 0.94, 0.215, 0.036) * on * 1.58;
    /* THE STRING: the deep raking board the treads sit on, and the single
       boldest drawn line in the room. The nosings step along its top edge. */
    s += mmBand(q.y, topS - 0.76, topS - 0.02) * 0.95 * on;
    s += mmBand(q.y, topS - 0.84, topS - 0.76) * 0.45 * on;   // its bottom moulding
    s += mmBand(q.y, top - 0.055, top + 0.030) * 0.80 * on;   // the nosings
    s += mmPost(vec2(ax, q.y), 3.55, topS - 0.34, 1.58, 0.135) * 1.35;
    s += mmPost(vec2(ax, q.y), 10.0, 0.02, 1.74, 0.150) * 1.35;
    /* THE SPANDREL: the panelled triangle under a flight, which is what a
       Victorian hall has there instead of a hole. In shadow, with its own dado
       and a recessed panel on a 1.05 m repeat raked along with the string. */
    float spa = smoothstep(topS - 0.84, topS - 0.94, q.y) * on * step(3.55, ax);
    /* Deep enough to read. At 0.52 the under-stair came out the same value as
       the wainscot panel beside it, because a wainscot panel is also a 0.55 m
       recess -- a shadow the same depth as the thing it falls on is no shadow. */
    s -= spa * 0.86;
    s += spa * mmBand(q.y, 0.94, 1.10) * 0.95;
    s += spa * (1.0 - smoothstep(0.02, 0.09, abs(
            mmBox(vec2(mmRowX(q.x, 1.05), q.y - (topS - 1.72)), vec2(0.34, 0.50), 0.05)))) * 0.80;
    /* ...and under the landing, the soffit: the hard shadow where the floor of
       the landing crosses the wall above the doorway. */
    float sof = (1.0 - step(3.55, ax)) * mmBand(q.y, 2.86, 3.06);
    s -= sof * 0.30;
    s += sof * mmBand(q.y, 3.00, 3.06) * 0.95;
    /* What the stair COVERS -- so the mode's wainscot and chair rail stop at it
       and the wallpaper does not print on the balusters. */
    occ = clamp(spa + sof + shade + mmBand(q.y, topS - 0.84, topS)
              + mmPost(vec2(ax, q.y), 3.55, topS - 0.34, 1.58, 0.135)
              + mmPost(vec2(ax, q.y), 10.0, 0.02, 1.74, 0.150), 0.0, 1.0);
    /* THE LANDING WINDOW. The one thing in the Foyer the light can be seen to
       come from, besides the chandelier. Held deliberately dim: the combat
       board's intent row crosses this band of the frame. */
    float w = mmArch(vec2(cx, q.y - 4.95), 1.06, 1.42);
    s -= mmSolid(w) * 1.15;                                   // the opening
    s += (1.0 - smoothstep(0.050, 0.150, abs(w))) * 0.95;     // its surround
    float inw = mmSolid(w + 0.095);
    s += inw * ((1.0 - smoothstep(0.028, 0.058, mmRowX(cx + 0.355, 0.71))) * 0.70
              + mmBand(q.y, 6.06, 6.14) * 0.70
              + (1.0 - smoothstep(0.0, 0.050, abs(mmCircle(vec2(cx, q.y - 6.72), 0.30)))) * 0.62);
    s += mmBand(q.y, 4.80, 4.95) * (1.0 - smoothstep(1.16, 1.34, ax)) * 0.85;   // the sill
    occ = clamp(occ + mmSolid(w + 0.02), 0.0, 1.0);

  } else if (uSubject < 2.5) {
    /* 2  BOOKCASE -- the Grand Study and Library. Cases to the cornice, every
       bay full of spines, and the rail a rolling ladder runs on across them. */
    float bay = mmRowX(q.x, 2.35), ct = max(uCeil - 0.55, 2.2);
    /* The back of a bay is the darkest thing in a library, and the spines stand
       out of it. Same lesson as the balustrade: drop the ground, then draw. */
    float inBay = mmBand(q.y, 0.42, ct - 0.16) * (1.0 - smoothstep(0.86, 0.99, bay));
    s -= inBay * 0.80;
    s += (1.0 - smoothstep(0.050, 0.110, bay)) * mmBand(q.y, 0.12, ct + 0.20) * 0.85;
    s += mmShelf(q, 0.44, ct - 0.18, floor((ct - 0.62)/0.46), 0.0, uSeed)
       * (1.0 - smoothstep(0.84, 0.98, bay)) * 1.75;
    s += mmBand(q.y, 2.28, 2.37) * 0.58;                      // the ladder rail
    s += mmBand(q.y, ct, ct + 0.20) * 0.95;                   // the case cornice

  } else if (uSubject < 3.5) {
    /* 3  NICHES -- the Crypt and Ossuary. "arched niches of neatly stacked
       skulls and bones". Down both long walls on a 3.1 m repeat, three shelves
       in each, a moulded surround, a keystone, and a ledge of candle stubs
       under them -- which is also every candle in the room's light. */
    float nx = mod(q.x + 1.55, 3.10) - 1.55;
    /* TWO TIERS. An ossuary is a WALL of them; one row 1.7 m tall against a 5 m
       vault left three metres of bare coursework over it, which is the
       "nothing on it for two metres" the rubric asks to be named. */
    float tier = step(2.58, q.y);
    float ny = q.y - tier*2.06;
    float nd = mmArch(vec2(nx, ny - 0.62), 0.58, 0.96);
    s -= mmSolid(nd) * 1.35;                                  // the recess
    s += (1.0 - smoothstep(0.070, 0.180, abs(nd))) * 1.10;    // its moulded surround
    s += mmSolid(mmBox(vec2(nx, ny - 2.22), vec2(0.105, 0.140), 0.02)) * 0.95;  // keystone
    /* ...and the bones in it, lifted well clear of the recess floor: the point
       of drawing a niche is what is STACKED in it, and at 1.0 they came back as
       a dark mesh the same value as the coursing round them. */
    /* FIVE shelves, not three. At a 47 cm pitch a 16 cm skull left two thirds
       of every shelf empty and the niche read as a black hole with three faint
       lines in it. A stack of bones is PACKED. */
    s += mmSolid(nd + 0.10) * mmShelf(vec2(nx + 1.55, ny), 0.66, 2.08, 5.0, 3.0, uSeed + tier) * 2.60;
    s += mmBand(ny, 0.38, 0.62) * 0.88;                       // the ledge under each tier
    s += mmSolid(mmBox(vec2(mmRowX(q.x, 0.62), ny - 0.74), vec2(0.040, 0.110), 0.02)) * 0.60;
    occ = clamp(mmSolid(nd + 0.03) + mmBand(ny, 0.38, 0.62), 0.0, 1.0);

  } else if (uSubject < 4.5) {
    /* 4  TERRACE -- the Impossible Greenhouse. "potted ferns crowding the
       edges": three stepped planting benches against the glazing, the pots on
       them, and the iron legs that carry them. */
    float t = floor(clamp((q.y - 0.34)/0.70, 0.0, 2.0));
    float ty = 0.34 + t*0.70, dep = 1.0 - t*0.20;
    s += mmBand(q.y, ty, ty + 0.10) * 0.88 * dep;             // the bench top
    s += mmBand(q.y, ty - 0.12, ty) * 0.34;                   // the board under it
    s += mmShelf(vec2(q.x + t*0.33, q.y), ty + 0.10, ty + 0.64, 1.0, 4.0, uSeed + t) * dep;
    s += (1.0 - smoothstep(0.034, 0.072, mmRowX(q.x, 1.15))) * mmBand(q.y, 0.0, 2.20) * 0.48;

  } else if (uSubject < 5.5) {
    /* 5  BENCH -- the Lampworks. "workbenches of glass chimneys at the edges"
       under "rows of hanging oil lamps". */
    s += mmBand(q.y, 0.94, 1.08) * 0.90;                      // the bench top
    s += mmBand(q.y, 0.26, 0.94) * (1.0 - smoothstep(0.92, 1.04, mmRowX(q.x, 2.05))) * 0.42;
    s += mmShelf(q, 1.08, 1.66, 1.0, 1.0, uSeed);             // chimneys standing on it
    s += mmShelf(q, 1.90, 2.72, 2.0, 2.0, uSeed + 3.0);       // crates on a shelf over it
    float lx = mmRowX(q.x, 1.30);
    s += (1.0 - smoothstep(0.016, 0.040, lx)) * mmBand(q.y, 3.16, max(uCeil*0.80, 3.4)) * 0.52;
    s += mmSolid(mmCircle(vec2(lx, q.y - 2.98), 0.175)) * 0.85;          // the lamps
    s += mmSolid(mmBox(vec2(lx, q.y - 3.20), vec2(0.105, 0.070), 0.02)) * 0.70;

  } else if (uSubject < 6.5) {
    /* 6  WARDROBE -- the Sleeping Quarters. "tall wardrobes with doors slightly
       ajar": a carcass, a cornice over it, two panelled doors, and a black gap
       where one of them stands open. */
    float i = floor(q.x/2.60), wx = q.x - (i + 0.5)*2.60;
    float body = mmSolid(mmBox(vec2(wx, q.y - 1.32), vec2(0.92, 1.32), 0.03));
    s += body * 0.66;
    s += mmSolid(mmBox(vec2(wx, q.y - 2.72), vec2(1.02, 0.11), 0.02)) * 1.00;
    s += body * (1.0 - smoothstep(0.028, 0.066, abs(abs(wx) - 0.46))) * 0.50;
    s += body * (1.0 - smoothstep(0.028, 0.066, abs(wx))) * 0.66;
    s -= body * mmSolid(mmBox(vec2(abs(wx) - 0.46, q.y - 1.36), vec2(0.30, 0.86), 0.02)) * 0.40;
    s -= step(0.55, mmHash11(i*4.1 + uSeed))
       * mmSolid(mmBox(vec2(wx - 0.44, q.y - 1.30), vec2(0.38, 1.14), 0.02)) * 1.55;
    s += mmSolid(mmCircle(vec2(abs(wx) - 0.13, q.y - 1.32), 0.042)) * 0.60;

  } else if (uSubject < 7.5) {
    /* 7  PENS -- the Kennels and Animal Ward. "rows of wooden kennel pens",
       with the staves, the gate brace and the hook rail of leashes over them. */
    float i = floor(q.x/2.20), px = q.x - (i + 0.5)*2.20;
    s += mmBand(q.y, 0.0, 1.14) * (1.0 - smoothstep(0.050, 0.110, mmRowX(q.x, 0.165))) * 0.55;
    s += mmBand(q.y, 1.14, 1.28) * 0.85;                      // the pen's top rail
    s += mmBand(q.y, 0.22, 0.34) * 0.60;                      // its bottom rail
    s += mmSolid(mmBox(vec2(px, q.y - 0.88), vec2(0.075, 0.88), 0.02)) * 0.90;   // the posts
    s += mmBand(q.y, 1.86, 1.99) * 0.75;                      // the hook rail
    s += mmSolid(mmCircle(vec2(mmRowX(q.x, 0.44), q.y - 1.70), 0.075)) * 0.55;   // and its hooks

  } else if (uSubject < 8.5) {
    /* 8  TOPIARY -- the Withered Hedge Maze. "broken topiary animals": a
       clipped ball and a cone on a standard, standing above the hedge line,
       and an arched way cut through it. */
    float i = floor(q.x/4.60), tx = q.x - (i + 0.5)*4.60;
    float hs = mmHash11(i*3.7 + uSeed), base = 2.6 + hs*0.9;
    float d = mmCircle(vec2(tx, q.y - base - 0.62), 0.58);
    d = min(d, mmCircle(vec2(tx, q.y - base - 1.48), 0.34));
    d = min(d, mmBox(vec2(tx, q.y - base*0.5), vec2(0.085, base*0.5), 0.02));
    s += mmSolid(d - mmFbm3(q*6.0 + i)*0.09) * 0.95 * step(0.35, hs);
    float gx = mod(q.x + 11.5, 23.0) - 11.5;
    s -= mmSolid(mmArch(vec2(gx, q.y - 0.05), 1.15, 1.75)) * 1.6;               // the way through
    s += (1.0 - smoothstep(0.08, 0.22, abs(mmArch(vec2(gx, q.y - 0.05), 1.15, 1.75)))) * 0.55;

  } else if (uSubject < 9.5) {
    /* 9  TIMBER -- the Secret Passages. "bare timber and brick": studs, the
       noggins between them, a peephole, and the dumbwaiter's hatch. */
    s += (1.0 - smoothstep(0.070, 0.130, mmRowX(q.x, 0.62))) * mmBand(q.y, 0.0, uCeil) * 0.70;
    s += mmBand(q.y, 1.02, 1.14) * 0.55;
    s += mmBand(q.y, 2.16, 2.28) * 0.55;
    s += mmBand(q.y, 0.0, 0.16) * 0.70;                        // the sole plate
    float px = mod(q.x + 4.3, 8.6) - 4.3;
    s -= mmSolid(mmCircle(vec2(px, q.y - 1.62), 0.075)) * 1.5;                  // the peephole
    s += (1.0 - smoothstep(0.0, 0.055, abs(mmCircle(vec2(px, q.y - 1.62), 0.105)))) * 0.85;
    float hx = mod(q.x + 2.1, 8.6) - 4.3;
    s -= mmSolid(mmBox(vec2(hx, q.y - 1.20), vec2(0.46, 0.40), 0.02)) * 0.85;   // the hatch
    s += (1.0 - smoothstep(0.030, 0.090, abs(mmBox(vec2(hx, q.y - 1.20), vec2(0.50, 0.44), 0.02)))) * 0.90;

  } else if (uSubject < 10.5) {
    /* 10  MIRRORS -- the Ballroom and Velvet Suites. A pier glass between every
       pair of windows, each under a carved pelmet, with a velvet drape falling
       either side of it. */
    float i = floor(q.x/4.20), mx = q.x - (i + 0.5)*4.20;
    float md = mmArch(vec2(mx, q.y - 1.05), 0.74, 2.05);
    s -= mmSolid(md) * 0.85;                                   // the glass, set back
    s += (1.0 - smoothstep(0.055, 0.165, abs(md))) * 1.05;     // its frame
    s += mmSolid(mmBox(vec2(mx, q.y - 4.10), vec2(0.98, 0.20), 0.05)) * 0.95;   // the pelmet
    s += (1.0 - smoothstep(0.030, 0.075, mmRowX(mx + 0.21, 0.42)))
       * mmBand(q.y, 0.0, 3.90) * (smoothstep(0.78, 1.10, abs(mx))
       * (1.0 - smoothstep(1.34, 1.52, abs(mx)))) * 0.80;      // the drapery folds
    s += mmBand(q.y, 0.0, 0.26) * 0.65;

  } else if (uSubject < 11.5) {
    /* 11  DADO -- the Bathhouse and Rain Wing. "puddles on patterned tiles": a
       tiled dado with a bullnose cap, and the brass standpipes on it. */
    s += mmBand(q.y, 0.0, 1.52)
       * (1.0 - smoothstep(0.012, 0.030, min(mmRowX(q.x, 0.225), mmRowX(q.y, 0.225)))) * 0.40;
    s += mmBand(q.y, 1.52, 1.66) * 0.90;                       // the bullnose cap
    s += mmBand(q.y, 1.66, 1.74) * 0.45;
    float px = mmRowX(q.x, 2.85);
    s += (1.0 - smoothstep(0.052, 0.098, px)) * mmBand(q.y, 0.0, uCeil*0.86) * 0.80;
    s += (1.0 - smoothstep(0.086, 0.130, px))
       * (mmBand(q.y, 1.86, 1.98) + mmBand(q.y, 3.30, 3.42)) * 0.75;            // pipe collars
    s += mmSolid(mmCircle(vec2(px, q.y - 1.10), 0.115)) * 0.70;                 // and a tap

  } else if (uSubject < 12.5) {
    /* 12  RAFTERS -- the Moonlit Attic and Observatory. "exposed rafters" and
       "star charts pinned to beams". A rafter RAKES, so it is drawn on a sheared
       coordinate and not as another upright. */
    /* A ROOF HAS A RIDGE. Both rakes drawn across the whole wall crossed each
       other into a diamond lattice from corner to corner, which read as netting
       and not as a roof: the rafters lean toward the ridge, so the rake is
       MIRRORED about the centre of the gable. */
    float lean = (cx < 0.0) ? 0.55 : -0.55;
    float rk = q.x + (uCeil - q.y)*lean;
    s += (1.0 - smoothstep(0.075, 0.145, mmRowX(rk, 1.05)))
       * mmBand(q.y, 1.30, uCeil + 1.2) * 0.80;
    s += (1.0 - smoothstep(0.085, 0.165, ax)) * mmBand(q.y, 1.30, uCeil + 1.2) * 0.65;
    s += mmBand(q.y, 2.62, 2.80) * 0.85;                       // the collar tie
    float i = floor(q.x/3.40), chx = q.x - (i + 0.5)*3.40;
    float ch = mmBox(vec2(chx, q.y - 1.92), vec2(0.52, 0.38), 0.01);
    s += mmSolid(ch) * 0.45;
    s += (1.0 - smoothstep(0.0, 0.040, abs(ch))) * 0.70;       // the pinned chart
    s += mmShelf(q, 0.20, 1.08, 2.0, 2.0, uSeed + 7.0);        // the trunks under them

  } else if (uSubject < 13.5) {
    /* 13  FENCE -- the Mansion Graveyard. mainMenu.png's own iron fence: a
       plinth, spear-headed railings, piers with ball finials, and the estate
       mausoleum standing behind them. Drawn in FRONT of the house's mass, which
       is what puts the house behind something instead of on the horizon. */
    float pl = mmBand(q.y, 0.0, 0.62) * 0.80;
    float bx = mmRowX(q.x, 0.30);
    float bars = (1.0 - smoothstep(0.036, 0.062, bx)) * mmBand(q.y, 0.62, 2.85) * 0.70;
    bars += mmBand(q.y, 2.85, 2.85 + max(0.0, 0.32 - bx*5.2)) * 0.75;           // spear heads
    bars += (mmBand(q.y, 0.94, 1.06) + mmBand(q.y, 2.46, 2.58)) * 0.65;         // the two rails
    float piers = mmPost(vec2(mmRowX(q.x, 5.90), q.y), 0.0, 0.0, 3.05, 0.33);
    /* THE MAUSOLEUM: a pedimented box with a pilaster each side and a dark
       arched door, 8 m left of the house's centre. */
    float mx = cx + 8.4;
    float ms = mmSolid(mmBox(vec2(mx, q.y - 1.95), vec2(1.80, 1.95), 0.03));
    ms += mmSolid(mmBox(vec2(mx, q.y - 4.04), vec2(2.00, 0.16), 0.03));
    ms += mmBand(q.y, 4.20, 4.20 + max(0.0, 1.05 - abs(mx)*0.54))
        * step(abs(mx), 1.98) * 0.90;                                           // the pediment
    ms += (1.0 - smoothstep(0.050, 0.110, abs(abs(mx) - 1.42))) * mmBand(q.y, 0.0, 3.90) * 0.50;
    ms -= mmSolid(mmArch(vec2(mx, q.y - 0.18), 0.46, 1.10)) * 1.7;              // its door
    /* AND WHAT GROWS AT ITS FOOT. Between the plinth and the paving there were
       two metres of pure black running the whole width of the frame -- exactly
       the "nothing on it" the rubric asks to be named. mainMenu.png has
       planting and purple roses the length of its railings. */
    float veg = mmFbm3(vec2(q.x*1.9, q.y*3.4) + uSeed);
    float vtop = 1.30 + 0.75*mmFbm3(vec2(q.x*0.42 + uSeed*2.0, 0.0));
    s += smoothstep(vtop + 0.22, vtop - 0.70, q.y) * smoothstep(0.26, 0.70, veg) * 1.30;
    // ...and the plinth is coursed, like everything else built of stone here
    pl += mmBand(q.y, 0.0, 0.62)
        * (1.0 - smoothstep(0.014, 0.038, min(mmRowX(q.x + mod(floor(q.y/0.31), 2.0)*0.44, 0.88),
                                              mmRowX(q.y, 0.31)))) * -0.34;
    s += pl + bars + piers*1.05 + ms*0.95;
    occ = clamp(bars, 0.0, 1.0); occSet = 1.0;   // iron stays iron; stone is lit

  } else if (uSubject < 14.5) {
    /* 14  COPING -- the Moon Courtyard and Pumpkin Grounds. "a moonlit WALLED
       courtyard": a coursed wall with a coping course along its top, buttresses
       against it, and the pumpkins heaped at its foot. */
    s += mmBand(q.y, 0.0, 3.30) * 0.55;
    s += mmBand(q.y, 3.30, 3.58) * 0.95;                       // the coping
    s += mmBand(q.y, 0.0, 3.30)
       * (1.0 - smoothstep(0.014, 0.034, min(mmRowX(q.x + mod(floor(q.y/0.46), 2.0)*0.40, 0.80),
                                             mmRowX(q.y, 0.46)))) * 0.34;
    s += mmPost(vec2(mmRowX(q.x, 6.40), q.y), 0.0, 0.0, 2.95, 0.36) * 0.85;
    float i = floor(q.x/1.35), gx = q.x - (i + 0.5)*1.35;
    float hs = mmHash11(i*5.3 + uSeed), r = 0.34 + hs*0.20;
    float pk = mmSolid(mmBox(vec2(gx, q.y - r*0.86), vec2(r, r*0.86), r*0.74)) * 0.95;
    pk -= (1.0 - smoothstep(0.012, 0.030, mmRowX(gx + r*0.5, r*0.50))) * 0.35;  // its ribs
    s += max(pk, 0.0) * step(0.30, hs);
    s += mmSolid(mmBox(vec2(gx, q.y - r*1.80), vec2(0.045, 0.16), 0.02)) * 0.55*step(0.30, hs);

  } else if (uSubject < 15.5) {
    /* 15  TOYSHELF -- the Forgotten Nursery. "porcelain dolls on shelves", "a
       toy chest pushed to the edge": a picture-rail shelf of them at a child's
       eye level, the chests under it, and the nightlight's own little niche. */
    s += mmBand(q.y, 1.44, 1.56) * 0.88;                       // the shelf
    s += mmShelf(vec2(q.x, q.y), 1.56, 2.02, 1.0, 2.0, uSeed + 1.0);
    s += mmShelf(vec2(q.x + 0.21, q.y), 0.10, 0.92, 1.0, 2.0, uSeed + 5.0);
    s += mmBand(q.y, 2.44, 2.56) * 0.62;                       // the picture rail
    float nx = mod(q.x + 3.1, 6.2) - 3.1;
    s -= mmSolid(mmArch(vec2(nx, q.y - 1.72), 0.26, 0.42)) * 0.85;              // the nightlight niche
    s += (1.0 - smoothstep(0.030, 0.085, abs(mmArch(vec2(nx, q.y - 1.72), 0.26, 0.42)))) * 0.80;

  } else if (uSubject < 16.5) {
    /* 16  RANGE -- the Kitchens and Cellars. "iron ovens", "copper pots", "jam
       jars and candy jars on shelves". */
    float i = floor(q.x/5.40), rx = q.x - (i + 0.5)*5.40;
    float rg = mmSolid(mmBox(vec2(rx, q.y - 0.62), vec2(1.30, 0.62), 0.03));
    s += rg * 0.80;
    s += (1.0 - smoothstep(0.030, 0.075, abs(mmCircle(vec2(rx + 0.52, q.y - 0.56), 0.30)))) * 0.85;
    s += (1.0 - smoothstep(0.030, 0.075, abs(mmBox(vec2(rx - 0.56, q.y - 0.58), vec2(0.34, 0.26), 0.03)))) * 0.75;
    s += mmSolid(mmBox(vec2(rx, q.y - 2.28), vec2(1.10 + (2.10 - q.y)*0.28, 0.10), 0.03)) * 0.90;  // the hood
    s += mmBand(q.y, 1.94, 2.06) * 0.72;                       // the pot rail
    s += mmSolid(mmCircle(vec2(mmRowX(q.x, 0.50), q.y - 1.70), 0.175)) * 0.80;  // the pots on it
    s += mmShelf(q, 2.62, 3.36, 1.0, 1.0, uSeed + 2.0);        // and the jars above

  } else {
    /* 17  HEARTH -- the Heart of the House. "shelves of carefully kept
       belongings from every wing, a hearth". One fireplace, dead centre, and it
       is the only room in the house with a mantel. */
    float jam = mmSolid(mmBox(vec2(ax - 1.42, q.y - 1.16), vec2(0.30, 1.16), 0.03));
    s += jam * 0.85;
    s += mmSolid(mmBox(vec2(cx, q.y - 2.44), vec2(1.96, 0.16), 0.04)) * 1.00;   // the mantel
    s += mmSolid(mmBox(vec2(cx, q.y - 2.16), vec2(1.72, 0.14), 0.03)) * 0.70;   // the frieze
    s -= mmSolid(mmArch(vec2(cx, q.y - 0.10), 0.98, 1.10)) * 1.45;              // the firebox
    s += (1.0 - smoothstep(0.040, 0.110, abs(mmArch(vec2(cx, q.y - 0.10), 1.10, 1.22)))) * 0.70;
    s += mmShelf(vec2(q.x, q.y), 2.60, 3.10, 1.0, 1.0, uSeed + 9.0)
       * (1.0 - smoothstep(1.60, 2.00, ax));                   // what is ON the mantel
    s += mmShelf(vec2(q.x, q.y), 0.50, 2.90, 5.0, 2.0, uSeed + 4.0)
       * smoothstep(2.10, 2.55, ax);                           // and the shelves either side
    occ = clamp(jam + mmBand(q.y, 2.16, 2.60) + mmSolid(mmArch(vec2(cx, q.y - 0.10), 1.10, 1.22)),
                0.0, 1.0);
  }
  /* Everything with real relief in it covers the wall it stands against. Set
     explicitly above wherever the shape has a hollow that has to go dark on its
     own account; generic here, because a shelf of jars hides exactly the wall
     the jars are on. Outdoors it means something else and just as useful: the
     moonlight the exterior mode puts on its masonry stops at the IRONWORK, so a
     railing stays a dark railing in front of a lit house. */
  occ = clamp(mix(max(occ, smoothstep(0.12, 0.46, abs(s))), occ, occSet), 0.0, 1.0) * fade;
  return s * fade;
}

/* Relief height field, in metres of apparent depth. One branch per mode. */
float wallH(vec2 q, out float occ){
  float h = mmNoise(q*2.3 + uSeed)*0.14;   // one octave: this runs 3x per pixel
  /* The region's SUBJECT, taken first, because a mode feature that would land
     on top of it has to get out of its way: the Foyer's hung portraits used to
     land across the middle of the staircase, three overlapping outlines deep,
     and the chair rail ran straight through the balusters. */
  occ = 0.0;
  float sub = subjectH(q, uFar, occ);
  float clear = 1.0 - occ;

  if (uArch < 0.5) {
    // ---- PANEL: wainscot, chair rail, tall stiles, crown, arched doorway ----
    float wain = smoothstep(1.06, 1.02, q.y);
    vec2 qw = vec2(mod(q.x + uSeed*0.7, 1.30) - 0.65, q.y - 0.58);
    h -= wain * (1.0 - smoothstep(-0.02, 0.05, mmBox(qw, vec2(0.44,0.33), 0.06))) * 0.55 * clear;
    h += smoothstep(1.04, 1.08, q.y) * smoothstep(1.26, 1.22, q.y) * 1.20 * clear;   // chair rail
    h += smoothstep(0.20, 0.16, q.y) * 0.85 * clear;                                 // baseboard
    vec2 qu = vec2(mod(q.x + uSeed*0.7, 2.60) - 1.30, q.y - 3.30);
    float up = smoothstep(1.30, 1.42, q.y);
    h -= up * (1.0 - smoothstep(-0.02, 0.06, mmBox(qu, vec2(0.92,1.55), 0.09))) * 0.64 * clear;
    h += smoothstep(uCeil-0.35, uCeil-0.20, q.y) * smoothstep(uCeil+0.35, uCeil+0.15, q.y) * 1.10;
    /* Framed portraits, hung IN a panel and not across two. Their repeat used
       to be 6.2 m against the panels' 2.6, so a frame landed on a stile as
       often as on a field and the wall came back as a jumble of concentric
       rectangles -- three overlapping outlines in the middle of the Foyer. A
       painting hangs on the panel. */
    /* ...and when the room's subject is the staircase they hang ABOVE the
       flights, either side of the landing window, which is where a Victorian
       hall actually hangs them. */
    float py = 3.55 + step(0.5, uSubject)*step(uSubject, 1.5)*2.70;
    float fx = mod(q.x + uSeed*0.7, 7.80) - 3.90;
    float inner = mmBox(vec2(fx, q.y - py), vec2(0.62, 0.86), 0.03);
    float outer = mmBox(vec2(fx, q.y - py), vec2(0.80, 1.04), 0.05);
    float onWall = smoothstep(1.55, 1.75, q.y) * smoothstep(uCeil-0.5, uCeil-0.9, q.y) * clear;
    h += onWall * (smoothstep(0.03, -0.03, outer) - smoothstep(0.03, -0.03, inner)) * 1.5;
    h -= onWall * smoothstep(0.02, -0.02, inner) * 0.45;
    float a = archSD(q);
    h += (1.0 - smoothstep(0.0, 0.14, abs(a))) * 1.40;                       // arch moulding
    h -= smoothstep(0.02, -0.02, a) * 4.0;                                   // the opening

  } else if (uArch < 1.5) {
    // ---- GLASS: mullioned conservatory / bathhouse glazing ------------------
    float mx = abs(fract(q.x/1.05 + 0.5) - 0.5) * 1.05;
    float my = abs(fract((q.y-0.9)/1.35 + 0.5) - 0.5) * 1.35;
    /* The glazing stops behind what stands in front of it. A mullion grid drawn
       straight through the Greenhouse's planting benches and the Bathhouse's
       tiled dado is two systems over one another -- the same mesh the Crypt's
       coursing made over its bones. */
    h += (1.0 - smoothstep(0.035, 0.085, mx)) * 1.05 * clear;
    h += (1.0 - smoothstep(0.030, 0.075, my)) * 0.85 * clear;
    h += (1.0 - smoothstep(0.05, 0.16, abs(q.y - 0.90))) * 0.9 * clear;      // sill
    h += mmFbm3(q*2.4 + uTime*0.02)*0.40;                                    // condensation

  } else if (uArch < 2.5) {
    // ---- STONE: coursed blocks with recessed niches -------------------------
    float row = floor(q.y/0.52);
    float off = mod(row, 2.0)*0.62 + mmHash11(row+uSeed)*0.30;
    float bx = abs(fract((q.x+off)/1.24 + 0.5) - 0.5) * 1.24;
    float by = abs(fract(q.y/0.52 + 0.5) - 0.5) * 0.52;
    /* The joints stop where the subject is. A course drawn straight through the
       back of an ossuary niche put a black grid over the bones, and the two
       systems together were a mesh -- the Crypt's ink depth measured WORSE with
       the niches in than without them. And 0.85 of relief in a 2-7 cm joint is
       a chasm now the recess/face range is 2.7:1: mainMenu.png's masonry has a
       fine dark line round each stone, not black mortar three pixels wide. */
    h -= (1.0 - smoothstep(0.015, 0.055, bx)) * 0.58 * clear;
    h -= (1.0 - smoothstep(0.015, 0.050, by)) * 0.58 * clear;
    h += mmFbm3(q*4.2 + row)*0.50 * (0.35 + 0.65*clear);
    /* The mode's own bare niche, every 7.6 m -- superseded wherever the region
       names a subject, because both stone regions now draw their own (the
       Crypt's ossuary shelves, the Passages' studwork) and two niche systems on
       one wall is the concentric-outline failure again. */
    float nx = mod(q.x + 2.1, 7.6) - 3.8;
    float nb = mmArch(vec2(nx, q.y - 1.10), 0.48, 1.35);
    float bare = 1.0 - step(0.5, uSubject);
    h -= smoothstep(0.03, -0.03, nb) * 1.7 * bare;
    h += (1.0 - smoothstep(0.0, 0.11, abs(nb))) * 0.85 * bare;

  } else if (uArch < 3.5) {
    // ---- FOLIAGE: hedge / canopy mass ---------------------------------------
    vec2 w = mmWarp(q*0.35, 0.30, 1.1);
    float mass = mmRidge(w*1.5 + uSeed)*0.95 + mmFbm3(w*4.0)*0.5;
    float top = 3.7 + mmFbm3(vec2(q.x*0.42 + uSeed, 0.0))*2.4;
    h += mass * smoothstep(top+0.7, top-2.0, q.y);
    h += mmFbm3(q*6.5)*0.32;

  } else if (uArch < 4.5) {
    // ---- INDUSTRIAL: rafters, pipes, hanging lamp rails ---------------------
    float px = abs(fract(q.x/2.4 + 0.5) - 0.5) * 2.4;
    h += (1.0 - smoothstep(0.11, 0.21, px)) * 1.05 * clear;                  // uprights
    h += (1.0 - smoothstep(0.08, 0.18, abs(q.y - uCeil*0.74))) * 1.15 * clear;  // top rail
    h += (1.0 - smoothstep(0.06, 0.14, abs(q.y - uCeil*0.40))) * 0.70 * clear;  // mid rail
    float bx = mod(q.x, 2.4) - 1.2;
    h += (1.0 - smoothstep(0.0, 0.10, abs(mmCircle(vec2(bx, q.y-uCeil*0.74), 0.32)))) * 0.95 * clear;
    h += mmFbm3(q*3.6 + uSeed)*0.32;

  } else {
    // ---- EXTERIOR: the house's skyline, and a treeline in front of it --------
    // Only the silhouette matters here; the sky is painted in the colour pass.
    float cx = q.x - uSize.x*0.5;
    /* THE HOUSE. Two smoothstep humps and an fbm is a hill, which is what the
       Graveyard and the Pumpkin Grounds have been showing. mainMenu.png's
       house is towers with pitched roofs, spires and finials, and the eye
       reads that sequence and not the outline -- so it is drawn as one.
       A smoothstep hump is STILL a hill, though, however many towers stand on
       it: the two wings are BLOCKS now, with the vertical ends and the flat
       eaves line a building has, and the hump only survives as the slight
       swell of the fbm along the ridge. */
    float body = 2.0 + max((1.0 - step(9.6, abs(cx - 3.4))) * 2.55,
                           (1.0 - step(6.2, abs(cx + 2.6))) * 3.85);
    // the wings' pitched roofs
    float roof = body + max(0.0, 2.15 - abs(cx + 2.6)*0.62);
    // towers on a 7.4 m repeat, each with its own height and a conical cap
    float tw = mod(cx + uSeed*2.3 + 3.7, 7.4) - 3.7;
    float tid = floor((cx + uSeed*2.3 + 3.7) / 7.4);
    float th = 1.15 + 1.35*mmHash11(tid*4.7 + uSeed);
    float tower = (body + th) * (1.0 - smoothstep(0.62, 0.95, abs(tw)));
    tower += max(0.0, (1.20 - abs(tw)*1.85)) * step(abs(tw), 0.95);   // the cap
    roof = max(roof, tower);
    // a finial on each cap, and a ridge of small ones along the body
    roof = max(roof, (body + th + 1.32) * (1.0 - smoothstep(0.05, 0.11, abs(tw))));
    roof += 0.10 * mmFbm3(vec2(cx*0.9 + uSeed, 0.0));
    h += smoothstep(roof + 0.18, roof - 0.18, q.y) * 1.4;
    /* THE TREELINE: firs, each with a trunk and a pointed crown, at their own
       spacing. A band of ridged noise reads as a hedge at best and as nothing
       at this distance, which is what it did. */
    float sp = 1.55;
    float fx2 = mod(cx + uSeed*5.1 + sp*0.5, sp) - sp*0.5;
    float fid = floor((cx + uSeed*5.1 + sp*0.5) / sp);
    float fh = 1.75 + 1.35*mmHash11(fid*8.3 + uSeed*3.0);
    float fw = 0.34 + 0.16*mmHash11(fid*2.9 + uSeed);
    // crown: a cone, its half-width falling to nothing at the tip
    float crown = fh * (1.0 - clamp(abs(fx2)/fw, 0.0, 1.0));
    crown += 0.09 * mmFbm3(vec2(fx2*7.0 + fid, q.y*3.0));      // ragged needles
    float trunk = 0.30 * (1.0 - smoothstep(0.035, 0.07, abs(fx2)));
    h += smoothstep(crown + 0.10, crown - 0.10, q.y) * 0.7;
    h += smoothstep(trunk + 0.05, trunk - 0.05, q.y) * 0.7;
    /* A STRING COURSE and QUOINS on the wings. The house is a black silhouette
       with lit windows in it, and mainMenu.png's is not: its masonry carries a
       banded course at each floor and dressed stone up every corner, and those
       lines are half of why it reads as built rather than cut out. */
    float onBody = smoothstep(body - 0.20, body - 0.55, q.y) * smoothstep(1.7, 2.3, q.y);
    h += onBody * (mmBand(q.y, 4.32, 4.46) + mmBand(q.y, 6.20, 6.34)) * 0.55;
    float quoin = max(1.0 - smoothstep(0.26, 0.52, abs(abs(cx + 2.6) - 6.20)),
                      1.0 - smoothstep(0.26, 0.52, abs(abs(cx - 3.4) - 9.60)));
    h += onBody * quoin * (1.0 - smoothstep(0.016, 0.042, mmRowX(q.y, 0.62))) * 0.45;
    /* COURSED MASONRY. Now that the moonlight gives this mode something to draw
       ON, the house can be BUILT of something: mainMenu.png's is visible blocks
       with a fine dark line round each, and ours was a smooth mass with a band
       at each floor level. */
    float crow = floor(q.y/0.62);
    float cbx = abs(fract((q.x + mod(crow, 2.0)*0.55 + uSeed)/1.10 + 0.5) - 0.5)*1.10;
    h -= onBody * ((1.0 - smoothstep(0.013, 0.038, cbx))
                 + (1.0 - smoothstep(0.013, 0.034, mmRowX(q.y, 0.62)))) * 0.36;
    /* WINDOW SURROUNDS. The lit panes are painted in the colour pass and had no
       relief at all, so forty windows carried not one drawn line between them.
       A window of this house has a dressed stone surround and a sill. */
    vec2 wq2 = vec2(mod(q.x + uSeed, 2.30) - 1.15, mod(q.y + 0.35, 1.85) - 0.925);
    float pa2 = mmArch(wq2 - vec2(0.0, -0.34), 0.20, 0.42);
    h += onBody * (1.0 - smoothstep(0.040, 0.105, abs(pa2))) * 0.62;
    h -= onBody * smoothstep(0.02, -0.02, pa2) * 0.50;
    /* IVY. Every elevation in mainMenu.png carries it, and it is most of what
       stops a masonry wall reading as a flat. */
    /* Stretched along Y, not X: at 1.15 across and 0.60 up the mass came out in
       horizontal streaks and the front of the house read as SCAFFOLDING. Ivy
       climbs. */
    float ivy = mmFbm3(vec2(q.x*0.62, q.y*1.75) + uSeed*3.0);
    h += onBody * smoothstep(0.56, 0.90, ivy) * smoothstep(8.5, 1.8, q.y) * 0.58;
  }
  return h + sub;
}

/* Night sky used by the exterior mode: gradient, stars, moon and its halo. */
vec3 skyColor(vec2 q, float horizon){
  vec2 c = vec2(q.x - uSize.x*0.5, q.y);
  /* The sky's gradient and the moon's height are fixed in METRES, not in
     fractions of the plane: 15 m and 12.6 m are what the old 17 m plane gave,
     so this is the same sky -- and a taller plane (which is what stops the
     clear colour showing above it) can no longer stretch the gradient or push
     the moon out of frame. */
  float up = clamp((q.y - horizon) / 15.0, 0.0, 1.0);
  vec3 sky = mix(uOpenGlow, uDeep, smoothstep(0.0, 0.85, up));
  /* CLOUD BANKS. mainMenu.png's sky is not a gradient -- it has soft banks of
     cloud in it, lighter toward the horizon where the town glow catches them,
     and that is the one thing that stops a gradient reading as a gradient.
     Two scales, stretched flat, drifting slowly. */
  vec2 cq = vec2(c.x*0.16 + uTime*0.004, (q.y - horizon)*0.42);
  float bank = mmFbm3(cq + uSeed) * 0.72 + mmFbm3(cq*2.7 - uSeed) * 0.28;
  float cloud = smoothstep(0.42, 0.78, bank) * smoothstep(0.03, 0.30, up)
              * (1.0 - smoothstep(0.55, 1.0, up)*0.55);
  sky = mix(sky, mix(uDeep*1.5, uOpenGlow*0.95, 0.45 + 0.55*(1.0-up)), cloud*0.62);
  /* STARS, and they are POINTS. A cell hash through a smoothstep fills the
     whole cell, so every star in the game was an eight-pixel grey SQUARE --
     dozens of them across the Graveyard's and the Pumpkin Grounds' sky, and
     they have been there since the mode was written. Each cell now places one
     round point somewhere inside itself, at its own size, and the brightest
     get the small cross a lens leaves. */
  vec2 sp = c * 2.6;
  vec2 sid = floor(sp);
  float sh = mmHash21(sid);
  vec2 soff = mmHash22(sid + 3.7);
  vec2 sdv = fract(sp) - clamp(soff, 0.18, 0.82);
  float mag = smoothstep(0.972, 1.0, sh);
  float rad = 0.055 + 0.075*mag;
  float point = 1.0 - smoothstep(rad*0.45, rad, length(sdv));
  float flare = (1.0 - smoothstep(0.0, rad*0.35, abs(sdv.x)))
              * (1.0 - smoothstep(0.0, rad*3.2, abs(sdv.y)))
              + (1.0 - smoothstep(0.0, rad*0.35, abs(sdv.y)))
              * (1.0 - smoothstep(0.0, rad*3.2, abs(sdv.x)));
  float star = mag * (point + flare*0.28*step(0.992, sh));
  float tw = 0.55 + 0.45*sin(uTime*1.7 + sh*40.0);
  sky += vec3(0.9, 0.94, 1.0) * star * tw * 1.15 * smoothstep(0.0, 0.25, up)
       * (1.0 - cloud*0.85);
  /* The moon. It kept its disc and its craters, but at 1.85 over a sky at
     uGain it clipped to a white hole, and exp(-md*0.34) put a halo a third of
     the frame wide round it. A moon has a small, bright, CRATERED disc and a
     halo about three times its own width. */
  /* Anchored 6 m left of centre, not at 0.30 of the plane: the plane is as
     wide as the camera needs and that is not a property of the scene. */
  vec2 mc = vec2(uSize.x*0.5 - 6.0, 12.6);
  float md = length(vec2(q.x, q.y) - mc);
  float disc = smoothstep(1.26, 1.14, md);
  float crater = 0.72 + 0.28*mmFbm3((vec2(q.x,q.y) - mc)*3.4);
  // the limb darkens, the way a lit sphere does
  float limb = 0.72 + 0.28*sqrt(max(1.0 - md*md/1.60, 0.0));
  sky += vec3(1.0, 0.97, 0.88) * disc * 0.92 * crater * limb;
  sky += vec3(0.80, 0.86, 1.0) * exp(-md*1.05) * 0.30;
  sky += vec3(0.80, 0.86, 1.0) * exp(-md*0.30) * 0.055;   // the faintest bloom
  return sky;
}

void main(){
  vec2 q = vUv * uSize;                     // metres, origin at floor-left

  /* One relief evaluation, not three. The old code sampled wallH() at three
     offsets for a finite-difference normal; wallH() carries six architecture
     branches, so the compiler inlined all six THREE times and the program took
     seconds to link. Screen-space derivatives give the same normal from one
     sample, and they also flatten the relief at grazing angles, which kills the
     shimmer the finite difference used to produce on the far wall. */
  float sOcc = 0.0;
  float h  = wallH(q, sOcc);
  vec2  dq = vec2(max(abs(dFdx(q.x)), 1e-4), max(abs(dFdy(q.y)), 1e-4));
  vec2  gh = vec2(dFdx(h), dFdy(h)) / dq;
  vec3  nrm = normalize(vec3(-gh * 0.05, 0.42));

  // ---- albedo ---------------------------------------------------------------
  float up = clamp(q.y/max(uCeil, 1.0), 0.0, 1.0);
  vec3 alb = mix(uDeep, uMid, smoothstep(0.0, 0.80, up));
  alb = mix(alb, uHi, smoothstep(0.55, 1.02, up)*0.62);
  alb += uAlbLift;

  float motif = mmFbm3(q*0.52 + uSeed*3.0);
  alb *= 0.78 + 0.46*motif;                                 // the surface's own drift

  /* ---- the wallpaper -----------------------------------------------------
     Drawn, not lit: it modulates albedo and hue and never enters wallH, because
     relief where the wallpaper is would light the pattern like plasterwork.
     Thinned by the same grime field that dirties the wall, so it wears off
     round the corners rather than tiling evenly to the edges. */
  if (uDamask > 0.001) {
    float qpx = max(max(abs(dFdx(q.x)), abs(dFdy(q.y))), 1e-4);
    vec2 dm = mmDamask(q + vec2(uSeed*1.7, 0.0), uDamCell, qpx, uDamKind);
    float wear = smoothstep(0.10, 0.62, mmFbm3(q*0.21 + uSeed*5.0));
    /* ...and it stops at the room's subject. A paper hung behind a staircase is
       BEHIND it: printing the fleur over the balusters and up the spandrel is
       what made the first staircase look like a decal on the wallpaper. */
    float amt = uDamask * (0.45 + 0.55*wear) * (1.0 - sOcc*0.94);
    /* The motif is its OWN colour, keyed to the wall's level rather than
       tinted from it: in the samples the scrollwork is a saturated purple
       sitting a little above a near-black plum ground, and multiplying the
       wall by a near-unit tint (the first attempt) is invisible. */
    vec3 dcol = uDamHue * (0.05 + 3.30*mmLum(alb));
    alb = mix(alb, dcol, dm.x * amt);
    alb *= 1.0 - dm.y * amt * 0.62;
  }

  /* ---- a recess is darker than the face it is cut into -------------------
     The relief only reached the shading through the normal, and the flat floor
     of a recess has the same normal as the wall, so a panel 42 cm deep was the
     same value as the stile beside it and the panelling read as a wireframe
     drawing. This is the occlusion that makes it joinery: clamped, because the
     arch's opening is -4 of relief and would otherwise take the whole term. */
  float aoH = clamp(h, -1.15, 1.60);
  /* 0.58-1.06 is a 1.8:1 range, and a room whose whole subject is DRAWN needs
     more than that: measured, the Crypt's new ossuary niches made ink depth
     WORSE (0.035 -> 0.025) because a 1.35 m recess and the wainscot panel next
     to it came out the same value, and looked it. 2.7:1 is what separates a
     stair's spandrel from the panelling behind it. The top end goes up with the
     bottom so the crests keep their loaded stroke and the room does not just
     get darker. */
  alb *= mix(0.42, 1.12, smoothstep(-0.85, 0.85, aoH));

  float grime = mmFbm3(q*0.30 - uSeed);
  float corner = smoothstep(1.6, 0.0, q.y)*0.7
               + smoothstep(uSize.x*0.34, 0.0, q.x)
               + smoothstep(uSize.x*0.66, uSize.x, q.x);
  alb *= mix(1.0, clamp(0.54 + 0.58*grime - 0.26*corner, 0.0, 1.4), uGrime);

  // ---- lighting -------------------------------------------------------------
  vec3 V = normalize(uCamera - vWorld);
  vec3 col = alb * (uAmbient + uAccent * uCool * 0.11 * (0.30 + 0.70*max(nrm.y, 0.0)));

  for (int i = 0; i < 5; i++){
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec2 d = q - L.xy;
    float dist = length(d);
    float att = mmAtten(dist, L.z, L.w);
    vec3 ldir = normalize(vec3(-d, 3.0));         // toward the light, out of the wall
    float ndl = mmWrapNdL(nrm, ldir, 0.35);
    col += alb * uLightCol[i] * att * (0.12 + 1.15*ndl);
    col += mmSpec(nrm, ldir, V, uLightCol[i], att, uGloss*0.55, 22.0);
  }

  col *= uGain;

  // ---- the doorway breathes cold light from the next room -------------------
  if (uArch < 0.5) {
    float a = archSD(q);
    float inside = smoothstep(0.02, -0.06, a);
    /* A DOORWAY IS A HOLE. The old fill painted uOpenGlow over the whole
       opening at uGain*1.15, which put a flat slab of saturated cyan in the
       middle of the Foyer's far wall -- the loudest and least painted thing in
       the room. What is actually visible through a door is: darkness, a strip
       of lit floor a few metres beyond it, and a little of that light bouncing
       up the jamb. */
    float far = smoothstep(2.30, 0.10, q.y);          // the floor beyond
    float sill = smoothstep(0.62, 0.10, q.y);         // and its near edge
    vec3 beyond = uDeep * 0.16 * uGain
                + uOpenGlow * uGain * uOpen * (far*far*0.34 + sill*0.30);
    col = mix(col, beyond, inside);
    /* the jamb: its own shadow just inside the opening, and the arch
       moulding catching the spill just outside it */
    col *= 1.0 - inside * (1.0 - smoothstep(0.0, 0.16, -a)) * 0.55;
    col += uOpenGlow * uGain * uOpen * 0.11
         * smoothstep(1.30, 0.0, abs(a)) * (1.0 - inside)
         * (0.35 + 0.65*smoothstep(3.2, 0.2, q.y));
  }

  /* ---- the Foyer's landing window --------------------------------------
     The room's subject can be a thing the light comes THROUGH, and then the
     relief alone will not do: glazing is not a surface, it is an opening with
     the night behind it. Kept deliberately low -- the combat board's intent row
     crosses this band of the frame, and a bright window there is the one thing
     the prompt pack said an interior must not put in it. */
  if (uSubject > 0.5 && uSubject < 1.5 && uFar > 0.5) {
    float cxw = q.x - uSize.x*0.5;
    float wd  = mmArch(vec2(cxw, q.y - 4.95), 1.06, 1.42);
    float glass = mmSolid(wd + 0.095);
    float mull = max((1.0 - smoothstep(0.028, 0.058, mmRowX(cxw + 0.355, 0.71))),
                     mmBand(q.y, 6.06, 6.14));
    vec3 night = mix(uOpenGlow, vec3(0.62, 0.72, 0.95), 0.45);
    col = mix(col, night * uGain * 0.052, glass * (1.0 - mull*0.85));
    col += night * uGain * 0.030 * glass * (1.0 - mull)
         * (0.45 + 0.55*smoothstep(4.95, 6.60, q.y));
    // and the little of it that falls on the reveal and the sill below
    col += night * uGain * 0.016 * (1.0 - glass)
         * smoothstep(0.95, 0.0, abs(wd)) * smoothstep(3.30, 4.95, q.y);
  }

  // ---- exterior: everything above the roofline is sky ------------------------
  if (uArch > 4.5) {
    float solid = smoothstep(0.25, 0.85, h);
    col = mix(skyColor(q, 2.0), col, solid);
    // lit windows punched into the mass, with real spill onto the masonry
    vec2 wq = vec2(mod(q.x + uSeed, 2.30) - 1.15, mod(q.y + 0.35, 1.85) - 0.925);
    float pane = mmArch(wq - vec2(0.0, -0.34), 0.20, 0.42);
    float onHouse = solid * smoothstep(0.6, 1.1, q.y) * step(mmHash21(floor((q + uSeed)/vec2(2.30,1.85))), 0.52);
    float lit = smoothstep(0.02, -0.03, pane) * onHouse;
    /* A LIT WINDOW IS A LAMP. uOpenGlow is the colour of what is beyond a
       DOORWAY, and in the Graveyard and the Pumpkin Grounds that is a cold moon
       blue -- so the forty warm gold windows of mainMenu.png's house came out as
       rows of small blue-white rectangles, the one warm thing in the reference
       turned cold. The doorway keeps uOpenGlow; a window gets somebody's lamp. */
    vec3 winCol = mix(uOpenGlow, vec3(1.00, 0.70, 0.34), 0.66);
    col += winCol * lit * 3.1 * uOpen;
    col += winCol * onHouse * uOpen * 1.05 * exp(-max(pane, 0.0)*4.2) * (1.0 - lit);
    /* MOONLIGHT ON THE MASONRY. Nothing in the light rig reaches a plane 32 m
       away -- every lamp in the Graveyard is inside 12 m with a 16 m radius --
       so the house was lit by uAmbient alone and came out as a flat black
       cut-out with warm windows punched in it. mainMenu.png's house is LIT
       STONE: you can read its string courses, its window heads, its quoins and
       its ivy, and that is most of what makes it a painting instead of a
       silhouette. One directional term off the relief normal does it, and it is
       what finally gives this mode's drawn lines something to be drawn ON.
       It stops at the ironwork, which is how a railing stays a railing. */
    vec3 moonlit = mix(uOpenGlow, vec3(0.74, 0.82, 1.00), 0.58);
    col += alb * moonlit * solid * (1.0 - sOcc*0.80)
         * (0.42 + 0.95*max(nrm.y, 0.0) + 0.30*max(-nrm.x, 0.0)) * 1.55 * uGain;
  }

  // ---- ceiling falls away into darkness -------------------------------------
  if (uArch < 4.5) {
    col *= mix(1.0, 0.10, smoothstep(uCeil, uCeil + 2.4, q.y));
    col *= mix(0.42, 1.0, smoothstep(0.0, 1.6, q.y));            // grounded base shadow
    col *= mix(0.58, 1.0, smoothstep(uCeil, uCeil - 1.5, q.y));  // shadow under the cornice
  }

  // ---- the drawn line -------------------------------------------------------
  // Mouldings, panel frames, courses, mullions and the arch: every one of them
  // is a step in wallH, and every step now carries ink in its hollow and one
  // stroke of light on its crest. Before this, a panel frame across the room
  // was a hairline of slightly different value, which is exactly how a CAD
  // drawing renders a moulding.
  /* Same guard as the floor's: a side wall at a grazing angle packs a whole
     panel into a pixel, and inking a form finer than a pixel draws bands. */
  float wDraw = smoothstep(0.40, 0.08, max(dq.x, dq.y));
  vec2 drawn = mmDrawn(h, 0.030, 0.26) * wDraw;
  col *= 1.0 - drawn.x * uInk;
  col += col * drawn.y * uLip;

  // ---- painterly break-up + depth fog ---------------------------------------
  col *= 0.90 + 0.20*motif;
  col = mix(col, uFog, uFogAmt * (0.50 + 0.50*smoothstep(6.0, 0.0, q.y)));
  col = mmDesat(col, uDread*0.55) * (1.0 - uDread*0.30);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* -------------------------------------------------------------- floor/ceiling */

export const FLOOR_VERT = /* glsl */`
varying vec2 vUv;
varying float vDepth;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const FLOOR_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
${LIGHT_LIB}
uniform float uTime, uSeed, uDread, uFogNear, uFogFar, uGloss, uPattern, uGain, uAlbLift;
uniform float uInk, uLip, uWet;
uniform vec2  uSpan;           // plane size in metres (x, z)
uniform vec3  uDeep, uMid, uFog, uAccent, uAmbient;
uniform vec4  uLights[5];      // xy = floor-local metres (x, z), z radius, w intensity
uniform vec3  uLightCol[5];
uniform vec4  uPool[4];        // xy = floor-local metres, z = radius, w = intensity
uniform vec4  uPoolAxis[4];    // xy = elongation direction, z = stretch, w unused
uniform vec3  uPoolCol[4];
uniform vec3  uCamera;
uniform float uIsCeiling;
varying vec2  vUv;
varying float vDepth;
varying vec3  vWorld;

void main(){
  vec2 w = (vUv - 0.5) * uSpan;

  /* METRES PER PIXEL, from the plane's own screen derivatives. Every joint,
     course and mullion below is drawn at least a pixel and a half wide in
     terms of this, because a joint is a LINE A HAND DREW: a 2.5 cm mortar
     course 20 m away is a fifth of a pixel of geometry, and authoring it that
     way is why the far half of every floor in the house was blank. */
  vec2 mpp = vec2(length(vec2(dFdx(w.x), dFdy(w.x))),
                  length(vec2(dFdx(w.y), dFdy(w.y))));
  /* A drawn line's width is in pixels AND it is bounded. mp runs away toward
     the horizon on a plane seen at a grazing angle, so an unbounded joint
     width does not make the far joints finer, it makes them infinitely wide
     and washes the whole far floor blank. jw is one and a half pixels of
     joint, never thinner than the authored line and never more than four
     times it. */
  float mp = clamp(max(mpp.x, mpp.y), 1e-5, 1e3);
  float jw = clamp(mp*1.6, 0.0, 0.16);
  /* cellv is the stone's own identity: a hash that is constant across one
     slab, board or pane and jumps at its joint. Half of what makes selectKid's
     floor read as a floor is that no two flags are the same value, and five of
     the nine patterns here had no such number at all. */
  float cellv = 0.5;

  float pat = 0.0;
  if (uPattern < 0.5) {                      // 0 planks
    float row = floor(w.y/0.95);
    float ox  = mmHash11(row+uSeed)*2.0;
    /* Boards of unequal width, laid with a wandering joint and worn at their
       ends: a floor of identical 1.45 m planks with ruled joints is the tell
       that reads as CG however well it is lit. */
    float bw  = 1.45 + (mmHash11(row*5.1 + uSeed)-0.5)*0.34;
    float bx  = (w.x + ox) / bw;
    float wob = (mmNoise(vec2(w.y*1.7, row*3.3) + uSeed) - 0.5) * 0.055;
    float jx = abs(fract(bx + 0.5 + wob) - 0.5)*bw;
    float jy = abs(fract(w.y/0.95 + 0.5) - 0.5)*0.95;
    pat  = (1.0 - smoothstep(0.012, max(0.050, jw), jx)) * 0.60;
    pat += (1.0 - smoothstep(0.012, max(0.045, jw), jy)) * 0.35;
    pat = 0.55 - pat;
    cellv = mmHash11(floor(bx)*13.1 + row*29.7 + uSeed);
    /* the ends of a board darken where feet have crossed the joint */
    pat -= (1.0 - smoothstep(0.0, 0.40, jy)) * 0.10;
  } else if (uPattern < 1.5) {               // 1 checker tile
    vec2 t = floor(w/0.78);
    pat = mod(t.x + t.y, 2.0)*0.62;
    float gx = abs(fract(w.x/0.78 + 0.5) - 0.5)*0.78;
    float gy = abs(fract(w.y/0.78 + 0.5) - 0.5)*0.78;
    pat -= (1.0 - smoothstep(0.008, max(0.026, jw), min(gx, gy)))*0.45;
    cellv = mmHash11(t.x*7.7 + t.y*23.3 + uSeed);
  } else if (uPattern < 2.5) {               // 2 irregular flagstone
    /* Flags at 0.95 x 0.70 m, not 1.45 x 1.00: at the camera's distance the
       old cell was 185 px across and read as a slab, where selectKid's flags
       are 60-90 px and read as paving.

       The grid WANDERS, and it has to wander by warping the coordinate, not by
       nudging the distance: adding the wobble to min(g, 1-g) after the fract
       can drive the distance negative, which floods the joint over the whole
       stone -- the first attempt did exactly that, and the flagstone floors
       came back as blank bands with no joints in them at all. */
    vec2 cell = vec2(0.95, 0.70);
    vec2 ww = w + vec2(mmNoise(w*0.62 + uSeed) - 0.5,
                       mmNoise(w*0.62 + 13.1) - 0.5) * 0.30;
    float row = floor(ww.y/cell.y);
    float ox  = mmHash11(row + uSeed)*cell.x;
    vec2 g  = vec2(fract((ww.x+ox)/cell.x), fract(ww.y/cell.y));
    vec2 id = vec2(floor((ww.x+ox)/cell.x), row);
    float slab = mmHash11(id.x*17.3 + id.y*31.7 + uSeed);
    float dx = min(g.x, 1.0-g.x)*cell.x;
    float dy = min(g.y, 1.0-g.y)*cell.y;
    float joint = 1.0 - smoothstep(0.018, max(0.055, jw*1.2), min(dx, dy));
    pat = (0.44 + 0.62*slab) - joint*0.95 + mmFbm3(w*2.6 + slab)*0.22;
    cellv = slab;
  } else if (uPattern < 3.5) {               // 3 coffered ceiling beams
    float bx = abs(fract(w.x/2.70 + 0.5) - 0.5)*2.70;
    float by = abs(fract(w.y/2.70 + 0.5) - 0.5)*2.70;
    pat = (1.0 - smoothstep(0.10, 0.34, min(bx, by)))*0.55
        + mmFbm3(w*1.3 + uSeed)*0.30;
  } else if (uPattern < 4.5) {               // 4 vaulted ribs
    float rib = abs(fract(w.y/3.10 + 0.5) - 0.5)*3.10;
    float arc = abs(w.x) * 0.16;
    pat = (1.0 - smoothstep(0.10, 0.42, rib))*0.70
        + (1.0 - smoothstep(0.35, 1.30, abs(w.x)))*0.35
        - arc*0.20 + mmFbm3(w*1.9 + uSeed)*0.22;
  } else if (uPattern < 5.5) {               // 5 glazed panes
    float gx = abs(fract(w.x/1.55 + 0.5) - 0.5)*1.55;
    float gy = abs(fract(w.y/1.55 + 0.5) - 0.5)*1.55;
    float bar = 1.0 - smoothstep(0.035, max(0.090, jw*1.3), min(gx, gy));
    pat = 0.95 - bar*0.75 + mmFbm3(w*3.2 + uSeed)*0.16;
    cellv = mmHash11(floor(w.x/1.55)*11.3 + floor(w.y/1.55)*19.1 + uSeed);
  } else if (uPattern < 6.5) {               // 6 exposed rafters + joists
    float jb = abs(fract(w.y/1.15 + 0.5) - 0.5)*1.15;
    pat = (1.0 - smoothstep(0.11, 0.26, jb))*0.80;
    pat += (1.0 - smoothstep(0.16, 0.40, abs(w.x)))*0.55;      // ridge beam
    pat = pat*0.9 - 0.25 + mmFbm3(w*2.2 + uSeed)*0.34;
  } else if (uPattern < 7.5) {               // 7 plaster rose + moulding
    float r = length(w);
    pat = (1.0 - smoothstep(0.9, 1.6, r))*0.85;
    pat += (1.0 - smoothstep(0.05, 0.22, abs(r - 2.4)))*0.55;
    pat += (1.0 - smoothstep(0.05, 0.22, abs(r - 3.6)))*0.40;
    float ray = abs(sin(atan(w.y, w.x)*8.0));
    pat += (1.0 - smoothstep(0.6, 1.0, ray)) * (1.0 - smoothstep(1.4, 2.4, r)) * 0.35;
    pat = pat*0.7 + 0.22 + mmFbm3(w*1.6 + uSeed)*0.22;
  } else {                                   // 8 industrial truss
    float bay = abs(fract(w.y/3.40 + 0.5) - 0.5)*3.40;
    float zig = abs(fract((w.x + w.y*0.9)/1.70 + 0.5) - 0.5)*1.70;
    pat = (1.0 - smoothstep(0.09, 0.22, bay))*0.75
        + (1.0 - smoothstep(0.06, 0.16, zig))*(1.0 - smoothstep(0.35, 1.4, bay))*0.55;
    pat = pat*0.9 - 0.18 + mmFbm3(w*2.6 + uSeed)*0.26;
  }

  vec3 alb = mix(uDeep, uMid, 0.24 + 0.78*mmFbm3(w*0.42 + uSeed));
  /* PER STONE. Value, and then hue: in selectKid's floor no two flags are the
     same colour either, some pulling warm and some plum, and that alone is
     most of the difference between a floor and a fill. */
  alb *= 0.74 + 0.52*cellv;
  alb = mix(alb, alb.zyx, (cellv - 0.5) * 0.16 + 0.08);
  alb *= 0.55 + 0.90*pat;
  alb += uAlbLift;
  alb *= mix(0.58, 1.0, smoothstep(uSpan.x*0.52, uSpan.x*0.24, abs(w.x)));   // creeps into shadow at the walls
  /* A tooth in SCREEN space: authored in metres it is 4 px at the camera's
     feet and a fifth of a pixel at the far wall, which is the spectrum the
     measurement found (0.049 at the 0.8 px octave against 0.28 for his
     flags). Two taps is enough here -- the post grade carries the ground's own
     tooth over the whole frame, and this is the stone's. */
  if (uIsCeiling < 0.5) {
    vec2 spx = vec2(gl_FragCoord.xy);
    /* The fine half is white noise, so it is one hash rather than an
       interpolated tap -- the same cut the post grade's tooth took after the
       perf A/B, and for the same reason. */
    float gritty = (mmHash21(floor(spx) + 11.3) - 0.5)*0.75
                 + (mmNoise(spx*0.52 + 41.7) - 0.5);
    alb *= 1.0 + gritty*0.30;
  }

  vec3 N = vec3(0.0, uIsCeiling > 0.5 ? -1.0 : 1.0, 0.0);
  vec3 V = normalize(uCamera - vWorld);
  vec3 col = alb * (uAmbient + uAccent * 0.09);
  /* FIX 6: DOES THE CEILING EARN THIS? A ceiling has no wet sheen, no mirror
     smear of a lamp pulled toward the camera, and no elliptical pool where a
     light shaft lands -- a shaft lands on the FLOOR. All three were being
     integrated up there anyway, five lights and four pools deep, each with its
     own fbm, and the answer was then multiplied by 0.085 of gain and by
     0.05-0.52 again for depth. None of it is visible and it was most of the
     1.5 ms the ceiling cost. */
  float ceilOnly = step(0.5, uIsCeiling);
  float smear = 0.55;
  if (uIsCeiling < 0.5) smear = 0.55 + 0.55*mmFbm3(w*1.4);

  for (int i = 0; i < 5; i++){
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec2 d = w - L.xy;
    float dist = length(d);
    float att = mmAtten(dist, L.z, L.w);
    col += alb * uLightCol[i] * att * 1.05;
    if (uIsCeiling > 0.5) continue;
    /* The wet-floor smear: a vertical mirror of every lamp, pulled toward the
       camera. At the Foyer's gloss of 0.62 it was the loudest thing on the
       floor -- and no sample has anything like it. Kept, because a flagged
       hall does hold a sheen, but at a quarter of its old weight and broken by
       the same smear field rather than laid on smooth. */
    float streak = exp(-abs(d.x)*smear) * exp(-max(d.y, 0.0)*0.30);
    col += alb * uLightCol[i] * att * streak * uGloss * 3.4 * uWet;
    vec3 ldir = normalize(vec3(-d.x, 3.0, d.y));
    col += mmSpec(N, ldir, V, uLightCol[i], att, uGloss*0.9, 30.0);
  }

  /* ---- shaft pools: the bright ellipse where a light shaft LANDS ----------
     Without this every shaft in the game faded out in mid-air and the floor
     underneath it was the same value as the floor two metres away. */
  for (int i = 0; i < 4; i++){
    vec4 P = uPool[i];
    if (P.w <= 0.001) continue;
    vec2 d = w - P.xy;
    vec2 ax = uPoolAxis[i].xy;
    float along = dot(d, ax) / max(uPoolAxis[i].z, 0.001);
    float across = d.x*ax.y - d.y*ax.x;
    float r = length(vec2(along, across)) / max(P.z, 0.001);
    float core = exp(-r*r*2.1);
    float spill = exp(-r*1.05) * 0.42;
    /* MEASURED, AND PUT BACK. Cutting the pools off the ceiling entirely took
       0.95 ms and also took the vault: on room-crypt the top band of the frame
       went from a mean of 23.7 to 0.46. Not darker -- GONE, because these
       pools were supplying nearly all the light up there, by accident, their
       centres being floor positions. What they cannot afford up there is the
       fbm: four mmFbm3 calls is twelve noise taps for a break-up nobody can
       see at 8.5% of gain. So the ellipses stay and the grain does not, which
       is most of the saving and none of the loss. */
    float grain = 0.95;
    if (uIsCeiling < 0.5) grain = 0.80 + 0.34*mmFbm3(w*1.7 + float(i)*7.3);
    col += uPoolCol[i] * P.w * (core*1.15 + spill) * grain * (0.16 + 0.84*mmLum(alb)*3.4) * 0.50;
  }

  /* Everything drawn on this surface needs the form to be RESOLVABLE. A floor
     or a ceiling seen nearly edge-on packs whole slabs into one pixel, so the
     pattern's gradient is large everywhere and inking it draws horizontal
     BANDS instead of joints -- which is what the Kitchens' rafters came back
     as. Below a pixel there is no line and no crumb to draw. */
  /* ...and the CEILING pays for none of it. It is the darkest part of the
     frame by design now, nothing drawn on it survives being 5% of its own
     gain, and it measured 1.56 ms of an 8.84 ms backdrop. */
  float drawable = smoothstep(0.34, 0.07, mp) * (1.0 - uIsCeiling);

  /* ---- what is ON the floor ----------------------------------------------
     selectKid's flags are covered in crumbs, and they are most of why that
     floor reads as a floor in a room somebody lives in. A sparse field of
     specks, placed in FLOOR metres so they stay put as the camera breathes and
     sized in pixels so they never alias into a shimmer. They take the light
     the floor already has, so a crumb only shows where something shines on it.

     Not the particle field: that is motes in the AIR. Nothing has ever been on
     the ground. */
  {
    vec2 gc = w * 3.4;
    vec2 gid = floor(gc);
    float gh = mmHash21(gid + 11.7);
    vec2 goff = mmHash22(gid + 5.3);
    float gr = max(mp * 1.1, 0.010) * 3.4;          // about a pixel across
    float speck = (1.0 - smoothstep(gr*0.4, gr, length(fract(gc) - clamp(goff, 0.2, 0.8))))
                * smoothstep(0.86, 0.995, gh);
    // a second, finer scatter of dust that only shows in the pools
    vec2 dc = w * 11.0;
    float dust = smoothstep(0.93, 1.0, mmHash21(floor(dc) + 71.3))
               * (1.0 - smoothstep(0.0, max(mp*11.0, 0.35), length(fract(dc) - 0.5)));
    col += col * (speck * 1.45 + dust * 0.55) * drawable;
    col *= 1.0 - speck * 0.22;                      // and each one casts its own
  }

  /* ---- the drawn line ----------------------------------------------------
     Every joint in the samples' floors is ink, not a darker stone: a line
     darker than the flags on both sides of it, thicker where the stones sit
     unevenly. pat is the floor's relief, so the same screen-space treatment
     the wall and the props use draws it here. */
  vec2 drawn = mmDrawn(pat, 0.020, 0.30) * drawable;
  col *= 1.0 - drawn.x * uInk * 0.85;
  col += col * drawn.y * uLip * 0.7;

  col *= uGain;
  // the ceiling is the one surface the eye forgives being dark; overhead near
  // the camera it must fall away or it flares out the top of the frame
  /* THE CEILING IS THE DARKEST PART OF THE FRAME in all four samples --
     selectKid, selectCompanion and mainMenu all go to near-black at the top.
     The far end of ours was reaching 0.85 and in the Kitchens and the Secret
     Passages that made the ceiling the brightest band on screen, which pulls
     the eye straight up and off the board. */
  col *= mix(1.0, mix(0.05, 0.52, smoothstep(1.5, 13.0, vDepth)), uIsCeiling);
  col *= mix(0.40, 1.0, smoothstep(2.0, 13.0, vDepth));    // foreground falls away
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  col = mmDesat(col, uDread*0.5) * (1.0 - uDread*0.28);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* --------------------------------------------------------- silhouette props */

export const PROP_VERT = /* glsl */`
attribute vec3  aOffset;
attribute vec2  aScale;
attribute float aShape;
attribute float aSeed;
attribute float aTone;
varying vec2  vUv;
varying vec3  vWorld;
varying vec2  vSize;
varying float vShape, vSeed, vTone, vFog;
uniform float uFogNear, uFogFar, uSway, uTime;
void main(){
  vUv = uv; vShape = aShape; vSeed = aSeed; vTone = aTone;
  /* The prop's size in METRES. Grain, joints and speckle are authored per metre
     from this, so a 0.6 m stool and a 3 m wardrobe carry the same physical
     texel density instead of the same number of stripes. */
  vSize = aScale;
  vec3 pos = vec3(position.xy * aScale, 0.0);
  pos.x += sin(uTime*0.55 + aSeed*31.0) * uSway * (0.25 + uv.y*0.75) * aScale.y * 0.018;
  vec3 wp = pos + aOffset;
  vWorld = wp;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const PROP_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
${LIGHT_LIB}
uniform vec3  uAlbedo, uAlbedoHi, uFog, uRim, uAccent, uAmbient, uCamera;
uniform float uRimAmt, uDread, uGain, uGloss, uInk;
uniform vec2  uKeyDir;   // screen-space direction toward the key light
uniform vec4  uLights[5];      // xyz world, w radius
uniform vec3  uLightCol[5];
uniform float uLightInt[5];    // ALREADY scaled: cinematic key/fill are damped
                               // here, because a key light lights the SUBJECT,
                               // not the set. See Backdrop.syncLights.
/* Material identity. uMatMix weights (grain, blotch, joint, speckle) and
   uMatFreq is (joints per metre horizontally, vertically). Four numbers turn one
   silhouette shader into wood / stone / fabric / metal / foliage without a
   branch and without a second program. */
uniform vec4  uMatMix;
uniform vec2  uMatFreq;
uniform float uAO;             // how hard the base and silhouette occlude
/* The prop luminance ceiling. Above uPropKnee the response compresses and can
   never reach uPropMax, so a prop physically cannot become the brightest thing
   in frame however bright the room gets. */
uniform float uPropKnee, uPropMax, uPropSat, uPropSatMax;
varying vec2  vUv;
varying vec3  vWorld;
varying vec2  vSize;
varying float vShape, vSeed, vTone, vFog;

/* Soft coverage field in local uv space; > 0 is inside the silhouette. */
float shapeField(vec2 uv, float shape, float seed){
  vec2 p = uv - vec2(0.5, 0.0);          // origin at bottom centre
  vec2 g = uv - vec2(0.5, 1.0);          // origin at top centre (hanging props)
  float d = 1e3;
  if (shape < 0.5) {                      // 0 — armchair / settle
    d = min(mmBox(p - vec2(0.0,0.20), vec2(0.30,0.20), 0.06),
            mmBox(p - vec2(0.0,0.52), vec2(0.26,0.22), 0.10));
    d = min(d, mmBox(p - vec2(-0.30,0.30), vec2(0.07,0.16), 0.05));
    d = min(d, mmBox(p - vec2( 0.30,0.30), vec2(0.07,0.16), 0.05));
  } else if (shape < 1.5) {               // 1 — candelabra
    d = mmCaps(p, 0.62, 0.030);
    d = min(d, mmBox(p - vec2(0.0,0.04), vec2(0.14,0.045), 0.03));
    d = min(d, mmBox(p - vec2(0.0,0.62), vec2(0.25,0.022), 0.02));
    d = min(d, mmCaps(p - vec2(-0.25,0.62), 0.11, 0.024));
    d = min(d, mmCaps(p - vec2( 0.25,0.62), 0.11, 0.024));
    d = min(d, mmCaps(p - vec2( 0.00,0.62), 0.15, 0.024));
  } else if (shape < 2.5) {               // 2 — tall potted plant
    /* FRONDS, not a bouquet of circles. Seven discs blended at 0.13 fuse into
       one lobed blob, which is what the Greenhouse's thirty plants came back
       as; a frond is a long thin stroke from the pot to its tip, and the leaf
       is a taper on the end of it. */
    d = mmBox(p - vec2(0.0,0.095), vec2(0.155,0.095), 0.035);
    d = min(d, mmBox(p - vec2(0.0,0.185), vec2(0.128,0.020), 0.012));   // rim
    for (int i = 0; i < 7; i++){
      float f = float(i)/6.0;
      float a = (f - 0.5)*2.05 + (mmHash11(seed+float(i))-0.5)*0.55;
      float len = 0.52 + 0.30*mmHash11(seed*3.0+float(i));
      vec2 dir = vec2(sin(a), cos(a));
      vec2 base = vec2(0.0, 0.20);
      /* Thicker AND longer than the first attempt. Thin stems with small
         leaves read as sprigs and emptied the Greenhouse -- a plant has to fill
         the quad it is sized into and still show its edges, so the stroke is
         broad, the frond is long and the leaf on its end is generous; it is the
         tight smin and the serrated edge, not the thinness, that keep them from
         fusing into one lobed ball. */
      for (int k = 1; k < 5; k++){
        float u = float(k)/4.0;
        vec2 at = base + dir*len*u + vec2(0.0, -0.07*u*u);
        d = mmSmin(d, mmCircle(p - at, 0.052*(1.0 - u*0.30)), 0.030);
      }
      vec2 tip = base + dir*len + vec2(0.0, -0.07);
      d = mmSmin(d, mmCircle(p - tip, 0.100 + 0.040*mmHash11(seed+f)), 0.050);
    }
    d += (mmRidge(uv*17.0 + seed*2.7) - 0.50) * 0.026;
  } else if (shape < 3.5) {               // 3 — headstone
    /* IT LEANS, and that is the only thing worth adding to it.

       44 prop instances, more than anything but the shrub, the cabinet and the
       column, and the Graveyard and the Pumpkin Grounds are mostly these. A
       fuller profile was tried -- plinth, tapered die, shoulder moulding, three
       choices of head -- and it came back SHORTER and read as a block with a
       hat: at the thirty pixels a headstone actually occupies, the ARCH is the
       recognisable cue and mouldings are mush. The lean costs one hash, does
       not touch the silhouette's shape, and is most of why a churchyard reads
       as one rather than as a row. */
    float lean = (mmHash11(seed*5.3) - 0.5) * 0.11;
    vec2 q = vec2(p.x + lean * p.y, p.y);
    d = mmArch(q - vec2(0.0, 0.08), 0.26, 0.44);
    d = min(d, mmBox(q - vec2(0.0,0.06), vec2(0.34,0.06), 0.02));
  } else if (shape < 4.5) {               // 4 — chandelier, hangs from the top
    d = mmBox(g + vec2(0.0,0.20), vec2(0.016,0.20), 0.01);
    // ceiling rose: the chain has to visibly come OUT of something
    d = min(d, mmBox(g + vec2(0.0,0.020), vec2(0.105,0.022), 0.012));
    d = min(d, mmBox(g + vec2(0.0,0.055), vec2(0.055,0.020), 0.010));
    d = min(d, mmCircle(g + vec2(0.0,0.46), 0.09));
    for (int i = 0; i < 6; i++){
      float a = float(i)/6.0*6.2831 + seed;
      vec2 cc = vec2(cos(a)*0.32, -0.45 + sin(a)*0.09);
      d = mmSmin(d, mmCaps(g - cc, 0.12, 0.020), 0.05);
      d = min(d, mmCircle(g - cc - vec2(0.0,0.02), 0.034));
    }
  } else if (shape < 5.5) {               // 5 — cabinet / bookcase
    d = mmBox(p - vec2(0.0,0.46), vec2(0.30,0.46), 0.02);
    d = min(d, mmBox(p - vec2(0.0,0.94), vec2(0.36,0.038), 0.02));
    d = min(d, mmBox(p - vec2(0.0,0.30), vec2(0.34,0.026), 0.01));
    d = min(d, mmBox(p - vec2(0.0,0.62), vec2(0.34,0.026), 0.01));
  } else if (shape < 6.5) {               // 6 — column with capital
    /* The profile, bottom to top: plinth, torus, a shaft with ENTASIS, an
       astragal at the neck, an echinus flaring into a square abacus. The old
       shape was three boxes and a sine on the shaft's width, which reads as a
       capital-T on a kerb -- and it is the thing the eye lands on in the Foyer
       and the Ballroom. */
    float t = clamp((p.y - 0.14) / 0.72, 0.0, 1.0);
    // entasis: widest a third of the way up, five sixths of that at the neck
    float rad = 0.132 * (1.0 + 0.085*sin(t*2.6) - 0.20*t*t);
    d = mmBox(p - vec2(0.0, 0.50), vec2(rad, 0.36), 0.012);
    d = min(d, mmBox(p - vec2(0.0, 0.035), vec2(0.215, 0.035), 0.012));   // plinth
    d = min(d, mmBox(p - vec2(0.0, 0.090), vec2(0.178, 0.028), 0.024));   // torus
    d = min(d, mmBox(p - vec2(0.0, 0.130), vec2(0.150, 0.016), 0.014));   // apophyge
    d = min(d, mmBox(p - vec2(0.0, 0.855), vec2(0.122, 0.012), 0.011));   // astragal
    // the echinus: a quarter-round flaring out under the abacus
    float ey = clamp((p.y - 0.868) / 0.062, 0.0, 1.0);
    d = min(d, mmBox(p - vec2(0.0, 0.898), vec2(0.124 + 0.085*ey*ey, 0.030), 0.014));
    d = min(d, mmBox(p - vec2(0.0, 0.952), vec2(0.222, 0.026), 0.008));   // abacus
    d = min(d, mmBox(p - vec2(0.0, 0.982), vec2(0.236, 0.012), 0.006));   // its fillet
  } else if (shape < 7.5) {               // 7 — drape on a rail
    float fold = 0.085*sin(uv.x*19.0 + seed*9.0)*uv.y;
    d = mmBox(g + vec2(fold, 0.48), vec2(0.30, 0.50), 0.05);
    d = mmSmin(d, mmCircle(g - vec2(-fold, -1.00), 0.15), 0.22);
    /* THE RAIL. A curtain that simply stops at the top of its quad reads as a
       floating slab however exactly it meets the ceiling — a reviewer counted
       two of them "hanging unanchored in the ceiling void" in the Nursery. A rod
       with finials and two brackets gives the eye the thing it hangs FROM. */
    d = min(d, mmBox(g + vec2(0.0, 0.030), vec2(0.42, 0.028), 0.018));
    d = min(d, mmCircle(g + vec2(-0.42, 0.030), 0.055));
    d = min(d, mmCircle(g + vec2( 0.42, 0.030), 0.055));
    d = min(d, mmBox(g + vec2(-0.30, 0.006), vec2(0.020, 0.040), 0.008));
    d = min(d, mmBox(g + vec2( 0.30, 0.006), vec2(0.020, 0.040), 0.008));
  } else if (shape < 8.5) {               // 8 — crate stack
    d = mmBox(p - vec2(-0.10,0.22), vec2(0.24,0.22), 0.02);
    d = min(d, mmBox(p - vec2(0.16,0.62), vec2(0.19,0.19), 0.02));
  } else if (shape < 9.5) {               // 9 — shrub / hedge
    for (int i = 0; i < 5; i++){
      float f = float(i)/4.0;
      vec2 cc = vec2((f-0.5)*0.70, 0.24 + 0.36*mmHash11(seed+float(i)*3.7));
      /* A hedge is WIDER than tall, not shorter: squashing it to 1.35 and
         blending at 0.075 took the mass out with the blobbiness and left the
         Greenhouse looking empty. 1.12 and 0.105 keep the bank and still let
         each clump read. */
      d = mmSmin(d, mmCircle((p - cc)*vec2(1.0, 1.12), 0.265 + 0.120*mmHash11(seed*2.0+f)), 0.105);
    }
    /* LEAVES. Five circles smoothed together is a cauliflower, and the sweep
       of all seventeen regions showed the Greenhouse's planting reading as a
       bank of boulders. A leaf mass has a ragged edge at a much finer scale
       than the mass itself, plus a few leaves standing out of it -- and that
       edge is most of what tells foliage from stone at this distance, colour
       or no colour. */
    d += (mmRidge(uv*13.0 + seed*4.1) - 0.50) * 0.048;
    for (int i = 0; i < 4; i++){
      float f = mmHash11(seed*5.7 + float(i)*2.3);
      float a = (f - 0.5) * 2.4;
      vec2 tip = vec2(sin(a)*(0.30 + 0.16*f), 0.34 + cos(a)*0.30 + 0.12*f);
      d = min(d, mmCaps(p - tip, 0.055 + 0.030*f, 0.022));
    }
  } else if (shape < 10.5) {              // 10 — cot / crib with bars
    d = mmBox(p - vec2(0.0,0.26), vec2(0.34,0.10), 0.03);
    d = min(d, mmBox(p - vec2(-0.34,0.30), vec2(0.035,0.30), 0.02));
    d = min(d, mmBox(p - vec2( 0.34,0.30), vec2(0.035,0.30), 0.02));
    d = min(d, mmBox(p - vec2(0.0,0.58), vec2(0.36,0.030), 0.02));
    for (int i = 0; i < 5; i++){
      float x = (float(i)/4.0 - 0.5)*0.60;
      d = min(d, mmBox(p - vec2(x,0.44), vec2(0.017,0.16), 0.01));
    }
    d = min(d, mmBox(p - vec2(-0.28,0.08), vec2(0.035,0.10), 0.01));
    d = min(d, mmBox(p - vec2( 0.28,0.08), vec2(0.035,0.10), 0.01));
  } else if (shape < 11.5) {              // 11 — rocking horse
    d = mmCircle(p - vec2(0.0,0.52), 0.20);
    d = mmSmin(d, mmCircle(p - vec2(0.30,0.68), 0.13), 0.10);   // head
    d = mmSmin(d, mmCaps(p - vec2(-0.18,0.30), 0.24, 0.045), 0.06);
    d = mmSmin(d, mmCaps(p - vec2( 0.16,0.30), 0.24, 0.045), 0.06);
    float rock = abs(mmCircle(p - vec2(0.0, 0.62), 0.62)) - 0.035;
    d = min(d, max(rock, p.y - 0.16));
  } else if (shape < 12.5) {              // 12 — four-poster bed
    d = mmBox(p - vec2(0.0,0.22), vec2(0.44,0.12), 0.04);
    d = min(d, mmBox(p - vec2(-0.44,0.52), vec2(0.040,0.52), 0.02));
    d = min(d, mmBox(p - vec2( 0.44,0.52), vec2(0.040,0.52), 0.02));
    d = min(d, mmBox(p - vec2(0.0,1.02), vec2(0.47,0.045), 0.02));
    float drop = 0.06*sin(uv.x*13.0 + seed*5.0);
    d = min(d, mmBox(p - vec2(0.0, 0.86 + drop), vec2(0.44,0.16), 0.03));
    d = min(d, mmBox(p - vec2(0.0,0.10), vec2(0.40,0.08), 0.05));   // bedding
  } else if (shape < 13.5) {              // 13 — range / stove with flue
    d = mmBox(p - vec2(0.0,0.30), vec2(0.33,0.30), 0.03);
    d = min(d, mmBox(p - vec2(0.0,0.63), vec2(0.38,0.045), 0.02));
    d = min(d, mmBox(p - vec2(0.18,0.86), vec2(0.055,0.26), 0.02));  // flue
    d = min(d, mmBox(p - vec2(0.18,1.10), vec2(0.11,0.035), 0.02));
    d = min(d, mmCircle(p - vec2(-0.12,0.30), 0.13));                 // fire door
    d = min(d, mmBox(p - vec2(0.0,0.04), vec2(0.30,0.045), 0.01));
  } else if (shape < 14.5) {              // 14 — longcase clock
    d = mmBox(p - vec2(0.0,0.44), vec2(0.16,0.44), 0.02);
    d = min(d, mmArch(p - vec2(0.0,0.88), 0.20, 0.16));
    d = min(d, mmCircle(p - vec2(0.0,0.86), 0.12));
    d = min(d, mmBox(p - vec2(0.0,0.05), vec2(0.21,0.05), 0.02));
    d = min(d, mmBox(p - vec2(0.0,1.02), vec2(0.23,0.035), 0.02));
  } else if (shape < 15.5) {              // 15 — statue on a plinth
    /* A FIGURE READS BY ITS SEQUENCE: a flared skirt of drapery, a waist,
       shoulders wider than the waist, a neck, a head narrower than the
       shoulders. The old shape was a capsule torso and a circle head smoothed
       together at 0.09, so every part fused into one lumpy column and a
       "colonnade of statuary" came out as a row of melted candles. The smins
       here are tight on purpose. */
    d = mmBox(p - vec2(0.0, 0.055), vec2(0.225, 0.055), 0.015);       // plinth
    d = min(d, mmBox(p - vec2(0.0, 0.135), vec2(0.185, 0.032), 0.012));
    d = min(d, mmBox(p - vec2(0.0, 0.175), vec2(0.150, 0.016), 0.010)); // its fillet
    // the drapery: a skirt that flares to the ground
    float t = clamp((p.y - 0.19) / 0.34, 0.0, 1.0);
    float skirt = 0.155 - 0.052*t + 0.014*sin(p.y*22.0 + seed*7.0);
    d = min(d, mmBox(p - vec2(0.0, 0.36), vec2(skirt, 0.17), 0.018));
    // waist, then shoulders wider than it
    d = mmSmin(d, mmBox(p - vec2(0.0, 0.575), vec2(0.088, 0.062), 0.030), 0.035);
    d = mmSmin(d, mmBox(p - vec2(0.0, 0.680), vec2(0.135, 0.055), 0.048), 0.040);
    // neck and head
    d = mmSmin(d, mmCaps(p - vec2(0.012, 0.745), 0.022, 0.030), 0.020);
    d = mmSmin(d, mmCircle(p - vec2(0.018, 0.815), 0.068), 0.018);
    // one arm down across the drapery, one forearm raised
    d = mmSmin(d, mmCaps(p - vec2(-0.125, 0.585), 0.105, 0.036), 0.030);
    d = mmSmin(d, mmCaps(p - vec2(0.140, 0.640), 0.085, 0.032), 0.030);
    d = min(d, mmCircle(p - vec2(0.152, 0.735), 0.042));
  } else if (shape < 16.5) {              // 16 — sarcophagus chest
    d = mmBox(p - vec2(0.0,0.20), vec2(0.46,0.20), 0.03);
    d = min(d, mmBox(p - vec2(0.0,0.44), vec2(0.50,0.055), 0.03));
    d = min(d, mmCircle(p - vec2(0.0,0.52), 0.11));
    d = min(d, mmBox(p - vec2(-0.34,0.06), vec2(0.05,0.06), 0.01));
    d = min(d, mmBox(p - vec2( 0.34,0.06), vec2(0.05,0.06), 0.01));
  } else if (shape < 17.5) {              // 17 — clawfoot bath
    d = mmBox(p - vec2(0.0,0.34), vec2(0.46,0.20), 0.18);
    d = max(d, -mmBox(p - vec2(0.0,0.52), vec2(0.40,0.16), 0.12));    // hollow it
    d = min(d, mmCaps(p - vec2(-0.38,0.06), 0.12, 0.055));
    d = min(d, mmCaps(p - vec2( 0.38,0.06), 0.12, 0.055));
    d = min(d, mmCaps(p - vec2(0.42,0.54), 0.22, 0.026));             // tap riser
    d = min(d, mmCircle(p - vec2(0.36,0.76), 0.045));
  } else if (shape < 18.5) {              // 18 — gas lamp post
    d = mmCaps(p, 0.78, 0.032);
    d = min(d, mmBox(p - vec2(0.0,0.05), vec2(0.13,0.05), 0.03));
    d = min(d, mmBox(p - vec2(0.0,0.82), vec2(0.11,0.11), 0.02));     // lantern box
    d = min(d, mmArch(p - vec2(0.0,0.93), 0.10, 0.10));
    d = min(d, mmBox(p - vec2(0.0,1.06), vec2(0.03,0.04), 0.01));
    d = min(d, mmCaps(p - vec2(0.0,0.40), 0.02, 0.055));
  } else {                                // 19 — birdcage on a stand
    d = mmCaps(p, 0.44, 0.028);
    d = min(d, mmBox(p - vec2(0.0,0.04), vec2(0.15,0.04), 0.03));
    float ring = abs(mmCircle(p - vec2(0.0,0.72), 0.26)) - 0.022;
    d = min(d, max(ring, 0.44 - p.y));
    d = min(d, mmBox(p - vec2(0.0,0.46), vec2(0.26,0.026), 0.01));
    for (int i = 0; i < 5; i++){
      float a = (float(i)/4.0 - 0.5)*2.2;
      d = min(d, mmCaps(p - vec2(sin(a)*0.245, 0.46), 0.26*cos(a*0.5), 0.014));
    }
    d = min(d, mmCircle(p - vec2(0.0,0.98), 0.045));
  }
  d += (mmFbm3(uv*5.0 + seed*17.0) - 0.5) * 0.022;   // erode the CG-clean edge
  return -d;
}

void main(){
  float f = shapeField(vUv, vShape, vSeed);
  /* The coverage field's own screen gradient turns it into a DISTANCE IN
     PIXELS from the silhouette, which is the only scale an edge treatment can
     honestly be authored in: the old 0.014 of local uv was half a pixel on a
     far prop and five on a near one, and the capitals in every capture were
     stair-stepped because of it. */
  vec2  gr   = vec2(dFdx(f), dFdy(f));
  float glen = length(gr) + 1e-7;
  float fpx  = f / glen;
  float mask = smoothstep(0.0, 1.45, fpx);
  if (mask < 0.004) discard;

  /* --- an SDF-derived 3D normal -------------------------------------------
     The prop is a flat quad, but the coverage field gives us a gradient, and
     treating the shape as a rounded slab turns that gradient into a normal
     that faces outward at the silhouette and toward the camera in the middle.
     That is what makes a crown read brighter than a base under a high light. */
  /* Same trick as the wall: shapeField() has twenty branches, so sampling it
     three times for a gradient tripled the program. dFdx/dFdy give the gradient
     from the single sample we already have. */
  vec2  g  = gr / glen;                                     // points inward
  float edge = 1.0 - smoothstep(0.0, 0.085, f);
  vec3  N  = normalize(vec3(-g * edge * 1.75, 0.62 + 0.38*(1.0 - edge)));
  // surface break-up so the body is not a smooth CG gradient
  N = normalize(N + vec3((mmFbm3(vUv*9.0 + vSeed*3.1) - 0.5)*0.34,
                         (mmFbm3(vUv*9.0 + vSeed*7.7) - 0.5)*0.34, 0.0));

  float facing = max(dot(-g, uKeyDir), 0.0);
  float band = 1.0 - smoothstep(0.6, 3.4, fpx);             // pixels, not uv

  /* --- albedo: a real material, not near-black ---------------------------- */
  vec3 albedo = mix(uAlbedo, uAlbedoHi, clamp(vUv.y*0.85 + 0.10, 0.0, 1.0));
  albedo *= 0.70 + 0.60*vTone;

  /* --- SURFACE ------------------------------------------------------------
     Round 2 gave the body one low-amplitude fbm and nothing else, so a cabinet
     was a flat slab of colour and three reviewers independently called the
     props "untextured cuboids" and "debug geometry". Four terms, all in metres:
     directional grain (wood / cloth folds), blotch (stone, foliage, patina),
     periodic joints (planks, drawer lines, courses, staves) and a fine speckle.
     Each is weighted per region by uMatMix, so one program covers every
     material in the house. */
  vec2  sp     = vUv * vSize;
  float grain  = mmFbm3(vec2(sp.x*8.0, sp.y*1.1) + vSeed*3.7);
  float blotch = mmFbm3(sp*2.6 + vSeed*11.3);
  float speck  = mmHash21(floor(sp*16.0) + vSeed);
  float jy = abs(fract(sp.y*uMatFreq.y + vSeed*0.7) - 0.5);
  float jx = abs(fract(sp.x*uMatFreq.x + vSeed*0.3) - 0.5);
  /* A joint is a DRAWN line, so it keeps a width of about a pixel and a half
     however far away the prop is. Authored at 0.06 of a cycle it fell below a
     pixel at the back of the room and disappeared, which is exactly why the far
     props read as smooth slabs while the near ones read as wood. */
  vec2  mpp = vec2(length(vec2(dFdx(sp.x), dFdy(sp.x))),
                   length(vec2(dFdx(sp.y), dFdy(sp.y))));
  float wy = max(0.055, 1.5 * mpp.y * uMatFreq.y);
  float wx = max(0.045, 1.5 * mpp.x * uMatFreq.x);
  float joint = max(1.0 - smoothstep(0.0, wy, jy), 1.0 - smoothstep(0.0, wx, jx));
  albedo *= 1.0 + (grain - 0.5)*uMatMix.x + (blotch - 0.5)*uMatMix.y
                - joint*uMatMix.z + (speck - 0.5)*uMatMix.w;

  /* WHAT IS IN THE CABINET. Shape 5 is the Foyer's and the Study's commonest
     prop and it was a box with two shelf rails in it. The samples' props carry
     drawn contents -- book spines with gilt bands, panes in a glazed door --
     and contents are albedo, not silhouette, so this costs one branch and no
     geometry. Each shelf holds books of its own heights and colours, leaning
     where a shelf is not full. */
  if (vShape > 4.5 && vShape < 5.5) {
    float shelf = floor(vUv.y * 3.0);                 // three shelves
    float sy = fract(vUv.y * 3.0);
    float run = mmHash11(vSeed*3.1 + shelf*7.7);      // how full this shelf is
    float bx = vUv.x * (7.0 + floor(run*4.0));
    float bid = floor(bx);
    float bh = 0.52 + 0.40*mmHash11(bid*2.3 + shelf*5.1 + vSeed);
    float lean = (mmHash11(bid*4.7 + vSeed) - 0.5) * 0.10 * step(0.72, run);
    float inShelf = step(0.10, sy) * step(sy, 0.10 + bh*0.72);
    /* The SPINE, not the gap between spines. The first version wrote
       gap = 1.0 - smoothstep(...), which is 1 at a book's CENTRE and 0 at its
       edge, so 1.0 - gap drew a hairline down each joint and nothing else:
       the books were invisible in the Foyer and the Study at any size. Found by
       looking at the props at 2x rather than by reading the code.

       abs(fract(bx) - 0.5) is 0 at the spine's middle and 0.5 at its edge, so
       the spine is where that is BELOW 0.40 and the gap is the last tenth. */
    float edge = abs(fract(bx + lean*sy) - 0.5) - 0.40;
    float gap = smoothstep(0.0, max(0.012, mpp.x/max(vSize.x,0.01)*7.0), edge);
    float has = step(mmHash11(bid*8.9 + shelf*3.3 + vSeed), 0.86);
    float book = inShelf * has * (1.0 - gap);
    /* Each spine its own value, and a gilt band a third of the way down. The
       SPREAD between neighbours is what makes a shelf legible -- a row of
       books at one value is a plank.

       The term was proved to execute by flooding it red and counting the
       pixels: 62-69k, spread round the perimeter where the Foyer's five
       cabinets stand. The AMOUNT here is NOT verified by eye, because a prop
       A/B needs the same prop in both captures and this instrument cannot
       give one (see the note in tools/shot-scripts/backdrop-room.js). It is
       set conservatively between the original and what looked right on paper;
       a future round with a reproducible layout should set it properly. */
    float tone = 0.48 + 1.00*mmHash11(bid*11.3 + shelf*2.9 + vSeed);
    float band = (1.0 - smoothstep(0.0, 0.030, abs(sy - (0.10 + bh*0.52))))
               * step(0.55, mmHash11(bid*6.1 + vSeed));
    /* The amount, finally set BY EYE. The note left here said it could not be,
       because a prop A/B needs the same prop in both captures -- and it can be
       now: the backdrop-room script pins clock.t, so two captures of a region
       are byte-identical and the same cabinet stands in both. At 0.90/0.55 the
       contents were faint streaks at the 290 px this cabinet occupies in the
       foreground of four of this round's captures. */
    albedo *= 1.0 + book * (tone - 1.0) * 1.15;
    albedo *= 1.0 - (1.0 - book) * inShelf * 0.78;     // the dark behind them
    albedo *= 1.0 + book * band * 0.72;
    // and the shelf's own front edge catches the light
    albedo *= 1.0 + (1.0 - smoothstep(0.0, 0.035, abs(sy - 0.075))) * 0.34;
    /* AND THE CABINET ITSELF. A carcass with contents in it and no joinery ON
       it is still a box, which is what shape 5 -- 58 instances, the commonest
       prop in the house -- has read as in every capture of the Foyer. What says
       cabinet is the GLAZING: two doors with a stile between them, bars across
       the panes, and the plinth it stands on. */
    float sx = abs(vUv.x - 0.5);
    float gbx = abs(fract(vUv.x*4.0) - 0.5) * 0.25;
    float gby = abs(fract(vUv.y*5.0) - 0.5) * 0.20;
    float bars = max(1.0 - smoothstep(0.009, 0.020, gbx),
                     1.0 - smoothstep(0.009, 0.020, gby))
               * step(0.11, vUv.y) * step(vUv.y, 0.92);
    float stile = (1.0 - smoothstep(0.011, 0.026, sx))
                + (1.0 - smoothstep(0.011, 0.026, abs(sx - 0.355)));
    /* DARK, not light. The joinery went in as a highlight first and nothing
       changed on screen, because a cabinet this near the camera already sits at
       the prop luminance ceiling (propCeil/exposure, clamped in this shader
       below) -- adding light to a surface at its ceiling is a no-op. A glazing
       bar is dark wood anyway. */
    /* AND HARD. The grid was proved to execute and to be the right shape by
       flooding it red and green and looking (shots/zoom-probe.png), so the only
       thing wrong was the amount: at 0.46 of albedo it was invisible, because a
       near prop's output is mostly the additive rim and ambient terms below
       plus a luminance knee that compresses whatever albedo does. 0.86 is what
       a drawn line on a lit prop costs. */
    albedo *= 1.0 - bars * 0.86;
    albedo *= 1.0 - clamp(stile, 0.0, 1.0) * 0.72;
    albedo *= 1.0 - (1.0 - smoothstep(0.0, 0.015, abs(vUv.y - 0.095))) * 0.80;
    albedo *= 1.0 - (1.0 - smoothstep(0.0, 0.015, abs(vUv.y - 0.905))) * 0.72;
  }

  /* THE CLOCK'S DIAL AND ITS DOOR. Shape 14 stands in the Foyer, the Study and
     the Heart, and in the Foyer's capture it is 230 px tall -- big enough for
     its parts to read, and it had none. A trunk, a hood arch and a dial all
     min()ed into one silhouette is one grey monolith, because a dial at the
     same depth as the trunk it is set into has no edge. Contents are albedo,
     like the cabinet's books: a paper dial inside a brass bezel, the chapter
     ring's hour marks, two hands, and a glazed trunk door with its lenticle. */
  if (vShape > 13.5 && vShape < 14.5) {
    vec2 c = (vUv - vec2(0.5, 0.855)) * vec2(1.0, 0.62);
    float r = length(c);
    float aa = max(0.010, mpp.x / max(vSize.x, 0.01) * 1.6);
    albedo *= 1.0 + (1.0 - smoothstep(0.070 - aa, 0.070 + aa, r)) * 1.05;   // the dial
    albedo *= 1.0 - (1.0 - smoothstep(aa, aa*2.6, abs(r - 0.079))) * 0.80;  // its bezel
    float th = atan(c.y, c.x);
    albedo *= 1.0 - (1.0 - smoothstep(0.012, 0.028, abs(mod(th + 0.2618, 0.5236) - 0.2618)))
                  * (1.0 - smoothstep(0.048, 0.066, r)) * 0.62;             // hour marks
    // the hands: one long, one short, at ten past two
    float h1 = abs(c.y*0.5 - c.x*0.866);
    float h2 = abs(c.y*0.966 + c.x*0.259);
    albedo *= 1.0 - (1.0 - smoothstep(0.006, 0.013, h1)) * step(r, 0.062) * 0.70;
    albedo *= 1.0 - (1.0 - smoothstep(0.006, 0.013, h2)) * step(r, 0.042) * 0.70;
    // the trunk door, sunk, with a lenticle to watch the pendulum through
    float doorD = mmBox(vUv - vec2(0.5, 0.42), vec2(0.105, 0.255), 0.010);
    albedo *= 1.0 - (1.0 - smoothstep(0.0, 0.012, abs(doorD))) * 0.72;
    albedo *= 1.0 - smoothstep(0.004, -0.004, doorD) * 0.24;
    float lens = length((vUv - vec2(0.5, 0.60)) * vec2(1.0, 0.62)) - 0.036;
    albedo *= 1.0 + (1.0 - smoothstep(0.0, 0.010, abs(lens))) * 0.55;
    albedo *= 1.0 - smoothstep(0.004, -0.004, lens) * 0.42;
  }

  /* FLUTES, on the shaft of a column, and nowhere else. They are not
     silhouette -- they are twenty-four grooves drawn round a cylinder, and a
     column without them is a post. Width in pixels, like every other drawn
     line in this file, so they survive the back of the room; and they fall
     away at the neck and the base the way a real flute stops short. */
  if (vShape > 5.5 && vShape < 6.5) {
    float u = (vUv.x - 0.5) * 2.0;                 // -1 .. 1 across the shaft
    float bend = asin(clamp(u, -0.999, 0.999)) / 1.5708;   // round the cylinder
    float fl = abs(fract(bend*5.0 + 0.5) - 0.5)*2.0;
    float fw = max(0.30, mpp.x / max(vSize.x, 0.01) * 5.0);
    float groove = 1.0 - smoothstep(fw*0.45, fw, fl);
    float onShaft = smoothstep(0.13, 0.19, vUv.y) * (1.0 - smoothstep(0.80, 0.86, vUv.y));
    float toward = 0.45 + 0.55*clamp(u*sign(uKeyDir.x + 0.001), 0.0, 1.0);
    albedo *= 1.0 - groove * onShaft * 0.42;
    albedo *= 1.0 + (1.0 - groove) * onShaft * 0.16 * toward;
  }

  /* Occlusion. A prop is a volume: it is darker where it meets the floor and
     darker in the last few millimetres before its own silhouette. Without these
     two the lit face is one even wash, which is the other half of "cuboid". */
  float inner = smoothstep(0.0, 0.09, f);
  albedo *= mix(1.0 - 0.44*uAO, 1.0, smoothstep(0.0, 0.26, vUv.y));
  albedo *= mix(1.0 - 0.30*uAO, 1.0, inner);

  /* --- per-pixel candlelight ---------------------------------------------- */
  vec3 V = normalize(uCamera - vWorld);
  vec3 diff = vec3(0.0), spec = vec3(0.0), raw = vec3(0.0);
  for (int i = 0; i < 5; i++){
    if (uLightInt[i] <= 0.001) continue;
    vec3 Lv = uLights[i].xyz - vWorld;
    float dist = length(Lv);
    vec3 ldir = Lv / max(dist, 0.001);
    float att = mmAtten(dist, uLights[i].w, uLightInt[i]);
    float ndl = mmWrapNdL(N, ldir, 0.42);
    diff += uLightCol[i] * att * ndl;
    raw  += uLightCol[i] * att;
    spec += mmSpec(N, ldir, V, uLightCol[i], att, uGloss, 34.0);
  }

  /* Round 2 shipped "diff * 1.45" on top of a 2.6x authored gain — a lift no
     actual mesh in the scene gets. A MeshStandardMaterial with the same albedo
     under the same lamp measured ~5x darker, which is precisely why the props
     outshone the creatures in all seventeen regions. The diffuse term is now
     unmultiplied; brightness is carried by uGain alone, where it can be
     calibrated in one place. */
  vec3 col = albedo * (uAmbient + uAccent * 0.13 + diff) + spec * 0.85;
  col *= uGain;

  /* --- the outline, then the rim ------------------------------------------
     The samples separate a form from its ground with a DARK line all the way
     round and catch a warm rim only on the lit side. This had only the rim, on
     both sides, at full strength, and it read as a chrome edge: the props came
     back from the measurement with an ink depth of exactly 0.000.

     The ink goes on first so the rim sits outside it, which is the order a
     brush lays them. */
  float sil = 1.0 - smoothstep(0.0, 2.7, fpx);
  col *= 1.0 - sil * uInk * 0.80;
  float rim = pow(band, 1.5) * (0.04 + 0.96*pow(facing, 1.9)) * mask;
  col += (uRim * 0.07 + raw * 0.09) * rim * uRimAmt;

  /* --- THE CEILING --------------------------------------------------------
     Everything above still scales with the room's lamps, so a bright room could
     always push a prop back into clipping. This shoulder makes that impossible:
     luminance above uPropKnee compresses asymptotically toward uPropMax and
     never reaches it. Hue is preserved (the whole colour is scaled by the
     luminance ratio), so a compressed prop desaturates the way film does rather
     than shifting toward white. */
  float Lp = mmLum(col);
  if (Lp > uPropKnee) {
    float over = Lp - uPropKnee;
    float span = max(uPropMax - uPropKnee, 1e-3);
    col *= (uPropKnee + span * over / (over + span)) / max(Lp, 1e-4);
  }

  /* --- AND A CHROMA CEILING, the same shape and for the same reason -------
     Measured: a prop in UI/*.png reads 0.19-0.43 mean saturation -- the skull
     and the books in selectKid, the statues flanking mainMenu's steps -- and
     ours read 0.75. The cause is structural and identical to the luminance
     one above: a prop takes the REGION'S ACCENT as its albedo and then the
     region's key as its light, so the Ballroom's plum settles (propAlb
     #4c2c3b, propHi #8c5a6a) under a gold lamp at exposure 3.55 arrive as a
     colonnade of hot pink blobs, and the Foyer's warm brown cabinets under a
     #79afce fill arrive as blue tin.

     A real surface does do that. A painting never does: the samples keep their
     props' local colour and let the LIGHT carry the hue. Above the knee the
     saturation compresses asymptotically toward uPropSatMax and never reaches
     it, at constant luminance, so nothing gets brighter or darker -- only less
     insistent. */
  float Lc  = mmLum(col);                 /* AFTER the luminance ceiling */
  float mxc = max(max(col.r, col.g), col.b);
  float mnc = min(min(col.r, col.g), col.b);
  float sat = (mxc - mnc) / max(mxc, 1e-4);
  if (sat > uPropSat) {
    float over = sat - uPropSat;
    float span = max(uPropSatMax - uPropSat, 1e-3);
    float want = uPropSat + span * over / (over + span);
    col = mix(vec3(Lc), col, want / max(sat, 1e-4));
  }

  col = mix(col, uFog, vFog);
  col = mmDesat(col, uDread*0.5) * (1.0 - uDread*0.22);
  gl_FragColor = vec4(col, mask*(1.0 - vFog*0.30));
}`;

/* ------------------------------------------------------------ contact shadow */
/* A soft elliptical darkening on the floor under every prop. Multiply-blended,
   drawn after the floor. Without it props float; with it they are in the room. */

export const SHADOW_VERT = /* glsl */`
attribute vec3  aOffset;
attribute vec2  aScale;
attribute float aStrength;
varying vec2  vUv;
varying float vStrength, vFade, vSeed;
uniform float uFogNear, uFogFar;
void main(){
  vUv = uv; vStrength = aStrength;
  /* Its own seed, off its own place in the room, so no two shadows in a
     colonnade are the same shape. */
  vSeed = fract(aOffset.x*0.3183 + aOffset.z*0.2718) * 31.4;
  vec3 wp = vec3(position.x * aScale.x, 0.0, position.y * aScale.y) + aOffset;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vFade = 1.0 - smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const SHADOW_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
varying vec2  vUv;
varying float vStrength, vFade, vSeed;
void main(){
  vec2 d = (vUv - 0.5) * 2.0;
  /* A CORE and a PENUMBRA, not one smoothstep doing both. Where a thing
     touches the floor the shadow is nearly black and has a hard edge; a
     hand-width out it is a soft grey that lets go raggedly. One even falloff
     from 0.15 to 1.0 is neither, and it is the last wholly CG thing left on
     the floor. */
  float wob = mmFbm3(vec2(atan(d.y, d.x + 1e-5)*1.9 + vSeed, vSeed*0.7)) - 0.5;
  float r = length(d) * (1.0 + wob*0.26);
  float core = 1.0 - smoothstep(0.02, 0.42, r);
  float pen  = 1.0 - smoothstep(0.22, 1.0, r);
  float a = (core*0.62 + pen*0.52) * vStrength * vFade;
  gl_FragColor = vec4(vec3(1.0 - clamp(a, 0.0, 1.0)), 1.0);
}`;

/* -------------------------------------------------------------- light shafts */

export const SHAFT_VERT = /* glsl */`
attribute vec3  aOrigin;
attribute vec3  aParam;   // x angle, y length, z width
attribute float aSeed;
attribute float aInt;
varying vec2  vUv;
varying float vSeed, vInt, vGround;
void main(){
  vUv = uv; vSeed = aSeed; vInt = aInt;
  float a = aParam.x;
  // how far down this fragment is, as a fraction of the distance to the floor
  float toFloor = aOrigin.y / max(cos(a), 0.15);
  vGround = clamp(((1.0 - uv.y) * aParam.y) / max(toFloor, 0.001), 0.0, 1.4);
  vec2 local = vec2((uv.x - 0.5)*aParam.z*(0.30 + (1.0-uv.y)*1.40), -(1.0 - uv.y)*aParam.y);
  vec2 rot = vec2(local.x*cos(a) - local.y*sin(a), local.x*sin(a) + local.y*cos(a));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aOrigin + vec3(rot, 0.0), 1.0);
}`;

export const SHAFT_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform vec3  uColor;
uniform float uTime, uDread;
varying vec2  vUv;
varying float vSeed, vInt, vGround;
void main(){
  float across = 1.0 - abs(vUv.x - 0.5)*2.0;
  /* A BROKEN EDGE, and STREAKS. prep_ui_paint's note on the painted kit says
     it plainly: "a candle's pool has a brushed, broken edge and a moonbeam
     carries streaks, never a perfect gradient" -- and the three shafts in the
     Foyer were three even cones with one fbm across them. A shaft is light
     through something: it arrives striped by whatever it came past, and its
     edge is eaten where the dust is thin. */
  float bite = mmFbm3(vec2(vUv.y*2.1 + vSeed*7.0, vSeed*3.0)) - 0.5;
  float edge   = smoothstep(0.0, 0.85, across + bite*0.17);
  /* the stripes: three narrow bands at fixed positions across the beam, each
     running its whole length, which is what a mullion or a branch leaves */
  float stripe = 0.0;
  for (int i = 0; i < 2; i++){
    float fi = float(i);
    float at = mmHash11(vSeed*13.0 + fi*5.3) * 0.62 - 0.31;
    float w  = 0.085 + 0.075*mmHash11(vSeed*7.0 + fi*3.1);
    /* soft-shouldered, and thinning down the beam: a stripe is denser dust,
       not a slot cut in the light. Hard-edged at 0.030 wide it read as a
       searchlight -- three parallel lines drawn across the room. */
    stripe += (1.0 - smoothstep(w*0.25, w, abs((vUv.x - 0.5) - at)))
            * (0.45 + 0.55*mmHash11(vSeed*11.0 + fi))
            * smoothstep(0.02, 0.55, vUv.y);
  }
  edge *= 1.0 + stripe*0.20;
  /* The old shader faded the shaft out at its own bottom edge, so every beam in
     the game stopped in mid-air. Now the beam keeps its strength all the way to
     the floor and BRIGHTENS into the contact, which is where the eye expects the
     pool to be. */
  float along  = smoothstep(0.0, 0.42, vUv.y);
  float land   = 1.0 + 0.85 * smoothstep(0.55, 1.0, vGround) * (1.0 - smoothstep(1.0, 1.22, vGround));
  float cut    = 1.0 - smoothstep(1.0, 1.18, vGround);
  float d = mmFbm3(vec2(vUv.x*6.0 + vSeed*11.0, vUv.y*2.4 - uTime*0.09));
  /* AND IT IS STILL THE LOUDEST UNPAINTED THING IN THE FRAME. Not one of the
     four samples has a light shaft in it, and with the rooms now carrying drawn
     subject the three diagonal streaks across the Foyer are what the eye goes
     to first. 2.2 leaves a wide bright core with a definite flank; 3.4 keeps
     the same reach and the same landing pool but pulls the body into a haze,
     which is the most a shaft can be here and still be light in air.
     Set by looking at the capture, not by the number -- the metric prefers them
     bright, as it did the last two times. */
  float body = pow(edge, 3.4)*along*land*cut*(0.34 + 0.86*d);
  vec3 col = uColor * body * vInt * 0.60 * (1.0 - uDread*0.45);
  gl_FragColor = vec4(col, body*0.50);
}`;

/* ---------------------------------------------------------------- near frame */

export const FRAME_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const FRAME_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform vec3  uColor, uRim;
uniform float uTime, uSeed, uMode, uAmount, uDread;
varying vec2  vUv;
void main(){
  vec2 p = vUv;
  float m = 0.0;
  if (uMode < 0.5) {
    // side drapery, anchored to x = 0
    float fold = 0.030*sin(p.y*11.0 + uSeed*7.0 + sin(uTime*0.30)*0.30);
    float w = 0.135 + fold + 0.055*mmFbm3(vec2(p.y*2.6, uSeed));
    /* A drape's own edge, eaten: a clean smoothstep over a third of the quad
       reads as a gradient mask laid over the frame rather than as cloth. */
    w += (mmFbm3(vec2(p.y*7.0 + uSeed*3.0, uSeed)) - 0.5) * 0.045;
    m = smoothstep(w, w - 0.20, p.x);
  } else if (uMode < 1.5) {
    // top lintel with a sagging cobweb edge
    float sag = 0.13 + 0.075*sin(p.x*3.14159) + 0.05*mmFbm3(vec2(p.x*3.4, uSeed));
    m = smoothstep(1.0 - sag - 0.14, 1.0 - sag + 0.03, p.y);
  } else {
    // foreground clutter band with a ragged top edge
    float top = 0.075 + 0.055*mmFbm3(vec2(p.x*3.0 + uSeed, 0.0)) + 0.03*mmRidge(vec2(p.x*8.0, uSeed));
    m = smoothstep(top + 0.05, top - 0.05, p.y);
  }
  if (m < 0.004) discard;
  vec3 col = uColor * (0.30 + 0.60*mmFbm3(p*5.0 + uSeed*3.0));
  float rim = smoothstep(0.02, 0.16, m) * (1.0 - smoothstep(0.16, 0.42, m));
  col += uRim * rim * 0.14;
  col *= (1.0 - uDread*0.25);
  gl_FragColor = vec4(col, m*uAmount);
}`;

/* ------------------------------------------------------------ visible flames */
/* A billboard at every practical light. This is the only thing in the frame that
   is *supposed* to clip to white: a candle core, a lamp filament, a wisp. It is
   also what gives the bloom pass something legitimate to work on. */

export const FLAME_VERT = /* glsl */`
attribute vec3  aPos;
attribute vec3  aCol;
attribute vec3  aParam;      // x halo size (m), y intensity, z 1 = a real flame
attribute float aSeed;
varying vec2  vUv;
varying vec3  vCol;
varying float vInt, vSeed, vWick, vFlame;
uniform float uTime;
void main(){
  vUv = uv; vCol = aCol; vInt = aParam.y; vSeed = aSeed; vWick = aParam.z;
  /* How much of this quad a real flame occupies. The quad is sized to the
     light's RADIUS, which is the reach of its glow, not the size of its
     flame -- a Foyer lamp of radius 6.9 was drawing a 0.73 m teardrop, and
     that is the white disc in every capture of every room. A flame is nine
     centimetres. FLAME_FRAG scales its core by this and leaves the halo
     alone. */
  vFlame = clamp(0.09 / max(aParam.x, 0.02), 0.05, 1.0);
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float s = aParam.x;
  // a flame leans and stretches; a wisp just breathes
  float lean = sin(uTime*1.9 + aSeed*13.0)*0.06 + sin(uTime*4.7 + aSeed*7.0)*0.025;
  vec2 q = (uv - vec2(0.5, 0.5)) * 2.0;
  mv.x += (q.x*0.62 + q.y*lean) * s;
  mv.y += q.y * s;
  gl_Position = projectionMatrix * mv;
}`;

export const FLAME_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform float uTime, uDread;
varying vec2  vUv;
varying vec3  vCol;
varying float vInt, vSeed, vWick, vFlame;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(vec2(p.x*1.25, p.y));

  /* THE FLAME, at nine centimetres of world space however far the light
     reaches. Its coordinates are the quad's, divided by the share of the quad
     a flame actually occupies, and it sits at the quad's centre so the visible
     source and the illumination stay in the same place. */
  vec2 f = p / max(vFlame, 0.02);
  float taper = 1.0 - smoothstep(-0.55, 0.95, f.y);
  vec2 cq = vec2(f.x / max(0.16 + 0.34*taper, 0.02), (f.y + 0.30) / 0.62);
  float wob = mmFbm3(vec2(vUv.x*3.0 + vSeed, uTime*1.6 + vSeed*5.0)) - 0.5;
  float core = 1.0 - smoothstep(0.55, 1.05, length(cq) + wob*0.22);

  /* A tighter halo. The old pair of exponentials put more light outside the
     flame than in it, and the bloom pass and the grade's halation then spread
     that again. */
  float halo = exp(-r*3.30) * 0.52 + exp(-r*7.6) * 0.62;

  /* A WISP IS NOT A FLAME. vWick is 1 for a warm, flickering lamp standing in
     the room and 0 for a will-o'-the-wisp or a cold moon spill -- and the cold
     ones were being drawn with a candle's teardrop and a white-hot tip, which
     is the wrong object. A wisp is a round, even core in its own colour.
     Blending on vWick keeps one program for both. */
  float round_ = 1.0 - smoothstep(0.35, 1.0, length(f) * 0.72);
  core = mix(round_, core, vWick);

  /* An orange body under a white-hot tip -- the flame in UI/selectKid.png --
     and not a white core inside a warm ring. */
  vec3 hot  = mix(vCol * vec3(1.18, 1.10, 1.05), vec3(1.0, 0.93, 0.80), vWick);
  vec3 body = mix(vCol * vec3(1.06, 0.70, 0.34), hot,
                  smoothstep(0.1, 0.85, f.y + 0.25));
  body = mix(vCol * 1.10, body, vWick);
  vec3 col = vCol * halo * 0.80 + body * core * 1.95
           + hot * pow(core, 3.4) * (0.55 + 1.00*vWick);
  float a = clamp(halo*0.8 + core, 0.0, 1.0);

  col *= vInt * (1.0 - uDread*0.35);

  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;
