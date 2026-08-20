/**
 * Shared GLSL chunks: hashes, value noise, fbm, SDF primitives, painterly helpers.
 * OWNER: atmosphere agent.
 *
 * Every symbol is prefixed `mm` so these can be pasted into any shader without
 * colliding with three's own chunk library.
 */

export const NOISE = /* glsl */`
float mmHash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float mmHash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*0.1031);
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
vec2 mmHash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
float mmNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(mmHash21(i),            mmHash21(i+vec2(1.0,0.0)), u.x),
             mix(mmHash21(i+vec2(0.0,1.0)), mmHash21(i+vec2(1.0,1.0)), u.x), u.y);
}
float mmFbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++){ s += a*mmNoise(p); p = p*2.03 + vec2(11.7,5.3); a *= 0.5; }
  return s;
}
float mmFbm3(vec2 p){
  float a = 0.55, s = 0.0;
  for (int i = 0; i < 3; i++){ s += a*mmNoise(p); p = p*2.11 + vec2(4.2,9.1); a *= 0.5; }
  return s;
}
/** Ridged fbm — good for smoke, cloth folds, hedge mass. */
float mmRidge(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a*(1.0-abs(mmNoise(p)*2.0-1.0)); p = p*2.07 + vec2(7.3,2.9); a *= 0.5; }
  return s;
}
/** Domain warp: pushes patterns off-grid so nothing reads as procedural. */
vec2 mmWarp(vec2 p, float amt, float freq){
  return p + amt*vec2(mmFbm3(p*freq), mmFbm3(p*freq + vec2(31.4,17.9))) - amt*0.5;
}
`;

export const SDF = /* glsl */`
float mmBox(vec2 p, vec2 hs, float r){
  vec2 d = abs(p) - hs + r;
  return min(max(d.x,d.y),0.0) + length(max(d,0.0)) - r;
}
float mmCircle(vec2 p, float r){ return length(p) - r; }
/** Vertical capsule from (0,0) to (0,h). */
float mmCaps(vec2 p, float h, float r){
  p.y -= clamp(p.y, 0.0, h);
  return length(p) - r;
}
/** Arch: rectangle of half-width w rising to y=h, capped by a semicircle. */
float mmArch(vec2 p, float w, float h){
  float body = mmBox(p - vec2(0.0, h*0.5), vec2(w, h*0.5), 0.0);
  float cap  = mmCircle(p - vec2(0.0, h), w);
  return min(body, cap);
}
float mmSmin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
`;

export const COLOR = /* glsl */`
float mmLum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 mmDesat(vec3 c, float amt){ return mix(c, vec3(mmLum(c)), amt); }
/** Painterly tint: warms lights and cools shadows WITHOUT lifting pure black. */
vec3 mmSplitTone(vec3 c, vec3 warm, vec3 cool, float amt){
  float l = mmLum(c);
  float hi = smoothstep(0.35, 0.95, l);
  float lo = (1.0 - smoothstep(0.0, 0.42, l)) * smoothstep(0.0, 0.055, l);
  return c + (warm*hi + cool*lo) * amt;
}
`;

/** All chunks, in dependency order. */
export const GLSL_LIB = NOISE + SDF + COLOR;
