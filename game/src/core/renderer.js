/**
 * WebGL stage: renderer, composer, camera rig, post chain.
 * OWNER: atmosphere agent (co-owned with lead). Scenes ask for `stage.scene` and add objects.
 *
 * Public API (do not break): resize(), shake(), flash(), setCameraBase(),
 * .scene, .camera, .grade, .bloom
 * Added by atmosphere: setParallax(), ripple(), pulse(), setQuality(), .lookAt
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clock } from './clock.js';
import { Save } from './save.js';
import { GradeShaderDef } from '../fx/shaders/grade.js';

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      stencil: false, depth: true,
    });
    this.renderer.setClearColor(0x04030a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08060f, 0.016);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(0, 2.2, 12);
    this.lookAt = new THREE.Vector3(0, 1.9, 0);
    this.camera.lookAt(this.lookAt);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom: threshold high enough that only flames, spectral glow and rim hits
    // cross it. UI is DOM so it can never bloom — this only touches the WebGL layer.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.86, 0.58, 0.70);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShaderDef);
    const u = this.grade.uniforms;
    u.uTexel.value      = new THREE.Vector2(1 / 1600, 1 / 900);
    u.uShake.value      = new THREE.Vector2(0, 0);
    u.uFlashColor.value = new THREE.Color(1, 1, 1);
    u.uPulseColor.value = new THREE.Color(1, 1, 1);
    u.uWarmTint.value   = new THREE.Color(0.075, 0.042, -0.020);
    u.uCoolTint.value   = new THREE.Color(-0.012, 0.006, 0.040);
    u.uHaloColor.value  = new THREE.Color(1.0, 0.72, 0.40);
    u.uImpact.value     = new THREE.Vector4(0.5, 0.5, 0, 0);
    this.composer.addPass(this.grade);

    this.composer.addPass(new OutputPass());

    this._shake    = { mag: 0, decay: 9, t: 0, freq: 34 };
    this._camBase  = this.camera.position.clone();
    this._parallax = new THREE.Vector3(0, 0, 0);
    this._tmp      = new THREE.Vector3();
    this._impactT  = -1;
    this.quality   = 1;

    this.resize();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize, { passive: true });
    clock.onFrame((dt, t) => this.update(dt, t));
  }

  setQuality(q) { this.quality = q; this.resize(); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.quality >= 1 ? 2 : 1.25);
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const u = this.grade.uniforms;
    u.uTexel.value.set(1 / (w * dpr), 1 / (h * dpr));
    u.uAspect.value = w / h;
  }

  /** Kick the camera. mag in world units. Respects Save.settings.screenShake. */
  shake(mag = 0.12, decay = 9) {
    const s = Save.settings?.screenShake ?? 1;
    if (s <= 0) return;
    this._shake.mag = Math.max(this._shake.mag, mag * s);
    this._shake.decay = decay;
  }

  /** Full-screen colour flash. Respects Save.settings.flashes. */
  flash(color = 0xffffff, amount = 0.5, dur = 0.18) {
    if (!(Save.settings?.flashes ?? 1)) return;
    const a = Save.settings?.reduceMotion ? amount * 0.45 : amount;
    this.grade.uniforms.uFlashColor.value.set(color);
    this.grade.uniforms.uFlash.value = a;
    clock.ramp(dur, (v) => { this.grade.uniforms.uFlash.value = a * (1 - v); });
  }

  /** Soft coloured wash — gentler than flash, safe for photosensitivity. */
  pulse(color = 0x6fd9ec, amount = 0.22, dur = 0.55) {
    if (!(Save.settings?.flashes ?? 1)) return;
    const a = Save.settings?.reduceMotion ? amount * 0.4 : amount;
    this.grade.uniforms.uPulseColor.value.set(color);
    clock.ramp(dur, (v) => {
      this.grade.uniforms.uPulse.value = a * Math.sin(Math.PI * v);
    });
  }

  /** Screen-space shockwave ring. cx/cy in 0..1 screen UV (y up). */
  ripple(cx = 0.5, cy = 0.5, strength = 1) {
    if (Save.settings?.reduceMotion) return;
    const u = this.grade.uniforms.uImpact.value;
    u.set(cx, cy, 0, strength);
    this._impactT = 0;
  }

  /** Additive camera offset used for idle parallax/breathing (atmosphere drives it). */
  setParallax(x, y, z = 0) { this._parallax.set(x, y, z); }

  update(dt, t) {
    const u = this.grade.uniforms;
    u.uTime.value = t;

    if (this._impactT >= 0) {
      this._impactT += dt / 0.55;
      if (this._impactT >= 1) { this._impactT = -1; u.uImpact.value.w = 0; }
      else u.uImpact.value.z = this._impactT;
    }

    const s = this._shake;
    const p = this._parallax;
    if (s.mag > 0.0005) {
      s.t += dt;
      const a = s.mag;
      u.uShake.value.set(
        Math.sin(s.t * s.freq * 1.0) * a * 0.045,
        Math.cos(s.t * s.freq * 1.37) * a * 0.045
      );
      this.camera.position.set(
        this._camBase.x + p.x + Math.sin(s.t * s.freq) * a * 0.5,
        this._camBase.y + p.y + Math.cos(s.t * s.freq * 1.3) * a * 0.42,
        this._camBase.z + p.z
      );
      s.mag *= Math.exp(-s.decay * dt);
    } else {
      if (s.mag !== 0) { s.mag = 0; u.uShake.value.set(0, 0); }
      this.camera.position.set(this._camBase.x + p.x, this._camBase.y + p.y, this._camBase.z + p.z);
    }
    this.camera.lookAt(this.lookAt);

    this.composer.render(dt);
  }

  setCameraBase(v) { this._camBase.copy(v); this.camera.position.copy(v); }
}
