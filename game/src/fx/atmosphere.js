/**
 * Atmosphere — backdrop, candlelight, particles, mood and screen-space juice.
 * OWNER: atmosphere agent.
 *
 * Public API (other agents call these; documented in docs/NOTES.md):
 *   atmosphere.setMood(region, { instant, seed, variant })
 *                                                swap region look (17 regions + title).
 *                                                `seed` is WHICH ROOM this is — pass the
 *                                                room name or node id and two rooms that
 *                                                share a space stop being the same room.
 *   atmosphere.impact(pos, { strength, light, color, shake, burst })
 *                                                hit feedback at a world or screen point.
 *                                                `strength` is HOW BIG the hit is (sparks,
 *                                                ring, shake); `light` 0..1 is how much it
 *                                                may LIGHT THE ROOM (flare, screen flash,
 *                                                spark brightness) and is the only
 *                                                photosensitive channel. The accessibility
 *                                                gate lives here, not at the call site.
 *   atmosphere.dread(0..1, seconds)              scary-moment desaturate + edge crush
 *   atmosphere.pulse(color, amount)              soft coloured wash
 *   atmosphere.light(spec) / atmosphere.rig      add or reach your own lights
 *   atmosphere.setIntensity(0..1)                dim the whole backdrop under UI-heavy screens
 *   atmosphere.setActors([{x,z,r,strength}])     ground shadows for DOM/mesh actors
 *   atmosphere.keyLight()                        { dirX, dirY, color, fill, strength }
 *
 * Atmosphere also publishes the live key light onto `document.documentElement` as
 * CSS custom properties, so DOM actors (enemies, companions) can be shaded by the
 * same lamp that lights the room:
 *   --atmo-key-x  --atmo-key-y      unit vector from the actor TOWARD the key light
 *   --atmo-key            rgb()     key light colour
 *   --atmo-fill           rgb()     counter/ambient colour
 *   --atmo-key-strength   0..1      how hard the key is hitting right now
 *   --atmo-ground         0..1      how strong a contact shadow should be
 *
 * Colour rules: neutrals and light colours are read once from tokens.css; region
 * colours come from the REGIONS table below and nowhere else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUND 2 (2026-08-20) — what changed and why
 *
 * The round-1 build had a good authoring surface and nothing lit by it. Measured:
 * 0.0% of prop pixels above L192, props p95 luma 57.7, every light shaft fading
 * out in mid-air, 0.63 mean structural cross-correlation between regions, and
 * `foyer` — the first room any player sees — declaring no lights, no shafts and
 * no particles at all. Three things were added to the data model:
 *
 *   room:  { w, d, h, side, ceilPattern, wallPad }
 *          real proportions. A corridor is 7.5 m wide and 3.4 m high; the
 *          ballroom is 34 x 26 x 10.5. The shell geometry is rebuilt per region.
 *   cam:   { y, z, look, fov }
 *          eye height, distance and lens per region. StS2 is "epic rather than
 *          intimate", so combat rooms are framed close with a high horizon.
 *   props: { ..., layout }
 *          one of wings | colonnade | rows | aisle | clutter | nook | terrace |
 *          hang | perimeter. Every region also gets its own silhouette set.
 *
 * plus real material colours for props (propAlb/propHi), an ambient bounce colour
 * per region, and `shafts` authored for all seventeen (five had none).
 */
import * as THREE from 'three';
import { clock } from '../core/clock.js';
import { Save } from '../core/save.js';
import { Backdrop } from './backdrop.js';
import { LightRig } from './lights.js';
import { ParticleField, PTYPE } from './particles.js';

/* ------------------------------------------------------------------ palettes */

/**
 * PROP MATERIALS (round 3).
 *
 * Two reviewers called room quality bimodal and both named the same cause: the
 * props in several regions were "flat untextured cuboids" that read as debug
 * geometry. They were not a different shader from the good rooms — they were the
 * same shader with one low-amplitude fbm and a pale albedo, which is enough to
 * hide the noise entirely. Every region now names a material, and the prop
 * shader builds its surface from four weighted terms:
 *
 *   grain   directional fibre, along x — wood, cloth folds, brushed metal
 *   blotch  low-frequency patches — stone mottle, foliage mass, patina, damp
 *   joint   periodic lines at `freq` joints per METRE — planks, drawer fronts,
 *           stone courses, tile grout, cage staves
 *   speck   per-cell hash grit — sand, lichen, rust, dust in a weave
 *
 * `ao` scales the base-contact and inside-the-silhouette darkening; soft
 * materials occlude more than polished ones.
 */
const PROP_MATERIAL = {
  //          grain blotch joint speck        joints/m x, y      ao
  wood:    { mix: [0.34, 0.12, 0.26, 0.05], freq: [0.55, 1.35], ao: 1.00 },
  paint:   { mix: [0.16, 0.16, 0.30, 0.04], freq: [0.70, 1.10], ao: 1.00 },
  stone:   { mix: [0.09, 0.36, 0.22, 0.18], freq: [0.75, 0.55], ao: 0.92 },
  tile:    { mix: [0.07, 0.20, 0.42, 0.08], freq: [1.60, 1.60], ao: 0.86 },
  cloth:   { mix: [0.38, 0.15, 0.07, 0.03], freq: [2.10, 0.28], ao: 1.12 },
  metal:   { mix: [0.15, 0.11, 0.32, 0.05], freq: [0.32, 1.95], ao: 0.84 },
  foliage: { mix: [0.20, 0.44, 0.05, 0.16], freq: [2.60, 2.60], ao: 1.06 },
};

const D = {
  arch: 0, floorPattern: 0, ceil: 6.4,
  coolFill: 0.85, grime: 0.72, openGlow: 0.5, wallFog: 0.16, gloss: 0.5,
  rim: 1.0, frameAmount: 0.62, sides: true,
  deep: '#191425', mid: '#302636', hi: '#4e3b4b', accent: '#537b93', fog: '#0e0c1a',
  open: '#467b8b', floorDeep: '#120f1c', floorMid: '#2b1f28', ambient: '#161324',
  propAlb: '#31252b', propHi: '#574440',
  rimCol: '#cf9f59', shaft: '#d2b080', frame: '#0a0913',
  /* propGain went 1.42 -> 0.80 in round 3 and the shader dropped its `diff *
     1.45`, so the diffuse term a prop receives fell from 3.81x to 1.48x. That
     3.81 was a lift no MeshStandardMaterial in the scene ever got, and it is
     why the prop layer's peak luminance beat the actor's in 17 regions of 17.
     The BODY of a prop is then brought back up with propGain while the CEILING
     holds the peak down — brighter mid-tones, lower highlights, which is the
     shape the round-2 mid-tone target wanted anyway.
     `propCeil` is the post-exposure luminance a prop may asymptotically
     approach and never reach; backdrop.js divides it by the region exposure. */
  gain: 1.85, propGain: 1.55, propGloss: 0.62, propCeil: 0.469, propMat: 'wood',
  bloom: 0.72, bloomThreshold: 0.86, warmTone: 0.05, halation: 0.30, exposure: 1.55,
  vignette: 1.39, grain: 0.026, saturate: 0.89, contrast: 1.26,
  fogDensity: 0.014,
  room: { w: 24, d: 19, h: 6.6, side: 0.0, ceilPattern: 3, wallPad: 7.0 },
  cam: { y: 2.3, z: 9.6, look: 2.4, fov: 42 },
  shafts: { count: 3, spread: 16, y: 8.2, z: -12, angle: 0.26, width: 3.4, intensity: 0.34, pool: 1.5 },
  /* KEY and FILL sit in FRONT of the action plane (positive z), between the
     camera and the actors. Round 1 authored only lamps deep in the room, so the
     camera always saw the shadow side of everything: the showcase stand-in, the
     near props and the enemies all rendered as flat black cut-outs no matter how
     bright the room behind them got. These two are what actually light an actor. */
  key:  { kind: 'warm', x: -4.2, y: 3.4, z: 2.4, color: '#e2b271', intensity: 1.54, radius: 7.74, glow: 0 },
  fill: { kind: 'cold', x: 5.2, y: 2.8, z: 1.6, color: '#79afce', intensity: 1.64, radius: 9.5, flicker: false, glow: 0 },
  props: { shapes: [0, 1, 5, 6], count: 24, height: 2.2, layout: 'wings' },
  particles: { mix: [[PTYPE.DUST, 0.82], [PTYPE.WISP, 0.11], [PTYPE.EMBER, 0.07]],
               speed: 1, scale: 1, wind: 1, density: 0.45,
               tint: '#ffe6bc', wispTint: '#6fd9ec', emberTint: '#ffb64a' },
  lights: [
    { kind: 'warm', x: -4.6, y: 2.9, z: -12.6, color: '#dda758', intensity: 1.61, radius: 5.33 },
    { kind: 'warm', x: 4.8, y: 2.9, z: -12.6, color: '#db944d', intensity: 1.33, radius: 4.99 },
    { kind: 'warm', x: -2.4, y: 1.15, z: -5.0, color: '#e1b76e', intensity: 1.22, radius: 5.33 },
    { kind: 'cold', x: 5.0, y: 3.4, z: -9.0, color: '#79afce', intensity: 1.32, radius: 9.5, flicker: true },
  ],
};

/**
 * Per-region overrides. Everything not listed falls back to D above.
 * Each region owns a distinct ROOM SHAPE, CEILING, CAMERA and SILHOUETTE SET —
 * recolouring one box seventeen times is what round 1 got wrong.
 */
export const REGIONS = {
  /* ── 1. The Forgotten Foyer ────────────────────────────────────────────────
     Tall, formal, symmetrical. Everything is pushed to the walls so the grand
     staircase void in the middle reads. This is the FIRST room a player sees;
     round 1 shipped it with zero lights, zero shafts and zero particles. */
  foyer: {
    label: 'The Forgotten Foyer',
    propMat: 'wood', propCeil: 0.5,
    arch: 0, floorPattern: 0,
    room: { w: 26, d: 21, h: 8.6, side: 0.03, ceilPattern: 7, wallPad: 6.0 },
    cam: { y: 2.55, z: 9.4, look: 2.9, fov: 40 },
    deep: '#1c1424', mid: '#37252f', hi: '#5f3f31', accent: '#52768e',
    floorDeep: '#140f19', floorMid: '#322321', ambient: '#191424',
    propAlb: '#3c2b29', propHi: '#6f513c', rimCol: '#d5ab6d', shaft: '#d6b88a',
    gloss: 0.62, openGlow: 0.72, open: '#4a8090', grime: 0.60,
    props: { shapes: [14, 0, 6, 5, 1, 7], count: 26, height: 2.5, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.80], [PTYPE.WISP, 0.12], [PTYPE.EMBER, 0.08]],
                 tint: '#ffe6bc', wispTint: '#7fd9ec', emberTint: '#ffb64a',
                 speed: 0.85, scale: 1.05, wind: 0.7, density: 0.85 },
    exposure: 1.75, vignette: 1.43, contrast: 1.21,
    key:  { glow: 0, kind: 'warm', x: -4.6, y: 3.6, z: 2.6, color: '#e2b271', intensity: 1.68, radius: 8.17 },
    fill: { glow: 0, kind: 'cold', x: 5.6, y: 2.6, z: 1.2, color: '#79afce', intensity: 1.84, radius: 9.0, flicker: false },
    lights: [
      { kind: 'warm', x: -5.4, y: 3.4, z: -16.0, color: '#dda358', intensity: 1.82, radius: 6.88 },
      { kind: 'warm', x: 5.4, y: 3.4, z: -16.0, color: '#db994d', intensity: 1.54, radius: 6.54 },
      { kind: 'warm', x: -3.2, y: 1.30, z: -5.4, color: '#e5bf7e', intensity: 1.47, radius: 5.68 },
      { kind: 'cold', x: 4.6, y: 4.2, z: -10.5, color: '#79afce', intensity: 1.63, radius: 10.0 },
    ],
    shafts: { count: 3, spread: 15, y: 9.6, z: -13.5, angle: 0.28, width: 3.2, intensity: 0.38, pool: 1.7 },
    bloom: 0.80, warmTone: 0.05, halation: 0.55,
  },

  /* ── 2. The Forgotten Nursery ──────────────────────────────────────────────
     Small, low, cluttered with toys at knee height. Wide lens, low eye. */
  nursery: {
    label: 'The Forgotten Nursery',
    propMat: 'paint', propCeil: 0.239,
    arch: 0, floorPattern: 0,
    room: { w: 15, d: 12.5, h: 4.8, side: 0.0, ceilPattern: 3, wallPad: 4.0 },
    cam: { y: 1.62, z: 5.6, look: 1.76, fov: 44 },
    deep: '#21182b', mid: '#422d41', hi: '#744e5d', accent: '#6b8eab',
    rimCol: '#e2bc9c', shaft: '#d3bbcc', floorDeep: '#171221', floorMid: '#322731',
    ambient: '#1d182b', propAlb: '#4a3441', propHi: '#8d616a',
    gloss: 0.42, open: '#7ca3b2', openGlow: 0.55, grime: 0.48,
    props: { shapes: [10, 11, 5, 2, 7], count: 24, height: 1.55, layout: 'clutter' },
    particles: { mix: [[PTYPE.DUST, 0.68], [PTYPE.ASH, 0.20], [PTYPE.WISP, 0.12]],
                 tint: '#ffdfe4', wispTint: '#a8ecf7', emberTint: '#ffc7a0',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.9 },
    exposure: 1.43, vignette: 1.19, contrast: 1.62,
    key:  { glow: 0, kind: 'warm', x: -3.4, y: 2.9, z: 2.2, color: '#eabc97', intensity: 2.52, radius: 6.45 },
    fill: { glow: 0, kind: 'cold', x: 4.4, y: 2.4, z: 1.4, color: '#9ec0d7', intensity: 3.15, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.6, y: 1.10, z: -4.2, color: '#e6b184', intensity: 1.43, radius: 4.3 },
      { kind: 'cold', x: 3.2, y: 3.40, z: -10.4, color: '#a4c7dd', intensity: 2.63, radius: 8.0 },
      { kind: 'cold', x: -4.4, y: 3.60, z: -10.8, color: '#91b6d0', intensity: 1.71, radius: 7.0 },
      { kind: 'warm', x: 4.6, y: 1.90, z: -6.6, color: '#e7c18c', intensity: 0.66, radius: 3.96 },
    ],
    shafts: { count: 2, spread: 9, y: 5.6, z: -9.0, angle: 0.34, width: 2.6, intensity: 0.38, pool: 1.8 },
  },

  /* ── 3. The Sleeping Quarters ──────────────────────────────────────────────
     Asymmetric: the whole mass of the room is on one side, the other is bare
     moonlit floor. Cold, blue, still. */
  sleeping: {
    label: 'The Sleeping Quarters',
    propMat: 'cloth', propCeil: 0.278,
    arch: 0, floorPattern: 0,
    room: { w: 18, d: 16, h: 5.6, side: 0.06, ceilPattern: 3, wallPad: 4.6 },
    cam: { y: 2.30, z: 9.0, look: 2.05, fov: 39 },
    nookSide: -1,
    deep: '#18162c', mid: '#2c2a4b', hi: '#46446e', accent: '#5e76aa',
    shaft: '#a7b8e0', floorDeep: '#100f1e', floorMid: '#232339', ambient: '#19172e',
    propAlb: '#33304f', propHi: '#5c5b86', rimCol: '#c1cbed',
    gloss: 0.38, open: '#5873a1', openGlow: 0.42, coolFill: 1.15, wallFog: 0.22,
    props: { shapes: [12, 5, 7, 0, 2], count: 20, height: 2.1, layout: 'nook' },
    particles: { mix: [[PTYPE.DUST, 0.60], [PTYPE.WISP, 0.28], [PTYPE.ASH, 0.12]],
                 tint: '#cfd8f2', wispTint: '#8fb7ff', emberTint: '#ffb64a',
                 speed: 0.7, scale: 1.0, wind: 0.5, density: 0.8 },
    exposure: 1.46, contrast: 1.63,
    key:  { glow: 0, kind: 'warm', x: -4.0, y: 3.2, z: 2.4, color: '#e4ad7b', intensity: 2.99, radius: 7.31 },
    fill: { glow: 0, kind: 'cold', x: 5.4, y: 2.6, z: 1.0, color: '#92aae4', intensity: 1.78, radius: 8.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.4, y: 1.05, z: -4.6, color: '#dda558', intensity: 3.15, radius: 4.13 },
      { kind: 'cold', x: 5.2, y: 4.20, z: -12.6, color: '#92aae4', intensity: 2.54, radius: 11.0 },
      { kind: 'cold', x: -6.2, y: 2.80, z: -9.6, color: '#7897ca', intensity: 1.12, radius: 7.5 },
    ],
    shafts: { count: 2, spread: 11, y: 6.4, z: -11.5, angle: 0.40, width: 3.0, intensity: 0.43, pool: 2.0 },
    bloom: 0.78, vignette: 1.23,
  },

  /* ── 4. The Kitchens and Cellars ───────────────────────────────────────────
     Long, low, hot. A working aisle with ranges and crates crowding the frame. */
  kitchens: {
    label: 'The Kitchens and Cellars',
    propMat: 'metal', propCeil: 0.423,
    arch: 4, floorPattern: 2,
    room: { w: 22, d: 11, h: 4.4, side: 0.0, ceilPattern: 6, wallPad: 3.6 },
    cam: { y: 1.92, z: 7.0, look: 2.25, fov: 47 },
    deep: '#201419', mid: '#462c24', hi: '#70492c', accent: '#7d8d58',
    rimCol: '#cd8852', shaft: '#c6915e', floorDeep: '#140e13', floorMid: '#33231d',
    ambient: '#1c1216', propAlb: '#3c2a23', propHi: '#715133',
    gloss: 0.70, grime: 0.88, open: '#9d6941', openGlow: 0.7,
    props: { shapes: [13, 8, 5, 1, 8], count: 22, height: 2.0, layout: 'aisle' },
    particles: { mix: [[PTYPE.EMBER, 0.46], [PTYPE.DUST, 0.40], [PTYPE.PLASTER, 0.14]],
                 tint: '#ffcf9a', wispTint: '#8fd9a8', emberTint: '#ff7a28',
                 speed: 1.2, scale: 1.05, wind: 1.3, density: 0.95 },
    exposure: 1.98, vignette: 1.56, contrast: 1.55,
    key:  { glow: 0, kind: 'warm', x: -3.6, y: 2.8, z: 2.0, color: '#db8f51', intensity: 1.39, radius: 6.88 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 2.2, z: 1.2, color: '#8fb2bb', intensity: 9.76, radius: 7.0, flicker: false },
    lights: [
      { kind: 'warm', x: -4.0, y: 1.40, z: -5.6, color: '#d98044', intensity: 1.07, radius: 5.5 },
      { kind: 'warm', x: 4.6, y: 2.20, z: -9.2, color: '#dc9d54', intensity: 0.7, radius: 5.85 },
      { kind: 'warm', x: 0.4, y: 0.80, z: -2.6, color: '#e1b46e', intensity: 0.52, radius: 3.78 },
      { kind: 'cold', x: -6.6, y: 3.20, z: -8.8, color: '#8fb2bb', intensity: 5.24, radius: 7.0 },
    ],
    shafts: { count: 2, spread: 11, y: 5.0, z: -8.0, angle: 0.18, width: 2.4, intensity: 0.31, pool: 1.6 },
    bloom: 1.0, warmTone: 0.06, halation: 0.75, saturate: 0.94,
  },

  /* ── 5. The Impossible Greenhouse ──────────────────────────────────────────
     Enormous, glazed, stepped planting terraces climbing away from the camera. */
  greenhouse: {
    label: 'The Impossible Greenhouse',
    propMat: 'foliage', propCeil: 0.569,
    arch: 1, floorPattern: 2,
    room: { w: 30, d: 26, h: 10.5, side: 0.10, ceilPattern: 5, wallPad: 5.0 },
    cam: { y: 2.75, z: 11.2, look: 3.4, fov: 39 },
    deep: '#131d1f', mid: '#233f31', hi: '#3c694d', accent: '#62ba91',
    rimCol: '#a8e29b', shaft: '#9ecfb8', floorDeep: '#101619', floorMid: '#203529',
    ambient: '#152222', propAlb: '#2a4233', propHi: '#57825e',
    gloss: 0.55, grime: 0.50, open: '#64bd9b', openGlow: 0.78, coolFill: 1.2,
    props: { shapes: [2, 9, 2, 19, 6], count: 30, height: 2.6, layout: 'terrace' },
    particles: { mix: [[PTYPE.SPORE, 0.52], [PTYPE.DUST, 0.30], [PTYPE.WISP, 0.18]],
                 tint: '#d9ffcf', wispTint: '#7fffc9', emberTint: '#cfff6a',
                 speed: 0.85, scale: 1.35, wind: 0.7, density: 0.95 },
    exposure: 1.67, vignette: 0.97, contrast: 1.62,
    key:  { glow: 0, kind: 'warm', x: -4.4, y: 3.8, z: 2.8, color: '#e7bc8a', intensity: 7.46, radius: 8.17 },
    fill: { glow: 0, kind: 'cold', x: 6.0, y: 3.0, z: 1.6, color: '#79b2d3', intensity: 2.33, radius: 9.5, flicker: false },
    lights: [
      { kind: 'cold', x: -6.0, y: 6.40, z: -14.0, color: '#91c5d7', intensity: 2.48, radius: 11.0 },
      { kind: 'cold', x: 7.4, y: 5.60, z: -13.0, color: '#79b2d3', intensity: 1.86, radius: 9.5 },
      { kind: 'warm', x: -2.8, y: 1.20, z: -4.8, color: '#e0b266', intensity: 9.83, radius: 5.68 },
      { kind: 'cold', x: 3.2, y: 1.50, z: -8.0, color: '#8edde3', intensity: 1.24, radius: 6.0 },
    ],
    shafts: { count: 4, spread: 22, y: 11.4, z: -13, angle: 0.30, width: 3.4, intensity: 0.45, pool: 1.7 },
    bloom: 0.92,
  },

  /* ── 6. The Mansion Graveyard ──────────────────────────────────────────────
     Open air. No ceiling, no side walls; a night sky with a moon and a distant
     roofline, and five staggered ranks of headstones marching to the horizon. */
  graveyard: {
    label: 'The Mansion Graveyard',
    propMat: 'stone', propCeil: 0.392,
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 52, d: 32, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 3.10, z: 12.0, look: 3.1, fov: 41 },
    deep: '#141725', mid: '#272f3c', hi: '#424e5b', accent: '#789dba',
    shaft: '#b4c8d9', floorDeep: '#0f1119', floorMid: '#202528', ambient: '#151826',
    propAlb: '#3d4245', propHi: '#757b78', rimCol: '#c1d8ed',
    gloss: 0.28, grime: 0.85, coolFill: 1.15, wallFog: 0.20, open: '#86afcb', openGlow: 0.30,
    props: { shapes: [3, 3, 9, 15, 3], count: 34, height: 1.5, layout: 'rows' },
    particles: { mix: [[PTYPE.ASH, 0.40], [PTYPE.DUST, 0.34], [PTYPE.WISP, 0.26]],
                 tint: '#cfd9e0', wispTint: '#8fe8d0', emberTint: '#ffb64a',
                 speed: 0.65, scale: 1.2, wind: 0.9, density: 0.9 },
    exposure: 1.33, contrast: 1.65,
    key:  { glow: 0, kind: 'cold', x: -4.6, y: 6.0, z: 3.0, color: '#c2d3f0', intensity: 2.09, radius: 17.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.4, y: 1.6, z: 1.6, color: '#dda358', intensity: 3.86, radius: 5.59 },
    lights: [
      { kind: 'cold', x: -3.0, y: 8.00, z: -12.0, color: '#b1c7dd', intensity: 1.98, radius: 16.0, flicker: false },
      { kind: 'warm', x: 2.8, y: 0.90, z: -5.0, color: '#dda558', intensity: 5.7, radius: 4.47 },
      { kind: 'cold', x: 7.0, y: 1.20, z: -9.5, color: '#91c4d7', intensity: 0.94, radius: 6.8 },
    ],
    shafts: { count: 3, spread: 22, y: 12.0, z: -12, angle: 0.16, width: 3.4, intensity: 0.29, pool: 1.5 },
    vignette: 1.19,
  },

  /* ── 7. The Grand Study and Library ────────────────────────────────────────
     Tall walls of shelving lining every edge, a clear reading floor. */
  study: {
    label: 'The Grand Study and Library',
    propMat: 'wood', propCeil: 0.424,
    arch: 0, floorPattern: 0,
    room: { w: 19, d: 17, h: 8.2, side: 0.04, ceilPattern: 3, wallPad: 5.0 },
    cam: { y: 2.20, z: 8.4, look: 2.7, fov: 43 },
    deep: '#1c1319', mid: '#3a2824', hi: '#614534', accent: '#5d849d',
    shaft: '#d9bd92', floorDeep: '#151014', floorMid: '#31211c', ambient: '#1a1217',
    propAlb: '#3f2b23', propHi: '#735336', rimCol: '#d8b279',
    gloss: 0.58, grime: 0.55, open: '#527f8f', openGlow: 0.45,
    props: { shapes: [5, 5, 14, 0, 6, 1], count: 26, height: 2.7, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.86], [PTYPE.EMBER, 0.08], [PTYPE.WISP, 0.06]],
                 tint: '#ffe6bc', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.7, scale: 0.95, wind: 0.5, density: 1.0 },
    exposure: 2.6, vignette: 1.47, contrast: 1.67,
    key:  { glow: 0, kind: 'warm', x: -3.8, y: 3.2, z: 2.2, color: '#e2b271', intensity: 1.63, radius: 7.31 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 3.4, z: 1.2, color: '#769fba', intensity: 4.05, radius: 8.0, flicker: false },
    lights: [
      { kind: 'warm', x: -3.2, y: 1.30, z: -4.6, color: '#e0b266', intensity: 1.32, radius: 5.33 },
      { kind: 'warm', x: 5.0, y: 2.60, z: -11.5, color: '#dca254', intensity: 0.83, radius: 6.19 },
      { kind: 'warm', x: -6.4, y: 3.40, z: -12.4, color: '#ce9953', intensity: 0.57, radius: 5.85 },
      { kind: 'cold', x: 3.6, y: 5.00, z: -9.6, color: '#769fba', intensity: 1.89, radius: 8.0 },
    ],
    shafts: { count: 2, spread: 10, y: 9.0, z: -11.0, angle: 0.22, width: 2.8, intensity: 0.35, pool: 1.7 },
    warmTone: 0.06, halation: 0.68,
  },

  /* ── 8. The Moonlit Attic and Observatory ──────────────────────────────────
     Steeply raked walls (big side toe-in), the mass of the room hanging overhead. */
  attic: {
    label: 'The Moonlit Attic and Observatory',
    propMat: 'wood', propCeil: 0.264,
    arch: 4, floorPattern: 0,
    room: { w: 24, d: 19, h: 7.2, side: 0.20, ceilPattern: 6, wallPad: 4.4 },
    cam: { y: 1.95, z: 8.6, look: 2.6, fov: 45 },
    deep: '#17152c', mid: '#2a2746', hi: '#433e69', accent: '#8592cd',
    shaft: '#b1bce4', rimCol: '#dfc191', floorDeep: '#100e1e', floorMid: '#232135',
    ambient: '#19172e', propAlb: '#342e4b', propHi: '#605b7e',
    gloss: 0.36, grime: 0.78, coolFill: 1.20, wallFog: 0.18,
    props: { shapes: [8, 7, 5, 10, 14], count: 26, height: 2.2, layout: 'hang' },
    particles: { mix: [[PTYPE.DUST, 0.62], [PTYPE.WISP, 0.26], [PTYPE.ASH, 0.12]],
                 tint: '#d8dcf5', wispTint: '#b0b8ff', emberTint: '#ffcf7a',
                 speed: 0.6, scale: 1.0, wind: 0.4, density: 0.95 },
    exposure: 1.54, vignette: 1.32, contrast: 1.65,
    key:  { glow: 0, kind: 'warm', x: -4.0, y: 3.2, z: 2.4, color: '#e8bc8f', intensity: 6.78, radius: 7.31 },
    fill: { glow: 0, kind: 'cold', x: 5.4, y: 2.8, z: 1.4, color: '#9eabe7', intensity: 1.78, radius: 8.5, flicker: false },
    lights: [
      { kind: 'cold', x: 5.0, y: 5.60, z: -12.0, color: '#b1bbeb', intensity: 2.73, radius: 13.0, flicker: false },
      { kind: 'warm', x: -3.8, y: 1.10, z: -5.0, color: '#dda558', intensity: 7.11, radius: 4.64 },
      { kind: 'cold', x: -6.4, y: 3.40, z: -10.0, color: '#91a3d7', intensity: 1.06, radius: 8.0 },
    ],
    shafts: { count: 3, spread: 16, y: 8.0, z: -11.0, angle: 0.40, width: 2.8, intensity: 0.45, pool: 1.9 },
  },

  /* ── 9. The Lampworks ──────────────────────────────────────────────────────
     A cold industrial hall: two files of lamp standards marching to the back. */
  lampworks: {
    label: 'The Lampworks',
    propMat: 'metal', propCeil: 0.239,
    arch: 4, floorPattern: 2,
    room: { w: 27, d: 23, h: 7.4, side: 0.0, ceilPattern: 8, wallPad: 4.8 },
    cam: { y: 2.40, z: 10.0, look: 2.6, fov: 42 },
    deep: '#151725', mid: '#273241', hi: '#3e505f', accent: '#60a9cf',
    rimCol: '#9bcce2', shaft: '#8dbcd7', floorDeep: '#0f111b', floorMid: '#1d2530',
    ambient: '#151826', propAlb: '#2e3944', propHi: '#5d717c',
    gloss: 0.66, grime: 0.80, open: '#59a5c4', openGlow: 0.7, coolFill: 1.1,
    props: { shapes: [18, 8, 6, 1, 5], count: 28, height: 2.6, layout: 'colonnade' },
    particles: { mix: [[PTYPE.EMBER, 0.42], [PTYPE.WISP, 0.30], [PTYPE.DUST, 0.28]],
                 tint: '#cfe8ff', wispTint: '#6fd9ec', emberTint: '#ff9e3c',
                 speed: 1.1, scale: 1.1, wind: 1.0, density: 1.0 },
    exposure: 1.42, vignette: 1.06, contrast: 1.41,
    key:  { glow: 0, kind: 'warm', x: -4.2, y: 3.2, z: 2.2, color: '#df9f63', intensity: 4.51, radius: 7.74 },
    fill: { glow: 0, kind: 'cold', x: 6.2, y: 3.2, z: 1.4, color: '#86bad8', intensity: 2.1, radius: 9.5, flicker: false },
    lights: [
      { kind: 'cold', x: -6.0, y: 4.20, z: -12.0, color: '#6eb0db', intensity: 2.73, radius: 9.5 },
      { kind: 'warm', x: 4.2, y: 1.50, z: -6.0, color: '#d98947', intensity: 4.51, radius: 5.33 },
      { kind: 'cold', x: 7.4, y: 4.40, z: -13.0, color: '#86bad8', intensity: 1.8, radius: 9.0 },
      { kind: 'warm', x: -2.0, y: 3.60, z: -9.5, color: '#e1b56e', intensity: 2.05, radius: 4.99 },
    ],
    shafts: { count: 3, spread: 18, y: 8.2, z: -14.0, angle: 0.12, width: 2.4, intensity: 0.34, pool: 1.6 },
    bloom: 1.05, halation: 0.85,
  },

  /* ── 10. The Ballroom and Velvet Suites ────────────────────────────────────
     The biggest room in the house: 34 m wide, 10.5 m to a plastered rose, a
     colonnade of statuary and a mirror-polished checker floor. */
  ballroom: {
    label: 'The Ballroom and Velvet Suites',
    propMat: 'cloth', propCeil: 0.474,
    arch: 0, floorPattern: 1,
    room: { w: 34, d: 26, h: 10.5, side: 0.05, ceilPattern: 7, wallPad: 5.4 },
    cam: { y: 3.15, z: 9.2, look: 3.5, fov: 47 },
    deep: '#201322', mid: '#472231', hi: '#763e48', accent: '#9c71ac',
    rimCol: '#d9be7b', shaft: '#dcc89a', floorDeep: '#140d1a', floorMid: '#382633',
    ambient: '#1e1220', propAlb: '#4c2c3b', propHi: '#8c5a6a',
    gloss: 0.86, grime: 0.38, open: '#ae5f7a', openGlow: 0.6,
    props: { shapes: [15, 4, 7, 6, 0], count: 30, height: 2.9, layout: 'colonnade' },
    particles: { mix: [[PTYPE.DUST, 0.58], [PTYPE.EMBER, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#ffe8c0', wispTint: '#d8a8ff', emberTint: '#ffc95a',
                 speed: 0.9, scale: 1.1, wind: 0.8, density: 1.0 },
    exposure: 3.55, contrast: 1.61,
    key:  { glow: 0, kind: 'warm', x: -5.2, y: 4.0, z: 2.8, color: '#e5c07e', intensity: 1.98, radius: 9.46 },
    fill: { glow: 0, kind: 'cold', x: 7.2, y: 3.0, z: 1.6, color: '#a984cd', intensity: 3.2, radius: 10.0, flicker: false },
    lights: [
      { kind: 'warm', x: -6.5, y: 5.40, z: -11.0, color: '#e1bd6e', intensity: 1.35, radius: 8.6 },
      { kind: 'warm', x: 6.5, y: 5.40, z: -11.5, color: '#deae5f', intensity: 1.19, radius: 8.6 },
      { kind: 'warm', x: 0.0, y: 6.20, z: -15.0, color: '#e9cd92', intensity: 0.88, radius: 9.46 },
      { kind: 'cold', x: -10.0, y: 2.00, z: -7.5, color: '#a984cd', intensity: 1.32, radius: 8.0 },
    ],
    shafts: { count: 4, spread: 26, y: 11.4, z: -14.0, angle: 0.22, width: 3.6, intensity: 0.37, pool: 1.7 },
    bloom: 1.10, warmTone: 0.06, halation: 0.85, vignette: 1.01, saturate: 0.92,
  },

  /* ── 11. The Crypt and Ossuary ─────────────────────────────────────────────
     Narrow and DEEP — 14 m across, 25 m back, a 4.9 m barrel vault. Sarcophagi
     line the two long walls and the eye is pulled straight down the axis. */
  crypt: {
    label: 'The Crypt and Ossuary',
    propMat: 'stone', propCeil: 0.441,
    arch: 2, floorPattern: 2,
    room: { w: 14, d: 25, h: 4.9, side: 0.0, ceilPattern: 4, wallPad: 3.4 },
    cam: { y: 1.90, z: 8.0, look: 2.0, fov: 46 },
    deep: '#141720', mid: '#262f33', hi: '#414c49', accent: '#5eb3b1',
    rimCol: '#d1e6d8', shaft: '#9fd2c5', floorDeep: '#0e1018', floorMid: '#1c2226',
    ambient: '#141720', propAlb: '#363e3e', propHi: '#6a756f',
    gloss: 0.42, grime: 0.88, coolFill: 1.25, wallFog: 0.26,
    props: { shapes: [16, 3, 6, 16, 15], count: 26, height: 1.8, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.48], [PTYPE.WISP, 0.36], [PTYPE.ASH, 0.16]],
                 tint: '#cfe0dc', wispTint: '#5fe8d8', emberTint: '#ffb64a',
                 speed: 0.6, scale: 1.15, wind: 0.4, density: 0.85 },
    exposure: 2.46, contrast: 1.69,
    key:  { glow: 0, kind: 'warm', x: -3.0, y: 2.8, z: 2.0, color: '#e0a866', intensity: 1.61, radius: 6.88 },
    fill: { glow: 0, kind: 'cold', x: 3.6, y: 2.4, z: 1.2, color: '#6cacc8', intensity: 1.94, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -2.4, y: 1.10, z: -4.4, color: '#dda358', intensity: 2.1, radius: 5.5 },
      { kind: 'cold', x: 4.2, y: 2.20, z: -12.0, color: '#6cacc8', intensity: 2.63, radius: 9.5 },
      { kind: 'cold', x: -4.6, y: 1.80, z: -18.0, color: '#5d97b4', intensity: 1.94, radius: 9.0 },
    ],
    shafts: { count: 2, spread: 6, y: 5.6, z: -13.0, angle: 0.10, width: 2.0, intensity: 0.32, pool: 1.9 },
    vignette: 1.28, bloom: 0.90,
  },

  /* ── 12. The Withered Hedge Maze ───────────────────────────────────────────
     Open air, no ceiling, foliage walls. Dense low scrub across the whole floor. */
  hedge: {
    label: 'The Withered Hedge Maze',
    propMat: 'foliage', propCeil: 0.391,
    sides: false, arch: 3, floorPattern: 2,
    room: { w: 38, d: 28, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.35, z: 9.2, look: 2.5, fov: 47 },
    deep: '#191618', mid: '#353020', hi: '#575030', accent: '#90905e',
    rimCol: '#c4b479', shaft: '#b8ae8b', floorDeep: '#100e12', floorMid: '#27221b',
    ambient: '#171519', propAlb: '#323021', propHi: '#615d45',
    gloss: 0.28, grime: 0.95, coolFill: 0.95, wallFog: 0.22, open: '#a39e6d', openGlow: 0.25,
    props: { shapes: [9, 9, 2, 3, 9], count: 32, height: 2.4, layout: 'clutter' },
    particles: { mix: [[PTYPE.SPORE, 0.44], [PTYPE.ASH, 0.30], [PTYPE.DUST, 0.26]],
                 tint: '#e0d8a8', wispTint: '#b08fd8', emberTint: '#d8a04a',
                 speed: 0.75, scale: 1.3, wind: 1.4, density: 0.95 },
    exposure: 1.72, vignette: 1.52, contrast: 1.21,
    key:  { glow: 0, kind: 'cold', x: -4.2, y: 5.6, z: 3.0, color: '#c4cce1', intensity: 3.02, radius: 15.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.0, y: 1.6, z: 1.6, color: '#dda358', intensity: 1.01, radius: 5.59 },
    lights: [
      { kind: 'cold', x: -3.0, y: 7.60, z: -12.0, color: '#a4b5cc', intensity: 2.63, radius: 14.0, flicker: false },
      { kind: 'warm', x: 3.0, y: 1.00, z: -5.0, color: '#dda358', intensity: 1.47, radius: 4.64 },
      { kind: 'cold', x: -6.4, y: 1.20, z: -8.5, color: '#a891d0', intensity: 1.32, radius: 6.4 },
    ],
    shafts: { count: 4, spread: 24, y: 9.0, z: -11.0, angle: 0.34, width: 2.6, intensity: 0.35, pool: 1.6 },
  },

  /* ── 13. The Secret Passages ───────────────────────────────────────────────
     A 7.5 m corridor with a 3.4 m ceiling. Everything crowds the two walls and
     the frame is almost filled by them. Round 1 rendered this at mean luma 1.8. */
  passages: {
    label: 'The Secret Passages',
    propMat: 'wood', propCeil: 0.165,
    arch: 2, floorPattern: 0,
    room: { w: 7.5, d: 20, h: 3.4, side: 0.0, ceilPattern: 3, wallPad: 2.4 },
    cam: { y: 1.70, z: 6.8, look: 1.75, fov: 52 },
    deep: '#191525', mid: '#2e2437', hi: '#47394e', accent: '#836faf',
    rimCol: '#d2a763', shaft: '#d6b88a', floorDeep: '#110e19', floorMid: '#201a26',
    ambient: '#181424', propAlb: '#332a3a', propHi: '#5b4e61',
    gloss: 0.45, grime: 0.92, coolFill: 0.75, wallFog: 0.12,
    props: { shapes: [8, 5, 7, 6], count: 18, height: 1.9, layout: 'aisle' },
    particles: { mix: [[PTYPE.DUST, 0.78], [PTYPE.PLASTER, 0.16], [PTYPE.WISP, 0.06]],
                 tint: '#ffe0b8', wispTint: '#a87fd8', emberTint: '#ffb64a',
                 speed: 0.8, scale: 0.9, wind: 0.5, density: 1.0 },
    exposure: 1.72, contrast: 1.28,
    key:  { glow: 0, kind: 'warm', x: -1.9, y: 2.4, z: 1.8, color: '#e2b171', intensity: 3.1, radius: 5.59 },
    fill: { glow: 0, kind: 'cold', x: 1.9, y: 1.8, z: 0.8, color: '#8e78ca', intensity: 2.75, radius: 5.5, flicker: false },
    lights: [
      { kind: 'warm', x: -1.2, y: 1.90, z: -4.2, color: '#dfaa63', intensity: 1.89, radius: 4.13 },
      { kind: 'warm', x: 1.4, y: 1.60, z: -10.0, color: '#db944d', intensity: 1.08, radius: 4.3 },
      { kind: 'cold', x: 1.8, y: 1.60, z: -16.5, color: '#8e78ca', intensity: 1.63, radius: 7.0 },
    ],
    shafts: { count: 2, spread: 4, y: 4.0, z: -11.0, angle: 0.08, width: 1.5, intensity: 0.32, pool: 2.1 },
    vignette: 1.36, bloom: 0.80,
  },

  /* ── 14. The Bathhouse and Rain Wing ───────────────────────────────────────
     Glazed, wet, checker-tiled; the mass sits to one side under falling water. */
  bathhouse: {
    label: 'The Bathhouse and Rain Wing',
    propMat: 'tile', propCeil: 0.249,
    arch: 1, floorPattern: 1,
    room: { w: 21, d: 17, h: 7.0, side: 0.08, ceilPattern: 5, wallPad: 4.4 },
    cam: { y: 2.62, z: 7.4, look: 2.45, fov: 52 },
    nookSide: 1,
    deep: '#121b26', mid: '#1e3642', hi: '#345d68', accent: '#60bbce',
    rimCol: '#bcdeec', shaft: '#9dccdd', floorDeep: '#0e141e', floorMid: '#1a2c34',
    ambient: '#131e2a', propAlb: '#29404a', propHi: '#587f8b',
    gloss: 1.05, grime: 0.48, open: '#64b5c7', openGlow: 0.7, coolFill: 1.25, wallFog: 0.26,
    props: { shapes: [17, 6, 7, 17, 2], count: 22, height: 2.3, layout: 'nook' },
    particles: { mix: [[PTYPE.RAIN, 0.58], [PTYPE.DUST, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#bfe8f5', wispTint: '#6fd9ec', emberTint: '#ffb64a',
                 speed: 1.0, scale: 1.0, wind: 1.2, density: 1.0 },
    exposure: 1.34, vignette: 1.12, contrast: 1.69,
    key:  { glow: 0, kind: 'warm', x: -3.8, y: 3.2, z: 2.2, color: '#e7bc8c', intensity: 5.33, radius: 7.31 },
    fill: { glow: 0, kind: 'cold', x: 5.8, y: 3.0, z: 1.4, color: '#92c5e4', intensity: 2.12, radius: 9.0, flicker: false },
    lights: [
      { kind: 'cold', x: -5.0, y: 4.40, z: -12.0, color: '#79b2d3', intensity: 2.73, radius: 11.0 },
      { kind: 'warm', x: 3.6, y: 1.20, z: -5.4, color: '#e2b271', intensity: 4.91, radius: 4.47 },
      { kind: 'cold', x: 6.6, y: 3.20, z: -9.6, color: '#92c5e4', intensity: 1.55, radius: 8.0 },
    ],
    shafts: { count: 4, spread: 16, y: 7.8, z: -11.0, angle: 0.24, width: 2.6, intensity: 0.43, pool: 1.8 },
    bloom: 0.95,
  },

  /* ── 15. The Kennels and Animal Ward ───────────────────────────────────────
     Wide, very low, ranks of cages across the floor. Lowest eye in the game. */
  kennels: {
    label: 'The Kennels and Animal Ward',
    propMat: 'wood', propCeil: 0.19,
    arch: 0, floorPattern: 2,
    room: { w: 20, d: 11, h: 4.0, side: 0.0, ceilPattern: 8, wallPad: 3.2 },
    cam: { y: 2.55, z: 5.4, look: 1.05, fov: 52 },
    deep: '#1c141a', mid: '#3a2b23', hi: '#614a32', accent: '#768e9b',
    rimCol: '#dbb882', shaft: '#d9bd92', floorDeep: '#120e13', floorMid: '#2f241c',
    ambient: '#191315', propAlb: '#3d2d24', propHi: '#6e5339',
    gloss: 0.38, grime: 0.62, open: '#649aa6', openGlow: 0.5,
    props: { shapes: [19, 8, 0, 5, 9], count: 28, height: 1.6, layout: 'rows' },
    particles: { mix: [[PTYPE.DUST, 0.70], [PTYPE.ASH, 0.20], [PTYPE.EMBER, 0.10]],
                 tint: '#ffdfae', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.95 },
    exposure: 2.4, vignette: 1.61, contrast: 1.54,
    key:  { glow: 0, kind: 'warm', x: -3.4, y: 2.6, z: 2.0, color: '#e5b57e', intensity: 1.67, radius: 6.45 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 2.2, z: 1.2, color: '#83a6bc', intensity: 7.45, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.6, y: 2.80, z: -8.0, color: '#dfaa63', intensity: 0.78, radius: 6.45 },
      { kind: 'warm', x: 3.2, y: 1.10, z: -4.6, color: '#e6c086', intensity: 0.75, radius: 4.64 },
      { kind: 'cold', x: 6.6, y: 2.40, z: -8.6, color: '#83a6bc', intensity: 3.23, radius: 7.0 },
    ],
    shafts: { count: 3, spread: 13, y: 4.6, z: -7.5, angle: 0.14, width: 2.0, intensity: 0.31, pool: 1.7 },
    warmTone: 0.05,
  },

  /* ── 16. The Moon Courtyard and Pumpkin Grounds ────────────────────────────
     Open air under the moon, a wide field of pumpkins and lamp posts. */
  pumpkin: {
    label: 'The Moon Courtyard and Pumpkin Grounds',
    propMat: 'foliage', propCeil: 0.29,
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 48, d: 30, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.05, z: 8.2, look: 2.2, fov: 51 },
    deep: '#131723', mid: '#243335', hi: '#3c534a', accent: '#78a7be',
    rimCol: '#cf9459', shaft: '#b4c8d9', floorDeep: '#0f1219', floorMid: '#202827',
    ambient: '#151924', propAlb: '#3c3123', propHi: '#75583b',
    gloss: 0.44, grime: 0.66, coolFill: 1.15, wallFog: 0.18, open: '#86afcb', openGlow: 0.34,
    props: { shapes: [9, 2, 3, 18, 9], count: 32, height: 2.0, layout: 'clutter' },
    particles: { mix: [[PTYPE.DUST, 0.40], [PTYPE.SPORE, 0.30], [PTYPE.EMBER, 0.30]],
                 tint: '#cfe0e8', wispTint: '#8fe8c0', emberTint: '#ff8a28',
                 speed: 0.9, scale: 1.25, wind: 1.1, density: 1.0 },
    exposure: 0.9, vignette: 0.99, contrast: 1.52,
    key:  { glow: 0, kind: 'cold', x: -5.0, y: 6.4, z: 3.0, color: '#c2d3f0', intensity: 2.09, radius: 18.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.2, y: 1.2, z: 1.8, color: '#d98947', intensity: 1.89, radius: 5.16 },
    lights: [
      { kind: 'cold', x: -5.0, y: 9.00, z: -13.0, color: '#b1c7dd', intensity: 2.18, radius: 18.0, flicker: false },
      { kind: 'warm', x: 2.6, y: 0.80, z: -5.0, color: '#d98947', intensity: 2.64, radius: 4.99 },
      { kind: 'warm', x: -5.6, y: 0.70, z: -8.5, color: '#dc9f54', intensity: 1.59, radius: 4.47 },
      { kind: 'warm', x: 6.6, y: 0.70, z: -11.5, color: '#db994d', intensity: 1.21, radius: 4.13 },
    ],
    shafts: { count: 3, spread: 22, y: 12.0, z: -12.0, angle: 0.20, width: 3.6, intensity: 0.32, pool: 1.5 },
    bloom: 0.98,
  },

  /* ── 17. The Heart of the House ────────────────────────────────────────────
     A near-cubic 24 m chamber under a dome, warm gold, a colonnade of statues
     converging on the light in the far wall. */
  heart: {
    label: 'The Heart of the House',
    propMat: 'stone', propCeil: 0.619,
    arch: 0, floorPattern: 0,
    room: { w: 24, d: 24, h: 9.5, side: 0.02, ceilPattern: 4, wallPad: 5.0 },
    cam: { y: 2.30, z: 13.0, look: 3.3, fov: 33 },
    deep: '#211a1c', mid: '#423428', hi: '#725b41', accent: '#c3a674',
    rimCol: '#eadcb7', shaft: '#e4d0b1', floorDeep: '#161114', floorMid: '#392d24',
    ambient: '#1d1719', propAlb: '#4a3a2b', propHi: '#876d4c',
    gloss: 0.72, grime: 0.20, open: '#dbc38e', openGlow: 0.88, coolFill: 0.7, wallFog: 0.10,
    props: { shapes: [15, 6, 4, 0, 5], count: 24, height: 2.6, layout: 'colonnade' },
    particles: { mix: [[PTYPE.DUST, 0.54], [PTYPE.WISP, 0.30], [PTYPE.EMBER, 0.16]],
                 tint: '#fff2d8', wispTint: '#ffd9a8', emberTint: '#ffcf7a',
                 speed: 0.55, scale: 1.15, wind: 0.35, density: 1.0 },
    exposure: 1.8, contrast: 1.67,
    key:  { glow: 0, kind: 'warm', x: -4.4, y: 3.6, z: 2.6, color: '#ebcc9b', intensity: 0.9, radius: 8.6 },
    fill: { glow: 0, kind: 'cold', x: 5.6, y: 2.6, z: 1.4, color: '#91bad3', intensity: 5.4, radius: 8.5, flicker: false },
    lights: [
      { kind: 'warm', x: 0.0, y: 4.20, z: -15.0, color: '#edd7a6', intensity: 0.88, radius: 10.32, flicker: false },
      { kind: 'warm', x: -5.6, y: 2.20, z: -8.0, color: '#e9c892', intensity: 0.59, radius: 6.45 },
      { kind: 'warm', x: 5.6, y: 2.20, z: -8.0, color: '#e9c892', intensity: 0.59, radius: 6.45 },
      { kind: 'cold', x: 0.0, y: 1.00, z: -3.2, color: '#91bad3', intensity: 3.07, radius: 5.4 },
    ],
    shafts: { count: 3, spread: 14, y: 10.0, z: -12.0, angle: 0.18, width: 4.0, intensity: 0.48, pool: 1.8 },
    bloom: 0.82, warmTone: 0.07, halation: 0.58, vignette: 1.01, grain: 0.020,
  },

  /* ── Exterior night (title / gameover) ─────────────────────────────────────
     Not one of the seventeen rooms. A WebGL night exterior — sky gradient,
     stars, a real moon with a halo, a distant roofline with lit windows that
     spill onto the masonry, and two candle pools at the front of frame.
     NOTE for the frontend agent: `.ti-sky` in title.css is currently an opaque
     gradient over the whole viewport, so this never becomes visible. See the
     hand-off note in docs/NOTES.md. */
  title: {
    label: 'Midnight Menagerie',
    propMat: 'stone', propCeil: 0.439,
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 56, d: 34, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.6, z: 12.5, look: 3.6, fov: 44 },
    deep: '#121324', mid: '#22273d', hi: '#393f5d', accent: '#7891be',
    rimCol: '#d5ad70', shaft: '#aab9d7', floorDeep: '#0e0f19', floorMid: '#1c202c',
    ambient: '#161828', propAlb: '#282c3d', propHi: '#51576c',
    gloss: 0.34, grime: 0.72, coolFill: 1.10, wallFog: 0.22, open: '#d1a460', openGlow: 0.85,
    props: { shapes: [9, 3, 2, 18, 9], count: 26, height: 2.1, layout: 'rows' },
    particles: { mix: [[PTYPE.DUST, 0.62], [PTYPE.WISP, 0.22], [PTYPE.EMBER, 0.16]],
                 tint: '#d8e4ff', wispTint: '#8fc8ff', emberTint: '#ffb04a',
                 speed: 0.6, scale: 1.1, wind: 0.7, density: 0.8 },
    key:  { glow: 0, kind: 'warm', x: -7.4, y: 1.9, z: 3.2, color: '#dda358', intensity: 1.89, radius: 5.16 },
    fill: { glow: 0, kind: 'warm', x: 7.4, y: 1.9, z: 3.2, color: '#dda358', intensity: 1.2, radius: 5.16 },
    lights: [
      { kind: 'warm', x: -7.4, y: 1.60, z: -2.0, color: '#dda358', intensity: 1.82, radius: 4.3 },
      { kind: 'warm', x: 7.4, y: 1.60, z: -2.0, color: '#dda358', intensity: 1.82, radius: 4.3 },
      { kind: 'cold', x: 6.0, y: 10.0, z: -18.0, color: '#b1c1e2', intensity: 2.79, radius: 20.0, flicker: false },
    ],
    shafts: { count: 2, spread: 18, y: 12.0, z: -14.0, angle: 0.22, width: 3.4, intensity: 0.25, pool: 1.4 },
    bloom: 0.90, warmTone: 0.05, halation: 0.62, vignette: 1.16,
  },
};

/** Region alias -> palette key, so scenes can pass design-doc names. */
export const REGION_ALIAS = {
  foyer: 'foyer', nursery: 'nursery', 'sleeping-quarters': 'sleeping', sleeping: 'sleeping',
  kitchens: 'kitchens', cellars: 'kitchens', greenhouse: 'greenhouse', conservatory: 'greenhouse',
  graveyard: 'graveyard', study: 'study', library: 'study', attic: 'attic',
  observatory: 'attic', lampworks: 'lampworks', ballroom: 'ballroom', crypt: 'crypt',
  ossuary: 'crypt', hedge: 'hedge', 'hedge-maze': 'hedge', passages: 'passages',
  'secret-passages': 'passages', bathhouse: 'bathhouse', kennels: 'kennels',
  pumpkin: 'pumpkin', 'pumpkin-grounds': 'pumpkin', heart: 'heart',
  title: 'title', exterior: 'title',
};

const COLOR_KEYS = [
  ['deep', '_deep'], ['mid', '_mid'], ['hi', '_hi'], ['accent', '_accent'],
  ['fog', '_fog'], ['open', '_open'], ['floorDeep', '_floorDeep'],
  ['floorMid', '_floorMid'], ['propAlb', '_propAlb'], ['propHi', '_propHi'],
  ['ambient', '_ambient'], ['rimCol', '_rim'], ['shaft', '_shaft'], ['frame', '_frame'],
];
const NUM_KEYS = ['coolFill', 'grime', 'openGlow', 'wallFog', 'gloss', 'rim', 'gain',
  'frameAmount', 'ceil', 'bloom', 'bloomThreshold', 'warmTone', 'halation',
  'exposure', 'vignette', 'grain', 'fogDensity', 'propGain', 'propGloss', 'saturate',
  'contrast'];

/**
 * PER-ROOM VARIATION.
 *
 * Seventeen authored spaces have to carry 340 authored rooms: `scenes/combat.js`
 * maps six different Foyer rooms onto `passages`, and with the RNG seeded from
 * the palette key alone all six rendered pixel-identically — the same corridor,
 * the same props in the same places, the same lamps. `setMood(name, { seed })`
 * re-seeds from the ROOM as well, and this table lets the seed reach the one
 * thing a reseed alone cannot change: the arrangement itself.
 *
 * Each authored layout maps to the arrangements that are still honestly the
 * same KIND of space — a corridor stays a corridor, it just is not the same
 * corridor twice. The authored layout is always in its own family, so an
 * unseeded `setMood()` is byte-for-byte what it was before.
 */
const LAYOUT_FAMILY = {
  wings:     ['wings', 'nook', 'clutter'],
  colonnade: ['colonnade', 'rows', 'perimeter'],
  rows:      ['rows', 'colonnade', 'terrace'],
  aisle:     ['aisle', 'colonnade', 'nook'],
  clutter:   ['clutter', 'nook', 'wings'],
  nook:      ['nook', 'clutter', 'wings'],
  terrace:   ['terrace', 'rows', 'perimeter'],
  hang:      ['hang', 'clutter', 'nook'],
  perimeter: ['perimeter', 'wings', 'colonnade'],
};

/** 32-bit FNV-1a. A room name, a node id or a number all hash the same way. */
function hashSeed(v) {
  let h = 2166136261;
  const s = String(v);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function resolve(name) {
  const key = REGION_ALIAS[name] || (REGIONS[name] ? name : 'foyer');
  const src = REGIONS[key] || {};
  const out = Object.assign({}, D, src);
  out.shafts = Object.assign({}, D.shafts, src.shafts);
  out.props = Object.assign({}, D.props, src.props);
  out.particles = Object.assign({}, D.particles, src.particles);
  out.room = Object.assign({}, D.room, src.room);
  out.cam = Object.assign({}, D.cam, src.cam);
  out.lights = src.lights || D.lights;
  out.key = Object.assign({}, D.key, src.key);
  out.fill = Object.assign({}, D.fill, src.fill);
  out.regionKey = key;
  out._mat = PROP_MATERIAL[out.propMat] || PROP_MATERIAL.wood;
  for (const [hex, dst] of COLOR_KEYS) out[dst] = new THREE.Color(out[hex]);
  return out;
}

/* ------------------------------------------------------------------- engine */

export class Atmosphere {
  constructor(ctx) {
    this.ctx = ctx;
    this.mood = null;
    this.ready = false;
    this._dread = 0; this._dreadTarget = 0;
    this._intensity = 1;
    this._fade = 1;
    this._t = 0;
    this._seed = 1;
    this._cssT = 0;
    // reusable scratch — no per-frame allocation
    this._v3 = new THREE.Vector3();
    this._v3b = new THREE.Vector3();
    this._col = new THREE.Color();
    this._css = { kx: 0, ky: 0, key: '', fill: '', str: 0 };
  }

  init() {
    const stage = this.ctx.stage;
    this.tokens = this._readTokens();

    this.backdrop = new Backdrop(stage.scene);
    this.rig = new LightRig(stage.scene);
    /* Particle budget follows the quality tier. The field is always ALLOCATED at
       the high-tier count so a tier switch is a draw-range change and never a
       buffer rebuild (which would mean a shader relink mid-session); only the
       number actually drawn moves. */
    this.particles = new ParticleField(stage.scene, {
      count: 1500, seedFn: () => this._rand(),
    });
    this.particles.setAmbientBudget(stage.tierSpec?.particles ?? 1500);
    this.particles.setPixelRatio(stage.renderer.getPixelRatio());
    this._unTier = stage.onTierChange?.((name, spec) => {
      this.particles.setAmbientBudget(spec.particles);
      this.particles.setPixelRatio(stage.renderer.getPixelRatio());
    });

    // a pooled light used by impact() so hits actually illuminate the room
    this.flare = this.rig.add({ kind: 'warm', pos: new THREE.Vector3(0, 2, -4), color: 0xffd75e, intensity: 0.0, radius: 5.16, flicker: false });
    this._flareDecay = 0;

    this.live = resolve('foyer');
    this.target = this.live;
    this.setMood('foyer', { instant: true });

    this._unsub = clock.onFrame((dt, t) => this.update(dt, t));
    this.ready = true;

    /* Compile every program behind the first frame instead of in it. Round 1
       stacked RenderPass + UnrealBloomPass(5 mips) + grade + OutputPass with no
       warm-up anywhere, and the first composer.render() showed up as a single
       ~6 s long task on every scene. */
    stage.warmup?.().then((ms) => { window.__MM_WARMUP_MS = ms; }).catch(() => {});
    return this;
  }

  /* ------------------------------------------------------------ public API */

  /**
   * Swap region look. Cross-fades colour/light over ~0.7 s unless instant.
   *
   * @param {string} name   region / atmosphere key (see REGION_ALIAS)
   * @param {object} [opts]
   * @param {boolean} [opts.instant]  no cross-fade
   * @param {string|number} [opts.seed]     WHICH ROOM this is. Two rooms that
   *        resolve to the same authored space (six Foyer rooms all play in
   *        `passages`) rendered identically because the RNG was seeded from the
   *        palette key alone. Pass anything stable and per-room — the room name
   *        or the node id — and the same room comes back the same every time
   *        while its neighbour on the same key does not. Costs no new authored
   *        data: prop arrangement, prop count, room proportions and lamp
   *        positions are all derived from it.
   * @param {string|number} [opts.variant]  a second axis on the same seed, for
   *        a caller that wants "this room, but the other way round" (a rematch,
   *        a Big Scare in a room already fought in). Folded into the seed.
   *
   * Omit both and nothing changes: the palette is used exactly as authored.
   */
  setMood(name, opts = {}) {
    if (!this.backdrop) return this;
    const pal = resolve(name);
    this.mood = pal.regionKey;
    this.target = pal;
    this._seed = 1;
    for (let i = 0; i < pal.regionKey.length; i++) this._seed = (this._seed * 31 + pal.regionKey.charCodeAt(i)) % 100003;

    const hasSeed = opts.seed !== undefined && opts.seed !== null && opts.seed !== '';
    const hasVariant = opts.variant !== undefined && opts.variant !== null && opts.variant !== '';
    this.roomSeed = hasSeed || hasVariant ? `${opts.seed ?? ''}#${opts.variant ?? ''}` : null;
    if (this.roomSeed) {
      // Mix the room into the space's own seed rather than replacing it, so the
      // palette key still contributes and two rooms in DIFFERENT spaces that
      // happen to share a name do not share a layout.
      this._seed = (this._seed ^ hashSeed(this.roomSeed)) % 2147483647;
      if (this._seed <= 0) this._seed += 2147483646;
      this._vary(pal, hashSeed(`${pal.regionKey}|${this.roomSeed}`));
    }

    /* The lens the props have to fit inside. Round 2 hard-coded 16/9 in the
       layout clamp, so on any other window shape a prop's "visible half-width"
       was fiction. */
    pal.aspect = this.ctx.stage.camera.aspect || (16 / 9);
    this.backdrop.build(pal, () => this._rand());
    // material is structural, like the geometry: it swaps with the room rather
    // than cross-fading, because a cabinet does not gradually stop being oak.
    this.backdrop.applyPropMaterial(pal._mat);
    this._buildLights(pal);
    this.particles.setConfig(pal.particles);
    // the drift volume follows the room, so a corridor is not full of dust that
    // is visibly floating through its own walls
    const R = pal.room;
    this.particles.setVolume(
      0, (R.h > 0 ? R.h : 9) * 0.62, -R.d * 0.45,
      R.w * 0.55, (R.h > 0 ? R.h : 9) * 0.60, R.d * 0.55
    );
    this.ctx.stage.scene.fog.color.copy(pal._fog);
    this.ctx.stage.scene.fog.density = pal.fogDensity;
    this.ctx.stage.renderer.setClearColor(pal._fog.getHex(), 1);
    this.ctx.stage.setCameraRig(pal.cam, opts.instant || Save.settings?.reduceMotion ? 0 : 0.7);

    if (opts.instant || Save.settings?.reduceMotion) {
      this.live = pal;
      this.backdrop.applyPalette(pal);
      this._applyGrade(pal, 1);
      this._fade = 1;
    } else {
      // keep the live object identity, ease its numbers toward the target
      this.live = Object.assign({}, this.live);
      for (const [, dst] of COLOR_KEYS) this.live[dst] = this.live[dst].clone();
      this.live.room = pal.room; this.live.cam = pal.cam;
      this._fade = 0;
    }
    this._publishCss(true);
    return this;
  }

  /** 0..1 scary-moment grade: desaturate, cool, crush the edges. */
  dread(v, dur = 0.6) {
    v = Math.max(0, Math.min(1, v));
    if (dur <= 0 || Save.settings?.reduceMotion) { this._dread = this._dreadTarget = v; return this; }
    const from = this._dread;
    this._dreadTarget = v;
    clock.ramp(dur, (k) => { this._dread = from + (v - from) * k; });
    return this;
  }

  /** Soft coloured wash across the whole frame. Gated by Save.settings.flashes. */
  pulse(color = 0x6fd9ec, amount = 0.20, dur = 0.55) {
    this.ctx.stage.pulse(typeof color === 'string' ? new THREE.Color(color).getHex() : color, amount, dur);
    return this;
  }

  /**
   * How much PHOTOSENSITIVE brightness is allowed right now, 0..1.
   *
   * One place, so no caller has to know the rule. `flashes` is a 0..1 slider and
   * `reduceMotion` says in its own hint that it overrides the settings above, so
   * it caps the slider rather than scaling it.
   */
  _lightGate() {
    const s = Save.settings || {};
    const f = Math.max(0, Math.min(1, s.flashes ?? 1));
    /* 0.05, not 0.2. At 0.2 the flare still sits at `2.2 * 0.2 = 0.44` intensity and a big
       hit measured a +15.5% whole-frame luminance lift with Reduced motion ON — which is
       not what "Overrides the settings above" promises to someone who turned it on for
       photosensitivity. At 0.05 the sparks still read (they are shaped by `strength`,
       which is never gated) and the room stops washing. */
    return s.reduceMotion ? Math.min(f, 0.05) : f;
  }

  /**
   * Hit feedback.
   *
   * `pos` may be a THREE.Vector3 (world) or {x, y} in CSS pixels.
   *
   * @param {object} [opts]
   * @param {number} [opts.strength=1]  HOW BIG THE HIT IS, 0..2. Sparks, ring
   *        radius and shake magnitude. Never gated — a 26-damage hit must read
   *        as a 26-damage hit at every accessibility setting.
   * @param {number} [opts.light]       HOW MUCH IT LIGHTS THE ROOM, 0..1. The
   *        point-light flare, the screen flash and the spark brightness — every
   *        photosensitive channel, and nothing else. Defaults to
   *        `min(strength, 1)` so existing callers are unchanged. Pass 0 for
   *        "this is a big hit, but do not flash the screen".
   *
   *        The accessibility gate is applied HERE, to this number, and to
   *        nothing a caller has to remember: `Save.settings.flashes` scales it
   *        and `reduceMotion` caps it at 0.2. Round 4 of combat-scene had to
   *        hand-gate three separate leaks (the ungated flare, the additive spark
   *        burst, and `strength` doing double duty) because `strength` conflated
   *        the two jobs — a 6-damage Bite lifted whole-frame mean luminance +22%
   *        with Flashes at 0%.
   * @param {number|string} [opts.color]
   * @param {boolean} [opts.shake=true]
   * @param {boolean} [opts.burst=true] emit sparks at all (shape, not brightness)
   */
  impact(pos, opts = {}) {
    if (!this.ready) return this;
    const strength = opts.strength ?? 1;
    const light = Math.max(0, Math.min(1, opts.light ?? Math.min(strength, 1)))
                * this._lightGate();
    const colorHex = typeof opts.color === 'string'
      ? new THREE.Color(opts.color).getHex()
      : (opts.color ?? 0xffd75e);

    const w = this._toWorld(pos, this._v3);
    /* Sparks. Count and spread follow `strength` so the hit stays legible with
       every light channel at zero; brightness follows `light`, because additive
       geometry inside the bloom pass is a photosensitive channel like any
       other. Below a tenth of the gate they are dropped entirely. */
    if (opts.burst !== false) {
      /* No brightness floor. `0.16 + 0.84 * light` meant the sparks were never dimmer than
         16% however hard the gate clamped, and since they are additive geometry inside the
         bloom pass they were the bulk of the remaining wash: measured, a big hit with
         Reduced motion ON still lifted whole-frame luminance +17.3%, and +2.0% with the
         burst suppressed. Brightness now follows `light` exactly and the sparks are dropped
         below a tenth of it. The hit stays legible because the SHAPE is driven by
         `strength` (never gated) and because combat-scene's own 2D burst is alpha-scaled
         rather than removed. */
      if (light > 0.10) {
        this.particles.burst(w.x, w.y, w.z, colorHex,
          1.1 + strength * 1.3, 0.62 * light);
      }
    }
    // a real light flash at the hit point — a photosensitive channel
    this.flare.setPos(w.x, w.y, w.z);
    this.flare.color.set(colorHex);
    this.flare.point.color.set(colorHex);
    this.flare.base = 2.2 * light;
    this._flareDecay = light > 0.001 ? 1 : 0;
    if (light <= 0.001) this.flare.base = 0;
    // screen-space ring + shake: geometry and motion, gated by their own settings
    this._v3b.copy(w).project(this.ctx.stage.camera);
    this.ctx.stage.ripple(this._v3b.x * 0.5 + 0.5, this._v3b.y * 0.5 + 0.5, Math.min(strength, 1.6));
    if (opts.shake !== false) this.ctx.stage.shake(0.07 + 0.10 * strength, 10);
    // stage.flash re-checks the settings itself; `light` is already gated, so a
    // caller that asked for no flash gets none even with the slider at 100%.
    if (light >= 0.35) this.ctx.stage.flash(colorHex, 0.05 * Math.min(light * 2, 2), 0.14);
    return this;
  }

  /** Add your own light. Returns an AtmoLight (setPos / .base / .enabled). */
  light(spec) { return this.rig.add(spec); }

  /** Dim the whole backdrop — useful when a scene puts a lot of UI on top. */
  setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); return this; }

  /**
   * Ground shadows for actors a scene owns (enemies, the companion, a prop mesh).
   * Pass world x/z, a radius in metres and 0..1 strength; pass [] to clear.
   * A DOM actor can convert its screen x to world x with `atmosphere.screenToFloor`.
   */
  setActors(list) {
    this.backdrop?.setActorShadows?.(list || []);
    return this;
  }

  /** The live key light, for scenes that want to shade their own actors. */
  keyLight() {
    const r = this.rig;
    return {
      dirX: r.keyDir.x, dirY: r.keyDir.y,
      color: r.keyColor.getStyle(), strength: Math.min(r.keyIntensity / 2.4, 1),
      fill: this._col.copy(this.live._accent).getStyle(),
    };
  }

  /** World x/z on the floor plane under a CSS-pixel screen point. */
  screenToFloor(px, py, out = new THREE.Vector3()) {
    const cam = this.ctx.stage.camera;
    out.set(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1, 0.5).unproject(cam);
    out.sub(cam.position).normalize();
    const t = -cam.position.y / (out.y || -1e-6);
    return out.multiplyScalar(t).add(cam.position);
  }

  /* ------------------------------------------------------------- internals */

  _rand() {
    this._seed = (this._seed * 1103515245 + 12345) & 0x7fffffff;
    return (this._seed >>> 8) / 8388608;
  }

  /**
   * Turn one authored space into THIS room. Structure only — never colour,
   * never grade, never the particle mix: the region has to stay recognisably
   * itself, so what moves is the arrangement, the proportions and the lamps.
   *
   *   layout       a sibling arrangement from LAYOUT_FAMILY
   *   prop count   ±25%, so one room is sparse and the next is crowded
   *   proportions  ±9% on width and depth, ±6% on height
   *   lamps        each moved up to ~14% of the room across and along it,
   *                intensity ±10%, and the key/fill swapped left-to-right half
   *                the time — which is the single most visible change of all
   *   shafts       ±1 shaft, and the fall moved along the room
   *
   * `pal` is the fresh object `resolve()` just built, so mutating it is safe —
   * EXCEPT `pal.lights`, which `resolve()` aliases straight to the authored
   * REGIONS array. That one is cloned here before anything touches it.
   *
   * Runs once per room entry, never per frame.
   */
  _vary(pal, h) {
    let s = h >>> 0 || 1;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const spread = (amt) => 1 + (r() * 2 - 1) * amt;    // 1±amt

    // ── the arrangement ────────────────────────────────────────────────────
    const fam = LAYOUT_FAMILY[pal.props.layout] || [pal.props.layout];
    pal.props = Object.assign({}, pal.props, {
      layout: fam[(r() * fam.length) | 0],
      count: Math.max(6, Math.round((pal.props.count ?? 22) * spread(0.25))),
      height: (pal.props.height ?? 2.2) * spread(0.08),
    });

    // ── the shell ──────────────────────────────────────────────────────────
    // Small: the camera rig is authored against these proportions and a room
    // that grows 30% stops being framed. 9% is a different room, not a mistake.
    const R = pal.room;
    R.w *= spread(0.09);
    R.d *= spread(0.09);
    if (R.h > 0) R.h *= spread(0.06);
    R.side += (r() * 2 - 1) * 0.02;

    // ── the lamps ──────────────────────────────────────────────────────────
    const flip = r() < 0.5 ? -1 : 1;      // mirror the room's lighting
    const move = (L, ax, az) => {
      L.x = L.x * flip + (r() * 2 - 1) * R.w * ax;
      L.z += (r() * 2 - 1) * R.d * az;
      L.intensity *= spread(0.10);
      return L;
    };
    // key and fill are already fresh copies; the lamp array is not.
    move(pal.key, 0.06, 0.04);
    move(pal.fill, 0.06, 0.04);
    pal.lights = (pal.lights || []).map((L) => move(Object.assign({}, L), 0.14, 0.10));

    // ── the shafts ─────────────────────────────────────────────────────────
    const sh = pal.shafts;
    sh.count = Math.max(1, (sh.count ?? 3) + ((r() * 3) | 0) - 1);
    sh.z *= spread(0.12);
    sh.spread *= spread(0.16);
    sh.angle *= spread(0.20);
  }

  _readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const t = {};
    for (const k of ['--ink-900', '--ink-800', '--ink-700', '--flame-glow', '--flame-300',
      '--flame-100', '--spectre-300', '--spectre-500', '--spectre-100', '--threat-300',
      '--pluck-300', '--text-hi']) {
      const v = cs.getPropertyValue(k).trim();
      if (v) t[k.slice(2)] = v;
    }
    return t;
  }

  _buildLights(pal) {
    this.rig.clear();
    // KEY first, then FILL, then the room's own lamps. The rig keeps the five
    // with the highest authored intensity, so the key can never be dropped.
    // The first two are CINEMATIC: they shape the actors and barely touch the
    // set. Everything after them is a lamp that exists in the room.
    const src = [pal.key, pal.fill].concat(pal.lights);
    for (let i = 0; i < src.length; i++) {
      const L = src[i];
      this.rig.add({
        kind: L.kind, color: L.color, intensity: L.intensity, radius: L.radius,
        flicker: L.flicker !== false, cine: i < 2,
        pos: this._v3b.set(L.x, L.y, L.z),
      });
    }
    this.flare = this.rig.add({ kind: 'warm', pos: this._v3b.set(0, 2, -4), color: 0xffd75e, intensity: 0.0, radius: 5.16, flicker: false });
    this._flareDecay = 0;
    // ambient bounce keyed to the region's own bounce colour so nothing is dead
    // black — but low enough that the pools still read as pools
    /* Ambient and hemisphere feed MESHES only (the backdrop shaders carry their
       own uAmbient), and they lose the same 1/PI Lambert normalisation the
       punctual lights do. Scaled to match MESH_K so an actor's shadow side is
       lifted by the room's bounce instead of crushing to black. */
    this.rig.setAmbient(pal._ambient.getHex(), 2.10, pal._accent.getHex(), pal._deep.getHex(), 1.30);
  }

  _applyGrade(pal, k) {
    const u = this.ctx.stage.grade.uniforms;
    const b = this.ctx.stage.bloom;
    /* Bloom is applied BEFORE the grade's exposure, so the grade lift does not
       feed it. 0.62 is what stops the props reading as glowing boxes while the
       flames still halo. */
    b.strength = pal.bloom * 0.62 * this._intensity;
    b.threshold = pal.bloomThreshold;
    u.uToneAmt.value = pal.warmTone;
    u.uHalation.value = pal.halation;
    u.uExposure.value = pal.exposure;
    u.uVignette.value = pal.vignette;
    u.uGrain.value = pal.grain;
    u.uSaturate.value = pal.saturate ?? 1.2;
    u.uContrast.value = pal.contrast ?? 1.3;
    u.uHaloColor.value.copy(pal._rim).lerp(this._col.set(1, 1, 1), 0.25);
  }

  /**
   * Publish the live key light as CSS custom properties so DOM actors can be lit
   * by the same lamp. Throttled to ~6 Hz — this touches style on the root and
   * must never run per frame.
   */
  _publishCss(force) {
    const r = this.rig;
    const kx = r.keyDir.x, ky = r.keyDir.y;
    const key = r.keyColor.getStyle();
    const strength = Math.min(r.keyIntensity / 2.6, 1);
    const c = this._css;
    if (!force && Math.abs(kx - c.kx) < 0.02 && Math.abs(ky - c.ky) < 0.02
        && key === c.key && Math.abs(strength - c.str) < 0.05) return;
    c.kx = kx; c.ky = ky; c.key = key; c.str = strength;
    const fill = this._col.copy(this.live._accent).getStyle();
    const s = document.documentElement.style;
    s.setProperty('--atmo-key-x', kx.toFixed(3));
    s.setProperty('--atmo-key-y', ky.toFixed(3));
    s.setProperty('--atmo-key', key);
    s.setProperty('--atmo-fill', fill);
    s.setProperty('--atmo-key-strength', strength.toFixed(3));
    s.setProperty('--atmo-ground', (0.30 + 0.45 * strength).toFixed(3));
  }

  /** world position from a Vector3, or from CSS pixels on the z = 0 plane. */
  _toWorld(pos, out) {
    if (pos && pos.isVector3) return out.copy(pos);
    const cam = this.ctx.stage.camera;
    const x = (pos?.x ?? innerWidth / 2) / innerWidth * 2 - 1;
    const y = -((pos?.y ?? innerHeight / 2) / innerHeight) * 2 + 1;
    out.set(x, y, 0.5).unproject(cam);
    out.sub(cam.position).normalize();
    const dist = (0 - cam.position.z) / out.z;
    return out.multiplyScalar(dist).add(cam.position);
  }

  update(dt, t) {
    if (!this.ready) return;
    this._t = t;
    const reduce = Save.settings?.reduceMotion ? 1 : 0;
    const motion = reduce ? 0.25 : 1;

    // ---- mood cross-fade ----------------------------------------------------
    if (this._fade < 1) {
      this._fade = Math.min(1, this._fade + dt / 0.7);
      const k = this._fade * this._fade * (3 - 2 * this._fade);
      const L = this.live, T = this.target;
      for (const [, dst] of COLOR_KEYS) L[dst].lerp(T[dst], k * 0.35 + 0.06);
      for (const key of NUM_KEYS) L[key] = L[key] + (T[key] - L[key]) * (k * 0.4 + 0.06);
      L.arch = T.arch; L.floorPattern = T.floorPattern; L.sides = T.sides; L.room = T.room;
      this.backdrop.applyPalette(L);
      this._applyGrade(L, k);
      if (this._fade >= 1) { this.live = T; this.backdrop.applyPalette(T); this._applyGrade(T, 1); }
    }

    // ---- lights -------------------------------------------------------------
    if (this._flareDecay > 0) {
      this._flareDecay = Math.max(0, this._flareDecay - dt / 0.30);
      this.flare.base = this.flare.base * this._flareDecay;
      if (this._flareDecay <= 0) this.flare.base = 0;
    }
    this.rig.update(dt, t, motion);
    this.backdrop.syncLights(this.rig);
    this.backdrop.syncFlames(this.rig);
    this.backdrop.syncCamera(this.ctx.stage.camera.position);
    this.particles.syncLights(this.rig);

    this._cssT += dt;
    if (this._cssT > 0.16) { this._cssT = 0; this._publishCss(false); }

    // ---- dread + intensity --------------------------------------------------
    this.backdrop.setDread(this._dread);
    this.particles.setDread(this._dread);
    this.ctx.stage.grade.uniforms.uDread.value = this._dread;

    // ---- idle camera breathing (parallax through the layered backdrop) ------
    if (!reduce) {
      this.ctx.stage.setParallax(
        Math.sin(t * 0.17) * 0.20 + Math.sin(t * 0.41) * 0.06,
        Math.sin(t * 0.23 + 1.3) * 0.10,
        Math.sin(t * 0.11) * 0.14
      );
    }
    this.backdrop.setSway(motion);
    this.particles.setReduce(reduce);
    /* Point sprites are sized in device pixels, so they have to follow the
       renderer's pixel ratio — which the quality tier and its calibration both
       move. One float compare per frame, one uniform write when it changes. */
    const pr = this.ctx.stage.renderer.getPixelRatio();
    if (pr !== this._pr) { this._pr = pr; this.particles.setPixelRatio(pr); }

    this.backdrop.update(dt, t);
    this.particles.update(dt, t);
  }

  dispose() {
    this._unsub?.();
    this._unTier?.();
    this.backdrop?.dispose();
    this.particles?.dispose();
    this.rig?.clear();
    this.ready = false;
  }
}
