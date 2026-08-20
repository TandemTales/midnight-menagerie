/**
 * Backdrop GLSL: far wall (5 architecture modes), floor, silhouette props,
 * light shafts and the near frame.
 * OWNER: atmosphere agent.
 *
 * Everything is procedural — there is no environment art in the project — so each
 * shader carries a relief height field and lights it with the scene's real candle
 * positions. That is what makes candlelight read as *lighting the mansion* rather
 * than as a glow sprite pasted on top.
 *
 * All wall/floor features are authored in WORLD METRES (1 unit = 1 m, eye height
 * 2.2 m) so a chair rail is a chair rail at any plane size.
 */
import { GLSL_LIB } from './common.js';

/* ------------------------------------------------------------------ far wall */

export const WALL_VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const WALL_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform float uTime, uSeed, uDread, uFogAmt, uArch, uCool, uGrime, uOpen, uCeil, uGain;
uniform vec2  uSize;           // wall plane size in metres (w, h)
uniform vec3  uDeep, uMid, uHi, uAccent, uFog, uOpenGlow;
uniform vec4  uLights[4];      // xy in wall-local metres, z radius, w intensity
uniform vec3  uLightCol[4];
varying vec2  vUv;

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
    h += smoothstep(6.05, 6.20, q.y) * smoothstep(6.75, 6.55, q.y) * 1.10;   // crown
    // framed portraits either side of the doorway
    float fx = mod(q.x + uSize.x*0.5 + 3.1, 6.2) - 3.1;
    float inner = mmBox(vec2(fx, q.y - 3.55), vec2(0.62, 0.86), 0.03);
    float outer = mmBox(vec2(fx, q.y - 3.55), vec2(0.80, 1.04), 0.05);
    float onWall = smoothstep(1.55, 1.75, q.y) * smoothstep(5.9, 5.7, q.y);
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

  } else {
    // ---- INDUSTRIAL: rafters, pipes, hanging lamp rails ---------------------
    float px = abs(fract(q.x/2.4 + 0.5) - 0.5) * 2.4;
    h += (1.0 - smoothstep(0.11, 0.21, px)) * 1.05;                          // uprights
    h += (1.0 - smoothstep(0.08, 0.18, abs(q.y - 4.90))) * 1.15;             // top rail
    h += (1.0 - smoothstep(0.06, 0.14, abs(q.y - 2.60))) * 0.70;             // mid rail
    float bx = mod(q.x, 2.4) - 1.2;
    h += (1.0 - smoothstep(0.0, 0.10, abs(mmCircle(vec2(bx, q.y-4.90), 0.32)))) * 0.95;
    h += mmFbm3(q*3.6 + uSeed)*0.32;
  }
  return h;
}

void main(){
  vec2 q = vUv * uSize;                     // metres, origin at floor-left

  float h  = wallH(q);
  float hx = wallH(q + vec2(0.05, 0.0));
  float hy = wallH(q + vec2(0.0, 0.05));
  vec3  nrm = normalize(vec3(h - hx, h - hy, 0.42));

  // ---- albedo ---------------------------------------------------------------
  float up = clamp(q.y/6.0, 0.0, 1.0);
  vec3 alb = mix(uDeep, uMid, smoothstep(0.0, 0.80, up));
  alb = mix(alb, uHi, smoothstep(0.60, 1.02, up)*0.55);

  float motif = mmFbm3(q*0.52 + uSeed*3.0);
  alb *= 0.74 + 0.52*motif;                                 // wallpaper / surface motif

  float grime = mmFbm3(q*0.30 - uSeed);
  float corner = smoothstep(1.6, 0.0, q.y)*0.7
               + smoothstep(uSize.x*0.34, 0.0, q.x)
               + smoothstep(uSize.x*0.66, uSize.x, q.x);
  alb *= mix(1.0, clamp(0.44 + 0.62*grime - 0.30*corner, 0.0, 1.4), uGrime);

  // ---- lighting -------------------------------------------------------------
  vec3 col = alb * uAccent * uCool * 0.30 * (0.25 + 0.75*max(nrm.y, 0.0) + 0.30*max(nrm.z, 0.0));

  for (int i = 0; i < 4; i++){
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec2 d = q - L.xy;
    float dist = length(d);
    float k = dist/L.z;
    float att = L.w / (1.0 + k*k*k*1.6);          // tighter than inverse-square: real pools
    vec3 ldir = normalize(vec3(d, -3.0));
    float ndl = max(dot(nrm, -ldir), 0.0);
    col += alb * uLightCol[i] * att * (0.18 + 1.15*ndl);
  }

  col *= uGain;

  // ---- the doorway breathes cold light from the next room -------------------
  if (uArch < 0.5) {
    float a = archSD(q);
    float inside = smoothstep(0.02, -0.06, a);
    float glow = uOpen * (0.28 + 0.72*smoothstep(2.6, -0.1, q.y))
               * (0.84 + 0.16*sin(uTime*0.9 + q.y*0.7));
    col = mix(col, mix(uDeep*0.20*uGain, uOpenGlow*uGain*0.85, glow), inside);
    col += uOpenGlow * uGain * uOpen * 0.16 * smoothstep(1.9, 0.0, abs(a)) * (1.0 - inside);
  }

  // ---- ceiling falls away into darkness -------------------------------------
  col *= mix(1.0, 0.05, smoothstep(uCeil, uCeil + 2.4, q.y));
  col *= mix(0.30, 1.0, smoothstep(0.0, 1.6, q.y));            // grounded base shadow
  col *= mix(0.45, 1.0, smoothstep(uCeil, uCeil - 1.5, q.y));  // shadow under the cornice

  // ---- painterly break-up + depth fog ---------------------------------------
  col *= 0.88 + 0.24*motif;
  col = mix(col, uFog, uFogAmt * (0.50 + 0.50*smoothstep(6.0, 0.0, q.y)));
  col = mmDesat(col, uDread*0.55) * (1.0 - uDread*0.30);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* -------------------------------------------------------------------- floor */

export const FLOOR_VERT = /* glsl */`
varying vec2 vUv;
varying float vDepth;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const FLOOR_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform float uTime, uSeed, uDread, uFogNear, uFogFar, uGloss, uPattern, uGain;
uniform vec2  uSpan;           // plane size in metres (x, z)
uniform vec3  uDeep, uMid, uFog, uAccent;
uniform vec4  uLights[4];      // xy = floor-local metres (x, z), z radius, w intensity
uniform vec3  uLightCol[4];
varying vec2  vUv;
varying float vDepth;

void main(){
  vec2 w = (vUv - 0.5) * uSpan;

  float pat = 0.0;
  if (uPattern < 0.5) {                      // planks
    float row = floor(w.y/0.95);
    float ox  = mmHash11(row+uSeed)*2.0;
    pat  = (1.0 - smoothstep(0.012, 0.055, abs(fract((w.x+ox)/1.45 + 0.5) - 0.5)*1.45)) * 0.60;
    pat += (1.0 - smoothstep(0.012, 0.050, abs(fract(w.y/0.95 + 0.5) - 0.5)*0.95)) * 0.35;
    pat = 0.55 - pat;
  } else if (uPattern < 1.5) {               // checker tile
    vec2 t = floor(w/0.78);
    pat = mod(t.x + t.y, 2.0)*0.55;
    float gx = abs(fract(w.x/0.78 + 0.5) - 0.5)*0.78;
    float gy = abs(fract(w.y/0.78 + 0.5) - 0.5)*0.78;
    pat -= (1.0 - smoothstep(0.008, 0.030, min(gx, gy)))*0.45;
  } else if (uPattern < 2.5) {               // irregular flagstone
    vec2 cell = vec2(1.45, 1.00);
    float row = floor(w.y/cell.y);
    float ox  = mmHash11(row + uSeed)*cell.x;
    vec2 g  = vec2(fract((w.x+ox)/cell.x), fract(w.y/cell.y));
    vec2 id = vec2(floor((w.x+ox)/cell.x), row);
    float slab = mmHash11(id.x*17.3 + id.y*31.7 + uSeed);
    float dx = min(g.x, 1.0-g.x)*cell.x;
    float dy = min(g.y, 1.0-g.y)*cell.y;
    float joint = 1.0 - smoothstep(0.025, 0.10, min(dx, dy));
    pat = (0.45 + 0.55*slab) - joint*0.80 + mmFbm3(w*2.6 + slab)*0.22;
  } else {                                   // coffered ceiling beams
    float bx = abs(fract(w.x/2.70 + 0.5) - 0.5)*2.70;
    float by = abs(fract(w.y/2.70 + 0.5) - 0.5)*2.70;
    pat = (1.0 - smoothstep(0.10, 0.34, min(bx, by)))*0.45
        + mmFbm3(w*1.3 + uSeed)*0.30;
  }

  vec3 alb = mix(uDeep, uMid, 0.18 + 0.80*mmFbm3(w*0.42 + uSeed));
  alb *= 0.50 + 0.85*pat;
  alb *= mix(0.45, 1.0, smoothstep(18.0, 9.0, abs(w.x)));   // creeps into shadow at the walls

  vec3 col = alb * uAccent * 0.20;
  float smear = 0.55 + 0.55*mmFbm3(w*1.4);   // hoisted: was evaluated per light

  for (int i = 0; i < 4; i++){
    vec4 L = uLights[i];
    if (L.w <= 0.001) continue;
    vec2 d = w - L.xy;
    float dist = length(d);
    float k = dist/L.z;
    float att = L.w / (1.0 + k*k*k*1.5);
    col += alb * uLightCol[i] * att * 1.35;
    // wet-floor smear pulling the light toward the camera
    float streak = exp(-abs(d.x)*smear) * exp(-max(d.y, 0.0)*0.30);
    col += alb * uLightCol[i] * att * streak * uGloss * 3.0;
  }

  col *= uGain;
  col *= mix(0.30, 1.0, smoothstep(3.0, 15.0, vDepth));    // foreground falls away
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
varying vec3  vLight;
varying float vShape, vSeed, vTone, vFog;
uniform float uFogNear, uFogFar, uSway, uTime;
uniform vec4  uLights[4];      // xyz world, w radius
uniform vec3  uLightCol[4];
uniform float uLightInt[4];
void main(){
  vUv = uv; vShape = aShape; vSeed = aSeed; vTone = aTone;
  vec3 pos = vec3(position.xy * aScale, 0.0);
  pos.x += sin(uTime*0.55 + aSeed*31.0) * uSway * (0.25 + uv.y*0.75) * aScale.y * 0.018;
  vec3 wp = pos + aOffset;
  // props are lit by the same four candles as the wall — that is what stops them
  // reading as flat cut-outs pasted over the room
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 4; i++){
    if (uLightInt[i] <= 0.001) continue;
    float d = distance(wp, uLights[i].xyz);
    lit += uLightCol[i] * (uLightInt[i] / (1.0 + (d/uLights[i].w)*(d/uLights[i].w)));
  }
  vLight = lit;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const PROP_FRAG = /* glsl */`
precision highp float;
${GLSL_LIB}
uniform vec3  uDeep, uFog, uRim, uAccent;
uniform vec2  uKeyDir;
uniform float uRimAmt, uDread, uGain;
varying vec2  vUv;
varying vec3  vLight;
varying float vShape, vSeed, vTone, vFog;

/* Soft coverage field in local uv space; > 0 is inside the silhouette. */
float shapeField(vec2 uv, float shape, float seed){
  vec2 p = uv - vec2(0.5, 0.0);          // origin at bottom centre
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
    vec2 g = uv - vec2(0.5, 1.0);
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
  } else if (shape < 6.5) {               // 6 — column with capital
    d = mmBox(p - vec2(0.0,0.48), vec2(0.14 + 0.022*sin(uv.y*3.0), 0.48), 0.02);
    d = min(d, mmBox(p - vec2(0.0,0.06), vec2(0.23,0.06), 0.02));
    d = min(d, mmBox(p - vec2(0.0,0.94), vec2(0.25,0.07), 0.03));
  } else if (shape < 7.5) {               // 7 — hanging drape
    vec2 g = uv - vec2(0.5, 1.0);
    float fold = 0.085*sin(uv.x*19.0 + seed*9.0)*uv.y;
    d = mmBox(g + vec2(fold, 0.48), vec2(0.30, 0.50), 0.05);
    d = mmSmin(d, mmCircle(g - vec2(-fold, -1.00), 0.15), 0.22);
  } else if (shape < 8.5) {               // 8 — crate stack
    d = mmBox(p - vec2(-0.10,0.22), vec2(0.24,0.22), 0.02);
    d = min(d, mmBox(p - vec2(0.16,0.62), vec2(0.19,0.19), 0.02));
  } else {                                // 9 — shrub / hedge blob
    for (int i = 0; i < 5; i++){
      float f = float(i)/4.0;
      vec2 cc = vec2((f-0.5)*0.62, 0.20 + 0.32*mmHash11(seed+float(i)*3.7));
      d = mmSmin(d, mmCircle(p - cc, 0.20 + 0.10*mmHash11(seed*2.0+f)), 0.16);
    }
  }
  d += (mmFbm3(uv*5.0 + seed*17.0) - 0.5) * 0.022;   // erode the CG-clean edge
  return -d;
}

void main(){
  float f = shapeField(vUv, vShape, vSeed);
  float mask = smoothstep(0.0, 0.014, f);
  if (mask < 0.004) discard;

  // coherent rim: outward edge normal, lit only where it faces the key light
  float fa = shapeField(vUv + vec2(0.013, 0.0), vShape, vSeed);
  float fb = shapeField(vUv + vec2(0.0, 0.013), vShape, vSeed);
  vec2  n  = normalize(vec2(fa - f, fb - f) + 1e-6);       // points inward
  float facing = max(dot(-n, uKeyDir), 0.0);
  float band = 1.0 - smoothstep(0.002, 0.040, f);
  float rim  = pow(band, 1.4) * pow(facing, 1.5) * mask;

  vec3 albedo = uDeep * (0.22 + 0.85*vTone) * (0.45 + 0.65*vUv.y);
  albedo *= 0.85 + 0.30*mmFbm3(vUv*7.0 + vSeed*5.0);

  // ambient cool fill + real candlelight, then the edge highlight on top
  vec3 body = albedo * (uAccent * 0.16 + vLight * 0.85);
  vec3 col  = body * uGain + (uRim * 0.10 + vLight * 0.42) * rim * uRimAmt;
  col = mix(col, uFog, vFog);
  col = mmDesat(col, uDread*0.5) * (1.0 - uDread*0.22);
  gl_FragColor = vec4(col, mask*(1.0 - vFog*0.30));
}`;

/* -------------------------------------------------------------- light shafts */

export const SHAFT_VERT = /* glsl */`
attribute vec3  aOrigin;
attribute vec3  aParam;   // x angle, y length, z width
attribute float aSeed;
attribute float aInt;
varying vec2  vUv;
varying float vSeed, vInt;
void main(){
  vUv = uv; vSeed = aSeed; vInt = aInt;
  float a = aParam.x;
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
varying float vSeed, vInt;
void main(){
  float across = 1.0 - abs(vUv.x - 0.5)*2.0;
  float edge   = smoothstep(0.0, 0.85, across);
  float along  = smoothstep(0.0, 0.50, vUv.y) * smoothstep(1.02, 0.62, vUv.y);
  float d = mmFbm3(vec2(vUv.x*6.0 + vSeed*11.0, vUv.y*2.4 - uTime*0.09));
  float body = pow(edge, 2.6)*along*(0.30 + 0.90*d);
  vec3 col = uColor * body * vInt * 0.55 * (1.0 - uDread*0.45);
  gl_FragColor = vec4(col, body*0.6);
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
  col += uRim * rim * 0.10;
  col *= (1.0 - uDread*0.25);
  gl_FragColor = vec4(col, m*uAmount);
}`;
