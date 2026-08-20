/**
 * Candlelight and spectral counter-light.
 * OWNER: atmosphere agent.
 *
 * The whole visual identity is warm-vs-cold: candlelight is the kids, cold
 * blue-green is the mansion. Flicker is layered value noise plus rare "gutter"
 * events — a sine wave reads as a pulsing lamp, not a flame.
 *
 * Each Light publishes into two places:
 *   - a real THREE.PointLight, so meshes other agents add get lit for free;
 *   - packed uniform arrays consumed by the backdrop and particle shaders.
 *
 * No allocation after construction.
 */
import * as THREE from 'three';

function hash1(n) {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed), b = hash1(i + 1 + seed);
  return a + (b - a) * u;
}

/** Layered-noise flame flicker in 0..1, biased bright with occasional dips. */
export class Flicker {
  constructor(seed = 0, opts = {}) {
    this.seed = seed * 37.13 + 5.7;
    this.depth = opts.depth ?? 0.30;      // how far it dips
    this.rate = opts.rate ?? 1.0;
    this.gutterChance = opts.gutter ?? 0.35;   // events per second
    this._gut = 0;                        // remaining gutter time
    this._gutMag = 0;
    this.value = 1;
  }
  update(dt, t) {
    const s = this.seed, r = this.rate;
    // three octaves at incommensurate rates — no visible period
    let n = 0.58 * vnoise(t * 1.7 * r, s)
          + 0.29 * vnoise(t * 4.3 * r, s * 2.7)
          + 0.13 * vnoise(t * 11.7 * r, s * 5.1);
    // bias bright: a flame is mostly steady and occasionally ducks
    n = 1 - this.depth * Math.pow(1 - n, 1.7);

    if (this._gut > 0) {
      this._gut -= dt;
      const k = Math.max(this._gut, 0) / 0.22;
      n *= 1 - this._gutMag * Math.sin(Math.PI * Math.min(k, 1));
    } else if (Math.random() < this.gutterChance * dt) {
      this._gut = 0.22;
      this._gutMag = 0.30 + 0.45 * hash1(t * 13.7 + s);
    }
    this.value = n;
    return n;
  }
}

let _uid = 0;

export class AtmoLight {
  /** kind: 'warm' | 'cold' */
  constructor(scene, { kind = 'warm', pos, color, intensity = 1, radius = 6, flicker = true } = {}) {
    this.id = ++_uid;
    this.kind = kind;
    this.pos = new THREE.Vector3().copy(pos || new THREE.Vector3());
    this.color = new THREE.Color(color ?? (kind === 'warm' ? 0xffb64a : 0x6fd9ec));
    this.base = intensity;
    this.radius = radius;
    this.live = intensity;
    this.enabled = true;
    this.flicker = flicker
      ? new Flicker(this.id, kind === 'warm'
          ? { depth: 0.32, rate: 1.0, gutter: 0.35 }
          : { depth: 0.20, rate: 0.35, gutter: 0.06 })
      : null;
    this.point = new THREE.PointLight(this.color.getHex(), intensity * 6, radius * 3.2, 2);
    this.point.position.copy(this.pos);
    scene.add(this.point);
    this._scene = scene;
  }
  setPos(x, y, z) { this.pos.set(x, y, z); this.point.position.set(x, y, z); }
  update(dt, t, motionScale) {
    if (!this.enabled) { this.live = 0; this.point.intensity = 0; return; }
    const f = this.flicker ? 1 - (1 - this.flicker.update(dt, t)) * motionScale : 1;
    this.live = this.base * f;
    this.point.intensity = this.live * 6;
  }
  dispose() { this._scene.remove(this.point); this.point.dispose?.(); }
}

/**
 * Holds every light in the scene and packs the four brightest into the shader
 * uniform slots each frame. Four is enough: the eye reads one key plus a
 * counter-light, everything else is fill.
 */
export class LightRig {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this.slots = 4;

    // Packed uniform payloads, reused every frame — never reallocated.
    this.worldPos = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    this.colors   = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.inten    = [0, 0, 0, 0];
    this.active   = [null, null, null, null];

    this.keyDir = new THREE.Vector2(0, 1);   // 2D direction toward the key light
    this.keyColor = new THREE.Color(0xffb64a);
    this.keyIntensity = 1;

    // Ambient bounce so nothing is ever fully black-crushed.
    this.ambient = new THREE.AmbientLight(0x14111f, 0.55);
    scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x2a3f55, 0x120c18, 0.45);
    scene.add(this.hemi);
  }

  add(opts) { const l = new AtmoLight(this.scene, opts); this.lights.push(l); return l; }

  clear() {
    for (const l of this.lights) l.dispose();
    this.lights.length = 0;
    for (let i = 0; i < this.slots; i++) { this.inten[i] = 0; this.active[i] = null; }
  }

  setAmbient(colorHex, intensity, hemiSky, hemiGround, hemiInt) {
    this.ambient.color.set(colorHex);
    this.ambient.intensity = intensity;
    this.hemi.color.set(hemiSky);
    this.hemi.groundColor.set(hemiGround);
    this.hemi.intensity = hemiInt;
  }

  update(dt, t, motionScale = 1) {
    const ls = this.lights;
    for (let i = 0; i < ls.length; i++) ls[i].update(dt, t, motionScale);

    // pick the four strongest without sorting (no allocation)
    for (let s = 0; s < this.slots; s++) { this.active[s] = null; this.inten[s] = 0; }
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (l.live <= 0.001) continue;
      let worst = -1, worstVal = l.live;
      for (let s = 0; s < this.slots; s++) {
        const cur = this.active[s] ? this.active[s].live : -1;
        if (cur < worstVal) { worstVal = cur; worst = s; }
      }
      if (worst >= 0) { this.active[worst] = l; }
    }
    let bestWarm = null;
    for (let s = 0; s < this.slots; s++) {
      const l = this.active[s];
      if (l) {
        this.worldPos[s].set(l.pos.x, l.pos.y, l.pos.z, l.radius);
        this.colors[s].copy(l.color);
        this.inten[s] = l.live;
        if (l.kind === 'warm' && (!bestWarm || l.live > bestWarm.live)) bestWarm = l;
      } else {
        this.inten[s] = 0;
        this.worldPos[s].set(0, 0, 0, 1);
      }
    }
    if (bestWarm) {
      this.keyColor.copy(bestWarm.color);
      this.keyIntensity = bestWarm.live;
      const dx = bestWarm.pos.x, dy = bestWarm.pos.y - 1.4;
      const len = Math.hypot(dx, dy) || 1;
      this.keyDir.set(dx / len, dy / len);
    }
  }
}
