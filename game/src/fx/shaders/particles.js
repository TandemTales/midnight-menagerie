/**
 * One GPU particle system for the whole game.
 * OWNER: atmosphere agent.
 *
 * All motion is evaluated in the vertex shader from a per-particle seed, so the
 * CPU touches nothing per frame except a handful of uniforms. Types share one
 * draw call; a type is just a number on the vertex.
 *
 *   0 dust    1 wisp    2 ember    3 plaster    4 rain    5 spore    6 ash
 *   7 burst   (impact confetti, driven by uBurst*)
 */
import { GLSL_LIB } from './common.js';

export const PARTICLE_VERT = /* glsl */`
precision highp float;
${GLSL_LIB}
attribute vec3  aBase;
attribute vec4  aRand;
attribute float aType;
attribute float aSize;

uniform float uTime, uSpeed, uScale, uPixelRatio, uWind, uReduce;
uniform vec3  uCenter, uExtent;
uniform vec4  uLights[5];        // xyz world pos, w radius
uniform vec3  uLightCol[5];
uniform float uLightInt[5];
uniform vec3  uTint, uWispTint, uEmberTint;
uniform float uDensity;          // 0..1 — particles above this fraction are culled
uniform vec4  uBurst;            // xyz origin, w = age (seconds; <0 = inactive)
uniform vec3  uBurstCol;
uniform float uBurstPower;

varying vec3  vColor;
varying float vAlpha, vStretch, vSoft;

void main(){
  float ty = aType;
  vec3  p  = aBase;
  float t  = uTime * uSpeed;
  float sz = aSize;
  vAlpha = 1.0; vStretch = 1.0; vSoft = 1.0;
  vec3 tint = uTint;
  float selfLit = 0.10;

  if (ty > 6.5) {
    // ---- impact burst ------------------------------------------------------
    float age = uBurst.w;
    if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    vec3 dir = normalize(vec3(aRand.x-0.5, aRand.y-0.35, aRand.z-0.5) + 0.0001);
    float sp = (0.35 + aRand.w*0.9) * uBurstPower;
    p = uBurst.xyz + dir*sp*age*(1.7 - 1.0*age) - vec3(0.0, 2.2*age*age, 0.0)*sp*0.28;
    vAlpha = (1.0 - age)*(1.0 - age);
    tint = uBurstCol; selfLit = 3.2;
    sz = aSize * (3.4 - 2.2*age);
    vSoft = 1.2;
  } else {
    vec3 ext = uExtent;
    p = uCenter + aBase * ext;          // aBase is -1..1; spread it over the volume
    if (ty < 0.5) {
      // ---- dust motes: near-stationary, tiny brownian wander ---------------
      p.x += sin(t*0.21 + aRand.x*31.4)*0.55 + t*0.035*uWind;
      p.y += sin(t*0.16 + aRand.y*27.7)*0.42 + sin(t*0.43 + aRand.z*11.0)*0.10;
      p.z += cos(t*0.19 + aRand.z*19.3)*0.48;
      selfLit = 0.035; sz *= 0.85;
    } else if (ty < 1.5) {
      // ---- spectral wisps: rise, sway, pulse -------------------------------
      p.y += mod(t*0.30 + aRand.y*97.0, ext.y*2.0);
      p.x += sin(t*0.42 + aRand.x*24.0)*1.05 + t*0.02*uWind;
      p.z += cos(t*0.31 + aRand.z*14.0)*0.85;
      tint = uWispTint; selfLit = 0.40;
      sz *= 1.5 + 0.6*sin(t*1.7 + aRand.w*22.0);
      vSoft = 2.6;
    } else if (ty < 2.5) {
      // ---- embers: rise fast, flicker, die -------------------------------
      float life = mod(t*0.45 + aRand.w*53.0, 1.0);
      p.y += life*ext.y*1.7;
      p.x += sin(t*1.9 + aRand.x*17.0)*0.28*life + t*0.05*uWind;
      vAlpha = smoothstep(0.0,0.12,life)*(1.0-life)*(1.0-life);
      tint = uEmberTint; selfLit = 1.0;
      sz *= 0.8 + 0.5*sin(t*9.0 + aRand.y*40.0);
    } else if (ty < 3.5) {
      // ---- falling plaster / grit ------------------------------------------
      float life = mod(t*0.28 + aRand.w*61.0, 1.0);
      p.y = uCenter.y + ext.y - life*ext.y*2.0;
      p.x += sin(t*2.2 + aRand.x*13.0)*0.10;
      vAlpha = smoothstep(0.0,0.06,life)*smoothstep(1.0,0.85,life);
      selfLit = 0.18;
    } else if (ty < 4.5) {
      // ---- rain: fast, streaked --------------------------------------------
      float life = mod(t*1.30 + aRand.w*77.0, 1.0);
      p.y = uCenter.y + ext.y - life*ext.y*2.0;
      p.x += life*0.6*uWind;
      vStretch = 7.0; sz *= 1.05; selfLit = 0.34;
      vAlpha = 0.75;
    } else if (ty < 5.5) {
      // ---- spores / leaves: slow fall with a wide sideways oscillation ------
      float life = mod(t*0.16 + aRand.w*43.0, 1.0);
      p.y = uCenter.y + ext.y - life*ext.y*2.0;
      p.x += sin(t*0.8 + aRand.x*19.0)*0.85;
      p.z += cos(t*0.6 + aRand.z*23.0)*0.55;
      selfLit = 0.26; sz *= 1.10; vSoft = 1.9;
      vAlpha = smoothstep(0.0,0.08,life)*smoothstep(1.0,0.88,life);
    } else {
      // ---- ash / snow: very slow, tumbling ---------------------------------
      float life = mod(t*0.09 + aRand.w*67.0, 1.0);
      p.y = uCenter.y + ext.y - life*ext.y*2.0;
      p.x += sin(t*0.35 + aRand.x*29.0)*1.25 + t*0.03*uWind;
      p.z += cos(t*0.27 + aRand.z*33.0)*0.9;
      selfLit = 0.20; sz *= 1.00;
      vAlpha = smoothstep(0.0,0.10,life)*smoothstep(1.0,0.9,life);
    }
    // keep everything inside the volume
    p = uCenter + mod(p - uCenter + ext, ext*2.0) - ext;
    // density cull — one uniform thins the field without rebuilding buffers
    if (aRand.x > uDensity) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  }

  // ---- light response: this is what makes dust read as "caught in the light"
  vec3 lit = vec3(selfLit);
  for (int i = 0; i < 5; i++){
    if (uLightInt[i] <= 0.001) continue;
    float d = distance(p, uLights[i].xyz);
    float a = uLightInt[i] / (1.0 + (d/uLights[i].w)*(d/uLights[i].w));
    lit += uLightCol[i] * a * 0.26;
  }
  vColor = tint * lit * 0.52;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = sz * uScale * uPixelRatio * (150.0 / max(-mv.z, 0.6)) * (1.0 - uReduce*0.25);
  vAlpha *= smoothstep(0.0, 3.0, -mv.z) * smoothstep(120.0, 30.0, -mv.z);
}`;

export const PARTICLE_FRAG = /* glsl */`
precision mediump float;
uniform float uDread;
varying vec3  vColor;
varying float vAlpha, vStretch, vSoft;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  c.y *= vStretch;
  float d = length(c);
  float a = pow(max(1.0 - d*2.0, 0.0), vSoft*1.6 + 0.6);
  if (a <= 0.002) discard;
  // hot core, soft halo — reads as a real light source through bloom
  float core = pow(max(1.0 - d*3.4, 0.0), 3.0);
  vec3 col = vColor * (a + core*0.9);
  gl_FragColor = vec4(col * (1.0 - uDread*0.25), a*vAlpha);
}`;
