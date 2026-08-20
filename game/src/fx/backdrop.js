/**
 * Backdrop — the reusable, data-driven 3D environment behind every scene.
 * OWNER: atmosphere agent.
 *
 * Composition, camera-out:
 *   near frame (drapes / lintel / clutter)  z = +7.2
 *   light shafts                            z = -6 .. -14
 *   silhouette props, three depth bands     z = -3 .. -16
 *   floor                                   y = 0, z = +14 .. -18
 *   far wall                                z = -18
 *
 * Everything is procedural and driven by a region palette object, so 17 regions
 * come out of one system. World units are metres; eye height is 2.2 m.
 */
import * as THREE from 'three';
import {
  WALL_VERT, WALL_FRAG, FLOOR_VERT, FLOOR_FRAG,
  PROP_VERT, PROP_FRAG, SHAFT_VERT, SHAFT_FRAG, FRAME_VERT, FRAME_FRAG,
} from './shaders/backdrop.js';

const WALL_W = 66, WALL_H = 13, WALL_Z = -18;
const FLOOR_X = 72, FLOOR_Z = 32, FLOOR_CZ = -2;
const SIDE_X = 16, SIDE_D = 24, SIDE_CZ = -6;   // side walls: z from +6 back to -18
const MAX_PROPS = 40, MAX_SHAFTS = 6;

function v4arr() { return [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()]; }
function colArr() { return [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()]; }
/**
 * THREE.UniformsUtils.clone() only does `array.slice()`, so cloned materials end
 * up SHARING the Vector4/Color objects inside uniform arrays. Every clone needs
 * its own light slots or they all write over each other.
 */
function freshLightSlots(uniforms) {
  if (uniforms.uLights) uniforms.uLights.value = v4arr();
  if (uniforms.uLightCol) uniforms.uLightCol.value = colArr();
  if (uniforms.uLightInt) uniforms.uLightInt.value = [0, 0, 0, 0];
  if (uniforms.uSize) uniforms.uSize.value = uniforms.uSize.value.clone();
  if (uniforms.uSpan) uniforms.uSpan.value = uniforms.uSpan.value.clone();
  return uniforms;
}

export class Backdrop {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'backdrop';
    scene.add(this.group);

    /* ---------------------------------------------------------------- wall */
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: 1.7 }, uDread: { value: 0 },
        uFogAmt: { value: 0.18 }, uArch: { value: 0 }, uCool: { value: 1 },
        uGrime: { value: 0.7 }, uOpen: { value: 0.5 }, uCeil: { value: 6.4 },
        uGain: { value: 3.4 },
        uSize: { value: new THREE.Vector2(WALL_W, WALL_H) },
        uDeep: { value: new THREE.Color(0x0d0b16) },
        uMid: { value: new THREE.Color(0x241a2c) },
        uHi: { value: new THREE.Color(0x3a2a3a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uOpenGlow: { value: new THREE.Color(0x2a7f99) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      },
      vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
      depthWrite: true, fog: false,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), this.wallMat);
    this.wall.position.set(0, WALL_H / 2, WALL_Z);
    this.wall.renderOrder = 0;
    this.group.add(this.wall);

    /* ----------------------------------------------------------- side walls */
    // Two converging walls. Without them a single flat backdrop reads as a
    // painted flat; with them the room has real perspective.
    this.sides = [];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: freshLightSlots(THREE.UniformsUtils.clone(this.wallMat.uniforms)),
        vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
        depthWrite: true, fog: false,
      });
      mat.uniforms.uSize.value = new THREE.Vector2(SIDE_D, WALL_H);
      mat.uniforms.uSeed.value = 4.3 + i * 2.1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(SIDE_D, WALL_H), mat);
      m.position.set(i === 0 ? -SIDE_X : SIDE_X, WALL_H / 2, SIDE_CZ);
      m.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      m.renderOrder = 0;
      this.sides.push(m);
      this.group.add(m);
    }

    /* --------------------------------------------------------------- floor */
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: 3.1 }, uDread: { value: 0 },
        uFogNear: { value: 16 }, uFogFar: { value: 34 }, uGloss: { value: 0.5 },
        uPattern: { value: 0 }, uGain: { value: 3.4 },
        uSpan: { value: new THREE.Vector2(FLOOR_X, FLOOR_Z) },
        uDeep: { value: new THREE.Color(0x090711) },
        uMid: { value: new THREE.Color(0x1c1622) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      depthWrite: true, fog: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_X, FLOOR_Z), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0, FLOOR_CZ);
    this.floor.renderOrder = 1;
    this.group.add(this.floor);

    /* ------------------------------------------------------------- ceiling */
    // Same shader as the floor with the beam pattern. It closes the room, which
    // is what stops the top of the frame reading as an empty black void.
    this.ceilMat = this.floorMat.clone();
    this.ceilMat.uniforms = freshLightSlots(THREE.UniformsUtils.clone(this.floorMat.uniforms));
    this.ceilMat.uniforms.uPattern.value = 3;
    this.ceilMat.uniforms.uGloss.value = 0;
    this.ceilMat.uniforms.uFogNear.value = 12;
    this.ceilMat.uniforms.uFogFar.value = 30;
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_X, FLOOR_Z), this.ceilMat);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(0, 6.4, FLOOR_CZ);
    this.ceiling.renderOrder = 1;
    this.group.add(this.ceiling);

    /* --------------------------------------------------------------- props */
    const propGeo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    propGeo.index = base.index;
    propGeo.setAttribute('position', base.getAttribute('position'));
    propGeo.setAttribute('uv', base.getAttribute('uv'));
    this._propOffset = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 3), 3);
    this._propScale = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 2), 2);
    this._propShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    this._propSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    this._propTone = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    propGeo.setAttribute('aOffset', this._propOffset);
    propGeo.setAttribute('aScale', this._propScale);
    propGeo.setAttribute('aShape', this._propShape);
    propGeo.setAttribute('aSeed', this._propSeed);
    propGeo.setAttribute('aTone', this._propTone);
    propGeo.instanceCount = 0;
    propGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -9), 60);
    this.propGeo = propGeo;

    this.propMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSway: { value: 1 }, uRimAmt: { value: 1 }, uDread: { value: 0 },
        uGain: { value: 3.4 },
        uFogNear: { value: 10 }, uFogFar: { value: 26 },
        uDeep: { value: new THREE.Color(0x0d0b16) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uRim: { value: new THREE.Color(0xffb64a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uKeyDir: { value: new THREE.Vector2(-0.7, 0.7) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
        uLightInt: { value: [0, 0, 0, 0] },
      },
      vertexShader: PROP_VERT, fragmentShader: PROP_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.props = new THREE.Mesh(propGeo, this.propMat);
    this.props.frustumCulled = false;
    this.props.renderOrder = 3;
    this.group.add(this.props);

    /* -------------------------------------------------------------- shafts */
    const shaftGeo = new THREE.InstancedBufferGeometry();
    const sBase = new THREE.PlaneGeometry(1, 1);
    shaftGeo.index = sBase.index;
    shaftGeo.setAttribute('position', sBase.getAttribute('position'));
    shaftGeo.setAttribute('uv', sBase.getAttribute('uv'));
    this._shOrigin = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS * 3), 3);
    this._shParam = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS * 3), 3);
    this._shSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS), 1);
    this._shInt = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHAFTS), 1);
    shaftGeo.setAttribute('aOrigin', this._shOrigin);
    shaftGeo.setAttribute('aParam', this._shParam);
    shaftGeo.setAttribute('aSeed', this._shSeed);
    shaftGeo.setAttribute('aInt', this._shInt);
    shaftGeo.instanceCount = 0;
    shaftGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, -10), 60);
    this.shaftGeo = shaftGeo;

    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDread: { value: 0 },
        uColor: { value: new THREE.Color(0xffd08a) },
      },
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false,
    });
    this.shafts = new THREE.Mesh(shaftGeo, this.shaftMat);
    this.shafts.frustumCulled = false;
    this.shafts.renderOrder = 4;
    this.group.add(this.shafts);

    /* --------------------------------------------------------- near frame */
    this.frames = [];
    const fGeo = new THREE.PlaneGeometry(7.4, 4.2);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: i * 3.7 + 1 },
          uMode: { value: i < 2 ? 0 : i === 2 ? 1 : 2 },
          uAmount: { value: 0.9 }, uDread: { value: 0 },
          uColor: { value: new THREE.Color(0x06050c) },
          uRim: { value: new THREE.Color(0xffb64a) },
        },
        vertexShader: FRAME_VERT, fragmentShader: FRAME_FRAG,
        transparent: true, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(fGeo, mat);
      m.position.set(0, 2.08, 7.2 + i * 0.01);
      if (i === 1) m.scale.x = -1;                // mirrored right-hand drape
      m.renderOrder = 8;
      m.frustumCulled = false;
      this.frames.push(m);
      this.group.add(m);
    }

    this._tmpV2 = new THREE.Vector2();
  }

  /* ------------------------------------------------------------- structure */

  /** Rebuild props + shafts for a region. `rand` is a 0..1 generator (seeded). */
  build(pal, rand = Math.random) {
    const P = pal.props || {};
    const shapes = P.shapes || [0, 1, 5, 6];
    const n = Math.min(P.count ?? 22, MAX_PROPS);

    // three depth bands, far first so the instance order is back-to-front
    const bands = [
      { z: -15.6, spread: 16.0, scale: 0.95, tone: 0.85, gap: 2.6 },
      { z: -10.2, spread: 13.0, scale: 1.10, tone: 0.50, gap: 4.6 },
      { z: -5.4, spread: 10.0, scale: 1.28, tone: 0.22, gap: 6.2 },
    ];
    const off = this._propOffset.array, sc = this._propScale.array,
      sh = this._propShape.array, sd = this._propSeed.array, tn = this._propTone.array;

    let k = 0;
    for (let b = 0; b < bands.length && k < n; b++) {
      const band = bands[b];
      const per = Math.ceil(n / bands.length);
      for (let i = 0; i < per && k < n; i++, k++) {
        let shape = shapes[(rand() * shapes.length) | 0];
        if ((shape === 4 || shape === 7) && b > 0) shape = shapes[0] === 4 ? 5 : shapes[0];
        const hanging = shape === 4 || shape === 7;
        const h = (P.height ?? 2.2) * band.scale * (0.72 + rand() * 0.58);
        const w = h * (0.65 + rand() * 0.55);
        // spread across the frame, biased to the sides so the centre stays readable
        let x = (rand() * 2 - 1);
        x = Math.sign(x) * Math.pow(Math.abs(x), 0.62) * band.spread;
        // keep the middle of the frame clear — that is where the game happens
        const gap = band.gap;
        if (Math.abs(x) < gap) x = Math.sign(x || 1) * (gap + rand() * 1.6);
        const z = band.z + (rand() - 0.5) * 1.8;
        off[k * 3 + 0] = x;
        off[k * 3 + 1] = hanging ? (P.ceil ?? 6.6) - h : 0.02;
        off[k * 3 + 2] = z;
        sc[k * 2 + 0] = w; sc[k * 2 + 1] = h;
        sh[k] = shape;
        sd[k] = rand() * 10;
        tn[k] = band.tone * (0.7 + rand() * 0.6);
      }
    }
    this._propOffset.needsUpdate = this._propScale.needsUpdate = true;
    this._propShape.needsUpdate = this._propSeed.needsUpdate = this._propTone.needsUpdate = true;
    this.propGeo.instanceCount = k;

    /* shafts */
    const S = pal.shafts || {};
    const sn = Math.min(S.count ?? 3, MAX_SHAFTS);
    const so = this._shOrigin.array, sp = this._shParam.array,
      ss = this._shSeed.array, si = this._shInt.array;
    for (let i = 0; i < sn; i++) {
      const t = sn === 1 ? 0.5 : i / (sn - 1);
      so[i * 3 + 0] = (t - 0.5) * (S.spread ?? 22) + (rand() - 0.5) * 2;
      so[i * 3 + 1] = S.y ?? 8.0;
      so[i * 3 + 2] = (S.z ?? -12) + (rand() - 0.5) * 4;
      sp[i * 3 + 0] = (S.angle ?? 0.28) * (t < 0.5 ? 1 : -1) + (rand() - 0.5) * 0.12;
      sp[i * 3 + 1] = S.length ?? 12;
      sp[i * 3 + 2] = S.width ?? 3.2;
      ss[i] = rand() * 10;
      si[i] = (S.intensity ?? 0.5) * (0.7 + rand() * 0.6);
    }
    this._shOrigin.needsUpdate = this._shParam.needsUpdate = true;
    this._shSeed.needsUpdate = this._shInt.needsUpdate = true;
    this.shaftGeo.instanceCount = sn;

    this.wallMat.uniforms.uSeed.value = 1 + rand() * 9;
    this.floorMat.uniforms.uSeed.value = 1 + rand() * 9;
  }

  /** Colour + parameter application. Safe to call every frame during a cross-fade. */
  applyPalette(p) {
    const w = this.wallMat.uniforms;
    w.uArch.value = p.arch ?? 0;
    w.uCool.value = p.coolFill ?? 0.9;
    w.uGrime.value = p.grime ?? 0.7;
    w.uOpen.value = p.openGlow ?? 0.5;
    w.uFogAmt.value = p.wallFog ?? 0.18;
    w.uCeil.value = p.ceil ?? 6.4;
    w.uGain.value = (p.gain ?? 3.4) * 1.05;
    w.uDeep.value.copy(p._deep);
    w.uMid.value.copy(p._mid);
    w.uHi.value.copy(p._hi);
    w.uAccent.value.copy(p._accent);
    w.uFog.value.copy(p._fog);
    w.uOpenGlow.value.copy(p._open);

    const f = this.floorMat.uniforms;
    f.uPattern.value = p.floorPattern ?? 0;
    f.uGloss.value = p.gloss ?? 0.5;
    f.uGain.value = (p.gain ?? 3.4) * 0.52;
    f.uDeep.value.copy(p._floorDeep);
    f.uMid.value.copy(p._floorMid);
    f.uFog.value.copy(p._fog);
    f.uAccent.value.copy(p._accent);

    const c = this.ceilMat.uniforms;
    c.uDeep.value.copy(p._deep).multiplyScalar(0.55);
    c.uMid.value.copy(p._mid).multiplyScalar(0.60);
    c.uFog.value.copy(p._fog);
    c.uAccent.value.copy(p._accent);
    c.uGain.value = (p.gain ?? 3.4) * 0.78;
    this.ceiling.position.y = p.ceil ?? 6.4;

    const pr = this.propMat.uniforms;
    pr.uDeep.value.copy(p._propDeep);
    pr.uFog.value.copy(p._fog);
    pr.uRim.value.copy(p._rim);
    pr.uAccent.value.copy(p._accent);
    pr.uRimAmt.value = p.rim ?? 1.0;
    pr.uGain.value = p.gain ?? 3.4;

    for (let i = 0; i < 2; i++) {
      const su = this.sides[i].material.uniforms;
      su.uArch.value = p.arch ?? 0;
      su.uCool.value = (p.coolFill ?? 0.9) * 0.85;
      su.uGrime.value = Math.min(1, (p.grime ?? 0.7) + 0.12);
      su.uOpen.value = 0;                       // no doorway on the side walls
      su.uFogAmt.value = (p.wallFog ?? 0.18) + 0.10;
      su.uCeil.value = p.ceil ?? 6.4;
      su.uGain.value = (p.gain ?? 3.4) * 0.95;
      su.uDeep.value.copy(p._deep); su.uMid.value.copy(p._mid); su.uHi.value.copy(p._hi);
      su.uAccent.value.copy(p._accent); su.uFog.value.copy(p._fog);
      su.uOpenGlow.value.copy(p._open);
      this.sides[i].visible = p.sides !== false;
    }

    this.shaftMat.uniforms.uColor.value.copy(p._shaft);
    for (const m of this.frames) {
      m.material.uniforms.uColor.value.copy(p._frame);
      m.material.uniforms.uRim.value.copy(p._rim);
      m.material.uniforms.uAmount.value = p.frameAmount ?? 0.92;
    }
  }

  /** Pack the light rig into wall- and floor-local coordinates. */
  syncLights(rig) {
    const wl = this.wallMat.uniforms.uLights.value, wc = this.wallMat.uniforms.uLightCol.value;
    const fl = this.floorMat.uniforms.uLights.value, fc = this.floorMat.uniforms.uLightCol.value;
    const cl = this.ceilMat.uniforms.uLights.value, cc = this.ceilMat.uniforms.uLightCol.value;
    const ceilY = this.ceiling.position.y;
    for (let i = 0; i < 4; i++) {
      const p = rig.worldPos[i], inten = rig.inten[i], r = p.w || 1;
      // wall: fold the plane-distance into the intensity so the vec4 stays packed
      const dzw = p.z - WALL_Z;
      wl[i].set(p.x + WALL_W / 2, p.y, r, inten / (1 + (dzw / r) * (dzw / r)));
      wc[i].copy(rig.colors[i]);
      const dyf = p.y;
      fl[i].set(p.x, -(p.z - FLOOR_CZ), r, inten / (1 + (dyf / r) * (dyf / r)));
      fc[i].copy(rig.colors[i]);
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const su = this.sides[sIdx].material.uniforms;
        const sl = su.uLights.value, sc = su.uLightCol.value;
        // left wall runs +6 -> -18 as u goes 0 -> 1; right wall runs the other way
        const qx = sIdx === 0 ? (6 - p.z) : (p.z + 18);
        const dxs = sIdx === 0 ? (p.x + SIDE_X) : (SIDE_X - p.x);
        sl[i].set(qx, p.y, r, inten / (1 + (dxs / r) * (dxs / r)));
        sc[i].copy(rig.colors[i]);
      }
      const dyc = ceilY - p.y;
      cl[i].set(p.x, (p.z - FLOOR_CZ), r, inten / (1 + (dyc / r) * (dyc / r)));
      cc[i].copy(rig.colors[i]);
    }
    const pl = this.propMat.uniforms.uLights.value, pc = this.propMat.uniforms.uLightCol.value;
    const pi = this.propMat.uniforms.uLightInt.value;
    for (let i = 0; i < 4; i++) {
      pl[i].copy(rig.worldPos[i]); pc[i].copy(rig.colors[i]); pi[i] = rig.inten[i];
    }
    this.propMat.uniforms.uKeyDir.value.copy(rig.keyDir);
  }

  setDread(v) {
    for (const m of this.sides) m.material.uniforms.uDread.value = v;
    this.wallMat.uniforms.uDread.value = v;
    this.floorMat.uniforms.uDread.value = v;
    this.ceilMat.uniforms.uDread.value = v;
    this.propMat.uniforms.uDread.value = v;
    this.shaftMat.uniforms.uDread.value = v;
    for (const m of this.frames) m.material.uniforms.uDread.value = v;
  }

  setSway(v) { this.propMat.uniforms.uSway.value = v; }

  update(dt, t) {
    for (const m of this.sides) m.material.uniforms.uTime.value = t;
    this.wallMat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uTime.value = t;
    this.ceilMat.uniforms.uTime.value = t;
    this.propMat.uniforms.uTime.value = t;
    this.shaftMat.uniforms.uTime.value = t;
    for (const m of this.frames) m.material.uniforms.uTime.value = t;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.sides) { m.geometry.dispose(); m.material.dispose(); }
    this.wall.geometry.dispose(); this.wallMat.dispose();
    this.floor.geometry.dispose(); this.floorMat.dispose();
    this.propGeo.dispose(); this.propMat.dispose();
    this.shaftGeo.dispose(); this.shaftMat.dispose();
    for (const m of this.frames) { m.geometry.dispose(); m.material.dispose(); }
  }
}

export const BACKDROP_CONST = { WALL_W, WALL_H, WALL_Z, FLOOR_X, FLOOR_Z, FLOOR_CZ };
