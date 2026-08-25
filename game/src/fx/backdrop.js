/**
 * Backdrop — the reusable, data-driven 3D environment behind every scene.
 * OWNER: atmosphere agent.
 *
 * Composition, camera-out:
 *   near frame (drapes / lintel / clutter)  z = +7.2
 *   light shafts                            origin near the ceiling, landing on the floor
 *   silhouette props, laid out per region   z = -1 .. -room.d
 *   contact shadows                         y = 0.015, under every standing prop
 *   floor                                   y = 0
 *   ceiling                                 y = room.h  (omitted for open-air regions)
 *   far wall                                z = -room.d
 *   side walls                              x = ±room.w/2
 *
 * Round 2 (2026-08-20). Two things changed structurally:
 *
 *  1. THE ROOM IS NO LONGER ONE FIXED BOX. `pal.room` gives every region its own
 *     width, depth, ceiling height, side-wall toe-in and ceiling treatment, and
 *     `pal.props.layout` gives it its own prop arrangement. Seventeen recolours
 *     of one room measured 0.63 mean structural cross-correlation; the geometry
 *     has to differ, not just the hue.
 *  2. SHAFTS LAND. Each shaft computes its own floor intersection, is extended to
 *     reach it, and publishes an elliptical pool that the floor shader paints.
 *
 * Everything is procedural and driven by a region palette object. World units are
 * metres; eye height is ~2.2 m.
 */
import * as THREE from 'three';
import {
  WALL_VERT, WALL_FRAG, FLOOR_VERT, FLOOR_FRAG,
  PROP_VERT, PROP_FRAG, SHAFT_VERT, SHAFT_FRAG, FRAME_VERT, FRAME_FRAG,
  SHADOW_VERT, SHADOW_FRAG, FLAME_VERT, FLAME_FRAG,
} from './shaders/backdrop.js';

const MAX_PROPS = 52, MAX_SHAFTS = 6, MAX_POOLS = 4, MAX_FLAMES = 10;
const FLOOR_FRONT = 15;      // how far the floor reaches toward/behind the camera

/** Default room if a region does not author one. */
export const DEFAULT_ROOM = {
  w: 24, d: 19, h: 6.6, side: 0.0, ceilPattern: 3, wallPad: 7.0,
};

// Per-shape height correction so a candlestick is not the size of a wardrobe.
//  0 chair       1 candelabra  2 plant     3 headstone  4 chandelier
//  5 cabinet     6 column      7 drape     8 crates     9 shrub
// 10 cot        11 rocking horse 12 bed    13 range    14 longcase clock
// 15 statue     16 sarcophagus 17 bath     18 lamp post 19 birdcage
const SHAPE_H = [0.85, 0.50, 1.00, 0.62, 0.80, 1.05, 1.25, 1.00, 0.66, 0.80,
                 0.72, 0.70, 1.05, 0.95, 1.15, 1.10, 0.60, 0.68, 1.30, 1.00];
// ...and a width ratio, so a column is a column and not a capital-T.
const SHAPE_W = [1.15, 0.55, 1.00, 0.95, 1.20, 0.80, 0.34, 0.85, 1.10, 1.35,
                 1.30, 1.20, 1.60, 1.00, 0.42, 0.60, 1.50, 1.30, 0.34, 0.62];
// Which shapes hang from the ceiling rather than stand on the floor.
export const HANGING = { 4: 1, 7: 1 };

const NLIGHT = 5;
/** How much of a cinematic (key/fill) light reaches a PROP. See syncLights. */
const CINE_PROP = 0.26;
function v4arr(n = NLIGHT) { return Array.from({ length: n }, () => new THREE.Vector4()); }
function colArr(n = NLIGHT) { return Array.from({ length: n }, () => new THREE.Color()); }
/**
 * THREE.UniformsUtils.clone() only does `array.slice()`, so cloned materials end
 * up SHARING the Vector4/Color objects inside uniform arrays. Every clone needs
 * its own light slots or they all write over each other.
 */
function freshLightSlots(uniforms) {
  if (uniforms.uLights) uniforms.uLights.value = v4arr();
  if (uniforms.uLightCol) uniforms.uLightCol.value = colArr();
  if (uniforms.uLightInt) uniforms.uLightInt.value = new Array(NLIGHT).fill(0);
  if (uniforms.uPool) uniforms.uPool.value = v4arr(MAX_POOLS);
  if (uniforms.uPoolAxis) uniforms.uPoolAxis.value = v4arr(MAX_POOLS);
  if (uniforms.uPoolCol) uniforms.uPoolCol.value = colArr(MAX_POOLS);
  if (uniforms.uSize) uniforms.uSize.value = uniforms.uSize.value.clone();
  if (uniforms.uSpan) uniforms.uSpan.value = uniforms.uSpan.value.clone();
  if (uniforms.uCamera) uniforms.uCamera.value = uniforms.uCamera.value.clone();
  if (uniforms.uAmbient) uniforms.uAmbient.value = uniforms.uAmbient.value.clone();
  return uniforms;
}

export class Backdrop {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'backdrop';
    scene.add(this.group);

    this.room = Object.assign({}, DEFAULT_ROOM);
    this.pools = [];   // [{x, z, r, i, ax, ay, stretch}]

    /* ---------------------------------------------------------------- wall */
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: 1.7 }, uDread: { value: 0 },
        uFogAmt: { value: 0.18 }, uArch: { value: 0 }, uCool: { value: 1 },
        uGrime: { value: 0.7 }, uOpen: { value: 0.5 }, uCeil: { value: 6.4 },
        uGain: { value: 3.4 }, uGloss: { value: 0.3 }, uAlbLift: { value: 0.012 },
        uSize: { value: new THREE.Vector2(30, 14) },
        uDeep: { value: new THREE.Color(0x0d0b16) },
        uMid: { value: new THREE.Color(0x241a2c) },
        uHi: { value: new THREE.Color(0x3a2a3a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uOpenGlow: { value: new THREE.Color(0x2a7f99) },
        uAmbient: { value: new THREE.Color(0x0e0c16) },
        uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      },
      vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
      depthWrite: true, fog: false,
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wallMat);
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
      mat.uniforms.uSeed.value = 4.3 + i * 2.1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.renderOrder = 0;
      this.sides.push(m);
      this.group.add(m);
    }

    /* --------------------------------------------------------------- floor */
    const surfaceUniforms = () => ({
      uTime: { value: 0 }, uSeed: { value: 3.1 }, uDread: { value: 0 },
      uFogNear: { value: 16 }, uFogFar: { value: 34 }, uGloss: { value: 0.5 },
      uPattern: { value: 0 }, uGain: { value: 3.4 }, uAlbLift: { value: 0.010 },
      uIsCeiling: { value: 0 },
      uSpan: { value: new THREE.Vector2(30, 34) },
      uDeep: { value: new THREE.Color(0x090711) },
      uMid: { value: new THREE.Color(0x1c1622) },
      uFog: { value: new THREE.Color(0x0a0813) },
      uAccent: { value: new THREE.Color(0x3fb4d0) },
      uAmbient: { value: new THREE.Color(0x0e0c16) },
      uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
      uLights: { value: v4arr() }, uLightCol: { value: colArr() },
      uPool: { value: v4arr(MAX_POOLS) }, uPoolAxis: { value: v4arr(MAX_POOLS) },
      uPoolCol: { value: colArr(MAX_POOLS) },
    });

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: surfaceUniforms(),
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      depthWrite: true, fog: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = 1;
    this.group.add(this.floor);

    /* ------------------------------------------------------------- ceiling */
    // Same shader as the floor with a beam/vault/glazing pattern. It closes the
    // room, which is what stops the top of the frame reading as an empty void.
    this.ceilMat = new THREE.ShaderMaterial({
      uniforms: surfaceUniforms(),
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      depthWrite: true, fog: false,
    });
    this.ceilMat.uniforms.uPattern.value = 3;
    this.ceilMat.uniforms.uGloss.value = 0;
    this.ceilMat.uniforms.uIsCeiling.value = 1;
    this.ceilMat.uniforms.uFogNear.value = 12;
    this.ceilMat.uniforms.uFogFar.value = 30;
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ceilMat);
    this.ceiling.rotation.x = Math.PI / 2;
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
    propGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -9), 80);
    this.propGeo = propGeo;

    this.propMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSway: { value: 1 }, uRimAmt: { value: 1 }, uDread: { value: 0 },
        uGain: { value: 3.4 }, uGloss: { value: 0.55 },
        uFogNear: { value: 12 }, uFogFar: { value: 30 },
        uKeyDir: { value: new THREE.Vector2(-0.7, 0.7) },
        uAlbedo: { value: new THREE.Color(0x3a2c30) },
        uAlbedoHi: { value: new THREE.Color(0x5c4a48) },
        uFog: { value: new THREE.Color(0x0a0813) },
        uRim: { value: new THREE.Color(0xffb64a) },
        uAccent: { value: new THREE.Color(0x3fb4d0) },
        uAmbient: { value: new THREE.Color(0x14111f) },
        uCamera: { value: new THREE.Vector3(0, 2.2, 12) },
        uLights: { value: v4arr() }, uLightCol: { value: colArr() },
        uLightInt: { value: new Array(NLIGHT).fill(0) },
        uMatMix: { value: new THREE.Vector4(0.30, 0.10, 0.24, 0.05) },
        uMatFreq: { value: new THREE.Vector2(0.55, 1.30) },
        uAO: { value: 1.0 },
        uPropKnee: { value: 0.30 }, uPropMax: { value: 0.55 },
      },
      vertexShader: PROP_VERT, fragmentShader: PROP_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.props = new THREE.Mesh(propGeo, this.propMat);
    this.props.frustumCulled = false;
    this.props.renderOrder = 3;
    this.group.add(this.props);

    /* ----------------------------------------------------- contact shadows */
    const shGeo = new THREE.InstancedBufferGeometry();
    const shBase = new THREE.PlaneGeometry(1, 1);
    shGeo.index = shBase.index;
    shGeo.setAttribute('position', shBase.getAttribute('position'));
    shGeo.setAttribute('uv', shBase.getAttribute('uv'));
    this._shdOffset = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 3), 3);
    this._shdScale = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS * 2), 2);
    this._shdStr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PROPS), 1);
    /* setActorShadows() is a per-frame call for any scene that moves an actor, and
       a STATIC_DRAW respecification there stalls the pipeline the same way the
       flame buffers did. Declare the intent up front. */
    for (const a of [this._shdOffset, this._shdScale, this._shdStr]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    shGeo.setAttribute('aOffset', this._shdOffset);
    shGeo.setAttribute('aScale', this._shdScale);
    shGeo.setAttribute('aStrength', this._shdStr);
    shGeo.instanceCount = 0;
    shGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -9), 80);
    this.shadowGeo = shGeo;
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: { uFogNear: { value: 14 }, uFogFar: { value: 30 } },
      vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.MultiplyBlending, fog: false,
    });
    this.shadows = new THREE.Mesh(shGeo, this.shadowMat);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.group.add(this.shadows);

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
    shaftGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, -10), 80);
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

    /* -------------------------------------------------------------- flames */
    const flGeo = new THREE.InstancedBufferGeometry();
    const flBase = new THREE.PlaneGeometry(1, 1);
    flGeo.index = flBase.index;
    flGeo.setAttribute('position', flBase.getAttribute('position'));
    flGeo.setAttribute('uv', flBase.getAttribute('uv'));
    this._flPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
    this._flCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 3), 3);
    this._flParam = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 2), 2);
    this._flSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES), 1);
    /* PERF: these are rewritten every frame by syncFlames(). three defaults
       BufferAttributes to STATIC_DRAW, which ANGLE backs with a D3D11 DEFAULT
       buffer — and bufferSubData on one of those is an UpdateSubresource that
       must wait for every queued draw still reading it. Four of them per frame
       measured as 8.5 ms of pure pipeline stall on Intel UHD (25.0 -> 16.5 ms
       median frame with syncFlames stubbed out) on 90 floats of actual data.
       DynamicDrawUsage lets the driver rename the buffer instead of syncing. */
    for (const a of [this._flPos, this._flCol, this._flParam, this._flSeed]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    flGeo.setAttribute('aPos', this._flPos);
    flGeo.setAttribute('aCol', this._flCol);
    flGeo.setAttribute('aParam', this._flParam);
    flGeo.setAttribute('aSeed', this._flSeed);
    flGeo.instanceCount = 0;
    flGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -8), 80);
    this.flameGeo = flGeo;
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDread: { value: 0 } },
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.flames = new THREE.Mesh(flGeo, this.flameMat);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 5;
    this.group.add(this.flames);

    /* --------------------------------------------------------- near frame
       PERF (2026-08-20): these four quads were 7.4 x 4.2 m planes sitting 2.2 m
       from the eye with `depthTest: false` and `frustumCulled = false`. Each one
       therefore rasterised the ENTIRE viewport and ran FRAME_FRAG — which opens
       with an mmFbm3 before it can reach its `discard` — on every pixel of it.
       Measured on Intel UHD at 1600x900 that was 4.2-4.7 ms per frame, the single
       most expensive item in the whole scene, and a screenshot bisection showed
       three of the four quads contributing ZERO visible pixels (the side drapes
       fall outside the horizontal frustum, the clutter band below it).

       Each mode only ever marks a narrow band of its own quad, so the geometry is
       now cropped to that band and the uv attribute is remapped to carry the
       original 0..1 range across it. FRAME_FRAG is untouched and every pixel it
       used to write it still writes — the crop only removes fragments where the
       mask was provably zero. Bounds below are the analytic maxima of each mask
       (mmFbm3 <= 0.9625, mmRidge <= 0.9375) plus margin. */
    this.frames = [];
    //          mode, uMin, uMax, vMin, vMax
    const FRAME_CROP = [
      [0, 0.00, 0.24, 0.00, 1.00],   // left drape:  mask needs p.x < 0.218
      [0, 0.00, 0.24, 0.00, 1.00],   // right drape: same, mirrored by scale.x
      [1, 0.00, 1.00, 0.59, 1.00],   // top lintel:  mask needs p.y > 0.607
      [2, 0.00, 1.00, 0.00, 0.23],   // clutter band: mask needs p.y < 0.206
    ];
    const FW = 7.4, FH = 4.2;
    for (let i = 0; i < 4; i++) {
      const [mode, u0, u1, v0, v1] = FRAME_CROP[i];
      const g = new THREE.PlaneGeometry(FW * (u1 - u0), FH * (v1 - v0));
      // keep the crop where the full quad had it
      g.translate(FW * ((u0 + u1) * 0.5 - 0.5), FH * ((v0 + v1) * 0.5 - 0.5), 0);
      const uvAttr = g.attributes.uv;
      for (let k = 0; k < uvAttr.count; k++) {
        uvAttr.setXY(k, u0 + (u1 - u0) * uvAttr.getX(k), v0 + (v1 - v0) * uvAttr.getY(k));
      }
      uvAttr.needsUpdate = true;

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: i * 3.7 + 1 },
          uMode: { value: mode },
          uAmount: { value: 0.9 }, uDread: { value: 0 },
          uColor: { value: new THREE.Color(0x06050c) },
          uRim: { value: new THREE.Color(0xffb64a) },
        },
        vertexShader: FRAME_VERT, fragmentShader: FRAME_FRAG,
        transparent: true, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(g, mat);
      m.position.set(0, 2.08, 7.2 + i * 0.01);
      if (i === 1) m.scale.x = -1;                // mirrored right-hand drape
      m.renderOrder = 8;
      /* Now that each quad is only as big as its band, frustum culling is worth
         having: in most camera rigs the two drapes and the clutter band fall
         outside the frustum entirely and cost nothing at all. */
      m.frustumCulled = true;
      this.frames.push(m);
      this.group.add(m);
    }

    this._tmpV2 = new THREE.Vector2();
    this._applyRoom(this.room);
  }

  /* -------------------------------------------------------------- geometry */

  /** Resize the shell for a region's room proportions. */
  _applyRoom(room) {
    this.room = room;
    const open = room.h <= 0.01;
    const wallH = open ? 17 : room.h + room.wallPad;
    const wallW = room.w + (open ? 0 : 1.2);

    this.wall.geometry.dispose();
    this.wall.geometry = new THREE.PlaneGeometry(wallW, wallH);
    this.wall.position.set(0, wallH / 2, -room.d);
    this.wallMat.uniforms.uSize.value.set(wallW, wallH);

    const sideLen = room.d + FLOOR_FRONT;
    const sideCz = (FLOOR_FRONT - room.d) / 2;
    for (let i = 0; i < 2; i++) {
      const m = this.sides[i];
      m.geometry.dispose();
      m.geometry = new THREE.PlaneGeometry(sideLen, wallH);
      const s = i === 0 ? -1 : 1;
      m.position.set(s * room.w / 2, wallH / 2, sideCz);
      m.rotation.set(0, s * (-Math.PI / 2) + s * room.side, 0);
      m.material.uniforms.uSize.value.set(sideLen, wallH);
    }

    const spanZ = room.d + FLOOR_FRONT;
    const cz = (FLOOR_FRONT - room.d) / 2;
    this.floor.geometry.dispose();
    this.floor.geometry = new THREE.PlaneGeometry(room.w, spanZ);
    this.floor.position.set(0, 0, cz);
    this.floorMat.uniforms.uSpan.value.set(room.w, spanZ);

    this.ceiling.visible = !open;
    if (!open) {
      this.ceiling.geometry.dispose();
      this.ceiling.geometry = new THREE.PlaneGeometry(room.w, spanZ);
      this.ceiling.position.set(0, room.h, cz);
      this.ceilMat.uniforms.uSpan.value.set(room.w, spanZ);
      this.ceilMat.uniforms.uPattern.value = room.ceilPattern ?? 3;
    }
    this._floorCz = cz;
    this._wallZ = -room.d;
    this._wallW = wallW;
    this._sideX = room.w / 2;
    this._sideLen = sideLen;
    this._sideCz = sideCz;
  }

  /* ------------------------------------------------------------- structure */

  /**
   * Prop placement. Each layout is a genuinely different room arrangement, not a
   * reseed of the same one — that is the whole point of the round-2 rework.
   * Returns an array of {x, y, z, w, h, shape, seed, tone}.
   */
  _layoutProps(pal, room, rand) {
    const P = pal.props || {};
    const shapes = P.shapes || [0, 1, 5, 6];
    const n = Math.min(P.count ?? 22, MAX_PROPS);
    const H = P.height ?? 2.2;
    const ceil = room.h > 0 ? room.h : 7.0;
    const out = [];
    const pick = () => shapes[(rand() * shapes.length) | 0];
    const sized = (shape, scale) => {
      const h = H * scale * (SHAPE_H[shape] ?? 1) * (0.80 + rand() * 0.44);
      return { h, w: h * (SHAPE_W[shape] ?? 1) * (0.66 + rand() * 0.38) };
    };
    /* Keep props inside the lens. A prop at x = +-halfW in a 34 m ballroom is
       simply off-screen, which is how round 1 ended up with a props crop that
       contained almost no prop: the layout spread across the ROOM, not across
       the FRAME. Clamp to the visible half-width at that depth.
       `aspect` is the live viewport aspect, floored at 16:9. Round 2 hard-coded
       16/9 here, so the clamp was a lie on any other window shape — and it is
       floored rather than used raw because a WIDER window must not be allowed to
       push a prop outward: the placement is computed once at setMood() and a
       later resize never re-runs it. */
    const cam = pal.cam || {};
    const camZ = cam.z ?? 9.6, camY = cam.y ?? 2.3, look = cam.look ?? 2.4;
    const aspect = Math.min(pal.aspect || (16 / 9), 16 / 9);
    const tanH = Math.tan(((cam.fov ?? 42) * Math.PI) / 360) * aspect;
    /* Half the visible width at a point, in metres.
       The camera is PITCHED (it looks at `cam.look`, not at its own eye height),
       so the perspective divide uses view-space depth, not the z-distance. Round
       2 used `camZ - z`, which over-estimates the frame for anything high up and
       under-estimates it for anything low — and a prop clamped against a frame
       width that is not the frame's is how a curtain ends up cut by the viewport
       edge. No roll and no yaw, so the horizontal axis is still world X. */
    const fy = look - camY, fl = Math.hypot(fy, camZ) || 1;
    const tanV = Math.tan(((cam.fov ?? 42) * Math.PI) / 360);
    const depth = (y, z) => Math.max(((y - camY) * fy + (camZ - z) * camZ) / fl, 0.6);
    const frameX = (z, y = camY) => Math.max(depth(y, z) * tanH * 0.94, 1.2);
    // signed height above the frame centre line, same view basis (no roll)
    const vert = (y, z) => ((y - camY) * camZ - (camZ - z) * fy) / fl;
    const inFrameY = (y, z) => Math.abs(vert(y, z)) < depth(y, z) * tanV * 0.93;
    const halfW = room.w / 2;
    const openSky = room.h <= 0.01;
    const floorFallback = shapes.find((s) => HANGING[s] !== 1) ?? 5;

    const push = (shape, x, z, scale, tone, atY) => {
      /* Nothing hangs from an open sky. The Graveyard, the Hedge Maze and the
         Pumpkin Grounds have no ceiling at all; a drape or a chandelier placed
         there is a rectangle floating against the stars. */
      let s = (HANGING[shape] === 1 && openSky) ? floorFallback : shape;
      const hang = HANGING[s] === 1;
      let { h, w } = sized(s, scale);
      /* A curtain is as long as the wall it is on. Sized by the region's generic
         prop height a Nursery drape came out 1.3 m in a 4.8 m room — a small
         pale rectangle stuck to the wall, which is a large part of why they read
         as debris rather than as soft furnishing. */
      if (s === 7) {
        h = Math.min(Math.max(h, ceil * 0.58), ceil * 0.86);
        w = h * (SHAPE_W[7] ?? 0.85) * (0.62 + rand() * 0.30);
      }
      let y = atY ?? 0.02;
      /* Half the frame at this prop's own depth, measured at BOTH ends of it —
         a tall prop's head and its foot are at different view depths under a
         pitched camera, and the narrower of the two is the one that cuts. */
      const limAt = (zz) => Math.max(
        Math.min(halfW * 0.98, frameX(zz, y), frameX(zz, y + h)) - w * 0.5, 0.4);
      if (hang) {
        /* A DRAPE HANGS ON A WALL. Meeting the ceiling plane exactly is not
           enough: a curtain panel in the middle of an open floor reads as a
           floating slab, and a reviewer counted two of them in the Nursery. Rail
           shapes go to the back wall or a side wall; a chandelier may hang
           anywhere, because it now draws its own ceiling rose. Either way the
           top overlaps the ceiling by 4 cm so perspective can never open a
           sliver of gap. */
        y = Math.max(ceil - h + 0.04, 0.35);
        if (s === 7) {
          /* ...on the NEAREST wall. Sending every curtain to the back wall
             anchored them and also deleted the near-frame verticals that told
             four of these rooms apart — structural cross-correlation went 0.30
             to 0.37 the moment they all moved to the same place. A side wall is
             still a wall, and it keeps the silhouette in the mid-frame.
             `limAt` and not a separate calculation, so the general clamp below
             cannot then pull the curtain back off its wall and into mid-air —
             which is exactly what three of them did. */
          const side = limAt(z);
          if (Math.abs(x) > room.w * 0.30 && side > room.w * 0.34) {
            x = Math.sign(x || 1) * side;
          } else {
            z = -room.d + 0.35 + rand() * 0.8;
          }
        }
        /* THE ANCHOR HAS TO BE IN SHOT. A chandelier hanging 3.7 m from a
           ballroom camera has its ceiling rose above the top of the frame, and
           an anchor you cannot see is not an anchor — it reads exactly like the
           floating panels this round is fixing. Walk it back until the fixing
           is inside the frame. */
        let guard = 0;
        while (guard++ < 30 && !inFrameY(y + h, z) && z > -room.d + 0.5) {
          z = Math.max(z - 0.55, -room.d + 0.4);
        }
      }
      /* Clamp on the prop's OWN EXTENT, not on its centre. Round 2 clamped the
         centre, so anything wider than nothing could still hang half of itself
         past the edge of frame — which is exactly how the Nursery shipped a
         curtain cut in two by the viewport edge. */
      const lim = limAt(z);
      if (Math.abs(x) > lim) x = Math.sign(x || 1) * lim * (0.62 + 0.34 * rand());
      out.push({ x, z, w, h, shape: s, seed: rand() * 10, tone, y, hang });
    };
    /** Architecture: sized directly, allowed to run off the frame edges.
     *  Does not count against the region's authored prop budget. */
    let archN = 0;
    const pushArch = (shape, x, z, w, h, tone) => {
      archN++;
      out.push({ x, z, w, h, shape, seed: rand() * 10, tone, y: 0.02,
                 hang: false, arch: true });
    };
    const layout = P.layout || 'wings';

    if (layout === 'colonnade') {
      // Two receding files of heavy verticals. Reads as depth, not as clutter.
      const rows = Math.max(3, Math.round(n / 4));
      const x0 = halfW * 0.58;
      for (let r = 0; r < rows && out.length < n; r++) {
        const t = r / Math.max(rows - 1, 1);
        const z = -1.6 - t * (room.d - 3.4);
        push(shapes[0], -x0 * (1 - t * 0.14), z, 1.24 - t * 0.16, 0.30 + t * 0.55);
        if (out.length < n) push(shapes[0], x0 * (1 - t * 0.14), z + (rand() - 0.5) * 0.5, 1.24 - t * 0.16, 0.30 + t * 0.55);
      }
      while (out.length < n) {
        const s = pick();
        push(s, (rand() * 2 - 1) * halfW * 0.86, -3 - rand() * (room.d - 4), 1.0, 0.25 + rand() * 0.6);
      }

    } else if (layout === 'rows') {
      // A field: staggered ranks across the FULL width, low, marching back.
      const ranks = 5;
      const per = Math.ceil(n / ranks);
      for (let r = 0; r < ranks && out.length < n; r++) {
        const t = r / (ranks - 1);
        const z = -2.2 - t * (room.d - 3.0);
        for (let i = 0; i < per && out.length < n; i++) {
          const jitter = (r % 2) * 0.5;
          const x = ((i + jitter) / per - 0.5) * 2 * halfW * 0.94 + (rand() - 0.5) * 0.8;
          push(pick(), x, z + (rand() - 0.5) * 1.1, 1.06 - t * 0.22, 0.16 + t * 0.7);
        }
      }

    } else if (layout === 'aisle') {
      // Massive props hugging the frame edges up close, thinning fast with depth.
      for (let i = 0; i < n; i++) {
        const t = Math.pow(i / Math.max(n - 1, 1), 0.72);
        const s = Math.sign(rand() - 0.5) || 1;
        const x = s * (halfW * (0.52 + 0.44 * rand())) * (1 - t * 0.18);
        const z = -1.0 - t * (room.d - 2.0);
        push(pick(), x, z, 1.55 - t * 0.72, 0.10 + t * 0.78);
      }

    } else if (layout === 'clutter') {
      // Dense, small, everywhere including the centre — but short enough to see over.
      for (let i = 0; i < n; i++) {
        const z = -1.2 - rand() * (room.d - 1.8);
        const depth = (-z) / room.d;
        const x = (rand() * 2 - 1) * halfW * 0.95;
        push(pick(), x, z, 0.62 + rand() * 0.42, 0.14 + depth * 0.72);
      }

    } else if (layout === 'nook') {
      // Strongly asymmetric: a heavy mass on one side, near-empty on the other.
      const s = pal.nookSide ?? -1;
      for (let i = 0; i < n; i++) {
        const heavy = rand() < 0.78;
        const t = rand();
        const x = heavy
          ? s * halfW * (0.26 + 0.68 * t)
          : -s * halfW * (0.72 + 0.22 * t);
        const z = -1.4 - rand() * (room.d - 2.2);
        push(pick(), x, z, heavy ? 1.1 + rand() * 0.5 : 0.85, 0.14 + (-z / room.d) * 0.72);
      }

    } else if (layout === 'terrace') {
      /* Three stepped PLANTING BEDS rising toward the back wall. Round 2 lifted
         the plants by `f * room.h * 0.20` with nothing whatsoever beneath them:
         20 of the Greenhouse's 30 props were measurably airborne. Each tier now
         stands on a real masonry bed that runs the full width of the frame —
         architecture, so it is allowed to reach the edges — and the lift is
         capped at 1.25 m, because a 2.1 m "step" is a wall. */
      const tiers = 3;
      const per = Math.ceil(n / tiers);
      const bedShape = 16;   // the chest SDF: a masonry planting bed
      for (let t = 0; t < tiers && out.length - archN < n; t++) {
        const f = t / (tiers - 1);
        const z = -3.0 - f * (room.d - 4.5);
        const lift = f * Math.min((room.h > 0 ? room.h : 8) * 0.16, 1.25);
        if (lift > 0.22) {
          const span = Math.min(halfW * 0.98, frameX(z + 0.6, lift));
          /* Enough beds that each one keeps roughly its own shape's proportions.
             Three beds across a 30 m greenhouse meant one 9 m x 1.2 m quad, and
             a chest SDF stretched 7:1 reads as a green blob, not as masonry. */
          const beds = Math.max(3, Math.round((span * 2) / Math.max(lift * 2.0, 1.2)));
          for (let i = 0; i < beds; i++) {
            pushArch(bedShape, ((i + 0.5) / beds - 0.5) * 2 * span,
                     z + 0.6, (span * 2) / beds + 0.25, lift, 0.30 + f * 0.42);
          }
        }
        for (let i = 0; i < per && out.length - archN < n; i++) {
          const x = ((i + 0.5) / per - 0.5) * 2 * halfW * 0.88 + (rand() - 0.5) * 0.9;
          push(pick(), x, z + (rand() - 0.5) * 0.8, 1.15 - f * 0.18, 0.20 + f * 0.66,
               0.02 + lift);
        }
      }

    } else if (layout === 'hang') {
      // Ceiling-dominant: the mass is overhead, the floor is nearly clear.
      const hangShapes = shapes.filter((s) => HANGING[s] === 1);
      const floorShapes = shapes.filter((s) => HANGING[s] !== 1);
      for (let i = 0; i < n; i++) {
        const overhead = hangShapes.length && rand() < 0.62;
        const pool = overhead ? hangShapes : (floorShapes.length ? floorShapes : shapes);
        const s = pool[(rand() * pool.length) | 0];
        const z = -2.0 - rand() * (room.d - 3.0);
        const x = (rand() * 2 - 1) * halfW * (overhead ? 0.90 : 0.82);
        push(s, x, z, overhead ? 1.15 : 1.0, 0.16 + (-z / room.d) * 0.7);
      }

    } else if (layout === 'perimeter') {
      // Everything lines the back wall and the two side walls. Empty middle.
      for (let i = 0; i < n; i++) {
        const onBack = rand() < 0.55;
        let x, z;
        if (onBack) {
          x = (rand() * 2 - 1) * halfW * 0.92;
          z = -room.d + 0.9 + rand() * 1.6;
        } else {
          x = (Math.sign(rand() - 0.5) || 1) * halfW * (0.80 + rand() * 0.14);
          z = -2.0 - rand() * (room.d - 3.0);
        }
        push(pick(), x, z, onBack ? 1.0 : 1.22, onBack ? 0.74 : 0.24 + rand() * 0.4);
      }

    } else {
      // 'wings' — the original: three depth bands biased to the sides.
      const bands = [
        { z: -room.d * 0.84, spread: 0.94, scale: 0.95, tone: 0.85, gap: 0.14 },
        { z: -room.d * 0.56, spread: 0.82, scale: 1.10, tone: 0.50, gap: 0.26 },
        { z: -room.d * 0.28, spread: 0.70, scale: 1.28, tone: 0.22, gap: 0.38 },
      ];
      let k = 0;
      for (let b = 0; b < bands.length && k < n; b++) {
        const band = bands[b];
        const per = Math.ceil(n / bands.length);
        for (let i = 0; i < per && k < n; i++, k++) {
          const s = pick();
          let x = rand() * 2 - 1;
          x = Math.sign(x) * Math.pow(Math.abs(x), 0.62) * halfW * band.spread;
          const gap = halfW * band.gap;
          if (Math.abs(x) < gap) x = Math.sign(x || 1) * (gap + rand() * 1.6);
          push(s, x, band.z + (rand() - 0.5) * 1.8, band.scale, band.tone * (0.7 + rand() * 0.6));
        }
      }
    }
    return out.slice(0, MAX_PROPS);
  }

  /** Rebuild props, contact shadows and shafts for a region. */
  build(pal, rand = Math.random) {
    const room = Object.assign({}, DEFAULT_ROOM, pal.room);
    this._applyRoom(room);

    const placed = this._layoutProps(pal, room, rand);
    const off = this._propOffset.array, sc = this._propScale.array,
      sh = this._propShape.array, sd = this._propSeed.array, tn = this._propTone.array;
    const so2 = this._shdOffset.array, ss2 = this._shdScale.array, st2 = this._shdStr.array;

    // back-to-front so alpha-blended silhouettes stack correctly
    placed.sort((a, b) => a.z - b.z);

    let shadowN = 0;
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k];
      off[k * 3 + 0] = p.x; off[k * 3 + 1] = p.y; off[k * 3 + 2] = p.z;
      sc[k * 2 + 0] = p.w; sc[k * 2 + 1] = p.h;
      sh[k] = p.shape; sd[k] = p.seed; tn[k] = p.tone;
      /* Contact shadow for anything that STANDS on something. `p.y < 1.2` was a
         proxy for that and it was wrong at both ends: it gave a terrace plant
         lifted 1.1 m a shadow on the floor 1.1 m below it, and it silently
         dropped the shadow of anything standing higher. The shadow now sits at
         the prop's own base, and hanging props do not get one. */
      if (!p.hang) {
        const i = shadowN++;
        so2[i * 3 + 0] = p.x; so2[i * 3 + 1] = p.y + 0.015; so2[i * 3 + 2] = p.z;
        ss2[i * 2 + 0] = p.w * 2.0; ss2[i * 2 + 1] = p.w * 1.15;
        st2[i] = 0.52 + 0.26 * (1 - p.tone);
      }
    }
    this._propOffset.needsUpdate = this._propScale.needsUpdate = true;
    this._propShape.needsUpdate = this._propSeed.needsUpdate = this._propTone.needsUpdate = true;
    this.propGeo.instanceCount = placed.length;
    /* Kept for the placement audit (tools/lookmetrics.py --audit). Round 3 shipped
       two curtain panels hanging in the ceiling void of the Nursery and one cut by
       the viewport edge; nothing in the build could see that, because the placement
       existed only inside this function. It is a reference to plain objects that
       are already alive — no copy, no per-frame cost. */
    this.placed = placed;
    this._shdOffset.needsUpdate = this._shdScale.needsUpdate = this._shdStr.needsUpdate = true;
    this._propShadowN = shadowN;
    this.shadowGeo.instanceCount = shadowN;
    if (this._actors?.length) this.setActorShadows(this._actors);

    /* ---- shafts: extend each beam until it reaches the floor, and record the
       elliptical pool where it lands so the floor shader can paint it. ------- */
    const S = pal.shafts || {};
    const sn = Math.min(S.count ?? 3, MAX_SHAFTS);
    const so = this._shOrigin.array, sp = this._shParam.array,
      ss = this._shSeed.array, si = this._shInt.array;
    this.pools.length = 0;
    const ceilY = room.h > 0 ? room.h : 12.0;
    for (let i = 0; i < sn; i++) {
      const t = sn === 1 ? 0.5 : i / (sn - 1);
      const ox = (t - 0.5) * (S.spread ?? room.w * 0.72) + (rand() - 0.5) * 1.6;
      const oy = Math.min(S.y ?? ceilY + 1.4, ceilY + 2.2);
      const oz = (S.z ?? -room.d * 0.62) + (rand() - 0.5) * 2.4;
      const angle = (S.angle ?? 0.28) * (t < 0.5 ? 1 : -1) + (rand() - 0.5) * 0.10;
      const width = S.width ?? 3.2;
      // distance along the beam from origin to y = 0, plus a little overshoot so
      // the quad definitely crosses the floor plane
      const toFloor = oy / Math.max(Math.cos(angle), 0.15);
      const len = toFloor * 1.06;
      so[i * 3 + 0] = ox; so[i * 3 + 1] = oy; so[i * 3 + 2] = oz;
      sp[i * 3 + 0] = angle; sp[i * 3 + 1] = len; sp[i * 3 + 2] = width;
      ss[i] = rand() * 10;
      const inten = (S.intensity ?? 0.5) * (0.78 + rand() * 0.44);
      si[i] = inten;
      this.pools.push({
        x: ox + Math.tan(angle) * oy,
        z: oz,
        r: width * (0.62 + Math.abs(angle) * 0.4),
        i: inten * (S.pool ?? 1.35),
        ax: 1, ay: 0,
        stretch: 1.0 / Math.max(Math.cos(angle), 0.4),
      });
    }
    this._shOrigin.needsUpdate = this._shParam.needsUpdate = true;
    this._shSeed.needsUpdate = this._shInt.needsUpdate = true;
    this.shaftGeo.instanceCount = sn;
    this.pools.sort((a, b) => b.i - a.i);
    this._writePools();

    this.wallMat.uniforms.uSeed.value = 1 + rand() * 9;
    this.floorMat.uniforms.uSeed.value = 1 + rand() * 9;
    this.ceilMat.uniforms.uSeed.value = 1 + rand() * 9;
  }

  /**
   * Ground shadows for actors a scene owns. `list` items: {x, z, r, strength}.
   * These are appended after the prop shadows in the same instanced draw, so an
   * enemy costs nothing extra.
   */
  setActorShadows(list) {
    this._actors = list;
    const base = this._propShadowN || 0;
    const off = this._shdOffset.array, sc = this._shdScale.array, st = this._shdStr.array;
    let k = base;
    for (let i = 0; i < list.length && k < MAX_PROPS; i++, k++) {
      const a = list[i];
      off[k * 3 + 0] = a.x; off[k * 3 + 1] = 0.018; off[k * 3 + 2] = a.z ?? -4;
      sc[k * 2 + 0] = (a.r ?? 0.9) * 2.2; sc[k * 2 + 1] = (a.r ?? 0.9) * 1.25;
      st[k] = a.strength ?? 0.62;
    }
    this._shdOffset.needsUpdate = this._shdScale.needsUpdate = this._shdStr.needsUpdate = true;
    this.shadowGeo.instanceCount = k;
  }

  _writePools() {
    const fu = this.floorMat.uniforms;
    for (let i = 0; i < MAX_POOLS; i++) {
      const p = this.pools[i];
      if (!p) { fu.uPool.value[i].set(0, 0, 1, 0); continue; }
      // floor-local: (x, -(z - floorCz)) — matches syncLights
      fu.uPool.value[i].set(p.x, -(p.z - this._floorCz), p.r, p.i);
      fu.uPoolAxis.value[i].set(p.ax, p.ay, p.stretch, 0);
    }
  }

  /** Colour + parameter application. Safe to call every frame during a cross-fade. */
  applyPalette(p) {
    const ceil = p.room?.h > 0 ? p.room.h : (p.ceil ?? 6.4);
    const w = this.wallMat.uniforms;
    w.uArch.value = p.arch ?? 0;
    w.uCool.value = p.coolFill ?? 0.9;
    w.uGrime.value = p.grime ?? 0.7;
    w.uOpen.value = p.openGlow ?? 0.5;
    w.uFogAmt.value = p.wallFog ?? 0.18;
    w.uCeil.value = ceil;
    w.uGain.value = (p.gain ?? 3.4) * 1.05;
    w.uGloss.value = (p.gloss ?? 0.5) * 0.5;
    w.uDeep.value.copy(p._deep);
    w.uMid.value.copy(p._mid);
    w.uHi.value.copy(p._hi);
    w.uAccent.value.copy(p._accent);
    w.uFog.value.copy(p._fog);
    w.uOpenGlow.value.copy(p._open);
    w.uAmbient.value.copy(p._ambient);

    const f = this.floorMat.uniforms;
    f.uPattern.value = p.floorPattern ?? 0;
    f.uGloss.value = p.gloss ?? 0.5;
    f.uGain.value = (p.gain ?? 3.4) * 0.58;
    f.uDeep.value.copy(p._floorDeep);
    f.uMid.value.copy(p._floorMid);
    f.uFog.value.copy(p._fog);
    f.uAccent.value.copy(p._accent);
    f.uAmbient.value.copy(p._ambient);
    for (let i = 0; i < MAX_POOLS; i++) f.uPoolCol.value[i].copy(p._shaft);

    const c = this.ceilMat.uniforms;
    c.uDeep.value.copy(p._deep).multiplyScalar(0.50);
    c.uMid.value.copy(p._mid).multiplyScalar(0.58);
    c.uFog.value.copy(p._fog);
    c.uAccent.value.copy(p._accent);
    c.uAmbient.value.copy(p._ambient);
    c.uGain.value = (p.gain ?? 3.4) * 0.085;

    const pr = this.propMat.uniforms;
    pr.uAlbedo.value.copy(p._propAlb);
    pr.uAlbedoHi.value.copy(p._propHi);
    pr.uFog.value.copy(p._fog);
    pr.uRim.value.copy(p._rim);
    pr.uAccent.value.copy(p._accent);
    pr.uAmbient.value.copy(p._ambient);
    pr.uRimAmt.value = p.rim ?? 1.0;
    pr.uGain.value = (p.gain ?? 3.4) * (p.propGain ?? 1.0);
    pr.uGloss.value = p.propGloss ?? 0.55;
    /* THE PROP LUMINANCE CEILING, in pre-grade units. The grade multiplies by
       uExposure before ACES, so a fixed post-grade target is a MOVING pre-grade
       one: `heart` runs exposure 1.11 and `attic` 2.80, and a single hard clamp
       would either kill the dark rooms or do nothing in the bright ones. Divide
       the target through by the region's own exposure and every room lands on
       the same ceiling. */
    const ex = Math.max(p.exposure ?? 2.0, 0.4);
    const max = (p.propCeil ?? 0.80) / ex;
    pr.uPropMax.value = max;
    pr.uPropKnee.value = max * 0.55;

    for (let i = 0; i < 2; i++) {
      const su = this.sides[i].material.uniforms;
      su.uArch.value = p.arch ?? 0;
      su.uCool.value = (p.coolFill ?? 0.9) * 0.85;
      su.uGrime.value = Math.min(1, (p.grime ?? 0.7) + 0.12);
      su.uOpen.value = 0;                       // no doorway on the side walls
      su.uFogAmt.value = (p.wallFog ?? 0.18) + 0.10;
      su.uCeil.value = ceil;
      su.uGain.value = (p.gain ?? 3.4) * 0.95;
      su.uGloss.value = (p.gloss ?? 0.5) * 0.4;
      su.uDeep.value.copy(p._deep); su.uMid.value.copy(p._mid); su.uHi.value.copy(p._hi);
      su.uAccent.value.copy(p._accent); su.uFog.value.copy(p._fog);
      su.uOpenGlow.value.copy(p._open); su.uAmbient.value.copy(p._ambient);
      this.sides[i].visible = p.sides !== false;
    }

    this.shaftMat.uniforms.uColor.value.copy(p._shaft);
    for (const m of this.frames) {
      m.material.uniforms.uColor.value.copy(p._frame);
      m.material.uniforms.uRim.value.copy(p._rim);
      m.material.uniforms.uAmount.value = p.frameAmount ?? 0.92;
    }
  }

  /**
   * The region's prop MATERIAL. Structural, not a colour — it swaps with the
   * geometry at build time rather than cross-fading, because a cabinet does not
   * gradually stop being oak.
   */
  applyPropMaterial(m) {
    if (!m) return;
    const u = this.propMat.uniforms;
    u.uMatMix.value.set(m.mix[0], m.mix[1], m.mix[2], m.mix[3]);
    u.uMatFreq.value.set(m.freq[0], m.freq[1]);
    u.uAO.value = m.ao;
  }

  /** Pack the light rig into wall- and floor-local coordinates. */
  syncLights(rig) {
    const wl = this.wallMat.uniforms.uLights.value, wc = this.wallMat.uniforms.uLightCol.value;
    const fl = this.floorMat.uniforms.uLights.value, fc = this.floorMat.uniforms.uLightCol.value;
    const cl = this.ceilMat.uniforms.uLights.value, cc = this.ceilMat.uniforms.uLightCol.value;
    const ceilY = this.ceiling.position.y;
    const WALL_W = this._wallW, WALL_Z = this._wallZ, SIDE_X = this._sideX;
    for (let i = 0; i < NLIGHT; i++) {
      const p = rig.worldPos[i], inten = rig.inten[i], r = p.w || 1;
      // wall: fold the plane-distance into the intensity so the vec4 stays packed
      const dzw = p.z - WALL_Z;
      wl[i].set(p.x + WALL_W / 2, p.y, r, inten / (1 + (dzw / r) * (dzw / r)));
      wc[i].copy(rig.colors[i]);
      const dyf = p.y;
      fl[i].set(p.x, -(p.z - this._floorCz), r, inten / (1 + (dyf / r) * (dyf / r)));
      fc[i].copy(rig.colors[i]);
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const su = this.sides[sIdx].material.uniforms;
        const sl = su.uLights.value, sc = su.uLightCol.value;
        // left wall runs front->back as u goes 0->1; right wall runs the other way
        const front = this._sideCz + this._sideLen / 2;
        const qx = sIdx === 0 ? (front - p.z) : (p.z - (this._sideCz - this._sideLen / 2));
        const dxs = sIdx === 0 ? (p.x + SIDE_X) : (SIDE_X - p.x);
        sl[i].set(qx, p.y, r, inten / (1 + (dxs / r) * (dxs / r)));
        sc[i].copy(rig.colors[i]);
      }
      const dyc = ceilY - p.y;
      cl[i].set(p.x, (p.z - this._floorCz), r, inten / (1 + (dyc / r) * (dyc / r)));
      cc[i].copy(rig.colors[i]);
    }
    const pl = this.propMat.uniforms.uLights.value, pc = this.propMat.uniforms.uLightCol.value;
    const pi = this.propMat.uniforms.uLightInt.value;
    for (let i = 0; i < NLIGHT; i++) {
      pl[i].copy(rig.worldPos[i]); pc[i].copy(rig.colors[i]);
      /* A KEY LIGHT LIGHTS THE SUBJECT, NOT THE SET.
         The key and fill sit in front of the action plane, a couple of metres
         from the camera. In a deep room laid out on the perimeter (the Crypt)
         nothing is within their reach and the props look right. In a shallow
         room with a clutter layout (the Nursery, 12.5 m deep) props land 3 m
         from a 7.5 m-radius key and take it at near-full strength — which is
         the entire difference between the two halves of the bimodal split a
         reviewer found. Practical lamps light props; cinematic lights barely
         do. */
      pi[i] = rig.inten[i] * (rig.cine[i] ? CINE_PROP : 1);
    }
    this.propMat.uniforms.uKeyDir.value.copy(rig.keyDir);
  }

  /**
   * Draw a visible flame at every practical light. Called each frame: the flicker
   * that drives the illumination has to drive the source you can see, or the two
   * come apart and the room reads as lit by nothing.
   */
  syncFlames(rig) {
    const pos = this._flPos.array, col = this._flCol.array,
      par = this._flParam.array, sd = this._flSeed.array;
    let k = 0;
    const ls = rig.lights;
    /* Only flag an attribute dirty when its contents actually moved. Of the four,
       only aParam.y (the flicker) changes on a normal frame — position, colour and
       seed are fixed per region and were being re-uploaded 60 times a second for
       nothing. Combined with DynamicDrawUsage above, this is what took syncFlames
       from 8.5 ms/frame to noise. */
    let dPos = false, dCol = false, dPar = false, dSeed = false;
    for (let i = 0; i < ls.length && k < MAX_FLAMES; i++) {
      const l = ls[i];
      if (!l.enabled || l.glow <= 0.001 || l.live <= 0.01) continue;
      const p3 = k * 3, p2 = k * 2;
      if (pos[p3] !== l.pos.x || pos[p3 + 1] !== l.pos.y || pos[p3 + 2] !== l.pos.z) {
        pos[p3] = l.pos.x; pos[p3 + 1] = l.pos.y; pos[p3 + 2] = l.pos.z; dPos = true;
      }
      if (col[p3] !== l.color.r || col[p3 + 1] !== l.color.g || col[p3 + 2] !== l.color.b) {
        col[p3] = l.color.r; col[p3 + 1] = l.color.g; col[p3 + 2] = l.color.b; dCol = true;
      }
      const size = (0.16 + 0.030 * l.radius) * l.glowSize;
      const inten = l.glow * (0.55 + 0.75 * Math.min(l.live / 2.2, 1.4));
      if (par[p2] !== size || par[p2 + 1] !== inten) {
        par[p2] = size; par[p2 + 1] = inten; dPar = true;
      }
      const seed = l.id * 0.37;
      if (sd[k] !== seed) { sd[k] = seed; dSeed = true; }
      k++;
    }
    if (dPos) this._flPos.needsUpdate = true;
    if (dCol) this._flCol.needsUpdate = true;
    if (dPar) this._flParam.needsUpdate = true;
    if (dSeed) this._flSeed.needsUpdate = true;
    this.flameGeo.instanceCount = k;
  }

  /** Every lit surface needs the eye position for its specular term. */
  syncCamera(pos) {
    this.wallMat.uniforms.uCamera.value.copy(pos);
    this.floorMat.uniforms.uCamera.value.copy(pos);
    this.ceilMat.uniforms.uCamera.value.copy(pos);
    this.propMat.uniforms.uCamera.value.copy(pos);
    for (const m of this.sides) m.material.uniforms.uCamera.value.copy(pos);
  }

  setDread(v) {
    for (const m of this.sides) m.material.uniforms.uDread.value = v;
    this.wallMat.uniforms.uDread.value = v;
    this.floorMat.uniforms.uDread.value = v;
    this.ceilMat.uniforms.uDread.value = v;
    this.propMat.uniforms.uDread.value = v;
    this.shaftMat.uniforms.uDread.value = v;
    this.flameMat.uniforms.uDread.value = v;
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
    this.flameMat.uniforms.uTime.value = t;
    for (const m of this.frames) m.material.uniforms.uTime.value = t;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.sides) { m.geometry.dispose(); m.material.dispose(); }
    this.wall.geometry.dispose(); this.wallMat.dispose();
    this.floor.geometry.dispose(); this.floorMat.dispose();
    this.ceiling.geometry.dispose(); this.ceilMat.dispose();
    this.propGeo.dispose(); this.propMat.dispose();
    this.shadowGeo.dispose(); this.shadowMat.dispose();
    this.shaftGeo.dispose(); this.shaftMat.dispose();
    this.flameGeo.dispose(); this.flameMat.dispose();
    for (const m of this.frames) { m.geometry.dispose(); m.material.dispose(); }
  }
}

export const BACKDROP_CONST = { MAX_PROPS, MAX_SHAFTS, MAX_POOLS, FLOOR_FRONT, NLIGHT };
