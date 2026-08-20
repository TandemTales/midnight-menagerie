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
uniform float uGloss, uAlbLift;
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

/* Relief height field, in metres of apparent depth. One branch per mode. */
float wallH(vec2 q){
  float h = mmNoise(q*2.3 + uSeed)*0.14;   // one octave: this runs 3x per pixel

  if (uArch < 0.5) {
    // ---- PANEL: wainscot, chair rail, tall stiles, crown, arched doorway ----
    float wain = smoothstep(1.06, 1.02, q.y);
    vec2 qw = vec2(mod(q.x + uSeed*0.7, 1.30) - 0.65, q.y - 0.58);
    h -= wain * (1.0 - smoothstep(-0.02, 0.05, mmBox(qw, vec2(0.44,0.33), 0.06))) * 0.55;
    h += smoothstep(1.04, 1.08, q.y) * smoothstep(1.26, 1.22, q.y) * 1.20;   // chair rail
    h += smoothstep(0.20, 0.16, q.y) * 0.85;                                 // baseboard
    vec2 qu = vec2(mod(q.x + uSeed*0.7, 2.60) - 1.30, q.y - 3.30);
    float up = smoothstep(1.30, 1.42, q.y);
    h -= up * (1.0 - smoothstep(-0.02, 0.06, mmBox(qu, vec2(0.92,1.55), 0.09))) * 0.42;
    h += smoothstep(uCeil-0.35, uCeil-0.20, q.y) * smoothstep(uCeil+0.35, uCeil+0.15, q.y) * 1.10;
    // framed portraits either side of the doorway
    float fx = mod(q.x + uSize.x*0.5 + 3.1, 6.2) - 3.1;
    float inner = mmBox(vec2(fx, q.y - 3.55), vec2(0.62, 0.86), 0.03);
    float outer = mmBox(vec2(fx, q.y - 3.55), vec2(0.80, 1.04), 0.05);
    float onWall = smoothstep(1.55, 1.75, q.y) * smoothstep(uCeil-0.5, uCeil-0.9, q.y);
    h += onWall * (smoothstep(0.03, -0.03, outer) - smoothstep(0.03, -0.03, inner)) * 1.5;
    h -= onWall * smoothstep(0.02, -0.02, inner) * 0.45;
    float a = archSD(q);
    h += (1.0 - smoothstep(0.0, 0.14, abs(a))) * 1.40;                       // arch moulding
    h -= smoothstep(0.02, -0.02, a) * 4.0;                                   // the opening

  } else if (uArch < 1.5) {
    // ---- GLASS: mullioned conservatory / bathhouse glazing ------------------
    float mx = abs(fract(q.x/1.05 + 0.5) - 0.5) * 1.05;
    float my = abs(fract((q.y-0.9)/1.35 + 0.5) - 0.5) * 1.35;
    h += (1.0 - smoothstep(0.035, 0.085, mx)) * 1.05;
    h += (1.0 - smoothstep(0.030, 0.075, my)) * 0.85;
    h += (1.0 - smoothstep(0.05, 0.16, abs(q.y - 0.90))) * 0.9;              // sill
    h += mmFbm3(q*2.4 + uTime*0.02)*0.40;                                    // condensation

  } else if (uArch < 2.5) {
    // ---- STONE: coursed blocks with recessed niches -------------------------
    float row = floor(q.y/0.52);
    float off = mod(row, 2.0)*0.62 + mmHash11(row+uSeed)*0.30;
    float bx = abs(fract((q.x+off)/1.24 + 0.5) - 0.5) * 1.24;
    float by = abs(fract(q.y/0.52 + 0.5) - 0.5) * 0.52;
    h -= (1.0 - smoothstep(0.02, 0.07, bx)) * 0.85;
    h -= (1.0 - smoothstep(0.02, 0.06, by)) * 0.85;
    h += mmFbm3(q*4.2 + row)*0.50;
    float nx = mod(q.x + 2.1, 7.6) - 3.8;
    float nb = mmArch(vec2(nx, q.y - 1.10), 0.48, 1.35);
    h -= smoothstep(0.03, -0.03, nb) * 1.7;
    h += (1.0 - smoothstep(0.0, 0.11, abs(nb))) * 0.85;

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
    h += (1.0 - smoothstep(0.11, 0.21, px)) * 1.05;                          // uprights
    h += (1.0 - smoothstep(0.08, 0.18, abs(q.y - uCeil*0.74))) * 1.15;       // top rail
    h += (1.0 - smoothstep(0.06, 0.14, abs(q.y - uCeil*0.40))) * 0.70;       // mid rail
    float bx = mod(q.x, 2.4) - 1.2;
    h += (1.0 - smoothstep(0.0, 0.10, abs(mmCircle(vec2(bx, q.y-uCeil*0.74), 0.32)))) * 0.95;
    h += mmFbm3(q*3.6 + uSeed)*0.32;

  } else {
    // ---- EXTERIOR: distant roofline against open sky -------------------------
    // Only the silhouette matters here; the sky is painted in the colour pass.
    float cx = q.x - uSize.x*0.5;
    float roof = 2.1
      + 1.5 * smoothstep(9.0, 3.0, abs(cx - 4.0))
      + 2.4 * smoothstep(6.5, 1.0, abs(cx + 3.0))
      + 0.9 * mmFbm3(vec2(cx*0.30 + uSeed, 0.0));
    float gable = max(0.0, 1.9 - abs(cx + 3.0)*0.55);
    roof += gable;
    h += smoothstep(roof + 0.25, roof - 0.25, q.y) * 1.4;
    // treeline in front of it
    float tree = 1.3 + mmRidge(vec2(cx*0.62 + uSeed*2.0, 0.0))*1.9;
    h += smoothstep(tree + 0.2, tree - 0.2, q.y) * 0.7;
  }
  return h;
}

/* Night sky used by the exterior mode: gradient, stars, moon and its halo. */
vec3 skyColor(vec2 q, float horizon){
  vec2 c = vec2(q.x - uSize.x*0.5, q.y);
  float up = clamp((q.y - horizon) / max(uSize.y - horizon, 1.0), 0.0, 1.0);
  vec3 sky = mix(uOpenGlow, uDeep, smoothstep(0.0, 0.85, up));
  // stars
  vec2 sp = c * 2.6;
  float star = smoothstep(0.982, 1.0, mmHash21(floor(sp)));
  float tw = 0.55 + 0.45*sin(uTime*1.7 + mmHash21(floor(sp))*40.0);
  sky += vec3(0.9, 0.94, 1.0) * star * tw * 0.85 * smoothstep(0.0, 0.25, up);
  // moon + halo
  vec2 mc = vec2(uSize.x*0.30, uSize.y*0.74);
  float md = length(vec2(q.x, q.y) - mc);
  float disc = smoothstep(1.30, 1.16, md);
  float crater = 0.82 + 0.18*mmFbm3((vec2(q.x,q.y) - mc)*3.4);
  sky += vec3(1.0, 0.97, 0.88) * disc * 1.85 * crater;
  sky += vec3(0.80, 0.86, 1.0) * exp(-md*0.34) * 0.55;   // real halo, not a hard disc
  return sky;
}

void main(){
  vec2 q = vUv * uSize;                     // metres, origin at floor-left

  float h  = wallH(q);
  float hx = wallH(q + vec2(0.05, 0.0));
  float hy = wallH(q + vec2(0.0, 0.05));
  vec3  nrm = normalize(vec3(h - hx, h - hy, 0.42));

  // ---- albedo ---------------------------------------------------------------
  float up = clamp(q.y/max(uCeil, 1.0), 0.0, 1.0);
  vec3 alb = mix(uDeep, uMid, smoothstep(0.0, 0.80, up));
  alb = mix(alb, uHi, smoothstep(0.55, 1.02, up)*0.62);
  alb += uAlbLift;

  float motif = mmFbm3(q*0.52 + uSeed*3.0);
  alb *= 0.78 + 0.46*motif;                                 // wallpaper / surface motif

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
    float glow = uOpen * (0.30 + 0.70*smoothstep(2.6, -0.1, q.y))
               * (0.86 + 0.14*sin(uTime*0.9 + q.y*0.7));
    col = mix(col, mix(uDeep*0.24*uGain, uOpenGlow*uGain*1.15, glow), inside);
    col += uOpenGlow * uGain * uOpen * 0.20 * smoothstep(1.9, 0.0, abs(a)) * (1.0 - inside);
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
    col += uOpenGlow * lit * 3.1 * uOpen;
    col += uOpenGlow * onHouse * uOpen * 1.05 * exp(-max(pane, 0.0)*4.2) * (1.0 - lit);
  }

  // ---- ceiling falls away into darkness -------------------------------------
  if (uArch < 4.5) {
    col *= mix(1.0, 0.10, smoothstep(uCeil, uCeil + 2.4, q.y));
    col *= mix(0.42, 1.0, smoothstep(0.0, 1.6, q.y));            // grounded base shadow
    col *= mix(0.58, 1.0, smoothstep(uCeil, uCeil - 1.5, q.y));  // shadow under the cornice
  }

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

  float pat = 0.0;
  if (uPattern < 0.5) {                      // 0 planks
    float row = floor(w.y/0.95);
    float ox  = mmHash11(row+uSeed)*2.0;
    pat  = (1.0 - smoothstep(0.012, 0.055, abs(fract((w.x+ox)/1.45 + 0.5) - 0.5)*1.45)) * 0.60;
    pat += (1.0 - smoothstep(0.012, 0.050, abs(fract(w.y/0.95 + 0.5) - 0.5)*0.95)) * 0.35;
    pat = 0.55 - pat;
  } else if (uPattern < 1.5) {               // 1 checker tile
    vec2 t = floor(w/0.78);
    pat = mod(t.x + t.y, 2.0)*0.62;
    float gx = abs(fract(w.x/0.78 + 0.5) - 0.5)*0.78;
    float gy = abs(fract(w.y/0.78 + 0.5) - 0.5)*0.78;
    pat -= (1.0 - smoothstep(0.008, 0.030, min(gx, gy)))*0.45;
  } else if (uPattern < 2.5) {               // 2 irregular flagstone
    vec2 cell = vec2(1.45, 1.00);
    float row = floor(w.y/cell.y);
    float ox  = mmHash11(row + uSeed)*cell.x;
    vec2 g  = vec2(fract((w.x+ox)/cell.x), fract(w.y/cell.y));
    vec2 id = vec2(floor((w.x+ox)/cell.x), row);
    float slab = mmHash11(id.x*17.3 + id.y*31.7 + uSeed);
    float dx = min(g.x, 1.0-g.x)*cell.x;
    float dy = min(g.y, 1.0-g.y)*cell.y;
    float joint = 1.0 - smoothstep(0.025, 0.10, min(dx, dy));
    pat = (0.48 + 0.55*slab) - joint*0.80 + mmFbm3(w*2.6 + slab)*0.22;
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
    float bar = 1.0 - smoothstep(0.035, 0.10, min(gx, gy));
    pat = 0.95 - bar*0.75 + mmFbm3(w*3.2 + uSeed)*0.16;
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
  alb *= 0.55 + 0.90*pat;
  alb += uAlbLift;
  alb *= mix(0.58, 1.0, smoothstep(uSpan.x*0.52, uSpan.x*0.24, abs(w.x)));   // creeps into shadow at the walls

  vec3 N = vec3(0.0, uIsCeiling > 0.5 ? -1.0 : 1.0, 0.0);
  vec3 V = normalize(uCamera - vWorld);
  vec3 col = alb * (uAmbient + uAccent * 0.09);
  float smear = 0.55 + 0.55*mmFbm3(w*1.4);   // hoisted: was evaluated per light

  for (int i = 0; i < 5; i++){
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec2 d = w - L.xy;
    float dist = length(d);
    float att = mmAtten(dist, L.z, L.w);
    col += alb * uLightCol[i] * att * 1.05;
    // wet-floor smear pulling the light toward the camera
    float streak = exp(-abs(d.x)*smear) * exp(-max(d.y, 0.0)*0.30);
    col += alb * uLightCol[i] * att * streak * uGloss * 3.4;
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
    float grain = 0.80 + 0.34*mmFbm3(w*1.7 + float(i)*7.3);
    col += uPoolCol[i] * P.w * (core*1.15 + spill) * grain * (0.16 + 0.84*mmLum(alb)*3.4) * 0.50;
  }

  col *= uGain;
  // the ceiling is the one surface the eye forgives being dark; overhead near
  // the camera it must fall away or it flares out the top of the frame
  col *= mix(1.0, mix(0.06, 0.85, smoothstep(1.5, 13.0, vDepth)), uIsCeiling);
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
varying float vShape, vSeed, vTone, vFog;
uniform float uFogNear, uFogFar, uSway, uTime;
void main(){
  vUv = uv; vShape = aShape; vSeed = aSeed; vTone = aTone;
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
uniform float uRimAmt, uDread, uGain, uGloss;
uniform vec2  uKeyDir;   // screen-space direction toward the key light
uniform vec4  uLights[5];      // xyz world, w radius
uniform vec3  uLightCol[5];
uniform float uLightInt[5];
varying vec2  vUv;
varying vec3  vWorld;
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
    d = mmBox(p - vec2(0.0,0.10), vec2(0.16,0.10), 0.04);
    for (int i = 0; i < 7; i++){
      float f = float(i)/6.0;
      float a = (f - 0.5)*2.3 + (mmHash11(seed+float(i))-0.5)*0.6;
      vec2 tip = vec2(sin(a)*0.42, 0.24 + cos(a)*0.50 + mmHash11(seed*3.0+float(i))*0.20);
      d = mmSmin(d, mmCircle(p - tip, 0.070 + 0.030*mmHash11(seed+f)), 0.13);
    }
  } else if (shape < 3.5) {               // 3 — headstone
    d = mmArch(p - vec2(0.0, 0.08), 0.26, 0.44);
    d = min(d, mmBox(p - vec2(0.0,0.06), vec2(0.34,0.06), 0.02));
  } else if (shape < 4.5) {               // 4 — chandelier, hangs from the top
    d = mmBox(g + vec2(0.0,0.20), vec2(0.016,0.20), 0.01);
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
    d = mmBox(p - vec2(0.0,0.48), vec2(0.14 + 0.022*sin(uv.y*3.0), 0.48), 0.02);
    d = min(d, mmBox(p - vec2(0.0,0.06), vec2(0.23,0.06), 0.02));
    d = min(d, mmBox(p - vec2(0.0,0.94), vec2(0.25,0.07), 0.03));
  } else if (shape < 7.5) {               // 7 — hanging drape
    float fold = 0.085*sin(uv.x*19.0 + seed*9.0)*uv.y;
    d = mmBox(g + vec2(fold, 0.48), vec2(0.30, 0.50), 0.05);
    d = mmSmin(d, mmCircle(g - vec2(-fold, -1.00), 0.15), 0.22);
  } else if (shape < 8.5) {               // 8 — crate stack
    d = mmBox(p - vec2(-0.10,0.22), vec2(0.24,0.22), 0.02);
    d = min(d, mmBox(p - vec2(0.16,0.62), vec2(0.19,0.19), 0.02));
  } else if (shape < 9.5) {               // 9 — shrub / hedge blob
    for (int i = 0; i < 5; i++){
      float f = float(i)/4.0;
      vec2 cc = vec2((f-0.5)*0.62, 0.20 + 0.32*mmHash11(seed+float(i)*3.7));
      d = mmSmin(d, mmCircle(p - cc, 0.20 + 0.10*mmHash11(seed*2.0+f)), 0.16);
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
    d = mmBox(p - vec2(0.0,0.13), vec2(0.22,0.13), 0.02);
    d = min(d, mmBox(p - vec2(0.0,0.28), vec2(0.17,0.05), 0.02));
    d = mmSmin(d, mmCaps(p - vec2(0.0,0.32), 0.36, 0.13), 0.09);      // torso
    d = mmSmin(d, mmCircle(p - vec2(0.02,0.80), 0.095), 0.05);        // head
    d = mmSmin(d, mmCaps(p - vec2(-0.16,0.44), 0.22, 0.045), 0.06);   // arm
    d = mmSmin(d, mmCircle(p - vec2(0.20,0.66), 0.06), 0.06);         // raised hand
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
  float mask = smoothstep(0.0, 0.014, f);
  if (mask < 0.004) discard;

  /* --- an SDF-derived 3D normal -------------------------------------------
     The prop is a flat quad, but the coverage field gives us a gradient, and
     treating the shape as a rounded slab turns that gradient into a normal
     that faces outward at the silhouette and toward the camera in the middle.
     That is what makes a crown read brighter than a base under a high light. */
  float fa = shapeField(vUv + vec2(0.013, 0.0), vShape, vSeed);
  float fb = shapeField(vUv + vec2(0.0, 0.013), vShape, vSeed);
  vec2  g  = normalize(vec2(fa - f, fb - f) + 1e-6);        // points inward
  float edge = 1.0 - smoothstep(0.0, 0.085, f);
  vec3  N  = normalize(vec3(-g * edge * 1.75, 0.62 + 0.38*(1.0 - edge)));
  // surface break-up so the body is not a smooth CG gradient
  N = normalize(N + vec3((mmFbm3(vUv*9.0 + vSeed*3.1) - 0.5)*0.34,
                         (mmFbm3(vUv*9.0 + vSeed*7.7) - 0.5)*0.34, 0.0));

  float facing = max(dot(-g, uKeyDir), 0.0);
  float band = 1.0 - smoothstep(0.002, 0.042, f);

  /* --- albedo: a real material, not near-black ---------------------------- */
  vec3 albedo = mix(uAlbedo, uAlbedoHi, clamp(vUv.y*0.85 + 0.10, 0.0, 1.0));
  albedo *= 0.70 + 0.60*vTone;
  albedo *= 0.84 + 0.34*mmFbm3(vUv*7.0 + vSeed*5.0);

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

  vec3 col = albedo * (uAmbient + uAccent * 0.13 + diff * 1.45) + spec * 1.25;
  col *= uGain;

  /* --- rim: the edge that separates a prop from the wall behind it -------- */
  float rim = pow(band, 1.5) * (0.12 + 0.88*pow(facing, 1.4)) * mask;
  col += (uRim * 0.11 + raw * 0.15) * rim * uRimAmt;

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
varying float vStrength, vFade;
uniform float uFogNear, uFogFar;
void main(){
  vUv = uv; vStrength = aStrength;
  vec3 wp = vec3(position.x * aScale.x, 0.0, position.y * aScale.y) + aOffset;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vFade = 1.0 - smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const SHADOW_FRAG = /* glsl */`
precision highp float;
varying vec2  vUv;
varying float vStrength, vFade;
void main(){
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * vStrength * vFade;
  gl_FragColor = vec4(vec3(1.0 - a), 1.0);
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
  float edge   = smoothstep(0.0, 0.85, across);
  /* The old shader faded the shaft out at its own bottom edge, so every beam in
     the game stopped in mid-air. Now the beam keeps its strength all the way to
     the floor and BRIGHTENS into the contact, which is where the eye expects the
     pool to be. */
  float along  = smoothstep(0.0, 0.42, vUv.y);
  float land   = 1.0 + 0.85 * smoothstep(0.55, 1.0, vGround) * (1.0 - smoothstep(1.0, 1.22, vGround));
  float cut    = 1.0 - smoothstep(1.0, 1.18, vGround);
  float d = mmFbm3(vec2(vUv.x*6.0 + vSeed*11.0, vUv.y*2.4 - uTime*0.09));
  float body = pow(edge, 2.2)*along*land*cut*(0.34 + 0.86*d);
  vec3 col = uColor * body * vInt * 0.78 * (1.0 - uDread*0.45);
  gl_FragColor = vec4(col, body*0.62);
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
    m = smoothstep(w, w - 0.34, p.x);
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
attribute vec2  aParam;      // x size (m), y intensity
attribute float aSeed;
varying vec2  vUv;
varying vec3  vCol;
varying float vInt, vSeed;
uniform float uTime;
void main(){
  vUv = uv; vCol = aCol; vInt = aParam.y; vSeed = aSeed;
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
varying float vInt, vSeed;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(vec2(p.x*1.25, p.y));
  // teardrop core, wider at the base, drawn up to a point
  float taper = 1.0 - smoothstep(-0.55, 0.95, p.y);
  vec2 cq = vec2(p.x / max(0.16 + 0.34*taper, 0.02), (p.y + 0.30) / 0.62);
  float wob = mmFbm3(vec2(vUv.x*3.0 + vSeed, uTime*1.6 + vSeed*5.0)) - 0.5;
  float core = 1.0 - smoothstep(0.55, 1.05, length(cq) + wob*0.22);
  float halo = exp(-r*2.35) * 0.85 + exp(-r*6.0) * 0.7;
  vec3 col = vCol * (halo*0.85 + core*1.9) + vec3(1.0, 0.96, 0.88) * pow(core, 2.6) * 2.1;
  col *= vInt * (1.0 - uDread*0.35);
  float a = clamp(halo*0.8 + core, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;
