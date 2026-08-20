/**
 * WebGL stage: renderer, composer, camera rig, shared lighting.
 * OWNER: atmosphere agent. Scenes ask for `stage.scene` and add objects.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clock } from './clock.js';

/** Film grain + vignette + subtle chromatic aberration + candle colour grade. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 1.0 },
    uAberration: { value: 0.0016 },
    uShake: { value: new THREE.Vector2(0, 0) },
    uFlash: { value: 0.0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0.0 },
    uWarm: { value: 0.06 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration, uFlash, uDesat, uWarm;
    uniform vec2 uShake;
    uniform vec3 uFlashColor;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

    void main(){
      vec2 uv = vUv + uShake;
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);
      // chromatic aberration grows toward the edges
      float ab = uAberration * (0.35 + r2 * 2.4);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // warm candle bias in highlights, cool spectral bias in shadows
      float lum = dot(col, vec3(0.2126,0.7152,0.0722));
      col += vec3(uWarm, uWarm*0.55, -uWarm*0.35) * lum;
      col += vec3(-0.012, 0.0, 0.035) * (1.0 - lum);

      // vignette
      float vig = smoothstep(0.95, 0.22, r2 * uVignette);
      col *= mix(1.0, vig, 0.85);

      // grain (animated, luminance-weighted so darks stay clean-ish)
      float g = hash(uv * vec2(1024.0, 700.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (0.35 + lum * 0.9);

      col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))), uDesat);
      col = mix(col, uFlashColor, uFlash);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(0x07060d, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0813, 0.028);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(0, 2.2, 12);
    this.camera.lookAt(0, 1.4, 0);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.72, 0.62);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this._shake = { mag: 0, decay: 8, t: 0, freq: 34 };
    this._camBase = this.camera.position.clone();
    this.quality = 1;

    this.resize();
    addEventListener('resize', () => this.resize(), { passive: true });
    clock.onFrame((dt, t) => this.update(dt, t));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.quality >= 1 ? 2 : 1.25);
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Kick the camera. mag in world units. */
  shake(mag = 0.12, decay = 9) {
    this._shake.mag = Math.max(this._shake.mag, mag);
    this._shake.decay = decay;
  }

  flash(color = 0xffffff, amount = 0.5, dur = 0.18) {
    this.grade.uniforms.uFlashColor.value.set(color);
    this.grade.uniforms.uFlash.value = amount;
    clock.ramp(dur, (v) => { this.grade.uniforms.uFlash.value = amount * (1 - v); });
  }

  update(dt, t) {
    const u = this.grade.uniforms;
    u.uTime.value = t;
    const s = this._shake;
    if (s.mag > 0.0005) {
      s.t += dt;
      const a = s.mag;
      u.uShake.value.set(
        Math.sin(s.t * s.freq * 1.0) * a * 0.045,
        Math.cos(s.t * s.freq * 1.37) * a * 0.045
      );
      this.camera.position.x = this._camBase.x + Math.sin(s.t * s.freq) * a * 0.5;
      this.camera.position.y = this._camBase.y + Math.cos(s.t * s.freq * 1.3) * a * 0.42;
      s.mag *= Math.exp(-s.decay * dt);
    } else if (s.mag !== 0) {
      s.mag = 0; u.uShake.value.set(0, 0);
      this.camera.position.copy(this._camBase);
    }
    this.composer.render(dt);
  }

  setCameraBase(v) { this._camBase.copy(v); this.camera.position.copy(v); }
}
