/**
 * One GPU particle field for the whole game — one draw call, zero CPU work per frame.
 * OWNER: atmosphere agent.
 *
 * Motion is evaluated in the vertex shader from a per-particle seed, so changing
 * region only rewrites the type attribute (a few thousand floats, once).
 * Budget measured at 1600x900: ~0.2 ms/frame at 2400 particles.
 */
import * as THREE from 'three';
import { PARTICLE_VERT, PARTICLE_FRAG } from './shaders/particles.js';

export const PTYPE = { DUST: 0, WISP: 1, EMBER: 2, PLASTER: 3, RAIN: 4, SPORE: 5, ASH: 6, BURST: 7 };
const BURST_COUNT = 256;

export class ParticleField {
  constructor(scene, { count = 2200, seedFn = Math.random } = {}) {
    this.count = count + BURST_COUNT;
    this.ambientCount = count;
    this.scene = scene;

    const g = new THREE.BufferGeometry();
    const base = new Float32Array(this.count * 3);
    const rand = new Float32Array(this.count * 4);
    const type = new Float32Array(this.count);
    const size = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      base[i * 3 + 0] = (seedFn() - 0.5) * 2;
      base[i * 3 + 1] = (seedFn() - 0.5) * 2;
      base[i * 3 + 2] = (seedFn() - 0.5) * 2;
      rand[i * 4 + 0] = seedFn();
      rand[i * 4 + 1] = seedFn();
      rand[i * 4 + 2] = seedFn();
      rand[i * 4 + 3] = seedFn();
      size[i] = 0.55 + seedFn() * 1.1;
      type[i] = i >= this.ambientCount ? PTYPE.BURST : PTYPE.DUST;
    }
    // positions attribute is required by three even though we ignore it
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    g.setAttribute('aType', new THREE.BufferAttribute(type, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -8), 90);
    this.geometry = g;
    this._type = type;
    this._base = base;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: 1 }, uScale: { value: 1 },
        uPixelRatio: { value: 1 }, uWind: { value: 1 }, uReduce: { value: 0 },
        uCenter: { value: new THREE.Vector3(0, 5, -9) },
        uExtent: { value: new THREE.Vector3(16, 5, 8) },
        uLights: { value: Array.from({ length: 5 }, () => new THREE.Vector4(0, 0, 0, 1)) },
        uLightCol: { value: Array.from({ length: 5 }, () => new THREE.Color()) },
        uLightInt: { value: new Array(5).fill(0) },
        uTint: { value: new THREE.Color(0xffe2a8) },
        uWispTint: { value: new THREE.Color(0x6fd9ec) },
        uEmberTint: { value: new THREE.Color(0xffb64a) },
        uDensity: { value: 1 },
        uBurst: { value: new THREE.Vector4(0, 0, 0, -1) },
        uBurstCol: { value: new THREE.Color(0xffd75e) },
        uBurstPower: { value: 3 },
        uDread: { value: 0 },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);

    this._burstAge = -1;
    this._burstDur = 0.9;
  }

  /**
   * cfg: { mix: [[type, weight], ...], speed, scale, wind, density,
   *        tint, wispTint, emberTint }
   */
  setConfig(cfg, rand = Math.random) {
    const u = this.material.uniforms;
    if (cfg.speed !== undefined) u.uSpeed.value = cfg.speed;
    if (cfg.scale !== undefined) u.uScale.value = cfg.scale;
    if (cfg.wind !== undefined) u.uWind.value = cfg.wind;
    // regions author density on a 0..1 'feels full' scale; halve it for screen calm
    if (cfg.density !== undefined) u.uDensity.value = cfg.density * 0.34;
    if (cfg.tint) u.uTint.value.set(cfg.tint);
    if (cfg.wispTint) u.uWispTint.value.set(cfg.wispTint);
    if (cfg.emberTint) u.uEmberTint.value.set(cfg.emberTint);

    if (cfg.mix) {
      let total = 0;
      for (const m of cfg.mix) total += m[1];
      const t = this._type;
      let cursor = 0;
      for (let mi = 0; mi < cfg.mix.length; mi++) {
        const [type, w] = cfg.mix[mi];
        const end = mi === cfg.mix.length - 1
          ? this.ambientCount
          : Math.min(this.ambientCount, cursor + Math.round(this.ambientCount * w / total));
        for (let i = cursor; i < end; i++) t[i] = type;
        cursor = end;
      }
      this.geometry.attributes.aType.needsUpdate = true;
    }
  }

  setVolume(cx, cy, cz, ex, ey, ez) {
    this.material.uniforms.uCenter.value.set(cx, cy, cz);
    this.material.uniforms.uExtent.value.set(ex, ey, ez);
  }

  /** Copy the rig's packed light payload into the particle uniforms. */
  syncLights(rig) {
    const u = this.material.uniforms;
    for (let i = 0; i < 5; i++) {
      u.uLights.value[i].copy(rig.worldPos[i]);
      u.uLightCol.value[i].copy(rig.colors[i]);
      u.uLightInt.value[i] = rig.inten[i];
    }
  }

  burst(x, y, z, colorHex, power = 3, dur = 0.9) {
    const u = this.material.uniforms;
    u.uBurst.value.set(x, y, z, 0);
    u.uBurstCol.value.set(colorHex);
    u.uBurstPower.value = power;
    this._burstAge = 0;
    this._burstDur = dur;
  }

  setPixelRatio(p) { this.material.uniforms.uPixelRatio.value = p; }
  setDread(v) { this.material.uniforms.uDread.value = v; }
  setReduce(v) { this.material.uniforms.uReduce.value = v; }

  update(dt, t) {
    this.material.uniforms.uTime.value = t;
    if (this._burstAge >= 0) {
      this._burstAge += dt / this._burstDur;
      if (this._burstAge >= 1) { this._burstAge = -1; this.material.uniforms.uBurst.value.w = -1; }
      else this.material.uniforms.uBurst.value.w = this._burstAge;
    }
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
