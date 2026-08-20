/**
 * Final colour grade: split-tone, halation + lens dirt, film grain, vignette,
 * dread crush, flash, pulse and impact ripple.
 * OWNER: atmosphere agent.
 *
 * Design note — the old grade added a flat cool term to the shadows, which lifted
 * pure black to navy (#000 rendered as roughly #000009). Every tint here is
 * gated by `mmSplitTone`, whose shadow weight is multiplied by
 * `smoothstep(0.0, 0.055, lum)` so a black pixel stays exactly black.
 */
import { NOISE, COLOR } from './common.js';

export const GradeShaderDef = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uTexel:      { value: null },      // set by Stage on resize (THREE.Vector2)
    uAspect:     { value: 1.7778 },
    uGrain:      { value: 0.030 },
    uVignette:   { value: 1.0 },
    uAberration: { value: 0.0013 },
    uShake:      { value: null },      // THREE.Vector2
    uFlash:      { value: 0.0 },
    uFlashColor: { value: null },      // THREE.Color
    uPulse:      { value: 0.0 },
    uPulseColor: { value: null },      // THREE.Color
    uDesat:      { value: 0.0 },
    uDread:      { value: 0.0 },
    uWarmTint:   { value: null },      // THREE.Color — highlight bias
    uCoolTint:   { value: null },      // THREE.Color — shadow bias
    uToneAmt:    { value: 0.10 },
    uHalation:   { value: 0.55 },
    uHaloColor:  { value: null },      // THREE.Color
    uDirt:       { value: 0.65 },
    uExposure:   { value: 1.0 },
    uLift:       { value: 0.0 },       // black point — stays 0 unless a scene wants haze
    uImpact:     { value: null },      // THREE.Vector4 (x, y, age 0..1, strength)
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,

  fragmentShader: /* glsl */`
    precision highp float;
    ${NOISE}
    ${COLOR}
    uniform sampler2D tDiffuse;
    uniform vec2  uTexel, uShake;
    uniform vec3  uFlashColor, uPulseColor, uWarmTint, uCoolTint, uHaloColor;
    uniform vec4  uImpact;
    uniform float uTime, uGrain, uVignette, uAberration, uFlash, uPulse, uDesat,
                  uDread, uToneAmt, uHalation, uDirt, uExposure, uLift, uAspect;
    varying vec2  vUv;

    /* Screen-static lens dirt: low-frequency smudge plus a couple of scratches. */
    float dirtField(vec2 uv){
      vec2 p = uv*vec2(uAspect, 1.0);
      float smudge = mmFbm3(p*3.1 + 4.7);
      float fine   = mmFbm3(p*11.0 - 2.3);
      float scratch = smoothstep(0.985, 1.0, mmNoise(vec2(p.x*1.4 + p.y*0.35, 0.0)*18.0));
      return clamp(smudge*0.85 + fine*0.35 + scratch*0.6, 0.0, 1.6);
    }

    void main(){
      vec2 uv = vUv + uShake;

      /* impact ripple — a short outward ring that bends the image slightly */
      if (uImpact.w > 0.001) {
        vec2 d = (uv - uImpact.xy) * vec2(uAspect, 1.0);
        float r = length(d);
        float ring = exp(-pow((r - uImpact.z*0.55)*11.0, 2.0)) * (1.0 - uImpact.z);
        uv += normalize(d + 1e-5) * ring * 0.012 * uImpact.w / vec2(uAspect, 1.0);
      }

      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      /* chromatic aberration, edge-weighted */
      float ab = uAberration * (0.30 + r2 * 2.6);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ab).b;
      col = max(col, 0.0) * uExposure;

      /* ---- halation: highlights bleed a warm glow, modulated by lens dirt --- */
      if (uHalation > 0.001) {
        vec3 halo = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 8; i++){
          float fi = float(i);
          float a  = fi * 2.39996;
          float rr = (fi + 0.6) / 8.0;
          vec2 off = vec2(cos(a), sin(a)) * rr * 9.0 * uTexel;
          vec3 s = texture2D(tDiffuse, uv + off).rgb;
          float w = 1.0 - rr*0.55;
          halo += max(s - 0.62, 0.0) * w;
          wsum += w;
        }
        halo /= wsum;
        float dirt = mix(1.0, dirtField(vUv), uDirt);
        col += halo * uHaloColor * uHalation * dirt * 1.7;
      }

      /* ---- split tone: warm highlights, cool shadows, black stays black ----- */
      col = mmSplitTone(col, uWarmTint, uCoolTint, uToneAmt);
      col = max(col - uLift*0.0 + uLift, 0.0);

      /* ---- vignette (aspect-aware) + dread edge crush ----------------------- */
      vec2 vc = c * vec2(uAspect, 1.0) * 1.06;
      float vr = dot(vc, vc);
      float vig = smoothstep(1.15, 0.10, vr * uVignette);
      col *= mix(1.0, vig, 0.72 + uDread*0.26);

      /* ---- dread: desaturate, cool, and pull the edges down ----------------- */
      if (uDread > 0.001) {
        float edge = smoothstep(0.05, 0.85, vr);
        col = mmDesat(col, uDread*0.62);
        col *= 1.0 - uDread*(0.16 + edge*0.55);
        col += uCoolTint * uDread * 0.035 * mmLum(col);
      }

      col = mmDesat(col, uDesat);

      /* ---- pulse: a coloured wash that respects existing luminance ---------- */
      if (uPulse > 0.001) col += uPulseColor * uPulse * (0.25 + 0.85*mmLum(col));

      /* ---- film grain: stepped at 24fps so it reads as film, not as noise --- */
      float tq = floor(uTime*24.0);
      float g  = mmHash21(uv*vec2(1279.0, 947.0) + tq*13.37) - 0.5;
      float l  = mmLum(col);
      col += g * uGrain * (0.30 + l*1.15);

      /* ---- flash (gated by Save.settings.flashes upstream) ------------------ */
      col = mix(col, uFlashColor, uFlash);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
