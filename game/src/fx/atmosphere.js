/**
 * Atmosphere — backdrop, candlelight, particles, mood and screen-space juice.
 * OWNER: atmosphere agent.
 *
 * Public API (other agents call these; documented in docs/NOTES.md):
 *   atmosphere.setMood(region, { instant })      swap region look (17 regions + title)
 *   atmosphere.impact(pos, { strength, color })  hit feedback at a world or screen point
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

const D = {
  arch: 0, floorPattern: 0, ceil: 6.4,
  coolFill: 0.85, grime: 0.72, openGlow: 0.5, wallFog: 0.16, gloss: 0.5,
  rim: 1.0, frameAmount: 0.62, sides: true,
  deep: '#1d1526', mid: '#3b2c3e', hi: '#5f4257', accent: '#4f8cae', fog: '#0a0812',
  open: '#3aa0bd', floorDeep: '#120d18', floorMid: '#33232a', ambient: '#171225',
  propAlb: '#3a2a2c', propHi: '#6a4f45',
  rimCol: '#ffb64a', shaft: '#ffcf8a', frame: '#05040a',
  gain: 1.85, propGain: 1.42, propGloss: 0.62,
  bloom: 0.72, bloomThreshold: 0.86, warmTone: 0.10, halation: 0.30, exposure: 2.05,
  vignette: 1.26, grain: 0.026, saturate: 1.24, contrast: 1.26,
  fogDensity: 0.014,
  room: { w: 24, d: 19, h: 6.6, side: 0.0, ceilPattern: 3, wallPad: 7.0 },
  cam: { y: 2.3, z: 9.6, look: 2.4, fov: 42 },
  shafts: { count: 3, spread: 16, y: 8.2, z: -12, angle: 0.26, width: 3.4, intensity: 0.55, pool: 1.5 },
  /* KEY and FILL sit in FRONT of the action plane (positive z), between the
     camera and the actors. Round 1 authored only lamps deep in the room, so the
     camera always saw the shadow side of everything: the showcase stand-in, the
     near props and the enemies all rendered as flat black cut-outs no matter how
     bright the room behind them got. These two are what actually light an actor. */
  key:  { kind: 'warm', x: -4.2, y: 3.4, z: 2.4, color: '#ffc06a', intensity: 2.20, radius: 9.0, glow: 0 },
  fill: { kind: 'cold', x: 5.2, y: 2.8, z: 1.6, color: '#6fd9ec', intensity: 1.06, radius: 9.5, flicker: false, glow: 0 },
  props: { shapes: [0, 1, 5, 6], count: 24, height: 2.2, layout: 'wings' },
  particles: { mix: [[PTYPE.DUST, 0.82], [PTYPE.WISP, 0.11], [PTYPE.EMBER, 0.07]],
               speed: 1, scale: 1, wind: 1, density: 0.45,
               tint: '#ffe6bc', wispTint: '#6fd9ec', emberTint: '#ffb64a' },
  lights: [
    { kind: 'warm', x: -4.6, y: 2.9, z: -12.6, color: '#ffb64a', intensity: 2.30, radius: 6.2 },
    { kind: 'warm', x: 4.8, y: 2.9, z: -12.6, color: '#ff9e3c', intensity: 1.90, radius: 5.8 },
    { kind: 'warm', x: -2.4, y: 1.15, z: -5.0, color: '#ffc766', intensity: 1.75, radius: 6.2 },
    { kind: 'cold', x: 5.0, y: 3.4, z: -9.0, color: '#6fd9ec', intensity: 0.85, radius: 9.5, flicker: true },
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
    arch: 0, floorPattern: 0,
    room: { w: 26, d: 21, h: 8.6, side: 0.03, ceilPattern: 7, wallPad: 6.0 },
    cam: { y: 2.55, z: 9.4, look: 2.9, fov: 40 },
    deep: '#221525', mid: '#452a33', hi: '#77482f', accent: '#4f86a8',
    floorDeep: '#150e12', floorMid: '#3d281f', ambient: '#1d1424',
    propAlb: '#4a3128', propHi: '#8a5f3c', rimCol: '#ffc266', shaft: '#ffd79a',
    gloss: 0.62, openGlow: 0.72, open: '#3fa6c2', grime: 0.60,
    props: { shapes: [14, 0, 6, 5, 1, 7], count: 26, height: 2.5, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.80], [PTYPE.WISP, 0.12], [PTYPE.EMBER, 0.08]],
                 tint: '#ffe6bc', wispTint: '#7fd9ec', emberTint: '#ffb64a',
                 speed: 0.85, scale: 1.05, wind: 0.7, density: 0.85 },
    exposure: 2.10, contrast: 1.21,
    key:  { glow: 0, kind: 'warm', x: -4.6, y: 3.6, z: 2.6, color: '#ffc06a', intensity: 2.40, radius: 9.5 },
    fill: { glow: 0, kind: 'cold', x: 5.6, y: 2.6, z: 1.2, color: '#6fd9ec', intensity: 1.19, radius: 9.0, flicker: false },
    lights: [
      { kind: 'warm', x: -5.4, y: 3.4, z: -16.0, color: '#ffb04a', intensity: 2.60, radius: 8.0 },
      { kind: 'warm', x: 5.4, y: 3.4, z: -16.0, color: '#ffa53c', intensity: 2.20, radius: 7.6 },
      { kind: 'warm', x: -3.2, y: 1.30, z: -5.4, color: '#ffcf7a', intensity: 2.10, radius: 6.6 },
      { kind: 'cold', x: 4.6, y: 4.2, z: -10.5, color: '#6fd9ec', intensity: 1.05, radius: 10.0 },
    ],
    shafts: { count: 3, spread: 15, y: 9.6, z: -13.5, angle: 0.28, width: 3.2, intensity: 0.62, pool: 1.7 },
    bloom: 0.80, warmTone: 0.12, halation: 0.55,
  },

  /* ── 2. The Forgotten Nursery ──────────────────────────────────────────────
     Small, low, cluttered with toys at knee height. Wide lens, low eye. */
  nursery: {
    label: 'The Forgotten Nursery',
    arch: 0, floorPattern: 0,
    room: { w: 15, d: 12.5, h: 4.8, side: 0.0, ceilPattern: 3, wallPad: 4.0 },
    cam: { y: 1.85, z: 6.6, look: 1.95, fov: 48 },
    deep: '#2a1a30', mid: '#54334c', hi: '#8f566a', accent: '#6f9fc4',
    rimCol: '#ffd0aa', shaft: '#f2ddec', floorDeep: '#1a1220', floorMid: '#3c2c36',
    ambient: '#231a30', propAlb: '#5b3b48', propHi: '#a8737a',
    gloss: 0.42, open: '#8fc4d6', openGlow: 0.55, grime: 0.48,
    props: { shapes: [10, 11, 5, 2, 7], count: 24, height: 1.55, layout: 'clutter' },
    particles: { mix: [[PTYPE.DUST, 0.68], [PTYPE.ASH, 0.20], [PTYPE.WISP, 0.12]],
                 tint: '#ffdfe4', wispTint: '#a8ecf7', emberTint: '#ffc7a0',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.9 },
    exposure: 1.96, contrast: 1.62,
    key:  { glow: 0, kind: 'warm', x: -3.4, y: 2.9, z: 2.2, color: '#ffc79a', intensity: 2.10, radius: 7.5 },
    fill: { glow: 0, kind: 'cold', x: 4.4, y: 2.4, z: 1.4, color: '#9fd4ee', intensity: 1.19, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.6, y: 1.10, z: -4.2, color: '#ffbb82', intensity: 2.05, radius: 5.0 },
      { kind: 'cold', x: 3.2, y: 3.40, z: -10.4, color: '#a8dcf2', intensity: 1.70, radius: 8.0 },
      { kind: 'cold', x: -4.4, y: 3.60, z: -10.8, color: '#8fc8e8', intensity: 1.10, radius: 7.0 },
      { kind: 'warm', x: 4.6, y: 1.90, z: -6.6, color: '#ffcf8c', intensity: 0.95, radius: 4.6 },
    ],
    shafts: { count: 2, spread: 9, y: 5.6, z: -9.0, angle: 0.34, width: 2.6, intensity: 0.62, pool: 1.8 },
  },

  /* ── 3. The Sleeping Quarters ──────────────────────────────────────────────
     Asymmetric: the whole mass of the room is on one side, the other is bare
     moonlit floor. Cold, blue, still. */
  sleeping: {
    label: 'The Sleeping Quarters',
    arch: 0, floorPattern: 0,
    room: { w: 18, d: 16, h: 5.6, side: 0.06, ceilPattern: 3, wallPad: 4.6 },
    cam: { y: 2.05, z: 8.0, look: 2.15, fov: 43 },
    nookSide: -1,
    deep: '#181633', mid: '#312e5c', hi: '#4d4a86', accent: '#5f80c4',
    shaft: '#c7d8ff', floorDeep: '#0e0d1c', floorMid: '#262742', ambient: '#1a1836',
    propAlb: '#39365e', propHi: '#6a68a0', rimCol: '#dfe6ff',
    gloss: 0.38, open: '#5f86c8', openGlow: 0.42, coolFill: 1.15, wallFog: 0.22,
    props: { shapes: [12, 5, 7, 0, 2], count: 20, height: 2.1, layout: 'nook' },
    particles: { mix: [[PTYPE.DUST, 0.60], [PTYPE.WISP, 0.28], [PTYPE.ASH, 0.12]],
                 tint: '#cfd8f2', wispTint: '#8fb7ff', emberTint: '#ffb64a',
                 speed: 0.7, scale: 1.0, wind: 0.5, density: 0.8 },
    exposure: 2.52, contrast: 1.63,
    key:  { glow: 0, kind: 'warm', x: -4.0, y: 3.2, z: 2.4, color: '#ffb877', intensity: 1.95, radius: 8.5 },
    fill: { glow: 0, kind: 'cold', x: 5.4, y: 2.6, z: 1.0, color: '#8fb0ff', intensity: 1.44, radius: 8.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.4, y: 1.05, z: -4.6, color: '#ffb24a', intensity: 2.05, radius: 4.8 },
      { kind: 'cold', x: 5.2, y: 4.20, z: -12.6, color: '#8fb0ff', intensity: 2.05, radius: 11.0 },
      { kind: 'cold', x: -6.2, y: 2.80, z: -9.6, color: '#6f9ce8', intensity: 0.90, radius: 7.5 },
    ],
    shafts: { count: 2, spread: 11, y: 6.4, z: -11.5, angle: 0.40, width: 3.0, intensity: 0.70, pool: 2.0 },
    bloom: 0.78, vignette: 1.12,
  },

  /* ── 4. The Kitchens and Cellars ───────────────────────────────────────────
     Long, low, hot. A working aisle with ranges and crates crowding the frame. */
  kitchens: {
    label: 'The Kitchens and Cellars',
    arch: 4, floorPattern: 2,
    room: { w: 22, d: 11, h: 4.4, side: 0.0, ceilPattern: 6, wallPad: 3.6 },
    cam: { y: 1.72, z: 6.2, look: 1.95, fov: 50 },
    deep: '#2a150e', mid: '#5b3320', hi: '#8f5525', accent: '#8fa855',
    rimCol: '#ff9440', shaft: '#ffa855', floorDeep: '#160d09', floorMid: '#3f281a',
    ambient: '#241309', propAlb: '#4a3020', propHi: '#8f5f30',
    gloss: 0.70, grime: 0.88, open: '#d8792e', openGlow: 0.7,
    props: { shapes: [13, 8, 5, 1, 8], count: 22, height: 2.0, layout: 'aisle' },
    particles: { mix: [[PTYPE.EMBER, 0.46], [PTYPE.DUST, 0.40], [PTYPE.PLASTER, 0.14]],
                 tint: '#ffcf9a', wispTint: '#8fd9a8', emberTint: '#ff7a28',
                 speed: 1.2, scale: 1.05, wind: 1.3, density: 0.95 },
    exposure: 2.11, contrast: 1.55,
    key:  { glow: 0, kind: 'warm', x: -3.6, y: 2.8, z: 2.0, color: '#ff9640', intensity: 2.60, radius: 8.0 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 2.2, z: 1.2, color: '#8fd0a8', intensity: 0.94, radius: 7.0, flicker: false },
    lights: [
      { kind: 'warm', x: -4.0, y: 1.40, z: -5.6, color: '#ff8330', intensity: 2.80, radius: 6.4 },
      { kind: 'warm', x: 4.6, y: 2.20, z: -9.2, color: '#ffa844', intensity: 1.85, radius: 6.8 },
      { kind: 'warm', x: 0.4, y: 0.80, z: -2.6, color: '#ffc366', intensity: 1.35, radius: 4.4 },
      { kind: 'cold', x: -6.6, y: 3.20, z: -8.8, color: '#8fd0a8', intensity: 0.70, radius: 7.0 },
    ],
    shafts: { count: 2, spread: 11, y: 5.0, z: -8.0, angle: 0.18, width: 2.4, intensity: 0.50, pool: 1.6 },
    bloom: 1.0, warmTone: 0.14, halation: 0.75, saturate: 1.30,
  },

  /* ── 5. The Impossible Greenhouse ──────────────────────────────────────────
     Enormous, glazed, stepped planting terraces climbing away from the camera. */
  greenhouse: {
    label: 'The Impossible Greenhouse',
    arch: 1, floorPattern: 2,
    room: { w: 30, d: 26, h: 10.5, side: 0.10, ceilPattern: 5, wallPad: 5.0 },
    cam: { y: 2.75, z: 11.2, look: 3.4, fov: 39 },
    deep: '#11261a', mid: '#245234', hi: '#3f8355', accent: '#63d8a0',
    rimCol: '#b8ffa8', shaft: '#b6f2d6', floorDeep: '#0d1b12', floorMid: '#22422a',
    ambient: '#14301f', propAlb: '#2e5236', propHi: '#61a069',
    gloss: 0.55, grime: 0.50, open: '#6fe8b8', openGlow: 0.78, coolFill: 1.2,
    props: { shapes: [2, 9, 2, 19, 6], count: 30, height: 2.6, layout: 'terrace' },
    particles: { mix: [[PTYPE.SPORE, 0.52], [PTYPE.DUST, 0.30], [PTYPE.WISP, 0.18]],
                 tint: '#d9ffcf', wispTint: '#7fffc9', emberTint: '#cfff6a',
                 speed: 0.85, scale: 1.35, wind: 0.7, density: 0.95 },
    exposure: 1.71, contrast: 1.62,
    key:  { glow: 0, kind: 'warm', x: -4.4, y: 3.8, z: 2.8, color: '#ffc98a', intensity: 2.20, radius: 9.5 },
    fill: { glow: 0, kind: 'cold', x: 6.0, y: 3.0, z: 1.6, color: '#6fdcf2', intensity: 1.50, radius: 9.5, flicker: false },
    lights: [
      { kind: 'cold', x: -6.0, y: 6.40, z: -14.0, color: '#8ff0cc', intensity: 1.60, radius: 11.0 },
      { kind: 'cold', x: 7.4, y: 5.60, z: -13.0, color: '#6fdcf2', intensity: 1.20, radius: 9.5 },
      { kind: 'warm', x: -2.8, y: 1.20, z: -4.8, color: '#ffc25c', intensity: 2.90, radius: 6.6 },
      { kind: 'cold', x: 3.2, y: 1.50, z: -8.0, color: '#b0ff8a', intensity: 0.80, radius: 6.0 },
    ],
    shafts: { count: 4, spread: 22, y: 11.4, z: -13, angle: 0.30, width: 3.4, intensity: 0.72, pool: 1.7 },
    bloom: 0.92,
  },

  /* ── 6. The Mansion Graveyard ──────────────────────────────────────────────
     Open air. No ceiling, no side walls; a night sky with a moon and a distant
     roofline, and five staggered ranks of headstones marching to the horizon. */
  graveyard: {
    label: 'The Mansion Graveyard',
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 52, d: 32, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 3.10, z: 12.0, look: 3.1, fov: 41 },
    deep: '#121b26', mid: '#2b3947', hi: '#4a5c6c', accent: '#7fb0d4',
    shaft: '#d6e8f7', floorDeep: '#0d1114', floorMid: '#242c2b', ambient: '#141d28',
    propAlb: '#48504f', propHi: '#8b938c', rimCol: '#dff0ff',
    gloss: 0.28, grime: 0.85, coolFill: 1.15, wallFog: 0.20, open: '#9fd0f0', openGlow: 0.30,
    props: { shapes: [3, 3, 9, 15, 3], count: 34, height: 1.5, layout: 'rows' },
    particles: { mix: [[PTYPE.ASH, 0.40], [PTYPE.DUST, 0.34], [PTYPE.WISP, 0.26]],
                 tint: '#cfd9e0', wispTint: '#8fe8d0', emberTint: '#ffb64a',
                 speed: 0.65, scale: 1.2, wind: 0.9, density: 0.9 },
    exposure: 1.90, contrast: 1.65,
    key:  { glow: 0, kind: 'cold', x: -4.6, y: 6.0, z: 3.0, color: '#cfe0ff', intensity: 2.10, radius: 17.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.4, y: 1.6, z: 1.6, color: '#ffb04a', intensity: 1.38, radius: 6.5 },
    lights: [
      { kind: 'cold', x: -3.0, y: 8.00, z: -12.0, color: '#b8d4f0', intensity: 2.00, radius: 16.0, flicker: false },
      { kind: 'warm', x: 2.8, y: 0.90, z: -5.0, color: '#ffb24a', intensity: 2.05, radius: 5.2 },
      { kind: 'cold', x: 7.0, y: 1.20, z: -9.5, color: '#8ff0d0', intensity: 0.95, radius: 6.8 },
    ],
    shafts: { count: 3, spread: 22, y: 12.0, z: -12, angle: 0.16, width: 3.4, intensity: 0.46, pool: 1.5 },
    vignette: 1.08,
  },

  /* ── 7. The Grand Study and Library ────────────────────────────────────────
     Tall walls of shelving lining every edge, a clear reading floor. */
  study: {
    label: 'The Grand Study and Library',
    arch: 0, floorPattern: 0,
    room: { w: 19, d: 17, h: 8.2, side: 0.04, ceilPattern: 3, wallPad: 5.0 },
    cam: { y: 2.20, z: 8.4, look: 2.7, fov: 43 },
    deep: '#24140f', mid: '#4a2e21', hi: '#7a5033', accent: '#5f95b5',
    shaft: '#ffdda6', floorDeep: '#180f0a', floorMid: '#3c2618', ambient: '#20130c',
    propAlb: '#4e3220', propHi: '#916234', rimCol: '#ffc978',
    gloss: 0.58, grime: 0.55, open: '#4f9fba', openGlow: 0.45,
    props: { shapes: [5, 5, 14, 0, 6, 1], count: 26, height: 2.7, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.86], [PTYPE.EMBER, 0.08], [PTYPE.WISP, 0.06]],
                 tint: '#ffe6bc', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.7, scale: 0.95, wind: 0.5, density: 1.0 },
    exposure: 2.74, contrast: 1.67,
    key:  { glow: 0, kind: 'warm', x: -3.8, y: 3.2, z: 2.2, color: '#ffc06a', intensity: 2.35, radius: 8.5 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 3.4, z: 1.2, color: '#6fb4d4', intensity: 1.12, radius: 8.0, flicker: false },
    lights: [
      { kind: 'warm', x: -3.2, y: 1.30, z: -4.6, color: '#ffc25c', intensity: 2.55, radius: 6.2 },
      { kind: 'warm', x: 5.0, y: 2.60, z: -11.5, color: '#ffb044', intensity: 1.60, radius: 7.2 },
      { kind: 'warm', x: -6.4, y: 3.40, z: -12.4, color: '#efa544', intensity: 1.10, radius: 6.8 },
      { kind: 'cold', x: 3.6, y: 5.00, z: -9.6, color: '#6fb4d4', intensity: 0.70, radius: 8.0 },
    ],
    shafts: { count: 2, spread: 10, y: 9.0, z: -11.0, angle: 0.22, width: 2.8, intensity: 0.56, pool: 1.7 },
    warmTone: 0.13, halation: 0.68,
  },

  /* ── 8. The Moonlit Attic and Observatory ──────────────────────────────────
     Steeply raked walls (big side toe-in), the mass of the room hanging overhead. */
  attic: {
    label: 'The Moonlit Attic and Observatory',
    arch: 4, floorPattern: 0,
    room: { w: 24, d: 19, h: 7.2, side: 0.20, ceilPattern: 6, wallPad: 4.4 },
    cam: { y: 1.95, z: 8.6, look: 2.6, fov: 45 },
    deep: '#171532', mid: '#2e2a55', hi: '#494380', accent: '#8f9fe8',
    shaft: '#d8e0ff', rimCol: '#ffd89a', floorDeep: '#0e0c1c', floorMid: '#26243c',
    ambient: '#1a1836', propAlb: '#3b3358', propHi: '#6f6798',
    gloss: 0.36, grime: 0.78, coolFill: 1.20, wallFog: 0.18,
    props: { shapes: [8, 7, 5, 10, 14], count: 26, height: 2.2, layout: 'hang' },
    particles: { mix: [[PTYPE.DUST, 0.62], [PTYPE.WISP, 0.26], [PTYPE.ASH, 0.12]],
                 tint: '#d8dcf5', wispTint: '#b0b8ff', emberTint: '#ffcf7a',
                 speed: 0.6, scale: 1.0, wind: 0.4, density: 0.95 },
    exposure: 2.80, contrast: 1.65,
    key:  { glow: 0, kind: 'warm', x: -4.0, y: 3.2, z: 2.4, color: '#ffc890', intensity: 2.00, radius: 8.5 },
    fill: { glow: 0, kind: 'cold', x: 5.4, y: 2.8, z: 1.4, color: '#9fb0ff', intensity: 1.44, radius: 8.5, flicker: false },
    lights: [
      { kind: 'cold', x: 5.0, y: 5.60, z: -12.0, color: '#b8c4ff', intensity: 2.20, radius: 13.0, flicker: false },
      { kind: 'warm', x: -3.8, y: 1.10, z: -5.0, color: '#ffb24a', intensity: 2.10, radius: 5.4 },
      { kind: 'cold', x: -6.4, y: 3.40, z: -10.0, color: '#8fa8f0', intensity: 0.85, radius: 8.0 },
    ],
    shafts: { count: 3, spread: 16, y: 8.0, z: -11.0, angle: 0.40, width: 2.8, intensity: 0.72, pool: 1.9 },
  },

  /* ── 9. The Lampworks ──────────────────────────────────────────────────────
     A cold industrial hall: two files of lamp standards marching to the back. */
  lampworks: {
    label: 'The Lampworks',
    arch: 4, floorPattern: 2,
    room: { w: 27, d: 23, h: 7.4, side: 0.0, ceilPattern: 8, wallPad: 4.8 },
    cam: { y: 2.40, z: 10.0, look: 2.6, fov: 42 },
    deep: '#141b26', mid: '#2b3c4e', hi: '#436073', accent: '#5fc0f0',
    rimCol: '#a8e4ff', shaft: '#9fdcff', floorDeep: '#0c1116', floorMid: '#1f2c36',
    ambient: '#141d28', propAlb: '#33454f', propHi: '#6a8894',
    gloss: 0.66, grime: 0.80, open: '#5fc8f2', openGlow: 0.7, coolFill: 1.1,
    props: { shapes: [18, 8, 6, 1, 5], count: 28, height: 2.6, layout: 'colonnade' },
    particles: { mix: [[PTYPE.EMBER, 0.42], [PTYPE.WISP, 0.30], [PTYPE.DUST, 0.28]],
                 tint: '#cfe8ff', wispTint: '#6fd9ec', emberTint: '#ff9e3c',
                 speed: 1.1, scale: 1.1, wind: 1.0, density: 1.0 },
    exposure: 2.04, contrast: 1.41,
    key:  { glow: 0, kind: 'warm', x: -4.2, y: 3.2, z: 2.2, color: '#ffa858', intensity: 2.30, radius: 9.0 },
    fill: { glow: 0, kind: 'cold', x: 6.2, y: 3.2, z: 1.4, color: '#7fe0f5', intensity: 1.69, radius: 9.5, flicker: false },
    lights: [
      { kind: 'cold', x: -6.0, y: 4.20, z: -12.0, color: '#5fd0ff', intensity: 2.20, radius: 9.5 },
      { kind: 'warm', x: 4.2, y: 1.50, z: -6.0, color: '#ff9034', intensity: 2.30, radius: 6.2 },
      { kind: 'cold', x: 7.4, y: 4.40, z: -13.0, color: '#7fe0f5', intensity: 1.45, radius: 9.0 },
      { kind: 'warm', x: -2.0, y: 3.60, z: -9.5, color: '#ffc466', intensity: 1.05, radius: 5.8 },
    ],
    shafts: { count: 3, spread: 18, y: 8.2, z: -14.0, angle: 0.12, width: 2.4, intensity: 0.55, pool: 1.6 },
    bloom: 1.05, halation: 0.85,
  },

  /* ── 10. The Ballroom and Velvet Suites ────────────────────────────────────
     The biggest room in the house: 34 m wide, 10.5 m to a plastered rose, a
     colonnade of statuary and a mirror-polished checker floor. */
  ballroom: {
    label: 'The Ballroom and Velvet Suites',
    arch: 0, floorPattern: 1,
    room: { w: 34, d: 26, h: 10.5, side: 0.05, ceilPattern: 7, wallPad: 5.4 },
    cam: { y: 2.65, z: 11.0, look: 3.3, fov: 40 },
    deep: '#2a1220', mid: '#5c2334', hi: '#94414b', accent: '#b077c4',
    rimCol: '#ffd97a', shaft: '#ffe8b4', floorDeep: '#160a16', floorMid: '#452a38',
    ambient: '#26101c', propAlb: '#5e3040', propHi: '#a8697a',
    gloss: 0.86, grime: 0.38, open: '#d8688c', openGlow: 0.6,
    props: { shapes: [15, 4, 7, 6, 0], count: 30, height: 2.9, layout: 'colonnade' },
    particles: { mix: [[PTYPE.DUST, 0.58], [PTYPE.EMBER, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#ffe8c0', wispTint: '#d8a8ff', emberTint: '#ffc95a',
                 speed: 0.9, scale: 1.1, wind: 0.8, density: 1.0 },
    exposure: 2.17, contrast: 1.61,
    key:  { glow: 0, kind: 'warm', x: -5.2, y: 4.0, z: 2.8, color: '#ffd07a', intensity: 2.55, radius: 11.0 },
    fill: { glow: 0, kind: 'cold', x: 7.2, y: 3.0, z: 1.6, color: '#b47fe8', intensity: 1.38, radius: 10.0, flicker: false },
    lights: [
      { kind: 'warm', x: -6.5, y: 5.40, z: -11.0, color: '#ffcf66', intensity: 2.60, radius: 10.0 },
      { kind: 'warm', x: 6.5, y: 5.40, z: -11.5, color: '#ffbe52', intensity: 2.30, radius: 10.0 },
      { kind: 'warm', x: 0.0, y: 6.20, z: -15.0, color: '#ffdd94', intensity: 1.70, radius: 11.0 },
      { kind: 'cold', x: -10.0, y: 2.00, z: -7.5, color: '#b47fe8', intensity: 0.85, radius: 8.0 },
    ],
    shafts: { count: 4, spread: 26, y: 11.4, z: -14.0, angle: 0.22, width: 3.6, intensity: 0.60, pool: 1.7 },
    bloom: 1.10, warmTone: 0.14, halation: 0.85, vignette: 0.92, saturate: 1.28,
  },

  /* ── 11. The Crypt and Ossuary ─────────────────────────────────────────────
     Narrow and DEEP — 14 m across, 25 m back, a 4.9 m barrel vault. Sarcophagi
     line the two long walls and the eye is pulled straight down the axis. */
  crypt: {
    label: 'The Crypt and Ossuary',
    arch: 2, floorPattern: 2,
    room: { w: 14, d: 25, h: 4.9, side: 0.0, ceilPattern: 4, wallPad: 3.4 },
    cam: { y: 1.90, z: 8.0, look: 2.0, fov: 46 },
    deep: '#141b1d', mid: '#2b3a3a', hi: '#4a5c53', accent: '#5fd0cc',
    rimCol: '#eefaf2', shaft: '#b8f5e6', floorDeep: '#0b1011', floorMid: '#1e2828',
    ambient: '#131c1d', propAlb: '#3f4b46', propHi: '#7d8c81',
    gloss: 0.42, grime: 0.88, coolFill: 1.25, wallFog: 0.26,
    props: { shapes: [16, 3, 6, 16, 15], count: 26, height: 1.8, layout: 'perimeter' },
    particles: { mix: [[PTYPE.DUST, 0.48], [PTYPE.WISP, 0.36], [PTYPE.ASH, 0.16]],
                 tint: '#cfe0dc', wispTint: '#5fe8d8', emberTint: '#ffb64a',
                 speed: 0.6, scale: 1.15, wind: 0.4, density: 0.85 },
    exposure: 2.79, contrast: 1.69,
    key:  { glow: 0, kind: 'warm', x: -3.0, y: 2.8, z: 2.0, color: '#ffb45c', intensity: 2.30, radius: 8.0 },
    fill: { glow: 0, kind: 'cold', x: 3.6, y: 2.4, z: 1.2, color: '#5fe8d8', intensity: 1.25, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -2.4, y: 1.10, z: -4.4, color: '#ffb04a', intensity: 3.00, radius: 6.4 },
      { kind: 'cold', x: 4.2, y: 2.20, z: -12.0, color: '#5fe8d8', intensity: 1.70, radius: 9.5 },
      { kind: 'cold', x: -4.6, y: 1.80, z: -18.0, color: '#4fcfd4', intensity: 1.25, radius: 9.0 },
    ],
    shafts: { count: 2, spread: 6, y: 5.6, z: -13.0, angle: 0.10, width: 2.0, intensity: 0.52, pool: 1.9 },
    vignette: 1.16, bloom: 0.90,
  },

  /* ── 12. The Withered Hedge Maze ───────────────────────────────────────────
     Open air, no ceiling, foliage walls. Dense low scrub across the whole floor. */
  hedge: {
    label: 'The Withered Hedge Maze',
    sides: false, arch: 3, floorPattern: 2,
    room: { w: 38, d: 28, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.35, z: 9.2, look: 2.5, fov: 47 },
    deep: '#1e1a0e', mid: '#443d1c', hi: '#6d632e', accent: '#a8a85f',
    rimCol: '#e8d078', shaft: '#ddcf9a', floorDeep: '#100d08', floorMid: '#2f2818',
    ambient: '#1b1810', propAlb: '#3d3a1e', propHi: '#77714a',
    gloss: 0.28, grime: 0.95, coolFill: 0.95, wallFog: 0.22, open: '#c8c07a', openGlow: 0.25,
    props: { shapes: [9, 9, 2, 3, 9], count: 32, height: 2.4, layout: 'clutter' },
    particles: { mix: [[PTYPE.SPORE, 0.44], [PTYPE.ASH, 0.30], [PTYPE.DUST, 0.26]],
                 tint: '#e0d8a8', wispTint: '#b08fd8', emberTint: '#d8a04a',
                 speed: 0.75, scale: 1.3, wind: 1.4, density: 0.95 },
    exposure: 2.55, contrast: 1.21,
    key:  { glow: 0, kind: 'cold', x: -4.2, y: 5.6, z: 3.0, color: '#cfd8f0', intensity: 1.95, radius: 15.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.0, y: 1.6, z: 1.6, color: '#ffb04a', intensity: 1.44, radius: 6.5 },
    lights: [
      { kind: 'cold', x: -3.0, y: 7.60, z: -12.0, color: '#a8c0e0', intensity: 1.70, radius: 14.0, flicker: false },
      { kind: 'warm', x: 3.0, y: 1.00, z: -5.0, color: '#ffb04a', intensity: 2.10, radius: 5.4 },
      { kind: 'cold', x: -6.4, y: 1.20, z: -8.5, color: '#b08fe8', intensity: 0.85, radius: 6.4 },
    ],
    shafts: { count: 4, spread: 24, y: 9.0, z: -11.0, angle: 0.34, width: 2.6, intensity: 0.56, pool: 1.6 },
  },

  /* ── 13. The Secret Passages ───────────────────────────────────────────────
     A 7.5 m corridor with a 3.4 m ceiling. Everything crowds the two walls and
     the frame is almost filled by them. Round 1 rendered this at mean luma 1.8. */
  passages: {
    label: 'The Secret Passages',
    arch: 2, floorPattern: 0,
    room: { w: 7.5, d: 20, h: 3.4, side: 0.0, ceilPattern: 3, wallPad: 2.4 },
    cam: { y: 1.70, z: 6.8, look: 1.75, fov: 52 },
    deep: '#1c1626', mid: '#38293f', hi: '#54405c', accent: '#8f74c8',
    rimCol: '#ffbe58', shaft: '#ffd79a', floorDeep: '#100c14', floorMid: '#241c28',
    ambient: '#1a1424', propAlb: '#3c2f42', propHi: '#6d5a72',
    gloss: 0.45, grime: 0.92, coolFill: 0.75, wallFog: 0.12,
    props: { shapes: [8, 5, 7, 6], count: 18, height: 1.9, layout: 'aisle' },
    particles: { mix: [[PTYPE.DUST, 0.78], [PTYPE.PLASTER, 0.16], [PTYPE.WISP, 0.06]],
                 tint: '#ffe0b8', wispTint: '#a87fd8', emberTint: '#ffb64a',
                 speed: 0.8, scale: 0.9, wind: 0.5, density: 1.0 },
    exposure: 2.07, contrast: 1.28,
    key:  { glow: 0, kind: 'warm', x: -1.9, y: 2.4, z: 1.8, color: '#ffbe6a', intensity: 2.50, radius: 6.5 },
    fill: { glow: 0, kind: 'cold', x: 1.9, y: 1.8, z: 0.8, color: '#8f6fe8', intensity: 1.00, radius: 5.5, flicker: false },
    lights: [
      { kind: 'warm', x: -1.2, y: 1.90, z: -4.2, color: '#ffb857', intensity: 2.70, radius: 4.8 },
      { kind: 'warm', x: 1.4, y: 1.60, z: -10.0, color: '#ff9e3c', intensity: 1.55, radius: 5.0 },
      { kind: 'cold', x: 1.8, y: 1.60, z: -16.5, color: '#8f6fe8', intensity: 1.05, radius: 7.0 },
    ],
    shafts: { count: 2, spread: 4, y: 4.0, z: -11.0, angle: 0.08, width: 1.5, intensity: 0.52, pool: 2.1 },
    vignette: 1.24, bloom: 0.80,
  },

  /* ── 14. The Bathhouse and Rain Wing ───────────────────────────────────────
     Glazed, wet, checker-tiled; the mass sits to one side under falling water. */
  bathhouse: {
    label: 'The Bathhouse and Rain Wing',
    arch: 1, floorPattern: 1,
    room: { w: 21, d: 17, h: 7.0, side: 0.08, ceilPattern: 5, wallPad: 4.4 },
    cam: { y: 2.20, z: 8.8, look: 2.5, fov: 44 },
    nookSide: 1,
    deep: '#0f2229', mid: '#1e4550', hi: '#357380', accent: '#5fd8ee',
    rimCol: '#d8f4ff', shaft: '#b8ecff', floorDeep: '#0a171c', floorMid: '#1a353c',
    ambient: '#102830', propAlb: '#2c4f58', propHi: '#649aa6',
    gloss: 1.05, grime: 0.48, open: '#6fdcf2', openGlow: 0.7, coolFill: 1.25, wallFog: 0.26,
    props: { shapes: [17, 6, 7, 17, 2], count: 22, height: 2.3, layout: 'nook' },
    particles: { mix: [[PTYPE.RAIN, 0.58], [PTYPE.DUST, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#bfe8f5', wispTint: '#6fd9ec', emberTint: '#ffb64a',
                 speed: 1.0, scale: 1.0, wind: 1.2, density: 1.0 },
    exposure: 1.33, contrast: 1.69,
    key:  { glow: 0, kind: 'warm', x: -3.8, y: 3.2, z: 2.2, color: '#ffc98c', intensity: 2.00, radius: 8.5 },
    fill: { glow: 0, kind: 'cold', x: 5.8, y: 3.0, z: 1.4, color: '#8fe8ff', intensity: 1.71, radius: 9.0, flicker: false },
    lights: [
      { kind: 'cold', x: -5.0, y: 4.40, z: -12.0, color: '#6fdcf2', intensity: 2.20, radius: 11.0 },
      { kind: 'warm', x: 3.6, y: 1.20, z: -5.4, color: '#ffc06a', intensity: 1.85, radius: 5.2 },
      { kind: 'cold', x: 6.6, y: 3.20, z: -9.6, color: '#8fe8ff', intensity: 1.25, radius: 8.0 },
    ],
    shafts: { count: 4, spread: 16, y: 7.8, z: -11.0, angle: 0.24, width: 2.6, intensity: 0.70, pool: 1.8 },
    bloom: 0.95,
  },

  /* ── 15. The Kennels and Animal Ward ───────────────────────────────────────
     Wide, very low, ranks of cages across the floor. Lowest eye in the game. */
  kennels: {
    label: 'The Kennels and Animal Ward',
    arch: 0, floorPattern: 2,
    room: { w: 20, d: 11, h: 4.0, side: 0.0, ceilPattern: 6, wallPad: 3.2 },
    cam: { y: 1.58, z: 6.0, look: 1.75, fov: 50 },
    deep: '#241610', mid: '#4a3320', hi: '#7a5730', accent: '#7f9faf',
    rimCol: '#ffcf84', shaft: '#ffdda6', floorDeep: '#130d08', floorMid: '#3a2a18',
    ambient: '#1e1409', propAlb: '#4c3421', propHi: '#8a6338',
    gloss: 0.38, grime: 0.62, open: '#6fbccc', openGlow: 0.5,
    props: { shapes: [19, 8, 0, 5, 9], count: 28, height: 1.6, layout: 'rows' },
    particles: { mix: [[PTYPE.DUST, 0.70], [PTYPE.ASH, 0.20], [PTYPE.EMBER, 0.10]],
                 tint: '#ffdfae', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.95 },
    exposure: 2.12, contrast: 1.54,
    key:  { glow: 0, kind: 'warm', x: -3.4, y: 2.6, z: 2.0, color: '#ffc27a', intensity: 2.25, radius: 7.5 },
    fill: { glow: 0, kind: 'cold', x: 5.0, y: 2.2, z: 1.2, color: '#7fbcd4', intensity: 1.12, radius: 7.5, flicker: false },
    lights: [
      { kind: 'warm', x: -3.6, y: 2.80, z: -8.0, color: '#ffb857', intensity: 2.05, radius: 7.5 },
      { kind: 'warm', x: 3.2, y: 1.10, z: -4.6, color: '#ffcf84', intensity: 1.95, radius: 5.4 },
      { kind: 'cold', x: 6.6, y: 2.40, z: -8.6, color: '#7fbcd4', intensity: 0.95, radius: 7.0 },
    ],
    shafts: { count: 3, spread: 13, y: 4.6, z: -7.5, angle: 0.14, width: 2.0, intensity: 0.50, pool: 1.7 },
    warmTone: 0.12,
  },

  /* ── 16. The Moon Courtyard and Pumpkin Grounds ────────────────────────────
     Open air under the moon, a wide field of pumpkins and lamp posts. */
  pumpkin: {
    label: 'The Moon Courtyard and Pumpkin Grounds',
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 48, d: 30, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.80, z: 10.8, look: 2.9, fov: 43 },
    deep: '#111c22', mid: '#28403c', hi: '#436655', accent: '#7fbcd8',
    rimCol: '#ffa44a', shaft: '#d6e8f7', floorDeep: '#0d1414', floorMid: '#243029',
    ambient: '#141f24', propAlb: '#4a3a20', propHi: '#93693a',
    gloss: 0.44, grime: 0.66, coolFill: 1.15, wallFog: 0.18, open: '#9fd0f0', openGlow: 0.34,
    props: { shapes: [9, 2, 3, 18, 9], count: 32, height: 2.0, layout: 'clutter' },
    particles: { mix: [[PTYPE.DUST, 0.40], [PTYPE.SPORE, 0.30], [PTYPE.EMBER, 0.30]],
                 tint: '#cfe0e8', wispTint: '#8fe8c0', emberTint: '#ff8a28',
                 speed: 0.9, scale: 1.25, wind: 1.1, density: 1.0 },
    exposure: 1.69, contrast: 1.52,
    key:  { glow: 0, kind: 'cold', x: -5.0, y: 6.4, z: 3.0, color: '#cfe0ff', intensity: 2.10, radius: 18.0, flicker: false },
    fill: { glow: 0, kind: 'warm', x: 5.2, y: 1.2, z: 1.8, color: '#ff9034', intensity: 1.71, radius: 6.0 },
    lights: [
      { kind: 'cold', x: -5.0, y: 9.00, z: -13.0, color: '#b8d4f0', intensity: 2.20, radius: 18.0, flicker: false },
      { kind: 'warm', x: 2.6, y: 0.80, z: -5.0, color: '#ff9034', intensity: 2.40, radius: 5.8 },
      { kind: 'warm', x: -5.6, y: 0.70, z: -8.5, color: '#ffab44', intensity: 1.45, radius: 5.2 },
      { kind: 'warm', x: 6.6, y: 0.70, z: -11.5, color: '#ffa53c', intensity: 1.10, radius: 4.8 },
    ],
    shafts: { count: 3, spread: 22, y: 12.0, z: -12.0, angle: 0.20, width: 3.6, intensity: 0.52, pool: 1.5 },
    bloom: 0.98,
  },

  /* ── 17. The Heart of the House ────────────────────────────────────────────
     A near-cubic 24 m chamber under a dome, warm gold, a colonnade of statues
     converging on the light in the far wall. */
  heart: {
    label: 'The Heart of the House',
    arch: 0, floorPattern: 0,
    room: { w: 24, d: 24, h: 9.5, side: 0.02, ceilPattern: 4, wallPad: 5.0 },
    cam: { y: 2.45, z: 10.4, look: 3.0, fov: 39 },
    deep: '#2b2014', mid: '#553f26', hi: '#8f6d42', accent: '#e0bb78',
    rimCol: '#fff2d0', shaft: '#fff0d8', floorDeep: '#1a1209', floorMid: '#463523',
    ambient: '#251b0f', propAlb: '#5c452a', propHi: '#a8834f',
    gloss: 0.72, grime: 0.20, open: '#ffe6ae', openGlow: 0.88, coolFill: 0.7, wallFog: 0.10,
    props: { shapes: [15, 6, 4, 0, 5], count: 24, height: 2.6, layout: 'colonnade' },
    particles: { mix: [[PTYPE.DUST, 0.54], [PTYPE.WISP, 0.30], [PTYPE.EMBER, 0.16]],
                 tint: '#fff2d8', wispTint: '#ffd9a8', emberTint: '#ffcf7a',
                 speed: 0.55, scale: 1.15, wind: 0.35, density: 1.0 },
    exposure: 1.11, contrast: 1.67,
    key:  { glow: 0, kind: 'warm', x: -4.4, y: 3.6, z: 2.6, color: '#ffdaa0', intensity: 2.35, radius: 10.0 },
    fill: { glow: 0, kind: 'cold', x: 5.6, y: 2.6, z: 1.4, color: '#8fd9ec', intensity: 1.06, radius: 8.5, flicker: false },
    lights: [
      { kind: 'warm', x: 0.0, y: 4.20, z: -15.0, color: '#ffe6ae', intensity: 2.30, radius: 12.0, flicker: false },
      { kind: 'warm', x: -5.6, y: 2.20, z: -8.0, color: '#ffd694', intensity: 1.55, radius: 7.5 },
      { kind: 'warm', x: 5.6, y: 2.20, z: -8.0, color: '#ffd694', intensity: 1.55, radius: 7.5 },
      { kind: 'cold', x: 0.0, y: 1.00, z: -3.2, color: '#8fd9ec', intensity: 0.60, radius: 5.4 },
    ],
    shafts: { count: 3, spread: 14, y: 10.0, z: -12.0, angle: 0.18, width: 4.0, intensity: 0.78, pool: 1.8 },
    bloom: 0.82, warmTone: 0.15, halation: 0.58, vignette: 0.92, grain: 0.020,
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
    sides: false, arch: 5, floorPattern: 2,
    room: { w: 56, d: 34, h: 0, side: 0, ceilPattern: 0, wallPad: 0 },
    cam: { y: 2.6, z: 12.5, look: 3.6, fov: 44 },
    deep: '#0f1424', mid: '#242c48', hi: '#3d4770', accent: '#7f9fd8',
    rimCol: '#ffc46a', shaft: '#c8d8f7', floorDeep: '#0b0e14', floorMid: '#1e2430',
    ambient: '#151b2c', propAlb: '#2c3346', propHi: '#5c6580',
    gloss: 0.34, grime: 0.72, coolFill: 1.10, wallFog: 0.22, open: '#ffc46a', openGlow: 0.85,
    props: { shapes: [9, 3, 2, 18, 9], count: 26, height: 2.1, layout: 'rows' },
    particles: { mix: [[PTYPE.DUST, 0.62], [PTYPE.WISP, 0.22], [PTYPE.EMBER, 0.16]],
                 tint: '#d8e4ff', wispTint: '#8fc8ff', emberTint: '#ffb04a',
                 speed: 0.6, scale: 1.1, wind: 0.7, density: 0.8 },
    key:  { glow: 0, kind: 'warm', x: -7.4, y: 1.9, z: 3.2, color: '#ffb04a', intensity: 2.70, radius: 6.0 },
    fill: { glow: 0, kind: 'warm', x: 7.4, y: 1.9, z: 3.2, color: '#ffb04a', intensity: 1.71, radius: 6.0 },
    lights: [
      { kind: 'warm', x: -7.4, y: 1.60, z: -2.0, color: '#ffb04a', intensity: 2.60, radius: 5.0 },
      { kind: 'warm', x: 7.4, y: 1.60, z: -2.0, color: '#ffb04a', intensity: 2.60, radius: 5.0 },
      { kind: 'cold', x: 6.0, y: 10.0, z: -18.0, color: '#b8ccf5', intensity: 1.80, radius: 20.0, flicker: false },
    ],
    shafts: { count: 2, spread: 18, y: 12.0, z: -14.0, angle: 0.22, width: 3.4, intensity: 0.40, pool: 1.4 },
    bloom: 0.90, warmTone: 0.12, halation: 0.62, vignette: 1.05,
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
    this.flare = this.rig.add({ kind: 'warm', pos: new THREE.Vector3(0, 2, -4), color: 0xffd75e, intensity: 0, radius: 6, flicker: false });
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

  /** Swap region look. Cross-fades colour/light over ~0.7 s unless instant. */
  setMood(name, opts = {}) {
    if (!this.backdrop) return this;
    const pal = resolve(name);
    this.mood = pal.regionKey;
    this.target = pal;
    this._seed = 1;
    for (let i = 0; i < pal.regionKey.length; i++) this._seed = (this._seed * 31 + pal.regionKey.charCodeAt(i)) % 100003;

    this.backdrop.build(pal, () => this._rand());
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
   * Hit feedback. `pos` may be a THREE.Vector3 (world) or {x, y} in CSS pixels.
   * opts: { strength 0..2, color, shake, burst }
   */
  impact(pos, opts = {}) {
    if (!this.ready) return this;
    const strength = opts.strength ?? 1;
    const colorHex = typeof opts.color === 'string'
      ? new THREE.Color(opts.color).getHex()
      : (opts.color ?? 0xffd75e);

    const w = this._toWorld(pos, this._v3);
    // particles
    if (opts.burst !== false) {
      this.particles.burst(w.x, w.y, w.z, colorHex, 1.1 + strength * 1.3, 0.62);
    }
    // a real light flash at the hit point
    this.flare.setPos(w.x, w.y, w.z);
    this.flare.color.set(colorHex);
    this.flare.point.color.set(colorHex);
    this.flare.base = 2.2 * strength;
    this._flareDecay = 1;
    // screen-space ring + shake
    this._v3b.copy(w).project(this.ctx.stage.camera);
    this.ctx.stage.ripple(this._v3b.x * 0.5 + 0.5, this._v3b.y * 0.5 + 0.5, Math.min(strength, 1.6));
    if (opts.shake !== false) this.ctx.stage.shake(0.07 + 0.10 * strength, 10);
    if (strength >= 0.8) this.ctx.stage.flash(colorHex, 0.05 * Math.min(strength, 2), 0.14);
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
    for (const L of [pal.key, pal.fill].concat(pal.lights)) {
      this.rig.add({
        kind: L.kind, color: L.color, intensity: L.intensity, radius: L.radius,
        flicker: L.flicker !== false,
        pos: this._v3b.set(L.x, L.y, L.z),
      });
    }
    this.flare = this.rig.add({ kind: 'warm', pos: this._v3b.set(0, 2, -4), color: 0xffd75e, intensity: 0, radius: 6, flicker: false });
    this._flareDecay = 0;
    // ambient bounce keyed to the region's own bounce colour so nothing is dead
    // black — but low enough that the pools still read as pools
    this.rig.setAmbient(pal._ambient.getHex(), 0.85, pal._accent.getHex(), pal._deep.getHex(), 0.55);
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
